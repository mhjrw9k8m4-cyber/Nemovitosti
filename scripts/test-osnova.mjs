/* OSNOVA NADPISŮ: jeden h1 a žádná přeskočená úroveň.
 *
 * Spuštění: node scripts/test-osnova.mjs   (nepotřebuje prohlížeč)
 *
 * Nadpisy nejsou velikost písma, jsou OBSAH. Podle nich se po stránce
 * pohybuje čtečka pro nevidomé (skok na další oddíl) i vyhledávač, který
 * z nich bere, o čem stránka je. Když osnova přeskočí úroveň, čtečka
 * ohlásí „oddíl třetí úrovně" tam, kde žádný druhý není — a člověk
 * nemá podle čeho poznat, co pod co patří.
 *
 * Změřeno 13. 10. na 2 064 živých stránkách, PŘED opravou:
 *   95 stránek mělo přeskočenou úroveň.
 *   • 91 krajských a okresních výpisů + výpis dražeb + rozcestník podle
 *     okresů: h1 → h3 → h2. Blok s odkazem na mapu stál hned za h1
 *     a měl h3, takže první skutečný oddíl (h2) se tvářil jako nadřazený
 *     tomu, co bylo nad ním.
 *   • Úvodní stránka: h2 → h4, a to osmnáctkrát — každý pojem ve
 *     slovníčku byl h4 pod oddílem h2.
 *   • pozemek-od-obce.html: h3 → h5, protože jako JEDINÁ živá stránka
 *     na webu si ještě nesla starou sloupcovou patičku s h5 v hlavičkách
 *     sloupců; všechny ostatní mají jednoduchou patičku bez nadpisů.
 * Po opravě: 0.
 *
 * KOMENTÁŘE A SKRIPTY SE VYBÍLÍ. Moje první sonda hlásila na úvodní
 * stránce dva h1 — a byl to její vlastní omyl: text „Jediný <h1>, co
 * úvodní…" stojí v komentáři nad tím nadpisem. Zkouška, která hlásí
 * chyby, jež na stránce nejsou, je horší než žádná, protože se jí
 * přestane věřit.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Stránky, které h1 ve značkách mít nemají — každá s důvodem.
   Výjimka bez důvodu je smetiště, proto zkouška u každé ověří, že ten
   důvod pořád platí. */
const BEZ_H1 = {
  'pozemek.html': { proc: 'předloha stránky pozemku — h1 vkládá js/pozemek.js z dat', znacka: 'PK_POZEMEK' },
  'inzerce.html': { proc: 'přesměrování na pridat.html', znacka: 'http-equiv="refresh"' },
  'pozemky-od-lidi.html': { proc: 'přesměrování na index.html#od-lidi', znacka: 'http-equiv="refresh"' },
  'predloha.html': { proc: 'vzorník vizuálního jazyka — ukazuje podobu h1 jako exponát, takže ho má dvakrát', znacka: 'data-mera' },
};

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Komentáře, skripty a styly se vybílí — ne smažou, aby čísla řádků
   dál ukazovala na opravdový řádek. */
function ocisti(t) {
  return t
    .replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/<script\b[\s\S]*?<\/script>/gi, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/<style\b[\s\S]*?<\/style>/gi, (s) => s.replace(/[^\n]/g, ' '));
}

const soubory = readdirSync(KOREN).filter((f) => /\.html$/.test(f));
let zivych = 0, archivu = 0, nadpisu = 0;
const bezH1 = [], vicH1 = [], preskoky = [];
/* Typ stránky stačí jmenovat jednou — 2 100 stránek pozemků má jednu
   předlohu, takže by to byl 2 100× týž nález. */
const typ = (f) => (/^pozemek-/.test(f) ? 'pozemek-*' : /^pozemky-okres-/.test(f) ? 'pozemky-okres-*'
  : /^pozemky-.*-kraj\.html$/.test(f) ? 'pozemky-*-kraj' : f);

for (const f of soubory) {
  let t;
  try { t = readFileSync(path.join(KOREN, f), 'utf8'); } catch (e) { continue; }
  if (t.indexOf('PK_UKONCENO') >= 0) { archivu++; continue; }   // archiv se nepředělává
  zivych++;
  const cisty = ocisti(t);
  const urovne = [...cisty.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  nadpisu += urovne.length;

  const pocetH1 = urovne.filter((u) => u === 1).length;
  const vyjimka = BEZ_H1[f];
  if (vyjimka) {
    /* Výjimka se nevěří na slovo: ta značka, kvůli které výjimka je,
       na stránce musí být. Jinak se stránka změnila a výjimka lže. */
    if (cisty.indexOf(vyjimka.znacka) < 0 && t.indexOf(vyjimka.znacka) < 0) {
      bezH1.push(`${f}: výjimka tvrdí „${vyjimka.proc}", ale značka ${vyjimka.znacka} na stránce není`);
    }
  } else if (pocetH1 === 0) {
    bezH1.push(`${typ(f)}: žádný h1`);
  } else if (pocetH1 > 1) {
    vicH1.push(`${typ(f)}: ${pocetH1}× h1`);
  }

  for (let i = 1; i < urovne.length; i++) {
    if (urovne[i] - urovne[i - 1] > 1) {
      preskoky.push(`${typ(f)}: h${urovne[i - 1]} → h${urovne[i]} (osnova ${urovne.join(',')})`);
      break;
    }
  }
}

const jen = (a) => [...new Set(a)];

/* PŘEDPOKLAD: opravdu se měřilo. Bez tohohle by zkouška při změně
   značek hlásila „všechno v pořádku" a na žádný nadpis se nepodívala. */
pravda('je co měřit — živé stránky a nadpisy', zivych >= 50 && nadpisu >= 200,
  `živých ${zivych} (archivu přeskočeno ${archivu}), nadpisů ${nadpisu}`);

pravda('každá stránka má právě jeden h1', jen(bezH1).length === 0 && jen(vicH1).length === 0,
  jen(bezH1).concat(jen(vicH1)).slice(0, 8).join('\n      '));

pravda('a žádná nepřeskočí úroveň nadpisu', jen(preskoky).length === 0,
  jen(preskoky).slice(0, 8).join('\n      '));

console.log('\nOsnova nadpisů');
console.log(zpravy.join('\n'));
console.log(`  (živých ${zivych}, archivu přeskočeno ${archivu}, nadpisů ${nadpisu},`
  + ` doložených výjimek bez h1: ${Object.keys(BEZ_H1).length})`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.error(`::error::Osnova nadpisů: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' Úroveň nadpisu určuje osnova stránky, ne vzhled — když má nadpis vypadat'
    + ' menší, řekni to stylem, ne tím, že přeskočíš úroveň.');
  process.exit(1);
}
