// Test: mluví web jednou řečí? (kolik různých hodnot se doopravdy kreslí)
//
// Spuštění: node scripts/test-jazyk.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// „Připadá mi to přeplácané, málo čisté, divné přechody a rozestupy."
// Dá se to spočítat. Naměřeno na úvodní stránce před úklidem:
//
//   23 různých velikostí písma   (mezi 9 a 25 px jich bylo 24, včetně
//                                 půlpixelových: 12 · 12,5 · 13 · 13,5 …)
//   14 různých trvání přechodu   (.01 · .08 · .1 · .11 · .12 · .15 · .18
//                                 · .2 · .22 · .25 · .28 · .3 · .35 · .6 s)
//    2 různé náběhy              (klíčové „ease" se míchalo se zdejší křivkou)
//
// Rozdíl mezi 12 a 12,5 px nikdo nepozná a mezi .15 a .18 s taky ne. Ale
// dohromady z toho je pocit, že se každá věc chová trochu jinak — a to je
// přesně ono „slité". Běžná praxe je stupnice o osmi až deseti krocích
// a dva tři časy.
//
// MĚŘÍ SE, CO PROHLÍŽEČ OPRAVDU VYKRESLIL, ne co je napsané v CSS: na
// hodnotu se dá dostat i přes em, %, dědění nebo skriptem.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Meze jsou tam, kde se dnes JE, plus malá rezerva — aby se nedalo omylem
   vrátit k tomu, co bylo. Velká písmena nadpisů (30 px a víc, často
   clamp()) se nepočítají: těch je pár, stojí daleko od sebe a splývat
   nemají jak. */
const MEZ_PISMO = 12;     // různých velikostí pod 30 px na stránku
const MEZ_TRVANI = 3;     // různých trvání přechodu
const MEZ_NABEH = 2;      // náběhů: zdejší křivka + ease-in u mizející hlavičky
/* Odstupy: kladné hodnoty margin/padding/gap do 128 px. Záporné se
   nepočítají — ty si nastavuje Leaflet u svých značek sám a do našeho
   jazyka nepatří. Naměřeno před úklidem: 61 různých hodnot ve zdroji,
   každé celé číslo od 1 do 20. */
const MEZ_MEZERA = 22;

const STRANKY = ['index.html', 'pozemek-tabor-nemysl-16a8tol.html', 'pridat.html', 'pozemky-okres-tabor.html'];

const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

for (const stranka of STRANKY) {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (r.request().resourceType() === 'image') {
      return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
    }
    return LEAFLET ? r.abort() : r.continue();
  });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript',
        body: readFileSync(f) });
    });
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5200);
  const v = await p.evaluate(() => {
    const pismo = new Map(), trvani = new Set(), nabeh = new Set(), mezery = new Set();
    let merenych = 0;
    document.querySelectorAll('body *').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const c = getComputedStyle(e);
      /* Velikost písma se počítá jen tam, kde je opravdu vidět text —
         jinak by se počítaly i obaly, které po rodiči jen dědí. */
      if (e.children.length === 0 && (e.textContent || '').trim()) {
        merenych++;
        const px = parseFloat(c.fontSize);
        if (isFinite(px) && px < 30) pismo.set(px, (pismo.get(px) || 0) + 1);
      }
      ['marginTop','marginRight','marginBottom','marginLeft',
       'paddingTop','paddingRight','paddingBottom','paddingLeft',
       'rowGap','columnGap'].forEach((k) => {
        const px = parseFloat(c[k]);
        /* Jen celé pixely. Necelé číslo tu není návrhová hodnota, ale
           dopočet: „margin:0 auto" u vystředěné karty vyjde třeba
           111,203 px a s jazykem webu nemá co dělat. */
        if (isFinite(px) && px > 0 && px <= 128 && Number.isInteger(px)) mezery.add(px);
      });
      if (c.transitionDuration && c.transitionDuration !== '0s') {
        c.transitionDuration.split(',').forEach((x) => { const t = x.trim(); if (t !== '0s') trvani.add(t); });
        c.transitionTimingFunction.split(/,(?![^(]*\))/).forEach((x) => nabeh.add(x.trim()));
      }
    });
    return { pismo: [...pismo.entries()].sort((a, b) => b[1] - a[1]), trvani: [...trvani], nabeh: [...nabeh],
      mezery: [...mezery].sort((a, b) => a - b), merenych };
  });
  /* Pojistka: bez textu a bez přechodů by všechno vyšlo jako nula a
     kontroly níž by nic neznamenaly. */
  pravda(`${stranka}: je co měřit (${v.merenych} prvků s textem, ${v.trvani.length} trvání)`,
    v.merenych > 30 && v.trvani.length > 0, `prvků ${v.merenych}, trvání ${v.trvani.length}`);
  pravda(`${stranka}: velikostí písma pod 30 px nejvýš ${MEZ_PISMO} (je ${v.pismo.length})`,
    v.pismo.length <= MEZ_PISMO, 'použité: ' + v.pismo.map((x) => x[0] + 'px×' + x[1]).join(' '));
  pravda(`${stranka}: trvání přechodu nejvýš ${MEZ_TRVANI} (je ${v.trvani.length})`,
    v.trvani.length <= MEZ_TRVANI, 'použitá: ' + v.trvani.sort().join(' '));
  pravda(`${stranka}: náběhů nejvýš ${MEZ_NABEH} (je ${v.nabeh.length})`,
    v.nabeh.length <= MEZ_NABEH, 'použité: ' + v.nabeh.join(' | '));
  pravda(`${stranka}: odstupů nejvýš ${MEZ_MEZERA} (je ${v.mezery.length})`,
    v.mezery.length <= MEZ_MEZERA, 'použité: ' + v.mezery.join(' ') + ' px');
  await ctx.close();
}

await prohlizec.close();
console.log('\nJeden vizuální jazyk — kolik různých hodnot se kreslí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Vizuální jazyk: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
