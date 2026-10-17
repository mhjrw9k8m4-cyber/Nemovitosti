/* Test: stejná funkce nesmí ležet dvakrát na téže stránce.
   ====================================================================
   Spuštění: node scripts/test-dvojnici.mjs   (bez sítě, bez prohlížeče)

   PROČ. Web nemá bundler: každá stránka si načte ty moduly, které
   potřebuje, a modul si nesmí nic „doimportovat". Důsledek je, že se
   drobné pomůcky (escapování HTML, medián, zlomek podílu) psaly znovu
   v každém modulu, který je potřeboval. Změřeno: sedmnáct funkcí má
   v js/ bajt po bajtu totožné dvojče a ŠEST dvojic se potkává na téže
   stránce — tedy se stáhnou obě.

   Bajty jsou tu to menší zlo. Horší je ROZEJÍT SE: když někdo opraví
   escapování v jedné kopii a druhou nenajde, část stránky se opraví
   a část ne, a nic to neřekne. Přesně to tahle zkouška hlídá.

   JAK. Z každého js/*.js se vytáhnou těla funkcí, znormalizují
   (komentáře a mezery pryč) a porovnají. Dvojice, které se sejdou na
   jedné stránce, musí stát v seznamu KOPIE — a u každé je napsané,
   PROČ se nesloučila. Seznam se kontroluje i obráceně: když dvojice
   zmizí (sloučila se, nebo se jedna kopie změnila a druhá ne), zkouška
   to taky řekne. Jinak by seznam tiše zestárl a přestal něco znamenat.

   CO SE SLOUČIT DÁ, TO SE SLOUČILO. pozemek.js měl vlastní pkOtisk(),
   přestože na téže stránce leží js/klic.js, který totéž vyváží jako
   PKKlic.otisk — a pozemek.js na PKKlic stejně sahá o pár řádků výš.
   Ten je pryč.
   ==================================================================== */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Dvojice, které na téže stránce ZŮSTÁVAJÍ — a proč. Klíč je dvojice
   „soubor:funkce" seřazená abecedně, hodnota důvod. */
const KOPIE = {
  'js/ceny.js:zaMetr | js/hlidani-logika.js:zaMetr':
    'hlidani-logika.js běží i v Node (rozesílač pošty) a nesmí si přitáhnout ceny.js, '
    + 'který sahá na DOM; sloučení by znamenalo závislost jen kvůli třem řádkům',
  'js/ceny.js:zlomekPodilu | js/hlidani-logika.js:zlomekPodilu':
    'totéž: rozesílač počítá shodu hlídání bez prohlížeče, tedy bez ceny.js',
  'js/exif.js:datumNaCas | js/kontrola.js:datumNaCas':
    'kontrola.js čte čas z EXIFu fotky, ale na exif.js nezávisí (a nesmí — '
    + 'kontrola běží i tam, kde se EXIF nečte); u kopie je to napsané v komentáři',
  'js/hledani.js:median | js/okruh.js:median':
    'okruh.js median nevyváží (PKOkruh má jen vzdálenosti) a kvůli třem řádkům '
    + 'se veřejné rozhraní modulu rozšiřovat nebude',
  'js/pridat.js:escHtml | js/snimek.js:esc':
    'totéž escapování jako níž, jen pod jiným jménem a na stránce přidávání; '
    + 'snimek.js je samostatný doplněk a nic nevyváží',
  'js/pozemek.js:esc | js/snimek.js:esc':
    'snimek.js je samostatný doplněk stránky pozemku; ani jeden modul escapování '
    + 'nevyváží a vzájemná závislost by byla dražší než pět řádků',
  'js/poznamky.js:klicPozemku | js/videno.js:klicPozemku':
    'obě kopie jsou jen obal nad PKKlic.klicPozemku se záchytem, když klic.js chybí; '
    + 'vlastní logika je sdílená už dnes',
  'js/poznamky.js:klicVeSchrance | js/videno.js:klicVeSchrance':
    'totéž — obal nad PKKlic.klicVe',
};

/* ---------- 1) Kdo s kým leží na jedné stránce ---------- */
const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html')
  && !/^pozemek-/.test(f) && !/^pozemky-/.test(f));
const dvojice = new Map();   // klíč „první modul|druhý modul" → stránky, kde jsou spolu
for (const f of stranky) {
  const html = readFileSync(path.join(KOREN, f), 'utf8');
  const moduly = [...new Set([...html.matchAll(/src="js\/(?:min\/)?([a-z0-9-]+)\.js/g)]
    .map((m) => 'js/' + m[1] + '.js'))];
  for (let i = 0; i < moduly.length; i++) {
    for (let j = i + 1; j < moduly.length; j++) {
      const k = [moduly[i], moduly[j]].sort().join('|');
      if (!dvojice.has(k)) dvojice.set(k, []);
      dvojice.get(k).push(f);
    }
  }
}
pravda('stránky se daly přečíst a moduly z nich vytáhnout',
  stranky.length > 10 && dvojice.size > 50,
  `stránek ${stranky.length}, dvojic modulů ${dvojice.size} — nic by se neměřilo`);

/* ---------- 2) Těla funkcí ---------- */
function telaFunkci(zdroj) {
  const out = [];
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(zdroj))) {
    let hl = 0, i = m.end = re.lastIndex - 1, j = i;
    while (j < zdroj.length) {
      if (zdroj[j] === '{') hl++;
      else if (zdroj[j] === '}') { hl--; if (hl === 0) break; }
      j++;
    }
    const telo = zdroj.slice(re.lastIndex, j);
    const norm = telo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      .replace(/\s+/g, ' ').trim();
    /* Krátká těla se shodují náhodou („return x;"), ty se neřeší. */
    if (norm.length >= 80) out.push({ jmeno: m[1], norm });
  }
  return out;
}

const podleTela = new Map();
for (const f of readdirSync(path.join(KOREN, 'js')).filter((x) => x.endsWith('.js')).sort()) {
  const cesta = 'js/' + f;
  for (const { jmeno, norm } of telaFunkci(readFileSync(path.join(KOREN, cesta), 'utf8'))) {
    if (!podleTela.has(norm)) podleTela.set(norm, []);
    podleTela.get(norm).push({ cesta, jmeno });
  }
}

/* ---------- 3) Dvojčata, která se potkávají na jedné stránce ---------- */
const nalezene = new Map();
for (const vyskyty of podleTela.values()) {
  if (vyskyty.length < 2) continue;
  for (let i = 0; i < vyskyty.length; i++) {
    for (let j = i + 1; j < vyskyty.length; j++) {
      const a = vyskyty[i], b = vyskyty[j];
      if (a.cesta === b.cesta) continue;
      const parKlic = [a.cesta, b.cesta].sort().join('|');
      const kde = dvojice.get(parKlic);
      if (!kde || !kde.length) continue;         // nikdy spolu — ať si kopii mají
      const klic = [`${a.cesta}:${a.jmeno}`, `${b.cesta}:${b.jmeno}`].sort().join(' | ');
      if (!nalezene.has(klic)) nalezene.set(klic, kde);
    }
  }
}

const bezDuvodu = [...nalezene.keys()].filter((k) => !KOPIE[k]);
pravda('žádná nová dvojí kopie téže funkce na jedné stránce', bezDuvodu.length === 0,
  bezDuvodu.map((k) => `${k}  (spolu na: ${nalezene.get(k).slice(0, 3).join(', ')})`).join('\n      ')
  + '\n      Buď to sluč, nebo to napiš do seznamu KOPIE i s důvodem.');

const zastarale = Object.keys(KOPIE).filter((k) => !nalezene.has(k));
pravda('a v seznamu nestojí dvojice, která už neexistuje', zastarale.length === 0,
  zastarale.join('\n      ') + '\n      Kopie se sloučily, nebo se JEDNA Z NICH ZMĚNILA a druhá ne.'
  + ' To druhé je ten případ, kvůli kterému tahle zkouška je: oprava jen v jedné kopii.');

/* ---------- 4) Co se sloučit dalo, je sloučené ---------- */
const pozemek = readFileSync(path.join(KOREN, 'js', 'pozemek.js'), 'utf8');
pravda('pozemek.js počítá otisk přes PKKlic, ne vlastní kopií',
  !/function pkOtisk/.test(pozemek) && /PKKlic\.otisk\(/.test(pozemek),
  'vrátila se vlastní kopie otisku — klic.js ji vyváží jako PKKlic.otisk');

console.log('\nDvojí kopie funkcí na jedné stránce');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Kopie funkcí: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
