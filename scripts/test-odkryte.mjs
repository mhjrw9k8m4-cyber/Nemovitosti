// Test: i to, co je při načtení skryté, drží jedno zaoblení.
//
// Spuštění: node scripts/test-odkryte.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Hlídači vzhledu měří `getComputedStyle`
// VYKRESLENÝCH prvků — a tím nevidí nic, co je za `hidden`, v zavřeném
// rozbalovači, v jiném kroku formuláře nebo co teprve vznikne z JS.
// Naměřeno 29. 10.: v panelu hlídaného místa na mapě, který se objeví až
// po vybrání místa, ležela ČTYŘI různá zaoblení naráz (14, 10, 6 a 0 px)
// a výběr okruhu byl 26 px vysoký — pod mezí 38 px, kterou si web sám
// klade na terč pro prst. Nikdo si toho roky nevšiml. Odkrytý otisk
// sedmnácti stránek pak našel ještě tři další: .btn-ghost a .pf-logout
// na 10 px (pojmenované rodiny tlačítek, kdežto .btn-primary má 14)
// a .ul-thumb na 10 px vedle .mp-ram se 14 — dva náhledy, které dělají
// přesně totéž. Viz §222.
//
// JAK SE MĚŘÍ. Odkryje se vše skryté a otevře se každý rozbalovač; pak
// se čtou vypočtené hodnoty, které na rozvržení nezávisí (zaoblení, rám).
// Je to NÁSILNÉ odkrytí, které web sám nikdy neudělá — proto se tu neměří
// nic, co závisí na poloze nebo velikosti okna.
//
// RECEPT: ovladač i deska mají --r-ovladani / --r-plocha (14 px).
// Drobnost uvnitř desky (nižší než 44 px) smí mít --r-drobnost (10 px).
// Kolo (border-radius:50 %) a pilulka patří odznakům a kulatým tlačítkům
// s ikonou. Výjimky mají jméno a napsaný důvod.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { adresaPozemku } from './adresa-pozemku.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Odkryté stavy', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* VÝJIMKY. Jméno třídy a důvod — ne aby se dalo pravidlo obejít, ale aby
   se u každé dalo přečíst, proč platí. */
const KOLA = new Set([
  /* Kulatá tlačítka s ikonou: „nahoru" a otvírač nápovědy. */
  'to-top', 'rv-napoveda-btn',
  /* Zaškrtnutí po úspěchu, odznak účtu a kolečko v potvrzení e-mailu —
     kolo je tu význam, ne ozdoba: je to terč oka, ne plocha s obsahem. */
  'asx-check', 'pf-avatar', 'auth-sent-ico',
  /* Počet nabídek ve shluku na mapě, znak u pobídky rychlého výběru
     a číslo kroku na stránce inzerce. Všechno jedno číslo nebo znak
     v kolečku — to je kolo z podstaty, ne zaoblená deska. */
  'pk-shluk', 'rv-uvod-znak', 'as-num',
]);
/* NÁHLED V ŘÁDCE JE DROBNOST, i když je vyšší než 44 px. Stupnice to má
   napsané u tokenu: `--r-drobnost` nese „odznaky, štítky, NÁHLEDY",
   kdežto `--r-plocha` „karty, panely, okna, mapy, FOTKY". Dlaždice
   128 × 80 px v okresní řádce je tedy náhled (10 px) a fotka přes celou
   šířku karty (.ul-thumb) je fotka (14 px). */
const NAHLEDY = new Set(['okr-foto']);
const MIMO = new Set([
  /* Vnitřní odkazy leafletového ovládání mají 2 a 0 px z knihovny, ale
     NEVIDÍ SE: `.leaflet-control-zoom` je ořezává (--r-md + overflow
     hidden, css/styles.css u řádku se zoomem). Měřit je nemá smysl. */
  'leaflet-control-zoom-in', 'leaflet-control-zoom-out',
  'leaflet-popup-close-button', 'leaflet-control-attribution',
]);
const DROBNOST_V = 44;

const STRANKY = ['index.html', 'pridat.html', 'cena-pozemku.html', 'hlidani.html',
  'zpravy.html', 'muj-inzerat.html', 'moje-data.html', 'porovnani.html',
  'kontakt.html', 'data.html', 'inzerce.html', 'drazby-pozemku.html',
  'nove-pozemky.html', 'radce.html', 'hypoteka-na-pozemek.html',
  'pozemky-okres-zlin.html',
  (adresaPozemku() || {}).url || 'pozemek.html'];

/* Odkrytí. `display:revert` vrátí prvku jeho vlastní hodnotu ze
   stylopisu, ne `block` — jinak by se z flexu stal blok a měřilo by se
   něco jiného, než web kreslí. */
const ODKRYJ = `[hidden]{display:revert !important;}
  [aria-hidden="true"]{display:revert !important;}
  dialog{display:block !important;}
  .skryto,[style*="display:none"]{display:revert !important;}`;

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 1280, height: 900 }, locale: 'cs-CZ', reducedMotion: 'reduce' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') {
    return r.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  }
  return r.abort();
});
const p = await ctx.newPage();
const nalez = new Map();
const nedojely = [];
let prvku = 0, odkryto = 0;
for (const s of STRANKY) {
  const odp = await p.goto(BASE + '/' + s, { waitUntil: 'load' }).catch(() => null);
  if (!odp || !odp.ok()) { nedojely.push(s.split('?')[0] + (odp ? ' → ' + odp.status() : ' → vůbec')); continue; }
  await p.waitForTimeout(1700);
  await p.addStyleTag({ content: ODKRYJ });
  const kolik = await p.evaluate(() => {
    let n = 0;
    for (const d of document.querySelectorAll('details')) { if (!d.open) { d.open = true; n++; } }
    return n;
  });
  odkryto += kolik;
  await p.waitForTimeout(400);
  const n = await p.evaluate(() => {
    const out = [];
    const pruhl = (c) => !c || /rgba\(0, 0, 0, 0\)/.test(c);
    for (const e of document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], div, section, li, form, aside, details, span, figure')) {
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 8) continue;
      const c = getComputedStyle(e);
      const zapis = c.borderTopLeftRadius;
      const z = Math.round(parseFloat(zapis) || 0);
      if (!z) continue;
      const t = (e.type || '').toLowerCase();
      if (['checkbox', 'radio', 'range'].includes(t)) continue;
      const jeOvl = /^(button|a|input|select|textarea)$/.test(e.tagName.toLowerCase())
        || e.getAttribute('role') === 'button';
      const maPlochu = !pruhl(c.backgroundColor);
      const maRam = parseFloat(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none';
      if (!maPlochu && !maRam) continue;
      out.push({ z, procenta: zapis.includes('%'), jeOvl, v: Math.round(r.height),
        tridy: (e.getAttribute('class') || '').split(/\s+/).filter(Boolean),
        jm: e.tagName.toLowerCase() + '.' + ((e.getAttribute('class') || '').split(/\s+/)[0] || '—') });
    }
    return out;
  }).catch(() => []);
  prvku += n.length;
  for (const x of n) {
    if (x.tridy.some((t) => MIMO.has(t))) continue;
    /* Kolo se zapisuje v procentech. Dovolené je jen tam, kde má jméno. */
    if (x.procenta) {
      if (x.tridy.some((t) => KOLA.has(t))) continue;
      nalez.set(x.jm + ' | kolo ' + x.z + ' %', { kde: s, v: x.v });
      continue;
    }
    if (x.z === 14 || x.z >= 100) continue;                 /* 14 px nebo pilulka */
    if (!x.jeOvl && x.z === 10 && x.v <= DROBNOST_V) continue;  /* drobnost v desce */
    if (!x.jeOvl && x.z === 10 && x.tridy.some((t) => NAHLEDY.has(t))) continue;
    nalez.set(x.jm + ' | r' + x.z + (x.jeOvl ? ' | ovladač' : ' | deska'), { kde: s, v: x.v });
  }
}
await prohlizec.close();

pravda(`všech ${STRANKY.length} stránek dojelo`, nedojely.length === 0, nedojely.join('\n      '));
pravda(`otisk po odkrytí je dost velký (${prvku} prvků se zaoblením, ${odkryto} otevřených rozbalovačů)`,
  prvku >= 300, `naměřeno jen ${prvku} — odkrytí se nepovedlo, ne web je v pořádku`);
pravda('ve skrytých stavech drží zaoblení jeden recept',
  nalez.size === 0,
  [...nalez].map(([k, v]) => `${k}  (výška ${v.v}, ${v.kde.split('?')[0]})`).join('\n      '));

console.log('\nOdkryté stavy: zaoblení i tam, kam se hlídači nedostanou');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Odkryté stavy: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
