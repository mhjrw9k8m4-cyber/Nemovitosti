(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKHledani = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[-\u2010-\u2015]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokeny(q) {
    var n = norm(q);
    return n ? n.split(' ') : [];
  }

  function seno(d) {
    if (!d) return '';
    if (typeof d.__seno === 'string') return d.__seno;
    var s = norm([d.place, d.okres, d.parcel, d.druh].join(' '));
    try { d.__seno = s; } catch (e) {   }
    return s;
  }

  function zacatekSlova(s, t) {
    if (!t) return true;
    var i = s.indexOf(t);
    while (i >= 0) {
      if (i === 0) return true;
      var pred = s.charAt(i - 1);
      if (pred === ' ' || pred === '/') return true;
      i = s.indexOf(t, i + 1);
    }
    return false;
  }

  function vyhovuje(d, toks) {
    if (!toks || !toks.length) return true;
    var s = seno(d);
    for (var i = 0; i < toks.length; i++) if (!zacatekSlova(s, toks[i])) return false;
    return true;
  }

  function bod(la, ln) {
    return typeof la === 'number' && typeof ln === 'number'
      && isFinite(la) && isFinite(ln)
      && la >= -90 && la <= 90 && ln >= -180 && ln <= 180;
  }
  function median(a) {
    var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
  }
  function misto(data, q) {
    var toks = tokeny(q);
    if (!toks.length || norm(q).length < 2) return null;
    var skupiny = {}, vsechnyLat = [], vsechnyLng = [], i, k;
    for (i = 0; i < (data || []).length; i++) {
      var d = data[i];
      if (!bod(d.lat, d.lng)) continue;
      var obec = norm(d.place), okres = norm(d.okres), kde = obec + ' ' + okres;
      var vse = true;
      for (k = 0; k < toks.length; k++) if (kde.indexOf(toks[k]) === -1) { vse = false; break; }
      if (!vse) continue;

      var prvni = toks[0];
      var kvalita = obec === prvni ? 3 : (obec.indexOf(prvni) === 0 ? 2 : (obec.indexOf(prvni) >= 0 ? 1 : 0));
      var g = skupiny[kde] || (skupiny[kde] = { lat: [], lng: [], kvalita: kvalita, place: d.place, okres: d.okres });
      if (kvalita > g.kvalita) g.kvalita = kvalita;
      g.lat.push(d.lat); g.lng.push(d.lng);
      vsechnyLat.push(d.lat); vsechnyLng.push(d.lng);
    }
    var nej = null;
    for (var kde2 in skupiny) {
      var g2 = skupiny[kde2];
      if (!nej || g2.kvalita > nej.kvalita
        || (g2.kvalita === nej.kvalita && g2.lat.length > nej.lat.length)) nej = g2;
    }
    if (!nej) return null;

    if (!nej.kvalita) {
      return { lat: median(vsechnyLat), lng: median(vsechnyLng), place: null, okres: nej.okres, pocet: vsechnyLat.length };
    }
    return { lat: median(nej.lat), lng: median(nej.lng), place: nej.place, okres: nej.okres, pocet: nej.lat.length };
  }

  function navrhy(data, q, limit) {
    var toks = tokeny(q);
    if (!toks.length || norm(q).length < 2) return [];
    var max = limit || 6, prvni = toks[0], i, k;
    var obce = {}, okresy = {};
    for (i = 0; i < (data || []).length; i++) {
      var d = data[i];
      var obec = norm(d.place), okres = norm(d.okres);
      if (!obec && !okres) continue;
      var kde = obec + ' ' + okres, sedi = true;
      for (k = 0; k < toks.length; k++) if (kde.indexOf(toks[k]) === -1) { sedi = false; break; }
      if (!sedi) continue;
      if (obec && obec.indexOf(prvni) >= 0) {
        var kl = obec + '|' + okres;
        if (!obce[kl]) obce[kl] = { text: d.place, okres: d.okres, pocet: 0, typ: 'obec',
          poradi: obec === prvni ? 0 : (obec.indexOf(prvni) === 0 ? 1 : 2) };
        obce[kl].pocet++;
      } else if (okres && okres.indexOf(prvni) >= 0) {
        if (!okresy[okres]) okresy[okres] = { text: d.okres, okres: null, pocet: 0, typ: 'okres',
          poradi: okres === prvni ? 0 : (okres.indexOf(prvni) === 0 ? 1 : 2) };
        okresy[okres].pocet++;
      }
    }
    var ven = [];
    for (var a in obce) ven.push(obce[a]);
    ven.sort(function (x, y) { return x.poradi - y.poradi || y.pocet - x.pocet || x.text.localeCompare(y.text, 'cs'); });
    var okr = [];
    for (var b in okresy) okr.push(okresy[b]);
    okr.sort(function (x, y) { return x.poradi - y.poradi || y.pocet - x.pocet; });

    var proOkresy = Math.min(okr.length, max > 3 ? 2 : 1);
    return ven.slice(0, max - proOkresy).concat(okr.slice(0, proOkresy)).slice(0, max);
  }

  function vzdalenost(a, b, strop) {
    if (Math.abs(a.length - b.length) > strop) return strop + 1;
    var pred = new Array(b.length + 1), akt = new Array(b.length + 1), i, j;
    for (j = 0; j <= b.length; j++) pred[j] = j;
    for (i = 1; i <= a.length; i++) {
      akt[0] = i;
      var nejmensi = akt[0];
      for (j = 1; j <= b.length; j++) {
        var cena = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        akt[j] = Math.min(akt[j - 1] + 1, pred[j] + 1, pred[j - 1] + cena);
        if (akt[j] < nejmensi) nejmensi = akt[j];
      }
      if (nejmensi > strop) return strop + 1;
      for (j = 0; j <= b.length; j++) pred[j] = akt[j];
    }
    return pred[b.length];
  }
  function mysleliJste(data, q) {
    var n = norm(q);
    if (n.length < 3 || n.indexOf(' ') >= 0) return null;
    var strop = n.length <= 4 ? 1 : 2;
    var nej = null, videno = {}, i, jm;
    for (i = 0; i < (data || []).length; i++) {
      var d = data[i];
      if (!d) continue;

      for (var c = 0; c < 2; c++) {
        jm = c ? d.okres : d.place;
        if (!jm) continue;
        var nj = norm(jm);
        if (!nj || videno[nj]) continue;
        videno[nj] = 1;
        if (nj === n) return null;

        if (nj.charAt(0) !== n.charAt(0)) continue;
        var v = vzdalenost(n, nj, strop);
        if (v <= strop && (!nej || v < nej.v)) nej = { v: v, text: jm };
      }
    }
    return nej ? nej.text : null;
  }

  return { norm: norm, tokeny: tokeny, seno: seno, vyhovuje: vyhovuje, zacatekSlova: zacatekSlova, median: median, bod: bod,
    misto: misto, navrhy: navrhy, vzdalenost: vzdalenost, mysleliJste: mysleliJste };
});
