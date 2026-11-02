(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.PKVyvoz = tovarna();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SLOUPCE = ['Obec', 'Okres', 'Druh', 'Kategorie', 'Výměra (m²)', 'Cena (Kč)',
    'Cena za m² (Kč)', 'Předchozí cena (Kč)', 'Změna ceny', 'Podíl', 'Termín dražby',
    'Odkaz na zdroj', 'Stránka na Parcelce',
    'Zeměpisná šířka', 'Zeměpisná délka', 'Dní do dražby', 'Vzdálenost (km)',
    'Uloženo', 'Moje poznámka',

    'Parcelní číslo', 'Část obce', 'Výměra podílu (m²)', 'Sítě a cesta',
    'Nabídek od téhož inzerenta', 'V nabídce od', 'Dní v nabídce'];

  var STRUCNE = ['Obec', 'Část obce', 'Parcelní číslo', 'Druh', 'Výměra (m²)',
    'Cena (Kč)', 'Cena za m² (Kč)', 'Termín dražby', 'Odkaz na zdroj'];

  var KATEGORIE = { sale: 'Na prodej', drazba: 'Dražba', exekuce: 'Exekuce',
    obec: 'Obecní záměr', majitel: 'Přímo od majitele' };

  var VZOREC = /^[=+@\t\r]/;
  var CISLO = /^-?\d+([.,]\d+)?$/;
  function pole(x) {
    var s = (x == null) ? '' : String(x);
    if (VZOREC.test(s) || (s.charAt(0) === '-' && !CISLO.test(s))) s = "'" + s;
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

  function dniOd(iso, dnes) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var od = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var d = dnes || new Date();
    var ted = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.max(0, Math.round((ted - od) / 86400000));
  }
  function denCesky(iso) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
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
      pomocne.poznamka ? (pomocne.poznamka(d) || '') : '',

      /^[\s—–-]*$/.test(String(d.parcel || '')) ? '' : d.parcel,
      d.cast || '',
      d.vymera_podilu > 0 ? d.vymera_podilu : '',

      (d.site && d.site.length)
        ? d.site.map(function (k) {
            return (pomocne.nazevSite && pomocne.nazevSite(k)) || k;
          }).join(', ')
        : '',
      (pomocne.odTehozInz && d.inz) ? (pomocne.odTehozInz(d) || '') : '',
      denCesky(d.first_seen),
      dniOd(d.first_seen, pomocne.ted)
    ];
  }

  function indexy(nazvy) {
    return (nazvy || SLOUPCE).map(function (n) {
      var i = SLOUPCE.indexOf(n);
      if (i < 0) throw new Error('Neznámý sloupec: ' + n);
      return i;
    });
  }

  function matice(data, pomocne, nazvy) {
    var p = pomocne || {}, ix = indexy(nazvy), ven = [];
    var hlavicka = ix.map(function (i) { return SLOUPCE[i]; });
    ven.push(hlavicka);
    for (var i = 0; i < (data || []).length; i++) {
      var r = radek(data[i], p);
      ven.push(ix.map(function (j) { return r[j] == null ? '' : String(r[j]); }));
    }
    return ven;
  }

  function csv(data, pomocne, volby) {
    var v = volby || {};
    var t = matice(data, pomocne, v.sloupce);
    var radky = t.map(function (r) { return r.map(pole).join(';'); });

    return radky.join('\r\n') + '\r\n';
  }

  function tsv(data, pomocne, volby) {
    var v = volby || {};
    var t = matice(data, pomocne, v.sloupce);
    return t.map(function (r) {
      return r.map(function (b) {
        var x = String(b == null ? '' : b).replace(/[\t\r\n]+/g, ' ');
        if (VZOREC.test(x) || (x.charAt(0) === '-' && !CISLO.test(x))) x = "'" + x;
        return x;
      }).join('\t');
    }).join('\n') + '\n';
  }

  function nahled(data, pomocne, volby) {
    var v = volby || {};
    var kolik = v.kolik || 3;
    var t = matice((data || []).slice(0, kolik), pomocne, v.sloupce);
    return { hlavicka: t[0], radky: t.slice(1), celkem: (data || []).length };
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

  function gpx(data, pomocne, volby) {
    var p = pomocne || {}, v = volby || {};
    var cas = (p.ted || new Date()).toISOString();
    if (v.max > 0) data = (data || []).slice(0, v.max);
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

  return { csv: csv, tsv: tsv, gpx: gpx, nazev: nazev, nahled: nahled,
    matice: matice, dniDo: dniDo, dniOd: dniOd,
    SLOUPCE: SLOUPCE, STRUCNE: STRUCNE, KATEGORIE: KATEGORIE };
}));
