(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKRozsah = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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
