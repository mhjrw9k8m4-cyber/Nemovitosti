// Test: přepínač podkladu hlavní mapy (základní / letecký).
//
// Spuštění: node scripts/test-podklad-mapy.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Na detailu pozemku šlo přepnout na letecký snímek odjakživa (a je tam
// dokonce výchozí), na hlavní mapě ne. Kdo chtěl vidět, jestli k pozemku
// vede cesta nebo je kolem les, musel nejdřív otevřít konkrétní nabídku —
// jenže právě na přehledu se rozhoduje, kterou vůbec otevřít.
//
// Tři věci, u kterých se dá udělat tichá chyba:
//  1. FILTR. Pravidlo .pk-basemap stahuje barevnost ZÁKLADNÍ mapy do
//     palety webu. Na fotografii by z lesa a pole udělalo stejnou šeď —
//     tedy by zrušilo to jediné, kvůli čemu si člověk letecký zapíná.
//  2. VÝCHOZÍ STAV. Na pohledu přes celou republiku je letecký snímek
//     hnědozelená kaše, ve které tečky nabídek zaniknou. Začínat se
//     proto musí základní mapou.
//  3. JEDEN ZDROJ ADRES. Definice podkladů se nesmí opisovat; jsou
//     v js/snimek.js kvůli detailu a hlavní mapa je BERE ODTAMTUD.
//     Dvě kopie adres dlaždic se rozejdou jako všechno zdvojené.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nPodklad hlavní mapy');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Podklad mapy: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

/* ---- 1) adresy dlaždic se neopisují (bez prohlížeče) ---- */
{
  const main = readFileSync(path.join(KOREN, 'js', 'main.js'), 'utf8');
  const bez = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  pravda('hlavní mapa bere podklady z js/snimek.js, neopisuje je',
    /PK_SNIMEK\s*&&\s*window\.PK_SNIMEK\.podklady|PK_SNIMEK\.podklady/.test(bez),
    'v js/main.js není odkaz na window.PK_SNIMEK.podklady');
  /* Jedna adresa OSM v main.js zůstat smí — je to záložní definice pro
     případ, že by se snimek.js nenačetl. Víc než jedna znamená kopii. */
  const arcgis = (bez.match(/arcgisonline|World_Imagery/g) || []).length;
  pravda('a adresa leteckých dlaždic v main.js vůbec není', arcgis === 0,
    `nalezeno ${arcgis}× — to je kopie, která se rozejde`);
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

async function otevri(sirka, dotyk) {
  const ctx = await prohlizec.newContext({ viewport: { width: sirka, height: 900 },
    hasTouch: !!dotyk, isMobile: !!dotyk });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2300);
  /* Na telefonu je výchozí pohled SEZNAM a mapa je skrytá — bez
     přepnutí by se měřil prvek o nulové velikosti a vypadalo by to,
     že přepínač chybí. (Napoprvé se to tak i stalo.) */
  if (dotyk) {
    const b = await p.$('.mvt-btn:not(.active)');
    if (b) { await b.click(); await p.waitForTimeout(1600); }
  }
  return { ctx, p };
}
const stav = (p) => p.evaluate(() => {
  const b = [...document.querySelectorAll('#map-podklad button')];
  const o = document.querySelector('#map-podklad');
  const vrstva = document.querySelector('.leaflet-tile-pane .leaflet-layer');
  const dl = document.querySelector('.leaflet-tile-pane img');
  return {
    je: !!o, volby: b.map((x) => x.getAttribute('data-podklad')),
    zapnuta: (b.find((x) => x.classList.contains('on')) || {}).getAttribute
      ? b.find((x) => x.classList.contains('on')).getAttribute('data-podklad') : null,
    trida: vrstva ? vrstva.className : null,
    filtr: vrstva ? getComputedStyle(vrstva).filter : null,
    dlazdice: dl ? dl.src : null,
    vyska: b[0] ? Math.round(b[0].getBoundingClientRect().height) : 0,
    sirka: o ? Math.round(o.getBoundingClientRect().width) : 0,
    pretejka: o ? o.getBoundingClientRect().right > document.documentElement.clientWidth + 1 : null,
  };
});

/* ---- 2) přepínání a filtr ---- */
{
  const { ctx, p } = await otevri(1280, false);
  const s0 = await stav(p);
  // PŘEDPOKLAD: bez přepínače nemá smysl měřit nic dalšího
  pravda('na hlavní mapě je přepínač podkladu', s0.je && s0.volby.length >= 2,
    JSON.stringify(s0.volby));
  if (!s0.je) { await prohlizec.close(); hotovo(); }

  pravda('začíná se ZÁKLADNÍ mapou (na celé ČR je letecký snímek kaše)',
    s0.zapnuta === 'zakladni', `zapnuto: ${s0.zapnuta}`);
  pravda('a základní mapa je stažená do palety webu (filtr)',
    /grayscale|saturate/.test(s0.filtr || ''), `filtr: ${s0.filtr}`);
  pravda('a bere se z OpenStreetMap', /openstreetmap/i.test(s0.dlazdice || ''), s0.dlazdice);

  await p.click('#map-podklad button[data-podklad="letecka"]');
  await p.waitForTimeout(1800);
  const s1 = await stav(p);
  pravda('klepnutím se přepne na letecký snímek', s1.zapnuta === 'letecka',
    `zapnuto: ${s1.zapnuta}`);
  pravda('a dlaždice jsou opravdu z leteckého zdroje',
    /arcgisonline|World_Imagery/i.test(s1.dlazdice || ''), s1.dlazdice);
  /* Tohle je ta tichá chyba: filtr nechaný na fotografii. */
  pravda('a NEFILTRUJE se — z fotografie by filtr udělal šeď',
    (s1.filtr || 'none') === 'none', `filtr na snímku: ${s1.filtr}`);

  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(2300);
  const s2 = await stav(p);
  pravda('volba vydrží i po načtení stránky znovu', s2.zapnuta === 'letecka',
    `po obnovení: ${s2.zapnuta}`);

  await p.click('#map-podklad button[data-podklad="zakladni"]');
  await p.waitForTimeout(1500);
  const s3 = await stav(p);
  pravda('a dá se vrátit zpátky i s filtrem',
    s3.zapnuta === 'zakladni' && /grayscale|saturate/.test(s3.filtr || ''),
    `${s3.zapnuta}, filtr ${s3.filtr}`);
  await ctx.close();
}

/* ---- 3) na telefonu se dá trefit prstem ---- */
{
  const { ctx, p } = await otevri(390, true);
  const s = await stav(p);
  pravda('na telefonu je přepínač vidět', s.je && s.sirka > 60,
    `šířka ${s.sirka} px`);
  pravda('a dá se trefit prstem (44 px)', s.vyska >= 44, `${s.vyska} px`);
  pravda('a nepřetéká z obrazovky', s.pretejka === false);
  await ctx.close();
}

/* ===== OSTRÉ DLAŽDICE JEN NA LETECKÉ =================================
   Na telefonu s trojnásobnou hustotou pixelů se dlaždice 256 px jen
   roztáhne. detectRetina si řekne o dlaždice o stupeň hlouběji a vykreslí
   je na poloviční stranu — změřeno na šachovnici v hustotě mapového
   detailu: hranová energie 14,8 → 29,5, tedy dvojnásobek. Stojí to ale
   čtyřnásobek stažených dlaždic (6 → 24 na obrazovku), a to z cizího
   serveru.
   Proto se zapíná JEN na leteckém snímku: ten si zapíná ten, kdo chce
   vidět, co na pozemku roste. Základní mapa jede z veřejných dlaždic
   OpenStreetMap, které na takový provoz nejsou, a je navíc odbarvená na
   92 % — jemný detail v ní nikdo nehledá.
   Je to rozhodnutí o cizím serveru, ne vkusovka, takže se hlídá: aby se
   nezaplo plošně nedopatřením ani nevyplo, až na to někdo sáhne. */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);

  const zjisti = () => p.evaluate(() => {
    let vrstva = null;
    window.PK_MAPA.eachLayer((l) => { if (l.getTileUrl) vrstva = l; });
    if (!vrstva) return null;
    return { retina: !!vrstva.options.detectRetina, url: String(vrstva._url || ''),
      /* Leaflet si při detectRetina sám zvedne zoomOffset o 1. */
      posun: vrstva.options.zoomOffset || 0 };
  });

  const zakl = await zjisti();
  pravda('základní podklad se vůbec našel', !!zakl, 'žádná dlaždicová vrstva');
  pravda('základní mapa ostré dlaždice NEžádá (jede z veřejných dlaždic OSM)',
    zakl && zakl.retina === false, zakl ? `detectRetina=${zakl.retina} na ${zakl.url.slice(0, 48)}` : '—');

  await p.evaluate(() => {
    const b = document.querySelector('#map-podklad [data-podklad="letecka"]');
    if (b) b.click();
  });
  await p.waitForTimeout(1200);
  const foto = await zjisti();
  pravda('letecký snímek naopak ostré dlaždice žádá',
    foto && foto.retina === true, foto ? `detectRetina=${foto.retina} na ${foto.url.slice(0, 48)}` : '—');
  pravda('a Leaflet si o ně opravdu sáhne o stupeň hlouběji',
    foto && foto.posun >= 1, foto ? `zoomOffset ${foto.posun}` : '—');
  await ctx.close();
}

await prohlizec.close();
hotovo();
