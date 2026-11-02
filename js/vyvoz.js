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
    'Uloženo', 'Moje poznámka',
    /* SEDM PŘIBYLO 2. 11. Tabulka nenesla věci, které web sám má a sám
       podle nich filtruje — zjištěno projitím polí ve datech proti
       seznamu sloupců:
         · PARCELNÍ ČÍSLO (v datech u 100 % nabídek) chybělo úplně.
           Bez něj se pozemek v katastru nedohledá, takže tabulka
           pozemků bez něj je k ověřování nepoužitelná. Ze všech
           chybějících sloupců nejhorší.
         · SÍTĚ A CESTA (63 %) — podle nich se ve výpisu filtruje
           („Musí mít: elektřina, voda"), ale do tabulky nešly, takže
           si člověk nafiltroval pozemky se sítěmi a v souboru už
           nepoznal, které to jsou.
         · V NABÍDCE OD a DNÍ V NABÍDCE (100 %) — „jak dlouho to leží"
           je důvod, proč se o něčem dá smlouvat. Web to řadí
           („nejnovější"), tabulka to neuměla ani ukázat.
         · NABÍDEK OD TÉHOŽ INZERENTA (85 %) — pole `inz` je ANONYMNÍ
           OTISK, ne jméno; sloupec s hodnotou „f352a7" by nikomu nic
           neřekl. Užitečná je ta informace v počtu: jeden otisk má
           dnes 907 nabídek z 1 918, tedy velkoobchodník, a u jeho cen
           se má člověk mít na pozoru. Přesně proto to pole na webu
           vzniklo (cenový verdikt podle něj váží referenci).
         · VÝMĚRA PODÍLU (21 %) — u podílu se z ní počítá cena za metr,
           ale sama v tabulce nebyla, takže to číslo nešlo ověřit.
         · ČÁST OBCE (5 %) — u velkých obcí rozhoduje o poloze.
       Stojí na konci schválně: pořadí prvních devatenácti se nemění,
       aby vzorce postavené na starém tvaru dál seděly. */
    'Parcelní číslo', 'Část obce', 'Výměra podílu (m²)', 'Sítě a cesta',
    'Nabídek od téhož inzerenta', 'V nabídce od', 'Dní v nabídce'];

  /* STRUČNÁ SADA. S dvaceti šesti sloupci se tabulka na obrazovku
     nevejde a kdo chce jen přehled „co kde za kolik", listuje se
     doprava přes souřadnice a poznámky. Tohle je devět sloupců
     v pořadí, ve kterém se čtou — vlastní pořadí má proto, že
     parcelní číslo patří k obci, a ne na dvacáté místo, kam ho
     v plné sadě posadil slib o neměnném pořadí. */
  var STRUCNE = ['Obec', 'Část obce', 'Parcelní číslo', 'Druh', 'Výměra (m²)',
    'Cena (Kč)', 'Cena za m² (Kč)', 'Termín dražby', 'Odkaz na zdroj'];

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

  /* Kolik dní nabídka leží. Datum v tabulce je text; podle počtu dní
     se dá třídit a je to to, co kupujícího zajímá — co leží dlouho,
     u toho se dá smlouvat. */
  function dniOd(iso, dnes) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var od = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var d = dnes || new Date();
    var ted = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.max(0, Math.round((ted - od) / 86400000));
  }
  function denCesky(iso) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
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
      pomocne.poznamka ? (pomocne.poznamka(d) || '') : '',
      /* POMLČKA NENÍ ČÍSLO. Robot u nabídek bez parcelního čísla
         ukládá „—" (dnes 1 665 z 1 918). V tabulce je to smetí, které
         musí člověk vyházet, než podle sloupce něco udělá; prázdná
         buňka říká totéž a dá se filtrovat. */
      /^[\s—–-]*$/.test(String(d.parcel || '')) ? '' : d.parcel,
      d.cast || '',
      d.vymera_podilu > 0 ? d.vymera_podilu : '',
      /* Názvy sítí si modul nevymýšlí — bere je z js/vybaveni.js, kde
         jsou jednou pro celý web. Kdyby se sem opsaly, rozešly by se
         s odznaky na kartě při první změně. Bez té funkce se vypíšou
         holé klíče: nepěkné, ale pravdivé. */
      (d.site && d.site.length)
        ? d.site.map(function (k) {
            return (pomocne.nazevSite && pomocne.nazevSite(k)) || k;
          }).join(', ')
        : '',
      (pomocne.odTehozInz && d.inz) ? (pomocne.odTehozInz(d) || '') : '',
      denCesky(d.first_seen),
      dniOd(d.first_seen, pomocne.ted)
    ];
  }

  /* Vybrané sloupce v zadaném pořadí. Jména se hledají v SLOUPCE, takže
     překlep v sadě nevyrobí tichý prázdný sloupec, ale výjimku při
     sestavení — a ta spadne ve zkoušce, ne u člověka v Excelu. */
  function indexy(nazvy) {
    return (nazvy || SLOUPCE).map(function (n) {
      var i = SLOUPCE.indexOf(n);
      if (i < 0) throw new Error('Neznámý sloupec: ' + n);
      return i;
    });
  }

  /* Tabulka jako pole polí — z ní se pak vyrobí CSV, text do schránky
     i náhled v okně. Dřív se řádek skládal rovnou na řetězec se
     středníky, takže náhled by musel ten řetězec zase rozebírat zpátky
     (a rozbil by se na každé buňce, kde středník je). */
  function matice(data, pomocne, nazvy) {
    var p = pomocne || {}, ix = indexy(nazvy), ven = [];
    var hlavicka = ix.map(function (i) { return SLOUPCE[i]; });
    ven.push(hlavicka);
    for (var i = 0; i < (data || []).length; i++) {
      var r = radek(data[i], p);
      ven.push(ix.map(function (j) { return r[j] == null ? '' : String(r[j]); }));
    }
    return ven;
  }

  function csv(data, pomocne, volby) {
    var v = volby || {};
    var t = matice(data, pomocne, v.sloupce);
    var radky = t.map(function (r) { return r.map(pole).join(';'); });
    /* CRLF, protože s ním si poradí i starší Excel. BOM přidává až ten,
       kdo soubor stahuje — v textu by překážel při porovnávání. */
    return radky.join('\r\n') + '\r\n';
  }

  /* DO SCHRÁNKY, NE DO SOUBORU. Na telefonu je stažené CSV skoro
     k ničemu: iOS ho uloží do Souborů a otevřít ho není čím. Zato
     vložení do Tabulek Google nebo do Excelu funguje všude — a tabulky
     vkládané ze schránky čekají TABULÁTOR, ne středník.
     Buňky se proto nesmějí uzavírat do uvozovek jako v CSV; místo toho
     se z nich tabulátor a konec řádku vyhazují, protože by rozbily
     mřížku. Taky tu není BOM: schránka nese text, ne soubor. */
  function tsv(data, pomocne, volby) {
    var v = volby || {};
    var t = matice(data, pomocne, v.sloupce);
    return t.map(function (r) {
      return r.map(function (b) {
        var x = String(b == null ? '' : b).replace(/[\t\r\n]+/g, ' ');
        if (VZOREC.test(x) || (x.charAt(0) === '-' && !CISLO.test(x))) x = "'" + x;
        return x;
      }).join('\t');
    }).join('\n') + '\n';
  }

  /* Prvních pár řádků pro náhled v okně. Vrací hlavičku zvlášť, ať se
     dá vysázet jako <th>. `celkem` je počet VŠECH řádků, ne jen
     ukázaných — okno pod tabulkou píše, kolik jich ještě bude. */
  function nahled(data, pomocne, volby) {
    var v = volby || {};
    var kolik = v.kolik || 3;
    var t = matice((data || []).slice(0, kolik), pomocne, v.sloupce);
    return { hlavicka: t[0], radky: t.slice(1), celkem: (data || []).length };
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
  /* STROP NA POČET BODŮ. Změřeno na dnešních datech: celý výpis dá
     1 918 bodů a soubor 591 kB. To už není trasa, to je celá databáze
     — navigace z toho udělá jeden slepenec špendlíků, ve kterém se nic
     nenajde, a část aplikací takový soubor rovnou odmítne. Okno proto
     nabízí, kolik jich vzít; bere se od začátku, tedy podle řazení,
     které si člověk nastavil ve výpisu. Bez `max` se nekrátí nic —
     modul sám nic nezakazuje, jen to umí. */
  function gpx(data, pomocne, volby) {
    var p = pomocne || {}, v = volby || {};
    var cas = (p.ted || new Date()).toISOString();
    if (v.max > 0) data = (data || []).slice(0, v.max);
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

  return { csv: csv, tsv: tsv, gpx: gpx, nazev: nazev, nahled: nahled,
    matice: matice, dniDo: dniDo, dniOd: dniOd,
    SLOUPCE: SLOUPCE, STRUCNE: STRUCNE, KATEGORIE: KATEGORIE };
}));
