(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PK_FOTKA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PREDPONA = 'https://api.bezrealitky.cz/media/cache/record_main/data/images/advert/';
  var HOSTITEL = 'api.bezrealitky.cz';

  function cisloInzeratu(url) {
    var m = /\/(\d{3,})-nabidka-/.exec(String(url == null ? '' : url));
    return m ? m[1] : null;
  }

  function zkratka(url, id) {
    var u = String(url == null ? '' : url);
    if (!u || u.indexOf(PREDPONA) !== 0) return null;
    var cislo = String(id == null ? '' : id);
    if (!/^\d{3,}$/.test(cislo)) return null;
    var cesta = Math.floor(Number(cislo) / 1000) + 'k/' + cislo + '/';
    var zbytek = u.slice(PREDPONA.length);
    if (zbytek.indexOf(cesta) !== 0) return null;
    var jmeno = zbytek.slice(cesta.length);

    return /^[A-Za-z0-9._-]+\.(jpe?g|png|webp|avif)$/i.test(jmeno) ? jmeno : null;
  }

  function url(d) {
    if (!d || !d.f) return null;
    var cislo = cisloInzeratu(d.url);
    if (!cislo) return null;
    return PREDPONA + Math.floor(Number(cislo) / 1000) + 'k/' + cislo + '/' + d.f;
  }

  return {
    PREDPONA: PREDPONA,
    HOSTITEL: HOSTITEL,
    cisloInzeratu: cisloInzeratu,
    zkratka: zkratka,
    url: url,
  };
});
