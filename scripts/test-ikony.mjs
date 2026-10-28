// Test: ikony jsou jedna sada, kreslí se jedním perem a na stránce je vždy,
// co si zavolá.
//
// Spuštění: node scripts/test-ikony.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Tvary ikon stojí na jednom místě (scripts/ikony.mjs) a do stránky je
// vkládá sestavení jako <symbol>; kód si je volá jménem, <use href="#i-…">.
// Tahle zkouška hlídá tři věci, a každou z nich proto, že se SKUTEČNĚ
// pokazila, když sada vznikala:
//
//   1. ODKAZ BEZ TVARU a TVAR BEZ ODKAZU. Překlep v názvu (#i-cela_obrazovka
//      místo #i-cela-obrazovka) udělá neviditelnou ikonu — v kódu je, na
//      stránce není nic. A tvar, na který se nikdo neodkazuje, je mrtvá váha.
//
//   2. CO SI STRÁNKA ZAVOLÁ, TO NA NÍ MUSÍ BÝT. Sestavení vkládá jen ty
//      symboly, které ve stránce a v jejích skriptech najde. Když se odkaz
//      v kódu SKLÁDÁ ('#i-' + jmeno), nenajde ho — a tři ikony nad výpisem
//      takhle zmizely. Tohle se nedá přečíst ze zdroje, musí se otevřít
//      stránka a zeptat se prohlížeče.
//
//      (Přísnější sourozenec je scripts/test-tahy.mjs: ten měří KAŽDOU
//      ikonu proti 1,5 px na dvanácti stránkách. Tenhle hlídá rozpětí
//      v rámci jedné stránky. Po zavedení sady spadl test-tahy, ne
//      tenhle — vyplněná záložka „Uložené" dostala od společného pera
//      tah, který nikdy neměla.)
//
//   3. STOPA. Ikony jsou linkové ve čtyřiadvacítkové soustavě. Když se táž
//      ikona vysází jednou na 16 px a jinde na 19 px se stejnou tloušťkou
//      tahu, má na obrazovce pokaždé jinou stopu — 1,33 px proti 1,58 px.
//      Každá zvlášť vypadá dobře, vedle sebe působí, že jsou z různých sad.
//      Tloušťka se proto dopočítává k velikosti (36/šířka) a tenhle test
//      měří, co z toho nakonec vyleze na obrazovku — ne co je v CSS.
import { readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { adresaPozemku } from './adresa-pozemku.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { IKONY, idIkony } from './ikony.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs. */
hlasPad('Ikony', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---------- 1. sada proti kódu (bez prohlížeče) ---------- */
const ZDROJE = [];
for (const f of readdirSync('js')) if (f.endsWith('.js')) ZDROJE.push('js/' + f);
for (const f of readdirSync('.')) {
  if (!f.endsWith('.html') || /^(pozemek|pozemky)-/.test(f)) continue;
  ZDROJE.push(f);
}
for (const f of readdirSync('scripts')) {
  if (f.endsWith('.mjs') && !f.startsWith('test-')) ZDROJE.push('scripts/' + f);
}
const odkazy = new Set();
for (const c of ZDROJE) {
  const t = readFileSync(c, 'utf8');
  for (const m of t.matchAll(/#(i-[a-z0-9-]+)/g)) odkazy.add(m[1]);
}
const tvary = Object.keys(IKONY).map(idIkony);
const bezTvaru = [...odkazy].filter((i) => !tvary.includes(i));
const bezOdkazu = tvary.filter((i) => !odkazy.has(i));
pravda('každý odkaz #i-… má v sadě svůj tvar', bezTvaru.length === 0,
  `bez tvaru: ${bezTvaru.join(' ')} — na stránce by byla díra`);
pravda('a žádný tvar v sadě není navíc', bezOdkazu.length === 0,
  `nikdo si o ně neřekne: ${bezOdkazu.join(' ')}`);
pravda('sada má rozumný počet ikon', tvary.length >= 30 && tvary.length <= 120,
  `v sadě je ${tvary.length} tvarů`);

/* Kresba jen v sadě. Jediné povolené výjimky jsou značka webu (má výplň
   a vlastní plátno) a grafy, které se počítají z dat. */
const VYJIMKY = new Set(['404.html', 'js/snimek.js', 'js/graf-cen.js', 'scripts/build-og.mjs']);
const kresli = [];
for (const c of ZDROJE) {
  if (VYJIMKY.has(c)) continue;
  const t = readFileSync(c, 'utf8').replace(/['"]\s*\+\s*\n?\s*['"]/g, '');
  for (const m of t.matchAll(/<svg\b[^>]*viewBox="0 0 24 24"[^>]*>([\s\S]{0,400}?)<\/svg>/g)) {
    if (/<(path|circle|rect|line|polyline|polygon)\b/.test(m[1])) kresli.push(c);
  }
}
pravda('nikde se nekreslí ikona mimo sadu', kresli.length === 0,
  `kreslí si po svém: ${[...new Set(kresli)].join(' ')}`);

/* ---------- 2. a 3. v prohlížeči ---------- */
const POZEMEK = (adresaPozemku() || {}).url || null;
const STRANKY = ['index.html', POZEMEK || 'pozemek.html', 'muj-inzerat.html',
  'pridat.html', 'zpravy.html', 'hlidani.html', 'cena-pozemku.html',
  'kontakt.html', 'pozemky-okres-zlin.html'];

const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return r.abort();
});
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));

const vsechny = [];
const chybejici = [];
const bezSady = [];
for (const s of STRANKY) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3200);
  const v = await p.evaluate(() => {
    const out = { ikony: [], chybi: [], symbolu: document.querySelectorAll('.ik-sada symbol').length };
    document.querySelectorAll('use').forEach((u) => {
      const h = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
      if (h.indexOf('#i-') !== 0) return;
      if (!document.getElementById(h.slice(1))) { out.chybi.push(h); return; }
      const svg = u.ownerSVGElement;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      if (!r.width || r.width > 26 || r.width < 10) return;  // velké značky a mikroikony sem nepatří
      const vb = (svg.getAttribute('viewBox') || '0 0 24 24').split(/\s+/);
      const sirkaVB = +vb[2] || 24;
      const cs = getComputedStyle(u);
      if (cs.stroke === 'none' || cs.fill !== 'none') return;  // vyplněné značky nemají co srovnávat
      out.ikony.push({
        kdo: (svg.parentElement.className || '').toString().split(' ')[0]
          || (svg.getAttribute('class') || '').split(' ').filter((x) => x !== 'ik')[0]
          || svg.parentElement.tagName.toLowerCase(),
        velikost: Math.round(r.width),
        stopa: +((parseFloat(cs.strokeWidth) || 0) * r.width / sirkaVB).toFixed(2),
      });
    });
    return out;
  });
  v.ikony.forEach((i) => vsechny.push({ ...i, stranka: s.split('?')[0] }));
  v.chybi.forEach((h) => chybejici.push(s.split('?')[0] + ' ' + h));
  if (!v.symbolu) bezSady.push(s.split('?')[0]);
  await p.close();
}
await prohlizec.close();

pravda('žádná stránka nevolá ikonu, kterou nemá', chybejici.length === 0,
  `volá a nemá: ${[...new Set(chybejici)].slice(0, 8).join('\n      ')}`);
pravda('sada je na každé z měřených stránek', bezSady.length === 0,
  `bez sady: ${bezSady.join(' ')}`);
pravda('nějaké linkové ikony se vůbec našly', vsechny.length >= 8,
  `našlo se jen ${vsechny.length} — test by mlčel`);

const stopy = vsechny.map((i) => i.stopa);
const min = Math.min(...stopy), max = Math.max(...stopy);
const rozpeti = max - min;
// Rozdíl do 0,2 px oko nepozná; větší už ano.
pravda('všechny ikony mají na obrazovce zhruba stejnou stopu', rozpeti <= 0.2,
  `od ${min} px do ${max} px (rozdíl ${rozpeti.toFixed(2)} px)\n      ` +
  vsechny.filter((i) => i.stopa === min || i.stopa === max)
    .map((i) => `${i.stranka} ${i.kdo} ${i.velikost}px → ${i.stopa}px`).slice(0, 6).join('\n      '));
pravda('a ta stopa není ani vlasová, ani tučná', min >= 1.2 && max <= 1.9,
  `rozsah ${min}–${max} px`);

pravda('v datech je pozemek, na kterém jde stránka inzerátu otevřít', !!POZEMEK,
  'žádný pozemek s polohou a cenou — kontrola špendlíků by měřila prázdno');
// Typický případ ze stránky pozemku: tentýž špendlík na dvou místech.
const poz = vsechny.filter((i) => i.stranka === 'pozemek.html');
const spendliky = poz.filter((i) => i.kdo === 'pz-okres' || i.kdo === 'pz-abtn');
pravda('špendlík u okresu a u odkazu na katastr kreslí stejně',
  spendliky.length >= 2 && Math.abs(spendliky[0].stopa - spendliky[spendliky.length - 1].stopa) <= 0.1,
  JSON.stringify(spendliky));

console.log('\nIkony — jedna sada, jedno pero, a na stránce to, co si zavolá');
console.log(zpravy.join('\n'));
console.log(`\nzměřeno ${vsechny.length} ikon na ${STRANKY.length} stránkách, v sadě ${tvary.length} tvarů`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Ikony: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
