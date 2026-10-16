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

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
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
   ani návrat nářadí do dvouřádkového pruhu. */
const MEZ_PRVNI = 450;

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
    const c2 = await prohlizec.newContext({
      viewport: { width: SIRKA, height: VYSKA }, isMobile: true, hasTouch: true,
      serviceWorkers: 'block', locale: 'cs-CZ',
    });
    const p2 = await c2.newPage();
    await p2.goto(BASE + '/index.html', { waitUntil: 'load' });
    await p2.evaluate((k) => { try { localStorage.setItem('pk_recent_v1', JSON.stringify(k)); } catch (e) {} }, klice);
    await p2.reload({ waitUntil: 'load' });
    await p2.waitForSelector('#recent-strip .rs-chip', { timeout: 25000 }).catch(() => {});
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
