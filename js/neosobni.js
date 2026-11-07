/* NEOSOBNÍ ODESLÁNÍ — JEDNO PRAVIDLO PRO VŠECHNO, CO WEB ODESÍLÁ SÁM
   ==================================================================
   Web odesílá bez vyzvání dvě věci a obě jsou čítače bez člověka:
   návštěvu stránky (js/mereni.js) a pád v prohlížeči (js/chyby.js).
   Každé z nich potřebuje tři úplně stejné věci: stráže (KDY se nesmí
   poslat nic), jméno stránky a cestu ven, která nic nezpomalí.

   PROČ TENHLE SOUBOR VZNIKL. Nejdřív to byly dvě kopie — a našel je
   hlídač dvojích kopií v repozitáři (scripts/test-kopie-funkci.mjs),
   ne člověk. Na kopiích je zlé přesně to, co je u stráží nejhorší:
   kdyby se jedna z nich jednou zpřísnila a druhá ne, web by dál
   posílal odtud, odkud nemá, a nikdo by to nepoznal — jedno pravidlo
   napsané dvakrát není jedno pravidlo.

   STRÁŽE (platí pro OBOJE, a to je ta pointa):
     • jen ostrý web — ne localhost, ne náhled, ne soubor z disku,
     • ne při „nesledovat" (DNT nebo Global Privacy Control): kdo si
       to zapnul, říká tím, že si nepřeje posílat nic,
     • ne v automatizovaném prohlížeči (navigator.webdriver), ať si
       vlastní zkoušky nedělají čísla ani hlášení,
     • a musí být známá adresa databáze (js/config.js).

   CESTA VEN. sendBeacon, tedy mimo vykreslení a bez čekání na
   odpověď; když ho prohlížeč nemá nebo odmítne, fetch s keepalive.
   Selhání se ignoruje — ani měření, ani hlášení chyby nemá nikdy
   rozbít stránku.

   A JEDNA STRÁŽ NAVÍC, JEN PRO ČÍTAČ NÁVŠTĚV: „mě nepočítej".
   Čítač má odpovědět na otázku „chodí sem někdo?" — a majitel, který
   si svůj web otevře dvacetkrát denně, je v tom čísle největší
   položka. Rozeznat ho podle něčeho, co se posílá, nejde a nemá:
   neposílá se žádný identifikátor (viz výš), takže vlastní návštěvy
   se odečíst nedají. Jde to jedině opačně — PŘED odesláním, v jeho
   vlastním prohlížeči, podle přání uloženého v localStorage.
   Zapne se adresou `?nepocitat=1` (vypne `?nepocitat=0`); přepínač
   se stavem je na diagnostika.html a věta o tom na ochrana-udaju.html.
   Nic se tím neodesílá a nic se tím nikam nezapisuje — to přání žije
   jen v tom jednom prohlížeči.

   PLATÍ JEN NA ČÍTAČ, NE NA HLÁŠENÍ CHYB. Kdo si řekl „nepočítej mě",
   mluví o statistice návštěv; pád v prohlížeči je něco jiného a od
   majitele je to navíc to nejcennější hlášení, jaké web dostane.
   Proto má čítač vlastní pocitatNavstevu() a stráže zůstávají jedny.
   ================================================================== */
(function (root) {
  'use strict';
  if (!root || !root.document) return;

  function smimePoslat() {
    try {
      var h = root.location.hostname;
      if (h !== 'parcelaka.cz' && h !== 'www.parcelaka.cz') return false;
      if (navigator.webdriver) return false;
      if (navigator.doNotTrack === '1' || root.doNotTrack === '1'
        || navigator.globalPrivacyControl === true) return false;
      if (!root.PK_SUPABASE_URL || !root.PK_SUPABASE_KEY) return false;
    } catch (e) { return false; }
    return true;
  }

  var KLIC_NEPOCITAT = 'pk-nepocitat';

  /* Zápis i čtení v try/catch: v anonymním okně a se zakázaným
     úložištěm localStorage vyhodí výjimku už při prvním sáhnutí.
     Nejde-li to přečíst, počítá se — to je stav běžného návštěvníka. */
  function nepocitatSe() {
    try { return localStorage.getItem(KLIC_NEPOCITAT) === '1'; } catch (e) { return false; }
  }
  function nastavNepocitat(ano) {
    try {
      if (ano) localStorage.setItem(KLIC_NEPOCITAT, '1');
      else localStorage.removeItem(KLIC_NEPOCITAT);
      return nepocitatSe() === !!ano;
    } catch (e) { return false; }
  }
  function pocitatNavstevu() { return smimePoslat() && !nepocitatSe(); }

  /* Adresa je jediná cesta, jak si to zapnout na telefonu, kde se
     k úložišti prohlížeče nijak jinak nedostanu. Čte se při načtení
     každé stránky, protože přání se má dát vyslovit odkudkoli. */
  (function zAdresy() {
    try {
      var m = /[?&]nepocitat=([01])/.exec(root.location.search || '');
      if (m) nastavNepocitat(m[1] === '1');
    } catch (e) {}
  }());

  /* „pozemek-benesov-benesov-rsg5bb.html". Kořen webu je index.html. */
  function jmenoStranky() {
    var c = (root.location.pathname || '/').split('/').pop();
    if (!c) return 'index.html';
    return c.toLowerCase().slice(0, 80);
  }

  function posliRpc(jmeno, telo) {
    var adresa = root.PK_SUPABASE_URL + '/rest/v1/rpc/' + jmeno;
    /* sendBeacon neumí vlastní hlavičky, a Supabase chce klíč. Jde
       poslat v adrese — je to veřejný publishable klíč, přesně k tomu
       určený. Když beacon není nebo odmítne, zkusí se fetch. */
    var sKlicem = adresa + '?apikey=' + encodeURIComponent(root.PK_SUPABASE_KEY);
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
          apikey: root.PK_SUPABASE_KEY,
          authorization: 'Bearer ' + root.PK_SUPABASE_KEY,
        },
        body: telo,
      }).catch(function () {});
    } catch (e) {}
  }

  root.PKNeosobni = {
    smimePoslat: smimePoslat,
    pocitatNavstevu: pocitatNavstevu,
    nepocitatSe: nepocitatSe,
    nastavNepocitat: nastavNepocitat,
    jmenoStranky: jmenoStranky,
    posliRpc: posliRpc,
  };
}(typeof window !== 'undefined' ? window : null));
