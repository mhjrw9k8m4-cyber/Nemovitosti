#!/usr/bin/env node
/* ČESKÉ MNOŽNÉ ČÍSLO: NULA SE CHOVÁ JAKO PĚT, NE JAKO DVĚ
   ==================================================================
   Spuštění: node scripts/test-mnozstvi.mjs   (bez prohlížeče)

   Čeština má u počtu tři tvary: 1 pozemek, 2–4 pozemky, 0 a 5+ pozemků.
   Nula patří k té TŘETÍ skupině — „0 pozemků", ne „0 pozemky".

   Takhle to prasklo: na stránce s daty stálo o statickém odrazu
   inzerátů od majitelů „(teď 0 inzeráty)". Podmínka byla napsaná jako
   `n === 1 ? 'inzerát' : (n < 5 ? 'inzeráty' : 'inzerátů')` — a nula je
   menší než pět, takže spadla do tvaru pro dvě až čtyři.

   Změřeno: týž tvar byl v kódu na 20 místech. U většiny z nich se nula
   stát nemohla (byla odchycená dřív — `if (!n) return ''`), ale u tří
   mohla: „Hotovo · 0 nabídky" v rychlém výběru, „je tu 0 pozemky"
   u hlídaného místa a „0 nepřečtené zprávy" v popisku odznaku. Všech
   dvacet se proto přepsalo na tvar, který nulu zvládne sám:
   `n >= 2 && n <= 4`. Je to táž práce, jen se na ní nedá zapomenout.

   Tahle zkouška hlídá, aby se ta podmínka nevrátila. Nehlídá text —
   hlídá TVAR: v kódu, který mluví k lidem, nesmí být `n < 5 ?`.
   Kdyby někdy vznikl případ, kde to s množným číslem nemá nic
   společného, patří sem do VYJIMKY s napsaným důvodem.
   ================================================================== */
import { readFileSync, readdirSync } from 'node:fs';
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

/* Soubor:řádek → důvod. Prázdné je v pořádku a je to cíl. */
const VYJIMKY = {};

const PODEZRELY = /[A-Za-z_][\w.]*\s*<\s*5\s*\?/;
const soubory = [];
for (const d of ['js', 'scripts']) {
  for (const f of readdirSync(path.join(KOREN, d))) {
    if (d === 'js' && !f.endsWith('.js')) continue;
    if (d === 'scripts' && !f.endsWith('.mjs')) continue;
    if (f.startsWith('test-')) continue;
    soubory.push(d + '/' + f);
  }
}
for (const f of readdirSync(KOREN)) if (f.endsWith('.html')) soubory.push(f);

const nalezy = [];
for (const rel of soubory) {
  const radky = readFileSync(path.join(KOREN, rel), 'utf8').split('\n');
  radky.forEach((r, i) => {
    if (!PODEZRELY.test(r)) return;
    const klic = rel + ':' + (i + 1);
    if (VYJIMKY[klic]) return;
    nalezy.push(klic + '  ' + r.trim().slice(0, 120));
  });
}
pravda(`nikde v kódu není „n < 5 ?" (prohlédnuto ${soubory.length} souborů)`,
  nalezy.length === 0,
  'nula by tam spadla do tvaru pro dvě až čtyři:\n      ' + nalezy.join('\n      '));

/* TŘI MÍSTA, KDE SE NULA OPRAVDU STÁT MOHLA. Zákaz tvaru výš by sám
   nestačil: kdo tu podmínku smaže celou (třeba ji vytáhne do pomocné
   funkce, která bude špatná), zákazem projde. Proto se tahle tři místa
   hlídají jmenovitě — jsou to ta, kde se nula na obrazovku dostane:
     · rychlý výběr („Hotovo · 0 nabídky") — rozsah, do kterého nic
       nespadne, je běžný: stačí „cena od sta milionů",
     · hlídané místo („přibyly 0 pozemky") — hláška o novinkách
       v okolí. Do 29. 10. to byl podnadpis tabule nad výpisem („je tu
       0 pozemky"); tabule je pryč a počet nese hláška. Nula se tam
       dnes nedostane (hláška se ozve, jen když opravdu něco přibylo),
       ale tvar se hlídá dál — podmínka se může kdykoli uvolnit,
     · popisek odznaku zpráv („0 nepřečtené zprávy") — ten se počítá
       i při nule, protože se zároveň nastavuje odznaku. */
const JMENOVITE = [
  ['js/main.js', "(vybranych >= 2 && vybranych <= 4 ? 'nabídky' : 'nabídek')", 'rychlý výběr'],
  ['js/main.js', "(n.nove >= 2 && n.nove <= 4 ? 'přibyly ' + n.nove + ' pozemky' : 'přibylo ' + n.nove + ' pozemků')", 'hlídané místo'],
  ['js/ucet-taby.js', "(n >= 2 && n <= 4 ? n + ' nepřečtené zprávy'", 'odznak zpráv'],
];
for (const [rel, usek, kde] of JMENOVITE) {
  const t = readFileSync(path.join(KOREN, rel), 'utf8');
  pravda(`${kde}: tvar pro nulu je na místě (${rel})`, t.indexOf(usek) !== -1,
    `v souboru chybí přesně tenhle úsek:\n      ${usek}`);
}

/* Konečně na výsledku: ta jediná věta, která tu vadu ukázala. */
{
  const data = readFileSync(path.join(KOREN, 'data.html'), 'utf8');
  const m = /\(teď\s*([\d\s]+)\s*(inzerát|inzeráty|inzerátů)\)/.exec(data);
  pravda('stránka s daty uvádí počet inzerátů od majitelů', !!m,
    'věta o user-listings.json na stránce není');
  if (m) {
    const n = Number(String(m[1]).replace(/\s/g, ''));
    const spravne = n === 1 ? 'inzerát' : (n >= 2 && n <= 4 ? 'inzeráty' : 'inzerátů');
    pravda(`a tvar slova k tomu počtu sedí (${n} ${m[2]})`, m[2] === spravne,
      `u ${n} má být „${spravne}"`);
  }
}

console.log('\nČeské množné číslo u počtů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Množné číslo: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
