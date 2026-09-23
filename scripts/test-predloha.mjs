// Hlídač vizuálního jazyka (předloha.html).
//
// Spuštění: node scripts/test-predloha.mjs
//
// Systém se nerozpadne naráz — rozpadne se po jednom stínu. Někdo potřebuje
// kartu „o kousek výš", napíše si vlastní hodnotu, a za půl roku je jich
// zase sedmdesát a web je „suchý". Tenhle test to nedovolí: hloubka i tvar
// se musí brát z paletky.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Komentáře pryč. Bez tohohle test hlásí vlastní vysvětlivky: v komentáři
// se běžně píše „border-radius:14px", a hlídač by to bral jako prohřešek.
const ocisti = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');

// Sebekontrola: kdyby se odstraňovač komentářů rozbil, test by od té chvíle
// mlčel a nikdo by si toho nevšiml. Tohle ho přistihne hned.
{
  const vzorek = '/* box-shadow:0 9px 19px rgba(0,0,0,.5) v komentáři */\n.a{color:red;}';
  if (ocisti(vzorek).includes('box-shadow')) {
    console.error('::error::Odstraňovač komentářů nefunguje — test by hlásil vlastní vysvětlivky.');
    process.exit(1);
  }
}

const css = ocisti(readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8'));

let chyb = 0;
const rest = [];
function hlas(nadpis, seznam, rada) {
  if (!seznam.length) return;
  chyb += seznam.length;
  rest.push(`\n  ✕ ${nadpis} (${seznam.length}×)\n      ${rada}`);
  seznam.slice(0, 6).forEach((x) => rest.push('      · ' + x));
  if (seznam.length > 6) rest.push(`      · …a dalších ${seznam.length - 6}`);
}

/* ---------- 1. hloubka ---------- */
// Vlastní stín se pozná podle rozptylu. Obrysy (0 0 0 Npx), vnitřní stíny
// a záře podle barvy prvku mají jiný účel a do škály nepatří.
const vrstvy = (v) => v.split(/,(?![^()]*\))/);
const cisla = (c) => {
  const s = c.replace(/(?<![\d.\w-])0(?![\d.a-z%])/g, '0px');
  return (s.match(/-?\d+(?:\.\d+)?px/g) || []).map(parseFloat);
};
const vlastni = [];
for (const m of css.matchAll(/box-shadow:\s*([^;}]+)/g)) {
  const v = m[1].trim();
  if (v.startsWith('var(') || v === 'none' || v.includes('inset') || v.includes('currentColor')) continue;
  const rozptyl = Math.max(0, ...vrstvy(v).map((c) => { const n = cisla(c); return n.length >= 3 ? Math.abs(n[2]) : 0; }));
  if (rozptyl >= 6) vlastni.push(v.slice(0, 64));
}
hlas('Vlastní stín mimo paletku', vlastni,
  'Použijte var(--e1) až var(--e3), --e3-up pro panel zdola, --glow pro značkovou záři.');

/* ---------- 2. tvary ---------- */
// 2 a 3 px jsou vlasové proužky, 50 % a 999 px jsou kruhy — ty nejsou „tvar karty".
// „inherit" není nový tvar — prvek jen přebírá zaoblení rodiče, takže
// se škále nevymyká. Ostatní hodnoty musí být z paletky.
const POVOLENA = new Set(['2px', '3px', '50%', '999px', 'inherit']);
const tvary = [];
for (const m of css.matchAll(/border-radius:\s*([^;}]+)/g)) {
  const v = m[1].trim();
  if (v.includes('var(')) continue;               // z paletky (i rohový zápis)
  if (POVOLENA.has(v)) continue;
  // Rohový zápis smí mít jen nuly a vlasové hodnoty; cokoli většího patří
  // do paletky, jinak by se škála obešla zadními vrátky.
  if (v.split(/\s+/).every((x) => x === '0' || POVOLENA.has(x))) continue;
  tvary.push(v.slice(0, 40));
}
hlas('Zaoblení mimo paletku', tvary,
  'Použijte var(--r-xs) … var(--r-lg), nebo var(--r-pill) pro štítky.');

/* ---------- 3. paletka existuje ---------- */
const chybi = ['--e0','--e1','--e2','--e3','--e3-up','--glow','--glow-lg',
               '--r-xs','--r-sm','--r-md','--r-lg','--r-pill','--accent-warm']
  .filter((t) => !css.includes(t + ':'));
hlas('Chybí proměnná z paletky', chybi, 'Doplňte ji v :root v css/styles.css.');

/* ---------- 3b. každá použitá proměnná je i nadeklarovaná ----------
   Překlep v názvu proměnné se na webu NEPOZNÁ. `color: var(--text-mute)`
   u nedefinované proměnné není chyba, kterou by prohlížeč nahlásil —
   deklarace se jen zahodí a prvek zdědí barvu rodiče. Vypadá to skoro
   správně a nikdo si toho nevšimne. Takhle tu tiše žily tři řádky
   (čerstvost dat a oddělovač obcí na okresních stránkách), které měly
   být tlumené a nebyly.
   Proto: co se v šabloně použije, musí být v šabloně i nadeklarované.
   Proměnné bez výchozí hodnoty (druhý argument var()) se počítají —
   `var(--x, 0)` má záchranu a chybou není. */
{
  /* Proměnná se dá nastavit i zvenčí — `style="--w:42%"` ze skriptu. Taková
     v šabloně nadeklarovaná být nemůže a chybou není, tak se dohledá tam,
     odkud se vážně nastavuje. */
  const zvenku = ['js/main.js', 'js/pozemek.js', 'js/upozorneni.js', 'js/centrum.js']
    .filter((f) => existsSync(path.join(ROOT, f)))
    .map((f) => readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const deklarovane = new Set([
    ...[...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    ...[...zvenku.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  ]);
  const nedeklarovane = [...css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)]
    .map((m) => m[1])
    .filter((t, i, a) => a.indexOf(t) === i)
    .filter((t) => !deklarovane.has(t));
  hlas('Použitá proměnná, která nikde není nadeklarovaná', nedeklarovane,
    'Prohlížeč takovou deklaraci tiše zahodí a prvek zdědí barvu rodiče — chyba se nikde neprojeví.');
}

/* ---------- 4. předloha odpovídá skutečnosti ---------- */
// Vzorník, který ukazuje něco jiného než web, je horší než žádný.
const predloha = ocisti(readFileSync(path.join(ROOT, 'predloha.html'), 'utf8'));
const neznama = [...predloha.matchAll(/'(--[a-z0-9-]+)'/g)].map((m) => m[1])
  .filter((t, i, a) => a.indexOf(t) === i)
  .filter((t) => !css.includes(t + ':'));
hlas('Předloha ukazuje proměnnou, která v šabloně není', neznama,
  'Buď ji doplňte do :root, nebo ji z předlohy odeberte.');

/* ---------- výsledek ---------- */
const stinu = (css.match(/box-shadow:/g) || []).length;
const zTokenu = (css.match(/box-shadow:\s*var\(/g) || []).length;
console.log(`\nVizuální jazyk: ${stinu} stínů v šabloně, z toho ${zTokenu} z paletky`);
if (chyb) {
  console.log(rest.join('\n'));
  console.error(`\n::error::${chyb} odchylek od předlohy (predloha.html).`);
  process.exit(1);
}
console.log('Hloubka i tvary se berou z paletky.\n');
