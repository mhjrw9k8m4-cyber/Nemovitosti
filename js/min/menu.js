(function (root) {
  'use strict';

  function napoj(doc) {
    var d = doc || document;
    var toggle = d.querySelector('.nav-toggle');
    var nav = d.getElementById('nav');
    if (!toggle || !nav) return false;

    if (toggle.getAttribute('data-menu') === 'ano') return true;
    toggle.setAttribute('data-menu', 'ano');

    function nastav(otevreno) {
      nav.classList.toggle('open', otevreno);
      toggle.setAttribute('aria-expanded', String(otevreno));
      toggle.setAttribute('aria-label', otevreno ? 'Zavřít menu' : 'Otevřít menu');
      d.body.classList.toggle('nav-open', otevreno);
    }
    function zavri() { if (nav.classList.contains('open')) nastav(false); }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      nastav(!nav.classList.contains('open'));
    });

    nav.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'A') zavri();
    });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') zavri(); });

    d.addEventListener('click', function (e) {
      if (!nav.classList.contains('open')) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      zavri();
    });
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
