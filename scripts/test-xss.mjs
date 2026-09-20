// Zkouška odolnosti proti vloženému kódu (XSS) v datech o pozemcích.
//
// Spuštění: node scripts/test-xss.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč: data na mapě nesbíráme sami — robot je bere z dražebních rejstříků
// a inzertních webů, na které nemáme žádný vliv. Vypisují se přes innerHTML
// a adresa odkazu jde rovnou do href. Kdyby se do popisu dostalo
// <img onerror="…">, spustilo by se to KAŽDÉMU návštěvníkovi; kdyby se do
// adresy dostalo „javascript:…", spustilo by se to po klepnutí na odkaz.
//
// Test proto podstrčí schválně jedovatá data a ověří, že se z nich na
// stránce nestane kód — ani značka, ani atribut, ani odkaz.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

// Jed. Každé pole zkouší jinou cestu, kterou se kód do stránky dostává.
const JED = {
  updated: '2026-01-01',
  source: 'test',
  opportunities: [{
    place: '<img src=x onerror="window.__prusvih=1">Kolín',
    okres: '"><svg onload="window.__prusvih=2">',
    type: 'sale',
    parcel: '" onmouseover="window.__prusvih=3',
    druh: '<b>tučně</b>',
    area: 1000, price: 500000,
    extra: '</span><script>window.__prusvih=4</script>',
    lat: 50.02, lng: 15.2,
    url: 'javascript:window.__prusvih=5',
  }, {
    place: 'Poctivá obec', okres: 'Kolín', type: 'drazba', parcel: '123/4',
    druh: 'orná půda', area: 2000, price: 300000, lat: 50.05, lng: 15.25,
    extra: 'dražba 1. 6. 2026', url: 'https://example.com/drazba',
  }],
};

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
await ctx.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
  contentType: 'application/json', body: JSON.stringify(JED) }));
await ctx.route('**/data/user-listings.json*', (r) => r.fulfill({ status: 200,
  contentType: 'application/json', body: '[]' }));
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
  await ctx.route(`${BASE}/index.html`, async (r) => {
    const o = await r.fetch();
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
      body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
  });
}

const p = await ctx.newPage();
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
await p.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important}' });
await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await p.waitForTimeout(800);
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(400);

const vysledek = await p.evaluate(() => {
  const zakerne = ['onerror', 'onload', 'onmouseover', 'onclick', 'onfocus'];
  const atributy = [];
  document.querySelectorAll('*').forEach((el) => {
    for (const a of el.attributes) if (zakerne.indexOf(a.name.toLowerCase()) >= 0) atributy.push(el.tagName.toLowerCase() + '[' + a.name + ']');
  });
  const odkazy = [];
  document.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href') || '';
    if (/^\s*(javascript|data|vbscript):/i.test(h)) odkazy.push(h.slice(0, 40));
  });
  return {
    prusvih: typeof window.__prusvih === 'undefined' ? 'nic' : window.__prusvih,
    obrazkyX: document.querySelectorAll('img[src="x"]').length,
    svg: document.querySelectorAll('.opp-list svg[onload], .map-detail svg[onload]').length,
    skripty: [...document.querySelectorAll('script')].filter((s) => /__prusvih/.test(s.textContent || '')).length,
    atributy, odkazy,
    // Text se má vypsat jako text — značky pryč, obsah zůstat.
    vsechnyKarty: [...document.querySelectorAll('.opp-item .opp-place')].map((e) => e.textContent),
  };
});

je('žádný vložený kód se nespustil', vysledek.prusvih, 'nic');
je('nevznikl žádný obrázek z vloženého kódu', vysledek.obrazkyX, 0);
je('nevzniklo žádné svg s obsluhou události', vysledek.svg, 0);
je('do stránky se nedostal žádný <script>', vysledek.skripty, 0);
je('nevznikl žádný atribut obsluhy události', vysledek.atributy, []);
je('žádný odkaz nevede na javascript:', vysledek.odkazy, []);
// Jedovatý název se má objevit jako obyčejný TEXT — značky pryč, obsah zůstat.
// (Pořadí karet určuje řazení, jedovatá nemusí být první.)
je('jedovatý název se vypsal jako text, ne jako značka',
  vysledek.vsechnyKarty.some((t) => t.indexOf('Kolín') >= 0) &&
  vysledek.vsechnyKarty.every((t) => t.indexOf('<') < 0), true);

await prohlizec.close();
console.log('\nOdolnost proti vloženému kódu (XSS)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Data z cizích zdrojů se dostala do stránky jako kód.');
process.exit(chyb ? 1 : 0);
