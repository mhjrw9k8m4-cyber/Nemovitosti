// Test: hlídat se dá okruh od místa, ne jen pojmenovaný okres.
//
// Spuštění: node scripts/test-okruh-hlidani.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Mapa umí „Pozemky v okolí" odjakživa: člověk ukáže místo a posuvníkem
// nastaví okruh. Uložit si to ale nešlo — hlídání znalo jedinou podobu
// místa, totiž NÁZEV okresu nebo obce. Kdo bydlí v Tišnově a dojede za
// hodinu, přitom nehledá „okres Brno-venkov": z okolí Tišnova do 25 km
// spadá pět okresů naráz a žádný z nich celý.
//
// Hlídají se tři věci, protože každá se dá pokazit tiše:
//  1. POROVNÁVÁNÍ. Okruh musí počítat týmž modulem jako mapa (PKOkruh),
//     jinak by upozornění chodila na něco jiného, než co člověk viděl.
//     A okruh BEZ STŘEDU nesmí pustit nic — „do 25 km od ničeho" by
//     tiše hlídalo celou republiku.
//  2. CO SE ULOŽILO. Databáze nemusí mít nové sloupce (migrace se
//     spouští ručně). Web pak ustoupí na starší podobu — ale MUSÍ to
//     říct, jinak si člověk myslí, že hlídá okolí, a dostává okres.
//  3. ŽIVÁ NÁPOVĚDA. Vybrat „do 25 km" a nechat místo prázdné je snadné;
//     bez nápovědy by se to člověk dozvěděl až z upozornění.
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
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
  console.log('\nHlídání okruhu od místa');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Okruh v hlídání: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

/* ---- 1) porovnávání (bez prohlížeče) ---- */
{
  const H = createRequire(import.meta.url)(path.join(KOREN, 'js', 'hlidani-logika.js'));
  const P = (x) => Object.assign({ place: 'Tišnov', okres: 'Brno-venkov', lat: 49.3487, lng: 16.4245,
    price: 500000, area: 1000, type: 'sale', druh: 'Orná půda' }, x);
  const blizko = P({});
  const kousek = P({ place: 'Kuřim', lat: 49.2983, lng: 16.5317 });        // ~9 km
  const daleko = P({ place: 'Praha', okres: 'Praha-západ', lat: 50.07, lng: 14.43 }); // ~190 km
  const stred = { stred_lat: 49.3487, stred_lng: 16.4245 };

  pravda('pozemek uvnitř okruhu projde',
    H.matches(Object.assign({ okruh_km: 25 }, stred), blizko));
  pravda('a soused devět kilometrů daleko taky',
    H.matches(Object.assign({ okruh_km: 25 }, stred), kousek));
  // PŘEDPOKLAD: kdyby okruh nefiltroval, předchozí dvě kontroly nic neznamenají
  pravda('ale Praha sto devadesát kilometrů daleko NE',
    !H.matches(Object.assign({ okruh_km: 25 }, stred), daleko));
  pravda('a těsný okruh vyřadí i blízkého souseda',
    !H.matches(Object.assign({ okruh_km: 5 }, stred), kousek));
  pravda('bez okruhu se místo neřeší (staré hledání platí dál)',
    H.matches({}, daleko));
  pravda('okruh BEZ STŘEDU radši nepustí nic (ne všechno)',
    !H.matches({ okruh_km: 25 }, blizko),
    'hlídání s poloměrem a bez středu pustilo pozemek — to by znamenalo tiché hlídání celé ČR');
  pravda('a pozemek bez souřadnic taky ne',
    !H.matches(Object.assign({ okruh_km: 25 }, stred), P({ lat: undefined, lng: undefined })));

  /* Stupně uložení: okruh musí být v tom nejvyšším a smí se při ústupu
     odloupnout — jinak by se „viděné" počítaly z jiných kritérií, než
     jaká v databázi leží. */
  const st = H.STUPNE_ULOZENI;
  pravda('okruh je mezi tím, co se při ústupu odloupne',
    Array.isArray(st.bezOkruhu) && st.bezOkruhu.indexOf('okruh_km') >= 0,
    JSON.stringify(Object.keys(st)));
  const zbylo = H.kriteriaUlozena({ okres: 'Brno-venkov', okruh_km: 25, stred_lat: 49, stred_lng: 16 }, 'bezOkruhu');
  pravda('a po ústupu v kritériích opravdu není',
    !('okruh_km' in zbylo) && !('stred_lat' in zbylo) && zbylo.okres === 'Brno-venkov',
    JSON.stringify(zbylo));
}

/* ---- 2) stránka hlídání ---- */
const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
async function prihlasen(upravy) {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200,
    contentType: 'application/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctx.addInitScript(() => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
      refresh_token: 'ref-majitel', user: { id: '11111111-1111-4111-8111-111111111111' } }));
  });
  if (upravy) await upravy(ctx);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/hlidani.html`, { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  /* Formulář nového hlídání je na vlastní záložce; výchozí je „moje".
     Bez přepnutí je tlačítko „Uložit hlídání" v DOM, ale neviditelné. */
  const zal = await p.$('.hl-tab[data-zalozka="nove"]');
  if (zal) { await zal.click(); await p.waitForTimeout(800); }
  return { ctx, p };
}
async function vyplnit(p, misto, km) {
  await p.evaluate(([m, k]) => {
    const o = document.querySelector('#ns-okres');
    o.value = m; o.dispatchEvent(new Event('input', { bubbles: true }));
    const s = document.querySelector('#ns-okruh');
    s.value = k; s.dispatchEvent(new Event('change', { bubbles: true }));
  }, [misto, String(km)]);
  await p.waitForTimeout(500);
  return p.evaluate(() => document.querySelector('#ns-okruh-pozn').textContent.trim());
}

{
  const { ctx, p } = await prihlasen();
  const volby = await p.evaluate(() => {
    const s = document.querySelector('#ns-okruh');
    return s ? [...s.options].map((o) => o.value) : null;
  });
  // PŘEDPOKLAD: bez ovladače nemá smysl měřit nic dalšího
  pravda('formulář hlídání má volbu okruhu', Array.isArray(volby) && volby.length >= 4,
    'select #ns-okruh na stránce není — další kontroly by prošly naprázdno');
  if (!volby) { await prohlizec.close(); hotovo(); }
  pravda('a první volba je „celý okres", aby se chování nezměnilo samo', volby[0] === '',
    JSON.stringify(volby));

  pravda('u známého místa řekne, co se bude hlídat',
    /do 25 km od místa .Tišnov/.test(await vyplnit(p, 'Tišnov', 25)));
  pravda('bez místa upozorní, že není od čeho měřit',
    /Napište.*místo/i.test(await vyplnit(p, '', 25)));
  pravda('a u místa, které nezná, přizná, že se bude hlídat okres',
    /neumíme.*najít|celý okres/i.test(await vyplnit(p, 'Qwertzuiop', 25)));
  pravda('bez vybraného okruhu mlčí', (await vyplnit(p, 'Tišnov', '')) === '');
  await ctx.close();
}

/* ---- 3) uložení: okruh se opravdu propíše ---- */
{
  const { ctx, p } = await prihlasen();
  await vyplnit(p, 'Tišnov', 25);
  await p.click('#ns-save');
  await p.waitForTimeout(2500);
  const ulozene = await p.evaluate(async () => {
    const r = await fetch(window.PK_SUPABASE_URL + '/rest/v1/rpc/my_searches', {
      method: 'POST', headers: { 'content-type': 'application/json',
        authorization: 'Bearer tok-majitel', apikey: 'anon' }, body: '{}' });
    return r.ok ? r.json() : null;
  });
  const sOkruhem = (ulozene || []).filter((h) => h.okruh_km > 0);
  pravda('uložené hledání nese okruh', sOkruhem.length === 1,
    `hledání s okruhem: ${sOkruhem.length} z ${(ulozene || []).length}`);
  if (sOkruhem.length === 1) {
    const h = sOkruhem[0];
    pravda('a sedí poloměr', h.okruh_km === 25, String(h.okruh_km));
    /* Tišnov leží na 49,349 / 16,425. Deset kilometrů tolerance se vejde
       na medián nabídek po obci, ale ne na vedlejší okres. */
    const km = Math.hypot((h.stred_lat - 49.3487) * 111, (h.stred_lng - 16.4245) * 72);
    pravda('a střed sedí na vybrané místo', km < 10,
      `střed je ${km.toFixed(1)} km od Tišnova (${h.stred_lat}/${h.stred_lng})`);
  }
  await ctx.close();
}

/* ---- 4) když databáze okruh neumí, web to ŘEKNE ---- */
{
  let prvni = true;
  const { ctx, p } = await prihlasen(async (c) => {
    /* Nejvyšší stupeň odmítneme — přesně jako databáze bez spuštěné
       migrace saved-searches-okruh.sql. Ústup musí proběhnout A MUSÍ
       o něm být řeč: kdo si myslí, že hlídá okolí, a dostává okres,
       pozná to až podle upozornění. */
    await c.route('**/rest/v1/rpc/save_search*', async (route) => {
      const telo = route.request().postData() || '';
      if (prvni && /p_okruh_km/.test(telo) && !/"p_okruh_km":0/.test(telo)) {
        prvni = false;
        return route.fulfill({ status: 404, contentType: 'application/json',
          body: JSON.stringify({ message: 'function save_search(...) does not exist' }) });
      }
      return route.continue();
    });
  });
  await vyplnit(p, 'Tišnov', 25);
  await p.click('#ns-save');
  await p.waitForTimeout(2500);
  /* Hláška se hledá i NAD SEZNAMEM, ne jen ve formuláři: po uložení se
     přepne záložka a formulář i s hláškou zmizí. Právě proto varování
     přežívá v .hl-varovani — bez toho si ho člověk nestihl přečíst. */
  const hlaska = await p.evaluate(() => {
    const v = document.querySelector('.hl-varovani');
    if (v && v.textContent.trim()) return v.textContent.trim();
    const m = document.querySelector('.hl-msg');
    return m ? m.textContent.trim() : null;
  });
  pravda('když databáze okruh neumí, uloží se aspoň zbytek a NEMLČÍ se o tom',
    !!hlaska && /okruh/i.test(hlaska), `hláška: „${hlaska}"`);
  pravda('a stojí v ní, co se místo toho hlídá', !!hlaska && /okres/i.test(hlaska),
    `hláška: „${hlaska}"`);
  await ctx.close();
}

await prohlizec.close();
hotovo();
