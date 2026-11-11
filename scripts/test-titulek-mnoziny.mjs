/* Test: titulek a věta o cenách na okresních stránkách nelžou o obsahu.
   ==================================================================
   Spuštění: node scripts/test-titulek-mnoziny.mjs   (bez prohlížeče)

   Okresních stránek je 77 a každá o sobě dvakrát tvrdí něco, co se
   nedá poznat okem:

   1. TITULEK ŘÍKÁ, CO NA STRÁNCE VEDE. Do 11. 11. tam stálo napevno
      „Pozemky okres X". Změřeno: na stránce Prahy je z 780 nabídek
      pozemkem 31, tedy 4 % — zbytek byty, domy a garáže. Titulek
      „Pozemky okres Praha" tedy vedl slovem, které platilo pro jednu
      nabídku z pětadvaceti, a to ve výsledku hledání, kde je titulek
      jediné, co člověk před klepnutím vidí. Pozemky byly v menšině na
      10 okresech ze 77.

   2. VĚTA „CENY OD" ŘÍKÁ, ZA KOLIK SE TAM DÁ KOUPIT NEMOVITOST. Do
      11. 11. se brala nejnižší cena ze všech nabídek — včetně
      spoluvlastnických podílů, kde se platí za zlomek. V Táboru stál
      nejlevnější podíl 20 000 Kč a nejlevnější celá nemovitost
      132 031 Kč; úryvek v Googlu tedy sliboval šestinu skutečné ceny.
      U 22 okresů ze 77 táhl podíl ten slib dolů, nejvíc u Prahy-západ
      (25 000 proti 299 000, dvanáctinásobek).

   PRAVIDLO SE TU VYSLOVUJE ZNOVU A Z DAT, ne přes funkce generátoru
   (titulekMnoziny, vetaOCenach). Důvod je týž, jaký je rozepsaný
   v test-cisla-okresu: kdyby zkouška volala tutéž funkci jako web,
   obě strany by se shodly i na lži a hlídač by mlčel. Čtou se proto
   holá pole dat — `kat` a `podil` — a výsledek se porovnává s tím, co
   je na stránce napsané.

   PROTI VLASTNÍ PRÁZDNOTĚ. Kontrola, která si stránku hledá regulárním
   výrazem, umí tiše přestat měřit. Proto se nejdřív ověří, kolik
   stránek a kolik vět se opravdu přečetlo, a každá nepřečtená stránka
   je chyba, ne přeskočení.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb`);
  process.exit(chyb ? 1 : 0);
}

const pozaduj = createRequire(import.meta.url);
/* Týž vzorek jako v generátoru: bez duplicit a bez nabídek po termínu.
   Jiný vzorek by hlásil rozchod o jednu dvě nabídky u každého okresu
   a nebyla by to chyba webu. */
const PKH = pozaduj(path.join(KOREN, 'js', 'hlidani-logika.js'));
new Function(fs.readFileSync(path.join(KOREN, 'js', 'terminy.js'), 'utf8'))();
const T = globalThis.PK_TERMINY;
pravda('js/terminy.js dal podmínku „po termínu"', !!(T && T.poTerminu),
  'bez ní by se do vzorku dostaly i proběhlé dražby');
if (!T || !T.poTerminu) hotovo();

const vse = PKH.bezDuplicit(
  JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities);
const aktualni = vse.filter((o) => !T.poTerminu(o));
pravda(`data se přečetla (${aktualni.length} aktuálních nabídek)`, aktualni.length > 500,
  `jen ${aktualni.length}`);

const poOkresu = {};
for (const o of aktualni) if (o && o.okres) (poOkresu[o.okres] = poOkresu[o.okres] || []).push(o);

/* Dvě podmínky vyslovené znovu, z holých polí dat. */
const jePozemek = (o) => !o || !o.kat || o.kat === 'pozemek';
const cislo = (x) => +String(x).replace(/[\s ]/g, '');

const rozchody = [];
let stranek = 0, titulku = 0, vet = 0, bezCeny = 0;

for (const f of fs.readdirSync(KOREN).sort()) {
  if (!/^pozemky-okres-.*\.html$/.test(f)) continue;
  stranek++;
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8').replace(/ /g, ' ');

  const mH1 = h.match(/<h1>(?:Pozemky|Nemovitosti) v okrese ([^.<]+)\./);
  const okres = mH1 && mH1[1];
  if (!okres) { rozchody.push(`${f}: jméno okresu se z <h1> nepřečetlo`); continue; }
  const list = poOkresu[okres];
  if (!list || !list.length) { rozchody.push(`${f}: okres „${okres}" není v datech`); continue; }

  // 1. Titulek vede slovem podle převahy.
  const mT = h.match(/<title>(Pozemky|Nemovitosti) okres /);
  if (!mT) { rozchody.push(`${f}: titulek nezačíná ani „Pozemky okres", ani „Nemovitosti okres"`); continue; }
  titulku++;
  const pozemku = list.filter(jePozemek).length;
  const cekaneSlovo = pozemku * 2 >= list.length ? 'Pozemky' : 'Nemovitosti';
  if (mT[1] !== cekaneSlovo) {
    rozchody.push(`${f}: titulek vede slovem „${mT[1]}", přitom pozemků je ${pozemku} z ${list.length}`
      + ` — má být „${cekaneSlovo}"`);
  }

  // 2. Věta „Ceny od" vede cenou celé nemovitosti, podíl se dopovídá za ní.
  const sCenou = list.filter((o) => o && o.price > 0);
  const mD = h.match(/name="description" content="([^"]*)"/);
  if (!mD) { rozchody.push(`${f}: popis pro vyhledávače se nepřečetl`); continue; }
  const popis = mD[1];
  if (!sCenou.length) {
    bezCeny++;
    if (/Ceny od/.test(popis)) rozchody.push(`${f}: popis slibuje ceny, přitom žádná nabídka cenu nemá`);
    continue;
  }
  const nejniz = Math.min(...sCenou.map((o) => o.price));
  const cele = sCenou.filter((o) => !o.podil).map((o) => o.price);
  const mC = popis.match(/Ceny od ([\d ]+) Kč(?: za spoluvlastnický podíl)?(?:, spoluvlastnické podíly od ([\d ]+) Kč)?\./);
  if (!mC) { rozchody.push(`${f}: věta „Ceny od …" se v popisu nenašla: ${popis.slice(-70)}`); continue; }
  vet++;
  const vedeno = cislo(mC[1]);
  const podilVete = mC[2] ? cislo(mC[2]) : null;
  if (!cele.length) {
    if (vedeno !== nejniz || !/za spoluvlastnický podíl/.test(popis)) {
      rozchody.push(`${f}: všechny nabídky s cenou jsou podíly, popis to musí říct — stojí tam „${mC[0]}"`);
    }
    continue;
  }
  const nejnizCele = Math.min(...cele);
  if (vedeno !== nejnizCele) {
    rozchody.push(`${f}: popis vede cenou ${vedeno}, nejlevnější CELÁ nemovitost stojí ${nejnizCele}`);
  }
  if (nejniz < nejnizCele && podilVete !== nejniz) {
    rozchody.push(`${f}: nejlevnější podíl je ${nejniz}, popis o něm `
      + (podilVete === null ? 'mlčí' : `tvrdí ${podilVete}`));
  }
  if (nejniz === nejnizCele && podilVete !== null) {
    rozchody.push(`${f}: popis dopovídá podíl ${podilVete}, přitom žádný podíl pod cenou celé nabídky není`);
  }
}

pravda(`přečetlo se 77 okresních stránek (${stranek})`, stranek === 77, `našlo se ${stranek}`);
pravda(`na každé se přečetl titulek (${titulku})`, titulku === stranek,
  `titulků ${titulku} proti ${stranek} stránkám`);
pravda(`na každé se přečetla věta o cenách (${vet} + ${bezCeny} bez cen)`,
  vet + bezCeny === stranek, `vět ${vet}, bez cen ${bezCeny}, stránek ${stranek}`);
pravda('titulek vede slovem podle převahy a věta o cenách nevydává podíl za celou nemovitost',
  rozchody.length === 0, rozchody.slice(0, 12).join('\n      ')
  + (rozchody.length > 12 ? `\n      … a dalších ${rozchody.length - 12}` : ''));

hotovo();
