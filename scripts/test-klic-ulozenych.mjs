/* Test: uložení jednoho pozemku nesmí označit jeho sousedy.
   ==================================================================
   Spuštění: PW_CHROMIUM=… node scripts/test-klic-ulozenych.mjs

   PROČ. Uložené pozemky, poznámky, skryté a „už otevřené" se klíčovaly
   hrubým pkey — místo, parcela, okres a souřadnice na tři desetinná
   místa. Ta hrubost je u uložení ZÁMĚRNÁ (klíč musí přežít zpřesnění
   geokódování, jinak člověk přijde o uložený pozemek), jenže v datech
   sedí 26 klíčů na 59 různých nabídek. V Jirnech je pod jedním klíčem
   PĚT stavebních parcel za 6,6 až 11,2 milionu — a prokázáno
   v prohlížeči: jeden uložený klíč označil všech pět.

   V js/pozemek.js je o tomhle problému komentář ze dvou dřívějších
   kol („310 kolizí → 21"). Tohle je třetí kolo a tohle je ta zkouška,
   která měla být napsaná už tehdy: nestačí spočítat kolize v datech,
   musí se ukázat, že se uložení JEDNÉ nabídky projeví u JEDNÉ.

   CO SE HLÍDÁ:
     A) klíč rozlišuje to, co pkey slepuje, a cena v něm není
     B) starý tvar se pořád čte (nikdo nepřijde o uložené)
     C) v prohlížeči: uložím jeden ze pěti a ve „Uložených" je jeden
     D) a uložení pod STARÝM klíčem pořád najde svůj pozemek
   ================================================================== */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const K = req(path.join(ROOT, 'js', 'klic.js')).PKKlic;
const PKC = req(path.join(ROOT, 'js', 'cisteni.js'));
const PKH = req(path.join(ROOT, 'js', 'hlidani-logika.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- A) + B) klíč sám ---- */
{
  const a = { place: 'Jirny', parcel: '—', okres: 'Praha-východ', lat: 50.1073, lng: 14.7051, area: 616, price: 7700000 };
  const b = Object.assign({}, a, { area: 715, price: 8937500 });
  pravda('pkey ty dva pozemky opravdu slepuje', K.pkey(a) === K.pkey(b));
  pravda('klicPozemku je rozliší', K.klicPozemku(a) !== K.klicPozemku(b));
  /* Cena v klíči být NESMÍ: po zlevnění by se uložený pozemek „odložil". */
  pravda('cena klíč nemění', K.klicPozemku(a) === K.klicPozemku(Object.assign({}, a, { price: 1 })));
  pravda('starý tvar se pořád čte', K.jeMezi([K.pkey(a)], a) === true);
  pravda('nový taky', K.jeMezi([K.klicPozemku(a)], a) === true);
  pravda('a cizí klíč ne', K.jeMezi([K.klicPozemku(b)], a) === false);
  pravda('klicVe vrátí nový tvar, když tam je oba',
    K.klicVe([K.pkey(a), K.klicPozemku(a)], a) === K.klicPozemku(a));
}

/* ---- kolik toho v datech je (a že má ta zkouška co chytat) ---- */
const data = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
const vse = PKH.bezDuplicit(PKC.pozemky((data.opportunities || data).slice()));
function kolize(fn) {
  const m = new Map();
  for (const d of vse) { const k = fn(d); if (!m.has(k)) m.set(k, []); m.get(k).push(d); }
  return [...m].filter(([, v]) => v.length > 1);
}
const kolPkey = kolize((d) => K.pkey(d));
const kolNovy = kolize((d) => K.klicPozemku(d));
pravda(`na pkey kolidovalo ${kolPkey.length} klíčů (${kolPkey.reduce((s, [, v]) => s + v.length, 0)} nabídek)`,
  kolPkey.length > 0, 'kdyby nekolidovaly, nemá tahle zkouška co chytat');
pravda(`na klicPozemku jich zbylo ${kolNovy.length} (${kolNovy.reduce((s, [, v]) => s + v.length, 0)} nabídek)`,
  kolNovy.length < kolPkey.length / 3,
  `z ${kolPkey.length} na ${kolNovy.length} — to je málo muziky`);
/* Ty zbylé se liší JEN cenou. Kdyby se lišily i jinak, byl by to
   nedodělek, ne mez. */
{
  const jinak = kolNovy.filter(([, v]) => new Set(v.map((d) => (d.druh || '') + '|' + Math.round(d.area || 0))).size > 1);
  pravda('a ty zbylé se liší jen cenou (jinak by to byl nedodělek)', jinak.length, 0);
}

/* největší kolizní skupina — na ní se to bude zkoušet v prohlížeči */
const skupina = kolPkey.sort((a, b) => b[1].length - a[1].length)[0];
pravda(`největší skupina má ${skupina[1].length} nabídek pod jedním pkey`, skupina[1].length >= 3,
  'na menší skupině není rozdíl vidět');

const kde = process.env.PW_CHROMIUM || '';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/** Otevře mapu s předem nasazenými uloženými klíči a vrátí, co je ve „Uložených". */
async function sUlozenymi(klice) {
  /* serviceWorkers: 'block' — jinak stránku obsluhuje uložená kopie. */
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 },
    locale: 'cs-CZ', serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  await page.addInitScript((kl) => { localStorage.setItem('pk_fav_v1', JSON.stringify(kl)); }, klice);
  await page.goto('http://127.0.0.1:8310/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const e = document.getElementById('map-count');
    return e && /\d/.test(e.textContent);
  }, { timeout: 20000 });
  await page.evaluate(() => { const e = document.getElementById('map-fav'); if (e) e.click(); });
  await page.waitForTimeout(1200);
  const out = await page.evaluate(() => {
    const k = [...document.querySelectorAll('#opp-list > li')].filter((li) => li.querySelector('.opp-body'));
    return { pocet: k.length, ceny: k.map((x) => (x.innerText.match(/[\d\s ]+Kč/) || [''])[0].trim()) };
  });
  await ctx.close();
  return out;
}

/* ---- C) jeden uložený = jeden ve výpisu ---- */
{
  const jeden = skupina[1][0];
  const r = await sUlozenymi([K.klicPozemku(jeden)]);
  pravda(`uložení jednoho z ${skupina[1].length} dá ve „Uložených" jeden (${r.pocet})`,
    r.pocet === 1, 'ceny: ' + r.ceny.join(' · '));
  pravda('a je to ten správný', r.ceny.length === 1
    && r.ceny[0].replace(/\D/g, '') === String(Math.round(jeden.price)),
    `čekáno ${jeden.price}, ukázalo ${r.ceny[0]}`);

  /* A pro kontrast to, co se dělo předtím: pod hrubým pkey jich bylo
     všech pět. Kdyby tahle kontrola přestala platit, znamená to, že se
     starý tvar přestal čist — a to by lidem smazalo uložené pozemky. */
  const stary = await sUlozenymi([K.pkey(jeden)]);
  pravda(`uložení pod STARÝM klíčem najde svůj pozemek (${stary.pocet})`,
    stary.pocet >= 1, 'nenašlo nic — starý tvar se přestal čist');
  pravda(`a je na něm vidět, proč se klíč měnil (starý označí ${stary.pocet}, nový 1)`,
    stary.pocet > 1, `starý označil jen ${stary.pocet} — kolize možná zmizela z dat`);
}

/* ---- D) dva různé uložené pozemky zůstanou dva ---- */
{
  const dva = [K.klicPozemku(skupina[1][0]), K.klicPozemku(skupina[1][1])];
  const r = await sUlozenymi(dva);
  pravda('dva uložené dají dva', r.pocet === 2, 'ceny: ' + r.ceny.join(' · '));
  const cekane = [skupina[1][0].price, skupina[1][1].price].map((x) => String(Math.round(x))).sort();
  pravda('a jsou to ty dva, co se uložily',
    JSON.stringify(r.ceny.map((c) => c.replace(/\D/g, '')).sort()) === JSON.stringify(cekane),
    'ukázalo ' + r.ceny.join(' · '));
}

/* ---- E) a co se uloží KLEPNUTÍM, musí mít nový tvar ----
   Body výš nasazují klíče do schránky samy, takže by prošly i tehdy,
   kdyby tlačítko na kartě dál zapisovalo starý tvar. Tohle klepne na
   záložku u první karty ve výpisu a podívá se, co ve schránce přibylo. */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 },
    locale: 'cs-CZ', serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8310/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const e = document.getElementById('map-count');
    return e && /\d/.test(e.textContent);
  }, { timeout: 20000 });
  await page.waitForSelector('#opp-list .opp-fav', { timeout: 15000 }).catch(() => {});
  const r = await page.evaluate(async () => {
    const b = document.querySelector('#opp-list .opp-fav');
    if (!b) return { chyba: 'záložka na kartě není' };
    b.click();
    await new Promise((res) => setTimeout(res, 500));
    let kl = [];
    try { kl = JSON.parse(localStorage.getItem('pk_fav_v1')) || []; } catch (e) {}
    return { klice: kl };
  });
  pravda('záložka na kartě existuje', !r.chyba, r.chyba);
  pravda(`klepnutí uloží jeden klíč (${(r.klice || []).length})`, (r.klice || []).length === 1,
    JSON.stringify(r.klice));
  /* Nový tvar má na konci „#v<výměra>". Starý ho nemá — a právě tím se
     pozná, že tlačítko zapisuje nově, ne jen že čtení snese oboje. */
  pravda('a je v NOVÉM tvaru (pkey + výměra)',
    (r.klice || []).length === 1 && /#v\d+$/.test(r.klice[0]),
    'uložilo se: ' + JSON.stringify(r.klice));
  await ctx.close();
}

await prohlizec.close();

console.log('\nKlíč uložených pozemků: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Klíč uložených pozemků: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);
