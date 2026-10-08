/* MOBILNÍ MENU — jedno jediné místo pro celý web.
   ==================================================================
   Tenhle kód byl v repozitáři ČTRNÁCTKRÁT a v JEDENÁCTI různých
   podobách (naměřeno): v js/main.js, js/pozemek.js, js/pridat.js
   a vložený v jedenácti ručně psaných stránkách. Kopie se rozešly
   přesně tak, jak se kopie rozcházejí vždycky — a nejhůř na tom byla
   ta nejrozšířenější:

     · js/pozemek.js (tedy 1 999 stránek pozemků) umělo jen přepnout
       třídu. NEZAVÍRALO se Escapem ani klepnutím na odkaz v menu —
       člověk si menu otevřel, klepl na odkaz, stránka se změnila
       a menu zůstalo přes ni roztažené.
     · jedenáct vložených kopií nezavíralo menu klepnutím mimo.
     · upozorneni.html k tomu neměnilo aria-label, takže odečítač
       pořád hlásil „Otevřít menu", i když bylo otevřené.

   Tady je sjednocení toho nejlepšího ze všech kopií: přepnutí třídy,
   aria-expanded, aria-label, zámek rolování (body.nav-open), zavření
   Escapem, zavření klepnutím na odkaz a zavření klepnutím mimo.

   A JE TO MALÉ. Stránky okresů a krajů si kvůli menu tahaly celý
   js/pridat.js, tedy 73,4 kB formulářové logiky k přidání pozemku —
   na stránce, kde žádný takový formulář není. Tohle má pod 2 kB.

   Nic se tu nespouští, když na stránce menu není: bez .nav-toggle
   a #nav se funkce vrátí a neudělá nic. */
(function (root) {
  'use strict';

  function napoj(doc) {
    var d = doc || document;
    var toggle = d.querySelector('.nav-toggle');
    var nav = d.getElementById('nav');
    if (!toggle || !nav) return false;
    /* Dvakrát napojit by znamenalo dvakrát přepnout, tedy nic. */
    if (toggle.getAttribute('data-menu') === 'ano') return true;
    toggle.setAttribute('data-menu', 'ano');

    function nastav(otevreno) {
      nav.classList.toggle('open', otevreno);
      toggle.setAttribute('aria-expanded', String(otevreno));
      toggle.setAttribute('aria-label', otevreno ? 'Zavřít menu' : 'Otevřít menu');
      d.body.classList.toggle('nav-open', otevreno);
    }
    function zavri() { if (nav.classList.contains('open')) nastav(false); }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      nastav(!nav.classList.contains('open'));
    });
    /* Klepnutí na odkaz v menu: stránka se mění, menu musí zmizet. */
    nav.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'A') zavri();
    });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') zavri(); });
    /* Klepnutí mimo. Přišlo z js/main.js — jedenáct vložených kopií to
       nemělo, takže menu na většině stránek nešlo zavřít jinak než
       druhým klepnutím na přepínač. */
    d.addEventListener('click', function (e) {
      if (!nav.classList.contains('open')) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      zavri();
    });

    /* SHODIT TAHEM DOLŮ — a klepnutím na úchytku.
       Panel vyjíždí zespoda a má nahoře úchytku, tedy vypadá jako
       vysouvací panel z telefonní aplikace. Jenže se tak nechoval:
       zavřít ho šlo jedině křížkem úplně nahoře na obrazovce, nebo
       klepnutím mimo. Úchytka tak slibovala pohyb, který nikam nevedl —
       a křížek je u panelu, co stojí na spodní hraně, to nejvzdálenější
       místo, kam musí palec dojít.
       Úchytka je ::after, tedy nic, na co jde pověsit obsluhu; bere se
       proto podle polohy: horních 30 px panelu, a jen když se netrefím
       do odkazu. Tah dolů o 60 px a víc panel zavře. Pod tu mez se nic
       neděje — kdo panelem jen rolujeme, nemá ho tím shazovat. */
    var zacY = null, rolovaniNaZacatku = 0;
    nav.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) { zacY = null; return; }
      zacY = e.touches[0].clientY;
      rolovaniNaZacatku = nav.scrollTop;
    }, { passive: true });
    nav.addEventListener('touchend', function (e) {
      if (zacY === null) return;
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      var posun = t ? t.clientY - zacY : 0;
      zacY = null;
      /* Jen když panel stál nahoře. Uprostřed dlouhého seznamu je tah
         dolů rolování, ne zavírání. */
      if (rolovaniNaZacatku <= 0 && posun >= 60) zavri();
    }, { passive: true });
    nav.addEventListener('click', function (e) {
      if (!nav.classList.contains('open')) return;
      if (e.target !== nav) return;                       // trefa do prázdna, ne do řádku
      if (e.offsetY <= 30) zavri();                       // pruh s úchytkou
    });
    return true;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { napoj: napoj };
  } else {
    root.PKMenu = { napoj: napoj };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { napoj(document); });
    } else {
      napoj(document);
    }
  }
}(typeof window !== 'undefined' ? window : globalThis));
