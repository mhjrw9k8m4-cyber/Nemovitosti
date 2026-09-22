/* Výběr rozsahu ceny a výměry: od pilulek k posuvníku s histogramem.
 *
 * Co tu bylo a proč to nestačilo:
 *   · Nejdřív pět pásem ceny a čtyři na výměru. Málo — kdo hledá pozemek
 *     do tří set tisíc, dostal na výběr „do 150 tis." nebo „150–500 tis."
 *     a ani jedno mu nesedělo.
 *   · Pak osm a osm i s počty. Výběr sice byl, ale šestnáct pilulek ve
 *     čtyřech řadách je na telefonu zeď, kterou je potřeba přerolovat —
 *     a pořád to byla jen hrstka předem vybraných možností.
 *
 * Posuvník řeší obojí najednou: zabere dva řádky místo osmi a nabídne
 * libovolný rozsah, ne osm hotových.
 *
 * Dvě věci, na kterých to stojí:
 *
 * 1. STUPNICE NENÍ ROVNOMĚRNÁ. Ceny jdou od pár tisíc po desítky milionů.
 *    Kdyby byl posuvník lineární, ležela by polovina nabídky na prvním
 *    procentu dráhy a táhlo by se muselo trefovat na pixel. Zarážky se
 *    proto berou z KVANTILŮ skutečných dat — každý krok posune o zhruba
 *    stejný počet nabídek, ne o stejný počet korun. Čísla se pak zaokrouhlí
 *    na „hezká" (1, 2, 5 × mocnina deseti), aby v popisku nestálo
 *    „do 317 428 Kč".
 *
 * 2. HISTOGRAM UKAZUJE, KDE NABÍDKY JSOU. Bez něj je posuvník hádání:
 *    člověk netuší, jestli si nastavením odřízl polovinu nabídky, nebo nic.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKRozsah = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cislo(x) { return typeof x === 'number' && isFinite(x) && x > 0; }

  /* Zaokrouhlení na „hezké" číslo. Řada je hustší než obvyklá 1–2–5:
     s ní se sousední kvantily slévaly a z osmnácti zarážek zbylo deset.
     Nahoru, aby zarážka vždycky obsáhla to, co pod ni patří. */
  var MANTISY = [1, 1.5, 2, 3, 5, 7, 10];
  function hezke(x) {
    if (!cislo(x)) return 0;
    var rad = Math.pow(10, Math.floor(Math.log(x) / Math.LN10));
    var d = x / rad;
    for (var i = 0; i < MANTISY.length; i++) if (d <= MANTISY[i] + 1e-9) return MANTISY[i] * rad;
    return 10 * rad;
  }

  /* Zarážky posuvníku. Poslední je vždycky „a výš" (bez horní meze) —
     jinak by se nejdražší pozemky nedaly vybrat vůbec. */
  function zarazky(hodnoty, pocet) {
    var v = [];
    for (var i = 0; i < (hodnoty || []).length; i++) if (cislo(hodnoty[i])) v.push(hodnoty[i]);
    if (v.length < 2) return [0, Infinity];
    v.sort(function (a, b) { return a - b; });
    var n = Math.max(4, pocet || 18);
    var ven = [0];
    for (var k = 1; k < n; k++) {
      var q = v[Math.min(v.length - 1, Math.floor(k / n * v.length))];
      var h = hezke(q);
      if (h > ven[ven.length - 1]) ven.push(h);
    }
    /* Horní zarážka se bere z 97. percentilu, ne z maxima. Jediný pozemek
       za tři sta milionů by jinak roztáhl poslední krok přes celou horní
       polovinu stupnice a byly by tam dvě prázdné zarážky za sebou —
       táhlo by se v tom úseku nedalo na nic trefit. Co je nad ní, spadne
       do poslední přihrádky „a výš", která tím pádem není prázdná. */
    var strop = hezke(v[Math.min(v.length - 1, Math.floor(0.97 * v.length))]);
    if (strop > ven[ven.length - 1]) ven.push(strop);
    ven.push(Infinity);
    return ven;
  }

  /* Kolik nabídek padne mezi sousední zarážky. Poslední přihrádka je
     „od předposlední zarážky výš". */
  function histogram(hodnoty, zar) {
    var ven = [];
    var i;
    for (i = 0; i < zar.length - 1; i++) ven.push(0);
    for (i = 0; i < (hodnoty || []).length; i++) {
      var x = hodnoty[i];
      if (!cislo(x)) continue;
      for (var k = zar.length - 2; k >= 0; k--) {
        if (x >= zar[k]) { ven[k]++; break; }
      }
    }
    return ven;
  }

  /* Nejbližší zarážka k zadané hodnotě — když člověk napíše číslo ručně,
     musí se táhlo postavit tam, kam patří. */
  function index(zar, hodnota) {
    if (hodnota == null || hodnota === '' || !isFinite(hodnota)) return -1;
    var nej = 0, rozdil = Infinity;
    for (var i = 0; i < zar.length; i++) {
      var z = zar[i];
      if (!isFinite(z)) continue;
      var d = Math.abs(z - hodnota);
      if (d < rozdil) { rozdil = d; nej = i; }
    }
    return nej;
  }

  /* Popisek zarážky. „∞" se nepíše — lidé čtou „a výš". */
  function popis(hodnota, jednotka) {
    if (!isFinite(hodnota)) return null;
    if (jednotka === 'm2') {
      if (hodnota >= 10000) {
        var ha = hodnota / 10000;
        return (ha % 1 === 0 ? ha : ha.toFixed(1).replace('.', ',')) + ' ha';
      }
      return String(hodnota).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' m²';
    }
    if (hodnota >= 1000000) {
      var mil = hodnota / 1000000;
      return (mil % 1 === 0 ? mil : mil.toFixed(1).replace('.', ',')) + ' mil.';
    }
    if (hodnota >= 1000) return Math.round(hodnota / 1000) + ' tis.';
    return String(hodnota);
  }

  return { hezke: hezke, zarazky: zarazky, histogram: histogram, index: index, popis: popis };
});
