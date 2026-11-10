/* Test: šipka zpět nad otevřenou vrstvou zavírá, neodchází ze stránky.
   ==================================================================
   Spuštění: node scripts/test-zpet.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   CO SE STALO. „Když dávám šipku z mapy pryč, hodí mě to na předchozí
   stránku úplně." Na mapě se otevíralo šest celoobrazovkových vrstev
   (výběr místa, rychlý výběr, stahování tabulky, rozsah ceny i výměry,
   „kde hledat", zdroje dat) a ani jedna nedělala záznam v historii.
   DNES JICH JE PĚT: vrstvu rozsahu ceny a výměry majitel 29. 10.
   zrušil („nechápu, proč mě to hází na tuhle stránku"), políčka od–do
   jsou rovnou v panelu filtrů a žádnou obrazovku neotevírají — není
   tedy co zavírat a zkouška na ni přestala sahat (do té doby hledala
   `.mcs-btn`, který už v HTML není, a padala na null).
   Systémová šipka zpět tedy neměla co zavřít a odvedla člověka z celé
   index.html — i s výřezem mapy, filtry a kresbou, které si nastavil.

   Změřeno před opravou: u všech vrstev history.length 3 → 3 a po šipce
   zpět /kontakt.html.

   PROČ TO NEJDE ODCHYTIT AŽ PŘI ZPĚT: krok z index.html na předchozí
   dokument je přechod mezi stránkami a popstate se při něm nezavolá.
   Záznam musí vzniknout už při otevření vrstvy.

   CO SE TU NEMĚŘÍ: šestá vrstva „kde hledat" (.loc-ov). Je napojená
   stejně jako ostatní, ale otevře se jedině tehdy, když se nenačte
   Leaflet A zároveň selže určení polohy — to je stav, ve kterém se
   rozpadá celá mapa a zkouška by měřila spíš ten rozpad než historii.
   Napřímo se tedy nehlídá; počítá se s tím.

   Hlídají se OBĚ strany, protože každá sama by šla splnit špatně:
     1. šipka zpět vrstvu zavře a člověk zůstane na mapě,
     2. zavření vlastním křížkem ten záznam zase spotřebuje — jinak by
        příští šipka zpět nezavřela nic a vypadala by zaseknutě.
   ================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Šipka zpět', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
  return !!vyslo;
}
function hotovo(spadlo) {
  console.log('\nŠipka zpět nad otevřenou vrstvou');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 10)) {
      console.log('::error::Šipka zpět: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
    }
    console.log('::error::Šipka zpět: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}

/* Vrstvy se otevírají přes .click() v evaluate, ne přes Playwright:
   některé ovládání leží pod jiným prvkem nebo mimo výřez a zkouška by
   místo srozumitelné hlášky spadla na třicetisekundový timeout. */
const VRSTVY = [
  ['výběr místa', '.vm-ov', () => document.getElementById('map-near').click(),
    () => document.querySelector('.vm-ov .vm-x').click()],
  ['rychlý výběr', '#rv-vrstva', () => document.getElementById('mc-rychly').click(),
    () => document.getElementById('rv-zavrit').click()],
  ['stahování tabulky', '#vyv-vrstva', () => document.getElementById('mc-vyvoz').click(),
    () => document.getElementById('vyv-zrus').click()],
  ['zdroje dat', '#info-modal', () => document.querySelector('[data-info]').click(),
    () => document.querySelector('#info-modal [data-close]').click()],
];

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
try {
  const chybyJs = [];
  /* KAŽDÁ VRSTVA DOSTANE ČISTOU HISTORII. Vracet se mezi pokusy přes
     goto() by historii nafukovalo — šipka zpět by pak místo na Kontakt
     odcházela na předchozí index.html a kontrola „odejde ze stránky" by
     měřila vlastní navigaci zkoušky, ne web. */
  let ctx = null, p = null;
  const cerstvaMapa = async () => {
    if (ctx) await ctx.close();
    ctx = await prohlizec.newContext({ bypassCSP: true, 
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      serviceWorkers: 'block', locale: 'cs-CZ',
    });
    await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
      body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
    p = await ctx.newPage();
    p.on('pageerror', (e) => chybyJs.push(String(e)));
    /* Napřed JINÁ stránka, ať je kam vyhodit. Bez ní by byla historie
       prázdná, šipka zpět by nemohla nikam odejít a zkouška by potvrzovala
       něco, co platí samo od sebe. */
    await p.goto(`${BASE}/kontakt.html`, { waitUntil: 'load' });
    await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await p.waitForSelector('#map-search', { timeout: 20000 });
    await p.waitForTimeout(3500);
  };
  await cerstvaMapa();
  const kde = () => p.evaluate(() => location.pathname);
  const vidno = (sel) => p.evaluate((s) => {
    const e = document.querySelector(s);
    return !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  }, sel);

  pravda('v historii je kam odejít', await p.evaluate(() => history.length) >= 2,
    'bez předchozí stránky by zkouška neměřila nic');

  for (const [jmeno, sel, otevri, zavri] of VRSTVY) {
    let padlo = null;
    try { await p.evaluate(otevri); } catch (e) { padlo = String(e).split('\n')[0]; }
    await p.waitForTimeout(800);
    if (!pravda(`${jmeno}: vrstva se otevřela (jinak kontroly níž neměří nic)`,
      !padlo && await vidno(sel), padlo || `${sel} není vidět`)) { await cerstvaMapa(); continue; }

    /* 1) ŠIPKA ZPĚT ZAVÍRÁ, NEODCHÁZÍ. */
    await p.goBack({ timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(900);
    const kdeJsme = await kde();
    pravda(`${jmeno}: po šipce zpět zůstáváme na mapě`, kdeJsme === '/index.html',
      `skončili jsme na ${kdeJsme}`);
    if (kdeJsme !== '/index.html') { await cerstvaMapa(); continue; }
    pravda(`${jmeno}: a vrstva je zavřená`, !(await vidno(sel)), `${sel} je pořád vidět`);

    /* 2) KŘÍŽEK TEN ZÁZNAM SPOTŘEBUJE. Kdyby v historii zůstal ležet,
       příští šipka zpět by nezavřela nic a vypadala by zaseknutě. */
    try { await p.evaluate(otevri); } catch (e) {}
    await p.waitForTimeout(800);
    if (await vidno(sel)) {
      try { await p.evaluate(zavri); } catch (e) {}
      await p.waitForTimeout(900);
      pravda(`${jmeno}: vlastní zavření vrstvu zavře`, !(await vidno(sel)), `${sel} je pořád vidět`);
      await p.goBack({ timeout: 10000 }).catch(() => {});
      await p.waitForTimeout(900);
      const po = await kde();
      pravda(`${jmeno}: a šipka zpět pak odejde ze stránky (záznam se spotřeboval)`,
        po !== '/index.html',
        'zůstali jsme na mapě — v historii leží záznam navíc a šipka zpět nezavřela nic');
      await cerstvaMapa();
    } else {
      pravda(`${jmeno}: vlastní zavření vrstvu zavře`, false, 'vrstva se podruhé neotevřela');
      await cerstvaMapa();
    }
  }

  /* STAV MAPY MUSÍ PŘEŽÍT. Kvůli němu to celé je: kdo si nastavil výřez,
     nesmí o něj přijít tím, že zavřel vrstvu.

     ČEKÁ SE NA STAV, NE NA ČAS — A NEJDŘÍV MUSÍ BÝT CO ZAPISOVAT.
     Mapa si výřez zapisuje do adresy, až když se usadí. Dřív se tu jen
     čekalo 700 ms po klepnutí; na běžci CI (1108) to nestačilo
     a kontrola hlásila `hash: „"`, tedy vadu webu tam, kde bylo jen
     pomalejší železo. Samotné čekání na adresu ale nestačilo taky
     (CI 1110 hlásilo prázdný hash znovu): poslední krok smyčky výš
     načte stránku ZNOVU, a dokud se mapa nepostaví, nemá kdo do
     adresy psát. Čeká se proto na hotovou mapu (PK_MAPA_HOTOVA), pak
     se mapou pohne o pixel — pohyb je to, co zápis spouští — a teprve
     pak se čeká na adresu. Zapisuje pořád web, ne zkouška; když to
     nezvládne, čekání vyprší a kontrola spadne stejně jako dřív. */
  await p.waitForFunction(() => window.PK_MAPA_HOTOVA === true, null, { timeout: 25000 })
    .catch(() => {});
  await p.evaluate(() => { try { window.PK_MAPA && window.PK_MAPA.panBy([1, 1]); } catch (e) {} });
  await p.waitForFunction(() => /m=/.test(location.hash), null, { timeout: 20000 })
    .catch(() => {});
  await p.evaluate(() => document.getElementById('mc-vyvoz').click());
  await p.waitForTimeout(700);
  const pred = await p.evaluate(() => location.hash);
  await p.goBack({ timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(900);
  const poHash = await p.evaluate(() => location.hash);
  pravda('v adrese je stav mapy (jinak kontrola níž neměří nic)', /m=/.test(pred), `hash: „${pred}"`);
  /* POROVNÁVÁ SE VÝŘEZ, NE ŘETĚZEC.
     Od 10. 11. si mapa zapisuje polohu do adresy sama po každém posunu
     (viz js/main.js, map.on('moveend zoomend', zapisAdresu)). Po návratu
     se tedy stav z adresy nejdřív dosadí do mapy a mapa pak zapíše
     polohu, na které SKUTEČNĚ stojí — a ta se o kousek liší, protože
     Leaflet počítá střed z celých pixelů. Naměřeno: 49.82558,15.51270
     proti 49.82735,15.50995, tedy 0,0018° šířky a 0,0027° délky. Při
     přiblížení 9 je jeden pixel asi 305 m, takže je to míň než pixel —
     na obrazovce totéž místo.
     Mez 0,01° (asi 1 km, tedy zhruba tři pixely) je proto na shodu
     měkká, ale na vadu tvrdá: kvůli čemu to celé je — návrat na výchozí
     pohled na celou republiku — je o stupně vedle a má jiné přiblížení,
     a prázdný nebo chybějící výřez neprojde vůbec.
     Prokázáno sabotáží: do obsluhy popstate (tam, kde se vrstva zavírá)
     se přidalo `map.setView([49.8, 15.5], 7)` a kontrola se ozvala —
     „před „#m=49.82558,15.51270,9", po „#m=49.80000,15.50000,7"". */
  const vyrezZHashe = (h) => {
    const m = /(^|[#&])m=([^&]*)/.exec(String(h || ''));
    if (!m) return null;
    const k = m[2].split(',');
    const o = { lat: Number(k[0]), lng: Number(k[1]), z: Number(k[2]) };
    return (isFinite(o.lat) && isFinite(o.lng)) ? o : null;
  };
  const vPred = vyrezZHashe(pred), vPo = vyrezZHashe(poHash);
  const tyzVyrez = !!vPred && !!vPo && vPred.z === vPo.z
    && Math.abs(vPred.lat - vPo.lat) < 0.01 && Math.abs(vPred.lng - vPo.lng) < 0.01;
  pravda('a zavřením vrstvy se stav mapy neztratí', tyzVyrez,
    `před „${pred}", po „${poHash}"`);

  pravda('a nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.slice(0, 2).join(' | '));
  if (ctx) await ctx.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
