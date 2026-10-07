/* Test: start mapy nesmí být jedna dlouhá úloha.
   ==================================================================
   Spuštění: node scripts/test-plynulost.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   CO SE MĚŘÍ A PROČ. „Zasekávání webu při přechodu z mapy na inzerát
   nebo profil." Dokud prohlížeč počítá jednu úlohu, nepřekreslí ani
   neodpoví na dotek — a celý start mapy běžel v jedné. Změřeno na
   telefonu 390×844 se čtyřikrát zpomaleným procesorem (pozorovatel
   long-animation-frame): nejdelší úloha 1 763 ms. Cílové stránky
   přitom byly v pořádku (pozemek 252, profil 271, hlídání 284 ms) —
   zasekávala se MAPA, a protože se na ni člověk vrací pokaždé, když
   zavře inzerát, působilo to jako zadrhnutí „při přechodu".

   Start se proto dělí: boot() je asynchronní a dvakrát se v ní čeká
   (dechni()), skóre pro řazení se počítá předem po dávkách. Z jedné
   úlohy jsou tři: naměřeno 758 / 576 / 573 ms.

   PROČ POMĚR A NE PEVNÉ ČÍSLO. Pevná mez v milisekundách měří stroj,
   na kterém zkouška zrovna běží — v CI by padala podle toho, jak je
   servrovna vytížená. Poměr „nejdelší úloha ku všemu zablokovanému
   času" je proti tomu bezrozměrný: když se práce rozpadne na tři
   podobné díly, vyjde kolem třetiny; když se slije zpátky do jedné,
   blíží se jedné. Naměřeno před opravou 0,66, po ní 0,28.

   POJISTKA PROTI PROCHÁZENÍ NAPRÁZDNO: na nesmyslně rychlém stroji by
   nebylo co dělit, a poměr by nic neznamenal. Kontrola se proto pouští
   teprve tehdy, když je vůbec co měřit.
   ================================================================== */
import { chromium } from 'playwright-core';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
  return !!vyslo;
}
function hotovo(spadlo) {
  console.log('\nPlynulost startu mapy');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0)) {
      console.log('::error::Plynulost: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
    }
    console.log('::error::Plynulost: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.');
    process.exit(1);
  }
  process.exit(0);
}

/* Mez poměru. Naměřeno 0,28 po rozdělení a 0,66 před ním — 0,45 je
   mezi tím s rezervou na obě strany. */
const MEZ_POMER = 0.45;
/* Pod touhle hranicí se nedělí nic, co by stálo za řeč. */
const DOST_PRACE = 300;

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'cs-CZ',
  });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  /* Telefon je pomalejší než stroj, na kterém zkouška běží. Bez zpomalení
     by se zaseknutí, které člověk na iPhonu vidí, nemuselo projevit. */
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.addInitScript(() => {
    window.__ramce = [];
    window.__umi = false;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__ramce.push({ d: e.duration, blok: e.blockingDuration || 0 });
        }
      }).observe({ type: 'long-animation-frame', buffered: true });
      window.__umi = true;
    } catch (e) {}
  });
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForSelector('#map-search', { timeout: 30000 });
  /* Až po vykreslení výpisu — to je poslední velký kus startu. */
  await p.waitForSelector('.opp-item', { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(9000);

  const v = await p.evaluate(() => {
    const r = window.__ramce || [];
    const blok = r.reduce((a, x) => a + x.blok, 0);
    const nej = r.reduce((a, x) => Math.max(a, x.d), 0);
    const nejBlok = r.reduce((a, x) => Math.max(a, x.blok), 0);
    return { umi: window.__umi, ramcu: r.length, blok: Math.round(blok),
      nej: Math.round(nej), nejBlok: Math.round(nejBlok),
      dlouhych: r.filter((x) => x.d >= 50).length,
      karet: document.querySelectorAll('.opp-item').length };
  });

  if (!pravda('prohlížeč umí hlásit dlouhé rámce', v.umi,
    'bez long-animation-frame zkouška nic nezměří')) { await ctx.close(); hotovo(); }
  pravda(`výpis se vykreslil (${v.karet} karet)`, v.karet > 0,
    'na prázdné stránce není co měřit');
  pravda(`je co dělit (zablokováno ${v.blok} ms)`, v.blok >= DOST_PRACE,
    `jen ${v.blok} ms — na tomhle stroji se start nestihne zaseknout, kontroly níž by prošly naprázdno`);
  if (v.blok < DOST_PRACE) { await ctx.close(); hotovo(); }

  pravda(`start se dělí na víc úloh (dlouhých rámců ${v.dlouhych})`, v.dlouhych >= 3,
    'všechno se počítá najednou — prohlížeč mezitím nepřekreslí ani nepřijme dotek');
  const pomer = v.nejBlok / v.blok;
  pravda(`a žádná z nich nepobere většinu práce (nejdelší ${v.nejBlok} ms z ${v.blok} ms, poměr ${pomer.toFixed(2)})`,
    pomer <= MEZ_POMER,
    `poměr ${pomer.toFixed(2)} nad mezí ${MEZ_POMER} — start se slil zpátky do jedné dlouhé úlohy`);

  pravda('a nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.slice(0, 2).join(' | '));
  await ctx.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
