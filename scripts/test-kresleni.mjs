/* Test: nakreslený výběr na mapě opravdu filtruje.
   ==================================================================
   Spuštění: node scripts/test-kresleni.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Okruh kolem místa web uměl už dřív, ale kruh odpovídá jen na dotaz
   „kolem čeho". „Podél téhle řeky" nebo „mezi dálnicí a lesem" kruhem
   popsat nejde — a přitom tak lidé pozemky hledají.

   CO SE MĚŘÍ. Ne to, že se nakreslila čára, ale že se podle tvaru
   SKUTEČNĚ ZMĚNIL VÝBĚR: porovnává se počet nabídek před a po, a ke
   každé viditelné tečce se ověří, že její souřadnice v tom tvaru
   opravdu leží. Jinak by test prošel i tehdy, kdyby se tvar nakreslil
   a nic se nefiltrovalo.

   A NAOPAK: tvar nesmí vyhodit nic, co uvnitř je. Proto se počítá
   i očekávaný počet nezávisle — z dat v prohlížeči — a musí sedět.
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
  console.log('\nKreslení výběru na mapě');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Kreslení výběru: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const chybyKonzole = [];
  p.on('pageerror', (e) => chybyKonzole.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(3000);

  const mame = await p.evaluate(() => !!(window.PK_VYBER && window.PK_MAPA && window.PKOkruh && window.PKOkruh.vTvaru));
  pravda('kreslení i geometrie jsou na stránce', mame, 'PK_VYBER / PKOkruh.vTvaru chybí');
  if (!mame) hotovo();

  const tlacitko = await p.locator('#map-kresli').count();
  pravda('mapa má tlačítko pro kreslení', tlacitko === 1, `${tlacitko}`);

  const pocet = () => p.evaluate(() => (window.PK_SHLUKY
    ? window.PK_SHLUKY.samotne.length + window.PK_SHLUKY.shluky.reduce((s, x) => s + x.n, 0) : null));
  const pred = await pocet();
  pravda(`před kreslením je na mapě co filtrovat (${pred})`, pred > 100,
    `jen ${pred} — pak by zúžení nic neznamenalo`);

  /* Tvar kolem Brna: obdélník zhruba 49,0–49,4 š. a 16,3–16,9 d.
     Zadává se programově, aby test nezávisel na tom, kam se zrovna
     trefí simulovaný prst. Samotné gesto se zkouší zvlášť níž. */
  const TVAR = [[49.0, 16.3], [49.4, 16.3], [49.4, 16.9], [49.0, 16.9]];
  await p.evaluate((tvar) => window.PK_VYBER.nastav(tvar), TVAR);
  await p.waitForTimeout(1200);
  const po = await pocet();
  pravda(`po nakreslení se výběr zúžil (${pred} → ${po})`, po !== null && po < pred && po > 0,
    `z ${pred} na ${po}`);

  /* Každá tečka, která zůstala, musí v tom tvaru opravdu ležet.
     POROVNÁVAJÍ SE JEN SAMOSTATNÉ TEČKY, ne shluky: shluk má souřadnice
     těžiště svých členů, a to může ležet mimo tvar, i když všichni
     členové jsou uvnitř (stačí tvar do U). Při prvním běhu takhle vyšla
     „1 tečka mimo" — a byla to chyba kontroly, ne výběru. */
  /* Při oddálení na celou ČR jsou všechny tečky ve shlucích a samostatná
     není ani jedna — kontrola by pak prošla na prázdném seznamu. Proto se
     napřed přiblíží do nakresleného tvaru, kde se shluky rozpadnou. */
  await p.evaluate((tvar) => {
    const L = window.L;
    window.PK_MAPA.fitBounds(L.latLngBounds(tvar.map((b) => L.latLng(b[0], b[1]))), { padding: [10, 10] });
  }, TVAR);
  await p.waitForTimeout(1500);
  const venku = await p.evaluate((tvar) => {
    const body = (window.PK_SHLUKY ? window.PK_SHLUKY.samotne : []).map((s) => [s.lat, s.lng]);
    return { mimo: body.filter((b) => !window.PKOkruh.vTvaru(b[0], b[1], tvar)).length, z: body.length };
  }, TVAR);
  pravda(`po přiblížení jsou na mapě samostatné tečky (${venku.z})`, venku.z >= 5,
    `jen ${venku.z} — kontrola pod tím by měřila prázdno`);
  pravda('a leží všechny uvnitř nakresleného tvaru', venku.mimo === 0,
    `${venku.mimo} z ${venku.z} je mimo tvar`);

  /* Zrušení výběru musí vrátit přesně původní stav. */
  await p.evaluate(() => window.PK_VYBER.nastav(null));
  await p.waitForTimeout(1200);
  const zpet = await pocet();
  pravda(`zrušení výběru vrátí původní počet (${zpet})`, zpet === pred, `${zpet} proti ${pred}`);

  /* Tvar o dvou bodech není plocha a nesmí nic filtrovat. */
  await p.evaluate(() => window.PK_VYBER.nastav([[49, 16], [50, 17]]));
  await p.waitForTimeout(900);
  const dvaBody = await pocet();
  pravda('tvar o dvou bodech se zahodí a nefiltruje', dvaBody === pred,
    `${dvaBody} proti ${pred} — dotyk nebo čárka by vyprázdnily mapu`);
  await p.evaluate(() => window.PK_VYBER.nastav(null));
  await p.waitForTimeout(600);

  /* --- Samotné gesto --- */
  const tazeniPred = await p.evaluate(() => window.PK_MAPA.dragging.enabled());
  await p.evaluate(() => { document.getElementById('map-kresli').click(); });
  await p.waitForTimeout(300);
  pravda('tlačítko kreslení se zapne', await p.evaluate(() => window.PK_VYBER.kresliZap()) === true,
    'kresliZap zůstalo false');
  const tazeniVyp = await p.evaluate(() => !window.PK_MAPA.dragging.enabled());
  pravda('a tažení mapy se na tu dobu vypne (jinak by se kreslilo do ujíždějící mapy)',
    tazeniVyp, 'dragging zůstalo zapnuté');

  /* A PROHLÍŽEČ SI TAH NESMÍ VZÍT PRO ROLOVÁNÍ STRÁNKY. Vypnout tažení
     mapy nestačí: zamčená mapa má touch-action:pan-y, aby se přes ni dalo
     stránkou rolovat prstem. Když to zůstane i při kreslení, prohlížeč
     svislý tah zabere jako rolování, zruší sérii pointermove a čára se
     nezačne ani kreslit — myší to přitom funguje, takže se na to nepřijde.
     Kód to měl popsané v poznámce, ale nedělal to: starou hodnotu si
     uložil a novou nenastavil.
     Zkoušky dotyku přes CDP tohle chování neumí napodobit (synteticky
     poslaný dotyk touch-action obejde), takže se neměří důsledek, ale
     sama vlastnost — ta je měřitelná a byla špatně. */
  const ta = await p.evaluate(() => {
    const el = document.getElementById('leaflet-map');
    return el ? getComputedStyle(el).touchAction : null;
  });
  pravda('a prst při kreslení patří mapě, ne rolování stránky (touch-action:none)',
    ta === 'none', `touch-action je ${ta} — tah spolkne prohlížeč jako rolování`);

  /* MAPA JE NÍŽ, NEŽ SAHÁ OKNO. Napoprvé se gesto kreslilo na souřadnice
     spočítané z rámu mapy (y 674, výška 682) v okně vysokém 900 — tedy
     pod jeho okrajem, kde nic není, a na mapu nedorazila ani jedna
     událost. Proto se nejdřív roluje a pak se kreslí uvnitř PRŮNIKU
     rámu mapy s oknem. */
  await p.evaluate(() => document.getElementById('leaflet-map').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(500);
  const box = await p.locator('#leaflet-map').boundingBox();
  const vh = await p.evaluate(() => innerHeight);
  const horni = Math.max(box.y, 90);              // pod pevnou hlavičkou
  const dolni = Math.min(box.y + box.height, vh - 20);
  pravda('mapa je po srolování vidět dost na to, aby se do ní dalo kreslit',
    dolni - horni > 220, `viditelná výška ${Math.round(dolni - horni)} px`);
  const sx = box.x + box.width * 0.5, sy = (horni + dolni) / 2;
  await p.mouse.move(sx, sy);
  await p.mouse.down();
  for (const [dx, dy] of [[70, 0], [70, 50], [0, 70], [-70, 50], [-70, 0], [-70, -50], [0, -70]]) {
    await p.mouse.move(sx + dx, sy + dy, { steps: 4 });
    await p.waitForTimeout(40);
  }
  await p.mouse.up();
  await p.waitForTimeout(1200);
  const poGestu = await p.evaluate(() => window.PK_VYBER.ctiPocet());
  pravda(`gesto myší vyrobilo tvar (${poGestu} bodů)`, poGestu >= 3, `${poGestu} bodů`);
  pravda('a kreslení se po puštění samo vypnulo',
    await p.evaluate(() => window.PK_VYBER.kresliZap()) === false, 'zůstalo zapnuté');
  /* STAV SE MÁ VRÁTIT, NE ZAPNOUT. Mapa je po načtení zamčená schválně,
     aby se přes ni dalo prstem rolovat stránkou; odemkne se, až na ni
     člověk klepne. Kreslení ten zámek nesmí potichu sundat — napoprvé
     to tak bylo a poznalo se to až tím, že se tenhle stav změřil PŘED
     kreslením a po něm, místo aby se čekalo „zapnuto". */
  pravda('tažení mapy je po dokreslení ve STEJNÉM stavu jako před ním',
    (await p.evaluate(() => window.PK_MAPA.dragging.enabled())) === tazeniPred,
    `před kreslením ${tazeniPred}, po něm ${await p.evaluate(() => window.PK_MAPA.dragging.enabled())} — kreslení sundalo zámek mapy`);

  pravda('a nic z toho nespadlo do konzole', chybyKonzole.length === 0,
    chybyKonzole.slice(0, 2).join(' | '));
  await ctx.close();
} finally {
  await prohlizec.close();
}
hotovo();
