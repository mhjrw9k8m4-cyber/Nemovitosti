/* Test: mapová knihovna se stahuje, až když je mapa na dohled.
   ==================================================================
   Spuštění: node scripts/test-leaflet.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Naměřeno: vendor/leaflet/leaflet.js má 144 kB, přes drát (brotli)
   36,1 kB. Stránka pozemku si ho dřív brala značkou <script defer>, a to
   ve všech 1 994 případech — tedy i u každého, kdo k mapě dolů nikdy
   nesjede. Mapa je na té stránce pod cenou, popisem, vybavením
   a rádcem; nahoře je cena, ne dlaždice.

   Úvodní stránka je jiný případ: tam mapa JE ta stránka, takže si
   knihovnu bere dopředu a je to tak správně. Kontrola proto nehlídá
   „nikde", ale „nikde kromě index.html".

   Co se měří:
     1. staticky: kdo si knihovnu bere značkou <script> a kdo přes
        <meta name="pk-leaflet" data-src> — včetně razítka ?v=, bez
        kterého by se po výměně knihovny servírovala stará kopie;
     2. v prohlížeči: při načtení stránky pozemku se o knihovnu
        NEŽÁDÁ, a po sjetí k mapě se o ni požádá a mapa se postaví.

   Bod 2 má dvě tvrzení navíc, aby se nedal splnit prázdnem: že se
   vůbec něco stahovalo (jinak by „leaflet se nestahoval" platilo
   i o stránce, která se nenačetla) a že mapa nakonec opravdu vznikla
   (jinak by stačilo mapu vypnout a kontrola by byla zelená).
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nMapová knihovna až na dohled');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Leaflet: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

/* ---- 1) staticky ---------------------------------------------- */
const ZNACKA = /<script\s+src="vendor\/leaflet\/leaflet\.js[^"]*"/;
const META = /<meta name="pk-leaflet" data-src="(vendor\/leaflet\/leaflet\.js[^"]*)">/;
const stranky = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
const dopredu = [], pozemky = [], bezMeta = [], bezRazitka = [];
for (const f of stranky) {
  const s = fs.readFileSync(path.join(KOREN, f), 'utf8');
  if (ZNACKA.test(s)) dopredu.push(f);
  if (!/^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f) && f !== 'pozemek.html') continue;
  pozemky.push(f);
  const m = META.exec(s);
  if (!m) { bezMeta.push(f); continue; }
  if (!/\?v=[A-Za-z0-9]+$/.test(m[1])) bezRazitka.push(`${f} (${m[1]})`);
}
pravda(`stránky pozemků se našly (${pozemky.length}) — jinak kontrola měří prázdno`,
  pozemky.length > 1000, `jen ${pozemky.length}`);
pravda('knihovnu si dopředu bere jen index.html (tam mapa JE ta stránka)',
  dopredu.length === 1 && dopredu[0] === 'index.html',
  `${dopredu.length}: ` + dopredu.slice(0, 5).join(', '));
pravda('každá stránka pozemku má <meta name="pk-leaflet" data-src>',
  bezMeta.length === 0, `${bezMeta.length} bez něj: ` + bezMeta.slice(0, 3).join(', '));
pravda('a ta adresa nese razítko ?v= (bez něj se po výměně servíruje stará kopie)',
  bezRazitka.length === 0, `${bezRazitka.length}: ` + bezRazitka.slice(0, 3).join(', '));
pravda('knihovna na disku opravdu je',
  fs.existsSync(path.join(KOREN, 'vendor', 'leaflet', 'leaflet.js')),
  'vendor/leaflet/leaflet.js chybí');

/* ---- 2) v prohlížeči ------------------------------------------ */
const detail = pozemky.find((f) => f !== 'pozemek.html');
pravda('našla se stránka pozemku, na které se to dá změřit', !!detail, 'žádná pozemek-*.html');
if (!detail) hotovo();

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  /* Malé okno, ať je mapa opravdu pod okrajem. Na širokém monitoru by se
     dostala na dohled hned a měřilo by se něco jiného, než co se tvrdí. */
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 700 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  const zadosti = [];
  p.on('request', (r) => zadosti.push(r.url()));
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));

  await p.goto(`${BASE}/${detail}`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const jeLeaflet = () => zadosti.some((u) => /\/vendor\/leaflet\/leaflet\.js/.test(u));
  pravda(`při načtení se stahovalo ${zadosti.length} souborů (jinak by další tvrzení platilo o prázdnu)`,
    zadosti.length > 10, `jen ${zadosti.length}`);
  pravda('a stylopis mapy mezi nimi je (ten se bere dopředu schválně)',
    zadosti.some((u) => /\/vendor\/leaflet\/leaflet\.css/.test(u)), 'leaflet.css se nestahoval');
  pravda('ale o samotnou knihovnu se nežádalo',
    !jeLeaflet(), 'leaflet.js se stáhl, i když mapa není na dohled');
  const mapaPredtim = await p.evaluate(() => !!window.PK_PZ_MAPA);
  pravda('a mapa ještě nestojí', !mapaPredtim, 'mapa vznikla bez knihovny');

  await p.locator('#pzm').scrollIntoViewIfNeeded();
  await p.waitForFunction(() => !!window.PK_PZ_MAPA, null, { timeout: 15000 }).catch(() => {});
  pravda('po sjetí k mapě se knihovna stáhne', jeLeaflet(),
    'leaflet.js se nestáhl ani po sjetí — mapa by zůstala nehybným snímkem');
  const mapaPotom = await p.evaluate(() => !!(window.PK_PZ_MAPA && window.PK_PZ_MAPA.getSize));
  pravda('a mapa se postaví', mapaPotom, 'window.PK_PZ_MAPA nevznikla');
  pravda('bez chyby v konzoli', chybyJs.length === 0, chybyJs.slice(0, 2).join(' | '));
  await ctx.close();
} finally {
  await prohlizec.close();
}
hotovo();
