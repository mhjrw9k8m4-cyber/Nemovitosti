/* Test: co z webu by na Safari nefungovalo — a co se tím ztratí.
   ==================================================================
   Spuštění: node scripts/test-safari.mjs   (bez prohlížeče)

   PROČ TENHLE SOUBOR VZNIKL. Všech 131 zkoušek v prohlížeči běží jen
   v Chromiu: jiný prohlížeč v prostředí NENÍ a nejde doinstalovat.
   O Safari tedy zelená CI neříká nic — a to je čtvrtina českých
   telefonů. Spustit ho nejde; zjistit, co z našeho kódu by v něm
   nefungovalo, jde. Tahle zkouška je ta druhá věc, a je to vědomá
   náhrada, ne rovnocenná: statický rozbor nepozná rozbité rozvržení,
   pozná POUŽITOU VLASTNOST, kterou daná verze nezná.

   PODLAHA: iOS/Safari 15.4 (březen 2022). Proč zrovna ta: každé
   zařízení, které umí iOS 15, umí i 15.8 — kdo je pod 15.4, neaktualizuje
   vůbec. Držet podlahu níž by znamenalo vzdát se `:has()`, `dvh`
   i `:focus-visible`, a to jsou věci, které web používá na rozvržení.
   Když se podlaha jednou posune, mění se JEDNO ČÍSLO níž.

   TŘI MOŽNÉ STAVY každé mladší vlastnosti — a jiný se nepřipouští:
     1. NEPOUŽÍVÁ SE (ideál, a hlídá se, že se nezačne),
     2. používá se SE ZÁLOHOU (např. `height:100vh; height:100dvh`),
     3. je na seznamu výjimek s napsaným důvodem, co se tím ztratí.

   CO TO NEPOZNÁ (a je to napsané, aby se tím nikdo nekonejšil):
   rozbité rozvržení, chybějící událost dotyku, jiné vykreslení písma.
   Na to je potřeba opravdový iPhone — viz docs/pro-majitele.md, bod 0b.
   ================================================================== */
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

export const PODLAHA = 15.4;

/* KOMENTÁŘ NENÍ KÓD. V tomhle repozitáři to hlídače spletlo už
   třikrát (naposledy u portů), takže se komentáře odstraňují ještě
   před hledáním — jinak by stačilo o vlastnosti napsat, že se
   nepoužívá, a hlídač by ji nahlásil. */
const bezKomentaru = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

/* Každý řádek: jméno, od které verze Safari to umí, vzor, a co se
   stane na starší verzi. Jsou tu jen vlastnosti, o kterých vím, od
   kdy jsou — hádat verzi by bylo horší než nehlídat nic. */
export const RYSY = [
  ['regulární výraz s pohledem dozadu (?<=…)', 16.4, /\(\?<[=!]/,
    'SyntaxError při načtení souboru — celý modul se nespustí, tedy nejhorší možný konec'],
  ['příznak d u regulárních výrazů (hasIndices)', 17, /\/[gimsuy]*d[gimsuy]*\s*[;,).]/,
    'SyntaxError při načtení souboru'],
  ['toSorted / toReversed / with na polích', 17.4, /\.(toSorted|toReversed|toSpliced)\s*\(/,
    'TypeError při prvním volání — spadne ta část stránky, která to volá'],
  ['Object.groupBy', 17.4, /Object\.groupBy\s*\(/, 'TypeError při prvním volání'],
  ['popover (atribut i showPopover)', 17, /showPopover\s*\(|\spopover=/,
    'okno se neotevře a nic to neřekne'],
  ['událost scrollend', 18.2, /['"]scrollend['"]/,
    'posluchač se nikdy nespustí — tiše, bez chyby'],
  ['CSS.registerProperty', 16.4, /CSS\.registerProperty/, 'výjimka při načtení skriptu'],
  ['atribut inert', 15.5, /\sinert[\s=>]/,
    'prvek zůstane dosažitelný tabulátorem, i když má být vypnutý'],
  ['@container (dotazy na kontejner)', 16, /@container\b/,
    'celé pravidlo se přeskočí — rozvržení zůstane v základní podobě'],
  ['color-mix()', 16.2, /color-mix\s*\(/, 'barva se nepoužije a prvek zůstane bez ní'],
  ['text-wrap: balance / pretty', 17.5, /text-wrap\s*:\s*(balance|pretty)/,
    'text se zalomí obyčejně — nic se neztratí kromě hezčího zlomu'],
  ['subgrid', 16, /grid-template-(rows|columns)\s*:[^;]*\bsubgrid\b/,
    'mřížka se rozpadne na základní rozvržení'],
  ['backdrop-filter bez -webkit- předpony', 18, /(?<![-\w])backdrop-filter\s*:/,
    'rozostření pozadí se neudělá'],
];

/* VÝJIMKY: co se používat SMÍ i nad podlahou, a co se tím ztrácí.
   Bez napsaného důvodu tu nemá co dělat ani jedna. */
export const VYJIMKY = new Map([
  ['text-wrap: balance / pretty',
    'jen hezčí zlomení nadpisu a jména místa; starší Safari zalomí obyčejně,'
    + ' nic se neztratí a není za to co dát jako záložní zápis'],
]);

/* Soubory, které se prohlížejí: zdroje pro prohlížeč. Očištěné kopie
   v js/min/ se vynechávají — jsou to tytéž soubory bez komentářů. */
function zdroje() {
  const ven = [];
  for (const [adr, vzor] of [['js', /\.js$/], ['css', /\.css$/]]) {
    for (const f of readdirSync(path.join(KOREN, adr))) {
      if (vzor.test(f)) ven.push(path.join(adr, f));
    }
  }
  for (const f of readdirSync(KOREN)) if (/\.html$/.test(f)) ven.push(f);
  for (const f of readdirSync(path.join(KOREN, 'scripts'))) {
    if (/^generate-.*\.mjs$|^sjednot-.*\.mjs$|^hlasic-chyb\.mjs$/.test(f)) {
      ven.push(path.join('scripts', f));
    }
  }
  return ven;
}

const soubory = zdroje();
pravda(`je co prohlížet — ${soubory.length} zdrojů pro prohlížeč`, soubory.length > 2000,
  `jen ${soubory.length}`);

/* Jeden průchod: každý soubor jednou, všechny vzory na něm. */
const nalezy = new Map();
for (const f of soubory) {
  let t = '';
  try { t = bezKomentaru(readFileSync(path.join(KOREN, f), 'utf8')); } catch (e) { continue; }
  for (const [jmeno, verze, vzor] of RYSY) {
    if (verze <= PODLAHA) continue;
    if (!vzor.test(t)) continue;
    if (!nalezy.has(jmeno)) nalezy.set(jmeno, []);
    nalezy.get(jmeno).push(f);
  }
}

const nepovolene = [...nalezy.entries()].filter(([jm]) => !VYJIMKY.has(jm));
pravda(`nic nad podlahou (Safari ${PODLAHA}) se nepoužívá bez napsaného důvodu`,
  nepovolene.length === 0,
  nepovolene.map(([jm, kde]) => {
    const r = RYSY.find((x) => x[0] === jm);
    return `${jm} (až od ${r[1]}): ${kde.length} souborů, např. ${kde.slice(0, 3).join(', ')}`
      + ` — na starším Safari: ${r[3]}`;
  }).join('\n      '));

/* Výjimky se vypisují VŽDY, i když je všechno v pořádku: seznam, který
   nikdo nevidí, za rok nikdo nereviduje. */
for (const [jm, duvod] of VYJIMKY) {
  const kde = nalezy.get(jm) || [];
  const r = RYSY.find((x) => x[0] === jm);
  zpravy.push(`  ~ povoleno nad podlahou: ${jm} (od ${r ? r[1] : '?'}) v ${kde.length} souborech`
    + `\n      ${duvod}`);
}

/* ---- dvh: záloha ve vh musí být, a to ve stejné deklaraci -------- */
/* Dvě z pěti měla zálohu a tři ne. Rozvržení tam výšku zachránilo
   (naměřeno 25. 10.), takže to nebyla živá vada — ale pravidlo
   provedené na dvou místech z pěti není pravidlo.

   Nehledá se v okně znaků před nálezem (to by u `calc(...)` selhalo),
   ale v NEJVNITŘNĚJŠÍM bloku `{…}`: tam musí být o téže vlastnosti
   dřívější deklarace BEZ dvh. To je přesně ta záloha — prohlížeč,
   který druhé deklaraci nerozumí, zahodí ji a zůstane u první.

   Pozor na `\b` před `dvh`: `100dvh` před `d` hranici slova NEMÁ
   (`0` i `d` jsou znaky slova), takže `\bdvh` nenajde nic. Tahle
   zkouška na to poprvé naletěla a hlásila „0 použití“. */
{
  const css = bezKomentaru(readFileSync(path.join(KOREN, 'css', 'styles.css'), 'utf8'));
  const kolik = [...css.matchAll(/dvh\b/g)].length;
  const bez = [];
  for (const blok of css.matchAll(/\{[^{}]*\}/g)) {
    const deklarace = [...blok[0].matchAll(/([a-z-]+)\s*:\s*([^;{}]*)/g)]
      .map((m) => [m[1], m[2]]);
    deklarace.forEach(([vlastnost, hodnota], i) => {
      if (!/dvh\b/.test(hodnota)) return;
      const zaloha = deklarace.slice(0, i)
        .some(([v, h]) => v === vlastnost && !/dvh\b/.test(h) && /\bvh\b|\d+vh\b/.test(h));
      if (!zaloha) bez.push(`${vlastnost}:${hodnota.trim().slice(0, 50)}`);
    });
  }
  pravda(`každé použití dvh má zálohu ve vh (${kolik} použití)`,
    kolik > 0 && bez.length === 0,
    (kolik === 0 ? 'nenašlo se ani jedno dvh — vzor nehledá to, co si myslí'
      : 'bez zálohy: ' + bez.join(' | ')) + ' — na Safari pod 15.4 se deklarace'
    + ' zahodí a výška zůstane na tom, co řekne rozvržení');
}

/* ---- a to, co tahle zkouška NEUMÍ, ať je vidět -------------------- */
zpravy.push('  ! co statický rozbor nepozná: rozbité rozvržení, chybějící dotyk,'
  + ' jiné vykreslení písma. Na to je potřeba iPhone (docs/pro-majitele.md, bod 0b).');

console.log('\nSafari a iOS: co by v nich nefungovalo');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Safari: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
