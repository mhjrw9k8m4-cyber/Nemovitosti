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
import { createRequire } from 'node:module';
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
  /* Vrací výsledek, aby se na něm dalo větvit. Bez toho je `!pravda(…)`
     vždycky pravda a celý navazující oddíl se tiše přeskočí — a přitom
     se vypíše ✓ té jedné kontroly, která proběhla. Přesně tak se to
     tady jednou stalo. */
  return !!vyslo;
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
/** Posune mapu výběru na dané místo a MÍSTO UKÁŽE — bez hledání, jak to
    musí umět i člověk. Samotné posunutí mapy zvenčí je jen nastavení
    pohledu; dokud se do mapy neklepne (nebo se netáhne), výběr se
    nepotvrzuje — jinak by šlo uložit okolí náhodného bodu. */
async function jdiNaMisto(p, lat, lng, z = 10) {
  // Pozor na `return` mapy: Leaflet vrací sám sebe a Playwright takový
  // objekt neumí poslat zpátky („object reference chain is too long").
  await p.evaluate(([la, ln, zz]) => { if (window.PK_VM_MAPA) window.PK_VM_MAPA.setView([la, ln], zz); },
    [lat, lng, z]);
  await p.waitForTimeout(900);
  const b = await p.locator('#vm-mapa').boundingBox();
  await p.mouse.click(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2));
  await p.waitForTimeout(1200);
}
/** Klepnutí do mapy výběru — tím se místo ukazuje. */
async function klepniDoMapy(p, fx = 0.5, fy = 0.5) {
  const b = await p.locator('#vm-mapa').boundingBox();
  await p.mouse.click(Math.round(b.x + b.width * fx), Math.round(b.y + b.height * fy));
  await p.waitForTimeout(1300);
}
/** Co výběr místa právě ukazuje. */
const stavVybiraku = (p) => p.evaluate(() => {
  const ov = document.querySelector('.vm-ov');
  const mapa = document.getElementById('vm-mapa');
  const kriz = document.querySelector('.vm-znacka span');
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
    /* Výběr místa je jen mapa. Žádné psaní obce ani seznam krajů — člověk
       ukáže prstem, kde to má být. Kdyby se hledání vrátilo, je to zpátky
       formulář, a přesně tomu se tu chceme vyhnout. */
    hledani: !!document.getElementById('vm-hledat') || !!document.getElementById('vm-kraj'),
    // Okruh je řada přepínačů, ne rozbalovací seznam: všechny možnosti
    // musí být vidět naráz, jinak se o velikosti okolí nikdo nedozví.
    km: (document.querySelector('input[name="vm-km"]:checked') || {}).value,
    kmMoznosti: document.querySelectorAll('input[name="vm-km"]').length,
    meritko: (document.querySelector('.vm-meritko span') || {}).textContent || '',
    potvrditJde: (() => { const b = document.getElementById('vm-ok'); return !!b && !b.disabled; })(),
    ulozeno: !!localStorage.getItem('pk_misto_v1'),
  };
});

// --- 1) Výběr místa je CELÁ MAPA, ne jedno klepnutí ------------------
{
  const { ctx, p, chyby } = await telefon(null);
  await otevriVybirac(p, '#map-near');
  const v = await stavVybiraku(p);
  pravda('„Pozemky v okolí" otevře rovnou mapu', v.otevreno,
    'nic se neotevřelo — tlačítko vypadá jako rozbité');
  /* Dřív se tlačítko nejdřív ptalo na polohu a při zákazu skončilo okénkem
     „napište obec". Na telefonu se zakázanou polohou to znamenalo, že
     hlavní akce webu nikdy neudělala to, co slibuje. */
  pravda('a neptá se předtím na polohu ani na obec',
    !(await p.evaluate(() => !!document.querySelector('.loc-ov'))),
    'místo mapy se otevřelo okénko „Kde hledat?"');
  pravda('ve výběru není žádné hledání — jen mapa', v.hledani === false,
    'v panelu je pole na psaní obce nebo seznam krajů');
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
  /* Pravidlo se nezměnilo: NEJDE POTVRDIT, CO NENÍ VIDĚT.
     Změnilo se, jak se drží. Dřív se při pohledu na celou republiku
     kreslil okruh 10 km jako puntík o 26 px a pod ním stál počet pozemků
     u náhodného bodu uprostřed ČR — vypadalo to jako porucha a potvrdit
     to šlo. Teď se v tom měřítku okruh nekreslí, místo počtu stojí další
     krok a POTVRDIT NEJDE; jakmile se vybere kraj nebo najde obec, objeví
     se okruh, měřítko i počet a potvrzení se odemkne.
     Kontroluje se tedy obojí: že se naslepo potvrdit nedá, a že po volbě
     místa je vidět všechno, co bylo vidět dřív. */
  pravda('naslepo potvrdit nejde', v.potvrditJde === false,
    'při pohledu na celou ČR není okruh vidět, a přesto jde potvrdit');
  pravda('a místo počtu stojí, co udělat nejdřív',
    /klepnut/i.test(v.pocet), v.pocet || '(prázdno)');

  /* Klepnutí do mapy je jediný způsob, jak se sem člověk dostane — musí
     tedy z pohledu na celou republiku opravdu přiblížit až tam, kde je
     okruh vidět a dá se potvrdit. */
  const zoom0 = await p.evaluate(() => window.PK_VM_MAPA.getZoom());
  await klepniDoMapy(p, 0.5, 0.45);
  const vk = await stavVybiraku(p);
  const zoom1 = await p.evaluate(() => window.PK_VM_MAPA.getZoom());
  pravda('klepnutí do mapy přiblíží', zoom1 > zoom0, `${zoom0} → ${zoom1}`);
  pravda('po klepnutí je vidět hlídaný okruh', vk.kruh,
    'bez kruhu není poznat, jak velké okolí se vybírá');
  pravda('a počet pozemků ještě před potvrzením', /\d+ pozem/.test(vk.pocet), vk.pocet);
  pravda('a potvrdit už jde', vk.potvrditJde === true, 'okruh je vidět, ale potvrdit nejde');
  /* Kruh sám o sobě řekne „takhle velké to je" jen tomu, kdo si deset
     kilometrů na mapě dokáže představit. Proto se od středu ke kraji
     táhne měřítko s číslem — a okruh se vybírá z viditelné řady, ne
     ze zabaleného seznamu, ve kterém není vidět, co všechno jde zvolit. */
  pravda('velikost okruhu je napsaná přímo na mapě', /^\d+ km$/.test(vk.meritko.trim()), `měřítko: „${vk.meritko}"`);
  pravda('okruh se vybírá z viditelné řady možností', v.kmMoznosti >= 5, `možností: ${v.kmMoznosti}`);
  /* Když je okruh vidět, další klepnutí už nemá skákat měřítkem — jen
     posune střed, aby se dal výběr doladit. */
  const zoomPred = await p.evaluate(() => window.PK_VM_MAPA.getZoom());
  await klepniDoMapy(p, 0.62, 0.42);
  const zoomPo = await p.evaluate(() => window.PK_VM_MAPA.getZoom());
  pravda('další klepnutí už jen posune střed, neskáče měřítkem', zoomPo === zoomPred,
    `${zoomPred} → ${zoomPo}`);

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
  await jdiNaMisto(p, 49.195, 16.608);   // Brno
  const jm = await stavVybiraku(p);
  pravda('výběr se dá přesunout jinam', jm.pocet !== v.pocet,
    `před: „${v.pocet.trim()}", po: „${jm.pocet.trim()}"`);
  await jdiNaMisto(p, 50.661, 14.032);   // Ústí nad Labem
  const us = await stavVybiraku(p);
  pravda('a dá se přesunout znovu (a znovu, a znovu)', us.pocet !== jm.pocet,
    `Brno: „${jm.pocet.trim()}", Ústí: „${us.pocet.trim()}" — tohle dřív nešlo vůbec`);

  /* TAŽENÍ UŽ VÝBĚR NEMĚNÍ — a je to záměr, ne regrese.
     Dřív bylo vybrané místo to, co je právě uprostřed mapy, takže každé
     posunutí i přiblížení ho přepsalo. Kdo se chtěl jen oddálit a
     podívat, kam až deset kilometrů sahá, tím zároveň vybral jinde.
     Teď se mapa posouvá volně a místo se mění jedině klepnutím —
     to musí jít pořád, libovolněkrát (ověřeno o pár řádků výš). */
  const box = await p.locator('#vm-mapa').boundingBox();
  const pred = (await stavVybiraku(p)).pocet;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 90, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(900);
  const poTazeni = (await stavVybiraku(p)).pocet;
  pravda('tažením mapy se vybrané místo nezmění', poTazeni === pred,
    `před tažením „${pred.trim()}", po tažení „${poTazeni.trim()}"`);
  // Ale klepnutí ho pořád přesune — jinak by výběr nešel opravit.
  await klepniDoMapy(p, 0.35, 0.35);
  const poKlepnuti = (await stavVybiraku(p)).pocet;
  pravda('ale klepnutí ho přesune dál', poKlepnuti !== poTazeni,
    `po klepnutí pořád „${poKlepnuti.trim()}"`);

  // Panel pořád ví, u které obce se právě je — jen se k ní dojde mapou.
  await jdiNaMisto(p, 50.028, 15.200);   // Kolín
  const uKolina = await stavVybiraku(p);
  /* Obec se pojmenuje podle nejbližšího pozemku v datech, ne podle seznamu
     okresních měst — u Kolína tak vyjde sousední vesnice. Kontroluje se
     proto to, na čem záleží: že výběr vůbec řekne, KDE se člověk nachází. */
  pravda('výběr sám pojmenuje obec, u které se zrovna je',
    /u obce \s*\S/.test(uKolina.pocet), uKolina.pocet);

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
  pravda('po přesunu na obec je hlídaný okruh celý vidět', r10 && r10.vejdeSe,
    r10 ? `kruh zabírá ${r10.podil} % šířky mapy a přesahuje ven` : 'kruh na mapě není');
  pravda('a není přitom zbytečně malý', r10 && r10.podil >= 30,
    r10 ? `kruh je jen ${r10.podil} % šířky mapy — mapa je zbytečně oddálená` : 'kruh na mapě není');

  // Okruh.
  await p.check('input[name="vm-km"][value="50"]');
  await p.waitForTimeout(1400);
  const sirsi = await stavVybiraku(p);
  pravda('větší okruh ukáže víc pozemků už ve výběru',
    (parseInt(sirsi.pocet, 10) || 0) > (parseInt(uKolina.pocet, 10) || 0),
    `10 km: „${uKolina.pocet.trim()}", 50 km: „${sirsi.pocet.trim()}"`);
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
  await otevriVybirac(p, '#map-near');
  await jdiNaMisto(p, 50.028, 15.200);   // Kolín
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
  /* Dražby po termínu se do počtu nepočítají — dražit se po termínu nedá,
     takže to není příležitost (viz scripts/test-vypadky.mjs). Bez tohohle
     pravidla by kontrola hlásila rozdíl pokaždé, když v datech zrovna
     nějaká prošlá dražba je, a vypadalo by to jako rozbité odstraňování
     duplicit. Datum se čte touž funkcí jako v prohlížeči. */
  // js/terminy.js se věší na globalThis, není to modul pro require —
  // načteme ho stejně, jako to dělá generátor stránek.
  new Function(readFileSync(new URL('../js/terminy.js', import.meta.url), 'utf8'))();
  const T = globalThis.PK_TERMINY;
  const zive = surova.filter((d) => { const n = T.daysUntil(d.extra); return !(n != null && n < 0); });
  /* Pravidlo pro duplicity se tu dřív počítalo vlastní kopií (shoda obce,
     okresu, ceny, výměry a druhu). Jenže tahle kopie se rozešla s tím, co
     web opravdu dělá: shoda v těchhle pěti údajích ještě neznamená týž
     pozemek — v Polici nad Metují měly čtyři sousední parcely stejnou
     výměru i vyvolávací cenu, ale každá svůj termín dražby. Test proto
     počítá TOUŽ funkcí jako prohlížeč (js/hlidani-logika.js) a porovnává
     s tím, co web ukázal. Kdyby ji web přestal používat, čísla se rozejdou
     a test to chytí — o to tu jde. */
  const PKH = createRequire(import.meta.url)(new URL('../js/hlidani-logika.js', import.meta.url).pathname);
  const bezDupl = PKH.bezDuplicit(zive);
  pravda('v datech vůbec nějaké duplicity jsou (jinak test nic nedokazuje)',
    bezDupl.length < zive.length,
    `v souboru je ${surova.length} nabídek a všechny jsou jedinečné`);
  pravda('web ukazuje data bez duplicit',
    +celyPocet === bezDupl.length,
    `web hlásí ${celyPocet}, po odstranění duplicit a dražeb po termínu má být ${bezDupl.length}` +
    ` (v souboru ${surova.length}, z toho ${surova.length - zive.length} po termínu)`);

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
    await jdiNaMisto(p, 49.414, 14.657);   // Tábor
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

// --- 2) Vybrané místo se drží MAPY, ne středu okna ------------------
/* Stížnost: „proč kolo pokrývá větší vzdálenost, když oddaluju? To
   nedává smysl. Navíc se seká."
   Vybrané místo BYLO to, co je právě uprostřed mapy (kříž napevno
   uprostřed okna). Každé posunutí i přiblížení ho tedy změnilo: kdo se
   chtěl jen oddálit a podívat, kam až deset kilometrů sahá, tím zároveň
   vybral jiné místo a kruh se přesunul. Poloměr přitom vždycky seděl
   (změřeno 10 000 m na všech přiblíženích) — stěhoval se STŘED.
   A protože se přepočítávalo při každé události „move", procházelo se
   při každém tažení všech 1 966 nabídek: 20 událostí stálo 59 ms, teď 0.
   Bílé tlačítko „Moje poloha" přes mapu je pryč — místo se ukazuje
   klepnutím, jak panel pod mapou rovnou říká. */
{
  const { ctx, p } = await telefon(null);
  await otevriVybirac(p, '#map-near');
  await p.evaluate(() => { window.PK_VM_MAPA.setView([50.10, 15.85], 11); });
  await p.waitForTimeout(700);
  await klepniDoMapy(p);

  const kde = () => p.evaluate(() => {
    const m = window.PK_VM_MAPA;
    let kruh = null;
    m.eachLayer((l) => { if (l instanceof L.Circle && l.getRadius) kruh = l; });
    const c = kruh ? kruh.getLatLng() : null;
    return {
      r: kruh ? Math.round(kruh.getRadius()) : null,
      lat: c ? +c.lat.toFixed(4) : null, lng: c ? +c.lng.toFixed(4) : null,
      zoom: m.getZoom(),
      text: ((document.getElementById('vm-pocet') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    };
  });
  const po = await kde();
  pravda('po klepnutí je kruh na mapě', po.r === 10000 && po.lat !== null, JSON.stringify(po));

  await p.evaluate(() => { window.PK_VM_MAPA.setZoom(8); });
  await p.waitForTimeout(900);
  const poOddaleni = await kde();
  pravda('oddálení nezmění vybrané místo',
    poOddaleni.lat === po.lat && poOddaleni.lng === po.lng,
    `bylo ${po.lat},${po.lng}, po oddálení ${poOddaleni.lat},${poOddaleni.lng}`);
  pravda('ani velikost okruhu', poOddaleni.r === po.r, `${po.r} → ${poOddaleni.r}`);
  pravda('a počet nabídek zůstane stejný', poOddaleni.text === po.text,
    `„${po.text}" → „${poOddaleni.text}"`);

  await p.evaluate(() => { window.PK_VM_MAPA.panBy([170, 130]); });
  await p.waitForTimeout(900);
  const poPosunu = await kde();
  pravda('posunutí mapy taky ne', poPosunu.lat === po.lat && poPosunu.lng === po.lng,
    `bylo ${po.lat},${po.lng}, po posunutí ${poPosunu.lat},${poPosunu.lng}`);

  /* A po posunu ještě jednou, až se přepočet OPRAVDU spustí: změna
     okruhu. Bez tohohle kroku by sabotáž prošla — vazba na střed mapy
     se totiž projeví až ve chvíli, kdy se něco přepočítává, a posun
     sám už nepřepočítává nic. Přistiženo. */
  await p.evaluate(() => {
    const r = document.querySelector('input[name="vm-km"][value="5"]');
    if (r) r.click();
  });
  await p.waitForTimeout(900);
  const poZmeneOkruhu = await kde();
  pravda('ani změna okruhu po posunu místo nepřesune',
    poZmeneOkruhu.lat === po.lat && poZmeneOkruhu.lng === po.lng,
    `bylo ${po.lat},${po.lng}, po změně okruhu ${poZmeneOkruhu.lat},${poZmeneOkruhu.lng}`);
  pravda('a okruh se opravdu zmenšil na 5 km', poZmeneOkruhu.r === 5000, `poloměr ${poZmeneOkruhu.r} m`);

  /* SEKÁNÍ. Posun mapy nesmí nic přepočítávat — jinak se při každém
     tažení projdou všechny nabídky. Měří se dvacet událostí „move"
     naráz; před opravou to trvalo 59 ms, tedy asi 3 ms na jeden snímek. */
  const cas = await p.evaluate(() => {
    const m = window.PK_VM_MAPA; const t0 = performance.now();
    for (let i = 0; i < 20; i++) m.fire('move');
    return Math.round(performance.now() - t0);
  });
  pravda('posun mapy nic nepřepočítává (nesmí se sekat)', cas <= 12,
    `20 událostí „move" trvalo ${cas} ms — při tažení jich přijde desítky za vteřinu`);

  const zmizelo = await p.evaluate(() => ({
    gps: !!document.getElementById('vm-gps'),
    kriz: !!document.querySelector('.vm-kriz'),
    znacka: !!document.querySelector('.vm-znacka'),
  }));
  pravda('bílé tlačítko „Moje poloha" přes mapu je pryč', !zmizelo.gps);
  pravda('a místo kříže uprostřed okna je značka na mapě', !zmizelo.kriz && zmizelo.znacka,
    JSON.stringify(zmizelo));
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
      hledani: !!document.getElementById('vm-hledat') || !!document.getElementById('vm-kraj'),
      tlacitko: (document.getElementById('map-near') || {}).textContent || '',
      zakazano: !!document.getElementById('map-near')?.disabled,
    };
  });
  /* Dřív se tu otevíralo okénko „Kde hledat?", které chtělo napsat obec —
     a malou vesnici v datech nenajde, takže to končilo slepou uličkou.
     Teď se otevře mapa, na které si místo každý ukáže sám. */
  pravda('bez polohy se otevře mapa, kde si místo vyberu sám', v.okno && v.mapa,
    `okno ${v.okno}, mapa ${v.mapa}`);
  /* A nesmí v ní být hledání. Psát obec byla ta slepá ulička, kvůli které
     se tenhle výběr dělal — vracet ji sem jako „pomoc" by tu cestu jen
     otevřelo znovu. Místo se ukazuje na mapě. */
  pravda('a není v ní žádné psaní obce ani seznam krajů', v.hledani === false,
    'hledání je zpátky v panelu');
  pravda('a nečeká se na to deset vteřin', cekani < 8,
    `okno přišlo až po ${cekani.toFixed(1)} s — tak dlouhé ticho se čte jako „nefunguje to"`);
  pravda('tlačítko se potom dá zase zmáčknout', v.zakazano === false && /Pozemky v okolí/.test(v.tlacitko),
    `zůstalo „${v.tlacitko.trim()}", zakázané: ${v.zakazano}`);
  await ctx.close();
}

// --- 5) „Nejblíž ke mně" bez povolené polohy --------------------------
/* Řazení podle vzdálenosti potřebuje vědět ODKUD. Když člověk polohu
   nepovolí, musí existovat náhrada — a ta existuje: otevře se výběr
   místa na mapě. Jenže když ho zavřel bez volby, nabídka řazení dál
   tvrdila „Nejblíž ke mně", zatímco seznam byl seřazený úplně jinak.
   Ovládací prvek, který lže o svém stavu, je horší než chybějící. */
{
  const { ctx, p } = await telefon(null);
  // Řazení je ve složené harmonice filtrů.
  await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  await p.waitForTimeout(500);
  const pred = await p.evaluate(() => (document.getElementById('map-sort') || {}).value);
  await p.selectOption('#map-sort', 'near');
  await p.waitForTimeout(2600);
  const behem = await p.evaluate(() => ({
    vybirac: !!document.querySelector('.vm-ov'),
    duvod: (document.querySelector('.vm-duvod') || {}).textContent || '',
    razeni: (document.getElementById('map-sort') || {}).value,
  }));
  pravda('bez polohy se místo nabídne na mapě', behem.vybirac,
    'poloha nevyšla a nestalo se nic — řazení podle vzdálenosti nemá od čeho měřit');
  pravda('a je napsané, proč se mapa otevřela', /polohy|Ukažte/i.test(behem.duvod),
    `v hlavičce stojí „${behem.duvod}"`);

  await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
  const po = await p.evaluate(() => ({
    vybirac: !!document.querySelector('.vm-ov'),
    razeni: (document.getElementById('map-sort') || {}).value,
  }));
  pravda('po zavření bez volby se výběr zavře', po.vybirac === false);
  pravda('a nabídka řazení se vrátí na to, podle čeho je seznam opravdu seřazený',
    po.razeni === pred,
    `nabídka hlásí „${po.razeni}", ale seznam je seřazený podle „${pred}"`);
  await ctx.close();
}

// A když místo vyberu, řazení podle vzdálenosti se opravdu zapne.
{
  const { ctx, p } = await telefon(null);
  await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  await p.waitForTimeout(500);
  await p.selectOption('#map-sort', 'near');
  await p.waitForSelector('.vm-ov #vm-mapa .leaflet-map-pane', { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(900);
  await jdiNaMisto(p, 50.028, 15.200);   // Kolín
  await p.click('#vm-ok');
  await p.waitForTimeout(2200);
  const v = await p.evaluate(() => ({
    razeni: (document.getElementById('map-sort') || {}).value,
    hlavicka: (document.querySelector('.kh-txt b') || {}).textContent || '',
  }));
  pravda('po výběru místa se řazení podle vzdálenosti opravdu zapne',
    v.razeni === 'near', `nabídka hlásí „${v.razeni}"`);
  pravda('a seznam se přepne na okolí toho místa', /okolí/i.test(v.hlavicka), v.hlavicka);
  await ctx.close();
}

/* ---------- Změna okruhu nesmí sebrat přiblížení ----------
   Stížnost: „když si vybírám a koukám, chci, aby mi to zůstalo
   přiblížené tam, kam jsem to dal — ne že mě to oddálí, když přidám
   rozpětí okruhu."
   Při každé změně okruhu se mapa přerovnávala na kruh (fitBounds), tedy
   i při ZMENŠENÍ okruhu, kdy se nový kruh do pohledu zjevně vejde.
   Kdo si mapu nastavil, jak chtěl, o svůj pohled přišel při každém
   klepnutí na jiné kilometry.
   Přerovnat se smí jen tehdy, když by nový kruh z okna vypadl — jinak
   by člověk nevěděl, co vlastně vybírá. */
{
  const { ctx, p } = await telefon(null);
  await otevriVybirac(p, '#map-near');
  await jdiNaMisto(p, 50.53, 13.95, 11);          // Vlastislav u Třebenic

  const pohled = () => p.evaluate(() => {
    const m = window.PK_VM_MAPA;
    if (!m) return null;
    const c = m.getCenter();
    return { z: m.getZoom(), lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5) };
  });
  const nastavKm = async (km) => {
    await p.evaluate((k) => {
      const r = document.querySelector('input[name="vm-km"][value="' + k + '"]');
      if (r) { r.click(); }
    }, String(km));
    await p.waitForTimeout(700);
  };

  await nastavKm(10);
  await p.waitForTimeout(400);
  // Člověk si přiblížení dorovná sám — a od téhle chvíle mu má zůstat.
  await p.evaluate(() => { const m = window.PK_VM_MAPA; m.setZoom(m.getZoom() + 1); });
  await p.waitForTimeout(700);
  const moje = await pohled();

  if (!pravda('výběr okolí má mapu a jde v ní přiblížit', !!moje && isFinite(moje.z), JSON.stringify(moje))) {
    await ctx.close();
  } else {
    await nastavKm(5);
    const po5 = await pohled();
    pravda('po zmenšení okruhu na 5 km zůstane přiblížení', po5.z === moje.z,
      `měl jsem ${moje.z}, po změně ${po5.z}`);
    pravda('a mapa se ani neposune', po5.lat === moje.lat && po5.lng === moje.lng,
      `${moje.lat},${moje.lng} → ${po5.lat},${po5.lng}`);

    await nastavKm(2);
    const po2 = await pohled();
    pravda('a po 2 km taky', po2.z === moje.z && po2.lat === moje.lat,
      `měl jsem ${moje.z}, po změně ${po2.z}`);

    /* Ale když se okruh do okna nevejde, přerovnat se MUSÍ — jinak by
       člověk nastavoval něco, co nevidí. Tohle je ta polovina, kterou by
       „nesahat na mapu nikdy" pokazila; bez téhle kontroly by test prošel
       i s úplně vypnutým přerovnáním. */
    await nastavKm(50);
    const po50 = await pohled();
    pravda('ale na okruh, který se do okna nevejde, se mapa oddálí', po50.z < moje.z,
      `měl jsem ${moje.z}, po 50 km ${po50.z}`);
    const vidno = await p.evaluate(() => {
      const m = window.PK_VM_MAPA, c = m.getCenter();
      return m.getBounds().contains(L.latLng(c.lat, c.lng).toBounds(50 * 2000));
    }).catch(() => null);
    pravda('a celý padesátikilometrový okruh je pak vidět', vidno === true, `vejde se: ${vidno}`);
    await ctx.close();
  }
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
