/* ZNAČKA: OBĚ KRESBY MUSÍ BÝT TATÁŽ ZNAČKA.
   ==================================================================
   PROČ TAHLE ZKOUŠKA VZNIKLA — nález z 1. 11. Kresba značky je ve
   dvou souborech: assets/logo-mark.svg (lišta, pás na úvodu, hlava
   šuplíku) a assets/favicon.svg (záložka a PNG ikony na ploše
   telefonu, viz scripts/build-og.mjs). Byly na sobě nezávislé a taky
   se rozešly: favicon si půl týdne vezl PŮVODNÍ podobu se třemi
   přelivy a vnitřní září, přestože se značka 30. 10. zplošťovala.
   Web měl v záložce a na ploše telefonu jinou značku než v liště —
   v kódu to vidět nebylo, na snímku hned.

   CO SE TEDY HLÍDÁ:
     1. obě kresby nesou TÝŽ tvar (stejné cesty, stejné pořadí),
     2. liší se jen tím, co se lišit smí — přístupné jméno má jen
        logo-mark.svg, protože favicon vkládá prohlížeč sám,
     3. obě nesou tytéž barvy.
   Na paletu se kresba NEVÁŽE: značka má od 1. 11. zase svou původní
   podobu s přelivem a vlastními odstíny, které vznikly dřív než
   soustava tokenů (majitel: „dej tam to původní logo, ten domeček").
   ================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0; const zpravy = [];
function pravda(co, podminka, detail) {
  if (podminka) { ok++; zpravy.push('  ✓ ' + co); }
  else { chyb++; zpravy.push('  ✕ ' + co + (detail ? '\n      ' + detail : '')); }
}
const cti = (jm) => { try { return readFileSync(path.join(ROOT, 'assets', jm), 'utf8'); } catch (e) { return ''; } };
const mark = cti('logo-mark.svg'), fav = cti('favicon.svg');

pravda('assets/logo-mark.svg existuje a něco kreslí', mark.indexOf('<path') > 0);
pravda('assets/favicon.svg existuje a něco kreslí', fav.indexOf('<path') > 0);

/* 1 — týž tvar. Porovnávají se všechny cesty a výplně v pořadí. */
const tvar = (svg) => [...svg.matchAll(/<(?:path|rect|circle|ellipse)\b[^>]*>/g)]
  .map((m) => m[0].replace(/\s+/g, ' ').trim());
const a = tvar(mark), b = tvar(fav);
pravda(`obě kresby mají stejný počet tvarů (${a.length})`, a.length > 0 && a.length === b.length,
  `logo-mark ${a.length}, favicon ${b.length}`);
const prvniRozdil = a.findIndex((x, i) => x !== b[i]);
pravda('a každý tvar je v obou souborech stejný', a.length === b.length && prvniRozdil < 0,
  prvniRozdil >= 0 ? `první rozdíl je ${prvniRozdil + 1}. tvar:\n      logo-mark: ${a[prvniRozdil]}\n      favicon:   ${b[prvniRozdil]}` : '');

/* 2 — liší se jen přístupným jménem */
pravda('přístupné jméno nese logo-mark.svg (favicon ho nepotřebuje)',
  /aria-label="Parcelka"/.test(mark) && !/aria-label=/.test(fav));

/* 3 — a tytéž barvy. Tahle kontrola sem přišla z test-tokeny.mjs:
   tam stávalo pravidlo „kresba smí mít jen bílou a token
   --plocha-znacka", jenže 1. 11. si majitel vyžádal zpátky PŮVODNÍ
   kresbu s přelivem („dej tam to původní logo, ten domeček") a ta má
   vlastní odstíny, které vznikly dřív než paleta. Hlídat se tedy dá
   to podstatné: ať mají obě kresby tytéž barvy. Rozejít se už jednou
   stihly — a web pak měl v záložce jinou značku než v liště. */
const barvy = (svg) => [...svg.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,8})"/g)]
  .map((m) => m[1].toUpperCase());
const ba = barvy(mark), bb = barvy(fav);
pravda(`v kresbě se vůbec nějaké barvy našly (${ba.length})`, ba.length >= 4);
pravda('obě kresby používají tytéž barvy ve stejném pořadí',
  ba.length === bb.length && ba.every((x, i) => x === bb[i]),
  `logo-mark: ${[...new Set(ba)].join(', ')}\n      favicon:   ${[...new Set(bb)].join(', ')}`);

console.log('\nZnačka (obě kresby tatáž)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 8)) {
    console.log('::error::Značka: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  process.exit(1);
}
process.exit(0);
