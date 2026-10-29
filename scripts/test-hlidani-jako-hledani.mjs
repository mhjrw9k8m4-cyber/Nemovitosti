// Test: formulář hlídání mluví touž řečí jako hledání na úvodu.
//
// Spuštění: node scripts/test-hlidani-jako-hledani.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Majitel 29. 10. nad snímkem „Nového
// hlídání": „předělej to tak, aby to vypadalo jako vyhledávání v menu,
// které už máme hotové, a pohraj si s tím do detailu."
// Naměřeno tehdy na 390×844, role vedle role:
//   popisek pole      hledání 12/600 verzálky · hlídání 13/700
//   textové pole      hledání bílá plocha, rám 1 px · hlídání šeď, 1,5 px
//   rychlá volba      hledání 44 px · hlídání 38 px (pod mezí dotyku)
//   hlavní tlačítko   hledání 16/700 · hlídání 14/700
//   pilulka „musí mít" hledání 13/600 · hlídání 13/400
//
// JAK SE TO MĚŘÍ A PROČ ZROVNA TAK. Ne na živých prvcích: část
// ovládání hledání si skript stěhuje do překryvu přes celou obrazovku,
// takže by se měřilo podle toho, co je zrovna otevřené. Měří se RECEPT:
// na každé stránce se vyrobí prvek s danou třídou, přečte se jeho
// vypočtený styl a zase se zahodí. Pravidla platí stejně, ať je prvek
// na obrazovce, nebo ne — a srovnávají se tak recepty, ne náhoda.
//
// JEDINÁ DOVOLENÁ ODCHYLKA je velikost a řez písma v políčku a výběru.
// Hledání má v číselném poli 14 px a ve výběru 13/600; hlídání má
// v obojím 16/400. Důvody: pod 16 px iPhone při klepnutí do pole
// zvětší celou stránku (hledání tu vadu má taky, ale opravit se musí
// tam, ne opsat sem), a uvnitř jednoho formuláře má mít políčko
// a výběr tutéž velikost. Všechno ostatní — tvar, rám, plochy, barvy
// i výška — se musí shodovat.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Hlídání jako hledání', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Role → třída na jedné a na druhé straně, a jaký prvek ji nese. */
const ROLE = [
  { jm: 'popisek pole',    tag: 'span',   hledani: 'mc-cap',      hlidani: 'hl-lbl',    pismo: true },
  { jm: 'textové pole',    tag: 'input',  hledani: 'map-num',     hlidani: 'hl-in',     pismo: false },
  { jm: 'výběr',           tag: 'select', hledani: 'map-select',  hlidani: 'hl-sel',    pismo: false },
  { jm: 'rychlá volba',    tag: 'button', hledani: 'filter-chip', hlidani: 'hl-rychle', pismo: true },
  { jm: 'pilulka „musí mít"', tag: 'button', hledani: 'filter-chip', hlidani: 'hl-chip', pismo: true },
  { jm: 'hlavní tlačítko', tag: 'button', hledani: 'mcf-hotovo',  hlidani: 'hl-btn',    pismo: true },
];

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 390, height: 844 }, locale: 'cs-CZ', reducedMotion: 'reduce',
  isMobile: true, hasTouch: true });
/* Nejdřív zákaz volání ven, teprve pak podstrčený config.js: pozdější
   cesta má přednost, takže obrácené pořadí by config pustilo na ostrou
   Supabase a stránka by skončila v nouzovém režimu. (Naměřeno: formulář
   hlídání se pak vůbec nevykreslí a zůstane jen kostra.) */
await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1'
  ? r.continue() : r.abort()));
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';window.PK_MAIL_ZAPNUTO=false;` }));
await ctx.addInitScript(() => {
  localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel', refresh_token: 'ref-majitel',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } }));
});
const p = await ctx.newPage();

const recepty = (strana) => p.evaluate(([role, kam]) => {
  const ven = {};
  for (const r of role) {
    const e = document.createElement(r.tag);
    e.className = r[kam];
    document.body.appendChild(e);
    const c = getComputedStyle(e);
    ven[r.jm] = {
      tvar: c.borderRadius,
      ram: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor,
      plocha: c.backgroundColor,
      ink: c.color,
      vyska: c.minHeight,
      pismo: c.fontSize + '/' + c.fontWeight,
    };
    e.remove();
  }
  return ven;
}, [role, strana]);
const role = ROLE;

await p.goto(BASE + '/index.html', { waitUntil: 'load' });
await p.waitForSelector('#ms-rozsirene', { timeout: 25000 }).catch(() => null);
await p.waitForTimeout(800);
const A = await recepty('hledani');

await p.goto(BASE + '/hlidani.html', { waitUntil: 'load' });
await p.waitForSelector('#ns-okres', { state: 'attached', timeout: 25000 }).catch(() => null);
await p.waitForTimeout(800);
const B = await recepty('hlidani');
/* Že se formulář opravdu vykreslil, ne že jen stránka doběhla: recept
   by se přečetl i na prázdné stránce (pravidla jsou ve stylu), takže
   bez téhle kontroly by zkouška mohla projít nad kostrou. */
const jeFormular = await p.evaluate(() => !!document.getElementById('ns-okres'));
const jednotky = await p.evaluate(() => [...document.querySelectorAll('.hl-lbl .jednotka, .mc-cap .jednotka')]
  .map((e) => getComputedStyle(e).textTransform));
await prohlizec.close();

pravda('formulář hlídání se vykreslil (jinak by se recepty četly nad prázdnem)',
  jeFormular === true, 'ns-okres v dokumentu není');

const VLASTNOSTI = ['tvar', 'ram', 'plocha', 'ink', 'vyska'];
for (const r of ROLE) {
  const a = A[r.jm], b = B[r.jm];
  const rozdily = VLASTNOSTI.filter((k) => a[k] !== b[k])
    .map((k) => k + ': hledání „' + a[k] + '" · hlídání „' + b[k] + '"');
  if (r.pismo && a.pismo !== b.pismo) rozdily.push('písmo: hledání ' + a.pismo + ' · hlídání ' + b.pismo);
  pravda(`${r.jm}: tentýž recept (.${r.hledani} = .${r.hlidani})`,
    rozdily.length === 0, rozdily.join('\n      '));
}

/* A ještě jedna vada, kterou tahle práce odkryla: popisek pole je
   verzálkami, takže „Cena (Kč)" se vysázelo jako „CENA (KČ)"
   a „Výměra (m²)" jako „VÝMĚRA (M²)" — obojí je chybný zápis
   jednotky. Jednotka proto stojí ve vlastním <span class="jednotka">
   s vypnutým přepisem, a to na OBOU stránkách. */
pravda(`jednotka v popisku se nepíše verzálkami (${jednotky.length} nalezeno)`,
  jednotky.length > 0 && jednotky.every((t) => t === 'none'),
  JSON.stringify(jednotky));

console.log('\nHlídání jako hledání: jeden recept na jednu roli');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Hlídání jako hledání: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
