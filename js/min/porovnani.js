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

  function tabulka(nalezene) {

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

    var POZN = (window.PKPoznamky && window.PKPoznamky.vsechny) ? window.PKPoznamky.vsechny() : {};
    function poznamka(d) {
      var k = window.PKKlic.klicVe(POZN, d);
      var z = k ? POZN[k] : null;
      return (z && z.text) ? z.text : '';
    }
    var radky = nalezene.map(function (d, i) {
      var m2 = zaM2[i];
      var dni = dniDo(d);
      var odkaz = 'pozemek.html?p=' + encodeURIComponent(window.PKKlic.pkey(d))
        + (typeof d.lat === 'number' ? '&ll=' + d.lat + ',' + d.lng : '');
      return '<tr>'

        + '<th scope="row"><a href="' + odkaz + '">' + esc(d.place || 'Pozemek') + '</a>'
          + '<span>' + esc(d.okres || '') + '</span>'
          + (poznamka(d) ? '<span class="por-pozn" title="Moje poznámka">' + esc(poznamka(d)) + '</span>' : '')
          + '</th>'
        + '<td>' + (d.price ? fmt(d.price) + ' Kč' : '—') + '</td>'
        + '<td' + (nejPlocha != null && d.area === nejPlocha ? ' class="por-nej"' : '') + '>'
          + (d.area ? fmt(d.area) + ' m²' : '—') + '</td>'
        + '<td' + (nejM2 != null && m2 === nejM2 ? ' class="por-nej"' : '') + '>'
          + (m2 != null ? fmt(m2) + ' Kč' : '—') + '</td>'
        + '<td>' + esc(d.druh || '—') + '</td>'
        + '<td>' + esc(TYPY[d.type] || d.type || '—') + '</td>'
        + '<td>' + (dni == null ? '—' : (dni < 0 ? 'proběhlo' : (dni === 0 ? 'dnes' : dni === 1 ? 'zítra' : 'za ' + dni + (dni < 5 ? ' dny' : ' dní')))) + '</td>'
        + '</tr>';
    }).join('');

    return '<div class="por-tab-obal"><table class="por-tab"><thead>' + hlavicka + '</thead>'
      + '<tbody>' + radky + '</tbody></table></div>';
  }

  function vykresli(nalezene, chybejicich) {
    host.innerHTML =
      tabulka(nalezene)
      + '<p class="por-pozn">Zeleně je <b>nejnižší cena za m²</b> a <b>největší výměra</b> z vašich uložených. '
      + 'Který pozemek je nejlepší, z tabulky nevyplývá — přístup, sítě a územní plán čísla neukážou.</p>'
      + (chybejicich
        ? '<p class="por-pozn">' + chybejicich + ' uložených pozemků už v nabídce není — zdroj je stáhl.</p>'
        : '');
  }

  function ukazka(D) {
    var C = window.PK_CENY;
    if (!C || !C.zaMetr) return [];
    var skupiny = {};
    D.forEach(function (d) {
      if (!d.okres || !d.druh || !d.price || !d.area) return;
      var m = C.zaMetr(d);
      if (m == null || !isFinite(m)) return;
      var k = d.okres + '|' + d.druh;
      (skupiny[k] = skupiny[k] || []).push({ d: d, m: m });
    });

    var nej = null, nejStav = null;
    Object.keys(skupiny).sort().forEach(function (k) {
      var s = skupiny[k];
      if (s.length < 3) return;
      if (!nej || s.length > nej.length) nej = s;
      if (/stavebn/i.test(k) && (!nejStav || s.length > nejStav.length)) nejStav = s;
    });
    var vyber = nejStav || nej;
    if (!vyber) return [];
    vyber = vyber.slice().sort(function (a, b) { return a.m - b.m; });

    var kde = function (q) { return Math.min(vyber.length - 1, Math.floor(q * (vyber.length - 1))); };
    var idx = [kde(0.25), kde(0.5), kde(0.75)];

    idx = idx.filter(function (x, i) { return idx.indexOf(x) === i; });
    return idx.map(function (i) { return vyber[i].d; });
  }

  function sUkazkou(D) {
    var tri = ukazka(D);
    if (!tri.length) return;
    host.insertAdjacentHTML('beforeend',
      '<div class="por-ukazka"><h3>Takhle to vypadá</h3>'
      + '<p class="por-pozn">Tohle <b>nejsou</b> vaše uložené pozemky — jsou to tři '
      + 'skutečné nabídky ' + (tri[0].druh ? 'druhu ' + esc(tri[0].druh) + ' ' : '')
      + 'z okresu ' + esc(tri[0].okres || '') + ', aby bylo vidět, co tabulka ukazuje.</p>'
      + tabulka(tri)
      + '<p class="por-pozn">Zeleně je <b>nejnižší cena za m²</b> a <b>největší výměra</b> '
      + 'z porovnávaných. Svoje pozemky sem dostanete záložkou na jejich kartě.</p></div>');
  }

  var klice = ulozene();

  if (!klice.length) prazdno('Zatím nemáte uložený žádný pozemek');

  fetch('data/opportunities.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var D = (j && j.opportunities) || [];
      if (!klice.length) { sUkazkou(D); return; }

      var podleKlice = {};
      D.forEach(function (d) { podleKlice[window.PKKlic.pkey(d)] = d; });
      D.forEach(function (d) { podleKlice[window.PKKlic.klicPozemku(d)] = d; });
      var nalezene = [];
      klice.forEach(function (k) { if (podleKlice[k]) nalezene.push(podleKlice[k]); });
      if (!nalezene.length) { prazdno('Uložené pozemky už v nabídce nejsou'); sUkazkou(D); return; }
      vykresli(nalezene, klice.length - nalezene.length);
    })
    .catch(function () {

      if (!klice.length) return;
      host.innerHTML = '<p class="por-prazdno">Data se teď nepodařilo načíst. Zkuste to prosím znovu.</p>';
    });
})();
