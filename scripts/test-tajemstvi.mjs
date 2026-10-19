/* Test: na každé tajemství, které úlohy potřebují, je majitel upozorněn.
 * ====================================================================
 * Spuštění: node scripts/test-tajemstvi.mjs
 *
 * PROČ. `docs/pred-vydanim.md` se jmenuje „Co musí zapojit majitel webu"
 * a je to JEDINÝ seznam, podle kterého se web spouští. Když v něm nějaké
 * tajemství chybí, majitel ho nenastaví — a úloha, která ho potřebuje,
 * spadne až ve chvíli, kdy na ni klepne.
 *
 * Přesně tak se to našlo: `SUPABASE_PAT` používá `nasad-sql.yml`
 * a vysvětlený je v té úloze i ve `scripts/nasad-sql.mjs` (včetně
 * adresy, kde se token vyrobí), ale v majitelově seznamu nebyl.
 * Oddíl „3. Databáze" přitom na tlačítko „Nasadit SQL" odkazuje —
 * takže kdo by podle něj postupoval, klepl by a dostal „Chybí
 * SUPABASE_PAT".
 *
 * CO SE HLÍDÁ:
 *   A) každé tajemství z úloh stojí v majitelově seznamu
 *   B) a je vysvětlené tam, kde se používá (v úloze nebo ve skriptu),
 *      ne jen vyjmenované — jméno samo neřekne, kde se ten klíč vezme
 *
 * GITHUB_TOKEN se nepočítá: ten dává GitHub sám a nastavovat se nemusí.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

const ULOHY = path.join(KOREN, '.github', 'workflows');
const soubory = existsSync(ULOHY)
  ? readdirSync(ULOHY).filter((f) => /\.ya?ml$/.test(f)) : [];
pravda('úlohy v .github/workflows se našly', soubory.length > 0, 'adresář je prázdný');

/* Kde se tajemství berou a kde se vysvětlují. */
const kdeUzito = new Map();      // jméno → [soubory úloh]
for (const f of soubory) {
  const text = readFileSync(path.join(ULOHY, f), 'utf8');
  for (const m of text.matchAll(/secrets\.([A-Z][A-Z0-9_]*)/g)) {
    const jm = m[1];
    if (jm === 'GITHUB_TOKEN') continue;
    if (!kdeUzito.has(jm)) kdeUzito.set(jm, []);
    if (!kdeUzito.get(jm).includes(f)) kdeUzito.get(jm).push(f);
  }
}
const jmena = [...kdeUzito.keys()].sort();
pravda(`úlohy potřebují nějaká tajemství (${jmena.length})`, jmena.length > 0,
  'nenašlo se ani jedno — regulární výraz asi přestal sedět');

/* --- A) majitelův seznam ---------------------------------------- */
const SEZNAM = path.join(KOREN, 'docs', 'pred-vydanim.md');
const seznam = existsSync(SEZNAM) ? readFileSync(SEZNAM, 'utf8') : '';
pravda('majitelův seznam docs/pred-vydanim.md existuje', !!seznam,
  'soubor chybí — pak není kde majitele upozornit');
const chybiVSeznamu = jmena.filter((j) => !seznam.includes(j));
pravda('každé tajemství z úloh stojí v majitelově seznamu',
  chybiVSeznamu.length === 0,
  'chybí: ' + chybiVSeznamu.map((j) => j + ' (' + kdeUzito.get(j).join(', ') + ')').join(', '));

/* --- B) vysvětlení tam, kde se používá --------------------------- */
/* Vyjmenovat jméno nestačí. Hledá se věta NAVÍC k zápisu
   `${{ secrets.X }}` — tedy komentář v úloze nebo zmínka ve skriptu,
   kde stojí, co to je a kde se to vezme. */
const skripty = readdirSync(path.join(KOREN, 'scripts'))
  .filter((f) => /\.mjs$/.test(f))
  .map((f) => readFileSync(path.join(KOREN, 'scripts', f), 'utf8'));
const bezVysvetleni = [];
for (const jm of jmena) {
  let vysvetleno = false;
  for (const f of kdeUzito.get(jm)) {
    const radky = readFileSync(path.join(ULOHY, f), 'utf8').split('\n');
    if (radky.some((r) => r.includes(jm) && /^\s*#/.test(r))) { vysvetleno = true; break; }
  }
  if (!vysvetleno) vysvetleno = skripty.some((s) => s.includes(jm));
  if (!vysvetleno) bezVysvetleni.push(jm);
}
pravda('a je vysvětlené tam, kde se používá',
  bezVysvetleni.length === 0,
  'jen vyjmenované, bez vysvětlení: ' + bezVysvetleni.join(', '));

console.log('\nTajemství úloh a majitelův seznam');
console.log(zpravy.join('\n'));
console.log('\n  · soupis: ' + jmena.map((j) => j + ' → ' + kdeUzito.get(j).join(', ')).join('\n             '));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Tajemství: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
