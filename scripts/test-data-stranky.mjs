/* Test: stránka pozemku stahuje dva malé soubory, ne jeden velký.
   ==================================================================
   Spuštění: node scripts/test-data-stranky.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Naměřeno: data/opportunities.json má 639 kB a 56,5 kB přes drát.
   Stránka pozemku z nich potřebovala dvě věci — SEBE a CELOSTÁTNÍ
   CENOVÝ MODEL — a brala si kvůli nim všechno, na všech 1 994
   stránkách. Teď si bere řez svého okresu (sebe) a data/model.json
   (vstup modelu, pro všechny stránky týž, tedy z cache): dohromady
   13,1 kB přes drát a 50 kB surově místo 639 kB.

   Že z menšího vstupu vyjde TOTÉŽ číslo, měří
   scripts/test-model-vstup.mjs na všech nabídkách. Tahle zkouška měří
   to druhé: že se velký soubor opravdu PŘESTAL stahovat a že se verdikt
   pořád vykreslí. Obojí je potřeba — přepnout výpočet a nechat
   v hlavičce <link rel="preload"> na velký soubor znamená, že se stahuje
   dál, jen už ho nikdo nečte. Přesně to se stalo a chytilo se to až
   měřením v prohlížeči.
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nData stránky pozemku');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Data stránky pozemku: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const stranky = fs.readdirSync(KOREN).filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f));
pravda(`stránky pozemků se našly (${stranky.length})`, stranky.length > 1000, `jen ${stranky.length}`);
if (!stranky.length) hotovo();

/* Staticky: každá stránka musí nést cestu ke svému řezu, jinak si
   sáhne po celku. A žádná už nesmí přednačítat celek. */
{
  const bezRezu = [], sCelkem = [];
  for (const f of stranky) {
    const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
    if (!/window\.PK_POZEMEK=\{[^<]*"r":"data\/okres\/[a-z0-9-]+\.json"/.test(h)) bezRezu.push(f);
    if (/<link[^>]+rel="preload"[^>]+data\/opportunities\.json/.test(h)) sCelkem.push(f);
  }
  pravda('každá stránka pozemku ví, ze kterého řezu si má vzít sebe',
    bezRezu.length === 0, `${bezRezu.length} bez toho: ` + bezRezu.slice(0, 3).join(', '));
  pravda('a žádná už nepřednačítá celá data',
    sCelkem.length === 0, `${sCelkem.length}: ` + sCelkem.slice(0, 3).join(', '));
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));

  /* Tři stránky z různých okresů: řez je u každé jiný. */
  const vzorek = [];
  const videneOkresy = new Set();
  for (const f of stranky) {
    const okres = (/^pozemek-([a-z-]+?)-/.exec(f) || [])[1];
    if (!okres || videneOkresy.has(okres)) continue;
    videneOkresy.add(okres); vzorek.push(f);
    if (vzorek.length >= 3) break;
  }
  pravda(`vybraly se stránky ze tří okresů (${vzorek.length})`, vzorek.length === 3, vzorek.join(', '));

  const sCelkem = [], bezModelu = [], bezRezu = [], bezVerdiktu = [], sChybou = [];
  let brotliCelkem = 0, merenych = 0;
  for (const f of vzorek) {
    const p = await ctx.newPage();
    const dat = [], chyby = [];
    p.on('request', (r) => { const u = r.url(); if (/\/data\//.test(u)) dat.push(u.replace(BASE + '/', '').split('?')[0]); });
    p.on('pageerror', (e) => chyby.push(String(e)));
    await p.goto(`${BASE}/${f}`, { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    const verdikt = await p.evaluate(() => {
      const e = document.getElementById('pz-verdict');
      return e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    await p.close();
    merenych++;
    if (dat.includes('data/opportunities.json')) sCelkem.push(f);
    if (!dat.includes('data/model.json')) bezModelu.push(f);
    if (!dat.some((d) => /^data\/okres\//.test(d))) bezRezu.push(f);
    /* Verdikt nemusí vzniknout u každého pozemku (málo srovnání), ale
       musí vzniknout aspoň u jednoho — jinak by „nestahuje se celek"
       mohlo platit i o stránce, která se vůbec nerozběhla. */
    if (!verdikt) bezVerdiktu.push(f);
    if (chyby.length) sChybou.push(`${f}: ${chyby[0]}`);
    for (const d of new Set(dat)) {
      const c = path.join(KOREN, d);
      if (fs.existsSync(c)) brotliCelkem += zlib.brotliCompressSync(fs.readFileSync(c)).length;
    }
  }
  pravda(`změřily se ${merenych} stránky`, merenych === 3, `${merenych}`);
  pravda('žádná z nich nestahuje celá data (639 kB)',
    sCelkem.length === 0, `${sCelkem.length}: ` + sCelkem.join(', '));
  pravda('každá si vezme vstup cenového modelu', bezModelu.length === 0, bezModelu.join(', '));
  pravda('a řez svého okresu', bezRezu.length === 0, bezRezu.join(', '));
  pravda('aspoň na jedné z nich se vykreslil cenový verdikt (jinak se stránka nerozběhla)',
    bezVerdiktu.length < merenych, `bez verdiktu ${bezVerdiktu.length} ze ${merenych}`);
  pravda('a žádná neshodila chybu v konzoli', sChybou.length === 0, sChybou.slice(0, 2).join(' | '));
  const celek = zlib.brotliCompressSync(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'))).length;
  const prumer = brotliCelkem / Math.max(1, merenych);
  pravda(`a přes drát to dělá ${(prumer / 1024).toFixed(1)} kB na stránku místo ${(celek / 1024).toFixed(1)} kB`,
    prumer < celek / 2, `naměřeno ${(prumer / 1024).toFixed(1)} kB, celek ${(celek / 1024).toFixed(1)} kB`);

  /* ŠABLONA S ?p= ŘEZ NEMÁ — nevíme dopředu, o který pozemek jde —
     a musí tedy sáhnout po celku. Bez téhle kontroly by se dalo
     „ušetřit" i tam, kde by pak inzerát od majitele nikdo nenašel. */
  {
    const p = await ctx.newPage();
    const dat = [];
    p.on('request', (r) => { const u = r.url(); if (/\/data\//.test(u)) dat.push(u.replace(BASE + '/', '').split('?')[0]); });
    await p.goto(`${BASE}/pozemek.html?p=${encodeURIComponent('Benešov|—|Benešov|49.792|14.714')}`,
      { waitUntil: 'load' });
    await p.waitForTimeout(3000);
    await p.close();
    pravda('šablona s ?p= (inzerát od majitele) si pořád bere celá data',
      dat.includes('data/opportunities.json'), 'stáhla: ' + [...new Set(dat)].join(', '));
  }
  await ctx.close();
} finally {
  await prohlizec.close();
}
hotovo();
