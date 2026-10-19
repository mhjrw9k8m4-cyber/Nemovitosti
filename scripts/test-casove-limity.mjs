/* Test: žádné volání ven nesmí viset donekonečna.
 * ====================================================================
 * Spuštění: node scripts/test-casove-limity.mjs
 *
 * PROČ. Naměřeno 19. 10.: z devíti skriptů, které běží v úlohách
 * GitHubu, volalo `fetch` **sedm** bez jakéhokoli časového limitu —
 * a **žádná z osmi úloh** neměla `timeout-minutes`. Visící spojení se
 * tak nemělo o co zastavit.
 *
 * Co to znamenalo v praxi: `send-alerts.mjs` rozesílá e-maily přes
 * Resend. Kdyby Resend neodmítl, ale jen přestal odpovídat, úloha
 * `rozesilani.yml` by běžela do stropu, který GitHub vynutí sám —
 * šest hodin — a **další naplánovaný běh by se do té doby nespustil**.
 * Nikdo by si ničeho nevšiml: úloha by nespadla, jen by visela.
 *
 * CO SE HLÍDÁ:
 *   A) každý produkční skript volá `fetch` jen přes `fetchSLimitem`
 *      (nebo si nese vlastní AbortController, jako kontrola-inzeratu)
 *   B) každá úloha má `timeout-minutes`
 *
 * Zkoušky (`scripts/test-*.mjs`) se nepočítají: běží lokálně i v CI
 * pod vlastním `timeout` a jejich `fetch` míří na vlastní server.
 */
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

/* --- A) produkční skripty ---------------------------------------- */
const ULOHY = path.join(KOREN, '.github', 'workflows');
const souboryUloh = readdirSync(ULOHY).filter((f) => /\.ya?ml$/.test(f));
const produkcni = new Set();
for (const f of souboryUloh) {
  const text = readFileSync(path.join(ULOHY, f), 'utf8');
  for (const m of text.matchAll(/node\s+scripts\/([a-z0-9-]+\.mjs)/g)) {
    if (!/^test-/.test(m[1])) produkcni.add(m[1]);
  }
}
pravda(`v úlohách se našly produkční skripty (${produkcni.size})`, produkcni.size >= 5,
  'našlo se jich jen ' + produkcni.size);

const bezLimitu = [];
for (const jm of [...produkcni].sort()) {
  let s;
  try { s = readFileSync(path.join(KOREN, 'scripts', jm), 'utf8'); } catch (e) { continue; }
  /* Komentáře pryč: `fetch(` v komentáři není volání. */
  const kod = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const holy = (kod.match(/(?<![a-zA-Z0-9_.])fetch\s*\(/g) || []).length;
  if (!holy) continue;
  /* Vlastní AbortController je rovnocenná obrana — tak to má
     kontrola-inzeratu.mjs, odkud je ten vzor převzatý. */
  const vlastni = /AbortController|AbortSignal|signal\s*:/.test(kod);
  if (!vlastni) bezLimitu.push(jm + ' (' + holy + '×)');
}
pravda('každý produkční skript volá ven s časovým limitem',
  bezLimitu.length === 0,
  'bez limitu: ' + bezLimitu.join(', '));

/* --- B) stropy úloh ----------------------------------------------- */
const bezStropu = [];
for (const f of souboryUloh) {
  const text = readFileSync(path.join(ULOHY, f), 'utf8');
  const jobu = (text.match(/^\s+runs-on:/gm) || []).length;
  const stropu = (text.match(/^\s*timeout-minutes:/gm) || []).length;
  if (stropu < jobu) bezStropu.push(`${f} (${stropu}/${jobu})`);
}
pravda('každá úloha má strop běhu (timeout-minutes)',
  bezStropu.length === 0,
  'bez stropu: ' + bezStropu.join(', '));

console.log('\nČasové limity volání ven a stropy úloh');
console.log(zpravy.join('\n'));
console.log('\n  · produkční skripty: ' + [...produkcni].sort().join(', '));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Časové limity: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
