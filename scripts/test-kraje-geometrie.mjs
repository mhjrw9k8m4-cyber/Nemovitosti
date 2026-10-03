// Test: kraj podle polohy se hledá rychleji, ale musí vyjít stejně.
//
// Spuštění: node scripts/test-kraje-geometrie.mjs   (nepotřebuje prohlížeč)
//
// „V jakém kraji ta nabídka leží" se rozhoduje podle GEOMETRIE, ne podle
// okresu — u sedmi záznamů se okres a poloha neshodnou a hlavička webu
// pak slibovala jiné číslo, než kolik seznam ukázal. Bod se proto zkouší
// proti polygonům krajů.
//
// Jenže to bylo při načtení stránky nejdražší jméno v profilu: čtrnáct
// krajů × všechny jejich hrany × dva tisíce nabídek (naměřeno 81 ms na
// čtyřikrát zpomaleném CPU). Kraj se teď nejdřív zahodí podle OBÁLKY
// (nejmenšího obdélníku, do kterého se vejde) — bod mimo obálku v kraji
// ležet nemůže.
//
// Zrychlení, které změní odpověď, je k ničemu. Tenhle test proto spočítá
// kraj OBĚMA způsoby na všech nabídkách a porovná je. Funkce se berou
// přímo ze zdroje js/main.js, aby se nekontrolovala kopie.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Funkce se vytáhnou ze zdroje počítáním závorek — stejně jako
   v scripts/test-stranky-pozemku.mjs. Hledat tělo funkce regulárem je
   křehké a u vnořených závorek se to rozjede. */
const src = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
function kus(jmeno) {
  const zac = src.indexOf('function ' + jmeno + '(');
  if (zac < 0) return '';
  let i = src.indexOf('{', zac), hloubka = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') hloubka++;
    else if (src[i] === '}') { hloubka--; if (hloubka === 0) return src.slice(zac, i + 1); }
  }
  return '';
}
const JMENA = ['ptInRing', 'ptInGeom', 'obalkaGeom', 'vObalce'];
const chybi = JMENA.filter((j) => !kus(j));
pravda('všechny čtyři funkce se ze zdroje mapy vytáhly',
  chybi.length === 0, 'chybí: ' + chybi.join(', '));
if (chybi.length) {
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  process.exit(1);
}
const F = new Function(JMENA.map(kus).join('\n')
  + '\n return { ptInGeom: ptInGeom, obalkaGeom: obalkaGeom, vObalce: vObalce };')();

const KRAJE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kraje.json'), 'utf8'));
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities;
const body = DATA.filter((d) => typeof d.lat === 'number' && typeof d.lng === 'number'
  && isFinite(d.lat) && isFinite(d.lng));

pravda('kraje se načetly (všech 14)', Object.keys(KRAJE).length === 14,
  `${Object.keys(KRAJE).length} krajů`);
pravda('a je na čem počítat', body.length > 1000, `${body.length} nabídek se souřadnicí`);

const OBALKY = {};
for (const k in KRAJE) OBALKY[k] = F.obalkaGeom(KRAJE[k]);

/* Obálka musí být opravdu obálka: každý vrchol kraje v ní leží. */
{
  let mimo = 0;
  for (const k in KRAJE) {
    const ring = KRAJE[k].coordinates[0] || [];
    for (const [x, y] of ring) if (!F.vObalce(x, y, OBALKY[k])) mimo++;
  }
  pravda('obálka opravdu obklopuje celý kraj (žádný vrchol mimo)', mimo === 0, `${mimo} vrcholů mimo`);
}

/* Hlavní tvrzení: s obálkou i bez ní vyjde tentýž kraj. */
function bezObalky(lng, lat) {
  for (const k in KRAJE) if (F.ptInGeom(lng, lat, KRAJE[k])) return k;
  return null;
}
function sObalkou(lng, lat) {
  for (const k in KRAJE) {
    if (!F.vObalce(lng, lat, OBALKY[k])) continue;
    if (F.ptInGeom(lng, lat, KRAJE[k])) return k;
  }
  return null;
}
{
  const rozdily = [];
  let nalezeno = 0;
  for (const d of body) {
    const a = bezObalky(d.lng, d.lat), b = sObalkou(d.lng, d.lat);
    if (a) nalezeno++;
    if (a !== b) rozdily.push(`${d.place}: ${a} ≠ ${b}`);
  }
  pravda('kraj se u většiny nabídek vůbec najde (jinak by se srovnávala prázdna)',
    nalezeno > body.length * 0.9, `${nalezeno} z ${body.length}`);
  pravda(`obálka nezměnila kraj ani u jedné z ${body.length} nabídek`,
    rozdily.length === 0, rozdily.slice(0, 5).join('; '));
}

/* A kolik práce to vlastně ušetří — jinak by to bylo síto, které nesítí. */
{
  let parCelkem = 0, zahozeno = 0;
  for (const d of body) {
    for (const k in KRAJE) {
      parCelkem++;
      if (!F.vObalce(d.lng, d.lat, OBALKY[k])) zahozeno++;
    }
  }
  const pct = Math.round(100 * zahozeno / parCelkem);
  pravda('obálka zahodí většinu krajů bez počítání hran (aspoň 70 %)',
    pct >= 70, `zahozeno ${pct} % párů (${zahozeno} z ${parCelkem})`);
}

/* Má ta kontrola vůbec zuby? Zmenšená obálka musí odpověď změnit —
   kdyby ne, srovnávalo by se něco, co na obálce nezávisí. */
{
  const ZMENSENE = {};
  for (const k in KRAJE) {
    const o = OBALKY[k];
    const dx = (o[2] - o[0]) * 0.25, dy = (o[3] - o[1]) * 0.25;
    ZMENSENE[k] = [o[0] + dx, o[1] + dy, o[2] - dx, o[3] - dy];
  }
  let rozdilu = 0;
  for (const d of body) {
    const a = bezObalky(d.lng, d.lat);
    let b = null;
    for (const k in KRAJE) {
      if (!F.vObalce(d.lng, d.lat, ZMENSENE[k])) continue;
      if (F.ptInGeom(d.lng, d.lat, KRAJE[k])) { b = k; break; }
    }
    if (a !== b) rozdilu++;
  }
  pravda('a kdyby byla obálka špatně, test to pozná', rozdilu > 50, `${rozdilu} rozdílů`);
}

console.log('\nKraj podle polohy');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Kraje: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
