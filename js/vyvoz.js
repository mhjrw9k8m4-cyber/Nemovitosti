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

  /* SLOUPCŮ JE VÍC, NEŽ CO SE DÁ OPSAT Z OBRAZOVKY. Tabulka měla
     třináct sloupců a všechny se daly přečíst z karty — takže vývoz
     byl jen rychlejší opisování. Teprve těchto šest dělá z tabulky
     pracovní list, který web sám neumí nahradit:
       · SOUŘADNICE — bez nich se seznam nedá nahrát do mapy ani
         do navigace a odkaz na stránku v tabulce k ničemu není;
       · DNÍ DO DRAŽBY — podle data se v Excelu nedá třídit, podle
         počtu dní ano, a přesně podle toho se vybírá, kam jet dřív;
       · VZDÁLENOST — kdo má uložené místo, řeší „jak daleko to mám",
         a ne zeměpisnou šířku;
       · MOJE POZNÁMKA a ULOŽENO — to jediné, co v datech není a co
         napsal člověk sám. Bez nich si ji musel do tabulky přepisovat.
     Pořadí sloupců se nemění: kdo má na starý tvar postavený vzorec,
     najde svoje sloupce tam, kde byly, a nové jsou za nimi. */
  var SLOUPCE = ['Obec', 'Okres', 'Druh', 'Kategorie', 'Výměra (m²)', 'Cena (Kč)',
    'Cena za m² (Kč)', 'Předchozí cena (Kč)', 'Změna ceny', 'Podíl', 'Termín dražby',
    'Odkaz na zdroj', 'Stránka na Parcelce',
    'Zeměpisná šířka', 'Zeměpisná délka', 'Dní do dražby', 'Vzdálenost (km)',
    'Uloženo', 'Moje poznámka'];

  var KATEGORIE = { sale: 'Na prodej', drazba: 'Dražba', exekuce: 'Exekuce',
    obec: 'Obecní záměr', majitel: 'Přímo od majitele' };

  /* Pole se uzavírá do uvozovek jen tam, kde je to nutné — jinak by se
     tabulka četla hůř i v obyčejném textovém editoru. */
  /* VZOREC V CIZÍ TABULCE. Excel, LibreOffice i Google Tabulky berou
     buňku, která začíná „=", „+" nebo „@" (a taky tabulátorem nebo CR),
     jako VZOREC, ne jako text. Stažená tabulka se otevírá na cizím
     počítači, takže text z našich dat tam nesmí být nic, co se dá
     spustit.

     ODKUD BY SE TAM VZAL: obec, okres a druh u inzerátu od majitele
     píše člověk a živé inzeráty se zveřejňují samy. Formulář i server
     u obce hlídají délku, číslice a odkaz (js/kontrola.js, obec();
     supabase/listings-prvni-kontrola.sql), ale „=SUM(…)Lhota" obsahuje
     písmena, takže projde. Branka js/cisteni.js zahazuje „<", „>"
     a uvozovku — rovnítko ne, a v HTML ho zahazovat netřeba.
     V dnešních datech taková hodnota není ani jedna (změřeno na všech
     1 988 nabídkách, polích place/okres/druh/extra/parcel/access/
     zlomek/cast/url); tohle zavírá cestu, ne nalezenou vadu.

     ČÍSLA SE NECHÁVAJÍ BÝT. „-12" je počet dnů do dražby u termínu,
     který už minul, a má se podle něj dát třídit; apostrof před ním by
     z čísla udělal text. Pomlčka se proto neutralizuje jen tam, kde za
     ní nestojí číslo. */
  var VZOREC = /^[=+@\t\r]/;
  var CISLO = /^-?\d+([.,]\d+)?$/;
  function pole(x) {
    var s = (x == null) ? '' : String(x);
    if (VZOREC.test(s) || (s.charAt(0) === '-' && !CISLO.test(s))) s = "'" + s;
    if (!/[";\n\r]/.test(s)) return s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  /* Kolik dní do dražby. Datum v tabulce je text, podle kterého se
     netřídí; počet dní je číslo, podle kterého ano. Minulé termíny
     dávají záporné číslo — ať je poznat, že už proběhly. */
  function dniDo(extra, dnes) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(extra || ''));
    if (!m) return '';
    var cil = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var d = dnes || new Date();
    var ted = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((cil - ted) / 86400000);
  }
  function kolikKm(km) {
    if (km == null || !isFinite(km)) return '';
    /* Desetinná ČÁRKA: s tečkou si český Excel myslí, že je to text,
       a nedá se podle toho třídit ani počítat. */
    return (Math.round(km * 10) / 10).toString().replace('.', ',');
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
      stranka,
      typeof d.lat === 'number' ? d.lat.toFixed(5) : '',
      typeof d.lng === 'number' ? d.lng.toFixed(5) : '',
      dniDo(d.extra),
      pomocne.kmOd ? kolikKm(pomocne.kmOd(d)) : '',
      pomocne.jeUlozeny && pomocne.jeUlozeny(d) ? 'ano' : '',
      pomocne.poznamka ? (pomocne.poznamka(d) || '') : ''
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
  function nazev(popisFiltru, dnes, pripona) {
    var d = dnes || new Date();
    var dva = function (n) { return (n < 10 ? '0' : '') + n; };
    var cast = String(popisFiltru || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return 'parcelka-' + d.getFullYear() + '-' + dva(d.getMonth() + 1) + '-' + dva(d.getDate())
      + (cast ? '-' + cast : '') + '.' + (pripona || 'csv');
  }

  /* BODY DO NAVIGACE (GPX). Tabulka je pro počítání, tohle je pro
     cestu: kdo si vybere pět pozemků, chce je mít v mapě v telefonu
     a objet je — a dosud si musel souřadnice přeťukávat po jednom.
     GPX čte Mapy.cz, Locus, Garmin i Organic Maps; je to prostý XML,
     takže si na něj web nebere žádnou knihovnu.
     V názvu bodu stojí obec a cena, v popisu zbytek — v navigaci je
     vidět jen název, takže to podstatné musí být v něm. */
  function xml(x) {
    return String(x == null ? '' : x)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function gpx(data, pomocne) {
    var p = pomocne || {};
    var cas = (p.ted || new Date()).toISOString();
    var kusy = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Parcelka" xmlns="http://www.topografix.com/GPX/1/1">',
      '<metadata><name>Parcelka — vybrané pozemky</name><time>' + cas + '</time></metadata>'];
    for (var i = 0; i < (data || []).length; i++) {
      var d = data[i];
      if (typeof d.lat !== 'number' || typeof d.lng !== 'number') continue;
      var zaM2 = p.zaMetr ? p.zaMetr(d) : null;
      var jmeno = (d.place || 'Pozemek')
        + (d.price > 0 ? ' · ' + Math.round(d.price).toLocaleString('cs-CZ') + ' Kč' : '');
      var popis = [
        KATEGORIE[d.type] || d.type || '',
        d.druh || '',
        d.area > 0 ? d.area + ' m²' : '',
        (zaM2 != null && isFinite(zaM2)) ? Math.round(zaM2) + ' Kč/m²' : '',
        d.podil ? ('podíl ' + (d.zlomek || '')) : '',
        datum(d.extra) ? ('dražba ' + datum(d.extra)) : '',
        p.poznamka && p.poznamka(d) ? ('poznámka: ' + p.poznamka(d)) : '',
        d.url || ''
      ].filter(Boolean).join(' · ');
      kusy.push('<wpt lat="' + d.lat.toFixed(6) + '" lon="' + d.lng.toFixed(6) + '">'
        + '<name>' + xml(jmeno) + '</name>'
        + '<desc>' + xml(popis) + '</desc>'
        + (d.url ? '<link href="' + xml(d.url) + '"></link>' : '')
        + '</wpt>');
    }
    kusy.push('</gpx>');
    return kusy.join('\n') + '\n';
  }

  return { csv: csv, gpx: gpx, nazev: nazev, dniDo: dniDo,
    SLOUPCE: SLOUPCE, KATEGORIE: KATEGORIE };
}));
