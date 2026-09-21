// Test: datový soubor si sám neodporuje.
//
// Spuštění: node scripts/test-data.mjs   (bez prohlížeče, běží v sekundě)
//
// Proč: web může být bezvadně naprogramovaný a přesto lhát, protože lžou
// data. Tohle je ten druh chyby, kterou žádný test rozhraní nechytí —
// stránka se vykreslí, nic nespadne, jen je špendlík jinde než pozemek.
//
// Co se stalo: robot si dohledával přesnou polohu podle názvu katastrálního
// území. Okres funkci předával, ale jen do klíče mezipaměti — do DOTAZU ne.
// Ptal se tedy prostě na „Police, Česko" a bral první výsledek. Jenže Polic
// je v Česku víc, a tak nabídka z okresu Vsetín přistála u Jemnice, 177 km
// jinde. Stejně dopadly Rataje (180 km), Lukavec (125), Karlovice (90)
// a Křakov (84). Sedm nabídek mělo špendlík na druhém konci republiky, a to
// se propisovalo i do „pozemků v okolí" a do cen podle kraje.
import { readFileSync } from 'node:fs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const data = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
const nabidky = data.opportunities || [];
const OKRESY = JSON.parse(readFileSync(new URL('../data/okresy.json', import.meta.url), 'utf8')).okresy || {};

function km(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

pravda('datový soubor něco obsahuje', nabidky.length > 500, `jen ${nabidky.length} nabídek`);

// --- 1) Špendlík patří do okresu, který je u nabídky napsaný ---------
/* Mez 55 km je změřená, ne odhadnutá: u nabídek, jejichž poloha s okresem
   souhlasí, je nejvzdálenější 47 km od jeho středu (medián 12 km,
   devětadevadesátý percentil 30). Padesát pět je tedy nad vším, co je
   v pořádku, a hluboko pod omyly, které byly 84 až 180 km daleko. */
const MEZ_KM = 55;
const daleko = [];
let sSouradnicemi = 0, bezStredu = 0;
for (const o of nabidky) {
  if (typeof o.lat !== 'number' || typeof o.lng !== 'number') continue;
  sSouradnicemi++;
  const stred = OKRESY[o.okres];
  if (!stred) { bezStredu++; continue; }
  const d = km(stred[0], stred[1], o.lat, o.lng);
  if (d > MEZ_KM) daleko.push(`${o.place} / okres ${o.okres}: ${Math.round(d)} km od středu okresu`);
}
pravda('skoro všechny nabídky mají souřadnice', sSouradnicemi > nabidky.length * 0.95,
  `souřadnice má jen ${sSouradnicemi} z ${nabidky.length}`);
pravda('každý okres v datech známe', bezStredu === 0, `${bezStredu} nabídek má okres, který neznáme`);
pravda('žádný špendlík neleží mimo svůj okres',
  daleko.length === 0,
  `${daleko.length} nabídek: ${daleko.slice(0, 6).join(' | ')}${daleko.length > 6 ? ` … a dalších ${daleko.length - 6}` : ''}`);

// --- 2) Souřadnice vůbec leží v Česku --------------------------------
const mimoCR = nabidky.filter((o) => typeof o.lat === 'number' &&
  (o.lat < 48.5 || o.lat > 51.1 || o.lng < 12.0 || o.lng > 18.9));
pravda('všechny souřadnice leží v Česku', mimoCR.length === 0,
  mimoCR.slice(0, 4).map((o) => `${o.place} ${o.lat},${o.lng}`).join(' | '));

// --- 3) Čísla dávají smysl -------------------------------------------
const zapornaCena = nabidky.filter((o) => o.price != null && !(o.price > 0));
const zapornaVymera = nabidky.filter((o) => o.area != null && !(o.area > 0));
pravda('žádná cena není nula ani záporná', zapornaCena.length === 0, `${zapornaCena.length} nabídek`);
pravda('žádná výměra není nula ani záporná', zapornaVymera.length === 0, `${zapornaVymera.length} nabídek`);
// Výměra nad tisíc hektarů u jedné parcely znamená špatně načtené číslo.
const obri = nabidky.filter((o) => o.area > 1e7);
pravda('žádná výměra není nesmyslně velká', obri.length === 0,
  obri.slice(0, 3).map((o) => `${o.place} ${o.area} m²`).join(' | '));

// --- 4) „Poprvé viděno" je použitelné --------------------------------
const bezData = nabidky.filter((o) => !/^\d{4}-\d{2}-\d{2}$/.test(o.first_seen || ''));
pravda('každá nabídka ví, kdy ji robot viděl poprvé', bezData.length === 0, `${bezData.length} nabídek bez data`);

console.log('\nIntegrita datového souboru');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Data: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
