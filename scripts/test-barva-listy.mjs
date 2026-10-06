// Test: barva lišty prohlížeče (theme-color) souhlasí s tím, co je pod ní.
//
// Spuštění: node scripts/test-barva-listy.mjs   (potřebuje prohlížeč)
//
// PROČ. Na mobilu si Chrome i Safari obarví lištu s adresou podle
// <meta name="theme-color">. Když se nerovná tomu, co je hned pod ní,
// vznikne nahoře pruh cizí barvy.
//
// CO SE ZMĚNILO: web míval dva režimy a tahle zkouška hlídala, že se
// barva lišty přepíná s nimi — vložený úryvek v hlavičce před prvním
// vykreslením a rezim.js při přepnutí. Tmavý režim je pryč celý, takže
// zbyla jedna jediná statická hodnota. Zbyla ale i ta otázka, kvůli
// které zkouška vznikla, a ta se nezměnila: SEDÍ ta hodnota?
//
// Ověřuje se měřením, ne porovnáním se zapsaným číslem — jinak by to
// zkoušelo jen to, že jsem dvakrát napsal totéž. Udělá se snímek
// hlavičky na mobilní šířce a najde se v něm nejčastější barva.
// Hlavička má backdrop-filter, takže pixely kolísají o jednotky —
// proto nejčastější barva a tolerance pár jednotek, ne jediný pixel.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8310;
const SVETLA = '#F9FAF9';
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, v, proc) {
  if (v) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function je(popis, vyslo, cekano) {
  pravda(popis, JSON.stringify(vyslo) === JSON.stringify(cekano),
    `čekáno ${JSON.stringify(cekano)}, vyšlo ${JSON.stringify(vyslo)}`);
}

/* --- 1) Co stránky hlásí ------------------------------------------- */
const STRANKY = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
/* PŘEDPOKLAD, ABY KONTROLA NEMOHLA PROJÍT NA PRÁZDNU. */
pravda(`stránek je z čeho brát (${STRANKY.length})`, STRANKY.length >= 2000,
  'našlo se jen ' + STRANKY.length);

const bez = [], jina = [], vic = [];
for (const f of STRANKY) {
  const s = readFileSync(path.join(ROOT, f), 'utf8');
  const vsechny = [...s.matchAll(/<meta name="theme-color" content="([^"]*)">/g)].map((m) => m[1]);
  if (!vsechny.length) { bez.push(f); continue; }
  /* JEDNA HODNOTA, NE DVĚ. Dokud web měl tmavý režim, vkládal úryvek
     v hlavičce druhý meta a prohlížeč bral první v pořadí. Teď je
     režim jeden — a dva theme-color na stránce by znamenaly, že po
     odstranění něco zůstalo viset. */
  if (vsechny.length > 1) vic.push(`${f}: ${vsechny.length}×`);
  if (vsechny[0] !== SVETLA) jina.push(`${f}: ${vsechny[0]}`);
}
je('theme-color má každá stránka', bez.slice(0, 3), []);
je('a právě jeden', vic.slice(0, 3), []);
je('a všechny tutéž hodnotu', jina.slice(0, 3), []);

/* --- 2) Sedí s hlavičkou ------------------------------------------- */
const TYPY = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };
const srv = createServer((q, s) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(ROOT) || !existsSync(f) || !statSync(f).isFile()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': TYPY[path.extname(f)] || 'application/octet-stream' });
  s.end(readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});
const p = await ctx.newPage();
await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(700);
const stav = await p.evaluate(() => {
  const m = document.querySelector('meta[name="theme-color"]');
  const r = document.getElementById('header').getBoundingClientRect();
  return { hlasi: m ? m.getAttribute('content') : null, h: Math.max(1, Math.round(r.height)) };
});
const png = (await p.screenshot({ clip: { x: 0, y: 0, width: 390, height: stav.h } })).toString('base64');
const mereni = await p.evaluate(async (b64) => {
  const im = new Image();
  await new Promise((r) => { im.onload = r; im.src = 'data:image/png;base64,' + b64; });
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const pocty = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
    pocty.set(k, (pocty.get(k) || 0) + 1);
  }
  const [klic, n] = [...pocty.entries()].sort((a, b) => b[1] - a[1])[0];
  return { barva: klic.split(',').map(Number), podil: n / (c.width * c.height), pixelu: c.width * c.height };
}, png);
await ctx.close();
await prohlizec.close();
srv.close();

const hex = (rgb) => '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
const naHex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const odchylka = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

/* Zase předpoklady první: hlavička musí mít co měřit a převládající
   barva musí opravdu převládat. */
pravda(`hlavička má co měřit (${mereni.pixelu} pixelů)`, mereni.pixelu >= 20000, 'jen ' + mereni.pixelu);
pravda(`převládající barva opravdu převládá (${(100 * mereni.podil).toFixed(1)} %)`,
  mereni.podil >= 0.10, 'jen ' + (100 * mereni.podil).toFixed(1) + ' %');
pravda(`lišta hlásí ${stav.hlasi}, hlavička je ${hex(mereni.barva)}`,
  stav.hlasi && odchylka(naHex(stav.hlasi), mereni.barva) <= 3,
  'odchylka ' + (stav.hlasi ? odchylka(naHex(stav.hlasi), mereni.barva) : '—') + ' jednotek na kanál');

console.log('\nBarva lišty prohlížeče (theme-color)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 8)) {
    console.log('::error::Barva lišty: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  console.log('::error::Barva lišty: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
