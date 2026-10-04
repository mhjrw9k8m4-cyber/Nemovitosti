/* „Tenhle pozemek už jsem otevřel."
 *
 * PROČ TO VZNIKLO. Výpis má přes dva tisíce nabídek a lidé se k němu
 * vracejí: hlídání pošle upozornění, člověk proroluje stejný seznam
 * a znovu otevírá, co už jednou viděl. Bez značky se to nedá poznat —
 * karty vypadají při každé návštěvě stejně.
 *
 * CO TO NENÍ. Není to „prodáno" ani „nezajímavé". Proto je značka
 * potlačená, karta se nestmavuje a nijak se nepřeskupuje pořadí: kdo si
 * pozemek otevřel dvakrát, mohl ho mít rád. Má to jen ušetřit druhé
 * klepnutí, ne radit.
 *
 * KDE SE TO BERE. Zapisuje stránka pozemku při vykreslení detailu —
 * tedy ve chvíli, kdy se ten pozemek OPRAVDU otevřel, ne při přejetí
 * myší po kartě.
 *
 * MEZ A STÁŘÍ. Seznam se drží na 600 posledních a zapomíná po 180 dnech.
 * Bez meze by rostl donekonečna; localStorage má kolem 5 MB na celý web
 * a sdílí se se vším ostatním, co si web pamatuje. Zapomínání je tu
 * schválně: po půl roce je „už jsem to viděl" spíš matoucí než užitečné,
 * protože se mezitím změnila cena i nabídka.
 */
(function (root) {
  'use strict';
  var KLIC = 'pk_otevrene_v1';
  var STROP = 600;
  var DNI = 180;
  var DEN = 86400000;

  function cti() {
    try {
      var z = JSON.parse(localStorage.getItem(KLIC) || '{}');
      return (z && typeof z === 'object' && !Array.isArray(z)) ? z : {};
    } catch (e) { return {}; }
  }
  function zapis(m) {
    try { localStorage.setItem(KLIC, JSON.stringify(m)); } catch (e) { /* plná schránka: nevadí */ }
  }
  /* Vyhodí staré a nechá jen posledních STROP. Zapomíná se podle ČASU
     OTEVŘENÍ, ne podle pořadí v objektu — pořadí klíčů v JSON není nic,
     na co by se dalo spolehnout. */
  function uklid(m) {
    var ted = Date.now();
    var dvojice = [];
    for (var k in m) {
      if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
      var t = +m[k];
      if (!isFinite(t) || ted - t > DNI * DEN) continue;
      dvojice.push([k, t]);
    }
    if (dvojice.length <= STROP) {
      var out = {};
      dvojice.forEach(function (p) { out[p[0]] = p[1]; });
      return out;
    }
    dvojice.sort(function (a, b) { return b[1] - a[1]; });
    var o2 = {};
    dvojice.slice(0, STROP).forEach(function (p) { o2[p[0]] = p[1]; });
    return o2;
  }

  function klicPozemku(d) {
    if (!d) return '';
    if (root.PKKlic && root.PKKlic.pkey) { try { return root.PKKlic.pkey(d); } catch (e) {} }
    return '';
  }

  /** Zapíše, že se pozemek otevřel. Vrací klíč, nebo prázdný řetězec. */
  function oznac(d) {
    var k = klicPozemku(d);
    if (!k) return '';
    var m = cti();
    m[k] = Date.now();
    zapis(uklid(m));
    return k;
  }
  /** Byl už otevřený? */
  function je(d) {
    var k = klicPozemku(d);
    return !!(k && cti()[k]);
  }
  /** Celá množina klíčů — pro výpis, ať se nečte schránka u každé karty. */
  function mnozina() {
    var m = cti(), s = {};
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) s[k] = 1;
    return s;
  }
  function zapomen() { try { localStorage.removeItem(KLIC); } catch (e) {} }
  function kolik() { return Object.keys(cti()).length; }

  root.PKVideno = { oznac: oznac, je: je, mnozina: mnozina, zapomen: zapomen,
    kolik: kolik, KLIC: KLIC, STROP: STROP, DNI: DNI };
}(typeof window !== 'undefined' ? window : globalThis));
