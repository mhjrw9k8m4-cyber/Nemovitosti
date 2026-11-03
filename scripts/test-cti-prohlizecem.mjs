/* Čtení prohlížečem: vidí text, který skládá skript — a drží robots
   ==================================================================
   Spuštění: PW_CHROMIUM=… node scripts/test-cti-prohlizecem.mjs

   CO SE MĚŘÍ, A NAOSTRO. Vlastní server (bez sítě, jen 127.0.0.1)
   servíruje stránku, kde je v HTML jediná věta a PODMÍNKY se vloží
   až skriptem. Pak se čte dvakrát: obyčejně a prohlížečem.

   Tím se zkouší to, co 3. 11. naostro zastavilo sondu u Bezrealitek,
   u elektronickedrazby.cz a u ÚZSVM — „stránka se vykresluje až
   v prohlížeči".

   A hlavně se měří, co se tím NESMÍ ztratit: robots.txt platí i pro
   podřízené soubory (co se nesmí, se zahodí, a je vidět kolik) a cizí
   host se nestahuje vůbec.
   ================================================================== */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { tvorProhlizec, stejnyWeb } from './cti-prohlizecem.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const VETA = 'Je zakázáno obsah serveru vytěžovat automatizovanými prostředky, zejména roboty.';
const STRANKA = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Podmínky</title></head>
<body><h1>Smluvní podmínky</h1><p id="t">Načítám…</p>
<img src="/obrazek.png" alt=""><script src="/podminky.js"></script>
<script src="https://cizi.example.org/mereni.js"></script></body></html>`;
const SKRIPT = `document.getElementById('t').textContent = ${JSON.stringify(VETA)};`;

/* Server si pamatuje, co si u něj kdo vyžádal — na tom se pozná, že
   se zahozené soubory opravdu nestahovaly, ne jen nepoužily. */
const dotazy = [];
const server = http.createServer((req, res) => {
  dotazy.push(req.url);
  if (req.url === '/podminky') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(STRANKA); }
  if (req.url === '/podminky.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end(SKRIPT); }
  if (req.url === '/obrazek.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.alloc(8)); }
  res.writeHead(404); res.end('nic');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

pravda('stejný web se pozná i přes www a podřízenou část',
  stejnyWeb('www.x.cz', 'x.cz') && stejnyWeb('api.x.cz', 'x.cz') && !stejnyWeb('x.cz', 'y.cz'));

/* 1) OBYČEJNÉ ČTENÍ tu větu nenajde — kdyby ano, neměřilo by se nic. */
const holeHtml = await (await fetch(`${BASE}/podminky`)).text();
pravda('v samotném HTML ta věta NENÍ (jinak by zkouška nic neměřila)',
  !holeHtml.includes('vytěžovat'), 'v HTML je „Načítám…", text vkládá skript');

/* 2) PROHLÍŽEČEM se najde. */
{
  const p = await tvorProhlizec({ chromium, smiCist: async () => true, ua: 'zkouska' });
  try {
    const v = await p.vykresli(`${BASE}/podminky`);
    pravda('prohlížečem se text složený skriptem přečte',
      v.text.includes('vytěžovat') && v.html.includes('vytěžovat'),
      'text: ' + v.text.replace(/\s+/g, ' ').slice(0, 120));
    pravda('a cizí host se nestahuje vůbec',
      v.cizich >= 1 && !dotazy.some((u) => /mereni/.test(u)),
      `cizích zahozeno ${v.cizich}, dotazy: ${dotazy.join(' ')}`);
  } finally { await p.zavri(); }
}

/* 3) CO ROBOTS.TXT NEDOVOLUJE, SE ZAHODÍ — i když je to podřízený
      soubor, bez kterého se stránka nevykreslí. Právě tohle je ta
      přísnější část: obyčejný prohlížeč by si ho stáhl. */
{
  dotazy.length = 0;
  const p = await tvorProhlizec({ chromium, ua: 'zkouska',
    smiCist: async (url) => !/podminky\.js$/.test(url) });
  try {
    const v = await p.vykresli(`${BASE}/podminky`);
    pravda('zakázaný podřízený soubor se nestáhne',
      !dotazy.some((u) => u === '/podminky.js'), 'dotazy: ' + dotazy.join(' '));
    pravda('a je vidět, kolik požadavků se kvůli robots.txt zahodilo',
      v.zablokovano >= 1, 'zablokováno ' + v.zablokovano);
    pravda('text pak chybí — a to se nesmí vydávat za „nic tam není"',
      !v.text.includes('vytěžovat'), v.text.replace(/\s+/g, ' ').slice(0, 80));
  } finally { await p.zavri(); }
}

/* 4) Bez prohlížeče se nic nepředstírá. */
{
  let padlo = '';
  try { await tvorProhlizec({ smiCist: async () => true }); }
  catch (e) { padlo = String(e.message || e); }
  pravda('bez předaného prohlížeče to řekne nahlas', /bez prohlížeče/.test(padlo), padlo);
}

server.close();
console.log('\nČtení prohlížečem');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.error(`::error::Čtení prohlížečem: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
