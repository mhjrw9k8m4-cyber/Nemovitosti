(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKBpej = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var JMENA = ['bpej', 'kod_bpej', 'kodbpej', 'kod', 'bpej_kod', 'bpejkod', 'cislo_bpej'];

  var HACKY = 'áäčďéěíľĺňóôöřŕšťúůüýž';
  var BEZ   = 'aacdeeillnooorrstuuuyz';
  function jmenoAtributu(x) {
    var s = String(x == null ? '' : x).toLowerCase(), v = '';
    for (var i = 0; i < s.length; i++) {
      var p = HACKY.indexOf(s.charAt(i));
      v += p === -1 ? s.charAt(i) : BEZ.charAt(p);
    }
    return v.replace(/[^a-z_]/g, '');
  }

  var JMENA_TRIDA = ['trida', 'trida_ochrany', 'tridaochrany', 'tr_ochrany', 'ochrana', 'trida_och'];

  var RIMSKE = { 1: 'I.', 2: 'II.', 3: 'III.', 4: 'IV.', 5: 'V.' };
  function normalizujTridu(x) {
    if (x == null) return null;
    var t = String(x).trim().toUpperCase().replace(/\.$/, '');
    if (/^(I|II|III|IV|V)$/.test(t)) return t + '.';
    if (/^[1-5]$/.test(t)) return RIMSKE[+t];
    return null;
  }

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

  function dvojiceZ(text) {
    var s = String(text == null ? '' : text);
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

      var rs = /([A-Za-z\u00C0-\u017F_][A-Za-z\u00C0-\u017F_ ]{2,24})\s*[:=]\s*([A-Za-z0-9]{1,6}\.?)(?![0-9])/g, w;
      while ((w = rs.exec(s))) dvojice.push([w[1], w[2]]);
    }

    return dvojice;
  }

  function kodZOdpovedi(text) {
    if (text == null) return null;
    var dvojice = dvojiceZ(text);
    for (var i = 0; i < dvojice.length; i++) {
      if (JMENA.indexOf(jmenoAtributu(dvojice[i][0])) === -1) continue;
      var k = normalizuj(dvojice[i][1]);
      if (k) return k;
    }

    return null;
  }

  function tridaZOdpovedi(text) {
    if (text == null) return null;
    var d = dvojiceZ(text);
    for (var i = 0; i < d.length; i++) {
      if (JMENA_TRIDA.indexOf(jmenoAtributu(d[i][0])) === -1) continue;
      var t = normalizujTridu(d[i][1]);
      if (t) return t;
    }
    return null;
  }

  function precti(text) {
    return { kod: kodZOdpovedi(text), trida: tridaZOdpovedi(text) };
  }

  return { dotazUrl: dotazUrl, kodZOdpovedi: kodZOdpovedi, tridaZOdpovedi: tridaZOdpovedi,
           precti: precti, normalizuj: normalizuj, normalizujTridu: normalizujTridu,
           JMENA: JMENA, JMENA_TRIDA: JMENA_TRIDA,
           dvojiceZ: dvojiceZ, jmenoAtributu: jmenoAtributu };
}));
