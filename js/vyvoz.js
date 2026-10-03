/* Vývoz vyfiltrovaných nabídek do tabulky (CSV).
 *
 * PROČ. Kdo si pozemky vybírá do většího rozpočtu, stejně si je přepíše
 * do tabulky — a dosud to znamenalo opisovat je z obrazovky. Vyveze se
 * PRÁVĚ TO, CO JE NA OBRAZOVCE: tytéž nabídky, ve stejném pořadí, jaké
 * si člověk nafiltroval. Vyvézt celou databézi by byla jiná věc, a ne ta,
 * o kterou si tlačítko říká.
 *
 * ČESKÝ EXCEL. Oddělovač je STŘEDNÍK a soubor začíná značkou UTF-8 (BOM).
 * S čárkou a bez BOM otevře Excel v českém prostředí všechno v jednom
 * sloupci a diakritiku rozsype — a to je přesně ten druh „funguje to,
 * jen to nikdo nepoužije", kterému se tenhle web vyhýbá.
 *
 * CENA ZA METR Z VÝMĚRY, KTERÁ KUPUJÍCÍMU PŘIPADNE. Počítá ji js/ceny.js,
 * stejně jako mapa, stránka pozemku i porovnání. Dělit cenu celou výměrou
 * by u spoluvlastnického podílu vyrobilo číslo desetkrát nižší — a v
 * tabulce, se kterou někdo počítá, je to horší než nikde.
 */
(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.PKVyvoz = tovarna();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SLOUPCE = ['Obec', 'Okres', 'Druh', 'Kategorie', 'Výměra (m²)', 'Cena (Kč)',
    'Cena za m² (Kč)', 'Předchozí cena (Kč)', 'Změna ceny', 'Podíl', 'Termín dražby',
    'Odkaz na zdroj', 'Stránka na Parcelce'];

  var KATEGORIE = { sale: 'Na prodej', drazba: 'Dražba', exekuce: 'Exekuce',
    obec: 'Obecní záměr', majitel: 'Přímo od majitele' };

  /* Pole se uzavírá do uvozovek jen tam, kde je to nutné — jinak by se
     tabulka četla hůř i v obyčejném textovém editoru. */
  function pole(x) {
    var s = (x == null) ? '' : String(x);
    if (!/[";\n\r]/.test(s)) return s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function datum(extra) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(extra || ''));
    return m ? (+m[3] + '.' + (+m[2]) + '.' + m[1]) : '';
  }

  /* Jeden řádek z jedné nabídky. `pomocne` nese funkce, které web už má,
     ať se tu nepočítá nic podruhé: zaMetr z js/ceny.js, klic z js/klic.js. */
  function radek(d, pomocne) {
    var zaM2 = pomocne.zaMetr ? pomocne.zaMetr(d) : null;
    var klic = pomocne.klic ? pomocne.klic(d) : '';
    var stranka = klic ? (pomocne.web || '') + 'pozemek.html?p=' + encodeURIComponent(klic) : '';
    return [
      d.place || '', d.okres || '', d.druh || '', KATEGORIE[d.type] || d.type || '',
      d.area > 0 ? d.area : '',
      d.price > 0 ? d.price : '',
      (zaM2 == null || !isFinite(zaM2)) ? '' : Math.round(zaM2),
      /* Minulá cena a den změny. V tabulce, se kterou někdo počítá, je
         to užitečnější než odznak: dá se podle toho řadit a hledat
         nabídky, které leží a zlevňují. */
      d.cena_drive > 0 ? d.cena_drive : '',
      d.cena_zmena || '',
      d.podil ? (d.zlomek || 'ano') : '',
      datum(d.extra),
      d.url || '',
      stranka
    ].map(pole).join(';');
  }

  function csv(data, pomocne) {
    var p = pomocne || {};
    var radky = [SLOUPCE.map(pole).join(';')];
    for (var i = 0; i < (data || []).length; i++) radky.push(radek(data[i], p));
    /* CRLF, protože s ním si poradí i starší Excel. BOM přidává až ten,
       kdo soubor stahuje — v textu by překážel při porovnávání. */
    return radky.join('\r\n') + '\r\n';
  }

  /* Název souboru nese datum a to, co bylo nafiltrované — ve stažených
     souborech se jinak za týden nikdo nevyzná. */
  function nazev(popisFiltru, dnes) {
    var d = dnes || new Date();
    var dva = function (n) { return (n < 10 ? '0' : '') + n; };
    var cast = String(popisFiltru || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return 'parcelka-' + d.getFullYear() + '-' + dva(d.getMonth() + 1) + '-' + dva(d.getDate())
      + (cast ? '-' + cast : '') + '.csv';
  }

  return { csv: csv, nazev: nazev, SLOUPCE: SLOUPCE, KATEGORIE: KATEGORIE };
}));
