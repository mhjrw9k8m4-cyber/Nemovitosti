/* Klíč pozemku — jeden výpočet pro celý web.
 *
 * PROČ ZVLÁŠŤ. Tentýž řetězec se počítal na třech místech: js/main.js
 * (pkey), js/pozemek.js (pkeyPlny) a scripts/generate-parcel-pages.mjs
 * (pkey). Tři kopie téhož výpočtu se dřív nebo později rozejdou — na
 * tomhle webu se to u cen a u rádce už stalo a stojí to v komentářích
 * na obou místech. Čtvrtá kopie měla přibýt se stránkou porovnání;
 * místo toho jsou teď v prohlížeči kopie nula.
 *
 * Generátor v Node si svou kopii nechává (modul pro prohlížeč by si
 * nenaimportoval) — že se obě shodují, hlídá scripts/test-stranky-pozemku.mjs:
 * kdyby se rozešly, vedly by odkazy na neexistující soubory.
 *
 * CO TEN KLÍČ JE. Místo, parcela, okres a souřadnice na tři desetinná
 * místa. Souřadnice tam musí být: parcelní číslo zná jen menšina záznamů
 * (u zbytku je „—"), takže bez nich sedl jeden klíč na víc pozemků naráz
 * — pod „Brno|—|Brno-město" jich bylo patnáct a uložení jednoho označilo
 * všechny sourozence. Tři desetinná místa jsou zhruba sto metrů, což
 * snese i drobné zpřesnění geokódování mezi běhy robota.
 */
(function (root) {
  'use strict';
  function pkey(d) {
    if (!d) return '';
    /* Spočítá se jednou za záznam a schová se k němu. Naměřeno na úvodní
       stránce: 63 258 volání při jediném načtení (31 na jednu nabídku),
       z toho 257 ms procesoru — nejdražší funkce stránky. Záznam je
       neměnný, takže druhé volání už jen čte. Vlastnost je neviditelná
       pro Object.keys i JSON.stringify, aby se nepřimíchala do dat. */
    if (d.__pk) return d.__pk;
    var la = (typeof d.lat === 'number') ? d.lat.toFixed(3) : '';
    var ln = (typeof d.lng === 'number') ? d.lng.toFixed(3) : '';
    var k = [d.place || '', d.parcel || '', d.okres || '', la, ln].join('|');
    if (typeof d === 'object') {
      try { Object.defineProperty(d, '__pk', { value: k, enumerable: false, configurable: true }); }
      catch (e) {}
    }
    return k;
  }
  /* Starý tvar klíče — jen pro odkazy rozeslané dřív, ať neskončí naprázdno. */
  function pkeyLegacy(d) {
    return [(d && d.place) || '', (d && d.parcel) || '', (d && d.okres) || ''].join('|');
  }
  root.PKKlic = { pkey: pkey, pkeyLegacy: pkeyLegacy };
}(typeof window !== 'undefined' ? window : this));
