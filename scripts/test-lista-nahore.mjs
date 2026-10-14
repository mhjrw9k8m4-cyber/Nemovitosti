/* Test: horní lišta — terče 44 px a značka „tady jsi".
   ==================================================================
   Spuštění: node scripts/test-lista-nahore.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   DVA NÁLEZY, OBA NA KAŽDÉ STRÁNCE WEBU.

   1) TERČE MĚLY 22 PX. Naměřeno v okně 1440 px: „Můj profil" 63×22,
      „Hledat pozemek" 108×22, „Ceny pozemků" 100×22, „Kontakt" 51×22,
      „Moje" 45×22, položky rozbalovače 172×38. Mez drželo jediné
      tlačítko „Přidat pozemek" (146×44). Dvaadvacet pixelů je půlka
      meze 44 px, kterou si web drží jinde (scripts/test-dotyk.mjs),
      a je to pod 24 px, které žádá WCAG 2.2 bez ohledu na ukazatel.

   2) ZNAČKA „TADY JSI" FUNGOVALA NA JEDINÉ STRÁNCE. Podtržení aktivní
      položky se kreslilo jen tam, kde je položka označená třídou
      `active` — tedy na úvodní stránce. Dalších 108 stránek má
      `aria-current="page"`, a ten selektor nebral. Výsuvná nabídka na
      telefonu `aria-current` přitom zná, takže se telefon a monitor
      rozcházely.

   CO SE MĚŘÍ. Výška terčů v liště a v rozbalovači, a že se značka
   nakreslí u obou způsobů značení.
   ================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const MEZ = 44;
/* Stránky se liší způsobem značení: index má `active`, ostatní
   `aria-current`. Obě musí být vidět. */
const STRANKY = ['index.html', 'cena-pozemku.html', 'kontakt.html', 'muj-inzerat.html'];

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(spadlo) {
  console.log('\nHorní lišta');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Horní lišta: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
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
    viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  const male = [], bezZnacky = [];
  let polozekCelkem = 0, znacenychCelkem = 0;
  for (const stranka of STRANKY) {
    await p.goto(BASE + '/' + stranka, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    /* Rozbalovač se musí otevřít, jinak mají jeho položky nulovou
       výšku a kontrola by prošla na prázdnu. */
    const sum = await p.$('#nav-moje-sum');
    if (sum) { await sum.click(); await p.waitForTimeout(250); }
    const m = await p.evaluate(() => {
      const vidim = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
      const polozky = [...document.querySelectorAll('#nav > a, #nav .nav-moje > summary, #nav .nav-moje-panel a')]
        .filter(vidim)
        .map((e) => ({ t: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18),
          h: Math.round(e.getBoundingClientRect().height) }));
      const znaceny = [...document.querySelectorAll('#nav a')]
        .filter((a) => a.classList.contains('active') || a.getAttribute('aria-current') === 'page');
      return { polozky,
        znaceno: znaceny.length,
        sCarou: znaceny.filter((a) => getComputedStyle(a, '::after').content !== 'none').length,
        jak: znaceny.map((a) => a.classList.contains('active') ? 'active' : 'aria-current') };
    });
    polozekCelkem += m.polozky.length;
    for (const o of m.polozky) if (o.h < MEZ) male.push(`${stranka}: „${o.t}" ${o.h} px`);
    if (m.znaceno) {
      znacenychCelkem++;
      if (m.sCarou !== m.znaceno) bezZnacky.push(`${stranka}: označeno ${m.znaceno} (${m.jak.join(',')}), nakresleno ${m.sCarou}`);
    }
  }
  pravda('je co měřit — položky lišty i rozbalovače se našly',
    polozekCelkem >= 20, `našlo se ${polozekCelkem}`);
  pravda(`každá položka lišty má aspoň ${MEZ} px na výšku`,
    male.length === 0, male.slice(0, 8).join('\n      '));
  /* Past na kontrolu, která by platila jen proto, že se zkouší stránky
     bez označené položky. */
  pravda('a aspoň tři zkoušené stránky mají označenou aktuální položku',
    znacenychCelkem >= 3, `má ji ${znacenychCelkem} ze ${STRANKY.length}`);
  pravda('a značka „tady jsi" se nakreslí u obou způsobů značení',
    bezZnacky.length === 0, bezZnacky.join('\n      '));
  await ctx.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
