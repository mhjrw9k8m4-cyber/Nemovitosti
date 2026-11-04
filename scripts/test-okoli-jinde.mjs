/* Test: okno „Vyberte své okolí" najde i obec, kterou data neznají.
   ===================================================================
   Spuštění: node scripts/test-okoli-jinde.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ VZNIKL. Našeptávač okna se skládal z nabídek (mistaZDat), takže
   znal jen místa, kde nějaký pozemek stojí. Kdo napsal svou obec bez
   nabídek, dostal PRÁZDNO — naměřeno na „Kraslice", „Vernéřov"
   i „Boží Dar". Přitom „je něco u nás?" je ta nejčastější otázka, se
   kterou člověk přijde, a odpověď „nic tady není, ale 8 je do 20 km"
   je informace; mlčení vypadá jako porouchané hledání.

   NA GEOKODÉR SE TADY NECHODÍ. Odpovědi nominatimu se podstrkují
   (ctx.route), jako to dělá test-pridat.mjs. Zkouška tím měří naše
   chování, ne cizí server, a nezatěžuje ho — a zároveň se dá změřit
   i to, KOLIKRÁT se na něj jde (nesmí se chodit při psaní).
   =================================================================== */
import { chromium } from 'playwright-core';
import { BASE } from './falesna-supabase-chat.mjs';
import { naPohled } from './zkouska-pohled.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { readFileSync as readFileSyncX } from 'node:fs';
import pathx from 'node:path';
import { fileURLToPath as furlx } from 'node:url';

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
hlasPad('Okolí — obec bez nabídek', zpravy, () => chyb);

/* Vernéřov u Kraslic: obec, kterou data NEZNAJÍ (žádná nabídka se tak
   nejmenuje), takže se k ní musí dojít přes geokodér. Kolik je kolem ní
   nabídek, se ZDE NEPÍŠE — spočítá se z dat (viz kolikVOkruhu níž).
   Do 4. 11. tu stálo „v datech není ani jeden pozemek blíž než 20 km"
   a kontrola na tom trvala. Pak jsem vrátil do dat osmnáct podílů
   ÚZSVM, jeden z nich je „Lomnička u Plesné" 6,8 km odtud — a zkouška
   hlásila vadu webu kvůli změně, kterou web udělal správně.
   Je to táž past jako dnes u test-nove-pozemky, test-mapa-webu
   a test-mapa-pozemku (§378): hlídač s napsaným číslem stárne s daty.
   Co se měřit MÁ, je slib: počet, který stránka vypíše, patří TÉ OBCI
   z geokodéru — ne nejbližšímu místu z dat. */
const VERNEROV = { lat: 50.2771, lng: 12.4281 };
const KOREN_X = pathx.resolve(pathx.dirname(furlx(import.meta.url)), '..');
const DATA_X = (() => {
  try {
    const j = JSON.parse(readFileSyncX(pathx.join(KOREN_X, 'data', 'opportunities.json'), 'utf8'));
    return Array.isArray(j) ? j : (j.opportunities || []);
  } catch (e) { return []; }
})();
/* Táž vzdálenost jako na webu (haversine, km). Opsaná je schválně:
   kdyby si obě strany půjčovaly tentýž výpočet, chyba v něm by prošla
   oběma a zkouška by ji potvrdila. */
function kolikVOkruhu(km) {
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  let n = 0;
  for (const d of DATA_X) {
    if (!isFinite(d.lat) || !isFinite(d.lng)) continue;
    const dLat = r(d.lat - VERNEROV.lat), dLon = r(d.lng - VERNEROV.lng);
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(r(VERNEROV.lat)) * Math.cos(r(d.lat)) * Math.sin(dLon / 2) ** 2;
    if (2 * R * Math.asin(Math.sqrt(h)) <= km) n++;
  }
  return n;
}

await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
const ctx = await prohlizec.newContext({ bypassCSP: true,
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  locale: 'cs-CZ', serviceWorkers: 'block' });
let dotazu = 0;
await ctx.route('**/nominatim.openstreetmap.org/**', (r) => {
  dotazu++;
  const u = decodeURIComponent(r.request().url());
  const telo = /Vern/i.test(u)
    ? JSON.stringify([{ lat: String(VERNEROV.lat), lon: String(VERNEROV.lng) }])
    : '[]';
  r.fulfill({ status: 200, contentType: 'application/json', body: telo });
});
const p = await ctx.newPage();
await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(2500);
await naPohled(p, 'mapa');
await p.waitForTimeout(2000);
await p.evaluate(() => { const b = document.getElementById('map-near'); if (b) b.click(); });
await p.waitForFunction(() => document.querySelector('#vm-mapa canvas, #vm-mapa .leaflet-tile'),
  null, { timeout: 40000 }).catch(() => {});
await p.waitForTimeout(1500);

const radky = () => p.evaluate(() => [].slice.call(document.querySelectorAll('.vm-navrhy li')).map((l) => ({
  text: (l.textContent || '').trim(), jinde: l.classList.contains('vm-jinde'),
})));
const stav = () => p.evaluate(() => ({
  pocet: ((document.getElementById('vm-pocet') || {}).innerText || '').split('\n')[0],
  dlazdice: [].slice.call(document.querySelectorAll('.vm-km')).map((l) => ({
    km: Number(l.querySelector('input').value), n: (l.querySelector('b') || {}).textContent })),
}));

// --- obec, kterou data neznají ---------------------------------------
await p.fill('#vm-q', 'Vernéřov');
await p.waitForTimeout(1400);
const r1 = await radky();
/* POČET ŘÁDKŮ SE NEHLÍDÁ, HLÍDÁ SE PRAVIDLO. Napoprvé tu stálo
   `r1.length === 1` a padlo to na datech, ne na webu: robot přidal
   nabídku v „Hradišti u Vernéřova", takže se k nabídnutému hledání
   přidal ještě návrh z dat. To je v pořádku — pravidlo zní, že
   poslední řádek je nabídka najít obec v geokodéru. */
const posledni = r1[r1.length - 1];
pravda('obec bez nabídek už nevrací prázdno — poslední řádek nabídne „najít na mapě"',
  r1.length >= 1 && !!posledni && posledni.jinde === true, JSON.stringify(r1));
pravda('a ten řádek je pojmenovaný tím, co člověk napsal',
  !!posledni && posledni.text.indexOf('Vernéřov') >= 0, JSON.stringify(r1));
/* Psaní nesmí geokodér vyvolat: šest znaků = šest dotazů na cizí
   server, a to by byl náš problém, i kdyby ho nikdo nereklamoval. */
pravda('při psaní se na geokodér NECHODÍ', dotazu === 0, `dotazů: ${dotazu}`);

await p.evaluate(() => document.querySelector('.vm-navrhy li.vm-jinde').click());
await p.waitForTimeout(2600);
const s1 = await stav();
pravda('po klepnutí padne na geokodér právě jeden dotaz', dotazu === 1, `dotazů: ${dotazu}`);
/* POČET, KTERÝ STRÁNKA VYPÍŠE, MUSÍ SEDĚT NA DATA KOLEM TÉ OBCE.
   Z hlášky se vezme číslo i okruh a oboje se přepočítá z dat. Kdyby
   stránka letěla k nejbližšímu místu z dat (to dělala dřív), vyšlo by
   číslo jiné — a právě to je ta vada, kvůli které tahle zkouška je. */
{
  /* MEZERY JAKO \s+, NE JAKO MEZERY. Web sází českou typografií, takže
     mezi „v" a „okruhu" i před „km" stojí nezlomitelná mezera —
     s obyčejnou mezerou ve vzoru tahle kontrola padla na SVÉM VLASTNÍM
     zápisu, ne na webu. */
  const m = /^(\d+)\s+\S+\s+v\s+okruhu\s+(\d+)\s*km/.exec(s1.pocet || '');
  pravda('hláška o okolí má tvar „N pozemků v okruhu K km u obce …"',
    !!m, `počet: „${s1.pocet}"`);
  if (m) {
    const kolik = Number(m[1]), okruh = Number(m[2]);
    const zDat = kolikVOkruhu(okruh);
    pravda(`a okno doletí k té obci — ${kolik} v okruhu ${okruh} km sedí na data (${zDat})`,
      kolik === zDat,
      `stránka říká ${kolik}, z dat kolem Vernéřova vychází ${zDat}`
      + ' — tolik by to bylo, kdyby okno letělo jinam než k té obci');
  }
}
/* Tohle je ta informace, kvůli které celá změna vznikla: „u nás nic,
   ale osm je do dvaceti kilometrů". */
pravda('a dlaždice ukážou, od kterého okruhu něco je',
  s1.dlazdice.some((d) => Number(d.n) > 0),
  s1.dlazdice.map((d) => `${d.km}→${d.n}`).join(' '));
/* najdiNazevMista() by tu vrátilo nejbližší místo z dat (strop 25 km),
   tedy obec, na kterou se nikdo neptal. */
pravda('a počet mluví o TÉ obci, ne o nejbližší z dat',
  s1.pocet.indexOf('Vernéřov') >= 0, `počet: „${s1.pocet}"`);

// --- klepnutí do mapy jméno zahodí -----------------------------------
await p.evaluate(() => {
  const m = document.querySelector('#vm-mapa');
  const r = m.getBoundingClientRect();
  m.dispatchEvent(new MouseEvent('click', { bubbles: true,
    clientX: Math.round(r.left + r.width * 0.5), clientY: Math.round(r.top + r.height * 0.5) }));
});
await p.waitForTimeout(1800);
const s2 = await stav();
pravda('po klepnutí do mapy se jméno z geokodéru už netvrdí',
  s2.pocet.indexOf('Vernéřov') < 0, `počet: „${s2.pocet}"`);

// --- obec, která neexistuje ------------------------------------------
await p.fill('#vm-q', 'Xyzqwergh');
await p.waitForTimeout(1400);
await p.evaluate(() => {
  const l = document.querySelector('.vm-navrhy li.vm-jinde');
  if (l) l.click();
});
await p.waitForTimeout(2600);
const nenasla = await p.evaluate(() => ({
  radek: ((document.querySelector('.vm-navrhy li') || {}).textContent || '').trim(),
  skryto: (document.querySelector('.vm-navrhy') || {}).hidden,
}));
pravda('nenalezená obec to řekne v řádku, ne mlčením',
  nenasla.skryto === false && /nenašla/i.test(nenasla.radek),
  JSON.stringify(nenasla));

// --- nabídne se i vedle návrhů z dat ---------------------------------
/* „Horka" v datech je „Horka II": shoda na začátku, ne shoda jména.
   Kdo hledá jinou Horku, musí mít kam klepnout. */
await p.fill('#vm-q', 'Horka');
await p.waitForTimeout(1400);
const r2 = await radky();
pravda('vedle návrhů z dat se „najít na mapě" nabídne taky',
  r2.length >= 2 && r2[r2.length - 1].jinde === true && r2.some((x) => !x.jinde),
  JSON.stringify(r2));

await ctx.close();
await prohlizec.close();
console.log('\nOkolí — obec bez nabídek');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Okolí (obec bez nabídek): ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
