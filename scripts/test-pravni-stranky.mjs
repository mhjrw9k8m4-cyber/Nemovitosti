#!/usr/bin/env node
/* PRÁVNÍ STRÁNKY: ŘÍKAJÍ PRAVDU O SOBĚ SAMÝCH?
   ==================================================================
   Spuštění: node scripts/test-pravni-stranky.mjs   (bez prohlížeče)

   Takhle to prasklo: obě právní stránky na konci tvrdily „Poslední
   úprava: srpen 2026". Jenže `ochrana-udaju.html` se od té doby změnila
   ve 229 commitech a `podminky.html` ve 227, naposledy 10. října —
   přidal se offline režim, upozornění do telefonu, měření návštěvnosti,
   mapové vrstvy úřadů i Nominatim. Kdo si přečetl datum, musel si myslet,
   že od srpna se text nezměnil. To je u dokumentu, podle kterého se někdo
   rozhoduje, jestli svěřit svoje údaje, zbytečná lež.

   DATUM NEJDE PŘEBÍRAT Z GITU. Vypadá to lákavě (soubor přece ví, kdy se
   měnil), ale je to past ve dvou krocích: (1) kdyby datum zapisoval
   generátor, změnil by tím soubor, takže by jeho gitové datum bylo zase
   o commit vedle; (2) „poslední úprava" u právního textu znamená úpravu
   ZNĚNÍ, ne přesun uzávorkování nebo přejmenování třídy v HTML.

   Místo toho se tu drží otisk VIDITELNÉHO TEXTU stránky (bez značek,
   bez komentářů a bez té věty s datem). Když se text změní, otisk se
   rozejde a zkouška spadne s výzvou: uprav datum a zapiš nový otisk.
   Kosmetická úprava značek projde, změna znění ne.

   Vedle toho se hlídá, co v těch dokumentech být musí — ne proto, že by
   to někdo smazal naschvál, ale protože se to při přepisování ztratí
   snadno a nikomu se tím nic nerozbije.
   ================================================================== */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Datum a otisk znění patří k sobě: kdo mění jedno, musí sáhnout
   i na druhé, a právě to je ta pojistka. */
const CEKANO = {
  /* Otisky přepočítané 15. 10., když se z porovnání vyňal rám stránky
     (lišta, nabídka, patička — viz viditelnyText). DATUM SE NEMĚNILO
     A NESMĚLO: ověřeno, že po vyjmutí rámu je text obou stránek proti
     commitu 43b42466 (tedy před zúžením nabídky a sjednocením
     patičky) ZNAK PO ZNAKU TOTOŽNÝ — 8 445 a 2 862 znaků, oba otisky
     se shodují. Upravit „Poslední úprava" by znamenalo tvrdit, že se
     podmínky změnily, a to je u právního textu lež, ne kosmetika.
     (Předtím se 14. 10. přepočítávalo kvůli tvaru uvozovky, se stejným
     závěrem; tyhle dvě výjimky jsou důvod, proč otisk nemá brát ani
     sazbu, ani rám.) */
  /* 26. 10. přepočítáno potřetí, opět BEZ ZMĚNY DATA: hlava stránky přešla
     na tmavou desku a obočí „Ochrana osobních údajů" vystřídala pilulka
     s týmž slovem plus odkaz „‹ Pozemky na mapě". Obojí teď z otisku
     vypadává (viz viditelnyText), takže se otisk posunul o těch 23 znaků
     obočí. Ověřeno proti commitu b2c2583d: jediný rozdíl v textu je ten
     odstraněný popisek, zbytek znak po znaku souhlasí (9 171 → 9 148). */
  'ochrana-udaju.html': { datum: 'říjen 2026', otisk: '097e249d43d3c9fe' },
  /* 17. 10.: v bodě o zneužívání webu se „obcházení stránek robotem"
     změnilo na „procházení". „Obcházet" znamená česky především obejít
     něco (zákon, zabezpečení) — v odstavci, který vyjmenovává zakázané
     jednání, je taková dvojznačnost vada. Měsíc zůstává („říjen 2026"),
     protože úprava padla do něj. */
  /* 26. 10. totéž co u zásad: ubylo obočí „Podmínky použití" (17 znaků),
     znění zůstalo (2 864 → 2 847, jinak znak po znaku totožné). */
  'podminky.html': { datum: 'říjen 2026', otisk: '5a387465eb8eb8fa' },
};

/** Viditelný text stránky: bez skriptů, stylů, komentářů a značek. */
export function viditelnyText(html) {
  return String(html)
    /* RÁM STRÁNKY DO OTISKU NEPATŘÍ. Lišta a patička jsou na webu
       společné — skládají je scripts/hlavicka.mjs a
       scripts/paticka.mjs — a mění se, kdykoli se mění NABÍDKA. Když
       15. 10. ubylo v nabídce jedenáct odkazů a patička se sjednotila,
       rozešel se otisk obou právních stránek a zkouška chtěla upravit
       „Poslední úprava". To by byla lež dvojnásob: právní znění se
       nezměnilo ani o slovo, změnilo se MENU. Otisk proto bere jen
       obsah stránky; ověřeno, že po vyjmutí rámu je znění obou
       stránek proti commitu bf7f1a1e znak po znaku totožné. */
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    /* ODZNAK A ZPĚTNÝ ODKAZ V HLAVĚ JSOU TAKY RÁM. Nejsou uvnitř <nav>,
       ale dělají totéž: říkají, kde na webu člověk je a kudy zpátky.
       Když hlava stránky 26. 10. přešla na tmavou desku a obočí
       „Ochrana osobních údajů" vystřídala pilulka s odkazem „‹ Pozemky
       na mapě", otisk se rozešel a zkouška chtěla upravit „Poslední
       úprava" — potřetí by to byla lež o právním znění. */
    .replace(/<a[^>]*class="[^"]*\bst-zpet\b[^"]*"[\s\S]*?<\/a>/gi, ' ')
    .replace(/<span[^>]*class="[^"]*\bst-odznak\b[^"]*"[\s\S]*?<\/span>/gi, ' ')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    /* TVAR UVOZOVKY NENÍ ZMĚNA ZNĚNÍ. Otisk má hlídat, co je napsáno,
       ne jak je to vysázeno. Když 14. 10. krok sazby začal zavírat
       české uvozovky česky („Obvyklá" → „Obvyklá“), rozešel se otisk
       obou právních stránek — a zkouška chtěla upravit „Poslední
       úprava". To by byla lež: podmínky se nezměnily, změnil se jeden
       znak za tiskárnu. Všechny podoby dvojité uvozovky se proto před
       otiskem sjednotí na jednu; každá skutečná úprava znění otisk
       rozejde dál. */
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/[\u201e\u201c\u201d\u201f\u00ab\u00bb]/g, '"')
    .replace(/Poslední úprava:[^.]*\./g, ' ')   // právě tu větu ne
    .replace(/\s+/g, ' ')
    .trim();
}
const otisk = (t) => createHash('sha256').update(t, 'utf8').digest('hex').slice(0, 16);

for (const [soubor, ceka] of Object.entries(CEKANO)) {
  const html = readFileSync(path.join(KOREN, soubor), 'utf8');
  const veta = new RegExp('Poslední úprava:[\\s\\u00a0]*' + ceka.datum.replace(/\s+/g, '[\\s\\u00a0]+') + '\\.');
  pravda(`${soubor} uvádí poslední úpravu „${ceka.datum}"`, veta.test(html),
    'na stránce stojí: ' + ((/Poslední úprava:[^.]*\./.exec(html) || ['(nic)'])[0]));
  const m = otisk(viditelnyText(html));
  if (!ceka.otisk) {
    pravda(`${soubor}: otisk znění je zapsaný`, false,
      `v CEKANO chybí otisk — zapiš '${m}' (a zkontroluj, že datum odpovídá znění)`);
  } else {
    pravda(`${soubor}: znění se od zápisu data nezměnilo`, m === ceka.otisk,
      `otisk ${m} ≠ zapsaný ${ceka.otisk} — text se změnil, uprav „Poslední úprava" a zapiš nový otisk`);
  }
}

/* ---- Co v zásadách soukromí být musí ---- */
{
  const z = readFileSync(path.join(KOREN, 'ochrana-udaju.html'), 'utf8');
  /* PROSA SE HLÍDÁ NA VIDITELNÉM TEXTU, ne na zdroji. Sabotáž to
     odhalila: vzorek na „480/2004" prošel i po přepsání té věty,
     protože totéž číslo stálo i v HTML komentáři nad ní — a komentář
     nikdo nečte. Odkazy a značky naopak ve viditelném textu nejsou,
     takže ty se hlídají dál ve zdroji. */
  const t = viditelnyText(z);
  pravda('zásady říkají, kdo je provozovatel a jak se mu ozvat',
    /Kdo údaje spravuje/.test(z) && /mailto:info@parcelaka\.cz/.test(z),
    'chybí oddíl o správci nebo kontakt');
  pravda('a jmenují dozorový úřad i s odkazem',
    /Úřad pro ochranu osobních údajů/.test(z) && /uoou\.gov\.cz/.test(z),
    'GDPR čl. 13: člověk má vědět, komu si může stěžovat');
  pravda('opírají se o GDPR jmenovitě (2016⁠/679)', /2016\/679/.test(t),
    'odkaz na nařízení v textu chybí');
  /* Obchodní sdělení má svůj vlastní zákon a ten žádá tři věci. */
  pravda('u e-mailů stojí zákon 480/2004 Sb.', /480\/2004/.test(t), 'chybí');
  /* MEZERY SE V SAZBĚ MĚNÍ. scripts/sazba.mjs vkládá po jednoznakových
     předložkách nezlomitelnou mezeru, takže „jen s vaším" má v hotové
     stránce U+00A0. Vzorek na obyčejnou mezeru tu napoprvé spadl právě
     na tom — a je to rozdíl mezi „text zmizel" a „text se vysázel". */
  pravda('… předchozí souhlas', /jen s[\s\u00a0]+vaším[\s\u00a0]+předchozím[\s\u00a0]+souhlasem/.test(t), 'chybí');
  pravda('… odhlášení na jedno kliknutí', /na[\s\u00a0]+jedno[\s\u00a0]+kliknutí/.test(t), 'chybí');
  pravda('a že přepínač je ve výchozím stavu vypnutý i v textu',
    /Ve[\s\u00a0]+výchozím[\s\u00a0]+stavu[\s\u00a0]+je[\s\u00a0]+vypnutý/.test(t), 'chybí');
  pravda('a je to zvýrazněné, aby to nikdo nepřečetl obráceně',
    /Ve[\s\u00a0]+výchozím[\s\u00a0]+stavu[\s\u00a0]+je[\s\u00a0]*<b>vypnutý<\/b>/.test(z), 'chybí');
  /* NEMÁME IČO a nesmíme se tvářit, že máme. Fyzická osoba
     nepodnikající ho nemá; napsat ho (nebo si ho vymyslet) by byla
     horší vada než to, že tam není. */
  pravda('zásady si nevymýšlejí IČO ani obchodní firmu', !/IČO|IČ:/.test(t),
    'na stránce stojí IČO, ale provozovatel je fyzická osoba nepodnikající');
  pravda('a říkají, že někteří zpracovatelé jsou mimo EU',
    /mimo[\s\u00a0]+EU/.test(t), 'přenos do třetí země se podle GDPR musí přiznat');
}

console.log('\nPrávní stránky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Právní stránky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
