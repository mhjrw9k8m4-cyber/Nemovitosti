// Mapa s vrstvami v detailu pozemku.
//
// Spuštění: node scripts/test-mapa-pozemku.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Co se tu hlídá a proč zvlášť:
//
// 1) POJISTKA. Vrstvy jsou cizí veřejné služby českých úřadů. Když jedna
//    neodpoví, NESMÍ se její přepínač ukázat — přepínač, po kterém se nic
//    nestane, je horší než chybějící: člověk neví, jestli je chyba v mapě,
//    v pozemku, nebo v něm. Tohle se z vývoje ani z produkce nepozná,
//    protože obojí je stav sítě, který si nikdo nevyrobí ručně. Tady se
//    vyrobí: odpovědi služeb se podstrčí a zkouší se všechny tři případy —
//    všechny jedou, jedna jede, žádná nejede.
//
// 2) CENA MAPY. Nahoře na stránce pozemku je cena a termín. Mapa se proto
//    staví až když je na dohled a kolečkem myši nesmí ukrást rolování
//    dlouhé stránky, dokud do ní člověk nekleple.
//
// 3) NÁHRADA. Když se mapová knihovna nenačte, nesmí zbýt prázdný rám.
//
// Do sítě se přitom nejde ani jednou: dlaždice i služby úřadů odpovídají
// z tohohle souboru.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8310';
let chyb = 0;
const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { zpravy.push('  ✓ ' + popis); return true; }
  chyb++; zpravy.push('  ✕ ' + popis + (detail ? ' — ' + detail : ''));
  return false;
}

/* ---------- 1. nastavení vrstev je čitelné i pro člověka ---------- */
const NAST = JSON.parse(readFileSync('data/mapove-vrstvy.json', 'utf8'));
{
  const v = NAST.vrstvy || [];
  pravda('vrstvy jsou v nastavení, ne v kódu', v.length >= 3, `je jich ${v.length}`);
  const ids = v.map((x) => x.id);
  pravda('každá vrstva má vlastní id', new Set(ids).size === ids.length, ids.join(', '));
  for (const x of v) {
    /* Bez názvu není co napsat na přepínač, bez popisu člověk nepozná, co
       se mu do mapy přidalo, a bez uvedení zdroje bereme cizí data jako
       svoje — to u úředních podkladů nejde. */
    if (!x.nazev || !x.popis || !x.uvedeni) { chyb++; zpravy.push(`  ✕ vrstva „${x.id}" nemá název, popis nebo uvedení zdroje`); }
    const s = x.sluzby || [];
    if (!s.length) { chyb++; zpravy.push(`  ✕ vrstva „${x.id}" nemá ani jednu adresu služby`); }
    for (const sl of s) {
      if (!/^https:\/\//.test(sl.url || '')) { chyb++; zpravy.push(`  ✕ vrstva „${x.id}": adresa není https (${sl.url})`); }
      if (sl.typ === 'wms' && !sl.vrstvy) { chyb++; zpravy.push(`  ✕ vrstva „${x.id}": u WMS chybí jméno vrstvy`); }
      if (sl.typ === 'dlazdice' && !/\{z\}/.test(sl.url || '')) { chyb++; zpravy.push(`  ✕ vrstva „${x.id}": dlaždicová adresa bez {z}/{x}/{y}`); }
    }
  }
  if (!chyb) zpravy.push(`  ✓ všech ${v.length} vrstev má název, popis, zdroj i adresu`);
}

/* ---------- 2. v prohlížeči ---------- */
// Prázdná průhledná dlaždice: obrázek, který se opravdu dekóduje.
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** Odkaz na první pozemek, který má polohu i cenu. */
function pozemekUrl() {
  const d = (JSON.parse(readFileSync('data/opportunities.json', 'utf8')).opportunities || [])
    .find((x) => typeof x.lat === 'number' && typeof x.lng === 'number' && x.price > 0);
  if (!d) return null;
  const klic = [d.place || '', d.parcel || '', d.okres || '', d.lat.toFixed(3), d.lng.toFixed(3)].join('|');
  return { url: `pozemek.html?p=${encodeURIComponent(klic)}&ll=${d.lat},${d.lng}`, d };
}
const CIL = pozemekUrl();
if (!CIL) {
  console.log('Mapa v detailu pozemku\n  ✕ v datech není ani jeden pozemek s polohou a cenou');
  process.exit(1);
}

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/**
 * Otevře detail pozemku s podstrčenou sítí.
 * @param nast.zivi   pole názvů hostitelů, které mají ODPOVÍDAT (ostatní mlčí)
 * @param nast.bezLeafletu  zahodí mapovou knihovnu
 */
async function detail(nast) {
  nast = nast || {};
  const zivi = nast.zivi || [];
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 860 } });
  const dotazy = [];
  /* Všechno v JEDNÉ obsluze. Playwright zkouší obsluhy v obráceném pořadí,
     než se přidaly, takže dvě obsluhy s překrývajícím se vzorem (jedna na
     všechno, druhá jen na knihovnu) se navzájem přebíjejí podle pořadí
     registrace — a to je přesně ten druh tiché chyby, po které test
     projde, i když podstrčení vůbec nezabralo. Tady se nedá splést nic. */
  await ctx.route('**/*', (r) => {
    const adresa = r.request().url();
    const u = new URL(adresa);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
      if (/\/js\/config\.js/.test(u.pathname)) {
        return r.fulfill({ status: 200, contentType: 'text/javascript',
          body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` });
      }
      if (nast.bezLeafletu && /vendor\/leaflet\/leaflet\.js/.test(u.pathname)) return r.abort();
      return r.continue();
    }
    dotazy.push(adresa);
    // Podklad mapy (letecká, OSM) je vždycky k mání — bez něj by nešlo
    // poznat, jestli mlčí vrstva, nebo celá mapa.
    if (/arcgisonline\.com|tile\.openstreetmap\.org/.test(u.hostname)) {
      return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    }
    if (zivi.some((h) => u.hostname === h)) {
      /* Služba může vydávat mapu a vysvětlivky NEvydat — je to jiný dotaz
         na tutéž adresu. Ten případ se musí dát vyrobit zvlášť. */
      if (nast.bezLegend && /GetLegendGraphic/i.test(adresa)) return r.abort();
      return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    }
    return r.abort();
  });
  const p = await ctx.newPage();
  const padlo = [];
  p.on('pageerror', (e) => padlo.push(String((e && e.message) || e).slice(0, 160)));
  await p.goto(`${BASE}/${CIL.url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1500);
  return { ctx, p, padlo, dotazy };
}

/** Počká, než se mapa postaví (nebo to vzdá). */
async function domapy(p) {
  await p.locator('#pzm').scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForFunction(() => !!window.PK_PZ_MAPA, null, { timeout: 12000 }).catch(() => {});
  await p.waitForTimeout(900);
}
/** Přepínače vrstev, které se právě nabízejí. */
const prepinace = (p) => p.evaluate(() => [...document.querySelectorAll('.pzm-v')].map((b) => b.textContent.trim()));

const HOST = {
  katastr: 'services.cuzk.gov.cz',
  zaplavy: 'heis.vuv.cz',
  ochrana: 'gis.nature.cz',
};

// --- A) Mapa se staví až na dohled a nekrade rolování ------------------
{
  const { ctx, p, padlo } = await detail({ zivi: [] });
  /* Kdyby se mapa stavěla hned při načtení, stáhla by dlaždice ještě
     předtím, než o ni kdokoli stál — na stránce, kde jde o cenu. */
  const hnedPoNacteni = await p.evaluate(() => !!window.PK_PZ_MAPA);
  pravda('mapa se při načtení stránky nestaví', !hnedPoNacteni,
    'mapa vznikla, ještě než se k ní někdo dostal — dlaždice se stahují naprázdno');
  pravda('ale její místo na stránce je', await p.locator('#pzm').count() === 1);

  await domapy(p);
  const m = await p.evaluate(() => (window.PK_PZ_MAPA ? {
    stred: window.PK_PZ_MAPA.getCenter(),
    zoom: window.PK_PZ_MAPA.getZoom(),
    kolecko: window.PK_PZ_MAPA.scrollWheelZoom.enabled(),
    dlazdic: document.querySelectorAll('#pzm-mapa img.leaflet-tile').length,
    spendlik: document.querySelectorAll('#pzm-mapa .pzm-pin').length,
    meritko: !!document.querySelector('#pzm .leaflet-control-scale'),
  } : null));
  if (pravda('po dorolování mapa vznikne', !!m)) {
    pravda('a je nad tím pozemkem', Math.abs(m.stred.lat - CIL.d.lat) < 0.002 && Math.abs(m.stred.lng - CIL.d.lng) < 0.002,
      `střed ${m.stred.lat.toFixed(4)},${m.stred.lng.toFixed(4)} vs pozemek ${CIL.d.lat},${CIL.d.lng}`);
    pravda('přiblížení je na parcelu, ne na kraj', m.zoom >= 13, `zoom ${m.zoom}`);
    pravda('podklad se opravdu poskládal z dlaždic', m.dlazdic > 0, `dlaždic ${m.dlazdic}`);
    pravda('na pozemku stojí špendlík', m.spendlik === 1);
    pravda('u mapy je měřítko', m.meritko,
      'bez měřítka nepoznám, jestli je ta parcela jako zahrádka, nebo jako pole');
    /* Mapa uprostřed dlouhé stránky, která při rolování začne zoomovat,
       je past: člověk chce dolů a místo toho mu uletí mapa. */
    pravda('kolečko myši mapa nekrade', m.kolecko === false,
      'mapa zoomuje kolečkem hned — rolování stránky se v ní zasekne');
  }
  await p.locator('#pzm-mapa').click({ position: { x: 300, y: 120 } }).catch(() => {});
  await p.waitForTimeout(250);
  pravda('po klepnutí do mapy už kolečko zoomuje',
    await p.evaluate(() => !!(window.PK_PZ_MAPA && window.PK_PZ_MAPA.scrollWheelZoom.enabled())),
    'kdo do mapy klepl, s ní pracuje — tam kolečko patří');
  pravda('při stavbě mapy nic nespadlo', padlo.length === 0, padlo[0]);
  await ctx.close();
}

// --- B) Žádná služba neodpovídá → žádný přepínač, ale ani ticho -------
{
  const { ctx, p } = await detail({ zivi: [] });
  await domapy(p);
  await p.waitForTimeout(2500);
  const v = await prepinace(p);
  pravda('když služby úřadů mlčí, nenabízí se ani jeden přepínač', v.length === 0, v.join(', '));
  const stav = await p.evaluate(() => ({
    nic: (document.querySelector('.pzm-nic') || {}).textContent || '',
    hleda: !!document.querySelector('.pzm-hleda'),
    kryti: !!(document.getElementById('pzm-kryti') || {}).hidden !== false,
    odkaz: [...document.querySelectorAll('.pzm-pod a')].some((a) => /územní plán/i.test(a.textContent || '')),
  }));
  pravda('a je napsané, co se stalo', /neodpovídají/i.test(stav.nic), `stojí tam „${stav.nic.trim()}"`);
  pravda('přestane se tvářit, že ještě hledá', !stav.hleda,
    'kolečko „zkouším vrstvy" se točí i po tom, co se nic nenašlo');
  pravda('náhradní cesta k územnímu plánu zůstává', stav.odkaz,
    'vrstva nejede a odkaz na plán obce taky zmizel — pak není kudy');
  await ctx.close();
}

// --- C) Odpovídá jen jedna služba → jen její přepínač -----------------
{
  const { ctx, p } = await detail({ zivi: [HOST.zaplavy] });
  await domapy(p);
  await p.waitForTimeout(2500);
  const v = await prepinace(p);
  const def = (NAST.vrstvy || []).find((x) => x.id === 'zaplavy');
  pravda('nabídne se právě ta jedna vrstva, která odpověděla',
    v.length === 1 && v[0] === def.nazev, `nabízí se: ${v.join(', ') || '(nic)'}`);
  await ctx.close();
}

// --- D) Vrstva se zapíná, vypíná, prosvítá a hlásí zdroj --------------
{
  const { ctx, p, dotazy } = await detail({ zivi: [HOST.katastr, HOST.zaplavy, HOST.ochrana] });
  await domapy(p);
  await p.waitForTimeout(2600);
  const v = await prepinace(p);
  pravda('nabídnou se všechny vrstvy, jejichž služba odpověděla', v.length >= 3, v.join(', '));

  const def = (NAST.vrstvy || []).find((x) => x.id === 'katastr');
  /* Mapa se nad pozemkem otevírá dost blízko, takže by se přiblížení
     k vrstvě nemuselo vůbec uplatnit a kontrola by projila naprázdno.
     Přišlo se na to sabotáží: přiblížení se z kódu odebralo a test mlčel.
     Proto se sem mapa nejdřív oddálí — stav, ve kterém by katastrální
     mapa opravdu nic nenakreslila. */
  await p.evaluate((z) => window.PK_PZ_MAPA.setZoom(z), Math.max(8, def.odPriblizeni - 3));
  await p.waitForTimeout(700);
  const pred = await p.evaluate(() => window.PK_PZ_MAPA.getZoom());
  pravda('pro zkoušku se mapa oddálí pod hranici vrstvy', pred < def.odPriblizeni,
    `zoom ${pred}, vrstva potřebuje ${def.odPriblizeni} — kontrola níž by neměla co ověřovat`);
  await p.locator('.pzm-v[data-id="katastr"]').click();
  await p.waitForTimeout(1600);
  const po = await p.evaluate(() => ({
    zapnuto: document.querySelector('.pzm-v[data-id="katastr"]').classList.contains('on'),
    rika: document.querySelector('.pzm-v[data-id="katastr"]').getAttribute('aria-pressed'),
    kryti: !document.getElementById('pzm-kryti').hidden,
    popis: (document.getElementById('pzm-popis') || {}).textContent || '',
    uvedeni: (document.querySelector('#pzm .leaflet-control-attribution') || {}).textContent || '',
    zoom: window.PK_PZ_MAPA.getZoom(),
    pruhlednost: (function () {
      const i = document.querySelector('#pzm-mapa .leaflet-layer:last-child');
      return i ? +getComputedStyle(i).opacity : -1;
    })(),
  }));
  pravda('klepnutí vrstvu zapne', po.zapnuto && po.rika === 'true');
  pravda('a je vidět, co se do mapy přidalo', po.popis.indexOf(def.popis.slice(0, 25)) !== -1,
    `pod mapou stojí „${po.popis.slice(0, 60)}"`);
  /* Cizí úřední podklad se nesmí tvářit jako náš. */
  pravda('u mapy se objeví, odkud vrstva je', po.uvedeni.indexOf('ČÚZK') !== -1,
    `uvedení zdrojů: „${po.uvedeni.slice(0, 80)}"`);
  /* Katastrální mapa se kreslí až od většího přiblížení. Zapnout ji
     z výšky a nechat člověka koukat na nic je horší než ji nenabídnout. */
  pravda('mapa se sama přiblíží, aby bylo vrstvu vidět', po.zoom >= def.odPriblizeni,
    `zoom ${pred} → ${po.zoom}, vrstva potřebuje ${def.odPriblizeni}`);
  pravda('objeví se posuvník průhlednosti', po.kryti,
    'plán přes letecký snímek bez prosvítání zakryje právě to, co chci vidět');
  pravda('a vrstva je od začátku částečně průhledná', po.pruhlednost > 0.1 && po.pruhlednost < 1,
    `krytí ${po.pruhlednost}`);
  const zadano = dotazy.filter((u) => u.indexOf(HOST.katastr) !== -1 && /LAYERS=/i.test(u));
  pravda('a její dlaždice se opravdu stahují', zadano.length > 0,
    'vrstva se zapnula, ale ze služby se nic nežádá');
  pravda('a žádají se právě ty vrstvy z nastavení',
    zadano.some((u) => decodeURIComponent(u).indexOf(def.sluzby[0].vrstvy) !== -1),
    zadano[0] ? decodeURIComponent(zadano[0]).slice(0, 140) : '');

  /* Bez klíče je zapnutý územní plán jen barevná skvrna: žlutá je
     bydlení, šedá výroba, zelená zeleň. Obrázek s klíčem vydává sama
     služba, tak se o něj musí říct. */
  const leg = await p.evaluate(() => {
    const o = document.getElementById('pzm-leg');
    return { vidno: !!(o && !o.hidden), kusu: o ? o.querySelectorAll('.pzm-leg-k').length : 0,
      popisek: (o && o.querySelector('figcaption') || {}).textContent || '' };
  });
  pravda('k zapnuté vrstvě se žádají vysvětlivky',
    dotazy.some((u) => /GetLegendGraphic/i.test(u) && u.indexOf(HOST.katastr) !== -1),
    'o klíč k barvám se služba vůbec nežádá');
  pravda('a ukážou se pod mapou i s názvem vrstvy',
    leg.vidno && leg.kusu === 1 && leg.popisek === def.nazev, `vidno ${leg.vidno}, kusů ${leg.kusu}, „${leg.popisek}"`);

  // posuvník
  await p.locator('#pzm-kryti-r').fill('100');
  await p.waitForTimeout(300);
  const plne = await p.evaluate(() => {
    const i = document.querySelector('#pzm-mapa .leaflet-layer:last-child');
    return i ? +getComputedStyle(i).opacity : -1;
  });
  pravda('posuvník průhlednost opravdu mění', plne > po.pruhlednost, `${po.pruhlednost} → ${plne}`);

  // vypnutí
  await p.locator('.pzm-v[data-id="katastr"]').click();
  await p.waitForTimeout(600);
  const vypnuto = await p.evaluate(() => ({
    on: document.querySelector('.pzm-v[data-id="katastr"]').classList.contains('on'),
    kryti: !document.getElementById('pzm-kryti').hidden,
    popis: !document.getElementById('pzm-popis').hidden,
  }));
  pravda('druhé klepnutí vrstvu vypne', !vypnuto.on);
  pravda('a zmizí s ní i posuvník a popis', !vypnuto.kryti && !vypnuto.popis);
  pravda('a vysvětlivky taky',
    await p.evaluate(() => document.getElementById('pzm-leg').hidden
      && document.querySelectorAll('.pzm-leg-k').length === 0),
    'klíč k barvám zůstal viset u vrstvy, která už v mapě není');
  await ctx.close();
}

// --- Da) Služba mapu dá, vysvětlivky ne → žádný prázdný rámeček -------
{
  const { ctx, p } = await detail({ zivi: [HOST.katastr], bezLegend: true });
  await domapy(p);
  await p.waitForTimeout(2600);
  await p.locator('.pzm-v[data-id="katastr"]').click();
  await p.waitForTimeout(1800);
  const stav = await p.evaluate(() => ({
    vrstva: document.querySelector('.pzm-v[data-id="katastr"]').classList.contains('on'),
    leg: !document.getElementById('pzm-leg').hidden,
    kusu: document.querySelectorAll('.pzm-leg-k').length,
  }));
  pravda('vrstva jede i bez vysvětlivek', stav.vrstva);
  pravda('a nezbyde po nich prázdný rámeček', !stav.leg && stav.kusu === 0,
    `rámeček vidno ${stav.leg}, kusů ${stav.kusu}`);
  await ctx.close();
}

// --- E) Bez mapové knihovny nezbyde prázdný rám -----------------------
{
  const { ctx, p } = await detail({ zivi: [], bezLeafletu: true });
  await p.locator('#pzm').scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(8000);   // kód na knihovnu chvíli čeká, pak to vzdá
  const stav = await p.evaluate(() => {
    const o = document.getElementById('pzm');
    return { nahrada: !!(o && o.classList.contains('pzm-nahrada')),
      obrazek: !!(o && o.querySelector('svg.opp-map')),
      vyska: o ? Math.round(o.getBoundingClientRect().height) : 0 };
  });
  pravda('bez mapové knihovny se ukáže nehybný snímek', stav.nahrada && stav.obrazek,
    `náhrada ${stav.nahrada}, snímek ${stav.obrazek}`);
  pravda('a není to prázdný rám', stav.vyska > 120, `vysoké ${stav.vyska} px`);
  await ctx.close();
}

await prohlizec.close();
console.log('\nMapa v detailu pozemku');
console.log(zpravy.join('\n'));
console.log(`\n${zpravy.length - chyb} v pořádku, ${chyb} chyb`);
process.exit(chyb ? 1 : 0);
