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
   napravo od úvodního odstavce, a že nejsou na stránce dvakrát.
   Markup skládá scripts/generate-region-pages.mjs (dvousloupcovaHlavicka).
   ================================================================== */
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = new URL('..', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:8310';
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
    if (h.indexOf('okr-panel') >= 0) sPanelem++;
  }
  pravda('je co měřit — vstupních stránek s hlavičkou se našlo dost',
    sHlavickou >= 90, `našlo se ${sHlavickou}`);
  /* Devět šablon hlavičky, pět z nich čísla má. Stránky bez čísel
     (rozcestník dražeb a spol.) panel mít nemají — prázdný rámeček
     vpravo je horší než prázdné místo. Proto „většina", ne „všechny". */
  pravda('a čísla se přesunula do hlavičky na většině z nich',
    sPanelem >= sHlavickou * 0.8, `${sPanelem} ze ${sHlavickou}`);

  const ctx = await prohlizec.newContext({
    viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  const spatne = [], uzke = [], dvakrat = [];
  for (const stranka of STRANKY) {
    await p.goto(BASE + '/' + stranka, { waitUntil: 'load' });
    await p.waitForTimeout(600);
    const m = await p.evaluate(() => {
      const hero = document.querySelector('.okr-hero');
      const panel = hero ? hero.querySelector('.okr-panel') : null;
      const sub = hero ? hero.querySelector('.sub') : null;
      const r = (e) => { const b = e.getBoundingClientRect();
        return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
      return {
        panelVHlavicce: !!panel,
        panel: panel ? r(panel) : null,
        sub: sub ? r(sub) : null,
        /* Kolikrát jsou čísla na stránce. Přesun je stěhování, ne kopie:
           kdyby zůstala i dole, stála by tam dvakrát. */
        kolikrat: document.querySelectorAll('.okr-stats').length,
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
      uzke.push(`${stranka}: úvod končí na x ${m.sub ? m.sub.r : '?'}, panel začíná na x ${m.panel.l}`);
    } else if (!(m.panel.t < m.sub.b)) {
      uzke.push(`${stranka}: panel je vpravo, ale až POD úvodem — úvod končí na y ${m.sub.b}, panel začíná na y ${m.panel.t}`);
    }
  }
  pravda('na všech čtyřech rodinách stránek je panel s čísly v hlavičce',
    spatne.length === 0, 'chybí na: ' + spatne.join(', '));
  pravda('a čísla stojí VEDLE úvodního odstavce — vpravo a v téže výšce',
    uzke.length === 0, uzke.join('\n      '));
  pravda('a jsou na stránce jen jednou — je to stěhování, ne kopie',
    dvakrat.length === 0, dvakrat.join(', '));
  await ctx.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
