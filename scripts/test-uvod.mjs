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

  // Nejvýhodnější nabídka se hlásí ČÁSTKOU, ne pořadím v žebříčku.
  // „Levnější než 92 % podobných" je pořadí a člověk si pod tím nic
  // nepředstaví; „o 92 % pod obvyklou" je údaj.
  pravda('nejvýhodnější se hlásí jako rozdíl proti obvyklé ceně',
    !!(proužek.deal && /^o \d+ % pod obvyklou · .+/.test(proužek.deal.hodnota)),
    `vyšlo „${proužek.deal && proužek.deal.hodnota}"`);

  // Jádro testu: nabídka s nevěrohodnou cenou se nesmí vydávat za koupi roku.
  const deal = proužek.deal;
  const misto = deal ? deal.hodnota.split('·').pop().trim() : '';
  pravda('jako nejvýhodnější se nenabízí pozemek s nevěrohodnou cenou',
    !!(misto && !podezrelaMista.has(misto)),
    `stránka nabízí „${misto}", což je mezi ${podezrela.length} podezřelými záznamy ` +
    `(cena za m² pod padesátinou mediánu skupiny)`);
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
