// Zkouška: web nekreslí čáru, kterou by si někdo mohl splést s hranicí pozemku.
//
// Spuštění: node scripts/test-obrys.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Pravidlo je zapsané v js/snimek.js: „Radši nic než čára, kterou si někdo
// splete s hranicí pozemku." Kvůli němu z leteckého snímku zmizel i čtverec
// o SKUTEČNÉ výměře — protože na snímku působil jako obrys parcely, a ten
// v datech nemáme (je v katastru).
//
// Na mapě se přesto dál kreslil pětiúhelník v barvě typu, vyplněný, na
// skutečném místě pozemku a od přiblížení 12 výš. Tvar i orientace se
// počítaly z Math.sin(poradiVPoli * …), takže nesdělovaly nic, po každém
// sběru dat vyšly jinak — a plocha vycházela v mediánu na 58 % skutečné
// výměry, takže pozemek působil o dvě pětiny menší, než je.
//
// Tahle zkouška hlídá, že se to nevrátí: ani na mapu, ani do karty detailu.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push('  ✕ ' + popis + (proc ? '\n      ' + proc : '')); }
}

/* --- 1) Ve zdroji po tom nezůstala stopa ---------------------------- */
{
  const m = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const pz = fs.readFileSync(path.join(ROOT, 'js', 'pozemek.js'), 'utf8');
  for (const [jmeno, zdroj] of [['js/main.js', m], ['js/pozemek.js', pz]]) {
    pravda(jmeno + ' už nepočítá vymyšlený tvar parcely',
      !/function polyFor\b/.test(zdroj), 'polyFor je zpátky');
    pravda(jmeno + ' už nekreslí „plán parcely"',
      !/function planSvg\b/.test(zdroj), 'planSvg je zpátky');
  }
  pravda('karta detailu už nemá kostičku s vymyšleným tvarem',
    !/md-shape/.test(m) && !/function shapeSvg\b/.test(m));
  const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
  pravda('a nezůstal po ní ani styl', !/\.md-shape/.test(css));
  /* Pojistka, že zkouška měří to, o co jde: pravidlo musí být pořád
     zapsané tam, odkud pochází. Kdyby se js/snimek.js přepsal, je potřeba
     tuhle zkoušku znovu promyslet, ne smazat. */
  const sn = fs.readFileSync(path.join(ROOT, 'js', 'snimek.js'), 'utf8');
  pravda('pravidlo je pořád zapsané v js/snimek.js (jinak tahle zkouška nemá o co se opřít)',
    /splete s hranicí pozemku/.test(sn));
}

/* --- 2) A na mapě se opravdu žádný neobjeví ------------------------- */
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (LEAFLET && /unpkg\.com\/leaflet/.test(u.href)) {
    const f = u.pathname.split('/').pop();
    const c = path.join(LEAFLET, f);
    if (fs.existsSync(c)) return r.fulfill({ status: 200, body: fs.readFileSync(c),
      contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript' });
  }
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return r.abort();
});
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: "window.PK_SUPABASE_URL='" + BASE + "';window.PK_SUPABASE_KEY='anon';" }));
const p = await ctx.newPage();
await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => !!window.PK_MAPA && window.PK_MAPA.getZoom, null, { timeout: 15000 }).catch(() => {});
const mapaJe = await p.evaluate(() => !!(window.PK_MAPA && window.PK_MAPA.getZoom));
pravda('mapa se načetla (jinak zkouška níž nic neměří)', mapaJe,
  'bez mapy se tvary nekreslí a zkouška by mlčela i u rozbitého webu');

let v = null;
if (mapaJe) {
  /* Přiblížení 13: od dvanáctky výš se tvary parcel kreslily. Střed se
     nastaví na první pozemek v datech, ať je na co koukat. */
  v = await p.evaluate(async () => {
    const m = window.PK_MAPA;
    const L = window.L;
    let stred = null;
    m.eachLayer((l) => { if (!stred && l.getLatLng) stred = l.getLatLng(); });
    /* setView hned po načtení neprojde (mapa ještě dojíždí na výchozí
       výřez), a zkouška by pak měřila přiblížení 7 — kde se tvary
       nekreslily ani dřív, takže by mlčela. Proto setZoom zvlášť a
       přiblížení se pak ověřuje. */
    if (stred) m.setView(stred, 13, { animate: false });
    await new Promise((r) => setTimeout(r, 900));
    m.setZoom(14, { animate: false });
    await new Promise((r) => setTimeout(r, 1500));
    let maleMnohouhelniky = 0, velke = 0, tecky = 0;
    m.eachLayer((l) => {
      if (l.getLatLng) { tecky++; return; }
      if (!L || !(l instanceof L.Polygon) || !l.getLatLngs) return;
      const ll = l.getLatLngs();
      const n = (Array.isArray(ll[0]) ? ll[0] : ll).length;
      if (n <= 8) maleMnohouhelniky++; else velke++;
    });
    return { zoom: m.getZoom(), maleMnohouhelniky, velke, tecky };
  });
  pravda('na mapě jsou vidět pozemky (jinak zkouška níž nic neměří)', v.tecky > 0,
    'značek pozemků ' + v.tecky + ' — bez nich by se tvary nekreslily tak jako tak');
  pravda('a mapa se opravdu přiblížila (tvary se kreslily od dvanáctky výš)', v.zoom >= 12,
    'přiblížení zůstalo na ' + v.zoom + ' — tam se nekreslily ani dřív a zkouška by mlčela');
  pravda('po přiblížení se nekreslí žádný vymyšlený obrys pozemku',
    v.maleMnohouhelniky === 0,
    'mnohoúhelníků s nejvýš osmi body je ' + v.maleMnohouhelniky
    + ' (přiblížení ' + v.zoom + '); obrysy krajů, které mají bodů víc, se sem nepočítají — těch je ' + v.velke);
}
await ctx.close();
await prohlizec.close();

console.log('\nObrys pozemku — nekreslíme, co nevíme');
console.log(zpravy.join('\n'));
console.log('\n' + ok + ' v pořádku, ' + chyb + ' chyb\n');
if (chyb) { console.log('::error::Obrys pozemku: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
