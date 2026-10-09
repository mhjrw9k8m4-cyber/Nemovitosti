// Test: jako místo nabídky nesmí stát název ulice.
//
// Spuštění: node scripts/test-misto-inzeratu.mjs   (nepotřebuje prohlížeč ani síť)
//
// Adresa z API Bezrealitky mívá tvar „Obec - katastrální území" a brala se
// z ní první část. U inzerátů z města je ale první část ULICE, a na webu
// pak jako místo stálo „Františka Macháčka", „Ruská" nebo „Za Krétou".
// Z 1 637 nabídek z Bezrealitky je takových devět a jsou mezi nimi tři
// z nejdražších nabídek na celém webu.
//
// Proč zkouška, a ne jen oprava: API Bezrealitky je z prostředí, kde se
// tahle oprava psala, nedostupné (proxy vrací 403), takže na ostrých
// datech ji vyzkoušet nešlo. Jediný způsob je dát funkci adresu přímo —
// přesně tak, jak to v tomhle repozitáři dopadlo u parsování dražeb
// (viz nabidkyZDrazby a scripts/test-drazby-cevd.mjs).
import { mistoZBezrealitky } from './fetch-opportunities.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0; const zpravy = [];
function je(popis, vyslo, cekano) {
  if (JSON.stringify(vyslo) === JSON.stringify(cekano)) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${JSON.stringify(cekano)}, vyšlo ${JSON.stringify(vyslo)}`); }
}

/* --- Obyčejná nabídka z obce: nic se nemění --------------------------- */
je('obec zůstane obcí',
  mistoZBezrealitky('Jizerní Vtelno', '975585-nabidka-prodej-pozemku-jizerni-vtelno').place, 'Jizerní Vtelno');
je('z tvaru „Obec - katastrální území" se bere obec',
  mistoZBezrealitky('Úštěk - Kalovice', '1002714-nabidka-prodej-pozemku-ustek').place, 'Úštěk');

/* --- Ulice ve městě: tohle je ta vada -------------------------------- */
const mesto = mistoZBezrealitky('Františka Macháčka, Český Brod',
  '1068172-nabidka-prodej-pozemku-frantiska-machacka-so-pou-cesky-brod');
je('místo ulice se vezme obec z další části adresy', mesto.place, 'Český Brod');
je('a je poznat, že ta první část byla ulice', mesto.ulice, 'Františka Macháčka');

/* --- Vesnice uvnitř správního obvodu: NESMÍ se přepsat --------------
   Tohle je ta past, kvůli které se porovnává. „so pou Říčany" je správní
   obvod, ne obec: Křenice v něm leží a jako místo je správně. Kdyby se
   obec z adresy brala vždycky, udělaly by se z Křenic Říčany. */
je('vesnice ve správním obvodu zůstane vesnicí',
  mistoZBezrealitky('Křenice', '1012345-nabidka-prodej-pozemku-okruzni-so-pou-ricany').place, 'Křenice');
je('a neoznačí se za ulici',
  mistoZBezrealitky('Křenice', '1012345-nabidka-prodej-pozemku-okruzni-so-pou-ricany').ulice, null);
/* A TOTÉŽ, KDYŽ ADRESA DALŠÍ ČÁST MÁ. Bez tohohle vzorku by se dalo
   porovnávání jména úplně vypustit a zkouška by prošla: u jednodílné
   adresy není co vzít, takže vyjde správný výsledek ze špatného důvodu.
   Přistiženo sabotáží — zrušil jsem porovnání a tahle jediná kontrola
   zůstala zelená. Tady už sabotáž udělá z Křenic Říčany. */
je('vesnice se nepřepíše ani tehdy, když je v adrese i okresní město',
  mistoZBezrealitky('Křenice, Říčany', '1012345-nabidka-prodej-pozemku-okruzni-so-pou-ricany').place, 'Křenice');

/* --- Kraj není obec -------------------------------------------------- */
je('kraj se jako místo nepoužije (zůstane ulice, protože nic lepšího není)',
  mistoZBezrealitky('Ruská, Ústecký kraj', '999-nabidka-prodej-pozemku-ruska-so-pou-teplice').place, 'Ruská');
je('ale obec se vezme, i když kraj stojí za ní',
  mistoZBezrealitky('Ruská, Teplice, Ústecký kraj', '999-nabidka-prodej-pozemku-ruska-so-pou-teplice').place, 'Teplice');

/* --- Adresa bez další části: raději neúplná oprava než vymyšlené jméno */
je('samotná ulice bez obce v adrese zůstane, jak byla',
  mistoZBezrealitky('Saská', '888-nabidka-prodej-pozemku-saska-so-pou-decin').place, 'Saská');

/* --- Hraniční vstupy ------------------------------------------------- */
je('prázdná adresa nevrací nic', mistoZBezrealitky('', 'x-so-pou-y').place, null);
je('chybějící adresa nevrací nic', mistoZBezrealitky(null, null).place, null);
je('bez adresy inzerátu se nic nepřepisuje',
  mistoZBezrealitky('Františka Macháčka, Český Brod', '').place, 'Františka Macháčka');
/* Diakritika se při porovnávání musí snést — jinak by rozhodovalo
   náhodné zapsání jména v adrese. */
je('porovnání jména snese diakritiku i mezery',
  mistoZBezrealitky('Za Krétou, Tišnov', '777-nabidka-prodej-pozemku-za-kretou-so-pou-tisnov').place, 'Tišnov');
/* Shodovat se musí CELÉ jméno, ne jen konec: „Ruská" se nesmí poznat
   v adrese, kde je ulice „Jiráskova". */
je('jiná ulice v adrese nespustí přepis',
  mistoZBezrealitky('Ruská, Teplice', '666-nabidka-prodej-pozemku-jiraskova-so-pou-teplice').place, 'Ruská');

console.log('\nMísto nabídky (ulice vs. obec)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 8)) {
    console.log('::error::Místo nabídky: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  console.log('::error::Místo nabídky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
