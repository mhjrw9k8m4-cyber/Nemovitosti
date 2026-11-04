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
    'test-c.mjs': { kdy: '2026-11-01', chytila: 0, nechytila: 1 } } };
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
  const prokazy = [{ zkouska: 'test-a.mjs', nechytila: 2 }, { zkouska: 'test-b.mjs', nechytila: 0 }];
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
    /if \(v\.chyba\) break;/.test(smy));
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
  pravda('a jen u souboru, který má minifikovaný dvojník',
    /minifikovanaKopie\(cil\)/.test(kodS) && /if \(min\) \{/.test(kodS),
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
    'test-c.mjs': { kdy: '2026-11-04', chytila: 0, nechytila: 1, nedorucene: [] },
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

console.log('Samorozvoj — nálezce, sabotážní stroj a smyčka');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) console.error(`::error::Samorozvoj: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`);
process.exit(chyb ? 1 : 0);
