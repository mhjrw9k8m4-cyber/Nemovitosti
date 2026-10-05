(function () {
  if (!('serviceWorker' in navigator)) return;

  if (!window.isSecureContext) return;
  window.addEventListener('load', function () {
    try {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    } catch (e) {   }
  });
}());
