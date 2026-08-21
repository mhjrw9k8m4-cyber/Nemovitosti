/* Samostatná stránka inzerátu pozemku (pozemek.html).
   Načte data, najde pozemek podle ?p=<klíč>&ll=<lat>,<lng> a vykreslí detail.
   Pomocné funkce jsou záměrně zrcadlené z js/main.js, aby stránka fungovala
   nezávisle na mapové aplikaci. */
(function () {
  'use strict';

  var TYPE = {
    sale:    { label: 'Na prodej',    color: '#4BA97D', link: { label: 'Nabídka SPÚ',          url: 'https://spu.gov.cz/nabidky' } },
    drazba:  { label: 'Dražba',       color: '#D8AC5E', link: { label: 'Detail dražby',       url: 'https://www.portaldrazeb.cz/' } },
    exekuce: { label: 'Exekuce',      color: '#D66F59', link: { label: 'Insolvenční rejstřík', url: 'https://isir.justice.cz/isir/common/index.do' } },
    obec:    { label: 'Obecní záměr', color: '#6E95D0', link: { label: 'Úřední deska obce',    url: 'https://www.uredni-deska.cz/' } },
    majitel: { label: 'Od majitele',  color: '#8E6FB8', link: { label: 'Ověřit v katastru',    url: 'https://www.ikatastr.cz/' } }
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

  function daysUntil(extra) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(extra || '');
    if (!m) return null;
    var target = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(target)) return null;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((target - now) / 86400000);
  }
  function countdownText(days) {
    if (days < 0) return 'proběhlo';
    if (days === 0) return 'dnes';
    if (days === 1) return 'zítra';
    if (days <= 6) return 'za ' + days + (days <= 4 ? ' dny' : ' dní');
    if (days <= 13) return 'za týden';
    if (days <= 27) return 'za ' + Math.round(days / 7) + ' týdny';
    return 'za ' + Math.round(days / 30) + ' měs.';
  }
  function countdownClass(days) {
    if (days == null || days < 0) return '';
    if (days <= 7) return ' urg';
    if (days <= 30) return ' soon';
    return '';
  }

  function pkey(d) { return [d.place || '', d.parcel || '', d.okres || ''].join('|'); }
  function katastrUrl(d) { return 'https://www.ikatastr.cz/#info=' + d.lat + ',' + d.lng; }
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
    return { url: TYPE[d.type].link.url, label: TYPE[d.type].link.label };
  }

  // „Co byste měli vědět"
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
    return '<details class="md-gtk" open>' +
      '<summary>' + GTK_INFO_SVG + '<span>Co byste měli vědět</span><span class="gtk-hint">stavba · na co pozor</span></summary>' +
      '<div class="gtk-body">' +
        '<div class="gtk-row gtk-' + b.lvl + '"><span class="gtk-k">Dá se tu stavět?</span><span class="gtk-v">' + b.txt + '</span></div>' +
        '<div class="gtk-row gtk-warn"><span class="gtk-k">Na co si dát pozor</span><span class="gtk-v">' + c + '</span></div>' +
        '<p class="gtk-foot">Obecné informace, ne právní rada ke konkrétní parcele. Vždy ověřte na úřadě a v katastru.</p>' +
      '</div>' +
    '</details>';
  }

  // Cenový verdikt (percentil Kč/m² vůči podobným) — potřebuje index z celých dat.
  var perM2Index = {};
  function buildIndex(DATA) {
    perM2Index = {};
    DATA.forEach(function (d) {
      if (hasArea(d) && d.price) {
        var k = d.type + '|' + druhGroup(d.druh);
        (perM2Index[k] = perM2Index[k] || []).push(d.price / d.area);
      }
    });
    Object.keys(perM2Index).forEach(function (k) { perM2Index[k].sort(function (a, b) { return a - b; }); });
  }
  function priceBarHtml(d) {
    if (!hasArea(d) || !d.price) return '';
    var arr = perM2Index[d.type + '|' + druhGroup(d.druh)];
    if (!arr || arr.length < 8) return '';
    if (arr[arr.length - 1] <= arr[0] * 1.15) return '';
    var val = d.price / d.area, below = 0;
    for (var i = 0; i < arr.length; i++) { if (arr[i] <= val) below++; }
    var pct = Math.max(2, Math.min(98, Math.round(below / arr.length * 100)));
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
      '<defs><linearGradient id="pzbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2e3e"/><stop offset="1" stop-color="#141f2b"/></linearGradient></defs>' +
      '<rect width="320" height="200" fill="url(#pzbg)"/>' +
      '<g stroke="rgba(200,216,232,0.05)" stroke-width="1"><path d="M40 0V200M80 0V200M120 0V200M160 0V200M200 0V200M240 0V200M280 0V200"/><path d="M0 40H320M0 80H320M0 120H320M0 160H320"/></g>' +
      '<polygon points="' + pts + '" fill="' + col + '" fill-opacity="0.22" stroke="' + col + '" stroke-width="2.4" stroke-linejoin="round"/>' +
      '</svg>';
  }
  // Letecký snímek (větší, pro hero). z=16 stejně jako v seznamu (spolehlivější dlaždice).
  function heroLayers(d) {
    var col = TYPE[d.type].color;
    var z = 16, n = Math.pow(2, z);
    var latRad = d.lat * Math.PI / 180;
    var xf = (d.lng + 180) / 360 * n;
    var yf = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    var xt = Math.floor(xf), yt = Math.floor(yf);
    var fx = xf - xt, fy = yf - yt;
    var fxp = (fx * 100).toFixed(1), fyp = (fy * 100).toFixed(1);
    var sat = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + yt + '/' + xt;
    return planSvg(d, col, fx, fy) +
      '<img class="opp-map" alt="Letecký snímek pozemku" src="' + sat + '" onerror="this.style.display=\'none\'" style="object-position:' + fxp + '% ' + fyp + '%">' +
      '<span class="opp-mgrad"></span>' +
      '<span class="opp-badge ' + d.type + '">' + esc(TYPE[d.type].label) + '</span>' +
      '<span class="opp-pin" style="left:' + fxp + '%;top:' + fyp + '%;background:' + col + '"></span>';
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

  var PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  var MAP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/></svg>';

  function render(d) {
    var t = TYPE[d.type];
    var perM2 = hasArea(d) ? Math.round(d.price / d.area) : null;
    var priceLabel = d.type === 'drazba' ? 'Vyvolávací cena' : (d.type === 'sale' || d.type === 'majitel' ? 'Cena' : 'Odhadní cena');
    var days = daysUntil(d.extra);
    var mapHref = 'index.html?p=' + encodeURIComponent(pkey(d)) + '#mapa';
    var src = sourceLink(d);
    var favOn = isFav(d);

    var facts = [];
    facts.push({ k: 'Druh pozemku', v: esc(d.druh || '—') });
    facts.push({ k: 'Výměra', v: areaTxt(d) });
    if (perM2) facts.push({ k: 'Cena za m²', v: fmt(perM2) + ' Kč/m²' });
    if (hasParcel(d)) facts.push({ k: 'Parcela', v: 'č. ' + esc(d.parcel) });
    facts.push({ k: 'Kategorie', v: esc(t.label) });
    if (d.extra) facts.push({ k: 'Stav / zdroj', v: esc(d.extra) });

    var html =
      '<div class="pz-media" id="pz-media" role="button" tabindex="0" aria-label="Zobrazit na mapě">' +
        heroLayers(d) +
        '<span class="pz-maphint">' + MAP_SVG + 'Zobrazit na mapě</span>' +
      '</div>' +

      '<div class="pz-head">' +
        '<h1 class="pz-place">' + esc(d.place) + '</h1>' +
        (d.okres ? '<div class="pz-okres">' + PIN_SVG + 'okres ' + esc(d.okres) + '</div>' : '') +
      '</div>' +

      '<div class="pz-price">' +
        '<span class="pl">' + priceLabel + '</span>' +
        '<span class="pv">' + fmt(d.price) + ' Kč</span>' +
        (perM2 ? '<span class="pm">' + fmt(perM2) + ' Kč/m²</span>' : '') +
      '</div>' +

      (days != null && days >= 0 ? '<div style="margin:6px 0 2px"><span class="md-cd' + countdownClass(days) + '">Termín ' + countdownText(days) + '</span></div>' : '') +

      '<div id="pz-verdict">' + priceBarHtml(d) + '</div>' +

      '<div class="pz-sect-h">Parametry pozemku</div>' +
      '<div class="pz-specs">' +
        facts.map(function (f) { return '<div class="pz-spec"><span class="k">' + f.k + '</span><span class="v">' + f.v + '</span></div>'; }).join('') +
      '</div>' +

      '<div class="pz-cta">' +
        '<a class="btn-primary btn-glow" href="' + mapHref + '">' + MAP_SVG + ' Zobrazit na mapě</a>' +
        (d.type === 'majitel' ? '' : '<a class="btn-primary" style="background:var(--ink-soft2);color:var(--text-ondark);box-shadow:none;border:1px solid var(--line)" href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.label) + ' →</a>') +
      '</div>' +

      '<div class="pz-actions">' +
        '<a class="lp-btn" href="' + katastrUrl(d) + '" target="_blank" rel="noopener">Katastr</a>' +
        '<a class="lp-btn" href="' + mapyUrl(d) + '" target="_blank" rel="noopener">Mapy.cz</a>' +
        '<button class="lp-btn lp-fav' + (favOn ? ' on' : '') + '" type="button" id="pz-fav"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg><span>' + (favOn ? 'Uloženo' : 'Uložit') + '</span></button>' +
        '<button class="lp-btn" type="button" id="pz-share">Sdílet</button>' +
      '</div>' +

      '<div class="pz-sect-h">Informace k pozemku</div>' +
      goodToKnowHtml(d);

    var host = document.getElementById('pz-detail');
    host.innerHTML = html;

    // titulek stránky
    try { document.title = d.place + ' — ' + fmt(d.price) + ' Kč · Parcelka'; } catch (e) {}

    // klik na snímek → mapa
    var media = document.getElementById('pz-media');
    if (media) {
      media.addEventListener('click', function () { location.href = mapHref; });
      media.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.href = mapHref; } });
    }
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
      var url = location.origin + location.pathname + '?p=' + encodeURIComponent(pkey(d)) + '&ll=' + d.lat + ',' + d.lng;
      var title = 'Pozemek ' + d.place + ' — Parcelka';
      var text = t.label + ' · ' + d.place + ', okres ' + d.okres + ' · ' + areaTxt(d) + ' · ' + fmt(d.price) + ' Kč';
      if (navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); }
      else if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(function () { toast('Odkaz zkopírován'); }); }
      else { toast(url); }
    });
  }

  function renderEmpty() {
    document.getElementById('pz-detail').innerHTML =
      '<div class="pz-empty"><p>Tento pozemek se nepodařilo najít — možná už byl z nabídky stažen.</p><p><a href="index.html#mapa">Zpět na mapu a seznam pozemků</a></p></div>';
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
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function fillVerdict(d) {
    var el = document.getElementById('pz-verdict');
    if (el) el.innerHTML = priceBarHtml(d);
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
})();
