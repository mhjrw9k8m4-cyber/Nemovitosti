// Test: barva kategorie je na celém webu jedna a tatáž.
//
// Spuštění: node scripts/test-barvy.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Pozemek se na webu ukazuje na třech místech: jako tečka na mapě, jako karta
// ve výpisu a jako vlastní stránka. Barva kategorie („dražba" je cihlová) byla
// opsaná zvlášť v js/main.js, zvlášť v js/pozemek.js a potřetí v pravidlech
// stylu. Přesně tak se u ceny rozešla mapa se stránkou — tři kopie téhož
// výpočtu — a přesně tak se to stalo znovu u barev: paleta se změnila v CSS
// a tečky na mapě zůstaly ve staré.
//
// Zdroj je proto jeden: proměnné v CSS. Tenhle test hlídá, že si to tak
// zůstane — a hlavně že se ty barvy na stránce OPRAVDU projeví.
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

const KATEGORIE = ['sale', 'drazba', 'exekuce', 'obec', 'majitel'];

// --- 1) V kódu nesmí zůstat opsaná barva -----------------------------
for (const f of ['../js/main.js', '../js/pozemek.js']) {
  const t = readFileSync(new URL(f, import.meta.url), 'utf8');
  const blok = t.slice(t.indexOf('var TYPE = {'), t.indexOf('};', t.indexOf('var TYPE = {')));
  const opsane = [...blok.matchAll(/color:\s*'#[0-9A-Fa-f]{6}'/g)].map((m) => m[0]);
  pravda(`${f.replace('../', '')} si barvy kategorií nedrží sám`, opsane.length === 0,
    'opsané: ' + opsane.join(', '));
  pravda(`${f.replace('../', '')} je bere z proměnných ve stylu`,
    KATEGORIE.every((k) => blok.indexOf("'--c-" + k + "'") !== -1));
}

const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
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
  for (const c of ['index.html', 'pozemek.html']) {
    await ctx.route(`${BASE}/${c}*`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
}

/** Načte stránku a vrátí, co si o barvách myslí ona sama. */
async function zjisti(url) {
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', (e) => chyby.push(String(e)));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3800);
  const v = await p.evaluate((kat) => {
    const cs = getComputedStyle(document.documentElement);
    const tok = {}, dot = {};
    kat.forEach((k) => { tok[k] = cs.getPropertyValue('--c-' + k).trim(); });
    // Tečky na mapě i puntíky v legendě si barvu nesou v atributu style.
    document.querySelectorAll('.lp-dot, .lg-dot').forEach((e, i) => {
      dot['prvek' + i] = getComputedStyle(e).backgroundColor;
    });
    return { tok, dot, pocetDot: Object.keys(dot).length };
  }, KATEGORIE);
  await p.close();
  return { ...v, chyby };
}

function naRgb(hex) {
  const h = hex.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}

const uvod = await zjisti(`${BASE}/index.html`);
pravda('proměnné kategorií na úvodu existují',
  KATEGORIE.every((k) => /^#[0-9A-Fa-f]{6}$/.test(uvod.tok[k])), JSON.stringify(uvod.tok));
pravda('na úvodu nespadl žádný skript', uvod.chyby.length === 0, uvod.chyby[0]);

// Jádro: puntíky v legendě a ve výpisu mají barvy z těch proměnných, ne jiné.
const povolene = new Set(KATEGORIE.map((k) => naRgb(uvod.tok[k])));
const cizi = Object.entries(uvod.dot).filter(([, v]) => !povolene.has(v));
pravda('nějaké barevné puntíky se vůbec vykreslily', uvod.pocetDot > 0,
  'v DOMu není ani jeden .lp-dot / .lg-dot — test by mlčel');
pravda('každý puntík má barvu z palety, ne opsanou', cizi.length === 0,
  cizi.map(([k, v]) => `${k} má ${v}`).slice(0, 5).join(', ') + '\n      povolené: ' + [...povolene].join(', '));

const poz = await zjisti(`${BASE}/pozemek.html?p=Police%7C6242%7CVset%C3%ADn&ll=48.97,15.63`);
pravda('stránka pozemku čte tytéž proměnné',
  KATEGORIE.every((k) => poz.tok[k] === uvod.tok[k]),
  JSON.stringify(poz.tok) + ' × ' + JSON.stringify(uvod.tok));
pravda('na stránce pozemku nespadl žádný skript', poz.chyby.length === 0, poz.chyby[0]);

// --- 4) Dražba a exekuce patří do jedné teplé rodiny -----------------
// Tohle je ta záměrná změna: zlatá a semaforová červená pryč, cihlová rodina.
function odstin(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let x; if (mx === r) x = ((g - b) / d + (g < b ? 6 : 0)); else if (mx === g) x = (b - r) / d + 2; else x = (r - g) / d + 4;
  return x * 60;
}
const hD = odstin(uvod.tok.drazba), hE = odstin(uvod.tok.exekuce);
pravda('dražba je v teplé cihlové části spektra', hD >= 5 && hD <= 35, `odstín ${hD.toFixed(0)}°`);
pravda('exekuce taky', hE >= 0 && hE <= 25, `odstín ${hE.toFixed(0)}°`);
pravda('a přitom se od sebe dají rozeznat', Math.abs(hD - hE) > 3 || (() => {
  const sv = (x) => { const h = x.replace('#', ''); return [0, 2, 4].reduce((a, i) => a + parseInt(h.slice(i, i + 2), 16), 0) / 3; };
  return Math.abs(sv(uvod.tok.drazba) - sv(uvod.tok.exekuce)) > 40;
})(), `dražba ${uvod.tok.drazba}, exekuce ${uvod.tok.exekuce}`);

await prohlizec.close();
console.log('\nBarvy kategorií — jeden zdroj pro mapu i karty');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Barvy kategorií: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
