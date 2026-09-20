// Test: hlídání místa a „Pozemky v okolí" — dvě věci, které tiše nefungovaly.
//
// Spuštění: node scripts/test-okoli.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// 1) HLÍDANÉ MÍSTO SE NEKRESLILO NA MAPU. Funkce, která má místo „vykreslit",
//    přepisovala jen text v proužku nad mapou. Člověk tedy klepl do mapy
//    (web ho o to sám požádal), proužek se změnil — a na mapě se nestalo nic.
//    Kdo se přitom díval na mapu, viděl, že se nic nestalo, a měl pravdu.
//
// 2) „POZEMKY V OKOLÍ" MLČELY DESET SEKUND. Hláška „Zjišťuji vaši polohu…"
//    zmizela po 2,6 s, žádost o polohu měla limit 10 s a teprve po něm se
//    ukázalo okno „Kde hledat?". Mezi tím se nedělo vůbec nic. Na telefonu
//    s vypnutou polohou se to chová přesně jako rozbité tlačítko.
//
// Obojí je typ chyby, který nikde nespadne a žádný jiný test nechytí:
// web funguje, jen mlčí.
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

const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/** Telefon. Volitelně s povolenou polohou. */
async function telefon(poloha) {
  const ctx = await prohlizec.newContext(Object.assign({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 2, locale: 'cs-CZ',
  }, poloha ? { permissions: ['geolocation'], geolocation: poloha } : { permissions: [] }));
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return r.abort();
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
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', (e) => chyby.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4200);
  return { ctx, p, chyby };
}

// --- 1) Hlídané místo je vidět NA MAPĚ -------------------------------
{
  const { ctx, p, chyby } = await telefon(null);
  await p.locator('#misto-vybrat').scrollIntoViewIfNeeded();
  await p.locator('#misto-vybrat').click();
  await p.waitForTimeout(1400);
  const rezim = await p.evaluate(() => ({
    vyzva: (document.querySelector('.mp-hlavni') || {}).textContent || '',
    rezim: document.body.classList.contains('vybiram-misto'),
    mapaVidet: (() => { const m = document.getElementById('leaflet-map'); if (!m) return false;
      const r = m.getBoundingClientRect(); return r.height > 200 && r.top < innerHeight && r.bottom > 0; })(),
  }));
  pravda('„Vybrat na mapě" vyzve ke klepnutí do mapy', /Klepněte do mapy/.test(rezim.vyzva), rezim.vyzva);
  pravda('a mapu k tomu opravdu ukáže', rezim.mapaVidet,
    'web řekne „klepněte do mapy" a mapa přitom není vidět');

  const box = await p.locator('#leaflet-map').boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
  await p.waitForTimeout(1600);
  const po = await p.evaluate(() => ({
    znacka: !!document.querySelector('.pk-misto'),
    kruh: !!document.querySelector('#leaflet-map path[stroke-dasharray]'),
    pod: (document.querySelector('.mp-pod') || {}).textContent || '',
    rezim: document.body.classList.contains('vybiram-misto'),
    ulozeno: (() => { try { return !!JSON.parse(localStorage.getItem('pk_misto_v1') || 'null'); } catch (e) { return false; } })(),
  }));
  // Tohle je jádro: značka NA MAPĚ, ne jen změněný text nad ní.
  pravda('po klepnutí je hlídané místo vidět na mapě', po.znacka,
    'na mapě se neobjevilo vůbec nic — text nad mapou se změnil, ale mapa zůstala stejná');
  pravda('a je kolem něj vidět hlídaný okruh', po.kruh,
    'bez kruhu není poznat, jak velké okolí se vlastně hlídá');
  pravda('místo se uložilo', po.ulozeno);
  pravda('a režim výběru se ukončil', po.rezim === false);
  pravda('proužek řekne, co se hlídá', /Hlídáme .* do \d+ km/.test(po.pod), po.pod);
  pravda('při výběru místa nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 2) „Pozemky v okolí" s povolenou polohou ------------------------
{
  const { ctx, p, chyby } = await telefon({ latitude: 49.95, longitude: 14.30 });
  await p.locator('#map-near').scrollIntoViewIfNeeded();
  await p.locator('#map-near').click();
  await p.waitForTimeout(3000);
  const v = await p.evaluate(() => ({
    hlavicka: (document.querySelector('.kh-txt b') || {}).textContent || '',
    pod: (document.querySelector('.kh-txt span') || {}).textContent || '',
    jaJsemTu: !!document.querySelector('.pk-me'),
    tlacitkoOn: !!document.getElementById('map-near')?.classList.contains('on'),
    tlacitkoText: (document.getElementById('map-near') || {}).textContent || '',
  }));
  pravda('s povolenou polohou se přepne do režimu okolí', /okolí/i.test(v.hlavicka), v.hlavicka);
  pravda('a je vidět, kde jste', v.jaJsemTu);
  pravda('podnadpis řekne, kolik je pozemků kolem', /km od vás/.test(v.pod), v.pod);
  pravda('tlačítko se vrátí do normálního stavu', /Pozemky v okolí/.test(v.tlacitkoText),
    `zůstalo na „${v.tlacitkoText.trim()}"`);
  pravda('při hledání okolí nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 3) Bez polohy se web neodmlčí -----------------------------------
{
  const { ctx, p } = await telefon(null);
  await p.locator('#map-near').scrollIntoViewIfNeeded();
  const t0 = Date.now();
  await p.locator('#map-near').click();
  // Odezva musí přijít HNED, ne až po vypršení limitu.
  await p.waitForTimeout(250);
  const hned = await p.evaluate(() => {
    const b = document.getElementById('map-near');
    return { ceka: !!b && b.disabled, text: (b || {}).textContent || '', okno: !!document.querySelector('.loc-ov') };
  });
  pravda('tlačítko hned dá najevo, že se něco děje', hned.ceka || hned.okno,
    `po 0,25 s: tlačítko „${hned.text.trim()}", okno ${hned.okno}`);
  await p.waitForSelector('.loc-ov', { timeout: 12000 }).catch(() => {});
  const cekani = (Date.now() - t0) / 1000;
  const v = await p.evaluate(() => ({
    okno: !!document.querySelector('.loc-ov'),
    text: (document.querySelector('.loc-card') || {}).textContent || '',
    tlacitko: (document.getElementById('map-near') || {}).textContent || '',
    zakazano: !!document.getElementById('map-near')?.disabled,
  }));
  pravda('bez polohy se nabídne napsat obec', v.okno && /Kde hledat/.test(v.text), v.text.slice(0, 60));
  pravda('a nečeká se na to deset vteřin', cekani < 8,
    `okno přišlo až po ${cekani.toFixed(1)} s — tak dlouhé ticho se čte jako „nefunguje to"`);
  pravda('tlačítko se potom dá zase zmáčknout', v.zakazano === false && /Pozemky v okolí/.test(v.tlacitko),
    `zůstalo „${v.tlacitko.trim()}", zakázané: ${v.zakazano}`);
  await ctx.close();
}

// --- 4) Když poloha „visí" --------------------------------------------
// Na telefonu s vypnutou polohou prohlížeč neodmítne hned: mlčí až do
// vypršení limitu. Právě tenhle případ byl rozbitý a Playwright ho sám od
// sebe nenapodobí (bez povolení odmítne okamžitě), takže se tu rozhraní pro
// polohu podstrčí — chová se jako prohlížeč, jen nikdy nic nenajde.
{
  const { ctx, p } = await telefon(null);
  await p.evaluate(() => {
    navigator.geolocation.getCurrentPosition = function (uspech, chyba, nast) {
      const limit = (nast && nast.timeout) || 30000;
      window.__pozadanyLimit = limit;
      setTimeout(function () { if (chyba) chyba({ code: 3, message: 'timeout' }); }, limit);
    };
  });
  await p.locator('#map-near').scrollIntoViewIfNeeded();
  const t0 = Date.now();
  await p.locator('#map-near').click();
  await p.waitForTimeout(400);
  const behem = await p.evaluate(() => {
    const b = document.getElementById('map-near');
    return { text: (b || {}).textContent || '', zakazano: !!(b && b.disabled),
      tocise: !!document.querySelector('.mnb-ceka'), limit: window.__pozadanyLimit };
  });
  pravda('zatímco se čeká, tlačítko to říká', /Zjišťuji polohu/.test(behem.text),
    `tlačítko hlásí „${behem.text.trim()}" — po klepnutí se nesmí tvářit, že se nic neděje`);
  pravda('a nejde ho zmáčknout podruhé', behem.zakazano,
    'druhé klepnutí spustí druhý dotaz a čeká se znovu od začátku');
  pravda('má u sebe i točící se kolečko', behem.tocise);
  pravda('na polohu se čeká nejvýš šest vteřin', behem.limit <= 6000,
    `žádá se o limit ${behem.limit} ms — tak dlouhé ticho se čte jako „nefunguje to"`);

  await p.waitForSelector('.loc-ov', { timeout: 15000 }).catch(() => {});
  const cekani = (Date.now() - t0) / 1000;
  const konec = await p.evaluate(() => ({
    okno: !!document.querySelector('.loc-ov'),
    tlacitko: (document.getElementById('map-near') || {}).textContent || '',
    zakazano: !!document.getElementById('map-near')?.disabled,
  }));
  pravda('po marném čekání se nabídne napsat obec', konec.okno,
    `po ${cekani.toFixed(1)} s se neukázalo nic`);
  pravda('a čekání netrvá déle než sedm vteřin', cekani < 7, `trvalo ${cekani.toFixed(1)} s`);
  pravda('tlačítko se vrátí do původního stavu',
    konec.zakazano === false && /Pozemky v okolí/.test(konec.tlacitko),
    `zůstalo „${konec.tlacitko.trim()}"`);
  await ctx.close();
}

await prohlizec.close();
console.log('\nHlídané místo a pozemky v okolí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Okolí: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
