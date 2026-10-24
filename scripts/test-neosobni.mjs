/* Test: jedno pravidlo pro všechno, co web odesílá sám.
   ==================================================================
   Spuštění: node scripts/test-neosobni.mjs

   Web odesílá bez vyzvání dvě věci — návštěvu (js/mereni.js) a pád
   v prohlížeči (js/chyby.js) — a obě mají poslouchat TÝŽ zákaz:
   mimo ostrý web nic, při „nesledovat" nic, v robotu nic. Dokud to
   pravidlo bylo napsané dvakrát, stačilo zpřísnit jednu kopii a web
   by dál posílal odtud, odkud nemá.

   Co se tu hlídá:
     1. sdílený modul opravdu existuje a nese všechny tři věci,
     2. stráže NEJSOU nikde jinde — ani v jedné kopii,
     3. každá stránka, která si bere měření nebo hlásič, si bere
        i sdílený modul, a bere si ho DŘÍV (odložené skripty se
        spouštějí v pořadí, v jakém ve stránce stojí),
     4. vložený odchytávač v hlavičce je na všech stránkách týž do
        bajtu, stojí ZA hlavičkou CSP (jinak by ho politika nekryla)
        a jeho hash v té politice opravdu je.

   Sabotáž, kterou to musí chytit: vrátit do js/mereni.js vlastní
   kontrolu hostitele; přehodit v hlavičce pořadí obou odkazů; změnit
   mezeru ve vloženém skriptu (hash v CSP přestane souhlasit).
   ================================================================== */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { VLOZENY, ZNACKA } from './hlasic-chyb.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1) sdílený modul nese všechny tři věci ----------------------- */
{
  const kod = readFileSync(path.join(KOREN, 'js', 'neosobni.js'), 'utf8');
  const poslano = [];
  const window = {
    document: {}, location: { hostname: 'parcelaka.cz', pathname: '/kontakt.html' },
    PK_SUPABASE_URL: 'https://db.example', PK_SUPABASE_KEY: 'klic',
  };
  const navigator = { sendBeacon: (a, b) => { poslano.push({ a, b }); return true; } };
  new Function('window', 'navigator', 'Blob', 'fetch', kod)
    .call(null, window, navigator, function Blob(c) { this.c = c; }, () => {});
  const N = window.PKNeosobni;
  pravda('sdílený modul se založí a nese tři věci',
    !!N && typeof N.smimePoslat === 'function' && typeof N.jmenoStranky === 'function'
      && typeof N.posliRpc === 'function', 'PKNeosobni: ' + JSON.stringify(Object.keys(N || {})));
  pravda('na ostrém webu posílat smí', N && N.smimePoslat() === true);
  pravda('jméno stránky je jméno souboru', N && N.jmenoStranky() === 'kontakt.html',
    N && N.jmenoStranky());
  if (N) {
    N.posliRpc('zapis_chybu', '{}');
    pravda('posílá na RPC té funkce, kterou si volající řekl',
      poslano.length === 1 && /\/rest\/v1\/rpc\/zapis_chybu\?apikey=klic$/.test(poslano[0].a),
      'adresa: ' + (poslano[0] || {}).a);
  }

  /* Stráže se zkouší každá zvlášť: „neposílá se" je slabé tvrzení,
     když neposílá ani v jednom případě ze špatného důvodu. */
  const zkus = (popis, uprav) => {
    const w = {
      document: {}, location: { hostname: 'parcelaka.cz', pathname: '/' },
      PK_SUPABASE_URL: 'https://db.example', PK_SUPABASE_KEY: 'klic',
    };
    const nav = {};
    uprav(w, nav);
    new Function('window', 'navigator', 'Blob', 'fetch', kod)
      .call(null, w, nav, function B() {}, () => {});
    pravda(popis, w.PKNeosobni && w.PKNeosobni.smimePoslat() === false);
  };
  zkus('mimo ostrý web neposílá nic', (w) => { w.location.hostname = 'localhost'; });
  zkus('při „nesledovat" neposílá nic', (w, nav) => { nav.doNotTrack = '1'; });
  zkus('při Global Privacy Control neposílá nic', (w, nav) => { nav.globalPrivacyControl = true; });
  zkus('v automatizovaném prohlížeči neposílá nic', (w, nav) => { nav.webdriver = true; });
  zkus('bez adresy databáze neposílá nic', (w) => { delete w.PK_SUPABASE_URL; });
}

/* ---- 2) stráže nejsou nikde jinde -------------------------------- */
{
  const STRAZ = /navigator\.sendBeacon|navigator\.doNotTrack|globalPrivacyControl|navigator\.webdriver/;
  /* KOMENTÁŘ NENÍ KOPIE. js/mereni.js i js/chyby.js o těch stráží
     píšou — a mají, protože bez vysvětlení by nikdo nevěděl, že se
     měření schválně nepočítá v robotu. Hlídá se tedy kód, ne próza;
     jinak by tahle zkouška nutila vysvětlení mazat. */
  const bezKomentaru = (k) => k.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const kopie = readdirSync(path.join(KOREN, 'js')).filter((f) => f.endsWith('.js'))
    .filter((f) => f !== 'neosobni.js')
    .filter((f) => STRAZ.test(bezKomentaru(readFileSync(path.join(KOREN, 'js', f), 'utf8'))));
  pravda('stráže i cesta ven jsou jen v jednom souboru', kopie.length === 0,
    'má je i: ' + kopie.join(', ') + ' — dvě kopie jednoho zákazu nejsou jeden zákaz');
}

/* ---- 3) a 4) stránky: co si berou a v jakém pořadí ---------------- */
{
  const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
  pravda(`je co měřit — stránek je ${stranky.length}`, stranky.length > 2000, `jen ${stranky.length}`);

  const HASH = 'sha256-' + createHash('sha256')
    .update(VLOZENY.replace(/^<script [^>]*>/, '').replace(/<\/script>$/, ''), 'utf8').digest('base64');

  const bezSdileneho = [], spatnePoradi = [], jinyText = [], predCsp = [], bezHashe = [], bezOdchytavace = [];
  for (const f of stranky) {
    const h = readFileSync(path.join(KOREN, f), 'utf8');
    const iN = h.search(/<script src="js\/(?:min\/)?neosobni\.js/);
    const iC = h.search(/<script src="js\/(?:min\/)?chyby\.js/);
    const iM = h.search(/<script src="js\/(?:min\/)?mereni\.js/);
    if ((iC >= 0 || iM >= 0) && iN < 0) { bezSdileneho.push(f); continue; }
    if (iC >= 0 && iN > iC) spatnePoradi.push(f);
    if (iM >= 0 && iN > iM) spatnePoradi.push(f);

    const vlozeny = h.match(new RegExp('<script ' + ZNACKA + '>[\\s\\S]*?</script>'));
    if (!vlozeny) { bezOdchytavace.push(f); continue; }
    if (vlozeny[0] !== VLOZENY) jinyText.push(f);
    const iCsp = h.indexOf('<meta http-equiv="Content-Security-Policy"');
    if (iCsp >= 0 && h.indexOf(vlozeny[0]) < iCsp) predCsp.push(f);
    const csp = (h.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [, ''])[1];
    if (csp.indexOf(HASH) < 0) bezHashe.push(f);
  }
  pravda('každá stránka má v hlavičce odchytávač chyb', bezOdchytavace.length === 0,
    `bez něj: ${bezOdchytavace.length} (${bezOdchytavace.slice(0, 3).join(', ')})`);
  pravda('kdo si bere měření nebo hlásič, bere si i sdílený modul', bezSdileneho.length === 0,
    `bez něj: ${bezSdileneho.length} (${bezSdileneho.slice(0, 3).join(', ')})`);
  pravda('a bere si ho dřív než oba', spatnePoradi.length === 0,
    `v opačném pořadí: ${spatnePoradi.length} (${spatnePoradi.slice(0, 3).join(', ')})`
    + ' — odložené skripty běží v pořadí ze stránky, takže by stráže ještě neexistovaly');
  pravda('odchytávač má na všech stránkách týž text do bajtu', jinyText.length === 0,
    `jiné znění: ${jinyText.length} (${jinyText.slice(0, 3).join(', ')}) — každé znění je další hash v CSP`);
  pravda('stojí ZA hlavičkou CSP, ne před ní', predCsp.length === 0,
    `před politikou: ${predCsp.length} (${predCsp.slice(0, 3).join(', ')})`
    + ' — politika z <meta> platí teprve na to, co přijde po ní');
  pravda(`a jeho hash (${HASH.slice(0, 20)}…) je v politice každé stránky`, bezHashe.length === 0,
    `bez hashe: ${bezHashe.length} (${bezHashe.slice(0, 3).join(', ')}) — prohlížeč by odchytávač zakázal`);
}

console.log('\nNeosobní odeslání: jedno pravidlo pro měření i hlášení chyb');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Neosobní odeslání: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
