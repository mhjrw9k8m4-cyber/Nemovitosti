/* VRSTVY (z-index): jeden vypsaný pořádek místo devětadvaceti čísel.
 *
 * Spuštění: node scripts/test-vrstvy.mjs   (nepotřebuje prohlížeč)
 *
 * Ve stylopisu bylo 29 různých hodnot z-indexu: -1, 0, 1, 2, 3, 4, 5,
 * 20, 21, 40, 41, 45, 90, 91, 100, 450, 500, 590, 600, 900, 1100, 1200,
 * 1300, 2500, 3000, 4000, 5000. Čísla sama nejsou chyba — chyba je, že
 * nikde nestálo, co je nad čím a proč, takže kdo přidával vrstvu,
 * napsal číslo o kus větší než to, co mu právě překrývalo panel.
 * Takhle vzniká 4000 vedle 5000 vedle 2500.
 *
 * TOHLE ČÍSLA NEPŘEČÍSLOVÁVÁ. Přečíslovat vrstvy znamená změnit, co je
 * nad čím, a to se nedá spolehlivě ověřit zkouškou — překryv nastává
 * jen v určitých okamžicích (otevřená nabídka nad otevřeným
 * našeptávačem nad mapou). Místo toho je pořádek VYPSANÝ: každá hodnota
 * má jméno a práci, pořadí musí být rostoucí a žádné jiné číslo se do
 * stylopisu nesmí dostat. Pořadí se tím nemění ani o pixel; mění se to,
 * že je ho vidět.
 *
 * Místní pořadí uvnitř součástky (-1 až 9) se nehlídá: tam jde o to,
 * jestli je odznak nad fotkou, ne o pořádek na stránce.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Pořádek vrstev, odspodu nahoru. Čísla jsou ta, která na webu už
   platí — tabulka je zapisuje, ne vymýšlí. */
export const VRSTVY = [
  [20, 'našeptávač lokality na stránce ceny'],
  [21, 'hláška nad tím našeptávačem'],
  [40, 'našeptávač na mapě'],
  [41, 'oprava překlepu nad ním'],
  [45, 'výsledky hledání na mapě'],
  [90, 'stín pod vysunutou nabídkou'],
  [91, 'vysunutá nabídka'],
  [100, 'odkaz „přeskočit na obsah"'],
  [450, 'závoj při kreslení výběru na mapě'],
  [500, 'ovladače nad mapou (zpět, legenda)'],
  [590, 'měřítko mapy'],
  [600, 'nástroje a nápovědy nad mapou'],
  [900, 'tlačítko „nahoru"'],
  [1100, 'hlavička'],
  [1200, 'vysouvací vrstva (rychlý výběr)'],
  [1300, 'vrstva nad vysouvací vrstvou (poloha, vývoz)'],
  [2500, 'panel stahování dat'],
  [3000, 'modální okno'],
  [4000, 'hlášení (toast)'],
  [5000, 'celoobrazovkové překrytí (mapa, rozcestník)'],
];
/* Pod touhle hranicí je pořadí místní věc součástky, ne stránky. */
export const MISTNI = 9;

const DOVOLENE = new Set(VRSTVY.map(([n]) => n));
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Komentáře se vybílí, délka zůstane — čísla řádků pak ukazují na
   opravdový řádek. Jinak by se do nálezů dostaly ty z komentářů,
   kterými je pořádek vrstev na místě vysvětlený. */
function ocisti(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '));
}

function najdi(t) {
  const out = [];
  for (const m of ocisti(t).matchAll(/z-index:\s*(-?\d+)/g)) {
    out.push({ n: Number(m[1]), radek: t.slice(0, m.index).split('\n').length });
  }
  return out;
}

/* ---- 1) vypsaný pořádek je rostoucí ---- */
let roste = true;
const spatne = [];
for (let i = 1; i < VRSTVY.length; i++) {
  if (VRSTVY[i][0] <= VRSTVY[i - 1][0]) {
    roste = false;
    spatne.push(`${VRSTVY[i - 1][0]} (${VRSTVY[i - 1][1]}) → ${VRSTVY[i][0]} (${VRSTVY[i][1]})`);
  }
}
pravda(`vypsaný pořádek vrstev je rostoucí (${VRSTVY.length} vrstev)`, roste, spatne.join(' | '));

/* ---- 2) ve stylopisu a na ručních stránkách není jiné číslo ---- */
const soubory = ['css/styles.css',
  ...readdirSync(KOREN).filter((f) => /\.html$/.test(f) && !/^(pozemek|pozemky)-/.test(f))];
let nalezeno = 0, zivych = 0;
const mimo = [];
for (const f of soubory) {
  let t;
  try { t = readFileSync(path.join(KOREN, f), 'utf8'); } catch (e) { continue; }
  const n = najdi(t);
  if (!n.length) continue;
  zivych++;
  for (const x of n) {
    nalezeno++;
    if (x.n >= -1 && x.n <= MISTNI) continue;   // místní pořadí v součástce
    if (DOVOLENE.has(x.n)) continue;
    mimo.push(`${f}:${x.radek}  z-index:${x.n}`);
  }
}
pravda('je co měřit — stylopis a stránky mají z-indexy', nalezeno >= 50,
  `nalezeno ${nalezeno} z-indexů v ${zivych} souborech`);
pravda('a žádný není mimo vypsaný pořádek',
  mimo.length === 0, mimo.slice(0, 10).join('\n      '));

/* ---- 3) každá vypsaná vrstva se opravdu používá ---- */
const pouzite = new Set();
for (const f of soubory) {
  let t; try { t = readFileSync(path.join(KOREN, f), 'utf8'); } catch (e) { continue; }
  for (const x of najdi(t)) pouzite.add(x.n);
}
const mrtve = VRSTVY.filter(([n]) => !pouzite.has(n)).map(([n, j]) => `${n} (${j})`);
pravda('a žádná vypsaná vrstva není mrtvá', mrtve.length === 0, mrtve.join(', '));

console.log('\nVrstvy (z-index)');
console.log(zpravy.join('\n'));
console.log(`  (vrstev ${VRSTVY.length}, z-indexů nalezeno ${nalezeno}, místní pořadí do ${MISTNI} se nehlídá)`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.error(`::error::Vrstvy: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' Nové číslo z-indexu nepřidávej — vyber vrstvu, do které to patří, nebo ji'
    + ' dopiš do VRSTVY i do komentáře ve styles.css a napiš, co je nad čím a proč.');
  process.exit(1);
}
