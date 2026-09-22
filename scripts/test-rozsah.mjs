// Test: posuvník ceny a výměry — stupnice, histogram, popisky.
//
// Spuštění: node scripts/test-rozsah.mjs   (nepotřebuje prohlížeč ani síť)
//
// Výběr ceny a výměry byl nejdřív pět pilulek, pak osm i s počty. Osm
// pilulek ve čtyřech řadách je ale na telefonu zeď, kterou je potřeba
// přerolovat — a pořád je to jen hrstka hotových možností. Posuvník
// nabídne libovolný rozsah, jenže má vlastní úskalí, a ta hlídá tenhle
// test:
//
//  · STUPNICE NESMÍ BÝT ROVNOMĚRNÁ. Ceny jdou od pár tisíc po desítky
//    milionů. Na lineární stupnici by polovina nabídky ležela na prvním
//    procentu dráhy a táhlo by se muselo trefovat na pixel.
//  · ŽÁDNÁ ZARÁŽKA NESMÍ BÝT PRÁZDNÁ. Krok, za kterým se nic nezmění,
//    je pro člověka rozbité ovládání.
//  · HORNÍ KONEC SE NESMÍ ŘÍDIT VÝSTŘELKEM. Jediný pozemek za tři sta
//    milionů by roztáhl poslední krok přes celou horní polovinu stupnice.
//  · POPISKY MUSÍ BÝT LIDSKÉ. „do 317 428 Kč" nikdo nechce číst.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const R = createRequire(import.meta.url)(path.join(ROOT, 'js', 'rozsah.js'));
const DATA = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- 1) Hezká čísla ---------------------------------------------------- */
{
  pravda('zaokrouhluje nahoru na hezké číslo',
    R.hezke(317428) === 500000 && R.hezke(1200) === 1500 && R.hezke(99) === 100,
    `${R.hezke(317428)}, ${R.hezke(1200)}, ${R.hezke(99)}`);
  pravda('hezké číslo je vždy aspoň tak velké jako zadané',
    [1, 7, 42, 999, 1001, 123456, 9e6].every((x) => R.hezke(x) >= x));
  pravda('nesmysl nepoloží', R.hezke(0) === 0 && R.hezke(-5) === 0 && R.hezke(NaN) === 0 && R.hezke(Infinity) === 0);
}

/* --- 2) Zarážky na skutečných datech ----------------------------------- */
for (const [jm, pole, jedn] of [['cena', DATA.map((d) => d.price), 'kc'],
                                ['výměra', DATA.map((d) => d.area), 'm2']]) {
  const zar = R.zarazky(pole, 18);
  const hist = R.histogram(pole, zar);
  pravda(`${jm}: kroků je dost (aspoň deset)`, zar.length - 1 >= 10, `jen ${zar.length - 1}`);
  pravda(`${jm}: zarážky jdou vzestupně a začínají nulou`,
    zar[0] === 0 && zar.every((z, i) => i === 0 || z > zar[i - 1]), zar.join(' '));
  pravda(`${jm}: poslední je „a výš" (bez horní meze)`, zar[zar.length - 1] === Infinity);
  pravda(`${jm}: žádný krok není prázdný`, hist.every((n) => n > 0),
    hist.map((n, i) => n === 0 ? `${R.popis(zar[i], jedn)}–${R.popis(zar[i + 1], jedn) || '∞'}` : null).filter(Boolean).join(', '));
  pravda(`${jm}: součet přihrádek sedí s počtem nabídek`,
    hist.reduce((a, b) => a + b, 0) === pole.filter((x) => typeof x === 'number' && x > 0).length);

  /* Jádro věci: stupnice se musí řídit počtem nabídek, ne korunami.
     Na rovnoměrné stupnici by nejlidnatější krok sežral většinu nabídky. */
  const nej = Math.max(...hist), soucet = hist.reduce((a, b) => a + b, 0);
  pravda(`${jm}: nejlidnatější krok nepobere víc než pětinu nabídky`,
    nej <= soucet * 0.2, `${nej} z ${soucet} (${(100 * nej / soucet).toFixed(0)} %) — stupnice je moc hrubá`);

  // A pro srovnání: rovnoměrná stupnice by tenhle test neprošla.
  const cisla = pole.filter((x) => typeof x === 'number' && x > 0).sort((a, b) => a - b);
  const max = cisla[cisla.length - 1];
  const rovne = [];
  for (let i = 0; i <= 16; i++) rovne.push(Math.round(i * max / 16));
  rovne.push(Infinity);
  const histRovne = R.histogram(cisla, rovne);
  const nejRovne = Math.max(...histRovne);
  pravda(`${jm}: a rovnoměrná stupnice by byla prokazatelně horší`,
    nejRovne > nej * 2, `rovnoměrná ${nejRovne}, kvantilová ${nej} — rozdíl není dost velký, test nic nedokazuje`);
}

/* --- 3) Horní konec se neřídí výstřelkem ------------------------------- */
{
  const bezne = [];
  for (let i = 0; i < 300; i++) bezne.push(100000 + i * 1000);
  bezne.push(900000000);                      // jeden pozemek za devět set milionů
  const zar = R.zarazky(bezne, 18);
  const hist = R.histogram(bezne, zar);
  pravda('jediný výstřelek neroztáhne stupnici', zar[zar.length - 2] < 10000000,
    `předposlední zarážka je ${zar[zar.length - 2]} — kvůli jednomu pozemku`);
  pravda('a přesto se do poslední přihrádky započítá', hist[hist.length - 1] >= 1);
  pravda('žádná přihrádka nezůstane prázdná ani tady', hist.every((n) => n > 0), hist.join(','));
}

/* --- 4) Hledání zarážky podle napsaného čísla -------------------------- */
{
  const zar = R.zarazky(DATA.map((d) => d.price), 18);
  const i = R.index(zar, zar[3]);
  pravda('přesná hodnota najde svou zarážku', i === 3, `${i} místo 3`);
  const j = R.index(zar, (zar[3] + zar[4]) / 2);
  pravda('hodnota mezi dvěma najde jednu z nich', j === 3 || j === 4, String(j));
  pravda('prázdný vstup nevybere nic', R.index(zar, null) === -1 && R.index(zar, NaN) === -1);
}

/* --- 5) Popisky ------------------------------------------------------- */
{
  pravda('ceny se píší lidsky', R.popis(500000, 'kc') === '500 tis.' && R.popis(1500000, 'kc') === '1,5 mil.'
    && R.popis(2000000, 'kc') === '2 mil.', [R.popis(500000, 'kc'), R.popis(1500000, 'kc'), R.popis(2000000, 'kc')].join(' | '));
  // Tisíce dělí pevná mezera (aby se číslo nezlomilo), před jednotkou je běžná.
  pravda('výměry taky', R.popis(5000, 'm2') === '5\u00a0000 m\u00b2' && R.popis(10000, 'm2') === '1 ha'
    && R.popis(15000, 'm2') === '1,5 ha', [R.popis(5000, 'm2'), R.popis(10000, 'm2'), R.popis(15000, 'm2')].join(' | '));
  pravda('„bez meze" se nepíše jako nekonečno', R.popis(Infinity, 'kc') === null);
}

/* --- 6) Je to zapojené? ----------------------------------------------- */
{
  const main = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const idx = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  pravda('index.html načítá js/rozsah.js', /js\/rozsah\.js/.test(idx));
  pravda('a má posuvník na cenu i na výměru',
    /data-posuv="cena"/.test(idx) && /data-posuv="plocha"/.test(idx));
  pravda('js/main.js staví posuvníky ze společného modulu', /PKRozsah\.zarazky\(hodnoty, 18\)/.test(main));
  pravda('a histogram počítá podle ostatních filtrů', /PKRozsah\.histogram\(hodnoty, p\.zar\)/.test(main));
  pravda('zeď z pilulek je pryč', !/mc-rychle/.test(idx), 'v index.html pořád jsou');
}

console.log('\nPosuvník ceny a výměry — stupnice, histogram, popisky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Posuvník: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
