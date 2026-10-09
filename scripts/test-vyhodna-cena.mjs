/* Test: jedna karta neříká „cena k ověření" a „výhodná cena" zároveň.
   ==================================================================
   Spuštění: node scripts/test-vyhodna-cena.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   NALEZENO NA OSTRÝCH DATECH. Karta na mapě dává odznak „výhodná cena"
   třem nejlevnějším nabídkám na obrazovce podle Kč/m². Tři podmínky
   nad tou větví hlídají důvěryhodnost, jenže všechny vyžadují
   `odhad.podleVelikosti`. Když odhad vyjde NULL — málo srovnatelných
   pozemků téže velikosti v okrese i v kraji — nabídka jimi proklouzne.
   Odznak „cena k ověření" se přitom přidává jinde a na jiném pravidle
   (MODEL.neduveryhodna), takže se obě hlášky sešly na téže kartě:
   varuj a zároveň doporuč.

   Naměřeno přes celou ČR a všech 77 okresů: odznak padne 137×, z toho
   3× na kartu, která o téže ceně zároveň varuje. Všechny tři jsou
   stavební pozemky bez odhadu — Český Brod za 3,3 Kč/m² (11 000 Kč za
   3 315 m²) a Jizerní Vtelno za 6,7. Stránka pozemku k nim žádný
   verdikt neukazuje; jen karta na mapě je vedla jako trhák.

   Měří se na podstrčených datech, ne na ostrých: ostrá se mění každých
   šest hodin a kontrola by jednou platila a jindy ne.

   Dvě strany téže mince, obě na jedné sadě dat:
     A) levná nabídka, kterou model za nevěrohodnou nepovažuje →
        odznak JE (jinak by prošla i podoba, která odznak zrušila úplně);
     B) nabídka, u které karta píše „cena k ověření" → odznak NENÍ.
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

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

/* ------------------------------------------------------------------
   PODSTRČENÁ DATA
   Dvacet obyčejných orných půd v jednom okrese dá modelu o co se opřít.
   K tomu dvě levné nabídky:
     • „Levná Lhota" — orná půda téže velikosti jako dvacet ostatních,
       jen o 15 % levnější: model jí věří a karta o ní nevaruje;
     • „Osamělá Ves" — velký stavební pozemek za 3,3 Kč/m², rozměry
       i cena opsané z Českého Brodu. Hladina pro stavební pozemky
       existuje (je jich v sadě dvanáct), takže ho MODEL.neduveryhodna
       označí za nevěrohodný — ale všechny jsou MALÉ, takže odhad podle
       velikosti nevyjde a nabídka propadne až na větev „výhodná cena".
   ------------------------------------------------------------------ */
function data() {
  const op = [];
  const poz = (o) => Object.assign({ okres: 'Tábor', type: 'sale', site: 'zkouska',
    url: 'https://example.cz/' + o.parcel, first_seen: '2026-09-01', lat: 49.4, lng: 14.66 }, o);
  /* Dvacet orných půd po 60 Kč/m² — tím má model o co opřít odhad
     u dalších orných půd stejné velikosti. */
  for (let i = 0; i < 20; i++) op.push(poz({ place: 'Orná ' + i, parcel: '1' + i, druh: 'orná půda', area: 5000, price: 5000 * 60 }));
  /* Dvanáct stavebních po 2 900 Kč/m², ale MALÝCH (800 m²). Tím vznikne
     cenová hladina pro stavební pozemky — a zároveň nebude s čím
     srovnávat velký stavební pozemek níž. Přesně tahle kombinace stojí
     za nálezem: hladina stačí na to říct „tahle cena je nevěrohodná",
     ale na odhad podle velikosti vzorek není. */
  for (let i = 0; i < 12; i++) op.push(poz({ place: 'Stavební ' + i, parcel: '2' + i, druh: 'stavební pozemek', area: 800, price: 800 * 2900 }));
  /* A) Levnější orná půda (51 proti 60 Kč/m²). Je mezi třemi nejlevnějšími,
     model jí věří a o 15 % pod odhadem je málo na odznak „−X % proti okolí",
     takže padne právě na větev „výhodná cena". */
  op.push(poz({ place: 'Levná Lhota', parcel: '900', druh: 'orná půda', area: 5000, price: 5000 * 51 }));
  /* B) Velký stavební pozemek za 3,3 Kč/m² — rozměry i cena opsané
     z nálezu v Českém Brodě (11 000 Kč za 3 315 m²). Model k němu odhad
     nemá (NULL), ale za nevěrohodný ho označí. */
  op.push(poz({ place: 'Osamělá Ves', parcel: '901', druh: 'stavební pozemek', area: 3315, price: 11000 }));
  return { updated: '2026-10-08', updated_at: '2026-10-08T00:00:00.000Z', source: 'zkouška', sources: [], opportunities: op };
}

const PW = process.env.PW_CHROMIUM;
const browser = await chromium.launch(PW ? { executablePath: PW } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
for (const v of ['**://*.tile.*/**', '**://*.openstreetmap.org/**', '**/_vercel/**']) {
  await page.route(v, (r) => r.fulfill({ status: 204, body: '' })).catch(() => {});
}
await page.route('**/data/opportunities.json*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data()) }));

await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await page.waitForTimeout(3000);

/* ŘADÍ SE PODLE CENY ZA METR, NE HLEDÁ SE. Vyhledávací pole by výpis
   zúžilo na jednu kartu — jenže odznak „výhodná cena" se počítá právě
   z toho, co je zrovna vidět (tři nejlevnější z vykreslené sady, a jen
   když jich je aspoň pět). Hledáním by se tedy vypnulo to, co se měří.
   Řazením „Nejlepší cena/m²" se obě sledované nabídky dostanou na
   první stranu a sada zůstane celá. */
await page.selectOption('#map-sort', 'perm2_asc');
await page.waitForTimeout(1200);

async function karta(jmeno) {
  return page.evaluate((jm) => {
    const karty = Array.from(document.querySelectorAll('.opp-item'));
    const el = karty.find((e) => (e.textContent || '').indexOf(jm) >= 0);
    if (!el) return null;
    return {
      chipy: Array.from(el.querySelectorAll('.opp-deal, .opp-overit')).map((c) => (c.textContent || '').trim()),
      vysledku: karty.length,
    };
  }, jmeno);
}

const karet = await page.evaluate(() => document.querySelectorAll('.opp-item').length);
const model = { karet, levna: await karta('Levná Lhota'), osamela: await karta('Osamělá Ves') };

pravda('mapa se postavila z podstrčených dat', model.karet > 0, `karet ${model.karet}`);
pravda('„Levná Lhota" je ve výpisu', !!(model && model.levna), 'karta se nenašla');
pravda('„Osamělá Ves" je ve výpisu', !!(model && model.osamela), 'karta se nenašla');

if (model && model.levna && model.osamela) {
  const maVyhodnou = (k) => k.chipy.some((c) => /výhodná cena|levnější než/i.test(c));
  const varuje = (k) => k.chipy.some((c) => /ověřit cenu|cena k ověření/i.test(c));
  pravda('levná orná půda, o které se nevaruje, odznak DOSTANE',
    maVyhodnou(model.levna) && !varuje(model.levna),
    `odznaky: ${JSON.stringify(model.levna.chipy)} — kdyby odznak zmizel úplně, prošla by i ta podoba`);
  pravda('u „Osamělé Vsi" karta o ceně varuje (jinak se měří jiný případ)',
    varuje(model.osamela), `odznaky: ${JSON.stringify(model.osamela.chipy)}`);
  pravda('a proto ji NEOZNAČÍ zároveň za výhodnou',
    !maVyhodnou(model.osamela),
    `odznaky: ${JSON.stringify(model.osamela.chipy)} — jedna karta varuje i doporučuje`);
}

await browser.close();
console.log('\n„Výhodná cena" jen tam, kde je čím ji podložit');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Výhodná cena: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
