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
/* A 27. 10. SE MEZ POSUNULA POTŘETÍ — Z 450 NA 480.
   Majitel: „brutální update, kreativita a marketing." Úvodní deska do
   té chvíle nesla jednu větu o sortimentu („Pozemky na prodej,
   v dražbě i v exekuci."), tedy popis, ne důvod zůstat. Teď nese
   příslib („Pozemek, který jinde neuvidíte.") a pod ním větu, z čeho
   se nabídka skládá.
   CO TO STÁLO, NAMĚŘENO NA 390×844: deska vyrostla ze 161 na 188 px,
   první nabídka klesla z 439 na 468. Cena první nabídky je přitom
   pořád na obrazovce (757 z 844) — a to je ta věc, kvůli které mez
   existuje: že se dá vidět NABÍDKA, ne jen značka.
   Telefon je přitom nejstřídmější verze té desky: obočí ani druhá
   polovina věty se pod 720 px nekreslí a tlačítka jsou tam až od
   720 px. Bez toho by nabídka klesla na 571 px (naměřeno).
   Mez 480 má proti naměřeným 468 dvanáct pixelů rezervy a NEUNESE
   ani vrácení obočí, ani tlačítka na telefon. */
/* A 31. 10. POČTVRTÉ — Z 480 NA 540, ZA PÁS SE ZNAČKOU PODLE SREALITY.
   Majitel poslal dva snímky mobilní Sreality se slovy „udělej naši
   stránku podle Sreality — tento začátek": nahoře tenká lišta bez
   značky, pod ní velká značka uprostřed a věta „Vyberte si z 109 155
   nabídek realit". Pás je tedy přání, ne nápad odsud.
   NAMĚŘENO NA 390×844: pás má 95 px (značka 56, věta 19, odsazení 14,
   mezera 4 — a nahoře nic, protože lišta má svých 12 px vespod).
   První nabídka klesla ze 418 na 513 px, tedy přesně o výšku pásu;
   pod ním není žádný vzduch, který by se dal uvolnit (.map-wide má
   na telefonu padding-top 0 a hledání začíná 8 px pod pásem).
   CENA PRVNÍ NABÍDKY JE POŘÁD VIDĚT — a to je ta věc, kvůli které mez
   existuje: že je vidět NABÍDKA, ne jen značka. Naměřeno: spodek ceny
   829 px z 844 na 390 px, 811 na 360 px a 763 na 320 px. Na nejširším
   telefonu tedy zbývá 15 px; kdo sem přidá cokoli dalšího, cenu
   z obrazovky vytlačí a MUSÍ nejdřív něco ubrat.
   MEZ 540 má proti naměřeným 513 dvacet sedm pixelů rezervy a neunese
   ani druhý řádek věty pod značkou, ani vyšší značku.
   JE TO TOTÉŽ ČÍSLO JAKO NA ÚZKÉM TELEFONU, a schválně: pás stojí na
   obou šířkách stejně vysoký (95 px) a nabídka vyšla na 513 px v obou
   případech, takže dvě různá čísla by tu už nic neříkala. */
/* A 10. 11. POPÁTÉ — Z 540 NA 690, A JE TO PŘEPOČET, NE ÚSTUPEK.
   Mez je proxy: to, co má chránit, je napsané výš — „aby byla vidět
   NABÍDKA, ne jen značka", a měří se tím, že na obrazovku vyjde CENA
   první nabídky (kontrola „a cena je i tam na první obrazovce" níž).
   Ta proxy se spočítala z karty vysoké 360 px. Karta ale 10. 11.
   zplošťěla na 166 px (medián, rozptyl 131–214), takže totéž pravidlo
   dává jiné číslo: 844 − 166 = 678 px je poloha, při které se celá
   karta i s cenou pořád vejde.
   CO SE ZA TO POŘÍDILO: řádek filtrů, který je vidět bez klepnutí.
   Do té chvíle měly na 320, 390 i 768 px všechny ovladače filtrů
   nulovou velikost, dokud se neklepne do hledání. Lišta tím narostla
   ze 163 na 344 px a první nabídka klesla ze 490 na 670 px.
   Naměřeno na 390×844: nabídka na 670 px, spodek její ceny na 836 px
   z 844 — tedy POŘÁD NA OBRAZOVCE, o 8 px. Mez 690 má proti 670
   dvacet pixelů rezervy a NEUNESE další řádek čehokoli; kdo sem
   přidá cokoli dalšího, musí nejdřív něco ubrat. */
const MEZ_PRVNI = 690;
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
const SIRKA_UZKA = 360, MEZ_PRVNI_UZKA = MEZ_PRVNI;

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
    const nahled = karta ? karta.querySelector('.opp-media') : null;
    const nr = nahled ? nahled.getBoundingClientRect() : null;
    return {
      karta: y(karta),
      vyskaKarty: karta ? Math.round(karta.getBoundingClientRect().height) : null,
      nahledVidno: nr ? Math.round(Math.min(nr.bottom, window.innerHeight) - Math.max(nr.top, 0)) : null,
      hlavicka: hlavicka ? Math.round(hlavicka.getBoundingClientRect().height) : null,
      cenaSpodek: cr ? Math.round(cr.top + window.scrollY + cr.height) : null,
      cenaText: cena ? cena.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) : null,
      /* Značka smí být na obrazovce jednou. Rozcestník, který ji nosil
         podruhé, je na přání majitele celý pryč; kontrola zůstává jako
         past, aby se druhá značka nevrátila odjinud.
         OD 31. 10. SE POČÍTAJÍ VIDITELNÉ, NE PŘÍTOMNÉ. Úvodní stránka
         má podle Sreality pás s velkou značkou pod lištou a lišta svoje
         logo nenese, dokud je ten pás vidět — jenže neschovává ho přes
         display:none (to by rozhodilo výšku lišty i polohu hamburgeru,
         viz stylopis), takže v DOM je a rozměr má. Měřit samotnou
         přítomnost by od téhle chvíle měřilo něco jiného, než co člověk
         vidí; proto se ptáme i na opacity a visibility a na to, jestli
         prvek vůbec zasahuje do okna.
         (V seznamu bývala i .zn-logo z pásu na úvodu; pás 1. 11.
         zrušil majitel, takže ta třída na webu není.) */
      znacek: Array.from(document.querySelectorAll('.logo, .uvod-logo'))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          if (!(r.height > 4) || r.bottom <= 0 || r.top >= innerHeight) return false;
          for (let x = e; x && x.nodeType === 1; x = x.parentElement) {
            const cs = getComputedStyle(x);
            if (cs.visibility === 'hidden' || cs.display === 'none'
              || parseFloat(cs.opacity) < 0.05) return false;
          }
          return true;
        }).length,
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
      /* A JEDNO SLEPÉ MÍSTO, KTERÉ SE 12. 11. NAŠLO MĚŘENÍM. Hledalo se
         `.mc-akce` a bral se jeho obdélník — jenže ten obal má
         `display:contents`, takže vlastní rozměr NEMÁ: výška vyšla 0,
         podmínka `height > 1` ho zahodila, nastrojeY bylo null
         a kontrola níž procházela naprázdno. Nářadí přitom nad výpisem
         skutečně stálo a bralo 104 px na dvou řádcích mřížky
         (naměřeno 390×844: „Procházet po jednom" 434–478 px,
         „Stáhnout výběr" 538–582 px).
         Měří se proto tlačítka sama, ne obal: ta rozměr mají vždycky,
         ať je obal čímkoli. Obal zůstává jako záložní cesta pro případ,
         že by si js/main.js nářadí poskládal jinak. */
      nastrojeY: (function () {
        const ys = [...document.querySelectorAll('.mc-akce .mc-nastroj, .mc-nastroj')]
          .filter((e) => e.getBoundingClientRect().height > 1)
          .map((e) => e.getBoundingClientRect().top + window.scrollY);
        if (ys.length) return Math.round(Math.min(...ys));
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
     vidět to, kvůli čemu se na web chodí.
     DO 11. 11. TU STÁLO „a je z ní na první obrazovce vidět cena"
     a platilo to jen o PLOCHÉ KARTĚ: ta byla vodorovný řádek se
     116px miniaturou, takže cena ležela 70 px pod jejím vrškem.
     Plochá karta týž den skončila — majitel: „nevím, proč jsi ty
     inzeráty zmenšil". Na vrácené svislé kartě je cena 290 px pod
     vrškem karty (naměřeno 390×844: karta začíná na 669 px, cena
     končí na 985, tedy 141 px pod hranou; 360×844: karta 669, cena
     966, tedy 122 px pod hranou).
     DVĚ MAJITELOVA ROZHODNUTÍ TO DRŽÍ, A JDOU PROTI SOBĚ. Karta se
     zmenšovat nesmí (viz výš) a nářadí výpisu má stát NAD první
     nabídkou („mají být úplně nahoře" — viz kontrola o kus níž).
     Hlavička výpisu je kvůli tomu 227 px a panel ovladačů 345 px,
     tedy 572 px ovládání před první nabídkou; aby byla cena nad
     hranou, musela by karta začínat na 554 px (390 px) a na 510 px
     (360 px). Těch 141 px se dá vzít jedině z nářadí (104 px na dvou
     řádcích) a z řádku s počtem (27 px) — tedy z věcí, které si
     majitel vyžádal. Kontrola tu tedy nemá co vymáhat a nahradilo ji
     to, co z karty na první obrazovce vidět JE a ověřit se dá.
     CO BY SILNĚJŠÍ TVRZENÍ VRÁTILO: cena přes fotku (jako na
     Srealitách) — spodek náhledu je na 893 px, přesun ceny do něj ji
     dostane nad hranu bez zmenšení karty. Je to ale změna vzhledu
     karty, a tu majitel po poslední zkušenosti chce vidět dřív, než
     se stane; proto se nedělá sama. */
  pravda(`a je z ní na první obrazovce vidět náhled (${m.nahledVidno} px)`,
    je(m.nahledVidno) && m.nahledVidno >= 120,
    `z náhledu je nad hranou ${m.nahledVidno} px — nabídka není poznat`);
  /* Celá nabídka se musí vejít na jednu obrazovku: po jednom posunu
     palcem má být vidět od fotky po štítky. Naměřeno 394 px (390 px)
     a 376 px (360 px) z 844; mez 450 nechává 56 px na delší nadpis. */
  pravda(`a celá nabídka se vejde na jednu obrazovku (${m.vyskaKarty} px z ${VYSKA})`,
    je(m.vyskaKarty) && m.vyskaKarty <= 450,
    `karta má ${m.vyskaKarty} px — na jednu obrazovku se nevejde`);
  /* A past na posouvání dolů: kdyby nad výpis přirostl další ovladač,
     cena spadne hlouběji. Naměřeno 141 px pod hranou, mez 170 px. */
  pravda(`a cena je nejvýš 170 px pod hranou obrazovky`,
    je(m.cenaSpodek) && m.cenaSpodek - VYSKA <= 170,
    `cena „${m.cenaText}" končí na ${m.cenaSpodek} px, obrazovka má ${VYSKA}`
      + ` — to je ${m.cenaSpodek - VYSKA} px pod hranou`);
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
  /* A JEDNA VYCPÁVKA PRYČ: podmínka začínala `!je(m.nastrojeY) ||`,
     takže se splnila i tím, že se nářadí nevykreslí vůbec. Spolu se
     slepým místem u `display:contents` výš to znamenalo, že kontrola
     procházela ze dvou různých důvodů, z nichž ani jeden není ten,
     o který jde. Teď se žádá číslo: nářadí musí být k nalezení
     a musí stát nad první nabídkou. */
  pravda('nářadí výpisu stojí v jeho hlavičce, ne mezi nabídkami',
    je(m.nastrojeY) && je(m.karta) && m.nastrojeY < m.karta,
    `nástroje začínají na ${m.nastrojeY} px, první nabídka na ${m.karta} px`);

  /* „POZEMKY V OKOLÍ" MUSÍ BÝT VIDĚT HNED.
     Majitel poslal snímek s červeně zakroužkovanou mezerou mezi
     přepínačem Seznam/Mapa a „Procházet po jednom": „tam kde to je
     červené vlož pozemky v okolí." Tlačítko tam do 1. 11. nebylo —
     leželo uvnitř `.ms-rozsirene`, který se na telefonu rozbaloval až
     po klepnutí do hledání, takže jediná cesta, jak si vybrat místo,
     byla schovaná za krokem, který nikdo nemusel udělat.
     TEN OBAL UŽ NEEXISTUJE (10. 11.): schovával i filtry, tedy hlavní
     funkci webu, a šel pryč celý (viz scripts/test-filtry-radek.mjs).
     Kontrola „neleží v obalu" by tedy od té chvíle byla PRÁZDNÁ —
     splnila by se tím, že obal nikde není, ne tím, že je tlačítko
     vidět. Místo ní se měří, co platí dál a je silnější: že na
     tlačítko není potřeba ŽÁDNÉ klepnutí, protože v panelu ovladačů
     není nic, co by se rozbalovalo (žádný prvek s nulovou velikostí,
     který by se po klepnutí zvětšil).
     Hlídá se trojí: že je vidět, že stojí v té mezeře (pod přepínačem,
     nad nářadím) a že unese prst. Nic z toho neplyne z toho druhého:
     tlačítko může být vidět a stát jinde, nebo stát správně a být
     schované. */
  const ok = await p.evaluate(() => {
    const vid = (e) => {
      if (!e) return null;
      const r = e.getBoundingClientRect(); const st = getComputedStyle(e);
      if (!r.width || !r.height || st.visibility === 'hidden' || st.display === 'none') return null;
      return { top: Math.round(r.top + window.scrollY), dolu: Math.round(r.bottom + window.scrollY), v: Math.round(r.height) };
    };
    return {
      near: vid(document.getElementById('map-near')),
      prepinac: vid(document.querySelector('.mv-toggle')),
      /* NE #mc-akce: ten má display:contents, takže nemá vlastní
         obdélník a měření by tiše vyšlo na nulu. Řada nářadí je
         .ms-vysledky. */
      nastroje: vid(document.querySelector('.ms-vysledky')),
      /* Kolik ovladačů v liště má nulovou velikost, tedy čeká na
         klepnutí. Po zrušení rozbalování to má být nula.
         OVLADAČE VE ZAVŘENÝCH PANELECH SE NEPOČÍTAJÍ — ty nulovou
         velikost MAJÍ MÍT a je to celý princip rozbalovátka. Napoprvé
         jsem na to zapomněl a kontrola našla pět „schovaných"
         ovladačů, což byla vada měření, ne webu. Měří se tedy to, co
         je vidět v ŘÁDKU a v liště kolem něj. */
      skrytychOvladacu: [...document.querySelectorAll('.map-controls-panel button, .map-controls-panel summary, .map-controls-panel input, .map-controls-panel select')]
        .filter((e) => !e.closest('details:not([open]) > *:not(summary)')
          && !(e.closest('.mf-panel'))
          /* A ANI OVLADAČE SCHOVANÉ STAVEM: křížek v hledání, dokud
             se nic nenapsalo, a „Zrušit filtry", dokud není co rušit.
             Ty se neschovávají, aby se musely odhalit klepnutím —
             schovávají se, protože by nic neudělaly. */
          && !e.hidden)
        .filter((e) => { const r = e.getBoundingClientRect();
          return r.width < 2 || r.height < 2; }).length,
    };
  });
  pravda('„Pozemky v okolí" je vidět hned, bez klepnutí do hledání',
    !!ok.near, 'tlačítko není vidět');
  pravda('a v panelu ovladačů nečeká na klepnutí nic dalšího',
    ok.skrytychOvladacu === 0,
    `${ok.skrytychOvladacu} ovladačů má nulovou velikost — něco se zas rozbaluje`);
  /* Bez podmínky: kdyby se některý ze tří prvků nenašel, kontrola by
     se tiše přeskočila a hlídala by nic. Ať radši spadne. */
  pravda('a stojí v té mezeře: pod přepínačem Seznam/Mapa a nad nářadím výpisu',
    !!ok.near && !!ok.prepinac && !!ok.nastroje
      && ok.near.top >= ok.prepinac.dolu && ok.near.dolu <= ok.nastroje.top,
    `přepínač ${JSON.stringify(ok.prepinac)}, tlačítko ${JSON.stringify(ok.near)}, nářadí ${JSON.stringify(ok.nastroje)}`);
  pravda('a unese prst (44 px)', !!ok.near && ok.near.v >= 44,
    ok.near ? `${ok.near.v} px` : 'tlačítko není vidět');

  /* (Zde stálo osm kontrol předávky značky z pásu do lišty. Pás se
     značkou na úvodu 1. 11. zrušil majitel — „odeber to a nech to jen
     takto" — takže se nemá co předávat: lišta nese značku od začátku
     jako na každé jiné stránce. Kontrola „na obrazovce je vidět právě
     jedna značka" zůstala výš a platí dál.) */
  await ctx.close();

  /* ---- A S PRUHEM „NAPOSLEDY PROHLÉDNUTÉ" NAD VÝPISEM ------------
     Stěhoval se potřetí. Napřed nahoru („mají být úplně nahoře"),
     29. 10. pod výpis („ať je co nejvíc dole"), 30. 10. z něj byl na
     chvíli přepínač v řadě nad výpisem a hned zase ne („to nikdo
     nechtěl") — a 1. 11. zpátky nahoru: „nevím, kam zmizela historie
     pozemků, normálně to dej, jak bylo." Pod výpisem je totiž na
     telefonu až za 24 kartami, tedy přes devět tisíc pixelů od vršku.
     TOHLE STOJÍ MÍSTO NA PRVNÍ OBRAZOVCE A NETVRDÍM NIC JINÉHO.
     Naměřeno na 390×844: pruh je vysoký 99 px a s odsazením stojí
     111 px, takže první nabídka klesne ze 471 na 582 px a spodek její
     ceny z 787 na 898 px — tedy 54 px pod hranu obrazovky. Pro
     NÁVŠTĚVNÍKA BEZ HISTORIE se nemění nic a přísná mez MEZ_PRVNI
     i kontrola ceny výš platí dál; tohle je cena, kterou platí ten,
     kdo se vrací a historii má. Má proto vlastní, volnější mez —
     a ta je tu od toho, aby se nehnula zase o kus dál.
     Prázdný prohlížeč žádnou historii nemá, takže se musí naplnit —
     jinak by kontrola prošla naprázdno nad schovaným pruhem. */
  /* 10. 11.: z 600 na 800, z téhož důvodu jako MEZ_PRVNI výš (lišta
     s řádkem filtrů je o 181 px vyšší). Naměřeno s pruhem historie:
     první nabídka na 780 px. Cena se tomu, kdo se vrací a historii
     má, pod hranu obrazovky dostane — to platilo i předtím (napsáno
     u téhle meze od začátku: „spodek ceny 898 px, tedy 54 px pod
     hranou") a je to cena za pruh, kterou si majitel vyžádal. */
  const MEZ_PRVNI_HISTORIE = 800;
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
    const mer = () => p2.evaluate(() => {
      const el = document.getElementById('recent-strip');
      const karta = document.querySelector('#opp-list .opp-item');
      const y = (e) => e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null;
      const out = { pruhY: y(el), pruhH: el ? Math.round(el.getBoundingClientRect().height) : null,
        kartaY: y(karta), cipu: document.querySelectorAll('.rs-chip').length,
        skryty: el ? el.hidden : null, kartaBezPruhu: null,
        poUlozenych: null, zpetPoUlozenych: null };
      /* Kolik z posunu je pruh: vypnout ho a změřit znovu. Vrací se
         hned zpátky, ať další měření neběží na jiné stránce. */
      const st = document.createElement('style');
      st.textContent = '#recent-strip{display:none !important;}';
      document.head.appendChild(st);
      out.kartaBezPruhu = y(document.querySelector('#opp-list .opp-item'));
      st.remove();
      /* A pohled „Uložené": pruh se tam nemá ukazovat. */
      const fav = document.getElementById('map-fav');
      if (fav) {
        fav.click();
        out.poUlozenych = el ? el.hidden : null;
        fav.click();
        out.zpetPoUlozenych = el ? el.hidden : null;
      }
      return out;
    });
    const r = await mer();
    await c2.close();
    pravda('pruh „Naposledy prohlédnuté" se naplnil sám (jinak není co měřit)',
      !!r && r.skryty === false && r.cipu >= 3, JSON.stringify(r));
    if (r && r.skryty === false) {
      /* PRUH STOJÍ NAD VÝPISEM. Je to návrat k tomu, co jsem už viděl,
         tedy něco, co se dělá NEŽ začnu listovat. Pod výpisem to
         majitel nenašel. */
      pravda('a stojí NAD první nabídkou, ne až za výpisem',
        r.pruhY !== null && r.kartaY !== null && r.pruhY < r.kartaY,
        `pruh na ${r.pruhY} px, první nabídka na ${r.kartaY} px`);
      /* O KOLIK ODSOUVÁ, SE MĚŘÍ, NEZAMLČUJE SE.
         Dřív tu stálo „neodsouvá ani o pixel" — to po přesunu nahoru
         přestalo platit a tvářit se jinak by byla lež. Porovnává se
         s TÝMŽ měřením bez pruhu (m.karta), takže se čte skutečný
         rozdíl, ne rozdíl dvou různých stránek. Strop je vlastní
         a volnější: první obrazovku bez historie hlídá MEZ_PRVNI výš. */
      const posun = (r.kartaY !== null && je(m.karta)) ? r.kartaY - m.karta : null;
      pravda(`a odsouvá první nabídku o ${posun} px, ne víc (strop ${MEZ_PRVNI_HISTORIE} px)`,
        posun !== null && posun > 0 && r.kartaY < MEZ_PRVNI_HISTORIE,
        `pruh je vysoký ${r.pruhH} px, s pruhem ${r.kartaY} px, bez pruhu ${m.karta} px`);
      /* A TEN POSUN JE OPRAVDU JEN PRUH, nic jiného se nepřestěhovalo:
         vypnutí pruhu musí vrátit nabídku přesně tam, kde je na
         stránce bez historie. */
      pravda('a je to opravdu jen pruh (po jeho vypnutí nabídka sedí jako bez historie)',
        r.kartaBezPruhu !== null && je(m.karta) && Math.abs(r.kartaBezPruhu - m.karta) <= 1,
        `bez pruhu na téže stránce ${r.kartaBezPruhu} px, na stránce bez historie ${m.karta} px`);
      /* V POHLEDU „ULOŽENÉ" SE PRUH NEUKAZUJE. Tam výpis sám nese
         uložené pozemky a historie nad ním by byla druhý, skoro
         stejný seznam. Majitel: „a v uložených to ukáže jen uložené." */
      pravda('a v pohledu „Uložené" se neukazuje', r.poUlozenych === true,
        `po zapnutí „Uložené" hidden = ${r.poUlozenych}`);
      pravda('a po vypnutí „Uložené" je zase vidět', r.zpetPoUlozenych === false,
        `hidden = ${r.zpetPoUlozenych}`);
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
      const nahled = karta ? karta.querySelector('.opp-media') : null;
      const nr = nahled ? nahled.getBoundingClientRect() : null;
      return {
        karta: karta ? Math.round(karta.getBoundingClientRect().top + window.scrollY) : null,
        cenaSpodek: cr ? Math.round(cr.top + window.scrollY + cr.height) : null,
        nahledVidno: nr ? Math.round(Math.min(nr.bottom, window.innerHeight) - Math.max(nr.top, 0)) : null,
        pruhH: pruh ? Math.round(pruh.getBoundingClientRect().height) : null,
      };
    });
    await cu.close();
    pravda(`na ${SIRKA_UZKA} px je co měřit — vykreslila se aspoň jedna nabídka`,
      u.karta !== null, 'žádná .opp-item se nenašla');
    pravda(`a první nabídka začíná nad ${MEZ_PRVNI_UZKA} px (${u.karta})`,
      u.karta !== null && u.karta < MEZ_PRVNI_UZKA,
      `začíná na ${u.karta} px z ${VYSKA}; pruh ovládání má ${u.pruhH} px`);
    /* Táž změna jako na širším telefonu a z téhož důvodu (zdůvodnění
       je u kontroly výš): cena je na svislé kartě 290 px pod jejím
       vrškem, takže na první obrazovku nedosáhne. Naměřeno na 360 px:
       náhled 670–874 (174 px nad hranou), cena končí na 966, tedy
       122 px pod hranou. */
    pravda(`a je i tam vidět náhled první nabídky (${u.nahledVidno} px)`,
      u.nahledVidno !== null && u.nahledVidno >= 120,
      `z náhledu je nad hranou ${u.nahledVidno} px`);
    pravda(`a cena je i tam nejvýš 170 px pod hranou`,
      u.cenaSpodek !== null && u.cenaSpodek - VYSKA <= 170,
      `cena končí na ${u.cenaSpodek} px, obrazovka má ${VYSKA}`
        + ` — to je ${u.cenaSpodek - VYSKA} px pod hranou`);
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
