#!/usr/bin/env node
/* KDO SE O NÁVŠTĚVĚ DOZVÍ — a jestli je to napsané
   ==================================================================
   Každý cizí server, ze kterého si stránka sama něco stáhne, dostane IP
   adresu návštěvníka. Ne proto, že by o ni někdo žádal — prohlížeč ji
   pošle s každým požadavkem. V zásadách soukromí proto musí stát, komu
   se údaje mohou dostat; jinak ten dokument neříká pravdu.

   Takhle to prasklo: zásady jmenovaly Google Fonts a tvrdily, že se
   Googlu „při každém načtení předá vaše IP adresa". Jenže písma se
   přestěhovala do složky fonts/ na vlastní server, takže se Googlu
   nepředávalo nic — zásady strašily něčím, co se nedělo.
   A naopak: podklad mapy se stahuje z Esri (letecký snímek, výchozí
   vrstva!) a z OpenStreetMap, čímž oba dostanou IP adresu i to, na
   kterou část mapy se člověk kouká. Ani jeden z nich v zásadách nebyl.
   Vada, která se nedá vidět ani vyzkoušet klikáním: je to rozdíl mezi
   dokumentem a kódem.

   Kontroluje se to v OBOU směrech:
     1. Každý cizí server, ze kterého se něco stahuje, musí být
        v zásadách jmenovaný (nebo zapsaný níž jako výjimka s důvodem).
     2. Server, který zásady jmenují jako zpracovatele kvůli stahování,
        se opravdu musí někde stahovat — jinak zásady slibují obavu,
        která neplatí.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Vlastní domény. Z nich se nic „cizímu" nepředává. */
const SVOJE = /(?:^|\.)parcelaka\.cz$/;

/* ODKAZY, NE STAHOVÁNÍ. Server, na který se jen odkazuje (člověk na něj
   musí kliknout), žádnou IP sám od sebe nedostane — zásady ho tedy
   jmenovat nemusí. Píše se sem s důvodem, protože mlčení by znamenalo,
   že se tudy dá protlačit i skutečné stahování. */
const JEN_ODKAZ = new Map([
  ['www.openstreetmap.org', 'odkaz na licenci v uvedení autorství pod mapou (člověk musí kliknout)'],
  ['uoou.gov.cz', 'odkaz na dozorový úřad v zásadách soukromí'],
  ['www.uoou.gov.cz', 'odkaz na dozorový úřad v zásadách soukromí'],
  ['creativecommons.org', 'odkaz na text licence'],
  ['opendatacommons.org', 'odkaz na text licence'],
  ['www.bezrealitky.cz', 'odkaz na původní inzerát u nabídky'],
  ['bezrealitky.cz', 'odkaz na původní inzerát u nabídky'],
  ['www.okdrazby.cz', 'odkaz na dražební vyhlášku'],
  ['okdrazby.cz', 'odkaz na dražební vyhlášku'],
  ['exdrazby.cz', 'odkaz na dražební vyhlášku'],
  ['www.exdrazby.cz', 'odkaz na dražební vyhlášku'],
  ['www.elektronickedrazby.cz', 'odkaz na dražební vyhlášku'],
  ['www.drazbystupka.cz', 'odkaz na dražební vyhlášku'],
  ['spu.gov.cz', 'odkaz na nabídky Státního pozemkového úřadu'],
  ['www.spu.gov.cz', 'odkaz na nabídky Státního pozemkového úřadu'],
  ['nahlizenidokn.cuzk.cz', 'odkaz do katastru na ověření'],
  ['www.cuzk.cz', 'odkaz do katastru'],
  ['cuzk.cz', 'odkaz do katastru'],
  ['sgi-nahlizenidokn.cuzk.cz', 'odkaz do katastru'],
  ['mapy.cz', 'odkaz na mapu'],
  ['www.google.com', 'odkaz (vyhledávání, mapy)'],
  ['maps.google.com', 'odkaz na mapu'],
  ['github.com', 'odkaz na zdrojový kód'],
  ['www.sreality.cz', 'odkaz na původní inzerát'],
  ['sreality.cz', 'odkaz na původní inzerát'],
  ['www.portaldrazeb.cz', 'odkaz na portál dražeb u nabídky'],
  ['www.ikatastr.cz', 'odkaz do mapy katastru na ověření'],
  ['ikatastr.cz', 'odkaz do mapy katastru na ověření'],
  ['www.uredni-deska.cz', 'odkaz na úřední desku obce'],
  ['search.seznam.cz', 'odkaz „dohledat na Seznamu" u nabídky bez odkazu'],
  ['maps.apple.com', 'odkaz na navigaci pro ty, kdo mají Apple Maps'],
  /* NENÍ TO SERVER, JE TO JMÉNO. http://www.w3.org/2000/svg je jmenný
     prostor SVG uvnitř značky <svg>; prohlížeč na tu adresu nikdy
     nejde. Kdyby se to bralo za stahování, zásady by musely jmenovat
     W3C jako zpracovatele — a to by byl nesmysl, který by lidi jen
     pletl. */
  ['www.w3.org', 'jmenný prostor SVG a XLink ve značkách, ne stahování'],
  /* Totéž u vývozu bodů do navigace: http://www.topografix.com/GPX/1/1
     je jmenný prostor formátu GPX, který musí stát v hlavičce souboru,
     aby ho navigace přečetla. Soubor se skládá v prohlížeči a nikam se
     neposílá — ta adresa se nenačte ani při jeho otevření v Mapy.cz. */
  ['www.topografix.com', 'jmenný prostor formátu GPX v hlavičce souboru, ne stahování'],
]);

/* Zdroje, které se čtou: ručně psané stránky, všechny skripty a styly.
   Generované stránky pozemků a okresů se neberou — jsou ze šablon,
   které tu jsou, a 2 000 souborů by kontrolu jen zpomalilo. */
const JE_GENEROVANA = (f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f)
  || f.startsWith('pozemky-okres-') || /-kraj\.html$/.test(f);

const soubory = [];
for (const f of fs.readdirSync(ROOT)) {
  if (f.endsWith('.html') && !JE_GENEROVANA(f)) soubory.push(f);
}
for (const d of ['js', 'css']) {
  for (const f of fs.readdirSync(path.join(ROOT, d))) {
    if (/\.(js|css)$/.test(f)) soubory.push(path.join(d, f));
  }
}
pravda(`našly se zdroje k prohledání (${soubory.length})`, soubory.length > 40,
  `souborů ${soubory.length}`);

/* Komentáře pryč. V css/styles.css stojí v komentáři vysvětlení, že se
   písma dřív brala z fonts.googleapis.com — a kontrola by z toho udělala
   nenapsaného zpracovatele. Je to táž past jako u hlídače zařazení
   zkoušek, který hlásil chybu na sám sebe. */
const bezKomentaru = (t) => t
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

/* Hostitelé, ze kterých se STAHUJE. V HTML se berou jen načítané prvky
   (script, link, img, iframe, url() ve stylu) — <a href> je odkaz.
   V JS a CSS se bere KAŽDÁ adresa v textu: adresa dlaždic se skládá
   z proměnné (ZDROJ + '{z}/{y}/{x}'), takže vzorek hledající „{z}"
   vedle hostitele by letecký snímek od Esri vůbec neviděl — a právě ten
   v zásadách chyběl. Kdo je v JS jen odkaz, patří do JEN_ODKAZ výš. */
const stahovane = new Map();
const vsechny = new Map();
function pridej(mapa, host, f) {
  if (!host || SVOJE.test(host)) return;
  if (!mapa.has(host)) mapa.set(host, new Set());
  mapa.get(host).add(f);
}
for (const f of soubory) {
  const surovy = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const t = bezKomentaru(surovy);
  const jeHtml = f.endsWith('.html');
  for (const m of t.matchAll(/https?:\/\/([^/"'`\s)>]+)/g)) pridej(vsechny, m[1], f);
  if (jeHtml) {
    for (const m of t.matchAll(/<(?:script|img|iframe|source|video|audio)\b[^>]*?\bsrc\s*=\s*["']https?:\/\/([^/"']+)/g)) pridej(stahovane, m[1], f);
    for (const m of t.matchAll(/<link\b[^>]*?\bhref\s*=\s*["']https?:\/\/([^/"']+)/g)) pridej(stahovane, m[1], f);
    for (const m of t.matchAll(/url\(\s*["']?https?:\/\/([^/"')]+)/g)) pridej(stahovane, m[1], f);
  } else {
    for (const m of t.matchAll(/https?:\/\/([^/"'`\s)>]+)/g)) pridej(stahovane, m[1], f);
  }
}
/* MAPOVÉ VRSTVY LEŽÍ V DATECH, NE V KÓDU — a tím se téhle kontrole
   schovaly. Adresy služeb (katastr, územní plán, záplavy, bonita půdy,
   ochrana přírody) jsou schválně v data/mapove-vrstvy.json, aby se daly
   opravit bez zásahu do skriptu; jenže kontrola četla jen js/ a html,
   takže pět úředních serverů, na které prohlížeč chodí, v zásadách
   ochrany údajů chybělo. A nechodí se na ně až po zapnutí přepínače:
   js/mapove-vrstvy.js si z KAŽDÉ služby stáhne zkušební dlaždici hned,
   jak se mapa pozemku postaví — tedy i když vrstvu nikdo nezapne. */
{
  const nast = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'mapove-vrstvy.json'), 'utf8'));
  let adres = 0;
  for (const v of nast.vrstvy || []) {
    for (const sl of v.sluzby || []) {
      const m = /^https?:\/\/([^/"'\s)>]+)/.exec(sl.url || '');
      if (!m) continue;
      adres++;
      pridej(vsechny, m[1], 'data/mapove-vrstvy.json');
      pridej(stahovane, m[1], 'data/mapove-vrstvy.json');
    }
  }
  pravda(`mapové vrstvy mají adresy služeb (${adres}) — jinak se o nich nic nekontroluje`,
    adres >= 5, `adres ${adres}`);
}

pravda(`a nějaké cizí adresy v nich jsou (${vsechny.size}) — jinak se nic nekontroluje`,
  vsechny.size >= 3, `cizích adres ${vsechny.size}`);

const zasady = fs.readFileSync(path.join(ROOT, 'ochrana-udaju.html'), 'utf8');
/* Hledá se jméno hostitele i jeho „holá" podoba bez {s}. a www., aby
   stačilo zásadám psát tile.openstreetmap.org a ne všechny tři
   a./b./c. varianty. */
const jmenovany = (host) => {
  const holy = host.replace(/^\{s\}\./, '').replace(/^[a-c]\.tile\./, 'tile.').replace(/^www\./, '');
  if (zasady.includes(host) || zasady.includes(holy)) return true;
  /* Zásady smějí jmenovat SLUŽBU, ne jen server: „Supabase" je lidsky
     čitelnější než tcinuzftgmkvjjgvadky.supabase.co, a to jméno se navíc
     u změně projektu nemění. Bere se druhá úroveň domény jako slovo. */
  const c = holy.split('.');
  const slovo = c.length >= 2 ? c[c.length - 2] : holy;
  return slovo.length >= 4 && new RegExp(slovo, 'i').test(zasady);
};

const nenapsani = [...stahovane.keys()].filter((h) => !jmenovany(h) && !JEN_ODKAZ.has(h));
pravda('každý cizí server, ze kterého se stahuje, je v zásadách jmenovaný',
  nenapsani.length === 0,
  nenapsani.map((h) => `${h} (${[...stahovane.get(h)].slice(0, 2).join(', ')})`).join('; '));

/* Druhý směr: výjimka „jen odkaz" se nesmí psát na server, ze kterého
   se doopravdy stahuje. Jinak by stačilo kterýkoli nenapsaný server
   dopsat do výjimek a kontrola by mlčela. */
const vyjimkaAleStahuje = [...JEN_ODKAZ.keys()].filter((h) => {
  const kde = stahovane.get(h);
  if (!kde) return false;
  /* V JS se bere každá adresa, takže odkaz v textu (uvedení autorství)
     se tu objeví taky. Za stahování se bere jen adresa, která v HTML
     visí na načítaném prvku, nebo v JS stojí v šabloně dlaždic či
     ve fetch(). */
  for (const f of kde) {
    const t = bezKomentaru(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    const u = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`https?://${u}[^"'\`]*\\{[zxys]\\}`).test(t)) return true;
    if (new RegExp(`<(?:script|img|iframe|link)\\b[^>]*?https?://${u}`).test(t)) return true;
    /* VYJMENOVÁVAT NAČÍTACÍ FUNKCE NESTAČÍ. Napoprvé se tu hledalo jen
       fetch( — a knihovna z cdn.jsdelivr.net se bere přes loadScript(),
       takže se dala schovat do výjimek „jen odkaz" a kontrola mlčela
       (sabotáž prošla). Rozhoduje proto PŘÍPONA: co končí na .js, .css,
       .json, .png nebo .woff2, není odkaz, na který se kliká, ale soubor,
       který si prohlížeč stáhne sám. */
    if (new RegExp(`https?://${u}[^"'\`\\s)]*\\.(?:js|mjs|css|json|png|jpe?g|webp|svg|woff2?|wasm)\\b`).test(t)) return true;
    if (new RegExp(`(?:fetch|loadScript|nactiSkript|import)\\(\\s*["'\`]?https?://${u}`).test(t)) return true;
    /* Dlaždicové služby se poznají cestou, protože jejich adresa se
       často skládá z proměnné a přípony se v ní nedočkáš:
       ZDROJ + '{z}/{y}/{x}'. Bez tohohle se dal letecký snímek od Esri
       zapsat do výjimek „jen odkaz" a nikdo by to nenamítl. */
    if (new RegExp(`https?://${u}[^"'\`\\s)]*(?:/tile/|MapServer|/wmts|/tiles?/)`, 'i').test(t)) return true;
  }
  /* MEZ TÉHLE KONTROLY, ať se na ni nespoléhá víc, než umí: adresu
     složenou z více kousků (proměnná + konec) nejde obecně odlišit od
     odkazu. Co doopravdy chrání návštěvníka, je kontrola výš — každý
     cizí server musí být v zásadách jmenovaný, ať se stahuje jakkoli.
     Tahle je úklidová: brání tomu, aby se nenapsaný server „vyřešil"
     dopsáním do výjimek. */
  return false;
});
pravda('a výjimka „jen odkaz" nestojí u serveru, ze kterého se stahuje',
  vyjimkaAleStahuje.length === 0, vyjimkaAleStahuje.join(', '));

/* Třetí: zásady nesmějí jmenovat zpracovatele kvůli stahování, které se
   nedělá. Tak tam zůstal Google Fonts. Kontrolují se jmenovitě ti, u nichž
   zásady mluví o předání IP adresy. */
const PODEZRELE_ZMINKY = [
  ['fonts.googleapis.com', 'Google Fonts'],
  ['fonts.gstatic.com', 'Google Fonts'],
  ['www.googletagmanager.com', 'Google Tag Manager'],
  ['www.google-analytics.com', 'Google Analytics'],
];
/* ROZHODUJE SEZNAM ZPRACOVATELŮ, NE OKOLNÍ TEXT. Napoprvé se tu hledalo
   v okolí ±400 znaků slovo jako „dřív" nebo „nepředá" a zmínka se tím
   brala za vysvětlenou v minulém čase. Jenže vysvětlení o písmech leží
   hned pod seznamem, takže stačilo přidat NOVOU strašící odrážku a
   kontrola ji omluvila okolním textem (sabotáž prošla). Operativní je
   seznam <li> ve výčtu zpracovatelů: co je v něm jmenované, to se podle
   zásad děje. Poznámka pod seznamem může klidně vyprávět historii. */
const polozkyZpracovatelu = [...zasady.matchAll(/<ul class="rule-list">([\s\S]*?)<\/ul>/g)]
  .flatMap((m) => [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1]));
const slibenoAleNestahuje = PODEZRELE_ZMINKY.filter(([host]) =>
  !stahovane.has(host) && polozkyZpracovatelu.some((t) => t.includes(host)));
pravda('a zásady nestraší stahováním, které se nedělá',
  slibenoAleNestahuje.length === 0,
  slibenoAleNestahuje.map(([h, j]) => `${j} (${h})`).join(', '));

/* A předpoklad celé kontroly: podklad mapy je právě ten případ, kdy se
   stahuje z cizího serveru. Kdyby mapa jednou jezdila z vlastních
   dlaždic, tahle kontrola by nehlídala nic a tohle to řekne. */
const dlazdice = [...stahovane.keys()].filter((h) => /tile|arcgis|mapserver/i.test(h));
pravda('podklad mapy se opravdu stahuje odjinud (jinak kontrola nic nemeří)',
  dlazdice.length > 0, 'žádný server s dlaždicemi se nenašel');
pravda('a oba podklady mapy jsou v zásadách popsané',
  dlazdice.every(jmenovany), dlazdice.filter((h) => !jmenovany(h)).join(', '));

console.log('\nCizí servery a zásady soukromí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log(`::error::Cizí servery: ${chyb} kontrol neprošlo.`); process.exit(1); }
