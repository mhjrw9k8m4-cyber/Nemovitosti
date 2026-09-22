// Test: dostane se každá nabídka nahoru, nebo některé zapadnou?
//
// Spuštění: node scripts/test-poradi.mjs   (nepotřebuje prohlížeč ani síť)
//
// Pořadí ve výpisu bylo dané pevným skóre. Na prvních osmi místech tak
// stálo den za dnem těch samých osm pozemků a zbytek nabídky — devadesát
// devět procent — se nahoru nedostal nikdy. Kdo neprojde celý výpis (a to
// je většina lidí), o starší inzeráty nezavadil, i když mezi nimi byl ten,
// který hledal.
//
// js/poradi.js to řeší otáčením: kvalita rozhoduje o pásmu, uvnitř pásma
// má každá nabídka stálé místo a celé kolo se každý den posune o jednu
// obrazovku dál. Tenhle test hlídá tři věci, které si odporují a musí
// platit zároveň:
//   1. kvalita nesmí ustoupit střídání (dobrá nabídka nikdy pod špatnou),
//   2. během dne se nic nepřeskládá (kdo obnoví stránku, vidí totéž),
//   3. za měsíc se nahoru dostane každá nabídka (nic nezapadne).
import { createRequire } from 'node:module';
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const P = createRequire(import.meta.url)(path.join(ROOT, 'js', 'poradi.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const klic = (x) => x.k;
const skore = (x) => x.s;
const poradiKlicu = (list, den) => P.prostridej(list.slice(), skore, klic, den).map(klic);

/* --- 1) Kvalita rozhoduje ------------------------------------------- */
{
  // Dvě pásma: dobré nabídky (skóre 40) a slabé (skóre 10).
  const dobre = [...Array(12)].map((_, i) => ({ k: 'dobra' + i, s: 40 }));
  const slabe = [...Array(12)].map((_, i) => ({ k: 'slaba' + i, s: 10 }));
  let poruseno = 0;
  for (let den = 0; den < 40; den++) {
    const p = poradiKlicu(dobre.concat(slabe), 20000 + den);
    const prvniSlaba = p.findIndex((x) => x.startsWith('slaba'));
    const posledniDobra = p.reduce((m, x, i) => (x.startsWith('dobra') ? i : m), -1);
    if (prvniSlaba < posledniDobra) poruseno++;
  }
  pravda('slabá nabídka se nikdy nedostane nad dobrou', poruseno === 0,
    `ve ${poruseno} ze 40 dní předběhla slabší nabídka lepší — střídání nesmí přebít kvalitu`);
  pravda('a pásma se poznají podle skóre', P.pasmo(40) > P.pasmo(10));
}

/* --- 2) Během dne se nic nepřeskládá -------------------------------- */
{
  const list = [...Array(30)].map((_, i) => ({ k: 'p' + i, s: 30 }));
  const a = poradiKlicu(list, 20100).join();
  const b = poradiKlicu(list, 20100).join();
  pravda('stejný den = stejné pořadí', a === b,
    'po obnovení stránky by se výpis přeskládal a co člověk viděl, by nenašel');
  pravda('jiný den = jiné pořadí', a !== poradiKlicu(list, 20101).join(),
    'kdyby se pořadí neměnilo, nic se nevystřídá a starší nabídky zapadnou');
}

/* --- 3) Za měsíc se nahoru dostane každá ---------------------------- */
for (const pocet of [20, 200, 1000]) {
  const list = [...Array(pocet)].map((_, i) => ({ k: 'Obec' + i + '|parc' + i, s: 30 }));
  const VIDITELNYCH = 8;      // kolik nabídek výpis ukáže napoprvé
  const DNI = Math.ceil(pocet / VIDITELNYCH) + 2;
  const videno = new Set();
  for (let den = 0; den < DNI; den++) {
    poradiKlicu(list, 30000 + den).slice(0, VIDITELNYCH).forEach((k) => videno.add(k));
  }
  pravda(`${pocet} nabídek: za ${DNI} dní se nahoru dostane každá`, videno.size === pocet,
    `nahoře bylo jen ${videno.size} z ${pocet} — ${pocet - videno.size} nabídek zapadlo`);
}

/* --- 4) Otáčení nesmí záležet na pořadí, v jakém data přijdou -------- */
{
  const list = [...Array(40)].map((_, i) => ({ k: 'p' + i, s: 30 }));
  const obracene = list.slice().reverse();
  pravda('na pořadí vstupních dat nezáleží',
    poradiKlicu(list, 20200).join() === poradiKlicu(obracene, 20200).join(),
    'robot pokaždé vrátí data v jiném pořadí; výpis se tím nesmí měnit');
}

/* --- 5) Den se počítá z datumu, ne z hodin -------------------------- */
{
  const rano = P.denIndex(new Date(2026, 8, 22, 6, 30));
  const vecer = P.denIndex(new Date(2026, 8, 22, 23, 59));
  const zitra = P.denIndex(new Date(2026, 8, 23, 0, 1));
  pravda('ráno a večer je tentýž den', rano === vecer,
    'jinak by se výpis přeskládal uprostřed dne');
  pravda('a po půlnoci je den další', zitra === rano + 1);
}

console.log('\nPořadí nabídek — nic nezapadne, ale kvalita rozhoduje');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Pořadí: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
