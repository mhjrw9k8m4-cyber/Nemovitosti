/* Test: rozbalené hledání se zase zavře.
   ==================================================================
   Spuštění: node scripts/test-hledani-zavirani.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ. Na telefonu je vidět jen pole s lupou; okolí, druhy nabídek
   a „Druh, cena, výměra a další" se rozbalí, až se do pole klepne.
   Rozbalit se umělo, zavřít ne: v kódu byl jediný způsob (tlačítko
   „Hotovo"), přestože komentář u něj sliboval čtyři. Jedno klepnutí
   do pole tedy otevřelo filtry natrvalo — naměřeno, že po Escapu, po
   odrolování o 1 200 px i po klepnutí na kartu zůstala třída
   `hledani-rozbalene` viset dál. Majitel webu: „proč to vidím, i když
   nevyhledávám — má to být vidět, jen když vyhledávám."

   Hlídají se proto obě strany téže věci:
     · po načtení je zavřeno a klepnutí do pole otevře,
     · Escape, klepnutí mimo panel i Enter zavřou,
     · klepnutí UVNITŘ panelu nezavře (jsou v něm našeptávač obcí
       a filtry — ty se musí dát použít). */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { naSeznam } from './zkouska-pohled.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Zavírání hledání', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
const ctx = await prohlizec.newContext({ bypassCSP: true, 
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block', locale: 'cs-CZ',
});
const p = await ctx.newPage();
const rozbalene = () => p.evaluate(() => document.body.classList.contains('hledani-rozbalene'));
const otevri = async () => { await p.click('#map-search'); await p.waitForTimeout(250); };

try {
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  /* POHLED SE ŽÁDÁ JMÉNEM, AŤ JE VÝCHOZÍ KTERÝKOLI. Úvodní stránka má na
     telefonu dva pohledy nad sebou a vidět je jen jeden; výchozí se za dva
     dny obrátil dvakrát (17. 10. na mapu, 18. 10. zpátky na seznam). Co tahle
     zkouška měří, žije ve VÝPISU — tohle přepnutí je proto pojistka, ne
     reakce na jednu konkrétní podobu webu. */
  await naSeznam(p);
  await p.waitForSelector('#opp-list .opp-item', { timeout: 30000 });
  await p.waitForTimeout(1200);

  pravda('po načtení je hledání zavřené', (await rozbalene()) === false,
    'třída hledani-rozbalene je na <body> hned po načtení');
  await otevri();
  pravda('a klepnutí do pole ho rozbalí', (await rozbalene()) === true,
    'klepnutí do pole hledání nerozbalilo');

  await p.keyboard.press('Escape');
  await p.waitForTimeout(250);
  pravda('Escape ho zavře', (await rozbalene()) === false, 'po Escapu zůstalo rozbalené');

  /* KLEPNUTÍ DOVNITŘ NEZAVÍRÁ. Kdyby ano, nešel by vybrat ani druh
     nabídky, ani obec z našeptávače — klepnutí by zavřelo panel dřív,
     než by dopadlo. */
  await otevri();
  /* Klepe se na NÁVĚŠTÍ filtrů, ne na první tlačítko v panelu. Do
     29. 10. tam první stály odznaky druhu („Vše", „Prodej"…); ty se
     přestěhovaly dovnitř panelu a prvním tlačítkem se stalo „Pozemky
     v okolí", které otevře výběr místa přes celou obrazovku — ten pak
     zachytával všechna další klepnutí a zkouška spadla na timeoutu.
     Návěští filtrů je ovladač uvnitř panelu stejně jako ony a nic
     přes obrazovku neotevře. */
  const vnitrek = await p.$('#ms-filters .msf-summary');
  if (vnitrek) {
    const r = await vnitrek.boundingBox();
    if (r) { await p.touchscreen.tap(r.x + Math.min(8, r.width / 2), r.y + Math.min(8, r.height / 2)); }
    await p.waitForTimeout(350);
  }
  pravda('klepnutí uvnitř panelu ho nezavře', (await rozbalene()) === true,
    'klepnutí na ovladač uvnitř panelu hledání zavřelo');

  /* KLEPNUTÍ MIMO ZAVÍRÁ. Klepe se do hlavičky stránky — je to místo,
     které nic nefiltruje a vždycky existuje. */
  const hlavicka = await p.$('header .logo, header a, #header');
  if (hlavicka) {
    const r = await hlavicka.boundingBox();
    if (r) await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  }
  await p.waitForTimeout(350);
  pravda('klepnutí mimo panel ho zavře', (await rozbalene()) === false,
    'po klepnutí mimo zůstalo hledání rozbalené');

  await otevri();
  await p.fill('#map-search', 'les');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  pravda('Enter v poli ho zavře (už jsem zadal, co jsem chtěl)',
    (await rozbalene()) === false, 'po Enteru zůstalo hledání rozbalené');
} catch (e) {
  chyb++;
  zpravy.push('  ✕ zkouška spadla: ' + (e && e.message ? e.message : e));
}
await ctx.close();
await prohlizec.close();

console.log('\nRozbalené hledání se zase zavře');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Zavírání hledání: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
