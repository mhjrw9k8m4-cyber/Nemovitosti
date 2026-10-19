/* VLOŽENÝ STYL STRÁNKY POZEMKU — z jednoho zdroje do stránky.
 *
 * Spuštění: node scripts/vloz-styl-pozemku.mjs  (--nasucho jen řekne, co by se změnilo)
 *
 * PROČ VZNIKL. pozemek.html byla zároveň ZDROJ vloženého stylu
 * (41 kB, z toho 16,5 kB komentářů) a STRÁNKA, na kterou se chodí
 * z mapy — každý návštěvník si tedy stahoval komentáře, které nikdy
 * nikdo nepřečte (7,2 kB po zabalení). Vygenerované stránky pozemků
 * se čistily už dřív (scripts/generate-parcel-pages.mjs), předloha ne.
 * A protože se její velikost hlídala stropem, byl to strop na
 * KOMENTÁŘE: 19. 10. se naplnil do bajtu (41,0 z 41 kB) a další věta
 * vysvětlení by shodila CI.
 *
 * CO DĚLÁ. Vezme css/pozemek-vlozeny.css (zdroj s komentáři), očistí
 * ho tímtéž čističem, jakým prochází css/styles.css
 * (scripts/minifikace.mjs), a vloží výsledek do <style> v pozemek.html.
 * Nic nedopisuje a nic nedomýšlí — je to přepis ze zdroje, jako každý
 * jiný krok v scripts/oprav.mjs.
 *
 * KDY SE PUSTÍ. V oprav.mjs PŘED generátorem stránek pozemků: ten čte
 * pozemek.html jako předlohu, takže očištěný styl zdědí i všech
 * ~2 000 vygenerovaných stránek (jejich vlastní čištění tím zůstává
 * bez práce, a to je v pořádku — dvě pojistky nevadí).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ocisti } from './minifikace.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZDROJ = path.join(KOREN, 'css/pozemek-vlozeny.css');
const STRANKA = path.join(KOREN, 'pozemek.html');
const nasucho = process.argv.includes('--nasucho');

const zdroj = fs.readFileSync(ZDROJ, 'utf8');
const cisty = ocisti(zdroj);
const html = fs.readFileSync(STRANKA, 'utf8');

/* Jediný <style> ve stránce. Kdyby jich bylo víc, radši se nesáhne na
   nic: tipovat, který z nich je ten pravý, by znamenalo přepsat cizí. */
const bloky = html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || [];
if (bloky.length !== 1) {
  console.error(`::error::vloz-styl-pozemku: pozemek.html má ${bloky.length} bloků <style>, čekal se jeden.`);
  process.exit(1);
}
const novy = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/,
  (cele, zacatek, telo, konec) => zacatek + cisty + konec);

const kB = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' kB';
if (novy === html) {
  console.log(`vložený styl souhlasí se zdrojem (${kB(cisty)} ve stránce, ${kB(zdroj)} ve zdroji)`);
  process.exit(0);
}
if (nasucho) {
  console.log(`vložený styl by se změnil: ${kB(html)} → ${kB(novy)}`);
  process.exit(0);
}
fs.writeFileSync(STRANKA, novy);
console.log(`vložený styl přepsán ze zdroje: stránka ${kB(html)} → ${kB(novy)}`
  + ` (styl ${kB(cisty)}, zdroj ${kB(zdroj)} i s komentáři)`);
