/* Termíny dražeb — jedno místo pro celý web.
 *
 * Tyhle tři funkce byly doslovně dvakrát: v js/main.js (mapa a seznam)
 * a v js/pozemek.js (stránka pozemku). Přesně tak se tady už jednou
 * rozešel cenový verdikt — dokud jsou dvě kopie, dřív nebo později jedna
 * z nich zůstane pozadu a web začne o téže dražbě tvrdit dvě různé věci.
 *
 * Přibyl sem i zdrojText(): pole „extra" nese syrový zápis z evidence
 * („dražba 2026-10-12") a ten se dostal až na stránku pozemku do řádku
 * „Stav / zdroj". Datum ve tvaru pro stroje mezi větami v češtině vypadá
 * jako nedodělek — a hlavně ho na první pohled nikdo nepřečte.
 */
(function (root) {
  'use strict';

  /** Kolik dní zbývá do termínu v „extra". Záporně = už proběhlo. */
  function daysUntil(extra) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(extra || '');
    if (!m) return null;
    var target = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(target)) return null;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((target - now) / 86400000);
  }

  /** Lidsky: „zítra", „za týden", „za 2 měs." */
  function countdownText(days) {
    if (days < 0) return 'proběhlo';
    if (days === 0) return 'dnes';
    if (days === 1) return 'zítra';
    if (days <= 6) return 'za ' + days + (days <= 4 ? ' dny' : ' dní');
    if (days <= 13) return 'za týden';
    if (days <= 27) return 'za ' + Math.round(days / 7) + ' týdny';
    return 'za ' + Math.round(days / 30) + ' měs.';
  }

  /** Naléhavost pro barvu odznaku. */
  function countdownClass(days) {
    if (days == null || days < 0) return '';
    if (days <= 7) return ' urg';
    if (days <= 30) return ' soon';
    return '';
  }

  /** Termín jako YYYYMMDD — pro událost v kalendáři (.ics). */
  function auctionYMD(extra) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(extra || '');
    return m ? m[1] + m[2] + m[3] : null;
  }

  /** Popis zdroje pro čtení: datum se přepíše do českého tvaru. */
  function zdrojText(extra) {
    return String(extra == null ? '' : extra)
      .replace(/(\d{4})-(\d{2})-(\d{2})/g, function (_, r, m, d) {
        return (+d) + '. ' + (+m) + '. ' + r;
      });
  }

  root.PK_TERMINY = {
    daysUntil: daysUntil,
    countdownText: countdownText,
    countdownClass: countdownClass,
    auctionYMD: auctionYMD,
    zdrojText: zdrojText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
