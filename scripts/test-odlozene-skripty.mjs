// Test: tři moduly se stahují až při prvním použití.
//
// Spuštění: node scripts/test-odlozene-skripty.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// PROČ VZNIKL. Úvodní stránka si brala značkou <script> osm modulů, ze
// kterých většina návštěv nepoužije ani jeden. Změřeno přes
// Object.defineProperty na window (telefon 390 px i monitor 1280 px,
// žádný dotek): TŘI z nich se za celé načtení ani jednou nepřečtou —
// PKVyvoz, PKRychly a PK_VRSTVY. Ostatní ano a zůstávají značkou:
// PKAuth v 167 ms, PKHledani 250 ms, PKUlozeneUcet 308 ms,
// PKPoznamky 377 ms. Těch pět kilobajtů (brotli) si bral i ten, kdo
// na úvodní stránce jen projde výpis.
//
// Co se tu hlídá — a proč obojí:
//  • ŽE SE NESTAHUJÍ PŘEDEM. Bez toho by se značka <script> mohla
//    nepozorovaně vrátit a nikdo by si toho nevšiml, protože web by
//    fungoval úplně stejně.
//  • ŽE SE DOTÁHNOU, KDYŽ MAJÍ. To je ta druhá půlka: samotné „nestahuje
//    se" se dá splnit i tím, že se modul nenačte NIKDY a tlačítko mlčí.
//    Proto se tu na každé ze tří tlačítek opravdu klepne a čeká se na
//    výsledek — otevřené okno, ne na čas.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8332;
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(KOREN, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
  if (!f.startsWith(KOREN) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('ne'); return;
  }
  res.writeHead(200, { 'content-type': TYPY[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Odložené skripty', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nOdložené skripty');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  server.close();
  if (chyb) { console.log('::error::Odložené skripty: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Klíč v metaznačce, soubor, a tlačítko, kterým se modul vyvolá. */
const MODULY = [
  { klic: 'vyvoz', soubor: 'vyvoz.js', global: 'PKVyvoz' },
  { klic: 'rychly', soubor: 'rychlovyber.js', global: 'PKRychly' },
  { klic: 'vrstvy', soubor: 'mapove-vrstvy.js', global: 'PK_VRSTVY' },
];

// ===== 1) CO STOJÍ V HTML ==============================================
const html = fs.readFileSync(path.join(KOREN, 'index.html'), 'utf8');
for (const m of MODULY) {
  /* Hledá se ZNAČKA, ne jméno souboru kdekoli v textu: adresa stojí
     i v metaznačce a v komentáři nad ní. */
  const znacka = new RegExp('<script[^>]+src="js/min/' + m.soubor.replace('.', '\\.') + '[^"]*"');
  pravda(`index.html si ${m.soubor} nebere značkou <script>`, !znacka.test(html),
    'značka <script> je zpátky — modul se stáhne každému, i když ho nepoužije');
  const meta = new RegExp('<meta name="pk-odlozeny" data-klic="' + m.klic + '" data-src="(js/min/' + m.soubor.replace('.', '\\.') + '[^"]*)">');
  const nalez = html.match(meta);
  pravda(`a má k němu <meta name="pk-odlozeny" data-klic="${m.klic}">`, !!nalez,
    'bez metaznačky nemá js/main.js odkud vzít adresu');
  /* Razítko ?v= dělá scripts/orazitkuj-verze.mjs. Bez něj by se po
     změně modulu servíroval starý soubor z mezipaměti prohlížeče. */
  if (nalez) {
    pravda(`a adresa je orazítkovaná ?v=`, /\?v=[A-Za-z0-9]+$/.test(nalez[1]), nalez[1]);
  }
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
const vyzadane = [];
p.on('request', (r) => {
  const m = MODULY.find((x) => r.url().includes('/js/min/' + x.soubor));
  if (m) vyzadane.push(m.klic);
});
const padlo = [];
p.on('pageerror', (e) => padlo.push(String(e)));

await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
/* Na výsledek, ne na čas: výpis vzniká až po dotažení dat. */
await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
  null, { timeout: 60000 });

// ===== 2) BEZ DOTEKU SE NESTAHUJÍ ======================================
// PŘEDPOKLAD: bez vykresleného výpisu by se nedalo na co klepnout
pravda('výpis se vykreslil, je na čem měřit',
  (await p.$$('#opp-list .opp-item')).length > 0, 've výpisu nejsou karty');
pravda('po načtení bez jediného doteku se nestáhl ani jeden z nich',
  vyzadane.length === 0, 'stáhlo se: ' + vyzadane.join(', '));
for (const m of MODULY) {
  pravda(`a ${m.global} na stránce (zatím) není`,
    await p.evaluate((g) => !window[g], m.global),
    'modul se nějak dostal na stránku i bez doteku');
}

// ===== 3) PO KLEPNUTÍ SE DOTÁHNOU A OKNO SE OTEVŘE =====================
await p.click('#mc-vyvoz');
await p.waitForSelector('#vyv-vrstva:not([hidden])', { timeout: 30000 }).catch(() => {});
pravda('po klepnutí na „Stáhnout" se okno vývozu otevřelo',
  await p.evaluate(() => { const e = document.getElementById('vyv-vrstva'); return !!e && !e.hidden; }),
  'okno zůstalo zavřené — modul se nedotáhl, nebo se po dotažení nepokračovalo');
/* Popis se počítá z PKVyvoz.SLOUPCE, takže jeho text dokazuje, že se
   modul nejen stáhl, ale i použil. */
pravda('a popis v něm zná počet sloupců z modulu',
  /\d+\s*sloupc/.test(await p.textContent('#vyv-popis').catch(() => '') || ''),
  'popis: ' + JSON.stringify((await p.textContent('#vyv-popis').catch(() => '') || '').slice(0, 80)));
await p.keyboard.press('Escape');
await p.waitForSelector('#vyv-vrstva[hidden]', { timeout: 20000 }).catch(() => {});

await p.click('#mc-rychly');
await p.waitForSelector('#rv-vrstva:not([hidden])', { timeout: 30000 }).catch(() => {});
pravda('po klepnutí na „Rychlý výběr" se okno s kartami otevřelo',
  await p.evaluate(() => { const e = document.getElementById('rv-vrstva'); return !!e && !e.hidden; }),
  'okno zůstalo zavřené');
await p.keyboard.press('Escape');

/* Vrstvy úřadů mají vlastní tlačítko UVNITŘ panelu („Zkusit, které
   vrstvy jedou") — řada s panelem bývá skrytá, takže se klepne
   programově. Měří se to, co po klepnutí nastane, ne viditelnost. */
await p.click('#map-vrstvy').catch(() => {});
await p.waitForFunction(() => !!document.querySelector('#map-vrstvy-panel .mv-zkusit'),
  null, { timeout: 30000 }).catch(() => {});
await p.evaluate(() => {
  const b = document.querySelector('#map-vrstvy-panel .mv-zkusit');
  if (b) b.click();
});
await p.waitForFunction(() => !!window.PK_VRSTVY, null, { timeout: 30000 }).catch(() => {});
pravda('po klepnutí na „Zkusit, které vrstvy jedou" je modul vrstev na stránce',
  await p.evaluate(() => !!window.PK_VRSTVY),
  'PK_VRSTVY se nedotáhlo — panel by zůstal na hlášce');

const stazene = [...new Set(vyzadane)].sort();
pravda('dotáhly se všechny tři, a každý jen jednou',
  vyzadane.length === 3 && stazene.join(',') === 'rychly,vrstvy,vyvoz',
  'vyžádáno: ' + vyzadane.join(', '));
pravda('a stránka u toho nespadla', padlo.length === 0, padlo.slice(0, 2).join(' | '));

await ctx.close();

// ===== 4) KDYŽ SE DOTAŽENÍ NEPOVEDE ====================================
/* Odložený modul přidává jedno místo, kde může síť selhat — a dřív
   takové místo nebylo, protože skript přišel s celou stránkou. Musí
   tedy platit dvojí: člověk se to dozví (ne že tlačítko mlčí) a druhé
   klepnutí to zkusí znovu (ne že je tlačítko umlčené do konce návštěvy,
   protože si zavaděč schoval odmítnutý slib). */
{
  const ctx2 = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  let padat = true;
  await ctx2.route('**/js/min/vyvoz.js*', (r) => (padat ? r.abort() : r.continue()));
  const p2 = await ctx2.newPage();
  const padlo2 = [];
  p2.on('pageerror', (e) => padlo2.push(String(e)));
  await p2.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p2.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
    null, { timeout: 60000 });
  await p2.click('#mc-vyvoz');
  await p2.waitForFunction(() => {
    const e = document.getElementById('toast');
    return !!e && !e.hasAttribute('hidden') && e.textContent.trim().length > 0;
  }, null, { timeout: 20000 }).catch(() => {});
  const hlaska = await p2.evaluate(() => {
    const e = document.getElementById('toast');
    return e ? e.textContent.trim() : '';
  });
  pravda('při výpadku sítě to tlačítko řekne, ne že mlčí',
    /nepodařilo/.test(hlaska), 'hláška: ' + JSON.stringify(hlaska));
  pravda('a okno se u toho neotevře prázdné',
    await p2.evaluate(() => { const e = document.getElementById('vyv-vrstva'); return !e || e.hidden; }),
    'okno je otevřené, ale modul v něm není');
  padat = false;
  await p2.click('#mc-vyvoz');
  await p2.waitForSelector('#vyv-vrstva:not([hidden])', { timeout: 30000 }).catch(() => {});
  pravda('a druhé klepnutí (síť už jede) okno otevře',
    await p2.evaluate(() => { const e = document.getElementById('vyv-vrstva'); return !!e && !e.hidden; }),
    'zavaděč si schoval odmítnutý slib a tlačítko zůstalo umlčené');
  pravda('a stránka u výpadku nespadne', padlo2.length === 0, padlo2.slice(0, 2).join(' | '));
  await ctx2.close();
}

await prohlizec.close();
hotovo();
