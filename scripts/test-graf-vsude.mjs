// Test: křivka vývoje ceny vyjde na KAŽDÉM druhu stránky pozemku.
//
// Spuštění: node scripts/test-graf-vsude.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Majitel 29. 10.: „zajisti, aby graf
// fungoval za každé situace a aby nevypadla funkčnost." Otisk 140
// stránek tehdy ukázal, že to neplatí: ze 116 ŽIVÝCH nabídek mělo graf
// 114, ale ze 24 VYŘAZENÝCH ani jedna.
//
// Důvod nebyl v datech — vyřazená stránka si js/min/graf-cen.js stahuje
// stejně jako živá — ale v tom, KDO kartu staví. Živý detail staví
// js/pozemek.js a ten grafu nasazoval třídu „ma-graf". Vyřazená stránka
// detail nestaví: má statický článek z generátoru, a ten místo pro graf
// vůbec neměl. Spraveno dvojím zásahem: sekci do generátoru i do
// migrace už vzniklých stránek (scripts/generate-parcel-pages.mjs)
// a třídu si od té doby nasazuje kreslič sám (js/graf-cen.js).
//
// CO SE TU MĚŘÍ. Vzorek stránek napříč celým seznamem, rozdělený na
// živé a vyřazené. U obou se čeká, až se sekce dostane na dohled
// (statická stránka kreslí graf líně), a pak se ptá, jestli má třídu
// „ma-graf" — tedy jestli opravdu vznikla čára, ne jen prázdný rámeček.
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Graf všude', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* KOLIK STRÁNEK. Čtyřicet je kompromis: vzorek napříč abecedou zachytí
   oba druhy stránek i různé okresy, a běh zůstane pod dvěma minutami. */
const KOLIK = 40;
const vse = readdirSync(new URL('..', import.meta.url))
  .filter((x) => x.startsWith('pozemek-') && x.endsWith('.html'));
const krok = Math.max(1, Math.floor(vse.length / KOLIK));
const vzorek = [];
for (let i = 0; i < vse.length && vzorek.length < KOLIK; i += krok) vzorek.push(vse[i]);

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 390, height: 844 }, locale: 'cs-CZ', reducedMotion: 'reduce',
  isMobile: true, hasTouch: true });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') {
    return r.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  }
  return r.abort();
});
const p = await ctx.newPage();
let zive = 0, ziveGraf = 0, vyr = 0, vyrGraf = 0, nedojelo = 0;
const bez = [];
for (const u of vzorek) {
  const odp = await p.goto(BASE + '/' + u, { waitUntil: 'load' }).catch(() => null);
  if (!odp || !odp.ok()) { nedojelo++; continue; }
  await p.waitForTimeout(1500);
  /* Statická stránka kreslí graf až na dohled — doroluj k němu. */
  await p.evaluate(() => {
    const s = document.querySelector('.pz-vyvoj');
    if (s) s.scrollIntoView({ block: 'center' });
  }).catch(() => {});
  await p.waitForTimeout(1200);
  const v = await p.evaluate(() => {
    const s = document.querySelector('.pz-vyvoj');
    return {
      ma: !!(s && s.classList.contains('ma-graf')),
      vyrazena: /Nabídka už není aktuální/.test(document.body.textContent || ''),
      prazdna: !!document.querySelector('.pz-empty'),
    };
  }).catch(() => ({ ma: false, vyrazena: false, prazdna: false }));
  /* Stránka, které nabídka zmizela z dat A generátor jí nenechal
     statický článek, vypisuje „Pozemek nenalezen" a graf na ní nemá
     o čem být. Je to jedna stránka z 2 286 (změřeno 29. 10.) a je to
     vada generátoru, ne grafu — tahle zkouška ji tedy nepočítá, ale
     hlásí, kolik jich bylo, aby se jejich počet nemohl tiše zvednout. */
  if (v.prazdna) { nedojelo++; continue; }
  if (v.vyrazena) { vyr++; if (v.ma) vyrGraf++; else bez.push('vyřazená ' + u); }
  else { zive++; if (v.ma) ziveGraf++; else bez.push('živá ' + u); }
}
await prohlizec.close();

pravda(`vzorek je dost velký (${zive} živých, ${vyr} vyřazených)`,
  zive >= 10 && vyr >= 3,
  `živých ${zive}, vyřazených ${vyr} — na tomhle se nedá nic tvrdit`);
pravda(`graf vyšel na všech ŽIVÝCH nabídkách (${ziveGraf} z ${zive})`,
  zive > 0 && ziveGraf === zive, bez.filter((x) => x.startsWith('živá')).join('\n      '));
pravda(`graf vyšel i na všech VYŘAZENÝCH (${vyrGraf} z ${vyr})`,
  vyr > 0 && vyrGraf === vyr, bez.filter((x) => x.startsWith('vyřazená')).join('\n      '));
pravda(`stránek bez detailu je nejvýš jedna z ${vzorek.length}`,
  nedojelo <= 1, `takových stránek ${nedojelo} — generátor jim nenechal statický článek`);

console.log('\nGraf všude: křivka vývoje ceny na každém druhu stránky pozemku');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Graf všude: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
