/* Odznak s počtem nepřečtených zpráv u položky „Zprávy" v menu.
 *
 * Proč vlastní soubor: tenhle kód byl vložený natvrdo jen v index.html, takže
 * odznak svítil na jediné stránce ze sta dvou. Kdo přišel na stránku okresu —
 * a tam chodí lidé z vyhledávání nejčastěji — se o nové zprávě nedozvěděl.
 * Psaní v aplikaci pak vypadá mrtvě, i když funguje.
 *
 * Počet se drží chvíli v sessionStorage, ať se při proklikávání webu neptáme
 * serveru na každé stránce znovu. Otevření schránky značku zahodí, aby se
 * číslo po přečtení nedrželo zastaralé.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.PKOdznak = factory(); root.PKOdznak.start(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KLIC = 'pk_unread_v1';
  var PLATNOST = 60000;          // 1 minuta

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
      if (s && typeof s.n === 'number' && (ted - s.t) < PLATNOST) return s.n;
    } catch (e) {}
    return null;
  }
  function ulozDoPameti(n, ted) {
    try { sessionStorage.setItem(KLIC, JSON.stringify({ n: n, t: ted })); } catch (e) {}
  }
  function zapomen() { try { sessionStorage.removeItem(KLIC); } catch (e) {} }

  function vykresli(odkaz, n) {
    if (!odkaz) return;
    var stary = odkaz.querySelector('.nav-unread');
    if (stary) stary.remove();
    var t = textOdznaku(n);
    if (t) {
      var el = document.createElement('span');
      el.className = 'nav-unread';
      el.textContent = t;
      el.setAttribute('aria-label', n + ' nepřečtených zpráv');
      odkaz.appendChild(el);
    }
    try { document.title = titulekSPoctem(document.title, n); } catch (e) {}

    // Na mobilu je celé menu schované za hamburgerem, takže odznak u položky
    // „Zprávy" není vidět, dokud ho člověk neotevře — a otevřít ho nemá proč,
    // když neví, že mu někdo napsal. Tečka přímo na tlačítku menu to řeší.
    var tlacitko = document.querySelector('.nav-toggle');
    if (tlacitko) {
      var tecka = tlacitko.querySelector('.nav-dot');
      if (n > 0 && !tecka) {
        tecka = document.createElement('span');
        tecka.className = 'nav-dot';
        tecka.setAttribute('aria-hidden', 'true');
        tlacitko.appendChild(tecka);
        tlacitko.setAttribute('aria-label', 'Otevřít menu — máte nepřečtené zprávy');
      } else if (n <= 0 && tecka) {
        tecka.remove();
        tlacitko.setAttribute('aria-label', 'Otevřít menu');
      }
    }
  }

  function start() {
    // Ve schránce samotné nemá odznak smysl — a hlavně by po přečtení lhal.
    if (/zpravy\.html$/i.test(location.pathname)) { zapomen(); return; }

    var spust = function () {
      var A = window.PKAuth;
      var odkaz = document.getElementById('nav-zpravy');
      if (!odkaz || !A || !A.loggedIn || !A.loggedIn()) return;

      var ted = Date.now();
      var z = nactiZPameti(ted);
      if (z !== null) { vykresli(odkaz, z); return; }

      A.rpc('unread_count', {}, true).then(function (res) {
        var n = (res && res.ok) ? (res.data | 0) : 0;
        ulozDoPameti(n, ted);
        vykresli(odkaz, n);
      }, function () {});
    };

    if (document.readyState === 'complete') spust();
    else window.addEventListener('load', spust);
  }

  return { textOdznaku: textOdznaku, titulekSPoctem: titulekSPoctem, start: start };
});
