// Pozemkomat — interaktivita webu
(function () {
  'use strict';

  /* ---------- Ukázková data příležitostí (ilustrační) ---------- */
  var DATA = [
    { place:'Kolín',              type:'drazba',  parcel:'412/3',  area:1240, extra:'dražba za 12 dní', lat:50.0281, lng:15.2003 },
    { place:'Kutná Hora',         type:'exekuce', parcel:'88/1',   area:890,  extra:'v exekuci',        lat:49.9484, lng:15.2680 },
    { place:'Nymburk',            type:'sale',    parcel:'305',    area:2100, extra:'1 890 000 Kč',     lat:50.1850, lng:15.0410 },
    { place:'Poděbrady',          type:'obec',    parcel:'27/2',   area:650,  extra:'záměr obce',       lat:50.1425, lng:15.1190 },
    { place:'Čáslav',             type:'drazba',  parcel:'560/4',  area:3400, extra:'dražba za 5 dní',  lat:49.9110, lng:15.3910 },
    { place:'Kladno',             type:'sale',    parcel:'190',    area:780,  extra:'1 250 000 Kč',     lat:50.1470, lng:14.1030 },
    { place:'Mělník',             type:'exekuce', parcel:'44/7',   area:1500, extra:'v exekuci',        lat:50.3500, lng:14.4740 },
    { place:'Brandýs nad Labem',  type:'obec',    parcel:'611',    area:4200, extra:'záměr obce',       lat:50.1860, lng:14.6610 },
    { place:'Benešov',            type:'sale',    parcel:'72/3',   area:950,  extra:'1 490 000 Kč',     lat:49.7830, lng:14.6860 },
    { place:'Příbram',            type:'drazba',  parcel:'238',    area:1120, extra:'dražba za 20 dní', lat:49.6890, lng:14.0100 },
    { place:'Beroun',             type:'sale',    parcel:'15/1',   area:610,  extra:'980 000 Kč',       lat:49.9640, lng:14.0720 },
    { place:'Rakovník',           type:'exekuce', parcel:'402',    area:2750, extra:'v exekuci',        lat:50.1040, lng:13.7330 },
    { place:'Mladá Boleslav',     type:'obec',    parcel:'318/2',  area:1800, extra:'záměr obce',       lat:50.4110, lng:14.9040 },
    { place:'Slaný',              type:'sale',    parcel:'96',     area:1340, extra:'1 340 000 Kč',     lat:50.2300, lng:14.0860 }
  ];

  var TYPE = {
    sale:    { label:'Na prodej',    color:'#3E8E5B' },
    drazba:  { label:'Dražba',       color:'#D9A441' },
    exekuce: { label:'Exekuce',      color:'#C15B44' },
    obec:    { label:'Obecní záměr', color:'#4C7A9E' }
  };
  var KATASTR = 'https://nahlizenidokatastru.cuzk.cz/';

  function fmt(n){ return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

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

  /* ---------- Sticky header shrink + back-to-top ---------- */
  var header = document.getElementById('header');
  var toTop = document.getElementById('to-top');
  window.addEventListener('scroll', function () {
    var y = window.pageYOffset;
    if (header) header.classList.toggle('shrink', y > 20);
    if (toTop) toTop.classList.toggle('show', y > 500);
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
        ? 'Hotovo! Budeme hlídat okolí „' + okres + '". (ukázka — zatím se nikam neodesílá)'
        : 'Hotovo! Přihlášeno k odběru. (ukázka — zatím se nikam neodesílá)';
      form.reset();
    });
  }

  /* ---------- Interaktivní mapa (Leaflet) ---------- */
  var mapEl = document.getElementById('leaflet-map');
  if (!mapEl || typeof L === 'undefined') return;

  var map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: true }).setView([49.95, 14.75], 8);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);
  map.on('focus', function () { map.scrollWheelZoom.enable(); });
  map.on('blur', function () { map.scrollWheelZoom.disable(); });

  var listEl = document.getElementById('opp-list');
  var countEl = document.getElementById('map-count');
  var searchEl = document.getElementById('map-search');
  var filtersEl = document.getElementById('map-filters');
  var activeType = 'all';
  var searchTerm = '';
  var markers = [];

  function markerIcon(type) {
    return L.divIcon({
      className: '',
      html: '<div class="marker-dot" style="width:18px;height:18px;background:' + TYPE[type].color + ';"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9]
    });
  }
  function popupHtml(d) {
    var t = TYPE[d.type];
    return '<div class="lp-head"><span class="lp-dot" style="background:' + t.color + '"></span>' + t.label + '</div>' +
      '<div class="lp-row"><span>Lokalita</span><b>' + d.place + '</b></div>' +
      '<div class="lp-row"><span>Parcela</span><b>č. ' + d.parcel + '</b></div>' +
      '<div class="lp-row"><span>Výměra</span><b>' + fmt(d.area) + ' m²</b></div>' +
      '<div class="lp-row"><span>Stav</span><b>' + d.extra + '</b></div>' +
      '<a class="lp-link" href="' + KATASTR + '" target="_blank" rel="noopener">→ otevřít v katastru</a>';
  }

  DATA.forEach(function (d, i) {
    d._id = i;
    var m = L.marker([d.lat, d.lng], { icon: markerIcon(d.type) }).addTo(map);
    m.bindPopup(popupHtml(d));
    m.on('click', function () { highlightList(i); });
    markers.push(m);
  });

  function visible(d) {
    var okType = activeType === 'all' || d.type === activeType;
    var okSearch = !searchTerm || d.place.toLowerCase().indexOf(searchTerm) !== -1;
    return okType && okSearch;
  }

  function renderList() {
    listEl.innerHTML = '';
    var shown = 0;
    DATA.forEach(function (d) {
      var vis = visible(d);
      markers[d._id].setOpacity(vis ? 1 : 0);
      markers[d._id]._icon && (markers[d._id]._icon.style.pointerEvents = vis ? 'auto' : 'none');
      if (!vis) return;
      shown++;
      var t = TYPE[d.type];
      var li = document.createElement('li');
      li.className = 'opp-item'; li.setAttribute('data-id', d._id);
      li.innerHTML =
        '<div class="opp-top"><span class="opp-place">' + d.place + '</span>' +
        '<span class="opp-tag ' + d.type + '">' + t.label + '</span></div>' +
        '<div class="opp-meta"><span>parc. <b>' + d.parcel + '</b></span>' +
        '<span><b>' + fmt(d.area) + '</b> m²</span><span>' + d.extra + '</span></div>';
      li.addEventListener('click', function () {
        map.flyTo([d.lat, d.lng], 12, { duration: 0.8 });
        markers[d._id].openPopup();
        highlightList(d._id);
      });
      li.addEventListener('mouseenter', function () { highlightList(d._id); });
      listEl.appendChild(li);
    });
    countEl.textContent = shown + (shown === 1 ? ' příležitost' : (shown >= 2 && shown <= 4 ? ' příležitosti' : ' příležitostí')) + ' na mapě';
    if (shown === 0) listEl.innerHTML = '<li class="map-count" style="padding:20px 6px;">Nic nenalezeno — zkuste jiný filtr.</li>';
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
})();
