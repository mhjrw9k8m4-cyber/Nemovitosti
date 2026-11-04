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

console.log('Zkoušení portálů — všechny cesty a spojení dál');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) console.error(`::error::Zkoušení portálů: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`);
process.exit(chyb ? 1 : 0);
