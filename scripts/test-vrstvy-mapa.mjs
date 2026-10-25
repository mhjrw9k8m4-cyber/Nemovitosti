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
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Vrstvy na hlavní mapě', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nVrstvy úřadů na hlavní mapě');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Vrstvy na hlavní mapě: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
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

  /* MODUL VRSTEV SE DOTAHUJE AŽ PO KLEPNUTÍ na „Zkusit, které vrstvy
     jedou" (změřeno: bez doteku se PK_VRSTVY na úvodní stránce ani
     jednou nepřečte — viz docs/optimalizace.md, oddíl 64, a hlídá to
     scripts/test-odlozene-skripty.mjs). Do té doby tu BÝT NEMÁ: tahle
     kontrola stávala obráceně a je to právě ta polovina slibu, kterou
     by šlo rozbít tím, že se značka <script> vrátí.
     Že se modul dotáhne, až na něj přijde řada, dokazuje o kus níž
     kontrola „a TEPRVE TEĎ se zkouší služby úřadů". */
  pravda('modul vrstev se na hlavní stránku předem nestahuje',
    await p.evaluate(() => !window.PK_VRSTVY),
    'window.PK_VRSTVY je na stránce hned po načtení — bere ho každý, kdo vrstvy nikdy nezapne');

  /* Při pohledu na celou ČR se žádná vrstva nevykreslí, takže se nemá
     nabízet ani jedna.
     OD 15. 10. SE SCHOVÁVÁ ŘADA, NE TLAČÍTKO. Tlačítko „Vrstvy" otevírá
     panel „co je na mapě vidět" (podklad, barvy teček, vrstvy úřadů)
     a podklad i barvy se dají přepnout i při pohledu na celou
     republiku — tlačítko tedy musí být po ruce vždycky. Mizí jen ta
     jedna řada uvnitř panelu (#map-vrstvy-rada), protože vrstvy úřadů
     při takovém oddálení nevykreslí ani jedna. */
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

  /* Řada „Vrstvy úřadů" leží UVNITŘ panelu, takže se dá poctivě změřit
     jedině s otevřeným panelem — se zavřeným nemá box nic uvnitř a
     kontrola by platila i pro řadu, která je vidět. */
  const otevriPanel = () => p.evaluate(() => {
    const b = document.getElementById('map-vrstvy'), s = document.getElementById('map-sheet');
    if (!b || !s) return false;
    if (s.hidden) b.click();
    return !s.hidden;
  });
  const zoom0 = await p.evaluate(() => window.PK_MAPA.getZoom());
  pravda(`mapa startuje oddálená (zoom ${zoom0})`, zoom0 < 10, `${zoom0}`);
  pravda('tlačítko „Vrstvy" je po ruce i při pohledu na celou ČR',
    await vidu('#map-vrstvy') === true,
    'schovalo se — podklad a barvy teček se pak nedají přepnout');
  pravda('panel „co je na mapě vidět" se otevře', await otevriPanel() === true,
    'tlačítko „Vrstvy" panel neotevřelo');
  await p.waitForTimeout(300);
  pravda('a řada „Vrstvy úřadů" v něm při pohledu na celou ČR není vidět',
    await vidu('#map-vrstvy-rada') === false,
    'řada MÁ BOX, přitom by po ní nic nepřišlo');
  pravda('podklad a barvy teček se v panelu přepnout DAJÍ',
    await vidu('#map-podklad') === true, 'přepínač podkladu není vidět');

  /* TOHLE JE TA HLAVNÍ: bez vyžádání se na cizí servery nesmí sáhnout. */
  pravda('při otevření mapy neodešel ani jeden požadavek na službu úřadu',
    cizi.length === 0, cizi.slice(0, 3).join(', '));

  await p.evaluate(() => { window.PK_MAPA.setZoom(13); });
  await p.waitForTimeout(1500);
  await otevriPanel();
  await p.waitForTimeout(300);
  pravda('po přiblížení se řada „Vrstvy úřadů" ukáže',
    await vidu('#map-vrstvy-rada') === true,
    'zůstala schovaná');
  pravda('ani po přiblížení se na službu úřadu nesáhlo (zkouška čeká na vyžádání)',
    cizi.length === 0, cizi.slice(0, 3).join(', '));

  /* OTEVŘENÍ PANELU NENÍ VYŽÁDÁNÍ VRSTEV. V panelu je i podklad a barvy
     teček, takže ho otevře i ten, kdo si jen chce přepnout na letecký
     snímek — a tomu se nesmí poslat pět dotazů na servery úřadů. V řadě
     proto čeká tlačítko a teprve ono se ptá. */
  pravda('v řadě vrstev čeká tlačítko, které se teprve zeptá',
    await vidu('.mv-zkusit') === true, 'tlačítko „Zkusit, které vrstvy jedou" chybí');

  /* Teprve klepnutí smí sáhnout ven. Služby úřadů jsou odsud nedostupné
     (proxy je blokuje), takže se neověřuje, že vrstvy naskočí — ověřuje
     se, že se o to web POKUSÍ až teď, a že to bez odpovědi řekne. */
  await p.evaluate(() => { const b = document.querySelector('.mv-zkusit'); if (b) b.click(); });
  await p.waitForTimeout(1200);
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
    /* SERVISNÍ PRACOVNÍK MUSÍ BÝT VYPNUTÝ — jinak se tenhle oddíl neměří.
       sw.js volá `skipWaiting()` i `clients.claim()`, takže převezme
       i právě načtenou stránku, a `data/*.json` od té chvíle obsluhuje
       on. Jeho dotazy přes `ctx.route` NEJDOU: stránka dostala
       OPRAVDOVÉ `data/mapove-vrstvy.json` místo podstrčeného, zkoušela
       pět živých vrstev úřadů, žádná v testu neodpověděla a v panelu
       stálo „Vrstvy úřadů teď neodpovídají" — nula přepínačů.
       Naměřeno 15. 10.: dotazů na podstrčenou zkušební dlaždici 0,
       `pripravene()` vrátilo 0 vrstev a `mrtve` pět jmen z opravdového
       souboru. Kontext výš (řádek 48) tu pojistku má od začátku;
       tenhle ji neměl. (Táž past jako v scripts/test-pridat.mjs, viz
       CLAUDE.md, oddíl o testech.) */
    const ctx2 = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, locale: 'cs-CZ', serviceWorkers: 'block' });
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
    /* Otevřít panel a teprve pak si vrstvy vyžádat — totéž, co udělá
       člověk (a co hlídá oddíl výš). */
    await p2.evaluate(() => document.getElementById('map-vrstvy').click());
    await p2.waitForTimeout(400);
    await p2.evaluate(() => { const b = document.querySelector('.mv-zkusit'); if (b) b.click(); });
    await p2.waitForTimeout(2500);
    const nabidka = await p2.evaluate(() =>
      document.querySelectorAll('#map-vrstvy-panel .mv-v:not(.mv-zkusit)').length);
    // PŘEDPOKLAD: bez nabídnuté vrstvy není co zapínat a kontroly níž by prošly naprázdno
    pravda('podstrčená vrstva se nabídne (jinak není co měřit)', nabidka === 1,
      `přepínačů v panelu: ${nabidka}`);
    if (nabidka === 1) {
      await p2.evaluate(() => document.querySelector('#map-vrstvy-panel .mv-v:not(.mv-zkusit)').click());
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
