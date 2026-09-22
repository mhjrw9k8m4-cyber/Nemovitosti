// Test: co udělají naše výpočty s rozbitými daty?
//
// Spuštění: node scripts/test-nahodne.mjs   (nepotřebuje prohlížeč ani síť)
//
// Ostatní testy počítají se skutečnými daty, a ta jsou dnes v pořádku.
// Jenže data píše robot ze čtyř různých zdrojů a stačí, aby jeden z nich
// jednou poslal prázdný řetězec místo čísla, „—" místo výměry nebo rovnou
// nic. Pak nejde o to, jestli vyjde hezké číslo, ale jestli se web vůbec
// vykreslí — jedna výjimka v počítání cen zastaví vykreslení celého výpisu
// a člověk uvidí prázdnou stránku.
//
// Proto tenhle test nepočítá s vymyšleným „správným" záznamem, ale hází do
// výpočtů dvanáct tisíc náhodně pokažených: chybějící pole, NaN, Infinity,
// text místo čísla, prázdné řetězce, emoji, nulové výměry. Hlídá dvě věci:
//   1. nic nesmí spadnout,
//   2. co vyleze, musí dávat smysl (procenta 0–100, souřadnice v mezích,
//      seznam si drží délku a nikdo v něm není dvakrát).
//
// Takhle se našlo, že hledání obce bralo za dobrou souřadnici i NaN a
// Infinity — protože typeof NaN === 'number'. V datech to nebylo, ale
// první rozbitý zápis robota by poslal mapu do nekonečna.
//
// Náhoda je tu záměrně SPOUTANÁ: pevné semínko, takže dva běhy dají totéž
// a rozbitý běh v CI se dá zopakovat.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const req = createRequire(import.meta.url);
const okno = { window: {} };
new Function('window', readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))(okno.window);
const C = okno.window.PK_CENY;
const P = req(path.join(ROOT, 'js', 'poradi.js'));
const H = req(path.join(ROOT, 'js', 'hledani.js'));
const HD = req(path.join(ROOT, 'js', 'hlidani-logika.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

let sem = 20260922;
const rnd = () => (sem = (sem * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DIVNE = [undefined, null, NaN, Infinity, -Infinity, 0, -1, 1e18, '', '   ', '0', 'abc',
  '—', '\u0000', '😀', 'Praha-​západ', '1/2', -0.0001, 1e-9, '1e3', [], {}, true, false];
const DRUHY = ['orná půda', 'Lesní pozemek', 'zahrada', '', null, 'stavební pozemek', 'ZAHRADA', 'vinice'];
const TYPY = ['sale', 'drazba', 'exekuce', 'obec', 'majitel', '', null, 'nesmysl'];
function zaznam() {
  const r = {};
  const dej = (k, h) => { if (rnd() < 0.85) r[k] = pick(h); };
  dej('place', ['Praha', 'Říčany', ...DIVNE]);
  dej('okres', ['Beroun', 'Plzeň-sever', ...DIVNE]);
  dej('druh', DRUHY);
  dej('type', TYPY);
  dej('parcel', ['769/2', ...DIVNE]);
  dej('price', [1, 1000, 1e9, ...DIVNE]);
  dej('area', [1, 500, 1e7, ...DIVNE]);
  dej('lat', [50.1, ...DIVNE]);
  dej('lng', [14.2, ...DIVNE]);
  dej('extra', ['dražba 2026-10-15', ...DIVNE]);
  dej('first_seen', ['2026-09-01', ...DIVNE]);
  return r;
}
const pady = [];   // co spadlo
const nesmysly = []; // co vylezlo mimo meze
const hlas = (pole, kde, co) => { if (pole.filter((x) => x.startsWith(kde)).length < 3) pole.push(kde + ': ' + co); };
const cislo = (x) => typeof x === 'number' && isFinite(x);
const KOL = 300, NA_KOLO = 40;

for (let kolo = 0; kolo < KOL; kolo++) {
  const data = [...Array(NA_KOLO)].map(zaznam);
  let M = null;
  try { M = C.postav(data); } catch (e) { hlas(pady, 'ceny.postav', e.message); continue; }
  for (const d of data) {
    try {
      const o = M.odhad(d);
      if (o) {
        if (!cislo(o.podOdhadem) || o.podOdhadem < 0 || o.podOdhadem > 100) hlas(nesmysly, 'ceny.odhad podOdhadem', String(o.podOdhadem));
        if (o.rozdil != null && !cislo(o.rozdil)) hlas(nesmysly, 'ceny.odhad rozdíl', String(o.rozdil));
        if (o.odhad != null && (!cislo(o.odhad) || o.odhad < 0)) hlas(nesmysly, 'ceny.odhad odhad', String(o.odhad));
      }
    } catch (e) { hlas(pady, 'ceny.odhad', e.message); }
    try { const pc = M.percentil(d); if (pc != null && (!cislo(pc) || pc < 0 || pc > 100)) hlas(nesmysly, 'ceny.percentil', String(pc)); }
    catch (e) { hlas(pady, 'ceny.percentil', e.message); }
    try { M.neduveryhodna(d); } catch (e) { hlas(pady, 'ceny.neduveryhodna', e.message); }
    try { const htm = C.blokOdhadu(M, d, {}); if (typeof htm !== 'string') hlas(nesmysly, 'ceny.blokOdhadu', 'nevrátil text'); }
    catch (e) { hlas(pady, 'ceny.blokOdhadu', e.message); }
    try { H.vyhovuje(d, H.tokeny(pick(['praha', 'rican beroun', '', '769/2', '😀']))); } catch (e) { hlas(pady, 'hledani.vyhovuje', e.message); }
    try { HD.matches({ okres: pick(['Beroun', '', null]), druh: pick(DRUHY), max_price: pick([0, 1e6, NaN]) }, d); }
    catch (e) { hlas(pady, 'hlidani.matches', e.message); }
    try { HD.keyOf(d); } catch (e) { hlas(pady, 'hlidani.keyOf', e.message); }
  }
  try {
    const m = H.misto(data, pick(['praha', 'beroun', 'x', '😀', 'rican']));
    if (m && !H.bod(m.lat, m.lng)) hlas(nesmysly, 'hledani.misto', 'souřadnice ' + m.lat + ',' + m.lng);
  } catch (e) { hlas(pady, 'hledani.misto', e.message); }
  try {
    const arr = data.slice();
    P.prostridej(arr, (d) => (cislo(d.price) ? d.price : 0), (d) => JSON.stringify(d));
    P.stridacka(arr, 8, P.MIST_NA_STRIDACKU, kolo, (d) => JSON.stringify(d), 0, null);
    if (arr.length !== data.length) hlas(nesmysly, 'poradi délka', arr.length + ' × ' + data.length);
    if (new Set(arr).size !== new Set(data).size) hlas(nesmysly, 'poradi obsah', 'něco se ztratilo nebo přibylo');
  } catch (e) { hlas(pady, 'poradi', e.message); }
  try {
    const ven = HD.bezDuplicit(data);
    if (ven.length > data.length) hlas(nesmysly, 'hlidani.bezDuplicit', 'přibyly záznamy');
    if (new Set(ven).size !== ven.length) hlas(nesmysly, 'hlidani.bezDuplicit', 'tentýž záznam dvakrát');
    if (ven.some((x) => !data.includes(x))) hlas(nesmysly, 'hlidani.bezDuplicit', 'vrátilo něco, co nepřišlo');
  } catch (e) { hlas(pady, 'hlidani.bezDuplicit', e.message); }
}

pravda(`${KOL * NA_KOLO} rozbitých záznamů a nic nespadlo`, pady.length === 0, pady.join('\n      '));
pravda('a nic nevylezlo mimo meze', nesmysly.length === 0, nesmysly.join('\n      '));

// Ještě jmenovitě to, co tenhle test odhalil: NaN a Infinity JSOU „number".
pravda('NaN se nepovažuje za souřadnici', H.bod(NaN, 14) === false);
pravda('Infinity se nepovažuje za souřadnici', H.bod(Infinity, 14) === false && H.bod(50, -Infinity) === false);
pravda('ani souřadnice mimo zeměkouli', H.bod(91, 14) === false && H.bod(50, 181) === false);
pravda('poctivá souřadnice projde', H.bod(50.08, 14.42) === true);
pravda('obec jen s rozbitými souřadnicemi se nenajde',
  H.misto([{ place: 'Testov', okres: 'X', lat: NaN, lng: Infinity }], 'Testov') === null);

console.log(zpravy.join('\n'));
console.log(`\n${ok + chyb} kontrol: ${ok} prošlo, ${chyb} selhalo.`);
process.exit(chyb ? 1 : 0);
