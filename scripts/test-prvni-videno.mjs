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
import { prirazPrvniVideni, otiskNabidky, otiskNabidkyBezCeny, otiskOdkazu } from './fetch-opportunities.mjs';
import { opravData, otiskBezCeny, nejstarsiZHistorie } from './prvni-videno.mjs';
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

/* ---- 2b) ODKAZ JE SILNĚJŠÍ IDENTITA NEŽ OTISK ------------------
   Otisk stojí na okresu, obci a výměře — a to jsou pole, která si web
   sám občas přepočítá: zpřesní se geokódování a změní se okres, opraví
   se čtení adresy a změní se obec. Otisk se tím rozejde s minulým
   souborem a stará nabídka dostane dnešek, tedy se na stránce „Co je
   nového" objeví jako nová.

   Naměřeno průchodem celé gitové historie (112 verzí dat): 455 z 1 765
   nabídek s odkazem vypadalo mladších, než jsou — 26 %. Z toho 405
   bylo v datech od prvního dne (14. 9.), ale neslo 19. 9., tedy den,
   kdy se zpřesňoval okres podle skutečné hranice. */
{
  pravda('bez odkazu není co párovat', otiskOdkazu(N({})) === '', otiskOdkazu(N({})));
  pravda('s odkazem je identita jeho', otiskOdkazu(N({ url: 'https://x.invalid/a' })) === 'url|https://x.invalid/a',
    otiskOdkazu(N({ url: 'https://x.invalid/a' })));
  /* ZMĚNA KONCE ADRESY NESMÍ NIC ZNAMENAT. Bezrealitky u běžícího
     inzerátu doplní do adresy jméno obce. Naměřeno na celé gitové
     historii: stalo se to u 63 z 1 918 inzerátů. */
  const bezObce = 'https://www.bezrealitky.cz/nemovitosti-byty-domy/985306-nabidka-prodej-pozemku';
  const sObci = bezObce + '-luhacovice';
  pravda('doplněné jméno obce v adrese inzerát nezmění',
    otiskOdkazu(N({ url: bezObce })) === otiskOdkazu(N({ url: sObci })),
    `${otiskOdkazu(N({ url: bezObce }))} × ${otiskOdkazu(N({ url: sObci }))}`);
  pravda('a je to číslo inzerátu, ne celá adresa',
    otiskOdkazu(N({ url: sObci })) === 'br|985306', otiskOdkazu(N({ url: sObci })));
  pravda('jiný inzerát je jiná identita',
    otiskOdkazu(N({ url: bezObce.replace('985306', '985307') })) === 'br|985307',
    otiskOdkazu(N({ url: bezObce.replace('985306', '985307') })));
  pravda('Farmy.cz mají číslo v parametru',
    otiskOdkazu(N({ url: 'https://www.farmy.cz/nabidka_detail?nab=12345' })) === 'fa|12345',
    otiskOdkazu(N({ url: 'https://www.farmy.cz/nabidka_detail?nab=12345' })));
}
{
  const U = 'https://www.bezrealitky.cz/nemovitosti/975585';
  const stare = [N({ url: U, okres: 'Benešov', place: 'Bystřice', first_seen: '2026-09-14' })];
  /* Týž inzerát, ale web si mezitím zpřesnil okres i obec. */
  const nove = [N({ url: U, okres: 'Beroun', place: 'Zdice' })];
  const v = prirazPrvniVideni(nove, stare, '2026-10-10');
  pravda('zpřesněný okres a obec neberou nabídce věk',
    nove[0].first_seen === '2026-09-14', `dostala ${nove[0].first_seen}`);
  pravda('a je to vidět ve statistice jako „podle odkazu"',
    v.podleOdkazu === 1 && v.novych === 0, JSON.stringify(v));
}
{
  const bez = 'https://www.bezrealitky.cz/nemovitosti-byty-domy/985306-nabidka-prodej-pozemku';
  const stare = [N({ url: bez, first_seen: '2026-09-14' })];
  const nove = [N({ url: bez + '-luhacovice' })];     // zdroj doplnil obec do adresy
  const v = prirazPrvniVideni(nove, stare, '2026-10-10');
  pravda('doplněná obec v adrese nebere nabídce věk ani u robota',
    nove[0].first_seen === '2026-09-14' && v.podleOdkazu === 1, JSON.stringify(v));
}
{
  /* Jeden inzerát rozepsaný na dvě parcely — který je který, se
     poznat nedá, takže se datum nepřenáší. */
  const U = 'https://x.invalid/jeden';
  const stare = [N({ url: U, parcel: '1', first_seen: '2026-09-14' })];
  const nove = [N({ url: U, parcel: '1', area: 111 }), N({ url: U, parcel: '2', area: 222 })];
  const v = prirazPrvniVideni(nove, stare, '2026-10-10');
  pravda('dva pozemky pod jedním odkazem si datum nevezmou',
    nove.every((o) => o.first_seen === '2026-10-10') && v.podleOdkazu === 0,
    `dostaly ${nove.map((o) => o.first_seen).join(', ')}`);
}
{
  /* A totéž ze strany starých dat. */
  const U = 'https://x.invalid/dvakrat';
  const stare = [N({ url: U, parcel: '1', first_seen: '2026-09-14' }),
    N({ url: U, parcel: '2', first_seen: '2026-09-20' })];
  const nove = [N({ url: U, parcel: '9', area: 999 })];
  const v = prirazPrvniVideni(nove, stare, '2026-10-10');
  pravda('ani když ten odkaz měly dvě staré nabídky',
    nove[0].first_seen === '2026-10-10' && v.podleOdkazu === 0, JSON.stringify(v));
}
{
  /* Jedna stará nabídka smí darovat datum jen JEDNOU. Kdyby ne, dala
     by ho napřed podle odkazu a pak ještě podruhé v kole bez ceny —
     a druhá, úplně jiná nabídka by se tím tvářila stará. */
  const stare = [N({ url: 'https://x.invalid/a', price: 500000, first_seen: '2026-09-14' })];
  const nove = [N({ url: 'https://x.invalid/a', okres: 'Beroun' }),   // týž inzerát, jiný okres
    N({ price: 400000 })];                                           // jiná nabídka, zlevněná
  const v = prirazPrvniVideni(nove, stare, '2026-10-10');
  pravda('stará nabídka nedaruje svoje datum dvakrát',
    nove[0].first_seen === '2026-09-14' && nove[1].first_seen === '2026-10-10',
    `dostaly ${nove.map((o) => o.first_seen).join(', ')} (odkaz ${v.podleOdkazu}, cena ${v.poZmeneCeny})`);
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

/* ---- 3b) Dopočet z historie: odkaz má přednost před otiskem ------ */
{
  const verze = [
    JSON.stringify({ updated: '2026-09-14', opportunities: [
      { type: 'sale', okres: 'Benešov', place: 'Bystřice', parcel: '—', area: 5023, price: 500000,
        url: 'https://x.invalid/a' }] }),
    JSON.stringify({ updated: '2026-09-20', opportunities: [
      { type: 'sale', okres: 'Beroun', place: 'Zdice', parcel: '—', area: 5023, price: 450000,
        url: 'https://x.invalid/a' }] }),
    'tohle není JSON a nesmí nic shodit',
  ];
  const { nejdriv, podleOdkazu, precteno } = nejstarsiZHistorie(function* () { yield* verze; });
  pravda('rozbitá verze v historii dopočet neshodí', precteno === 2, `přečteno ${precteno}`);
  pravda('podle odkazu je nejstarší den ten první',
    podleOdkazu.get('url|https://x.invalid/a') === '2026-09-14',
    String(podleOdkazu.get('url|https://x.invalid/a')));
  /* Dnešní nabídka má datum z druhé verze — a z odkazu se dozví, že
     ji web viděl už týden předtím, jen pod jiným okresem. */
  const nab = [{ type: 'sale', okres: 'Beroun', place: 'Zdice', parcel: '—', area: 5023,
    price: 450000, url: 'https://x.invalid/a', first_seen: '2026-09-20' }];
  const zmeny = opravData(nab, nejdriv, podleOdkazu);
  pravda('a dopočet jí ten věk vrátí',
    zmeny.length === 1 && zmeny[0].ma === '2026-09-14' && zmeny[0].podle === 'odkaz',
    JSON.stringify(zmeny.map((z) => [z.bylo, z.ma, z.podle])));
  /* Kolize otisku se odkazem nepřebije: jiný inzerát téže výměry
     v témže katastru má svoje datum a cizí si nebere. */
  const kolize = [{ type: 'sale', okres: 'Beroun', place: 'Zdice', parcel: '—', area: 5023,
    price: 999000, url: 'https://x.invalid/jiny', first_seen: '2026-10-01' }];
  const zmenyK = opravData(kolize, nejdriv, podleOdkazu);
  pravda('a nabídka s jiným odkazem si cizí věk nevezme', zmenyK.length === 0,
    JSON.stringify(zmenyK.map((z) => [z.bylo, z.ma, z.podle])));
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
