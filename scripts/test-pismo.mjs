/* JEDNA STUPNICE PÍSMA.
   ==================================================================
   Stejná nemoc jako u odstupů, jen o patro výš: velikosti písma byly
   psané od ruky. Naměřeno před opravou — 10, 11, 12, 13, 14, 15, 16,
   17, 18, 20, 22, 24, 26, 28, 30, 32, 38, 40, 44, 58 px, tedy DVACET
   velikostí na jednom webu, k tomu pět tlouštěk (400–800). Majitel
   webu: „celý web je blbě rozházený, věci mají různou velikost, druh
   textu — celé to musíš sjednotit."
   Má pravdu i měřitelně: rozdíl mezi 15 a 16 px nikdo nevidí, ale
   v hlavě ano. Když má velikost libovolnou hodnotu, není se při psaní
   stylu o co opřít a každé nové místo si vymyslí vlastní číslo —
   a vedle sebe pak stojí dva nadpisy, dvě ceny a dva popisky, každý
   o chlup jiný. Přesně to na obrazovce vypadá „rozházeně".

   STUPNICE. Dole po jednom pixelu (tam je rozdíl vidět a drobné písmo
   se jinak odstupňovat nedá), nahoře po čtyřech a osmi:

       11  12  13  14  16  18  20  24  28  32  40  48  56  64  80  96

   TLOUŠŤKY. Čtyři, ne pět: 400 (text), 500 (tišší popisek), 600
   (důraz), 700 (nadpis a tlačítko). Osmistovka vedle sedmistovky
   nevypadá jako jiný důraz, ale jako jiné písmo.

   DRUH PÍSMA. Jeden — Inter, ve čtyřech tokenech (--font-ui,
   --font-display, --font-nadpis, --font-popisek), které ukazují na
   totéž; čtvrtý se do 29. 10. jmenoval --font-mono, což bylo jméno
   o písmu, jaké web nemá (§216). Natvrdo
   psaná rodina do pravidla nepatří: příště by se rozešly.

   Když nová velikost do stupnice nepatří, nepřidávej ji sem — vyber
   nejbližší, která tam je. Stupnice má cenu jen potud, pokud se
   nerozšiřuje. */
import { readFileSync, readdirSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

export const STUPNICE = new Set([11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96]);
export const TLOUSTKY = new Set(['400', '500', '600', '700', 'inherit', 'normal', 'bold']);
/* VŠECHNY ČTYŘI TOKENY MÍŘÍ NA INTER.
   --font-ui, --font-display, --font-mono i --font-nadpis ukazují na
   totéž: to nejsou čtyři hlasy, ale čtyři jména jednoho. Jména
   zůstávají, protože říkají ZÁMĚR (čím je ten text) a dovolují
   jednou provždy vyměnit jen jedno z nich.
   Systémový serif na nadpisech (19.–26. 10.) se vrátil: vycházel
   jinak na každém zařízení a stránka pozemku ho stejně přebíjela
   třídou z JavaScriptu, takže web mluvil dvěma hlasy. Důvod je
   v css/styles.css u definice --font-nadpis.
   Pravidlo „rodina patří do tokenu, ne do pravidla" platí dál. */
/* A JEDNA STRÁNKA SI RODINU PSÁT MUSÍ. 404.html schválně nenačítá
   css/styles.css (má vyjít i tehdy, když ostatní soubory chybí), takže
   v ní nejsou tokeny k mání: `var(--font-ui)` by byla nedefinovaná
   proměnná a deklarace by se zahodila. Povolená je proto rodina
   vypsaná přesně tak, jak stojí v paletce. */
/* A JEDNO MÍSTO CHCE PÍSMO, KTERÉ WEB JINAK NEMÁ: výpis kódu
   v diagnostika.html (`code` a `pre`). Strojopis je tam jediný důvod,
   proč se ten text sází jinak než zbytek — ve sloupci znaků se pozná
   mezera i nula. Stránka navíc paletku nenačítá (viz výš), takže by
   jí token stejně nic nevrátil. Do 29. 10. tam stálo
   `var(--font-mono)`: token, který se tak jmenoval, ale ukazoval na
   Inter, a na téhle stránce nebyl definovaný vůbec — výpisy se tedy
   kreslily obyčejným písmem. Dnes je tam strojopis vypsaný a token se
   jmenuje --font-popisek, podle toho, co doopravdy dělá (§216). */
const STROJOPIS = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const RODINY = /^(var\(--font-(ui|display|popisek|nadpis)\)|inherit|'Inter',?.*)$/;

/* Komentáře se vybílí, ale délka zůstane — čísla řádků pak ukazují na
   opravdový řádek v souboru. Na rozdíl od odstupů se vnitřek var()
   nebílí: `font-size:var(--h1-stranka)` je v pořádku a projde
   rovnou, kdežto `var(--x, 15px)` by měl propadnout. */
function ocisti(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, s => s.replace(/[^\n]/g, ' '));
}

export function mimoStupnici(text, soubor = '') {
  const bez = ocisti(text);
  const out = [];
  const radek = (i) => bez.slice(0, i).split('\n').length;
  for (const m of bez.matchAll(/(^|[;{\s])font-size\s*:\s*([^;}"']+)/g)) {
    const hodnota = m[2].trim();
    for (const c of hodnota.matchAll(/(\d+(?:\.\d+)?)px/g)) {
      const n = parseFloat(c[1]);
      if (STUPNICE.has(n)) continue;
      out.push({ radek: radek(m.index), co: `font-size: ${hodnota.slice(0, 60)}`, proc: `${n}px není na stupnici` });
    }
  }
  /* Tokeny --h1-* jsou taky velikosti písma, jen pojmenované. Bez
     tohohle by stupnici obešly: „font-size:var(--h1-stranka)" projde
     a číslo si token nese sám. */
  for (const m of bez.matchAll(/(^|[;{\s])(--h1-[a-z-]+)\s*:\s*([^;}"']+)/g)) {
    for (const c of m[3].matchAll(/(\d+(?:\.\d+)?)px/g)) {
      const n = parseFloat(c[1]);
      if (STUPNICE.has(n)) continue;
      out.push({ radek: radek(m.index), co: `${m[2]}: ${m[3].trim().slice(0, 50)}`, proc: `${n}px není na stupnici` });
    }
  }
  for (const m of bez.matchAll(/(^|[;{\s])font-weight\s*:\s*([^;}"']+)/g)) {
    const h = m[2].trim();
    /* Rozsah proměnlivého řezu v @font-face („400 800") je deklarace
       písma, ne tloušťka textu — ten se tu neposuzuje. */
    if (/^\d+\s+\d+$/.test(h)) continue;
    if (TLOUSTKY.has(h)) continue;
    out.push({ radek: radek(m.index), co: `font-weight: ${h.slice(0, 40)}`, proc: 'tloušťka není ze čtyř povolených' });
  }
  /* UVOZOVKY SE ČÍST MUSÍ. Vzor si tu dřív zakazoval ' i " — jenže
     rodina běžně uvozovkami ZAČÍNÁ ('Inter','Helvetica Neue',…), takže
     se na takovém zápisu vůbec neshodl a tiše ho pouštěl; a u zápisu
     Georgia,'Times New Roman',… se naopak shodl jen na „Georgia," a
     hlásil chybu, která žádná nebyla. Čte se proto celá hodnota. */
  for (const m of bez.matchAll(/(^|[;{\s])font-family\s*:\s*([^;}]+)/g)) {
    const h = m[2].trim();
    if (RODINY.test(h)) continue;
    if (h === STROJOPIS && /diagnostika\.html$/.test(soubor)) continue;
    out.push({ radek: radek(m.index), co: `font-family: ${h.slice(0, 60)}`, proc: 'rodina patří do tokenu, ne do pravidla' });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const JE_VYROBENA = /^(pozemek|pozemky)-/;
  const MIMO = new Set(['build-og.mjs']);
  /* VŠECHNY ZDROJOVÉ STYLOPISY, NE JEN STYLES.CSS. Do 26. 10. tu stál
     jeden název napsaný ručně — a css/pozemek-vlozeny.css (620 řádků,
     62 velikostí písma), který se vkládá do 2 268 stránek pozemků, do
     hlídače nikdy nespadl. Seznam se proto čte z adresáře; .min.css
     jsou výrobky kroku rozdel-styly.mjs, ty se nehlídají (hlídá se to,
     z čeho vznikly). Přibude-li třetí stylopis, chytí se sám. */
  const soubory = readdirSync('css')
    .filter((f) => f.endsWith('.css') && !f.endsWith('.min.css'))
    .map((f) => 'css/' + f);
  for (const f of readdirSync('.')) if (f.endsWith('.html') && !JE_VYROBENA.test(f)) soubory.push(f);
  for (const f of readdirSync('scripts')) if (f.endsWith('.mjs') && !f.startsWith('test-') && !MIMO.has(f)) soubory.push('scripts/' + f);

  let chyb = 0;
  const zpravy = [];

  /* VELKÝ NADPIS MÁ JEDEN HLAS — A PŘEBÍT SE NESMÍ.
     19. 10. dostaly nadpisy serif pravidlem na `h1`. O pět dní starší
     `.add-hero h1` ale rodinu nastavovalo samo, a protože je
     o třídu specifičtější, drželo se. Naměřeno na 27 ručně psaných
     stránkách: OSM mělo titulek serifem a DEVATENÁCT bezpatkově —
     všechny rádcovské články, právní stránky i „Přidat pozemek".
     Rozhodovalo přitom jen to, kterou třídu hlavičky stránka náhodou
     používá.
     Čte se zápis, ne vykreslení: hledá se pravidlo, které cílí na h1
     a zároveň si nastavuje vlastní rodinu. Takové pravidlo je vždycky
     specifičtější než holé `h1`, takže ho přebije — ať už je kdekoli.

     DVĚ SLEPÁ MÍSTA, ZALEPENÁ 26. 10.
     1) Hledalo se jen v css/styles.css. Stránka pozemku má vlastní
        vložený stylopis (css/pozemek-vlozeny.css) a ten se nečetl.
     2) Hledal se SELEKTOR se slovem `h1`. Jenže nadpis stránky pozemku
        vzniká až v prohlížeči: js/pozemek.js píše `<h1 class="pz-place">`,
        takže pravidlo, které h1 přebíjí, se jmenuje `.pz-place` a slovo
        „h1" v něm není. Našlo se tak 2 268 stránek s nadpisem, který si
        rodinu bral z --font-ui. Třídy, které na h1 sází JavaScript nebo
        značky, se proto nejdřív vyčtou ze zdrojů a berou se jako h1. */
  {
    const NA_H1 = new Set();
    for (const f of ['index.html', ...readdirSync('js').filter((x) => x.endsWith('.js')).map((x) => 'js/' + x)]) {
      let t; try { t = readFileSync(f, 'utf8'); } catch { continue; }
      for (const m of t.matchAll(/<h1[^>]*class=["']([^"']+)["']/g))
        for (const c of m[1].split(/\s+/)) if (c) NA_H1.add(c);
    }
    const jeH1 = (sel) => /(^|[\s>+~,])h1\b/.test(sel)
      || [...NA_H1].some((c) => new RegExp('\\.' + c + '(?![\\w-])').test(sel));
    const prebiji = [];
    for (const soubor of soubory.filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(soubor, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim(), telo = m[2];
      if (!jeH1(sel)) continue;
      if (/^\s*h1\s*$/.test(sel)) continue;          // samotné `h1` je ten zdroj pravdy
      const ff = telo.match(/font-family\s*:\s*([^;}]+)/);
      if (!ff) continue;
      if (/--font-nadpis/.test(ff[1])) continue;
      prebiji.push(`${soubor}: ${sel.slice(0, 60)} → ${ff[1].trim().slice(0, 40)}`);
    }
    }
    if (prebiji.length) {
      console.log(`✕ ${prebiji.length}× se nadpisu h1 přebíjí rodina písma`);
      for (const x of prebiji) console.log('   ' + x);
      zpravy.push(`  ✕ rodinu h1 přebíjí: ${prebiji[0]}`);
      chyb += prebiji.length;
    } else {
      console.log('✓ rodinu velkého nadpisu nikdo nepřebíjí');
    }
  }

  for (const f of soubory) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    const n = mimoStupnici(text, f);
    if (!n.length) continue;
    console.log(`✕ ${f}: ${n.length} mimo stupnici písma`);
    for (const x of n) console.log(`   ${f}:${x.radek}  ${x.co}   (${x.proc})`);
    zpravy.push(`  ✕ ${f}:${n[0].radek} ${n[0].co}`);
    chyb += n.length;
  }
  if (!chyb) console.log('✓ velikosti, tloušťky i rodiny písma drží jednu stupnici');
  console.log(`\n${chyb ? chyb + ' mimo stupnici' : 'vše v pořádku'}\n`);
  if (chyb) {
    console.log('::error::Písmo: ' + chyb + ' deklarací mimo stupnici.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}
