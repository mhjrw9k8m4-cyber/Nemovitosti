/* Test: „Na co mám?" — počty na stránce musí sedět na skutečné nabídky.
   ====================================================================
   Spuštění: node scripts/test-rozpocet.mjs   (bez prohlížeče)

   Stránka tvrdí větu typu „do 1 500 000 Kč se vejde 120 nabídek ve 45
   okresech". Je to tvrzení o datech, ne odhad, takže se dá přepočítat —
   a musí se, protože mezi daty a stránkou stojí tenký řez
   (data/rozpocet.json), ve kterém je snadné něco tiše ztratit:
   nabídku, okres, nebo celý druh.

   Přepočítává se tedy ZE ZDROJE, tedy z data/opportunities.json
   a z téhož cenového modelu, jaký řez skládá. Kdyby zkouška věřila
   řezu, hlídala by jeho vlastní kopii pravidel.
   ==================================================================== */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slozRez, skupinaDruhu, DRUHY } from './generate-rozpocet.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require2 = createRequire(import.meta.url);
const LOG = require2(path.join(KOREN, 'js', 'rozpocet.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const rez = JSON.parse(readFileSync(path.join(KOREN, 'data', 'rozpocet.json'), 'utf8'));

/* ---- 1) řez vznikl a má tvar, na který stránka spoléhá ---------- */
pravda(`řez nese nabídky (${rez.n.length})`, rez.n.length >= 500, String(rez.n.length));
pravda(`a okresy (${rez.okresy.length})`, rez.okresy.length >= 50, String(rez.okresy.length));
pravda('ke každému okresu je jméno i místo na odkaz',
  rez.soubory && rez.soubory.length === rez.okresy.length,
  `okresů ${rez.okresy.length}, odkazů ${rez.soubory ? rez.soubory.length : 0}`);
pravda('druhy jsou tytéž, jaké zná generátor', JSON.stringify(rez.druhy) === JSON.stringify(DRUHY),
  JSON.stringify(rez.druhy));
pravda('každý řádek má čtyři čísla a nic víc',
  rez.n.every((r) => Array.isArray(r) && r.length === 4 && r.every((x) => typeof x === 'number')),
  'tvar řádku se rozešel se stránkou');
pravda('žádný řádek neukazuje na neexistující okres nebo druh',
  rez.n.every((r) => r[0] >= 0 && r[0] < rez.okresy.length && r[1] >= 0 && r[1] < rez.druhy.length));
pravda('a nenese nulové ceny ani výměry',
  rez.n.every((r) => r[2] > 0 && r[3] > 0));

/* ---- 2) ŘEZ SEDÍ NA ZDROJ ------------------------------------- */
{
  const PKH = require2(path.join(KOREN, 'js', 'hlidani-logika.js'));
  const syrova = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities;
  const nabidky = PKH.bezDuplicit(syrova);
  new Function(readFileSync(path.join(KOREN, 'js', 'ceny.js'), 'utf8'))();
  const CENY = globalThis.PK_CENY;
  const MODEL = CENY.postav(nabidky);
  const jePochybna = (o) => {
    if (MODEL.neduveryhodna && MODEL.neduveryhodna(o)) return true;
    const od = MODEL.odhad && MODEL.odhad(o);
    return !!(od && od.pochybna);
  };
  const znovu = slozRez(nabidky, { jePochybna });
  pravda('přepočet ze zdroje dá týž počet nabídek', znovu.n.length === rez.n.length,
    `ze zdroje ${znovu.n.length}, v řezu ${rez.n.length} — řez je starý nebo se ztratila nabídka`);
  pravda('a tytéž okresy', JSON.stringify(znovu.okresy) === JSON.stringify(rez.okresy),
    'seznam okresů se rozešel');

  /* CO SE DO ŘEZU NESMÍ DOSTAT — a je potřeba vědět, že těch případů
     v datech vůbec něco je, jinak kontrola hlídá prázdno. */
  let drazeb = 0, podilu = 0, pochybnych = 0;
  for (const o of nabidky) {
    if (o.type !== 'sale') drazeb++;
    else if (o.podil) podilu++;
    else if (o.price > 0 && o.area > 0 && o.okres && jePochybna(o)) pochybnych++;
  }
  pravda(`v datech jsou dražby (${drazeb}), podíly (${podilu}) i pochybné ceny (${pochybnych})`,
    drazeb >= 50 && podilu >= 100 && pochybnych >= 50,
    'bez nich by kontroly níž neměly co hlídat');
  const vyloucene = new Set();
  for (const o of nabidky) {
    if (o.type !== 'sale' || o.podil || (o.price > 0 && o.area > 0 && o.okres && jePochybna(o))) {
      if (o.price > 0 && o.area > 0) vyloucene.add(Math.round(o.price) + '|' + Math.round(o.area));
    }
  }
  const zustaly = new Set();
  for (const o of nabidky) {
    if (o.type === 'sale' && !o.podil && o.price > 0 && o.area > 0 && o.okres && !jePochybna(o)) {
      zustaly.add(Math.round(o.price) + '|' + Math.round(o.area));
    }
  }
  /* Dvojice cena|výměra se může shodou okolností opakovat; za nález se
     bere jen to, co v povolené hromádce NENÍ vůbec. */
  const proniklo = rez.n.filter((r) => !zustaly.has(r[2] + '|' + r[3]) && vyloucene.has(r[2] + '|' + r[3]));
  pravda('do řezu nepronikla dražba, podíl ani cena, které web nevěří',
    proniklo.length === 0, `${proniklo.length} takových řádků`);
}

/* ---- 3) VĚTA NA STRÁNCE SE DÁ PŘEPOČÍTAT ---------------------- */
{
  const z = { rozpocet: 1500000, odVymery: 500, doVymery: 2000, druh: null };
  const vybrane = LOG.vyber(rez, z);
  const del = LOG.podleRozpoctu(vybrane, z.rozpocet);
  const okresy = LOG.poOkresech(rez, del.do);

  /* Hrubou silou zvlášť, bez funkcí stránky: kdyby obě strany počítaly
     týmž kódem, hlídalo by se, že se kód rovná sám sobě. */
  const rucne = rez.n.filter((r) => r[3] >= 500 && r[3] <= 2000 && r[2] <= 1500000);
  pravda(`výběr sedí na ruční přepočet (${del.do.length})`, del.do.length === rucne.length,
    `stránka ${del.do.length}, ruční ${rucne.length}`);
  pravda('počet okresů sedí', okresy.length === new Set(rucne.map((r) => r[0])).size,
    `stránka ${okresy.length}`);
  pravda('součet po okresech dá zpátky celek',
    okresy.reduce((s, x) => s + x.pocet, 0) === del.do.length);
  pravda('žádný okres nehlásí nejlevnější cenu nad rozpočtem',
    okresy.every((x) => x.nejlevnejsi <= z.rozpocet),
    JSON.stringify(okresy.filter((x) => x.nejlevnejsi > z.rozpocet).slice(0, 3)));
  pravda('seznam je seřazený od okresu s největším výběrem',
    okresy.every((x, i) => i === 0 || okresy[i - 1].pocet >= x.pocet),
    JSON.stringify(okresy.map((x) => x.pocet).slice(0, 8)));

  /* Filtr výměry musí opravdu filtrovat. */
  const bezVymery = LOG.podleRozpoctu(LOG.vyber(rez, { rozpocet: 1500000, odVymery: null, doVymery: null, druh: null }), 1500000);
  pravda('bez omezení výměry jich projde víc', bezVymery.do.length > del.do.length,
    `${bezVymery.do.length} vs. ${del.do.length}`);
  /* A druh taky. */
  const jenStavebni = LOG.podleRozpoctu(LOG.vyber(rez, { rozpocet: 1500000, odVymery: null, doVymery: null, druh: 0 }), 1500000);
  pravda('omezení na jeden druh jich pustí míň', jenStavebni.do.length < bezVymery.do.length,
    `${jenStavebni.do.length} vs. ${bezVymery.do.length}`);
  pravda('a všechny opravdu toho druhu jsou',
    LOG.vyber(rez, { rozpocet: null, odVymery: null, doVymery: null, druh: 0 }).every((r) => r[1] === 0));
}

/* ---- 4) čeština ------------------------------------------------ */
pravda('tvary „nabídka / nabídky / nabídek" sedí',
  LOG.tvarNabidka(1) === 'nabídka' && LOG.tvarNabidka(3) === 'nabídky'
  && LOG.tvarNabidka(5) === 'nabídek' && LOG.tvarNabidka(0) === 'nabídek',
  [1, 3, 5, 0].map((n) => n + ' ' + LOG.tvarNabidka(n)).join(', '));

/* ---- 5) zařazení druhu ------------------------------------------ */
pravda('druh se zařadí podle názvu z dat',
  skupinaDruhu('stavební pozemek') === 0 && skupinaDruhu('orná půda') === 1
  && skupinaDruhu('lesní pozemek') === 2 && skupinaDruhu('zahrada') === 3
  && skupinaDruhu('ostatní plocha') === 4,
  [0, 1, 2, 3, 4].map((i) => DRUHY[i]).join(', '));

console.log('\nNa co mám? — rozpočet proti skutečným nabídkám');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Na co mám?: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
