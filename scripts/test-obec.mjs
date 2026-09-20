// Test: kategorie „Obecní záměr" opravdu funguje, až data dorazí.
//
// Spuštění: node scripts/test-obec.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč tohle existuje:
//
// Web má pátý druh příležitosti — záměr obce prodat pozemek. Je na něj
// připravená barva, tvar, štítek filtru, strop v robotovi i vlastní rádce.
// Jenže v datech nikdy nebyl ANI JEDEN takový záznam, takže celá ta cesta
// nikdy neproběhla. Až jednou robot první obecní záměr přinese, zjistilo by
// se naostro, že něco po cestě nefunguje.
//
// Test proto podstrčí stránce vlastní data se dvěma obecními záměry
// a projde celou cestu: štítek filtru, legenda, tvar na mapě, filtrování,
// výpis i detail. Reálná data zůstávají nedotčená.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// Podstrčená data: pár běžných prodejů (ať se má s čím srovnávat) a dva
// obecní záměry na místech, která se snadno najdou.
const OBEC_A = { place: 'Zkušebnice', okres: 'Kolín', type: 'obec', parcel: '123/4',
  druh: 'stavební pozemek', area: 1200, price: 480000,
  extra: 'záměr obce — úřední deska', lat: 50.205, lng: 15.405,
  url: 'https://example.invalid/zamer-a', first_seen: '2026-09-20' };
const OBEC_B = { place: 'Druhotice', okres: 'Kolín', type: 'obec', parcel: '77',
  druh: 'orná půda', area: 5400, price: 270000,
  extra: 'záměr obce — úřední deska', lat: 50.232, lng: 15.441,
  url: 'https://example.invalid/zamer-b', first_seen: '2026-09-20' };
const VYPLN = [];
for (let i = 0; i < 24; i++) {
  VYPLN.push({ place: 'Obec ' + i, okres: 'Kolín', type: 'sale', parcel: String(i),
    druh: 'orná půda', area: 3000 + i * 50, price: 120000 + i * 4000,
    extra: 'inzerát', lat: 50.01 + i * 0.002, lng: 15.18 + i * 0.002,
    url: 'https://example.invalid/s' + i, first_seen: '2026-09-19' });
}
const PODSTRCENA = { updated: '2026-09-20', source: 'test', opportunities: [...VYPLN, OBEC_A, OBEC_B] };

const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
// Pořadí je důležité: Playwright bere POSLEDNÍ shodu, takže obecné pravidlo první.
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
  return LEAFLET ? r.abort() : r.continue();
});
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
// Tohle je jádro testu: místo skutečných dat dostane stránka naše.
await ctx.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
  contentType: 'application/json', body: JSON.stringify(PODSTRCENA) }));
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
const chyby = [];
p.on('pageerror', (e) => chyby.push(String(e)));
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4200);

// --- 1) Data se opravdu podstrčila ------------------------------------
const pocet = await p.evaluate(() => document.querySelectorAll('.opp-item').length);
pravda('stránka načetla podstrčená data', pocet > 0, 've výpisu není ani jedna nabídka');

// --- 2) Štítek filtru pro obecní záměr se objevil ---------------------
// Web štítky prázdných kategorií schovává (ať nevzniká mrtvé tlačítko).
// Jakmile data přijdou, musí se štítek sám vrátit — to se nikdy nestalo.
const chip = await p.evaluate(() => {
  const b = document.querySelector('.filter-chip[data-type="obec"]');
  if (!b) return null;
  const s = getComputedStyle(b);
  const tecka = b.querySelector('.c');
  return {
    videt: s.display !== 'none' && s.visibility !== 'hidden' && b.offsetParent !== null,
    tvar: tecka ? [...tecka.classList].find((c) => c.startsWith('tv-')) : null,
  };
});
pravda('štítek filtru „Obecní záměr" se po příchodu dat objevil', !!(chip && chip.videt),
  chip ? 'štítek existuje, ale není vidět' : 'štítek v HTML vůbec není');
pravda('štítek nese tvar, ne jen barvu', chip && chip.tvar === 'tv-ctverec',
  `tvar štítku je ${chip && chip.tvar}`);

// --- 3) Legenda na mapě zná obecní záměr ------------------------------
await p.evaluate(() => document.querySelector('.mvt-btn[data-mv="mapa"]')?.click());
await p.waitForTimeout(600);
const vLegende = await p.evaluate(() => [...document.querySelectorAll('#map-legend .lg-item')]
  .map((e) => ({ text: e.textContent.trim(), tvar: [...(e.querySelector('.lg-dot')?.classList || [])].find((c) => c.startsWith('tv-')) }))
  .find((l) => /obecn/i.test(l.text)) || null);
pravda('legenda ukazuje obecní záměr', !!vLegende, 'v legendě chybí');
pravda('v legendě má obecní záměr čtverec', vLegende && vLegende.tvar === 'tv-ctverec',
  `vyšlo ${vLegende && vLegende.tvar}`);

// --- 4) Na mapě se kreslí jako čtverec --------------------------------
// Čtverec má všechny řádky stejně široké; kolečko se ke krajům zužuje.
const ctverec = await p.evaluate(({ lat, lng }) => {
  const map = window.PK_MAPA;
  if (!map) return null;
  map.setView([lat, lng], 15, { animate: false });
  const pane = document.querySelector('.leaflet-dots-pane') || document.querySelector('[class*="dots"]');
  const cv = pane && pane.querySelector('canvas');
  if (!cv) return null;
  const pt = map.latLngToContainerPoint([lat, lng]);
  const r = cv.getBoundingClientRect(), mr = map.getContainer().getBoundingClientRect();
  const x = Math.round(pt.x + mr.left - r.left), y = Math.round(pt.y + mr.top - r.top);
  const R = 45, W = R * 2;
  let img;
  try { img = cv.getContext('2d').getImageData(x - R, y - R, W, W); } catch (e) { return null; }
  const plny = (i, j) => img.data[(j * W + i) * 4 + 3] > 40;
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) if (plny(i, j)) {
    n++; if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
  }
  if (n === 0) return { celkem: 0 };
  return {
    celkem: n, sirka: x1 - x0 + 1, vyska: y1 - y0 + 1,
    // Čtverec vyplňuje rohy svého opsaného obdélníku; kolečko ani
    // kosočtverec ne. Tohle je na rozdíl od šířky řádků odolné vůči
    // zaokrouhlení na pixely.
    rohu: [plny(x0 + 1, y0 + 1), plny(x1 - 1, y0 + 1), plny(x0 + 1, y1 - 1), plny(x1 - 1, y1 - 1)].filter(Boolean).length,
  };
}, { lat: OBEC_A.lat, lng: OBEC_A.lng });
pravda('obecní záměr je na mapě nakreslený', !!(ctverec && ctverec.celkem > 8),
  `napočítáno ${ctverec && ctverec.celkem} barevných pixelů`);
if (ctverec && ctverec.celkem > 8) {
  // Kdyby vzorek zachytil i sousední bod, nebyl by opsaný obdélník čtvercový
  // a test tvaru by neměl co měřit — proto se to kontroluje zvlášť.
  pravda('ve vzorku je jen jeden bod, ne shluk',
    Math.abs(ctverec.sirka - ctverec.vyska) <= 3,
    `opsaný obdélník ${ctverec.sirka}×${ctverec.vyska} px — nejspíš se do vzorku vešel i soused`);
  pravda('kreslí se jako čtverec (vyplňuje všechny čtyři rohy)', ctverec.rohu === 4,
    `vyplněné rohy: ${ctverec.rohu} ze 4 — kolečko ani kosočtverec rohy nevyplní`);
}

// --- 5) Filtrování na obecní záměry vrátí právě je --------------------
await p.evaluate(() => document.querySelector('.mvt-btn[data-mv="seznam"]')?.click());
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('.filter-chip[data-type="obec"]')?.click());
await p.waitForTimeout(700);
const poFiltru = await p.evaluate(() => [...document.querySelectorAll('.opp-item')]
  .map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
pravda('filtr „Obecní záměr" vypsal právě dva podstrčené záměry', poFiltru.length === 2,
  `vypsáno ${poFiltru.length} položek`);
pravda('ve výpisu jsou obě obce', poFiltru.join(' | ').includes('Zkušebnice') && poFiltru.join(' | ').includes('Druhotice'),
  poFiltru.join(' | ').slice(0, 200));

// --- 6) Klik otevře stránku pozemku a ta ví, že jde o záměr obce ------
// Ze seznamu se nechodí do panelu, ale na vlastní stránku pozemku. Ta si
// záznam bere ze sessionStorage, takže i tahle cesta musí obecní záměr
// unést — jinak by se u prvního skutečného záměru otevřela prázdná stránka.
await p.evaluate(() => document.querySelector('.opp-item')?.click());
await p.waitForURL(/pozemek\.html/, { timeout: 8000 }).catch(() => {});
await p.waitForTimeout(1500);
const adresa = p.url();
pravda('klik na obecní záměr otevřel stránku pozemku', /pozemek\.html/.test(adresa), adresa);
const stranka = await p.evaluate(() => document.body.textContent.replace(/\s+/g, ' ').trim());
pravda('stránka pozemku ukazuje štítek „Obecní záměr"', /Obecní záměr/.test(stranka),
  stranka.slice(0, 200));
pravda('stránka vysvětluje, co záměr obce znamená', /úřední desce/i.test(stranka),
  'chybí věta o úřední desce a lhůtě');
pravda('stránka ukazuje obec z podstrčených dat', /Zkušebnice|Druhotice/.test(stranka),
  stranka.slice(0, 200));

pravda('na stránce nespadl žádný skript', chyby.length === 0, chyby[0]);

await prohlizec.close();
console.log('\nKategorie „Obecní záměr" — celá cesta od dat po detail');
console.log('  · v ostrých datech zatím žádný obecní záměr není, proto se podstrkují testovací');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Obecní záměr: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
