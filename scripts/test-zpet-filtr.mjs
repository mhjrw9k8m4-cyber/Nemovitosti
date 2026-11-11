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
/* INSTRUMENTACE PRO CI. Tahle zkouška padá na běžci a u mě ne — ani
   pod zátěží čtyř smyček naplno (zkoušeno 9. 11.). Dokud nevím, co se
   tam děje, nemá smysl hádat opravu: stránka si proto zapisuje, jaké
   události přišly a jak se při nich měnila adresa, a zkouška to při
   pádu vypíše. Zápis je pasivní (jen posluchače), takže nic neměří
   jinak, než by to dopadlo bez něj. */
await ctx.addInitScript(() => {
  window.__pkUdalosti = [];
  const zapis = (co) => {
    try {
      window.__pkUdalosti.push(co + ' @' + (location.hash || '(bez hashe)')
        + ' t=' + Math.round(performance.now()));
    } catch (e) {}
  };
  window.addEventListener('popstate', () => zapis('popstate'));
  window.addEventListener('hashchange', () => zapis('hashchange'));
  window.addEventListener('pageshow', (e) => zapis('pageshow persisted=' + !!(e && e.persisted)));
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
/* Druh nabídky má od 10. 11. svůj otvírač (tlačítko „Filtry"
   i rozbalování hledání jsou pryč — schovávalo to filtry, viz
   scripts/test-filtry-radek.mjs). */
await p.locator('#mf-druh summary').click();
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
/* Co stránka při couvnutí zažila — vypíše se jen při pádu, aby
   zelený běh nebyl zavalený ladicím výpisem. */
const stopa = await p.evaluate(() => ({
  udalosti: (window.__pkUdalosti || []).slice(-8),
  hash: location.hash,
  trida: document.body.className,
  pocty: ['mvt-count', 'map-count', 'opp-count'].map((id) => {
    const e = document.getElementById(id);
    return id + '=' + (e ? JSON.stringify((e.textContent || '').trim()) : '—');
  }).join(' '),
  karet: document.querySelectorAll('.opp-item').length,
})).catch(() => null);
pravda('krok zpět filtr zruší (počet je zpátky)', pocetPoZpet === pocetStart,
  `na začátku ${pocetStart}, s filtrem ${pocetSFiltrem}, po zpět ${pocetPoZpet}`
  + (stopa ? `\n      stopa: ${stopa.udalosti.join(' | ')}`
    + `\n      hash „${stopa.hash}", karet ${stopa.karet}, ${stopa.pocty}`
    + `\n      třída těla „${stopa.trida}"` : ''));
pravda('a označený druh je zase ten výchozí',
  druhPoZpet.indexOf(jmenoChipu.replace(/\d.*$/, '').trim()) !== 0 || druhPoZpet === druhStart,
  `na začátku „${druhStart}", po zpět „${druhPoZpet}"`);
const hashPoZpet = await p.evaluate(() => location.hash);
pravda('a v adrese po filtru nic nezbylo', !/[?&#]t=/.test(hashPoZpet), 'hash: ' + hashPoZpet);


/* ---- 3. TOTÉŽ, ALE S PRÁZDNOU ADRESOU -----------------------------
   Tohle je ta podoba, která v CI náhodně padala (běhy 1110 a 1113,
   1114 prošel) a doma nikdy: záleží na tom, jestli si mapa stihla
   zapsat výřez do adresy DŘÍV, než člověk klepl na filtr. Když ne,
   je po kroku zpět adresa PRÁZDNÁ — a obsluha, která se ptala jen
   „je v adrese stav mapy?", neobnovila nic.
   Pro člověka: přijde z vyhledávače, hned klepne na filtr, dá zpět —
   a filtr mu zůstane, i když adresa už o něm nic neříká.
   Vyrábí se to jedním řádkem: adresa se před klepnutím na filtr
   uvede do stavu, v jakém je hned po příchodu (bez hashe). Nic se
   tím nepředstírá — přesně tak stránka vypadá, než se mapa usadí. */
{
  await p.goto(`${BASE}/kontakt.html`, { waitUntil: 'domcontentloaded' });
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.locator('.opp-item').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(900);
  const pocetA = await pocetZ();
  await p.evaluate(() => history.replaceState(history.state, '', location.pathname + location.search));
  await p.locator('#mf-druh summary').click();
  await p.waitForTimeout(400);
  const chip2 = p.locator('#map-filters [data-type]').nth(1);
  await chip2.click();
  await p.waitForTimeout(1300);
  const pocetB = await pocetZ();
  pravda(`bez stavu mapy v adrese filtr taky zabere (${pocetA} → ${pocetB})`,
    pocetB !== pocetA, `před ${pocetA}, po ${pocetB} — nebylo by co rušit`);
  const hashB = await p.evaluate(() => location.hash);
  await p.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForFunction((ocek) => {
    const e = document.querySelector('#map-count, #opp-count, #mvt-count');
    return !!e && String(e.textContent || '').replace(/\s/g, '') === ocek;
  }, pocetA, { timeout: 20000 }).catch(() => {});
  const pocetC = await pocetZ();
  const hashC = await p.evaluate(() => location.hash);
  pravda('a krok zpět ho zruší i tam, kde adresa zůstane prázdná',
    pocetC === pocetA, `po filtru hash „${hashB}" (${pocetB}), `
    + `po zpět hash „${hashC}" (${pocetC}), čekal se ${pocetA}`);
}

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
