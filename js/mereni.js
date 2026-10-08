/* MĚŘENÍ NÁVŠTĚVNOSTI — JEDEN ČÍTAČ, ŽÁDNÝ NÁVŠTĚVNÍK
   ==================================================================
   Web má 2 183 stránek a dosud nikdo nevěděl, jestli na ně někdo chodí.
   Tohle je nejmenší možná odpověď na tu otázku.

   CO SE ODESÍLÁ. Čtyři věci, všechny neosobní:
     • jméno stránky  — „pozemky-okres-tabor.html"
     • doména odkazu  — „google.com", NIKDY celá adresa
     • druh displeje  — „mobil" nebo „stolni"
     • jestli tím začala relace (abychom poznali návštěvy od zobrazení)

   CO SE NEODESÍLÁ: nic víc. Žádná cookie, žádný identifikátor, žádný
   otisk prohlížeče, žádná IP (tu nezapisuje ani databáze). Na druhé
   straně nevzniká řádek za návštěvu, jen se zvedne čítač — viz
   supabase/navstevnost.sql. Z toho, co se uloží, se nedá zpětně
   poznat, kdo kde byl, protože ta informace nikdy neexistovala.
   Proto k tomu není potřeba souhlas ani lišta.

   CELÁ ADRESA ODKAZUJÍCÍHO SE ZAHAZUJE TADY, NE AŽ NA SERVERU.
   „https://mail.seznam.cz/…?token=…" nebo odkaz ze sdílené konverzace
   umí nést i jméno člověka. Z referreru se proto bere jen hostitel,
   a to ještě před odesláním.

   KDY SE NEMĚŘÍ VŮBEC:
     • mimo ostrý web (localhost, náhledy, soubor z disku),
     • když prohlížeč posílá „nesledovat" (DNT nebo Global Privacy
       Control). Technicky bychom mohli — čítač nikoho nesleduje — ale
       kdo si to zapnul, říká tím, že si nepřeje být započítán, a to je
       vůle, ne právní formulace,
     • při automatizovaném prohlížeči (navigator.webdriver), ať vlastní
       zkoušky nekazí čísla,
     • když stránka není vidět (předběžné načtení na pozadí).

   NESMÍ NIC ZPOMALIT. Posílá se přes sendBeacon, tedy mimo vykreslení
   a bez čekání na odpověď; když není, použije se fetch s keepalive.
   Selhání se ignoruje — měření nemá nikdy rozbít stránku.
   ================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.document) return;

  var KLIC_RELACE = 'pk_mereni_relace';

  function mamMerit() {
    try {
      var h = location.hostname;
      if (h !== 'parcelaka.cz' && h !== 'www.parcelaka.cz') return false;
      if (navigator.webdriver) return false;
      if (navigator.doNotTrack === '1' || window.doNotTrack === '1'
        || navigator.globalPrivacyControl === true) return false;
      if (document.visibilityState === 'prerender') return false;
      if (!window.PK_SUPABASE_URL || !window.PK_SUPABASE_KEY) return false;
    } catch (e) { return false; }
    return true;
  }

  /* „pozemek-benesov-benesov-rsg5bb.html". Kořen webu je index.html. */
  function jmenoStranky() {
    var c = (location.pathname || '/').split('/').pop();
    if (!c) return 'index.html';
    return c.toLowerCase().slice(0, 80);
  }

  /* Z odkazujícího jen doména, a jen cizí — proklik v rámci webu není
     zdroj návštěvy, byl by to jen šum převyšující všechno ostatní. */
  function zdroj() {
    try {
      var r = document.referrer;
      if (!r) return '';
      var u = new URL(r);
      var h = (u.hostname || '').toLowerCase().replace(/^www\./, '');
      if (h === 'parcelaka.cz') return '';
      return h.slice(0, 60);
    } catch (e) { return ''; }
  }

  function zarizeni() {
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return 'mobil';
      return (window.innerWidth || 1024) < 700 ? 'mobil' : 'stolni';
    } catch (e) { return 'stolni'; }
  }

  /* První stránka v této relaci? sessionStorage žije jen v téhle
     záložce a nepřenáší se nikam — není to identifikátor, je to
     „už jsem tu dnes v tomhle okně byl". */
  function prvniVRelaci() {
    try {
      if (sessionStorage.getItem(KLIC_RELACE)) return false;
      sessionStorage.setItem(KLIC_RELACE, '1');
      return true;
    } catch (e) { return false; }   /* zakázané úložiště → počítá se jen zobrazení */
  }

  function posli() {
    if (!mamMerit()) return;
    var telo;
    try {
      telo = JSON.stringify({
        p_stranka: jmenoStranky(),
        p_zdroj: zdroj(),
        p_zarizeni: zarizeni(),
        p_prvni: prvniVRelaci(),
      });
    } catch (e) { return; }

    var adresa = window.PK_SUPABASE_URL + '/rest/v1/rpc/zapis_navstevu';
    /* sendBeacon neumí vlastní hlavičky, a Supabase chce klíč. Jde
       poslat v adrese — je to veřejný publishable klíč, přesně k tomu
       určený. Když beacon není nebo odmítne, zkusí se fetch. */
    var sKlicem = adresa + '?apikey=' + encodeURIComponent(window.PK_SUPABASE_KEY);
    try {
      if (navigator.sendBeacon) {
        var b = new Blob([telo], { type: 'application/json' });
        if (navigator.sendBeacon(sKlicem, b)) return;
      }
    } catch (e) {}
    try {
      fetch(adresa, {
        method: 'POST', keepalive: true,
        headers: {
          'content-type': 'application/json',
          apikey: window.PK_SUPABASE_KEY,
          authorization: 'Bearer ' + window.PK_SUPABASE_KEY,
        },
        body: telo,
      }).catch(function () {});
    } catch (e) {}
  }

  /* Až po načtení: měření se nemá prát s vykreslením o hlavní vlákno. */
  if (document.readyState === 'complete') setTimeout(posli, 0);
  else window.addEventListener('load', function () { setTimeout(posli, 0); });
}());
