// Test: co z uložených odešlo z nabídky, je vidět.
//
// Spuštění: node scripts/test-zmizele.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// PROČ VZNIKL. Majitel 2. 11.: „pokud má člověk u pozemku poznámku nebo
// oblíbené a někdo ho prodal, mělo by být vidět historie smazaných."
// Uložený pozemek, který z nabídky odešel, z „Uložených" prostě vypadl.
// Dvě úplně jiné věci — „smazal jsem si ho sám" a „prodal se" —
// vypadaly stejně.
//
// Co se tu hlídá a proč zrovna tohle:
//  • SEZNAM SE OPRAVDU VYROBÍ a vede na stránky, které existují.
//    Odkaz na smazanou stránku by byla 404 místo odpovědi.
//  • KLÍČ SE SKLÁDÁ STEJNĚ JAKO V PROHLÍŽEČI. Tohle je ta tichá
//    porucha, kterou by nikdo nenašel: sestavení skládá klíč jako
//    `pkey + "#v" + výměra`, prohlížeč přes PKKlic.klicPozemku. Kdyby
//    se ty dva zápisy rozešly, seznam by nenašel ANI JEDEN uložený
//    pozemek — a vypadalo by to, že člověku nic neodešlo.
//  • NESTAHUJE SE TOMU, KOMU NENÍ K ČEMU. 63 kB (15,5 kB po gzipu)
//    nemá co dělat u člověka, který si nic neuložil.
//  • ULOŽENÉ I POZNÁMKA. Obě cesty, protože majitel mluvil o obou.
//  • A NEHLÁSÍ CIZÍ NABÍDKU. Hrubé porovnání jen podle pkey by uložený
//    pozemek spárovalo s jinou nabídkou téhož pkey a jiné výměry —
//    v datech je 26 takových pkey a leží pod nimi 59 nabídek. Člověk by
//    se dozvěděl, že mu odešlo něco, co v nabídce pořád je.
/* SERVISNÍ PRACOVNÍK VYPNUTÝ: sw.js volá `skipWaiting()` i `clients.claim()`.
   (Viz CLAUDE.md.) */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Zmizelé z uložených', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nCo z uložených odešlo z nabídky');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Zmizelé z uložených: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* ---- 1) DATA ZE SESTAVENÍ ----------------------------------------- */
const cesta = path.join(KOREN, 'data', 'zmizele.json');
pravda('sestavení vyrobilo seznam zmizelých', existsSync(cesta), 'data/zmizele.json není');
if (!existsSync(cesta)) hotovo();
let Z = null;
try { Z = JSON.parse(readFileSync(cesta, 'utf8')); } catch (e) { Z = null; }
pravda('a dá se přečíst', !!(Z && Array.isArray(Z.zmizele)), 'JSON se nerozparsoval');
if (!Z || !Array.isArray(Z.zmizele)) hotovo();

const sVymerou = Z.zmizele.filter((x) => x.vymera > 0);
pravda('a něco v něm je (kontrola měřidla)', Z.zmizele.length > 0, 'seznam je prázdný');
pravda('a většina záznamů zná výměru',
  sVymerou.length >= Z.zmizele.length * 0.9,
  `s výměrou ${sVymerou.length} z ${Z.zmizele.length}`);
pravda('a každý má klíč, datum i soubor',
  Z.zmizele.every((x) => x.klic && /^\d{4}-\d{2}-\d{2}$/.test(x.kdy || '') && x.soubor),
  JSON.stringify(Z.zmizele.find((x) => !(x.klic && x.kdy && x.soubor)) || {}));
/* Odkaz na smazanou stránku by byla 404 místo odpovědi. */
const chybi = Z.zmizele.filter((x) => !existsSync(path.join(KOREN, x.soubor))).map((x) => x.soubor);
pravda('a stránka u každé zmizelé nabídky doopravdy existuje',
  chybi.length === 0, `chybí ${chybi.length}: ${chybi.slice(0, 3).join(', ')}`);
pravda('a historie přiznává, jak je dlouhá', Z.dni > 0, `dni: ${JSON.stringify(Z.dni)}`);

if (!sVymerou.length) { console.log('\n(žádná zmizelá nabídka nezná výměru — zbytek se měřit nedá)'); hotovo(); }
const A = sVymerou[0], B = sVymerou[1] || sVymerou[0];
/* Klíč s TOUŽ pkey, ale jinou výměrou — na tomhle se pozná, jestli se
   porovnání nechytá cizí nabídky. */
const CIZI = A.klic.split('#v')[0] + '#v' + (A.vymera + 1);

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
async function vUlozenych(nastav) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  if (nastav) await ctx.addInitScript((n) => {
    Object.keys(n).forEach((k) => { try { localStorage.setItem(k, n[k]); } catch (e) {} });
  }, nastav);
  const p = await ctx.newPage();
  const stazeno = [], chybyJs = [];
  p.on('request', (r) => { if (/zmizele\.json/.test(r.url())) stazeno.push(1); });
  p.on('pageerror', (e) => chybyJs.push(String(e).slice(0, 120)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForSelector('#map-fav', { timeout: 15000 });
  const { naSeznam } = await import('./zkouska-pohled.mjs');
  await naSeznam(p);
  await p.waitForTimeout(500);
  await p.click('#map-fav');
  /* Čeká se na obsah, ne na čas: seznam se dotahuje po síti. Když
     nepřijde, čekání vyprší a změří se prázdno — což je u dvou stavů
     ten správný výsledek. */
  await p.waitForFunction(() => {
    const b = document.getElementById('odesly');
    return !!(b && !b.hidden && b.querySelector('.odesly-i'));
  }, null, { timeout: 6000 }).catch(() => {});
  const m = await p.evaluate(() => {
    const b = document.getElementById('odesly');
    const a1 = b ? b.querySelector('.odesly-i a') : null;
    return {
      schovano: b ? !!b.hidden : null,
      radku: b ? b.querySelectorAll('.odesly-i').length : 0,
      nadpis: b ? ((b.querySelector('.odesly-h') || {}).textContent || '').trim() : '',
      pozn: b ? ((b.querySelector('.odesly-pozn') || {}).textContent || '').trim() : '',
      odkaz: a1 ? a1.getAttribute('href') : '',
      terc: a1 ? Math.round(a1.getBoundingClientRect().height) : 0,
      datum: b ? ((b.querySelector('.odesly-d') || {}).textContent || '').trim() : '',
    };
  });
  await ctx.close();
  return { stazeno: stazeno.length, chybyJs, ...m };
}

/* ---- 2) KDO SI NIC NEULOŽIL -------------------------------------- */
{
  const r = await vUlozenych(null);
  pravda('kdo si nic neuložil, nevidí nic', r.schovano === true,
    `schováno: ${r.schovano}, řádků: ${r.radku}`);
  pravda('a seznam se mu ani nestahuje', r.stazeno === 0, `stažení: ${r.stazeno}`);
  pravda('a stránka přitom nespadne', r.chybyJs.length === 0, r.chybyJs[0]);
}

/* ---- 3) DVĚ ZMIZELÉ V ULOŽENÝCH ---------------------------------- */
{
  const r = await vUlozenych({ pk_fav_v1: JSON.stringify([A.klic, B.klic]) });
  pravda('kdo měl uložené zmizelé, uvidí je', r.schovano === false && r.radku >= 1,
    `schováno: ${r.schovano}, řádků: ${r.radku}`);
  pravda('a nadpis řekne, kolik jich je', /\d/.test(r.nadpis), `nadpis: „${r.nadpis}"`);
  pravda('a u každé stojí den, kdy odešla', /\d+\.\s*\d+\.\s*\d{4}/.test(r.datum),
    `datum: „${r.datum}"`);
  pravda('a vede to na stránku té nabídky',
    r.odkaz === A.soubor || r.odkaz === B.soubor, `odkaz: „${r.odkaz}"`);
  pravda('a dá se na řádek trefit prstem (44 px)', r.terc >= 44, `${r.terc} px`);
  /* Přiznání, ne drobné písmo: historie nemůže být delší než jak dlouho
     stránky zůstávají. */
  pravda('a přiznává se, že dál historie nejde', /dn[íi]/.test(r.pozn) && /\d/.test(r.pozn),
    `poznámka: „${r.pozn}"`);
  pravda('a stránka přitom nespadne', r.chybyJs.length === 0, r.chybyJs[0]);
}

/* ---- 4) JEN POZNÁMKA, BEZ ULOŽENÍ -------------------------------- */
{
  const pozn = {};
  pozn[A.klic] = { text: 'volal majitel, ozve se', kdy: Date.now() };
  const r = await vUlozenych({ pk_poznamky_v1: JSON.stringify(pozn),
    /* Pohled „Uložené" musí mít co ukázat, jinak výpis zhasne a hlášku
       by nebylo kde vykreslit; uloží se tedy JINÝ, živý pozemek. */
    pk_fav_v1: JSON.stringify(['x|x|x|0.000|0.000#v1']) });
  pravda('stačí poznámka — uložení není podmínka',
    r.schovano === false && r.radku === 1, `schováno: ${r.schovano}, řádků: ${r.radku}`);
  pravda('a stránka přitom nespadne', r.chybyJs.length === 0, r.chybyJs[0]);
}

/* ---- 5) CIZÍ NABÍDKA SE NEHLÁSÍ ---------------------------------- */
{
  const r = await vUlozenych({ pk_fav_v1: JSON.stringify([CIZI]) });
  pravda('pozemek s touž pkey a jinou výměrou se za zmizelý nevydává',
    r.radku === 0, `řádků: ${r.radku} (klíč ${CIZI})`);
  pravda('a stránka přitom nespadne', r.chybyJs.length === 0, r.chybyJs[0]);
}

/* ---- 6) KLÍČ SE SKLÁDÁ STEJNĚ JAKO V PROHLÍŽEČI ------------------ */
{
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!(window.PKKlic && window.PKKlic.klicPozemku),
    null, { timeout: 15000 });
  /* Recept sestavení: pkey + „#v" + zaokrouhlená výměra. Ověřuje se na
     opravdových nabídkách, ne na vymyšleném objektu. */
  const r = await p.evaluate(() => {
    return fetch('data/opportunities.json').then((x) => x.json()).then((j) => {
      const vzorek = (j.opportunities || []).filter((d) => d && d.area > 0).slice(0, 200);
      const spatne = vzorek.filter((d) =>
        window.PKKlic.klicPozemku(d) !== window.PKKlic.pkey(d) + '#v' + Math.round(d.area));
      return { kolik: vzorek.length, spatne: spatne.length,
        ukazka: vzorek.length ? window.PKKlic.klicPozemku(vzorek[0]) : '' };
    });
  });
  pravda('je na čem měřit — vzorek živých nabídek (kontrola měřidla)',
    r.kolik >= 50, `vzorek: ${r.kolik}`);
  pravda('prohlížeč skládá klíč týmž receptem jako sestavení',
    r.spatne === 0, `rozešlo se u ${r.spatne} z ${r.kolik}`);
  /* A naopak: tvar, který píše sestavení, musí tomu receptu odpovídat. */
  pravda('a klíč ze seznamu zmizelých má týž tvar',
    /#v\d+$/.test(A.klic), `ze seznamu: „${A.klic}", z prohlížeče: „${r.ukazka}"`);
  await ctx.close();
}

await prohlizec.close();
hotovo();
