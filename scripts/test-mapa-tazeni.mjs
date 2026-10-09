/* Test: při tažení mapy zmizí rozhraní a po puštění se vrátí.
   ==================================================================
   Spuštění: node scripts/test-mapa-tazeni.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ. Naměřeno na telefonu 390×844 v režimu mapy: mapa je vysoká
   625 px, ale skoro čtvrtinu její plochy překrývá rozhraní — pevná
   hlavička, legenda, nástroje a nápověda kraje. Ve chvíli, kdy člověk
   mapou táhne, nepotřebuje ani jedno: dívá se, kam jede.

   CO SE MĚŘÍ, A PROČ ZROVNA TAKHLE. Nestačí „má to třídu mapa-tazeni" —
   to by prošlo i tehdy, kdyby CSS nic neudělalo. Počítá se SKUTEČNĚ
   ZAKRYTÁ PLOCHA z vykreslených rozměrů, a průhledné prvky se do ní
   počítají podle své průhlednosti (prvek s opacity 0 nezakrývá nic).

   A měří se i stav PŘED tažením: kdyby rozhraní mapu nezakrývalo ani
   předtím, byla by nula během tažení bezcenná a test by procházel
   naprázdno.

   DVĚ VĚCI, KTERÉ SE NESMÍ POKAZIT:
     · Ovládání se MUSÍ vrátit. I bez události moveend — tu Leaflet při
       přerušeném gestu nemusí poslat. Na to je v js/main.js pojistka
       a zkouší se tady zvlášť.
     · Mapa NESMÍ změnit rozměr. Kdyby se schovávalo přes display:none
       nebo změnou výšky, musel by Leaflet uprostřed gesta přepočítat
       velikost a tažení by sebou trhlo.
   ================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nMapa při tažení');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Mapa při tažení: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  /* Telefon: tam se to zapíná (@media (hover:none)) a tam na tom záleží. */
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
    hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const chybyKonzole = [];
  p.on('pageerror', (e) => chybyKonzole.push(String(e)));

  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  /* Na telefonu je výchozí seznam; mapa je na jedno klepnutí vedle. */
  await p.evaluate(() => {
    for (const x of document.querySelectorAll('.mvt-btn')) if (/map/i.test(x.textContent)) x.click();
  });
  await p.waitForTimeout(1200);
  const jeMapa = await p.evaluate(() => {
    const m = document.getElementById('leaflet-map');
    if (!m) return false;
    m.scrollIntoView({ block: 'start' });
    return true;
  });
  pravda('mapa je na stránce a dá se na ni přepnout', jeMapa, '#leaflet-map se nenašel');
  if (!jeMapa) hotovo();
  await p.waitForTimeout(700);

  /* Zakrytá plocha mapy v procentech. Průhledný prvek nezakrývá. */
  const zakryti = () => p.evaluate(() => {
    const el = document.getElementById('leaflet-map');
    const mb = el.getBoundingClientRect();
    const vh = innerHeight;
    const plocha = mb.width * Math.max(0, Math.min(mb.bottom, vh) - Math.max(mb.top, 0));
    if (plocha <= 0) return { procent: null, rozmer: [Math.round(mb.width), Math.round(mb.height)] };
    let kryje = 0;
    for (const sel of ['header', '#map-legend', '.map-tools', '#kraj-hint']) {
      const e = document.querySelector(sel); if (!e) continue;
      const st = getComputedStyle(e);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const r = e.getBoundingClientRect();
      const pr = Math.max(0, Math.min(r.right, mb.right) - Math.max(r.left, mb.left))
               * Math.max(0, Math.min(r.bottom, Math.min(mb.bottom, vh)) - Math.max(r.top, Math.max(mb.top, 0)));
      kryje += pr * parseFloat(st.opacity || '1');
    }
    return { procent: +(kryje / plocha * 100).toFixed(1),
      rozmer: [Math.round(mb.width), Math.round(mb.height)] };
  });

  const pred = await zakryti();
  /* Bez tohohle by nula během tažení neznamenala nic. */
  pravda(`před tažením rozhraní mapu opravdu zakrývá (${pred.procent} %)`,
    pred.procent >= 10, `jen ${pred.procent} % — pak nemá co mizet a test by procházel naprázdno`);

  await p.evaluate(() => { if (window.PK_MAPA) window.PK_MAPA.fire('movestart'); });
  await p.waitForTimeout(450);
  const behem = await zakryti();
  pravda(`při tažení je mapa volná (${behem.procent} %)`, behem.procent <= 1,
    `pořád zakryto ${behem.procent} %`);

  /* Rozměr mapy se měnit nesmí — jinak by Leaflet musel uprostřed gesta
     přepočítat velikost. */
  pravda('a mapa přitom NEZMĚNILA rozměr',
    pred.rozmer[0] === behem.rozmer[0] && pred.rozmer[1] === behem.rozmer[1],
    `před ${pred.rozmer.join('×')}, při tažení ${behem.rozmer.join('×')}`);

  await p.evaluate(() => { if (window.PK_MAPA) window.PK_MAPA.fire('moveend'); });
  await p.waitForTimeout(600);
  const po = await zakryti();
  pravda(`po puštění je ovládání zpátky (${po.procent} %)`, po.procent >= 10,
    `zůstalo zakryto jen ${po.procent} % — ovládání se nevrátilo`);

  /* POJISTKA: Leaflet při přerušeném gestu moveend poslat nemusí.
     Ovládání se pak musí vrátit samo. */
  await p.evaluate(() => { if (window.PK_MAPA) window.PK_MAPA.fire('movestart'); });
  await p.waitForTimeout(400);
  const schovano = await zakryti();
  pravda('(mezikrok) po dalším movestart je zase schováno', schovano.procent <= 1,
    `${schovano.procent} %`);
  await p.waitForTimeout(2400);
  const samo = await zakryti();
  pravda('bez moveend se ovládání vrátí samo do dvou vteřin', samo.procent >= 10,
    `po 2,8 s pořád schováno (${samo.procent} %) — kdo přeruší gesto, přijde o ovládání`);

  pravda('a nic z toho nespadlo do konzole', chybyKonzole.length === 0,
    chybyKonzole.slice(0, 2).join(' | '));
  await ctx.close();

  /* NA POČÍTAČI SE TO DĚLAT NEMÁ: mapa je tam v kartě s okrajem, hlavička
     jí nic nebere a myš nikdo netáhne přes půl obrazovky. Blikalo by to
     bez užitku. */
  const ctx2 = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p2.waitForTimeout(2500);
  const predPc = await p2.evaluate(() => getComputedStyle(document.querySelector('header')).transform);
  await p2.evaluate(() => { if (window.PK_MAPA) window.PK_MAPA.fire('movestart'); });
  await p2.waitForTimeout(450);
  const behemPc = await p2.evaluate(() => getComputedStyle(document.querySelector('header')).transform);
  pravda('na počítači se hlavička při tažení neschovává', predPc === behemPc,
    `před "${predPc}", při tažení "${behemPc}"`);
  await ctx2.close();
} finally {
  await prohlizec.close();
}
hotovo();
