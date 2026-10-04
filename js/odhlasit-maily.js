/* ODHLÁŠENÍ Z E-MAILŮ — jedním klikem, bez přihlášení.
   ------------------------------------------------------------------
   Kdo se odhlašuje, nebude se kvůli tomu přihlašovat. Odkaz z e-mailu
   nese token (?t=…) a ten stačí: funkce unsubscribe_mail v databázi
   podle něj najde účet, vypne posílání a vrátí true. Token je náhodné
   uuid a nic jiného s ním nejde — přečíst z něj data ani přihlásit se
   pod cizí účet.

   STRÁNKA ODHLAŠUJE SAMA, bez dalšího tlačítka. Klik v e-mailu JE ten
   souhlas; nutit člověka klikat podruhé je zdržování, a některé poštovní
   klienty odkaz předběžně otevírají, takže druhé tlačítko by znamenalo
   „odhlášení se nepovedlo" u lidí, kteří nic neudělali špatně. */
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
    /* Funkce vrací false, když token nikam nepatří — třeba u odkazu
       z e-mailu, po kterém se už odhlásilo. Říká se to narovinu: pro
       člověka je výsledek stejný (pošta nechodí), ale „hotovo" u odkazu,
       který nic neudělal, by byla lež. */
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
