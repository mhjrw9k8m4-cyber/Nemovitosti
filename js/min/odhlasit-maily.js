(function () {
  'use strict';
  var el = document.getElementById('om-stav');
  if (!el) return;

  function rekni(text, trida) {
    el.textContent = text;
    el.className = 'om-uvod' + (trida ? ' ' + trida : '');
  }

  var token = '';
  try {
    token = new URLSearchParams(location.search).get('t') || '';
  } catch (e) { token = ''; }

  if (!token) {
    rekni('V odkazu chybí část za „?t=", bez které nevíme, koho odhlásit. '
      + 'Otevřete prosím odkaz z e-mailu celý, nebo posílání vypněte na stránce Hlídání.', 'om-chyba');
    return;
  }

  var URL_ = window.PK_SUPABASE_URL || '';
  var KLIC = window.PK_SUPABASE_KEY || '';
  if (!URL_ || !KLIC) {
    rekni('Nepovedlo se spojit s databází. Zkuste to prosím za chvíli znovu.', 'om-chyba');
    return;
  }

  fetch(URL_.replace(/\/+$/, '') + '/rest/v1/rpc/unsubscribe_mail', {
    method: 'POST',
    headers: { apikey: KLIC, Authorization: 'Bearer ' + KLIC, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  }).then(function (r) {
    if (!r.ok) throw new Error('stav ' + r.status);
    return r.json();
  }).then(function (vysledek) {

    if (vysledek === true) {
      rekni('Hotovo — e-maily s novými pozemky už vám posílat nebudeme.', 'om-hotovo');
    } else {
      rekni('Tenhle odkaz už neplatí. Nejspíš jste se odhlásili dřív; '
        + 'v tom případě vám pošta nechodí a není co dělat.', 'om-hotovo');
    }
  }).catch(function () {
    rekni('Odhlášení se teď nepovedlo. Zkuste to prosím za chvíli znovu, '
      + 'nebo posílání vypněte na stránce Hlídání.', 'om-chyba');
  });
})();
