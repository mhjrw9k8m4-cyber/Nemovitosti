/* Přepínač světlý / tmavý.
 *
 * VÝCHOZÍ JE SVĚTLÁ, a to pro každého. Dřív se web řídil nastavením
 * telefonu a volba byla trojí — „podle systému", „světlý", „tmavý".
 * Od té doby se zadání změnilo: Parcelka je zelenobílá a tak má vypadat
 * i tomu, kdo má v systému noční režim. Kdo chce tmavou, řekne si o ni
 * tímhle tlačítkem; nikomu se nic nepřepíná za zády ani podle telefonu.
 *
 * Polohy jsou proto dvě, ne tři. Třetí („podle systému") by po zrušení
 * automatiky dělala přesně totéž co „světlý" — a dvě polohy se stejným
 * chováním a různým jménem jsou horší než jedna.
 *
 * MUSÍ SE POUŽÍT JEŠTĚ PŘED VYKRESLENÍM. Kdyby se atribut nastavoval až
 * po načtení skriptu, stihla by se stránka vykreslit světle a hned
 * ztmavnout — bílé bliknutí do očí v noci je přesně to, kvůli čemu si
 * lidé tmavý režim zapínají. Proto část tohohle souboru běží jako
 * malý vložený skript v hlavičce (viz PK_REZIM_HEAD v šabloně stránek)
 * a tady se řeší jen tlačítko.
 */
(function (root) {
  'use strict';
  var KLIC = 'pk_rezim_v1';
  var VOLBY = ['light', 'dark'];
  var POPIS = { light: 'Světlý', dark: 'Tmavý' };

  function cti() {
    try {
      var v = localStorage.getItem(KLIC);
      return VOLBY.indexOf(v) >= 0 ? v : 'light';
    } catch (e) { return 'light'; }
  }
  function uloz(v) {
    /* Světlá se ukládá taky, i když je výchozí: kdyby se jen mazala,
       nedalo by se odlišit „nic si nevybral" od „vybral si světlou",
       a obojí se sice dnes chová stejně, ale uložená volba má vydržet. */
    try { localStorage.setItem(KLIC, v); }
    catch (e) { /* zakázaná schránka: volba vydrží do konce návštěvy */ }
  }
  /* BARVA LIŠTY PROHLÍŽEČE. Na mobilu si Chrome i Safari obarví lištu
     s adresou podle theme-color. Dokud byla na všech 2153 stránkách
     jedna statická hodnota, byla ta lišta v tmavém režimu téměř bílá
     nad stránkou, která je skoro černá — nejnápadnější šev na celém
     webu a naprosto zbytečný.

     Hodnoty nejsou odhad ani výpočet, ale měření: ze snímku hlavičky na
     mobilní šířce se vzala nejčastější barva ze všech 33 150 pixelů.
     V tmavém režimu to je #17281E (44 % pixelů, zbytek do jedné
     jednotky), ve světlém #F9FAF9 (rozptyl #F8F9F8–#FBFCFB — hlavička
     má backdrop-filter, a ten výsledek po pixelech rozechvěje).

     Spočítat se to nedalo: složení bílé na 95 % nad #E3EFE7 vychází
     #FEFEFE, a tak hlavička NEVYPADÁ. Proto měření, ne aritmetika.

     A ještě poctivě: ve SVĚTLÉM režimu byla stará jediná hodnota
     #FBFAF8 prakticky správná (dvě jednotky vedle). Vada byla celá
     v tmavém — tam svítila nad stránkou #0E1A14 téměř bílá lišta.

     První nastavení dělá vložený úryvek v hlavičce ještě před
     vykreslením (jinak by lišta blikla). Tohle je ta druhá polovina:
     když si člověk režim přepne, musí se lišta přebarvit s ním. */
  var LISTA = { light: '#F9FAF9', dark: '#17281E' };
  function obarviListu(v) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'theme-color');
      document.head.appendChild(m);
    }
    m.setAttribute('content', LISTA[v === 'dark' ? 'dark' : 'light']);
  }

  function pouzij(v) {
    document.documentElement.setAttribute('data-theme', v === 'dark' ? 'dark' : 'light');
    obarviListu(v);
  }
  function dalsi(v) { return VOLBY[(VOLBY.indexOf(v) + 1) % VOLBY.length]; }

  var IKONY = {
    light: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    dark: '<path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a6.6 6.6 0 0 0 9.5 9.5Z"/>',
  };

  function postav() {
    var misto = document.getElementById('pk-rezim');
    if (!misto) return;
    var stav = cti();
    /* Výchozí polohu nasadíme hned, ať atribut odpovídá tomu, co tlačítko
       ukazuje. Nic to nepřekreslí — bez atributu je stránka světlá taky —
       jen se stav přestane dohadovat z jeho nepřítomnosti. */
    pouzij(stav);
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rezim-btn';
    b.id = 'pk-rezim-btn';
    function vykresli() {
      /* 2,18 u šestnácti pixelů dělá tah 1,45 px — jako ostatní ikony. */
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
        'stroke-width="2.18" stroke-linecap="round" stroke-linejoin="round">' + IKONY[stav] + '</svg>' +
        '<span>' + POPIS[stav] + '</span>';
      /* Na tlačítku stojí, co je NASTAVENO teď, a popisek pro odečítač
         říká i to, co udělá klepnutí — jinak by nevidomý člověk musel
         hádat, jestli „Tmavý" znamená stav, nebo akci. */
      b.setAttribute('aria-label', 'Vzhled: ' + POPIS[stav].toLowerCase()
        + '. Klepnutím přepnete na: ' + POPIS[dalsi(stav)].toLowerCase() + '.');
      b.title = 'Vzhled: ' + POPIS[stav].toLowerCase();
    }
    vykresli();
    b.addEventListener('click', function () {
      stav = dalsi(stav);
      uloz(stav);
      pouzij(stav);
      vykresli();
    });
    misto.appendChild(b);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', postav);
  else postav();

  root.PKRezim = { cti: cti, pouzij: pouzij, VOLBY: VOLBY, KLIC: KLIC };
}(typeof window !== 'undefined' ? window : globalThis));
