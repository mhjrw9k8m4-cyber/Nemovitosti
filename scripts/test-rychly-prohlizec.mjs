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

/* --- rozhodnuté se nevrací ---------------------------------------- */
await p.click('#mc-rychly'); await p.waitForTimeout(900);
const s5 = await stav();
const rozhodnuto = s4.ulozene + 1;   // uložené + skryté
pravda('po znovuotevření se rozhodnuté nenabízejí',
  /Zbývá/.test(s5.zbyva) && !new RegExp('Zbývá\\s*1[\\s\\u00a0]*994').test(s5.zbyva),
  `zbývá: „${s5.zbyva}" (rozhodnuto ${rozhodnuto})`);

await ctx.close(); await prohlizec.close();
console.log(`\nRychlý výběr v prohlížeči: ${ok + chyb} kontrol`);
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Rychlý výběr: ${chyb} kontrol neprošlo.`); process.exit(1); }
console.log(`\n${ok} v pořádku, 0 chyb\n`);
process.exit(0);
