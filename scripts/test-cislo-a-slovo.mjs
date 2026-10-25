/* Test: mezi číslem a slovem musí být mezera — i když ji kreslí mřížka.
   ====================================================================
   Spuštění: node scripts/test-cislo-a-slovo.mjs  (prohlížeč, bez sítě)

   PROČ. Na úvodní stránce stálo „14" a vedle „krajů" ve dvou prvcích
   flexboxu s mezerou 8 px. Oko vidělo „14 krajů", jenže v TEXTU
   stránky žádná mezera nebyla:

       <span class="rm-n">14</span><span class="rm-l">krajů</span>

   takže `textContent` dává „14krajů". Komu na tom záleží:
     · odečítač obrazovky přečte „čtrnáctkrajů",
     · kdo si text zkopíruje, dostane „1 942příležitostí na mapě",
     · vyhledávač indexuje slepenec.
   Majitel si toho všiml na snímku obrazovky dřív než kterákoli
   zkouška — a byly to přesně ty tři případy, které ohlásil:
   „14krajů", „5druhů", „18pojmů".

   JAK SE TO SPRAVILO. Mezerou v HTML mezi těmi dvěma prvky. Ve
   flexboxu (i v mřížce) se text, který je jen bílé místo, do
   rozvržení nepočítá — takže se vzhled nezměnil ani o pixel, jen
   `textContent` dává „14 krajů".

   CO SE MĚŘÍ. Projde se každý flex/grid prvek na vzorku stránek a
   hledá se číslice, za kterou hned následuje písmeno. Čísla s
   jednotkou („3 732 m²"), násobky („4× denně") i slepence uvnitř
   jednoho slova (2026-10-23) jsou v pořádku — hledá se slepenec přes
   HRANICI DVOU PRVKŮ, tedy to, co udělá mřížka.
   ==================================================================== */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { BASE, PORT } from './port-zkousky.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Číslo a slovo', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(KOREN, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
  if (!f.startsWith(KOREN) || !existsSync(f) || statSync(f).isDirectory()) { s.statusCode = 404; return s.end('ne'); }
  s.setHeader('content-type', TYPY[path.extname(f)] || 'application/octet-stream');
  s.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const PRAZDNA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block', viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, locale: 'cs-CZ' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return r.abort();
});
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await ctx.route('https://unpkg.com/leaflet@**', (r) => {
  const f = path.join(KOREN, 'vendor', 'leaflet', path.basename(new URL(r.request().url()).pathname));
  return existsSync(f) ? r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) }) : r.abort();
});

/* Vzorek: úvodní stránka, jedna regionální (ty generuje skript, takže
   stačí jedna za všechny), přehled nových a jedna stránka pozemku. */
const STRANKY = ['index.html', 'nove-pozemky.html', 'pozemky-podle-okresu.html'];
const regiony = ['pozemky-okres-benesov.html', 'pozemky-stredocesky-kraj.html'].filter((f) => existsSync(path.join(KOREN, f)));
STRANKY.push(...regiony);

let nalezy = [];
for (const st of STRANKY) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${st}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const v = await p.evaluate(() => {
    const ven = [];
    const chod = (el) => {
      for (const d of el.children) {
        const c = getComputedStyle(d);
        if (/flex|grid/.test(c.display)) {
          const t = (d.textContent || '').replace(/[\s  ]+/g, ' ');
          const m = t.match(/\d(?:[×x])?[a-záčďéěíňóřšťúůýž]{3,}/);
          if (m) ven.push({ sel: d.tagName.toLowerCase()
            + (d.id ? '#' + d.id : '')
            + (typeof d.className === 'string' && d.className ? '.' + d.className.trim().split(/\s+/)[0] : ''),
            ukazka: m[0] });
        }
        if (d.children.length) chod(d);
      }
    };
    chod(document.body);
    const videno = new Set();
    return ven.filter((x) => { const k = x.sel + '|' + x.ukazka; if (videno.has(k)) return false; videno.add(k); return true; });
  });
  if (v.length) nalezy.push(`${st}: ` + v.map((x) => `${x.sel} „${x.ukazka}"`).join(', '));
  await p.close();
}

pravda(`na vzorku ${STRANKY.length} stránek se číslo nikde neslepilo se slovem`, nalezy.length === 0,
  nalezy.join('\n      ') + '\n      Mezi prvek s číslem a prvek s popiskem patří MEZERA v HTML.'
  + ' Ve flexu ani v mřížce se nevykreslí, ale text stránky z ní bude dávat smysl.');
pravda('a bylo na čem měřit (stránky se načetly)', STRANKY.length >= 3, `stránek ${STRANKY.length}`);

await prohlizec.close();
server.close();
console.log('\nČíslo a slovo');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Číslo a slovo: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
