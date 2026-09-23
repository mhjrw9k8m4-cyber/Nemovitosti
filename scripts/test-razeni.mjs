// Test: dělá každé řazení to, co slibuje?
//
// Spuštění: node scripts/test-razeni.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Nabídka řazení je slib: „Nejlevnější" musí opravdu začínat nejlevnějším.
// Špatně seřazený výpis se přitom nepozná — vypadá to jako každý jiný
// seznam a člověk podle něj rozhoduje o milionech.
//
// Ověřuje se i míchání: výchozí pořadí se mezi návštěvami musí lišit (jinak
// starší inzeráty zapadnou), ale během jedné návštěvy se přeskládat nesmí.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function otevri() {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
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
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4200);
  // Nabídka řazení je v rozbalovátku „Druh, cena, výměra a řazení".
  await p.click('#ms-filters summary');
  await p.waitForTimeout(250);
  return { ctx, p };
}
// Z karty čteme jen to, co na ní člověk doopravdy vidí.
const karty = (p) => p.evaluate(() => [...document.querySelectorAll('.opp-item')].map((e) => {
  const cena = (e.querySelector('.opp-price') || {}).textContent || '';
  const fig = (e.querySelector('.opp-figures') || {}).textContent || '';
  const m = fig.replace(/\s+/g, ' ').match(/([\d ]+) m²/);
  return {
    text: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
    cena: +cena.replace(/[^\d]/g, ''),
    vymera: m ? +m[1].replace(/ /g, '') : null,
  };
}));
const serad = async (p, mode) => { await p.selectOption('#map-sort', mode); await p.waitForTimeout(900); return karty(p); };
/* Prázdný seznam projde každou podmínkou na řazení, protože .every()
   nad ničím vrací true. Kdyby se tedy některé řazení rozbilo tak, že
   nevykreslí ani jednu kartu, test by to pochválil. Proto se nejdřív
   ptáme, jestli vůbec je co řadit — stejně, jako to o kus níž dělá
   kontrola „Největší sleva proti okolí" (sleva.length >= 5). */
const roste = (x) => x.length > 0 && x.every((v, i) => i === 0 || x[i - 1] <= v);
const klesa = (x) => x.length > 0 && x.every((v, i) => i === 0 || x[i - 1] >= v);

{
  const { ctx, p } = await otevri();
  const vychozi = await karty(p);
  pravda('výpis se vůbec vykreslil', vychozi.length >= 5, `jen ${vychozi.length} karet`);

  const levne = await serad(p, 'price_asc');
  pravda('„Nejlevnější" opravdu začíná nejlevnějším', roste(levne.map((k) => k.cena)),
    'ceny: ' + levne.map((k) => k.cena).join(', '));

  const drahe = await serad(p, 'price_desc');
  pravda('„Nejdražší" opravdu začíná nejdražším', klesa(drahe.map((k) => k.cena)),
    'ceny: ' + drahe.map((k) => k.cena).join(', '));

  const velke = (await serad(p, 'area_desc')).map((k) => k.vymera).filter((x) => x != null);
  pravda('„Největší výměra" řadí od největší', klesa(velke), 'výměry: ' + velke.join(', '));

  const male = (await serad(p, 'area_asc')).map((k) => k.vymera).filter((x) => x != null);
  pravda('„Nejmenší výměra" řadí od nejmenší', roste(male), 'výměry: ' + male.join(', '));

  const sleva = await serad(p, 'sleva_desc');
  pravda('„Největší sleva proti okolí" výpis přeskládá', sleva.length >= 5 &&
    JSON.stringify(sleva) !== JSON.stringify(levne), 'pořadí je stejné jako u nejlevnějších');

  const drazby = await serad(p, 'drazba_asc');
  pravda('„Nejdřív končící dražba" dá dražbu na první místo',
    /Dražba|Exekuce/.test(drazby[0] ? drazby[0].text : ''),
    'první karta: ' + (drazby[0] ? drazby[0].text : '—'));

  const nove = await serad(p, 'nove');
  pravda('„Nejnovější" výpis přeskládá', nove.length >= 5 && JSON.stringify(nove) !== JSON.stringify(drahe));

  /* „Náhodně" musí zamíchat i podruhé. Kdo na to klepne znovu, čeká nové
     pořadí — ne to samé, co má před sebou. */
  const nahodne1 = await serad(p, 'nahodne');
  await p.selectOption('#map-sort', 'demand');
  await p.waitForTimeout(600);
  const nahodne2 = await serad(p, 'nahodne');
  pravda('„Náhodně" zamíchá pokaždé znovu',
    JSON.stringify(nahodne1) !== JSON.stringify(nahodne2),
    'dvakrát po sobě vyšlo totéž pořadí');

  // A během jedné návštěvy se výchozí pořadí přeskládat nesmí.
  const znovu = await serad(p, 'demand');
  const jesteRaz = await serad(p, 'demand');
  pravda('během návštěvy se výchozí pořadí nemění', JSON.stringify(znovu) === JSON.stringify(jesteRaz),
    'výpis se přeskládal pod rukou — co člověk viděl, už nenajde');
  await ctx.close();
}

/* Dvě různé návštěvy: pořadí se musí lišit, jinak starší inzeráty nikdy
   nevystoupí nahoru. (Pásmo kvality přitom drží: špatná nabídka se nahoru
   nedostane — to hlídá scripts/test-poradi.mjs.) */
{
  const a = await otevri(); const prvni = await karty(a.p); await a.ctx.close();
  const b = await otevri(); const druha = await karty(b.p); await b.ctx.close();
  pravda('mezi návštěvami se výpis promíchá',
    prvni.length >= 5 && JSON.stringify(prvni) !== JSON.stringify(druha),
    'obě návštěvy ukázaly totéž pořadí — starší inzeráty zapadnou');
}

await prohlizec.close();
console.log('\nŘazení výpisu — každá volba dělá, co slibuje');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Řazení: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
