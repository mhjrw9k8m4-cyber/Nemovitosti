/* Test: okno „Stáhnout výběr" — co se stáhne, je to, co okno slíbilo.
   ==================================================================
   Spuštění: node scripts/test-vyvoz-okno.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Dřív bylo stažení jedno klepnutí a hned soubor: nešlo říct co ani
   v jakém tvaru, a tabulka nesla přesně to, co bylo vidět na kartě.
   Teď je mezi klepnutím a souborem okno se dvěma volbami, a tím pádem
   i nový druh chyby: okno může slíbit jedno a soubor přinést jiné.

   Skládání řádků hlídá scripts/test-vyvoz.mjs bez prohlížeče. Tady se
   měří jen to, co se bez prohlížeče měřit nedá:
     · klepnutí na tlačítko otevře OKNO, a ne hned stahování;
     · počet v okně se rovná počtu řádků ve stáhnutém souboru;
     · volba, pod kterou by byl prázdný soubor, se nenabízí (a sama se
       nabídne, jakmile si člověk pozemek uloží);
     · volba tvaru mění příponu i obsah (GPX není CSV);
     · BOM se připne až při stahování — bez něj český Excel rozsype
       diakritiku, a v textu modulu být nesmí;
     · okno se zavře Escapem i klepnutím mimo.
   ================================================================== */
import { chromium } from 'playwright-core';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
/* Když zkouška spadne v polovině, musí být vidět, KDE skončila — jinak
   zbyde jen „timeout" a člověk hledá od začátku. Proto se hlášení
   vypisuje i při spadnutí, a to, co se nedoměřilo, se přizná. */
function hotovo(spadlo) {
  console.log('\nOkno „Stáhnout výběr"');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Okno stahování: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.');
    process.exit(1);
  }
  process.exit(0);
}
/* Čísla v okně se píšou s nezlomitelnou mezerou po tisících. Pro
   porovnání s počtem řádků je potřeba zpátky obyčejné číslo. */
const cislo = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10);

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    acceptDownloads: true,
  });
  const p = await ctx.newPage();
  const chybyKonzole = [];
  p.on('pageerror', (e) => chybyKonzole.push(String(e)));
  /* Čistý začátek: uložené a poznámky z dřívějších sekcí by počty
     v okně posunuly a měřilo by se něco jiného, než co se píše. */
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForSelector('#mc-vyvoz', { timeout: 15000 });

  /* --- 1) Tlačítko otevírá okno, nestahuje ------------------------- */
  const vrstva = p.locator('#vyv-vrstva');
  pravda('okno je před klepnutím zavřené', !(await vrstva.isVisible()),
    'okno #vyv-vrstva je vidět, ještě než se na tlačítko klepne');

  /* Kdyby tlačítko stahovalo samo, přišel by soubor a okno by se
     neotevřelo — tohle čekání rozliší obojí. */
  let stazeniHned = null;
  const sliboStazeni = p.waitForEvent('download', { timeout: 2500 })
    .then((d) => { stazeniHned = d; }).catch(() => {});
  await p.click('#mc-vyvoz');
  await sliboStazeni;
  pravda('klepnutí na tlačítko otevře okno', await vrstva.isVisible(),
    'okno se neotevřelo');
  pravda('a nestahuje nic samo (nejdřív se zeptá)', stazeniHned === null,
    stazeniHned ? 'stáhlo se ' + stazeniHned.suggestedFilename() : '');

  const popisTlacitka = (await p.textContent('#mc-vyvoz')).trim();
  pravda('v tlačítku je napsané, kolik se stáhne', /\(\s*[\d  ]+\)/.test(popisTlacitka),
    popisTlacitka);

  /* --- 2) Prázdná volba se nenabízí -------------------------------- */
  const stav = async () => p.evaluate(() => {
    const dej = (k) => {
      const v = document.querySelector('input[value="' + k + '"]');
      return { vypnuto: !!(v && v.disabled), zvoleno: !!(v && v.checked) };
    };
    const n = (k) => (document.getElementById('vyv-n-' + k) || {}).textContent || '';
    return {
      vypis: { ...dej('vypis'), pocet: n('vypis') },
      ulozene: { ...dej('ulozene'), pocet: n('ulozene') },
      poznamky: { ...dej('poznamky'), pocet: n('poznamky') },
      okNejde: !!(document.getElementById('vyv-ok') || {}).disabled,
    };
  });
  const s1 = await stav();
  pravda('bez uložených pozemků se volba „uložené" nenabízí',
    s1.ulozene.vypnuto && cislo(s1.ulozene.pocet) === 0,
    JSON.stringify(s1.ulozene));
  pravda('a bez poznámek ani volba „jen s poznámkou"',
    s1.poznamky.vypnuto && cislo(s1.poznamky.pocet) === 0,
    JSON.stringify(s1.poznamky));
  pravda('výpis se naopak nabízí a je zvolený',
    !s1.vypis.vypnuto && s1.vypis.zvoleno && cislo(s1.vypis.pocet) > 0,
    JSON.stringify(s1.vypis));
  pravda('a tlačítko Stáhnout jde zmáčknout', !s1.okNejde, 'je vypnuté');

  /* --- 3) Počet v okně = počet řádků v souboru -------------------- */
  const slibVypis = cislo(s1.vypis.pocet);
  const [souborCsv] = await Promise.all([
    p.waitForEvent('download', { timeout: 20000 }),
    p.click('#vyv-ok'),
  ]);
  const cestaCsv = await souborCsv.path();
  const { readFileSync } = await import('node:fs');
  const surovy = readFileSync(cestaCsv);
  const textCsv = surovy.toString('utf8');
  pravda('soubor se jmenuje .csv', /\.csv$/.test(souborCsv.suggestedFilename()),
    souborCsv.suggestedFilename());
  /* BOM v modulu být nesmí (hlídá test-vyvoz.mjs), ve STÁHNUTÉM souboru
     naopak musí — jinak český Excel přečte diakritiku jako zmatek. */
  pravda('stáhnutý soubor začíná značkou BOM (jinak Excel rozsype diakritiku)',
    surovy[0] === 0xEF && surovy[1] === 0xBB && surovy[2] === 0xBF,
    'první bajty: ' + [...surovy.slice(0, 3)].map((b) => b.toString(16)).join(' '));
  const radky = textCsv.replace(/^﻿/, '').trim().split('\r\n');
  pravda(`řádků je tolik, kolik okno slíbilo (${slibVypis})`,
    radky.length - 1 === slibVypis,
    `okno slíbilo ${slibVypis}, v souboru je ${radky.length - 1} řádků`);
  pravda('a hlavička nese nové sloupce, ne jen opsanou kartu',
    /Zeměpisná šířka/.test(radky[0]) && /Moje poznámka/.test(radky[0]) && /Dní do dražby/.test(radky[0]),
    radky[0]);
  pravda('okno se po stažení samo zavřelo', !(await vrstva.isVisible()),
    'zůstalo otevřené');

  /* --- 4) Uložený pozemek volbu zapne ----------------------------- */
  /* Past, kterou to hlídá: kdyby se počty spočítaly jen jednou při
     načtení, zůstala by volba vypnutá i s uloženým pozemkem. */
  await p.click('.opp-item .opp-fav');
  await p.waitForTimeout(400);
  await p.click('#mc-vyvoz');
  await p.waitForTimeout(300);
  const s2 = await stav();
  pravda('po uložení jednoho pozemku se volba „uložené" nabídne',
    !s2.ulozene.vypnuto && cislo(s2.ulozene.pocet) === 1,
    JSON.stringify(s2.ulozene));

  /* --- 5) Volba tvaru mění obsah i příponu ------------------------ */
  await p.click('#vyv-vrstva input[value="ulozene"]');
  await p.click('#vyv-vrstva input[value="gpx"]');
  await p.waitForTimeout(200);
  const popisGpx = (await p.textContent('#vyv-popis')).trim();
  pravda('popis u GPX mluví o navigaci, ne o sloupcích',
    /navigac/i.test(popisGpx) && !/sloupc/i.test(popisGpx), popisGpx);
  const [souborGpx] = await Promise.all([
    p.waitForEvent('download', { timeout: 20000 }),
    p.click('#vyv-ok'),
  ]);
  const textGpx = readFileSync(await souborGpx.path(), 'utf8');
  pravda('soubor se jmenuje .gpx', /\.gpx$/.test(souborGpx.suggestedFilename()),
    souborGpx.suggestedFilename());
  pravda('a v názvu je poznat, co je uvnitř',
    /ulozene/.test(souborGpx.suggestedFilename()), souborGpx.suggestedFilename());
  pravda('obsah je GPX, ne tabulka',
    /^<\?xml/.test(textGpx) && /<gpx /.test(textGpx) && textGpx.indexOf(';Okres;') === -1,
    textGpx.slice(0, 80));
  pravda('a je v něm bod toho jednoho uloženého pozemku',
    (textGpx.match(/<wpt /g) || []).length === 1,
    String((textGpx.match(/<wpt /g) || []).length));

  /* --- 6) Zavírání ------------------------------------------------ */
  await p.click('#mc-vyvoz');
  await p.waitForTimeout(200);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  pravda('Escape okno zavře', !(await vrstva.isVisible()), 'zůstalo otevřené');
  await p.click('#mc-vyvoz');
  await p.waitForTimeout(200);
  /* Klepnutí mimo okno = na samotnou vrstvu, do jejího horního okraje,
     kde panel není. */
  const r = await vrstva.boundingBox();
  await p.mouse.click(r.x + r.width / 2, r.y + 4);
  await p.waitForTimeout(200);
  pravda('klepnutí mimo okno ho taky zavře', !(await vrstva.isVisible()),
    'zůstalo otevřené');
  /* A naopak: klepnutí DO okna ho zavřít nesmí — jinak by se nedalo
     nic zvolit. */
  await p.click('#mc-vyvoz');
  await p.waitForTimeout(200);
  await p.click('#vyv-popis');
  await p.waitForTimeout(200);
  pravda('ale klepnutí dovnitř okna ho nezavře', await vrstva.isVisible(),
    'zavřelo se při klepnutí do okna');

  /* --- 7) Klávesnice ---------------------------------------------
     Okno se hlásí jako `aria-modal`, čímž slibuje, že za ním nic není.
     Kdyby tabulátor za okraj utekl, fokus by skončil v obsahu, který
     není vidět — a ovládání klávesnicí by se ztratilo. */
  /* Z předchozí části okno zůstalo otevřené a zakrývá celou stránku,
     takže na tlačítko pod ním se klepnout nedá — a tak to má být. */
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  await p.click('#mc-vyvoz');
  await p.waitForTimeout(200);
  const uvnitr = async () => p.evaluate(() =>
    !!(document.activeElement && document.activeElement.closest('#vyv-vrstva')));
  pravda('po otevření je fokus v okně', await uvnitr(),
    await p.evaluate(() => document.activeElement && document.activeElement.outerHTML.slice(0, 70)));
  /* Dost stisků, aby se obešly všechny prvky okna i kdyby jich přibylo. */
  let uteklo = null;
  for (let i = 0; i < 14 && uteklo === null; i++) {
    await p.keyboard.press('Tab');
    if (!(await uvnitr())) uteklo = i + 1;
  }
  pravda('a tabulátor z okna neuteče ani po 14 stiscích', uteklo === null,
    uteklo ? `utekl při ${uteklo}. stisku na ` + (await p.evaluate(() =>
      document.activeElement ? document.activeElement.outerHTML.slice(0, 70) : '—')) : '');
  /* A po zavření se fokus vrátí tam, odkud okno vyšlo. Jinak po Escape
     spadne na začátek dokumentu a k výpisu se musí protabovat znovu. */
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  pravda('po zavření je fokus zpátky na tlačítku',
    await p.evaluate(() => document.activeElement && document.activeElement.id === 'mc-vyvoz'),
    await p.evaluate(() => document.activeElement && document.activeElement.outerHTML.slice(0, 70)));

  /* --- 8) Na telefonu -------------------------------------------
     Web se používá hlavně z telefonu, a okno má šest voleb, odstavec
     a dvě tlačítka. Měří se to, na čem takové okno obvykle praskne:
     že se „Stáhnout" ocitne pod okrajem obrazovky a nejde na něj
     doklepnout, nebo že se tlačítka zmáčknou na nedotknutelnou výšku. */
  {
    const ctxT = await ctx.browser().newContext({
      viewport: { width: 360, height: 640 },
      isMobile: true, hasTouch: true, locale: 'cs-CZ',
      serviceWorkers: 'block', acceptDownloads: true,
    });
    const t = await ctxT.newPage();
    await t.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await t.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await t.waitForSelector('#mc-vyvoz', { timeout: 15000 });
    await t.click('#mc-vyvoz');
    await t.waitForTimeout(400);
    /* NEJVYŠŠÍ PODOBA OKNA, ne ta nejpříznivější: u GPX je popis o dvě
       věty delší než u tabulky, takže okno je vyšší — a právě tehdy
       „Stáhnout" nejspíš sklouzne pod okraj obrazovky. */
    /* Volba se přepíná z JS, ne klepnutím: kdyby okno přetékalo pod
       okraj, klepnutí by neprošlo a zkouška by spadla DŘÍV, než by se
       přetečení naměřilo — a hlásila by „timeout" místo toho, co je
       opravdu špatně. Že se na volby doopravdy dá klepnout, hlídají
       kontroly 44 px a „Stáhnout je vidět" o pár řádků níž. */
    await t.evaluate(() => {
      const r = document.querySelector('#vyv-vrstva input[value="gpx"]');
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await t.waitForTimeout(250);
    const m = await t.evaluate(() => {
      const okno = document.querySelector('.vyv-okno');
      const ok = document.getElementById('vyv-ok');
      const zrus = document.getElementById('vyv-zrus');
      const r = ok.getBoundingClientRect(), ro = okno.getBoundingClientRect();
      const volby = [...document.querySelectorAll('.vyv-volba')]
        .map((e) => Math.round(e.getBoundingClientRect().height));
      return {
        tlacitkoVidet: r.bottom <= window.innerHeight + 0.5 && r.top >= -0.5,
        vysOk: Math.round(r.height), vysZrus: Math.round(zrus.getBoundingClientRect().height),
        oknoVejde: Math.round(ro.width) <= 360,
        presah: Math.round(ro.bottom - window.innerHeight),
        volby,
        vodorovne: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    pravda('okno se na telefon vejde na šířku', m.oknoVejde && m.vodorovne <= 0,
      `šířka okna ${m.oknoVejde ? 'ok' : 'přetéká'}, vodorovné posouvání ${m.vodorovne} px`);
    pravda('a tlačítko „Stáhnout" je vidět bez posouvání stránky',
      m.tlacitkoVidet, `přesah okna pod okraj: ${m.presah} px`);
    pravda('tlačítka v okně jdou trefit prstem (44 px)',
      m.vysOk >= 44 && m.vysZrus >= 44, `Stáhnout ${m.vysOk} px, Zrušit ${m.vysZrus} px`);
    pravda('a volby taky', m.volby.every((v) => v >= 44), m.volby.join(', ') + ' px');
    /* A stáhnout se z telefonu musí dát doopravdy, ne jen vypadat. */
    const [sT] = await Promise.all([
      t.waitForEvent('download', { timeout: 20000 }),
      t.locator('#vyv-ok').dispatchEvent('click'),
    ]);
    pravda('a stažení z telefonu projde', /\.gpx$/.test(sT.suggestedFilename()),
      sT.suggestedFilename());
    await ctxT.close();
  }

  pravda('a za celou dobu nespadlo v konzoli nic',
    chybyKonzole.length === 0, chybyKonzole.join('\n      '));
  await prohlizec.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
hotovo();
