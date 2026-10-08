(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.document) return;

  var KLIC_RELACE = 'pk_mereni_relace';

  function mamMerit() {
    try {
      var h = location.hostname;
      if (h !== 'parcelaka.cz' && h !== 'www.parcelaka.cz') return false;
      if (navigator.webdriver) return false;
      if (navigator.doNotTrack === '1' || window.doNotTrack === '1'
        || navigator.globalPrivacyControl === true) return false;
      if (document.visibilityState === 'prerender') return false;
      if (!window.PK_SUPABASE_URL || !window.PK_SUPABASE_KEY) return false;
    } catch (e) { return false; }
    return true;
  }

  function jmenoStranky() {
    var c = (location.pathname || '/').split('/').pop();
    if (!c) return 'index.html';
    return c.toLowerCase().slice(0, 80);
  }

  function zdroj() {
    try {
      var r = document.referrer;
      if (!r) return '';
      var u = new URL(r);
      var h = (u.hostname || '').toLowerCase().replace(/^www\./, '');
      if (h === 'parcelaka.cz') return '';
      return h.slice(0, 60);
    } catch (e) { return ''; }
  }

  function zarizeni() {
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return 'mobil';
      return (window.innerWidth || 1024) < 700 ? 'mobil' : 'stolni';
    } catch (e) { return 'stolni'; }
  }

  function prvniVRelaci() {
    try {
      if (sessionStorage.getItem(KLIC_RELACE)) return false;
      sessionStorage.setItem(KLIC_RELACE, '1');
      return true;
    } catch (e) { return false; }
  }

  function posli() {
    if (!mamMerit()) return;
    var telo;
    try {
      telo = JSON.stringify({
        p_stranka: jmenoStranky(),
        p_zdroj: zdroj(),
        p_zarizeni: zarizeni(),
        p_prvni: prvniVRelaci(),
      });
    } catch (e) { return; }

    var adresa = window.PK_SUPABASE_URL + '/rest/v1/rpc/zapis_navstevu';

    var sKlicem = adresa + '?apikey=' + encodeURIComponent(window.PK_SUPABASE_KEY);
    try {
      if (navigator.sendBeacon) {
        var b = new Blob([telo], { type: 'application/json' });
        if (navigator.sendBeacon(sKlicem, b)) return;
      }
    } catch (e) {}
    try {
      fetch(adresa, {
        method: 'POST', keepalive: true,
        headers: {
          'content-type': 'application/json',
          apikey: window.PK_SUPABASE_KEY,
          authorization: 'Bearer ' + window.PK_SUPABASE_KEY,
        },
        body: telo,
      }).catch(function () {});
    } catch (e) {}
  }

  if (document.readyState === 'complete') setTimeout(posli, 0);
  else window.addEventListener('load', function () { setTimeout(posli, 0); });
}());
