/* Test: jméno třídy je slib, že existuje pravidlo.
   ==================================================================
   Spuštění: node scripts/test-mrtva-jmena.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ TO VZNIKLO — A PROČ TO NEJDE ČÍST ZE ZDROJE.
   scripts/test-mrtve-styly.mjs hlídá jeden směr: pravidlo, které nemá
   na čem zabrat. Tahle zkouška hlídá ten druhý: jméno třídy, které na
   stránce vznikne a žádné pravidlo k němu není. Staticky to nejde —
   jména se SKLÁDAJÍ na obou stranách:
     · pisatel: `'opp-item ' + d.type + (hot ? ' is-hot' : '')`,
     · čtenář:  `DRUHY.find((c) => e.classList.contains(c))`.
   Žádný rozumný vzor nad zdrojem ani jedno spolehlivě nesloží; vím to,
   protože mi prototyp nad zdrojem nálezy přehlédl a pak jsem si na
   druhé straně smazal `d.type` jako „mrtvý" a shodil tím test-barvy.
   Měří se proto VÝSLEDEK: jména z DOM proti selektorům.

   CO SE NAŠLO, KDYŽ TO MĚŘENÍ POPRVÉ PROBĚHLO. Na úvodní stránce je po
   vykreslení 332 různých jmen tříd a 32 z nich nemělo pravidlo; z toho
   26 patřilo Leafletu, protože se do porovnání nepřidal jeho stylopis.
   Ze zbytku vypadla jedna skutečná závada: oddíl „Pozemky přímo od
   majitelů" měl obsah, výšku 227–259 px a `opacity: 0`, protože mu
   skript psal `is-visible` místo `in` (viz oddíl 89 v
   docs/optimalizace.md). To je nejdražší druh mrtvého jména — takový,
   který něco schová.

   JAK SE POZNÁ ŽIVÉ JMÉNO BEZ PRAVIDLA. Jsou dva legitimní druhy:
   úchyt pro JS (`os-t`, které si skript hledá, aby přepsal slovo
   v tlačítku) a úchyt pro zkoušku (`pk-maska`). Oba patří do tabulky
   výjimek, a ke každému musí být napsané, KDO ho čte — jinak tabulka
   tiše roste a kontrola přestane být k něčemu. A platí to obojím
   směrem: výjimka na jméno, které se na stránkách už neobjevuje, se
   taky ohlásí.
   ================================================================== */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8336;
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Mrtvá jména tříd', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Jméno, které v DOM je a pravidlo k němu není — a přesto je živé.
   Ke každému KDO ho čte; bez toho tu nemá co dělat. */
const VYJIMKY = {
  'os-t': 'úchyt pro skript: js/main.js si ho hledá, aby v tlačítku přepsal „Uložit" na „Uloženo" (a čte ho i scripts/test-klic-ulozenych.mjs)',
  'pz-pozn-skok-t': 'úchyt pro skript: js/pozemek.js si jím přepisuje text v tlačítku „Přidat poznámku"',
  'pk-maska': 'úchyt pro zkoušky: scripts/test-maska.mjs a scripts/test-obrys.mjs si jím hledají závoj nad mapou',
  'leaflet-dots-pane': 'jméno vlastní vrstvy, kterou si web v Leafletu zakládá na tečky pozemků; hledají si ji scripts/test-pohyb.mjs, test-obec.mjs a test-tvary.mjs',
  'leaflet-control-container': 'skládá si ho Leaflet sám (prefix + „-container") a svůj stylopis na něj nemá',
  'leaflet-proxy': 'vnitřnost Leafletu u animace přiblížení; stylopis na ni pravidlo nemá',
};

/* Stylopisy, které web opravdu servíruje. BEZ Leafletova by kontrola
   hlásila 26 falešných nálezů — jeho jména v DOM jsou, jeho pravidla
   ale nejsou v css/. */
let css = '';
for (const f of readdirSync(path.join(KOREN, 'css'))) {
  if (f.endsWith('.css') && !f.endsWith('.min.css')) css += readFileSync(path.join(KOREN, 'css', f), 'utf8') + '\n';
}
css += readFileSync(path.join(KOREN, 'vendor', 'leaflet', 'leaflet.css'), 'utf8');
const JMENA_V_CSS = (t) => new Set([...t.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .matchAll(/\.(-?[_A-Za-z][\w-]*)/g)].map((m) => m[1]));
const vCss = JMENA_V_CSS(css);

const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };
const srv = createServer((q, s) => {
  const f = path.join(KOREN, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(KOREN) || !existsSync(f) || !statSync(f).isFile()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': TYPY[path.extname(f)] || 'application/octet-stream' });
  s.end(readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

/* Živá stránka pozemku, ne archivní: na ukončené se půlka obsahu
   nekreslí a měřilo by se něco jiného. Pozná se podle OBSAHU
   (window.PK_POZEMEK), ne podle jména — `pozemek-od-obce.html` je
   ručně psaný rádce a do měření nepatří. */
let zivyPozemek = null;
for (const f of readdirSync(KOREN)) {
  if (!/^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f)) continue;
  const h = readFileSync(path.join(KOREN, f), 'utf8');
  if (h.indexOf('window.PK_POZEMEK=') >= 0 && h.indexOf('window.PK_UKONCENO=') < 0) { zivyPozemek = f; break; }
}
pravda('našla se živá stránka pozemku', !!zivyPozemek, 'všechny jsou ukončené?');

const STRANKY = ['index.html', zivyPozemek, 'pozemky-okres-litomerice.html',
  'kontakt.html', 'muj-inzerat.html', 'hlidani.html'].filter(Boolean);

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

const bezPravidla = new Map();   // jméno -> na kterých stránkách
let jmenCelkem = 0;
for (const stranka of STRANKY) {
  const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  /* Cizí servery se neptáme: měří se naše značkování, ne dostupnost
     dlaždic a vrstev úřadů. */
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  /* Na výsledek, ne na čas: na úvodní stránce se čeká na výpis, jinde
     na to, že se stránka přestala přestavovat. */
  if (stranka === 'index.html') {
    await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
      null, { timeout: 60000 }).catch(() => {});
  }
  await p.waitForTimeout(2500);
  /* Vložený <style> té stránky se přičítá: stránky aplikace si část
     vzhledu píšou v hlavičce. */
  const vlozene = await p.evaluate(() =>
    [...document.querySelectorAll('style')].map((e) => e.textContent).join('\n'));
  const vlozeneTridy = JMENA_V_CSS(vlozene);
  const jmena = await p.evaluate(() => {
    const se = new Set();
    document.querySelectorAll('*').forEach((e) => {
      const c = e.getAttribute && e.getAttribute('class');
      if (typeof c === 'string') c.split(/\s+/).forEach((x) => { if (x) se.add(x); });
    });
    return [...se];
  });
  jmenCelkem += jmena.length;
  for (const j of jmena) {
    if (vCss.has(j) || vlozeneTridy.has(j)) continue;
    if (!bezPravidla.has(j)) bezPravidla.set(j, []);
    bezPravidla.get(j).push(stranka);
  }
  await ctx.close();
}
await prohlizec.close();

// PŘEDPOKLAD: bez jmen v DOM by kontrola níž prošla naprázdno
pravda(`je co měřit — ${STRANKY.length} stránek, ${jmenCelkem} jmen tříd v DOM`,
  STRANKY.length >= 5 && jmenCelkem > 300,
  `stránek ${STRANKY.length}, jmen ${jmenCelkem} — vykreslily se vůbec?`);
pravda('a stylopisy se přečetly (jinak by bez pravidla bylo všechno)',
  vCss.size > 500, `jmen v selektorech jen ${vCss.size}`);

const mrtva = [...bezPravidla].filter(([j]) => !(j in VYJIMKY));
pravda('každé jméno třídy v DOM má ve stylopisu pravidlo',
  mrtva.length === 0,
  mrtva.map(([j, kde2]) => `.${j} (${kde2.join(', ')})`).join('\n      ')
    + '\n      buď pravidlo chybí (a něco není vidět), nebo je to mrtvé jméno — smaž ho;'
    + '\n      živý úchyt pro skript nebo zkoušku patří do tabulky VYJIMKY s napsaným, kdo ho čte');

for (const [jmeno, duvod] of Object.entries(VYJIMKY)) {
  pravda(`výjimka .${jmeno} má napsaný důvod`,
    typeof duvod === 'string' && duvod.length >= 40,
    'bez důvodu tabulka tiše roste a kontrola přestane být k něčemu');
  pravda(`a je pořád potřeba (.${jmeno})`, bezPravidla.has(jmeno),
    'jméno se na měřených stránkách neobjevuje, nebo už pravidlo má — výjimku smaž');
}

srv.close();
console.log('\nMrtvá jména tříd — jméno je slib, že existuje pravidlo');
console.log(zpravy.join('\n'));
console.log(`\nzměřeno: ${bezPravidla.size} jmen bez pravidla, z toho ${Object.keys(VYJIMKY).length} s napsaným důvodem`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Mrtvá jména tříd: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
