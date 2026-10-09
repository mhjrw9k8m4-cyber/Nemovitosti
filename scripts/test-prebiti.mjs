/* Test: dělá třída v HTML to, co slibuje — nebo ji stylopis mlčky přebíjí?
 *
 * Spuštění: node scripts/test-prebiti.mjs
 *
 * SKUTEČNÁ VADA, KTERÁ TO VYVOLALA. V stylopisu stálo `.pt-0{padding-top:0}`
 * a osm oddílů úvodní stránky tu třídu mělo v HTML. Jenže o osm set řádků
 * níž stojí `.section{padding:var(--oddil-y) 0}` — stejně silný výběr
 * (jedna třída), ale pozdější, a zkrácený zápis `padding` přepíše i horní
 * stranu. Třída tedy nedělala nic. Naměřeno na telefonu: mezi sousedními
 * oddíly zelo 160–180 px prázdna místo zamýšlených 80, osmkrát za sebou,
 * a stránka byla o 480 px delší, než měla být.
 *
 * Nic nespadlo, nic nevypadalo rozbitě, žádná zkouška si toho nevšimla —
 * stránka jenom byla prázdnější. Přesně ten druh vady, který se najde jen
 * měřením.
 *
 * CO SE HLÍDÁ. Dvojice pravidel se stejně silným výběrem (přesně jedna
 * třída), kde pozdější přepíše vlastnost dřívějšího — a obě třídy se
 * v nějaké stránce potkají na jednom prvku. Nehlídá se tedy teorie, ale
 * dvojice, které na webu opravdu stojí vedle sebe.
 *
 * Co se vědomě nehlídá:
 *   • pravidla uvnitř @media (tam je přebití často záměr: menší okraje
 *     na telefonu),
 *   • !important v dřívějším pravidle (to vyhraje bez ohledu na pořadí),
 *   • pozdější výběr, který dřívější třídu obsahuje (`.section.pt-0`) —
 *     to je přesně ta oprava, kterou tahle zkouška chce vidět.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Zkrácené zápisy a strany, které přepíšou. Jen ty, které web používá —
   seznam je schválně krátký a doslovný, ne chytrý. */
const ZKRATKY = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  inset: ['top', 'right', 'bottom', 'left'],
  gap: ['row-gap', 'column-gap'],
  overflow: ['overflow-x', 'overflow-y'],
  background: ['background-color', 'background-image', 'background-position',
    'background-size', 'background-repeat', 'background-attachment', 'background-clip', 'background-origin'],
  border: ['border-width', 'border-style', 'border-color',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius'],
  font: ['font-style', 'font-variant', 'font-weight', 'font-size', 'line-height', 'font-family'],
  flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
  transition: ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'],
  animation: ['animation-name', 'animation-duration', 'animation-timing-function',
    'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode'],
  outline: ['outline-width', 'outline-style', 'outline-color'],
  'list-style': ['list-style-type', 'list-style-position', 'list-style-image'],
  'text-decoration': ['text-decoration-line', 'text-decoration-color', 'text-decoration-style'],
  'grid-template': ['grid-template-rows', 'grid-template-columns', 'grid-template-areas'],
  'place-items': ['align-items', 'justify-items'],
  'place-content': ['align-content', 'justify-content'],
};
/* Přepíše pozdější ZKRÁCENÝ ZÁPIS `po` dřívější podrobnou vlastnost `pred`?
   Hlídá se jen tenhle směr. Když pozdější pravidlo staví TU SAMOU
   vlastnost (`.mono{letter-spacing}` → `.map-count{letter-spacing}`),
   je to obyčejný kaskádový přepis: autor ho vidí na první pohled a
   obvykle ho chce. Tiché je právě to druhé — `padding` sestřelí
   `padding-top`, aniž by o horním okraji kdekoli padlo slovo. */
function prepise(po, pred) {
  const l = ZKRATKY[po];
  return !!l && po !== pred && l.indexOf(pred) !== -1;
}
/* Pokrývá deklarace `po` vlastnost `pred` jakkoli — i tím, že je to ona
   sama? Tohle se ptá oprava: `.section.pt-0{padding-top:0}` vrací horní
   okraj zpátky toutéž vlastností, ne zkratkou. Nejdřív jsem i tady použil
   prepise() a zkouška hlásila vadu, která už byla opravená. */
function zakryva(po, pred) { return po === pred || prepise(po, pred); }

/* ---------- 1. přečíst stylopis a vytáhnout pravidla mimo @media ---------- */
const CSS_SOUBOR = 'css/styles.css';
/* Komentáře se nahrazují stejným počtem konců řádků, ne prázdnem —
   jinak čísla řádků v hlášení ukazují o stovky řádků vedle a člověk
   hledá vadu jinde, než je. */
const css = fs.readFileSync(path.join(ROOT, CSS_SOUBOR), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/* Ruční průchod, ne regulární výraz: potřebuju vědět, jestli jsem uvnitř
   @media, a to závorkové hloubce regulárním výrazem nespočítám. */
const pravidla = [];
{
  /* Ruční průchod, ne regulární výraz: potřebuju vědět, kde končí blok,
     a to závorkové hloubce regulárním výrazem nespočítám.
     KAŽDÉ @pravidlo SE PŘESKAKUJE CELÉ. Dřív se tu @media počítalo do
     hloubky a ostatní @pravidla se braly jako obyčejná — jenže @font-face
     taky otevírá složenou závorku, takže jakmile stylopis začal čtyřmi
     @font-face bloky, průchod si myslel, že je od té chvíle celý soubor
     uvnitř @media, a nenašel ani jedno pravidlo. Zkouška tehdy spadla na
     „nalezeno 0 pravidel" — a to je přesně ta pojistka, kvůli které tu je. */
  let i = 0;
  while (i < css.length) {
    const zav = css.indexOf('{', i);
    if (zav === -1) break;
    const prelude = css.slice(i, zav).trim();
    // konec bloku, ať je to pravidlo nebo @pravidlo
    let j = zav + 1, h = 1;
    while (j < css.length && h > 0) { if (css[j] === '{') h++; else if (css[j] === '}') h--; j++; }
    if (!prelude.startsWith('@')) {
      const telo = css.slice(zav + 1, j - 1);
      const radek = css.slice(0, zav).split('\n').length;
      const blok = zav;   // jeden blok = jedna složená závorka, i když má výběrů víc
      for (const sel of prelude.split(',').map((x) => x.trim()).filter(Boolean)) {
        pravidla.push({ sel, telo, radek, blok, poradi: pravidla.length });
      }
    }
    i = j;
  }
}
pravda(`stylopis ${CSS_SOUBOR} se přečetl a má pravidla mimo @media`, pravidla.length > 200,
  `nalezeno ${pravidla.length} pravidel`);

/* Jen výběry tvaru „přesně jedna třída" — stejná síla výběru (0-1-0). */
const SAMOTNA_TRIDA = /^\.([A-Za-z_][\w-]*)$/;
const jednotride = pravidla
  .map((r) => { const m = SAMOTNA_TRIDA.exec(r.sel); return m ? Object.assign({ trida: m[1] }, r) : null; })
  .filter(Boolean);
pravda('našly se výběry tvaru „jedna třída"', jednotride.length > 50, `nalezeno ${jednotride.length}`);

function deklarace(telo) {
  return telo.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const k = d.indexOf(':');
    if (k === -1) return null;
    return { vlastnost: d.slice(0, k).trim().toLowerCase(), hodnota: d.slice(k + 1).trim() };
  }).filter(Boolean).filter((d) => !d.vlastnost.startsWith('--'));
}

/* ---------- 2. dvojice, kde pozdější přebíjí dřívější ---------- */
const kandidati = [];
for (let a = 0; a < jednotride.length; a++) {
  const A = jednotride[a];
  const dA = deklarace(A.telo);
  for (let b = a + 1; b < jednotride.length; b++) {
    const B = jednotride[b];
    if (B.trida === A.trida) continue;
    /* Výběry z jednoho bloku (`.btn-primary, .header-cta{…}`) se nepřebíjejí
       — nesou tytéž deklarace a porovnávat je spolu nedává smysl. */
    if (B.blok === A.blok) continue;
    const dB = deklarace(B.telo);
    for (const x of dA) {
      if (/!important/i.test(x.hodnota)) continue;   // dřívější !important vyhraje
      for (const y of dB) {
        if (!prepise(y.vlastnost, x.vlastnost)) continue;
        kandidati.push({ drive: A, pozdeji: B, vlastnost: x.vlastnost, prepisujici: y.vlastnost });
      }
    }
  }
}

/* ---------- 3. potkají se ty třídy na jednom prvku? ---------- */
const zajimave = new Set();
for (const k of kandidati) { zajimave.add(k.drive.trida); zajimave.add(k.pozdeji.trida); }
const dvojice = new Set();   // "a|b" — třídy, které na webu stojí na jednom prvku
const stranky = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
let prvkuSTridou = 0;
for (const f of stranky) {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of h.matchAll(/\sclass="([^"]+)"/g)) {
    const t = m[1].split(/\s+/).filter((x) => zajimave.has(x));
    if (t.length < 2) continue;
    prvkuSTridou++;
    for (let i = 0; i < t.length; i++) for (let j = 0; j < t.length; j++) if (i !== j) dvojice.add(t[i] + '|' + t[j]);
  }
}
/* Pojistka proti průchodu na prázdnu: kdyby se stránky nepřečetly nebo
   se třídy přestaly psát do class="", nenašla by se žádná dvojice a
   zkouška by prošla, i kdyby byl stylopis rozbitý. */
pravda('ve stránkách se našly prvky se dvěma sledovanými třídami',
  stranky.length > 100 && prvkuSTridou > 0,
  `${stranky.length} stránek, ${prvkuSTridou} prvků, ${dvojice.size} dvojic`);

const nalezy = [];
for (const k of kandidati) {
  if (!dvojice.has(k.drive.trida + '|' + k.pozdeji.trida)) continue;
  /* Opravené případy: existuje pozdější pravidlo, jehož výběr obsahuje
     obě třídy (`.section.pt-0`) a staví tu samou vlastnost zpátky. */
  const opraveno = pravidla.some((r) =>
    r.poradi > k.pozdeji.poradi &&
    r.sel.indexOf('.' + k.drive.trida) !== -1 && r.sel.indexOf('.' + k.pozdeji.trida) !== -1 &&
    deklarace(r.telo).some((d) => zakryva(d.vlastnost, k.vlastnost)));
  if (opraveno) continue;
  nalezy.push(`.${k.drive.trida}{${k.vlastnost}} (ř. ${k.drive.radek}) přebíjí `
    + `.${k.pozdeji.trida}{${k.prepisujici}} (ř. ${k.pozdeji.radek})`);
}
pravda(`žádná třída v HTML není mlčky přebitá pozdějším pravidlem (${kandidati.length} dvojic prověřeno)`,
  nalezy.length === 0, nalezy.slice(0, 10).join('\n      ') + (nalezy.length > 10 ? `\n      …a dalších ${nalezy.length - 10}` : ''));

console.log('\nMlčky přebité třídy');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Přebité třídy: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
