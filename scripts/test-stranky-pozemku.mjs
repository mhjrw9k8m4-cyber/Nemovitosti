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
import { souborPro, pkey, textyPro, slug } from './generate-parcel-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
const pozemky = D.filter((d) => isFinite(d.lat) && isFinite(d.lng) && d.place && d.okres);

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
for (const d of pozemky) {
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

// --- 4) náhled musí existovat pro každý okres ---------------------------
const bezNahledu = [...new Set(pozemky.map((d) => d.okres))]
  .filter((o) => !fs.existsSync(path.join(ROOT, 'assets', 'og', `okres-${slug(o)}.png`)));
pravda('každý okres má náhledový obrázek pro sdílení', bezNahledu.length === 0,
  `bez náhledu: ${bezNahledu.join(', ')}`);

console.log('\nStránky jednotlivých pozemků');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Stránky pozemků: kontroly neprošly.');
process.exit(chyb ? 1 : 0);
