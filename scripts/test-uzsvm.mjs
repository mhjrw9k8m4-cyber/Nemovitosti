/* Test: čtení nabídek ÚZSVM z jejich API
   ==================================================================
   Spuštění: node scripts/test-uzsvm.mjs   (bez prohlížeče i sítě)

   FIXTURY JSOU SKUTEČNÉ ZÁZNAMY z běhu ohledání 41802028063
   (4. 11. 2026, POST /api/Property/List, CategoryId 13 „Pozemky").
   Vymyšlené fixtury mě dnes jednou stály půl práce: u čtečky
   otevřených dat státu jsem podle vymyšleného popisu napsal „ber
   poslední výměru", kdežto skutečná data říkají „dvě výměry = dvě
   parcely, sečti je" (§365). Co tu stojí, to opravdu přišlo po drátě.

   CO SE TU MĚŘÍ NEJVÍC: ŽE SE PACHT NEVYDÁVÁ ZA PRODEJ. Ze pěti
   prvních pozemků byly čtyři pacht a cena u nich je ROČNÍ NÁJEM
   (500 Kč, 1 207 Kč, 2 824 Kč). Kdyby se to čtlo jako prodej, na webu
   by stál „pozemek za 500 Kč" a pokazilo by to i statistiku Kč/m².
   ================================================================== */
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import * as U from './cti-uzsvm.mjs';
import { vymeraZPopisu, druhZPopisu } from './cti-nabidky-statu.mjs';

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

/* --- SKUTEČNÉ ZÁZNAMY ------------------------------------------- */
const PRODEJ = {
  Id: 149475,
  Name: 'pozemek p. č. 233/3 v k. ú. Bukovec',
  Description: 'Pozemek p. č. 233/3 o výměře 15 003 m2 se nachází v okrajové části obce.'
    + ' Větší část pozemku se nachází v zastavěném území obce, menší část s hřištěm mimo zastavěné území.',
  CategoryName: 'Pozemky',
  Price: '35 000 000,00',
  NoPrice: false,
  EndOfUserApplying: '04.01.2027 23:59',
  StatusName: 'Aukce vyhlášena (05.01.2027 11:00 - 06.01.2027 11:00)',
  DistrictName: 'Plzeň-město',
};
const PACHT = {
  Id: 167814,
  Name: 'Pacht pozemku p.č. 3264, 3266, 2228/74, Tlumačov na Moravě',
  Description: 'Předmětem aukce je pacht pozemku(ů) ve vlastnictví státu, příslušnosti'
    + ' hospodařit Státního pozemkového úřadu. Nabízené pozemky jsou zapsány na LV 10002'
    + ' a jsou o celkové výměře 12 345 m2.',
  CategoryName: 'Pozemky',
  Price: '3 265,00',
  NoPrice: false,
  StatusName: 'Aukce vyhlášena (10.11.2026 10:00 - 24.11.2026 14:30)',
  DistrictName: 'Zlín',
};
const PACHT2 = {
  Id: 167811,
  Name: 'Pacht pozemku p.č. 4862/16, Napajedla',
  Description: 'Předmětem aukce je pacht pozemku(ů) ve vlastnictví státu o výměře 500 m2.',
  CategoryName: 'Pozemky',
  Price: '500,00',
  NoPrice: false,
  StatusName: 'Aukce vyhlášena (10.11.2026 10:00 - 24.11.2026 13:00)',
  DistrictName: 'Zlín',
};

/* ---- 1) CENA JE ČESKY NAPSANÝ ŘETĚZEC -------------------------- */
{
  je('„35 000 000,00" je pětatřicet milionů', U.cena('35 000 000,00'), 35000000);
  je('nedělitelná mezera nevadí', U.cena('1 207,00'), 1207);
  je('haléře se zaokrouhlí', U.cena('2 824,60'), 2825);
  je('prázdno není cena', U.cena(''), null);
  je('nula není cena', U.cena('0,00'), null);
  je('a nesmysl taky ne', U.cena('na dotaz'), null);
}

/* ---- 2) PARCELNÍ ČÍSLO A MÍSTO Z NÁZVU ------------------------- */
{
  je('parcela z „p. č. 233/3 v k. ú. Bukovec"', U.parcelaZNazvu(PRODEJ.Name), '233/3');
  je('víc parcel se vypíše, jak jsou', U.parcelaZNazvu(PACHT.Name), '3264, 3266, 2228/74');
  je('bez parcelního čísla vyjde prázdno', U.parcelaZNazvu('Pozemek u lesa'), '');
  je('místo z katastrálního území', U.mistoZNazvu(PRODEJ.Name), 'Bukovec');
  je('místo za poslední čárkou', U.mistoZNazvu(PACHT2.Name), 'Napajedla');
  je('a víceslovné místo zůstane celé', U.mistoZNazvu(PACHT.Name), 'Tlumačov na Moravě');
  /* Kdyby za poslední čárkou stálo jen číslo, místo to není. */
  je('číslo za čárkou se za místo nevydává', U.mistoZNazvu('Pozemek p.č. 12, 13/4'), '');
}

/* ---- 3) PACHT SE NEVYDÁVÁ ZA PRODEJ ---------------------------- */
{
  const z = {};
  const { nabidky } = U.nabidkyZOdpovedi(
    { Properties: [PRODEJ, PACHT, PACHT2] }, vymeraZPopisu, druhZPopisu, z);
  je('ze tří záznamů zůstane jediný prodej', nabidky.length, 1);
  je('a dva pachty se započítají', z.pacht, 2);
  const n = nabidky[0] || {};
  je('prodej je celý a správně', {
    place: n.place, okres: n.okres, parcel: n.parcel, area: n.area, price: n.price, type: n.type,
  }, { place: 'Bukovec', okres: 'Plzeň-město', parcel: '233/3', area: 15003, price: 35000000, type: 'sale' });
  pravda('nese termín aukce i lhůtu přihlášek',
    /Aukce vyhlášena/.test(n.extra || '') && /přihlášky do 04\.01\.2027/.test(n.extra || ''),
    String(n.extra));
  pravda('a vlastní klíč podle čísla nabídky', n._key === 'uzsvm-149475', String(n._key));
  je('a štítek zdroje', n.zdroj, 'ÚZSVM');
  /* Cena za metr musí vyjít rozumně — tohle je ta kontrola, která by
     u pachtu (500 Kč za pozemek) vyšla jako 1 Kč/m². */
  pravda('cena za metr je u prodeje v řádu tisíců, ne jednotek',
    Math.round(n.price / n.area) > 1000, String(Math.round(n.price / n.area)) + ' Kč/m²');
}

/* ---- 4) KVALITA: CO SE ZAHAZUJE A POČÍTÁ ----------------------- */
{
  const z = {};
  U.nabidkyZOdpovedi({ Properties: [
    { ...PRODEJ, CategoryName: 'Stavby' },
    { ...PRODEJ, Price: '', NoPrice: true },
    { ...PRODEJ, Description: 'Pozemek bez udané výměry.', Name: 'pozemek p. č. 1 v k. ú. Nic' },
    { ...PRODEJ, DistrictName: '' },
    { ...PRODEJ, Name: 'Pozemek bez místa' },
    null,
  ] }, vymeraZPopisu, druhZPopisu, z);
  je('stavba se nebere', z.neniPozemek, 1);
  je('bez ceny se nebere', z.bezCeny, 1);
  je('bez výměry se nebere', z.bezVymery, 1);
  je('bez okresu se nebere', z.bezOkresu, 1);
  je('bez místa se nebere', z.bezMista, 1);
  je('a prázdný záznam nic neshodí', z.prazdnyZaznam, 1);
  je('prázdná odpověď nic nevrátí', U.nabidkyZOdpovedi({}, vymeraZPopisu, druhZPopisu, {}).nabidky.length, 0);
  je('a nic taky ne', U.nabidkyZOdpovedi(null, vymeraZPopisu, druhZPopisu, {}).nabidky.length, 0);
}

/* ---- 4b) KE KAŽDÉMU ZAHOZENÍ UKÁZKA, A POČET Z ČÍSELNÍKU -------
   „bezVymery 119" může znamenat, že výměra v popisu opravdu není, i že
   ji čteme špatně — a to je rozdíl mezi „data za to nemůžou" a „můžeme
   my" (§366). A `PropertyTotalCount` je počet VŠEHO (757 věcí všeho
   druhu), ne počet pozemků: kdo ho vypíše jako „v kategorii Pozemky",
   lže o řád. První běh naostro to udělal, tohle to hlídá. */
{
  const z = {};
  U.nabidkyZOdpovedi({ Properties: [PACHT] }, vymeraZPopisu, druhZPopisu, z);
  pravda('u pachtu je vidět, co to bylo za nabídku',
    /Pacht pozemku/.test((z.ukazky || {}).pacht || ''), JSON.stringify(z.ukazky));
  const z2 = {};
  U.nabidkyZOdpovedi({ Properties: [{ ...PRODEJ, Description: 'Pozemek bez udané výměry.' ,
    Name: 'pozemek p. č. 9 v k. ú. Nic' }] }, vymeraZPopisu, druhZPopisu, z2);
  pravda('a u chybějící výměry je vidět popis, ze kterého se čte',
    /bez udané výměry/.test((z2.ukazky || {}).bezVymery || ''), JSON.stringify(z2.ukazky));

  je('počet v kategorii se bere z číselníku',
    U.pocetVKategorii({ Categories: [{ p02Id: 10, FilteredCount: 399,
      Subcategories: [{ p02Id: 13, FilteredCount: 286 }] }] }), 286);
  je('a bez číselníku se nic netvrdí', U.pocetVKategorii({}), null);
  /* A robot ten počet opravdu bere odtud, ne z PropertyTotalCount. */
  const kod = readFileSync(new URL('./fetch-opportunities.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const telo = (kod.match(/async function fetchUzsvm\(\)[\s\S]*?\n}/) || [''])[0];
  pravda('robot hlásí počet z číselníku, ne počet všeho',
    /UZ\.pocetVKategorii\(data\)/.test(telo) && !/PropertyTotalCount/.test(telo),
    telo.slice(0, 200));
  pravda('a ukázky vypisuje',
    /zahozeno\.ukazky/.test(telo), 'v logu by nebylo vidět, co se zahodilo');
}

/* ---- 5) DOTAZ MÁ TVAR, KTERÝ API ČEKÁ -------------------------- */
{
  const d = JSON.parse(U.dotaz(2, 100));
  je('strana a velikost strany', [d.Page, d.PageSize], [2, 100]);
  je('kategorie Pozemky je 13 (změřeno z číselníku)', d.CategoryId, 13);
  pravda('ukončené nabídky se nechtějí', d.ShowEndedProperties === false);
  pravda('a tělo je platný JSON se všemi poli, která API posílá',
    typeof d.ListType === 'string' && 'Fulltext' in d && 'State' in d, U.dotaz(1, 1));
}

console.log('ÚZSVM — nabídky majetku státu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) console.error(`::error::ÚZSVM: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`);
process.exit(chyb ? 1 : 0);
