// Test: v řadě odznaků pod cenou smí mít barvu nejvýš JEDEN.
//
// Spuštění: node scripts/test-jedna-barva.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Majitel 29. 10. o řadě pod cenou na kartě:
// „udělej to profesionálněji, ale ať to pořád drží tu útulnost." Změřeno
// tehdy na 22 kartách úvodní stránky: tvar byl jednotný (sedm druhů
// odznaků, všechny 13 px / 600 / 4–8 px / 31 px vysoké), ale barva ne —
// na 6 z 22 karet se potkaly DVĚ plné plošky, typicky měděná „Dražba za
// 1 měs." vedle zelené „−45 % proti okolí". Dvě stejně hlasité barvy
// vedle sebe neřeknou, co je důležité.
//
// Pravidlo je od té doby v js/main.js (funkce jednaBarva): barvu si
// nechá jediný odznak s nejvyšším nárokem, ostatní dostanou .opp-tich.
//
// CO SE TU MĚŘÍ A PROČ ZROVNA TAKHLE. Ne přítomnost třídy .opp-tich —
// ta sama o sobě nic neznamená. Měří se VYPOČTENÁ barva podkladu
// každého odznaku, tedy to, co člověk opravdu uvidí. Tenhle rozdíl
// není teoretický: pravidlo .opp-chips > .opp-tich napoprvé stálo ve
// stylopisu NAD .opp-cd.soon, mělo stejnou váhu (0,2,0) — a prohrálo.
// Sedm odznaků mělo třídu .opp-tich a přesto zůstalo měděných. Zkouška,
// která by se ptala na třídu, by to odkývala.
//
// DRUHÁ POJISTKA: kdyby se ztišení rozbilo tak, že ztichne všechno,
// vyšla by první podmínka taky čistě (nula barevných je nejvýš jedna).
// Proto se zvlášť ptá, jestli na stránce vůbec nějaká barva zbyla.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Jedna barva v řadě odznaků', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 390, height: 844 }, locale: 'cs-CZ', reducedMotion: 'reduce',
  isMobile: true, hasTouch: true });
await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1'
  ? r.continue() : r.abort()));
const p = await ctx.newPage();
await p.goto(BASE + '/index.html', { waitUntil: 'load' });
await p.waitForSelector('.opp-list > li .opp-chips', { timeout: 20000 }).catch(() => null);
await p.waitForTimeout(1200);

const v = await p.evaluate(() => {
  /* Tichá plocha se nebere z konstanty opsané do zkoušky, ale ze
     stylopisu: vyrobíme si jeden odznak s .opp-tich a zeptáme se
     prohlížeče, jakou barvu dostal. Opsané rgba() by přestalo platit
     tiše v den, kdy se token --plocha-jemna pohne. */
  const rada = document.querySelector('.opp-chips');
  let ticho = null;
  if (rada) {
    const vzorek = document.createElement('span');
    vzorek.className = 'opp-tich';
    rada.appendChild(vzorek);
    ticho = getComputedStyle(vzorek).backgroundColor;
    vzorek.remove();
  }
  const hrisnici = []; let karet = 0, barevnych = 0, odznaku = 0;
  const tvary = new Set();
  for (const li of document.querySelectorAll('.opp-list > li')) {
    const r = li.querySelector('.opp-chips');
    if (!r || !r.children.length) continue;
    karet++;
    let n = 0; const jmena = [];
    for (const e of r.children) {
      odznaku++;
      const c = getComputedStyle(e);
      tvary.add(c.fontSize + '/' + c.fontWeight + '/' + c.paddingTop + ' ' + c.paddingLeft + '/' + c.borderRadius);
      if (c.backgroundColor !== ticho) { n++; jmena.push(e.textContent.trim()); }
    }
    barevnych += n;
    if (n > 1) hrisnici.push(jmena.join(' + '));
  }
  return { ticho, karet, odznaku, barevnych, hrisnici, tvary: [...tvary] };
});
await prohlizec.close();

pravda(`vzorek je dost velký (${v.karet} karet, ${v.odznaku} odznaků)`,
  v.karet >= 10 && v.odznaku >= 15,
  `karet ${v.karet}, odznaků ${v.odznaku} — na tomhle se nedá nic tvrdit`);
pravda('tichá plocha se dá z odznaku přečíst',
  !!v.ticho && v.ticho !== 'rgba(0, 0, 0, 0)',
  `.opp-tich nemá žádný podklad (${v.ticho}) — pravidlo ve stylopisu asi zmizelo`);
pravda(`žádná karta nemá dva barevné odznaky (${v.hrisnici.length} z ${v.karet})`,
  v.hrisnici.length === 0,
  v.hrisnici.slice(0, 6).join('\n      '));
pravda(`barva na stránce zůstala (${v.barevnych} barevných odznaků)`,
  v.barevnych > 0,
  'ztichlo úplně všechno — pravidlo přestřelilo a karty nemají žádný signál');
pravda(`odznaky mají jeden tvar (${v.tvary.length} recept${v.tvary.length === 1 ? '' : 'y'})`,
  v.tvary.length === 1, v.tvary.join('\n      '));

console.log('\nJedna barva: řada odznaků pod cenou na kartě');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Jedna barva v řadě odznaků: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
