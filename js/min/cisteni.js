(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PKCisteni = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DRUHY = { sale: 1, drazba: 1, exekuce: 1, obec: 1, majitel: 1 };

  function text(v, max) {
    return String(v == null ? '' : v).replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 120);
  }

  function viceradkovy(v, max) {
    return String(v == null ? '' : v)
      .replace(/[<>"]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim().slice(0, max || 2000);
  }

  function odkaz(v) {
    var u = String(v == null ? '' : v).trim();
    if (!/^https?:\/\//i.test(u)) return '';
    if (/["'<>\s]/.test(u)) return '';
    return u.slice(0, 500);
  }

  var POLE = {
    place: 80, okres: 60, parcel: 40, druh: 60, extra: 160,

    contact: 80, description: 2000, access: 40,

    cast: 80, zlomek: 40
  };

  var FOTKA = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/listing-photos\/[^"'<>\s]{1,400}$/;
  function klicSite(a) {
    if (!Array.isArray(a)) return [];
    var out = [];
    for (var i = 0; i < a.length && out.length < 8; i++) {
      if (typeof a[i] === 'string' && /^[a-z]{3,20}$/.test(a[i]) && out.indexOf(a[i]) < 0) out.push(a[i]);
    }
    return out;
  }
  function popisky(a) {
    if (!Array.isArray(a)) return [];
    var out = [], v;
    for (var i = 0; i < a.length && out.length < 6; i++) {
      v = text(a[i], 40);
      if (v && v.indexOf('<') < 0 && v.indexOf('>') < 0 && out.indexOf(v) < 0) out.push(v);
    }
    return out;
  }
  function fotky(a) {
    if (!Array.isArray(a)) return [];
    var out = [];
    for (var i = 0; i < a.length && out.length < 8; i++) {
      if (typeof a[i] === 'string' && FOTKA.test(a[i]) && out.indexOf(a[i]) < 0) out.push(a[i]);
    }
    return out;
  }

  function pozemek(d) {
    if (!d || typeof d !== 'object') return null;
    if (!DRUHY[d.type]) d.type = 'sale';
    for (var k in POLE) if (Object.prototype.hasOwnProperty.call(POLE, k)) {
      if (k === 'description') continue;
      if (d[k] != null || k === 'place') d[k] = text(d[k], POLE[k]);
    }
    if (d.description != null) d.description = viceradkovy(d.description, POLE.description);
    if (!d.place) d.place = 'Neuvedeno';
    d.url = odkaz(d.url);
    if (d.site != null) d.site = klicSite(d.site);
    if (d.features != null) d.features = popisky(d.features);
    if (d.photos != null) d.photos = fotky(d.photos);
    if (d.podil != null) d.podil = !!d.podil;
    return d;
  }

  function pozemky(arr) {
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var d = pozemek(arr[i]);
      if (d) out.push(d);
    }
    return out;
  }

  var OK_FEAT = { 'Elektřina': 1, 'Voda': 1, 'Kanalizace': 1, 'Plyn': 1,
    'Oplocení': 1, 'Stavba k rekonstrukci': 1 };
  var G = (typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : {}));
  function majitel(u) {

    if (!u || typeof u.lat !== 'number' || typeof u.lng !== 'number') return null;
    var feat = (Array.isArray(u.features) ? u.features : [])
      .filter(function (f) { return OK_FEAT[f]; }).slice(0, 6);

    var V = G.PKVybaveni;
    return pozemek({
      type: 'majitel',
      place: u.place, okres: u.okres,
      druh: u.druh || 'pozemek',
      parcel: u.parcel || '—',
      area: (typeof u.area === 'number' ? u.area : 0),
      price: (typeof u.price === 'number' ? u.price : 0),
      lat: u.lat, lng: u.lng,
      extra: 'od majitele',
      contact: u.contact,
      description: u.description,
      photos: u.photos,
      features: feat,
      site: (V && V.klice ? V.klice(feat) : []),
      access: u.access,
      _lid: u.id,
      views: (typeof u.views === 'number' ? u.views : 0)
    });
  }

  function kontaktOdkaz(c) {
    c = String(c == null ? '' : c).trim();
    if (/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(c)) return 'mailto:' + c;
    var tel = c.replace(/[^\d+]/g, '');
    return /^\+?\d{9,15}$/.test(tel) ? 'tel:' + tel : '';
  }
  function jeEmail(c) { return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(c == null ? '' : c).trim()); }

  function majitele(rows) {
    if (!Array.isArray(rows)) return [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var d = majitel(rows[i]);
      if (d) out.push(d);
    }
    return out;
  }

  return { text: text, odkaz: odkaz, pozemek: pozemek, pozemky: pozemky,
    majitel: majitel, majitele: majitele, OK_FEAT: OK_FEAT,
    kontaktOdkaz: kontaktOdkaz, jeEmail: jeEmail, DRUHY: DRUHY };
});
