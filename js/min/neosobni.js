(function (root) {
  'use strict';
  if (!root || !root.document) return;

  function smimePoslat() {
    try {
      var h = root.location.hostname;
      if (h !== 'parcelaka.cz' && h !== 'www.parcelaka.cz') return false;
      if (navigator.webdriver) return false;
      if (navigator.doNotTrack === '1' || root.doNotTrack === '1'
        || navigator.globalPrivacyControl === true) return false;
      if (!root.PK_SUPABASE_URL || !root.PK_SUPABASE_KEY) return false;
    } catch (e) { return false; }
    return true;
  }

  function jmenoStranky() {
    var c = (root.location.pathname || '/').split('/').pop();
    if (!c) return 'index.html';
    return c.toLowerCase().slice(0, 80);
  }

  function posliRpc(jmeno, telo) {
    var adresa = root.PK_SUPABASE_URL + '/rest/v1/rpc/' + jmeno;

    var sKlicem = adresa + '?apikey=' + encodeURIComponent(root.PK_SUPABASE_KEY);
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
          apikey: root.PK_SUPABASE_KEY,
          authorization: 'Bearer ' + root.PK_SUPABASE_KEY,
        },
        body: telo,
      }).catch(function () {});
    } catch (e) {}
  }

  root.PKNeosobni = {
    smimePoslat: smimePoslat,
    jmenoStranky: jmenoStranky,
    posliRpc: posliRpc,
  };
}(typeof window !== 'undefined' ? window : null));
