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

    try { localStorage.setItem(KLIC, v); }
    catch (e) {   }
  }
  function pouzij(v) {
    document.documentElement.setAttribute('data-theme', v === 'dark' ? 'dark' : 'light');
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

    pouzij(stav);
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rezim-btn';
    b.id = 'pk-rezim-btn';
    function vykresli() {

      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
        'stroke-width="2.18" stroke-linecap="round" stroke-linejoin="round">' + IKONY[stav] + '</svg>' +
        '<span>' + POPIS[stav] + '</span>';

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
