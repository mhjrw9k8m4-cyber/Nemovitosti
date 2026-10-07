/* Test: na stránce pozemku je důležité nahoře a nástroje dole.
   ==================================================================
   Spuštění: node scripts/test-poradi-pozemku.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   JAK TO VYPADALO. Naměřeno na telefonu 360×800: stránka měla 3 748 px,
   tedy 4,7 obrazovky, a to podstatné leželo úplně vzadu:
     · odkaz na skutečnou nabídku („Inzerát") na y 3 078 — čtvrtá
       obrazovka, a přitom kvůli němu se sem chodí;
     · „Uložit" na y 3 386, tedy ještě za ním;
     · mapa na 2 543, ačkoli u pozemku je poloha hned po ceně to první,
       co se člověk ptá;
     · kalkulačka návratnosti na 1 758 a vysoká 681 px — skoro celá
       obrazovka formuláře uprostřed cesty. Napřed se sbalila, pak se
       na přání majitele odebrala úplně; tahle zkouška proto hlídá,
       že se nevrátí;
     · „Moje poznámka" na 1 439, tedy dřív, než si člověk pozemek vůbec
       prohlédl — a psal si ji přitom až potom, co se rozhodl.

   CO SE MĚŘÍ. Pořadí bloků a výška stránky. Nejsou to pevná čísla do
   pixelu — ta by se rozbila při první změně textu — ale vztahy, které
   dávají smysl: co se čte dřív, stojí výš.
   ================================================================== */
import { chromium } from 'playwright-core';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const STRANKA = '/pozemek-benesov-benesov-1sjtz7b.html';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(spadlo) {
  console.log('\nPořadí na stránce pozemku');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Pořadí na stránce pozemku: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.');
    process.exit(1);
  }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({
    viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  await p.goto(BASE + STRANKA, { waitUntil: 'load' });
  await p.waitForSelector('.pz-priceblock', { timeout: 20000 });
  await p.waitForTimeout(2500);

  const m = await p.evaluate(() => {
    const y = (sel) => {
      const e = document.querySelector(sel);
      return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
    };
    const v = (sel) => {
      const e = document.querySelector(sel);
      return e ? Math.round(e.getBoundingClientRect().height) : null;
    };
    return {
      cena: y('.pz-priceblock'), verdikt: y('#pz-verdict'),
      radce: y('details.pz-gtk-obal:not(.pz-nav-obal)'),
      akce: y('.pz-akce-hlavni'), hlavniBtn: y('.pz-akce-hlavni .pz-btn.primary'),
      uloz: y('#pz-fav'), popis: y('.pz-popis-inzerent'), klice: y('.pz-klice'),
      /* Hledá se kalkulačka SAMA, ne obal, do kterého byla chvíli
         sbalená. Napsat sem obal znamená, že se po jeho zrušení
         nenajde nic a kontrola projde, i kdyby se formulář vrátil. */
      mapa: y('.pzm'), kalk: y('.pz-nav-box, .pz-nav-obal, #pz-nav, #nav-kupni'),
      pozn: y('.pz-pozn-box'), sdilet: y('.pz-actions'),
      cela: Math.round(document.body.scrollHeight), obrazovka: window.innerHeight,
    };
  });
  const je = (x) => x !== null && x !== undefined;

  /* 1) HLAVNÍ AKCE NAHOŘE ------------------------------------------- */
  pravda('hlavní akce je na stránce', je(m.akce) && je(m.hlavniBtn) && je(m.uloz),
    JSON.stringify({ akce: m.akce, btn: m.hlavniBtn, uloz: m.uloz }));
  pravda('odkaz na nabídku stojí hned za rozhodnutím, ne na konci stránky',
    je(m.akce) && je(m.verdikt) && m.akce > m.verdikt && m.akce < m.cela / 3,
    `akce na ${m.akce} px z ${m.cela} px (třetina je ${Math.round(m.cela / 3)})`);
  pravda('a „Uložit" je u něj, ne o tři obrazovky níž',
    je(m.uloz) && je(m.akce) && Math.abs(m.uloz - m.akce) < 120,
    `akce ${m.akce} px, Uložit ${m.uloz} px`);
  /* Dvě tlačítka, ne šest: zeď odkazů hned pod cenou je přesně to
     „přeplácané na sílu", kvůli kterému se stránka předělávala. */
  const kolikNahore = await p.evaluate(() =>
    document.querySelectorAll('.pz-akce-hlavni a, .pz-akce-hlavni button').length);
  pravda('a nahoře jsou nejvýš dvě tlačítka', kolikNahore <= 2, `je jich ${kolikNahore}`);

  /* 2) VAROVÁNÍ DŘÍV NEŽ ODCHOD ------------------------------------- */
  pravda('rádce „Co byste měli vědět" se čte dřív, než se odejde na inzerát',
    je(m.radce) && je(m.akce) && m.radce < m.akce,
    `rádce ${m.radce} px, akce ${m.akce} px`);

  /* 3) KDE TO JE, PATŘÍ K TOMU, CO TO JE ---------------------------- */
  /* Mez je 55 %, ne 50: mapa dnes začíná na 52 % (1 637 z 3 154 px),
     kdežto před předěláním na 68 % (2 543 z 3 748). Padesát procent by
     bylo hezčí číslo, ale lhalo by o tom, co se měří — jde o to, že se
     k mapě dojde, aniž se přejde celá stránka. */
  pravda('mapa je zhruba v první polovině stránky (do 55 %)',
    je(m.mapa) && m.mapa < m.cela * 0.55,
    `mapa na ${m.mapa} px z ${m.cela} px = ${Math.round(100 * m.mapa / m.cela)} %`);
  pravda('a až za parametry — napřed co to je, pak kde',
    je(m.mapa) && je(m.klice) && m.klice < m.mapa, `parametry ${m.klice}, mapa ${m.mapa}`);

  /* 4) NÁSTROJE AŽ POTOM -------------------------------------------- */
  /* Kalkulačka „Vyplatí se to?" je pryč na přání majitele. Byl to
     formulář, do kterého člověk hádal budoucí prodejní cenu — číslo,
     které web stejně neumí ověřit — a zabíral nejvíc místa ze všeho
     na stránce. Rozepsané náklady koupě zůstávají jako odkaz. */
  pravda('kalkulačka návratnosti na stránce není', !je(m.kalk),
    `našla se na ${m.kalk} px`);
  pravda('moje poznámka je u ostatních mých věcí, ne před prohlídkou',
    je(m.pozn) && je(m.mapa) && m.pozn > m.mapa, `poznámka ${m.pozn}, mapa ${m.mapa}`);
  pravda('a sdílení s katastrem až úplně na konci',
    je(m.sdilet) && je(m.pozn) && m.sdilet > m.pozn, `sdílení ${m.sdilet}, poznámka ${m.pozn}`);

  /* 5) A CELKEM SE TO ZKRÁTILO -------------------------------------- */
  /* Mez je volná schválně: text nabídek se mění a pevné číslo by
     padalo na cizích datech. 4,2 obrazovky je pořád o půl obrazovky
     méně než naměřených 4,7 před předěláním. */
  pravda('celá stránka se vejde do 4,2 obrazovky telefonu',
    m.cela <= m.obrazovka * 4.2,
    `${m.cela} px = ${(m.cela / m.obrazovka).toFixed(1)} obrazovky`);
  /* Co po kalkulačce zbylo a zůstat má: odkaz na rozepsané náklady
     koupě. Ten počítá z vlastní ceny pozemku, ne z hádání. */
  pravda('ale odkaz na rozepsané náklady koupě zůstal',
    await p.evaluate(() => !!document.querySelector('.pz-naklady a[href*="kolik-stoji-koupe"]')),
    'odkaz na náklady koupě se ztratil i s kalkulačkou');
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
