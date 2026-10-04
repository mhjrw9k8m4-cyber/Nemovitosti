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
    var barva = nast.barva || '#1F5138';
    var id = 'sn' + (nast.id != null ? nast.id : 0);
    var z = priblizeni(d, Vw, Vh), n = Math.pow(2, z);
    var WX = worldX(d.lng, n), WY = worldY(d.lat, n);
    var ox = WX - Vw / 2, oy = WY - Vh / 2;

    var dlazdice = '';
    for (var tx = Math.floor(ox / 256); tx <= Math.floor((ox + Vw) / 256); tx++) {
      for (var ty = Math.floor(oy / 256); ty <= Math.floor((oy + Vh) / 256); ty++) {
        var u = ZDROJ + z + '/' + ty + '/' + tx;
        dlazdice += '<image href="' + u + '" xlink:href="' + u + '" x="' + (tx * 256 - ox).toFixed(1) +
          '" y="' + (ty * 256 - oy).toFixed(1) + '" width="256" height="256" preserveAspectRatio="none"/>';
      }
    }

    var cx = Vw / 2, cy = Vh / 2;
    var spendlik = '<g transform="translate(' + cx + ',' + cy + ')" filter="url(#' + id + ')">' +
      '<path d="M0 0C-7 -12 -12 -18 -12 -25 A12 12 0 1 1 12 -25 C12 -18 7 -12 0 0Z" fill="' + barva +
      '" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle cx="0" cy="-25" r="4.6" fill="#fff"/></g>';

    return '<svg class="opp-map" viewBox="0 0 ' + Vw + ' ' + Vh + '" preserveAspectRatio="xMidYMid slice" ' +
      'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">' +
      '<defs><filter id="' + id + '" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(0,0,0,0.5)"/></filter></defs>' +
      '<rect width="' + Vw + '" height="' + Vh + '" fill="#14231C"/>' +
      '<g stroke="rgba(206,228,212,0.06)" stroke-width="1">' +
      '<path d="M64 0V' + Vh + 'M128 0V' + Vh + 'M192 0V' + Vh + 'M256 0V' + Vh + 'M320 0V' + Vh +
      'M0 60H' + Vw + 'M0 120H' + Vw + 'M0 180H' + Vw + '"/></g>' +
      dlazdice + spendlik +
      '</svg>';
  }

  function popis(d) {
    if (!d.place) return '';
    var v = d.area > 0
      ? (d.area >= 10000 ? (d.area / 10000).toFixed(d.area >= 100000 ? 0 : 1).replace('.', ',') + '\u00a0ha'
                         : String(Math.round(d.area)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0m²')
      : '';
    return '<span class="sn-popis" aria-hidden="true">' +
      '<b>' + esc(d.place) + '</b>' +
      (v ? '<i>' + v + '</i>' : '') +
      (d.area > 0 ? '<u>přesný obrys pozemku najdete v katastru</u>' : '') +
      '</span>';
  }

  global.PK_SNIMEK = { html: html, popis: popis, priblizeni: priblizeni, metryNaBod: metryNaBod, podklady: PODKLADY };
})(window);
