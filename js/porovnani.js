/* Uložené pozemky vedle sebe.
 *
 * PROČ. Uložit pozemek šlo odjakživa (záložka na kartě) a filtr „Uložené"
 * je uměl ukázat jako seznam. Jenže ve chvíli, kdy si člověk vybere tři
 * nebo čtyři a rozhoduje se mezi nimi, potřebuje je vidět VEDLE SEBE:
 * kde je levnější metr, kde je větší výměra, co je dřív v dražbě. Seznam
 * karet pod sebou to neřekne, protože čísla nejsou v jednom sloupci.
 *
 * Nic se neodesílá. Uložené pozemky leží v localStorage tohohle
 * prohlížeče a tahle stránka je jen přečte a spáruje s daty.
 *
 * NEJLEPŠÍ SE VYZNAČÍ, ALE JEN TAM, KDE TO DÁVÁ SMYSL. Nejnižší cena za
 * metr a největší výměra jsou objektivní; „nejlepší pozemek" neexistuje
 * a web ho tvrdit nebude. Značka je proto u hodnoty, ne u řádku.
 */
(function () {
  'use strict';
  var host = document.getElementById('porovnani');
  if (!host) return;
  var FAV_KEY = 'pk_fav_v1';

  function fmt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function ulozene() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; }
  }
  function prazdno(zprava) {
    host.innerHTML = '<div class="por-prazdno"><h2>' + esc(zprava) + '</h2>'
      + '<p>Pozemek si uložíte záložkou na jeho kartě v mapě nebo ve výpisu. '
      + 'Uložené pak uvidíte tady vedle sebe.</p>'
      + '<p><a class="btn-primary" href="index.html#mapa">Otevřít mapu</a></p></div>';
  }

  var TYPY = { sale: 'Na prodej', drazba: 'Dražba', exekuce: 'Exekuce', obec: 'Obecní záměr', majitel: 'Od majitele' };
  /* Termín dražby je v `extra` jako datum — na porovnání je to zrovna ta
     věc, která rozhoduje („tahle je za tři týdny, tahle za půl roku"). */
  function termin(d) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(d.extra || '');
    if (!m) return null;
    var t = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(t) ? null : t;
  }
  function dniDo(d) {
    var t = termin(d);
    if (!t) return null;
    var dnes = new Date(); dnes.setHours(0, 0, 0, 0);
    return Math.round((t - dnes) / 86400000);
  }

  function vykresli(nalezene, chybejicich) {
    /* CENA ZA METR SE POČÍTÁ Z VÝMĚRY, KTERÁ KUPUJÍCÍMU PŘIPADNE.
       Dělit cenou lomeno celou výměrou je u spoluvlastnického podílu
       nesmysl: v inzerátu je výměra celé parcely, cena jen za zlomek.
       A tahle tabulka navíc nejnižší cenu za metr ZELENĚ DOPORUČUJE —
       takže by jako nejvýhodnější označila podíl, který je ve skutečnosti
       nejdražší z vybraných (týž omyl, jaký kdysi dělala mapa: podíl 1/13
       lesa v Praze vyšel 75 Kč/m² místo 969). Počítá to js/ceny.js,
       stejně jako mapa i stránka pozemku; u podílu s neznámým zlomkem
       nevrací nic a do srovnání se takový pozemek nedostane. */
    var zaM2 = nalezene.map(function (d) {
      var C = window.PK_CENY;
      if (!C || !C.zaMetr) return null;
      var v = C.zaMetr(d);
      return (v == null || !isFinite(v)) ? null : v;
    });
    var platneM2 = zaM2.filter(function (x) { return x != null; });
    var nejM2 = platneM2.length ? Math.min.apply(null, platneM2) : null;
    var plochy = nalezene.map(function (d) { return d.area || null; });
    var platnePl = plochy.filter(function (x) { return x != null; });
    var nejPlocha = platnePl.length ? Math.max.apply(null, platnePl) : null;

    var hlavicka = '<tr><th scope="col">Pozemek</th><th scope="col">Cena</th>'
      + '<th scope="col">Výměra</th><th scope="col">Cena za m²</th>'
      + '<th scope="col">Druh</th><th scope="col">Kategorie</th><th scope="col">Termín</th></tr>';

    var radky = nalezene.map(function (d, i) {
      var m2 = zaM2[i];
      var dni = dniDo(d);
      var odkaz = 'pozemek.html?p=' + encodeURIComponent(window.PKKlic.pkey(d))
        + (typeof d.lat === 'number' ? '&ll=' + d.lat + ',' + d.lng : '');
      return '<tr>'
        + '<th scope="row"><a href="' + odkaz + '">' + esc(d.place || 'Pozemek') + '</a>'
          + '<span>' + esc(d.okres || '') + '</span></th>'
        + '<td>' + (d.price ? fmt(d.price) + ' Kč' : '—') + '</td>'
        + '<td' + (nejPlocha != null && d.area === nejPlocha ? ' class="por-nej"' : '') + '>'
          + (d.area ? fmt(d.area) + ' m²' : '—') + '</td>'
        + '<td' + (nejM2 != null && m2 === nejM2 ? ' class="por-nej"' : '') + '>'
          + (m2 != null ? fmt(m2) + ' Kč' : '—') + '</td>'
        + '<td>' + esc(d.druh || '—') + '</td>'
        + '<td>' + esc(TYPY[d.type] || d.type || '—') + '</td>'
        + '<td>' + (dni == null ? '—' : (dni < 0 ? 'proběhlo' : (dni === 0 ? 'dnes' : 'za ' + dni + ' dní'))) + '</td>'
        + '</tr>';
    }).join('');

    host.innerHTML =
      '<div class="por-tab-obal"><table class="por-tab"><thead>' + hlavicka + '</thead>'
      + '<tbody>' + radky + '</tbody></table></div>'
      + '<p class="por-pozn">Zeleně je <b>nejnižší cena za m²</b> a <b>největší výměra</b> z vašich uložených. '
      + 'Který pozemek je nejlepší, z tabulky nevyplývá — přístup, sítě a územní plán čísla neukážou.</p>'
      + (chybejicich
        ? '<p class="por-pozn">' + chybejicich + ' uložených pozemků už v nabídce není — zdroj je stáhl.</p>'
        : '');
  }

  var klice = ulozene();
  if (!klice.length) { prazdno('Zatím nemáte uložený žádný pozemek'); return; }

  fetch('data/opportunities.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var D = (j && j.opportunities) || [];
      var podleKlice = {};
      D.forEach(function (d) { podleKlice[window.PKKlic.pkey(d)] = d; });
      var nalezene = [];
      klice.forEach(function (k) { if (podleKlice[k]) nalezene.push(podleKlice[k]); });
      if (!nalezene.length) { prazdno('Uložené pozemky už v nabídce nejsou'); return; }
      vykresli(nalezene, klice.length - nalezene.length);
    })
    .catch(function () {
      host.innerHTML = '<p class="por-prazdno">Data se teď nepodařilo načíst. Zkuste to prosím znovu.</p>';
    });
})();
