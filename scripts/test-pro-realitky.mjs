/* =====================================================================
   STRÁNKA PRO REALITNÍ KANCELÁŘE — ČÍSLA SEDÍ A NIC SE NESLIBUJE NAVÍC
   =====================================================================

   inzerce.html je stránka, kterou majitel posílá realitkám. Je to
   jediné místo na webu, kde se o Parcelce mluví k někomu, kdo sem
   teprve zvažuje dát svůj majetek — a kdo si každé číslo ověří.

   Hlídají se tři věci, a všechny jsou TVRZENÍ, ne znění:

   1. ČÍSLA SEDÍ S DATY. Počty na stránce doplňuje sestavení
      (scripts/cisla-do-textu.mjs) z data/mapa.json. Tahle zkouška
      spočítá totéž znovu, nezávisle, a porovná. Kdyby krok ze
      sestavení vypadl, zůstaly by značky prázdné — a to je tu vada,
      protože věta „<prázdno> nabídek na mapě" je horší než žádná.

   2. ŽÁDNÉ RUČNĚ NAPSANÉ POČTY. Číslo napsané do věty rukou je pravda
      do nejbližšího běhu robota. Hlídá se proto, že ve viditelném
      textu stránky není žádné číslo v tisících mimo ty doplňované
      značky. Tenhle hlídač je tu, aby budoucí úprava („doplním tam,
      že máme 2 500 nabídek") spadla hned, ne za měsíc.

   3. ŽÁDNÉ TVRZENÍ O NÁVŠTĚVNOSTI. Web je nový a kolik sem chodí
      lidí, se poctivě říct nedá — čítač návštěv žádné veřejné číslo
      nedává. Realitka, která by na vymyšlené číslo přišla, se
      nevrátí. Proto se hlídá, že stránka o návštěvnosti ani
      o uživatelích žádné číslo netvrdí.
   ===================================================================== */

import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const STRANKA = 'inzerce.html';
const html = readFileSync(new URL('../' + STRANKA, import.meta.url), 'utf8');
const data = JSON.parse(readFileSync(new URL('../data/mapa.json', import.meta.url), 'utf8'));

let chyb = 0;
const zpravy = [];
function pravda(co, podminka, proc) {
  if (podminka) { console.log('  ✓ ' + co); return; }
  chyb++; zpravy.push(co + ' ' + (proc || ''));
  console.log('  ✕ ' + co + (proc ? '\n      ' + proc : ''));
}

/* Nezávislý přepočet — schválně jinou cestou než cisla-do-textu.mjs
   (ten jede přes Set, tady přes objekt), ať se nechytí jen to, že se
   tatáž chyba spočítala dvakrát stejně. */
const o = Array.isArray(data.opportunities) ? data.opportunities : [];
const okresy = {}; const zdroje = {};
for (const x of o) {
  if (x && x.okres) okresy[x.okres] = 1;
  if (x && x.zdroj) zdroje[x.zdroj] = 1;
}
const mezera = ' ';
const sazba = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, mezera);
const [, mes, den] = String(data.updated || '').split('-');
const CEKA = {
  nabidky: sazba(o.length),
  okresy: sazba(Object.keys(okresy).length),
  zdroje: sazba(Object.keys(zdroje).length),
  kdy: `${Number(den)}.${mezera}${Number(mes)}.`,
};

console.log('\nStránka pro realitní kanceláře (' + STRANKA + ')\n');

/* ---- 1. ČÍSLA SEDÍ ------------------------------------------------ */
const nalezene = [...html.matchAll(/<span[^>]*\sdata-pk-cislo="([a-z]+)"[^>]*>([\s\S]*?)<\/span>/g)]
  .map((m) => ({ klic: m[1], text: m[2].trim() }));

pravda(`stránka nese doplňovaná čísla (${nalezene.length})`, nalezene.length >= 4,
  'na ' + STRANKA + ' nejsou značky data-pk-cislo — zkouška by měřila prázdno');

const prazdne = nalezene.filter((x) => !x.text);
pravda('a žádná značka nezůstala prázdná', prazdne.length === 0,
  'prázdné: ' + prazdne.map((x) => x.klic).join(', ')
    + ' — krok cisla-do-textu.mjs v sestavení neproběhl, nebo data/mapa.json chybí');

const nesedi = nalezene.filter((x) => CEKA[x.klic] !== undefined && x.text !== CEKA[x.klic]);
pravda('a každé sedí s data/mapa.json', nesedi.length === 0,
  nesedi.map((x) => `${x.klic}: na stránce „${x.text}", v datech „${CEKA[x.klic]}"`).join(' | '));

const cizi = nalezene.filter((x) => CEKA[x.klic] === undefined);
pravda('a žádná značka nemá neznámý klíč', cizi.length === 0,
  'neznámé: ' + cizi.map((x) => x.klic).join(', '));

/* ---- 2. ŽÁDNÉ RUČNĚ NAPSANÉ POČTY --------------------------------- */
/* Měří se VIDITELNÝ text TÉHLE STRÁNKY: bez komentářů, bez <head>
   (v CSP stojí hashe, v metadatech rozměry obrázku), bez skriptů,
   bez značek a bez obsahu doplňovaných značek.
   A BEZ LIŠTY: odznak „2 329" vedle „Hledat na mapě" tam vkládá
   sestavení (scripts/hlavicka.mjs) z týchž dat, takže ručně napsaný
   není — jen nevypadá jinak. Kdyby se lišta neodečetla, zkouška by
   padala na cizí práci a první, co by někdo udělal, je vypnout ji. */
const telo = html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<head>[\s\S]*?<\/head>/i, ' ')
  .replace(/<header[\s\S]*?<\/header>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<span[^>]*\sdata-pk-cislo="[a-z]+"[^>]*>[\s\S]*?<\/span>/g, ' ')
  .replace(/<[^>]+>/g, ' ');

const rucni = [...telo.matchAll(/\d{1,3}[  ]\d{3}(?![\d])/g)].map((m) => m[0]);
pravda('v textu není žádný ručně napsaný počet', rucni.length === 0,
  'našlo se: ' + rucni.join(', ') + ' — počty patří do <span data-pk-cislo>, '
    + 'ručně napsané číslo je pravda jen do nejbližšího běhu robota');

/* ---- 3. ŽÁDNÉ TVRZENÍ O NÁVŠTĚVNOSTI ------------------------------ */
/* Hledá se číslo v blízkosti slova o lidech na webu. Samotné slovo
   vadit nemusí („nebudeme předstírat, že sem chodí davy" je poctivá
   věta); vadí teprve číslo u něj, protože to je údaj, který nemáme
   čím doložit. */
/* HRANICE SLOVA SE TU NEPÍŠE JAKO \b A PÍSMENO NE JAKO \w.
   První podoba vzoru měla /\b(návštěv\w*|…)\b/ — jenže \b je hranice
   mezi \w a ne-\w, a české písmeno do \w nepatří: před „č" tedy
   hranice stojí vždycky (je to mrtvá podmínka) a „návštěvníků" by se
   za \w* nedotáhlo celé. Chytil to scripts/test-mrtva-hranice.mjs
   (§454) dřív, než to stihlo prolézt do CI. */
const okoliNavstev = [...telo.matchAll(
  /[^.!?]*(?<![\p{L}])(návštěv[\p{L}]*|uživatel[\p{L}]*|čtenář[\p{L}]*|lidí měsíčně)(?![\p{L}])[^.!?]*/giu)]
  .map((m) => m[0].trim())
  .filter((v) => /\d/.test(v));
pravda('a nikde se netvrdí číslo návštěvnosti', okoliNavstev.length === 0,
  'věta s číslem u návštěvnosti: ' + okoliNavstev.join(' | ')
    + ' — čítač návštěv žádné veřejné číslo nedává, takže to není čím doložit');

/* ---- 4. VEDE NA NI ODKAZ Z PATIČKY -------------------------------- */
const paticka = readFileSync(new URL('./paticka.mjs', import.meta.url), 'utf8');
pravda('a z patičky na ni vede odkaz', /href="inzerce\.html"/.test(paticka),
  'scripts/paticka.mjs na inzerce.html neodkazuje — realitka se na stránku nedostane '
    + 'a v mapě webu by stála osamoceně');

console.log(`\n${nalezene.length + 5 - chyb} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Stránka pro realitky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
