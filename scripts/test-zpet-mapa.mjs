/* Test: šipka zpět na mapě nevyhodí z webu.
   ===================================================================
   Spuštění: node scripts/test-zpet-mapa.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ VZNIKL. Majitel 2. 11.: „jsem na mapě, dám na mobilu zpět
   a vyhodí mě to ze stránky, to se nesmí stávat." Změřeno na 390×844:
   přepnutí na mapu nepřidávalo do historie NIC (history.length zůstalo
   3, adresa stejná), takže systémová šipka zpět odvedla člověka na
   předchozí dokument — z index.html na data.html — a vzala s sebou
   celý stav mapy, který prošel.

   Je to týž druh vady, jakou mělo pět celoobrazovkových vrstev
   (vrstvaOtevrena v js/main.js); přepínač Seznam/Mapa do toho
   mechanismu nebyl zapojený.

   CO SE MĚŘÍ. Nejen „zpět mě nevyhodí" — to by prošlo i nad záznamem,
   který v historii uvízne navždy a udělá ze šipky zpět mrtvý ovladač.
   Proto se měří celý cyklus: záznam vznikne, jedno zpět vrátí seznam,
   druhé zpět už z webu ODEJDE, a přepnutí vlastním tlačítkem záznam
   taky spotřebuje.
   =================================================================== */
import { chromium } from 'playwright-core';
import { BASE } from './falesna-supabase-chat.mjs';
import { naPohled } from './zkouska-pohled.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
hlasPad('Šipka zpět na mapě', zpravy, () => chyb);

await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
const ctx = await prohlizec.newContext({ bypassCSP: true,
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  locale: 'cs-CZ', serviceWorkers: 'block' });
const p = await ctx.newPage();

/* Odkud člověk přišel. Bez téhle stránky by „zpět" nemělo kam jít
   a zkouška by nepoznala rozdíl mezi „zůstal" a „nebylo kam odejít". */
await p.goto(`${BASE}/data.html`, { waitUntil: 'load' });
await p.waitForTimeout(1200);
await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(2500);

const stav = () => p.evaluate(() => ({
  cesta: location.pathname,
  delka: history.length,
  seznam: !!(document.querySelector('.map-app') || {}).classList
    && document.querySelector('.map-app').classList.contains('mv-seznam'),
  jeApp: !!document.querySelector('.map-app'),
}));

const pred = await stav();
pravda('na telefonu je co přepínat a začíná se v seznamu',
  pred.jeApp === true && pred.seznam === true, JSON.stringify(pred));

const prepnuto = await naPohled(p, 'mapa');
pravda('přepnutí na mapu zabralo (jinak se dál neměří nic)', prepnuto === true, String(prepnuto));
await p.waitForTimeout(1500);
const naMape = await stav();
pravda('mapa je vidět (není to seznam)', naMape.seznam === false, JSON.stringify(naMape));
/* Jádro vady: bez záznamu v historii nemá šipka zpět co zavřít. */
pravda('a přepnutí přidalo právě jeden záznam do historie',
  naMape.delka === pred.delka + 1, `před ${pred.delka}, po ${naMape.delka}`);

await p.goBack({ waitUntil: 'load' }).catch(() => {});
await p.waitForTimeout(2000);
const poZpet = await stav();
pravda('šipka zpět NEODVEDE z webu (zůstáváme na index.html)',
  /index\.html$/.test(poZpet.cesta), `cesta: ${poZpet.cesta}`);
pravda('a vrátí seznam, ne prázdno', poZpet.seznam === true, JSON.stringify(poZpet));

/* A ŽE TO NENÍ PAST. Druhé zpět už z webu odejít MUSÍ — záznam se
   spotřeboval. Kdyby se přidával znovu, byla by ze šipky zpět
   zaseknutá klika a člověk by se z úvodní stránky nedostal. */
await p.goBack({ waitUntil: 'load' }).catch(() => {});
await p.waitForTimeout(1500);
const poDruhem = await p.evaluate(() => location.pathname);
pravda('druhé zpět už z úvodní stránky odejde (není to past)',
  !/index\.html$/.test(poDruhem), `cesta: ${poDruhem}`);

// --- přepnutí vlastním tlačítkem záznam taky spotřebuje -------------
await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await p.waitForTimeout(2500);
const z1 = await stav();
await naPohled(p, 'mapa');
await p.waitForTimeout(1200);
await naPohled(p, 'seznam');
await p.waitForTimeout(1500);
const z2 = await stav();
pravda('zpátky na seznam tlačítkem: jsme v seznamu', z2.seznam === true, JSON.stringify(z2));
/* MĚŘÍ SE CHOVÁNÍ, NE history.length. Napoprvé tu stála kontrola
   „délka historie nesmí růst" a padala (před 3, po 4) i nad správným
   webem: history.back() záznam NEMAŽE, jen posune ukazatel, takže
   dopředný záznam v historii zůstane a délka se nezmění. Co opravdu
   rozhoduje, je jediná věc — jestli další šipka zpět odejde z webu,
   nebo se „prokliká" naprázdno zpátky na mapu. */
await p.goBack({ waitUntil: 'load' }).catch(() => {});
await p.waitForTimeout(1500);
const z3 = await p.evaluate(() => ({ cesta: location.pathname,
  seznam: !!document.querySelector('.map-app.mv-seznam') }));
pravda('a zpět po něm odejde z webu, neproklikne se naprázdno',
  !/index\.html$/.test(z3.cesta), JSON.stringify(z3) + ` (délka historie ${z1.delka} → ${z2.delka})`);

await ctx.close();
await prohlizec.close();
console.log('\nŠipka zpět na mapě');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Šipka zpět na mapě: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
