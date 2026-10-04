#!/usr/bin/env node
/* OČIŠTĚNÝ STYLOPIS MUSÍ ŘÍKAT TOTÉŽ CO ZDROJ
   ==================================================================
   css/styles.min.css je to, co si opravdu stáhne návštěvník — zdroj
   css/styles.css už ne. Kdyby se ty dva rozešly, web by se chovat jinak
   než soubor, do kterého se při hledání vady člověk podívá. To je ten
   nejnepříjemnější druh vady: měříte jednu věc a běží druhá.

   Kontroluje se:
     1. že očištěná kopie opravdu odpovídá zdroji (jinak je zapomenutá),
     2. že v ní nezůstal ani jeden komentář (jinak očištění nefunguje —
        a přesně to se stalo: vložený SVG obrázek obsahuje url(%23z),
        tedy závorku v závorce, parser za ní odjel a 174 komentářů
        zůstalo. Stránka se přitom vykreslila správně, takže by si toho
        nikdo nevšiml),
     3. že má TÉŽ PRAVIDLA jako zdroj — selektor po selektoru,
     4. že na ni stránky opravdu odkazují.

   Bod 3 se nepočítá tou funkcí, která očišťuje: to by byla kontrola
   sebe sebou. Selektory se tahají z obou souborů zvlášť a porovnávají
   se jako množiny.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ocisti } from './minifikace.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const zdroj = fs.readFileSync(path.join(KOREN, 'css', 'styles.css'), 'utf8');
const miniCesta = path.join(KOREN, 'css', 'styles.min.css');
pravda('očištěná kopie existuje', fs.existsSync(miniCesta), 'css/styles.min.css chybí');
if (!fs.existsSync(miniCesta)) { console.log(zpravy.join('\n')); process.exit(1); }
const mini = fs.readFileSync(miniCesta, 'utf8');

/* 1) Není zapomenutá. */
pravda('očištěná kopie odpovídá zdroji (není zapomenutá po úpravě)',
  ocisti(zdroj) === mini,
  'spusťte node scripts/oprav.mjs — css/styles.min.css je ze starší podoby zdroje');

/* 2) Žádné komentáře. */
const zbyle = (mini.match(/\/\*/g) || []).length;
pravda('a nezůstal v ní ani jeden komentář', zbyle === 0, `zbylo ${zbyle} komentářů`);

/* 3) Táž pravidla. Selektory se z obou souborů vytahují SAMOSTATNĚ:
   odstraní se komentáře, soubor se rozseká na bloky podle složených
   závorek a bere se text před každou otevírací závorkou. Není to plný
   parser CSS, ale na porovnání dvou podob TÉHOŽ souboru to stačí —
   a hlavně to nepoužívá tu funkci, která očišťuje. */
/* Porovnávací tvar selektoru. Očištění mění mezery u interpunkce
   („html, body" → „html,body", „(min-width: 700px)" →
   „(min-width:700px)"), takže se musí srovnat na týž tvar OBĚ strany —
   jinak by kontrola hlásila 212 rozdílů, které rozdíly nejsou. Měří se
   přítomnost pravidla, ne jeho sazba.
   Nepoužívá se k tomu funkce ocisti(): tohle je vlastní, mnohem hrubší
   srovnání, a to je záměr — kontrola se nesmí opírat o to, co kontroluje. */
function norm(sel) {
  return sel.replace(/\s+/g, ' ')
    .replace(/\s*([:,>()])\s*/g, '$1')
    .trim();
}
function selektory(css) {
  const bez = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  let hloubka = 0, zacatek = 0;
  for (let i = 0; i < bez.length; i++) {
    const c = bez[i];
    if (c === '{') {
      if (hloubka === 0) {
        const sel = norm(bez.slice(zacatek, i));
        if (sel) out.push(sel);
      }
      hloubka++;
    } else if (c === '}') {
      hloubka = Math.max(0, hloubka - 1);
      if (hloubka === 0) zacatek = i + 1;
    }
  }
  return out;
}
const sZdroj = selektory(zdroj);
const sMini = selektory(mini);
pravda(`ve zdroji se našly selektory (${sZdroj.length}) — jinak se nic neporovnává`,
  sZdroj.length > 500, `nalezeno ${sZdroj.length}`);
/* Porovnává se jako MNOŽINA i jako POČET: selektor smí být v souboru
   víckrát (přebití je v CSS normální) a toho počtu si tu všimneme. */
const spoctiVyskyty = (a) => a.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
const mZdroj = spoctiVyskyty(sZdroj), mMini = spoctiVyskyty(sMini);
const rozdily = [];
for (const [sel, kolik] of mZdroj) {
  const vMini = mMini.get(sel) || 0;
  if (vMini !== kolik) rozdily.push(`${sel} (zdroj ${kolik}×, očištěný ${vMini}×)`);
}
for (const sel of mMini.keys()) if (!mZdroj.has(sel)) rozdily.push(`${sel} (jen v očištěném)`);
pravda('a očištěná kopie má přesně tytéž selektory, stejně krát',
  rozdily.length === 0, `${rozdily.length} rozdílů: ` + rozdily.slice(0, 3).join('; '));

/* Deklarace: hrubý počet dvojic vlastnost:hodnota musí být týž. */
const deklaraci = (css) => (css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .match(/[-a-zA-Z]+\s*:\s*[^;{}]+/g) || []).length;
const dZdroj = deklaraci(zdroj), dMini = deklaraci(mini);
pravda(`a stejně mnoho deklarací (${dZdroj})`, dZdroj === dMini,
  `zdroj ${dZdroj}, očištěný ${dMini}`);

/* 4) Stránky na ni odkazují, a na zdroj už ne. */
const stranky = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
let naMini = 0; const naZdroj = [];
for (const f of stranky) {
  const s = fs.readFileSync(path.join(KOREN, f), 'utf8');
  if (/(?:href|src)="css\/styles\.min\.css/.test(s)) naMini++;
  if (/(?:href|src)="css\/styles\.css/.test(s)) naZdroj.push(f);
}
pravda(`stránky odkazují na očištěnou kopii (${naMini})`, naMini > 2000, `jen ${naMini}`);
pravda('a žádná už nestahuje neočištěný zdroj',
  naZdroj.length === 0, `${naZdroj.length}: ` + naZdroj.slice(0, 3).join(', '));

/* A kolik se tím ušetřilo — ať je to v běhu vidět a nedá se to splést
   s „nic to nedělá". */
const usetreno = Buffer.byteLength(zdroj) - Buffer.byteLength(mini);
pravda('a ušetří to aspoň 100 kB', usetreno > 100 * 1024,
  `ušetřeno jen ${(usetreno / 1024).toFixed(1)} kB`);

console.log('\nOčištěný stylopis');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log(`::error::Očištěný stylopis: ${chyb} kontrol neprošlo.`); process.exit(1); }
