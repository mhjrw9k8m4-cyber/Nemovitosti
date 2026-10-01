/* Test: barva u verdiktu o ceně.
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-verdikt.mjs
 *
 * Verdikt „Výhodná / Průměrná / Vyšší cena" je hodnocení, ne ozdoba.
 * Dvě věci se u něj rozbily potichu a obojí bylo vidět jen na obrazovce:
 *
 * 1) Odznak měl svou barvu nastavenou jen u „mid" a „warn". „good"
 *    i „bad" zůstávaly na výchozím --copper-bright, což je v tomhle
 *    motivu ZELENÁ. „Vyšší cena" tedy nosila zelený odznak na červené
 *    kartě — a zelená všude jinde na webu znamená „v pořádku".
 *    Ta zelená navíc s tmavým textem odznaku dávala jen 2,66 : 1.
 *
 * 2) Pravidlo .md-verdict.good se do stylů vůbec nedostalo. Vysvětlující
 *    komentář nad ním byl rozdělený na dva a mezi nimi zůstala volná
 *    věta s koncovou značkou komentáře; prohlížeč to bere jako rozbité
 *    pravidlo a při zotavení spolkne i řádek za ním. „Výhodná cena"
 *    proto neměla ani zelený podklad karty. V souboru to přitom
 *    vypadalo naprosto normálně — přečtením CSS se to nepozná.
 *
 * Proto se tu neptáme souboru, ale PROHLÍŽEČE: zná to pravidlo, a jakou
 * barvu z něj doopravdy spočítá?
 *
 * MĚŘÍ SE ŽIVÝ VERDIKT NA STRÁNCE POZEMKU (.pz-verdict / .pv-badge).
 * Dřív se měřil ten v panelu nad mapou (.md-verdict) — jenže ten panel
 * se nikdy neotevřel, takže patnáct kontrol dokazovalo něco o kódu,
 * který se nevykreslil. Přesunutím na živé místo se hned ukázaly dvě
 * vady, které tam byly celou dobu: odznak „Cena k ověření" neměl žádné
 * pozadí (rgba(0, 0, 0, 0)) a odznak „Výhodná cena" měl tmavý text na
 * modré, tedy 3,11 : 1 proti normě 4,5.
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8310;
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json' };
const server = createServer((q, r) => {
  let f = decodeURIComponent(String(q.url).split('?')[0]);
  if (f === '/') f = '/index.html';
  const c = path.join(KOREN, f);
  if (!c.startsWith(KOREN)) { r.writeHead(403); r.end(); return; }
  try {
    const b = readFileSync(c);
    r.writeHead(200, { 'Content-Type': TYPY[path.extname(c)] || 'application/octet-stream' });
    r.end(b);
  } catch (e) { r.writeHead(404); r.end(); }
});
await new Promise((res) => server.listen(PORT, '127.0.0.1', res));

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext();
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});
const p = await ctx.newPage();
// Stránka pozemku si nese pravidla verdiktu ve vlastní hlavičce.
await p.goto(`http://127.0.0.1:${PORT}/pozemek.html`, { waitUntil: 'load' });
await p.waitForTimeout(1500);

/* --- 1) Zná prohlížeč všechna pravidla verdiktu? -------------------- */
const znama = await p.evaluate(() => {
  const out = [];
  /* V Chromiu má i obyčejné pravidlo vlastnost cssRules (kvůli vnořenému
     CSS), takže „když má cssRules, je to skupina" by přeskočilo všechno.
     Selektor se proto bere vždy a zanořuje se jen do neprázdných. */
  const proch = (list) => { for (let i = 0; i < list.length; i++) { const r = list[i];
    if (r.selectorText) out.push(r.selectorText.replace(/\s+/g, ' ').trim());
    if (r.cssRules && r.cssRules.length) proch(r.cssRules); } };
  for (const sh of Array.from(document.styleSheets)) {
    let rs; try { rs = sh.cssRules; } catch (e) { continue; }   // cizí doména (fonty)
    if (rs) proch(rs);
  }
  return out;
});
pravda(`prohlížeč načetl styly (${znama.length} pravidel — jinak zkouška nic neměří)`,
  znama.length > 500, `pravidel ${znama.length}`);
for (const sel of ['.pz-verdict', '.pz-verdict.good', '.pz-verdict.mid', '.pz-verdict.bad', '.pz-verdict.warn']) {
  pravda(`pravidlo ${sel} se opravdu načetlo`, znama.indexOf(sel) !== -1,
    'v CSS je napsané, ale prohlížeč ho nezná — nejspíš ho spolkl rozbitý komentář nad ním');
}

/* --- 2) Jakou barvu z nich prohlížeč spočítá? ----------------------- */
const barvy = await p.evaluate(() => {
  const out = {};
  for (const cls of ['good', 'mid', 'bad', 'warn']) {
    const d = document.createElement('div');
    d.className = 'pz-verdict ' + cls;
    d.innerHTML = '<div class="pv-top"><span class="pv-badge">X</span></div>';
    document.body.appendChild(d);
    const bs = getComputedStyle(d.querySelector('.pv-badge'));
    const ds = getComputedStyle(d);
    out[cls] = { odznak: bs.backgroundColor, text: bs.color, panel: ds.backgroundColor };
    d.remove();
  }
  return out;
});
function rgb(s) { const m = String(s).match(/\d+(\.\d+)?/g) || []; return m.slice(0, 3).map(Number); }
function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function svit(c) { const [r, g, b] = c; return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
function kontrast(a, b) { const x = svit(rgb(a)), y = svit(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

// Text odznaku je drobný a tučný (12 px) → norma žádá 4,5 : 1.
for (const [cls, v] of Object.entries(barvy)) {
  const k = kontrast(v.odznak, v.text);
  pravda(`odznak „${cls}" je čitelný (${k.toFixed(2)} : 1)`, k >= 4.5,
    `barva ${v.odznak}, text ${v.text} — norma žádá 4,5 : 1 u drobného písma`);
}

/* Každý verdikt má SVOU barvu. Kdyby dva sdílely jednu, je odznak
   k ničemu — a přesně to se stalo: „good" i „bad" byly zelené. */
const odznaky = Object.entries(barvy).map(([c, v]) => [c, v.odznak]);
const shodne = odznaky.filter(([c, b], i) => odznaky.findIndex((x) => x[1] === b) !== i);
pravda('žádné dva verdikty nemají shodný odznak', shodne.length === 0,
  'shodují se: ' + shodne.map(([c, b]) => c + ' ' + b).join(', ') +
  '\n      ' + odznaky.map(([c, b]) => c + '=' + b).join('  '));

/* A „Vyšší cena" nesmí být zelená — zelená na tomhle webu znamená,
   že je něco v pořádku. Poznáme to podle toho, že zelená složka
   výrazně přebíjí červenou. */
const b = rgb(barvy.bad.odznak);
pravda('odznak „Vyšší cena" není zelený', !(b[1] > b[0] + 20),
  `barva ${barvy.bad.odznak} — zelená složka ${b[1]} proti červené ${b[0]}`);
/* Zelenou — tedy „tohle je v pořádku" — nese u „Výhodné ceny" KARTA,
   ne odznak. Odznak si bere značkovou --c-sale, tedy modrou, protože
   verdikt používá tutéž paletku jako druhy příležitostí. Modrá tak na
   mapě znamená „na prodej" a tady „výhodná cena"; neměním to, ale ať
   se to ví. Měří se proto zeleň KARTY. */
const g = rgb(barvy.good.panel);
pravda('karta „Výhodná cena" je zelená', g[1] > g[0] + 20,
  `podklad ${barvy.good.panel}`);

/* Odznak bez pozadí není odznak. Přesně tohle měla „Cena k ověření":
   tři varianty ze čtyř byly v CSS vypsané a na čtvrtou se zapomnělo,
   takže jí zbyl průhledný ovál s textem. */
for (const [cls, v] of Object.entries(barvy)) {
  pravda(`odznak „${cls}" má vůbec nějaké pozadí`,
    !/rgba\(0, 0, 0, 0\)|transparent/.test(v.odznak), `pozadí je ${v.odznak}`);
}

/* Podklad karty se u „good" musí lišit od výchozího — právě ten se
   ztrácel, když pravidlo spolkl rozbitý komentář. */
const zaklad = await p.evaluate(() => {
  const d = document.createElement('div');
  d.className = 'pz-verdict';
  document.body.appendChild(d);
  const v = getComputedStyle(d).backgroundColor;
  d.remove();
  return v;
});
for (const cls of ['good', 'mid', 'bad', 'warn']) {
  pravda(`karta „${cls}" má vlastní podklad, ne výchozí`, barvy[cls].panel !== zaklad,
    `podklad ${barvy[cls].panel} je stejný jako výchozí ${zaklad} — pravidlo se neuplatnilo`);
}

await prohlizec.close();
server.close();
console.log('\nBarva u verdiktu o ceně');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Verdikt: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
