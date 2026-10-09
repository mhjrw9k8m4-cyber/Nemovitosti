// Test: u každé nabídky vede odkaz tam, kam jeho popisek slibuje.
//
// Spuštění: node scripts/test-zdroje-odkazu.mjs   (nepotřebuje prohlížeč)
//
// Proč to vzniklo. V datech je 219 nabídek, které od svého zdroje nedostaly
// žádný odkaz — dražebník ho v centrální evidenci neuvedl, nebo uvedl jen
// domovskou stránku portálu, a tu js/pozemek.js schválně zahazuje (vede
// k ničemu). Pro takové nabídky má web záložní odkaz: u státní půdy na
// nabídky SPÚ, u exekuce na katastr na té parcele, u dražby na dražební
// rozcestník.
//
// Ten záložní odkaz má ale vlastní past, a ta se splete tiše: popisek může
// slíbit konkrétní stránku, i když URL je jen domovská stránka portálu.
// Přesně to se stalo u dražeb — tabulka TYPE nesla „Detail dražby" s adresou
// https://www.portaldrazeb.cz/, tedy rozcestníkem. Kód o dva řádky níž přitom
// pro tentýž případ sám volí opatrnější „Dražební portál" (viz sourceLink
// a jeho isDeepLink). Pravidlo tedy existovalo, jen se na záložní odkazy
// nevztahovalo.
//
// A druhá past: tabulka TYPE je OPSANÁ dvakrát — v js/main.js (mapa) a
// v js/pozemek.js (stránka pozemku). Dvě kopie téhož se rozejdou; u barev
// kategorií se to na tomhle webu už stalo (viz scripts/test-barvy.mjs).
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const req = createRequire(import.meta.url);
const PKH = req(path.join(ROOT, 'js', 'hlidani-logika.js'));

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Tatáž otázka, jakou si klade js/pozemek.js: míří URL na konkrétní věc,
   nebo jen na domovskou stránku? Opsané schválně — test, který by si
   pravidlo vzal z testovaného kódu, by prošel i tehdy, kdyby bylo
   obrácené. */
function konkretni(url) {
  try {
    const u = new URL(url);
    return (u.pathname && u.pathname.replace(/\/+$/, '').length > 1) || !!u.search;
  } catch { return false; }
}

/* Popisky, které nic neslibují: říkají „tady je rozcestník", ne „tady je
   ta tvoje dražba". Cokoli jiného u domovské stránky je slib, který
   odkaz nemůže splnit. */
const ROZCESTNIKOVE = ['Dražební portál', 'Web prodejce', 'Nabídka SPÚ', 'Úřední deska obce', 'Ověřit v katastru'];

// --- 1) Záložní odkazy v tabulce TYPE --------------------------------
const tabulky = {};
for (const f of ['js/main.js', 'js/pozemek.js']) {
  const t = readFileSync(path.join(ROOT, f), 'utf8');
  const od = t.indexOf('var TYPE = {');
  pravda(`${f}: tabulka TYPE se našla`, od !== -1);
  if (od === -1) continue;
  const blok = t.slice(od, t.indexOf('};', od));
  const odkazy = [...blok.matchAll(/(\w+):\s*\{[^}]*link:\s*\{\s*label:\s*'([^']*)'\s*,\s*url:\s*'([^']*)'/g)]
    .map((m) => ({ kategorie: m[1], label: m[2], url: m[3] }));
  /* Bez tohohle by obě kontroly pod tím prošly naprázdno, kdyby se
     vzor neshodl ani jednou — a to je přesně to, co se u regulárního
     výrazu nad vysázeným souborem stává. */
  pravda(`${f}: našly se všechny záložní odkazy (${odkazy.length})`, odkazy.length === 5,
    'našlo se: ' + odkazy.map((o) => o.kategorie).join(', '));
  tabulky[f] = odkazy;
  for (const o of odkazy) {
    if (konkretni(o.url)) continue;   // slíbit konkrétní stránku smí, když tam vede
    pravda(`${f}: „${o.label}" (${o.kategorie}) neslibuje konkrétní stránku, když vede jen na rozcestník`,
      ROZCESTNIKOVE.indexOf(o.label) !== -1,
      `${o.url} je domovská stránka, ale popisek slibuje konkrétní věc`);
  }
}

// --- 2) Dvě kopie téže tabulky si musí odpovídat ---------------------
if (tabulky['js/main.js'] && tabulky['js/pozemek.js']) {
  const a = JSON.stringify(tabulky['js/main.js']);
  const b = JSON.stringify(tabulky['js/pozemek.js']);
  pravda('js/main.js a js/pozemek.js mají záložní odkazy shodné', a === b,
    `main.js: ${a}\n      pozemek.js: ${b}`);
}

// --- 3) Řádek nabídky bez odkazu na zdroj nesmí být slepá ulička -----
const vse = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities;
const all = PKH.bezDuplicit(vse);
const bezUrl = all.filter((o) => !o.url);
/* Kdyby data přestala nabídky bez odkazu obsahovat, kontrola pod tím
   by neměla co měřit — a tiše by procházela. */
pravda(`v datech jsou nabídky bez odkazu na zdroj (${bezUrl.length})`, bezUrl.length > 0);

const stranky = readdirSync(ROOT).filter((f) => /^(pozemky-okres-[a-z0-9-]+|pozemky-[a-z-]+-kraj|drazby-pozemku-nabidky)\.html$/.test(f));
pravda(`stránky s výpisem nabídek se našly (${stranky.length})`, stranky.length > 50);

let radkuCelkem = 0, slepych = 0, prvniSlepa = '';
for (const f of stranky) {
  const h = readFileSync(path.join(ROOT, f), 'utf8');
  const radky = h.split(/<div class="okr-item"/).slice(1);
  /* Počet řádků se ověřuje proti počtu NÁZVŮ MÍSTA — kdyby se dělení
     rozešlo s tvarem stránky, vyšlo by nula řádků a celá kontrola by
     prošla na prázdnu. Na tohle jsem u téhle stránky narazil: první
     dělení našlo nula řádků z osmdesáti šesti.
     Dřív se počítaly značky kategorie („NA PRODEJ"). Ty ale na
     stránce, kde mají všechny řádky týž typ, schválně nejsou — typ se
     tam říká jednou nad výpisem. Název místa má každý řádek vždycky,
     protože je to ta jediná věc, kvůli které řádek existuje. */
  const mist = (h.match(/class="okr-place"/g) || []).length;
  if (radky.length !== mist) {
    pravda(`${f}: řádky se dají spočítat`, false, `dělení dalo ${radky.length}, názvů místa je ${mist}`);
    continue;
  }
  radkuCelkem += radky.length;
  for (const r of radky) {
    if (/<a\s/.test(r)) continue;
    slepych++;
    if (!prvniSlepa) prvniSlepa = f + ': ' + r.replace(/\s+/g, ' ').slice(0, 160);
  }
}
pravda(`řádků se spočítalo dost (${radkuCelkem})`, radkuCelkem > 1000);
pravda('žádný řádek nabídky není slepá ulička (nemá vůbec odkaz)', slepych === 0, prvniSlepa);

console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Odkazy na zdroj: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
