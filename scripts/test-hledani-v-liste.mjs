/* Test: hledání je po ruce i dole ve výpisu.
   ==================================================================
   Spuštění: node scripts/test-hledani-v-liste.mjs   (prohlížeč)

   PROČ TO VZNIKLO. Pole hledání leží v pásu, který s rolováním odjede;
   lepivá je jen lišta nad ním. Změřeno 11. 11. v prohlížeči: na 390 px
   je pole na 81 px a první nabídka na 661 px, na 1280 px pole na 150 px
   a první nabídka na 506 px. Kdo tedy sjede ke kartám — a to udělá
   každý — nemá na obrazovce hlavní funkci webu. Do lišty proto přišel
   ovladač, který hledání PŘINESE.

   CO SE HLÍDÁ A PROČ PRÁVĚ TO:
     1. Dokud je pole vidět, je ovladač SCHOVANÝ. Jinak by v liště
        stály dva ovladače jedné věci.
     2. Po odrolování ke kartám je vidět CELÝ a v liště, ne za hranou.
     3. Klepnutí přinese pole do výhledu A dá do něj kurzor. Samotné
        odrolování by znamenalo druhé klepnutí.
     4. Dotaz se v ovladači zrcadlí, aby bylo poznat, že se filtruje —
        ale ovladač NENÍ druhé vstupní pole: v liště nesmí být žádný
        <input>, jinak by vznikl druhý stav téže věci.
     5. Chytací plocha: na telefonu 44 px (prst), na monitoru aspoň 36
        (táž výška, na jaké se 11. 11. shodla sestava ovladačů).

   Měří se na dvou šířkách, protože pravidla vzhledu jsou na každé jiná
   — a právě na tom se tahle práce napoprvé zlomila: základní pravidla
   skončila v `@media (max-width:1040px)` a na monitoru z tlačítka bylo
   47 × 67 px bez rámu. Zkouška by to byla chytila.
   ================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const PRAZDNA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64');
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Hledání v liště', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

for (const [jm, W, H, NEJMENSI] of [['telefon 390', 390, 844, 44], ['monitor 1280', 1280, 900, 36]]) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block', viewport: { width: W, height: H } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return r.abort();
  });
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e).slice(0, 140)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#opp-list .opp-item', { timeout: 20000 });
  await p.waitForTimeout(600);
  zpravy.push('  · ' + jm);

  const je = await p.evaluate(() => ({
    tlacitko: !!document.getElementById('hdr-hledat'),
    pole: !!document.getElementById('map-search'),
    pas: !!document.querySelector('.mcp-hledani'),
  }));
  pravda('je co měřit: ovladač v liště, pole hledání i jeho pás',
    je.tlacitko && je.pole && je.pas, JSON.stringify(je));
  if (!je.tlacitko || !je.pole || !je.pas) { await ctx.close(); continue; }

  const nahore = await p.evaluate(() => {
    const t = document.getElementById('hdr-hledat');
    return { schovane: !!t.hidden, sirka: Math.round(t.getBoundingClientRect().width) };
  });
  pravda('dokud je pole hledání vidět, ovladač v liště je schovaný',
    nahore.schovane && nahore.sirka === 0, JSON.stringify(nahore));

  /* V LIŠTĚ NESMÍ BÝT DRUHÉ VSTUPNÍ POLE. Dvě kopie jednoho stavu se
     rozejdou při první změně — na tomhle webu se to stalo s počtem
     filtrů. Kontrola je tu proto, aby „zlepšení" na druhý input
     spadlo tady, ne až v užívání. */
  const vstupyVListe = await p.evaluate(() =>
    document.querySelectorAll('#header input, #header textarea').length);
  pravda('v liště není žádné druhé vstupní pole', vstupyVListe === 0,
    'vstupů v liště: ' + vstupyVListe);

  await p.evaluate(() => {
    const k = document.querySelector('#opp-list .opp-item');
    if (k) window.scrollTo(0, k.getBoundingClientRect().top + window.pageYOffset - 100);
  });
  await p.waitForTimeout(700);
  const dole = await p.evaluate(() => {
    const t = document.getElementById('hdr-hledat');
    const r = t.getBoundingClientRect();
    const hl = document.getElementById('header').getBoundingClientRect();
    const pole = document.getElementById('map-search').getBoundingClientRect();
    return { schovane: !!t.hidden, sirka: Math.round(r.width), vyska: Math.round(r.height),
      celyVidet: r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.width > 0,
      vListe: r.top >= hl.top - 1 && r.bottom <= hl.bottom + 1,
      jmeno: (t.textContent || '').trim(),
      poleJeMimo: pole.bottom <= 0 || pole.top >= window.innerHeight };
  });
  pravda('pole hledání je po odrolování ke kartám opravdu mimo obrazovku',
    dole.poleJeMimo, 'kdyby nebylo, neměla by zkouška co měřit');
  pravda('a ovladač v liště se ukáže', !dole.schovane && dole.sirka > 0, JSON.stringify(dole));
  pravda('je vidět celý a leží v liště', dole.celyVidet && dole.vListe, JSON.stringify(dole));
  pravda(`chytací plocha aspoň ${NEJMENSI} px`, dole.vyska >= NEJMENSI, 'výška: ' + dole.vyska);
  pravda('a má přístupné jméno slovem', /\S/.test(dole.jmeno), 'jméno: „' + dole.jmeno + '"');

  /* NA SCHOVANÉ TLAČÍTKO SE NEKLEPE — VADA SE POJMENUJE.
     Napsal jsem tu nejdřív prosté `p.click('#hdr-hledat')`. Sabotáž
     (pás se nepozoruje, tlačítko se nikdy neukáže) nechala klepnutí
     třicet sekund čekat a zkouška pak PADLA výjimkou místo toho, aby
     vadu pojmenovala — právě to vytýká scripts/zkouska-pad.mjs. Obě
     kontroly se proto hlásí jako NEPROŠLÉ a klepání se vynechá. */
  const lzeKlepnout = !dole.schovane && dole.celyVidet;
  const po = lzeKlepnout
    ? await (async () => {
      await p.click('#hdr-hledat');
      await p.waitForTimeout(1100);
      return p.evaluate(() => {
        const pole = document.getElementById('map-search');
        const r = pole.getBoundingClientRect();
        return { videt: r.top >= 0 && r.bottom <= window.innerHeight,
          zamereno: document.activeElement === pole };
      });
    })()
    : { videt: false, zamereno: false, proc: 'ovladač nebyl vidět, nedalo se na něj klepnout' };
  pravda('klepnutí přinese pole hledání do výhledu', po.videt, JSON.stringify(po));
  pravda('a dá do něj kurzor (bez druhého klepnutí)', po.zamereno, JSON.stringify(po));

  /* ZRCADLENÍ: dotaz se v ovladači ukáže, ať je poznat, že se filtruje.
     Dlouhý dotaz se krátí, jinak by lišta přetekla. */
  await p.fill('#map-search', 'Nové Město na Moravě a ještě dál');
  await p.waitForTimeout(250);
  const zrc = await p.evaluate(() => (document.getElementById('hdr-hledat-t').textContent || '').trim());
  pravda('ovladač zrcadlí dotaz', /^Nové Město/.test(zrc), 'v ovladači stojí: „' + zrc + '"');
  pravda('a dlouhý dotaz zkrátí', zrc.length <= 20 && /…$/.test(zrc),
    zrc.length + ' znaků: „' + zrc + '"');

  await p.fill('#map-search', '');
  await p.waitForTimeout(250);
  const prazdne = await p.evaluate(() => (document.getElementById('hdr-hledat-t').textContent || '').trim());
  pravda('bez dotazu říká, co dělá', prazdne === 'Hledat', 'stojí tam: „' + prazdne + '"');

  pravda('a nic se u toho v prohlížeči nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  await ctx.close();
}
await prohlizec.close();

console.log('\nHledání je po ruce i dole ve výpisu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Hledání v liště: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
