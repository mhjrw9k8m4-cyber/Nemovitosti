/* Test: „víc pozemků na jednom místě" — shluky sousedících nabídek.
   ==================================================================
   Spuštění: node scripts/test-bloky.mjs   (bez prohlížeče)

   Kdo kupuje půdu, nekupuje tvar parcely, ale výměru na jednom místě.
   Stránka pozemku proto u nabídek, kolem kterých se prodávají další,
   říká kolik jich je a jaká je dohromady výměra a cena. Je to tvrzení
   o číslech, takže se musí dát přepočítat — a hlavně se nesmí tvrdit
   víc, než co se změřilo.

   Co se hlídá:
     1. vzdálenost (haversine) a mez 300 m,
     2. tranzitivita: A—B a B—C je jeden shluk, i když A a C jsou dál,
     3. shluk pod tři nabídky se nehlásí vůbec,
     4. cena se sčítá, JEN když ji má každá nabídka ve shluku,
     5. spoluvlastnický podíl se u součtu výměry přizná,
     6. klíč není totožnost objektu (generátor čte data znovu u každé
        stránky, takže Map klíčovaná objektem by mlčky nenašla nic —
        přesně to se při psaní stalo: 1 943 stránek, 0 bloků),
     7. a na hotových stránkách čísla sedí s daty.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as B from './bloky.mjs';
import { blokPro } from './generate-parcel-pages.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1) Vzdálenost ---------------------------------------------- */
const A = { lat: 49.7, lng: 15.0, area: 1000, price: 100000 };
pravda('vzdálenost sebe od sebe je nula', Math.round(B.metry(A, A)) === 0);
{
  /* 0,001° zeměpisné šířky je 111 m; to je nezávislé na délce. */
  const d = B.metry(A, { lat: 49.701, lng: 15.0 });
  pravda(`0,001° na sever je asi 111 m (${d.toFixed(0)})`, Math.abs(d - 111) < 3, `vyšlo ${d}`);
}

/* ---- 2) Shluky --------------------------------------------------- */
const bod = (lat, lng, zbytek) => Object.assign({ lat, lng, area: 1000, price: 100000, type: 'sale', okres: 'O', place: 'P', parcel: '' }, zbytek || {});
{
  /* Řetízek po 200 m: A—B—C je jeden shluk, i když A a C dělí 400 m. */
  const a = bod(49.700, 15.0), b = bod(49.7018, 15.0), c = bod(49.7036, 15.0);
  const g = B.shluky([a, b, c]);
  pravda('řetízek po 200 m drží pohromadě (tranzitivita)',
    g.length === 1 && g[0].length === 3,
    `shluků ${g.length}: ${g.map((x) => x.length).join(',')}; A–C je ${B.metry(a, c).toFixed(0)} m`);
}
{
  /* Dál než 300 m = dva shluky. */
  const a = bod(49.700, 15.0), b = bod(49.704, 15.0);
  const g = B.shluky([a, b]);
  pravda('přes 300 m se shluk roztrhne',
    g.length === 2, `vzdálenost ${B.metry(a, b).toFixed(0)} m, shluků ${g.length}`);
}
{
  const bezSouradnic = [{ area: 1, price: 1 }, bod(49.7, 15.0)];
  pravda('nabídka bez souřadnic se do shluku nepočítá',
    B.shluky(bezSouradnic).reduce((s, g) => s + g.length, 0) === 1, 'prázdné souřadnice by slily vše dohromady');
}

/* ---- 3) Klíč, ne totožnost objektu ------------------------------- */
{
  const tri = [bod(49.700, 15.0, { parcel: '1' }), bod(49.7018, 15.0, { parcel: '2' }), bod(49.7036, 15.0, { parcel: '3' })];
  const m = B.sousedi(tri);
  const kopie = JSON.parse(JSON.stringify(tri[0]));
  pravda('shluk se najde i podle KOPIE nabídky, ne jen podle téhož objektu',
    (m.get(B.klic(kopie)) || []).length === 2,
    'klíč je totožnost objektu — generátor by nenašel nic a mlčel by');
}

/* ---- 4) Souhrn --------------------------------------------------- */
{
  const a = bod(49.700, 15.0, { area: 1000, price: 100 });
  const ost = [bod(49.7018, 15.0, { area: 2000, price: 200 }), bod(49.7036, 15.0, { area: 3000, price: 300 })];
  const s = B.souhrn(a, ost);
  pravda('souhrn sečte počet, výměru i cenu',
    s && s.pocet === 3 && s.vymera === 6000 && s.cena === 600, JSON.stringify(s));
  pravda('dvojice se nehlásí vůbec (to už říká věta o obci)',
    B.souhrn(a, ost.slice(0, 1)) === null, 'shluk o dvou by přidal třetí odstavec o témže');
  const bezCeny = B.souhrn(a, [ost[0], bod(49.7036, 15.0, { area: 3000, price: 0 })]);
  pravda('a cenu NESEČTE, když ji jedna nabídka nemá',
    bezCeny && bezCeny.cena === null && bezCeny.vymera === 6000, JSON.stringify(bezCeny));
  const sPodilem = B.souhrn(a, [Object.assign(bod(49.7018, 15.0, { area: 2000, price: 200 }), { podil: true }), ost[1]]);
  pravda('a spoluvlastnický podíl ve shluku spočítá zvlášť',
    sPodilem && sPodilem.podilu === 1, JSON.stringify(sPodilem));
}

/* ---- 5) Věta ze skutečných dat ----------------------------------- */
const PKH = createRequire(import.meta.url)(path.join(KOREN, 'js', 'hlidani-logika.js'));
const vse = PKH.bezDuplicit(
  JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities);
const sousedi = B.sousedi(vse);
pravda(`v datech shluky jsou (${sousedi.size} nabídek ve shluku 3+)`, sousedi.size >= 20,
  `jen ${sousedi.size} — bez nich tahle kontrola neměří nic`);
{
  const prvni = vse.find((o) => sousedi.has(B.klic(o)));
  const text = prvni ? (blokPro(prvni) || {}).text : null;
  pravda('generátor z toho složí větu', !!text, 'blokPro() nevrátil text');
  pravda('a je česky: dvojka má sloveso v množném čísle',
    !/se prodává ještě [234] /.test(String(text || '')),
    `věta: ${text}`);
}

/* ---- 6) A čísla na hotových stránkách sedí ----------------------- */
{
  const souboryS = fs.readdirSync(KOREN).filter((f) => /^pozemek-.*\.html$/.test(f)
    && fs.readFileSync(path.join(KOREN, f), 'utf8').includes('pz-blok-data'));
  pravda(`stránek s blokem je dost (${souboryS.length})`, souboryS.length >= 20, `jen ${souboryS.length}`);
  let overeno = 0;
  const rozchody = [];
  for (const f of souboryS.slice(0, 60)) {
    const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
    const m = h.match(/id="pz-blok-data">(.*?)<\/script>/s);
    if (!m) { rozchody.push(`${f}: ostrůvek se nepřečetl`); continue; }
    let o; try { o = JSON.parse(m[1].replace(/\\u003c/g, '<')); } catch (e) { rozchody.push(`${f}: ostrůvek není JSON`); continue; }
    overeno++;
    if (!(o.pocet >= 3)) rozchody.push(`${f}: hlásí shluk o ${o.pocet}`);
    if (o.mez !== B.MEZ_METRU) rozchody.push(`${f}: mez ${o.mez} místo ${B.MEZ_METRU}`);
    if (o.cena !== null && !(o.cena > 0)) rozchody.push(`${f}: cena ${o.cena}`);
    if (!(o.vymera > 0)) rozchody.push(`${f}: výměra ${o.vymera}`);
  }
  pravda(`ostrůvky se přečetly (${overeno})`, overeno >= 20, `jen ${overeno}`);
  pravda('a všechny dávají smysl', rozchody.length === 0, rozchody.slice(0, 5).join(' | '));
}

console.log('\nVíc pozemků na jednom místě');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Víc pozemků na jednom místě: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
