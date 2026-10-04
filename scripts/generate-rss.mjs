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
import { souborPro } from './generate-parcel-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 'https://www.parcelaka.cz';
const POLOZEK = 50;          // kolik nejnovějších se do kanálu dá

const TYPY = { sale: 'Na prodej', drazba: 'Dražba', exekuce: 'Exekuce',
  obec: 'Záměr obce', majitel: 'Přímo od majitele' };

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
  return c.join(' · ');
}

function kanal({ nazev, popis, soubor, odkaz, polozky }) {
  const ted = rfc822(new Date());
  const radky = polozky.map((o, i) => {
    const url = `${WEB}/${souborPro(o)}`;
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
  const vse = (data.opportunities || []).filter((o) => o && o.place && isFinite(o.lat));
  /* Seřazeno od nejnovějšího. Při shodě dne rozhoduje cena za metr —
     ne proto, že by byla důležitější, ale aby bylo pořadí STÁLÉ: jinak
     by se při každém běhu zamíchalo a čtečky by hlásily staré položky
     jako nové. */
  const podleStari = vse.slice().sort((a, b) => {
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
    polozky: podleStari.slice(0, POLOZEK),
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
      polozky,
    }));
  }
  const bajtu = vysledky.reduce((s, x) => s + x.bajtu, 0);
  console.log(`Kanály: ${vysledky.length} souborů, `
    + `${vysledky[0].polozek} položek v celostátním, dohromady ${(bajtu / 1024).toFixed(1)} kB.`);
}

if (import.meta.url === `file://${process.argv[1]}`) spust();
/* esc a popisPolozky se vyvážejí kvůli zkoušce. Escapování se totiž
   na dnešních datech NESPUSTÍ — žádná česká obec nemá v názvu & ani <,
   takže kontrola nad hotovým souborem je slepá: sabotáž „zruš
   escapování" jí prošla. Mechanismus se musí vyzkoušet přímo,
   nepřátelským vstupem. */
export { spust, rfc822, kdy, esc, popisPolozky };
