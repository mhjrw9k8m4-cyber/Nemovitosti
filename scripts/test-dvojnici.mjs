/* TÝŽ POZEMEK DVAKRÁT, POD DVĚMA ČÍSLY INZERÁTU
 * ---------------------------------------------
 * Duplicity se odstraňovaly podle čísla inzerátu, což je záměr — ale
 * prodejci týž pozemek vyvěšují znovu, takže dva různé inzeráty
 * popisovaly jednu parcelu. Naměřeno 12 dvojic z 2 001 nabídek.
 * Pozemek pak byl ve výpisu dvakrát, dvakrát se započítal do součtů
 * i mediánů, a vlastní stránku dostal jen jeden z dvojice — jméno
 * souboru se skládá z klíče, výměry a ceny, a ty byly shodné. Řádek
 * druhého tedy vedl na stránku prvního. V Bohumíně se ty dva inzeráty
 * lišily druhem: výpis stavebních pozemků slíbil „stavební pozemek"
 * a stránka za odkazem říkala „Orná půda".
 *
 * Hlídají se tři věci: samotná funkce (že slučuje jen opravdové
 * dvojníky a nikdy dvě různé nabídky), hotová data (že v nich žádný
 * dvojník nezůstal) a invariant, který tím vším stojí — že KAŽDÁ
 * nabídka má vlastní jméno stránky.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bezDvojnic, klicDvojnika } from './fetch-opportunities.mjs';
import { souborProDalsi } from './generate-parcel-pages.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0; let chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- FUNKCE NA NASAZENÝCH VZORCÍCH -------------------------------- */
const zaklad = {
  place: 'Bohumín', okres: 'Karviná', type: 'sale', parcel: '—',
  druh: 'orná půda', area: 1370, price: 999000, lat: 49.887422, lng: 18.32725,
};
function s(zmeny) { return { ...zaklad, ...zmeny }; }

{
  const a = s({ url: 'x/1050656' }); const b = s({ url: 'x/1050655' });
  const v = bezDvojnic([a, b]);
  pravda('dvě nabídky lišící se jen číslem inzerátu se sloučí v jednu',
    v.cisto.length === 1 && v.vyhozeno.length === 1, JSON.stringify({ c: v.cisto.length, v: v.vyhozeno.length }));
  pravda('a vynechaná je ta druhá v řadě', v.vyhozeno[0] === b, 'vyhozena jiná');
}
/* ROZDÍLY, KTERÉ SE SLOUČIT NESMÍ. Sloučit dvě skutečné nabídky by
   bylo horší než nechat projít jednu duplicitu, takže každý rozlišující
   údaj má vlastní kontrolu. */
for (const [co, zmena] of [
  ['výměrou', { area: 1371 }],
  ['cenou', { price: 998000 }],
  ['parcelním číslem', { parcel: '232' }],
  ['typem (prodej × dražba)', { type: 'drazba' }],
  ['obcí', { place: 'Rychvald' }],
  ['okresem', { okres: 'Ostrava-město' }],
  ['souřadnicemi', { lat: 49.9 }],
]) {
  const v = bezDvojnic([s({ url: 'a' }), s({ ...zmena, url: 'b' })]);
  pravda(`nabídky lišící se ${co} zůstanou dvě`, v.cisto.length === 2,
    `zbylo ${v.cisto.length}`);
}
{
  /* Souřadnice se porovnávají na tři desetinná místa, tedy asi na sto
     metrů — jemnější rozdíl je tentýž pozemek. */
  const v = bezDvojnic([s({ url: 'a' }), s({ lat: 49.887499, url: 'b' })]);
  pravda('rozdíl v souřadnicích pod sto metrů je týž pozemek',
    v.cisto.length === 1, `zbylo ${v.cisto.length}`);
}
{
  /* PŘI ROZPORU MÉNĚ TVRDÍCÍ VARIANTA. */
  const orna = s({ druh: 'orná půda', url: 'a' });
  const stavebni = s({ druh: 'stavební pozemek', url: 'b' });
  const prvni = bezDvojnic([stavebni, orna]);
  pravda('při rozporu v druhu zůstane ta méně tvrdící (orná, ne stavební)',
    prvni.cisto.length === 1 && prvni.cisto[0] === orna,
    `zůstalo ${prvni.cisto.map((o) => o.druh).join(', ')}`);
  const druhe = bezDvojnic([orna, stavebni]);
  pravda('a nezáleží na tom, která přišla první',
    druhe.cisto.length === 1 && druhe.cisto[0] === orna,
    `zůstalo ${druhe.cisto.map((o) => o.druh).join(', ')}`);
}
{
  const a = s({ url: 'a' }); const b = s({ place: 'Rychvald', url: 'b' }); const c = s({ url: 'c' });
  const v = bezDvojnic([a, b, c]);
  pravda('pořadí zbylých nabídek zůstává takové, v jakém přišly',
    v.cisto[0] === a && v.cisto[1] === b, 'pořadí se zamíchalo');
}
pravda('prázdný vstup funkci nerozbije',
  bezDvojnic([]).cisto.length === 0 && bezDvojnic(undefined).cisto.length === 0,
  'spadlo');
pravda('klíč dvojníka nese parcelní číslo (dvě různé parcely se nesloučí)',
  klicDvojnika(s({ parcel: '232' })) !== klicDvojnika(s({ parcel: '—' })),
  'parcelní číslo v klíči chybí');

/* --- HOTOVÁ DATA --------------------------------------------------- */
const nab = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities;
pravda('nabídek je dost na to, aby kontrola něco znamenala', nab.length > 500,
  `nabídek ${nab.length}`);
{
  const v = bezDvojnic(nab);
  pravda('v hotových datech nezůstal ani jeden dvojník',
    v.vyhozeno.length === 0,
    `dvojníků ${v.vyhozeno.length}: ` + v.vyhozeno.slice(0, 3)
      .map((o) => `${o.place} ${o.area} m² ${o.price} Kč`).join(' | '));
}
{
  /* INVARIANT, KTERÝ TÍM VŠÍM STOJÍ. Kdyby dvě nabídky vyšly na jedno
     jméno souboru, jedna z nich stránku nedostane a její řádek povede
     na cizí pozemek — právě to se v Bohumíně stalo. */
  const jmena = new Map();
  for (const d of nab) {
    const j = souborProDalsi(d);
    if (!jmena.has(j)) jmena.set(j, []);
    jmena.get(j).push(d);
  }
  const kolize = [...jmena.entries()].filter(([, a]) => a.length > 1);
  pravda('každá nabídka má vlastní jméno stránky', kolize.length === 0,
    `kolidujících jmen ${kolize.length}: ` + kolize.slice(0, 3)
      .map(([j, a]) => `${j} ← ${a.map((o) => o.druh).join(' + ')}`).join(' | '));
}

console.log('\nDvojníci (týž pozemek pod dvěma inzeráty)');
console.log(zpravy.join('\n'));
console.log(`\nNabídek v datech: ${nab.length}`);
if (chyb) {
  console.log('::error::Dvojníci: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
console.log(`\n${ok} v pořádku, 0 chyb\n`);
