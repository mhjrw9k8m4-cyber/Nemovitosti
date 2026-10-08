(function (root) {
  'use strict';
  var KLIC = 'pk_otevrene_v1';
  var STROP = 600;
  var DNI = 180;
  var DEN = 86400000;

  function cti() {
    try {
      var z = JSON.parse(localStorage.getItem(KLIC) || '{}');
      return (z && typeof z === 'object' && !Array.isArray(z)) ? z : {};
    } catch (e) { return {}; }
  }
  function zapis(m) {
    try { localStorage.setItem(KLIC, JSON.stringify(m)); } catch (e) {   }
  }

  function uklid(m) {
    var ted = Date.now();
    var dvojice = [];
    for (var k in m) {
      if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
      var t = +m[k];
      if (!isFinite(t) || ted - t > DNI * DEN) continue;
      dvojice.push([k, t]);
    }
    if (dvojice.length <= STROP) {
      var out = {};
      dvojice.forEach(function (p) { out[p[0]] = p[1]; });
      return out;
    }
    dvojice.sort(function (a, b) { return b[1] - a[1]; });
    var o2 = {};
    dvojice.slice(0, STROP).forEach(function (p) { o2[p[0]] = p[1]; });
    return o2;
  }

  function klicPozemku(d) {
    if (!d) return '';
    if (root.PKKlic && root.PKKlic.klicPozemku) { try { return root.PKKlic.klicPozemku(d); } catch (e) {} }
    return '';
  }

  function klicVeSchrance(m, d) {
    if (!d) return '';
    if (root.PKKlic && root.PKKlic.klicVe) {
      try { var k = root.PKKlic.klicVe(m, d); if (k) return k; } catch (e) {}
    }
    return klicPozemku(d);
  }

  function oznac(d) {
    var k = klicPozemku(d);
    if (!k) return '';
    var m = cti();
    m[k] = Date.now();
    zapis(uklid(m));
    return k;
  }

  function je(d) {
    var m = cti();
    var k = klicVeSchrance(m, d);
    return !!(k && m[k]);
  }

  function mnozina() {
    var m = cti(), s = {};
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) s[k] = 1;
    return s;
  }
  function zapomen() { try { localStorage.removeItem(KLIC); } catch (e) {} }
  function kolik() { return Object.keys(cti()).length; }

  root.PKVideno = { oznac: oznac, je: je, mnozina: mnozina, zapomen: zapomen,
    kolik: kolik, KLIC: KLIC, STROP: STROP, DNI: DNI };
}(typeof window !== 'undefined' ? window : globalThis));
