/* RUČNÍ NÁSTROJ: podívat se na stránku Hlídání očima člověka
   ==================================================================
   Spuštění:  node scripts/snimek-hlidani.mjs <cesta.png> [šířka]

   PROČ EXISTUJE. Hlídání se nedá otevřít a prohlédnout jen tak: chce
   to přihlášený účet, uložené hledání a nabídku, která přibyla AŽ PO
   něm — jinak je stránka prázdná a o vzhledu nálezů neřekne nic.
   Tenhle skript to celé nastrojí (falešná Supabase, podstrčená data,
   uložené hlídání okresu Kolín, pak tři nové nabídky tří druhů)
   a vyfotí výsledek na celou výšku.

   KDO TO VOLÁ: nikdo. Není to zkouška a nic na něm nestojí — je to
   nástroj pro práci na vzhledu, aby se nemusel pokaždé psát znovu.
   Co se má HLÍDAT, hlídá scripts/test-hlidani-prohlizec.mjs.
   ================================================================== */
import { chromium } from 'playwright-core';
import { domUtichlo } from './zkouska-pripraveno.mjs';
const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const CIL = process.argv[2] || '/tmp/hl.png';
const SIRKA = Number(process.argv[3] || 420);
const zaDnu = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const STARE = { updated: '2026-01-01', opportunities: [
  { place: 'Kolín', okres: 'Kolín', type: 'sale', parcel: '1/1', druh: 'orná půda',
    area: 1200, price: 400000, lat: 50.02, lng: 15.20, extra: 'inzerát',
    site: ['elektrina', 'voda', 'cesta'] },
] };
const NOVE = { updated: '2026-01-02', opportunities: STARE.opportunities.concat([
  { place: 'Kolín-Sendražice', okres: 'Kolín', type: 'sale', parcel: '2/2', druh: 'stavební pozemek',
    area: 900, price: 650000, lat: 50.05, lng: 15.23, extra: 'inzerát',
    site: ['elektrina', 'kanalizace', 'plyn', 'cesta'] },
  { place: 'Kolín-Štítary', okres: 'Kolín', type: 'drazba', parcel: '3/3', druh: 'orná půda',
    area: 2400, price: 310000, lat: 50.04, lng: 15.18,
    extra: 'dražba ' + zaDnu(3) + ' · OK dražby' },
  { place: 'Kolín-Zibohlavy', okres: 'Kolín', type: 'majitel', parcel: '4/4', druh: 'zahrada',
    area: 540, price: 290000, lat: 50.03, lng: 15.22, extra: 'inzerát' },
]) };
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: SIRKA, height: 1000 }, deviceScaleFactor: 2, locale: 'cs-CZ' });
let data = STARE;
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
await ctx.route('**/data/{opportunities,mapa}.json*', (r) => r.fulfill({ status: 200,
  contentType: 'application/json', body: JSON.stringify(data) }));
await ctx.route('**/data/user-listings.json*', (r) => r.fulfill({ status: 200,
  contentType: 'application/json', body: '[]' }));
await ctx.addInitScript(() => {
  localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel', refresh_token: 'ref-majitel',
    user: { id: '11111111-1111-4111-8111-111111111111' } }));
});
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAD:', String((e && e.message) || e).slice(0, 200)));
await p.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#ns-okres', { state: 'attached', timeout: 15000 });
await domUtichlo(p, 350);
// uložit hlídání okresu Kolín
await p.evaluate(() => {
  const t = [...document.querySelectorAll('.hl-tab, [role="tab"], button')]
    .find((b) => /Nové hlídání/i.test(b.textContent || ''));
  if (t) t.click();
});
await domUtichlo(p, 250);
await p.selectOption('#ns-okres', 'Kolín').catch(() => {});
await p.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /Uložit|Hlídat/i.test(x.textContent || ''));
  if (b) b.click();
});
await domUtichlo(p, 600);
data = NOVE;
await p.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
await domUtichlo(p, 700);
const info = await p.evaluate(() => ({
  karet: document.querySelectorAll('.hl-nove li').length,
  vyska: document.documentElement.scrollHeight,
}));
console.log(JSON.stringify(info));
await p.screenshot({ path: CIL, fullPage: true });
await prohlizec.close();
process.exit(0);
