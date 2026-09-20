// Testy hlídání lokality (js/hlidani-logika.js).
//
// Spuštění: node scripts/test-hlidani.mjs
//
// Tahle logika rozhoduje, co je pro člověka „nový pozemek". Když se splete
// směrem dolů, hlídání mlčí a člověk o příležitost přijde. Když nahoru,
// odznak svítí naprázdno a za pár dní si ho nikdo nevšimne.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = createRequire(import.meta.url)(path.join(ROOT, 'js', 'hlidani-logika.js'));

let bezi = 0, spadlo = 0;
const vysledky = [];
function je(skupina, popis, vyslo, cekano) {
  bezi++;
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a !== b) { spadlo++; vysledky.push(`  ✕ ${skupina}: ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

const P = (o) => Object.assign({ type: 'sale', okres: 'Kolín', place: 'Kolín', druh: 'stavební pozemek',
  parcel: '123/4', price: 500000, area: 800 }, o);

/* ---------------- shoda s hledáním ---------------- */
je('shoda', 'prázdné hledání bere vše', H.matches({}, P()), true);
je('shoda', 'okres sedí bez diakritiky', H.matches({ okres: 'kolin' }, P()), true);
je('shoda', 'okres sedí s diakritikou', H.matches({ okres: 'Kolín' }, P()), true);
je('shoda', 'jiný okres nesedí', H.matches({ okres: 'Tábor' }, P()), false);
// Lidé píšou do políčka „kde" i obec, ne jen okres — musí projít obojí.
je('shoda', 'hledá se i podle obce', H.matches({ okres: 'Zásmuky' }, P({ place: 'Zásmuky', okres: 'Kolín' })), true);
je('shoda', 'druh sedí', H.matches({ druh: 'stavební' }, P()), true);
je('shoda', 'jiný druh nesedí', H.matches({ druh: 'louka' }, P()), false);
je('shoda', 'typ sedí', H.matches({ ptype: 'sale' }, P()), true);
je('shoda', 'jiný typ nesedí', H.matches({ ptype: 'drazba' }, P()), false);

/* ---------------- cena a výměra ---------------- */
je('meze', 'pod maximem projde', H.matches({ max_price: 600000 }, P()), true);
je('meze', 'nad maximem neprojde', H.matches({ max_price: 400000 }, P()), false);
je('meze', 'přesně na maximu projde', H.matches({ max_price: 500000 }, P()), true);
je('meze', 'nad minimem výměry projde', H.matches({ min_area: 500 }, P()), true);
je('meze', 'pod minimem výměry neprojde', H.matches({ min_area: 1000 }, P()), false);
// Pozemek bez ceny nesmí projít cenovým filtrem — jinak by se do „do 300 tisíc"
// namíchaly dražby bez uvedené ceny a hlídání by hlásilo nesmysly.
je('meze', 'pozemek bez ceny neprojde cenovým filtrem',
  H.matches({ max_price: 600000 }, P({ price: 0 })), false);
je('meze', 'pozemek bez výměry neprojde filtrem výměry',
  H.matches({ min_area: 100 }, P({ area: 0 })), false);

/* ---------------- vybavení ---------------- */
je('vybavení', 'požadovaná elektřina chybí',
  H.matches({ features: ['Elektřina'] }, P({ features: ['Voda'] })), false);
je('vybavení', 'požadovaná elektřina je',
  H.matches({ features: ['Elektřina'] }, P({ features: ['Voda', 'Elektřina'] })), true);
je('vybavení', 'chce se dvojí, je jen jedno',
  H.matches({ features: ['Elektřina', 'Voda'] }, P({ features: ['Elektřina'] })), false);
je('vybavení', 'přístupová cesta se bere z pole access',
  H.matches({ features: ['Přístupová cesta'] }, P({ access: 'zpevněná cesta' })), true);
je('vybavení', 'bez cesty neprojde',
  H.matches({ features: ['Přístupová cesta'] }, P({ access: 'přes cizí pozemek' })), false);

/* ---------------- otisk ---------------- */
je('otisk', 'stejný pozemek má stejný otisk', H.keyOf(P()) === H.keyOf(P()), true);
je('otisk', 'změna ceny je jiný pozemek', H.keyOf(P()) === H.keyOf(P({ price: 600000 })), false);
je('otisk', 'diakritika otisk nemění', H.keyOf(P({ okres: 'Kolín' })), H.keyOf(P({ okres: 'kolin' })));
// Musí sedět s keyOf() v js/hlidani-logika.js, jinak by aplikace hlásila
// jako nové něco, co už člověk viděl (a naopak).
je('otisk', 'tvar otisku se nezměnil', H.keyOf(P()), 'sale|kolin|kolin|123/4|500000|800');

/* ---------------- počet nových ---------------- */
const DATA = [P(), P({ parcel: '9/1', price: 300000 }), P({ okres: 'Tábor', place: 'Tábor', parcel: '5/5' })];
je('nové', 'bez viděných jsou nové všechny, co sedí',
  H.novychProHledani({ okres: 'Kolín', seen_keys: [] }, DATA), 2);
je('nové', 'viděný se nepočítá',
  H.novychProHledani({ okres: 'Kolín', seen_keys: [H.keyOf(DATA[0])] }, DATA), 1);
je('nové', 'všechny viděné = nula',
  H.novychProHledani({ okres: 'Kolín', seen_keys: DATA.map(H.keyOf) }, DATA), 0);
je('nové', 'hledání mimo lokalitu nic nenajde',
  H.novychProHledani({ okres: 'Brno', seen_keys: [] }, DATA), 0);

// Jeden pozemek může sedět na dvě hledání. Na odznaku se smí objevit jednou,
// jinak by číslo rostlo s počtem hledání, ne s počtem pozemků.
const DVE = [{ okres: 'Kolín', seen_keys: [] }, { druh: 'stavební', seen_keys: [] }];
je('nové', 'pozemek ve dvou hledáních se počítá jednou', H.novychCelkem(DVE, DATA), 3);
je('nové', 'žádné hledání = nic na odznaku', H.novychCelkem([], DATA), 0);
je('nové', 'žádná data nespadnou', H.novychCelkem(DVE, []), 0);

/* ---------------- výsledek ---------------- */
console.log(`\nHlídání lokality: ${bezi} testů`);
if (spadlo) {
  console.log(vysledky.join('\n'));
  console.error(`\n${spadlo} z ${bezi} NEPROŠLO.`);
  process.exit(1);
}
console.log('Všechny prošly.\n');
