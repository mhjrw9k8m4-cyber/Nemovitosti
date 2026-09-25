// Test živého proužku v úvodu (tři fakta z dat) a věrohodnosti cen.
//
// Spuštění: node scripts/test-uvod.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč tohle hlídat:
//
// 1) Úvodní obrazovka tvrdila jen „1 953 pozemků · 77 okresů". Je to pravda,
//    ale nic to neříká o tom, jestli se tu něco děje. Proužek ukazuje tři
//    fakta ze skutečných dat. Kdyby se rozbil výpočet, zůstaly by prázdné
//    kolonky nebo pomlčky — a toho si při zběžném pohledu nikdo nevšimne.
//
// 2) Důležitější je DRUHÁ kontrola. Jako „nejvýhodnější dnes" web původně
//    nabízel stavební pozemek 3 315 m² za 11 000 Kč, tedy 3 Kč/m² proti
//    mediánu 2 888 Kč/m². To není příležitost, to je skoro jistě
//    spoluvlastnický podíl nebo chyba v inzerátu. Kdo na takové číslo jednou
//    klikne a zjistí, co za ním je, podruhé už žádnému našemu číslu nevěří.
//    Test proto porovná, co stránka vypíše, s vlastním výpočtem z dat.
//
// 3) Dražba s prošlým termínem na titulce je totéž znovu — proto se ověřuje,
//    že vypsaný termín není v minulosti.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// --- co bychom čekali, spočítáno nezávisle na stránce -----------------
const zdroj = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
const DATA = zdroj.opportunities;

function druhGroup(s) {
  s = (s || '').toLowerCase();
  if (s.indexOf('les') !== -1) return 'Lesní pozemek';
  if (s.indexOf('stavební') !== -1 || s.indexOf('zastav') !== -1) return 'Stavební / zastavěná';
  if (s.indexOf('orná') !== -1) return 'Orná půda';
  if (s.indexOf('zahrad') !== -1) return 'Zahrada';
  if (s.indexOf('travní') !== -1 || s.indexOf('louk') !== -1 || s.indexOf('pastvin') !== -1) return 'Louka / travní porost';
  if (s.indexOf('vinice') !== -1 || s.indexOf('sad') !== -1) return 'Vinice / sad';
  if (s.indexOf('ostatní') !== -1) return 'Ostatní plocha';
  return 'Jiný pozemek';
}
const medianSkupiny = (() => {
  const idx = {};
  for (const d of DATA) {
    if (typeof d.area === 'number' && d.area > 0 && d.price) {
      const k = d.type + '|' + druhGroup(d.druh);
      (idx[k] = idx[k] || []).push(d.price / d.area);
    }
  }
  const m = {};
  for (const k of Object.keys(idx)) {
    idx[k].sort((a, b) => a - b);
    m[k] = idx[k][Math.floor(idx[k].length / 2)];
  }
  return m;
})();
/** Cena pod padesátinou mediánu své skupiny = podíl nebo překlep. */
function neduveryhodna(d) {
  if (!(typeof d.area === 'number' && d.area > 0 && d.price)) return false;
  const med = medianSkupiny[d.type + '|' + druhGroup(d.druh)];
  return med ? (d.price / d.area) < med / 50 : false;
}
const podezrela = DATA.filter(neduveryhodna);
const podezrelaMista = new Set(podezrela.map((d) => d.place));

// --- prohlížeč --------------------------------------------------------
const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
// Pořadí je důležité: Playwright bere POSLEDNÍ shodu, takže obecné pravidlo první.
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
  return LEAFLET ? r.abort() : r.continue();
});
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
  await ctx.route(`${BASE}/index.html`, async (r) => {
    const o = await r.fetch();
    const t = (await o.text()).replace(/\s+integrity="[^"]*"/g, '');
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: t });
  });
}

const p = await ctx.newPage();
const chyby = [];
p.on('pageerror', (e) => chyby.push(String(e)));
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4500);

const proužek = await p.evaluate(() => {
  const box = document.getElementById('hero-live');
  if (!box) return null;
  const el = (f) => box.querySelector(`[data-fakt="${f}"]`);
  const cti = (f) => {
    const a = el(f);
    if (!a || a.hidden) return null;
    return {
      klic: a.querySelector('.hl-k').textContent.trim(),
      hodnota: a.querySelector('.hl-v').textContent.trim(),
    };
  };
  return { skryty: box.hidden, drazba: cti('drazba'), nove: cti('nove'), deal: cti('deal') };
});

pravda('živý proužek se v úvodu objevil', proužek && proužek.skryty === false,
  'element #hero-live chybí nebo zůstal schovaný');

if (proužek) {
  for (const [klic, popis] of [['drazba', 'nejbližší dražba'], ['deal', 'nejvýhodnější dnes']]) {
    const f = proužek[klic];
    pravda(`fakt „${popis}" má popisek i hodnotu`,
      !!(f && f.klic && f.hodnota && f.hodnota !== '—'),
      `vyšlo ${JSON.stringify(f)}`);
  }

  /* „Kolik přibylo" je jediný fakt, který SMÍ chybět — a musí chybět
     tehdy, když by lhal. Datum „poprvé viděno" se do dat doplnilo
     najednou, takže po jeho zavedení vypadalo 1 947 z 1 953 nabídek jako
     čerstvě přibylých a v úvodu stálo „Přibylo za týden: 1 940 pozemků"
     hned vedle údaje „1 940 pozemků celkem". Dvě stejná čísla vedle sebe
     nejsou novinka, ale datum zavedení sloupce. Buď se tedy ukáže číslo,
     které jako novinka obstojí, nebo se mlčí. */
  const nove = proužek.nove;
  const surova = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
  const celkem = new Set(surova.map((d) => [d.place, d.okres, d.price, d.area, d.druh].join('|'))).size;
  if (nove && nove.hodnota) {
    const n = +String(nove.hodnota).replace(/[^\d]/g, '');
    pravda('„kolik přibylo" nehlásí skoro celou databázi jako novinku',
      n > 0 && n <= Math.round(celkem / 3),
      `hlásí ${n} z ${celkem} — to není novinka, to je den, kdy se zavedlo „poprvé viděno"`);
    pravda('a má u sebe popisek', !!nove.klic, JSON.stringify(nove));
  } else {
    pravda('„kolik přibylo" radši mlčí, než aby lhalo', true);
  }

  // Dražba nesmí být z minulosti — a „dnes/zítra/za N dní" je vždy budoucnost.
  const d = proužek.drazba;
  pravda('termín nejbližší dražby není v minulosti',
    !!(d && /^(dnes|zítra|za \d+ dn[yí])\b/.test(d.hodnota)),
    `vyšlo ${JSON.stringify(d && d.hodnota)} — čekal se tvar „zítra · Obec"`);

  // Nejvýhodnější nabídka se hlásí ČÁSTKOU, ne pořadím v žebříčku.
  // „Levnější než 92 % podobných" je pořadí a člověk si pod tím nic
  // nepředstaví; „o 92 % pod obvyklou" je údaj.
  pravda('nejvýhodnější se hlásí jako rozdíl proti obvyklé ceně',
    !!(proužek.deal && /^o \d+ % pod obvyklou · .+/.test(proužek.deal.hodnota)),
    `vyšlo „${proužek.deal && proužek.deal.hodnota}"`);

  // Jádro testu: nabídka s nevěrohodnou cenou se nesmí vydávat za koupi roku.
  const deal = proužek.deal;
  const misto = deal ? deal.hodnota.split('·').pop().trim() : '';
  pravda('jako nejvýhodnější se nenabízí pozemek s nevěrohodnou cenou',
    !!(misto && !podezrelaMista.has(misto)),
    `stránka nabízí „${misto}", což je mezi ${podezrela.length} podezřelými záznamy ` +
    `(cena za m² pod padesátinou mediánu skupiny)`);
}

pravda('na úvodní stránce nespadl žádný skript', chyby.length === 0, chyby[0]);

/* ---- Když nic nesedí, nadpis nesmí nic slibovat --------------------
   „Doporučené příležitosti · 0 na mapě" a pod tím prázdno je protimluv:
   tváří se, že web něco doporučil, a přitom neukazuje nic. A hlavně —
   z prázdného seznamu musí vést cesta ven na jedno klepnutí, jinak je
   to slepá ulička a člověk odejde. */
{
  await p.evaluate(() => {
    const e = document.getElementById('map-search');
    e.value = 'qwertzuiop nic takoveho'; e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(1600);
  const stav = await p.evaluate(() => {
    const h = document.querySelector('#map-count, .map-count');
    const telo = (document.querySelector('.opp-list') || document.body).textContent || '';
    return { nadpis: h ? h.textContent.trim() : '',
      karet: document.querySelectorAll('.opp-item').length,
      vychod: [...document.querySelectorAll('.opp-list button, .opp-list a')]
        .map((b) => b.textContent.trim()).filter(Boolean).slice(0, 4),
      rikaProc: /Nejvíc omezuje|nesedí/i.test(telo) };
  });
  pravda('na nesmyslné hledání se neukáže nic', stav.karet === 0, `karet ${stav.karet}`);
  pravda('a nadpis nic neslibuje', !/Doporučené|Vybrané/.test(stav.nadpis),
    `nad prázdným seznamem stojí „${stav.nadpis}"`);
  pravda('a neuvádí se ani „0 na mapě"', !/\b0\b/.test(stav.nadpis), stav.nadpis);
  pravda('řekne se, co výsledek nejvíc omezuje', stav.rikaProc,
    'prázdný seznam bez vysvětlení je slepá ulička');
  pravda('a je odtud cesta ven na jedno klepnutí', stav.vychod.some((t) => /Zrušit/i.test(t)),
    `v prázdném seznamu jsou jen: ${stav.vychod.join(' | ') || '(nic)'}`);
  // uklidit po sobě, ať další kontroly vidí normální stav
  await p.evaluate(() => {
    const e = document.getElementById('map-search');
    e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(1200);
}

await prohlizec.close();

console.log('\nÚvodní obrazovka — živá čísla a věrohodnost cen');
console.log(`  · v datech je ${podezrela.length} záznamů s nevěrohodnou cenou (hlídáme, ať se nedostanou nahoru)`);
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Úvodní obrazovka: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
