(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.PKVyvoz = tovarna();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SLOUPCE = ['Obec', 'Okres', 'Druh', 'Kategorie', 'Výměra (m²)', 'Cena (Kč)',
    'Cena za m² (Kč)', 'Předchozí cena (Kč)', 'Změna ceny', 'Podíl', 'Termín dražby',
    'Odkaz na zdroj', 'Stránka na Parcelce'];

  var KATEGORIE = { sale: 'Na prodej', drazba: 'Dražba', exekuce: 'Exekuce',
    obec: 'Obecní záměr', majitel: 'Přímo od majitele' };

  function pole(x) {
    var s = (x == null) ? '' : String(x);
    if (!/[";\n\r]/.test(s)) return s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function datum(extra) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(extra || ''));
    return m ? (+m[3] + '.' + (+m[2]) + '.' + m[1]) : '';
  }

  function radek(d, pomocne) {
    var zaM2 = pomocne.zaMetr ? pomocne.zaMetr(d) : null;
    var klic = pomocne.klic ? pomocne.klic(d) : '';
    var stranka = klic ? (pomocne.web || '') + 'pozemek.html?p=' + encodeURIComponent(klic) : '';
    return [
      d.place || '', d.okres || '', d.druh || '', KATEGORIE[d.type] || d.type || '',
      d.area > 0 ? d.area : '',
      d.price > 0 ? d.price : '',
      (zaM2 == null || !isFinite(zaM2)) ? '' : Math.round(zaM2),

      d.cena_drive > 0 ? d.cena_drive : '',
      d.cena_zmena || '',
      d.podil ? (d.zlomek || 'ano') : '',
      datum(d.extra),
      d.url || '',
      stranka
    ].map(pole).join(';');
  }

  function csv(data, pomocne) {
    var p = pomocne || {};
    var radky = [SLOUPCE.map(pole).join(';')];
    for (var i = 0; i < (data || []).length; i++) radky.push(radek(data[i], p));

    return radky.join('\r\n') + '\r\n';
  }

  function nazev(popisFiltru, dnes) {
    var d = dnes || new Date();
    var dva = function (n) { return (n < 10 ? '0' : '') + n; };
    var cast = String(popisFiltru || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return 'parcelka-' + d.getFullYear() + '-' + dva(d.getMonth() + 1) + '-' + dva(d.getDate())
      + (cast ? '-' + cast : '') + '.csv';
  }

  return { csv: csv, nazev: nazev, SLOUPCE: SLOUPCE, KATEGORIE: KATEGORIE };
}));
