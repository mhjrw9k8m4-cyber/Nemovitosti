// Parcelka — interaktivita webu
(function () {
  'use strict';

  // Reset stránky = začni nahoře (ne tam, kde jsem byl). Safari jinak při
  // znovunačtení/otevření panelu vrací starou pozici scrollu — to nechceme.
  // Výjimka: sdílený odkaz na konkrétní pozemek/kraj (?p=/?kraj=/?lid=) nebo
  // kotva (#…) — tam scroll řídí sama stránka.
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
  window.addEventListener('pageshow', function () {
    if (!location.hash && !/[?&](p|kraj|lid)=/.test(location.search)) {
      try { window.scrollTo(0, 0); } catch (e) {}
    }
  });

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
    sale:    { label:'Na prodej',    color:'#4E6FD4', link:{ label:'Nabídka SPÚ',          url:'https://spu.gov.cz/nabidky' } },
    drazba:  { label:'Dražba',       color:'#FFA60A', link:{ label:'Detail dražby',       url:'https://www.portaldrazeb.cz/' } },
    exekuce: { label:'Exekuce',      color:'#FB2B2B', link:{ label:'Insolvenční rejstřík', url:'https://isir.justice.cz/isir/common/index.do' } },
    obec:    { label:'Obecní záměr', color:'#12AEBE', link:{ label:'Úřední deska obce',    url:'https://www.uredni-deska.cz/' } },
    majitel: { label:'Přímo od majitele',  color:'#8B4FE0', link:{ label:'Ověřit v katastru',    url:'https://www.ikatastr.cz/' } }
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
  function katastrUrl(d){ return 'https://ikatastr.cz/#zoom=18&lat=' + d.lat + '&lon=' + d.lng + '&info=' + d.lat + ',' + d.lng; }
  function mapyUrl(d){ return 'https://mapy.cz/zakladni?x=' + d.lng + '&y=' + d.lat + '&z=18&source=coor&id=' + d.lng + ',' + d.lat; }
  // Kontakt na majitele z inzerátu — e-mail → mailto:, jinak telefon → tel:
  function contactHref(c){
    c = String(c || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return 'mailto:' + c;
    var tel = c.replace(/[^\d+]/g, '');
    return tel ? 'tel:' + tel : '#';
  }
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
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Parcelka//CS', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + encodeURIComponent(pkey(d)) + '@parcelka',
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
  /* ---------- Zpětná vazba (okno) ----------
     Cíl odeslání se nastavuje na JEDNOM místě: js/config.js (PK_FORM_ENDPOINT / PK_FORM_EMAIL).
     Dokud je prázdné, okno upřímně řekne, že odesílání dokončujeme. */
  var FEEDBACK_ENDPOINT = (typeof window !== 'undefined' && window.PK_FORM_ENDPOINT) || '';
  var FEEDBACK_EMAIL = (typeof window !== 'undefined' && window.PK_FORM_EMAIL) || '';
  // Zpětná vazba i kontakt jdou napřímo na e-mail info@parcelaka.cz (žádný formulář ani databáze).

  /* ---------- Mobilní menu ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
      document.body.classList.toggle('nav-open', open); // ztmaví pozadí (scrim)
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('nav-open');
      }
    });
    // Zavřít menu klepnutím na ztmavené pozadí (mimo panel i mimo tlačítko)
    function closeNav() {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Otevřít menu');
      document.body.classList.remove('nav-open');
    }
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('open')) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      closeNav();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) closeNav();
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
    if (em) setTimeout(function () { try { em.focus({ preventScroll: true }); } catch (e) { em.focus(); } }, 80);
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
    if (e.target.closest('[data-close]')) { closeWatch(); closeInfo(); closeFeedback(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeWatch(); closeInfo(); closeFeedback(); } });

  /* ---------- Odesílání formulářů (do databáze Supabase) ----------
     Formuláře (hlídání lokality, kontakt, zpětná vazba) ukládají poptávky
     přímo do Supabase — tabulky watch_subscriptions a messages. Veřejný
     „publishable" klíč je bezpečný v prohlížeči: pravidla RLS dovolí z webu
     jen VKLÁDAT, ne číst cizí data. Nastavuje se v js/config.js. */
  var SB_URL = (typeof window !== 'undefined' && window.PK_SUPABASE_URL) || '';
  var SB_KEY = (typeof window !== 'undefined' && window.PK_SUPABASE_KEY) || '';
  var SB_READY = !!(SB_URL && SB_KEY);
  function sbInsert(table, row) {
    if (!SB_READY) return Promise.resolve('unset');
    return fetch(SB_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    }).then(function (r) { return r.ok ? 'ok' : 'error'; }).catch(function () { return 'error'; });
  }
  // Které živé inzeráty už jsme v této návštěvě započítali (ať se zhlédnutí nenafukuje).
  var viewedLids = {};
  // Volání Supabase funkce (RPC) — pro živé inzeráty od majitelů.
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

  // Přihlášení k hlídání lokality. Použije funkci subscribe_watch (s potvrzením
  // e-mailu / double opt-in); dokud není v Supabase nasazená, spadne na přímý
  // zápis (staré chování), ať formulář funguje vždy.
  function subscribeWatch(email, okres, types) {
    if (!SB_READY) return Promise.resolve('unset');
    return sbRpc('subscribe_watch', { p_email: email, p_okres: okres || null, p_types: types || [] }).then(function (res) {
      if (res === true) return 'ok';
      return sbInsert('watch_subscriptions', { email: email, okres: okres || null });
    });
  }

  var wForm = document.getElementById('watch-form');
  if (wForm) {
    wForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('wm-email').value.trim();
      var okres = document.getElementById('wm-okres').value.trim();
      var types = [].slice.call(wForm.querySelectorAll('input[name="wtype"]:checked')).map(function (x) { return x.value; });
      var ms = document.getElementById('wm-msg');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ms.textContent = 'Zadejte prosím platný e-mail.'; ms.classList.add('err'); return; }
      ms.classList.remove('err');
      if (!SB_READY) {
        ms.textContent = 'Upozornění teprve dokončujeme — spustíme je, jakmile přidáme odesílání. Děkujeme za trpělivost.';
        return;
      }
      ms.textContent = 'Odesílám…';
      subscribeWatch(email, okres, types).then(function (r) {
        if (r === 'ok') { ms.textContent = okres ? ('Budeme hlídat okres „' + okres + '" a dáme vědět, jakmile se objeví nová příležitost.') : 'Ozveme se, jakmile se ve vašem okolí objeví nová příležitost.'; setTimeout(closeWatch, 1900); }
        else { ms.textContent = 'Odeslání se teď nepovedlo, zkuste to prosím za chvíli znovu.'; ms.classList.add('err'); }
      });
    });
  }

  /* ---------- Uložené pozemky (oblíbené) ---------- */
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

  /* ---------- Zásady soukromí / Podmínky (info modal) ---------- */
  var INFO = {
    soukromi: {
      t: 'Zásady soukromí',
      h: '<p>Parcelka je ve veřejné bétě. Upřímně, jak zacházíme s daty:</p>' +
        '<ul>' +
        '<li><b>E-mail:</b> použijeme jen pro upozornění nebo poptávku, o kterou si sami řeknete. Neprodáváme ho a neposíláme spam — kdykoli se odhlásíte.</li>' +
        '<li><b>Účet a uložené pozemky:</b> běží zatím jen ve vašem prohlížeči (localStorage). Nic se neodesílá na server.</li>' +
        '<li><b>Data o pozemcích:</b> pocházejí z veřejných zdrojů (dražby, SPÚ, inzeráty, katastr). Nezveřejňujeme osobní údaje vlastníků.</li>' +
        '<li><b>Provoz:</b> web běží na GitHub Pages. Žádné reklamní ani sledovací skripty třetích stran.</li>' +
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
  });
  // Otevři zásady/podmínky i z jiných stránek — přes odkaz index.html#soukromi
  // / #podminky. Díky tomu jsou právní informace dostupné z patičky všude.
  (function () {
    var m = /^#(soukromi|podminky)$/.exec(location.hash || '');
    if (m) setTimeout(function () { openInfo(m[1]); }, 300);
  })();

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
      if (!SB_READY) {
        msg.textContent = 'Upozornění teprve dokončujeme — spustíme je, jakmile přidáme odesílání. Děkujeme za trpělivost.';
        return;
      }
      msg.textContent = 'Odesílám…';
      subscribeWatch(email, okres).then(function (r) {
        if (r === 'ok') {
          msg.textContent = okres ? ('Budeme hlídat okres „' + okres + '" a dáme vědět, jakmile se objeví nová příležitost.') : 'Ozveme se, jakmile se ve vašem okolí objeví nová příležitost.';
          form.reset();
        } else { msg.textContent = 'Odeslání se teď nepovedlo, zkuste to prosím za chvíli znovu.'; msg.classList.add('err'); }
      });
    });
  }

  /* ---------- Poptávkový formulář pro realitky/obce ---------- */
  // Kontakt jde napřímo na e-mail (viz sekce #realitky) — bez formuláře a databáze.

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
    var okr = {};
    DATA.forEach(function (d) { if (d.okres) okr[d.okres] = 1; });
    var okresN = Object.keys(okr).length;
    var nums = document.querySelectorAll('.counters .c-num');
    if (nums.length) {
      if (nums[0]) nums[0].setAttribute('data-count', String(DATA.length));
      if (nums[1]) nums[1].setAttribute('data-count', String(okresN));
    }
    // Statistiky v sekci zdrojů (důvěra + hodnota v číslech)
    var sc = document.getElementById('stat-count'); if (sc) sc.textContent = fmt(DATA.length);
    var so = document.getElementById('stat-okres'); if (so) so.textContent = String(okresN);
    // Živá čísla v hero proužku (sociální důkaz hned nahoře).
    var hc = document.getElementById('hero-n-count'); if (hc) hc.textContent = fmt(DATA.length);
    var ho = document.getElementById('hero-n-okres'); if (ho) ho.textContent = String(okresN);
  })();

  // „Naposledy aktualizováno" — signál čerstvosti dat (z pole updated).
  // Když robot pár dní neproběhl (data starší než 4 dny), decentně upozorníme.
  (function () {
    var el = document.getElementById('data-updated');
    if (!el || !updated) return;
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(updated);
    if (!m) { el.textContent = ''; return; }
    el.textContent = 'Data aktualizována ' + (+m[3]) + '. ' + (+m[2]) + '. ' + m[1];
    var upd = new Date(+m[1], +m[2] - 1, +m[3]);
    var days = Math.floor((Date.now() - upd.getTime()) / 86400000);
    if (isFinite(days) && days >= 4) {
      el.textContent += ' · možná zastaralá (' + days + ' dní)';
      el.classList.add('is-stale');
    } else {
      el.classList.remove('is-stale');
    }
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
  var map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: false, boxZoom: false }).setView([49.82, 15.47], 7);
  // Tečky kreslíme přes CANVAS (jeden obraz místo tisíce HTML značek) → plynulé i s ~1000 pozemky na mobilu.
  // Vrstva teček je vizuálně nad kraji, ale klikání propouští dolů (pointer-events:none),
  // takže se dá vždy vybrat kraj pod ní. Klik na tečku řešíme ručně (map click + nejbližší bod).
  map.createPane('dotsPane');
  map.getPane('dotsPane').style.zIndex = 450; // nad overlayPane (kraje) = 400, pod popupy
  map.getPane('dotsPane').style.pointerEvents = 'none'; // canvas nechytá kliky → projdou na kraje
  var dotsRenderer = L.canvas({ pane: 'dotsPane', padding: 0.5 });
  if (map.attributionControl) map.attributionControl.setPosition('bottomleft'); // ať se nekryje s tlačítky
  // Ovládání zoomu +/− — jen na počítačích (na mobilu se přibližuje prsty). Umístěno
  // vlevo (přes CSS na volný levý okraj), ať se nepere s ostatními tlačítky.
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Přiblížit', zoomOutTitle: 'Oddálit' }).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);
  // Lehké ovládání: mapa je hned použitelná (body klikací, stránka přes ni
  // normálně scrolluje). Tlačítko zapne režim posouvání/přibližování mapy.
  var mapLocked = true;
  var lockBtn = document.getElementById('map-lock');
  // Mapa je „zamčená" na přehledu (stránka přes ni normálně roluje prstem). Jakmile
  // člověk klepne na kraj (na republiku), sama se odemkne a jde s ní volně hýbat.
  // Když je odemčená, dole se ukáže tlačítko „Zamknout mapu" (jen zamkne, ať jde
  // zase rolovat stránkou). „Celá ČR" nahoře vrátí přehled a taky zamkne.
  function setPan(on) {
    mapLocked = !on;
    // touchZoom (pinch dvěma prsty) NECHÁVÁME zapnutý pořád — aby dva prsty
    // přiblížily MAPU, ne celou stránku (na iOS jinak pinch zoomuje celý web).
    var fns = ['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'keyboard'];
    fns.forEach(function (f) { if (map[f]) map[f][on ? 'enable' : 'disable'](); });
    if (map.touchZoom) map.touchZoom.enable();
    // touch-action: zamčeno → stránka jde svisle scrollovat prstem, ale pinch
    //   chytne mapa (prohlížeč nezoomuje web); puštěno → mapou jde volně hýbat.
    mapEl.style.touchAction = on ? 'none' : 'pan-y';
    if (lockBtn) lockBtn.hidden = !on; // tlačítko „Zamknout mapu" jen když je odemčeno
    if (on) setTimeout(function () { map.invalidateSize(); }, 60);
  }
  setPan(false);
  if (lockBtn) lockBtn.addEventListener('click', function () { setPan(false); }); // jen zamkne (výběr kraje zůstává)
  // Tlačítko „Celá ČR" — vrátí pohled nad celou mapu a zruší výběr kraje (místo +/− ovládání zoomu).
  var resetBtn = document.getElementById('map-reset');
  if (resetBtn) resetBtn.addEventListener('click', function () { clearKraj(); });
  window.addEventListener('resize', function () { map.invalidateSize(); });

  var listEl = document.getElementById('opp-list');
  var countEl = document.getElementById('map-count');
  var searchEl = document.getElementById('map-search');
  var filtersEl = document.getElementById('map-filters');
  var druhEl = document.getElementById('map-druh');
  var sortEl = document.getElementById('map-sort');
  var cenaEl = document.getElementById('map-cena');
  var areaEl = document.getElementById('map-area');
  var urgentEl = document.getElementById('map-urgent');
  var detailEl = document.getElementById('opp-detail');
  var favEl = document.getElementById('map-fav');
  var activeType = 'all';
  var activeDruh = 'all';
  var sortMode = 'demand';
  var maxPrice = 0;
  var minArea = 0;         // filtr minimální výměry (m²)
  var urgentOnly = false;  // filtr: jen dražby/exekuce končící brzy (do 14 dní)
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

  // „Naposledy prohlédnuté" — malá vychytávka: parcely, které jste otevřeli,
  // si zapamatujeme v prohlížeči a nabídneme je pro rychlý návrat. Nic se
  // neodesílá, jen localStorage. Nesahá na chování mapy.
  var RECENT_KEY = 'pk_recent_v1';
  var _keyIdx = null;
  function keyIndex(){ if (_keyIdx) return _keyIdx; _keyIdx = {}; DATA.forEach(function (d) { _keyIdx[pkey(d)] = d; }); return _keyIdx; }
  function recentKeys(){ try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } }
  function pushRecent(d){
    var k = pkey(d);
    var arr = recentKeys().filter(function (x) { return x !== k; });
    arr.unshift(k);
    arr = arr.slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch (e) {}
    renderRecent();
  }
  function renderRecent(){
    var el = document.getElementById('recent-strip');
    if (!el) return;
    var idx = keyIndex();
    var items = recentKeys().map(function (k) { return idx[k]; }).filter(Boolean).slice(0, 8);
    if (items.length < 2) { el.hidden = true; el.innerHTML = ''; return; } // ukaž až od 2, jinak zbytečné
    var h = '<div class="rs-head">Naposledy prohlédnuté</div><div class="rs-row">';
    items.forEach(function (d) {
      h += '<button type="button" class="rs-chip" data-rkey="' + encodeURIComponent(pkey(d)) + '">' +
        '<span class="rs-dot" style="background:' + TYPE[d.type].color + '"></span>' +
        '<span class="rs-place">' + d.place + '</span>' +
        '<span class="rs-price">' + fmt(d.price) + ' Kč</span>' +
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
      if (d) { showDetail(d); highlightList(d._id); }
    });
  })();

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
    var typeWord = d.type === 'sale' ? 'v prodeji' : (d.type === 'drazba' ? 'v dražbě' : 'v nabídce');
    var cls, badge, text;
    if (pct <= 35) { cls = 'good'; badge = 'Výhodná cena'; text = 'Levnější než <b>' + (100 - pct) + ' %</b> podobných pozemků ' + typeWord + '.'; }
    else if (pct >= 65) { cls = 'bad'; badge = 'Vyšší cena'; text = 'Dražší než <b>' + pct + ' %</b> podobných pozemků ' + typeWord + '.'; }
    else { cls = 'mid'; badge = 'Průměrná cena'; text = 'Cena za m² je zhruba <b>uprostřed</b> podobných pozemků ' + typeWord + '.'; }
    return '<div class="md-verdict ' + cls + '">' +
      '<div class="mv-top"><span class="mv-badge">' + badge + '</span><span class="mv-cmp">Cena za m²</span></div>' +
      '<div class="mv-text">' + text + '</div>' +
      '<div class="mv-track"><span class="mv-fill" style="width:' + pct + '%"></span><span class="mv-dot" style="left:' + pct + '%"></span></div>' +
      '<div class="mv-scale"><span>levné</span><span>drahé</span></div>' +
      '</div>';
  }
  // Jak výhodná je cena za m² oproti podobným (stejný typ+druh) — vrací percentil
  // (0 = nejlevnější) a „levnější než X %". null, když není dost srovnání.
  function dealInfo(d) {
    if (!hasArea(d) || !d.price) return null;
    var arr = perM2Index[d.type + '|' + druhGroup(d.druh)];
    if (!arr || arr.length < 10) return null;
    if (arr[arr.length - 1] <= arr[0] * 1.2) return null; // ceny skoro stejné → nemá smysl
    var val = d.price / d.area, below = 0;
    for (var i = 0; i < arr.length; i++) { if (arr[i] <= val) below++; }
    var pct = Math.max(2, Math.min(98, Math.round(below / arr.length * 100)));
    return { pct: pct, cheaper: 100 - pct, sample: arr.length };
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
      var nearBtn = e.target.closest('[data-near]');
      if (nearBtn) {
        var nk; try { nk = decodeURIComponent(nearBtn.getAttribute('data-near')); } catch (x) { return; }
        var nd = keyIndex()[nk];
        if (nd) gotoInzerat(nd);
        return;
      }
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
        var perM2s = (hasArea(curDetail) && curDetail.price) ? Math.round(curDetail.price / curDetail.area) : null;
        var title = 'Pozemek ' + curDetail.place + ' — Parcelka';
        var text = TYPE[curDetail.type].label + ' · ' + curDetail.place + ', okres ' + curDetail.okres + ' · ' + areaTxt(curDetail) + ' · ' + fmt(curDetail.price) + ' Kč' + (perM2s ? ' (' + fmt(perM2s) + ' Kč/m²)' : '') + '\nDetail na Parcelce:';
        if (navigator.share) {
          navigator.share({ title: title, text: text, url: url }).catch(function () {});
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
  // Zvýrazněný (placený) inzerát — drží se výš v seznamu, má výraznější bod
  // a odznak „Zvýrazněno". Nastavuje se příznakem featured:true v datech.
  function isFeatured(d) { return !!d.featured; }
  // Jednotlivý pozemek = čistá tečka v barvě kategorie (ukáže se po přiblížení).
  // Kreslí se přes canvas (L.circleMarker) — proto styl, ne HTML.
  var DOT_R = 3.9, DOT_R_SEL = 6.4;
  function dotStyle(d) {
    var col = TYPE[d.type].color, urgent = isUrgent(d), feat = isFeatured(d);
    // Klidnější body: nespěšné mají jen jemný okraj (ne výrazný bílý kroužek),
    // ať mapa při celostátním pohledu nepůsobí přeplácaně. Urgentní zůstávají výrazné.
    // Zvýrazněné (placené) inzeráty jsou o něco větší s plnějším okrajem.
    return {
      renderer: dotsRenderer,
      radius: urgent ? DOT_R + 0.6 : (feat ? DOT_R + 0.9 : DOT_R),
      fillColor: col, fillOpacity: 0.92,
      // Světlá mapa (Positron): tečky potřebují jemný TMAVÝ okraj pro definici (bílý by zmizel).
      color: (urgent || feat) ? 'rgba(18,24,42,0.6)' : 'rgba(18,24,42,0.32)',
      weight: urgent ? 1.8 : (feat ? 1.6 : 0.8),
      opacity: 1
    };
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
  // Záložní „plán parcely" (SVG, bez internetu) — tvar pozemku na jemné mřížce.
  // Ukáže se jen tehdy, když se nenačte satelitní snímek. Tvar je umístěn na
  // stejné zlomkové pozici jako špendlík, aby seděl.
  function planSvg(d, col, fx, fy) {
    var p = polyFor(d);
    var lats = p.map(function (x) { return x[0]; }), lngs = p.map(function (x) { return x[1]; });
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
    var midLat = (minLat + maxLat) / 2, midLng = (minLng + maxLng) / 2;
    var spanLat = (maxLat - minLat) || 1e-6, spanLng = (maxLng - minLng) || 1e-6;
    var sc = Math.min(78 / spanLng, 50 / spanLat);
    var cxT = Math.max(55, Math.min(265, fx * 320));
    var cyT = Math.max(45, Math.min(155, fy * 200));
    var pts = p.map(function (x) {
      return (cxT + (x[1] - midLng) * sc).toFixed(1) + ',' + (cyT - (x[0] - midLat) * sc).toFixed(1);
    }).join(' ');
    var gid = 'm' + d._id;
    return '<svg class="opp-plan" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="bg' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2e3e"/><stop offset="1" stop-color="#141f2b"/></linearGradient></defs>' +
      '<rect width="320" height="200" fill="url(#bg' + gid + ')"/>' +
      '<g stroke="rgba(200,216,232,0.05)" stroke-width="1"><path d="M40 0V200M80 0V200M120 0V200M160 0V200M200 0V200M240 0V200M280 0V200"/><path d="M0 40H320M0 80H320M0 120H320M0 160H320"/></g>' +
      '<polygon points="' + pts + '" fill="' + col + '" fill-opacity="0.22" stroke="' + col + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      '</svg>';
  }
  // Ikonka „víc fotek" (počet fotek v rohu náhledu)
  var GALLERY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  // Náhled pozemku = SKUTEČNÝ letecký/satelitní snímek toho místa (Esri World
  // Imagery), vycentrovaný na pozemek se špendlíkem. Když se snímek nenačte,
  // pod ním prosvítá záložní plán parcely, takže karta není nikdy prázdná.
  // Když ale majitel nahrál vlastní fotku pozemku, má přednost ta fotka.
  function mapThumb(d) {
    var col = TYPE[d.type].color;
    // Když majitel nahrál skutečnou fotku pozemku, ukážeme ji místo satelitu.
    if (d.photos && d.photos.length) {
      var p0 = d.photos[0];
      var cnt = d.photos.length > 1 ? '<span class="opp-count">' + GALLERY_SVG + (d.photos.length) + '</span>' : '';
      return '<svg class="opp-map" viewBox="0 0 384 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">' +
        '<rect width="384" height="240" fill="#141f2b"/>' +
        '<image href="' + p0 + '" xlink:href="' + p0 + '" x="0" y="0" width="384" height="240" preserveAspectRatio="xMidYMid slice"/>' +
        '</svg>' +
        '<span class="opp-mgrad"></span>' +
        '<span class="opp-badge ' + d.type + '">' + TYPE[d.type].label + '</span>' + cnt;
    }
    var z = 16, n = Math.pow(2, z);
    function worldX(lng) { return (lng + 180) / 360 * 256 * n; }
    function worldY(lat) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * n; }
    var WX = worldX(d.lng), WY = worldY(d.lat);
    var Vw = 384, Vh = 240;                         // 16:10, pozemek uprostřed
    var ox = WX - Vw / 2, oy = WY - Vh / 2;
    var minTx = Math.floor(ox / 256), maxTx = Math.floor((ox + Vw) / 256);
    var minTy = Math.floor(oy / 256), maxTy = Math.floor((oy + Vh) / 256);
    var imgs = '';
    for (var tx = minTx; tx <= maxTx; tx++) {
      for (var ty = minTy; ty <= maxTy; ty++) {
        var u = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + ty + '/' + tx;
        imgs += '<image href="' + u + '" xlink:href="' + u + '" x="' + (tx * 256 - ox).toFixed(1) + '" y="' + (ty * 256 - oy).toFixed(1) + '" width="256" height="256" preserveAspectRatio="none"/>';
      }
    }
    var fid = 'ts' + d._id;
    var pin = '<g transform="translate(' + (Vw / 2) + ',' + (Vh / 2) + ')" filter="url(#' + fid + ')">' +
      '<path d="M0 0C-7 -12 -12 -18 -12 -25 A12 12 0 1 1 12 -25 C12 -18 7 -12 0 0Z" fill="' + col + '" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle cx="0" cy="-25" r="4.6" fill="#fff"/></g>';
    return '<svg class="opp-map" viewBox="0 0 ' + Vw + ' ' + Vh + '" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">' +
      '<defs><filter id="' + fid + '" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(0,0,0,0.5)"/></filter></defs>' +
      '<rect width="' + Vw + '" height="' + Vh + '" fill="#141f2b"/>' +
      '<g stroke="rgba(200,216,232,0.06)" stroke-width="1"><path d="M64 0V240M128 0V240M192 0V240M256 0V240M320 0V240M0 60H384M0 120H384M0 180H384"/></g>' +
      imgs + pin +
      '</svg>' +
      '<span class="opp-mgrad"></span>' +
      '<span class="opp-badge ' + d.type + '">' + TYPE[d.type].label + '</span>';
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
    // Neutrální jemný obrys — tvar dává kartě „mapový" charakter, ale nepřidává barvu
    return '<svg viewBox="0 0 100 100"><polygon points="' + pts +
      '" fill="rgba(166,184,202,0.12)" stroke="#8fa2b5" stroke-width="2.2"/></svg>';
  }

  // „Co byste měli vědět" — poctivé, obecné vysvětlení: dá se tu stavět (podle
  // druhu pozemku) a na co si dát pozor (podle typu příležitosti). Přesně tohle
  // u pozemků každý řeší, ale portály to nikde nepíšou. Není to právní rada ke
  // konkrétní parcele — proto dole upozornění „ověřte na úřadě a v katastru".
  function buildInfo(g) {
    switch (g) {
      case 'Stavební / zastavěná': return { lvl: 'ok', txt: 'Územním plánem <b>určeno k zástavbě</b>. Konkrétní podmínky (co a jak velké) si ověřte na stavebním úřadě.' };
      case 'Orná půda': return { lvl: 'warn', txt: '<b>Zemědělská půda.</b> Pro stavbu je nutná změna územního plánu a <b>vynětí ze ZPF</b> — bývá zdlouhavé a není jisté.' };
      case 'Louka / travní porost': return { lvl: 'warn', txt: '<b>Zemědělská půda</b> (travní porost). Ke stavbě je potřeba změna územního plánu a vynětí ze ZPF.' };
      case 'Zahrada': return { lvl: 'mid', txt: 'Zahrada bývá v zastavěném území, ale <b>ne vždy je stavební</b>. Ověřte si územní plán obce.' };
      case 'Lesní pozemek': return { lvl: 'warn', txt: '<b>Lesní pozemek</b> pod ochranou lesního zákona — výstavba je prakticky vyloučená.' };
      case 'Vinice / sad': return { lvl: 'warn', txt: 'Zemědělská kultura (vinice/sad). Ke stavbě je potřeba změna využití a vynětí ze ZPF.' };
      default: return { lvl: 'mid', txt: 'Ověřte v <b>územním plánu</b> obce, jak se pozemek smí využívat a zda se na něm dá stavět.' };
    }
  }
  function typeCaution(d) {
    switch (d.type) {
      case 'drazba': return 'Řiďte se <b>dražební vyhláškou</b>. Financování a prohlídku si zajistěte předem — skládá se dražební jistota.';
      case 'exekuce': return 'Prodej se může <b>protáhnout</b>. Aktuální stav ověřte v insolvenčním rejstříku nebo u exekutora.';
      case 'obec': return 'Obec zveřejňuje záměr na <b>úřední desce</b>. Nabídku podejte ve stanovené lhůtě.';
      case 'majitel': return 'Jednáte <b>přímo s vlastníkem</b>. Ověřte vlastnictví a případná omezení (zástavy, věcná břemena) na listu vlastnictví.';
      default: return 'Před koupí ověřte <b>přístup k pozemku, sítě</b> a zápis v katastru (list vlastnictví).';
    }
  }
  var GTK_INFO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.6" x2="12" y2="8"/></svg>';
  function goodToKnowHtml(d) {
    var b = buildInfo(druhGroup(d.druh));
    var c = typeCaution(d);
    return '<details class="md-gtk">' +
      '<summary>' + GTK_INFO_SVG + '<span>Co byste měli vědět</span><span class="gtk-hint">stavba · na co pozor</span></summary>' +
      '<div class="gtk-body">' +
        '<div class="gtk-row gtk-' + b.lvl + '"><span class="gtk-k">Dá se tu stavět?</span><span class="gtk-v">' + b.txt + '</span></div>' +
        '<div class="gtk-row gtk-warn"><span class="gtk-k">Na co si dát pozor</span><span class="gtk-v">' + c + '</span></div>' +
        '<p class="gtk-foot">Obecné informace, ne právní rada ke konkrétní parcele. Vždy ověřte na úřadě a v katastru.</p>' +
      '</div>' +
    '</details>';
  }

  // Vzdálenost mezi dvěma body (km) — pro „Podobné pozemky poblíž".
  function kmBetween(la1, ln1, la2, ln2) {
    var R = 6371, r = Math.PI / 180;
    var dLat = (la2 - la1) * r, dLng = (ln2 - ln1) * r;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  // Nejbližší pozemky stejného druhu (nebo aspoň typu) — bez sebe sama.
  function nearbySimilar(d, n) {
    if (typeof d.lat !== 'number') return [];
    var g = druhGroup(d.druh);
    var pool = DATA.filter(function (x) { return x !== d && typeof x.lat === 'number' && druhGroup(x.druh) === g; });
    if (pool.length < n) pool = DATA.filter(function (x) { return x !== d && typeof x.lat === 'number' && x.type === d.type; });
    pool.forEach(function (x) { x._nd = kmBetween(d.lat, d.lng, x.lat, x.lng); });
    pool.sort(function (a, b) { return a._nd - b._nd; });
    return pool.slice(0, n);
  }
  function nearbyHtml(d) {
    var near = nearbySimilar(d, 3);
    if (near.length < 2) return '';
    var items = near.map(function (x) {
      var t2 = TYPE[x.type];
      var per = hasArea(x) ? Math.round(x.price / x.area) : null;
      var dist = x._nd < 1 ? '< 1 km' : Math.round(x._nd) + ' km';
      return '<button type="button" class="md-near-item" data-near="' + encodeURIComponent(pkey(x)) + '">' +
        '<span class="mn-dot" style="background:' + t2.color + '"></span>' +
        '<span class="mn-txt"><b>' + x.place + '</b><span>' + (x.druh || 'pozemek') + ' · ' + dist + '</span></span>' +
        '<span class="mn-price">' + fmt(x.price) + ' Kč</span>' +
      '</button>';
    }).join('');
    return '<div class="md-near"><div class="md-near-head">Podobné pozemky poblíž</div>' + items + '</div>';
  }

  function detailHtml(d) {
    var t = TYPE[d.type];
    // Externí odkazy (Mapy.cz, katastr) otevíráme vždy v NOVÉ záložce — i na mobilu.
    // Mapy.cz jsou aplikace, která si do historie ukládá každý pohyb; kdyby se
    // otevřely ve stejné záložce, tlačítko Zpět by se pak vracelo „krok po kroku".
    var extAttr = ' target="_blank" rel="noopener"';
    var perM2 = hasArea(d) ? Math.round(d.price / d.area) : null;
    var priceLabel = d.type === 'drazba' ? 'Vyvolávací' : (d.type === 'sale' || d.type === 'majitel' ? 'Cena' : 'Odhad');
    var days = daysUntil(d.extra);
    var cdBig = days != null && days >= 0 ? '<span class="md-cd' + countdownClass(days) + '">Termín ' + countdownText(days) + '</span>' : '';
    return '<button class="md-topbar" type="button" data-detail-back><span>Zavřít detail</span><span class="mx">✕</span></button>' +
      '<div class="md-body">' +
        '<div class="md-shape" style="border-color:' + t.color + '55">' + shapeSvg(d) + '</div>' +
        '<div class="md-info">' +
          '<div class="md-top"><span class="md-chip"><span class="lp-dot" style="background:' + t.color + '"></span>' + t.label + '</span>' + (isFeatured(d) ? '<span class="md-feat">Zvýrazněno</span>' : '') + cdBig + '</div>' +
          '<h3 class="md-place">' + d.place + '<span class="md-okr">okres ' + d.okres + '</span></h3>' +
          '<div class="md-sub">' + d.druh + (hasArea(d) ? ' <span class="md-price-sep">·</span> ' + areaTxt(d) : '') + '</div>' +
          '<div class="md-price"><span class="md-price-lbl">' + priceLabel + '</span><b>' + fmt(d.price) + ' Kč</b>' + (perM2 ? '<span class="md-price-per">' + fmt(perM2) + ' Kč/m²</span>' : '') + '</div>' +
          priceBarHtml(d) +
          '<details class="md-details"><summary>Detaily o pozemku</summary><div class="md-det-body">' +
            '<div class="md-facts">' +
              (hasParcel(d) ? '<span>Parcela <b>č. ' + d.parcel + '</b></span>' : '') +
              '<span>Stav <b>' + d.extra + '</b></span>' +
            '</div>' +
            (isSPU(d) ? '<div class="md-note">Státní půda se prodává přes <b>veřejnou nabídku SPÚ (§ 12)</b> — otevřete „Nabídka SPÚ", parcelu ověříte přes „Katastr".</div>' : '') +
            (d.type === 'majitel' ? '<div class="md-note">Tenhle inzerát vložil <b>přímo majitel pozemku</b> tady na Parcelce — jednáte s ním <b>napřímo, bez realitky a provize</b>. Ostatní nabídky sbíráme z veřejných zdrojů. Vlastníka i parcelu si ověřte v katastru.' + (d._lid && typeof d.views === 'number' ? ' · <b>' + d.views + '×</b> zobrazeno' : '') + '</div>' : '') +
            goodToKnowHtml(d) +
          '</div></details>' +
        '</div>' +
        '<div class="md-actions">' +
          (d.type === 'majitel' && d.contact ? '<a class="lp-btn lp-src" href="' + contactHref(d.contact) + '">Kontakt na majitele</a>' : '') +
          '<a class="lp-btn" href="' + katastrUrl(d) + '"' + extAttr + '>Katastr</a>' +
          '<a class="lp-btn" href="' + mapyUrl(d) + '"' + extAttr + '>Mapa</a>' +
          (d.type === 'majitel' ? '' : (function () { var s = sourceLink(d); return '<a class="lp-btn lp-src" href="' + s.url + '"' + extAttr + '>' + s.label + '</a>'; })()) +
          (auctionYMD(d.extra) ? '<button class="lp-btn" type="button" data-cal>Do kalendáře</button>' : '') +
          '<button class="lp-btn lp-fav' + (isFav(d) ? ' on' : '') + '" type="button" data-fav-detail>' + BM_SVG + '<span>' + (isFav(d) ? 'Uloženo' : 'Uložit') + '</span></button>' +
          '<button class="lp-btn" type="button" data-share>Sdílet</button>' +
          '<a class="lp-watch" href="#upozorneni" data-okres="' + d.okres + '">Upozornit na okres ' + d.okres + '</a>' +
        '</div>' +
        nearbyHtml(d) +
      '</div>';
  }
  var selPoly = null;
  function resizeMapSoon() {
    setTimeout(function () { map.invalidateSize(); }, 60);
    setTimeout(function () { map.invalidateSize(); }, 340);
  }
  var holderEl = document.querySelector('.map-holder');
  var curDetail = null;
  var detailHideTimer = null, detailOpening = false;
  function showDetail(d) {
    if (!detailEl) return;
    clearTimeout(detailHideTimer);
    // ochrana: klik na tečku na mapě probublá až sem — ať hned zase nezavře detail
    detailOpening = true; setTimeout(function () { detailOpening = false; }, 0);
    curDetail = d;
    pushRecent(d);   // zapamatuj pro „Naposledy prohlédnuté"
    // Počítání zhlédnutí u živých inzerátů od majitelů (jednou za návštěvu webu).
    if (d._lid && !viewedLids[d._lid]) { viewedLids[d._lid] = 1; d.views = (d.views || 0) + 1; sbRpc('bump_view', { p_id: d._lid }); }
    detailEl.innerHTML = detailHtml(d);
    detailEl.scrollTop = 0;
    detailEl.removeAttribute('hidden');
    if (holderEl) holderEl.classList.add('detail-open');
    // na mobilu přijede mapa s panelem do zorného pole (panel je nad mapou)
    if (window.innerWidth <= 960 && holderEl) holderEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(function () { detailEl.classList.add('show'); });
    highlightMarker(d._id);
    highlightShape(d);
  }
  function hideDetail() {
    if (!detailEl) return;
    detailEl.classList.remove('show');
    if (holderEl) holderEl.classList.remove('detail-open');
    curDetail = null;
    clearTimeout(detailHideTimer);
    detailHideTimer = setTimeout(function () { detailEl.setAttribute('hidden', ''); }, 300);
    highlightMarker(-1);
    if (selPoly) { map.removeLayer(selPoly); selPoly = null; }
  }
  // Klepnutí na ztmavenou mapu vedle panelu detail zavře
  if (holderEl) holderEl.addEventListener('click', function (e) {
    if (detailOpening) return;
    if (!holderEl.classList.contains('detail-open')) return;
    if (detailEl && !detailEl.contains(e.target)) hideDetail();
  });

  // Přepínač Mapa / Seznam (mobil): zobrazí jedno místo obojího nad sebou.
  // Na mobilu ukážeme rovnou SEZNAM pozemků (obsah), mapa je na klepnutí.
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
      // Mapa byla schovaná → po zobrazení přepočítat velikost; při prvním
      // zobrazení i znovu vystředit na ČR (fit z inicializace proběhl naprázdno).
      if (!seznam) {
        setTimeout(function () {
          map.invalidateSize();
          if (!mapFittedVisible) { fitAllCZ(); mapFittedVisible = true; }
        }, 70);
      }
    }
    mvBtns.forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-mv')); });
    });
    // Výchozí zobrazení = MAPA (web je hlavně mapa). Seznam je na jedno klepnutí,
    // takže není zahrabaný pod mapou jako dřív.
    setView('mapa');
  })();
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
    // Značka pozemku = jednoduchý špendlík na přesném místě (jako Google Maps).
    var col = TYPE[d.type].color;
    var html = '<svg viewBox="0 0 24 34" width="30" height="42" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 1C6.2 1 1.5 5.7 1.5 11.5 1.5 19 12 33 12 33s10.5-14 10.5-21.5C22.5 5.7 17.8 1 12 1z" fill="' + col + '" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="12" cy="11.5" r="4.4" fill="#fff"/></svg>';
    var icon = L.divIcon({ html: html, className: 'sel-pin', iconSize: [30, 42], iconAnchor: [15, 40] });
    selPoly = L.marker([d.lat, d.lng], { icon: icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
  }

  // Tečkovaná mapa pozemků + obrysy krajů pro orientaci
  var dotLayer = L.layerGroup();
  var krajLayer = null;
  var lastVis = [], krajCounts = {};

  // Do kterého kraje bod PATŘÍ podle geometrie (ne podle okresu) — aby „klikací v tomto kraji"
  // odpovídalo tomu, co člověk na mapě VIDÍ. (Okres občas nesedí s polohou kvůli geokódování.)
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
  function krajGeoOf(d) {
    if (KRAJE_GEOM) { for (var k in KRAJE_GEOM) { if (ptInGeom(d.lng, d.lat, KRAJE_GEOM[k])) return k; } }
    return krajOf(d); // záloha pro body mimo polygon (nepřesné geokódování)
  }

  DATA.forEach(function (d, i) {
    d._id = i;
    d._gkraj = krajGeoOf(d); // kraj podle geometrie = kde bod na mapě leží
    var st = dotStyle(d); st.interactive = false; // klik řešíme ručně (canvas nechytá události)
    var m = L.circleMarker([d.lat, d.lng], st);
    m._d = d;
    markers.push(m);
  });

  // Klik na tečku: canvas kliky nechytá, tak najdeme nejbližší viditelný bod ke kliknutí.
  // Interaktivní jsou JEN tečky ve vybraném kraji. Klik do jiného kraje ten kraj jen
  // vybere (předchozí se zamkne) — teprve další klik na tečku v něm otevře detail.
  var krajJustSelected = false; // klik, který právě přepnul kraj, neotevírá detail
  map.on('click', function (e) {
    if (krajJustSelected) { krajJustSelected = false; return; }
    // Tečky jsou klikací, když nejsou zamčené (po výběru kraje NEBO po přiblížení mapy).
    if (dotsLocked || !lastVis.length) return;
    var cp = e.containerPoint, best = null, bestDist = Infinity;
    for (var i = 0; i < lastVis.length; i++) {
      var d = lastVis[i];
      // Když je vybraný kraj, bereme jen jeho tečky; bez kraje (přiblíženo) bereme kteroukoli viditelnou.
      if (selectedKraj && d._gkraj !== selectedKraj) continue;
      var p = map.latLngToContainerPoint([d.lat, d.lng]);
      var dx = p.x - cp.x, dy = p.y - cp.y, dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    // Prstem se přesně netrefíte na tečku — tolerance roste s velikostí tečky
    // (a tím i s přiblížením), aby se pozemek dal spolehlivě rozkliknout.
    var tol = Math.max(30, DOT_R + 26);
    if (best && bestDist <= tol * tol) { gotoInzerat(best); }
  });

  // Tečkovaná mapa: každý pozemek = tečka. Navíc obrysy krajů pro orientaci.
  var krajByName = {};
  // Na dotykových zařízeních není „myš pryč" → popisek kraje sám plynule zmizí.
  var isTouch = (typeof matchMedia === 'function' && matchMedia('(hover: none)').matches) || ('ontouchstart' in window);
  function styleKraj() { return { color: 'rgba(46,66,180,0.65)', weight: 1.8, fill: true, fillColor: '#3D63EE', fillOpacity: 0.025 }; }
  if (KRAJE_GEOM) {
    var feats = Object.keys(KRAJE_GEOM).map(function (k) { return { type: 'Feature', properties: { kraj: k }, geometry: KRAJE_GEOM[k] }; });
    krajLayer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      style: styleKraj,
      onEachFeature: function (f, layer) {
        krajByName[f.properties.kraj] = layer;
        layer.bindTooltip(f.properties.kraj + ' kraj', { sticky: true, direction: 'top', className: 'kraj-tip' });
        layer.on('click', function () {
          if (selectedKraj !== f.properties.kraj) krajJustSelected = true; // přepnutí kraje neotevírá detail
          selectKraj(f.properties.kraj);
        });
        layer.on('mouseover', function () { if (selectedKraj !== f.properties.kraj) { layer.setStyle({ weight: 2.6, color: '#2E42B4', fillOpacity: 0.07 }); layer.bringToFront(); } });
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
    vis.forEach(function (d) { var k = d._gkraj; if (!k) return; var o = krajCounts[k] || (krajCounts[k] = { total: 0 }); o.total++; o[d.type] = (o[d.type] || 0) + 1; });
    Object.keys(krajByName).forEach(function (k) {
      var o = krajCounts[k];
      var parts = [];
      if (o) ['sale', 'drazba', 'exekuce', 'obec', 'majitel'].forEach(function (tp) { if (o[tp]) parts.push(o[tp] + '× ' + TYPE[tp].label.toLowerCase()); });
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
  var nearMode = false, userPos = null, userMarker = null, nearCircle = null;
  var krajHintEl = document.getElementById('kraj-hint');
  var krajHeadEl = document.getElementById('kraj-head');
  var nearBtn = document.getElementById('map-near');
  // Sroluj rovnou k mapě, ať je hned vidět, že se něco děje (jinak se zdá, že tlačítko „nic nedělá").
  function scrollToMap() { if (holderEl) { try { holderEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} } }
  if (nearBtn) nearBtn.addEventListener('click', function () { scrollToMap(); enterNear(); });
  // Vzdálenost pozemku od uživatele (km) — pro řazení „nejblíž ke mně".
  function kmFromUser(d) {
    if (!userPos || typeof d.lat !== 'number') return Infinity;
    var R = 6371, r = Math.PI / 180;
    var dLat = (d.lat - userPos.lat) * r, dLng = (d.lng - userPos.lng) * r;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(userPos.lat * r) * Math.cos(d.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function styleSelectedKraj(layer) { layer.setStyle({ weight: 3, color: '#2E42B4', fillColor: '#3D63EE', fillOpacity: 0.1 }); layer.bringToFront(); }
  // Zámek teček: dokud není vybraný kraj, klik na tečku ignorujeme (klik pod tečkami vybere kraj).
  var dotsLocked = true;
  function lockDots(lock) {
    dotsLocked = lock;
    mapEl.classList.toggle('kraj-lock', lock);
  }
  var BACK_BTN = '<button class="kh-back" type="button" aria-label="Zpět"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>';
  function updateKrajHead() {
    if (krajHeadEl) {
      if (nearMode) {
        var within = 0, nearest = Infinity;
        lastVis.forEach(function (d) { var km = kmFromUser(d); if (km < nearest) nearest = km; if (km <= 50) within++; });
        var sub = !isFinite(nearest) ? 'seřazeno podle vzdálenosti'
          : (within > 0 ? (within + ' ' + plPozemek(within) + ' do 50 km od vás')
            : ('nejbližší ' + Math.round(nearest) + ' km od vás'));
        krajHeadEl.innerHTML = BACK_BTN + '<div class="kh-txt"><b>Ve vašem okolí</b><span>' + sub + '</span></div>';
        krajHeadEl.hidden = false;
        var b0 = krajHeadEl.querySelector('.kh-back'); if (b0) b0.addEventListener('click', clearKraj);
      } else if (!selectedKraj) {
        krajHeadEl.hidden = true;
      } else {
        var o = krajCounts[selectedKraj];
        var n = o ? o.total : 0;
        krajHeadEl.innerHTML = BACK_BTN + '<div class="kh-txt"><b>' + selectedKraj + ' kraj</b><span>' + (n ? ('Krok 2: klepněte na pozemek (' + n + ' ' + plPozemek(n) + ')') : 'zatím žádné nabídky') + '</span></div>';
        krajHeadEl.hidden = false;
        var b1 = krajHeadEl.querySelector('.kh-back'); if (b1) b1.addEventListener('click', clearKraj);
      }
    }
    if (krajHintEl) krajHintEl.hidden = !!(selectedKraj || nearMode);
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
    clearNear();       // výběr kraje ruší režim „okolí"
    selectedKraj = k;
    if (krajLayer) krajLayer.setStyle(styleKraj);
    var layer = krajByName[k];
    if (layer) {
      styleSelectedKraj(layer);
      // Lehké přiblížení ke kraji — nízký strop zoomu, ať se nezanoří moc (jen se přiblíží).
      if (!skipFit) map.fitBounds(layer.getBounds(), { maxZoom: 8, padding: [24, 24] });
    }
    setPan(true);      // po výběru kraje jde s mapou volně hýbat (bez zvláštního tlačítka)
    lockDots(false);   // tečky teď klikací
    updateKrajHead();
  }
  function clearKraj() {
    selectedKraj = null;
    var wasNear = nearMode;
    clearNear();
    if (wasNear) { sortMode = 'demand'; if (sortEl) sortEl.value = 'demand'; }
    if (krajLayer) krajLayer.setStyle(styleKraj);
    hideDetail();
    lockDots(true);    // zpět: klikají se zase kraje
    setPan(false);     // na přehledu mapu zase zamkneme (stránka přes ni roluje)
    fitAllCZ();
    updateKrajHead();
    renderList();
  }
  // Je bod přibližně v ČR? (pojistka proti nesmyslné IP poloze, např. přes VPN)
  // Přejde do režimu „okolí" na dané poloze. approx = přibližná (podle IP).
  function enterNearAt(pos, approx) {
    userPos = { lat: pos.lat, lng: pos.lng };
    selectedKraj = null;
    if (krajLayer) krajLayer.setStyle(styleKraj);
    nearMode = true;
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([userPos.lat, userPos.lng], { icon: L.divIcon({ className: 'pk-me-wrap' + (approx ? ' approx' : ''), html: '<span class="pk-me"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000, interactive: false }).addTo(map);
    lockDots(false);
    setPan(true);
    if (nearBtn) nearBtn.classList.add('on');
    sortMode = 'near';
    if (sortEl) sortEl.value = 'near';
    frameNear(approx);        // nakresli okruh okolí + zarámuj na vás i nejbližší pozemky
    if (typeof scrollToMap === 'function') scrollToMap();   // ať je mapa s výsledkem opravdu vidět
    updateKrajHead();
    renderList();
    showToast(approx ? 'Pozemky v okolí — seřazeno podle vzdálenosti.' : 'Seřazeno podle vzdálenosti od vás.');
  }
  // Nakreslí kruh „okolí" kolem vás a přizpůsobí pohled tak, aby byly vidět
  // nejbližší pozemky (ne jen prázdná mapa kolem vaší polohy).
  function frameNear(approx) {
    if (!userPos) return;
    var cand = (lastVis || []).map(function (d) { return kmFromUser(d); })
      .filter(function (km) { return isFinite(km); })
      .sort(function (a, b) { return a - b; });
    var radiusKm;
    if (cand.length) {
      var idx = Math.min(cand.length - 1, 7);   // ~8. nejbližší pozemek
      radiusKm = Math.max(10, Math.min(70, cand[idx] * 1.2));
    } else {
      radiusKm = 30;
    }
    if (nearCircle) { map.removeLayer(nearCircle); nearCircle = null; }
    nearCircle = L.circle([userPos.lat, userPos.lng], {
      radius: radiusKm * 1000, pane: 'overlayPane',
      color: '#3D63EE', weight: 1.5, opacity: 0.55,
      fillColor: '#3D63EE', fillOpacity: 0.06, interactive: false
    }).addTo(map);
    try { map.fitBounds(nearCircle.getBounds(), { padding: [36, 36], maxZoom: approx ? 11 : 13, animate: true }); }
    catch (e) { map.setView([userPos.lat, userPos.lng], approx ? 10 : 11, { animate: true }); }
  }
  // Přibližná poloha podle IP — když GPS není povolená. Zkusí dva zdroje (HTTPS, bez klíče).
  // Zaostři ruční hledání obce (když se poloha nepovede).
  // Obrazovka „poloha se nepovedla" — ukáže se jen jako poslední záchrana,
  // když selže i přibližná poloha podle připojení. Vede rovnou k napsání obce.
  // Najde souřadnice napsané obce/okresu POUZE z našich dat (bez internetu):
  // vezme skutečný pozemek v té obci → mapa se pak vystředí přesně tam, kde
  // pozemky opravdu jsou. Když obec nenajde, zkusí okres a nakonec kraj.
  function normTxt(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function geocodeTownLocal(q) {
    var n = normTxt(q); if (n.length < 2) return null;
    var i, d;
    for (i = 0; i < DATA.length; i++) { d = DATA[i]; if (typeof d.lat === 'number' && normTxt(d.place) === n) return { lat: d.lat, lng: d.lng }; }
    for (i = 0; i < DATA.length; i++) { d = DATA[i]; if (typeof d.lat === 'number' && normTxt(d.place).indexOf(n) >= 0) return { lat: d.lat, lng: d.lng }; }
    for (i = 0; i < DATA.length; i++) { d = DATA[i]; if (typeof d.lat === 'number' && normTxt(d.okres).indexOf(n) >= 0) return { lat: d.lat, lng: d.lng }; }
    for (var kn in KRAJE) { if (normTxt(kn).indexOf(n) >= 0) return { lat: KRAJE[kn].c[0], lng: KRAJE[kn].c[1] }; }
    return null;
  }
  var LOC_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  function showLocModal(err) {
    // Minimalistické okno: žádné odstavce ani návody. Buď použij mou polohu,
    // nebo napiš obec. (Systémový dotaz „Povolit polohu?" ukáže prohlížeč sám
    // při volbě „Použít mou polohu"; pokud je zakázaný, zafunguje napsání obce.)
    var ov = document.createElement('div'); ov.className = 'loc-ov';
    ov.innerHTML =
      '<div class="loc-card" role="dialog" aria-modal="true" aria-label="Kde hledat">' +
        '<button class="loc-x" type="button" aria-label="Zavřít">✕</button>' +
        '<div class="loc-ic">' + LOC_PIN + '</div>' +
        '<h3>Kde hledat?</h3>' +
        '<div style="margin-top:4px;">' +
          '<input type="text" id="loc-town" inputmode="text" autocomplete="off" autocapitalize="words" ' +
            'placeholder="Napište obec (např. Kolín)" ' +
            'style="width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid var(--line,#ccd);border-radius:12px;font-size:16px;background:var(--ink-soft,#fff);color:var(--text-ondark,#141829);">' +
          '<div id="loc-err" hidden style="color:var(--c-exekuce,#e33);font-size:13px;margin:6px 2px 0;text-align:left;"></div>' +
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
    // „Použít mou polohu" zkusí GPS PŘÍMO tady (v rámci kliknutí = prohlížeč smí
    // ukázat systémový dotaz). Nezavíráme a neotevíráme okno dokola — při úspěchu
    // zaměříme, při zákazu jasně napíšeme, ať uživatel nekouká na prázdno.
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
  // Když přesná GPS nejde: polohu podle IP VĚDOMĚ nepoužíváme — na mobilu/5G
  // ukazuje město operátora (typicky Prahu), takže to lidi mátlo a házelo je
  // do Prahy. Místo toho slušně požádáme o obec — to je přesné a rychlé.
  function fallbackNear(err) {
    showLocModal(err);
  }
  // Vlastní žádost o GPS + prompt prohlížeče.
  function askGeo() {
    showToast('Zjišťuji vaši polohu…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      enterNearAt({ lat: pos.coords.latitude, lng: pos.coords.longitude }, false);
    }, function (err) {
      fallbackNear(err);   // GPS zamítnuta/selhala → přibližná poloha podle připojení
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
  }
  // „Pozemky v okolí" — chováme se přesně jako běžné weby: NEkontrolujeme
  // předem stav povolení, prostě rovnou požádáme prohlížeč o polohu. iOS/Safari
  // pak sám ukáže buď dotaz „Povolit?", nebo (když je poloha vypnutá) svůj
  // vlastní odkaz do Nastavení. Teprve když to prohlížeč zamítne, ukážeme
  // vlastní návod. (Dřívější předběžná kontrola ten systémový dotaz přeskakovala.)
  function enterNear() {
    if (!navigator.geolocation) { showLocModal({ code: 2 }); return; }
    askGeo();
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
    ['sale', 'drazba', 'exekuce', 'obec', 'majitel'].forEach(function (tp) {
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

  // Po přiblížení mapy zpřístupníme tečky přímo (netřeba nejdřív vybírat kraj).
  // Na přehledu (oddálené) zůstává výběr kraje — tam se tečky překrývají.
  map.on('zoomend', function () {
    if (nearMode) return;
    if (map.getZoom() >= 10) { if (dotsLocked) lockDots(false); }
    else if (!selectedKraj) { if (!dotsLocked) lockDots(true); }
  });

  // Body ROSTOU s přiblížením (jsou to canvas kroužky s pevnou velikostí v px, takže
  // se při zoomu jinak nezvětšují a působí, že se „zmenšují" a nejdou trefit).
  // Čím víc přiblíženo, tím větší tečka → snadné klepnutí i lepší viditelnost.
  function dotRadiusForZoom() {
    var z = map.getZoom();
    // Čím víc přiblíženo, tím výrazně větší tečka → snadné klepnutí prstem.
    return Math.max(3.6, Math.min(16, 3.6 + (z - 8) * 1.5));
  }
  function resizeDots() {
    var r = dotRadiusForZoom();
    DOT_R = r; DOT_R_SEL = r + 2.6;
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i]; if (!m || !m._d || !m.setRadius) continue;
      if (selMarkerId != null && i === selMarkerId) continue; // vybraný necháme zvýrazněný
      var urgent = isUrgent(m._d), feat = isFeatured(m._d);
      var rr = urgent ? r + 0.7 : (feat ? r + 1 : r);
      if (m.options.radius !== rr) m.setRadius(rr);
    }
  }
  map.on('zoomend', resizeDots);
  resizeDots();

  function visible(d) {
    var okType = activeType === 'all' || d.type === activeType;
    var okSearch = !searchTerm || (d.place + ' ' + d.okres).toLowerCase().indexOf(searchTerm) !== -1;
    var okDruh = activeDruh === 'all' || druhGroup(d.druh) === activeDruh;
    var okPrice = !maxPrice || !d.price || d.price <= maxPrice;
    var okArea = !minArea || (hasArea(d) && d.area >= minArea);
    var okUrgent = !urgentOnly || (function () { var dd = daysUntil(d.extra); return (d.type === 'drazba' || d.type === 'exekuce') && dd != null && dd >= 0 && dd <= 14; })();
    var okFav = !favOnly || isFav(d);
    return okType && okSearch && okDruh && okPrice && okArea && okUrgent && okFav;
  }
  function perM2Val(d){ return hasArea(d) ? d.price / d.area : Infinity; }
  // „Rozprostření": u řazení Doporučené nechceme 5 dražeb (nebo 2× stejná obec)
  // za sebou. Zachová pořadí podle skóre, jen bere vždy nejlepší kousek, který
  // není stejného typu ani ze stejné obce jako ten předchozí. Výsledek = pestrá,
  // reprezentativní ukázka (prodej i dražba) místo jednotvárného shluku.
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
    else { arr.sort(function (a, b) { return demand(b) - demand(a); }); declump(arr); }
    // Zvýrazněné (placené) inzeráty nahoru — stabilní dořazení zachová pořadí uvnitř skupin.
    arr.sort(function (a, b) { return (isFeatured(b) ? 1 : 0) - (isFeatured(a) ? 1 : 0); });
    return arr;
  }

  // Interní skóre pro řazení „Doporučené" a výběr špičky (★ Doporučujeme).
  // Čím výhodnější cena/m² a zajímavější typ, tím vyšší. Není to počet lidí —
  // slouží jen k pořadí, žádné vymyšlené „sledující" se nikde nezobrazují.
  function demand(d) {
    if (d._demand != null) return d._demand;
    var perM2 = hasArea(d) ? d.price / d.area : 500;
    var typeBonus = { drazba: 22, exekuce: 18, obec: 12, sale: 8, majitel: 10 }[d.type] || 0;
    var deal = Math.max(0, Math.min(58, (900 - perM2) / 18)); // výhodnost s nasycením
    d._demand = Math.max(6, Math.round(9 + typeBonus + deal));
    return d._demand;
  }

  var LIST_LIMIT = 8;
  // Ukazatel u „Cena, výměra a řazení" — kolik doplňkových filtrů je aktivních,
  // ať uživatel pozná, že něco filtruje, i když je panel sbalený.
  var msfBadge = document.getElementById('msf-badge');
  function updateFilterBadge() {
    if (!msfBadge) return;
    var n = 0;
    if (maxPrice) n++;
    if (minArea) n++;
    if (activeDruh && activeDruh !== 'all') n++;
    if (urgentOnly) n++;
    if (favOnly) n++;
    if (sortMode && sortMode !== 'demand') n++;
    if (n > 0) { msfBadge.textContent = n; msfBadge.hidden = false; }
    else { msfBadge.hidden = true; }
  }

  function renderList() {
    updateFilterBadge();
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
    // „★ Doporučujeme" jen pro JEDINOU nejlepší nabídku — ať odznak něco znamená
    // (dřív svítil na 3 kartách za sebou = vypadalo to jako spam).
    var hotIds = {};
    if (vis.length >= 5) {
      vis.slice().sort(function (a, b) { return demand(b) - demand(a); }).slice(0, 1)
        .forEach(function (d) { hotIds[d._id] = true; });
    }
    var top = vis.slice(0, LIST_LIMIT);

    top.forEach(function (d, rank) {
      var t = TYPE[d.type];
      var perM2 = hasArea(d) ? Math.round(d.price / d.area) : null;
      var hot = !!hotIds[d._id];
      var li = document.createElement('li');
      li.className = 'opp-item ' + d.type + (hot ? ' is-hot' : '') + (isFeatured(d) ? ' is-featured' : '');
      li.setAttribute('data-id', d._id);
      li.setAttribute('tabindex', '0');
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', t.label + ' · ' + d.place + ' · ' + areaTxt(d));
      var days = daysUntil(d.extra);
      var cd = days != null && days >= 0 ? '<span class="opp-cd' + countdownClass(days) + '">' + countdownText(days) + '</span>' : '';
      // Podřádek „co to je": druh (s velkým písmenem) · parcela — jeden řádek, ořízne se
      var druhCap = d.druh ? d.druh.charAt(0).toUpperCase() + d.druh.slice(1) : '';
      var subParts = [];
      if (druhCap) subParts.push(druhCap);
      if (hasParcel(d)) subParts.push('parc. ' + d.parcel);
      var sub = subParts.join(' · ');
      // Řádek s výměrou a Kč/m² (cena je zvlášť, velká, nahoře v těle karty)
      var figs =
        (hasArea(d) ? '<span class="m">' + fmt(d.area) + ' m²</span>' : '<span class="m">výměra neuvedena</span>') +
        (perM2 ? '<span class="opp-perm2">' + fmt(perM2) + ' Kč/m²</span>' : '') +
        (sortMode === 'near' && userPos && isFinite(kmFromUser(d)) ? '<span class="opp-km">' + (kmFromUser(d) < 1 ? '<1' : Math.round(kmFromUser(d))) + ' km</span>' : '');
      // Stavové odznaky pohromadě na jednom řádku
      var chips = [];
      if (isFeatured(d)) chips.push('<span class="opp-feat">Zvýrazněno</span>');
      if (cd) chips.push(cd);
      if (perM2 && dealMax && perM2 <= dealMax) {
        var _di = dealInfo(d);
        chips.push('<span class="opp-deal">' + (_di && _di.cheaper >= 70 ? 'levnější než ' + _di.cheaper + ' %' : 'výhodná cena') + '</span>');
      }
      if (hot) chips.push('<span class="opp-hot">Doporučujeme</span>');
      li.innerHTML =
        '<div class="opp-media">' +
          mapThumb(d) +
          '<button type="button" class="opp-fav' + (isFav(d) ? ' on' : '') + '" aria-label="' + (isFav(d) ? 'Odebrat z uložených' : 'Uložit pozemek') + '">' + BM_SVG + '</button>' +
        '</div>' +
        '<div class="opp-body">' +
          '<div class="opp-price">' + fmt(d.price) + ' Kč</div>' +
          '<span class="opp-place">' + d.place + '</span>' +
          (d.okres ? '<div class="opp-loc">okres ' + d.okres + '</div>' : '') +
          (sub ? '<div class="opp-sub">' + sub + '</div>' : '') +
          '<div class="opp-figures">' + figs + '</div>' +
          (chips.length ? '<div class="opp-chips">' + chips.join('') + '</div>' : '') +
        '</div>';
      // Ťuknutí kamkoli na kartu (i na snímek) → samostatná stránka inzerátu.
      // Na mapu se dostaneš z inzerátu (snímek nebo tlačítko „Zobrazit na mapě").
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
      listEl.appendChild(li);
    });

    var headLabel = sortMode === 'demand' ? 'Doporučené příležitosti' : 'Vybrané příležitosti';
    countEl.innerHTML = headLabel + ' · <span class="mc-sub">' + matched + ' na mapě</span>';
    var mvCount = document.getElementById('mvt-count'); if (mvCount) mvCount.textContent = matched ? '(' + matched + ')' : '';
    if (matched === 0) {
      var anyFilter = activeType !== 'all' || activeDruh !== 'all' || maxPrice || searchTerm || favOnly || urgentOnly || minArea;
      var emptyMsg;
      if (favOnly && !favCount()) {
        emptyMsg = 'Zatím nemáte uložené žádné pozemky. U každé nabídky klepněte na záložku a najdete je tady pohromadě.';
      } else if (anyFilter) {
        emptyMsg = 'Nic neodpovídá vybraným filtrům. Zkuste je zmírnit — třeba zvýšit cenu, zvětšit rozsah výměry nebo vybrat „Vše".';
      } else {
        emptyMsg = 'Tady zrovna nic není. Příležitostí přibývá každý týden — zkuste to za pár dní.';
      }
      listEl.innerHTML = '<li class="map-count" style="padding:20px 6px; text-transform:none; font-weight:400; line-height:1.6;">' + emptyMsg +
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
    activeType = 'all'; activeDruh = 'all'; maxPrice = 0; minArea = 0; urgentOnly = false; searchTerm = ''; favOnly = false;
    if (searchEl) searchEl.value = '';
    if (druhEl) druhEl.value = 'all';
    if (cenaEl) { cenaEl.value = ''; cenaEl.dispatchEvent(new Event('pk-reset')); }
    if (areaEl) { areaEl.value = ''; areaEl.dispatchEvent(new Event('pk-reset')); }
    if (urgentEl) { urgentEl.classList.remove('on'); urgentEl.setAttribute('aria-pressed', 'false'); }
    filtersEl.querySelectorAll('.filter-chip').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-type') === 'all');
    });
    refreshFavBtn();
    renderList();
  }

  // Sdílený odkaz ?p=<klíč> otevře konkrétní pozemek a odscrolluje na mapu
  // Otevři konkrétní pozemek: přiblíž mapu na jeho okolí, otevři detail a
  // sroluj mapu do zorného pole. Sdílí ho sdílený odkaz i „Nejvýhodnější".
  // Otevři samostatnou stránku inzerátu (jako listing na realitce). Používá se
  // z mapy (klik na tečku), z „Nejvýhodnějších", „Naposledy prohlédnutých" i
  // z „Podobných pozemků" — všude vede pozemek na svou vlastní stránku.
  function gotoInzerat(d) {
    if (!d) return;
    // Předáme pozemek přes sessionStorage, ať se stránka inzerátu zobrazí OKAMŽITĚ
    // (nemusí čekat na stažení celého seznamu). Plynulé, bez „zaseknutí".
    try {
      sessionStorage.setItem('pk_open', JSON.stringify({
        place: d.place, okres: d.okres, parcel: d.parcel, druh: d.druh,
        price: d.price, area: d.area, type: d.type, lat: d.lat, lng: d.lng,
        extra: d.extra, url: d.url, featured: d.featured
      }));
      // Zapamatuj si přesné místo/přiblížení mapy, ať „zpět" vrátí uživatele
      // TAM, kde skončil (ne na výchozí pohled na celou ČR).
      var c = map.getCenter();
      sessionStorage.setItem('pk_map_return', JSON.stringify({
        lat: c.lat, lng: c.lng, z: map.getZoom(), kraj: selectedKraj || null, t: Date.now()
      }));
    } catch (e) {}
    location.href = 'pozemek.html?p=' + encodeURIComponent(pkey(d)) + '&ll=' + d.lat + ',' + d.lng;
  }
  // „Zobrazit na mapě" / sdílený odkaz: přiblíž mapu tak, aby byl pozemek
  // VYZNAČENÝ OHRANIČENÍM (ne jen tečkou) a pěkně zarámovaný na celou obrazovku.
  function openParcel(target) {
    if (!target) return;
    var k = krajOf(target);
    if (k) selectKraj(k, true);
    highlightShape(target);                 // špendlík na místě pozemku
    function frame() {
      map.invalidateSize();
      map.setView([target.lat, target.lng], 17, { animate: false });
    }
    frame();
    updateMapView();
    highlightMarker(target._id);
    highlightList(target._id);
    if (holderEl) setTimeout(function () { holderEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150);
    // Znovu zarámuj po dorovnání rozměrů mapy (po scrollu/layoutu) — ať to
    // spolehlivě sedne PŘÍMO na pozemek, ne jen „někam nad mapu".
    setTimeout(frame, 500);
  }
  // Po použití sdíleného odkazu uklidíme adresu na čisté „/", ať další
  // znovunačtení začne na výchozím stavu (celá ČR), ne zase na tom pozemku.
  function cleanUrl() { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  function openFromUrl() {
    // ?kraj=<název> — přiblíž mapu na daný kraj (odkaz z krajských/okresních stránek).
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
    // ?lid=<id> — otevři konkrétní živý inzerát od majitele (z „Můj inzerát").
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
    DATA.forEach(function (d) { if (pkey(d) === key) target = d; });
    if (!target) { cleanUrl(); return false; }
    openParcel(target);
    cleanUrl();
    return true;
  }
  // „Nejvýhodnější právě teď" — přidaná hodnota ukázaná čísly: pozemky, které
  // vyšly nejlevněji oproti podobným nabídkám. Reálná data, žádné sliby.
  function renderDeals() {
    var grid = document.getElementById('deals-grid');
    var sec = document.getElementById('vyhodne');
    if (!grid || !sec) return;
    // Jen jeden nejvýhodnější z každého druhu — ať to není 6× stejná levná
    // orná půda, ale pestrá ukázka (stavební, zahrada, louka…). Pestřejší =
    // uvěřitelnější a užitečnější.
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
    if (top.length < 3) { sec.hidden = true; return; } // radši nic než pár náhod
    grid.innerHTML = top.map(function (o) {
      var d = o.d, t = TYPE[d.type];
      var perM2 = Math.round(d.price / d.area);
      return '<button type="button" class="deal-card" data-rkey="' + encodeURIComponent(pkey(d)) + '">' +
        '<div class="deal-badge">levnější než ' + o.di.cheaper + ' % podobných</div>' +
        '<div class="deal-place"><span class="deal-dot" style="background:' + t.color + '"></span>' + d.place + '</div>' +
        '<div class="deal-sub">' + t.label + ' · ' + (d.druh || 'pozemek') + ' · okres ' + d.okres + '</div>' +
        '<div class="deal-figs"><b>' + fmt(d.price) + ' Kč</b><span>' + fmt(d.area) + ' m²</span><span>' + fmt(perM2) + ' Kč/m²</span></div>' +
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

  // Sekce „Pozemky od lidí" — nabídky vložené majiteli (type:'majitel').
  // Dokud žádné nejsou, ukáže vlídný prázdný stav („buďte první"). Jakmile
  // se objeví (přes user-listings.json), vypíšou se jako karty a otevřou na mapě.
  function renderUserListings() {
    var wrap = document.getElementById('user-listings');
    if (!wrap) return;
    var items = DATA.filter(function (d) { return d.type === 'majitel'; });
    var cta = document.querySelector('.odl-cta');
    if (!items.length) {
      // Prázdný stav rovnou s tlačítkem — a schováme zdvojený CTA box níž.
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
      var perM2 = hasArea(d) ? Math.round(d.price / d.area) : null;
      return '<button type="button" class="odl-card" data-rkey="' + encodeURIComponent(pkey(d)) + '">' +
        '<span class="odl-badge">Přímo od majitele</span>' +
        '<span class="odl-place">' + d.place + '</span>' +
        '<span class="odl-sub">' + (d.druh || 'pozemek') + (d.okres ? ' · okres ' + d.okres : '') + '</span>' +
        '<span class="odl-figs"><b>' + fmt(d.price) + ' Kč</b>' + (hasArea(d) ? '<span>' + fmt(d.area) + ' m²</span>' : '') + (perM2 ? '<span>' + fmt(perM2) + ' Kč/m²</span>' : '') + '</span>' +
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
  searchEl.addEventListener('input', function () {
    searchTerm = searchEl.value.trim().toLowerCase();
    renderList();
  });
  if (druhEl) druhEl.addEventListener('change', function () { activeDruh = druhEl.value; renderList(); });
  if (sortEl) sortEl.addEventListener('change', function () {
    if (sortEl.value === 'near') { enterNear(); return; } // vyžádá polohu, pak seřadí
    sortMode = sortEl.value; renderList();
  });
  // Cena/výměra jsou teď textová pole — reaguj i na psaní (input) a na reset.
  if (cenaEl) ['input', 'change', 'pk-reset'].forEach(function (ev) { cenaEl.addEventListener(ev, function () { maxPrice = parseInt(cenaEl.value, 10) || 0; renderList(); }); });
  if (areaEl) ['input', 'change', 'pk-reset'].forEach(function (ev) { areaEl.addEventListener(ev, function () { minArea = parseInt(areaEl.value, 10) || 0; renderList(); }); });
  if (urgentEl) urgentEl.addEventListener('click', function () { urgentOnly = !urgentOnly; urgentEl.classList.toggle('on', urgentOnly); urgentEl.setAttribute('aria-pressed', String(urgentOnly)); renderList(); });
  if (favEl) favEl.addEventListener('click', function () { favOnly = !favOnly; refreshFavBtn(); renderList(); });

  refreshFavBtn();
  renderList();
  renderRecent();
  renderDeals();
  renderUserListings();
  // Návrat z detailu pozemku (tlačítko „zpět"): vrať mapu přesně tam, kde uživatel skončil.
  function restoreMapReturn() {
    var ret = null;
    try { ret = JSON.parse(sessionStorage.getItem('pk_map_return') || 'null'); } catch (e) {}
    try { sessionStorage.removeItem('pk_map_return'); } catch (e) {}
    if (!ret || typeof ret.lat !== 'number' || !ret.t) return false;
    if (Date.now() - ret.t > 30 * 60 * 1000) return false; // starší než 30 min → ignoruj
    var z = ret.z || 12;
    if (ret.kraj) { try { selectKraj(ret.kraj, true); } catch (e) {} }
    map.invalidateSize();
    map.setView([ret.lat, ret.lng], z, { animate: false });
    if (z >= 10) { try { if (dotsLocked) lockDots(false); } catch (e) {} }
    // ukázat mapu (ne vršek stránky) — několikrát po sobě, ať to sedne i po dorovnání layoutu
    if (holderEl) { [60, 240, 500].forEach(function (ms) { setTimeout(function () { holderEl.scrollIntoView({ block: 'center' }); }, ms); }); }
    return true;
  }
  var deepLinked = openFromUrl() || restoreMapReturn();
  // Po dopočítání rozměrů mapy znovu vyrovnáme na celou ČR (pokud nejde o
  // sdílený odkaz na konkrétní parcelu, který si drží vlastní přiblížení).
  setTimeout(function () { map.invalidateSize(); if (!deepLinked) fitAllCZ(); }, 300);
  }

  /* ---------- Načtení reálných dat s bezpečnou zálohou ---------- */
  function loadJSON(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  Promise.all([loadJSON('data/opportunities.json'), loadJSON('data/kraje.json'), loadJSON('data/user-listings.json'), sbRpc('public_listings')])
    .then(function (res) {
      var j = res[0], kraje = res[1], ul = res[2], live = res[3];
      var arr = Array.isArray(j) ? j : (j && j.opportunities);
      var base = (arr && arr.length ? arr.slice() : FALLBACK_DATA.slice());
      // Pozemky od majitelů — schválené inzeráty z data/user-listings.json
      // přidáme na mapu MEZI ostatní (ne do zvláštní sekce), jako kategorie „Od majitele".
      var users = Array.isArray(ul) ? ul : (ul && ul.listings);
      if (users && users.length) {
        users.forEach(function (u) {
          if (!u || typeof u.lat !== 'number' || typeof u.lng !== 'number') return;
          u.type = 'majitel';
          if (!u.extra) u.extra = 'od majitele';
          base.push(u);
        });
      }
      // Živé inzeráty od majitelů ze Supabase (automatické zveřejnění) — přidáme na mapu.
      // BEZPEČNOST: text od cizích lidí očistíme — odstraníme nebezpečné znaky (< > "),
      // ať nikdo nemůže vložit škodlivý kód (ochrana proti XSS). Ořežeme i délku.
      function clean(s, max) {
        return String(s == null ? '' : s).replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 120);
      }
      // Fotky přijmeme jen jako odkazy do NAŠEHO úložiště (stejná pojistka jako
      // na serveru) — nikdy ne cizí adresu. Bez uvozovek, ať se nedá rozbít HTML.
      function cleanPhotos(a) {
        if (!Array.isArray(a)) return [];
        return a.filter(function (p) {
          return typeof p === 'string' && p.indexOf('"') === -1 &&
            /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/listing-photos\//.test(p);
        }).slice(0, 8);
      }
      // Vybavení — jen povolené hodnoty (stejná pojistka jako na serveru)
      var OK_FEAT = { 'Elektřina': 1, 'Voda': 1, 'Kanalizace': 1, 'Plyn': 1, 'Oplocení': 1 };
      function cleanFeatures(a) {
        if (!Array.isArray(a)) return [];
        return a.filter(function (f) { return OK_FEAT[f]; }).slice(0, 6);
      }
      if (Array.isArray(live)) {
        live.forEach(function (u) {
          if (!u || typeof u.lat !== 'number' || typeof u.lng !== 'number') return;
          base.push({
            type: 'majitel',
            place: clean(u.place, 80) || 'Neuvedeno', okres: clean(u.okres, 60),
            druh: clean(u.druh, 40) || 'pozemek',
            parcel: clean(u.parcel, 40) || '—',
            area: (typeof u.area === 'number' ? u.area : 0),
            price: (typeof u.price === 'number' ? u.price : 0),
            lat: u.lat, lng: u.lng,
            extra: 'od majitele',
            contact: clean(u.contact, 80),
            description: clean(u.description, 600),
            photos: cleanPhotos(u.photos),
            features: cleanFeatures(u.features), access: (u.access ? clean(u.access, 40) : ''),
            _lid: u.id, views: (typeof u.views === 'number' ? u.views : 0)
          });
        });
      }
      boot(base, kraje || null, j && j.updated);
    });
})();
