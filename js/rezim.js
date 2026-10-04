/* Přepínač světlý / tmavý.
 *
 * ŘÍDÍ SE SYSTÉMEM, dokud si člověk nevybere jinak. To je výchozí stav
 * a je správně: kdo má v telefonu noční režim, čeká ho i tady, a nikdo
 * nechce nastavovat totéž na každém webu zvlášť. Volba je proto trojí —
 * „podle systému", „světlý", „tmavý" — a ne přepínač se dvěma polohami,
 * u kterého se k „podle systému" už nedá vrátit.
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
  var VOLBY = ['system', 'light', 'dark'];
  var POPIS = { system: 'Podle systému', light: 'Světlý', dark: 'Tmavý' };

  function cti() {
    try {
      var v = localStorage.getItem(KLIC);
      return VOLBY.indexOf(v) >= 0 ? v : 'system';
    } catch (e) { return 'system'; }
  }
  function uloz(v) {
    try { if (v === 'system') localStorage.removeItem(KLIC); else localStorage.setItem(KLIC, v); }
    catch (e) { /* zakázaná schránka: volba vydrží do konce návštěvy */ }
  }
  function pouzij(v) {
    var h = document.documentElement;
    if (v === 'system') h.removeAttribute('data-theme');
    else h.setAttribute('data-theme', v);
  }
  function dalsi(v) { return VOLBY[(VOLBY.indexOf(v) + 1) % VOLBY.length]; }

  var IKONY = {
    system: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none"/>',
    light: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    dark: '<path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a6.6 6.6 0 0 0 9.5 9.5Z"/>',
  };

  function postav() {
    var misto = document.getElementById('pk-rezim');
    if (!misto) return;
    var stav = cti();
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
