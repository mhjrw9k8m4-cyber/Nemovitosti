/* Test: soustavné hledání nových zdrojů
   ==================================================================
   Spuštění: node scripts/test-hledej-zdroje.mjs   (bez sítě)

   FIXTURY JSOU SKUTEČNÉ ODPOVĚDI z ohledání 4. 11. 2026:
     · katalog  — běh 41808644005, https://api.opendata.mmhk.cz/lod/catalog
     · sada     — běh 41809363032, jedna z osmi sad téhož katalogu
     · adresy na stránce seznamu — běh 41809294977 (vykreslená stránka
       https://data.gov.cz/lokální-katalogy), odkud je i zjištění, že
       `catalog=` v OBYČEJNĚ stažené stránce není ani jednou (41809439047).

   Vymyšlené fixtury mě dnes jednou stály půl práce: u čtečky
   otevřených dat státu jsem podle vymyšleného popisu napsal „ber
   poslední výměru", kdežto skutečná data říkají „dvě výměry = dvě
   parcely, sečti je" (§365). Co tu stojí, to opravdu přišlo po drátě;
   kolem adres je zmenšená kopie značkování, ale adresy samy jsou ty
   naměřené.

   CO SE TU MĚŘÍ NEJVÍC: ŽE SE HLEDÁNÍ NEDRŽÍ `<a href>`. Adresa
   katalogu na té stránce odkaz NENÍ — je to hodnota parametru
   `catalog=` v odkazu na validátor. Čtečka postavená na odkazech by
   našla nula katalogů a hlásila by, že rejstřík je prázdný.
   ================================================================== */
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import * as H from './hledej-zdroje.mjs';

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

/* --- SKUTEČNÉ ODPOVĚDI ------------------------------------------ */
const KATALOG = {
  '@context': 'https://ofn.gov.cz/rozhraní-katalogů-otevřených-dat/2021-01-11/kontexty/rozhraní-katalogů-otevřených-dat.jsonld',
  iri: 'https://api.opendata.mmhk.cz/lod/catalog',
  poskytovatel: 'https://api.opendata.mmhk.cz/organization/00268810',
  typ: 'Katalog',
  'název': { cs: 'Katalog otevřených dat MMHK' },
  popis: { cs: '' },
  'domovská_stránka': 'https://opendata.mmhk.cz',
  'datová_sada': [
    'https://api.opendata.mmhk.cz/lod/catalog/815e142e-f2e8-4327-97e0-575939934d90',
    'https://api.opendata.mmhk.cz/lod/catalog/3fe8b57f-179c-4250-884b-c652a0dd1f77',
    'https://api.opendata.mmhk.cz/lod/catalog/e4bb40b8-9457-46d6-bb6f-7d12719ecaca',
    'https://api.opendata.mmhk.cz/lod/catalog/e9ca8ea9-f943-41da-a52e-4758640f2a53',
    'https://api.opendata.mmhk.cz/lod/catalog/5cdbb6ee-2874-4bb2-9ff3-d03f8e8a23af',
    'https://api.opendata.mmhk.cz/lod/catalog/b84824e4-447e-43c1-b599-804ab0fa6f47',
    'https://api.opendata.mmhk.cz/lod/catalog/7c3e85c1-8945-4100-be0d-3f302d4963cf',
    'https://api.opendata.mmhk.cz/lod/catalog/d34d4ab0-fdae-4378-afce-8bff9f2e9866',
  ],
};

/* Sada z téhož katalogu. Je to zkušební záznam toho úřadu („test1",
   popis „wdwd") a OBĚ adresy distribuce jsou PRÁZDNÉ — přesně tak to
   po drátě přišlo. Proto se na ní dobře měří, že z prázdné distribuce
   nesmí vzniknout soubor s prázdnou adresou. */
const SADA = {
  iri: 'https://api.opendata.mmhk.cz/lod/catalog/815e142e-f2e8-4327-97e0-575939934d90',
  typ: 'Datová sada',
  popis: { cs: 'wdwd' },
  'téma': ['http://publications.europa.eu/resource/authority/data-theme/ECON'],
  'název': { cs: 'test1' },
  '@context': 'https://ofn.gov.cz/dcat-ap-cz-rozhraní-katalogů-otevřených-dat/2024-05-28/kontexty/rozhraní-katalogů-otevřených-dat.jsonld',
  distribuce: [{
    typ: 'Distribuce',
    'formát': 'http://publications.europa.eu/resource/authority/file-type/XLSX',
    'typ_média': 'http://www.iana.org/assignments/media-types/application/pdf',
    'přístupové_url': '',
    'soubor_ke_stažení': '',
  }],
  poskytovatel: 'https://api.opendata.mmhk.cz/organization/mmhk',
  'klíčové_slovo': { cs: ['teat1'], en: [] },
  'periodicita_aktualizace': 'http://publications.europa.eu/resource/authority/frequency/MONTHLY',
};

/* Zmenšená kopie stránky seznamu. Adresy jsou naměřené (běh
   41809294977): u každého katalogu je odkaz na validátor s adresou
   katalogu v parametru `catalog=`, vedle toho odkaz do `/zdroj/`
   (který robots.txt data.gov.cz zakazuje) a odkaz do rejstříku úřadů. */
const STRANKA = `<!DOCTYPE html><html lang="cs"><head>
<link rel="stylesheet" href="https://data.gov.cz/assets/catalog/main.css">
<link rel="icon" href="https://data.gov.cz/images/favicons/favicon.ico">
</head><body>
<a href="https://data.gov.cz/zdroj/lokální-katalogy/00268810/1475430928">Otevřená data MMHK</a>
<a href="https://datagov-cz.github.io/lkod-validator?catalog=https%3A%2F%2Fapi.opendata.mmhk.cz%2Flod%2Fcatalog">Zkontrolovat</a>
<a href="https://data.gov.cz/formulář/odstranění-lokálního-katalogu?catalog=https%3A%2F%2Fapi.opendata.mmhk.cz%2Flod%2Fcatalog">Odstranit</a>
<a href="https://rpp-opendata.egon.gov.cz/odrpp/zdroj/orgán-veřejné-moci/00268810">Úřad</a>
<a href="https://opendata.mmhk.cz/">Domovská stránka</a>
<a href="https://data.gov.cz/zdroj/lokální-katalogy/00006947/1475430929">Otevřená data Ministerstva financí</a>
<a href="https://datagov-cz.github.io/lkod-validator?catalog=https%3A%2F%2Fapi.lkod.cz%2Flod%2Fdf103d3-3c12-4a1b-9e77-3d5c1e2b3%2Fcatalog%3Fpublishers%255B%255D%3Dhttps%253A%252F%252Fdata.gov.cz">Zkontrolovat</a>
<a href="https://datagov-cz.github.io/lkod-validator?catalog=https%3A%2F%2Fdata.csu.gov.cz%2Fopendata%2Fkatalog">Zkontrolovat</a>
<a href="https://datagov-cz.github.io/lkod-validator?catalog=https%3A%2F%2Fdata.melnik.cz%2Flkod%2F00237051%2Fkatalog">Zkontrolovat</a>
<a href="https://lkod.cz/catalog/chmi">Katalog ČHMÚ</a>
<img src="https://data.gov.cz/images/logo.png" alt="">
</body></html>`;

/* ---- 1) ADRESY ZE STRÁNKY SEZNAMU ------------------------------ */
{
  const a = H.adresyZeStranky(STRANKA);
  pravda('adresa katalogu z parametru catalog= se najde a odkóduje',
    a.includes('https://api.opendata.mmhk.cz/lod/catalog'),
    'bez tohohle hledání nemá kde začít: ' + JSON.stringify(a));
  pravda('najde se i katalog, který je NA jiném webu než jeho obec (api.lkod.cz)',
    a.some((x) => x.startsWith('https://api.lkod.cz/lod/')),
    JSON.stringify(a));
  pravda('najde se katalog Českého statistického úřadu',
    a.includes('https://data.csu.gov.cz/opendata/katalog'));
  pravda('najde se katalog Mělníka', a.includes('https://data.melnik.cz/lkod/00237051/katalog'));
  pravda('najde se i katalog uvedený jako obyčejný odkaz (lkod.cz/catalog/chmi)',
    a.includes('https://lkod.cz/catalog/chmi'));
  je('žádná adresa se neopakuje', a.length, new Set(a).size);

  const hoste = new Set(a.map(H.hostZAdresy));
  pravda('data.gov.cz se neptáme — a tím se NEPTÁME ani na /zdroj/, které zakazuje',
    !hoste.has('data.gov.cz'),
    'v seznamu: ' + JSON.stringify([...hoste]));
  pravda('validátor není katalog', !hoste.has('datagov-cz.github.io'));
  pravda('rejstřík úřadů není katalog', !hoste.has('rpp-opendata.egon.gov.cz'));
  pravda('stylopis ani logo nejsou adresa k dotázání',
    !a.some((x) => /\.(css|png|ico)$/i.test(x)), JSON.stringify(a));
  pravda('domovská stránka obce v seznamu zůstává (zdroj může být na ní)',
    a.includes('https://opendata.mmhk.cz/'));
}
{
  /* STROP. Rejstřík má dnes 66 katalogů; kdyby stránka jednou nabídla
     tisíce adres, nesmí to znamenat tisíce dotazů na cizí weby. */
  const hodne = Array.from({ length: 50 }, (_, i) => `<a href="https://obec${i}.cz/katalog">k</a>`).join('');
  je('strop na počet adres platí', H.adresyZeStranky(hodne, 7).length, 7);
  /* A VÝCHOZÍ STROP TAKY — jinak by se dal posunout bez povšimnutí
     (našel sabotážní stroj: `STROP_ADRES = 300` → 301 nikdo nepoznal). */
  const premnoho = Array.from({ length: H.STROP_ADRES + 50 },
    (_, i) => `<a href="https://obec${i}.cz/katalog">k</a>`).join('');
  je('a bez řečeného stropu platí ten výchozí',
    H.adresyZeStranky(premnoho).length, H.STROP_ADRES);
  /* A TEĎ TO ČÍSLO SAMO. Kontrola výš je TAUTOLOGIE: obě strany si
     berou `H.STROP_ADRES`, takže se posunou spolu a sabotáž projde
     (přesně to sabotážní stroj ukázal). Mez je rozhodnutí — 300 adres
     na portál při 90 cizích adresách z rejstříku — a kdo ji změní, má
     ji změnit i tady a tím si ji zdůvodnit. */
  je('a ta výchozí mez je 300 adres', H.STROP_ADRES, 300);
}
{
  /* CO ZMĚŘENÍ ŘEKLO O OBYČEJNĚ STAŽENÉ STRÁNCE: `catalog=` v ní není.
     Hledání na to musí umět odpovědět „nenašel jsem nic", ne spadnout. */
  je('stránka bez adres dá prázdný seznam, ne výjimku', H.adresyZeStranky('<html></html>'), []);
  je('nic na vstupu taky nespadne', H.adresyZeStranky(null), []);
  /* TOHLE NAŠEL SABOTÁŽNÍ STROJ, NE JÁ. Když se z `adresyZeStranky`
     odstraní `if (!host) continue;`, zkouška o tom nevěděla — a přitom
     by se mezi kandidáty dostala adresa, kterou nejde ani rozebrat,
     a bot by se na ni pak vypravil. Hlídá se to tedy přímo: ať z každé
     vrácené adresy jde přečíst hostitel. */
  {
     /* `https://[zlomena` vzor adresy chytí, ale `new URL` ji nerozebere
        — přesně to je ten případ, který ta pojistka drží. */
     const a = H.adresyZeStranky('<a href="https://obec.cz/katalog">k</a> https://[zlomena'
       + ' <a href="https://data.gov.cz/x">cizí</a>');
     pravda('každá vrácená adresa má hostitele, který se dá přečíst',
       a.length > 0 && a.every((x) => H.hostZAdresy(x) !== ''),
       JSON.stringify(a));
  }
}

/* ---- 2) JSI KATALOG? PTÁ SE, NEHÁDÁ --------------------------- */
{
  pravda('změřený katalog se přihlásí', H.jeKatalog(KATALOG));
  pravda('datová sada katalog není', !H.jeKatalog(SADA),
    'jinak by se v sadě hledaly další sady a hledání by se zacyklilo');
  pravda('katalog bez pole `typ` se pozná podle `datová_sada`',
    H.jeKatalog({ 'datová_sada': [] }));
  pravda('prázdná odpověď katalog není', !H.jeKatalog(null));
  pravda('pole na vstupu katalog není', !H.jeKatalog([KATALOG]));
}

/* ---- 3) ČTENÍ KATALOGU --------------------------------------- */
{
  const k = H.katalogZOdpovedi(KATALOG);
  je('název česky', k.nazev, 'Katalog otevřených dat MMHK');
  je('domovská stránka', k.domov, 'https://opendata.mmhk.cz');
  je('osm datových sad', k.sady.length, 8);
  je('první sada je adresa', k.sady[0],
    'https://api.opendata.mmhk.cz/lod/catalog/815e142e-f2e8-4327-97e0-575939934d90');
  const prazdny = H.katalogZOdpovedi({});
  je('katalog bez sad dá prázdné pole, ne výjimku', prazdny.sady, []);
  /* A TOHLE TAKY NAŠEL SABOTÁŽNÍ STROJ: bez `filter(Boolean)` by se
     ze sady bez `iri` stala PRÁZDNÁ adresa a bot by se na ni vydal.
     Je to táž vada jako dnešní prázdná distribuce, jen o úroveň výš. */
  je('sada bez adresy se do seznamu nedostane jako prázdná adresa',
    H.katalogZOdpovedi({ 'datová_sada': ['https://a.cz/1', { nazev: 'bez iri' }, '', null] }).sady,
    ['https://a.cz/1']);
}

/* ---- 4) ČTENÍ DATOVÉ SADY ------------------------------------ */
{
  const s = H.sadaZOdpovedi(SADA);
  je('název sady', s.nazev, 'test1');
  je('popis sady', s.popis, 'wdwd');
  je('klíčová slova česky', s.klicova, 'teat1');
  /* A TOHLE TAKY NAŠEL SABOTÁŽNÍ STROJ: `textCs` nad polem zahazuje
     prázdné kusy, jinak by mezi slovy vznikla dvojitá mezera a z ní
     text, který se hůř hledá. Fixtura tedy musí mít prázdný kus. */
  je('víceřečové pole bez prázdných kusů', H.textCs({ cs: ['prodej', '', 'pozemků'] }), 'prodej pozemků');
  je('PRÁZDNÁ distribuce nedá soubor s prázdnou adresou', s.soubory, []);
}
{
  /* Táž sada, ale s vyplněnou distribucí — tak vypadá sada, která nás
     zajímá: soubor ke stažení je to, co by robot opravdu čtl. */
  const plna = JSON.parse(JSON.stringify(SADA));
  plna.distribuce[0]['soubor_ke_stažení'] = 'https://opendata.mmhk.cz/pozemky.csv';
  je('soubor ke stažení se přečte', H.sadaZOdpovedi(plna).soubory,
    ['https://opendata.mmhk.cz/pozemky.csv']);
  const jenPristup = JSON.parse(JSON.stringify(SADA));
  jenPristup.distribuce[0]['přístupové_url'] = 'https://opendata.mmhk.cz/api/pozemky';
  je('bez souboru se vezme přístupové url', H.sadaZOdpovedi(jenPristup).soubory,
    ['https://opendata.mmhk.cz/api/pozemky']);
}

/* ---- 5) SKÓRE: SLIBNÉ OD NESLIBNÉHO -------------------------- */
{
  je('„Prodej pozemků" projde mezí', H.skore('Prodej pozemků', '').skore >= H.MEZ_SKORE, true);
  pravda('„Pacht pozemků" se strhne — cena je tam roční nájem (§367)',
    H.skore('Pacht pozemků', '').skore < H.skore('Prodej pozemků', '').skore,
    'jinak bychom na web pustili nájem jako kupní cenu');
  pravda('jízdní řády neprojdou', H.skore('Jízdní řády MHD', 'odjezdy linek').skore < H.MEZ_SKORE);
  pravda('rozpočet obce neprojde', H.skore('Rozpočet města 2026', '').skore < H.MEZ_SKORE);
  pravda('dražby projdou', H.skore('Dražby nemovitostí', '').skore >= H.MEZ_SKORE);
  pravda('u každého skóre je napsáno, čím si ho vysloužilo',
    /\+5 pozemk/.test(H.skore('Prodej pozemků', '').duvod),
    H.skore('Prodej pozemků', '').duvod);
}

/* ---- 5b) BEZ SLOVA O PŘEVODU TO NENÍ NABÍDKA ------------------
   Těchto pět textů je PŘESNĚ to, co první ostrý běh (41810908514)
   vrátil jako kandidáty — a ani jeden z nich nebyl zdroj nabídek.
   Skóre si vysloužily slovem „parcela", „pozemek" nebo „katastr"
   v popisu něčeho úplně jiného. Proto tu stojí jmenovitě. */
{
  const FALESNE = [
    'Data RÚIAN o hierarchii prvků poskytovaná pro stát ve formátu CSV',
    'Seznam dětských hřišť na území MČ Praha 11 - 3/2026',
    'Hlavní odvodňovací a závlahová zařízení',
    'Památky, objekty',
    'Cenové mapy města Mostu',
  ];
  for (const n of FALESNE) {
    pravda(`„${n.slice(0, 40)}…" není nabídka`, !H.zminujePrevod(n, ''),
      'skóre: ' + JSON.stringify(H.skore(n, '')));
  }
  const PRAVE = [
    'Prodej pozemků',
    'Nabídka majetku',
    'Nabídky majetku státu',
    'Dražby nemovitostí',
    'Nepotřebný nemovitý majetek',
    'Záměr prodeje pozemku',
  ];
  for (const n of PRAVE) {
    pravda(`„${n}" nabídka je`, H.zminujePrevod(n, ''));
  }
  /* A PROČ TU „Nepotřebný nemovitý majetek" JE ZVLÁŠŤ. `\w` je
     v JavaScriptu jen [A-Za-z0-9_] — žádná diakritika. S `\w*` tahle
     věta NEPROŠLA, protože za „nepotřebn" stojí „ý". Tenhle řádek je
     tu proto, aby se `\S*` nikdo nevrátil na `\w*`. */
  pravda('česká koncovka pravidlo nerozbije (\\w diakritiku nezná)',
    H.zminujePrevod('Nepotřebný nemovitý majetek', ''));
  je('a v zahozených je důvod „bez převodu" pojmenovaný',
    H.kandidatiZeSad([{ nazev: 'Dětská hřiště a pozemky pod nimi', popis: 'parcely',
      iri: 'https://obec.cz/1' }], []).zahozeno.bezPrevodu, 1);
}

/* ---- 6) CO UŽ MÁME, TO NENÍ NÁLEZ ---------------------------- */
{
  const zname = H.znameHosty();
  pravda('registr zapojených a kandidátů není prázdný', zname.length > 5, JSON.stringify(zname));
  pravda('ÚZSVM už máme', H.uzMame('nabidkamajetku.gov.cz', zname), JSON.stringify(zname));
  pravda('podweb známého hosta taky máme', H.uzMame('api.nabidkamajetku.gov.cz', zname));
  pravda('katalog Hradce Králové zapojený není', !H.uzMame('api.opendata.mmhk.cz', zname));
  pravda('bez hostitele není co zapojit', H.uzMame('', zname));
}

/* ---- 7) ZE SAD NA KANDIDÁTY ---------------------------------- */
{
  const sady = [
    { nazev: 'Prodej pozemků', popis: 'Seznam pozemků určených k prodeji',
      iri: 'https://api.opendata.mmhk.cz/lod/catalog/a', adresa: 'https://opendata.mmhk.cz' },
    { nazev: 'Dražby nemovitostí', popis: '',
      iri: 'https://api.opendata.mmhk.cz/lod/catalog/b', adresa: 'https://opendata.mmhk.cz' },
    { nazev: 'Jízdní řády', popis: 'odjezdy',
      iri: 'https://api.opendata.mmhk.cz/lod/catalog/c', adresa: 'https://opendata.mmhk.cz' },
    { nazev: 'Nabídka majetku státu', popis: 'pozemky',
      iri: 'https://nabidkamajetku.gov.cz/api/x', adresa: 'https://nabidkamajetku.gov.cz' },
    { nazev: 'Prodej pozemků', popis: '', iri: '', adresa: '' },
  ];
  const n = H.kandidatiZeSad(sady, H.znameHosty());
  je('jeden hostitel = jeden kandidát', n.nalezeno.length, 1);
  je('a je to ten neznámý', n.nalezeno[0].host, 'api.opendata.mmhk.cz');
  je('počítá se, kolik slibných sad ten hostitel má', n.nalezeno[0].sad, 2);
  je('drží se ta nejslibnější', n.nalezeno[0].jmeno, 'Prodej pozemků');
  je('co už máme, se zahodí jmenovitě', n.zahozeno.uzMame, 1);
  je('slabé skóre se zahodí jmenovitě', n.zahozeno.nizkeSkore, 1);
  je('sada bez adresy se zahodí jmenovitě', n.zahozeno.bezAdresy, 1);
  const h = H.hlaseni(n).join('\n');
  pravda('hlášení řekne počty i důvody zahození',
    /Nalezeno 1 kandidátů/.test(h) && /už máme 1/.test(h) && /slabé skóre 1/.test(h), h);
  pravda('a u kandidáta je vidět, čím si skóre vysloužil', /\+5 pozemk/.test(h), h);
}
{
  /* Řazení: co má vyšší skóre, patří nahoru — člověk čte shora. */
  const sady = [
    { nazev: 'Dražby nemovitostí', popis: '', iri: 'https://a.cz/1' },
    { nazev: 'Prodej pozemků v obci', popis: 'parcely', iri: 'https://b.cz/1' },
  ];
  const n = H.kandidatiZeSad(sady, []);
  je('nahoře je slibnější kandidát', n.nalezeno.map((x) => x.host), ['b.cz', 'a.cz']);
}

/* ---- 8) ŽIVÁ ČÁST: CO SE MÁ DRŽET, SE DRŽÍ V KÓDU ------------ */
{
  const telo = readFileSync(new URL('./hledej-zdroje.mjs', import.meta.url), 'utf8');
  const hlavni = telo.slice(telo.indexOf('async function main()'));
  pravda('robots.txt se čte DŘÍV, než se seznam stáhne',
    hlavni.indexOf('smimeCist(SEZNAM_KATALOGU') < hlavni.indexOf('stahni(SEZNAM_KATALOGU'),
    'jinak bychom stahovali a teprve pak se ptali, jestli smíme');
  pravda('u každé cizí adresy se robots.txt čte taky',
    /smimeCist\(url/.test(telo) || /smimeCist\(adresa/.test(telo)
      || /smime = await smimeCist/.test(telo),
    'robots každého webu patří tomu webu, ne jen tomu prvnímu');
  pravda('zákaz zastaví čtení, neobchází se',
    /if \(!smime\.dovoleno\) return \{ chyba/.test(telo));
  /* PAUZA SE MĚŘÍ NADVAKRÁT. Jen hledat v kódu `await pauza(X)` nestačí:
     kdyby se ta konstanta přejmenovala, v kódu by řádek zůstal, hledání
     by při běhu spadlo na nedefinované jméno — a zkouška by o tom
     nevěděla. Proto se ptám i modulu samotného, co ta hodnota je. */
  pravda('pauza je kladné číslo, které modul opravdu vyváží',
    typeof H.PAUZA_MEZI_DOTAZY === 'number' && H.PAUZA_MEZI_DOTAZY > 0,
    'vyvezeno: ' + JSON.stringify(H.PAUZA_MEZI_DOTAZY));
  je('a pauza je v obou smyčkách, které chodí na cizí weby',
    (hlavni.match(/await pauza\(PAUZA_MEZI_DOTAZY\)/g) || []).length, 2);
  pravda('bez --zapis se nezapisuje nic',
    hlavni.indexOf("includes('--zapis')") < hlavni.indexOf('writeFileSync')
      && /if \(!zapsat\)/.test(hlavni));
  pravda('zakázané cesty data.gov.cz jsou v souboru napsané, ať se o nich ví',
    /Disallow: \/zdroj\//.test(telo) && /Disallow: \/sparql\*/.test(telo),
    'bez toho to po mně někdo zkusí znovu');
  pravda('strop na sady z jednoho katalogu se opravdu použije',
    /Math\.min\(STROP_SAD_NA_KATALOG, zbyva\)/.test(telo));
  pravda('a rozpočet celého běhu taky — jeden katalog nesmí spolknout čas úlohy',
    /STROP_DOTAZU_CELKEM - dotazu/.test(telo), 'ČSÚ má sám 1 018 sad');
  pravda('co se kvůli stropům nepřečte, se sečte a napíše',
    /nepreceteno \+= k\.sady\.length - sady\.length/.test(telo)
      && /Nepřečteno \$\{nepreceteno\}/.test(telo),
    'tiché zahození je horší než malé číslo');
}

console.log('Hledání nových zdrojů — rejstřík lokálních katalogů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) console.error(`::error::Hledání zdrojů: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`);
process.exit(chyb ? 1 : 0);
