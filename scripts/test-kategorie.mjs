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
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const K = require_(join(KOREN, 'js', 'kategorie.js'));
/* SNÍMEK SE BERE JAKO V GENERÁTORU. js/snimek.js je IIFE nad globálem,
   ne modul — scripts/generate-parcel-pages.mjs ho proto spouští přes
   new Function() s globalThis.window = globalThis. Tady totéž, aby se
   měřilo to, co se opravdu servíruje. */
globalThis.window = globalThis;
new Function(readFileSync(join(KOREN, 'js', 'snimek.js'), 'utf8'))();
const SNIMEK = globalThis.PK_SNIMEK;

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

/* ---- 2b) SLOVA, KTERÁ ZDROJ OPRAVDU PÍŠE ------------------------
   ==================================================================
   Tyhle texty nejsou vymyšlené: jsou opsané z nabídky ÚZSVM, jak ji
   5. 11. vrátilo její API (sonda v Actions, §415). Je to ten jediný
   vzorek, podle kterého se dá soudit, jestli rozpoznávání v praxi
   k něčemu je.

   A rozhodlo víc, než se zdá. První běh naostro po zapojení kategorií
   přinesl 30 nepozemkových nabídek a VŠECHNY vyšly jako „jiná
   nemovitost" — ne proto, že by pravidla byla slabá, ale protože se
   hádalo z textu, ve kterém předmět prodeje vůbec nebyl (obec, druh
   parcely, termín aukce). Jméno a popis nabídky má v ruce jedině
   čtečka ÚZSVM; od té chvíle je předává (viz scripts/cti-uzsvm.mjs). */
{
  const s = (n, d) => n + ' ' + d;
  je('„budova č.p. 442 … rod. dům" je dům',
    kat(s('Králův Dvůr, budova č.p. 442',
      'součástí je stavba: Králův Dvůr, č.p. 442, rod. dům'),
      ['Králův Dvůr', 'Beroun']), 'dum');
  je('„areál zámku" je areál',
    kat(s('Štiřín - areál zámku Štiřín', 'Nemovité věci, které tvoří areál zámku'),
      ['Štiřín', 'Praha-východ']), 'areal');
  /* OBĚ TAHLE SLOVA JSEM DO PRAVIDEL PŘIDAL AŽ PODLE TOHOHLE MĚŘENÍ.
     Bez nich vycházela obě jako „jiná nemovitost", přitom je to
     komerční objekt. */
  je('„rekreační zařízení" je komerční objekt',
    kat(s('Rekreační zařízení, k.ú. Antonínov',
      'Pozemky: st. parcela č. 631 o výměře 320 m2, zastavěná plocha a nádvoří'),
      ['Antonínov', 'Jablonec nad Nisou']), 'komercni');
  je('„ubytovací zařízení" taky',
    kat(s('Horní Albeřice, č. p. 42, ubytovací zařízení',
      'Součástí je stavba: Horní Albeřice, č. p. 42, ubytovací zařízení'),
      ['Horní Albeřice', 'Trutnov']), 'komercni');
  /* A SAMOTNÉ „ZAŘÍZENÍ" SE NEBERE: v popisech je i o technickém
     zařízení budovy, takže by z pozemku dělalo komerční objekt. */
  je('ale samo „zařízení" komerční objekt nedělá',
    kat('pozemek s technickým zařízením budovy', ['Zařízov', 'Praha']), 'pozemek');
  /* A pozemek ze stejného vzorku zůstane pozemkem — jinak by tahle
     čtyřka znamenala jen to, že pravidla říkají všechno. */
  je('a pozemek z téhož vzorku zůstane pozemkem',
    kat(s('pozemek p. č. 233/3 v k. ú. Bukovec',
      'Pozemek p. č. 233/3 o výměře 15 003 m2 se nachází v okrajové části obce.'),
      ['Bukovec', 'Plzeň-město']), 'pozemek');
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
  /* CO SE PRODÁVÁ — a že se u POZEMKU nic nezmění. Obojí našla ruční
     sabotáž: dokud se měřila jen `mera`, prošlo i to, že
     nadpisKategorie() vrací jméno i u pozemku (nadpis každé z 2 303
     dnešních stránek by přestal říkat druh a začal říkat „Pozemek"),
     i to, že popisVymery() mlčí u bytu (holé „54 m²" vedle pozemků,
     kde totéž číslo znamená plochu parcely). */
  je('u pozemku nadpis dělá druh, ne kategorie', K.nadpisKategorie({}), null);
  je('a u pozemku označeného klíčem taky', K.nadpisKategorie({ kat: 'pozemek' }), null);
  je('u bytu nadpis dělá kategorie', K.nadpisKategorie({ kat: 'byt' }), 'Byt');
  je('u domu taky', K.nadpisKategorie({ kat: 'dum' }), 'Dům');
  pravda('a nadpis má KAŽDÁ nepozemková kategorie',
    K.KLICE.filter((k) => !K.jePozemkova(k))
      .every((k) => K.nadpisKategorie({ kat: k }) === K.jmeno(k)),
    'bez nadpisu: ' + K.KLICE.filter((k) => !K.jePozemkova(k))
      .filter((k) => K.nadpisKategorie({ kat: k }) !== K.jmeno(k)).join(', '));
  je('u bytu se o výměře řekne, že je podlahová',
    K.popisVymery({ kat: 'byt' }), 'podlahová plocha');
  je('u garáže taky', K.popisVymery({ kat: 'garaz' }), 'podlahová plocha');
  je('u pozemku se nic nepřipisuje', [K.popisVymery({}), K.popisVymery({ kat: 'pozemek' })],
    ['', '']);
  /* U domu, areálu a farmy (`mera: 'obe'`) se SCHVÁLNĚ neříká nic: ze
     zdrojů nevyplývá, jestli uložené číslo je plocha parcely, nebo
     zastavěná plocha. Tipovat to je horší než mlčet — a tahle kontrola
     drží to rozhodnutí, aby se časem tiše nezměnilo. */
  je('u domu a areálu se o výměře mlčí',
    [K.popisVymery({ kat: 'dum' }), K.popisVymery({ kat: 'areal' }), K.popisVymery({ kat: 'farma' })],
    ['', '', '']);
  pravda('a popisek výměry sedí s mírou u každé kategorie',
    K.KLICE.every((k) => (K.mera(k) === 'podlahova')
      === (K.popisVymery({ kat: k }) === 'podlahová plocha')),
    'rozcházejí se u: ' + K.KLICE.filter((k) => (K.mera(k) === 'podlahova')
      !== (K.popisVymery({ kat: k }) === 'podlahová plocha')).join(', '));
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

/* ---- 4) POZEMEK SE NESMÍ TIŠE PŘEKLOPIT -------------------------
   ==================================================================
   Nová pravidla se pouštějí na VŠECHNY nabídky, které web má. Co se
   vede jako pozemek, musí z textu vyjít jako pozemek — jinak by
   kategorie zpětně překlopily existující web a nikdo by to nepoznal
   (stránky se jen přegenerují a vypadají normálně).

   A POZOR, JAK JE TA VĚTA NAPSANÁ. Nejdřív tu stálo „u všech nabídek
   musí vyjít pozemek", protože 5. 11. to byla pravda u všech 2 303.
   Byla to ale **časovaná bomba**: jakmile noční robot uloží první byt
   nebo dům, taková kontrola spadne — a ne proto, že by se něco
   rozbilo, nýbrž proto, že se povedlo přesně to, o co jde. Zelená CI
   by pak padla na úspěchu a člověk by hledal vadu, která není.

   Měří se proto to, co se opravdu měřit má: nabídky, které jsou
   vedené jako POZEMEK (`kat` chybí nebo je 'pozemek'), musí z textu
   vyjít jako pozemek. Nabídky s jinou kategorií do téhle otázky
   nepatří — tam `kat` nastavil robot, a u ÚZSVM ne z textu, ale
   z číselníku kategorií zdroje. */
{
  let data = null;
  try { data = JSON.parse(readFileSync(join(KOREN, 'data', 'opportunities.json'), 'utf8')); }
  catch { data = null; }
  const vse = (data && data.opportunities) || [];
  pravda('data k měření jsou (jinak tahle kontrola nic netvrdí)',
    vse.length > 100, 'nabídek: ' + vse.length);
  const pozemky = vse.filter((o) => !o.kat || o.kat === 'pozemek');
  const jine = [];
  for (const o of pozemky) {
    const txt = [o.place, o.druh, o.extra].filter(Boolean).join(' ');
    if (kat(txt, [o.place, o.okres]) !== 'pozemek') {
      jine.push(o.place + ' | ' + txt.slice(0, 90));
    }
  }
  pravda(`na všech ${pozemky.length} nabídkách vedených jako pozemek vyjde pozemek`
    + ` (z ${vse.length} celkem)`,
    jine.length === 0, jine.slice(0, 5).join('\n      '));
  /* A KDYŽ UŽ DATA NESOU KATEGORII, ať je to známý klíč. Neznámá
     hodnota by prošla celým webem jako „pozemek" (viz klic()) a nikde
     by se neukázala — filtr by ji nenašel a cenový model by ji pustil
     do průměru pozemků. */
  const spatne = [...new Set(vse.map((o) => o.kat).filter(Boolean)
    .filter((k) => K.KLICE.indexOf(k) < 0))];
  pravda('a každá kategorie v datech je známý klíč',
    spatne.length === 0, 'neznámé: ' + spatne.join(', '));
  /* KOLIK JICH PODLE KATEGORIE JE — vypíše se vždycky, i když je to
     dnes jediná hodnota. Je to to jediné číslo, ze kterého se pozná,
     že se celá tahle práce v datech vůbec projevila. */
  const pocty = {};
  for (const o of vse) pocty[o.kat || 'pozemek'] = (pocty[o.kat || 'pozemek'] || 0) + 1;
  console.log('  · podle kategorie: ' + Object.keys(pocty).sort()
    .map((k) => k + ' ' + pocty[k]).join(', '));
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

/* ---- 6) KČ/M² JE POZEMKOVÉ ČÍSLO -------------------------------
   ==================================================================
   `zaMetr()` není jen popisek na kartě. Jedno a totéž číslo nese
   percentilovou stupnici barev na mapě, filtr „jen levné", řazení
   podle ceny za metr, verdikt o ceně, vývoz do tabulky i upozornění
   mailem a do telefonu — všude se srovnává napříč nabídkami.

   Kdyby do té stupnice vstoupil byt, je to srovnání 35 000 Kč/m²
   podlahové plochy s 35 Kč/m² pole: každý pozemek vyjde jako zdarma
   a „jen levné" přestane dávat smysl. A nespadne nic — čísla se jen
   tiše pokřiví.

   Druhá polovina pasti: strop uvěřitelnosti (30 000 Kč/m²) by
   většinu bytů zahodil SÁM. Web by se tedy tvářil, že u nich cenu za
   metr spočítat neumí, a vypadalo by to jako záměr. Proto se tu měří
   i byt POD stropem — ten strop neprojde, projít musí kategorie.

   Obě kopie pravidla (js/ceny.js a js/hlidani-logika.js, dvojče pro
   Node) se měří zvlášť. Rozchod by znamenal, že web tiskne jiné
   číslo než mail o téže nabídce. */
{
  require_(join(KOREN, 'js', 'ceny.js'));
  const CENY = globalThis.PK_CENY;
  const PKH = require_(join(KOREN, 'js', 'hlidani-logika.js'));
  /* 500 000 Kč za 20 m² = 25 000 Kč/m², tedy POD stropem. U pozemku
     je to platné číslo, u bytu nesmí vyjít nic. */
  const zaklad = { price: 500000, area: 20 };
  je('u pozemku cena za metr vyjde (jinak tahle kontrola nic netvrdí)',
    Math.round(CENY.zaMetr({ ...zaklad })), 25000);
  je('a u pozemku výslovně označeného kategorií taky',
    Math.round(CENY.zaMetr({ ...zaklad, kat: 'pozemek' })), 25000);
  const mluvi = K.KLICE.filter((k) => !K.jePozemkova(k))
    .filter((k) => CENY.zaMetr({ ...zaklad, kat: k }) !== null);
  pravda('u žádné nepozemkové kategorie cena za metr nevyjde',
    mluvi.length === 0, 'mluví u: ' + mluvi.join(', '));
  const mluviH = K.KLICE.filter((k) => !K.jePozemkova(k))
    .filter((k) => PKH.zaMetr({ ...zaklad, kat: k }) !== null);
  pravda('ani ve dvojčeti pro upozornění (js/hlidani-logika.js)',
    mluviH.length === 0, 'mluví u: ' + mluviH.join(', '));
  const rozchod2 = K.KLICE.filter((k) =>
    CENY.zaMetr({ ...zaklad, kat: k }) !== PKH.zaMetr({ ...zaklad, kat: k }));
  pravda('a obě kopie říkají u každé kategorie totéž',
    rozchod2.length === 0, 'rozcházejí se u: ' + rozchod2.join(', '));
  /* Uložené hledání „do N Kč/m²" nesmí nepozemkovou nabídku pustit —
     kdyby ji pustilo, přišlo by upozornění na byt jako na levný
     pozemek. Prázdná cena za metr tam znamená „nevíme", tedy nepustit
     (viz matches() v js/hlidani-logika.js). */
  const hledani = { max_perm2: 30000 };
  pravda('hlídání „do 30 000 Kč/m²" pozemek pustí',
    PKH.matches(hledani, { ...zaklad, type: 'sale' }) === true);
  pravda('a byt nepustí',
    PKH.matches(hledani, { ...zaklad, type: 'sale', kat: 'byt' }) === false);
}

/* ---- 7) MODUL SE MUSÍ NAČÍST I V PROHLÍŽEČI --------------------
   ==================================================================
   js/druh.js je modul ROBOTA — žádná stránka ho nenačítá a kvůli jedné
   funkci by si ho musel stáhnout každý návštěvník (12 420 B zdroje,
   5 423 B přes drát). Prohlížeč přitom text nikdy nerozebírá: kategorii
   pozná robot při stahování a uloží ji do `kat`, stránce stačí popis.

   Měří se proto obě strany téže věci. Modul se v prostředí BEZ
   PKDruh musí načíst a popis musí fungovat — jinak by se kategorie na
   webu nedaly použít vůbec. A `zTextu()` tam musí spadnout nahlas se
   jménem chybějícího modulu — tichý náhradní normalizátor by znamenal,
   že prohlížeč počítá kategorii jinak než robot, a to se pozná teprve
   na datech.

   Prostředí se dělá přes node:vm, ne předstíráním: v sandboxu není
   `module`, takže se vykoná ta větev UMD hlavičky, kterou vykoná
   prohlížeč. */
{
  const vm = await import('node:vm');
  const kod = readFileSync(join(KOREN, 'js', 'kategorie.js'), 'utf8');
  const okno = { console };
  okno.self = okno;
  const ctx = vm.createContext(okno);
  let vyjimkaPriNacteni = null;
  try { vm.runInContext(kod, ctx, { filename: 'js/kategorie.js' }); }
  catch (e) { vyjimkaPriNacteni = e; }
  pravda('kategorie.js se načtou i bez js/druh.js (tak je bere stránka)',
    vyjimkaPriNacteni === null, vyjimkaPriNacteni && vyjimkaPriNacteni.message);
  const B = okno.PKKategorie;
  pravda('a modul se tam opravdu zveřejní jako PKKategorie', !!B);
  if (B) {
    je('popis kategorie v prohlížeči funguje', [B.jmeno('byt'), B.mnozne('byt')],
      ['Byt', 'Byty']);
    je('míra i pozemkovost taky', [B.mera('byt'), B.jePozemkova('byt')],
      ['podlahova', false]);
    let hlaska = '';
    try { B.zTextu('Prodej bytu 3+kk', []); } catch (e) { hlaska = e.message; }
    pravda('ale rozbor textu bez js/druh.js spadne, a řekne čeho se mu nedostává',
      hlaska.indexOf('druh.js') >= 0, hlaska ? 'hláška: ' + hlaska : 'nespadlo vůbec');
  }
}

/* ---- 8) NADPIS NABÍDKY UMÍ KAŽDOU KATEGORII --------------------
   ==================================================================
   Nadpis karty i stránky skládá PKCisteni.hlavaNabidky(): z „Byt"
   a dražby udělá „Dražba bytu". Dělá to přes tabulku druhých pádů
   (DRUH_2P) a co v ní není, vrátí BEZ ZMĚNY — tedy holé „Byt" tam, kde
   se draží. Nespadne nic, jen z nadpisu zmizí, o jakou akci jde.

   Proto se měří obě strany: každá kategorie má druhý pád, a nadpis
   nabídky jím opravdu projde. Nová kategorie tak nemůže tiše přestat
   umět říct, že se draží. */
{
  const C = require_(join(KOREN, 'js', 'cisteni.js'));
  const bez2p = K.KATEGORIE.map((z) => z.jmeno).filter((j) => !C.DRUH_2P[j]);
  pravda('každá kategorie má v js/cisteni.js druhý pád',
    bez2p.length === 0, 'chybí u: ' + bez2p.join(', '));
  je('a z bytu v dražbě vyjde „Dražba bytu"',
    C.hlavaNabidky(K.jmeno('byt'), 'drazba'), 'Dražba bytu');
  je('z domu na prodej „Prodej domu"',
    C.hlavaNabidky(K.jmeno('dum'), 'sale'), 'Prodej domu');
  /* Pozemek tou cestou chodí odjakživa a nesmí se změnit. */
  je('a u pozemku nadpis dělá pořád druh',
    C.hlavaNabidky('Orná půda', 'drazba'), 'Dražba orné půdy');
  /* Druhý pád se smí doplnit jen tam, kde se opravdu píše nadpis —
     tahle kontrola měří, že žádná kategorie nepropadne skrz. */
  const propadly = K.KATEGORIE
    .map((z) => [z.klic, C.hlavaNabidky(z.jmeno, 'drazba')])
    .filter(([, h]) => h.indexOf('Dražba ') !== 0);
  pravda('žádná kategorie neprojde nadpisem bez akce',
    propadly.length === 0, JSON.stringify(propadly));
}


/* ==================================================================
   9) SERVÍROVANÁ STRÁNKA: POZEMKOVÁ SLOVA U NEPOZEMKOVÉ NABÍDKY
   ==================================================================
   Fáze 2 naučila mluvit js/pozemek.js — tedy stránku, jak ji dokreslí
   prohlížeč. Generátor servírované stránky zůstal pozadu a naměřilo se
   to teprve na ostrých datech 5. 11., u 30 nabídek:

     • „Druh pozemku: Jiná nemovitost" — nálepka si odporuje s hodnotou
       v jednom řádku. Druh pozemku je u budovy nanejvýš druh parcely
       POD ní.
     • „Stavební pozemky — týž druh pozemku po celé ČR" u nabídky, která
       pozemek není, a odkaz vedl na výpis, kde ta nabídka vůbec není.
     • „přesný obrys pozemku najdete v katastru" přes snímek něčeho,
       co se jako pozemek neprodává.

   Hlídá se to na HOTOVÝCH souborech, ne na šabloně: šablonu lze
   opravit a stránky přitom nechat staré. */
{
  const vsechny = readdirSync(KOREN).filter((f) => f.startsWith('pozemek-') && f.endsWith('.html'));
  let nepozemkovych = 0;
  const sObrysem = [], sDruhovkou = [], sNalepkou = [];
  for (const f of vsechny) {
    const h = readFileSync(join(KOREN, f), 'utf8');
    if (h.indexOf('Druh pozemku</dt><dd>Jiná nemovitost') >= 0) sNalepkou.push(f);
    if (h.indexOf('Typ nemovitosti</dt>') < 0) continue;
    nepozemkovych++;
    if (h.indexOf('obrys pozemku') >= 0) sObrysem.push(f);
    if (h.indexOf('týž druh pozemku') >= 0) sDruhovkou.push(f);
  }
  /* MĚŘENÍ MUSÍ MÍT NA ČEM MĚŘIT. Kdyby data jednou nesla samé
     pozemky, dvě kontroly níž by byly zelené prázdnotou — a to je
     přesně to ticho, kvůli kterému §413 zavedl hlídače na hlídače.
     Nula se proto hlásí jako neměřeno, ne jako úspěch. */
  if (!nepozemkovych) {
    zpravy.push('  – v datech není ani jedna nepozemková stránka, dvě kontroly se neměří');
  } else {
    pravda('nepozemková stránka nemluví o obrysu pozemku',
      sObrysem.length === 0, sObrysem.slice(0, 3).join(', '));
    pravda('a nenabízí „týž druh pozemku po celé ČR"',
      sDruhovkou.length === 0, sDruhovkou.slice(0, 3).join(', '));
  }
  pravda('a nálepka „Druh pozemku" nestojí u jiné nemovitosti',
    sNalepkou.length === 0, sNalepkou.slice(0, 3).join(', '));
}

/* ==================================================================
   10) ZÁLOŽNÍ CESTA VE SNÍMKU SE SHODUJE S MODULEM
   ==================================================================
   js/snimek.js si modul kategorií nechává PODAT, protože globální
   cestou tam není: generátor si js/kategorie.js bere přes require (do
   module.exports), prohlížeč ho má jako window.PKKategorie.

   ZÁLOŽNÍ CESTA TAM BYLA A TENHLE HLÍDAČ JI SHODIL. Rozhodovala se
   z klíče (`!kat || kat === 'pozemek'`) a na neznámém klíči se
   s modulem rozešla: ten ho přes klic() srovná na výchozí pozemek.
   Dvě pravdy o jedné věci, nesrovnatelné bez tabulky kategorií —
   tak je cesta jedna a chybějící modul hlasitě spadne. Měří se tedy
   dvě věci: že spadne, a že věta se opravdu liší podle kategorie. */
{
  const puv = globalThis.PKKategorie;
  delete globalThis.PKKategorie;
  let spadlo = false;
  try { SNIMEK.popis({ place: 'Obec', area: 100, kat: 'byt' }, null); }
  catch (e) { spadlo = /kategorie\.js/.test(String(e && e.message)); }
  globalThis.PKKategorie = puv;
  pravda('bez modulu kategorií výhrada na snímku hlasitě spadne',
    spadlo, 'neřekla nic, nebo spadla na něčem jiném než na chybějícím modulu');
  /* A ŽE SE OPRAVDU LIŠÍ PODLE KATEGORIE. Kdyby popis() vracel jednu
     větu pro všechno, kontrola výš by byla zelená a k ničemu. */
  const uPozemku = SNIMEK.popis({ place: 'Obec', area: 100 }, K);
  const uBytu = SNIMEK.popis({ place: 'Obec', area: 100, kat: 'byt' }, K);
  pravda('a u pozemku mluví o obrysu, u bytu ne',
    uPozemku.indexOf('obrys pozemku') >= 0 && uBytu.indexOf('obrys pozemku') < 0,
    'pozemek: ' + uPozemku + ' | byt: ' + uBytu);
}


/* ==================================================================
   11) SLOVO PRO POČTY SE OPRAVDU ŘÍDÍ MNOŽINOU
   ==================================================================
   slovaPoctu() je jediná pravda o tom, jakým slovem web počítá — a
   proto se musí měřit PŘÍMO. Sabotáž „ať vrací „pozemků" vždycky"
   neshodila žádnou ze zkoušek na stránkách: ty si slovo odvozovaly
   z téže funkce, takže se s generátorem shodly na té samé lži.

   Opraveno dvakrát. Zkoušky na stránkách si pravidlo vyslovují znovu
   z dat (to je ta nezávislá cesta), a tady se měří funkce sama: co
   dostane, podle toho se musí rozhodnout. */
{
  const samePozemky = [{}, { kat: 'pozemek' }, { kat: 'pozemek' }];
  const sBytem = [{}, { kat: 'pozemek' }, { kat: 'byt' }];
  je('u samých pozemků vyjde 1. pád „pozemek"', K.slovaPoctu(samePozemky)[0], 'pozemek');
  je('a u téže množiny s bytem „nemovitost"', K.slovaPoctu(sBytem)[0], 'nemovitost');
  /* A ŽE JSOU TO OPRAVDU TŘI TVARY. Česky se počítá třemi a vracet
     jeden by vypadalo stejně dobře, dokud se nenapíše „5 pozemky". */
  je('a jsou to tři tvary (1., 2.–4., 5. a dál)', K.slovaPoctu(samePozemky).join('|'),
    'pozemek|pozemky|pozemků');
  je('u nemovitostí taky', K.slovaPoctu(sBytem).join('|'),
    'nemovitost|nemovitosti|nemovitostí');
  /* Prázdná množina je „samé pozemky" — výchozí kategorie je pozemek
     a web o něm takhle mluvil, dokud nic jiného neměl. */
  je('a prázdná množina mluví o pozemcích', K.slovaPoctu([])[0], 'pozemek');
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
