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
const JS_MIN = path.join(KOREN, 'js', 'min');

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

/* ---------------- SKRIPTY ----------------------------------------
   V js/*.js je 980,8 kB a 397,2 kB z toho (40 %) jsou komentáře. Úvodní
   stránka si načítá 759 kB skriptů; i když jsou odložené (defer), musí
   se stáhnout, rozparsovat a spustit.

   JAK SE TO LIŠÍ OD STYLOPISU. U CSS šlo zahodit i mezery. U JavaScriptu
   NE: jazyk dopisuje středníky na konec řádku sám (ASI), takže slepit
   dva řádky k sobě může změnit význam, aniž by to kdekoli spadlo.
   Řádky proto zůstávají; odstraňují se KOMENTÁŘE a nic jiného. Je to
   méně, ale je to bezpečné — a komentářů je tu tolik, že to stačí.

   NEJTĚŽŠÍ ČÁST NENÍ KOMENTÁŘ, ALE LOMÍTKO. V js/ je 3 319 lomítek a
   skript nemůže vědět, jestli je to dělení (a / b), nebo začátek
   regulárního výrazu (/a+/). Rozhoduje se podle posledního významného
   znaku: po jménu, číslu, „)", „]" je to dělení, jinak regulární výraz.
   Chyba v tom rozhodnutí by vedla k tomu, že se část kódu vezme za
   text — tedy přesně to, co se mi stalo u CSS s url(%23z). Proto se
   výsledek POROVNÁVÁ: scripts/test-minifikace.mjs rozebere zdroj i
   očištěnou kopii na posloupnost tokenů a ty se musí rovnat.

   Šablonové literály přes víc řádků by byly další past (řádek v nich
   smí začínat „//" a není to komentář). Naměřeno: v js/ není ani jeden
   takový. Kopírují se přesto celé, včetně vnořených ${…}. */
const JS_DIR = path.join(KOREN, 'js');

/* Lomítko je buď dělení, nebo začátek regulárního výrazu. Rozhoduje
   předchozí token: po hodnotě (`a`, `)`, `]`, číslu) je to dělení, jinak
   vzor. Jen „předchozí znak" nestačí — `return /^a/` končí na `n`, tedy
   na znaku hodnoty, a vzor by se přečetl jako dělení. V js/ takové
   místo je (pridat.js: `return /^image\/(…)$/i`) a jeho zpětné lomítko
   pak spustí hledání vzoru o pár znaků dál. Dneska to vyjde náhodou;
   stačil by apostrof uvnitř vzoru a zbytek souboru by se přečetl jako
   text. Proto se kontroluje i ocásek rozepsaného kódu. */
const KLICOVA = /(?:^|[^A-Za-z0-9_$])(?:return|typeof|instanceof|case|in|of|new|delete|void|throw|do|else|yield|await)$/;

function regexMozny(predchozi, kod = '') {
  if (!predchozi) return true;
  if (!/[A-Za-z0-9_$)\]]/.test(predchozi)) return true;
  return KLICOVA.test(kod.replace(/\s+$/, ''));
}

/** Rozebere JavaScript na kusy. Komentáře vrací zvlášť, ať se dají zahodit. */
export function kusyJs(src) {
  const kusy = [];
  let i = 0; const n = src.length;
  let predchozi = '';
  let text = '';
  const uloz = () => { if (text) { kusy.push({ druh: 'kod', text }); text = ''; } };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      uloz();
      const k = src.indexOf('*/', i + 2);
      const konec = k < 0 ? n : k + 2;
      kusy.push({ druh: 'blok', text: src.slice(i, konec) });
      i = konec; continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      uloz();
      let k = src.indexOf('\n', i);
      if (k < 0) k = n;
      kusy.push({ druh: 'radek', text: src.slice(i, k) });
      i = k; continue;
    }
    if (c === '"' || c === "'") {
      uloz();
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j++; break; }
        j++;
      }
      kusy.push({ druh: 'text', text: src.slice(i, j) });
      predchozi = '"'; i = j; continue;
    }
    if (c === '`') {
      uloz();
      let j = i + 1, hloubka = 0;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (hloubka === 0 && src[j] === '`') { j++; break; }
        if (src[j] === '$' && src[j + 1] === '{') { hloubka++; j += 2; continue; }
        if (hloubka > 0 && src[j] === '{') { hloubka++; j++; continue; }
        if (hloubka > 0 && src[j] === '}') { hloubka--; j++; continue; }
        j++;
      }
      kusy.push({ druh: 'sablona', text: src.slice(i, j) });
      predchozi = '`'; i = j; continue;
    }
    if (c === '/' && regexMozny(predchozi, text)) {
      /* ULOŽIT ROZEPSANÝ KÓD DŘÍV, NEŽ SE PŘIDÁ VZOR. Napoprvé tu
         uloz() chybělo, takže se rozepsaný kus kódu uložil TEPRVE po
         vzorku — a výstup měl regulární výraz přesunutý před argument:
         z `String(x).replace(/^#/, '')` vzniklo `String(x)/^#/.replace(, '')`.
         Chytla to kontrola tokenů a node --check; samo by to tiše
         rozbilo 49 z 51 souborů. */
      let j = i + 1, vHranatych = false, ok = false;
      while (j < n) {
        const z = src[j];
        if (z === '\\') { j += 2; continue; }
        if (z === '\n') break;                 // regulární výraz řádek nepřekročí
        if (z === '[') vHranatych = true;
        else if (z === ']') vHranatych = false;
        else if (z === '/' && !vHranatych) { j++; ok = true; break; }
        j++;
      }
      if (ok) {
        while (j < n && /[a-z]/.test(src[j])) j++;   // příznaky (gimsuy)
        uloz();
        kusy.push({ druh: 'vzor', text: src.slice(i, j) });
        predchozi = '/'; i = j; continue;
      }
    }
    text += c;
    if (!/\s/.test(c)) predchozi = c;
    i++;
  }
  uloz();
  return kusy;
}

export function ocistiJs(src) {
  let out = '';
  for (const k of kusyJs(src)) {
    if (k.druh === 'blok') {
      /* Blokový komentář uprostřed řádku nesmí slepit kód: `a/* x *\/b`.
         Na vlastním řádku se ale nahradit mezerou nemá — zůstal by
         prázdný řádek navíc. Rozliší se podle toho, co po něm jde. */
      out += k.text.includes('\n') ? '\n' : ' ';
    } else if (k.druh === 'radek') {
      /* Konec řádku se NEMAŽE: bez něj by se další řádek slepil
         s tímhle a ASI by dopsala středník jinam. */
    } else {
      out += k.text;
    }
  }
  return out
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\n/, '');
}

/* Odkazy ve stránkách. Mění se jen to, co existuje — stránky, které
   stylopis schválně nenačítají (diagnostika, 404), zůstanou být. */
function prepisOdkazy(kontrolaJen) {
  const stranky = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
  const VZOR = /((?:href|src)=")css\/styles\.css((?:\?v=[A-Za-z0-9]+)?")/g;
  /* U skriptů se mění jen adresář: js/auth.js → js/min/auth.js. Jméno
     zůstává: testy podstrkují js/config.js vzorkem na JMÉNO souboru,
     ne na celou cestu, a hlavně se podle jména hledá chyba.
     Skupina jména nesmí obsahovat tečku, takže už přepsaný odkaz
     (js/min/auth.js) se nechytne znovu — přepis je opakovatelný. */
  const VZOR_JS = /((?:href|src)=")js\/([A-Za-z0-9_-]+)\.js((?:\?v=[A-Za-z0-9]+)?")/g;
  const jeMin = (jmeno) => fs.existsSync(path.join(JS_MIN, jmeno + '.js'));
  let zmeneno = 0;
  const nezmenene = [];
  for (const f of stranky) {
    const cesta = path.join(KOREN, f);
    const s = fs.readFileSync(cesta, 'utf8');
    const novy = s
      .replace(VZOR, `$1${CIL_REL}$2`)
      .replace(VZOR_JS, (celek, pre, jmeno, post) =>
        (jeMin(jmeno) ? `${pre}js/min/${jmeno}.js${post}` : celek));
    if (novy === s) continue;
    if (kontrolaJen) { nezmenene.push(f); continue; }
    fs.writeFileSync(cesta, novy);
    zmeneno++;
  }
  return { zmeneno, nezmenene };
}

/* Očištěné kopie skriptů. Zdroje v js/ se nemění — jen se vedle nich
   do js/min/ staví kopie bez komentářů, na kterou odkazují stránky.
   Naměřeno: js/ má 982 kB, z toho 412 kB komentářů; přes drát (brotli)
   329 kB proti 162 kB, tedy o 51 % méně. Domovská stránka sama tahá
   deset z těch souborů. */
function minifikujJs(kontrolaJen) {
  const zdroje = fs.readdirSync(path.join(KOREN, 'js'))
    .filter((f) => f.endsWith('.js') && !f.endsWith('.min.js')).sort();
  const chyby = [];
  let pred = 0, po = 0, zapsano = 0;
  if (!kontrolaJen) fs.mkdirSync(JS_MIN, { recursive: true });
  for (const f of zdroje) {
    const src = fs.readFileSync(path.join(KOREN, 'js', f), 'utf8');
    const out = ocistiJs(src);
    pred += Buffer.byteLength(src); po += Buffer.byteLength(out);
    const cil = path.join(JS_MIN, f);
    const stare = fs.existsSync(cil) ? fs.readFileSync(cil, 'utf8') : null;
    if (stare === out) continue;
    if (kontrolaJen) { chyby.push(`js/min/${f} neodpovídá js/${f}`); continue; }
    fs.writeFileSync(cil, out);
    zapsano++;
  }
  /* Zdroj smazán, kopie zůstala — stránka by pak stahovala mrtvý kód. */
  const zbytecne = fs.existsSync(JS_MIN)
    ? fs.readdirSync(JS_MIN).filter((f) => f.endsWith('.js') && !zdroje.includes(f))
    : [];
  for (const f of zbytecne) {
    if (kontrolaJen) chyby.push(`js/min/${f} nemá zdroj v js/`);
    else fs.unlinkSync(path.join(JS_MIN, f));
  }
  return { chyby, pred, po, zapsano, kolik: zdroje.length };
}

export function spust(kontrolaJen = false) {
  const zdroj = fs.readFileSync(ZDROJ, 'utf8');
  const mini = ocisti(zdroj);
  const stare = fs.existsSync(CIL) ? fs.readFileSync(CIL, 'utf8') : null;

  if (kontrolaJen) {
    const js = minifikujJs(true);
    const { nezmenene } = prepisOdkazy(true);
    const chyby = [...js.chyby];
    if (stare !== mini) chyby.push('css/styles.min.css neodpovídá css/styles.css');
    if (nezmenene.length) {
      chyby.push(`${nezmenene.length} stránek odkazuje na neočištěný zdroj: `
        + nezmenene.slice(0, 3).join(', '));
    }
    return { chyby, ubylo: 0 };
  }

  if (stare !== mini) fs.writeFileSync(CIL, mini);
  const js = minifikujJs(false);
  const { zmeneno } = prepisOdkazy(false);
  const ubylo = zdroj.length - mini.length;
  console.log(`Očištěný stylopis: ${(zdroj.length / 1024).toFixed(1)} kB → `
    + `${(mini.length / 1024).toFixed(1)} kB (o ${(ubylo / 1024).toFixed(1)} kB méně, `
    + `${Math.round(ubylo * 100 / zdroj.length)} %)`
    + (zmeneno ? `, přesměrováno ${zmeneno} stránek` : ''));
  console.log(`Očištěné skripty: ${js.kolik} souborů, ${(js.pred / 1024).toFixed(1)} kB → `
    + `${(js.po / 1024).toFixed(1)} kB (o ${Math.round((js.pred - js.po) * 100 / js.pred)} % méně)`
    + (js.zapsano ? `, přepsáno ${js.zapsano}` : ''));
  return { chyby: [], ubylo };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { chyby } = spust(process.argv.includes('--kontrola'));
  if (chyby.length) { for (const c of chyby) console.error('::error::' + c); process.exit(1); }
}
