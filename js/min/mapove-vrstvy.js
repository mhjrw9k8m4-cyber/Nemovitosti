(function (global) {
  'use strict';

  var CESTA = 'data/mapove-vrstvy.json';
  var PAMET = 'pk_vrstvy_v1';
  var PLATNOST = 30 * 60 * 1000;
  var LIMIT = 5000;

  function merc(lat, lng) {
    var R = 6378137;
    var y = R * Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));
    return [R * lng * Math.PI / 180, y];
  }

  function bbox3857(lat, lng, polomer) {
    var s = merc(lat, lng), r = polomer || 300;
    return [(s[0] - r).toFixed(1), (s[1] - r).toFixed(1), (s[0] + r).toFixed(1), (s[1] + r).toFixed(1)].join(',');
  }

  function wmsAdresa(s, param) {
    var q = {
      SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap',
      LAYERS: s.vrstvy || '', STYLES: '', SRS: 'EPSG:3857',
      FORMAT: s.format || 'image/png', TRANSPARENT: 'TRUE'
    };
    for (var k in param) if (Object.prototype.hasOwnProperty.call(param, k)) q[k] = param[k];
    var casti = [];
    for (var j in q) if (Object.prototype.hasOwnProperty.call(q, j)) casti.push(j + '=' + encodeURIComponent(q[j]));
    return s.url + (s.url.indexOf('?') === -1 ? '?' : '&') + casti.join('&');
  }

  function zkusebniAdresa(s, lat, lng) {
    if (s.typ === 'dlazdice') {

      var z = s.zkusebniPriblizeni || 14, n = Math.pow(2, z);
      var x = Math.floor((lng + 180) / 360 * n);
      var rad = lat * Math.PI / 180;
      var y = Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n);
      return s.url.replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{s}', 'a');
    }
    return wmsAdresa(s, { WIDTH: 64, HEIGHT: 64, BBOX: bbox3857(lat, lng, 300) });
  }

  function legendaAdresa(s) {
    if (!s || s.typ !== 'wms' || !s.vrstvy) return '';
    return wmsAdresa(s, { REQUEST: 'GetLegendGraphic', LAYER: String(s.vrstvy).split(',')[0] });
  }

  function zkus(url, limit) {
    return new Promise(function (hotovo) {
      var img = new Image(), dobehlo = false;
      function konec(vysledek) {
        if (dobehlo) return;
        dobehlo = true;
        clearTimeout(cas);
        img.onload = img.onerror = null;
        hotovo(vysledek);
      }

      var cas = setTimeout(function () { try { img.src = ''; } catch (e) {} konec(false); }, limit || LIMIT);
      img.onload = function () { konec(img.naturalWidth > 0 && img.naturalHeight > 0); };

      img.onerror = function () { konec(false); };
      img.src = url;
    });
  }

  var nactene = null;

  function nacti() {
    if (nactene) return nactene;
    nactene = fetch(CESTA, { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && Array.isArray(j.vrstvy)) ? j.vrstvy : []; })
      .catch(function () { return []; });
    return nactene;
  }

  function zPameti() {
    try {
      var s = JSON.parse(sessionStorage.getItem(PAMET) || 'null');
      if (s && (Date.now() - s.kdy) < PLATNOST) return s.stav || {};
    } catch (e) {}
    return {};
  }
  function doPameti(stav) {
    try { sessionStorage.setItem(PAMET, JSON.stringify({ kdy: Date.now(), stav: stav })); } catch (e) {}
  }

  function pripravene(stred, naVrstvu) {
    return nacti().then(function (defs) {
      var pamet = zPameti(), novaPamet = {};
      return Promise.all(defs.map(function (def) {
        var sluzby = Array.isArray(def.sluzby) ? def.sluzby : [];

        var znamo = pamet[def.id];
        if (znamo === -1) { novaPamet[def.id] = -1; return Promise.resolve(null); }
        var poradi = (typeof znamo === 'number' && sluzby[znamo]) ? [znamo] : sluzby.map(function (_, i) { return i; });
        var i = 0;
        function dal() {
          if (i >= poradi.length) {
            novaPamet[def.id] = -1;
            return null;
          }
          var idx = poradi[i++];
          return zkus(zkusebniAdresa(sluzby[idx], stred.lat, stred.lng)).then(function (ok) {
            if (!ok) return dal();
            novaPamet[def.id] = idx;
            return { def: def, sluzba: sluzby[idx] };
          });
        }
        return Promise.resolve(dal()).then(function (v) {
          if (v && typeof naVrstvu === 'function') { try { naVrstvu(v); } catch (e) {} }
          return v;
        });
      })).then(function (vse) {
        doPameti(novaPamet);
        var ziva = vse.filter(Boolean);

        ziva.mrtve = defs.filter(function (def) {
          return !ziva.some(function (z) { return z.def.id === def.id; });
        }).map(function (def) { return def.nazev; });
        return ziva;
      });
    });
  }

  function leafletVrstva(z, L) {
    L = L || global.L;
    if (!L) return null;
    var s = z.sluzba, d = z.def;

    var nast = {
      opacity: typeof d.kryti === 'number' ? d.kryti : 1,
      attribution: d.uvedeni || '',
      maxZoom: 19,
      crossOrigin: false
    };
    if (d.odPriblizeni) nast.minZoom = d.odPriblizeni;
    if (s.typ === 'dlazdice') return L.tileLayer(s.url, nast);
    return L.tileLayer.wms(s.url, Object.assign({
      layers: s.vrstvy || '', format: s.format || 'image/png',
      transparent: true, version: '1.1.1', uppercase: true
    }, nast));
  }

  global.PK_VRSTVY = {
    nacti: nacti,
    pripravene: pripravene,
    leafletVrstva: leafletVrstva,
    legendaAdresa: legendaAdresa,

    _zkus: zkus,
    _bbox3857: bbox3857,
    _zkusebniAdresa: zkusebniAdresa,
    _zapomen: function () { nactene = null; try { sessionStorage.removeItem(PAMET); } catch (e) {} }
  };
})(window);
