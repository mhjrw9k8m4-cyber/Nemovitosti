#!/usr/bin/env node
/* ROZDĚLENÍ STYLOPISU: MAPOVÝ WEB SE NEMÁ STAHOVAT NA 2 182 STRÁNKÁCH
   ==================================================================
   NAMĚŘENO. css/styles.min.css má 210 kB (38 kB po zabalení) a je
   JEDINÝ pro celý web. Na stránce, která nemá mapu, se z toho opravdu
   použije 9–11 % (měřeno přes CSS coverage v prohlížeči). A protože
   stylopis blokuje vykreslení, čeká na něj každý návštěvník každé
   stránky, než uvidí první písmeno.

   U obsahových stránek je to dokonce TO HLAVNÍ, co se stahuje:
     kontakt.html         46 kB zabaleno celkem → 38 kB z toho stylopis (83 %)
     pozemky-okres-*.html 50 kB                 → 38 kB (76 %)
     muj-inzerat.html     48 kB                 → 38 kB (79 %)

   CO SE DĚLÁ. Zdroj zůstává jeden ručně psaný soubor (css/styles.css).
   Vedle očištěné plné kopie se staví druhá, zkrácená: css/zaklad.min.css,
   z níž jsou vyjmuta pravidla, která MOHOU zabrat jen na index.html
   (mapa, hero, filtry nabídek, vrstvy úřadů). Index si bere plnou,
   ostatní stránky zkrácenou.

   PROČ TO NEZMĚNÍ VZHLED. Vyjmutí pravidla nemůže přeskládat zbytek —
   pořadí ostatních pravidel, a tedy celá kaskáda, zůstává bajt na bajt
   stejné. Stačí tedy ukázat, že vyjmuté pravidlo na dané stránce zabrat
   NEMŮŽE. To se rozhoduje takto:

     • selektor se rozseká po čárkách; pravidlo zabere, zabere-li
       ASPOŇ JEDNA část, a část zabere jen tehdy, jsou-li na stránce
       přítomny VŠECHNY její třídy, id a jména atributů;
     • obsah :not(…) se škrtá — ten nic nevyžaduje;
     • část bez tříd, id a atributů (`body`, `a:hover`, `0%`)
       se nechává VŽDY. Typy a pseudotřídy se neřeší.

   CO SE POČÍTÁ JAKO „PŘÍTOMNO NA STRÁNCE". Nejen to, co je v HTML:
   třídy přidává i JavaScript (`hl-bez-pasu`, `active`) a Leaflet si
   své `.leaflet-*` tvoří sám. Proto se k tokenům stránky přičtou
   všechna slova ze VŠECH skriptů, které si stránka tahá — `js/min/*`
   i `vendor/leaflet/leaflet.js` — a z jejích vložených <script>/<style>.
   Je to schválně hrubé: slovo ve skriptu pravidlo ZACHOVÁ, i kdyby
   šlo o náhodnou shodu. Chybovat se tu smí jen jedním směrem.

   DRUHÁ POJISTKA. Vyjmou se jen pravidla, která na indexu zabrat
   mohou. Pravidlo, které nezabere NIKDE (zbytek po smazaných
   sekcích), zůstává v základu. Mazání mrtvých pravidel je jiná
   práce s jiným rizikem — tady se nic nemaže, jen přesouvá.

   TŘETÍ POJISTKA, a ta jediná opravdová: scripts/test-rozdeleni-stylu.mjs
   otevře stránku v prohlížeči dvakrát — s plným a se zkráceným
   stylopisem — a porovná VYPOČTENÉ styly každého prvku. Rozdíl = chyba.

   Spuštění:
     node scripts/rozdel-styly.mjs             postaví a přepíše odkazy
     node scripts/rozdel-styly.mjs --kontrola  nic nemění, jen ohlásí rozdíl
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ocisti } from './minifikace.mjs';
import { bezKomentaru } from './bez-komentaru.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZDROJ = path.join(KOREN, 'css', 'styles.css');
const ZAKLAD = path.join(KOREN, 'css', 'zaklad.min.css');

/* Stránky, které si berou PLNOU kopii. Jediná, kde stojí mapa. */
export const PLNY_STYLOPIS = new Set(['index.html']);

/* ==================================================================
   1. ROZPARSOVÁNÍ
   ------------------------------------------------------------------
   Vlastní, protože potřebuju přesné bajtové rozsahy ve ZDROJI, ne
   objektový model. Komentáře a texty v uvozovkách se přeskakují —
   v `content:"{"` i v `url(a*b)` může stát cokoli.
   ================================================================== */
export function rozparsuj(css) {
  const pravidla = [];
  const n = css.length;
  let i = 0, zacatek = 0;
  const zanoreni = [];
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < n && css[i] !== q) { if (css[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '{') {
      const hlava = css.slice(zacatek, i).trim();
      if (hlava.replace(/\/\*[\s\S]*?\*\//g, '').trim().startsWith('@')) {
        zanoreni.push(hlava); zacatek = i + 1; i++; continue;
      }
      let j = i + 1, hloubka = 1;
      while (j < n && hloubka > 0) {
        const d = css[j];
        if (d === '/' && css[j + 1] === '*') { const e = css.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; continue; }
        if (d === '"' || d === "'") { const q = d; j++; while (j < n && css[j] !== q) { if (css[j] === '\\') j++; j++; } j++; continue; }
        if (d === '{') hloubka++;
        else if (d === '}') hloubka--;
        j++;
      }
      pravidla.push({ selektor: hlava, vZanoreni: zanoreni.slice(), od: zacatek, do: j });
      i = j; zacatek = j; continue;
    }
    if (c === '}') { zanoreni.pop(); i++; zacatek = i; continue; }
    i++;
  }
  return pravidla;
}

/* ==================================================================
   2. SELEKTOR → TOKENY
   ================================================================== */
function rozdelCarkami(sel) {
  const casti = []; let hloubka = 0, od = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(' || c === '[') hloubka++;
    else if (c === ')' || c === ']') hloubka--;
    else if (c === ',' && hloubka === 0) { casti.push(sel.slice(od, i)); od = i + 1; }
  }
  casti.push(sel.slice(od));
  return casti.map((s) => s.trim()).filter(Boolean);
}

/** :not(…) nic nevyžaduje — jeho obsah se musí zahodit, jinak bychom
    pravidlo omylem označili za nedosažitelné. */
function bezNegace(cast) {
  let s = cast;
  for (;;) {
    const i = s.toLowerCase().indexOf(':not(');
    if (i < 0) return s;
    let j = i + 5, hloubka = 1;
    while (j < s.length && hloubka > 0) { if (s[j] === '(') hloubka++; else if (s[j] === ')') hloubka--; j++; }
    s = s.slice(0, i) + s.slice(j);
  }
}

export function castiSelektoru(sel) {
  const cisty = sel.replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  return rozdelCarkami(cisty).map((cast) => {
    const s = bezNegace(cast);
    const tokeny = new Set();
    for (const m of s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) tokeny.add('.' + m[1]);
    for (const m of s.matchAll(/#(-?[_a-zA-Z][\w-]*)/g)) tokeny.add('#' + m[1]);
    for (const m of s.matchAll(/\[\s*([\w-]+)/g)) tokeny.add('[' + m[1]);
    return { cast, tokeny };
  });
}

/* ==================================================================
   3. TOKENY STRÁNKY
   ================================================================== */
const cacheSkriptu = new Map();
function slovaSkriptu(url) {
  if (cacheSkriptu.has(url)) return cacheSkriptu.get(url);
  const s = new Set();
  try {
    const src = fs.readFileSync(path.join(KOREN, url), 'utf8');
    for (const m of src.matchAll(/[\w-]+/g)) s.add(m[0]);
  } catch (e) { /* stránka může odkazovat na soubor, který tu není — to hlídá test-staticka */ }
  cacheSkriptu.set(url, s);
  return s;
}

export function tokenyStranky(html) {
  const tridy = new Set(), idy = new Set(), atributy = new Set(), slova = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) for (const w of m[1].split(/\s+/)) if (w) tridy.add(w);
  for (const m of html.matchAll(/id="([^"]*)"/g)) if (m[1]) idy.add(m[1]);
  for (const m of html.matchAll(/\s([a-zA-Z][a-zA-Z0-9-]*)=/g)) atributy.add(m[1].toLowerCase());
  for (const m of html.matchAll(/(?:src|data-src)="([^"?]+\.js)[^"]*"/g)) {
    const u = m[1];
    if (/^(?:https?:)?\/\//.test(u) || u.startsWith('/')) continue;
    for (const w of slovaSkriptu(u)) slova.add(w);
  }
  /* KOMENTÁŘE SE NEPOČÍTAJÍ. Tokeny se tu sbírají jako SLOVA, protože
     jméno třídy se do skriptu dostane i přes `classList.add('x')` nebo
     slepením řetězců — na to se regulárním výrazem spolehlivě nepřijde.
     Jenže slovo je slovo i ve VYSVĚTLENÍ: stačilo, aby komentář ve
     vloženém stylu stránky pozemku citoval cizí pravidlo
     (`.rail .section-head::before{display:none}`), a zkrácený stylopis
     pro 2 202 stránek si kvůli tomu nechal sedm pravidel pro sloupcové
     rozvržení, které nosí jedině index.html. Komentář není kód. */
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) for (const w of bezKomentaru(m[1]).matchAll(/[\w-]+/g)) slova.add(w[0]);
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) for (const w of bezKomentaru(m[1], { radkove: false }).matchAll(/[\w-]+/g)) slova.add(w[0]);
  return { tridy, idy, atributy, slova };
}

export function sloucTokeny(seznam) {
  const out = { tridy: new Set(), idy: new Set(), atributy: new Set(), slova: new Set() };
  for (const t of seznam) for (const k of Object.keys(out)) for (const x of t[k]) out[k].add(x);
  return out;
}

export function muzeZabrat(casti, tokeny) {
  for (const { tokeny: potreba } of casti) {
    let ok = true;
    for (const t of potreba) {
      const jm = t.slice(1);
      if (t[0] === '.') { if (!tokeny.tridy.has(jm) && !tokeny.slova.has(jm)) { ok = false; break; } }
      else if (t[0] === '#') { if (!tokeny.idy.has(jm) && !tokeny.slova.has(jm)) { ok = false; break; } }
      else if (t[0] === '[') { if (!tokeny.atributy.has(jm.toLowerCase()) && !tokeny.slova.has(jm)) { ok = false; break; } }
    }
    if (ok) return true;
  }
  return false;
}

/* ==================================================================
   4. ROZDĚLENÍ
   ================================================================== */
/** Vrátí { css, vyjmuto, bajtu } — zdroj bez pravidel, která na
    `ostatni` zabrat nemohou a na `index` mohou. */
export function rozdel(zdroj, index, ostatni) {
  const pravidla = rozparsuj(zdroj);
  const vyjmout = [];
  for (const p of pravidla) {
    const casti = castiSelektoru(p.selektor);
    if (muzeZabrat(casti, ostatni)) continue;
    if (!muzeZabrat(casti, index)) continue;   /* mrtvé pravidlo – nechat */
    vyjmout.push(p);

  }
  vyjmout.sort((a, b) => a.od - b.od);
  let out = '', konec = 0;
  for (const p of vyjmout) { out += zdroj.slice(konec, p.od); konec = p.do; }
  out += zdroj.slice(konec);
  let mini = ocisti(out);
  /* Po vyjmutí zbydou prázdné @media{} — ty už nic neříkají. */
  for (;;) {
    const kratsi = mini.replace(/@[a-zA-Z-]+[^{}]*\{\}/g, '');
    if (kratsi === mini) break;
    mini = kratsi;
  }
  return { css: mini, vyjmuto: vyjmout.length, bajtu: vyjmout.reduce((s, p) => s + (p.do - p.od), 0) };
}

/* ==================================================================
   5. BĚH
   ================================================================== */
function nactiStranky() {
  return fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
}

export function postav() {
  const zdroj = fs.readFileSync(ZDROJ, 'utf8');
  const stranky = nactiStranky();
  const plne = [], zbytek = [];
  for (const f of stranky) {
    const t = tokenyStranky(fs.readFileSync(path.join(KOREN, f), 'utf8'));
    (PLNY_STYLOPIS.has(f) ? plne : zbytek).push(t);
  }
  if (!plne.length) throw new Error('rozdel-styly: index.html nenalezen');
  if (!zbytek.length) throw new Error('rozdel-styly: žádná stránka pro zkrácený stylopis');
  return { zdroj, vysledek: rozdel(zdroj, sloucTokeny(plne), sloucTokeny(zbytek)), stranky };
}

/* Při importu (test si bere funkce výš) se NESMÍ nic stavět ani přepisovat. */
if (import.meta.url === `file://${process.argv[1]}`) spust();

function spust() {
const kontrola = process.argv.includes('--kontrola');
const { zdroj, vysledek, stranky } = postav();
const chyby = [];

const stare = fs.existsSync(ZAKLAD) ? fs.readFileSync(ZAKLAD, 'utf8') : null;
if (stare !== vysledek.css) {
  if (kontrola) chyby.push('css/zaklad.min.css neodpovídá css/styles.css');
  else fs.writeFileSync(ZAKLAD, vysledek.css);
}

/* Odkazy ve stránkách: index plnou, ostatní zkrácenou. */
const VZOR_PLNY = /((?:href|src)=")css\/styles\.min\.css((?:\?v=[A-Za-z0-9]+)?")/g;
const VZOR_ZAKLAD = /((?:href|src)=")css\/zaklad\.min\.css((?:\?v=[A-Za-z0-9]+)?")/g;
let prepsano = 0;
for (const f of stranky) {
  const cesta = path.join(KOREN, f);
  const s = fs.readFileSync(cesta, 'utf8');
  const chce = PLNY_STYLOPIS.has(f) ? 'css/styles.min.css' : 'css/zaklad.min.css';
  const novy = chce === 'css/zaklad.min.css'
    ? s.replace(VZOR_PLNY, '$1css/zaklad.min.css$2')
    : s.replace(VZOR_ZAKLAD, '$1css/styles.min.css$2');
  if (novy === s) continue;
  if (kontrola) chyby.push(`${f} odkazuje na jiný stylopis než ${chce}`);
  else { fs.writeFileSync(cesta, novy); prepsano++; }
}

if (kontrola) {
  if (chyby.length) {
    console.log(chyby.slice(0, 5).join('\n'));
    console.log('spusťte node scripts/oprav.mjs');
    process.exit(1);
  }
  console.log('zkrácený stylopis je aktuální');
  process.exit(0);
}

const plna = Buffer.byteLength(ocisti(zdroj));
const zkracena = Buffer.byteLength(vysledek.css);
console.log(`zkrácený stylopis: ${vysledek.vyjmuto} pravidel jen pro mapu vyjmuto`);
console.log(`css/zaklad.min.css ${(zkracena / 1024).toFixed(1)} kB proti ${(plna / 1024).toFixed(1)} kB`
  + ` (−${(100 - 100 * zkracena / plna).toFixed(1)} %), přepsáno odkazů: ${prepsano}`);
}
