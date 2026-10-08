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
  /* A DRUHÁ MEZ, SHORA — a POZOR, JAK VZNIKLA. Zavedl jsem ji na dvou
     případech, o kterých jsem tvrdil, že jsou chyba zdroje: 125 000 →
     9 000 Kč v Kvíčovicích a 97 000 → 164 775 v Měníně. Při hlubším
     měření se ukázalo, že první z nich byla chyba MOJE: archiv měl
     hrubý klíč a slepil dva různé pozemky do jedné nabídky (viz
     PKKlic.klicArchivu). Po opravě je ten pokles 13 500 → 9 000 Kč,
     tedy 33 %, a nad 50 % dolů není ze 139 změn ani jedna.
     Druhý případ je PRAVÝ: týž inzerát (2 197 m²) přešel z 97 000 na
     164 775 Kč, což je přesně 75 Kč/m² — prodávající si cenu opravil.
     Mez tedy zůstává jako POJISTKA, ne jako popis naměřeného jevu:
     u pozemku je skok o polovinu za pár dnů natolik nezvyklý, že se
     o něm nemá říkat „zlevněno" bez vybídnutí k ověření. Číslo se
     neschovává, jen se u něj nestojí, že je to příležitost. */
  var MEZ_PODEZRELA = 50;

  function zmena(d) {
    if (!d) return null;
    var ted = +d.price;
    var drive = +d.cena_drive;
    if (drive > 0 && ted > 0) return krok(drive, ted, d.cena_zmena || '');
    /* A KDYŽ POSLEDNÍ BĚH NIC NEVÍ, ZKUSÍ SE ARCHIV. `cena_drive` drží
       jen změnu z posledního průchodu zdrojů a při každém dalším se
       přepíše — má ji 21 nabídek z 2 004, kdežto archiv zná 129.
       Historii dosazuje stránka z data/zlevneni.json jako pole dvojic
       [den, cena] odpředu (viz scripts/generate-zlevneni.mjs).

       POJISTKA: poslední cena v historii se MUSÍ rovnat té dnešní.
       Když robot projde zdroje po archivu, cena se mezitím mohla
       změnit — a tvrdit „zlevněno z A na B", kde B už neplatí, je
       horší než mlčet. */
    var h = d.h;
    if (h && h.length > 1 && ted > 0) {
      var i = h.length - 1;
      if (+h[i][1] !== ted) return null;
      return krok(+h[i - 1][1], +h[i][1], h[i][0]);
    }
    return null;
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
