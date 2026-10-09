/* Test: na co je vidět, na to se dá i klepnout.
   ==================================================================
   Spuštění: node scripts/test-pod-hlavickou.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   NALEZENÁ VADA, KTEROU TOHLE HLÍDÁ. Hlavička je připíchnutá (position
   fixed, 85 px) a <body> jí dělá místo odsazením shora. Jenže úvodní
   sekce se pravidlem `margin-top:-80px` tahala zpátky nahoru — kdysi
   proto, aby panel hledání překládal spodek uvítacího obrazu. Obraz se
   později odebral, pravidlo zůstalo, a tahalo tedy celou aplikaci pod
   hlavičku. Naměřeno:
     · 1280×900 — .map-wide začínala na y=5 místo 85, z ovládacího pruhu
       (y 6–111) bylo horních 79 px za hlavičkou a hrany filtrů
       Vše/Prodej/Dražba/Exekuce byly rozpůlené;
     · 390×844 — hledací pole y 40–86, tedy 45 ze 46 px za hlavičkou:
       klepnutí doprostřed pole trefilo „Přidat pozemek".
   Je to zákeřné v tom, že prvek je VIDĚT (kus z něj kouká), takže se na
   něj člověk snaží klepnout a nic se nestane. Dvě zkoušky na tom padaly
   nesrozumitelným „timeoutem", protože Playwright mlčky čekal, až se
   prvek uvolní.

   CO SE MĚŘÍ. Projdou se ovládací prvky, které jsou vidět, a u každého
   se zjistí, co leží na jeho středu (elementFromPoint). Když to není on
   sám ani nic z něj, je zakrytý — a tedy mrtvý pod prstem.
   ================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(spadlo) {
  console.log('\nNa co je vidět, na to se dá klepnout');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Zakryté ovládání: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}

/* Co se bere za ovládání. Odkazy v souvislém textu se vynechávají —
   ty se čtou, ne mačkají, a je jich tolik, že by hlášení zahltily. */
const ZAKRYTE = `() => {
  const h = document.getElementById('header');
  const hb = h ? h.getBoundingClientRect() : null;
  const prvky = document.querySelectorAll(
    'button, input, select, textarea, summary, a.btn, a.pz-btn, a.mc-prep, [role="tab"], [role="button"]');
  const nalez = [];
  for (const e of prvky) {
    if (e.disabled || e.closest('[hidden]') || e.hidden) continue;
    /* Zavřené rozbalovátko se nepočítá. Panel filtrů se na počítači
       kreslí POD mapou a otevření ho teprve vytáhne nahoru — obdélníky
       tlačítek v něm tedy existují, i když je vidět není, a test by
       hlásil osm „zakrytých mapou" filtrů, na které nikdo klepat
       nechtěl. Samotné <summary> se počítá: na to klepnout jde. */
    const det = e.closest('details');
    if (det && !det.open && e.tagName !== 'SUMMARY') continue;
    const b = e.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) continue;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
    /* Jen to, co je doopravdy v obraze. Co je nad ním nebo pod ním,
       tam se člověk nejdřív posune — a tehdy se měří znovu. */
    if (b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth) continue;
    /* A jen to, co se vejde do svých rámů. Prvek uvnitř rolovacího
       panelu má svůj obdélník i tehdy, když je vyrolovaný mimo —
       bez téhle kontroly hlásil test desítky tlačítek z filtrů jako
       „zakrytá mapou", přestože je prostě vidět nebylo. */
    let orezany = false;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (as.overflow === 'visible' && as.overflowX === 'visible' && as.overflowY === 'visible') continue;
      const ab = a.getBoundingClientRect();
      const px = Math.min(b.right, ab.right) - Math.max(b.left, ab.left);
      const py = Math.min(b.bottom, ab.bottom) - Math.max(b.top, ab.top);
      if (px < b.width * 0.6 || py < b.height * 0.6) { orezany = true; break; }
    }
    if (orezany) continue;
    const x = Math.min(Math.max(b.left + b.width / 2, 1), innerWidth - 1);
    const y = Math.min(Math.max(b.top + b.height / 2, 1), innerHeight - 1);
    const pod = document.elementFromPoint(x, y);
    if (!pod) continue;
    if (pod === e || e.contains(pod) || pod.contains(e)) continue;
    /* Vlastní rozbalovač překrývá svůj původní <select> schválně —
       ten je zúžený na 1 px a slouží jen jako nosič hodnoty. */
    if (e.tagName === 'SELECT' && pod.closest && pod.closest('.cdd')) continue;
    const prekryvHlavicky = hb ? Math.max(0, Math.min(hb.bottom, b.bottom) - Math.max(hb.top, b.top)) : 0;
    nalez.push({
      co: (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]),
      text: (e.textContent || e.placeholder || e.getAttribute('aria-label') || '').trim().slice(0, 28),
      y: Math.round(b.top) + '–' + Math.round(b.bottom),
      zakryl: (pod.id ? '#' + pod.id : pod.tagName.toLowerCase() + '.' + String(pod.className || '').split(' ')[0])
        + ' „' + (pod.textContent || '').trim().slice(0, 20) + '"',
      hlavicka: Math.round(prekryvHlavicky),
    });
  }
  return nalez;
}`;

const MISTA = [
  ['úvodní stránka', '/index.html'],
  ['stránka pozemku', '/pozemek-benesov-benesov-1sjtz7b.html'],
  ['můj profil', '/moje-data.html'],
];
/* Prvek, bez kterého se na té stránce nedá nic dělat. */
const HLAVNI = {
  '/index.html': '#map-search',
  '/pozemek-benesov-benesov-1sjtz7b.html': '.pz-back',
};
const SIRKY = [
  ['telefon 390×844', { width: 390, height: 844 }, true],
  ['počítač 1280×900', { width: 1280, height: 900 }, false],
];

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  for (const [jmS, vp, mob] of SIRKY) {
    const ctx = await prohlizec.newContext({
      viewport: vp, isMobile: mob, hasTouch: mob, serviceWorkers: 'block', locale: 'cs-CZ',
    });
    for (const [jmM, cesta] of MISTA) {
      const p = await ctx.newPage();
      await p.goto(BASE + cesta, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(3500);
      /* Dvakrát: hned po načtení a po kousku posunutí. Připíchnutá
         hlavička zakrývá vždycky týž pruh obrazu, takže se pod ni při
         posouvání dostane pokaždé něco jiného. */
      for (const posun of [0, 60]) {
        await p.evaluate((v) => window.scrollTo(0, v), posun);
        /* POČKAT, AŽ SE HLAVIČKA DOSMRŠTÍ. Při posunutí se zmenšuje
           přechodem; měřeno uprostřed něj hlásil elementFromPoint, že
           je položka menu „Moje" zakrytá úvodní sekcí — a přitom
           skutečné klepnutí na tytéž souřadnice ji trefilo a menu se
           otevřelo. Měří se proto až tehdy, když se hlavička tři
           měření po sobě nehne. */
        await p.evaluate(async () => {
          const h = document.getElementById('header');
          if (!h) return;
          let minula = -1, stejne = 0;
          for (let i = 0; i < 40 && stejne < 3; i++) {
            await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));
            const v = Math.round(h.getBoundingClientRect().height);
            stejne = (v === minula) ? stejne + 1 : 0;
            minula = v;
          }
        });
        await p.waitForTimeout(250);
        const nalez = await p.evaluate('(' + ZAKRYTE + ')()');
        const popis = nalez.map((n) => `${n.co} „${n.text}" na y ${n.y} zakryl ${n.zakryl}`
          + (n.hlavicka ? ` (hlavička přes ${n.hlavicka} px)` : '')).join('\n      ');
        pravda(`${jmM}, ${jmS}, posun ${posun} px: nic z ovládání není zakryté`,
          nalez.length === 0, popis);
      }
      /* A DRUHÁ STRANA TÉŽE MINCE. Zakryté ovládání se pozná podle toho,
         že z něj kus kouká. Když ho ale něco ořízne ÚPLNĚ, výš uvedená
         kontrola ho přeskočí jako „stejně není vidět" — a přitom je to
         horší vada: hlavní ovládací prvek stránky prostě chybí. Přesně
         to dělalo vytažení aplikace nahoru: na 390×844 zbylo z hledacího
         pole viditelného 1 px, protože ho ořízla sekce úvodu. */
      if (HLAVNI[cesta]) {
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.waitForTimeout(300);
        const m = await p.evaluate((sel) => {
          const e = document.querySelector(sel);
          if (!e) return { chybi: true };
          const b = e.getBoundingClientRect();
          let vid = { t: b.top, b: b.bottom, l: b.left, r: b.right };
          const h = document.getElementById('header');
          if (h) { const hb = h.getBoundingClientRect(); if (hb.bottom > vid.t) vid.t = Math.max(vid.t, hb.bottom); }
          for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
            const as = getComputedStyle(a);
            if (as.overflow === 'visible' && as.overflowX === 'visible' && as.overflowY === 'visible') continue;
            const ab = a.getBoundingClientRect();
            vid = { t: Math.max(vid.t, ab.top), b: Math.min(vid.b, ab.bottom),
              l: Math.max(vid.l, ab.left), r: Math.min(vid.r, ab.right) };
          }
          return { vyska: Math.round(b.height), vidu: Math.round(Math.max(0, vid.b - vid.t)),
            y: Math.round(b.top) + '–' + Math.round(b.bottom) };
        }, HLAVNI[cesta]);
        pravda(`${jmM}, ${jmS}: hlavní ovládání (${HLAVNI[cesta]}) je po načtení celé vidět`,
          !m.chybi && m.vidu >= m.vyska - 1,
          m.chybi ? 'prvek na stránce není'
            : `z ${m.vyska} px je vidět ${m.vidu} px (y ${m.y})`);
      }
      await p.close();
    }
    await ctx.close();
  }
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
