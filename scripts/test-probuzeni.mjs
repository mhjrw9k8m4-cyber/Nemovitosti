/* Test: první dotek mapu jen probudí, nehýbe s ní.
 *
 * Spuštění: node scripts/test-probuzeni.mjs
 *   (potřebuje playwright-core; v sandboxu PW_CHROMIUM=cesta/k/chrome)
 *
 * PROČ. Mapa se načítá zamčená schválně — přes zamčenou mapu jde na
 * telefonu rolovat stránkou prstem, což je první věc, kterou tam člověk
 * dělá. Jenže zamčená mapa uměla na klepnutí jedinou věc: vybrat kraj.
 * A ta skočí z přehledu rovnou na kraj.
 *
 * NAMĚŘENO na telefonu 390×844 před opravou: první klepnutí doprostřed
 * mapy posunulo střed a zvedlo přiblížení ze 6 na 8, druhé z 8 na 11.
 * Mapa tedy pod prstem utíkala dřív, než s ní šlo vůbec hýbat — a přesně
 * takhle to popsal člověk, který web používá: „pořád blbě reaguje na
 * první klik" a „ať se ta mapa celá nehýbe, chce to pevnost".
 *
 * PRAVIDLO. První dotek odemkne posouvání a přiblížení a tím skončí:
 * nesmí změnit ani střed, ani přiblížení. Teprve druhý vybírá.
 */
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, locale: 'cs-CZ' });
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
const p = await ctx.newPage();
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2800);
/* Na telefonu je výchozí SEZNAM; mapa je na jedno klepnutí vedle. */
await p.evaluate(() => { const t = document.querySelector('.mvt-btn[data-mv="mapa"]'); if (t) t.click(); });
await p.waitForTimeout(1200);

const stav = () => p.evaluate(() => {
  const m = window.PK_MAPA;
  if (!m) return null;
  const c = m.getCenter();
  return { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: m.getZoom(),
    tazeni: !!(m.dragging && m.dragging.enabled()) };
});

const start = await stav();
pravda('mapa je na stránce a dá se změřit', !!start, 'window.PK_MAPA chybí');
if (start) {
  pravda('a po načtení je zamčená (přes ni jde rolovat stránkou)',
    start.tazeni === false, 'tažení je zapnuté hned — stránka přes mapu nepůjde rolovat');

  const r = await p.evaluate(() => {
    const e = document.getElementById('leaflet-map');
    const b = e.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  });
  await p.touchscreen.tap(r.x, r.y);
  await p.waitForTimeout(900);
  const po1 = await stav();

  pravda('první dotek nezmění střed mapy',
    po1.lat === start.lat && po1.lng === start.lng,
    `${start.lat},${start.lng} → ${po1.lat},${po1.lng}`);
  pravda('ani přiblížení', po1.zoom === start.zoom, `${start.zoom} → ${po1.zoom}`);
  pravda('zato mapu odemkne', po1.tazeni === true, 'tažení zůstalo vypnuté — mapa je pořád mrtvá');

  /* Druhý dotek už vybírá: jinak by se mapa nedala použít vůbec. */
  await p.touchscreen.tap(r.x, r.y);
  await p.waitForTimeout(1200);
  const po2 = await stav();
  pravda('druhý dotek už kraj vybere (jinak by byla mapa k ničemu)',
    po2.zoom !== po1.zoom || po2.lat !== po1.lat || po2.lng !== po1.lng,
    `pohled se nezměnil: ${po2.zoom} / ${po2.lat},${po2.lng}`);
}

await prohlizec.close();
console.log('\n=== probuzení mapy ===');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.error(`::error::Probuzení mapy: ${chyb} kontrol neprošlo.`); process.exit(1); }
process.exit(0);
