/* Zkouška zkoušek: měří to, co si myslí, že měří?
   ==================================================================
   Spuštění: node scripts/test-zkousky-meri.mjs   (bez prohlížeče)

   PROČ TENHLE SOUBOR VZNIKL. 15. 10. padalo dvanáct prohlížečových
   zkoušek a DEVĚT z nich mělo jednu společnou příčinu, která s webem
   neměla nic společného. Dvě pasti, obě tiché, obě na úrovni
   NASTAVENÍ KONTEXTU — tedy něco, co se dá hlídat staticky, bez
   prohlížeče:

   1) SERVISNÍ PRACOVNÍK. `sw.js` volá `skipWaiting()` i
      `clients.claim()`, takže převezme i tu stránku, která ho právě
      zaregistrovala. Od té chvíle obsluhuje `config.js` a `data/*.json`
      on — a jeho dotazy přes `ctx.route` NEJDOU. Co si zkouška
      podstrčila, přestane platit a stránka dostane opravdový soubor.
      Zrádné je, že zkouška pak nespadne na „podstrčení nezabralo", ale
      na něčem úplně jiném: „náhrada mapy se neukázala", „přepínačů
      vrstev 0", „v moje inzeráty je nula karet" (stránka se ptala
      opravdové databáze na supabase.co).
      Pravidlo: kdo podstrkuje přes `route`, vypne pracovníka.

   2) DOTYK. Pravidla pro telefon stojí za `@media (pointer: coarse)`
      a `(hover: none)`, ne za šířkou okna. Kontext bez `hasTouch`
      vykreslí v okně 390 px rozvržení MONITORU, takže 36 pravidel
      stylopisu se vůbec nevyhodnotí. Takhle prošla i sabotáž
      s rozbitým CSS, které majitel vyfotil (bod 3da v docs/co-chybi.md).
      Pravidlo: kdo měří okno do 560 px, zapne dotyk.

   VÝJIMKY SE NEPÍŠÍ DO KÓDU MLČKY. Každá stojí níž se svým důvodem;
   bez důvodu se nepřidává — od toho je ta past, aby se na ni
   nezapomnělo.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKRIPTY = path.join(KOREN, 'scripts');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Výjimky z pravidla o pracovníkovi. */
const PRACOVNIK_VYJIMKY = {
  'test-offline.mjs': 'měří samotný offline režim, tedy toho pracovníka — vypnout ho by znamenalo neměřit nic',
};
/* Výjimky z pravidla o dotyku. */
const DOTYK_VYJIMKY = {
  'test-mapa.mjs': 'změřené rozhodnutí: s dotykem přestalo podstrčené klepnutí do plátna vybírat kraj (tři způsoby vstupu, všechny selhaly) — viz bod 3db v docs/co-chybi.md',
  'test-souradnice.mjs': 'dotyk se tam zapíná podle ZAŘÍZENÍ (Android, iPhone ano; „počítač" ne), ne podle šířky okna',
  'test-stabilita.mjs': 'dotyk se tam zapíná podle profilu (telefon ano, monitor ne)',
  'test-okraje.mjs': 'dotyk se tam zapíná podle profilu (telefon ano, monitor ne)',
  'test-najeti.mjs': 'dotyk se tam zapíná podle profilu (telefon ano, monitor ne)',
  'test-rozdeleni-stylu.mjs': 'dotyk se tam zapíná podle profilu (telefon ano, monitor ne)',
  'test-mapa-pozemku.mjs': 'dotyk se tam zapíná podle oddílu (`dotyk: true` v detail())',
};

/** Rozebere volání `newContext(...)` na vyvážené závorky. */
function volaniKontextu(text) {
  const out = [];
  const vzor = /newContext\(/g;
  let m;
  while ((m = vzor.exec(text))) {
    let i = m.index + m[0].length - 1, hl = 0;
    while (i < text.length) {
      if (text[i] === '(') hl++;
      else if (text[i] === ')') { hl--; if (!hl) break; }
      i++;
    }
    out.push({ kod: text.slice(m.index, i + 1), radek: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

const soubory = fs.readdirSync(SKRIPTY).filter((f) => /^test-.*\.mjs$/.test(f)).sort();
pravda(`zkoušky se našly (${soubory.length})`, soubory.length > 100, `jen ${soubory.length}`);

const bezPracovnika = [], bezDotyku = [], mrtveVyjimky = [];
let sRoute = 0, uzkych = 0;
for (const f of soubory) {
  const t = fs.readFileSync(path.join(SKRIPTY, f), 'utf8');
  const volani = volaniKontextu(t);
  if (!volani.length) continue;
  const podstrkuje = /\.route\(/.test(t);
  if (podstrkuje) sRoute++;
  for (const v of volani) {
    if (podstrkuje && !/serviceWorkers/.test(v.kod) && !PRACOVNIK_VYJIMKY[f]) {
      bezPracovnika.push(`${f}:${v.radek}`);
    }
    const sirky = [...v.kod.matchAll(/width:\s*(\d+)/g)].map((x) => +x[1]);
    const uzke = sirky.some((w) => w <= 560);
    /* `width: SIRKA` z proměnné se staticky nepozná; takové volání se
       pozná podle toho, že si o dotyku rozhoduje samo (ternární výraz). */
    if (uzke) {
      uzkych++;
      if (!/hasTouch/.test(v.kod) && !DOTYK_VYJIMKY[f]) bezDotyku.push(`${f}:${v.radek}`);
    }
  }
}
/* Výjimka, kterou už není proč mít, je horší než žádná: tvrdí, že se
   někde něco neměří, a přitom se měří. */
for (const f of Object.keys(PRACOVNIK_VYJIMKY)) {
  if (!soubory.includes(f)) mrtveVyjimky.push(`${f} (pracovník)`);
}
for (const f of Object.keys(DOTYK_VYJIMKY)) {
  if (!soubory.includes(f)) mrtveVyjimky.push(`${f} (dotyk)`);
}

pravda(`kdo podstrkuje přes route, vypíná servisního pracovníka (${sRoute} zkoušek podstrkuje)`,
  bezPracovnika.length === 0,
  `${bezPracovnika.length} kontextů bez toho: ` + bezPracovnika.slice(0, 8).join(', '));
pravda(`kdo měří okno do 560 px, zapíná dotyk (${uzkych} takových kontextů)`,
  bezDotyku.length === 0,
  `${bezDotyku.length} kontextů bez dotyku: ` + bezDotyku.slice(0, 8).join(', '));
pravda('a žádná výjimka neukazuje na soubor, který neexistuje',
  mrtveVyjimky.length === 0, mrtveVyjimky.join(', '));

/* ---- API, KTERÉ V CI NEEXISTUJE ----
   Naměřeno (oddíl 101): lokálně je v node_modules playwright-core
   1.49.1, ale CI si v každém běhu instaluje NEJNOVĚJŠÍ
   (`npm install playwright-core playwright`) — dnes 1.64.1. A v té už
   `page.accessibility` NENÍ. Zkouška, která ho použije, projde
   lokálně a v CI spadne na „uzel se ve stromu nenašel", tedy na hlášku
   o webu, i když je vada v nástroji. Přístupnostní strom se proto čte
   přes CDP (DOM.querySelector + Accessibility.getPartialAXTree), což
   je protokol Chromia a proti verzi Playwrightu je stálý — změřeno
   v obou verzích.
   Hledá se jen ve KÓDU, ne v komentářích: právě o tom API se v nich
   píše, proč se nepoužívá. */
{
  const mrtveApi = [];
  for (const f of soubory) {
    const t = fs.readFileSync(path.join(SKRIPTY, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')      // blokové komentáře
      .replace(/^[ \t]*\/\/.*$/gm, '');       // řádkové komentáře
    if (/\.accessibility\s*\./.test(t)) mrtveApi.push(f);
  }
  pravda('žádná zkouška nepoužívá page.accessibility (v Playwrightu, který si instaluje CI, není)',
    mrtveApi.length === 0, mrtveApi.join(', ') + ' — čti strom přes CDP, viz test-pridat.mjs');
}

/* ---- 3) DVĚ ZKOUŠKY NA JEDNOM PORTU -------------------------------
 * Od 24. 10. se rychlá sada pouští i paralelně (scripts/zkousky.mjs,
 * čtyři naráz). Dvě zkoušky, které si otevřou server na témže portu,
 * se pak perou o něj a padne ta druhá — na EADDRINUSE, tedy na vadě,
 * kterou nezpůsobila. Naměřeno hned při zavedení: test-ohlas-selhani
 * a test-kontrola-nasazeni si obě vzaly 8413.
 * Zkoušky v prohlížeči se tu nepočítají: ty jedou v CI jedna po druhé
 * ve svých směnách a 8310 si schválně podávají dál. */
{
  const { rychleZkousky } = await import('./zkousky.mjs');
  const porty = new Map();
  for (const f of rychleZkousky()) {
    const t = fs.readFileSync(path.join(KOREN, f), 'utf8');
    for (const m2 of t.matchAll(/listen\((\d{4})/g)) {
      const p2 = m2[1];
      if (!porty.has(p2)) porty.set(p2, []);
      porty.get(p2).push(f.replace('scripts/', ''));
    }
  }
  const kolize = [...porty.entries()].filter(([, kdo]) => kdo.length > 1);
  pravda(`porty v rychlé sadě jsou každý jen jednou (${porty.size} portů)`,
    kolize.length === 0,
    kolize.map(([p2, kdo]) => `${p2}: ${kdo.join(' + ')}`).join('; ')
      + ' — při běhu čtyř naráz padne druhá na EADDRINUSE, tedy na cizí vadě');
}

console.log('\nZkoušky měří to, co si myslí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.error(`::error::Nastavení zkoušek: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
