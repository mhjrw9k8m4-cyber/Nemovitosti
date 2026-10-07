(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.PKVyvoz = tovarna();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SLOUPCE = ['Obec', 'Okres', 'Druh', 'Kategorie', 'Výměra (m²)', 'Cena (Kč)',
    'Cena za m² (Kč)', 'Předchozí cena (Kč)', 'Změna ceny', 'Podíl', 'Termín dražby',
    'Odkaz na zdroj', 'Stránka na Parcelce',
    'Zeměpisná šířka', 'Zeměpisná délka', 'Dní do dražby', 'Vzdálenost (km)',
    'Uloženo', 'Moje poznámka'];

  var KATEGORIE = { sale: 'Na prodej', drazba: 'Dražba', exekuce: 'Exekuce',
    obec: 'Obecní záměr', majitel: 'Přímo od majitele' };

  function pole(x) {
    var s = (x == null) ? '' : String(x);
    if (!/[";\n\r]/.test(s)) return s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function dniDo(extra, dnes) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(extra || ''));
    if (!m) return '';
    var cil = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var d = dnes || new Date();
    var ted = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((cil - ted) / 86400000);
  }
  function kolikKm(km) {
    if (km == null || !isFinite(km)) return '';

    return (Math.round(km * 10) / 10).toString().replace('.', ',');
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
      stranka,
      typeof d.lat === 'number' ? d.lat.toFixed(5) : '',
      typeof d.lng === 'number' ? d.lng.toFixed(5) : '',
      dniDo(d.extra),
      pomocne.kmOd ? kolikKm(pomocne.kmOd(d)) : '',
      pomocne.jeUlozeny && pomocne.jeUlozeny(d) ? 'ano' : '',
      pomocne.poznamka ? (pomocne.poznamka(d) || '') : ''
    ].map(pole).join(';');
  }

  function csv(data, pomocne) {
    var p = pomocne || {};
    var radky = [SLOUPCE.map(pole).join(';')];
    for (var i = 0; i < (data || []).length; i++) radky.push(radek(data[i], p));

    return radky.join('\r\n') + '\r\n';
  }

  function nazev(popisFiltru, dnes, pripona) {
    var d = dnes || new Date();
    var dva = function (n) { return (n < 10 ? '0' : '') + n; };
    var cast = String(popisFiltru || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return 'parcelka-' + d.getFullYear() + '-' + dva(d.getMonth() + 1) + '-' + dva(d.getDate())
      + (cast ? '-' + cast : '') + '.' + (pripona || 'csv');
  }

  function xml(x) {
    return String(x == null ? '' : x)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function gpx(data, pomocne) {
    var p = pomocne || {};
    var cas = (p.ted || new Date()).toISOString();
    var kusy = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Parcelka" xmlns="http://www.topografix.com/GPX/1/1">',
      '<metadata><name>Parcelka — vybrané pozemky</name><time>' + cas + '</time></metadata>'];
    for (var i = 0; i < (data || []).length; i++) {
      var d = data[i];
      if (typeof d.lat !== 'number' || typeof d.lng !== 'number') continue;
      var zaM2 = p.zaMetr ? p.zaMetr(d) : null;
      var jmeno = (d.place || 'Pozemek')
        + (d.price > 0 ? ' · ' + Math.round(d.price).toLocaleString('cs-CZ') + ' Kč' : '');
      var popis = [
        KATEGORIE[d.type] || d.type || '',
        d.druh || '',
        d.area > 0 ? d.area + ' m²' : '',
        (zaM2 != null && isFinite(zaM2)) ? Math.round(zaM2) + ' Kč/m²' : '',
        d.podil ? ('podíl ' + (d.zlomek || '')) : '',
        datum(d.extra) ? ('dražba ' + datum(d.extra)) : '',
        p.poznamka && p.poznamka(d) ? ('poznámka: ' + p.poznamka(d)) : '',
        d.url || ''
      ].filter(Boolean).join(' · ');
      kusy.push('<wpt lat="' + d.lat.toFixed(6) + '" lon="' + d.lng.toFixed(6) + '">'
        + '<name>' + xml(jmeno) + '</name>'
        + '<desc>' + xml(popis) + '</desc>'
        + (d.url ? '<link href="' + xml(d.url) + '"></link>' : '')
        + '</wpt>');
    }
    kusy.push('</gpx>');
    return kusy.join('\n') + '\n';
  }

  return { csv: csv, gpx: gpx, nazev: nazev, dniDo: dniDo,
    SLOUPCE: SLOUPCE, KATEGORIE: KATEGORIE };
}));
