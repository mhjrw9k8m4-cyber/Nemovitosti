// Test: KAŽDÁ stránka webu umí tmavý režim, a stránky pozemků nesou celý
// seznam skriptů ve správném pořadí.
//
// Spuštění: node scripts/test-rezim-stranek.mjs
//
// PROČ TOHLE EXISTUJE. Stránky ukončených nabídek se obsahově
// nepřepisují, takže na ně nedorazí nic, co se do pozemek.html přidalo
// později. Naměřeno na čtyřech stránkách z 2 001:
//
//   · chyběl vložený skript, který ještě PŘED vykreslením nastaví uložený
//     režim. Bez něj se stránka vykreslí světle, i když má návštěvník
//     zapnutý tmavý režim — tedy přesně to bílé bliknutí, kvůli kterému
//     si lidé tmavý režim zapínají;
//   · chyběl js/rezim.js, takže se režim na té stránce nedal přepnout;
//   · chyběl js/videno.js a js/poznamky.js;
//   · a js/hlidani-logika.js stál ZA js/pozemek.js. Oba mají defer, takže
//     se spouštějí v pořadí dokumentu — pozemek.js tedy běžel dřív, než
//     vzniklo window.PKHlidani, a odstranění duplicitních nabídek na těch
//     stránkách nefungovalo.
//
// Čtyři stránky z 2 130 nikdo nenahlásí. Proto to hlídá test, a ne oko.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const STRANKY = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
/* Bez tohohle by všechny kontroly pod tím prošly i na prázdném seznamu. */
pravda('je co kontrolovat', STRANKY.length > 2000, `jen ${STRANKY.length} stránek`);

const obsah = new Map(STRANKY.map((f) => [f, fs.readFileSync(path.join(KOREN, f), 'utf8')]));

/* ---- 1. předvykreslovací nastavení režimu ---- */
const bezRezimu = STRANKY.filter((f) => obsah.get(f).indexOf('pk_rezim_v1') < 0);
pravda('každá stránka nastaví uložený režim ještě před vykreslením', bezRezimu.length === 0,
  `${bezRezimu.length} stránek bez toho úryvku, otevřou se světle i v tmavém režimu: ${bezRezimu.slice(0, 5).join(', ')}`);

/* Nestačí, že tam je — musí stát DŘÍV než první styl a než <body>.
   Za stylem už je pozdě: stránka se stihne vykreslit světle. */
const pozde = STRANKY.filter((f) => {
  const s = obsah.get(f), i = s.indexOf('pk_rezim_v1');
  if (i < 0) return false;
  const styl = s.indexOf('<link rel="stylesheet"'), telo = s.indexOf('<body');
  return (styl >= 0 && i > styl) || (telo >= 0 && i > telo);
});
pravda('a stojí dřív než první styl i než <body>', pozde.length === 0,
  `${pozde.length} stránek ho má až za stylem: ${pozde.slice(0, 5).join(', ')}`);

/* ---- 2. mrtvý přepínač ---- */
const mrtvy = STRANKY.filter((f) => obsah.get(f).indexOf('id="pk-rezim"') >= 0
  && !/<script src="js\/(?:min\/)?rezim\.js/.test(obsah.get(f)));
pravda('kde je přepínač režimu, tam se načítá i js/rezim.js', mrtvy.length === 0,
  `přepínač bez obsluhy na: ${mrtvy.slice(0, 5).join(', ')}`);

/* ---- 3. stránky pozemků nesou celý seznam skriptů z předlohy ---- */
const sablona = obsah.get('pozemek.html') || fs.readFileSync(path.join(KOREN, 'pozemek.html'), 'utf8');
const VZOR = /<script src="js\/(?:min\/)?([A-Za-z0-9_-]+)\.js/g;
const zPredlohy = [...sablona.matchAll(VZOR)].map((m) => m[1]);
pravda('v předloze pozemek.html jsou skripty, se kterými se srovnává', zPredlohy.length >= 10,
  `jen ${zPredlohy.length}`);

/* Jen to, co vyrobil generátor — ručně psané stránky se jmenují podobně
   (pozemek-od-obce.html) a svůj seznam skriptů mají vlastní. */
const POZEMKY = STRANKY.filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f)
  && obsah.get(f).indexOf('window.PK_POZEMEK=') >= 0);
pravda('stránek pozemků je dost, aby to něco znamenalo', POZEMKY.length > 1500, `jen ${POZEMKY.length}`);

const chybiSkript = [];
for (const f of POZEMKY) {
  const s = obsah.get(f);
  const chybi = zPredlohy.filter((j) => !new RegExp('<script src="js/(?:min/)?' + j + '\\.js').test(s));
  if (chybi.length) chybiSkript.push(`${f} (chybí ${chybi.join(', ')})`);
}
pravda('každá stránka pozemku nese všechny skripty z předlohy', chybiSkript.length === 0,
  `${chybiSkript.length} stránek: ${chybiSkript.slice(0, 3).join('; ')}`);

/* Pořadí není kosmetika: s defer se skripty spouštějí v pořadí dokumentu. */
const spatnePoradi = [];
for (const f of POZEMKY) {
  const s = obsah.get(f);
  const i1 = s.search(/<script src="js\/(?:min\/)?hlidani-logika\.js/);
  const i2 = s.search(/<script src="js\/(?:min\/)?pozemek\.js/);
  if (i1 < 0 || i2 < 0 || i1 > i2) spatnePoradi.push(f);
}
pravda('a hlidani-logika.js stojí před pozemek.js (jinak chybí odstranění duplicit)',
  spatnePoradi.length === 0,
  `${spatnePoradi.length} stránek ve špatném pořadí: ${spatnePoradi.slice(0, 5).join(', ')}`);

console.log('Tmavý režim a skripty na všech stránkách');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Režim stránek: kontroly neprošly.');
process.exit(chyb ? 1 : 0);
