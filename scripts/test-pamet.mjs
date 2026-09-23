// Test: web si pamatuje, kde jste skončili — bez účtu, jen v prohlížeči.
//
// Spuštění: node scripts/test-pamet.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Tři věci, všechny postavené na localStorage:
//   · „Nové od minulé návštěvy" — co přibylo od posledně,
//   · skryté pozemky („tenhle mě nezajímá"),
//   · poslední nastavení filtrů jako výchozí,
//   · a hlídání okolí vlastního pozemku („moje místo").
//
// Nejzrádnější je ta první. Datum návštěvy se musí zapsat AŽ PO vykreslení;
// kdyby se zapsalo při startu, člověk by si všechno odškrtl za viděné dřív,
// než to stihl uvidět, a odznak „Nové" by se nikdy neukázal. Test proto
// nejdřív projde stránku s uloženým dřívějším datem a teprve pak kontroluje,
// že se datum posunulo.
//
// Data se podstrkují, aby šlo přesně říct, co je nové a co ne.
import { chromium } from 'playwright-core';
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
}

// Tři „staré" a dva „nové" pozemky. Minulou návštěvu nastavíme na 2026-09-10.
const MINULE = '2026-09-10';
function pozemek(i, kdy) {
  return { place: 'Obec ' + i, okres: 'Kolín', type: 'sale', parcel: String(i),
    druh: 'orná půda', area: 3000 + i * 100, price: 150000 + i * 100000,
    extra: 'inzerát', lat: 50.02 + i * 0.01, lng: 15.2 + i * 0.01,
    url: 'https://example.invalid/' + i, first_seen: kdy };
}
const STARE = [1, 2, 3].map((i) => pozemek(i, '2026-09-01'));
const NOVE = [4, 5].map((i) => pozemek(i, '2026-09-18'));
const PODSTRCENA = { updated: '2026-09-20', source: 'test', opportunities: [...STARE, ...NOVE] };

const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
// Pořadí je důležité: Playwright bere POSLEDNÍ shodu, takže obecné pravidlo první.
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
  return LEAFLET ? r.abort() : r.continue();
});
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
await ctx.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
  contentType: 'application/json', body: JSON.stringify(PODSTRCENA) }));
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

// „Minulou návštěvu" nastavíme ručně a stránku načteme znovu. Přes
// addInitScript to nejde: ten se pouští při KAŽDÉM načtení, takže by se
// datum pořád vracelo zpátky a druhá návštěva by se nikdy nenasimulovala.
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate((d) => { try { localStorage.setItem('pk_navsteva_v1', JSON.stringify(d)); } catch (e) {} }, MINULE);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4200);

// --- 1) „Nové od minulé návštěvy" ------------------------------------
const stav = await p.evaluate(() => {
  const polozky = [...document.querySelectorAll('.opp-item')];
  return {
    celkem: polozky.length,
    sNovym: polozky.filter((e) => e.querySelector('.opp-nove')).map((e) => (e.querySelector('.opp-place') || {}).textContent),
    hlavicka: (document.querySelector('.mc-nove') || {}).textContent || '',
  };
});
pravda('seznam se vykreslil z podstrčených dat', stav.celkem === 5, `položek ${stav.celkem}`);
pravda('odznak „Nové" mají právě dva pozemky přibylé od minule',
  stav.sNovym.length === 2, `označené: ${JSON.stringify(stav.sNovym)}`);
pravda('označené jsou ty správné', stav.sNovym.join(',') === 'Obec 4,Obec 5' || stav.sNovym.join(',') === 'Obec 5,Obec 4',
  JSON.stringify(stav.sNovym));
pravda('v hlavičce seznamu je, kolik jich přibylo', /2\s+nov/.test(stav.hlavicka), `hlavička: „${stav.hlavicka}"`);

// --- 2) Datum návštěvy se posune, ale až po vykreslení ----------------
// Původně jsem tu četl úložiště hned po načtení a čekal staré datum. To bylo
// špatně položené: stránka potřebuje přes čtyři vteřiny na data, takže zápis
// (1,2 s po startu) je dávno hotový. Že se datum nepoužilo předčasně, dokazují
// odznaky výš — porovnává se s hodnotou načtenou při startu.
// Tohle je silnější kontrola: po obnovení stránky už nesmí být nové NIC.
await p.waitForTimeout(1800);
const potom = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('pk_navsteva_v1')); } catch (e) { return null; } });
pravda('datum návštěvy se posunulo na dnešek', !!potom && potom > MINULE,
  `v úložišti je ${potom}`);

// --- 3) Skrytí pozemku ------------------------------------------------
/* Skrývá se KONKRÉTNÍ pozemek, ne „ten poslední v seznamu".
   Pořadí výpisu je totiž schválně zamíchané pro každou relaci zvlášť
   (js/poradi.js, prihozeniSeance() losuje a ukládá do sessionStorage),
   takže „poslední" je pokaždé někdo jiný. Když na konci skončil ten
   nejlevnější — a to je při pěti pozemcích čirá náhoda — skryl se
   jediný pozemek, který projde cenovým filtrem, a kontrola o kus níž
   pak hlásila nulu. Test selhával přibližně každý druhý běh a vypadalo
   to jako chyba webu; přitom web dělal přesně to, co má.
   „Obec 5" je nejdražší (650 000), takže cenovému filtru „do 250 000"
   nepřekáží ani omylem. */
const skryto = await p.evaluate(() => {
  const vse = [...document.querySelectorAll('.opp-item')];
  const li = vse.find((x) => /Obec 5(\D|$)/.test(x.textContent));
  if (!li) return { chyba: 'karta „Obec 5" v seznamu není', v: vse.map((x) => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)) };
  const b = li.querySelector('.opp-skryt');
  if (!b) return { chyba: 'karta nemá tlačítko .opp-skryt', v: li.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) };
  b.click();
  return { ok: true };
});
pravda('našel se pozemek, který se má skrýt', skryto && skryto.ok === true,
  JSON.stringify(skryto));
await p.waitForTimeout(500);
const poSkryti = await p.evaluate(() => ({
  celkem: document.querySelectorAll('.opp-item').length,
  tlacitko: (document.getElementById('mc-skryte') || {}).textContent || '',
  ulozeno: (() => { try { return JSON.parse(localStorage.getItem('pk_skryte_v1')) || []; } catch (e) { return []; } })(),
}));
pravda('skrytý pozemek zmizel ze seznamu', poSkryti.celkem === 4, `zůstalo ${poSkryti.celkem}`);
pravda('skrytí se uložilo do prohlížeče', poSkryti.ulozeno.length === 1, JSON.stringify(poSkryti.ulozeno));
pravda('v hlavičce přibylo tlačítko „Zobrazit skryté"', /Zobrazit skryté \(1\)/.test(poSkryti.tlacitko),
  `tlačítko: „${poSkryti.tlacitko}"`);

await p.evaluate(() => document.getElementById('mc-skryte').click());
await p.waitForTimeout(500);
const poZobrazeni = await p.evaluate(() => ({
  celkem: document.querySelectorAll('.opp-item').length,
  ztlumene: document.querySelectorAll('.opp-item.je-skryty').length,
}));
pravda('„Zobrazit skryté" ho vrátí do seznamu', poZobrazeni.celkem === 5, `položek ${poZobrazeni.celkem}`);
pravda('vrácený skrytý pozemek je ztlumený', poZobrazeni.ztlumene === 1, `ztlumených ${poZobrazeni.ztlumene}`);

// --- 4) Filtr přežije obnovení stránky --------------------------------
await p.evaluate(() => {
  const el = document.getElementById('map-cena');
  // Pozor: je to <select> s pevnými volbami. Hodnota, která mezi nimi není,
  // se tiše zahodí — proto 250000, ne kulatých 200000.
  if (el) { el.value = '250000'; el.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(600);
const predObnovou = await p.evaluate(() => document.querySelectorAll('.opp-item').length);
await p.reload({ waitUntil: 'domcontentloaded' });
/* Čeká se na VÝSLEDEK, ne na hodiny — pevné čekání je vždycky jen sázka
   na to, že se stroj nezadrhne.
   Poznámka pro pořádek: NEBYLA to příčina toho, proč tenhle test padal.
   Zpočátku to tak vypadalo (padal v sadě, sám procházel) a čekání se
   kvůli tomu předělalo. Skutečná příčina byla jinde a je popsaná
   u skrývání pozemku výš: losované pořadí výpisu. Čekání na podmínku
   je i tak lepší než na hodiny, tak zůstává. */
await p.waitForFunction(
  () => document.querySelectorAll('.opp-item').length > 0
    || document.querySelector('#opp-list .map-count'),
  { timeout: 20000 },
).catch(() => {});
await p.waitForTimeout(400);
const poObnove = await p.evaluate(() => ({
  polozek: document.querySelectorAll('.opp-item').length,
  cena: (document.getElementById('map-cena') || {}).value,
}));
pravda('nastavená cena se po obnovení sama vrátila', poObnove.cena === '250000',
  `v poli je „${poObnove.cena}"`);
/* Pod 250 000 je z fixtury jediný pozemek („Obec 1"), a ten skrytý
   není — takže po obnovení musí zůstat přesně tak, jak byl. */
pravda('a seznam je podle ní opravdu filtrovaný',
  poObnove.polozek === predObnovou && poObnove.polozek > 0 && poObnove.polozek < 5,
  `před obnovou ${predObnovou}, po obnově ${poObnove.polozek}`);
pravda('skrytý pozemek zůstal skrytý i po obnovení',
  (await p.evaluate(() => (JSON.parse(localStorage.getItem('pk_skryte_v1')) || []).length)) === 1);

const novychPoObnove = await p.evaluate(() => document.querySelectorAll('.opp-nove').length);
pravda('po druhé návštěvě už není nové nic', novychPoObnove === 0,
  `pořád označeno ${novychPoObnove} — datum návštěvy se nejspíš neuložilo`);

// --- 5) Hlídání okolí vlastního pozemku ------------------------------
// „Kdo má dům, zajímá ho sousední pozemek." Místo se uloží v prohlížeči
// a při návratu musí web říct, co u něj od minule přibylo.
// Obec 1 leží na 50.03/15.21, Obec 5 na 50.07/15.25 — mezi nimi je asi
// 5,3 km. S okruhem 2 km se tedy do okolí Obce 1 vejde jen ona sama,
// s okruhem 20 km všechno.
await p.evaluate(() => {
  try {
    localStorage.setItem('pk_misto_v1', JSON.stringify({ lat: 50.03, lng: 15.21, km: 20, nazev: 'Obec 1' }));
    localStorage.setItem('pk_navsteva_v1', JSON.stringify('2026-09-10'));
    localStorage.removeItem('pk_skryte_v1');
    localStorage.removeItem('pk_filtr_v1');
  } catch (e) {}
});
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4200);
const misto = await p.evaluate(() => {
  const el = document.getElementById('misto-pruh');
  if (!el || el.hidden) return null;
  return {
    hlavni: el.querySelector('.mp-hlavni').textContent,
    pod: el.querySelector('.mp-pod').textContent,
    zvyrazneno: el.classList.contains('ma-novinky'),
    okruh: document.getElementById('misto-km').value,
  };
});
pravda('proužek hlídání okolí se ukázal', !!misto, 'proužek chybí nebo je schovaný');
if (misto) {
  pravda('říká, kolik pozemků u místa od minule přibylo', /přibyly 2 pozemky/.test(misto.hlavni),
    `text: „${misto.hlavni}"`);
  pravda('a je zvýrazněný, protože novinky jsou', misto.zvyrazneno === true);
  pravda('pod tím je okruh i celkový počet', /do 20 km/.test(misto.pod) && /5 pozemků/.test(misto.pod),
    `text: „${misto.pod}"`);
  pravda('rozbalovací seznam ukazuje uložený okruh', misto.okruh === '20', `vybráno ${misto.okruh}`);
}

// Zmenšením okruhu musí novinky zmizet — Obec 4 i 5 jsou dál než 2 km.
await p.evaluate(() => {
  const el = document.getElementById('misto-km');
  el.value = '2';
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await p.waitForTimeout(400);
const uzsi = await p.evaluate(() => ({
  hlavni: document.querySelector('.mp-hlavni').textContent,
  zvyrazneno: document.getElementById('misto-pruh').classList.contains('ma-novinky'),
  ulozeno: (() => { try { return JSON.parse(localStorage.getItem('pk_misto_v1')); } catch (e) { return null; } })(),
}));
pravda('po zúžení okruhu na 2 km už novinky nejsou', /nic nového/.test(uzsi.hlavni),
  `text: „${uzsi.hlavni}"`);
pravda('a proužek se přestal zvýrazňovat', uzsi.zvyrazneno === false);
pravda('nový okruh se uložil', uzsi.ulozeno && uzsi.ulozeno.km === 2, JSON.stringify(uzsi.ulozeno));

// Na kartách musí být vzdálenost od místa, i když se neřadí podle okolí.
const kmNaKartach = await p.evaluate(() => document.querySelectorAll('.opp-item .opp-km').length);
pravda('karty ukazují vzdálenost od uloženého místa', kmNaKartach > 0,
  'ani jedna karta nemá vzdálenost');

await p.evaluate(() => document.getElementById('misto-zrus').click());
await p.waitForTimeout(400);
const poZruseni = await p.evaluate(() => ({
  schovany: (document.getElementById('misto-pruh') || {}).hidden,
  pozvanka: document.getElementById('misto-pruh').classList.contains('bez-mista'),
  jeTlacitkoVybrat: !document.getElementById('mp-akce-zadne').hidden,
  ulozeno: localStorage.getItem('pk_misto_v1'),
  km: document.querySelectorAll('.opp-item .opp-km').length,
}));
// Proužek se po zrušení NESCHOVÁ, ale změní se v pozvánku. Kdyby zmizel,
// nešlo by hlídání zapnout jinak než přes GPS — a kdo polohu nepovolí,
// o funkci se nikdy nedozví.
pravda('po zrušení zůstane pozvánka, ne prázdno', poZruseni.schovany === false && poZruseni.pozvanka === true,
  `schovaný=${poZruseni.schovany}, pozvánka=${poZruseni.pozvanka}`);
pravda('a je v ní tlačítko „Vybrat na mapě"', poZruseni.jeTlacitkoVybrat === true);
pravda('místo se smazalo i z prohlížeče', poZruseni.ulozeno === null, `v úložišti zůstalo ${poZruseni.ulozeno}`);
pravda('vzdálenosti z karet zmizí taky', poZruseni.km === 0, `zůstalo ${poZruseni.km}`);

// --- 6) Místo jde určit na mapě (bez GPS) -----------------------------
// Tohle je jediná cesta pro člověka, který polohu nepovolí. Dřív to bylo
// jedno jediné klepnutí do hlavní mapy: kdo klepl vedle, měl hotovo a
// nedalo se couvnout. Teď se otevře vlastní mapa přes celou obrazovku.
await p.evaluate(() => document.getElementById('misto-vybrat').click());
await p.waitForSelector('.vm-ov #vm-mapa .leaflet-map-pane', { timeout: 25000 }).catch(() => {});
await p.waitForTimeout(900);
const vyber = await p.evaluate(() => {
  const mapa = document.getElementById('vm-mapa');
  const r = mapa ? mapa.getBoundingClientRect() : null;
  return {
    otevreno: !!document.querySelector('.vm-ov'),
    mapa: !!r && r.height > 200,
    kraju: document.querySelectorAll('#vm-kraj option').length,
    pocet: (document.getElementById('vm-pocet') || {}).textContent || '',
  };
});
pravda('tlačítko „Vybrat na mapě" otevře mapu výběru', vyber.otevreno && vyber.mapa,
  `otevřeno=${vyber.otevreno}, mapa=${vyber.mapa}`);
pravda('a dá se v ní vybrat kraj', vyber.kraju >= 15, `v nabídce je ${vyber.kraju} položek`);
pravda('rovnou ukazuje, kolik pozemků v okruhu je', /\d+ pozem/.test(vyber.pocet), vyber.pocet);

/* Výběr se potvrdí tam, kde mapa stojí; okruh se roztáhne tak, aby v něm
   vymyšlená data vůbec byla. (Hledání obce a přepínání krajů prověřuje
   scripts/test-okoli.mjs na skutečných datech — tady jsou obce vymyšlené
   a hledání by nemělo co najít.) */
// Okruh je řada přepínačů, ne rozbalovací seznam — všechny možnosti
// musí být vidět naráz, jinak se o velikosti okolí nikdo nedozví.
await p.check('input[name="vm-km"][value="50"]');
await p.waitForTimeout(1500);
const slib = await p.evaluate(() => (document.getElementById('vm-pocet') || {}).textContent || '');
pravda('výběr slibuje konkrétní počet pozemků', (parseInt(slib, 10) || 0) > 0, slib);
await p.evaluate(() => document.getElementById('vm-ok').click());
await p.waitForTimeout(2500);
const poVyberu = await p.evaluate(() => ({
  otevreno: !!document.querySelector('.vm-ov'),
  ulozeno: (() => { try { return JSON.parse(localStorage.getItem('pk_misto_v1')); } catch (e) { return null; } })(),
  pozvanka: document.getElementById('misto-pruh').classList.contains('bez-mista'),
  km: document.querySelectorAll('.opp-item .opp-km').length,
  jdeZmenit: !!document.getElementById('misto-zmenit'),
}));
pravda('potvrzení výběru místo uloží', !!(poVyberu.ulozeno && isFinite(poVyberu.ulozeno.lat)),
  JSON.stringify(poVyberu.ulozeno));
pravda('výběr se přitom zavře', poVyberu.otevreno === false);
pravda('proužek přestane být pozvánkou', poVyberu.pozvanka === false);
pravda('a na kartách se zase objeví vzdálenost', poVyberu.km > 0, `karet se vzdáleností: ${poVyberu.km}`);
/* Výběr počítal jen z toho, co projde i zapnutými filtry — jinak sliboval
   „5 pozemků v okruhu" a seznam pod ním hlásil, že tam není nic. */
pravda('a slíbený počet se opravdu vypsal', poVyberu.km === (parseInt(slib, 10) || -1),
  `výběr sliboval „${slib.trim()}", v seznamu je ${poVyberu.km} karet`);
// Bez tohohle tlačítka se jednou vybrané místo nedalo změnit jinak než
// zrušit a začít od nuly — přesně to lidi na téhle funkci štvalo.
pravda('a místo jde kdykoli změnit', poVyberu.jdeZmenit,
  'u uloženého místa chybí tlačítko „Změnit místo"');

pravda('na stránce nespadl žádný skript', chyby.length === 0, chyby[0]);

await prohlizec.close();
console.log('\nPaměť prohlížeče — nové od minule, skryté, filtr, hlídání okolí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Paměť prohlížeče: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
