/* Samostatná stránka inzerátu pozemku (pozemek.html).
   Načte data, najde pozemek podle ?p=<klíč>&ll=<lat>,<lng> a vykreslí detail.
   Pomocné funkce jsou záměrně zrcadlené z js/main.js, aby stránka fungovala
   nezávisle na mapové aplikaci. */
(function (global) {
  'use strict';

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
    exekuce: { label: 'Exekuce',      color: tokenBarva('--c-exekuce', '#8C2F1E'), link: { label: 'Ověřit v katastru', url: 'https://www.ikatastr.cz/' } },
    obec:    { label: 'Obecní záměr', color: tokenBarva('--c-obec', '#12AEBE'), link: { label: 'Úřední deska obce',    url: 'https://www.uredni-deska.cz/' } },
    majitel: { label: 'Přímo od majitele',  color: tokenBarva('--c-majitel', '#8B4FE0'), link: { label: 'Ověřit v katastru',    url: 'https://www.ikatastr.cz/' } }
  };

  function fmt(n) { return (n == null ? '' : n.toString()).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function hasArea(d) { return typeof d.area === 'number' && d.area > 0; }
  function areaTxt(d) { return hasArea(d) ? fmt(d.area) + ' m²' : 'neuvedena'; }
  function hasParcel(d) { return d.parcel && d.parcel !== '—' && d.parcel !== ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function druhGroup(s) {
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

  /* Termíny dražeb — společné s mapou, viz js/terminy.js. Dřív tu byla
     doslovná kopie z js/main.js; dvě kopie téhož výpočtu se v tomhle
     projektu už jednou rozešly a je to chyba, kterou nikdo nevidí. */
  var T = window.PK_TERMINY;
  function daysUntil(extra) { return T.daysUntil(extra); }
  function countdownText(days) { return T.countdownText(days); }
  function countdownClass(days) { return T.countdownClass(days); }
  function zdrojText(extra) { return T.zdrojText(extra); }
  /* Text jen pro odečítač obrazovky: odkaz vede pryč z webu a otevře se
     v novém okně. Vidící to pozná podle šikmé šipky (viz CSS). */
  var VEN = '<span class="visually-hidden"> — otevře se v novém okně mimo Parcelku</span>';

  function pkey(d) { return [d.place || '', d.parcel || '', d.okres || ''].join('|'); }
  /* Název vlastní stránky pozemku. Tentýž výpočet dělá generátor v Node —
     kdyby se rozešly, odkazovalo by se na neexistující soubor. */
  var PK_MAPA = { 'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o','ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z' };
  function pkSlug(s) {
    return String(s || '').toLowerCase().replace(/[áčďéěíňóřšťúůýž]/g, function (c) { return PK_MAPA[c] || c; })
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function pkOtisk(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function pkeyPlny(d) {
    var la = (typeof d.lat === 'number') ? d.lat.toFixed(3) : '';
    var ln = (typeof d.lng === 'number') ? d.lng.toFixed(3) : '';
    return [d.place || '', d.parcel || '', d.okres || '', la, ln].join('|');
  }
  function souborPozemku(d) {
    return 'pozemek-' + pkSlug(d.okres) + '-' + pkSlug(d.place) + '-' + pkOtisk(pkeyPlny(d)) + '.html';
  }
  /* ČTVRŤ U VELKÝCH MĚST. U velkých měst uvádí zdroj jen celou obec
     („Praha" = 496 km²), takže je ten řádek k ničemu. Robot k ní
     dopočítá čtvrť ze souřadnic (pole `cast`, viz
     scripts/fetch-opportunities.mjs). Do `place` se nesahá: je v klíči
     pozemku, a s ním v uložených oblíbených i ve sdílených adresách.
     Stejný výpočet má i mapa (js/main.js) — že se ty dva nerozejdou,
     hlídá scripts/test-ctvrt.mjs. */
  function mistoRadek(d) {
    var okr = d.okres ? 'okres ' + esc(d.okres) : '';
    if (d.cast) return esc(d.cast) + (okr ? ' · ' + okr : '');
    /* Když je „místo" totéž co okres (zdroj nic bližšího neuvedl),
       stálo na kartě „Brno-venkov" a hned pod tím „okres Brno-venkov".
       Dvakrát totéž, a to druhé navíc tvrdí, že jde o obec. Radši nic:
       název je vidět v nadpisu o řádek výš. Když ale čtvrť známe,
       řádek smysl má — proto se tahle výjimka řeší až za ní. */
    if (d.place && d.okres && String(d.place).trim() === String(d.okres).trim()) return '';
    return okr;
  }
  function katastrUrl(d) { return 'https://ikatastr.cz/#zoom=18&lat=' + d.lat + '&lon=' + d.lng + '&info=' + d.lat + ',' + d.lng; }
  function mapyUrl(d) { return 'https://mapy.cz/zakladni?x=' + d.lng + '&y=' + d.lat + '&z=18&source=coor&id=' + d.lng + ',' + d.lat; }
  var SPU_OFFERS = 'https://spu.gov.cz/nabidky/prehled-cela-cr';
  function isSPU(d) { return d.type === 'sale' && !d.url && /SPÚ|státní půd/i.test(d.extra || ''); }
  function isDeepLink(url) {
    try { var u = new URL(url); return (u.pathname && u.pathname.replace(/\/+$/, '').length > 1) || !!u.search; }
    catch (e) { return false; }
  }
  function sourceLink(d) {
    if (d.url) {
      if (isDeepLink(d.url)) return { url: d.url, label: d.type === 'sale' ? 'Inzerát' : 'K dražbě' };
      return { url: d.url, label: d.type === 'sale' ? 'Web prodejce' : 'Dražební portál' };
    }
    if (isSPU(d)) return { url: SPU_OFFERS, label: 'Nabídka SPÚ' };
    /* Exekuce bez odkazu na zdroj mířila do insolvenčního rejstříku. To je
       ale jiné řízení: insolvence je úpadek dlužníka, exekuce vymáhání
       jednotlivého dluhu — v ISIR se exekuce na pozemku nedohledá. Vlastní
       rádce (exekuce-pozemku.html) přitom říká správně, že exekuční poznámku
       a zástavní právo ukáže list vlastnictví a katastr je „vždy zdroj
       pravdy". Posíláme tedy na katastr, přímo na tu parcelu. */
    if (d.type === 'exekuce' && typeof d.lat === 'number' && typeof d.lng === 'number') {
      return { url: katastrUrl(d), label: 'Ověřit v katastru' };
    }
    return { url: TYPE[d.type].link.url, label: TYPE[d.type].link.label };
  }

  /* Rádce „Co byste měli vědět" je společný s druhou půlkou webu —
   * js/radce.js. Mapa i stránka pozemku ho tu měly každá po svém, takže
   * stačilo změnit jednu z nich a u téhož pozemku by si protiřečily.
   * Přesně to se stalo u cenového srovnání; podruhé to dělat nebudu. */
  function goodToKnowHtml(d) {
    if (!window.PK_RADCE) return '';
    return window.PK_RADCE.html(d, MODEL);
  }

  // Cenový model je společný s mapou (js/ceny.js) — dřív tu byla vlastní
  // kopie výpočtu a rozešla se: stránka pozemku hlásila „Výhodná cena"
  // i u nabídek, které mapa už odmítala jako nevěrohodné.
  var MODEL = null;
  function buildIndex(DATA) {
    MODEL = (window.PK_CENY && window.PK_CENY.postav) ? window.PK_CENY.postav(DATA) : null;
  }
  // (Tmavá varianta verdiktu tu bývala jako priceBarHtml — na téhle stránce
  //  se nikdy nevykreslovala, používá se světlá pzVerdictHtml níž. Smazáno.)

  // Odhad obvyklé ceny v okolí. Ukazuje se jen tam, kde má co říct — tedy
  // když je cena aspoň o 15 % pod obvyklou hladinou. Kdyby se vypisoval
  // vždycky, byla by to u poloviny nabídek jen další řádka s číslem.
  function odhadHtml(d) {
    // Tentýž blok jako v okně na mapě (js/ceny.js) — jen s delším koncem,
    // na stránce pozemku je na vysvětlení místo.
    return window.PK_CENY.blokOdhadu(MODEL, d, { fmt: fmt, esc: esc, trida: ' pz-odhad', dlouhy: true });
  }


  // Přibližný tvar parcely (pro záložní plán, když se nenačte satelit)
  function polyFor(d) {
    var side = Math.sqrt(hasArea(d) ? d.area : 1500);
    var hLat = (side / 2) / 111320;
    var hLng = (side / 2) / (111320 * Math.cos(d.lat * Math.PI / 180));
    var seed = (d._id != null ? d._id : 0) + 1;
    function rnd(i) { var x = Math.sin(seed * 99.9 + i * 7.13) * 10000; return x - Math.floor(x); }
    var pts = [], n = 5;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2 + rnd(i + 20) * 0.4;
      var r = 0.7 + rnd(i) * 0.6;
      pts.push([d.lat + Math.sin(ang) * hLat * r, d.lng + Math.cos(ang) * hLng * r]);
    }
    return pts;
  }
  function planSvg(d, col, fx, fy) {
    var p = polyFor(d);
    var lats = p.map(function (x) { return x[0]; }), lngs = p.map(function (x) { return x[1]; });
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
    var midLat = (minLat + maxLat) / 2, midLng = (minLng + maxLng) / 2;
    var spanLat = (maxLat - minLat) || 1e-6, spanLng = (maxLng - minLng) || 1e-6;
    var sc = Math.min(78 / spanLng, 50 / spanLat);
    var cxT = Math.max(55, Math.min(265, fx * 320)), cyT = Math.max(45, Math.min(155, fy * 200));
    var pts = p.map(function (x) { return (cxT + (x[1] - midLng) * sc).toFixed(1) + ',' + (cyT - (x[0] - midLat) * sc).toFixed(1); }).join(' ');
    return '<svg class="opp-plan" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="pzbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1C2F26"/><stop offset="1" stop-color="#14231C"/></linearGradient></defs>' +
      '<rect width="320" height="200" fill="url(#pzbg)"/>' +
      '<g stroke="rgba(206,228,212,0.05)" stroke-width="1"><path d="M40 0V200M80 0V200M120 0V200M160 0V200M200 0V200M240 0V200M280 0V200"/><path d="M0 40H320M0 80H320M0 120H320M0 160H320"/></g>' +
      '</svg>';
  }
  /* Velký snímek nahoře. Skládání dlaždic a obrys rozsahu dělá js/snimek.js —
     tentýž kód používá i náhled na kartě, aby se ty dva obrázky nerozešly. */
  function heroLayers(d) {
    var col = TYPE[d.type].color;
    // Majitel nahrál skutečné fotky pozemku → listovací galerie (swipe na mobilu).
    if (d.photos && d.photos.length) {
      var shots = d.photos.map(function (p, i) {
        return '<img class="pz-shot" src="' + p + '" alt="Fotka pozemku ' + (i + 1) + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" decoding="async">';
      }).join('');
      var cnt = d.photos.length > 1 ? '<span class="opp-count">' + GALLERY_SVG + d.photos.length + '</span>' : '';
      return '<div class="pz-gallery">' + shots + '</div>' +
        '<span class="opp-mgrad"></span>' +
        '<span class="opp-badge ' + d.type + '">' + esc(TYPE[d.type].label) + '</span>' + cnt;
    }
    var S = global.PK_SNIMEK;
    return S.html(d, { sirka: 384, vyska: 256, barva: col, id: 'hero' }) +
      '<span class="opp-mgrad"></span>' +
      '<span class="opp-badge ' + d.type + '">' + esc(TYPE[d.type].label) + '</span>' +
      S.popis(d);
  }

  // Oblíbené (sdílené s hlavní aplikací přes stejný localStorage klíč)
  var FAV_KEY = 'pk_fav_v1';
  function favs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; } }
  function isFav(d) { return favs().indexOf(pkey(d)) !== -1; }
  function toggleFav(d) {
    var arr = favs(), k = pkey(d), i = arr.indexOf(k);
    if (i === -1) arr.push(k); else arr.splice(i, 1);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); } catch (e) {}
    return i === -1;
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.hidden = false; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); t.hidden = true; }, 2200);
  }

  var GALLERY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  var PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  var MAP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/></svg>';
  var CLOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var HEART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';
  var SHARE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>';

  // Cenový verdikt (světlá verze). Počítá ho společný model js/ceny.js —
  // tenhle soubor měl dřív vlastní kopii výpočtu a ta se s mapou rozešla.
  function pzVerdictHtml(d) {
    if (!MODEL || !hasArea(d) || !d.price) return '';
    /* Známý podíl dostane VLASTNÍ verdikt, ne mlčení. Bez něj by se
       stránka o ceně nezmínila vůbec a člověk by si nízkou cenu za metr
       přebral po svém — nejspíš jako výhodnou koupi. Přesně to web dřív
       říkal nahlas: „Levnější než 96 % podobných pozemků." */
    if (d.podil) {
      return '<div class="pz-verdict warn">' +
        '<div class="pv-top"><span class="pv-badge">Prodává se podíl</span><span class="pv-cmp">Cena za m²</span></div>' +
        '<div class="pv-text">Inzerát mluví o <b>spoluvlastnickém podílu' + (d.zlomek ? ' ' + esc(d.zlomek) : '') + '</b>. V ceně je pak jen ' +
        '<b>zlomek pozemku</b>, kdežto výměra je uvedená celá — cena za metr proto vychází nízká ' +
        'sama od sebe a s celými pozemky se srovnat nedá. <b>Velikost podílu</b> si ověřte ' +
        'v katastru a u zdroje.</div>' +
        '</div>' + odhadHtml(d);
    }
    if (MODEL.neduveryhodna(d)) {
      return '<div class="pz-verdict warn">' +
        '<div class="pv-top"><span class="pv-badge">Cena k ověření</span><span class="pv-cmp">Cena za m²</span></div>' +
        '<div class="pv-text">Cena za m² se <b>výrazně liší</b> od obvyklé u tohoto druhu pozemku. ' +
        'Často jde o <b>spoluvlastnický podíl</b>, nebo je na pozemku stavba — ověřte u zdroje ' +
        'a v katastru, co se přesně prodává.</div>' +
        '</div>' + odhadHtml(d);
    }
    var pc = MODEL.percentil(d);
    if (!pc) return odhadHtml(d);
    var pct = pc.pct;
    var typeWord = d.type === 'sale' ? 'v prodeji' : (d.type === 'drazba' ? 'v dražbě' : 'v nabídce');
    var cls, badge, text;
    if (pct <= 35) { cls = 'good'; badge = 'Výhodná cena'; text = 'Levnější než <b>' + pc.cheaper + ' %</b> podobných pozemků ' + typeWord + '.'; }
    else if (pct >= 65) { cls = 'bad'; badge = 'Vyšší cena'; text = 'Dražší než <b>' + pct + ' %</b> podobných pozemků ' + typeWord + '.'; }
    else { cls = 'mid'; badge = 'Průměrná cena'; text = 'Cena za m² je zhruba <b>uprostřed</b> podobných pozemků ' + typeWord + '.'; }
    return '<div class="pz-verdict ' + cls + '">' +
      '<div class="pv-top"><span class="pv-badge">' + badge + '</span><span class="pv-cmp">Cena za m²</span></div>' +
      '<div class="pv-text">' + text + '</div>' +
      '<div class="pv-track"><span class="pv-fill" style="--w:' + pct + '%"></span><span class="pv-dot" style="--w:' + pct + '%"></span></div>' +
      '<div class="pv-scale"><span>levné</span><span>drahé</span></div>' +
      '</div>' + odhadHtml(d);
  }
  // „Co byste měli vědět" (světlá verze). Obsah počítá společný rádce
  // js/radce.js — tenhle soubor tu měl TŘETÍ kopii těch rad.
  /* Kdy robot naposledy obešel zdroje. Po čtyřech dnech se to řekne
     důrazněji — stejná mez jako na úvodní stránce, ať si web neodporuje. */
  function ukazCasDat(updated) {
    var el = document.getElementById('pz-cas');
    if (!el) return;
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(updated || '');
    if (!m) return;
    var dnesStr = new Date().toISOString().slice(0, 10);
    var kdy = m[0] === dnesStr ? 'dnes' : (+m[3]) + '. ' + (+m[2]) + '. ' + m[1];
    var dni = Math.floor((Date.now() - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 86400000);
    el.innerHTML = 'Údaje jsou kopie ze zdroje, zkontrolováno <b>' + kdy + '</b>'
      + (isFinite(dni) && dni >= 4 ? ' — tedy před ' + dni + ' dny' : '')
      + '. Než se rozjedete, ověřte si u zdroje, že nabídka pořád platí.';
    if (isFinite(dni) && dni >= 4) el.classList.add('je-stara');
    el.hidden = false;
  }

  function pzGtkHtml(d) {
    if (!window.PK_RADCE) return '';
    return window.PK_RADCE.htmlSvetla(d, MODEL);
  }

  // Sítě, vybavení a přístup — ukáže se jen když to majitel vyplnil (u inzerátů
  // od lidí). U dat z veřejných zdrojů tyhle údaje nemáme, tak se sekce neukáže.
  var FEAT_ICON = {
    'Elektřina': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
    'Voda': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6 6 11a6 6 0 0 1-12 0c0-5 6-11 6-11z"/></svg>',
    'Kanalizace': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3C9.5 5.5 9.5 18.5 12 21"/></svg>',
    'Plyn': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 3 5 6 5 9a5 5 0 0 1-10 0c0-1 .5-2 1-3 .5 2 2 2 2 2 0-2 1-6 2-8z"/></svg>',
    'Oplocení': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l2-3 2 3v9H4zM10 10l2-3 2 3v9h-4zM16 10l2-3 2 3v9h-4zM2 13h20"/></svg>'
  };
  /* SMÍM TU STAVĚT? To je u pozemku ta nejdražší otázka — a Parcelka na ni
     odpovědět neumí: rozhoduje o tom územní plán obce a ten jako jedna
     vrstva pro celou republiku NEEXISTUJE. Každá obec s rozšířenou
     působností ho vydává zvlášť a ve vlastním formátu, takže se nedá ani
     stáhnout, ani přes mapu překrýt. Dělat, že to web umí, by byl další
     slib bez krytí.
     Co udělat jde: zkrátit odchod na jedno klepnutí. Tlačítko proto říká
     „NAJÍT územní plán" — hledá, neukazuje ho. Do dotazu jde obec i okres,
     protože stejných názvů obcí je v republice spousta. */
  function planHledatUrl(d) {
    // U některých záznamů je obec totožná s okresem — pak by se dotaz
    // zdvojil („Brno-venkov okres Brno-venkov").
    var obec = d.place || '';
    var okres = (d.okres && d.okres !== obec) ? ' okres ' + d.okres : '';
    var q = 'územní plán ' + obec + okres;
    return 'https://search.seznam.cz/?q=' + encodeURIComponent(q.trim());
  }
  /* U části záznamů je „místo" ve skutečnosti okres (zdroj nic bližšího
     neuvedl). Pak stálo u odkazu „najít územní plán obce Brno-venkov" —
     jenže Brno-venkov je okres a žádná taková obec není. Věta, která
     plete okres s obcí, podkopává důvěru ve všechno ostatní, co web
     o katastru tvrdí. */
  function planHledatText(d) {
    var obec = d.place || '';
    if (!obec) return 'najít územní plán';
    if (d.okres && obec === d.okres) return 'najít územní plán v okrese ' + obec;
    return 'najít územní plán obce ' + obec;
  }
  var ACCESS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l6-16M20 20l-6-16M9 12h6"/></svg>';
  /* ======================================================== MAPA S VRSTVAMI
     Detail pozemku měl nahoře nehybný letecký snímek a tím to končilo.
     Na otázku „smím tu stavět?" se ale obrázkem odpovědět nedá: člověk si
     musí umět položit územní plán PŘES ten pozemek, přepnout na hranice
     parcel a odjet o pár set metrů, jestli ta louka není v záplavě.
     Proto je tu skutečná mapa — a proto se zapíná až když se k ní člověk
     doroluje: nahoře na stránce je podstatná cena a termín, ne dlaždice.

     Obrys pozemku se tu nekreslí. Vlastní hranici neznáme (je v katastru)
     a vymyšlený pětiúhelník by se na letecké mapě od hranice parcely
     nedal odlišit — tutéž věc už jednou zvážil js/snimek.js a dopadlo to
     stejně. Kdo hranici chce, zapne si vrstvu „Hranice parcel", která ji
     má z katastru. */
  /* Adresy dlaždic drží js/snimek.js — tam, kde je i adresa nehybného
     snímku nad stránkou. Tady by to byla druhá kopie téhož. */
  var ZAKLADY = (global.PK_SNIMEK && global.PK_SNIMEK.podklady) || [];

  function pzMapaHtml(d) {
    if (!isFinite(d.lat) || !isFinite(d.lng)) return '';
    return '<h2 class="pz-sect-h">Pozemek na mapě</h2>' +
      '<div class="pzm" id="pzm">' +
        '<div class="pzm-mapa" id="pzm-mapa" role="application" aria-label="Mapa pozemku, kterou lze posouvat a přibližovat">' +
          /* NA CELOU OBRAZOVKU. Na telefonu je mapa vysoká 300 bodů —
             s vrstvou územního plánu přes letecký snímek se v takovém
             okénku nedá nic poznat. Zvětšení je rozdíl mezi hračkou
             a nástrojem, a stojí to jeden přepínač. */
          '<button type="button" class="pzm-cela-btn" id="pzm-cela" aria-label="Zvětšit mapu na celou obrazovku" title="Na celou obrazovku">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="pzm-panel">' +
          '<div class="pzm-zaklad" role="group" aria-label="Podklad mapy">' +
            ZAKLADY.map(function (z, i) {
              return '<button class="pzm-z' + (i === 0 ? ' on' : '') + '" type="button" data-zaklad="' + z.id +
                '" aria-pressed="' + (i === 0) + '">' + esc(z.nazev) + '</button>';
            }).join('') +
          '</div>' +
          /* Přepínače vrstev se dopisují, jak které služby odpovídají —
             proto aria-live: kdo nevidí, dozví se, že něco přibylo. */
          '<div class="pzm-vr" id="pzm-vr" aria-live="polite">' +
            '<span class="pzm-hleda"><span class="mnb-ceka" aria-hidden="true"></span>Zkouším mapové vrstvy úřadů…</span>' +
          '</div>' +
          '<label class="pzm-kryti" id="pzm-kryti" hidden>' +
            '<span>Průhlednost vrstvy</span>' +
            '<input type="range" id="pzm-kryti-r" min="20" max="100" step="5" value="65" aria-label="Průhlednost zapnuté vrstvy">' +
          '</label>' +
        '</div>' +
        '<p class="pzm-popis" id="pzm-popis" hidden></p>' +
        '<div class="pzm-leg" id="pzm-leg" hidden></div>' +
      '</div>' +
      /* Odkaz na plán obce zůstává i kdyby žádná vrstva nejela: územní plán
         vydává každá obec zvlášť a to, co je v celostátní vrstvě, nemusí být
         to, co platí na úřadě. Tohle je jediná věta na stránce, která se
         nesmí ztratit — proto stojí mimo mapu, ne v ní. */
      '<p class="pzm-pod">Vrstvy jsou náhled z veřejných služeb úřadů, ne potvrzení. Rozhoduje platný výkres na úřadě — ' +
        '<a href="' + esc(planHledatUrl(d)) + '" target="_blank" rel="noopener">' + esc(planHledatText(d)) + VEN + '</a>.</p>';
  }

  /** Zapne mapu v detailu. Bez Leafletu ukáže aspoň nehybný snímek. */
  function zapniMapu(d) {
    var obal = document.getElementById('pzm');
    if (!obal) return;
    var L = global.L;
    if (!L || !L.map) {
      /* Leaflet se nenačetl (blokovaný skript, offline). Prázdný rám by
         vypadal jako rozbitá stránka, tak tam dáme tentýž snímek jako
         nahoře — statický, ale poctivý. */
      obal.innerHTML = global.PK_SNIMEK
        ? global.PK_SNIMEK.html(d, { sirka: 640, vyska: 400, barva: TYPE[d.type].color, id: 'pzmfb' })
        : '';
      obal.classList.add('pzm-nahrada');
      return;
    }

    if (!ZAKLADY.length) { obal.hidden = true; return; }
    var z = global.PK_SNIMEK && global.PK_SNIMEK.priblizeni ? global.PK_SNIMEK.priblizeni(d, 640, 420) : 16;
    var m = L.map('pzm-mapa', {
      center: [d.lat, d.lng], zoom: Math.max(13, Math.min(18, z)),
      /* Kolečko myši se nezabírá hned: stránka je dlouhá a mapa uprostřed,
         která při rolování začne zoomovat, je past. Povolí se, až člověk
         do mapy klepne — tím dal najevo, že s ní pracuje. */
      scrollWheelZoom: false, zoomControl: true
    });
    m.on('click', function () { m.scrollWheelZoom.enable(); });
    global.PK_PZ_MAPA = m;

    // podklad
    var zaklad = null;
    function nastavZaklad(id) {
      var def = ZAKLADY.filter(function (x) { return x.id === id; })[0] || ZAKLADY[0];
      if (zaklad) m.removeLayer(zaklad);
      zaklad = L.tileLayer(def.url, { attribution: def.uvedeni, maxZoom: def.max }).addTo(m);
      zaklad.bringToBack();
      obal.querySelectorAll('.pzm-z').forEach(function (b) {
        var on = b.getAttribute('data-zaklad') === def.id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
    nastavZaklad(ZAKLADY[0].id);
    obal.querySelectorAll('.pzm-z').forEach(function (b) {
      b.addEventListener('click', function () { nastavZaklad(b.getAttribute('data-zaklad')); });
    });

    /* Měřítko není ozdoba: u pozemku je to jediné, z čeho se dá na mapě
       poznat, jestli je ta parcela jako zahrádka, nebo jako pole. */
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);

    // špendlík na bodu z dat
    L.marker([d.lat, d.lng], {
      keyboard: false,
      icon: L.divIcon({ className: 'pzm-pin', iconSize: [26, 34], iconAnchor: [13, 34],
        html: '<svg viewBox="-14 -36 28 38" width="26" height="34" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M0 0C-7 -12 -12 -18 -12 -25 A12 12 0 1 1 12 -25 C12 -18 7 -12 0 0Z" fill="' + TYPE[d.type].color +
          '" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><circle cx="0" cy="-25" r="4.6" fill="#fff"/></svg>' })
    }).addTo(m);

    // ——— vrstvy úřadů ———
    var vrstvy = document.getElementById('pzm-vr');
    var popis = document.getElementById('pzm-popis');
    var kryti = document.getElementById('pzm-kryti');
    var posuvnik = document.getElementById('pzm-kryti-r');
    var zive = {};          // id → Leaflet vrstva, jen ty zapnuté
    var pridano = 0;

    function prepocitejKryti() {
      var kolik = Object.keys(zive).length;
      if (kryti) kryti.hidden = kolik === 0;
      /* ZAPNUTÁ VRSTVA, KTEROU NENÍ VIDĚT. Katastr kreslí hranice parcel
         až od zoomu 16; nad tím je snímek prázdný. Přepínač přitom
         svítí, takže to vypadá, že vrstva nefunguje — a přesně tak to
         přišlo jako stížnost („a tady chybí rozdělení parcel"). Mapa se
         sama přiblíží ve chvíli zapnutí, ale kdo si pak oddálí, aby
         viděl okolí, spadne pod hranici znovu a nic mu to neřekne.
         Tak to řekneme — a dáme to na jedno klepnutí zpátky. */
      if (popis) {
        var texty = [], daleko = [];
        Object.keys(zive).forEach(function (k) {
          if (zive[k]._pkPopis) texty.push(zive[k]._pkPopis);
          var def = zive[k]._pkDef;
          if (def && def.odPriblizeni && m.getZoom() < def.odPriblizeni) daleko.push(def);
        });
        popis.textContent = texty.join(' ');
        popis.hidden = !texty.length && !daleko.length;
        if (daleko.length) {
          var jmena = daleko.map(function (x) { return x.nazev; });
          var potreba = Math.max.apply(null, daleko.map(function (x) { return x.odPriblizeni; }));
          var rada = document.createElement('span');
          rada.className = 'pzm-daleko';
          var veta = document.createElement('span');
          veta.textContent = (jmena.length === 1 ? jmena[0] + ' se' : jmena.join(' a ') + ' se')
            + ' v tomhle přiblížení nekreslí — úřady je vydávají až zblízka.';
          var tl = document.createElement('button');
          tl.type = 'button';
          tl.className = 'pzm-priblizit';
          tl.textContent = 'Přiblížit';
          tl.addEventListener('click', function () { m.setZoom(potreba); });
          rada.appendChild(veta);
          rada.appendChild(tl);
          popis.appendChild(rada);
        }
      }
      if (posuvnik) {
        var v = (+posuvnik.value || 65) / 100;
        Object.keys(zive).forEach(function (k) { zive[k].setOpacity(v); });
      }
    }
    if (posuvnik) posuvnik.addEventListener('input', prepocitejKryti);
    /* Bez tohohle by se hláška objevila jen ve chvíli zapnutí vrstvy.
       Oddálení je ale právě ten okamžik, kdy hranice zmizí. */
    m.on('zoomend', prepocitejKryti);

    /* VYSVĚTLIVKY. Zapnutý územní plán je bez klíče jen barevná skvrna.
       Obrázek vydává sama služba; když ho nevydá, nesmí zbýt prázdný
       rámeček s popiskem — zmizí celý, stejně jako mizí přepínač vrstvy,
       kterou se nepovedlo načíst. */
    var legendy = document.getElementById('pzm-leg');
    function prepocitejLegendy() {
      if (legendy) legendy.hidden = legendy.querySelectorAll('.pzm-leg-k:not([hidden])').length === 0;
    }
    function pridejLegendu(zapis) {
      if (!legendy || !global.PK_VRSTVY || !global.PK_VRSTVY.legendaAdresa) return;
      var url = global.PK_VRSTVY.legendaAdresa(zapis.sluzba);
      if (!url) return;
      var f = document.createElement('figure');
      f.className = 'pzm-leg-k';
      f.setAttribute('data-id', zapis.def.id);
      f.hidden = true;
      var pop = document.createElement('figcaption');
      pop.textContent = zapis.def.nazev;
      var img = document.createElement('img');
      img.alt = 'Vysvětlivky k vrstvě ' + zapis.def.nazev;
      img.onload = function () { f.hidden = false; prepocitejLegendy(); };
      img.onerror = function () { if (f.parentNode) f.parentNode.removeChild(f); prepocitejLegendy(); };
      f.appendChild(pop); f.appendChild(img);
      legendy.appendChild(f);
      img.src = url;
    }
    function odeberLegendu(id) {
      if (!legendy) return;
      var f = legendy.querySelector('.pzm-leg-k[data-id="' + id + '"]');
      if (f && f.parentNode) f.parentNode.removeChild(f);
      prepocitejLegendy();
    }

    function pridejPrepinac(zapis) {
      var def = zapis.def;
      if (!pridano++) vrstvy.innerHTML = '';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pzm-v';
      b.setAttribute('data-id', def.id);
      b.setAttribute('aria-pressed', 'false');
      b.textContent = def.nazev;
      b.addEventListener('click', prepni);
      function prepni() {
        if (zive[def.id]) {
          m.removeLayer(zive[def.id]);
          delete zive[def.id];
          b.classList.remove('on');
          b.setAttribute('aria-pressed', 'false');
          odeberLegendu(def.id);
        } else {
          var v = global.PK_VRSTVY.leafletVrstva(zapis, L);
          if (!v) return;
          v._pkPopis = def.popis || '';
          v._pkDef = def;
          if (posuvnik) v.setOpacity((+posuvnik.value || 65) / 100);
          v.addTo(m);
          zive[def.id] = v;
          b.classList.add('on');
          b.setAttribute('aria-pressed', 'true');
          /* Katastrální mapa se kreslí až od určitého přiblížení. Když se
             zapne z výšky, nestane se nic a vypadá to jako rozbité —
             tak se mapa přiblíží sama, aby bylo co vidět. */
          if (def.odPriblizeni && m.getZoom() < def.odPriblizeni) m.setZoom(def.odPriblizeni);
          pridejLegendu(zapis);
        }
        prepocitejKryti();
      }
      vrstvy.appendChild(b);
      /* HRANICE PARCEL SE ZAPNOU ROVNOU.
         Vlastní obrys pozemku v datech nemáme, takže po dojezdu na mapu
         stál uprostřed jen špendlík — a na otázku „kde přesně ten
         pozemek začíná a končí" neodpověděl. Hranice z katastru to
         řeknou, jenže dokud byly schované za přepínačem, většina lidí
         se k nim nedostala: nevědí, že je co zapnout.
         Zapíná se JEN tahle jediná vrstva. Územní plán ani záplavy
         přes snímek samy od sebe nepatří — ty si člověk vyžádá. */
      if (def.id === 'katastr' && !zive[def.id]) prepni();
    }

    if (global.PK_VRSTVY) {
      global.PK_VRSTVY.pripravene({ lat: d.lat, lng: d.lng }, pridejPrepinac).then(function (vse) {
        var mrtve = (vse && vse.mrtve) || [];
        if (!vse.length) {
          /* Nula vrstev. Mlčet by bylo horší než to říct: člověk by čekal
             přepínače, které nikdy nepřijdou. Věta říká, co se stalo, a ne
             že je něco s jeho pozemkem. */
          vrstvy.innerHTML = '<span class="pzm-nic">Vrstvy úřadů teď neodpovídají. Mapa i tak funguje; územní plán obce najdete odkazem pod mapou.</span>';
          return;
        }
        /* Něco jede, něco ne. Když se z pěti přepínačů ukáže jeden a nikde
           nestojí proč, vypadá nabídka náhodně — a člověk neví, jestli
           územní plán neumíme, nebo jestli se právě něco pokazilo. */
        if (mrtve.length) {
          var pozn = document.createElement('span');
          pozn.className = 'pzm-nic';
          /* Celá slova, ne lepení koncovky: „neodpovídá" + „jí" dalo
             „neodpovídájí". Čeština se koncovkami nedolepuje. */
          pozn.textContent = mrtve.length === 1
            ? 'Vrstva ' + mrtve[0] + ' teď neodpovídá — zkusíme to znovu, až sem přijdete příště.'
            : 'Vrstvy ' + mrtve.join(', ') + ' teď neodpovídají — zkusíme to znovu, až sem přijdete příště.';
          vrstvy.appendChild(pozn);
        }
      }).catch(function () {
        vrstvy.innerHTML = '';
      });
    } else {
      vrstvy.innerHTML = '';
    }

    /* VELIKOST MAPY. Jedno „invalidateSize" po 60 ms nestačí: na telefonu
       se výška mění ještě dlouho potom (načtou se písma, doskáče lišta
       prohlížeče, rozbalí se panel s přepínači). Leaflet si přitom
       velikost pamatuje z okamžiku, kdy vznikl — a pak kreslí dlaždice
       jen na část plochy a nahoře i dole zůstane pruh pozadí.
       Tentýž kámen úrazu jako u výběru místa na hlavní stránce, kde
       panel po otevření povyrostl a mapa o tom nevěděla. */
    function premer() { try { m.invalidateSize({ pan: false }); } catch (e) {} }

    /* Zvětšení na celou obrazovku. Velikost dotáhne premer() přes
       ResizeObserver, takže se tu o ni nikdo starat nemusí. */
    var celaBtn = document.getElementById('pzm-cela');
    function nastavCelou(zap) {
      obal.classList.toggle('pzm-cela-zap', zap);
      document.body.classList.toggle('pzm-cela-telo', zap);
      if (celaBtn) {
        celaBtn.setAttribute('aria-label', zap ? 'Zmenšit mapu zpět do stránky' : 'Zvětšit mapu na celou obrazovku');
        celaBtn.title = zap ? 'Zpět do stránky' : 'Na celou obrazovku';
      }
      setTimeout(premer, 60);
      setTimeout(premer, 320);
    }
    if (celaBtn) celaBtn.addEventListener('click', function () {
      nastavCelou(!obal.classList.contains('pzm-cela-zap'));
    });
    /* Escape zavírá. Bez toho je na počítači mapa přes celou obrazovku
       past: jediná cesta ven je trefit malé tlačítko v rohu. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && obal.classList.contains('pzm-cela-zap')) nastavCelou(false);
    });
    setTimeout(premer, 60);
    setTimeout(premer, 600);
    if (global.ResizeObserver) {
      try { new ResizeObserver(premer).observe(document.getElementById('pzm-mapa')); } catch (e) {}
    }
    global.addEventListener('resize', premer);
    global.addEventListener('orientationchange', function () { setTimeout(premer, 250); });
  }

  /* Mapová knihovna se na stránce pozemku načítá ODLOŽENĚ (defer): mapa je
     až dole a kvůli ní se nemá zdržovat cena nahoře. Jenže tenhle skript
     běží dřív, takže „L" ještě nemusí existovat — a na širokém monitoru se
     mapa dostane na dohled hned. Proto se na knihovnu krátce počká; když
     nedojede ani do šesti vteřin, ukáže se nehybný snímek. */
  function sLeafletem(hotovo) {
    if (global.L && global.L.map) return hotovo();
    var pokusy = 0;
    var t = setInterval(function () {
      if ((global.L && global.L.map) || ++pokusy > 60) { clearInterval(t); hotovo(); }
    }, 100);
  }

  /** Mapa se staví, až když je na dohled — nahoře na stránce je cena, ne dlaždice. */
  function pripravMapu(d) {
    var obal = document.getElementById('pzm');
    if (!obal) return;
    function ted() { sLeafletem(function () { zapniMapu(d); }); }
    if (!global.IntersectionObserver) { ted(); return; }
    var io = new IntersectionObserver(function (zaznamy) {
      if (!zaznamy.some(function (z) { return z.isIntersecting; })) return;
      io.disconnect();
      ted();
    }, { rootMargin: '300px 0px' });
    io.observe(obal);
  }

  function pzFeaturesHtml(d) {
    var feats = Array.isArray(d.features) ? d.features : [];
    var chips = feats.map(function (f) {
      return '<span class="pz-feat">' + (FEAT_ICON[f] || '') + esc(f) + '</span>';
    });
    if (d.access) chips.push('<span class="pz-feat pz-feat-acc">' + ACCESS_SVG + esc(d.access) + '</span>');
    if (!chips.length) return '';
    return '<h2 class="pz-sect-h">Sítě a vybavení</h2>' +
      '<div class="pz-feats">' + chips.join('') + '</div>';
  }

  function render(d) {
    var t = TYPE[d.type];
    /* Cena za metr, který kupující opravdu dostane. U spoluvlastnického
       podílu je v inzerátu výměra celé parcely, ale cena jen za zlomek —
       dělit celou výměrou znamená ukázat jako fakt číslo, které neplatí
       pro nikoho. Výpočet drží js/ceny.js, ať ho mapa i tahle stránka
       mají stejný; když velikost podílu neznáme, neukáže se nic. */
    var _zm = global.PK_CENY && global.PK_CENY.zaMetr ? global.PK_CENY.zaMetr(d) : null;
    var perM2 = _zm == null ? null : Math.round(_zm);
    var perM2Pozn = global.PK_CENY && global.PK_CENY.zaMetrPopis ? global.PK_CENY.zaMetrPopis(d) : '';
    var priceLabel = d.type === 'drazba' ? 'Vyvolávací cena' : (d.type === 'sale' || d.type === 'majitel' ? 'Cena' : 'Odhadní cena');
    var days = daysUntil(d.extra);
    // „Zobrazit na mapě" vede na SKUTEČNOU mapu (Mapy.cz letecká) na daném místě,
    // ne na naši tečkovanou mapu. Přesný obrys pozemku je pak přes „Katastr".
    var mapHref = 'https://mapy.cz/letecka?x=' + d.lng + '&y=' + d.lat + '&z=18&source=coor&id=' + d.lng + ',' + d.lat;
    var src = sourceLink(d);
    var favOn = isFav(d);

    var facts = [];
    facts.push({ k: 'Druh pozemku', v: esc(d.druh || '—') });
    /* U podílu je v inzerátu výměra CELÉ parcely — v řádku „Výměra" to
       musí být napsané, jinak si ji každý vydělí cenou za podíl. */
    facts.push({ k: 'Výměra', v: areaTxt(d) + (d.podil && hasArea(d) ? ' <i class="pz-pozn">celá parcela — kupuje se jen podíl</i>' : '') });
    if (perM2) facts.push({ k: 'Cena za m²', v: fmt(perM2) + ' Kč/m²' + (perM2Pozn ? ' <i class="pz-pozn">' + esc(perM2Pozn) + '</i>' : '') });
    if (hasParcel(d)) facts.push({ k: 'Parcela', v: 'č. ' + esc(d.parcel) });
    facts.push({ k: 'Kategorie', v: esc(t.label) });
    if (d.extra) facts.push({ k: 'Stav / zdroj', v: esc(zdrojText(d.extra)) });
    /* Co o pozemku říká samotný inzerát. Robot to z popisu čte už dávno
       (js/vybaveni.js) a web podle toho i filtruje — jenže nikde to
       nebylo VIDĚT. Člověk si tak zaškrtl „elektřina" a na stránce
       pozemku si to nemohl ověřit.
       Formulace musí zůstat opatrná: v popisu stojí „na hranici" stejně
       často jako „zavedeno", takže se tvrdí jen to, že to inzerát
       uvádí — ne že to na pozemku je. */
    if (d.site && d.site.length && window.PKVybaveni) {
      facts.push({ k: 'Inzerát uvádí', v: d.site.map(function (k) {
        return esc(window.PKVybaveni.nazev(k).toLowerCase());
      }).join(', ') });
    }
    /* Podíl je to nejdůležitější, co se o nabídce dá říct: kupuje se
       zlomek pozemku, ne pozemek. Bez toho vypadá cena za metr jako
       trhák. */
    if (d.podil) {
      facts.push({ k: 'Vlastnictví', v: d.zlomek
        ? 'inzerát mluví o spoluvlastnickém podílu <b>' + esc(d.zlomek) + '</b> — ověřte si ho v katastru'
        : 'inzerát mluví o spoluvlastnickém podílu — ověřte si velikost podílu v katastru' });
    }

    var html =
      '<div class="pz-media">' + heroLayers(d) + '</div>' +

      '<div class="pz-head">' +
        '<h1 class="pz-place">' + esc(d.place) + '</h1>' +
        (mistoRadek(d) ? '<div class="pz-okres">' + PIN_SVG + mistoRadek(d) + '</div>' : '') +
      '</div>' +

      '<div class="pz-priceblock">' +
        '<div class="pz-pl">' + priceLabel + '</div>' +
        '<div class="pz-price"><span class="pv">' + fmt(d.price) + ' Kč</span>' +
          (perM2 ? '<span class="pm"' + (perM2Pozn ? ' title="' + esc(perM2Pozn) + '"' : '') + '>' + fmt(perM2) + ' Kč/m²</span>' : '') + '</div>' +
      '</div>' +

      /* Po termínu se blok jen vynechával, takže stránka vypadala jako
         běžná nabídka a o tom, že dražba už proběhla, nepadlo slovo.
         Kdo sem přijde po starším odkazu, musí se to dozvědět hned. */
      (days == null ? ''
        : days >= 0
          ? '<div class="pz-term">' + CLOCK_SVG + 'Termín ' + countdownText(days) + '</div>'
          : '<div class="pz-term prosle">' + CLOCK_SVG + 'Dražba už proběhla — tahle nabídka je jen k nahlédnutí</div>') +

      '<div id="pz-verdict">' + pzVerdictHtml(d) + '</div>' +

      '<h2 class="pz-sect-h">Parametry pozemku</h2>' +
      '<div class="pz-specs">' +
        facts.map(function (f) { return '<div class="pz-spec"><span class="k">' + f.k + '</span><span class="v">' + f.v + '</span></div>'; }).join('') +
      '</div>' +

      pzFeaturesHtml(d) +

      pzMapaHtml(d) +

      '<div class="pz-cta">' +
        /* Tlačítka vedou pryč z webu a do nového okna. Vidět to jde podle
           šipky, slyšet ne — proto věta navíc jen pro odečítač obrazovky. */
        /* „Zobrazit na mapě" stálo hned pod NAŠÍ mapou — dvě věci se stejným
           slovem vedle sebe a u jedné se neví, kam vede. Tahle vede pryč
           z webu, tak ať je to na ní vidět, stejně jako u „Otevřít
           v katastru" o kus níž. */
        '<a class="pz-btn primary" href="' + mapHref + '" target="_blank" rel="noopener">' + MAP_SVG + 'Otevřít v Mapy.cz' + VEN + '</a>' +
        (d.type === 'majitel' ? '' : '<a class="pz-btn ghost" href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.label) + VEN + '</a>') +
      '</div>' +
      /* ZPOŽDĚNÍ DAT. Tohle na stránce chybělo úplně: člověk viděl cenu
         a termín, ale ne to, že se dívá na KOPII pořízenou někdy dřív.
         U dražby nebo exekuce je to rozdíl mezi „stihnu to" a marnou
         cestou. Datum je jediné, co se dá tvrdit poctivě — kdy robot
         naposledy obešel zdroje. Datum u JEDNOTLIVÉ nabídky se tvrdit
         nedá: pole „poprvé viděno" má sice každý záznam, jenže všech
         1 965 má tutéž hodnotu, protože se sloupec nastavil najednou.
         „V nabídce od" by tedy u všech lhalo stejně. */
      '<p class="pz-cas" id="pz-cas" hidden></p>' +

      /* VAROVÁNÍ U INZERÁTU OD MAJITELE — stejná věta jako na mapě
         (js/main.js). Stojí těsně před tlačítky, tedy u okamžiku, kdy
         se člověk chystá majiteli volat. */
      (d.type === 'majitel' ? '<p class="pz-pozor" role="note">Nikdy neposílejte zálohu ani rezervační poplatek předem. Nabídky od majitelů neověřujeme — vlastníka i parcelu si potvrďte v katastru a peníze posílejte až přes advokátní nebo notářskou úschovu.</p>' : '') +

      '<div class="pz-actions">' +
        '<a class="pz-abtn" href="' + katastrUrl(d) + '" target="_blank" rel="noopener">' + PIN_SVG + 'Otevřít v katastru' + VEN + '</a>' +
        '<button class="pz-abtn' + (favOn ? ' on' : '') + '" type="button" id="pz-fav">' + HEART_SVG + '<span>' + (favOn ? 'Uloženo' : 'Uložit') + '</span></button>' +
        '<button class="pz-abtn" type="button" id="pz-share">' + SHARE_SVG + 'Sdílet</button>' +
      '</div>' +

      '<h2 class="pz-sect-h">Co byste měli vědět</h2>' +
      pzGtkHtml(d);

    var host = document.getElementById('pz-detail');
    host.innerHTML = html;

    /* Mapa se staví až po vykreslení: potřebuje prvek v dokumentu a vlastní
       rozměr. Sama si pak počká, než se k ní člověk doroluje. */
    try { pripravMapu(d); } catch (e) {}

    // titulek stránky a vlastní adresa v kanonickém odkazu
    try { document.title = d.place + ' — ' + fmt(d.price) + ' Kč · Parcelka'; } catch (e) {}
    /* Kanonická adresa je VLASTNÍ stránka pozemku, ne obecná pozemek.html
       s dotazem. Sdílený odkaz tím vede tam, kde má každá nabídka svůj
       titulek, popis i náhled — přes „?p=…" viděl Facebook u všech 1 927
       nabídek totéž. Výpočet musí sedět s generátorem
       (scripts/generate-parcel-pages.mjs), proto je to týž obyčejný djb2. */
    try { nastavKanonickou('https://www.parcelaka.cz/' + souborPozemku(d)); } catch (e) {}

    // uložit
    var favBtn = document.getElementById('pz-fav');
    if (favBtn) favBtn.addEventListener('click', function () {
      var on = toggleFav(d);
      favBtn.classList.toggle('on', on);
      favBtn.querySelector('span').textContent = on ? 'Uloženo' : 'Uložit';
      toast(on ? 'Uloženo mezi oblíbené' : 'Odebráno z oblíbených');
    });
    // sdílet
    var shareBtn = document.getElementById('pz-share');
    if (shareBtn) shareBtn.addEventListener('click', function () {
      /* Sdílí se VLASTNÍ stránka pozemku, ne adresa, na které zrovna stojíme.
         Přes „?p=…" ukazoval náhled u všech nabídek totéž — a sdílení je
         přesně ta chvíle, kdy na náhledu záleží nejvíc. */
      var url = location.origin + '/' + souborPozemku(d);
      var title = 'Pozemek ' + d.place + ' — Parcelka';
      var text = t.label + ' · ' + d.place + ', okres ' + d.okres + ' · ' + areaTxt(d) + ' · ' + fmt(d.price) + ' Kč';
      if (navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); }
      else if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(function () { toast('Odkaz zkopírován'); }); }
      else { toast(url); }
    });
  }

  /* Adresa a indexování.
     Stránka detailu je jedna šablona pro všechny pozemky, rozlišená až
     parametrem ?p=. Kanonická adresa v HTML proto ukazuje na holou
     šablonu — jenže ta bez parametru vypíše „Pozemek nenalezen", takže
     vyhledávači se jako jediná nabízela prázdná stránka. Když pozemek
     najdeme, přepíšeme kanonickou adresu na tu jeho; když nenajdeme,
     řekneme vyhledávači, ať si tuhle stránku neukládá. */
  function nastavKanonickou(url) {
    var l = document.querySelector('link[rel="canonical"]');
    if (!l) { l = document.createElement('link'); l.setAttribute('rel', 'canonical'); document.head.appendChild(l); }
    l.setAttribute('href', url);
  }
  function neindexovat() {
    var m = document.querySelector('meta[name="robots"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'robots'); document.head.appendChild(m); }
    m.setAttribute('content', 'noindex,follow');
  }

  // I když pozemek nenajdeme, stránka musí mít hlavní nadpis. Bez něj neví,
  // kde je, ani čtečka pro nevidomé, ani vyhledávač — a je to přesně stav,
  // do kterého spadne každý starý odkaz na stažený inzerát.
  function renderEmpty() {
    document.title = 'Pozemek nenalezen — Parcelka';
    neindexovat();
    document.getElementById('pz-detail').innerHTML =
      '<div class="pz-empty"><h1>Pozemek nenalezen</h1>' +
      '<p>Tento pozemek se nepodařilo najít — možná už byl z nabídky stažen.</p>' +
      '<p><a href="index.html#mapa">Zpět na mapu a seznam pozemků</a></p></div>';
  }

  function kmBetween(la1, ln1, la2, ln2) {
    var R = 6371, r = Math.PI / 180;
    var dLat = (la2 - la1) * r, dLng = (ln2 - ln1) * r;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function findTarget(DATA) {
    var qs = location.search;
    var mp = /[?&]p=([^&]+)/.exec(qs);
    var ml = /[?&]ll=([^&]+)/.exec(qs);
    var key = null, ll = null;
    if (mp) { try { key = decodeURIComponent(mp[1]); } catch (e) {} }
    /* Vlastní stránka pozemku (pozemek-<okres>-<obec>-<otisk>.html) si klíč
       nenese v adrese — předá ho rovnou. Adresa má přednost, aby starší
       rozeslané odkazy „?p=…" fungovaly i tehdy, kdyby se na takové
       stránce otevřely. */
    if (key == null && window.PK_POZEMEK && window.PK_POZEMEK.k) {
      key = window.PK_POZEMEK.k;
      var lp = window.PK_POZEMEK.ll;
      if (!ml && lp && isFinite(lp[0])) ll = [lp[0], lp[1]];
    }
    if (ml) { try { var parts = decodeURIComponent(ml[1]).split(','); ll = [parseFloat(parts[0]), parseFloat(parts[1])]; } catch (e) {} }

    var cand = key != null ? DATA.filter(function (d) { return pkey(d) === key; }) : [];
    if (cand.length === 1) return cand[0];
    if (cand.length > 1 && ll && isFinite(ll[0])) {
      cand.sort(function (a, b) { return kmBetween(ll[0], ll[1], a.lat, a.lng) - kmBetween(ll[0], ll[1], b.lat, b.lng); });
      return cand[0];
    }
    if (cand.length > 1) return cand[0];
    // žádná shoda podle klíče — zkus nejbližší podle souřadnic (klíč se mohl mírně změnit)
    if (ll && isFinite(ll[0])) {
      var best = null, bestD = Infinity;
      DATA.forEach(function (d) { var dd = kmBetween(ll[0], ll[1], d.lat, d.lng); if (dd < bestD) { bestD = dd; best = d; } });
      if (best && bestD < 0.5) return best;
    }
    return null;
  }

  function loadJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function fillVerdict(d) {
    var el = document.getElementById('pz-verdict');
    if (el) el.innerHTML = pzVerdictHtml(d);
  }

  // 1) OKAMŽITĚ vykresli z předaného pozemku (sessionStorage) — bez čekání na data.
  var quick = null;
  try { quick = JSON.parse(sessionStorage.getItem('pk_open') || 'null'); } catch (e) {}
  // předaný pozemek použij jen když sedí na adresu (?p=), ať se neukáže špatný
  var mp = /[?&]p=([^&]+)/.exec(location.search);
  var wantKey = null; if (mp) { try { wantKey = decodeURIComponent(mp[1]); } catch (e) {} }
  var rendered = false;
  if (quick && quick.place && (wantKey == null || pkey(quick) === wantKey)) {
    quick._id = 0;
    render(quick);
    rendered = true;
  }

  // 2) Dotáhni celá data pro cenové srovnání (a jako záloha, když handoff chybí).
  loadJSON('data/opportunities.json').then(function (j) {
    var DATA = (j && (j.opportunities || j.items || (Array.isArray(j) ? j : []))) || [];
    DATA.forEach(function (d, i) { d._id = i; });
    buildIndex(DATA);
    var target = findTarget(DATA) || quick;
    if (target) {
      if (!rendered) render(target);
      fillVerdict(target);   // cenový verdikt teď máme z čeho spočítat
      // Až PO vykreslení — dřív ten odstavec na stránce ještě není.
      try { ukazCasDat(j && j.updated); } catch (e) {}
    } else if (!rendered) {
      renderEmpty();
    }
  });

  // mobilní menu
  var toggle = document.querySelector('.nav-toggle'), nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
    });
  }
})(window);
