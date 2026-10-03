// Test: jeden styl — pojmenovaná hodnota místo opsaného čísla.
//
// Spuštění: node scripts/test-jeden-styl.mjs   (nepotřebuje prohlížeč)
//
// O velikosti h1 rozhodovalo patnáct pravidel na pěti místech předlohy.
// Vyšlo z toho, že tentýž prvek měl na široké obrazovce:
//     titulní          92 px
//     návod            54 px
//     kraj / okres     50 px
//     detail pozemku   50 px
//     nástroj          28 px
// a k tomu návod i detail měnily velikost SKOKEM přes @media, kdežto
// krajská stránka hned vedle plynula. Rozdíl 50 a 54 px nebylo rozhodnutí,
// byla to nehoda — a právě z takových nehod je web „rozházený".
//
// Teď jsou tři stupně a každý má důvod:
//     --h1-stranka   obsah (2 109 stránek)
//     --h1-domu      titulní, jediný plakát na webu
//     --h1-nastroj   nástroje, kde nadpis nemá křičet
//
// Pravidlo: každé pravidlo, které určuje velikost h1, bere hodnotu
// z některého z těch tří stupňů — nebo stojí v seznamu výjimek s důvodem.
import { readFileSync } from 'node:fs';

const zdroj = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const css = zdroj.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const STUPNE = ['--h1-stranka', '--h1-domu', '--h1-nastroj'];

// Výjimky: pravidlo, které velikost h1 mění, ale stupeň nést nemůže.
// Klíč je selektor, hodnota důvod. Bez důvodu tu nemá co dělat.
const VYJIMKY = {
  '.hero-map .hero-head h1':
    'plakát na titulní straně se na úzkém okně chová jinak než ostatní nadpisy: '
    + 'nad mapou musí ustoupit, aby zůstalo vidět Česko, ne jen písmo',
  '.hero-head h1':
    'starší podoba hlavičky titulní strany, kterou .hero-map přebíjí; '
    + 'nese jen záchranné hodnoty, kdyby se mapa nenačetla',
};

// --- Projdi předlohu a najdi KAŽDÉ pravidlo s font-size u h1 ----------
// Čte se po znacích, protože @media se zavírají a „poslední @media nad
// řádkem" o zanoření nic neříká — měření, které to nehlídalo, u jednoho
// pravidla ohlásilo @media, v němž vůbec nestálo.
const radky = css.split('\n');
const zasobnik = [];
let hlava = '';
const nalezy = [];
for (let i = 0; i < radky.length; i++) {
  const r = radky[i];
  for (const c of r) {
    if (c === '{') { zasobnik.push(hlava.trim()); hlava = ''; }
    else if (c === '}') { zasobnik.pop(); hlava = ''; }
    else hlava += c;
  }
  const fsm = r.match(/font-size\s*:\s*([^;}]+)/);
  if (!fsm) continue;
  const vRadku = r.match(/^\s*([^{@}]+?)\s*\{[^}]*font-size/);
  const sel = vRadku ? vRadku[1].trim()
    : [...zasobnik].reverse().find((x) => x && !x.startsWith('@')) || '';
  if (!/(^|[\s,>+~])h1\b/.test(sel)) continue;
  nalezy.push({ radek: i + 1, sel, hodnota: fsm[1].trim(),
                media: zasobnik.filter((x) => x.startsWith('@media')) });
}

// --- Předpoklady ------------------------------------------------------
pravda('stupně nadpisu jsou v paletě',
  STUPNE.every((t) => new RegExp(`${t}\\s*:`).test(css)),
  'chybí: ' + STUPNE.filter((t) => !new RegExp(`${t}\\s*:`).test(css)).join(', '));
pravda('test našel pravidla, která velikost h1 určují', nalezy.length >= 5,
  `nalezeno jen ${nalezy.length} — čte test vůbec předlohu?`);

// --- Pravidlo ---------------------------------------------------------
const cizi = nalezy.filter((n) => {
  if (STUPNE.some((t) => n.hodnota.includes(`var(${t})`))) return false;
  return !(n.sel in VYJIMKY);
});
pravda('velikost h1 pochází z pojmenovaného stupně, ne z opsaného čísla',
  cizi.length === 0,
  cizi.map((n) => `r.${n.radek} „${n.sel}" = ${n.hodnota} ${n.media.join(' ')}`).join('\n      '));

// --- Obsahové stránky mají jeden a týž stupeň -------------------------
const OBSAH = ['h1', '.okr-hero h1', '.add-hero:not(.app-hero) h1'];
for (const sel of OBSAH) {
  const n = nalezy.find((x) => x.sel === sel);
  pravda(`„${sel}" nese --h1-stranka`,
    !!n && n.hodnota.includes('var(--h1-stranka)'),
    n ? `nese ${n.hodnota}` : 'pravidlo v předloze není — změnil se selektor?');
}

// --- Výjimka musí být odůvodněná a musí být k čemu -------------------
for (const [sel, duvod] of Object.entries(VYJIMKY)) {
  pravda(`výjimka „${sel}" má důvod`, typeof duvod === 'string' && duvod.length >= 30,
    'důvod chybí nebo je příliš krátký');
  pravda(`výjimka „${sel}" se v předloze opravdu vyskytuje`,
    nalezy.some((n) => n.sel === sel),
    'pravidlo v předloze není — výjimka ze seznamu patří pryč');
}

// --- A nadpis nesmí měnit velikost skokem tam, kde nese stupeň -------
const skokem = nalezy.filter((n) => n.media.length > 0
  && STUPNE.some((t) => n.hodnota.includes(`var(${t})`)) === false
  && OBSAH.includes(n.sel));
pravda('obsahový nadpis už velikost nemění přes @media',
  skokem.length === 0,
  skokem.map((n) => `r.${n.radek} „${n.sel}" = ${n.hodnota} v ${n.media.join(' ')}`).join('\n      '));

// =====================================================================
// MŘÍŽKOVÁ TEXTURA na tmavých plochách
//
// Tutéž mřížku (bílá čára 1 px při 6 % krytí) nesou tři tmavé plochy:
// proužek na titulní, krajský pás a úvod návodů. Dvě z nich měly buňku
// 52 px a třetí 58 px — rozdíl, který nikdo nerozhodl a který se při
// přechodu mezi stránkami pozná jako jiná hrubost podkladu.
// Teď je velikost i barva čáry v paletě a všechny tři ji berou odtud.
// =====================================================================
const TEXTURA = ['--mrizka-bunka', '--mrizka-bunka-panel',
                 '--mrizka-cara-tmava', '--mrizka-cara-svetla'];
pravda('mřížková textura má hodnoty v paletě',
  TEXTURA.every((t) => new RegExp(`${t}\\s*:`).test(css)),
  'chybí: ' + TEXTURA.filter((t) => !new RegExp(`${t}\\s*:`).test(css)).join(', '));

// Najdi každé pravidlo, které mřížku kreslí: dva lineární přechody s 1px čárou.
// Výraz nesmí končit na první závorce — čára je dnes var(--…), a zápis
// „[^)]*1px" proto nenašel ANI JEDNU plochu. Dřív našel tři, protože hledal
// jen jedno konkrétní krytí; ve skutečnosti jich je šest.
const bloky = [];
{
  let hloubka = 0, zacatek = 0, sel = '', h = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') { if (hloubka === 0) { sel = h.trim(); zacatek = i; } hloubka++; h = ''; }
    else if (c === '}') { hloubka--; if (hloubka === 0) bloky.push({ sel, text: css.slice(zacatek, i) }); h = ''; }
    else if (hloubka === 0) h += c;
  }
}
const mrizky = bloky.filter((b) =>
  (b.text.match(/linear-gradient\(to (?:right|bottom),[^;]*?1px/g) || []).length >= 2);
/* Počet je tu schválně přesný, ne „aspoň sedm". Když texturu dostane další
   plocha, má to být rozhodnutí: zvedni číslo a dole ověř, že nová plocha
   bere rozteč i barvu z palety. Kdyby tu stálo „aspoň", přibyla by plocha
   s opsanými čísly a test by mlčel. */
pravda('test našel všech sedm ploch s mřížkovou texturou', mrizky.length === 7,
  `nalezeno ${mrizky.length}, čekám 7 — pokud texturu dostala další plocha, `
  + 'zvedni číslo v testu:\n      '
  + mrizky.map((b) => b.sel.trim().slice(0, 34)).join(' | '));

const CARY = ['var(--mrizka-cara-tmava)', 'var(--mrizka-cara-svetla)'];
const ROZTECE = ['var(--mrizka-bunka)', 'var(--mrizka-bunka-panel)'];
const opsane = mrizky.filter((b) => {
  const bunka = (b.text.match(/background-size:\s*([^;}]+)/) || [])[1] || '';
  const cara = (b.text.match(/linear-gradient\(to right,\s*([^,]+)/) || [])[1] || '';
  return !ROZTECE.some((r) => bunka.includes(r)) || !CARY.some((c) => cara.includes(c));
});
pravda('každá mřížka bere rozteč i barvu čáry z palety',
  opsane.length === 0,
  opsane.map((b) => `„${b.sel.trim().slice(0, 40)}" — rozteč `
    + ((b.text.match(/background-size:\s*([^;}]+)/) || [])[1] || '?').trim()
    + ', čára ' + ((b.text.match(/linear-gradient\(to right,\s*([^,]+)/) || [])[1] || '?').trim()).join('\n      '));

// Rozteče smí být nejvýš dvě — velké plochy a malý panel. Třetí hodnota
// už by byla hrubost bez důvodu, a právě tři jich tu dřív byly.
const roztece = new Set(mrizky.map((b) =>
  ((b.text.match(/background-size:\s*([^;}]+)/) || [])[1] || '').trim()));
pravda('rozteče jsou nejvýš dvě a obě pojmenované', roztece.size <= 2
  && [...roztece].every((r) => ROZTECE.some((t) => r.includes(t))),
  'rozteče: ' + [...roztece].join('  |  '));

console.log('\nJeden styl — pojmenovaná hodnota místo opsaného čísla');
console.log(zpravy.join('\n'));
console.log(`\nzměřeno: ${nalezy.length} pravidel určuje velikost h1`);
nalezy.forEach((n) => console.log(`   r.${String(n.radek).padStart(4)}  ${n.hodnota.padEnd(20)} ${n.sel}`));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Jeden styl: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
