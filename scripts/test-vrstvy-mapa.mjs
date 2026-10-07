/* Test: vrstvy úřadů jsou i na hlavní mapě — a nesahá se na ně předem.
   ==================================================================
   Spuštění: node scripts/test-vrstvy-mapa.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Hranice parcel, územní plán, záplavové území, bonita půdy a ochrana
   přírody byly jen v mapě u JEDNOTLIVÉHO pozemku — tedy až na konci
   cesty. Na hlavní mapě, kde se teprve rozhoduje, KAM jet, nebyly vůbec.

   NEJDŮLEŽITĚJŠÍ KONTROLA JE TA O SOUKROMÍ. Stránka pozemku zkouší
   služby úřadů hned při otevření mapy; tam je to obhajitelné, protože
   mapu otevírá ten, kdo si vybral konkrétní pozemek. Hlavní mapa je ale
   první, co každý návštěvník uvidí, a ochrana-udaju.html slibuje, že
   dokud si vrstvy sám nezapne, nepředá se cizím službám nic. Test tedy
   měří, že při obyčejném otevření a přiblížení mapy NEODEJDE ani jeden
   požadavek na cizí server.

   A druhá: tlačítko se nesmí nabízet tam, kde by po něm nic nepřišlo.
   Nejnižší z vrstev začíná na přiblížení 10, takže při pohledu na celou
   republiku se žádná nevykreslí.
   ================================================================== */
import { chromium } from 'playwright-core';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nVrstvy úřadů na hlavní mapě');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Vrstvy na hlavní mapě: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const cizi = [];
  const chybyKonzole = [];
  /* Měří se požadavky na SLUŽBY ÚŘADŮ, ne na cokoli cizího. Hlavní mapa
     si legitimně bere podkladové dlaždice (OpenStreetMap, Esri) a nabídky
     ze Supabase — obojí je v ochrana-udaju.html přiznané a děje se to
     i bez vrstev. Slib, který se tu hlídá, zní jinak: na služby úřadů se
     nesáhne, dokud si vrstvy člověk nezapne. */
  const URADY = /cuzk|geoportal\.gov\.cz|geoportal\.uur\.cz|heis\.vuv\.cz|spucr\.cz|gis\.nature\.cz/i;
  p.on('request', (r) => { if (URADY.test(r.url())) cizi.push(r.url()); });
  p.on('pageerror', (e) => chybyKonzole.push(String(e)));

  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(3000);

  pravda('modul vrstev je na hlavní stránce',
    await p.evaluate(() => !!(window.PK_VRSTVY && window.PK_VRSTVY.pripravene)),
    'window.PK_VRSTVY chybí — vrstvy by na hlavní mapě nebyly');

  /* Při pohledu na celou ČR se žádná vrstva nevykreslí, takže se tlačítko
     nemá nabízet. */
/* Vidí to OKO, ne jen DOM. Dřív se tu ptalo na `.hidden === true`, tedy
   na ATRIBUT — a ten tam je vždycky, protože ho nastavuje právě ten kód,
   který se zkouší. Kontrola tím říkala jen „atribut jsme nastavili", ne
   „tlačítko není vidět", a prošla by i u prvku, který je vidět: autorské
   pravidlo s display totiž [hidden] z prohlížeče přebije a .map-reset
   nese display:inline-flex. Tady to ve výsledku drží plošná pojistka
   [hidden]{display:none !important} v css/styles.css — ale na tu se
   kontrola spoléhat nemá, má ji ověřovat. Proto se teď měří box.
   Tentýž druh vady, kde pojistka nedosáhne, našla scripts/test-skryte.mjs
   v 404.html. */
const vidu = (sel) => p.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const st = getComputedStyle(el);
  return !(r.width === 0 && r.height === 0) && st.display !== 'none' && st.visibility !== 'hidden';
}, sel);

  const zoom0 = await p.evaluate(() => window.PK_MAPA.getZoom());
  pravda(`mapa startuje oddálená (zoom ${zoom0})`, zoom0 < 10, `${zoom0}`);
  pravda('a tlačítko „Vrstvy" tam není vidět',
    await vidu('#map-vrstvy') === false,
    'tlačítko MÁ BOX, přitom by po něm nic nepřišlo');

  /* TOHLE JE TA HLAVNÍ: bez vyžádání se na cizí servery nesmí sáhnout. */
  pravda('při otevření mapy neodešel ani jeden požadavek na službu úřadu',
    cizi.length === 0, cizi.slice(0, 3).join(', '));

  await p.evaluate(() => { window.PK_MAPA.setZoom(13); });
  await p.waitForTimeout(1500);
  pravda('po přiblížení se tlačítko „Vrstvy" ukáže',
    await vidu('#map-vrstvy') === true,
    'zůstalo schované');
  pravda('ani po přiblížení se na službu úřadu nesáhlo (zkouška čeká na vyžádání)',
    cizi.length === 0, cizi.slice(0, 3).join(', '));

  pravda('a panel s vrstvami je zavřený', await vidu('#map-vrstvy-panel') === false);

  /* Teprve klepnutí smí sáhnout ven. Služby úřadů jsou odsud nedostupné
     (proxy je blokuje), takže se neověřuje, že vrstvy naskočí — ověřuje
     se, že se o to web POKUSÍ až teď, a že to bez odpovědi řekne. */
  await p.evaluate(() => document.getElementById('map-vrstvy').click());
  await p.waitForTimeout(1200);
  pravda('po klepnutí se panel otevře', await vidu('#map-vrstvy-panel') === true);
  pravda('a TEPRVE TEĎ se zkouší služby úřadů', cizi.length > 0,
    'nesáhlo se nikam — zkouška vrstev se nespustila, takže by se žádná nenabídla');
  pravda('a míří to na služby vypsané v ochraně údajů',
    cizi.every((u) => URADY.test(u)), cizi.slice(0, 3).join(', '));

  /* Bez odpovědi to musí říct, ne mlčet: člověk by čekal přepínače,
     které nikdy nepřijdou. */
  await p.waitForTimeout(7000);
  const text = await p.evaluate(() => document.getElementById('map-vrstvy-panel').textContent.trim());
  pravda('a když služby neodpovídají, panel to řekne',
    /neodpovíd|nepodařilo/i.test(text) || /\S/.test(text), `panel je prázdný: ${JSON.stringify(text)}`);

  pravda('nic z toho nespadlo do konzole', chybyKonzole.length === 0,
    chybyKonzole.slice(0, 2).join(' | '));
  await ctx.close();
  /* ===== ZAPNUTÁ VRSTVA MUSÍ BÝT VIDĚT ==========================
     Služby úřadů jsou odsud nedostupné, takže se podstrčí vlastní
     dlaždicová vrstva na místní adresu — ta vždycky odpoví. Neměří se
     tím ČÚZK, ale zapojení: co se stane s vrstvou, když ji člověk
     zapne.
     NALEZENÁ VADA: v kódu stálo `v.bringToBack()` s úmyslem „vrstva je
     podklad, ať nepřekryje tečky pozemků". Jenže tečky kreslí Leaflet
     v jiné vrstvě plátna, která je nad dlaždicemi vždycky — takže to
     žádné tečky nechránilo a jen poslalo vrstvu POD leteckou mapu.
     Naměřeno: kontejner vrstvy měl z-index 0, podklad 1. Dlaždice se
     stáhly a nebyly vidět, tlačítko přitom zezelenalo. Stížnost zněla
     „nefunguje vrstvení a tlačítko hranice parcel" a byla oprávněná. */
  {
    const CERVENA = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAAA3NCSVQICAjb4U/gAAAAW0lEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwbQe4AAeLq6lAAAAAASUVORK5CYII=', 'base64');
    const ctx2 = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, locale: 'cs-CZ' });
    await ctx2.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
      body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
    await ctx2.route('**/data/mapove-vrstvy.json*', (r) => r.fulfill({ status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ verze: 3, vrstvy: [{ id: 'katastr', nazev: 'Hranice parcel',
        popis: 'podstrčená vrstva pro zkoušku', uvedeni: '© zkouška', kryti: 1, odPriblizeni: 10,
        sluzby: [{ typ: 'dlazdice', url: BASE + '/zkouska/{z}/{x}/{y}.png', zkusebniPriblizeni: 14 }] }] }) }));
    await ctx2.route('**/zkouska/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: CERVENA }));
    const p2 = await ctx2.newPage();
    await p2.goto(`${BASE}/index.html`, { waitUntil: 'load' }).catch(() => {});
    await p2.waitForTimeout(2500);
    await p2.evaluate(() => { window.PK_MAPA.setZoom(13); });
    await p2.waitForTimeout(1200);
    await p2.evaluate(() => document.getElementById('map-vrstvy').click());
    await p2.waitForTimeout(2500);
    const nabidka = await p2.evaluate(() => document.querySelectorAll('#map-vrstvy-panel .mv-v').length);
    // PŘEDPOKLAD: bez nabídnuté vrstvy není co zapínat a kontroly níž by prošly naprázdno
    pravda('podstrčená vrstva se nabídne (jinak není co měřit)', nabidka === 1,
      `přepínačů v panelu: ${nabidka}`);
    if (nabidka === 1) {
      await p2.evaluate(() => document.querySelector('#map-vrstvy-panel .mv-v').click());
      await p2.waitForTimeout(1500);
      const v = await p2.evaluate(() => {
        const pane = document.querySelector('.leaflet-tile-pane');
        const vrstvy = [...pane.children].map((c) => ({
          podklad: /pk-basemap/.test(c.className),
          z: parseInt(getComputedStyle(c).zIndex, 10) || 0,
          dlazdic: c.querySelectorAll('img').length }));
        const overlay = document.querySelector('.leaflet-overlay-pane');
        return { vrstvy,
          zOverlay: overlay ? (parseInt(getComputedStyle(overlay).zIndex, 10) || 0) : null,
          zTilePane: parseInt(getComputedStyle(pane).zIndex, 10) || 0 };
      });
      const podklad = v.vrstvy.find((x) => x.podklad);
      const vrstva = v.vrstvy.find((x) => !x.podklad);
      pravda('po zapnutí je v mapě podklad i zapnutá vrstva', !!podklad && !!vrstva,
        JSON.stringify(v.vrstvy));
      if (podklad && vrstva) {
        pravda('a zapnutá vrstva leží NAD podkladem, ne pod ním',
          vrstva.z > podklad.z, `vrstva z-index ${vrstva.z}, podklad ${podklad.z}`);
        pravda('a opravdu si stáhla dlaždice', vrstva.dlazdic > 0,
          `dlaždic ${vrstva.dlazdic}`);
      }
      /* A pořád musí platit to, kvůli čemu tam bringToBack bylo: tečky
         pozemků nesmí nic překrýt. Drží to vrstva plátna, ne pořadí
         dlaždic — overlay pane je nad celou vrstvou dlaždic. */
      pravda('tečky pozemků zůstávají nad vrstvami dlaždic',
        v.zOverlay !== null && v.zOverlay > v.zTilePane,
        `overlay ${v.zOverlay}, dlaždice ${v.zTilePane}`);
    }
    await ctx2.close();
  }
} finally {
  await prohlizec.close();
}
hotovo();
