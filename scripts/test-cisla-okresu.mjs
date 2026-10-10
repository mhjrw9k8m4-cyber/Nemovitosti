/* Test: čísla na okresních a krajských stránkách se přepočítají z dat.
   ==================================================================
   Spuštění: node scripts/test-cisla-okresu.mjs   (bez prohlížeče)

   Okresních stránek je 77 a každá o sobě tvrdí čtyři až šest čísel:
   kolik pozemků v okrese evidujeme, od kolika do kolika korun jsou
   ceny, a dlaždice s rozpadem podle typu („35 na prodej · 1 exekuce ·
   8 dražeb"). Dohromady přes tři stovky tvrzení — a žádné z nich
   nikdo nepřepočítával. Stačilo by zaměnit filtr, zapomenout na řez po
   termínu nebo spočítat typ z jiné hromádky, a stránka by tvrdila
   číslo, které nikde v datech není. Tyhle chyby se okem nepoznají:
   „v okrese Benešov evidujeme 36 pozemků" vypadá správně vždycky.

   PROTI VLASTNÍ PRÁZDNOTĚ. Kontrola, která čte čísla regulárním
   výrazem, umí tiše přestat měřit — stačí, aby se změnila podoba
   řádku. (Při psaní téhle zkoušky se to stalo dvakrát: `pozemk\w+`
   nesedne na „pozemků", protože `\w` české písmeno není, a `dražb\w*`
   nesedne na „dražba"; čtyřicet dlaždic s dražbami se tím přeskočilo
   a kontrola hlásila nula rozporů.) Proto se nejdřív ověří, KOLIK se
   toho přečetlo, a každá neznámá dlaždice je chyba, ne přeskočení.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as META from './regiony-meta.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const pozaduj = createRequire(import.meta.url);
/* Táž hromádka jako v generátoru: bez duplicit a bez nabídek po termínu.
   Kdyby si tahle zkouška vzala jiný vzorek, hlásila by rozchod o jeden
   dva pozemky u každého okresu — a nebyla by to chyba webu. */
const PKH = pozaduj(path.join(KOREN, 'js', 'hlidani-logika.js'));
new Function(fs.readFileSync(path.join(KOREN, 'js', 'ceny.js'), 'utf8'))();
const CENY = globalThis.PK_CENY;
new Function(fs.readFileSync(path.join(KOREN, 'js', 'terminy.js'), 'utf8'))();
const T = globalThis.PK_TERMINY;
pravda('js/terminy.js dal podmínku „po termínu"', !!(T && T.poTerminu),
  'bez ní by se počítaly i dražby, které už proběhly');
if (!T || !T.poTerminu) hotovo();

const vse = PKH.bezDuplicit(
  JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities);
const aktualni = vse.filter((o) => !T.poTerminu(o));
pravda(`data se přečetla (${aktualni.length} aktuálních nabídek)`, aktualni.length > 500,
  `jen ${aktualni.length}`);
/* ŘEZ PO TERMÍNU DNES NIC NEODŘEZÁVÁ, a je lepší to vědět než si myslet,
   že se tím něco hlídá. Vyzkoušeno sabotáží: když se filtr z téhle
   zkoušky vynechá, všech 306 čísel sedí dál — protože v datech momentálně
   žádná dražba po termínu není. Filtr tu zůstává proto, že generátor ho
   má taky (a až nějaká proběhlá dražba v datech bude, musí se obě strany
   shodnout), ale nedělá se z něj zásluha: vypisuje se, kolik odřízl. */
const prosle = vse.length - aktualni.length;
zpravy.push(`  · pozn.: řez „po termínu" dnes odřízl ${prosle} z ${vse.length} nabídek`
  + (prosle === 0 ? ' — na dnešních datech tedy nic nehlídá' : ''));

/* Slovo na dlaždici se bere, jak na stránce doopravdy stojí — v českém
   skloňování. Neznámé slovo je CHYBA: právě tím kontrola tiše oslepne. */
const TYP = {
  'na prodej': 'sale', 'exekuce': 'exekuce',
  'dražba': 'drazba', 'dražby': 'drazba', 'dražeb': 'drazba',
  'od majitele': 'majitel', 'od obce': 'obec',
};
const cislo = (x) => +String(x).replace(/[\s ]/g, '');
const rozchody = [];
let stranek = 0, pocty = 0, meze = 0, dlazdic = 0, neznamych = 0;

for (const f of fs.readdirSync(KOREN).sort()) {
  if (!/^pozemky-okres-.*\.html$/.test(f)) continue;
  stranek++;
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8').replace(/ /g, ' ');
  const okres = (h.match(/<h1>Pozemky v okrese ([^.<]+)\./) || [])[1];
  if (!okres) { rozchody.push(`${f}: jméno okresu se z <h1> nepřečetlo`); continue; }
  const list = aktualni.filter((o) => o.okres === okres);

  const m = h.match(/Aktuálně evidujeme <b>([\d\s]+) [^<]*<\/b>/);
  if (!m) rozchody.push(`${f}: počet pozemků se z podnadpisu nepřečetl`);
  else {
    pocty++;
    if (cislo(m[1]) !== list.length) rozchody.push(`${f}: tvrdí ${cislo(m[1])} pozemků, v datech ${list.length}`);
  }

  const r = h.match(/Ceny od <b>([\d\s]+) Kč<\/b> do <b>([\d\s]+) Kč<\/b>/);
  const ceny = list.filter((o) => o.price > 0).map((o) => o.price).sort((a, b) => a - b);
  if (r) {
    meze += 2;
    if (!ceny.length) rozchody.push(`${f}: tvrdí rozsah cen, ale v datech není ani jedna cena`);
    else {
      if (cislo(r[1]) !== ceny[0]) rozchody.push(`${f}: nejnižší cena ${cislo(r[1])}, v datech ${ceny[0]}`);
      if (cislo(r[2]) !== ceny[ceny.length - 1]) rozchody.push(`${f}: nejvyšší cena ${cislo(r[2])}, v datech ${ceny[ceny.length - 1]}`);
    }
  }

  for (const mm of h.matchAll(/<div class="okr-stat"><b>([\d\s]+)<\/b><span>([^<]*)<\/span>/g)) {
    const slovo = mm[2];
    if (/^pozemk/.test(slovo)) continue;            // celkový počet se měří výš
    const typ = TYP[slovo];
    if (!typ) {
      neznamych++;
      rozchody.push(`${f}: dlaždice „${slovo}" — slovo kontrola nezná, takže ji přeskočila`);
      continue;
    }
    dlazdic++;
    const kolik = list.filter((o) => o.type === typ).length;
    if (cislo(mm[1]) !== kolik) rozchody.push(`${f}: „${cislo(mm[1])} ${slovo}", v datech ${kolik}`);
  }
}

/* Nejdřív, že se vůbec měřilo. Prahy jsou pod dnešním stavem, ne na něm:
   stránek je 77, počtů 77, mezí 154, dlaždic 75. */
pravda(`okresních stránek se našlo dost (${stranek})`, stranek >= 70, `jen ${stranek}`);
pravda(`počet pozemků se přečetl skoro všude (${pocty} ze ${stranek})`, pocty >= stranek - 2,
  `přečteno ${pocty} — změnila se podoba podnadpisu?`);
pravda(`rozsah cen se přečetl (${meze} mezí)`, meze >= 140, `jen ${meze} — změnil se zápis „Ceny od … do …"?`);
pravda(`dlaždic podle typu se přepočítalo dost (${dlazdic})`, dlazdic >= 60,
  `jen ${dlazdic} — změnila se podoba dlaždice, nebo české slovo, které kontrola nezná`);
pravda('a žádná dlaždice se nepřeskočila kvůli neznámému slovu', neznamych === 0,
  `přeskočeno ${neznamych} — doplňte slovo do tabulky TYP`);

/* --- A TOTÉŽ NA KRAJSKÝCH STRÁNKÁCH -------------------------------
   Čtrnáct krajů, táž tvrzení. Jméno kraje se NEBERE z <h1> — tam stojí
   skloněné („v Jihočeském kraji", „na Vysočině", „v Praze") a klíč
   v datech je „Jihočeský". Při psaní téhle zkoušky jsem to zkusil
   a dostal čtrnáct falešných rozchodů; převod má jedno místo,
   scripts/regiony-meta.mjs, odkud si jména vyrábí i generátor. */
const OKRES_KRAJ = (CENY && CENY.OKRES_KRAJ) || {};
pravda(`tabulka okres → kraj se přečetla (${Object.keys(OKRES_KRAJ).length} okresů)`,
  Object.keys(OKRES_KRAJ).length >= 70, `jen ${Object.keys(OKRES_KRAJ).length}`);
let kraju = 0, krajMez = 0;
for (const klic of Object.keys(META.KRAJ_META)) {
  const f = META.krajFile(klic);
  if (!fs.existsSync(path.join(KOREN, f))) { rozchody.push(`${klic}: stránka ${f} chybí`); continue; }
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8').replace(/\u00a0/g, ' ');
  const list = aktualni.filter((o) => OKRES_KRAJ[o.okres] === klic);
  const m = h.match(/evidujeme <b>([\d\s]+) [^<]*<\/b>/);
  if (!m) { rozchody.push(`${f}: počet pozemků se nepřečetl`); continue; }
  kraju++;
  if (cislo(m[1]) !== list.length) rozchody.push(`${f} (${klic}): tvrdí ${cislo(m[1])}, v datech ${list.length}`);
  const r = h.match(/Ceny od <b>([\d\s]+) Kč<\/b> do <b>([\d\s]+) Kč<\/b>/);
  const ceny = list.filter((o) => o.price > 0).map((o) => o.price).sort((a, b) => a - b);
  if (r && ceny.length) {
    krajMez += 2;
    if (cislo(r[1]) !== ceny[0]) rozchody.push(`${f}: nejnižší cena ${cislo(r[1])}, v datech ${ceny[0]}`);
    if (cislo(r[2]) !== ceny[ceny.length - 1]) rozchody.push(`${f}: nejvyšší cena ${cislo(r[2])}, v datech ${ceny[ceny.length - 1]}`);
  }
}
pravda(`krajských stránek přepočítáno (${kraju} ze 14)`, kraju >= 13, `jen ${kraju}`);
pravda(`a jejich rozsahy cen (${krajMez} mezí)`, krajMez >= 24, `jen ${krajMez}`);

const kolik = pocty + meze + dlazdic + kraju + krajMez;
pravda(`a všechna přepočítaná čísla sedí (${kolik} tvrzení)`, rozchody.length === 0,
  rozchody.slice(0, 8).join('\n      ') + (rozchody.length > 8 ? `\n      …a dalších ${rozchody.length - 8}` : ''));

function hotovo() {
  console.log('\nČísla na okresních a krajských stránkách');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Čísla na okresních a krajských stránkách: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}
hotovo();
