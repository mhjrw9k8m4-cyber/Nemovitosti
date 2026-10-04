// Zkouška odolnosti proti vloženému kódu (XSS) v datech o pozemcích.
//
// Spuštění: node scripts/test-xss.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč: data na mapě nesbíráme sami — robot je bere z dražebních rejstříků
// a inzertních webů, na které nemáme žádný vliv. Vypisují se přes innerHTML
// a adresa odkazu jde rovnou do href. Kdyby se do popisu dostalo
// <img onerror="…">, spustilo by se to KAŽDÉMU návštěvníkovi; kdyby se do
// adresy dostalo „javascript:…", spustilo by se to po klepnutí na odkaz.
//
// Test proto podstrčí schválně jedovatá data a ověří, že se z nich na
// stránce nestane kód — ani značka, ani atribut, ani odkaz.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

/* ---------------------------------------------------------------------
   NEJDŘÍV SAMOTNÁ BRANKA, BEZ PROHLÍŽEČE
   ---------------------------------------------------------------------
   Branka dlouho čistila jen TEXTY a všechno ostatní propouštěla beze
   změny. Nevadilo to, dokud pole jako fotky nebo sítě chodila jen ze
   statických dat — jenže mapa teď předává pozemek na jeho stránku přes
   sessionStorage a nese je s sebou. Do úložiště prohlížeče přitom může
   sáhnout kdokoli, kdo na tomhle webu umí spustit skript, a adresa
   fotky se vypisuje rovnou do atributu src: uvozovka v ní by z atributu
   utekla. Tady se to zkouší přímo na brance, ať je vidět, co propustí.
--------------------------------------------------------------------- */
{
  const require2 = createRequire(import.meta.url);
  const C = require2(path.resolve('js/cisteni.js'));
  const NASE = 'https://abcdef.supabase.co/storage/v1/object/public/listing-photos/a.jpg';
  const v = C.pozemek({
    place: 'Kolín', type: 'majitel',
    photos: [NASE, 'https://zly.example.com/x.jpg',
      'https://abcdef.supabase.co/storage/v1/object/public/listing-photos/a" onerror=alert(1) x="',
      'javascript:alert(1)'],
    site: ['elektrina', '<img src=x onerror=alert(1)>', 'ELEKTRINA', 'voda'],
    features: ['Elektřina', '<b>Voda</b>', '"><svg onload=alert(1)>'],
    description: 'První odstavec.\r\n\r\n\r\nDruhý   odstavec s <b>značkou</b>.',
  });
  je('branka pustí jen fotku z našeho úložiště', v.photos, [NASE]);
  je('a ze sítí jen holé klíče', v.site, ['elektrina', 'voda']);
  /* Ze značek zbude neškodný text: „<" a „>" i uvozovka letí pryč, takže
     z <b>Voda</b> je „bVoda/b" a z '"><svg onload=…>' zbyde „svg
     onload=alert(1)". Vypadá to ošklivě, ale je to text — a na stránce
     přes něj projde ještě esc(). Zkouška tu čeká PŘESNĚ ten zbytek, ne
     jen „neobsahuje <": jinak by prošla i podoba, která by značku
     zahodila celou a s ní i kus textu, který tam člověk mínil. */
  je('u vybavení zahodí značky', v.features, ['Elektřina', 'bVoda/b', 'svg onload=alert(1)']);
  je('popis si nechá odstavec, ale ne značky',
    v.description, 'První odstavec.\n\nDruhý odstavec s bznačkou/b.');
}

// Jed. Každé pole zkouší jinou cestu, kterou se kód do stránky dostává.
const JED = {
  updated: '2026-01-01',
  source: 'test',
  opportunities: [{
    place: '<img src=x onerror="window.__prusvih=1">Kolín',
    okres: '"><svg onload="window.__prusvih=2">',
    type: 'sale',
    parcel: '" onmouseover="window.__prusvih=3',
    druh: '<b>tučně</b>',
    area: 1000, price: 500000,
    extra: '</span><script>window.__prusvih=4</script>',
    lat: 50.02, lng: 15.2,
    url: 'javascript:window.__prusvih=5',
  }, {
    place: 'Poctivá obec', okres: 'Kolín', type: 'drazba', parcel: '123/4',
    druh: 'orná půda', area: 2000, price: 300000, lat: 50.05, lng: 15.25,
    extra: 'dražba 1. 6. 2026', url: 'https://example.com/drazba',
  }],
};

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
await ctx.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
  contentType: 'application/json', body: JSON.stringify(JED) }));
await ctx.route('**/data/user-listings.json*', (r) => r.fulfill({ status: 200,
  contentType: 'application/json', body: '[]' }));
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
  for (const h of ['index.html', 'pozemek.html', 'hlidani.html', 'muj-inzerat.html']) {
    await ctx.route(`${BASE}/${h}`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
}

/* Kdo čte data o pozemcích, musí mít načtenou branku. js/main.js
   i js/pozemek.js ji vyžadují a bez ní spadnou — schválně, ať se prázdná
   stránka pozná hned. Tahle kontrola je proto o stránku dřív než prohlížeč:
   kdyby nová stránka zapomněla <script src="js/cisteni.js">, řekne to tady
   jmenovitě, ne až nesrozumitelnou chybou v konzoli. */
{
  const bezBranky = [];
  let ctecu = 0;
  for (const f of readdirSync('.').filter((x) => x.endsWith('.html'))) {
    const t = readFileSync(f, 'utf8');
    if (!/src="js\/(?:min\/)?(main|pozemek|centrum)\.js/.test(t)) continue;
    ctecu++;
    if (!/src="js\/(?:min\/)?cisteni\.js/.test(t)) bezBranky.push(f);
  }
  /* POČET ČTEČŮ SE TVRDÍ ZVLÁŠŤ. Kdyby se vzor cesty rozešel se
     skutečností (stalo se: stránky přešly na js/min/, vzor zůstal na
     js/), tenhle cyklus by každou stránku přeskočil, seznam by zůstal
     prázdný a kontrola by hlásila „v pořádku" o ničem. */
  je(`našlo se ${ctecu} stránek, které data o pozemcích čtou (jinak kontrola měří prázdno)`,
    ctecu > 1000, true);
  je('každá stránka, která čte data o pozemcích, načítá i branku', bezBranky.slice(0, 5), []);
}

/* TÁŽ BATERIE NA VŠECH STRÁNKÁCH, KTERÉ TA DATA ČTOU.
   Dřív se zkoušela jen úvodní mapa. Jenže tentýž soubor
   data/opportunities.json čte i stránka pozemku, hlídání a Můj inzerát —
   a branka na cizí texty bydlela uvnitř js/main.js, takže ji měla jen mapa.
   Na stránce pozemku se to projevilo: adresa inzerátu se escapovala (atribut
   nešlo rozbít), ale „javascript:" v ní zůstalo, takže tam z podstrčených dat
   vznikl odkaz, který po klepnutí spustí cizí kód. Změřeno v prohlížeči,
   proto se tady zkouší každá z těch stránek. */
const STRANKY = [
  // Stránka pozemku se otevírá jen se souřadnicemi: bez ?p= si pozemek najde
  // podle nejbližšího bodu, takže se nemusí skládat klíč z jedovatých textů.
  { url: 'index.html', karty: true },
  { url: 'pozemek.html?ll=50.02,15.2', karty: false },
  { url: 'hlidani.html', karty: false },
  { url: 'muj-inzerat.html', karty: false },
];

function zmer(p) {
  return p.evaluate(() => {
    const zakerne = ['onerror', 'onload', 'onmouseover', 'onclick', 'onfocus'];
    const atributy = [];
    document.querySelectorAll('*').forEach((el) => {
      for (const a of el.attributes) if (zakerne.indexOf(a.name.toLowerCase()) >= 0) atributy.push(el.tagName.toLowerCase() + '[' + a.name + ']');
    });
    const odkazy = [];
    document.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href') || '';
      if (/^\s*(javascript|data|vbscript):/i.test(h)) odkazy.push(h.slice(0, 40));
    });
    return {
      branka: !!window.PKCisteni,
      prusvih: typeof window.__prusvih === 'undefined' ? 'nic' : window.__prusvih,
      obrazkyX: document.querySelectorAll('img[src="x"]').length,
      svg: document.querySelectorAll('svg[onload]').length,
      skripty: [...document.querySelectorAll('script')].filter((s) => /__prusvih/.test(s.textContent || '')).length,
      atributy, odkazy,
      vsechnyKarty: [...document.querySelectorAll('.opp-item .opp-place')].map((e) => e.textContent),
    };
  });
}

for (const s of STRANKY) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s.url}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  await p.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important}' });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(800);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  const v = await zmer(p);
  const kde = s.url.split('?')[0];
  // Bez branky by zkoušky pod tím měřily jinou stránku, než si myslí.
  je(`${kde}: branka na cizí texty je načtená`, v.branka, true);
  je(`${kde}: žádný vložený kód se nespustil`, v.prusvih, 'nic');
  je(`${kde}: nevznikl žádný obrázek z vloženého kódu`, v.obrazkyX, 0);
  je(`${kde}: nevzniklo žádné svg s obsluhou události`, v.svg, 0);
  je(`${kde}: do stránky se nedostal žádný <script>`, v.skripty, 0);
  je(`${kde}: nevznikl žádný atribut obsluhy události`, v.atributy, []);
  je(`${kde}: žádný odkaz nevede na javascript:`, v.odkazy, []);
  if (s.karty) {
    // Jedovatý název se má objevit jako obyčejný TEXT — značky pryč, obsah zůstat.
    // (Pořadí karet určuje řazení, jedovatá nemusí být první.)
    je('jedovatý název se vypsal jako text, ne jako značka',
      v.vsechnyKarty.some((t) => t.indexOf('Kolín') >= 0) &&
      v.vsechnyKarty.every((t) => t.indexOf('<') < 0), true);
  }
  await p.close();
}

await prohlizec.close();
console.log('\nOdolnost proti vloženému kódu (XSS)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Data z cizích zdrojů se dostala do stránky jako kód.');
process.exit(chyb ? 1 : 0);
