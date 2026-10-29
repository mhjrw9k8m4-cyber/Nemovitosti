/* Jak se cena a výměra píšou lidsky: „do 500 tis.", „2,5 ha".
 *
 * Z tohohle modulu zbyl jediný výpočet. Vznikl kvůli posuvníku
 * s histogramem, který v okně ceny a výměry nabízel rozsah ke klepnutí:
 * uměl nerovnoměrnou stupnici z kvantilů (`zarazky`), počty nabídek
 * v přihrádkách (`histogram`), zaokrouhlení na „hezká" čísla (`hezke`)
 * a dohledání nejbližší zarážky k ručně napsanému číslu (`index`).
 *
 * 29. 10. nechal majitel graf zrušit („ten graf nad tím dej pryč a nech
 * tam jen to nastavení ceny"), takže všechny čtyři přestaly mít čtenáře.
 * `index` ho ostatně neměl už předtím: zůstal po dřívějším táhle a nikdo
 * si toho nevšiml, protože modul si nikdo nepročítal celý. Smazané jsou
 * tedy všechny; co z nich platilo, zůstává v historii souboru.
 *
 * `popis` dál sází souhrn do panelu filtrů: „Cena · do 500 tis." */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKRozsah = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Jak se částka napíše do souhrnu. Nekonečno vrací null — „∞" se
     nedá přečíst nahlas. */
  function popis(hodnota, jednotka) {
    if (!isFinite(hodnota)) return null;
    if (jednotka === 'm2') {
      if (hodnota >= 10000) {
        var ha = hodnota / 10000;
        return (ha % 1 === 0 ? ha : ha.toFixed(1).replace('.', ',')) + '\u00a0ha';
      }
      return String(hodnota).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '\u00a0m²';
    }
    if (hodnota >= 1000000) {
      var mil = hodnota / 1000000;
      return (mil % 1 === 0 ? mil : mil.toFixed(1).replace('.', ',')) + ' mil.';
    }
    if (hodnota >= 1000) return Math.round(hodnota / 1000) + ' tis.';
    return String(hodnota);
  }

  return { popis: popis };
});
