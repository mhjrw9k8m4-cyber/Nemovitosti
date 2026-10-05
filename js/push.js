/* ZAPNUTÍ UPOZORNĚNÍ DO TELEFONU (push) — strana prohlížeče.
 *
 * Používá to hlidani.html u jednotlivého uloženého hledání. Zprávu pak
 * zobrazí service worker (sw.js, obsluha „push").
 *
 * PROČ TO NENÍ JEN JEDEN PŘEPÍNAČ. Mezi „chci upozornění" a „upozornění
 * chodí" stojí tři věci, z nichž každá může chybět zvlášť:
 *   1. prohlížeč to musí umět (starší iOS neumí push mimo nainstalovanou
 *      aplikaci na plochu),
 *   2. člověk musí povolit oznámení — a když je jednou ZAKÁŽE, prohlížeč
 *      se už nikdy nezeptá a web s tím nic neudělá; jde to změnit jen
 *      v nastavení prohlížeče,
 *   3. odběr se musí uložit na server, aby bylo komu poslat.
 * Každá z nich má vlastní návratový stav, protože „nepovedlo se" by
 * člověka nechalo hádat, co má udělat.
 *
 * ŽÁDOST O POVOLENÍ PADNE JEN PO KLEPNUTÍ. Prohlížeče žádost mimo
 * uživatelské gesto zahazují (a je to správně — vyskakovací žádost na
 * uvítání je důvod, proč lidé oznámení zakazují paušálně).
 *
 * Bez veřejného klíče VAPID (window.PK_PUSH_VEREJNY_KLIC) se nedá udělat
 * nic: odběr bez něj nevznikne. Dokud není nastavený, hlidani.html
 * přepínač vůbec nevykreslí — přepínač, po kterém nikdy nic nepřijde, je
 * slib, který web nemůže dodržet.
 */
(function (global) {
  'use strict';

  function klic() { return String(global.PK_PUSH_VEREJNY_KLIC || ''); }

  /** Dá se push na tomhle zařízení vůbec použít? */
  function umi() {
    return !!(klic() && global.isSecureContext
      && 'serviceWorker' in navigator && 'PushManager' in global && 'Notification' in global);
  }

  /* Veřejný klíč jde do prohlížeče jako bajty, ne jako text. */
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

  /** Stav bez ptaní a bez vedlejších účinků — pro vykreslení přepínače. */
  function stav() {
    if (!umi()) return 'neumí';
    if (Notification.permission === 'denied') return 'zakázáno';
    if (Notification.permission === 'granted') return 'povoleno';
    return 'nezeptáno';
  }

  /** Zapne odběr. Vrací Promise se stavem: 'hotovo' | 'zakázáno' | 'neumí' | 'chyba'. */
  function zapni(rpc) {
    if (!umi()) return Promise.resolve('neumí');
    return Promise.resolve()
      .then(function () { return Notification.requestPermission(); })
      .then(function (p) {
        if (p !== 'granted') return 'zakázáno';
        return navigator.serviceWorker.ready.then(function (reg) {
          /* Existující odběr se znovu nezakládá — jen se znovu uloží,
             protože server o něm vědět nemusí (nový účet, smazaný řádek). */
          return reg.pushManager.getSubscription().then(function (mam) {
            if (mam) return mam;
            return reg.pushManager.subscribe({
              /* Bez tohohle prohlížeče odběr nedají: zpráva se musí vždy
                 ukázat člověku, nesmí se použít k tichému běhu na pozadí.
                 sw.js to drží — vždycky něco zobrazí. */
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

  /** Zruší odběr tohoto zařízení (u všech hledání naráz — je to zařízení). */
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
