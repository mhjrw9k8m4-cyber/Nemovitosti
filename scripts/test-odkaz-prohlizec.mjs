/* Test: sdílený odkaz na stav mapy opravdu ukáže totéž (js/odkaz.js).
 *
 * Spuštění: node scripts/test-odkaz-prohlizec.mjs
 *
 * Skládání adresy hlídá scripts/test-odkaz.mjs. Tady jde o to jediné,
 * na čem člověku záleží: NASTAVÍM FILTRY, POŠLU ADRESU, A PŘÍJEMCE VIDÍ
 * TOTÉŽ. Mezi tím leží celý web — ovladače, překreslení, mapa — a každý
 * z těch kroků se dá rozbít tak, že adresa pořád „funguje", jen ukazuje
 * něco jiného. To je tichá chyba: nikdo si jí nevšimne, protože obě
 * strany vidí věrohodný výpis, jen pokaždé jiný.
 */
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');

const BASE = 'http://127.0.0.1:8310';
let chyb = 0; const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { zpravy.push('  ✓ ' + popis); return true; }
  chyb++; zpravy.push('  ✕ ' + popis + (detail ? '\n      ' + detail : ''));
  return false;
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });

/* Co je na obrazovce vidět. Počet z hlavičky i prvních pár nabídek —
   samotný počet by sedl i u úplně jiného výběru stejné velikosti. */
const COJEVIDET = () => {
  const e = document.querySelector('#map-count');
  const m = e ? /(\d[\d\s ]*)\s*na mapě/.exec(e.textContent || '') : null;
  return {
    naMape: m ? Number(m[1].replace(/[\s ]/g, '')) : null,
    prvni: [...document.querySelectorAll('.opp-item')].slice(0, 6)
      .map((li) => (li.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70)),
  };
};
const pockej = async (p) => {
  await p.waitForSelector('.opp-item', { timeout: 25000 }).catch(() => {});
  await p.waitForFunction(() => {
    const e = document.querySelector('#map-count');
    return e && /\d[\d\s ]*\s*na mapě/.test(e.textContent || '');
  }, null, { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(1200);
};

const p = await ctx.newPage();
await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await pockej(p);

const vychozi = await p.evaluate(COJEVIDET);
pravda('mapa se načetla a něco ukazuje', (vychozi.naMape || 0) > 100, JSON.stringify(vychozi.naMape));
pravda('a modul na adresy je na stránce',
  (await p.evaluate(() => typeof window.PKOdkaz)) === 'object', 'window.PKOdkaz chybí');

/* --- nastavíme filtry tak, jak to udělá člověk ---------------------- */
await p.click('[data-type="exekuce"]').catch(() => {});
await p.waitForTimeout(400);
// Cena do: je to číselné pole, ne rozbalovátko.
await p.evaluate(() => {
  const el = document.getElementById('map-cena');
  if (el) { el.value = '900000'; el.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(500);
/* ŘAZENÍ SE MUSÍ NASTAVIT NAPEVNO. Výchozí „Doporučené" schválně
   obsahuje náhodné přihození na každou návštěvu (prihozeniSeance()
   v js/poradi.js), takže dvě různé návštěvy vidí jiné pořadí — a je to
   tak správně. Porovnávat pořadí by pod ním neznamenalo nic. Navíc se
   tím zkouší, že se řazení vůbec sdílí; dřív se nesdílelo. */
await p.evaluate(() => {
  const el = document.getElementById('map-sort');
  if (el) { el.value = 'price_asc'; el.dispatchEvent(new Event('change', { bubbles: true })); }
});
await p.waitForTimeout(600);
/* Rozbalovátko krajů (#map-kraj) v index.html DNES NENÍ — js/main.js na
   něj sahá, ale prvek v HTML chybí, takže krajFiltr zůstává 'all'. Do
   adresy se proto nedostane a zkoušet ho tu nemá smysl; v seznamu
   sdílených zůstává, aby odkaz fungoval, až se ovladač vrátí. */
await p.waitForTimeout(1200);

const poNastaveni = await p.evaluate(COJEVIDET);
const hash = await p.evaluate(() => location.hash);

pravda('po nastavení filtrů je stav v adrese', hash.length > 5, `hash „${hash}"`);
pravda('a stojí v ní druh nabídky', /t=exekuce/.test(hash), hash);
pravda('a cena', /(^|&|#)cd=\d/.test(hash), hash);
pravda('a výřez mapy', /(^|&|#)m=-?\d/.test(hash), hash);
pravda('a řazení', /(^|&|#)razeni=price_asc/.test(hash), hash);
/* PŘEDPOKLAD, bez kterého by zkouška níž neznamenala nic: filtry musí
   výpis OPRAVDU zúžit. Kdyby ukazovaly totéž co bez nich, „vidí totéž"
   by platilo i s rozbitým odkazem. */
pravda('filtry výpis opravdu zúžily (jinak by se měřilo nic)',
  poNastaveni.naMape !== null && vychozi.naMape !== null && poNastaveni.naMape < vychozi.naMape,
  `bez filtrů ${vychozi.naMape}, s filtry ${poNastaveni.naMape}`);
pravda('a pořád je co ukazovat', (poNastaveni.naMape || 0) > 0, JSON.stringify(poNastaveni));

/* --- a teď ten odkaz pošleme „někomu jinému" ------------------------ */
const ctx2 = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
const p2 = await ctx2.newPage();
await p2.goto(`${BASE}/index.html${hash}`, { waitUntil: 'load' });
await pockej(p2);
await p2.waitForTimeout(1500);
const uPrijemce = await p2.evaluate(COJEVIDET);

pravda('příjemce odkazu vidí stejný počet nabídek',
  uPrijemce.naMape === poNastaveni.naMape,
  `odesílatel ${poNastaveni.naMape}, příjemce ${uPrijemce.naMape}`);
pravda('a příjemce má i stejné řazení',
  (await p2.evaluate(() => (document.getElementById('map-sort') || {}).value)) === 'price_asc',
  'řazení se nepropsalo');
pravda('a stejné nabídky ve stejném pořadí',
  JSON.stringify(uPrijemce.prvni) === JSON.stringify(poNastaveni.prvni),
  `odesílatel ${JSON.stringify(poNastaveni.prvni.slice(0, 2))}\n      příjemce   ${JSON.stringify(uPrijemce.prvni.slice(0, 2))}`);

/* --- kotva se s tím nesmí poplést ----------------------------------- */
/* ČISTÝ PROHLÍŽEČ, ne ten předchozí. Web si pamatuje, kde člověk
   naposled skončil (restoreMapReturn), a to je žádoucí — jenže ve
   stejném kontextu by se obnovil filtrovaný pohled a zkouška by měřila
   paměť, ne kotvu. */
const ctx3 = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
const p3 = await ctx3.newPage();
await p3.goto(`${BASE}/index.html#podminky`, { waitUntil: 'load' });
await pockej(p3);
await p3.waitForTimeout(2500);
const poKotve = await p3.evaluate(() => Object.assign(
  { hash: location.hash }, (() => {
    const e = document.querySelector('#map-count');
    const m = e ? /(\d[\d\s\u00a0]*)\s*na mapě/.exec(e.textContent || '') : null;
    return { naMape: m ? Number(m[1].replace(/[\s\u00a0]/g, '')) : null };
  })()));
pravda('odkaz s kotvou (#podminky) filtry nenastaví',
  poKotve.naMape === vychozi.naMape,
  `bez kotvy ${vychozi.naMape}, s kotvou ${poKotve.naMape}`);
/* A hlavně: kotva se nesmí přepsat stavem mapy. Dřív ji první
   překreslení seznamu přepsalo a odkaz na podmínky přestal jít poslat. */
pravda('a kotva v adrese zůstane (nepřepíše ji stav mapy)',
  poKotve.hash === '#podminky', `v adrese „${poKotve.hash}"`);

/* --- rozbitá adresa nesmí shodit stránku ---------------------------- */
const ctx4 = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
const p4 = await ctx4.newPage();
const chybyKonzole = [];
p4.on('pageerror', (e) => chybyKonzole.push(String(e.message)));
await p4.goto(`${BASE}/index.html#m=abc,def&t=&cd=-9&d=&%%%`, { waitUntil: 'load' });
await pockej(p4);
const poNesmyslu = await p4.evaluate(COJEVIDET);
pravda('na rozbité adrese stránka pořád běží',
  (poNesmyslu.naMape || 0) > 0 && chybyKonzole.length === 0,
  `napočítáno ${poNesmyslu.naMape}, chyby: ${chybyKonzole.join('; ')}`);

await ctx4.close(); await ctx3.close(); await ctx2.close(); await ctx.close(); await prohlizec.close();

console.log(`\nSdílený odkaz na stav mapy: ${zpravy.length} kontrol`);
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Sdílený odkaz: ${chyb} kontrol neprošlo.`); process.exit(1); }
console.log(`\n${zpravy.length} v pořádku, 0 chyb\n`);
process.exit(0);
