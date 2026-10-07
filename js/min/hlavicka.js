(function () {
  'use strict';
  var h = document.querySelector('header');
  if (!h) return;

  var PRAH = 40;
  var PAUZA = 180;
  var casovac = null, ramecek = null;
  var zhasnuta = false;
  var vv = window.visualViewport || null;

  function poloha() {
    return [
      Math.round(window.pageYOffset || document.documentElement.scrollTop || 0),
      vv ? Math.round(vv.offsetTop) : 0,
      vv ? Math.round(vv.height) : 0,
      vv ? Math.round(vv.pageTop || 0) : 0
    ].join('|');
  }
  function uVrcholu() {
    return (window.pageYOffset || document.documentElement.scrollTop || 0) <= PRAH;
  }
  function musiSvitit() {
    return document.body.classList.contains('nav-open') || h.contains(document.activeElement);
  }

  function rozsvit() {
    if (!zhasnuta) return;
    zhasnuta = false;
    h.classList.remove('hl-zhasnuta');
    h.classList.remove('hl-prijezd');

    void h.offsetWidth;
    h.classList.add('hl-prijezd');
  }
  h.addEventListener('animationend', function (e) {
    if (e.animationName === 'hlPrijezd') h.classList.remove('hl-prijezd');
  });
  function zhasni() {
    if (zhasnuta || musiSvitit()) return;
    zhasnuta = true;

    h.classList.remove('hl-prijezd');
    h.classList.add('hl-zhasnuta');
  }

  function azPoKlidu() {
    if (ramecek) cancelAnimationFrame(ramecek);
    var minula = poloha(), stejne = 0;
    (function krok() {
      var ted = poloha();
      if (ted === minula) {
        stejne++;
        if (stejne >= 2) { rozsvit(); ramecek = null; return; }
      } else {
        stejne = 0;
        minula = ted;
      }
      ramecek = requestAnimationFrame(krok);
    }());
  }

  function pohyb() {
    if (uVrcholu()) {

      clearTimeout(casovac);
      if (ramecek) { cancelAnimationFrame(ramecek); ramecek = null; }
      rozsvit();
      return;
    }
    zhasni();
    clearTimeout(casovac);
    if (ramecek) { cancelAnimationFrame(ramecek); ramecek = null; }
    casovac = setTimeout(azPoKlidu, PAUZA);
  }

  window.addEventListener('scroll', pohyb, { passive: true });

  if (vv) {
    vv.addEventListener('scroll', pohyb, { passive: true });
    vv.addEventListener('resize', pohyb, { passive: true });
  }
  window.addEventListener('orientationchange', pohyb, { passive: true });

  h.addEventListener('focusin', rozsvit);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Tab') rozsvit();
  });
})();

(function () {
  'use strict';
  function vypln() {
    var stav = document.getElementById('nav-stav');
    var odkaz = document.getElementById('nav-ucet');
    if (!stav || !odkaz) return;
    var A = window.PKAuth;
    var prihlasen = !!(A && A.loggedIn && A.loggedIn());
    odkaz.classList.toggle('je-prihlasen', prihlasen);

    try {
      var k = document.documentElement.classList;
      k.toggle('pk-prihlasen', prihlasen);
      k.toggle('pk-odhlasen', !prihlasen);
    } catch (e) {}
    var skupina = odkaz.closest ? odkaz.closest('.nav-moje') : null;
    if (skupina) skupina.classList.toggle('prihlasen', prihlasen);
    if (!prihlasen) { stav.textContent = 'Nepřihlášeno'; return; }
    var mail = (A.email && A.email()) || '';

    if (mail.length > 26) {
      var zav = mail.indexOf('@');
      if (zav > 3) mail = mail.slice(0, Math.max(3, 24 - (mail.length - zav))) + '…' + mail.slice(zav);
    }
    stav.textContent = mail || 'Přihlášeno';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', vypln);
  } else { vypln(); }

  window.addEventListener('storage', vypln);
  window.addEventListener('pk-auth', vypln);

  try {
    if (window.PKAuth && PKAuth.keepAlive && PKAuth.loggedIn && PKAuth.loggedIn()) {
      PKAuth.keepAlive().then(vypln, vypln);
    }
  } catch (e) {}
})();

(function () {
  'use strict';
  var PRAH_POSUNU = 500;
  var PRAH_OBRAZOVEK = 3;

  var b = document.getElementById('to-top');
  if (!b) {
    b = document.createElement('button');
    b.id = 'to-top';
    b.className = 'to-top';
    b.type = 'button';
    b.setAttribute('aria-label', 'Zpět nahoru');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M12 19V6M6 12l6-6 6 6"/></svg><span>Nahoru</span>';
    (document.body || document.documentElement).appendChild(b);
  }

  var vyskaStranky = 0, vysKna = 0, cekaRam = false;

  function premer() {
    cekaRam = false;
    vyskaStranky = document.documentElement.scrollHeight;
    vysKna = window.innerHeight;

    prekresli();
  }
  function premerPozdeji() {
    if (cekaRam) return;
    cekaRam = true;
    (window.requestAnimationFrame || setTimeout)(premer);
  }

  function prekresli() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var dlouha = vyskaStranky > vysKna * PRAH_OBRAZOVEK;

    b.classList.toggle('show', dlouha && y > PRAH_POSUNU);
  }

  window.addEventListener('scroll', prekresli, { passive: true });
  window.addEventListener('resize', premerPozdeji, { passive: true });

  if ('ResizeObserver' in window && document.body) {
    try { new ResizeObserver(premerPozdeji).observe(document.body); } catch (e) {}
  }

  window.addEventListener('load', premerPozdeji);
  premer();

  b.addEventListener('click', function (e) {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (e.detail !== 0) return;
    var cil = document.querySelector('.skip-link') || document.querySelector('header a');
    if (cil) { try { cil.focus({ preventScroll: true }); } catch (x) { cil.focus(); } }
  });
})();
