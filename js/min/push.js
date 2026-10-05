(function (global) {
  'use strict';

  function klic() { return String(global.PK_PUSH_VEREJNY_KLIC || ''); }

  function umi() {
    return !!(klic() && global.isSecureContext
      && 'serviceWorker' in navigator && 'PushManager' in global && 'Notification' in global);
  }

  function zBase64url(s) {
    var d = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (d.length % 4) d += '=';
    var raw = global.atob(d);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function naBase64url(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return global.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function stav() {
    if (!umi()) return 'neumí';
    if (Notification.permission === 'denied') return 'zakázáno';
    if (Notification.permission === 'granted') return 'povoleno';
    return 'nezeptáno';
  }

  function zapni(rpc) {
    if (!umi()) return Promise.resolve('neumí');
    return Promise.resolve()
      .then(function () { return Notification.requestPermission(); })
      .then(function (p) {
        if (p !== 'granted') return 'zakázáno';
        return navigator.serviceWorker.ready.then(function (reg) {

          return reg.pushManager.getSubscription().then(function (mam) {
            if (mam) return mam;
            return reg.pushManager.subscribe({

              userVisibleOnly: true,
              applicationServerKey: zBase64url(klic())
            });
          });
        }).then(function (odber) {
          var j = odber.toJSON ? odber.toJSON() : null;
          var p256dh = (j && j.keys && j.keys.p256dh) || naBase64url(odber.getKey('p256dh'));
          var auth = (j && j.keys && j.keys.auth) || naBase64url(odber.getKey('auth'));
          return rpc('push_odber_uloz', { p_endpoint: odber.endpoint, p_p256dh: p256dh, p_auth: auth }, true)
            .then(function (res) { return (res && res.error) ? 'chyba' : 'hotovo'; });
        });
      })
      .catch(function () { return 'chyba'; });
  }

  function vypni(rpc) {
    if (!('serviceWorker' in navigator)) return Promise.resolve('hotovo');
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (odber) {
      if (!odber) return 'hotovo';
      var adresa = odber.endpoint;
      return odber.unsubscribe().then(function () {
        return rpc('push_odber_smaz', { p_endpoint: adresa }, true);
      }).then(function () { return 'hotovo'; });
    }).catch(function () { return 'chyba'; });
  }

  global.PKPush = { umi: umi, stav: stav, zapni: zapni, vypni: vypni };
}(typeof self !== 'undefined' ? self : this));
