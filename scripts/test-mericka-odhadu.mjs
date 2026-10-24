// Test: měřidlo přesnosti odhadu měří to, co tvrdí.
//
// Spuštění: node scripts/test-mericka-odhadu.mjs   (nepotřebuje prohlížeč)
//
// PROČ VZNIKL. scripts/mericka-odhadu.mjs je nástroj, kterým se
// rozhoduje o jádru webu — o odhadu ceny. A tvrdil nepravdu: varianta
// „okolí" vycházela o 2,3 až 3,0 p.b. lepší než živý model, takže to
// vypadalo na nápad k zavedení. Jenže okolí je v js/ceny.js dávno a jde
// první; rozdíl byl v tom, KDO se do srovnání počítá. Živý model bere
// jen běžné nabídky (`type === 'sale'`) a vynechává ceny stanovené
// úředně (SPÚ, `spravniCena`) — vyvolávací a úřední cenu nestanovil
// trh. Varianta je brala. Měřil se tím vstupní filtr, ne zeměpis.
//
// Nejhorší na tom je, že to vypadalo jako dobrá zpráva: číslo svítilo
// zeleně, ve prospěch nápadu, a kdo by ho neověřil, zavedl by do
// srovnávací hladiny ceny, o kterých web jinde výslovně píše, že do ní
// nepatří.
//
// Hlídá se proto CHOVÁNÍ, ne text: se stejnými vstupními pravidly musí
// varianta dávat skoro totéž co živý model. Když se filtr z varianty
// vypustí, rozdíl vyskočí na stovky nabídek a tahle zkouška padne.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const pust = (args) => execFileSync('node', [path.join(KOREN, 'scripts', 'mericka-odhadu.mjs'), ...args],
  { encoding: 'utf8', cwd: KOREN });

console.log('\nMěřidlo přesnosti odhadu');

/* ---- 1) základní běh vydá obě čísla, ne jen jedno ---------------- */
{
  const out = pust([]);
  const chyba = /dnešní model\s+medián chyby ([\d.]+) %/.exec(out);
  const odch = /znaménková odchylka\s+medián (-?[\d.]+) %/.exec(out);
  pravda('vydá medián absolutní chyby', !!chyba && Number(chyba[1]) > 5,
    'nenašel jsem řádek „dnešní model … medián chyby"');
  pravda('a taky ZNAMÉNKOVOU odchylku (jinak se nepozná zkreslení od rozptylu)',
    !!odch, 'nenašel jsem řádek „znaménková odchylka"');

  /* VLASTNOST PRODUKTU, NE MĚŘIDLA: odhad z okolí má být nezkreslený.
     Naměřeno při psaní: okolí +0,4 %, kraj +8,0 %, celkem +1,4 %.
     Mez je 5 p.b. — kdyby se okolí posunulo nad ni, přestal by web
     psát „obvyklá cena" a začal by soustavně nadhadzovat nebo
     podhadzovat, a nikdo by si toho nevšiml. */
  const okoli = /· okoli\s+n=\s*(\d+)\s+medián\s+(-?[\d.]+) %/.exec(out);
  pravda('odhad z okolí není zkreslený (do 5 p.b.)',
    !!okoli && Math.abs(Number(okoli[2])) <= 5,
    okoli ? `okolí má odchylku ${okoli[2]} %` : 'řádek o okolí v rozpadu chybí');
  /* A že ten nejtěsnější krok opravdu nese většinu odhadů — kdyby
     okolí přestalo chytat, odhady by tiše spadly na kraj, který je
     zkreslený o 8 %. */
  const kraj = /· kraj\s+n=\s*(\d+)/.exec(out);
  const nOkoli = okoli ? Number(okoli[1]) : 0;
  const nKraj = kraj ? Number(kraj[1]) : 0;
  pravda('a nese většinu odhadů (okolí víc než kraj)', nOkoli > nKraj,
    `okolí ${nOkoli}, kraj ${nKraj}`);
}

/* ---- 2) varianta „okolí" měří zeměpis, ne vstupní filtr ---------- */
{
  const out = pust(['--okoli', '--rychle']);
  const m = /okolí K=10 R=25 km\s+medián chyby ([\d.]+) %[^|]*?odhadů (\d+)\s+párově: lepší (\d+), horší (\d+)/.exec(out);
  pravda('varianta okolí se dá změřit', !!m, out.split('\n').slice(-3).join(' '));
  if (m) {
    const odhadu = Number(m[2]), lepsi = Number(m[3]), horsi = Number(m[4]);
    const jinak = lepsi + horsi;
    /* Naměřeno při psaní: 36 lepších a 33 horších z 1 119, tedy 6 %.
       Zbytek rozdílu dělá přepočet na výměru (varianta ho bez --sklon
       nedělá) a mez vzorku (živý model bere okolí i při osmi cenách,
       varianta vyžaduje deset). Bez vstupního filtru to bylo 193 a 141,
       tedy 30 % — a právě na to je tahle mez. */
    pravda('a dává skoro totéž co živý model (rozdíl do 15 % nabídek)',
      jinak / odhadu < 0.15,
      `liší se u ${jinak} z ${odhadu} odhadů (${(jinak / odhadu * 100).toFixed(0)} %)`
      + ' — tolik znamená, že varianta měří jiná VSTUPNÍ PRAVIDLA než živý model,'
      + ' ne jiný zeměpis (vynechává se `type === sale` nebo `spravniCena`?)');
  }
}

/* ---- 3) a ta druhá otázka je pojmenovaná zvlášť ------------------ */
{
  const out = pust(['--okoli', '--rychle', '--i-drazby']);
  const m = /okolí K=10 R=25 km\s+medián chyby ([\d.]+) %/.exec(out);
  pravda('s --i-drazby se dá změřit i ta druhá otázka (ceny mimo trh)', !!m,
    'přepínač --i-drazby nic nezměnil nebo zkouška spadla');
  /* Že se tím medián chyby OPRAVDU zlepší, je ten samý omyl, jen teď
     pojmenovaný: cena, kterou nestanovil trh, patří jinam než do
     srovnávací hladiny. Hlídá se tedy jen to, že ten přepínač existuje
     a mění výsledek — aby se ta otázka dala kdykoli znovu změřit. */
  const bez = /okolí K=10 R=25 km\s+medián chyby ([\d.]+) %/.exec(pust(['--okoli', '--rychle']));
  pravda('a je to doopravdy jiné měření než bez něj',
    !!m && !!bez && Math.abs(Number(m[1]) - Number(bez[1])) > 1,
    m && bez ? `s dražbami ${m[1]} %, bez nich ${bez[1]} %` : 'nepovedlo se porovnat');
}

console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Měřidlo odhadu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
