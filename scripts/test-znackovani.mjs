// Test: hotové stránky nemají víc zavíracích značek, než otevřely.
//
// Spuštění: node scripts/test-znackovani.mjs   (bez prohlížeče)
//
// NALEZENO MĚŘENÍM. Statický výpis na stránce pozemku se vkládal
// nenasytným vzorem `<div id="pz-detail">[\s\S]*?<\/div>`, a ten se
// zastaví na PRVNÍM `</div>`. V předloze je uvnitř ještě jeden div
// („Načítám pozemek…"), takže se nahradila jen jeho první polovina
// a zavírací značka prvku zůstala navíc: každá z 2 140 stránek pozemků
// měla o jeden `</div>` víc, než otevřela. Předloha pozemek.html přitom
// vyvážená byla — vadu dělal generátor.
//
// PROHLÍŽEČ TO ODPOUŠTÍ a DOM vyšel správně (ověřeno: #pz-detail seděl
// v main > .pz-wrap a <main> neobsahoval patičku). Právě proto se na to
// nedalo přijít pohledem na stránku a právě proto to má hlídat zkouška:
// platné HTML není kosmetika, je to to, s čím počítá každý nástroj,
// který na rozdíl od prohlížeče neodpouští.
//
// Počítají se značky, které se NESMÍ nechat neuzavřené: div, section,
// article, table, button, a, span. <li> a <p> se schválně nehlídají —
// tam zavírá prohlížeč za autora a nevyvážený zápis je legální, takže
// by zkouška hlásila chybu tam, kde žádná není.
// (Změřeno u toho: mimo <div> byly všechny ostatní značky na všech
// 2 276 stránkách vyvážené. Vada byla jedna, ne řada — a tenhle seznam
// je proto pojistka dopředu, ne úklid.)
import fs from 'node:fs';
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

/* Skripty a styly se vyjmou: v nich může <div být kus textu. */
const ZNACKY = ['div', 'section', 'article', 'table', 'button', 'a', 'span'];
function bilance(html, znacka = 'div') {
  const h = html.replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const re = new RegExp('<' + znacka + '\\b|</' + znacka + '>', 'g');
  let hl = 0, nejniz = 0;
  for (const m of h.matchAll(re)) {
    hl += m[0].startsWith('</') ? -1 : 1;
    if (hl < nejniz) nejniz = hl;
  }
  return { konec: hl, nejniz };
}

const soubory = fs.readdirSync(KOREN).filter((f) => /\.html$/.test(f));
pravda('stránky se našly', soubory.length > 100, `je jich ${soubory.length}`);

const nevyvazene = [], zaporne = [];
for (const f of soubory) {
  const html = fs.readFileSync(path.join(KOREN, f), 'utf8');
  for (const z of ZNACKY) {
    const b = bilance(html, z);
    if (b.konec !== 0) nevyvazene.push(`${f} <${z}> (${b.konec > 0 ? '+' : ''}${b.konec})`);
    /* Záporná úroveň je horší než nenulový součet: znamená zavírací
       značku tam, kde není co zavřít, a prohlížeč si podle ní zavře
       cizí prvek. */
    if (b.nejniz < 0) zaporne.push(`${f} <${z}>`);
  }
}
pravda('každá stránka zavírá tolik značek, kolik otevřela',
  nevyvazene.length === 0, `${nevyvazene.length} neshod, např. ${nevyvazene.slice(0, 3).join(', ')}`);
pravda('a žádná nezavírá značku, kterou neotevřela',
  zaporne.length === 0, `${zaporne.length} neshod, např. ${zaporne.slice(0, 3).join(', ')}`);

/* Pojistka proti bezzubosti: kdyby se měřilo něco, co nikdy nevyjde
   nenulově, byla by zkouška zelená navždycky. Vada se proto zkusí
   nasimulovat. */
{
  const vzorek = soubory.find((f) => /^pozemek-.*-[0-9a-z]{5,8}\.html$/.test(f));
  const h = fs.readFileSync(path.join(KOREN, vzorek), 'utf8');
  pravda('měření pozná přebytečnou zavírací značku',
    bilance(h.replace('</article>', '</article></div>')).konec === -1,
    'do stránky se přidal </div> navíc a bilance zůstala nula');
  pravda('a pozná i neuzavřený div',
    bilance(h.replace('<article', '<div><article')).konec === 1,
    'do stránky se přidal neuzavřený <div> a bilance zůstala nula');
}

zpravy.push(`  · naměřeno: ${soubory.length} stránek × ${ZNACKY.length} značek, všechno vyvážené`);
console.log('\nVyváženost značek');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Značkování: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
