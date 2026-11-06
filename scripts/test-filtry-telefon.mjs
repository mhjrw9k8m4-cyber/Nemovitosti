/* Zkouška: najde člověk na telefonu filtry?
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-filtry-telefon.mjs
 * Volá ji .github/workflows/testy.yml (krok „Filtry jsou na telefonu
 * vidět a nestojí ani pixel navíc").
 *
 * PROČ TO VZNIKLO. Do 1040 px se celý blok `.ms-rozsirene` schovává
 * a objeví se až po klepnutí do pole hledání. Je to měřené rozhodnutí
 * (ušetří nad výpisem 365 px z 844) a zůstává — jenže se tím schoval
 * i JEDINÝ otvírač filtrů. Naměřeno v prohlížeči 6. 11.: `.msf-summary`
 * má na 320, 390 i 768 px velikost 0×0, zatímco na 1280 px 253×48.
 * Kdo neklepl do hledání, o filtrech se nedozvěděl — a klepnout do
 * hledání kvůli filtrům nikoho nenapadne. Je to táž vada, jakou mělo
 * „Pozemky v okolí" (viz index.html u `.map-okoli`).
 *
 * CO SE HLÍDÁ. Tři věci, a každá je jiná třída vady:
 *  1. ŽE JE TLAČÍTKO VIDĚT a má chytací plochu 44×44 pro prst.
 *  2. ŽE NESTOJÍ ANI PIXEL VÝŠKY. Sdílí řádek s přepínačem
 *     Seznam/Mapa. Kdyby se zalomilo pod něj, panel naroste
 *     ze 164 na 216 px (naměřeno) a úspora rozbalování se tím
 *     z velké části sní. Měří se VÝŠKA PANELU proti meznímu číslu,
 *     ne jen poloha tlačítka: vada je ta výška, poloha je jen její
 *     nejčastější příčina.
 *  3. ŽE TO OPRAVDU OTEVŘE FILTRY — a to až k POLÍM, ne jen
 *     k dalšímu zavřenému rozbalovači. Druhé klepnutí zavírá.
 *
 * A ŽE SE NA ŠIROKÉM DISPLEJI NEUKAZUJE: tam je panel otevřený pořád
 * a druhý otvírač by jen mátl.
 *
 * ČTE: index.html přes server zkoušek (scripts/falesna-supabase-chat.mjs).
 * NEPÍŠE NIC.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Filtry na telefonu', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* MEZNÍ VÝŠKY PANELU. Naměřeno 6. 11. se sdíleným řádkem; zalomení
   tlačítka pod přepínač přidá 52 px, takže mez je mezi tím. Je to
   mez, ne otisk: pár pixelů sem tam (jiné písmo v CI) nemá zkoušku
   shodit, zalomený řádek ano. */
const STROP_PANELU = { 320: 190, 390: 190, 768: 220 };

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

for (const [jmeno, w] of [['telefon 320', 320], ['telefon 390', 390], ['tablet 768', 768], ['stolní 1280', 1280]]) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: w, height: 844 }, isMobile: w < 700, hasTouch: w < 700 });
  await ctx.route('**/*', (r) => {
    const h = new URL(r.request().url()).hostname;
    return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort();
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.locator('.opp-item').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(400);

  const pred = await p.evaluate(() => {
    const b = document.getElementById('ms-filtr');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const mt = document.querySelector('.mv-toggle');
    const mr = mt ? mt.getBoundingClientRect() : null;
    const pan = document.querySelector('.map-controls-panel').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height),
      display: getComputedStyle(b).display,
      jmeno: (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim(),
      stejnyRadek: !!(mr && Math.abs(r.top - mr.top) < 8),
      vyskaPanelu: Math.round(pan.height) };
  });
  pravda(`${jmeno}: tlačítko filtrů je ve stránce`, pred !== null, 'prvek #ms-filtr vůbec není');
  if (!pred) { await ctx.close(); continue; }

  if (w <= 1040) {
    pravda(`${jmeno}: tlačítko filtrů je vidět a má plochu pro prst`,
      pred.display !== 'none' && pred.w >= 44 && pred.h >= 44,
      `display=${pred.display}, ${pred.w}×${pred.h} px`);
    pravda(`${jmeno}: má přístupné jméno`, /[Ff]iltr/.test(pred.jmeno), `jméno: „${pred.jmeno}"`);
    pravda(`${jmeno}: stojí na řádku s přepínačem Seznam/Mapa`, pred.stejnyRadek,
      'zalomilo se pod něj — panel tím naroste');
    pravda(`${jmeno}: panel nad výpisem nenarostl (${pred.vyskaPanelu} px)`,
      pred.vyskaPanelu <= STROP_PANELU[w],
      `${pred.vyskaPanelu} px proti meznímu ${STROP_PANELU[w]} px — úspora rozbalování se tím sní`);

    await p.locator('#ms-filtr').click();
    await p.waitForTimeout(450);
    const po = await p.evaluate(() => ({
      rozbaleno: document.body.classList.contains('hledani-rozbalene'),
      panelOtevreny: !!(document.getElementById('ms-filters') || {}).open,
      souhrnVidet: (document.querySelector('.msf-summary') || { getBoundingClientRect: () => ({ width: 0 }) })
        .getBoundingClientRect().width > 40,
      /* Nestačí, že se objevil rozbalovač — musí být vidět POLE. */
      poliVidet: [...document.querySelectorAll('.map-controls .mc-field')]
        .filter((e) => e.getBoundingClientRect().height > 0).length,
      aria: document.getElementById('ms-filtr').getAttribute('aria-expanded'),
    }));
    pravda(`${jmeno}: klepnutí ukáže panel filtrů`, po.rozbaleno && po.souhrnVidet,
      JSON.stringify(po));
    pravda(`${jmeno}: a rovnou i pole, ne další zavřený rozbalovač`,
      po.panelOtevreny && po.poliVidet >= 3, `otevřený=${po.panelOtevreny}, viditelných polí=${po.poliVidet}`);
    pravda(`${jmeno}: tlačítko ohlásí odečítači, že je rozbaleno`, po.aria === 'true', `aria-expanded=${po.aria}`);

    await p.locator('#ms-filtr').click();
    await p.waitForTimeout(400);
    const zpet = await p.evaluate(() => ({
      rozbaleno: document.body.classList.contains('hledani-rozbalene'),
      aria: document.getElementById('ms-filtr').getAttribute('aria-expanded') }));
    pravda(`${jmeno}: druhé klepnutí zase zavře`, !zpet.rozbaleno && zpet.aria === 'false',
      JSON.stringify(zpet));
  } else {
    pravda(`${jmeno}: tlačítko se neukazuje (panel je tam otevřený pořád)`,
      pred.display === 'none', `display=${pred.display}, ${pred.w}×${pred.h} px`);
    const souhrn = await p.evaluate(() =>
      Math.round((document.querySelector('.msf-summary') || { getBoundingClientRect: () => ({ width: 0 }) })
        .getBoundingClientRect().width));
    pravda(`${jmeno}: a vlastní otvírač panelu je vidět jako dřív`, souhrn > 40, `šířka souhrnu ${souhrn} px`);
  }
  await ctx.close();
}

await prohlizec.close();
console.log('\nFiltry jsou na telefonu vidět a nestojí ani pixel navíc');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Filtry na telefonu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
