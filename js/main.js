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
  // 14 krajů ČR — přehled po krajích (rozdělení mapy). Okres → kraj + střed kraje.
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

  // Katastrální mapa (ikatastr.cz) — parametr "info" na souřadnicích parcelu
  // rovnou IDENTIFIKUJE a vyznačí (ukáže bublinu s parcelou), ne jen vycentruje.
  function katastrUrl(d){ return 'https://www.ikatastr.cz/#info=' + d.lat + ',' + d.lng; }
  function mapyUrl(d){ return 'https://mapy.cz/zakladni?x=' + d.lng + '&y=' + d.lat + '&z=18&source=coor&id=' + d.lng + ',' + d.lat; }
  // Státní půda SPÚ (§ 12) nemá stránku pro konkrétní parcelu — prodává se přes
  // veřejnou nabídku, kam se podává žádost. Odkážeme tedy na skutečný seznam nabídek.
  var SPU_OFFERS = 'https://spu.gov.cz/nabidky/prehled-cela-cr';
  function isSPU(d){ return d.type === 'sale' && !d.url && /SPÚ|státní půd/i.test(d.extra || ''); }
  // Vede odkaz na KONKRÉTNÍ inzerát/dražbu (má cestu nebo parametr),
  // nebo jen na úvodní stránku portálu? Podle toho volíme poctivý štítek,
  // ať tlačítko neslibuje konkrétní stránku, když otevře jen rozcestník.
  function isDeepLink(url){
    try {
      var u = new URL(url);
      return (u.pathname && u.pathname.replace(/\/+$/, '').length > 1) || !!u.search;
    } catch (e) { return false; }
  }
  // Konkrétní akční odkaz „kde se to kupuje / kde s tím něco udělám"
  function sourceLink(d){
    if (d.url) {
      if (isDeepLink(d.url)) return { url: d.url, label: d.type === 'sale' ? 'Inzerát' : 'K dražbě' };
      // jen homepage portálu → řekneme to na rovinu, ať proklik nemate
      return { url: d.url, label: d.type === 'sale' ? 'Web prodejce' : 'Dražební portál' };
    }
    if (isSPU(d)) return { url: SPU_OFFERS, label: 'Nabídka SPÚ' };
    return { url: TYPE[d.type].link.url, label: TYPE[d.type].link.label };
  }
  // Ikona záložky (uložení pozemku) — výplň řídí CSS podle stavu .on
  var BM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';
  // Stabilní klíč pozemku (přežije nové stažení dat i drobný posun GPS) —
  // pro oblíbené i sdílení. Záměrně bez souřadnic, které se mohou mírně měnit.
  function pkey(d){ return [d.place || '', d.parcel || '', d.okres || ''].join('|'); }
  // Zkopírování textu do schránky s bezpečnou zálohou pro starší prohlížeče
  function copyText(text, onDone){
    function fallback(){
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); onDone && onDone(); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function(){ onDone && onDone(); }).catch(fallback);
    } else { fallback(); }
  }

  function fmt(n){ return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  // Počet dní do termínu dražby z reálného data v poli extra (např. „dražba 2026-09-02")
  function daysUntil(extra){
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(extra || '');
    if (!m) return null;
    var target = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(target)) return null;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((target - now) / 86400000);
  }
  function countdownText(days){
    if (days < 0) return 'proběhlo';
    if (days === 0) return 'dnes';
    if (days === 1) return 'zítra';
    if (days <= 6) return 'za ' + days + (days <= 4 ? ' dny' : ' dní');
    if (days <= 13) return 'za týden';
    if (days <= 27) return 'za ' + Math.round(days / 7) + ' týdny';
    return 'za ' + Math.round(days / 30) + ' měs.';
  }
  function countdownClass(days){
    if (days == null || days < 0) return '';
    if (days <= 7) return ' urg';
    if (days <= 30) return ' soon';
    return '';
  }
  // Termín dražby jako YYYYMMDD (z reálného data v extra) — pro kalendář (.ics)
  function auctionYMD(extra){
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(extra || '');
    return m ? m[1] + m[2] + m[3] : null;
  }
  function icsEsc(s){ return String(s).replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n'); }
  function pad2(n){ return (n < 10 ? '0' : '') + n; }
  // Sestaví .ics událost (celodenní na den dražby) s připomínkou den předem
  function icsFor(d){
    var ymd = auctionYMD(d.extra);
    if (!ymd) return null;
    var y = +ymd.slice(0, 4), mo = +ymd.slice(4, 6), da = +ymd.slice(6, 8);
    var end = new Date(y, mo - 1, da + 1);
    var endYMD = end.getFullYear() + pad2(end.getMonth() + 1) + pad2(end.getDate());
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    var url = location.origin + location.pathname + '?p=' + encodeURIComponent(pkey(d));
    var kind = d.type === 'exekuce' ? 'Exekuční dražba' : 'Dražba';
    var summary = kind + ': ' + d.place + ' (parc. ' + d.parcel + ')';
    var desc = [d.druh, hasArea(d) ? fmt(d.area) + ' m²' : '', 'vyvolávací ' + fmt(d.price) + ' Kč', url].filter(Boolean).join(', ');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pozemkomat//CS', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + encodeURIComponent(pkey(d)) + '@pozemkomat',
      'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + ymd,
      'DTEND;VALUE=DATE:' + endYMD,
      'SUMMARY:' + icsEsc(summary),
      'DESCRIPTION:' + icsEsc(desc),
      'LOCATION:' + icsEsc(d.place + ', okres ' + d.okres),
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(summary), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
  }
  function hasArea(d){ return typeof d.area === 'number' && d.area > 0; }
  function areaTxt(d){ return hasArea(d) ? fmt(d.area) + ' m²' : 'neuvedena'; }
  // Číslo parcely nemají všechny zdroje (typicky inzeráty) — pak ho nezobrazujeme jako „—".
  function hasParcel(d){ return d.parcel && d.parcel !== '—' && d.parcel !== ''; }
  // Sloučení mnoha variant druhu do pár skupin pro filtr
  function druhGroup(s){
    s = (s || '').toLowerCase();
    if (s.indexOf('les') !== -1) return 'Lesní pozemek';
    if (s.indexOf('stavební') !== -1 || s.indexOf('zastav') !== -1) return 'Stavební / zastavěná';
    if (s.indexOf('orná') !== -1) return 'Orná půda';
    if (s.indexOf('zahrad') !== -1) return 'Zahrada';
    if (s.indexOf('travní') !== -1 || s.indexOf('louk') !== -1 || s.indexOf('pastvin') !== -1) return 'Louka / travní porost';
    if (s.indexOf('vinice') !== -1 || s.indexOf('sad') !== -1) return 'Vinice / sad';
    if (s.indexOf('ostatní') !== -1) return 'Ostatní plocha';
    return 'Jiný pozemek';
  }

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
    if (ti) ti.textContent = okres ? ('Upozornění na okres ' + okres) : 'Upozornění na lokalitu';
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
    if (e.target.closest('[data-close]')) { closeWatch(); closeLogin(); closeInfo(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeWatch(); closeLogin(); closeInfo(); } });

  /* ---------- Odesílání formulářů (bez serveru, přes Formspree) ----------
     Aby formuláře (hlídání lokality i poptávka realitek) opravdu někam dorazily,
     stačí bezplatná služba Formspree — nepotřebuje vlastní server:
       1) Založ si účet na https://formspree.io (zdarma, ~2 minuty).
       2) Vytvoř formulář a zkopíruj jeho URL (např. https://formspree.io/f/abcdwxyz).
       3) Vlož ji níže do FORM_ENDPOINT — a je to živé.
     Dokud je prázdné, formuláře fungují „nanečisto": nic se neodešle a nikde
     netvrdíme, že zpráva opravdu dorazila. */
  var FORM_ENDPOINT = ''; // ← sem vlož URL z Formspree
  function sendForm(data) {
    if (!FORM_ENDPOINT) return Promise.resolve('unset');
    return fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) { return r.ok ? 'ok' : 'error'; }).catch(function () { return 'error'; });
  }

  var wForm = document.getElementById('watch-form');
  if (wForm) {
    wForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('wm-email').value.trim();
      var okres = document.getElementById('wm-okres').value.trim();
      var ms = document.getElementById('wm-msg');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ms.textContent = 'Zadejte prosím platný e-mail.'; ms.classList.add('err'); return; }
      ms.classList.remove('err');
      if (!FORM_ENDPOINT) {
        ms.textContent = 'Upozornění teprve dokončujeme — spustíme je, jakmile přidáme odesílání. Díky za trpělivost!';
        return;
      }
      ms.textContent = 'Odesílám…';
      sendForm({ _subject: 'Hlídání lokality — Pozemkomat', typ: 'Hlídání lokality', okres: okres || '(neuvedeno)', email: email }).then(function (r) {
        if (r === 'ok') { ms.textContent = okres ? ('Hotovo! Budeme hlídat okres „' + okres + '" a dáme vědět.') : 'Hotovo! Ozveme se, jakmile se objeví něco ve vašem okolí.'; setTimeout(closeWatch, 1900); }
        else { ms.textContent = 'Odeslání se teď nepovedlo, zkuste to prosím za chvíli znovu.'; ms.classList.add('err'); }
      });
    });
  }

  /* ---------- Přihlášení / lokální profil ---------- */
  var USER_KEY = 'pk_user_v1';
  var lModal = document.getElementById('login-modal');
  var navLoginBtn = document.getElementById('btn-login');
  var navProfile = document.getElementById('nav-profile');
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; } }
  function setUser(u) { try { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); } catch (e) {} renderAuth(); }
  function favKeys() { try { return JSON.parse(localStorage.getItem('pk_fav_v1')) || []; } catch (e) { return []; } }
  function favCount() { return favKeys().length; }
  // Krátká oznamovací hláška (toast)
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
  // Seznam uložených pozemků v profilu (názvy obcí z klíčů place|parcel|okres)
  function renderSavedList() {
    var el = document.getElementById('pm-saved-list');
    if (!el) return;
    var keys = favKeys();
    if (!keys.length) { el.innerHTML = '<div class="pm-empty">Zatím žádné. Uložte si pozemek záložkou u nabídky.</div>'; return; }
    el.innerHTML = keys.slice(0, 4).map(function (k) {
      var p = k.split('|'); return '<div class="pm-saved-item"><b>' + (p[0] || 'Pozemek') + '</b><span>parc. ' + (p[1] || '—') + '</span></div>';
    }).join('') + (keys.length > 4 ? '<div class="pm-saved-more">+ ' + (keys.length - 4) + ' dalších</div>' : '');
  }
  /* ---------- Účet: telefon + heslo (lokálně, hesla se hashují) ---------- */
  var ACCT_KEY = 'pk_acct_v1';
  function getAcct() { try { return JSON.parse(localStorage.getItem(ACCT_KEY)); } catch (e) { return null; } }
  function setAcct(a) { try { a ? localStorage.setItem(ACCT_KEY, JSON.stringify(a)) : localStorage.removeItem(ACCT_KEY); } catch (e) {} }
  // Telefon → jen 9 číslic (bez +420 / mezer), pro porovnání a uložení
  function normPhone(v) {
    var d = (v || '').replace(/\s|-|\(|\)/g, '');
    if (d.indexOf('+420') === 0) d = d.slice(4);
    else if (d.indexOf('00420') === 0) d = d.slice(5);
    return d.replace(/\D/g, '');
  }
  function validPhone(v) { return /^\d{9}$/.test(normPhone(v)); }
  function fmtPhone(v) { var d = normPhone(v); return d.length === 9 ? (d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6)) : d; }
  // Heslo neukládáme v čitelné podobě — uložíme jen jeho otisk (SHA-256).
  function hashPass(phone, pass) {
    var txt = 'pk|' + normPhone(phone) + '|' + pass;
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)).then(function (h) {
        return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
    }
    var n = 5381; for (var i = 0; i < txt.length; i++) { n = ((n << 5) + n) ^ txt.charCodeAt(i); }
    return Promise.resolve('x' + (n >>> 0).toString(16));
  }

  var loginMode = 'login';
  function setLoginMode(mode) {
    loginMode = (mode === 'register') ? 'register' : 'login';
    var isReg = loginMode === 'register';
    var nameRow = document.getElementById('lf-name-row');
    var pass2Row = document.getElementById('lf-pass2-row');
    if (nameRow) nameRow.hidden = !isReg;
    if (pass2Row) pass2Row.hidden = !isReg;
    var submit = document.getElementById('login-submit'); if (submit) submit.textContent = isReg ? 'Vytvořit účet' : 'Přihlásit se';
    var title = document.getElementById('login-title'); if (title) title.textContent = isReg ? 'Vytvořit účet' : 'Přihlášení';
    var sub = document.getElementById('login-sub');
    if (sub) sub.textContent = isReg
      ? 'Zadejte číslo a zvolte si heslo. Účet se uloží v tomto prohlížeči.'
      : 'Přihlaste se telefonním číslem a heslem.';
    var passEl = document.getElementById('login-pass'); if (passEl) passEl.setAttribute('autocomplete', isReg ? 'new-password' : 'current-password');
    document.querySelectorAll('.login-tab').forEach(function (t) {
      var on = t.getAttribute('data-mode') === loginMode;
      t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on));
    });
    var ms = document.getElementById('login-msg'); if (ms) { ms.textContent = ''; ms.classList.remove('err'); }
  }

  function openLogin() {
    if (!lModal) return;
    var acct = getAcct();
    setLoginMode(acct ? 'login' : 'register');
    var phoneInput = document.getElementById('login-phone');
    if (phoneInput) phoneInput.value = acct ? fmtPhone(acct.phone) : '';
    var p1 = document.getElementById('login-pass'); if (p1) p1.value = '';
    var p2 = document.getElementById('login-pass2'); if (p2) p2.value = '';
    var nm = document.getElementById('login-name'); if (nm) nm.value = '';
    lModal.removeAttribute('hidden');
    requestAnimationFrame(function () { lModal.classList.add('open'); });
    document.body.style.overflow = 'hidden';
    setTimeout(function () { var t = acct ? p1 : phoneInput; if (t) t.focus(); }, 80);
  }
  function closeLogin() {
    if (!lModal) return;
    lModal.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () { lModal.setAttribute('hidden', ''); }, 250);
  }
  function renderAuth() {
    var u = getUser();
    if (!navLoginBtn || !navProfile) return;
    if (u) {
      var ident = u.phone ? fmtPhone(u.phone) : (u.email || '');
      var name = u.name || (u.phone ? fmtPhone(u.phone) : (u.email ? u.email.split('@')[0] : 'Účet'));
      var initial = (u.name && u.name.trim()[0]) || (u.email && u.email[0]) || (u.phone && u.phone.slice(-2, -1)) || '?';
      navLoginBtn.setAttribute('hidden', '');
      navProfile.removeAttribute('hidden');
      document.getElementById('profile-name').textContent = name;
      document.getElementById('avatar').textContent = String(initial).toUpperCase();
      document.getElementById('pm-email').textContent = ident;
      document.getElementById('pm-saved-n').textContent = favCount();
      renderSavedList();
    } else {
      navLoginBtn.removeAttribute('hidden');
      navProfile.setAttribute('hidden', '');
      var pm = document.getElementById('profile-menu'); if (pm) pm.setAttribute('hidden', '');
    }
  }
  if (navLoginBtn) navLoginBtn.addEventListener('click', openLogin);
  document.querySelectorAll('.login-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      setLoginMode(t.getAttribute('data-mode'));
      var acct = getAcct(); var phoneInput = document.getElementById('login-phone');
      if (loginMode === 'login' && acct && phoneInput && !phoneInput.value) phoneInput.value = fmtPhone(acct.phone);
    });
  });
  var lForm = document.getElementById('login-form');
  if (lForm) lForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var ms = document.getElementById('login-msg'); if (!ms) return;
    ms.classList.remove('err');
    var phoneRaw = document.getElementById('login-phone').value;
    var pass = document.getElementById('login-pass').value;
    var name = (document.getElementById('login-name').value || '').trim();
    if (!validPhone(phoneRaw)) { ms.textContent = 'Zadejte platné české číslo (9 číslic).'; ms.classList.add('err'); return; }
    if (!pass || pass.length < 6) { ms.textContent = 'Heslo musí mít aspoň 6 znaků.'; ms.classList.add('err'); return; }
    var phone = normPhone(phoneRaw);

    if (loginMode === 'register') {
      var pass2 = document.getElementById('login-pass2').value;
      if (pass !== pass2) { ms.textContent = 'Hesla se neshodují.'; ms.classList.add('err'); return; }
      var existing = getAcct();
      if (existing && existing.phone !== phone) {
        ms.textContent = 'V tomto prohlížeči už je účet pro jiné číslo. Nejdřív se odhlaste.'; ms.classList.add('err'); return;
      }
      hashPass(phone, pass).then(function (h) {
        setAcct({ phone: phone, name: name, passHash: h });
        setUser({ phone: phone, name: name });
        ms.textContent = 'Účet vytvořen, vítejte!';
        showToast('Účet vytvořen. Uložené pozemky teď najdete v profilu.');
        setTimeout(closeLogin, 900);
      });
    } else {
      var acct = getAcct();
      if (!acct) { ms.textContent = 'Na tohle číslo tu ještě není účet — vytvořte si ho.'; ms.classList.add('err'); setLoginMode('register'); return; }
      if (acct.phone !== phone) { ms.textContent = 'Na tohle číslo tu není účet. Zkontrolujte číslo, nebo si vytvořte účet.'; ms.classList.add('err'); return; }
      hashPass(phone, pass).then(function (h) {
        if (h !== acct.passHash) { ms.textContent = 'Nesprávné heslo.'; ms.classList.add('err'); return; }
        setUser({ phone: phone, name: acct.name || name });
        ms.textContent = 'Přihlášeno, vítejte zpět!';
        showToast('Vítejte zpět' + (acct.name ? ', ' + acct.name.split(' ')[0] : '') + '!');
        setTimeout(closeLogin, 900);
      });
    }
  });
  // Rozbalení profilového menu
  var profChip = document.getElementById('profile-chip');
  if (profChip) profChip.addEventListener('click', function (e) {
    e.stopPropagation();
    var pm = document.getElementById('profile-menu');
    var open = pm.hasAttribute('hidden');
    if (open) { pm.removeAttribute('hidden'); document.getElementById('pm-saved-n').textContent = favCount(); renderSavedList(); }
    else pm.setAttribute('hidden', '');
    profChip.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', function (e) {
    var pm = document.getElementById('profile-menu');
    if (pm && !pm.hasAttribute('hidden') && !e.target.closest('#nav-profile')) pm.setAttribute('hidden', '');
  });
  var pmLogout = document.getElementById('pm-logout');
  if (pmLogout) pmLogout.addEventListener('click', function () { setUser(null); showToast('Odhlášeno. Uložené pozemky zůstávají ve vašem prohlížeči.'); });
  var pmViewMap = document.getElementById('pm-view-map');
  if (pmViewMap) pmViewMap.addEventListener('click', function () {
    var favBtn = document.getElementById('map-fav');
    document.getElementById('profile-menu').setAttribute('hidden', '');
    if (!favCount()) { showToast('Zatím nemáte uložené pozemky. Uložte si je záložkou u nabídky.'); return; }
    if (favBtn && favBtn.getAttribute('aria-pressed') !== 'true') setTimeout(function () { favBtn.click(); }, 500);
  });
  renderAuth();

  /* ---------- Zásady soukromí / Podmínky (info modal) ---------- */
  var INFO = {
    soukromi: {
      t: 'Zásady soukromí',
      h: '<p>Pozemkomat je ve veřejné bétě. Upřímně, jak zacházíme s daty:</p>' +
        '<ul>' +
        '<li><b>E-mail:</b> použijeme jen pro upozornění nebo poptávku, o kterou si sami řeknete. Neprodáváme ho a neposíláme spam — kdykoli se odhlásíte.</li>' +
        '<li><b>Účet a uložené pozemky:</b> běží zatím jen ve vašem prohlížeči (localStorage). Nic se neodesílá na server.</li>' +
        '<li><b>Data o pozemcích:</b> pocházejí z veřejných zdrojů (dražby, SPÚ, inzeráty, katastr). Nezveřejňujeme osobní údaje vlastníků.</li>' +
        '<li><b>Provoz:</b> web běží na GitHub Pages. Žádné reklamní ani sledovací skripty třetích stran.</li>' +
        '</ul><p>Dotaz? Napište nám přes <a href="#realitky" data-close>kontaktní formulář</a>.</p>'
    },
    podminky: {
      t: 'Podmínky použití',
      h: '<p>Pozemkomat je bezplatný nástroj ve veřejné bétě. Sbírá a zobrazuje příležitosti u pozemků z veřejných zdrojů.</p>' +
        '<ul>' +
        '<li>Data mají <b>informativní charakter</b>. Vždy si je ověřte v oficiálním katastru a u zdroje (dražba, úřad, prodejce). Pozemkomat neručí za jejich úplnost ani aktuálnost.</li>' +
        '<li>Pozemkomat <b>není účastníkem</b> dražeb ani prodejů a neposkytuje právní ani investiční poradenství.</li>' +
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
  });

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
      if (!FORM_ENDPOINT) {
        msg.textContent = 'Upozornění teprve dokončujeme — spustíme je, jakmile přidáme odesílání. Díky!';
        return;
      }
      msg.textContent = 'Odesílám…';
      sendForm({ _subject: 'Hlídání lokality — Pozemkomat', typ: 'Hlídání lokality', okres: okres || '(neuvedeno)', email: email }).then(function (r) {
        if (r === 'ok') {
          msg.textContent = okres ? ('Hotovo! Budeme hlídat okres „' + okres + '" a dáme vědět.') : 'Hotovo! Ozveme se, jakmile se objeví něco ve vašem okolí.';
          form.reset();
        } else { msg.textContent = 'Odeslání se teď nepovedlo, zkuste to prosím za chvíli znovu.'; msg.classList.add('err'); }
      });
    });
  }

  /* ---------- Poptávkový formulář pro realitky/obce ---------- */
  var rForm = document.getElementById('realtor-form');
  if (rForm) {
    rForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('rc-name').value.trim();
      var email = document.getElementById('rc-email').value.trim();
      var out = document.getElementById('rc-msg-out');
      if (!name) { out.textContent = 'Napište prosím jméno.'; out.classList.add('err'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { out.textContent = 'Zadejte prosím platný e-mail.'; out.classList.add('err'); return; }
      out.classList.remove('err');
      var org = document.getElementById('rc-org').value.trim();
      var text = document.getElementById('rc-msg').value.trim();
      if (!FORM_ENDPOINT) {
        out.textContent = 'Díky, ' + name.split(' ')[0] + '! Odesílání poptávek právě zprovozňujeme — zkuste to prosím za chvíli znovu.';
        return;
      }
      out.textContent = 'Odesílám…';
      sendForm({ _subject: 'Poptávka realitky/obce — Pozemkomat', typ: 'Poptávka realitky/obce', jmeno: name, firma: org || '(neuvedeno)', email: email, zprava: text || '(bez zprávy)' }).then(function (r) {
        if (r === 'ok') { out.textContent = 'Díky, ' + name.split(' ')[0] + '! Poptávka dorazila, ozveme se vám na ' + email + '.'; rForm.reset(); }
        else { out.textContent = 'Odeslání se teď nepovedlo, zkuste to prosím za chvíli znovu.'; out.classList.add('err'); }
      });
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
  function boot(DATA, KRAJE_GEOM, updated) {
  // Počítadla napojíme na skutečná data (počet příležitostí, počet okresů)
  (function () {
    var nums = document.querySelectorAll('.counters .c-num');
    if (!nums.length) return;
    if (nums[0]) nums[0].setAttribute('data-count', String(DATA.length));
    if (nums[1]) {
      var okr = {};
      DATA.forEach(function (d) { if (d.okres) okr[d.okres] = 1; });
      nums[1].setAttribute('data-count', String(Object.keys(okr).length));
    }
  })();

  // „Naposledy aktualizováno" — signál čerstvosti dat (z pole updated)
  (function () {
    var el = document.getElementById('data-updated');
    if (!el || !updated) return;
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(updated);
    el.textContent = m ? ('Data aktualizována ' + (+m[3]) + '. ' + (+m[2]) + '. ' + m[1]) : '';
  })();

  // Živé počty u kategorií v sekci „Co na mapě uvidíte"
  (function () {
    var byType = {};
    DATA.forEach(function (d) { byType[d.type] = (byType[d.type] || 0) + 1; });
    document.querySelectorAll('.status-n').forEach(function (el) {
      var n = byType[el.getAttribute('data-type')] || 0;
      el.textContent = n ? (n + ' teď na mapě') : 'zatím žádné';
      if (!n) el.classList.add('is-zero');
    });
  })();

  /* ---------- Živý ticker příležitostí ---------- */
  var tickTrack = document.getElementById('ticker-track');
  if (tickTrack) {
    // Jen pár položek, ať pás není přehnaně dlouhý (dřív všech 234 → letělo to jak blesk)
    var tickItems = DATA.slice(0, 18);
    var html = '';
    tickItems.forEach(function (d) {
      html += '<span class="tick-item"><span class="td" style="background:' + TYPE[d.type].color + '"></span>' +
        TYPE[d.type].label + ' · <b>' + d.place + '</b> · ' + areaTxt(d) + ' · ' + d.extra + '</span>';
    });
    tickTrack.innerHTML = html + html; // zdvojení pro plynulou nekonečnou smyčku
    // Rychlost nastavíme podle skutečné šířky ~ pohodlných 55 px/s (plynulé, čitelné)
    requestAnimationFrame(function () {
      var w = tickTrack.scrollWidth / 2;
      if (w > 0) tickTrack.style.animationDuration = Math.max(30, Math.round(w / 55)) + 's';
    });
  }

  /* ---------- Interaktivní mapa (Leaflet) ---------- */
  var mapEl = document.getElementById('leaflet-map');
  if (!mapEl || typeof L === 'undefined') return;

  // Start oddálený na celou ČR (přesné vyrovnání na data řeší fitAllCZ níže).
  var map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: true }).setView([49.82, 15.47], 7);
  if (map.zoomControl) map.zoomControl.setPosition('topright'); // uvolní místo pro nadpis kraje
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
  var druhEl = document.getElementById('map-druh');
  var sortEl = document.getElementById('map-sort');
  var cenaEl = document.getElementById('map-cena');
  var detailEl = document.getElementById('opp-detail');
  var favEl = document.getElementById('map-fav');
  var activeType = 'all';
  var activeDruh = 'all';
  var sortMode = 'demand';
  var maxPrice = 0;
  var searchTerm = '';
  var favOnly = false;
  var markers = [];

  /* ---------- Oblíbené pozemky (uložené v prohlížeči) ---------- */
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
  }

  // Index cen za m² podle typu+druhu — pro poctivé srovnání v detailu.
  // Percentil (0–100) je omezený, takže nikdy nevznikne nesmysl typu „+7130 %".
  var perM2Index = (function () {
    var idx = {};
    DATA.forEach(function (d) {
      if (hasArea(d) && d.price) {
        var k = d.type + '|' + druhGroup(d.druh);
        (idx[k] = idx[k] || []).push(d.price / d.area);
      }
    });
    Object.keys(idx).forEach(function (k) { idx[k].sort(function (a, b) { return a - b; }); });
    return idx;
  })();
  function priceBarHtml(d) {
    if (!hasArea(d) || !d.price) return '';
    var g = druhGroup(d.druh);
    var arr = perM2Index[d.type + '|' + g];
    if (!arr || arr.length < 8) return ''; // bez dostatečného vzorku srovnání neukazujeme
    if (arr[arr.length - 1] <= arr[0] * 1.15) return ''; // skoro stejné ceny → srovnání nedává smysl
    var val = d.price / d.area;
    var below = 0;
    for (var i = 0; i < arr.length; i++) { if (arr[i] <= val) below++; }
    var pct = Math.max(2, Math.min(98, Math.round(below / arr.length * 100))); // 0 = nejlevnější
    var cls, label;
    if (pct <= 35) { cls = 'good'; label = 'levnější než ' + (100 - pct) + ' % podobných'; }
    else if (pct >= 65) { cls = 'bad'; label = 'dražší než ' + pct + ' % podobných'; }
    else { cls = 'mid'; label = 'průměrná cena mezi podobnými'; }
    var typeWord = d.type === 'sale' ? 'v prodeji' : (d.type === 'drazba' ? 'v dražbě' : 'v nabídce');
    return '<div class="md-bar ' + cls + '">' +
      '<div class="md-bar-head"><span>Cena/m² mezi „' + g.toLowerCase() + '" ' + typeWord + '</span><b>' + label + '</b></div>' +
      '<div class="md-bar-track"><span class="md-bar-med" style="left:50%"></span><span class="md-bar-dot" style="left:' + pct + '%"></span></div>' +
      '</div>';
  }

  // Naplníme filtr druhů podle toho, co je v datech (s počty)
  if (druhEl) {
    var gc = {};
    DATA.forEach(function (d) { var g = druhGroup(d.druh); gc[g] = (gc[g] || 0) + 1; });
    Object.keys(gc).sort(function (a, b) { return gc[b] - gc[a]; }).forEach(function (g) {
      var o = document.createElement('option');
      o.value = g; o.textContent = g + ' (' + gc[g] + ')';
      druhEl.appendChild(o);
    });
  }

  // Filtr kategorie ukážeme jen tehdy, když v datech opravdu nějaká je
  // (prázdné kategorie, např. obecní záměry, tak nevytvářejí mrtvý tab —
  // a jakmile se data objeví, tlačítko se samo vrátí).
  if (filtersEl) {
    var present = {}, typeCount = {};
    DATA.forEach(function (d) { present[d.type] = true; typeCount[d.type] = (typeCount[d.type] || 0) + 1; });
    filtersEl.querySelectorAll('.filter-chip').forEach(function (b) {
      var tp = b.getAttribute('data-type');
      if (tp && tp !== 'all' && !present[tp]) { b.style.display = 'none'; return; }
      var n = tp === 'all' ? DATA.length : (typeCount[tp] || 0);
      var badge = document.createElement('span');
      badge.className = 'chip-n';
      badge.textContent = n;
      b.appendChild(badge);
    });
  }

  if (detailEl) {
    detailEl.addEventListener('click', function (e) {
      if (e.target.closest('[data-detail-back]')) { hideDetail(); return; }
      if (!curDetail) return;
      var favBtn = e.target.closest('[data-fav-detail]');
      if (favBtn) {
        toggleFav(curDetail);
        var on = isFav(curDetail);
        favBtn.classList.toggle('on', on);
        var sp = favBtn.querySelector('span'); if (sp) sp.textContent = on ? 'Uloženo' : 'Uložit';
        renderList();
        return;
      }
      var calBtn = e.target.closest('[data-cal]');
      if (calBtn) {
        var ics = icsFor(curDetail);
        if (ics) {
          var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
          var u = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = u;
          a.download = 'drazba-' + String(curDetail.place || 'pozemek').replace(/[^\w]+/g, '-') + '.ics';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
        }
        return;
      }
      var shareBtn = e.target.closest('[data-share]');
      if (shareBtn) {
        var url = location.origin + location.pathname + '?p=' + encodeURIComponent(pkey(curDetail));
        var title = 'Pozemek ' + curDetail.place + ' — Pozemkomat';
        if (navigator.share) {
          navigator.share({ title: title, url: url }).catch(function () {});
        } else {
          copyText(url, function () {
            var orig = shareBtn.textContent;
            shareBtn.textContent = 'Odkaz zkopírován ✓';
            shareBtn.classList.add('on');
            setTimeout(function () { shareBtn.textContent = orig; shareBtn.classList.remove('on'); }, 1800);
          });
        }
      }
    });
  }

  function isUrgent(d) {
    if (d.type !== 'drazba' && d.type !== 'exekuce') return false;
    var dd = daysUntil(d.extra);
    return dd != null && dd >= 0 && dd <= 7;
  }
  // Jednotlivý pozemek = čistá tečka v barvě kategorie (ukáže se po přiblížení)
  function markerIcon(d) {
    var col = TYPE[d.type].color;
    return L.divIcon({
      className: '',
      html: '<span class="pk-dot' + (isUrgent(d) ? ' urgent' : '') + '" style="background:' + col + '; color:' + col + '"></span>',
      iconSize: [7, 7], iconAnchor: [3.5, 3.5]
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
    var days = daysUntil(d.extra);
    var cdBig = days != null && days >= 0 ? '<span class="md-cd' + countdownClass(days) + '">⏳ Termín ' + countdownText(days) + '</span>' : '';
    return '<button class="md-topbar" type="button" data-detail-back><span>Zavřít detail</span><span class="mx">✕</span></button>' +
      '<div class="md-body">' +
        '<div class="md-shape" style="border-color:' + t.color + '55">' + shapeSvg(d) + '</div>' +
        '<div class="md-info">' +
          '<div class="md-top"><span class="lp-dot" style="background:' + t.color + '"></span><b>' + t.label + '</b> · ' + d.place + ', okres ' + d.okres + cdBig + '</div>' +
          '<div class="md-facts">' +
            (hasParcel(d) ? '<span>Parcela <b>č. ' + d.parcel + '</b></span>' : '') +
            '<span>Druh <b>' + d.druh + '</b></span>' +
            '<span>Výměra <b>' + areaTxt(d) + '</b></span>' +
            '<span>' + priceLabel + ' <b>' + fmt(d.price) + ' Kč</b></span>' +
            (perM2 ? '<span>Cena/m² <b>' + fmt(perM2) + ' Kč</b></span>' : '') +
            '<span>Stav <b>' + d.extra + '</b></span>' +
          '</div>' +
          priceBarHtml(d) +
          (isSPU(d) ? '<div class="md-note">Státní půda se prodává přes <b>veřejnou nabídku SPÚ (§ 12)</b> — otevřete „Nabídka SPÚ", parcelu ověříte přes „Katastr".</div>' : '') +
        '</div>' +
        '<div class="md-actions">' +
          '<a class="lp-btn" href="' + katastrUrl(d) + '" target="_blank" rel="noopener">Katastr</a>' +
          '<a class="lp-btn" href="' + mapyUrl(d) + '" target="_blank" rel="noopener">Mapa</a>' +
          (function () { var s = sourceLink(d); return '<a class="lp-btn lp-src" href="' + s.url + '" target="_blank" rel="noopener">' + s.label + '</a>'; })() +
          (auctionYMD(d.extra) ? '<button class="lp-btn" type="button" data-cal>📅 Kalendář</button>' : '') +
          '<button class="lp-btn lp-fav' + (isFav(d) ? ' on' : '') + '" type="button" data-fav-detail>' + BM_SVG + '<span>' + (isFav(d) ? 'Uloženo' : 'Uložit') + '</span></button>' +
          '<button class="lp-btn" type="button" data-share>Sdílet</button>' +
          '<a class="lp-watch" href="#upozorneni" data-okres="' + d.okres + '">Upozornit na okres ' + d.okres + '</a>' +
        '</div>' +
      '</div>';
  }
  var selPoly = null;
  function resizeMapSoon() {
    setTimeout(function () { map.invalidateSize(); }, 60);
    setTimeout(function () { map.invalidateSize(); }, 340);
  }
  var holderEl = document.querySelector('.map-holder');
  var curDetail = null;
  function showDetail(d) {
    if (!detailEl) return;
    curDetail = d;
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
        var pin = m._icon.querySelector('.pk-dot');
        if (pin) pin.classList.toggle('sel', i === id);
      }
    });
  }
  function highlightShape(d) {
    if (selPoly) { map.removeLayer(selPoly); selPoly = null; }
    selPoly = L.polygon(polyFor(d), { color: '#fff', weight: 2.5, fillColor: TYPE[d.type].color, fillOpacity: 0.4, opacity: 1 }).addTo(map);
  }

  // Tečkovaná mapa pozemků + obrysy krajů pro orientaci
  var dotLayer = L.layerGroup();
  var krajLayer = null;
  var lastVis = [], krajCounts = {};

  DATA.forEach(function (d, i) {
    d._id = i;
    var m = L.marker([d.lat, d.lng], { icon: markerIcon(d) });
    m.on('click', function () { showDetail(d); highlightList(i); });
    markers.push(m);
  });

  // Tečkovaná mapa: každý pozemek = tečka. Navíc obrysy krajů pro orientaci.
  var krajByName = {};
  // Na dotykových zařízeních není „myš pryč" → popisek kraje sám plynule zmizí.
  var isTouch = (typeof matchMedia === 'function' && matchMedia('(hover: none)').matches) || ('ontouchstart' in window);
  function styleKraj() { return { color: 'rgba(224,174,67,0.4)', weight: 1.2, fill: true, fillColor: '#E0AE43', fillOpacity: 0.03 }; }
  if (KRAJE_GEOM) {
    var feats = Object.keys(KRAJE_GEOM).map(function (k) { return { type: 'Feature', properties: { kraj: k }, geometry: KRAJE_GEOM[k] }; });
    krajLayer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      style: styleKraj,
      onEachFeature: function (f, layer) {
        krajByName[f.properties.kraj] = layer;
        layer.bindTooltip(f.properties.kraj + ' kraj', { sticky: true, direction: 'top', className: 'kraj-tip' });
        layer.on('click', function () { selectKraj(f.properties.kraj); });
        layer.on('mouseover', function () { if (selectedKraj !== f.properties.kraj) { layer.setStyle({ weight: 2, color: '#F2D79A', fillOpacity: 0.06 }); layer.bringToFront(); } });
        layer.on('mouseout', function () { if (!krajLayer) return; krajLayer.resetStyle(layer); if (selectedKraj === f.properties.kraj) styleSelectedKraj(layer); });
        // Dotyk: po 2 s popisek plynule zhasne, ať nezůstane „viset" a nebrání dalšímu klikání.
        layer.on('tooltipopen', function (e) {
          if (!isTouch) return;
          var tip = e.tooltip;
          clearTimeout(layer._tipTimer);
          layer._tipTimer = setTimeout(function () {
            var c = tip && (tip.getElement ? tip.getElement() : tip._container);
            if (c) { c.style.transition = 'opacity .45s ease'; c.style.opacity = '0'; }
            setTimeout(function () { layer.closeTooltip(); if (krajLayer) krajLayer.resetStyle(layer); }, 470);
          }, 2000);
        });
        layer.on('tooltipclose', function () { clearTimeout(layer._tipTimer); });
      }
    });
  }
  // České skloňování: 1 pozemek · 2–4 pozemky · 5+ pozemků
  function plPozemek(n) { return n === 1 ? 'pozemek' : (n >= 2 && n <= 4 ? 'pozemky' : 'pozemků'); }
  function refreshKrajTips(vis) {
    krajCounts = {};
    vis.forEach(function (d) { var k = krajOf(d); if (!k) return; var o = krajCounts[k] || (krajCounts[k] = { total: 0 }); o.total++; o[d.type] = (o[d.type] || 0) + 1; });
    Object.keys(krajByName).forEach(function (k) {
      var o = krajCounts[k];
      var parts = [];
      if (o) ['sale', 'drazba', 'exekuce', 'obec'].forEach(function (tp) { if (o[tp]) parts.push(o[tp] + '× ' + TYPE[tp].label.toLowerCase()); });
      var txt = '<b>' + k + ' kraj</b><br>' + (o ? o.total + ' ' + plPozemek(o.total) + (parts.length ? ' · ' + parts.join(', ') : '') : 'žádné nabídky');
      krajByName[k].setTooltipContent(txt);
    });
  }
  function renderDots(vis) {
    dotLayer.clearLayers();
    vis.forEach(function (d) { dotLayer.addLayer(markers[d._id]); });
  }
  // Vždy: tečky pozemků + obrysy krajů přes ně
  function updateMapView() {
    if (krajLayer && !map.hasLayer(krajLayer)) krajLayer.addTo(map);
    renderDots(lastVis);
    if (!map.hasLayer(dotLayer)) dotLayer.addTo(map);
    if (krajLayer) krajLayer.bringToBack();
  }
  function syncMarkers(visIds) {
    lastVis = visIds.map(function (id) { return DATA[id]; });
    refreshKrajTips(lastVis);
    updateMapView();
    if (typeof updateKrajHead === 'function') updateKrajHead(); // počet v nadpisu drží krok s filtry
  }

  // Oddálí mapu tak, aby byla vidět celá rozloha nabídek (celá ČR).
  // Přizpůsobí se velikosti displeje – na mobilu i na počítači.
  var czBounds = L.latLngBounds(DATA.map(function (d) { return [d.lat, d.lng]; }));
  function fitAllCZ() { if (czBounds.isValid()) map.fitBounds(czBounds, { padding: [18, 18], maxZoom: 9 }); }
  fitAllCZ();

  /* ---------- Výběr kraje: nejdřív kraj, teprve pak klikací tečky ----------
     Dokud si člověk nevybere kraj, jsou tečky (pozemky) zamčené a klepnutí
     vždy trefí kraj — i tam, kde přes něj leží kulička. Po výběru kraje se
     přiblížíme a tečky se stanou interaktivní. Nadpis kraje nahoře napoví, kde je. */
  var selectedKraj = null;
  var krajHintEl = document.getElementById('kraj-hint');
  var krajHeadEl = document.getElementById('kraj-head');
  function styleSelectedKraj(layer) { layer.setStyle({ weight: 2.6, color: '#F2D79A', fillColor: '#E0AE43', fillOpacity: 0.09 }); layer.bringToFront(); }
  function lockDots(lock) { mapEl.classList.toggle('kraj-lock', lock); }
  function updateKrajHead() {
    if (krajHeadEl) {
      if (!selectedKraj) { krajHeadEl.hidden = true; }
      else {
        var o = krajCounts[selectedKraj];
        var n = o ? o.total : 0;
        krajHeadEl.innerHTML =
          '<button class="kh-back" type="button" aria-label="Zpět na výběr kraje"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
          '<div class="kh-txt"><b>' + selectedKraj + ' kraj</b><span>' + (n ? (n + ' ' + plPozemek(n) + ' — klepněte na bod') : 'zatím žádné nabídky') + '</span></div>';
        krajHeadEl.hidden = false;
        var back = krajHeadEl.querySelector('.kh-back');
        if (back) back.addEventListener('click', clearKraj);
      }
    }
    if (krajHintEl) krajHintEl.hidden = !!selectedKraj;
  }
  function selectKraj(k, skipFit) {
    if (selectedKraj === k) return;
    selectedKraj = k;
    if (krajLayer) krajLayer.setStyle(styleKraj);
    var layer = krajByName[k];
    if (layer) { styleSelectedKraj(layer); if (!skipFit) map.fitBounds(layer.getBounds(), { maxZoom: 11, padding: [16, 16] }); }
    lockDots(false);   // tečky teď klikací
    updateKrajHead();
  }
  function clearKraj() {
    selectedKraj = null;
    if (krajLayer) krajLayer.setStyle(styleKraj);
    hideDetail();
    lockDots(true);    // zpět: klikají se zase kraje
    fitAllCZ();
    updateKrajHead();
  }
  lockDots(true);      // start: nejdřív se vybírá kraj
  updateKrajHead();

  // Legenda mapy — jen kategorie, které v datech opravdu jsou, + upozornění na
  // blížící se dražby (pulzující body). Vysvětlí barvy přímo nad mapou.
  var legendEl = document.getElementById('map-legend');
  if (legendEl) {
    var present2 = {};
    DATA.forEach(function (d) { present2[d.type] = true; });
    var urgentN = DATA.filter(isUrgent).length;
    var lh = '';
    ['sale', 'drazba', 'exekuce', 'obec'].forEach(function (tp) {
      if (present2[tp]) lh += '<span class="lg-item"><span class="lg-dot" style="background:' + TYPE[tp].color + '"></span>' + TYPE[tp].label + '</span>';
    });
    if (urgentN) lh += '<span class="lg-item lg-urgent"><span class="lg-dot lg-ring"></span>dražba do 7 dní</span>';
    legendEl.innerHTML = lh;
  }

  // Tvary parcel — vytvoří se líně až při přiblížení a respektují filtr
  // (dřív se tvořilo všech 234 hned = zbytečná zátěž, a filtr je neschovával).
  function polyObj(d) {
    if (d._polyObj) return d._polyObj;
    var p = L.polygon(polyFor(d), { color: TYPE[d.type].color, weight: 1.4, fillColor: TYPE[d.type].color, fillOpacity: 0.22, opacity: 0.85 });
    p.on('click', function () { showDetail(d); highlightList(d._id); });
    d._polyObj = p;
    return p;
  }
  function updatePolys() {
    var show = map.getZoom() >= 12;
    DATA.forEach(function (d) {
      var want = show && visible(d);
      if (want && !d._polyOn) { polyObj(d).addTo(map); d._polyOn = true; }
      else if (!want && d._polyOn) { map.removeLayer(d._polyObj); d._polyOn = false; }
    });
  }
  map.on('zoomend', updatePolys);

  function visible(d) {
    var okType = activeType === 'all' || d.type === activeType;
    var okSearch = !searchTerm || (d.place + ' ' + d.okres).toLowerCase().indexOf(searchTerm) !== -1;
    var okDruh = activeDruh === 'all' || druhGroup(d.druh) === activeDruh;
    var okPrice = !maxPrice || !d.price || d.price <= maxPrice;
    var okFav = !favOnly || isFav(d);
    return okType && okSearch && okDruh && okPrice && okFav;
  }
  function perM2Val(d){ return hasArea(d) ? d.price / d.area : Infinity; }
  function sortVis(arr){
    if (sortMode === 'price_asc') arr.sort(function (a, b) { return a.price - b.price; });
    else if (sortMode === 'price_desc') arr.sort(function (a, b) { return b.price - a.price; });
    else if (sortMode === 'area_desc') arr.sort(function (a, b) { return (b.area || 0) - (a.area || 0); });
    else if (sortMode === 'perm2_asc') arr.sort(function (a, b) { return perM2Val(a) - perM2Val(b); });
    else arr.sort(function (a, b) { return demand(b) - demand(a); });
    return arr;
  }

  // Interní skóre pro řazení „Doporučené" a výběr špičky (★ Doporučujeme).
  // Čím výhodnější cena/m² a zajímavější typ, tím vyšší. Není to počet lidí —
  // slouží jen k pořadí, žádné vymyšlené „sledující" se nikde nezobrazují.
  function demand(d) {
    if (d._demand != null) return d._demand;
    var perM2 = hasArea(d) ? d.price / d.area : 500;
    var typeBonus = { drazba: 22, exekuce: 18, obec: 12, sale: 8 }[d.type] || 0;
    var deal = Math.max(0, Math.min(58, (900 - perM2) / 18)); // výhodnost s nasycením
    d._demand = Math.max(6, Math.round(9 + typeBonus + deal));
    return d._demand;
  }

  var LIST_LIMIT = 8;
  function renderList() {
    listEl.innerHTML = '';
    var vis = [], visIds = [];
    DATA.forEach(function (d) {
      if (visible(d)) { vis.push(d); visIds.push(d._id); }
    });
    syncMarkers(visIds);
    var matched = vis.length;
    sortVis(vis);
    // „Výhodná cena" jen pro skutečně nejlevnější špičku (podle Kč/m²),
    // ne pro třetinu — aby badge nesvítil skoro všude.
    var pv = vis.map(perM2Val).filter(function (x) { return isFinite(x) && x > 0; }).sort(function (a, b) { return a - b; });
    var dealMax = pv.length >= 5 ? pv[Math.min(2, pv.length - 1)] : 0;
    // „★ Doporučujeme" jen pro 3 nejlepší podle interního skóre (nezávisle na řazení),
    // a jen když je z čeho vybírat (min. 5 nabídek).
    var hotIds = {};
    if (vis.length >= 5) {
      vis.slice().sort(function (a, b) { return demand(b) - demand(a); }).slice(0, 3)
        .forEach(function (d) { hotIds[d._id] = true; });
    }
    var top = vis.slice(0, LIST_LIMIT);

    top.forEach(function (d, rank) {
      var t = TYPE[d.type];
      var perM2 = hasArea(d) ? Math.round(d.price / d.area) : null;
      var hot = !!hotIds[d._id];
      var li = document.createElement('li');
      li.className = 'opp-item ' + d.type + (hot ? ' is-hot' : '');
      li.setAttribute('data-id', d._id);
      li.setAttribute('tabindex', '0');
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', t.label + ' · ' + d.place + ' · ' + areaTxt(d));
      var days = daysUntil(d.extra);
      var cd = days != null && days >= 0 ? '<span class="opp-cd' + countdownClass(days) + '">' + countdownText(days) + '</span>' : '';
      li.innerHTML =
        '<div class="opp-thumb" style="border-color:' + t.color + '44">' + shapeSvg(d) + '</div>' +
        '<div class="opp-content">' +
          '<div class="opp-top"><span class="opp-place">' + d.place + '</span>' +
          '<span class="opp-topr">' +
            '<button type="button" class="opp-fav' + (isFav(d) ? ' on' : '') + '" aria-label="' + (isFav(d) ? 'Odebrat z uložených' : 'Uložit pozemek') + '">' + BM_SVG + '</button>' +
            '<span class="opp-tag ' + d.type + '">' + t.label + '</span>' +
          '</span></div>' +
          '<div class="opp-meta">' + (hasParcel(d) ? '<span>parc. <b>' + d.parcel + '</b></span>' : '') +
          '<span>' + (hasArea(d) ? '<b>' + fmt(d.area) + '</b> m²' : 'výměra neuvedena') + '</span><span>' + d.druh + '</span></div>' +
          '<div class="opp-price"><b>' + fmt(d.price) + ' Kč</b>' + (perM2 ? ' <span>· ' + fmt(perM2) + ' Kč/m²</span>' : '') +
            (perM2 && dealMax && perM2 <= dealMax ? ' <span class="opp-deal">výhodná cena</span>' : '') + '</div>' +
          (function () {
            var badges = [cd, hot ? '<span class="hot">★ Doporučujeme</span>' : ''].filter(Boolean);
            return badges.length ? '<div class="opp-demand">' + badges.join(' <span class="sep">·</span> ') + '</div>' : '';
          })() +
        '</div>';
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
      var favBtn = li.querySelector('.opp-fav');
      if (favBtn) favBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleFav(d);
        var on = isFav(d);
        favBtn.classList.toggle('on', on);
        favBtn.setAttribute('aria-label', on ? 'Odebrat z uložených' : 'Uložit pozemek');
        if (favOnly) renderList();
      });
      listEl.appendChild(li);
    });

    var headLabel = sortMode === 'demand' ? 'Doporučené příležitosti' : 'Vybrané příležitosti';
    countEl.innerHTML = headLabel + ' · <span class="mc-sub">' + matched + ' na mapě</span>';
    if (matched === 0) {
      var anyFilter = activeType !== 'all' || activeDruh !== 'all' || maxPrice || searchTerm || favOnly;
      listEl.innerHTML = '<li class="map-count" style="padding:20px 6px; text-transform:none; font-weight:400; line-height:1.6;">Tady zrovna nic není — zkuste jiný filtr. Příležitostí přibývá každý týden.' +
        (anyFilter ? '<br><button type="button" id="reset-filtry" class="reset-btn">Zrušit filtry</button>' : '') + '</li>';
      var eb = listEl.querySelector('#reset-filtry');
      if (eb) eb.addEventListener('click', resetFilters);
    } else if (matched > LIST_LIMIT) {
      var more = document.createElement('li');
      more.className = 'opp-more';
      more.textContent = '+ ' + (matched - LIST_LIMIT) + ' dalších příležitostí najdete na mapě';
      listEl.appendChild(more);
    }
    updatePolys(); // tvary parcel podle aktuálního filtru
  }

  function resetFilters() {
    activeType = 'all'; activeDruh = 'all'; maxPrice = 0; searchTerm = ''; favOnly = false;
    if (searchEl) searchEl.value = '';
    if (druhEl) druhEl.value = 'all';
    if (cenaEl) cenaEl.value = '0';
    filtersEl.querySelectorAll('.filter-chip').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-type') === 'all');
    });
    refreshFavBtn();
    renderList();
  }

  // Sdílený odkaz ?p=<klíč> otevře konkrétní pozemek a odscrolluje na mapu
  function openFromUrl() {
    var m = /[?&]p=([^&]+)/.exec(location.search);
    if (!m) return false;
    var key;
    try { key = decodeURIComponent(m[1]); } catch (e) { return false; }
    var target = null;
    DATA.forEach(function (d) { if (pkey(d) === key) target = d; });
    if (!target) return false;
    // Sdílený odkaz míří na konkrétní parcelu → rovnou odemkneme tečky
    // (bez přeskládání zoomu na celý kraj), ať se dá klikat i na sousední.
    var k = krajOf(target);
    if (k) selectKraj(k, true);
    map.setView([target.lat, target.lng], 14, { animate: false });
    updateMapView();
    showDetail(target);
    highlightList(target._id);
    if (holderEl) setTimeout(function () { holderEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 200);
    return true;
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
  if (druhEl) druhEl.addEventListener('change', function () { activeDruh = druhEl.value; renderList(); });
  if (sortEl) sortEl.addEventListener('change', function () { sortMode = sortEl.value; renderList(); });
  if (cenaEl) cenaEl.addEventListener('change', function () { maxPrice = parseInt(cenaEl.value, 10) || 0; renderList(); });
  if (favEl) favEl.addEventListener('click', function () { favOnly = !favOnly; refreshFavBtn(); renderList(); });

  refreshFavBtn();
  renderList();
  var deepLinked = openFromUrl();
  // Po dopočítání rozměrů mapy znovu vyrovnáme na celou ČR (pokud nejde o
  // sdílený odkaz na konkrétní parcelu, který si drží vlastní přiblížení).
  setTimeout(function () { map.invalidateSize(); if (!deepLinked) fitAllCZ(); }, 300);
  }

  /* ---------- Načtení reálných dat s bezpečnou zálohou ---------- */
  function loadJSON(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  Promise.all([loadJSON('data/opportunities.json'), loadJSON('data/kraje.json')])
    .then(function (res) {
      var j = res[0], kraje = res[1];
      var arr = Array.isArray(j) ? j : (j && j.opportunities);
      boot(arr && arr.length ? arr : FALLBACK_DATA, kraje || null, j && j.updated);
    });
})();
