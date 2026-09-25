// Čtvrť u nabídek, kde zdroj uvádí jen celou obec.
//
// Spuštění: node scripts/test-ctvrt.mjs   (bez prohlížeče i bez sítě)
//
// PROČ: u 142 nabídek je místo jen „Praha", „Brno" nebo „Ostrava".
// V Praze to znamená 496 km² — podle takového údaje se nedá rozhodnout
// vůbec nic, a přitom je to první věc, na kterou se člověk u pozemku
// dívá. Souřadnice přitom máme, a u těchhle nabídek pravé, od zdroje.
//
// Odpověď Nominatimu se tu PODSTRKUJE. Do sítě test nejde: jednak by
// pak nešel spustit v sandboxu, jednak by hlídal cizí službu místo
// našeho kódu. Zajímá nás, jestli se ptáme jen tam, kde to má smysl,
// jestli z odpovědi vybereme správné jméno, a jestli se čtvrť dostane
// až na obrazovku.
import { readFileSync } from 'node:fs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

const ROBOT = readFileSync(new URL('../scripts/fetch-opportunities.mjs', import.meta.url), 'utf8');

/* Funkci vytáhneme ze zdroje a spustíme samotnou. Importovat celý
   soubor nejde: hned po načtení se rozběhne main() a začne stahovat. */
function kus(jmeno) {
  const zac = ROBOT.indexOf('function ' + jmeno + '(');
  if (zac < 0) return null;
  let i = ROBOT.indexOf('{', zac), hloubka = 0;
  for (let k = i; k < ROBOT.length; k++) {
    if (ROBOT[k] === '{') hloubka++;
    else if (ROBOT[k] === '}') { hloubka--; if (!hloubka) return ROBOT.slice(zac, k + 1); }
  }
  return null;
}
const zdrojJenObec = kus('jenObec');
const zdrojCast = kus('castZOdpovedi');
pravda('funkce jsou v robotovi k nalezení', !!zdrojJenObec && !!zdrojCast,
  'jenObec nebo castZOdpovedi ve scripts/fetch-opportunities.mjs chybí');
if (!zdrojJenObec || !zdrojCast) { hotovo(); }

const jenObec = new Function(zdrojJenObec + '; return jenObec;')();
const castZOdpovedi = new Function(zdrojCast + '; return castZOdpovedi;')();

/* ---- 1) Ptáme se jen tam, kde je místo opravdu jen celá obec ---- */
je('„Praha" v okrese Praha je jen obec', jenObec('Praha', 'Praha'), true);
je('„Brno" v okrese Brno-město taky', jenObec('Brno', 'Brno-město'), true);
je('„Plzeň" v okrese Plzeň-sever taky', jenObec('Plzeň', 'Plzeň-sever'), true);
/* A hlavně: kde místo bližší JE, se neptáme. Jinak bychom přepisovali
   údaj od zdroje odhadem z mapy. */
je('„Řepy" v okrese Praha už jen obec nejsou', jenObec('Řepy', 'Praha'), false);
je('„Devonská" v okrese Praha taky ne', jenObec('Devonská', 'Praha'), false);
je('a prázdné místo se neřeší', jenObec('', 'Praha'), false);

/* ---- 2) Z odpovědi se vybírá nejužší rozumné jméno ---- */
je('čtvrť (suburb) vyhrává nad správním obvodem',
  castZOdpovedi({ address: { suburb: 'Řepy', city_district: 'Praha 17', city: 'Praha' } }), 'Řepy');
je('když čtvrť chybí, vezme se správní obvod',
  castZOdpovedi({ address: { city_district: 'Praha 17', city: 'Praha' } }), 'Praha 17');
/* Ulice ne: u pozemku bez adresy ukazuje na nejbližší cestu, což je
   něco jiného než místo — a vypadalo by to jako adresa, kterou nemáme. */
je('ulice se za čtvrť nevydává',
  castZOdpovedi({ address: { road: 'K Motolu', city: 'Praha' } }), null);
je('samotné město taky ne',
  castZOdpovedi({ address: { city: 'Praha', country: 'Česko' } }), null);
je('a prázdná odpověď nespadne', castZOdpovedi(null), null);
je('ani odpověď bez adresy', castZOdpovedi({ error: 'Unable to geocode' }), null);

/* ---- 3) Ptáme se jen u pravých souřadnic ---- */
/* U nabídek bez GPS si polohu dopočítáváme sami (střed okresu plus
   rozptyl). Zeptat se takového bodu na čtvrť znamená vymyslet si místo
   a napsat ho na stránku jako údaj. */
pravda('čtvrť se dohledává jen u souřadnic od zdroje',
  /if \(!o\._gps \|\| !jenObec\(o\.place, o\.okres\)\) continue;/.test(ROBOT),
  'robot se ptá i u poloh, které si sám dopočítal — pak by čtvrť byla vymyšlená');
pravda('odpovědi se ukládají do mezipaměti', /GEO_CACHE\[key\] = cast;/.test(ROBOT),
  'bez mezipaměti se Nominatimu klepe na dveře při každém běhu znovu');
pravda('a mezi dotazy se čeká', /castPodleGPS[\s\S]{0,1200}?await sleep\(/.test(ROBOT),
  'Nominatim má limit ~1 dotaz za vteřinu');
/* Čtvrť se nesmí zapsat do `place`: to je v klíči pozemku (place|parcel|
   okres) a s ním v uložených oblíbených i v adresách sdílených stránek. */
pravda('čtvrť jde do vlastního pole, ne do místa', /o\.cast = c;/.test(ROBOT) && !/o\.place = c/.test(ROBOT),
  'přepsáním place by se změnil klíč pozemku a lidem by zmizely oblíbené');

/* ---- 4) A dostane se až na obrazovku ---- */
/* Řádek s místem skládá na obou stranách funkce mistoRadek. Vytáhneme
   ji a pustíme — pouhé „je v souboru někde napsané d.cast" by prošlo
   i tehdy, kdyby se čtvrť ukazovala jen náhodou. Přišlo se na to
   sabotáží: podmínka se z podpory čtvrti odebrala a test mlčel. */
{
  const zdroje = {
    'mapa (js/main.js)': readFileSync(new URL('../js/main.js', import.meta.url), 'utf8'),
    'stránka pozemku (js/pozemek.js)': readFileSync(new URL('../js/pozemek.js', import.meta.url), 'utf8'),
  };
  const vysledky = {};
  for (const [kde, kod] of Object.entries(zdroje)) {
    const zac = kod.indexOf('function mistoRadek(');
    let telo = null;
    if (zac >= 0) {
      let i = kod.indexOf('{', zac), hloubka = 0;
      for (let k = i; k < kod.length; k++) {
        if (kod[k] === '{') hloubka++;
        else if (kod[k] === '}') { hloubka--; if (!hloubka) { telo = kod.slice(zac, k + 1); break; } }
      }
    }
    if (!telo) { pravda(`${kde}: řádek s místem se skládá na jednom místě`, false,
      'funkce mistoRadek chybí — čtvrť se pak buď neukáže, nebo se to napíše dvakrát a rozejde se to'); continue; }
    const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const f = new Function('esc', telo + '; return mistoRadek;')(esc);
    vysledky[kde] = [f({ okres: 'Praha' }), f({ okres: 'Praha', cast: 'Řepy' }), f({ cast: 'Řepy' }), f({})];
    je(`${kde}: bez čtvrti zůstane jen okres`, vysledky[kde][0], 'okres Praha');
    je(`${kde}: se čtvrtí je vidět obojí`, vysledky[kde][1], 'Řepy · okres Praha');
    je(`${kde}: a samotná čtvrť se taky ukáže`, vysledky[kde][2], 'Řepy');
    je(`${kde}: bez obojího se řádek nekreslí`, vysledky[kde][3], '');
  }
  const pary = Object.values(vysledky);
  pravda('a mapa i stránka pozemku to skládají stejně',
    pary.length === 2 && JSON.stringify(pary[0]) === JSON.stringify(pary[1]),
    JSON.stringify(pary));
}

function hotovo() {
  console.log('\nČtvrť u nabídek, kde je místo jen celá obec');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Čtvrť: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}
hotovo();
