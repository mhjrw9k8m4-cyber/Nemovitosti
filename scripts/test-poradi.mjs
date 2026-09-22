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
import { readFileSync } from 'node:fs';
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
/* --- 4) Osm míst ve výpisu: dostane se tam i něco jiného? ------------
 *
 * Tohle je ta část, kterou otáčení uvnitř pásem NEUMĚLO a měření to
 * ukázalo: horní pásma mají dohromady 64 nabídek, výpis ukazuje osm —
 * takže těch osm míst obsadily napořád a zbylých 1 883 nabídek se nahoru
 * nedostalo ani za rok. Test proto počítá na SKUTEČNÝCH datech, kolik
 * různých nabídek se do výpisu za rok dostane. Na vymyšlených datech by
 * to neselhalo, protože tam pásma tak nerovnoměrná nejsou.
 */
{
  const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
  const VIDET = 8;
  const kl = (d) => [d.type, d.place, d.okres, d.parcel, d.price, d.area].join('|');
  // Skóre jen podle typu — stačí k tomu, aby pásma byla stejně nerovnoměrná
  // jako ve skutečnosti (dražby nahoře, inzeráty dole).
  const sk = (d) => Math.max(6, 9 + ({ drazba: 22, exekuce: 18, obec: 12, sale: 8, majitel: 10 }[d.type] || 0));
  const den1 = 20000;

  const vypis = (den, mist) => {
    const arr = DATA.slice();
    P.prostridej(arr, sk, kl, den, P.KROK_ZA_DEN, 0);
    if (mist) P.stridacka(arr, VIDET, mist, den, kl, 0, null);
    return arr.slice(0, VIDET);
  };

  const zaRok = (mist) => {
    const v = new Set();
    for (let den = 0; den < 365; den++) for (const d of vypis(den1 + den, mist)) v.add(kl(d));
    return v.size;
  };
  const bez = zaRok(0), se = zaRok(P.MIST_NA_STRIDACKU);
  pravda(`za rok se do výpisu dostane víc než čtvrtina nabídek (${se} z ${DATA.length})`,
    se > DATA.length * 0.25, `jen ${se} — se samotným otáčením pásem to bylo ${bez}`);
  pravda('a je to řádově víc, než uměla samotná pásma', se > bez * 5, `${se} × ${bez}`);

  // Nahoře pořád rozhoduje kvalita: první místa jsou seřazená podle pásem.
  let poruseno = 0;
  for (let den = 0; den < 30; den++) {
    const v = vypis(den1 + den, P.MIST_NA_STRIDACKU);
    const drzenych = VIDET - P.MIST_NA_STRIDACKU;
    for (let i = 1; i < drzenych; i++) if (P.pasmo(sk(v[i])) > P.pasmo(sk(v[i - 1]))) poruseno++;
  }
  pravda('na horních místech výpisu pořád rozhoduje kvalita', poruseno === 0, poruseno + ' porušení');

  /* Žádná nabídka se nesmí objevit dvakrát — a to v CELÉM seznamu, ne jen
     na osmi viditelných místech. Kdyby se vybraný kus nesmazal ze zbytku,
     nahoře by to nebylo poznat: objevil by se podruhé až o kus níž, kde se
     člověk doroluje. (Přesně tohle mi napoprvé test nechytil.) */
  let dvakrat = 0, zmenaDelky = 0;
  for (let den = 0; den < 60; den++) {
    const arr = DATA.slice();
    P.prostridej(arr, sk, kl, den1 + den, P.KROK_ZA_DEN, 0);
    P.stridacka(arr, VIDET, P.MIST_NA_STRIDACKU, den1 + den, kl, 0, null);
    if (arr.length !== DATA.length) zmenaDelky++;
    if (new Set(arr).size !== DATA.length) dvakrat++;
  }
  pravda('v celém seznamu není nic dvakrát a nic nechybí', dvakrat === 0, dvakrat + ' dní');
  pravda('seznam si drží délku', zmenaDelky === 0, zmenaDelky + ' dní');

  // Během dne se nepřeskládá (kdo obnoví stránku, vidí totéž).
  const a = vypis(den1, P.MIST_NA_STRIDACKU).map(kl);
  const b = vypis(den1, P.MIST_NA_STRIDACKU).map(kl);
  pravda('během dne se výpis nepřeskládá', a.join() === b.join());
  // A další den se střídačka posune.
  const c = vypis(den1 + 1, P.MIST_NA_STRIDACKU).map(kl);
  pravda('další den se střídačka posune', a.join() !== c.join());

  /* Co je po termínu, na střídačku nepatří — a musí to platit KAŽDÝ den.
     Jeden den nic nedokazuje: těch pár prošlých se do tří míst nemusí
     trefit náhodou. Proto sto dní a nemusí se to stát ani jednou. */
  const vhodne = (d) => d.place !== 'ProsleTest';
  /* Prošlé jsou tu běžné inzeráty (spodní pásmo) — nahoru se tedy můžou
     dostat JEDINĚ přes střídačku, a právě to se testuje. Dražba by tam
     vylezla po kvalitě a test by měřil něco jiného; prošlé dražby sráží
     dolů až js/main.js, ne střídačka. */
  const sProslymi = DATA.slice(0, 400).concat([...Array(100)].map((_, i) => ({
    type: 'sale', place: 'ProsleTest', okres: 'X', parcel: 'p' + i, price: 1, area: 1,
  })));
  let proslychNahore = 0, bezFiltruNahore = 0;
  for (let den = 0; den < 100; den++) {
    const a1 = sProslymi.slice();
    P.prostridej(a1, sk, kl, den1 + den, P.KROK_ZA_DEN, 0);
    P.stridacka(a1, VIDET, P.MIST_NA_STRIDACKU, den1 + den, kl, 0, vhodne);
    // Jen místa střídačky: na horní místa se prošlé můžou dostat kvalitou
    // (jsou to běžné inzeráty jako ostatní) a sráží je dolů až js/main.js.
    proslychNahore += a1.slice(VIDET - P.MIST_NA_STRIDACKU, VIDET).filter((d) => d.place === 'ProsleTest').length;
    const a2 = sProslymi.slice();
    P.prostridej(a2, sk, kl, den1 + den, P.KROK_ZA_DEN, 0);
    P.stridacka(a2, VIDET, P.MIST_NA_STRIDACKU, den1 + den, kl, 0, null);
    bezFiltruNahore += a2.slice(VIDET - P.MIST_NA_STRIDACKU, VIDET).filter((d) => d.place === 'ProsleTest').length;
  }
  pravda('co je po termínu, se na střídačku nedostane ani jednou za sto dní',
    proslychNahore === 0, proslychNahore + '×');
  pravda('a bez toho filtru by se to dělo (jinak ta kontrola nic nehlídá)',
    bezFiltruNahore > 0, 'ani bez filtru se nahoru nedostaly — kontrola nic nedokazuje');

  // Krátký výpis (po zafiltrování) se nesmí rozházet.
  const kratky = DATA.slice(0, 5);
  const kopie = kratky.slice();
  P.stridacka(kopie, VIDET, P.MIST_NA_STRIDACKU, den1, kl, 0, null);
  pravda('kratší výpis než obrazovka zůstane, jak byl', kopie.map(kl).join() === kratky.map(kl).join());
}

console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Pořadí: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
