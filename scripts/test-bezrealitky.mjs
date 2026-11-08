// Test: čtení Bezrealitek POVOLENOU cestou (sitemapa + detail inzerátu).
//
// Spuštění: node scripts/test-bezrealitky.mjs   (nepotřebuje prohlížeč ani síť)
//
// PROČ TAHLE ZKOUŠKA VŮBEC JE. Do 8. 11. 2026 robot čet Bezrealitky
// z `api.bezrealitky.cz/graphql/`. Změřeno toho dne přes Actions (běh
// 42486637143): ten hostitel má v robots.txt `Disallow: /`, tedy zákaz
// pro všechny roboty. Zdroj dělá 81 % obsahu webu (3 161 z 3 886
// nabídek), takže ho nešlo jen vypnout — čtení se přesunulo na cestu,
// kterou web sám nabízí: `Sitemap:` v robots.txt, pět
// `sitemap_detail_*.xml`, a cena z HTML detailu.
//
// Z prostředí, kde se to psalo, je bezrealitky.cz nedostupné (proxy),
// takže naostro to vyzkoušet nešlo. Jediná cesta je dát funkcím
// doslovné úryvky toho, co se v Actions naměřilo — stejně jako
// u dražeb (scripts/test-drazby-cevd.mjs) a u místa inzerátu
// (scripts/test-misto-inzeratu.mjs). Úryvky níž jsou přepisy měření,
// ne vymyšlený tvar.
import {
  brSitemapyDetailu, brInzeratyZeSitemapy, brVymeraZPopisku,
  brCenaZDetailu, brPopisZDetailu, brMistaZDrivejsich, brXmlText,
} from './fetch-opportunities.mjs';
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0; const zpravy = [];
function je(popis, vyslo, cekano) {
  if (JSON.stringify(vyslo) === JSON.stringify(cekano)) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${JSON.stringify(cekano)}, vyšlo ${JSON.stringify(vyslo)}`); }
}
function pravda(popis, podminka, detail) {
  if (podminka) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

/* --- 1. ROZCESTNÍK SITEMAP ------------------------------------------
   Doslovný přepis měření (běh 42486437666): rozcestník nese osm sitemap
   a jen pět z nich jsou inzeráty. `sitemap_web_1`, `sitemap_blog_1`
   a `sitemap_list_1` jsou stránky webu, články a rozcestníky lokalit —
   kdyby se stahovaly jako inzeráty, robot by šel po stovkách adres,
   ve kterých žádná nabídka není. */
const ROZCESTNIK = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap>
            <loc>https://www.bezrealitky.cz/sitemap/sitemap_web_1.xml</loc>
        </sitemap><sitemap>
            <loc>https://www.bezrealitky.cz/sitemap/sitemap_blog_1.xml</loc>
        </sitemap><sitemap>
            <loc>https://www.bezrealitky.cz/sitemap/sitemap_detail_1.xml</loc>
        </sitemap><sitemap>
            <loc>https://www.bezrealitky.cz/sitemap/sitemap_detail_5.xml</loc>
        </sitemap><sitemap>
            <loc>https://www.bezrealitky.cz/sitemap/sitemap_list_1.xml</loc>
        </sitemap></sitemapindex>`;
je('z rozcestníku se berou jen sitemapy inzerátů', brSitemapyDetailu(ROZCESTNIK), [
  'https://www.bezrealitky.cz/sitemap/sitemap_detail_1.xml',
  'https://www.bezrealitky.cz/sitemap/sitemap_detail_5.xml',
]);
je('prázdný vstup nespadne', brSitemapyDetailu(''), []);

/* --- 2. INZERÁTY Z SITEMAPY -----------------------------------------
   Přepis měření (běh 42486521406). Tři uzly: prodej pozemku, NÁJEM
   bytu a prodej bytu. Nájem se nesmí dostat dál — web prodává, a dřív
   to zařizoval parametr dotazu (offerType: PRODEJ). Tady se to pozná
   z adresy: „-nabidka-prodej-" proti „-nabidka-pronajem-". */
const SITEMAPA = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.google.com/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><url><loc>https://www.bezrealitky.cz/nemovitosti-byty-domy/992722-nabidka-prodej-pozemku</loc><lastmod>2026-10-16</lastmod><image:image><image:loc>https://api.bezrealitky.cz/media/cache/record_main/data/images/advert/992k/992722/1771492223-apemncrjoq-baba-1.png</image:loc><image:caption>Prodej pozemku 6.336 m², </image:caption><image:title>Prodej pozemku 6.336 m², </image:title><image:geo_location>Benešov - Benešov u Prahy, Středočeský kraj</image:geo_location></image:image></url><url><loc>https://www.bezrealitky.cz/nemovitosti-byty-domy/1022351-nabidka-pronajem-bytu-horova-hradec-kralove</loc><lastmod>2026-11-08</lastmod><image:image><image:loc>https://api.bezrealitky.cz/x.jpeg</image:loc><image:caption>Pronájem bytu  45 m², Horova, Hradec Králové</image:caption><image:geo_location>Horova, Hradec Králové - Pražské Předměstí, Královéhradecký kraj</image:geo_location></image:image></url><url><loc>https://www.bezrealitky.cz/nemovitosti-byty-domy/1064089-nabidka-prodej-bytu-pripotocni-praha</loc><lastmod>2026-10-14</lastmod><image:image><image:loc>https://api.bezrealitky.cz/y.jpg</image:loc><image:caption>Prodej bytu 2+kk 67 m², Přípotoční, Praha</image:caption><image:geo_location>Přípotoční, Praha - Vršovice</image:geo_location></image:image></url></urlset>`;
const INZ = brInzeratyZeSitemapy(SITEMAPA);
je('ze tří uzlů projdou dva — nájem ne', INZ.map((a) => a.id), ['992722', '1064089']);
je('číslo inzerátu, adresa i datum změny', [INZ[0].id, INZ[0].lastmod, INZ[0].uri], [
  '992722', '2026-10-16', '992722-nabidka-prodej-pozemku',
]);
je('fotka se bere z uzlu obrázku',
  INZ[0].foto,
  'https://api.bezrealitky.cz/media/cache/record_main/data/images/advert/992k/992722/1771492223-apemncrjoq-baba-1.png');
je('adresa z geo_location je v témže tvaru, jaký vracelo API',
  INZ[0].geo, 'Benešov - Benešov u Prahy, Středočeský kraj');
je('popisek fotky nese typ a výměru', INZ[0].popisek, 'Prodej pozemku 6.336 m²,');
pravda('prázdná sitemapa dá prázdný seznam', brInzeratyZeSitemapy('<urlset></urlset>').length === 0);

/* --- 3. VÝMĚRA Z POPISKU -------------------------------------------
   TŘI PASTI, A VŠECHNY TŘI SE V DATECH UŽ JEDNOU ODEHRÁLY:
   · tečka v tisících („6.336 m²" je 6 336, ne 6);
   · desetinná tečka („135.8 m²" je 136, ne 8) — to je §462-třída, kvůli
     které visely byty na webu s jednociferným počtem metrů;
   · číslo, které výměra NENÍ („2+kk" u bytu nesmí vyhrát nad „67 m²"). */
je('tečka v tisících', brVymeraZPopisku('Prodej pozemku 6.336 m², Benešov'), 6336);
je('desetinná tečka se zaokrouhlí', brVymeraZPopisku('Prodej domu 135.8 m², Kdesi'), 136);
je('dispozice bytu není výměra', brVymeraZPopisku('Prodej bytu 2+kk 67 m², Praha'), 67);
je('mezera v tisících', brVymeraZPopisku('Prodej pozemku 12 500 m², Lhota'), 12500);
je('popisek bez metrů dá null', brVymeraZPopisku('Prodej pozemku, Benešov'), null);
je('a prázdný taky', brVymeraZPopisku(''), null);

/* --- 4. CENA Z DETAILU ---------------------------------------------
   Přepis textu stránky inzerátu 1076264 (běh 42486626263). Tři pasti
   pohromadě, přesně jak na té stránce stojí:
   · cena je v textu DVAKRÁT (stránka se vykresluje pro telefon i pro
     počítač);
   · je tam hypoteční věta „už od 146 Kč měsíčně" — menší číslo
     s „Kč", které cenou není;
   · a oddíl „Podobné nabídky" s cenami SOUSEDNÍCH nabídek, které by
     při čtení „první číslo s Kč" mohly vyhrát. */
const DETAIL = `<html><head><title>Prodej pozemku • 3732 m² • Veselí nad Lužnicí • bez RK | Bezrealitky</title></head><body>
<div>Výše hypotéky Kč Vlastní zdroje Kč Doba splácení let Zjistit více informací</div>
<div>V okolí nemovitosti najdete Vzdálenost k :</div>
<div>Cena 34 000 Kč</div><button>Požádat o prohlídku</button>
<p>Tato nemovitost již od 146 Kč měsíčně s roční úrokovou sazbou od 4,99 % .</p>
<section>Podobné nabídky jako tato nemovitost Prodej pozemku Záblatí - Záblatí u Ponědraže, Jihočeský kraj 1258 m² 29 000 Kč Prodej pozemku Záblatí 1258 m² 40 000 Kč</section>
<div>Cena 34 000 Kč</div>
<p>Tato nemovitost již od 146 Kč měsíčně s roční úrokovou sazbou od 4,99 % . U nás nakupujete přímo od vlastníka – bez prostředníků a bez zbytečných výdajů navíc! k.ú. Horusice LV č. 26, 25 a 159 o výměře 3772 m², podíl 1/66 • Parcela č. 2252/11 - o výměře 2780 m² (Ostatní plocha)</p>
<section>Stále hledáte to pravé? Nastavte si hlídacího psa.</section></body></html>`;
je('cena ze stránky detailu', brCenaZDetailu(DETAIL), 34000);
je('stránka bez ceny dá null', brCenaZDetailu('<html><body>Bez ceny</body></html>'), null);
/* „Cena za m²" je jiné číslo a nesmí se vzít jako cena nabídky. */
je('„Cena za m²" se nepočítá',
  brCenaZDetailu('<body>Cena za m² 1 200 Kč</body>'), null);

/* --- 5. POPIS OD INZERENTA -----------------------------------------
   Popis stojí za hypoteční větou a končí tam, kde začíná oddíl dalších
   nabídek. Hypoteční věta je na stránce DVAKRÁT a za první z nich popis
   není — proto se zkouší každý výskyt a bere se nejdelší výsledek.
   Kdyby se bral první, vyšel by prázdný text a web by u 3 161 nabídek
   nenesl ani slovo od toho, kdo pozemek zná. */
const POPIS = brPopisZDetailu(DETAIL);
pravda('popis začíná tím, co napsal inzerent',
  !!POPIS && POPIS.startsWith('U nás nakupujete přímo od vlastníka'), 'vyšlo: ' + POPIS);
pravda('a končí před oddílem s dalšími nabídkami',
  !!POPIS && POPIS.indexOf('Stále hledáte') < 0 && POPIS.indexOf('Podobné nabídky') < 0,
  'vyšlo: ' + POPIS);
pravda('parcela z popisu v něm zůstane',
  !!POPIS && POPIS.indexOf('Parcela č. 2252/11') > 0, 'vyšlo: ' + POPIS);
je('stránka bez popisu dá null',
  brPopisZDetailu('<body>Cena 1 000 Kč Podobné nabídky jako tato nemovitost</body>'), null);

/* --- 6. OBEC, OKRES A POLOHA Z DŘÍVĚJŠÍCH DAT ----------------------
   Na povolené cestě nejsou souřadnice (změřeno: v HTML detailu se vzor
   `4[89]\.[0-9]{3}|1[2-8]\.[0-9]{3}` nenašel ani jednou) a adresa nese
   KRAJ, ne okres. Obec se proto hledá ve dřívějších datech — a okres
   se bere ten, který u té obce vyšel nejčastěji ze skutečných hranic.
   Poloha je MEDIÁN, ne první nalezená: jedna nabídka s chybnou
   souřadnicí by jinak posunula celou obec. */
const MAPA = brMistaZDrivejsich([
  { place: 'Lhota', okres: 'Mělník', lat: 50.1, lng: 14.5 },
  { place: 'Lhota', okres: 'Mělník', lat: 50.2, lng: 14.6 },
  { place: 'Lhota', okres: 'Mělník', lat: 55.9, lng: 19.9 },
  { place: 'Lhota', okres: 'Kladno', lat: 50.1, lng: 14.1 },
  { place: 'Bez okresu', okres: '', lat: 1, lng: 1 },
]);
je('obec dostane svůj nejčastější okres', MAPA.get('lhota').okres, 'Mělník');
je('poloha obce je medián, ne průměr ani první hodnota',
  [MAPA.get('lhota').lat, MAPA.get('lhota').lng], [50.2, 14.6]);
pravda('nabídka bez okresu se do slovníku nedostane', !MAPA.has('bez okresu'));

/* --- 7. ENTITY A CDATA V XML ---------------------------------------- */
je('&amp; v adrese', brXmlText('https://x.cz/a?b=1&amp;c=2'), 'https://x.cz/a?b=1&c=2');
je('CDATA se odloupne', brXmlText('<![CDATA[Prodej pozemku]]>'), 'Prodej pozemku');

/* --- 8. ZAKÁZANÝ HOSTITEL SE UŽ NESTAHUJE --------------------------
   Tahle kontrola je na celou třídu vady, ne na jeden řádek: kdyby se
   kdokoli (včetně mě) vrátil k api.bezrealitky.cz, robot by znovu
   porušoval robots.txt toho webu — a nikdo by si toho nevšiml, protože
   data by zase přišla. Zmínka v KOMENTÁŘI je v pořádku a je potřeba
   (vysvětluje, proč se cesta změnila), takže se komentáře odečtou.
   Adresy fotek na tom hostiteli jsou taky v pořádku: ty se nestahují,
   jen se předávají prohlížeči návštěvníka — a ten robot není. */
{
  const zdroj = readFileSync(new URL('./fetch-opportunities.mjs', import.meta.url), 'utf8');
  const bezKomentaru = zdroj
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  pravda('robot nikde nestahuje z api.bezrealitky.cz',
    bezKomentaru.indexOf('api.bezrealitky.cz') < 0,
    'našlo se to v kódu, ne v komentáři');
  pravda('a čte sitemapu z www.bezrealitky.cz',
    bezKomentaru.indexOf('https://www.bezrealitky.cz/sitemap/sitemap.xml') > 0);
  /* ROBOTS.TXT SE ČTE PRVNÍ. Bez tohohle by stačilo vypustit jednu
     podmínku a robot by chodil i tam, kam nesmí. */
  const telo = zdroj.slice(zdroj.indexOf('async function fetchBezrealitky'));
  const prvniSmime = telo.indexOf('smimeCist(BR_SITEMAP');
  const prvniStahni = telo.indexOf('stahni(BR_SITEMAP');
  pravda('robots.txt se čte dřív než sitemapa',
    prvniSmime > 0 && prvniStahni > prvniSmime,
    `smimeCist na ${prvniSmime}, stahni na ${prvniStahni}`);
}

/* --- 9. ADRESA FOTKY TAM A ZPÁTKY ---------------------------------
   V datech stojí jen název souboru (pole `f`), adresu skládá js/fotka.js
   — jinak by 3 161 celých adres přidalo 410 kB do souboru, který si
   stahuje úvodní stránka. Pravidlo je tedy OBOUSTRANNÉ a musí se
   vracet: co robot rozloží, to web složí zpátky na totéž.
   Doslovná adresa z měření inzerátu 1076264 (běh 42486626263). */
{
  const FOTKA = (await import('../js/fotka.js')).default
    || (await import('../js/fotka.js'));
  const PLNA = 'https://api.bezrealitky.cz/media/cache/record_main/data/images/advert/'
    + '1076k/1076264/1076264-1792345838-foto-1.jpg';
  const zk = FOTKA.zkratka(PLNA, '1076264');
  je('z adresy se uloží jen název souboru', zk, '1076264-1792345838-foto-1.jpg');
  je('a složí se zpátky na tutéž adresu',
    FOTKA.url({ f: zk, url: 'https://www.bezrealitky.cz/nemovitosti-byty-domy/1076264-nabidka-prodej-pozemku-x' }),
    PLNA);
  /* Cizí hostitel ani jiná cesta se neuloží: uložit zkratku adresy,
     která nikam nevede, je horší než neuložit fotku. */
  je('cizí hostitel se neuloží', FOTKA.zkratka('https://zlo.example/x.jpg', '1076264'), null);
  je('cesta s jiným číslem inzerátu se neuloží',
    FOTKA.zkratka(PLNA, '999999'), null);
  /* Lomítko v názvu souboru by znamenalo cestu jinam — a tím pádem
     adresu, kterou jsme nesložili my. */
  je('název souboru s lomítkem se neuloží',
    FOTKA.zkratka('https://api.bezrealitky.cz/media/cache/record_main/data/images/advert/'
      + '1076k/1076264/../../zlo.jpg', '1076264'), null);
  je('nabídka bez fotky nedá adresu', FOTKA.url({ url: PLNA }), null);
  je('nabídka bez adresy inzerátu taky ne', FOTKA.url({ f: 'a.jpg' }), null);
}

/* --- 10. HOSTITEL FOTEK JE V CSP SERVÍROVANÝCH STRÁNEK -------------
   §436-třída: jméno hostitele je ve dvou místech, v js/fotka.js
   a v hlavičce CSP na každé stránce. Kdyby se rozešla, prohlížeč fotku
   zahodí a v konzoli bude „Refused to load the image" — na webu se to
   nepozná, karta jen zůstane prázdná. Měří se SERVÍROVANÁ stránka, ne
   zdroj scripts/csp.mjs: teprve ta stránka se posílá člověku. */
{
  const FOTKA = (await import('../js/fotka.js')).default
    || (await import('../js/fotka.js'));
  const ROOT = new URL('..', import.meta.url);
  for (const stranka of ['index.html', 'pozemek.html']) {
    let html = '';
    try { html = readFileSync(new URL(stranka, ROOT), 'utf8'); } catch (e) {}
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
    const img = csp ? (/img-src ([^;]*)/.exec(csp[1]) || [])[1] || '' : '';
    pravda(`${stranka}: img-src pouští hostitele fotek`,
      img.indexOf(FOTKA.HOSTITEL) > 0, 'img-src: ' + img.slice(0, 200));
    pravda(`${stranka}: načítá js/min/fotka.js`,
      html.indexOf('js/min/fotka.js') > 0);
  }
}

console.log('\nBezrealitky povolenou cestou (sitemapa + detail)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 8)) {
    console.log('::error::Bezrealitky: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  console.log('::error::Bezrealitky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
