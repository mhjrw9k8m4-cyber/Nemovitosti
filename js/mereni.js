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

  /* Stráže, jméno stránky a cesta ven jsou v js/neosobni.js — stejné
     pravidlo platí i pro hlášení chyb (js/chyby.js) a napsané dvakrát
     by to jedno pravidlo nebylo. Který soubor je na stránce dřív,
     hlídá scripts/test-neosobni.mjs. */
  function mamMerit() {
    var N = window.PKNeosobni;
    if (!N || !N.smimePoslat()) return false;
    /* Jen pro měření: stránka načtená na pozadí dopředu není návštěva.
       U chyb je to naopak — pád při předběžném načtení je pád. */
    try { if (document.visibilityState === 'prerender') return false; } catch (e) { return false; }
    return true;
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
        p_stranka: window.PKNeosobni.jmenoStranky(),
        p_zdroj: zdroj(),
        p_zarizeni: zarizeni(),
        p_prvni: prvniVRelaci(),
      });
    } catch (e) { return; }

    window.PKNeosobni.posliRpc('zapis_navstevu', telo);
  }

  /* Až po načtení: měření se nemá prát s vykreslením o hlavní vlákno. */
  if (document.readyState === 'complete') setTimeout(posli, 0);
  else window.addEventListener('load', function () { setTimeout(posli, 0); });
}());
