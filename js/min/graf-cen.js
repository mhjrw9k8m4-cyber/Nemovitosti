(function (root) {
  'use strict';
  var ZDROJ = 'data/historie-cen.json';
  var nactene = null;

  function nacti() {
    if (!nactene) {
      nactene = fetch(ZDROJ, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return nactene;
  }

  var MESICE = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
  function denKratce(iso) {
    var c = String(iso).split('-');
    return c.length === 3 ? (+c[2]) + '. ' + MESICE[+c[1] - 1] : iso;
  }
  function cislo(n) {
    return (Math.round(n * 10) / 10).toFixed(n < 100 ? 1 : 0).replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function vyberRadu(H, uroven, nazev) {
    var nej = null;
    for (var k in H.rady) {
      if (!Object.prototype.hasOwnProperty.call(H.rady, k)) continue;
      var c = k.split('|');
      if (c[0] !== uroven || c[1] !== nazev) continue;
      var r = H.rady[k];
      if (!r.klidna) continue;
      var bodu = 0, vzorek = 0;
      for (var i = 0; i < r.cena.length; i++) {
        if (r.cena[i] !== null) { bodu++; vzorek = Math.max(vzorek, r.vzorek[i] || 0); }
      }
      if (bodu < 5) continue;
      if (!nej || bodu > nej.bodu || (bodu === nej.bodu && vzorek > nej.vzorek)) {
        nej = { klic: k, druh: c[2], r: r, bodu: bodu, vzorek: vzorek };
      }
    }
    return nej;
  }

  function maloVzorku(H, vzorek) {
    var dost = H && typeof H.dost === 'number' ? H.dost : 0;
    if (!dost || vzorek >= dost) return '';
    return 'Na cenu celého okresu je to málo — berte to jako hrubé vodítko. ';
  }

  function kresli(el, H, vyber, kde) {
    var dny = H.dny, r = vyber.r;
    var body = [];
    for (var i = 0; i < dny.length; i++) {
      if (r.cena[i] !== null) body.push({ den: dny[i], cena: r.cena[i], vzorek: r.vzorek[i] });
    }
    if (body.length < 5) return false;

    var W = Math.max(280, Math.round(el.clientWidth || 900));
    var Hh = W < 560 ? 150 : 190;
    var L = 8, P = 12, D = 30;
    var min = Infinity, max = -Infinity;
    body.forEach(function (b) { min = Math.min(min, b.cena); max = Math.max(max, b.cena); });

    var stred = (max + min) / 2;
    var rozsah = Math.max((max - min) * 1.7, stred * 0.10) || 1;
    var dolu = stred - rozsah / 2, nahoru = stred + rozsah / 2;
    var x = function (i) { return L + (W - L - P) * (body.length === 1 ? 0.5 : i / (body.length - 1)); };
    var y = function (v) { return P + (Hh - P - D) * (1 - (v - dolu) / (nahoru - dolu)); };

    var d = body.map(function (b, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(b.cena).toFixed(1); }).join(' ');

    var prvni = body[0], posledni = body[body.length - 1];
    var zmena = prvni.cena ? (posledni.cena - prvni.cena) / prvni.cena * 100 : 0;
    var popisek = esc(vyber.druh.toLowerCase()) + ' ' + esc(kde);
    var nadpis = 'Nabídková cena za m² — ' + popisek;

    var terce = body.map(function (b, i) {
      return '<g class="gc-bod" data-i="' + i + '">' +
        '<circle class="gc-hit" cx="' + x(i).toFixed(1) + '" cy="' + y(b.cena).toFixed(1) + '" r="14"></circle>' +
        '<circle class="gc-tec" cx="' + x(i).toFixed(1) + '" cy="' + y(b.cena).toFixed(1) + '" r="4.5"></circle></g>';
    }).join('');

    var radky = body.map(function (b) {
      return '<tr><td>' + esc(denKratce(b.den)) + '</td><td>' + cislo(b.cena) + ' Kč/m²</td><td>' + b.vzorek + '</td></tr>';
    }).join('');

    el.innerHTML =
      '<figure class="gc" data-rada="' + esc(vyber.klic) + '">' +
        '<figcaption class="gc-hlava">' +
          '<b>' + esc(nadpis) + '</b>' +
          '<span class="gc-ted">' + cislo(posledni.cena) + ' Kč/m²' +
            '<i class="gc-zmena' + (zmena > 0 ? ' up' : zmena < 0 ? ' down' : '') + '">' +
              (zmena > 0 ? '+' : '') + cislo(zmena) + ' % za ' + body.length + ' dní</i></span>' +
        '</figcaption>' +
        '<div class="gc-plocha">' +

            '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" ' +
            'aria-label="' + esc(nadpis + ': od ' + cislo(prvni.cena) + ' do ' + cislo(posledni.cena) + ' Kč za metr čtvereční') + '">' +

            '<path class="gc-cara" d="' + d + '"></path>' +
            '<line class="gc-kriz" x1="0" y1="' + P + '" x2="0" y2="' + (Hh - D) + '" hidden></line>' +
            terce +
          '</svg>' +
          '<div class="gc-bublina" hidden></div>' +
        '</div>' +
        '<div class="gc-osa"><span>' + esc(denKratce(prvni.den)) + '</span>' +
          '<span>' + esc(denKratce(posledni.den)) + '</span></div>' +
        '<p class="gc-pozn">Medián <b>nabídkové</b> ceny z <b>' + vyber.vzorek + '</b> nabídek ' +
          esc(kde) + ' — ne ceny, za které se pozemky prodaly; ty ve veřejných zdrojích nejsou. ' +
          maloVzorku(H, vyber.vzorek) +
          'Hladina se mění i tím, že nabídky přibývají a mizí. ' +
          'Svislá osa je v rozpětí ' + cislo(min) + '–' + cislo(max) + ' Kč/m², ne od nuly.</p>' +
        '<details class="gc-tab"><summary>Čísla v tabulce</summary>' +
          '<table><caption class="visually-hidden">' + esc(nadpis) + '</caption>' +
          '<thead><tr><th>Den</th><th>Medián</th><th>Z kolika nabídek</th></tr></thead>' +
          '<tbody>' + radky + '</tbody></table></details>' +
      '</figure>';

    var svg = el.querySelector('svg');
    var bub = el.querySelector('.gc-bublina');
    var kriz = el.querySelector('.gc-kriz');
    var plochaEl = el.querySelector('.gc-plocha');
    function ukaz(i) {
      var b = body[i];
      if (!b) return;
      bub.innerHTML = '<b>' + cislo(b.cena) + ' Kč/m²</b><span>' + esc(denKratce(b.den)) +
        ' · z ' + b.vzorek + ' nabídek</span>';
      bub.hidden = false;
      kriz.setAttribute('x1', x(i)); kriz.setAttribute('x2', x(i)); kriz.hidden = false;
      var pom = x(i) / W;
      bub.style.left = (pom * 100) + '%';

      var vysoko = (y(b.cena) - P) / (Hh - P - D) < 0.5;
      bub.style.top = vysoko ? 'auto' : '2px';
      bub.style.bottom = vysoko ? '34px' : 'auto';
      bub.style.transform = 'translateX(' + (pom > 0.75 ? '-100%' : pom < 0.25 ? '0' : '-50%') + ')';
      [].forEach.call(el.querySelectorAll('.gc-bod'), function (g, j) { g.classList.toggle('on', j === i); });
    }
    function schovej() {
      bub.hidden = true; kriz.hidden = true;
      [].forEach.call(el.querySelectorAll('.gc-bod'), function (g) { g.classList.remove('on'); });
    }
    function zBodu(ev) {
      var r2 = svg.getBoundingClientRect();
      var kx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r2.left;
      var pom = kx / r2.width * W;
      var nej = 0, nejD = Infinity;
      for (var i = 0; i < body.length; i++) {
        var dd = Math.abs(x(i) - pom);
        if (dd < nejD) { nejD = dd; nej = i; }
      }
      ukaz(nej);
    }
    plochaEl.addEventListener('mousemove', zBodu);
    plochaEl.addEventListener('mouseleave', schovej);
    plochaEl.addEventListener('touchstart', function (e) { zBodu(e); }, { passive: true });
    plochaEl.addEventListener('touchmove', function (e) { zBodu(e); }, { passive: true });
    plochaEl.addEventListener('touchend', schovej);
    return true;
  }

  function postav(el) {
    var uroven = el.getAttribute('data-uroven');
    var nazev = el.getAttribute('data-nazev');
    var kde = el.getAttribute('data-kde') || nazev;
    if (!uroven || !nazev) return;
    nacti().then(function (H) {
      if (!H || !H.rady) return;
      var v = vyberRadu(H, uroven, nazev);

      if (!v) return;
      try { kresli(el, H, v, kde); } catch (e) {   }
    });
  }

  function start() {
    var mista = [].slice.call(document.querySelectorAll('[data-graf-cen]'));
    if (!mista.length) return;

    if (typeof IntersectionObserver === 'function') {
      var io = new IntersectionObserver(function (zaznamy) {
        zaznamy.forEach(function (z) {
          if (!z.isIntersecting) return;
          io.unobserve(z.target);
          postav(z.target);
        });
      }, { rootMargin: '300px' });
      mista.forEach(function (m) { io.observe(m); });
    } else {
      mista.forEach(postav);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  root.PKGrafCen = { postav: postav, vyberRadu: vyberRadu };
}(typeof window !== 'undefined' ? window : globalThis));
