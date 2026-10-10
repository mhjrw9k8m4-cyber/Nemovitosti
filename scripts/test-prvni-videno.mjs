/* Test: změna ceny nesmí nabídce sebrat věk.
   ==================================================================
   Spuštění: node scripts/test-prvni-videno.mjs   (bez prohlížeče)

   `first_seen` říká, kdy robot nabídku poprvé uviděl. Přenáší se
   z minulého souboru podle otisku — a ten otisk nesl i CENU. Jakmile
   tedy prodejce zlevnil, nabídka se nenašla a dostala dnešek.

   Naměřeno na ostrých datech: všech 25 nabídek se zaznamenanou změnou
   ceny mělo first_seen přesně ten den, kdy se cena změnila. Na stránce
   „Co je nového" z toho bylo 14 pozemků zároveň v „Nově přidané"
   i v „Zlevněné" — protimluv, protože nově přidaná nabídka nemá co
   zlevnit. Po opravě jsou to dva, a oba oprávněně: u jednoho zdroj
   uvedl předchozí cenu hned při prvním spatření.

   Hlídají se tři věci: že se datum po zlevnění přenese, že se
   NEPŘENESE tam, kde je shoda nejednoznačná (jinak by si dvě různé
   nabídky téže výměry vyměnily věk), a že dopočet z historie nikdy
   neposune datum dopředu.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prirazPrvniVideni, otiskNabidky, otiskNabidkyBezCeny } from './fetch-opportunities.mjs';
import { opravData, otiskBezCeny } from './prvni-videno.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const N = (zmeny) => Object.assign({ type: 'sale', okres: 'Benešov', place: 'Bystřice', parcel: '546/1', area: 5023, price: 500000 }, zmeny);

/* ---- 1) Otisky -------------------------------------------------- */
pravda('otisk s cenou se po zlevnění změní',
  otiskNabidky(N({})) !== otiskNabidky(N({ price: 400000 })),
  'to je ten důvod, proč je potřeba druhé kolo');
pravda('a otisk bez ceny zůstane týž',
  otiskNabidkyBezCeny(N({})) === otiskNabidkyBezCeny(N({ price: 400000 })),
  'bez toho by druhé kolo nespárovalo nic');
for (const [co, jina] of [['výměra', { area: 4000 }], ['parcela', { parcel: '99/9' }],
  ['obec', { place: 'Postupice' }], ['okres', { okres: 'Beroun' }], ['typ', { type: 'drazba' }]]) {
  pravda(`jiný údaj „${co}" dá jiný otisk i bez ceny`,
    otiskNabidkyBezCeny(N({})) !== otiskNabidkyBezCeny(N(jina)),
    'otisk bez ceny by sléval různé nabídky');
}
pravda('a diakritika v názvu otisk nerozhodí',
  otiskNabidkyBezCeny(N({ place: 'Bystřice' })) === otiskNabidkyBezCeny(N({ place: 'BYSTRICE' })),
  'zdroje píšou jména různě');

/* ---- 2) Přiřazení data ------------------------------------------ */
{
  const stare = [N({ first_seen: '2026-09-14' })];
  const nove = [N({ price: 400000 })];                       // prodejce zlevnil
  const v = prirazPrvniVideni(nove, stare, '2026-10-10');
  pravda('zlevněná nabídka si věk ponechá',
    nove[0].first_seen === '2026-09-14', `dostala ${nove[0].first_seen}`);
  pravda('a počítá se jako „zachráněná", ne jako nová',
    v.poZmeneCeny === 1 && v.novych === 0, JSON.stringify(v));
}
{
  const stare = [N({ first_seen: '2026-09-14' })];
  const nove = [N({})];
  const v = prirazPrvniVideni(nove, stare, '2026-10-10');
  pravda('nezměněná nabídka se spáruje už v prvním kole',
    nove[0].first_seen === '2026-09-14' && v.poZmeneCeny === 0, JSON.stringify(v));
}
{
  const nove = [N({ place: 'Úplně nová' })];
  const v = prirazPrvniVideni(nove, [], '2026-10-10');
  pravda('opravdu nová nabídka dostane dnešek',
    nove[0].first_seen === '2026-10-10' && v.novych === 1, JSON.stringify(v));
}
/* NEJEDNOZNAČNÁ SHODA SE PŘESKAKUJE. Dvě nabídky téže výměry ve stejném
   katastru bez parcelního čísla se od sebe liší jen cenou — a tam se
   datum přenášet nesmí, protože nevíme která je která. */
{
  const stare = [N({ parcel: '—', price: 100000, first_seen: '2026-09-14' }),
    N({ parcel: '—', price: 200000, first_seen: '2026-09-20' })];
  const nove = [N({ parcel: '—', price: 110000 }), N({ parcel: '—', price: 210000 })];
  const v = prirazPrvniVideni(nove, stare, '2026-10-10');
  pravda('u dvojznačné shody se datum NEPŘENESE',
    nove.every((o) => o.first_seen === '2026-10-10') && v.poZmeneCeny === 0,
    `dostaly ${nove.map((o) => o.first_seen).join(', ')}`);
}
{
  /* Zato jednoznačná shoda vedle nezměněné nabídky projít musí. */
  const stare = [N({ parcel: '1', price: 100000, first_seen: '2026-09-14' }),
    N({ parcel: '2', price: 200000, first_seen: '2026-09-20' })];
  const nove = [N({ parcel: '1', price: 100000 }), N({ parcel: '2', price: 150000 })];
  prirazPrvniVideni(nove, stare, '2026-10-10');
  pravda('a jednoznačná shoda vedle nezměněné nabídky projde',
    nove[0].first_seen === '2026-09-14' && nove[1].first_seen === '2026-09-20',
    `dostaly ${nove.map((o) => o.first_seen).join(', ')}`);
}

/* ---- 3) Dopočet z historie nikdy neposune datum dopředu ---------- */
{
  const nab = [N({ first_seen: '2026-09-14' }), N({ parcel: '7', first_seen: '2026-10-01' })];
  const nejdriv = new Map([[otiskBezCeny(nab[0]), '2026-09-20'], [otiskBezCeny(nab[1]), '2026-09-15']]);
  const zmeny = opravData(nab, nejdriv);
  pravda('dopočet posune jen dozadu, nikdy dopředu',
    zmeny.length === 1 && zmeny[0].ma === '2026-09-15',
    zmeny.map((z) => `${z.bylo} → ${z.ma}`).join(', '));
}

/* ---- 4) A jak to dopadlo na ostrých datech ----------------------- */
{
  const vse = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
  const zmeny = vse.filter((o) => o.cena_zmena);
  pravda(`v datech jsou nabídky se změnou ceny (${zmeny.length})`, zmeny.length >= 5,
    'bez nich tahle kontrola neměří nic');
  const resetovane = zmeny.filter((o) => String(o.cena_zmena).slice(0, 10) === o.first_seen);
  pravda(`a skoro žádná nemá first_seen v den změny (${resetovane.length} z ${zmeny.length}, dřív 25 z 25)`,
    resetovane.length <= Math.max(2, Math.round(zmeny.length * 0.12)),
    resetovane.slice(0, 5).map((o) => `${o.place} ${o.area} m²: ${o.first_seen} = ${o.cena_zmena}`).join(' | '));
}

console.log('\nPrvní vidění nabídky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::První vidění nabídky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
