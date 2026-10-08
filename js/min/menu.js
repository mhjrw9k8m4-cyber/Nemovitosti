(function (root) {
  'use strict';

  function oznacStranku(d, nav) {
    if (nav.getAttribute('data-lista') === 'ano') return;
    nav.setAttribute('data-lista', 'ano');

    var tady = (d.location && d.location.pathname || '').split('/').pop() || 'index.html';

    var podProfilem = { 'zpravy.html': 1, 'hlidani.html': 1 };
    var oznac = podProfilem[tady] ? 'muj-inzerat.html' : tady;
    var odkazy = nav.querySelectorAll('a[href]');
    for (var i = 0; i < odkazy.length; i++) {
      var h = odkazy[i].getAttribute('href') || '';
      if (h.charAt(0) === '#') continue;
      var cil = h.split('#')[0].split('?')[0].split('/').pop();
      if (cil && cil === oznac) odkazy[i].setAttribute('aria-current', 'page');
    }

  }

  function napoj(doc) {
    var d = doc || document;
    var nav = d.getElementById('nav');
    if (!nav) return false;
    oznacStranku(d, nav);
    return true;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { napoj: napoj };
  } else {
    root.PKMenu = { napoj: napoj };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { napoj(document); });
    } else {
      napoj(document);
    }
  }
}(typeof window !== 'undefined' ? window : globalThis));
