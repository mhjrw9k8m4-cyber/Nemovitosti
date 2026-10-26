/* Test: celý web má JEDEN krok — jeden okraj, jeden nadpis, jednu kartu.
 *
 * Spuštění: node scripts/test-jednotnost.mjs
 *
 * PROČ VZNIKL. 26. 10. se na dvanácti typech stránek změřilo tohle:
 *   · svislé odstupy oddílů měly DEVĚT hodnot (4, 12, 16, 20, 24, 28,
 *     40, 48, 80 px),
 *   · vodorovný okraj obsahu TŘI (12 px na stránce pozemku, 20 px na
 *     většině, 28 px na okresech, druzích a článcích),
 *   · karta TŘI odsazení (28/28, 20/20, 0/0),
 *   · h1 DVĚ velikosti (24 px na úvodu, pozemku, hlídání a zprávách,
 *     28 px na zbytku) — čtyři pixely nejsou hierarchie, ale nesourodost.
 * Okraj obsahu tedy při přechodu z pozemku na okres SKOČIL. Přesně
 * tohle dělá z webu „sbírku stránek" místo jedné věci, a na rozdíl od
 * barev si toho člověk nevšimne vědomě — jen mu to nesedí.
 *
 * MĚŘÍ SE VYKRESLENÁ STRÁNKA, NE ZÁPIS V SOUBORU. Hodnoty se slévají
 * z tokenů, z media queries a ze tří stylopisů naráz; ze zdroje se
 * nedá poznat, co z toho nakonec vyhraje. Zrovna na tom pohořel
 * test-pismo.mjs: hlídal „velký nadpis má jeden hlas" čtením
 * css/styles.css, jenže stránku pozemku přebíjela třída .pz-place
 * z vloženého stylopisu, kterou h1 dostává z JavaScriptu — takže
 * 2 266 stránek pravidlo porušovalo a hlídač hlásil zeleno.
 *
 * VÝJIMKA, KTERÁ MÁ DŮVOD. .clanek schválně shazuje kartu úplně
 * (0/0): dlouhý text se nečte z rámečku. Je pojmenovaná níž, ne
 * promíjená mlčky.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
const { BASE } = await import('./falesna-supabase-chat.mjs');

let ok = 0, chyb = 0; const zpravy = [];
hlasPad('Jednotný krok webu', zpravy);
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

/* Vzorek pokrývá každý ZPŮSOB, jakým stránka vzniká: ručně psaná,
   generovaná z dat, článek, nástroj za přihlášením i titulní. Kdyby
   se vzorek zúžil na ručně psané, vypadl by z něj zrovna ten typ,
   který má 2 266 kopií. */
const STRANKY = [
  ['úvodní', '/index.html'],
  ['pozemek', '/pozemek-benesov-benesov-1sjtz7b.html'],
  ['okres', '/pozemky-okres-tabor.html'],
  ['druh', '/pozemky-stavebni.html'],
  ['článek', '/cena-pozemku.html'],
  ['přidat', '/pridat.html'],
  ['hlídání', '/hlidani.html'],
  ['zprávy', '/zpravy.html'],
  ['data', '/data.html'],
  ['podmínky', '/podminky.html'],
  ['kontakt', '/kontakt.html'],
  ['pravidla', '/pravidla-inzerce.html'],
];

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
const ctx = await prohlizec.newContext({
  bypassCSP: true, viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, locale: 'cs-CZ',
});

const namereno = [];
for (const [jmeno, cesta] of STRANKY) {
  const p = await ctx.newPage();
  try {
    await p.goto(BASE + cesta, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const hlavni = document.querySelector('main');
      if (!hlavni) return null;
      const h = document.querySelector('h1');
      const okraje = new Set(), karty = new Set();
      hlavni.querySelectorAll('.wrap,.st-wrap,.pz-wrap').forEach((e) => {
        if (e.getBoundingClientRect().width > 200) {
          okraje.add(parseFloat(getComputedStyle(e).paddingLeft) || 0);
        }
      });
      hlavni.querySelectorAll('.add-card,.st-karta').forEach((e) => {
        if (e.classList.contains('clanek')) return;   // viz hlavička souboru
        const c = getComputedStyle(e);
        karty.add((parseFloat(c.paddingTop) || 0) + '/' + (parseFloat(c.paddingLeft) || 0));
      });
      return {
        h1: h ? getComputedStyle(h).fontSize : null,
        okraje: [...okraje], karty: [...karty],
      };
    });
    namereno.push([jmeno, m]);
  } catch (e) {
    namereno.push([jmeno, null]);
  }
  await p.close();
}
await prohlizec.close();

const nenactene = namereno.filter(([, m]) => !m).map(([j]) => j);
pravda(`všech ${STRANKY.length} typů stránek se načetlo`, nenactene.length === 0,
  'nenačetlo se: ' + nenactene.join(', '));

const zive = namereno.filter(([, m]) => m);

function jednaHodnota(popis, vyber) {
  const mapa = new Map();
  for (const [jmeno, m] of zive) {
    for (const h of [].concat(vyber(m))) {
      if (h === null || h === undefined) continue;
      if (!mapa.has(h)) mapa.set(h, []);
      if (!mapa.get(h).includes(jmeno)) mapa.get(h).push(jmeno);
    }
  }
  const klice = [...mapa.keys()];
  pravda(`${popis} je na celém webu jeden (${klice.join(', ') || '—'})`,
    klice.length === 1,
    klice.map((k) => `${k} → ${mapa.get(k).join(' ')}`).join('; '));
}

jednaHodnota('vodorovný okraj obsahu', (m) => m.okraje);
jednaHodnota('velikost nadpisu h1', (m) => m.h1);
jednaHodnota('odsazení karty', (m) => m.karty);

console.log('\nJednotný krok webu');
console.log(zpravy.join('\n'));
console.log(`  · měřeno na ${zive.length} typech stránek při šířce 390 px`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Jednotnost: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
/* A DOJET TO NAČISTO. Bez tohohle řádku zkouška doměří, vypíše
   výsledek a pak VISÍ: falešný server Supabase (scripts/falesna-
   supabase-chat.mjs) drží smyčku událostí otevřenou. V sadě ji pak
   sebere až časový strop a v logu po ní nezbyde nic — výpis se ztratí
   v nevyprázdněné rouře. Naměřeno: proces běžel 20 minut po tom, co
   měl hotovo. Ostatní zkoušky tenhle řádek mají, tahle ho zapomněla. */
process.exit(0);
