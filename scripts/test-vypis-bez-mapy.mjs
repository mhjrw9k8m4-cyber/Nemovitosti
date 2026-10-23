/* Test: výpis pozemků na úvodní stránce NEČEKÁ na mapovou knihovnu.
   ==================================================================
   Spuštění: node scripts/test-vypis-bez-mapy.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ TO VZNIKLO. V js/main.js stál jediný příkaz —
   `if (!mapEl || typeof L === 'undefined') { …hláška…; return; }` —
   a ten držel u Leafletu celý zbytek boot(), tedy i výpis nabídek:
   ten je pod ním, ve stejném běhu. Naměřeno (390 px, 1,6 Mb/s, 150 ms,
   procesor ×4): první nabídka se objevila v 8 006 ms a knihovna
   zabírala 144 kB téhož potrubí jako mapa.json a main.js. Po řezu
   7 146 ms, tedy o 860 ms dřív — a leaflet.js z kritické cesty zmizel.

   Na telefonu je přitom mapa v základním pohledu SCHOVANÁ
   (.map-app.mv-seznam .map-holder{display:none}): čekalo se na něco,
   co nikdo nevidí.

   CO SE TU MĚŘÍ. Tři stavy, a u každého to, co se smí a nesmí stát:
     A) knihovna se ZDRŽÍ o dvě vteřiny → výpis je dřív než ona,
        a mapa se potom dostaví CELÁ (tečky, obrysy krajů, zámek).
     B) knihovna NEDOJEDE vůbec → výpis je stejně, a v rámu mapy je
        o tom hláška. Dřív tu zůstala prázdná stránka.
     C) normální běh → nic se nezhoršilo a v konzoli není ani chyba.
   A staticky: úvodní stránka si knihovnu nesmí vzít značkou <script>
   ani jejím stylem značkou <link>, jinak se celý řez obejde.
   ================================================================== */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8341;
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Výpis bez mapové knihovny', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nVýpis bez mapové knihovny');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) {
    console.log('::error::Výpis bez mapové knihovny: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}

/* ---- 1) staticky: jak si úvodní stránka knihovnu objednává ---------- */
const html = readFileSync(path.join(KOREN, 'index.html'), 'utf8');
pravda('index.html si leaflet.js NEBERE značkou <script>',
  !/<script[^>]+src="vendor\/leaflet\/leaflet\.js/.test(html),
  'značka <script> je zpátky — main.js se pak nespustí dřív než knihovna a celý řez je k ničemu');
pravda('ani jeho styl značkou <link>',
  !/<link[^>]+href="vendor\/leaflet\/leaflet\.css/.test(html),
  '14,8 kB stylu blokuje vykreslení, a v režimu seznamu se z něj nepoužije nic');
const mJs = /<meta name="pk-leaflet" data-src="(vendor\/leaflet\/leaflet\.js[^"]*)">/.exec(html);
const mCss = /<meta name="pk-leaflet-css" data-src="(vendor\/leaflet\/leaflet\.css[^"]*)">/.exec(html);
pravda('místo toho má <meta name="pk-leaflet"> i <meta name="pk-leaflet-css">', !!mJs && !!mCss,
  'bez metaznačky si main.js knihovnu nemá kde vzít');
pravda('a obě adresy nesou razítko ?v= (jinak se po výměně servíruje stará kopie)',
  !!mJs && !!mCss && /\?v=[A-Za-z0-9]+$/.test(mJs[1]) && /\?v=[A-Za-z0-9]+$/.test(mCss[1]),
  `js: ${mJs ? mJs[1] : '—'}, css: ${mCss ? mCss[1] : '—'}`);

/* ---- 2) v prohlížeči ----------------------------------------------- */
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.woff2': 'font/woff2' };
const srv = createServer((q, s) => {
  const f = path.join(KOREN, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!f.startsWith(KOREN) || !existsSync(f) || !statSync(f).isFile()) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'Content-Type': TYPY[path.extname(f)] || 'application/octet-stream' });
  s.end(readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

const ZDRZENI = 2000;

/** Otevře úvodní stránku a vrátí, kdy se objevila první nabídka a jak
    skončila mapa. `rezim`: 'ok' | 'zdrz' | 'blok'. */
async function nacti(sirka, rezim) {
  const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: sirka, height: 844 }, serviceWorkers: 'block' });
  /* Všechno cizí se odřízne (dlaždice OpenStreetMap, Supabase): měří se
     tahle stránka, ne cizí servery. */
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  if (rezim === 'zdrz') {
    await ctx.route('**/leaflet.js*', async (r) => {
      await new Promise((x) => setTimeout(x, ZDRZENI));
      await r.continue();
    });
  }
  if (rezim === 'blok') await ctx.route('**/leaflet.js*', (r) => r.abort());
  const p = await ctx.newPage();
  const chybyStranky = [];
  p.on('pageerror', (e) => chybyStranky.push(String((e && e.message) || e).slice(0, 160)));
  /* Časy se berou uvnitř stránky (performance.now()), ne zvenčí: jen tak
     jsou výpis a knihovna měřené na téže ose. */
  await p.addInitScript(() => {
    window.__tVypis = null;
    window.__tKnihovna = null;
    /* OKAMŽIK OBJEDNÁVKY, ne čas objednávky. Porovnávat dva naměřené
       časy tady nejde: čas výpisu se zjišťuje opakovaným dotazem (a je
       tedy až o 10 ms pozdější, než ve skutečnosti byl), kdežto čas
       zdroje je přesný — na localhostu jsou ty dvě chvíle 20 ms od
       sebe a kontrola by kolísala. Tahle podoba kolísat nemá čím:
       zaznamená se SYNCHRONNĚ při vložení značky <script>, jestli už
       karty ve výpisu v té chvíli ve stránce jsou. */
    window.__kdyL = null;
    const puvodni = Node.prototype.appendChild;
    Node.prototype.appendChild = function (n) {
      if (window.__kdyL === null && n && n.tagName === 'SCRIPT' && /leaflet\.js/.test(n.src || '')) {
        window.__kdyL = { karet: document.querySelectorAll('#opp-list .opp-item').length };
      }
      return puvodni.apply(this, arguments);
    };
    const t = setInterval(() => {
      if (window.__tVypis === null && document.querySelector('#opp-list .opp-item')) window.__tVypis = performance.now();
      if (window.__tKnihovna === null && typeof window.L !== 'undefined') window.__tKnihovna = performance.now();
    }, 10);
    setTimeout(() => clearInterval(t), 30000);
  });
  await p.goto(`${BASE}/index.html`, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__tVypis !== null, null, { timeout: 30000 }).catch(() => {});
  const casy = await p.evaluate(() => ({ vypis: window.__tVypis, knihovna: window.__tKnihovna }));
  /* Teprve teď se počká na mapu — aby čas výpisu nebyl naměřený po ní. */
  if (rezim !== 'blok') await p.waitForFunction(() => window.PK_MAPA_HOTOVA === true, null, { timeout: 30000 }).catch(() => {});
  else await p.waitForFunction(() => !!document.querySelector('.mapa-nedojela'), null, { timeout: 15000 }).catch(() => {});
  const stav = await p.evaluate(() => ({
    /* Kdy se o knihovnu řeklo. Čte se ze záznamu o zdrojích, tedy na
       téže ose jako __tVypis — porovnávat dvě různé hodiny nejde. */
    kdyL: window.__kdyL,
    karet: document.querySelectorAll('#opp-list .opp-item').length,
    mapa: !!window.PK_MAPA,
    hotova: window.PK_MAPA_HOTOVA === true,
    vrstev: window.PK_MAPA ? Object.keys(window.PK_MAPA._layers).length : 0,
    platno: document.querySelectorAll('#leaflet-map canvas').length,
    nedojela: !!document.querySelector('.mapa-nedojela'),
    vypisHlaska: /nedojela/.test(document.getElementById('opp-list') ? document.getElementById('opp-list').textContent : ''),
  }));
  await ctx.close();
  return Object.assign(stav, casy, { chyby: chybyStranky });
}

/* A) knihovna se zdrží o dvě vteřiny ---------------------------------- */
for (const sirka of [390, 1280]) {
  const r = await nacti(sirka, 'zdrz');
  pravda(`${sirka} px: se zdrženou knihovnou se výpis vykreslí (${r.karet} karet)`,
    r.karet > 3, `karet ${r.karet} — výpis na knihovně pořád visí`);
  /* „knihovna ještě nebyla" je tvrdší podoba téhož: v tomhle režimu
     dojede až za dvě vteřiny, takže ve chvíli, kdy je výpis na světě,
     `window.L` ještě NEEXISTUJE. Kdyby na ni výpis čekal, bylo by
     `knihovna` vyplněné a menší než `vypis`. */
  pravda(`${sirka} px: ve chvíli, kdy je výpis na světě, knihovna ještě není (výpis ${Math.round(r.vypis)} ms, L ${r.knihovna === null ? 'ještě ne' : Math.round(r.knihovna) + ' ms'})`,
    r.vypis !== null && (r.knihovna === null || r.vypis < r.knihovna),
    'výpis se objevil až po knihovně — řez neplatí');
  pravda(`${sirka} px: výpis je i tak hotový dřív než za ${ZDRZENI} ms`,
    r.vypis !== null && r.vypis < ZDRZENI,
    `výpis v ${r.vypis === null ? '—' : Math.round(r.vypis)} ms`);
  pravda(`${sirka} px: mapa se pak dostaví celá (${r.vrstev} vrstev, plátno ${r.platno})`,
    r.hotova && r.vrstev > 1000 && r.platno >= 1,
    `hotová ${r.hotova}, vrstev ${r.vrstev}, plátno ${r.platno} — fronta se nevysypala celá`);
  pravda(`${sirka} px: a bez chyby v konzoli`, r.chyby.length === 0, r.chyby.join(' / '));
}

/* B) knihovna nedojede vůbec ------------------------------------------ */
for (const sirka of [390, 1280]) {
  const r = await nacti(sirka, 'blok');
  pravda(`${sirka} px: bez knihovny se výpis vykreslí stejně (${r.karet} karet)`,
    r.karet > 3, `karet ${r.karet} — prázdná stránka je ta nejhorší možnost`);
  pravda(`${sirka} px: a v rámu mapy je o tom hláška`, r.nedojela,
    'mapa mlčí — člověk nemá jak zjistit, co se stalo');
  pravda(`${sirka} px: ve výpisu naopak hláška o nedojeté mapě NENÍ`, !r.vypisHlaska,
    'výpis tvrdí, že se načítá z mapy — a to už není pravda');
  pravda(`${sirka} px: a bez chyby v konzoli`, r.chyby.length === 0, r.chyby.join(' / '));
}

/* C) normální běh ------------------------------------------------------ */
for (const sirka of [390, 1280]) {
  const r = await nacti(sirka, 'ok');
  pravda(`${sirka} px: normální běh — výpis (${r.karet} karet) i celá mapa (${r.vrstev} vrstev)`,
    r.karet > 3 && r.hotova && r.vrstev > 1000,
    `karet ${r.karet}, hotová ${r.hotova}, vrstev ${r.vrstev}`);
  pravda(`${sirka} px: normální běh bez chyby v konzoli`, r.chyby.length === 0, r.chyby.join(' / '));
}

/* C2) KDY se o knihovnu řekne — to je celé pravidlo -------------------
   Je-li rám mapy na obrazovce vidět (monitor), knihovna se objednává
   HNED, ještě než je výpis vykreslený: mapa je tam polovina první
   obrazovky. Není-li vidět (telefon v režimu seznamu), objednává se
   teprve PO výpisu. Kdyby se obě větve slily, jedna z těch dvou vad se
   vrátí — buď mapa na monitoru přijde pozdě, nebo knihovna zabere
   potrubí telefonu dřív než data. */
{
  const naMonitoru = await nacti(1280, 'ok');
  pravda(`1280 px: o knihovnu se řekne JEŠTĚ PŘED výpisem (karet ve chvíli objednávky: ${naMonitoru.kdyL ? naMonitoru.kdyL.karet : '—'})`,
    !!naMonitoru.kdyL && naMonitoru.kdyL.karet === 0,
    'na monitoru je mapa polovina první obrazovky a čekat s ní na výpis je výměna jedné vady za druhou');
  const naTelefonu = await nacti(390, 'ok');
  pravda(`390 px: v režimu seznamu AŽ PO výpisu (karet ve chvíli objednávky: ${naTelefonu.kdyL ? naTelefonu.kdyL.karet : '—'})`,
    !!naTelefonu.kdyL && naTelefonu.kdyL.karet > 3,
    'knihovna zabírá potrubí dřív než data výpisu — a mapa je přitom schovaná');
}

/* D) telefon: přepnutí na mapu ---------------------------------------
   Na telefonu je mapa v základním pohledu schovaná, takže knihovna jde
   dolů teprve po výpisu. Tahle cesta je ta, kterou člověk mapu vidí
   poprvé — a musí být vidět CELÁ, i když se na ni přepne hned. */
{
  const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
    isMobile: true, hasTouch: true });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx.route('**/leaflet.js*', async (r) => { await new Promise((x) => setTimeout(x, 700)); await r.continue(); });
  const p = await ctx.newPage();
  const chybyD = [];
  p.on('pageerror', (e) => chybyD.push(String((e && e.message) || e).slice(0, 160)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'commit' });
  await p.waitForSelector('#opp-list .opp-item', { timeout: 30000 });
  const schovana = await p.evaluate(() => {
    const m = document.getElementById('leaflet-map');
    return m ? m.offsetParent === null || m.offsetHeight === 0 : false;
  });
  pravda('390 px: v základním pohledu je rám mapy opravdu schovaný', schovana,
    'rám mapy má na telefonu výšku — pak by se měřil jiný případ, než se tvrdí');
  const prepinac = await p.$('.mv-toggle .mvt-btn[data-mv="mapa"]');
  pravda('390 px: přepínač na mapu na stránce je', !!prepinac, 'tlačítko .mvt-btn[data-mv="mapa"] chybí');
  if (prepinac) {
    await prepinac.click();
    const doslo = await p.waitForFunction(() => window.PK_MAPA_HOTOVA === true, null, { timeout: 20000 })
      .then(() => true).catch(() => false);
    pravda('390 px: po přepnutí na mapu se mapa postaví', doslo,
      'mapa po přepnutí nepřišla — knihovna se nedotáhla');
    const stav = await p.evaluate(() => ({
      vrstev: window.PK_MAPA ? Object.keys(window.PK_MAPA._layers).length : 0,
      platno: document.querySelectorAll('#leaflet-map canvas').length,
      sirka: (document.getElementById('leaflet-map') || {}).offsetWidth || 0,
    }));
    pravda(`390 px: a je celá i srovnaná (${stav.vrstev} vrstev, plátno ${stav.platno}, šířka ${stav.sirka} px)`,
      stav.vrstev > 1000 && stav.platno >= 1 && stav.sirka > 200,
      `vrstev ${stav.vrstev}, plátno ${stav.platno}, šířka ${stav.sirka}`);
  }
  pravda('390 px: přepnutí na mapu proběhne bez chyby v konzoli', chybyD.length === 0, chybyD.join(' / '));
  await ctx.close();
}

/* E) co výpis minul, musí mapa dohnat ---------------------------------
   Okruh kolem místa z dotazu a hlídané místo kreslí funkce, které volá
   renderList() — tedy DŘÍV, než mapa stojí. Fronta o nich neví, dohání
   je postavMapu(). Bez toho by na mapě tiše chyběly: na obrazovce se
   to nepozná, protože mapa jinak vypadá hotová. */
{
  const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  /* Knihovna se zdrží, aby se výpis opravdu vykreslil bez mapy — jinak
     by kontrola prošla i bez dohánění. */
  await ctx.route('**/leaflet.js*', async (r) => { await new Promise((x) => setTimeout(x, 900)); await r.continue(); });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    try {
      localStorage.setItem('pk_misto_v1', JSON.stringify({ lat: 49.2, lng: 16.6, km: 25, nazev: 'Brno' }));
    } catch (e) {}
  });
  /* ?q= s okruhem projde přes openFromUrl(), tedy přesně tou cestou,
     kterou chodí odkaz ze stránky „Hlídání". */
  await p.goto(`${BASE}/index.html?q=${encodeURIComponent('do 30 km od Brna')}`, { waitUntil: 'commit' });
  await p.waitForSelector('#opp-list .opp-item', { timeout: 30000 });
  const predMapou = await p.evaluate(() => !!window.PK_MAPA);
  pravda('E: výpis s okruhem se vykreslil ještě bez mapy', !predMapou,
    'mapa už stála — pak tahle kontrola neměří dohánění, ale obyčejný běh');
  const doslo = await p.waitForFunction(() => window.PK_MAPA_HOTOVA === true, null, { timeout: 20000 })
    .then(() => true).catch(() => false);
  pravda('E: mapa se postavila', doslo, 'mapa nepřišla');
  const kruhy = await p.evaluate(() => {
    if (!window.PK_MAPA) return { kruhu: -1, misto: -1 };
    const vrstvy = Object.keys(window.PK_MAPA._layers).map((k) => window.PK_MAPA._layers[k]);
    return {
      kruhu: vrstvy.filter((l) => typeof l._mRadius === 'number').length,
      misto: document.querySelectorAll('#leaflet-map .pk-misto-wrap').length,
    };
  });
  pravda(`E: okruh i hlídané místo jsou na mapě dohnané (kruhů ${kruhy.kruhu}, značka místa ${kruhy.misto})`,
    kruhy.kruhu >= 2 && kruhy.misto >= 1,
    `kruhů ${kruhy.kruhu} (čekají se dva: okruh z dotazu a okolí hlídaného místa), značka místa ${kruhy.misto}`);
  await ctx.close();
}

await prohlizec.close();
srv.close();
hotovo();
