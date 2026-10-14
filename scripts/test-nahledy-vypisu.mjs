/* NÁHLEDY VE VÝPISU: každá nabídka má snímek, a stojí co nejmíň
 * ==================================================================
 * Spuštění: node scripts/test-nahledy-vypisu.mjs   (nepotřebuje prohlížeč)
 *
 * PROČ VZNIKLO. Výpis na stránkách okresů, krajů, druhů a rozpočtů byl
 * holý text — podtržené jméno obce, věta s tečkami, vpravo cena. Jsou to
 * přitom stránky, na které lidé chodí z vyhledávačů. Od 14. 10. má každá
 * nabídka čtvercový letecký náhled, protože podle obrázku se v seznamu
 * rozhoduje dřív než podle čísel.
 *
 * CO SE HLÍDÁ. Náhled je jediná věc na těchhle stránkách, která sahá na
 * cizí server, a je jich na stránce až šedesát. Je proto potřeba, aby:
 *   1. ho měla KAŽDÁ nabídka (jinak je seznam napůl obrázkový, napůl ne),
 *   2. byla na nabídku PRÁVĚ JEDNA dlaždice — velký snímek na stránce
 *      pozemku jich skládá až devět a tady by to bylo přes pět set
 *      požadavků na jednu stránku,
 *   3. se stahoval ODLOŽENĚ (`loading="lazy"`) a měl PEVNÉ ROZMĚRY,
 *      aby se stránka pod prstem nepřeskládala,
 *   4. špendlík ležel UVNITŘ snímku (hodnoty 0–100 %) — jinak ukazuje
 *      mimo obrázek a tvrdí nesmysl,
 *   5. byla u seznamu ATRIBUCE snímků, kterou Esri vyžaduje.
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

const stranky = readdirSync(KOREN)
  .filter((f) => f.endsWith('.html'))
  .map((f) => ({ f, t: readFileSync(path.join(KOREN, f), 'utf8') }))
  .filter((x) => x.t.includes('class="okr-item"'));

/* PŘEDPOKLAD: je co měřit. Kdyby se výpis přestal generovat, všechny
   kontroly níž by prošly naprázdno a zkouška by o tom mlčela. */
pravda(`výpisy se generují (${stranky.length} stránek)`, stranky.length >= 50,
  `stránek s výpisem: ${stranky.length}`);

let polozek = 0, bezFoto = 0, bezLazy = 0, bezRozmeru = 0, cizich = 0, vicDlazdic = 0;
const spatnyPin = [];
const ukazky = [];
for (const { f, t } of stranky) {
  const kusy = t.split('<div class="okr-item">').slice(1);
  for (const kus of kusy) {
    polozek++;
    const item = kus.split('</div>')[0];
    const foto = /<span class="okr-foto[^"]*">([\s\S]*?)<\/span>\s*$/.exec(item)
      || /<span class="okr-foto[^"]*">([\s\S]*)/.exec(item);
    if (!/class="okr-foto/.test(item)) { bezFoto++; if (ukazky.length < 3) ukazky.push(f); continue; }
    const imgs = item.match(/<img [^>]*>/g) || [];
    if (imgs.length === 0) continue;            // nabídka bez souřadnic — jen podklad
    if (imgs.length > 1) vicDlazdic++;
    const img = imgs[0];
    if (!/loading="lazy"/.test(img)) bezLazy++;
    if (!/width="\d+"/.test(img) || !/height="\d+"/.test(img)) bezRozmeru++;
    if (!/src="https:\/\/server\.arcgisonline\.com\//.test(img)) cizich++;
    const pin = /class="okr-pin"[^>]*style="left:([\d.]+)%;top:([\d.]+)%"/.exec(item);
    if (!pin) { spatnyPin.push(`${f}: špendlík chybí`); continue; }
    const [L, T] = [parseFloat(pin[1]), parseFloat(pin[2])];
    if (!(L >= 0 && L <= 100 && T >= 0 && T <= 100)) spatnyPin.push(`${f}: ${L} %, ${T} %`);
    void foto;
  }
}

pravda(`každá nabídka ve výpisu má náhled (${polozek} nabídek)`,
  polozek > 500 && bezFoto === 0, `bez náhledu: ${bezFoto} (${ukazky.join(', ')})`);
pravda('a je to právě jedna dlaždice, ne skládaný snímek',
  vicDlazdic === 0, `nabídek s víc obrázky: ${vicDlazdic}`);
pravda('náhled se stahuje odloženě', bezLazy === 0, `bez loading="lazy": ${bezLazy}`);
pravda('a má dopředu napsané rozměry (jinak stránka poskočí)',
  bezRozmeru === 0, `bez width/height: ${bezRozmeru}`);
pravda('dlaždice je z podkladu, který znají zásady soukromí',
  cizich === 0, `z jiné adresy: ${cizich}`);
pravda('špendlík leží uvnitř snímku', spatnyPin.length === 0,
  spatnyPin.slice(0, 4).join('\n      '));

/* ATRIBUCE. Esri ji vyžaduje všude, kde se jeho dlaždice kreslí. Píše ji
   stylopis (`.okr-list::after`), takže se hledá v TOM souboru, který si
   stránky opravdu stahují — zdrojové css/styles.css to není. */
const bundly = ['css/zaklad.min.css', 'css/styles.min.css']
  .map((rel) => ({ rel, t: readFileSync(path.join(KOREN, rel), 'utf8') }));
const sAtribuci = bundly.filter((b) => /Letecké snímky © Esri/.test(b.t));
pravda(`atribuce snímků je ve stylopisu, který si stránky stahují (${sAtribuci.length} ze ${bundly.length})`,
  sAtribuci.length === bundly.length,
  'chybí v: ' + bundly.filter((b) => !/Letecké snímky © Esri/.test(b.t)).map((b) => b.rel).join(', '));

console.log('\nNáhledy ve výpisu');
console.log(zpravy.join('\n'));
console.log(`  (stránek ${stranky.length}, nabídek ${polozek})`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.error(`::error::Náhledy ve výpisu: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
