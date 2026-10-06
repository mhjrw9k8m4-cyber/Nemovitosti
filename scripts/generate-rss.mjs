// Kanál s novými pozemky (RSS 2.0).
//
// PROČ. Hlídání na webu potřebuje účet a chodí e-mailem. Kdo chce
// sledovat nové pozemky po svém — ve čtečce, v automatizaci, v jiné
// aplikaci — neměl kudy. Kanál je na to nejstarší a nejlevnější
// způsob: stačí adresa, nic se nikam nepřihlašuje a nikdo se nás
// nemusí ptát o dovolení.
//
// CO V NĚM JE: pozemky seřazené podle toho, kdy je robot poprvé uviděl
// (pole first_seen). Ne podle ceny ani podle „zajímavosti" — kanál má
// říkat CO PŘIBYLO, a jakmile by do toho vstoupilo hodnocení, přestal
// by být měřítkem a stal se doporučením.
//
// JEDEN CELOSTÁTNÍ A ČTRNÁCT KRAJSKÝCH. Celá republika dělá při čtyřech
// bězích denně desítky položek za den — kdo sleduje jeden kraj, by v tom
// to své nenašel. Okresní kanály (77 souborů) se schválně nedělají:
// u většiny okresů by to byl kanál o dvou položkách za měsíc.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mapaSouboru, klicNabidky } from './generate-parcel-pages.mjs';

const require_ = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 'https://www.parcelaka.cz';
const POLOZEK = 50;          // kolik nejnovějších se do kanálu dá

const TYPY = { sale: 'Na prodej', drazba: 'Dražba', exekuce: 'Exekuce',
  obec: 'Záměr obce', majitel: 'Přímo od majitele' };

/* České datum termínu přepisuje TÝŽ modul jako stránka pozemku. Načítá se
   tady, a ne uvnitř spust(), protože ho potřebuje popisPolozky(); je to
   čistá definice bez zápisu na disk, takže import nic nerozběhne. */
const TERMINY = (() => {
  const okno = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'js', 'terminy.js'), 'utf8'))(okno);
  if (!okno.PK_TERMINY || !okno.PK_TERMINY.zdrojText) throw new Error('js/terminy.js nedalo zdrojText');
  return okno.PK_TERMINY;
})();

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* Datum ve tvaru, který žádá RSS 2.0 (RFC 822). Píše se ANGLICKY
   a v GMT — je to strojový údaj, ne text pro čtenáře; česká zkratka
   dne by rozhodila každou čtečku. */
const DNY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESICE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function rfc822(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${DNY[d.getUTCDay()]}, ${p(d.getUTCDate())} ${MESICE[d.getUTCMonth()]} `
    + `${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:`
    + `${p(d.getUTCSeconds())} GMT`;
}
/* first_seen je jen DEN. Hodina se dopočítá z pořadí v rámci dne, aby
   čtečky uměly položky seřadit — se shodným časem je řadí každá jinak
   a člověku se pak pořadí mění pod rukama. */
function kdy(den, poradi) {
  const d = new Date((den || '2026-01-01') + 'T12:00:00Z');
  d.setUTCMinutes(d.getUTCMinutes() - (poradi % 600));
  return d;
}

function popisPolozky(o) {
  const c = [];
  if (o.price > 0) c.push(`<b>${fmt(o.price)}&#160;Kč</b>`);
  if (o.area > 0) c.push(`${fmt(o.area)}&#160;m²`);
  if (o.price > 0 && o.area > 0) c.push(`${fmt(Math.round(o.price / o.area))}&#160;Kč/m²`);
  if (o.druh) c.push(esc(o.druh));
  if (o.okres) c.push(`okres ${esc(o.okres)}`);
  /* U podílu to MUSÍ stát hned: cena je za zlomek, ale výměra za celou
     parcelu, takže cena za metr vychází nízko sama od sebe a nabídka
     vypadá jako trhák. Ve čtečce není nic, co by to vysvětlilo. */
  if (o.podil) c.push('<b>spoluvlastnický podíl</b> — v ceně je jen zlomek pozemku');
  /* TERMÍN DRAŽBY. Bez něj vypadaly dvě RŮZNÉ dražby v kanálu úplně
     stejně: Police nad Metují měla tři parcely po 719 m² za 1 078 500 Kč,
     lišily se jen datem (15. 10., 22. 10. a 5. 11.) — a titulek i popis
     byly znak za znak tytéž. Čtenář v tom nemohl poznat dvě příležitosti,
     jen „zase to samé". Datum do českého tvaru přepisuje TÝŽ modul jako
     stránka pozemku (js/terminy.js); psát si tu vlastní názvy měsíců by
     byla třetí kopie, která se jednou rozejde. Naměřeno: datum v `extra`
     mají všechny dražby a exekuce (166 ze 166). */
  if ((o.type === 'drazba' || o.type === 'exekuce') && /\d{4}-\d{2}-\d{2}/.test(o.extra || '')) {
    c.push(esc(TERMINY.zdrojText(o.extra)));
  }
  return c.join(' · ');
}

function kanal({ nazev, popis, soubor, odkaz, polozky, stranky }) {
  /* lastBuildDate SE BERE Z NEJNOVĚJŠÍ POLOŽKY, NE Z HODIN.
     Dřív tu stál čas běhu generátoru. Podle RSS má ale to pole znamenat
     „kdy se naposledy změnil obsah kanálu", a čas běhu je něco jiného:
     každé sestavení přepsalo patnáct kanálů rozdílem jediného řádku,
     i když nepřibyla jediná nabídka. Pracovní strom byl po každém
     `node scripts/oprav.mjs` špinavý a každý commit nesl patnáct
     bezobsažných změn — a při slučování s robotí aktualizací dat
     z toho vzniklo patnáct konfliktů, které se nedaly vyřešit jinak
     než přegenerováním.
     Datum nejnovější položky je stabilní, odvozené z dat, a navíc
     pravdivější: mění se právě tehdy, když do kanálu něco přibude. */
  const data = polozky.map((o, i) => kdy(o.first_seen, i));
  const ted = rfc822(data.length ? new Date(Math.max(...data)) : new Date());
  const radky = polozky.map((o, i) => {
    /* ODKAZ SE BERE Z TÉŽE MAPY, ZE KTERÉ VZNIKAJÍ STRÁNKY.
       Dřív tu stálo souborPro(o) — jméno spočítané z klíče (obec,
       parcela, okres, souřadnice). Na tom klíči se ale nabídky srážejí:
       generátor stránek proto druhé z nich dává jméno jiné
       (souborProDalsi), kdežto kanál o tom nevěděl a poslal obě na
       tutéž adresu. Naměřeno: 16 položek v patnácti kanálech mělo guid
       shodný s jinou položkou, a šest z nich v jediném kanálu —
       čtenář klepl na jednu nabídku a dostal stránku jiné: cizí cenu,
       cizí výměru. Mapa odkazů je TATÁŽ, kterou používá generátor
       okresních a krajských stránek, takže se rozejít nemůžou. */
    const url = `${WEB}/${stranky.get(klicNabidky(o)).soubor}`;
    const titul = `${o.place}${o.okres ? ', okres ' + o.okres : ''} — `
      + `${TYPY[o.type] || 'Pozemek'}${o.area > 0 ? ', ' + fmt(o.area) + ' m²' : ''}`;
    return '    <item>\n'
      + `      <title>${esc(titul)}</title>\n`
      + `      <link>${esc(url)}</link>\n`
      /* guid je TRVALÝ: čtečka podle něj pozná, co už ukázala. Musí to
         být adresa stránky, ne pořadí ani datum — jinak by se tytéž
         pozemky hlásily jako nové při každém běhu robota. */
      + `      <guid isPermaLink="true">${esc(url)}</guid>\n`
      + `      <pubDate>${rfc822(kdy(o.first_seen, i))}</pubDate>\n`
      + `      <description>${esc(popisPolozky(o))}</description>\n`
      + '    </item>';
  }).join('\n');

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
    + '  <channel>\n'
    + `    <title>${esc(nazev)}</title>\n`
    + `    <link>${esc(odkaz)}</link>\n`
    + `    <description>${esc(popis)}</description>\n`
    + '    <language>cs</language>\n'
    + `    <lastBuildDate>${ted}</lastBuildDate>\n`
    + `    <atom:link href="${esc(WEB + '/' + soubor)}" rel="self" type="application/rss+xml"/>\n`
    + (radky ? radky + '\n' : '')
    + '  </channel>\n</rss>\n';
  fs.writeFileSync(path.join(ROOT, soubor), xml, 'utf8');
  return { soubor, polozek: polozky.length, bajtu: xml.length };
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function spust() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
  /* DUPLICITY TOUTÉŽ FUNKCÍ JAKO VŠUDE JINDE.
     Mapa (js/main.js), stránky pozemků i okresní a krajské stránky
     odstraňují duplicity přes PKHlidani.bezDuplicit — kanály to dosud
     nedělaly, protože čtou data/opportunities.json samy. Naměřeno:
     v sedmi z patnácti kanálů stálo osm nadbytečných položek a u dvou
     šlo o tutéž nabídku se SHODNÝM guid (Záblatí, 1 258 m², dvakrát
     tentýž odkaz). Shodný guid je v RSS vada sama pro sebe: čtečka
     podle něj pozná, co už ukázala, takže jedna z těch dvou položek se
     prostě zahodí — a místo v kanálu o padesáti položkách propadne.
     Pravidlo pro duplicity je přitom opatrné: tři dražby v Polici nad
     Metují mají stejnou výměru i cenu, ale jiný termín, a ty v kanálu
     ZŮSTANOU (viz tyzPozemek v js/hlidani-logika.js). */
  const PKH = require_(path.join(ROOT, 'js', 'hlidani-logika.js'));
  const syrove = (data.opportunities || []).filter((o) => o && o.place && isFinite(o.lat));
  const vse = PKH.bezDuplicit(syrove);
  /* Nabídka bez vlastní stránky se do kanálu nedá: nebylo by kam odkázat.
     Takové jsou ty, které mají shodný klíč I shodnou cenu a výměru —
     tedy tentýž pozemek podruhé; mapaSouboru jim schválně dělá jednu
     stránku, aby si dvě adresy pro jednu nabídku nekonkurovaly ve
     vyhledávači. */
  const stranky = mapaSouboru(vse);
  const bezStranky = vse.filter((o) => !stranky.has(klicNabidky(o)));
  const sStrankou = vse.filter((o) => stranky.has(klicNabidky(o)));
  /* Seřazeno od nejnovějšího. Při shodě dne rozhoduje cena za metr —
     ne proto, že by byla důležitější, ale aby bylo pořadí STÁLÉ: jinak
     by se při každém běhu zamíchalo a čtečky by hlásily staré položky
     jako nové. */
  const podleStari = sStrankou.slice().sort((a, b) => {
    const d = String(b.first_seen || '').localeCompare(String(a.first_seen || ''));
    if (d) return d;
    const am = a.area > 0 ? a.price / a.area : 0, bm = b.area > 0 ? b.price / b.area : 0;
    return am - bm;
  });

  /* Mapování okres → kraj i české skloňování názvů krajů bere z
     js/ceny.js. data/okresy.json drží jen souřadnice okresních měst,
     žádné kraje — a opisovat si vlastní tabulku čtrnácti krajů by
     znamenalo patnáctou kopii, která se jednou rozejde. */
  new Function('window', fs.readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))(globalThis);
  const CENY = globalThis.PK_CENY;
  if (!CENY || !CENY.OKRES_KRAJ) throw new Error('js/ceny.js nedalo OKRES_KRAJ');
  const OKRES_KRAJ = CENY.OKRES_KRAJ;
  const vysledky = [];
  vysledky.push(kanal({
    nazev: 'Parcelka — nové pozemky',
    popis: 'Pozemky, které na Parcelce nově přibyly: dražby, exekuce i běžné nabídky z celé ČR.',
    soubor: 'novinky.xml', odkaz: WEB + '/',
    polozky: podleStari.slice(0, POLOZEK), stranky,
  }));

  const kraje = new Map();
  for (const o of podleStari) {
    const k = OKRES_KRAJ[o.okres];
    if (!k) continue;
    if (!kraje.has(k)) kraje.set(k, []);
    const p = kraje.get(k);
    if (p.length < POLOZEK) p.push(o);
  }
  for (const [kraj, polozky] of [...kraje].sort()) {
    vysledky.push(kanal({
      nazev: `Parcelka — nové pozemky, ${kraj === 'Vysočina' ? 'Vysočina' : kraj + ' kraj'}`,
      // „na Vysočině", ne „v Vysočinam kraji" — tvary jsou v js/ceny.js.
      popis: `Pozemky, které nově přibyly ${CENY.kdeText('kraj', kraj)}.`,
      soubor: `novinky-${slug(kraj)}.xml`,
      odkaz: `${WEB}/pozemky-${slug(kraj)}-kraj.html`,
      polozky, stranky,
    }));
  }
  const bajtu = vysledky.reduce((s, x) => s + x.bajtu, 0);
  console.log(`Kanály: ${vysledky.length} souborů, `
    + `${vysledky[0].polozek} položek v celostátním, dohromady ${(bajtu / 1024).toFixed(1)} kB`
    + (bezStranky.length ? `; mimo kanály ${bezStranky.length} nabídek bez vlastní stránky` : '') + '.');
}

if (import.meta.url === `file://${process.argv[1]}`) spust();
/* esc a popisPolozky se vyvážejí kvůli zkoušce. Escapování se totiž
   na dnešních datech NESPUSTÍ — žádná česká obec nemá v názvu & ani <,
   takže kontrola nad hotovým souborem je slepá: sabotáž „zruš
   escapování" jí prošla. Mechanismus se musí vyzkoušet přímo,
   nepřátelským vstupem. */
export { spust, rfc822, kdy, esc, popisPolozky };
