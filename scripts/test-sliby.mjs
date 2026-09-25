// Test: platí, co web slibuje?
//
// Spuštění: node scripts/test-sliby.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Ostatní testy hlídají, jestli web funguje. Tenhle hlídá něco jiného:
// jestli mluví pravdu. Slib, který se rozejde se skutečností, nespadne —
// jen tiše lže, a to se pozná až tehdy, když na něj někdo spolehne.
//
// Každá kontrola sem patří jen tehdy, když je na webu napsaná jako slib
// člověku. Ne „co by bylo hezké", ale „co jsme slíbili".
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = new URL('..', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const cti = (f) => readFileSync(path.join(KOREN, f), 'utf8');
const idx = cti('index.html');
const data = JSON.parse(cti('data/opportunities.json'));
const nabidky = data.opportunities || [];

/* ---- 1) „Z veřejných zdrojů: evidence dražeb, SPÚ, inzertní portály" ---- */
{
  const ma = (re) => nabidky.some((o) => re.test(String(o.extra || '')) );
  const drazby = nabidky.filter((o) => o.type === 'drazba' || o.type === 'exekuce').length;
  pravda('slibované zdroje opravdu dodávají data — evidence dražeb', drazby > 0, `dražeb a exekucí: ${drazby}`);
  pravda('… Státní pozemkový úřad', ma(/SPÚ|státní půd/i),
    'v datech není jediná nabídka od SPÚ, přestože ho web uvádí jako zdroj');
  pravda('… inzertní portály', ma(/Bezrealitky|Farmy/i),
    'v datech není jediný inzerát z portálu, přestože je web uvádí jako zdroj');

  /* „6 veřejných zdrojů" je v úvodu napsané natvrdo, kdežto seznam pod ním
     se vypisuje po jednom. Čísla se rozejdou tiše: přibude zdroj, číslo
     zůstane — a web tvrdí něco, co si sám pod tím vyvrací. */
  const cipu = (idx.match(/class="source-chip"/g) || []).length;
  const napsano = /<b>(\d+)<\/b><span>veřejných zdrojů/.exec(idx);
  pravda('počet zdrojů v úvodu sedí se seznamem pod ním',
    !!napsano && Number(napsano[1]) === cipu,
    `napsáno ${napsano ? napsano[1] : '?'}, vypsaných zdrojů ${cipu}`);

  /* Počet sám o sobě nestačí: dal se nafouknout tím, co zdroj NENÍ. Mezi
     šesti zdroji stál katastr nemovitostí — jenže z něj nepřichází ani
     jedna nabídka, je to ÚŘEDNÍ OVĚŘENÍ toho, co jsme našli jinde.
     Zdroj je to, odkud data tečou; nástroj na ověření patří vedle, ne
     do počtu. */
  const rada = idx.slice(idx.indexOf('<div class="source-row">'));
  const seznamZdroju = rada.slice(0, rada.indexOf('</div>\n      </div>') + 6);
  pravda('mezi zdroji nestojí nástroj na ověřování',
    !/katast/i.test(seznamZdroju),
    'katastr je vypsaný jako zdroj nabídek — z katastru ale žádná nabídka nepřichází');

  /* U každého zdroje svítí odznak „kolik naposledy přinesl". Ten odznak
     se k čipu páruje přes data-zdroj — a když klíč nesedí se jménem
     v datech, odznak buď zmizí, nebo (hůř) ukáže počet CIZÍHO zdroje.
     Přesně to se stalo, když se párovalo hádáním z názvu: „Centrální
     evidence veřejných dražeb" zůstala bez čísla a „Nucené dražby"
     ukazovaly její počet. Nic nespadlo, jen web lhal číslem. */
  const klice = [...idx.matchAll(/class="source-chip" data-zdroj="([^"]+)"/g)].map((m) => m[1]);
  const vData = (data.sources || []).map((z) => z.nazev);
  pravda('každý vypsaný zdroj má klíč ke svému stavu', klice.length === cipu,
    `čipů ${cipu}, z toho s klíčem ${klice.length}`);
  const neznam = klice.filter((k) => vData.indexOf(k) === -1);
  pravda('a ten klíč v datech opravdu existuje', neznam.length === 0,
    `web se ptá na zdroje ${neznam.join(', ')}, data znají ${vData.join(', ')}`);
}

/* ---- 2) „Pokrýváme celou Českou republiku" ---- */
{
  const src = cti('js/main.js');
  const OKRES_KRAJ = Function('return {' + /var OKRES_KRAJ = \{([\s\S]*?)\n  \};/.exec(src)[1] + '}')();
  const kraje = new Set(nabidky.map((o) => OKRES_KRAJ[o.okres]).filter(Boolean));
  const vsechny = ['Praha','Středočeský','Jihočeský','Plzeňský','Karlovarský','Ústecký','Liberecký',
    'Královéhradecký','Pardubický','Vysočina','Jihomoravský','Olomoucký','Zlínský','Moravskoslezský'];
  const chybi = vsechny.filter((k) => !kraje.has(k));
  pravda('„celá ČR" znamená opravdu všech 14 krajů', chibiPrazdne(chybi), 'bez dat: ' + chybi.join(', '));
}
function chibiPrazdne(a) { return a.length === 0; }

/* ---- 3) „Neukazujeme osobní údaje vlastníků" ---- */
{
  const podezrela = new Set();
  for (const o of nabidky) for (const k of Object.keys(o)) {
    if (/jmeno|name|prijmeni|telefon|phone|email|mail|vlastnik|owner|rodne|ico/i.test(k)) podezrela.add(k);
  }
  pravda('veřejná data nenesou jméno ani kontakt na vlastníka',
    podezrela.size === 0, 'pole: ' + [...podezrela].join(', '));
}

/* ---- 4) „Robot prochází zdroje každých 6 hodin (4× denně)" ---- */
{
  const wf = cti('.github/workflows/update-data.yml');
  const cron = (/cron:\s*'([^']+)'/.exec(wf) || [])[1] || '';
  pravda('plán robota odpovídá tomu, co web slibuje', cron === '0 */6 * * *',
    `ve workflow stojí „${cron}", na webu „každých 6 hodin (4× za den)"`);
}

/* ---- 5) „U každé lokality vidíte, kdy proběhla poslední aktualizace" ---- */
{
  if (/kdy proběhla poslední aktualizace/.test(idx)) {
    const lokality = readdirSync(KOREN).filter((f) => /^pozemky-(okres-.+|.+-kraj)\.html$/.test(f));
    const bez = lokality.filter((f) => !/naposledy zkontrolovány/.test(cti(f)));
    pravda('každá krajská a okresní stránka říká, kdy se zdroje kontrolovaly',
      bez.length === 0, `${bez.length} z ${lokality.length} stránek to neříká`);
  }
}

/* ---- 6) „Slovníček vysvětluje každý pojem" ---- */
{
  const usek = idx.slice(idx.indexOf('id="slovnicek"'));
  const slovnik = usek.slice(0, usek.indexOf('</section>'));
  const hesla = [...slovnik.matchAll(/<h4>([^<]+)<\/h4>/g)].map((m) => m[1].toLowerCase());
  const zdroje = ['index.html', 'js/radce.js', 'js/main.js', 'js/pozemek.js'].map(cti).join(' ').toLowerCase();
  // Odborné výrazy, které web sám používá v textech pro lidi.
  const vyrazy = [
    ['spoluvlastnick', 'spoluvlastnický podíl'], ['věcné břemeno', 'věcné břemeno'],
    ['list vlastnictví', 'list vlastnictví'], ['vyvolávací cen', 'vyvolávací cena'],
    ['dražební jistot', 'dražební jistota'], ['dražební vyhlášk', 'dražební vyhláška'],
    ['příklep', 'příklep'], ['územní plán', 'územní plán'],
    ['orná půda', 'orná půda'], ['ostatní plocha', 'ostatní plocha'],
  ];
  const nevysvetlene = vyrazy
    .filter(([hledat]) => zdroje.includes(hledat))
    .filter(([, heslo]) => !hesla.some((h) => h.includes(heslo.slice(0, 8)) || heslo.includes(h.slice(0, 8))))
    .map(([, heslo]) => heslo);
  pravda('slovníček vysvětluje odborné výrazy, které web sám používá',
    nevysvetlene.length === 0,
    `nevysvětlené: ${nevysvetlene.join(', ')} — a přitom web slibuje „vysvětlíme každý pojem"`);
}

/* ---- 6b) Slovníček neslibuje data, která nemáme ---- */
/* „Insolvence" je ve slovníčku vysvětlená, ale mezi zdroji žádný
   insolvenční rejstřík není — a v datech není ani jedna nabídka
   z insolvence. Vysvětlený pojem se přitom čte jako nabídka („tohle tu
   najdete"), takže se u něj musí rovnou říct, proč ho tu nenajdete.
   Až se insolvenční rejstřík mezi zdroje přidá, tahle kontrola se sama
   vypne — hlídá totiž jen ten rozpor, ne konkrétní větu. */
{
  const zInsolvence = nabidky.filter((o) => /insolven/i.test(JSON.stringify(o))).length;
  const usek = idx.slice(idx.indexOf('id="slovnicek"'));
  const heslo = /<h4>Insolvence<\/h4>\s*<p>([^<]*)<\/p>/.exec(usek.slice(0, usek.indexOf('</section>')));
  if (heslo && zInsolvence === 0) {
    pravda('slovníček přiznává, že insolvenční rejstřík neprocházíme',
      /neprochází|nesledujeme|mezi zdroji není/i.test(heslo[1]),
      'insolvence je vysvětlená jako by to byl jeden z druhů nabídek, ale ani jedna taková v datech není a rejstřík mezi zdroji nestojí');
  }
}

/* ---- 7) Placené se nenabízí, dokud se nedá zaplatit ---- */
{
  const pridat = cti('pridat.html');
  const blok = /<div class="add-boost"([^>]*)>/.exec(pridat);
  if (blok) {
    pravda('placené zvýraznění se nenabízí, dokud platba nefunguje',
      /\bhidden\b/.test(blok[1]),
      'formulář ukazuje cenovku u funkce, kterou nejde zaplatit');
  }
}

/* ================= v prohlížeči ================= */
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Prohlížeč bez jediného přihlášení — přesně tak, jak web slibuje. */
async function host(inzeraty) {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 },
    locale: 'cs-CZ', permissions: [], reducedMotion: 'reduce' });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (LEAFLET && /unpkg\.com\/leaflet@/.test(r.request().url())) {
      const f = path.join(LEAFLET, path.basename(u.pathname));
      if (existsSync(f)) return r.fulfill({ status: 200,
        contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    }
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return r.abort();
  });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (inzeraty) {
    await ctx.route('**/rest/v1/rpc/public_listings*', (r) => r.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify(inzeraty) }));
  }
  await ctx.route(`${BASE}/index.html`, async (r) => {
    const o = await r.fetch();
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
      body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4200);
  return { ctx, p };
}

/* ---- 8) „Zdarma a bez registrace: mapa, filtry, hledání, uložené" ---- */
{
  const { ctx, p } = await host(null);
  await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  await p.waitForTimeout(600);
  const prihlasen = await p.evaluate(() => {
    try { return !!JSON.parse(localStorage.getItem('pk_auth') || 'null'); } catch (e) { return false; }
  });
  pravda('nic z toho nevyžaduje přihlášení', prihlasen === false, 'v prohlížeči je uložené přihlášení');

  const mapa = await p.evaluate(() => {
    const m = document.getElementById('leaflet-map');
    return !!m && m.getBoundingClientRect().height > 200 && document.querySelectorAll('#leaflet-map img.leaflet-tile').length > 0;
  });
  pravda('mapa jde prohlížet bez účtu', mapa);

  /* Hledání. Měří se HLÁŠENÝ počet nalezených, ne počet karet: výpis
     ukazuje jen prvních osm, takže po zúžení z tisíců na desítky by jich
     bylo pořád osm a kontrola by mlčela i s rozbitým hledáním. */
  const pocet = () => p.evaluate(() => {
    const m = String((document.getElementById('mvt-count') || {}).textContent || '').match(/\d[\d\s\u00a0]*/);
    return m ? +m[0].replace(/[\s\u00a0]/g, '') : null;
  });
  const pred = await pocet();
  await p.fill('#map-search', 'Kolín');
  await p.waitForTimeout(1200);
  const po = await pocet();
  /* Hledá se v obci, okresu i čísle parcely — kdo drží v ruce výpis
     z katastru, má po ruce číslo parcely, ne název obce. „Kolín" proto
     správně vrátí i Zásmuky z okresu Kolín; kontrola tedy ověřuje shodu
     v celém řádku karty, ne jen v názvu obce. */
  const karty = await p.evaluate(() => [...document.querySelectorAll('.opp-item')]
    .map((e) => e.textContent.replace(/\s+/g, ' ').toLowerCase()));
  pravda('hledání bez účtu opravdu zúží výpis',
    po != null && pred != null && po > 0 && po < pred / 2,
    `před ${pred}, po hledání ${po}`);
  pravda('a každá vypsaná nabídka hledanému textu odpovídá',
    karty.length > 0 && karty.every((t) => t.includes('kolín')),
    've výpisu zůstalo: ' + karty.filter((t) => !t.includes('kolín')).slice(0, 3).join(' | '));
  await p.fill('#map-search', '');
  await p.waitForTimeout(900);

  /* ---- 9) „Můžu hledat jen pozemky do určité ceny" ---- */
  /* Políčko „cena do" sedí v okně, které se otevře přes celou obrazovku —
     projde se tedy touž cestou jako člověk: rozbalit filtry, otevřít cenu,
     vyplnit, zavřít. Vyplňovat skryté políčko rovnou by sice bylo kratší,
     ale netestovalo by to, že se k němu jde dostat. */
  await p.evaluate(() => { const d = document.getElementById('ms-filters'); if (d) d.open = true; });
  await p.waitForTimeout(300);
  await p.locator('.mcs-btn').first().click();
  await p.waitForTimeout(400);
  await p.fill('#map-cena', '300000');
  await p.waitForTimeout(1200);
  const ceny = await p.evaluate(() => [...document.querySelectorAll('.opp-item .opp-price')]
    .map((e) => +e.textContent.replace(/[^\d]/g, '')).filter((x) => x > 0));
  pravda('filtr „cena do" opravdu odfiltruje dražší',
    ceny.length > 0 && ceny.every((c) => c <= 300000),
    ceny.length ? `nejdražší ve výpisu: ${Math.max(...ceny)} Kč` : 'výpis je prázdný');
  await p.fill('#map-cena', '');
  await p.waitForTimeout(400);
  await p.locator('.rz-ov:not([hidden]) .rz-hotovo').click();
  await p.waitForTimeout(900);

  /* ---- 10) „Uložíte bez registrace a zůstane vám to" ---- */
  await p.evaluate(() => { const b = document.querySelector('.opp-item .opp-fav'); if (b) b.click(); });
  await p.waitForTimeout(600);
  const ulozeno = await p.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('pk_fav_v1') || '[]') || []).length; } catch (e) { return 0; }
  });
  pravda('uložení funguje bez registrace', ulozeno === 1, `uloženo ${ulozeno} položek`);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3600);
  const poObnoveni = await p.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('pk_fav_v1') || '[]') || []).length; } catch (e) { return 0; }
  });
  pravda('a uložené přežije obnovení stránky', poObnoveni === 1, `po obnovení ${poObnoveni}`);
  await ctx.close();
}

/* ---- 11) „Nabídka se po odeslání ihned objeví mezi ostatními" ---- */
{
  const inzerat = [{
    id: 'zk-1', place: 'Zkušební Lhota', okres: 'Kolín', druh: 'stavební pozemek',
    parcel: '99/9', area: 1234, price: 555000, lat: 50.03, lng: 15.21,
    features: ['Elektřina'], access: 'cesta', views: 0,
  }];
  const { ctx, p } = await host(inzerat);
  /* Znovu pozor na osm vypsaných karet: nová nabídka se mezi ně dostat
     nemusí a z prázdného výpisu by se nedalo usoudit nic. Počítá se
     proto podle čísel u kategorií a pak se nabídka vyhledá jménem. */
  const cipMajitel = await p.evaluate(() => {
    const b = document.querySelector('.filter-chip[data-type="majitel"] .chip-n');
    return b ? +b.textContent.replace(/[^\d]/g, '') : 0;
  });
  pravda('inzerát od majitele se opravdu dostane mezi ostatní na mapu', cipMajitel >= 1,
    `kategorie „Přímo od majitele" hlásí ${cipMajitel} nabídek`);

  await p.fill('#map-search', 'Zkušební Lhota');
  await p.waitForTimeout(1300);
  const v = await p.evaluate(() => {
    const karty = [...document.querySelectorAll('.opp-item')].map((e) => e.textContent.replace(/\s+/g, ' '));
    return { najdeSe: karty.some((t) => t.includes('Zkušební Lhota')),
      odznak: karty.some((t) => t.includes('Zkušební Lhota') && /majitel/i.test(t)),
      karty: karty.slice(0, 3) };
  });
  pravda('a dá se najít hledáním jako kterákoli jiná', v.najdeSe,
    've výpisu: ' + v.karty.join(' | '));
  pravda('a je u něj poznat, že je přímo od majitele', v.odznak,
    'web slibuje, že se ukáže jako „Přímo od majitele"');
  await ctx.close();
}

await prohlizec.close();
console.log('\nSliby webu proti skutečnosti');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Sliby: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
