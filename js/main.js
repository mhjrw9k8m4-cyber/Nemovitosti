// Pozemkomat — interaktivita webu
(function () {
  'use strict';

  /* ---------- Záložní data (když se nenačte data/opportunities.json) ---------- */
  var FALLBACK_DATA = [
    { place:'Kolín',             okres:'Kolín',         type:'drazba',  parcel:'412/3', druh:'stavební',  area:1240, price:640000,  extra:'dražba za 12 dní', lat:50.0281, lng:15.2003 },
    { place:'Kutná Hora',        okres:'Kutná Hora',    type:'exekuce', parcel:'88/1',  druh:'orná půda', area:890,  price:780000,  extra:'v exekuci',        lat:49.9484, lng:15.2680 },
    { place:'Nymburk',           okres:'Nymburk',       type:'sale',    parcel:'305',   druh:'stavební',  area:2100, price:1890000, extra:'na prodej',        lat:50.1850, lng:15.0410 },
    { place:'Poděbrady',         okres:'Nymburk',       type:'obec',    parcel:'27/2',  druh:'zahrada',   area:650,  price:590000,  extra:'záměr obce',       lat:50.1425, lng:15.1190 },
    { place:'Čáslav',            okres:'Kutná Hora',    type:'drazba',  parcel:'560/4', druh:'louka',     area:3400, price:1200000, extra:'dražba za 5 dní',  lat:49.9110, lng:15.3910 },
    { place:'Kladno',            okres:'Kladno',        type:'sale',    parcel:'190',   druh:'stavební',  area:780,  price:1250000, extra:'na prodej',        lat:50.1470, lng:14.1030 },
    { place:'Mělník',            okres:'Mělník',        type:'exekuce', parcel:'44/7',  druh:'orná půda', area:1500, price:1100000, extra:'v exekuci',        lat:50.3500, lng:14.4740 },
    { place:'Brandýs nad Labem', okres:'Praha-východ',  type:'obec',    parcel:'611',   druh:'louka',     area:4200, price:2900000, extra:'záměr obce',       lat:50.1860, lng:14.6610 },
    { place:'Benešov',           okres:'Benešov',       type:'sale',    parcel:'72/3',  druh:'stavební',  area:950,  price:1490000, extra:'na prodej',        lat:49.7830, lng:14.6860 },
    { place:'Příbram',           okres:'Příbram',       type:'drazba',  parcel:'238',   druh:'zahrada',   area:1120, price:720000,  extra:'dražba za 20 dní', lat:49.6890, lng:14.0100 },
    { place:'Beroun',            okres:'Beroun',        type:'sale',    parcel:'15/1',  druh:'stavební',  area:610,  price:980000,  extra:'na prodej',        lat:49.9640, lng:14.0720 },
    { place:'Rakovník',          okres:'Rakovník',      type:'exekuce', parcel:'402',   druh:'orná půda', area:2750, price:1650000, extra:'v exekuci',        lat:50.1040, lng:13.7330 },
    { place:'Mladá Boleslav',    okres:'Mladá Boleslav',type:'obec',    parcel:'318/2', druh:'stavební',  area:1800, price:2400000, extra:'záměr obce',       lat:50.4110, lng:14.9040 },
    { place:'Slaný',             okres:'Kladno',        type:'sale',    parcel:'96',    druh:'zahrada',   area:1340, price:1340000, extra:'na prodej',        lat:50.2300, lng:14.0860 }
  ];

  var TYPE = {
    sale:    { label:'Na prodej',    color:'#3E8E5B', link:{ label:'Nabídka SPÚ',          url:'https://spu.gov.cz/nabidky' } },
    drazba:  { label:'Dražba',       color:'#D9A441', link:{ label:'Detail dražby',       url:'https://www.portaldrazeb.cz/' } },
    exekuce: { label:'Exekuce',      color:'#C15B44', link:{ label:'Insolvenční rejstřík', url:'https://isir.justice.cz/isir/common/index.do' } },
    obec:    { label:'Obecní záměr', color:'#4C7A9E', link:{ label:'Úřední deska obce',    url:'https://www.uredni-deska.cz/' } }
  };
  var KATASTR = 'https://nahlizenidokatastru.cuzk.cz/';
  function mapyUrl(d){ return 'https://mapy.cz/zakladni?x=' + d.lng + '&y=' + d.lat + '&z=17&source=coor&id=' + d.lng + ',' + d.lat; }

  function fmt(n){ return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function hasArea(d){ return typeof d.area === 'number' && d.area > 0; }
  function areaTxt(d){ return hasArea(d) ? fmt(d.area) + ' m²' : 'neuvedena'; }

  /* ---------- Oznamovací lišta ---------- */
  var tbClose = document.getElementById('tb-close');
  var topbar = document.getElementById('topbar');
  if (tbClose && topbar) {
    tbClose.addEventListener('click', function () { topbar.classList.add('hide'); });
  }

  /* ---------- Mobilní menu ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Okno hlídání lokality (modal) ---------- */
  var wModal = document.getElementById('watch-modal');
  function openWatch(okres) {
    if (!wModal) return;
    var ok = document.getElementById('wm-okres');
    var ti = document.getElementById('wm-title');
    var ms = document.getElementById('wm-msg');
    if (ms) { ms.textContent = ''; ms.classList.remove('err'); }
    if (ok) ok.value = okres || '';
    if (ti) ti.textContent = okres ? ('Hlídat okres ' + okres) : 'Hlídat lokalitu zdarma';
    wModal.removeAttribute('hidden');
    requestAnimationFrame(function () { wModal.classList.add('open'); });
    document.body.style.overflow = 'hidden';
    var em = document.getElementById('wm-email');
    if (em) setTimeout(function () { em.focus(); }, 80);
  }
  function closeWatch() {
    if (!wModal) return;
    wModal.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () { wModal.setAttribute('hidden', ''); }, 250);
  }
  // Každý odkaz na #upozorneni otevře okno (místo skoku po stránce)
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('a[href="#upozorneni"]');
    if (trigger) { e.preventDefault(); openWatch(trigger.getAttribute('data-okres') || ''); return; }
    if (e.target.closest('[data-close]')) closeWatch();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeWatch(); });

  var wForm = document.getElementById('watch-form');
  if (wForm) {
    wForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('wm-email').value.trim();
      var okres = document.getElementById('wm-okres').value.trim();
      var ms = document.getElementById('wm-msg');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ms.textContent = 'Zadejte prosím platný e-mail.'; ms.classList.add('err'); return; }
      ms.classList.remove('err');
      ms.textContent = okres ? ('Díky! Jakmile se v okolí „' + okres + '" něco objeví, dáme vám vědět. (ukázka)') : 'Díky! Přihlášeno — ozveme se, až bude co. (ukázka)';
      setTimeout(closeWatch, 1900);
    });
  }

  /* ---------- Sticky header shrink + back-to-top ---------- */
  var header = document.getElementById('header');
  var toTop = document.getElementById('to-top');
  var progress = document.getElementById('progress-bar');
  window.addEventListener('scroll', function () {
    var y = window.pageYOffset;
    if (header) header.classList.toggle('shrink', y > 20);
    if (toTop) toTop.classList.toggle('show', y > 500);
    if (progress) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    }
  }, { passive: true });
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---------- Scroll reveal ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Animovaná počítadla ---------- */
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var start = null, dur = 1200;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var val = Math.floor(p * target * (2 - p)); // ease-out
      el.textContent = val + suffix;
      if (p < 1) requestAnimationFrame(step); else el.textContent = target + suffix;
    }
    requestAnimationFrame(step);
  }
  var counters = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { animateCount(en.target); cio.unobserve(en.target); }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(function (el) { el.textContent = el.getAttribute('data-count') + (el.getAttribute('data-suffix') || ''); });
  }

  /* ---------- Kopírování embed kódu ---------- */
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.getAttribute('data-copy-target'));
      if (!target) return;
      var text = target.innerText;
      function done() {
        var orig = btn.textContent;
        btn.textContent = 'Zkopírováno ✓'; btn.classList.add('copied');
        setTimeout(function () { btn.textContent = orig; btn.classList.remove('copied'); }, 1800);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else { fallback(); }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  });

  /* ---------- Formulář upozornění (demo) ---------- */
  var form = document.getElementById('alert-form');
  var msg = document.getElementById('form-msg');
  if (form && msg) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.querySelector('#email').value.trim();
      var okres = form.querySelector('#okres').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        msg.textContent = 'Zadejte prosím platný e-mail.'; msg.classList.add('err'); return;
      }
      msg.classList.remove('err');
      msg.textContent = okres
        ? 'Díky! Hlídáme okolí „' + okres + '" za vás. (ukázka — zatím se nikam neodesílá)'
        : 'Díky! Přihlášeno k odběru. (ukázka — zatím se nikam neodesílá)';
      form.reset();
    });
  }

  /* ---------- Scroll-spy: aktivní sekce v menu ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('#nav a:not(.btn-primary)'));
  var spyTargets = navLinks.map(function (a) {
    var id = a.getAttribute('href');
    return (id && id.charAt(0) === '#' && id.length > 1) ? document.getElementById(id.slice(1)) : null;
  });
  if ('IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var idx = spyTargets.indexOf(en.target);
        if (idx === -1) return;
        navLinks.forEach(function (a) { a.classList.remove('active'); });
        navLinks[idx].classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    spyTargets.forEach(function (t) { if (t) spy.observe(t); });
  }

  /* ---------- Sestavení webu z dat (ticker + mapa) ---------- */
  function boot(DATA) {
  // Počítadlo „příležitostí na mapě" napojíme na skutečný počet dat
  var realCount = document.querySelector('.counters .c-num');
  if (realCount) realCount.setAttribute('data-count', String(DATA.length));

  /* ---------- Živý ticker příležitostí ---------- */
  var tickTrack = document.getElementById('ticker-track');
  if (tickTrack) {
    var html = '';
    DATA.forEach(function (d) {
      html += '<span class="tick-item"><span class="td" style="background:' + TYPE[d.type].color + '"></span>' +
        TYPE[d.type].label + ' · <b>' + d.place + '</b> · ' + areaTxt(d) + ' · ' + d.extra + '</span>';
    });
    tickTrack.innerHTML = html + html; // zdvojení pro plynulou smyčku
  }

  /* ---------- Interaktivní mapa (Leaflet) ---------- */
  var mapEl = document.getElementById('leaflet-map');
  if (!mapEl || typeof L === 'undefined') return;

  var map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: true }).setView([49.95, 14.75], 8);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);
  // Lehké ovládání: mapa je hned použitelná (body klikací, stránka přes ni
  // normálně scrolluje). Tlačítko zapne režim posouvání/přibližování mapy.
  var panBtn = document.getElementById('map-pan-toggle');
  var mapLocked = true;
  function setPan(on) {
    mapLocked = !on;
    var fns = ['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard'];
    fns.forEach(function (f) { if (map[f]) map[f][on ? 'enable' : 'disable'](); });
    if (panBtn) { panBtn.textContent = on ? 'Kliknutím zde zastavíte mapu' : 'Kliknutím zde rozhýbete mapu'; panBtn.classList.toggle('on', on); }
    if (on) setTimeout(function () { map.invalidateSize(); }, 60);
  }
  setPan(false);
  if (panBtn) panBtn.addEventListener('click', function () { setPan(mapLocked); });
  window.addEventListener('resize', function () { map.invalidateSize(); });

  var listEl = document.getElementById('opp-list');
  var countEl = document.getElementById('map-count');
  var searchEl = document.getElementById('map-search');
  var filtersEl = document.getElementById('map-filters');
  var detailEl = document.getElementById('opp-detail');
  var activeType = 'all';
  var searchTerm = '';
  var markers = [];

  if (detailEl) {
    detailEl.addEventListener('click', function (e) {
      if (e.target.closest('[data-detail-back]')) hideDetail();
    });
  }

  function markerIcon(type) {
    var col = TYPE[type].color;
    return L.divIcon({
      className: '',
      html: '<div class="marker-pulse" style="width:18px;height:18px;background:' + col + ';color:' + col + ';"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9]
    });
  }
  // Přibližný tvar parcely (deterministický, cache) — ukázková geometrie
  function polyFor(d) {
    if (d._poly) return d._poly;
    var side = Math.sqrt(hasArea(d) ? d.area : 1500);
    var hLat = (side / 2) / 111320;
    var hLng = (side / 2) / (111320 * Math.cos(d.lat * Math.PI / 180));
    var seed = (d._id != null ? d._id : 0) + 1;
    function rnd(i) { var x = Math.sin(seed * 99.9 + i * 7.13) * 10000; return x - Math.floor(x); }
    var pts = [], n = 5;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2 + rnd(i + 20) * 0.4;
      var r = 0.7 + rnd(i) * 0.6;
      pts.push([ d.lat + Math.sin(ang) * hLat * r, d.lng + Math.cos(ang) * hLng * r ]);
    }
    d._poly = pts; return pts;
  }
  function shapeSvg(d) {
    var p = polyFor(d);
    var lats = p.map(function (x) { return x[0]; }), lngs = p.map(function (x) { return x[1]; });
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
    var scale = Math.max(maxLat - minLat, maxLng - minLng) || 1;
    var pts = p.map(function (x) {
      var px = ((x[1] - minLng) / scale) * 80 + 10;
      var py = (1 - (x[0] - minLat) / scale) * 80 + 10;
      return px.toFixed(1) + ',' + py.toFixed(1);
    }).join(' ');
    var col = TYPE[d.type].color;
    return '<svg viewBox="0 0 100 100"><polygon points="' + pts +
      '" fill="' + col + '30" stroke="' + col + '" stroke-width="2.2"/></svg>';
  }

  function detailHtml(d) {
    var t = TYPE[d.type];
    var perM2 = hasArea(d) ? Math.round(d.price / d.area) : null;
    var priceLabel = d.type === 'drazba' ? 'Vyvolávací' : (d.type === 'sale' ? 'Cena' : 'Odhad');
    return '<button class="md-topbar" type="button" data-detail-back><span>Zavřít detail</span><span class="mx">✕</span></button>' +
      '<div class="md-body">' +
        '<div class="md-shape" style="border-color:' + t.color + '55">' + shapeSvg(d) + '</div>' +
        '<div class="md-info">' +
          '<div class="md-top"><span class="lp-dot" style="background:' + t.color + '"></span><b>' + t.label + '</b> · ' + d.place + ', okres ' + d.okres + '</div>' +
          '<div class="md-facts">' +
            '<span>Parcela <b>č. ' + d.parcel + '</b></span>' +
            '<span>Druh <b>' + d.druh + '</b></span>' +
            '<span>Výměra <b>' + areaTxt(d) + '</b></span>' +
            '<span>' + priceLabel + ' <b>' + fmt(d.price) + ' Kč</b></span>' +
            (perM2 ? '<span>Cena/m² <b>' + fmt(perM2) + ' Kč</b></span>' : '') +
            '<span>Stav <b>' + d.extra + '</b></span>' +
          '</div>' +
        '</div>' +
        '<div class="md-actions">' +
          '<a class="lp-btn" href="' + KATASTR + '" target="_blank" rel="noopener">Katastr</a>' +
          '<a class="lp-btn" href="' + mapyUrl(d) + '" target="_blank" rel="noopener">Mapa</a>' +
          '<a class="lp-btn" href="' + t.link.url + '" target="_blank" rel="noopener">' + t.link.label + '</a>' +
          '<a class="lp-watch" href="#upozorneni" data-okres="' + d.okres + '">Hlídat okres ' + d.okres + '</a>' +
        '</div>' +
      '</div>';
  }
  var selPoly = null;
  function resizeMapSoon() {
    setTimeout(function () { map.invalidateSize(); }, 60);
    setTimeout(function () { map.invalidateSize(); }, 340);
  }
  var holderEl = document.querySelector('.map-holder');
  function showDetail(d) {
    if (!detailEl) return;
    detailEl.innerHTML = detailHtml(d);
    detailEl.removeAttribute('hidden');
    requestAnimationFrame(function () { detailEl.classList.add('show'); });
    highlightMarker(d._id);
    highlightShape(d);
    resizeMapSoon();
    if (window.innerWidth <= 960 && holderEl) holderEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function hideDetail() {
    if (!detailEl) return;
    detailEl.classList.remove('show');
    detailEl.setAttribute('hidden', '');
    highlightMarker(-1);
    if (selPoly) { map.removeLayer(selPoly); selPoly = null; }
    resizeMapSoon();
  }
  function highlightMarker(id) {
    markers.forEach(function (m, i) {
      if (m._icon) {
        var dot = m._icon.querySelector('.marker-pulse');
        if (dot) dot.classList.toggle('sel', i === id);
      }
    });
  }
  function highlightShape(d) {
    if (selPoly) { map.removeLayer(selPoly); selPoly = null; }
    selPoly = L.polygon(polyFor(d), { color: '#fff', weight: 2.5, fillColor: TYPE[d.type].color, fillOpacity: 0.4, opacity: 1 }).addTo(map);
  }

  DATA.forEach(function (d, i) {
    d._id = i;
    var m = L.marker([d.lat, d.lng], { icon: markerIcon(d.type) }).addTo(map);
    m.on('click', function () { showDetail(d); highlightList(i); });
    markers.push(m);
  });

  // Vrstva tvarů parcel — objeví se po přiblížení
  var polyLayer = L.layerGroup();
  DATA.forEach(function (d) {
    var p = L.polygon(polyFor(d), { color: TYPE[d.type].color, weight: 1.4, fillColor: TYPE[d.type].color, fillOpacity: 0.22, opacity: 0.85 });
    p.on('click', function () { showDetail(d); highlightList(d._id); });
    polyLayer.addLayer(p);
  });
  function updatePolyVisibility() {
    if (map.getZoom() >= 12) { if (!map.hasLayer(polyLayer)) polyLayer.addTo(map); }
    else if (map.hasLayer(polyLayer)) map.removeLayer(polyLayer);
  }
  map.on('zoomend', updatePolyVisibility);

  function visible(d) {
    var okType = activeType === 'all' || d.type === activeType;
    var okSearch = !searchTerm || d.place.toLowerCase().indexOf(searchTerm) !== -1;
    return okType && okSearch;
  }

  // Míra zájmu — čím výhodnější cena/m² a lákavější typ, tím víc zájemců
  function demand(d) {
    if (d._demand != null) return d._demand;
    var perM2 = hasArea(d) ? d.price / d.area : 600;
    var typeBonus = { drazba: 60, exekuce: 45, obec: 25, sale: 35 }[d.type] || 0;
    var dealBonus = Math.max(0, 1100 - perM2) / 7;
    d._demand = Math.round(34 + typeBonus + dealBonus);
    return d._demand;
  }

  var LIST_LIMIT = 6;
  function renderList() {
    listEl.innerHTML = '';
    var vis = [];
    DATA.forEach(function (d) {
      var v = visible(d);
      markers[d._id].setOpacity(v ? 1 : 0);
      markers[d._id]._icon && (markers[d._id]._icon.style.pointerEvents = v ? 'auto' : 'none');
      if (v) vis.push(d);
    });
    var matched = vis.length;
    vis.sort(function (a, b) { return demand(b) - demand(a); });
    var top = vis.slice(0, LIST_LIMIT);

    top.forEach(function (d, rank) {
      var t = TYPE[d.type];
      var perM2 = hasArea(d) ? Math.round(d.price / d.area) : null;
      var w = demand(d);
      var hot = rank < 2 || w >= 140;
      var li = document.createElement('li');
      li.className = 'opp-item ' + d.type + (hot ? ' is-hot' : '');
      li.setAttribute('data-id', d._id);
      li.setAttribute('tabindex', '0');
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', t.label + ' · ' + d.place + ' · ' + areaTxt(d));
      li.innerHTML =
        '<div class="opp-top"><span class="opp-place">' + d.place + '</span>' +
        '<span class="opp-tag ' + d.type + '">' + t.label + '</span></div>' +
        '<div class="opp-meta"><span>parc. <b>' + d.parcel + '</b></span>' +
        '<span>' + (hasArea(d) ? '<b>' + fmt(d.area) + '</b> m²' : 'výměra neuvedena') + '</span><span>' + d.druh + '</span></div>' +
        '<div class="opp-price"><b>' + fmt(d.price) + ' Kč</b>' + (perM2 ? ' <span>· ' + fmt(perM2) + ' Kč/m²</span>' : '') + '</div>' +
        '<div class="opp-demand">' + (hot ? '<span class="hot">Velký zájem</span> · ' : '') + '<span class="watch">' + w + ' sledujících</span></div>';
      function openThis() {
        showDetail(d);
        highlightList(d._id);
        if (!mapLocked) map.panTo([d.lat, d.lng], { animate: true, duration: 0.5 });
      }
      li.addEventListener('click', openThis);
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openThis(); }
      });
      li.addEventListener('mouseenter', function () { highlightList(d._id); });
      listEl.appendChild(li);
    });

    countEl.innerHTML = 'Nejžádanější příležitosti · <span class="mc-sub">' + matched + ' na mapě</span>';
    if (matched === 0) {
      listEl.innerHTML = '<li class="map-count" style="padding:20px 6px; text-transform:none; font-weight:400;">Tady zrovna nic není — zkuste jiný filtr. Příležitostí přibývá každý týden.</li>';
    } else if (matched > LIST_LIMIT) {
      var more = document.createElement('li');
      more.className = 'opp-more';
      more.textContent = '+ ' + (matched - LIST_LIMIT) + ' dalších příležitostí najdete na mapě';
      listEl.appendChild(more);
    }
  }

  function highlightList(id) {
    document.querySelectorAll('.opp-item').forEach(function (el) {
      el.classList.toggle('hl', el.getAttribute('data-id') == id);
    });
  }

  filtersEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.filter-chip');
    if (!btn) return;
    filtersEl.querySelectorAll('.filter-chip').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    activeType = btn.getAttribute('data-type');
    renderList();
  });
  searchEl.addEventListener('input', function () {
    searchTerm = searchEl.value.trim().toLowerCase();
    renderList();
  });

  renderList();
  setTimeout(function () { map.invalidateSize(); }, 300);
  }

  /* ---------- Načtení reálných dat s bezpečnou zálohou ---------- */
  fetch('data/opportunities.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('data nedostupná'); return r.json(); })
    .then(function (j) {
      var arr = Array.isArray(j) ? j : (j && j.opportunities);
      boot(arr && arr.length ? arr : FALLBACK_DATA);
    })
    .catch(function () { boot(FALLBACK_DATA); });
})();
