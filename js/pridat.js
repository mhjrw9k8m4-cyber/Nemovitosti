/* Sdílený skript pro stránky „Přidat pozemek na prodej" (pridat.html)
   a „Inzerce" (inzerce.html). Každá stránka má jeden formulář; skript
   napojí ten, který na stránce je. Samostatné od main.js — mapy hlavní
   stránky se vůbec nedotýká. */
(function () {
  'use strict';

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
        nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Toast ---------- */
  var toastEl = document.getElementById('toast');
  var toastT = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.removeAttribute('hidden');
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); setTimeout(function () { toastEl.setAttribute('hidden', ''); }, 300); }, 3200);
  }

  /* ---------- Odeslání (bez serveru, přes Formspree) ----------
     Cíl odeslání se nastavuje centrálně v js/config.js (PK_FORM_ENDPOINT).
     Dokud je prázdné, běží „nanečisto": nic se neodešle a nikde netvrdíme,
     že zpráva dorazila. */
  var FORM_ENDPOINT = (typeof window !== 'undefined' && window.PK_FORM_ENDPOINT) || '';
  function sendForm(data) {
    if (!FORM_ENDPOINT) return Promise.resolve('unset');
    var isFD = (typeof FormData !== 'undefined') && (data instanceof FormData);
    return fetch(FORM_ENDPOINT, {
      method: 'POST',
      // U FormData (s fotkami) necháme prohlížeč nastavit multipart hlavičku sám.
      headers: isFD ? { 'Accept': 'application/json' } : { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: isFD ? data : JSON.stringify(data)
    }).then(function (r) { return r.ok ? 'ok' : 'error'; }).catch(function () { return 'error'; });
  }

  // Fotky pozemku: okamžitý náhled v prohlížeči + titulka do živého náhledu
  var fotkyInput = document.getElementById('p-fotky');
  if (fotkyInput) fotkyInput.addEventListener('change', function () {
    var imgs = [].slice.call(fotkyInput.files).filter(function (f) { return /^image\//.test(f.type); });
    var prev = document.getElementById('p-fotky-preview');
    if (prev) {
      prev.innerHTML = '';
      imgs.slice(0, 8).forEach(function (f) {
        var url = URL.createObjectURL(f);
        var wrap = document.createElement('div'); wrap.className = 'pp';
        var img = document.createElement('img'); img.src = url; img.alt = '';
        img.onload = function () { URL.revokeObjectURL(url); };
        wrap.appendChild(img); prev.appendChild(wrap);
      });
    }
    var lpThumb = document.getElementById('lp-thumb');
    if (lpThumb) {
      if (imgs[0]) {
        var u = URL.createObjectURL(imgs[0]);
        lpThumb.innerHTML = '';
        var im = document.createElement('img'); im.src = u; im.alt = '';
        im.onload = function () { URL.revokeObjectURL(u); };
        lpThumb.appendChild(im);
      } else {
        lpThumb.innerHTML = '<span class="ph"><svg viewBox="0 0 24 24"><use href="#i-map"/></svg></span>';
      }
    }
  });
  // Živý přepočet ceny za m²
  function updPerm2() {
    var h = document.getElementById('perm2-hint'); if (!h) return;
    var v = parseInt(val('p-vymera'), 10), c = parseInt(val('p-cena'), 10);
    h.textContent = (v > 0 && c > 0) ? ('≈ ' + Math.round(c / v).toLocaleString('cs-CZ') + ' Kč/m²') : '';
  }
  // Živý náhled inzerátu — skládá se, jak uživatel vyplňuje
  var previewCard = document.getElementById('live-preview');
  var flashT = null;
  function setTxt(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
  function updatePreview() {
    if (!previewCard) return;
    setTxt('lp-place', val('p-obec') || 'Vaše obec');
    var meta = [];
    if (val('p-okres')) meta.push('okres ' + val('p-okres'));
    if (val('p-vymera')) meta.push(val('p-vymera') + ' m²');
    setTxt('lp-meta', meta.join(' · ') || 'výměra · okres');
    var c = parseInt(val('p-cena'), 10), v = parseInt(val('p-vymera'), 10);
    setTxt('lp-price', c > 0 ? (c.toLocaleString('cs-CZ') + ' Kč') : 'Cena');
    setTxt('lp-perm2', (c > 0 && v > 0) ? (Math.round(c / v).toLocaleString('cs-CZ') + ' Kč/m²') : '');
    var tags = []; var pr = val('p-pristup'); if (pr) tags.push(pr);
    [].slice.call(document.querySelectorAll('input[name="site"]:checked')).forEach(function (x) { tags.push(x.value); });
    var tg = document.getElementById('lp-tags');
    if (tg) tg.innerHTML = tags.map(function (t) { return '<span>' + escHtml(t) + '</span>'; }).join('');
    updateStrength();
    previewCard.classList.add('flash');
    clearTimeout(flashT); flashT = setTimeout(function () { previewCard.classList.remove('flash'); }, 220);
  }
  // „Síla inzerátu" — motivační ukazatel, kolik toho je vyplněné
  function updateStrength() {
    var fEl = document.getElementById('p-fotky');
    var hasFotky = !!(fEl && fEl.files && fEl.files.length);
    var hasObec = !!val('p-obec'), hasV = parseInt(val('p-vymera'), 10) > 0, hasC = parseInt(val('p-cena'), 10) > 0;
    var hasSite = document.querySelectorAll('input[name="site"]:checked').length > 0;
    var hasPristup = !!val('p-pristup'), hasPopis = val('p-popis').length > 15;
    var pct = 0;
    if (hasObec) pct += 20; if (hasV) pct += 15; if (hasC) pct += 15; if (hasFotky) pct += 20;
    if (val('p-druh')) pct += 8; if (hasPristup) pct += 7; if (hasSite) pct += 8; if (hasPopis) pct += 7;
    var fill = document.getElementById('pcs-fill'), pctEl = document.getElementById('pcs-pct'), hint = document.getElementById('pcs-hint'), tierEl = document.getElementById('pcs-tier');
    if (fill) { fill.style.width = pct + '%'; fill.classList.toggle('full', pct >= 100); }
    if (pctEl) pctEl.textContent = pct + ' %';
    // Úroveň inzerátu — motivace vyplnit víc (1 = začátek … 5 = špička)
    var lvl = pct >= 100 ? 5 : pct >= 75 ? 4 : pct >= 50 ? 3 : pct >= 25 ? 2 : 1;
    var tier = ['', 'Začínáme', 'Dobrý základ', 'Silný inzerát', 'Skvělý inzerát', 'Špičkový inzerát'][lvl];
    if (tierEl) tierEl.textContent = tier;
    var sc = document.querySelector('.pc-strength'); if (sc) sc.setAttribute('data-lvl', String(lvl));
    if (hint) {
      var msg;
      if (!hasObec || !hasV || !hasC) msg = 'Vyplňte <b>obec, výměru a cenu</b> — základ inzerátu.';
      else if (!hasFotky) msg = 'Přidejte <b>fotky</b> — nabídky s fotkou přitáhnou nejvíc zájemců.';
      else if (!hasPopis) msg = 'Napište pár vět do <b>popisu</b>, ať zájemci vědí, o co jde.';
      else if (!hasSite || !hasPristup) msg = 'Doplňte <b>sítě a přístup</b> — kupující je řeší jako první.';
      else if (pct >= 100) msg = '<b>Špičkový inzerát!</b> Máte vyplněno vše důležité — směle odešlete.';
      else msg = '<b>Skvělé — inzerát je připravený.</b> Můžete odeslat, nebo doladit detaily.';
      hint.innerHTML = msg;
    }
  }
  var prodejForm = document.getElementById('form-prodej');
  if (prodejForm) {
    prodejForm.addEventListener('input', function () { updPerm2(); updatePreview(); });
    prodejForm.addEventListener('change', updatePreview);
    if (previewCard) updateStrength();   // počáteční stav ukazatele
  }
  // „Přidat další pozemek" po úspěšném odeslání — vrátí formulář a vynuluje náhled
  var addAnother = document.getElementById('add-another');
  if (addAnother) addAnother.addEventListener('click', function () {
    var succ = document.getElementById('add-success'); if (succ) succ.hidden = true;
    var card = prodejForm && prodejForm.closest('.add-card');
    if (card) { card.hidden = false; try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (x) {} }
    if (prodejForm) prodejForm.reset();
    var lpThumb = document.getElementById('lp-thumb'); if (lpThumb) lpThumb.innerHTML = '<span class="ph"><svg viewBox="0 0 24 24"><use href="#i-map"/></svg></span>';
    var prev = document.getElementById('p-fotky-preview'); if (prev) prev.innerHTML = '';
    var msg = document.getElementById('msg-prodej'); if (msg) { msg.textContent = ''; msg.className = 'add-msg'; }
    updPerm2(); updatePreview();
  });

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function checked(id) { var el = document.getElementById(id); return !!(el && el.checked); }
  // Kontakt: buď platný e-mail, nebo aspoň 9 číslic (české telefonní číslo)
  function validContact(v) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
    return (v.replace(/\D/g, '').length >= 9);
  }

  var OFFLINE = 'Formulář zatím dokončujeme — odesílání spustíme, jakmile připojíme e-mail. Děkujeme za trpělivost.';

  // Chyba s odkazem na konkrétní pole (ať ho můžeme zvýraznit a odscrollovat)
  function E(msg, id) { return { msg: msg, id: id }; }
  function fieldWrap(id) {
    var el = document.getElementById(id); if (!el) return null;
    return el.closest('.add-field') || el.closest('.add-check');
  }

  function handle(formId, msgId, buildData, validate, okMsg, toastMsg) {
    var form = document.getElementById(formId);
    if (!form) return;
    okMsg = okMsg || 'Děkujeme! Nabídku jsme přijali. Projdeme si ji a ozveme se, jakmile ji zveřejníme.';
    toastMsg = toastMsg || 'Nabídka odeslána ke zveřejnění.';
    // Zvýraznění chyby zmizí, jakmile ho uživatel začne opravovat
    function clearOne(e) {
      var w = e.target.closest && (e.target.closest('.add-field') || e.target.closest('.add-check'));
      if (w) w.classList.remove('err');
    }
    form.addEventListener('input', clearOne);
    form.addEventListener('change', clearOne);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ms = document.getElementById(msgId);
      ms.classList.remove('err', 'ok'); ms.textContent = '';
      Array.prototype.forEach.call(form.querySelectorAll('.add-field.err, .add-check.err'), function (w) { w.classList.remove('err'); });
      var err = validate();   // '' když OK, jinak {msg, id}
      if (err) {
        ms.textContent = err.msg || err; ms.classList.add('err');
        var w = err.id ? fieldWrap(err.id) : null;
        if (w) w.classList.add('err');
        var el = err.id ? document.getElementById(err.id) : null;
        if (el) { try { el.focus({ preventScroll: true }); } catch (x) { el.focus(); } el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        return;
      }
      if (!FORM_ENDPOINT) { ms.textContent = OFFLINE; return; }
      ms.textContent = 'Odesílám…';
      sendForm(buildData()).then(function (r) {
        if (r === 'ok') {
          ms.textContent = okMsg; ms.classList.add('ok');
          showToast(toastMsg);
          form.reset();
          // Oslavné potvrzení — schová formulář a ukáže „Hotovo!" (pokud stránka takový blok má)
          var succ = document.querySelector('[data-success-for="' + formId + '"]');
          if (succ) {
            var card = form.closest('.add-card');
            if (card) card.hidden = true;
            succ.hidden = false;
            try { succ.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) {}
          }
        } else {
          ms.textContent = 'Odeslání se teď nepovedlo, zkuste to prosím za chvíli znovu.';
          ms.classList.add('err');
        }
      });
    });
  }

  // --- Prodej (pridat.html) ---
  handle('form-prodej', 'msg-prodej',
    function () {
      var fd = new FormData();
      var v = parseInt(val('p-vymera'), 10), c = parseInt(val('p-cena'), 10);
      var site = [].slice.call(document.querySelectorAll('input[name="site"]:checked')).map(function (x) { return x.value; });
      fd.append('_subject', 'Nový pozemek na prodej — Pozemkomat');
      fd.append('typ', 'Prodej pozemku');
      fd.append('obec', val('p-obec'));
      fd.append('okres', val('p-okres') || '(neuvedeno)');
      fd.append('vymera_m2', val('p-vymera'));
      fd.append('cena_kc', val('p-cena'));
      fd.append('cena_za_m2', (v > 0 && c > 0) ? (Math.round(c / v) + ' Kč/m²') : '(neuvedeno)');
      fd.append('druh', val('p-druh') || '(neuvedeno)');
      fd.append('pristup', val('p-pristup') || '(neuvedeno)');
      fd.append('site', site.length ? site.join(', ') : '(neuvedeno)');
      fd.append('parcela', val('p-parcela') || '(neuvedeno)');
      fd.append('popis', val('p-popis') || '(bez popisu)');
      fd.append('odkaz', val('p-odkaz') || '(neuvedeno)');
      fd.append('jmeno', val('p-jmeno'));
      fd.append('kontakt', val('p-kontakt'));
      var fEl = document.getElementById('p-fotky');
      if (fEl && fEl.files) { [].slice.call(fEl.files).slice(0, 8).forEach(function (f, i) { fd.append('fotka' + (i + 1), f); }); }
      return fd;
    },
    function () {
      if (!val('p-obec')) return E('Vyplňte prosím obec / lokalitu.', 'p-obec');
      if (!(parseInt(val('p-vymera'), 10) > 0)) return E('Zadejte prosím výměru v m².', 'p-vymera');
      if (!(parseInt(val('p-cena'), 10) > 0)) return E('Zadejte prosím cenu v Kč.', 'p-cena');
      if (!val('p-jmeno')) return E('Uveďte prosím své jméno.', 'p-jmeno');
      if (!validContact(val('p-kontakt'))) return E('Zadejte platný telefon (9 číslic) nebo e-mail.', 'p-kontakt');
      if (!checked('p-souhlas')) return E('Potvrďte prosím souhlas s pravidly a zveřejněním.', 'p-souhlas');
      return '';
    }
  );

  // --- Inzerce (inzerce.html) ---
  handle('form-inzerce', 'msg-inzerce',
    function () {
      return {
        _subject: 'Nová inzerce pozemku — Pozemkomat',
        typ: 'Inzerce: ' + (val('i-typ') || '(neuvedeno)'),
        lokalita: val('i-lokalita'), castka_kc: val('i-castka') || '(neuvedeno)',
        popis: val('i-popis'), jmeno: val('i-jmeno'), kontakt: val('i-kontakt')
      };
    },
    function () {
      if (!val('i-typ')) return E('Vyberte prosím typ inzerátu.', 'i-typ');
      if (!val('i-lokalita')) return E('Vyplňte prosím lokalitu.', 'i-lokalita');
      if (!val('i-popis')) return E('Napište prosím krátký popis.', 'i-popis');
      if (!val('i-jmeno')) return E('Uveďte prosím své jméno.', 'i-jmeno');
      if (!validContact(val('i-kontakt'))) return E('Zadejte platný telefon (9 číslic) nebo e-mail.', 'i-kontakt');
      if (!checked('i-souhlas')) return E('Potvrďte prosím souhlas s pravidly a zveřejněním.', 'i-souhlas');
      return '';
    }
  );

  // --- Nahlášení inzerátu (pravidla-inzerce.html) ---
  handle('form-report', 'msg-report',
    function () {
      return {
        _subject: 'Nahlášení inzerátu — Pozemkomat',
        typ: 'Nahlášení inzerátu',
        inzerat: val('r-ident'), duvod: val('r-duvod') || '(neuvedeno)',
        popis: val('r-popis') || '(bez popisu)', kontakt: val('r-kontakt') || '(neuvedeno)'
      };
    },
    function () {
      if (!val('r-ident')) return E('Uveďte prosím, kterého inzerátu se to týká.', 'r-ident');
      if (!val('r-duvod')) return E('Vyberte prosím důvod nahlášení.', 'r-duvod');
      return '';
    },
    'Děkujeme za nahlášení. Podíváme se na to a případně inzerát stáhneme.',
    'Nahlášení odesláno.'
  );

  /* ---------- Výpis „Pozemky od lidí" (data/user-listings.json) ---------- */
  var ulGrid = document.getElementById('user-listings');
  if (ulGrid) {
    fetch('data/user-listings.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (list) { renderListings(Array.isArray(list) ? list : []); });
  }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function czk(n) { n = parseInt(n, 10); return n > 0 ? n.toLocaleString('cs-CZ') + ' Kč' : ''; }
  function badgeFor(typ) {
    var t = (typ || '').toLowerCase();
    if (t.indexOf('prodej') !== -1) return { label: 'Prodej', color: 'var(--c-sale)' };
    if (t.indexOf('poptáv') !== -1 || t.indexOf('hled') !== -1) return { label: 'Poptávka', color: 'var(--c-obec)' };
    if (t.indexOf('pronáj') !== -1) return { label: 'Pronájem', color: 'var(--c-drazba)' };
    if (t.indexOf('směn') !== -1) return { label: 'Směna', color: 'var(--c-obec)' };
    return { label: 'Inzerát', color: 'var(--c-obec)' };
  }
  function renderListings(list) {
    var count = document.getElementById('ul-count');
    if (!list.length) {
      ulGrid.className = 'ul-empty';
      ulGrid.innerHTML = '<b>Zatím tu nejsou žádné pozemky od lidí.</b>' +
        '<span>Buďte první — přidejte svůj pozemek. Nové nabídky se objeví tady, hned jak je ověříme.</span>';
      if (count) count.textContent = '';
      return;
    }
    if (count) count.textContent = list.length + (list.length === 1 ? ' nabídka' : (list.length < 5 ? ' nabídky' : ' nabídek'));
    ulGrid.className = 'ul-grid';
    ulGrid.innerHTML = list.map(function (d) {
      var b = badgeFor(d.typ);
      var place = escHtml(d.obec || d.lokalita || 'Pozemek');
      var meta = [];
      if (d.okres) meta.push('okres ' + escHtml(d.okres));
      if (d.vymera) meta.push(escHtml(d.vymera) + ' m²');
      var price = czk(d.cena || d.castka);
      var _touch = (typeof matchMedia === 'function' && matchMedia('(hover: none)').matches) || ('ontouchstart' in window);
      var link = d.odkaz ? '<a class="ul-src" href="' + escHtml(d.odkaz) + '"' + (_touch ? ' rel="nofollow"' : ' target="_blank" rel="noopener nofollow"') + '>Více &rarr;</a>' : '';
      return '<div class="ul-card">' +
        '<span class="ul-badge" style="background:' + b.color + '">' + b.label + '</span>' +
        '<h3>' + place + '</h3>' +
        (meta.length ? '<div class="ul-meta">' + meta.join(' · ') + '</div>' : '') +
        (price ? '<div class="ul-price">' + price + '</div>' : '') +
        (d.popis ? '<div class="ul-desc">' + escHtml(d.popis) + '</div>' : '') +
        link +
        '</div>';
    }).join('');
  }

})();
