// Pozemkomat — landing interactivity
(function () {
  'use strict';

  // Mobile navigation toggle
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
    });

    // Close menu after clicking a link (mobile)
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Otevřít menu');
      }
    });
  }

  // Copy embed code to clipboard
  var copyBtns = document.querySelectorAll('.copy-btn');
  Array.prototype.forEach.call(copyBtns, function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.getAttribute('data-copy-target'));
      if (!target) return;
      var text = target.innerText;

      var done = function () {
        var original = btn.textContent;
        btn.textContent = 'Zkopírováno ✓';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 1800);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else {
        fallback();
      }

      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (err) { /* noop */ }
        document.body.removeChild(ta);
      }
    });
  });

  // Alert form (demo — zatím bez serveru, jen ověří e-mail a poděkuje)
  var form = document.getElementById('alert-form');
  var msg = document.getElementById('form-msg');
  if (form && msg) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.querySelector('#email').value.trim();
      var okres = form.querySelector('#okres').value.trim();
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      if (!valid) {
        msg.textContent = 'Zadejte prosím platný e-mail.';
        msg.classList.add('err');
        return;
      }
      msg.classList.remove('err');
      msg.textContent = okres
        ? 'Hotovo! Budeme hlídat okolí „' + okres + '" a dáme vědět. (ukázka — zatím se nikam neodesílá)'
        : 'Hotovo! Přihlášeno k odběru. (ukázka — zatím se nikam neodesílá)';
      form.reset();
    });
  }
})();
