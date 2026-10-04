(function () {
  'use strict';

  function slug(text, i) {
    var z = String(text || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return 'oddil-' + (i + 1) + (z ? '-' + z.slice(0, 40) : '');
  }

  function postav() {

    var sekce = document.querySelector('.section .clanek');
    if (!sekce) return;
    sekce = sekce.closest('.section');
    var obal = sekce.querySelector('.add-wrap');
    if (!obal || obal.querySelector('.obsah')) return;

    var oddily = [].slice.call(sekce.querySelectorAll('.clanek .rules-sect'));

    if (oddily.length < 5) return;

    var nav = document.createElement('nav');
    nav.className = 'obsah';
    nav.setAttribute('aria-label', 'Obsah stránky');
    var nadpis = document.createElement('p');
    nadpis.className = 'obsah-nadpis';
    nadpis.textContent = 'Obsah';
    nav.appendChild(nadpis);
    var ol = document.createElement('ol');

    var cile = [];
    oddily.forEach(function (sec, i) {
      var h = sec.querySelector('h2, h3');
      if (!h) return;
      if (!sec.id) sec.id = slug(h.textContent, i);
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + sec.id;
      a.textContent = h.textContent.trim();
      li.appendChild(a);
      ol.appendChild(li);
      cile.push({ sec: sec, a: a });
    });
    if (!cile.length) return;
    nav.appendChild(ol);
    obal.insertBefore(nav, obal.firstChild);

    if (typeof IntersectionObserver !== 'function') return;
    var videne = Object.create(null);
    var pozorovatel = new IntersectionObserver(function (zaznamy) {
      zaznamy.forEach(function (z) {
        var i = cile.findIndex(function (c) { return c.sec === z.target; });
        if (i >= 0) videne[i] = z.isIntersecting;
      });
      var prvni = -1;
      for (var i = 0; i < cile.length; i++) if (videne[i]) { prvni = i; break; }
      cile.forEach(function (c, i) {
        if (i === prvni) c.a.setAttribute('aria-current', 'true');
        else c.a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-110px 0px -60% 0px' });
    cile.forEach(function (c) { pozorovatel.observe(c.sec); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', postav);
  } else {
    postav();
  }
})();
