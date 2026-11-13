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
import { pricinaChyb } from './chyby-hlaska.mjs';
import { naSeznam, otevriNastroje } from './zkouska-pohled.mjs';
import { hlasPad } from './zkouska-pad.mjs';
/* ČEKÁ SE NA STAV, NE NA HODINKY — viz scripts/zkouska-pripraveno.mjs. */
import { pripravenoKdyz } from './zkouska-pripraveno.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Okno stahování', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
/* Shoda dvou hodnot. Vypisuje OBĚ, protože „neprošlo" bez čísel
   znamená hledat od začátku; u pole se porovnává přes JSON, ať se
   neřeší pořadí uvozovek. */
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  pravda(popis, a === b, a === b ? '' : `čekáno ${b}, vyšlo ${a}`);
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
    console.log('::error::Okno stahování: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
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
  const ctx = await prohlizec.newContext({ bypassCSP: true, 
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
  // Tlačítko stahování stojí v nářadí VÝPISU, a ten je v mapovém pohledu skrytý.
  await naSeznam(p);
  /* Nářadí je od 13. 11. pod otvíračem „Další akce"; bez jeho
     otevření na ně klepnutí nedosáhne. */
  await otevriNastroje(p);
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
    const ctxT = await ctx.browser().newContext({ bypassCSP: true, 
      viewport: { width: 360, height: 640 },
      isMobile: true, hasTouch: true, locale: 'cs-CZ',
      serviceWorkers: 'block', acceptDownloads: true,
    });
    const t = await ctxT.newPage();
    await t.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await t.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    // Na telefonu je výpis s nářadím skrytý, dokud se nepřepne z mapy.
    await naSeznam(t);
    /* Nářadí je od 13. 11. pod otvíračem „Další akce"; bez jeho
       otevření na ně klepnutí nedosáhne. */
    await otevriNastroje(t);
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
    /* Popis okna přepisuje `vyvozPopisStav()` v js/main.js synchronně
       v obsluze `change`, takže se čeká jen na to, že se opravdu
       přepsal na variantu GPX — ne na hodinky. Rozvržení a přetečení,
       o které tu jde, měří kontroly pod tím. */
    await pripravenoKdyz(t, () => /do navigace/.test(
      (document.getElementById('vyv-popis') || {}).textContent || ''), null, 5000);
    const m = await t.evaluate(() => {
      const okno = document.querySelector('.vyv-okno');
      const ok = document.getElementById('vyv-ok');
      const zrus = document.getElementById('vyv-zrus');
      const r = ok.getBoundingClientRect(), ro = okno.getBoundingClientRect();
      /* JEN VOLBY, KTERÉ JSOU VIDĚT. Okno schovává skupinu, která
         k vybranému tvaru nepatří — u bodů do navigace sloupce,
         u tabulky počet bodů. Schovaná volba má rect 0×0; měřit ji
         jako chytací plochu nedává smysl, na co se nedá klepnout.
         Počet změřených se vrací a kontrola níž trvá na tom, aby
         nebyl nula — jinak by „všechny jsou aspoň 44 px" prošlo
         i nad prázdným seznamem. */
      const volby = [...document.querySelectorAll('.vyv-volba')]
        .map((e) => e.getBoundingClientRect())
        .filter((r2) => r2.width > 0 && r2.height > 0)
        .map((r2) => Math.round(r2.height));
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
    pravda('a volby taky', m.volby.length > 0 && m.volby.every((v) => v >= 44),
      m.volby.length ? m.volby.join(', ') + ' px' : 'nezměřila se ani jedna volba');
    /* A stáhnout se z telefonu musí dát doopravdy, ne jen vypadat. */
    const [sT] = await Promise.all([
      t.waitForEvent('download', { timeout: 20000 }),
      t.locator('#vyv-ok').dispatchEvent('click'),
    ]);
    pravda('a stažení z telefonu projde', /\.gpx$/.test(sT.suggestedFilename()),
      sT.suggestedFilename());
    await ctxT.close();
  }

  /* --- NÁHLED SLIBUJE TOTÉŽ, CO SOUBOR OPRAVDU NESE --------------
   * Okno nově ukazuje první řádky tabulky. Kdyby se náhled skládal
   * jinak než soubor (třeba jiným pořadím sloupců nebo jinou sadou),
   * byl by horší než žádný: člověk by podle něj rozhodoval a dostal
   * něco jiného. Proto se čte náhled Z OKNA a porovnává se se
   * SKUTEČNĚ STAŽENÝM souborem, ne s tím, co si zkouška myslí.
   */
  {
    const ctxN = await prohlizec.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block', acceptDownloads: true });
    const n = await ctxN.newPage();
    await n.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await n.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await naSeznam(n);
    /* Nářadí je od 13. 11. pod otvíračem „Další akce"; bez jeho
       otevření na ně klepnutí nedosáhne. */
    await otevriNastroje(n);
    await n.waitForSelector('#mc-vyvoz', { timeout: 15000 });
    await n.click('#mc-vyvoz');
    await n.waitForSelector('#vyv-vrstva:not([hidden])', { timeout: 15000 });
    await pripravenoKdyz(n, () => document.querySelectorAll('#vyv-tab th').length > 0, null, 8000);

    const zOkna = await n.evaluate(() => ({
      hlavicka: [...document.querySelectorAll('#vyv-tab th')].map((e) => e.textContent),
      prvni: [...document.querySelectorAll('#vyv-tab tbody tr:first-child td')].map((e) => e.textContent),
      radku: document.querySelectorAll('#vyv-tab tbody tr').length,
    }));
    pravda('náhled v okně má hlavičku i řádky', zOkna.hlavicka.length > 0 && zOkna.radku > 0,
      `sloupců ${zOkna.hlavicka.length}, řádků ${zOkna.radku}`);

    const [sN] = await Promise.all([
      n.waitForEvent('download', { timeout: 20000 }),
      n.locator('#vyv-ok').dispatchEvent('click'),
    ]);
    const text = readFileSync(await sN.path(), 'utf8').replace(/^﻿/, '');
    const radky = text.trim().split('\r\n');
    je('hlavička v náhledu je hlavička souboru', radky[0].split(';').map((x) => x.replace(/^"|"$/g, '')),
      zOkna.hlavicka);
    /* První řádek se čte jen na začátek: buňka s odkazem bývá dlouhá
       a uvozovek se tu netýká nic, co by stálo za vlastní čtečku. */
    const prvniZeSouboru = radky[1].split(';').slice(0, 4);
    je('a první řádek v náhledu je první řádek souboru',
      prvniZeSouboru, zOkna.prvni.slice(0, 4));

    /* --- STRUČNÁ SADA OPRAVDU UBERE SLOUPCE ---------------------- */
    await n.click('#mc-vyvoz');
    await n.waitForSelector('#vyv-vrstva:not([hidden])', { timeout: 15000 });
    await n.check('input[name="vyv-sl"][value="strucne"]');
    await pripravenoKdyz(n, () => document.querySelectorAll('#vyv-tab th').length < 20, null, 5000);
    const [sS] = await Promise.all([
      n.waitForEvent('download', { timeout: 20000 }),
      n.locator('#vyv-ok').dispatchEvent('click'),
    ]);
    const kratky = readFileSync(await sS.path(), 'utf8').replace(/^﻿/, '').trim().split('\r\n');
    pravda('stručná sada má míň sloupců než plná',
      kratky[0].split(';').length < radky[0].split(';').length,
      `stručná ${kratky[0].split(';').length}, plná ${radky[0].split(';').length}`);
    je('a stejně řádků (ubírají se sloupce, ne nabídky)',
      kratky.length, radky.length);
    pravda('a parcelní číslo v ní je (bez něj se pozemek v katastru nedohledá)',
      kratky[0].indexOf('Parcelní číslo') >= 0, kratky[0]);

    /* --- SEDM SLOUPCŮ, KTERÉ V TABULCE CHYBĚLY ------------------- */
    const chybelo = ['Parcelní číslo', 'Část obce', 'Výměra podílu (m²)', 'Sítě a cesta',
      'Nabídek od téhož inzerenta', 'V nabídce od', 'Dní v nabídce'];
    je('plná tabulka nese i to, podle čeho web sám filtruje a řadí',
      chybelo.filter((c) => radky[0].indexOf(c) < 0), []);
    /* A pořadí prvních devatenácti se nesmí pohnout: na starý tvar
       můžou být postavené vzorce. */
    je('a pořadí původních sloupců zůstalo',
      radky[0].split(';').slice(0, 3), ['Obec', 'Okres', 'Druh']);

    await ctxN.close();
  }

  /* --- OKNO ŘEKNE, CO JE VE VÝPISU --------------------------------
   * „Co je ve výpisu 1 911" neřeklo, co to dnes je. Po napsání
   * „Kolín" spadne výpis na pár desítek, ale živá oblast hlásí jen
   * počet, odznak žádný není a omezeni() popis taky ne — okno proto
   * tvrdilo „bez filtrů, celá dnešní nabídka" nad hrstkou pozemků
   * z Kolína, a stejně prázdný byl název staženého souboru.
   */
  {
    const ctxF = await prohlizec.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block', acceptDownloads: true });
    const f = await ctxF.newPage();
    await f.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await f.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await naSeznam(f);
    /* Nářadí je od 13. 11. pod otvíračem „Další akce"; bez jeho
       otevření na ně klepnutí nedosáhne. */
    await otevriNastroje(f);
    await f.waitForSelector('#mc-vyvoz', { timeout: 15000 });
    const vse = cislo(await f.textContent('#mc-vyvoz'));
    await f.fill('#map-search', 'Kolín');
    /* PSANÍ ROZBALÍ NAŠEPTÁVÁNÍ A TO PŘEKRYJE LIŠTU. Bez zavření se
       klepnutí na „Stáhnout výběr" nedoklepe a zkouška spadne na
       timeoutu, i když je web v pořádku — Escape dělá totéž, co
       udělá člověk. Pak se čeká, až se počet ve výpisu opravdu
       přepočítá; pevné čekání by bylo buď krátké, nebo zbytečné. */
    await f.keyboard.press('Escape');
    await f.locator('#map-search').blur().catch(() => {});
    await pripravenoKdyz(f, (puvodni) => {
      const t = (document.getElementById('mc-vyvoz') || {}).textContent || '';
      const n = parseInt(t.replace(/[^\d]/g, ''), 10);
      return n > 0 && n !== puvodni;
    }, vse, 8000);
    const po = cislo(await f.textContent('#mc-vyvoz'));
    pravda('hledání opravdu zúžilo výpis (jinak se nic neměří)',
      po > 0 && po < vse, `z ${vse} na ${po}`);
    await f.click('#mc-vyvoz');
    await f.waitForSelector('#vyv-vrstva:not([hidden])', { timeout: 15000 });
    await pripravenoKdyz(f, () => !!(document.getElementById('vyv-filtr') || {}).textContent, null, 5000);
    const veta = (await f.textContent('#vyv-filtr')).trim();
    pravda('okno napíše, co je nafiltrované', /Kolín/i.test(veta), `stojí tam „${veta}"`);
    pravda('a netvrdí, že filtr žádný není', !/bez filtrů/i.test(veta), veta);
    const [sF] = await Promise.all([
      f.waitForEvent('download', { timeout: 20000 }),
      f.locator('#vyv-ok').dispatchEvent('click'),
    ]);
    pravda('a stejnou stopu nese název souboru', /kolin/i.test(sF.suggestedFilename()),
      sF.suggestedFilename());
    await ctxF.close();
  }

  /* --- DO SCHRÁNKY MÍSTO DO SOUBORU --------------------------------
   * Na telefonu je stažené CSV skoro k ničemu. Vkládané tabulky
   * čekají TABULÁTOR, ne středník — se středníky by se celý řádek
   * vložil do jedné buňky.
   */
  {
    const ctxK = await prohlizec.newContext({ bypassCSP: true, viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true,
      serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
    const k = await ctxK.newPage();
    await k.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await k.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await naSeznam(k);
    /* Nářadí je od 13. 11. pod otvíračem „Další akce"; bez jeho
       otevření na ně klepnutí nedosáhne. */
    await otevriNastroje(k);
    await k.waitForSelector('#mc-vyvoz', { timeout: 15000 });
    const kolik = cislo(await k.textContent('#mc-vyvoz'));
    await k.click('#mc-vyvoz');
    await k.waitForSelector('#vyv-vrstva:not([hidden])', { timeout: 15000 });
    await pripravenoKdyz(k, () => document.querySelectorAll('#vyv-tab th').length > 0, null, 8000);
    pravda('tlačítko „Kopírovat" je u tabulky vidět',
      await k.locator('#vyv-kopir').isVisible(), 'není');
    await k.click('#vyv-kopir');
    await pripravenoKdyz(k, () => !!document.getElementById('vyv-vrstva').hidden, null, 5000);
    const ve = await k.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    const rad = ve.split('\n').filter(Boolean);
    je('ve schránce je tolik řádků, kolik je pozemků (a hlavička)', rad.length, kolik + 1);
    pravda('a oddělují se TABULÁTORY, ne středníky (jinak se vloží do jedné buňky)',
      rad[0].indexOf('\t') >= 0 && rad[0].indexOf(';') < 0, JSON.stringify(rad[0].slice(0, 60)));
    je('a sloupců je stejně jako v hlavičce tabulky',
      rad[0].split('\t').length, rad[1].split('\t').length);

    /* U bodů do navigace se kopírování nenabízí: GPX se nikam
       nevkládá, je to soubor pro aplikaci. */
    await k.click('#mc-vyvoz');
    await k.waitForSelector('#vyv-vrstva:not([hidden])', { timeout: 15000 });
    await k.check('input[name="vyv-tvar"][value="gpx"]');
    await pripravenoKdyz(k, () => !!(document.getElementById('vyv-kopir') || {}).hidden, null, 5000);
    pravda('u bodů do navigace se kopírování nenabízí',
      !(await k.locator('#vyv-kopir').isVisible()), 'nabízí se');
    await ctxK.close();
  }

  /* --- STROP NA POČET BODŮ DO NAVIGACE -----------------------------
   * Změřeno na dnešních datech: celý výpis je 1 918 bodů a 591 kB.
   * To není trasa, to je databáze — navigace z toho udělá slepenec
   * špendlíků a část aplikací takový soubor odmítne.
   */
  {
    const ctxG = await prohlizec.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block', acceptDownloads: true });
    const g = await ctxG.newPage();
    await g.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await g.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await naSeznam(g);
    /* Nářadí je od 13. 11. pod otvíračem „Další akce"; bez jeho
       otevření na ně klepnutí nedosáhne. */
    await otevriNastroje(g);
    await g.waitForSelector('#mc-vyvoz', { timeout: 15000 });
    const vse = cislo(await g.textContent('#mc-vyvoz'));
    pravda('výpis má víc než sto nabídek (jinak strop nemá co ořezat)',
      vse > 100, `ve výpisu ${vse}`);
    await g.click('#mc-vyvoz');
    await g.waitForSelector('#vyv-vrstva:not([hidden])', { timeout: 15000 });
    await g.check('input[name="vyv-tvar"][value="gpx"]');
    await pripravenoKdyz(g, () => !(document.getElementById('vyv-skup-kolik') || {}).hidden, null, 5000);
    const [sG] = await Promise.all([
      g.waitForEvent('download', { timeout: 20000 }),
      g.locator('#vyv-ok').dispatchEvent('click'),
    ]);
    const gpx = readFileSync(await sG.path(), 'utf8');
    je('ve výchozím stavu se do navigace pošle prvních sto bodů',
      (gpx.match(/<wpt /g) || []).length, 100);

    /* A kdo chce všechny, dostane všechny — strop je volba, ne zákaz. */
    await g.click('#mc-vyvoz');
    await g.waitForSelector('#vyv-vrstva:not([hidden])', { timeout: 15000 });
    await g.check('input[name="vyv-kolik"][value="vse"]');
    await pripravenoKdyz(g, () => true, null, 1200);
    const [sG2] = await Promise.all([
      g.waitForEvent('download', { timeout: 20000 }),
      g.locator('#vyv-ok').dispatchEvent('click'),
    ]);
    const gpx2 = readFileSync(await sG2.path(), 'utf8');
    je('a kdo si řekne o všechny, dostane všechny',
      (gpx2.match(/<wpt /g) || []).length, vse);
    await ctxG.close();
  }

  pravda('a za celou dobu nespadlo v konzoli nic',
    chybyKonzole.length === 0, chybyKonzole.join('\n      '));
  await prohlizec.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
hotovo();
