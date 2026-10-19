/* JEDNA STUPNICE ODSTUPŮ.
   Odstupy ve stylopisu byly psané od ruky: 3, 5, 7, 9, 11, 13, 15, 18,
   22, 26, 30, 34, 38, 42, 50, 52 px — osmnáct hodnot mimo jakoukoli
   soustavu, 78 výskytů. Na obrazovce je rozdíl mezi 18 a 20 px
   nepostřehnutelný, ale v hlavě ne: když má odstup libovolnou hodnotu,
   nelze se při psaní stylu o nic opřít a každé nové místo si vymyslí
   vlastní číslo. Proto jedna stupnice, po dvou px dole (kde je rozdíl
   vidět) a po čtyřech a osmi nahoře (kde už ne):

       0  1  2  4  6  8  10  12  14  16  20  24  28  32  40  48  56  64  80  96  128

   1 px je vlasová linka (rámeček, podtržení), ne odstup. Hodnoty uvnitř
   var(--x, 85px) jsou rozměry, ne odstupy — ty se nepočítají, stejně
   jako obsah komentářů.

   Když nový odstup do stupnice nepatří, nepřidávej ho sem — vyber
   nejblizší hodnotu, která tam je. Stupnice má cenu jen potud, pokud se
   nerozšiřuje. */
import { readFileSync, readdirSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

/* PŘÍSNÁ ČTYŘKOVÁ MŘÍŽ. Do 19. 10. stupnice povolovala i 6, 10 a 14 px,
   tedy dvojkový podkrok — a web toho využíval v 575 místech z 1 342.
   Hodnoty se přepsaly na nejbližší násobek čtyř, při remíze DOLŮ
   (6→4, 10→8, 14→12), aby se rozvržení nikde nezvětšilo a nehrozilo
   přetékání na úzkých šířkách. Zůstávají 1 a 2 px: to nejsou odstupy
   rozvržení, ale vlásečnice a mezery mezi slovy v řádku. */
export const STUPNICE = new Set([0, 1, 2, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 128]);
/* UVOZOVKA PATŘÍ MEZI ZAČÁTKY. Zkouška o sobě výš tvrdila, že čte
   i `style="…"`, a nečetla: v `style="margin:6px 0 0"` stojí `margin`
   hned za uvozovkou, ne za `;`, `{` ani mezerou — a vzorek takový
   začátek nedovoloval. Prošla tím dvě místa v pridat.html s 6 px,
   tedy mimo čtyřkovou mříž. První vlastnost v každém atributu byla
   celou dobu neviditelná; druhá a další se měřily. */
const VLASTNOSTI = /(^|[;{\s"'])(margin|padding|gap|row-gap|column-gap)(-top|-right|-bottom|-left)?\s*:\s*([^;}]+)/g;

/* Komentáře a vnitřek var() se vybílí, ale délka zůstane — čísla řádků
   pak ukazují na opravdový řádek v souboru. */
function ocisti(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, s => s.replace(/[^\n]/g, ' '))
    .replace(/var\([^()]*\)/g, s => s.replace(/[^\n]/g, ' '));
}

export function mimoStupnici(text) {
  const bez = ocisti(text);
  const out = [];
  let m;
  VLASTNOSTI.lastIndex = 0;
  while ((m = VLASTNOSTI.exec(bez))) {
    const hodnota = m[4];
    for (const c of hodnota.matchAll(/(-?\d+(?:\.\d+)?)px/g)) {
      const n = Math.abs(parseFloat(c[1]));
      if (STUPNICE.has(n)) continue;
      out.push({ radek: bez.slice(0, m.index).split('\n').length, px: n, kde: (m[2] + (m[3] || '')) + ':' + hodnota.trim().slice(0, 70) });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  /* Stylopis, ruční stránky (vložený styl i style="…") a generátory,
     které HTML vyrábějí. build-og.mjs je venku: kreslí náhled pro
     sdílení 1200×630 px, kde jsou odstupy ve vlastní soustavě a se
     stupnicí stránky nemají co dělat. */
  const JE_VYROBENA = /^(pozemek|pozemky)-/;
  const MIMO = new Set(['build-og.mjs']);
  const soubory = ['css/styles.css'];
  for (const f of readdirSync('.')) if (f.endsWith('.html') && !JE_VYROBENA.test(f)) soubory.push(f);
  for (const f of readdirSync('scripts')) if (f.endsWith('.mjs') && !f.startsWith('test-') && !MIMO.has(f)) soubory.push('scripts/' + f);

  let chyb = 0;
  const zpravy = [];
  for (const f of soubory) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    const n = mimoStupnici(text);
    if (!n.length) continue;
    console.log(`\u2715 ${f}: ${n.length} odstup\u016f mimo stupnici`);
    for (const x of n) console.log(`   ${f}:${x.radek}  ${x.px}px  ${x.kde}`);
    /* Do hl\u00e1\u0161ky pro CI jen prvn\u00ed n\u00e1lez z ka\u017ed\u00e9ho souboru — `::error::`
       je jedno\u0159\u00e1dkov\u00fd a jm\u00e9no souboru s \u010d\u00edslem \u0159\u00e1dku sta\u010d\u00ed k nalezen\u00ed. */
    zpravy.push(`\u2715 ${f}: ${n.length} mimo stupnici\n   ${f}:${n[0].radek} ${n[0].px}px`);
    chyb += n.length;
  }
  if (chyb) {
    console.log(`\nMimo stupnici: ${chyb}. Vyber nejbli\u017e\u0161\u00ed hodnotu ze stupnice, neroz\u0161i\u0159uj ji.`);
    console.error(`::error::Odstupy: ${chyb} mimo stupnici.` + pricinaChyb(zpravy));
    process.exit(1);
  }
  console.log(`Jedna stupnice odstup\u016f dr\u017e\u00ed: ${soubory.length} souborů, ${STUPNICE.size} dovolených hodnot.`);
}
