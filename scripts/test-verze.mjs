// Test: prohlížeč dostane NOVOU verzi souboru, ne tu starou uloženou.
//
// Spuštění: node scripts/test-verze.mjs
//
// Tohle je chyba, která shodila celou předchozí práci, a přitom nikde nic
// nespadlo. Odkazy na styly a skripty nesly ručně psané číslo:
//
//     <link rel="stylesheet" href="css/styles.css?v=20260902f">
//
// Při úpravě stylu se to číslo zapomnělo přepsat. Soubor se nahrál, stránka
// se otevřela — a prohlížeč, který si ji už jednou uložil, použil STAROU
// kopii. Na webu tedy nebylo vidět nic z toho, co se změnilo. Žádný test
// to nechytil, protože testy si stránku pokaždé načítají čerstvou.
//
// Razítko se proto počítá z obsahu souboru: změní se právě tehdy, když se
// změní soubor. Tenhle test hlídá, že to tak zůstane — a to na všech
// stránkách včetně těch, které generuje robot.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

function otisk(rel) {
  try { return createHash('sha1').update(readFileSync(path.join(KOREN, rel))).digest('hex').slice(0, 8); }
  catch (e) { return null; }
}

const VZOR = /(?:href|src)="((?:css|js)\/[A-Za-z0-9_-]+\.(?:css|js))\?v=([A-Za-z0-9]+)"/g;
const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
pravda('stránky se našly', stranky.length > 50, `jen ${stranky.length}`);

const spatne = [], bezRazitka = [];
let odkazu = 0;
for (const f of stranky) {
  const t = readFileSync(path.join(KOREN, f), 'utf8');
  for (const m of t.matchAll(VZOR)) {
    odkazu++;
    const o = otisk(m[1]);
    if (o && o !== m[2]) spatne.push(`${f} → ${m[1]} má ?v=${m[2]}, obsah odpovídá ${o}`);
  }
  // Odkaz na náš soubor BEZ razítka je stejný problém: prohlížeč si ho
  // může nechat, jak dlouho chce.
  for (const m of t.matchAll(/(?:href|src)="((?:css|js)\/[A-Za-z0-9_-]+\.(?:css|js))"/g)) {
    bezRazitka.push(`${f} → ${m[1]}`);
  }
}
pravda('nějaké odkazy na styly a skripty vůbec existují', odkazu > 100,
  `našlo se jen ${odkazu} — test by mlčel`);
// Tohle je jádro.
pravda('razítko u každého souboru odpovídá jeho obsahu', spatne.length === 0,
  spatne.slice(0, 8).join('\n      ') +
  (spatne.length > 8 ? `\n      … a dalších ${spatne.length - 8}` : '') +
  '\n      Spusťte: node scripts/orazitkuj-verze.mjs');
pravda('žádný náš soubor se nenačítá bez razítka', bezRazitka.length === 0,
  bezRazitka.slice(0, 6).join('\n      '));

// --- Generátor stránek si razítko nesmí psát ručně -------------------
// Robot přegeneruje 117 stránek při každém běhu. Kdyby si v sobě nesl pevné
// číslo, vrátil by zpátky přesně ten stav, který tenhle test hlídá.
const gen = readFileSync(path.join(KOREN, 'scripts/generate-region-pages.mjs'), 'utf8');
pravda('generátor stránek si razítko nedrží napevno',
  !/const V = 'v=[A-Za-z0-9]+'/.test(gen),
  'robot by při příštím běhu vrátil starou verzi na všech generovaných stránkách');
pravda('a počítá ho z obsahu souboru', /createHash\('sha1'\)/.test(gen));

// --- Razítka se opravdu liší podle souboru ---------------------------
// Jedno společné razítko pro všechno je lepší než nic, ale znamená, že
// změna jednoho skriptu zneplatní lidem celý web — a hlavně, že změna
// skriptu BEZ změny stylu se neprojeví.
const podleSouboru = new Map();
for (const f of stranky) {
  const t = readFileSync(path.join(KOREN, f), 'utf8');
  for (const m of t.matchAll(VZOR)) podleSouboru.set(m[1], m[2]);
}
const ruznych = new Set(podleSouboru.values()).size;
pravda('každý soubor má svoje razítko, ne jedno společné',
  ruznych >= Math.min(5, podleSouboru.size),
  `${podleSouboru.size} souborů sdílí jen ${ruznych} razítek`);

console.log('\nRazítka verzí — aby lidem nechodila stará kopie');
console.log(zpravy.join('\n'));
console.log(`\nzkontrolováno ${odkazu} odkazů ve ${stranky.length} stránkách`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Razítka verzí: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
