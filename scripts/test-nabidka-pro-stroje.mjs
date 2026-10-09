/* Test: cena ve strukturovaných datech sedí na stránku — a nelže o dražbě.
   ====================================================================
   Spuštění: node scripts/test-nabidka-pro-stroje.mjs   (bez prohlížeče)

   Stránka pozemku vypisuje cenu člověku, ale strojově ji nenesla:
   změřeno 0 z 1 941 živých stránek mělo Offer. Doplnit cenu do
   strukturovaných dat je snadné — a snadné je i udělat z toho lež,
   protože těm číslům se nikdo nedívá na zuby. Právě proto tahle
   zkouška.

   Hlídá tři věci, každou z jiného důvodu:
     A) cena ve značkách je TÁŽ jako cena, kterou stránka ukazuje
        (obě se berou z jednoho místa, ale generátor je skládá zvlášť);
     B) dražba se nevydává za běžný prodej — vyvolávací cena není
        cena požadovaná a označit ji jako „skladem" by z webu udělalo
        nejlevnější nabídku na trhu, která nikde není;
     C) spoluvlastnický podíl se přizná — platí se za zlomek, ale
        výměra je celé parcely, takže cena za metr vypadá sedmkrát
        níž, než jaký je trh.

   UKONČENÉ STRÁNKY SE PŘESKAKUJÍ. Negenerují se znovu (drží si podobu
   z doby, kdy nabídka platila) a po 90 dnech mizí. Měřit na nich
   dnešní pravidla by znamenalo hlásit chybu za to, že archiv je archiv.
   ==================================================================== */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const soubory = readdirSync(KOREN).filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f));
let zive = 0, archiv = 0, sNabidkou = 0, bezCeny = 0, pocetDrazeb = 0, pocetPodilu = 0;
const rozchod = [], spatnaDrazba = [], zamlcenyPodil = [], spatnaMena = [];

for (const f of soubory) {
  const h = readFileSync(path.join(KOREN, f), 'utf8');
  if (h.indexOf('PK_UKONCENO') >= 0) { archiv++; continue; }
  zive++;

  /* Co stránka tvrdí člověku, se čte z ostrůvku, který pohání její
     tělo — ne z textu. Text se sází (nezlomitelné mezery) a vzorek na
     něj by se rozbil při první změně podoby, aniž by to cokoli
     znamenalo. */
  const po = /window\.PK_POZEMEK=(\{[\s\S]*?\});<\/scr/.exec(h);
  if (!po) continue;
  let data = null;
  try { data = JSON.parse(po[1]); } catch (e) { continue; }

  const ldm = /<script type="application\/ld\+json">([\s\S]*?)<\/scr/.exec(h);
  let ld = null;
  try { ld = JSON.parse(ldm[1]); } catch (e) { ld = null; }
  const misto = ld && ld.find((x) => x && x['@type'] === 'Place');
  const nabidka = misto && misto.makesOffer;

  if (!(data.c > 0)) { bezCeny++; continue; }
  if (!nabidka) { rozchod.push(`${f}: cena ${data.c} Kč, ale ve značkách žádná nabídka`); continue; }
  sNabidkou++;

  // A) táž cena
  if (Number(nabidka.price) !== Number(data.c)) {
    rozchod.push(`${f}: stránka ${data.c} Kč, značky ${nabidka.price} Kč`);
  }
  if (nabidka.priceCurrency !== 'CZK') spatnaMena.push(`${f}: ${nabidka.priceCurrency}`);

  /* B) dražba není prodej.
     POZNÁVÁ SE ZE STATICKÉHO TEXTU, ne z ostrůvku s daty: v něm žádné
     „type" není a první verze téhle kontroly ho tam hledala — takže
     byla zelená nad 111 dražbami, které nezkontrolovala vůbec.
     Statický výpis je navíc to, co stojí vedle značek, takže se tu
     porovnává dvojice, která si opravdu musí odpovídat. */
  const jeDrazba = /· (Dražba|Exekuce)<\/p>/.test(h);
  const popisNabidky = String(nabidka.description || '');
  if (jeDrazba) {
    pocetDrazeb++;
    if (nabidka.availability) spatnaDrazba.push(`${f}: dražba označená jako ${nabidka.availability}`);
    if (!/vyvol/i.test(popisNabidky)) spatnaDrazba.push(`${f}: dražba bez poznámky o vyvolávací ceně`);
  }

  // C) podíl se přizná
  if (/<dt>Vlastnictví<\/dt>/.test(h)) {
    pocetPodilu++;
    if (!/podíl/i.test(popisNabidky)) zamlcenyPodil.push(f);
  }
}

pravda(`je co měřit — živé stránky pozemků (${zive}, archivu přeskočeno ${archiv})`,
  zive >= 500, 'bez stránek by všechny kontroly níž prošly naprázdno');
pravda(`drtivá většina živých stránek nese cenu i pro stroje (${sNabidkou})`,
  zive > 0 && sNabidkou / zive >= 0.9,
  `jen ${sNabidkou} z ${zive} (bez ceny v datech: ${bezCeny})`);
pravda('a je to táž cena, jakou stránka ukazuje člověku', rozchod.length === 0,
  rozchod.slice(0, 5).join('\n      '));
pravda('měna je všude CZK', spatnaMena.length === 0, spatnaMena.slice(0, 5).join('; '));
/* KOLIK TOHO KAŽDÁ KONTROLA VIDĚLA. Bez tohohle je „nic jsem nenašel"
   k nerozeznání od „neměl jsem co hledat" — a právě tak byla první
   verze kontroly dražeb zelená nad 111 dražbami. */
pravda(`v datech jsou dražby, na kterých je co měřit (${pocetDrazeb})`,
  pocetDrazeb >= 20, 'kontrola níž by prošla naprázdno');
pravda('dražba se nevydává za běžný prodej', spatnaDrazba.length === 0,
  spatnaDrazba.slice(0, 5).join('\n      '));
pravda(`a spoluvlastnické podíly taky (${pocetPodilu})`, pocetPodilu >= 50,
  'kontrola níž by prošla naprázdno');
pravda('spoluvlastnický podíl se ve značkách přizná', zamlcenyPodil.length === 0,
  zamlcenyPodil.slice(0, 5).join('; '));

/* A nakonec: generátor to musí umět i pro budoucí stránky, ne jen
   trefit se dnešními daty. Kontrola čte zdroj, protože vypnout tu
   větev by na hotových souborech nebylo vidět až do dalšího sestavení. */
{
  const gen = readFileSync(path.join(KOREN, 'scripts', 'generate-parcel-pages.mjs'), 'utf8');
  pravda('generátor nabídku opravdu skládá', /makesOffer/.test(gen));
  pravda('a dražbě nedává „skladem"', /jeProdej \? \{ availability/.test(gen),
    'bez té podmínky by se vyvolávací cena tvářila jako cena k zaplacení');
}

/* ===== VÝPISOVÉ STRÁNKY: SEZNAM NABÍDEK PRO VYHLEDÁVAČE ===========
   Okresní, krajské, druhové a dražební stránky nesou ItemList —
   ukázku toho, co na nich je. Krajské ho dlouho neměly vůbec, takže
   o 14 stránkách s největším počtem nabídek vyhledávač věděl jen
   tolik, co stálo v popisu.
   Hlídá se to, co se na tom dá nejsnáz pokazit: že položka nese
   ODKAZ a že ten odkaz vede na stránku, která opravdu existuje.
   Jméno souboru se totiž nedá spočítat z klíče — na něm se nabídky
   srážejí a odkaz by ukázal cizí pozemek. Táž vada se už jednou
   opravovala v kanálech novinek i v rozesílači pošty. */
{
  const vypisy = readdirSync(KOREN).filter((f) =>
    /^pozemky-okres-.+\.html$/.test(f) || /^pozemky-.+-kraj\.html$/.test(f)
    || f === 'drazby-pozemku-nabidky.html');
  let sSeznamem = 0, polozek = 0;
  const bezOdkazu = [], mrtve = [], bezSeznamu = [];
  for (const f of vypisy) {
    const h = readFileSync(path.join(KOREN, f), 'utf8');
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/scr/.exec(h);
    let j = null;
    try { j = JSON.parse(m[1]); } catch (e) { j = null; }
    const sb = [].concat(j || []).find((x) => x && x['@type'] === 'CollectionPage');
    const sez = sb && sb.mainEntity;
    if (!sez || sez['@type'] !== 'ItemList' || !sez.itemListElement) { bezSeznamu.push(f); continue; }
    sSeznamem++;
    for (const p of sez.itemListElement) {
      polozek++;
      if (!p.url) { bezOdkazu.push(`${f}: ${p.name}`); continue; }
      const soubor = String(p.url).replace('https://www.parcelaka.cz/', '');
      if (!existsSync(path.join(KOREN, soubor))) mrtve.push(`${f} → ${soubor}`);
    }
  }
  pravda(`výpisových stránek je dost na měření (${vypisy.length})`, vypisy.length >= 80,
    String(vypisy.length));
  pravda('každá nese seznam nabídek pro vyhledávače', bezSeznamu.length === 0,
    bezSeznamu.slice(0, 5).join(', '));
  pravda(`a položek je z čeho brát (${polozek})`, polozek >= 500, String(polozek));
  pravda('každá položka nese odkaz', bezOdkazu.length === 0, bezOdkazu.slice(0, 5).join('; '));
  pravda('a žádný odkaz nevede na neexistující stránku', mrtve.length === 0,
    mrtve.slice(0, 5).join('; '));
}

console.log('\nCena ve strukturovaných datech');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Strukturovaná data: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
