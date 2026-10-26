(function (root) {
  'use strict';

  var URL_ = root.PK_SUPABASE_URL || '';
  var KLIC = root.PK_SUPABASE_KEY || '';

  var H = {
    chybiPovinne: 'Vyplňte prosím označené pole.',
    posilam: 'Odesílám…',
    hotovo: 'Děkujeme, zpráva dorazila. Ozveme se.',
    chyba: 'Odeslání se nepovedlo. Zkuste to prosím za chvíli znovu.',
    bezSpojeni: 'Nepovedlo se spojit s databází. Zkuste to prosím za chvíli znovu.',
  };

  function popisPole(el) {
    var l = el.id && document.querySelector('label[for="' + el.id + '"]');
    return (l && l.firstChild && (l.firstChild.textContent || '').trim()) || 'pole';
  }

  function oznacChybu(el, hlaska, text) {
    el.setAttribute('aria-invalid', 'true');
    if (hlaska) {
      hlaska.textContent = text;
      hlaska.className = 'st-hlaska je-chyba';
    }
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function posli(telo) {
    return fetch(URL_.replace(/\/+$/, '') + '/rest/v1/messages', {
      method: 'POST',
      headers: {
        apikey: KLIC, Authorization: 'Bearer ' + KLIC,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(telo),
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  function obsluz(form) {
    var hlaska = document.getElementById(form.getAttribute('data-pk-hlaska') || '');
    var druh = form.getAttribute('data-pk-druh') || 'kontakt';
    var tlacitko = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.getAttribute('aria-busy') === 'true') return;

      var pole = form.querySelectorAll('input[name], select[name], textarea[name]');
      var radky = [], i, el;
      for (i = 0; i < pole.length; i++) pole[i].removeAttribute('aria-invalid');
      for (i = 0; i < pole.length; i++) {
        el = pole[i];
        var hodnota = (el.value || '').trim();
        if (el.hasAttribute('required') && !hodnota) {
          oznacChybu(el, hlaska, 'Vyplňte prosím pole „' + popisPole(el) + '".');
          return;
        }
        if (hodnota) radky.push(popisPole(el) + ': ' + hodnota);
      }

      if (!URL_ || !KLIC) {
        if (hlaska) { hlaska.textContent = H.bezSpojeni; hlaska.className = 'st-hlaska je-chyba'; }
        return;
      }

      var jmeno = form.querySelector('[name="jmeno"]');
      var kontakt = form.querySelector('[name="kontakt"]') || form.querySelector('[name="email"]');

      form.setAttribute('aria-busy', 'true');
      if (tlacitko) tlacitko.disabled = true;
      if (hlaska) { hlaska.textContent = H.posilam; hlaska.className = 'st-hlaska'; }

      posli({
        kind: druh,
        name: (jmeno && jmeno.value.trim()) || null,
        email: (kontakt && kontakt.value.trim()) || null,
        message: radky.join('\n'),
      }).then(function (ok) {
        form.removeAttribute('aria-busy');
        if (tlacitko) tlacitko.disabled = false;
        if (!hlaska) return;
        if (ok) {
          hlaska.textContent = H.hotovo;
          hlaska.className = 'st-hlaska je-ok';
          form.reset();
        } else {
          hlaska.textContent = H.chyba;
          hlaska.className = 'st-hlaska je-chyba';
        }
      });
    });
  }

  function start() {
    var f = document.querySelectorAll('form[data-pk-formular]');
    for (var i = 0; i < f.length; i++) obsluz(f[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }

  root.PKFormular = { H: H };
}(typeof window !== 'undefined' ? window : this));
