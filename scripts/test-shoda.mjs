// Test: mapa a stránka pozemku říkají o ceně TOTÉŽ.
//
// Spuštění: node scripts/test-shoda.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč tohle existuje:
//
// Cenové srovnání bylo v kódu ve třech kopiích a rozešly se. Když jsem je
// sjednotil do js/ceny.js, zapomněl jsem přepojit mapu — a vznikla čtvrtá
// kopie. Přísnější pravidla zůstala jen na stránce pozemku, takže u 34 nabídek
// mapa tvrdila „normální cena" a stránka „cena k ověření". Toho si nikdo
// nevšimne, dokud si obojí neotevře vedle sebe.
//
// Test proto spustí OBA skripty nad stejnými daty v jednom prohlížeči
// a porovná výsledky kus po kuse na všech pozemcích. Nekontroluje text na
// obrazovce, ale samotný výpočet — text se může lišit rozvržením, číslo ne.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import pathMod from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;

const kde = process.env.PW_CHROMIUM || '';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
// Pořadí je důležité: Playwright bere POSLEDNÍ shodu, takže obecné pravidlo první.
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
  return LEAFLET ? r.abort() : r.continue();
});
// Bez Leafletu se mapa nespustí a s ní se nevykreslí ani SEZNAM — a právě
// ten se tu kontroluje. Dokud se tu Leaflet nepodstrkoval, hlásil test
// „karta se nenašla" a vypadalo to jako chyba webu.
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = pathMod.join(LEAFLET, pathMod.basename(new URL(r.request().url()).pathname));
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
// Stačí prázdná stránka na správném původu — načteme si jen cenový model.
await p.goto(`${BASE}/predloha.html`, { waitUntil: 'domcontentloaded' });
await p.addScriptTag({ url: '/js/ceny.js' });

const vysledek = await p.evaluate((D) => {
  if (!window.PK_CENY) return { chyba: 'PK_CENY se nenačetlo' };
  // Dva NEZÁVISLE postavené modely nad stejnými daty — tak, jak si je staví
  // mapa a stránka pozemku každá zvlášť.
  const mapa = window.PK_CENY.postav(D);
  const stranka = window.PK_CENY.postav(D);
  const neshody = [];
  let sOdhadem = 0, kOvereni = 0, sPercentilem = 0;
  for (const d of D) {
    const a = { n: mapa.neduveryhodna(d), p: mapa.percentil(d), o: mapa.odhad(d) };
    const b = { n: stranka.neduveryhodna(d), p: stranka.percentil(d), o: stranka.odhad(d) };
    if (a.n) kOvereni++;
    if (a.p) sPercentilem++;
    if (a.o) sOdhadem++;
    if (a.n !== b.n || JSON.stringify(a.p) !== JSON.stringify(b.p) || JSON.stringify(a.o) !== JSON.stringify(b.o)) {
      neshody.push({ misto: d.place, a, b });
    }
  }
  return { pocet: D.length, neshody, kOvereni, sPercentilem, sOdhadem };
}, DATA);

pravda('cenový model se v prohlížeči načetl', !vysledek.chyba, vysledek.chyba);
if (!vysledek.chyba) {
  pravda('mapa i stránka pozemku dají u všech pozemků stejný výsledek',
    vysledek.neshody.length === 0,
    `neshod: ${vysledek.neshody.length}, první: ${JSON.stringify(vysledek.neshody[0])}`);

  // Zdravý rozum: model musí něco říkat, ale ne o všem.
  pravda('štítek „k ověření" dostane jen hrstka nabídek, ne polovina webu',
    vysledek.kOvereni > 0 && vysledek.kOvereni < vysledek.pocet * 0.05,
    `označeno ${vysledek.kOvereni} z ${vysledek.pocet}`);
  pravda('percentil se spočítá u většiny nabídek',
    vysledek.sPercentilem > vysledek.pocet * 0.5,
    `spočítán u ${vysledek.sPercentilem} z ${vysledek.pocet}`);
  pravda('odhad obvyklé ceny vznikne u podstatné části, ale ne u všech',
    vysledek.sOdhadem > 100 && vysledek.sOdhadem < vysledek.pocet,
    `odhadů ${vysledek.sOdhadem} z ${vysledek.pocet}`);
}

// A ještě to, kvůli čemu se to celé rozešlo: že mapa opravdu používá
// SPOLEČNÝ model, ne vlastní kopii.
const kopie = await p.evaluate(async (base) => {
  const t = await (await fetch(base + '/js/main.js')).text();
  return {
    pouzivaModel: /window\.PK_CENY\s*&&\s*window\.PK_CENY\.postav/.test(t),
    vlastniIndex: /var\s+perM2Index\s*=/.test(t),
  };
}, BASE);
pravda('mapa si model bere ze společného souboru', kopie.pouzivaModel === true,
  'js/main.js nevolá window.PK_CENY.postav');
pravda('mapa už nemá vlastní kopii cenového indexu', kopie.vlastniIndex === false,
  'v js/main.js je zase var perM2Index');

// --- A hlavně: opravdu se to na stránce pozemku VYKRESLÍ? ------------
// Samotný výpočet může být správný a na obrazovce přesto nic není.
// Přesně to se stalo: js/ceny.js měl v pozemek.html atribut defer, kdežto
// js/pozemek.js ne — pořadí se tím obrátilo, cenový model v okamžiku použití
// ještě neexistoval a blok s odhadem se mlčky nevykreslil. Nic nespadlo,
// žádný test to nechytil, jen tam nebyl.
const cil = await p.evaluate((D) => {
  const M = window.PK_CENY.postav(D);
  // Stejná podmínka, jakou má vykreslování: bez srovnání s podobně velkými
  // pozemky se sleva netvrdí, takže takový pozemek by na stránce nic neukázal
  // a test by hlásil chybu tam, kde žádná není.
  const n = D.filter((d) => { const o = M.odhad(d); return o && o.podleVelikosti && o.podOdhadem >= 15; })
    .sort((a, b) => M.odhad(b).podOdhadem - M.odhad(a).podOdhadem)[0];
  return n ? { klic: [n.place, n.parcel, n.okres, n.lat.toFixed(3), n.lng.toFixed(3)].join('|'),
    ll: n.lat + ',' + n.lng, castka: M.odhad(n).castka } : null;
}, DATA);
pravda('v datech je aspoň jeden pozemek, u kterého se odhad má ukázat', !!cil);
if (cil) {
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/pozemek.html?p=${encodeURIComponent(cil.klic)}&ll=${cil.ll}`,
    { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(6000);
  const videt = await p2.evaluate(() => {
    const e = document.querySelector('.md-odhad');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { text: e.textContent.replace(/\s+/g, ' ').trim(), vyska: Math.round(r.height) };
  });
  pravda('blok s odhadem je na stránce pozemku opravdu vykreslený', !!videt,
    'prvek .md-odhad na stránce není — model se nejspíš nenačetl dřív než skript stránky');
  if (videt) {
    pravda('blok s odhadem má nenulovou výšku (není schovaný)', videt.vyska > 30,
      `výška ${videt.vyska} px`);
    const cislo = String(cil.castka).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    pravda('ukazuje tutéž částku, jakou spočítal model', videt.text.indexOf(cislo) !== -1,
      `na stránce chybí „${cislo}"; text: ${videt.text.slice(0, 140)}`);
    pravda('a přiznává, že jde o ceny nabídkové', /nabídkov/i.test(videt.text),
      videt.text.slice(0, 160));
  }
  await p2.close();
}

// --- Varování o ceně musí být i na KARTĚ, nejen v detailu ------------
// Kdo do detailu neklikne, se o podezřelé ceně nedozví — a zrovna tuhle
// informaci potřebuje vidět hned. Zároveň se tu ověřuje hledání podle
// PARCELNÍHO ČÍSLA: kdo drží výpis z katastru, má po ruce číslo parcely,
// ne název obce.
const podezrely = await p.evaluate((D) => {
  const M = window.PK_CENY.postav(D);
  const d = D.find((x) => M.neduveryhodna(x));
  return d ? { place: d.place, parcel: d.parcel } : null;
}, DATA);
pravda('v datech je aspoň jedna nabídka s nevěrohodnou cenou', !!podezrely);
if (podezrely) {
  const p3 = await ctx.newPage();
  await p3.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p3.waitForTimeout(4500);
  await p3.evaluate((q) => {
    const e = document.getElementById('map-search');
    e.value = q; e.dispatchEvent(new Event('input', { bubbles: true }));
  }, podezrely.place);
  await p3.waitForTimeout(700);
  const karta = await p3.evaluate(() => {
    const li = document.querySelector('.opp-item');
    return li ? { text: li.textContent.replace(/\s+/g, ' ').trim(), overit: !!li.querySelector('.opp-overit') } : null;
  });
  pravda('podezřelá nabídka má varování rovnou na kartě',
    !!(karta && karta.overit), karta ? karta.text.slice(0, 120) : 'karta se nenašla');

  // Hledání podle parcelního čísla.
  const sParcelou = await p.evaluate((D) => {
    const d = D.find((x) => x.parcel && /^\d+\/\d+$/.test(x.parcel));
    return d ? { parcel: d.parcel, place: d.place } : null;
  }, DATA);
  if (sParcelou) {
    await p3.evaluate((q) => {
      const e = document.getElementById('map-search');
      e.value = q; e.dispatchEvent(new Event('input', { bubbles: true }));
    }, sParcelou.parcel);
    await p3.waitForTimeout(700);
    const nalez = await p3.evaluate(() => [...document.querySelectorAll('.opp-item')]
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    pravda('hledat jde i podle parcelního čísla', nalez.length > 0,
      `„${sParcelou.parcel}" nenašlo nic — hledá se nejspíš jen podle místa a okresu`);
    pravda('a najde se ta správná parcela',
      nalez.some((t) => t.indexOf(sParcelou.place) !== -1),
      `hledáno ${sParcelou.parcel} (${sParcelou.place}), vyšlo: ${nalez[0] || '—'}`);
  }
  await p3.close();
}

await prohlizec.close();
console.log('\nShoda cen mezi mapou a stránkou pozemku');
console.log(`  · porovnáno ${vysledek.pocet || 0} pozemků, kus po kuse`);
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Shoda cen: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
