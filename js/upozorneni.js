/* Upozornění v menu — nepřečtené zprávy a nové pozemky z hlídání.
 *
 * Proč to existuje: obojí web uměl, ale nikomu to neřekl. Počet
 * nepřečtených zpráv byl vložený natvrdo jen v index.html, takže svítil na
 * jediné stránce ze sta dvou. A hlídání lokality umí spočítat, kolik
 * nových pozemků na člověka čeká, jenže to číslo bylo vidět teprve po
 * otevření stránky hlídání — na kterou nemá důvod jít, když neví, že tam
 * něco je. Hlídací pes, který štěká jen když se na něj člověk podívá,
 * není hlídací pes.
 *
 * Počty se drží chvíli v sessionStorage, ať se při proklikávání webu
 * neptáme serveru na každé stránce znovu. Na stránce, které se počet týká,
 * se značka zahodí, aby po přečtení nedržela zastaralé číslo.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.PKOdznak = factory(); root.PKOdznak.start(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KLIC = 'pk_upozorneni_v1';
  var PLATNOST = 60000;          // 1 minuta
  var DATA_URL = 'data/opportunities.json';

  // Na odznaku se nad devítku píše „9+" — delší číslo by rozhodilo menu.
  function textOdznaku(n) {
    n = n | 0;
    if (n <= 0) return '';
    return n > 9 ? '9+' : String(n);
  }

  // Titulek záložky nese počet taky: kdo má web otevřený na pozadí, uvidí to
  // v liště prohlížeče, aniž by se musel přepnout.
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

  // Na mobilu je celé menu schované za hamburgerem, takže odznaky uvnitř
  // nejsou vidět, dokud ho člověk neotevře — a otevřít ho nemá proč, když
  // neví, že na něj něco čeká. Tečka přímo na tlačítku menu to řeší.
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
    vykresliOdkaz(document.getElementById('nav-zpravy'), zpravy, 'nepřečtených zpráv');
    vykresliOdkaz(document.getElementById('nav-hlidani'), hlidani, 'nových pozemků z hlídání');
    vykresliTecku(zpravy + hlidani);
    try { document.title = titulekSPoctem(document.title, zpravy + hlidani); } catch (e) {}
  }

  /* Kolik nových pozemků čeká. Nejdřív se zeptáme na uložená hledání —
     to je levné. Teprve když nějaké existuje, stáhne se soubor s pozemky
     (přes 500 kB; komprimovaně kolem 74 kB a prohlížeč ho obvykle už má
     z mapy). Bez uloženého hledání se nestahuje vůbec nic. */
  function spocitejHlidani(A) {
    if (!window.PKHlidani) return Promise.resolve(0);
    return A.rpc('my_searches', {}, true).then(function (res) {
      var hledani = (res && res.ok && Array.isArray(res.data)) ? res.data : [];
      if (!hledani.length) return 0;
      return fetch(DATA_URL, { cache: 'default' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return 0;
          return window.PKHlidani.novychCelkem(hledani, d.opportunities || []);
        });
    }).catch(function () { return 0; });
  }

  function start() {
    // Na stránce, které se počet týká, by odznak po přečtení lhal.
    var tady = location.pathname;
    var naZpravach = /zpravy\.html$/i.test(tady);
    var naHlidani = /hlidani\.html$/i.test(tady);
    if (naZpravach || naHlidani) { zapomen(); return; }

    var spust = function () {
      var A = window.PKAuth;
      if (!A || !A.loggedIn || !A.loggedIn()) return;
      if (!document.getElementById('nav-zpravy') && !document.getElementById('nav-hlidani')) return;

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
