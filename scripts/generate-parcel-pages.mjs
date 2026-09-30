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
import { createRequire } from 'node:module';
import { jsonVeStrance } from './json-do-stranky.mjs';

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
/* DRUHÝ A DALŠÍ POZEMEK NA TÉMŽE KLÍČI.
   Klíč nese obec, parcelní číslo, okres a souřadnice na tři desetinná
   místa. Když parcelní číslo chybí (v datech je ho spousta jako „—“)
   a dvě nabídky v téže obci padnou po zaokrouhlení na stejných zhruba
   sto metrů, mají klíč shodný — a přitom to jsou různé pozemky.
   Naměřeno na 1 966 nabídkách: 32 takových skupin, v 21 z nich se
   nabídky liší cenou nebo výměrou. Nejkřiklavěji Lhota pod Libčany,
   7 527 800 Kč / 1 981 m² proti 5 723 300 Kč / 1 331 m².
   Do klíče se proto přidá výměra a cena — ale jen těm DALŠÍM v pořadí.
   První si drží dosavadní název souboru, takže žádná dnes existující
   adresa se nemění a nic z vyhledávačů nespadne na 404. */
export function souborProDalsi(d) {
  const rozliseni = pkey(d) + '|' + (d.area || 0) + '|' + (d.price || 0);
  return `pozemek-${slug(d.okres)}-${slug(d.place)}-${otisk(rozliseni)}.html`;
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

/* SOUBOR se předává, nepočítá. Pozemky se shodným klíčem dostávají
   vlastní stránky (souborProDalsi), ale kanonická adresa se tu počítala
   vždycky ze souborPro — tedy z té první z dvojice. Těch 26 stránek pak
   o sobě tvrdilo „správná adresa je ta druhá", ačkoli je to jiný pozemek
   s jinou cenou a výměrou. Vyhledávač je podle toho zahodí a ukáže
   místo nich dvojče: pozemky, kterým jsem včera vlastní stránku
   udělal, by v hledání nebyly vidět. */
export function stranka(sablona, d, soubor = souborPro(d)) {
  const { titul, popis, cena, zaM2, vym, druh } = textyPro(d);
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
  /* jsonVeStrance, ne JSON.stringify: obsah <script> je surový text a končí
     prvním koncem skriptu, i kdyby stál uvnitř řetězce v JSONu. Názvy obcí
     sem přitom přicházejí z cizích webů. Viz scripts/json-do-stranky.mjs. */
  const ld = jsonVeStrance({
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
    + `<p><a href="pozemek.html?p=${encodeURIComponent(pkey(d))}&amp;ll=${d.lat},${d.lng}&amp;v=${d.area || 0}">Otevřít na mapě</a></p>`
    + `</article>`;
  h = h.replace(/<div id="pz-detail">[\s\S]*?<\/div>/,
    `<div id="pz-detail">${staticky}</div>`);

  // Předání skriptu: která nabídka to je, bez tahání z adresy.
  h = h.replace(/(<script src="js\/pozemek\.js)/,
    `<script type="application/ld+json">${ld}</scr` + `ipt>\n`
    /* „v" a „c" (výměra a cena) jsou tu kvůli pozemkům, které sdílejí
       klíč: bez nich by stránka toho druhého z dvojice nedokázala ve
       stažených datech najít sám sebe a vzala by prostě první nález. */
    + `<script>window.PK_POZEMEK=${jsonVeStrance({ k: pkey(d), ll: [d.lat, d.lng], v: d.area || 0, c: d.price || 0 })};</scr` + `ipt>\n$1`);
  return h;
}

/* Pravidlo pro duplicity je jedno pro celý web (js/hlidani-logika.js).
   Ten soubor je obyčejný skript pro prohlížeč, ne modul — načte se
   stejně jako v scripts/generate-region-pages.mjs. */
const PKH = createRequire(import.meta.url)(path.join(ROOT, 'js', 'hlidani-logika.js'));

/* KTERÉ NABÍDCE PATŘÍ KTERÁ STRÁNKA — a proč to bydlí tady.
   Regionální stránky na tyhle stránky odkazují, takže potřebují tentýž
   výpočet. Kdyby si ho spočítaly podruhé, rozešel by se s tím, co se
   opravdu vygenerovalo, a odkazy by mířily na neexistující soubory —
   tedy na 404. Je to tentýž důvod, pro který skládání řádku od majitele
   skončilo v jedné funkci (js/cisteni.js). Rozhoduje o tom seskupení
   níž, ne jen název souboru, a proto to nejde vyjádřit čistou funkcí
   nad jednou nabídkou. */
export function klicNabidky(d) {
  return pkey(d) + '#' + (d.price || 0) + '|' + (d.area || 0);
}
export function mapaSouboru(D) {
  /* NEJDŘÍV SESKUPIT, POTOM ROZHODNOUT. Dřív se tu na druhý pozemek se
     stejným klíčem prostě zapomnělo („tentýž pozemek ze dvou zdrojů =
     jedna stránka“). Jenže skutečné duplicity zahodil už PKH.bezDuplicit
     o řádek výš — co projde až sem se shodným klíčem, jsou nabídky, které
     pravidlo pro duplicity za tentýž pozemek NEPOVAŽUJE. Naměřeno: 37
     nabídek tím přišlo o vlastní stránku a u 26 z nich se cena nebo
     výměra lišila od té, která stránku dostala. Odkaz na ně ukázal cizí
     pozemek: cizí cenu, cizí výměru. */
  const skupiny = new Map();
  for (const d of D) {
    if (!isFinite(d.lat) || !isFinite(d.lng) || !d.place || !d.okres) continue;
    const k = pkey(d);
    if (!skupiny.has(k)) skupiny.set(k, []);
    skupiny.get(k).push(d);
  }
  const ven = new Map();
  for (const cleny of skupiny.values()) {
    /* Shodná cena I výměra na jednom místě = pořád tentýž pozemek, jen
       podruhé. Takovým se dělá jedna stránka dál: dvě adresy pro jednu
       nabídku si ve vyhledávači konkurují (kvůli tomu tu to slučování
       vzniklo). Rozhoduje se tedy podle TOHO, ČÍM SE LIŠÍ, ne podle
       toho, že klíč je shodný. */
    const podleObsahu = new Map();
    for (const d of cleny) {
      const podpis = (d.price || 0) + '|' + (d.area || 0);
      if (!podleObsahu.has(podpis)) podleObsahu.set(podpis, d);
    }
    /* Pořadí musí být dané daty, ne pořadím v souboru — jinak by se
       dnešní adresa přestěhovala na jinou nabídku, jakmile robot data
       přeskládá. */
    const ruzne = [...podleObsahu.values()].sort((a, b) =>
      (a.area || 0) - (b.area || 0) || (a.price || 0) - (b.price || 0)
      || String(a.url || '').localeCompare(String(b.url || '')));
    ruzne.forEach((d, i) => {
      ven.set(klicNabidky(d), { d: d, soubor: i === 0 ? souborPro(d) : souborProDalsi(d) });
    });
  }
  return ven;
}

/* Nabídky, ze kterých se stránky dělají — tentýž vstup jako má generátor
   regionálních stránek, ať se mapování odkazů a skutečně vyrobené soubory
   nemůžou rozejít. */
export function nabidky() {
  const syrova = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
  /* Duplicity odstraňuje TATÁŽ funkce jako mapa (js/main.js) i generátor
     regionálních stránek — js/hlidani-logika.js. Dřív si tenhle generátor
     vystačil s vlastním klíčem (pkey: obec, parcela, okres, souřadnice)
     a to nestačilo: tentýž pozemek ze dvou zdrojů mívá parcelní číslo
     jen u jednoho z nich a souřadnice o pár set metrů jinde. Dražba
     v Trubíně (okdrazby.cz/drazba/27823) tak dostala dvě vlastní
     stránky — dvě adresy pro jednu dražbu, obě v sitemap, obě si ve
     vyhledávači konkurovaly. Vlastní pravidlo je tu pořád, ale až jako
     druhé síto: rozlišuje stránky, nerozhoduje o duplicitách. */
  return PKH.bezDuplicit(syrova);
}

export function generuj() {
  const sablona = fs.readFileSync(path.join(ROOT, 'pozemek.html'), 'utf8');
  const hotove = [];
  for (const { d, soubor } of mapaSouboru(nabidky()).values()) {
    fs.writeFileSync(path.join(ROOT, soubor), stranka(sablona, d, soubor));
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
  /* JEN STRÁNKY POZEMKŮ, ne všechno, co začíná na „pozemek-".
     Vzor „pozemek-cokoli" bral i rádce pozemek-od-obce.html („Jak koupit
     pozemek od obce"), který do mapy webu zapsal generátor krajů o krok
     dřív — a tenhle krok ho zase vyhodil. Stránka je přitom odkazovaná
     z pěti dalších a ve vyhledávači o ní nikdo neví. Vzor je teď týž,
     podle kterého se výš poznávají soubory ke smazání: jméno stránky
     pozemku končí otiskem klíče. */
  sm = sm.replace(/  <url>\s*<loc>https:\/\/www\.parcelaka\.cz\/pozemek-[^<]*-[0-9a-z]{5,8}\.html<\/loc>[\s\S]*?<\/url>\n/g, '');
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
