(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKBpej = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var JMENA = ['bpej', 'kod_bpej', 'kodbpej', 'kod', 'bpej_kod', 'bpejkod', 'cislo_bpej'];

  var TVAR = /(?:^|[^0-9])([0-9])[.\-\s]?([0-9]{2})[.\-\s]?([0-9]{2})(?:[^0-9]|$)/;

  function normalizuj(s) {
    if (s == null) return null;
    var m = TVAR.exec(String(s));
    if (!m) return null;
    return m[1] + m[2] + m[3];
  }

  function dotazUrl(sluzba, lat, lng, nast) {
    if (!sluzba || !sluzba.url || !isFinite(lat) || !isFinite(lng)) return null;
    var o = nast || {};
    var d = o.vyrez == null ? 0.0002 : o.vyrez;
    var px = o.px || 101;
    var stred = Math.floor(px / 2);
    var p = [
      'SERVICE=WMS', 'REQUEST=GetFeatureInfo', 'VERSION=1.1.1',
      'LAYERS=' + encodeURIComponent(sluzba.vrstvy || ''),
      'QUERY_LAYERS=' + encodeURIComponent(sluzba.vrstvy || ''),
      'SRS=EPSG:4326',
      'BBOX=' + [lng - d, lat - d, lng + d, lat + d].join(','),
      'WIDTH=' + px, 'HEIGHT=' + px, 'X=' + stred, 'Y=' + stred,
      'INFO_FORMAT=' + encodeURIComponent(o.format || 'application/json'),
      'FEATURE_COUNT=1',
    ];
    return sluzba.url + (sluzba.url.indexOf('?') >= 0 ? '&' : '?') + p.join('&');
  }

  function kodZOdpovedi(text) {
    if (text == null) return null;
    var s = String(text);
    var dvojice = [];

    try {
      var j = JSON.parse(s);
      var zdroje = [];
      if (j && Array.isArray(j.features)) j.features.forEach(function (f) { if (f && f.properties) zdroje.push(f.properties); });
      if (j && j.properties) zdroje.push(j.properties);
      if (j && typeof j === 'object' && !Array.isArray(j) && !j.features) zdroje.push(j);
      zdroje.forEach(function (o) {
        Object.keys(o).forEach(function (k) { dvojice.push([k, o[k]]); });
      });
    } catch (e) {   }

    if (!dvojice.length) {

      var re = /<(?:[A-Za-z0-9_]+:)?([A-Za-z0-9_]+)[^>]*>([^<]{1,60})<\//g, m;
      while ((m = re.exec(s))) dvojice.push([m[1], m[2]]);

      var rt = /<t[hd][^>]*>\s*([^<]{1,40}?)\s*<\/t[hd]>\s*<t[hd][^>]*>\s*([^<]{1,60}?)\s*<\/t[hd]>/gi, t;
      while ((t = rt.exec(s))) dvojice.push([t[1], t[2]]);

      var rp = /([A-Za-z_]{3,20})\s*[:=]\s*([0-9.\-\s]{5,12})/g, q;
      while ((q = rp.exec(s))) dvojice.push([q[1], q[2]]);
    }

    for (var i = 0; i < dvojice.length; i++) {
      var jm = String(dvojice[i][0] || '').toLowerCase().replace(/[^a-z_]/g, '');
      if (JMENA.indexOf(jm) === -1) continue;
      var k = normalizuj(dvojice[i][1]);
      if (k) return k;
    }

    return null;
  }

  return { dotazUrl: dotazUrl, kodZOdpovedi: kodZOdpovedi, normalizuj: normalizuj, JMENA: JMENA };
}));
