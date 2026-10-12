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
import { mistoZBezrealitky, jmenoObce } from './fetch-opportunities.mjs';
import { readFileSync } from 'node:fs';
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

/* ---- A JMÉNO OBCE NESMÍ BÝT VĚTA Z INZERÁTU ----

   Nahlášeno z průchodu webem: ve výpisu stála nabídka jménem
   „Vráž je známá pro svoje lázeňské sanatorium zaměřené na léčb" —
   a web z toho udělal i adresu stránky, nadpis, titulek a řádek
   v sitemapě. U Farmy.cz se obec bere vzorkem „Obec … Okres" z textu
   stránky, a když mezi těmi dvěma slovy leží věta, vezme se celá věta.
   Slice na 60 znaků ji jen zkrátil doprostřed slova.

   Změřeno na všech 1 041 různých jménech v datech: pokažená byla dvě —
   ta věta a „Žeravice u Kyjova a k.ú. Syrovín" z OK dražeb (dvě
   katastrální území slepená do jednoho jména). U obou se správné jméno
   z toho řetězce přečíst dá, a právě to se tu zkouší.

   Ulice se tím NEOPRAVUJÍ: „Černá cesta" je skutečné místo, ne věta, a
   která část adresy je obec, se dá poznat jen z adresy (kontroly výš). */
{
  je('věta za jménem obce se ukrojí',
    jmenoObce('Vráž je známá pro svoje lázeňské sanatorium zaměřené na léčb'), 'Vráž');
  je('a slepené katastrální území taky',
    jmenoObce('Žeravice u Kyjova a k.ú. Syrovín'), 'Žeravice u Kyjova');
  /* Co se naopak měnit NESMÍ — osm jmen, která mi první, přísnější
     verze pravidla zamítla: pět slov, malá písmena uprostřed i tečky. */
  for (const jm of ['Praha', 'Ústí nad Orlicí', 'Kostelec nad Černými lesy',
    'Rychnov u Jablonce nad Nisou', 'Doksy u Máchova jezera', 'Dr. E. Beneše',
    'Padlých hrdinů', 'Černá cesta']) {
    je(`jméno „${jm}" zůstává`, jmenoObce(jm), jm);
  }
  /* Nezlomitelná mezera z adresy se srovná na obyčejnou: „V Hlubokém"
     přišlo z Bezrealitky s U+00A0 mezi slovy. */
  je('nezlomitelná mezera se srovná', jmenoObce('V\u00a0Hlubokém'), 'V Hlubokém');
  je('z prázdna nic nevznikne', jmenoObce('  '), null);
  je('a z jedné litery taky ne', jmenoObce('X'), null);

  /* A na ostrých datech: po očištění už není co očišťovat. */
  const data = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
  const spatna = (data.opportunities || [])
    .filter((o) => jmenoObce(o.place) !== o.place)
    .map((o) => o.place);
  je(`v datech není jméno obce, které by se dalo očistit (${(data.opportunities || []).length} nabídek)`,
    spatna.slice(0, 3), []);
  /* Pojistka, že se to opravdu měří: kdyby soubor zmizel nebo byl
     prázdný, kontrola výš projde na prázdnu. */
  je('a bylo z čeho měřit', (data.opportunities || []).length > 500, true);

  /* Konečně: očištění musí být zapojené v robotovi na JEDNOM místě. */
  const zdroj = readFileSync(new URL('./fetch-opportunities.mjs', import.meta.url), 'utf8');
  je('robot jméno obce očišťuje u všech zdrojů naráz',
    /for \(const o of fresh\) \{\s*\n\s*const lepsi = jmenoObce\(o\.place\);/.test(zdroj), true);
}

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
