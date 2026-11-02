/* Test: klíč k mapě na telefonu patří k mapě, ne mezi ni a další oddíl.
   ===================================================================
   Spuštění: node scripts/test-legenda-mapy.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ VZNIKL. Majitel 2. 11. zakroužkoval na fotce pás mezi mapou
   a nadpisem „Tipy na dobrou koupi": „tu část, která je označená,
   musíš spojit a předělat designově."

   CO SE NAMĚŘILO na 390 px — tři věci, a ani jedna neplyne z druhé:
     1) Legenda měla vnitřní odsazení 12 px, takže její text začínal
        na x=12, zatímco celý zbytek stránky stojí na x=20. Osm
        pixelů oko nepojmenuje, ale vidí, že pruh nikam nepatří.
     2) Čtyři klíče se ve flex-wrapu nevešly na řádek a „končí do
        14 dní" zůstávalo samo na druhém — rozhárané zalomení.
     3) Bílá plocha karty neměla konec: prostě přestala a začala šedá.

   CO SE MĚŘÍ TEĎ. Že klíč stojí na témž svislém okraji jako nadpis
   oddílu pod ním (to je to „spojit" — společný sloupec stránky), že
   je zarovnaný do dvou sloupců místo rozhárané řady, a že karta má
   spodní hranu. A na monitoru, že se nic z toho nepokazilo: tam byl
   klíč vždycky na jednom řádku uvnitř karty a má tak zůstat.

   POZOR NA POHLED. Úvodní stránka má na telefonu Seznam a Mapu nad
   sebou; výchozí je Seznam, kde je legenda 0 × 0. Pohled se proto
   žádá jménem (scripts/zkouska-pohled.mjs).
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
hlasPad('Legenda mapy', zpravy, () => chyb);

await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});

async function zmer(sirka) {
  const ctx = await prohlizec.newContext({ bypassCSP: true,
    viewport: { width: sirka, height: 900 }, isMobile: sirka < 500, hasTouch: sirka < 500,
    locale: 'cs-CZ', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await naPohled(p, 'mapa');
  await p.waitForTimeout(2500);
  const v = await p.evaluate(() => {
    const leg = document.querySelector('#map-legend');
    const nadpis = document.querySelector('#vyhodne .section-head h2');
    if (!leg || !nadpis) return { chyba: `legenda=${!!leg} nadpis=${!!nadpis}` };
    const polozky = [].slice.call(leg.querySelectorAll('.lg-item'));
    const r = leg.getBoundingClientRect();
    const s = getComputedStyle(leg);
    const sloupceX = [...new Set(polozky.map((e) => Math.round(e.getBoundingClientRect().left)))];
    const radkyY = [...new Set(polozky.map((e) => Math.round(e.getBoundingClientRect().top)))];
    const popisek = leg.querySelector('.lg-nadpis');
    return {
      pocet: polozky.length,
      vidno: r.width > 0 && r.height > 0,
      vyska: Math.round(r.height),
      /* Levý okraj TEXTU, ne rámečku: pruh je na telefonu přes celou
         šířku, takže rámeček je vždycky na nule a neřekl by nic. */
      textX: popisek ? Math.round(popisek.getBoundingClientRect().left) : -1,
      prvniKlicX: polozky.length ? Math.round(polozky[0].getBoundingClientRect().left) : -1,
      nadpisX: Math.round(nadpis.getBoundingClientRect().left),
      sloupcu: sloupceX.length,
      radku: radkyY.length,
      spodniHrana: s.borderBottomWidth,
    };
  });
  await ctx.close();
  return v;
}

// --- TELEFON ---------------------------------------------------------
const t = await zmer(390);
if (t.chyba) {
  pravda('na telefonu je co měřit (legenda i nadpis oddílu pod ní)', false, t.chyba);
} else {
  /* Bez tohohle by všechno níž „prošlo" nad prázdnou legendou. */
  pravda(`na telefonu je co měřit — ${t.pocet} klíčů a legenda je vidět`,
    t.pocet >= 3 && t.vidno, JSON.stringify(t));
  pravda('klíč stojí na témž svislém okraji jako nadpis oddílu pod ním',
    Math.abs(t.textX - t.nadpisX) <= 1 && Math.abs(t.prvniKlicX - t.nadpisX) <= 1,
    `popisek x=${t.textX}, první klíč x=${t.prvniKlicX}, nadpis x=${t.nadpisX}`);
  pravda('klíče jsou srovnané do dvou sloupců, ne rozhárané do řady',
    t.sloupcu === 2, `sloupců ${t.sloupcu}, řádků ${t.radku}`);
  /* Dva sloupce samy o sobě nestačí: kdyby se do nich vešly jen dvě
     položky a zbytek přetekl, bylo by to zase rozhárané. */
  pravda('a vejdou se do dvou řádků', t.radku === 2, `řádků ${t.radku}`);
  pravda('bílá karta má na telefonu spodní hranu (klíč je její patka)',
    parseFloat(t.spodniHrana) >= 1, `spodní hrana „${t.spodniHrana}"`);
}

// --- MONITOR: co bylo v pořádku, musí zůstat -------------------------
const m = await zmer(1280);
if (m.chyba) {
  pravda('na monitoru je co měřit', false, m.chyba);
} else {
  pravda(`na monitoru je co měřit — ${m.pocet} klíčů`, m.pocet >= 3, JSON.stringify(m));
  pravda('na monitoru zůstal klíč na JEDNOM řádku uvnitř karty',
    m.radku === 1, `řádků ${m.radku}, sloupců ${m.sloupcu}`);
}

await prohlizec.close();
console.log('\nKlíč k mapě (legenda)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Legenda mapy: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
