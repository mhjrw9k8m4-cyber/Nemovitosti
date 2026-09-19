// Testy rozhodování nad tím, co model na fotce vidí (js/fototema.js).
//
// Čísla nejsou vymyšlená: jsou to skutečné výstupy MobileNetu
// (assets/mobilenet/) na konkrétních obrázcích, změřené v prohlížeči
// při zapojení. Kdo sáhne na skupiny tříd nebo na prahy, tady hned uvidí,
// co to udělá s reálnými případy.
//
// Spuštění: node scripts/test-fototema.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const F = require_(path.join(ROOT, 'js', 'fototema.js'));
const TRIDY = require_(path.join(ROOT, 'js', 'tridy-imagenet.js'));
const SKUPINY = require_(path.join(ROOT, 'js', 'fotoskupiny.js'));

let bezi = 0, spadlo = 0;
function tvrdi(popis, podminka, detail) {
  bezi++;
  if (!podminka) { spadlo++; console.log(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}
// predikce se skutečným pořadovým číslem třídy (podle něj se hledá skupina)
function p(...dvojice) {
  return dvojice.map(([trida, jistota]) => {
    const index = TRIDY.indexOf(trida);
    if (index < 0) { console.log(`  ✕ test používá třídu „${trida}", kterou model nezná`); spadlo++; bezi++; }
    return { index, trida, jistota };
  });
}
const posud = (pred) => F.vyhodnot(pred, SKUPINY);

/* ---------- skutečně naměřeno v prohlížeči ---------- */

// Balíček slaniny z obchodu — tři výřezy ze snímku, který přišel jako hlášení.
// (Průměr ze tří pohledů na fotku: celek, střed, spodní třetina.)
const slanina1 = p(['packet', 16], ['nipple', 13], ['rotisserie', 4], ['carton', 6], ['plastic bag', 5]);
const slanina2 = p(['packet', 18], ['digital clock', 12], ['mousetrap', 9], ['cassette', 8], ['hard disc, hard disk, fixed disk', 7]);
const slanina3 = p(['pill bottle', 11], ['packet', 9], ['hard disc, hard disk, fixed disk', 9], ['loupe, jeweler\'s loupe', 9], ['oil filter', 8]);

for (const [popis, vzorek] of [['levá', slanina3], ['prostřední', slanina1], ['pravá', slanina2]]) {
  const r = posud(vzorek);
  tvrdi(`fotka slaniny (${popis}) neprojde`, r.ok === false, JSON.stringify(r));
  tvrdi(`fotka slaniny (${popis}): nic venkovního`, r.detail.venku === 0, JSON.stringify(r.detail));
}

// Výřez stránky s textem = snímek obrazovky
const stranka = p(['web site, website, internet site, site', 34], ['envelope', 30], ['rule, ruler', 12], ['menu', 5]);
const rs = posud(stranka);
tvrdi('snímek stránky neprojde', rs.ok === false, JSON.stringify(rs));
tvrdi('hláška mluví o snímku obrazovky', /snímek obrazovky|dokument/.test(rs.msg || ''), rs.msg);

// Portrét člověka
const portret = p(['military uniform', 58], ['suit, suit of clothes', 15], ['bow tie, bow-tie, bowtie', 10]);
tvrdi('portrét člověka neprojde', posud(portret).ok === false);

/* ---------- co MUSÍ projít ---------- */
tvrdi('louka s kopci projde', posud(p(['valley, vale', 41], ['alp', 22], ['lakeside, lakeshore', 8])).ok === true);
tvrdi('pole se senem projde', posud(p(['hay', 63], ['barn', 9], ['tractor', 4])).ok === true);
tvrdi('pozemek s plotem projde', posud(p(['worm fence, snake fence, snake-rail fence, Virginia fence', 35], ['picket fence, paling', 12])).ok === true);
tvrdi('stavební parcela u domu projde', posud(p(['mobile home, manufactured home', 28], ['picket fence, paling', 11], ['lawn mower, mower', 6])).ok === true);
tvrdi('les s houbami projde', posud(p(['agaric', 30], ['bolete', 12], ['hay', 5])).ok === true);

// Zvířata a auta k pozemku patřit můžou — nesmí fotku shodit
tvrdi('kráva na louce projde', posud(p(['ox', 52], ['oxcart', 8], ['hay', 6])).ok === true, JSON.stringify(posud(p(['ox', 52], ['oxcart', 8], ['hay', 6]))));
tvrdi('pes v zahradě projde', posud(p(['Cardigan, Cardigan Welsh corgi', 61], ['Pembroke, Pembroke Welsh corgi', 12])).ok === true);
tvrdi('auto u plotu projde', posud(p(['pickup, pickup truck', 44], ['car wheel', 9])).ok === true);
tvrdi('žralok (jiná třída se slovem hammer) neshodí fotku', posud(p(['hammerhead, hammerhead shark', 70])).ok === true);

/* ---------- nejistota se nezamítá ---------- */
const nejasne = p(['switch, electric switch, electrical switch', 13], ['wall clock', 5], ['spotlight, spot', 5]);
const rn = posud(nejasne);
tvrdi('slabé podezření jen upozorní, nezamítne', rn.ok === true && !!rn.varovani, JSON.stringify(rn));
tvrdi('prázdný výstup modelu projde (model se nenačetl)', posud([]).ok === true);
tvrdi('nic nedodáno → projde', F.vyhodnot(null, SKUPINY).ok === true);
tvrdi('když model vidí i krajinu, fotka projde', posud(p(['packet', 30], ['hay', 14], ['barn', 8])).ok === true);

/* ---------- hlášky ---------- */
const rb = posud(slanina1);
tvrdi('hláška pojmenuje, co model vidí', /zabalené zboží/.test(rb.msg || ''), rb.msg);
const neznama = posud(p(['oscilloscope, scope, cathode-ray oscilloscope, CRO', 40], ['hard disc, hard disk, fixed disk', 12]));
tvrdi('u třídy bez českého názvu hláška nekoktá anglicky',
  !/oscilloscope/.test(neznama.msg || ''), neznama.msg);

/* ---------- detail ---------- */
const d = posud(p(['hay', 40], ['barn', 15])).detail;
tvrdi('detail spočítá skóre „venku"', d.venku === 55, JSON.stringify(d));
tvrdi('detail nese nejsilnější třídy', d.nej.length === 2 && d.nej[0].cesky === 'seno', JSON.stringify(d.nej));

/* ---------- zatřídění tříd ---------- */
tvrdi('skupin je přesně 1000 znaků', SKUPINY.length === 1000, 'je jich ' + SKUPINY.length);
tvrdi('skupiny obsahují jen V, N a tečku', /^[VN.]+$/.test(SKUPINY));
const pocet = (z) => SKUPINY.split('').filter((c) => c === z).length;
tvrdi('venkovních tříd je aspoň 50', pocet('V') >= 50, 'je jich ' + pocet('V'));
tvrdi('nevhodných tříd je aspoň 150', pocet('N') >= 150, 'je jich ' + pocet('N'));
// pár kontrolních bodů, že zatřídění sedí
for (const [trida, cekano] of [['hay', 'V'], ['packet', 'N'], ['web site, website, internet site, site', 'N'],
  ['ox', '.'], ['pickup, pickup truck', '.'], ['tractor', 'V'], ['toilet seat', 'N'], ['hammerhead, hammerhead shark', '.']]) {
  const i = TRIDY.indexOf(trida);
  tvrdi(`třída „${trida.split(',')[0]}" je ve skupině ${cekano}`, SKUPINY.charAt(i) === cekano,
    'je v ' + SKUPINY.charAt(i));
}

console.log(`\nRozpoznání obsahu fotek: ${bezi} testů`);
if (spadlo) { console.error(`\n${spadlo} z ${bezi} NEPROŠLO.`); process.exit(1); }
console.log('Všechny prošly.\n');
