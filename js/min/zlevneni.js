(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.PKZlevneni = tovarna();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MEZ_PROCENT = 3;

  var MEZ_PODEZRELA = 50;

  function zmena(d) {
    if (!d) return null;
    var ted = +d.price;
    var drive = +d.cena_drive;
    if (drive > 0 && ted > 0) return krok(drive, ted, d.cena_zmena || '');

    var h = d.h;
    if (h && h.length > 1 && ted > 0) {
      var i = h.length - 1;
      if (+h[i][1] !== ted) return null;
      return krok(+h[i - 1][1], +h[i][1], h[i][0]);
    }
    return null;
  }

  function krok(drive, ted, kdy) {
    if (!(drive > 0) || !(ted > 0) || drive === ted) return null;
    var pct = Math.round(Math.abs(ted - drive) / drive * 100);
    if (pct < MEZ_PROCENT) return null;
    return { dolu: ted < drive, procent: pct, drive: drive, ted: ted,
      kdy: kdy || '', podezrela: pct >= MEZ_PODEZRELA };
  }

  function text(z) {
    if (!z) return '';
    if (z.podezrela) return 'Cena se změnila o ' + z.procent + ' % — ověřit';
    return (z.dolu ? 'Zlevněno o ' : 'Zdraženo o ') + z.procent + ' %';
  }

  function popis(z, fmt) {
    if (!z) return '';
    var f = fmt || function (n) { return String(n); };
    return (z.podezrela ? 'U zdroje bylo ' : (z.dolu ? 'Předtím ' : 'Původně ')) + f(z.drive) + ' Kč'
      + (z.kdy ? ', změněno ' + lidsky(z.kdy) : '') + '.'
      + (z.podezrela ? ' Takový skok u pozemku bývá chyba zdroje — ověřte cenu v inzerátu.' : '');
  }

  function lidsky(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? (+m[3] + '. ' + (+m[2]) + '. ' + m[1]) : String(iso || '');
  }

  return { zmena: zmena, krok: krok, text: text, popis: popis, lidsky: lidsky,
    MEZ_PROCENT: MEZ_PROCENT, MEZ_PODEZRELA: MEZ_PODEZRELA };
}));
