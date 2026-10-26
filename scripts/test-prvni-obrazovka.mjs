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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
/* ČEKÁ SE NA STAV, NE NA HODINKY: po goto se tu spalo pevně, než se
   rozběhne JS stránky. Viz scripts/zkouska-pripraveno.mjs. */
import { domUtichlo, pripravenoVypis } from './zkouska-pripraveno.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const SIRKA = 390, VYSKA = 844;
/* Mez se utáhla z 560 na 330 — naměřený stav je 289.
   Kudy se těch 198 px ubralo (vše naměřeno na 390×844):
     ·   8 px prázdný pruh pod hlavičkou (padding 48 → 40; níž to
        nejde, viz počet u .map-wide v css/styles.css),
     ·  54 px přepínač Seznam/Mapa, který se přestěhoval na řádek
        k poli hledání místo pruhu pod ním,
     ·  28 px dlouhý nadpis „Doporučené příležitosti · 1 930 na mapě",
        který má na telefonu krátkou podobu „1 930 pozemků",
     · 106 px pruh „Projít … po jednom" a „Stáhnout výběr", který je
        teď AŽ POD seznamem (na monitoru zůstává nahoře).
   NADPIS WEBU SI VZAL 68 px A MEZ ŠLA Z 330 NA 400.
   Majitel webu si vyžádal nahoře velký nadpis „Parcelka" s větou, co
   na stránce je. Naměřeno: první nabídka klesla z 292 na 360 px.
   Je to vědomá cena za to, aby stránka vypadala jako web a ne jako
   ovládací panel — pořád je to o 127 px lepší než 487 px, se kterými
   se začínalo, a nabídka i s cenou se na první obrazovku vejde.

   NÁŘADÍ VÝPISU SI VZALO 52 px A MEZ ŠLA Z 400 NA 450.
   „Procházet po jednom", „Stáhnout výběr" a „Dražby po termínu" se
   vrátily nad výpis — majitel webu je nechtěl mezi nabídkami („tohle
   je taky uprostřed, udělej to tak, jak to vypadá v zahraničí").
   Je to jeden řádek pilulek, který se posouvá do strany; zalomený na
   dva řádky by stál 94 px. Naměřeno: první nabídka klesla z 360
   na 409 px.
   Mez je o 40 px volnější než naměřený stav: tolik unese delší nadpis
   i užší telefon, ale NEUNESE vrácení kteréhokoli z těch kusů —
   ani návrat nářadí do dvouřádkového pruhu.

   NADPIS ZHUBL, ROZCESTNÍK PŘIBYL: ČISTÝCH 9 px.
   26. 10. se velký nadpis zkrátil ze tří řádků na jeden (ze 158 na
   85 px) a místo nich přišel řádek šesti vstupů do kategorií (48 px
   + 16 px mezera). Naměřeno: první nabídka 448 → 439 px. Mez 450
   tedy drží, ale slack je jen 11 px — kdo sem přidá další pruh,
   musí ubrat jinde. Kolik stojí zbytek první obrazovky (naměřeno
   na 390 px): lišta 64, nadpis 85, vstupy 48, hledání s přepínačem
   60, nadpis výpisu 42 a dvě řady ovladačů 96. Ty dvě řady ani
   nadpis výpisu zúžit nejde: majitel si vyžádal, aby všechna
   políčka měla jednu velikost (test-ovladani-vypisu) a aby nad
   výpisem stál nadpis, ne holé číslo („suché a robotické"). */
const MEZ_PRVNI = 450;
/* A TOTÉŽ NA ÚZKÉM TELEFONU — MEZ, KTERÁ TU CHYBĚLA.
   Měřilo se jen 390 px, a přesně v té slepé skulině se schoval vlastní
   nález: na 360 px (Galaxy S a spol.) se ovladače nad výpisem skládaly
   do JEDNOHO sloupce, pruh měl 242 px místo 138 a první nabídka
   začínala na 595 px z 844 — tedy pod obrazovkou. Na širším telefonu
   byla na 439. Čím užší displej, tím víc místa se plýtvalo.
   Spravilo se to zkrácením nápisu (.mc-dl, viz js/main.js): naměřeno
   491 px. Zbylých 52 px proti 390 px je pole hledání a přepínač
   Seznam/Mapa, které se na 360 px nevejdou na jeden řádek — to je
   v pořádku, cena se na obrazovku pořád vejde (798 z 844).
   Mez 540 unese ten zlom i o něco delší nadpis, ale NEUNESE návrat
   jednosloupcového nářadí. */
const SIRKA_UZKA = 360, MEZ_PRVNI_UZKA = 540;

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('První obrazovka', zpravy);
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
  const ctx = await prohlizec.newContext({ bypassCSP: true, 
    viewport: { width: SIRKA, height: VYSKA }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForSelector('.mv-toggle .mvt-btn', { timeout: 25000 });
  /* Tlačítka přepínače jsou ve statickém HTML, ale POČET nabídek do nich
     dopisuje až vykreslení výpisu. Čekat jen na „ustálený DOM" tedy
     nestačí — v CI (běh 557) se měřil přepínač bez čísla a kontrola
     „a u seznamu stojí počet nabídek" padla na vadě, která tam není. */
  await pripravenoVypis(p);
  await domUtichlo(p, 350);

  /* ---- NEJDŘÍV TO, CO JE VIDĚT PO OTEVŘENÍ -------------------------
     Úvodní stránka se na telefonu otevírá SEZNAMEM: hned mají být vidět
     nabídky, ne ovládání mapy. (17. 10. se to na přání majitele obrátilo
     na mapu a 18. 10. se — taky na jeho přání — vrátilo zpátky. Obě
     varianty jsou popsané v js/main.js i s měřením, aby se to potřetí
     nerozhodovalo poslepu.)
     Měří se tedy dvoje: že po otevření je zapnutý SEZNAM, a že mapa je
     na jedno klepnutí vedle. */
  const uvod = await p.evaluate(() => {
    const app = document.querySelector('.map-app');
    const btns = [...document.querySelectorAll('.mv-toggle .mvt-btn')]
      .map((b) => ({ mv: b.getAttribute('data-mv') || '',
        text: (b.textContent || '').replace(/\s+/g, ' ').trim(),
        aktivni: b.classList.contains('active'),
        vidno: b.getBoundingClientRect().top < innerHeight }));
    return { jeSeznam: !!(app && app.classList.contains('mv-seznam')), btns };
  });
  pravda('po otevření je na telefonu zapnutý seznam, ne mapa', uvod.jeSeznam,
    'na .map-app chybí třída mv-seznam');
  pravda('a aktivní je v přepínači seznam',
    uvod.btns.some((b) => b.mv === 'seznam' && b.aktivni),
    'přepínač: ' + JSON.stringify(uvod.btns));
  pravda('a mapa je na jedno klepnutí vedle',
    uvod.btns.some((b) => b.mv === 'mapa' && b.vidno),
    'přepínač: ' + JSON.stringify(uvod.btns));
  pravda('a u seznamu stojí počet nabídek',
    uvod.btns.some((b) => b.mv === 'seznam' && /\d/.test(b.text)),
    'přepínač: ' + JSON.stringify(uvod.btns));

  /* ---- A TEĎ SAMOTNÝ SEZNAM ----------------------------------------
     Všechno níž měří seznam: že první nabídka začíná nad mezí, že je
     u ní vidět cena a že nad ni nepolezou nástroje. Právě kvůli tomu
     tahle zkouška kdysi vznikla (naměřeno 699 px z 844). */
  await p.waitForSelector('.opp-item', { timeout: 25000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);

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
      /* Značka smí být na stránce jednou — v liště. Rozcestník, který ji
         nosil podruhé, je na přání majitele celý pryč; kontrola zůstává
         jako past, aby se druhá značka nevrátila odjinud. */
      znacek: Array.from(document.querySelectorAll('.logo, .uvod-logo'))
        .filter((e) => e.getBoundingClientRect().height > 4).length,
      /* Pruh nástrojů („Projít … po jednom", „Stáhnout výběr") a pruh
         naposledy prohlédnutých. Na telefonu musí stát AŽ ZA první
         nabídkou — měří se proto jejich začátek, ne výška. Výška by
         totiž nic neřekla: pruh může být nízký a stejně odsouvat.
         Měří se zvlášť od meze na první kartu, protože ta je volná
         a sto pixelů navíc by se v ní dalo schovat. */
      /* HLEDÁ SE PODLE TŘÍDY, NE PODLE id — A STÁLO TO JEDNU SABOTÁŽ.
         Když se z index.html vyhodí celé `id="mc-akce"`, js/main.js má
         záložní cestu: tlačítka připíše dovnitř nadpisu výpisu. Pruh
         se tím vrátí NAD seznam, jenže getElementById už nic nenajde
         a kontrola projde naprázdno. Třída .mc-akce je v obou
         případech, takže se tahle díra zavřela. */
      nastrojeY: (function () {
        const e = document.querySelector('.mc-akce');
        return e && e.getBoundingClientRect().height > 1
          ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
      })(),
      nedavnoY: (function () {
        const e = document.getElementById('recent-strip');
        return e && e.getBoundingClientRect().height > 1
          ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
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
  /* Past na návrat starého stavu, podruhé: nářadí na práci s výpisem
     patří POD výpis. Dokud stálo nad ním, odsouvalo první nabídku
     o 106 px — tedy to jediné, kvůli čemu sem člověk přišel, bylo až
     za nástroji na zacházení s tím, co ještě neviděl.
     Obojí se mezitím přestěhovalo NAHORU, na výslovné přání majitele
     webu („mají být úplně nahoře", „tohle je taky uprostřed"). Tahle
     kontrola tedy obrátila znaménko: nářadí MÁ stát nad první
     nabídkou — a to, co z toho doopravdy bolí, hlídá mez MEZ_PRVNI
     o kus výš a blok s naplněným pruhem níž. */
  pravda('nářadí výpisu stojí v jeho hlavičce, ne mezi nabídkami',
    !je(m.nastrojeY) || (je(m.karta) && m.nastrojeY < m.karta),
    `nástroje začínají na ${m.nastrojeY} px, první nabídka na ${m.karta} px`);
  await ctx.close();

  /* ---- A S PRUHEM „NAPOSLEDY PROHLÉDNUTÉ" NAHOŘE -----------------
     Pruh stojí nad výpisem, tedy odsouvá první nabídku — na výslovné
     přání majitele webu („mají být úplně nahoře"). Aby to šlo, musel
     zhubnout: z karet s velkým snímkem jsou řádky s náhledem 48 px.
     Naměřeno: pruh 109 px, první nabídka klesla z 409 na 530 px.
     Tahle zkouška je past na to, aby zase nevyrostl — v původní podobě
     měl 235 px a první nabídka by spadla na 656. Mez je 580: unese
     o 50 px delší pruh (třeba delší jméno obce na dvou řádcích),
     ale NEUNESE návrat velkých karet.
     Prázdný prohlížeč žádnou historii nemá, takže se musí naplnit —
     jinak by kontrola prošla naprázdno nad schovaným pruhem. */
  {
    const nabidky = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
    const klice = nabidky
      .filter((x) => typeof x.lat === 'number' && typeof x.lng === 'number' && x.price > 0)
      .slice(0, 5)
      .map((x) => [x.place || '', x.parcel || '', x.okres || '', x.lat.toFixed(3), x.lng.toFixed(3)].join('|'));
    const c2 = await prohlizec.newContext({ bypassCSP: true, 
      viewport: { width: SIRKA, height: VYSKA }, isMobile: true, hasTouch: true,
      serviceWorkers: 'block', locale: 'cs-CZ',
    });
    const p2 = await c2.newPage();
    await p2.goto(BASE + '/index.html', { waitUntil: 'load' });
    await p2.evaluate((k) => { try { localStorage.setItem('pk_recent_v1', JSON.stringify(k)); } catch (e) {} }, klice);
    await p2.reload({ waitUntil: 'load' });
    await p2.waitForSelector('#recent-strip .rs-chip', { timeout: 25000 }).catch(() => {});
    /* Po načtení je na telefonu vidět MAPA, takže se musí přepnout na
       seznam — jinak se měří karta, která není vykreslená, a vyjde
       y = 0. (Přesně to se stalo při přepisu téhle zkoušky.) */
    await p2.evaluate(() => {
      const b = [...document.querySelectorAll('.mv-toggle .mvt-btn')].find((x) => /seznam/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await p2.waitForSelector('#opp-list .opp-item', { timeout: 25000 }).catch(() => {});
    await p2.waitForTimeout(2000);
    const r = await p2.evaluate(() => {
      const el = document.getElementById('recent-strip');
      const karta = document.querySelector('#opp-list .opp-item');
      const y = (e) => e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
      return { pruhY: y(el), pruhH: el ? Math.round(el.getBoundingClientRect().height) : null,
        kartaY: y(karta), cipu: document.querySelectorAll('.rs-chip').length,
        skryty: el ? el.hidden : null };
    });
    await c2.close();
    pravda('pruh „Naposledy prohlédnuté" se naplnil (jinak není co měřit)',
      !!r && r.skryty === false && r.cipu >= 3, JSON.stringify(r));
    if (r && r.skryty === false) {
      pravda('a stojí NAD první nabídkou, ne uprostřed výpisu',
        r.pruhY !== null && r.kartaY !== null && r.pruhY < r.kartaY,
        `pruh na ${r.pruhY} px, první nabídka na ${r.kartaY} px`);
      pravda(`a první nabídka i s ním začíná nad 580 px (${r.kartaY})`,
        r.kartaY !== null && r.kartaY < 580,
        `pruh je vysoký ${r.pruhH} px a první nabídka začíná na ${r.kartaY} px`);
    }
  }

  /* ---- A NA ÚZKÉM TELEFONU --------------------------------------
     Měří se jen to podstatné: kde začíná první nabídka a jestli je
     z ní vidět cena. Zbytek kontrol výš na šířce nezávisí. */
  {
    const cu = await prohlizec.newContext({ bypassCSP: true,
      viewport: { width: SIRKA_UZKA, height: VYSKA }, isMobile: true, hasTouch: true,
      serviceWorkers: 'block', locale: 'cs-CZ',
    });
    const pu = await cu.newPage();
    await pu.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pu.waitForSelector('#opp-list .opp-item', { timeout: 25000 }).catch(() => {});
    await pripravenoVypis(pu);
    await domUtichlo(pu, 350);
    await pu.evaluate(() => window.scrollTo(0, 0));
    const u = await pu.evaluate(() => {
      const karta = document.querySelector('#opp-list .opp-item');
      const cena = karta ? karta.querySelector('.opp-price, .opp-cena, [class*="price"]') : null;
      const cr = cena ? cena.getBoundingClientRect() : null;
      const pruh = document.querySelector('.ms-vysledky');
      return {
        karta: karta ? Math.round(karta.getBoundingClientRect().top + window.scrollY) : null,
        cenaSpodek: cr ? Math.round(cr.top + window.scrollY + cr.height) : null,
        pruhH: pruh ? Math.round(pruh.getBoundingClientRect().height) : null,
      };
    });
    await cu.close();
    pravda(`na ${SIRKA_UZKA} px je co měřit — vykreslila se aspoň jedna nabídka`,
      u.karta !== null, 'žádná .opp-item se nenašla');
    pravda(`a první nabídka začíná nad ${MEZ_PRVNI_UZKA} px (${u.karta})`,
      u.karta !== null && u.karta < MEZ_PRVNI_UZKA,
      `začíná na ${u.karta} px z ${VYSKA}; pruh ovládání má ${u.pruhH} px`);
    pravda(`a cena je i tam na první obrazovce`,
      u.cenaSpodek !== null && u.cenaSpodek <= VYSKA,
      `cena končí na ${u.cenaSpodek} px, obrazovka má ${VYSKA}`);
  }

  /* ---- A TOTÉŽ NA VELKÉM MONITORU --------------------------------
     Druhá polovina téže otázky: kolik nabídek je vidět bez rolování.
     Naměřeno před opravou: sloupec s výpisem měl 460 px při okně 1440
     i 1920 — strop min(34vw, 460px) se zarazil kolem 1 350 px okna —
     zatímco mapa rostla z 980 na 1 460. Na obrazovce byla jedna a půl
     nabídky, ať byl monitor jakkoli velký. */
  const sirokyCtx = await prohlizec.newContext({ bypassCSP: true, 
    viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const w = await sirokyCtx.newPage();
  await w.goto(BASE + '/index.html', { waitUntil: 'load' });
  await w.waitForSelector('#opp-list .opp-item', { timeout: 25000 });
  await domUtichlo(w, 350);   // bylo waitForTimeout(2500)
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

  /* ---- VOLBA POHLEDU VYDRŽÍ NÁVŠTĚVU, ALE NE DALŠÍ -----------------
     Výchozí pohled platí pro OTEVŘENÍ webu. Kdyby platil pro každé
     načtení stránky, přišel by o svůj pohled každý, kdo si přepne na
     mapu a otevře z ní nabídku: vrátil by se zpátky na seznam, tedy na
     začátek. Je to totéž ztracené místo, které se tu kdysi pracně
     opravovalo (paměť rolování, scripts/test-pamet.mjs).
     Měří se obojí: že si web volbu po dobu návštěvy pamatuje, a že
     PŘÍŠTÍ návštěva začne zase výchozím pohledem — jinak by se z jednoho
     klepnutí stalo nastavení, které si nikdo nezvolil. */
  const telefon = { bypassCSP: true, serviceWorkers: 'block', viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'cs-CZ' };
  const jeSeznam = (str) => str.evaluate(() => {
    const a = document.querySelector('.map-app');
    return !!(a && a.classList.contains('mv-seznam'));
  });
  const klepni = (str, mv) => str.evaluate((m) => {
    const b = [...document.querySelectorAll('.mv-toggle .mvt-btn')]
      .find((x) => (x.getAttribute('data-mv') || '') === m);
    if (b) b.click();
  }, mv);
  {
    const ctxP = await prohlizec.newContext(telefon);
    const pp = await ctxP.newPage();
    await pp.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await pp.waitForSelector('.opp-item', { timeout: 25000 }).catch(() => {});
    await domUtichlo(pp, 350);   // bylo waitForTimeout(1800)
    pravda('nová návštěva začíná seznamem', (await jeSeznam(pp)) === true,
      'hned po otevření je zapnutá mapa');
    await klepni(pp, 'mapa');
    await pp.waitForTimeout(800);
    // PŘEDPOKLAD: bez přepnutí by další kontrola neměřila nic
    pravda('klepnutí na Mapu mapu opravdu ukáže', (await jeSeznam(pp)) === false,
      'po klepnutí na Mapu zůstal seznam');
    await pp.reload({ waitUntil: 'load' });
    await pp.waitForSelector('.opp-item', { timeout: 25000 }).catch(() => {});
    await domUtichlo(pp, 350);   // bylo waitForTimeout(1800)
    pravda('a po načtení stránky znovu zůstane mapa, ne seznam',
      (await jeSeznam(pp)) === false,
      'volba se nepamatuje — návrat z pozemku hodí člověka zpátky na seznam');
    await ctxP.close();

    const ctxD = await prohlizec.newContext(telefon);
    const pd = await ctxD.newPage();
    await pd.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await pd.waitForSelector('.opp-item', { timeout: 25000 }).catch(() => {});
    await domUtichlo(pd, 350);   // bylo waitForTimeout(1800)
    pravda('ale příští návštěva začne zase seznamem', (await jeSeznam(pd)) === true,
      'volba přežila návštěvu — to už je nastavení, které si nikdo nezvolil');
    await ctxD.close();
  }
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
