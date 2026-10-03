// Test živého proužku v úvodu (tři fakta z dat) a věrohodnosti cen.
//
// Spuštění: node scripts/test-uvod.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč tohle hlídat:
//
// 1) Úvodní obrazovka tvrdila jen „1 953 pozemků · 77 okresů". Je to pravda,
//    ale nic to neříká o tom, jestli se tu něco děje. Proužek ukazuje tři
//    fakta ze skutečných dat. Kdyby se rozbil výpočet, zůstaly by prázdné
//    kolonky nebo pomlčky — a toho si při zběžném pohledu nikdo nevšimne.
//
// 2) Důležitější je DRUHÁ kontrola. Jako „nejvýhodnější dnes" web původně
//    nabízel stavební pozemek 3 315 m² za 11 000 Kč, tedy 3 Kč/m² proti
//    mediánu 2 888 Kč/m². To není příležitost, to je skoro jistě
//    spoluvlastnický podíl nebo chyba v inzerátu. Kdo na takové číslo jednou
//    klikne a zjistí, co za ním je, podruhé už žádnému našemu číslu nevěří.
//    Test proto porovná, co stránka vypíše, s vlastním výpočtem z dat.
//
// 3) Dražba s prošlým termínem na titulce je totéž znovu — proto se ověřuje,
//    že vypsaný termín není v minulosti.
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

// --- co bychom čekali, spočítáno nezávisle na stránce -----------------
const zdroj = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
const DATA = zdroj.opportunities;

function druhGroup(s) {
  s = (s || '').toLowerCase();
  if (s.indexOf('les') !== -1) return 'Lesní pozemek';
  if (s.indexOf('stavební') !== -1 || s.indexOf('zastav') !== -1) return 'Stavební / zastavěná';
  if (s.indexOf('orná') !== -1) return 'Orná půda';
  if (s.indexOf('zahrad') !== -1) return 'Zahrada';
  if (s.indexOf('travní') !== -1 || s.indexOf('louk') !== -1 || s.indexOf('pastvin') !== -1) return 'Louka / travní porost';
  if (s.indexOf('vinice') !== -1 || s.indexOf('sad') !== -1) return 'Vinice / sad';
  if (s.indexOf('ostatní') !== -1) return 'Ostatní plocha';
  return 'Jiný pozemek';
}
const medianSkupiny = (() => {
  const idx = {};
  for (const d of DATA) {
    if (typeof d.area === 'number' && d.area > 0 && d.price) {
      const k = d.type + '|' + druhGroup(d.druh);
      (idx[k] = idx[k] || []).push(d.price / d.area);
    }
  }
  const m = {};
  for (const k of Object.keys(idx)) {
    idx[k].sort((a, b) => a - b);
    m[k] = idx[k][Math.floor(idx[k].length / 2)];
  }
  return m;
})();
/** Cena pod padesátinou mediánu své skupiny = podíl nebo překlep. */
function neduveryhodna(d) {
  if (!(typeof d.area === 'number' && d.area > 0 && d.price)) return false;
  const med = medianSkupiny[d.type + '|' + druhGroup(d.druh)];
  return med ? (d.price / d.area) < med / 50 : false;
}
const podezrela = DATA.filter(neduveryhodna);
const podezrelaMista = new Set(podezrela.map((d) => d.place));

// --- prohlížeč --------------------------------------------------------
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
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
  await ctx.route(`${BASE}/index.html`, async (r) => {
    const o = await r.fetch();
    const t = (await o.text()).replace(/\s+integrity="[^"]*"/g, '');
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: t });
  });
}

const p = await ctx.newPage();
const chyby = [];
p.on('pageerror', (e) => chyby.push(String(e)));
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4500);

const proužek = await p.evaluate(() => {
  const box = document.getElementById('hero-live');
  if (!box) return null;
  const el = (f) => box.querySelector(`[data-fakt="${f}"]`);
  const cti = (f) => {
    const a = el(f);
    if (!a || a.hidden) return null;
    return {
      klic: a.querySelector('.hl-k').textContent.trim(),
      hodnota: a.querySelector('.hl-v').textContent.trim(),
    };
  };
  return { skryty: box.hidden, drazba: cti('drazba'), nove: cti('nove'), deal: cti('deal') };
});

pravda('živý proužek se v úvodu objevil', proužek && proužek.skryty === false,
  'element #hero-live chybí nebo zůstal schovaný');

if (proužek) {
  for (const [klic, popis] of [['drazba', 'nejbližší dražba'], ['deal', 'nejvýhodnější dnes']]) {
    const f = proužek[klic];
    pravda(`fakt „${popis}" má popisek i hodnotu`,
      !!(f && f.klic && f.hodnota && f.hodnota !== '—'),
      `vyšlo ${JSON.stringify(f)}`);
  }

  /* „Kolik přibylo" je jediný fakt, který SMÍ chybět — a musí chybět
     tehdy, když by lhal. Datum „poprvé viděno" se do dat doplnilo
     najednou, takže po jeho zavedení vypadalo 1 947 z 1 953 nabídek jako
     čerstvě přibylých a v úvodu stálo „Přibylo za týden: 1 940 pozemků"
     hned vedle údaje „1 940 pozemků celkem". Dvě stejná čísla vedle sebe
     nejsou novinka, ale datum zavedení sloupce. Buď se tedy ukáže číslo,
     které jako novinka obstojí, nebo se mlčí. */
  const nove = proužek.nove;
  const surova = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
  const celkem = new Set(surova.map((d) => [d.place, d.okres, d.price, d.area, d.druh].join('|'))).size;
  if (nove && nove.hodnota) {
    const n = +String(nove.hodnota).replace(/[^\d]/g, '');
    pravda('„kolik přibylo" nehlásí skoro celou databázi jako novinku',
      n > 0 && n <= Math.round(celkem / 3),
      `hlásí ${n} z ${celkem} — to není novinka, to je den, kdy se zavedlo „poprvé viděno"`);
    pravda('a má u sebe popisek', !!nove.klic, JSON.stringify(nove));
  } else {
    pravda('„kolik přibylo" radši mlčí, než aby lhalo', true);
  }

  // Dražba nesmí být z minulosti — a „dnes/zítra/za N dní" je vždy budoucnost.
  const d = proužek.drazba;
  pravda('termín nejbližší dražby není v minulosti',
    !!(d && /^(dnes|zítra|za \d+ dn[yí])\b/.test(d.hodnota)),
    `vyšlo ${JSON.stringify(d && d.hodnota)} — čekal se tvar „zítra · Obec"`);

  /* Nejvýhodnější nabídka se hlásí ČÁSTKOU, ne pořadím v žebříčku.
     „Levnější než 92 % podobných" je pořadí a člověk si pod tím nic
     nepředstaví; rozdíl proti obvyklé ceně je údaj.
     Tvar se změnil z „o 92 % pod obvyklou · Obec" na „−92 % · Obec":
     hodnota se dělí na PRVNÍM oddělovači, takže dřív byl tím velkým
     údajem celý útržek „o 92 % pod obvyklou" — rozlomená věta bez
     podstatného jména — a na obec zbylo drobné písmo. Co to procento
     znamená, říká teď popisek vlevo („Nejvíc pod cenou"). Číslo ale
     zůstává číslem, a přesně to tahle kontrola hlídá. */
  pravda('nejvýhodnější se hlásí jako rozdíl proti obvyklé ceně',
    !!(proužek.deal && /^\u2212\d+ % · .+/.test(proužek.deal.hodnota)),
    `vyšlo „${proužek.deal && proužek.deal.hodnota}"`);

  // Jádro testu: nabídka s nevěrohodnou cenou se nesmí vydávat za koupi roku.
  const deal = proužek.deal;
  const misto = deal ? deal.hodnota.split('·').pop().trim() : '';
  pravda('jako nejvýhodnější se nenabízí pozemek s nevěrohodnou cenou',
    !!(misto && !podezrelaMista.has(misto)),
    `stránka nabízí „${misto}", což je mezi ${podezrela.length} podezřelými záznamy ` +
    `(cena za m² pod padesátinou mediánu skupiny)`);
}

/* ---- Ty tři údaje musí VYPADAT jako odkazy ------------------------
   Odkazy to jsou odjakživa: vedou na mapu a rovnou ji přefiltrují.
   Jenže vypadaly jako vypsané informace — tmavý obdélník se sotva
   znatelným rámečkem a nic víc. Stížnost se snímkem zněla „nepůsobí
   klikatelně", a měla pravdu: co vypadá jako popiska, na to nikdo
   neklepne, takže ta práce pod tím je k ničemu.
   Značka „tenhle řádek někam vede" je na tomhle webu šipka „›" —
   má ji každá položka v menu. Zkouška se proto ptá na VYKRESLENÝ stav
   (obsah ::after), ne na řádek v CSS. */
{
  const v = await p.evaluate(() => [...document.querySelectorAll('.hh-fakta .hl-fact')]
    .filter((a) => !a.hidden)
    .map((a) => ({
      odkaz: a.tagName.toLowerCase() === 'a' && !!a.getAttribute('href'),
      sipka: (getComputedStyle(a, '::after').content || '').replace(/["']/g, ''),
      popisek: Math.round(parseFloat(getComputedStyle(a.querySelector('.hl-k')).fontSize)),
    })));
  pravda(`v úvodu jsou ${v.length} živé údaje (jinak zkouška nic neměří)`, v.length >= 2,
    'proužek je prázdný');
  pravda('všechny tři jsou odkazy', v.every((x) => x.odkaz),
    'některý údaj není odkaz — klepnutí by nikam nevedlo');
  pravda('a je na nich vidět, že někam vedou (šipka jako v menu)',
    v.every((x) => x.sipka.indexOf('\u203a') >= 0),
    `vykreslené šipky: ${JSON.stringify(v.map((x) => x.sipka))}`);
  /* Popisek je to jediné, co říká, CO to číslo vedle je. V 10,5 px
     s krytím 62 % ho oko přeskočí a zbydou tři velké údaje, které spolu
     nesouvisí — odtud druhá půlka téže stížnosti, „není jasné co je co". */
  pravda('a popisek je čitelný, ne ozdoba', v.every((x) => x.popisek >= 11),
    `velikosti popisků: ${JSON.stringify(v.map((x) => x.popisek))} px`);
}

pravda('na úvodní stránce nespadl žádný skript', chyby.length === 0, chyby[0]);

/* ---- „Přibylo dnes" musí ty novinky opravdu ukázat -----------------
   Kartička v úvodu slíbí „Přibylo dnes: 19 pozemků". Dokud se po
   klepnutí jen sjelo k mapě, ukázal se celý výpis 1 960 pozemků —
   slíbí se novinky, ukáže se všechno a kdo má najít těch devatenáct,
   neví kudy. Klepnutí proto přepne řazení na nejnovější. */
{
  const je = await p.evaluate(() => {
    const a = document.querySelector('[data-fakt="nove"]');
    return !!(a && !a.hidden);
  });
  if (je) {
    const pred = await p.evaluate(() => (document.getElementById('map-sort') || {}).value);
    await p.locator('[data-fakt="nove"]').click();
    await p.waitForTimeout(1600);
    /* Rolování je plynulé (smooth), takže chvíli trvá — a na širokém
       monitoru nemusí být vůbec potřeba. Nekouká se proto na scrollY,
       ale na to, co je ve výsledku vidět. */
    await p.waitForTimeout(1400);
    const po = await p.evaluate(() => {
      const l = document.querySelector('.opp-list') || document.querySelector('.map-app');
      const r = l ? l.getBoundingClientRect() : null;
      return { razeni: (document.getElementById('map-sort') || {}).value,
        vidnoVypis: !!r && r.top < innerHeight && r.bottom > 0, top: r ? Math.round(r.top) : null };
    });
    pravda('klepnutí na „Přibylo dnes" seřadí od nejnovějších', po.razeni === 'nove',
      `řazení zůstalo „${po.razeni}" (před klepnutím „${pred}") — ukáže se celý výpis a novinky se v něm ztratí`);
    pravda('a výpis je pak vidět', po.vidnoVypis, `výpis začíná na ${po.top} px, okno je vysoké ${900}`);
    // vrátit řazení, ať další kontroly vidí výchozí stav
    await p.evaluate(() => {
      const s = document.getElementById('map-sort');
      if (s) { s.value = 'demand'; s.dispatchEvent(new Event('change', { bubbles: true })); }
      scrollTo(0, 0);
    });
    await p.waitForTimeout(1200);
  }
}

/* ---- Když nic nesedí, nadpis nesmí nic slibovat --------------------
   „Doporučené příležitosti · 0 na mapě" a pod tím prázdno je protimluv:
   tváří se, že web něco doporučil, a přitom neukazuje nic. A hlavně —
   z prázdného seznamu musí vést cesta ven na jedno klepnutí, jinak je
   to slepá ulička a člověk odejde. */
{
  await p.evaluate(() => {
    const e = document.getElementById('map-search');
    e.value = 'qwertzuiop nic takoveho'; e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(1600);
  const stav = await p.evaluate(() => {
    const h = document.querySelector('#map-count, .map-count');
    const telo = (document.querySelector('.opp-list') || document.body).textContent || '';
    return { nadpis: h ? h.textContent.trim() : '',
      karet: document.querySelectorAll('.opp-item').length,
      vychod: [...document.querySelectorAll('.opp-list button, .opp-list a')]
        .map((b) => b.textContent.trim()).filter(Boolean).slice(0, 4),
      rikaProc: /Nejvíc omezuje|nesedí/i.test(telo) };
  });
  pravda('na nesmyslné hledání se neukáže nic', stav.karet === 0, `karet ${stav.karet}`);
  pravda('a nadpis nic neslibuje', !/Doporučené|Vybrané/.test(stav.nadpis),
    `nad prázdným seznamem stojí „${stav.nadpis}"`);
  pravda('a neuvádí se ani „0 na mapě"', !/\b0\b/.test(stav.nadpis), stav.nadpis);
  pravda('řekne se, co výsledek nejvíc omezuje', stav.rikaProc,
    'prázdný seznam bez vysvětlení je slepá ulička');
  pravda('a je odtud cesta ven na jedno klepnutí', stav.vychod.some((t) => /Zrušit/i.test(t)),
    `v prázdném seznamu jsou jen: ${stav.vychod.join(' | ') || '(nic)'}`);
  // uklidit po sobě, ať další kontroly vidí normální stav
  await p.evaluate(() => {
    const e = document.getElementById('map-search');
    e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(1200);
}

/* --- PANEL FILTRŮ: CO JE FILTR A CO NENÍ ---------------------------
 * Z recenze panelu: druh je nejdůležitější filtr, a byl schovaný
 * v rozbalovátku s jednou volbou; kraj je moc hrubé síto a zabíral
 * místo, které patří našeptávači na obec a okres; řazení a „Uložené"
 * mezi filtry vůbec nepatří, protože nic neubírají.
 */
{
  await p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); });
  await p.waitForTimeout(400);

  const v = await p.evaluate(() => {
    const vidno = (e) => { if (!e) return false; const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const stitky = [...document.querySelectorAll('#mc-druhy .mcv-btn')];
    return {
      druhStitku: stitky.length,
      druhSPoctem: stitky.filter((b) => b.querySelector('.mcv-n') && /\d/.test(b.querySelector('.mcv-n').textContent)).length,
      druhRozbalovatko: !!document.getElementById('map-druh'),
      krajRozbalovatko: !!document.getElementById('map-kraj'),
      razeniVPanelu: !!document.querySelector('.map-controls #map-sort'),
      razeniNadVysledky: vidno(document.querySelector('.ms-vysledky #map-sort')),
      ulozeneVPanelu: !!document.querySelector('.map-controls #map-fav'),
      ulozeneNadVysledky: vidno(document.querySelector('.ms-vysledky #map-fav')),
      prepinaceJakoStitky: [...document.querySelectorAll('.mc-toggles button')]
        .every((b) => b.classList.contains('mc-prep') && !b.classList.contains('map-select')),
    };
  });

  pravda('druh pozemku je řada štítků, ne rozbalovací seznam',
    v.druhStitku >= 4 && v.druhRozbalovatko === false, `štítků ${v.druhStitku}, select ${v.druhRozbalovatko}`);
  pravda('a u každého štítku stojí počet', v.druhSPoctem === v.druhStitku,
    `s počtem ${v.druhSPoctem} z ${v.druhStitku}`);
  pravda('kraj už panel nezabírá — od toho je nahoře našeptávač',
    v.krajRozbalovatko === false);
  pravda('řazení je nad výsledky, ne mezi filtry',
    v.razeniNadVysledky === true && v.razeniVPanelu === false, JSON.stringify(v));
  pravda('„Uložené" taky — není to vlastnost pozemku, ale můj výběr',
    v.ulozeneNadVysledky === true && v.ulozeneVPanelu === false, JSON.stringify(v));
  pravda('přepínače v panelu vypadají jako štítky, ne jako rozbalovátka',
    v.prepinaceJakoStitky === true, 'zbyla třída map-select — přepínač se tváří jako seznam');

  /* VÍC DRUHŮ NARÁZ. Kdo hledá stavební NEBO zahradu, musel dřív hledat
     dvakrát. Zaškrtnutí druhého druhu musí výběr ROZŠÍŘIT. */
  const pocet = () => p.evaluate(() => (document.getElementById('map-count') || {}).textContent || '');
  const cislo = (t) => { const m = /(\d[\d\s ]*)/.exec(t.replace(/ /g, ' ')); return m ? +m[1].replace(/\s/g, '') : -1; };
  await p.click('#mc-druhy .mcv-btn:nth-child(1)');
  await p.waitForTimeout(500);
  const jeden = cislo(await pocet());
  await p.click('#mc-druhy .mcv-btn:nth-child(2)');
  await p.waitForTimeout(500);
  const dva = cislo(await pocet());
  pravda('zaškrtnutí druhého druhu výběr rozšíří, nezúží', dva > jeden,
    `jeden druh ${jeden}, dva druhy ${dva}`);
  const obaOn = await p.evaluate(() =>
    [...document.querySelectorAll('#mc-druhy .mcv-btn')].filter((b) => b.classList.contains('on')).length);
  pravda('a oba štítky zůstanou zapnuté', obaOn === 2, `zapnutých ${obaOn}`);
  /* Počty u štítků se musí řídit ostatními filtry — jinak by číslo
     lhalo, jakmile se zapne cokoli dalšího. */
  const pocPred = await p.evaluate(() =>
    [...document.querySelectorAll('#mc-druhy .mcv-btn .mcv-n')].map((n) => n.textContent.trim()).join('|'));
  await p.click('#map-urgent');
  await p.waitForTimeout(600);
  const pocPo = await p.evaluate(() =>
    [...document.querySelectorAll('#mc-druhy .mcv-btn .mcv-n')].map((n) => n.textContent.trim()).join('|'));
  pravda('počty u štítků se mění podle ostatních filtrů', pocPred !== pocPo,
    `před „${pocPred}", po „${pocPo}" — číslo, které se nemění, je jen ozdoba`);
  await p.click('#map-urgent');
  await p.waitForTimeout(300);

  /* MÍSTO NA TELEFONU. Změřeno na 390 px: k ovládacím prvkům se
     dostalo 284 px a zbylých 106 px (27 %) spolykaly dva soustředné
     rámečky a tři odsazení nad sebou. */
  const sirka = await p.evaluate(() => {
    const mc = document.querySelector('.map-controls');
    const c = getComputedStyle(mc);
    return Math.round(mc.getBoundingClientRect().width - (parseFloat(c.paddingLeft) || 0) - (parseFloat(c.paddingRight) || 0));
  });
  pravda('na úzké obrazovce zbude na ovládání dost místa', sirka >= 300,
    `k prvkům se dostalo ${sirka} px z 390 — rámečky a odsazení berou ${390 - sirka} px`);

  /* CENA ZA METR PATŘÍ K CENĚ, ne až za sítě. */
  const poradi = await p.evaluate(() => [...document.querySelector('.map-controls').children]
    .map((x) => (x.className || '').toString()));
  const iCena = poradi.findIndex((c) => /mc-shrnuti|mc-rozsah/.test(c));
  const iPerM22 = await p.evaluate(() => [...document.querySelector('.map-controls').children]
    .findIndex((x) => x.querySelector && x.querySelector('#map-perm2')));
  const iVybaveni = poradi.findIndex((c) => /mc-vybaveni/.test(c));
  pravda('cena za metr stojí hned u ceny, ne až za sítěmi',
    iCena >= 0 && iPerM22 === iCena + 1, `pořadí: ${poradi.map((c) => c.split(' ')[1] || c).join(' → ')}`);
  pravda('a sítě jsou až za ní', iVybaveni > iPerM22, `sítě na ${iVybaveni}, cena/m² na ${iPerM22}`);

  /* TLAČÍTKO S POČTEM SE PŘILEPÍ DOLE. Panel je delší než obrazovka;
     bez toho se člověk o počtu dozvěděl, až když dorolal na konec. */
  const lepive = await p.evaluate(() => getComputedStyle(document.querySelector('.mcf-akce')).position);
  pravda('tlačítko s počtem jede s panelem dolů', lepive === 'sticky', `position: ${lepive}`);

  /* DLOUHÉ VYSVĚTLENÍ U SÍTÍ JE POD „i". Je důležité (mlčení inzerátu
     neznamená, že síť chybí), ale zabíralo víc místa než štítky. */
  const info = await p.evaluate(() => {
    const b2 = document.getElementById('mcv-info'), t = document.getElementById('mcv-pozn');
    return { je: !!b2, skryto: t ? !!t.hidden : null,
      vidno: b2 ? b2.getBoundingClientRect().width > 0 : false };
  });
  if (info.je && info.vidno) {
    pravda('vysvětlení u sítí je zabalené pod „i"', info.skryto === true, 'odstavec visí rozbalený');
    await p.click('#mcv-info');
    await p.waitForTimeout(250);
    const po = await p.evaluate(() => ({ skryto: document.getElementById('mcv-pozn').hidden,
      stav: document.getElementById('mcv-info').getAttribute('aria-expanded') }));
    pravda('a klepnutí ho odkryje', po.skryto === false && po.stav === 'true', JSON.stringify(po));
    await p.click('#mcv-info');
    await p.waitForTimeout(150);
  }
}

/* --- ODKAZ Z KRAJSKÉ STRÁNKY --------------------------------------
 * 91 stránek vede na index.html?kraj=… Rozbalovátko Kraj je z panelu
 * pryč, takže tenhle odkaz je jediný způsob, jak se kraj zapne — a
 * musí být vidět, že je zapnutý. Vysvětlení k tomu bylo v hlavičce
 * UVNITŘ MAPY, jenže na telefonu je výchozí pohled seznam a hlavička
 * měla nulovou velikost. Odznak stojí nad oběma pohledy.
 */
{
  await p.goto(`${BASE}/index.html?kraj=${encodeURIComponent('Jihomoravský')}#mapa`,
    { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  const v = await p.evaluate(() => {
    const c = document.querySelector('.ms-chipy');
    const cislo = (t) => { const m = /(\d[\d\s\u00a0]*)/.exec(String(t).replace(/\u00a0/g, ' ')); return m ? +m[1].replace(/\s/g, '') : -1; };
    return { vidno: !!(c && !c.hidden), text: (c ? c.textContent : '').replace(/\s+/g, ' ').trim(),
      pocet: cislo((document.getElementById('map-count') || {}).textContent) };
  });
  pravda('odkaz z krajské stránky kraj opravdu zafiltruje', v.pocet > 0 && v.pocet < 1500,
    `v seznamu ${v.pocet} pozemků`);
  pravda('a je vidět, který kraj to je — i v seznamu, ne jen na mapě',
    v.vidno && /Jihomoravsk/.test(v.text), `odznaky: „${v.text.slice(0, 80)}"`);
  const x = await p.$('.ms-chipy [data-omez]');
  if (x) {
    await x.click();
    await p.waitForTimeout(900);
    const po = await p.evaluate(() => {
      const m = /(\d[\d\s\u00a0]*)/.exec(String((document.getElementById('map-count') || {}).textContent).replace(/\u00a0/g, ' '));
      return m ? +m[1].replace(/\s/g, '') : -1;
    });
    pravda('a dá se zrušit jedním klepnutím', po > v.pocet, `${v.pocet} → ${po}`);
  } else {
    pravda('a dá se zrušit jedním klepnutím', false, 'odznak kraje se vůbec nevykreslil');
  }
}

/* --- SEZNAM SE DÁ DOČÍST -------------------------------------------
 * Výpis ukazoval osm nabídek z dvou tisíc a pod nimi jen odkaz na mapu.
 * Na telefonu je výchozí pohled seznam, takže kdo si chtěl nabídky
 * pročítat, dostal osm — a web působil prázdně, i když má 2 019 nabídek.
 * Zkouší se celá cesta: že tlačítko je, že po klepnutí karet přibude,
 * že se tím NEZMĚNIL filtr (počet nalezených zůstává) a že to má strop.
 */
{
  /* Mapa si uložené filtry pamatuje mezi návštěvami (pk_filtr_v1), takže
     by sem došly z předchozích částí téhle zkoušky a výpis by byl zúžený.
     Tahle část potřebuje stav, jaký vidí člověk poprvé. */
  await p.goto(`${BASE}/index.html#mapa`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { try { localStorage.removeItem('pk_filtr_v1'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  const stav = () => p.evaluate(() => {
    const m = /(\d[\d\s\u00a0]*)/.exec(String((document.getElementById('map-count') || {}).textContent)
      .replace(/\u00a0/g, ' '));
    return { karet: document.querySelectorAll('#opp-list .opp-item').length,
      tlacitko: !!document.getElementById('opp-dalsi-btn'),
      pocet: m ? +m[1].replace(/\s/g, '') : -1 };
  });
  const pred = await stav();
  /* ČÍSLA SE PÍŠOU JEDNÍM ZPŮSOBEM. Na jedné obrazovce stálo „1 996
     pozemků" v úvodu, „1996 na mapě" v hlavičce výpisu a „Seznam (1996)"
     v přepínači — tři zápisy téhož čísla. Čte se to z obrazovky, ne ze
     zdroje: skládají to tři různá místa a shodnout se musí výsledek.
     Porovnává se ZÁPIS, ne hodnota: úvod ukazuje všechny nabídky, kdežto
     hlavička a přepínač jen to, co prošlo filtry. */
  {
    const c = await p.evaluate(() => {
      const t = (id) => ((document.getElementById(id) || {}).textContent || '');
      const cislo = (s) => { const m = /(\d[\d\s\u00a0]*\d|\d)/.exec(s); return m ? m[1] : ''; };
      return { hero: cislo(t('hero-n-count')), hlavicka: cislo(t('map-count')), prepinac: cislo(t('mvt-count')) };
    });
    const bezMezer = (x) => x.replace(/[\s\u00a0]/g, '');
    const maOddelovac = (x) => bezMezer(x).length < 4 || /[\s\u00a0]/.test(x);
    pravda('všechna tři čísla jsou tisícová (jinak by se zápis neměl na čem poznat)',
      bezMezer(c.hero).length >= 4 && bezMezer(c.hlavicka).length >= 4
      && bezMezer(c.prepinac).length >= 4,
      `úvod „${c.hero}", hlavička „${c.hlavicka}", přepínač „${c.prepinac}"`);
    pravda('a všechna tři čísla na obrazovce mají tisícový oddělovač',
      [c.hero, c.hlavicka, c.prepinac].every(maOddelovac),
      `úvod „${c.hero}", hlavička „${c.hlavicka}", přepínač „${c.prepinac}"`);
    pravda('hlavička výpisu a přepínač Seznam/Mapa ukazují totéž',
      bezMezer(c.hlavicka) === bezMezer(c.prepinac),
      `hlavička „${c.hlavicka}", přepínač „${c.prepinac}"`);
  }
  pravda('výpis začíná osmi kartami', pred.karet === 8, `karet ${pred.karet}`);
  pravda('a nabízí se dočtení dalších', pred.tlacitko && pred.pocet > 8,
    `tlačítko ${pred.tlacitko}, nalezeno ${pred.pocet}`);
  if (pred.tlacitko) {
    await p.click('#opp-dalsi-btn');
    await p.waitForTimeout(700);
    const po = await stav();
    pravda('po klepnutí je karet víc', po.karet > pred.karet, `${pred.karet} → ${po.karet}`);
    pravda('a počet nalezených se nezměnil (dočítání není filtr)',
      po.pocet === pred.pocet, `${pred.pocet} → ${po.pocet}`);
    /* Strop: klikat, dokud tlačítko je. Víc než osm klepnutí být nemá. */
    let klepnuti = 0;
    while (klepnuti < 12 && (await p.$('#opp-dalsi-btn'))) {
      await p.click('#opp-dalsi-btn');
      await p.waitForTimeout(350);
      klepnuti++;
    }
    const nakonec = await stav();
    pravda('dočítání má strop, aby se výpis nezadusil',
      !nakonec.tlacitko && nakonec.karet <= 96 && nakonec.karet >= 90,
      `karet ${nakonec.karet}, tlačítko ${nakonec.tlacitko}, klepnutí ${klepnuti}`);
    pravda('a pod stropem zůstane odkaz na mapu, kde je zbytek',
      !!(await p.$('.opp-more')), 'řádka „na mapě" zmizela');
  }
  /* A NOVÉ HLEDÁNÍ ROZBALENÍ ZRUŠÍ — jinak by se po napsání jiného dotazu
     vysypalo devadesát šest karet něčeho jiného, než si člověk napsal.
     Čte se to ze zdroje, ne klepáním: políčko hledání je v tomhle
     pohledu schované pod ovládacím panelem a klepat se do něj dá jen
     přes rozbalení, které s dočítáním nemá nic společného (zkouší ho
     scripts/test-naseptavac.mjs). */
  {
    const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
    const telo = /function nastavHledani\(v\)\s*\{[\s\S]*?\n  \}/.exec(main);
    pravda('nové hledání výpis zase sbalí', !!telo && /listNavic = 0;/.test(telo[0]),
      'v nastavHledani() se dočítání nenuluje');
  }
}

/* --- ODKAZ Z OKRESNÍ STRÁNKY NA OBEC -------------------------------
 * Stránka okresu u každé obce slibuje číslo („Lovečkovice 11"). Odkaz
 * vede na index.html?obec=&okres= a mapa z něj musí ukázat PŘESNĚ tolik.
 * Přes hledání textem (?q=) to nešlo: mapa jde po začátcích slov, takže
 * „Brno" ukázalo i Brno-venkov a obce, které tím slovem začínají —
 * odkaz sliboval 17 a mapa dala 39. Tady se neporovnává s vlastním
 * výpočtem, ale s TÍM ČÍSLEM, co na stránce opravdu stojí.
 */
{
  const fs2 = await import('node:fs');
  const souboryOkresu = fs2.readdirSync(new URL('..', import.meta.url).pathname)
    .filter((f) => /^pozemky-okres-[a-z0-9-]+\.html$/.test(f));
  let nej = null;
  for (const f of souboryOkresu) {
    const html = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const re = /<a href="index\.html\?obec=([^&"]+)&amp;okres=([^"#]+)#mapa">([^<]*)<span>(\d+)<\/span><\/a>/g;
    let m;
    while ((m = re.exec(html))) {
      const n = Number(m[4]);
      if (!nej || n > nej.n) nej = { obec: decodeURIComponent(m[1]), okres: decodeURIComponent(m[2]),
        jmeno: m[3].trim(), n: n };
    }
  }
  if (!nej) {
    pravda('na stránkách okresů je aspoň jeden odkaz na obec', false,
      'žádný odkaz ?obec= se nenašel — buď se nevygeneroval, nebo se změnil tvar');
  } else {
    await p.goto(`${BASE}/index.html?obec=${encodeURIComponent(nej.obec)}`
      + `&okres=${encodeURIComponent(nej.okres)}#mapa`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2400);
    const v = await p.evaluate(() => {
      const c = document.querySelector('.ms-chipy');
      const m = /(\d[\d\s\u00a0]*)/.exec(String((document.getElementById('map-count') || {}).textContent)
        .replace(/\u00a0/g, ' '));
      return { pocet: m ? +m[1].replace(/\s/g, '') : -1,
        text: (c ? c.textContent : '').replace(/\s+/g, ' ').trim() };
    });
    pravda(`odkaz na obec ${nej.jmeno} ukáže přesně tolik, kolik stránka okresu slíbila`,
      v.pocet === nej.n, `slíbeno ${nej.n}, v seznamu ${v.pocet}`);
    pravda('a je vidět, která obec je vybraná',
      v.text.indexOf(nej.jmeno) >= 0, `odznaky: „${v.text.slice(0, 90)}"`);
  }
}

/* --- TIPY MUSÍ ŘÍCT, KDE SE SROVNÁVALY ------------------------------
 * „Levnější než 98 % podobných" je tvrzení a dává smysl jen s místem.
 * Percentil se počítá nejdřív v okrese, a když tam není dost nabídek,
 * v kraji — naměřeno na ostrých datech: ze 1 213 verdiktů jich 566
 * (47 %) vzniklo v KRAJI. Karta přitom pod odznakem psala „okres
 * Jablonec nad Nisou", takže to vypadalo jako srovnání v okrese.
 * Totéž se už jednou spravilo u odznaku na mapě; tipy u toho zůstaly.
 *
 * Kontrola si očekávaný text POSTAVÍ SAMA z toho, co vrátil model
 * (window.PK_TIPY: úroveň a místo), a porovná ho s tím, co je v kartě.
 * Kdyby se do odznaku psal okres nabídky, u těch 47 % se rozejdou.
 */
{
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3600);
  const v = await p.evaluate(() => {
    const tipy = window.PK_TIPY || null;
    const karty = [...document.querySelectorAll('.deal-card')].map((c) => ({
      odznak: (c.querySelector('.deal-badge') || {}).textContent.trim(),
      podradek: (c.querySelector('.deal-sub') || {}).textContent.trim(),
    }));
    const kdeText = (window.PK_CENY && window.PK_CENY.kdeText) || null;
    const ocekavane = (tipy && kdeText) ? tipy.map((t) => kdeText(t.uroven, t.kde)) : null;
    return { tipy, karty, ocekavane };
  });
  /* Dvě pojistky, aby kontrola neměřila prázdno. */
  pravda('tipy na dobrou koupi se vykreslily', v.karty.length >= 3,
    `karet ${v.karty.length}`);
  pravda('a model o nich řekl, kde se srovnávaly', !!(v.ocekavane && v.ocekavane.length === v.karty.length),
    `window.PK_TIPY: ${JSON.stringify(v.tipy)}`);
  if (v.karty.length >= 3 && v.ocekavane && v.ocekavane.length === v.karty.length) {
    const spatne = [];
    v.karty.forEach((k, i) => {
      if (k.odznak.indexOf(v.ocekavane[i]) === -1) {
        spatne.push(`„${k.odznak}" místo „… ${v.ocekavane[i]}" (${v.tipy[i].uroven} ${v.tipy[i].kde})`);
      }
    });
    pravda('každý tip říká, KDE se srovnával — a sedí to s modelem', spatne.length === 0,
      spatne.join('; '));
    /* A ať to není jen slovo navíc: když se počítalo z kraje, nesmí
       v odznaku stát okres. Přesně tahle záměna tam byla. */
    const lzou = v.karty.filter((k, i) => v.tipy[i].uroven === 'kraj' && /\bv okrese\b/.test(k.odznak));
    pravda('a u krajského srovnání se netváří jako okresní', lzou.length === 0,
      lzou.map((k) => `„${k.odznak}"`).join('; '));
    const kolikKraj = v.tipy.filter((t) => t.uroven === 'kraj').length;
    zpravy.push(`      (z ${v.tipy.length} dnešních tipů se ${kolikKraj} počítalo z kraje)`);
  }
}

/* --- A TOTÉŽ NA KARTÁCH VE VÝPISU ----------------------------------
 * Odznak „−51 % proti okolí" (a „levnější než 80 %") stojí na témže
 * srovnání jako tipy, jen se na mobil musí vejít na řádek — proto na
 * něm zůstalo „okolí". KDE to okolí je, musí jít zjistit: je to
 * v popisku (title) a v data-kde. Naměřeno: ze čtyř karet s odznakem
 * měly tři srovnání z KRAJE, a karta přitom psala „okres Znojmo".
 */
{
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3600);
  const v = await p.evaluate(() => {
    const karty = [...document.querySelectorAll('.opp-item')].map((li) => {
      const ch = li.querySelector('.opp-deal');
      return ch ? { kde: ch.getAttribute('data-kde') || '', title: ch.getAttribute('title') || '',
        text: ch.textContent.trim() } : null;
    });
    /* Větu si zkouška složí SAMA z toho, co vrátil model. Kdyby brala
       hotovou větu ze stránky, porovnávala by ji se sebou. */
    const kdeText = (window.PK_CENY && window.PK_CENY.kdeText) || null;
    const model = (window.PK_KARTY || []).map((m) => (m && m.srovnani && kdeText)
      ? kdeText(m.srovnani.uroven, m.srovnani.kde) : '');
    return { karty, model: window.PK_KARTY ? model : null };
  });
  const sOdznakem = v.karty.filter(Boolean);
  /* Dvě pojistky: výpis se vykreslil a aspoň jedna karta odznak má —
     jinak by kontrola pod tím prošla naprázdno. */
  pravda('výpis se vykreslil a model o kartách mluví',
    !!(v.model && v.model.length === v.karty.length && v.karty.length > 0),
    `karet ${v.karty.length}, model ${v.model && v.model.length}`);
  pravda('a aspoň jedna karta má odznak o ceně', sOdznakem.length > 0,
    'žádný .opp-deal — nebylo by co měřit');
  if (v.model && v.model.length === v.karty.length && sOdznakem.length) {
    const spatne = [];
    v.karty.forEach((k, i) => {
      if (!k) return;
      const ocekavane = v.model[i] || '';
      if (!ocekavane) { spatne.push(`„${k.text}" — model neřekl místo`); return; }
      if (k.kde !== ocekavane) spatne.push(`data-kde „${k.kde}" ≠ model „${ocekavane}"`);
      else if (k.title.indexOf(ocekavane) === -1) spatne.push(`popisek „${k.title}" neříká „${ocekavane}"`);
    });
    pravda('každý odznak o ceně říká, kde se srovnávalo — a sedí to s modelem',
      spatne.length === 0, spatne.join('; '));
    const kraj = v.model.filter((m) => /kraji|Vysočině/.test(m)).length;
    zpravy.push(`      (z ${sOdznakem.length} odznaků se ${kraj} počítalo z kraje, ne z okresu)`);
  }
}

/* --- ZMĚNA CENY SE DOSTANE AŽ NA KARTU ------------------------------
 * Logiku hlídá scripts/test-zlevneni.mjs; tady jde o to poslední, co se
 * dá rozbít samostatně — že je modul na stránce vůbec načtený a že se
 * odznak opravdu vykreslí. Data se podstrčí, protože `cena_drive` do
 * ostrých dat doplní až robot při druhém běhu.
 */
{
  const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
  DATA.opportunities.forEach((o, i) => {
    if (i % 3 === 0) { o.cena_drive = Math.round(o.price * 1.4); o.cena_zmena = '2026-09-20'; }
    else if (i % 3 === 1) { o.cena_drive = Math.round(o.price * 0.8); o.cena_zmena = '2026-09-25'; }
    else { o.cena_drive = Math.round(o.price * 1.01); }   // pod mezí → musí mlčet
  });
  const ctxZ = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  await ctxZ.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(DATA) }));
  const pz = await ctxZ.newPage();
  /* NEJDŘÍV SE MUSÍ DOLOŽIT, ŽE STRÁNKA BĚŽÍ NA PODSTRČENÝCH DATECH.
   *
   * Když se data/opportunities.json nestihne načíst, js/main.js sáhne po
   * záložní hrstce nabídek, kterou má v sobě — a ta žádnou historii ceny
   * nemá. Test pak hlásil „na kartách chybí Zlevněno", což je pravda,
   * ale o funkci to neříká nic: měřil záložní data. Přesně tak to v sadě
   * pod zátěží jednou spadlo (8 karet = záložní data), zatímco samotný
   * test prošel.
   *
   * Proto se čeká na ODPOVĚĎ s daty a pak na to, až karet bude VÍC, než
   * kolik má záloha. Teprve potom má smysl se ptát na odznak — a když
   * se to nepovede, řekne se rovnou tohle, ne něco jiného. */
  const odpoved = pz.waitForResponse(
    (r) => /data\/opportunities\.json/.test(r.url()), { timeout: 30000 }).catch(() => null);
  await pz.goto(`${BASE}/index.html`, { waitUntil: 'load' }).catch(() => {});
  const dataDojela = !!(await odpoved);
  /* Počet karet ve výpisu je stránkovaný (je jich míň než záloha), takže
     se nedá použít. Hlavička ale píše, kolik nabídek je na mapě CELKEM —
     a to záloha od podstrčených dat odliší spolehlivě. */
  const ZALOHA = 14;   // kolik nabídek má záložní seznam v js/main.js
  const naMape = await pz.waitForFunction((mez) => {
    const e = document.querySelector('#map-count');
    if (!e) return 0;
    const m = /(\d[\d\s\u00a0]*)\s*na mapě/.exec(e.textContent || '');
    const n = m ? Number(m[1].replace(/[\s\u00a0]/g, '')) : 0;
    return n > mez ? n : false;
  }, ZALOHA, { timeout: 25000 }).then((h) => h.jsonValue()).catch(() => 0);
  pravda('úvodní stránka běží na podstrčených datech, ne na záložních',
    dataDojela && naMape > ZALOHA,
    `odpověď s daty ${dataDojela ? 'přišla' : 'NEPŘIŠLA'}, na mapě ${naMape} nabídek (záloha jich má ${ZALOHA})`);
  const v = await pz.evaluate(() => ({
    modul: typeof window.PKZlevneni,
    karet: document.querySelectorAll('.opp-item').length,
    dolu: [...document.querySelectorAll('.opp-zlevneno')].map((e) => ({ t: e.textContent.trim(), p: e.title })),
    nahoru: [...document.querySelectorAll('.opp-zdrazeno')].map((e) => e.textContent.trim()),
    drobne: [...document.querySelectorAll('.opp-item')].filter((li) => {
      const t = li.textContent || '';
      return /o 1 %/.test(t);
    }).length,
  })).catch(() => null);
  pravda('modul pro změnu ceny je na úvodní stránce načtený',
    !!v && v.modul === 'object', v ? `typeof PKZlevneni = ${v.modul}` : 'stránka nedojela');
  if (v) {
    pravda('a na kartách se objeví „Zlevněno o X %"', v.dolu.length > 0, `karet ${v.karet}`);
    pravda('i „Zdraženo o X %" — pohyb nahoru se nezamlčuje', v.nahoru.length > 0,
      JSON.stringify(v.nahoru));
    pravda('v popisku odznaku stojí původní cena i datum',
      v.dolu.every((x) => /Kč/.test(x.p) && /\d+\. \d+\. \d{4}/.test(x.p)),
      JSON.stringify(v.dolu.slice(0, 2)));
    /* Pojistka proti bezzubosti: podstrčená drobná změna (1 %) se na
       kartě objevit NESMÍ, jinak by odznak svítil u všeho. */
    pravda('a změna o jediné procento se neukazuje', v.drobne === 0, `karet s „o 1 %": ${v.drobne}`);
  }
  await ctxZ.close();
}

await prohlizec.close();

console.log('\nÚvodní obrazovka — živá čísla a věrohodnost cen');
console.log(`  · v datech je ${podezrela.length} záznamů s nevěrohodnou cenou (hlídáme, ať se nedostanou nahoru)`);
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Úvodní obrazovka: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
