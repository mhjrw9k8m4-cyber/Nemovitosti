// Test: našeptávač obcí a nabídka opravy překlepu — v prohlížeči.
//
// Spuštění: node scripts/test-naseptavac.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč to nestačí testovat jako funkci: našeptávač je z půlky ovládání.
// Může se správně spočítat a přesto být k ničemu — když se nabídka schová
// dřív, než se do ní stihne klepnout, když ji nejde ovládat klávesnicí,
// nebo když jsou řádky na mobilu tak nízké, že se do nich netrefíte.
// Tohle všechno se pozná jen v prohlížeči.
//
// Hlídá se:
//   1. nabídka se objeví a ukáže obec i okres s počtem nabídek,
//   2. klepnutí ji vybere a výpis se podle toho zúží,
//   3. dá se ovládat šipkami a Enterem, Escape ji zavře,
//   4. řádky jsou na dotyk dost velké (stejné pravidlo jako test-dotyk),
//   5. při překlepu web nabídne opravu místo strohého „nic nemáme".
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
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function otevri(opt) {
  const ctx = await prohlizec.newContext(opt);
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    await ctx.route(`${BASE}/index.html*`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3600);
  return { ctx, p };
}
const TELEFON = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

// Obec, kterou v datech opravdu máme — test si ji vezme z dat, ne z hlavy.
const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pocty = {};
for (const d of DATA) if (d.place && d.okres) { const k = d.place + '|' + d.okres; pocty[k] = (pocty[k] || 0) + 1; }
const nejcastejsi = Object.entries(pocty).sort((a, b) => b[1] - a[1])[0][0].split('|');
const OBEC = nejcastejsi[0];
const ZACATEK = norm(OBEC).slice(0, 4);

const { ctx, p } = await otevri(TELEFON);
const pole = p.locator('#map-search');
const seznam = p.locator('#map-search-navrhy');

// --- 1) Nabídka se objeví a něco v ní je ----------------------------
await pole.click();
await pole.type(ZACATEK, { delay: 40 });
await p.waitForTimeout(250);
const videt = await seznam.isVisible();
pravda(`našeptávač se po napsání „${ZACATEK}" ukáže`, videt);
const radky = await p.locator('#map-search-navrhy li').count();
pravda('a něco nabízí', radky > 0, `řádků: ${radky}`);
const prvni = await p.locator('#map-search-navrhy li').first().innerText().catch(() => '');
pravda('u nabídky je vidět okres i počet', /okr\.|celý okres/.test(prvni) && /\d+×/.test(prvni), prvni);

// --- 2) Řádky se dají trefit prstem ---------------------------------
const vysky = await p.$$eval('#map-search-navrhy li', (ls) => ls.map((l) => l.getBoundingClientRect().height));
pravda('řádky nabídky jsou na dotyk dost velké (≥ 36 px)',
  vysky.length > 0 && Math.min(...vysky) >= 36, 'nejnižší ' + Math.min(...vysky).toFixed(1) + ' px');

// --- 3) Ovládání klávesnicí -----------------------------------------
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(120);
pravda('šipka dolů označí první nabídku', (await p.locator('#map-search-navrhy li.on').count()) === 1);
await p.keyboard.press('Escape');
await p.waitForTimeout(120);
pravda('Escape nabídku zavře', !(await seznam.isVisible()));

// --- 4) Výběr nabídky zúží výpis ------------------------------------
/* Pozor na klepání naslepo: když se nabídka neukáže, Playwright čeká
   třicet vteřin a test spadne výjimkou místo srozumitelné hlášky. Proto
   se nejdřív ověří, že je vidět, a teprve pak se kliká. */
await pole.fill('');
await pole.type(ZACATEK, { delay: 40 });
await p.waitForTimeout(250);
if (await seznam.isVisible()) {
  await p.locator('#map-search-navrhy li').first().click({ timeout: 3000 });
  await p.waitForTimeout(400);
  const hodnota = await pole.inputValue();
  pravda('klepnutí na nabídku vyplní políčko celým názvem', hodnota.length > ZACATEK.length, `„${hodnota}"`);
  pravda('a nabídka se zavře', !(await seznam.isVisible()));
  const poVyberu = await p.locator('#opp-list li.opp-item, #opp-list li').count();
  pravda('výpis po výběru něco ukazuje', poVyberu > 0, `položek: ${poVyberu}`);
} else {
  pravda('klepnutí na nabídku vyplní políčko celým názvem', false, 'nabídka se vůbec neukázala');
  pravda('a nabídka se zavře', false, 'nabídka se vůbec neukázala');
  pravda('výpis po výběru něco ukazuje', false, 'nabídka se vůbec neukázala');
}

// --- 5) Překlep: web nabídne opravu ---------------------------------
const n = norm(OBEC);
const preklep = n.slice(0, 2) + (n.charAt(2) === 'x' ? 'y' : 'x') + n.slice(3);
await pole.fill('');
await pole.type(preklep, { delay: 20 });
await p.waitForTimeout(500);
const text = await p.locator('#opp-list').innerText().catch(() => '');
pravda('při překlepu web nabídne opravu, ne jen „nic nemáme"',
  /Mysleli jste/i.test(text), text.slice(0, 200));
const tlacitko = p.locator('#hledat-opravu');
if (await tlacitko.count() && await tlacitko.isVisible()) {
  await tlacitko.click({ timeout: 3000 });
  await p.waitForTimeout(400);
  const po = await pole.inputValue();
  pravda('a klepnutím se oprava rovnou vyhledá', norm(po) === n, `„${po}"`);
} else {
  pravda('a klepnutím se oprava rovnou vyhledá', false, 'tlačítko s opravou se vůbec neukázalo');
}

/* --- 6) Rychlá volba ceny a výměry: kolik v kterém pásmu je ----------
 *
 * Pásem bylo pět na cenu a čtyři na výměru, a u žádného nebylo vidět,
 * kolik v něm co je. Klepnutí na „nad 2 mil." tak byla sázka naslepo.
 * Teď je pásem osm a osm a u každého stojí počet — který se navíc musí
 * přepočítat podle ostatních filtrů, jinak by to bylo pořád totéž číslo. */
{
  const ctx2 = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx2.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (LEAFLET) {
    await ctx2.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    await ctx2.route(`${BASE}/index.html*`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(3600);

  const cen = await p2.locator('.mc-rychle button[data-cena]').count();
  const vym = await p2.locator('.mc-rychle button[data-plocha]').count();
  pravda('na výběr je aspoň osm pásem ceny', cen >= 8, `jen ${cen}`);
  pravda('a aspoň osm pásem výměry', vym >= 8, `jen ${vym}`);

  const cisla = await p2.$$eval('.mc-rychle button .mc-n', (e) => e.map((x) => x.textContent.trim()));
  pravda('u každého pásma je vidět počet', cisla.length === cen + vym && cisla.every((x) => x !== ''),
    `vyplněno ${cisla.filter((x) => x !== '').length} z ${cen + vym}`);

  // Součet pásem nesmí být větší než celá nabídka (jinak se pásma překrývají).
  const soucet = await p2.evaluate(() => [...document.querySelectorAll('.mc-rychle button[data-cena] .mc-n')]
    .reduce((a, e) => a + (parseInt(e.textContent.replace(/\s/g, ''), 10) || 0), 0));
  const celkem = await p2.evaluate(() => {
    const b = document.querySelector('.filter-chip[data-type="all"] .chip-n');
    return b ? parseInt(b.textContent.replace(/\s/g, ''), 10) : 0;
  });
  pravda('pásma ceny se nepřekrývají', soucet <= celkem, `součet pásem ${soucet}, nabídek ${celkem}`);

  // A hlavně: počty reagují na ostatní filtry.
  const pred = await p2.$$eval('.mc-rychle button[data-cena] .mc-n', (e) => e.map((x) => x.textContent.trim()).join('|'));
  await p2.evaluate(() => {
    const d = document.querySelector('.mc-rychle') && document.querySelector('.mc-rychle').closest('details');
    if (d) d.open = true;
    const b = document.querySelector('.mc-rychle button[data-plocha]');
    if (b) b.click();
  });
  await p2.waitForTimeout(600);
  const po = await p2.$$eval('.mc-rychle button[data-cena] .mc-n', (e) => e.map((x) => x.textContent.trim()).join('|'));
  pravda('počty u ceny se přepočítají podle zvolené výměry', pred !== po,
    `před i po je to totéž: ${po} — počty se počítají mimo ostatní filtry`);
  await ctx2.close();
}

await ctx.close();
await prohlizec.close();
console.log('\nNašeptávač obcí, oprava překlepu a rychlá volba ceny/výměry');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Našeptávač: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
