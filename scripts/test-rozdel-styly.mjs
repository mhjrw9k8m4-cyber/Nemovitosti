/* Test: zkrácený stylopis je aktuální a vyjímá se podle pravidel.
   ==================================================================
   Spuštění: node scripts/test-rozdel-styly.mjs   (bez prohlížeče)

   Prohlížečová kontrola je scripts/test-rozdeleni-stylu.mjs — ta
   dokazuje NÁSLEDEK (vypočtené styly se neliší). Tady se kontroluje
   vstup do té úvahy, protože rozhodovací pravidlo má tři místa, kde
   se dá tiše splést a nikdo si toho nevšimne:

     1. ČÁRKA. `.hero, .wrap` zabere, i když `.hero` na stránce není.
        Kdyby se selektor nerozsekal, vypadl by i `.wrap`.
     2. NEGACE. `#nav a:not(.btn-primary)` nevyžaduje `.btn-primary`.
        Kdyby se obsah :not() počítal jako potřebný token, zmizelo by
        pravidlo, které na stránce platí.
     3. SLOVO VE SKRIPTU. Třídu `hl-bez-pasu` nemá v HTML nikdo —
        přidává ji js/hlavicka.js. Kdyby se koukalo jen do HTML,
        přestala by se hlavička při posouvání chovat.

   Ke každému bodu je tu případ, který při obrácení rozhodnutí spadne.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { castiSelektoru, muzeZabrat, tokenyStranky, sloucTokeny, rozparsuj, rozdel, PLNY_STYLOPIS } from './rozdel-styly.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1) rozhodovací pravidlo ---------------------------------- */
const T = (...tridy) => ({ tridy: new Set(tridy), idy: new Set(), atributy: new Set(), slova: new Set() });

pravda('čárka: `.hero, .wrap` zabere, když je jen .wrap',
  muzeZabrat(castiSelektoru('.hero, .wrap'), T('wrap')),
  'selektor se nerozsekal po čárkách');
pravda('a `.hero .wrap` nezabere, když .hero chybí',
  !muzeZabrat(castiSelektoru('.hero .wrap'), T('wrap')),
  'uvnitř jedné části musí platit všechny tokeny');
pravda('negace: `a:not(.btn-primary)` nevyžaduje .btn-primary',
  muzeZabrat(castiSelektoru('a:not(.btn-primary)'), T()),
  'obsah :not() se počítá jako potřebný token');
pravda('vnořená negace: `a:not(.x:not(.y))` taky ne',
  muzeZabrat(castiSelektoru('a:not(.x:not(.y))'), T()),
  'zahazování :not() nezvládá vnoření');
pravda('typový selektor bez tříd se nechává vždy (`body`, `0%`)',
  muzeZabrat(castiSelektoru('body'), T()) && muzeZabrat(castiSelektoru('0%'), T()),
  'pravidlo bez tříd a id se nesmí vyjímat');
pravda('id se pozná: `#leaflet-map` nezabere bez toho id',
  !muzeZabrat(castiSelektoru('#leaflet-map'), T()),
  'id se neověřuje');
pravda('atribut se pozná: `[data-type]` nezabere, když ho nikdo nemá',
  !muzeZabrat(castiSelektoru('[data-type="sale"]'), T()),
  'jméno atributu se neověřuje');

/* ---- 2) tokeny stránky berou i skripty ------------------------ */
const hlavicka = fs.readFileSync(path.join(KOREN, 'js', 'hlavicka.js'), 'utf8');
pravda('js/hlavicka.js opravdu zmiňuje hl-bez-pasu (jinak měří následující prázdno)',
  hlavicka.includes('hl-bez-pasu'), 'třída se přejmenovala — uprav test');
const kontakt = tokenyStranky(fs.readFileSync(path.join(KOREN, 'kontakt.html'), 'utf8'));
pravda('slovo ze skriptu stránky se počítá (.hl-bez-pasu na kontakt.html)',
  muzeZabrat(castiSelektoru('header.hl-bez-pasu'), kontakt),
  'tokeny se berou jen z HTML — pravidla pro stavy ze skriptů by zmizela');
const pozemek = tokenyStranky(fs.readFileSync(path.join(KOREN, 'pozemek.html'), 'utf8'));
pravda('a slovo z vendor/leaflet (.leaflet-control-zoom na stránce pozemku)',
  muzeZabrat(castiSelektoru('.leaflet-control-zoom a'), pozemek),
  'cizí knihovna si třídy tvoří sama — musí se číst i vendor/*.js');

/* ---- 3) vyjmutí nepřeskládá zbytek ---------------------------- */
const zdroj = fs.readFileSync(path.join(KOREN, 'css', 'styles.css'), 'utf8');
const pravidla = rozparsuj(zdroj);
pravda(`stylopis se rozparsoval (${pravidla.length} pravidel)`,
  pravidla.length > 1500, `jen ${pravidla.length}`);
let vzestupne = true;
for (let i = 1; i < pravidla.length; i++) if (pravidla[i].od < pravidla[i - 1].od) vzestupne = false;
pravda('pravidla jdou v pořadí zdroje (na tom stojí celá úvaha o kaskádě)',
  vzestupne, 'rozsahy nejsou vzestupné');
pravda('a žádné dvě se nepřekrývají',
  pravidla.every((p, i) => i === 0 || p.od >= pravidla[i - 1].do),
  'překryv rozsahů by při vyjmutí zdvojil text');

const indexT = tokenyStranky(fs.readFileSync(path.join(KOREN, 'index.html'), 'utf8'));
const prazdne = { tridy: new Set(), idy: new Set(), atributy: new Set(), slova: new Set() };
const nic = rozdel(zdroj, indexT, indexT);
pravda('vyjmutí proti sobě samému nevyjme nic', nic.vyjmuto === 0, `vyjmuto ${nic.vyjmuto}`);
const vse = rozdel(zdroj, indexT, prazdne);
pravda(`a proti prázdné stránce vyjme skoro celý zdroj (${(100 * vse.bajtu / Buffer.byteLength(zdroj)).toFixed(0)} %)`,
  vse.bajtu > Buffer.byteLength(zdroj) * 0.45, `jen ${vse.bajtu} B`);

/* ---- 4) hotový soubor odpovídá zdroji ------------------------- */
const ZAKLAD = path.join(KOREN, 'css', 'zaklad.min.css');
pravda('css/zaklad.min.css existuje', fs.existsSync(ZAKLAD), 'spusťte node scripts/oprav.mjs');
let kontrolaOk = true, vystup = '';
try { vystup = execFileSync('node', [path.join(KOREN, 'scripts', 'rozdel-styly.mjs'), '--kontrola'], { cwd: KOREN, encoding: 'utf8' }); }
catch (e) { kontrolaOk = false; vystup = String(e.stdout || e.message); }
pravda('a odpovídá css/styles.css i odkazům ve stránkách', kontrolaOk, vystup.trim().split('\n')[0]);

if (fs.existsSync(ZAKLAD)) {
  const z = fs.statSync(ZAKLAD).size;
  const p = fs.statSync(path.join(KOREN, 'css', 'styles.min.css')).size;
  pravda(`zkrácený je aspoň o třetinu menší (${(z / 1024).toFixed(0)} proti ${(p / 1024).toFixed(0)} kB)`,
    z < p * 0.67, `${(100 - 100 * z / p).toFixed(1)} % — rozdělení přestalo mít smysl`);
  pravda('a není prázdný ani omylem zkrácený na nic', z > 40 * 1024, `${z} B`);
}

/* ---- 5) kdo si co bere ---------------------------------------- */
const stranky = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
const plny = [], zkraceny = [], zadny = [];
for (const f of stranky) {
  const s = fs.readFileSync(path.join(KOREN, f), 'utf8');
  if (/href="css\/styles\.min\.css/.test(s)) plny.push(f);
  else if (/href="css\/zaklad\.min\.css/.test(s)) zkraceny.push(f);
  else zadny.push(f);
}
pravda(`plný stylopis si bere jen ${[...PLNY_STYLOPIS].join(', ')}`,
  plny.length === PLNY_STYLOPIS.size && plny.every((f) => PLNY_STYLOPIS.has(f)),
  `${plny.length}: ` + plny.slice(0, 5).join(', '));
pravda(`zkrácený si bere zbytek webu (${zkraceny.length})`,
  zkraceny.length > 2000, `jen ${zkraceny.length}`);
pravda(`bez stylopisu jsou jen soběstačné stránky (${zadny.length})`,
  zadny.every((f) => /<style/.test(fs.readFileSync(path.join(KOREN, f), 'utf8'))),
  'stránka bez stylopisu a bez vlastního <style>: ' + zadny.join(', '));

console.log('\nRozdělení stylopisu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Rozdělení stylopisu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
