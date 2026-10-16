// Test: druh pozemku z volného textu inzerátu (js/druh.js).
//
// Spuštění: node scripts/test-druh.mjs   (nepotřebuje prohlížeč ani síť)
//
// Druh se dřív poznával seznamem KOUSKŮ SLOV a první výskyt kdekoli
// v textu vyhrál: t.includes('stavebn'), t.includes('lesa'),
// t.includes('louk'). Na volném textu inzerátu to dělalo tři různé
// chyby naráz:
//
//   1. KUS SLOVA — „nestavební pozemek" obsahuje „stavebn", takže se
//      pozemek, na kterém se stavět nesmí, zapsal jako stavební.
//   2. OKOLÍ MÍSTO POZEMKU — „louka u lesa" je louka, ne les.
//   3. NÁZEV OBCE — do rozpoznávání se posílal i název a adresa nabídky
//      a v nabídce je deset obcí s klíčovým slovem přímo ve jméně
//      (Louka, Loukov, Sadská, Zahradní, Lešany, Kostelec nad Černými
//      lesy…). Pozemek v Kostelci nad Černými lesy se stal lesním.
//
// Proč na tom záleží: podle druhu se filtruje, počítá se z něj obvyklá
// cena a staví se na něm statistiky okresů i stránky všech 77 okresů.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const req = createRequire(import.meta.url);
const D = req(path.join(ROOT, 'js', 'druh.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

/* ---------- 1. co se poznat MÁ ---------- */
je('stavební pozemek', D.zTextu('Prodej stavebního pozemku 800 m2'), 'stavební pozemek');
je('pozemek k výstavbě', D.zTextu('Pozemek k výstavbě rodinného domu'), 'stavební pozemek');
je('lesní pozemek', D.zTextu('Prodej lesního pozemku'), 'lesní pozemek');
je('les samotný', D.zTextu('Les o výměře 2 ha'), 'lesní pozemek');
je('zahrada', D.zTextu('Prodej zahrady 600 m2'), 'zahrada');
je('ovocný sad', D.zTextu('Ovocný sad, 1,2 ha'), 'ovocný sad');
je('vinice', D.zTextu('Vinice v Mikulově'), 'vinice');
je('orná půda', D.zTextu('Prodej orné půdy'), 'orná půda');
je('trvalý travní porost', D.zTextu('Vedeno jako trvalý travní porost'), 'trvalý travní porost');
je('louka', D.zTextu('Pěkná louka, 4 000 m2'), 'louka');
je('pastvina', D.zTextu('Pastvina pro koně'), 'pastvina');
je('zemědělský pozemek', D.zTextu('Zemědělský pozemek u obce'), 'zemědělský pozemek');
/* POLE. Jen tam, kde je pole tím, co se prodává — slovo samo je past
   a všech sedm pastí níž je doopravdy z našich popisů. */
je('pole k prodeji je orná půda', D.zTextu('Nabízím k prodeji pole o rozloze 7 183 m²'), 'orná půda');
je('a „jedná se o pole" taky', D.zTextu('Jedná se o pole s osobním vlastnictvím'), 'orná půda');
je('a „má typ pole" taky', D.zTextu('Parcela má typ pole, parcelní číslo 423/40'), 'orná půda');
je('a pole u podílu taky', D.zTextu('Nabízím ke koupi podílu 15/128 pole 12 054 m²'), 'orná půda');
je('pole stojí nad zemědělským pozemkem (konkrétní před vágním)',
  D.zTextu('Nabízím k prodeji pole, zemědělské účely'), 'orná půda');
je('ale „navazuje na pole" je okolí, ne pozemek',
  D.zTextu('Pozemek z východní strany volně navazuje na pole'), null);
je('„nejedná se o obyčejné pole" není pole',
  D.zTextu('Nejedná se o obyčejné pole, díky napojení na sítě'), null);
je('a jméno obce s „Pole" taky ne',
  D.zTextu('k.ú. Dobré Pole u Vitic, LV č. 155 o výměře 1104 m²'), null);
je('ani „Vysoké Pole"', D.zTextu('k.ú. Vysoké Pole, LV č. 1239'), null);
je('nic z toho → null', D.zTextu('Prodám pozemek, cena dohodou'), null);
je('prázdný text → null', D.zTextu(''), null);

/* ---------- 2. kus slova nestačí ---------- */
// Tohle je ta nejhorší z chyb: pozemek, na kterém se stavět NESMÍ,
// se zapsal jako stavební — a lidé podle toho filtrují.
je('„nestavební" není stavební', D.zTextu('Nestavební pozemek, orná půda'), 'orná půda');
je('„není stavební" taky ne', D.zTextu('Pozemek není stavební, vedený jako orná půda'), 'orná půda');
je('„nezastavěná plocha" není stavební', D.zTextu('Nezastavěná plocha, trvalý travní porost'), 'trvalý travní porost');
// Slovo, které nález převrací, stojí AŽ ZA ním — zápor dopředu nestačí.
je('„stavební uzávěra" znamená opak',
  D.zTextu('Na pozemku je stavební uzávěra, vedeno jako trvalý travní porost'), 'trvalý travní porost');
je('„bez lesa" není les', D.zTextu('Pozemek bez lesa, orná půda'), 'orná půda');

/* ---------- 3. okolí není pozemek ---------- */
// Čeština dává tenhle vztah dopředu předložkou, takže se dá poznat.
je('louka U lesa je louka', D.zTextu('Louka u lesa, výměra 4000 m2'), 'louka');
je('NEDALEKO lesa', D.zTextu('Pozemek nedaleko lesa, orná půda'), 'orná půda');
je('s VÝHLEDEM na les', D.zTextu('Krásný pozemek s výhledem na les, trvalý travní porost'), 'trvalý travní porost');
je('VEDLE lesa', D.zTextu('Zahrada vedle lesa'), 'zahrada');
je('OBKLOPENO lesy', D.zTextu('Orná půda obklopená lesy'), 'orná půda');
// A naopak: když je les opravdu předmětem, musí se poznat dál.
je('ale les jako předmět se pozná', D.zTextu('Prodej lesa o výměře 1 ha'), 'lesní pozemek');

/* ---------- 4. slovo uvnitř jiného slova ---------- */
je('„zahradní domek" nedělá ze stavebního pozemku zahradu',
  D.zTextu('Zahradní domek na stavebním pozemku'), 'stavební pozemek');

/* ---------- 5. název obce se do rozpoznávání nepočítá ---------- */
/* Deset obcí v nabídce má klíčové slovo přímo ve jméně. Jména se do
   modulu předávají a on je z textu vyškrtne — nestačí je jen neposílat
   v adrese, protože obec bývá i v NÁZVU nabídky. */
je('Kostelec nad Černými lesy není lesní pozemek',
  D.zTextu('Prodej pozemku, Kostelec nad Černými lesy', ['Kostelec nad Černými lesy', 'Kolín']), null);
je('obec Louka nedělá louku',
  D.zTextu('Prodej pozemku, Louka', ['Louka', 'Hodonín']), null);
je('obec Zahradní nedělá zahradu',
  D.zTextu('Prodej pozemku, Zahradní', ['Zahradní', 'Cheb']), null);
je('obec Sadská nedělá sad',
  D.zTextu('Prodej pozemku, Sadská', ['Sadská', 'Nymburk']), null);
// Ale co v textu opravdu stojí o pozemku, se pozná i tam.
je('lesní pozemek v Kostelci nad Černými lesy se pozná',
  D.zTextu('Prodej lesního pozemku, Kostelec nad Černými lesy', ['Kostelec nad Černými lesy', 'Kolín']),
  'lesní pozemek');
// Diakritika ani velikost písmen do toho nemluví.
je('jméno se škrtá bez ohledu na háčky',
  D.zTextu('Prodej pozemku, LOUKA', ['louka']), null);

/* ---------- 6. citace katastru má přednost před hádáním ----------

   Část inzerátů druh neříká mezi řečí, ale CITUJE katastr — buď větou
   („vedený v katastru jako…“), nebo výpisem z listu vlastnictví, kde
   je druh za každou parcelou v závorce. Hádání z klíčových slov proti
   tomu prohrávalo: v inzerátu z Vysokého Mýta stálo v jedné větě
   „vedený v katastru jako trvalý travní porost“ a ve druhé „dle
   územního plánu určena k zastavění“ — a protože „stavební pozemek“ má
   v pravidlech přednost, web napsal „stavební pozemek“ o pozemku,
   o kterém tentýž inzerát říká, že je v katastru travní porost.

   U smíšených listů se navíc vybíralo podle přednosti klíčových slov,
   ne podle PLOCHY: jedna malá lesní parcela v balíku polí z celého
   balíku dělala les (naměřeno 115 takových nabídek). */
{
  /* Začátek je skutečný text toho inzerátu z Vysokého Mýta (zkrácený);
     věta o stavebním povolení zastupuje tu část, kterou robot vidí a
     uložený popis už ne (ukládá se jen 460 znaků). Bez té věty by
     hádání vrátilo travní porost samo a zkouška by nic neprokázala —
     ověřeno sabotáží. */
  const vysokeMyto = 'Nabízím k prodeji pozemek o výměře 3974 m², vedený v katastru '
    + 'jako trvalý travní porost. Parcela č. 3975 se nachází v klidné části '
    + 'Vysokého Mýta zvané Jangelec. Pozemek tvoří udržovaná louka s rovinatým '
    + 'terénem a je na něj vydané stavební povolení.';
  je('citace katastru přebije „stavební povolení"', D.zTextu(vysokeMyto), 'trvalý travní porost');
  je('a bez citace by vyšel stavební pozemek',
    D.zTextu('Pozemek v klidné části obce. Je na něj vydané stavební povolení.'),
    'stavební pozemek');
  je('výpis parcel přebije „stavební pozemek" v názvu',
    D.zTextu('Prodej stavebního pozemku. LV č. 1 • Parcela č. 1 - o výměře 800 m² (Orná půda)'),
    'orná půda');

  const lv = 'k.ú. Cotkytle LV č. 561 o celkové výměře 97502 m² '
    + '• Parcela č. 5010 - o výměře 70654 m² (Lesní pozemek) '
    + '• Parcela č. 5011 - o výměře 26848 m² (Orná půda)';
  je('ze smíšeného listu vyhrává větší plocha (les)', D.zTextu(lv), 'lesní pozemek');
  const lv2 = 'LV č. 1 • Parcela č. 1 - o výměře 100 m² (Lesní pozemek) '
    + '• Parcela č. 2 - o výměře 9000 m² (Orná půda)';
  je('a malá lesní parcela z balíku polí nedělá les', D.zTextu(lv2), 'orná půda');
  je('na pořadí v textu to nezávisí',
    D.zTextu('LV • Parcela č. 2 - o výměře 9000 m² (Orná půda) '
      + '• Parcela č. 1 - o výměře 100 m² (Lesní pozemek)'), 'orná půda');
  je('při shodné ploše rozhodne první v textu',
    D.zTextu('LV • Parcela č. 1 - o výměře 500 m² (Vinice) '
      + '• Parcela č. 2 - o výměře 500 m² (Orná půda)'), 'vinice');
  je('dvojka za m nemusí být ²',
    D.zTextu('LV • Parcela č. 1 - o výměře 800 m2 (Zahrada)'), 'zahrada');

  /* Závorka bez plochy: jediný druh se bere, ze směsi se nehádá. */
  je('jediný druh v závorce se bere', D.zTextu('Parcela č. 7 (Ovocný sad) na kraji obce'), 'ovocný sad');
  je('ze směsi v závorkách bez ploch se nehádá',
    D.zKatastru(D.srovnej('Parcela č. 7 (Ovocný sad), parcela č. 8 (Vinice)')), null);

  /* Obsah závorky musí být PŘESNĚ druh, ne věta, která ho obsahuje. */
  je('„(mimo lesní pozemek)" není citace', D.zKatastru(D.srovnej('Pozemek (mimo lesní pozemek)')), null);
  je('a ani „(lesní pozemek sousedí)"',
    D.zKatastru(D.srovnej('Pozemek (lesní pozemek sousedí)')), null);

  /* Katastr nezná druh „stavební pozemek" — vyhláška jich zná deset.
     Citace ho proto vrátit nesmí; hádání z textu ano, to je jiná věc. */
  je('katastr „stavební pozemek" nezná', D.katastrovyDruh('stavební pozemek'), null);
  je('a ani „zemědělský pozemek"', D.katastrovyDruh('zemědělský pozemek'), null);
  je('deset druhů podle vyhlášky', D.KATASTR.length, 10);
  je('každý z nich se pozná', D.KATASTR.filter((d) => D.katastrovyDruh(d) !== d), []);

  /* Bez citace se nic nemění — hádání zůstává. */
  je('bez citace rozhoduje dál text', D.zTextu('Prodej stavebního pozemku 800 m2'), 'stavební pozemek');
  je('a co se nepozná, zůstává null', D.zKatastru(D.srovnej('Prodej pozemku v obci')), null);
}

/* ---------- 7. je to doopravdy zapojené? ----------
   Modul může být sebelíp napsaný — když ho robot nevolá, nebo mu
   nepředá jména míst, nezmění se nic. Ověřeno sabotáží: bez tohohle
   oddílu prošel test i s původním seznamem kousků slov. */
{
  const zdroj = readFileSync(path.join(ROOT, 'scripts', 'fetch-opportunities.mjs'), 'utf8');
  je('robot načítá sdílený modul', /require\([^)]*['"`][^'"`]*druh\.js['"`]\)/.test(zdroj)
    || /druh\.js/.test(zdroj), true);
  /* Bere se celý ŘÁDEK, ne jen závorka: v argumentech bývají další
     závorky ((a.description || '')) a vzorek na jednu závorku se na nich
     utne — pak test kontroluje uříznutý kus a nic nenajde. */
  const volani = zdroj.split('\n')
    .filter((r) => /parseDruh\(/.test(r) && !/function parseDruh/.test(r))
    .map((r) => r.trim());
  je('robot druh rozpoznává (volání existují)', volani.length >= 5, true);
  const bezJmen = volani.filter((r) => !/\[place, okres\]/.test(r));
  je('a každému volání předává jména míst', bezJmen, []);
  // Adresa popisuje MÍSTO, ne pozemek — do rozpoznávání nepatří vůbec.
  je('adresa se do rozpoznávání neposílá', /parseDruh\(name \+ ' ' \+ loc\)/.test(zdroj), false);
  // Vlastní seznam kousků slov už v robotovi být nesmí, jinak se rozejdou.
  je('robot už nemá vlastní seznam kousků slov',
    /\['stavebn[íi]?',\s*'stavební pozemek'\]/.test(zdroj), false);
}

console.log('\nDruh pozemku z textu inzerátu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Rozpoznávání druhu pozemku: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
process.exit(chyb ? 1 : 0);
