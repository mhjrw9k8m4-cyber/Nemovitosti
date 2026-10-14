/* Vepíše kánon patičky (scripts/paticka.mjs) do každé stránky.
   ==================================================================
   Spuštění: node scripts/sjednot-paticku.mjs
     (součást řetězu v scripts/oprav.mjs)

   Běží na témže místě jako sjednocení lišty: AŽ ZA generátory a PŘED
   sazbou a razítkováním, protože do patičky vkládá text, který se má
   vysázet, a odkazy, které se razítkují.

   PROČ TO VŮBEC JE: na 69 stránkách (ukončené nabídky, které generátor
   schválně nepřepisuje) zůstala čtyřsloupcová patička, kterou majitel
   odmítl. Podrobně u kánonu v scripts/paticka.mjs.
   ================================================================== */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sjednotPaticku } from './paticka.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));

let zmeneno = 0, melo = 0, bez = 0;
for (const f of stranky) {
  const cesta = path.join(KOREN, f);
  const pred = readFileSync(cesta, 'utf8');
  const po = sjednotPaticku(pred, f);
  if (po === pred) { if (pred.indexOf('<footer') >= 0) melo++; else bez++; continue; }
  writeFileSync(cesta, po);
  zmeneno++; melo++;
}
console.log(`    Patička sjednocena: ${zmeneno} stránek přepsáno, ${melo - zmeneno} už sedělo, ${bez} stránek patičku nemá.`);
