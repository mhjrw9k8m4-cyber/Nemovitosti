(function (root) {
  'use strict';
  var KLIC = 'pk_poznamky_v1';
  var STROP = 300;
  var ZNAKU = 2000;

  function cti() {
    try {
      var z = JSON.parse(localStorage.getItem(KLIC) || '{}');
      return (z && typeof z === 'object' && !Array.isArray(z)) ? z : {};
    } catch (e) { return {}; }
  }
  function klicPozemku(d) {
    if (!d) return '';
    if (root.PKKlic && root.PKKlic.pkey) { try { return root.PKKlic.pkey(d); } catch (e) {} }
    return '';
  }

  function uklid(m) {
    var k = Object.keys(m);
    if (k.length <= STROP) return m;
    k.sort(function (a, b) { return (m[b].kdy || 0) - (m[a].kdy || 0); });
    var out = {};
    k.slice(0, STROP).forEach(function (x) { out[x] = m[x]; });
    return out;
  }

  function text(d) {
    var k = klicPozemku(d);
    if (!k) return '';
    var z = cti()[k];
    return (z && typeof z.text === 'string') ? z.text : '';
  }

  function uloz(d, novy) {
    var k = klicPozemku(d);
    if (!k) return false;
    var m = cti();
    var t = String(novy == null ? '' : novy).slice(0, ZNAKU);
    if (!t.trim()) delete m[k];
    else m[k] = { text: t, kdy: Date.now() };
    try {
      localStorage.setItem(KLIC, JSON.stringify(uklid(m)));
      return true;
    } catch (e) {

      return false;
    }
  }
  function vsechny() { return cti(); }
  function kolik() { return Object.keys(cti()).length; }

  root.PKPoznamky = { text: text, uloz: uloz, vsechny: vsechny, kolik: kolik,
    KLIC: KLIC, STROP: STROP, ZNAKU: ZNAKU };
}(typeof window !== 'undefined' ? window : globalThis));
