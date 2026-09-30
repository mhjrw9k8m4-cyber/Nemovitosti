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

/* ---------- 1b. Odkaz pod mapou nesmí plést okres s obcí ---------- */
/* Na produkci stálo „najít územní plán obce Brno-venkov". Brno-venkov je
   OKRES a žádná taková obec není — u části záznamů je totiž „místo" ve
   skutečnosti okres, protože zdroj nic bližšího neuvedl. Věta, která
   plete okres s obcí, podkopává důvěru ve všechno ostatní, co web
   o katastru tvrdí. */
{
  const kod = readFileSync(new URL('../js/pozemek.js', import.meta.url), 'utf8');
  const zac = kod.indexOf("'<div class=\"pz-cta\">'");
  /* Komentáře ven: vysvětlení téhle opravy samo cituje starý text
     („Zobrazit na mapě") a kontrola by padala na vlastní poznámku.
     Hlídá se, co se vykreslí, ne co je u toho napsané. */
  const usek = (zac >= 0 ? kod.slice(zac, kod.indexOf("'</div>'", zac) + 8) : '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  pravda('řada hlavních tlačítek v detailu se našla', /pz-btn/.test(usek),
    'blok .pz-cta v js/pozemek.js chybí — kontrola níž by neměla co hlídat');
  pravda('žádné z nich neříká jen „na mapě"', !/na mapě/i.test(usek),
    'pod vlastní mapou se z takového tlačítka nepozná, že vede pryč z webu — ostatní cíl pojmenovávají („Otevřít v katastru")');
  pravda('a odkaz ven je pojmenovaný cílem', /Mapy\.cz|katastr/i.test(usek),
    usek.slice(0, 120));
}

/* ---------- 2. v prohlížeči ---------- */
// Prázdná průhledná dlaždice: obrázek, který se opravdu dekóduje.
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** Odkaz na první pozemek, který má polohu i cenu. */
function adresaPozemku(d) {
  const klic = [d.place || '', d.parcel || '', d.okres || '', d.lat.toFixed(3), d.lng.toFixed(3)].join('|');
  return { url: `pozemek.html?p=${encodeURIComponent(klic)}&ll=${d.lat},${d.lng}`, d };
}
function najdi(filtr) {
  const d = (JSON.parse(readFileSync('data/opportunities.json', 'utf8')).opportunities || [])
    .find((x) => typeof x.lat === 'number' && typeof x.lng === 'number' && x.price > 0 && filtr(x));
  return d ? adresaPozemku(d) : null;
}
function pozemekUrl() { return najdi(() => true); }
const DRAZBA = najdi((x) => x.type === 'drazba' && /\d{4}-\d{2}-\d{2}/.test(x.extra || ''));
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
 * @param nast.pomalyLeaflet  knihovnu vydá se zpožděním (na souběh dvou vykreslení)
 * @param nast.pomalaData  data pozemků vydá se zpožděním (kvůli témuž souběhu)
 * @param nast.pomaleInzeraty  živé inzeráty od majitelů vydá se zpožděním
 * @param nast.rovnouKMape  jakmile se objeví rám mapy, odroluje k němu
 * @param nast.cil    adresa pozemku, který se má otevřít (výchozí CIL)
 * @param nast.viewport  rozměr okna (výchozí monitor; telefon se měří zvlášť)
 * @param nast.handoff   co má ležet v sessionStorage['pk_open'] (předání z mapy)
 */
async function detail(nast) {
  nast = nast || {};
  const zivi = nast.zivi || [];
  const ctx = await prohlizec.newContext({ viewport: nast.viewport || { width: 1280, height: 860 } });
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
      /* Leaflet schválně pomalu. Stránka se vykresluje dvakrát (nejdřív
         z handoffu, pak z plných dat) a mapa se připravuje ve dvou
         krocích s čekáním mezi nimi — souběh se dá vyrobit jen tak, že
         se to čekání natáhne. Bez toho by zkouška „nespadlo to" prošla
         i s rozbitým kódem, protože by se obě přípravy nestihly potkat. */
      /* POŘADÍ JE CELÝ VTIP: data musí dorazit DŘÍV než knihovna.
         Jen tak se stihnou obě vykreslení a obě přípravy mapy si počkají
         na tutéž knihovnu — a teprve pak se obě vrhnou na tentýž rám.
         Kdyby knihovna přišla dřív, první příprava by mapu postavila do
         starého (ještě připojeného) rámu a ke srážce by nedošlo. */
      if (nast.pomalaData && /data\/opportunities\.json/.test(u.pathname)) {
        return new Promise((hotovo) => setTimeout(() => hotovo(r.continue()), 500));
      }
      /* Databáze schválně pomalá. Živé inzeráty od majitelů si stránka
         tahá zvlášť a stažená nabídka s nimi nemá co dělat — nesmí na ně
         tedy čekat. Vyrobit se to dá jen tak, že odpověď přijde pozdě. */
      if (nast.pomaleInzeraty && /\/rest\/v1\/rpc\/public_listings/.test(u.pathname)) {
        return new Promise((hotovo) => setTimeout(() => hotovo(r.continue()), 3000));
      }
      if (nast.pomalyLeaflet && /vendor\/leaflet\/leaflet\.js/.test(u.pathname)) {
        return new Promise((hotovo) => setTimeout(() => hotovo(r.continue()), 2500));
      }
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
  /* Mapa se připravuje, teprve až je rám na dohled. Aby se první
     příprava vůbec rozběhla (a měla s čím se srazit), roluje se k němu
     hned, jak se objeví — tedy po prvním vykreslení z handoffu. */
  if (nast.rovnouKMape) {
    await ctx.addInitScript(() => {
      const t = setInterval(() => {
        const e = document.getElementById('pzm');
        if (e) { clearInterval(t); e.scrollIntoView({ block: 'center' }); }
      }, 50);
      setTimeout(() => clearInterval(t), 8000);
    });
  }
  if (nast.handoff !== undefined) {
    await ctx.addInitScript((h) => {
      try { sessionStorage.setItem('pk_open', JSON.stringify(h)); } catch (e) {}
    }, nast.handoff);
  }
  const p = await ctx.newPage();
  const padlo = [];
  p.on('pageerror', (e) => padlo.push(String((e && e.message) || e).slice(0, 160)));
  await p.goto(`${BASE}/${nast.cil || CIL.url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
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
  /* HRANICE PARCEL JSOU ZAPNUTÉ ROVNOU. Vlastní obrys pozemku v datech
     nemáme, takže po dojezdu na mapu stál uprostřed jen špendlík —
     a na otázku „kde přesně ten pozemek začíná a končí" neodpověděl.
     Dokud byly hranice schované za přepínačem, většina lidí se k nim
     nedostala: nevědí, že je co zapnout. */
  const hned = await p.evaluate(() => {
    const b = document.querySelector('.pzm-v[data-id="katastr"]');
    return { on: !!(b && b.classList.contains('on')), rika: b && b.getAttribute('aria-pressed'),
      vrstev: document.querySelectorAll('#pzm-mapa .leaflet-layer').length };
  });
  pravda('hranice parcel se zapnou samy', hned.on && hned.rika === 'true',
    'po dojezdu na mapu stojí uprostřed jen špendlík a hranice si nikdo nezapne');
  pravda('a jsou opravdu v mapě, ne jen na přepínači', hned.vrstev >= 2,
    `vrstev v mapě ${hned.vrstev} (podklad + katastr)`);
  /* Ostatní vrstvy se samy nezapínají: územní plán přes letecký snímek
     si člověk vyžádá, nemá ho dostat rovnou přes celý pozemek. */
  const jineZapnute = await p.evaluate(() => [...document.querySelectorAll('.pzm-v.on')].map((b) => b.getAttribute('data-id')));
  pravda('a žádná další vrstva se sama nezapne',
    jineZapnute.length === 1 && jineZapnute[0] === 'katastr', jineZapnute.join(', '));

  /* Dál se zkouší ruční přepínání, takže se hranice nejdřív vypnou.
     Ne slepým klepnutím: kdyby se výchozí zapnutí někdy ztratilo,
     klepnutí by vrstvu naopak ZAPNULO a test by pak spadl výjimkou
     místo toho, aby řekl, co je špatně. Přišlo se na to sabotáží. */
  await p.evaluate(() => {
    const b = document.querySelector('.pzm-v[data-id="katastr"]');
    if (b && b.classList.contains('on')) b.click();
  });
  await p.waitForTimeout(700);
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

  /* --- ODDÁLENÍ PO ZAPNUTÍ -------------------------------------------
     Stížnost se snímkem: „a tady chybí rozdělení parcel." Přepínač
     Hranice parcel svítil, mapa byla na 500 m a v ní ani čára. Nebyla
     to chyba služby — katastr hranice v takovém měřítku prostě
     nevydává. Mapa se sama přiblíží ve chvíli ZAPNUTÍ, jenže kdo si pak
     oddálí, aby viděl okolí, spadne pod hranici znovu a nedozví se nic.
     Kontroluje se obojí: že se to řekne, a že se to dá jedním klepnutím
     spravit. */
  /* Baseline se bere, až se stahování z předchozího kroku uklidní —
     jinak by se dlaždice, které dorazí se zpožděním, připsaly oddálení
     a kontrola níž by hlásila chybu, která žádná není. */
  await p.waitForTimeout(1200);
  const predOddalenim = dotazy.filter((u) => u.indexOf(HOST.katastr) !== -1 && /LAYERS=/i.test(u)).length;
  await p.evaluate((z) => window.PK_PZ_MAPA.setZoom(z), Math.max(8, def.odPriblizeni - 3));
  await p.waitForTimeout(1200);
  const daleko = await p.evaluate(() => ({
    zoom: window.PK_PZ_MAPA.getZoom(),
    sviti: document.querySelector('.pzm-v[data-id="katastr"]').classList.contains('on'),
    popis: (document.getElementById('pzm-popis') || {}).textContent || '',
    skryto: !!(document.getElementById('pzm-popis') || {}).hidden,
    tlacitko: !!document.querySelector('.pzm-priblizit'),
  }));
  pravda('pro zkoušku se mapa zase oddálí pod hranici vrstvy', daleko.zoom < def.odPriblizeni,
    `zoom ${daleko.zoom}, vrstva potřebuje ${def.odPriblizeni}`);
  pravda('přepínač zůstane zapnutý', daleko.sviti);
  pravda('ale pod mapou stojí, že se vrstva v tomhle přiblížení nekreslí',
    !daleko.skryto && daleko.popis.indexOf(def.nazev) !== -1 && /nekreslí/.test(daleko.popis),
    `pod mapou stojí „${daleko.popis.slice(0, 120)}"`);
  pravda('a je tam tlačítko, které mapu přiblíží', daleko.tlacitko,
    'člověk se dozví, co je špatně, ale ne jak to spravit');
  /* A hlavně: pod svou hranicí si vrstva nemá o dlaždice vůbec říkat.
     Dřív je žádala dál a ČÚZK posílal prázdné obrázky. */
  await p.waitForTimeout(400);
  const poOddaleni = dotazy.filter((u) => u.indexOf(HOST.katastr) !== -1 && /LAYERS=/i.test(u)).length;
  pravda('a pod svou hranicí se na dlaždice ani neptá', poOddaleni === predOddalenim,
    `přibylo ${poOddaleni - predOddalenim} dotazů na službu, která v tom měřítku stejně nic nenakreslí`);
  await p.locator('.pzm-priblizit').click();
  await p.waitForTimeout(1200);
  const zpatky = await p.evaluate(() => ({
    zoom: window.PK_PZ_MAPA.getZoom(),
    popis: (document.getElementById('pzm-popis') || {}).textContent || '',
  }));
  pravda('klepnutí na Přiblížit mapu opravdu přiblíží', zpatky.zoom >= def.odPriblizeni,
    `zoom ${daleko.zoom} → ${zpatky.zoom}, potřeba ${def.odPriblizeni}`);
  pravda('a hláška zmizí, protože už je vrstvu vidět', !/nekreslí/.test(zpatky.popis),
    `pod mapou zůstalo „${zpatky.popis.slice(0, 120)}"`);

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
  /* Hranice parcel se zapínají samy, takže se na nic neklepe — kdyby
     se sem klepnulo, vrstva by se naopak vypnula. */
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

// --- Ea) Když jede jen část vrstev, řekne se to ----------------------
/* Ze čtyř přepínačů se na produkci ukázal jeden a nikde nestálo proč.
   Nabídka pak vypadá náhodně: člověk neví, jestli územní plán neumíme,
   nebo jestli se právě něco pokazilo — a druhé se dá počkat, první ne. */
{
  const { ctx, p } = await detail({ zivi: [HOST.katastr] });
  await domapy(p);
  await p.waitForTimeout(2800);
  const stav = await p.evaluate(() => ({
    nabidnute: [...document.querySelectorAll('.pzm-v')].map((b) => b.textContent.trim()),
    pozn: (document.querySelector('.pzm-nic') || {}).textContent || '',
  }));
  /* Co se má vyjmenovat, se odvodí z toho, co se NENABÍDLO — ne z ručního
     seznamu. Jedna adresa v nastavení totiž může obsloužit víc vrstev
     (ČÚZK vydává i katastr, i územní plán) a ruční seznam by pak čekal
     něco jiného, než se vůbec může stát. */
  const chybejici = (NAST.vrstvy || []).map((v) => v.nazev).filter((n) => !stav.nabidnute.includes(n));
  pravda('nějaká vrstva se nabídne a nějaká ne',
    stav.nabidnute.length > 0 && chybejici.length > 0,
    `nabídnuto ${stav.nabidnute.join(', ') || '(nic)'}; nedostupné ${chybejici.join(', ') || '(žádné)'}`);
  pravda('a je napsané, které vrstvy neodpověděly', /neodpovíd/i.test(stav.pozn),
    `u přepínačů nestojí nic — nabídka vypadá náhodně (${stav.pozn})`);
  pravda('a jsou vyjmenované jménem',
    chybejici.every((n) => stav.pozn.indexOf(n) !== -1),
    `stojí tam „${stav.pozn.trim()}", chybí zmínka o: ${chybejici.filter((n) => stav.pozn.indexOf(n) === -1).join(', ')}`);
  /* A ta věta musí být česky. „neodpovídá" + „jí" dalo „neodpovídájí". */
  pravda('a je to česky', !/neodpovídájí/.test(stav.pozn), stav.pozn.trim());
  await ctx.close();
}

// --- Eb) Mapa se přizpůsobí, když rám změní výšku --------------------
/* Leaflet si velikost pamatuje z okamžiku, kdy vznikl. Na telefonu se
   ale výška mění ještě dlouho potom: načtou se písma, doskáče lišta
   prohlížeče, zalomí se řádek s přepínači. Mapa pak kreslí dlaždice jen
   na část plochy a nahoře i dole zůstane pruh pozadí — přesně to bylo
   vidět na produkčním snímku z telefonu. */
{
  const { ctx, p } = await detail({ zivi: [] });
  await domapy(p);
  const pred = await p.evaluate(() => ({
    ram: Math.round(document.getElementById('pzm-mapa').getBoundingClientRect().height),
    mapa: window.PK_PZ_MAPA.getSize().y,
  }));
  pravda('mapa na začátku vyplňuje celý rám', Math.abs(pred.ram - pred.mapa) <= 2,
    `rám ${pred.ram} px, mapa ${pred.mapa} px`);
  // rám povyroste, jako by se pod mapou zalomil řádek s přepínači
  await p.evaluate(() => { document.getElementById('pzm-mapa').style.height = '460px'; });
  await p.waitForTimeout(900);
  const po = await p.evaluate(() => ({
    ram: Math.round(document.getElementById('pzm-mapa').getBoundingClientRect().height),
    mapa: window.PK_PZ_MAPA.getSize().y,
  }));
  pravda('a když rám povyroste, mapa se dotáhne', Math.abs(po.ram - po.mapa) <= 2,
    `rám ${po.ram} px, ale mapa pořád ${po.mapa} px — nahoře a dole zůstane pruh pozadí`);
  await ctx.close();
}

// --- Ec) Na celou obrazovku ------------------------------------------
/* Na telefonu je mapa vysoká 300 bodů. Vrstva územního plánu přes
   letecký snímek se v takovém okénku nedá přečíst — a přesně tak
   vypadal produkční snímek. Zvětšení je rozdíl mezi hračkou a nástrojem.
   Ovládání musí zůstat po ruce i ve zvětšení, jinak se v něm nedá
   přepnout vrstva, a hlavně musí jít zavřít klávesou Escape: mapa přes
   celou obrazovku bez cesty ven je past. */
{
  const { ctx, p } = await detail({ zivi: [HOST.katastr] });
  await domapy(p);
  await p.waitForTimeout(2200);
  pravda('v mapě je tlačítko na zvětšení', await p.locator('#pzm-cela').count() === 1);
  const pred = await p.evaluate(() => window.PK_PZ_MAPA.getSize().y);
  await p.locator('#pzm-cela').click();
  await p.waitForTimeout(900);
  const po = await p.evaluate(() => ({
    mapa: window.PK_PZ_MAPA.getSize().y,
    okno: innerHeight,
    /* Pozor na „je v dokumentu" × „je vidět": display:none prvek
       nesmaže, jen ho schová — a kontrola na existenci by prošla
       i nad neviditelným ovládáním. Přišlo se na to sabotáží. */
    panel: (function () { var e = document.querySelector('.pzm-cela-zap .pzm-panel');
      return e ? Math.round(e.getBoundingClientRect().height) : 0; })(),
    prepinace: [...document.querySelectorAll('.pzm-cela-zap .pzm-v')]
      .filter(function (b) { return b.getBoundingClientRect().height > 0; }).length,
  }));
  /* Nestačí „vyšší než dřív": ve zvětšení musí mapa zabrat většinu
     okna. Jinak se pod ní nakupí panel, popis a vysvětlivky a zbude
     zase okénko — jen jinak zarámované. */
  pravda('po zvětšení mapa zabere většinu okna',
    po.mapa > pred * 1.5 && po.mapa > po.okno * 0.55,
    `${pred} px → ${po.mapa} px z okna ${po.okno} px`);
  pravda('a ovládání zůstane po ruce', po.panel > 20 && po.prepinace > 0,
    `panel je vysoký ${po.panel} px, viditelných přepínačů ${po.prepinace}`);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(700);
  const zavreno = await p.evaluate(() => ({
    cela: !!document.querySelector('.pzm-cela-zap'),
    mapa: window.PK_PZ_MAPA.getSize().y,
    telo: document.body.classList.contains('pzm-cela-telo'),
  }));
  pravda('Escape zvětšení zavře', !zavreno.cela && !zavreno.telo,
    'mapa přes celou obrazovku bez cesty ven je past');
  pravda('a mapa se vrátí do původní velikosti', Math.abs(zavreno.mapa - pred) <= 2,
    `${pred} px → ${zavreno.mapa} px`);
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

/* --- DETAIL DRAŽBY -------------------------------------------------
 * Byl chudší než detail prodeje: jednořádkový odpočet „Termín za
 * 16 dní" a nic víc. Kdo zvažuje dražbu, potřebuje vědět, kdy to je,
 * za kolik se začíná, kolik se skládá dopředu a kde jsou závazné
 * podmínky. Datum a vyvolávací cenu máme u všech 104 dražeb
 * i exekucí; DRAŽEBNÍ JISTOTU nemáme u ani jedné — a právě proto se
 * o ní musí říct, kde je, místo aby se odhadla. Odhadnutá jistota by
 * byla horší než žádná: podle ní se posílají peníze.
 */
if (DRAZBA) {
  const { ctx, p } = await detail({ zivi: [HOST.katastr], cil: DRAZBA.url });
  const v = await p.evaluate(() => {
    const b = document.querySelector('.pz-drazba');
    return b ? { je: true, text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
      odkaz: !!b.querySelector('.pzd-odkaz') } : { je: false };
  });
  pravda('detail dražby má vlastní blok, ne jen řádek s termínem', v.je === true,
    'blok .pz-drazba se nevykreslil');
  if (v.je) {
    const m = /(\d{4})-(\d{2})-(\d{2})/.exec(DRAZBA.d.extra || '');
    const MES = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
      'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
    const kdy = m ? `${+m[3]}. ${MES[+m[2] - 1]} ${m[1]}` : '';
    pravda('a stojí v něm datum dražby, ne jen „za N dní"',
      kdy && v.text.indexOf(kdy) >= 0, `čekáno „${kdy}", blok říká: „${v.text.slice(0, 120)}"`);
    pravda('a vyvolávací cena', /Vyvolávací cena/.test(v.text), v.text.slice(0, 120));
    /* Tohle je ta poctivá část: jistotu v datech nemáme, tak se řekne,
       kde ji hledat. Kdyby se tu jednou objevilo číslo, znamenalo by to,
       že si ho někdo vymyslel. */
    pravda('a u jistoty se pošle pro vyhlášku, místo aby se hádala',
      /Dražební jistotu/.test(v.text) && /vyhláška/i.test(v.text)
        && !/jistota\s*[:\s]\s*\d/i.test(v.text),
      v.text.slice(0, 200));
    pravda('a vede odsud odkaz na podmínky u dražebníka', v.odkaz === true,
      'blok o dražbě neodkazuje nikam');
  }
  await ctx.close();
}

/* --- KOLIK TOHO STRÁNKA UKÁŽE NAJEDNOU ----------------------------
 *
 * Kdo si pozemek rozklikne, chce nejdřív cenu, výměru, místo a kam se pro
 * něj jít podívat. Rádce „Co byste měli vědět" je užitečný, ale je to zeď
 * obecného textu: změřeno na telefonu měl detail 3 218 px a samotný rádce
 * z toho 1 050, tedy třetinu stránky. Proto je zabalený a otevře se na
 * klepnutí. Tmavá verze téhož bloku (karta na mapě) v <details> byla
 * odjakživa; tahle světlá jediná ne.
 */
{
  const { ctx, p } = await detail({});
  await p.waitForTimeout(1200);
  const v = await p.evaluate(() => {
    const obal = document.querySelector('.pz-gtk-obal');
    const sum = obal && obal.querySelector('summary');
    const rady = obal ? obal.querySelectorAll('.g-row').length : 0;
    const r = sum ? sum.getBoundingClientRect() : null;
    return {
      jeObal: !!obal,
      jeDetails: !!obal && obal.tagName.toLowerCase() === 'details',
      zavreno: obal ? !obal.hasAttribute('open') : null,
      radu: rady,
      nadpisVSouhrnu: !!(sum && sum.querySelector('h2')),
      souhrnText: sum ? (sum.textContent || '').trim().replace(/\s+/g, ' ') : '',
      vyskaSouhrnu: r ? Math.round(r.height) : 0,
      vyskaZavreno: document.body.scrollHeight,
    };
  });
  pravda('rádce na stránce pozemku je zabalený do rozbalovacího bloku', v.jeObal && v.jeDetails,
    v.jeObal ? 'je to ' + v.jeDetails : 'blok .pz-gtk-obal na stránce není');
  pravda('a je zavřený, dokud na něj člověk neklepne', v.zavreno === true,
    'otevírá se rovnou, takže se stránkou zase prodlouží');
  pravda('rádce má co ukázat (jinak zkouška nic neměří)', v.radu >= 3,
    'rad je jen ' + v.radu + ' — pak je jedno, jestli je blok zabalený');
  pravda('v souhrnu zůstal nadpis (ať se nerozpadne osnova stránky)', v.nadpisVSouhrnu);
  pravda('a souhrn říká, kolik se toho pod ním skrývá', /\d+\s*(věc|věci|věcí)/.test(v.souhrnText),
    'v souhrnu stojí „' + v.souhrnText + '"');
  pravda('souhrn se dá pohodlně trefit prstem (aspoň 44 px)', v.vyskaSouhrnu >= 44,
    'je vysoký ' + v.vyskaSouhrnu + ' px');

  // A že to opravdu zkracuje: otevřít a porovnat.
  const po = await p.evaluate(() => {
    const o = document.querySelector('.pz-gtk-obal');
    if (o) o.open = true;
    return new Promise((r) => setTimeout(() => r({
      vyskaOtevreno: document.body.scrollHeight,
      radyVidet: [...document.querySelectorAll('.pz-gtk .g-row')].filter((e) => e.getBoundingClientRect().height > 0).length,
    }), 300));
  });
  const uspora = po.vyskaOtevreno - v.vyskaZavreno;
  pravda(`zavřený rádce ušetří pořádný kus stránky (${uspora} px)`, uspora >= 400,
    'rozdíl je jen ' + uspora + ' px — pak to zabalení nestojí za klepnutí navíc');
  pravda('po otevření jsou rady vidět', po.radyVidet >= 3, 'vidět jich je ' + po.radyVidet);
  await ctx.close();
}

/* --- KDO NA POZEMEK KLEPNE NA MAPĚ, MÁ VIDĚT TOTÉŽ -----------------
 *
 * Mapa předá pozemek přes sessionStorage('pk_open'), aby stránka nebyla
 * chvíli prázdná. Ten handoff nesl jen dvanáct polí — a chyběly zrovna
 * ty, které se na stránce vypisují: site (sítě z inzerátu, 1 208
 * nabídek) a podil se zlomkem (kupuje se jen zlomek pozemku, 528
 * nabídek). Druhé vykreslení se navíc přeskakovalo, takže co v handoffu
 * nebylo, na stránce nikdy nebylo: kdo na pozemek klepl na mapě, viděl
 * HORŠÍ stránku než ten, kdo si tentýž odkaz otevřel přímo — a stačilo
 * zmáčknout F5, aby se chybějící sekce objevily.
 * Zkouší se to tou horší cestou: podstrčí se ochuzený handoff (jak ho
 * mapa psala dřív) a stránka stejně musí být celá.
 */
{
  const cil = najdi((x) => Array.isArray(x.site) && x.site.length >= 2 && x.podil);
  pravda('v datech je pozemek se sítěmi i podílem (jinak zkouška nic neměří)', !!cil,
    'žádná nabídka nemá obojí — zkouška by neporovnala nic');
  if (cil) {
    const ochuzeny = {
      place: cil.d.place, okres: cil.d.okres, parcel: cil.d.parcel, druh: cil.d.druh,
      price: cil.d.price, area: cil.d.area, type: cil.d.type, lat: cil.d.lat, lng: cil.d.lng,
      extra: cil.d.extra, url: cil.d.url,
    };
    const { ctx, p, padlo } = await detail({ cil: cil.url, handoff: ochuzeny,
      pomalaData: true, pomalyLeaflet: true, rovnouKMape: true });
    await p.waitForTimeout(2600);
    const v = await p.evaluate(() => ({
      chips: [...document.querySelectorAll('.pz-feat')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      radky: [...document.querySelectorAll('.pz-spec')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    }));
    pravda('po klepnutí z mapy jsou na stránce sítě z inzerátu', v.chips.length > 0,
      'sekce „Sítě a vybavení" je prázdná — stránka zůstala na tom, co přišlo z mapy');
    pravda('a je na ní i řádek o spoluvlastnickém podílu',
      v.radky.some((r) => /podíl/i.test(r)),
      `řádky parametrů: ${v.radky.join(' | ').slice(0, 200)}`);
    /* DVĚ VYKRESLENÍ = DVĚ PŘÍPRAVY MAPY. Příprava čeká, až se rám
       dostane do zorného pole, a pak dotahuje Leaflet; když druhé
       vykreslení začne dřív, než knihovna dorazí, počkají si na ni obě
       a obě pak zavolají L.map() na tomtéž rámu. Leaflet na to odpoví
       „Map container is already initialized" a stránka skončí chybou —
       přesně to jsem si tímhle překreslováním sám způsobil. */
    /* K rámu se odrolovalo samo (rovnouKMape) — tady se jen dočká
       pomalé knihovny. */
    await p.waitForTimeout(2600);
    const mapa = await p.evaluate(() => ({
      kontejneru: document.querySelectorAll('#pzm .leaflet-container').length,
      dlazdic: document.querySelectorAll('#pzm img.leaflet-tile').length,
    }));
    pravda('dvojí vykreslení nezaloží mapu dvakrát', mapa.kontejneru === 1,
      `rámů s mapou: ${mapa.kontejneru}`);
    pravda('a stránka přitom nespadne', padlo.length === 0, padlo.join(' | '));
    await ctx.close();
  }
}

/* --- PROHLÍDNUTÍ POZEMKU SE MUSÍ NĚKDE PROJEVIT ---------------------
 *
 * Dvě věci visely na jednom místě, kam se nedalo dojít. Mapa měla kdysi
 * vlastní panel s detailem (showDetail v js/main.js); ten si zapisoval
 * „Naposledy prohlédnuté" a u inzerátů od majitelů počítal zhlédnutí.
 * Jenže klepnutí na pozemek dnes vede na jeho vlastní stránku a jediné,
 * co showDetail ještě volá, je pruh „Naposledy prohlédnuté" — do kterého
 * se dostane jen to, co showDetail zapsal. Kruh bez vstupu: pruh se
 * nikdy neukázal a zhlédnutí zůstala na nule, zatímco profil slibuje
 * „Zhlédnutí celkem". Ani jedna z těch věcí neměla zkoušku.
 */
{
  const cil = najdi(() => true);
  const { ctx, p } = await detail({ cil: cil.url });
  await p.waitForTimeout(1500);
  const zapsano = await p.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('pk_recent_v1') || '[]'); } catch (e) { return null; }
  });
  const klic = [cil.d.place || '', cil.d.parcel || '', cil.d.okres || '',
    cil.d.lat.toFixed(3), cil.d.lng.toFixed(3)].join('|');
  pravda('prohlédnutý pozemek se zapíše mezi „Naposledy prohlédnuté"',
    Array.isArray(zapsano) && zapsano[0] === klic,
    `v paměti je ${JSON.stringify(zapsano)}, čekal se klíč „${klic}"`);
  await ctx.close();
}

/* --- ZHLÉDNUTÍ U INZERÁTU OD MAJITELE -------------------------------
 * Profil slibuje „Zhlédnutí celkem". Počítalo se to v panelu, kam se
 * nedalo dojít (viz výš), takže tam stála nula. Počítá se jednou za
 * návštěvu — obnovení stránky číslo nenafoukne — a jen u inzerátů od
 * majitelů; u stažené nabídky není co počítat ani komu to ukázat.
 */
{
  const LID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const majitel = {
    place: 'Zkušební zhlédnutí', okres: 'Kolín', parcel: '2/2', druh: 'stavební pozemek',
    price: 750000, area: 1000, type: 'majitel', lat: 50.111, lng: 15.111,
    extra: 'od majitele', _lid: LID,
  };
  const klic = [majitel.place, majitel.parcel, majitel.okres].join('|');
  const adresa = `pozemek.html?p=${encodeURIComponent(klic)}&ll=${majitel.lat},${majitel.lng}`;
  const { ctx, p } = await detail({ cil: adresa, handoff: majitel });
  await p.waitForTimeout(1500);
  const prvni = await (await fetch(`${BASE}/zkouska/zhlednuti`)).json().catch(() => ({}));
  pravda('otevření inzerátu od majitele započítá zhlédnutí', prvni[LID] === 1,
    `server napočítal ${JSON.stringify(prvni)}`);
  // Obnovení stránky ve stejné návštěvě už počítat nesmí.
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);
  const druhy = await (await fetch(`${BASE}/zkouska/zhlednuti`)).json().catch(() => ({}));
  pravda('a obnovení stránky číslo nenafoukne', druhy[LID] === 1,
    `po obnovení ${JSON.stringify(druhy)}`);
  await ctx.close();
}

/* --- POPIS OD MAJITELE MUSÍ BÝT VIDĚT -------------------------------
 *
 * Formulář u toho pole píše „nepovinné — ale hodně pomůže zájemcům",
 * kontrola po něm chce aspoň větu a server ho uloží. A v celém webu
 * nebylo ani jedno místo, které by ho vypsalo: majitel psal text, který
 * nikdo nikdy neuvidí. K tomu se cestou střihl na 600 znaků, ačkoli
 * formulář i server jich povolují 2 000.
 */
{
  const dlouhy = 'První odstavec o pozemku. ' + 'Rovinatý terén na okraji obce. '.repeat(24)
    + '\n\nDruhý odstavec: územní plán a okolí.';
  /* Inzerát od majitele ve statických datech NENÍ — stránka ho zná jen
     z handoffu. Zkouška to tak i staví: vymyšlené místo a souřadnice
     o desetinu stupně vedle (≈ 11 km), aby si stránka nespletla pozemek
     s nějakým stahovaným v okolí. */
  const sousedni = najdi(() => true);
  const majitel = {
    place: 'Zkušební pozemek od majitele', okres: sousedni.d.okres, parcel: '1/1',
    druh: 'stavební pozemek', price: 900000, area: 1200, type: 'majitel',
    lat: Number((sousedni.d.lat + 0.1).toFixed(5)), lng: Number((sousedni.d.lng + 0.1).toFixed(5)),
    extra: 'od majitele', description: dlouhy,
  };
  const klicMajitele = [majitel.place, majitel.parcel, majitel.okres].join('|');
  const { ctx, p } = await detail({
    cil: `pozemek.html?p=${encodeURIComponent(klicMajitele)}&ll=${majitel.lat},${majitel.lng}`,
    handoff: majitel,
  });
  await p.waitForTimeout(1600);
  const v = await p.evaluate(() => {
    const box = document.querySelector('.pz-popis');
    return {
      je: !!box,
      odstavcu: box ? box.querySelectorAll('p').length : 0,
      delka: box ? box.textContent.trim().length : 0,
      nadpisy: [...document.querySelectorAll('.pz-sect-h')].map((h) => h.textContent.trim()),
    };
  });
  pravda('popis od majitele je na stránce vidět', v.je,
    `nadpisy na stránce: ${v.nadpisy.join(' | ')}`);
  pravda(`a celý, ne střižený na 600 znaků (${v.delka} znaků)`, v.delka > 700,
    'text je kratší než odeslaný — někde se po cestě střihl');
  pravda(`a odstavce zůstaly odstavci (${v.odstavcu})`, v.odstavcu >= 2,
    'celý text splynul do jednoho bloku, i když ho člověk psal po odstavcích');
  await ctx.close();
}

/* --- SÍTĚ Z TEXTU INZERÁTU SE MUSÍ DOSTAT I NA STRÁNKU POZEMKU ------
 *
 * Sítě se k pozemku dostanou dvěma cestami: u stažených nabídek je
 * z textu inzerátu vytáhne js/vybaveni.js a uloží KLÍČE do d.site,
 * u nabídek od majitele je zaškrtne člověk a uloží se POPISKY do
 * d.features. Stránka pozemku znala jen d.features — takže u 1 208
 * nabídek z 1 971 (61 %) o elektřině, vodě, plynu ani příjezdu
 * nenapsala ani slovo, ačkoli karta na mapě je ukazovala. Karta je
 * přehled, stránka je místo, kde se člověk rozhoduje; chybět to má
 * spíš na kartě než tam.
 */
{
  const seSitemi = najdi((x) => Array.isArray(x.site) && x.site.length >= 2);
  pravda('v datech je pozemek, u kterého robot našel sítě (jinak zkouška nic neměří)', !!seSitemi,
    'žádná nabídka nemá d.site — pak se nedá poznat, jestli se zobrazují');
  if (seSitemi) {
    const { ctx, p } = await detail({ cil: seSitemi.url });
    await p.waitForTimeout(1200);
    const v = await p.evaluate(() => ({
      nadpisy: [...document.querySelectorAll('.pz-sect-h')].map((h) => h.textContent.trim()),
      chips: [...document.querySelectorAll('.pz-feat')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      zdroj: ((document.querySelector('.pz-feat-zdroj') || {}).textContent || '').trim(),
    }));
    const ocekavane = seSitemi.d.site.map((k) => ({ elektrina: 'Elektřina', voda: 'Voda',
      kanalizace: 'Kanalizace', plyn: 'Plyn', cesta: 'Příjezd' }[k] || k));
    pravda('stránka pozemku má sekci „Sítě a vybavení"', v.nadpisy.includes('Sítě a vybavení'),
      `nadpisy na stránce: ${v.nadpisy.join(' | ') || '(žádné)'}`);
    pravda(`a jsou v ní všechny sítě z inzerátu (${ocekavane.join(', ')})`,
      ocekavane.every((n) => v.chips.some((c) => c === n)),
      `na stránce je: ${v.chips.join(', ') || '(nic)'}`);
    /* A POCTIVĚ. Robot čte inzerát, nekontroluje pozemek — kdyby to
       stránka vydávala za zjištěný stav, byla by to lež v místě, kde se
       člověk rozhoduje, jestli se pro pozemek rozjede. */
    pravda('a je u nich napsané, odkud jsou', /z textu inzerátu/i.test(v.zdroj),
      `stojí tam „${v.zdroj}"`);
    await ctx.close();
  }
}

/* --- RÁDCE MUSÍ BÝT V INZERÁTU, NE AŽ ZA TLAČÍTKY -------------------
 *
 * Zabalit ho nestačilo. Na telefonu skončil úplně dole, až za „Otevřít
 * v katastru", „Uložit" a „Sdílet" — tedy za místem, kde člověk stránku
 * opouští. A vypadal jako popisek sekce: šedý nadpis verzálkami o 11,5 px.
 * Kdo se tam doroloval, nepoznal, že se na to dá klepnout, a šel pryč.
 * Měří se proto obojí: KDE to na telefonu je a jestli to vypadá jako
 * ovládací prvek. Pořadí v HTML by nestačilo — rozhoduje, kde to skončí
 * na obrazovce.
 */
{
  const { ctx, p } = await detail({ viewport: { width: 390, height: 844 } });
  await p.waitForTimeout(1200);
  const v = await p.evaluate(() => {
    const y = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return Math.round(r.top + window.scrollY); };
    const sum = document.querySelector('.pz-gtk-sum');
    const h2 = sum && sum.querySelector('.pz-sect-h');
    const st = h2 ? getComputedStyle(h2) : null;
    const r = sum ? sum.getBoundingClientRect() : null;
    return {
      yRadce: y(sum),
      yAkce: y(document.querySelector('.pz-actions')),
      yCta: y(document.querySelector('.pz-cta')),
      vyska: r ? Math.round(r.height) : 0,
      text: sum ? (sum.textContent || '').replace(/\s+/g, ' ').trim() : '',
      velikostNadpisu: st ? parseFloat(st.fontSize) : 0,
      verzalky: st ? st.textTransform : '',
      celaStranka: document.body.scrollHeight,
    };
  });
  pravda('rádce stojí nad tlačítky „Uložit / Sdílet", ne až za nimi',
    v.yRadce !== null && v.yAkce !== null && v.yRadce < v.yAkce,
    `rádce je na ${v.yRadce} px, tlačítka na ${v.yAkce} px`);
  pravda('a nad hlavním tlačítkem, tedy uvnitř toho, co si člověk o pozemku čte',
    v.yCta !== null && v.yRadce !== null && v.yRadce < v.yCta,
    `rádce je na ${v.yRadce} px, hlavní tlačítko na ${v.yCta} px`);
  pravda(`na telefonu je v první polovině stránky (${v.yRadce} z ${v.celaStranka} px)`,
    v.yRadce !== null && v.yRadce < v.celaStranka / 2,
    'pořád je až dole — tam na něj nikdo neklepne');
  pravda('souhrn se vejde na jeden řádek i na úzký telefon',
    v.vyska > 0 && v.vyska <= 64, `je vysoký ${v.vyska} px, tedy se zalamuje`);
  pravda('a je na něm napsané, že se dá rozbalit', /Rozbalit/.test(v.text),
    `v souhrnu stojí „${v.text}"`);
  pravda('nadpis v souhrnu není šedý popisek verzálkami',
    v.velikostNadpisu >= 14 && v.verzalky === 'none',
    `${v.velikostNadpisu} px, text-transform: ${v.verzalky} — takhle to vypadá jako nadpis sekce, ne jako tlačítko`);
  const po = await p.evaluate(() => {
    const o = document.querySelector('.pz-gtk-obal');
    if (o) o.open = true;
    return new Promise((r) => setTimeout(() => r(
      ((document.querySelector('.pz-gtk-sum') || {}).textContent || '').replace(/\s+/g, ' ').trim()
    ), 250));
  });
  pravda('a po otevření nabízí „Skrýt"', /Skrýt/.test(po), `v souhrnu stojí „${po}"`);
  await ctx.close();
}

/* --- ULOŽENÉ POZEMKY: OBĚ POLOVINY WEBU MUSÍ MÍT TENTÝŽ KLÍČ ------
 *
 * Mapa (js/main.js) i stránka pozemku (js/pozemek.js) zapisují uložené
 * pozemky do TÉHOŽ úložiště pk_fav_v1. Stránka k tomu dlouho brala
 * krátký klíč (obec, parcela, okres) místo toho se souřadnicemi, takže:
 *   • pozemek uložený na mapě se na jeho stránce netvářil jako uložený
 *     a šel do seznamu podruhé, pod druhým klíčem;
 *   • a ten krátký klíč navíc nerozliší ani samotné pozemky — v datech
 *     má 1 957 pozemků jen 1 265 různých krátkých klíčů a ve 310
 *     případech padne víc pozemků na jeden. „Úštěk|—|Litoměřice" jsou
 *     čtyři různé pozemky za 13 500, 140 000, 385 000 a 269 000 Kč,
 *     takže uložením jednoho se označily všechny čtyři.
 */
{
  const zdrojStranky = readFileSync('js/pozemek.js', 'utf8');
  const zdrojMapy = readFileSync('js/main.js', 'utf8');
  pravda('stránka pozemku ukládá pod klíč se souřadnicemi, ne pod krátký',
    /isFav\(d\)\s*\{\s*return favs\(\)\.indexOf\(pkeyPlny\(d\)\)/.test(zdrojStranky)
    && /toggleFav\(d\)\s*\{\s*var arr = favs\(\), k = pkeyPlny\(d\)/.test(zdrojStranky),
    'isFav/toggleFav v js/pozemek.js nepoužívají pkeyPlny — uložené pozemky se rozejdou s mapou');
  pravda('a obě poloviny sahají do téhož úložiště (proto na tom záleží)',
    /pk_fav_v1/.test(zdrojStranky) && /pk_fav_v1/.test(zdrojMapy),
    'kdyby si každá polovina vedla vlastní seznam, tohle by nebyl problém — a tahle zkouška by neměla smysl');

  /* Že klíč se souřadnicemi opravdu rozlišuje lépe, se neodhaduje —
     spočítá se na skutečných datech. Kdyby kolize u krátkého klíče
     zmizely, tahle zkouška přestane měřit to, o co jde, a je potřeba
     ji přepsat, ne smazat. */
  const kratke = {}, dlouhe = {};
  const vsechny = JSON.parse(readFileSync('data/opportunities.json', 'utf8')).opportunities || [];
  vsechny.forEach((d) => {
    const k3 = [d.place || '', d.parcel || '', d.okres || ''].join('|');
    const la = (typeof d.lat === 'number') ? d.lat.toFixed(3) : '';
    const ln = (typeof d.lng === 'number') ? d.lng.toFixed(3) : '';
    const k5 = [d.place || '', d.parcel || '', d.okres || '', la, ln].join('|');
    kratke[k3] = (kratke[k3] || 0) + 1;
    dlouhe[k5] = (dlouhe[k5] || 0) + 1;
  });
  const koliziK = Object.values(kratke).filter((n) => n > 1).length;
  const koliziD = Object.values(dlouhe).filter((n) => n > 1).length;
  pravda(`vzorek dat na to srovnání je (${vsechny.length} pozemků)`, vsechny.length > 500,
    `pozemků ${vsechny.length}`);
  pravda(`krátký klíč pozemky nerozlišuje (${koliziK} kolizí), klíč se souřadnicemi ano (${koliziD})`,
    koliziK > 50 && koliziD < koliziK / 5,
    `krátký ${koliziK}, dlouhý ${koliziD} — pokud se to srovnalo, přepiš tuhle zkoušku`);

  /* A TOTÉŽ CHOVÁNÍM, ne čtením zdroje: stránka se otevře jen s klíčem
     v adrese a BEZ souřadnic (&ll=). Pak je porovnání klíče jediná cesta,
     jak pozemek najít — náhradní „nejbližší bod do 500 m" se bez
     souřadnic spustit nedá. Dokud se klíč porovnával krátkým pkey,
     ukázalo se tu „Pozemek nenalezen". */
  const jednoznacny = Object.entries(dlouhe).find(([, n]) => n === 1);
  if (jednoznacny) {
    const klic = jednoznacny[0];
    const cekanaObec = klic.split('|')[0];
    const ctxK = await prohlizec.newContext({ viewport: { width: 1280, height: 860 } });
    // Cizí služby (mapové vrstvy, fonty) sem netahat — jde jen o to, jaký
    // pozemek stránka podle klíče najde.
    await ctxK.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
      if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
      return r.abort();
    });
    const q = await ctxK.newPage();
    await q.goto(`${BASE}/pozemek.html?p=` + encodeURIComponent(klic), { waitUntil: 'domcontentloaded' });
    await q.waitForTimeout(2800);
    const nadpis = await q.evaluate(() => ((document.querySelector('h1') || {}).textContent || '').trim());
    pravda('pozemek se najde podle klíče z adresy i bez souřadnic',
      nadpis.indexOf(cekanaObec) >= 0,
      `čekáno „${cekanaObec}", na stránce „${nadpis.slice(0, 60)}"`);
    await ctxK.close();
  } else {
    pravda('je z čeho vybrat jednoznačný klíč (jinak zkouška výš nic neměří)', false,
      'všechny klíče se souřadnicemi kolidují — to by bylo samo o sobě divné');
  }

  /* A NAKONEC to, co zkouška výš nezachytí: ta se dívá jen na obec
     v nadpisu, takže projde i tehdy, když stránka vybere ze stejné obce
     jiný pozemek. Přesně to dělal krátký klíč. Vybere se proto skupina
     pozemků se shodným krátkým klíčem (obec, parcela, okres) a z ní
     schválně ten, který v datech NENÍ první; odkaz nese úplný klíč.
     Kdyby se rozhodovalo krátkým klíčem, ukázala by se cena prvního
     pozemku skupiny — obec by sedla, pozemek ne. Vyzkoušeno: při
     porovnávání krátkým klíčem tahle zkouška padne, ta nad ní projde. */
  {
    const skupiny = {};
    vsechny.forEach((d, i) => {
      const k3 = [d.place || '', d.parcel || '', d.okres || ''].join('|');
      (skupiny[k3] = skupiny[k3] || []).push({ d, i });
    });
    // Skupina, kde se členové poznají podle ceny, a bereme jiného než prvního.
    let vybrany = null, prvni = null;
    Object.values(skupiny).forEach((g) => {
      if (vybrany || g.length < 2) return;
      const ceny = g.map((x) => x.d.price);
      if (ceny.some((c) => !c) || new Set(ceny).size !== g.length) return;
      prvni = g[0].d;
      vybrany = g[g.length - 1].d;
    });
    if (vybrany) {
      const klic = [vybrany.place || '', vybrany.parcel || '', vybrany.okres || '',
        vybrany.lat.toFixed(3), vybrany.lng.toFixed(3)].join('|');
      const ctxP = await prohlizec.newContext({ viewport: { width: 1280, height: 860 } });
      await ctxP.route('**/*', (r) => {
        const u = new URL(r.request().url());
        if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
        if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
        return r.abort();
      });
      const q = await ctxP.newPage();
      await q.goto(`${BASE}/pozemek.html?p=` + encodeURIComponent(klic), { waitUntil: 'domcontentloaded' });
      await q.waitForTimeout(2800);
      const cena = await q.evaluate(() => {
        const el = document.querySelector('.pz-price .pv');
        return el ? (el.textContent || '').replace(/\D+/g, '') : '';
      });
      pravda(`u společného krátkého klíče „${vybrany.place}" rozhodne úplný klíč, ne pořadí v datech`,
        cena === String(vybrany.price),
        `čekána cena ${vybrany.price} Kč, na stránce ${cena || '(nic)'} Kč`
        + ` — první pozemek téže skupiny má ${prvni.price} Kč`);
      await ctxP.close();
    } else {
      pravda('je skupina pozemků se stejným krátkým klíčem a různými cenami (jinak zkouška nic neměří)', false,
        'žádná se nenašla — krátký klíč už možná pozemky rozlišuje a tahle zkouška je na přepsání');
    }
  }
}

/* --- INZERÁT OD MAJITELE Z ROZESLANÉHO ODKAZU -----------------------
 *
 * Inzerát od majitele NENÍ ve statických datech (data/opportunities.json)
 * — leží v databázi. Stránka pozemku ji nečetla, takže inzerát se otevřel
 * jedině klepnutím na mapě, kde se pozemek předá přes sessionStorage. Po
 * obnovení stránky, ze záložky nebo z odkazu, který majitel poslal
 * zájemci, spadla stránka do náhradní cesty „nejbližší pozemek do 500 m"
 * a ukázala CIZÍ nabídku — jinou cenu, jinou výměru, jiné místo — nebo
 * „Pozemek nenalezen". Na sdílení toho odkazu je přitom celý inzerát
 * postavený: tlačítko „Sdílet" je hned pod cenou.
 *
 * Inzerát se proto schválně posadí 200 m od skutečné stažené nabídky —
 * do vzdálenosti, kde ta náhradní cesta zabírá.
 */
{
  const soused = najdi(() => true).d;
  const LID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  const MAJITEL = {
    id: LID, place: 'Majitelova Lhota', okres: soused.okres, druh: 'stavební pozemek',
    parcel: '77/7', area: 1234, price: 999000,
    lat: soused.lat + 0.002, lng: soused.lng,
    description: 'Rovinatý pozemek hned u lesa.', contact: '777111222',
    photos: [], features: ['Elektřina', 'Voda'], access: 'Zpevněná cesta',
  };
  await fetch(`${BASE}/zkouska/inzerat`, { method: 'POST', body: JSON.stringify(MAJITEL) });

  // Bez handoffu — přesně jako když odkaz přijde e-mailem.
  const { ctx, p } = await detail({ cil: `pozemek.html?l=${LID}` });
  await p.waitForTimeout(1200);
  const videt = await p.evaluate(() => ({
    nadpis: (document.querySelector('.pz-place') || {}).textContent || '',
    telo: document.body.innerText,
    kanonicka: (document.querySelector('link[rel="canonical"]') || {}).href || '',
  }));
  pravda('inzerát od majitele se otevře i z holého odkazu (bez předání z mapy)',
    videt.nadpis.trim() === MAJITEL.place, `nadpis: „${videt.nadpis.trim()}"`);
  pravda('a není to nejbližší stažený pozemek 200 m vedle',
    videt.nadpis.indexOf(soused.place) < 0, `nadpis: „${videt.nadpis.trim()}", soused: „${soused.place}"`);
  pravda('je na ní cena z inzerátu', /999\s* ?\s*000|999 000/.test(videt.telo.replace(/ /g, ' ')),
    videt.telo.slice(0, 200));
  /* Kanonická adresa mířila na pozemek-<okres>-<obec>-<otisk>.html, tedy
     na stránku, kterou generátor u inzerátu od majitele NEVYROBÍ. Týž
     odkaz rozdávalo tlačítko „Sdílet". */
  pravda('kanonická adresa vede na existující stránku, ne na vygenerovaný soubor',
    /\?l=/.test(videt.kanonicka) && !/pozemek-[a-z0-9-]+\.html/.test(videt.kanonicka),
    videt.kanonicka);

  /* KONTAKT NA MAJITELE. Na stránce nebyl žádný — ani zpráva, ani telefon.
     Bydlel v panelu nad mapou, kam se nedá dostat. Formulář kontakt
     vyžaduje, server ho ukládá, public_listings vrací. Věta o zálohách
     pod tlačítky přitom varuje právě před okamžikem, kdy člověk majiteli
     volá: bez kontaktu stála na stránce bez souvislosti. */
  const kontakt = await p.evaluate(() => ({
    zprava: [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '')
      .find((h) => h.indexOf('zpravy.html?l=') === 0) || '',
    telefon: [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '')
      .find((h) => h.indexOf('tel:') === 0 || h.indexOf('mailto:') === 0) || '',
    cislo: document.body.innerText.indexOf('777 111 222') >= 0
      || document.body.innerText.indexOf('777111222') >= 0,
    varovani: document.body.innerText.indexOf('zálohu ani rezervační poplatek') >= 0,
  }));
  pravda('na inzerátu od majitele je odkaz „Napsat majiteli"',
    kontakt.zprava.indexOf(LID) > 0, `nalezeno: „${kontakt.zprava}"`);
  pravda('a jeho telefon jde vytočit', kontakt.telefon === 'tel:777111222',
    `nalezeno: „${kontakt.telefon}"`);
  pravda('a je i vypsaný, aby se dal opsat', kontakt.cislo,
    'číslo na stránce vidět není — z odkazu „tel:" se na počítači nedá nic opsat');
  pravda('varování o zálohách u toho kontaktu stojí', kontakt.varovani,
    'věta o zálohách na stránce chybí');
  await ctx.close();

  // A totéž přes starší podobu odkazu (klíč z místa a parcely).
  const klic = [MAJITEL.place, MAJITEL.parcel, MAJITEL.okres,
    MAJITEL.lat.toFixed(3), MAJITEL.lng.toFixed(3)].join('|');
  const b = await detail({ cil: `pozemek.html?p=${encodeURIComponent(klic)}&ll=${MAJITEL.lat},${MAJITEL.lng}` });
  await b.p.waitForTimeout(1200);
  const nadpis2 = await b.p.evaluate(() => (document.querySelector('.pz-place') || {}).textContent || '');
  pravda('a stejně tak přes starší odkaz „?p=" s klíčem místa',
    nadpis2.trim() === MAJITEL.place, `nadpis: „${nadpis2.trim()}"`);
  await b.ctx.close();
}

/* --- STAŽENÁ NABÍDKA NEČEKÁ NA DATABÁZI ------------------------------
 * Živé inzeráty od majitelů leží v databázi a stránka pozemku si je tahá
 * zvlášť. Stažených nabídek je ale přes devatenáct set a s živými inzeráty
 * nemají co dělat — kdyby na ně čekaly, držela by se stránka na statické
 * kostře kvůli něčemu, co se jí netýká. Proto se čeká jen tehdy, když
 * pozemek ve statických datech PŘESNĚ nesedí; a to je právě případ
 * inzerátu od majitele.
 */
{
  const cil = najdi(() => true);
  const { ctx, p } = await detail({ cil: cil.url, pomaleInzeraty: true });
  // detail() sám čeká 1,5 s — tedy míň, než trvá odpověď databáze.
  const nadpis = await p.evaluate(() => (document.querySelector('.pz-place') || {}).textContent || '');
  pravda('stažená nabídka se vykreslí, i když databáze mlčí',
    nadpis.trim() === (cil.d.place || '').trim(),
    `nadpis: „${nadpis.trim()}", čekáno „${cil.d.place}"`);
  await ctx.close();
}

/* --- N) DVOJČATA: stránka musí i PO NAČTENÍ DAT nést svoje ------------
 *
 * Pozemky, které sdílejí klíč (obec, parcela, okres, souřadnice na tři
 * desetinná místa), mají každý vlastní stránku. Statická kostra v ní je
 * správná vždycky — vypisuje ji generátor z týchž dat. Jenže skript ji
 * po načtení PŘEPÍŠE: hledá si v datech sám sebe a bez rozlišení podle
 * výměry a ceny by vzal prostě první nález, tedy soused. Na stránce by
 * pak stála cizí cena i cizí výměra a poznalo by se to jen tady —
 * v prohlížeči, po přepsání. Statická kontrola (test-stranky-pozemku)
 * čte kostru, tedy právě to, co je v pořádku i s rozbitým skriptem.
 *
 * Měří se na dvojicích s největším rozdílem, ne na všech: jde o třídu
 * chyby, ne o výčet. Ověřeno sabotáží (vyřadit rozlišení podle výměry
 * v js/pozemek.js): 12 ze 47 stránek začne ukazovat cizí údaje.
 */
{
  const gen = await import('./generate-parcel-pages.mjs');
  const PKHd = (await import('node:module')).createRequire(import.meta.url)('../js/hlidani-logika.js');
  const vse = JSON.parse(readFileSync('data/opportunities.json', 'utf8')).opportunities || [];
  const ukazane = PKHd.bezDuplicit(vse.filter((x) => isFinite(x.lat) && isFinite(x.lng) && x.place && x.okres));
  const kl = (x) => [x.place || '', x.parcel || '', x.okres || '', x.lat.toFixed(3), x.lng.toFixed(3)].join('|');
  const podle = new Map();
  for (const x of ukazane) { const k = kl(x); if (!podle.has(k)) podle.set(k, []); podle.get(k).push(x); }
  /* Berou se jen dvojice, kde se liší OBOJÍ — cena i výměra. U dvou
     stejně velkých parcel od jednoho prodejce (Stínava, 7 994 m² za 260
     a 270 tisíc) je shodná výměra na obou stránkách správně a hlásit ji
     jako cizí údaj by byla chyba zkoušky. */
  const dvojice = [...podle.values()]
    .map((cleny) => [...new Map(cleny.map((x) => [(x.price || 0) + '|' + (x.area || 0), x])).values()]
      .sort((a, b) => (a.area || 0) - (b.area || 0) || (a.price || 0) - (b.price || 0)
        || String(a.url || '').localeCompare(String(b.url || ''))))
    .filter((v) => v.length > 1
      && new Set(v.map((x) => x.area)).size === v.length
      && new Set(v.map((x) => x.price)).size === v.length)
    .sort((a, b) => Math.abs(b[0].area - b[1].area) - Math.abs(a[0].area - a[1].area))
    .slice(0, 3);
  /* Bez tohohle by kontroly níž prošly i s rozbitým skriptem: kdyby
     v datech taková dvojice nebyla, neměly by co měřit. */
  pravda(`v datech je dvojice pozemků na jednom klíči s jinou cenou i výměrou (${dvojice.length})`,
    dvojice.length > 0, 'nenašla se — kontrola níž by nic nehlídala');
  const mez = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const nesvoje = [];
  let precteno = 0;
  for (const cleny of dvojice) {
    for (let i = 0; i < cleny.length; i++) {
      const d = cleny[i];
      const soubor = i === 0 ? gen.souborPro(d) : gen.souborProDalsi(d);
      const { ctx, p } = await detail({ cil: soubor });
      /* Čeká se, až skript kostru OPRAVDU přepíše. Bez toho se přečte
         statický text, který je správný i s rozbitým skriptem. */
      const prepsano = await p.waitForFunction(() => {
        const e = document.getElementById('pz-detail');
        return !!e && !e.querySelector('.pz-staticky');
      }, null, { timeout: 12000 }).then(() => true).catch(() => false);
      if (!prepsano) { nesvoje.push(`${soubor}: kostru nic nepřepsalo`); await ctx.close(); continue; }
      precteno++;
      const t = (await p.innerText('body')).replace(/ /g, ' ').replace(/\s+/g, ' ');
      const mam = (x) => t.indexOf(mez(x).replace(/ /g, ' ')) !== -1;
      if (!mam(d.area)) nesvoje.push(`${soubor}: neuvádí svou výměru ${mez(d.area)} m²`);
      if (!mam(d.price)) nesvoje.push(`${soubor}: neuvádí svou cenu ${mez(d.price)} Kč`);
      for (const x of cleny) {
        if (x === d) continue;
        if (mam(x.area)) nesvoje.push(`${soubor}: uvádí sousedovu výměru ${mez(x.area)} m²`);
        if (mam(x.price)) nesvoje.push(`${soubor}: uvádí sousedovu cenu ${mez(x.price)} Kč`);
      }
      await ctx.close();
    }
  }
  pravda(`kostru na stránkách dvojčat skript přepsal (${precteno})`,
    precteno === dvojice.reduce((s2, v) => s2 + v.length, 0),
    'některou stránku nic nepřepsalo — zkouška by četla statický text');
  pravda('a po přepsání každá nese svou cenu i výměru, ne sousedovu',
    nesvoje.length === 0, `${nesvoje.length}: ` + nesvoje.slice(0, 4).join('; '));
}

await prohlizec.close();
console.log('\nMapa v detailu pozemku');
console.log(zpravy.join('\n'));
console.log(`\n${zpravy.length - chyb} v pořádku, ${chyb} chyb`);
process.exit(chyb ? 1 : 0);
