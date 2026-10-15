/* Test: na ovládání musí být vidět, že je ovládání.
 *
 * Spuštění: node scripts/test-afordance.mjs
 *   (potřebuje playwright-core; v sandboxu PW_CHROMIUM=cesta/k/chrome)
 *
 * PROČ. Záložky účtu („Upozornění / Zprávy / Hlídání / Můj profil") byly
 * holý text: pozadí rgba(0,0,0,0), žádný okraj, jen šedá barva. Jediný
 * náznak, že jde o odkazy, přinášel :hover — a na telefonu žádný :hover
 * není, takže tam neukazovalo na klikatelnost vůbec nic.
 *
 * Změřeno, proč nestačí „přidat pozadí": plocha #EDF3EF má proti pozadí
 * stránky #DFEBE2 kontrast 1,09 : 1 a čistá bílá 1,23 : 1. Afordanci
 * nese OKRAJ a hlavně plná výplň zapnutého prvku.
 *
 * Pravidlo je proto takové, které jde změřit: ovládací prvek musí mít
 * aspoň jedno z trojice — krycí plochu, viditelný okraj, nebo podtržení.
 * Když nemá nic z toho, je k nerozeznání od běžného textu.
 *
 * NEMĚŘÍ SE VZHLED, MĚŘÍ SE ODLIŠITELNOST. Jestli je to hezké, test
 * neřeší; řeší, jestli to člověk pozná jako něco, na co se klepe.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { rozbalHledani } from './rozbal-hledani.mjs';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const STRANKY = ['zpravy.html', 'hlidani.html', 'index.html'];
/* Prvky, u kterých to platí. Schválně vypsané: kdyby se tu vybíralo
   „všechno klikatelné", spadly by sem i odkazy v textu a v patičce —
   ty podtržení a barvu mají a jako text se chovat MAJÍ. */
const OVLADANI = '.uc-taby a, .filter-chip, .mvt-btn, .hl-tab';

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
let nalezeno = 0;
for (const s of STRANKY) {
  /* DOTYK MUSÍ BÝT ZAPNUTÝ — tahle zkouška stojí celá na tom, že na
     telefonu není :hover. Jenže do 15. 10. běžela v okně 390 px BEZ
     emulace dotyku, a v takovém kontextu prohlížeč pravidla za
     `@media (hover: none)` a `(pointer: coarse)` vůbec nevyhodnotí:
     měřilo se rozvržení monitoru v úzkém okně, tedy přesně ten stav,
     o kterém zkouška netvrdí nic. (Jak se to našlo: bod 3da
     v docs/co-chybi.md.)
     Druhý profil (monitor) tady nepotřebuje: tam :hover je a jeho
     barvy měří scripts/test-najeti.mjs. */
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  /* NA ÚVODNÍ STRÁNCE JSOU ČIPY SCHOVANÉ, DOKUD SE NEKLEPNE DO HLEDÁNÍ.
     Hledání se na telefonu rozbaluje až klepnutím (viz docs/co-chybi.md,
     oddíl o přestavbě podle Sreality), takže filtrovací čipy mají nulový
     obdélník a měřit by nebylo co — kontrola „a bylo vůbec co měřit"
     tohle přesně hlídá a taky to ohlásila. */
  await p.waitForTimeout(900);
  await rozbalHledani(p).catch(() => {});
  const nalezy = await p.evaluate((sel) => {
    const pruhledna = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0(\.0+)?\s*\)/.test(c);
    const out = [];
    document.querySelectorAll(sel).forEach((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return;          // schované prvky neřešíme
      const st = getComputedStyle(e);
      const maPlochu = !pruhledna(st.backgroundColor) || st.backgroundImage !== 'none';
      const maOkraj = ['Top', 'Right', 'Bottom', 'Left'].some((b) =>
        parseFloat(st['border' + b + 'Width']) > 0 && !pruhledna(st['border' + b + 'Color']));
      const maPodtrzeni = /underline/.test(st.textDecorationLine || '');
      /* NEBO TO NESE SKUPINA. U přepínače „Seznam / Mapa" je plocha
         i okraj na DRÁZE kolem obou tlačítek a vypnutá půlka je uvnitř
         ní průhledná — a je to tak správně: klikatelnost tam ukazuje
         celek, ne každý kus zvlášť. Kdyby se to nepočítalo, pravidlo by
         hlásilo chybu na vzoru, který prokazatelně funguje. */
      const rodic = e.parentElement;
      const rs = rodic ? getComputedStyle(rodic) : null;
      const skupinaNese = !!(rs && (!pruhledna(rs.backgroundColor)
        || ['Top', 'Right', 'Bottom', 'Left'].some((b) =>
          parseFloat(rs['border' + b + 'Width']) > 0 && !pruhledna(rs['border' + b + 'Color']))));
      out.push({ trida: (e.className || e.tagName).toString().split(' ')[0],
        text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
        maPlochu, maOkraj, maPodtrzeni, skupinaNese });
    });
    return out;
  }, OVLADANI).catch(() => []);
  nalezeno += nalezy.length;
  const nemaNic = nalezy.filter((n) => !n.maPlochu && !n.maOkraj && !n.maPodtrzeni && !n.skupinaNese);
  pravda(`${s}: každé ovládání je k rozeznání od textu`, nemaNic.length === 0,
    nemaNic.map((n) => `„${n.text}" (${n.trida}) — bez plochy, okraje i podtržení, a nenese to ani skupina`).join('; '));
  await ctx.close();
}
await prohlizec.close();
/* Předpoklad: kdyby selektor nic nenašel, všechny kontroly výš by prošly
   na prázdné množině a test by neznamenal nic. */
/* Mez je nízká schválně: kategorie bez nabídek svoje čipy nezobrazuje
   (dnes „Obec" a „Přímo od majitele"), takže se počet mezi běhy liší.
   Jde o to, aby se neměřilo na prázdnu, ne o přesné číslo. */
pravda('a bylo vůbec co měřit', nalezeno >= 12, `nalezeno ${nalezeno} prvků`);

console.log(`\nViditelnost ovládání: ${ok + chyb} kontrol`);
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Viditelnost ovládání: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
console.log(`\n${ok} v pořádku, 0 chyb\n`);
process.exit(0);
