// Testy rozhodování nad tím, co model na fotce vidí (js/fototema.js).
//
// Čísla nejsou vymyšlená: jsou to skutečné výstupy MobileNetu
// (assets/mobilenet/) na konkrétních obrázcích — změřené při jeho zapojení.
// Kdo změní skupiny tříd nebo prahy, tady hned uvidí, co to udělá.
//
// Spuštění: node scripts/test-fototema.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const F = require_(path.join(ROOT, 'js', 'fototema.js'));
const TRIDY = require_(path.join(ROOT, 'js', 'tridy-imagenet.js'));

let bezi = 0, spadlo = 0;
function tvrdi(popis, podminka, detail) {
  bezi++;
  if (!podminka) { spadlo++; console.log(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}
const p = (...dvojice) => dvojice.map(([trida, jistota]) => ({ trida, jistota }));

/* ---------- skutečně naměřené výstupy ---------- */

// Balíček slaniny z obchodu (výřez ze snímku, který přišel jako hlášení chyby)
const slanina = p(
  ['packet', 25.7], ['nipple', 10.5], ['rotisserie', 10.0],
  ['plastic bag', 4.3], ['refrigerator, icebox', 3.7]
);
const r1 = F.vyhodnot(slanina);
tvrdi('fotka zabaleného zboží neprojde', r1.ok === false, JSON.stringify(r1));
tvrdi('hláška řekne, co na fotce je', /zabalené zboží/.test(r1.msg || ''), r1.msg);

// Výřez stránky s textem (tedy snímek obrazovky)
const stranka = p(
  ['envelope', 46.4], ['web site, website, internet site, site', 43.6],
  ['rule, ruler', 3.7], ['slide rule, slipstick', 0.9], ['carton', 0.6]
);
const r2 = F.vyhodnot(stranka);
tvrdi('snímek stránky neprojde', r2.ok === false, JSON.stringify(r2));
tvrdi('hláška mluví o snímku obrazovky', /snímek obrazovky|dokument/.test(r2.msg || ''), r2.msg);

// Portrét člověka
const portret = p(
  ['military uniform', 58.3], ['suit, suit of clothes', 14.8], ['bow tie, bow-tie, bowtie', 9.9],
  ['academic gown, academic robe, judge\'s robe', 6.2], ['Windsor tie', 4.5]
);
tvrdi('portrét člověka neprojde', F.vyhodnot(portret).ok === false, JSON.stringify(F.vyhodnot(portret)));

// Sportovec na hřišti — venku, ale není to pozemek
const sportovec = p(
  ['ballplayer, baseball player', 87.9], ['racket, racquet', 4.8],
  ['football helmet', 2.4], ['baseball', 1.3]
);
tvrdi('fotka člověka při sportu neprojde', F.vyhodnot(sportovec).ok === false);

/* ---------- co MUSÍ projít ---------- */

tvrdi('louka s kopci projde', F.vyhodnot(p(['valley, vale', 41.0], ['alp', 22.5], ['lakeside, lakeshore', 8.0])).ok === true);
tvrdi('pole se senem projde', F.vyhodnot(p(['hay', 63.2], ['barn', 9.1], ['tractor', 4.4])).ok === true);
tvrdi('pozemek s plotem projde', F.vyhodnot(p(['worm fence, snake fence, snake-rail fence, Virginia fence', 35.0], ['picket fence, paling', 12.0])).ok === true);
tvrdi('stavební parcela u domu projde', F.vyhodnot(p(['mobile home, manufactured home', 28.0], ['picket fence, paling', 11.0], ['lawn mower, mower', 6.0])).ok === true);
tvrdi('les s houbami projde', F.vyhodnot(p(['agaric', 30.0], ['bolete', 12.0], ['hay', 5.0])).ok === true);

/* ---------- nejistota se nezamítá ---------- */

const nejasne = p(['switch, electric switch, electrical switch', 13.1], ['wall clock', 5.4], ['spotlight, spot', 5.0]);
const r3 = F.vyhodnot(nejasne);
tvrdi('když si model není jistý, fotka projde', r3.ok === true, JSON.stringify(r3));
tvrdi('prázdný výstup modelu projde (model se nenačetl)', F.vyhodnot([]).ok === true);
tvrdi('nic nedodáno → projde', F.vyhodnot(null).ok === true);

// Slabé náznaky nevhodného obsahu → jen upozornění, ne zamítnutí
const slabe = p(['cup', 12.0], ['plate', 6.0], ['spotlight, spot', 4.0]);
const r4 = F.vyhodnot(slabe);
tvrdi('slabý náznak jen upozorní, nezamítne', r4.ok === true && !!r4.varovani, JSON.stringify(r4));

// Fotka, kde je vedle nevhodné třídy i něco venkovního → nezamítat
const smisene = p(['packet', 30.0], ['hay', 14.0], ['barn', 8.0]);
tvrdi('když model vidí i krajinu, fotka projde', F.vyhodnot(smisene).ok === true, JSON.stringify(F.vyhodnot(smisene)));

/* ---------- seznamy tříd musí existovat v modelu ---------- */
const znamé = new Set(TRIDY);
let neznamych = 0;
for (const [jmeno, skupina] of Object.entries(F._skupiny)) {
  for (const trida of skupina) {
    if (!znamé.has(trida)) { console.log(`  ✕ ${jmeno}: třída „${trida}" v modelu neexistuje (překlep?)`); neznamych++; }
  }
}
bezi++;
if (neznamych) { spadlo++; }

console.log(`\nRozpoznání obsahu fotek: ${bezi} testů`);
if (spadlo) { console.error(`\n${spadlo} z ${bezi} NEPROŠLO.`); process.exit(1); }
console.log('Všechny prošly.\n');
