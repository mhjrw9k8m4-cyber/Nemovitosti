/* Předloha musí říkat, co šablona OPRAVDU dělá.
 *
 * Dokud u ukázek stála čísla napsaná ručně, vzorník se rozešel s webem:
 * sliboval nadpis stránky 44 px a váhu 800, zatímco css/styles.css ho
 * dělá 50 px a 700; u nadpisu sekce 30 proti skutečným 33. Člověk podle
 * takového vzorníku něco navrhne a pak mu to na webu nesedí — a nikdo
 * neví, která z těch dvou čísel platí.
 *
 * Tenhle skript proto popisky nedoplňuje z paměti, ale z vypočtených
 * stylů té ukázky, která je vedle. Rozejít se už nemůžou.
 */
(function () {
  'use strict';

  function cislo(x) {
    var n = parseFloat(x);
    if (!isFinite(n)) return String(x);
    return (Math.round(n * 100) / 100).toString().replace('.', ',');
  }

  function popis(el) {
    var c = getComputedStyle(el);
    var casti = [cislo(c.fontSize) + ' px', c.fontWeight];
    var pr = parseFloat(c.letterSpacing);
    if (isFinite(pr) && Math.abs(pr) >= 0.05) {
      casti.push(cislo(pr / parseFloat(c.fontSize)) + ' em');
    }
    var rad = parseFloat(c.lineHeight);
    if (isFinite(rad)) casti.push('řádkování ' + cislo(rad / parseFloat(c.fontSize)));
    if (/mono/i.test(c.fontFamily)) casti.push('strojové písmo');
    return casti.join(' · ');
  }

  function dopis() {
    var mista = document.querySelectorAll('[data-mera]');
    for (var i = 0; i < mista.length; i++) {
      var znacka = mista[i];
      var vzor = znacka.parentElement;
      if (!vzor) continue;
      /* Popisek sám do měření nepatří — měří se text kolem něj. */
      znacka.textContent = popis(vzor);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dopis);
  } else {
    dopis();
  }
})();
