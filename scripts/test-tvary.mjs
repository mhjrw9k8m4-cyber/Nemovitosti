// Test: druh příležitosti se pozná i bez barev.
//
// Spuštění: node scripts/test-tvary.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč: druh (prodej / dražba / exekuce / obec / majitel) rozlišovala jedině
// barva. Zhruba každý dvanáctý muž rozlišuje barvy jinak a zrovna červená
// proti oranžové — tedy exekuce proti dražbě — je nejčastější dvojice, která
// splyne. Každý druh proto má na mapě vlastní TVAR.
//
// Test nespoléhá na to, že v HTML existuje nějaká třída. Kreslení na plátno
// si píšeme sami (Leaflet umí jen kolečka), takže nejpravděpodobnější tichá
// porucha je, že se naše kreslení přestane volat a všechno se vrátí ke
// kolečkům — a toho si nikdo nevšimne. Test proto ČTE PIXELY z plátna mapy
// a z nich pozná, jestli je tam trojúhelník, kosočtverec nebo kolečko.
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

const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
const vzorek = (t) => DATA.find((d) => d.type === t && d.lat && d.lng);

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
await p.evaluate(() => document.querySelector('.mvt-btn[data-mv="mapa"]')?.click());
await p.waitForTimeout(700);

// --- 1) Tabulka tvarů: každý druh musí mít svůj vlastní ---------------
const tvary = await p.evaluate(() => window.PK_TVARY || null);
pravda('mapa zná tabulku tvarů', !!tvary, 'window.PK_TVARY chybí');
if (tvary) {
  const vData = [...new Set(DATA.map((d) => d.type))];
  const prirazene = vData.map((t) => tvary[t]);
  pravda('každý druh v datech má přiřazený tvar', prirazene.every(Boolean),
    `chybí tvar pro ${vData.filter((t) => !tvary[t]).join(', ')}`);
  pravda('žádné dva druhy nesdílejí tvar', new Set(prirazene).size === prirazene.length,
    `tvary ${JSON.stringify(Object.fromEntries(vData.map((t, i) => [t, prirazene[i]])))}`);
}

// --- 2) Legenda učí tentýž tvar, jaký je na mapě ----------------------
const legenda = await p.evaluate(() => [...document.querySelectorAll('#map-legend .lg-item')]
  .filter((e) => !e.classList.contains('lg-urgent'))
  .map((e) => ({ popis: e.textContent.trim(), tvar: [...e.querySelector('.lg-dot').classList].find((c) => c.startsWith('tv-')) })));
pravda('legenda má u každého druhu tvar, ne jen barvu',
  legenda.length > 0 && legenda.every((l) => !!l.tvar),
  JSON.stringify(legenda));
pravda('tvary v legendě se navzájem liší',
  new Set(legenda.map((l) => l.tvar)).size === legenda.length,
  JSON.stringify(legenda.map((l) => l.tvar)));

// --- 3) Jádro: opravdu se ty tvary na plátno kreslí? ------------------
// Přečteme pixely kolem bodu a spočítáme, kolik jich je v horní a v dolní
// třetině. Trojúhelník má nahoře špičku a dole základnu, takže poměr je
// výrazný; kolečko je zhruba symetrické. Kdyby se naše kreslení přestalo
// volat, Leaflet by nakreslil kolečko a tenhle poměr by spadl na 1.
async function profil(d) {
  return await p.evaluate(({ lat, lng }) => {
    const map = window.PK_MAPA;
    if (!map) return null;
    map.setView([lat, lng], 14, { animate: false });
    const pane = document.querySelector('.leaflet-dots-pane') || document.querySelector('[class*="dots"]');
    const cv = pane && pane.querySelector('canvas');
    if (!cv) return null;
    const pt = map.latLngToContainerPoint([lat, lng]);
    const r = cv.getBoundingClientRect();
    const mapR = map.getContainer().getBoundingClientRect();
    // plátno může být posunuté proti kontejneru mapy
    const x = Math.round(pt.x + mapR.left - r.left);
    const y = Math.round(pt.y + mapR.top - r.top);
    const R = 11;
    const g = cv.getContext('2d');
    let img;
    try { img = g.getImageData(x - R, y - R, R * 2, R * 2); } catch (e) { return null; }
    const radky = [];
    for (let j = 0; j < R * 2; j++) {
      let n = 0;
      for (let i = 0; i < R * 2; i++) if (img.data[(j * R * 2 + i) * 4 + 3] > 40) n++;
      radky.push(n);
    }
    return radky;
  }, { lat: d.lat, lng: d.lng });
}
function tretiny(radky) {
  const n = radky.length, t = Math.floor(n / 3);
  const soucet = (a, b) => radky.slice(a, b).reduce((x, y) => x + y, 0);
  return { horni: soucet(0, t), dolni: soucet(n - t, n), celkem: soucet(0, n) };
}

const exek = vzorek('exekuce');
const prodej = vzorek('sale');

if (exek) {
  const r = await profil(exek);
  const t = r && tretiny(r);
  pravda('na plátně je u exekuce vůbec něco nakresleno', !!(t && t.celkem > 8),
    `napočítáno ${t && t.celkem} barevných pixelů`);
  if (t && t.celkem > 8) {
    pravda('exekuce se kreslí jako trojúhelník (dole širší než nahoře)',
      t.dolni >= t.horni * 2,
      `horní třetina ${t.horni} px, dolní ${t.dolni} px — u kolečka by byly skoro stejné, ` +
      'takže se nejspíš přestalo volat naše kreslení a Leaflet vrátil kolečka');
  }
}
if (prodej) {
  const r = await profil(prodej);
  const t = r && tretiny(r);
  if (t && t.celkem > 8) {
    const pomer = t.dolni / Math.max(1, t.horni);
    pravda('na prodej se kreslí jako kolečko (nahoře i dole stejně)',
      pomer > 0.6 && pomer < 1.7, `poměr dolní/horní třetiny je ${pomer.toFixed(2)}`);
  }
}

pravda('na stránce nespadl žádný skript', chyby.length === 0, chyby[0]);

await prohlizec.close();
console.log('\nDruh příležitosti se pozná i bez barev');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Tvary: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
