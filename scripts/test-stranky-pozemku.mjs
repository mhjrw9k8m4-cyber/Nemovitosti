// Test: každý pozemek má vlastní sdílitelnou stránku — a web na ni umí ukázat.
//
// Spuštění: node scripts/test-stranky-pozemku.mjs
//
// Proč tohle existuje:
//
// 1) SHODA DVOU VÝPOČTŮ. Název stránky skládá generátor v Node
//    (scripts/generate-parcel-pages.mjs) a nezávisle na něm i prohlížeč
//    (js/pozemek.js), aby web uměl ukázat na vlastní stránku v kanonickém
//    odkazu. Jsou to dva různé kusy kódu, které MUSÍ dát totéž. Kdyby se
//    rozešly, odkazoval by web na soubor, který neexistuje — a poznalo by
//    se to až ze 404 u sdíleného odkazu, tedy u toho jediného návštěvníka,
//    kterého se to týká. Porovnává se proto na VŠECH pozemcích, ne na vzorku.
//
// 2) KAŽDÁ STRÁNKA MUSÍ NÉST SVÉ. Smysl téhle práce je, aby sdílený odkaz
//    neukazoval u všech nabídek totéž. Kontroluje se tedy, že titulek, popis
//    ani náhled nejsou u dvou různých pozemků stejné.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { souborPro, souborProDalsi, pkey, textyPro, slug } from './generate-parcel-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
const pozemky = D.filter((d) => isFinite(d.lat) && isFinite(d.lng) && d.place && d.okres);
/* Co web opravdu ukazuje. Duplicity odstraňuje jedna funkce pro celý web
   (js/hlidani-logika.js) — volá ji mapa, generátor regionálních stránek
   i generátor stránek pozemků. Stránka má vzniknout pro to, co je vidět,
   ne pro každý řádek v datech: tentýž pozemek chodí ze dvou zdrojů. */
const PKH = createRequire(import.meta.url)(path.join(ROOT, 'js', 'hlidani-logika.js'));
const ukazane = PKH.bezDuplicit(pozemky);

// --- 1) prohlížečový výpočet názvu musí sednout s generátorem -----------
/* Tentýž název skládají TŘI nezávislé kusy kódu: generátor v Node, detail
   pozemku (kvůli kanonickému odkazu a sdílení) a hlavní skript (kvůli
   odkazům ve výpisu). Porovnávají se všechny — dvojice by nechala třetí
   bez dozoru a rozejití by se poznalo až ze 404. */
const ZDROJE = [['js/pozemek.js'], ['js/main.js']];
let src = fs.readFileSync(path.join(ROOT, 'js', 'pozemek.js'), 'utf8');
/* Funkce se z js/pozemek.js vytáhne počítáním závorek, ne regulárem:
   hledat tělo funkce vzorkem je křehké a u vnořených závorek se to rozjede. */
function kus(jmeno) {
  const zac = src.indexOf('function ' + jmeno + '(');
  if (zac < 0) return '';
  let i = src.indexOf('{', zac), hloubka = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') hloubka++;
    else if (src[i] === '}') { hloubka--; if (hloubka === 0) return src.slice(zac, i + 1); }
  }
  return '';
}
function vytahni(soubor) {
  src = fs.readFileSync(path.join(ROOT, soubor), 'utf8');
  const mapaM = /var PK_(?:MAPA|DIAKR) = \{[^}]*\};/.exec(src);
  // main.js si klíč skládá sám (pkey), detail má vlastní pkeyPlny.
  const klic = kus('pkeyPlny') || kus('pkey');
  return [mapaM ? mapaM[0] : '', kus('pkSlug'), kus('pkOtisk'), klic, kus('souborPozemku')].join('\n');
}

for (const [soubor] of ZDROJE) {
  const zdroj = vytahni(soubor);
  pravda(`výpočet názvu stránky se dá z ${soubor} vytáhnout`,
    zdroj.indexOf('souborPozemku') > 0, 'nenašly se funkce pkSlug/pkOtisk/souborPozemku');
  let fn = null;
  try { fn = new Function(zdroj + '\n return souborPozemku;')(); }
  catch (e) { pravda(`a ${soubor} se dá spustit`, false, String(e)); }
  if (!fn) continue;
  const rozdil = [];
  for (const d of pozemky) {
    const a = souborPro(d), b = fn(d);
    if (a !== b) { rozdil.push(`${a} ≠ ${b}`); if (rozdil.length > 3) break; }
  }
  pravda(`název stránky vychází stejně v Node i v ${soubor} (${pozemky.length} pozemků)`,
    rozdil.length === 0, rozdil.join(' · '));
}

// --- 2) soubory opravdu existují ---------------------------------------
const videno = new Set();
const chybi = [];
for (const d of ukazane) {
  const k = pkey(d);
  if (videno.has(k)) continue;
  videno.add(k);
  if (!fs.existsSync(path.join(ROOT, souborPro(d)))) chybi.push(souborPro(d));
}
pravda(`každý pozemek má svou stránku (${videno.size})`, chybi.length === 0,
  `chybí ${chybi.length}, např. ${chybi.slice(0, 3).join(', ')}`);

// --- 3) sdílený odkaz musí u každé nabídky říkat něco jiného ------------
const tituly = new Set(), popisy = new Set();
let ukazky = 0;
for (const d of pozemky) {
  const t = textyPro(d);
  tituly.add(t.titul); popisy.add(t.popis); ukazky++;
  if (ukazky > 400) break;
}
pravda('titulky sdílených odkazů nejsou u všech stejné', tituly.size > ukazky * 0.5,
  `${tituly.size} různých titulků na ${ukazky} pozemků`);
pravda('popisy sdílených odkazů nejsou u všech stejné', popisy.size > ukazky * 0.5,
  `${popisy.size} různých popisů na ${ukazky} pozemků`);

/* --- 4) jedna dražba = jedna stránka ------------------------------------

   Duplicity se na webu odstraňují jednou funkcí (js/hlidani-logika.js).
   Mapa i generátor regionálních stránek ji volají; tenhle generátor si
   dlouho vystačil s vlastním klíčem (obec, parcela, okres, souřadnice)
   a ten na tentýž pozemek ze dvou zdrojů nestačí: parcelní číslo mívá
   jen jeden z nich a souřadnice bývají o pár set metrů jinde. Dražba
   v Trubíně tak měla dvě vlastní stránky — dvě adresy pro jednu dražbu,
   obě v sitemap, obě si ve vyhledávači konkurovaly.

   Kontroluje se to porovnáním s TOUŽ funkcí, ne vlastním pravidlem:
   kdyby si generátor zase začal počítat po svém, čísla se rozejdou.

   POZOR NA DRUHOU STRANU TÉHOŽ. „Jedna stránka na jeden klíč" tu dřív
   stálo jako prosté `ukazane.map(souborPro)` — a tím se z kontroly proti
   duplicitám stala kontrola, která naopak VYŽADOVALA slučování různých
   pozemků. Klíč totiž na rozlišení nestačí: bez parcelního čísla a se
   souřadnicemi na tři desetinná místa padnou dvě různé nabídky v téže
   obci na tentýž klíč (naměřeno 21 takových dvojic). Očekávaný seznam
   se proto skládá stejně jako v generátoru: co se liší cenou nebo
   výměrou, je jiný pozemek a má vlastní stránku; co se neliší, je táž
   nabídka podruhé a stránku sdílí. */
const majiByt = new Set();
{
  const podleKlice = new Map();
  for (const d of ukazane) {
    const k = pkey(d);
    if (!podleKlice.has(k)) podleKlice.set(k, []);
    podleKlice.get(k).push(d);
  }
  for (const cleny of podleKlice.values()) {
    const ruzne = [...new Map(cleny.map((d) => [(d.price || 0) + '|' + (d.area || 0), d])).values()]
      .sort((a2, b2) => (a2.area || 0) - (b2.area || 0) || (a2.price || 0) - (b2.price || 0)
        || String(a2.url || '').localeCompare(String(b2.url || '')));
    ruzne.forEach((d, i) => majiByt.add(i === 0 ? souborPro(d) : souborProDalsi(d)));
  }
}
/* Ne každý soubor „pozemek-*.html" je generovaný — pozemek-od-obce.html
   je ručně psaná stránka. Poznají se podle značky, kterou do nich píše
   generátor, ne podle jména: jméno by se dalo splést a ruční stránka by
   pak zkoušku shodila. Čtou se jen soubory navíc, ne všech 1 900. */
const navic = fs.readdirSync(ROOT)
  .filter((f) => /^pozemek-.+\.html$/.test(f) && !majiByt.has(f))
  .filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('window.PK_POZEMEK='));
pravda(`pro tentýž pozemek nevzniknou dvě stránky (${majiByt.size} stránek)`,
  navic.length === 0,
  `${navic.length} stránek navíc proti tomu, co ukazuje mapa: ` + navic.slice(0, 4).join(', '));
/* A ať kontrola není prázdná: pravidlo aplikace musí být přísnější než
   vlastní klíč generátoru, jinak by výše uvedené mlčelo vždycky. */
pravda('pravidlo aplikace je přísnější než klíč generátoru (jinak zkouška nic neměří)',
  PKH.bezDuplicit(pozemky).length < pozemky.length,
  'bezDuplicit nic neodstranilo — kontrola výš by prošla i s rozbitým generátorem');

// --- 5) náhled musí existovat pro každý okres ---------------------------
const bezNahledu = [...new Set(pozemky.map((d) => d.okres))]
  .filter((o) => !fs.existsSync(path.join(ROOT, 'assets', 'og', `okres-${slug(o)}.png`)));
pravda('každý okres má náhledový obrázek pro sdílení', bezNahledu.length === 0,
  `bez náhledu: ${bezNahledu.join(', ')}`);

/* --- 6) mapa webu nesmí o žádnou ruční stránku přijít ----------------
 *
 * Mapu webu skládají DVA generátory za sebou: krajský do ní zapíše ruční
 * stránky (rozcestníky, rádce, podmínky), ten pro pozemky pak své vlastní
 * odkazy přepíše — a k tomu si napřed ty staré vymazal vzorem
 * „pozemek-cokoli". Jenže „Jak koupit pozemek od obce" se jmenuje
 * pozemek-od-obce.html, takže ho ten úklid vyhazoval taky. Stránka je
 * odkazovaná z pěti dalších a ve vyhledávači o ní nikdo nevěděl.
 *
 * Hlídá se to proti seznamu ve zdroji generátoru, ne proti ručně opsanému
 * výčtu: kdo přidá další ruční stránku, dostane tuhle kontrolu zadarmo.
 */
{
  const gen = fs.readFileSync(path.join(ROOT, 'scripts', 'generate-region-pages.mjs'), 'utf8');
  const usek = gen.slice(gen.indexOf('const staticUrls=['), gen.indexOf('];', gen.indexOf('const staticUrls=[')));
  const rucni = [...usek.matchAll(/loc:\s*'([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  pravda(`seznam ručních stránek se ve zdroji generátoru našel (${rucni.length})`,
    rucni.length >= 10, 'staticUrls se nenašlo — kontrola níž by nic neměřila');
  const mapa = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const chybi = rucni.filter((u) => mapa.indexOf(`/${u}</loc>`) < 0);
  pravda('a všechny jsou v mapě webu', chybi.length === 0,
    `v sitemap.xml chybí: ${chybi.join(', ')}`);
}

/* --- POZEMKY, KTERÉ SDÍLEJÍ KLÍČ, MAJÍ KAŽDÝ SVOU STRÁNKU ------------
 *
 * Klíč nese obec, parcelní číslo, okres a souřadnice na tři desetinná
 * místa. Když parcelní číslo v datech chybí (bývá „—") a dvě nabídky
 * v téže obci padnou po zaokrouhlení na stejných zhruba sto metrů, je
 * klíč shodný — a přitom jde o různé pozemky. Generátor tehdy druhou
 * nabídku zahodil a odkaz na ni ukázal cenu i výměru té první.
 * Naměřeno na 1 966 nabídkách: 37 nabídek bez vlastní stránky, u 26 se
 * cena nebo výměra lišila. Nejkřiklavěji Lhota pod Libčany:
 * 7 527 800 Kč / 1 981 m² proti 5 723 300 Kč / 1 331 m².
 */
{
  const podleKlice = new Map();
  for (const d of ukazane) {
    const k = pkey(d);
    if (!podleKlice.has(k)) podleKlice.set(k, []);
    podleKlice.get(k).push(d);
  }
  /* Skupiny, kde se nabídky OPRAVDU liší. Shodná cena i výměra na jednom
     místě je pořád tentýž pozemek podruhé a jedna stránka je správně. */
  const kolizni = [...podleKlice.values()].filter((v) => v.length > 1
    && new Set(v.map((x) => (x.price || 0) + '|' + (x.area || 0))).size > 1);
  /* Pojistka: kdyby v datech taková dvojice nebyla, kontroly níž by
     neměly co měřit a prošly by, i kdyby generátor zase slučoval. */
  pravda('v datech je aspoň jedna dvojice různých pozemků na jednom klíči (jinak zkouška nic neměří)',
    kolizni.length > 0, 'nenašla se — kontrola vlastních stránek by nic nehlídala');
  const mezera = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const chybi = [], cizi = [];
  for (const cleny of kolizni) {
    const ruzne = [...new Map(cleny.map((d) => [(d.price || 0) + '|' + (d.area || 0), d])).values()]
      .sort((a3, b3) => (a3.area || 0) - (b3.area || 0) || (a3.price || 0) - (b3.price || 0)
        || String(a3.url || '').localeCompare(String(b3.url || '')));
    ruzne.forEach((d, i) => {
      const soubor = i === 0 ? souborPro(d) : souborProDalsi(d);
      const cesta = path.join(ROOT, soubor);
      if (!fs.existsSync(cesta)) { chybi.push(`${soubor} (${d.price} Kč / ${d.area} m²)`); return; }
      /* A hlavně: stránka musí nést SVOJI výměru, ne sousedovu. Kdyby se
         jen vyrobil soubor navíc s obsahem toho druhého, kontrola „soubor
         existuje" by prošla a člověk by dál četl cizí údaje. */
      const h = fs.readFileSync(cesta, 'utf8');
      if (h.indexOf(mezera(d.area) + '\u00a0m²') < 0 && h.indexOf(mezera(d.area) + ' m²') < 0) {
        cizi.push(`${soubor} neuvádí ${mezera(d.area)} m²`);
      }
    });
  }
  pravda('každý z nich má vlastní stránku', chybi.length === 0,
    `chybí ${chybi.length}: ${chybi.slice(0, 4).join(', ')}`);
  pravda('a ta stránka nese jeho vlastní výměru, ne sousedovu', cizi.length === 0,
    cizi.slice(0, 4).join(', '));
}

console.log('\nStránky jednotlivých pozemků');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Stránky pozemků: kontroly neprošly.');
process.exit(chyb ? 1 : 0);
