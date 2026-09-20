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
// 2) OKOLÍ NEOMEZILO SEZNAM. Tohle byl ten hlavní důvod, proč obojí „moc
//    nefungovalo". „Pozemky v okolí" seznam jen SEŘADILY podle vzdálenosti —
//    zůstalo v něm všech 1953 pozemků z celé republiky. „Hlídat lokalitu"
//    zase jen spočítalo, co u vás od minule přibylo, a na seznam nesáhlo
//    vůbec. Web tedy napsal „hlídáme Loučeň a okolí do 10 km" a pod tím
//    vypsal pozemky z celé republiky. Čísla u kategorií k tomu hlásila
//    „Vše 1940", zatímco v seznamu bylo deset položek.
//
// 3) „POZEMKY V OKOLÍ" MLČELY DESET SEKUND. Hláška „Zjišťuji vaši polohu…"
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

  // V CI se Leaflet stahuje ze sítě — na mapu se čeká, ne na hodinky.
  await p.waitForSelector('#leaflet-map .leaflet-map-pane', { timeout: 25000 }).catch(() => {});
  const box = await p.locator('#leaflet-map').boundingBox();
  pravda('mapa má na obrazovce svoje místo', !!box && box.height > 200,
    box ? `jen ${Math.round(box.height)} px na výšku` : 'mapa se nevykreslila');
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
  pravda('proužek řekne, co se hlídá',
    /Hlídané místo/.test(po.pod) && /okolí do \d+ km/.test(po.pod), po.pod);
  pravda('při výběru místa nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 1b) A hlavně: okolí opravdu OMEZÍ seznam ------------------------
{
  const { ctx, p, chyby } = await telefon(null);
  // Nastavíme místo klepnutím do mapy.
  await p.locator('#misto-vybrat').scrollIntoViewIfNeeded();
  await p.locator('#misto-vybrat').click();
  await p.waitForTimeout(1400);
  await p.waitForSelector('#leaflet-map .leaflet-map-pane', { timeout: 25000 }).catch(() => {});
  const box = await p.locator('#leaflet-map').boundingBox();
  const cely = await p.evaluate(() => (document.getElementById('mvt-count') || {}).textContent || '');
  await p.mouse.click(box.x + box.width * 0.45, box.y + Math.min(box.height * 0.45, 300));
  await p.waitForTimeout(2200);

  const v = await p.evaluate(() => {
    const cislo = (t) => { const m = String(t || '').match(/(\d+)/); return m ? +m[1] : null; };
    const misto = (() => { try { return JSON.parse(localStorage.getItem('pk_misto_v1') || 'null'); } catch (e) { return null; } })();
    // Vzdálenost každé vypsané karty od uloženého místa se spočítat nedá
    // (karta nenese souřadnice), takže se porovnává to, co web tvrdí:
    // číslo v hlavičce, počet v přepínači a čísla u kategorií.
    return {
      vSeznamu: cislo((document.getElementById('mvt-count') || {}).textContent),
      hlavicka: (document.querySelector('.kh-txt b') || {}).textContent || '',
      pod: (document.querySelector('.kh-txt span') || {}).textContent || '',
      cipy: [...document.querySelectorAll('.filter-chip')]
        .filter((b) => b.style.display !== 'none')
        .map((b) => ({ typ: b.getAttribute('data-type'), n: cislo(b.querySelector('.chip-n')?.textContent) })),
      misto,
      karet: document.querySelectorAll('.opp-item').length,
      // Dvě různé nabídky v jedné vsi jsou normální — duplicita je až tehdy,
      // když se shoduje celý obsah karty (obec, cena, výměra).
      karty: [...document.querySelectorAll('.opp-item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    };
  });
  const celyPocet = (cely.match(/(\d+)/) || [])[1];
  pravda('bez okolí je v seznamu celá republika', +celyPocet > 500, `bylo jen ${celyPocet}`);
  // TOHLE je ta chyba: dřív tu zůstalo 1940.
  pravda('po nastavení místa se seznam zúží na okolí',
    v.vSeznamu != null && v.vSeznamu < +celyPocet / 5,
    `v seznamu zůstalo ${v.vSeznamu} z ${celyPocet} — okolí se neprojevilo`);
  pravda('hlavička nad mapou říká, že jde o okolí', /okolí/i.test(v.hlavicka), v.hlavicka);
  pravda('a uvádí okruh v kilometrech', /\d+ km/.test(v.pod), v.pod);
  // Druhá polovina té chyby: čísla u kategorií zůstávala za celou ČR.
  const vse = v.cipy.find((c) => c.typ === 'all');
  pravda('čísla u kategorií sedí s tím, co je v seznamu',
    vse && vse.n === v.vSeznamu,
    `„Vše" hlásí ${vse && vse.n}, v seznamu je ${v.vSeznamu}`);
  const soucet = v.cipy.filter((c) => c.typ !== 'all').reduce((a, c) => a + (c.n || 0), 0);
  pravda('a dávají dohromady součet', soucet === vse.n, `${soucet} × ${vse.n}`);
  pravda('místo dostalo jméno podle nejbližší obce', !!(v.misto && v.misto.nazev), JSON.stringify(v.misto));

  // Ve výpisu nesmí být tentýž pozemek dvakrát.
  const dvakrat = [...new Set(v.karty.filter((o, i) => v.karty.indexOf(o) !== i))];
  pravda('ve výpisu není táž nabídka dvakrát', dvakrat.length === 0,
    'opakuje se: ' + dvakrat.map((x) => x.slice(0, 60)).join(' || '));
  /* Ve vybraném okruhu duplicita být nemusí, takže by tahle kontrola sama
     mlčela i s rozbitým odstraňováním. Spočítáme si proto rovnou z dat,
     kolik nabídek po odstranění duplicit zbýt MÁ, a porovnáme s tím, co
     web hlásí za celou republiku. */
  const surova = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
  const klice = new Set(surova.map((d) => [d.place, d.okres, d.price, d.area, d.druh].join('|')));
  pravda('v datech vůbec nějaké duplicity jsou (jinak test nic nedokazuje)',
    klice.size < surova.length,
    `v souboru je ${surova.length} nabídek a všechny jsou jedinečné`);
  pravda('web ukazuje data bez duplicit',
    +celyPocet === klice.size,
    `web hlásí ${celyPocet}, po odstranění duplicit má být ${klice.size} (v souboru ${surova.length})`);

  // Okruh se dá změnit a seznam na to zareaguje.
  await p.locator('#misto-km').scrollIntoViewIfNeeded();
  await p.selectOption('#misto-km', '50');
  await p.waitForTimeout(1600);
  const siroky = await p.evaluate(() => {
    const m = String((document.getElementById('mvt-count') || {}).textContent || '').match(/(\d+)/);
    return { n: m ? +m[1] : null, pod: (document.querySelector('.kh-txt span') || {}).textContent || '' };
  });
  pravda('větší okruh ukáže víc pozemků', siroky.n > v.vSeznamu,
    `do 10 km ${v.vSeznamu}, do 50 km ${siroky.n}`);
  pravda('a hlavička se změní taky', /50 km/.test(siroky.pod), siroky.pod);

  // A dá se vrátit na celou republiku.
  await p.locator('#misto-zapnout').scrollIntoViewIfNeeded();
  await p.locator('#misto-zapnout').click();
  await p.waitForTimeout(1500);
  const zpet = await p.evaluate(() => {
    const m = String((document.getElementById('mvt-count') || {}).textContent || '').match(/(\d+)/);
    return { n: m ? +m[1] : null, ulozeno: !!localStorage.getItem('pk_misto_v1') };
  });
  pravda('přepínač vrátí celou republiku', zpet.n === +celyPocet, `${zpet.n} × ${celyPocet}`);
  pravda('a místo přitom zůstane uložené', zpet.ulozeno,
    'vypnutí zobrazení nesmí zahodit hlídané místo');
  pravda('při práci s okolím nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 1c) Prázdný okruh poradí, místo aby mlčel -----------------------
{
  const { ctx, p } = await telefon(null);
  await p.evaluate(() => {
    // Místo uprostřed republiky s malým okruhem — ať je jistota, že bude prázdno.
    localStorage.setItem('pk_misto_v1', JSON.stringify({ lat: 49.74, lng: 15.34, km: 2, nazev: null }));
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4200);
  await p.locator('#misto-zapnout').scrollIntoViewIfNeeded();
  await p.locator('#misto-zapnout').click();
  await p.waitForTimeout(1800);
  const v = await p.evaluate(() => ({
    zprava: (document.querySelector('.opp-list .map-count') || {}).textContent || '',
    vetsi: !!document.querySelector('#okoli-vic'),
    pryc: !!document.querySelector('#okoli-pryc'),
  }));
  pravda('prázdný okruh to řekne narovinu', /nic není/.test(v.zprava), v.zprava.slice(0, 90));
  pravda('a rovnou nabídne větší okruh', v.vetsi,
    'bez nabídky zůstane člověk u prázdného seznamu a neví, co dál');
  pravda('i cestu zpátky na celou ČR', v.pryc);
  // Nabídka musí opravdu fungovat.
  if (v.vetsi) {
    await p.locator('#okoli-vic').click();
    await p.waitForTimeout(1600);
    const po = await p.evaluate(() => {
      const m = String((document.getElementById('mvt-count') || {}).textContent || '').match(/(\d+)/);
      return m ? +m[1] : 0;
    });
    pravda('po zvětšení okruhu se něco najde', po > 0, `pořád ${po}`);
  }
  // Pády: název obce se nesmí ohýbat („od Loučeň" je stejná bota jako
  // „v Vysočina kraji").
  const texty = await p.evaluate(() => [
    (document.querySelector('.kh-txt b') || {}).textContent,
    (document.querySelector('.mp-pod') || {}).textContent,
    (document.querySelector('.opp-list .map-count') || {}).textContent,
  ].join(' | '));
  pravda('nikde se neskloňuje název obce', !/\bod [A-ZŠČŘŽÝÁÍÉŮÚĎŤŇ][a-zěščřžýáíéúůďťň]+\b(?! \()/.test(texty),
    texty.slice(0, 120));
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
  pravda('podnadpis řekne okruh i počet',
    /\d+ km/.test(v.pod) && /pozem/.test(v.pod), v.pod);
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
