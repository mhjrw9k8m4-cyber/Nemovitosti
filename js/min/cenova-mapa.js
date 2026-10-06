(function (global) {
  'use strict';

  var MALO = 'rgba(128,128,128,0.18)';

  function cti() {
    var el = document.getElementById('cen-mapa-data');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function sLeafletem(hotovo) {
    if (global.L && global.L.map) return hotovo();
    var zn = document.querySelector('meta[name="pk-leaflet"]');
    var adresa = (zn && zn.getAttribute('data-src')) || 'vendor/leaflet/leaflet.js';
    var s = document.createElement('script');
    s.src = adresa;

    s.onload = function () { hotovo(); };
    s.onerror = function () { hotovo(); };
    document.head.appendChild(s);
  }

  function stupnice(hodnoty) {
    var set = hodnoty.slice().sort(function (a, b) { return a - b; });
    return function (v) {
      var i = 0;
      while (i < set.length && set[i] < v) i++;
      return set.length > 1 ? i / (set.length - 1) : 0.5;
    };
  }

  function barva(t) {

    return 'rgba(44,113,80,' + (0.12 + t * 0.78).toFixed(3) + ')';
  }

  function kresli(data) {
    var ram = document.getElementById('cen-mapa');
    if (!ram || !global.L || !global.L.map) return;
    var zprava = document.getElementById('cen-mapa-stav');

    fetch('data/okresy-hrube.json').then(function (r) { return r.json(); }).then(function (hranice) {
      var L = global.L;
      var mapa = L.map(ram, {
        zoomControl: false, attributionControl: false,
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false,

        boxZoom: false, keyboard: false, touchZoom: false
      });

      var ceny = [];
      for (var k in data) if (data[k] && typeof data[k].med === 'number') ceny.push(data[k].med);
      var kam = stupnice(ceny);
      var vse = [];
      Object.keys(hranice).forEach(function (okres) {
        var kruhy = hranice[okres];
        if (!kruhy || !kruhy.length) return;
        var zaznam = data[okres];
        var ma = !!(zaznam && typeof zaznam.med === 'number');

        var body = kruhy.map(function (kruh) {
          return kruh.map(function (b) { return [b[1], b[0]]; });
        });
        var tvar = L.polygon(body, {
          fillColor: ma ? barva(kam(zaznam.med)) : MALO,
          fillOpacity: 1,
          color: 'rgba(60,85,162,0.55)',
          weight: 0.8,

          interactive: true
        });
        var popis = ma
          ? '<b>' + okres + '</b><br>Zemědělská půda ' + zaznam.med + ' Kč/m²'
            + (zaznam.lo != null && zaznam.hi != null ? '<br>rozpětí ' + zaznam.lo + '–' + zaznam.hi : '')
            + (zaznam.n != null ? ' · ' + zaznam.n + ' nab.' : '')
          : '<b>' + okres + '</b><br>málo nabídek na spolehlivý medián';
        tvar.bindTooltip(popis, { sticky: true });

        tvar.on('add', function () {
          if (!tvar._path) return;
          tvar._path.setAttribute('data-okres', okres);
          if (ma) tvar._path.setAttribute('data-cena', String(zaznam.med));
          else tvar._path.setAttribute('data-malo', '1');
        });
        if (ma && zaznam.odkaz) {
          tvar.on('click', function () { global.location.href = zaznam.odkaz; });
          tvar.on('add', function () { if (tvar._path) tvar._path.style.cursor = 'pointer'; });
        }
        tvar.addTo(mapa);
        vse.push(tvar);
      });

      if (!vse.length) { if (zprava) zprava.textContent = 'Obrysy okresů se nepodařilo načíst.'; return; }
      var hranicePole = L.featureGroup(vse).getBounds();
      mapa.fitBounds(hranicePole, { padding: [6, 6] });

      setTimeout(function () { mapa.invalidateSize(); mapa.fitBounds(hranicePole, { padding: [6, 6] }); }, 60);
      ram.setAttribute('data-hotovo', String(vse.length));
      if (zprava) zprava.textContent = '';
    }).catch(function () {
      if (zprava) zprava.textContent = 'Obrysy okresů se nepodařilo načíst.';
    });
  }

  function start() {
    var ram = document.getElementById('cen-mapa');
    if (!ram) return;
    var data = cti();
    if (!data) return;

    function zapni() { sLeafletem(function () { kresli(data); }); }
    if (!('IntersectionObserver' in global)) return zapni();
    var hlidac = new IntersectionObserver(function (zaznamy) {
      for (var i = 0; i < zaznamy.length; i++) {
        if (zaznamy[i].isIntersecting) { hlidac.disconnect(); zapni(); return; }
      }
    }, { rootMargin: '300px' });
    hlidac.observe(ram);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}(typeof self !== 'undefined' ? self : this));
