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

      var kotva = h.indexOf('#') >= 0 ? h.slice(h.indexOf('#') + 1) : '';
      if (kotva.indexOf('=') >= 0) continue;
      var cil = h.split('#')[0].split('?')[0].split('/').pop();
      if (cil && cil === oznac) odkazy[i].setAttribute('aria-current', 'page');
    }

  }

  var BURGER_SVG = '<svg class="ik" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-menu"/></svg>';
  var KRIZEK_SVG = '<svg class="ik" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-zavrit"/></svg>';

  function postavPanel(d, nav) {
    if (nav.getAttribute('data-panel') === 'ano') return;
    nav.setAttribute('data-panel', 'ano');
    var wrap = nav.parentNode;
    if (!wrap) return;

    var burger = d.createElement('button');
    burger.type = 'button';
    burger.className = 'nav-burger';
    burger.setAttribute('aria-controls', 'nav');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Otevřít nabídku');
    burger.innerHTML = BURGER_SVG;

    wrap.insertBefore(burger, wrap.firstChild);

    var stin = d.createElement('div');
    stin.className = 'nav-stin';
    stin.hidden = true;
    wrap.appendChild(stin);

    var zavrit = d.createElement('button');
    zavrit.type = 'button';
    zavrit.className = 'nav-zavrit';
    zavrit.setAttribute('aria-label', 'Zavřít nabídku');
    zavrit.innerHTML = KRIZEK_SVG;

    var hlava = nav.querySelector('.nav-hlava');
    if (hlava) hlava.appendChild(zavrit);
    else nav.insertBefore(zavrit, nav.firstChild);

    function otevreno() { return d.body.classList.contains('nav-otevreno'); }
    function prepni(na) {
      d.body.classList.toggle('nav-otevreno', na);
      burger.setAttribute('aria-expanded', na ? 'true' : 'false');
      burger.setAttribute('aria-label', na ? 'Zavřít nabídku' : 'Otevřít nabídku');
      stin.hidden = !na;

      if (na) { try { zavrit.focus(); } catch (e) {   } }
      else { try { burger.focus(); } catch (e) {   } }
    }

    burger.addEventListener('click', function () { prepni(!otevreno()); });
    zavrit.addEventListener('click', function () { prepni(false); });
    stin.addEventListener('click', function () { prepni(false); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && otevreno()) prepni(false);
    });
    nav.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (a && otevreno()) prepni(false);
    });

    if (root.matchMedia) {
      var mq = root.matchMedia('(min-width:1041px)');
      var hlid = function (ev) { if (ev.matches && otevreno()) prepni(false); };
      if (mq.addEventListener) mq.addEventListener('change', hlid);
      else if (mq.addListener) mq.addListener(hlid);
    }
  }

  function napoj(doc) {
    var d = doc || document;
    var nav = d.getElementById('nav');
    if (!nav) return false;
    oznacStranku(d, nav);
    postavPanel(d, nav);
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
