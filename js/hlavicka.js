/* Hlavička: při pohybu zhasne, po zastavení se rozsvítí úplně nahoře.
 *
 * Dřív byla lepivá (position:sticky). Na iPhonu se při rolování zastavovala
 * kousek pod horním okrajem, nad ní prosvítal pruh stránky a přes nadpis
 * v úvodu ležela její polovina. Dva pokusy o opravu (transform pryč,
 * ořezávání pryč) tu chybu neodstranily a na počítači se vůbec neprojeví,
 * takže se ani nedala ověřit.
 *
 * Tohle je jiný přístup, ne další záplata: hlavička drží pevně u okraje
 * (position:fixed — u toho žádné dohadování o vztažném rámci není) a při
 * rolování se schová. Kdo roluje, čte obsah, ne navigaci; a co není vidět,
 * nemůže přes obsah ležet. Jakmile se pohyb zastaví, hlavička se hned
 * vrátí — úplně nahoře.
 *
 * Vždycky svítí: u horního okraje stránky, při otevřeném menu a když je
 * v ní kurzor (ovládání klávesnicí).
 */
(function () {
  'use strict';
  var h = document.querySelector('header');
  if (!h) return;

  var PRAH = 40;        // do 40 px od začátku stránky nezhasínáme
  var PAUZA = 140;      // po téhle době bez rolování se rozsvítí
  var casovac = null;
  var zhasnuta = false;

  function rozsvit() {
    if (!zhasnuta) return;
    zhasnuta = false;
    h.classList.remove('hl-zhasnuta');
  }
  function zhasni() {
    if (zhasnuta) return;
    // Otevřené menu je součástí hlavičky — schovat ji pod rukou je hrubost.
    if (document.body.classList.contains('nav-open')) return;
    // Ovládání klávesnicí: kdo je uvnitř hlavičky, o ni nesmí přijít.
    if (h.contains(document.activeElement)) return;
    zhasnuta = true;
    h.classList.add('hl-zhasnuta');
  }

  window.addEventListener('scroll', function () {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (y <= PRAH) { clearTimeout(casovac); rozsvit(); return; }
    zhasni();
    clearTimeout(casovac);
    casovac = setTimeout(rozsvit, PAUZA);
  }, { passive: true });

  // Klepnutí, tah nebo klávesa uvnitř hlavičky ji vrátí okamžitě.
  h.addEventListener('focusin', rozsvit);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Tab') rozsvit();
  });
})();
