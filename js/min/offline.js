(function () {
  if (!('serviceWorker' in navigator)) return;

  if (!window.isSecureContext) return;
  window.addEventListener('load', function () {
    try {
      navigator.serviceWorker.register('sw.js').then(hlidejNovouVerzi).catch(function () {});
    } catch (e) {   }
  });

  function hlidejNovouVerzi(reg) {
    if (!reg) return;

    var naposled = 0;
    function zeptejSe() {
      var ted = Date.now();
      if (ted - naposled < 30000) return;
      naposled = ted;
      try { reg.update(); } catch (e) {   }
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') zeptejSe();
    });
    window.addEventListener('pageshow', zeptejSe);
    window.addEventListener('focus', zeptejSe);
    if (!navigator.serviceWorker.controller) return;
    var uzSePrekreslilo = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (uzSePrekreslilo) return;
      uzSePrekreslilo = true;
      try { location.reload(); } catch (e) {}
    });
  }
}());
