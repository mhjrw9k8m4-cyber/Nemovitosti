// Test: co web vystrkuje nahoru — a co naopak označí jako „ověřit".
//
// Spuštění: node scripts/test-doporuceni.mjs
//
// Web doporučoval pozemky, které jsou skoro jistě chyba. Benešov: 5 023 m²
// orné půdy za 28 000 Kč, tedy 6 Kč/m², odznak „−91 % proti okolí". Úvod
// k tomu hlásil „NEJVÝHODNĚJŠÍ DNES: o 95 % pod obvyklou · Doubravník" —
// stavební pozemek za 59 Kč/m². Takový stavební pozemek neexistuje.
//
// Na vině bylo skóre pro řazení: počítalo (900 − cena za m²) / 18, tedy
// ČÍM LEVNĚJŠÍ ZA METR, TÍM VÝŠ, bez ohledu na druh pozemku i na okolí.
// Orná půda za 6 Kč/m² tím porazila všechno ostatní.
//
// Rozlišit skutečný trhák od spoluvlastnického podílu z dat NEJDE —
// rozdělení slev je plynulé, žádný zlom v něm není (měřeno na 1 414
// nabídkách). Proto se to ani netvrdí: přes hranici uvěřitelnosti už web
// nemluví o slevě, ale o tom, že je potřeba si cenu ověřit.
//
// Investor pozná nesmysl za tři vteřiny a odejde. Běžný člověk ho nepozná,
// klikne, zjistí, že kupuje šestinu pole — a nevrátí se. Proto tenhle test.
import { readFileSync } from 'node:fs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const okno = { window: {} };
new Function('window', readFileSync(new URL('../js/ceny.js', import.meta.url), 'utf8'))(okno.window);
const C = okno.window.PK_CENY;
const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
const M = C.postav(DATA);

pravda('cenový model zná hranici uvěřitelnosti',
  typeof M.MEZ_POCHYBNA === 'number' && M.MEZ_POCHYBNA > 0 && M.MEZ_POCHYBNA <= 75,
  `MEZ_POCHYBNA = ${M.MEZ_POCHYBNA}`);
pravda('a hranici, od které se o slevě vůbec mluví',
  typeof M.MEZ_SLEVA === 'number' && M.MEZ_SLEVA >= 10 && M.MEZ_SLEVA < M.MEZ_POCHYBNA,
  `MEZ_SLEVA = ${M.MEZ_SLEVA}`);

// --- 1) Odhad sám označí pochybné -------------------------------------
const sOdhadem = DATA.map((d) => ({ d, o: M.odhad(d) })).filter((x) => x.o && x.o.podleVelikosti);
pravda('odhad se spočítal u dost nabídek', sOdhadem.length > 500, `jen ${sOdhadem.length}`);
const pochybne = sOdhadem.filter((x) => x.o.pochybna);
pravda('nějaké nabídky jsou označené jako pochybné', pochybne.length > 0,
  'ani jedna — buď se to nepočítá, nebo je hranice příliš vysoko');
pravda('ale není to většina', pochybne.length < sOdhadem.length * 0.25,
  `${pochybne.length} z ${sOdhadem.length} (${(pochybne.length / sOdhadem.length * 100).toFixed(0)} %) — to by už nebylo varování, ale šum`);
pravda('pochybná je právě ta s hlubokou slevou',
  pochybne.every((x) => x.o.podOdhadem >= M.MEZ_POCHYBNA) &&
  sOdhadem.filter((x) => !x.o.pochybna).every((x) => x.o.podOdhadem < M.MEZ_POCHYBNA));

// Konkrétní případy z recenze.
const benesov = DATA.find((d) => d.okres === 'Benešov' && d.price === 28000 && d.area === 5023);
const doubravnik = DATA.find((d) => d.place === 'Doubravník');
if (benesov) {
  const o = M.odhad(benesov);
  pravda('Benešov (orná půda za 6 Kč/m²) je označený jako pochybný',
    !!(o && o.pochybna), o ? `−${o.podOdhadem} %, pochybná: ${o.pochybna}` : 'bez odhadu');
}
if (doubravnik) {
  const o = M.odhad(doubravnik);
  pravda('Doubravník („stavební pozemek" za 59 Kč/m²) taky',
    !!(o && o.pochybna), o ? `−${o.podOdhadem} %, pochybná: ${o.pochybna}` : 'bez odhadu');
}

// --- 2) Skóre pro řazení nesmí odměňovat levnost samu o sobě ----------
// Tohle je jádro té chyby. Skóre se čte přímo z kódu, ať test měří to,
// co web opravdu dělá.
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const telo = main.slice(main.indexOf('function demand(d)'), main.indexOf('var LIST_LIMIT'));
pravda('skóre už nepočítá „čím levnější za metr, tím výš"',
  !/\(900\s*-\s*perM2\)/.test(telo),
  'vrátil se vzorec (900 − cena za m²) / 18 — ten vystrkuje podíly nahoru');
pravda('a opírá se o odhad proti srovnatelným pozemkům', /MODEL\.odhad\(d\)/.test(telo));
pravda('pochybné nabídky body nedostanou', /!o\.pochybna/.test(telo));

// Spočítáme skóre stejně jako web a zkontrolujeme, co vyjde nahoru.
function demand(d) {
  const tb = { drazba: 22, exekuce: 18, obec: 12, sale: 8, majitel: 10 }[d.type] || 0;
  let body = 0;
  const o = M.odhad(d);
  if (o && o.podleVelikosti && !o.pochybna && o.podOdhadem >= M.MEZ_SLEVA) {
    body = Math.min(45, Math.round((o.podOdhadem - M.MEZ_SLEVA) * 45 / 35));
  }
  return Math.max(6, Math.round(9 + tb + body));
}
const spicka = DATA.slice().sort((a, b) => demand(b) - demand(a)).slice(0, 10);
const pochybneNahore = spicka.filter((d) => { const o = M.odhad(d); return !!(o && o.pochybna); });
pravda('mezi deseti nejdoporučovanějšími není ani jedna pochybná',
  pochybneNahore.length === 0,
  pochybneNahore.map((d) => `${d.place} ${Math.round(d.price / d.area)} Kč/m² −${M.odhad(d).podOdhadem} %`).join(', '));
const nejlepsi = spicka[0];
const oNej = M.odhad(nejlepsi);
pravda('nejvýš stojí nabídka se skutečnou, uvěřitelnou slevou',
  !!(oNej && oNej.podleVelikosti && oNej.podOdhadem >= M.MEZ_SLEVA && !oNej.pochybna),
  `${nejlepsi.place} (${nejlepsi.okres}) ${Math.round(nejlepsi.price / nejlepsi.area)} Kč/m² · ` +
  (oNej ? `−${oNej.podOdhadem} %` : 'bez odhadu'));

// --- 3) Úvod webu nesmí pochybnou nabídku dávat do titulku ------------
const heroBlok = main.slice(main.indexOf("// 3) Nejvýhodnější dnes"), main.indexOf("vypln('deal'"));
pravda('„Nejvýhodnější dnes" pochybné přeskakuje', /o\.pochybna/.test(heroBlok),
  'do úvodu se tak dostane ta nejpodezřelejší nabídka na celém webu');
let best = null, bo = null;
for (const d of DATA) {
  const o = M.odhad(d);
  if (!o || !o.podleVelikosti || o.pochybna || o.podOdhadem < 25) continue;
  if (!bo || o.podOdhadem > bo.podOdhadem) { bo = o; best = d; }
}
pravda('a přesto něco najde', !!best, 'úvod by zůstal prázdný');
if (best) pravda('to, co nabídne, je uvěřitelné', bo.podOdhadem < M.MEZ_POCHYBNA,
  `${best.place} −${bo.podOdhadem} %`);

// --- 4) Karta i rádce musí říkat totéž -------------------------------
const mainKarta = main.slice(main.indexOf('var _od = MODEL ? MODEL.odhad(d) : null;'));
pravda('karta u pochybné ceny nenabízí slevu, ale ověření',
  /_od\.pochybna[\s\S]{0,400}ověřit cenu/.test(mainKarta),
  'zelený odznak „−91 % proti okolí" na kartě, která je skoro jistě podíl');
pravda('a štítek „Doporučujeme" na pochybnou nabídku nesedne',
  /filter\(function \(d\) \{ var o = MODEL \? MODEL\.odhad\(d\) : null; return !\(o && o\.pochybna\); \}\)/.test(main),
  'doporučit a zároveň varovat u téhož pozemku nejde');
const radce = readFileSync(new URL('../js/radce.js', import.meta.url), 'utf8');
pravda('rádce u pochybné ceny varuje, ne chválí',
  /o\.pochybna[\s\S]{0,300}spoluvlastnick/.test(radce),
  'rádce by u téhož pozemku říkal „může to být příležitost"');
const pozemek = readFileSync(new URL('../js/pozemek.js', import.meta.url), 'utf8');
/* Stránka pozemku i okno na mapě berou blok s odhadem ze sdíleného
   js/ceny.js — dokud to tak je, varování u pochybné slevy mají obě
   automaticky. (Dřív si ho každá skládala sama a v okně na mapě chybělo
   u 149 nabídek. Že to varování v obou podobách opravdu je, měří
   scripts/test-ceny.mjs na vymyšleném pozemku, kde je odpověď známá.) */
pravda('stránka pozemku bere blok s odhadem ze sdíleného modulu',
  /PK_CENY\.blokOdhadu/.test(pozemek), 'js/pozemek.js si ho skládá sám');
pravda('a okno na mapě taky', /PK_CENY\.blokOdhadu/.test(main),
  'js/main.js si ho skládá sám — přesně tak zmizelo varování z mapy');

// --- 5) A hlavně: co se opravdu vykreslí ------------------------------
// Kontroly výš čtou kód a počítají skóre vlastní kopií vzorce — to by
// samo o sobě nestačilo: kdyby se web choval jinak, než jak si ho tady
// přepočítávám, nic bych nepoznal. Tohle se dívá na hotové karty.
{
  const { chromium } = await import('playwright-core');
  await import('./falesna-supabase-chat.mjs');
  await new Promise((r) => setTimeout(r, 300));
  const BASE = 'http://127.0.0.1:8310';
  const PRAZDNA = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const kde = process.env.PW_CHROMIUM || '';
  const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return r.abort();
  });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  // Bez Leafletu se seznam vůbec nevykreslí a kontroly níž by mlčky
  // procházely na prázdné stránce — proto ta pojistka „karty se vykreslily".
  const LEAFLET = process.env.PK_LEAFLET_DIR || '';
  if (LEAFLET) {
    const { existsSync } = await import('node:fs');
    const path = (await import('node:path')).default;
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
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4200);
  const v = await p.evaluate(() => ({
    karty: [...document.querySelectorAll('.opp-item')].map((e) => ({
      text: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 70),
      overit: !!e.querySelector('.opp-overit'),
      sleva: (e.querySelector('.opp-deal') || {}).textContent || '',
      hot: !!e.querySelector('.opp-hot'),
    })),
    hero: (document.querySelector('.hl-fact[data-fakt="deal"] .hl-v') || {}).textContent || '',
  }));
  /* --- Střídání pořadí ------------------------------------------------
     Výpis ukazuje osm nabídek. Dokud rozhodovalo jen skóre, stálo na těch
     osmi místech den za dnem těch samých osm pozemků a zbytek nabídky se
     nahoru nedostal nikdy. Uvnitř pásma se proto pořadí každý den posune
     (js/poradi.js). Tady se ověřuje, že to opravdu funguje v aplikaci —
     ne jen v modulu: datum se podstrčí a výpis se načte znovu. */
  const poradiVDen = async (posun) => {
    const c = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
    await c.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
      if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
      return LEAFLET ? r.abort() : r.continue();
    });
    await c.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
      body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
    if (LEAFLET) {
      const { existsSync } = await import('node:fs');
      const path = (await import('node:path')).default;
      await c.route('https://unpkg.com/leaflet@**', (r) => {
        const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
        if (!existsSync(f)) return r.abort();
        return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
      });
    }
    // Podstrčené „dnes": posun o zadaný počet dní.
    await c.addInitScript(`(function(){var P=${posun},R=Date;function F(){if(arguments.length)return new R(...arguments);return new R(R.now()+P*86400000);}F.now=function(){return R.now()+P*86400000;};F.UTC=R.UTC;F.parse=R.parse;F.prototype=R.prototype;window.Date=F;})();`);
    const q = await c.newPage();
    await q.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await q.waitForTimeout(4200);
    const poradi = await q.evaluate(() => [...document.querySelectorAll('.opp-item')]
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)));
    await c.close();
    return poradi;
  };
  const dnes = await poradiVDen(0);
  const zaMesic = await poradiVDen(30);

  await prohlizec.close();

  pravda('karty se vykreslily', v.karty.length >= 5, `jen ${v.karty.length}`);
  /* Stálost pořadí BĚHEM JEDNÉ NÁVŠTĚVY hlídá scripts/test-razeni.mjs —
     tam se měří tak, jak to má smysl: obnovením v téže návštěvě. Tady se
     dřív porovnávaly dvě různé návštěvy, jenže mezi návštěvami se pořadí
     schválně promíchá (aby nabídka působila živě), takže ta kontrola
     hlásila chybu tam, kde web dělá přesně to, co má. */
  pravda('za měsíc se nahoře vystřídají jiné nabídky',
    dnes.length >= 5 && JSON.stringify(dnes) !== JSON.stringify(zaMesic),
    'pořadí je pořád stejné — starší inzeráty se nahoru nedostanou nikdy');
  const rozpor = v.karty.filter((k) => k.overit && k.hot);
  pravda('žádná karta zároveň nevaruje a nedoporučuje', rozpor.length === 0,
    rozpor.map((k) => k.text).join(' | '));
  const slevaNaOverit = v.karty.filter((k) => k.overit && /−\d+ %/.test(k.sleva));
  pravda('karta k ověření nenese zelený odznak se slevou', slevaNaOverit.length === 0,
    slevaNaOverit.map((k) => k.text + ' → ' + k.sleva).join(' | '));
  // Žádný vypsaný odznak slevy nesmí přesáhnout hranici uvěřitelnosti.
  const hluboke = v.karty.map((k) => (k.sleva.match(/−(\d+) %/) || [])[1])
    .filter(Boolean).map(Number).filter((n) => n >= M.MEZ_POCHYBNA);
  pravda('nikde nesvítí sleva hlubší než hranice uvěřitelnosti', hluboke.length === 0,
    'na kartách: ' + hluboke.map((n) => '−' + n + ' %').join(', '));
  const heroProc = (v.hero.match(/(\d+) %/) || [])[1];
  pravda('v úvodu svítí uvěřitelné číslo, ne „o 95 % pod obvyklou"',
    !heroProc || +heroProc < M.MEZ_POCHYBNA, `úvod hlásí: „${v.hero}"`);
}

console.log('\nCo se doporučuje a co se má ověřit');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Doporučení: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
