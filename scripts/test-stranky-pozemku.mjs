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
import { souborPro, souborProDalsi, pkey, textyPro, slug, mapaSouboru, nabidky, pripravRozliseni, pripravRozliseniPopisu } from './generate-parcel-pages.mjs';

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
/* Tentýž název skládají DVA nezávislé kusy kódu: generátor v Node
   a stránka pozemku (kvůli kanonickému odkazu a sdílení). Porovnávají se
   oba — jeden sám by rozejití neukázal a poznalo by se až ze 404.

   TŘETÍ KOPIE BYLA V js/main.js a je pryč. Hlavní skript ji totiž
   nevolal: klepnutí na kartu ve výpisu vede přes gotoInzerat() na
   pozemek.html, ne na vygenerovaný soubor (ověřeno klikáním: tři karty,
   třikrát /pozemek.html). Mrtvá kopie se přitom od živých lišila —
   počítala otisk z pkey(), kdežto js/pozemek.js z pkeyPlny(). Oživit ji
   by znamenalo odkazy na neexistující soubory. */
const ZDROJE = [['js/pozemek.js']];
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
/* KLÍČ POZEMKU UŽ V TOM SOUBORU NENÍ. Mapa, stránka pozemku i porovnání
   uložených ho počítaly každá po svém, takže se uložený pozemek po
   znovuotevření nenašel; teď je na jednom místě v js/klic.js. Tahle
   kontrola ho proto musí vzít odtud — jinak se ptá na kód, který
   v souboru není, a spadne na „pkeyPlny is not defined" místo toho, aby
   řekla, jestli se dva výpočty názvu stránky rozešly. */
function vytahni(soubor) {
  src = fs.readFileSync(path.join(ROOT, soubor), 'utf8');
  const mapaM = /var PK_(?:MAPA|DIAKR) = \{[^}]*\};/.exec(src);
  let klic = kus('pkeyPlny') || kus('pkey');
  let alias = '';
  if (!klic) {
    const puvodni = src;
    src = fs.readFileSync(path.join(ROOT, 'js', 'klic.js'), 'utf8');
    klic = kus('pkey');
    src = puvodni;
    /* V js/pozemek.js se tatáž funkce jmenuje pkeyPlny. */
    alias = 'var pkeyPlny = pkey;';
  }
  return [mapaM ? mapaM[0] : '', kus('pkSlug'), kus('pkOtisk'), klic, alias,
    kus('souborPozemku')].join('\n');
}

for (const [soubor] of ZDROJE) {
  const zdroj = vytahni(soubor);
  pravda(`výpočet názvu stránky se dá z ${soubor} vytáhnout`,
    zdroj.indexOf('souborPozemku') > 0, 'nenašly se funkce pkSlug/pkOtisk/souborPozemku');
  /* Bez klíče by se níž porovnávalo něco jiného, než co web počítá —
     a kontrola by mlčela. */
  pravda('a je v něm i klíč pozemku (z js/klic.js, když ho soubor jen volá)',
    /function pkey\s*\(/.test(zdroj), 'klíč se nenašel ani v js/klic.js');
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

/* --- KANONICKÁ ADRESA MUSÍ UKAZOVAT NA SEBE ---------------------------
 *
 * Návazná chyba na to výš, a zrádnější: stránky navíc vznikly, nesly
 * správnou cenu i výměru — ale kanonickou adresu si generátor počítal
 * zvlášť, z klíče, tedy vždycky ze PRVNÍ z dvojice. Všech 26 stránek tak
 * o sobě vyhledávači tvrdilo „mě neindexuj, správná adresa je tamta",
 * ačkoli tam stojí jiný pozemek s jinou cenou. Google je podle toho
 * z výsledků vyřadí a na obojí ukáže dvojče. Práce na vlastních
 * stránkách by tím byla zahozená a nepoznalo by se to na webu nijak —
 * jen tím, že ty nabídky nikdo nenajde.
 *
 * Kontroluje se i og:url a strojový popis (JSON-LD): tytéž adresy se
 * skládají na třech místech a rozejít se můžou každá zvlášť.
 */
{
  const podleKlice = new Map();
  for (const d of ukazane) {
    const k = pkey(d);
    if (!podleKlice.has(k)) podleKlice.set(k, []);
    podleKlice.get(k).push(d);
  }
  /* Rizikové jsou stránky „druhé v pořadí" — právě u nich se jméno
     souboru rozchází s klíčem. Pro souměrnost se přidá i vzorek
     obyčejných stránek, aby kontrola platila pro obojí. */
  const dalsi = [], prvni = [];
  for (const cleny of podleKlice.values()) {
    const ruzne = [...new Map(cleny.map((d) => [(d.price || 0) + '|' + (d.area || 0), d])).values()]
      .sort((a4, b4) => (a4.area || 0) - (b4.area || 0) || (a4.price || 0) - (b4.price || 0)
        || String(a4.url || '').localeCompare(String(b4.url || '')));
    ruzne.forEach((d, i) => (i === 0 ? prvni : dalsi).push(i === 0 ? souborPro(d) : souborProDalsi(d)));
  }
  /* Bez tohohle by kontrola níž prošla i s rozbitým generátorem: kdyby
     žádná stránka „navíc" nebyla, neměla by co měřit. */
  pravda(`stránky navíc se v datech vyskytují (${dalsi.length}) — jinak zkouška nic neměří`,
    dalsi.length > 0, 'žádná stránka navíc; kontrola kanonické adresy by nic nehlídala');
  const vzorek = dalsi.concat(prvni.filter((_, i) => i % Math.ceil(prvni.length / 25) === 0));
  const spatne = [];
  for (const soubor of vzorek) {
    const cesta = path.join(ROOT, soubor);
    if (!fs.existsSync(cesta)) continue;      // chybějící soubory hlásí kontrola výš
    const h = fs.readFileSync(cesta, 'utf8');
    const mistni = (x) => String(x || '').replace(/^https?:\/\/[^/]+\//, '');
    const kan = /<link rel="canonical" href="([^"]*)"/.exec(h);
    const og = /<meta property="og:url" content="([^"]*)"/.exec(h);
    const ld = /"url":"([^"]*)"/.exec(h);
    if (!kan) { spatne.push(`${soubor}: chybí canonical`); continue; }
    if (mistni(kan[1]) !== soubor) spatne.push(`${soubor}: canonical → ${mistni(kan[1])}`);
    if (og && mistni(og[1]) !== soubor) spatne.push(`${soubor}: og:url → ${mistni(og[1])}`);
    if (ld && mistni(ld[1]) !== soubor) spatne.push(`${soubor}: JSON-LD → ${mistni(ld[1])}`);
  }
  pravda(`každá stránka je kanonická sama sobě (ověřeno na ${vzorek.length})`,
    spatne.length === 0, `${spatne.length} chyb: ` + spatne.slice(0, 4).join('; '));
}

// --- 4) regionální stránky na ně musí odkazovat, a na tu SPRÁVNOU -------
/* Vlastní stránky pozemků se vyráběly do prázdna: z 1 995 stránek na žádnou
   neodkazovalo nic než sitemap.xml. Na okresních a krajských stránkách byl
   v řádku nabídky jediný odkaz — ten na zdroj, tedy pryč z webu. Právě na
   tyhle stránky přitom chodí lidé z vyhledávačů.
   Hlídá se to na OBSAHU cílové stránky, ne na tom, že odkaz existuje: odkaz
   na cizí pozemek je horší než žádný (cizí cena, cizí výměra) a pouhá
   existence souboru by to nepoznala. Porovnává se obec, výměra i cena. */
{
  const regiony = fs.readdirSync(ROOT).filter((f) =>
    /^pozemky-okres-.+\.html$/.test(f) || /^pozemky-.+-kraj\.html$/.test(f));
  const cislo = (t) => String(t).replace(/[\s\u00a0]/g, '');
  const cache = new Map();
  function dataStranky(soubor) {
    if (!cache.has(soubor)) {
      let d = null;
      try {
        const m = fs.readFileSync(path.join(ROOT, soubor), 'utf8').match(/window\.PK_POZEMEK=(\{.*?\});/s);
        if (m) d = JSON.parse(m[1]);
      } catch (e) { /* soubor není — pozná se níž */ }
      cache.set(soubor, d);
    }
    return cache.get(soubor);
  }
  let radku = 0, sOdkazem = 0;
  const spatne = [];
  for (const f of regiony) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of html.matchAll(/<div class="okr-item"[^>]*>([\s\S]*?)<\/div>/g)) {
      const radek = m[1];
      /* Týž tvar řádku nosí i dlaždice okresů v „Pozemky v okolí" — ty
         odznak druhu nemají a na stránku pozemku vést nemají. */
      if (radek.indexOf('okr-badge') < 0) continue;
      radku++;
      const odkaz = radek.match(/<a class="okr-place" href="([^"]+)"/);
      if (!odkaz) continue;
      sOdkazem++;
      const d = dataStranky(odkaz[1]);
      if (!d) { spatne.push(`${f} → ${odkaz[1]}: stránka neexistuje nebo nenese data`); continue; }
      /* Viditelný text je VYSÁZENÝ (nezlomitelné mezery po jednopísmenných
         předložkách a před jednotkou), kdežto data v atributu ne — a je to
         tak správně, do strojových dat sazba nepatří. Porovnávat se tedy
         musí přes jednotnou mezeru, jinak „Hůrky u Lišova" neodpovídá
         „Hůrky u Lišova" a kontrola hlásí rozdíl, který na obrazovce není.
         Mezera před jednotkou je ze stejného důvodu v obou podobách —
         bez toho by vzor přestal sedět a kontrola by výměru a cenu tiše
         přeskakovala. */
      const bezNbsp = (s) => String(s).replace(/\u00a0/g, ' ');
      const obec = bezNbsp((radek.match(/<a class="okr-place" href="[^"]+">([^<]*)/) || [])[1] || '');
      const vym = radek.match(/<b>([\d\s\u00a0]+)[\s\u00a0]m²<\/b>/);
      const cen = radek.match(/<b>([\d\s\u00a0]+)[\s\u00a0]Kč<\/b>/);
      const cilObec = bezNbsp(String(d.k || '').split('|')[0]);
      if (cilObec !== obec) spatne.push(`${f} → ${odkaz[1]}: obec „${obec}" vs „${cilObec}"`);
      else if (vym && String(d.v) !== cislo(vym[1])) spatne.push(`${f} → ${odkaz[1]}: výměra ${cislo(vym[1])} vs ${d.v}`);
      else if (cen && String(d.c) !== cislo(cen[1])) spatne.push(`${f} → ${odkaz[1]}: cena ${cislo(cen[1])} vs ${d.c}`);
    }
  }
  /* Dvě pojistky, aby kontrola neměřila prázdno: musí se najít regionální
     stránky a v nich řádky s nabídkou. */
  pravda('regionální stránky s výpisem nabídek existují (jinak zkouška nic neměří)',
    regiony.length >= 50 && radku >= 500, `stránek ${regiony.length}, řádků ${radku}`);
  pravda('každý řádek nabídky vede na vlastní stránku pozemku',
    radku > 0 && sOdkazem === radku, `z ${radku} řádků odkazuje ${sOdkazem}`);
  pravda(`a odkaz vede na TEN pozemek — obec, výměra i cena sedí (ověřeno na ${sOdkazem} řádcích)`,
    spatne.length === 0, `${spatne.length} chyb: ` + spatne.slice(0, 4).join('; '));
}

/* ---------- Drobečky na stránce pozemku ----------
   Stránky krajů a okresů cestu k sobě měly, stránky pozemků ne — a to je
   1 993 z 2 113 stránek webu, navíc ty nejhlubší. Ve výsledku hledání se
   pak místo „Pozemky › Okres Benešov › …" ukáže holá adresa a není z ní
   poznat, kam vede.
   Hlídá se i to, že cesta je SKUTEČNÁ: okresní stránka vzniká jen tam, kde
   je dost nabídek, takže odkaz, který by vedl na neexistující soubor, je
   horší než žádný drobeček. */
{
  const stranky = fs.readdirSync(ROOT).filter((f) => /^pozemek-.+\.html$/.test(f));
  let sDrobecky = 0, mrtve = 0;
  const bez = [];
  for (const f of stranky) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    if (!m) { bez.push(f); continue; }
    let j;
    try { j = JSON.parse(m[1]); } catch { bez.push(f + ' (neplatný JSON)'); continue; }
    const bc = (Array.isArray(j) ? j : [j]).find((x) => x['@type'] === 'BreadcrumbList');
    if (!bc) { bez.push(f); continue; }
    sDrobecky++;
    for (const p of bc.itemListElement || []) {
      const u = String(p.item || '').replace(/^https?:\/\/[^/]+\//, '') || 'index.html';
      if (!fs.existsSync(path.join(ROOT, u))) { mrtve++; if (bez.length < 6) bez.push(`${f} → ${u}`); }
    }
  }
  /* Pojistka: bez stránek by obě kontroly níž prošly na prázdnu. */
  pravda('stránky pozemků se našly', stranky.length >= 500, `nalezeno ${stranky.length}`);
  pravda('každá má v strukturovaných datech cestu k sobě',
    sDrobecky >= stranky.length - 1, `s drobečky ${sDrobecky} z ${stranky.length}: ` + bez.slice(0, 4).join(', '));
  pravda('a žádný drobeček nevede na neexistující stránku', mrtve === 0,
    bez.slice(0, 4).join(', '));
}

console.log('\nStránky jednotlivých pozemků');
/* --- DALŠÍ POZEMKY V TÉŽE OBCI --------------------------------------
   Stránka pozemku odkazuje na mapu zúženou na tu obec a říká u toho
   číslo. Číslo je slib: mapa po klepnutí srovnává přesnou shodu obce
   a okresu, takže se musí rovnat tomu, co je v datech — bez duplicit
   a bez nabídek po termínu, protože ty mapa neukazuje.
   Jde se od NABÍDEK ke stránkám, ne naopak: jen tak se dá u každé
   stránky zeptat na tu její nabídku. */
{
  const { vObci } = await import('./generate-parcel-pages.mjs');
  /* VŠECHNY stránky, ne vzorek. Napřed tu byla každá sedmá (180 z 1 995)
     a při zkoušení sabotáže se ukázalo, proč to nestačí: přepsané číslo
     na stránce mimo vzorek prošlo bez poznámky. Přečíst všechny stojí
     pár sekund a chyba v generátoru se může týkat jen části stránek. */
  const vzorek = ukazane;
  let sOstruvkem = 0;
  const spatne = [];
  for (const d of vzorek) {
    const f = souborPro(d);
    const cesta = path.join(ROOT, f);
    if (!fs.existsSync(cesta)) continue;
    const html = fs.readFileSync(cesta, 'utf8');
    const m = /<script type="application\/json" id="pz-obec-data">([\s\S]*?)<\/script>/.exec(html);
    const ceka = vObci(d);
    if (!m) {
      if (ceka > 0) spatne.push(`${f}: v obci je ${ceka} dalších, ale stránka o tom mlčí`);
      continue;
    }
    sOstruvkem++;
    let o = null;
    try { o = JSON.parse(m[1]); } catch (e) { spatne.push(`${f}: ostrůvek není JSON`); continue; }
    if (!o || typeof o.text !== 'string' || typeof o.url !== 'string') {
      spatne.push(`${f}: ostrůvek nemá text a adresu`);
      continue;
    }
    const mu = /^index\.html\?obec=([^&]+)&okres=(.+)$/.exec(o.url);
    if (!mu) { spatne.push(`${f}: podivná adresa „${o.url}"`); continue; }
    const obec = decodeURIComponent(mu[1]), okres = decodeURIComponent(mu[2]);
    if (obec !== d.place || okres !== d.okres) {
      spatne.push(`${f}: odkaz vede na ${obec}/${okres}, pozemek je v ${d.place}/${d.okres}`);
      continue;
    }
    const mc = /ještě (?:jeden|(\d[\d\s\u00a0]*)) pozem/.exec(o.text);
    if (!mc) { spatne.push(`${f}: z věty nejde vyčíst počet („${o.text}")`); continue; }
    const psano = mc[1] ? Number(mc[1].replace(/[\s\u00a0]/g, '')) : 1;
    if (psano !== ceka) spatne.push(`${f} ${obec}: psáno ${psano}, v datech ${ceka}`);
    if (o.text.indexOf(obec) < 0) spatne.push(`${f}: ve větě není ${obec}`);
  }
  pravda('stránky s dalšími pozemky v obci se našly (jinak se nic nekontroluje)',
    sOstruvkem > 300, `${sOstruvkem} z ${vzorek.length} nabídek`);
  pravda('a číslo v té větě sedí s daty i s adresou, na kterou odkazuje',
    spatne.length === 0, spatne.slice(0, 4).join('; '));
}

/* --- POPIS STRÁNKY A JEJÍ TĚLO MUSÍ ŘÍKAT TOTÉŽ --------------------
   Titulek, popis pro vyhledávač i statický výpis se skládají v Node,
   tělo stránky dopočítá prohlížeč. U spoluvlastnického podílu se ty dvě
   strany rozešly: v popisu stálo „28 000 Kč (6 Kč/m²)" (cena dělená
   celou výměrou) a ve stránce 33 Kč/m² (cena dělená podílem). To menší
   číslo šlo do vyhledávače a do náhledu v chatu.
   Kontrola jde přes VŠECHNY stránky a porovnává je s týmž modulem,
   jakým počítá prohlížeč. */
{
  const fsy = await import('node:fs');
  new Function(fsy.readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))();
  const CENY = globalThis.PK_CENY;
  pravda('cenový model se dá spustit i v Node', !!(CENY && CENY.zaMetr));
  const { mapaSouboru } = await import('./generate-parcel-pages.mjs');
  let kontrolovano = 0, podilu = 0, bezCisla = 0;
  const spatne = [];
  for (const { d, soubor } of mapaSouboru(ukazane).values()) {
    const cesta = path.join(ROOT, soubor);
    if (!fs.existsSync(cesta)) continue;
    const html = fs.readFileSync(cesta, 'utf8');
    const md = /name="description" content="([^"]*)"/.exec(html);
    if (!md) { spatne.push(`${soubor}: chybí popis`); continue; }
    kontrolovano++;
    const ceka = (d.price && d.area) ? CENY.zaMetr(d) : null;
    const mc = /\((\d[\d\s\u00a0]*) Kč\/m²\)/.exec(md[1].replace(/\u00a0/g, ' '));
    const psano = mc ? Number(mc[1].replace(/[\s\u00a0]/g, '')) : null;
    if (ceka == null || !isFinite(ceka)) {
      if (psano != null) spatne.push(`${soubor}: cena za metr se spočítat nedá, a v popisu je ${psano}`);
      else bezCisla++;
    } else if (psano !== Math.round(ceka)) {
      spatne.push(`${soubor}: v popisu ${psano}, modul dává ${Math.round(ceka)}`);
    }
    if (d.podil) {
      podilu++;
      if (html.indexOf('spoluvlastnický podíl') < 0) {
        spatne.push(`${soubor}: je to podíl, ale ve statickém výpisu o tom nic není`);
      }
    }
  }
  pravda('popisy stránek se zkontrolovaly (jinak by kontrola mlčela)',
    kontrolovano > 1500, `${kontrolovano} stránek`);
  pravda('a jsou mezi nimi spoluvlastnické podíly', podilu > 300, `${podilu} podílů`);
  pravda('cena za metr v popisu stránky je tatáž, jakou spočítá prohlížeč',
    spatne.length === 0, spatne.slice(0, 4).join('; '));
}

/* --- DVĚ STRÁNKY SE STEJNÝM TITULKEM JSOU PRO VYHLEDÁVAČ JEDNA ------
 * Shodný titulek znamená, že vyhledávač stránky považuje za zaměnitelné
 * a část jich zahodí — ty pozemky pak nejsou vidět vůbec. Měřeno: z 2 121
 * stránek sdílelo titulek jedenáct (pět skupin) a popisek dvě.
 *
 * Nehlídá se „titulky jsou unikátní" natvrdo: u nabídek, které se v datech
 * neliší vůbec ničím, by to po titulku chtělo nemožné. Hlídá se tohle —
 * shodný titulek smí zůstat JEN tam, kde se ty nabídky neliší ani druhem,
 * ani výměrou, ani cenou, ani parcelou, ani termínem dražby.
 */
{
  const mapa = mapaSouboru(nabidky());
  const polozky = [...mapa.values()];
  pripravRozliseni(polozky.map((x) => x.d));
  pripravRozliseniPopisu(polozky.map((x) => x.d));
  pravda('stránek pozemků je dost na to, aby se shody vůbec mohly objevit',
    polozky.length > 500, `stránek ${polozky.length}`);

  const odlisitelne = (d) => [d.druh || '', d.area || 0, d.price || 0,
    String(d.parcel == null ? '' : d.parcel).trim(),
    (/(\d{4}-\d{2}-\d{2})/.exec(d.extra || '') || [''])[0]].join('|');

  for (const [co, vyber] of [['titulek', (t) => t.titul], ['popisek', (t) => t.popis]]) {
    const skupiny = new Map();
    for (const { d } of polozky) {
      const k = vyber(textyPro(d));
      if (!skupiny.has(k)) skupiny.set(k, []);
      skupiny.get(k).push(d);
    }
    const spatne = [];
    for (const [k, nabidkyVeSkupine] of skupiny) {
      if (nabidkyVeSkupine.length < 2) continue;
      const otisky = new Set(nabidkyVeSkupine.map(odlisitelne));
      if (otisky.size > 1) spatne.push(`„${k}" ×${nabidkyVeSkupine.length}`);
    }
    pravda(`žádné dvě rozlišitelné nabídky nemají týž ${co}`, spatne.length === 0,
      spatne.slice(0, 4).join(' | '));
  }
}

console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Stránky pozemků: kontroly neprošly.');
process.exit(chyb ? 1 : 0);
