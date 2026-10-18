/* Test: stahování ze zdrojů přežije výpadek, a neotravuje, když nemá.
   ====================================================================
   Spuštění: node scripts/test-stahovani.mjs   (bez sítě, bez prohlížeče)

   PROČ. Robot běží jednou za šest hodin a každý zdroj si dřív volal
   fetch() po svém: osm volání nemělo časový limit a žádné se
   neopakovalo. Jedno 503 nebo jeden zavřený socket tím vyřadil celý
   zdroj na šest hodin — a ve statistice to vypadalo jako „zdroj dnes
   nic nenabídl", ne jako výpadek.

   Teď jde všechno přes stahni(). Tahle zkouška mu podstrčí vlastní
   fetch() a hlídá čtyři věci, které jdou proti sobě:
     · po chybě to zkusí znovu,
     · ale NE po 403/404 — tam by druhý pokus jen přitížil cizímu
       serveru a odpověď by byla stejná,
     · počká si, a když server pošle Retry-After, řídí se JÍM,
     · a po poslední marné zkoušce chybu vyhodí, ne spolkne.
   ==================================================================== */
import { stahni, cekaniPoPokusu, jeOpakovatelny, BOT_UA, STAHNI_CEKANI_STROP }
  from './fetch-opportunities.mjs';
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Falešná odpověď: jen to, čeho se stahni() dotýká. `telo.zavreno`
   si pamatuje, jestli se nedočtené tělo pustilo — viz zkouška níž. */
const odpoved = (stav, hlavicky = {}) => {
  const stav_tela = { zavreno: false };
  return {
    status: stav, statusText: 'test', ok: stav >= 200 && stav < 300,
    headers: { get: (k) => hlavicky[String(k).toLowerCase()] ?? null },
    body: { cancel: async () => { stav_tela.zavreno = true; } },
    telo: stav_tela,
  };
};

/* Podstrčený fetch, který si pamatuje, jak a kolikrát byl zavolán. */
function falesnyFetch(odpovedi) {
  const volani = [];
  const puvodni = globalThis.fetch;
  globalThis.fetch = async (url, volby) => {
    volani.push({ url: String(url), volby });
    const dalsi = odpovedi[Math.min(volani.length - 1, odpovedi.length - 1)];
    if (dalsi instanceof Error) throw dalsi;
    if (typeof dalsi === 'function') return dalsi(volani.length);
    return dalsi;
  };
  return { volani, vrat: () => { globalThis.fetch = puvodni; } };
}

// --- 1) Když to projde napoprvé, nic se neopakuje -------------------
{
  const f = falesnyFetch([odpoved(200)]);
  const r = await stahni('https://priklad.cz/a', { cekaniNasobek: 0 });
  f.vrat();
  pravda('povedené stažení se neopakuje', f.volani.length === 1 && r.status === 200,
    `volání: ${f.volani.length}, stav: ${r.status}`);
  pravda('a robot se představí jménem', /ParcelkaBot/.test(String(f.volani[0].volby.headers['user-agent'])),
    `hlavička: ${JSON.stringify(f.volani[0].volby.headers)}`);
  pravda('každý pokus má časový limit (zaseknuté spojení nedrží úlohu)',
    !!f.volani[0].volby.signal, 'volání šlo bez signálu — nic ho nepřeruší');
}

// --- 2) Dočasná chyba se zkouší znovu -------------------------------
{
  const f = falesnyFetch([odpoved(503), odpoved(503), odpoved(200)]);
  const r = await stahni('https://priklad.cz/b', { cekaniNasobek: 0 });
  f.vrat();
  pravda('po 503 to zkusí znovu a dojde si pro data', f.volani.length === 3 && r.status === 200,
    `volání: ${f.volani.length}, stav: ${r.status}`);
}
{
  const f = falesnyFetch([new Error('ECONNRESET'), odpoved(200)]);
  const r = await stahni('https://priklad.cz/c', { cekaniNasobek: 0 });
  f.vrat();
  pravda('a stejně tak po přetržené síti', f.volani.length === 2 && r.status === 200,
    `volání: ${f.volani.length}`);
}

// --- 2b) Nedočtené tělo se pustí, než se zkusí znovu ----------------
/* Tělo, které se nepřečte, drží spojení. Při osmi souběžných dělnících
   a opakování by se zásoba spojení vyčerpala a robot by se zasekl na
   něčem, co vypadá jako pomalá síť. */
{
  const prvni = odpoved(503);
  const f = falesnyFetch([prvni, odpoved(200)]);
  await stahni('https://priklad.cz/b2', { cekaniNasobek: 0 });
  f.vrat();
  pravda('nedočtené tělo se před dalším pokusem pustí', prvni.telo.zavreno,
    'spojení zůstalo viset na nepřečteném těle');
}

// --- 3) Trvalá odpověď se neopakuje ---------------------------------
for (const stav of [403, 404, 410]) {
  const f = falesnyFetch([odpoved(stav)]);
  const r = await stahni('https://priklad.cz/d', { cekaniNasobek: 0 });
  f.vrat();
  pravda(`na ${stav} se neklepe podruhé`, f.volani.length === 1 && r.status === stav,
    `volání: ${f.volani.length}`);
}

// --- 4) Když se nepovede ani poslední pokus, chyba vyletí -----------
{
  const f = falesnyFetch([new Error('síť spadla')]);
  let vyletelo = null;
  try { await stahni('https://priklad.cz/e', { cekaniNasobek: 0 }); }
  catch (e) { vyletelo = e; }
  f.vrat();
  pravda('marné stahování skončí chybou, ne tichem', !!vyletelo && f.volani.length === 3,
    `chyba: ${vyletelo && vyletelo.message}, volání: ${f.volani.length}`);
}

// --- 5) Kolik se čeká ----------------------------------------------
pravda('čekání roste exponenciálně', cekaniPoPokusu(1) >= 1000 && cekaniPoPokusu(2) >= 2000
  && cekaniPoPokusu(2) > cekaniPoPokusu(1),
  `1. ${cekaniPoPokusu(1)} ms, 2. ${cekaniPoPokusu(2)} ms`);
pravda('ale nikdy přes strop', cekaniPoPokusu(9) <= STAHNI_CEKANI_STROP,
  `${cekaniPoPokusu(9)} ms`);
pravda('Retry-After ve vteřinách přebije vlastní odpočet',
  cekaniPoPokusu(1, '12') >= 12000, `${cekaniPoPokusu(1, '12')} ms`);
pravda('Retry-After jako datum se taky přečte',
  cekaniPoPokusu(1, new Date(Date.now() + 9000).toUTCString()) >= 8000,
  `${cekaniPoPokusu(1, new Date(Date.now() + 9000).toUTCString())} ms`);
pravda('nesmysl v Retry-After nic nerozbije',
  cekaniPoPokusu(1, 'někdy') >= 1000, `${cekaniPoPokusu(1, 'někdy')} ms`);
/* Kdyby server poslal Retry-After: 3600, nebudeme čekat hodinu —
   strop platí i na něj, jinak by jeden zdroj zabral celý běh. */
pravda('ani Retry-After neumí čekání natáhnout přes strop',
  cekaniPoPokusu(1, '3600') === STAHNI_CEKANI_STROP, `${cekaniPoPokusu(1, '3600')} ms`);

// --- 6) Retry-After se opravdu použije při opakování ----------------
{
  const f = falesnyFetch([odpoved(429, { 'retry-after': '2' }), odpoved(200)]);
  const start = Date.now();
  // cekaniNasobek je tu 0.01: 2 000 ms × 0,01 = 20 ms. Měří se, že se
  // vzalo číslo ze serveru (2 s), ne vlastní odpočet (1 s) — poměr
  // zůstává, jen se zkrátí, aby zkouška neběžela vteřiny.
  await stahni('https://priklad.cz/f', { cekaniNasobek: 0.01 });
  const trvalo = Date.now() - start;
  f.vrat();
  pravda('po 429 se čeká podle serveru', f.volani.length === 2 && trvalo >= 18,
    `volání: ${f.volani.length}, čekalo se ${trvalo} ms (čekáno ≥ 18)`);
}

// --- 7) Seznam stavů, které má smysl opakovat ----------------------
pravda('opakovatelné stavy sedí', [408, 425, 429, 500, 502, 503, 504].every(jeOpakovatelny)
  && ![200, 301, 400, 401, 403, 404, 410, 422].some(jeOpakovatelny),
  'seznam se rozešel s tím, co se opravdu opakuje');

// --- 8) Jméno robota je jedno, a pravdivé --------------------------
pravda('robot má jedno jméno a vede na web', /^ParcelkaBot\/\d/.test(BOT_UA) && /parcelaka\.cz/.test(BOT_UA),
  `BOT_UA = ${BOT_UA}`);

// --- 9) A nikdo nesmí chodit mimo ----------------------------------
/* Celý smysl helperu je v tom, že JÍM VEDE KAŽDÉ STAŽENÍ. Kdyby si
   příští zdroj zavolal fetch() po svém, neměl by ani časový limit, ani
   opakování — a nepoznalo by se to, protože by to normálně fungovalo.
   Dokud nespadne síť. Proto se počítá, kolik holých fetch() ve zdroji
   zbylo: jediné povolené je to uvnitř stahni(). */
{
  const zdroj = readFileSync(new URL('./fetch-opportunities.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const holych = (zdroj.match(/(?<![.\w])fetch\s*\(/g) || []).length;
  pravda('ve scraperu zbylo jediné holé fetch() — to uvnitř stahni()', holych === 1,
    `holých volání fetch(): ${holych}. Nový zdroj má volat stahni(), jinak je bez `
    + 'časového limitu i bez opakování.');
}

console.log('\nStahování ze zdrojů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Stahování: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
