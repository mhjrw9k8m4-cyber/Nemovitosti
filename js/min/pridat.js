(function () {
  'use strict';

  var toastEl = document.getElementById('toast');
  var toastT = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.removeAttribute('hidden');
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); setTimeout(function () { toastEl.setAttribute('hidden', ''); }, 300); }, 3200);
  }

  var SB_URL = (typeof window !== 'undefined' && window.PK_SUPABASE_URL) || '';
  var SB_KEY = (typeof window !== 'undefined' && window.PK_SUPABASE_KEY) || '';
  var SB_READY = !!(SB_URL && SB_KEY);
  function sbInsert(table, row) {
    if (!SB_READY) return Promise.resolve('unset');
    return fetch(SB_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(row)
    }).then(function (r) { return r.ok ? 'ok' : 'error'; }).catch(function () { return 'error'; });
  }
  function sendForm(data) {
    if (!SB_READY) return Promise.resolve('unset');
    var fields = {}, photos = 0;
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      data.forEach(function (value, key) {
        if (typeof File !== 'undefined' && value instanceof File) { if (value && value.size) photos++; }
        else if (key.charAt(0) !== '_') fields[key] = value;
      });
    } else if (data && typeof data === 'object') {
      Object.keys(data).forEach(function (k) { if (k.charAt(0) !== '_') fields[k] = data[k]; });
    }
    var kind = /nahl/i.test(fields.typ || '') ? 'nahlaseni' : 'inzerat';
    var lines = Object.keys(fields).map(function (k) { return k + ': ' + fields[k]; });
    if (photos) lines.push('fotky: ' + photos + ' (úložiště fotek spustíme později)');
    return sbInsert('messages', { kind: kind, name: fields.jmeno || null, email: fields.kontakt || null, message: lines.join('\n') });
  }

  function sbRpc(fn, args) {
    if (!SB_READY) return Promise.resolve(null);
    return fetch(SB_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  var hraniceSlib = null;
  function nactiHrubeHranice() {
    if (!hraniceSlib) {
      hraniceSlib = fetch('data/okresy-hrube.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return hraniceSlib;
  }

  function geocodeQuery(q) {
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cz&q=' + encodeURIComponent(q);
    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (a) {
        if (a && a.length && a[0].lat && a[0].lon) return { lat: parseFloat(a[0].lat), lng: parseFloat(a[0].lon) };
        return null;
      }).catch(function () { return null; });
  }

  function geocodeCz(obec, okres) {
    var tries = [
      { q: obec + (okres ? ', okres ' + okres : '') + ', Česko', pribl: false },
      { q: obec + ', Česko', pribl: false }
    ];
    if (okres) tries.push({ q: 'okres ' + okres + ', Česko', pribl: true });
    var i = 0;
    function next() {
      if (i >= tries.length) return Promise.resolve(null);
      var t = tries[i++];
      return geocodeQuery(t.q).then(function (p) {
        return p ? { lat: p.lat, lng: p.lng, pribl: t.pribl } : next();
      });
    }
    return next();
  }

  var BAD = /(kokot|\bkkt\b|kurv|piča|pича|\bpica\b|mrd|debil|sr[aá]č|čur[aá]k|curak|\bhovn|zmrd|jebn|jebat|piчovin|píčovin|picovin|hajzl|zkur|prdel|čůr|hovado|idiot|blb[eě]c|kokt|penis|vagin|porno|sex\b|naha|nahá|nudi)/i;

  var SPAM = /(viagra|casino|kasino|bitcoin|crypto|půjč[kt]|pujc[kt]|invest.{0,6}zarue|výhr[aou]|vyhr[aou]j|klikni zde|www\.|https?:\/\/(?!(nahlizenidokn|cuzk|mapy\.cz|google\.com\/maps)))/i;
  function looksBad(s) {
    s = String(s || '');
    if (BAD.test(s)) return true;
    if (SPAM.test(s)) return true;
    if (/(.)\1{6,}/.test(s)) return true;
    return false;
  }

  var PH_MAX = 8, PH_DIM = 1600, PH_MIN = 500, PH_Q = 0.82, PH_SRC_MAX = 25 * 1024 * 1024;
  var photoRejects = [];
  var posledniVarovani = [];
  var mistoHlaska = '';
  var polohaHlaska = '';
  var duplHlaska = '';
  var serverHlaska = '';
  var duplPotvrzeno = false;
  function isImage(t) { return /^image\/(jpe?g|png|webp)$/i.test(t || ''); }

  var _nsfw = null, _nsfwState = 'idle', _nsfwProm = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { rej(new Error('script')); };
      document.head.appendChild(s);
    });
  }
  function ensureNsfw() {
    if (_nsfwState === 'ready') return Promise.resolve(_nsfw);
    if (_nsfwState === 'failed') return Promise.resolve(null);
    if (_nsfwProm) return _nsfwProm;
    _nsfwState = 'loading';
    _nsfwProm = (function () {
      var chain = Promise.resolve();

      if (!window.tf) chain = chain.then(function () { return loadScript('vendor/tfjs/tf.min.js'); });
      if (!window.nsfwjs) chain = chain.then(function () { return loadScript('vendor/nsfwjs/nsfwjs.min.js'); });
      return chain
        .then(function () { return window.nsfwjs.load('assets/nsfw-model/', { size: 224 }); })
        .then(function (m) { _nsfw = m; _nsfwState = 'ready'; return m; })
        .catch(function () { _nsfwState = 'failed'; return null; });
    })();
    return _nsfwProm;
  }

  function contentOk(imgEl) {
    return ensureNsfw().then(function (m) {
      if (!m) return true;
      return m.classify(imgEl).then(function (preds) {
        var p = {}; (preds || []).forEach(function (x) { p[x.className] = x.probability; });
        var explicit = (p.Porn || 0) + (p.Hentai || 0);
        if (explicit >= 0.6) return false;
        if ((p.Sexy || 0) >= 0.85) return false;
        return true;
      }).catch(function () { return true; });
    });
  }

  function zmerJas(img) {
    try {
      var n = 32;
      var cv = document.createElement('canvas'); cv.width = n; cv.height = n;
      var ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, n, n);
      var d = ctx.getImageData(0, 0, n, n).data;
      var soucet = 0, soucetKvadratu = 0, pocet = n * n;
      for (var i = 0; i < d.length; i += 4) {
        var jas = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        soucet += jas; soucetKvadratu += jas * jas;
      }
      var prumer = soucet / pocet;
      var rozptyl = Math.max(0, soucetKvadratu / pocet - prumer * prumer);
      return { prumer: prumer, odchylka: Math.sqrt(rozptyl) };
    } catch (e) { return null; }
  }

  var fotkyGps = [];

  function nactiExif(file) {
    if (!window.PKExif || !file.slice) return Promise.resolve({ maEXIF: false });
    return file.slice(0, 256 * 1024).arrayBuffer()
      .then(function (buf) { return PKExif.zBuferu(buf); })
      .catch(function () { return { maEXIF: false }; });
  }

  function temaOk(imgEl) {
    if (!window.PKFotoTema || !window.PKTridy) return Promise.resolve({ ok: true });
    return PKFotoTema.posud(imgEl, window.PKTridy, window.PKSkupiny)
      .catch(function () { return { ok: true }; });
  }

  function moderateAndProcess(file) {
    return new Promise(function (resolve) {
      if (!isImage(file.type)) { resolve({ reject: 'nepodporovaný formát' }); return; }
      if (file.size > PH_SRC_MAX) { resolve({ reject: 'soubor je moc velký (max 25 MB)' }); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;

        var rozm = window.PKKontrola ? PKKontrola.fotkaRozmery(w, h)
          : ((!w || !h) ? { ok: false, msg: 'poškozený obrázek' }
            : (Math.max(w, h) < PH_MIN ? { ok: false, msg: 'moc malá' } : { ok: true }));
        if (!rozm.ok) { URL.revokeObjectURL(url); resolve({ reject: rozm.msg }); return; }

        var obsah = zmerJas(img);
        if (obsah && window.PKKontrola) {
          var oc = PKKontrola.fotkaObsah(obsah.prumer, obsah.odchylka);
          if (!oc.ok) { URL.revokeObjectURL(url); resolve({ reject: oc.msg }); return; }
        }

        nactiExif(file).then(function (exif) {
          if (window.PKKontrola) {
            var pv = PKKontrola.fotkaPuvod(exif, file.type, w, h);
            if (!pv.ok) { URL.revokeObjectURL(url); resolve({ reject: pv.msg }); return; }
          }
          if (exif && typeof exif.lat === 'number') fotkyGps.push({ lat: exif.lat, lng: exif.lng });
          dokonci();
        });
        function dokonci() {
        contentOk(img).then(function (ok) {
          if (!ok) { URL.revokeObjectURL(url); resolve({ reject: 'fotka vypadá nevhodně a nebyla přijata' }); return; }

          temaOk(img).then(function (tv) {
            if (!tv.ok) { URL.revokeObjectURL(url); resolve({ reject: tv.msg }); return; }
            if (tv.varovani) posledniVarovani.push({ id: 'p-fotky', msg: tv.varovani });
            zmensiAUloz();
          });
          function zmensiAUloz() {
          try {
            var scale = Math.min(1, PH_DIM / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
            var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
            cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
            URL.revokeObjectURL(url);
            cv.toBlob(function (blob) { resolve(blob ? { blob: blob } : { reject: 'nepodařilo se zpracovat' }); }, 'image/jpeg', PH_Q);
          } catch (e) { URL.revokeObjectURL(url); resolve({ reject: 'nepodařilo se zpracovat' }); }
          }
        });
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve({ reject: 'nepodařilo se načíst' }); };
      img.src = url;
    });
  }
  function uploadOne(blob, i) {
    if (!blob) return Promise.resolve(null);
    var uid = (window.PKAuth && PKAuth.uid && PKAuth.uid()) || 'anon';
    var tok = (window.PKAuth && PKAuth.token && PKAuth.token()) || SB_KEY;
    var rnd = Math.random().toString(36).slice(2, 8);
    var name = uid + '/' + Date.now() + '-' + i + '-' + rnd + '.jpg';
    return fetch(SB_URL + '/storage/v1/object/listing-photos/' + encodeURI(name), {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
      body: blob
    }).then(function (r) {
      return r.ok ? (SB_URL + '/storage/v1/object/public/listing-photos/' + encodeURI(name)) : null;
    }).catch(function () { return null; });
  }

  function uploadPhotos() {

    var files = fotkyProOdeslani().filter(function (f) { return isImage(f.type); }).slice(0, PH_MAX);

    var videne = {};
    files = files.filter(function (f) {
      var klic = f.name + '|' + f.size + '|' + (f.lastModified || 0);
      if (videne[klic]) return false;
      videne[klic] = 1; return true;
    });
    photoRejects = [];
    fotkyGps = [];
    if (!files.length) return Promise.resolve({ urls: [], rejected: [] });
    showToast('Kontroluji fotky…');
    var blobs = [];
    return files.reduce(function (p, f) {
      return p.then(function () {
        return moderateAndProcess(f).then(function (r) {
          if (r.reject) photoRejects.push({ name: f.name || 'fotka', reason: r.reject });
          else blobs.push(r.blob);
        });
      });
    }, Promise.resolve()).then(function () {
      if (photoRejects.length) return { urls: [], rejected: photoRejects };
      showToast('Nahrávám fotky…');
      var urls = [];
      return blobs.reduce(function (p, blob, i) {
        return p.then(function () { return uploadOne(blob, i).then(function (u) { if (u) urls.push(u); }); });
      }, Promise.resolve()).then(function () { return { urls: urls, rejected: [] }; });
    });
  }

  function zkontrolujDuplicitu() {
    if (duplPotvrzeno) return Promise.resolve('');
    if (!(window.PKKontrola && PKKontrola.jakoMoje)) return Promise.resolve('');
    return PKAuth.rpc('my_listings').then(function (res) {
      var moje = (res && res.ok && Array.isArray(res.data)) ? res.data : [];
      if (!moje.length) return '';
      var shoda = PKKontrola.jakoMoje(
        { obec: val('p-obec'), okres: val('p-okres'), vymera: val('p-vymera') }, moje);
      if (!shoda) return '';
      duplPotvrzeno = true;
      var kolik = shoda.area ? (' ' + String(shoda.area).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0m²') : '';
      return 'V „Moje inzeráty" už máte pozemek ' + shoda.place + kolik
        + '. Je to tentýž? Pak raději upravte ten stávající — dva stejné inzeráty '
        + 'zájemce jen zmatou. Jestli jde opravdu o jiný pozemek, klepněte na Zveřejnit ještě jednou.';
    }).catch(function () { return ''; });
  }

  function publishListing() {
    if (looksBad(val('p-obec')) || looksBad(val('p-popis')) || looksBad(val('p-parcela'))) {
      return Promise.resolve('bad');
    }
    if (!(window.PKAuth && PKAuth.loggedIn())) return Promise.resolve('auth');
    var obec = val('p-obec'), okres = val('p-okres');
    var area = parseInt(val('p-vymera'), 10) || 0;
    var price = parseInt(val('p-cena'), 10) || 0;
    return geocodeCz(obec, okres).then(function (pos) {
      if (!pos) return 'geo';

      if (pos.pribl) return 'geoObec';
      return nactiHrubeHranice().then(function (hrube) {

      var pol = (window.PKKontrola && PKKontrola.poloha)
        ? PKKontrola.poloha(pos.lat, pos.lng, okres, hrube) : { ok: true };
      if (!pol.ok) { polohaHlaska = pol.msg; return 'poloha'; }
      return zkontrolujDuplicitu().then(function (dupl) {
      if (dupl) { duplHlaska = dupl; return 'duplicita'; }
      var features = [].slice.call(document.querySelectorAll('input[name="site"]:checked')).map(function (x) { return x.value; });
      return uploadPhotos().then(function (pr) {
      if (pr.rejected && pr.rejected.length) return 'photos';

      mistoHlaska = '';
      if (window.PKKontrola && window.PKExif && pos && fotkyGps.length) {
        var nejdal = null;
        fotkyGps.forEach(function (g) {
          var km = PKExif.vzdalenostKm(pos.lat, pos.lng, g.lat, g.lng);
          if (km != null && (nejdal == null || km > nejdal)) nejdal = km;
        });
        var mst = PKKontrola.fotkaMisto(nejdal);
        if (!mst.ok) { mistoHlaska = mst.msg; return 'misto'; }
        if (mst.varovani) posledniVarovani.push({ id: 'p-fotky', msg: mst.varovani });
      }
      return PKAuth.rpc('create_listing', {
        p_place: obec, p_okres: okres, p_druh: val('p-druh'), p_parcel: val('p-parcela'),
        p_area: area, p_price: price, p_lat: pos.lat, p_lng: pos.lng,
        p_description: val('p-popis'), p_contact: val('p-kontakt'),
        p_photos: (pr && pr.urls) || [],
        p_features: features, p_access: val('p-pristup') || null
      }, true).then(function (res) {
        if (!res || !res.ok) {
          if (res && res.expired) return 'auth';
          var m = (res && res.error && (res.error.message || res.error.msg)) || '';

          if ((res && res.status === 404) || /could not find the function|PGRST202/i.test(m)) {
            if (window.console) console.error('create_listing: databáze má starší verzi funkce. Spusťte supabase/00-vse.sql v Supabase → SQL Editor.');
            return 'db';
          }
          if (/nevhodn/i.test(m)) return 'bad';
          if (/počkejte|pockejte|chvíli|chvili/i.test(m)) return 'wait';
          if (/limit/i.test(m)) return 'limit';
          if (/přihlášen|prihlasen/i.test(m)) return 'auth';

          if (/potvrďte e-mail|potvrdte e-mail/i.test(m)) {
            serverHlaska = 'Nejdřív prosím potvrďte e-mail — poslali jsme vám do schránky odkaz. Pak už inzerát půjde přidat.';
            return 'pravidlo';
          }
          if (/(musí být|musí mít|je delší|nesmí obsahovat|je moc dlouhé|je povinná|je povinný|vychází nereálně|mimo reálné rozpětí)/i.test(m)) {
            serverHlaska = m.charAt(0).toUpperCase() + m.slice(1) + '.';
            return 'pravidlo';
          }
          return 'error';
        }
        var row = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!row || !row.id) return 'error';
        window.location.href = 'muj-inzerat.html';
        return 'ok';
      });
      });
      });
      });
    });
  }

  var vybraneFotky = [];
  var fotkyInput = document.getElementById('p-fotky');

  function klicFotky(f) { return f.name + '|' + f.size + '|' + (f.lastModified || 0); }
  function fotkyProOdeslani() { return vybraneFotky.map(function (x) { return x.f; }); }

  function pridejFotky(soubory) {
    var videne = {};
    vybraneFotky.forEach(function (x) { videne[klicFotky(x.f)] = 1; });
    var kolik = 0;
    [].slice.call(soubory).forEach(function (f) {
      if (!/^image\//.test(f.type)) return;
      if (vybraneFotky.length >= PH_MAX) return;
      var k = klicFotky(f);
      if (videne[k]) return;
      videne[k] = 1;
      vybraneFotky.push({ f: f, url: URL.createObjectURL(f), trida: 'ceka', text: 'kontroluji…' });
      kolik++;
    });
    return kolik;
  }

  function smazFotku(i) {
    var x = vybraneFotky[i];
    if (!x) return;
    try { URL.revokeObjectURL(x.url); } catch (e) {}
    vybraneFotky.splice(i, 1);
    vykresliFotky(); updateStrength(); updatePreview();
  }

  function presunFotku(z, na) {
    if (z === na || z < 0 || na < 0 || z >= vybraneFotky.length || na >= vybraneFotky.length) return false;
    vybraneFotky.splice(na, 0, vybraneFotky.splice(z, 1)[0]);
    return true;
  }

  function vykresliFotky(zaostrit) {
    var prev = document.getElementById('p-fotky-preview');
    if (!prev) return;
    prev.innerHTML = '';
    vybraneFotky.forEach(function (x, i) {
      var wrap = document.createElement('div');
      wrap.className = 'pp' + (i === 0 ? ' pp-titulni' : '');
      wrap.setAttribute('data-i', String(i));
      wrap.tabIndex = 0;
      wrap.setAttribute('role', 'listitem');

      wrap.setAttribute('aria-label', (i === 0 ? 'Titulní fotka' : 'Fotka ' + (i + 1))
        + ' z ' + vybraneFotky.length + ' — šipkami vlevo a vpravo ji přesunete');

      var obr = document.createElement('div'); obr.className = 'pp-obr';
      var img = document.createElement('img');
      img.src = x.url; img.alt = ''; img.draggable = false;
      var stav = document.createElement('span');
      stav.className = 'pp-stav ' + x.trida; stav.textContent = x.text;
      obr.appendChild(img);
      if (i === 0) {
        var od = document.createElement('span');
        od.className = 'pp-titulka'; od.textContent = 'Titulní foto';
        obr.appendChild(od);
      }
      var kriz = document.createElement('button');
      kriz.type = 'button'; kriz.className = 'pp-smaz';
      kriz.setAttribute('aria-label', 'Odebrat fotku ' + (i + 1));
      kriz.innerHTML = '<span aria-hidden="true">✕</span>';
      kriz.addEventListener('click', function (e) { e.stopPropagation(); smazFotku(i); });
      obr.appendChild(kriz);
      wrap.appendChild(obr); wrap.appendChild(stav);

      if (x.trida === 'ceka') {
        img.onload = function () {
          posudNahled(x.f, img, {
            set className(v) { stav.className = v; x.trida = String(v).replace('pp-stav ', ''); },
            get className() { return stav.className; },
            set textContent(v) { stav.textContent = v; x.text = v; },
            get textContent() { return stav.textContent; }
          });
        };
      }
      prev.appendChild(wrap);
    });
    if (typeof zaostrit === 'number') {
      var cil = prev.children[zaostrit];
      if (cil) cil.focus();
    }
    var lpThumb = document.getElementById('lp-thumb');
    if (lpThumb) {
      if (vybraneFotky[0]) {
        lpThumb.innerHTML = '';
        var im = document.createElement('img'); im.src = vybraneFotky[0].url; im.alt = '';
        lpThumb.appendChild(im);
      } else {
        lpThumb.innerHTML = '<span class="ph"><svg viewBox="0 0 24 24"><use href="#i-map"/></svg></span>';
      }
    }
  }

  (function presouvani() {
    if (!window.PointerEvent) return;

    var prevEl = function () { return document.getElementById('p-fotky-preview'); };
    var p0 = prevEl(); if (p0) p0.setAttribute('role', 'list');
    var drzim = null, zacX = 0, zacY = 0, taham = false;
    document.addEventListener('pointerdown', function (e) {
      var t = e.target.closest ? e.target.closest('.pp') : null;
      if (!t || !t.closest('#p-fotky-preview') || e.target.closest('.pp-smaz')) return;
      drzim = t; zacX = e.clientX; zacY = e.clientY; taham = false;
      try { t.setPointerCapture(e.pointerId); } catch (x) {}
    });
    document.addEventListener('pointermove', function (e) {
      if (!drzim) return;
      var prev = prevEl(); if (!prev) return;
      if (!taham) {
        if (Math.abs(e.clientX - zacX) + Math.abs(e.clientY - zacY) < 6) return;
        taham = true;
        drzim.classList.add('pp-taham');
        prev.classList.add('pp-tahani');
      }
      e.preventDefault();

      var pod = document.elementFromPoint(e.clientX, e.clientY);
      var cil = pod && pod.closest ? pod.closest('.pp') : null;
      if (!cil || cil === drzim || cil.parentElement !== prev) return;
      var z = +drzim.getAttribute('data-i'), na = +cil.getAttribute('data-i');
      if (presunFotku(z, na)) { vykresliFotky(); drzim = prev.children[na] || null;
        if (drzim) { drzim.classList.add('pp-taham'); try { drzim.setPointerCapture(e.pointerId); } catch (x) {} } }
    });
    function konec() {
      if (drzim) drzim.classList.remove('pp-taham');
      var prev = prevEl(); if (prev) prev.classList.remove('pp-tahani');
      if (taham) { updateStrength(); updatePreview(); }
      drzim = null; taham = false;
    }
    document.addEventListener('pointerup', konec);
    document.addEventListener('pointercancel', konec);

    document.addEventListener('keydown', function (e) {
      var t = e.target.closest ? e.target.closest('.pp') : null;
      if (!t || !t.closest('#p-fotky-preview')) return;
      var i = +t.getAttribute('data-i'), na = null;
      if (e.key === 'ArrowLeft') na = i - 1;
      else if (e.key === 'ArrowRight') na = i + 1;
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); smazFotku(i); return; }
      else return;
      e.preventDefault();
      if (presunFotku(i, na)) { vykresliFotky(na); updateStrength(); updatePreview(); }
    });
  }());

  if (fotkyInput) fotkyInput.addEventListener('change', function () {
    pridejFotky(fotkyInput.files);

    try { fotkyInput.value = ''; } catch (e) {}
    vykresliFotky();
    updateStrength();
    updatePreview();
  });

  function posudNahled(file, img, stav) {
    function hotovo(trida, text) { stav.className = 'pp-stav ' + trida; stav.textContent = text; }
    var rozm = window.PKKontrola ? PKKontrola.fotkaRozmery(img.naturalWidth, img.naturalHeight) : { ok: true };
    if (!rozm.ok) { hotovo('spatne', rozm.msg); return; }
    var jas = zmerJas(img);
    if (jas && window.PKKontrola) {
      var o = PKKontrola.fotkaObsah(jas.prumer, jas.odchylka);
      if (!o.ok) { hotovo('spatne', o.msg); return; }
    }
    nactiExif(file).then(function (exif) {
      if (window.PKKontrola) {
        var pv = PKKontrola.fotkaPuvod(exif, file.type, img.naturalWidth, img.naturalHeight);
        if (!pv.ok) { hotovo('spatne', pv.msg); return; }
      }
      var kde = (exif && typeof exif.lat === 'number') ? ' · s místem pořízení' : '';
      if (!window.PKFotoTema || !window.PKTridy) { hotovo('dobre', 'v pořádku' + kde); return; }
      PKFotoTema.posud(img, window.PKTridy, window.PKSkupiny).then(function (r) {
        var d = r.detail || {};
        if (!r.ok) { hotovo('spatne', r.msg); return; }
        if (r.varovani) { hotovo('pozor', 'zkontrolujte — ' + ((d.nej && d.nej[0] && (d.nej[0].cesky || d.nej[0].trida.split(',')[0])) || 'nejisté')); return; }
        var co = (d.nej || []).filter(function (x) { return x.skupina === 'V' && x.cesky; })
          .map(function (x) { return x.cesky; }).slice(0, 2).join(', ');
        hotovo('dobre', (co ? co : 'vypadá dobře') + kde);
      }, function () { hotovo('dobre', 'v pořádku' + kde); });
    });
  }

  function updPerm2() {
    var h = document.getElementById('perm2-hint'); if (!h) return;
    var v = parseInt(val('p-vymera'), 10), c = parseInt(val('p-cena'), 10);
    h.textContent = (v > 0 && c > 0) ? ('≈ ' + Math.round(c / v).toLocaleString('cs-CZ') + ' Kč/m²') : '';
  }

  var previewCard = document.getElementById('live-preview');
  var flashT = null;
  function setTxt(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
  function updatePreview() {
    if (!previewCard) return;
    setTxt('lp-place', val('p-obec') || 'Vaše obec');
    var meta = [];
    if (val('p-okres')) meta.push('okres ' + val('p-okres'));
    if (val('p-vymera')) meta.push(val('p-vymera') + '\u00a0m²');
    setTxt('lp-meta', meta.join(' · ') || 'výměra · okres');
    var c = parseInt(val('p-cena'), 10), v = parseInt(val('p-vymera'), 10);
    setTxt('lp-price', c > 0 ? (c.toLocaleString('cs-CZ') + '\u00a0Kč') : 'Cena');
    setTxt('lp-perm2', (c > 0 && v > 0) ? (Math.round(c / v).toLocaleString('cs-CZ') + ' Kč/m²') : '');
    var desc = val('p-popis');
    var dEl = document.getElementById('lp-desc');
    if (dEl) { dEl.textContent = desc; dEl.hidden = !desc; }
    var tags = []; var dr = val('p-druh'); if (dr) tags.push(dr);
    var pr = val('p-pristup'); if (pr) tags.push(pr);
    [].slice.call(document.querySelectorAll('input[name="site"]:checked')).forEach(function (x) { tags.push(x.value); });
    var tg = document.getElementById('lp-tags');
    if (tg) tg.innerHTML = tags.map(function (t) { return '<span>' + escHtml(t) + '</span>'; }).join('');
    updateStrength();
    previewCard.classList.add('flash');
    clearTimeout(flashT); flashT = setTimeout(function () { previewCard.classList.remove('flash'); }, 220);
  }

  var mpCard = document.getElementById('mp-card');
  var mpT = null, mpPosledni = '', mpPamet = {};

  function mpRekni(trida, text) {
    var s = document.getElementById('mp-stav');
    if (!s) return;
    s.className = 'mp-stav' + (trida ? ' ' + trida : '');
    s.textContent = text || '';
  }
  function mpSnimek(pos) {
    var ram = document.getElementById('mp-ram');
    if (!ram) return;
    var area = parseInt(val('p-vymera'), 10) || 0;
    if (window.PK_SNIMEK && PK_SNIMEK.html) {

      var barva = '';
      try { barva = getComputedStyle(document.documentElement).getPropertyValue('--c-majitel').trim(); } catch (e) {}
      ram.innerHTML = PK_SNIMEK.html(
        { lat: pos.lat, lng: pos.lng, area: area, place: val('p-obec'), okres: val('p-okres'), type: 'sale' },
        { sirka: 384, vyska: 240, barva: barva || '#8B4FE0', id: 'mp' });
    } else {

      ram.textContent = pos.lat.toFixed(4) + ', ' + pos.lng.toFixed(4);
    }
  }
  function mpUkaz() {
    var obec = val('p-obec'), okres = val('p-okres');
    if (!mpCard) return;
    if (!obec || !okres) { mpCard.hidden = true; return; }

    var klic = obec + '|' + okres;
    var klicVykresleni = klic + '|' + (parseInt(val('p-vymera'), 10) || 0);
    if (klicVykresleni === mpPosledni) return;
    mpPosledni = klicVykresleni;
    mpCard.hidden = false;
    mpRekni('', 'Hledám na mapě…');
    var hotovo = function (pos) {
      if (val('p-obec') + '|' + val('p-okres') !== klic) return;
      if (!pos) { mpRekni('err', 'Obec „' + obec + '" jsme na mapě nenašli. Zkuste prosím nejbližší větší obec.'); return; }
      if (pos.pribl) {
        mpRekni('err', 'Obec „' + obec + '" jsme nenašli — pozemek by skončil u okresního města, '
          + 'ne na svém místě. Zkontrolujte prosím název obce.');
        return;
      }
      mpSnimek(pos);
      nactiHrubeHranice().then(function (hrube) {
        var pol = (window.PKKontrola && PKKontrola.poloha)
          ? PKKontrola.poloha(pos.lat, pos.lng, okres, hrube) : { ok: true };
        if (!pol.ok) mpRekni('err', pol.msg);
        else mpRekni('ok', 'Takhle se pozemek ukáže na mapě. Sedí to?');
      });
    };
    if (mpPamet[klic] !== undefined) { hotovo(mpPamet[klic]); return; }
    geocodeCz(obec, okres).then(function (pos) { mpPamet[klic] = pos; hotovo(pos); });
  }
  function mpNaplanuj() {
    clearTimeout(mpT);
    mpT = setTimeout(mpUkaz, 1200);
  }

  function updateStrength() {
    var hasFotky = vybraneFotky.length > 0;
    var hasObec = !!val('p-obec'), hasV = parseInt(val('p-vymera'), 10) > 0, hasC = parseInt(val('p-cena'), 10) > 0;
    var hasSite = document.querySelectorAll('input[name="site"]:checked').length > 0;
    var hasPristup = !!val('p-pristup'), hasPopis = val('p-popis').length > 15;
    var pct = 0;
    if (hasObec) pct += 20; if (hasV) pct += 15; if (hasC) pct += 15; if (hasFotky) pct += 20;
    if (val('p-druh')) pct += 8; if (hasPristup) pct += 7; if (hasSite) pct += 8; if (hasPopis) pct += 7;
    var fill = document.getElementById('pcs-fill'), pctEl = document.getElementById('pcs-pct'), hint = document.getElementById('pcs-hint'), tierEl = document.getElementById('pcs-tier');
    if (fill) { fill.style.width = pct + '%'; fill.classList.toggle('full', pct >= 100); }
    if (pctEl) pctEl.textContent = pct + ' %';

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

  var KONCEPT_KLIC = 'pk_add_draft_v1';
  var konceptT = null;

  function poleFormulare(form) {
    return [].slice.call(form.querySelectorAll('input, select, textarea')).filter(function (el) {
      return el.type !== 'file' && el.type !== 'password' && el.type !== 'submit' && (el.id || el.name);
    });
  }
  function klicPole(el, i) { return el.id || (el.name + '#' + i); }

  function ulozKoncept(form) {
    try {
      var data = {};
      poleFormulare(form).forEach(function (el, i) {
        data[klicPole(el, i)] = (el.type === 'checkbox' || el.type === 'radio') ? !!el.checked : el.value;
      });
      var neco = Object.keys(data).some(function (k) { return data[k] !== '' && data[k] !== false; });
      if (neco) localStorage.setItem(KONCEPT_KLIC, JSON.stringify({ ulozeno: Date.now(), data: data }));
      else localStorage.removeItem(KONCEPT_KLIC);
    } catch (e) {   }
  }
  function smazKoncept() { try { localStorage.removeItem(KONCEPT_KLIC); } catch (e) {} }

  function vratKoncept(form) {
    var ulozeny;
    try { ulozeny = JSON.parse(localStorage.getItem(KONCEPT_KLIC) || 'null'); } catch (e) { return; }
    if (!ulozeny || !ulozeny.data) return;

    if (Date.now() - (ulozeny.ulozeno || 0) > 7 * 24 * 3600 * 1000) { smazKoncept(); return; }
    var vraceno = 0;
    poleFormulare(form).forEach(function (el, i) {
      var v = ulozeny.data[klicPole(el, i)];
      if (v === undefined) return;
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== v) { el.checked = v; vraceno++; } }
      else if (!el.value && v) { el.value = v; vraceno++; }
    });
    if (!vraceno) return;
    var ms = document.getElementById('msg-prodej');
    if (ms) {
      ms.innerHTML = 'Vrátili jsme vám rozepsaný inzerát. <b>Fotky přidejte prosím znovu</b> — ty se uložit nedají. ' +
        '<button type="button" id="koncept-zahodit" class="link-btn">Začít znovu</button>';
      ms.classList.remove('err');
      var zah = document.getElementById('koncept-zahodit');
      if (zah) zah.addEventListener('click', function () {
        smazKoncept(); form.reset();
        ms.textContent = ''; ms.className = 'add-msg';
        updPerm2(); updatePreview(); updateStrength();
      });
    }
  }

  function ukazVarovani() {
    var box = document.getElementById('p-varovani');
    if (!box || !window.PKKontrola) return;
    var v = PKKontrola.formular({
      obec: val('p-obec'), okres: val('p-okres'), vymera: val('p-vymera'), cena: val('p-cena'),
      parcela: val('p-parcela'), popis: val('p-popis'), odkaz: val('p-odkaz'),
      jmeno: val('p-jmeno'), kontakt: val('p-kontakt')
    });
    var zpravy = (v.varovani || []).map(function (x) { return x.msg; });
    if (!zpravy.length) { box.hidden = true; box.textContent = ''; return; }
    box.innerHTML = '<b>Zkontrolujte prosím:</b> ' + zpravy.join(' ');
    box.hidden = false;
  }

  var prodejForm = document.getElementById('form-prodej');
  if (prodejForm) {
    vratKoncept(prodejForm);
    prodejForm.addEventListener('input', function () {
      clearTimeout(konceptT);
      konceptT = setTimeout(function () { ulozKoncept(prodejForm); }, 500);
    });
    prodejForm.addEventListener('change', function () { ulozKoncept(prodejForm); });
  }
  if (prodejForm) {

    prodejForm.addEventListener('input', function () { updPerm2(); updatePreview(); updateStrength(); });
    prodejForm.addEventListener('change', function () { updatePreview(); updateStrength(); ukazVarovani(); });

    prodejForm.addEventListener('change', function () { if (val('p-okres')) nactiHrubeHranice(); });

    prodejForm.addEventListener('input', mpNaplanuj);
    prodejForm.addEventListener('change', mpNaplanuj);
    prodejForm.addEventListener('focusout', ukazVarovani);
    if (previewCard) updateStrength();
  }

  (function () {
    var asideEl = document.querySelector('.add-aside');
    if (!asideEl || !window.matchMedia) return;
    var okresEl = document.getElementById('p-okres');
    var karty = [
      { card: document.getElementById('live-preview-card'),
        kotva: document.querySelector('#form-prodej .desc-field') || document.querySelector('#form-prodej .photo-field') },
      { card: document.getElementById('mp-card'),
        kotva: okresEl ? (okresEl.closest('.add-row') || okresEl.closest('.add-field')) : null }
    ].filter(function (x) { return x.card && x.kotva; });
    if (!karty.length) return;
    var mq = window.matchMedia('(max-width: 900px)');
    function place() {
      if (mq.matches) {
        karty.forEach(function (x) {
          if (x.kotva.nextElementSibling !== x.card) x.kotva.insertAdjacentElement('afterend', x.card);
        });
      } else {

        karty.slice().reverse().forEach(function (x) {
          if (x.card.parentNode !== asideEl || x.card !== asideEl.firstChild) asideEl.insertBefore(x.card, asideEl.firstChild);
        });
      }
    }
    place();
    if (mq.addEventListener) mq.addEventListener('change', place); else if (mq.addListener) mq.addListener(place);
  })();

  var addAnother = document.getElementById('add-another');
  if (addAnother) addAnother.addEventListener('click', function () {
    var succ = document.getElementById('add-success'); if (succ) succ.hidden = true;
    var card = prodejForm && prodejForm.closest('.add-card');
    if (card) { card.hidden = false; try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (x) {} }
    if (prodejForm) prodejForm.reset();
    var lpThumb = document.getElementById('lp-thumb'); if (lpThumb) lpThumb.innerHTML = '<span class="ph"><svg viewBox="0 0 24 24"><use href="#i-map"/></svg></span>';
    vybraneFotky.forEach(function (x) { try { URL.revokeObjectURL(x.url); } catch (e) {} });
    vybraneFotky = [];
    var prev = document.getElementById('p-fotky-preview'); if (prev) prev.innerHTML = '';
    var msg = document.getElementById('msg-prodej'); if (msg) { msg.textContent = ''; msg.className = 'add-msg'; }
    smazKoncept();
    updPerm2(); updatePreview(); updateStrength();
  });

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function checked(id) { var el = document.getElementById(id); return !!(el && el.checked); }

  function validContact(v) {
    v = String(v || '').trim();
    if (!v) return true;
    if (/@/.test(v)) return false;
    return (v.replace(/\D/g, '').length >= 9);
  }

  var OFFLINE = 'Formulář zatím dokončujeme — odesílání spustíme, jakmile připojíme e-mail. Děkujeme za trpělivost.';

  function E(msg, id) { return { msg: msg, id: id }; }
  function fieldWrap(id) {
    var el = document.getElementById(id); if (!el) return null;
    return el.closest('.add-field') || el.closest('.add-check');
  }

  function handle(formId, msgId, buildData, validate, okMsg, toastMsg, sender) {
    var form = document.getElementById(formId);
    if (!form) return;
    okMsg = okMsg || 'Děkujeme! Nabídku jsme přijali. Projdeme si ji a ozveme se, jakmile ji zveřejníme.';
    toastMsg = toastMsg || 'Nabídka odeslána ke zveřejnění.';

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
      var err = validate();
      if (err) {
        ms.textContent = err.msg || err; ms.classList.add('err');
        var w = err.id ? fieldWrap(err.id) : null;
        if (w) w.classList.add('err');
        var el = err.id ? document.getElementById(err.id) : null;
        if (el) { try { el.focus({ preventScroll: true }); } catch (x) { el.focus(); } el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        return;
      }
      if (!SB_READY) { ms.textContent = OFFLINE; return; }
      ms.textContent = sender ? 'Zveřejňuji na mapě…' : 'Odesílám…';
      (sender ? sender() : sendForm(buildData())).then(function (r) {
        if (r === 'ok') {
          ms.textContent = okMsg; ms.classList.add('ok');
          showToast(toastMsg);
          form.reset();
          if (form.id === 'form-prodej') smazKoncept();

          var succ = document.querySelector('[data-success-for="' + formId + '"]');
          if (succ) {
            var card = form.closest('.add-card');
            if (card) card.hidden = true;
            succ.hidden = false;
            try { succ.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) {}
          }
        } else if (r === 'geo') {
          ms.textContent = 'Nepodařilo se najít obec na mapě. Zkontrolujte prosím název obce (např. „Kolín").';
          ms.classList.add('err');
        } else if (r === 'geoObec') {
          ms.textContent = 'Obec „' + val('p-obec') + '" jsme na mapě nenašli — pozemek by se ukázal u okresního města, '
            + 'ne na svém místě. Zkontrolujte prosím název obce; stačí i nejbližší větší obec.';
          ms.classList.add('err');
        } else if (r === 'bad') {
          ms.textContent = 'Text obsahuje nevhodná slova nebo vypadá jako spam. Upravte prosím inzerát a zkuste to znovu.';
          ms.classList.add('err');
        } else if (r === 'photos') {
          var names = (typeof photoRejects !== 'undefined' ? photoRejects : []).map(function (x) { return '„' + x.name + '" (' + x.reason + ')'; }).join(', ');
          ms.innerHTML = 'Některé fotky jsme nepřijali: ' + escHtml(names) + '. Odeberte je prosím a přidejte fotky pozemku.';
          ms.classList.add('err');
        } else if (r === 'auth') {
          ms.textContent = 'Přihlášení vypršelo — přihlaste se prosím znovu (nahoře).';
          ms.classList.add('err');
        } else if (r === 'limit') {
          ms.innerHTML = 'Dosáhli jste limitu inzerátů pro váš účet. Smažte starší v „Moje inzeráty", nebo si účet <a href="kontakt.html">rozšiřte až na 20 inzerátů</a>.';
          ms.classList.add('err');
        } else if (r === 'wait') {
          ms.textContent = 'Chvíli prosím počkejte (asi minutu) a zkuste přidat další inzerát znovu.';
          ms.classList.add('err');
        } else if (r === 'pravidlo') {
          ms.textContent = serverHlaska;
          ms.classList.add('err');
        } else if (r === 'duplicita') {
          ms.textContent = duplHlaska;
          ms.classList.add('err');
        } else if (r === 'poloha') {
          ms.textContent = polohaHlaska || 'Obec a okres k sobě nesedí — zkontrolujte je prosím.';
          ms.classList.add('err');
        } else if (r === 'misto') {
          ms.textContent = 'Fotka ' + (mistoHlaska || 'nesedí k zadané obci') + ' Zkontrolujte prosím obec, nebo nahrajte fotky pozemku.';
          ms.classList.add('err');
        } else if (r === 'db') {
          ms.innerHTML = 'Inzeráty teď nejde přidávat — na naší straně neběží aktuální verze databáze. Píšeme na tom; zkuste to prosím později, nebo nám dejte vědět přes <a href="kontakt.html">kontakt</a>.';
          ms.classList.add('err');
        } else {
          ms.textContent = 'Odeslání se teď nepovedlo, zkuste to prosím za chvíli znovu.';
          ms.classList.add('err');
        }
      });
    });
  }

  handle('form-prodej', 'msg-prodej',
    null,
    function () {

      if (window.PKKontrola) {
        var v = PKKontrola.formular({
          obec: val('p-obec'), okres: val('p-okres'), vymera: val('p-vymera'), cena: val('p-cena'),
          parcela: val('p-parcela'), popis: val('p-popis'),
          kontakt: val('p-kontakt')
        });
        if (!v.ok) return E(v.msg, v.id);
        posledniVarovani = (v.varovani || []);
      } else {
        if (!val('p-obec')) return E('Vyplňte prosím obec / lokalitu.', 'p-obec');
        if (!(parseInt(val('p-vymera'), 10) > 0)) return E('Zadejte prosím výměru v m².', 'p-vymera');
        if (!(parseInt(val('p-cena'), 10) > 0)) return E('Zadejte prosím cenu v Kč.', 'p-cena');
        if (!validContact(val('p-kontakt'))) return E('Zadejte platné telefonní číslo (9 číslic), nebo pole nechte prázdné.', 'p-kontakt');
      }
      if (!checked('p-souhlas')) return E('Potvrďte prosím souhlas s pravidly a zveřejněním.', 'p-souhlas');
      return '';
    },
    'Zveřejněno! Přesměrováváme na váš inzerát…',
    'Inzerát zveřejněn na mapě.',
    publishListing
  );

  handle('form-inzerce', 'msg-inzerce',
    function () {
      return {
        _subject: 'Nová inzerce pozemku — Parcelka',
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
      if (!validContact(val('i-kontakt'))) return E('Zadejte platné telefonní číslo (9 číslic).', 'i-kontakt');
      if (!checked('i-souhlas')) return E('Potvrďte prosím souhlas s pravidly a zveřejněním.', 'i-souhlas');
      return '';
    }
  );

  handle('form-report', 'msg-report',
    function () {
      return {
        _subject: 'Nahlášení inzerátu — Parcelka',
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

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  (function initAuth() {
    var gate = document.getElementById('auth-gate');
    var card = document.getElementById('prodej-card');
    var bar = document.getElementById('auth-bar');
    if (!gate || !card) return;
    function refresh() {
      var on = !!(window.PKAuth && PKAuth.loggedIn());

      var de = document.documentElement;
      de.classList.toggle('pk-prihlasen', on);
      de.classList.toggle('pk-odhlasen', !on);
      gate.hidden = on; card.hidden = !on; if (bar) bar.hidden = !on;

      var pv = document.getElementById('live-preview-card'); if (pv) pv.hidden = !on;
      var em = document.getElementById('auth-email'); if (em) em.textContent = (window.PKAuth ? PKAuth.email() : '');
      if (on) loadQuota();
    }

    function loadQuota() {
      var q = document.getElementById('quota-info'); if (!q || !(window.PKAuth && PKAuth.rpc)) return;
      PKAuth.rpc('my_listing_quota', {}, true).then(function (res) {
        if (!res || !res.ok) { q.textContent = ''; return; }
        var row = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!row) { q.textContent = ''; return; }
        var max = row.max || 1, left = Math.max(0, max - (row.used || 0));
        var html = 'Inzeráty: <b>' + row.used + ' z ' + max + '</b>';
        if (max <= 1) html += ' · <a href="kontakt.html">Rozšířit na 20</a>';
        else if (left > 0) html += ' (zbývá ' + left + ')';
        q.innerHTML = html + ' · ';
      }, function () { q.textContent = ''; });
    }
    refresh();
    if (window.PKAuth && PKAuth.keepAlive) { PKAuth.keepAlive().then(refresh, refresh); }
    var msg = document.getElementById('au-msg');
    function say(t, err) { if (msg) { msg.textContent = t; msg.className = 'add-msg' + (err ? ' err' : ' ok'); } }
    function creds() { return { e: ((document.getElementById('au-email') || {}).value || '').trim().toLowerCase(), p: (document.getElementById('au-pass') || {}).value || '' }; }
    function okCreds(c) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.e)) { say('Zadejte platný e-mail.', true); return false; }
      if (c.p.length < 6) { say('Heslo musí mít aspoň 6 znaků.', true); return false; }
      return true;
    }
    function errText(d) { return (d && (d.error_description || d.msg || d.message || d.error)) || ''; }

    var gateEl = document.getElementById('auth-gate');
    var titleEl = document.getElementById('auth-title'), subEl = document.getElementById('auth-sub');
    var submitBtn = document.getElementById('au-submit'), passHint = document.getElementById('au-pass-hint');
    var forgotWrap = document.getElementById('auth-forgot');
    var tabLogin = document.getElementById('tab-login'), tabSignup = document.getElementById('tab-signup');
    var mode = 'login';
    function setMode(m) {
      mode = (m === 'signup') ? 'signup' : 'login';
      if (gateEl) gateEl.setAttribute('data-mode', mode);
      if (tabLogin) tabLogin.classList.toggle('active', mode === 'login');
      if (tabSignup) tabSignup.classList.toggle('active', mode === 'signup');

      if (tabLogin) tabLogin.setAttribute('aria-selected', String(mode === 'login'));
      if (tabSignup) tabSignup.setAttribute('aria-selected', String(mode === 'signup'));
      if (titleEl) titleEl.textContent = mode === 'signup' ? 'Vytvořte si účet' : 'Přihlaste se';
      if (subEl) subEl.textContent = mode === 'signup' ? 'Nový účet zdarma — stačí e-mail a heslo.' : 'Máte už účet? Zadejte e-mail a heslo.';
      if (submitBtn) submitBtn.textContent = mode === 'signup' ? 'Vytvořit účet zdarma' : 'Přihlásit se';
      if (passHint) passHint.textContent = mode === 'signup' ? '(aspoň 6 znaků)' : '';
      var pw = document.getElementById('au-pass'); if (pw) pw.setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
      if (forgotWrap) forgotWrap.hidden = (mode === 'signup');
      say('');
    }
    if (tabLogin) tabLogin.addEventListener('click', function () { setMode('login'); });
    if (tabSignup) tabSignup.addEventListener('click', function () { setMode('signup'); });
    setMode('login');

    var af = document.getElementById('auth-form');
    if (af) af.addEventListener('submit', function (e) {
      e.preventDefault(); var c = creds(); if (!okCreds(c) || !window.PKAuth) return;
      if (mode === 'signup') {
        say('Vytvářím účet…');
        PKAuth.signup(c.e, c.p).then(function (r) {
          if (r.ok && r.session) { refresh(); }
          else if (r.ok) { say('Účet vytvořen. Pokud přijde potvrzovací e-mail, potvrďte ho a přihlaste se.'); setMode('login'); }
          else { say(errText(r.data) || 'Účet se nepovedlo vytvořit — možná už existuje. Zkuste se přihlásit.', true); }
        });
      } else {
        say('Přihlašuji…');
        PKAuth.login(c.e, c.p).then(function (r) {
          if (r.ok) { refresh(); } else { say(errText(r.data) || 'Přihlášení se nepovedlo — zkontrolujte e-mail a heslo, nebo si dole resetujte heslo.', true); }
        });
      }
    });

    var fg = document.getElementById('au-forgot');
    if (fg) fg.addEventListener('click', function () {
      var c = creds();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.e)) { say('Napište nahoře svůj e-mail a pak klepněte na „Zapomněli jste heslo".', true); return; }
      say('Posílám odkaz…');
      PKAuth.recover(c.e).then(function () { say('Poslali jsme vám na e-mail odkaz pro nastavení nového hesla. Zkontrolujte i spam.'); });
    });
    var lo = document.getElementById('au-logout');
    if (lo) lo.addEventListener('click', function () { if (window.PKAuth) { PKAuth.logout(); refresh(); } });
  })();

  (function () {
    var vstup = document.getElementById('p-odjinud');
    var tlac = document.getElementById('p-odjinud-btn');
    var stav = document.getElementById('p-odjinud-stav');
    if (!vstup || !tlac || !stav) return;
    var DATA = null;

    function rekni(trida, text) {
      stav.hidden = !text;
      stav.className = 'odj-stav' + (trida ? ' ' + trida : '');
      stav.textContent = text || '';
    }
    function nastav(id, hodnota) {
      var el = document.getElementById(id);
      if (!el || hodnota == null || hodnota === '') return;
      el.value = hodnota;

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function nactiData() {
      if (DATA) return Promise.resolve(DATA);
      return fetch('data/opportunities.json', { cache: 'force-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { DATA = (j && j.opportunities) || []; return DATA; })
        .catch(function () { return []; });
    }

    tlac.addEventListener('click', function () {
      var url = (vstup.value || '').trim();
      var P = window.PKPredvyplneni;
      if (!P) return;
      if (!url) { rekni('nic', 'Vložte odkaz na svůj inzerát.'); return; }
      if (!P.normalizujOdkaz(url)) { rekni('nic', 'Tohle nevypadá jako odkaz. Zkuste ho zkopírovat z adresního řádku.'); return; }
      tlac.disabled = true;
      rekni('', 'Hledám…');
      nactiData().then(function (data) {
        tlac.disabled = false;

        var n = P.najdiVsePodleOdkazu(url, data);
        if (!n.length) {

          rekni('nic', 'Tenhle inzerát u sebe nemáme — vyplňte ho prosím ručně. ' +
            'Umíme předvyplnit z portálů, které sami procházíme (Bezrealitky, Farmy.cz, státní půda, dražební portály).');
          return;
        }
        var co = P.coDoplnit(n);
        Object.keys(co.hodnoty).forEach(function (id) { nastav(id, co.hodnoty[id]); });

        if (co.druh) {
          var sel = document.getElementById('p-druh');
          if (sel) {
            for (var i = 0; i < sel.options.length; i++) {
              if (sel.options[i].text.trim().toLowerCase() === co.druh.toLowerCase()) { sel.selectedIndex = i; break; }
            }
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        if (co.site.length && window.PKVybaveni) {
          var jmena = {};
          co.site.forEach(function (k) {
            if (k === 'cesta') return;
            var n = window.PKVybaveni.nazev(k);
            if (n) jmena[String(n).toLowerCase()] = true;
          });
          [].slice.call(document.querySelectorAll('input[name="site"]')).forEach(function (el) {
            if (jmena[String(el.value).toLowerCase()]) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
          });
        }

        rekni('ok', P.hlaska(co));
      });
    });
  })();

})();
