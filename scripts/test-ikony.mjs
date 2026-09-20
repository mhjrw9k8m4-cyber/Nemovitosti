// Test: ikony vypadají jako jedna sada.
//
// Spuštění: node scripts/test-ikony.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Ikony na webu jsou linkové a kreslené v soustavě 24×24. Když se táž ikona
// vysází jednou na 16 px a jinde na 19 px se stejnou tloušťkou tahu, má na
// obrazovce pokaždé jinou stopu — 1,33 px proti 1,58 px. Každá zvlášť vypadá
// dobře, vedle sebe působí, že jsou z různých sad. Přesně tak to na webu
// bylo u špendlíku: jeden u „okres Vsetín", druhý u „Otevřít v katastru".
//
// Tloušťka se proto dopočítává k velikosti. Tenhle test měří, co z toho
// nakonec vyleze na obrazovku — ne co je napsané v CSS.
import { chromium } from 'playwright-core';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const STRANKY = ['index.html', 'pozemek.html?p=Police%7C6242%7CVset%C3%ADn&ll=48.97,15.63',
  'kontakt.html', 'zpravy.html', 'upozorneni.html', 'muj-inzerat.html'];

const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return r.abort();
});
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));

const vsechny = [];
for (const s of STRANKY) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3200);
  const ikony = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('svg').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || r.width > 26 || r.width < 10) return;   // velké značky a mikroikony sem nepatří
      const vb = (el.getAttribute('viewBox') || '').split(/\s+/);
      const sirkaVB = +vb[2];
      if (!sirkaVB) return;
      const kus = el.querySelector('path, circle, rect, line, polyline');
      if (!kus) return;
      const cs = getComputedStyle(kus);
      // Jen tahové ikony; vyplněné značky (logo) nemají co srovnávat.
      if (cs.stroke === 'none' || cs.fill !== 'none') return;
      const tah = parseFloat(cs.strokeWidth) || 0;
      out.push({
        kdo: (el.parentElement.className || '').toString().split(' ')[0] || el.parentElement.tagName.toLowerCase(),
        velikost: Math.round(r.width),
        stopa: +(tah * r.width / sirkaVB).toFixed(2),
      });
    });
    return out;
  });
  ikony.forEach((i) => vsechny.push({ ...i, stranka: s.split('?')[0] }));
  await p.close();
}
await prohlizec.close();

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

// Typický případ ze stránky pozemku: tentýž špendlík na dvou místech.
const poz = vsechny.filter((i) => i.stranka === 'pozemek.html');
const spendliky = poz.filter((i) => i.kdo === 'pz-okres' || i.kdo === 'pz-abtn');
pravda('špendlík u okresu a u odkazu na katastr kreslí stejně',
  spendliky.length >= 2 && Math.abs(spendliky[0].stopa - spendliky[spendliky.length - 1].stopa) <= 0.1,
  JSON.stringify(spendliky));

console.log('\nIkony — jedna sada, jedna tloušťka');
console.log(zpravy.join('\n'));
console.log(`\nzměřeno ${vsechny.length} ikon na ${STRANKY.length} stránkách`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Ikony: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
