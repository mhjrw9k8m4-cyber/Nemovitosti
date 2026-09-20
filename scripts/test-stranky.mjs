// Funkční kontrola všech stránek webu.
//
// Spuštění: node scripts/test-stranky.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Dvě věci, které se jinak poznají až od návštěvníka:
//   1) MRTVÝ ODKAZ — kontroluje se staticky ve VŠECH souborech .html, tedy
//      i na osmdesáti krajských a okresních stránkách, které nikdo ručně
//      neprochází. Stačí přejmenovat soubor a odkaz spadne na 404.
//   2) CHYBA SKRIPTU — stránka se tváří, že je v pořádku, ale kus ovládání
//      nefunguje. Projde se proto vzorek stránek v opravdovém prohlížeči
//      a hlídá se, jestli něco spadne nebo se nenačte.
import { chromium } from 'playwright-core';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
let chyb = 0;
const zpravy = [];
function chyba(txt) { chyb++; zpravy.push('  ✕ ' + txt); }

/* ---------- 1. mrtvé odkazy ve všech .html ---------- */
const soubory = readdirSync('.').filter((f) => f.endsWith('.html'));
let odkazu = 0;
const chybi = new Map();
for (const f of soubory) {
  const html = readFileSync(f, 'utf8');
  for (const m of html.matchAll(/href="([^"#?:]+\.html)(?:[#?][^"]*)?"/g)) {
    const cil = m[1];
    if (cil.startsWith('http') || cil.startsWith('//')) continue;
    odkazu++;
    if (!existsSync(path.join('.', cil))) {
      if (!chybi.has(cil)) chybi.set(cil, new Set());
      chybi.get(cil).add(f);
    }
  }
}
for (const [cil, kde] of chybi) chyba(`odkaz na „${cil}" nikam nevede — je na: ${[...kde].slice(0, 4).join(', ')}`);
zpravy.push(`  · prošlo se ${odkazu} odkazů ve ${soubory.length} souborech`);

/* ---------- 2. stránky v prohlížeči ---------- */
// Vzorek: od každého druhu stránky jedna (všech 108 by běželo zbytečně dlouho).
const VZOREK = ['index.html', 'pozemek.html', 'pridat.html', 'hlidani.html', 'zpravy.html',
  'upozorneni.html', 'muj-inzerat.html', 'kontakt.html', 'cena-pozemku.html',
  'podminky.html', 'ochrana-udaju.html', 'pozemky-podle-okresu.html',
  'pozemky-stredocesky-kraj.html', 'pozemky-okres-kolin.html', '404.html']
  .filter((f) => existsSync(f));

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

for (const s of VZOREK) {
  const ctx = await prohlizec.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    await ctx.route(`${BASE}/${s}`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  const padlo = [];
  const nenacetlo = [];
  p.on('pageerror', (e) => padlo.push(String((e && e.message) || e).slice(0, 160)));
  p.on('response', (r) => {
    const u = new URL(r.url());
    // Zajímají jen NAŠE soubory; cizí (písma, dlaždice) sem netahám.
    if (u.hostname !== '127.0.0.1') return;
    // Falešná Supabase v testu odpovídá na dotazy do databáze po svém —
    // hlídáme jen SOUBORY webu, ne odpovědi rozhraní.
    if (/^\/(rest|auth|storage)\//.test(u.pathname)) return;
    if (r.status() >= 400) nenacetlo.push(r.status() + ' ' + u.pathname);
  });
  // Stránka pozemku bez parametru ukáže „nenalezeno"; oba stavy musí obstát,
  // proto se zkouší v tom, do kterého se dostane běžný návštěvník.
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1800);

  const hlava = await p.evaluate(() => ({
    titul: (document.title || '').trim(),
    popis: (document.querySelector('meta[name="description"]') || {}).content || '',
    h1: document.querySelectorAll('h1').length,
    lang: document.documentElement.getAttribute('lang') || '',
  }));

  if (padlo.length) chyba(`${s}: skript spadl — ${padlo[0]}`);
  if (nenacetlo.length) chyba(`${s}: nenačetlo se ${[...new Set(nenacetlo)].slice(0, 3).join(', ')}`);
  if (!hlava.titul) chyba(`${s}: chybí titulek stránky`);
  if (!hlava.popis) chyba(`${s}: chybí popis (meta description) — bez něj si Google vymyslí vlastní`);
  if (hlava.h1 !== 1) chyba(`${s}: hlavních nadpisů (h1) je ${hlava.h1}, má být právě jeden`);
  if (hlava.lang !== 'cs') chyba(`${s}: chybí nebo nesedí jazyk stránky (lang="${hlava.lang}")`);
  if (!padlo.length && !nenacetlo.length) zpravy.push(`  ✓ ${s}`);
  await ctx.close();
}

await prohlizec.close();
console.log('\nFunkční kontrola stránek');
console.log(zpravy.join('\n'));
console.log(chyb ? `\n${chyb} chyb` : '\nVšechny stránky se načetly a odkazy vedou tam, kam mají.');
if (chyb) console.log('::error::Funkční kontrola stránek našla chyby.');
process.exit(chyb ? 1 : 0);
