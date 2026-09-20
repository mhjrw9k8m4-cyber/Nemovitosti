// Test cenového modelu (js/ceny.js) — bez prohlížeče, na vymyšlených datech.
//
// Spuštění: node scripts/test-ceny.mjs
//
// Proč vymyšlená data a ne ostrá: u ostrých dat neznám správnou odpověď,
// takže bych mohl leda porovnávat výpočet sám se sebou. Tady vím dopředu,
// co má vyjít, takže se dá ověřit i to, co je na odhadu ceny nejdůležitější:
//
//  · vyvolávací ceny dražeb se NESMÍ počítat do srovnávací hladiny (jsou pod
//    trhem z podstaty — jinak bychom srovnávali dražby samy se sebou a žádný
//    rozdíl by nevyšel),
//  · nevěrohodné nabídky (spoluvlastnické podíly, překlepy) nesmí hladinu
//    stahovat dolů ani se samy tvářit jako výhodná koupě,
//  · když je v okrese málo srovnání, musí model přejít na kraj — a dál už NE,
//    protože celostátní medián o konkrétním okrese nevypovídá nic,
//  · a vždy musí přiznat, z čeho počítal.
import { readFileSync } from 'node:fs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

// js/ceny.js je prostý skript, ne modul — načteme ho do globálního prostoru.
const zdroj = readFileSync(new URL('../js/ceny.js', import.meta.url), 'utf8');
new Function(zdroj)();
const PK_CENY = globalThis.PK_CENY;
pravda('cenový model se načetl', !!(PK_CENY && PK_CENY.postav), 'globální PK_CENY chybí');

const OKRES_KRAJ = { 'Kolín': 'Středočeský', 'Kutná Hora': 'Středočeský', 'Cheb': 'Karlovarský' };

function pole(n, f) { return Array.from({ length: n }, (_, i) => f(i)); }
// V okrese Kolín deset nabídek orné půdy za rovných 40 Kč/m² (medián 40).
const KOLIN = pole(10, (i) => ({
  place: 'K' + i, okres: 'Kolín', type: 'sale', druh: 'orná půda',
  area: 10000, price: 400000,
}));
// V Kutné Hoře jen dvě — na okresní odhad je to málo, musí se přejít na kraj.
const KUTNA = pole(2, (i) => ({
  place: 'KH' + i, okres: 'Kutná Hora', type: 'sale', druh: 'orná půda',
  area: 10000, price: 900000,   // 90 Kč/m²
}));
// Dražba v Kolíně: 1 ha orné půdy s vyvolávací cenou 100 000 Kč (10 Kč/m²).
const DRAZBA = { place: 'Dražebnice', okres: 'Kolín', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 100000 };
// A ještě deset dalších dražeb po 10 Kč/m². Je to schválně VÍC než nabídek:
// kdyby se vyvolávací ceny počítaly do srovnávací hladiny, medián by spadl
// ze 40 na 10 a bylo by to vidět. S jedinou dražbou by se medián nepohnul
// a test by tu chybu přehlédl — což se mi taky stalo.
const DALSI_DRAZBY = pole(10, (i) => ({
  place: 'D' + i, okres: 'Kolín', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 100000,
}));

const model = PK_CENY.postav([...KOLIN, ...KUTNA, DRAZBA, ...DALSI_DRAZBY], OKRES_KRAJ);

// --- 1) Odhad v okrese ------------------------------------------------
const o = model.odhad(DRAZBA);
pravda('dražba dostala odhad', !!o, 'odhad vyšel null');
if (o) {
  je('odhad se počítá z mediánu nabídek v okrese', o.zaM2, 40);
  je('odhadovaná částka je medián × výměra', o.castka, 400000);
  je('model přiznává, na jaké úrovni počítal', o.uroven, 'okres');
  je('model přiznává, z kolika nabídek', o.vzorek, 10);
  je('rozdíl proti vyvolávací ceně', o.rozdil, 300000);
  je('o kolik procent je pod odhadem', o.podOdhadem, 75);
}

// --- 2) Vyvolávací ceny dražeb se do hladiny nesmí počítat ------------
// Kdyby se počítaly, medián by spadl ze 40 na méně (dražba má 10 Kč/m²)
// a odhad by vyšel nižší než 400 000.
pravda('vyvolávací cena dražby neovlivnila srovnávací hladinu',
  !!o && o.zaM2 === 40,
  `medián vyšel ${o && o.zaM2} Kč/m² — do hladiny se nejspíš připletly dražby`);

// --- 3) Málo srovnání v okrese → přechod na kraj ----------------------
const drazbaKH = { place: 'X', okres: 'Kutná Hora', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 100000 };
const oKH = model.odhad(drazbaKH);
pravda('při málo datech v okrese se přejde na kraj', !!oKH && oKH.uroven === 'kraj',
  `úroveň vyšla ${oKH && oKH.uroven}`);
if (oKH) {
  // Kraj = 10× Kolín po 40 + 2× Kutná Hora po 90 → medián dvanácti hodnot je 40.
  je('krajský medián bere nabídky z celého kraje', oKH.zaM2, 40);
  je('u krajského odhadu se uvádí kraj', oKH.kde, 'Středočeský');
}

// --- 4) Dál než kraj se nejde ----------------------------------------
// Celostátní medián tu dřív byl jako poslední záchrana a na ostrých datech
// by z něj padalo 56 ze 73 odhadů. Medián orné půdy za celou republiku ale
// o konkrétním okrese nevypovídá nic — je to číslo, které jen vypadá jako
// odhad. Radši žádný.
const cizi = { place: 'Y', okres: 'Neznámý', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 100000 };
je('u neznámého okresu se odhad nedělá vůbec', model.odhad(cizi), null);

// --- 4b) Cena vysoko nad místní hladinou = nesrovnatelný pozemek ------
// Na ostrých datech vycházely perly jako „vyvolávací 576 000 Kč, odhad
// 8 062 Kč". Za tím bývá stavba na pozemku nebo špatně přečtená výměra.
// Dolů se naopak nic neořezává — dražby pod odhadem jsou přesně to, co
// má web ukazovat.
const sestavba = { place: 'Z', okres: 'Kolín', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 9000000 };   // 900 Kč/m² proti hladině 40
je('pozemek hluboko nad místní hladinou odhad nedostane', model.odhad(sestavba), null);
const levnaDrazba = { place: 'W', okres: 'Kolín', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 20000 };     // 2 Kč/m², tedy 95 % pod hladinou
const oLevna = model.odhad(levnaDrazba);
pravda('hluboko POD hladinou se odhad naopak udělá (o to celé jde)',
  !!oLevna && oLevna.podOdhadem === 95, `vyšlo ${oLevna && oLevna.podOdhadem}`);

// --- 5) Nevěrohodná cena: žádný odhad, žádná „výhodná koupě" ---------
// Stavební pozemky: devět po 2 000 Kč/m² a jeden za 3 Kč/m² (podíl).
const STAVEBNI = pole(9, (i) => ({
  place: 'S' + i, okres: 'Cheb', type: 'sale', druh: 'stavební pozemek',
  area: 1000, price: 2000000,
}));
const PODIL = { place: 'Podíl', okres: 'Cheb', type: 'sale', druh: 'stavební pozemek',
  area: 1000, price: 3000 };   // 3 Kč/m² proti mediánu 2 000
const model2 = PK_CENY.postav([...STAVEBNI, PODIL], OKRES_KRAJ);
pravda('podíl je rozpoznaný jako nevěrohodná cena', model2.neduveryhodna(PODIL) === true);
const NAFOUKLY = { place: 'Nafouklý', okres: 'Cheb', type: 'sale', druh: 'stavební pozemek',
  area: 1000, price: 100000000 };  // 100 000 Kč/m² proti mediánu 2 000
pravda('nesmyslně vysoká cena je taky nevěrohodná', model2.neduveryhodna(NAFOUKLY) === true);
pravda('běžná nabídka jako nevěrohodná označená není', model2.neduveryhodna(STAVEBNI[0]) === false);
je('nevěrohodná nabídka nedostane odhad', model2.odhad(PODIL), null);
je('nevěrohodná nabídka nedostane ani percentil', model2.percentil(PODIL), null);

// --- 6) Bez výměry nebo bez ceny se nepočítá nic ---------------------
je('bez výměry žádný odhad', model.odhad({ okres: 'Kolín', type: 'sale', druh: 'orná půda', price: 100000 }), null);
je('bez ceny žádný odhad', model.odhad({ okres: 'Kolín', type: 'sale', druh: 'orná půda', area: 1000 }), null);

// --- 7) Percentil funguje na běžných datech --------------------------
const levny = { place: 'L', okres: 'Cheb', type: 'sale', druh: 'stavební pozemek', area: 1000, price: 900000 };
const model3 = PK_CENY.postav([...pole(12, (i) => ({
  place: 'P' + i, okres: 'Cheb', type: 'sale', druh: 'stavební pozemek',
  area: 1000, price: 1000000 + i * 200000,
})), levny], OKRES_KRAJ);
const pc = model3.percentil(levny);
pravda('nejlevnější nabídka je v dolní části žebříčku', !!pc && pc.cheaper >= 90,
  `levnější než ${pc && pc.cheaper} % podobných`);

console.log('\nCenový model — odhad obvyklé ceny a věrohodnost');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Cenový model: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
