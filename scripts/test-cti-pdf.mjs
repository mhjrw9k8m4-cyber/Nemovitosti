/* Čtení textu z PDF: přečte to, co umí, a přizná, co neumí
   ==================================================================
   Spuštění: node scripts/test-cti-pdf.mjs

   PROČ. Sonda podmínek skončila 3. 11. u tří zdrojů na odkazu na PDF
   (Bezrealitky 5×, elektronickedrazby.cz dražební řád, verejnedrazby.cz
   3×). Odkaz není odpověď. Čtečka je v scripts/cti-pdf.mjs a nemá
   žádnou novou závislost, takže se musí prokázat na opravdových
   dokumentech — fixtury se tu proto SKLÁDAJÍ jako PDF, ne podstrkují
   jako hotový text.

   A MĚŘÍ SE I TO DŮLEŽITĚJŠÍ: že se špatně dekódovaný text nevydává
   za přečtený. Mojibake by sítem na zákazy propadlo jako „nic
   o automatu se nenašlo", a to by byla lež, ne nález.
   ================================================================== */
import { deflateSync } from 'node:zlib';
import { textZPdf, citelnost, cmapZTextu, textZObsahu, STROP_PDF } from './cti-pdf.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const VETA = 'Je zakázáno obsah serveru vytěžovat automatizovanými prostředky, zejména roboty.';

/* ---- stavba PDF -------------------------------------------------- */

/** Bajty věty v cp1250 — tak ji sází většina českých PDF. */
function cp1250(s) {
  const TAB = { 'á': 0xe1, 'č': 0xe8, 'ď': 0xef, 'é': 0xe9, 'ě': 0xec, 'í': 0xed, 'ň': 0xf2,
    'ó': 0xf3, 'ř': 0xf8, 'š': 0x9a, 'ť': 0x9d, 'ú': 0xfa, 'ů': 0xf9, 'ý': 0xfd, 'ž': 0x9e,
    'Á': 0xc1, 'Č': 0xc8, 'Ď': 0xcf, 'É': 0xc9, 'Ě': 0xcc, 'Í': 0xcd, 'Ň': 0xd2, 'Ó': 0xd3,
    'Ř': 0xd8, 'Š': 0x8a, 'Ť': 0x8d, 'Ú': 0xda, 'Ů': 0xd9, 'Ý': 0xdd, 'Ž': 0x8e };
  const out = [];
  for (const ch of s) out.push(TAB[ch] != null ? TAB[ch] : (ch.charCodeAt(0) & 0xff));
  return Buffer.from(out);
}

/** PDF s jedním obsahovým streamem; `komprimovat` zapne FlateDecode. */
function pdfSObsahem(obsahBuf, komprimovat, navic) {
  const telo = komprimovat ? deflateSync(obsahBuf) : obsahBuf;
  const filtr = komprimovat ? ' /Filter /FlateDecode' : '';
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    Buffer.from(navic || ''),
    Buffer.from(`4 0 obj\n<< /Length ${telo.length}${filtr} >>\nstream\n`),
    telo,
    Buffer.from('\nendstream\nendobj\n%%EOF\n'),
  ]);
}

/* 1) NEKOMPRIMOVANÝ TEXT V cp1250 */
{
  const obsah = Buffer.concat([
    Buffer.from('BT /F1 12 Tf ('), cp1250(VETA), Buffer.from(') Tj ET\n'),
  ]);
  const v = textZPdf(pdfSObsahem(obsah, false));
  pravda('nekomprimovaný text se přečte včetně české diakritiky',
    v.text.includes('zakázáno') && v.text.includes('vytěžovat'),
    JSON.stringify(v.text.slice(0, 120)) + ' | čitelnost ' + v.citelnost.toFixed(2));
  pravda('a čitelnost je vysoká (jinak by se to nesmělo brát)',
    v.citelnost > 0.95, String(v.citelnost));
}

/* 2) KOMPRIMOVANÝ TEXT — tak jsou skoro všechna PDF naostro */
{
  const obsah = Buffer.concat([
    Buffer.from('BT /F1 12 Tf ('), cp1250(VETA), Buffer.from(') Tj ET\n'),
  ]);
  const v = textZPdf(pdfSObsahem(obsah, true));
  pravda('komprimovaný (FlateDecode) text se přečte taky',
    v.text.includes('vytěžovat'), JSON.stringify(v.text.slice(0, 120)));
}

/* 3) IDENTITY-H S ToUnicode CMap — takhle se česká diakritika sází
      nejčastěji a bez tabulky by z toho byly jen otazníky. */
{
  /* Každý znak dostane kód = jeho pořadí+1; tabulka ho mapuje zpět. */
  const znaky = [...VETA];
  const kody = znaky.map((_, i) => i + 1);
  const hex = kody.map((k) => k.toString(16).padStart(4, '0')).join('');
  const cmap = 'begincmap\n/CMapName /Identity-H def\n'
    + znaky.length + ' beginbfchar\n'
    + znaky.map((z, i) => `<${(i + 1).toString(16).padStart(4, '0')}>`
      + `<${z.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n')
    + '\nendbfchar\nendcmap\n';
  const cmapBuf = deflateSync(Buffer.from(cmap, 'latin1'));
  const navic = `5 0 obj\n<< /Length ${cmapBuf.length} /Filter /FlateDecode /ToUnicode >>\nstream\n`
    + cmapBuf.toString('latin1') + '\nendstream\nendobj\n';
  /* Obsah se skládá zvlášť, aby CMap stream stál PŘED ním. */
  const obsah = Buffer.from(`BT /F1 12 Tf <${hex}> Tj ET\n`, 'latin1');
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    Buffer.from(`5 0 obj\n<< /Length ${cmapBuf.length} /Filter /FlateDecode /ToUnicode >>\nstream\n`, 'latin1'),
    cmapBuf,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
    Buffer.from(`4 0 obj\n<< /Length ${obsah.length} >>\nstream\n`, 'latin1'),
    obsah,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
  const v = textZPdf(pdf);
  pravda('font Identity-H se přečte podle ToUnicode tabulky',
    v.text.includes('zakázáno') && v.text.includes('vytěžovat'),
    JSON.stringify(v.text.slice(0, 160)) + ' | cmapů ' + v.cmapu);
  pravda('a je vidět, že se tabulka opravdu použila', v.cmapu >= 1, 'cmapů ' + v.cmapu);
  /* Tabulka samotná: rozsahy i seznamy, ne jen dvojice. */
  const m = cmapZTextu('beginbfrange\n<0041> <0043> <0061>\n<0050> <0051> [<0078> <0079>]\nendbfrange');
  pravda('CMap umí rozsah i seznam, ne jen dvojice',
    m.get(0x41) === 'a' && m.get(0x43) === 'c' && m.get(0x50) === 'x' && m.get(0x51) === 'y',
    JSON.stringify([...m].slice(0, 6)));
}

/* 3b) DVĚ PÍSMA, DVĚ TABULKY — KAŽDÁ KE SVÉMU FONTU.
       NALEZENO MĚŘENÍM NAOSTRO: dražební řád elektronickedrazby.cz
       vyšel na 10 556 znaků, ale s čitelností 0,86 — každý sedmý znak
       otazník. Příčina byla u mě: jednu tabulku jsem nasadil na
       VŠECHNA písma dokumentu. Cesta musí jít přes jméno:
       `/Font << /F1 10 0 R >>` → `10 0 obj << /ToUnicode 20 0 R >>`
       → stream objektu 20. */
{
  const cmapProZnak = (kod, znak) => 'begincmap\n1 beginbfchar\n<'
    + kod.toString(16).padStart(4, '0') + '><'
    + znak.charCodeAt(0).toString(16).padStart(4, '0') + '>\nendbfchar\nendcmap\n';
  const stream = (cislo, obsah, slovnikNavic) => {
    const telo = deflateSync(Buffer.from(obsah, 'latin1'));
    return Buffer.concat([
      Buffer.from(`${cislo} 0 obj\n<< /Length ${telo.length} /Filter /FlateDecode`
        + `${slovnikNavic || ''} >>\nstream\n`, 'latin1'),
      telo, Buffer.from('\nendstream\nendobj\n', 'latin1'),
    ]);
  };
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.from('1 0 obj\n<< /Font << /F1 10 0 R /F2 11 0 R >> >>\nendobj\n', 'latin1'),
    Buffer.from('10 0 obj\n<< /Type /Font /ToUnicode 20 0 R >>\nendobj\n', 'latin1'),
    Buffer.from('11 0 obj\n<< /Type /Font /ToUnicode 21 0 R >>\nendobj\n', 'latin1'),
    stream(20, cmapProZnak(1, 'A')),
    stream(21, cmapProZnak(1, 'B')),
    stream(4, 'BT /F1 12 Tf <0001> Tj /F2 12 Tf <0001> Tj ET\n'),
    Buffer.from('%%EOF\n', 'latin1'),
  ]);
  const v = textZPdf(pdf);
  pravda('každé písmo se čte svou tabulkou, ne jednou pro všechna',
    v.text.replace(/\s/g, '') === 'AB',
    JSON.stringify(v.text) + ' | cmapů ' + v.cmapu
    + ' — „AA" nebo „BB" znamená, že se nasadila cizí tabulka');
  pravda('a obě tabulky jsou v nálezu spočítané', v.cmapu === 2, 'cmapů ' + v.cmapu);

  /* A PÍSMO, KTERÉ V SOUPISU NENÍ, NEDOSTANE CIZÍ TABULKU. Tahle
     pojistka napoprvé nehlídala nic: sabotáž „jedna tabulka na
     všechna písma" prošla zeleně, protože při správném páru se na
     náhradu nikdy nedošlo. Tady se na ni dojít MUSÍ — a správná
     odpověď je „žádná tabulka" (dekóduje se jako jednobajtové),
     ne tabulka od vedlejšího písma. */
  const pdfCizi = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.from('1 0 obj\n<< /Font << /F1 10 0 R /F2 11 0 R >> >>\nendobj\n', 'latin1'),
    Buffer.from('10 0 obj\n<< /Type /Font /ToUnicode 20 0 R >>\nendobj\n', 'latin1'),
    Buffer.from('11 0 obj\n<< /Type /Font /ToUnicode 21 0 R >>\nendobj\n', 'latin1'),
    stream(20, cmapProZnak(1, 'A')),
    stream(21, cmapProZnak(1, 'B')),
    /* OSM KÓDŮ, ne jeden: cizí tabulka zná jediný z nich, takže
       zbytek vyjde jako otazníky. Jednoznakový text by dal čitelnost
       1 a tvrdil by o hodnověrnosti něco, co u opravdového dokumentu
       neplatí — na tom mi kontrola pod tím napoprvé spadla. */
    stream(4, 'BT /F9 12 Tf <00010002000300040005000600070008> Tj ET\n'),
    Buffer.from('%%EOF\n', 'latin1'),
  ]);
  /* A SLOVNÍK PÍSEM SCHOVANÝ V OBJEKTOVÉM STREAMU. Naměřeno naostro:
     PDF od verze 1.5 ukládá objekty bez streamu do komprimovaného
     `/ObjStm`, takže v surovém souboru nejsou vidět. Čitelnost
     dražebního řádu kvůli tomu spadla z 0,86 na 0,36 — párování se
     nemělo o co opřít. */
  const pdfVObjStm = Buffer.concat([
    Buffer.from('%PDF-1.5\n', 'latin1'),
    stream(30, '1 0 obj\n<< /Font << /F1 10 0 R /F2 11 0 R >> >>\nendobj\n'
      + '10 0 obj\n<< /Type /Font /ToUnicode 20 0 R >>\nendobj\n'
      + '11 0 obj\n<< /Type /Font /ToUnicode 21 0 R >>\nendobj\n', ' /Type /ObjStm'),
    stream(20, cmapProZnak(1, 'A')),
    stream(21, cmapProZnak(1, 'B')),
    stream(4, 'BT /F1 12 Tf <0001> Tj /F2 12 Tf <0001> Tj ET\n'),
    Buffer.from('%%EOF\n', 'latin1'),
  ]);
  const vo = textZPdf(pdfVObjStm);
  pravda('písma se spárují i když je slovník v objektovém streamu',
    vo.text.replace(/\s/g, '') === 'AB',
    JSON.stringify(vo.text) + ' — tohle je ten případ, na kterém naostro'
    + ' spadla čitelnost z 0,86 na 0,36');

  const vc = textZPdf(pdfCizi);
  /* CO TU OPRAVDU PLATÍ, A PROČ TO NENÍ „cizí tabulku nikdy".
     Napoprvé jsem tu žádal, aby neznámé písmo cizí tabulku nedostalo
     NIKDY. Měření naostro ale ukázalo, že u dražebního řádu
     elektronickedrazby.cz je ta hrubá náhrada třikrát čitelnější
     (0,86 proti 0,36), protože slovníky písem v tom dokumentu nejsou
     ani v surovém souboru, ani v objektových streamech. Kontrola, co
     to žádala, by tedy vynucovala horší čtení.
     Invariant, na kterém opravdu záleží, je jiný: náhrada se nesmí
     použít POTICHU, a nesmí vyrobit text, který by prošel sítem jako
     hodnověrný. Obojí se měří tady; o tom, jestli se takový text
     vůbec vezme, rozhoduje mez čitelnosti v sondě. */
  /* KONKRÉTNÍ HODNOTA, NE „jedna z možných". Napoprvé jsem tu připustil
     obě — a tím vznikla tautologie, která nemohla nikdy spadnout:
     sabotáže „náhrada potichu" i „náhrada i když není lepší" prošly
     zeleně. Změřeno, že tahle fixtura jde náhradní cestou, takže se
     žádá právě ta. */
  pravda('u neznámého písma se jde náhradní cestou — a nález to říká',
    /jedna tabulka/.test(vc.volba || ''),
    JSON.stringify({ volba: vc.volba, text: vc.text }));
  pravda('a u správného páru se za náhradu nevydává párování',
    v.volba === 'podle jmen písem',
    JSON.stringify({ volba: v.volba, text: v.text }));
  pravda('text z neznámého písma zůstane nehodnověrný (síto ho nevezme)',
    vc.citelnost < 0.9, JSON.stringify({ citelnost: vc.citelnost, text: vc.text }));

  /* A KDYŽ NÁHRADA NENÍ LEPŠÍ, NEBERE SE. Bez tohohle případu sabotáž
     „náhrada i když není lepší" procházela zeleně: u správně
     spárovaného dokumentu je párování čitelné, takže se na náhradu
     vůbec nedojde, a tu podmínku nic nezkoušelo. Tady je párování
     SPRÁVNÉ, ale nečitelné (tabulka zná jeden kód z osmi) — a náhrada
     by byla stejně nečitelná. Musí zůstat párování, tedy „A", ne „B". */
  const pdfStejne = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.from('1 0 obj\n<< /Font << /F1 10 0 R /F2 11 0 R >> >>\nendobj\n', 'latin1'),
    Buffer.from('10 0 obj\n<< /Type /Font /ToUnicode 20 0 R >>\nendobj\n', 'latin1'),
    Buffer.from('11 0 obj\n<< /Type /Font /ToUnicode 21 0 R >>\nendobj\n', 'latin1'),
    stream(20, cmapProZnak(1, 'A')),
    stream(21, cmapProZnak(1, 'B')),
    stream(4, 'BT /F1 12 Tf <00010002000300040005000600070008> Tj ET\n'),
    Buffer.from('%%EOF\n', 'latin1'),
  ]);
  const vs = textZPdf(pdfStejne);
  pravda('náhrada, která není čitelnější, se nebere',
    vs.volba === 'podle jmen písem' && /^A/.test(vs.text),
    JSON.stringify({ volba: vs.volba, text: vs.text })
    + ' — „B" znamená, že se přebilo správné párování bez důvodu');
}

/* 4) NASKENOVANÝ PAPÍR — žádný text tam není, a tak se to musí říct. */
{
  const obsah = Buffer.from('q 612 0 0 792 0 0 cm /Im0 Do Q\n');
  const v = textZPdf(pdfSObsahem(obsah, true));
  pravda('z naskenovaného PDF nevznikne text (a nic se nepředstírá)',
    v.text === '', JSON.stringify(v));
}

/* 5) CO NENÍ PDF, ŠIFROVANÉ A PŘÍLIŠ VELKÉ — s důvodem, ne mlčením. */
{
  pravda('co není PDF, se pozná a řekne',
    /není to PDF/.test(textZPdf(Buffer.from('<html>nic</html>')).duvod || ''),
    JSON.stringify(textZPdf(Buffer.from('<html>nic</html>'))));
  const sifr = Buffer.concat([Buffer.from('%PDF-1.4\n/Encrypt 9 0 R\n'), Buffer.from('x'.repeat(100))]);
  pravda('šifrované PDF se přizná, ne obchází',
    /zašifrovaný/.test(textZPdf(sifr).duvod || ''), JSON.stringify(textZPdf(sifr)));
  const velke = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(STROP_PDF + 10, 0x20)]);
  pravda('dokument nad stropem se nečte',
    /strop/.test(textZPdf(velke).duvod || ''),
    JSON.stringify(textZPdf(velke).duvod) + ' | strop ' + STROP_PDF);
  pravda('a strop je nejvýš 16 MB (robot není archiv)', STROP_PDF <= 16 * 1024 * 1024);
}

/* 6) MOJIBAKE SE NESMÍ VYDÁVAT ZA PŘEČTENÝ TEXT. Tohle je ta kontrola,
      kvůli které `citelnost()` vůbec existuje: špatně dekódovaný text
      není prázdný, a síto na zákazy by ho propustilo jako „nic se
      nenašlo". */
{
  pravda('čitelnost českého textu je vysoká', citelnost(VETA) > 0.95, String(citelnost(VETA)));
  const rozsypane = '����������';
  pravda('a u rozsypaného čaje nízká', citelnost(rozsypane) < 0.2, String(citelnost(rozsypane)));
  /* A naostro: dvoubajtové kódy BEZ tabulky dají otazníky, ne text. */
  const obsah = Buffer.from('BT /F1 12 Tf <00480049004a> Tj ET\n', 'latin1');
  const v = textZPdf(pdfSObsahem(obsah, true));
  pravda('dvoubajtový font bez tabulky nevyjde jako hodnověrný text',
    v.citelnost < 0.95 || !/[ěščřžýáíé]/.test(v.text),
    JSON.stringify({ text: v.text.slice(0, 60), citelnost: v.citelnost }));
}

/* 6b) POLE S POSUNY — NEJČASTĚJŠÍ TVAR V OPRAVDOVÝCH PDF.
       NALEZENO MĚŘENÍM NAOSTRO: z dražebního řádu elektronickedrazby.cz
       vyšlo 385 znaků, ačkoli čitelnost byla 0,99. Příčina: text se
       sází jako `[(Je zak) -250 (azano)] TJ`, kde za řetězcem stojí
       číslo, ne operátor — a čtečka brala jen řetězce před `Tj`/`TJ`.
       Celý dokument se tím ztratil a nálezu to nevadilo, protože to,
       co přečetla, bylo čitelné. */
{
  const obsah = Buffer.concat([
    Buffer.from('BT /F1 12 Tf [('),
    cp1250('Je zakázáno obsah '), Buffer.from(') -250 ('),
    cp1250('serveru vytěžovat roboty'), Buffer.from(')] TJ ET\n'),
  ]);
  const v = textZPdf(pdfSObsahem(obsah, true));
  pravda('text z pole s posuny se přečte celý',
    v.text.includes('zakázáno') && v.text.includes('vytěžovat')
    && v.text.includes('serveru'),
    JSON.stringify(v.text.slice(0, 160)));
  /* A ať se nestane, že se spojí bez mezery do nesmyslu — slova
     z jednoho pole na sebe navazují tak, jak v dokumentu stojí. */
  pravda('a slova na sebe navazují, nelepí se do jednoho',
    /zakázáno obsah\s*serveru/.test(v.text), JSON.stringify(v.text.slice(0, 160)));
}

/* 7) TEXT ZE STREAMU: operátory, které PDF používá na odstavce. */
{
  const t = textZObsahu('BT (prvni) Tj T* (druhy) Tj ET', null);
  pravda('odřádkování z T* se do textu propíše',
    /prvni/.test(t) && /druhy/.test(t) && /\n/.test(t), JSON.stringify(t));
}

console.log('\nČtení PDF');
console.log(zpravy.join('\n'));
/* ---- ČITELNOST SE POČÍTÁ OD NULY ------------------------------
 * ==================================================================
 * Smyčka samorozvoje 4. 11. posunula v `citelnost()` počáteční
 * `let dobre = 0` na `1` a tahle zkouška mlčela — měřila jen, že
 * čitelný text vyjde nad 0,95, a tam jeden znak navíc nepoznáte.
 * Rozhoduje se tím ale, jestli se text z PDF přijme, nebo se sáhne
 * po náhradě (PRAH_PRO_NAHRADU) — a tam jde o pár procent.
 */
{
  /* ŽÁDNÝ ČITELNÝ ZNAK = NULA. Tady se posunutá nula pozná hned. */
  pravda('text bez jediného čitelného znaku má čitelnost 0',
    citelnost('\u0000\u0001\u0002') === 0, String(citelnost('\u0000\u0001\u0002')));
  pravda('a prázdný text taky', citelnost('') === 0, String(citelnost('')));
  /* A PODÍL AŤ JE PODÍL: tři znaky ze šesti jsou přesně polovina. */
  pravda('polovina čitelných znaků dá 0,5',
    Math.abs(citelnost('abc\u0000\u0001\u0002') - 0.5) < 1e-9,
    String(citelnost('abc\u0000\u0001\u0002')));
  pravda('a samý čitelný text dá jedničku',
    citelnost('Pozemek 1 234 m², k. ú. Dívčice') === 1,
    String(citelnost('Pozemek 1 234 m², k. ú. Dívčice')));
}

console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.error(`::error::Čtení PDF: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
