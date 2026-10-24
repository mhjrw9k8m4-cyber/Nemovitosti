(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.document) return;

  var KLIC_RELACE = 'pk_mereni_relace';

  function mamMerit() {
    var N = window.PKNeosobni;
    if (!N || !N.smimePoslat()) return false;

    try { if (document.visibilityState === 'prerender') return false; } catch (e) { return false; }
    return true;
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
        p_stranka: window.PKNeosobni.jmenoStranky(),
        p_zdroj: zdroj(),
        p_zarizeni: zarizeni(),
        p_prvni: prvniVRelaci(),
      });
    } catch (e) { return; }

    window.PKNeosobni.posliRpc('zapis_navstevu', telo);
  }

  if (document.readyState === 'complete') setTimeout(posli, 0);
  else window.addEventListener('load', function () { setTimeout(posli, 0); });
}());
