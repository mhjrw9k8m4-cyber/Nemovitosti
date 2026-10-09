/* Test: popis od inzerenta — uklidí se a dojde až na stránku pozemku?
 *
 * Spuštění: node scripts/test-popisy.mjs
 *
 * PROČ TAHLE ZKOUŠKA JE. Dotaz na Bezrealitky stahoval popis inzerátu
 * odjakživa, ale používal se jen k uhodnutí druhu a sítí a pak se zahodil.
 * Na stránce pozemku tedy nestálo ani slovo od toho, kdo ho zná — jen
 * čísla a věty, které si web poskládal sám. U 1 787 z 2 018 nabídek
 * (devět z deseti) je ten text k dispozici.
 *
 * Hlídají se tři věci, každá na jiném místě řetězu:
 *   1. ÚKLID. Z cizího inzerátu se nesmí přenést telefon, e-mail ani
 *      odkaz. Vyhazují se CELÉ VĚTY, ve kterých kontakt byl — napoprvé
 *      jsem mazal jen ta slova a zbylo „Volejte   nebo pište na   Více na".
 *   2. ULOŽENÍ. Popisy nesmí skončit v opportunities.json: ten soubor čte
 *      úvodní stránka a megabajt navíc se platí časem na telefonu.
 *   3. DORUČENÍ. Generátor musí popis vepsat do stránky pozemku a stránka
 *      ho musí umět přečíst.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cistyPopis } from './fetch-opportunities.mjs';
import { stranka, klicNabidky } from './generate-parcel-pages.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---------- 1. úklid ---------- */
const VETA = 'Prodáme rovinatý pozemek 2 697 m² v obci Libochovice, v územním plánu orná půda.';
const sKontakty = `<p>${VETA}</p> Volejte 777 123 456 nebo pište na jan@novak.cz. Více na https://example.cz/inzerat`;
const uklizeny = cistyPopis(sKontakty);
pravda('popis se vůbec vrátí (jinak by další tvrzení platila o prázdnu)',
  uklizeny.length > 40, `vrátilo se ${uklizeny.length} znaků`);
pravda('a nese tu větu, kvůli které se sbírá', uklizeny.indexOf('rovinatý pozemek') !== -1, uklizeny);
pravda('telefon se nepřenese', !/\d{3}\s?\d{3}\s?\d{3}/.test(uklizeny), uklizeny);
pravda('e-mail se nepřenese', uklizeny.indexOf('@') === -1, uklizeny);
pravda('odkaz se nepřenese', !/https?:\/\/|www\./i.test(uklizeny), uklizeny);
/* Tohle je ta vada, kvůli které se mažou věty, ne slova. */
pravda('a nezůstane po nich věta bez obsahu („Volejte   nebo pište na")',
  uklizeny.indexOf('Volejte') === -1 && uklizeny.indexOf('pište') === -1, uklizeny);
pravda('dvě slova nejsou popis', cistyPopis('Pozemek na prodej.') === '', JSON.stringify(cistyPopis('Pozemek na prodej.')));
pravda('prázdný vstup nespadne', cistyPopis(null) === '' && cistyPopis(undefined) === '');
const dlouhy = cistyPopis(('Nabízíme ke koupi zemědělský pozemek o výměře 1,2 ha. '
  + 'Pozemek je přístupný po zpevněné cestě. Vhodné jako investice. ').repeat(8));
pravda('dlouhý text se zkrátí a končí větou, ne půlkou slova',
  dlouhy.length <= 470 && /[.…]$/.test(dlouhy), `${dlouhy.length} znaků, konec: ${JSON.stringify(dlouhy.slice(-24))}`);

/* ---------- 2. uložení ---------- */
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
const nabidky = data.opportunities || [];
pravda('data se načetla a nabídky v nich jsou', nabidky.length > 100, `${nabidky.length} nabídek`);
const sPopisem = nabidky.filter((o) => o.popis || o._popis || o.description);
pravda('popisy nejsou v opportunities.json (úvodní stránka je nepotřebuje)',
  sPopisem.length === 0, `${sPopisem.length} nabídek nese popis`);

/* ---------- 3. doručení ---------- */
const sablona = fs.readFileSync(path.join(ROOT, 'pozemek.html'), 'utf8');
const vzor = nabidky[0];
const POPISY = path.join(ROOT, 'data', 'popisy.json');
const bylo = fs.existsSync(POPISY) ? fs.readFileSync(POPISY, 'utf8') : null;
/* Generátor čte popisy při načtení modulu, takže se zkouší obojí stav
   přes stránku vyrobenou TEĎ a přes tu, která leží na disku. */
const h = stranka(sablona, vzor);
const maOstrov = /<script type="application\/json" id="pz-popis-data">/.test(h);
const popisProVzor = (() => {
  try { return JSON.parse(fs.readFileSync(POPISY, 'utf8'))[klicNabidky(vzor)]; } catch { return undefined; }
})();
pravda('stránka pozemku nese ostrůvek s popisem právě tehdy, když popis existuje',
  maOstrov === !!popisProVzor, `ostrůvek ${maOstrov}, popis v souboru ${!!popisProVzor}`);
if (popisProVzor) {
  /* Text v ostrůvku nesmí obsahovat holé „<" — jinak by lomená závorka
     z cizího inzerátu mohla ukončit skript. */
  const m = h.match(/<script type="application\/json" id="pz-popis-data">([\s\S]*?)<\/script>/);
  pravda('text v ostrůvku nenese holou lomenou závorku ani &',
    !!m && !/[<>&]/.test(m[1]), m ? m[1].slice(0, 80) : 'ostrůvek nenalezen');
  pravda('a dá se přečíst jako JSON', (() => { try { return typeof JSON.parse(m[1]) === 'string'; } catch { return false; } })());
}
const pz = fs.readFileSync(path.join(ROOT, 'js', 'pozemek.js'), 'utf8');
pravda('stránka ten ostrůvek opravdu čte', pz.indexOf("getElementById('pz-popis-data')") !== -1);
pravda('a vypisuje ho jinou funkcí než popis od majitele (stejné jméno by jednu z nich tiše smazalo)',
  pz.indexOf('function pzPopisInzerentaHtml') !== -1 && pz.indexOf('function pzPopisHtml') !== -1);
if (bylo === null && fs.existsSync(POPISY)) fs.unlinkSync(POPISY);

console.log('\nPopisy od inzerentů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Popisy: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
