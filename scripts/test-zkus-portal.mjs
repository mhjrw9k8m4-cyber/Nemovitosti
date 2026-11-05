/* Test: bot, který na portálu vyzkouší všechny cesty
   ==================================================================
   Spuštění: node scripts/test-zkus-portal.mjs   (bez sítě)

   FIXTURY JSOU SKUTEČNÉ ODPOVĚDI z ohledání 4. 11. 2026:
     · OFN katalog      — běh 41808644005 (api.opendata.mmhk.cz/lod/catalog)
     · datová sada      — běh 41809363032 (jedna z osmi sad téhož katalogu)
     · robots.txt státu — běh 41809145657 (data.gov.cz/robots.txt)
     · CKAN 404         — běh 41809247276 (data.gov.cz/api/3/action/package_search)
     · CSV státu        — portal.gov.cz/nepotrebny-nemovity-majetek/?export=csv
     · POST rozhraní    — běh 41802028063 (nabidkamajetku.gov.cz/api/Property/List)

   CO SE TU MĚŘÍ NEJVÍC: ŽE SE Z „ODPOVĚDĚLA" NEDĚLÁ „VEDE K NABÍDKÁM".
   Stránka s nápisem „nenalezeno" odpoví taky 200 a taky je to HTML.
   Verdikt proto rozhoduje podle toho, co se z odpovědi dalo přečíst,
   ne podle stavu.
   ================================================================== */
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import * as C from './cesty-portalu.mjs';
import * as Z from './zkus-portal.mjs';
import { KANDIDATI } from './zdroje-kandidati.mjs';
import { zeSitemapy, zRss } from './cteni-zdroje.mjs';

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
const KATALOG = JSON.stringify({
  '@context': 'https://ofn.gov.cz/rozhraní-katalogů-otevřených-dat/2021-01-11/kontexty/rozhraní-katalogů-otevřených-dat.jsonld',
  iri: 'https://api.opendata.mmhk.cz/lod/catalog',
  typ: 'Katalog',
  'název': { cs: 'Katalog otevřených dat MMHK' },
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
});
/* Sada, jak opravdu přišla: OBĚ adresy distribuce jsou prázdné. */
const SADA_PRAZDNA = JSON.stringify({
  iri: 'https://api.opendata.mmhk.cz/lod/catalog/815e142e-f2e8-4327-97e0-575939934d90',
  typ: 'Datová sada',
  'název': { cs: 'test1' }, popis: { cs: 'wdwd' },
  distribuce: [{ typ: 'Distribuce', 'přístupové_url': '', 'soubor_ke_stažení': '' }],
});
const SADA_SE_SOUBOREM = JSON.stringify({
  iri: 'https://api.opendata.mmhk.cz/lod/catalog/x',
  typ: 'Datová sada',
  'název': { cs: 'Prodej pozemků' }, popis: { cs: 'Seznam pozemků určených k prodeji' },
  distribuce: [{ typ: 'Distribuce', 'přístupové_url': 'https://opendata.mmhk.cz/api/pozemky',
    'soubor_ke_stažení': 'https://opendata.mmhk.cz/pozemky.csv' }],
});
const ROBOTS_STATU = `Sitemap: https://data.gov.cz/sitemap.xml
User-agent: *
Disallow: /sparql*
Disallow: /fct/
Disallow: /describe/
Disallow: /zdroj/

User-agent: Googlebot
Allow: /
`;
const CSV_STATU = 'NAZEV;POPIS;OKRES;CENA\n'
  + 'Pozemek p.č. 123/4;Pozemek o výměře 1 500 m2 je nabízen k prodeji;Zlín;450000\n'
  + 'Pozemek p.č. 55;Pozemek o výměře 300 m2;Brno-venkov;90000\n';
const SITEMAPA = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  + '<url><loc>https://www.vls.cz/cs/prodej-nemoviteho-majetku</loc></url>'
  + '<url><loc>https://www.vls.cz/cs/o-nas</loc></url>'
  + '<url><loc>https://www.vls.cz/cs/pozemky/123</loc></url></urlset>';

/* ---- 1) TVAR ODPOVĚDI SE POZNÁ Z OBSAHU, NE Z HLAVIČKY --------- */
{
  je('katalog je JSON-LD (má @context)', C.tvarOdpovedi('application/ld+json', KATALOG), 'JSONLD');
  je('a pozná se, i když web pošle text/plain',
    C.tvarOdpovedi('text/plain; charset=utf-8', KATALOG), 'JSONLD');
  je('CSV státu je CSV', C.tvarOdpovedi('', CSV_STATU), 'CSV');
  je('sitemapa je sitemapa', C.tvarOdpovedi('application/xml', SITEMAPA), 'SITEMAP');
  je('RSS je RSS', C.tvarOdpovedi('', '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>'), 'RSS');
  je('HTML je HTML', C.tvarOdpovedi('text/html', '<!DOCTYPE html><html><body>x</body></html>'), 'HTML');
  je('prázdná odpověď je prázdno', C.tvarOdpovedi('text/html', ''), 'PRÁZDNO');
  je('rozbitý JSON není JSON', C.tvarOdpovedi('application/json', '{"a":'), 'TEXT');
  /* ÚZSVM: na GET vrátilo 405 a prázdné tělo (změřeno). */
  je('405 s prázdným tělem je prázdno', C.tvarOdpovedi('', ''), 'PRÁZDNO');
}

/* ---- 2) VERDIKT: ODPOVĚDĚLA ≠ VEDE K NABÍDKÁM ----------------- */
{
  je('robots.txt nedovoluje → zavřená',
    C.verdiktCesty({ dovoleno: false }).verdikt, 'zavřená');
  je('CKAN na data.gov.cz vrátil 404 → zavřená (změřeno)',
    C.verdiktCesty({ dovoleno: true, stav: 404, typ: 'text/html', telo: '<html></html>' }).verdikt, 'zavřená');
  const nenalezeno = C.verdiktCesty({ dovoleno: true, stav: 200, typ: 'text/html',
    telo: '<!DOCTYPE html><html><body>Nenalezeno</body></html>', nabidek: 0 });
  je('stránka „nenalezeno" odpověděla, ale nabídky nevede', nenalezeno.verdikt, 'odpověděla');
  pravda('a je u ní napsané, co jí chybělo', /o pozemcích ani slovo/.test(nenalezeno.proc), nenalezeno.proc);
  const slibna = C.verdiktCesty({ dovoleno: true, stav: 200, typ: 'application/json',
    telo: '{"nazev":"Prodej pozemků","popis":"parcely k prodeji"}', nabidek: 0 });
  je('strojový tvar o pozemcích i o převodu je slibná', slibna.verdikt, 'slibná');
  const sNabidkami = C.verdiktCesty({ dovoleno: true, stav: 200, typ: 'text/html',
    telo: '<html>prodej pozemku</html>', nabidek: 3 });
  je('a cesta, ze které se přečetly nabídky, je nález', sNabidkami.verdikt, 'nabídky');
  pravda('s počtem v odůvodnění', /3 nabídek/.test(sNabidkami.proc), sNabidkami.proc);
  /* ROZDÍL POZEMEK vs. PŘEVOD — změřeno na pěti falešných nálezech (§372). */
  const jenPozemek = C.verdiktCesty({ dovoleno: true, stav: 200, typ: 'application/json',
    telo: '{"nazev":"Seznam dětských hřišť","popis":"parcela 12/3"}' });
  je('„parcela" bez převodu slibná není', jenPozemek.verdikt, 'odpověděla');
  pravda('a řekne se proč', /o převodu ne/.test(jenPozemek.proc), jenPozemek.proc);
}

/* ---- 2b) HTML, VE KTERÉM NABÍDKY JSOU: „KE ČTENÍ" -------------
 *
 * Naměřeno 5. 11. na Ministerstvu obrany (běh 42016638323):
 * `/nemovity-majetek/aktualni-nabidka` odpoví 200, má 23 631 bajtů,
 * mluví o pozemcích i o prodeji — a bot to odložil mezi „odpověděla"
 * s poznámkou „není strojový tvar (HTML)", tedy do téže přihrádky
 * jako stránku o kalendáři akcí. Nabídky tam přitom JSOU; chybí
 * k nim předpis pro čtení. Viz oddíl 429.
 */
{
  const STRANKA_OBRANY = '<!DOCTYPE html><html><head><title>Aktuální nabídka'
    + ' nemovitého majetku</title><style>.x{color:red}</style>'
    + '<script>var parcela = "prodej pozemku";</script></head><body>'
    + '<h1>Výběrové řízení na prodej nepotřebného nemovitého majetku</h1>'
    + '<div class="n"><h2>Pozemek p. č. 123/4, k. ú. Vyškov</h2>'
    + '<p>Výměra 1 500 m2, nejnižší podání 450 000 Kč.</p></div>'
    + '<div class="n"><h2>Pozemek p. č. 55, k. ú. Olomouc</h2>'
    + '<p>Výměra 300 m2, nejnižší podání 90 000 Kč.</p></div></body></html>';

  const keCteni = C.verdiktCesty({ dovoleno: true, stav: 200, typ: 'text/html',
    telo: STRANKA_OBRANY, nabidek: 0 });
  je('HTML o pozemcích i o převodu je „ke čtení", ne „odpověděla"', keCteni.verdikt, 'ke čtení');
  pravda('a je u toho napsané, co chybí', /chybí předpis pro čtení/.test(keCteni.proc), keCteni.proc);
  /* ROZCESTNÍK NENÍ VÝPIS — a tohle je ta nejdůležitější hranice
     celého verdiktu. Text je SKUTEČNÝ, zkrácený z běhu 42027075306:
     stránka „Aktuální nabídka nemovitého majetku" Ministerstva obrany
     má 23 631 bajtů značek a 1 264 znaků viditelného textu, a je to
     navigace. Ani jedna cena, ani jedna výměra. První verze verdiktu
     ji označila „ke čtení" a kdo by podle toho psal předpis, psal by
     ho pro menu. */
  const ROZCESTNIK_OBRANY = '<!DOCTYPE html><html><head><title>Aktuální nabídka'
    + ' nemovitého majetku | Odbor nakládání s nepotřebným majetkem</title></head><body>'
    + '<nav><a href="/onnm">ONNM</a><a href="/nemovity-majetek">Nemovitý majetek</a>'
    + '<a href="/nemovity-majetek/aktualni-nabidka">Aktuální nabídka nemovitého majetku</a>'
    + '<a href="/nemovity-majetek/drazby">Dražby nemovitostí</a>'
    + '<a href="/nemovity-majetek/odprodeje">Odprodeje v realizaci</a>'
    + '<a href="/nemovity-majetek/archiv-prodeju">Archív prodejů</a></nav>'
    + '<p>Domů · Nemovitý majetek · Aktuální nabídka nemovitého majetku</p>'
    + '<p>Prodej nepotřebného majetku v katastru nemovitostí.</p></body></html>';
  const rozcestnik = C.verdiktCesty({ dovoleno: true, stav: 200, typ: 'text/html',
    telo: ROZCESTNIK_OBRANY, nabidek: 0 });
  je('rozcestník o pozemcích a převodu „ke čtení" NENÍ', rozcestnik.verdikt, 'odpověděla');
  pravda('a je u toho napsané, že chybí důkaz nabídky',
    /žádný důkaz nabídky: 0 cen, 0 výměr/.test(rozcestnik.proc), rozcestnik.proc);
  pravda('a u cesty, která nabídky má, je důkaz v odůvodnění vypsaný číslem',
    /2× cena a 2× výměra/.test(keCteni.proc), keCteni.proc);

  /* DŮKAZEM JE CENA **NEBO** VÝMĚRA — a tu druhou polovinu pravidla
     nejdřív nehlídalo nic: sabotáž, která z `cen || vymer` nechala jen
     `cen`, prošla 150 ze 150, protože všechny moje vzorky měly obojí.
     Výpis bez ceny je přitom u výběrových řízení běžný („nejvyšší
     nabídce"), takže vyhodit výměru by umlčelo celou skupinu nálezů. */
  const bezCeny = C.verdiktCesty({ dovoleno: true, stav: 200, typ: 'text/html',
    telo: '<html><body><h1>Výběrové řízení na prodej pozemků</h1>'
      + '<p>Pozemek p. č. 44/1, k. ú. Tábor, výměra 2 310 m2.</p>'
      + '<p>Pozemek p. č. 9, k. ú. Písek, výměra 870 m2.</p>'
      + '<p>Nabídky zasílejte do 30. 11.; prodej nejvyšší nabídce.</p></body></html>',
    nabidek: 0 });
  je('výpis s výměrami, ale BEZ ceny, je taky „ke čtení"', bezCeny.verdikt, 'ke čtení');
  pravda('a v odůvodnění stojí 0 cen a 2 výměry',
    /0× cena a 2× výměra/.test(bezCeny.proc), bezCeny.proc);

  /* HRANICE V OBOU SMĚRECH — jinak by nový verdikt spolkl všechno. */
  je('HTML o pozemcích BEZ převodu zůstává „odpověděla"',
    C.verdiktCesty({ dovoleno: true, stav: 200, typ: 'text/html',
      telo: '<html><body>parcela 12/3 v katastru obce</body></html>' }).verdikt, 'odpověděla');
  je('a strojový tvar je pořád „slibná", ne „ke čtení"',
    C.verdiktCesty({ dovoleno: true, stav: 200, typ: 'application/json',
      telo: '{"nazev":"Prodej pozemků","popis":"parcely k prodeji"}' }).verdikt, 'slibná');
  je('zavřená se tím neobejde',
    C.verdiktCesty({ dovoleno: true, stav: 500, typ: 'text/html', telo: STRANKA_OBRANY }).verdikt, 'zavřená');

  /* POŘADÍ: člověk má nejdřív vidět to, s čím se dá něco udělat. */
  const poradi = C.PORADI_VERDIKTU;
  pravda('„ke čtení" stojí za slibnou a před „chce klíč"',
    poradi.indexOf('ke čtení') === poradi.indexOf('slibná') + 1
    && poradi.indexOf('ke čtení') < poradi.indexOf('chce klíč'), poradi.join(' < '));
  pravda('a má své jméno v rozpadu', !!C.JMENA_ROZPADU['ke čtení'],
    JSON.stringify(C.JMENA_ROZPADU));

  /* MĚŘENÍ OBSAHU. Bez něj končí nález u „HTML, 23 631 bajtů" a
     předpis se z toho napsat nedá. */
  const z = C.znakyOdpovedi(STRANKA_OBRANY);
  je('z odpovědi se vytáhne titulek', z.titulek, 'Aktuální nabídka nemovitého majetku');
  pravda('spočítá se cena (2×)', z.pocty['cena'] === 2, JSON.stringify(z.pocty));
  pravda('výměra (2×)', z.pocty['výměra'] === 2, JSON.stringify(z.pocty));
  pravda('katastr (2×)', z.pocty['katastr'] === 2, JSON.stringify(z.pocty));
  pravda('i výběrové řízení (1×)', z.pocty['výběrové řízení'] === 1, JSON.stringify(z.pocty));
  /* SKRIPT A STYL SE NEPOČÍTAJÍ. Ve fixtuře je `var parcela = "prodej
     pozemku"` ve <script> — kdyby se text bral i odtud, hlásilo by
     měření parcelu, která na stránce není vidět. */
  pravda('text ze <script> a <style> se do měření nedostane',
    !z.pocty['parcela'] && !/var parcela/.test(z.ukazka) && !/color:red/.test(z.ukazka),
    JSON.stringify(z));
  pravda('ukázka je ostříhaná a není to kopie stránky',
    z.ukazka.length <= C.STROP_UKAZKY && z.ukazka.length > 0, 'délka ' + z.ukazka.length);
  pravda('a je v ní vidět, o čem stránka je',
    /Výběrové řízení na prodej/.test(z.ukazka), z.ukazka.slice(0, 80));

  /* CENY A VÝMĚRY SE POČÍTAJÍ JEDNOU, V copakTamJe() ROBOTA DAT.
     Napsal jsem si je nejdřív po svém a výraz na ceny nenašel nic
     (v JS není hranice slova mezi „č" a mezerou). Měří se proto, že
     měření vážně chodí přes tutéž funkci — a že s sebou nese i dvě
     vlajky, které rozhodují, jestli má vůbec smysl psát předpis. */
  const prihlaseni = C.znakyOdpovedi('<html><head><title>Přihlášení</title></head>'
    + '<body>Pro zobrazení nabídky pozemků k prodeji se přihlaste. Ověřte, že jste člověk.</body></html>');
  pravda('u stránky za přihlášením se to pozná', prihlaseni.vypadaNaPrihlaseni === true,
    JSON.stringify(prihlaseni));
  const prazdno = C.znakyOdpovedi('<html><body>Žádné nabídky nenalezeny.</body></html>');
  pravda('a prázdný výpis taky', prazdno.vypadaNaPrazdno === true, JSON.stringify(prazdno));
  pravda('u poctivé nabídky ani jedna vlajka nevisí',
    !z.vypadaNaPrihlaseni && !z.vypadaNaPrazdno, JSON.stringify(z));
  pravda('a počítají se i odkazy a mikrodata (z copakTamJe)',
    typeof z.odkazu === 'number' && typeof z.jsonLd === 'number' && typeof z.itemprop === 'number',
    JSON.stringify(z));

  /* HLÁŠENÍ. Cesta „ke čtení" se musí dostat do výpisu i do rozpadu. */
  const hlaseni = C.hlaseniPortalu({ host: 'onnm.mo.gov.cz', cesty: [
    { verdikt: 'ke čtení', jmeno: 'aktuální nabídka', adresa: 'https://onnm.mo.gov.cz/x',
      proc: keCteni.proc, znaky: z },
    { verdikt: 'zavřená', jmeno: 'jiná', adresa: 'https://onnm.mo.gov.cz/y', proc: 'HTTP 404' },
  ] }).join('\n');
  pravda('rozpad počítá i „ke čtení"', /ke čtení 1/.test(hlaseni), hlaseni.split('\n')[0]);
  pravda('a cesta je ve výpisu vidět', /aktuální nabídka/.test(hlaseni), hlaseni);
  pravda('i s tím, co se na ní naměřilo', /Aktuální nabídka nemovitého majetku/.test(hlaseni)
    && /znaků textu/.test(hlaseni), hlaseni);
  const hlaseniPrihlaseni = C.hlaseniPortalu({ host: 'x.test', cesty: [
    { verdikt: 'ke čtení', jmeno: 'výpis', adresa: 'https://x.test/v', proc: '—', znaky: prihlaseni },
  ] }).join('\n');
  pravda('a vlajka o přihlášení je ve hlášení nahlas',
    /POZOR: vypadá na přihlášení/.test(hlaseniPrihlaseni), hlaseniPrihlaseni);
}

/* ---- 2c) CO Z NÁLEZU PATŘÍ ČLOVĚKU NA STŮL -------------------
 *
 * Bot běžel 4. i 5. 11., našel akceschopné cesty — a nedozvěděl se
 * o nich nikdo, protože nález skončil v JSON a úloha zeleně (§430).
 * Tyhle dvě funkce jsou to, podle čeho se hlásí; měří se tedy ony,
 * ne až hlásič.
 */
{
  const portaly = [
    { host: 'a.cz', jmeno: 'A', cesty: [
      { adresa: 'https://a.cz/1', jmeno: 'výpis', verdikt: 'nabídky', nabidek: 7 },
      { adresa: 'https://a.cz/2', jmeno: 'kalendář', verdikt: 'odpověděla' },
      { adresa: 'https://a.cz/3', jmeno: 'nic', verdikt: 'zavřená' },
    ] },
    { host: 'b.cz', jmeno: 'B', cesty: [
      { adresa: 'https://b.cz/x', jmeno: 'nabídka', verdikt: 'ke čtení' },
      { adresa: 'https://b.cz/y', jmeno: 'api', verdikt: 'chce klíč' },
      { adresa: 'https://b.cz/z', jmeno: 'feed', verdikt: 'slibná' },
    ] },
  ];
  const a = C.akceschopneCesty(portaly);
  je('akceschopné jsou jen cesty, se kterými se dá něco udělat', a.length, 4);
  pravda('„odpověděla" ani „zavřená" mezi nimi nejsou',
    !a.some((c) => c.verdikt === 'odpověděla' || c.verdikt === 'zavřená'),
    JSON.stringify(a.map((c) => c.verdikt)));
  je('a jsou v pořadí podle toho, co má člověk vidět první', a[0].verdikt, 'nabídky');
  je('druhá je slibná', a[1].verdikt, 'slibná');
  je('třetí ke čtení', a[2].verdikt, 'ke čtení');
  je('a klíč nakonec', a[3].verdikt, 'chce klíč');
  pravda('u každé stojí, CO S TÍM', a.every((c) => !!c.coSTim), JSON.stringify(a.map((c) => c.coSTim)));
  pravda('a ví se, z jakého portálu je', a.every((c) => !!c.host && !!c.jmeno));

  /* NOVÉ SE POČÍTÁ VČETNĚ VERDIKTU. Právě tohle se stalo obraně:
     adresa byla v nálezu i minule, ale jako „odpověděla". Změna na
     „ke čtení" JE nová informace a hlásit se musí. */
  const stary = { portaly: [
    { host: 'a.cz', cesty: [{ adresa: 'https://a.cz/1', verdikt: 'nabídky' }] },
    { host: 'b.cz', cesty: [{ adresa: 'https://b.cz/x', verdikt: 'odpověděla' }] },
  ] };
  const nove = C.noveProtiMinule(stary, { portaly });
  je('co bylo v nálezu i minule a se stejným verdiktem, nové není', nove.length, 3);
  pravda('ale změna verdiktu na téže adrese nová JE',
    nove.some((c) => c.adresa === 'https://b.cz/x' && c.verdikt === 'ke čtení'),
    JSON.stringify(nove.map((c) => c.adresa + '|' + c.verdikt)));
  pravda('a stará nabídka se znovu nehlásí',
    !nove.some((c) => c.adresa === 'https://a.cz/1'),
    JSON.stringify(nove.map((c) => c.adresa)));
  je('první nález (bez minulého) je celý nový', C.noveProtiMinule(null, { portaly }).length, 4);
  je('a stejný nález dvakrát nehlásí nic', C.noveProtiMinule({ portaly }, { portaly }).length, 0);
}

/* ---- 2d) ADRESA, KTERÁ VEDE JINAM, SE PŘEPÍŠE NA VLASTNÍ HOST --
 *
 * Naměřeno 5. 11. (běh 42016638323): sitemapa Ministerstva obrany
 * vypisuje adresy na `akis-d9.msw-cloud.com` (jejich cloud), bot tam
 * zašel a všech osm vrátilo HTTP 404. Osm ze 43 dotazů na cizí web,
 * který v registru nikdo nejmenoval — a zahozené cesty, které ta
 * sitemapa nesla. Viz oddíl 434.
 */
{
  je('cizí doména se přepíše na zkoušený host',
    C.naVlastniHost('http://akis-d9.msw-cloud.com/nemovity-majetek/archiv-prodeju/2025',
      'https://onnm.mo.gov.cz/sitemap.xml'),
    'https://onnm.mo.gov.cz/nemovity-majetek/archiv-prodeju/2025');
  je('a dotaz se zachová', C.naVlastniHost('http://cizi.test/vypis?strana=2',
    'https://onnm.mo.gov.cz/sitemap.xml'), 'https://onnm.mo.gov.cz/vypis?strana=2');
  je('týž host se nepřepisuje', C.naVlastniHost('https://onnm.mo.gov.cz/a',
    'https://onnm.mo.gov.cz/sitemap.xml'), 'https://onnm.mo.gov.cz/a');
  je('www se za cizí nepočítá', C.naVlastniHost('https://www.onnm.mo.gov.cz/a',
    'https://onnm.mo.gov.cz/sitemap.xml'), 'https://www.onnm.mo.gov.cz/a');
  /* PODDOMÉNA TÉŽE DOMÉNY JE POŘÁD TÝŽ WEB. Kdyby se přepsala, vyrobila
     by se 404 z adresy, která fungovala. */
  je('poddoména téže domény zůstane', C.naVlastniHost('https://drazby.example.cz/vypis',
    'https://example.cz/sitemap.xml'), 'https://drazby.example.cz/vypis');
  je('a nadřazená domména taky', C.naVlastniHost('https://example.cz/vypis',
    'https://drazby.example.cz/sitemap.xml'), 'https://example.cz/vypis');

  /* A TEĎ TO SAMÉ V dalsiCesty() — hlídat jen tu funkci by znamenalo
     měřit nástroj, ne jeho použití (§423). */
  const SITEMAPA_CIZI = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    + '<url><loc>http://akis-d9.msw-cloud.com/nemovity-majetek/archiv-prodeju/2025</loc></url>'
    + '<url><loc>http://akis-d9.msw-cloud.com/media/fotogalerie</loc></url></urlset>';
  const dalsi = C.dalsiCesty({ tvar: 'SITEMAP', telo: SITEMAPA_CIZI,
    adresa: 'https://onnm.mo.gov.cz/sitemap.xml' }, { zeSitemapy, zRss });
  pravda('ani jedna spojená cesta nevede na cizí host',
    dalsi.length > 0 && dalsi.every((c) => c.adresa.startsWith('https://onnm.mo.gov.cz/')),
    JSON.stringify(dalsi.map((c) => c.adresa)));
  pravda('a je u nich napsané, že se cesta přepsala',
    dalsi.every((c) => /na vlastním hostu/.test(c.jmeno)),
    JSON.stringify(dalsi.map((c) => c.jmeno)));
  const dalsiVlastni = C.dalsiCesty({ tvar: 'SITEMAP',
    telo: SITEMAPA_CIZI.replace(/http:\/\/akis-d9\.msw-cloud\.com/g, 'https://onnm.mo.gov.cz'),
    adresa: 'https://onnm.mo.gov.cz/sitemap.xml' }, { zeSitemapy, zRss });
  pravda('u adres na vlastním hostu se jméno nemění',
    dalsiVlastni.every((c) => c.jmeno === 'adresa ze sitemapy'),
    JSON.stringify(dalsiVlastni.map((c) => c.jmeno)));
}

/* ---- 2e) CELÝ PORTÁL, NE JEN JEDNA FUNKCE --------------------
 *
 * Tohle je nejdražší lekce dne. Pravidlo z §434 („adresa, která vede
 * jinam, se přepíše na vlastní host") jsem napsal, prokázal sabotáží
 * na `dalsiCesty()` — tři ze tří — a pustil bota naostro. A v nálezu
 * bylo osm cest na `akis-d9.msw-cloud.com` ZNOVU, všech osm 404.
 *
 * Důvod: `zkusPortal()` volal `dalsiCesty({ tvar, telo })` BEZ ADRESY,
 * takže se pravidlo nemělo o co opřít a vracelo adresu nezměněnou.
 * Hlídač svítil zeleně, protože měřil `dalsiCesty()` — tedy nástroj
 * o stupeň výš, než kde se rozhodovalo. §423 říká „měř použití, ne
 * nástroj"; tady se ukázalo, že „použití" má víc stupňů a měřit se
 * musí ten, kde se to doopravdy děje.
 *
 * Proto se tady zkouší CELÝ `zkusPortal()` s podstrčeným stahováním.
 */
{
  const SITEMAPA_CIZI_HOST = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    + '<url><loc>http://cizi-cloud.test/nemovity-majetek/archiv-prodeju/2025</loc></url>'
    + '<url><loc>http://cizi-cloud.test/media/fotogalerie</loc></url></urlset>';
  const chozeno = [];
  const pomucky = {
    stahni: async (url) => {
      chozeno.push(String(url));
      const je = (x) => String(url).includes(x);
      if (je('/robots.txt')) {
        return { ok: true, status: 200, headers: { get: () => 'text/plain' },
          text: async () => 'User-agent: *\nAllow: /\n' };
      }
      if (je('/sitemap.xml') && !je('index')) {
        return { ok: true, status: 200, headers: { get: () => 'application/xml' },
          text: async () => SITEMAPA_CIZI_HOST };
      }
      return { ok: true, status: 404, headers: { get: () => 'text/html' }, text: async () => '' };
    },
    ua: 'zkouska',
    smimeCist: async () => ({ dovoleno: true }),
    mezipamet: new Map(),
    zeSitemapy, zRss,
  };
  /* STROP MUSÍ STAČIT NA SPOJENÉ CESTY. Napoprvé jsem dal 20 a kontrola
     padla: dvacet dotazů spolkly samy tvary cest, které bot zkouší
     vždycky (katalogy, RSS, sitemapy), a na cesty ZE sitemapy už
     nedošlo. Nebyla to vada webu ani pravidla, byla to mez zkoušky —
     takže ji zvyšuju a píšu proč. */
  const vysledek = await Z.zkusPortal({ host: 'urad.test', jmeno: 'Úřad', url: 'https://urad.test/' },
    pomucky, { strop: 40 });
  const cizi = chozeno.filter((u) => /cizi-cloud\.test/.test(u));
  pravda('bot NEZAŠEL na cizí host ze sitemapy', cizi.length === 0,
    'navštíveno: ' + JSON.stringify(cizi));
  const prepsane = chozeno.filter((u) => /urad\.test\/nemovity-majetek\/archiv-prodeju\/2025/.test(u));
  pravda('ale cestu z té sitemapy vyzkoušel na vlastním hostu', prepsane.length === 1,
    'navštíveno: ' + JSON.stringify(chozeno.filter((u) => !/robots|sitemap/.test(u))));
  pravda('a v nálezu je u ní napsané, že se cesta přepsala',
    (vysledek.cesty || []).some((c) => /na vlastním hostu/.test(c.jmeno || '')),
    JSON.stringify((vysledek.cesty || []).map((c) => c.jmeno)));
}

/* ---- 2c) WEB, KTERÝ ODPOVÍDÁ NA VŠECHNO TOUŽ STRÁNKOU (§442) ----
 *
 * ZMĚŘENO NAOSTRO 5. 11. na drazbynaxos.cz (běh 42048959294): z 37
 * cest vrátilo 19 stav 200 a přesně 101 947 bajtů — jeden a týž
 * soubor. Bot z toho udělal 21 nálezů „nabídky", mezi nimi /rss,
 * /oai?verb=Identify a /katalog.jsonld. Fixtura je ten web v malém:
 * na cokoli kromě robots.txt vrátí tutéž stránku o dražbách.
 */
{
  const DOMOV = '<html><head><title>Dražby Naxos</title></head><body>'
    + '<h1>Dražby nemovitostí</h1><p>Katastr, parcela, dražba, výběrové řízení.</p>'
    + '<p>Cena 1 200 000 Kč, výměra 4 500 m2.</p></body></html>';
  const naVsechno = {
    stahni: async (url) => {
      if (String(url).includes('/robots.txt')) {
        return { ok: true, status: 200, headers: { get: () => 'text/plain' },
          text: async () => 'User-agent: *\nAllow: /\n' };
      }
      return { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => DOMOV };
    },
    ua: 'zkouska', smimeCist: async () => ({ dovoleno: true }),
    mezipamet: new Map(), zeSitemapy, zRss,
    /* ČTEČKA TU MUSÍ BÝT. Bez ní žádná cesta verdikt „nabídky"
       nedostane (nabidek = 0) a kontrola „ani jedna nedostane
       nabídky" by byla zelená i BEZ opravy — měřila by tvar, ne
       vadu. Prokázalo se to sabotáží: ze tří kontrol padla jedna.
       S čtečkou vznikne ten přelud doopravdy: táž stránka se
       přečte na každé cestě a vydá tři nabídky. */
    cti: (telo) => (/Dražby nemovitostí/.test(String(telo))
      ? { nabidky: [{ k: 'a' }, { k: 'b' }, { k: 'c' }], cesta: 'html' }
      : { nabidky: [] }),
  };
  const v = await Z.zkusPortal({ host: 'naxos.test', jmeno: 'Dražby', url: 'https://naxos.test/' },
    naVsechno, { strop: 12 });
  pravda('kontrolní cesta je v nálezu a přiznala stav 200',
    !!v.kontrolaNeexistujici && v.kontrolaNeexistujici.stav === 200
    && v.kontrolaNeexistujici.bajtu === DOMOV.length,
    JSON.stringify(v.kontrolaNeexistujici));
  const nabidky = (v.cesty || []).filter((c) => c.verdikt === 'nabídky');
  pravda('ani jedna cesta nedostane „nabídky" — je to pořád táž stránka',
    nabidky.length === 0,
    JSON.stringify(nabidky.map((c) => c.adresa)));
  pravda('a u každé je napsáno, že je to táž stránka jako na vymyšlenou adresu',
    (v.cesty || []).filter((c) => c.stav === 200)
      .every((c) => c.jakoNeexistujici === true && /vymyšlenou adresu/.test(c.proc || '')),
    JSON.stringify((v.cesty || []).filter((c) => c.stav === 200 && !c.jakoNeexistujici)
      .map((c) => [c.adresa, c.verdikt, c.proc])));

  /* OBRÁCENÝ PŘÍPAD: web, který neexistující cestu přiznává (404),
     musí svoje nálezy udržet. Jinak by pravidlo zabilo každý portál. */
  const sPoctivou404 = {
    stahni: async (url) => {
      const u = String(url);
      if (u.includes('/robots.txt')) {
        return { ok: true, status: 200, headers: { get: () => 'text/plain' },
          text: async () => 'User-agent: *\nAllow: /\n' };
      }
      /* „/katalog" je ÚMYSLNĚ jedna z cest, které bot zkouší hned.
         Napoprvé jsem tu měl „/nabidky" a kontrola padla: do stropu 12
         se k ní bot nedostane, protože dvanáct dotazů spolknou tvary
         katalogů. Nebyla to vada pravidla, byla to mez zkoušky —
         táž lekce jako u §436. */
      if (u.includes('/katalog') && !u.includes('.jsonld')) {
        return { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => DOMOV };
      }
      return { ok: true, status: 404, headers: { get: () => 'text/html' },
        text: async () => '<html><body>Nenalezeno</body></html>' };
    },
    ua: 'zkouska', smimeCist: async () => ({ dovoleno: true }),
    mezipamet: new Map(), zeSitemapy, zRss,
  };
  const v2 = await Z.zkusPortal({ host: 'poctivy.test', jmeno: 'Poctivý', url: 'https://poctivy.test/' },
    sPoctivou404, { strop: 12 });
  je('u webu s poctivou 404 je kontrola 404', (v2.kontrolaNeexistujici || {}).stav, 404);
  pravda('a nález na /katalog zůstane, pravidlo ho nesebere',
    (v2.cesty || []).some((c) => /\/katalog$/.test(c.adresa) && c.stav === 200 && !c.jakoNeexistujici),
    JSON.stringify((v2.cesty || []).filter((c) => c.stav === 200).map((c) => [c.adresa, c.verdikt])));
}

/* ---- 2d) CESTA, KTERÁ SLIBUJE STROJOVÝ TVAR (§444) --------------
 *
 * §442 zarazil web, co vrací touž stránku NA BAJT shodnou. Hned další
 * měření ukázalo, že to nestačí: verejnedrazby.cz (běh 42056549281)
 * dal „nabídky" cestám `/`, `/atom.xml` a `/api` a všechny tři
 * vrátily HTML o 27 299 až 27 573 bajtech — táž domovská stránka, jen
 * dynamická, takže shoda na bajt minula a kontrolní 404 (22 426 B)
 * se jí netýkala. Rozhoduje se tedy podle toho, co cesta slibovala.
 */
{
  const odp = (a, telo, nabidek, typ) => C.verdiktCesty({
    dovoleno: true, stav: 200, typ: typ || 'text/html', telo, nabidek, adresa: a });
  const HTML = '<html><body>Dražby pozemků, prodej, katastr.</body></html>';

  pravda('„slibuje strojový tvar" pozná přípony i jména rozhraní',
    ['https://x.cz/atom.xml', 'https://x.cz/api', 'https://x.cz/rss',
      'https://x.cz/katalog.jsonld', 'https://x.cz/oai?verb=Identify',
      'https://x.cz/arcgis/rest/services?f=json', 'https://x.cz/data.json']
      .every((a) => C.slibujeStrojovyTvar(a) === true),
    JSON.stringify(['https://x.cz/atom.xml', 'https://x.cz/api', 'https://x.cz/rss',
      'https://x.cz/katalog.jsonld', 'https://x.cz/oai?verb=Identify',
      'https://x.cz/arcgis/rest/services?f=json', 'https://x.cz/data.json']
      .filter((a) => !C.slibujeStrojovyTvar(a))));
  pravda('a obyčejnou cestu za slib nepovažuje',
    ['https://x.cz/', 'https://x.cz/nabidky', 'https://x.cz/katalog',
      'https://x.cz/prodej-pozemku', 'https://x.cz/drazby/2026']
      .every((a) => C.slibujeStrojovyTvar(a) === false),
    JSON.stringify(['https://x.cz/', 'https://x.cz/nabidky', 'https://x.cz/katalog',
      'https://x.cz/prodej-pozemku', 'https://x.cz/drazby/2026']
      .filter((a) => C.slibujeStrojovyTvar(a))));

  /* TEN ZMĚŘENÝ PŘÍPAD: tři cesty, osm až devět nabídek, všechny HTML. */
  const domov = odp('https://www.verejnedrazby.cz/', HTML, 9);
  const atom = odp('https://www.verejnedrazby.cz/atom.xml', HTML, 8);
  const api = odp('https://www.verejnedrazby.cz/api', HTML, 9);
  je('domovská stránka s nabídkami je POCTIVÝ nález', domov.verdikt, 'nabídky');
  je('ale /atom.xml, kde přišlo HTML, nálezem není', atom.verdikt, 'odpověděla');
  je('a /api taky ne', api.verdikt, 'odpověděla');
  pravda('u obou je napsané, co se slibovalo a co přišlo',
    /slibovala strojový tvar, přišlo HTML/.test(atom.proc || '')
    && atom.slibilaStroj === true && /8 nabídek/.test(atom.proc || ''),
    JSON.stringify(atom));
  /* A KDYŽ TEN SLIB SPLNÍ, je to nález jako každý jiný — pravidlo
     netrestá adresu, trestá nesplněný slib. */
  je('tentýž /atom.xml, který opravdu vrátí XML, nálezem JE',
    odp('https://www.verejnedrazby.cz/atom.xml', '<feed><entry>pozemek</entry></feed>', 8,
      'application/xml').verdikt, 'nabídky');
  /* A TEĎ SKRZ CELÉHO BOTA — jinak je to §436 potřetí.
     Kontroly výš volají `verdiktCesty()` přímo, tedy NÁSTROJ. Sabotáž
     „adresa se do soudce nepředává" jimi prošla zeleně: pravidlo by
     bylo v produkci mrtvé a zkouška by o tom nevěděla. Měří se tedy
     i stupeň, který pustí ostrý běh. */
  {
    const chozeno = [];
    const pomucky = {
      stahni: async (url) => {
        const u = String(url); chozeno.push(u);
        if (u.includes('/robots.txt')) {
          return { ok: true, status: 200, headers: { get: () => 'text/plain' },
            text: async () => 'User-agent: *\nAllow: /\n' };
        }
        /* Domovská stránka A /atom.xml vrací TOTÉŽ HTML — tak to dělá
           verejnedrazby.cz. Velikosti se o pár bajtů liší, takže na
           pravidlo z §442 (shoda na bajt) to nestačí. */
        if (/\/atom\.xml$/.test(u)) {
          return { ok: true, status: 200, headers: { get: () => 'text/html' },
            text: async () => HTML + '<!-- -->' };
        }
        if (/naxos2\.test\/$/.test(u)) {
          return { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => HTML };
        }
        return { ok: true, status: 404, headers: { get: () => 'text/html' },
          text: async () => '<html><body>Nenalezeno</body></html>' };
      },
      ua: 'zkouska', smimeCist: async () => ({ dovoleno: true }),
      mezipamet: new Map(), zeSitemapy, zRss,
      cti: (telo) => (/Dražby pozemků/.test(String(telo))
        ? { nabidky: [{ k: 'a' }, { k: 'b' }], cesta: 'html' } : { nabidky: [] }),
    };
    const v = await Z.zkusPortal({ host: 'naxos2.test', jmeno: 'Dražby 2', url: 'https://naxos2.test/' },
      pomucky, { strop: 40 });
    const atom = (v.cesty || []).find((c) => /\/atom\.xml$/.test(c.adresa));
    const dom = (v.cesty || []).find((c) => c.adresa === 'https://naxos2.test/');
    pravda('bot /atom.xml opravdu zkusil a dostal z něj HTML', !!atom && atom.tvar === 'HTML',
      JSON.stringify(atom && { adresa: atom.adresa, tvar: atom.tvar }));
    je('a NENÍ to nález — slib strojového tvaru se nesplnil',
      atom && atom.verdikt, 'odpověděla');
    je('domovská stránka s nabídkami nálezem zůstává', dom && dom.verdikt, 'nabídky');
  }

}

/* ---- 2e) NÁLEZ MUSÍ UKÁZAT, CO PŘEČETL (§446) ------------------
 *
 * Nález dosud řekl „přečteno 8 nabídek" a tím skončil. Z toho se
 * o zapojení zdroje rozhodnout NEDÁ: osm titulků bez ceny a výměry
 * není zdroj, je to seznam odkazů. U dražeb na tom navíc visí §334 —
 * bez termínu by se dražba na webu ukázala jako prodej, a to je
 * nepravda, ne nepřesnost. Měří se tedy skrz CELÉHO bota (po §444
 * vím, že měřit soudce samotného nestačí).
 */
{
  const HTML = '<html><body><h2>Prodej pozemku Lhota</h2>'
    + '<p>Cena 1 200 000 Kč, výměra 4 500 m2</p></body></html>';
  const udelej = (nabidka) => ({
    stahni: async (u) => (String(u).includes('/robots.txt')
      ? { ok: true, status: 200, headers: { get: () => 'text/plain' },
        text: async () => 'User-agent: *\nAllow: /\n' }
      : { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => HTML }),
    ua: 'zkouska', smimeCist: async () => ({ dovoleno: true }), mezipamet: new Map(),
    zeSitemapy, zRss,
    cti: () => ({ nabidky: [nabidka], cesta: 'signál' }),
  });

  const bohata = await Z.zkusPortal({ host: 'bohaty.test', jmeno: 'Bohatý', url: 'https://bohaty.test/' },
    udelej({ nazev: 'Prodej pozemku Lhota', cena: 1200000, vymera: 4500, misto: 'Lhota',
      okres: 'Kolín', druh: 'orná půda', kat: 'pozemek', url: 'https://bohaty.test/1', lat: 50, lng: 15 }),
    { strop: 3 });
  const uk = (bohata.cesty || []).map((c) => c.ukazkaNabidky).find(Boolean);
  pravda('nález ukáže první nabídku, ne jen její počet', !!uk, JSON.stringify(bohata.cesty || []));
  je('a je v ní cena', uk && uk.cena, 1200000);
  je('i výměra', uk && uk.vymera, 4500);
  je('i místo', uk && uk.misto, 'Lhota');
  pravda('a vypíše jmenovitě, co dalšího ta nabídka nese',
    !!uk && Array.isArray(uk.dalsiPolicka) && uk.dalsiPolicka.includes('lat'),
    JSON.stringify(uk && uk.dalsiPolicka));

  /* TEN DRUHÝ PŘÍPAD, KTERÝ ROZHODUJE: nabídka jen s titulkem. Počet
     by řekl „1 nabídka" a vypadalo by to stejně dobře jako výš —
     teprve ukázka přizná, že cena ani výměra tam nejsou. */
  const hola = await Z.zkusPortal({ host: 'holy.test', jmeno: 'Holý', url: 'https://holy.test/' },
    udelej({ nazev: 'Dražba nemovitosti', url: 'https://holy.test/1' }), { strop: 3 });
  const uk2 = (hola.cesty || []).map((c) => c.ukazkaNabidky).find(Boolean);
  pravda('u holé nabídky je v ukázce vidět, že cena ani výměra nejsou',
    !!uk2 && uk2.cena == null && uk2.vymera == null && !!uk2.nazev,
    JSON.stringify(uk2));

  /* A kde se nic nepřečetlo, ukázka v nálezu nevisí — prázdné pole by
     byl šum a nález má být čitelný. */
  const nic = await Z.zkusPortal({ host: 'nic.test', jmeno: 'Nic', url: 'https://nic.test/' },
    { ...udelej({}), cti: () => ({ nabidky: [] }) }, { strop: 3 });
  pravda('bez přečtené nabídky žádná ukázka v nálezu není',
    (nic.cesty || []).every((c) => !('ukazkaNabidky' in c)),
    JSON.stringify((nic.cesty || []).filter((c) => 'ukazkaNabidky' in c)));
}

/* ---- 2f) NABÍDKY ZE SIGNÁLŮ BEZ MÍSTA NEJSOU NÁLEZ (§447) -------
 *
 * ZMĚŘENO 5. 11. na verejnedrazby.cz (běh 42070736435): bot hlásil
 * 6–9 nabídek na každé cestě, cesta čtení „signál", a ukázky z §446
 * ukázaly, že táž nabídka má jinde jiná čísla (3 013 i 2 666 m², 406
 * i 2 666, 8 703 i 52 235). Nejslabší cesta čtení páruje čísla
 * z textu s nejbližším odkazem — na výpisu s deseti nabídkami špatně.
 * Takovou nabídku dát na web znamená napsat tam NEPRAVDU, ne mezeru.
 */
{
  const HTML = '<html><body><h2>Prodej areálu</h2><p>Cena 31 680 000 Kč,'
    + ' užitná plocha 3 013 m2. Katastr, dražba, parcela, prodej pozemku.</p></body></html>';
  /* KONTROLNÍ CESTA MUSÍ DÁT 404, jinak nález sebere §442 a tahle
     kontrola měří něco jiného, než si myslí. Naletěl jsem na to hned:
     fixtura vracela touž stránku na všechno, takže všechny čtyři
     kontroly hlásily „odpověděla" — správně, jen o jiném pravidle. */
  const bot = (nabidka, cesta) => ({
    stahni: async (u) => {
      const s = String(u);
      if (s.includes('/robots.txt')) {
        return { ok: true, status: 200, headers: { get: () => 'text/plain' },
          text: async () => 'User-agent: *\nAllow: /\n' };
      }
      if (s.includes('takova-cesta-tu-neni')) {
        return { ok: true, status: 404, headers: { get: () => 'text/html' },
          text: async () => '<html><body>Nenalezeno</body></html>' };
      }
      return { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => HTML };
    },
    ua: 'zkouska', smimeCist: async () => ({ dovoleno: true }), mezipamet: new Map(),
    zeSitemapy, zRss,
    cti: () => ({ nabidky: [nabidka], cesta }),
  });

  /* Přesně ten změřený tvar: cena a výměra ano, místo a kategorie ne. */
  const bezKotvy = { cena: 31680000, vymera: 3013, url: 'https://drazebnik.test/aukce/areal' };
  const v1 = await Z.zkusPortal({ host: 'drazebnik.test', jmeno: 'Dražebník', url: 'https://drazebnik.test/' },
    bot(bezKotvy, 'signál'), { strop: 4 });
  const c1 = (v1.cesty || []).find((c) => c.nabidek > 0);
  je('nabídky jen ze signálů a bez místa nejsou „nabídky", ale „ke čtení"',
    c1 && c1.verdikt, 'ke čtení');
  pravda('a v odůvodnění stojí, že čísla nemusí patřit k sobě',
    !!c1 && c1.nabidkyBezKotvy === true && /nemusí patřit k sobě/.test(c1.proc || '')
    && /BEZ místa/.test(c1.proc || ''), JSON.stringify(c1 && { v: c1.verdikt, proc: c1.proc }));

  /* OBRÁCENĚ: s místem a kategorií je to nález jako každý jiný —
     pravidlo netrestá slabou cestu čtení, trestá nabídku, která se
     nemá čím ukotvit. */
  const sKotvou = { cena: 1200000, vymera: 4500, misto: 'Lhota', okres: 'Kolín',
    druh: 'orná půda', kat: 'pozemek', url: 'https://poctivy2.test/1' };
  const v2 = await Z.zkusPortal({ host: 'poctivy2.test', jmeno: 'Poctivý 2', url: 'https://poctivy2.test/' },
    bot(sKotvou, 'signál'), { strop: 4 });
  const c2 = (v2.cesty || []).find((c) => c.nabidek > 0);
  je('tatáž slabá cesta čtení, ale s místem a kategorií, nálezem JE',
    c2 && c2.verdikt, 'nabídky');

  /* A silná cesta čtení (JSON-LD) se neposuzuje podle místa vůbec:
     tam, kde web sám říká, co je co, se nehádá. */
  const v3 = await Z.zkusPortal({ host: 'strojovy.test', jmeno: 'Strojový', url: 'https://strojovy.test/' },
    bot(bezKotvy, 'json-ld'), { strop: 4 });
  const c3 = (v3.cesty || []).find((c) => c.nabidek > 0);
  je('u strojové cesty čtení pravidlo nesahá na nic', c3 && c3.verdikt, 'nabídky');
}

/* ---- 3) SPOJOVÁNÍ PORTÁLŮ: KATALOG → SADA → SOUBOR ------------ */
{
  const zKatalogu = C.dalsiCesty({ tvar: 'JSONLD', telo: KATALOG });
  je('z katalogu vede osm datových sad', zKatalogu.length, 8);
  je('a jsou to adresy sad', zKatalogu[0].adresa,
    'https://api.opendata.mmhk.cz/lod/catalog/815e142e-f2e8-4327-97e0-575939934d90');
  const zeSady = C.dalsiCesty({ tvar: 'JSON', telo: SADA_SE_SOUBOREM });
  pravda('ze sady vede soubor ke stažení',
    zeSady.some((x) => x.adresa === 'https://opendata.mmhk.cz/pozemky.csv'), JSON.stringify(zeSady));
  je('z PRÁZDNÉ distribuce nevede nic (tak ta sada opravdu přišla)',
    C.dalsiCesty({ tvar: 'JSON', telo: SADA_PRAZDNA }).length, 0);
  const zeSitemapyVen = C.dalsiCesty({ tvar: 'SITEMAP', telo: SITEMAPA },
    { zeSitemapy, vzor: /pozemk|prodej/i });
  pravda('ze sitemapy vedou jen adresy, které vypadají na pozemky',
    zeSitemapyVen.length === 2 && !zeSitemapyVen.some((x) => /o-nas/.test(x.adresa)),
    JSON.stringify(zeSitemapyVen.map((x) => x.adresa)));
  const zRssVen = C.dalsiCesty({ tvar: 'RSS',
    telo: '<rss><channel><item><link>https://a.cz/1</link></item></channel></rss>' }, { zRss });
  je('a z RSS adresy nabídek', zRssVen.length, 1);
  je('strop na spojené cesty platí',
    C.dalsiCesty({ tvar: 'JSONLD', telo: KATALOG }, { strop: 3 }).length, 3);
  je('bez těla se nespojuje nic', C.dalsiCesty({ tvar: 'JSONLD', telo: '' }).length, 0);
}

/* ---- 4) ADRESY K VYZKOUŠENÍ ----------------------------------- */
{
  const c = C.cestyProPortal('https://www.vls.cz/cs/pro-obchodni-partnery/prodej',
    { sitemapy: ['https://www.vls.cz/sitemap_cs.xml'] });
  je('první je vstupní adresa od člověka', c[0].adresa,
    'https://www.vls.cz/cs/pro-obchodni-partnery/prodej');
  je('druhá je sitemapa, kterou web sám přiznal', c[1].adresa, 'https://www.vls.cz/sitemap_cs.xml');
  pravda('cesty se lepí na ORIGIN, ne na celou adresu',
    c.some((x) => x.adresa === 'https://www.vls.cz/lod/catalog')
      && !c.some((x) => /prodej\/lod/.test(x.adresa)),
    'jinak by vznikaly nesmysly jako /cs/prodej/sitemap.xml');
  je('žádná adresa se neopakuje', c.length, new Set(c.map((x) => x.adresa)).size);
  je('strop platí', C.cestyProPortal('https://a.cz/', { strop: 5 }).length, 5);
  je('z nesmyslné adresy nic', C.cestyProPortal('tohle není adresa'), []);
  /* POČET ZMĚŘENÝCH A ZKOUŠENÝCH — to je ten rozdíl, který se nesmí
     slévat: „zkusili jsme deset cest" není „deset cest tam je". */
  const p = C.pocetZmerenych();
  pravda('katalog ví, které tvary jsou změřené a které se zkoušejí',
    p.zmereno > 0 && p.zkousi > 0 && p.zmereno + p.zkousi === C.CESTY.length,
    JSON.stringify(p));
  pravda('a každý tvar má jméno i skupinu',
    C.CESTY.every((x) => x.jmeno && x.skupina && x.cesta));
}

/* ---- 5) SITEMAPY Z ROBOTS.TXT --------------------------------- */
{
  je('ze skutečného robots.txt státu se vytáhne jeho sitemapa',
    Z.sitemapyZRobots(ROBOTS_STATU), ['https://data.gov.cz/sitemap.xml']);
  je('dvě sitemapy se vytáhnou obě',
    Z.sitemapyZRobots('Sitemap: https://a.cz/1.xml\nSitemap: https://a.cz/2.xml').length, 2);
  je('bez sitemapy prázdno', Z.sitemapyZRobots('User-agent: *\nDisallow: /'), []);
}

/* ---- 6) KOHO ZKOUŠET ------------------------------------------ */
{
  const cile = Z.cileZkouseni({ nalezene: [] });
  const hosty = cile.map((x) => x.host);
  pravda('zkoušejí se kandidáti z registru', hosty.includes('vls.cz'), JSON.stringify(hosty));
  pravda('ale NE ti, které už pokrývá jiný zdroj (Lesy ČR, Správa železnic)',
    !hosty.includes('lesycr.cz') && !hosty.includes('spravazeleznic.cz'),
    'byl by to týž majetek podruhé: ' + JSON.stringify(hosty));
  pravda('a NE zapojené zdroje — na ty se chodí čtyřikrát denně',
    !hosty.includes('nabidkamajetku.gov.cz') && !hosty.includes('bezrealitky.cz'),
    JSON.stringify(hosty));
  /* A TOTÉŽ U NÁLEZU HLEDÁNÍ. Hledání klidně najde hostitele, kterého
     už čteme: ÚZSVM je v katalozích otevřených dat vedené taky. Druhá
     slepá větev by znamenala bušit na vlastní zdroj. */
  const sZapojenym = Z.cileZkouseni({ nalezene: [
    { host: 'bezrealitky.cz', adresa: 'https://www.bezrealitky.cz/' },
    { host: 'nabidkamajetku.gov.cz', adresa: 'https://nabidkamajetku.gov.cz/' },
  ] }).map((x) => x.host);
  pravda('zapojený zdroj se nezkouší, ani když ho hledání najde',
    !sZapojenym.includes('bezrealitky.cz') && !sZapojenym.includes('nabidkamajetku.gov.cz'),
    JSON.stringify(sZapojenym));
  const sNalezem = Z.cileZkouseni({ nalezene: [{ host: 'opendata.plzen.eu', adresa: 'https://opendata.plzen.eu/x' }] });
  pravda('přidají se i hostitelé z nálezu hledání',
    sNalezem.some((x) => x.host === 'opendata.plzen.eu'));
  const zPrikazu = Z.cileZkouseni({ argv: ['https://www.example.gov.cz/'], nalezene: [{ host: 'a.cz' }] });
  je('když člověk řekne adresu, zkouší se jen ta', zPrikazu.length, 1);
  je('a je to ta jeho', zPrikazu[0].host, 'example.gov.cz');
}

/* ---- 7) ŘÁDEK DO REGISTRU — A ŽE HO BOT NEZAPOJÍ ------------- */
{
  const nalez = { verdikt: 'nabídky', adresa: 'https://www.vls.cz/cs/prodej.csv',
    jmeno: 'Sitemapa', nabidek: 7, tvar: 'CSV' };
  const r = C.radekDoRegistru(nalez, { jmeno: 'Vojenské lesy a statky' });
  pravda('řádek nese jméno, hosta i adresu',
    /jmeno: 'Vojenské lesy a statky'/.test(r) && /host: 'vls\.cz'/.test(r)
      && /url: 'https:\/\/www\.vls\.cz\/cs\/prodej\.csv'/.test(r), r);
  pravda('a přiznává, že podmínky užití nikdo nečetl',
    /Podmínky užití ještě nikdo nečetl/.test(r), r);
  /* POZOR, TADY JSEM SI JEDNOU SÁM NASTAVIL SLEPÉ MÍSTO. Nejdřív tu
     stálo `radekDoRegistru({ verdikt: 'slibná' })` BEZ adresy — a to
     vrátí prázdno i tehdy, když se podmínka na verdikt odstraní,
     protože bez adresy spadne `new URL`. Sabotáž prošla zeleně.
     Fixtura proto musí mít adresu i počet: ať o výsledku rozhoduje
     verdikt, ne chybějící pole. */
  je('ze slibné cesty se řádek nedělá',
    C.radekDoRegistru({ verdikt: 'slibná', adresa: 'https://a.cz/x', jmeno: 'API', nabidek: 0, tvar: 'JSON' }), '');
  je('ani z cesty, která jen odpověděla',
    C.radekDoRegistru({ verdikt: 'odpověděla', adresa: 'https://a.cz/x', jmeno: 'API', nabidek: 0, tvar: 'HTML' }), '');
  je('ani z ničeho', C.radekDoRegistru(null), '');
}

/* ---- 8) ŘAZENÍ: NABÍDKY NAHORU -------------------------------- */
{
  const nalezy = [
    { adresa: 'a', verdikt: 'zavřená' },
    { adresa: 'b', verdikt: 'nabídky', nabidek: 2 },
    { adresa: 'c', verdikt: 'odpověděla' },
    { adresa: 'd', verdikt: 'nabídky', nabidek: 9 },
    { adresa: 'e', verdikt: 'slibná' },
  ];
  je('nejdřív nabídky (a od nejvíc), pak slibné, pak zbytek',
    C.poradiCest(nalezy).map((x) => x.adresa), ['d', 'b', 'e', 'c', 'a']);
}

/* ---- 9) CO SE DRŽÍ V KÓDU ------------------------------------ */
{
  const telo = readFileSync(new URL('./zkus-portal.mjs', import.meta.url), 'utf8');
  pravda('robots.txt se čte u KAŽDÉ cesty, ne jen u portálu',
    /const smime = await smimeCist\(cesta\.adresa/.test(telo)
      || /smimeCist\(cesta\.adresa/.test(telo),
    'zákaz platí pro každou adresu zvlášť');
  pravda('zákaz je konec, ne překážka',
    /if \(!smime\.dovoleno\)/.test(telo) && /verdiktCesty\(\{ dovoleno: false \}\)/.test(telo));
  pravda('Crawl-delay se respektuje', /smime\.delay/.test(telo));
  pravda('mezi dotazy je pauza', /await pauza\(PAUZA_MS\)/.test(telo));
  pravda('pauza je kladné číslo', typeof Z.PAUZA_MS === 'number' && Z.PAUZA_MS > 0, String(Z.PAUZA_MS));
  pravda('strop na portál i rozpočet běhu existují',
    Z.STROP_DOTAZU_NA_PORTAL > 0 && Z.STROP_DOTAZU_CELKEM > Z.STROP_DOTAZU_NA_PORTAL,
    `${Z.STROP_DOTAZU_NA_PORTAL} / ${Z.STROP_DOTAZU_CELKEM}`);
  pravda('a rozpočet se v běhu opravdu kontroluje',
    /dotazuCelkem >= STROP_DOTAZU_CELKEM/.test(telo));
  pravda('jedno jméno robota — žádné střídání hlaviček',
    /'user-agent': ua/.test(telo) && !/user-agents|rotac|Mozilla\/5/.test(telo),
    'obcházení ochran proti robotům se tu nedělá');
  pravda('bot do registru zdrojů NEZAPISUJE',
    !/writeFileSync\([^)]*zdroje-kandidati/.test(telo)
      && !/zdroje-kandidati\.mjs['"]\s*,\s*['"]w/.test(telo),
    'zapojení zdroje je rozhodnutí člověka po přečtení podmínek');
  /* Hledá se v TĚLE main(), ne v celém souboru: `writeFileSync` stojí
     i v importu na prvním řádku a kontrola by prošla vždycky. */
  const hlavni = telo.slice(telo.indexOf('async function main()'));
  pravda('bez --zapis se nezapisuje nic',
    hlavni.indexOf("includes('--zapis')") < hlavni.indexOf('writeFileSync')
      && /if \(!zapsat\)/.test(hlavni), 'zapsat se smí jen na požádání');
  pravda('tělo odpovědi se do nálezu neukládá',
    /delete nalez\.telo/.test(telo), 'jinak by z nálezu byly megabajty');
  pravda('a je strop na délku čteného těla',
    /STROP_TELA/.test(telo) && Z.STROP_TELA > 0, String(Z.STROP_TELA));
}

/* ---- ZMĚŘENĚ ZAVŘENÝ PORTÁL SE NEZKOUŠÍ ZNOVU ----
 *
 * Naměřeno 4. 11.: Portál dražeb vydá výpis jen vlastnímu sezení
 * (HTTP 424, `error_channel: "csrf"`). Jeho 38 cest tedy nemá smysl
 * zkoušet každé pondělí znovu — je to 38 dotazů na cizí web za nic
 * a šetrnost je tu pravidlo, ne přání.
 *
 * Hlídá se obojí: že zavřený vypadne, a že se tím nedá vypnout
 * portál, u kterého důvod zapsaný NENÍ.
 */
{
  const kand = [
    { jmeno: 'Zavřený', host: 'zavreny.cz', url: 'https://zavreny.cz/', zavreno: 'CSRF (změřeno)' },
    { jmeno: 'Otevřený', host: 'otevreny.cz', url: 'https://otevreny.cz/' },
  ];
  const c = Z.cileZkouseni({ kandidati: kand, nalezene: [], zapojene: [] });
  je('změřeně zavřený portál se nezkouší', c.map((x) => x.host), ['otevreny.cz']);
  /* A KDYŽ TO ČLOVĚK ŘEKNE ADRESOU, ZKOUŠÍ SE PŘESTO. Zavřeno je nález,
     ne zámek — kdyby se cizí web zítra otevřel, musí jít změřit. */
  const r = Z.cileZkouseni({ argv: ['https://zavreny.cz/'], kandidati: kand });
  je('ale na přímý příkaz se zkusí i zavřený', r.map((x) => x.host), ['zavreny.cz']);
  /* A ŽE TO V REGISTRU OPRAVDU STOJÍ, VČETNĚ DŮVODU. */
  const K = KANDIDATI || [];
  const pd = K.find((x) => String(x.host) === 'portaldrazeb.cz');
  pravda('Portál dražeb je v registru zapsaný jako zavřený', !!(pd && pd.zavreno),
    JSON.stringify(pd && { host: pd.host, zavreno: pd.zavreno }));
  pravda('a nese důvod, ne jen příznak',
    !!(pd && String(pd.zavreno).length > 20), String(pd && pd.zavreno));
}

/* ---- HLÁŠENÍ O PORTÁLU ------------------------------------------
 *
 * Sabotáž „zahozená pojistka" zabrousila do `hlaseniPortalu` a ukázala
 * dvojí: (1) výpis cest se bez té pojistky zaplaví zavřenými, takže
 * v něm to podstatné zmizí, a (2) — a to je vada, kterou jsem dnes sám
 * vyrobil — souhrnný řádek počítal jen čtyři verdikty, takže po přidání
 * „chce klíč" by hlásil „zkoušeno 40 cest" a rozpad by jich jmenoval
 * 39. Rozpad se proto skládá z PORADI_VERDIKTU, ne z ručního seznamu.
 */
{
  const portal = { host: 'priklad.cz', cesty: [
    { adresa: 'https://priklad.cz/a', jmeno: 'výpis', verdikt: 'nabídky', nabidek: 5, proc: 'přečteno 5' },
    { adresa: 'https://priklad.cz/b', jmeno: 'api', verdikt: 'chce klíč', proc: 'HTTP 401, …klíč…' },
    { adresa: 'https://priklad.cz/c', jmeno: 'sitemapa', verdikt: 'odpověděla', proc: 'o pozemcích ani slovo' },
    { adresa: 'https://priklad.cz/d', jmeno: 'rss', verdikt: 'zavřená', proc: 'HTTP 404' },
  ] };
  const h = C.hlaseniPortalu(portal).join('\n');
  pravda('souhrn počítá i „chtějí klíč"', /cht[ěe]j[íi] kl[íi][čc] 1/.test(h), h);
  pravda('a rozpad sečte přesně tolik cest, kolik se zkoušelo',
    C.PORADI_VERDIKTU.reduce((a, v) => a + (portal.cesty.filter((c) => c.verdikt === v).length), 0)
      === portal.cesty.length,
    'některý verdikt v rozpadu chybí — hlášení by si odporovalo samo');
  pravda('a každý verdikt, který stroj umí vydat, má v rozpadu jméno',
    C.PORADI_VERDIKTU.every((v) => C.JMENA_ROZPADU[v]), JSON.stringify(C.JMENA_ROZPADU));
  /* VÝPIS CEST: podstatné ano, zavřené a mlčící ne. */
  pravda('ve výpisu je cesta s nabídkami', /výpis/.test(h), h);
  pravda('a cesta, která chce klíč', /api/.test(h), h);
  pravda('ale zavřená se nevypisuje', !/rss/.test(h), h);
  pravda('ani ta, co odpověděla a nic neřekla', !/sitemapa/.test(h), h);
}

/* ---- ČTYŘI SLEPÁ MÍSTA, KTERÁ UKÁZAL STROJ -----------------------
 *
 * Sabotážní stroj 4. 11. prošel oba moduly bota a tyhle čtyři mutace
 * zkouška nechytila. Všechny čtyři jsou věcné, ne formální:
 */
{
  /* 1) PAUZA MEZI DOTAZY NA CIZÍ SERVER. Posunutá konstanta prošla bez
        povšimnutí — a kdyby ta pauza tiše vypadla, bot by cizí web
        tloukl tak rychle, jak stačí síť. Je to zdvořilost, ne výkon. */
  je('mezi dotazy na týž portál se čeká 400 ms', Z.PAUZA_MS, 400);
  pravda('a čeká se opravdu mezi cestami, ne jen jednou na začátku',
    /await pauza\(PAUZA_MS\)/.test(readFileSync(new URL('./zkus-portal.mjs', import.meta.url), 'utf8')),
    'pauza v kódu není tam, kde se chodí z cesty na cestu');

  /* 2) „ZMĚŘENO" JE ZNÁMKA POCTIVOSTI, NE OZDOBA. Tvary adres, které
        jsme opravdu viděli fungovat, se v hlášení odlišují od těch
        z normy. Obrácená rovnost tu značku překlopí všem naráz —
        a hlášení by pak tvrdilo „změřeno" o něčem, co nikdo neviděl. */
  const cesty = C.cestyProPortal('https://priklad.cz/');
  const vstup = cesty.find((c) => c.skupina === 'vstup');
  pravda('vstupní adresa je značená jako změřená', !!vstup && vstup.zmereno === true,
    JSON.stringify(vstup));
  pravda('a je mezi cestami i nějaká NEzměřená (jinak se značka nerozlišuje)',
    cesty.some((c) => c.zmereno === false),
    'všechny cesty mají zmereno === true — značka by nic neříkala');
  pravda('a žádná nemá místo pravdy/nepravdy něco jiného',
    cesty.every((c) => c.zmereno === true || c.zmereno === false),
    JSON.stringify(cesty.map((c) => c.zmereno)));

  /* 3) OBYČEJNÝ TEXT NENÍ CSV. Podmínka „první řádek má aspoň tři
        sloupce A všechny řádky stejně" se po záměně && za || splní i
        pro tři řádky prózy (každý „jeden sloupec", všechny stejně) —
        a bot by na ni pustil čtečku tabulek. */
  je('tři řádky prózy nejsou CSV', C.tvarOdpovedi('text/plain', 'jeden\ndva\ntři'), 'TEXT');
  je('a opravdové CSV se pozná', C.tvarOdpovedi('text/plain', 'a;b;c\n1;2;3\n4;5;6'), 'CSV');
  je('a dva sloupce na to nestačí', C.tvarOdpovedi('text/plain', 'a;b\n1;2\n3;4'), 'TEXT');

  /* 4) CIZÍ KATALOG BÝVÁ ROZBITÝ. V poli `distribuce` se našla i
        prázdná položka; bez pojistky `if (!d) continue` na ní bot
        spadne na „null nemá soubor_ke_stažení" — a s ním celý běh. */
  const rozbity = C.dalsiCesty({ tvar: 'JSON', telo: JSON.stringify({
    distribuce: [null, { 'soubor_ke_stažení': 'https://priklad.cz/data.csv' }],
  }) });
  pravda('prázdná položka v katalogu běh nezastaví', Array.isArray(rozbity), JSON.stringify(rozbity));
  pravda('a ta dobrá se přesto najde',
    rozbity.some((x) => String(x.adresa).endsWith('/data.csv')), JSON.stringify(rozbity));
}

/* ---- JEDNA CESTA, BEZ SÍTĚ ---------------------------------------
 *
 * Sabotážní stroj našel 4. 11. dvě slepá místa: `zkusCestu` nikdo
 * nezkoušel (nebyla ani vyvezená), takže v ní prošla obrácená rovnost
 * u tvaru odpovědi i `&&` zaměněné za `||` v podmínce čtení. Obojí
 * přitom jde změřit bez sítě — stačí podstrčit `stahni` a `cti`.
 *
 * A je to podstatné, ne formalita: právě tady se rozhoduje, jestli
 * cesta dostane verdikt „nabídky" (tedy jestli ji bot nabídne
 * k zapojení), nebo jen „slibná".
 */
{
  const odpoved = (typ, telo, stav = 200) => ({
    status: stav, headers: { get: () => typ }, text: async () => telo,
  });
  const pomucky = (typ, telo, cti, stav) => ({
    stahni: async () => odpoved(typ, telo, stav),
    ua: 'zkouska',
    smimeCist: async () => ({ dovoleno: true }),
    mezipamet: new Map(),
    cti,
  });
  const ctecka = () => ({ nabidky: [{ a: 1 }, { a: 2 }, { a: 3 }], cesta: 'podstrčená' });
  const cesta = { adresa: 'https://priklad.cz/vypis', jmeno: 'výpis', skupina: 'vypis' };

  const html = await Z.zkusCestu(cesta, pomucky('text/html', '<html>pozemek na prodej</html>', ctecka));
  je('z HTML se nabídky přečtou', html.nabidek, 3);
  je('a cesta má verdikt „nabídky"', html.verdikt, 'nabídky');
  je('a pamatuje si, kudy se to přečetlo', html.cestaCteni, 'podstrčená');
  const json = await Z.zkusCestu(cesta, pomucky('application/json', '{"a":1}', ctecka));
  je('z JSON taky', json.nabidek, 3);
  /* A TEĎ TA DRUHÁ STRANA: tvar, který se číst nemá, se nečte —
     ani když je čtečka po ruce a ráda by něco vrátila. */
  const pdf = await Z.zkusCestu(cesta, pomucky('application/pdf', '%PDF-1.4 pozemek', ctecka));
  je('PDF se nečte, i když je čtečka po ruce', pdf.nabidek, 0);
  pravda('a verdikt tedy není „nabídky"', pdf.verdikt !== 'nabídky', pdf.verdikt);
  /* Bez čtečky se nečte nic a nespadne to. */
  /* MĚŘENÍ OBSAHU SE MUSÍ DOSTAT DO NÁLEZU — a jen tam, kde má.
     Hlídat samotnou funkci znakyOdpovedi() nestačí: kdyby ji
     zkusCestu() přestal volat, funkce zůstane v pořádku a nález bude
     prázdný (táž slepota jako v oddílu 423 — hlídač měřil nástroj,
     ne jeho použití). */
  const keCteniNalez = await Z.zkusCestu(cesta, pomucky('text/html',
    '<html><head><title>Aktuální nabídka</title></head><body>'
    + '<h1>Prodej nepotřebného majetku</h1><p>Pozemek p. č. 1, k. ú. Brno,'
    + ' 300 m2, 90 000 Kč.</p></body></html>', null));
  je('HTML s nabídkami, které se nedají přečíst, je „ke čtení"', keCteniNalez.verdikt, 'ke čtení');
  pravda('a nález si nese měření obsahu', !!keCteniNalez.znaky
    && keCteniNalez.znaky.titulek === 'Aktuální nabídka'
    && keCteniNalez.znaky.pocty['cena'] === 1,
    JSON.stringify(keCteniNalez.znaky));
  const nudnaNalez = await Z.zkusCestu(cesta, pomucky('text/html',
    '<html><body>Kalendář akcí</body></html>', null));
  je('nezajímavá stránka zůstává „odpověděla"', nudnaNalez.verdikt, 'odpověděla');
  pravda('a měření se k ní nepřilepí (byl by to jen šum)', !nudnaNalez.znaky,
    JSON.stringify(nudnaNalez.znaky || null));

  const bez = await Z.zkusCestu(cesta, pomucky('text/html', '<html>pozemek na prodej</html>', null));
  je('bez čtečky zůstane nula nabídek', bez.nabidek, 0);
  pravda('a stejně se to nerozsype', !!bez.verdikt, JSON.stringify(bez));
  /* A zakázaný robots se ani nestahuje. */
  let stahovano = 0;
  const zakazano = await Z.zkusCestu(cesta, {
    stahni: async () => { stahovano++; return odpoved('text/html', 'x'); },
    ua: 'zkouska', mezipamet: new Map(), cti: ctecka,
    smimeCist: async () => ({ dovoleno: false, duvod: 'robots.txt: Disallow: /' }),
  });
  je('zakázaná cesta je zavřená', zakazano.verdikt, 'zavřená');
  /* A KDYŽ SE ROBOTS NEPODAŘÍ PŘEČÍST VŮBEC: taky zavřeno (nečte se
     nic, dokud není dovoleno), a v důvodu je ta hláška ČITELNĚ —
     ne jako „Error: …". Sabotážní stroj tuhle kontrolu vynutil:
     `String((e && e.message) || e)` s `&&` zaměněným za `||` vrátí celý
     objekt chyby, takže se do hlášení dostane „Error: " a zabere
     místo, kterého je v něm šedesát znaků. */
  const rozbity = await Z.zkusCestu(cesta, {
    stahni: async () => odpoved('text/html', 'x'), ua: 'zkouska',
    mezipamet: new Map(), cti: ctecka,
    smimeCist: async () => { throw new Error('spojení vypršelo'); },
  });
  je('nepřečtený robots je taky zavřeno', rozbity.verdikt, 'zavřená');
  pravda('a důvod to říká lidsky, bez „Error:"',
    /robots\.txt nešel přečíst: spojení vypršelo/.test(rozbity.proc || '')
    && !/Error:/.test(rozbity.proc || ''), rozbity.proc);
  je('a nestáhlo se z ní nic', stahovano, 0);
  pravda('a důvod je ten, který řekl robots', /Disallow/.test(zakazano.proc || ''), zakazano.proc);
}

/* ---- OTEVŘENO, ALE CHCE KLÍČ ------------------------------------
 *
 * Naměřeno 4. 11. na eDeskách: `/api/v1/documents` odpoví HTTP 401 a
 * v těle „Chyba: nepřihlášen. Použijte svůj API klíč, který najdete
 * pro přihlášení na edesky.cz/uzivatel/edit". Bot to hlásil jako
 * „zavřená" — stejně jako zakázaný robots nebo mrtvý host — a tím ten
 * nález pohřbil mezi beznadějnými. Přitom je to nejslibnější druh:
 * cesta je otevřená a popsaná, jen si majitel musí zařídit klíč.
 *
 * Hlídá se obojí: že to bot pozná, a že se tím NEDÁ obejít odmítnutý
 * přístup — čtyřstovka bez řeči o klíči zůstává zavřená.
 */
{
  const teloEdesky = 'Chyba: nepřihlášen. Použijte svůj API klíč, který najdete'
    + ' pro přihlášení na https://edesky.cz/uzivatel/edit';
  const k = C.verdiktCesty({ dovoleno: true, stav: 401, typ: 'text/html', telo: teloEdesky });
  je('401 se slovy o klíči není „zavřená"', k.verdikt, 'chce klíč');
  pravda('a důvod cituje, co ta služba sama napsala', /API kl[íi]č/.test(k.proc || ''), k.proc);
  je('a 403 se slovy o přihlášení taky',
    C.verdiktCesty({ dovoleno: true, stav: 403, typ: 'application/json',
      telo: '{"error":"unauthorized, sign in first"}' }).verdikt, 'chce klíč');
  /* A TEĎ TA DRUHÁ STRANA — ŽÁDNÝ VYPÍNAČ NA ODMÍTNUTÝ PŘÍSTUP. */
  je('holé „Forbidden" zůstává zavřené',
    C.verdiktCesty({ dovoleno: true, stav: 403, typ: 'text/html', telo: 'Forbidden' }).verdikt,
    'zavřená');
  je('404 se slovem „přihlášení" v patičce taky',
    C.verdiktCesty({ dovoleno: true, stav: 404, typ: 'text/html',
      telo: '<html>Nenalezeno. <a href="/prihlaseni">Přihlášení</a></html>' }).verdikt,
    'zavřená');
  je('a zakázaný robots zůstává zavřený, i kdyby tělo o klíči mluvilo',
    C.verdiktCesty({ dovoleno: false, stav: 401, telo: teloEdesky }).verdikt, 'zavřená');
  /* POŘADÍ: nesmí spadnout na konec k zavřeným, jinak si jí nikdo
     nevšimne. */
  const por = C.PORADI_VERDIKTU;
  pravda('„chce klíč" stojí před „odpověděla" i před „zavřená"',
    por.indexOf('chce klíč') > -1
    && por.indexOf('chce klíč') < por.indexOf('odpověděla')
    && por.indexOf('chce klíč') < por.indexOf('zavřená'), por.join(' > '));
  /* A VYSTUPUJE ČLOVĚKU NAHORU, ne jedním řádkem mezi stovkou cest. */
  const stul = Z.naStulMajiteli([{ host: 'edesky.cz', jmeno: 'eDesky', cesty: [
    { adresa: 'https://edesky.cz/api/v1/documents', verdikt: 'chce klíč', proc: 'HTTP 401, …klíč…' },
    { adresa: 'https://edesky.cz/neco', verdikt: 'zavřená', proc: 'HTTP 404' },
  ] }]);
  je('na stůl majiteli se dostane právě ta jedna cesta', stul.length, 1);
  je('a je to ta s klíčem', stul[0].adresa, 'https://edesky.cz/api/v1/documents');
  je('portál bez takové cesty na stůl nic nedává',
    Z.naStulMajiteli([{ host: 'a.cz', cesty: [{ adresa: 'x', verdikt: 'zavřená' }] }]).length, 0);
  /* A BOT ZA TU 401 NELEZE DÁL: za tímtéž klíčem leží i cesty dál. */
  const kodB = readFileSync(new URL('./zkus-portal.mjs', import.meta.url), 'utf8');
  pravda('bot se za „chce klíč" dál nevrtá',
    /verdikt === 'chce klíč'\) continue;/.test(kodB),
    'jinak by jen opakoval tutéž 401 na každé další cestě');
}

console.log('Zkoušení portálů — všechny cesty a spojení dál');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) console.error(`::error::Zkoušení portálů: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`);
process.exit(chyb ? 1 : 0);
