(function (global) {
  'use strict';

  var ZDROJ = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';

  var PODKLADY = [
    { id: 'letecka', nazev: 'Letecká', url: ZDROJ + '{z}/{y}/{x}',
      uvedeni: '&copy; Esri, Maxar, Earthstar Geographics', max: 19 },
    { id: 'zakladni', nazev: 'Základní', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      uvedeni: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', max: 19 }
  ];

  function worldX(lng, n) { return (lng + 180) / 360 * 256 * n; }
  function worldY(lat, n) {
    var r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * n;
  }

  function metryNaBod(lat, z) {
    return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
  }

  function priblizeni(d, sirka, vyska) {
    if (!(d.area > 0) || !isFinite(d.lat)) return 16;
    var strana = Math.sqrt(d.area);
    var cil = Math.min(sirka, vyska) * 0.52;
    for (var z = 18; z >= 13; z--) {
      if (strana / metryNaBod(d.lat, z) <= cil) return z;
    }
    return 13;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function html(d, nast) {
    nast = nast || {};
    var Vw = nast.sirka || 384, Vh = nast.vyska || 240;
    var barva = nast.barva || '#0F5C3B';
    var id = 'sn' + (nast.id != null ? nast.id : 0);
    var z = priblizeni(d, Vw, Vh), n = Math.pow(2, z);
    var WX = worldX(d.lng, n), WY = worldY(d.lat, n);
    var ox = WX - Vw / 2, oy = WY - Vh / 2;

    var dlazdice = '';
    for (var tx = Math.floor(ox / 256); tx <= Math.floor((ox + Vw) / 256); tx++) {
      for (var ty = Math.floor(oy / 256); ty <= Math.floor((oy + Vh) / 256); ty++) {
        var u = ZDROJ + z + '/' + ty + '/' + tx;
        dlazdice += '<image data-href="' + u + '" x="' + (tx * 256 - ox).toFixed(1) +
          '" y="' + (ty * 256 - oy).toFixed(1) + '" width="256" height="256" preserveAspectRatio="none"/>';
      }
    }

    var cx = Vw / 2, cy = Vh / 2;
    var spendlik = '<g transform="translate(' + cx + ',' + cy + ')" filter="url(#' + id + ')">' +
      '<path d="M0 0C-7 -12 -12 -18 -12 -25 A12 12 0 1 1 12 -25 C12 -18 7 -12 0 0Z" fill="' + barva +
      '" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle cx="0" cy="-25" r="4.6" fill="#fff"/></g>';

    return '<svg class="opp-map" data-sn="ceka" viewBox="0 0 ' + Vw + ' ' + Vh + '" preserveAspectRatio="xMidYMid slice" ' +
      'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">' +
      '<defs><filter id="' + id + '" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(0,0,0,0.5)"/></filter></defs>' +

      '<rect class="opp-map-pod" width="' + Vw + '" height="' + Vh + '"/>' +
      '<g stroke="rgba(206,228,212,0.06)" stroke-width="1">' +
      '<path d="M64 0V' + Vh + 'M128 0V' + Vh + 'M192 0V' + Vh + 'M256 0V' + Vh + 'M320 0V' + Vh +
      'M0 60H' + Vw + 'M0 120H' + Vw + 'M0 180H' + Vw + '"/></g>' +
      dlazdice + spendlik +
      '</svg>';
  }

  function popis(d) {
    if (!d.place || !(d.area > 0)) return '';
    return '<span class="sn-popis" aria-hidden="true">' +
      '<u>přesný obrys pozemku najdete v katastru</u>' +
      '</span>';
  }

  function nahled(d, zoomy) {
    if (!d || !isFinite(d.lat) || !isFinite(d.lng)) return null;

    var zaklad = priblizeni(d, 256, 256);
    var rada = zoomy || [zaklad, zaklad - 1, zaklad + 1, zaklad - 2]

      .filter(function (z) { return z >= 13 && z <= 18; });
    var prvni = null;
    for (var i = 0; i < rada.length; i++) {
      var z = rada[i], n = Math.pow(2, z);
      var WX = worldX(d.lng, n), WY = worldY(d.lat, n);
      var tx = Math.floor(WX / 256), ty = Math.floor(WY / 256);
      var kus = { z: z, x: tx, y: ty, ox: WX - tx * 256, oy: WY - ty * 256,
        url: ZDROJ + z + '/' + ty + '/' + tx };
      if (!prvni) prvni = kus;

      if (kus.ox > 48 && kus.ox < 208 && kus.oy > 48 && kus.oy < 208) return kus;
    }
    return prvni;
  }

  var XLINK = 'http://www.w3.org/1999/xlink';
  function probud(el) {
    if (!el || !el.querySelectorAll) return;
    el.removeAttribute && el.removeAttribute('data-sn');
    var o = el.querySelectorAll('image[data-href]');
    for (var i = 0; i < o.length; i++) {
      var u = o[i].getAttribute('data-href');
      o[i].removeAttribute('data-href');
      o[i].setAttribute('href', u);
      try { o[i].setAttributeNS(XLINK, 'xlink:href', u); } catch (e) {}
    }
  }

  var hlidac = null;
  if (global.IntersectionObserver) {
    hlidac = new global.IntersectionObserver(function (zapisy) {
      for (var i = 0; i < zapisy.length; i++) {
        if (!zapisy[i].isIntersecting) continue;
        hlidac.unobserve(zapisy[i].target);
        probud(zapisy[i].target);
      }
    }, { rootMargin: '600px 0px' });
  }

  function prihlas(korene) {
    for (var k = 0; k < korene.length; k++) {
      var r = korene[k];
      if (!r || r.nodeType !== 1) continue;
      var sez = r.matches && r.matches('[data-sn="ceka"]') ? [r] : [];
      if (r.querySelectorAll) {
        var dal = r.querySelectorAll('[data-sn="ceka"]');
        for (var i = 0; i < dal.length; i++) sez.push(dal[i]);
      }
      for (var j = 0; j < sez.length; j++) {

        if (hlidac) hlidac.observe(sez[j]); else probud(sez[j]);
      }
    }
  }

  if (global.MutationObserver && global.document) {
    new global.MutationObserver(function (zmeny) {
      for (var i = 0; i < zmeny.length; i++) {
        if (zmeny[i].addedNodes && zmeny[i].addedNodes.length) prihlas(zmeny[i].addedNodes);
      }
    }).observe(global.document.documentElement, { childList: true, subtree: true });
  }
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () { prihlas([global.document.body]); });
    } else { prihlas([global.document.body]); }
  }

  global.PK_SNIMEK = { html: html, popis: popis, priblizeni: priblizeni, metryNaBod: metryNaBod,
    nahled: nahled, podklady: PODKLADY, probud: probud, prihlas: prihlas };
})(window);
