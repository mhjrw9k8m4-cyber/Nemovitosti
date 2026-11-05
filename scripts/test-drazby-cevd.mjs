/* Test: dražby z otevřených dat CEVD mají výměru CELÉ položky.
   ==================================================================
   Spuštění: node scripts/test-drazby-cevd.mjs   (bez prohlížeče i sítě)

   Nahlášeno z webu: „stejná dražba má dvě různé výměry, a tím i
   nesmyslnou cenu za metr".

   PŘÍČINA. Jedna dražební položka (jeden celek s vlastní vyvolávací
   cenou) může obsahovat víc parcel. Parser z ní bral výměru JEDNÉ z nich
   a spároval ji s cenou za CELOU položku — cena za metr pak vyšla
   tolikrát vyšší, kolikrát byl celek větší než ta jedna parcela.

   Změřeno na ostrých datech: dražby, které web znal jen z tohohle
   zdroje, měly medián 2 276 Kč/m², kdežto dražby ze stahování
   okdrazby.cz 82 Kč/m² — osmadvacetkrát míň. Nahoře seznamu stála
   „orná půda v Brně, 721 m² za 15 300 000 Kč", tedy 21 221 Kč/m².
   Taková orná půda není; ta cena patřila celé dražbě.

   PROČ TENHLE TEST VŮBEC JDE NAPSAT: parsování je vytažené ze stahování
   do samostatné funkce (nabidkyZDrazby), takže se mu dá záznam podat
   přímo a nic se nestahuje. Dokud bylo uvnitř fetchDrazby(), nešlo ho
   vyzkoušet jinak než pustit celé stahování — a to se v CI nedělá.
   ================================================================== */
import { readFileSync } from 'node:fs';
import { nabidkyZDrazby } from './fetch-opportunities.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

const ku = { okres: 'Brno-město', obec: 'Brno' };
const parcela = (vymera, cislo, druh) => ({
  nazev: 'pozemek', vecNemovita: { pozemek: { vymera, parcelniCislo: cislo, druhPozemku: druh || 'orná půda' }, katastralniUzemi: ku },
});
const zaznam = (veci, cena, nucena) => ({
  zakladniInformace: {
    typDrazby: nucena === false ? 'Dobrovolná' : 'Nucená',
    konaniDrazby: { zacatek: '2026-11-11T10:00', url: 'https://okdrazby.cz/drazba/99999' },
  },
  predmetyDrazby: [{ stavPredmetu: 'Uveřejněno', vyvolavaciCena: { castka: { vyse: cena } }, veci }],
});

/* --- Víc parcel v jedné položce --- */
{
  const v = nabidkyZDrazby(zaznam([parcela(721, '4701/4'), parcela(5400, '4701/5')], 1500000));
  je('z jedné položky vznikne jedna nabídka', v.length, 1);
  je('a její výměra je SOUČET parcel, ne jedna z nich', v[0].area, 6121);
  je('cena zůstává cena celé položky', v[0].price, 1500000);
  /* Tohle je ta vada, kvůli které to vzniklo: s jednou parcelou by
     vyšlo 2 080 Kč/m² místo 245. */
  je('a cena za metr tím vychází z celku', Math.round(v[0].price / v[0].area), 245);
  /* Parcelní číslo u víc parcel NEDÁVÁ SMYSL: tvrdilo by, že ta jedna
     parcela má výměru všech dohromady. */
  je('u víc parcel se parcelní číslo neuvádí', v[0].parcel, '—');
}

/* --- Jedna parcela: číslo se uvést má --- */
{
  const v = nabidkyZDrazby(zaznam([parcela(900, '123/4')], 450000));
  je('u jedné parcely zůstane výměra její', v[0].area, 900);
  je('a parcelní číslo se uvede', v[0].parcel, '123/4');
}

/* --- Parcela bez výměry nesmí součet pokazit --- */
{
  const v = nabidkyZDrazby(zaznam([parcela(300, '1'), parcela(null, '2'), parcela(200, '3')], 100000));
  je('parcely bez výměry se do součtu nepočítají', v[0].area, 500);
  je('ale pořád jsou to tři parcely, takže číslo se neuvádí', v[0].parcel, '—');
}

/* --- Víc položek = víc nabídek, každá se svou cenou --- */
{
  const rec = zaznam([parcela(100, '1')], 50000);
  rec.predmetyDrazby.push({
    stavPredmetu: 'Uveřejněno', vyvolavaciCena: { castka: { vyse: 80000 } },
    veci: [parcela(200, '2')],
  });
  const v = nabidkyZDrazby(rec);
  je('dvě položky dají dvě nabídky', v.length, 2);
  je('a cena se mezi ně neopakuje', [v[0].price, v[1].price], [50000, 80000]);
  je('ani výměra', [v[0].area, v[1].area], [100, 200]);
}

/* --- Neaktivní položka se přeskočí --- */
{
  const rec = zaznam([parcela(100, '1')], 50000);
  rec.predmetyDrazby[0].stavPredmetu = 'Zrušeno';
  je('zrušená položka se nenabízí', nabidkyZDrazby(rec).length, 0);
}

/* --- Nucená je exekuce, dobrovolná dražba --- */
{
  je('nucená dražba je kategorie exekuce', nabidkyZDrazby(zaznam([parcela(100, '1')], 1000))[0].type, 'exekuce');
  je('dobrovolná je dražba', nabidkyZDrazby(zaznam([parcela(100, '1')], 1000, false))[0].type, 'drazba');
}

/* --- Bez ceny se nenabízí nic --- */
{
  je('položka bez vyvolávací ceny se nenabízí', nabidkyZDrazby(zaznam([parcela(100, '1')], 0)).length, 0);
}

/* --- Prázdný a nesmyslný vstup nesmí shodit stahování --- */
{
  je('prázdný záznam nic nevrátí', nabidkyZDrazby({}).length, 0);
  je('ani nic nedává nic', nabidkyZDrazby(null).length, 0);
  je('položka bez věcí nic nevrátí', nabidkyZDrazby(zaznam([], 1000)).length, 0);
}

/* --- ZAHOZENÉ SE POČÍTAJÍ, A KAŽDÉ NA SVŮJ ÚČET ------------------
   Nalezeno měřením 4. 11.: zdroj přinesl 45 nabídek proti mediánu 81
   a hlídač poradil „podívejte se, jestli parser nepřestal část
   stránky čist". Podívat se ale nebylo kam: `preskoceno` počítá jen
   nabídky, na kterých čtení SPADLO, kdežto položky zahozené schválně
   (nezveřejněná dražba, bez obce, bez ceny, bez výměry) se
   nepočítaly nikde. Bez těch čísel nejde odpovědět na jedinou
   otázku, která tam je: je úbytek v datech, nebo v nás? */
{
  const polozka = (zmeny) => ({
    stavPredmetu: 'Uveřejněno', vyvolavaciCena: { castka: { vyse: 1000000 } },
    veci: [parcela(500, '1')], ...zmeny,
  });
  const rec = (polozky, nucena) => ({
    zakladniInformace: {
      typDrazby: nucena === false ? 'Dobrovolná' : 'Nucená',
      konaniDrazby: { zacatek: '2026-11-11T10:00', url: 'https://okdrazby.cz/drazba/9' },
    },
    predmetyDrazby: polozky,
  });
  const z = {};
  nabidkyZDrazby(rec([polozka()]), z);
  je('dobrá položka se započítá jako dražba i jako předmět', [z.drazeb, z.polozek], [1, 1]);
  pravda('a nic se u ní nezahodí',
    !z.neuverejneno && !z.bezMista && !z.bezCeny && !z.bezVymery, JSON.stringify(z));

  const z2 = {};
  nabidkyZDrazby(rec([polozka({ stavPredmetu: 'Ukončeno' })]), z2);
  je('ukončená dražba se započítá jako „neuverejneno"', z2.neuverejneno, 1);

  const z3 = {};
  nabidkyZDrazby(rec([polozka({ vyvolavaciCena: null })]), z3);
  je('položka bez ceny se započítá jako „bezCeny"', z3.bezCeny, 1);

  const z4 = {};
  nabidkyZDrazby(rec([polozka({
    veci: [{ nazev: 'pozemek', vecNemovita: { pozemek: { vymera: 500, parcelniCislo: '1' }, katastralniUzemi: {} } }],
  })]), z4);
  je('položka bez obce a okresu se započítá jako „bezMista"', z4.bezMista, 1);

  /* Dobrovolná dražba bez výměry se zahazuje, nucená ne — a počítadlo
     to musí rozlišit, jinak by se u exekucí hlásila ztráta, která se
     nestala. */
  const z5 = {};
  nabidkyZDrazby(rec([polozka({
    veci: [{ nazev: 'pozemek', vecNemovita: { pozemek: { parcelniCislo: '1' }, katastralniUzemi: ku } }],
  })], false), z5);
  je('dobrovolná bez výměry se započítá jako „bezVymery"', z5.bezVymery, 1);
  const z6 = {};
  const nuc = nabidkyZDrazby(rec([polozka({
    veci: [{ nazev: 'pozemek', vecNemovita: { pozemek: { parcelniCislo: '1' }, katastralniUzemi: ku } }],
  })], true), z6);
  pravda('u nucené dražby bez výměry se nezahazuje a nic se nepočítá',
    nuc.length === 1 && !z6.bezVymery, JSON.stringify({ n: nuc.length, z: z6 }));

  /* BUDOVY SE UŽ NEZAHAZUJÍ. Dřív tady stálo, že dobrovolná dražba
     pozemku SE STAVBOU se zahodí (`z7.jenBudovaVDobrovolne === 1`), a
     pro web jen o pozemcích to bylo správně. Od 5. 11. nese web všechny
     nemovitosti, takže se taková dražba vzít MUSÍ. */
  const z7 = {};
  const seStavbou = nabidkyZDrazby(rec([polozka({
    veci: [{ nazev: 'pozemek', vecNemovita: { pozemek: { vymera: 300, parcelniCislo: '1' }, stavba: { typStavby: 'rodinný dům' }, katastralniUzemi: ku } }],
  })], false), z7);
  je('dobrovolná dražba pozemku se stavbou se vezme', seStavbou.length, 1);
  je('a nic se nezahodí', z7.jenBudovaVDobrovolne, undefined);
  je('druh přizná stavbu', seStavbou[0] && seStavbou[0].druh, 'pozemek se stavbou');

  /* BYT V EXEKUCI NEMÁ POZEMEK VŮBEC — změřeno 5. 11. na
     `drazby_2026.json`: jednotka nese `zpusobVyuzitiJednotky` a vnořenou
     stavbu, ale žádný uzel `pozemek`. Dřív to byla podmínka, která
     takovou věc vyhodila na prvním řádku; teď musí projít, a hlavně se
     u ní nesmí nikde sáhnout na `vn.pozemek` — spadlo by celé stahování
     dražeb na prvním bytě. */
  const z8 = {};
  const byty = nabidkyZDrazby(rec([polozka({
    veci: [{ nazev: 'jednotka č. 173/11', vecNemovita: {
      jednotka: { cisloJednotky: '173/11', zpusobVyuzitiJednotky: 'byt',
        stavba: { typStavby: 'budova s číslem popisným' } },
      katastralniUzemi: ku } }],
  })], true), z8);
  je('byt bez pozemku se vezme', byty.length, 1);
  je('a je to byt', byty[0] && byty[0].kat, 'byt');
  je('parcelní číslo se nevymýšlí', byty[0] && byty[0].parcel, '—');
  je('druh u bytu není „pozemek"', byty[0] && byty[0].druh, 'byt');

  /* SAMOSTATNÁ STAVBA: kategorie se bere z `typStavby`, který zdroj
     říká přesněji než volný text. „Budova s číslem popisným" ale neříká
     nic — a tam je poctivá odpověď „jiná nemovitost", ne pozemek. */
  const z9 = {};
  const domy = nabidkyZDrazby(rec([polozka({
    veci: [{ nazev: 'stavba', vecNemovita: {
      stavba: { typStavby: 'rodinný dům' }, katastralniUzemi: ku } }],
  })], true), z9);
  je('samostatný rodinný dům je dům', domy[0] && domy[0].kat, 'dum');
  const z10 = {};
  const neurcito = nabidkyZDrazby(rec([polozka({
    veci: [{ nazev: 'stavba', vecNemovita: {
      stavba: { typStavby: 'budova s číslem popisným' }, katastralniUzemi: ku } }],
  })], true), z10);
  je('neurčitá budova je „jiná nemovitost", ne pozemek',
    neurcito[0] && neurcito[0].kat, 'jine');

  /* A VĚC, KTERÁ NENÍ ANI POZEMEK, ANI STAVBA, ANI JEDNOTKA, se
     nebere — a počítá se pod vlastním jménem, ať je v logu vidět. */
  const z11 = {};
  const nic = nabidkyZDrazby(rec([polozka({
    veci: [{ nazev: 'něco jiného', vecNemovita: { katastralniUzemi: ku } }],
  })], true), z11);
  je('věc bez nemovitosti se nebere', nic.length, 0);
  je('a má vlastní účet', z11.bezNemovitosti, 1);

  /* A počítadlo je NEPOVINNÉ: bez něj čtečka nesmí spadnout. */
  pravda('čtečka jde pozvat i bez počítadla', nabidkyZDrazby(rec([polozka()])).length === 1);

  /* Čísla se musí dostat do logu, jinak je nikdo neuvidí. */
  const kod = readFileSync(new URL('./fetch-opportunities.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const telo = (kod.match(/async function fetchDrazby\(\)[\s\S]*?\n}/) || [''])[0];
  pravda('a stahování je vypíše do logu běhu',
    /nabidkyZDrazby\(rec, zahozeno\)/.test(telo) && /zahozeno —/.test(telo)
    && /console\.error/.test(telo), telo.slice(0, 200));
  pravda('a chybnou odpověď serveru taky neprojde mlčením',
    /HTTP \$\{r\.status\}/.test(telo) && /nešlo přečíst/.test(telo), telo.slice(0, 200));
}

console.log('Dražby z otevřených dat CEVD');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Dražby z CEVD: kontroly neprošly.');
process.exit(chyb ? 1 : 0);
