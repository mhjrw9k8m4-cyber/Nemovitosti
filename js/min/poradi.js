(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKPoradi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIRKA_PASMA = 8;

  var KROK_ZA_DEN = 8;

  function denIndex(datum) {
    var d = datum || new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }

  function otisk(text, seed) {
    var h = (2166136261 ^ (seed | 0)) >>> 0;
    var s = String(text == null ? '' : text);
    for (var i = 0; i < s.length; i++) {
      h = (h ^ s.charCodeAt(i)) >>> 0;
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function pasmo(skore) { return Math.floor((skore || 0) / SIRKA_PASMA); }

  function prostridej(list, fnSkore, fnKlic, den, krok, prihozeni) {
    var d = den == null ? denIndex() : den;
    var k = krok == null ? KROK_ZA_DEN : krok;
    var j = prihozeni == null ? 0 : prihozeni;

    var pasma = new Map();
    list.forEach(function (x) {
      var p = pasmo(fnSkore(x));
      if (!pasma.has(p)) pasma.set(p, []);
      pasma.get(p).push(x);
    });
    var ven = [];
    Array.from(pasma.keys()).sort(function (a, b) { return b - a; }).forEach(function (p) {
      var skupina = pasma.get(p);

      var sOtiskem = skupina.map(function (x) { return { x: x, h: otisk(fnKlic(x), 0) }; });
      sOtiskem.sort(function (a, b) { return a.h - b.h; });
      skupina = sOtiskem.map(function (o) { return o.x; });

      var n = skupina.length;
      if (n > 1) {
        var posun = ((d * k + j) % n + n) % n;
        skupina = skupina.slice(posun).concat(skupina.slice(0, posun));
      }
      ven = ven.concat(skupina);
    });
    for (var i = 0; i < ven.length; i++) list[i] = ven[i];
    return list;
  }

  var KLIC_SEANCE = 'pk_poradi_seance';
  function prihozeniSeance() {
    var n = null;
    try {
      var ulozene = sessionStorage.getItem(KLIC_SEANCE);
      if (ulozene != null) n = parseInt(ulozene, 10);
      if (n == null || isNaN(n)) {
        n = Math.floor(Math.random() * KROK_ZA_DEN);
        sessionStorage.setItem(KLIC_SEANCE, String(n));
      }
    } catch (e) { n = Math.floor(Math.random() * KROK_ZA_DEN); }
    return n;
  }

  function zamichejZnovu() {
    var n = Math.floor(Math.random() * 1000000);
    try { sessionStorage.setItem(KLIC_SEANCE, String(n)); } catch (e) {}
    return n;
  }

  function nahodne(list, fnKlic, seed) {
    var s = seed == null ? prihozeniSeance() : seed;
    var poradi = new Map();
    list.forEach(function (d) { poradi.set(d, otisk(fnKlic(d), s)); });
    list.sort(function (a, b) { return poradi.get(a) - poradi.get(b); });
    return list;
  }

  var MIST_NA_STRIDACKU = 3;
  function stridacka(list, kolikVidet, mist, den, fnKlic, prihozeni, fnVhodne) {
    var videt = kolikVidet == null ? 8 : kolikVidet;
    var m = mist == null ? MIST_NA_STRIDACKU : mist;
    var d = den == null ? denIndex() : den;
    var j = prihozeni == null ? 0 : prihozeni;
    if (!list || m < 1 || list.length <= videt) return list;
    var drzi = list.slice(0, Math.max(0, videt - m));
    var zbytek = list.slice(Math.max(0, videt - m));

    var fronta = [];
    for (var i = 0; i < zbytek.length; i++) if (!fnVhodne || fnVhodne(zbytek[i])) fronta.push(zbytek[i]);
    if (!fronta.length) return list;

    var poradi = new Map();
    fronta.forEach(function (x, idx) { poradi.set(x, otisk(fnKlic(x), 0) * 4096 + (idx % 4096)); });
    fronta.sort(function (a, b) { return poradi.get(a) - poradi.get(b); });
    var n = fronta.length, vyber = [], vybrano = new Set();
    for (var s = 0; s < m && s < n; s++) {
      var kus = fronta[((d * m + j + s) % n + n) % n];
      if (!vybrano.has(kus)) { vybrano.add(kus); vyber.push(kus); }
    }
    var ven = drzi.concat(vyber);
    for (var k = 0; k < zbytek.length; k++) if (!vybrano.has(zbytek[k])) ven.push(zbytek[k]);
    for (var z = 0; z < ven.length; z++) list[z] = ven[z];
    return list;
  }

  return { SIRKA_PASMA: SIRKA_PASMA, KROK_ZA_DEN: KROK_ZA_DEN, denIndex: denIndex,
    MIST_NA_STRIDACKU: MIST_NA_STRIDACKU, stridacka: stridacka,
    otisk: otisk, pasmo: pasmo, prostridej: prostridej,
    prihozeniSeance: prihozeniSeance, zamichejZnovu: zamichejZnovu, nahodne: nahodne };
});
