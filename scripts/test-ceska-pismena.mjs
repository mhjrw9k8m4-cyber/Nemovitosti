/* ČESKÁ PÍSMENA MUSÍ KRESLIT TOTÉŽ PÍSMO JAKO ZBYTEK VĚTY.
 *
 * Spuštění: node scripts/test-ceska-pismena.mjs
 *   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
 *
 * PROČ TAHLE ZKOUŠKA VZNIKLA. Písmo je podřezané do dvou souborů:
 * `inter-latin.woff2` nese a–z a á é í ó ú ý, `inter-latin-ext.woff2`
 * nese č ď ě ň ř š ť ů ž. Stránky přednačítaly jen ten první. Druhý si
 * prohlížeč objednal až při vykreslování — a protože je u obou
 * `font-display: optional`, nestihl okno a prohlížeč ho pak
 * NEPOUŽIL VŮBEC. Devět českých písmen tedy kreslilo systémové písmo,
 * uprostřed slov: „pří‑š‑tí" mělo tři znaky z Interu a jeden odjinud.
 *
 * Změřeno 14. 10.: 9 znaků z 19 padalo do náhradního písma. Po doplnění
 * druhého `<link rel="preload">` 0 z 19.
 *
 * PROČ TO NEHLÍDÁ test-pisma. Hlídá — ale ptal se, jestli stránka
 * přednačítá NĚJAKÉ písmo, a jedno stačilo. Je to ta nejčastější
 * podoba slepé pojistky: kontrola je správná a přitom vadu mine.
 * Teď se tam ptá na oba soubory, a tady se ptá na výsledek.
 *
 * JAK SE TO MĚŘÍ, A PROČ NE JINAK. Ne přes `document.fonts.check()`:
 * ta vrací `true` podle `unicode-range` v CSS, tedy podle slibu, ne
 * podle skutečnosti.
 *
 * Měřit ŠÍŘKU taky nestačí, a tohle jsem si musel odžít. První podoba
 * téhle zkoušky porovnávala šířku znaku v `Inter, monospace` proti
 * `monospace` — a ohlásila, že velké `Ě` kreslí náhradní písmo.
 * Nekreslilo: Inter má u `E` náhodou skoro tutéž šířku jako monospace
 * (180,3 proti 180,6 px na pět znaků), takže měření nemělo co rozlišit.
 * Byl by to vymyšlený nález na šesti stránkách.
 *
 * Canvas taky ne — a tohle je třetí podoba téhle zkoušky. Vykreslit
 * znak do canvasu a porovnat body vypadalo neprůstřelně, jenže canvas
 * si písmo vyhodnotí ZNOVU a `font-display:optional` v něm neplatí:
 * zkouška pak prošla i tehdy, když jsem přednačtení schválně odstranil
 * ze všech šesti stránek. Měřit se musí tam, kde se to děje — v DOM.
 *
 * Měří se tedy TŘEMI NÁHRADAMI. Znak se vysází v `Inter, monospace`,
 * `Inter, serif` a `Inter, sans-serif`. Když ho kreslí Inter, vyjdou
 * všechny tři stejně — náhrada se neuplatní. Když Inter chybí, kreslí
 * ho pokaždé jiné náhradní písmo a šířky se rozejdou. Na náhodnou
 * shodu dvou šířek (což mi u velkého `E` vyrobilo vymyšlený nález na
 * šesti stránkách) tenhle postup nenaletí, protože by musely být
 * shodné všechny tři.
 *
 * Mezi kontrolními znaky je schválně i velké `E` a `S`: právě na nich
 * se poznalo, že předchozí podoba měření byla slepá.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

/* Znaky, které čeština potřebuje a leží v rozšířené latince. */
const CESKE = 'čďěňřšťůžČĎĚŇŘŠŤŮŽ';
/* Kontrolní znaky ze základní latinky: kdyby měření ukazovalo „náhradní
   písmo" i u nich, je rozbité měření, ne web. */
const KONTROLNI = 'aeixEASCáéíóúý';
/* Po jedné z každého druhu stránky: ruční, výpis, pozemek, rádcovská. */
const STRANKY = ['index.html', 'pozemky-stavebni.html', 'cena-pozemku.html',
  'pozemek.html', 'podminky.html', 'nove-pozemky.html'];

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Česká písmena', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const spatne = [];
const kontrolaSpatne = [];
let zmereno = 0;
for (const s of STRANKY) {
  /* DOTYK SE MUSÍ ŘÍCT: pravidla pro telefon tu stojí za
     `@media (pointer: coarse)`, ne za šířkou okna, takže by se
     v úzkém okně bez emulace dotyku vykreslilo rozvržení monitoru.
     (Jak se to našlo: bod 3da v docs/co-chybi.md.) */
  const ctx = await b.newContext({ bypassCSP: true,  viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  const p = await ctx.newPage();
  const r = await p.goto(`${BASE}/${s}`, { waitUntil: 'load' }).catch(() => null);
  if (!r) { spatne.push(`${s}: nenačetla se`); await ctx.close(); continue; }
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  const v = await p.evaluate(({ ceske, kontrolni }) => {
    const el = document.createElement('span');
    el.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:60px;font-weight:400';
    document.body.appendChild(el);
    const sir = (t, f) => { el.style.fontFamily = f; el.textContent = t; return el.getBoundingClientRect().width; };
    const nahradni = (z) => {
      const t = z.repeat(5);
      const a = sir(t, 'Inter, monospace'), b = sir(t, 'Inter, serif'), c = sir(t, 'Inter, sans-serif');
      return Math.abs(a - b) > 0.5 || Math.abs(a - c) > 0.5;
    };
    const out = { ceske: [], kontrolni: [] };
    for (const z of ceske) if (nahradni(z)) out.ceske.push(z);
    for (const z of kontrolni) if (nahradni(z)) out.kontrolni.push(z);
    document.body.removeChild(el);
    return out;
  }, { ceske: CESKE, kontrolni: KONTROLNI });
  zmereno++;
  if (v.ceske.length) spatne.push(`${s}: ${v.ceske.join(' ')}`);
  if (v.kontrolni.length) kontrolaSpatne.push(`${s}: ${v.kontrolni.join(' ')}`);
  await ctx.close();
}
await b.close();

/* PŘEDPOKLAD: opravdu se měřilo. Bez tohohle by zkouška na nenačtených
   stránkách hlásila „všechno v pořádku" a nepodívala se na nic. */
pravda(`je co měřit — načtené stránky (${zmereno} z ${STRANKY.length})`,
  zmereno >= STRANKY.length - 1, `načteno jen ${zmereno}`);
/* A že měření samo není rozbité: základní latinka musí vyjít jako Inter. */
pravda(`měření funguje — základní latinka (${KONTROLNI}) kreslí Inter`,
  kontrolaSpatne.length === 0,
  'u kontrolních znaků vyšlo náhradní písmo, takže je rozbité MĚŘENÍ, ne web:\n      '
  + kontrolaSpatne.join('\n      '));
pravda(`žádné české písmeno (${CESKE.slice(0, 9)}) nekreslí náhradní písmo`,
  spatne.length === 0, spatne.join('\n      '));

console.log('\nČeská písmena a podřezané písmo');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.error(`::error::Česká písmena: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' Rozšířená latinka je vlastní soubor a musí být v <link rel="preload">;'
    + ' při font-display:optional se jinak neuplatní vůbec.');
  process.exit(1);
}
process.exit(0);
