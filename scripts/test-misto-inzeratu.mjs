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
import { mistoZBezrealitky, jmenoObce, opravUliceVObci, vypadaJakoUlice } from './fetch-opportunities.mjs';
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

/* ---- ULICE DOKÁZANÁ Z ADRESY A Z NAŠICH DAT -----------------------
   opravUliceVObci() opravuje jen tam, kde drží DVĚ opory: zbytek adresy
   se celý rovná jménu obce, které v datech stojí, a to, co dnes stojí
   v poli pro obec, vypadá na ulici. Zkouší se obojí — a hlavně to, co
   se opravit NESMÍ. */
{
  const adr = (slug) => 'https://www.bezrealitky.cz/nemovitosti-byty-domy/1-nabidka-prodej-pozemku-' + slug;
  const bezi = (nabidky) => { const k = JSON.parse(JSON.stringify(nabidky)); return { kolik: opravUliceVObci(k), data: k }; };

  const r1 = bezi([
    { place: 'Muškátová', okres: 'Brno-město', url: adr('muskatova-brno') },
    { place: 'Brno', okres: 'Brno-město', url: adr('brno') },
  ]);
  je('ulice se opraví na obec, kterou známe z dat', r1.kolik + '|' + r1.data[0].place, '1|Brno');

  const r2 = bezi([
    { place: 'Jasanová', okres: 'Ústí nad Labem', url: adr('jasanova-usti-nad-labem') },
    { place: 'Ústí nad Labem', okres: 'Ústí nad Labem', url: adr('usti-nad-labem') },
  ]);
  je('víceslovné jméno obce se bere celé', r2.data[0].place, 'Ústí nad Labem');

  /* TOHLE JE TA DRAHÁ CHYBA: zkracování jména obce. Když se celý
     zbytek adresy nenajde, NESMÍ se vzít jen jeho konec — „Vysoký
     Újezd" by se tím změnil na „Újezd", což je jiná obec. */
  const r3 = bezi([
    { place: 'Ve Višňovce', okres: 'Beroun', url: adr('ve-visnovce-vysoky-ujezd') },
    { place: 'Újezd', okres: 'Beroun', url: adr('ujezd') },
  ]);
  je('jméno obce se nezkracuje na poslední úsek adresy',
    r3.kolik + '|' + r3.data[0].place, '0|Ve Višňovce');

  /* A tohle je ta druhá: obec, za kterou v adrese stojí okres. */
  const r4 = bezi([
    { place: 'Jesenice', okres: 'Rakovník', url: adr('jesenice-rakovnik') },
    { place: 'Rakovník', okres: 'Rakovník', url: adr('rakovnik') },
  ]);
  je('obec, po níž v adrese následuje okres, se nepřepisuje',
    r4.kolik + '|' + r4.data[0].place, '0|Jesenice');

  /* Jméno, kterým se opravuje, se bere ze VŠECH míst v datech. Orlová
     končí na „-á", takže test na ulici ji za ulici považuje — a kdyby
     se jména podle téhož testu ze seznamu vyhazovala, nebylo by čím
     opravit. */
  je('Orlová vypadá podle testu na ulici (a přesto musí být k dispozici)',
    vypadaJakoUlice('Orlová'), true);
  const r5 = bezi([
    { place: 'Bučinská', okres: 'Karviná', url: adr('bucinska-orlova') },
    { place: 'Orlová', okres: 'Karviná', url: adr('orlova') },
  ]);
  je('a opraví se podle ní', r5.data[0].place, 'Orlová');

  je('obec bez pokračování v adrese zůstane', bezi([
    { place: 'Křenice', okres: 'Praha-východ', url: adr('krenice') },
  ]).kolik, 0);

  /* Na ostrých datech: kolik se toho opraví a že se nic nerozbije. */
  const ostraData = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
  const ostra = bezi((ostraData.opportunities || []));
  /* NA OSTRÝCH DATECH UŽ NENÍ CO OPRAVIT, a to je ten správný stav:
     data v repozitáři prošla jednorázovým doplněním
     (scripts/doplnit-obce.mjs) a robot pravidlo pouští při každém
     stažení. Kdyby se tu čekalo „opraví se aspoň jedna", zkouška by
     vyžadovala, aby v datech vada ZŮSTALA. Měří se tedy obojí:
     že pravidlo na vzorcích výš funguje, a že v datech po něm nic
     nezbylo. */
  je('na ostrých datech už není co opravit', ostra.kolik, 0);
  je('a žádná obec nezůstane prázdná',
    ostra.data.every((o) => o.place && String(o.place).trim()), true);
  je('a v poli pro obec po opravě nezůstane číslo bez písmene',
    ostra.data.filter((o) => /^\d+$/.test(String(o.place))).length <= 1, true);

  /* A je to zapojené PŘED dohledáváním polohy — jinak by se v mapě
     hledala ulice. */
  const zdroj2 = readFileSync(new URL('./fetch-opportunities.mjs', import.meta.url), 'utf8');
  je('robot to pouští před geokódováním',
    zdroj2.indexOf('opravUliceVObci(fresh)') > 0
    && zdroj2.indexOf('opravUliceVObci(fresh)') < zdroj2.indexOf('await geocodeName(o.place'), true);
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
