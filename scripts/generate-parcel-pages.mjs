// Stránka pro KAŽDÝ pozemek zvlášť — kvůli sdílení a vyhledávačům.
//
// Spuštění: node scripts/generate-parcel-pages.mjs
//   (jen Node, žádné závislosti — musí to zvládnout i robot, který běží
//    čtyřikrát denně na holém Node bez prohlížeče.)
//
// PROČ TO VZNIKLO: pozemek.html byla JEDNA stránka pro všech 1 900+
// nabídek a sdílená adresa se lišila jen v „?p=…". Facebook ani Google
// ale JavaScript nespustí, takže každý sdílený pozemek měl naprosto
// stejný nadpis, popis i obrázek: „Pozemek — Parcelka". Odkaz na
// konkrétní parcelu tím neřekl nic o tom, co za ním je.
//
// PROČ DO KOŘENE, A NE DO PODSLOŽKY: stránka se skládá z pozemek.html,
// která odkazuje na js/…, css/… relativně. V podsložce by se všechny ty
// cesty musely přepisovat — celá třída chyb zadarmo. Web už má sto
// kořenových stránek (pozemky-okres-*.html), tahle konvence sedí.
//
// PROČ OBRÁZEK OKRESU, A NE VLASTNÍ: náhledy se kreslí prohlížečem,
// kdežto tenhle generátor běží v robotovi bez něj. Vlastní obrázek pro
// každou nabídku by navíc znamenal desítky megabajtů, které zastarají
// dřív, než je někdo stihne nasdílet — data se mění každých šest hodin.
// Okresních náhledů je 91, jsou stálé a hotové.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 'https://www.parcelaka.cz';

const MAPA = { 'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o','ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z' };
export function slug(s) {
  return String(s || '').toLowerCase().replace(/[áčďéěíňóřšťúůýž]/g, (c) => MAPA[c] || c)
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => new Intl.NumberFormat('cs-CZ').format(Math.round(n));

/** Týž klíč, jakým se pozemek hledá v datech na webu (js/main.js: pkey). */
export function pkey(d) {
  const la = typeof d.lat === 'number' ? d.lat.toFixed(3) : '';
  const ln = typeof d.lng === 'number' ? d.lng.toFixed(3) : '';
  return [d.place || '', d.parcel || '', d.okres || '', la, ln].join('|');
}
/* Otisk klíče. ZÁMĚRNĚ obyčejný djb2, ne sha1: tentýž výpočet musí zvládnout
   i prohlížeč, aby web uměl na vlastní stránky odkazovat. Kryptografie tu
   není k ničemu — jde jen o to rozlišit dva pozemky se stejným názvem.
   Samotné souřadnice nestačí: u pěti dvojic z 1 927 vyjdou po zaokrouhlení
   stejné a stránky by se přepsaly. */
export function otisk(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
/** Název souboru: čitelný, a na konci otisk klíče kvůli jednoznačnosti. */
export function souborPro(d) {
  return `pozemek-${slug(d.okres)}-${slug(d.place)}-${otisk(pkey(d))}.html`;
}

const TYP = { sale: 'Na prodej', drazba: 'Dražba', exekuce: 'Exekuce', obec: 'Od obce', majitel: 'Od majitele' };

/* Datum ve tvaru pro stroje („2026-10-13") mezi českými větami vypadá jako
   nedodělek a nikdo ho na první pohled nepřečte. Web to řeší v js/terminy.js
   (zdrojText); tady musí platit totéž, jinak by si stránka pozemku
   odporovala se sebou samou podle toho, jestli běží skript. */
export function lidskeDatum(t) {
  return String(t == null ? '' : t)
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, r, m, den) => `${+den}. ${+m}. ${r}`);
}

/* Titulek se musí vejít do výpisu vyhledávače — nad 65 znaků ho Google
   usekne uprostřed slova. Skládá se proto odstupňovaně: vezme se nejdelší
   podoba, která se vejde i se jménem webu. Ořezávat natvrdo by rozbilo
   slova; tohle vždycky utne na celém údaji. */
const MEZ_TITULKU = 65;
function slozTitulek(druh, vym, place, okres) {
  const konec = ' | Parcelka';
  const varianty = [
    `${druh}${vym ? ' ' + vym : ''} — ${place}, okres ${okres}`,
    `${druh}${vym ? ' ' + vym : ''} — ${place}`,
    `${druh} — ${place}`,
    `${druh} — okres ${okres}`,
    `${place}, okres ${okres}`,
  ];
  for (const v of varianty) if ((v + konec).length <= MEZ_TITULKU) return v;
  return varianty[varianty.length - 1].slice(0, MEZ_TITULKU - konec.length - 1) + '…';
}

export function textyPro(d) {
  const druh = d.druh ? d.druh.charAt(0).toUpperCase() + d.druh.slice(1) : 'Pozemek';
  const vym = d.area ? `${fmt(d.area)} m²` : '';
  const titul = slozTitulek(druh, vym, d.place, d.okres);
  const cena = d.price ? `${fmt(d.price)} Kč` : 'cena neuvedena';
  const zaM2 = d.price && d.area ? ` (${fmt(d.price / d.area)} Kč/m²)` : '';
  const popis = `${TYP[d.type] || 'Nabídka'} · ${cena}${zaM2}${vym ? ' · ' + vym : ''}`
    + ` · ${d.place}, okres ${d.okres}. Poloha na mapě, srovnání s obvyklou cenou a odkaz do katastru.`;
  return { titul, popis, cena, zaM2, vym, druh };
}

export function stranka(sablona, d) {
  const { titul, popis, cena, zaM2, vym, druh } = textyPro(d);
  const soubor = souborPro(d);
  const url = `${WEB}/${soubor}`;
  const og = `${WEB}/assets/og/okres-${slug(d.okres)}.png`;
  let h = sablona;

  // Hlava: každý pozemek má vlastní titulek, popis, adresu i náhled.
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${esc(titul)} | Parcelka</title>`);
  h = h.replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(popis)}$2`);
  h = h.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${esc(url)}$2`);
  h = h.replace(/(<meta property="og:type" content=")[^"]*(">)/, '$1article$2');
  h = h.replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(titul)}$2`);
  h = h.replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${esc(popis)}$2`);
  h = h.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${esc(og)}$2`);
  h = h.replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${esc(titul)}$2`);
  h = h.replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${esc(popis)}$2`);
  h = h.replace(/(<meta name="twitter:image" content=")[^"]*(">)/, `$1${esc(og)}$2`);
  if (!/<meta property="og:url"/.test(h)) {
    h = h.replace(/(<meta property="og:type"[^>]*>)/, `$1\n  <meta property="og:url" content="${esc(url)}">`);
  } else {
    h = h.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${esc(url)}$2`);
  }

  // Strojově čitelný popis místa — kvůli vyhledávačům.
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Place', name: titul, description: popis, url,
    address: { '@type': 'PostalAddress', addressLocality: d.place, addressRegion: d.okres, addressCountry: 'CZ' },
    geo: { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lng },
  });

  /* Obsah pro toho, kdo JavaScript nespustí (roboti vyhledávačů, náhledy
     v chatech). Skript ho po načtení nahradí plným detailem — proto to
     nesmí být prázdná skořápka ani přesměrování: za doorway stránky bez
     obsahu Google trestá, a po právu. */
  const staticky =
    `<article class="pz-staticky">`
    + `<h1>${esc(titul)}</h1>`
    + `<p><b>${esc(cena)}</b>${esc(zaM2)}${vym ? ' · ' + esc(vym) : ''} · ${esc(TYP[d.type] || d.type)}</p>`
    + `<dl>`
    + `<dt>Druh pozemku</dt><dd>${esc(druh)}</dd>`
    + (vym ? `<dt>Výměra</dt><dd>${esc(vym)}</dd>` : '')
    + `<dt>Obec</dt><dd>${esc(d.place)}</dd>`
    + `<dt>Okres</dt><dd><a href="pozemky-okres-${slug(d.okres)}.html">${esc(d.okres)}</a></dd>`
    + (d.parcel && d.parcel !== '—' ? `<dt>Parcela</dt><dd>č. ${esc(d.parcel)}</dd>` : '')
    + (d.extra ? `<dt>Stav / zdroj</dt><dd>${esc(lidskeDatum(d.extra))}</dd>` : '')
    + `</dl>`
    + `<p><a href="pozemek.html?p=${encodeURIComponent(pkey(d))}&amp;ll=${d.lat},${d.lng}">Otevřít na mapě</a></p>`
    + `</article>`;
  h = h.replace(/<div id="pz-detail">[\s\S]*?<\/div>/,
    `<div id="pz-detail">${staticky}</div>`);

  // Předání skriptu: která nabídka to je, bez tahání z adresy.
  h = h.replace(/(<script src="js\/pozemek\.js)/,
    `<script type="application/ld+json">${ld}</scr` + `ipt>\n`
    + `<script>window.PK_POZEMEK=${JSON.stringify({ k: pkey(d), ll: [d.lat, d.lng] })};</scr` + `ipt>\n$1`);
  return h;
}

export function generuj() {
  const sablona = fs.readFileSync(path.join(ROOT, 'pozemek.html'), 'utf8');
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
  const videno = new Set();
  const hotove = [];
  for (const d of D) {
    if (!isFinite(d.lat) || !isFinite(d.lng) || !d.place || !d.okres) continue;
    const k = pkey(d);
    if (videno.has(k)) continue;      // tentýž pozemek ze dvou zdrojů = jedna stránka
    videno.add(k);
    const soubor = souborPro(d);
    fs.writeFileSync(path.join(ROOT, soubor), stranka(sablona, d));
    hotove.push(soubor);
  }
  // Stránky zrušených nabídek musí zmizet, jinak by web sliboval pozemky,
  // které už nikde nejsou.
  const zive = new Set(hotove);
  let smazano = 0;
  for (const f of fs.readdirSync(ROOT)) {
    if (!/^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f) || zive.has(f)) continue;
    /* Na název se nespoléhat. Ručně psané stránky se jmenují podobně
       (pozemek-od-obce.html) a smazat cizí soubor kvůli shodě vzorku je
       chyba, která se pozná až tím, že ze stránky zbude 404. Maže se jen
       to, co tenhle generátor sám vyrobil — pozná se podle značky uvnitř. */
    const cesta = path.join(ROOT, f);
    let obsah = '';
    try { obsah = fs.readFileSync(cesta, 'utf8'); } catch (e) { continue; }
    if (obsah.indexOf('window.PK_POZEMEK=') < 0) continue;
    fs.unlinkSync(cesta); smazano++;
  }
  return { hotove, smazano };
}

/* Mapa webu. Sitemap staví generátor regionálních stránek a přepisuje ji
   celou, takže se sem jen dopíše — tenhle krok běží po něm. Staré záznamy
   se přesto odstraňují: kdyby někdo pustil jen tenhle generátor dvakrát,
   nesmí se odkazy zdvojit. */
export function doMapyWebu(soubory) {
  const cesta = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(cesta)) return 0;
  let sm = fs.readFileSync(cesta, 'utf8');
  sm = sm.replace(/  <url>\s*<loc>https:\/\/www\.parcelaka\.cz\/pozemek-[^<]*<\/loc>[\s\S]*?<\/url>\n/g, '');
  const bloky = soubory.map((f) =>
    `  <url>\n    <loc>${WEB}/${f}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.5</priority>\n  </url>\n`).join('');
  sm = sm.replace('</urlset>', bloky + '</urlset>');
  fs.writeFileSync(cesta, sm);
  return soubory.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { hotove, smazano } = generuj();
  const vMape = doMapyWebu(hotove);
  console.log(`Stránek pozemků: ${hotove.length}${smazano ? `, smazáno zrušených: ${smazano}` : ''}`
    + `, v mapě webu: ${vMape}`);
}
