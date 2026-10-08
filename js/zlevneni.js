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
  /* A DRUHÁ MEZ, SHORA. Pod MEZ_PROCENT je změna šum; nad touhle mezí
     je to skoro vždycky chyba na straně zdroje, ne sleva. V archivu
     je ze 139 změn ceny jediná nad 50 % dolů (125 000 → 9 000 Kč
     v Kvíčovicích) a jediná nad 50 % nahoru (97 000 → 164 775
     v Měníně) — u pozemku takový skok za pár dnů neexistuje, to je
     přepsaná nebo špatně načtená cena. Číslo se NESCHOVÁVÁ, ale
     neříká se o něm „zlevněno": kdo si k takové nabídce zajede,
     dozví se u ní jinou cenu, a web ho tam poslal. */
  var MEZ_PODEZRELA = 50;

  function zmena(d) {
    if (!d) return null;
    var drive = +d.cena_drive, ted = +d.price;
    if (!(drive > 0) || !(ted > 0) || drive === ted) return null;
    return krok(drive, ted, d.cena_zmena || '');
  }

  /* Dvě ceny a den → tentýž údaj, ať přijde z posledního běhu robota
     (zmena) nebo z archivu (scripts/cenova-historie.mjs). Jedno
     pravidlo na jednom místě: dvě kopie by se rozešly a web by o téže
     ceně na kartě a v historii tvrdil dvě různé věci. */
  function krok(drive, ted, kdy) {
    if (!(drive > 0) || !(ted > 0) || drive === ted) return null;
    var pct = Math.round(Math.abs(ted - drive) / drive * 100);
    if (pct < MEZ_PROCENT) return null;
    return { dolu: ted < drive, procent: pct, drive: drive, ted: ted,
      kdy: kdy || '', podezrela: pct >= MEZ_PODEZRELA };
  }

  /* „Zlevněno o 25 %" — krátce, protože na kartě je místo na jeden
     řádek. Kolik to bylo předtím, patří do popisku (title), odkud si to
     vezme i odečítač obrazovky. */
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
