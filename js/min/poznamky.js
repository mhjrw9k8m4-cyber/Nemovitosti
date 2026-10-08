(function (root) {
  'use strict';
  var KLIC = 'pk_poznamky_v1';
  var STROP = 300;
  var ZNAKU = 2000;

  var mezi = null;
  var meziText = null;
  function cti() {
    var surovy;
    try { surovy = localStorage.getItem(KLIC) || '{}'; }
    catch (e) { return mezi || {}; }
    if (mezi && surovy === meziText) return mezi;
    try {
      var z = JSON.parse(surovy);
      mezi = (z && typeof z === 'object' && !Array.isArray(z)) ? z : {};
    } catch (e) { mezi = {}; }
    meziText = surovy;
    return mezi;
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

  function uklid(m) {
    var k = Object.keys(m);
    if (k.length <= STROP) return m;
    k.sort(function (a, b) { return (m[b].kdy || 0) - (m[a].kdy || 0); });
    var out = {};
    k.slice(0, STROP).forEach(function (x) { out[x] = m[x]; });
    return out;
  }

  function text(d) {
    var m = cti();
    var k = klicVeSchrance(m, d);
    if (!k) return '';
    var z = m[k];
    return (z && typeof z.text === 'string') ? z.text : '';
  }

  function uloz(d, novy) {
    var k = klicPozemku(d);
    if (!k) return false;
    var m = cti();
    var t = String(novy == null ? '' : novy).slice(0, ZNAKU);

    var stary = klicVeSchrance(m, d);
    if (stary && stary !== k) delete m[stary];
    if (!t.trim()) delete m[k];

    else m[k] = { text: t, kdy: Date.now() };

    meziText = null;
    try {
      localStorage.setItem(KLIC, JSON.stringify(uklid(m)));

      posli(k, t);
      return true;
    } catch (e) {

      return false;
    }
  }

  function vsechny() {
    var m = cti(), out = {};
    Object.keys(m).forEach(function (k) {
      out[k] = { text: m[k] && m[k].text, kdy: m[k] && m[k].kdy };
    });
    return out;
  }
  function kolik() { return Object.keys(cti()).length; }

  function prihlasen() {
    try { return !!(root.PKAuth && root.PKAuth.ready && root.PKAuth.loggedIn()); }
    catch (e) { return false; }
  }
  function posli(klic, t) {
    if (!prihlasen()) return Promise.resolve(false);
    return root.PKAuth.rpc('poznamka_uloz', { p_klic: klic, p_text: t })
      .then(function (r) {
        var ok = !!(r && r.ok);

        if (ok && t) oznacNahrano(klic, t);
        return ok;
      })
      .catch(function () { return false; });
  }
  function oznacNahrano(klic, t) {
    var m = cti();
    if (!m[klic] || m[klic].text !== t || m[klic].nahrano) return;
    m[klic].nahrano = true;
    meziText = null;
    try { localStorage.setItem(KLIC, JSON.stringify(m)); } catch (e) {}
  }

  function sync() {
    if (!prihlasen()) return Promise.resolve(null);
    return root.PKAuth.rpc('moje_poznamky', {}).then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.data)) return null;
      var mistni = cti();
      var nahore = {};
      r.data.forEach(function (x) {
        if (!x || !x.klic) return;
        nahore[x.klic] = { text: String(x.text || ''), kdy: Date.parse(x.zmeneno || '') || 0 };
      });
      var vysledek = {};
      var nahrat = [];
      var smazano = [];
      Object.keys(mistni).concat(Object.keys(nahore)).forEach(function (k) {
        if (vysledek[k] || smazano.indexOf(k) >= 0) return;
        var m = mistni[k], n = nahore[k];
        if (m && n) {
          var mistniNovejsi = (m.kdy || 0) > (n.kdy || 0);
          vysledek[k] = mistniNovejsi
            ? { text: m.text, kdy: m.kdy, nahrano: false }
            : { text: n.text, kdy: n.kdy, nahrano: true };

          if (mistniNovejsi) nahrat.push(k);
        } else if (m) {
          if (m.nahrano) smazano.push(k);
          else { vysledek[k] = m; nahrat.push(k); }
        } else {
          vysledek[k] = { text: n.text, kdy: n.kdy, nahrano: true };
        }
      });
      var zmen = 0;
      Object.keys(vysledek).forEach(function (k) {
        var m = mistni[k];
        if (!m || m.text !== vysledek[k].text) zmen++;
      });
      Object.keys(mistni).forEach(function (k) { if (!vysledek[k]) zmen++; });
      try { localStorage.setItem(KLIC, JSON.stringify(uklid(vysledek))); } catch (e) {}
      nahrat.forEach(function (k) {
        if (vysledek[k] && vysledek[k].text) posli(k, vysledek[k].text);
      });
      return zmen;
    }).catch(function () { return null; });
  }

  root.PKPoznamky = { text: text, uloz: uloz, vsechny: vsechny, kolik: kolik,
    sync: sync, prihlasen: prihlasen,
    KLIC: KLIC, STROP: STROP, ZNAKU: ZNAKU };
}(typeof window !== 'undefined' ? window : globalThis));
