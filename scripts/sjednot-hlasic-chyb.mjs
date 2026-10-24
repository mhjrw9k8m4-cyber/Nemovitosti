/* Vepíše odchytávač chyb (scripts/hlasic-chyb.mjs) do každé stránky.
   ==================================================================
   Spuštění: node scripts/sjednot-hlasic-chyb.mjs
     (součást řetězu v scripts/oprav.mjs)

   Běží AŽ ZA sazbou — do stránky vkládá kód, ve kterém by nezlomitelná
   mezera byla chyba — a PŘED očištěním a razítkováním, protože odkaz
   na js/chyby.js se má přepsat na js/min/ a orazítkovat.
   ================================================================== */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vlozHlasicChyb } from './hlasic-chyb.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));

let zmeneno = 0, sedelo = 0;
const bezKotvy = [];
for (const f of stranky) {
  const cesta = path.join(KOREN, f);
  const pred = readFileSync(cesta, 'utf8');
  const po = vlozHlasicChyb(pred);
  if (po === null) { bezKotvy.push(f); continue; }
  if (po === pred) { sedelo++; continue; }
  writeFileSync(cesta, po);
  zmeneno++;
}
if (bezKotvy.length) {
  console.error('::error::Stránka bez <meta charset> i bez CSP, hlásič chyb se nemá kam vložit: '
    + bezKotvy.slice(0, 3).join(', '));
  process.exitCode = 1;
}
console.log(`    Hlásič chyb: ${zmeneno} stránek přepsáno, ${sedelo} už sedělo.`);
