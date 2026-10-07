/* Test: rychlý výběr v prohlížeči (celá cesta).
 *
 * Spuštění: node scripts/test-rychly-prohlizec.mjs
 *
 * Logiku balíčku hlídá scripts/test-rychlovyber.mjs. Tady jde o to, co
 * se dá rozbít až v zapojení — a co by škodilo tiše:
 *
 *   · ROZHODNUTÍ SE MUSÍ OPRAVDU ULOŽIT. Karta se posune tak jako tak;
 *     kdyby se zápis nepovedl, vypadalo by to, že vše funguje, a člověk
 *     by o svoje uložené pozemky přišel.
 *   · „ZPĚT" NESMÍ LHÁT. Vrátit kartu a nechat pozemek skrytý by bylo
 *     horší než žádné zpět — člověk by si myslel, že to vzal zpátky.
 *   · JDE TO I BEZ PRSTU. Kdo ovládá web klávesnicí, musí mít cestu.
 */
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
const p = await ctx.newPage();
await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
await p.waitForSelector('.opp-item', { timeout: 25000 }).catch(() => {});
await p.waitForTimeout(3500);

const stav = () => p.evaluate(() => {
  const cti = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
  return {
    otevreno: !(document.getElementById('rv-vrstva') || {}).hidden,
    karta: (document.querySelector('.rv-misto') || { textContent: '' }).textContent.trim(),
    zbyva: (document.getElementById('rv-zbyva') || { textContent: '' }).textContent,
    stalo: (document.getElementById('rv-stalo') || { textContent: '' }).textContent,
    zpetVyp: !!(document.getElementById('rv-zpet') || {}).disabled,
    ulozene: cti('pk_fav_v1').length, skryte: cti('pk_skryte_v1').length,
  };
});

pravda('na telefonu je tlačítko rychlého výběru vidět', await p.isVisible('#mc-rychly'));
await p.click('#mc-rychly');
await p.waitForTimeout(800);
const s0 = await stav();
pravda('otevře se vrstva s kartou', s0.otevreno && s0.karta.length > 0, JSON.stringify(s0));
pravda('a na začátku není co vracet', s0.zpetVyp === true);
pravda('nic uloženého ani skrytého zatím není', s0.ulozene === 0 && s0.skryte === 0,
  `uložené ${s0.ulozene}, skryté ${s0.skryte}`);

/* --- uložení se musí opravdu zapsat ------------------------------- */
await p.click('#rv-ano'); await p.waitForTimeout(500);
const s1 = await stav();
pravda('„Uložit" pozemek OPRAVDU uloží (ne jen posune kartu)', s1.ulozene === 1, `uložené ${s1.ulozene}`);
pravda('a posune se na jinou nabídku', s1.karta !== s0.karta, `${s0.karta} → ${s1.karta}`);
pravda('a řekne, co se stalo', /Uloženo/.test(s1.stalo), `hláška „${s1.stalo}"`);

/* --- skrytí taky ---------------------------------------------------- */
await p.click('#rv-ne'); await p.waitForTimeout(500);
const s2 = await stav();
pravda('„Tenhle ne" pozemek opravdu skryje', s2.skryte === 1, `skryté ${s2.skryte}`);

/* --- A TO HLAVNÍ: zpět nesmí lhát --------------------------------- */
await p.click('#rv-zpet'); await p.waitForTimeout(500);
const s3 = await stav();
pravda('„Zpět" skrytí OPRAVDU odvolá (ne jen vrátí kartu)', s3.skryte === 0, `skryté ${s3.skryte}`);
pravda('a vrátí se na tu kartu, ať se dá rozhodnout jinak', s3.karta === s1.karta,
  `čekáno ${s1.karta}, je ${s3.karta}`);
pravda('a uložený pozemek z předchozího kroku zůstal', s3.ulozene === 1, `uložené ${s3.ulozene}`);

/* --- klávesnice ---------------------------------------------------- */
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
const s4 = await stav();
pravda('šipkou doprava jde uložit i bez prstu', s4.ulozene === 2, `uložené ${s4.ulozene}`);
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(500);
pravda('a šipkou doleva skrýt', (await stav()).skryte === 1);
await p.keyboard.press('Escape'); await p.waitForTimeout(600);
pravda('Escape vrstvu zavře', (await stav()).otevreno === false);

/* --- VIDĚT, ŽE SE NĚCO STALO --------------------------------------
   Stížnost od člověka, který web používá: „chtělo by to animaci, když
   klikám, že si ho ukládám — nikde to nevidím." Odezva byla jediný
   řádek písmem 14 px pod kartou a karta se tiše vyměnila za jinou.
   Třídy se sledují přes MutationObserver, ne čtením po kliknutí:
   animace trvá 300 ms a na pomalém stroji by se stihla uklidit dřív,
   než by se test stačil zeptat. Kontrola by pak padala náhodně. */
await p.click('#mc-rychly'); await p.waitForTimeout(900);
await p.evaluate(() => {
  window.__tridy = [];
  const zapis = (el) => new MutationObserver(() => window.__tridy.push(String(el.className)))
    .observe(el, { attributes: true, attributeFilter: ['class'] });
  document.querySelectorAll('#rv-karta, #rv-ano').forEach(zapis);
});
await p.click('#rv-ano'); await p.waitForTimeout(600);
const videt = await p.evaluate(() => window.__tridy || []);
pravda('karta při uložení odletí doprava (vidět, že rozhodnutí zabralo)',
  videt.some((t) => /odlet-vpravo/.test(t)), JSON.stringify(videt));
pravda('a na kartě se při tom ukáže razítko „Uloženo"',
  videt.some((t) => /chystam-ano/.test(t)), JSON.stringify(videt));
pravda('a srdíčko na tlačítku poskočí', videt.some((t) => /zabralo/.test(t)), JSON.stringify(videt));
const bilance = await p.evaluate(() => (document.getElementById('rv-bilance') || {}).textContent || '');
pravda('a v hlavičce je vidět, kolik toho člověk uložil', /♥\s*\d/.test(bilance),
  `v hlavičce stojí „${bilance}"`);

/* --- DÁVKA MÁ KONEC NA DOHLED -------------------------------------
   Napoprvé se sypal celý výpis: v hlavičce stálo „Zbývá 1 955" a konec
   byl po dvou tisících rozhodnutích, tedy nikdy. Teď se nabízí dvacet
   karet a je vidět, kolikátá je na řadě. */
const hlavicka = await p.evaluate(() => (document.getElementById('rv-zbyva') || {}).textContent || '');
pravda('hlavička říká, kolikátá karta z dávky je na řadě (ne „zbývá 1 955")',
  /^Karta \d+ z \d+$/.test(hlavicka.trim()) && !/1\s*9\d\d/.test(hlavicka),
  `v hlavičce stojí „${hlavicka}"`);
const davka = Number((hlavicka.match(/z (\d+)/) || [])[1] || 0);
pravda('a dávka je tak velká, aby se dala dojet (nejvýš 30 karet)',
  davka > 0 && davka <= 30, `dávka ${davka}`);
pravda('pod tlačítky stojí, co se s pozemkem stane',
  /schová/i.test(await p.evaluate(() => (document.querySelector('.rv-napoveda') || {}).textContent || '')),
  'nápověda o skrytí z výpisu tam není');

// Dojet dávku do konce — konec musí opravdu přijít a nabídnout další.
for (let i = 0; i < davka + 1; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(90); }
await p.waitForTimeout(600);
const konec = await p.evaluate(() => ({
  text: (document.querySelector('.rv-konec') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(),
  dalsi: !!document.getElementById('rv-dalsi'),
  hlavicka: (document.getElementById('rv-zbyva') || {}).textContent,
}));
pravda('dávka opravdu skončí', /Dávka hotová/.test(konec.text), JSON.stringify(konec));
pravda('a konec řekne, kde uložené pozemky najdu', /Uložené/.test(konec.text), konec.text.slice(0, 160));
pravda('a nabídne další dávku, ne nekonečné sypání karet', konec.dalsi, konec.text.slice(0, 160));
await p.click('#rv-dalsi'); await p.waitForTimeout(700);
const po = await p.evaluate(() => ({
  hlavicka: (document.getElementById('rv-zbyva') || {}).textContent,
  karta: (document.querySelector('.rv-misto') || { textContent: '' }).textContent.trim(),
}));
pravda('„Projít dalších" naloží novou dávku', /^Karta 1 z/.test((po.hlavicka || '').trim()) && po.karta.length > 0,
  JSON.stringify(po));

/* --- rozhodnuté se nevrací ----------------------------------------
   Logiku hlídá scripts/test-rychlovyber.mjs; tady jde o zapojení —
   že se do balíčku opravdu předají obě sady (uložené i skryté). */
const nevraci = await p.evaluate(() => {
  const cti = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
  const rozhodnute = cti('pk_fav_v1').concat(cti('pk_skryte_v1'));
  /* Porovnává se KLÍČ pozemku z data-pk, ne jméno obce: obcí s víc
     pozemky jsou v datech stovky, takže shoda jména by nic neznamenala. */
  const k = (document.getElementById('rv-karta') || { dataset: {} }).dataset.pk || '';
  return { rozhodnutych: rozhodnute.length, nabizi: k,
    maKlic: !!k, kolize: rozhodnute.filter((x) => x === k).length };
});
pravda('rozhodnutých je dost na to, aby kontrola něco znamenala',
  nevraci.rozhodnutych >= 5, `rozhodnuto ${nevraci.rozhodnutych}`);
pravda('nabízená karta nese klíč pozemku (jinak není co porovnávat)', nevraci.maKlic,
  'karta nemá data-pk');
pravda('a nabízená karta není ani jeden z nich', nevraci.kolize === 0,
  `nabízí „${nevraci.nabizi}", a ten je mezi rozhodnutými`);

await ctx.close(); await prohlizec.close();
console.log(`\nRychlý výběr v prohlížeči: ${ok + chyb} kontrol`);
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Rychlý výběr: ${chyb} kontrol neprošlo.`); process.exit(1); }
console.log(`\n${ok} v pořádku, 0 chyb\n`);
process.exit(0);
