// Test: co má atribut hidden, nesmí být vidět.
//
// Spuštění: node scripts/test-skryte.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// PROČ TO VZNIKLO. Atribut hidden skrývá prvek jen tím, že mu prohlížeč
// ve svém vlastním stylu nastaví display:none. Jakékoli AUTORSKÉ pravidlo
// s display tedy vyhrává — styl webu je v kaskádě nad stylem prohlížeče.
// Stačí tak napsat `.moje{display:flex}` a každý prvek té třídy je vidět
// i s atributem hidden. Nic o tom nehlásí: značkování vypadá správně,
// prohlížeč nic nevytkne a při čtení kódu to člověk přečte jako skryté.
//
// css/styles.css na to má plošnou pojistku ([hidden]{display:none
// !important}) a ta drží. Nedrží ale tam, kam ten soubor nedosáhne —
// a to je 404.html, která schválně nenačítá nic (404 má vyjít i tehdy,
// když ostatní soubory chybí) a má vlastní styl s pravidlem
// `a{display:inline-block}`. Odkaz na okres, který se ukazuje jen tehdy,
// když se okres z adresy pozná, se tam proto kreslil vždycky: prázdná
// zelená pilulka 284×26 px bez textu, na kterou se navíc dalo dostat
// tabulátorem. Přesně tohle tahle zkouška našla.
//
// A hlavně, odsud se poučení bere: scripts/test-vrstvy-mapa.mjs se u téhož
// druhu otázky ptal na `.hidden === true`, tedy na ATRIBUT. Ten tam
// samozřejmě je vždycky, takže by taková kontrola prošla i u prvku, který
// je vidět. Tady se proto neptáme na atribut, ale na to, co vidí oko:
// má ten prvek box?
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const ROOT = new URL('..', import.meta.url).pathname;
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Stránky, na kterých atribut hidden v kódu vůbec je — jiné by měřily
   prázdno. Vybírá se ze zdroje, ne ručně, ať na novou stránku nikdo
   nezapomene. */
const VZOR_HIDDEN = /<[a-z]+(?:\s+[^\s=>]+(?:="[^"]*")?)*\s*>/g;
const maHidden = (a) => /(?:^|\s)hidden(?=[\s>]|$)/.test(a) || /(?:^|\s)hidden="(?:|hidden|true)"/.test(a);
const STRANKY = [];
for (const f of readdirSync(ROOT)) {
  if (!f.endsWith('.html') || /^pozemek-/.test(f)) continue;
  const h = readFileSync(path.join(ROOT, f), 'utf8');
  let kolik = 0;
  for (const m of h.matchAll(VZOR_HIDDEN)) {
    const atr = m[0].slice(1).replace(/^[a-z]+/, '');
    if (maHidden(atr)) kolik++;
  }
  if (kolik) STRANKY.push({ f, kolik });
}
STRANKY.sort((a, b) => b.kolik - a.kolik);
/* Měřit všech sto stránek by trvalo a většina z nich nese tentýž
   společný kus (hlavičku, patičku, toast). Bereme ty, kde je atributů
   nejvíc, a k nim ty, které mají vlastní aplikační část. */
const VYBER = [...new Set(['index.html', 'cena-pozemku.html', 'pridat.html', 'muj-inzerat.html',
  'hlidani.html', 'zpravy.html', 'kontakt.html',
  ...STRANKY.slice(0, 6).map((s) => s.f)])].filter((f) => existsSync(path.join(ROOT, f)));
pravda(`stránky s atributem hidden se našly (${STRANKY.length}, měří se ${VYBER.length})`,
  STRANKY.length > 10 && VYBER.length >= 8);

const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/* Co se měří: prvek nesmí mít ŽÁDNÝ box. Nula na šířku i výšku je
   v pořádku (prázdný obal nic nezabírá a nikdo ho neuvidí), a stejně
   tak prvek bez offsetParent (leží v něčem, co je display:none).
   Neptáme se na opacity: prvek s opacity 0 sice není vidět, ale pořád
   zabírá místo a čtečka obrazovky ho v některých případech přečte —
   a hlavně by tím vznikla výmluva, kterou by si vada našla. */
const MERENI = `(() => {
  const out = [];
  document.querySelectorAll('[hidden]').forEach((el) => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return;
    out.push({
      znacka: el.tagName.toLowerCase(),
      id: el.id || '',
      trida: (typeof el.className === 'string' ? el.className.trim() : ''),
      display: s.display,
      sirka: Math.round(r.width), vyska: Math.round(r.height),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40)
    });
  });
  return out;
})()`;

let celkemSHidden = 0;
const nalezy = [];
for (const s of VYBER) {
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return LEAFLET ? r.abort() : r.continue();
  });
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const soubor = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(soubor)) return r.abort();
      return r.fulfill({ status: 200, contentType: soubor.endsWith('.css') ? 'text/css' : 'text/javascript',
        body: readFileSync(soubor) });
    });
    await ctx.route(`${BASE}/${s}`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1500);
  /* Kolik prvků s atributem hidden na stránce vůbec je. Bez tohohle by
     „žádný nález" znamenalo jen „nic se nenašlo k měření" — a to je
     past, do které jsem v téhle práci spadl dvakrát. */
  const kolik = await p.evaluate(() => document.querySelectorAll('[hidden]').length).catch(() => 0);
  celkemSHidden += kolik;
  const v = await p.evaluate(MERENI).catch(() => []);
  v.forEach((n) => nalezy.push(Object.assign({ stranka: s }, n)));
  await ctx.close();
}
await prohlizec.close();

pravda(`prvků s atributem hidden se v prohlížeči našlo dost (${celkemSHidden})`, celkemSHidden >= 20,
  `jen ${celkemSHidden} — kontrola pod tím by nic neznamenala`);

if (nalezy.length) {
  zpravy.push('\n  Vidět, ačkoli mají hidden:');
  for (const n of nalezy.slice(0, 20)) {
    zpravy.push(`    ${n.stranka}  <${n.znacka}${n.id ? ' #' + n.id : ''}${n.trida ? ' .' + n.trida.split(/\s+/).join('.') : ''}>`
      + `  display:${n.display}  ${n.sirka}×${n.vyska} px  „${n.text}"`);
  }
}
pravda('nic s atributem hidden není vidět', nalezy.length === 0,
  `${nalezy.length} prvků — autorské display přebíjí [hidden] z prohlížeče`);

console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Skryté prvky: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
