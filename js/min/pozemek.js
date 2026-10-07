(function (global) {
  'use strict';

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
    obec:    { label: 'Obecní záměr', color: tokenBarva('--c-obec', '#12AEBE'), link: { label: 'Úřední deska obce',    url: 'https://www.uredni-deska.cz/' } },
    majitel: { label: 'Přímo od majitele',  color: tokenBarva('--c-majitel', '#8B4FE0'), link: { label: 'Ověřit v katastru',    url: 'https://www.ikatastr.cz/' } }
  };

  function fmt(n) { return (n == null ? '' : n.toString()).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); }
  function hasArea(d) { return typeof d.area === 'number' && d.area > 0; }
  function areaTxt(d) { return hasArea(d) ? fmt(d.area) + '\u00a0m²' : 'neuvedena'; }
  function hasParcel(d) { return d.parcel && d.parcel !== '—' && d.parcel !== ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function druhGroup(s) {
    return (window.PK_CENY && window.PK_CENY.druhGroup) ? window.PK_CENY.druhGroup(s) : 'Jiný pozemek';
  }

  var T = window.PK_TERMINY;
  function daysUntil(extra) { return T.daysUntil(extra); }
  function countdownText(days) { return T.countdownText(days); }
  function countdownClass(days) { return T.countdownClass(days); }
  function zdrojText(extra) { return T.zdrojText(extra); }

  var VEN = '<span class="visually-hidden"> — otevře se v novém okně mimo Parcelku</span>';

  var PK_DIAKR = { 'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o','ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z' };
  function pkSlug(s) {
    return String(s || '').toLowerCase().replace(/[áčďéěíňóřšťúůýž]/g, function (c) { return PK_DIAKR[c] || c; })
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function pkOtisk(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  var pkeyPlny = window.PKKlic.pkey;
  function souborPozemku(d) {
    return 'pozemek-' + pkSlug(d.okres) + '-' + pkSlug(d.place) + '-' + pkOtisk(pkeyPlny(d)) + '.html';
  }

  function mistoRadek(d) {
    var okr = d.okres ? 'okres ' + esc(d.okres) : '';
    if (d.cast) return esc(d.cast) + (okr ? ' · ' + okr : '');

    if (d.place && d.okres && String(d.place).trim() === String(d.okres).trim()) return '';
    return okr;
  }

  function vObciHtml() {
    var el = document.getElementById('pz-obec-data');
    if (!el) return '';
    var o = null;
    try { o = JSON.parse(el.textContent || 'null'); } catch (e) { return ''; }
    if (!o || typeof o.text !== 'string' || typeof o.url !== 'string') return '';
    return '<a href="' + esc(o.url) + '">' + esc(o.text) + '</a>';
  }
  function dalkyText() {
    var el = document.getElementById('pz-okoli-data');
    if (!el) return '';
    try { var t = JSON.parse(el.textContent || '""'); return typeof t === 'string' ? t : ''; }
    catch (e) { return ''; }
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

    if (d.type === 'exekuce' && typeof d.lat === 'number' && typeof d.lng === 'number') {
      return { url: katastrUrl(d), label: 'Ověřit v katastru' };
    }
    return { url: TYPE[d.type].link.url, label: TYPE[d.type].link.label };
  }

  function goodToKnowHtml(d) {
    if (!window.PK_RADCE) return '';
    return window.PK_RADCE.html(d, MODEL);
  }

  var MODEL = null;
  function buildIndex(DATA) {
    MODEL = (window.PK_CENY && window.PK_CENY.postav) ? window.PK_CENY.postav(DATA) : null;
  }

  function odhadHtml(d) {

    return window.PK_CENY.blokOdhadu(MODEL, d, { fmt: fmt, esc: esc, trida: ' pz-odhad', dlouhy: true });
  }

  function heroLayers(d) {
    var col = TYPE[d.type].color;

    if (d.photos && d.photos.length) {
      var shots = d.photos.map(function (p, i) {

        return '<img class="pz-shot" src="' + esc(p) + '" alt="Fotka pozemku ' + (i + 1) + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" decoding="async">';
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

  var FAV_KEY = 'pk_fav_v1';
  function favs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; } }

  function isFav(d) { return favs().indexOf(pkeyPlny(d)) !== -1; }
  function toggleFav(d) {
    var arr = favs(), k = pkeyPlny(d), i = arr.indexOf(k);
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

  var MESICE = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
    'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  function datumText(extra) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(extra || '');
    if (!m) return '';
    return (+m[3]) + '. ' + MESICE[(+m[2]) - 1] + ' ' + m[1];
  }
  function pzZmenaCenyHtml(d) {
    var Z = window.PKZlevneni;
    var z = Z ? Z.zmena(d) : null;
    if (!z) return '';
    return '<div class="pz-zmena' + (z.dolu ? ' dolu' : ' nahoru') + '">'
      + esc(Z.text(z)) + ' <span>' + esc(Z.popis(z, fmt)) + '</span></div>';
  }

  function pzDrazbaHtml(d, days) {
    if (d.type !== 'drazba' && d.type !== 'exekuce') return '';
    var kdy = datumText(d.extra);
    if (days == null && !kdy) return '';
    var prosle = days != null && days < 0;
    var blizko = days != null && days >= 0 && days <= 7;
    var slovo = d.type === 'exekuce' ? 'Nucená dražba' : 'Dražba';

    var hlava = prosle ? slovo + ' už proběhla'
      : (days === 0 ? slovo + ' je dnes'
        : (days === 1 ? slovo + ' je zítra'
          : slovo + ' za ' + days + ' ' + (days < 5 ? 'dny' : 'dní')));
    var cenaSlovo = d.type === 'drazba' ? 'Vyvolávací cena' : 'Odhadní cena';
    var deep = d.url && isDeepLink(d.url);
    return '<div class="pz-drazba' + (prosle ? ' prosle' : (blizko ? ' blizko' : '')) + '">' +
      '<div class="pzd-hlava">' + CLOCK_SVG + '<b>' + hlava + '</b>' +
        (kdy ? '<span class="pzd-kdy">' + kdy + '</span>' : '') + '</div>' +
      (prosle
        ? '<p class="pzd-pozn">Záznam tu zůstává kvůli historii. U dražebníka si ověřte, jestli se vydražilo, nebo bude další kolo.</p>'
        : '<p class="pzd-pozn">' +
            (d.price > 0 ? '<b>' + cenaSlovo + ' ' + fmt(d.price) + ' Kč.</b> ' : '') +
            '<b>Dražební jistotu</b> a závazné podmínky uvádí <b>dražební vyhláška</b> — tu v datech nemáme, ' +
            'přečtěte si ji u dražebníka. Jistota musí být připsaná <b>před zahájením</b>, ne v den dražby.</p>') +
      (deep ? '<a class="pzd-odkaz" href="' + esc(d.url) + '" target="_blank" rel="noopener">Podmínky u dražebníka' + VEN + '</a>' : '') +
      '</div>';
  }

  var CLOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var HEART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';
  var SHARE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>';

  function pzPopisInzerentaHtml() {
    var el = document.getElementById('pz-popis-data');
    if (!el) return '';
    var t = '';
    try { t = String(JSON.parse(el.textContent) || ''); } catch (e) { return ''; }
    t = t.trim();
    if (t.length < 60) return '';
    return '<h2 class="pz-sect-h">Co o pozemku píše inzerent</h2>'
      + '<p class="pz-popis-inzerent">' + esc(t) + '</p>';
  }

  function pzVerdictHtml(d) {
    if (!MODEL || !hasArea(d) || !d.price) return '';

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

    var kdeTxt = (window.PK_CENY && window.PK_CENY.kdeText && pc.uroven)
      ? ' ' + window.PK_CENY.kdeText(pc.uroven, pc.kde) : '';
    if (pct <= 35) { cls = 'good'; badge = 'Výhodná cena'; text = 'Levnější než <b>' + pc.cheaper + ' %</b> pozemků téhož druhu ' + typeWord + kdeTxt + '.'; }
    else if (pct >= 65) { cls = 'bad'; badge = 'Vyšší cena'; text = 'Dražší než <b>' + pct + ' %</b> pozemků téhož druhu ' + typeWord + kdeTxt + '.'; }
    else { cls = 'mid'; badge = 'Průměrná cena'; text = 'Cena za m² je zhruba <b>uprostřed</b> pozemků téhož druhu ' + typeWord + kdeTxt + '.'; }
    return '<div class="pz-verdict ' + cls + '">' +
      '<div class="pv-top"><span class="pv-badge">' + badge + '</span><span class="pv-cmp">Cena za m²</span></div>' +
      '<div class="pv-text">' + text + '</div>' +

      '<div class="pv-track"><span class="pv-stred"></span><span class="pv-dot" style="--w:' + pct + '%"></span></div>' +
      '<div class="pv-scale"><span>levné</span><span>drahé</span></div>' +
      '</div>' + odhadHtml(d);
  }

  function pzGtkKolik(d) {
    if (!window.PK_RADCE || !window.PK_RADCE.rady) return '';
    var n = 0;
    try { n = (window.PK_RADCE.rady(d, MODEL).radky || []).length; } catch (e) { n = 0; }
    if (!n) return '';

    return n + ' ' + (n === 1 ? 'věc' : (n < 5 ? 'věci' : 'věcí'));
  }

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

  var FEAT_ICON = {
    'Elektřina': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
    'Voda': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6 6 11a6 6 0 0 1-12 0c0-5 6-11 6-11z"/></svg>',
    'Kanalizace': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3C9.5 5.5 9.5 18.5 12 21"/></svg>',
    'Plyn': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 3 5 6 5 9a5 5 0 0 1-10 0c0-1 .5-2 1-3 .5 2 2 2 2 2 0-2 1-6 2-8z"/></svg>',
    'Oplocení': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l2-3 2 3v9H4zM10 10l2-3 2 3v9h-4zM16 10l2-3 2 3v9h-4zM2 13h20"/></svg>',

    'Příjezd': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21 9 3M20 21 15 3M12 6v2M12 11v2M12 16v2"/></svg>'
  };

  function planHledatUrl(d) {

    var obec = d.place || '';
    var okres = (d.okres && d.okres !== obec) ? ' okres ' + d.okres : '';
    var q = 'územní plán ' + obec + okres;
    return 'https://search.seznam.cz/?q=' + encodeURIComponent(q.trim());
  }

  function planHledatText(d) {
    var obec = d.place || '';
    if (!obec) return 'najít územní plán';
    if (d.okres && obec === d.okres) return 'najít územní plán v okrese ' + obec;
    return 'najít územní plán obce ' + obec;
  }
  var ACCESS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l6-16M20 20l-6-16M9 12h6"/></svg>';

  var ZAKLADY = (global.PK_SNIMEK && global.PK_SNIMEK.podklady) || [];

  function pzMapaHtml(d) {
    if (!isFinite(d.lat) || !isFinite(d.lng)) return '';
    return '<h2 class="pz-sect-h">Pozemek na mapě</h2>' +
      '<div class="pzm" id="pzm">' +
        '<div class="pzm-mapa" id="pzm-mapa" role="application" aria-label="Mapa pozemku, kterou lze posouvat a přibližovat">' +

          '<button type="button" class="pzm-cela-btn" id="pzm-cela" aria-label="Zvětšit mapu na celou obrazovku" title="Na celou obrazovku">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>' +
          '</button>' +

          '<button type="button" class="pzm-zpet-btn" id="pzm-zpet" hidden ' +
            'aria-label="Vrátit mapu na pozemek" title="Zpátky na pozemek">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
            '<span>Na pozemek</span>' +
          '</button>' +
        '</div>' +
        '<div class="pzm-panel">' +
          '<div class="pzm-zaklad" role="group" aria-label="Podklad mapy">' +
            ZAKLADY.map(function (z, i) {
              return '<button class="pzm-z' + (i === 0 ? ' on' : '') + '" type="button" data-zaklad="' + z.id +
                '" aria-pressed="' + (i === 0) + '">' + esc(z.nazev) + '</button>';
            }).join('') +
          '</div>' +

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

      '<p class="pzm-pod">Vrstvy jsou náhled z veřejných služeb úřadů, ne potvrzení. Rozhoduje platný výkres na úřadě — ' +
        '<a href="' + esc(planHledatUrl(d)) + '" target="_blank" rel="noopener">' + esc(planHledatText(d)) + VEN + '</a>.</p>';
  }

  function zapniMapu(d) {
    var obal = document.getElementById('pzm');
    if (!obal) return;

    if (obal._leaflet_id) return;
    var L = global.L;
    if (!L || !L.map) {

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

      scrollWheelZoom: false, zoomControl: false
    });
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Přiblížit', zoomOutTitle: 'Oddálit' }).addTo(m);
    m.on('click', function () { m.scrollWheelZoom.enable(); });
    global.PK_PZ_MAPA = m;

    var domaStred = L.latLng(d.lat, d.lng);
    var domaZoom = m.getZoom();
    var zpetBtn = document.getElementById('pzm-zpet');
    function hlidejZpet() {
      if (!zpetBtn) return;
      var vidim = m.getBounds().pad(-0.12).contains(domaStred);
      zpetBtn.hidden = vidim && Math.abs(m.getZoom() - domaZoom) < 1.5;
    }
    m.on('moveend zoomend', hlidejZpet);
    hlidejZpet();
    if (zpetBtn) {
      zpetBtn.addEventListener('click', function () {
        m.setView(domaStred, domaZoom, { animate: true });
        hlidejZpet();
      });
    }

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

    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);

    L.marker([d.lat, d.lng], {
      keyboard: false,
      icon: L.divIcon({ className: 'pzm-pin', iconSize: [26, 34], iconAnchor: [13, 34],
        html: '<svg viewBox="-14 -36 28 38" width="26" height="34" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M0 0C-7 -12 -12 -18 -12 -25 A12 12 0 1 1 12 -25 C12 -18 7 -12 0 0Z" fill="' + TYPE[d.type].color +
          '" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><circle cx="0" cy="-25" r="4.6" fill="#fff"/></svg>' })
    }).addTo(m);

    var vrstvy = document.getElementById('pzm-vr');
    var popis = document.getElementById('pzm-popis');
    var kryti = document.getElementById('pzm-kryti');
    var posuvnik = document.getElementById('pzm-kryti-r');
    var zive = {};
    var pridano = 0;

    function prepocitejKryti() {
      var kolik = Object.keys(zive).length;
      if (kryti) kryti.hidden = kolik === 0;

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

    m.on('zoomend', prepocitejKryti);

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

    function zjistiBonitu(zapis, vrstva) {
      var sluzby = (zapis.def && zapis.def.sluzby) || [];
      var i = 0;
      function dal() {
        if (i >= sluzby.length) { dopis('Bonitu se u tohohle bodu nepodařilo zjistit.'); return; }
        var u = global.PKBpej.dotazUrl(sluzby[i++], d.lat, d.lng);
        if (!u) { dal(); return; }

        fetch(u, { mode: 'cors', cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; })
          .then(function (t) {
            var o = global.PKBpej.precti(t);
            if (!o.kod && !o.trida) { dal(); return; }

            var v = [];
            if (o.kod) v.push('BPEJ na tomhle místě: ' + o.kod + '.');
            if (o.trida === 'I.' || o.trida === 'II.') {
              v.push('Třída ochrany ' + o.trida + ' — nejkvalitnější půda, vynětí ze'
                + ' zemědělského půdního fondu stát povoluje jen výjimečně.');
            } else if (o.trida) {
              v.push('Třída ochrany ' + o.trida + ' z pěti (I. je nejkvalitnější).');
            }
            dopis(v.join(' '));
          })
          .catch(function () { dal(); });
      }
      function dopis(veta) {
        if (!zive[zapis.def.id]) return;
        vrstva._pkPopis = (zapis.def.popis || '') + ' ' + veta;
        prepocitejKryti();
      }
      dal();
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

          if (def.odPriblizeni && m.getZoom() < def.odPriblizeni) m.setZoom(def.odPriblizeni);
          pridejLegendu(zapis);

          if (def.id === 'bpej' && global.PKBpej && typeof fetch === 'function'
              && typeof d.lat === 'number' && typeof d.lng === 'number') {
            zjistiBonitu(zapis, v);
          }
        }
        prepocitejKryti();
      }
      vrstvy.appendChild(b);

      if (def.id === 'katastr' && !zive[def.id]) prepni();
    }

    if (global.PK_VRSTVY) {
      global.PK_VRSTVY.pripravene({ lat: d.lat, lng: d.lng }, pridejPrepinac).then(function (vse) {
        var mrtve = (vse && vse.mrtve) || [];
        if (!vse.length) {

          vrstvy.innerHTML = '<span class="pzm-nic">Vrstvy úřadů teď neodpovídají. Mapa i tak funguje; územní plán obce najdete odkazem pod mapou.</span>';
          return;
        }

        if (mrtve.length) {
          var pozn = document.createElement('span');
          pozn.className = 'pzm-nic';

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

    function premer() { try { m.invalidateSize({ pan: false }); } catch (e) {} }

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

  var leafletSlib = null;
  function sLeafletem(hotovo) {
    if (global.L && global.L.map) return hotovo();
    if (!leafletSlib) {
      leafletSlib = new Promise(function (dej) {
        var zn = document.querySelector('meta[name="pk-leaflet"]');
        var adresa = (zn && zn.getAttribute('data-src')) || 'vendor/leaflet/leaflet.js';
        var s = document.createElement('script');
        s.src = adresa;
        s.onload = function () { dej(); };
        s.onerror = function () { dej(); };
        document.head.appendChild(s);
      });
    }
    leafletSlib.then(hotovo);
  }

  var mapaVerze = 0;
  function pripravMapu(d) {
    var moje = ++mapaVerze;
    var obal = document.getElementById('pzm');
    if (!obal) return;
    function ted() {
      sLeafletem(function () {
        if (moje !== mapaVerze) return;
        zapniMapu(d);
      });
    }
    if (!global.IntersectionObserver) { ted(); return; }
    var io = new IntersectionObserver(function (zaznamy) {
      if (moje !== mapaVerze) { io.disconnect(); return; }
      if (!zaznamy.some(function (z) { return z.isIntersecting; })) return;
      io.disconnect();
      ted();
    }, { rootMargin: '300px 0px' });
    io.observe(obal);
  }

  function pzPopisHtml(d) {
    var t = String(d.description == null ? '' : d.description).trim();
    if (!t) return '';
    var odstavce = t.split(/\n\s*\n|\n/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x; });
    if (!odstavce.length) return '';
    return '<h2 class="pz-sect-h">Co o pozemku píše majitel</h2>' +
      '<div class="pz-popis">' + odstavce.map(function (x) {
        return '<p>' + esc(x) + '</p>';
      }).join('') + '</div>';
  }

  function pzFeaturesHtml(d) {
    var jmena = (global.PKVybaveni && global.PKVybaveni.nazvy) ? global.PKVybaveni.nazvy(d)
      : (Array.isArray(d.features) ? d.features : []);
    var chips = jmena.map(function (f) {
      return '<span class="pz-feat">' + (FEAT_ICON[f] || '') + esc(f) + '</span>';
    });
    if (d.access) chips.push('<span class="pz-feat pz-feat-acc">' + ACCESS_SVG + esc(d.access) + '</span>');
    if (!chips.length) return '';
    var zTextu = Array.isArray(d.site) && d.site.length;
    return '<h2 class="pz-sect-h">Sítě a vybavení</h2>' +
      '<div class="pz-feats">' + chips.join('') + '</div>' +
      '<p class="pz-feat-zdroj">' + (zTextu
        ? 'Vyčteno z textu inzerátu, ne z úřední evidence — u zdroje si to ověřte.'
        : 'Uvádí majitel pozemku.') + '</p>';
  }

  function render(d) {
    var t = TYPE[d.type];

    var _zm = global.PK_CENY && global.PK_CENY.zaMetr ? global.PK_CENY.zaMetr(d) : null;
    var perM2 = _zm == null ? null : Math.round(_zm);
    var perM2Pozn = global.PK_CENY && global.PK_CENY.zaMetrPopis ? global.PK_CENY.zaMetrPopis(d) : '';
    var priceLabel = d.type === 'drazba' ? 'Vyvolávací cena' : (d.type === 'sale' || d.type === 'majitel' ? 'Cena' : 'Odhadní cena');
    var days = daysUntil(d.extra);

    var mapHref = 'https://mapy.cz/letecka?x=' + d.lng + '&y=' + d.lat + '&z=18&source=coor&id=' + d.lng + ',' + d.lat;

    var panoHref = 'https://mapy.cz/zakladni?x=' + d.lng + '&y=' + d.lat + '&z=18&pano=1&source=coor&id=' + d.lng + ',' + d.lat;
    var src = sourceLink(d);
    var favOn = isFav(d);

    var klice = [];

    klice.push({ k: 'Výměra', v: areaTxt(d),
      pozn: (d.podil && hasArea(d)) ? 'celá parcela — kupuje se jen podíl' : '' });
    if (perM2) klice.push({ k: 'Cena za m²', v: fmt(perM2) + ' Kč/m²', pozn: perM2Pozn || '' });
    klice.push({ k: 'Druh pozemku', v: esc(d.druh || '—'), pozn: '' });

    var facts = [];
    if (hasParcel(d)) facts.push({ k: 'Parcela', v: 'č. ' + esc(d.parcel) });

    if (isFinite(d.lat) && isFinite(d.lng)) {
      var sour = d.lat.toFixed(5) + ', ' + d.lng.toFixed(5);
      facts.push({ k: 'Souřadnice', v:
        '<span class="pz-sour">' +
          '<code id="pz-sour-text">' + esc(sour) + '</code>' +
          '<button type="button" class="pz-sour-kop" id="pz-sour-kop" data-sour="' + esc(sour) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="9" y="9" width="11" height="11" rx="2"/>' +
              '<path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>' +
            '<span>Kopírovat</span></button>' +
          '<a class="pz-sour-nav" id="pz-sour-nav" href="#" rel="nofollow">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M3 11l19-9-9 19-2-8-8-2Z"/></svg>' +
            '<span>Navigovat</span></a>' +
        '</span>' });
    }
    facts.push({ k: 'Kategorie', v: esc(t.label) });
    if (d.extra) facts.push({ k: 'Stav / zdroj', v: esc(zdrojText(d.extra)) });

    if (d.podil) {
      facts.push({ k: 'Vlastnictví', v: d.zlomek
        ? 'inzerát mluví o spoluvlastnickém podílu <b>' + esc(d.zlomek) + '</b> — ověřte si ho v katastru'
        : 'inzerát mluví o spoluvlastnickém podílu — ověřte si velikost podílu v katastru' });
    }

    var hlavniAkce = (d.type === 'majitel'
      ? (d._lid
          ? '<a class="pz-btn primary" href="zpravy.html?l=' + encodeURIComponent(d._lid)
            + '&new=1&p=' + encodeURIComponent(d.place || '')
            + '&ok=' + encodeURIComponent(d.okres || '') + '">Napsat majiteli</a>'
          : '') +
        (function () {
          var odkaz = PKCisteni.kontaktOdkaz(d.contact);
          if (!odkaz) return '';
          var tr = PKCisteni.jeEmail(d.contact) ? 'E-mail: ' : 'Telefon: ';
          return '<a class="pz-btn' + (d._lid ? ' ghost' : ' primary') + '" href="' + odkaz + '">'
            + tr + esc(d.contact) + '</a>';
        })()
      : '<a class="pz-btn primary" href="' + esc(src.url) + '" target="_blank" rel="noopener">'
        + esc(src.label) + VEN + '</a>');

    var html =
      '<div class="pz-media">' + heroLayers(d) + '</div>' +

      '<div class="pz-head">' +
        '<h1 class="pz-place">' + esc(d.place) + '</h1>' +
        (mistoRadek(d) ? '<div class="pz-okres">' + PIN_SVG + mistoRadek(d) + '</div>' : '') +
        (dalkyText() ? '<div class="pz-dalky">vzdušnou čarou: ' + esc(dalkyText()) + '</div>' : '') +
        (vObciHtml() ? '<div class="pz-vobci">' + vObciHtml() + '</div>' : '') +
      '</div>' +

      '<div class="pz-priceblock">' +
        '<div class="pz-pl">' + priceLabel + '</div>' +
        '<div class="pz-price"><span class="pv">' + fmt(d.price) + ' Kč</span>' +
          (perM2 ? '<span class="pm"' + (perM2Pozn ? ' title="' + esc(perM2Pozn) + '"' : '') + '>' + fmt(perM2) + ' Kč/m²</span>' : '') + '</div>' +

        pzZmenaCenyHtml(d) +
      '</div>' +

      pzDrazbaHtml(d, days) +

      '<div id="pz-verdict">' + pzVerdictHtml(d) + '</div>' +

      '<details class="pz-gtk-obal">' +
        '<summary class="pz-gtk-sum">' +
          '<h2 class="pz-sect-h">Co byste měli vědět</h2>' +
          '<span class="pz-gtk-kolik">' + pzGtkKolik(d) + '</span>' +
          '<span class="pz-gtk-akce"><span class="zav">Rozbalit</span><span class="otv">Skrýt</span></span>' +
        '</summary>' +
        pzGtkHtml(d) +
      '</details>' +

      '<div class="pz-akce-hlavni">' + hlavniAkce +
        '<button class="pz-btn ulozit' + (favOn ? ' on' : '') + '" type="button" id="pz-fav">'
          + HEART_SVG + '<span>' + (favOn ? 'Uloženo' : 'Uložit') + '</span></button>' +
      '</div>' +

      pzPopisInzerentaHtml() +

      '<h2 class="pz-sect-h">Parametry pozemku</h2>' +
      '<div class="pz-klice">' +
        klice.map(function (f) {
          return '<div class="pz-klic"><b>' + f.v + '</b><span>' + f.k + '</span>' +
            (f.pozn ? '<i>' + esc(f.pozn) + '</i>' : '') + '</div>';
        }).join('') +
      '</div>' +

      (facts.length
        ? '<div class="pz-specs">' +
            facts.map(function (f) { return '<div class="pz-spec"><span class="k">' + f.k + '</span><span class="v">' + f.v + '</span></div>'; }).join('') +
          '</div>'
        : '') +

      pzMapaHtml(d) +

      pzFeaturesHtml(d) +

      pzPopisHtml(d) +

      (d.price ? (function () {
        var c = encodeURIComponent(String(Math.round(d.price)));

        var q = ['cena=' + c];
        if (hasArea(d)) q.push('vymera=' + encodeURIComponent(String(Math.round(d.area))));
        if (d.druh) q.push('druh=' + encodeURIComponent(String(d.druh)));
        if (d.parcel && !/^[\s—-]*$/.test(String(d.parcel))) q.push('parcela=' + encodeURIComponent(String(d.parcel)));
        return '<p class="pz-naklady">'
          + '<a href="kolik-stoji-koupe-pozemku.html?cena=' + c + '">Kolik koupě stojí dohromady</a>'
          + ' · <a href="hypoteka-na-pozemek.html?cena=' + c + '">Spočítat splátku hypotéky</a>'
          + ' · <a href="kupni-smlouva-pozemek.html?' + q.join('&') + '">Podklad pro smlouvu</a>'
          + '</p>';
      }()) : '') +

      '<div class="pz-cta">' +

        '<a class="pz-btn ghost" href="' + mapHref + '" target="_blank" rel="noopener">' + MAP_SVG + 'Otevřít v Mapy.cz' + VEN + '</a>' +
        '<a class="pz-btn ghost" href="' + panoHref + '" target="_blank" rel="noopener" title="Otevře Mapy.cz na nejbližším panoramatu z ulice. Mimo obce nemusí být nasnímané.">' + MAP_SVG + 'Nejbližší panorama' + VEN + '</a>' +      '</div>' +

      '<section class="pz-pozn-box" aria-labelledby="pz-pozn-nadpis">' +
        '<div class="pz-pozn-hlava">' +
          '<h2 id="pz-pozn-nadpis">Moje poznámka</h2>' +
          '<span class="pz-pozn-stav" id="pz-pozn-stav" role="status" aria-live="polite"></span>' +
        '</div>' +
        '<textarea id="pz-pozn-text" class="pz-pozn-pole" rows="3" maxlength="2000" ' +
          'placeholder="Co jste tu viděli — příjezd, sousedi, co říkal majitel…" ' +
          'aria-describedby="pz-pozn-kde"></textarea>' +

        '<p class="pz-pozn-kde" id="pz-pozn-kde"></p>' +
      '</section>' +

      '<p class="pz-cas" id="pz-cas" hidden></p>' +

      (d.type === 'majitel' ? '<p class="pz-pozor" role="note">Nikdy neposílejte zálohu ani rezervační poplatek předem. Nabídky od majitelů neověřujeme — vlastníka i parcelu si potvrďte v katastru a peníze posílejte až přes advokátní nebo notářskou úschovu.</p>' : '') +

      '<div class="pz-actions">' +
        '<a class="pz-abtn" href="' + katastrUrl(d) + '" target="_blank" rel="noopener">' + PIN_SVG + 'Otevřít v katastru' + VEN + '</a>' +
        '<button class="pz-abtn" type="button" id="pz-share">' + SHARE_SVG + 'Sdílet</button>' +
      '</div>';

    var host = document.getElementById('pz-detail');
    host.innerHTML = html;
    try { zapisNaposledy(d); } catch (e) {}
    try { zapocitejZhlednuti(d); } catch (e) {}

    try { pripravMapu(d); } catch (e) {}

    try { document.title = d.place + ' — ' + fmt(d.price) + ' Kč · Parcelka'; } catch (e) {}

    try { nastavKanonickou('https://www.parcelaka.cz/' + vlastniAdresa(d)); } catch (e) {}

    var favBtn = document.getElementById('pz-fav');
    if (favBtn) favBtn.addEventListener('click', function () {
      var on = toggleFav(d);
      favBtn.classList.toggle('on', on);
      favBtn.querySelector('span').textContent = on ? 'Uloženo' : 'Uložit';
      toast(on ? 'Uloženo mezi oblíbené' : 'Odebráno z oblíbených');
    });

    var shareBtn = document.getElementById('pz-share');
    if (shareBtn) shareBtn.addEventListener('click', function () {

      var url = location.origin + '/' + vlastniAdresa(d);
      var title = 'Pozemek ' + d.place + ' — Parcelka';
      var text = t.label + ' · ' + d.place + ', okres ' + d.okres + ' · ' + areaTxt(d) + ' · ' + fmt(d.price) + '\u00a0Kč';
      if (navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); }
      else if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(function () { toast('Odkaz zkopírován'); }); }
      else { toast(url); }
    });

    var poznEl = document.getElementById('pz-pozn-text');
    if (poznEl && global.PKPoznamky) {
      var stavEl = document.getElementById('pz-pozn-stav');

      var kdeEl = document.getElementById('pz-pozn-kde');
      function rekniKde() {
        if (!kdeEl) return;
        if (global.PKPoznamky.prihlasen && global.PKPoznamky.prihlasen()) {
          kdeEl.innerHTML = 'Uloží se <b>k vašemu účtu</b>, takže ji uvidíte '
            + 'i na jiném telefonu a mezi uloženými pozemky. '
            + 'Čte ji jen váš účet — nikdo další, ani majitel pozemku.';
        } else {
          kdeEl.innerHTML = 'Zůstává <b>jen v tomhle prohlížeči</b>. '
            + 'Nikam se neodesílá, nevidíme ji ani my — a do jiného telefonu '
            + 'se nepřenese. Po přihlášení ji web uloží k účtu.';
        }
      }
      rekniKde();

      if (global.PKPoznamky.sync) {
        global.PKPoznamky.sync().then(function (n) {
          if (n == null) return;
          rekniKde();
          var zUctu = global.PKPoznamky.text(d);

          if (document.activeElement !== poznEl && zUctu && zUctu !== poznEl.value) {
            poznEl.value = zUctu;
            puvodni = zUctu;
          }
        }).catch(function () {});
      }
      poznEl.value = global.PKPoznamky.text(d);
      var puvodni = poznEl.value;
      var cas = null;
      function rekni(t, chyba) {
        if (!stavEl) return;
        stavEl.textContent = t;
        stavEl.classList.toggle('chyba', !!chyba);
      }
      if (puvodni) rekni('uloženo');
      function ulozTed() {
        var t = poznEl.value;
        if (t === puvodni) return;
        var ok = global.PKPoznamky.uloz(d, t);
        puvodni = t;

        rekni(ok ? (t.trim() ? 'uloženo' : 'smazáno')
          : 'nepovedlo se uložit — plná paměť prohlížeče', !ok);
      }

      poznEl.addEventListener('input', function () {
        rekni('…');
        clearTimeout(cas);
        cas = setTimeout(ulozTed, 600);
      });
      poznEl.addEventListener('blur', function () { clearTimeout(cas); ulozTed(); });
      window.addEventListener('pagehide', function () { clearTimeout(cas); ulozTed(); });
    }

    var sourKop = document.getElementById('pz-sour-kop');
    if (sourKop) sourKop.addEventListener('click', function () {
      var txt = sourKop.getAttribute('data-sour') || '';
      function hotovo() { toast('Souřadnice zkopírovány'); }

      function rucne() {
        try {
          var r = document.createRange();
          r.selectNodeContents(document.getElementById('pz-sour-text'));
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          toast('Souřadnice označeny — zkopírujte je');
        } catch (e) { toast(txt); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(hotovo).catch(rucne);
      } else { rucne(); }
    });
    var sourNav = document.getElementById('pz-sour-nav');
    if (sourNav) {

      var ua = navigator.userAgent || '';

      var la = d.lat.toFixed(5), ln = d.lng.toFixed(5);
      var cil;
      if (/Android/i.test(ua)) {
        cil = 'geo:' + la + ',' + ln + '?q=' + la + ',' + ln +
          '(' + encodeURIComponent(d.place || 'Pozemek') + ')';
      } else if (/iPhone|iPad|iPod/i.test(ua)) {
        cil = 'https://maps.apple.com/?ll=' + la + ',' + ln + '&q=' +
          encodeURIComponent(d.place || 'Pozemek');
      } else {
        cil = mapHref;
        sourNav.target = '_blank'; sourNav.rel = 'noopener nofollow';
      }
      sourNav.href = cil;
    }

    try { if (global.PKVideno) global.PKVideno.oznac(d); } catch (e) {}
  }

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

  function vlastniAdresa(d) {
    if (d && d.type === 'majitel') {
      return d._lid
        ? 'pozemek.html?l=' + encodeURIComponent(d._lid)
        : 'pozemek.html?p=' + encodeURIComponent(pkeyPlny(d)) + '&ll=' + d.lat + ',' + d.lng;
    }
    return souborPozemku(d);
  }

  function findTarget(DATA) {
    var qs = location.search;

    var mid = /[?&]l=([^&]+)/.exec(qs);
    if (mid) {
      var lid = null;
      try { lid = decodeURIComponent(mid[1]); } catch (e) {}
      if (lid) {
        var podle = DATA.filter(function (d) { return d._lid === lid; });
        if (podle.length) return { d: podle[0], presne: true };
      }
    }
    var mp = /[?&]p=([^&]+)/.exec(qs);
    var ml = /[?&]ll=([^&]+)/.exec(qs);
    var key = null, ll = null;
    if (mp) { try { key = decodeURIComponent(mp[1]); } catch (e) {} }

    var vym = null, cen = null;
    var mv = /[?&]v=(\d+)/.exec(qs);
    if (mv) vym = parseInt(mv[1], 10);
    var mc = /[?&]c=(\d+)/.exec(qs);
    if (mc) cen = parseInt(mc[1], 10);
    if (key == null && window.PK_POZEMEK && window.PK_POZEMEK.k) {
      key = window.PK_POZEMEK.k;
      var lp = window.PK_POZEMEK.ll;
      if (!ml && lp && isFinite(lp[0])) ll = [lp[0], lp[1]];
      if (vym == null && isFinite(window.PK_POZEMEK.v)) vym = window.PK_POZEMEK.v;
      if (cen == null && isFinite(window.PK_POZEMEK.c)) cen = window.PK_POZEMEK.c;
    }
    if (ml) { try { var parts = decodeURIComponent(ml[1]).split(','); ll = [parseFloat(parts[0]), parseFloat(parts[1])]; } catch (e) {} }

    var cand = key != null ? DATA.filter(function (d) { return pkeyPlny(d) === key; }) : [];
    if (key != null && !cand.length) {
      cand = DATA.filter(function (d) {
        return [d.place || '', d.parcel || '', d.okres || ''].join('|') === key;
      });
    }

    if (cand.length === 1) return { d: cand[0], presne: true };

    if (cand.length > 1 && vym != null) {
      var podleVymery = cand.filter(function (d) { return Math.round(d.area || 0) === Math.round(vym); });
      if (podleVymery.length > 1 && cen != null) {
        var presneji = podleVymery.filter(function (d) { return Math.round(d.price || 0) === Math.round(cen); });
        if (presneji.length) podleVymery = presneji;
      }
      if (podleVymery.length) return { d: podleVymery[0], presne: true };
    }
    if (cand.length > 1 && ll && isFinite(ll[0])) {
      cand.sort(function (a, b) { return kmBetween(ll[0], ll[1], a.lat, a.lng) - kmBetween(ll[0], ll[1], b.lat, b.lng); });
      return { d: cand[0], presne: true };
    }
    if (cand.length > 1) return { d: cand[0], presne: true };

    if (ll && isFinite(ll[0])) {
      var best = null, bestD = Infinity;
      DATA.forEach(function (d) { var dd = kmBetween(ll[0], ll[1], d.lat, d.lng); if (dd < bestD) { bestD = dd; best = d; } });
      if (best && bestD < 0.5) return { d: best, presne: false };
    }
    return null;
  }

  function loadJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  var KLIC_NAPOSLEDY = 'pk_recent_v1';
  function zapisNaposledy(d) {
    if (!d || !d.place) return;

    var k = pkeyPlny(d);
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem(KLIC_NAPOSLEDY) || '[]') || []; } catch (e) {}
    if (!Array.isArray(arr)) arr = [];
    arr = arr.filter(function (x) { return x !== k; });
    arr.unshift(k);
    try { localStorage.setItem(KLIC_NAPOSLEDY, JSON.stringify(arr.slice(0, 8))); } catch (e) {}
  }

  var KLIC_ZHLEDNUTI = 'pk_videno_v1';
  function zapocitejZhlednuti(d) {
    if (!d || d.type !== 'majitel' || !d._lid) return;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { posliZhlednuti(d); }, { once: true });
    } else {
      posliZhlednuti(d);
    }
  }
  function posliZhlednuti(d) {
    if (!(global.PKAuth && global.PKAuth.ready && global.PKAuth.rpc)) return;
    var videne = {};
    try { videne = JSON.parse(sessionStorage.getItem(KLIC_ZHLEDNUTI) || '{}') || {}; } catch (e) {}
    if (videne[d._lid]) return;

    videne[d._lid] = 1;
    try { sessionStorage.setItem(KLIC_ZHLEDNUTI, JSON.stringify(videne)); } catch (e) {}
    try { global.PKAuth.rpc('bump_view', { p_id: d._lid }, false); } catch (e) {}
  }

  function fillVerdict(d) {
    var el = document.getElementById('pz-verdict');
    if (el) el.innerHTML = pzVerdictHtml(d);
  }

  var quick = null;

  try { quick = PKCisteni.pozemek(JSON.parse(sessionStorage.getItem('pk_open') || 'null')); } catch (e) {}

  var mp = /[?&]p=([^&]+)/.exec(location.search);
  var wantKey = null; if (mp) { try { wantKey = decodeURIComponent(mp[1]); } catch (e) {} }
  var rendered = false;

  function sediNaAdresu(d, chtenyKlic) {
    if (chtenyKlic == null) return true;
    return pkeyPlny(d) === chtenyKlic
      || [d.place || '', d.parcel || '', d.okres || ''].join('|') === chtenyKlic;
  }
  if (quick && quick.place && sediNaAdresu(quick, wantKey)) {
    quick._id = 0;
    render(quick);
    rendered = true;
  }

  var pozdeji = null, cekajici = null;
  function ziveInzeraty() {
    return new Promise(function (hotovo) {
      var poslano = false;
      function dej(v) {
        if (poslano) {

          if (v && v.length) { if (pozdeji) pozdeji(v); else cekajici = v; }
          return;
        }
        poslano = true;
        hotovo(v);
      }

      var cas = setTimeout(function () { dej([]); }, 2500);
      function zkus() {
        var A = global.PKAuth;
        if (!(A && A.ready && A.rpc)) { clearTimeout(cas); return dej([]); }
        A.rpc('public_listings', {}, false).then(function (res) {
          clearTimeout(cas);
          dej(res && res.ok && Array.isArray(res.data) ? PKCisteni.majitele(res.data) : []);
        }, function () { clearTimeout(cas); dej([]); });
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', zkus, { once: true });
      else zkus();
    });
  }

  function zpracuj(j, zive, jenPresne, radkyModelu) {

    var DATA = PKCisteni.pozemky((j && (j.opportunities || j.items || (Array.isArray(j) ? j : []))) || []);

    if (zive && zive.length) DATA = DATA.concat(zive);
    DATA.forEach(function (d, i) { d._id = i; });

    var PROMODEL = DATA;
    if (radkyModelu) {

      PROMODEL = radkyModelu;
    } else if (window.PKHlidani && window.PKHlidani.bezDuplicit) {
      PROMODEL = window.PKHlidani.bezDuplicit(DATA);
    } else {

      console.error('js/pozemek.js: chybí PKHlidani.bezDuplicit — cenový model by se '
        + 'rozešel s mapou (model z ' + DATA.length + ' nabídek včetně duplicit)');
    }
    buildIndex(PROMODEL);

    var hledaci = DATA;
    if (window.PKHlidani && window.PKHlidani.bezDuplicit) {
      var bez = window.PKHlidani.bezDuplicit(DATA);

      bez.forEach(function (d) { try { d.__vbez = true; } catch (e) {} });
      hledaci = bez.concat(DATA.filter(function (d) { return !d.__vbez; }));
      bez.forEach(function (d) { try { delete d.__vbez; } catch (e) {} });
    }
    var nalez = findTarget(hledaci);

    if (jenPresne && !(nalez && nalez.presne)) return false;
    var target = quick;
    if (nalez && (nalez.presne || !rendered)) target = nalez.d;
    if (target) {
      if (!rendered || target !== quick) render(target);
      fillVerdict(target);

      try { ukazCasDat(j && j.updated); } catch (e) {}
    } else if (!rendered) {
      renderEmpty();
    }
    return !!(nalez && nalez.presne);
  }

  var zivePrislib = ziveInzeraty();

  function plnaData() {
    loadJSON('data/opportunities.json').then(function (j) {
      var sedlo = zpracuj(j, [], true);
      zivePrislib.then(function (zive) {
        if (!sedlo || zive.length) zpracuj(j, zive, false);

        pozdeji = function (z) { zpracuj(j, z, false); };
        if (cekajici) { var z = cekajici; cekajici = null; pozdeji(z); }
      });
    });
  }

  var REZ = (window.PK_POZEMEK && window.PK_POZEMEK.r) || null;
  if (!REZ) {

    plnaData();
  } else {
    Promise.all([loadJSON(REZ), loadJSON('data/model.json')]).then(function (r) {
      var jRez = r[0];
      var radky = (r[1] && window.PK_CENY && window.PK_CENY.rozbalModel)
        ? window.PK_CENY.rozbalModel(r[1]) : null;
      if (!jRez || !radky) { plnaData(); return; }
      var sedlo = zpracuj(jRez, [], true, radky);
      zivePrislib.then(function (zive) {
        if (zive && zive.length) { plnaData(); return; }
        if (!sedlo) zpracuj(jRez, [], false, radky);
        pozdeji = function (z) {
          if (z && z.length) plnaData();
          else zpracuj(jRez, [], false, radky);
        };
        if (cekajici) { var z = cekajici; cekajici = null; pozdeji(z); }
      });
    });
  }

})(window);
