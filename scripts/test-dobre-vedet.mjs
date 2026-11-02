// Test: výklad na úvodní stránce se neroluje, ale rozbaluje.
//
// Spuštění: node scripts/test-dobre-vedet.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// PROČ VZNIKL. Pod mapou a výpisem stálo devět oddílů. Čtyři z nich byly
// výklad — pět druhů příležitostí, tři kroky, slovníček (18 pojmů)
// a časté dotazy (9 otázek) — a na telefonu 390 px zabíraly 3 905 px,
// tedy 4,3 obrazovky z celkových 20,5. Majitel 2. 11.: „když člověk
// jede webem dolů, je tam přeplácané páté přes devátý zbytečného textu
// — nech tam jen to důležité a co lidi opravdu zajímá."
//
// Co se tu hlídá — a proč zrovna tohle:
//  • VÝKLAD JE SLOŽENÝ. Čtyři řádky místo čtyř oddílů; měří se výška
//    celého oddílu „Dobré vědět", ne výška stránky — ta se mění s tím,
//    kolik je právě nabídek, a mez na ni by padala podle dat.
//  • ALE TEXT NIKAM NEZMIZEL. To je ta druhá polovina: „kratší stránka"
//    se dá splnit i smazáním obsahu. Počítají se tedy pojmy, otázky,
//    karty druhů i kroky — všechny musí být dál v dokumentu.
//  • ZAVŘENO PŘI PRVNÍ NÁVŠTĚVĚ. Jinak by složení nic neušetřilo.
//  • ODKAZ ZE ČLÁNKŮ HO ROZBALÍ. Čtyři články vedou na
//    „index.html#slovnicek"; kdyby řádek zůstal zavřený, přivedl by
//    člověka k odpovědi, kterou nevidí.
//  • A PRSTEM SE NA ŘÁDEK TREFÍ (44 px).
/* SERVISNÍ PRACOVNÍK VYPNUTÝ: sw.js volá `skipWaiting()` i `clients.claim()`.
   (Viz CLAUDE.md.) */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Dobré vědět', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nVýklad na úvodní stránce se rozbaluje');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Dobré vědět: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Naměřeno 2. 11. na telefonu 390 px: celý oddíl 598 px se čtyřmi
   zavřenými řádky. Mez je 900 px — tedy prostor na pátý řádek i na
   větší písmo, ale ne na vrácení rozbaleného výkladu (ten měl 3 905 px
   a i jediný z nich, slovníček, 1 222 px). */
const MEZ_ODDILU = 900;

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
async function navstiv(hash) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e).slice(0, 120)));
  await p.goto(`${BASE}/index.html${hash || ''}`, { waitUntil: 'load' });
  await p.waitForSelector('#dobre-vedet', { timeout: 15000 });
  /* Čeká se na dokončení startu (výpis a mapa se dokreslují ve dvou
     rámech), ne na pevný čas: dokud se kreslí, výška oddílu se hýbe. */
  await p.waitForFunction(() => !!document.querySelector('#opp-list li, #opp-list article'),
    null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(600);
  return { ctx, p, chybyJs };
}

/* ---- 1) PRVNÍ NÁVŠTĚVA ------------------------------------------- */
{
  const { ctx, p, chybyJs } = await navstiv('');
  const m = await p.evaluate(() => {
    const sek = document.getElementById('dobre-vedet');
    const radky = [...document.querySelectorAll('.dv')];
    return {
      vyska: Math.round(sek.getBoundingClientRect().height),
      radku: radky.length,
      otevrenych: radky.filter((d) => d.open).length,
      terce: radky.map((d) => {
        const s = d.querySelector('.dv-s');
        return s ? Math.round(s.getBoundingClientRect().height) : 0;
      }),
      popisky: radky.map((d) => ((d.querySelector('.dv-t') || {}).textContent || '').trim()),
      /* Obsah: počítá se v DOKUMENTU, ne na obrazovce — zavřený
         <details> má nulovou výšku, ale prvky v něm jsou. */
      pojmu: document.querySelectorAll('#slovnicek .gl-item').length,
      otazek: document.querySelectorAll('#faq .faq-item').length,
      karet: document.querySelectorAll('#stavy .status-card').length,
      kroku: document.querySelectorAll('#jak-funguje .step').length,
      /* A že po starých oddílech nezbyl druhý, plný výskyt téhož. */
      sekciStavy: document.querySelectorAll('section#stavy').length,
      sekciSlovnicek: document.querySelectorAll('section#slovnicek').length,
    };
  });
  pravda('výklad je složený do řádků, ne do oddílů',
    m.radku === 4, `řádků: ${m.radku}`);
  pravda(`a celý oddíl se vejde do ${MEZ_ODDILU} px`,
    m.vyska > 0 && m.vyska <= MEZ_ODDILU, `naměřeno ${m.vyska} px`);
  pravda('při první návštěvě je zavřený každý řádek',
    m.otevrenych === 0, `otevřeno: ${m.otevrenych}`);
  pravda('a na každý se dá trefit prstem (44 px)',
    m.terce.length === 4 && m.terce.every((v) => v >= 44), `výšky terčů: ${m.terce.join(', ')}`);
  pravda('a na každém stojí, co v něm je',
    m.popisky.length === 4 && m.popisky.every((t) => t.length > 8), JSON.stringify(m.popisky));

  /* TEXT NIKAM NEZMIZEL. */
  pravda('slovníček má dál všech 18 pojmů', m.pojmu === 18, `nalezeno ${m.pojmu}`);
  pravda('a časté dotazy všech 9 otázek', m.otazek === 9, `nalezeno ${m.otazek}`);
  pravda('a druhy příležitostí všech 5 karet', m.karet === 5, `nalezeno ${m.karet}`);
  pravda('a postup všechny 3 kroky', m.kroku === 3, `nalezeno ${m.kroku}`);
  pravda('a po starých oddílech nezůstala druhá kopie',
    m.sekciStavy === 0 && m.sekciSlovnicek === 0,
    `section#stavy: ${m.sekciStavy}, section#slovnicek: ${m.sekciSlovnicek}`);

  /* Klepnutím se to otevře — bez toho je složení jen schování. */
  await p.click('#slovnicek .dv-s');
  await p.waitForTimeout(400);
  const poKlepnuti = await p.evaluate(() => {
    const d = document.getElementById('slovnicek');
    const prvni = document.querySelector('#slovnicek .gl-item');
    return { open: !!(d && d.open),
      videtPojem: prvni ? prvni.getBoundingClientRect().height > 0 : false };
  });
  pravda('klepnutí na řádek ho rozbalí', poKlepnuti.open, 'zůstal zavřený');
  pravda('a pojem je pak doopravdy vidět', poKlepnuti.videtPojem, 'výška pojmu je nulová');
  pravda('a stránka přitom nespadne', chybyJs.length === 0, chybyJs[0]);
  await ctx.close();
}

/* ---- 2) ODKAZ ZE ČLÁNKŮ ------------------------------------------ */
{
  const { ctx, p, chybyJs } = await navstiv('#slovnicek');
  const m = await p.evaluate(() => {
    const radky = [...document.querySelectorAll('.dv')];
    const prvni = document.querySelector('#slovnicek .gl-item');
    return { otevrene: radky.filter((d) => d.open).map((d) => d.id),
      videtPojem: prvni ? prvni.getBoundingClientRect().height > 0 : false };
  });
  pravda('odkaz „index.html#slovnicek" ten řádek rozbalí',
    m.otevrene.indexOf('slovnicek') >= 0, `otevřené: ${JSON.stringify(m.otevrene)}`);
  pravda('a pojmy jsou vidět', m.videtPojem, 'výška prvního pojmu je nulová');
  /* A JEN TEN JEDEN. Rozbalit kotvou všechno by bylo totéž jako nemít
     nic složené. */
  pravda('a žádný další se tím neotevře',
    m.otevrene.length === 1, `otevřené: ${JSON.stringify(m.otevrene)}`);
  pravda('a stránka přitom nespadne', chybyJs.length === 0, chybyJs[0]);
  await ctx.close();
}

await prohlizec.close();
hotovo();
