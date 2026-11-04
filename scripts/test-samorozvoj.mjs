/* Test: nálezce, sabotážní stroj a smyčka samorozvoje
   ==================================================================
   Spuštění: node scripts/test-samorozvoj.mjs   (bez sítě)

   CO SE TU MĚŘÍ NEJVÍC. Tenhle stroj PÍŠE DO ZDROJE (sabotáž zapíše
   rozbitý soubor a vrátí ho z gitu), takže se tu nejpřísněji hlídají
   pojistky: do čeho smí a do čeho nesmí sahat, že ověřuje diffem a že
   se nepustí sám v sobě. Vada v tomhle souboru nestojí jednu zkoušku,
   stojí důvěru v celý repozitář.

   FIXTURY JSOU SKUTEČNÉ: čísla i texty jsou z prvního ostrého běhu
   smyčky (4. 11. 2026) a ze dnešních nálezů — zdroj, který stáhl 91
   a zveřejnil 0 (§371), a 19 nabídek s parcelním číslem místo obce.
   ================================================================== */
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import * as N from './nalezce.mjs';
import * as S from './sabotuj.mjs';
import * as R from './samorozvoj.mjs';
import * as M from './minifikace.mjs';

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

/* ---- 1) NÁLEZCE: ZDROJ STÁHL A NEZVEŘEJNIL (§371) ------------- */
{
  /* Přesně ten stav, který dnes nikdo nepoznal: ÚZSVM „ok", 91, nula. */
  const data = {
    sources: [
      { nazev: 'ÚZSVM', stav: 'ok', pocet: 91, nepustilo: 2 },
      { nazev: 'Bezrealitky', stav: 'ok', pocet: 1916, nepustilo: 270 },
    ],
    opportunities: Array.from({ length: 1631 }, () => ({ zdroj: 'Bezrealitky', place: 'Zlín' })),
  };
  const n = N.zdrojeNaWebu(data);
  pravda('zdroj, který stáhl 91 a zveřejnil 0, je nález',
    n.some((x) => /ÚZSVM/.test(x.jmeno) && /nedává na web nic/.test(x.jmeno)),
    JSON.stringify(n.map((x) => x.jmeno)));
  je('a je to nález nejvyšší tíhy', (n.find((x) => /ÚZSVM/.test(x.jmeno)) || {}).tiha, 3);
  pravda('v důkazu stojí obě čísla', /stáhl 91/.test(n[0].dukaz) && /na webu 0/.test(n[0].dukaz), n[0].dukaz);
  pravda('zdroj, u kterého úbytek vysvětlený je, nález není',
    !n.some((x) => /Bezrealitky/.test(x.jmeno)),
    'Bezrealitky: 1 916 − 270 − 15 = 1 631, všechno pojmenované');
}
{
  /* A nevysvětlený úbytek, i když nula to není. */
  const data = {
    sources: [{ nazev: 'Dražby', stav: 'pokles', pocet: 45, nepustilo: 6 }],
    opportunities: Array.from({ length: 20 }, () => ({ zdroj: 'Dražby' })),
  };
  const n = N.zdrojeNaWebu(data);
  pravda('nevysvětlený úbytek 19 ze 45 je nález',
    n.some((x) => /nevysvětlený úbytek/.test(x.jmeno)), JSON.stringify(n));
  pravda('a v důkazu je i to, co se vysvětlit dalo',
    /síto 6/.test((n[0] || {}).dukaz || ''), (n[0] || {}).dukaz);
}
{
  const maly = { sources: [{ nazev: 'Farmy', stav: 'ok', pocet: 9, nepustilo: 0 }],
    opportunities: [{ zdroj: 'Farmy' }] };
  je('u malého zdroje se z poměru nálezy nedělají', N.zdrojeNaWebu(maly).length, 0);
}

/* ---- 2) NÁLEZCE: MÍSTO, KTERÉ MÍSTEM NENÍ --------------------- */
{
  const data = { opportunities: [
    { place: 'p. p. č. 1759/1', zdroj: 'ÚZSVM', okres: 'Tachov' },
    { place: 'EAS/ULT/130/2026', zdroj: 'ÚZSVM', okres: 'Litoměřice' },
    { place: '303/115 a 303/116', zdroj: 'ÚZSVM', okres: 'Rakovník' },
    { place: 'Horní Dunajovice', zdroj: 'Bezrealitky', okres: 'Znojmo' },
    { place: 'Praha 6', zdroj: 'Bezrealitky', okres: 'Praha' },
  ] };
  const n = N.mistaKteraNejsouMisto(data);
  je('tři místa z pěti jsou nález', n.length, 1);
  /* DŮKAZ SE ČTE PŘES PRÁZDNO. Když kontrola výš padne, nesmí se
     zkouška rozsypat na výjimce: pád bez jména se v tomhle repozitáři
     počítá za horší než pojmenovaná chyba, a sabotáž, která zkoušku
     shodí místo aby ji nechala červenou, se špatně čte. */
  const dukaz = String((n[0] || {}).dukaz || '');
  pravda('a v důkazu je počet i zdroj', /3 nabídek/.test(dukaz) && /ÚZSVM 3×/.test(dukaz), dukaz);
  pravda('obec se jménem nálezem není', dukaz !== '' && !/Horní Dunajovice/.test(dukaz), dukaz);
  pravda('a ani „Praha 6" — číslice na konci jména obce je v pořádku',
    dukaz !== '' && !/Praha 6/.test(dukaz), dukaz);
}

/* ---- 3) NÁLEZCE: DVĚ NABÍDKY, JEDEN KLÍČ ---------------------- */
{
  /* Skutečný případ: dvě nabídky Lesů ČR, adresy se liší jen `?id=`. */
  const data = { opportunities: [
    { place: 'Libavské Údolí', parcel: '127/21', okres: 'Sokolov', area: 151, price: 3020,
      url: 'https://portal.gov.cz/nepotrebny-nemovity-majetek/?id=109041' },
    { place: 'Libavské Údolí', parcel: '127/21', okres: 'Sokolov', area: 316, price: 6320,
      url: 'https://portal.gov.cz/nepotrebny-nemovity-majetek/?id=109040' },
  ] };
  const slepy = () => 'stejny-klic';
  const n = N.klicKoliduje(data, slepy);
  je('kolize klíče je nález', n.length, 1);
  pravda('a v důkazu jsou obě nabídky', /151 m² za 3020/.test(n[0].dukaz) && /316 m² za 6320/.test(n[0].dukaz),
    n[0].dukaz);
  je('s klíčem, který rozlišuje, nález není',
    N.klicKoliduje(data, (o) => 'k-' + o.area).length, 0);
  je('bez funkce na klíč se nehádá', N.klicKoliduje(data, null).length, 0);
}

/* ---- 3b) ZKOUŠKY MIMO CI: ČTOU SE VŠECHNY WORKFLOW -------------
   PRVNÍ OSTRÝ BĚH SMYČKY NA TOMHLE UKLOUZL. Nálezce hlásil „3 zkoušky
   nikdo nepouští" a jmenoval test-chat, test-listing a test-search —
   všechny tři přitom pouští `.github/workflows/test-chat.yml`, protože
   potřebují živou Supabase. Falešný nález je drahý jinak než chybějící:
   učí člověka hlášení nečíst. */
{
  const n = N.zkouskyMimoCI();
  je('dnes žádná zkouška mimo CI není', n.length, 0);
  pravda('a jmenovitě ne ty tři, co má vlastní workflow',
    !JSON.stringify(n).includes('test-chat'), JSON.stringify(n));
}

/* ---- 4) NÁLEZCE NIC NEMĚNÍ ------------------------------------ */
{
  const telo = readFileSync(new URL('./nalezce.mjs', import.meta.url), 'utf8');
  pravda('nálezce neumí zapsat do souboru',
    !/writeFileSync|appendFileSync|rmSync|unlinkSync/.test(telo),
    'nález je věta, ne zásah');
  pravda('a nechodí po síti', !/fetch\(|stahni|http/.test(telo.replace(/^\s*\*.*$/gm, '')),
    'měření sítě patří sondě, ne nálezci');
}

/* ---- 5) SABOTÁŽNÍ STROJ: DO ČEHO SMÍ A DO ČEHO NE ------------- */
{
  pravda('smí do scripts/*.mjs', S.smiSabotovat('scripts/cti-uzsvm.mjs'));
  pravda('smí do js/*.js', S.smiSabotovat('js/klic.js'));
  pravda('NESMÍ do dat', !S.smiSabotovat('data/opportunities.json'));
  pravda('NESMÍ do generovaných stránek', !S.smiSabotovat('pozemek-zlin-1.html'));
  pravda('NESMÍ do minifikovaných kopií', !S.smiSabotovat('js/min/klic.js'));
  pravda('NESMÍ do workflow', !S.smiSabotovat('.github/workflows/testy.yml'));
  pravda('a NESMÍ ven z repozitáře', !S.smiSabotovat('../../etc/passwd'));
  pravda('ani do podstromu s dvěma tečkami', !S.smiSabotovat('scripts/../js/klic.js'));
}

/* ---- 6) CO TA ZKOUŠKA HLÍDÁ ----------------------------------- */
{
  const vzor = "import * as U from './cti-uzsvm.mjs';\n"
    + "import { pricinaChyb } from './chyby-hlaska.mjs';\n"
    + "import * as T from './test-neco.mjs';\n"
    + "const cen = readFileSync(new URL('../js/ceny.js', import.meta.url), 'utf8');\n";
  const h = S.coHlidá(vzor);
  pravda('najde hlídaný modul', h.includes('scripts/cti-uzsvm.mjs'), JSON.stringify(h));
  pravda('i prohlížečový soubor', h.includes('js/ceny.js'), JSON.stringify(h));
  pravda('pomůcku na hlášky nebere', !h.includes('scripts/chyby-hlaska.mjs'), JSON.stringify(h));
  pravda('a jinou zkoušku taky ne', !h.some((x) => /test-/.test(x)), JSON.stringify(h));
  je('a když zkouška neimportuje nic našeho, nehádá se', S.coHlidá('const a = 1;'), []);
}

/* ---- 7) KATALOG SABOTÁŽÍ -------------------------------------- */
{
  /* Pojistka ve vzoru musí být dost dlouhá na to, aby ji vzor chytil:
     katalog hledá `if (…) continue;` s aspoň třemi znaky v podmínce,
     protože `if (a) continue;` bývá ve smyčce bez významu pro hlídače. */
  const telo = 'const A = 5;\nif (!host) continue;\nconst b = a >= 3 && c === d;\nx.map(f).filter(Boolean);\n';
  const k = S.kandidatiSabotazi(telo);
  const jmena = k.map((x) => x.jmeno);
  pravda('obrácené porovnání je kandidát', jmena.some((x) => />= na >/.test(x)), JSON.stringify(jmena));
  pravda('zahozená pojistka taky', jmena.some((x) => /if … continue/.test(x)));
  pravda('zahozený filter(Boolean) taky', jmena.some((x) => /filter\(Boolean\)/.test(x)));
  pravda('posunutá konstanta taky', jmena.some((x) => /konstanta/.test(x)));
  /* A ŽE SE KONSTANTA OPRAVDU POSUNE O JEDNIČKU — jinak by sabotáž
     zapsala `null` a nerozbila nic. */
  const kon = k.find((x) => /konstanta/.test(x.jmeno));
  je('konstanta se posune o jedničku', kon.nahrad, '= 6;');
  je('v kódu bez těch tvarů není co rozbít', S.kandidatiSabotazi('const x = [];').length, 0);
}

/* ---- 8) SMYČKA: STŘÍDÁNÍ A ÚČET ------------------------------- */
{
  const zk = ['test-a.mjs', 'test-b.mjs', 'test-c.mjs'];
  const ucet = { zkousky: { 'test-b.mjs': { kdy: '2026-11-04', chytila: 2, nechytila: 0 },
    'test-c.mjs': { kdy: '2026-11-01', chytila: 0, nechytila: 1, slepa: ['m1'] } } };
  je('na řadě je ten, který nebyl nikdy, pak nejstarší',
    R.naRade(zk, ucet, 3), ['test-a.mjs', 'test-c.mjs', 'test-b.mjs']);
  je('a kolo se dá zmenšit', R.naRade(zk, ucet, 1), ['test-a.mjs']);
  const stav = R.stavUctu(zk, ucet);
  je('účet: jeden prokázaný', stav.prokazanych, 1);
  je('jeden se slepým místem', stav.sSlepymMistem, 1);
  je('jeden neprokázaný', stav.nedotcenych, 1);
  const h = R.hlaseniUctu(stav, 4).join(' ');
  pravda('hlášení říká podíl i počty', /1 z 3/.test(h) && /33 %/.test(h) && /Nálezů v tomhle běhu: 4/.test(h), h);
}

/* ---- 9) CO SE OHLÁSÍ NAHLAS ---------------------------------- */
{
  const nalezy = [{ jmeno: 'vážný', tiha: 3, dukaz: 'x' }, { jmeno: 'drobný', tiha: 1, dukaz: 'y' }];
  /* Od §397 se nahlas křičí jen o nechycené sabotáži v souboru, který
     nehlídá nikdo jiný — proto fixtura nese i sabotáže, ne jen číslo. */
  /* Jména neexistujících modulů se skládají ze dvou kusů: hlídač
     odkazů (test-staticka) by je jinak hlásil jako odkaz na soubor,
     který v repozitáři není — a tahle fixtura ho mít nesmí. */
  const prokazy = [
    { zkouska: 'test-a.mjs', nechytila: 2, sabotaze: [
      { cil: 'scripts/' + 'jen-moje.mjs', jmeno: 'm1', stav: 'NECHYTILA', hlidajiJeste: [] },
      { cil: 'js/main.js', jmeno: 'm2', stav: 'NECHYTILA', hlidajiJeste: ['test-x.mjs'] }] },
    { zkouska: 'test-b.mjs', nechytila: 0, sabotaze: [] }];
  const k = R.kOhlaseni(nalezy, prokazy);
  je('nahlas jde vážný nález', k.vazne.map((x) => x.jmeno), ['vážný']);
  je('a hlídač se slepým místem', k.slepa.map((x) => x.zkouska), ['test-a.mjs']);
  pravda('„ještě neprokázáno" se nahlas nehlásí — to není vada, to je práce',
    !k.vazne.some((x) => /neprokázal/.test(x.jmeno)));
}

/* ---- 10) POJISTKY V KÓDU ------------------------------------- */
{
  const sab = readFileSync(new URL('./sabotuj.mjs', import.meta.url), 'utf8');
  const smy = readFileSync(new URL('./samorozvoj.mjs', import.meta.url), 'utf8');
  pravda('sabotáž se ověřuje DIFFEM, než se něco tvrdí',
    /zmenilSe\(cil\)/.test(sab) && /stav = 'prázdná'/.test(sab),
    'bez toho sabotáž nedokazuje nic (§369)');
  pravda('soubor se vrací z GITU, ne z paměti',
    /git\(\['show', 'HEAD:' \+ cesta\]\)/.test(sab));
  pravda('a ověří se, že je zpátky bitově shodný',
    /=== puvodni/.test(sab) && /nevrátil do původní podoby/.test(sab));
  pravda('nad rozdělaným souborem se nesabotuje',
    /cistySoubor\(cil\)/.test(sab) && /rozdělanou změnu/.test(sab));
  pravda('zkouška má časový limit a co nedoběhne, je „nerozhodnuto"',
    /timeout: casLimit/.test(sab) && /nerozhodnuto/.test(sab));
  pravda('syntaktický pád se nepočítá jako chycená sabotáž',
    /nepoužitelná/.test(sab));
  pravda('a stroj se nepustí sám v sobě',
    /process\.env\[UVNITR\] === '1'/.test(sab) && /process\.env\[UVNITR\] === '1'/.test(smy),
    'jinak by se pustil ve zkoušce, kterou sám pouští');
  pravda('smyčka web ani kód nemění',
    !/writeFileSync\(join\(KOREN, '(js|scripts)'/.test(smy)
      && /writeFileSync\(UCET/.test(smy),
    'zapisuje se jen účet');
  pravda('bez --zapis se nezapisuje ani účet',
    smy.indexOf("includes('--zapis')") < smy.indexOf('writeFileSync(UCET'));
  pravda('po chybě se smyčka zastaví, nehromadí nejistotu',
    /if \(v\.chyba[^\n]*\) break;/.test(smy));
  pravda('a zkoušky, které potřebují živou síť, se nestřídají',
    /MIMO_STRIDANI/.test(smy) && R.MIMO_STRIDANI.test('test-chat.mjs'),
    'u nich by sabotáž měřila síť, ne hlídače');
}

/* ---- 6) ROVNOCENNÁ MUTACE: SABOTÁŽ, KTERÁ NEMŮŽE NIC ZMĚNIT ----
 *
 * Mechanická mutace umí být bez následku. Naměřený případ
 * (scripts/archiv.mjs): v `first_seen <= den ? first_seen : den` dá
 * obrácení na ostrou nerovnost pro first_seen rovné dnešku tentýž
 * den — obě varianty vracejí `den`. Takovou mutaci nechytí ŽÁDNÁ
 * zkouška a hlásit ji jako slepé místo je falešný nález, tedy to
 * nejdražší, co hlášení umí: učí člověka hlášení nečíst (§375).
 *
 * Prohlášení o tom proto stojí U KÓDU a stroj ho uzná jen se
 * jmenovitě uvedenou sabotáží a s DŮVODEM. Kontroly níž hlídají
 * přesně ty tři pojistky — bez nich by z toho byl vypínač hlášení.
 */
{
  const telo = readFileSync(new URL('./archiv.mjs', import.meta.url), 'utf8');
  const r = S.rovnocenna(telo, 'obrácené porovnání (<= na <)');
  pravda('prohlášení o rovnocenné mutaci se u kódu najde', !!r && !r.kratky,
    JSON.stringify(r));
  pravda('a nese důvod, ne jen značku', !!r && r.duvod.length >= S.MIN_DUVOD,
    'důvod: ' + ((r && r.duvod) || '—'));
  je('na jinou sabotáž se to prohlášení NEvztahuje',
    S.rovnocenna(telo, 'zahozený filter(Boolean)'), null);
  je('a na soubor bez prohlášení taky ne',
    S.rovnocenna('nic tu není', 'obrácené porovnání (<= na <)'), null);
  /* POJISTKA PROTI VYPÍNAČI: značka bez důvodu se NEUZNÁVÁ. Kdyby
     stačila samotná značka, byl by z toho jednořádkový způsob, jak
     vypnout kteroukoli sabotáž — a stroj by přestal být k čemu. */
  const kratke = '/* ' + S.ZNACKA_ROVNOCENNE + ' obrácená rovnost (=== na !==) — proto. */';
  const rk = S.rovnocenna(kratke, 'obrácená rovnost (=== na !==)');
  pravda('značka bez důvodu se neuzná (je to jinak vypínač hlášení)',
    !!rk && rk.kratky === true && rk.duvod === '', JSON.stringify(rk));
  je('a mez na důvod je ' + S.MIN_DUVOD + ' znaků', S.MIN_DUVOD, 60);
  /* A ŽE SE PODLE TOHO STROJ OPRAVDU ŘÍDÍ — čte se kód, protože
     prokazZkousku píše do zdroje a zkouška ho pouštět nebude. */
  const kod = readFileSync(new URL('./sabotuj.mjs', import.meta.url), 'utf8');
  pravda('stroj to rozhoduje z PŮVODNÍHO těla, ne ze sabotovaného',
    /rovnocenna\(puvodni, k\.jmeno\)/.test(kod),
    'ze sabotovaného těla by se značka dala vyrobit sabotáží');
  pravda('a krátký důvod u něj zůstane „NECHYTILA"',
    /rov\.kratky\) \{\s*\n\s*stav = 'NECHYTILA';/.test(kod), 'jinak je to vypínač');
  pravda('rovnocenné se v hlášení vypisují, nezmizí',
    /rovnocenn[áé]/.test(kod) && /\$\{v\.rovnocenne\}/.test(kod));
  /* A ÚČET JE POČÍTÁ ZVLÁŠŤ. Ani mezi chycené (zkouška se neozvala),
     ani mezi slepá místa (není co chytit). */
  const smy2 = readFileSync(new URL('./samorozvoj.mjs', import.meta.url), 'utf8');
  pravda('účet si rovnocenné mutace vede jmenovitě a zvlášť',
    /rovnocenne: \(v\.sabotaze \|\| \[\]\)/.test(smy2));
}

/* ---- 6e) NESABOTOVANÁ ZKOUŠKA MUSÍ PROJÍT PRVNÍ ----
 *
 * Nejhorší vada, jakou stroj měl, a našel se 4. 11. na vlastní kůži:
 * když zkouška padá UŽ BEZ MUTACE, skončí každý sabotovaný běh taky
 * nenulově — a stroj odškrtne všechny mutace jako „chycené". Naměřeno
 * doslova: `test-hlidani` padala na jedné kontrole s nezlomitelnou
 * mezerou a stroj vydal „6 z 6 chyceno", ačkoli jedna z těch šesti
 * (mez množného čísla 2–4) chycená nebyla. Falešný důkaz je horší než
 * žádný: hlídač se podle něj odškrtne jako prokázaný a nikdo se k němu
 * nevrátí.
 */
{
  const kodB = readFileSync(new URL('./sabotuj.mjs', import.meta.url), 'utf8');
  pravda('stroj pustí zkoušku nejdřív BEZ sabotáže',
    /zkouška padá UŽ BEZ SABOTÁŽE/.test(kodB),
    'bez téhle pojistky stroj odškrtne jako chycené i mutace, které nikdo nechytil');
  /* A ta pojistka musí stát PŘED první sabotáží, jinak nemá cenu. */
  pravda('a stojí to před prvním zápisem do zdroje',
    kodB.indexOf('zkouška padá UŽ BEZ SABOTÁŽE') < kodB.indexOf('/* 1) zapsat */'),
    'pojistka je v kódu až za sabotáží — to už je pozdě');
  pravda('a nedoběhnutí se nevydává za pád',
    /nedoběhla do \$\{Math\.round\(casLimit/.test(kodB),
    'timeout bez sabotáže se musí poznat od chyby zkoušky');
}

/* ---- 6c) HLÍDAČ, KE KTERÉMU STROJ NEDOSÁHNE ----
 *
 * Když zkouška v prohlížeči hlídá jen `js/…`, mechanická sabotáž se
 * k ní nikdy nedostane (servíruje se `js/min/…`). Nálezce ji proto
 * jmenuje ZVLÁŠŤ — jinak by ji smyčka brala dokola jako „ještě nic
 * neprokázal" a nikdy by neuspěla. Jejich důkaz patří člověku.
 */
{
  const soupis = { zkousky: {
    'test-a.mjs': { kdy: '2026-11-04', chytila: 0, nechytila: 0, nedorucene: ['obrácené porovnání (>= na >)'] },
    'test-b.mjs': { kdy: '2026-11-04', chytila: 3, nechytila: 0, nedorucene: [] },
    'test-c.mjs': { kdy: '2026-11-04', chytila: 0, nechytila: 0, nedorucene: [] },
  } };
  const n = N.hlidaciBezDukazu(soupis, ['test-a.mjs', 'test-b.mjs', 'test-c.mjs']);
  const vse = n.map((x) => x.jmeno).join(' | ');
  pravda('nálezce pořád hlásí, co ještě nic neprokázalo',
    n.some((x) => /ještě nic neprokázal/.test(x.jmeno)), vse);
  const nedo = n.find((x) => /nedosáhne/.test(x.jmeno));
  pravda('a zvlášť ty, ke kterým stroj nedosáhne', !!nedo, vse);
  pravda('a jmenuje je', !!nedo && /test-a\.mjs/.test(nedo.dukaz || ''), nedo && nedo.dukaz);
  pravda('prokázaný hlídač se do ani jednoho seznamu nedostane',
    !n.some((x) => /test-b\.mjs/.test(x.dukaz || '')), JSON.stringify(n.map((x) => x.dukaz)));
  pravda('a kde není co hlásit, nálezce mlčí',
    N.hlidaciBezDukazu({ zkousky: { 'test-b.mjs': { kdy: 'x', chytila: 1 } } }, ['test-b.mjs']).length === 0,
    'hlásí i tam, kde je všechno prokázané');
}

/* ---- 6d) DYNAMICKÝ IMPORT A RUČNÍ DŮKAZ DO ÚČTU ----
 *
 * Dvě mezery naměřené 4. 11. při ručním prokazování:
 *
 * (1) `test-vypadek-zdroje` si bere `fetch-opportunities.mjs` přes
 *     `await import('./…')`, protože ten modul je velký a načítá se až
 *     v těle zkoušky. Stroj v něm „neviděl nic z našeho kódu" a hlásil
 *     „nemá co rozbít" — u zkoušky s 89 kontrolami nad nočním robotem.
 *     Ticho z nedohledu vypadá stejně jako ticho z toho, že není co
 *     rozbít, a to je nejhorší druh ticha.
 *
 * (2) Účet samorozvoje znal jen to, co prokázala smyčka sama. Ručně
 *     prokázané hlídače (dnes test-ceny 6 z 6 a test-zkus-portal 9 z 9)
 *     v něm nebyly, takže by si je smyčka vzala na řadu znovu a účet
 *     dál tvrdil „1 z 307".
 */
{
  je('dynamický import se počítá jako hlídaný kód',
    S.coHlidá("const F = await import('./fetch-opportunities.mjs');"),
    ['scripts/fetch-opportunities.mjs']);
  je('a dvojité uvozovky taky', S.coHlidá('await import("./nalezce.mjs")'),
    ['scripts/nalezce.mjs']);
  je('a obyčejný import nepřestal fungovat',
    S.coHlidá("import { a } from './archiv.mjs';"), ['scripts/archiv.mjs']);
  je('a pomůcky se pořád vynechávají',
    S.coHlidá("import { x } from './chyby-hlaska.mjs';"), []);

  const kodZ = readFileSync(new URL('./sabotuj.mjs', import.meta.url), 'utf8');
  pravda('ruční důkaz umí stroj zapsat do téhož účtu',
    /UCET = join\(KOREN, 'data', 'samorozvoj\.json'\)/.test(kodZ)
    && /ucet\.zkousky\[zkouska\] = \{/.test(kodZ),
    'stroj nezapisuje do účtu, takže ručně prokázaný hlídač se tam nedostane');
  pravda('ale JEN s --zapis, ať se pokusy nezapisují',
    /zapsat && !vypis && !v\.chyba/.test(kodZ),
    'bez téhle podmínky by stroj psal do dat při každém spuštění');
  pravda('a je u toho poznáno, že to byl člověk',
    /rucne: true/.test(kodZ), 'v účtu nepoznáte ruční důkaz od smyčkového');
}

/* ---- 6b) SABOTÁŽ, KTERÁ SE K PRODUKTU VŮBEC NEDOSTALA ----
 *
 * Nález ze 4. 11.: stroj zapíše mutaci do `js/pozemek.js`, ale stránky
 * servírují `js/min/pozemek.js`, a ten se po sabotáži nepřestaví
 * (minifikuje `oprav.mjs`, kterou stroj spouštět nesmí — přepsala by
 * `?v=` otisky na třech tisících stránek). Zkouška v prohlížeči tedy
 * mutaci NEMOHLA vidět, a stroj to přesto hlásil jako „NECHYTILA".
 * Křivdil tím hlídači a smyčka by ho poslala opravovat něco, co je
 * v pořádku. Změřeno na vlastní kůži: týž den nedělala oprava
 * v `js/pozemek.js` v prohlížeči nic, dokud neproběhla `oprav.mjs`.
 *
 * Hlídá se obojí: že to stroj pozná, a že se z toho nestane výmluva —
 * přeznačuje se JEN „NECHYTILA" u zkoušky v prohlížeči, a jen u
 * souboru, který má minifikovaný dvojník. Chycená sabotáž zůstane
 * chycená (několik zkoušek si zdroj čte z disku schválně).
 */
{
  pravda('minifikovaný dvojník se u js/pozemek.js najde',
    S.minifikovanaKopie('js/pozemek.js') === 'js/min/pozemek.js',
    S.minifikovanaKopie('js/pozemek.js') || 'nic');
  je('u skriptu sestavení žádný dvojník není', S.minifikovanaKopie('scripts/archiv.mjs'), '');
  je('a vymyšlený soubor dvojníka taky nemá', S.minifikovanaKopie('js/tenhle-neexistuje.js'), '');
  /* VZOREK SE SCHVÁLNĚ NEPÍŠE JAKO HOTOVÝ IMPORT. Tahle zkouška
     prohlížeč nepotřebuje — a `test-staticka` právem hlídá, že zkouška
     s importem playwrightu patří do prohlížečové směny, jinak by
     v rychlé úloze padla na chybějícím chromiu. Když jsem vzorek napsal
     celý, hlídač ji okamžitě chtěl přestěhovat (a měl pravdu podle toho,
     co viděl). Jméno se proto do vzorku skládá ze dvou kusů: hlídač
     nedostane falešný signál a tahle kontrola se přitom nedá vypnout. */
  pravda('zkouška v prohlížeči se pozná podle playwrightu',
    S.jeProhlizecova("import { chromium } from 'play" + "wright-core';") === true);
  pravda('a zkouška bez prohlížeče se za ni nevydává',
    S.jeProhlizecova("import { readFileSync } from 'node:fs';") === false);

  const kodS = readFileSync(new URL('./sabotuj.mjs', import.meta.url), 'utf8');
  pravda('přeznačuje se jen „NECHYTILA", a jen u zkoušky v prohlížeči',
    /stav === 'NECHYTILA' && prohlizecova/.test(kodS),
    'jinak by se tím dala zakrýt i chycená nebo rovnocenná sabotáž');
  /* A jen u souboru, který má minifikovaný dvojník — a od §396 už jen
     tehdy, když se tomu dvojníkovi mutaci NEPODAŘILO doručit. Bez obou
     podmínek by z „nedoručené" byl vypínač na všechny sabotáže
     v prohlížeči. */
  pravda('a jen u souboru, který má minifikovaný dvojník, kam se mutace nedostala',
    /minifikovanaKopie\(cil\)/.test(kodS) && /min && !doruceno/.test(kodS),
    'bez téhle podmínky by to byl vypínač na všechny sabotáže v prohlížeči');
  pravda('důvod se v hlášení vypíše, nezmizí',
    /s\.stav === 'nedoručená'/.test(kodS) && /nedoručená';/.test(kodS)
    && /\$\{v\.nedorucene\}/.test(kodS));

  const smy3 = readFileSync(new URL('./samorozvoj.mjs', import.meta.url), 'utf8');
  pravda('účet si nedoručené vede jmenovitě a zvlášť',
    /nedorucene: \(v\.sabotaze \|\| \[\]\)/.test(smy3));
  /* A TO NEJDŮLEŽITĚJŠÍ: nedoručená NENÍ prokázaný hlídač. */
  const u = { zkousky: {
    'test-a.mjs': { kdy: '2026-11-04', chytila: 0, nechytila: 0, nedorucene: ['obrácené porovnání (>= na >)'] },
    'test-b.mjs': { kdy: '2026-11-04', chytila: 2, nechytila: 0, nedorucene: [] },
    'test-c.mjs': { kdy: '2026-11-04', chytila: 0, nechytila: 1, slepa: ['m1'], nedorucene: [] },
  } };
  const st = R.stavUctu(['test-a.mjs', 'test-b.mjs', 'test-c.mjs', 'test-d.mjs'], u);
  je('nedoručená se nepočítá mezi prokázané', st.prokazanych, 1);
  je('ani mezi slepá místa', st.sSlepymMistem, 1);
  je('má vlastní sloupec', st.nedorucenych, 1);
  je('a „ještě se ho stroj nedotkl" zůstane jen tomu, koho opravdu neměl v ruce',
    st.nedotcenych, 1);
  pravda('a účet to vypíše vlastní větou',
    R.hlaseniUctu(st, 0).join(' ').includes('k prohlížeči nedostala'),
    R.hlaseniUctu(st, 0).join(' '));
}

/* ---- 7) NA ČEM SE ZKOUŠKA SOUDÍ NEJDŘÍV ----
 *
 * `coHlidá` vrací všechny moduly, které si zkouška importuje. Pro
 * hledání je to správné, pro SOUD ne: `test-uzsvm` si z
 * `cti-nabidky-statu.mjs` půjčuje dvě funkce, a slepé místo v tom
 * cizím modulu se připisovalo jí — přitom ten modul má vlastní
 * zkoušku, která ho hlídá. Je to falešný nález z třetí strany:
 * neříká nepravdu o kódu, ale o tom, KDO má co opravit (§375).
 */
{
  je('modul podle jména zkoušky jde první',
    S.poradiCilu('test-uzsvm.mjs', ['scripts/cti-nabidky-statu.mjs', 'scripts/cti-uzsvm.mjs']),
    ['scripts/cti-uzsvm.mjs', 'scripts/cti-nabidky-statu.mjs']);
  je('a shoda jméno na jméno je ještě silnější',
    S.poradiCilu('test-archiv.mjs', ['scripts/generate-parcel-pages.mjs', 'scripts/archiv.mjs']),
    ['scripts/archiv.mjs', 'scripts/generate-parcel-pages.mjs']);
  /* PŮJČENÝ MODUL SE NESMÍ ZTRATIT — jen jde dozadu. Kdyby se
     vyhazoval, přestalo by se hlídat cokoli, co zkouška hlídá navíc,
     a ze zpřesnění soudu by byla díra v měření. */
  je('půjčený modul ze seznamu nezmizí',
    S.poradiCilu('test-uzsvm.mjs', ['scripts/cti-nabidky-statu.mjs']).length, 1);
  je('a bez cílů se nic nerozsype', S.poradiCilu('test-uzsvm.mjs', []), []);
  je('ani bez jména zkoušky', S.poradiCilu('', ['js/main.js']), ['js/main.js']);
  /* A ŽE SE PODLE TOHO STROJ OPRAVDU ŘÍDÍ. */
  const kod = readFileSync(new URL('./sabotuj.mjs', import.meta.url), 'utf8');
  pravda('stroj si cíle opravdu přerovná, ne jen umí',
    /poradiCilu\(zkouska, coHlid/.test(kod), 'poradiCilu se v prokazZkousku nevolá');
}

/* ---- 11) PROHLÍŽEČ, KTERÝ STROJ MÁ, A ZKOUŠKA, KTEROU NEUMÍ PUSTIT
 * ==================================================================
 * Naměřeno 4. 11.: smyčka vydala o test-barva-listy verdikt „zkouška
 * padá UŽ BEZ SABOTÁŽE — nejdřív ji opravit". Ta zkouška je přitom
 * v pořádku a v CI zelená; spadla na tom, že si playwright-core hledal
 * chromium_headless_shell-1148, zatímco stroj má chromium-1194. Byly
 * to dvě vady v jedné: falešné obvinění hlídače (§384) a zaseknutá
 * smyčka, protože na chybě se celé kolo zastaví a tahle zkouška je
 * v abecedě třetí — dál by se stroj nedostal už nikdy.
 */
{
  /* NEJDŘÍV HLEDÁNÍ PROHLÍŽEČE. Čte se vždy přes vstříknuté čtení,
     aby zkouška měřila pravidlo, ne tenhle stroj. */
  const je = (c) => /^\/opt\/pw-browsers\/chromium-(1194|980)\/chrome-linux\/chrome$/.test(c);
  const slozka = '/opt/pw-browsers';
  /* VÝPIS SLOŽKY SE TAKY PODSTRKUJE. Naměřeno v CI 4. 11.: bez toho
     tyhle kontroly čtou SKUTEČNOU /opt/pw-browsers — na stroji, kde
     se vyvíjí, tam Chromium je, v rychlé úloze CI není, a zkouška
     spadla na tom, že měřila stroj, ne pravidlo. */
  const vypis = () => ['chromium_headless_shell-1148', 'chromium-980', 'chromium-1194', 'ffmpeg-1011'];
  const puvodni = process.env.PW_CHROMIUM;
  delete process.env.PW_CHROMIUM;
  je('nenajde-li se nic, nevrací se nic',
    S.prohlizecNaStroji({ je: () => false, slozka: '/nic/takoveho', vypis: () => { throw new Error('není'); } }), '');
  /* A TOHLE JE TA VADA: nejvyšší verze, ne první v abecedě. Kdyby se
     bralo, co přijde, vrátí stroj chromium-980 (v abecedě dřív) a
     spuštění skončí stejnou hláškou jako bez hledání. */
  pravda('bere se nejvyšší nalezená verze Chromia',
    S.prohlizecNaStroji({ je, slozka, vypis }) === slozka + '/chromium-1194/chrome-linux/chrome',
    'vyšlo ' + S.prohlizecNaStroji({ je, slozka, vypis }));
  /* PW_CHROMIUM z prostředí má přednost — tím se v CI předává cesta,
     kterou si stroj sám nenajde. Ale jen když ta cesta existuje: mrtvá
     hodnota v prostředí nesmí zastínit prohlížeč, který na stroji je. */
  process.env.PW_CHROMIUM = '/jina/cesta/chrome';
  je('nastavené PW_CHROMIUM má přednost',
    S.prohlizecNaStroji({ je: (c) => c === '/jina/cesta/chrome', slozka, vypis }), '/jina/cesta/chrome');
  je('mrtvé PW_CHROMIUM se přeskočí a hledá se dál',
    S.prohlizecNaStroji({ je, slozka, vypis }), slozka + '/chromium-1194/chrome-linux/chrome');
  if (puvodni === undefined) delete process.env.PW_CHROMIUM;
  else process.env.PW_CHROMIUM = puvodni;

  /* HLÁŠKA, PODLE KTERÉ SE TO POZNÁ — doslova ta naměřená. */
  pravda('naměřená hláška o chybějícím prohlížeči se pozná',
    S.BEZ_PROHLIZECE.test("browserType.launch: Executable doesn't exist at"
      + ' /opt/pw-browsers/chromium_headless_shell-1148/chrome-linux/headless_shell'));
  pravda('ale obyčejný pád kontroly se za ni nevydává',
    !S.BEZ_PROHLIZECE.test('::error::Barva lišty: 3 kontroly neprošly.'),
    'to by stroj zametl pravé pády pod „stroj nemá prohlížeč"');

  /* PROSTŘEDÍ PODPROCESU: značka proti rekurzi zůstává za všech
     okolností — bez ní by se stroj pustil ve zkoušce, kterou sám
     pouští, a sabotoval repozitář pod rukama běžící sabotáže. */
  const e = S.prostrediZkousky({ CO: 'zustane' });
  je('značka proti rekurzi se vždy přidá', e[S.UVNITR], '1');
  je('a ostatní prostředí zůstane', e.CO, 'zustane');

  /* ÚČET: zkouška, kterou stroj neumí pustit, má vlastní sloupec a
     NEPOČÍTÁ se ani jako prokázaná, ani jako slepá, ani jako
     nedotčená. Kdyby padla do „nedotčených", účet by tvrdil, že se
     k ní smyčka ještě dostane — a to je nepravda. */
  const ucet = { zkousky: {
    'test-a.mjs': { kdy: '2026-11-04', chytila: 2, nechytila: 0 },
    'test-b.mjs': { kdy: '2026-11-04', chytila: 0, nechytila: 0, nelzeTady: true },
    'test-c.mjs': { kdy: '2026-11-04', chytila: 0, nechytila: 1, slepa: ['m1'] },
  } };
  const st = R.stavUctu(['test-a.mjs', 'test-b.mjs', 'test-c.mjs', 'test-d.mjs'], ucet);
  je('nespustitelná zkouška má v účtu vlastní sloupec', st.nelzeTady, 1);
  je('a nespadne do prokázaných', st.prokazanych, 1);
  je('ani do slepých míst', st.sSlepymMistem, 1);
  je('ani do nedotčených — tam patří jen ta, na kterou smyčka nedošla',
    st.nedotcenych, 1);
  pravda('a hlášení účtu o ní řekne nahlas, že ji prokáže jen CI',
    R.hlaseniUctu(st, 0).join(' ').includes('neumí ani spustit'));

  /* NÁLEZCE: odlišuje „ještě neprokázáno" od „tady to nejde". */
  /* Nálezce si jinak seznam zkoušek bere z disku, takže se mu tady
     podstrčí — fixtura má měřit pravidlo, ne obsah složky scripts. */
  const nal = N.hlidaciBezDukazu(ucet, ['test-a.mjs', 'test-b.mjs', 'test-c.mjs', 'test-d.mjs']);
  pravda('nálezce hlásí hlídače, kterého stroj neumí spustit',
    nal.some((n) => /neumí spustit/.test(n.jmeno)),
    'nálezy: ' + nal.map((n) => n.jmeno).join(' | '));

  /* A ŽE SE PODLE TOHO SMYČKA OPRAVDU ŘÍDÍ: na „nelze tady" se kolo
     NESMÍ zastavit. Tohle je ta zaseknutá smyčka. */
  const kodS = readFileSync(new URL('./samorozvoj.mjs', import.meta.url), 'utf8');
  pravda('smyčka se na chybějícím prohlížeči nezastaví',
    /if \(v\.chyba && !v\.nelzeTady\) break;/.test(kodS),
    'v samorozvoj.mjs se po „nelze tady" pořád láme celé kolo');
  const kodB = readFileSync(new URL('./sabotuj.mjs', import.meta.url), 'utf8');
  pravda('a stroj cestu k prohlížeči podprocesu opravdu předává',
    (kodB.match(/env: prostrediZkousky\(\)/g) || []).length === 2,
    'oba běhy (základní i sabotovaný) musí dostat totéž prostředí');
}

/* ---- 12) POMŮCKA ZKOUŠEK NENÍ PRODUKT ---------------------------
 * ==================================================================
 * Naměřeno 4. 11. na test-barvy: stroj obrátil `&&` na `||`
 * v scripts/adresa-pozemku.mjs (pomůcka, která zkoušce vybere pozemek
 * k měření), zkouška mlčela a stroj to zapsal jako SLEPÉ MÍSTO.
 * Rozbít zkoušce vlastní vybavení ale o hlídačích neříká nic — a tu
 * pomůcku si bere skoro každá zkouška v prohlížeči, takže by takových
 * falešných obvinění bylo postupně sto.
 *
 * Fixtury jsou podstrčené schválně: měří se PRAVIDLO, ne dnešní obsah
 * složky scripts. Vedle toho je ale i jedna kontrola na skutečnosti,
 * aby pravidlo neuteklo od repozitáře.
 */
{
  const spoustene = new Set(['archiv.mjs']);
  const mapa = {
    'test-barvy.mjs': "import { adresaPozemku } from './adresa-pozemku.mjs';",
    'test-mapa.mjs': "import { adresaPozemku } from './adresa-pozemku.mjs';",
    'adresa-pozemku.mjs': 'export function adresaPozemku() {}',
    'archiv.mjs': '#!/usr/bin/env node\nexport function krok() {}',
    'oprav.mjs': "import { krok } from './archiv.mjs';\n// a taky scripts/generate-rss.mjs",
    'generate-rss.mjs': 'export function rss() {}',
    'prvni-videno.mjs': '#!/usr/bin/env node\nexport function spocitej() {}',
    'sabotuj.mjs': '/* naměřeno na scripts/adresa-pozemku.mjs a rozbal-hledani.mjs */',
  };
  pravda('modul, který si berou jen zkoušky, je pomůcka',
    S.pomuckaZkousek('scripts/adresa-pozemku.mjs', mapa, spoustene));
  pravda('modul, který pouští postup v .github, pomůcka není',
    !S.pomuckaZkousek('scripts/archiv.mjs', mapa, spoustene),
    'archiv.mjs pouští update-data.yml — kdyby vyšel jako pomůcka, stroj by'
    + ' přestal hlídat kus nočního robota');
  /* A TOHLE JE TA DRUHÁ PAST: ostrý řetěz si moduly nebere importem,
     ale pouští je jako podproces. Podle importů by generate-rss.mjs
     vyšel jako pomůcka — proto se hledá jakákoli zmínka jména. */
  pravda('zmínka v ostrém skriptu stačí, i když to není import',
    !S.pomuckaZkousek('scripts/generate-rss.mjs', mapa, spoustene),
    'ostrý řetěz pouští generátory podprocesem, ne importem');
  pravda('vstupní bod se shebangem pomůcka není',
    !S.pomuckaZkousek('scripts/prvni-videno.mjs', mapa, spoustene),
    'spouští se rukou, a že si ho nikdo neimportuje, z něj pomůcku nedělá');
  /* A TOHLE JSEM NAMĚŘIL NA SOBĚ: jakmile jsem o adresa-pozemku.mjs
     napsal v sabotuj.mjs komentář, modul přestal být pomůckou. Stroj,
     který svým vlastním popisem mění to, co měří, neměří nic. */
  pravda('stroj si vlastní prózou nepřepíše měření',
    S.pomuckaZkousek('scripts/adresa-pozemku.mjs', mapa, spoustene),
    'zmínka v sabotuj.mjs/samorozvoj.mjs/nalezce.mjs se nesmí počítat za užití');
  je('a ty tři soubory jsou vyjmenované na jednom místě',
    [...S.STROJ].sort(), ['nalezce.mjs', 'sabotuj.mjs', 'samorozvoj.mjs']);
  /* SOUBORY Z js/ NEJSOU POMŮCKY NIKDY — ty nese web. */
  pravda('js/ není pomůcka ani kdyby si ho bral jen test',
    !S.pomuckaZkousek('js/main.js', { 'test-a.mjs': 'js/main.js' }, new Set()));
  pravda('a zkouška sama taky ne', !S.pomuckaZkousek('scripts/test-barvy.mjs', mapa, spoustene));
  pravda('modul, kterého si nevšiml nikdo, pomůcka není',
    !S.pomuckaZkousek('scripts/generate-rss.mjs', { 'generate-rss.mjs': 'x' }, new Set()),
    'bez jediného uživatele se nedá říct, kdo ho má hlídat');

  /* NA SKUTEČNOSTI: pravidlo musí držet i na dnešním repozitáři. */
  const moduly = S.modulyVeScripts();
  const zvenku = S.spousteneZvenku();
  pravda('na dnešním repozitáři je adresa-pozemku.mjs pomůcka',
    S.pomuckaZkousek('scripts/adresa-pozemku.mjs', moduly, zvenku));
  pravda('a archiv.mjs, oprav.mjs ani fetch-opportunities.mjs ne',
    !S.pomuckaZkousek('scripts/archiv.mjs', moduly, zvenku)
    && !S.pomuckaZkousek('scripts/oprav.mjs', moduly, zvenku)
    && !S.pomuckaZkousek('scripts/fetch-opportunities.mjs', moduly, zvenku),
    'jeden z nich vyšel jako pomůcka — to by znamenalo přestat ho hlídat');
  pravda('postupy z .github se čtou i z podsložek',
    zvenku.has('ohlas-selhani.mjs'),
    'ohlas-selhani.mjs pouští .github/actions/ohlas-selhani/action.yml');

  /* A ŽE SE PODLE TOHO STROJ OPRAVDU ŘÍDÍ: pomůcky se nesabotují. */
  const kodB = readFileSync(new URL('./sabotuj.mjs', import.meta.url), 'utf8');
  pravda('stroj pomůcky z cílů opravdu vyřadí',
    /const cile = vse\.filter\(\(c\) => !pomucky\.includes\(c\)\)/.test(kodB),
    'jinak je pravidlo jen k přečtení');
  pravda('a vynechané pomůcky vypíše, ať je vidět proč',
    /vynecháno jako pomůcka zkoušek/.test(kodB));
}

/* ---- 13) SABOTÁŽ SE MUSÍ DOSTAT K PROHLÍŽEČI --------------------
 * ==================================================================
 * Zkouška v prohlížeči si otevře stránku a stránka si stáhne
 * js/min/main.js. Sabotáž ale zapisuje js/main.js, takže do února
 * 2026 mutaci nemohl žádný hlídač v prohlížeči vidět — a to je přes
 * sto z 307 hlídačů. Stroj proto po sabotáži přestaví minifikovanou
 * kopii TOHO JEDNOHO souboru a po zkoušce vrátí z gitu obojí.
 *
 * Celý ten mechanismus stojí na dvou měřitelných předpokladech. Tady
 * se měří oba — na skutečných souborech, ne na fixtuře.
 */
{
  const fs = readFileSync;
  const U = (c) => new URL('../' + c, import.meta.url);
  /* PŘEDPOKLAD 1: minifikace je čistá funkce a dává bitově totéž, co
     je zapsané v repozitáři. Kdyby ne, stroj by po každé sabotáži
     nechal v js/min/ cizí obsah a „vrátit do původní podoby" by
     neprošlo. */
  const zdroj = fs(U('js/pozemek.js'), 'utf8');
  const kopie = fs(U('js/min/pozemek.js'), 'utf8');
  pravda('minifikace dává bitově to, co je v repozitáři',
    M.ocistiJs(zdroj, 'pozemek.js') === kopie,
    'js/min/pozemek.js se liší od toho, co minifikace spočítá — pak se'
    + ' kopie po sabotáži nedá bezpečně vrátit');
  /* PŘEDPOKLAD 2: mutace zdroje se do minifikované kopie OPRAVDU
     promítne. Bez tohohle by přestavování bylo jen zdržení: stránka
     by dostala stejný kód jako dřív a verdikt by pořád lhal. */
  const mut = zdroj.replace(/\s>=\s/, ' > ');
  pravda('a sabotáž v tom zdroji se do kopie promítne',
    mut !== zdroj && M.ocistiJs(mut, 'pozemek.js') !== kopie,
    'mutace >= na > se v minifikované kopii neprojevila');

  /* A ŽE TO STROJ DĚLÁ A UKLÍZÍ PO SOBĚ. Tohle je nejcitlivější kus
     celého repozitáře: stroj píše do js/min/, což je generovaná
     složka. Kdyby tam po sobě nechal přestavěnou kopii, byla by to
     změna, o které nikdo neví. */
  const kodB = fs(U('scripts/sabotuj.mjs'), 'utf8');
  pravda('stroj přestaví kopii jen u souboru bez rozdělané změny',
    /if \(min && cistySoubor\(min\)\)/.test(kodB));
  pravda('doručeno je jen to, co je vidět v diffu',
    /doruceno = zmenilSe\(min\)/.test(kodB),
    'bez diffu by stroj tvrdil „doručeno" i o mutaci, která z kopie vypadla');
  pravda('a verdikt „nedoručená" zůstává, když se mutace nedoručila',
    /prohlizecova && min && !doruceno/.test(kodB));
  pravda('po zkoušce se vrací z gitu i kopie',
    /vratZGitu\(min\)/.test(kodB));
  pravda('a kontroluje se na bitovou shodu, jinak se stroj zastaví',
    /readFileSync\(join\(KOREN, min\), 'utf8'\) !== minPuvodni/.test(kodB)
    && /se nevrátil do původní podoby — zastavuji/.test(kodB));
  /* A POJISTKA, KTERÁ TU BYLA OD ZAČÁTKU, SE NESMÍ UVOLNIT: do js/min/
     se nikdy nesabotuje jako do cíle. Přestavba je něco jiného než
     sabotáž — je to dopočítaný soubor, ne vybraná oběť. */
  pravda('js/min/ není a nesmí být cíl sabotáže',
    !S.smiSabotovat('js/min/main.js') && S.smiSabotovat('js/main.js'));
}

/* ---- 14) JEDNOTKA MĚŘENÍ JE PÁR (SOUBOR, MUTACE) ---------------
 * ==================================================================
 * Jakmile se sabotáž začala dostávat k prohlížeči (§396), vydal stroj
 * o `test-barvy` šest slepých míst: obrátil `>=`, `===`, `&&` a další
 * v js/main.js a zkouška mlčela. Jenže `test-barvy` z js/main.js čte
 * BARVY, a týž soubor hlídá deset zkoušek. Pravda, kterou stroj v tu
 * chvíli znal, byla „tahle zkouška tu mutaci nechytila" — ne „tuhle
 * mutaci nechytí nikdo". To druhé je to, co zajímá, a zjistit se to dá
 * jen po souborech a napříč koly.
 */
{
  /* SOUPIS SE SČÍTÁ PŘES KOLA. Bez toho by smyčka pokaždé začínala od
     nuly a odpověď „nechytí to nikdo" by nevznikla nikdy. */
  let u = { soubory: {} };
  u.soubory = R.soupisPoSouborech(u, [{ zkouska: 'test-barvy.mjs', sabotaze: [
    { cil: 'js/main.js', jmeno: 'obrácené porovnání (>= na >)', stav: 'NECHYTILA',
      hlidajiJeste: ['test-hledani.mjs'] }] }]);
  je('po prvním mlčení je v soupisu jedna mlčící zkouška',
    u.soubory['js/main.js']['obrácené porovnání (>= na >)'],
    { chytily: [], mlcely: ['test-barvy.mjs'], hlidacu: 2 });
  je('a nález zatím žádný — jedna zkouška může mít jiný předmět',
    R.vadyBezHlidace(u, () => 2).length, 0);
  u.soubory = R.soupisPoSouborech(u, [{ zkouska: 'test-hledani.mjs', sabotaze: [
    { cil: 'js/main.js', jmeno: 'obrácené porovnání (>= na >)', stav: 'NECHYTILA',
      hlidajiJeste: ['test-barvy.mjs'] }] }]);
  const n = R.vadyBezHlidace(u, () => 2);
  je('po druhém mlčení nález je', n.length, 1);
  je('a má tíhu 3, protože je to nález o celé sadě', n[0].tiha, 3);
  pravda('důkaz jmenuje oba mlčící hlídače',
    /test-barvy\.mjs, test-hledani\.mjs/.test(n[0].dukaz), n[0].dukaz);
  /* A ROZDÍL MEZI NÁLEZEM A ROZDĚLANOU PRACÍ. Když soubor hlídá víc
     zkoušek, než kolik jich stroj změřil, je pravda jen tolik, že ji
     nechytila ani jedna ZMĚŘENÁ. Naměřeno na sobě 4. 11.: smyčka
     vydala čtrnáct nálezů „vadu nechytí nikdo" po dvou měřeních
     z deseti hlídačů js/main.js — tedy nadsazeno o celou třídu
     tvrzení, přesně jako §397 o úroveň výš. */
  const u3 = { soubory: R.soupisPoSouborech({}, [
    { zkouska: 'test-a.mjs', sabotaze: [{ cil: 'js/main.js', jmeno: 'm', stav: 'NECHYTILA',
      hlidajiJeste: ['test-b.mjs', 'test-c.mjs'] }] },
    { zkouska: 'test-b.mjs', sabotaze: [{ cil: 'js/main.js', jmeno: 'm', stav: 'NECHYTILA',
      hlidajiJeste: ['test-a.mjs', 'test-c.mjs'] }] },
  ]) };
  const n3 = R.vadyBezHlidace(u3, () => 3);
  je('dokud nebyli na řadě všichni, je to tíha 2, ne 3', n3[0].tiha, 2);
  pravda('a říká se to, co se změřilo',
    /mlčelo 2 z 3 zkoušek/.test(n3[0].dukaz) && /zbývá změřit 1/.test(n3[0].dukaz), n3[0].dukaz);
  pravda('a nekřičí se o tom nahlas (tíha 3 je mez pro ::error::)',
    R.kOhlaseni(n3, []).vazne.length === 0);
  const u4 = { soubory: R.soupisPoSouborech(u3, [
    { zkouska: 'test-c.mjs', sabotaze: [{ cil: 'js/main.js', jmeno: 'm', stav: 'NECHYTILA',
      hlidajiJeste: ['test-a.mjs', 'test-b.mjs'] }] },
  ]) };
  const n4 = R.vadyBezHlidace(u4, () => 3);
  je('až mlčí všichni, je to nález (tíha 3)', n4[0].tiha, 3);
  pravda('a teprve ten se křičí nahlas', R.kOhlaseni(n4, []).vazne.length === 1);
  pravda('a důkaz jmenuje, kolik hlídačů to je',
    /všechny zkoušky, které ten soubor hlídají \(3: /.test(n4[0].dukaz), n4[0].dukaz);
  je('mez mlčení je dvě zkoušky, ne jedna', R.MEZ_MLCENI, 2);
  /* A POČET HLÍDAČŮ SE BERE ŽIVĚ Z REPOZITÁŘE, NE Z ULOŽENÉHO ČÍSLA.
     Naměřeno na sobě: starší zápisy je nenesly, soupis pak o mutaci
     v js/main.js tvrdil „mlčely všechny 2 zkoušky, které ten soubor
     hlídají" — a hlídá ho deset. */
  const stary = { soubory: { 'js/main.js': { m: { chytily: [], mlcely: ['test-a.mjs', 'test-b.mjs'] } } } };
  je('bez uloženého počtu se hlídači dopočítají živě',
    R.vadyBezHlidace(stary, () => 10)[0].tiha, 2);
  pravda('a tíha 3 vznikne, až živý počet dojde k mlčícím',
    R.vadyBezHlidace(stary, () => 2)[0].tiha === 3);
  pravda('a bez vlastní funkce se počítá z repozitáře (js/main.js hlídá víc než 2)',
    R.vadyBezHlidace(stary)[0].tiha === 2,
    'na dnešním repozitáři hlídá js/main.js ' + S.kdoHlidaCil('js/main.js').length + ' zkoušek');
  /* CHYCENÍ MAZE NÁLEZ. Když tu samou mutaci někdo chytí, hlídač na ni
     existuje a není co hlásit — a mlčící zkouška se z druhého sloupce
     musí ztratit, ať účet nedrží obojí naráz. */
  u.soubory = R.soupisPoSouborech(u, [{ zkouska: 'test-hledani.mjs', sabotaze: [
    { cil: 'js/main.js', jmeno: 'obrácené porovnání (>= na >)', stav: 'chytila' }] }]);
  je('chycení tu mutaci z mlčících odebere',
    u.soubory['js/main.js']['obrácené porovnání (>= na >)'],
    { chytily: ['test-hledani.mjs'], mlcely: ['test-barvy.mjs'], hlidacu: 2 });
  je('a nález zmizí', R.vadyBezHlidace(u, () => 2).length, 0);
  /* Nerozhodnuté stavy se do soupisu nepíšou vůbec: „nedoručená",
     „rovnocenná" ani „nerozhodnuto" nejsou odpověď na otázku, kdo tu
     vadu chytí. */
  const u2 = { soubory: R.soupisPoSouborech({}, [{ zkouska: 'test-a.mjs', sabotaze: [
    { cil: 'js/main.js', jmeno: 'm', stav: 'nedoručená' },
    { cil: 'js/main.js', jmeno: 'm2', stav: 'rovnocenná' },
    { cil: 'js/main.js', jmeno: 'm3', stav: 'nerozhodnuto' }] }]) };
  je('nerozhodnuté stavy do soupisu po souborech nepatří', u2.soubory, {});

  /* NAHLAS O ZKOUŠCE JEN TAM, KDE JE OBVINĚNÍ PEVNÉ. */
  const oh = R.kOhlaseni([], [
    { zkouska: 'test-sama.mjs', sabotaze: [
      { cil: 'scripts/' + 'jen-moje.mjs', jmeno: 'm', stav: 'NECHYTILA', hlidajiJeste: [] }] },
    { zkouska: 'test-barvy.mjs', sabotaze: [
      { cil: 'js/main.js', jmeno: 'm', stav: 'NECHYTILA', hlidajiJeste: ['test-x.mjs'] }] }]);
  je('křičí se o zkoušce, která je u toho souboru sama',
    oh.slepa.map((p) => p.zkouska), ['test-sama.mjs']);

  /* ÚČET: mlčení u souboru s víc hlídači má vlastní sloupec. Spadnout
     do „slepých míst" by obviňovalo, spadnout do „nedotčených" by
     tvrdilo, že se k té zkoušce stroj ještě nedostal. */
  const st = R.stavUctu(['test-a.mjs', 'test-b.mjs'], { zkousky: {
    'test-a.mjs': { kdy: '2026-11-04', chytila: 0, nechytila: 1, slepa: [], mlcela: ['m v js/main.js'] },
    'test-b.mjs': { kdy: '2026-11-04', chytila: 0, nechytila: 1, slepa: ['m'] },
  } });
  je('mlčící zkouška má v účtu vlastní sloupec', st.mlcivych, 1);
  je('a nepočítá se mezi slepá místa', st.sSlepymMistem, 1);
  je('ani mezi nedotčené', st.nedotcenych, 0);
  pravda('a účet to vypíše vlastní větou',
    R.hlaseniUctu(st, 0).join(' ').includes('hlídá víc zkoušek'));

  /* A KDO TEN SOUBOR HLÍDÁ, SE MĚŘÍ, NE HÁDÁ. */
  const mod = {
    'test-barvy.mjs': "for (const f of ['../js/main.js']) {}",
    'test-hledani.mjs': "readFileSync('../js/main.js')",
    'test-ceny.mjs': "import { x } from './ceny-spolecne.mjs';",
  };
  je('hlídače souboru stroj najde a srovná podle jména',
    S.kdoHlidaCil('js/main.js', mod), ['test-barvy.mjs', 'test-hledani.mjs']);
  /* Jméno neexistujícího souboru se skládá ze dvou kusů schválně:
     test-staticka hlídá, že se v repozitáři neodkazuje na soubory,
     které nejsou, a tahle fixtura ten soubor mít NESMÍ — měří se, co
     stroj řekne o cíli, který nikdo nehlídá. */
  je('a u souboru, který nikdo nehlídá, je seznam prázdný',
    S.kdoHlidaCil('js/' + 'nikdo.js', mod), []);
  /* Na skutečnosti: js/main.js hlídá víc než jedna zkouška — na tom
     celé §397 stojí. */
  pravda('na dnešním repozitáři hlídá js/main.js víc zkoušek',
    S.kdoHlidaCil('js/main.js').length >= 2);
  const kodB = readFileSync(new URL('./sabotuj.mjs', import.meta.url), 'utf8');
  pravda('a stroj to k nechycené sabotáži opravdu přiloží',
    /hlidajiJeste = stav === 'NECHYTILA'/.test(kodB));
}

/* ---- 15) HLÁŠENÍ MUSÍ ŘÍKAT TOTÉŽ CO ÚČET -------------------- */
{
  const v = { zkouska: 'test-a.mjs', hlidá: ['x'], chytila: 0, nechytila: 2, sabotaze: [
    { cil: 'scripts/' + 'jen-moje.mjs', jmeno: 'm1', stav: 'NECHYTILA', hlidajiJeste: [] },
    { cil: 'js/main.js', jmeno: 'm2', stav: 'NECHYTILA', hlidajiJeste: ['test-x.mjs', 'test-y.mjs'] },
  ] };
  const r = S.hlaseniProkazu(v).join('\n');
  pravda('o pevném slepém místě se mluví jako o nálezu o zkoušce',
    /SLEPÉ MÍSTO: 1 sabotáží zkouška nechytila/.test(r) && /nehlídá nikdo jiný/.test(r), r);
  pravda('a o mlčení u souboru s víc hlídači jako o mlčení',
    /MLČENÍ: m2 v js\/main\.js/.test(r) && /až mlčí druhá/.test(r), r);
  pravda('počet hlídačů se neplete do „2 zkoušek"',
    /ještě 2 zkoušky \(test-x\.mjs, test-y\.mjs\)/.test(r), r);
  je('a množné číslo drží i na hranicích',
    [1, 2, 4, 5, 0].map(S.mnozneZkousky),
    ['zkouška', 'zkoušky', 'zkoušky', 'zkoušek', 'zkoušek']);
  pravda('a pevné slepé místo se za mlčení nevydává',
    !/MLČENÍ: m1/.test(r), r);
}

console.log('Samorozvoj — nálezce, sabotážní stroj a smyčka');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) console.error(`::error::Samorozvoj: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`);
process.exit(chyb ? 1 : 0);
