(function (root) {
  'use strict';
  function pkey(d) {
    if (!d) return '';

    if (d.__pk) return d.__pk;
    var la = (typeof d.lat === 'number') ? d.lat.toFixed(3) : '';
    var ln = (typeof d.lng === 'number') ? d.lng.toFixed(3) : '';
    var k = [d.place || '', d.parcel || '', d.okres || '', la, ln].join('|');
    if (typeof d === 'object') {
      try { Object.defineProperty(d, '__pk', { value: k, enumerable: false, configurable: true }); }
      catch (e) {}
    }
    return k;
  }

  function pkeyLegacy(d) {
    return [(d && d.place) || '', (d && d.parcel) || '', (d && d.okres) || ''].join('|');
  }

  function otisk(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function totoznostZdroje(url) {
    if (!url) return null;
    var s = String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '')
      .replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
    if (!s) return null;
    var i = s.indexOf('/');
    var host = i < 0 ? s : s.slice(0, i);
    var cesta = i < 0 ? '' : s.slice(i);
    var cisla = cesta.match(/\d{4,}/g);
    if (cisla && cisla.length) {
      var nej = cisla[0];
      for (var j = 1; j < cisla.length; j++) if (cisla[j].length > nej.length) nej = cisla[j];
      return host + '/' + nej;
    }
    return s;
  }

  function klicPozemku(d) {
    if (!d) return '';
    var v = (typeof d.area === 'number' && isFinite(d.area)) ? Math.round(d.area) : 0;
    return pkey(d) + '#v' + v;
  }

  function kliceProCteni(d) {
    if (!d) return [];
    return [klicPozemku(d), pkey(d)];
  }

  function jeMezi(sbirka, d) {
    if (!sbirka) return false;
    var kl = kliceProCteni(d);
    for (var i = 0; i < kl.length; i++) {
      if (!kl[i]) continue;
      if (Array.isArray(sbirka)) { if (sbirka.indexOf(kl[i]) !== -1) return true; }
      else if (Object.prototype.hasOwnProperty.call(sbirka, kl[i])) return true;
    }
    return false;
  }

  function klicVe(sbirka, d) {
    var kl = kliceProCteni(d);
    for (var i = 0; i < kl.length; i++) {
      if (!kl[i]) continue;
      if (Array.isArray(sbirka)) { if (sbirka.indexOf(kl[i]) !== -1) return kl[i]; }
      else if (sbirka && Object.prototype.hasOwnProperty.call(sbirka, kl[i])) return kl[i];
    }
    return null;
  }

  function klicArchivu(d) {
    if (!d) return '';
    var t = totoznostZdroje(typeof d.url === 'string' ? d.url.trim() : '');
    if (t) return pkey(d) + '#' + otisk(t);
    var v = (typeof d.area === 'number' && isFinite(d.area)) ? Math.round(d.area) : 0;
    return pkey(d) + '#v' + v;
  }
  root.PKKlic = { pkey: pkey, pkeyLegacy: pkeyLegacy, klicArchivu: klicArchivu,
    klicPozemku: klicPozemku, kliceProCteni: kliceProCteni, jeMezi: jeMezi, klicVe: klicVe,
    totoznostZdroje: totoznostZdroje, otisk: otisk };
}(typeof window !== 'undefined' ? window : this));
