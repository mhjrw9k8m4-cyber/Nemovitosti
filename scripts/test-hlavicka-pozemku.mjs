// Test: hlavička stránky pozemku — nadpis, titulek, řádek s místem.
//
// Spuštění: PW_CHROMIUM=… node scripts/test-hlavicka-pozemku.mjs
//
// Je to první obrazovka, kterou člověk z vyhledávače uvidí.
//
// NALEZENO MĚŘENÍM v prohlížeči. Stránka pozemku existuje ve dvou
// podobách: ta servírovaná (statická, pro vyhledávače a pro toho, kdo
// nemá JavaScript) a ta vykreslená, kterou js/pozemek.js postaví na
// její místo. Nadpisy se rozcházely:
//
//   servírovaný <h1>:  „Trvalý travní porost 4 889 m² — Bystřice"
//   vykreslený <h1>:   „Bystřice"
//
// To druhé je jméno obce, a to sdílí víc nabídek: 1 269 z 1 941
// stránek (65 %) mělo po vykreslení nadpis shodný s nějakou jinou
// stránkou — osmnáct se jich jmenovalo „Slatina". A protože
// vyhledávač stránku vykresluje, je to ten horší z obou, který se
// počítá. Totéž u <title>: servírovaný titulek skript přepisoval na
// „Bystřice — 190 550 Kč · Parcelka".
//
// Nadpis se proto skládá JEDNOU, v generátoru, a do stránky se vkládá
// ostrůvkem — stejně jako vzdálenosti, obec a srovnatelné pozemky.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { chromium } from 'playwright-core';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const bezNbsp = (s) => String(s == null ? '' : s).replace(/ /g, ' ');
const cti = (f) => bezNbsp(readFileSync(path.join(KOREN, f), 'utf8'));

const vsechny = readdirSync(KOREN).filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f));
/* Ukončené stránky se sem nepočítají: nabídka v datech není, takže
   nemají co vykreslovat a statická část na nich zůstane celá i s
   nadpisem. Hlídá je scripts/test-ukoncena-v-prohlizeci.mjs. */
const ukoncene = vsechny.filter((f) => /class="pz-konec"/.test(cti(f)));
const stranky = vsechny.filter((f) => !ukoncene.includes(f));
console.log(`Stránek pozemků: ${vsechny.length} (živých ${stranky.length}, ukončených ${ukoncene.length})`);
pravda('je co měřit — živé stránky pozemků se našly', stranky.length >= 500,
  `našlo se ${stranky.length}`);
/* Ostrůvek musí mít KAŽDÁ živá stránka. Kdyby se generátor rozbil
   a přestal ho psát, nadpis by tiše spadl zpátky na jméno obce
   a kontroly níž by neměly co porovnávat. */
{
  const bez = stranky.filter((f) => cti(f).indexOf('id="pz-titul-data"') < 0);
  pravda('a každá z nich nese ostrůvek s nadpisem', bez.length === 0,
    `${bez.length} bez něj, např. ${bez.slice(0, 3).join(', ')}`);
}

// ---- 1) servírovaná podoba: čtyři místa, jeden nadpis -------------
const nadpisy = new Map();   // soubor → titul
const nesedi = [];
for (const f of stranky) {
  const h = cti(f);
  const h1 = (h.match(/<article class="pz-staticky"><h1>(.*?)<\/h1>/) || [])[1];
  const titulek = (h.match(/<title>(.*?)<\/title>/) || [])[1];
  const ostruvek = (h.match(/<script type="application\/json" id="pz-titul-data">(.*?)<\/script>/) || [])[1];
  let zOstruvku = null;
  try { zOstruvku = JSON.parse(ostruvek); } catch (e) { /* zůstane null */ }
  if (!h1 || !titulek || typeof zOstruvku !== 'string') {
    nesedi.push(`${f}: h1=${!!h1} title=${!!titulek} ostrůvek=${typeof zOstruvku}`);
    continue;
  }
  if (h1 !== zOstruvku || titulek !== `${h1} | Parcelka`) {
    nesedi.push(`${f}: h1 „${h1}" / ostrůvek „${zOstruvku}" / title „${titulek}"`);
    continue;
  }
  nadpisy.set(f, h1);
}
pravda('servírovaný nadpis, titulek stránky a ostrůvek nesou týž text',
  nesedi.length === 0, `${nesedi.length}×, např. ${nesedi.slice(0, 2).join(' || ')}`);

// ---- 2) nadpis skoro nikdy nesdílí znění s jinou stránkou ---------
/* Nadpis je to, co o stránce říká vyhledávač. Když ho sdílí dvacet
   stránek, je to pro něj dvacetkrát táž stránka. Pár shod zbývá:
   tatáž výměra téhož druhu v téže obci se rozlišit nedá jinak než
   cenou a ta do nadpisu nepatří. */
{
  const pocty = {};
  for (const t of nadpisy.values()) pocty[t] = (pocty[t] || 0) + 1;
  const sdilenych = [...nadpisy.values()].filter((t) => pocty[t] > 1).length;
  const podil = sdilenych / Math.max(1, nadpisy.size);
  pravda('nadpis sdílí znění s jinou stránkou nejvýš u 5 % stránek',
    podil <= 0.05,
    `${sdilenych} z ${nadpisy.size} (${(podil * 100).toFixed(0)} %) — `
    + 'před opravou to bylo 65 % (nadpisem bylo jen jméno obce)');
}

// ---- 3) vykreslená podoba říká totéž ------------------------------
const TYPY = { '.html': 'text/html;charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.xml': 'application/xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(KOREN, p);
  if (!f.startsWith(KOREN)) { res.writeHead(403); return res.end(); }
  let telo;
  try { telo = readFileSync(f); } catch (e) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPY[path.extname(f)] || 'application/octet-stream' });
  res.end(telo);
});
await new Promise((r) => server.listen(8310, r));

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const ctx = await prohlizec.newContext({ serviceWorkers: 'block' });
const page = await ctx.newPage();

/* Vzorek napříč abecedou, ne prvních deset: první soubory jsou
   z jednoho okresu a vyšel by z toho jeden kraj a jeden druh. */
const vzorek = [];
const krok = Math.max(1, Math.floor([...nadpisy.keys()].length / 12));
const klice = [...nadpisy.keys()].sort();
for (let i = 0; i < klice.length && vzorek.length < 12; i += krok) vzorek.push(klice[i]);

const rozesle = [];
const dvakrat = [];
let sOkresemVNadpisu = 0;
for (const f of vzorek) {
  await page.goto(`http://127.0.0.1:8310/${f}`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const el = document.querySelector('#pz-detail h1');
    return el && !document.querySelector('.pz-staticky');
  }, null, { timeout: 15000 }).catch(() => {});
  const vykresleny = bezNbsp(await page.$eval('#pz-detail h1', (e) => e.textContent).catch(() => ''));
  const titulek = bezNbsp(await page.title());
  const ocekavany = nadpisy.get(f);
  if (vykresleny !== ocekavany) rozesle.push(`${f}: vykresleno „${vykresleny}", servírováno „${ocekavany}"`);
  else if (titulek !== `${ocekavany} | Parcelka`) rozesle.push(`${f}: titulek „${titulek}"`);
  /* Okres stojí v nadpisu u tří čtvrtin stránek (rozlišení shodných
     titulků ho tam přidá). Řádek pod nadpisem ho pak nesmí psát
     podruhé — „… — Luhačovice, okres Zlín" a hned pod tím „okres
     Zlín" je totéž dvakrát pod sebou. */
  const podNadpisem = bezNbsp(
    await page.$eval('#pz-detail .pz-okres', (e) => e.textContent).catch(() => ''));
  const okres = (ocekavany.match(/, okres (.+)$/) || [])[1];
  if (okres && podNadpisem && podNadpisem.indexOf('okres ' + okres) >= 0) {
    dvakrat.push(`${f}: nadpis „${ocekavany}", pod ním „${podNadpisem}"`);
  }
  if (okres) sOkresemVNadpisu++;
}
pravda('je co měřit — vzorek stránek se v prohlížeči otevřel', vzorek.length >= 10,
  `${vzorek.length} stránek`);
pravda('vykreslený nadpis i titulek jsou tytéž jako servírované',
  rozesle.length === 0, `${rozesle.length}×, např. ${rozesle.slice(0, 2).join(' || ')}`);
pravda('je co měřit — ve vzorku jsou nadpisy, které okres samy uvádějí',
  sOkresemVNadpisu >= 3, `${sOkresemVNadpisu} z ${vzorek.length}`);
pravda('a okres pod nadpisem se neopakuje, když už v nadpisu je',
  dvakrat.length === 0, `${dvakrat.length}×, např. ${dvakrat.slice(0, 2).join(' || ')}`);

await prohlizec.close();
server.close();

console.log('\nHlavička stránky pozemku');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.log(`\n::error::Hlavička pozemku: ${chyb} kontrol neprošlo.`); process.exit(1); }
