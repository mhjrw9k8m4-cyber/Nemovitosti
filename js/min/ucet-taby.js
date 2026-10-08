(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.document) return;

  var ODKAZ = null, ODZNAK = null, slib = null, posledni = null;

  function zalozka() {
    if (ODKAZ) return ODKAZ;
    var pas = document.querySelector('.uc-taby');
    if (!pas) return null;
    var a = pas.querySelector('a[href="zpravy.html"], a[href$="/zpravy.html"]');
    ODKAZ = a || null;
    return ODKAZ;
  }

  function vykresli(n) {
    var a = zalozka();
    if (!a) return;
    posledni = n;
    if (!(typeof n === 'number' && isFinite(n) && n > 0)) {
      if (ODZNAK && ODZNAK.parentNode) ODZNAK.parentNode.removeChild(ODZNAK);
      ODZNAK = null;
      a.removeAttribute('aria-describedby');
      return;
    }
    if (!ODZNAK) {
      ODZNAK = document.createElement('span');
      ODZNAK.className = 'uc-tab-pocet';
      ODZNAK.id = 'uc-tab-pocet';
      a.appendChild(ODZNAK);
      a.setAttribute('aria-describedby', 'uc-tab-pocet');
    }

    ODZNAK.textContent = n > 99 ? '99+' : String(n);

    ODZNAK.setAttribute('aria-label', n === 1 ? '1 nepřečtená zpráva'
      : (n < 5 ? n + ' nepřečtené zprávy' : n + ' nepřečtených zpráv'));
  }

  function sectiVlakna(rows) {
    var n = 0;
    for (var i = 0; i < (rows || []).length; i++) {
      var t = rows[i];
      n += Math.max(0, parseInt(t && t.unread, 10) || 0);
    }
    return n;
  }

  function oznam(n) { vykresli(n); }

  function nepreCtene() {
    if (slib) return slib;
    var A = window.PKAuth;
    if (!A || !A.rpc || !A.loggedIn || !A.loggedIn()) {
      slib = Promise.resolve(null);
      return slib;
    }
    slib = A.rpc('my_threads', {}, true).then(function (res) {
      if (!res || !res.ok || !Array.isArray(res.data)) return null;
      return sectiVlakna(res.data);
    }, function () { return null; });
    return slib;
  }

  function start() {
    if (!zalozka()) return;

    if (/(^|\/)zpravy\.html$/.test(location.pathname)) return;
    nepreCtene().then(function (n) { if (typeof n === 'number') vykresli(n); });
  }

  window.PKUcetTaby = { nepreCtene: nepreCtene, oznam: oznam, sectiVlakna: sectiVlakna,
    pocet: function () { return posledni; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
