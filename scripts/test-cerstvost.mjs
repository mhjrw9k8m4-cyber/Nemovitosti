// Test: je na webu poznat, jak čerstvá data jsou — a který zdroj vypadl.
//
// Spuštění: node scripts/test-cerstvost.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč: web ukazoval jedno datum za všechno dohromady — „aktualizováno
// 20. 9.". To zakrývá nejnebezpečnější případ, jaký u sbíraných dat je:
// JEDEN ZDROJ TIŠE PŘESTANE VRACET DATA a web dál tvrdí, že je čerstvý.
// Dražeb pomalu ubývá, nikdo si toho měsíce nevšimne.
//
// Robot proto u každého zdroje zapisuje, kdy naposledy odpověděl a kolik
// přinesl. Ostrý datový soubor to zatím nemá (robot od té změny neběžel),
// takže se tu podstrkuje — jinak by test jen mlčel a tvářil se spokojeně.
//
// Ověřuje se taky, že web zvládne STARÝ soubor bez těch údajů: nesmí se
// nic rozbít ani vypsat „undefined".
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

const OSTRA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
const dnes = new Date();
const dnesISO = dnes.toISOString().slice(0, 10);

/** Data s vyplněným stavem zdrojů — jeden z nich schválně spadlý. */
const SE_STAVEM = {
  updated: dnesISO,
  updated_at: new Date(dnes.getFullYear(), dnes.getMonth(), dnes.getDate(), 7, 0).toISOString(),
  sources: [
    { nazev: 'Dražby', stav: 'ok', pocet: 61, cas: dnesISO, chyba: null },
    { nazev: 'Bezrealitky', stav: 'chyba', pocet: 0, cas: dnesISO, chyba: 'HTTP 503' },
    { nazev: 'Farmy', stav: 'ok', pocet: 412, cas: dnesISO, chyba: null },
  ],
  opportunities: OSTRA.opportunities,
};
/** Starý soubor — přesně to, co na webu leží dnes, bez času a bez stavů. */
const STARA = { updated: dnesISO, source: OSTRA.source, opportunities: OSTRA.opportunities };

const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function otevri(data) {
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
  await ctx.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(data) }));
  if (LEAFLET) {
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
  const chyby = [];
  p.on('pageerror', (e) => chyby.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4200);
  return { ctx, p, chyby };
}

// --- 1) S vyplněným stavem zdrojů ------------------------------------
{
  const { ctx, p, chyby } = await otevri(SE_STAVEM);
  const v = await p.evaluate(() => ({
    hlavicka: (document.getElementById('data-updated') || {}).textContent || '',
    znacky: [...document.querySelectorAll('.source-chip')].map((c) => {
      const z = c.querySelector('.src-stav');
      return { text: c.textContent.trim(), stav: z ? z.textContent : null, zle: z ? z.classList.contains('src-zle') : false };
    }),
  }));
  pravda('čerstvost se uvádí i s časem, ne jen datem', /dnes v 7:00/.test(v.hlavicka),
    `vyšlo „${v.hlavicka}"`);
  const sesStavem = v.znacky.filter((z) => z.stav);
  pravda('u zdrojů je vidět, kolik naposledy přinesly', sesStavem.length >= 2,
    `se stavem jen ${sesStavem.length} z ${v.znacky.length}`);
  pravda('funkční zdroj ukazuje počet záznamů',
    sesStavem.some((z) => /61×|412×/.test(z.stav)), JSON.stringify(sesStavem));
  // Tohle je jádro testu.
  const spadly = sesStavem.find((z) => /bezrealitky/i.test(z.text));
  pravda('spadlý zdroj je označený jako nedostupný',
    !!(spadly && /nedostupn/.test(spadly.stav)), JSON.stringify(spadly));
  pravda('a je odlišený i barvou, ne jen slovem',
    !!(spadly && spadly.zle === true));
  pravda('se stavem zdrojů nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 2) Starý soubor bez těch údajů ----------------------------------
{
  const { ctx, p, chyby } = await otevri(STARA);
  const v = await p.evaluate(() => ({
    hlavicka: (document.getElementById('data-updated') || {}).textContent || '',
    znacky: document.querySelectorAll('.src-stav').length,
  }));
  pravda('starý soubor bez času se vypíše bez „undefined"',
    v.hlavicka.length > 0 && !/undefined|NaN|null/.test(v.hlavicka), `vyšlo „${v.hlavicka}"`);
  pravda('a bez stavů zdrojů se žádné značky nevyrábějí', v.znacky === 0,
    `značek ${v.znacky}`);
  pravda('se starým souborem nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 3) Robot ty údaje opravdu zapisuje ------------------------------
// Sběr odsud spustit nejde (všechny zdroje jsou z téhle schránky blokované),
// takže se kontroluje aspoň to, že je robot do souboru zapisuje.
{
  const robot = readFileSync(new URL('../scripts/fetch-opportunities.mjs', import.meta.url), 'utf8');
  pravda('robot zapisuje přesný čas kontroly', /updated_at:/.test(robot));
  pravda('robot zapisuje stav každého zdroje', /sources:\s*zdroje/.test(robot));
  pravda('a u spadlého zdroje i důvod', /chyba:\s*r\.status === 'rejected'/.test(robot));
}

await prohlizec.close();
console.log('\nČerstvost dat a stav zdrojů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Čerstvost dat: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
