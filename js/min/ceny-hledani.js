(function () {
  'use strict';
  var vstup = document.getElementById('cenh-vstup');
  var navrhyEl = document.getElementById('cenh-navrhy');
  var vysledekEl = document.getElementById('cenh-vysledek');
  if (!vstup || !navrhyEl || !vysledekEl) return;

  var H = window.PKHledani;
  var data = null, nacitaSe = null, vybrano = -1, seznam = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (z) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z];
    });
  }

  function cislo(n) { return Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' '); }
  function tvar(n, t) {
    n = Math.abs(n | 0);
    return n === 1 ? t[0] : (n >= 2 && n <= 4 ? t[1] : t[2]);
  }

  function nactiData() {
    if (data) return Promise.resolve(data);
    if (nacitaSe) return nacitaSe;
    nacitaSe = fetch('data/ceny-mist.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { data = j; return j; })
      .catch(function () { nacitaSe = null; return null; });
    return nacitaSe;
  }

  function proHledani(d) {
    var out = [];
    d.ok.forEach(function (o) { out.push({ place: '', okres: o.n }); });
    d.ob.forEach(function (o) { out.push({ place: o[0], okres: o[1] }); });
    return out;
  }

  function okresPodle(jmeno) {
    if (!data) return null;
    for (var i = 0; i < data.ok.length; i++) if (data.ok[i].n === jmeno) return data.ok[i];
    return null;
  }
  function pocetVObci(obec, okres) {
    if (!data) return 0;
    for (var i = 0; i < data.ob.length; i++) {
      if (data.ob[i][0] === obec && data.ob[i][1] === okres) return data.ob[i][2];
    }
    return 0;
  }

  var POradi = ['Zemědělská půda', 'Lesní pozemek', 'Zahrada', 'Stavební'];
  var NAZEV = { 'Stavební': 'Stavební pozemek' };

  function ukazVysledek(volba) {
    var ok = okresPodle(volba.okres);
    if (!ok) { vysledekEl.innerHTML = ''; return; }
    var druhy = POradi.filter(function (g) { return ok.p[g]; });
    var radky = druhy.map(function (g) {
      var c = ok.p[g];
      return '<li class="cenh-radek"><span class="cenh-druh">' + esc(NAZEV[g] || g) + '</span>'
        + '<b class="cenh-cena">' + cislo(c.med) + ' Kč/m²</b>'
        + '<span class="cenh-detail">obvykle ' + cislo(c.lo) + '–' + cislo(c.hi) + '\u00a0Kč/m²'
        + ' · z ' + cislo(c.n) + ' ' + tvar(c.n, ['nabídky', 'nabídek', 'nabídek']) + '</span></li>';
    }).join('');

    var hlava, pozn = '';
    if (volba.obec) {
      var vObci = pocetVObci(volba.obec, volba.okres);
      hlava = esc(volba.obec) + ' <span class="cenh-okres">okres ' + esc(volba.okres) + '</span>';

      pozn = 'Ceny jsou <b>za celý okres ' + esc(volba.okres) + '</b>. Pro samotnou obec '
        + esc(volba.obec) + ' je v nabídce ' + (vObci ? '<b>' + cislo(vObci) + '</b> '
          + tvar(vObci, ['pozemek', 'pozemky', 'pozemků']) : 'málo nabídek')
        + ' — na vlastní medián to nestačí.';
    } else {
      hlava = 'okres ' + esc(volba.okres);
      pozn = 'Medián nabídkových cen v okrese. Z <b>' + cislo(ok.c) + '</b> '
        + tvar(ok.c, ['nabídky', 'nabídek', 'nabídek']) + ' celkem.';
    }

    vysledekEl.innerHTML = '<div class="cenh-karta">'
      + '<h3 class="cenh-hlava">' + hlava + '</h3>'
      + (radky
        ? '<ul class="cenh-radky">' + radky + '</ul>'
        : '<p class="cenh-nic">V tomhle okrese zatím není dost nabídek na to, aby se dala spočítat cena za metr.</p>')
      + '<p class="cenh-pozn">' + pozn + '</p>'
      + '<a class="cenh-odkaz" href="' + esc(ok.h) + '">Prohlédnout nabídky v okrese ' + esc(ok.n) + ' →</a>'
      + '</div>';
  }

  function zavri() {
    navrhyEl.hidden = true;
    navrhyEl.innerHTML = '';
    navrhyEl.style.marginTop = ''; navrhyEl.style.marginBottom = '';
    navrhyEl.style.top = ''; navrhyEl.style.bottom = ''; navrhyEl.style.maxHeight = '';
    if (hlaskaEl) { hlaskaEl.hidden = true; hlaskaEl.style.top = ''; hlaskaEl.style.bottom = ''; }
    vstup.setAttribute('aria-expanded', 'false');
    vybrano = -1;
    seznam = [];
  }

  var hlaskaEl = null;
  function ukazHlasku(oprava, napsano) {
    if (!oprava) { if (hlaskaEl) hlaskaEl.hidden = true; return; }
    if (!hlaskaEl) {
      hlaskaEl = document.createElement('p');
      hlaskaEl.className = 'cenh-hlaska';
      navrhyEl.parentNode.insertBefore(hlaskaEl, navrhyEl);
    }
    hlaskaEl.innerHTML = 'Nic jako „' + esc(String(napsano).trim())
      + '". Mysleli jste <b>' + esc(oprava) + '</b>?';
    hlaskaEl.hidden = false;
  }

  function kresli(n, oprava, napsano) {
    seznam = n;
    if (!n.length) { zavri(); return; }
    navrhyEl.innerHTML = n.map(function (x, i) {
      var popis = x.typ === 'okres' ? 'okres' : 'okres ' + esc(x.okres);
      return '<li class="cenh-navrh" role="option" id="cenh-n' + i + '" aria-selected="false" data-i="' + i + '">'
        + '<span class="cenh-n-nazev">' + esc(x.text) + '</span>'
        + '<span class="cenh-n-kde">' + popis + '</span></li>';
    }).join('');
    ukazHlasku(oprava, napsano);
    navrhyEl.hidden = false;

    nadKlavesnici();
    vstup.setAttribute('aria-expanded', 'true');
  }

  function nadKlavesnici() {
    if (navrhyEl.hidden || !H || !H.nadKlavesnici) return;
    H.nadKlavesnici(navrhyEl, { pole: vstup, hlaska: hlaskaEl, strop: 320 });
  }
  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.addEventListener('resize', nadKlavesnici);
    window.visualViewport.addEventListener('scroll', nadKlavesnici);
  }

  function zvyrazni(i) {
    var polozky = navrhyEl.querySelectorAll('.cenh-navrh');
    for (var k = 0; k < polozky.length; k++) {
      polozky[k].classList.toggle('je', k === i);
      polozky[k].setAttribute('aria-selected', k === i ? 'true' : 'false');
    }
    vybrano = i;
    vstup.setAttribute('aria-activedescendant', i >= 0 ? 'cenh-n' + i : '');
  }

  function vyber(i) {
    var x = seznam[i];
    if (!x) return;
    vstup.value = x.text;
    zavri();
    ukazVysledek({ obec: x.typ === 'okres' ? null : x.text, okres: x.typ === 'okres' ? x.text : x.okres });
  }

  var cas = null;
  vstup.addEventListener('input', function () {
    clearTimeout(cas);
    var q = vstup.value;
    cas = setTimeout(function () {
      if (!H || !H.navrhy) return;
      nactiData().then(function (d) {
        if (!d) {
          vysledekEl.innerHTML = '<p class="cenh-nic">Ceny se teď nepovedlo načíst. Zkuste to za chvíli.</p>';
          return;
        }
        var zaznamy = proHledani(d);
        var n = H.navrhy(zaznamy, q, 7);

        var opravaN = null;
        if (!n.length && H.mysleliJste && H.norm && H.norm(q).length >= 2) {
          var zkus = H.mysleliJste(zaznamy, q);
          if (zkus) {
            var jine = H.navrhy(zaznamy, zkus, 7);
            if (jine.length) { opravaN = zkus; n = jine; }
          }
        }
        kresli(n, opravaN, q);

        if (!n.length && H.norm && H.norm(q).length >= 2) {

          vysledekEl.innerHTML = '<div class="cenh-karta"><p class="cenh-nic">'
            + 'Pro „' + esc(q.trim()) + '" nemáme v nabídce žádný pozemek.'
            + ' Zkuste okres — třeba Benešov nebo Kolín.'
            + '</p></div>';
        } else if (n.length) {

          vysledekEl.innerHTML = '';
        }
      });
    }, 160);
  });

  vstup.addEventListener('focus', function () { nactiData(); });

  vstup.addEventListener('keydown', function (e) {
    if (navrhyEl.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); zvyrazni(Math.min(vybrano + 1, seznam.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); zvyrazni(Math.max(vybrano - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); vyber(vybrano >= 0 ? vybrano : 0); }
    else if (e.key === 'Escape') { zavri(); }
  });
  navrhyEl.addEventListener('mousedown', function (e) {
    var li = e.target.closest ? e.target.closest('.cenh-navrh') : null;
    if (!li) return;
    e.preventDefault();
    vyber(parseInt(li.getAttribute('data-i'), 10));
  });
  document.addEventListener('click', function (e) {
    if (navrhyEl.hidden) return;
    if (navrhyEl.contains(e.target) || e.target === vstup) return;
    if (hlaskaEl && hlaskaEl.contains(e.target)) return;
    zavri();
  });
}());
