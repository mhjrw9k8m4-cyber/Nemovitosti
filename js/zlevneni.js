/* Změna ceny proti minulému běhu — jedna věta pro celý web.
 *
 * Data nese robot (scripts/fetch-opportunities.mjs): `cena_drive` je
 * cena z minulého běhu a `cena_zmena` den, kdy se změnila. Tady se z toho
 * dělá text, a to na JEDNOM místě, protože ho potřebuje karta na mapě,
 * stránka pozemku i tabulka ke stažení — tři kopie téhle úvahy by se
 * dřív nebo později rozešly, jak se to na tomhle webu už stalo u ceny
 * za metr.
 *
 * DVĚ VĚCI, KTERÉ SE TU NEŘÍKAJÍ:
 *
 * 1. Drobná změna není zpráva. Posun o pár set korun bývá zaokrouhlení
 *    nebo přepis u zdroje; pod MEZ_PROCENT se mlčí, ať odznak něco
 *    znamená.
 * 2. Zdražení se neschovává. Kdyby se hlásilo jen zlevnění, web by
 *    o pohybu nahoru mlčel a vypadalo by to, že cena stojí — nepravda
 *    ve prospěch prodeje.
 */
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

  /* „Zlevněno o 25 %" — krátce, protože na kartě je místo na jeden
     řádek. Kolik to bylo předtím, patří do popisku (title), odkud si to
     vezme i odečítač obrazovky. */
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
