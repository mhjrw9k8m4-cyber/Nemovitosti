// Test: typografická stupnice.
//
// Spuštění: node scripts/test-typografie.mjs   (nepotřebuje prohlížeč)
//
// PROSTRKÁNÍ. Bylo jich 34 různých na 75 deklarací — tedy skoro tolik
// hodnot, kolik je použití. A část z toho byla TÁŽ hodnota zapsaná
// dvěma způsoby (.03em vedle -0.03em), což nikdo nepozná ani okem,
// ani hledáním. Takhle vzniká „soustava", kterou nelze dodržet, protože
// neexistuje: kdo přidává pravidlo, opíše hodnotu od sousedního a přidá
// třicátou pátou.
//
// Stupnice má jedenáct kroků a největší posun při jejím zavedení byl
// 0,02em — na šestnáctipixelovém písmu 0,32 px na znak. Nikdo to
// nepozná; co pozná, je když se za rok sejde padesát hodnot.
//
// ARCHIVOVANÉ STRÁNKY SE PŘESKAKUJÍ. Stránka ukončené nabídky se
// záměrně negeneruje znovu (drží si podobu z doby, kdy nabídka
// platila, a po 90 dnech se smaže). Měřit na ní dnešní stupnici by
// znamenalo hlásit chybu za to, že archiv je archiv.
//
// VELIKOSTI PÍSMA se NEHLÍDAJÍ na počet, a je to měření, ne lenost:
// šest velikostí (12, 13, 14, 16, 20, 24) pokrývá 94 % deklarací
// a zbytek jsou jednorázové displejové velikosti, které soustavu
// neporušují. Hlídá se jen to, aby nevznikly dvě velikosti o pixel
// od sebe — to je vždycky nehoda, ne rozhodnutí.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUPNICE = ['-0.04em', '-0.03em', '-0.02em', '-0.01em', '0',
  '0.01em', '0.02em', '0.04em', '0.07em', '0.1em', '0.14em'];
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const soubory = ['css/styles.css', ...readdirSync(KOREN).filter((f) => /\.html$/.test(f))];
const prostrkani = new Map();   // hodnota → [kde]
const velikosti = new Map();
let zivych = 0, archivu = 0;
for (const f of soubory) {
  let t;
  try { t = readFileSync(path.join(KOREN, f), 'utf8'); } catch (e) { continue; }
  if (t.indexOf('PK_UKONCENO') >= 0) { archivu++; continue; }
  zivych++;
  for (const m of t.matchAll(/letter-spacing:\s*(-?[0-9.]+em|0)\b/g)) {
    if (!prostrkani.has(m[1])) prostrkani.set(m[1], []);
    if (prostrkani.get(m[1]).length < 3) prostrkani.get(m[1]).push(f);
  }
  for (const m of t.matchAll(/font-size:\s*([0-9.]+)px/g)) {
    if (!velikosti.has(m[1])) velikosti.set(m[1], []);
    if (velikosti.get(m[1]).length < 3) velikosti.get(m[1]).push(f);
  }
}

// PŘEDPOKLAD: bez souborů a bez nálezů by všechny kontroly prošly naprázdno
pravda('je co měřit — živé stránky a styly', zivych >= 50 && prostrkani.size > 0,
  `živých ${zivych}, archivovaných přeskočeno ${archivu}, hodnot prostrkání ${prostrkani.size}`);
if (!(zivych >= 50 && prostrkani.size > 0)) {
  console.log('\nTypografická stupnice'); console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  console.log('::error::Typografie: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1);
}

/* ---- 1) prostrkání leží na stupnici ---- */
const mimo = [...prostrkani.keys()].filter((v) => STUPNICE.indexOf(v) < 0);
pravda(`každé prostrkání je na stupnici (${STUPNICE.length} kroků)`, mimo.length === 0,
  mimo.slice(0, 6).map((v) => `${v} — ${prostrkani.get(v).join(', ')}`).join('\n      '));

/* ---- 2) žádná hodnota není zapsaná dvěma způsoby ---- */
const dvojiZapis = [...prostrkani.keys()].filter((v) => /^-?\./.test(v));
pravda('a nikde není zápis bez vedoucí nuly (.03em vedle -0.03em se nepozná)',
  dvojiZapis.length === 0, dvojiZapis.join(', '));

/* Táž hodnota jinak zapsaná — obecněji než jen vedoucí nula. */
const podleCisla = new Map();
for (const v of prostrkani.keys()) {
  const c = parseFloat(v) || 0;
  if (!podleCisla.has(c)) podleCisla.set(c, []);
  podleCisla.get(c).push(v);
}
const duplicity = [...podleCisla.values()].filter((a) => a.length > 1);
pravda('a žádné číslo není v souboru dvakrát v jiné podobě',
  duplicity.length === 0, duplicity.map((a) => a.join(' = ')).join(' | '));

/* ---- 3) velikosti písma: celé pixely a žádné dvě o pixel od sebe ----
   PŮLPIXEL NENÍ ROZHODNUTÍ. Pravidlo o jednom pixelu níž platilo až od
   20 px — pod tím jsou sousední hodnoty (12/13/14) v pořádku a chtěné.
   Jenže právě v té dovolené oblasti sedělo 12,5px (7×) a 13,5px (4×):
   mezi 12 a 13 byla třetí velikost o půl pixelu a mezi 13 a 14 taky.
   To nikdo nerozhodl — tak se dolaďuje jedno místo, když se někomu zdá
   12 malé a 13 velké, a kdo pak přidává pravidlo, opíše to dál.
   Velikost písma je proto celé číslo pixelů. Relativní velikosti (em)
   tím nejsou dotčené: .ext-ikona má 0.9em, protože šipka ↗ má růst
   s písmem svého odkazu, a vyjde z toho 11,7 px — to je jedna
   dekorativní značka s aria-hidden, ne velikost v soustavě. */
const necele = [...velikosti.keys()].filter((v) => !Number.isInteger(Number(v)));
pravda('velikosti písma jsou celé pixely (půlpixel je vždycky nehoda)',
  necele.length === 0,
  necele.map((v) => `${v}px (${velikosti.get(v).join(', ')})`).join('\n      '));

const cisla = [...velikosti.keys()].map(Number).sort((a, b) => a - b);
const blizke = [];
for (let i = 1; i < cisla.length; i++) {
  if (cisla[i] - cisla[i - 1] === 1 && cisla[i] >= 20) {
    blizke.push(`${cisla[i - 1]}px a ${cisla[i]}px (${velikosti.get(String(cisla[i])).join(', ')})`);
  }
}
/* Pod dvacet pixelů jsou sousední hodnoty běžné a smysluplné (12/13/14).
   Nad dvacet už je rozdíl jednoho pixelu neviditelný, takže to není
   rozhodnutí — je to nehoda. Přesně tak vzniklo 33px vedle 32px. */
pravda('žádné dvě velikosti nadpisů se neliší o jediný pixel',
  blizke.length === 0, blizke.join('\n      '));

/* ---- 4) šest hlavních velikostí pořád nese většinu ---- */
let celkem = 0, hlavni = 0;
for (const f of soubory) {
  let t; try { t = readFileSync(path.join(KOREN, f), 'utf8'); } catch (e) { continue; }
  if (t.indexOf('PK_UKONCENO') >= 0) continue;
  for (const m of t.matchAll(/font-size:\s*([0-9.]+)px/g)) {
    celkem++;
    if (['12', '13', '14', '15', '16', '20', '24'].indexOf(m[1]) >= 0) hlavni++;
  }
}
const podil = celkem ? hlavni / celkem * 100 : 0;
pravda('a drtivou většinu písma nesou běžné velikosti (ne rozsypaná stupnice)',
  podil >= 85, `běžné velikosti pokrývají ${podil.toFixed(1)} % z ${celkem} deklarací`);

console.log('\nTypografická stupnice');
console.log(zpravy.join('\n'));
console.log(`  (prostrkání: ${prostrkani.size} hodnot, velikostí písma: ${velikosti.size}, ` +
  `měřeno na ${zivych} souborech)`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Typografie: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
