#!/usr/bin/env node
/* OČIŠTĚNÍ STYLOPISU PRO PROHLÍŽEČ
   ==================================================================
   Naměřeno: css/styles.css má 381,5 kB a 165,5 kB z toho (43 %) jsou
   KOMENTÁŘE. Ty komentáře jsou v tomhle repozitáři to nejcennější, co
   v souborech je — vysvětlují, proč pravidlo vypadá, jak vypadá, a čím
   se to kdysi pokazilo. Jen je nemá smysl posílat do prohlížeče: stylopis
   BLOKUJE VYKRESLENÍ, takže každý návštěvník každé stránky čeká na
   165 kB vysvětlení, které nikdy neuvidí.

   Přes drát to dělá 115,7 kB (gzip) proti 36,9 kB po očištění, tedy
   o 68 % méně — a to na KAŽDÉ stránce webu, protože stylopis je jeden.

   Proto se vedle zdroje staví očištěná kopie css/styles.min.css a
   stránky odkazují na ni. Zdroj zůstává tím, co člověk otevírá
   a upravuje; že se ty dva nerozejdou, hlídá scripts/test-minifikace.mjs
   a stejně tak krok --kontrola níž.

   CO SE DĚLÁ A CO NE. Odstraňují se komentáře a zbytečné mezery. Nic
   víc: žádné přepisování barev na kratší tvar, žádné slučování
   pravidel, žádné přeskládání. Čím méně se v očištěné kopii změní, tím
   menší je šance, že se bude chovat jinak než zdroj — a tohle není
   místo na chytrost, tohle je místo na nudu.

   POZOR NA TEXTY V UVOZOVKÁCH. V content:"…" i v url(…) může stát
   cokoli, včetně /* a složených závorek. Proto se nejde regulárním
   výrazem přes celý soubor, ale po znacích se stavem „jsem v textu".
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZDROJ = path.join(KOREN, 'css', 'styles.css');
const CIL = path.join(KOREN, 'css', 'styles.min.css');
const CIL_REL = 'css/styles.min.css';
const ZDROJ_REL = 'css/styles.css';

/** Očistí stylopis: komentáře pryč, mezery na minimum. Nic jiného. */
export function ocisti(css) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    const c = css[i];
    /* Komentář — jen mimo text. */
    if (c === '/' && css[i + 1] === '*') {
      const konec = css.indexOf('*/', i + 2);
      i = konec < 0 ? n : konec + 2;
      /* Místo komentáře zůstane mezera: `a/* x *\/b` nesmí splynout
         na `ab`. Nadbytečné mezery se stejně smáznou níž. */
      out += ' ';
      continue;
    }
    /* Text v uvozovkách opisujeme ZNAK ZA ZNAKEM, včetně mezer. */
    if (c === '"' || c === "'") {
      const uvoz = c;
      out += c; i++;
      while (i < n) {
        if (css[i] === '\\') { out += css[i] + (css[i + 1] || ''); i += 2; continue; }
        out += css[i];
        if (css[i] === uvoz) { i++; break; }
        i++;
      }
      continue;
    }
    /* url(…) — opisuje se celé, až po PÁROVOU závorku.
       NAPOPRVÉ SE TU SKOČILO NA PRVNÍ „)" A TO ROZBILO ZBYTEK SOUBORU.
       V stylopisu je vložený SVG jako data URI a v něm stojí
       filter='url(%23z)' — tedy závorka uvnitř závorky. Parser za ní
       pokračoval uprostřed obrázku, narazil na apostrof u height='160',
       přepnul se do „jsem v textu" a od té chvíle přepisoval komentáře
       beze změny. V očištěném souboru pak zůstalo 174 komentářů
       a nikdo by si toho nevšiml: stránka se vykreslila správně.
       Proto se závorky počítají. */
    if ((c === 'u' || c === 'U') && /^url\(/i.test(css.slice(i, i + 4))) {
      let j = i + 4, hloubka = 1;
      while (j < n && hloubka > 0) {
        if (css[j] === '(') hloubka++;
        else if (css[j] === ')') hloubka--;
        j++;
      }
      out += css.slice(i, j); i = j; continue;
    }
    out += c; i++;
  }
  return out
    .replace(/\s+/g, ' ')
    /* Mezery okolo znaků, kde v CSS nic neznamenají. Kolem „+" a „~"
       se nesahá: jsou to i selektory (a + b), i znaménka v calc(). */
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/\s*>\s*/g, '>')
    .replace(/;}/g, '}')
    /* Zlom řádku za každým pravidlem. Prohlížeči je to jedno a po
       zabalení (gzip) to nic nestojí, ale soubor na jediném řádku
       o 252 806 znacích se nedá přečíst ani porovnat v gitu — a tohle
       je artefakt, do kterého se někdy bude muset podívat člověk. */
    .replace(/}/g, '}\n')
    .trim();
}

/* Odkazy ve stránkách. Mění se jen to, co existuje — stránky, které
   stylopis schválně nenačítají (diagnostika, 404), zůstanou být. */
function prepisOdkazy(kontrolaJen) {
  const stranky = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
  const VZOR = /((?:href|src)=")css\/styles\.css((?:\?v=[A-Za-z0-9]+)?")/g;
  let zmeneno = 0;
  const nezmenene = [];
  for (const f of stranky) {
    const cesta = path.join(KOREN, f);
    const s = fs.readFileSync(cesta, 'utf8');
    if (!VZOR.test(s)) continue;
    VZOR.lastIndex = 0;
    if (kontrolaJen) { nezmenene.push(f); continue; }
    fs.writeFileSync(cesta, s.replace(VZOR, `$1${CIL_REL}$2`));
    zmeneno++;
  }
  return { zmeneno, nezmenene };
}

export function spust(kontrolaJen = false) {
  const zdroj = fs.readFileSync(ZDROJ, 'utf8');
  const mini = ocisti(zdroj);
  const stare = fs.existsSync(CIL) ? fs.readFileSync(CIL, 'utf8') : null;

  if (kontrolaJen) {
    const { nezmenene } = prepisOdkazy(true);
    const chyby = [];
    if (stare !== mini) chyby.push('css/styles.min.css neodpovídá css/styles.css');
    if (nezmenene.length) {
      chyby.push(`${nezmenene.length} stránek odkazuje na neočištěný stylopis: `
        + nezmenene.slice(0, 3).join(', '));
    }
    return { chyby, ubylo: 0 };
  }

  if (stare !== mini) fs.writeFileSync(CIL, mini);
  const { zmeneno } = prepisOdkazy(false);
  const ubylo = zdroj.length - mini.length;
  console.log(`Očištěný stylopis: ${(zdroj.length / 1024).toFixed(1)} kB → `
    + `${(mini.length / 1024).toFixed(1)} kB (o ${(ubylo / 1024).toFixed(1)} kB méně, `
    + `${Math.round(ubylo * 100 / zdroj.length)} %)`
    + (zmeneno ? `, přesměrováno ${zmeneno} stránek` : ''));
  return { chyby: [], ubylo };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { chyby } = spust(process.argv.includes('--kontrola'));
  if (chyby.length) { for (const c of chyby) console.error('::error::' + c); process.exit(1); }
}
