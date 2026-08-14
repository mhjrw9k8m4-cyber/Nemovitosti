/* Sdílený skript pro stránky „Přidat pozemek na prodej" (pridat.html)
   a „Inzerce" (inzerce.html). Každá stránka má jeden formulář; skript
   napojí ten, který na stránce je. Samostatné od main.js — mapy hlavní
   stránky se vůbec nedotýká. */
(function () {
  'use strict';

  /* ---------- Mobilní menu ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' && nav.classList.contains('open')) {
        nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Toast ---------- */
  var toastEl = document.getElementById('toast');
  var toastT = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.removeAttribute('hidden');
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); setTimeout(function () { toastEl.setAttribute('hidden', ''); }, 300); }, 3200);
  }

  /* ---------- Odeslání (bez serveru, přes Formspree) ----------
     DŮLEŽITÉ: až doplníte Formspree URL do FORM_ENDPOINT (stejnou jako v js/main.js),
     začnou formuláře opravdu odesílat. Dokud je prázdné, běží „nanečisto":
     nic se neodešle a nikde netvrdíme, že zpráva dorazila. */
  var FORM_ENDPOINT = ''; // ← sem vlož URL z Formspree (např. https://formspree.io/f/abcdwxyz)
  function sendForm(data) {
    if (!FORM_ENDPOINT) return Promise.resolve('unset');
    return fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) { return r.ok ? 'ok' : 'error'; }).catch(function () { return 'error'; });
  }

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function checked(id) { var el = document.getElementById(id); return !!(el && el.checked); }
  // Kontakt: buď platný e-mail, nebo aspoň 9 číslic (české telefonní číslo)
  function validContact(v) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
    return (v.replace(/\D/g, '').length >= 9);
  }

  var OFFLINE = 'Formulář zatím dokončujeme — odesílání spustíme, jakmile připojíme e-mail. Děkujeme za trpělivost.';

  function handle(formId, msgId, buildData, validate, okMsg, toastMsg) {
    var form = document.getElementById(formId);
    if (!form) return;
    okMsg = okMsg || 'Děkujeme! Nabídku jsme přijali. Projdeme si ji a ozveme se, jakmile ji zveřejníme.';
    toastMsg = toastMsg || 'Nabídka odeslána ke zveřejnění.';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ms = document.getElementById(msgId);
      ms.classList.remove('err'); ms.textContent = '';
      var err = validate();
      if (err) { ms.textContent = err; ms.classList.add('err'); return; }
      if (!FORM_ENDPOINT) { ms.textContent = OFFLINE; return; }
      ms.textContent = 'Odesílám…';
      sendForm(buildData()).then(function (r) {
        if (r === 'ok') {
          ms.textContent = okMsg;
          showToast(toastMsg);
          form.reset();
        } else {
          ms.textContent = 'Odeslání se teď nepovedlo, zkuste to prosím za chvíli znovu.';
          ms.classList.add('err');
        }
      });
    });
  }

  // --- Prodej (pridat.html) ---
  handle('form-prodej', 'msg-prodej',
    function () {
      return {
        _subject: 'Nový pozemek na prodej — Pozemkomat',
        typ: 'Prodej pozemku',
        obec: val('p-obec'), okres: val('p-okres') || '(neuvedeno)',
        vymera_m2: val('p-vymera'), cena_kc: val('p-cena'),
        druh: val('p-druh') || '(neuvedeno)', parcela: val('p-parcela') || '(neuvedeno)',
        popis: val('p-popis') || '(bez popisu)', odkaz: val('p-odkaz') || '(neuvedeno)',
        jmeno: val('p-jmeno'), kontakt: val('p-kontakt')
      };
    },
    function () {
      if (!val('p-obec')) return 'Vyplňte prosím obec / lokalitu.';
      if (!(parseInt(val('p-vymera'), 10) > 0)) return 'Zadejte prosím výměru v m².';
      if (!(parseInt(val('p-cena'), 10) > 0)) return 'Zadejte prosím cenu v Kč.';
      if (!val('p-jmeno')) return 'Uveďte prosím své jméno.';
      if (!validContact(val('p-kontakt'))) return 'Zadejte platný telefon (9 číslic) nebo e-mail.';
      if (!checked('p-souhlas')) return 'Potvrďte prosím souhlas se zveřejněním.';
      return '';
    }
  );

  // --- Inzerce (inzerce.html) ---
  handle('form-inzerce', 'msg-inzerce',
    function () {
      return {
        _subject: 'Nová inzerce pozemku — Pozemkomat',
        typ: 'Inzerce: ' + (val('i-typ') || '(neuvedeno)'),
        lokalita: val('i-lokalita'), castka_kc: val('i-castka') || '(neuvedeno)',
        popis: val('i-popis'), jmeno: val('i-jmeno'), kontakt: val('i-kontakt')
      };
    },
    function () {
      if (!val('i-typ')) return 'Vyberte prosím typ inzerátu.';
      if (!val('i-lokalita')) return 'Vyplňte prosím lokalitu.';
      if (!val('i-popis')) return 'Napište prosím krátký popis.';
      if (!val('i-jmeno')) return 'Uveďte prosím své jméno.';
      if (!validContact(val('i-kontakt'))) return 'Zadejte platný telefon (9 číslic) nebo e-mail.';
      if (!checked('i-souhlas')) return 'Potvrďte prosím souhlas s pravidly a zveřejněním.';
      return '';
    }
  );

  // --- Nahlášení inzerátu (pravidla-inzerce.html) ---
  handle('form-report', 'msg-report',
    function () {
      return {
        _subject: 'Nahlášení inzerátu — Pozemkomat',
        typ: 'Nahlášení inzerátu',
        inzerat: val('r-ident'), duvod: val('r-duvod') || '(neuvedeno)',
        popis: val('r-popis') || '(bez popisu)', kontakt: val('r-kontakt') || '(neuvedeno)'
      };
    },
    function () {
      if (!val('r-ident')) return 'Uveďte prosím, kterého inzerátu se to týká.';
      if (!val('r-duvod')) return 'Vyberte prosím důvod nahlášení.';
      return '';
    },
    'Děkujeme za nahlášení. Podíváme se na to a případně inzerát stáhneme.',
    'Nahlášení odesláno.'
  );

})();
