(function () {
  'use strict';

  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
  window.addEventListener('pageshow', function () {

    var kotva = location.hash && !(window.PKOdkaz && PKOdkaz.jeStavMapy(location.hash));
    if (!kotva && !/[?&](p|kraj|lid)=/.test(location.search)) {
      try { window.scrollTo(0, 0); } catch (e) {}
    }
  });

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

  function tokenBarva(nazev, zaloha) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(nazev).trim();
      return v || zaloha;
    } catch (e) { return zaloha; }
  }
  var TYPE = {
    sale:    { label: 'Na prodej',    color: tokenBarva('--c-sale', '#4361B8'), link: { label: 'Nabídka SPÚ',          url: 'https://spu.gov.cz/nabidky' } },
    drazba:  { label: 'Dražba',       color: tokenBarva('--c-drazba', '#CC6B33'), link: { label: 'Dražební portál',     url: 'https://www.portaldrazeb.cz/' } },
    exekuce: { label: 'Exekuce',      color: tokenBarva('--c-exekuce', '#8C2F1E'), link: { label: 'Ověřit v katastru', url: 'https://www.ikatastr.cz/' } },
    obec:    { label: 'Obecní záměr', zkratka: 'Záměr obce', color: tokenBarva('--c-obec', '#12AEBE'), link: { label: 'Úřední deska obce',    url: 'https://www.uredni-deska.cz/' } },
    majitel: { label: 'Přímo od majitele', zkratka: 'Od majitele', color: tokenBarva('--c-majitel', '#8B4FE0'), link: { label: 'Ověřit v katastru',    url: 'https://www.ikatastr.cz/' } }
  };

  var KRAJE = {
    'Praha':            { c: [50.075, 14.44] },
    'Středočeský':      { c: [49.88, 14.90] },
    'Jihočeský':        { c: [49.05, 14.47] },
    'Plzeňský':         { c: [49.63, 13.30] },
    'Karlovarský':      { c: [50.15, 12.80] },
    'Ústecký':          { c: [50.55, 13.82] },
    'Liberecký':        { c: [50.70, 15.02] },
    'Královéhradecký':  { c: [50.35, 15.90] },
    'Pardubický':       { c: [49.92, 16.22] },
    'Vysočina':         { c: [49.42, 15.60] },
    'Jihomoravský':     { c: [48.98, 16.70] },
    'Olomoucký':        { c: [49.78, 17.25] },
    'Zlínský':          { c: [49.15, 17.75] },
    'Moravskoslezský':  { c: [49.82, 18.05] }
  };
  var OKRES_KRAJ = {
    'Hlavní město Praha':'Praha','Praha':'Praha',
    'Benešov':'Středočeský','Beroun':'Středočeský','Kladno':'Středočeský','Kolín':'Středočeský','Kutná Hora':'Středočeský','Mělník':'Středočeský','Mladá Boleslav':'Středočeský','Nymburk':'Středočeský','Praha-východ':'Středočeský','Praha-západ':'Středočeský','Příbram':'Středočeský','Rakovník':'Středočeský',
    'České Budějovice':'Jihočeský','Český Krumlov':'Jihočeský','Jindřichův Hradec':'Jihočeský','Písek':'Jihočeský','Prachatice':'Jihočeský','Strakonice':'Jihočeský','Tábor':'Jihočeský',
    'Domažlice':'Plzeňský','Klatovy':'Plzeňský','Plzeň-město':'Plzeňský','Plzeň-jih':'Plzeňský','Plzeň-sever':'Plzeňský','Rokycany':'Plzeňský','Tachov':'Plzeňský',
    'Cheb':'Karlovarský','Karlovy Vary':'Karlovarský','Sokolov':'Karlovarský',
    'Děčín':'Ústecký','Chomutov':'Ústecký','Litoměřice':'Ústecký','Louny':'Ústecký','Most':'Ústecký','Teplice':'Ústecký','Ústí nad Labem':'Ústecký',
    'Česká Lípa':'Liberecký','Jablonec nad Nisou':'Liberecký','Liberec':'Liberecký','Semily':'Liberecký',
    'Hradec Králové':'Královéhradecký','Jičín':'Královéhradecký','Náchod':'Královéhradecký','Rychnov nad Kněžnou':'Královéhradecký','Trutnov':'Královéhradecký',
    'Chrudim':'Pardubický','Pardubice':'Pardubický','Svitavy':'Pardubický','Ústí nad Orlicí':'Pardubický',
    'Havlíčkův Brod':'Vysočina','Jihlava':'Vysočina','Pelhřimov':'Vysočina','Třebíč':'Vysočina','Žďár nad Sázavou':'Vysočina',
    'Blansko':'Jihomoravský','Brno-město':'Jihomoravský','Brno-venkov':'Jihomoravský','Břeclav':'Jihomoravský','Hodonín':'Jihomoravský','Vyškov':'Jihomoravský','Znojmo':'Jihomoravský',
    'Jeseník':'Olomoucký','Olomouc':'Olomoucký','Prostějov':'Olomoucký','Přerov':'Olomoucký','Šumperk':'Olomoucký',
    'Kroměříž':'Zlínský','Uherské Hradiště':'Zlínský','Vsetín':'Zlínský','Zlín':'Zlínský',
    'Bruntál':'Moravskoslezský','Frýdek-Místek':'Moravskoslezský','Karviná':'Moravskoslezský','Nový Jičín':'Moravskoslezský','Opava':'Moravskoslezský','Ostrava-město':'Moravskoslezský'
  };
  function krajOf(d){ return OKRES_KRAJ[(d.okres || '').trim()] || null; }

  var SPU_OFFERS = 'https://spu.gov.cz/nabidky/prehled-cela-cr';

  var BM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';

  var pkey = window.PKKlic.pkey;
  var pkeyLegacy = window.PKKlic.pkeyLegacy;

  var PK_DIAKR = { 'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o','ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z' };

  function fmt(n){ return (n == null ? '' : n.toString()).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); }

  var T = window.PK_TERMINY;
  function daysUntil(extra){ return T.daysUntil(extra); }

  function jeProsle(d){ var n = daysUntil(d.extra); return n != null && n < 0; }
  function countdownText(days){ return T.countdownText(days); }
  function countdownClass(days){ return T.countdownClass(days); }

  function auctionYMD(extra){ return T.auctionYMD(extra); }

  function zdrojText(extra){ return T.zdrojText(extra); }

  function hasArea(d){ return typeof d.area === 'number' && d.area > 0; }
  function areaTxt(d){ return hasArea(d) ? fmt(d.area) + '\u00a0m²' : 'neuvedena'; }

  function hasParcel(d){ return d.parcel && d.parcel !== '—' && d.parcel !== ''; }

  function druhGroup(s) {
    return (window.PK_CENY && window.PK_CENY.druhGroup) ? window.PK_CENY.druhGroup(s) : 'Jiný pozemek';
  }

  var NADRAZENE = { 'Zemědělská půda': ['Orná půda', 'Louka / travní porost'] };
  function druhSedi(druhPozemku, vybrano) {
    if (!vybrano || vybrano === 'all') return true;
    var g = druhGroup(druhPozemku);
    if (g === vybrano) return true;
    var pod = NADRAZENE[vybrano];
    return !!pod && pod.indexOf(g) >= 0;
  }

  var FEEDBACK_ENDPOINT = (typeof window !== 'undefined' && window.PK_FORM_ENDPOINT) || '';
  var FEEDBACK_EMAIL = (typeof window !== 'undefined' && window.PK_FORM_EMAIL) || '';

  var SB_URL = (typeof window !== 'undefined' && window.PK_SUPABASE_URL) || '';
  var SB_KEY = (typeof window !== 'undefined' && window.PK_SUPABASE_KEY) || '';
  var SB_READY = !!(SB_URL && SB_KEY);

  var viewedLids = {};

  function sbRpc(fn, args) {
    if (!SB_READY) return Promise.resolve(null);
    return fetch(SB_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args || {})
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function favKeys() { try { return JSON.parse(localStorage.getItem('pk_fav_v1')) || []; } catch (e) { return []; } }
  function favCount() { return favKeys().length; }

  var toastEl = document.getElementById('toast');
  var toastT = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.removeAttribute('hidden');
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toastT);
    toastT = setTimeout(function () {
      toastEl.classList.remove('show');
      setTimeout(function () { toastEl.setAttribute('hidden', ''); }, 300);
    }, 2600);
  }

  var INFO = {
    soukromi: {
      t: 'Zásady soukromí',
      h: '<p>Parcelka je ve veřejné bétě. Upřímně, jak zacházíme s daty:</p>' +
        '<ul>' +
        '<li><b>E-mail:</b> použijeme jen pro upozornění nebo poptávku, o kterou si sami řeknete. Neprodáváme ho a neposíláme spam — kdykoli se odhlásíte.</li>' +

        '<li><b>Bez přihlášení:</b> uložené i skryté pozemky, vaše místo a okruh, nastavení filtrů a vrstev zůstávají jen ve vašem prohlížeči (localStorage). Na server nejdou.</li>' +
        '<li><b>S účtem:</b> e-mail, hlídaná vyhledávání, vaše inzeráty a zprávy ukládáme na server (Supabase). Ke svým řádkům se dostanete jen vy — hlídá to databáze, ne jen kód stránky.</li>' +
        '<li><b>Data o pozemcích:</b> pocházejí z veřejných zdrojů (dražby, SPÚ, inzeráty, katastr). Nezveřejňujeme osobní údaje vlastníků.</li>' +

        '<li><b>Provoz:</b> web běží na GitHub Pages. Žádná reklama a žádné profilování návštěvníků. Nepoužíváme cookies třetích stran.</li>' +
        '<li><b>Vaše práva (GDPR):</b> e-mail zpracováváme jen na základě vašeho souhlasu (upozornění nebo poptávka). Máte právo na přístup k údajům, jejich opravu i výmaz — napište nám a údaje bez zbytečného odkladu smažeme.</li>' +
        '</ul><p>Dotaz? Napište nám přes <a href="#realitky" data-close>kontaktní formulář</a>.</p>'
    },
    podminky: {
      t: 'Podmínky použití',
      h: '<p>Parcelka je bezplatný nástroj ve veřejné bétě. Sbírá a zobrazuje příležitosti u pozemků z veřejných zdrojů.</p>' +
        '<ul>' +
        '<li>Data mají <b>informativní charakter</b>. Vždy si je ověřte v oficiálním katastru a u zdroje (dražba, úřad, prodejce). Parcelka neručí za jejich úplnost ani aktuálnost.</li>' +
        '<li>Parcelka <b>není účastníkem</b> dražeb ani prodejů a neposkytuje právní ani investiční poradenství.</li>' +
        '<li><b>Inzeráty od uživatelů</b> se řídí <a href="pravidla-inzerce.html">Pravidly inzerce</a>. Za obsah inzerátu odpovídá ten, kdo ho vložil; závadný inzerát na nahlášení odstraníme.</li>' +
        '<li>Během bety se funkce mohou měnit. Prohlížení mapy zůstane zdarma.</li>' +
        '</ul><p>Otázky? Napište nám přes <a href="#realitky" data-close>kontaktní formulář</a>.</p>'
    }
  };
  var iModal = document.getElementById('info-modal');
  function openInfo(key) {
    var d = INFO[key]; if (!iModal || !d) return;
    document.getElementById('info-title').textContent = d.t;
    document.getElementById('info-body').innerHTML = d.h;
    iModal.removeAttribute('hidden');
    requestAnimationFrame(function () { iModal.classList.add('open'); });
    document.body.style.overflow = 'hidden';
  }
  function closeInfo() {
    if (!iModal) return;
    iModal.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () { iModal.setAttribute('hidden', ''); }, 250);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-info]');
    if (t) { e.preventDefault(); openInfo(t.getAttribute('data-info')); }

    if (e.target.closest('[data-close]')) closeInfo();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeInfo(); });

  (function () {
    var m = /^#(soukromi|podminky)$/.exec(location.hash || '');
    if (m) setTimeout(function () { openInfo(m[1]); }, 300);
  })();

  var header = document.getElementById('header');
  window.addEventListener('scroll', function () {
    if (header) header.classList.toggle('shrink', window.pageYOffset > 20);
  }, { passive: true });

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

  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var start = null, dur = 1200;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var val = Math.floor(p * target * (2 - p));
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

  function boot(DATA, KRAJE_GEOM, updated, updatedAt, zdrojeStav) {

  (function odstranDuplicity() {
    var ven = window.PKHlidani.bezDuplicit(DATA);
    if (ven.length !== DATA.length) DATA = ven;
  })();

  (function () {
    var okr = {};
    DATA.forEach(function (d) { if (d.okres) okr[d.okres] = 1; });
    var okresN = Object.keys(okr).length;

    var sc = document.getElementById('stat-count'); if (sc) sc.textContent = fmt(DATA.length);
    var so = document.getElementById('stat-okres'); if (so) so.textContent = String(okresN);

    var hc = document.getElementById('hero-n-count'); if (hc) hc.textContent = fmt(DATA.length);
  })();

  (function () {
    var el = document.getElementById('data-updated');
    if (!el || !updated) return;
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(updated);
    if (!m) { el.textContent = ''; return; }

    var dnesStr = new Date().toISOString().slice(0, 10);
    var cas = '';
    if (typeof updatedAt === 'string' && updatedAt) {
      var t = new Date(updatedAt);
      if (!isNaN(t)) cas = ' v ' + t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0');
    }
    el.textContent = (m[0] === dnesStr ? 'Zdroje zkontrolovány dnes' + cas
      : 'Zdroje zkontrolovány ' + (+m[3]) + '. ' + (+m[2]) + '. ' + m[1] + cas);
    var upd = new Date(+m[1], +m[2] - 1, +m[3]);
    var days = Math.floor((Date.now() - upd.getTime()) / 86400000);
    if (isFinite(days) && days >= 4) {
      el.textContent += ' · možná zastaralá (' + days + ' dní)';
      el.classList.add('is-stale');
    } else {
      el.classList.remove('is-stale');
    }

    if (!Array.isArray(zdrojeStav) || !zdrojeStav.length) return;
    var pasy = document.querySelectorAll('.source-chip');
    if (!pasy.length) return;

    var podleJmena = {};
    zdrojeStav.forEach(function (z) { if (z && z.nazev) podleJmena[z.nazev] = z; });
    pasy.forEach(function (chip) {
      var nalez = podleJmena[chip.getAttribute('data-zdroj') || ''];
      if (!nalez) return;
      var znacka = document.createElement('span');

      var vypnuty = nalez.stav === 'vypnuto';
      znacka.className = 'src-stav' + (nalez.stav === 'ok' && nalez.pocet ? '' : ' src-zle');
      znacka.textContent = vypnuty ? 'nezapojený'
        : (nalez.stav !== 'ok' ? 'nedostupný'
          : (nalez.pocet ? nalez.pocet + '×' : 'bez záznamů'));
      znacka.title = vypnuty
        ? 'Zdroj zatím není zapojený' + (nalez.chyba ? ' (' + nalez.chyba + ')' : '')
        : (nalez.stav !== 'ok'
          ? 'Zdroj při poslední kontrole neodpověděl' + (nalez.chyba ? ': ' + nalez.chyba : '')
          : 'Při poslední kontrole vrátil ' + nalez.pocet + ' záznamů');
      chip.appendChild(znacka);
    });
  })();

  (function () {
    var byType = {};
    DATA.forEach(function (d) { byType[d.type] = (byType[d.type] || 0) + 1; });
    document.querySelectorAll('.status-n').forEach(function (el) {
      var n = byType[el.getAttribute('data-type')] || 0;

      el.textContent = n ? (fmt(n) + ' teď na mapě') : 'zatím žádné';
      if (!n) el.classList.add('is-zero');
    });
  })();

  (function () {
    var bunky = document.querySelectorAll('.kj-c[data-kraj]');
    if (!bunky.length) return;
    var poc = {};
    DATA.forEach(function (d) { var k = krajOf(d); if (k) poc[k] = (poc[k] || 0) + 1; });
    bunky.forEach(function (el) {
      var n = poc[el.getAttribute('data-kraj')] || 0;
      el.textContent = n ? (n + ' ' + plPozemek(n)) : 'zatím žádné';
      if (!n) el.classList.add('is-zero');
    });
  })();

  (function () {
    var appEl = document.querySelector('.map-app');
    var mvBtns = document.querySelectorAll('.mv-toggle .mvt-btn');
    if (!appEl || !mvBtns.length) return;
    var mapFittedVisible = false;
    function setView(mv) {
      var seznam = mv === 'seznam';
      appEl.classList.toggle('mv-seznam', seznam);
      mvBtns.forEach(function (b) {
        var on = b.getAttribute('data-mv') === mv;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });

      if (!seznam && typeof scrollToMap === 'function') setTimeout(scrollToMap, 60);

      if (!seznam && typeof map !== 'undefined' && map) {
        var srovnej = function () {
          map.invalidateSize();
          if (!mapFittedVisible && !selectedKraj) fitAllCZ();
        };
        setTimeout(srovnej, 70);
        setTimeout(function () { srovnej(); mapFittedVisible = true; }, 320);
      }
    }
    mvBtns.forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-mv')); });
    });
    setView('seznam');

    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.opp-more') : null;
      if (t) setView('mapa');
    });
  })();

  var mapEl = document.getElementById('leaflet-map');

  if (!mapEl || typeof L === 'undefined') {
    if (mapEl) {
      mapEl.innerHTML =
        '<div class="mapa-nedojela" role="status">' +
          '<b>Mapu se nepodařilo načíst.</b>' +
          '<span>Zkuste stránku obnovit. Pozemky si můžete projít i bez mapy —' +
          ' v přehledu podle krajů a okresů.</span>' +
          '<a class="btn-primary" href="pozemky-podle-okresu.html">Pozemky podle okresů</a>' +
        '</div>';
    }
    var seznamEl = document.getElementById('opp-list');
    if (seznamEl) {
      seznamEl.innerHTML = '<li class="map-count">Výpis se načítá z mapy, a ta nedojela.' +
        ' Zkuste obnovit stránku, nebo použijte <a href="pozemky-podle-okresu.html">přehled podle okresů</a>.</li>';
    }
    return;
  }

  var map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: false, boxZoom: false,
    zoomSnap: 0.25, zoomDelta: 1 }).setView([49.82, 15.47], 7);

  try { window.PK_MAPA = map; } catch (e) {}

  (function schovejPriTazeni() {
    var korenEl = document.documentElement;
    var casovac = null;
    function zpet() {
      if (casovac) { clearTimeout(casovac); casovac = null; }
      korenEl.classList.remove('mapa-tazeni');
    }
    function tahne() {
      korenEl.classList.add('mapa-tazeni');

      if (casovac) clearTimeout(casovac);
      casovac = setTimeout(zpet, 2000);
    }
    map.on('movestart', tahne);
    map.on('zoomstart', tahne);
    map.on('moveend', zpet);
    map.on('zoomend', zpet);

    document.addEventListener('focusin', zpet, true);
    document.addEventListener('pointerdown', function (e) {
      if (!mapEl.contains(e.target)) zpet();
    }, true);
  }());

  map.createPane('dotsPane');
  map.getPane('dotsPane').style.zIndex = 450;
  map.getPane('dotsPane').style.pointerEvents = 'none';
  var dotsRenderer = L.canvas({ pane: 'dotsPane', padding: 0.5 });

  var TVAR = { sale: 'kruh', drazba: 'kosoctverec', exekuce: 'trojuhelnik', obec: 'ctverec', majitel: 'kriz' };

  try { window.PK_TVARY = TVAR; } catch (e) {}

  var TVAR_MERITKO = { kruh: 1, kosoctverec: 1.24, trojuhelnik: 1.34, ctverec: 0.92, kriz: 1.18 };
  function kresliTvar(ctx, tvar, x, y, r) {
    ctx.beginPath();
    if (tvar === 'ctverec') {
      ctx.rect(x - r, y - r, r * 2, r * 2);
    } else if (tvar === 'kosoctverec') {
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    } else if (tvar === 'trojuhelnik') {

      var o = r * 0.12;
      ctx.moveTo(x, y - r + o); ctx.lineTo(x + r * 0.92, y + r * 0.72 + o); ctx.lineTo(x - r * 0.92, y + r * 0.72 + o);
    } else if (tvar === 'kriz') {
      var t = r * 0.42;
      ctx.moveTo(x - t, y - r); ctx.lineTo(x + t, y - r); ctx.lineTo(x + t, y - t);
      ctx.lineTo(x + r, y - t); ctx.lineTo(x + r, y + t); ctx.lineTo(x + t, y + t);
      ctx.lineTo(x + t, y + r); ctx.lineTo(x - t, y + r); ctx.lineTo(x - t, y + t);
      ctx.lineTo(x - r, y + t); ctx.lineTo(x - r, y - t); ctx.lineTo(x - t, y - t);
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2, false);
    }
    ctx.closePath();
  }
  if (typeof L !== 'undefined' && L.Canvas) {
    L.Canvas.include({
      _updatePkTvar: function (layer) {
        if (!this._drawing || layer._empty()) return;
        var p = layer._point, ctx = this._ctx;
        var tvar = layer.options.pkTvar || 'kruh';
        var r = Math.max(layer._radius * (TVAR_MERITKO[tvar] || 1), 1);
        kresliTvar(ctx, tvar, p.x, p.y, r);
        this._fillStroke(ctx, layer);
      }
    });
  }
  var PkTvar = (typeof L !== 'undefined' && L.CircleMarker) ? L.CircleMarker.extend({
    _updatePath: function () {

      if (this._renderer._updatePkTvar) this._renderer._updatePkTvar(this);
      else this._renderer._updateCircle(this);
    }
  }) : null;
  if (map.attributionControl) map.attributionControl.setPosition('bottomleft');

  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Přiblížit', zoomOutTitle: 'Oddálit' }).addTo(map);

  var PODKLADY = (window.PK_SNIMEK && window.PK_SNIMEK.podklady) || [];
  var PODKLAD_KLIC = 'pk_podklad_v1';
  var zakladniDef = { id: 'zakladni', nazev: 'Základní',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    uvedeni: '&copy; OpenStreetMap', max: 19 };
  function podkladDef(id) {
    for (var i = 0; i < PODKLADY.length; i++) if (PODKLADY[i].id === id) return PODKLADY[i];
    return zakladniDef;
  }
  var podkladVrstva = null;
  function nastavPodklad(id, ulozit) {
    var def = podkladDef(id);
    if (podkladVrstva) map.removeLayer(podkladVrstva);

    podkladVrstva = L.tileLayer(def.url, {
      attribution: def.uvedeni, subdomains: 'abc', maxZoom: def.max || 19,
      className: def.id === 'zakladni' ? 'pk-basemap' : 'pk-basemap-foto'
    }).addTo(map);
    podkladVrstva.bringToBack();
    var ovl = document.getElementById('map-podklad');
    if (ovl) {
      [].forEach.call(ovl.querySelectorAll('button'), function (b) {
        var on = b.getAttribute('data-podklad') === def.id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
    if (ulozit) { try { localStorage.setItem(PODKLAD_KLIC, def.id); } catch (e) {} }
  }

  var zvoleny;
  try { zvoleny = localStorage.getItem(PODKLAD_KLIC); } catch (e) { zvoleny = null; }
  if (zvoleny !== 'letecka') zvoleny = 'zakladni';
  nastavPodklad(zvoleny, false);
  var podkladOvl = document.getElementById('map-podklad');
  if (podkladOvl) {
    podkladOvl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-podklad]') : null;
      if (b) nastavPodklad(b.getAttribute('data-podklad'), true);
    });
  }

  var mapLocked = true;
  var lockBtn = document.getElementById('map-lock');

  function setPan(on) {
    mapLocked = !on;

    var fns = ['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'keyboard'];
    fns.forEach(function (f) { if (map[f]) map[f][on ? 'enable' : 'disable'](); });
    if (map.touchZoom) map.touchZoom.enable();

    mapEl.style.touchAction = on ? 'none' : 'pan-y';
    if (lockBtn) lockBtn.hidden = !on;
    if (on) setTimeout(function () { map.invalidateSize(); }, 60);
  }
  setPan(false);
  if (lockBtn) lockBtn.addEventListener('click', function () { setPan(false); });

  var resetBtn = document.getElementById('map-reset');
  if (resetBtn) resetBtn.addEventListener('click', function () { clearKraj(); });
  window.addEventListener('resize', function () { map.invalidateSize(); });

  var listEl = document.getElementById('opp-list');
  var countEl = document.getElementById('map-count');
  var searchEl = document.getElementById('map-search');
  var filtersEl = document.getElementById('map-filters');
  var druhyEl = document.getElementById('mc-druhy');
  var sortEl = document.getElementById('map-sort');
  var cenaEl = document.getElementById('map-cena');
  var areaEl = document.getElementById('map-area');
  var urgentEl = document.getElementById('map-urgent');
  var favEl = document.getElementById('map-fav');

  var cenaOdEl = document.getElementById('map-cena-od');
  var areaDoEl = document.getElementById('map-area-do');
  var minPrice = 0, maxArea = 0;
  var perm2El = document.getElementById('map-perm2');
  var levneEl = document.getElementById('map-levne');
  var maxPerM2 = 0;

  var krajFiltr = 'all';
  var levneOnly = false;
  var activeType = 'all';

  var druhVybrane = [];
  function druhVyhovuje(d) {
    if (!druhVybrane.length) return true;
    for (var i = 0; i < druhVybrane.length; i++) if (druhSedi(d.druh, druhVybrane[i])) return true;
    return false;
  }
  function druhPopis() { return druhVybrane.join(', '); }
  var sortMode = 'demand';
  var maxPrice = 0;
  var minArea = 0;
  var urgentOnly = false;
  var searchTerm = '';
  var searchToks = [];

  var mistoFiltr = null;

  var ukazPodobne = false;
  var _jmenaKlic = null, _jmena = null;
  function znamaJmena() {
    if (_jmena && _jmenaKlic === DATA.length) return _jmena;
    var m = Object.create(null);
    for (var i = 0; i < DATA.length; i++) {
      var d = DATA[i];
      if (d.place) m[HL.norm(d.place)] = true;
      if (d.okres) m[HL.norm(d.okres)] = true;
    }
    _jmena = m; _jmenaKlic = DATA.length;
    return m;
  }

  function presnyNazev() {
    var q = HL.norm(searchTerm);
    return (q && znamaJmena()[q]) ? q : null;
  }
  function jePresna(d, q) {
    return HL.norm(d.place) === q || HL.norm(d.okres) === q;
  }
  function sediMisto(d) {
    if (!mistoFiltr) return true;
    if (mistoFiltr.typ === 'okres') return HL.norm(d.okres) === HL.norm(mistoFiltr.okres);
    return HL.norm(d.place) === HL.norm(mistoFiltr.place)
      && (!mistoFiltr.okres || HL.norm(d.okres) === HL.norm(mistoFiltr.okres));
  }
  function popisMista() {
    if (!mistoFiltr) return '';
    if (mistoFiltr.typ === 'okres') return 'celý okres ' + mistoFiltr.okres;
    return mistoFiltr.place + (mistoFiltr.okres ? ' (okr. ' + mistoFiltr.okres + ')' : '');
  }

  var dotazFiltr = { druh: null, typ: null, site: [], jenCelek: false,
    cenaOd: null, cenaDo: null, plochaOd: null, plochaDo: null, casti: [] };

  var okruhStred = null;

  var POSUVNIKY = [];

  var zadaneVybaveni = [];
  var jenCelek = false;

  var vybaveniEl = null;
  var VYBAVENI_PILULKY = [];

  var HL = window.PKHledani || {
    norm: function (s) { return String(s == null ? '' : s).toLowerCase().trim(); },
    tokeny: function (q) { var n = this.norm(q); return n ? [n] : []; },

    vyhovuje: function (d, t) {
      if (!t.length) return true;
      var s = ' ' + (d.place + ' ' + d.okres + ' ' + (d.parcel || '')).toLowerCase();
      return s.indexOf(' ' + t[0]) !== -1;
    },
  };

  function nastavHledani(v) {
    var syrovy = String(v == null ? '' : v).trim();
    if (window.PKDotaz) {
      var r = window.PKDotaz.rozeber(syrovy);
      dotazFiltr = r;
      searchTerm = r.text;
      okruhStred = null;
      if (r.okruh && r.okruhMisto && window.PKOkruh) {
        okruhStred = window.PKOkruh.stred(DATA, r.okruhMisto);

        for (var ci0 = 0; ci0 < (r.casti || []).length; ci0++) {
          if (r.casti[ci0].druh !== 'okruh') continue;
          if (okruhStred) r.casti[ci0].popis += ' (' + okruhStred.nazev + ')';
          break;
        }

        if (!okruhStred) searchTerm = r.okruhMisto;
      }
    } else {
      dotazFiltr = { druh: null, typ: null, kraj: null, site: [], nejakeSite: false,
        jenCelek: false, levne: false, zaMetrOd: null, zaMetrDo: null,
        cenaOd: null, cenaDo: null, plochaOd: null, plochaDo: null, casti: [] };
      searchTerm = syrovy;
    }
    searchToks = HL.tokeny(searchTerm);

    mistoFiltr = null;
    ukazPodobne = false;

    stranka = 0;
  }
  var favOnly = false;
  var ukazSkryte = false;

  var ukazProsle = false;
  var vybiramMisto = false;
  var markers = [];

  function ctiUloz(klic, zaloha) {
    try { var v = localStorage.getItem(klic); return v == null ? zaloha : JSON.parse(v); }
    catch (e) { return zaloha; }
  }
  function zapisUloz(klic, hodnota) {
    try { localStorage.setItem(klic, JSON.stringify(hodnota)); } catch (e) {}
  }

  var NAVSTEVA_KLIC = 'pk_navsteva_v1';
  var minulaNavsteva = ctiUloz(NAVSTEVA_KLIC, null);

  var VIDENO_KLIC = 'pk_videno_den_v1';
  var VIDENO_STROP = 500;
  var videnoMap = {};

  var videnoVse = true;
  (function () {
    var z = ctiUloz(VIDENO_KLIC, null);
    if (!z || z.den !== minulaNavsteva) return;
    videnoVse = !!z.vse;
    (z.klice || []).forEach(function (k) { videnoMap[k] = 1; });
  }());
  function jeNovy(d) {
    if (!minulaNavsteva || !d.first_seen) return false;
    if (d.first_seen > minulaNavsteva) return true;

    return d.first_seen === minulaNavsteva && !videnoVse && !videnoMap[pkey(d)];
  }
  function pocetNovych() {
    var n = 0;
    for (var i = 0; i < DATA.length; i++) if (jeNovy(DATA[i])) n++;
    return n;
  }

  var MISTO_KLIC = 'pk_misto_v1';
  var mojeMisto = ctiUloz(MISTO_KLIC, null);

  var okoliZap = false;
  function okoliAktivni() {
    return !!(okoliZap && mojeMisto && isFinite(mojeMisto.lat) && isFinite(mojeMisto.lng));
  }

  function najdiNazevMista(lat, lng) {
    var nej = null, nejKm = Infinity;
    for (var i = 0; i < DATA.length; i++) {
      var km = kmOd({ lat: lat, lng: lng }, DATA[i]);
      if (km < nejKm) { nejKm = km; nej = DATA[i]; }
    }
    return (nej && nejKm <= 25) ? nej.place : null;
  }
  function ulozMisto(m) { mojeMisto = m; if (m) zapisUloz(MISTO_KLIC, m); else { try { localStorage.removeItem(MISTO_KLIC); } catch (e) {} } }

  function kmOd(a, d) {
    return (window.PKOkruh && window.PKOkruh.km) ? window.PKOkruh.km(a, d) : Infinity;
  }

  function novinkyUMista() {
    if (!mojeMisto) return null;
    var okruh = mojeMisto.km || 10;
    var nove = DATA.filter(function (d) { return jeNovy(d) && kmOd(mojeMisto, d) <= okruh; });
    var vse = DATA.filter(function (d) { return kmOd(mojeMisto, d) <= okruh; });
    return { nove: nove.length, celkem: vse.length, okruh: okruh, nazev: mojeMisto.nazev || 'vašeho místa' };
  }

  var SKRYTE_KLIC = 'pk_skryte_v1';
  var skryte = ctiUloz(SKRYTE_KLIC, []) || [];
  function jeSkryty(d) { return skryte.indexOf(pkey(d)) !== -1; }
  function prepniSkryty(d) {
    var k = pkey(d), i = skryte.indexOf(k);
    if (i === -1) skryte.push(k); else skryte.splice(i, 1);
    zapisUloz(SKRYTE_KLIC, skryte);
  }

  var FAV_KEY = 'pk_fav_v1';
  var favs = (function () { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; } })();
  function saveFavs(){ try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) {} }
  function isFav(d){ return favs.indexOf(pkey(d)) !== -1; }
  function toggleFav(d){
    var k = pkey(d), i = favs.indexOf(k);
    if (i === -1) favs.push(k); else favs.splice(i, 1);
    saveFavs(); refreshFavBtn();
  }
  function refreshFavBtn(){
    if (!favEl) return;
    var n = favs.length;
    favEl.innerHTML = BM_SVG + '<span>Uložené' + (n ? ' (' + n + ')' : '') + '</span>';
    favEl.classList.toggle('on', favOnly);
    favEl.setAttribute('aria-pressed', String(favOnly));

    favEl.title = 'Uložené pozemky zůstávají v tomhle prohlížeči — na jiném zařízení je neuvidíte.';

    var por = document.getElementById('map-porovnat');
    if (!por) {
      por = document.createElement('a');
      por.id = 'map-porovnat';
      por.className = 'mc-prep msv-porovnat';
      por.href = 'porovnani.html';
      favEl.insertAdjacentElement('afterend', por);
    }
    por.textContent = 'Porovnat (' + n + ')';
    por.hidden = n < 2;
  }

  var RECENT_KEY = 'pk_recent_v1';
  var _keyIdx = null;
  function keyIndex(){ if (_keyIdx) return _keyIdx; _keyIdx = {}; DATA.forEach(function (d) { _keyIdx[pkey(d)] = d; }); return _keyIdx; }
  function recentKeys(){ try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } }
  function renderRecent(){
    var el = document.getElementById('recent-strip');
    if (!el) return;
    var idx = keyIndex();
    var items = recentKeys().map(function (k) { return idx[k]; }).filter(Boolean).slice(0, 8);
    if (items.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
    var h = '<div class="rs-head">Naposledy prohlédnuté</div><div class="rs-row">';
    items.forEach(function (d) {
      h += '<button type="button" class="rs-chip" data-rkey="' + encodeURIComponent(pkey(d)) + '">' +
        '<span class="rs-dot" style="background:' + TYPE[d.type].color + '"></span>' +
        '<span class="rs-place">' + d.place + '</span>' +
        '<span class="rs-price">' + fmt(d.price) + ' Kč</span>' +
      '</button>';
    });
    h += '</div>';
    el.innerHTML = h;
    el.hidden = false;
  }
  (function () {
    var el = document.getElementById('recent-strip');
    if (!el) return;
    el.addEventListener('click', function (e) {
      var chip = e.target.closest('.rs-chip');
      if (!chip) return;
      var k; try { k = decodeURIComponent(chip.getAttribute('data-rkey')); } catch (x) { return; }
      var d = keyIndex()[k];

      if (d) gotoInzerat(d);
    });
  })();

  var MODEL = (window.PK_CENY && window.PK_CENY.postav)
    ? window.PK_CENY.postav(DATA) : null;

  var MEZ_SLEVA = (MODEL && MODEL.MEZ_SLEVA) || 15;
  var MEZ_POCHYBNA = (MODEL && MODEL.MEZ_POCHYBNA) || 60;
  function dealInfo(d) { return MODEL ? MODEL.percentil(d) : null; }

  function kdeSrovnani(pc) {
    if (!pc || !pc.uroven || !(window.PK_CENY && window.PK_CENY.kdeText)) return '';
    return window.PK_CENY.kdeText(pc.uroven, pc.kde) || '';
  }

  var DRUHY_VSE = (function () {
    var gc = {};
    DATA.forEach(function (d) { var g = druhGroup(d.druh); gc[g] = (gc[g] || 0) + 1; });
    return Object.keys(gc).sort(function (a, b) { return gc[b] - gc[a]; });
  }());

  function prekresliDruhy() {
    if (!druhyEl) return;
    var pocty = {};
    for (var i = 0; i < DATA.length; i++) {
      var d = DATA[i];
      if (!visibleBezDruhu(d)) continue;
      var g = druhGroup(d.druh);
      pocty[g] = (pocty[g] || 0) + 1;
    }
    var html = '';
    for (var j = 0; j < DRUHY_VSE.length; j++) {
      var g2 = DRUHY_VSE[j];
      var on = druhVybrane.indexOf(g2) >= 0;
      var n = pocty[g2] || 0;
      html += '<button type="button" class="mcv-btn' + (on ? ' on' : '') + (n ? '' : ' mcv-nula') + '"'
        + ' data-druh="' + esc(g2) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'

        + '<span class="mcp-v" aria-hidden="true"></span>'
        + '<span class="mcp-t">' + esc(g2) + '</span>'
        + '<span class="mcv-n">' + fmt(n) + '</span></button>';
    }
    druhyEl.innerHTML = html;
  }

  (function () {
    var info = document.getElementById('mcv-info');
    var pozn = document.getElementById('mcv-pozn');
    if (!info || !pozn) return;
    info.addEventListener('click', function () {
      var otevreno = info.getAttribute('aria-expanded') === 'true';
      info.setAttribute('aria-expanded', otevreno ? 'false' : 'true');
      pozn.hidden = otevreno;
    });
  }());
  if (druhyEl) {
    druhyEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.mcv-btn') : null;
      if (!b || !druhyEl.contains(b)) return;
      var g = b.getAttribute('data-druh');
      var i2 = druhVybrane.indexOf(g);
      if (i2 >= 0) druhVybrane.splice(i2, 1); else druhVybrane.push(g);
      renderList();
    });
  }

  if (filtersEl) {
    var present = {}, typeCount = {};
    DATA.forEach(function (d) { present[d.type] = true; typeCount[d.type] = (typeCount[d.type] || 0) + 1; });
    filtersEl.querySelectorAll('.filter-chip').forEach(function (b) {
      var tp = b.getAttribute('data-type');
      if (tp && tp !== 'all' && !present[tp]) { b.style.display = 'none'; return; }

      var tecka = b.querySelector('.c');
      if (tecka && TVAR[tp]) {
        tecka.className = tecka.className.replace(/\btv-\S+/g, '').trim() + ' tv-' + TVAR[tp];
      }
      var badge = document.createElement('span');
      badge.className = 'chip-n';
      b.appendChild(badge);
    });
    prepocitejCipy();

    postavPosuvniky();
    postavVybaveni();
  }

  function prepocitejCipy() {
    if (!filtersEl) return;
    var puvodni = activeType;
    var pocty = { all: 0 };
    activeType = 'all';
    try {
      for (var i = 0; i < DATA.length; i++) {
        var d = DATA[i];
        if (!visible(d)) continue;
        pocty.all++;
        pocty[d.type] = (pocty[d.type] || 0) + 1;
      }
    } finally { activeType = puvodni; }
    filtersEl.querySelectorAll('.filter-chip').forEach(function (b) {
      var tp = b.getAttribute('data-type');
      var badge = b.querySelector('.chip-n');

      if (badge) badge.textContent = fmt(pocty[tp] || 0);
    });
  }

  var DNI_KONCI = 14;
  function isUrgent(d) {
    if (d.type !== 'drazba' && d.type !== 'exekuce') return false;
    var dd = daysUntil(d.extra);
    return dd != null && dd >= 0 && dd <= DNI_KONCI;
  }

  function isFeatured(d) { return !!d.featured; }

  var DOT_R = 3.9, DOT_R_SEL = 6.4;

  var rezimBarvy = 'druh';
  var cenovaStupnice = null;

  function prepocitejStupnici(vis) {
    if (rezimBarvy !== 'cena') { cenovaStupnice = null; return; }
    var zm = (window.PK_CENY && window.PK_CENY.zaMetr) || null;
    var ceny = [];
    for (var i = 0; i < vis.length; i++) {
      var v = zm ? zm(vis[i]) : null;
      if (v != null && isFinite(v) && v > 0) ceny.push(v);
    }
    ceny.sort(function (a2, b2) { return a2 - b2; });
    cenovaStupnice = ceny.length >= 8 ? ceny : null;
  }

  function barvaCeny(t) {
    var r = Math.round(74 + t * 136);
    var g = Math.round(144 - t * 32);
    var b = Math.round(190 - t * 132);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function cenovaBarva(d) {
    if (!cenovaStupnice) return null;
    var zm = (window.PK_CENY && window.PK_CENY.zaMetr) || null;
    var v = zm ? zm(d) : null;
    if (v == null || !isFinite(v) || v <= 0) return '#8A9A92';
    var lo = 0, hi = cenovaStupnice.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (cenovaStupnice[mid] < v) lo = mid + 1; else hi = mid; }
    return barvaCeny(cenovaStupnice.length > 1 ? lo / (cenovaStupnice.length - 1) : 0.5);
  }

  function dotStyle(d) {
    var col = TYPE[d.type].color, urgent = isUrgent(d), feat = isFeatured(d);
    if (rezimBarvy === 'cena') { var cb = cenovaBarva(d); if (cb) col = cb; }

    var z = (typeof map !== 'undefined' && map.getZoom) ? map.getZoom() : 8;
    var blizko = Math.max(0, Math.min(1, (z - 8) / 4));
    var kryti = 0.5 + blizko * 0.42;
    var obrys = blizko * 0.34;
    var polomer = urgent ? DOT_R + 0.6 : (feat ? DOT_R + 0.9 : DOT_R);
    var sila = urgent ? 1.2 + blizko * 0.8 : (feat ? 1.0 + blizko * 0.7 : blizko * 0.9);
    var okraj = (urgent || feat) ? 0.25 + blizko * 0.4 : obrys;
    if (urgent || feat) kryti = Math.min(0.95, kryti + 0.18);

    if (selectedKraj && d._gkraj && d._gkraj !== selectedKraj) {
      kryti *= 0.26; okraj = 0; sila = 0; polomer = Math.max(2.2, polomer * 0.78);
    } else if (selectedKraj && d._gkraj === selectedKraj) {

      kryti = Math.min(1, kryti + 0.3);
      okraj = Math.max(okraj, 0.45);
      sila = Math.max(sila, 1);
    }
    return {
      renderer: dotsRenderer,
      pkTvar: TVAR[d.type] || 'kruh',
      radius: polomer,
      fillColor: col, fillOpacity: kryti,

      color: 'rgba(18,24,42,' + okraj.toFixed(2) + ')',
      weight: sila,
      opacity: 1
    };
  }

  var GALLERY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';

  function mapThumb(d) {
    var col = TYPE[d.type].color;

    if (d.photos && d.photos.length) {
      var p0 = d.photos[0];
      var cnt = d.photos.length > 1 ? '<span class="opp-count">' + GALLERY_SVG + (d.photos.length) + '</span>' : '';
      return '<svg class="opp-map" viewBox="0 0 384 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">' +
        '<rect width="384" height="240" fill="#12241A"/>' +
        '<image href="' + p0 + '" xlink:href="' + p0 + '" x="0" y="0" width="384" height="240" preserveAspectRatio="xMidYMid slice"/>' +
        '</svg>' +
        '<span class="opp-mgrad"></span>' +
        odznakDruhu(d) + cnt;
    }
    return window.PK_SNIMEK.html(d, { sirka: 384, vyska: 240, barva: col, id: 'ts' + d._id }) +
      '<span class="opp-mgrad"></span>' +
      odznakDruhu(d);
  }

  function odznakDruhu(d) {
    var t = TYPE[d.type] || {};
    return '<span class="opp-badge ' + d.type + '" style="--c-druh:' + (t.color || '') + '">' +
      '<span class="ob-dlouhy">' + esc(t.label || '') + '</span>' +
      '<span class="ob-kratky">' + esc(t.zkratka || t.label || '') + '</span></span>';
  }

  var selPoly = null;

  function zrusVyberNaMape() {
    highlightMarker(-1);
    if (selPoly) { map.removeLayer(selPoly); selPoly = null; }
  }
  var holderEl = document.querySelector('.map-holder');

  var selMarkerId = -1;
  function highlightMarker(id) {
    if (selMarkerId === id) return;
    var prev = markers[selMarkerId];
    if (prev && prev.setStyle) prev.setStyle({ radius: DOT_R, weight: dotStyle(prev._d).weight, color: dotStyle(prev._d).color });
    var m = markers[id];
    if (m && m.setStyle) { m.setStyle({ radius: DOT_R_SEL, weight: 2.4, color: '#fff' }); if (m.bringToFront) m.bringToFront(); }
    selMarkerId = id;
  }
  function highlightShape(d) {
    if (selPoly) { map.removeLayer(selPoly); selPoly = null; }

    var col = TYPE[d.type].color;
    var html = '<svg viewBox="0 0 24 34" width="30" height="42" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 1C6.2 1 1.5 5.7 1.5 11.5 1.5 19 12 33 12 33s10.5-14 10.5-21.5C22.5 5.7 17.8 1 12 1z" fill="' + col + '" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="12" cy="11.5" r="4.4" fill="#fff"/></svg>';
    var icon = L.divIcon({ html: html, className: 'sel-pin', iconSize: [30, 42], iconAnchor: [15, 40] });
    selPoly = L.marker([d.lat, d.lng], { icon: icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
  }

  var dotLayer = L.layerGroup();
  var krajLayer = null;
  var lastVis = [], krajCounts = {};

  function ptInRing(lng, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function ptInGeom(lng, lat, geom) {
    if (!geom) return false;
    var polys = geom.type === 'MultiPolygon' ? geom.coordinates : (geom.type === 'Polygon' ? [geom.coordinates] : []);
    for (var p = 0; p < polys.length; p++) {
      var rings = polys[p];
      if (ptInRing(lng, lat, rings[0])) {
        var inHole = false;
        for (var h = 1; h < rings.length; h++) { if (ptInRing(lng, lat, rings[h])) { inHole = true; break; } }
        if (!inHole) return true;
      }
    }
    return false;
  }

  function obalkaGeom(geom) {
    var polys = (geom && geom.type === 'MultiPolygon') ? geom.coordinates
      : ((geom && geom.type === 'Polygon') ? [geom.coordinates] : []);
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var p = 0; p < polys.length; p++) {
      var ring = polys[p][0] || [];
      for (var i = 0; i < ring.length; i++) {
        var x = ring[i][0], y = ring[i][1];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return [x0, y0, x1, y1];
  }
  function vObalce(lng, lat, o) {
    return !!o && lng >= o[0] && lng <= o[2] && lat >= o[1] && lat <= o[3];
  }
  var KRAJ_OBALKY = null;
  function krajGeoOf(d) {
    if (KRAJE_GEOM) {
      if (!KRAJ_OBALKY) {
        KRAJ_OBALKY = {};
        for (var kk in KRAJE_GEOM) KRAJ_OBALKY[kk] = obalkaGeom(KRAJE_GEOM[kk]);
      }
      for (var k in KRAJE_GEOM) {
        if (!vObalce(d.lng, d.lat, KRAJ_OBALKY[k])) continue;
        if (ptInGeom(d.lng, d.lat, KRAJE_GEOM[k])) return k;
      }
    }
    return krajOf(d);
  }

  DATA.forEach(function (d, i) {
    d._id = i;
    d._gkraj = krajGeoOf(d);
    var st = dotStyle(d); st.interactive = false;
    var m = PkTvar ? new PkTvar([d.lat, d.lng], st) : L.circleMarker([d.lat, d.lng], st);
    m._d = d;
    markers.push(m);
  });

  var podKurzorem = null;
  function zvyrazniTecku(d) {

    mapEl.style.cursor = d ? 'pointer' : '';
    if (podKurzorem === d) return;
    [podKurzorem, d].forEach(function (x) {
      if (!x) return;
      var m = markers[x._id];
      if (!m || !m.setStyle) return;
      var st = dotStyle(x);
      var zvyraz = (x === d);
      m.setStyle({ radius: st.radius * (zvyraz ? 1.55 : 1), weight: st.weight + (zvyraz ? 0.8 : 0) });
    });
    podKurzorem = d;
  }
  if (!(typeof matchMedia === 'function' && matchMedia('(hover: none)').matches)) {
    map.on('mousemove', function (e) {
      if (dotsLocked || (!lastSingles.length && !lastShluky.length)) { zvyrazniTecku(null); return; }
      var cp = e.containerPoint, best = null, bestDist = Infinity;
      for (var i = 0; i < lastSingles.length; i++) {
        var d = lastSingles[i];
        if (selectedKraj && d._gkraj !== selectedKraj) continue;
        var p = map.latLngToContainerPoint([d.lat, d.lng]);
        var dx = p.x - cp.x, dy = p.y - cp.y, dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; best = d; }
      }

      var tol = Math.max(14, DOT_R + 8);
      if (best && bestDist <= tol * tol) { zvyrazniTecku(best); return; }
      zvyrazniTecku(null);

      if (nejblizsiClen(cp, tol)) mapEl.style.cursor = 'pointer';
    });
    map.on('mouseout', function () { zvyrazniTecku(null); });
  }

  function nejblizsiClen(cp, tol) {
    var nej = null, nejDist = tol * tol;
    for (var i = 0; i < lastCleny.length; i++) {
      var c = lastCleny[i];
      if (selectedKraj && c.d._gkraj !== selectedKraj) continue;
      var p = map.latLngToContainerPoint([c.d.lat, c.d.lng]);
      var dx = p.x - cp.x, dy = p.y - cp.y, dist = dx * dx + dy * dy;
      if (dist <= nejDist) { nejDist = dist; nej = c; }
    }
    return nej;
  }

  var krajJustSelected = false;
  map.on('click', function (e) {

    if (vybiramMisto) {
      vybiramMisto = false;
      document.body.classList.remove('vybiram-misto');

      enterNearAt({ lat: e.latlng.lat, lng: e.latlng.lng }, false, null, 'seznam');
      return;
    }
    if (krajJustSelected) { krajJustSelected = false; return; }

    if (dotsLocked || (!lastSingles.length && !lastShluky.length)) return;
    var cp = e.containerPoint, best = null, bestDist = Infinity;
    for (var i = 0; i < lastSingles.length; i++) {
      var d = lastSingles[i];

      if (selectedKraj && d._gkraj !== selectedKraj) continue;
      var p = map.latLngToContainerPoint([d.lat, d.lng]);
      var dx = p.x - cp.x, dy = p.y - cp.y, dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; best = d; }
    }

    var tol = Math.max(30, DOT_R + 26);
    if (best && bestDist <= tol * tol) { gotoInzerat(best); return; }

    var clen = nejblizsiClen(cp, tol);
    if (clen) { otevriShluk(clen.s); return; }

    var cil = best, cilDist = bestDist;
    for (var ci2 = 0; ci2 < lastCleny.length; ci2++) {
      var c2 = lastCleny[ci2];
      if (selectedKraj && c2.d._gkraj !== selectedKraj) continue;
      var pc = map.latLngToContainerPoint([c2.d.lat, c2.d.lng]);
      var cdx = pc.x - cp.x, cdy = pc.y - cp.y, cd = cdx * cdx + cdy * cdy;
      if (cd < cilDist) { cilDist = cd; cil = c2.d; }
    }
    if (!cil) return;
    var okoli = Math.max(90, tol * 2.4);
    if (cilDist > okoli * okoli) return;
    var z = map.getZoom();
    if (z >= 15) return;
    map.setView([cil.lat, cil.lng], Math.min(15, z + 2), { animate: true });
  });

  var krajByName = {};

  var isTouch = (typeof matchMedia === 'function' && matchMedia('(hover: none)').matches) || ('ontouchstart' in window);

  function krajKrytí(k) {
    var o = krajCounts[k];
    var n = o ? o.total : 0;
    if (!n) return 0.015;
    var max = 0;
    for (var x in krajCounts) if (krajCounts[x].total > max) max = krajCounts[x].total;
    if (max <= 0) return 0.015;
    return 0.03 + 0.14 * Math.sqrt(n / max);
  }
  function styleKraj(k) {
    return { color: 'rgba(31,81,56,0.5)', weight: 1.4, fill: true,
      fillColor: '#0F5C3B', fillOpacity: krajKrytí(k) };
  }

  function postavMasku() {
    if (!KRAJE_GEOM || !L.polygon) return null;
    var diry = [];
    Object.keys(KRAJE_GEOM).forEach(function (k) {
      var g = KRAJE_GEOM[k];
      if (!g || !g.coordinates) return;
      var ringy = g.type === 'Polygon' ? g.coordinates : [].concat.apply([], g.coordinates);
      ringy.forEach(function (r) {
        if (r && r.length > 2) diry.push(r.map(function (b) { return [b[1], b[0]]; }));
      });
    });
    if (!diry.length) return null;

    var svet = [[-89, -179.9], [-89, 179.9], [89, 179.9], [89, -179.9]];
    return L.polygon([svet].concat(diry), {

      stroke: false, fill: true, fillColor: '#12241A', fillOpacity: 0.18,
      fillRule: 'evenodd', interactive: false, className: 'pk-maska'
    });
  }
  var maska = postavMasku();
  if (maska) maska.addTo(map);

  if (KRAJE_GEOM) {
    var feats = Object.keys(KRAJE_GEOM).map(function (k) { return { type: 'Feature', properties: { kraj: k }, geometry: KRAJE_GEOM[k] }; });
    krajLayer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      style: function (f) { return styleKraj(f.properties.kraj); },
      onEachFeature: function (f, layer) {
        krajByName[f.properties.kraj] = layer;
        layer.bindTooltip(krajTitul(f.properties.kraj), { sticky: true, direction: 'top', className: 'kraj-tip' });
        layer.on('click', function () {
          if (selectedKraj !== f.properties.kraj) krajJustSelected = true;
          selectKraj(f.properties.kraj);
        });
        layer.on('mouseover', function () { if (selectedKraj !== f.properties.kraj) { layer.setStyle({ weight: 2.4, color: '#0F5C3B', fillColor: '#0F5C3B', fillOpacity: krajKrytí(f.properties.kraj) + 0.09 }); layer.bringToFront(); } });
        layer.on('mouseout', function () { prekresliKraje(); });

        layer.on('tooltipopen', function (e) {
          if (!isTouch) return;
          var tip = e.tooltip;
          clearTimeout(layer._tipTimer);
          layer._tipTimer = setTimeout(function () {
            var c = tip && (tip.getElement ? tip.getElement() : tip._container);
            if (c) { c.style.transition = 'opacity .45s ease'; c.style.opacity = '0'; }
            setTimeout(function () { layer.closeTooltip(); prekresliKraje(); }, 470);
          }, 2000);
        });
        layer.on('tooltipclose', function () { clearTimeout(layer._tipTimer); });
      }
    });
  }

  function plPozemek(n) { return n === 1 ? 'pozemek' : (n >= 2 && n <= 4 ? 'pozemky' : 'pozemků'); }

  function esc(x) {
    return String(x == null ? '' : x)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function krajTitul(k) { return k === 'Praha' ? 'Praha' : (k === 'Vysočina' ? 'Kraj Vysočina' : k + ' kraj'); }
  function refreshKrajTips(vis) {
    krajCounts = {};
    vis.forEach(function (d) { var k = d._gkraj; if (!k) return; var o = krajCounts[k] || (krajCounts[k] = { total: 0 }); o.total++; o[d.type] = (o[d.type] || 0) + 1; });
    Object.keys(krajByName).forEach(function (k) {
      var o = krajCounts[k];
      var parts = [];
      if (o) ['sale', 'drazba', 'exekuce', 'obec', 'majitel'].forEach(function (tp) { if (o[tp]) parts.push(o[tp] + '× ' + TYPE[tp].label.toLowerCase()); });
      var txt = '<b>' + krajTitul(k) + '</b><br>' + (o ? o.total + ' ' + plPozemek(o.total) + (parts.length ? ' · ' + parts.join(', ') : '') : 'žádné nabídky');
      krajByName[k].setTooltipContent(txt);
    });
  }

  var SHLUK_OKRUH = 38;
  var SHLUK_MIN = 3;

  var SHLUK_TESNY = 16;
  var SHLUK_TESNY_MIN = 2;
  var shlukLayer = L.layerGroup();
  var lastSingles = [];
  var lastShluky = [];

  var lastCleny = [];

  function hromadky(body, R, MIN) {
    var R2 = R * R, i, j;

    var bunky = new Map();
    var SIR = 1 << 16;
    function kl(x, y) { return Math.floor(x / R) * SIR + Math.floor(y / R); }
    for (i = 0; i < body.length; i++) {
      if (body[i].vzato) continue;
      var k = kl(body[i].x, body[i].y);
      var c = bunky.get(k);
      if (c) c.push(i); else bunky.set(k, [i]);
    }
    var volne = [];
    for (i = 0; i < body.length; i++) if (!body[i].vzato) volne.push(i);

    var okoli = new Map();
    for (var q0 = 0; q0 < volne.length; q0++) {
      var ix0 = volne[q0], b = body[ix0], ven = [];
      var cx = Math.floor(b.x / R), cy = Math.floor(b.y / R);
      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
          var cc = bunky.get((cx + dx) * SIR + (cy + dy));
          if (!cc) continue;
          for (var w = 0; w < cc.length; w++) {
            var o = body[cc[w]];
            var ax = o.x - b.x, ay = o.y - b.y;
            if (ax * ax + ay * ay <= R2) ven.push(cc[w]);
          }
        }
      }
      okoli.set(ix0, ven);
      b.sousedu = ven.length;
    }

    volne.sort(function (a, b2) {
      return body[b2].sousedu - body[a].sousedu || body[a].y - body[b2].y
        || body[a].x - body[b2].x;
    });
    var vysledek = [];
    for (var s = 0; s < volne.length; s++) {
      var ix = volne[s];
      if (body[ix].vzato) continue;
      var vse = okoli.get(ix), cl = [];
      for (j = 0; j < vse.length; j++) if (!body[vse[j]].vzato) cl.push(vse[j]);
      if (cl.length < MIN) continue;
      var sx = 0, sy = 0, cleny = [];
      for (j = 0; j < cl.length; j++) {
        body[cl[j]].vzato = true;
        sx += body[cl[j]].x; sy += body[cl[j]].y;
        cleny.push(body[cl[j]].d);
      }
      vysledek.push({ x: sx / cl.length, y: sy / cl.length, cleny: cleny });
    }
    return vysledek;
  }

  function shlukni(vis) {
    var z = map.getZoom();
    var body = [], i;
    for (i = 0; i < vis.length; i++) {
      var pp = map.project([vis[i].lat, vis[i].lng], z);
      body.push({ d: vis[i], x: pp.x, y: pp.y, vzato: false, sousedu: 0 });
    }
    var hrom = hromadky(body, SHLUK_OKRUH, SHLUK_MIN)
      .concat(hromadky(body, SHLUK_TESNY, SHLUK_TESNY_MIN));
    var shluky = hrom.map(function (h) {
      var stred = map.unproject(L.point(h.x, h.y), z);
      return { lat: stred.lat, lng: stred.lng, cleny: h.cleny };
    });
    var samotne = [];
    for (i = 0; i < body.length; i++) if (!body[i].vzato) samotne.push(body[i].d);
    return { samotne: samotne, shluky: shluky };
  }

  var SHLUK_MENSINA = 0.25;
  function shlukBarva(cleny) {
    var m = {}, n = cleny.length;
    for (var i = 0; i < cleny.length; i++) m[cleny[i].type] = (m[cleny[i].type] || 0) + 1;
    if ((m.exekuce || 0) / n >= SHLUK_MENSINA) return TYPE.exekuce.color;
    if ((m.drazba || 0) / n >= SHLUK_MENSINA) return TYPE.drazba.color;
    var nej = null, nejN = 0;
    for (var t in m) if (m[t] > nejN) { nejN = m[t]; nej = t; }
    return (TYPE[nej] && TYPE[nej].color) || TYPE.sale.color;
  }

  function vyrobShluk(s) {
    var n = s.cleny.length;

    var velikost = n >= 20 ? 38 : (n >= 8 ? 33 : 28);
    var plocha = Math.max(44, velikost);
    var pismo = n >= 100 ? 12 : 13;
    var popis = n + ' ' + plPozemek(n) + ' — přiblížit';
    var ikona = L.divIcon({
      className: 'pk-shluk-obal',
      html: '<span class="pk-shluk" style="--sh:' + shlukBarva(s.cleny) + '; width:' + velikost
        + 'px; height:' + velikost + 'px; font-size:' + pismo + 'px"><b>' + n + '</b></span>',
      iconSize: [plocha, plocha], iconAnchor: [plocha / 2, plocha / 2]
    });
    var mk = L.marker([s.lat, s.lng], { icon: ikona, keyboard: true, title: popis, alt: popis,
      riseOnHover: true, zIndexOffset: 400 });
    mk.on('click', function (e) {
      if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
      otevriShluk(s);
    });
    mk.on('keypress', function (e) {
      if (e.originalEvent && (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ')) otevriShluk(s);
    });
    return mk;
  }

  function krajUzka() { try { return map.getSize().x < 520; } catch (e) { return false; } }
  function krajVelikost(n) {
    var z = n >= 200 ? 42 : (n >= 60 ? 38 : 33);
    return krajUzka() ? Math.round(z * 0.82) : z;
  }

  var KRAJ_POSUN_MAX = 26;
  function rozestrcKraje(zn) {
    if (zn.length < 2) return;
    var b = zn.map(function (k) {
      var p = map.latLngToContainerPoint([k.lat, k.lng]);
      return { x: p.x, y: p.y, x0: p.x, y0: p.y, r: krajVelikost(k.cleny.length) / 2 + 2 };
    });
    for (var it = 0; it < 24; it++) {
      var hnulo = false;
      for (var i = 0; i < b.length; i++) {
        for (var j = i + 1; j < b.length; j++) {
          var dx = b[j].x - b[i].x, dy = b[j].y - b[i].y;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var min = b[i].r + b[j].r;
          if (d >= min) continue;
          var posun = (min - d) / 2, ux = dx / d, uy = dy / d;
          b[i].x -= ux * posun; b[i].y -= uy * posun;
          b[j].x += ux * posun; b[j].y += uy * posun;
          hnulo = true;
        }
      }
      for (var m2 = 0; m2 < b.length; m2++) {
        var ex = b[m2].x - b[m2].x0, ey = b[m2].y - b[m2].y0;
        var ed = Math.sqrt(ex * ex + ey * ey);
        if (ed > KRAJ_POSUN_MAX) {
          b[m2].x = b[m2].x0 + ex / ed * KRAJ_POSUN_MAX;
          b[m2].y = b[m2].y0 + ey / ed * KRAJ_POSUN_MAX;
        }
      }
      if (!hnulo) break;
    }
    for (var q = 0; q < zn.length; q++) {
      var ll = map.containerPointToLatLng(L.point(b[q].x, b[q].y));
      zn[q].lat = ll.lat; zn[q].lng = ll.lng;
    }
  }

  function vyrobKrajovyShluk(nazev, cleny, lat, lng) {
    var n = cleny.length;
    var velikost = krajVelikost(n);
    var plocha = Math.max(48, velikost);
    var pismo = krajUzka() ? 12 : 13;
    var popis = nazev + ' — ' + n + ' ' + plPozemek(n) + ', vybrat kraj';
    var ikona = L.divIcon({
      className: 'pk-shluk-obal pk-shluk-kraj',
      html: '<span class="pk-shluk" style="--sh:' + shlukBarva(cleny) + '; width:' + velikost
        + 'px; height:' + velikost + 'px; font-size:' + pismo + 'px"><b>' + n + '</b></span>',
      iconSize: [plocha, plocha], iconAnchor: [plocha / 2, plocha / 2]
    });
    var mk = L.marker([lat, lng], { icon: ikona, keyboard: true, title: popis, alt: popis,
      riseOnHover: true, zIndexOffset: 400 });
    function vyber(e) {
      if (e && e.originalEvent) L.DomEvent.stop(e.originalEvent);
      selectKraj(nazev);
    }
    mk.on('click', vyber);
    mk.on('keypress', function (e) {
      if (e.originalEvent && (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ')) vyber(e);
    });
    return mk;
  }

  function otevriShluk(s) {
    var z = map.getZoom();
    var b = L.latLngBounds(s.cleny.map(function (d) { return [d.lat, d.lng]; }));
    var cil = z + 2;
    if (b.isValid() && !b.getNorthEast().equals(b.getSouthWest())) {
      try { cil = map.getBoundsZoom(b, false, L.point(40, 40)); } catch (e) { cil = z + 2; }
    }

    cil = Math.max(z + 1, Math.min(16, Math.min(cil, z + 3)));
    map.setView(b.isValid() ? b.getCenter() : L.latLng(s.lat, s.lng), cil, { animate: true });
  }

  function renderDots(vis) {

    prepocitejStupnici(vis);
    if (rezimBarvy === 'cena') resizeDots();
    dotLayer.clearLayers();
    shlukLayer.clearLayers();

    vis.forEach(function (d) { dotLayer.addLayer(markers[d._id]); });

    if (dotsLocked) {
      lastSingles = vis; lastShluky = []; lastCleny = [];
      var podleKraje = {};
      for (var ki = 0; ki < vis.length; ki++) {
        var kd = vis[ki], kk = kd._gkraj || krajOf(kd);
        if (!kk) continue;
        if (!podleKraje[kk]) podleKraje[kk] = [];
        podleKraje[kk].push(kd);
      }

      var znacky = Object.keys(podleKraje).map(function (kn) {
        var cl = podleKraje[kn], sl = 0, sn = 0;
        for (var i = 0; i < cl.length; i++) { sl += cl[i].lat; sn += cl[i].lng; }
        return { kraj: kn, cleny: cl, lat: sl / cl.length, lng: sn / cl.length };
      });
      rozestrcKraje(znacky);
      znacky.forEach(function (z) {
        shlukLayer.addLayer(vyrobKrajovyShluk(z.kraj, z.cleny, z.lat, z.lng));
      });
      if (!map.hasLayer(shlukLayer)) shlukLayer.addTo(map);
      try {

        window.PK_SHLUKY = { krajove: true, shluky: Object.keys(podleKraje).map(function (kn) {
          var t = {};
          for (var q = 0; q < podleKraje[kn].length; q++) {
            var ty = podleKraje[kn][q].type; t[ty] = (t[ty] || 0) + 1;
          }
          return { kraj: kn, n: podleKraje[kn].length, typy: t }; }), samotne: [] };
      } catch (e) {}
      return;
    }

    var klikatelne = selectedKraj
      ? vis.filter(function (d) { return d._gkraj === selectedKraj; })
      : vis;
    var tPred = (window.performance && performance.now) ? performance.now() : 0;
    var v = shlukni(klikatelne);
    var tShluk = tPred ? performance.now() - tPred : -1;

    lastSingles = selectedKraj
      ? v.samotne.concat(vis.filter(function (d) { return d._gkraj !== selectedKraj; }))
      : v.samotne;
    lastShluky = v.shluky;
    lastCleny = [];
    for (var ci = 0; ci < v.shluky.length; ci++) {
      var cs = v.shluky[ci];
      for (var cj = 0; cj < cs.cleny.length; cj++) lastCleny.push({ d: cs.cleny[cj], s: cs });
    }
    v.shluky.forEach(function (s) { shlukLayer.addLayer(vyrobShluk(s)); });
    if (!map.hasLayer(shlukLayer)) shlukLayer.addTo(map);
    try {
      window.PK_SHLUKY = {
        shluky: v.shluky.map(function (x) { return { lat: x.lat, lng: x.lng, n: x.cleny.length }; }),

        samotne: v.samotne.map(function (x) { return { lat: x.lat, lng: x.lng }; }),

        ms: Math.round(tShluk * 10) / 10,
        vstupu: klikatelne.length
      };
    } catch (e) {}
  }

  var kresliZap = false, kresliBody = null, kresliCara = null, vyberVrstva = null;
  var kresliBtn = document.getElementById('map-kresli');

  function vykresliVyber() {
    if (vyberVrstva) { map.removeLayer(vyberVrstva); vyberVrstva = null; }
    if (!vyberTvar) return;
    vyberVrstva = L.polygon(vyberTvar, {
      color: '#C2703A', weight: 2, fillColor: '#C2703A', fillOpacity: 0.08,
      interactive: false, pane: 'shadowPane'
    }).addTo(map);
  }

  var kresliPredtim = null;
  function zapniKresleni(zap) {
    kresliZap = !!zap;
    if (kresliBtn) {
      kresliBtn.setAttribute('aria-pressed', kresliZap ? 'true' : 'false');
      kresliBtn.classList.toggle('on', kresliZap);
    }
    mapEl.classList.toggle('kresli', kresliZap);
    if (kresliZap) {
      if (!kresliPredtim) {
        kresliPredtim = {
          tazeni: map.dragging.enabled(),
          dvojklik: map.doubleClickZoom.enabled(),
          touchAction: mapEl.style.touchAction
        };
      }
      map.dragging.disable();
      map.doubleClickZoom.disable();
    } else if (kresliPredtim) {
      map.dragging[kresliPredtim.tazeni ? 'enable' : 'disable']();
      map.doubleClickZoom[kresliPredtim.dvojklik ? 'enable' : 'disable']();
      mapEl.style.touchAction = kresliPredtim.touchAction;
      kresliPredtim = null;
    }
  }

  function kresliKonec(dokonci) {
    if (kresliCara) { map.removeLayer(kresliCara); kresliCara = null; }
    var body = kresliBody; kresliBody = null;
    zapniKresleni(false);

    if (dokonci && body && body.length >= 3) {
      vyberTvar = body;
      vykresliVyber();
      renderList();
    }
  }

  if (kresliBtn) {
    kresliBtn.addEventListener('click', function () {
      if (vyberTvar) {

        vyberTvar = null; vykresliVyber(); renderList();
        return;
      }
      zapniKresleni(!kresliZap);
    });
  }

  mapEl.addEventListener('pointerdown', function (e) {
    if (!kresliZap) return;
    e.preventDefault();
    try { mapEl.setPointerCapture(e.pointerId); } catch (err) {}
    var r = mapEl.getBoundingClientRect();
    var ll = map.containerPointToLatLng([e.clientX - r.left, e.clientY - r.top]);
    kresliBody = [[ll.lat, ll.lng]];
    kresliCara = L.polyline(kresliBody, { color: '#C2703A', weight: 3, interactive: false }).addTo(map);
  });

  var posledniPx = null;
  mapEl.addEventListener('pointermove', function (e) {
    if (!kresliZap || !kresliBody) return;
    e.preventDefault();
    var r = mapEl.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    if (posledniPx) {
      var dx = x - posledniPx[0], dy = y - posledniPx[1];
      if (dx * dx + dy * dy < 36) return;
    }
    posledniPx = [x, y];
    var ll = map.containerPointToLatLng([x, y]);
    kresliBody.push([ll.lat, ll.lng]);
    if (kresliCara) kresliCara.setLatLngs(kresliBody);
  });

  function kresliPusteni(e) {
    if (!kresliZap || !kresliBody) return;
    posledniPx = null;
    kresliKonec(true);
  }
  mapEl.addEventListener('pointerup', kresliPusteni);

  mapEl.addEventListener('pointercancel', function () { posledniPx = null; kresliKonec(true); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (kresliBody) { posledniPx = null; kresliKonec(false); }
    else if (kresliZap) zapniKresleni(false);
  });

  try {
    window.PK_VYBER = {
      nastav: function (body) { vyberTvar = (body && body.length >= 3) ? body : null; vykresliVyber(); renderList(); },
      ctiPocet: function () { return vyberTvar ? vyberTvar.length : 0; },
      kresliZap: function () { return kresliZap; }
    };
  } catch (e) {}

  var vrstvyBtn = document.getElementById('map-vrstvy');
  var vrstvyPanel = document.getElementById('map-vrstvy-panel');
  var vrstvyZive = {};
  var vrstvyNacteno = false;
  var VRSTVY_OD_ZOOMU = 10;

  function vrstvyViditelnost() {
    if (!vrstvyBtn) return;
    var jde = map.getZoom() >= VRSTVY_OD_ZOOMU;
    vrstvyBtn.hidden = !jde;
    if (!jde && vrstvyPanel) {
      vrstvyPanel.hidden = true;
      vrstvyBtn.setAttribute('aria-pressed', 'false');
    }
  }

  function vrstvyPrepinac(zapis) {
    var def = zapis.def;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mv-v';
    b.setAttribute('data-id', def.id);
    b.setAttribute('aria-pressed', 'false');
    b.textContent = def.nazev;
    b.title = def.popis || '';
    b.addEventListener('click', function () {
      if (vrstvyZive[def.id]) {
        map.removeLayer(vrstvyZive[def.id]);
        delete vrstvyZive[def.id];
        b.classList.remove('on');
        b.setAttribute('aria-pressed', 'false');
      } else {
        var v = window.PK_VRSTVY.leafletVrstva(zapis, L);
        if (!v) return;
        v.addTo(map);

        if (v.bringToBack) v.bringToBack();
        vrstvyZive[def.id] = v;
        b.classList.add('on');
        b.setAttribute('aria-pressed', 'true');
      }
    });
    if (vrstvyPanel) vrstvyPanel.appendChild(b);
  }

  if (vrstvyBtn && vrstvyPanel) {
    vrstvyBtn.addEventListener('click', function () {
      var otevreno = vrstvyBtn.getAttribute('aria-pressed') === 'true';
      vrstvyBtn.setAttribute('aria-pressed', otevreno ? 'false' : 'true');
      vrstvyPanel.hidden = otevreno;
      if (otevreno || vrstvyNacteno) return;
      vrstvyNacteno = true;
      if (!window.PK_VRSTVY) { vrstvyPanel.textContent = 'Vrstvy se nepodařilo načíst.'; return; }
      vrstvyPanel.textContent = 'Zkouším, které vrstvy odpovídají…';
      var s2 = map.getCenter();
      var prvni = true;
      window.PK_VRSTVY.pripravene({ lat: s2.lat, lng: s2.lng }, function (zapis) {
        if (prvni) { vrstvyPanel.textContent = ''; prvni = false; }
        vrstvyPrepinac(zapis);
      }).then(function (vse) {

        if (!vse || !vse.length) {
          vrstvyPanel.textContent = 'Vrstvy úřadů teď neodpovídají. Mapa i tak funguje.';
        }
      }).catch(function () {
        vrstvyPanel.textContent = 'Vrstvy úřadů teď neodpovídají. Mapa i tak funguje.';
      });
    });
    map.on('zoomend', vrstvyViditelnost);
    vrstvyViditelnost();
  }

  function updateMapView() {
    if (krajLayer && !map.hasLayer(krajLayer)) krajLayer.addTo(map);
    renderDots(lastVis);
    if (!map.hasLayer(dotLayer)) dotLayer.addTo(map);
    if (krajLayer) krajLayer.bringToBack();

    if (maska && map.hasLayer(maska)) maska.bringToBack();
  }
  function syncMarkers(visIds) {
    lastVis = visIds.map(function (id) { return DATA[id]; });
    refreshKrajTips(lastVis);
    updateMapView();
    if (typeof updateKrajHead === 'function') updateKrajHead();
  }

  var czBounds = L.latLngBounds(DATA.map(function (d) { return [d.lat, d.lng]; }));
  function fitAllCZ() { if (czBounds.isValid()) map.fitBounds(czBounds, { padding: [12, 12], maxZoom: 9 }); }
  fitAllCZ();

  var selectedKraj = null;
  var nearMode = false, userPos = null, userMarker = null, nearCircle = null;
  var krajHintEl = document.getElementById('kraj-hint');
  var krajHeadEl = document.getElementById('kraj-head');
  var nearBtn = document.getElementById('map-near');

  function scrollToMap() {
    if (!holderEl) return;
    try {
      var hd = document.querySelector('header');
      var vys = hd ? hd.getBoundingClientRect().height : 0;
      var cil = holderEl.getBoundingClientRect().top + window.pageYOffset - vys - 10;
      window.scrollTo({ top: Math.max(0, cil), behavior: 'smooth' });
    } catch (e) {
      try { holderEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e2) {}
    }
  }

  if (nearBtn) nearBtn.addEventListener('click', function () { otevriVyberMista(); });

  function kmFromUser(d) {
    return userPos ? kmOd(userPos, d) : Infinity;
  }

  function styleSelectedKraj(layer) { layer.setStyle({ weight: 2.6, color: '#2E42B4', fillColor: '#0F5C3B', fillOpacity: 0.07 }); layer.bringToFront(); }

  function styleKrajMimo() { return { color: 'rgba(30,38,66,0.16)', weight: 1, fill: true, fillColor: '#F4F2ED', fillOpacity: 0.42 }; }

  function prekresliKraje() {
    if (!krajLayer) return;
    krajLayer.eachLayer(function (l) {
      var k = l.feature && l.feature.properties && l.feature.properties.kraj;
      if (selectedKraj && k === selectedKraj) styleSelectedKraj(l);
      else l.setStyle(selectedKraj ? styleKrajMimo() : styleKraj(k));
    });
  }

  var dotsLocked = true;
  function lockDots(lock) {
    var zmena = dotsLocked !== lock;
    dotsLocked = lock;
    mapEl.classList.toggle('kraj-lock', lock);

    if (zmena && typeof renderDots === 'function' && lastVis) renderDots(lastVis);
  }
  var BACK_BTN = '<button class="kh-back" type="button" aria-label="Zpět"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>';
  function updateKrajHead() {
    if (krajHeadEl) {
      if (okoliAktivni()) {

        var km = mojeMisto.km || 10;
        var vOkruhu = DATA.filter(function (d) { return kmOd(mojeMisto, d) <= km; }).length;

        var kde = mojeMisto.nazev ? ('Vaše okolí · ' + mojeMisto.nazev) : 'Vaše okolí';
        var sub = vOkruhu
          ? ('do ' + km + ' km · ' + vOkruhu + ' ' + plPozemek(vOkruhu))
          : ('do ' + km + ' km tu nic není — zkuste větší okruh');
        if (mojeMisto.pribl) sub += ' · poloha přibližná';
        krajHeadEl.innerHTML = BACK_BTN + '<div class="kh-txt"><b>' + esc(kde) + '</b><span>' + sub + '</span></div>';
        krajHeadEl.hidden = false;
        var b0 = krajHeadEl.querySelector('.kh-back');
        if (b0) { b0.setAttribute('aria-label', 'Zpět na celou ČR'); b0.addEventListener('click', vypniOkoli); }
      } else if (!selectedKraj) {
        krajHeadEl.hidden = true;
      } else {
        var o = krajCounts[selectedKraj];
        var n = o ? o.total : 0;
        krajHeadEl.innerHTML = BACK_BTN + '<div class="kh-txt"><b>' + krajTitul(selectedKraj) + '</b><span>' + (n ? (n + ' ' + plPozemek(n) + ' · vyberte ze seznamu') : 'zatím žádné nabídky') + '</span></div>';
        krajHeadEl.hidden = false;
        var b1 = krajHeadEl.querySelector('.kh-back'); if (b1) b1.addEventListener('click', clearKraj);
      }
    }
    if (krajHintEl) krajHintEl.hidden = !!(selectedKraj || okoliAktivni());
  }
  function clearNear() {
    if (!nearMode) return;
    nearMode = false;
    if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    if (nearCircle) { map.removeLayer(nearCircle); nearCircle = null; }
    if (nearBtn) nearBtn.classList.remove('on');
  }
  function selectKraj(k, skipFit) {
    if (selectedKraj === k && !nearMode) return;
    clearNear();
    selectedKraj = k;
    prekresliKraje();
    resizeDots();
    var layer = krajByName[k];
    if (layer) {

      if (!skipFit) map.fitBounds(layer.getBounds(), { maxZoom: 8, padding: [24, 24] });
    }
    setPan(true);
    lockDots(false);
    updateKrajHead();
    renderList();
  }
  function clearKraj() {
    selectedKraj = null;
    var wasNear = nearMode;
    clearNear();
    if (wasNear) { sortMode = 'demand'; if (sortEl) sortEl.value = 'demand'; }
    prekresliKraje();
    resizeDots();
    zrusVyberNaMape();
    lockDots(true);
    setPan(false);
    fitAllCZ();
    updateKrajHead();
    renderList();
  }

  function ukazSeznam() {
    var prep = document.querySelector('.mv-toggle .mvt-btn[data-mv="seznam"]');
    if (prep && prep.offsetParent !== null) prep.click();
    var cil = document.querySelector('.map-side') || document.getElementById('opp-list');
    if (!cil) return;
    setTimeout(function () {
      try {
        var hd = document.querySelector('header');
        var vys = hd ? hd.getBoundingClientRect().height : 0;
        window.scrollTo({ top: Math.max(0, cil.getBoundingClientRect().top + window.pageYOffset - vys - 10), behavior: 'smooth' });
      } catch (e) {}
    }, 90);
  }
  function enterNearAt(pos, approx, nazev, cil) {
    userPos = { lat: pos.lat, lng: pos.lng };
    var km = (mojeMisto && mojeMisto.km) || 10;

    ulozMisto({ lat: pos.lat, lng: pos.lng, km: km,
      nazev: nazev || najdiNazevMista(pos.lat, pos.lng), pribl: !!approx });
    okoliZap = true;
    selectedKraj = null;
    krajFiltr = 'all';
    prekresliKraje();
    resizeDots();
    nearMode = true;
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([userPos.lat, userPos.lng], { icon: L.divIcon({ className: 'pk-me-wrap' + (approx ? ' approx' : ''), html: '<span class="pk-me"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000, interactive: false }).addTo(map);
    vykresliMisto();
    lockDots(false);
    setPan(true);
    if (nearBtn) nearBtn.classList.add('on');
    sortMode = 'near';
    if (sortEl) sortEl.value = 'near';
    ramujMisto();
    if (cil === 'seznam') ukazSeznam();
    else if (typeof scrollToMap === 'function') scrollToMap();
    updateKrajHead();
    renderList();

    if (mistoPruh && cil !== 'seznam') setTimeout(function () {
      try { mistoPruh.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }, 420);
    var kolik = DATA.filter(function (d) { return kmOd(mojeMisto, d) <= km; }).length;
    showToast(kolik
      ? ('V okolí do ' + km + ' km ' + (kolik === 1 ? 'je 1 pozemek' : (kolik < 5 ? 'jsou ' + kolik + ' pozemky' : 'je ' + kolik + ' pozemků')) + '.')
      : ('Do ' + km + ' km tu zatím nic není — zkuste větší okruh.'));
  }

  function vypniOkoli() {
    okoliZap = false;
    nearMode = false;
    if (nearBtn) nearBtn.classList.remove('on');
    if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    sortMode = 'demand';
    if (sortEl) sortEl.value = 'demand';
    vykresliMisto();
    updateKrajHead();
    renderList();
  }

  function normTxt(s) { return HL.norm(s); }
  function geocodeTownLocal(q) {
    var n = normTxt(q); if (n.length < 2) return null;
    var m = HL.misto ? HL.misto(DATA, q) : null;
    if (m) return { lat: m.lat, lng: m.lng };
    for (var kn in KRAJE) { if (normTxt(kn).indexOf(n) >= 0) return { lat: KRAJE[kn].c[0], lng: KRAJE[kn].c[1] }; }
    return null;
  }

  var LOC_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  function otevriVyberMista(nast) {
    nast = nast || {};
    var start = nast.start || (mojeMisto && isFinite(mojeMisto.lat) ? mojeMisto : null);
    var km = (mojeMisto && mojeMisto.km) || 10;
    var zoomStart = 11;

    if (!start && selectedKraj) {
      try {
        var mc = map.getCenter();
        start = { lat: mc.lat, lng: mc.lng };
        zoomStart = Math.max(map.getZoom(), 9);
      } catch (e) { start = null; }
    }
    if (!start) { start = { lat: 49.82, lng: 15.47 }; zoomStart = 7; }

    var vybranoMisto = !!(nast.start || (mojeMisto && isFinite(mojeMisto.lat)));

    var ov = document.createElement('div');
    ov.className = 'vm-ov';
    ov.innerHTML =
      '<div class="vm-panel" role="dialog" aria-modal="true" aria-label="Vyberte místo, jehož okolí chcete sledovat">' +
        '<div class="vm-hlava">' +
          '<b>Vyberte své okolí' +
            (nast.duvod ? '<span class="vm-duvod">' + esc(nast.duvod) + '</span>' : '') +
          '</b>' +
          '<button class="vm-x" type="button" aria-label="Zavřít">✕</button>' +
        '</div>' +

        '<div class="vm-hledani">' +
          '<label class="vm-pole">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/>' +
              '<path d="m20 20-3.5-3.5"/></svg>' +
            '<span class="visually-hidden">Napište obec nebo okres</span>' +
            '<input type="search" id="vm-q" autocomplete="off" enterkeyhint="search"' +
              ' placeholder="Napište obec nebo okres" role="combobox"' +
              ' aria-expanded="false" aria-controls="vm-navrhy" aria-autocomplete="list">' +
          '</label>' +
          '<button class="vm-gps" id="vm-gps" type="button">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/>' +
              '<circle cx="12" cy="12" r="2.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>' +
            '<span>Moje poloha</span></button>' +
          '<ul class="vm-navrhy" id="vm-navrhy" role="listbox" hidden></ul>' +
        '</div>' +

        '<div class="vm-mapa-obal">' +
          '<div class="vm-mapa" id="vm-mapa"></div>' +

          '<button class="vm-zpet" id="vm-zpet" type="button" hidden>' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/>' +
            '<path d="M20 20l-3.6-3.6M11 8.2v5.6M8.2 11h5.6"/></svg>' +
            'Ukázat okruh</button>' +
        '</div>' +
        '<div class="vm-pata">' +
          '<fieldset class="vm-okruh"><legend>Okruh od vybraného místa</legend>' +
            '<span class="vm-okruh-p" aria-hidden="true">Okruh</span>' +
            [2, 5, 10, 20, 50].map(function (v) {
              return '<label class="vm-km"><input type="radio" name="vm-km" value="' + v + '"' +
                (v === km ? ' checked' : '') + '><span>' + v + ' km</span></label>';
            }).join('') +
          '</fieldset>' +
          '<div class="vm-pocet" id="vm-pocet" aria-live="polite"></div>' +
          '<button class="vm-ok" type="button" id="vm-ok">Zobrazit pozemky</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('vm-otevreno');

    var m = L.map(ov.querySelector('#vm-mapa'), {
      zoomControl: false, attributionControl: false, preferCanvas: true,
    }).setView([start.lat, start.lng], zoomStart);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Přiblížit', zoomOutTitle: 'Oddálit' }).addTo(m);

    try { window.PK_VM_MAPA = m; } catch (e) {}

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc', maxZoom: 18, className: 'pk-basemap'
    }).addTo(m);

    if (KRAJE_GEOM) {
      L.geoJSON({ type: 'FeatureCollection', features: Object.keys(KRAJE_GEOM).map(function (k) {
        return { type: 'Feature', properties: { kraj: k }, geometry: KRAJE_GEOM[k] };
      }) }, { interactive: false, renderer: L.svg(),
        style: function () { return { color: '#0F5C3B', weight: 1, opacity: 0.38, fill: false }; } }).addTo(m);
    }

    var vrstvaTecek = L.layerGroup().addTo(m);
    DATA.forEach(function (d) {
      if (!isFinite(d.lat) || !isFinite(d.lng)) return;
      if (!visibleBezOkoli(d)) return;
      vrstvaTecek.addLayer(L.circleMarker([d.lat, d.lng], {
        radius: 2.6, weight: 0, fillColor: TYPE[d.type] ? TYPE[d.type].color : '#4361B8',
        fillOpacity: 0.55, interactive: false
      }));
    });

    var kruh = L.circle([start.lat, start.lng], {
      radius: km * 1000, renderer: L.svg(), color: '#8A5512', weight: 3, opacity: 1,
      dashArray: '9 6', fillColor: '#8A5512', fillOpacity: 0.12, interactive: false
    }).addTo(m);

    var vybraneMisto = { lat: start.lat, lng: start.lng };

    var VM_PIN = '<svg viewBox="-14 -36 28 38" width="28" height="38" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M0 0C-7 -12 -12 -18 -12 -25 A12 12 0 1 1 12 -25 C12 -18 7 -12 0 0Z" fill="#8A5512"' +
      ' stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><circle cx="0" cy="-25" r="4.6" fill="#fff"/></svg>';
    var znacka = L.marker([start.lat, start.lng], {

      draggable: true, autoPan: false,
      keyboard: false, zIndexOffset: 800,
      icon: L.divIcon({ className: 'vm-znacka', html: '<span>' + VM_PIN + '</span>', iconSize: [28, 38], iconAnchor: [14, 38] })
    }).addTo(m);

    var meritko = L.polyline([[start.lat, start.lng], [start.lat, start.lng]], {
      renderer: L.svg(), color: '#8A5512', weight: 2.5, opacity: 0.95, interactive: false
    }).addTo(m);
    var stitek = L.marker([start.lat, start.lng], {
      interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'vm-meritko', html: '<span></span>', iconSize: [0, 0] })
    }).addTo(m);
    function vykresliMeritko(c, k) {

      var dLng = k / (111.320 * Math.cos(c.lat * Math.PI / 180));
      meritko.setLatLngs([[c.lat, c.lng], [c.lat, c.lng + dLng]]);

      stitek.setLatLng([c.lat, c.lng + dLng]);
      var el = stitek.getElement();
      if (el) el.firstChild.textContent = k + '\u00a0km';
    }

    function hlidejVidet() {
      var btn = ov.querySelector('#vm-zpet');
      var el = stitek.getElement();
      if (!vybranoMisto) {
        if (btn) btn.hidden = true;
        if (el) el.style.visibility = 'hidden';
        return;
      }
      var c = stred();
      if (btn) btn.hidden = okruhSeVejde(c.lat, c.lng);

      var tecka = okruhJeTecka(c.lat, c.lng);
      if (el) el.style.visibility = tecka ? 'hidden' : '';

      kruh.setStyle(tecka ? { opacity: 0, fillOpacity: 0 } : { opacity: 1, fillOpacity: 0.12 });
      meritko.setStyle({ opacity: tecka ? 0 : 0.95 });
    }

    var pocetEl = ov.querySelector('#vm-pocet');

    var kmVstupy = [].slice.call(ov.querySelectorAll('input[name="vm-km"]'));
    var kmSel = {
      get value() {
        for (var i = 0; i < kmVstupy.length; i++) if (kmVstupy[i].checked) return kmVstupy[i].value;
        return '10';
      }
    };
    function stred() { return { lat: vybraneMisto.lat, lng: vybraneMisto.lng }; }
    function nastavMisto(lat, lng) {
      vybraneMisto = { lat: lat, lng: lng };
      znacka.setLatLng([lat, lng]);
    }

    function ramecOkruhu(lat, lng, volnost) {
      var k = parseInt(kmSel.value, 10) || 10;

      return L.latLng(lat, lng).toBounds(k * 2000 * 1.35 * (volnost || 1));
    }
    function jdiNa(lat, lng, animovat, volnost) {
      m.fitBounds(ramecOkruhu(lat, lng, volnost), { animate: animovat !== false });
    }

    var qEl = ov.querySelector('#vm-q');
    var navrhyEl = ov.querySelector('#vm-navrhy');
    var gpsEl = ov.querySelector('#vm-gps');
    var navrhy = [];
    var kurzor = -1;

    function mistaZDat() {
      var mapa = Object.create(null);
      for (var i = 0; i < DATA.length; i++) {
        var d = DATA[i];
        if (!d || !isFinite(d.lat) || !isFinite(d.lng) || !d.place) continue;
        var k = d.place + '|' + (d.okres || '');
        if (!mapa[k]) mapa[k] = { misto: d.place, okres: d.okres || '', pocet: 0, lat: [], lng: [] };
        mapa[k].pocet++;
        mapa[k].lat.push(d.lat); mapa[k].lng.push(d.lng);
      }

      return Object.keys(mapa).map(function (k) {
        var x = mapa[k];
        x.lat.sort(function (a, b) { return a - b; });
        x.lng.sort(function (a, b) { return a - b; });
        var p = (x.lat.length - 1) / 2;
        var lo = Math.floor(p), hi = Math.ceil(p);
        return { misto: x.misto, okres: x.okres, pocet: x.pocet,
                 lat: (x.lat[lo] + x.lat[hi]) / 2, lng: (x.lng[lo] + x.lng[hi]) / 2 };
      });
    }
    var MISTA = mistaZDat();

    function schovejNavrhy() {
      navrhy = []; kurzor = -1;
      navrhyEl.hidden = true; navrhyEl.innerHTML = '';
      qEl.setAttribute('aria-expanded', 'false');
    }

    function ukazNavrhy(text) {
      var n = String(text || '').trim();
      if (n.length < 2) return schovejNavrhy();
      var hledane = HL.norm(n);
      navrhy = MISTA.filter(function (x) {
        return HL.norm(x.misto).indexOf(hledane) === 0
            || HL.norm(x.misto + ' ' + x.okres).indexOf(hledane) >= 0;
      })

        .sort(function (a, b) { return b.pocet - a.pocet; })
        .slice(0, 6);
      if (!navrhy.length) return schovejNavrhy();
      navrhyEl.innerHTML = navrhy.map(function (x, i) {
        return '<li role="option" id="vm-n' + i + '" aria-selected="false">' +
          '<b>' + esc(x.misto) + '</b>' +
          (x.okres ? '<span>okres ' + esc(x.okres) + '</span>' : '') +
          '<i>' + x.pocet + '</i></li>';
      }).join('');
      navrhyEl.hidden = false;
      qEl.setAttribute('aria-expanded', 'true');
      kurzor = -1;
    }

    function vyberNavrh(i) {
      var x = navrhy[i];
      if (!x) return;
      var souradnice = { lat: x.lat, lng: x.lng };
      if (!isFinite(souradnice.lat) || !isFinite(souradnice.lng)) return;
      qEl.value = x.misto;
      schovejNavrhy();
      vybranoMisto = true;
      nastavMisto(souradnice.lat, souradnice.lng);
      jdiNa(souradnice.lat, souradnice.lng);
      prepocti();

      try { qEl.blur(); } catch (e) {}
    }

    qEl.addEventListener('input', function () { ukazNavrhy(qEl.value); });
    qEl.addEventListener('keydown', function (e) {
      if (navrhyEl.hidden) {
        if (e.key === 'Enter') { e.preventDefault(); ukazNavrhy(qEl.value); }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        kurzor += (e.key === 'ArrowDown' ? 1 : -1);
        if (kurzor < 0) kurzor = navrhy.length - 1;
        if (kurzor >= navrhy.length) kurzor = 0;
        [].forEach.call(navrhyEl.children, function (li, i) {
          li.setAttribute('aria-selected', String(i === kurzor));
        });
        qEl.setAttribute('aria-activedescendant', 'vm-n' + kurzor);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        vyberNavrh(kurzor >= 0 ? kurzor : 0);
      } else if (e.key === 'Escape') {
        schovejNavrhy();
      }
    });
    navrhyEl.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('li') : null;
      if (!li) return;
      vyberNavrh([].indexOf.call(navrhyEl.children, li));
    });

    gpsEl.addEventListener('click', function () {
      if (!navigator.geolocation) return;
      gpsEl.disabled = true;
      navigator.geolocation.getCurrentPosition(function (p) {
        gpsEl.disabled = false;
        vybranoMisto = true;
        nastavMisto(p.coords.latitude, p.coords.longitude);
        jdiNa(p.coords.latitude, p.coords.longitude);
        prepocti();
      }, function (err) {
        gpsEl.disabled = false;

        if (pocetEl) {
          pocetEl.textContent = (err && err.code === 1)
            ? 'Polohu prohlížeč nedal — je zakázaná. Napište obec, nebo klepněte na mapu.'
            : 'Polohu teď nejde zjistit. Napište obec, nebo klepněte na mapu.';
        }
        try { qEl.focus(); } catch (e) {}
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });

    var NEJMENSI_OKRUH_PX = 28;

    function okruhPx(lat, lng) {
      try {
        var k = parseInt(kmSel.value, 10) || 10;
        var hranice = L.latLng(lat, lng).toBounds(k * 2000);
        var stredPx = m.latLngToContainerPoint(L.latLng(lat, lng));
        var krajPx = m.latLngToContainerPoint(L.latLng(lat, hranice.getEast()));
        return Math.abs(krajPx.x - stredPx.x) * 2;
      } catch (e) { return 0; }
    }
    function okruhPresahuje(lat, lng) {
      try {
        var k = parseInt(kmSel.value, 10) || 10;
        return !m.getBounds().contains(L.latLng(lat, lng).toBounds(k * 2000));
      } catch (e) { return true; }
    }
    function okruhJeTecka(lat, lng) { return okruhPx(lat, lng) < NEJMENSI_OKRUH_PX; }
    function okruhSeVejde(lat, lng) {
      return !okruhPresahuje(lat, lng) && !okruhJeTecka(lat, lng);
    }
    function prepocti() {
      var k = parseInt(kmSel.value, 10) || 10;
      var c = stred();
      kruh.setLatLng([c.lat, c.lng]); kruh.setRadius(k * 1000);
      vykresliMeritko(c, k);

      var meze = kmVstupy.map(function (r) { return parseInt(r.value, 10) || 0; })
        .filter(function (m) { return m > 0; }).sort(function (a2, b2) { return a2 - b2; });
      var n = 0, podle = {}, poOkruzich = {};
      for (var mi = 0; mi < meze.length; mi++) poOkruzich[meze[mi]] = 0;
      for (var i = 0; i < DATA.length; i++) {
        var dd = DATA[i];
        if (!visibleBezOkoli(dd)) continue;
        var vzd = kmOd(c, dd);
        if (vzd <= k) { n++; podle[dd.type] = (podle[dd.type] || 0) + 1; }
        for (var j = 0; j < meze.length; j++) if (vzd <= meze[j]) poOkruzich[meze[j]]++;
      }
      hlidejVidet();
      var obec = najdiNazevMista(c.lat, c.lng);
      var okEl = ov.querySelector('#vm-ok');

      if (!vybranoMisto) {
        pocetEl.innerHTML = '<span class="vm-napred">Klepnutím na mapu — nebo přetažením značky — ukažte, kde to má být.</span>';
        if (okEl) { okEl.disabled = true; okEl.setAttribute('aria-disabled', 'true'); }
        return;
      }
      if (okEl) { okEl.disabled = false; okEl.removeAttribute('aria-disabled'); }

      var rozpad = ['drazba', 'exekuce', 'obec', 'majitel', 'sale']
        .filter(function (t) { return podle[t]; })
        .map(function (t) {
          return '<span class="vm-dr"><i class="vm-tecka" style="background:' +
            (TYPE[t] ? TYPE[t].color : '#4361B8') + '"></i>' + podle[t] + ' ' +
            esc((TYPE[t] ? TYPE[t].label : t).toLowerCase()) + '</span>';
        }).join('');

      var rada = '';
      if (!n) {
        var vetsi = null;
        for (var q = 0; q < meze.length; q++) {
          if (meze[q] > k && poOkruzich[meze[q]] > 0) { vetsi = meze[q]; break; }
        }
        if (vetsi) {
          var pn = poOkruzich[vetsi];

          rada = '<span class="vm-rada"><button type="button" class="vm-vetsi" data-km="' + vetsi + '">' +
            'Zkusit ' + vetsi + ' km — ' + (pn >= 2 && pn <= 4 ? 'jsou tam ' : 'je tam ') +
            pn + ' ' + plPozemek(pn) + '</button></span>';
        } else {
          rada = '<span class="vm-rada">Tady není nic ani v nejširším okruhu — zkuste jiné místo.</span>';
        }
      }
      pocetEl.innerHTML = '<span class="vm-hlavni"><b>' + n + ' ' + plPozemek(n) + '</b>' +
        ' v okruhu ' + k + '\u00a0km' +
        (obec ? ' <span class="vm-obec">u obce ' + esc(obec) + '</span>' : '') + '</span>' + rada +
        (rozpad ? '<span class="vm-rozpad">' + rozpad + '</span>' : '');
    }

    if (typeof ResizeObserver === 'function') {
      try {
        var pata = ov.querySelector('.vm-pata');
        if (pata) new ResizeObserver(function () {
          try { m.invalidateSize({ pan: false }); prepocti(); } catch (e) {}
        }).observe(pata);
      } catch (e) {}
    }

    m.on('zoomend', hlidejVidet);
    ov.querySelector('#vm-zpet').addEventListener('click', function () {
      if (!vybranoMisto) return;
      var c = stred();
      jdiNa(c.lat, c.lng, true);
      hlidejVidet();
    });

    var poslednihoPrepoctu = 0;
    znacka.on('dragstart', function () { vybranoMisto = true; });
    znacka.on('drag', function (e) {
      var pos = e.target.getLatLng();
      vybraneMisto = { lat: pos.lat, lng: pos.lng };
      var ted = Date.now();
      if (ted - poslednihoPrepoctu < 120) {
        kruh.setLatLng(pos);
        vykresliMeritko(vybraneMisto, parseInt(kmSel.value, 10) || 10);
        return;
      }
      poslednihoPrepoctu = ted;
      prepocti();
    });

    znacka.on('dragend', function () {
      poslednihoPrepoctu = 0;
      vybraneMisto = znacka.getLatLng();
      prepocti();
      hlidejVidet();
    });
    m.on('click', function (e) {
      vybranoMisto = true;
      nastavMisto(e.latlng.lat, e.latlng.lng);
      prepocti();

      if (!okruhSeVejde(e.latlng.lat, e.latlng.lng)) jdiNa(e.latlng.lat, e.latlng.lng, false, 3);
    });

    pocetEl.addEventListener('click', function (e) {
      var b4 = e.target && e.target.closest ? e.target.closest('.vm-vetsi') : null;
      if (!b4) return;
      var v = b4.getAttribute('data-km');
      kmVstupy.forEach(function (r) { r.checked = (r.value === v); });
      prepocti();
    });
    kmVstupy.forEach(function (r) {
      r.addEventListener('change', function () {
        prepocti();

      });
    });
    prepocti();

    setTimeout(function () {
      m.invalidateSize();
      if (nast.start || (mojeMisto && isFinite(mojeMisto.lat))) {
        nastavMisto(start.lat, start.lng);
        jdiNa(start.lat, start.lng, false);
      }
      prepocti();
    }, 60);

    var potvrzeno = false;
    function naKlavesu(e) { if (e.key === 'Escape') zavri(); }
    function zavri() {
      try { m.remove(); } catch (e) {}
      try { window.PK_VM_MAPA = null; } catch (e) {}
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      document.body.classList.remove('vm-otevreno');
      document.removeEventListener('keydown', naKlavesu);

      if (!potvrzeno && typeof nast.zruseno === 'function') nast.zruseno();
    }
    document.addEventListener('keydown', naKlavesu);
    ov.querySelector('.vm-x').addEventListener('click', zavri);
    ov.addEventListener('click', function (e) { if (e.target === ov) zavri(); });
    ov.querySelector('#vm-ok').addEventListener('click', function () {
      potvrzeno = true;
      var c = stred();
      var k = parseInt(kmSel.value, 10) || 10;
      if (mojeMisto) mojeMisto.km = k; else mojeMisto = { km: k };
      zavri();
      enterNearAt({ lat: c.lat, lng: c.lng }, false, null, 'seznam');
    });
  }

  function showLocModal(err) {

    var ov = document.createElement('div'); ov.className = 'loc-ov';
    ov.innerHTML =
      '<div class="loc-card" role="dialog" aria-modal="true" aria-label="Kde hledat">' +
        '<button class="loc-x" type="button" aria-label="Zavřít">✕</button>' +
        '<div class="loc-ic">' + LOC_PIN + '</div>' +
        '<h3>Kde hledat?</h3>' +
        '<div style="margin-top:4px;">' +
          '<input type="text" id="loc-town" class="loc-input" inputmode="text" autocomplete="off" autocapitalize="words" ' +
            'placeholder="Napište obec (např. Kolín)">' +
          '<div id="loc-err" class="loc-err" hidden></div>' +
        '</div>' +
        '<div class="loc-btns">' +
          '<button class="loc-btn primary" type="button" data-loc="find">Najít pozemky</button>' +
          '<button class="loc-btn ghost" type="button" data-loc="retry">Použít mou polohu</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    var inp = ov.querySelector('#loc-town');
    var errEl = ov.querySelector('#loc-err');
    function submitTown() {
      var q = inp ? inp.value.trim() : '';
      if (q.length < 2) { if (errEl) { errEl.textContent = 'Napište prosím obec (aspoň 2 písmena).'; errEl.hidden = false; } return; }
      var pos = geocodeTownLocal(q);
      if (!pos) { if (errEl) { errEl.textContent = 'Obec „' + q + '" jsme nenašli. Zkuste blízké větší město nebo okres.'; errEl.hidden = false; } return; }
      close(); scrollToMap(); enterNearAt({ lat: pos.lat, lng: pos.lng }, true);
    }

    var retryBtn = ov.querySelector('[data-loc="retry"]');
    function tryGeoInline() {
      if (!navigator.geolocation) { if (errEl) { errEl.textContent = 'Tento prohlížeč neumí polohu — napište obec výše.'; errEl.hidden = false; } return; }
      if (errEl) errEl.hidden = true;
      if (retryBtn) { retryBtn.textContent = 'Zjišťuji polohu…'; retryBtn.disabled = true; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        close(); scrollToMap(); enterNearAt({ lat: pos.coords.latitude, lng: pos.coords.longitude }, false);
      }, function (er) {
        if (retryBtn) { retryBtn.textContent = 'Použít mou polohu'; retryBtn.disabled = false; }
        if (errEl) {
          errEl.textContent = (er && er.code === 1)
            ? 'Poloha je u tohoto webu vypnutá. Napište prosím obec výše 👆'
            : 'Polohu se teď nepodařilo zjistit. Napište prosím obec výše 👆';
          errEl.hidden = false;
        }
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
    }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('.loc-x')) { close(); return; }
      var b = e.target.closest('[data-loc]'); if (!b) return;
      var act = b.getAttribute('data-loc');
      if (act === 'retry') { tryGeoInline(); return; }
      if (act === 'find') { submitTown(); return; }
    });
    if (inp) {
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); submitTown(); } });
    }
  }

  function fallbackNear(err, nast) {
    nast = nast || {};
    if (typeof L !== 'undefined' && L.map) {
      otevriVyberMista({
        duvod: nast.duvod || 'Polohu se nepodařilo zjistit — ukažte ji na mapě.',
        zruseno: nast.zruseno,
      });
    } else {
      showLocModal(err);
      if (typeof nast.zruseno === 'function') nast.zruseno();
    }
  }

  var cekamNaPolohu = false;
  function stavTlacitka(ceka) {
    cekamNaPolohu = ceka;
    if (!nearBtn) return;
    if (ceka) {
      if (!nearBtn._puvodni) nearBtn._puvodni = nearBtn.innerHTML;
      nearBtn.innerHTML = '<span class="mnb-ceka" aria-hidden="true"></span>Zjišťuji polohu…';
      nearBtn.disabled = true;
      nearBtn.setAttribute('aria-busy', 'true');
    } else {
      if (nearBtn._puvodni) nearBtn.innerHTML = nearBtn._puvodni;
      nearBtn.disabled = false;
      nearBtn.removeAttribute('aria-busy');
    }
  }
  function askGeo(nast) {
    nast = nast || {};
    if (cekamNaPolohu) return;
    stavTlacitka(true);
    var hotovo = false;
    function uspech(pos) {
      if (hotovo) return; hotovo = true;
      stavTlacitka(false);
      enterNearAt({ lat: pos.coords.latitude, lng: pos.coords.longitude }, false);
    }
    function selhalo(err) {
      if (hotovo) return; hotovo = true;
      stavTlacitka(false);
      fallbackNear(err, nast);
    }
    navigator.geolocation.getCurrentPosition(uspech, selhalo,
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 });
  }

  function enterNear(nast) {
    nast = nast || {};
    if (!navigator.geolocation) {
      showLocModal({ code: 2 });
      if (typeof nast.zruseno === 'function') nast.zruseno();
      return;
    }
    askGeo(nast);
  }
  lockDots(true);
  updateKrajHead();

  var legendEl = document.getElementById('map-legend');

  function prekresliLegendu() {
    if (!legendEl) return;
    if (rezimBarvy === 'cena') {
      var kusy = '';
      for (var i = 0; i <= 4; i++) {
        kusy += '<span class="lg-dot" style="background:' + barvaCeny(i / 4) + '"></span>';
      }
      legendEl.innerHTML = '<span class="lg-item">levné ' + kusy + ' drahé</span>'
        + '<span class="lg-item"><span class="lg-dot" style="background:#8A9A92"></span>cena za m² neznámá</span>';
      return;
    }
    var present2 = {};
    DATA.forEach(function (d) { present2[d.type] = true; });
    var urgentN = DATA.filter(isUrgent).length;
    var lh = '';
    ['sale', 'drazba', 'exekuce', 'obec', 'majitel'].forEach(function (tp) {

      if (present2[tp]) lh += '<span class="lg-item"><span class="lg-dot tv-' + (TVAR[tp] || 'kruh') + '" style="background:' + TYPE[tp].color + '"></span>' + TYPE[tp].label + '</span>';
    });
    if (urgentN) lh += '<span class="lg-item lg-urgent"><span class="lg-dot lg-ring"></span>končí do ' + DNI_KONCI + ' dní</span>';
    legendEl.innerHTML = lh;
  }
  prekresliLegendu();

  var barvaBtn = document.getElementById('map-barva');
  if (barvaBtn) {
    barvaBtn.addEventListener('click', function () {
      rezimBarvy = (rezimBarvy === 'cena') ? 'druh' : 'cena';
      barvaBtn.setAttribute('aria-pressed', rezimBarvy === 'cena' ? 'true' : 'false');
      barvaBtn.classList.toggle('on', rezimBarvy === 'cena');
      prekresliStupnici();
      prekresliLegendu();
    });
  }
  function prekresliStupnici() {
    prepocitejStupnici(lastVis && lastVis.length ? lastVis : DATA);
    resizeDots();
    renderDots(lastVis && lastVis.length ? lastVis : DATA);
  }

  try {
    window.PK_BARVY = {
      rezim: function () { return rezimBarvy; },
      prepni: function (r) {
        rezimBarvy = (r === 'cena') ? 'cena' : 'druh';
        if (barvaBtn) {
          barvaBtn.setAttribute('aria-pressed', rezimBarvy === 'cena' ? 'true' : 'false');
          barvaBtn.classList.toggle('on', rezimBarvy === 'cena');
        }
        prekresliStupnici(); prekresliLegendu();
      },
      barvaTecky: function (i) { var m = markers[i]; return m ? dotStyle(m._d).fillColor : null; },

      tecka: function (i) {
        var m = markers[i]; if (!m) return null;
        var zm = (window.PK_CENY && window.PK_CENY.zaMetr) || null;
        return { zaM2: zm ? zm(m._d) : null, barva: dotStyle(m._d).fillColor };
      },
      stupnice: function () { return cenovaStupnice ? cenovaStupnice.length : 0; }
    };
  } catch (e) {}

  map.on('zoomend', function () {
    if (nearMode) return;
    if (map.getZoom() >= 10) { if (dotsLocked) lockDots(false); }
    else if (!selectedKraj) { if (!dotsLocked) lockDots(true); }
  });

  function dotRadiusForZoom() {
    var z = map.getZoom();

    return Math.max(3.6, Math.min(16, 3.6 + (z - 8) * 1.5));
  }
  function resizeDots() {
    var r = dotRadiusForZoom();
    DOT_R = r; DOT_R_SEL = r + 2.6;
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i]; if (!m || !m._d || !m.setRadius) continue;
      if (selMarkerId != null && i === selMarkerId) continue;

      var st2 = dotStyle(m._d);
      if (m.options.radius !== st2.radius) m.setRadius(st2.radius);
      if (m.options.fillOpacity !== st2.fillOpacity || m.options.weight !== st2.weight) {
        m.setStyle({ fillOpacity: st2.fillOpacity, weight: st2.weight, color: st2.color });
      }
    }
  }

  map.on('zoomend', function () { resizeDots(); prekresliRadar(); renderDots(lastVis); });
  resizeDots();

  var radarVrstva = L.layerGroup().addTo(map);
  var radarIkona = L.divIcon({ className: 'pk-radar', html: '<span></span><span></span>',
    iconSize: [26, 26], iconAnchor: [13, 13] });
  function prekresliRadar() {
    radarVrstva.clearLayers();
    for (var i = 0; i < DATA.length; i++) {
      var d = DATA[i];
      if (!isUrgent(d) || !visible(d)) continue;
      if (!isFinite(d.lat) || !isFinite(d.lng)) continue;
      if (selectedKraj && d._gkraj && d._gkraj !== selectedKraj) continue;
      radarVrstva.addLayer(L.marker([d.lat, d.lng], { icon: radarIkona,
        interactive: false, keyboard: false }));
    }
  }

  var SITE_KLICE = ['elektrina', 'voda', 'kanalizace', 'plyn'];

  function podObvyklou(d) {
    var od = MODEL ? MODEL.odhad(d) : null;
    return !!(od && od.podleVelikosti && !od.nejisty && !od.podil && od.podOdhadem >= 15);
  }

  var posledniVyber = [];

  function stahniTabulku() {
    var V = window.PKVyvoz;
    if (!V || !posledniVyber.length) return;
    var text = V.csv(posledniVyber, {
      zaMetr: (window.PK_CENY && window.PK_CENY.zaMetr) || null,
      klic: (window.PKKlic && window.PKKlic.pkey) || null
    });

    var blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = V.nazev(popisVyberu());
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function popisVyberu() {
    var kusy = [];
    try {
      omezeni().forEach(function (o) { if (o && o.popis) kusy.push(o.popis); });
    } catch (e) {}
    return kusy.slice(0, 3).join(' ');
  }

  var vyberTvar = null;

  function visible(d) {
    var okType = activeType === 'all' || d.type === activeType;

    var okSearch = !searchToks.length || HL.vyhovuje(d, searchToks);
    var okMisto = sediMisto(d);

    var okPresne = true;
    if (!ukazPodobne && !mistoFiltr) {
      var _pn = presnyNazev();
      if (_pn) okPresne = jePresna(d, _pn);
    }
    var okDruh = druhVyhovuje(d);
    var okPrice = (!maxPrice || (d.price && d.price <= maxPrice))
      && (!minPrice || (d.price && d.price >= minPrice));
    var okArea = (!minArea || (hasArea(d) && d.area >= minArea))
      && (!maxArea || (hasArea(d) && d.area <= maxArea));

    var okUrgent = !urgentOnly || isUrgent(d);
    var okFav = !favOnly || isFav(d);

    var okVybaveni = true;
    for (var vi = 0; vi < zadaneVybaveni.length; vi++) {
      if (!d.site || d.site.indexOf(zadaneVybaveni[vi]) < 0) { okVybaveni = false; break; }
    }
    var okCelek = !jenCelek || !d.podil;

    var okDotaz = true;
    if (dotazFiltr.druh && !druhSedi(d.druh, dotazFiltr.druh)) okDotaz = false;
    if (okDotaz && dotazFiltr.typ && d.type !== dotazFiltr.typ) okDotaz = false;
    if (okDotaz && dotazFiltr.jenCelek && d.podil) okDotaz = false;
    if (okDotaz && dotazFiltr.site.length) {
      for (var si = 0; si < dotazFiltr.site.length; si++) {
        if (!d.site || d.site.indexOf(dotazFiltr.site[si]) < 0) { okDotaz = false; break; }
      }
    }
    if (okDotaz && dotazFiltr.cenaOd && !(d.price >= dotazFiltr.cenaOd)) okDotaz = false;
    if (okDotaz && dotazFiltr.cenaDo && !(d.price > 0 && d.price <= dotazFiltr.cenaDo)) okDotaz = false;
    if (okDotaz && dotazFiltr.plochaOd && !(hasArea(d) && d.area >= dotazFiltr.plochaOd)) okDotaz = false;
    if (okDotaz && dotazFiltr.plochaDo && !(hasArea(d) && d.area <= dotazFiltr.plochaDo)) okDotaz = false;

    if (okDotaz && dotazFiltr.kraj && (d._gkraj || krajOf(d)) !== dotazFiltr.kraj) okDotaz = false;

    if (okDotaz && (dotazFiltr.zaMetrDo || dotazFiltr.zaMetrOd)) {
      var _zm = zaMetr(d);
      if (_zm == null) okDotaz = false;
      else if (dotazFiltr.zaMetrDo && _zm > dotazFiltr.zaMetrDo) okDotaz = false;
      else if (dotazFiltr.zaMetrOd && _zm < dotazFiltr.zaMetrOd) okDotaz = false;
    }

    if (okDotaz && dotazFiltr.nejakeSite) {
      var _ms = false;
      for (var mi = 0; mi < SITE_KLICE.length; mi++) {
        if (d.site && d.site.indexOf(SITE_KLICE[mi]) >= 0) { _ms = true; break; }
      }
      if (!_ms) okDotaz = false;
    }

    if (okDotaz && dotazFiltr.levne && !podObvyklou(d)) okDotaz = false;

    var _fzm = zaMetr(d);
    var okPerM2 = !maxPerM2 || (_fzm != null && _fzm <= maxPerM2);
    var okKraj = krajFiltr === 'all' || (d._gkraj || krajOf(d)) === krajFiltr;

    var okOkoli = !okoliAktivni() || kmOd(mojeMisto, d) <= (mojeMisto.km || 10);

    var okOkruh = !(dotazFiltr.okruh && okruhStred)
      || kmOd(okruhStred, d) <= dotazFiltr.okruh;
    var okLevne = !levneOnly || podObvyklou(d);

    var okSkryt = ukazSkryte || !jeSkryty(d);
    var okProsle = ukazProsle || !jeProsle(d);

    var okTvar = !vyberTvar || (PKOkruh.vTvaru(d.lat, d.lng, vyberTvar));
    return okType && okSearch && okMisto && okPresne && okDruh && okPrice && okArea && okUrgent && okFav && okSkryt
      && okPerM2 && okKraj && okLevne && okOkoli && okOkruh && okProsle && okVybaveni && okCelek && okDotaz && okTvar;
  }

  function bezVolnehoTextu() {
    var pochopena = {};
    ((dotazFiltr && dotazFiltr.casti) || []).forEach(function (c) {
      (c.slova || []).forEach(function (w) { pochopena[w] = true; });
    });
    return searchEl.value.split(/\s+/).filter(function (w) {
      return w && pochopena[window.PKDotaz ? window.PKDotaz.norm(w) : w.toLowerCase()];
    }).join(' ');
  }

  function omezeni() {
    var d = dotazFiltr;
    var ven = [];

    function pol(nazev, ctvrty, zapnute, vypni, vrat, popis) {
      if (zapnute) ven.push({ nazev: nazev, ctvrty: ctvrty, vypni: vypni, vrat: vrat, popis: popis || '' });
    }
    function rozsahText(od, doo, jed) {
      if (od && doo) return fmt(od) + '–' + fmt(doo) + ' ' + jed;
      if (doo) return 'do ' + fmt(doo) + ' ' + jed;
      if (od) return 'od ' + fmt(od) + ' ' + jed;
      return '';
    }

    pol('hledaný text', 'hledaný text', !!searchToks.length,
      (function () { var mf = mistoFiltr;
        return function () { var t = bezVolnehoTextu(); searchEl.value = t; nastavHledani(t); mistoFiltr = mf; }; }()),
      (function () { var t = searchEl.value, mf = mistoFiltr;
        return function () { searchEl.value = t; nastavHledani(t); mistoFiltr = mf; }; }()));

    pol('vybrané místo', 'vybrané místo', !!mistoFiltr,
      function () { mistoFiltr = null; },
      (function () { var a = mistoFiltr; return function () { mistoFiltr = a; }; }()));

    pol('přesný název', 'přesný název', !ukazPodobne && !mistoFiltr && !!presnyNazev(),
      function () { ukazPodobne = true; },
      (function () { var a = ukazPodobne; return function () { ukazPodobne = a; }; }()));
    pol('druh pozemku', 'druh pozemku', druhVybrane.length > 0 || !!d.druh,
      function () { druhVybrane = []; d.druh = null; },
      (function () { var a = druhVybrane.slice(), b = d.druh; return function () { druhVybrane = a; d.druh = b; }; }()),
      druhVybrane.length ? druhPopis() : '');
    pol('druh nabídky', 'druh nabídky', activeType !== 'all' || !!d.typ,
      function () { activeType = 'all'; d.typ = null; },
      (function () { var a = activeType, b = d.typ; return function () { activeType = a; d.typ = b; }; }()),
      activeType !== 'all' ? ((TYPE[activeType] || {}).label || '') : '');

    var krajAktivni = (krajFiltr !== 'all' && krajFiltr) || selectedKraj || d.kraj || '';
    pol('kraj', 'kraj', !!krajAktivni,
      function () { krajFiltr = 'all'; d.kraj = null; if (selectedKraj) clearKraj(); },
      (function () { var a = krajFiltr, b = d.kraj, c = selectedKraj;
        return function () { krajFiltr = a; d.kraj = b; if (c && !selectedKraj) selectKraj(c, true); }; }()),
      krajAktivni ? (krajAktivni + (krajAktivni === 'Praha' ? '' : ' kraj')) : '');
    pol('cena', 'cenu', !!(maxPrice || minPrice || d.cenaOd || d.cenaDo),
      function () { maxPrice = 0; minPrice = 0; d.cenaOd = null; d.cenaDo = null; },
      (function () { var a = maxPrice, b = minPrice, c = d.cenaOd, e = d.cenaDo;
        return function () { maxPrice = a; minPrice = b; d.cenaOd = c; d.cenaDo = e; }; }()),
      (minPrice || maxPrice) ? 'Cena ' + rozsahText(minPrice, maxPrice, 'Kč') : '');
    pol('výměra', 'výměru', !!(minArea || maxArea || d.plochaOd || d.plochaDo),
      function () { minArea = 0; maxArea = 0; d.plochaOd = null; d.plochaDo = null; },
      (function () { var a = minArea, b = maxArea, c = d.plochaOd, e = d.plochaDo;
        return function () { minArea = a; maxArea = b; d.plochaOd = c; d.plochaDo = e; }; }()),
      (minArea || maxArea) ? 'Výměra ' + rozsahText(minArea, maxArea, 'm²') : '');
    pol('cena za metr', 'cenu za metr', !!(maxPerM2 || d.zaMetrDo || d.zaMetrOd),
      function () { maxPerM2 = 0; d.zaMetrDo = null; d.zaMetrOd = null; if (perm2El) perm2El.value = ''; },
      (function () { var a = maxPerM2, b = d.zaMetrDo, c = d.zaMetrOd;
        return function () { maxPerM2 = a; d.zaMetrDo = b; d.zaMetrOd = c; if (perm2El) perm2El.value = a ? String(a) : ''; }; }()),
      maxPerM2 ? 'do ' + fmt(maxPerM2) + ' Kč/m²' : '');
    pol('vybavení z inzerátu', 'vybavení z inzerátu', !!(zadaneVybaveni.length || d.site.length || d.nejakeSite),
      function () { zadaneVybaveni = []; d.site = []; d.nejakeSite = false; },
      (function () { var a = zadaneVybaveni, b = d.site, c = d.nejakeSite;
        return function () { zadaneVybaveni = a; d.site = b; d.nejakeSite = c; }; }()),
      zadaneVybaveni.map(function (k) {
        return (window.PKVybaveni && window.PKVybaveni.nazev) ? window.PKVybaveni.nazev(k) : k;
      }).join(', '));
    pol('„jen celé pozemky"', '„jen celé pozemky"', jenCelek || d.jenCelek,
      function () { jenCelek = false; d.jenCelek = false; },
      (function () { var a = jenCelek, b = d.jenCelek; return function () { jenCelek = a; d.jenCelek = b; }; }()),
      jenCelek ? 'Jen celé pozemky' : '');
    pol('„pod obvyklou cenou"', '„pod obvyklou cenou"', levneOnly || d.levne,
      function () { levneOnly = false; d.levne = false; },
      (function () { var a = levneOnly, b = d.levne; return function () { levneOnly = a; d.levne = b; }; }()),
      levneOnly ? 'Pod obvyklou cenou' : '');
    pol('blížící se termín', 'blížící se termín', urgentOnly,
      function () { urgentOnly = false; }, (function () { return function () { urgentOnly = true; }; }()),
      'Končí do ' + DNI_KONCI + ' dní');
    pol('„jen uložené"', '„jen uložené"', favOnly,
      function () { favOnly = false; }, (function () { return function () { favOnly = true; }; }()),
      'Jen uložené');
    pol('okolí vašeho místa', 'okolí vašeho místa', okoliZap,
      function () { okoliZap = false; }, (function () { return function () { okoliZap = true; }; }()),
      'Do ' + ((mojeMisto && mojeMisto.km) || 10) + ' km od ' + ((mojeMisto && mojeMisto.nazev) || 'vašeho místa'));

    pol('okruh od místa', 'okruh od místa', !!(d.okruh && okruhStred),
      function () { d.okruh = null; },
      (function () { var a = d.okruh; return function () { d.okruh = a; }; }()));

    pol('nakreslený výběr', 'nakreslený výběr', !!vyberTvar,
      function () { vyberTvar = null; },
      (function () { var a = vyberTvar; return function () { vyberTvar = a; }; }()),
      'Nakreslený výběr na mapě');
    return ven;
  }

  function jeNecoZapnute() { return omezeni().length > 0; }

  function scrollNaVypis() {
    var cil = document.getElementById('map-count') || document.getElementById('opp-list');
    if (!cil) { if (typeof scrollToMap === 'function') scrollToMap(); return; }
    try {
      var hd = document.querySelector('header');
      var vys = hd ? hd.getBoundingClientRect().height : 0;
      var y = cil.getBoundingClientRect().top + window.pageYOffset - vys - 8;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    } catch (e) {
      try { cil.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e2) {}
    }
  }

  var akceHotovo = document.getElementById('mcf-hotovo');
  var akceHotovoT = document.getElementById('mcf-hotovo-t');
  var akceZrusit = document.getElementById('mcf-zrusit');
  function prekresliAkceFiltru(kolik) {
    if (akceHotovoT) {
      akceHotovoT.textContent = kolik > 0
        ? 'Zobrazit ' + fmt(kolik) + ' ' + plPozemek(kolik)
        : 'Nic nenalezeno';
    }
    if (akceHotovo) akceHotovo.disabled = !(kolik > 0);
    if (akceZrusit) akceZrusit.hidden = !jeNecoZapnute();
  }
  if (akceHotovo) akceHotovo.addEventListener('click', function () {
    var panel = document.getElementById('ms-filters');
    if (panel) panel.open = false;

    var tab = document.querySelector('.mvt-btn[data-mv="seznam"]');
    if (tab && !tab.classList.contains('active')) tab.click();
    scrollNaVypis();
  });
  if (akceZrusit) akceZrusit.addEventListener('click', function () {
    resetFilters();
    var panel = document.getElementById('ms-filters');
    if (panel) panel.open = false;
    scrollNaVypis();
  });

  (function zavirani() {
    var panel = document.getElementById('ms-filters');
    if (!panel || !window.matchMedia) return;
    var siroko = window.matchMedia('(min-width:1041px)');
    function vrstva() { return panel.open && siroko.matches; }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !vrstva()) return;
      panel.open = false;
      var sum = panel.querySelector('summary');
      if (sum) sum.focus();
    });
    document.addEventListener('pointerdown', function (e) {
      if (!vrstva() || panel.contains(e.target)) return;
      panel.open = false;
    });
  })();

  function nejvicOmezuje() {
    var kandidati = [];
    omezeni().forEach(function (o) {
      o.vypni();
      var n = 0;
      try { for (var i = 0; i < DATA.length; i++) if (visible(DATA[i])) n++; }
      finally { o.vrat(); }
      if (n > 0) kandidati.push({ nazev: o.nazev, ctvrty: o.ctvrty, n: n, vypni: o.vypni });
    });
    if (!kandidati.length) return null;
    kandidati.sort(function (a, b) { return b.n - a.n; });
    return kandidati[0];
  }

  function visibleBezOkoli(d) {
    var byl = okoliZap; okoliZap = false;
    try { return visible(d); } finally { okoliZap = byl; }
  }

  function visibleBezDruhu(d) {
    var byl = druhVybrane; druhVybrane = [];
    try { return visible(d); } finally { druhVybrane = byl; }
  }

  function zaMetr(d) {
    var C = window.PK_CENY;
    if (!C || !C.zaMetr) return null;
    var v = C.zaMetr(d);
    return v == null ? null : Math.round(v);
  }
  function zaMetrTitul(d) {
    var C = window.PK_CENY;
    var t = C && C.zaMetrPopis ? C.zaMetrPopis(d) : '';
    return t ? ' title="' + t.replace(/"/g, '&quot;') + '"' : '';
  }
  function perM2Val(d){ var v = zaMetr(d); return v == null ? Infinity : v; }

  function mistoRadek(d) {
    var okr = d.okres ? 'okres ' + esc(d.okres) : '';
    if (d.cast) return esc(d.cast) + (okr ? ' · ' + okr : '');

    if (d.place && d.okres && String(d.place).trim() === String(d.okres).trim()) return '';
    return okr;
  }

  function declump(arr){
    if (arr.length < 4) return;
    var pool = arr.slice(), out = [], lastType = null, lastPlace = null, pick;
    while (pool.length){
      pick = -1;
      for (var i = 0; i < pool.length; i++){ if (pool[i].type !== lastType && pool[i].place !== lastPlace){ pick = i; break; } }
      if (pick === -1) for (var j = 0; j < pool.length; j++){ if (pool[j].place !== lastPlace){ pick = j; break; } }
      if (pick === -1) pick = 0;
      var d = pool.splice(pick, 1)[0];
      out.push(d); lastType = d.type; lastPlace = d.place;
    }
    for (var k = 0; k < out.length; k++) arr[k] = out[k];
  }
  function sortVis(arr){
    if (sortMode === 'price_asc') arr.sort(function (a, b) { return a.price - b.price; });
    else if (sortMode === 'price_desc') arr.sort(function (a, b) { return b.price - a.price; });
    else if (sortMode === 'area_desc') arr.sort(function (a, b) { return (b.area || 0) - (a.area || 0); });
    else if (sortMode === 'perm2_asc') arr.sort(function (a, b) { return perM2Val(a) - perM2Val(b); });
    else if (sortMode === 'near' && userPos) arr.sort(function (a, b) { return kmFromUser(a) - kmFromUser(b); });
    else if (sortMode === 'nove') {

      arr.sort(function (a, b) { return String(b.first_seen || '').localeCompare(String(a.first_seen || '')); });
    }
    else if (sortMode === 'area_asc') {

      arr.sort(function (a, b) { return (a.area || Infinity) - (b.area || Infinity); });
    }
    else if (sortMode === 'drazba_asc') {

      arr.sort(function (a, b) {
        var da = daysUntil(a.extra), db = daysUntil(b.extra);
        var pa = (da == null || da < 0) ? Infinity : da;
        var pb = (db == null || db < 0) ? Infinity : db;
        return pa - pb;
      });
    }
    else if (sortMode === 'sleva_desc') {

      var slevaVal = function (d) {
        var o = MODEL ? MODEL.odhad(d) : null;

        return (o && o.podleVelikosti && !o.pochybna && !o.nejisty && !o.podil) ? (o.podOdhadem || 0) : -1;
      };
      arr.sort(function (a, b) { return slevaVal(b) - slevaVal(a); });
    }
    else if (sortMode === 'nahodne') {

      if (window.PKPoradi) window.PKPoradi.nahodne(arr, pkey);
    }
    else {

      if (window.PKPoradi) {
        window.PKPoradi.prostridej(arr, demand, pkey, window.PKPoradi.denIndex(),
          window.PKPoradi.KROK_ZA_DEN, window.PKPoradi.prihozeniSeance());
      }
      else arr.sort(function (a, b) { return demand(b) - demand(a); });
      declump(arr);

      if (window.PKPoradi && window.PKPoradi.stridacka) {
        window.PKPoradi.stridacka(arr, LIST_LIMIT, window.PKPoradi.MIST_NA_STRIDACKU,
          window.PKPoradi.denIndex(), pkey, window.PKPoradi.prihozeniSeance(),
          function (d) { return !jeProsle(d); });
      }
    }

    arr.sort(function (a, b) { return (jeProsle(a) ? 1 : 0) - (jeProsle(b) ? 1 : 0); });

    arr.sort(function (a, b) { return (isFeatured(b) ? 1 : 0) - (isFeatured(a) ? 1 : 0); });
    return arr;
  }

  function demand(d) {
    if (d._demand != null) return d._demand;
    var typeBonus = { drazba: 22, exekuce: 18, obec: 12, sale: 8, majitel: 10 }[d.type] || 0;

    var body = 0;
    var o = MODEL ? MODEL.odhad(d) : null;

    if (o && o.podleVelikosti && !o.pochybna && !o.nejisty && !o.podil && o.podOdhadem >= MEZ_SLEVA) {

      body = Math.min(45, Math.round((o.podOdhadem - MEZ_SLEVA) * 45 / 35));
    }
    d._demand = Math.max(6, Math.round(9 + typeBonus + body));
    return d._demand;
  }

  var LIST_LIMIT = 8;

  var NA_STRANKU = 24;
  var stranka = 0;
  var posledniOtiskFiltru = null;

  var msfBadge = document.getElementById('msf-badge');

  function pocetFiltru() {
    var casti = (dotazFiltr && dotazFiltr.casti) || [];
    return casti.length + (mistoFiltr ? 1 : 0) +
      omezeni().filter(function (o) { return o.popis; }).length;
  }
  function updateFilterBadge() {
    if (!msfBadge) return;
    var n = pocetFiltru();
    if (n > 0) { msfBadge.textContent = n; msfBadge.hidden = false; }
    else { msfBadge.hidden = true; }
  }

  function renderList() {

    zapisAdresu();

    prekresliDruhy();
    updateFilterBadge();
    vykresliOkruhNaMape();
    ulozFiltr();
    listEl.innerHTML = '';
    var vis = [], visIds = [];
    DATA.forEach(function (d) {
      if (visible(d)) { vis.push(d); visIds.push(d._id); }
    });
    syncMarkers(visIds);
    prekresliRadar();

    if (selectedKraj) vis = vis.filter(function (d) { return (d._gkraj || krajOf(d)) === selectedKraj; });
    var matched = vis.length;
    sortVis(vis);

    posledniVyber = vis;

    var pv = vis.map(perM2Val).filter(function (x) { return isFinite(x) && x > 0; }).sort(function (a, b) { return a - b; });
    var dealMax = pv.length >= 5 ? pv[Math.min(2, pv.length - 1)] : 0;

    var hotIds = {};
    if (vis.length >= 5) {

      vis.slice()
        .filter(function (d) { var o = MODEL ? MODEL.odhad(d) : null; return !(o && (o.pochybna || o.nejisty)); })
        .sort(function (a, b) { return demand(b) - demand(a); }).slice(0, 1)
        .forEach(function (d) { hotIds[d._id] = true; });
    }

    if (window.PKOdkaz) {
      var _st = stavProAdresu(); _st.poloha = null;
      var otisk = PKOdkaz.zapis(_st);
      if (otisk !== posledniOtiskFiltru) { posledniOtiskFiltru = otisk; stranka = 0; }
    }

    var stran = Math.max(1, Math.ceil(matched / NA_STRANKU));
    if (stranka >= stran) stranka = stran - 1;
    if (stranka < 0) stranka = 0;
    var odKusu = stranka * NA_STRANKU;
    var top = vis.slice(odKusu, odKusu + NA_STRANKU);
    var kolik = odKusu + top.length;
    var karticky = [];

    var videneKlice = (window.PKVideno && window.PKVideno.mnozina) ? window.PKVideno.mnozina() : {};

    top.forEach(function (d, rank) {
      var t = TYPE[d.type];
      var perM2 = zaMetr(d);
      var hot = !!hotIds[d._id];
      var jeVidene = !!videneKlice[pkey(d)];
      var li = document.createElement('li');
      li.className = 'opp-item ' + d.type + (hot ? ' is-hot' : '') + (isFeatured(d) ? ' is-featured' : '')
        + (jeVidene ? ' je-videne' : '');
      li.setAttribute('data-id', d._id);
      li.setAttribute('tabindex', '0');
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', t.label + ' · ' + d.place + ' · ' + areaTxt(d));
      var days = daysUntil(d.extra);

      var cd = days == null ? ''
        : (days < 0 ? '<span class="opp-cd opp-proběhlo">proběhlo</span>'
                    : '<span class="opp-cd' + countdownClass(days) + '">' + countdownText(days) + '</span>');

      var druhCap = d.druh ? d.druh.charAt(0).toUpperCase() + d.druh.slice(1) : '';
      var subParts = [];
      if (druhCap) subParts.push(druhCap);
      if (hasParcel(d)) subParts.push('parc. ' + d.parcel);
      var sub = subParts.join(' · ');

      var figs =

        (hasArea(d)
          ? '<span class="m">' + fmt(d.area) + '\u00a0m²' + (d.podil ? '<i class="m-celek">celá parcela</i>' : '') + '</span>'
          : '<span class="m">výměra neuvedena</span>') +
        (perM2 ? '<span class="opp-perm2"' + zaMetrTitul(d) + '>' + fmt(perM2) + ' Kč/m²</span>' : '') +

        (function () {
          var od = userPos || mojeMisto;
          if (!od) return '';
          var km = kmOd(od, d);
          if (!isFinite(km)) return '';
          return '<span class="opp-km">' + (km < 1 ? '<1' : Math.round(km)) + ' km</span>';
        }());

      var chips = [];
      var kdeKarty = '';

      var srovnaniModel = null;
      if (isFeatured(d)) chips.push('<span class="opp-feat">Zvýrazněno</span>');
      if (cd) chips.push(cd);

      var _zm = window.PKZlevneni ? window.PKZlevneni.zmena(d) : null;
      if (_zm) chips.push('<span class="' + (_zm.dolu ? 'opp-zlevneno' : 'opp-zdrazeno')
        + '" title="' + esc(window.PKZlevneni.popis(_zm, fmt)) + '">'
        + esc(window.PKZlevneni.text(_zm)) + '</span>');

      var _odhadPochybny = MODEL && (function () {
        var x = MODEL.odhad(d);
        return !!(x && x.podleVelikosti && (x.pochybna || x.nejisty));
      })();

      if (MODEL && MODEL.neduveryhodna(d) && !_odhadPochybny && !d.podil) {
        chips.push('<span class="opp-overit" title="Cena za m² je hluboko pod obvyklou — bývá to spoluvlastnický podíl, pozemek bez přístupu nebo chyba v inzerátu">cena k ověření</span>');
      }
      var _od = MODEL ? MODEL.odhad(d) : null;

      if (_od && _od.podleVelikosti && _od.pochybna) {
        chips.push('<span class="opp-overit" title="Cena je o ' + _od.podOdhadem +
          ' % pod obvyklou cenou podobných pozemků — to už nebývá sleva, ale spoluvlastnický podíl, jiná výměra v dražbě nebo chyba v inzerátu. Ověřte si podklady.">' +
          'ověřit cenu</span>');
      } else if (_od && _od.podleVelikosti && _od.nejisty && _od.podOdhadem >= 25 && !_od.podil) {

        chips.push('<span class="opp-overit" title="Cena vychází o ' + _od.podOdhadem +
          ' % pod obvyklou, jenže ceny podobných pozemků v okolí se mezi sebou liší násobky — odhad je proto jen hrubý. Ověřte si podklady.">' +
          'cena k ověření</span>');
      } else if (_od && _od.podleVelikosti && _od.podOdhadem >= 25 && !_od.podil) {

        srovnaniModel = { uroven: _od.uroven, kde: _od.kde };
        kdeKarty = kdeSrovnani(_od);
        chips.push('<span class="opp-deal" data-kde="' + esc(kdeKarty) + '" title="Cena je o ' + _od.podOdhadem +
          ' % pod obvyklou cenou podobných pozemků ' + esc(kdeKarty || 'v okolí') + '">−' + _od.podOdhadem + ' % proti okolí</span>');
      } else if (perM2 && dealMax && perM2 <= dealMax) {
        var _di = dealInfo(d);
        srovnaniModel = _di ? { uroven: _di.uroven, kde: _di.kde } : null;
        kdeKarty = kdeSrovnani(_di);
        chips.push('<span class="opp-deal" data-kde="' + esc(kdeKarty) + '" title="' +
          (_di && _di.cheaper >= 70
            ? 'Levnější než ' + _di.cheaper + ' % pozemků téhož druhu ' + esc(kdeKarty || 'v okolí')
            : 'Cena za m² patří k nejnižším u pozemků téhož druhu ' + esc(kdeKarty || 'v okolí')) + '">' +
          (_di && _di.cheaper >= 70 ? 'levnější než ' + _di.cheaper + ' %' : 'výhodná cena') + '</span>');
      }

      if (d.podil) {
        chips.push('<span class="opp-podil" title="Podle popisu inzerátu se prodává spoluvlastnický podíl, ne celý pozemek — velikost podílu si ověřte v katastru">'
          + (d.zlomek ? 'podíl ' + esc(d.zlomek) : 'podíl') + '</span>');
      }
      if (hot) chips.push('<span class="opp-hot">Doporučujeme</span>');

      if (jeNovy(d)) chips.unshift('<span class="opp-nove">Nové</span>');

      if (chips.length > 3) chips = chips.slice(0, 3);
      if (jeSkryty(d)) li.classList.add('je-skryty');
      li.innerHTML =
        '<div class="opp-media">' +
          mapThumb(d) +
          '<button type="button" class="opp-fav' + (isFav(d) ? ' on' : '') + '" aria-label="' + (isFav(d) ? 'Odebrat z uložených' : 'Uložit pozemek') + '">' + BM_SVG + '</button>' +
          '<button type="button" class="opp-skryt" aria-label="' + (jeSkryty(d) ? 'Vrátit do seznamu' : 'Tenhle mě nezajímá') + '" title="' + (jeSkryty(d) ? 'Vrátit do seznamu' : 'Tenhle mě nezajímá') + '">' + (jeSkryty(d) ? '↩' : '✕') + '</button>' +
        '</div>' +
        '<div class="opp-body">' +
          '<div class="opp-price">' + fmt(d.price) + ' Kč</div>' +

          '<span class="opp-place">' + d.place +
            (jeVidene ? '<i class="opp-videne" title="Tenhle pozemek jste už otevřeli">už otevřeno</i>' : '') +
          '</span>' +
          (mistoRadek(d) ? '<div class="opp-loc">' + mistoRadek(d) + '</div>' : '') +
          (sub ? '<div class="opp-sub">' + sub + '</div>' : '') +
          '<div class="opp-figures">' + figs + '</div>' +
          (chips.length ? '<div class="opp-chips">' + chips.join('') + '</div>' : '') +
        '</div>';

      var pozHref = 'pozemek.html?p=' + encodeURIComponent(pkey(d)) + '&ll=' + d.lat + ',' + d.lng;
      function openInzerat() { location.href = pozHref; }
      li.addEventListener('click', openInzerat);
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInzerat(); }
      });
      li.addEventListener('mouseenter', function () { highlightList(d._id); });
      var favBtn = li.querySelector('.opp-fav');
      if (favBtn) favBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleFav(d);
        var on = isFav(d);
        favBtn.classList.toggle('on', on);
        favBtn.setAttribute('aria-label', on ? 'Odebrat z uložených' : 'Uložit pozemek');
        if (favOnly) renderList();
      });
      var skrytBtn = li.querySelector('.opp-skryt');
      if (skrytBtn) skrytBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        prepniSkryty(d);
        renderList();
      });

      karticky.push({ srovnani: srovnaniModel, okres: d.okres });
      listEl.appendChild(li);
    });
    try { window.PK_KARTY = karticky; } catch (e) {}

    var mvCount = document.getElementById('mvt-count'); if (mvCount) mvCount.textContent = matched ? '(' + fmt(matched) + ')' : '';

    var headLabel = matched === 0 ? 'Nic nenalezeno'
      : (sortMode === 'demand' ? 'Doporučené příležitosti' : 'Vybrané příležitosti');
    var pripisky = '';
    var novych = pocetNovych();
    if (novych) pripisky += ' <span class="mc-nove">' + fmt(novych) + ' ' +
      (novych === 1 ? 'nový od minule' : (novych < 5 ? 'nové od minule' : 'nových od minule')) + '</span>';

    if (favOnly) pripisky += ' <span class="mc-pozn">uloženo jen v tomhle prohlížeči</span>';

    if (skryte.length) pripisky += ' <button type="button" class="mc-skryte" id="mc-skryte"><span>' +
      (ukazSkryte ? 'Schovat skryté' : 'Zobrazit skryté (' + skryte.length + ')') + '</span></button>';

    var proslychStranou = 0;
    if (!ukazProsle) {
      ukazProsle = true;
      try {
        for (var pi = 0; pi < DATA.length; pi++) {
          var pd = DATA[pi];
          if (jeProsle(pd) && visible(pd) && (!selectedKraj || (pd._gkraj || krajOf(pd)) === selectedKraj)) proslychStranou++;
        }
      } finally { ukazProsle = false; }
    }
    if (proslychStranou || ukazProsle) pripisky += ' <button type="button" class="mc-skryte" id="mc-prosle"><span>' +
      (ukazProsle ? 'Schovat dražby po termínu'
                  : 'Zobrazit dražby po termínu (' + proslychStranou + ')') + '</span></button>';

    var podobnychStranou = 0;
    var _pnNazev = (!mistoFiltr && !ukazPodobne) ? presnyNazev() : null;
    if (_pnNazev) {
      ukazPodobne = true;
      try {
        for (var qi = 0; qi < DATA.length; qi++) {
          var qd = DATA[qi];
          if (!jePresna(qd, _pnNazev) && visible(qd)
            && (!selectedKraj || (qd._gkraj || krajOf(qd)) === selectedKraj)) podobnychStranou++;
        }
      } finally { ukazPodobne = false; }
    }
    if (podobnychStranou || ukazPodobne) pripisky += ' <button type="button" class="mc-skryte" id="mc-podobne"><span>' +
      (ukazPodobne ? 'Jen přesný název'
                   : 'Zobrazit i podobné názvy (' + podobnychStranou + ')') + '</span></button>';

    if (matched) pripisky += ' <button type="button" class="mc-skryte" id="mc-vyvoz"><span>Stáhnout tabulku ('
      + fmt(matched) + ')</span></button>';

    if (matched >= 5) pripisky += ' <button type="button" class="mc-skryte" id="mc-rychly"><span>Rychlý výběr</span></button>';
    countEl.innerHTML = headLabel + (matched ? ' · <span class="mc-sub">' + fmt(matched) + ' na mapě</span>' : '') + pripisky;
    var vb = countEl.querySelector('#mc-vyvoz');
    if (vb) vb.addEventListener('click', function (e) { e.stopPropagation(); stahniTabulku(); });
    var rb = countEl.querySelector('#mc-rychly');
    if (rb) rb.addEventListener('click', function (e) { e.stopPropagation(); otevriRychly(); });
    var sb = countEl.querySelector('#mc-skryte');
    if (sb) sb.addEventListener('click', function (e) { e.stopPropagation(); ukazSkryte = !ukazSkryte; renderList(); });
    var pb = countEl.querySelector('#mc-prosle');
    if (pb) pb.addEventListener('click', function (e) { e.stopPropagation(); ukazProsle = !ukazProsle; renderList(); });
    var qb = countEl.querySelector('#mc-podobne');
    if (qb) qb.addEventListener('click', function (e) { e.stopPropagation(); ukazPodobne = !ukazPodobne; renderList(); });
    if (matched === 0) {

      var anyFilter = jeNecoZapnute();
      var emptyMsg;
      if (okoliAktivni()) {

        var km0 = mojeMisto.km || 10;
        var vetsi = [5, 10, 20, 50, 100].filter(function (k) { return k > km0; });
        var navrh = null;
        for (var vi = 0; vi < vetsi.length; vi++) {
          var kolik = DATA.filter(function (d) { return visibleBezOkoli(d) && kmOd(mojeMisto, d) <= vetsi[vi]; }).length;
          if (kolik > 0) { navrh = { km: vetsi[vi], kolik: kolik }; break; }
        }

        emptyMsg = 'Do ' + km0 + ' km od vašeho místa' +
          (mojeMisto.nazev ? ' (' + esc(mojeMisto.nazev) + ')' : '') + ' teď nic není.' +
          (navrh ? ' Do ' + navrh.km + ' km ' + (navrh.kolik === 1 ? 'je 1 pozemek' :
            (navrh.kolik < 5 ? 'jsou ' + navrh.kolik + ' pozemky' : 'je ' + navrh.kolik + ' pozemků')) + '.'
            : ' Ani ve větším okruhu zatím nic.');
        listEl.innerHTML = '<li class="map-count" style="padding:20px 6px; text-transform:none; font-weight:400; line-height:1.6;">' + emptyMsg +
          (navrh ? '<br><button type="button" id="okoli-vic" class="reset-btn">Zvětšit okruh na ' + navrh.km + ' km</button>' : '') +
          '<br><button type="button" id="okoli-pryc" class="reset-btn">Zobrazit celou ČR</button></li>';
        var vb = listEl.querySelector('#okoli-vic');
        if (vb) vb.addEventListener('click', function () {
          mojeMisto.km = navrh.km; ulozMisto(mojeMisto);
          if (mistoKmEl) mistoKmEl.value = String(navrh.km);
          vykresliMisto(); ramujMisto(); updateKrajHead(); renderList();
        });
        var pb = listEl.querySelector('#okoli-pryc');
        if (pb) pb.addEventListener('click', vypniOkoli);
        prepocitejCipy();
        prekresliPosuvniky();
        prekresliVybaveni();
        return;
      }
      var opravaNav = (anyFilter && searchTerm && HL.mysleliJste) ? HL.mysleliJste(DATA, searchTerm) : null;
      var vinik = anyFilter ? nejvicOmezuje() : null;
      if (favOnly && !favCount()) {
        emptyMsg = 'Zatím nemáte uložené žádné pozemky. U každé nabídky klepněte na záložku a najdete je tady pohromadě.';
      } else if (anyFilter) {
        emptyMsg = 'Nic neodpovídá vybraným filtrům. Zkuste je zmírnit — třeba zvýšit cenu, zvětšit rozsah výměry nebo vybrat „Vše".';

        if (vinik) {

          emptyMsg = 'Nic nesedí všem podmínkám naráz. Nejvíc omezuje <b>' + esc(vinik.nazev) + '</b>'
            + ' — bez tohoto filtru by ' + (vinik.n === 1 ? 'zbyla <b>1</b> nabídka' : 'jich bylo <b>' + fmt(vinik.n) + '</b>') + '.';
        }

        if (opravaNav) emptyMsg = 'Pro „' + esc(searchTerm) + '" nic nemáme. Mysleli jste <b>' + esc(opravaNav) + '</b>?';
      } else {
        emptyMsg = 'Tady zrovna nic není. Příležitostí přibývá každý týden — zkuste to za pár dní.';
      }
      listEl.innerHTML = '<li class="map-count" style="padding:20px 6px; text-transform:none; font-weight:400; line-height:1.6;">' + emptyMsg +
        (opravaNav ? '<br><button type="button" id="hledat-opravu" class="reset-btn">Hledat ' + esc(opravaNav) + '</button>' : '') +
        (vinik && !opravaNav ? '<br><button type="button" id="pusti-vinika" class="reset-btn">Zrušit ' + esc(vinik.ctvrty) + '</button>' : '') +
        (anyFilter ? '<br><button type="button" id="reset-filtry" class="reset-btn">Zrušit filtry</button>' : '') + '</li>';
      var pv = listEl.querySelector('#pusti-vinika');
      if (pv) pv.addEventListener('click', function () { vinik.vypni(); renderList(); });
      var ob = listEl.querySelector('#hledat-opravu');
      if (ob) ob.addEventListener('click', function () {
        searchEl.value = opravaNav; nastavHledani(opravaNav); renderList();
      });
      var eb = listEl.querySelector('#reset-filtry');
      if (eb) eb.addEventListener('click', resetFilters);
    } else if (stran > 1) {

      var pat = document.createElement('li');
      pat.className = 'opp-strany';
      var jePrvni = stranka === 0, jePosledni = stranka >= stran - 1;
      pat.innerHTML =
        '<button type="button" class="ops-btn" data-krok="-1"' + (jePrvni ? ' disabled' : '') + '>'
          + '<span aria-hidden="true">‹</span> Předchozí</button>'
        + '<span class="ops-kde">Strana <b>' + fmt(stranka + 1) + '</b> z ' + fmt(stran) + '</span>'
        + '<button type="button" class="ops-btn" data-krok="1"' + (jePosledni ? ' disabled' : '') + '>'
          + 'Další <span aria-hidden="true">›</span></button>';
      listEl.appendChild(pat);
      pat.querySelectorAll('.ops-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          stranka += Number(b.getAttribute('data-krok'));
          renderList();

          scrollNaVypis();

          var prvni = document.querySelector('#opp-list .opp-item');
          if (prvni) { try { prvni.focus(); } catch (e) {} }
        });
      });
      var more = document.createElement('li');
      more.className = 'opp-more';
      more.textContent = '…nebo si celou nabídku projděte na mapě';
      listEl.appendChild(more);
    }
    prepocitejCipy();
    prekresliPosuvniky();
    prekresliVybaveni();
    prekresliOvladani();
    prekresliChipy();
    prekresliAkceFiltru(matched);
  }

  function resetFilters() {
    activeType = 'all'; druhVybrane = []; maxPrice = 0; minArea = 0; urgentOnly = false; nastavHledani(''); favOnly = false;
    stranka = 0;
    if (searchEl) searchEl.value = '';

    minPrice = 0; maxArea = 0;

    omezeni().forEach(function (o) { if (typeof o.vypni === 'function') o.vypni(); });
    [cenaEl, cenaOdEl, areaEl, areaDoEl].forEach(function (el) { if (el) el.value = ''; });

    POSUVNIKY.forEach(function (p) { p.poleOd.value = ''; p.poleDo.value = ''; p.prvni = -1; });
    zadaneVybaveni = []; jenCelek = false;
    if (cenaEl) cenaEl.dispatchEvent(new Event('pk-reset'));
    if (urgentEl) { urgentEl.classList.remove('on'); urgentEl.setAttribute('aria-pressed', 'false'); }
    filtersEl.querySelectorAll('.filter-chip').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-type') === 'all');
    });
    refreshFavBtn();
    renderList();
  }

  function gotoInzerat(d) {
    if (!d) return;

    try {

      sessionStorage.setItem('pk_open', JSON.stringify({
        place: d.place, okres: d.okres, cast: d.cast, parcel: d.parcel, druh: d.druh,
        price: d.price, area: d.area, type: d.type, lat: d.lat, lng: d.lng,
        extra: d.extra, url: d.url, featured: d.featured,

        contact: d.contact,
        site: d.site, features: d.features, access: d.access,
        podil: d.podil, zlomek: d.zlomek, photos: d.photos,
        description: d.description, _lid: d._lid
      }));

      var c = map.getCenter();
      sessionStorage.setItem('pk_map_return', JSON.stringify({
        lat: c.lat, lng: c.lng, z: map.getZoom(), kraj: selectedKraj || null, t: Date.now()
      }));
    } catch (e) {}

    location.href = 'pozemek.html?p=' + encodeURIComponent(pkey(d)) + '&ll=' + d.lat + ',' + d.lng
      + (isFinite(d.area) ? '&v=' + Math.round(d.area) : '')
      + (d._lid ? '&l=' + encodeURIComponent(d._lid) : '');
  }

  function openParcel(target) {
    if (!target) return;
    var k = krajOf(target);
    if (k) selectKraj(k, true);
    highlightShape(target);
    function frame() {
      map.invalidateSize();
      map.setView([target.lat, target.lng], 17, { animate: false });
    }
    frame();
    updateMapView();
    highlightMarker(target._id);
    highlightList(target._id);
    if (holderEl) setTimeout(function () { holderEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150);

    setTimeout(frame, 500);
  }

  function cleanUrl() { try { history.replaceState(null, '', location.pathname); } catch (e) {} }

  var rvStav = null, rvVrstva = null;
  function rvPrvek(id) { return document.getElementById(id); }

  function otevriRychly() {
    if (!window.PKRychly) return;
    rvVrstva = rvPrvek('rv-vrstva');
    if (!rvVrstva) return;
    var karty = PKRychly.balicek(posledniVyber, { jeSkryty: jeSkryty, jeUlozeny: isFav });
    rvStav = PKRychly.stav(karty);
    rvVrstva.hidden = false;
    document.body.style.overflow = 'hidden';
    rvKresli();
    var z = rvPrvek('rv-zavrit'); if (z) { try { z.focus(); } catch (e) {} }
  }
  function zavriRychly() {
    if (rvVrstva) rvVrstva.hidden = true;
    document.body.style.overflow = '';
    rvStav = null;
    renderList();
  }

  function tvarNabidek(n) {
    var F = window.PKFeed;
    return F && F.mnozne ? F.mnozne(n, ['nabídku', 'nabídky', 'nabídek']) : 'nabídek';
  }

  function rvKresli() {
    var deck = rvPrvek('rv-deck');
    if (!deck || !rvStav) return;
    var zb = rvPrvek('rv-zbyva');
    var d = PKRychly.aktualni(rvStav);
    var souh = PKRychly.souhrn(rvStav);
    if (zb) zb.textContent = d
      ? ('Zbývá ' + fmt(PKRychly.zbyva(rvStav)))
      : ('Hotovo — uloženo ' + souh.ulozeno + ', skryto ' + souh.skryto);
    var zpetBtn = rvPrvek('rv-zpet');
    if (zpetBtn) zpetBtn.disabled = !PKRychly.lzeZpet(rvStav);
    ['rv-ne', 'rv-ano'].forEach(function (id) { var b = rvPrvek(id); if (b) b.disabled = !d; });
    if (!d) {
      deck.innerHTML = '<div class="rv-konec"><h3>To je všechno</h3>'
        + '<p>Prošli jste ' + fmt(souh.celkem) + ' ' + tvarNabidek(souh.celkem) + '. Uloženo '
        + souh.ulozeno + ', skryto ' + souh.skryto + '.</p></div>';
      return;
    }
    var zaM2 = zaMetr(d);
    var S = window.PK_SNIMEK;
    var obraz = S ? S.html(d, { sirka: 460, vyska: 307, barva: (TYPE[d.type] || {}).color, id: 'rv' }) : '';
    deck.innerHTML = '<article class="rv-karta" id="rv-karta">'
      + '<div class="rv-obraz">' + obraz
        + '<span class="opp-badge ' + d.type + '">' + esc((TYPE[d.type] || {}).label || '') + '</span></div>'
      + '<div class="rv-telo">'
        + '<div class="rv-cena">' + fmt(d.price) + ' Kč</div>'
        + '<div class="rv-misto">' + esc(d.place || '') + '</div>'
        + (d.okres && d.okres !== d.place ? '<div class="rv-okres">okres ' + esc(d.okres) + '</div>' : '')
        + '<div class="rv-druh">' + esc(d.druh || '') + '</div>'
        + '<div class="rv-cisla">'
          + (d.area > 0 ? '<span class="rv-cislo">' + fmt(d.area) + ' m²</span>' : '')
          + (zaM2 != null ? '<span class="rv-cislo">' + fmt(Math.round(zaM2)) + ' Kč/m²</span>' : '')
        + '</div>'
      + '</div></article>'
      + '<p class="rv-stalo" id="rv-stalo" role="status"></p>';
    rvChytejPrst();
  }

  function rvChytejPrst() {
    var k = rvPrvek('rv-karta');
    if (!k) return;
    var x0 = null, dx = 0;
    k.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      x0 = e.touches[0].clientX; dx = 0;
    }, { passive: true });
    k.addEventListener('touchmove', function (e) {
      if (x0 == null || !e.touches || !e.touches.length) return;
      dx = e.touches[0].clientX - x0;
      k.style.transform = 'translateX(' + Math.round(dx) + 'px) rotate(' + (dx / 28).toFixed(2) + 'deg)';
    }, { passive: true });
    k.addEventListener('touchend', function () {
      if (x0 == null) return;
      k.style.transform = '';
      var prah = Math.max(60, k.getBoundingClientRect().width * 0.22);
      if (Math.abs(dx) >= prah) rvRozhodni(dx > 0 ? PKRychly.VPRAVO : PKRychly.VLEVO);
      x0 = null; dx = 0;
    }, { passive: true });
  }

  function rvHlaska(text, trida) {
    var h = rvPrvek('rv-stalo');
    if (h) { h.textContent = text; h.className = 'rv-stalo' + (trida ? ' ' + trida : ''); }
  }
  function rvRozhodni(smer) {
    if (!rvStav) return;
    var v = PKRychly.rozhodni(rvStav, smer);
    if (!v) return;
    if (v.akce === 'uloz') { if (!isFav(v.pozemek)) toggleFav(v.pozemek); }
    else if (!jeSkryty(v.pozemek)) prepniSkryty(v.pozemek);
    rvKresli();
    rvHlaska(v.akce === 'uloz' ? 'Uloženo' : 'Skryto', v.akce === 'uloz' ? 'uloz' : 'skryj');
  }
  function rvZpet() {
    if (!rvStav) return;
    var v = PKRychly.zpet(rvStav);
    if (!v) return;

    if (v.akce === 'zrus-uloz' && isFav(v.pozemek)) toggleFav(v.pozemek);
    if (v.akce === 'zrus-skryj' && jeSkryty(v.pozemek)) prepniSkryty(v.pozemek);
    rvKresli();
    rvHlaska('Vráceno', '');
  }

  (function rvOvladani() {
    var ne = rvPrvek('rv-ne'), ano = rvPrvek('rv-ano'), zp = rvPrvek('rv-zpet'), za = rvPrvek('rv-zavrit');
    if (ne) ne.addEventListener('click', function () { rvRozhodni(PKRychly.VLEVO); });
    if (ano) ano.addEventListener('click', function () { rvRozhodni(PKRychly.VPRAVO); });
    if (zp) zp.addEventListener('click', rvZpet);
    if (za) za.addEventListener('click', zavriRychly);
    document.addEventListener('keydown', function (e) {
      if (!rvStav || !rvVrstva || rvVrstva.hidden) return;
      if (e.key === 'Escape') { zavriRychly(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); rvRozhodni(PKRychly.VLEVO); }
      if (e.key === 'ArrowRight') { e.preventDefault(); rvRozhodni(PKRychly.VPRAVO); }
    });
  }());

  function stavProAdresu() {
    var stred = null;
    try { var c = map.getCenter(); stred = { lat: c.lat, lng: c.lng, zoom: map.getZoom() }; } catch (e) {}
    return {
      poloha: stred,
      activeType: activeType, druhVybrane: druhVybrane,
      minPrice: minPrice, maxPrice: maxPrice,
      minArea: minArea, maxArea: maxArea, maxPerM2: maxPerM2,
      zadaneVybaveni: zadaneVybaveni,
      jenCelek: jenCelek, urgentOnly: urgentOnly, levneOnly: levneOnly,
      ukazPodobne: ukazPodobne,
      krajFiltr: krajFiltr, selectedKraj: selectedKraj,

      sortMode: sortMode === 'near' ? '' : sortMode,
      hledani: searchEl ? searchEl.value : '',
      mistoObec: mistoFiltr && mistoFiltr.place ? mistoFiltr.place : '',
      mistoOkres: mistoFiltr && mistoFiltr.okres ? mistoFiltr.okres : ''
    };
  }
  var adresaCeka = null, adresaDrzi = false;

  function zapisAdresu() {
    if (adresaDrzi || !window.PKOdkaz) return;
    if (adresaCeka) clearTimeout(adresaCeka);
    adresaCeka = setTimeout(function () {
      adresaCeka = null;
      try {

        if (location.hash && !PKOdkaz.jeStavMapy(location.hash)) return;
        var h = PKOdkaz.zapis(stavProAdresu());

        var nova = location.pathname + location.search + (h ? '#' + h : '');
        if (nova !== location.pathname + location.search + location.hash) {
          history.replaceState(null, '', nova);
        }
      } catch (e) {}
    }, 350);
  }

  function obnovZAdresy() {
    if (!window.PKOdkaz || !PKOdkaz.jeStavMapy(location.hash)) return false;
    var st = PKOdkaz.cti(location.hash);
    var neco = false;

    adresaDrzi = true;
    var posli = function (el, udalost) {
      if (!el) return;
      try { el.dispatchEvent(new Event(udalost, { bubbles: true })); } catch (e) {}
    };
    var dosadVyber = function (el, v) {
      if (!el || !v) return;
      if (el.tagName === 'SELECT') {
        var ma = false;
        for (var k = 0; k < el.options.length; k++) if (String(el.options[k].value) === String(v)) { ma = true; break; }
        if (!ma) el.add(new Option(String(v), String(v)));
      }
      el.value = String(v);
      posli(el, 'change');
      neco = true;
    };
    try {
      if (st.hledani && searchEl) { searchEl.value = st.hledani; nastavHledani(st.hledani); neco = true; }
      if (st.mistoObec) {
        mistoFiltr = { typ: 'obec', place: st.mistoObec, okres: st.mistoOkres || '' };
        neco = true;
      } else if (st.mistoOkres) {
        mistoFiltr = { typ: 'okres', okres: st.mistoOkres };
        neco = true;
      }
      dosadVyber(cenaOdEl, st.minPrice);
      dosadVyber(cenaEl, st.maxPrice);
      dosadVyber(areaEl, st.minArea);
      dosadVyber(areaDoEl, st.maxArea);
      dosadVyber(perm2El, st.maxPerM2);
      if (st.sortMode && st.sortMode !== 'near' && sortEl) dosadVyber(sortEl, st.sortMode);

      if (st.urgentOnly && !urgentOnly && urgentEl) { urgentEl.click(); neco = true; }
      if (st.levneOnly && !levneOnly && levneEl) { levneEl.click(); neco = true; }
      if (st.activeType && st.activeType !== 'all') {
        var tb = document.querySelector('[data-type="' + st.activeType + '"]');
        if (tb) { tb.click(); neco = true; }
      }
      (st.druhVybrane || []).forEach(function (g) {
        if (druhVybrane.indexOf(g) >= 0) return;
        var b = druhyEl && druhyEl.querySelector('[data-druh="' + g.replace(/"/g, '') + '"]');
        if (b) { b.click(); neco = true; }
        else if (DRUHY_VSE.indexOf(g) >= 0) { druhVybrane.push(g); neco = true; }
      });

      if ((st.zadaneVybaveni || []).length) { zadaneVybaveni = st.zadaneVybaveni.slice(); neco = true; }
      if (st.jenCelek) { jenCelek = true; neco = true; }
      if (st.ukazPodobne) { ukazPodobne = true; neco = true; }
      if (st.selectedKraj) { try { selectKraj(st.selectedKraj, true); neco = true; } catch (e) {} }
      if (st.poloha) {
        try {
          map.invalidateSize();
          map.setView([st.poloha.lat, st.poloha.lng], st.poloha.zoom || 10, { animate: false });
          if ((st.poloha.zoom || 0) >= 10 && typeof lockDots === 'function') lockDots(false);
          neco = true;
        } catch (e) {}
      }
    } finally {
      adresaDrzi = false;
    }
    if (neco) { try { if (typeof postavVybaveni === 'function') postavVybaveni(); renderList(); } catch (e) {} }
    return neco;
  }
  function openFromUrl() {

    if (/[?&](q|druh|maxc|mina)=/.test(location.search)) {
      var gp = function (n) { var mm = new RegExp('[?&]' + n + '=([^&]*)').exec(location.search); try { return mm ? decodeURIComponent(mm[1]) : ''; } catch (e) { return mm ? mm[1] : ''; } };
      var qv = gp('q'), dv = gp('druh'), mc = parseInt(gp('maxc'), 10) || 0, ma = parseInt(gp('mina'), 10) || 0;
      if (qv && searchEl) { searchEl.value = qv; nastavHledani(qv); }

      var dosad = function (el, v, txt) {
        if (!el || !v) return;
        if (el.tagName === 'SELECT') {
          var ma2 = false;
          for (var k = 0; k < el.options.length; k++) if (String(el.options[k].value) === String(v)) { ma2 = true; break; }
          if (!ma2) el.add(new Option(txt, String(v)));
        }
        el.value = String(v);
      };
      dosad(cenaEl, mc, 'do ' + mc.toLocaleString('cs-CZ') + '\u00a0Kč');
      dosad(areaEl, ma, 'od ' + ma.toLocaleString('cs-CZ') + '\u00a0m²');
      if (mc) maxPrice = mc;
      if (ma) minArea = ma;
      if (dv) {

        var zname = DRUHY_VSE.concat(Object.keys(NADRAZENE));
        String(dv).split(',').forEach(function (kus) {
          var want = HL.norm(kus.trim());
          if (!want) return;
          for (var zi = 0; zi < zname.length; zi++) {
            var hv = HL.norm(zname[zi]);
            if (hv && (want.indexOf(hv) >= 0 || hv.indexOf(want) >= 0)) {
              if (druhVybrane.indexOf(zname[zi]) < 0) druhVybrane.push(zname[zi]);
              break;
            }
          }
        });
      }
      if (typeof lockDots === 'function') lockDots(false);
      renderList();
      if (holderEl) setTimeout(function () { holderEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
      cleanUrl();
      return true;
    }

    var mo = /[?&]obec=([^&]+)/.exec(location.search);
    if (mo) {
      var dekod = function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } };
      var obec = dekod(mo[1]);
      var mok = /[?&]okres=([^&]+)/.exec(location.search);
      if (searchEl) searchEl.value = obec;
      nastavHledani(obec);

      mistoFiltr = { typ: 'obec', place: obec, okres: mok ? dekod(mok[1]) : '' };
      if (typeof lockDots === 'function') lockDots(false);
      renderList();
      var posObec = geocodeTownLocal(obec);
      if (posObec && typeof map !== 'undefined' && map) {
        try { map.setView([posObec.lat, posObec.lng], Math.max(map.getZoom(), 10), { animate: true }); } catch (e) {}
      }
      if (holderEl) setTimeout(function () { holderEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
      cleanUrl();
      return true;
    }

    var mk = /[?&]kraj=([^&]+)/.exec(location.search);
    if (mk) {
      var kraj = ''; try { kraj = decodeURIComponent(mk[1]).trim(); } catch (e) { kraj = ''; }
      if (kraj && krajByName) {
        var hit = null, low = kraj.toLowerCase();
        Object.keys(krajByName).forEach(function (name) { if (name.toLowerCase() === low) hit = name; });
        if (hit) {
          selectKraj(hit);
          if (holderEl) setTimeout(function () { holderEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
          cleanUrl();
          return true;
        }
      }
    }

    var ml = /[?&]lid=([^&]+)/.exec(location.search);
    if (ml) {
      var lid; try { lid = decodeURIComponent(ml[1]); } catch (e) { lid = ''; }
      var lt = null;
      DATA.forEach(function (d) { if (d._lid && d._lid === lid) lt = d; });
      if (lt) { openParcel(lt); cleanUrl(); return true; }
    }
    var m = /[?&]p=([^&]+)/.exec(location.search);
    if (!m) return false;
    var key;
    try { key = decodeURIComponent(m[1]); } catch (e) { return false; }
    var target = null;
    DATA.forEach(function (d) { if (!target && pkey(d) === key) target = d; });

    if (!target) DATA.forEach(function (d) { if (!target && pkeyLegacy(d) === key) target = d; });
    if (!target) { cleanUrl(); return false; }
    openParcel(target);
    cleanUrl();
    return true;
  }

  function renderDeals() {
    var grid = document.getElementById('deals-grid');
    var sec = document.getElementById('vyhodne');
    if (!grid || !sec) return;

    var byGroup = {};
    DATA.forEach(function (d) {
      var di = dealInfo(d);
      if (!di || di.cheaper < 65) return;
      var g = druhGroup(d.druh);
      var cur = byGroup[g];
      if (!cur || di.cheaper > cur.di.cheaper || (di.cheaper === cur.di.cheaper && perM2Val(d) < perM2Val(cur.d))) {
        byGroup[g] = { d: d, di: di };
      }
    });
    var scored = Object.keys(byGroup).map(function (g) { return byGroup[g]; });
    scored.sort(function (a, b) { return b.di.cheaper - a.di.cheaper || perM2Val(a.d) - perM2Val(b.d); });
    var top = scored.slice(0, 4);
    if (top.length < 3) { sec.hidden = true; return; }

    var rn = document.getElementById('deals-n');
    if (rn) {
      rn.textContent = String(top.length);
      var rl = rn.nextElementSibling;
      if (rl) rl.textContent = top.length === 1 ? 'tip dnes' : (top.length < 5 ? 'tipy dnes' : 'tipů dnes');
    }

    try {
      window.PK_TIPY = top.map(function (o) {
        return { uroven: o.di.uroven, kde: o.di.kde, okres: o.d.okres, cheaper: o.di.cheaper };
      });
    } catch (e) {}
    grid.innerHTML = top.map(function (o) {
      var d = o.d, t = TYPE[d.type];
      var perM2 = zaMetr(d);
      return '<button type="button" class="deal-card" data-rkey="' + encodeURIComponent(pkey(d)) + '">' +

        '<div class="deal-badge">levnější než ' + o.di.cheaper + ' % podobných' +
          (kdeSrovnani(o.di) ? ' ' + esc(kdeSrovnani(o.di)) : '') + '</div>' +
        '<div class="deal-place"><span class="deal-dot" style="background:' + t.color + '"></span>' + d.place + '</div>' +

        '<div class="deal-sub">' + t.label + ' · ' + (d.druh || 'pozemek') + ' · ' + fmt(d.area) + ' m² · okres ' + d.okres + '</div>' +
        '<div class="deal-figs"><b>' + fmt(d.price) + ' Kč</b><span>' + fmt(perM2) + ' Kč/m²</span></div>' +
      '</button>';
    }).join('');
    sec.hidden = false;
  }
  (function () {
    var grid = document.getElementById('deals-grid');
    if (!grid) return;
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.deal-card');
      if (!card) return;
      var k; try { k = decodeURIComponent(card.getAttribute('data-rkey')); } catch (x) { return; }
      var d = keyIndex()[k];
      if (d) gotoInzerat(d);
    });
  })();

  function renderUserListings() {
    var wrap = document.getElementById('user-listings');
    if (!wrap) return;
    var items = DATA.filter(function (d) { return d.type === 'majitel'; });
    var cta = document.querySelector('.odl-cta');
    if (!items.length) {

      wrap.className = 'odl-wrap odl-empty reveal is-visible';
      wrap.innerHTML = '<b>Zatím tu žádné nejsou — buďte první.</b>' +
        '<span>Vložte svůj pozemek a objeví se tady i na mapě mezi ostatními, hned jak ho ověříme.</span>' +
        '<a href="pridat.html" class="btn-primary odl-empty-btn">Přidat pozemek zdarma →</a>';
      if (cta) cta.style.display = 'none';
      return;
    }
    if (cta) cta.style.display = '';
    wrap.className = 'odl-wrap odl-grid reveal is-visible';
    wrap.innerHTML = items.slice(0, 9).map(function (d) {
      var perM2 = zaMetr(d);
      return '<button type="button" class="odl-card" data-rkey="' + encodeURIComponent(pkey(d)) + '">' +
        '<span class="odl-badge">Přímo od majitele</span>' +
        '<span class="odl-place">' + d.place + '</span>' +
        '<span class="odl-sub">' + (d.druh || 'pozemek') + (d.okres ? ' · okres ' + d.okres : '') + '</span>' +
        '<span class="odl-figs"><b>' + fmt(d.price) + ' Kč</b>' + (hasArea(d) ? '<span>' + fmt(d.area) + ' m²</span>' : '') + (perM2 ? '<span>' + fmt(perM2) + ' Kč/m²</span>' : '') + '</span>' +
      '</button>';
    }).join('');
  }
  (function () {
    var wrap = document.getElementById('user-listings');
    if (!wrap) return;
    wrap.addEventListener('click', function (e) {
      var card = e.target.closest('.odl-card');
      if (!card) return;
      var k; try { k = decodeURIComponent(card.getAttribute('data-rkey')); } catch (x) { return; }
      var d = keyIndex()[k];
      if (d) gotoInzerat(d);
    });
  })();

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

  var navrhyEl = document.getElementById('map-search-navrhy');
  var navrhyData = [], navrhyKurzor = -1;
  function zavriNavrhy() {
    if (!navrhyEl) return;
    navrhyEl.hidden = true; navrhyEl.innerHTML = '';
    navrhyData = []; navrhyKurzor = -1;
    searchEl.setAttribute('aria-expanded', 'false');
  }
  function oznacNavrh(i) {
    if (!navrhyEl) return;
    var pol = navrhyEl.children;
    for (var k = 0; k < pol.length; k++) {
      pol[k].classList.toggle('on', k === i);

      pol[k].setAttribute('aria-selected', k === i ? 'true' : 'false');
    }
    navrhyKurzor = i;
    if (i >= 0 && pol[i] && pol[i].scrollIntoView) pol[i].scrollIntoView({ block: 'nearest' });
  }
  function vyberNavrh(i) {
    var n = navrhyData[i];
    if (!n) return;
    if (n.slovnik) {

      var slova = searchEl.value.trim().split(/\s+/);
      slova.pop();
      searchEl.value = (slova.join(' ') + ' ' + n.slovo).trim() + ' ';
      nastavHledani(searchEl.value);
      zavriNavrhy();
      renderList();
      searchEl.focus();
      return;
    }
    searchEl.value = n.text;
    nastavHledani(n.text);

    mistoFiltr = n.typ === 'okres'
      ? { typ: 'okres', okres: n.text }
      : { typ: 'obec', place: n.text, okres: n.okres || '' };
    zavriNavrhy();
    renderList();

    var pos = geocodeTownLocal(n.text);
    if (pos && typeof map !== 'undefined' && map) {
      try { map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 10), { animate: true }); } catch (e) {}
    }
  }

  function navrhySlovnik(text) {
    if (!window.PKDotaz) return [];
    var n = window.PKDotaz.norm(text);
    if (n.length < 2) return [];
    var posledni = n.split(' ').pop();
    if (posledni.length < 2) return [];
    var ven = [];
    function pridej(skupina, popis, slovo, test) {
      if (ven.length >= 4) return;
      var pocet = 0;
      for (var i = 0; i < DATA.length; i++) if (test(DATA[i])) pocet++;
      if (pocet) ven.push({ text: popis, skupina: skupina, pocet: pocet, slovo: slovo, slovnik: true });
    }
    window.PKDotaz.DRUHY.forEach(function (d) {
      if (!d[2].some(function (f) { return f.indexOf(posledni) === 0; })) return;

      pridej('druh', d[0], d[1], function (x) { return druhSedi(x.druh, d[0]); });
    });
    window.PKDotaz.TYPY.forEach(function (t) {
      if (!t[3].some(function (f) { return f.indexOf(posledni) === 0; })) return;
      pridej('nabídka', t[1], t[2], function (x) { return x.type === t[0]; });
    });
    window.PKDotaz.SITE.forEach(function (t) {
      if (!t[3].some(function (f) { return f.indexOf(posledni) === 0; })) return;
      pridej('inzerát uvádí', t[1], t[2], function (x) { return x.site && x.site.indexOf(t[0]) >= 0; });
    });

    (window.PKDotaz.OSTATNI || []).forEach(function (o) {
      if (!o[3].some(function (f) { return f.indexOf(posledni) === 0; })) return;
      if (o[0] === 'levne') pridej('výběr', o[1], o[2], podObvyklou);
      else pridej('výběr', o[1], o[2], function (x) {
        for (var i = 0; i < SITE_KLICE.length; i++) if (x.site && x.site.indexOf(SITE_KLICE[i]) >= 0) return true;
        return false;
      });
    });
    window.PKDotaz.KRAJE.forEach(function (k) {
      if (!k[2].some(function (f) { return f.indexOf(posledni) === 0; })) return;
      pridej('kraj', k[0] === 'Praha' ? 'Praha' : k[0] + ' kraj', k[1],
        function (x) { return (x._gkraj || krajOf(x)) === k[0]; });
    });
    return ven;
  }
  function ukazNavrhy() {
    if (!navrhyEl || !HL.navrhy) return;
    var slovnik = navrhySlovnik(searchEl.value);
    var mista = HL.navrhy(DATA, dotazFiltr && dotazFiltr.text ? dotazFiltr.text : searchEl.value, 6 - slovnik.length);
    navrhyData = slovnik.concat(mista);
    if (!navrhyData.length || document.activeElement !== searchEl) { zavriNavrhy(); return; }
    var html = '';
    for (var i = 0; i < navrhyData.length; i++) {
      var n = navrhyData[i];
      var kde = n.slovnik ? n.skupina : (n.okres ? 'okr. ' + n.okres : 'celý okres');
      html += '<li role="option" aria-selected="false" data-i="' + i + '">' +
        '<span class="msn-jmeno">' + esc(n.text) + '</span>' +
        '<span class="msn-kde">' + esc(kde) + '</span>' +
        '<span class="msn-pocet">' + fmt(n.pocet) + '×</span></li>';
    }
    navrhyEl.innerHTML = html;
    navrhyEl.hidden = false;
    searchEl.setAttribute('aria-expanded', 'true');
    navrhyKurzor = -1;
  }
  if (navrhyEl) {
    navrhyEl.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li[data-i]');
      if (!li) return;
      e.preventDefault();
      vyberNavrh(+li.getAttribute('data-i'));
    });
    searchEl.addEventListener('keydown', function (e) {
      if (navrhyEl.hidden) {
        if (e.key === 'ArrowDown') { ukazNavrhy(); if (!navrhyEl.hidden) { e.preventDefault(); oznacNavrh(0); } }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); oznacNavrh((navrhyKurzor + 1) % navrhyData.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); oznacNavrh((navrhyKurzor - 1 + navrhyData.length) % navrhyData.length); }
      else if (e.key === 'Enter') { if (navrhyKurzor >= 0) { e.preventDefault(); vyberNavrh(navrhyKurzor); } else zavriNavrhy(); }
      else if (e.key === 'Escape') { e.preventDefault(); zavriNavrhy(); }
    });
    searchEl.addEventListener('blur', function () { setTimeout(zavriNavrhy, 120); });
  }

  var chipyEl = document.getElementById('ms-chipy');

  var chipyNaklikane = [];
  function prekresliChipy() {
    if (!chipyEl) return;
    var casti = (dotazFiltr && dotazFiltr.casti) || [];

    chipyNaklikane = omezeni().filter(function (o) { return o.popis; });
    if (!casti.length && !mistoFiltr && !chipyNaklikane.length) {
      chipyEl.hidden = true; chipyEl.innerHTML = ''; return;
    }
    var html = '';

    if (mistoFiltr) {
      html += '<button type="button" class="msch" data-misto="1" aria-label="Zrušit: ' +
        esc(popisMista()) + '">' + esc(popisMista()) +
        '<span class="msch-x" aria-hidden="true">✕</span></button>';
    }
    for (var i = 0; i < casti.length; i++) {
      html += '<button type="button" class="msch" data-i="' + i + '" data-druh="' + esc(casti[i].druh) +
        '" aria-label="Zrušit: ' + esc(casti[i].popis) + '">' + esc(casti[i].popis) +
        '<span class="msch-x" aria-hidden="true">✕</span></button>';
    }
    for (var j = 0; j < chipyNaklikane.length; j++) {
      html += '<button type="button" class="msch" data-omez="' + j + '" aria-label="Zrušit: ' +
        esc(chipyNaklikane[j].popis) + '">' + esc(chipyNaklikane[j].popis) +
        '<span class="msch-x" aria-hidden="true">✕</span></button>';
    }
    chipyEl.innerHTML = html;
    chipyEl.hidden = false;
  }
  if (chipyEl) chipyEl.addEventListener('click', function (e) {
    var b = e.target.closest('.msch');
    if (!b) return;
    if (b.hasAttribute('data-misto')) {
      searchEl.value = '';
      nastavHledani('');
      renderList();
      return;
    }
    if (b.hasAttribute('data-omez')) {
      var o = chipyNaklikane[+b.getAttribute('data-omez')];

      if (o && typeof o.vypni === 'function') { o.vypni(); renderList(); }
      return;
    }
    var cast = (dotazFiltr.casti || [])[+b.getAttribute('data-i')];
    if (!cast) return;

    var slova = (cast.slova && cast.slova.length)
      ? cast.slova
      : window.PKDotaz.norm(cast.popis).split(' ');
    var zbytek = searchEl.value.split(/\s+/).filter(function (w) {
      return slova.indexOf(window.PKDotaz.norm(w)) < 0;
    });
    searchEl.value = zbytek.join(' ').trim();
    nastavHledani(searchEl.value);
    renderList();
  });
  searchEl.addEventListener('input', function () {
    nastavHledani(searchEl.value);
    ukazNavrhy();
    renderList();
  });

  if (sortEl) sortEl.addEventListener('change', function () {
    if (sortEl.value === 'near') {

      var predtim = sortMode;
      enterNear({
        duvod: 'Bez polohy nevíme, odkud měřit. Ukažte místo na mapě.',
        zruseno: function () { sortMode = predtim; if (sortEl) sortEl.value = predtim; },
      });
      return;
    }

    if (sortEl.value === 'nahodne' && window.PKPoradi) window.PKPoradi.zamichejZnovu();
    sortMode = sortEl.value; renderList();
  });

  function prectiRozsahy() {
    maxPrice = parseInt(cenaEl && cenaEl.value, 10) || 0;
    minPrice = parseInt(cenaOdEl && cenaOdEl.value, 10) || 0;
    minArea = parseInt(areaEl && areaEl.value, 10) || 0;
    maxArea = parseInt(areaDoEl && areaDoEl.value, 10) || 0;
    renderList();
  }
  [cenaEl, cenaOdEl, areaEl, areaDoEl].forEach(function (el) {
    if (!el) return;
    ['input', 'change', 'pk-reset'].forEach(function (ev) { el.addEventListener(ev, prectiRozsahy); });
  });

  function postavVybaveni() {
    vybaveniEl = document.getElementById('mc-vybaveni');
    if (!vybaveniEl || !window.PKVybaveni) return;
    var rada = vybaveniEl.querySelector('.mcv-rada');
    var def = window.PKVybaveni.SITE.map(function (x) { return { klic: x.klic, nazev: x.nazev, druh: 'site' }; });
    def.push({ klic: 'celek', nazev: 'Jen celé pozemky', druh: 'celek' });
    def.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mcv-btn';
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<span class="mcp-v" aria-hidden="true"></span>'
        + '<span class="mcp-t">' + d.nazev + '</span><span class="mcv-n"></span>';
      b.addEventListener('click', function () {
        if (d.druh === 'celek') jenCelek = !jenCelek;
        else {
          var i = zadaneVybaveni.indexOf(d.klic);
          if (i >= 0) zadaneVybaveni.splice(i, 1); else zadaneVybaveni.push(d.klic);
        }
        renderList();
      });
      rada.appendChild(b);
      VYBAVENI_PILULKY.push({ def: d, el: b, cislo: b.querySelector('.mcv-n') });
    });
  }

  function prekresliVybaveni() {
    if (!VYBAVENI_PILULKY.length) return;

    var puvodniSite = zadaneVybaveni, puvodniCelek = jenCelek;
    var jeCo = false;
    VYBAVENI_PILULKY.forEach(function (p) {
      if (p.def.druh === 'celek') { jenCelek = false; }
      else { zadaneVybaveni = puvodniSite.filter(function (k) { return k !== p.def.klic; }); }
      var n = 0;
      try {
        for (var i = 0; i < DATA.length; i++) {
          var d = DATA[i];
          if (!visible(d)) continue;
          if (p.def.druh === 'celek') { if (!d.podil) n++; }
          else if (d.site && d.site.indexOf(p.def.klic) >= 0) n++;
        }
      } finally { zadaneVybaveni = puvodniSite; jenCelek = puvodniCelek; }

      var maSmysl = p.def.druh === 'celek'
        ? DATA.some(function (d) { return d.podil; })
        : n > 0;
      p.el.hidden = !maSmysl;
      if (maSmysl) jeCo = true;
      p.cislo.textContent = n ? fmt(n) : '';
      var zapnuta = p.def.druh === 'celek' ? jenCelek : zadaneVybaveni.indexOf(p.def.klic) >= 0;
      p.el.classList.toggle('on', zapnuta);
      p.el.setAttribute('aria-pressed', zapnuta ? 'true' : 'false');
    });
    vybaveniEl.hidden = !jeCo;
  }

  function postavPosuvniky() {
    if (!window.PKRozsah) return;
    var bloky = document.querySelectorAll('.map-controls .mc-rozsah');
    if (bloky.length < 2) return;
    var rada = document.createElement('div');
    rada.className = 'mc-shrnuti';
    bloky[0].parentNode.insertBefore(rada, bloky[0]);

    [['cena', 'Cena', 'kc', 'Kč'], ['plocha', 'Výměra', 'm2', 'm²']].forEach(function (def, poradi) {
      var klic = def[0], nadpis = def[1], jednotka = def[2], zkratka = def[3];
      var jeCena = klic === 'cena';
      var blok = bloky[poradi];

      var sirka = Math.min(window.innerWidth || 390, 760);
      var kroku = sirka < 360 ? 11 : (sirka < 480 ? 14 : 18);
      var zar = window.PKRozsah.zarazky(DATA.map(function (d) { return jeCena ? d.price : d.area; }), kroku);

      var tlac = document.createElement('button');
      tlac.type = 'button';
      tlac.className = 'mcs-btn';
      tlac.setAttribute('aria-haspopup', 'dialog');
      tlac.setAttribute('aria-expanded', 'false');

      tlac.innerHTML = '<span class="mcs-txt"><span class="mcs-k">' + nadpis +
        '</span><span class="mcs-v">libovolná</span></span>' +
        '<svg class="mcs-sip" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
      rada.appendChild(tlac);

      var ov = document.createElement('div');
      ov.className = 'rz-ov';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-label', nadpis);
      ov.hidden = true;
      ov.innerHTML =
        '<div class="rz-hlava"><span>' + nadpis + ' (' + zkratka + ')</span>' +
        '<button type="button" class="rz-x" aria-label="Zavřít">✕</button></div>' +
        '<div class="rz-telo">' +
          '<div class="rz-graf" role="group" aria-label="Rozsah podle počtu nabídek"></div>' +
          '<div class="rz-osa"><span></span><span></span></div>' +
          '<p class="rz-napoveda">Klepněte na sloupec, nebo přes několik přejeďte prstem. Sloupce ukazují, kolik nabídek v kterém rozmezí je.</p>' +
        '</div>' +
        '<div class="rz-pata"><button type="button" class="rz-vymaz">Vymazat</button>' +
        '<button type="button" class="rz-hotovo">Hotovo</button></div>';
      document.body.appendChild(ov);

      var telo = ov.querySelector('.rz-telo');
      var dvoj = blok.querySelector('.mc-dvoj');
      var pole = document.createElement('div');
      pole.className = 'rz-pole';
      pole.innerHTML = '<label>od<span class="rz-misto-od"></span></label><label>do<span class="rz-misto-do"></span></label>';
      telo.insertBefore(pole, telo.querySelector('.rz-napoveda'));
      var vstupy = dvoj.querySelectorAll('input');
      pole.querySelector('.rz-misto-od').replaceWith(vstupy[0]);
      pole.querySelector('.rz-misto-do').replaceWith(vstupy[1]);
      blok.remove();

      var grafEl = ov.querySelector('.rz-graf'), osaEl = ov.querySelector('.rz-osa');
      var poleOd = vstupy[0], poleDo = vstupy[1];
      var sloupce = [];
      for (var k = 0; k < zar.length - 1; k++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-k', String(k));
        b.appendChild(document.createElement('i'));
        grafEl.appendChild(b);
        sloupce.push(b);
      }
      osaEl.children[0].textContent = window.PKRozsah.popis(zar[1], jednotka) || '';
      osaEl.children[1].textContent = (window.PKRozsah.popis(zar[zar.length - 2], jednotka) || '') + ' a výš';

      var p = { klic: klic, jeCena: jeCena, zar: zar, jednotka: jednotka, nadpis: nadpis,
        ov: ov, tlac: tlac, sloupce: sloupce, poleOd: poleOd, poleDo: poleDo,
        hotovoEl: ov.querySelector('.rz-hotovo'), hodnotaEl: tlac.querySelector('.mcs-v'),
        vymazEl: ov.querySelector('.rz-vymaz'),
        prvni: -1 };
      POSUVNIKY.push(p);

      function nastav(od, doo) {
        var a = Math.min(od, doo), b2 = Math.max(od, doo);
        poleOd.value = a <= 0 ? '' : String(zar[a]);
        poleDo.value = (b2 + 1) >= zar.length - 1 ? '' : String(zar[b2 + 1]);
        prectiRozsahy();
      }

      var tahne = false, tahlSe = false;
      function kterySloupec(e) {
        var cil = document.elementFromPoint(e.clientX, e.clientY);
        var b2 = cil && cil.closest ? cil.closest('.rz-graf button') : null;
        return b2 ? parseInt(b2.getAttribute('data-k'), 10) : -1;
      }
      grafEl.addEventListener('pointerdown', function (e) {
        var k2 = kterySloupec(e);
        if (k2 < 0) return;
        e.preventDefault();
        if (p.prvni < 0) {
          p.prvni = k2; tahne = true; tahlSe = false;
          nastav(k2, k2);
        } else {
          nastav(p.prvni, k2);
          p.prvni = -1; tahne = false;
        }
      });
      grafEl.addEventListener('pointermove', function (e) {
        if (!tahne) return;
        var k2 = kterySloupec(e);
        if (k2 < 0 || k2 === p.prvni) return;
        tahlSe = true;
        nastav(p.prvni, k2);
      });
      function konecTahu() {

        if (tahne && tahlSe) p.prvni = -1;
        tahne = false;
      }
      ov.addEventListener('pointerup', konecTahu);
      ov.addEventListener('pointercancel', konecTahu);

      grafEl.addEventListener('keydown', function (e) {
        var b2 = e.target.closest ? e.target.closest('.rz-graf button') : null;
        if (!b2 || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        var k2 = parseInt(b2.getAttribute('data-k'), 10);
        if (p.prvni < 0) { p.prvni = k2; nastav(k2, k2); }
        else { nastav(p.prvni, k2); p.prvni = -1; }
      });

      function otevri() {
        ov.hidden = false;
        tlac.setAttribute('aria-expanded', 'true');
        document.body.classList.add('vm-otevreno');
        prekresliPosuvniky();
        var prvni = ov.querySelector('.rz-x');
        if (prvni) prvni.focus();
      }
      function zavri() {
        ov.hidden = true;
        tlac.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('vm-otevreno');
        p.prvni = -1;
        tlac.focus();
      }

      ov.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var f = ov.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
        var viditelne = [];
        for (var i = 0; i < f.length; i++) if (f[i].offsetParent !== null || f[i] === document.activeElement) viditelne.push(f[i]);
        if (!viditelne.length) return;
        var prvni = viditelne[0], posledni = viditelne[viditelne.length - 1];
        if (e.shiftKey && document.activeElement === prvni) { e.preventDefault(); posledni.focus(); }
        else if (!e.shiftKey && document.activeElement === posledni) { e.preventDefault(); prvni.focus(); }
      });
      tlac.addEventListener('click', otevri);
      ov.querySelector('.rz-x').addEventListener('click', zavri);
      p.hotovoEl.addEventListener('click', zavri);
      ov.querySelector('.rz-vymaz').addEventListener('click', function () {
        poleOd.value = ''; poleDo.value = ''; p.prvni = -1;
        prectiRozsahy();
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !ov.hidden) { e.preventDefault(); zavri(); }
      });
    });
  }

  function polePodleModelu(el, hodnota) {
    if (!el || document.activeElement === el) return;
    if ((parseInt(el.value, 10) || 0) === (hodnota || 0)) return;
    el.value = hodnota ? String(hodnota) : '';
  }
  function prepinacPodleModelu(el, zapnuty) {
    if (!el) return;
    el.classList.toggle('on', !!zapnuty);
    el.setAttribute('aria-pressed', zapnuty ? 'true' : 'false');
  }
  function prekresliOvladani() {
    polePodleModelu(cenaEl, maxPrice);
    polePodleModelu(cenaOdEl, minPrice);
    polePodleModelu(areaEl, minArea);
    polePodleModelu(areaDoEl, maxArea);
    if (perm2El && document.activeElement !== perm2El) {
      var chce = maxPerM2 ? String(maxPerM2) : '';
      if (perm2El.value !== chce) perm2El.value = chce;
    }
    prepinacPodleModelu(urgentEl, urgentOnly);
    prepinacPodleModelu(levneEl, levneOnly);

    if (nearBtn) nearBtn.classList.toggle('on', !!okoliZap);

    if (filtersEl) {
      filtersEl.querySelectorAll('.filter-chip').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-type') === activeType);
      });
    }
  }

  function prekresliPosuvniky() {
    if (!POSUVNIKY.length || !window.PKRozsah) return;
    var pMin = minPrice, pMax = maxPrice, aMin = minArea, aMax = maxArea;
    POSUVNIKY.forEach(function (p) {
      if (p.jeCena) { minPrice = 0; maxPrice = 0; } else { minArea = 0; maxArea = 0; }
      var hodnoty = [];
      try {
        for (var i = 0; i < DATA.length; i++) {
          if (!visible(DATA[i])) continue;
          hodnoty.push(p.jeCena ? DATA[i].price : DATA[i].area);
        }
      } finally {
        if (p.jeCena) { minPrice = pMin; maxPrice = pMax; } else { minArea = aMin; maxArea = aMax; }
      }
      var hist = window.PKRozsah.histogram(hodnoty, p.zar);
      var nej = Math.max.apply(null, hist.concat([1]));
      var cOd = p.poleOd.value ? parseInt(p.poleOd.value, 10) : null;
      var cDo = p.poleDo.value ? parseInt(p.poleDo.value, 10) : null;
      var vybranych = 0, nejakyVyber = cOd != null || cDo != null;
      p.sloupce.forEach(function (b, k) {
        var dolni = p.zar[k], horni = p.zar[k + 1];
        var uvnitr = nejakyVyber && (cOd == null || horni > cOd) && (cDo == null || dolni < cDo);
        b.classList.toggle('rz-uvnitr', !!uvnitr);
        b.firstChild.style.height = Math.max(3, Math.round(hist[k] / nej * 100)) + '%';
        b.setAttribute('aria-label', (window.PKRozsah.popis(dolni, p.jednotka) || '0') + ' až ' +
          (window.PKRozsah.popis(horni, p.jednotka) || 'výš') + ', ' + fmt(hist[k]) + ' '
          + (window.PKFeed ? window.PKFeed.mnozne(hist[k], ['nabídka', 'nabídky', 'nabídek']) : 'nabídek'));
        b.setAttribute('aria-pressed', uvnitr ? 'true' : 'false');
        if (uvnitr) vybranych += hist[k];
      });
      var popisOd = cOd != null ? window.PKRozsah.popis(cOd, p.jednotka) : null;
      var popisDo = cDo != null ? window.PKRozsah.popis(cDo, p.jednotka) : null;
      var souhrn;
      if (!popisOd && !popisDo) souhrn = 'libovolná';
      else if (popisOd && popisDo) souhrn = popisOd + ' – ' + popisDo;
      else if (popisOd) souhrn = 'od ' + popisOd;
      else souhrn = 'do ' + popisDo;
      p.hodnotaEl.textContent = souhrn;
      p.tlac.classList.toggle('mcs-aktivni', nejakyVyber);

      if (p.vymazEl) p.vymazEl.hidden = !nejakyVyber;
      if (!nejakyVyber) vybranych = hodnoty.length;
      p.hotovoEl.textContent = 'Hotovo · ' + fmt(vybranych) + ' ' +
        (vybranych === 1 ? 'nabídka' : (vybranych < 5 ? 'nabídky' : 'nabídek'));
    });
  }

  if (urgentEl) {
    var urgT = urgentEl.querySelector('.mcp-t');
    if (urgT) urgT.textContent = 'Končí do ' + DNI_KONCI + ' dní';
    else urgentEl.textContent = 'Končí do ' + DNI_KONCI + ' dní';
  }
  if (urgentEl) urgentEl.addEventListener('click', function () { urgentOnly = !urgentOnly; urgentEl.classList.toggle('on', urgentOnly); urgentEl.setAttribute('aria-pressed', String(urgentOnly)); renderList(); });
  if (favEl) favEl.addEventListener('click', function () { favOnly = !favOnly; refreshFavBtn(); renderList(); });
  if (perm2El) perm2El.addEventListener('change', function () { maxPerM2 = parseInt(perm2El.value, 10) || 0; renderList(); });
  if (levneEl) levneEl.addEventListener('click', function () {
    levneOnly = !levneOnly;
    levneEl.classList.toggle('on', levneOnly);
    levneEl.setAttribute('aria-pressed', String(levneOnly));
    renderList();
  });
  refreshFavBtn();
  renderList();
  renderRecent();

  function renderHeroLegenda() {
    var box = document.getElementById('hh-legenda');
    if (!box) return;
    var podle = {};
    DATA.forEach(function (d) { podle[d.type] = (podle[d.type] || 0) + 1; });
    [].slice.call(box.querySelectorAll('.hh-l')).forEach(function (el) {
      var t = el.getAttribute('data-druh');
      var n = podle[t] || 0;

      if (!n) { el.hidden = true; return; }
      el.hidden = false;
      var b = el.querySelector('b');
      if (b) b.textContent = fmt(n);
    });
  }

  function renderHeroLive() {
    var box = document.getElementById('hero-live');
    if (!box) return;
    var dnes = new Date(); dnes.setHours(0, 0, 0, 0);
    function den(iso) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
      if (!m) return null;
      var d = new Date(+m[1], +m[2] - 1, +m[3]); d.setHours(0, 0, 0, 0);
      return d;
    }
    function zaKolik(d) {
      var r = Math.round((d - dnes) / 86400000);
      if (r <= 0) return 'dnes';
      if (r === 1) return 'zítra';
      if (r < 5) return 'za ' + r + ' dny';
      return 'za ' + r + ' dní';
    }
    var hotovo = 0;
    function vypln(fakt, klic, hodnota, cil) {
      var a = box.querySelector('[data-fakt="' + fakt + '"]');
      if (!a) return;
      if (!hodnota) { a.hidden = true; return; }
      if (klic) a.querySelector('.hl-k').textContent = klic;

      var kus = String(hodnota).split(' · ');
      var hlavni = kus.shift();
      var vEl = a.querySelector('.hl-v');
      vEl.textContent = '';
      var bEl = document.createElement('b');
      bEl.textContent = hlavni;
      vEl.appendChild(bEl);
      if (kus.length) {

        var sep = document.createElement('span');
        sep.className = 'hl-sep';
        sep.textContent = ' · ';
        vEl.appendChild(sep);
        vEl.appendChild(document.createTextNode(kus.join(' · ')));
      }
      if (cil) a.addEventListener('click', function (e) { e.preventDefault(); gotoInzerat(cil); });

      else if (fakt === 'nove') a.addEventListener('click', function (e) {
        e.preventDefault();
        if (sortEl) { sortEl.value = 'nove'; sortEl.dispatchEvent(new Event('change', { bubbles: true })); }

        if (typeof scrollToMap === 'function') scrollToMap();
      });
      hotovo++;
    }

    var nej = null, nejD = null;
    DATA.forEach(function (d) {
      if (d.type !== 'drazba' && d.type !== 'exekuce') return;
      var m = /(\d{4}-\d{2}-\d{2})/.exec(d.extra || '');
      if (!m) return;
      var t = den(m[1]);
      if (!t || t < dnes) return;
      if (!nejD || t < nejD) { nejD = t; nej = d; }
    });
    vypln('drazba', null, nej ? (zaKolik(nejD) + ' · ' + nej.place) : '', nej);

    var dnesN = 0, tydenN = 0, sDatem = 0;
    DATA.forEach(function (d) {
      var t = den(d.first_seen);
      if (!t) return;
      sDatem++;
      var r = Math.round((dnes - t) / 86400000);
      if (r === 0) dnesN++;
      if (r >= 0 && r < 7) tydenN++;
    });
    var STROP = Math.max(1, Math.round(sDatem / 3));
    function kusy(n) { return n === 1 ? '1 pozemek' : (n < 5 ? n + ' pozemky' : fmt(n) + ' pozemků'); }
    if (dnesN > 0 && dnesN <= STROP) vypln('nove', 'Přibylo dnes', kusy(dnesN));
    else if (tydenN > 0 && tydenN <= STROP) vypln('nove', 'Přibylo za týden', kusy(tydenN));
    else vypln('nove', '', '');

    var best = null, bestO = null;
    DATA.forEach(function (d) {
      var o = MODEL ? MODEL.odhad(d) : null;

      if (!o || !o.podleVelikosti || o.pochybna || o.nejisty || o.podil || o.podOdhadem < 25) return;
      if (!bestO || o.podOdhadem > bestO.podOdhadem) { bestO = o; best = d; }
    });

    vypln('deal', null, best ? ('\u2212' + bestO.podOdhadem + ' % · ' + best.place) : '', best);

    if (hotovo) box.classList.remove('je-ceka');
    else box.hidden = true;
  }

  (function () {
    var dnes = new Date();
    var iso = dnes.getFullYear() + '-' +
      String(dnes.getMonth() + 1).padStart(2, '0') + '-' +
      String(dnes.getDate()).padStart(2, '0');
    setTimeout(function () {
      zapisUloz(NAVSTEVA_KLIC, iso);

      var klice = [];
      for (var i = 0; i < DATA.length && klice.length <= VIDENO_STROP; i++) {
        if (DATA[i].first_seen === iso) klice.push(pkey(DATA[i]));
      }
      zapisUloz(VIDENO_KLIC, klice.length > VIDENO_STROP
        ? { den: iso, vse: true }
        : { den: iso, klice: klice });
    }, 1200);
  }());

  var FILTR_KLIC = 'pk_filtr_v1';
  function ulozFiltr() {
    zapisUloz(FILTR_KLIC, { typ: activeType, druh: druhVybrane.slice(), cena: maxPrice,
      plocha: minArea, cenaOd: minPrice, plochaDo: maxArea, urgent: urgentOnly, razeni: sortMode,
      zaMetr: maxPerM2, kraj: krajFiltr, levne: levneOnly });
  }
  function obnovFiltr() {
    var f = ctiUloz(FILTR_KLIC, null);
    if (!f) return false;
    if (f.typ) activeType = f.typ;

    if (f.druh) druhVybrane = Array.isArray(f.druh) ? f.druh.slice() : [f.druh];
    if (f.cena) maxPrice = f.cena;
    if (f.plocha) minArea = f.plocha;
    urgentOnly = !!f.urgent;

    if (f.razeni && f.razeni !== 'near') sortMode = f.razeni;

    if (filtersEl) filtersEl.querySelectorAll('.filter-chip').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-type') === activeType);
    });

    if (f.cenaOd) minPrice = f.cenaOd;
    if (f.plochaDo) maxArea = f.plochaDo;
    if (cenaEl && maxPrice) cenaEl.value = String(maxPrice);
    if (cenaOdEl && minPrice) cenaOdEl.value = String(minPrice);
    if (areaEl && minArea) areaEl.value = String(minArea);
    if (areaDoEl && maxArea) areaDoEl.value = String(maxArea);
    if (f.zaMetr) maxPerM2 = f.zaMetr;
    if (f.kraj) krajFiltr = f.kraj;
    levneOnly = !!f.levne;
    if (perm2El && maxPerM2) perm2El.value = String(maxPerM2);
    if (levneEl) { levneEl.classList.toggle('on', levneOnly); levneEl.setAttribute('aria-pressed', String(levneOnly)); }
    if (urgentEl) urgentEl.checked = urgentOnly;
    if (sortEl) sortEl.value = sortMode;
    return true;
  }

  if (obnovFiltr()) renderList();

  var mistoPruh = document.getElementById('misto-pruh');
  var mistoKmEl = document.getElementById('misto-km');
  var mistoZrus = document.getElementById('misto-zrus');
  var akceZadne = document.getElementById('mp-akce-zadne');
  var akceMam = document.getElementById('mp-akce-mam');
  var vybratBtn = document.getElementById('misto-vybrat');

  var okruhKruh = null, okruhPodpis = '';
  function vykresliOkruhNaMape() {
    if (typeof map === 'undefined' || !map || typeof L === 'undefined' || !L.circle) return;
    var podpis = (dotazFiltr.okruh && okruhStred)
      ? (okruhStred.lat + ',' + okruhStred.lng + ',' + dotazFiltr.okruh) : '';

    if (podpis === okruhPodpis) return;
    okruhPodpis = podpis;
    if (okruhKruh) { map.removeLayer(okruhKruh); okruhKruh = null; }
    if (!podpis) return;
    var barva = tokenBarva('--brand-live', '#2C7150');
    okruhKruh = L.circle([okruhStred.lat, okruhStred.lng], {
      radius: dotazFiltr.okruh * 1000, pane: 'overlayPane', interactive: false,
      color: barva, weight: 1.6, opacity: 0.8,
      fillColor: barva, fillOpacity: 0.05
    }).addTo(map);
    try { map.fitBounds(okruhKruh.getBounds(), { padding: [30, 30], maxZoom: 13, animate: true }); }
    catch (e) { map.setView([okruhStred.lat, okruhStred.lng], 10, { animate: true }); }
  }

  var mistoZnacka = null, mistoKruh = null;
  function vykresliMistoNaMape() {
    if (typeof map === 'undefined' || !map) return;
    if (mistoZnacka) { map.removeLayer(mistoZnacka); mistoZnacka = null; }
    if (mistoKruh) { map.removeLayer(mistoKruh); mistoKruh = null; }
    if (!mojeMisto || !isFinite(mojeMisto.lat) || !isFinite(mojeMisto.lng)) return;
    var km = mojeMisto.km || 10;
    mistoKruh = L.circle([mojeMisto.lat, mojeMisto.lng], {
      radius: km * 1000, pane: 'overlayPane', interactive: false,
      color: '#8A5512', weight: 1.6, opacity: 0.7, dashArray: '6 5',
      fillColor: '#8A5512', fillOpacity: 0.07
    }).addTo(map);
    mistoZnacka = L.marker([mojeMisto.lat, mojeMisto.lng], {
      icon: L.divIcon({ className: 'pk-misto-wrap', html: '<span class="pk-misto"></span>',
        iconSize: [20, 20], iconAnchor: [10, 10] }),
      zIndexOffset: 900, interactive: false,
      title: (mojeMisto.nazev || 'Vaše hlídané místo') + ' — okolí do ' + km + '\u00a0km'
    }).addTo(map);
  }

  function ramujMisto() {
    if (!mistoKruh || typeof map === 'undefined' || !map) return;
    try { map.fitBounds(mistoKruh.getBounds(), { padding: [30, 30], maxZoom: 13, animate: true }); }
    catch (e) { map.setView([mojeMisto.lat, mojeMisto.lng], 11, { animate: true }); }
  }

  function vykresliMisto() {
    vykresliMistoNaMape();
    if (typeof obnovZapnout === 'function') obnovZapnout();
    if (!mistoPruh) return;
    var hl = mistoPruh.querySelector('.mp-hlavni');
    var pod = mistoPruh.querySelector('.mp-pod');
    var n = novinkyUMista();
    if (!n) {

      mistoPruh.hidden = true;
      mistoPruh.classList.remove('ma-novinky', 'bez-mista');
      if (akceZadne) akceZadne.hidden = true;
      if (akceMam) akceMam.hidden = true;
      return;
    }
    mistoPruh.hidden = false;
    mistoPruh.classList.remove('bez-mista');
    if (akceZadne) akceZadne.hidden = true;
    if (akceMam) akceMam.hidden = false;
    if (n.nove > 0) {
      hl.textContent = 'Od minule přibyl' + (n.nove === 1 ? ' 1 pozemek' : (n.nove < 5 ? 'y ' + n.nove + ' pozemky' : 'o ' + n.nove + ' pozemků')) + ' ve vašem okolí';
      mistoPruh.classList.add('ma-novinky');
    } else {
      hl.textContent = 'Ve vašem okolí od minule nic nového';
      mistoPruh.classList.remove('ma-novinky');
    }

    pod.textContent = (n.nazev !== 'vašeho místa' ? 'Hlídané místo: ' + n.nazev + ' · ' : 'Hlídané místo · ') +
      'okolí do ' + n.okruh + ' km · je tu ' + n.celkem + ' ' +
      (n.celkem === 1 ? 'pozemek' : (n.celkem < 5 ? 'pozemky' : 'pozemků'));
    if (mistoKmEl) mistoKmEl.value = String(n.okruh);
  }
  if (mistoKmEl) mistoKmEl.addEventListener('change', function () {
    if (!mojeMisto) return;
    mojeMisto.km = parseInt(mistoKmEl.value, 10) || 10;
    ulozMisto(mojeMisto);
    vykresliMisto();
    ramujMisto();
    updateKrajHead();
    renderList();
  });
  if (mistoZrus) mistoZrus.addEventListener('click', function () {
    ulozMisto(null);
    okoliZap = false;
    nearMode = false;
    if (nearBtn) nearBtn.classList.remove('on');
    if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    sortMode = 'demand';
    if (sortEl) sortEl.value = 'demand';
    vykresliMisto();
    updateKrajHead();
    renderList();
  });

  var zapnoutBtn = document.getElementById('misto-zapnout');
  function obnovZapnout() {
    if (!zapnoutBtn) return;
    var zap = okoliAktivni();
    zapnoutBtn.textContent = zap ? 'Zobrazit celou ČR' : 'Ukázat jen okolí';
    zapnoutBtn.classList.toggle('on', zap);
    zapnoutBtn.setAttribute('aria-pressed', String(zap));
  }
  if (zapnoutBtn) zapnoutBtn.addEventListener('click', function () {
    if (okoliAktivni()) { vypniOkoli(); }
    else if (mojeMisto) { enterNearAt({ lat: mojeMisto.lat, lng: mojeMisto.lng }, !!mojeMisto.pribl, mojeMisto.nazev); }
    obnovZapnout();
  });

  if (vybratBtn) vybratBtn.addEventListener('click', function () { otevriVyberMista(); });

  var zmenitBtn = document.getElementById('misto-zmenit');
  if (zmenitBtn) zmenitBtn.addEventListener('click', function () { otevriVyberMista(); });
  vykresliMisto();

  renderHeroLive();
  renderHeroLegenda();

  (function (dokonci) {
    if (typeof requestAnimationFrame !== 'function') { dokonci(); return; }
    requestAnimationFrame(function () { requestAnimationFrame(dokonci); });
  }(function () {
    renderDeals();
    renderUserListings();
  }));

  function restoreMapReturn() {
    var ret = null;
    try { ret = JSON.parse(sessionStorage.getItem('pk_map_return') || 'null'); } catch (e) {}
    try { sessionStorage.removeItem('pk_map_return'); } catch (e) {}
    if (!ret || typeof ret.lat !== 'number' || !ret.t) return false;
    if (Date.now() - ret.t > 30 * 60 * 1000) return false;
    var z = ret.z || 12;
    if (ret.kraj) { try { selectKraj(ret.kraj, true); } catch (e) {} }
    map.invalidateSize();
    map.setView([ret.lat, ret.lng], z, { animate: false });
    if (z >= 10) { try { if (dotsLocked) lockDots(false); } catch (e) {} }

    if (holderEl) { [60, 240, 500].forEach(function (ms) { setTimeout(function () { holderEl.scrollIntoView({ block: 'center' }); }, ms); }); }
    return true;
  }

  var deepLinked = openFromUrl() || obnovZAdresy() || restoreMapReturn();

  setTimeout(function () { map.invalidateSize(); if (!deepLinked) fitAllCZ(); }, 300);
  }

  function loadJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  Promise.all([loadJSON('data/opportunities.json'), loadJSON('data/kraje.json'), loadJSON('data/user-listings.json'), sbRpc('public_listings')])
    .then(function (res) {
      var j = res[0], kraje = res[1], ul = res[2], live = res[3];
      var arr = Array.isArray(j) ? j : (j && j.opportunities);

      var nouzovyRezim = !(arr && arr.length);
      var base = (nouzovyRezim ? FALLBACK_DATA.slice() : arr.slice());
      if (nouzovyRezim) {
        try {
          var pas = document.createElement('div');
          pas.className = 'datovy-vypadek';
          pas.setAttribute('role', 'status');
          pas.innerHTML = '<b>Nepodařilo se načíst nabídky.</b> ' +
            'Ukazujeme jen malou ukázku, ne celou republiku — zkuste stránku za chvíli obnovit. ' +
            '<button type="button" class="dv-znovu">Zkusit znovu</button>';
          var kam = document.querySelector('.map-app');
          if (kam && kam.parentNode) kam.parentNode.insertBefore(pas, kam);
          var bt = pas.querySelector('.dv-znovu');
          if (bt) bt.addEventListener('click', function () { location.reload(); });
        } catch (e) {}
      }

      var users = Array.isArray(ul) ? ul : (ul && ul.listings);
      if (users && users.length) {
        users.forEach(function (u) {
          if (!u || typeof u.lat !== 'number' || typeof u.lng !== 'number') return;
          u.type = 'majitel';
          if (!u.extra) u.extra = 'od majitele';
          base.push(u);
        });
      }

      PKCisteni.majitele(live).forEach(function (d) { base.push(d); });

      base = PKCisteni.pozemky(base);
      boot(base, kraje || null, j && j.updated, j && j.updated_at, j && j.sources);
    });
})();
