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

console.log('Dražby z otevřených dat CEVD');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Dražby z CEVD: kontroly neprošly.');
process.exit(chyb ? 1 : 0);
