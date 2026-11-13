/* Test: otevřený panel filtrů se zase zavře — opravdovým prstem.
   ==================================================================
   Spuštění: node scripts/test-hledani-zavirani.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)
   Volá ji .github/workflows/testy.yml (krok „Otevřený panel filtrů
   se zase zavře").

   PROČ. Do 10. 11. tahle zkouška hlídala ROZBALOVÁNÍ HLEDÁNÍ: na
   telefonu bylo vidět jen pole s lupou a filtry se rozbalily, až se do
   pole klepnulo. Rozbalit se umělo, zavřít ne — v kódu byl jediný
   způsob (tlačítko „Hotovo"), přestože komentář u něj sliboval čtyři,
   a naměřeno bylo, že po Escapu, po odrolování o 1 200 px ani po
   klepnutí na kartu se nezavřelo. Majitel webu: „proč to vidím, i když
   nevyhledávám — má to být vidět, jen když vyhledávám."
   Rozbalování je od 10. 11. pryč (schovávalo hlavní funkci webu, viz
   scripts/test-filtry-radek.mjs) a jeho místo zaujaly panely
   jednotlivých skupin filtrů. Vrstva nad obsahem se musí dát zavřít
   stejně jako dřív, takže TÁŽ zkouška měří touž věc na novém prvku.

   PROČ ZVLÁŠŤ, KDYŽ ZAVÍRÁNÍ MĚŘÍ I test-filtry-radek: ten posílá
   události skriptem (`dispatchEvent`), tady se opravdu KLEPE prstem na
   dotykovém zařízení. Je to rozdíl, který už jednou vadu odhalil:
   zavírání viselo na `pointerdown`, takže se panel složil ještě před
   dopadem klepnutí, obsah pod prstem vyskočil a klepnutí přistálo na
   něčem jiném.

   Hlídají se obě strany téže věci:
     · po načtení je zavřeno a klepnutí na otvírač otevře,
     · Escape i klepnutí mimo panel zavřou,
     · klepnutí UVNITŘ panelu nezavře (jsou v něm ovladače, které se
       musí dát použít),
     · klepnutí na JINÝ otvírač zavře ten první (jinak by se dva
       absolutně umístěné panely překrývaly). */
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
hlasPad('Zavírání panelu filtrů', zpravy);
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
const otevrene = () => p.evaluate(() =>
  [...document.querySelectorAll('details.mf')].filter((d) => d.open).map((d) => d.id));
async function klepni(sel) {
  const el = await p.$(sel);
  if (!el) return false;
  const r = await el.boundingBox();
  if (!r) return false;
  await p.touchscreen.tap(r.x + Math.min(12, r.width / 2), r.y + Math.min(12, r.height / 2));
  await p.waitForTimeout(320);
  return true;
}

try {
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  /* POHLED SE ŽÁDÁ JMÉNEM, AŤ JE VÝCHOZÍ KTERÝKOLI. Úvodní stránka má na
     telefonu dva pohledy nad sebou a vidět je jen jeden; výchozí se za dva
     dny obrátil dvakrát. Co tahle zkouška měří, žije nad VÝPISEM — tohle
     přepnutí je proto pojistka, ne reakce na jednu konkrétní podobu webu. */
  await naSeznam(p);
  await p.waitForSelector('#opp-list .opp-item', { timeout: 30000 });
  await p.waitForTimeout(1200);

  /* KLEPE SE PODLE OBDÉLNÍKU Z boundingBox, A JE TO BEZPEČNÉ JEN
     POTUD, POKUD JSOU SKUPINY VIDĚT ROVNOU. 13. 11. jsem pilulky
     zkusil schovat na telefonu za jeden otvírač a tenhle hlídač tím
     spadl na třech kontrolách: prvek v ZAVŘENÉM <details> hlásí
     v Chromu pořád poslední známý obdélník, takže dotyk dopadal na
     souřadnice, kde nic není. Majitel řekl „vrať to tam, kde jsem to
     nastavil sám" — skupiny jsou zase vidět hned a klepat se dá
     přímo. Kdyby se někdy znovu schovaly, musí se sem vrátit krok,
     který je napřed odhalí. */
  pravda('je co měřit: řádek filtrů je ve stránce',
    (await p.$$('details.mf')).length >= 4, 'otvírače skupin nejsou');
  pravda('po načtení není otevřený žádný panel', (await otevrene()).length === 0,
    'otevřeno: ' + (await otevrene()).join(', '));

  pravda('klepnutí na otvírač panel otevře',
    (await klepni('#mf-cena summary')) && (await otevrene()).join() === 'mf-cena',
    'otevřeno: ' + (await otevrene()).join(', '));

  await p.keyboard.press('Escape');
  await p.waitForTimeout(250);
  pravda('Escape ho zavře', (await otevrene()).length === 0,
    'po Escapu zůstalo otevřeno: ' + (await otevrene()).join(', '));

  /* KLEPNUTÍ DOVNITŘ NEZAVÍRÁ. Kdyby ano, nešlo by zadat cenu ani
     zapnout druh — klepnutí by panel zavřelo dřív, než by dopadlo. */
  await klepni('#mf-cena summary');
  await klepni('#mf-cena .mf-panel .mc-cap');
  pravda('klepnutí uvnitř panelu ho nezavře', (await otevrene()).join() === 'mf-cena',
    'otevřeno: ' + (await otevrene()).join(', '));

  /* JINÝ OTVÍRAČ ZAVŘE TEN PRVNÍ. Dva absolutně umístěné panely přes
     sebe by znamenaly, že nepoznáte, který ovladač ke které skupině je. */
  await klepni('#mf-druh summary');
  pravda('klepnutí na jiný otvírač zavře ten první',
    (await otevrene()).join() === 'mf-druh', 'otevřeno: ' + (await otevrene()).join(', '));

  /* KLEPNUTÍ MIMO ZAVÍRÁ. Klepe se do hlavičky stránky — je to místo,
     které nic nefiltruje a vždycky existuje. */
  await klepni('header .logo, header a, #header');
  pravda('klepnutí mimo panel ho zavře', (await otevrene()).length === 0,
    'po klepnutí mimo zůstalo otevřeno: ' + (await otevrene()).join(', '));
} catch (e) {
  chyb++;
  zpravy.push('  ✕ zkouška spadla: ' + (e && e.message ? e.message : e));
}
await ctx.close();
await prohlizec.close();

console.log('\nOtevřený panel filtrů se zase zavře');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Zavírání panelu filtrů: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
