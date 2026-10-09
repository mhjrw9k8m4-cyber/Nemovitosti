/* Test: klepnutí na kartu otevře TU nabídku, ne její dvojče.
   ==================================================================
   Spuštění: PW_CHROMIUM=… node scripts/test-karta-vede-spravne.mjs

   PROČ. V datech chybí u 86 % nabídek parcelní číslo a souřadnice se
   zaokrouhlují na tři desetinná místa, takže několik RŮZNÝCH pozemků
   má shodný klíč — dnes 26 klíčů na 59 nabídek. Odkaz z výpisu proto
   nese rozlišovače: `v` (výměra) a `c` (cena).

   `v` tam byla, `c` ne. Změřeno v prohlížeči: v Stínavě jsou dva
   lesní pozemky po 7 994 m² za 260 000 a 270 000 Kč, a klepnutí na
   kartu za 270 000 otevřelo stránku s 260 000 — a tlačítko „Inzerát"
   na ní vedlo na inzerát toho DRUHÉHO pozemku. findTarget()
   v js/pozemek.js přitom `c` umí odjakživa, jen mu ho nikdo neposílal.

   Tahle zkouška nepočítá klíče v datech — projde SKUTEČNÉ kolizní
   skupiny a u každé nabídky zvlášť otevře adresu, jakou web vyrábí,
   a porovná cenu i výměru na stránce s tím, na co se klepalo. Kolize
   je přitom vlastnost dat, která se mění: kdyby zmizely, zkouška to
   řekne, místo aby prošla naprázdno.
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
const BASE = 'http://127.0.0.1:8310';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- kolizní skupiny ze skutečných dat ---- */
const data = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
const vse = PKH.bezDuplicit(PKC.pozemky((data.opportunities || data).slice()));
const skupiny = (() => {
  const m = new Map();
  for (const d of vse) { const k = K.pkey(d); if (!m.has(k)) m.set(k, []); m.get(k).push(d); }
  return [...m.values()].filter((v) => v.length > 1);
})();
pravda(`v datech je ${skupiny.length} skupin nabídek se shodným klíčem`, skupiny.length > 0,
  'kolize zmizely — tahle zkouška by měřila naprázdno a musí se přepsat, ne smazat');
/* Ty nejzrádnější jsou skupiny, které se NELIŠÍ výměrou: tam rozhoduje
   jedině cena, a právě na nich chyběl rozlišovač `c`. */
const jenCena = skupiny.filter((v) => new Set(v.map((d) => Math.round(d.area || 0))).size === 1);
pravda(`a ${jenCena.length} z nich se neliší ani výměrou (rozhoduje jedině cena)`,
  jenCena.length > 0, 'bez takové skupiny by se chybějící „c" nepoznalo');

/* Adresa se skládá PŘESNĚ tak, jak ji vyrábí js/main.js (gotoInzerat).
   Kdyby se tu psala po svém, zkouška by prověřovala samu sebe. */
const zdrojMapy = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
pravda('js/main.js posílá do adresy výměru i cenu',
  /&v=' \+ Math\.round\(d\.area\)/.test(zdrojMapy) && /&c=' \+ Math\.round\(d\.price\)/.test(zdrojMapy),
  'gotoInzerat() neposílá „v" a „c" — stránka pak otevře první z dvojice');
const adresa = (d) => `pozemek.html?p=${encodeURIComponent(K.pkey(d))}`
  + `&ll=${d.lat},${d.lng}`
  + (isFinite(d.area) ? `&v=${Math.round(d.area)}` : '')
  + (isFinite(d.price) ? `&c=${Math.round(d.price)}` : '');

const kde = process.env.PW_CHROMIUM || '';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
/* serviceWorkers: 'block' — jinak stránku obsluhuje uložená kopie. */
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, locale: 'cs-CZ', serviceWorkers: 'block' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});

async function otevri(d) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${adresa(d)}`, { waitUntil: 'load' });
  await page.waitForSelector('.pz-price .pv', { timeout: 15000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const cis = (t) => Number(String(t || '').replace(/[^\d]/g, ''));
    let vym = 0;
    for (const e of document.querySelectorAll('.pz-klic')) {
      if (((e.querySelector('span') || {}).textContent || '').trim() !== 'Výměra') continue;
      vym = cis((e.querySelector('b') || {}).textContent); break;
    }
    /* Hlavní tlačítko na zdroj je <a class="pz-btn primary" target="_blank">.
       Nejdřív jsem ho hledal podle textu rovného „Inzerát" — a nenašel
       nic, protože za popiskem je ještě značka „odkaz mimo web". */
    const a = document.querySelector('a.pz-btn.primary[target="_blank"]');
    return { cena: cis((document.querySelector('.pz-price .pv') || {}).textContent), vymera: vym,
      odkaz: a ? a.getAttribute('href') : null, popisek: a ? (a.textContent || '').trim() : null };
  });
  await page.close();
  return r;
}

/* Zkouší se KAŽDÁ nabídka z každé kolizní skupiny — i ta, která by se
   vybrala jako první, protože na té se vada nepozná. */
let zkouseno = 0;
for (const skupina of skupiny.slice(0, 8)) {
  for (const d of skupina) {
    const r = await otevri(d);
    zkouseno++;
    const jm = `${d.place}, ${Math.round(d.area)} m², ${Math.round(d.price)} Kč`;
    pravda(`${jm}: stránka ukazuje tutéž cenu`, r.cena === Math.round(d.price),
      `stránka ukazuje ${r.cena} Kč`);
    pravda(`${jm}: a tutéž výměru`, r.vymera === Math.round(d.area),
      `stránka ukazuje ${r.vymera} m²`);
    /* A to hlavní, co člověk opravdu zmáčkne: odkaz na zdroj. */
    if (d.url) {
      pravda(`${jm}: tlačítko „${r.popisek}" vede na JEHO inzerát`, r.odkaz === d.url,
        `vede na ${String(r.odkaz).slice(-40)}, má na ${String(d.url).slice(-40)}`);
    }
  }
}
pravda(`prošlo se ${zkouseno} nabídek z kolizních skupin`, zkouseno >= 10,
  'zkoušelo se jen ' + zkouseno);

/* ---- A NAKONEC SKUTEČNÉ KLEPNUTÍ ----
   Všechno výš si adresu skládá samo, takže to prověřuje findTarget(),
   ne kartu. Při sabotáži (karta přestane posílat cenu) proto spadla
   jen kontrola čtená ze zdroje js/main.js a chování zůstalo zelené.
   Tohle tedy otevře mapu, vyhledá obec, najde ve výpisu kartu s tou
   cenou, KLEPNE na ni a podívá se, kde skončila. Je to dražší a dělá
   se jen u skupin, které se liší pouze cenou — právě tam vada byla. */
for (const skupina of jenCena.slice(0, 1)) {
  /* Ta dražší z dvojice: na té první v pořadí se vada nepozná. */
  const cil = skupina.slice().sort((a, b) => b.price - a.price)[0];
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const e = document.getElementById('map-count');
    return e && /\d/.test(e.textContent);
  }, { timeout: 25000 }).catch(() => {});
  await page.evaluate((obec) => {
    const i = document.getElementById('map-search');
    if (i) { i.value = obec; i.dispatchEvent(new Event('input', { bubbles: true })); }
  }, cil.place);
  await page.waitForTimeout(1500);
  const nasel = await page.evaluate((cena) => {
    const karty = [...document.querySelectorAll('#opp-list > li')].filter((li) => li.querySelector('.opp-body'));
    const i = karty.findIndex((li) => String(li.innerText).replace(/[\s\u00a0]/g, '').indexOf(cena + 'Kč') >= 0);
    return { i, karet: karty.length };
  }, String(Math.round(cil.price)));
  pravda(`ve výpisu se po vyhledání „${cil.place}" našla karta za ${Math.round(cil.price)} Kč`,
    nasel.i >= 0, `karet ${nasel.karet}, hledaná nenalezena`);
  if (nasel.i >= 0) {
    await page.evaluate((i) => {
      const karty = [...document.querySelectorAll('#opp-list > li')].filter((li) => li.querySelector('.opp-body'));
      karty[i].click();
    }, nasel.i);
    await page.waitForURL(/pozemek/, { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('.pz-price .pv', { timeout: 15000 }).catch(() => {});
    const r = await page.evaluate(() => {
      const a = document.querySelector('a.pz-btn.primary[target="_blank"]');
      return { cena: Number(String((document.querySelector('.pz-price .pv') || {}).textContent || '').replace(/[^\d]/g, '')),
        odkaz: a ? a.getAttribute('href') : null, adresa: location.search };
    });
    pravda(`a KLEPNUTÍ na ni otevřelo stránku s ${Math.round(cil.price)} Kč`,
      r.cena === Math.round(cil.price),
      `otevřelo se ${r.cena} Kč — karta vede na dvojče (adresa: ${r.adresa})`);
    if (cil.url) {
      pravda('a tlačítko na zdroj vede na inzerát té nabídky', r.odkaz === cil.url,
        `vede na ${String(r.odkaz).slice(-40)}`);
    }
  }
  await page.close();
}

await ctx.close();
await prohlizec.close();

console.log('\nKarta vede na svůj pozemek: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Karta vede na svůj pozemek: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);
