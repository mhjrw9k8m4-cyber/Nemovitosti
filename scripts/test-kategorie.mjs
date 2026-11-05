#!/usr/bin/env node
/* KATEGORIE NEMOVITOSTI Z TEXTU (js/kategorie.js)
   ==================================================================
   Spuštění: node scripts/test-kategorie.mjs   (bez prohlížeče a sítě)

   PROČ TOHLE EXISTUJE. Majitel 5. 11. rozhodl, že na webu budou všechny
   nemovitosti, ne jen pozemky. Dražební rejstříky ani ÚZSVM ale
   nehlásí „tohle je dům" — dávají jen název a popis, takže kategorii
   musí poznat kód z volného textu. A to je přesně ten druh rozhodování,
   které tiše lže: špatná kategorie se nikde neprojeví jako chyba, jen
   bude dům ležet mezi pozemky, pokřiví obvyklou cenu za m² a filtr
   „pozemky" ho vypíše.

   MĚŘÍ SE TŘI VĚCI:
     1. PŘEDNOSTI — „dům s pozemkem" je dům, „dům s garáží" je dům,
        „areál, bývalý kravín" je areál. Každá z těch vazeb se dá
        otočit a žádná by nespadla, kdyby se neměřila.
     2. PASTI VOLNÉHO TEXTU — zahradní domek z pozemku dům nedělá,
        „pozemek vedle domu" taky ne, dispozice „2+1" sama neznamená byt.
     3. ŽE SE DNEŠNÍ DATA NEZMĚNÍ — na všech nabídkách, které web dnes
        má, musí vyjít pozemek. Je to pojistka proti tomu, aby nová
        pravidla zpětně překlopila existující web.
   ================================================================== */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const K = require_(join(KOREN, 'js', 'kategorie.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}\n      vyšlo  ${a}`); }
}
function pravda(popis, v, proc) {
  if (v) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/** Tak, jak to bude volat robot: co se nepozná, je pozemek. */
const kat = (t, mista) => K.zTextu(t, mista || []) || K.VYCHOZI;

/* ---- 1) PŘEDNOSTI ------------------------------------------------
   Všechny vazby níž mají v textu slova DVOU kategorií a rozhoduje
   přednost. Kdyby se pořadí pravidel obrátilo, vyjde druhá — a nic
   jiného by si toho nevšimlo. */
{
  je('„dům s pozemkem" je dům, ne pozemek',
    kat('Dražba rodinného domu s pozemkem, k.ú. Vráž'), 'dum');
  je('„dům s garáží" je dům, ne garáž',
    kat('Rodinný dům s garáží a zahradou'), 'dum');
  je('„areál, bývalý kravín" je areál, ne farma',
    kat('Dražba zemědělského areálu, bývalý kravín'), 'areal');
  je('„bytový dům jako celek" je dům, ne byt',
    kat('Prodej bytového domu jako celku'), 'dum');
  je('a „byt v bytovém domě" je byt',
    kat('Prodej bytu 3+kk v bytovém domě, Brno'), 'byt');
}

/* ---- 2) PASTI VOLNÉHO TEXTU -------------------------------------- */
{
  /* Stavba na pozemku z něj nedělá dům, když je to kůlna. */
  je('zahradní domek z pozemku dům nedělá',
    kat('Pozemek se zahradním domkem na nářadí'), 'pozemek');
  /* Okolí místo předmětu — táž past jako u druhu pozemku. */
  je('„pozemek vedle domu" je pozemek',
    kat('Pozemek vedle domu č.p. 12'), 'pozemek');
  /* Zápor před nálezem. */
  je('„pozemek bez domu" je pozemek',
    kat('Pozemek bez domu, pouze parcela'), 'pozemek');
  /* DISPOZICE SAMA NEZNAMENÁ BYT. Tohle vyšlo špatně při psaní:
     dokud dispozice hrála dřív než chata, byl „Prodej chaty 2+1"
     vedený jako byt. */
  je('dispozice u chaty z ní byt nedělá',
    kat('Prodej chaty 2+1 u lesa'), 'chata');
  je('ale dispozice bez jiného slova bytem je',
    kat('Prodej 3+kk, 72 m², Plzeň'), 'byt');
  /* NÁZEV OBCE. Domašov a Chatov by jinak udělaly z pozemku dům
     a chatu — proto se jména míst z textu vyhazují. */
  je('obec Domašov nedělá z pozemku dům',
    kat('Prodej pozemku, Domašov', ['Domašov', 'Brno-venkov']), 'pozemek');
  je('a obec Chatov nedělá chatu',
    kat('Prodej pozemku, Chatov', ['Chatov', 'Znojmo']), 'pozemek');
  /* Nebytový prostor je komerční, a hlavně NENÍ byt (hranice slova). */
  je('„nebytový prostor" není byt',
    kat('Nebytový prostor — obchodní prostory 120 m²'), 'komercni');
  /* NOMINATIV „DŮM" SE NESMÍ ZAPOMENOUT. Bez diakritiky je to „dum",
     tedy jiný tvar než „domu/domy" — napoprvé tu nominativ chyběl
     a „Rodinný dům s garáží" nevyšel jako nic. */
  je('samotné „dům" v nominativu se pozná',
    kat('Dům k demolici, pozemek 900 m²'), 'dum');
  /* Nic z toho, co web dnes má, se nesmí přeznačit. */
  je('obyčejný pozemek zůstane pozemkem',
    kat('Prodej trvalého travního porostu, 1,2 ha'), 'pozemek');
  je('a pacht pozemku taky',
    kat('Pacht pozemku p.č. 2025, Racková'), 'pozemek');
  je('statek je farma', kat('Prodej statku s hospodářským dvorem'), 'farma');
  je('sklad a hala jsou komerční objekt',
    kat('Dražba skladu a výrobní haly'), 'komercni');
  je('garáž na prodej je garáž', kat('Prodej garáže, Ostrava-Poruba'), 'garaz');
  /* JMÉNO WEBU NENÍ PŘEDMĚT PRODEJE. Nabídky nesou v `extra` svůj
     původ („inzerát – Farmy.cz") a slovo „Farmy" je ve pravidlech
     farmy — naměřeno při psaní téhle zkoušky: každá nabídka z toho
     zdroje vycházela jako farma. Doména se proto vyhazuje dřív, než
     se cokoli hledá. */
  je('zdroj „Farmy.cz" z pozemku farmu nedělá',
    kat('Bohušov pozemek inzerát – Farmy.cz', ['Bohušov', 'Bruntál']), 'pozemek');
  je('ani „orná půda, inzerát – Farmy.cz"',
    kat('Smilovice orná půda inzerát – Farmy.cz', ['Smilovice', 'Frýdek-Místek']), 'pozemek');
  je('ale opravdová farma v názvu farmou zůstane',
    kat('Prodej farmy s pastvinami, inzerát – Farmy.cz'), 'farma');
  /* A ZKRATKY SE NESMÍ ROZKOUSNOUT: „p.č." ani „k.ú." nejsou domény. */
  je('„p.č." a „k.ú." doména nejsou',
    kat('Prodej pozemku p.č. 2025/3, k.ú. Racková'), 'pozemek');
  pravda('bezDomen vyhodí doménu a text nechá',
    K.bezDomen('pozemek inzerat farmy.cz brno').indexOf('farmy') < 0
    && K.bezDomen('pozemek inzerat farmy.cz brno').indexOf('pozemek') >= 0,
    JSON.stringify(K.bezDomen('pozemek inzerat farmy.cz brno')));
}

/* ---- 3) POPIS KATEGORIE A MĚŘENÍ PLOCHY --------------------------
   `mera` rozhoduje, jestli se smí počítat obvyklá cena proti pozemkům.
   U bytu je výměra podlahová plocha a Kč/m² pozemku by tam bylo číslo
   bez významu — verdikt „levné" postavený na něm by byla lež. */
{
  je('u pozemku se měří plocha pozemku', K.mera('pozemek'), 'pozemek');
  je('u bytu podlahová plocha', K.mera('byt'), 'podlahova');
  je('u domu obojí a nesmí se to míchat', K.mera('dum'), 'obe');
  pravda('obvyklá cena za m² se smí počítat JEN u pozemků',
    K.jePozemkova('pozemek') === true
    && K.KLICE.filter((k) => k !== 'pozemek').every((k) => K.jePozemkova(k) === false),
    'pozemkové: ' + K.KLICE.filter((k) => K.jePozemkova(k)).join(', '));
  je('neznámý klíč se srovná na pozemek', K.klic('nesmysl'), 'pozemek');
  je('prázdný klíč taky', [K.klic(''), K.klic(null), K.klic(undefined)],
    ['pozemek', 'pozemek', 'pozemek']);
  je('a platný klíč se nepřepisuje', K.klic('byt'), 'byt');
  pravda('každá kategorie má jméno, množné číslo, ikonu i míru',
    K.KATEGORIE.every((z) => z.jmeno && z.mnozne && z.ikona && z.mera),
    JSON.stringify(K.KATEGORIE.filter((z) => !(z.jmeno && z.mnozne && z.ikona && z.mera))));
  pravda('klíče se neopakují',
    new Set(K.KLICE).size === K.KLICE.length, K.KLICE.join(', '));
  pravda('každé pravidlo míří na existující kategorii',
    K.PRAVIDLA.every((p) => K.KLICE.indexOf(p.kat) >= 0),
    JSON.stringify(K.PRAVIDLA.filter((p) => K.KLICE.indexOf(p.kat) < 0).map((p) => p.kat)));
  /* Pozemek musí být v pravidlech POSLEDNÍ: slovo „pozemek" stojí
     skoro v každém inzerátu, i v tom o domě. */
  je('pravidlo pro pozemek je poslední',
    K.PRAVIDLA[K.PRAVIDLA.length - 1].kat, 'pozemek');
}

/* ---- 4) DNEŠNÍ DATA SE NESMÍ ZMĚNIT -----------------------------
   Nová pravidla se pouštějí na všechny nabídky, které web má. Všechny
   jsou pozemky, takže musí vyjít pozemek u VŠECH — jinak by zapojení
   kategorií zpětně překlopilo existující web a nikdo by to nepoznal
   (stránky se jen přegenerují a vypadají normálně). */
{
  let data = null;
  try { data = JSON.parse(readFileSync(join(KOREN, 'data', 'opportunities.json'), 'utf8')); }
  catch { data = null; }
  const vse = (data && data.opportunities) || [];
  pravda('data k měření jsou (jinak tahle kontrola nic netvrdí)',
    vse.length > 100, 'nabídek: ' + vse.length);
  const jine = [];
  for (const o of vse) {
    const txt = [o.place, o.druh, o.extra].filter(Boolean).join(' ');
    if (kat(txt, [o.place, o.okres]) !== 'pozemek') {
      jine.push(o.place + ' | ' + txt.slice(0, 90));
    }
  }
  pravda(`na všech ${vse.length} dnešních nabídkách vyjde pozemek`,
    jine.length === 0, jine.slice(0, 5).join('\n      '));
}

/* ---- 5) CENOVÝ MODEL BERE JEN POZEMKY ---------------------------
   ==================================================================
   `js/ceny.js` počítá obvyklou cenu za metr POZEMKU — medián okresu,
   percentil nabídky, verdikt „levné". Byt má výměru podlahovou a
   v ceně domu je stavba, takže jedna taková nabídka v přihrádce
   pokřiví číslo VŠEM ostatním, kdo v ní jsou. Proto si `postav()`
   filtruje vstup sám (`jenPozemky`): volá se z devíti míst a devět
   míst znamená devět příležitostí zapomenout.

   TAHLE KONTROLA JE HLÍDAČ PROTI ROZEJITÍ. Pravidlo je v ceny.js
   opsané („`kat` chybí nebo je 'pozemek'"), aby se kvůli jedné
   podmínce netahaly na stránku dva další moduly. Opsané pravidlo se
   dřív nebo později rozejde s originálem — pokud to někdo neměří. */
{
  require_(join(KOREN, 'js', 'ceny.js'));
  const CENY = globalThis.PK_CENY;
  pravda('js/ceny.js si vstup modelu filtruje sám',
    CENY && typeof CENY.jenPozemky === 'function',
    'bez toho by stačilo zapomenout na jednom z devíti volajících');
  if (CENY && typeof CENY.jenPozemky === 'function') {
    /* Pro KAŽDOU kategorii musí obě místa říct totéž. Kdyby přibyla
       druhá pozemková kategorie, tahle kontrola spadne a vynutí
       úpravu na obou místech — přesně o to jde. */
    const rozchod = K.KLICE.filter((k) =>
      K.jePozemkova(k) !== (CENY.jenPozemky([{ kat: k }]).length === 1));
    pravda('a pozemkovost chápou ceny i kategorie stejně',
      rozchod.length === 0, 'rozcházejí se u: ' + rozchod.join(', '));
    je('nabídka bez kategorie je pozemek i pro model',
      CENY.jenPozemky([{}]).length, 1);
    je('byt, dům ani jiná nemovitost do modelu nejdou',
      CENY.jenPozemky([{ kat: 'byt' }, { kat: 'dum' }, { kat: 'jine' }]).length, 0);
    je('a co není pole, se nerozbije', CENY.jenPozemky(null), null);
  }
}

console.log('\nKategorie nemovitosti');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.error(`::error::Kategorie nemovitosti: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`
    + ' Špatná kategorie se neprojeví jako chyba — dům jen leží mezi pozemky'
    + ' a pokřiví obvyklou cenu za m².');
  process.exit(1);
}
process.exit(0);
