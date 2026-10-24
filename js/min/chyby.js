(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.document) return;

  var STROP_STRANKA = 3;
  var STROP_RELACE = 8;
  var KLIC_RELACE = 'pk_chyby_poslano';

  var videne = {};
  var poslanoZeStranky = 0;
  var uvnitr = false;
  var pripraveno = false;
  var cekam = [];

  function mamHlasit() {
    var N = window.PKNeosobni;
    return !!(N && N.smimePoslat());
  }

  function prohlizec() {
    try {
      var u = navigator.userAgent || '';
      var vzory = [
        [/Edg\/(\d+)/, 'edge'],
        [/SamsungBrowser\/(\d+)/, 'samsung'],
        [/OPR\/(\d+)/, 'opera'],
        [/Firefox\/(\d+)/, 'firefox'],
        [/Chrome\/(\d+)/, 'chrome'],
        [/Version\/(\d+).*Safari/, 'safari'],
      ];
      for (var i = 0; i < vzory.length; i++) {
        var m = u.match(vzory[i][0]);
        if (m) return vzory[i][1] + '-' + String(m[1]).slice(0, 3);
      }
    } catch (e) {}
    return 'jine';
  }

  function cistaHlaska(z) {
    var t = '';
    try { t = String(z == null ? '' : z); } catch (e) { return ''; }

    t = t.replace(/https?:\/\/\S+/g, function (a) {
      try { return '‹' + (new URL(a).pathname.split('/').pop() || 'adresa') + '›'; }
      catch (e) { return '‹adresa›'; }
    });
    t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '‹e-mail›');
    t = t.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return t.slice(0, 200);
  }

  function misto(soubor, radek, sloupec) {
    var c;
    try {
      if (!soubor) return '';
      var u = new URL(String(soubor), location.href);
      if (u.origin !== location.origin) return '';
      c = decodeURIComponent(u.pathname).replace(/^\//, '').toLowerCase();
    } catch (e) { return ''; }
    if (!/^[a-z0-9._/-]{1,60}$/.test(c)) return '';
    var r = Math.max(0, Math.min(parseInt(radek, 10) || 0, 999999));
    var s = Math.max(0, Math.min(parseInt(sloupec, 10) || 0, 999999));
    return c + ':' + r + ':' + s;
  }

  function vRelaciJeste() {
    try {
      var n = parseInt(sessionStorage.getItem(KLIC_RELACE) || '0', 10) || 0;
      if (n >= STROP_RELACE) return false;
      sessionStorage.setItem(KLIC_RELACE, String(n + 1));
      return true;
    } catch (e) { return true; }
  }

  function nahlas(z) {

    if (!pripraveno) { if (cekam.length < 20) cekam.push(z); return; }
    if (uvnitr) return;
    uvnitr = true;
    try {
      if (!mamHlasit()) return;
      if (poslanoZeStranky >= STROP_STRANKA) return;
      var hlaska = cistaHlaska(z && z[0]);
      if (hlaska.length < 3) return;

      if (/^script error/i.test(hlaska)) return;
      var kde = misto(z && z[1], z && z[2], z && z[3]);
      var klic = hlaska + '|' + kde;
      if (videne[klic]) return;
      videne[klic] = 1;
      if (!vRelaciJeste()) return;
      poslanoZeStranky++;
      window.PKNeosobni.posliRpc('zapis_chybu', JSON.stringify({
        p_stranka: window.PKNeosobni.jmenoStranky(),
        p_zprava: hlaska,
        p_zdroj: kde,
        p_prohlizec: prohlizec(),
      }));
    } catch (e) {
    } finally { uvnitr = false; }
  }

  function rozjed() {
    pripraveno = true;
    var q = cekam;
    cekam = [];
    for (var i = 0; i < q.length; i++) nahlas(q[i]);
  }
  if (document.readyState === 'complete') setTimeout(rozjed, 0);
  else window.addEventListener('load', function () { setTimeout(rozjed, 0); });

  var fronta = window.PK_CHYBY;
  if (fronta && typeof fronta.length === 'number') {
    var cekajici = fronta.slice(0, 20);
    fronta.length = 0;
    fronta.push = function (z) { nahlas(z); return 0; };
    for (var i = 0; i < cekajici.length; i++) nahlas(cekajici[i]);
  } else {
    window.PK_CHYBY = { push: function (z) { nahlas(z); return 0; } };
    window.addEventListener('error', function (e) {
      nahlas([e && e.message, e && e.filename, e && e.lineno, e && e.colno]);
    });
    window.addEventListener('unhandledrejection', function (e) {
      var d = e && e.reason;
      nahlas([(d && d.message) || String(d || ''), '', 0, 0]);
    });
  }
}());
