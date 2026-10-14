/* MAPA WEBU: u každé adresy datum, a to datum musí být pravda.
 *
 * Spuštění: node scripts/test-mapa-webu.mjs   (nepotřebuje prohlížeč)
 *
 * PROČ. sitemap.xml měla 2 051 adres, u všech `changefreq` a u žádné
 * `lastmod`. Google `changefreq` IGNORUJE — píše to ve své dokumentaci
 * — a řídí se `lastmod`. Vyhledávač tedy neměl z čeho poznat, která
 * z dvou tisíc stránek se dnes změnila, a u webu, kde se data obnovují
 * čtyřikrát denně, to je zrovna ta jediná informace, která tam patří.
 *
 * A PROČ TO NENÍ JEN „DOPLNIT POLÍČKO". Nejsnazší by bylo napsat všude
 * datum sestavení. Jenže to by znamenalo, že se každý den změnilo
 * všech 2 051 stránek — a to není pravda. Takový `lastmod` se
 * vyhledávač naučí přehlížet a mapa webu pak neříká nic, i když vypadá
 * bohatěji. Tahle zkouška proto nehlídá, že tam datum JE, ale že
 * NELŽE:
 *
 *   • žádné datum není z budoucnosti,
 *   • data nejsou všechna stejná,
 *   • a to nejčastější z nich NENÍ DNEŠNÍ — tedy mapa webu netvrdí,
 *     že se dneškem změnil celý web.
 *
 * Třetí bod je ten podstatný a je bez libovolné mezní hodnoty: neříká
 * „nejvýš tolik a tolik procent", říká „nevydávej sestavení za změnu".
 *
 * Odkud se datum bere, je napsané u obou generátorů: stránky pozemků
 * z archivu (den, kdy se nabídka objevila, nebo kdy se naposled
 * změnila cena), výpisy ze dne datové dávky, ruční stránky ze dne
 * posledního commitu, který ten soubor změnil.
 */
import { readFileSync } from 'node:fs';
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

const xml = readFileSync(path.join(KOREN, 'sitemap.xml'), 'utf8');
/* Bloky se čtou celé, ne po značkách: jen tak se pozná adresa BEZ
   data. Hledat zvlášť <loc> a zvlášť <lastmod> a porovnat počty by
   prošlo i stavu, kdy jedna adresa má data dvě a druhá žádné. */
const bloky = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
const zapisy = bloky.map((b) => ({
  loc: (/<loc>([^<]*)<\/loc>/.exec(b) || [])[1] || '',
  lastmod: (/<lastmod>([^<]*)<\/lastmod>/.exec(b) || [])[1] || '',
}));

/* PŘEDPOKLAD: je co měřit. Bez tohohle by zkouška na prázdné nebo
   rozsypané mapě webu hlásila „všechno v pořádku". */
pravda('mapa webu se přečetla a má adresy', zapisy.length >= 500 && zapisy.every((z) => z.loc),
  `bloků ${zapisy.length}, bez <loc>: ${zapisy.filter((z) => !z.loc).length}`);
if (!(zapisy.length >= 500)) {
  console.log('\nMapa webu'); console.log(zpravy.join('\n'));
  console.error('::error::Mapa webu: nepřečetla se.' + pricinaChyb(zpravy));
  process.exit(1);
}

const bez = zapisy.filter((z) => !z.lastmod);
pravda('každá adresa má <lastmod>', bez.length === 0,
  `bez data: ${bez.length} — např. ${bez.slice(0, 3).map((z) => z.loc).join(', ')}`);

const VZOR = /^\d{4}-\d{2}-\d{2}$/;
const spatneZapsane = zapisy.filter((z) => z.lastmod && !VZOR.test(z.lastmod));
pravda('a je zapsané jako YYYY-MM-DD', spatneZapsane.length === 0,
  spatneZapsane.slice(0, 3).map((z) => `${z.loc} → „${z.lastmod}"`).join(' | '));

const dnes = new Date().toISOString().slice(0, 10);
const zBudoucna = zapisy.filter((z) => VZOR.test(z.lastmod) && z.lastmod > dnes);
pravda('a není z budoucnosti', zBudoucna.length === 0,
  `dnes je ${dnes}; ` + zBudoucna.slice(0, 3).map((z) => `${z.loc} → ${z.lastmod}`).join(' | '));

const data = zapisy.map((z) => z.lastmod).filter((d) => VZOR.test(d));
const pocty = new Map();
for (const d of data) pocty.set(d, (pocty.get(d) || 0) + 1);
pravda(`data nejsou všechna stejná (${pocty.size} různých)`, pocty.size > 1,
  pocty.size === 1 ? `všech ${data.length} adres má ${data[0]}` : '');

/* TOHLE JE TA PODSTATNÁ KONTROLA. Datum sestavení napsané všude je
   nejsnazší způsob, jak mapu webu zneplatnit: tvrdí, že se dneškem
   změnil celý web. Mez tu není žádná — stačí, že nejčastější datum
   není dnešní. */
const nejcastejsi = [...pocty].sort((a, b) => b[1] - a[1])[0] || ['', 0];
pravda('a nejčastější datum není dnešní (mapa webu nevydává sestavení za změnu)',
  nejcastejsi[0] !== dnes,
  `nejčastější je ${nejcastejsi[0]} u ${nejcastejsi[1]} z ${data.length} adres, a dnes je ${dnes}`);

console.log('\nMapa webu');
console.log(zpravy.join('\n'));
console.log(`  (adres ${zapisy.length}, různých dat ${pocty.size},`
  + ` nejčastější ${nejcastejsi[0]} u ${nejcastejsi[1]}, nejnovější ${data.slice().sort().pop()})`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.error(`::error::Mapa webu: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' Datum v <lastmod> musí být pravda o té stránce — kdy se nabídka objevila nebo'
    + ' změnila cenu, kdy přišla datová dávka, kdy někdo ten soubor přepsal. Ne čas sestavení.');
  process.exit(1);
}
