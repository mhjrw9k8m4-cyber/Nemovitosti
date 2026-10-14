/* Vepíše kánon lišty (scripts/hlavicka.mjs) do každé stránky.
   ==================================================================
   Spuštění: node scripts/sjednot-hlavicku.mjs
     (součást řetězu v scripts/oprav.mjs)

   Běží AŽ ZA generátory — ty zapisují stránky se svou vlastní podobou
   lišty — a PŘED sazbou a razítkováním verzí, protože do lišty vkládá
   text, který se má vysázet, a odkazy, které se razítkují.
   ================================================================== */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sjednotHlavicku } from './hlavicka.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));

let zmeneno = 0, melo = 0, bez = 0;
for (const f of stranky) {
  const cesta = path.join(KOREN, f);
  const pred = readFileSync(cesta, 'utf8');
  const po = sjednotHlavicku(pred, f);
  if (po === pred) { if (pred.indexOf('<nav id="nav"') >= 0) melo++; else bez++; continue; }
  writeFileSync(cesta, po);
  zmeneno++; melo++;
}
console.log(`    Lišta sjednocena: ${zmeneno} stránek přepsáno, ${melo - zmeneno} už sedělo, ${bez} stránek lištu nemá.`);
