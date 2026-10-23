// Test: křížek „tenhle mě nezajímá" je na kartě doopravdy VIDĚT.
//
// Spuštění: node scripts/test-skryt-videt.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ. Uvnitř .opp-media má letecký náhled z-index 1 a záložka pro
// uložení 3. Křížek na skrytí neměl žádný, takže se kreslil POD snímkem:
// na kartě po něm nebylo ani památky. A protože snímek má
// pointer-events:none, klepnutí jím propadlo na tlačítko — neviditelná,
// ale funkční ničivá akce, do které se dalo trefit poslepu.
//
// Druhá polovina téže vady: znak ✕ byl holý textový uzel, takže pravidlo
// „.opp-skryt > *{position:relative}" na něj neplatilo a bílý kroužek
// z ::before se kreslil PŘES něj. Po opravě z-indexu byl tedy na kartě
// bílý puntík — a nic v něm.
//
// JAK SE TO MĚŘÍ. Ne atributy: prvek měl celou dobu opacity 1, rozměr
// 44×44 a elementFromPoint ho hlásil jako nejvrchnější. Všechno
// „v pořádku", a vidět nebyl. Měří se proto OBRAZ: vyfotí se plocha
// tlačítka, pak se tlačítko (nebo jen jeho znak) schová a vyfotí znovu.
// Když jsou oba snímky bajt na bajt stejné, nekreslí se nic.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { naSeznam } from './zkouska-pohled.mjs';
import { hlasPad } from './zkouska-pad.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Křížek na skrytí', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nKřížek na skrytí je vidět');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Křížek na skrytí: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  /* DOTYK ZAPNUTÝ: bez něj se při 390 px vykreslí rozvržení pro monitor,
     kde je křížek schválně schovaný až do najetí myší (CLAUDE.md). */
  const ctx = await prohlizec.newContext({ bypassCSP: true, 
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    locale: 'cs-CZ', serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  /* POHLED SE ŽÁDÁ JMÉNEM, AŤ JE VÝCHOZÍ KTERÝKOLI. Úvodní stránka má na
     telefonu dva pohledy nad sebou a vidět je jen jeden; výchozí se za dva
     dny obrátil dvakrát (17. 10. na mapu, 18. 10. zpátky na seznam). Co tahle
     zkouška měří, žije ve VÝPISU — tohle přepnutí je proto pojistka, ne
     reakce na jednu konkrétní podobu webu. */
  await naSeznam(p);
  await p.waitForSelector('#opp-list .opp-item .opp-skryt', { timeout: 30000 });
  await p.waitForTimeout(1500);

  const btn = p.locator('#opp-list .opp-item .opp-skryt').first();
  const r = await btn.boundingBox();
  pravda('křížek na kartě vůbec je', !!r && r.width >= 24 && r.height >= 24,
    r ? `má ${Math.round(r.width)}×${Math.round(r.height)} px` : 'nenašel se');

  if (r) {
    /* Fotí se o dva pixely kolem dokola míň, ať se do výřezu nedostane
       okraj sousedního prvku a rozdíl nevznikl z něj. */
    const vyrez = { x: Math.round(r.x) + 2, y: Math.round(r.y) + 2,
      width: Math.round(r.width) - 4, height: Math.round(r.height) - 4 };
    const sKrizkem = await p.screenshot({ clip: vyrez });

    await p.evaluate(() => {
      document.querySelector('#opp-list .opp-item .opp-skryt').style.visibility = 'hidden';
    });
    const bezKrizku = await p.screenshot({ clip: vyrez });
    pravda('a je na tom místě opravdu vykreslený (ne pod snímkem)',
      !sKrizkem.equals(bezKrizku),
      'snímek té plochy je s tlačítkem i bez něj bajt na bajt stejný — tlačítko se nekreslí');

    /* A teď jen jeho ZNAK: kroužek kreslí ::before jako absolutně
       umístěný prvek a bez position:relative na obsahu ho překryje. */
    await p.evaluate(() => {
      const b = document.querySelector('#opp-list .opp-item .opp-skryt');
      b.style.visibility = '';
      const s = b.querySelector('span');
      if (s) s.style.visibility = 'hidden';
    });
    const bezZnaku = await p.screenshot({ clip: vyrez });
    pravda('a znak ✕ v něm je vidět taky, ne schovaný pod kroužkem',
      !sKrizkem.equals(bezZnaku),
      's znakem i bez něj vypadá tlačítko stejně — kroužek se kreslí přes něj');
  }
  await ctx.close();
} catch (e) {
  chyb++;
  zpravy.push('  ✕ test spadl: ' + (e && e.message ? e.message : e));
}
await prohlizec.close();
hotovo();
