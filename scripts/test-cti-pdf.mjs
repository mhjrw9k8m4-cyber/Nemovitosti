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
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.error(`::error::Čtení PDF: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
