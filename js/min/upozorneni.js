(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.PKOdznak = factory(); root.PKOdznak.start(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KLIC = 'pk_upozorneni_v1';
  var ZNAMO = 'pk_upozorneni_znamo_v1';
  var PLATNOST = 60000;
  var DATA_URL = 'data/opportunities.json';

  function textOdznaku(n) {
    n = n | 0;
    if (n <= 0) return '';
    return n > 9 ? '9+' : String(n);
  }

  function titulekSPoctem(titulek, n) {
    var holy = String(titulek || '').replace(/^\(\d+\+?\)\s*/, '');
    return n > 0 ? '(' + textOdznaku(n) + ') ' + holy : holy;
  }

  function nactiZPameti(ted) {
    try {
      var s = JSON.parse(sessionStorage.getItem(KLIC) || 'null');
      if (s && typeof s.zpravy === 'number' && (ted - s.t) < PLATNOST) return s;
    } catch (e) {}
    return null;
  }
  function ulozDoPameti(zpravy, hlidani, ted) {
    try { sessionStorage.setItem(KLIC, JSON.stringify({ zpravy: zpravy, hlidani: hlidani, t: ted })); } catch (e) {}
  }
  function zapomen() { try { sessionStorage.removeItem(KLIC); } catch (e) {} }

  function vykresliOdkaz(odkaz, n, popis) {
    if (!odkaz) return;
    var stary = odkaz.querySelector('.nav-unread');
    if (stary) stary.remove();
    var t = textOdznaku(n);
    if (!t) return;
    var el = document.createElement('span');
    el.className = 'nav-unread';
    el.textContent = t;
    el.setAttribute('aria-label', n + ' ' + popis);
    odkaz.appendChild(el);
  }

  function vykresliTecku(n) {
    var tlacitko = document.querySelector('.nav-toggle');
    if (!tlacitko) return;
    var tecka = tlacitko.querySelector('.nav-dot');
    if (n > 0 && !tecka) {
      tecka = document.createElement('span');
      tecka.className = 'nav-dot';
      tecka.setAttribute('aria-hidden', 'true');
      tlacitko.appendChild(tecka);
      tlacitko.setAttribute('aria-label', 'Otevřít menu — čekají na vás novinky');
    } else if (n <= 0 && tecka) {
      tecka.remove();
      tlacitko.setAttribute('aria-label', 'Otevřít menu');
    }
  }

  function vykresli(zpravy, hlidani) {
    var celkem = zpravy + hlidani;

    vykresliOdkaz(document.getElementById('nav-moje-sum'), celkem, 'novinek');
    vykresliOdkaz(document.getElementById('nav-upozorneni'), celkem, 'novinek');
    vykresliOdkaz(document.getElementById('nav-zpravy'), zpravy, 'nepřečtených zpráv');
    vykresliOdkaz(document.getElementById('nav-hlidani'), hlidani, 'nových pozemků z hlídání');
    vykresliTecku(celkem);
    try { document.title = titulekSPoctem(document.title, celkem); } catch (e) {}
    zvazToast(zpravy, hlidani);
  }

  function zvazToast(zpravy, hlidani) {
    var celkem = zpravy + hlidani;
    var ulozene = null;
    try { ulozene = sessionStorage.getItem(ZNAMO); } catch (e) {}
    try { sessionStorage.setItem(ZNAMO, String(celkem)); } catch (e) {}

    if (ulozene === null) return;
    var drive = parseInt(ulozene, 10);
    if (!isFinite(drive)) return;
    if (celkem <= drive) return;

  }

  function spocitejHlidani(A) {
    if (!window.PKHlidani) return Promise.resolve(0);
    return A.rpc('my_searches', {}, true).then(function (res) {
      var hledani = (res && res.ok && Array.isArray(res.data)) ? res.data : [];
      if (!hledani.length) return 0;

      return Promise.all([
        fetch(DATA_URL, { cache: 'default' }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }),
        fetch('data/user-listings.json', { cache: 'default' }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
      ]).then(function (v) {
        var d = v[0], ul = v[1];
        if (!d) return 0;
        var vse = (d.opportunities || []).slice();
        var users = ul && (Array.isArray(ul) ? ul : ul.listings) || [];
        users.forEach(function (u) { if (u) { u.type = u.type || 'majitel'; vse.push(u); } });
        return window.PKHlidani.novychCelkem(hledani, vse);
      });
    }).catch(function () { return 0; });
  }

  function start() {

    var tady = location.pathname;

    if (/(zpravy|hlidani|upozorneni)\.html$/i.test(tady)) { zapomen(); return; }

    var spust = function () {
      var A = window.PKAuth;
      if (!A || !A.loggedIn || !A.loggedIn()) return;
      if (!document.getElementById('nav-zpravy') && !document.getElementById('nav-hlidani') &&
          !document.getElementById('nav-upozorneni') && !document.getElementById('nav-moje-sum')) return;

      var ted = Date.now();
      var z = nactiZPameti(ted);
      if (z) { vykresli(z.zpravy | 0, z.hlidani | 0); return; }

      Promise.all([
        A.rpc('unread_count', {}, true).then(function (res) { return (res && res.ok) ? (res.data | 0) : 0; }, function () { return 0; }),
        spocitejHlidani(A)
      ]).then(function (v) {
        ulozDoPameti(v[0], v[1], ted);
        vykresli(v[0], v[1]);
      });
    };

    if (document.readyState === 'complete') spust();
    else window.addEventListener('load', spust);
  }

  return { textOdznaku: textOdznaku, titulekSPoctem: titulekSPoctem, start: start };
});
