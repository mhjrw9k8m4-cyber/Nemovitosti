// Test: jak se cena a výměra píšou lidsky.
//
// Spuštění: node scripts/test-rozsah.mjs   (nepotřebuje prohlížeč ani síť)
//
// Z tohohle souboru zbyla třetina a stojí za to říct proč. Hlídal
// stupnici a histogram pro posuvník, kterým se v okně ceny a výměry
// vybíral rozsah klepnutím do sloupců: že stupnice není rovnoměrná, že
// žádný krok není prázdný, že jeden pozemek za tři sta milionů
// neroztáhne horní konec, a že se zarážka najde i k ručně napsanému
// číslu. 29. 10. nechal majitel graf zrušit („ten graf nad tím dej pryč
// a nech tam jen to nastavení ceny"), takže se ty čtyři výpočty
// (zarazky, histogram, hezke, index) smazaly i s nimi — a kontroly, co
// je hlídaly, neměly co měřit.
//
// Co zůstalo a proč to má smysl hlídat dál:
//  · POPISKY MUSÍ BÝT LIDSKÉ. V souhrnu panelu stojí „Cena · do 500
//    tis.", ne „do 500 000 Kč" a rozhodně ne „do 317 428 Kč".
//  · MEZERA PŘED JEDNOTKOU JE NEZLOMITELNÁ. „5 000" na konci řádku
//    a „m²" na dalším jsou dvě různá čísla (viz scripts/sazba.mjs).
//  · A JE TO ZAPOJENÉ. Modul, který nikdo nenačítá, je mrtvý kód —
//    přesně tak v něm dožil `index`, roky a bez povšimnutí.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const R = createRequire(import.meta.url)(path.join(ROOT, 'js', 'rozsah.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- 1) Popisky ------------------------------------------------------- */
{
  pravda('ceny se píší lidsky', R.popis(500000, 'kc') === '500 tis.' && R.popis(1500000, 'kc') === '1,5 mil.'
    && R.popis(2000000, 'kc') === '2 mil.', [R.popis(500000, 'kc'), R.popis(1500000, 'kc'), R.popis(2000000, 'kc')].join(' | '));
  pravda('malé částky se nezkracují', R.popis(900, 'kc') === '900', R.popis(900, 'kc'));
  pravda('výměry taky', R.popis(5000, 'm2') === '5 000 m²' && R.popis(10000, 'm2') === '1 ha'
    && R.popis(15000, 'm2') === '1,5 ha', [R.popis(5000, 'm2'), R.popis(10000, 'm2'), R.popis(15000, 'm2')].join(' | '));
  pravda('mezera před jednotkou je nezlomitelná',
    !/ m²$/.test(R.popis(5000, 'm2')) && !/ ha$/.test(R.popis(10000, 'm2')),
    R.popis(5000, 'm2') + ' | ' + R.popis(10000, 'm2'));
  pravda('„bez meze" se nepíše jako nekonečno', R.popis(Infinity, 'kc') === null);
}

/* --- 2) Modul nenese nic, co nikdo nečte ------------------------------ */
{
  const main = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const vyvoz = Object.keys(R);
  pravda('modul vyváží jen to, co se používá', vyvoz.length === 1 && vyvoz[0] === 'popis',
    'vyváží ' + vyvoz.join(', ') + ' — co z toho nikdo nevolá, patří pryč');
  const nepouzito = vyvoz.filter((k) => !new RegExp('PKRozsah\\.' + k + '\\(').test(main));
  pravda('a každý vyvezený výpočet má v js/main.js volajícího', nepouzito.length === 0,
    'nikdo nevolá: ' + nepouzito.join(', '));
}

/* --- 3) Je to zapojené? ----------------------------------------------- */
{
  const main = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const idx = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  pravda('index.html načítá js/rozsah.js', /js\/(?:min\/)?rozsah\.js/.test(idx));
  pravda('v panelu zůstala políčka od–do (fungují i bez skriptu)',
    /id="map-cena-od"/.test(idx) && /id="map-area-do"/.test(idx));
  pravda('souhrn v panelu se sází tímhle modulem', /PKRozsah\.popis\(c(Od|Do)/.test(main));
  pravda('zeď z pilulek ani posuvník v panelu nezůstaly',
    !/mc-rychle/.test(idx) && !/mc-posuv/.test(idx), 'v index.html pořád jsou');
  pravda('výběr se otevírá přes celou obrazovku', /rz-ov/.test(main) && /mc-shrnuti/.test(main));
  /* A graf se nevrátil zadní cestou: majitel ho nechal zrušit, takže
     v okně nesmí být ani sloupce, ani osa, ani nápověda k nim. */
  pravda('a sloupcový graf v něm není', !/rz-graf|rz-osa|rz-napoveda/.test(main),
    'v js/main.js se zase staví histogram');
}

console.log('\nCena a výměra lidsky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Rozsah: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
