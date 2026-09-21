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

  /* Barva kategorie má JEDEN zdroj, a tím je CSS. Dřív byla opsaná tady,
     znovu v pozemek.js a potřetí v pravidlech stylu — a když se paleta
     měnila, mapa a karty si u téhož pozemku přestaly odpovídat. Tady se
     tedy jen přečte proměnná ze stylu; hodnota v kódu je záloha pro případ,
     že by styl ještě nebyl načtený. Hlídá to scripts/test-barvy.mjs. */
  function tokenBarva(nazev, zaloha) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(nazev).trim();
      return v || zaloha;
    } catch (e) { return zaloha; }
  }
  var TYPE = {
    sale:    { label: 'Na prodej',    color: tokenBarva('--c-sale', '#4361B8'), link: { label: 'Nabídka SPÚ',          url: 'https://spu.gov.cz/nabidky' } },
    drazba:  { label: 'Dražba',       color: tokenBarva('--c-drazba', '#CC6B33'), link: { label: 'Detail dražby',       url: 'https://www.portaldrazeb.cz/' } },
    exekuce: { label: 'Exekuce',      color: tokenBarva('--c-exekuce', '#8C2F1E'), link: { label: 'Insolvenční rejstřík', url: 'https://isir.justice.cz/isir/common/index.do' } },
    obec:    { label: 'Obecní záměr', color: tokenBarva('--c-obec', '#12AEBE'), link: { label: 'Úřední deska obce',    url: 'https://www.uredni-deska.cz/' } },
    majitel: { label: 'Přímo od majitele',  color: tokenBarva('--c-majitel', '#8B4FE0'), link: { label: 'Ověřit v katastru',    url: 'https://www.ikatastr.cz/' } }
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
  // Stabilní klíč pozemku — pro oblíbené i sdílení odkazu.
  //
  // Dřív to bylo jen místo|parcela|okres. Jenže parcelní číslo zná jen menšina
  // záznamů (u zbytku je „—"), takže jeden klíč sedl na víc pozemků naráz:
  // pod „Brno|—|Brno-město" jich bylo patnáct. Uložení jednoho pozemku pak
  // označilo všechny sourozence a sdílený odkaz otevřel někoho jiného.
  // Souřadnice to rozdělí: robot je pro jeden pozemek počítá deterministicky
  // (jitter z názvu a parcely), takže se mezi běhy nemění, a tři desetinná
  // místa (~100 m) snesou i drobné zpřesnění geokódování.
  function pkey(d){
    var la = (typeof d.lat === 'number') ? d.lat.toFixed(3) : '';
    var ln = (typeof d.lng === 'number') ? d.lng.toFixed(3) : '';
    return [d.place || '', d.parcel || '', d.okres || '', la, ln].join('|');
  }
  // Starý tvar klíče — jen pro odkazy rozeslané dřív, ať neskončí naprázdno.
  function pkeyLegacy(d){ return [d.place || '', d.parcel || '', d.okres || ''].join('|'); }
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
  /** Dražba, jejíž termín už minul. */
  function jeProsle(d){ var n = daysUntil(d.extra); return n != null && n < 0; }
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
    // Zavírací tlačítko i klepnutí mimo okno. Bylo to dřív svázané s oknem
    // hlídání; to je pryč, tohle musí zůstat, jinak by okno se zásadami
    // soukromí nešlo zavřít jinak než obnovením stránky.
    if (e.target.closest('[data-close]')) closeInfo();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeInfo(); });
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
    /* „Nahoru" plave u pravého dolního rohu a v patičce sedělo přímo na
       copyrightu. Kdo je u patičky, je na konci a chce její odkazy, ne skok
       zpátky — tak mu uhneme. */
    if (toTop) {
      var patka = document.querySelector('footer');
      var vPatce = patka && patka.getBoundingClientRect().top < window.innerHeight - 60;
      toTop.classList.toggle('show', y > 500 && !vPatce);
    }
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
  function boot(DATA, KRAJE_GEOM, updated, updatedAt, zdrojeStav) {
  /* Tentýž pozemek chodí ze dvou zdrojů a ve výpisu se pak objevil dvakrát
     (zrovna „Trubín, 1 875 000 Kč" hned dvakrát za sebou). Shoda obce,
     okresu, ceny i výměry je jistota — dvě různé nabídky se v tomhle
     všem netrefí. Kdo vidí týž pozemek dvakrát, přestane výpisu věřit. */
  (function odstranDuplicity() {
    var videno = {}, ven = [];
    for (var i = 0; i < DATA.length; i++) {
      var d = DATA[i];
      var k = [d.place, d.okres, d.price, d.area, d.druh].join('|');
      if (videno[k]) continue;
      videno[k] = true;
      ven.push(d);
    }
    if (ven.length !== DATA.length) DATA = ven;
  })();

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
    // Když robot zapsal i přesný čas, ukáže se — „zkontrolováno dnes v 7:00"
    // řekne o čerstvosti mnohem víc než datum. Starší datové soubory čas
    // nemají, proto se na něj nespoléhá.
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

    /* Stav jednotlivých zdrojů. Jedno datum za všechno dohromady zakrývá
     * nejnebezpečnější případ: jeden zdroj tiše přestane vracet data
     * a web dál tvrdí, že je čerstvý. Tady je u každého vidět, kolik
     * naposledy přinesl — a když nic nebo spadl, je to hned znát. */
    if (!Array.isArray(zdrojeStav) || !zdrojeStav.length) return;
    var pasy = document.querySelectorAll('.source-chip');
    if (!pasy.length) return;
    var podleJmena = {};
    zdrojeStav.forEach(function (z) { if (z && z.nazev) podleJmena[z.nazev.toLowerCase()] = z; });
    pasy.forEach(function (chip) {
      var text = (chip.textContent || '').toLowerCase();
      var nalez = null;
      Object.keys(podleJmena).forEach(function (k) {
        // Název v datech je zkratka („OK dražby"), na webu stojí celý název
        // zdroje — hledá se tedy podřetězec oběma směry.
        var prvni = k.split(/[\s(]/)[0];
        if (prvni && prvni.length > 3 && text.indexOf(prvni) !== -1) nalez = podleJmena[k];
      });
      if (!nalez) return;
      var znacka = document.createElement('span');
      znacka.className = 'src-stav' + (nalez.stav === 'ok' && nalez.pocet ? '' : ' src-zle');
      znacka.textContent = nalez.stav !== 'ok' ? 'nedostupný'
        : (nalez.pocet ? nalez.pocet + '×' : 'bez záznamů');
      znacka.title = nalez.stav !== 'ok'
        ? 'Zdroj při poslední kontrole neodpověděl' + (nalez.chyba ? ': ' + nalez.chyba : '')
        : 'Při poslední kontrole vrátil ' + nalez.pocet + ' záznamů';
      chip.appendChild(znacka);
    });
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

  // Počty u krajů v rozcestníku. Berou se ze stejných dat jako mapa, aby
  // se čísla nerozcházela — ručně psané počty by zastaraly hned po prvním
  // běhu robota.
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

  // Přepínač Seznam / Mapa (mobil): zobrazí jedno místo obojího nad sebou.
  // Výchozí je SEZNAM — na úvodní stránce mají být hned vidět nabídky, ne
  // ovládání mapy. Mapa je na jedno klepnutí vedle.
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
      // Mapa nemusí existovat — když se nenačte Leaflet, přepínač má pořád
      // fungovat, ať člověk nezůstane zamčený na jedné polovině.
      // Po přepnutí na mapu k ní rovnou odrolovat. Ovládání nad ní zabere
      // půl obrazovky, takže bez toho je z mapy vidět jen horní okraj a
      // člověk má dojem, že klepnutí nic neudělalo.
      if (!seznam && typeof scrollToMap === 'function') setTimeout(scrollToMap, 60);
      // Dvakrát schválně: napoprvé už po 70 ms, ať to není vidět, a znovu po
      // ustálení rozměrů. Jedno srovnání nestačilo — mapa se rozbalovala ještě
      // po něm a republika pak seděla nakřivo, u spodního okraje.
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
    // Odkaz „+ N dalších příležitostí najdete na mapě" pod seznamem musí mapu
    // opravdu ukázat — jinak by odkazoval na něco, co není vidět.
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.opp-more') : null;
      if (t) setView('mapa');
    });
  })();

  /* ---------- Interaktivní mapa (Leaflet) ---------- */
  var mapEl = document.getElementById('leaflet-map');
  if (!mapEl || typeof L === 'undefined') return;

  // Start oddálený na celou ČR (přesné vyrovnání na data řeší fitAllCZ níže).
  // zoomSnap 0.25: Leaflet smí přiblížit i „mezi" celé stupně. S celými stupni
  // se republika do mapy nevešla o kousek, spadla o stupeň níž a plavala pak
  // uprostřed prázdné plochy — polovina mapy nebyla k ničemu.
  var map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: false, boxZoom: false,
    zoomSnap: 0.25, zoomDelta: 1 }).setView([49.82, 15.47], 7);
  // Úchyt na mapu pro automatické testy a ruční prohlédnutí v konzoli.
  // Web sám ho nikde nepoužívá — čte se jen zvenčí (poloha teček, přiblížení),
  // aby se dalo strojově ověřit, že se mapa chová, jak má.
  try { window.PK_MAPA = map; } catch (e) {}
  // Tečky kreslíme přes CANVAS (jeden obraz místo tisíce HTML značek) → plynulé i s ~1000 pozemky na mobilu.
  // Vrstva teček je vizuálně nad kraji, ale klikání propouští dolů (pointer-events:none),
  // takže se dá vždy vybrat kraj pod ní. Klik na tečku řešíme ručně (map click + nejbližší bod).
  map.createPane('dotsPane');
  map.getPane('dotsPane').style.zIndex = 450; // nad overlayPane (kraje) = 400, pod popupy
  map.getPane('dotsPane').style.pointerEvents = 'none'; // canvas nechytá kliky → projdou na kraje
  var dotsRenderer = L.canvas({ pane: 'dotsPane', padding: 0.5 });

  // ---------------------------------------------------------------
  // TVARY NA MAPĚ
  // Druh příležitosti rozlišovala jedině barva. Zhruba každý dvanáctý
  // muž barvy rozlišuje jinak — a zrovna červená proti oranžové
  // (exekuce proti dražbě) je nejčastější případ, kdy dva body splynou.
  // Barva zůstává, ale nese ji TVAR: každý druh má vlastní, takže se
  // dá číst i na černobílém tisku a na slunci.
  // Je to zároveň jediná věc, podle které se tahle mapa pozná od jiné.
  //
  // Leaflet umí na plátno kreslit jen kolečka, takže si vykreslování
  // doplňujeme sami. Chytání kliknutí to nemění — to si mapa počítá
  // ručně podle vzdálenosti k nejbližšímu bodu.
  // ---------------------------------------------------------------
  var TVAR = { sale: 'kruh', drazba: 'kosoctverec', exekuce: 'trojuhelnik', obec: 'ctverec', majitel: 'kriz' };
  // Přiřazení tvarů si sahá ověřit test (scripts/test-tvary.mjs).
  try { window.PK_TVARY = TVAR; } catch (e) {}
  // Stejná plocha na oko: trojúhelník musí být větší, čtverec menší.
  var TVAR_MERITKO = { kruh: 1, kosoctverec: 1.24, trojuhelnik: 1.34, ctverec: 0.92, kriz: 1.18 };
  function kresliTvar(ctx, tvar, x, y, r) {
    ctx.beginPath();
    if (tvar === 'ctverec') {
      ctx.rect(x - r, y - r, r * 2, r * 2);
    } else if (tvar === 'kosoctverec') {
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    } else if (tvar === 'trojuhelnik') {
      // Posun dolů o osminu výšky, ať trojúhelník opticky sedí na svém místě
      // (těžiště má jinde než střed opsané kružnice).
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
      // Když by starší Leaflet naši metodu neznal, spadne to zpátky na kolečko.
      if (this._renderer._updatePkTvar) this._renderer._updatePkTvar(this);
      else this._renderer._updateCircle(this);
    }
  }) : null;
  if (map.attributionControl) map.attributionControl.setPosition('bottomleft'); // ať se nekryje s tlačítky
  // Ovládání zoomu +/− — jen na počítačích (na mobilu se přibližuje prsty). Umístěno
  // vlevo (přes CSS na volný levý okraj), ať se nepere s ostatními tlačítky.
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Přiblížit', zoomOutTitle: 'Oddálit' }).addTo(map);
  // Podklad: OpenStreetMap (zdarma, bez API klíče). CARTO začal vyžadovat klíč
  // (dlaždice ukazovaly „API KEY REQUIRED"). Jemný filtr (viz .pk-basemap v CSS)
  // udrží čistý světlý vzhled; barevné tečky pozemků jsou v jiné vrstvě, filtr je nezmění.
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    subdomains: 'abc', maxZoom: 19, className: 'pk-basemap'
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
  /* Výběr pozemku byl na kupujícího moc hrubý: cena celkem, výměra, druh.
     Jenže pozemky se srovnávají CENOU ZA METR (deset hektarů za milion je
     něco úplně jiného než deset arů za milion) a hledají se v konkrétním
     kraji — a to tu nešlo jinak než klikáním do mapy. A hlavně: web umí
     spočítat, co je pod obvyklou cenou v okolí, ale nešlo podle toho
     filtrovat, i když je to jediné, co tu jinde nenajdete. */
  /* Cena i výměra byly jen jedním směrem: „cena DO" a „výměra OD". Nešlo
     tedy říct „od 200 do 500 tisíc" ani „do jednoho hektaru" — a nabízené
     stupně navíc začínaly na sto tisících, přestože čtvrtina nabídek je
     levnější. Teď jsou to dvě políčka (od–do) s volným číslem, takže si
     člověk může zadat cokoli, a k tomu pár rychlých voleb pro ty časté. */
  var cenaOdEl = document.getElementById('map-cena-od');
  var areaDoEl = document.getElementById('map-area-do');
  var minPrice = 0, maxArea = 0;
  var perm2El = document.getElementById('map-perm2');
  var krajFiltrEl = document.getElementById('map-kraj');
  var levneEl = document.getElementById('map-levne');
  var maxPerM2 = 0;
  var krajFiltr = 'all';
  var levneOnly = false;
  var activeType = 'all';
  var activeDruh = 'all';
  var sortMode = 'demand';
  var maxPrice = 0;
  var minArea = 0;         // filtr minimální výměry (m²)
  var urgentOnly = false;  // filtr: jen dražby/exekuce končící brzy (do 14 dní)
  var searchTerm = '';
  var favOnly = false;
  var ukazSkryte = false;   // „Zobrazit skryté" — dočasně, neukládá se
  var vybiramMisto = false; // čeká se na klepnutí do mapy, kterým se určí „moje místo"
  var markers = [];

  /* ---------- Paměť prohlížeče: návštěva, skryté, filtr ----------
   * Všechno tohle jde udělat bez účtu a bez serveru — a tím pádem i bez
   * toho, aby se kdokoli musel registrovat. Drží se to v localStorage,
   * neodesílá se nic. Když prohlížeč úložiště nedá (anonymní okno,
   * zakázané cookies), všechno se prostě chová jako při první návštěvě;
   * nic se nesmí rozbít.
   * ---------------------------------------------------------------- */
  function ctiUloz(klic, zaloha) {
    try { var v = localStorage.getItem(klic); return v == null ? zaloha : JSON.parse(v); }
    catch (e) { return zaloha; }
  }
  function zapisUloz(klic, hodnota) {
    try { localStorage.setItem(klic, JSON.stringify(hodnota)); } catch (e) {}
  }

  /* „Nové od minulé návštěvy". Co tuhle funkci drží, je POŘADÍ: datum se
   * přečte do proměnné hned na začátku a teprve pak se smí přepsat.
   * Kdyby se zapsalo dřív, porovnávalo by se s dneškem a nové by nebylo
   * nikdy nic. (Ověřeno sabotáží — prohození těch dvou řádků shodí tři
   * kontroly v scripts/test-pamet.mjs.)
   * Odložení zápisu o 1,2 s má menší roli: když se stránka cestou rozbije,
   * návštěva se nezapíše a člověk o přehled nepřijde. */
  var NAVSTEVA_KLIC = 'pk_navsteva_v1';
  var minulaNavsteva = ctiUloz(NAVSTEVA_KLIC, null);
  function jeNovy(d) {
    if (!minulaNavsteva || !d.first_seen) return false;
    return d.first_seen > minulaNavsteva;
  }
  function pocetNovych() {
    var n = 0;
    for (var i = 0; i < DATA.length; i++) if (jeNovy(DATA[i])) n++;
    return n;
  }

  /* „Moje místo" — hlídání okolí vlastního pozemku.
   *
   * Kdo má dům, zajímá ho ze všeho nejvíc sousední pozemek. Web si proto
   * zapamatuje jedno místo a při každé návštěvě spočítá, co v jeho okolí
   * od minule přibylo.
   *
   * Schválně to NEBĚŽÍ přes účet a server. Zeměpisné hlídání by v databázi
   * chtělo nové sloupce (save_search má dnes jen okres, druh, cenu a výměru)
   * a migraci, kterou nemám jak nasadit ani ověřit. Tohle je celé
   * v prohlížeči, funguje bez registrace a dá se to otestovat — a až
   * jednou bude hlídání i na serveru, uložené místo se dá převzít.
   *
   * Souřadnice jsou jediný osobní údaj, který tu vzniká, a neopouští
   * prohlížeč — neposílá se na server ani do žádné služby. */
  var MISTO_KLIC = 'pk_misto_v1';
  var mojeMisto = ctiUloz(MISTO_KLIC, null);
  /* Okolí je „zapnuté" jen tehdy, když si ho člověk vědomě nastavil a nechal
     zapnuté. Uložené místo samo o sobě seznam neomezuje — kdo se vrátí na
     web, má vidět celou republiku a u toho poznámku, co mu v okolí přibylo. */
  var okoliZap = false;
  function okoliAktivni() {
    return !!(okoliZap && mojeMisto && isFinite(mojeMisto.lat) && isFinite(mojeMisto.lng));
  }
  /* Název místa podle nejbližší nabídky v datech. „Hlídáme Křinec a okolí"
     řekne víc než „okolí vašeho místa" a hlavně je na tom poznat, že to
     sedlo tam, kam člověk klepl. Vlastní databázi obcí nemáme a stahovat ji
     odjinud by znamenalo posílat souřadnice člověka ven. */
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
    if (!a || typeof d.lat !== 'number') return Infinity;
    var r = Math.PI / 180, dLat = (d.lat - a.lat) * r, dLng = (d.lng - a.lng) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * r) * Math.cos(d.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  /* Co u mého místa přibylo od minulé návštěvy. */
  function novinkyUMista() {
    if (!mojeMisto) return null;
    var okruh = mojeMisto.km || 10;
    var nove = DATA.filter(function (d) { return jeNovy(d) && kmOd(mojeMisto, d) <= okruh; });
    var vse = DATA.filter(function (d) { return kmOd(mojeMisto, d) <= okruh; });
    return { nove: nove.length, celkem: vse.length, okruh: okruh, nazev: mojeMisto.nazev || 'vašeho místa' };
  }

  /* Skryté pozemky — „tenhle mě nezajímá". Kdo prochází dvě stě nabídek,
   * potřebuje odškrtávat, co už viděl. */
  var SKRYTE_KLIC = 'pk_skryte_v1';
  var skryte = ctiUloz(SKRYTE_KLIC, []) || [];
  function jeSkryty(d) { return skryte.indexOf(pkey(d)) !== -1; }
  function prepniSkryty(d) {
    var k = pkey(d), i = skryte.indexOf(k);
    if (i === -1) skryte.push(k); else skryte.splice(i, 1);
    zapisUloz(SKRYTE_KLIC, skryte);
  }

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
  /* Cenový model je společný se stránkou pozemku — js/ceny.js. Mapa tu
   * dřív měla vlastní kopii výpočtu a ta se rozešla: přísnější pravidla
   * skončila jen v jedné z nich, takže mapa a stránka pozemku u 34 nabídek
   * tvrdily každá něco jiného. */
  var MODEL = (window.PK_CENY && window.PK_CENY.postav)
    ? window.PK_CENY.postav(DATA) : null;
  // Hranice bere web z cenového modelu, ne z vlastních čísel — jinak by si
  // mapa, karta a stránka pozemku u téhož pozemku zase odporovaly.
  var MEZ_SLEVA = (MODEL && MODEL.MEZ_SLEVA) || 15;
  var MEZ_POCHYBNA = (MODEL && MODEL.MEZ_POCHYBNA) || 60;
  function cenaNeduveryhodna(d) { return MODEL ? MODEL.neduveryhodna(d) : false; }
  function dealInfo(d) { return MODEL ? MODEL.percentil(d) : null; }
  function priceBarHtml(d) {
    if (!MODEL || !hasArea(d) || !d.price) return '';
    if (cenaNeduveryhodna(d)) {
      return '<div class="md-verdict warn">' +
        '<div class="mv-top"><span class="mv-badge">Cena k ověření</span><span class="mv-cmp">Cena za m²</span></div>' +
        '<div class="mv-text">Cena za m² je <b>hluboko pod</b> obvyklou u tohoto druhu pozemku v okolí. ' +
        'Často jde o <b>spoluvlastnický podíl</b> nebo chybu v inzerátu — ověřte u zdroje ' +
        'a v katastru, co se přesně prodává.</div>' +
        '</div>' + odhadHtmlMapa(d);
    }
    var pc = MODEL.percentil(d);
    if (!pc) return odhadHtmlMapa(d);
    var pct = pc.pct;
    var typeWord = d.type === 'sale' ? 'v prodeji' : (d.type === 'drazba' ? 'v dražbě' : 'v nabídce');
    var cls, badge, text;
    if (pct <= 35) { cls = 'good'; badge = 'Výhodná cena'; text = 'Levnější než <b>' + pc.cheaper + ' %</b> podobných pozemků ' + typeWord + '.'; }
    else if (pct >= 65) { cls = 'bad'; badge = 'Vyšší cena'; text = 'Dražší než <b>' + pct + ' %</b> podobných pozemků ' + typeWord + '.'; }
    else { cls = 'mid'; badge = 'Průměrná cena'; text = 'Cena za m² je zhruba <b>uprostřed</b> podobných pozemků ' + typeWord + '.'; }
    return '<div class="md-verdict ' + cls + '">' +
      '<div class="mv-top"><span class="mv-badge">' + badge + '</span><span class="mv-cmp">Cena za m²</span></div>' +
      '<div class="mv-text">' + text + '</div>' +
      '<div class="mv-track"><span class="mv-fill" style="--w:' + pct + '%"></span><span class="mv-dot" style="--w:' + pct + '%"></span></div>' +
      '<div class="mv-scale"><span>levné</span><span>drahé</span></div>' +
      '</div>' + odhadHtmlMapa(d);
  }
  /* Odhad obvyklé ceny i v detailu na mapě — aby mapa a stránka pozemku
   * říkaly totéž. Ukazuje se jen tam, kde má co říct. */
  function odhadHtmlMapa(d) {
    if (!MODEL) return '';
    var o = MODEL.odhad(d);
    if (!o || !o.podleVelikosti || o.podOdhadem < 15) return '';
    var kde = window.PK_CENY.kdeText(o.uroven, o.kde);
    var coJe = d.type === 'drazba' ? 'Vyvolávací cena' : (d.type === 'exekuce' ? 'Uváděná cena' : 'Nabídková cena');
    return '<div class="md-odhad">' +
      '<div class="mo-radek"><span class="mo-k">' + coJe + '</span><span class="mo-v">' + fmt(d.price) + ' Kč</span></div>' +
      '<div class="mo-radek mo-hlavni"><span class="mo-k">Obvyklá cena ' + kde + '</span><span class="mo-v">' + fmt(o.castka) + ' Kč</span></div>' +
      '<div class="mo-rozdil"><b>o ' + o.podOdhadem + ' % níž</b>, tedy zhruba o ' + fmt(o.rozdil) + ' Kč</div>' +
      '<p class="mo-pozn">Spočítáno z mediánu <b>' + fmt(Math.round(o.zaM2)) + ' Kč/m²</b> — z <b>' +
      o.vzorek + '</b> nabídek stejného druhu (' + o.druh.toLowerCase() + ') a podobné výměry ' + kde + '. ' +
      'Jsou to ceny <b>nabídkové</b>, ne za kolik se pozemky opravdu prodaly.</p>' +
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
      // Tvar štítku se bere z téže tabulky jako mapa. Kdyby byl napsaný
      // natvrdo v HTML, mohl by se od mapy tiše rozejít — a člověk by se
      // z legendy učil tvar, který na mapě není.
      var tecka = b.querySelector('.c');
      if (tecka && TVAR[tp]) {
        tecka.className = tecka.className.replace(/\btv-\S+/g, '').trim() + ' tv-' + TVAR[tp];
      }
      var badge = document.createElement('span');
      badge.className = 'chip-n';
      b.appendChild(badge);
    });
    prepocitejCipy();
  }
  /* Čísla u kategorií se počítala jednou při startu a pak už se neměnila.
     V režimu okolí tak seznam ukazoval deset pozemků, zatímco nad ním
     svítilo „Vše 1940, Prodej 1850" — dvě různá čísla o téže věci na jedné
     obrazovce. Přepočítáváme je proto vždycky podle toho, co je zrovna
     v záběru (okolí nebo kraj), jen bez filtru kategorie samotné. */
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
      if (badge) badge.textContent = pocty[tp] || 0;
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
    // Hustota podle přiblížení. Při celostátním pohledu leží přes sebe
    // stovky bodů; když je každý neprůhledný a má obrys, vznikne z nich
    // souvislá deska s viditelnými hranami — mapa pak vypadá jako herní
    // plán, ne jako data. Oddálené tečky jsou proto průsvitné a bez
    // obrysu: překryv se čte jako HUSTOTA, tmavší místo = víc nabídek.
    // Po přiblížení, kdy už tečky stojí samostatně, se obrys vrátí,
    // protože tam naopak pomáhá je od sebe odlišit.
    var z = (typeof map !== 'undefined' && map.getZoom) ? map.getZoom() : 8;
    var blizko = Math.max(0, Math.min(1, (z - 8) / 4));      // 0 = celá ČR, 1 = od zoomu 12
    var kryti = 0.5 + blizko * 0.42;                          // 0,50 → 0,92
    var obrys = blizko * 0.34;                                // 0 → 0,34
    var polomer = urgent ? DOT_R + 0.6 : (feat ? DOT_R + 0.9 : DOT_R);
    var sila = urgent ? 1.2 + blizko * 0.8 : (feat ? 1.0 + blizko * 0.7 : blizko * 0.9);
    var okraj = (urgent || feat) ? 0.25 + blizko * 0.4 : obrys;
    if (urgent || feat) kryti = Math.min(0.95, kryti + 0.18);
    // Reflektor na vybraný kraj: tečky mimo něj se ztiší. Nejdou rozkliknout,
    // takže by jen přetahovaly pozornost — takhle je na první pohled vidět,
    // kde se právě hledá, a zbytek republiky zůstane jen jako obrys kolem.
    if (selectedKraj && d._gkraj && d._gkraj !== selectedKraj) {
      kryti *= 0.26; okraj = 0; sila = 0; polomer = Math.max(2.2, polomer * 0.78);
    }
    return {
      renderer: dotsRenderer,
      pkTvar: TVAR[d.type] || 'kruh',
      radius: polomer,
      fillColor: col, fillOpacity: kryti,
      // Světlý podklad: tečky potřebují jemný TMAVÝ okraj (bílý by zmizel).
      color: 'rgba(18,24,42,' + okraj.toFixed(2) + ')',
      weight: sila,
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
      '<defs><linearGradient id="bg' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1C2F26"/><stop offset="1" stop-color="#14231C"/></linearGradient></defs>' +
      '<rect width="320" height="200" fill="url(#bg' + gid + ')"/>' +
      '<g stroke="rgba(206,228,212,0.05)" stroke-width="1"><path d="M40 0V200M80 0V200M120 0V200M160 0V200M200 0V200M240 0V200M280 0V200"/><path d="M0 40H320M0 80H320M0 120H320M0 160H320"/></g>' +
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
        '<rect width="384" height="240" fill="#14231C"/>' +
        '<image href="' + p0 + '" xlink:href="' + p0 + '" x="0" y="0" width="384" height="240" preserveAspectRatio="xMidYMid slice"/>' +
        '</svg>' +
        '<span class="opp-mgrad"></span>' +
        '<span class="opp-badge ' + d.type + '">' + TYPE[d.type].label + '</span>' + cnt;
    }
    return window.PK_SNIMEK.html(d, { sirka: 384, vyska: 240, barva: col, id: 'ts' + d._id }) +
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
      '" fill="rgba(166,184,202,0.12)" stroke="#93AC9C" stroke-width="2.2"/></svg>';
  }

  /* Rádce „Co byste měli vědět" je společný s druhou půlkou webu —
   * js/radce.js. Mapa i stránka pozemku ho tu měly každá po svém, takže
   * stačilo změnit jednu z nich a u téhož pozemku by si protiřečily.
   * Přesně to se stalo u cenového srovnání; podruhé to dělat nebudu. */
  function goodToKnowHtml(d) {
    if (!window.PK_RADCE) return '';
    return window.PK_RADCE.html(d, MODEL);
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
    var cdBig = days == null ? ''
      : (days < 0 ? '<span class="md-cd md-proběhlo">Dražba už proběhla</span>'
                  : '<span class="md-cd' + countdownClass(days) + '">Termín ' + countdownText(days) + '</span>');
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
          (d.type === 'majitel' && d._lid ? '<a class="lp-btn lp-msg" href="zpravy.html?l=' + encodeURIComponent(d._lid) + '&new=1&p=' + encodeURIComponent(d.place || '') + '&ok=' + encodeURIComponent(d.okres || '') + '">Napsat majiteli</a>' : '') +
          (d.type === 'majitel' && d.contact ? '<a class="lp-btn lp-src" href="' + contactHref(d.contact) + '">Kontakt na majitele</a>' : '') +
          '<a class="lp-btn" href="' + katastrUrl(d) + '"' + extAttr + '>Katastr</a>' +
          '<a class="lp-btn" href="' + mapyUrl(d) + '"' + extAttr + '>Mapa</a>' +
          (d.type === 'majitel' ? '' : (function () { var s = sourceLink(d); return '<a class="lp-btn lp-src" href="' + s.url + '"' + extAttr + '>' + s.label + '</a>'; })()) +
          (auctionYMD(d.extra) ? '<button class="lp-btn" type="button" data-cal>Do kalendáře</button>' : '') +
          '<button class="lp-btn lp-fav' + (isFav(d) ? ' on' : '') + '" type="button" data-fav-detail>' + BM_SVG + '<span>' + (isFav(d) ? 'Uloženo' : 'Uložit') + '</span></button>' +
          '<button class="lp-btn" type="button" data-share>Sdílet</button>' +
          '<a class="lp-watch" href="hlidani.html">Hlídat okres ' + d.okres + '</a>' +
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
    var m = PkTvar ? new PkTvar([d.lat, d.lng], st) : L.circleMarker([d.lat, d.lng], st);
    m._d = d;
    markers.push(m);
  });

  /* Tečka pod kurzorem trochu naroste. Není to ozdoba: tečky se na mapě
     překrývají a bez odezvy člověk neví, KTERÝ pozemek by se mu otevřel.
     Tečky jsou kreslené do plátna a mají interactive:false (kliky se řeší
     hledáním nejbližšího bodu), takže přes CSS to nejde — musí se najít
     stejně jako u kliknutí.
     Na dotykovém displeji se nic takového neděje: tam žádné „najetí" není
     a zvětšovat tečku pod prstem, který zrovna klepl, je na obtíž. */
  var podKurzorem = null;
  function zvyrazniTecku(d) {
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
    mapEl.style.cursor = d ? 'pointer' : '';
  }
  if (!(typeof matchMedia === 'function' && matchMedia('(hover: none)').matches)) {
    map.on('mousemove', function (e) {
      if (dotsLocked || !lastVis.length) { zvyrazniTecku(null); return; }
      var cp = e.containerPoint, best = null, bestDist = Infinity;
      for (var i = 0; i < lastVis.length; i++) {
        var d = lastVis[i];
        if (selectedKraj && d._gkraj !== selectedKraj) continue;
        var p = map.latLngToContainerPoint([d.lat, d.lng]);
        var dx = p.x - cp.x, dy = p.y - cp.y, dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; best = d; }
      }
      // Užší tolerance než u kliknutí: myš míří přesně, a kdyby se zvýrazňovalo
      // i zdaleka, poskakovalo by to po mapě samo od sebe.
      var tol = Math.max(14, DOT_R + 8);
      zvyrazniTecku(best && bestDist <= tol * tol ? best : null);
    });
    map.on('mouseout', function () { zvyrazniTecku(null); });
  }

  // Klik na tečku: canvas kliky nechytá, tak najdeme nejbližší viditelný bod ke kliknutí.
  // Interaktivní jsou JEN tečky ve vybraném kraji. Klik do jiného kraje ten kraj jen
  // vybere (předchozí se zamkne) — teprve další klik na tečku v něm otevře detail.
  var krajJustSelected = false; // klik, který právě přepnul kraj, neotevírá detail
  map.on('click', function (e) {
    // Výběr vlastního místa má přednost před vším ostatním: dokud je zapnutý,
    // klepnutí do mapy neotevírá pozemek ani nevybírá kraj.
    if (vybiramMisto) {
      vybiramMisto = false;
      document.body.classList.remove('vybiram-misto');
      // Stejná cesta jako u GPS: seznam se přepne na okolí, ne jen mapa.
      enterNearAt({ lat: e.latlng.lat, lng: e.latlng.lng }, false);
      return;
    }
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
    if (best && bestDist <= tol * tol) { gotoInzerat(best); return; }

    // Netrefené klepnutí dřív neudělalo VŮBEC NIC — a to je na dotyku to
    // nejhorší: člověk klepne, nic se nestane, a neví, jestli je web
    // rozbitý nebo se netrefil. Když je poblíž nějaký pozemek, klepnutí
    // proto mapu přiblíží k němu; tečky se tím zvětší a další pokus už
    // sedne. Když poblíž není nic, mapa se nehne (přiblížit se do prázdna
    // by bylo horší než nic).
    if (!best) return;
    var okoli = Math.max(90, tol * 2.4);
    if (bestDist > okoli * okoli) return;
    var z = map.getZoom();
    if (z >= 15) return;                       // dál už nemá smysl přibližovat
    map.setView([best.lat, best.lng], Math.min(15, z + 2), { animate: true });
  });

  // Tečkovaná mapa: každý pozemek = tečka. Navíc obrysy krajů pro orientaci.
  var krajByName = {};
  // Na dotykových zařízeních není „myš pryč" → popisek kraje sám plynule zmizí.
  var isTouch = (typeof matchMedia === 'function' && matchMedia('(hover: none)').matches) || ('ontouchstart' in window);
  /* Obrys kraje. Tenká šedá čára pod stovkami teček prakticky zmizela —
     mapa pak nebyla mapa republiky, ale rozsypaný čaj. Dvě změny:
     čára je značkově zelená a o něco silnější, a hlavně KAŽDÝ KRAJ MÁ
     VÝPLŇ PODLE TOHO, KOLIK V NĚM JE POZEMKŮ. Z mapy je tím na první
     pohled poznat, kde se něco děje, ještě než se člověk začte do teček.
     Krytí jde přes odmocninu, ne přímo úměrně: Středočeský se 413 pozemky
     by jinak byl skoro neprůhledný a zbytek republiky bílý. */
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
      fillColor: '#1F5138', fillOpacity: krajKrytí(k) };
  }
  if (KRAJE_GEOM) {
    var feats = Object.keys(KRAJE_GEOM).map(function (k) { return { type: 'Feature', properties: { kraj: k }, geometry: KRAJE_GEOM[k] }; });
    krajLayer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      style: function (f) { return styleKraj(f.properties.kraj); },
      onEachFeature: function (f, layer) {
        krajByName[f.properties.kraj] = layer;
        layer.bindTooltip(krajTitul(f.properties.kraj), { sticky: true, direction: 'top', className: 'kraj-tip' });
        layer.on('click', function () {
          if (selectedKraj !== f.properties.kraj) krajJustSelected = true; // přepnutí kraje neotevírá detail
          selectKraj(f.properties.kraj);
        });
        layer.on('mouseover', function () { if (selectedKraj !== f.properties.kraj) { layer.setStyle({ weight: 2.4, color: '#1F5138', fillColor: '#1F5138', fillOpacity: krajKrytí(f.properties.kraj) + 0.09 }); layer.bringToFront(); } });
        layer.on('mouseout', function () { prekresliKraje(); });
        // Dotyk: po 2 s popisek plynule zhasne, ať nezůstane „viset" a nebrání dalšímu klikání.
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
  // České skloňování: 1 pozemek · 2–4 pozemky · 5+ pozemků
  function plPozemek(n) { return n === 1 ? 'pozemek' : (n >= 2 && n <= 4 ? 'pozemky' : 'pozemků'); }
  /** Název místa jde do innerHTML — projede se přes tohle, ať se do stránky
      nedá nic propašovat, i kdyby se data někdy braly odjinud. */
  function esc(x) {
    return String(x == null ? '' : x)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Název kraje, jak se píše. Dvě výjimky: Praha není „Praha kraj" a Vysočina
  // se píše obráceně — „Kraj Vysočina". Jinde stačí přidat slovo kraj.
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
  function fitAllCZ() { if (czBounds.isValid()) map.fitBounds(czBounds, { padding: [12, 12], maxZoom: 9 }); }
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
  // Odrolovat k mapě tak, aby začínala POD lepivou hlavičkou. Prosté
  // scrollIntoView ji zarovná na úplný vrch okna, kde jí hlavička ukousne
  // horních ~70 px — přesně pruh, ve kterém je nápověda „Krok 1: klepněte
  // na kraj" a tlačítko „Celá ČR".
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
  if (nearBtn) nearBtn.addEventListener('click', function () { scrollToMap(); enterNear(); });
  // Vzdálenost pozemku od uživatele (km) — pro řazení „nejblíž ke mně".
  function kmFromUser(d) {
    if (!userPos || typeof d.lat !== 'number') return Infinity;
    var R = 6371, r = Math.PI / 180;
    var dLat = (d.lat - userPos.lat) * r, dLng = (d.lng - userPos.lng) * r;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(userPos.lat * r) * Math.cos(d.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  // Vybraný kraj: silnější obrys a lehké podbarvení, ať je jasně vidět,
  // ve kterém kraji se hledá.
  function styleSelectedKraj(layer) { layer.setStyle({ weight: 2.6, color: '#2E42B4', fillColor: '#1F5138', fillOpacity: 0.07 }); layer.bringToFront(); }
  // Ostatní kraje, když je nějaký vybraný: překryjeme je světlým závojem.
  // Podklad pod nimi zešedne a oko jde samo tam, kde jsou nabídky.
  function styleKrajMimo() { return { color: 'rgba(30,38,66,0.16)', weight: 1, fill: true, fillColor: '#F4F2ED', fillOpacity: 0.42 }; }
  // Přebarví kraje podle toho, který je vybraný (nebo žádný).
  function prekresliKraje() {
    if (!krajLayer) return;
    krajLayer.eachLayer(function (l) {
      var k = l.feature && l.feature.properties && l.feature.properties.kraj;
      if (selectedKraj && k === selectedKraj) styleSelectedKraj(l);
      else l.setStyle(selectedKraj ? styleKrajMimo() : styleKraj(k));
    });
  }
  // Zámek teček: dokud není vybraný kraj, klik na tečku ignorujeme (klik pod tečkami vybere kraj).
  var dotsLocked = true;
  function lockDots(lock) {
    dotsLocked = lock;
    mapEl.classList.toggle('kraj-lock', lock);
  }
  var BACK_BTN = '<button class="kh-back" type="button" aria-label="Zpět"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>';
  function updateKrajHead() {
    if (krajHeadEl) {
      if (okoliAktivni()) {
        /* Hlavička musí říct PŘESNĚ to, co je pod ní vidět. Dřív tu stálo
           „314 pozemků do 50 km od vás", zatímco v seznamu byla celá
           republika — a padesátka nesouvisela s okruhem, který si člověk
           nastavil. Teď je to jedno číslo: kolik je v okruhu, a ten okruh
           je tentýž, podle kterého se filtruje. */
        var km = mojeMisto.km || 10;
        var vOkruhu = DATA.filter(function (d) { return kmOd(mojeMisto, d) <= km; }).length;
        // Taky bez pádů: „Vaše okolí · Loučeň" sedne na každý název.
        var kde = mojeMisto.nazev ? ('Vaše okolí · ' + mojeMisto.nazev) : 'Vaše okolí';
        var sub = vOkruhu
          ? ('do ' + km + ' km · ' + vOkruhu + ' ' + plPozemek(vOkruhu))
          : ('do ' + km + ' km tu nic není — zkuste větší okruh');
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
        krajHeadEl.innerHTML = BACK_BTN + '<div class="kh-txt"><b>' + krajTitul(selectedKraj) + '</b><span>' + (n ? ('Krok 2: klepněte na pozemek (' + n + ' ' + plPozemek(n) + ')') : 'zatím žádné nabídky') + '</span></div>';
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
    clearNear();       // výběr kraje ruší režim „okolí"
    selectedKraj = k;
    prekresliKraje();   // vybraný kraj napřed, zbytek pod závoj
    resizeDots();       // a tečky mimo něj se ztiší
    var layer = krajByName[k];
    if (layer) {
      // Lehké přiblížení ke kraji — nízký strop zoomu, ať se nezanoří moc (jen se přiblíží).
      if (!skipFit) map.fitBounds(layer.getBounds(), { maxZoom: 8, padding: [24, 24] });
    }
    setPan(true);      // po výběru kraje jde s mapou volně hýbat (bez zvláštního tlačítka)
    lockDots(false);   // tečky teď klikací
    updateKrajHead();
    renderList();      // seznam pod mapou se musí přepnout na vybraný kraj (clearKraj to dělá taky)
  }
  function clearKraj() {
    selectedKraj = null;
    var wasNear = nearMode;
    clearNear();
    if (wasNear) { sortMode = 'demand'; if (sortEl) sortEl.value = 'demand'; }
    prekresliKraje();
    resizeDots();
    hideDetail();
    lockDots(true);    // zpět: klikají se zase kraje
    setPan(false);     // na přehledu mapu zase zamkneme (stránka přes ni roluje)
    fitAllCZ();
    updateKrajHead();
    renderList();
  }
  // Je bod přibližně v ČR? (pojistka proti nesmyslné IP poloze, např. přes VPN)
  // Přejde do režimu „okolí" na dané poloze. approx = přibližná (podle IP).
  /* Jediná cesta do režimu okolí — ať se tam člověk dostane přes GPS,
     klepnutím do mapy, nebo napsáním obce. Dřív to byly tři různé cesty
     s různým výsledkem: GPS seznam jen seřadila, klepnutí do mapy na něj
     nesáhlo vůbec. Teď dělají všechny totéž. */
  function enterNearAt(pos, approx, nazev) {
    userPos = { lat: pos.lat, lng: pos.lng };
    var km = (mojeMisto && mojeMisto.km) || 10;
    // Místo si pamatujeme vždycky — i to přibližné. Jinak by se člověk po
    // návratu na web musel ptát znovu. Že je přibližné, se pozná podle
    // značky na mapě a napíše se to i do hlavičky.
    ulozMisto({ lat: pos.lat, lng: pos.lng, km: km,
      nazev: nazev || najdiNazevMista(pos.lat, pos.lng), pribl: !!approx });
    okoliZap = true;
    selectedKraj = null;
    krajFiltr = 'all';
    if (krajFiltrEl) krajFiltrEl.value = 'all';
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
    if (typeof scrollToMap === 'function') scrollToMap();   // ať je mapa s výsledkem opravdu vidět
    updateKrajHead();
    renderList();
    /* Proužek s potvrzením („Hlídáme Loučeň a okolí do 10 km") ležel mimo
       obraz, takže po klepnutí nebylo co číst. Posuneme ho k sobě — až po
       vykreslení, ať se počítá se skutečnou výškou. */
    if (mistoPruh) setTimeout(function () {
      try { mistoPruh.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }, 420);
    var kolik = DATA.filter(function (d) { return kmOd(mojeMisto, d) <= km; }).length;
    showToast(kolik
      ? ('V okolí do ' + km + ' km ' + (kolik === 1 ? 'je 1 pozemek' : (kolik < 5 ? 'jsou ' + kolik + ' pozemky' : 'je ' + kolik + ' pozemků')) + '.')
      : ('Do ' + km + ' km tu zatím nic není — zkuste větší okruh.'));
  }
  /** Vypne režim okolí a vrátí celou republiku. Místo zůstane uložené. */
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
      color: '#1F5138', weight: 1.5, opacity: 0.55,
      fillColor: '#1F5138', fillOpacity: 0.06, interactive: false
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

  /* ==================================================================
     VÝBĚR MÍSTA — vlastní mapa, ne jedno klepnutí

     Jak to bylo: web přepnul hlavní mapu do režimu „klepněte na své
     místo". Kdo klepl vedle, měl hotovo — režim skončil a nedalo se nic
     opravit než začít znovu. Kraj se v tom vybrat nedal vůbec a kdo
     nepovolil polohu, skončil u okénka, které po něm chtělo napsat obec;
     když ji v datech nemáme, nenašlo nic.

     Jak to je teď: samostatná mapa přes celou obrazovku. Značka zůstává
     uprostřed a hýbe se MAPA pod ní — to je způsob, na který jsou lidé
     zvyklí z map v telefonu, a hlavně jde libovolněkrát couvnout.
     K tomu výběr kraje, hledání obce, posuvník okruhu a živý počet
     pozemků, který se mění při každém pohnutí. Potvrdit se dá, až když
     je vidět, co se potvrzuje.
     ================================================================== */
  function otevriVyberMista(nast) {
    nast = nast || {};
    var start = nast.start || (mojeMisto && isFinite(mojeMisto.lat) ? mojeMisto : null) || { lat: 49.82, lng: 15.47 };
    var km = (mojeMisto && mojeMisto.km) || 10;
    var zoomStart = nast.start || (mojeMisto && isFinite(mojeMisto.lat)) ? 11 : 7;

    var ov = document.createElement('div');
    ov.className = 'vm-ov';
    ov.innerHTML =
      '<div class="vm-panel" role="dialog" aria-modal="true" aria-label="Vyberte místo, jehož okolí chcete sledovat">' +
        '<div class="vm-hlava">' +
          '<b>Vyberte své místo</b>' +
          '<button class="vm-x" type="button" aria-label="Zavřít">✕</button>' +
        '</div>' +
        '<div class="vm-radek">' +
          '<input type="text" class="vm-hledat" id="vm-hledat" autocomplete="off" autocapitalize="words" ' +
            'placeholder="Obec nebo okres (např. Kolín)" aria-label="Najít obec nebo okres">' +
          '<select class="vm-kraj" id="vm-kraj" aria-label="Přejít na kraj"><option value="">Celá ČR</option></select>' +
        '</div>' +
        '<div class="vm-mapa" id="vm-mapa"></div>' +
        '<div class="vm-kriz" aria-hidden="true"><span></span></div>' +
        '<div class="vm-poloha"><button type="button" class="vm-gps" id="vm-gps">' + LOC_PIN + 'Moje poloha</button></div>' +
        '<div class="vm-pata">' +
          '<label class="vm-okruh">Okruh <select id="vm-km" aria-label="Okruh okolí">' +
            [2, 5, 10, 20, 50].map(function (v) { return '<option value="' + v + '"' + (v === km ? ' selected' : '') + '>' + v + ' km</option>'; }).join('') +
          '</select></label>' +
          '<div class="vm-pocet" id="vm-pocet" aria-live="polite"></div>' +
          '<button class="vm-ok" type="button" id="vm-ok">Sledovat toto okolí</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('vm-otevreno');

    var krajSel = ov.querySelector('#vm-kraj');
    Object.keys(KRAJE).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = krajTitul(k);
      krajSel.appendChild(o);
    });

    var m = L.map(ov.querySelector('#vm-mapa'), {
      zoomControl: true, attributionControl: false, preferCanvas: true,
    }).setView([start.lat, start.lng], zoomStart);
    // (výchozí přiblížení dorovná jdiNa() níž, jakmile je znám okruh)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc', maxZoom: 18, className: 'pk-basemap'
    }).addTo(m);

    // Tečky pozemků, ať je vidět, kde vůbec něco je — jinak člověk vybírá naslepo.
    var vrstvaTecek = L.layerGroup().addTo(m);
    DATA.forEach(function (d) {
      if (!isFinite(d.lat) || !isFinite(d.lng)) return;
      if (!visibleBezOkoli(d)) return;   // ať tečky sedí s počtem pod mapou
      vrstvaTecek.addLayer(L.circleMarker([d.lat, d.lng], {
        radius: 2.6, weight: 0, fillColor: TYPE[d.type] ? TYPE[d.type].color : '#4361B8',
        fillOpacity: 0.55, interactive: false
      }));
    });

    /* Kruh okruhu kreslíme do SVG, ne do plátna: tečky pozemků jsou v plátně
       kvůli rychlosti (je jich přes tisíc), ale čárkovaná čára v něm byla
       sotva znát. Tohle je JEDEN tvar, SVG ho utáhne a čárky jsou vidět. */
    var kruh = L.circle([start.lat, start.lng], {
      radius: km * 1000, renderer: L.svg(), color: '#8A5512', weight: 2.5, opacity: 0.95,
      dashArray: '8 6', fillColor: '#8A5512', fillOpacity: 0.1, interactive: false
    }).addTo(m);

    var pocetEl = ov.querySelector('#vm-pocet');
    var kmSel = ov.querySelector('#vm-km');
    function stred() { var c = m.getCenter(); return { lat: c.lat, lng: c.lng }; }
    /* Přiblížení se řídí okruhem, ne pevným číslem. S pevným zoomem 12 byl
       kruh o poloměru 10 km několikrát širší než obrazovka — na mapě po něm
       nebylo ani vidu a člověk netušil, co vlastně vybírá. */
    function ramecOkruhu(lat, lng) {
      var k = parseInt(kmSel.value, 10) || 10;
      return L.latLng(lat, lng).toBounds(k * 2000 * 1.35);   // průměr + rezerva
    }
    function jdiNa(lat, lng, animovat) {
      m.fitBounds(ramecOkruhu(lat, lng), { animate: animovat !== false });
    }
    function prepocti() {
      var k = parseInt(kmSel.value, 10) || 10;
      var c = stred();
      kruh.setLatLng([c.lat, c.lng]); kruh.setRadius(k * 1000);
      /* Počítá se TOTÉŽ, co se pak vypíše — tedy se zapnutými filtry
         (kategorie, cena, výměra), jen bez omezení na okolí. Když se
         počítala všechna data, výběr sliboval „5 pozemků v okruhu 10 km"
         a seznam pod ním hlásil, že tam není nic. */
      var n = 0;
      for (var i = 0; i < DATA.length; i++) if (visibleBezOkoli(DATA[i]) && kmOd(c, DATA[i]) <= k) n++;
      var obec = najdiNazevMista(c.lat, c.lng);
      pocetEl.innerHTML = '<b>' + n + ' ' + plPozemek(n) + '</b> v okruhu ' + k + ' km' +
        (obec ? ' <span class="vm-obec">u obce ' + esc(obec) + '</span>' : '');
    }
    m.on('move', prepocti);
    m.on('zoomend', prepocti);
    kmSel.addEventListener('change', function () {
      prepocti();
      var c = stred();
      jdiNa(c.lat, c.lng);   // větší okruh → oddálit, menší → přiblížit
    });
    prepocti();
    // Leaflet po vložení do skrytého prvku neví, jak je velký.
    setTimeout(function () {
      m.invalidateSize();
      if (nast.start || (mojeMisto && isFinite(mojeMisto.lat))) jdiNa(start.lat, start.lng, false);
      prepocti();
    }, 60);

    krajSel.addEventListener('change', function () {
      var k = krajSel.value;
      if (!k) { m.setView([49.82, 15.47], 7); return; }
      var c = KRAJE[k] && KRAJE[k].c;
      // U kraje se drží odstup, ať je vidět celý — ale nikdy tak blízko,
      // aby se zvolený okruh nevešel na obrazovku.
      if (c) m.setView(c, Math.min(9, m.getBoundsZoom(ramecOkruhu(c[0], c[1]))), { animate: true });
    });
    var hledatEl = ov.querySelector('#vm-hledat');
    function hledej() {
      var pos = geocodeTownLocal(hledatEl.value);
      if (pos) {
        jdiNa(pos.lat, pos.lng);
        krajSel.value = '';   // jinak by nahoře svítil kraj, ve kterém mapa není
        hledatEl.blur();
      }
      else { hledatEl.classList.add('vm-chyba'); setTimeout(function () { hledatEl.classList.remove('vm-chyba'); }, 1200); }
    }
    hledatEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); hledej(); } });
    hledatEl.addEventListener('change', hledej);

    var gpsBtn = ov.querySelector('#vm-gps');
    gpsBtn.addEventListener('click', function () {
      if (!navigator.geolocation) { gpsBtn.textContent = 'Poloha tu nejde'; return; }
      gpsBtn.disabled = true; gpsBtn.innerHTML = '<span class="mnb-ceka" aria-hidden="true"></span>Hledám…';
      navigator.geolocation.getCurrentPosition(function (p) {
        gpsBtn.disabled = false; gpsBtn.innerHTML = LOC_PIN + 'Moje poloha';
        jdiNa(p.coords.latitude, p.coords.longitude);
      }, function () {
        gpsBtn.disabled = false; gpsBtn.innerHTML = LOC_PIN + 'Poloha nejde — vyberte ručně';
      }, { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 });
    });

    function naKlavesu(e) { if (e.key === 'Escape') zavri(); }
    function zavri() {
      try { m.remove(); } catch (e) {}
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      document.body.classList.remove('vm-otevreno');
      document.removeEventListener('keydown', naKlavesu);
    }
    document.addEventListener('keydown', naKlavesu);
    ov.querySelector('.vm-x').addEventListener('click', zavri);
    ov.addEventListener('click', function (e) { if (e.target === ov) zavri(); });
    ov.querySelector('#vm-ok').addEventListener('click', function () {
      var c = stred();
      var k = parseInt(kmSel.value, 10) || 10;
      if (mojeMisto) mojeMisto.km = k; else mojeMisto = { km: k };
      zavri();
      enterNearAt({ lat: c.lat, lng: c.lng }, false);
    });
  }

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
  /* Když poloha nevyjde, nemá smysl chtít po člověku, aby psal název obce
     — hledáme ji jen mezi obcemi, které máme v datech, takže malá vesnice
     prostě nenajde nic a je konec. Otevře se rovnou mapa, kde si místo
     ukáže. Okénko s psaním zůstává jen jako nouzová varianta bez Leafletu. */
  function fallbackNear(err) {
    if (typeof L !== 'undefined' && L.map) otevriVyberMista();
    else showLocModal(err);
  }
  /* Žádost o polohu. Tohle bylo rozbité tak, jak se rozbíjí nejhůř — nic
     nespadlo, jen se DESET SEKUND nedělo vůbec nic:
       – hláška „Zjišťuji vaši polohu…" zmizela po 2,6 s,
       – enableHighAccuracy si na telefonu bez zaměření vybere celý limit,
       – a teprve po něm se ukázalo okno „Kde hledat?".
     Kdo mezitím tlačítko zmáčkl podruhé, spustil druhý dotaz a čekal znovu.
     Tři změny: tlačítko samo říká, že se čeká (a nejde zmáčknout dvakrát),
     limit je 6 sekund, a nejdřív se zkouší poloha nepřesná — ta je na
     telefonu skoro okamžitá a na hledání pozemků v okolí úplně stačí. */
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
  function askGeo() {
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
      fallbackNear(err);   // poloha nevyšla → slušně se zeptáme na obec
    }
    navigator.geolocation.getCurrentPosition(uspech, selhalo,
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 });
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
      // Legenda musí nést i TVAR, jinak se ho není kde naučit.
      if (present2[tp]) lh += '<span class="lg-item"><span class="lg-dot tv-' + (TVAR[tp] || 'kruh') + '" style="background:' + TYPE[tp].color + '"></span>' + TYPE[tp].label + '</span>';
    });
    if (urgentN) lh += '<span class="lg-item lg-urgent"><span class="lg-dot lg-ring"></span>končí do 7 dní</span>';
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
      // Jediné místo, kde se počítá vzhled tečky, je dotStyle — poloměr, krytí
      // i obrys se musí měnit spolu (jinak zůstane přiblížená mapa průsvitná
      // a oddálená přeplácaná) a ztlumení mimo vybraný kraj taky.
      var st2 = dotStyle(m._d);
      if (m.options.radius !== st2.radius) m.setRadius(st2.radius);
      if (m.options.fillOpacity !== st2.fillOpacity || m.options.weight !== st2.weight) {
        m.setStyle({ fillOpacity: st2.fillOpacity, weight: st2.weight, color: st2.color });
      }
    }
  }
  map.on('zoomend', resizeDots);
  resizeDots();

  function visible(d) {
    var okType = activeType === 'all' || d.type === activeType;
    // Hledá se i podle PARCELNÍHO ČÍSLA. Kdo drží v ruce výpis z katastru,
    // má po ruce číslo parcely, ne název obce — a dokud se prohledávalo jen
    // místo a okres, nenašel nic.
    var okSearch = !searchTerm ||
      (d.place + ' ' + d.okres + ' ' + (d.parcel || '')).toLowerCase().indexOf(searchTerm) !== -1;
    var okDruh = activeDruh === 'all' || druhGroup(d.druh) === activeDruh;
    var okPrice = (!maxPrice || (d.price && d.price <= maxPrice))
      && (!minPrice || (d.price && d.price >= minPrice));
    var okArea = (!minArea || (hasArea(d) && d.area >= minArea))
      && (!maxArea || (hasArea(d) && d.area <= maxArea));
    // Štítek v legendě říká „do 7 dní" — filtr musí počítat stejně (dřív pouštěl 14).
    var okUrgent = !urgentOnly || isUrgent(d);
    var okFav = !favOnly || isFav(d);
    var okPerM2 = !maxPerM2 || (hasArea(d) && d.price && (d.price / d.area) <= maxPerM2);
    var okKraj = krajFiltr === 'all' || (d._gkraj || krajOf(d)) === krajFiltr;
    // „Pod obvyklou cenou" bere tentýž odhad, jaký se ukazuje na kartě —
    // a jen tam, kde se srovnává s podobně velkými pozemky. Jinak by sem
    // spadl každý hektar jen proto, že velké pozemky mají nižší cenu za metr.
    /* OKOLÍ. Do teď to byly dvě poloviční funkce: „Pozemky v okolí" jen
       SEŘADILY seznam podle vzdálenosti (ale zůstalo v něm všech 1953
       pozemků z celé republiky) a „Hlídat lokalitu" jen spočítalo, co
       u vás od minule přibylo — na seznam nesáhlo vůbec. Kdo si tedy
       nastavil, že chce hlídat okolí Křince, měl pod tím dál vypsané
       pozemky z celé republiky. Proto to „moc nefungovalo": web řekl
       „hlídáme Křinec a okolí do 10 km", a ukazoval něco jiného.
       Teď je z toho jedna věc: když je okolí nastavené, seznam i mapa
       ukazují JEN to, co je v okruhu. */
    var okOkoli = !okoliAktivni() || kmOd(mojeMisto, d) <= (mojeMisto.km || 10);
    var okLevne = !levneOnly || (function () {
      var od = MODEL ? MODEL.odhad(d) : null;
      return !!(od && od.podleVelikosti && od.podOdhadem >= 15);
    })();
    // Skryté zmizí ze seznamu — ale jen dokud si je člověk sám nevyžádá
    // (tlačítko „Zobrazit skryté"). Nenávratně se nic neztrácí.
    var okSkryt = ukazSkryte || !jeSkryty(d);
    return okType && okSearch && okDruh && okPrice && okArea && okUrgent && okFav && okSkryt
      && okPerM2 && okKraj && okLevne && okOkoli;
  }
  /** Projde pozemek všemi filtry KROMĚ okolí — aby šlo poctivě spočítat,
      kolik by jich bylo ve větším okruhu (a ne kolik jich je celkem). */
  function visibleBezOkoli(d) {
    var byl = okoliZap; okoliZap = false;
    try { return visible(d); } finally { okoliZap = byl; }
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
    // Co už proběhlo, patří dolů — ať v jakémkoli řazení. Mrtvý záznam
    // nahoře je horší než žádný.
    arr.sort(function (a, b) { return (jeProsle(a) ? 1 : 0) - (jeProsle(b) ? 1 : 0); });
    // Zvýrazněné (placené) inzeráty nahoru — stabilní dořazení zachová pořadí uvnitř skupin.
    arr.sort(function (a, b) { return (isFeatured(b) ? 1 : 0) - (isFeatured(a) ? 1 : 0); });
    return arr;
  }

  // Interní skóre pro řazení „Doporučené" a výběr špičky (★ Doporučujeme).
  // Čím výhodnější cena/m² a zajímavější typ, tím vyšší. Není to počet lidí —
  // slouží jen k pořadí, žádné vymyšlené „sledující" se nikde nezobrazují.
  function demand(d) {
    if (d._demand != null) return d._demand;
    var typeBonus = { drazba: 22, exekuce: 18, obec: 12, sale: 8, majitel: 10 }[d.type] || 0;
    /* Dřív se tu počítalo (900 − cena za m²) / 18 — tedy ČÍM LEVNĚJŠÍ ZA METR,
       TÍM VÝŠ, bez ohledu na druh pozemku a na okolí. Orná půda za 6 Kč/m²
       tím porazila všechno ostatní a web ji vystrčil nahoru se štítkem
       „Doporučujeme" — přitom je to skoro jistě spoluvlastnický podíl.
       Doporučení se teď opírá o SLEVU PROTI SROVNATELNÝM POZEMKŮM, ne
       o absolutní cenu, a odmění jen pásmo, kde je sleva uvěřitelná.
       Nad hranicí uvěřitelnosti se body nedávají vůbec: co neumíme
       vysvětlit, to nemůžeme doporučit. */
    var body = 0;
    var o = MODEL ? MODEL.odhad(d) : null;
    if (o && o.podleVelikosti && !o.pochybna && o.podOdhadem >= MEZ_SLEVA) {
      // 15 % → 0 bodů, 50 % a výš → plných 45.
      body = Math.min(45, Math.round((o.podOdhadem - MEZ_SLEVA) * 45 / 35));
    }
    d._demand = Math.max(6, Math.round(9 + typeBonus + body));
    return d._demand;
  }

  var LIST_LIMIT = 8;
  // Ukazatel u „Cena, výměra a řazení" — kolik doplňkových filtrů je aktivních,
  // ať uživatel pozná, že něco filtruje, i když je panel sbalený.
  var msfBadge = document.getElementById('msf-badge');
  function updateFilterBadge() {
    if (!msfBadge) return;
    var n = 0;
    if (maxPrice || minPrice) n++;
    if (minArea || maxArea) n++;
    if (activeDruh && activeDruh !== 'all') n++;
    if (urgentOnly) n++;
    if (favOnly) n++;
    if (sortMode && sortMode !== 'demand') n++;
    if (n > 0) { msfBadge.textContent = n; msfBadge.hidden = false; }
    else { msfBadge.hidden = true; }
  }

  function renderList() {
    updateFilterBadge();
    ulozFiltr();
    listEl.innerHTML = '';
    var vis = [], visIds = [];
    DATA.forEach(function (d) {
      if (visible(d)) { vis.push(d); visIds.push(d._id); }
    });
    syncMarkers(visIds);
    // Seznam drží vybraný kraj. Bez toho si člověk klikl na „Jihomoravský kraj"
    // (nebo přišel odkazem ?kraj=…), mapa se přiblížila k Brnu — a pod ní se
    // nabízely pozemky z Kroměříže a Písku.
    if (selectedKraj) vis = vis.filter(function (d) { return krajOf(d) === selectedKraj; });
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
      /* Pojistka navíc: i kdyby se skóre někdy počítalo jinak, štítek
         „Doporučujeme" nesmí nikdy sednout na nabídku, kterou sami
         označujeme za pochybnou. Doporučit a zároveň varovat nejde. */
      vis.slice()
        .filter(function (d) { var o = MODEL ? MODEL.odhad(d) : null; return !(o && o.pochybna); })
        .sort(function (a, b) { return demand(b) - demand(a); }).slice(0, 1)
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
      // Dražba po termínu vypisovala PRÁZDNO a vypadala jako živá nabídka.
      // countdownText() přitom „proběhlo" umí — jen se nikdy nezavolalo,
      // protože podmínka pouštěla dál jen budoucí termíny. Kdo klikne na
      // dražbu, která byla minulý měsíc, se podruhé nevrátí.
      var cd = days == null ? ''
        : (days < 0 ? '<span class="opp-cd opp-proběhlo">proběhlo</span>'
                    : '<span class="opp-cd' + countdownClass(days) + '">' + countdownText(days) + '</span>');
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
        // Vzdálenost se ukazuje vždycky, když je od čeho měřit — dřív jen při
        // řazení „podle okolí", takže si jí nikdo nevšiml.
        (function () {
          var od = userPos || mojeMisto;
          if (!od) return '';
          var km = kmOd(od, d);
          if (!isFinite(km)) return '';
          return '<span class="opp-km">' + (km < 1 ? '<1' : Math.round(km)) + ' km</span>';
        }());
      // Stavové odznaky pohromadě na jednom řádku
      var chips = [];
      if (isFeatured(d)) chips.push('<span class="opp-feat">Zvýrazněno</span>');
      if (cd) chips.push(cd);
      /* Odznak výhodné ceny. Když umíme spočítat obvyklou cenu v okolí,
       * řekneme to rovnou takhle — „o 92 % pod obvyklou v okrese" je
       * údaj, kdežto „levnější než 92 % podobných" je pořadí v žebříčku
       * a člověk si pod tím nic nepředstaví. Percentil zůstává jako
       * záloha tam, kde na odhad není dost srovnání. */
      // Varování o nevěrohodné ceně patří na KARTU, ne jen do detailu.
      // Kdo do detailu neklikne, dozví se to až pozdě — a zrovna tuhle
      // informaci potřebuje vidět hned.
      var _odhadPochybny = MODEL && (function () { var x = MODEL.odhad(d); return !!(x && x.podleVelikosti && x.pochybna); })();
      if (MODEL && MODEL.neduveryhodna(d) && !_odhadPochybny) {
        chips.push('<span class="opp-overit" title="Cena za m² je hluboko pod obvyklou — bývá to spoluvlastnický podíl, pozemek bez přístupu nebo chyba v inzerátu">cena k ověření</span>');
      }
      var _od = MODEL ? MODEL.odhad(d) : null;
      /* Sleva se tvrdí jen tam, kde se srovnávalo s podobně velkými pozemky
         (jinak by každý dvanáctihektarový vyšel jako trhák) A ZÁROVEŇ kde
         je uvěřitelná. „−91 % proti okolí" není sleva, je to varování:
         u orné půdy za 6 Kč/m² jde skoro jistě o spoluvlastnický podíl,
         jinou výměru v dražbě nebo špatně načtenou cenu. Dřív měly tyhle
         nabídky zelený odznak se slevou a sedávaly úplně nahoře. */
      if (_od && _od.podleVelikosti && _od.pochybna) {
        chips.push('<span class="opp-overit" title="Cena je o ' + _od.podOdhadem +
          ' % pod obvyklou cenou podobných pozemků — to už nebývá sleva, ale spoluvlastnický podíl, jiná výměra v dražbě nebo chyba v inzerátu. Ověřte si podklady.">' +
          'ověřit cenu</span>');
      } else if (_od && _od.podleVelikosti && _od.podOdhadem >= 25) {
        // Na kartě musí odznak vyjít na JEDEN řádek i na úzkém displeji.
        // „o 65 % pod obvyklou" verzálkami se na mobilu lámalo na dva.
        chips.push('<span class="opp-deal" title="Cena je o ' + _od.podOdhadem +
          ' % pod obvyklou cenou podobných pozemků v okolí">−' + _od.podOdhadem + ' % proti okolí</span>');
      } else if (perM2 && dealMax && perM2 <= dealMax) {
        var _di = dealInfo(d);
        chips.push('<span class="opp-deal">' + (_di && _di.cheaper >= 70 ? 'levnější než ' + _di.cheaper + ' %' : 'výhodná cena') + '</span>');
      }
      if (hot) chips.push('<span class="opp-hot">Doporučujeme</span>');
      // „Nové od minulé návštěvy" — první odznak v řadě, ať je hned vidět,
      // co člověk ještě neviděl.
      if (jeNovy(d)) chips.unshift('<span class="opp-nove">Nové</span>');
      /* Nejvýš tři odznaky. Karta jich uměla vyrobit pět a na mobilu pak
       * každý zabral vlastní řádek — místo přehledu vznikl sloupec štítků.
       * Pořadí výš je zároveň pořadím důležitosti, takže se ořezává odzadu:
       * „Doporučujeme" ustoupí termínu dražby i slevě. */
      if (chips.length > 3) chips = chips.slice(0, 3);
      if (jeSkryty(d)) li.classList.add('je-skryty');
      li.innerHTML =
        '<div class="opp-media">' +
          mapThumb(d) +
          '<button type="button" class="opp-fav' + (isFav(d) ? ' on' : '') + '" aria-label="' + (isFav(d) ? 'Odebrat z uložených' : 'Uložit pozemek') + '">' + BM_SVG + '</button>' +
          '<button type="button" class="opp-skryt" aria-label="' + (jeSkryty(d) ? 'Vrátit do seznamu' : 'Tenhle mě nezajímá') + '" title="' + (jeSkryty(d) ? 'Vrátit do seznamu' : 'Tenhle mě nezajímá') + '">' + (jeSkryty(d) ? '↩' : '✕') + '</button>' +
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
      var skrytBtn = li.querySelector('.opp-skryt');
      if (skrytBtn) skrytBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        prepniSkryty(d);
        renderList();
      });
      listEl.appendChild(li);
    });

    var mvCount = document.getElementById('mvt-count'); if (mvCount) mvCount.textContent = matched ? '(' + matched + ')' : '';
    var headLabel = sortMode === 'demand' ? 'Doporučené příležitosti' : 'Vybrané příležitosti';
    var pripisky = '';
    var novych = pocetNovych();
    if (novych) pripisky += ' <span class="mc-nove">' + novych + ' ' +
      (novych === 1 ? 'nový od minule' : (novych < 5 ? 'nové od minule' : 'nových od minule')) + '</span>';
    if (skryte.length) pripisky += ' <button type="button" class="mc-skryte" id="mc-skryte">' +
      (ukazSkryte ? 'Schovat skryté' : 'Zobrazit skryté (' + skryte.length + ')') + '</button>';
    countEl.innerHTML = headLabel + ' · <span class="mc-sub">' + matched + ' na mapě</span>' + pripisky;
    var sb = countEl.querySelector('#mc-skryte');
    if (sb) sb.addEventListener('click', function (e) { e.stopPropagation(); ukazSkryte = !ukazSkryte; renderList(); });
    if (matched === 0) {
      var anyFilter = activeType !== 'all' || activeDruh !== 'all' || maxPrice || minPrice || searchTerm || favOnly || urgentOnly || minArea || maxArea;
      var emptyMsg;
      if (okoliAktivni()) {
        /* Prázdný okruh je nejčastější důvod, proč hlídání „nefunguje":
           v okolí malé obce prostě nic není. Není to chyba a nemá se to
           řešit zrušením filtrů — má se nabídnout větší okruh, a rovnou
           s tím, kolik by v něm bylo. */
        var km0 = mojeMisto.km || 10;
        var vetsi = [5, 10, 20, 50, 100].filter(function (k) { return k > km0; });
        var navrh = null;
        for (var vi = 0; vi < vetsi.length; vi++) {
          var kolik = DATA.filter(function (d) { return visibleBezOkoli(d) && kmOd(mojeMisto, d) <= vetsi[vi]; }).length;
          if (kolik > 0) { navrh = { km: vetsi[vi], kolik: kolik }; break; }
        }
        /* Pozor na pády. „Do 2 km od Loučeň" je stejná bota jako kdysi
           „v Vysočina kraji" — a skloňovat názvy obcí spolehlivě neumíme
           (Praha → Prahy, Loučeň → Loučně, Brno → Brna…). Věta je proto
           postavená tak, aby název zůstal v prvním pádě. */
        emptyMsg = 'Do ' + km0 + ' km od vašeho místa' +
          (mojeMisto.nazev ? ' (' + esc(mojeMisto.nazev) + ')' : '') + ' teď nic není.' +
          (navrh ? ' Do ' + navrh.km + ' km ' + (navrh.kolik === 1 ? 'je 1 pozemek' :
            (navrh.kolik < 5 ? 'jsou ' + navrh.kolik + ' pozemky' : 'je ' + navrh.kolik + ' pozemků')) + '.'
            : ' Ani ve větším okruhu zatím nic.');
        listEl.innerHTML = '<li class="map-count" style="padding:20px 6px; text-transform:none; font-weight:400; line-height:1.6;">' + emptyMsg +
          (navrh ? '<br><button type="button" id="okoli-vic" class="reset-btn">Zvětšit okruh na ' + navrh.km + ' km</button>' : '') +
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
        updatePolys();
        return;
      }
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
    prepocitejCipy();   // čísla u kategorií musí sedět s tím, co je vidět
    updatePolys(); // tvary parcel podle aktuálního filtru
  }

  function resetFilters() {
    activeType = 'all'; activeDruh = 'all'; maxPrice = 0; minArea = 0; urgentOnly = false; searchTerm = ''; favOnly = false;
    if (searchEl) searchEl.value = '';
    if (druhEl) druhEl.value = 'all';
    minPrice = 0; maxArea = 0;
    [cenaEl, cenaOdEl, areaEl, areaDoEl].forEach(function (el) { if (el) el.value = ''; });
    document.querySelectorAll('.mc-rychle button.on').forEach(function (b) { b.classList.remove('on'); });
    if (cenaEl) cenaEl.dispatchEvent(new Event('pk-reset'));
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
    // ?q=&druh=&maxc=&mina= — použij uložené hledání (odkaz ze stránky „Hlídání").
    if (/[?&](q|druh|maxc|mina)=/.test(location.search)) {
      var gp = function (n) { var mm = new RegExp('[?&]' + n + '=([^&]*)').exec(location.search); try { return mm ? decodeURIComponent(mm[1]) : ''; } catch (e) { return mm ? mm[1] : ''; } };
      var qv = gp('q'), dv = gp('druh'), mc = parseInt(gp('maxc'), 10) || 0, ma = parseInt(gp('mina'), 10) || 0;
      if (qv && searchEl) { searchEl.value = qv; searchTerm = qv.trim().toLowerCase(); }
      // Cena a výměra jsou rozbalovací seznamy. Odkaz z „Hlídání" může nést
      // i částku, která mezi nabízenými není — pak ji do seznamu doplníme,
      // jinak by se filtr tiše nenastavil a člověk by viděl jiné výsledky,
      // než na jaké si odkaz uložil.
      var dosad = function (el, v, txt) {
        if (!el || !v) return;
        if (el.tagName === 'SELECT') {
          var ma2 = false;
          for (var k = 0; k < el.options.length; k++) if (String(el.options[k].value) === String(v)) { ma2 = true; break; }
          if (!ma2) el.add(new Option(txt, String(v)));
        }
        el.value = String(v);
      };
      dosad(cenaEl, mc, 'do ' + mc.toLocaleString('cs-CZ') + ' Kč');
      dosad(areaEl, ma, 'od ' + ma.toLocaleString('cs-CZ') + ' m²');
      if (mc) maxPrice = mc;
      if (ma) minArea = ma;
      if (dv && druhEl) {
        var want = dv.toLowerCase();
        for (var oi = 0; oi < druhEl.options.length; oi++) {
          var ov = druhEl.options[oi];
          if (ov.value && ov.value !== 'all' && (want.indexOf(ov.value.toLowerCase()) >= 0 || (ov.text && want.indexOf(ov.text.toLowerCase()) >= 0) || (ov.text && ov.text.toLowerCase().indexOf(want) >= 0))) { druhEl.value = ov.value; activeDruh = ov.value; break; }
        }
      }
      if (typeof lockDots === 'function') lockDots(false);
      renderList();
      if (holderEl) setTimeout(function () { holderEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
      cleanUrl();
      return true;
    }
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
    DATA.forEach(function (d) { if (!target && pkey(d) === key) target = d; });
    // Odkaz rozeslaný před sjednocením klíčů: zkusíme ještě starý tvar.
    if (!target) DATA.forEach(function (d) { if (!target && pkeyLegacy(d) === key) target = d; });
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
    // Číslo v postranním sloupci má sedět s tím, co je vidět — ne slibovat čtyři,
    // když se dneska našly tři.
    var rn = document.getElementById('deals-n');
    if (rn) {
      rn.textContent = String(top.length);
      var rl = rn.nextElementSibling;
      if (rl) rl.textContent = top.length === 1 ? 'tip dnes' : (top.length < 5 ? 'tipy dnes' : 'tipů dnes');
    }
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
  /* Rychlé volby. Nejsou to další omezení, jen zkratka — po klepnutí se
     čísla objeví v políčkách a dají se dál upravit. Druhé klepnutí na tutéž
     volbu ji zruší, ať se člověk nemusí vracet mazáním. */
  function nastavRozsah(odEl, doEl, hodnota, tlacitko) {
    var d = String(hodnota).split('-');
    // „0" v zápisu volby znamená „bez dolní hranice", v políčku má být prázdno.
    var chceOd = (d[0] && d[0] !== '0') ? d[0] : '';
    var chceDo = d[1] || '';
    var uzPlati = odEl.value === chceOd && doEl.value === chceDo;
    odEl.value = uzPlati ? '' : chceOd;
    doEl.value = uzPlati ? '' : chceDo;
    var skupina = tlacitko.parentElement;
    skupina.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
    if (!uzPlati) tlacitko.classList.add('on');
    prectiRozsahy();
  }
  document.querySelectorAll('.mc-rychle').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-cena')) nastavRozsah(cenaOdEl, cenaEl, b.getAttribute('data-cena'), b);
      else if (b.hasAttribute('data-plocha')) nastavRozsah(areaEl, areaDoEl, b.getAttribute('data-plocha'), b);
    });
  });
  if (urgentEl) urgentEl.addEventListener('click', function () { urgentOnly = !urgentOnly; urgentEl.classList.toggle('on', urgentOnly); urgentEl.setAttribute('aria-pressed', String(urgentOnly)); renderList(); });
  if (favEl) favEl.addEventListener('click', function () { favOnly = !favOnly; refreshFavBtn(); renderList(); });
  if (perm2El) perm2El.addEventListener('change', function () { maxPerM2 = parseInt(perm2El.value, 10) || 0; renderList(); });
  if (levneEl) levneEl.addEventListener('click', function () {
    levneOnly = !levneOnly;
    levneEl.classList.toggle('on', levneOnly);
    levneEl.setAttribute('aria-pressed', String(levneOnly));
    renderList();
  });
  if (krajFiltrEl) {
    // Nabídka krajů se plní z DAT, ne z pevného seznamu — kraj bez jediného
    // pozemku by byl slepá ulička.
    var pocty = {};
    DATA.forEach(function (d) { var k = d._gkraj || krajOf(d); if (k) pocty[k] = (pocty[k] || 0) + 1; });
    Object.keys(pocty).sort(function (a, b) { return a.localeCompare(b, 'cs'); }).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k;
      o.textContent = (k === 'Praha' ? 'Praha' : (k === 'Vysočina' ? 'Vysočina' : k)) + ' (' + pocty[k] + ')';
      krajFiltrEl.appendChild(o);
    });
    krajFiltrEl.addEventListener('change', function () {
      krajFiltr = krajFiltrEl.value;
      renderList();
      // Kraj vybraný ze seznamu má mapu rovnou ukázat — jinak by člověk
      // filtroval naslepo a mapa by dál stála nad celou republikou.
      if (krajFiltr !== 'all' && typeof selectKraj === 'function') { try { selectKraj(krajFiltr); } catch (e) {} }
      else if (typeof clearKraj === 'function') { try { clearKraj(); } catch (e) {} }
    });
  }

  refreshFavBtn();
  renderList();
  renderRecent();
  // ---------------------------------------------------------------
  // ŽIVÝ PROUŽEK V ÚVODU
  // Nahoře stálo jen „1 953 pozemků · 77 okresů". Je to pravda, ale nic
  // to neříká o tom, jestli se tu něco DĚJE — a přesně to člověk na první
  // obrazovce potřebuje vědět, dřív než začne cokoli dělat.
  // Tři fakta, všechna počítaná ze skutečných dat při každém načtení:
  // nejbližší termín dražby, kolik pozemků přibylo, a nejvýhodnější
  // dnešní nabídka. Když se některé spočítat nedá, ten kousek se
  // nezobrazí — radši nic než výplň.
  // ---------------------------------------------------------------
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
      a.querySelector('.hl-v').textContent = hodnota;
      if (cil) a.addEventListener('click', function (e) { e.preventDefault(); gotoInzerat(cil); });
      hotovo++;
    }

    // 1) Nejbližší dražba — termín je v poli extra („dražba 2026-10-12").
    var nej = null, nejD = null;
    DATA.forEach(function (d) {
      if (d.type !== 'drazba' && d.type !== 'exekuce') return;
      var m = /(\d{4}-\d{2}-\d{2})/.exec(d.extra || '');
      if (!m) return;
      var t = den(m[1]);
      if (!t || t < dnes) return;                 // prošlé termíny sem nepatří
      if (!nejD || t < nejD) { nejD = t; nej = d; }
    });
    vypln('drazba', null, nej ? (zaKolik(nejD) + ' · ' + nej.place) : '', nej);

    /* 2) Kolik přibylo. Přednost má dnešek; když dnes nic, vezmeme týden.

       Pozor na jednu past: „poprvé viděno" se do dat doplnilo najednou,
       takže po zavedení toho pole (a po každém dalším resetu historie)
       vypadalo 1 947 z 1 953 nabídek jako čerstvě přibylých. Web pak
       v úvodu hlásil „Přibylo za týden: 1 940 pozemků" vedle údaje
       „1 940 pozemků celkem — dvě čísla, jedno vedle druhého, a obě
       stejná. To není novinka, to je datum zavedení sloupce.

       Proto se číslo ukáže, jen když dává smysl jako novinka: nejvýš
       třetina databáze. Nad tím se mlčí — radši nic než nepravda. */
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

    // 3) Nejvýhodnější dnes — o kolik je pod podobnými nabídkami. Používáme
    //    tentýž výpočet jako karty níž, ne vlastní (jinak by si dvě čísla
    //    na jedné stránce odporovala). Holé minimum ceny za m² by sem
    //    nepatřilo: nejlevnější nabídka bývá podíl nebo chyba v inzerátu.
    var best = null, bestO = null;
    DATA.forEach(function (d) {
      var o = MODEL ? MODEL.odhad(d) : null;
      /* Tohle místo je na webu to nejvíc vidět — svítí to v úvodu jako
         „NEJVÝHODNĚJŠÍ DNES". A dokud se bralo prosté maximum slevy, svítil
         tu Doubravník „o 95 % pod obvyklou": stavební pozemek za 59 Kč/m²,
         tedy skoro jistě podíl nebo špatně zařazený druh. Nejpodezřelejší
         nabídka na webu jako titulek. Pochybné sem nepatří. */
      if (!o || !o.podleVelikosti || o.pochybna || o.podOdhadem < 25) return;
      if (!bestO || o.podOdhadem > bestO.podOdhadem) { bestO = o; best = d; }
    });
    vypln('deal', null, best ? ('o ' + bestO.podOdhadem + ' % pod obvyklou · ' + best.place) : '', best);

    if (hotovo) box.hidden = false;
  }

  /* Zápis data návštěvy. Rozhodující bylo, že se výš už přečetlo do
   * proměnné; tohle je jen opatrnost navíc — když se stránka mezitím
   * rozbije, návštěva se nezapíše a přehled „co je nové" zůstane. */
  (function () {
    var dnes = new Date();
    var iso = dnes.getFullYear() + '-' +
      String(dnes.getMonth() + 1).padStart(2, '0') + '-' +
      String(dnes.getDate()).padStart(2, '0');
    setTimeout(function () { zapisUloz(NAVSTEVA_KLIC, iso); }, 1200);
  }());

  /* Poslední nastavení filtrů. Kdo si vybral „Ústecký kraj, stavební,
   * do milionu", nechce to příště klikat znovu. Ukládá se jen to, co si
   * člověk sám nastavil — vyhledávací text ne, ten je jednorázový. */
  var FILTR_KLIC = 'pk_filtr_v1';
  function ulozFiltr() {
    zapisUloz(FILTR_KLIC, { typ: activeType, druh: activeDruh, cena: maxPrice,
      plocha: minArea, cenaOd: minPrice, plochaDo: maxArea, urgent: urgentOnly, razeni: sortMode,
      zaMetr: maxPerM2, kraj: krajFiltr, levne: levneOnly });
  }
  function obnovFiltr() {
    var f = ctiUloz(FILTR_KLIC, null);
    if (!f) return false;
    if (f.typ) activeType = f.typ;
    if (f.druh) activeDruh = f.druh;
    if (f.cena) maxPrice = f.cena;
    if (f.plocha) minArea = f.plocha;
    urgentOnly = !!f.urgent;
    // Řazení „podle vzdálenosti" se neobnovuje — potřebuje polohu, o kterou
    // se musí požádat znovu, a bez ní by seznam vyšel v náhodném pořadí.
    if (f.razeni && f.razeni !== 'near') sortMode = f.razeni;
    // Ovládací prvky musí ukázat totéž, co je nastavené — jinak by filtr
    // tiše platil a člověk by nechápal, proč vidí jen část nabídek.
    if (filtersEl) filtersEl.querySelectorAll('.filter-chip').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-type') === activeType);
    });
    if (druhEl) druhEl.value = activeDruh;
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
    if (krajFiltrEl && krajFiltr) krajFiltrEl.value = krajFiltr;
    if (levneEl) { levneEl.classList.toggle('on', levneOnly); levneEl.setAttribute('aria-pressed', String(levneOnly)); }
    if (urgentEl) urgentEl.checked = urgentOnly;
    if (sortEl) sortEl.value = sortMode;
    return true;
  }
  // Seznam se vykresluje už dřív, takže po obnovení filtru se musí překreslit —
  // jinak by ovládací prvky ukazovaly filtr, který na výpis ještě nesedí.
  if (obnovFiltr()) renderList();

  /* Proužek „u vašeho místa od minule přibylo". Tohle je celý smysl
   * uloženého místa — jinak by si ho nikdo neukládal. */
  var mistoPruh = document.getElementById('misto-pruh');
  var mistoKmEl = document.getElementById('misto-km');
  var mistoZrus = document.getElementById('misto-zrus');
  var akceZadne = document.getElementById('mp-akce-zadne');
  var akceMam = document.getElementById('mp-akce-mam');
  var vybratBtn = document.getElementById('misto-vybrat');
  /* Hlídané místo na MAPĚ. Tohle tu do teď vůbec nebylo: funkce vykresliMisto
     přepisovala jen text v proužku, takže člověk klepl do mapy, proužek nahoře
     se změnil — a na mapě se nestalo nic. Kdo se díval na mapu (a při volbě
     „klepněte do mapy na své místo" se na ni dívá každý), viděl, že se nic
     nestalo, a měl pravdu.
     Teď je tam značka a kolem ní kruh s hlídaným okruhem, takže je vidět
     přesně to, co se hlídá — a mění se to hned, jak se okruh přepne. */
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
      title: (mojeMisto.nazev || 'Vaše hlídané místo') + ' — okolí do ' + km + ' km'
    }).addTo(map);
  }

  /** Zarámuje mapu na hlídaný okruh, ať je vidět přesně to, co se hlídá. */
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
      /* Bez uloženého místa se proužek neschovává, ale zve. Dokud tu byla
       * jen podmínka „když není místo, schovej", nešlo hlídání vůbec zapnout
       * jinak než přes GPS — a kdo polohu nepovolí, o funkci nikdy nezjistil. */
      mistoPruh.hidden = false;
      mistoPruh.classList.remove('ma-novinky');
      mistoPruh.classList.add('bez-mista');
      hl.textContent = 'Hlídejte si okolí svého pozemku';
      // Tlačítko „Pozemky v okolí" hned pod proužkem dělá totéž, jen podle
      // polohy telefonu — ať se o něm ví a nevznikají dvě tlačítka na totéž.
      pod.textContent = 'Vyberte si místo na mapě, nebo použijte „Pozemky v okolí" níž. Při každé návštěvě pak uvidíte, co u vás přibylo.';
      if (akceZadne) akceZadne.hidden = false;
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
    // Název obce zůstává v prvním pádě (viz pády výš) — „Hlídáme Praha
    // a okolí" by bylo špatně, „Hlídané místo: Praha" je vždycky správně.
    pod.textContent = (n.nazev !== 'vašeho místa' ? 'Hlídané místo: ' + n.nazev + ' · ' : 'Hlídané místo · ') +
      'okolí do ' + n.okruh + ' km · je tu ' + n.celkem + ' ' +
      (n.celkem === 1 ? 'pozemek' : (n.celkem < 5 ? 'pozemky' : 'pozemků'));
    if (mistoKmEl) mistoKmEl.value = String(n.okruh);
  }
  if (mistoKmEl) mistoKmEl.addEventListener('change', function () {
    if (!mojeMisto) return;
    mojeMisto.km = parseInt(mistoKmEl.value, 10) || 10;
    ulozMisto(mojeMisto);
    vykresliMisto();
    ramujMisto();     // nový okruh musí být vidět celý, jinak se změna nepozná
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
  /* Zapnout/vypnout „jen okolí". Dřív šlo místo jen uložit a zrušit — a
     uložené místo přitom na seznam vůbec nesáhlo, takže z něj nikdo neměl
     nic. Teď je to přepínač: buď se dívám na celou republiku, nebo na svoje
     okolí, a je vidět, ve kterém stavu jsem. */
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

  /* Dřív se tu hlavní mapa přepnula do režimu „klepněte na své místo" —
     jedno klepnutí a hotovo, bez možnosti couvnout a bez výběru kraje.
     Teď se otevře vlastní mapa, ve které se dá libovolně hýbat. */
  if (vybratBtn) vybratBtn.addEventListener('click', function () { otevriVyberMista(); });
  var zmenitBtn = document.getElementById('misto-zmenit');
  if (zmenitBtn) zmenitBtn.addEventListener('click', function () { otevriVyberMista(); });
  vykresliMisto();

  renderHeroLive();
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
  // Výchozí cache (ne 'no-store') — aby fungoval <link rel=preload> a vracející
  // se návštěvník nestahoval data znovu. Čerstvost řeší ETag při novém nasazení.
  function loadJSON(url) { return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  Promise.all([loadJSON('data/opportunities.json'), loadJSON('data/kraje.json'), loadJSON('data/user-listings.json'), sbRpc('public_listings')])
    .then(function (res) {
      var j = res[0], kraje = res[1], ul = res[2], live = res[3];
      var arr = Array.isArray(j) ? j : (j && j.opportunities);
      /* Když se skutečná data nenačtou, web se do téhle chvíle beze slova
       * přepnul na čtrnáct záložních nabídek a tvářil se, že to je celá
       * republika — v úvodu svítilo „14 pozemků". To je horší než hlásit
       * chybu: člověk si odnese, že u nás nic není, a už se nevrátí.
       * Záloha zůstává (prázdná mapa je taky k ničemu), ale MUSÍ to být
       * vidět. */
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
      // BEZPEČNOST — jedna branka pro VŠECHNA data, ne jen pro ta ze Supabase.
      // Na mapu se sbíhají tři zdroje: robot (dražební rejstříky, inzertní
      // weby), schválené inzeráty v repozitáři a živé inzeráty od majitelů.
      // Čistily se jen ty živé. Jenže texty od robota pocházejí z CIZÍCH webů,
      // na které nemáme vliv, a vypisují se do stránky přes innerHTML — stačilo
      // by, aby se do popisu dostalo <img onerror=…>, a spustí se to každému
      // návštěvníkovi. Adresa odkazu se navíc vkládá rovnou do href, takže
      // „javascript:…" by se po klepnutí provedlo.
      var DRUHY = { sale: 1, drazba: 1, exekuce: 1, obec: 1, majitel: 1 };
      function cistyText(v, max) {
        return String(v == null ? '' : v).replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 120);
      }
      function cistyOdkaz(v) {
        var u = String(v == null ? '' : v).trim();
        if (!/^https?:\/\//i.test(u)) return '';        // jen http(s), nic jiného
        if (/["'<>\s]/.test(u)) return '';               // uvozovka by rozbila href
        return u.slice(0, 500);
      }
      base = base.filter(function (d) { return d && typeof d === 'object'; }).map(function (d) {
        if (!DRUHY[d.type]) d.type = 'sale';             // neznámý druh by shodil vykreslení
        d.place = cistyText(d.place, 80) || 'Neuvedeno';
        d.okres = cistyText(d.okres, 60);
        d.parcel = cistyText(d.parcel, 40);
        d.druh = cistyText(d.druh, 60);
        d.extra = cistyText(d.extra, 160);
        d.contact = cistyText(d.contact, 80);
        d.description = cistyText(d.description, 600);
        d.access = cistyText(d.access, 40);
        d.url = cistyOdkaz(d.url);
        return d;
      });
      boot(base, kraje || null, j && j.updated, j && j.updated_at, j && j.sources);
    });
})();
