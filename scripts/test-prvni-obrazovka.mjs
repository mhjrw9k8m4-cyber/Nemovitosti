/* Test: co je na PRVNÍ obrazovce telefonu.
   ==================================================================
   Spuštění: node scripts/test-prvni-obrazovka.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ TOHLE VZNIKLO. Naměřeno na úvodní stránce, 390×844:
   první nabídka začínala na y 699 z 844 — tedy pod obrazovkou. Mezi
   hlavičkou a prvním pozemkem leželo 634 px samého ovládání:
     · 218 px rozcestník, a v něm podruhé značka „Parcelka" čtrnáct
       pixelů pod tou v liště;
     · 135 px hledání a přepínač Seznam/Mapa;
     ·  88 px nadpis výsledků a řazení;
     · 136 px pruh „Projít … po jednom" a „Stáhnout výběr", který se
       přitom na MONITORU odjakživa smršťoval — tedy šetřilo se místem
       tam, kde ho je nejvíc.
   Kdo přišel na web koupit pozemek, neviděl ani jeden.

   CO SE MĚŘÍ. Ne vzhled, ale jedna věcná otázka: uvidí člověk hned po
   otevření aspoň jednu nabídku i s cenou? Meze jsou volné schválně —
   text nabídek se mění a pevné číslo by padalo na cizích datech.
   ================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const SIRKA = 390, VYSKA = 844;
/* Mez 560 px, ne 505: naměřený stav je 505 a pevné číslo by spadlo při
   první změně textu nadpisu. 560 je pořád o 139 px méně než 699, se
   kterými se začínalo, a hlavně se pod ně vejde celý náhled nabídky. */
const MEZ_PRVNI = 560;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(spadlo) {
  console.log("\nCo je vidět bez rolování");
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::První obrazovka: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
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
    viewport: { width: SIRKA, height: VYSKA }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForSelector('.opp-item', { timeout: 25000 });
  await p.waitForTimeout(2500);

  const m = await p.evaluate(() => {
    const y = (e) => e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
    const karta = document.querySelector('#opp-list .opp-item');
    const hlavicka = document.getElementById('header');
    /* Cena se hledá UVNITŘ první karty, ne kdekoli na stránce: kdyby se
       sáhlo po první ceně v dokumentu, našla by se třeba v odznaku
       nad výpisem a kontrola by platila i s kartou mimo obrazovku. */
    const cena = karta ? karta.querySelector('.opp-price, .opp-cena, [class*="price"]') : null;
    const cr = cena ? cena.getBoundingClientRect() : null;
    return {
      karta: y(karta),
      hlavicka: hlavicka ? Math.round(hlavicka.getBoundingClientRect().height) : null,
      cenaSpodek: cr ? Math.round(cr.top + window.scrollY + cr.height) : null,
      cenaText: cena ? cena.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) : null,
      /* Značka v liště a značka v rozcestníku: dvě tatáž jména pod sebou. */
      znacek: Array.from(document.querySelectorAll('.logo, .uvod-logo'))
        .filter((e) => e.getBoundingClientRect().height > 4).length,
      /* Pruh nástrojů („Projít … po jednom", „Stáhnout výběr") nad
         výpisem. Měří se zvlášť, protože mez na začátek první karty je
         volná a čtyřicet pixelů navíc by v ní zmizelo — a přitom právě
         tenhle pruh byl z celého ovládání největší. */
      nastroje: (function () {
        const e = document.getElementById('mc-akce');
        return e ? Math.round(e.getBoundingClientRect().height) : null;
      })(),
    };
  });
  const je = (x) => x !== null && x !== undefined;

  pravda('na úvodní stránce je co měřit — vykreslila se aspoň jedna nabídka',
    je(m.karta), 'žádná .opp-item se nenašla');
  pravda(`první nabídka začíná nad ${MEZ_PRVNI} px, ne až pod obrazovkou`,
    je(m.karta) && m.karta < MEZ_PRVNI,
    `začíná na ${m.karta} px z ${VYSKA} px obrazovky`);
  /* Tohle je ta vlastní otázka: nestačí, že karta začne — musí z ní být
     vidět to, kvůli čemu se na web chodí. */
  pravda('a je z ní na první obrazovce vidět cena',
    je(m.cenaSpodek) && m.cenaSpodek <= VYSKA,
    `cena „${m.cenaText}" končí na ${m.cenaSpodek} px, obrazovka má ${VYSKA}`);
  /* Past na návrat starého stavu: značka patří do lišty, a tam jednou. */
  pravda('a značka „Parcelka" na stránce nestojí dvakrát pod sebou',
    m.znacek === 1, `viditelných značek: ${m.znacek}`);
  /* Past na návrat starého stavu, podruhé: pruh nástrojů měl 136 px
     a v něm vysvětlující větu, kterou MONITOR odjakživa schovával.
     Dnes má 98 px — dvě tlačítka pod sebou, obě jednořádková. Mez je
     110, a je to počítané číslo, ne odhad: vrácení té věty přidá 46 px
     (ověřeno sabotáží), takže by pruh skočil na 144. Volnějších dvanáct
     pixelů snese delší počet nabídek, užší telefon ne víc. */
  pravda('pruh nástrojů nad výpisem se vejde do 110 px',
    je(m.nastroje) && m.nastroje <= 110, `má ${m.nastroje} px`);
  await ctx.close();

  /* ---- A TOTÉŽ NA VELKÉM MONITORU --------------------------------
     Druhá polovina téže otázky: kolik nabídek je vidět bez rolování.
     Naměřeno před opravou: sloupec s výpisem měl 460 px při okně 1440
     i 1920 — strop min(34vw, 460px) se zarazil kolem 1 350 px okna —
     zatímco mapa rostla z 980 na 1 460. Na obrazovce byla jedna a půl
     nabídky, ať byl monitor jakkoli velký. */
  const sirokyCtx = await prohlizec.newContext({
    viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const w = await sirokyCtx.newPage();
  await w.goto(BASE + '/index.html', { waitUntil: 'load' });
  await w.waitForSelector('#opp-list .opp-item', { timeout: 25000 });
  await w.waitForTimeout(2500);
  const s = await w.evaluate(() => {
    const side = document.querySelector('.map-side');
    const karty = Array.from(document.querySelectorAll('#opp-list .opp-item')).slice(0, 2)
      .map((e) => Math.round(e.getBoundingClientRect().left));
    /* Kolik karet je celých nad spodkem okna. Nepočítá se „začíná“,
       ale „je celá vidět" — půlka karty není nabídka. */
    const cele = Array.from(document.querySelectorAll('#opp-list .opp-item'))
      .filter((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }).length;
    return { sirka: side ? Math.round(side.getBoundingClientRect().width) : null, karty, cele };
  });
  pravda('na monitoru 1920 px je sloupec s výpisem širší než 700 px',
    je(s.sirka) && s.sirka > 700, `má ${s.sirka} px`);
  /* Dvě karty vedle sebe poznám podle toho, že druhá začíná vpravo od
     první — ne podle počtu sloupců v CSS, to by hlídalo zápis, ne
     výsledek. */
  pravda('a karty se skládají po dvou vedle sebe',
    s.karty.length === 2 && s.karty[1] > s.karty[0] + 100,
    `levé okraje prvních dvou karet: ${JSON.stringify(s.karty)}`);
  pravda('takže bez rolování jsou vidět aspoň dvě celé nabídky',
    s.cele >= 2, `celých karet na obrazovce: ${s.cele}`);
  await sirokyCtx.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
