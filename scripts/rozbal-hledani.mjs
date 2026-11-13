/* OTEVŘI FILTRY — jedno místo pro všechny zkoušky.
   ====================================================================
   DO 10. 11. SE NA TELEFONU MUSELO NEJDŘÍV KLEPNOUT DO HLEDÁNÍ: vidět
   bylo jen pole s lupou a filtry (`.ms-rozsirene`) se rozbalily až po
   klepnutí. Rozbalování je pryč — ušetřilo nad výpisem 365 px z 844,
   ale schovávalo hlavní funkci webu, a bylo naměřeno, že na 320, 390
   i 768 px mají ovladače filtrů nulovou velikost, dokud se do hledání
   neklepne. Teď je řádek otvíračů (.mc-rada) vidět na každé šířce.

   `rozbalHledani()` tedy zůstává jako jméno, na které se zkoušky
   odkazují ze 39 míst, a dělá to, co od ní ta místa potřebují:
   zpřístupní ovladače filtrů. Řádek otvíračů je vidět sám, ovladače
   uvnitř skupin se musí otevřít — viz otevriPanel() níž.

   `otevriPanel()` otevře VŠECHNY skupiny filtrů (dřív to byl jeden
   <details id="ms-filters">, teď jich je pět). Zkoušky, které sahají
   na políčka uvnitř, je tím mají všechna k dispozici naráz — totéž, co
   měly dřív v jednom dlouhém panelu.
   Souhrny se nekliknou, nastavuje se `open`: klepnutí by zavřelo
   ostatní panely (js/main.js drží otevřený jeden) a zkouška by pak
   měřila výchozí stav místo nastaveného. */
export async function rozbalHledani(p, cekani = 300) {
  return otevriPanel(p, cekani);
}

/* OTEVŘI VŠECHNY SKUPINY FILTRŮ A POLOŽ JE DO TOKU.
   ====================================================================
   Dvě věci, a každá má svůj důvod.

   1. OTEVŘÍT VŠECHNY. Dřív to byl jeden <details id="ms-filters">
      a stačilo otevřít jeho. Teď je skupin pět a zkoušky sahají na
      ovladače z několika naráz (druh nabídky, dlaždice kategorií,
      políčka ceny, vybavení).

   2. NESAHAT JIM NA ŠÍŘKU ANI NA UMÍSTĚNÍ. Napoprvé je pomůcka
      položila do toku (`position:static; width:auto`) a vyrobila tím
      vadu měření: v toku si panel vzal šířku řádku, políčka ceny
      a výměry se v něm roztáhla na 360 px a rozbalovátko na 271,
      takže kontrola „hodnoty končí v jednom sloupci" hlásila pravé
      okraje 75 / 75 / 164. Ve SKUTEČNÉM stavu (panel 420 px na
      monitoru, 358 na telefonu) končí všechny tři na témž pixelu —
      977, respektive 344. Zruší se tedy jen to, co měření brání:
      `display:none` zavřeného panelu a jeho vnitřní rolování.
      Panely tím leží přes sebe, ale to měřením nehýbe: velikosti
      a vzájemné polohy OVLADAČŮ se počítají uvnitř panelu.

   A PROČ `display:none` NA ZAVŘENÉM PANELU VŮBEC JE (css/styles.css):
   `<details>` svůj obsah nekreslí, ale v prohlížeči mu dává
   `content-visibility:hidden`, takže prvky uvnitř obdélník mají — jen
   podivný. Hlídač dotyku na tom našel pět „ovladačů pod 44 px", které
   nikdo neviděl. Zavřený panel tedy nemá rozměr žádný, a právě proto
   si ho zkoušky musí otevřít. */
export async function otevriPanel(p, cekani = 300) {
  const kolik = await p.evaluate(() => {
    const ZNACKA = 'pk-zkouska-filtry-v-toku';
    if (!document.getElementById(ZNACKA)) {
      const st = document.createElement('style');
      st.id = ZNACKA;
      /* ZRUŠ PANELŮM VNITŘNÍ ROLOVÁNÍ, nic víc. Zkoušky měří i to,
         co by v panelu bylo pod jeho hranou; omezení výšky (44–60 vh)
         je vlastnost pro člověka, ne pro měřicí pásmo.
         A `display` SE TU NEPŘEPISUJE: zavřený <details> má svůj
         obsah ve „skipped content" a vynucené `display:block` mu
         nespočítá správné rozvržení — naměřeno, že panel ceny vyšel
         89 px široký (šířka svého otvírače) místo 358. Panely se
         proto opravdu otevřou. */
      st.textContent = '.mf[open] > .mf-panel{max-height:none !important;'
        + 'overflow:visible !important;}';
      document.head.appendChild(st);
    }
    var d = document.querySelectorAll('details.mf');
    d.forEach(function (x) { x.open = true; });
    return d.length;
  });
  await p.waitForTimeout(cekani);
  return kolik > 0;
}

/* OTEVŘI JEDINOU SKUPINU — TU, V NÍŽ TEN OVLADAČ BYDLÍ.
   ====================================================================
   PROČ NESTAČÍ otevriPanel() VÝŠ: ta otevře všech pět skupin a panely
   si lehnou přes sebe (všechny visí pod řádkem otvíračů, na telefonu
   přes celou šířku). Pro MĚŘENÍ to nevadí — velikosti a vzájemné
   polohy ovladačů se počítají uvnitř panelu. Pro KLEPÁNÍ to vadí
   zásadně: naměřeno 11. 11. na 390 px, že na středu políčka
   `#map-cena-od` (46, 419) leží `.mcv-btn` z panelu „Další filtry",
   který je v DOM poslední, a tudíž navrchu. Playwright na to čeká
   30 s a pak hlásí timeout — přesně tak padaly zkoušky stránkování,
   úvodu, našeptávače a okolí.

   Tahle pomůcka proto zavře všechny a otevře jen tu skupinu, která
   hledaný ovladač obsahuje — stejný stav, jaký má před sebou člověk,
   protože js/main.js drží otevřený taky jen jeden panel.
   Když ovladač v žádné skupině není (je třeba v liště nad výpisem),
   zavřou se všechny a vrátí se `false`: klepnutí pak nic nestíní. */
export async function otevriSkupinu(p, sel, cekani = 300) {
  const nasel = await p.evaluate((kam) => {
    const ZNACKA = 'pk-zkouska-filtry-v-toku';
    if (!document.getElementById(ZNACKA)) {
      const st = document.createElement('style');
      st.id = ZNACKA;
      st.textContent = '.mf[open] > .mf-panel{max-height:none !important;'
        + 'overflow:visible !important;}';
      document.head.appendChild(st);
    }
    /* OD 12. 11. JE CELÝ ŘÁDEK FILTRŮ NA TELEFONU ZA JEDNÍM OTVÍRAČEM
       (#mf-vse — majitel: „toto brát na ten ještě původní model").
       Bez jeho otevření leží skupiny v zavřeném <details>, nemají
       krabici, a Playwright na klepnutí čeká třicet vteřin a pak hlásí
       timeout — přesně tak spadla zkouška našeptávače. Obal se proto
       otevírá první; na monitoru nic nedělá, tam je display:contents. */
    const obal = document.getElementById('mf-vse');
    if (obal) obal.open = true;
    const el = document.querySelector(kam);
    const skupina = el && el.closest ? el.closest('details.mf') : null;
    document.querySelectorAll('details.mf').forEach(function (x) {
      x.open = x === skupina;
    });
    return !!skupina;
  }, sel);
  await p.waitForTimeout(cekani);
  return nasel;
}

/* ZAVŘI VŠECHNY SKUPINY.
   ====================================================================
   Pro zkoušky, které na filtry vůbec nesahají a místo toho klepají do
   STRÁNKY — do výpisu, do hlášky o prázdném výsledku, na kartu.
   Otevřený panel je absolutně umístěná vrstva nad obsahem (z-index 45,
   na monitoru 420 px široká a 60 vh vysoká), takže leží i přes výpis:
   naměřeno 11. 11. na 1 280 px, že tlačítko „Zrušit druh pozemku"
   v hlášce o prázdném výpisu (73, 539) padlo doprostřed otevřeného
   panelu a klepnutí se třicet vteřin nedařilo. Když zkouška panely
   nepotřebuje, ať je má zavřené — tak to vidí i člověk, který do
   filtrů nesáhl. */
export async function zavriSkupiny(p, cekani = 200) {
  const kolik = await p.evaluate(() => {
    const d = document.querySelectorAll('details.mf');
    d.forEach(function (x) { x.open = false; });
    return d.length;
  });
  await p.waitForTimeout(cekani);
  return kolik;
}
