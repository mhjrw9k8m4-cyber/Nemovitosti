// Test ovládání mapy v opravdovém prohlížeči.
//
// Spuštění: node scripts/test-mapa.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist, když není ven z počítače přístup
//    na unpkg.com)
//
// Proč zrovna tohle: mapa je jediná část webu, kterou nejde vyzkoušet
// čtením kódu. Klik do plátna (canvas) se nevyhodnocuje přes DOM, ale ručně
// dopočítanou vzdáleností k nejbližší tečce — a jestli ta matematika sedí,
// pozná jen skutečné klepnutí do skutečné mapy.
//
// Hlavní věc, kterou test hlídá: KLEPNUTÍ, KTERÉ SE NETREFÍ. Prstem se do
// tečky široké pár pixelů netrefíte a dřív se v tu chvíli nestalo vůbec nic
// — člověk klepne, nic, a neví, jestli je web rozbitý nebo se minul.
// Teď se mapa v takovém případě přiblíží k nejbližšímu pozemku. Test to
// ověřuje na všech třech případech: trefa → detail, těsně vedle → přiblížení,
// daleko od všeho → mapa se nehne (přiblížit se do prázdna by bylo horší).
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// 1×1 průhledný PNG místo dlaždic: test nemá záviset na cizím serveru
// (a v sandboxu se ven stejně nedostane). Mapa funguje i bez podkladu.
const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');

const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 900 } });
// Test nesmí sahat ven z počítače: cizí obrázky (dlaždice mapy) nahradíme
// prázdnými, ostatní cizí požadavky zahodíme. Pozor na pořadí — Playwright
// bere poslední zaregistrovanou shodu, takže tohle musí být PRVNÍ.
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
  return LEAFLET ? r.abort() : r.continue();   // bez místní kopie musí Leaflet ven (CI)
});
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
  // Podpis (integrity) místní kopii nesedí — prohlížeč by soubor zahodil.
  await ctx.route(`${BASE}/index.html`, async (r) => {
    const o = await r.fetch();
    const t = (await o.text()).replace(/\s+integrity="[^"]*"/g, '');
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: t });
  });
}

const p = await ctx.newPage();
const chybyStranky = [];
p.on('pageerror', (e) => chybyStranky.push(String(e && e.message || e)));
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });

// Mapa je připravená, až má vykreslené tečky.
await p.waitForFunction(() => {
  if (!window.PK_MAPA) return false;
  let n = 0; window.PK_MAPA.eachLayer((l) => { if (l._d) n++; });
  return n > 5;
}, null, { timeout: 20000 });
// Stránka ještě doskakuje (obrázky, animace odkrývání), takže jedno odrolování
// nestačí — po dorovnání výšky by mapa zase utekla. Zkoušíme to, dokud mapa
// opravdu nesedí pod hlavičkou.
// Na mobilu se úvodní stránka otevře na SEZNAMU a mapa je za přepínačem.
// Test tedy nejdřív přepne na mapu, jinak by měřil skrytý prvek.
async function naMapu() {
  const t = await p.$('.mv-toggle .mvt-btn[data-mv="mapa"]');
  if (!t) return false;
  if (!(await t.isVisible())) return false;      // na širokém okně je vidět obojí
  await t.click();
  await p.waitForTimeout(700);
  return true;
}
pravda('přepínač otevře mapu', await naMapu());

let videtPx = 0;
async function priprav() {
  for (let i = 0; i < 6; i++) {
    await p.evaluate(() => {
      const h = document.querySelector('.map-holder');
      window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 120);
    });
    // Stránka roluje plynule (scroll-behavior: smooth), takže se musí měřit
    // AŽ po dojetí — jinak se pořád čte poloha před odrolováním.
    await p.waitForTimeout(500);
    videtPx = await p.evaluate(() => {
      const r = document.querySelector('.map-holder').getBoundingClientRect();
      const hl = document.querySelector('header').getBoundingClientRect().bottom;
      return Math.min(r.bottom, window.innerHeight) - Math.max(r.top, hl);
    });
    if (videtPx >= 320) return videtPx;
  }
  return null;
}
pravda('mapa je pod hlavičkou opravdu vidět', !!(await priprav()), 'vidět jen ' + Math.round(videtPx) + ' px');

// Pomůcky uvnitř stránky: souřadnice teček v okně, kraj pod daným bodem,
// a tolerance klepnutí spočítaná ze stejných čísel jako v main.js.
await p.evaluate(() => {
  window.__t = {
    stav() {
      const m = window.PK_MAPA, r = m.getContainer().getBoundingClientRect();
      const hl = document.querySelector('header').getBoundingClientRect().bottom;
      const tecky = [];
      m.eachLayer((l) => {
        if (!l._d) return;
        const c = m.latLngToContainerPoint(l.getLatLng());
        tecky.push({ x: c.x + r.left, y: c.y + r.top, r: l.options.radius, kraj: l._d._gkraj });
      });
      const hlava = document.getElementById('kraj-head');
      return { zoom: m.getZoom(), tecky, ramec: { l: r.left, t: r.top, p: r.right, d: r.bottom }, hlavicka: hl,
        kraj: (hlava && !hlava.hidden) ? (hlava.textContent || '').trim() : '' };
    },
    krajPod(x, y) {
      const el = document.elementFromPoint(x, y);
      let jm = null;
      window.PK_MAPA.eachLayer((l) => { if (l._path && l._path === el && l.feature) jm = l.feature.properties.kraj; });
      return jm;
    }
  };
});

const stav = () => p.evaluate(() => window.__t.stav());
const krajPod = (x, y) => p.evaluate(([x, y]) => window.__t.krajPod(x, y), [x, y]);

/* ---------- 1. zamčená mapa: první klepnutí vybere kraj ---------- */
let s = await stav();
pravda('mapa se načetla i s tečkami', s.tecky.length > 5, `teček: ${s.tecky.length}`);
je('na přehledu není vybraný žádný kraj', s.kraj, '');

// Zkoušíme to v NEJŘIDŠÍM kraji (mimo Prahu, ta je na celostátním pohledu
// jen tečka). V hustém kraji leží tečky tak blízko sebe, že je klepnutí vždy
// v toleranci a na zálohu by nedošlo — test by pak nic neověřil.
const vyber = await p.evaluate(() => {
  const m = window.PK_MAPA, r = m.getContainer().getBoundingClientRect();
  const hl = document.querySelector('header').getBoundingClientRect().bottom;
  const poc = {};
  m.eachLayer((l) => { if (l._d && l._d._gkraj) poc[l._d._gkraj] = (poc[l._d._gkraj] || 0) + 1; });
  let nej = null;
  m.eachLayer((l) => {
    if (!l._path || !l.feature) return;
    const k = l.feature.properties.kraj, n = poc[k] || 0;
    if (n > 3 && k !== 'Praha' && (!nej || n < nej.n)) nej = { k, n, l };
  });
  if (!nej) return { chyba: 'žádný kraj s dostatkem teček', poc };
  const bb = nej.l._path.getBoundingClientRect();
  for (let i = 1; i < 9; i++) for (let j = 1; j < 9; j++) {
    const x = Math.round(bb.left + bb.width * i / 9), y = Math.round(bb.top + bb.height * j / 9);
    if (y < Math.max(r.top, hl) + 24 || y > r.bottom - 24 || x < r.left + 14 || x > r.right - 14) continue;
    if (document.elementFromPoint(x, y) === nej.l._path) return { x, y, kraj: nej.k, n: nej.n };
  }
  const q = document.elementFromPoint(Math.round(bb.left + bb.width / 2), Math.round(bb.top + bb.height / 2));
  return { chyba: 'na kraji ' + nej.k + ' nešlo trefit jeho plochu', bb: { l: bb.left, t: bb.top, w: bb.width, h: bb.height },
    hl, ramec: { l: r.left, t: r.top, p: r.right, d: r.bottom }, vrch: q ? q.tagName + '.' + (q.getAttribute('class') || '') : 'nic' };
});
pravda('našel se kraj, ve kterém se dá zkoušet klepání', !!(vyber && vyber.x != null), JSON.stringify(vyber));
if (!vyber || vyber.x == null) { console.log(zpravy.join('\n')); await prohlizec.close(); process.exit(1); }

const zoom0 = s.zoom;
await p.mouse.click(vyber.x, vyber.y);
await p.waitForTimeout(1000);
await priprav();   // výběr kraje stránkou pohne, mapa musí zůstat celá vidět
s = await stav();
je('první klepnutí neotevřelo inzerát, jen vybralo kraj', new URL(p.url()).pathname, '/index.html');
pravda('po prvním klepnutí je vybraný kraj', s.kraj.indexOf(vyber.kraj) === 0, `hlavička: „${s.kraj}"`);
pravda('mapa se ke kraji přiblížila', s.zoom > zoom0, `${zoom0} → ${s.zoom}`);

/* ---------- 2. klepnutí vedle tečky přiblíží; do prázdna nehne ---------- */
// Bod musí ležet UVNITŘ vybraného kraje — jinak by klepnutí jen přepnulo kraj
// a přiblížení by přišlo odtamtud, ne ze zálohy, kterou zkoušíme.
async function najdiBod(dalsi) {
  return p.evaluate((dalsi) => {
    const m = window.PK_MAPA, r = m.getContainer().getBoundingClientRect();
    const hl = document.querySelector('header').getBoundingClientRect().bottom;
    const hlava = document.getElementById('kraj-head');
    const jmeno = ((hlava && hlava.textContent) || '').trim();
    let R = 0; const t = [];
    m.eachLayer((l) => {
      if (!l._d) return;
      R = Math.max(R, l.options.radius);
      const c = m.latLngToContainerPoint(l.getLatLng());
      t.push({ x: c.x + r.left, y: c.y + r.top, kraj: l._d._gkraj });
    });
    const sel = t.map((q) => q.kraj).find((k) => k && jmeno.indexOf(k) === 0);
    const moje = t.filter((q) => q.kraj === sel);
    // Stejná čísla jako v main.js: tolerance trefy a okolí, ve kterém má smysl přiblížit.
    const tol = Math.max(30, R + 26), okoli = Math.max(90, tol * 2.4);
    const smery = [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    for (const q of moje) for (const sm of smery) {
      const d = dalsi ? okoli + 70 : (tol + okoli) / 2;
      const x = Math.round(q.x + sm[0] * d), y = Math.round(q.y + sm[1] * d);
      if (x < r.left + 14 || x > r.right - 14) continue;
      if (y < Math.max(r.top, hl) + 24 || y > r.bottom - 24) continue;
      let min = Infinity;
      for (const u of moje) { const dd = Math.hypot(u.x - x, u.y - y); if (dd < min) min = dd; }
      if (dalsi ? !(min > okoli + 20) : !(min > tol + 10 && min < okoli - 10)) continue;
      const el = document.elementFromPoint(x, y);
      let pod = null;
      m.eachLayer((l) => { if (l._path && l._path === el && l.feature) pod = l.feature.properties.kraj; });
      if (pod !== sel) continue;
      return { x, y, tol: Math.round(tol), okoli: Math.round(okoli), min: Math.round(min), zoom: m.getZoom(), kraj: sel };
    }
    return null;
  }, dalsi);
}

const vedle = await najdiBod(false);
pravda('našel se bod těsně vedle tečky (mimo toleranci trefy)', !!vedle,
  've vybraném kraji nebyl bod mimo toleranci a přitom v okolí tečky');
if (vedle) {
  await p.mouse.click(vedle.x, vedle.y);
  await p.waitForTimeout(1100);
  const po = await stav();
  je('netrefené klepnutí neotevřelo cizí inzerát', new URL(p.url()).pathname, '/index.html');
  pravda('netrefené klepnutí mapu přiblížilo (místo aby se nestalo nic)', po.zoom > vedle.zoom,
    `přiblížení ${vedle.zoom} → ${po.zoom}, vzdálenost od tečky ${vedle.min} px (tolerance ${vedle.tol} px)`);
  pravda('netrefené klepnutí nepřepnulo kraj', po.kraj.indexOf(vedle.kraj) === 0, `hlavička: „${po.kraj}"`);
}

const daleko = await najdiBod(true);
if (daleko) {
  await p.mouse.click(daleko.x, daleko.y);
  await p.waitForTimeout(1100);
  const po = await stav();
  je('klepnutí daleko od všech pozemků mapou nehne', po.zoom, daleko.zoom);
  je('klepnutí daleko od všech pozemků neotevře inzerát', new URL(p.url()).pathname, '/index.html');
} else {
  zpravy.push('  – bod daleko od všech pozemků se ve vybraném kraji nenašel (přeskočeno)');
}

/* ---------- 3. trefa do tečky otevře stránku pozemku ---------- */
{
  const st = await stav();
  const sel = st.tecky.map((q) => q.kraj).find((k) => k && st.kraj.indexOf(k) === 0);
  const vlastni = st.tecky.filter((t) => t.kraj === sel
    && t.y > Math.max(st.ramec.t, st.hlavicka) + 24 && t.y < st.ramec.d - 24
    && t.x > st.ramec.l + 14 && t.x < st.ramec.p - 14);
  pravda('je na co klepnout uvnitř vybraného kraje', vlastni.length > 0);
  if (vlastni.length) {
    await p.mouse.click(Math.round(vlastni[0].x), Math.round(vlastni[0].y));
    await p.waitForTimeout(1500);
    je('trefa do tečky otevře stránku pozemku', new URL(p.url()).pathname, '/pozemek.html');
  }
}

je('stránka neshodila žádnou chybu', chybyStranky, []);

await prohlizec.close();
console.log('\nOvládání mapy v prohlížeči');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
process.exit(chyb ? 1 : 0);
