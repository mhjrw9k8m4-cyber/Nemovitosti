// Test: výměra přečtená z popisu inzerátu nesmí být cizí číslo.
//
// Spuštění: node scripts/test-vymera-z-textu.mjs   (nepotřebuje síť ani prohlížeč)
//
// Robot čte výměru nejdřív ze strukturovaného pole zdroje. Když ho zdroj
// nedá (dražby z OK dražeb), zbývá NÁZEV inzerátu a pak jeho POPIS.
// U názvu se dá vzít první „N m²" — název je krátký a jiná výměra v něm
// nebývá. U popisu to je past: popis je volný text, kde výměr bývá víc.
//
// Změřeno na 1 633 stažených popisech: 1 029 z nich (64,9 %) obsahuje
// VÍC NEŽ JEDNU různou výměru. Vzít první znamená u dvou třetin textů
// hádat — a chybná výměra se nijak neprojeví: tiše z ní vyjde nesmyslná
// cena za metr, podle které web počítá odhady, rozdává odznaky „pod
// obvyklou cenou" a staví statistiky okresů. Je to tedy horší chyba než
// chybějící údaj, protože chybějící údaj je vidět.
//
// Pravidlo je proto: raději nic než cizí číslo. Bere se výměra navázaná
// na POZEMEK, a když takových vyjde víc různých, nevrací se nic.
import { readFileSync } from 'node:fs';
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
function hotovo() {
  console.log('\nVýměra z textu inzerátu');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Výměra z textu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Funkce se vytáhnou ze zdroje robota a pustí samostatně — zbytek
   souboru by chtěl síť. Kdyby se je nepodařilo najít (přejmenování),
   test to musí ŘÍCT, ne tiše projít. */
const src = readFileSync(path.join(KOREN, 'scripts', 'fetch-opportunities.mjs'), 'utf8');
const kusy = [
  src.match(/function parseArea\(text\)[\s\S]*?\n}/),
  src.match(/const AREA_POZEMEK[\s\S]*?\nfunction parseAreaPopis[\s\S]*?\n  return null;\n}/),
];
pravda('čtení výměry se dá v robotovi najít a spustit', kusy.every(Boolean),
  'parseArea nebo parseAreaPopis ve scripts/fetch-opportunities.mjs nejsou — přejmenovaly se?');
if (!kusy.every(Boolean)) hotovo();
const F = new Function(kusy.map((k) => k[0]).join('\n') + '; return { parseArea, parseAreaPopis };')();

/* --- 1) název se čte rovnou, popis opatrně --- */
pravda('z NÁZVU se výměra bere rovnou (krátký text, jedno číslo)',
  F.parseArea('Prodej pozemku 1 250 m2, Benešov') === 1250,
  String(F.parseArea('Prodej pozemku 1 250 m2, Benešov')));

const p = (t) => F.parseAreaPopis(t);

/* --- 1b) OPATRNÉ ČTENÍ MUSÍ BÝT TAKY POUŽITÉ ---
   Samo o sobě nestačí, že bezpečná funkce existuje: dokud ji nikdo
   nevolá, popis se čte dál jako název a první číslo vyhraje. Vyšlo to
   najevo při sabotáži — volání se vrátilo na parseArea(j.description)
   a test to nepoznal, protože zkoušel jen funkce. */
{
  const bezKomentaru = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const volaniPopisu = bezKomentaru.match(/parseArea(?:Popis)?\s*\(\s*\w+\.description/g) || [];
  // PŘEDPOKLAD: když se popis nečte vůbec, kontrola níž projde naprázdno
  pravda('robot z popisu výměru opravdu čte', volaniPopisu.length > 0,
    've fetch-opportunities.mjs není žádné čtení výměry z .description');
  pravda('a čte ji OPATRNĚ — žádné parseArea(popis) jako u názvu',
    volaniPopisu.every((v) => v.startsWith('parseAreaPopis')), volaniPopisu.join(', '));
}

/* --- 2) případy, kvůli kterým to vzniklo --- */
pravda('„prodávám zahradu 500 m², ale vedle je pole 1000 m²" NEVRÁTÍ nic',
  p('Prodávám zahradu 500 m2, ale vedle je pole 1000 m2, které není moje.') === null,
  'vrátilo ' + p('Prodávám zahradu 500 m2, ale vedle je pole 1000 m2, které není moje.'));
pravda('zastavěná plocha chaty se nesplete s výměrou pozemku',
  p('Prodej pozemku o výměře 105 m2. Na pozemku stojí chata o zastavěné ploše cca 25m2.') === 105,
  'vrátilo ' + p('Prodej pozemku o výměře 105 m2. Na pozemku stojí chata o zastavěné ploše cca 25m2.'));
/* Tyhle dva případy stojí a padají S VYLOUČENÍM ploch, které patří
   stavbě: není v nich žádná jiná výměra, takže bez vyloučení by se
   zastavěná plocha chaty zapsala jako výměra pozemku. (Případ „pozemek
   o výměře 105 … chata 25" to neprověří — tam vyhraje silnější důkaz
   a sabotáž vyloučení prošla nepovšimnuta.) */
pravda('samotná zastavěná plocha chaty NENÍ výměra pozemku',
  p('Prodej pozemku v obci. Na pozemku stojí chata o zastavěné ploše cca 25 m2.') === null,
  'vrátilo ' + p('Prodej pozemku v obci. Na pozemku stojí chata o zastavěné ploše cca 25 m2.'));
pravda('a samotná užitná plocha domu taky ne',
  p('Pozemek v obci, dům s užitnou plochou 140 m2.') === null,
  'vrátilo ' + p('Pozemek v obci, dům s užitnou plochou 140 m2.'));
pravda('ani užitná plocha domu',
  p('Pozemek o výměře 800 m2, dům má celková užitná plocha pak 105m2.') === 800,
  'vrátilo ' + p('Pozemek o výměře 800 m2, dům má celková užitná plocha pak 105m2.'));
pravda('studie domu v názvu nepřebije výměru pozemku',
  p('Stavební pozemek se sítěmi a studií domu 77 m2. Nabízím pozemek o výměře 494 m2.') === 494,
  'vrátilo ' + p('Stavební pozemek se sítěmi a studií domu 77 m2. Nabízím pozemek o výměře 494 m2.'));
pravda('srub na pozemku nepřebije výměru pozemku',
  p('Nabízím stavební pozemek o rozloze 1028 m2. Na pozemku je srub na základech o velikosti 43 m2.') === 1028,
  'vrátilo ' + p('Nabízím stavební pozemek o rozloze 1028 m2. Na pozemku je srub na základech o velikosti 43 m2.'));
pravda('sousední parcela na prodej znamená: raději nic',
  p('Prodej pozemku o rozloze 1007 m2. Součástí může být i sousední parcela o výměře 431 m2.') === null,
  'vrátilo ' + p('Prodej pozemku o rozloze 1007 m2. Součástí může být i sousední parcela o výměře 431 m2.'));
pravda('u výčtu parcel vyhraje CELKOVÁ výměra, ne ta první',
  p('parc. 484/10 ( 8 579 m2 ), 484/11 ( 8 582 m2 ) a 484/4 ( 1 805 m2 ) o celkové výměře 18 966 m²') === 18966,
  'vrátilo ' + p('parc. 484/10 ( 8 579 m2 ), 484/11 ( 8 582 m2 ) a 484/4 ( 1 805 m2 ) o celkové výměře 18 966 m²'));

/* --- 3) skloňování, na kterém to jednou spadlo --- */
pravda('„o rozloze" se pozná (kmen je rozlo[hz], ne rozloh)',
  p('Prodej stavebního pozemku o rozloze 1007 m2 v klidné části obce.') === 1007,
  'vrátilo ' + p('Prodej stavebního pozemku o rozloze 1007 m2 v klidné části obce.'));
pravda('a „o výměře" taky', p('Pozemek o výměře 2 500 m2.') === 2500,
  'vrátilo ' + p('Pozemek o výměře 2 500 m2.'));
pravda('a čte se i bez diakritiky', p('Pozemek o vymere 2 500 m2.') === 2500,
  'vrátilo ' + p('Pozemek o vymere 2 500 m2.'));

/* --- 4) čísla, která s pozemkem nesouvisí, se nesmí chytit --- */
pravda('počet obyvatel obce není výměra',
  p('Nabízíme pozemek o výměře 2 500 m2 v obci, kde žije 1200 lidí.') === 2500,
  'vrátilo ' + p('Nabízíme pozemek o výměře 2 500 m2 v obci, kde žije 1200 lidí.'));
pravda('text bez jediné výměry nevrátí nic',
  p('Krásný pozemek v klidné části obce, veškeré sítě na hranici.') === null,
  'vrátilo ' + p('Krásný pozemek v klidné části obce, veškeré sítě na hranici.'));
pravda('prázdný text nevrátí nic', p('') === null && p(null) === null && p(undefined) === null);

/* --- 5) proti skutečným datům: opatrné čtení nesmí tvrdit víc než staré --- */
{
  const pop = JSON.parse(readFileSync(path.join(KOREN, 'data', 'popisy.json'), 'utf8'));
  const texty = Object.values(pop).map((x) => (typeof x === 'string' ? x : (x && x.popis) || '')).filter(Boolean);
  // PŘEDPOKLAD: bez textů by kontroly níž prošly naprázdno
  pravda('je na čem měřit — stažené popisy inzerátů', texty.length >= 500, `popisů: ${texty.length}`);

  let viceVymer = 0, sVymerou = 0, odmitlo = 0;
  for (const t of texty) {
    const vse = [...String(t).matchAll(/(\d[\d\s.]*)\s*m(?:2|²)/gi)]
      .map((x) => parseInt(x[1].replace(/[\s.]/g, ''), 10)).filter((n) => n > 0);
    if (!vse.length) continue;
    sVymerou++;
    if (new Set(vse).size > 1) viceVymer++;
    if (F.parseArea(t) && !F.parseAreaPopis(t)) odmitlo++;
  }
  /* Tahle kontrola drží PREMISU celého testu. Kdyby popisy přestaly mít
     víc výměr, opatrné čtení by nebylo k čemu — a tohle by na to
     upozornilo místo toho, aby test dál strážil neexistující problém. */
  pravda('popisy opravdu bývají o víc výměrách naráz (jinak není co řešit)',
    viceVymer / sVymerou > 0.3, `${viceVymer} z ${sVymerou} popisů`);
  pravda('a opatrné čtení v nejednoznačných textech mlčí, místo aby hádalo',
    odmitlo > 100, `odmítlo hádat u ${odmitlo} popisů`);

  /* A nikde nesmí vrátit číslo, které v textu vůbec není. Počítají se
     OBA zápisy: m² i hektary. Dokud se hektary nečetly, stačilo tu
     hledat m² — a při přidání hektarů tahle kontrola rovnou spadla na
     devíti skutečných popisech. Spadla správně: devět výměr se našlo
     tam, kde dřív nebylo nic (např. „o celkové výměře téměř 7,2 hektaru"
     = 72 000 m²). */
  const vTextu = (t) => {
    const out = new Set();
    for (const x of String(t).matchAll(/(\d[\d\s.]*)\s*m(?:2|²)/gi)) {
      out.add(parseInt(x[1].replace(/[\s.]/g, ''), 10));
    }
    for (const x of String(t).matchAll(/(\d+(?:[.,]\d+)?)\s*(?:ha|hektar\w*)(?![a-z])/gi)) {
      out.add(Math.round(parseFloat(x[1].replace(',', '.')) * 10000));
    }
    return out;
  };
  const vymyslene = texty.filter((t) => {
    const v = F.parseAreaPopis(t);
    return v && !vTextu(t).has(v);
  });
  pravda('a nikdy nevrátí výměru, která v textu nestojí (v m² ani v hektarech)',
    vymyslene.length === 0, `vymyšlených: ${vymyslene.length}`);

  /* HEKTARY SE SMĚJÍ JEN PŘISTAVĚT, NE PŘEPSAT. Kdyby se obě čtení
     míchala, popis „1,2 ha (11 950 m²)" by skončil na dvou různých
     číslech v jedné hromádce, tedy na null — a nabídka, která dnes
     výměru má, by ji ztratila. Proto: kde je v textu aspoň jeden údaj
     v m², musí výsledek být jeden z NICH, nikdy z hektarů. */
  const prebite = texty.filter((t) => {
    const m2 = [...String(t).matchAll(/(\d[\d\s.]*)\s*m(?:2|²)/gi)]
      .map((x) => parseInt(x[1].replace(/[\s.]/g, ''), 10)).filter((n) => n > 0);
    if (!m2.length) return false;
    const v = F.parseAreaPopis(t);
    return v && !m2.includes(v);
  });
  pravda('a kde text říká m², hektary to nepřebijí',
    prebite.length === 0, `přebitých: ${prebite.length}`);

  const zHektaru = texty.filter((t) => {
    const m2 = [...String(t).matchAll(/\d[\d\s.]*\s*m(?:2|²)/gi)].length;
    return !m2 && F.parseAreaPopis(t);
  });
  /* Předpoklad obou kontrol výš: hektarové popisy v datech vůbec jsou.
     Kdyby zmizely, nehlídalo by se nic a tohle to řekne. */
  pravda('a hektarové popisy v datech opravdu jsou (jinak se nic nekontroluje)',
    zHektaru.length > 0, `popisů s výměrou jen v hektarech: ${zHektaru.length}`);
}

/* --- 6) hektary: zápisy, jak je lidé píšou ------------------------- */
pravda('„o výměře 2,5 ha" je 25 000 m²', p('Prodej pozemku o výměře 2,5 ha v obci X.') === 25000,
  'vrátilo ' + p('Prodej pozemku o výměře 2,5 ha v obci X.'));
pravda('„o celkové výměře 12 ha" je 120 000 m²',
  p('Prodej lesa o celkové výměře 12 ha.') === 120000,
  'vrátilo ' + p('Prodej lesa o celkové výměře 12 ha.'));
pravda('slovo „hektar" se čte stejně jako „ha"',
  p('Nabízíme soubor pozemků o celkové výměře téměř 7,2 hektaru.') === 72000,
  'vrátilo ' + p('Nabízíme soubor pozemků o celkové výměře téměř 7,2 hektaru.'));
/* DESETINNÁ TEČKA NENÍ ODDĚLOVAČ TISÍCŮ. U m² se tečka škrtá („18.966"
   = 18 966), u hektarů znamená desetiny — „1.5 ha" je 15 000 m², ne
   150 000. Kdyby se hektary počítaly týmž přepočtem jako m², bylo by to
   řádově vedle, a to u ceny za m² znamená desetinásobek. */
pravda('„1.5 ha" je 15 000 m², ne 150 000', p('Pozemek o výměře 1.5 ha u lesa.') === 15000,
  'vrátilo ' + p('Pozemek o výměře 1.5 ha u lesa.'));
pravda('slovo, které jen začíná na „ha", se za hektary nebere',
  p('Pozemek u haldy, 3 ha orné půdy.') === 30000,
  'vrátilo ' + p('Pozemek u haldy, 3 ha orné půdy.'));
pravda('nesmyslně velká výměra se nebere', p('Pozemek o výměře 9000 ha.') === null,
  'vrátilo ' + p('Pozemek o výměře 9000 ha.'));
pravda('zastavěná plocha v hektarech taky nepatří pozemku',
  p('Areál, zastavěná plocha 2 ha.') === null,
  'vrátilo ' + p('Areál, zastavěná plocha 2 ha.'));
pravda('dvě hektarové výměry ve dvou větách = mlčení',
  p('Prodej pozemku o výměře 2 ha. Prodej pozemku o výměře 3 ha.') === null,
  'vrátilo ' + p('Prodej pozemku o výměře 2 ha. Prodej pozemku o výměře 3 ha.'));
/* A ZDE SE HEKTARY CHOVAJÍ STEJNĚ JAKO m², I V TOM HORŠÍM.
   Ve větě „pozemku o výměře 2 ha a druhého o výměře 3 ha" se vybere ta
   první: druhý údaj od slova „pozemek" dělí víc než šestnáct znaků, takže
   propadne do slabé hromádky, a výslovná zůstane jediná. Vypadá to jako
   vada hektarů, není: s m² („2000 m2 a druhého 3000 m2") to dělá totéž
   a dělalo odjakživa. Zapsané je to tu proto, aby se to vědělo — ne aby
   se to tvářilo jako správné. Měnit kvůli tomu hromádky by přepsalo
   čtení všech 1 630 popisů, což je docela jiná práce než přístavba
   jedné jednotky. */
pravda('ve dvou výměrách v jedné větě vyhraje ta první — u obou jednotek stejně',
  p('Prodej pozemku o výměře 2 ha a druhého o výměře 3 ha.') === 20000
  && p('Prodej pozemku o výměře 2000 m2 a druhého o výměře 3000 m2.') === 2000,
  'hektary: ' + p('Prodej pozemku o výměře 2 ha a druhého o výměře 3 ha.')
  + ', m²: ' + p('Prodej pozemku o výměře 2000 m2 a druhého o výměře 3000 m2.'));

hotovo();
