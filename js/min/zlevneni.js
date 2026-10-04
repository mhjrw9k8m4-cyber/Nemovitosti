(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.PKZlevneni = tovarna();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MEZ_PROCENT = 3;

  function zmena(d) {
    if (!d) return null;
    var drive = +d.cena_drive, ted = +d.price;
    if (!(drive > 0) || !(ted > 0) || drive === ted) return null;
    var pct = Math.round(Math.abs(ted - drive) / drive * 100);
    if (pct < MEZ_PROCENT) return null;
    return { dolu: ted < drive, procent: pct, drive: drive, ted: ted, kdy: d.cena_zmena || '' };
  }

  function text(z) { return z ? ((z.dolu ? 'Zlevněno o ' : 'Zdraženo o ') + z.procent + ' %') : ''; }

  function popis(z, fmt) {
    if (!z) return '';
    var f = fmt || function (n) { return String(n); };
    return (z.dolu ? 'Předtím ' : 'Původně ') + f(z.drive) + ' Kč'
      + (z.kdy ? ', změněno ' + lidsky(z.kdy) : '') + '.';
  }

  function lidsky(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? (+m[3] + '. ' + (+m[2]) + '. ' + m[1]) : String(iso || '');
  }

  return { zmena: zmena, text: text, popis: popis, lidsky: lidsky, MEZ_PROCENT: MEZ_PROCENT };
}));
