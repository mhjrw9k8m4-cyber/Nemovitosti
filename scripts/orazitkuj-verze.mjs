// Orazítkuje odkazy na styly a skripty otiskem jejich obsahu.
//
// Spuštění: node scripts/orazitkuj-verze.mjs        (přepíše soubory)
//           node scripts/orazitkuj-verze.mjs --kontrola   (jen zkontroluje)
//
// Proč: odkazy vypadaly takhle — css/styles.css?v=20260902f. To číslo se
// psalo ručně a při úpravě stylu se prostě zapomnělo přepsat. Prohlížeč
// pak dál servíroval starou uloženou kopii a na webu NEBYLO VIDĚT NIC
// z toho, co se změnilo. Nikde přitom nic nespadlo: soubor se nahrál,
// stránka se otevřela, jen v ní byl starý kód.
//
// Otisk se počítá z obsahu, takže se změní právě tehdy, když se změní
// soubor — a nikdy jindy. Zapomenout se to nedá.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
const kontrolaJen = process.argv.includes('--kontrola');

/** Krátký otisk obsahu souboru. */
function otisk(rel) {
  try {
    return createHash('sha1').update(readFileSync(path.join(KOREN, rel))).digest('hex').slice(0, 8);
  } catch (e) { return null; }
}

// Odkaz na náš vlastní soubor s ?v=… — v href i v src.
const VZOR = /((?:href|src)=")((?:css|js)\/[A-Za-z0-9_-]+\.(?:css|js))\?v=([A-Za-z0-9]+)(")/g;

const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
const otisky = new Map();
let zmenenych = 0, nesedi = [], odkazu = 0;

for (const f of stranky) {
  const cesta = path.join(KOREN, f);
  const puvodni = readFileSync(cesta, 'utf8');
  const novy = puvodni.replace(VZOR, (cela, pre, soubor, stara, post) => {
    odkazu++;
    if (!otisky.has(soubor)) otisky.set(soubor, otisk(soubor));
    const o = otisky.get(soubor);
    if (!o) return cela;                       // soubor neexistuje — nesaháme
    if (o !== stara) nesedi.push(`${f}: ${soubor} má ?v=${stara}, obsah odpovídá ${o}`);
    return pre + soubor + '?v=' + o + post;
  });
  if (novy !== puvodni) {
    zmenenych++;
    if (!kontrolaJen) writeFileSync(cesta, novy);
  }
}

// Generátor krajských a okresních stránek si nese vlastní razítko — kdyby
// zůstalo staré, robot by při nejbližším běhu všech 116 stránek zase vrátil.
const GEN = 'scripts/generate-region-pages.mjs';
const genCesta = path.join(KOREN, GEN);
let genPuvodni = readFileSync(genCesta, 'utf8');
const spolecne = otisky.get('css/styles.css') || otisk('css/styles.css');
const genNovy = genPuvodni.replace(/const V = 'v=[A-Za-z0-9]+';/,
  `const V = 'v=${spolecne}';`);
const genSedi = genNovy === genPuvodni;
if (!genSedi) {
  if (!kontrolaJen) writeFileSync(genCesta, genNovy);
  nesedi.push(`${GEN}: razítko pro generované stránky neodpovídá stylu`);
}

if (kontrolaJen) {
  console.log(`Razítka verzí: ${odkazu} odkazů ve ${stranky.length} stránkách`);
  if (nesedi.length) {
    console.log('\nNesedí:');
    nesedi.slice(0, 12).forEach((r) => console.log('  ✕ ' + r));
    if (nesedi.length > 12) console.log(`  … a dalších ${nesedi.length - 12}`);
    console.log('\nSpusťte: node scripts/orazitkuj-verze.mjs');
    console.log('::error::Razítka verzí nesedí — prohlížeč by lidem servíroval starý soubor.');
    process.exit(1);
  }
  console.log('Všechna razítka odpovídají obsahu souborů.');
  process.exit(0);
}

console.log(`Orazítkováno: ${odkazu} odkazů, změněno ${zmenenych} stránek` + (genSedi ? '' : ' + generátor'));
for (const [soubor, o] of [...otisky].sort()) console.log(`  ${soubor} → ?v=${o}`);
process.exit(0);
