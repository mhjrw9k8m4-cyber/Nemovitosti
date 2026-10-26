/* Test: hlavička vstupní stránky je dvousloupcová a čísla stojí v ní.
   ==================================================================
   Spuštění: node scripts/test-hlavicka-stranky.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ TOHLE VZNIKLO. Změřeno na devíti vstupních stránkách v okně
   1440 px: úvodní odstavec měl 565 px uvnitř obsahu širokého 1 136 —
   vpravo od každého úvodu tedy leželo 571 px prázdna. A nebylo to ani
   jednotné: šest stránek sráželo text doleva na x 152, dvě ho měly na
   střed na x 372.
   Tvrdá čísla („239 pozemků", „71 okresů") přitom stála AŽ POD
   hlavičkou, v dalším oddíle — to jediné, co člověka z vyhledávače
   zajímá do první vteřiny, bylo za zlomem.

   CO SE MĚŘÍ. Výsledek, ne zápis: že čísla leží UVNITŘ hlavičky,
   napravo od nadpisu, a že nejsou na stránce dvakrát.

   26. 10. SE ZMĚNILO, ODKUD SE TAM BEROU. Dřív je generátor psal pod
   hlavičku jako dlaždice .okr-stats a při zápisu stránky je do ní
   vystřihla funkce dvousloupcovaHlavicka; vedle nich stál v pásu
   odstavec, který tytéž počty říkal ještě větou. Odstavec i dlaždice
   zmizely — čísla píše rovnou hlavickaCisla() do .okr-cisla a dvojici
   sloupců dělá CSS. Měří se proto .okr-cisla a sousedí se s NADPISEM,
   ne s odstavcem, který na těch stránkách už není.
   ================================================================== */
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = new URL('..', import.meta.url).pathname;
/* Čtyři rodiny vstupních stránek: druh, okres, kraj, rozpočet. Kdyby se
   zkoušela jen jedna, přesun by se mohl rozbít na ostatních a nikdo by
   se to nedozvěděl. */
const STRANKY = ['pozemky-stavebni.html', 'pozemky-okres-benesov.html',
  'pozemky-stredocesky-kraj.html', 'pozemky-do-1-milionu.html'];

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Hlavička stránky', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(spadlo) {
  console.log('\nHlavička vstupní stránky');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Hlavička stránky: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  /* Nejdřív z disku: kolika stránek se to vůbec týká. Bez tohohle by
     zkouška prošla, i kdyby přesun běžel na jediné stránce ze sta. */
  const vsechny = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
  let sHlavickou = 0, sPanelem = 0;
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  for (const f of vsechny) {
    const h = readFileSync(path.join(KOREN, f), 'utf8');
    if (h.indexOf('okr-hero') < 0) continue;
    sHlavickou++;
    if (h.indexOf('okr-cisla') >= 0) sPanelem++;
  }
  pravda('je co měřit — vstupních stránek s hlavičkou se našlo dost',
    sHlavickou >= 90, `našlo se ${sHlavickou}`);
  /* Devět šablon hlavičky, pět z nich čísla má. Stránky bez čísel
     (rozcestník dražeb a spol.) panel mít nemají — prázdný rámeček
     vpravo je horší než prázdné místo. Proto „většina", ne „všechny". */
  pravda('a čísla stojí v hlavičce na většině z nich',
    sPanelem >= sHlavickou * 0.8, `${sPanelem} ze ${sHlavickou}`);

  const ctx = await prohlizec.newContext({ bypassCSP: true, 
    viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  const spatne = [], uzke = [], dvakrat = [];
  for (const stranka of STRANKY) {
    await p.goto(BASE + '/' + stranka, { waitUntil: 'load' });
    await p.waitForTimeout(600);
    const m = await p.evaluate(() => {
      const hero = document.querySelector('.okr-hero');
      const panel = hero ? hero.querySelector('.okr-cisla') : null;
      /* Soused je NADPIS: úvodní odstavec z těchhle hlaviček odešel. */
      const sub = hero ? hero.querySelector('h1') : null;
      const r = (e) => { const b = e.getBoundingClientRect();
        return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
      return {
        panelVHlavicce: !!panel,
        panel: panel ? r(panel) : null,
        sub: sub ? r(sub) : null,
        /* Kolikrát jsou čísla na stránce. Přesun je stěhování, ne kopie:
           kdyby zůstala i dole, stála by tam dvakrát. */
        kolikrat: document.querySelectorAll('.okr-cisla').length,
      };
    });
    if (!m.panelVHlavicce) { spatne.push(stranka); continue; }
    if (m.kolikrat !== 1) dvakrat.push(`${stranka}: ${m.kolikrat}×`);
    /* VEDLE úvodu, ne pod ním — a obojí se musí ptát zvlášť.
       Napoprvé tu stála jen vodorovná podmínka (levý okraj panelu za
       pravým okrajem odstavce) a sabotáž ji prošla: po zrušení mřížky
       čísla spadla POD úvod, ale pořád u pravého okraje, protože se
       zarovnávají doprava sama od sebe. Vodorovně to tedy sedělo,
       vedle textu to nestálo a uprostřed hlavičky zela díra.
       Svislá podmínka je proto druhá: panel musí začínat dřív, než
       úvodní odstavec skončí. */
    if (!(m.sub && m.panel.l >= m.sub.r)) {
      uzke.push(`${stranka}: nadpis končí na x ${m.sub ? m.sub.r : '?'}, čísla začínají na x ${m.panel.l}`);
    } else if (!(m.panel.t < m.sub.b)) {
      uzke.push(`${stranka}: čísla jsou vpravo, ale až POD nadpisem — nadpis končí na y ${m.sub.b}, čísla začínají na y ${m.panel.t}`);
    }
  }
  pravda('na všech čtyřech rodinách stránek jsou čísla v hlavičce',
    spatne.length === 0, 'chybí na: ' + spatne.join(', '));
  pravda('a čísla stojí VEDLE nadpisu — vpravo a v téže výšce',
    uzke.length === 0, uzke.join('\n      '));
  pravda('a jsou na stránce jen jednou',
    dvakrat.length === 0, dvakrat.join(', '));
  await ctx.close();

  /* ===== A TOTÉŽ NA TELEFONU: ŘÁDKY ZAČÍNAJÍ NA JEDNÉ SVISLICI =====
     Naměřeno na nove-pozemky.html: tři čísla (97 / 150 / 73) se vejdou
     do jednoho řádku od 430 px. Pod tím se třetí zalomilo — a vzalo si
     s sebou svislici i odsazení 32 px, takže na 390 px začínalo na
     53 px, kdežto první číslo na 20. Byl z toho osamělý údaj zavěšený
     na čáře, která nic neodděluje.
     Od 26. 10. je z té řady MŘÍŽKA o dvou sloupcích (.okr-cisla), takže
     se nic „nezalamuje" — je dané, kde co stojí, a svislice mezi čísly
     nejsou vůbec. Měří se proto to, co z té staré vady zbylo jako
     pravidlo: každý řádek začíná na téže svislici a nic nevisí
     odsazené o kus dál. Kontrola na svislici vlevo zůstává jako past:
     kdyby se čára vrátila, chytne ji to hned. */
  {
    /* Dotyk se zapíná, i když se tu na nic neklepá: pravidla pro telefon
       visí na `@media (pointer: coarse)` a bez `hasTouch` by se měřila
       myší podoba v úzkém okně (hlídá scripts/test-zkousky-meri.mjs). */
    const ctxT = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 390, height: 900 },
      serviceWorkers: 'block', locale: 'cs-CZ', isMobile: true, hasTouch: true });
    const pt = await ctxT.newPage();
    const visici = [], zalomene = [];
    for (const stranka of STRANKY) {
      /* 559 a 560 jsou obě strany meze ve stylopisu: pod ní mřížka,
         nad ní řádek. Právě na téhle hranici to jednou prasklo —
         při 430 px se čtyři čísla vešla o tři pixely a v CI se
         zalomila, protože tam ubral šířku posuvník. */
      for (const sirka of [320, 360, 390, 430, 500, 559, 560, 680]) {
        await pt.setViewportSize({ width: sirka, height: 900 });
        await pt.goto(BASE + '/' + stranka, { waitUntil: 'load' });
        const m = await pt.evaluate(() => {
          const r = document.querySelector('.okr-cisla');
          if (!r) return null;
          const deti = [...r.children].map((e) => {
            const q = e.getBoundingClientRect(), c = getComputedStyle(e);
            return { top: Math.round(q.top), l: Math.round(q.left),
              ram: parseFloat(c.borderLeftWidth) || 0,
              t: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20) };
          });
          const radky = {};
          for (const d of deti) { (radky[d.top] = radky[d.top] || []).push(d); }
          /* Prvním v řádku je ten nejvíc vlevo — ne ten první v pořadí. */
          const prvni = Object.keys(radky).map((k) => radky[k]
            .slice().sort((a, b) => a.l - b.l)[0]);
          return { radku: Object.keys(radky).length, prvni,
            okraje: prvni.map((d) => d.l) };
        });
        if (!m || !m.prvni.length) continue;
        if (m.radku > 1) zalomene.push(`${stranka}@${sirka}`);
        for (const d of m.prvni) {
          if (d.ram > 0) visici.push(`${stranka}@${sirka}: „${d.t}" začíná řádek a má vlevo svislici`);
        }
        /* A všechny řádky musí začínat na téže svislici, jinak je to
           pořád rozházené, i kdyby čára nebyla. */
        const rozptyl = Math.max(...m.okraje) - Math.min(...m.okraje);
        if (rozptyl > 1) visici.push(`${stranka}@${sirka}: řádky začínají na ${m.okraje.join(' a ')} px`);
      }
    }
    // PŘEDPOKLAD: s jedním řádkem by kontrola pod tím neměřila nic
    pravda('na úzkém displeji stojí čísla ve dvou sloupcích, tedy na víc řádcích',
      zalomene.length > 0, 'ani na 320 px nebyl víc než jeden řádek');
    pravda('a všechny řádky začínají na téže svislici',
      visici.length === 0, visici.slice(0, 4).join('\n      '));
    await ctxT.close();
  }
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
