/* Zkouška: co udělá šipka zpět po zapnutí filtru?
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-zpet-filtr.mjs
 * Volá ji .github/workflows/testy.yml (krok „Zpět po zapnutí filtru").
 *
 * PROČ TO VZNIKLO. Web si stav (výřez mapy i filtry) zapisuje do hashe
 * adresy. Do 7. 11. to dělal VŽDY přes `history.replaceState`, tedy
 * přepsáním dosavadní položky historie. Zapnutí filtru proto do historie
 * nepřidalo nic a šipka zpět poslala člověka na stránku, ze které na web
 * přišel. Naměřeno na telefonu 390 px: history.length 3 → 3 a po stisku
 * zpět byl prohlížeč na kontakt.html.
 *
 * PROČ SE NEPUSHUJE VŽDY. Výřez mapy se zapisuje při každém posunu
 * i při vlastním srovnání mapy webem. Kdyby každá taková změna zakládala
 * položku historie, nasbíraly by se jich při běžném prohlížení desítky
 * a odejít z webu by chtělo čtyřicet stisků. Rozhoduje proto FILTROVÁ
 * část adresy (všechno kromě `m=`): změnila-li se, byl to záměr člověka.
 *
 * TŘI VĚCI SE MUSÍ SEJÍT NAJEDNOU, a zkouška měří všechny tři:
 *   1. zapnutí filtru PŘIDÁ právě jednu položku historie,
 *   2. posun mapy NEPŘIDÁ žádnou,
 *   3. krok zpět vrátí filtr do původního stavu — ne jen adresu.
 * Bod 3 je ten, na kterém první pokus o opravu selhal: pushState sám
 * stačil na to, aby web neodešel, ale obnova dosazuje jen to, co
 * v adrese STOJÍ, takže „žádný druh" se nikam nedosadilo a filtr zůstal
 * zapnutý. Řeší to resetFilters() před dosazením (viz posluchač
 * hashchange v js/main.js).
 *
 * ČTE: kontakt.html a index.html přes server zkoušek. NEPÍŠE NIC.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Zpět po zapnutí filtru', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route('**/*', (r) => {
  const h = new URL(r.request().url()).hostname;
  return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort();
});
const p = await ctx.newPage();

/* Na web se přijde ODJINUD, jako z vyhledávače — jinak by „zpět"
   nemělo kam jít a zkouška by měřila prázdno. */
await p.goto(`${BASE}/kontakt.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(300);
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await p.locator('.opp-item').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
await p.waitForTimeout(900);

const pocetZ = async () => {
  const el = await p.locator('#map-count, #opp-count, #mvt-count').first().textContent().catch(() => '');
  return String(el || '').replace(/\s/g, '');
};
const vybrany = () => p.evaluate(() => {
  const a = document.querySelector('#map-filters .active, #map-filters [aria-pressed="true"]');
  return a ? (a.textContent || '').replace(/\s+/g, ' ').trim() : '';
});

const delkaStart = await p.evaluate(() => history.length);
const pocetStart = await pocetZ();
const druhStart = await vybrany();
pravda(`výpis se vykreslil a něco ukazuje (${pocetStart})`, /\d/.test(pocetStart), 'počet: ' + pocetStart);

/* ---- 1. ZAPNUTÍ FILTRU PŘIDÁ PRÁVĚ JEDNU --------------------------- */
await p.locator('#ms-filtr').click();
await p.waitForTimeout(500);
const chip = p.locator('#map-filters [data-type]').nth(1);
const jmenoChipu = ((await chip.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const delkaPredFiltrem = await p.evaluate(() => history.length);
await chip.click();
await p.waitForTimeout(1300);
const delkaPoFiltru = await p.evaluate(() => history.length);
const pocetSFiltrem = await pocetZ();
pravda(`zapnutí filtru („${jmenoChipu}") přidá právě jednu položku historie`,
  delkaPoFiltru - delkaPredFiltrem === 1, `přibylo ${delkaPoFiltru - delkaPredFiltrem}`);
pravda('a filtr opravdu zabral (počet se změnil)', pocetSFiltrem !== pocetStart,
  `před ${pocetStart}, po ${pocetSFiltrem}`);

/* ---- 2. ZPĚT ZŮSTANE NA WEBU A FILTR VRÁTÍ ------------------------- */
await p.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
/* ČEKÁ SE NA STAV, NE NA ČAS. Po kroku zpět se výpis překresluje
   a 1 300 ms stačilo u mě, ne na běžci CI: v běhu 1110 se naměřilo
   „na začátku 3432, s filtrem 3339, po zpět 3339" — tedy stav TĚSNĚ
   PŘED překreslením, ne vada webu. Čeká se proto na číslo, které tam
   má být; když se nevrátí, čekání vyprší a kontroly níž spadnou
   stejně jako dřív. */
await p.waitForFunction((ocek) => {
  const el = document.querySelector('#map-count, #opp-count, #mvt-count');
  return !!el && String(el.textContent || '').replace(/\s/g, '') === ocek;
}, pocetStart, { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(300);
pravda('krok zpět nechá člověka na výpisu', /index\.html/.test(p.url()), p.url());
const pocetPoZpet = await pocetZ();
const druhPoZpet = await vybrany();
pravda('krok zpět filtr zruší (počet je zpátky)', pocetPoZpet === pocetStart,
  `na začátku ${pocetStart}, s filtrem ${pocetSFiltrem}, po zpět ${pocetPoZpet}`);
pravda('a označený druh je zase ten výchozí',
  druhPoZpet.indexOf(jmenoChipu.replace(/\d.*$/, '').trim()) !== 0 || druhPoZpet === druhStart,
  `na začátku „${druhStart}", po zpět „${druhPoZpet}"`);
const hashPoZpet = await p.evaluate(() => location.hash);
pravda('a v adrese po filtru nic nezbylo', !/[?&#]t=/.test(hashPoZpet), 'hash: ' + hashPoZpet);


/* ---- CO TAHLE ZKOUŠKA NEHLÍDÁ, A PROČ -------------------------------
   Druhá polovina pravidla zní „posun mapy NESMÍ zakládat položku
   historie" — a tu tady změřenou nemám.

   Zkusil jsem to třemi způsoby a všechny selhaly na tom, že se mapa
   v základním stavu nedá posunout: má třídu `kraj-lock` a drží pohled
   na celou ČR, dokud se nevybere kraj. Naměřeno 7. 11.: po dvojím
   tažení prstem i myší (telefon 390 px i okno 1280 px) zůstal hash
   `#m=49.82655,15.51503,9` beze změny a history.length se nehnula.
   Leafletí ovladač přiblížení na webu není, web má vlastní.

   Napsat sem kontrolu, která projde i při sabotáži „pushovat vždy",
   by bylo horší než nemít ji: zelená by tvrdila něco, co se neměřilo
   (viz §369 a §468). Zůstává tedy přiznané slepé místo. Až se najde
   cesta, jak s mapou ve zkoušce pohnout, patří ta kontrola sem. */

await prohlizec.close();
console.log('\nZpět po zapnutí filtru');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Zpět po filtru: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
