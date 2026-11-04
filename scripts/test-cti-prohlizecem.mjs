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
import { tvorProhlizec, stejnyWeb, zahozene, STROP_JMEN } from './cti-prohlizecem.mjs';

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

/* APLIKACE, KTERÁ SI OBSAH DOTAHUJE SAMA. Na ní se měří to, co 4. 11.
   rozhodlo u ÚZSVM: ve vykresleném HTML nabídky nejsou, takže ze
   stránky se čtečka napsat nedá — zjistit se ale dá, ODKUD si ta
   stránka data bere, a to je právě adresa, kterou čtečka potřebuje. */
const APLIKACE = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Aplikace</title></head>
<body><div id="v">Načítám…</div><script>
fetch('/api/nabidky').then((r) => r.json()).then((d) => {
  document.getElementById('v').textContent = 'nabídek: ' + d.pocet;
});
</script></body></html>`;

/* Stránka s PŘEBYTKEM cizích hostů: na ní se měří, že strop jmen drží
   a že se přitom nelže o počtu zahozených požadavků. */
const MNOHO = 10;
const STRANKA_MNOHO = '<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>M</title></head><body>'
  + Array.from({ length: MNOHO }, (_, i) => `<script src="https://m${i}.example.org/x.js"></script>`).join('')
  + '</body></html>';

/* Server si pamatuje, co si u něj kdo vyžádal — na tom se pozná, že
   se zahozené soubory opravdu nestahovaly, ne jen nepoužily. */
const dotazy = [];
const server = http.createServer((req, res) => {
  dotazy.push(req.url);
  if (req.url === '/podminky') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(STRANKA); }
  if (req.url === '/podminky.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end(SKRIPT); }
  if (req.url === '/mnoho') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(STRANKA_MNOHO); }
  if (req.url === '/obrazek.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.alloc(8)); }
  if (req.url === '/aplikace') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(APLIKACE); }
  if (req.url === '/api/nabidky') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"pocet":3}'); }
  res.writeHead(404); res.end('nic');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

pravda('stejný web se pozná i přes www a podřízenou část',
  stejnyWeb('www.x.cz', 'x.cz') && stejnyWeb('api.x.cz', 'x.cz') && !stejnyWeb('x.cz', 'y.cz'));
/* ZA gov.cz UŽ ZAČÍNÁ CIZÍ ÚŘAD. Změřeno 3. 11.: `stejnyWeb` brala
   dvě poslední části jména za domému, takže `cizi-urad.gov.cz`
   vycházel jako TÝŽ web jako `nabidkamajetku.gov.cz` — a jeho
   podřízené soubory by se stahovaly pod cizím robots.txt. Právě na
   gov.cz se přitom má začít čist (nález sondy u ÚZSVM), takže to
   nebyla teorie. */
pravda('ale za vícedílnou příponou (gov.cz, co.uk) už je to cizí web',
  !stejnyWeb('cizi-urad.gov.cz', 'nabidkamajetku.gov.cz')
  && !stejnyWeb('x.co.uk', 'y.co.uk')
  && stejnyWeb('api.nabidkamajetku.gov.cz', 'nabidkamajetku.gov.cz')
  && stejnyWeb('www.nabidkamajetku.gov.cz', 'nabidkamajetku.gov.cz'),
  'gov.cz cizí: ' + stejnyWeb('cizi-urad.gov.cz', 'nabidkamajetku.gov.cz')
  + ', podřízená část: ' + stejnyWeb('api.nabidkamajetku.gov.cz', 'nabidkamajetku.gov.cz'));
pravda('a .cz a .gov.cz téhož jména jsou dva různé weby (ÚZSVM)',
  !stejnyWeb('nabidkamajetku.gov.cz', 'nabidkamajetku.cz'),
  'jinak by se pod robots.txt jednoho čet obsah druhého');

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
    /* PROČ JMENOVITĚ. „8 cizích hostů" u ÚZSVM neodpovědělo na nic.
       Jméno rozhodne, jestli to byla měřidla, nebo vlastní datové
       rozhraní na sousední doméně — tedy druhá cesta ke zdroji. */
    pravda('a je vidět, KTERÝ cizí host to byl',
      (v.cizinci || []).some((c) => c.co === 'cizi.example.org' && c.kolik >= 1),
      'cizinci: ' + JSON.stringify(v.cizinci));
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
    pravda('a je vidět, KTEROU cestu robots.txt nedovolil',
      (v.zakazane || []).some((z) => z.co === '/podminky.js'),
      'zakázané: ' + JSON.stringify(v.zakazane));
    pravda('text pak chybí — a to se nesmí vydávat za „nic tam není"',
      !v.text.includes('vytěžovat'), v.text.replace(/\s+/g, ' ').slice(0, 80));
  } finally { await p.zavri(); }
}

/* 3b) STROP JMEN drží, ale POČET se o něj nekrátí. Kdyby se krátil
       obojí, nález by tvrdil, že cizích hostů bylo osm, i když jich
       bylo sto. */
{
  const p = await tvorProhlizec({ chromium, smiCist: async () => true, ua: 'zkouska' });
  try {
    const v = await p.vykresli(`${BASE}/mnoho`);
    pravda(`jmen zahozených hostů se zapíše nejvýš ${STROP_JMEN}`,
      STROP_JMEN < MNOHO && (v.cizinci || []).length === STROP_JMEN,
      `jmen ${(v.cizinci || []).length}, strop ${STROP_JMEN}, na stránce ${MNOHO}`);
    pravda('ale počet zahozených požadavků se stropem nekrátí',
      v.cizich >= MNOHO, `zahozeno ${v.cizich}, na stránce ${MNOHO}`);
  } finally { await p.zavri(); }
}

/* 3c) Prázdné seznamy se do nálezu nepíšou — ať nenafukují soubor. */
pravda('prázdný seznam se do nálezu nezapíše',
  !('cizinci' in zahozene({ zablokovano: 0, cizich: 0, cizinci: [], zakazane: [] }))
  && zahozene({ cizich: 2, cizinci: [{ co: 'a.cz', kolik: 2 }] }).cizinci.length === 1,
  JSON.stringify(zahozene({ zablokovano: 0, cizich: 0, cizinci: [], zakazane: [] })));

/* 3d) DATOVÉ ODPOVĚDI: odkud si stránka bere obsah ---------------
   U aplikace je tohle jediná použitelná odpověď na „dá se z toho čist
   zdroj?". Měří se, že se ta adresa opravdu vypíše, že se nevypisují
   obrázky, a že to nic nestahuje navíc. */
{
  const { vypisDatove } = await import('./ohledej.mjs');
  const p = await tvorProhlizec({ chromium, smiCist: async () => true, ua: 'zkouska' });
  try {
    const v = await p.vykresli(`${BASE}/aplikace`);
    pravda('v HTML aplikace nabídky nejsou (jinak by zkouška nic neměřila)',
      !APLIKACE.includes('nabídek: 3'));
    pravda('ale prohlížečem je vidět, že se obsah dotáhl',
      /nabídek: 3/.test(v.text || ''), (v.text || '').slice(0, 80));
    const d = v.datove || [];
    pravda('a je vypsaná ADRESA, ze které si data vzala',
      d.some((o) => /\/api\/nabidky$/.test(o.url) && o.stav === 200 && /json/i.test(o.typ)),
      JSON.stringify(d));
    pravda('obrázek ani skript se mezi datové odpovědi nepletou',
      !d.some((o) => /obrazek\.png|podminky\.js/.test(o.url)), JSON.stringify(d));
    const radky = vypisDatove(d).join('\n');
    pravda('a výpis tu adresu ukáže člověku', /\/api\/nabidky/.test(radky), radky);
    pravda('a když si stránka nic nedotahuje, řekne se to slovy',
      /ŽÁDNÁ DATOVÁ ODPOVĚĎ/.test(vypisDatove([]).join('\n')));
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
