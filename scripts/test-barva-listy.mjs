// Test: barva lišty prohlížeče (theme-color) souhlasí s tím, co je pod ní.
//
// Spuštění: node scripts/test-barva-listy.mjs   (potřebuje prohlížeč)
//
// PROČ VŮBEC. Na mobilu si Chrome i Safari obarví lištu s adresou podle
// <meta name="theme-color">. Web má dva režimy, ale hodnotu měl jednu
// jedinou, statickou, na všech 2153 stránkách: #FBFAF8. Ve světlém
// režimu to byly dvě jednotky vedle, tedy v pořádku. V tmavém svítila
// nad stránkou #0E1A14 téměř bílá lišta — nejnápadnější šev na webu.
//
// JAK SE OVĚŘUJE. Ne porovnáním se zapsaným číslem (to by zkoušelo jen
// to, že jsem dvakrát napsal totéž), ale MĚŘENÍM: udělá se snímek
// hlavičky na mobilní šířce, najde se v něm nejčastější barva ze všech
// pixelů a ta se srovná s tím, co stránka hlásí. Hlavička má
// backdrop-filter, takže pixely kolísají o jednotky — proto se bere
// nejčastější barva a tolerance pár jednotek, ne jediný pixel.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8310;
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
/* PŘEDPOKLAD, ABY KONTROLA NEMOHLA PROJÍT NA PRÁZDNU. Kdyby se sem
   nedostal ani jeden soubor, všechny „žádná stránka nechybí" níž by
   byly pravdivé a zkouška by svítila zeleně nad ničím. */
pravda(`stránek je z čeho brát (${STRANKY.length})`, STRANKY.length >= 2000,
  'našlo se jen ' + STRANKY.length + ' .html — kontroly níž by neměřily nic');

const bezStatickeho = [], bezUryvku = [], spatnePoradi = [], jinaSvetla = [];
const SVETLA = '#F9FAF9', TMAVA = '#17281E';
for (const f of STRANKY) {
  const s = readFileSync(path.join(ROOT, f), 'utf8');
  const iStat = s.indexOf('<meta name="theme-color"');
  const iUryv = s.indexOf("localStorage.getItem('pk_rezim_v1')");
  if (iStat < 0) { bezStatickeho.push(f); continue; }
  if (iUryv < 0) { bezUryvku.push(f); continue; }
  /* Úryvek vkládá svůj meta na konec hlavičky, jaká v té chvíli je —
     tedy PŘED statický, který se teprve rozebere. Prohlížeč bere první
     v pořadí, takže vyhraje vložený. Kdyby se úryvek někdy posunul za
     statický meta, přestane platit vůbec a nikdo si toho nevšimne. */
  if (iUryv > iStat) spatnePoradi.push(f);
  if (s.indexOf(`content="${SVETLA}"`) < 0) jinaSvetla.push(f);
  if (s.indexOf(TMAVA) < 0 || s.indexOf(SVETLA) < 0) bezUryvku.push(f);
}
je('statický theme-color má každá stránka', bezStatickeho.length, 0);
je('a každá umí obě hodnoty', bezUryvku.slice(0, 3), []);
je('úryvek stojí před statickým meta', spatnePoradi.slice(0, 3), []);
je('statická hodnota je ta světlá (pro případ, že skripty neběží)', jinaSvetla.slice(0, 3), []);

/* --- 2) Server a prohlížeč ----------------------------------------- */
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

async function zmer(rezim, stranka, bezRezimu) {
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  /* S VYPNUTÝM rezim.js SE MĚŘÍ TEN VLOŽENÝ ÚRYVEK, A JEN ON.
     Přistiženo sabotáží: přepsal jsem v úryvku tmavou hodnotu na bílou
     a měření v prohlížeči zůstalo zelené — protože rezim.js se spustí
     o chvíli později a meta přepíše na správnou hodnotu. Jenže právě
     tu chvíli předtím lišta svítí, a to je celý smysl úryvku. Když se
     rezim.js nepodstrčí prázdný, zkouška měří pokaždé jen jeho. */
  if (bezRezimu) await ctx.route('**/rezim.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  const p = await ctx.newPage();
  await p.addInitScript(`try{localStorage.setItem('pk_rezim_v1','${rezim}')}catch(e){}`);
  await p.goto(`http://127.0.0.1:${PORT}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  const stav = await p.evaluate(() => {
    const vse = [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content'));
    const r = document.getElementById('header').getBoundingClientRect();
    return { prvni: vse[0] || null, kolik: vse.length, h: Math.max(1, Math.round(r.height)) };
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
  return Object.assign(stav, mereni);
}

function hex(rgb) { return '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(); }
function naHex(s) { return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)); }
function odchylka(a, b) { return Math.max(...a.map((x, i) => Math.abs(x - b[i]))); }

for (const rezim of ['light', 'dark']) {
  const m = await zmer(rezim, 'index.html');
  /* Zase předpoklady první: hlavička musí mít co měřit a převládající
     barva musí opravdu převládat. Bez toho by „odchylka je malá"
     vycházela i nad jednobarevným nic. */
  pravda(`${rezim}: hlavička má co měřit (${m.pixelu} pixelů)`, m.pixelu >= 20000, 'jen ' + m.pixelu);
  pravda(`${rezim}: převládající barva opravdu převládá (${(100 * m.podil).toFixed(1)} %)`,
    m.podil >= 0.10, 'jen ' + (100 * m.podil).toFixed(1) + ' %');
  pravda(`${rezim}: režim platí, obě hodnoty jsou k mání (${m.kolik} meta)`, m.kolik >= 2,
    'našel se jen ' + m.kolik + ' theme-color — vložený úryvek neběžel?');
  pravda(`${rezim}: lišta hlásí ${m.prvni}, hlavička je ${hex(m.barva)}`,
    m.prvni && odchylka(naHex(m.prvni), m.barva) <= 3,
    'odchylka ' + (m.prvni ? odchylka(naHex(m.prvni), m.barva) : '—') + ' jednotek na kanál');
  pravda(`${rezim}: a je to ta hodnota pro tenhle režim`,
    (m.prvni || '').toUpperCase() === (rezim === 'dark' ? TMAVA : SVETLA),
    'vyšlo ' + m.prvni);
}

/* --- 2b) Jen vložený úryvek, bez rezim.js -------------------------- */
/* Tohle je ta hodnota, kterou prohlížeč vidí při PRVNÍM vykreslení —
   tedy ta, kvůli které úryvek v hlavičce vůbec je. */
for (const rezim of ['light', 'dark']) {
  const m = await zmer(rezim, 'index.html', true);
  pravda(`${rezim}: bez rezim.js je lišta ${m.prvni} a hlavička ${hex(m.barva)}`,
    m.prvni && odchylka(naHex(m.prvni), m.barva) <= 3,
    'odchylka ' + (m.prvni ? odchylka(naHex(m.prvni), m.barva) : '—') + ' jednotek na kanál');
  pravda(`${rezim}: a sedí už od prvního vykreslení`,
    (m.prvni || '').toUpperCase() === (rezim === 'dark' ? TMAVA : SVETLA), 'vyšlo ' + m.prvni);
}

/* --- 3) Přepnutí za běhu ------------------------------------------- */
/* Vložený úryvek řeší první vykreslení. Tohle je ta druhá polovina:
   když si člověk režim přepne tlačítkem, musí se lišta přebarvit s ním,
   jinak zůstane podle toho, v čem stránka načetla. */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  const p = await ctx.newPage();
  await p.addInitScript("try{localStorage.setItem('pk_rezim_v1','light')}catch(e){}");
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const prvni = () => p.evaluate(() => {
    const m = document.querySelector('meta[name="theme-color"]');
    return { barva: m && m.getAttribute('content'), rezim: document.documentElement.getAttribute('data-theme') };
  });
  const pred = await prvni();
  je('před přepnutím světlá', pred, { barva: SVETLA, rezim: 'light' });
  const tl = await p.$('#pk-rezim button, #pk-rezim [role="button"]');
  pravda('přepínač režimu na stránce je', !!tl, 'v #pk-rezim není co zmáčknout');
  if (tl) {
    await tl.click();
    await p.waitForTimeout(300);
    const po = await prvni();
    je('po přepnutí tmavá — i lišta', po, { barva: TMAVA, rezim: 'dark' });
  }
  await ctx.close();
}

await prohlizec.close();
srv.close();

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
