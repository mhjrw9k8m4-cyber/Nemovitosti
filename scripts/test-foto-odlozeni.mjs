#!/usr/bin/env node
/* TABULKA JMEN TŘÍD: ODLOŽENÁ, ALE POSUDEK SE POŘÁD DĚLÁ
   ==================================================================
   Spuštění: node scripts/test-foto-odlozeni.mjs   (potřebuje prohlížeč)

   js/tridy-imagenet.js je seznam jmen tisíce tříd MobileNetu: 23,9 kB
   surově, 10,3 kB po gzipu, a na pridat.html to byl po samotném
   formuláři druhý největší skript, tedy 13 % váhy té stránky přes drát.
   Smysl má ale jen spolu s modelem (5,4 MB), který se nahrává teprve
   u první fotky — takže kdo si fotku nepřiloží, platil to pro nic.

   ODLOŽENÍ SE DÁ UDĚLAT ŠPATNĚ, A TIŠE. js/pridat.js měl pojistku
   `if (!window.PKFotoTema || !window.PKTridy) return { ok: true }` —
   tedy kontrolu fotky úplně přeskočil, když tabulka chyběla. Samotné
   odložení by tím kontrolu vypnulo VŠEM a nic by nespadlo: fotka by
   prošla a web by napsal „v pořádku". Tahle zkouška proto neměří jen
   to, že se tabulka nestahuje — měří, že se POSUDEK POŘÁD UDĚLÁ.

   Model se nestahuje: TF.js se podstrčí falešný (5,4 MB v každé
   zkoušce by byla jiná vada). Falešný je JEN model, ne rozhodování —
   čísla jdou skutečnou cestou klasifikuj() → vyhodnot().
   ================================================================== */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* Pád se musí poznat od neprošlé kontroly — viz scripts/zkouska-pad.mjs.
   Instaluje se jako zachytávač, ne v catch. */
hlasPad('Odložená tabulka tříd', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---------- statická část: co je ve zdrojích ---------- */
const html = readFileSync(path.join(KOREN, 'pridat.html'), 'utf8');
pravda('pridat.html už tabulku tříd nestahuje značkou <script>',
  !/<script[^>]+src="js\/min\/tridy-imagenet\.js/.test(html),
  'značka tam pořád je — 10,3 kB po gzipu každému, kdo stránku otevře');
/* Razítko ?v= doplní sestavení, takže se adresa hledá s ním i bez něj —
   napsal jsem to napoprvé bez a kontrola padla na hotové stránce. */
pravda('a adresa tabulky je v <meta name="pk-tridy">',
  /<meta name="pk-tridy" data-src="js\/min\/tridy-imagenet\.js(\?v=[A-Za-z0-9]+)?">/.test(html),
  'bez té značky by se razítko ?v= nedoplnilo a tabulka by se cachovala navždy');
/* KOMENTÁŘE SE ODSTRAŇUJÍ, ROZHODUJE KÓD. Tahle kontrola padla napoprvé
   na mé vlastní próze: v js/pridat.js je u té opravy napsané, že
   podmínka `!window.PKTridy` tam dřív byla — a vzor se trefil do
   vysvětlení místo do kódu. Je to táž past, jakou má u sebe popsanou
   scripts/test-predloha.mjs („tahle stránka si NENAČÍTÁ css/styles.css"
   se trefilo do slova v textu). */
const bezKomentaru = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const pridatJs = bezKomentaru(readFileSync(path.join(KOREN, 'js', 'pridat.js'), 'utf8'));
pravda('a js/pridat.js už kontrolu fotky kvůli chybějící tabulce nepřeskakuje',
  !/!window\.PKTridy/.test(pridatJs),
  'pojistka `!window.PKTridy` je zpátky — s odloženou tabulkou by kontrola '
  + 'fotky nikdy neproběhla a nic by nespadlo');

const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
/* Telefonní šířka znamená DOTYK, ne myš — hlídá to
   scripts/test-zkousky-meri.mjs a právem: 390 px s myší je stav, který
   nemá žádný skutečný návštěvník.

   A bypassCSP: Playwright ovládá stránku vstřikovaným kódem, který si
   volá eval, takže pod přísným script-src přestane fungovat
   waitForFunction i scrollování — naměřeno 23. 10., kdy takhle spadlo
   30 zkoušek a vypadalo to na rozbitý web (viz scripts/test-csp.mjs).
   Tahle zkouška prošla i bez obcházení, ale spoléhat se na to, do
   kterých vnitřností Playwrightu kdy sáhne, je štěstí, ne pravidlo.
   ŽE POLITIKA TO ODLOŽENÉ NAČTENÍ VŮBEC DOVOLÍ, SE MĚŘÍ JINDE: v
   scripts/test-csp.mjs, tedy v té jediné zkoušce, která CSP neobchází —
   tady by to s bypassCSP neměřilo nic. */
const ctx = await b.newContext({ viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, bypassCSP: true });
const p = await ctx.newPage();
const stazeno = [];
p.on('request', (r) => { if (/tridy-imagenet|tf\.min\.js|mobilenet/.test(r.url())) stazeno.push(r.url()); });
try {
  await p.goto(`${BASE}/pridat.html`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);

  /* ---------- 1) při načtení stránky se nestahuje ---------- */
  pravda('tabulka tříd se při otevření stránky nestáhne',
    !stazeno.some((u) => /tridy-imagenet/.test(u)),
    'stáhlo se: ' + stazeno.join(', '));
  pravda('a PKTridy tedy v okně není',
    (await p.evaluate(() => typeof window.PKTridy)) === 'undefined',
    'PKTridy je ' + (await p.evaluate(() => typeof window.PKTridy)));
  pravda('zato modul posudku a skupiny tam jsou (ty jsou malé)',
    await p.evaluate(() => !!(window.PKFotoTema && window.PKSkupiny
      && typeof window.PKFotoTema.pripravTridy === 'function')),
    'bez PKFotoTema.pripravTridy by se tabulka neměla kde nahrát');

  /* ---------- 2) na vyžádání se nahraje a má tisíc jmen ---------- */
  const t = await p.evaluate(() => window.PKFotoTema.pripravTridy().then((x) => ({
    je: Array.isArray(x), kolik: x ? x.length : 0, prvni: x ? x[0] : null,
    globalne: Array.isArray(window.PKTridy),
  })));
  pravda(`pripravTridy() tabulku nahraje (${t.kolik} jmen)`,
    t.je && t.kolik === 1000 && t.globalne,
    JSON.stringify(t));
  pravda('a teprve teď si ji prohlížeč opravdu stáhl',
    stazeno.some((u) => /tridy-imagenet/.test(u)),
    'žádný požadavek na tridy-imagenet — nahrálo se to odjinud?');

  /* ---------- 3) TO PODSTATNÉ: posudek se udělá ---------- */
  /* Falešný TF.js: tvary a volání jsou tytéž, jaké klasifikuj()
     používá, jen místo modelu vrací předem daná čísla. Rozhodování
     (vyhodnot) běží skutečné. */
  const posudek = await p.evaluate(() => {
    const V = window.PKSkupiny.indexOf('V');          // první třída „venku"
    const pole = new Float32Array(1000);
    pole[V] = 0.80; pole[(V + 1) % 1000] = 0.05;
    const T = () => { const o = {
      shape: [300, 400, 3],
      toFloat: () => o, div: () => o, sub: () => o, expandDims: () => o,
      mean: () => o, dataSync: () => pole }; return o; };
    window.tf = {
      tidy: (f) => f(),
      browser: { fromPixels: () => T() },
      slice: () => T(), concat: () => T(),
      image: { resizeBilinear: () => T() },
      loadLayersModel: () => Promise.resolve({ predict: () => T() }),
    };
    const img = document.createElement('img');
    img.width = 400; img.height = 300;
    return window.PKFotoTema.posud(img).then((r) => ({
      ok: r.ok, varovani: !!r.varovani,
      venku: r.detail ? Math.round(r.detail.venku) : null,
      prvni: r.detail && r.detail.nej && r.detail.nej[0] ? r.detail.nej[0].trida : null,
      skupina: r.detail && r.detail.nej && r.detail.nej[0] ? r.detail.nej[0].skupina : null,
      indexV: V,
    })).catch((e) => ({ chyba: String(e && e.message || e) }));
  });
  pravda('posudek fotky se udělá i s odloženou tabulkou',
    !posudek.chyba && posudek.ok === true,
    JSON.stringify(posudek));
  pravda('a dojde na skutečné rozhodování (skupina „venku" se sečetla)',
    posudek.skupina === 'V' && posudek.venku > 50,
    JSON.stringify(posudek));
  /* A JMÉNO TŘÍDY, NE JEN ČÍSLO. Tím se pozná, že tabulka doopravdy
     došla až ke klasifikaci — bez ní by tu stálo „987". */
  pravda('a jméno třídy je jméno, ne číslo (tabulka došla ke klasifikaci)',
    typeof posudek.prvni === 'string' && !/^\d+$/.test(posudek.prvni),
    'první třída: ' + JSON.stringify(posudek.prvni));

  /* ---------- 4) a rozhodnutí na jménech nezávisí ---------- */
  /* Kdyby se tabulka někdy nenačetla (vypadlá síť), posudek se dělat
     MÁ — jen bez jmen. Kontrola níž to dokazuje: táž čísla bez tabulky
     dají týž verdikt. */
  const bezJmen = await p.evaluate(() => {
    const V = window.PKSkupiny.indexOf('V');
    const pole = new Float32Array(1000);
    pole[V] = 0.80; pole[(V + 1) % 1000] = 0.05;
    const T = () => { const o = {
      shape: [300, 400, 3],
      toFloat: () => o, div: () => o, sub: () => o, expandDims: () => o,
      mean: () => o, dataSync: () => pole }; return o; };
    window.tf = { tidy: (f) => f(), browser: { fromPixels: () => T() },
      slice: () => T(), concat: () => T(), image: { resizeBilinear: () => T() },
      loadLayersModel: () => Promise.resolve({ predict: () => T() }) };
    const img = document.createElement('img');
    img.width = 400; img.height = 300;
    return window.PKFotoTema.klasifikuj(img, null, 6)
      .then((pr) => window.PKFotoTema.vyhodnot(pr, window.PKSkupiny))
      .then((r) => ({ ok: r.ok, venku: r.detail ? Math.round(r.detail.venku) : null,
        prvni: r.detail && r.detail.nej && r.detail.nej[0] ? r.detail.nej[0].trida : null }))
      .catch((e) => ({ chyba: String(e && e.message || e) }));
  });
  pravda('a bez tabulky dají táž čísla týž verdikt (jen bez jmen)',
    !bezJmen.chyba && bezJmen.ok === posudek.ok && bezJmen.venku === posudek.venku
      && /^\d+$/.test(String(bezJmen.prvni)),
    'bez tabulky: ' + JSON.stringify(bezJmen) + ' | s tabulkou: ' + JSON.stringify(posudek));
} finally {
  await b.close();
}

console.log('\nOdložená tabulka tříd a posudek fotky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Odložená tabulka tříd: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
