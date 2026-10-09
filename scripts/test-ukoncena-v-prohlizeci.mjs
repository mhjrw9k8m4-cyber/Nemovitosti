// Test: stránka ukončené nabídky přežije i vykreslení.
//
// Spuštění: PW_CHROMIUM=… node scripts/test-ukoncena-v-prohlizeci.mjs
//
// NALEZENO MĚŘENÍM v prohlížeči. Generátor stránky zmizelých nabídek
// schválně NEMAŽE a nechává na nich všechno, co o pozemku víme — cenu,
// výměru, parcelu, zdroj, tři podobné pozemky v okrese a pruh „Tato
// nabídka už není aktuální" i s datem. Důvod je v generátoru napsaný:
// smazaná stránka vrátí 404 a neřekne nic, a hlavní aktivum webu jsou
// zaindexované adresy. Hlídá to scripts/test-ukonceno.mjs — jenže
// ZE SOUBORU, a ten byl v pořádku.
//
// V prohlížeči to dopadlo jinak. Nabídka v datech logicky není (proto
// je stránka ukončená), js/pozemek.js ji nenašel a celý #pz-detail
// přepsal hláškou „Pozemek nenalezen". Pro člověka prázdná stránka,
// pro vyhledávač měkká čtyřistačtyřka — tedy přesně to, čemu se mělo
// předejít. Takových stránek bylo 128 a žádná zkouška to neviděla,
// protože všechny četly HTML, ne vykreslenou stránku.
//
// Hlídá se obojí: že ukončená stránka svůj obsah udrží, A že se hláška
// pořád objeví tam, kam patří — na pozemek.html s neznámým klíčem.
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

/* Ukončené stránky se poznají podle pruhu, který na ně generátor
   přidává — ne podle toho, že nejsou v datech: tím by zkouška
   opisovala totéž pravidlo, které má hlídat. */
const vsechny = readdirSync(KOREN).filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f));
const ukoncene = vsechny.filter((f) =>
  /class="pz-konec"/.test(readFileSync(path.join(KOREN, f), 'utf8')));
const zive = vsechny.filter((f) => !ukoncene.includes(f));

console.log(`Stránek pozemků: ${vsechny.length} (ukončených ${ukoncene.length}, živých ${zive.length})`);
pravda('je co měřit — ukončené stránky na webu jsou', ukoncene.length >= 20,
  `našlo se ${ukoncene.length}`);
pravda('a živé taky', zive.length >= 500, `našlo se ${zive.length}`);

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

async function otevri(adresa) {
  await page.goto(`http://127.0.0.1:8310/${adresa}`, { waitUntil: 'load' });
  /* Počká se na skript, ne na pevný čas: skript si sahá pro řez dat
     okresu a na pomalém stroji by pevná pauza měřila prázdno. */
  await page.waitForFunction(() => !!document.querySelector('#pz-detail'), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  return {
    text: bezNbsp(await page.$eval('main', (e) => e.innerText)),
    titulek: bezNbsp(await page.title()),
    robots: await page.$eval('meta[name="robots"]', (e) => e.content).catch(() => ''),
  };
}

// ---- 1) ukončená stránka si obsah udrží --------------------------
/* Vzorek napříč abecedou, ne prvních šest: soubory jdou po okresech.
   A k tomu TEN TĚŽKÝ PŘÍPAD: ukončená stránka, jejíž nabídka v datech
   pořád je. Dostala jen jiný soubor (stránky se rozlišují otiskem
   klíče), takže ji skript najde a dřív ji vykreslil jako živou —
   i když o sobě o kus výš tvrdila, že aktuální není. Dnes jsou takové
   tři; kdyby je zkouška brala jen náhodou, nic by neuhlídala. */
const vzorek = [];
const serazene = ukoncene.slice().sort();
const krok = Math.max(1, Math.floor(serazene.length / 6));
for (let i = 0; i < serazene.length && vzorek.length < 6; i += krok) vzorek.push(serazene[i]);

const nabidkyVData = JSON.parse(
  readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
const podleKlice = new Map();
for (const o of nabidkyVData) {
  const k = [o.place, o.parcel || '—', o.okres,
    (o.lat || 0).toFixed(3), (o.lng || 0).toFixed(3)].join('|');
  if (!podleKlice.has(k)) podleKlice.set(k, []);
  podleKlice.get(k).push(o);
}
const poradVDatech = serazene.filter((f) => {
  const m = /window\.PK_POZEMEK=(\{.*?\});/.exec(readFileSync(path.join(KOREN, f), 'utf8'));
  if (!m) return false;
  let d; try { d = JSON.parse(m[1]); } catch (e) { return false; }
  return (podleKlice.get(d.k) || []).some((o) => (o.price || 0) === d.c && (o.area || 0) === d.v);
});
console.log(`Z toho ukončených, jejichž nabídka je pořád v datech: ${poradVDatech.length}`);
for (const f of poradVDatech.slice(0, 3)) if (!vzorek.includes(f)) vzorek.push(f);

const vyprazdnene = [];
const bezPruhu = [];
const spatnyTitulek = [];
for (const f of vzorek) {
  const zdroj = bezNbsp(readFileSync(path.join(KOREN, f), 'utf8'));
  const h1 = (zdroj.match(/<article class="pz-staticky"><h1>(.*?)<\/h1>/) || [])[1] || '';
  const v = await otevri(f);
  if (/Pozemek nenalezen/.test(v.text)) vyprazdnene.push(f);
  if (!/není aktuální/.test(v.text)) bezPruhu.push(f);
  if (h1 && v.text.indexOf(h1) < 0) vyprazdnene.push(`${f} (chybí nadpis „${h1}")`);
  if (h1 && v.titulek.indexOf(h1) < 0) spatnyTitulek.push(`${f}: „${v.titulek}"`);
}
pravda('ukončená stránka po vykreslení nehlásí „Pozemek nenalezen"',
  vyprazdnene.length === 0, `${vyprazdnene.length}×: ${vyprazdnene.slice(0, 3).join(', ')}`);
pravda('a pruh „nabídka už není aktuální" na ní zůstává',
  bezPruhu.length === 0, bezPruhu.slice(0, 3).join(', '));
pravda('a titulek stránky se nepřepíše na hlášku',
  spatnyTitulek.length === 0, spatnyTitulek.slice(0, 2).join(' | '));

// ---- 2) živá stránka se pořád vykresluje celá --------------------
/* Jinak by se dala „oprava" udělat tak, že se skript vypne. */
{
  const f = zive.sort()[Math.floor(zive.length / 2)];
  const v = await otevri(f);
  pravda('živá stránka pozemku se pořád vykreslí celá (cena, mapa, srovnání)',
    /CENA|VYVOLÁVACÍ CENA/.test(v.text) && /POZEMEK NA MAPĚ/.test(v.text)
    && !/Pozemek nenalezen/.test(v.text),
    `${f}: ${v.text.slice(0, 120).replace(/\n/g, ' / ')}`);
  pravda('a statická část se na ní opravdu nahradila',
    v.text.indexOf('Zpět na seznam') === 0 && /Rozbalit|Uložit/.test(v.text),
    `${f}`);
}

// ---- 3) hláška se objeví tam, kam patří --------------------------
/* Stránka pozemek.html s klíčem, který v datech není, žádný statický
   obsah nemá — tam je „Pozemek nenalezen" ta správná odpověď, a taky
   noindex, aby si ji vyhledávač neukládal. */
{
  const v = await otevri('pozemek.html?p=' + encodeURIComponent('Nikde|—|Nikde|0|0'));
  pravda('neznámý pozemek na pozemek.html pořád hlásí „Pozemek nenalezen"',
    /Pozemek nenalezen/.test(v.text), v.text.slice(0, 120).replace(/\n/g, ' / '));
  pravda('a taková stránka se neindexuje', /noindex/.test(v.robots), `robots: „${v.robots}"`);
}

// ---- 4) obě stráže ve skriptu opravdu stojí ----------------------
/* Vzorek je šest až devět stránek ze 127. Kdyby stráž ve skriptu
   zmizela a vzorek ji minul, zkouška by mlčela — proto se hledá
   i přímo v kódu. */
{
  const pz = readFileSync(path.join(KOREN, 'js', 'pozemek.js'), 'utf8');
  pravda('js/pozemek.js ukončenou stránku pozná podle pruhu',
    /function strankaUkoncena\(\)[\s\S]{0,200}querySelector\('\.pz-konec'\)/.test(pz));
  pravda('a na ukončené stránce se detail nevykresluje',
    /function render\(d\) \{\s*if \(strankaUkoncena\(\)\) return;/.test(pz));
  pravda('a hláška nepřepíše stránku, která statický obsah má',
    /function renderEmpty\(\)[\s\S]{0,1600}querySelector\('\.pz-staticky'\)\) return;/.test(pz));
}

await prohlizec.close();
server.close();

console.log('\nUkončená stránka v prohlížeči');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.log(`\n::error::Ukončená stránka: ${chyb} kontrol neprošlo.`); process.exit(1); }
