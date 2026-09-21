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

/** Otevře celoobrazovkový výběr místa a počká, až je mapa opravdu na světě. */
async function otevriVybirac(p, spoustec) {
  // Chybějící tlačítko má skončit poctivým ✕ u kontroly, ne pádem testu.
  await p.locator(spoustec).scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
  await p.locator(spoustec).click({ timeout: 4000 }).catch(() => {});
  await p.waitForSelector('.vm-ov', { timeout: 8000 }).catch(() => {});
  // V CI se Leaflet stahuje ze sítě — čeká se na mapu, ne na hodinky.
  await p.waitForSelector('.vm-ov #vm-mapa .leaflet-map-pane', { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(900);
}
/** Co výběr místa právě ukazuje. */
const stavVybiraku = (p) => p.evaluate(() => {
  const ov = document.querySelector('.vm-ov');
  const mapa = document.getElementById('vm-mapa');
  const kriz = document.querySelector('.vm-kriz span');
  const r = mapa ? mapa.getBoundingClientRect() : null;
  const kr = kriz ? kriz.getBoundingClientRect() : null;
  return {
    otevreno: !!ov,
    vyska: r ? Math.round(r.height) : 0,
    sirka: r ? Math.round(r.width) : 0,
    dlazdice: document.querySelectorAll('#vm-mapa img.leaflet-tile').length,
    kriz: kr ? { w: Math.round(kr.width), h: Math.round(kr.height) } : null,
    kruh: !!document.querySelector('#vm-mapa path[stroke-dasharray]'),
    panel: (() => { const e = document.querySelector('.vm-panel'); if (!e) return ''; const r = e.getBoundingClientRect();
      return `${Math.round(r.width)}×${Math.round(r.height)}`; })(),
    okno: `${innerWidth}×${innerHeight}`,
    panelCela: (() => { const e = document.querySelector('.vm-panel'); if (!e) return false; const r = e.getBoundingClientRect();
      return r.width >= innerWidth - 1 && r.height >= innerHeight - 1; })(),
    pocet: (document.getElementById('vm-pocet') || {}).textContent || '',
    kraju: document.querySelectorAll('#vm-kraj option').length,
    kraj: (document.getElementById('vm-kraj') || {}).value,
    // Okruh je řada přepínačů, ne rozbalovací seznam: všechny možnosti
    // musí být vidět naráz, jinak se o velikosti okolí nikdo nedozví.
    km: (document.querySelector('input[name="vm-km"]:checked') || {}).value,
    kmMoznosti: document.querySelectorAll('input[name="vm-km"]').length,
    meritko: (document.querySelector('.vm-meritko span') || {}).textContent || '',
    ulozeno: !!localStorage.getItem('pk_misto_v1'),
  };
});

// --- 1) Výběr místa je CELÁ MAPA, ne jedno klepnutí ------------------
{
  const { ctx, p, chyby } = await telefon(null);
  await otevriVybirac(p, '#misto-vybrat');
  const v = await stavVybiraku(p);
  pravda('„Vybrat na mapě" otevře výběr místa', v.otevreno,
    'nic se neotevřelo — tlačítko vypadá jako rozbité');
  pravda('a je v něm opravdová mapa', v.vyska > 200 && v.sirka > 200 && v.dlazdice > 0,
    `mapa ${v.sirka}×${v.vyska} px, ${v.dlazdice} dlaždic`);
  // Výběr zabírá celou obrazovku — pod oknem uprostřed stránky prosvítal
  // web a oko uhýbalo k němu místo k mapě.
  pravda('výběr zabírá celou obrazovku', v.panelCela,
    `panel ${v.panel} v okně ${v.okno}`);
  // Kříž byl jednu dobu zmáčknutý na 6 px — nešlo poznat, kam se vlastně míří.
  pravda('kříž uprostřed je vidět a není zmáčknutý',
    v.kriz && v.kriz.w >= 16 && v.kriz.h >= 16 && Math.abs(v.kriz.w - v.kriz.h) <= 4,
    v.kriz ? `${v.kriz.w}×${v.kriz.h} px` : 'kříž tam není');
  pravda('kolem je vidět hlídaný okruh', v.kruh,
    'bez kruhu není poznat, jak velké okolí se vybírá');
  pravda('počet pozemků je vidět hned, ještě před potvrzením', /\d+ pozem/.test(v.pocet), v.pocet);
  /* Kruh sám o sobě řekne „takhle velké to je" jen tomu, kdo si deset
     kilometrů na mapě dokáže představit. Proto se od středu ke kraji
     táhne měřítko s číslem — a okruh se vybírá z viditelné řady, ne
     ze zabaleného seznamu, ve kterém není vidět, co všechno jde zvolit. */
  pravda('velikost okruhu je napsaná přímo na mapě', /^\d+ km$/.test(v.meritko.trim()), `měřítko: „${v.meritko}"`);
  pravda('okruh se vybírá z viditelné řady možností', v.kmMoznosti >= 5, `možností: ${v.kmMoznosti}`);

  // Tečky pozemků: kreslí se do plátna, takže se počítají barevné body.
  const tecek = await p.evaluate(() => {
    const c = document.querySelector('#vm-mapa canvas');
    if (!c) return -1;
    try {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      return n;
    } catch (e) { return -2; }
  });
  pravda('na mapě jsou vidět tečky pozemků', tecek > 500,
    `barevných bodů v plátně: ${tecek} — bez teček se vybírá naslepo`);

  // --- jádro stížnosti: dá se PŘEKLIKÁVAT -----------------------------
  pravda('kraj se dá vybrat', v.kraju >= 15, `v nabídce je jen ${v.kraju} položek`);
  await p.selectOption('#vm-kraj', 'Jihomoravský');
  await p.waitForTimeout(1200);
  const jm = await stavVybiraku(p);
  pravda('volba kraje mapu opravdu přesune', jm.pocet !== v.pocet,
    `před: „${v.pocet.trim()}", po: „${jm.pocet.trim()}"`);
  await p.selectOption('#vm-kraj', 'Ústecký');
  await p.waitForTimeout(1200);
  const us = await stavVybiraku(p);
  pravda('a dá se přepnout na další kraj (a další, a další)', us.pocet !== jm.pocet,
    `Jihomoravský: „${jm.pocet.trim()}", Ústecký: „${us.pocet.trim()}" — tohle dřív nešlo vůbec`);

  // Mapa se dá táhnout a počet se mění při každém pohnutí.
  const box = await p.locator('#vm-mapa').boundingBox();
  async function tahni(dx, dy) {
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
    await p.mouse.up();
    await p.waitForTimeout(900);
    return (await stavVybiraku(p)).pocet;
  }
  const t1 = await tahni(-120, -90);
  pravda('mapa se dá táhnout a počet se hned přepočítá', t1 !== us.pocet,
    `po tažení pořád „${t1.trim()}"`);
  const t2 = await tahni(150, 110);
  pravda('a dá se táhnout znovu, libovolněkrát', t2 !== t1,
    `druhé tažení už počet nezměnilo: „${t1.trim()}" → „${t2.trim()}"`);

  // Hledání obce.
  await p.fill('#vm-hledat', 'Kolín');
  await p.press('#vm-hledat', 'Enter');
  await p.waitForTimeout(1400);
  const poHledani = await stavVybiraku(p);
  pravda('obec se dá najít napsáním', /Kolín/i.test(poHledani.pocet), poHledani.pocet);
  pravda('a nabídka kraje pak neukazuje kraj, ve kterém mapa není',
    poHledani.kraj === '', `zůstalo vybráno „${poHledani.kraj}"`);

  /* Přiblížení se musí řídit okruhem. S pevným zoomem byl kruh o poloměru
     10 km několikanásobně širší než obrazovka — na mapě po něm nebylo ani
     vidu a nebylo poznat, co se vlastně vybírá. */
  const ramec = () => p.evaluate(() => {
    const mapa = document.getElementById('vm-mapa');
    const k = document.querySelector('#vm-mapa path[stroke-dasharray]');
    if (!mapa || !k) return null;
    const m = mapa.getBoundingClientRect(), r = k.getBoundingClientRect();
    return {
      // Kolik z kruhu je vidět v mapě a jak velký je vůči ní.
      vejdeSe: r.left >= m.left - 4 && r.right <= m.right + 4 && r.top >= m.top - 4 && r.bottom <= m.bottom + 4,
      podil: Math.round(100 * r.width / m.width),
    };
  });
  const r10 = await ramec();
  pravda('po najití obce je hlídaný okruh celý vidět', r10 && r10.vejdeSe,
    r10 ? `kruh zabírá ${r10.podil} % šířky mapy a přesahuje ven` : 'kruh na mapě není');
  pravda('a není přitom zbytečně malý', r10 && r10.podil >= 30,
    r10 ? `kruh je jen ${r10.podil} % šířky mapy — mapa je zbytečně oddálená` : 'kruh na mapě není');

  // Okruh.
  await p.check('input[name="vm-km"][value="50"]');
  await p.waitForTimeout(1400);
  const sirsi = await stavVybiraku(p);
  pravda('větší okruh ukáže víc pozemků už ve výběru',
    (parseInt(sirsi.pocet, 10) || 0) > (parseInt(poHledani.pocet, 10) || 0),
    `10 km: „${poHledani.pocet.trim()}", 50 km: „${sirsi.pocet.trim()}"`);
  const r50 = await ramec();
  pravda('a po jeho zvětšení je pořád celý vidět', r50 && r50.vejdeSe && r50.podil >= 30,
    r50 ? `kruh zabírá ${r50.podil} % šířky mapy` : 'kruh na mapě není');

  // Zavřít se dá, aniž se cokoli uloží — to je ta možnost couvnout.
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  const zavreno = await stavVybiraku(p);
  pravda('výběr se dá zavřít, aniž se cokoli uloží',
    !zavreno.otevreno && !zavreno.ulozeno,
    `otevřeno: ${zavreno.otevreno}, uloženo: ${zavreno.ulozeno}`);
  pravda('při výběru místa nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 1b) A hlavně: okolí opravdu OMEZÍ seznam ------------------------
{
  const { ctx, p, chyby } = await telefon(null);
  const cely = await p.evaluate(() => (document.getElementById('mvt-count') || {}).textContent || '');
  // Místo nastavíme přes výběr místa: najdeme obec a potvrdíme.
  await otevriVybirac(p, '#misto-vybrat');
  await p.fill('#vm-hledat', 'Kolín');
  await p.press('#vm-hledat', 'Enter');
  await p.waitForTimeout(1400);
  const nabidka = (await stavVybiraku(p)).pocet;
  await p.click('#vm-ok');
  await p.waitForTimeout(2200);

  const v = await p.evaluate(() => {
    // Čísla se na webu píšou s mezerou po tisících („1 940"), takže se
    // mezery musí nejdřív vyhodit — jinak by z „1 940" vyšla jednička.
    const cislo = (t) => { const m = String(t || '').match(/\d[\d\s\u00a0]*/); return m ? +m[0].replace(/[\s\u00a0]/g, '') : null; };
    const misto = (() => { try { return JSON.parse(localStorage.getItem('pk_misto_v1') || 'null'); } catch (e) { return null; } })();
    // Vzdálenost každé vypsané karty od uloženého místa se spočítat nedá
    // (karta nenese souřadnice), takže se porovnává to, co web tvrdí:
    // číslo v hlavičce, počet v přepínači a čísla u kategorií.
    return {
      vybirac: !!document.querySelector('.vm-ov'),
      vSeznamu: cislo((document.getElementById('mvt-count') || {}).textContent),
      hlavicka: (document.querySelector('.kh-txt b') || {}).textContent || '',
      pod: (document.querySelector('.kh-txt span') || {}).textContent || '',
      znacka: !!document.querySelector('.pk-misto'),
      kruh: !!document.querySelector('#leaflet-map path[stroke-dasharray]'),
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
  const celyPocet = ((cely.match(/\d[\d\s\u00a0]*/) || [''])[0] || '').replace(/[\s\u00a0]/g, '');
  pravda('bez okolí je v seznamu celá republika', +celyPocet > 500, `bylo jen ${celyPocet}`);
  pravda('potvrzení výběr zavře', v.vybirac === false);
  // TOHLE je ta chyba: dřív tu zůstalo 1940.
  pravda('po nastavení místa se seznam zúží na okolí',
    v.vSeznamu != null && v.vSeznamu < +celyPocet / 5,
    `v seznamu zůstalo ${v.vSeznamu} z ${celyPocet} — okolí se neprojevilo`);
  // Co výběr sliboval, to se má i vypsat.
  pravda('vypsaný počet sedí s tím, co výběr sliboval',
    v.vSeznamu === (parseInt(nabidka, 10) || -1),
    `výběr sliboval „${nabidka.trim()}", v seznamu je ${v.vSeznamu}`);
  pravda('hlavička nad mapou říká, že jde o okolí', /okolí/i.test(v.hlavicka), v.hlavicka);
  pravda('a uvádí okruh v kilometrech', /\d+ km/.test(v.pod), v.pod);
  // Hlídané místo musí být vidět i na hlavní mapě, ne jen v textu nad ní.
  pravda('hlídané místo je vidět na hlavní mapě', v.znacka,
    'na mapě se neobjevilo nic — text se změnil, ale mapa zůstala stejná');
  pravda('a je kolem něj vidět hlídaný okruh', v.kruh,
    'bez kruhu není poznat, jak velké okolí se vlastně hlídá');
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
    const m = String((document.getElementById('mvt-count') || {}).textContent || '').match(/\d[\d\s\u00a0]*/);
    return { n: m ? +m[0].replace(/[\s\u00a0]/g, '') : null, pod: (document.querySelector('.kh-txt span') || {}).textContent || '' };
  });
  pravda('větší okruh ukáže víc pozemků', siroky.n > v.vSeznamu,
    `do 10 km ${v.vSeznamu}, do 50 km ${siroky.n}`);
  pravda('a hlavička se změní taky', /50 km/.test(siroky.pod), siroky.pod);

  // Místo se dá vybrat ZNOVU — ne že jednou klepnu a je konec.
  const jdeZmenit = await p.locator('#misto-zmenit').isVisible().catch(() => false);
  pravda('u uloženého místa je tlačítko „Změnit místo"', jdeZmenit,
    'jediná cesta jinam vedla přes „Zrušit místo" a začít od nuly');
  await otevriVybirac(p, '#misto-zmenit');
  const znovu = await stavVybiraku(p);
  pravda('výběr místa se dá otevřít znovu', znovu.otevreno,
    'po jednom výběru už se nedá nic změnit — přesně na tohle si člověk stěžoval');
  pravda('a pamatuje si zvolený okruh', znovu.km === '50', `nabízí ${znovu.km} km místo 50`);
  if (znovu.otevreno) {
    await p.fill('#vm-hledat', 'Tábor');
    await p.press('#vm-hledat', 'Enter');
    await p.waitForTimeout(1400);
    await p.click('#vm-ok');
    await p.waitForTimeout(2200);
    const druhe = await p.evaluate(() => ({
      hlavicka: (document.querySelector('.kh-txt b') || {}).textContent || '',
      misto: (() => { try { return JSON.parse(localStorage.getItem('pk_misto_v1') || 'null'); } catch (e) { return null; } })(),
    }));
    pravda('druhý výběr hlídané místo opravdu přepíše',
      druhe.misto && v.misto && (Math.abs(druhe.misto.lat - v.misto.lat) > 0.1 || Math.abs(druhe.misto.lng - v.misto.lng) > 0.1),
      `${JSON.stringify(v.misto)} → ${JSON.stringify(druhe.misto)}`);
    pravda('a hlavička se přepíše s ním', /okolí/i.test(druhe.hlavicka), druhe.hlavicka);
  } else {
    pravda('druhý výběr hlídané místo opravdu přepíše', false, 'výběr místa se podruhé vůbec neotevřel');
    pravda('a hlavička se přepíše s ním', false, 'výběr místa se podruhé vůbec neotevřel');
  }

  // A dá se vrátit na celou republiku.
  await p.locator('#misto-zapnout').scrollIntoViewIfNeeded();
  await p.locator('#misto-zapnout').click();
  await p.waitForTimeout(1500);
  const zpet = await p.evaluate(() => {
    const m = String((document.getElementById('mvt-count') || {}).textContent || '').match(/\d[\d\s\u00a0]*/);
    return { n: m ? +m[0].replace(/[\s\u00a0]/g, '') : null, ulozeno: !!localStorage.getItem('pk_misto_v1') };
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
      const m = String((document.getElementById('mvt-count') || {}).textContent || '').match(/\d[\d\s\u00a0]*/);
      return m ? +m[0].replace(/[\s\u00a0]/g, '') : 0;
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
    return { ceka: !!b && b.disabled, text: (b || {}).textContent || '', okno: !!document.querySelector('.vm-ov, .loc-ov') };
  });
  pravda('tlačítko hned dá najevo, že se něco děje', hned.ceka || hned.okno,
    `po 0,25 s: tlačítko „${hned.text.trim()}", okno ${hned.okno}`);
  await p.waitForSelector('.vm-ov', { timeout: 12000 }).catch(() => {});
  const cekani = (Date.now() - t0) / 1000;
  await p.waitForSelector('.vm-ov #vm-mapa .leaflet-map-pane', { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(600);
  const v = await p.evaluate(() => {
    const mapa = document.getElementById('vm-mapa');
    const r = mapa ? mapa.getBoundingClientRect() : null;
    return {
      okno: !!document.querySelector('.vm-ov'),
      mapa: !!r && r.height > 200,
      hledat: !!document.getElementById('vm-hledat'),
      kraj: document.querySelectorAll('#vm-kraj option').length,
      tlacitko: (document.getElementById('map-near') || {}).textContent || '',
      zakazano: !!document.getElementById('map-near')?.disabled,
    };
  });
  /* Dřív se tu otevíralo okénko „Kde hledat?", které chtělo napsat obec —
     a malou vesnici v datech nenajde, takže to končilo slepou uličkou.
     Teď se otevře mapa, na které si místo každý ukáže sám. */
  pravda('bez polohy se otevře mapa, kde si místo vyberu sám', v.okno && v.mapa,
    `okno ${v.okno}, mapa ${v.mapa}`);
  pravda('a je v ní i hledání obce a výběr kraje', v.hledat && v.kraj >= 15,
    `hledání ${v.hledat}, krajů ${v.kraj}`);
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

  await p.waitForSelector('.vm-ov', { timeout: 15000 }).catch(() => {});
  const cekani = (Date.now() - t0) / 1000;
  const konec = await p.evaluate(() => ({
    okno: !!document.querySelector('.vm-ov'),
    tlacitko: (document.getElementById('map-near') || {}).textContent || '',
    zakazano: !!document.getElementById('map-near')?.disabled,
  }));
  pravda('po marném čekání se otevře mapa výběru místa', konec.okno,
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
