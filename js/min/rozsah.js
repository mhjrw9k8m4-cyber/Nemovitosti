(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKRozsah = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cislo(x) { return typeof x === 'number' && isFinite(x) && x > 0; }

  var MANTISY = [1, 1.5, 2, 3, 5, 7, 10];
  function hezke(x) {
    if (!cislo(x)) return 0;
    var rad = Math.pow(10, Math.floor(Math.log(x) / Math.LN10));
    var d = x / rad;
    for (var i = 0; i < MANTISY.length; i++) if (d <= MANTISY[i] + 1e-9) return MANTISY[i] * rad;
    return 10 * rad;
  }

  function zarazky(hodnoty, pocet) {
    var v = [];
    for (var i = 0; i < (hodnoty || []).length; i++) if (cislo(hodnoty[i])) v.push(hodnoty[i]);
    if (v.length < 2) return [0, Infinity];
    v.sort(function (a, b) { return a - b; });
    var n = Math.max(4, pocet || 18);
    var ven = [0];
    for (var k = 1; k < n; k++) {
      var q = v[Math.min(v.length - 1, Math.floor(k / n * v.length))];
      var h = hezke(q);
      if (h > ven[ven.length - 1]) ven.push(h);
    }

    var strop = hezke(v[Math.min(v.length - 1, Math.floor(0.97 * v.length))]);
    if (strop > ven[ven.length - 1]) ven.push(strop);
    ven.push(Infinity);
    return ven;
  }

  function histogram(hodnoty, zar) {
    var ven = [];
    var i;
    for (i = 0; i < zar.length - 1; i++) ven.push(0);
    for (i = 0; i < (hodnoty || []).length; i++) {
      var x = hodnoty[i];
      if (!cislo(x)) continue;
      for (var k = zar.length - 2; k >= 0; k--) {
        if (x >= zar[k]) { ven[k]++; break; }
      }
    }
    return ven;
  }

  function index(zar, hodnota) {
    if (hodnota == null || hodnota === '' || !isFinite(hodnota)) return -1;
    var nej = 0, rozdil = Infinity;
    for (var i = 0; i < zar.length; i++) {
      var z = zar[i];
      if (!isFinite(z)) continue;
      var d = Math.abs(z - hodnota);
      if (d < rozdil) { rozdil = d; nej = i; }
    }
    return nej;
  }

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

  return { hezke: hezke, zarazky: zarazky, histogram: histogram, index: index, popis: popis };
});
