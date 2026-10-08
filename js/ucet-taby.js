/* POČET NEPŘEČTENÝCH PATŘÍ NA ZÁLOŽKU, NE JEN DO PROFILU
   ==================================================================
   Účet má tři záložky — Zprávy, Hlídání, Můj profil — a dokud byl
   člověk na Hlídání nebo v profilu, o nové zprávě se nedozvěděl. Číslo
   bylo jen na dlaždici v profilu, tedy na jedné ze tří stránek, a i tam
   až po sjetí k panelu. Zájemce o pozemek přitom píše právě sem a
   odpověď „do hodiny" prodává; nevšimnutá zpráva je ztracený obchod.

   Velké realitní weby to mají stejně: počet nepřečtených visí přímo na
   vstupu do zpráv, ať je člověk kdekoli ve svém účtu.

   JEDEN DOTAZ, DVĚ MÍSTA. Profil si dřív volal `my_threads` sám kvůli
   dlaždici. Kdyby si ho zavolal i tenhle modul, šly by ze stránky dva
   stejné dotazy. Výsledek se proto schová do příslibu, který si
   stránka vyzvedne přes PKUcetTaby.nepreCtene().

   NA STRÁNCE ZPRÁV SE NEPTÁ. Tam seznam vláken stejně přijde — a přijde
   znovu každých 20 vteřin. Číslo se bere odtud, přes
   PKUcetTaby.oznam(n), ať se po přečtení vlákna odznak rovnou změní.

   NIC SE NEUKAZUJE, DOKUD SE NEVÍ. Nula ani pomlčka: odznak buď nese
   počet, nebo tam není. Prázdný kroužek by lhal o tom, že se číslo
   zjistilo.
   ================================================================== */
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

  /** Vykreslí (nebo schová) odznak s počtem. */
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
    /* Přes 99 se číslo do kroužku nevejde a stejně nikoho nezajímá
       přesná hodnota — zajímá ho, že toho je hodně. */
    ODZNAK.textContent = n > 99 ? '99+' : String(n);
    /* Pro čtečku to musí být věta, ne holé číslo u slova „Zprávy". */
    ODZNAK.setAttribute('aria-label', n === 1 ? '1 nepřečtená zpráva'
      : (n < 5 ? n + ' nepřečtené zprávy' : n + ' nepřečtených zpráv'));
  }

  /** Součet nepřečtených ze seznamu vláken, jak ho vrací my_threads. */
  function sectiVlakna(rows) {
    var n = 0;
    for (var i = 0; i < (rows || []).length; i++) {
      var t = rows[i];
      n += Math.max(0, parseInt(t && t.unread, 10) || 0);
    }
    return n;
  }

  /** Stránka zpráv zná číslo z první ruky — nechť ho řekne. */
  function oznam(n) { vykresli(n); }

  /** Vrátí příslib s počtem nepřečtených. Ptá se nejvýš jednou. */
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
    /* Na stránce zpráv si číslo řekne stránka sama (oznam) — ta ho má
       čerstvé a obnovuje ho. Dvakrát se na totéž neptáme. */
    if (/(^|\/)zpravy\.html$/.test(location.pathname)) return;
    nepreCtene().then(function (n) { if (typeof n === 'number') vykresli(n); });
  }

  window.PKUcetTaby = { nepreCtene: nepreCtene, oznam: oznam, sectiVlakna: sectiVlakna,
    pocet: function () { return posledni; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
