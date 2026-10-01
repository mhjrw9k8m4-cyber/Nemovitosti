// Test: barva kategorie je na celém webu jedna a tatáž.
//
// Spuštění: node scripts/test-barvy.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Pozemek se na webu ukazuje na třech místech: jako tečka na mapě, jako karta
// ve výpisu a jako vlastní stránka. Barva kategorie („dražba" je cihlová) byla
// opsaná zvlášť v js/main.js, zvlášť v js/pozemek.js a potřetí v pravidlech
// stylu. Přesně tak se u ceny rozešla mapa se stránkou — tři kopie téhož
// výpočtu — a přesně tak se to stalo znovu u barev: paleta se změnila v CSS
// a tečky na mapě zůstaly ve staré.
//
// Zdroj je proto jeden: proměnné v CSS. Tenhle test hlídá, že si to tak
// zůstane — a hlavně že se ty barvy na stránce OPRAVDU projeví.
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

const KATEGORIE = ['sale', 'drazba', 'exekuce', 'obec', 'majitel'];

// --- 1) V kódu nesmí zůstat opsaná barva -----------------------------
for (const f of ['../js/main.js', '../js/pozemek.js']) {
  const t = readFileSync(new URL(f, import.meta.url), 'utf8');
  const blok = t.slice(t.indexOf('var TYPE = {'), t.indexOf('};', t.indexOf('var TYPE = {')));
  const opsane = [...blok.matchAll(/color:\s*'#[0-9A-Fa-f]{6}'/g)].map((m) => m[0]);
  pravda(`${f.replace('../', '')} si barvy kategorií nedrží sám`, opsane.length === 0,
    'opsané: ' + opsane.join(', '));
  pravda(`${f.replace('../', '')} je bere z proměnných ve stylu`,
    KATEGORIE.every((k) => blok.indexOf("'--c-" + k + "'") !== -1));
}

const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
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
  for (const c of ['index.html', 'pozemek.html']) {
    await ctx.route(`${BASE}/${c}*`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
}

/* V datech dnes není ani jeden obecní záměr a ani jeden inzerát od majitele
   (2 019 nabídek: sale 1 850, drazba 134, exekuce 35). Kdyby zkouška brala
   jen to, co v datech je, dvě kategorie z pěti by nehlídala — a přesně u té
   páté se stala chyba: puntík u „Přímo od majitele" byl průhledný.
   Dvě nabídky se proto podstrčí. */
await ctx.route('**/data/opportunities.json*', async (r) => {
  const o = await r.fetch();
  const j = JSON.parse(await o.text());
  const vzor = (j.opportunities || []).find((x) => x.type === 'sale');
  if (!vzor) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  for (const [t, m] of [['obec', 'Zkouska Obec'], ['majitel', 'Zkouska Majitel']]) {
    j.opportunities.unshift(Object.assign({}, vzor, {
      type: t, place: m, title: m, id: 'zk-' + t, url: 'https://example.invalid/' + t }));
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
});

/** Načte stránku a vrátí, co si o barvách myslí ona sama. */
async function zjisti(url) {
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', (e) => chyby.push(String(e)));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3800);
  const v = await p.evaluate((kat) => {
    const cs = getComputedStyle(document.documentElement);
    const tok = {}, dot = {};
    kat.forEach((k) => { tok[k] = cs.getPropertyValue('--c-' + k).trim(); });
    // Tečky na mapě i puntíky v legendě si barvu nesou v atributu style.
    document.querySelectorAll('.lp-dot, .lg-dot').forEach((e, i) => {
      dot['prvek' + i] = getComputedStyle(e).backgroundColor;
    });
    return { tok, dot, pocetDot: Object.keys(dot).length };
  }, KATEGORIE);
  await p.close();
  return { ...v, chyby };
}

function naRgb(hex) {
  const h = hex.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}

const uvod = await zjisti(`${BASE}/index.html`);
pravda('proměnné kategorií na úvodu existují',
  KATEGORIE.every((k) => /^#[0-9A-Fa-f]{6}$/.test(uvod.tok[k])), JSON.stringify(uvod.tok));
pravda('na úvodu nespadl žádný skript', uvod.chyby.length === 0, uvod.chyby[0]);

// Jádro: puntíky v legendě a ve výpisu mají barvy z těch proměnných, ne jiné.
const povolene = new Set(KATEGORIE.map((k) => naRgb(uvod.tok[k])));
const cizi = Object.entries(uvod.dot).filter(([, v]) => !povolene.has(v));
pravda('nějaké barevné puntíky se vůbec vykreslily', uvod.pocetDot > 0,
  'v DOMu není ani jeden .lp-dot / .lg-dot — test by mlčel');
pravda('každý puntík má barvu z palety, ne opsanou', cizi.length === 0,
  cizi.map(([k, v]) => `${k} má ${v}`).slice(0, 5).join(', ') + '\n      povolené: ' + [...povolene].join(', '));

const poz = await zjisti(`${BASE}/pozemek.html?p=Police%7C6242%7CVset%C3%ADn&ll=48.97,15.63`);
pravda('stránka pozemku čte tytéž proměnné',
  KATEGORIE.every((k) => poz.tok[k] === uvod.tok[k]),
  JSON.stringify(poz.tok) + ' × ' + JSON.stringify(uvod.tok));
pravda('na stránce pozemku nespadl žádný skript', poz.chyby.length === 0, poz.chyby[0]);

// --- 4) Dražba a exekuce patří do jedné teplé rodiny -----------------
// Tohle je ta záměrná změna: zlatá a semaforová červená pryč, cihlová rodina.
function odstin(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  let x; if (mx === r) x = ((g - b) / d + (g < b ? 6 : 0)); else if (mx === g) x = (b - r) / d + 2; else x = (r - g) / d + 4;
  return x * 60;
}
const hD = odstin(uvod.tok.drazba), hE = odstin(uvod.tok.exekuce);
pravda('dražba je v teplé cihlové části spektra', hD >= 5 && hD <= 35, `odstín ${hD.toFixed(0)}°`);
pravda('exekuce taky', hE >= 0 && hE <= 25, `odstín ${hE.toFixed(0)}°`);
pravda('a přitom se od sebe dají rozeznat', Math.abs(hD - hE) > 3 || (() => {
  const sv = (x) => { const h = x.replace('#', ''); return [0, 2, 4].reduce((a, i) => a + parseInt(h.slice(i, i + 2), 16), 0) / 3; };
  return Math.abs(sv(uvod.tok.drazba) - sv(uvod.tok.exekuce)) > 40;
})(), `dražba ${uvod.tok.drazba}, exekuce ${uvod.tok.exekuce}`);

/* --- 5) ODZNAK NA KARTĚ ---------------------------------------------
 * Tady byla vada, kterou tenhle test MĚL najít a nenašel: jmenuje se
 * „jeden zdroj pro mapu i karty", ale koukal se jen na puntíky mapy
 * a legendy (.lp-dot, .lg-dot). Puntík u odznaku na kartě si barvu bral
 * z vypsaných pravidel v CSS — a vypsané byly čtyři kategorie z pěti.
 * Změřeno: „Přímo od majitele" měl puntík rgba(0, 0, 0, 0), tedy nic.
 * Čte se SKUTEČNÁ karta ve výpisu, kategorie po kategorii (přepne se
 * filtr druhu příležitosti), ne vložený pokusný prvek — ten by měřil
 * pravidlo, ne stránku.
 */
{
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', (e) => chyby.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3800);
  for (const k of KATEGORIE) {
    const btn = await p.$(`[data-type="${k}"]`);
    pravda(`filtr „${k}" na úvodu je`, !!btn, 'bez něj se ke kartě té kategorie nedostanu');
    if (!btn) continue;
    await btn.click();
    await p.waitForTimeout(700);
    const o = await p.evaluate((kk) => {
      const e = document.querySelector('.opp-badge.' + kk);
      return { karet: document.querySelectorAll('.opp-item').length,
        punt: e ? getComputedStyle(e, '::before').backgroundColor : null };
    }, k);
    /* Pojistka: bez karty by se nemělo co měřit a kontrola pod tím by
       prošla naprázdno. */
    pravda(`a vykreslí aspoň jednu kartu „${k}"`, o.karet > 0, 'výpis je prázdný');
    if (!o.karet) continue;
    pravda(`puntík u odznaku „${k}" má barvu z palety`, o.punt === naRgb(uvod.tok[k]),
      `je ${o.punt}, má být ${naRgb(uvod.tok[k])} (--c-${k} = ${uvod.tok[k]})`);
  }
  pravda('a při přepínání filtrů nespadl skript', chyby.length === 0, chyby[0]);
  await p.close();
}

/* --- 6) A V CSS UŽ SE KATEGORIE NEVYPISUJÍ -------------------------
 * Jádro té vady nebyla chybějící barva, ale SEZNAM, ze kterého se dá
 * vypadnout. Barvu podstrkuje js/main.js v --c-druh, ze stejné
 * proměnné jako tečku na mapě; šestá kategorie si tím v CSS nevyžádá
 * nic. Tahle kontrola hlídá, ať se ten seznam nevrátí.
 */
{
  const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');     // komentáře mluví o kategoriích, a mají
  const vypsane = KATEGORIE.filter((k) => css.indexOf('.opp-badge.' + k) !== -1);
  pravda('CSS nevypisuje barvu puntíku kategorii po kategorii', vypsane.length === 0,
    'vypsané: ' + vypsane.join(', ') + ' — na šestou se zapomene zase');
  pravda('a pravidlo pro puntík v CSS vůbec je', css.indexOf('.opp-badge::before') !== -1,
    'bez něj by puntík nebyl vidět vůbec a kontrola nad tím by měřila prázdno');
}

/* --- 7) KAŽDÝ DRUH MÁ NA ÚVODU SVOU KARTIČKU -----------------------
 * Oddíl „druhy příležitostí" vysvětluje, co která barva na mapě
 * znamená. Měl ale čtyři kartičky z pěti — obecní záměr chyběl, takže
 * kdo na mapě viděl tyrkysový čtvereček, neměl se kde dozvědět, co to
 * je. Sednout si to musí s tabulkou druhů v js/main.js, ne s číslem
 * v nadpisu.
 * Barva čáry u kartičky se čte taky: dřív se barvilo podle pořadí
 * (nth-child 2 až 4), takže vložení druhu doprostřed by tiše přebarvilo
 * všechny za ním.
 */
{
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3800);
  const v = await p.evaluate(() => {
    const karty = [...document.querySelectorAll('.status-card')].map((e) => {
      const zn = e.querySelector('.status-n');
      return { druh: zn && zn.getAttribute('data-type'),
        cara: getComputedStyle(e).borderLeftColor,
        zavan: getComputedStyle(e).backgroundImage };
    });
    const vTabulce = window.PK_TVARY ? Object.keys(window.PK_TVARY) : [];
    const nadpis = (document.querySelector('#stavy h2') || {}).textContent || '';
    const cislo = (document.querySelector('#stavy .rm-n') || {}).textContent || '';
    return { karty, vTabulce, nadpis: nadpis.trim(), cislo: cislo.trim() };
  });
  pravda('úvod zná tabulku druhů i kartičky', v.vTabulce.length > 0 && v.karty.length > 0,
    `tabulka ${v.vTabulce.length}, kartiček ${v.karty.length}`);
  const maKarticku = v.karty.map((k) => k.druh);
  const chybi = v.vTabulce.filter((t) => maKarticku.indexOf(t) === -1);
  pravda('každý druh příležitosti má na úvodu svou kartičku', chybi.length === 0,
    `chybí: ${chybi.join(', ')} — kdo tu barvu uvidí na mapě, nemá se kde dozvědět, co je`);
  const navic = maKarticku.filter((t) => !t || v.vTabulce.indexOf(t) === -1);
  pravda('a žádná kartička nevysvětluje druh, který web nemá', navic.length === 0,
    `navíc: ${navic.join(', ')}`);
  for (const k of v.karty) {
    if (!k.druh || !uvod.tok[k.druh]) continue;
    pravda(`čára u kartičky „${k.druh}" má barvu z palety`, k.cara === naRgb(uvod.tok[k.druh]),
      `je ${k.cara}, má být ${naRgb(uvod.tok[k.druh])}`);
    /* Závan barvy se míchá z téže proměnné. Kdyby se color-mix nepovedl,
       nebyl by přechod vůbec — a kartička by ztratila polovinu výrazu. */
    pravda(`a závan barvy u „${k.druh}" se vykreslil`, /gradient/.test(k.zavan),
      `background-image je „${k.zavan}"`);
  }
  pravda('číslo v nadpisu sedí s počtem druhů',
    new RegExp('^' + ['', 'Jeden', 'Dva', 'Tři', 'Čtyři', 'Pět', 'Šest'][v.vTabulce.length] + ' ', 'i').test(v.nadpis),
    `nadpis „${v.nadpis}" proti ${v.vTabulce.length} druhům`);
  pravda('a číslo v postranním sloupci taky', v.cislo === String(v.vTabulce.length),
    `v sloupci stojí „${v.cislo}", druhů je ${v.vTabulce.length}`);
  await p.close();
}

await prohlizec.close();
console.log('\nBarvy kategorií — jeden zdroj pro mapu i karty');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Barvy kategorií: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
