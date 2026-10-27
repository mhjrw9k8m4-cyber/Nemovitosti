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
/* Slova z dlaždic → druh nabídky. Musí tu být VŠECHNY tvary, které
   čeština u toho počtu použije: jedna dražba, dvě dražby, pět dražeb.
   Chybějící tvar kontrolu nezastaví mlčky — dlaždice se přeskočí
   a zkouška to ohlásí (viz „neznamych" níž). Naposledy takhle propadlo
   „exekucí": v datech se objevila první exekuce v okrese, kde jich bylo
   pět a víc, a ten tvar tu do té doby nebyl potřeba. */
const TYP = {
  'na prodej': 'sale',
  'exekuce': 'exekuce', 'exekucí': 'exekuce',
  'dražba': 'drazba', 'dražby': 'drazba', 'dražeb': 'drazba',
  'od majitele': 'majitel', 'od obce': 'obec',
};
const cislo = (x) => +String(x).replace(/[\s ]/g, '');
const rozchody = [];
let stranek = 0, pocty = 0, meze = 0, dlazdic = 0, neznamych = 0;
/* Kolik dlaždic podle typu MÁ na stránkách být, se počítá z dat —
   generátor ji vypisuje jen tam, kde má okres víc než jeden druh
   a ten druh v něm opravdu je (viz generate-region-pages.mjs). */
let ocekavanoDlazdic = 0;
const DRUHY_DLAZDIC = ['sale', 'drazba', 'exekuce', 'obec'];

for (const f of fs.readdirSync(KOREN).sort()) {
  if (!/^pozemky-okres-.*\.html$/.test(f)) continue;
  stranek++;
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8').replace(/ /g, ' ');
  const okres = (h.match(/<h1>Pozemky v okrese ([^.<]+)\./) || [])[1];
  if (!okres) { rozchody.push(`${f}: jméno okresu se z <h1> nepřečetlo`); continue; }
  const list = aktualni.filter((o) => o.okres === okres);

  /* ČÍSLA JSOU V HLAVIČCE, NE VE VĚTĚ. Do 26. 10. je stránka psala
     dvakrát: jednou v odstavci „Aktuálně evidujeme N pozemků …" a hned
     pod ním znovu jako dlaždice .okr-stat. Odstavec odešel (viz
     hlavickaCisla v scripts/generate-region-pages.mjs) a zůstala jedna
     sada čísel v tmavém pásu. Kontrola se ptá na totéž co dřív —
     souhlasí čísla na stránce s daty? — jen je čte odtamtud, kde jsou. */
  const m = h.match(/<div class="okr-cislo"><b>([\d\s\u00a0]+)<\/b>\s*<span>pozemk/);
  if (!m) rozchody.push(`${f}: počet pozemků se z hlavičky nepřečetl`);
  else {
    pocty++;
    if (cislo(m[1]) !== list.length) rozchody.push(`${f}: tvrdí ${cislo(m[1])} pozemků, v datech ${list.length}`);
  }

  const r = h.match(/<b>([\d\s\u00a0]+)–([\d\s\u00a0]+) K\u010d<\/b>\s*<span>rozp\u011bt\u00ed cen<\/span>/);
  const ceny = list.filter((o) => o.price > 0).map((o) => o.price).sort((a, b) => a - b);
  if (r) {
    meze += 2;
    if (!ceny.length) rozchody.push(`${f}: tvrdí rozsah cen, ale v datech není ani jedna cena`);
    else {
      if (cislo(r[1]) !== ceny[0]) rozchody.push(`${f}: nejnižší cena ${cislo(r[1])}, v datech ${ceny[0]}`);
      if (cislo(r[2]) !== ceny[ceny.length - 1]) rozchody.push(`${f}: nejvyšší cena ${cislo(r[2])}, v datech ${ceny[ceny.length - 1]}`);
    }
  }

  {
    const druhy = new Set(list.map((o) => o.type));
    if (druhy.size > 1) ocekavanoDlazdic += DRUHY_DLAZDIC.filter((t) => druhy.has(t)).length;
  }
  for (const mm of h.matchAll(/<div class="okr-cislo"><b>([\d\s\u00a0]+)<\/b>\s*<span>([^<]*)<\/span>/g)) {
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
pravda(`rozsah cen se přečetl (${meze} mezí)`, meze >= 140, `jen ${meze} — změnil se zápis „X–Y Kč / rozpětí cen"?`);
/* TADY STÁL PRÁH „aspoň 60 dlaždic". Zestárl tiše: po dávce dat
   13. 10. jich bylo 55 a zkouška spadla, aniž by se na stránkách cokoli
   pokazilo — jen v okresech ubyly dražby a exekuce. Práh, který se hýbe
   s daty, nehlídá web, ale náladu trhu. Počítá se tedy, kolik dlaždic
   má podle dat vzniknout, a porovnává se to s tím, kolik jich na
   stránkách je. Když generátor přestane dlaždice psát, je rozdíl vidět
   hned; když jich trh ubere, zkouška mlčí. */
pravda(`dlaždic podle typu je tolik, kolik jich z dat vychází (${dlazdic} ku ${ocekavanoDlazdic})`,
  dlazdic + neznamych === ocekavanoDlazdic,
  `na stránkách ${dlazdic} známých a ${neznamych} neznámých, z dat vychází ${ocekavanoDlazdic}`);
pravda('a je co měřit (aspoň jedna dlaždice)', dlazdic > 0, 'žádná dlaždice podle typu');
pravda('a žádná dlaždice se nepřeskočila kvůli neznámému slovu', neznamych === 0,
  `přeskočeno ${neznamych} — doplňte slovo do tabulky TYP`);

/* ===== TOTÉŽ ČÍSLO DVAKRÁT V HLAVIČCE ===============================
   Podnadpis zněl „Aktuálně evidujeme 33 pozemků v okrese Benešov —
   33× na prodej." a pod ním stály tytéž počty ještě jako dlaždice:
   jedno číslo třikrát na jedné obrazovce. Naměřeno tehdy: týkalo se to
   43 z 91 okresních a krajských stránek.
   26. 10. ta věta i dlaždice zmizely — čísla jsou jednou, v tmavém
   pásu (hlavickaCisla v scripts/generate-region-pages.mjs). Kontrola
   proto hlídá novou podobu téhož: žádný ROZPAD nesmí jen zopakovat
   CELEK. „23 pozemků" a vedle „23 na prodej" neříká nic navíc.
   Dvě různé věci se stejným číslem („1 dražba" a „1 exekuce") v pořádku
   jsou — při prvním spuštění tahle kontrola hlásila čtyři takové
   případy jako chybu a chyba byla v ní, ne na stránkách. */
{
  const vsechny = fs.readdirSync(KOREN).filter((f) => /^pozemky-.+\.html$/.test(f));
  const HLAVICKA = /<div class="okr-cisla">([\s\S]*?)<\/div>\s*<\/div>/;
  let hlavicek = 0;
  const opakuje = [];
  for (const f of vsechny) {
    const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
    const m = h.match(HLAVICKA);
    if (!m) continue;
    hlavicek++;
    const cisla = [...m[1].matchAll(/<b>([^<]+)<\/b>\s*<span>([^<]*)<\/span>/g)]
      .map((x) => [x[1].replace(/[\u00a0 ]/g, ''), x[2]]);
    /* Celek je první položka („N pozemků"); rozpad jsou ty za ním. */
    const celek = cisla.length && !/[^\d]/.test(cisla[0][0]) ? cisla[0] : null;
    if (celek) {
      for (const [hod, popis] of cisla.slice(1)) {
        if (/[^\d]/.test(hod)) continue;     // rozpětí cen není počet
        if (hod === celek[0]) opakuje.push(`${f}: „${celek[0]} ${celek[1]}" a vedle „${hod} ${popis}"`);
      }
    }
  }
  // PŘEDPOKLAD: bez hlaviček se nedá měřit nic
  pravda(`hlavička s čísly se přečetla (${hlavicek} stránek)`, hlavicek >= 70,
    `přečteno ${hlavicek} — změnila se podoba .okr-cisla?`);
  pravda('a nikde v ní nestojí táž hodnota dvakrát',
    opakuje.length === 0, opakuje.slice(0, 4).join('\n      '));
}

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
  const m = h.match(/<div class="okr-cislo"><b>([\d\s\u00a0]+)<\/b>\s*<span>pozemk/);
  if (!m) { rozchody.push(`${f}: počet pozemků se nepřečetl`); continue; }
  kraju++;
  if (cislo(m[1]) !== list.length) rozchody.push(`${f} (${klic}): tvrdí ${cislo(m[1])}, v datech ${list.length}`);
  const r = h.match(/<b>([\d\s\u00a0]+)–([\d\s\u00a0]+) K\u010d<\/b>\s*<span>rozp\u011bt\u00ed cen<\/span>/);
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
