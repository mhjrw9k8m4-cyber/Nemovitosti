/* HLÁŠENÍ CHYB Z PROHLÍŽEČE — ABY SE PÁD VŮBEC DOZVĚDĚLI
   ==================================================================
   Změřeno 24. 10.: v js/ nebyl ani jeden window.onerror a ani jeden
   posluchač unhandledrejection. Když tedy webu v něčím prohlížeči
   spadne skript, návštěvník vidí poloprázdnou stránku a odejde —
   a nikdo se nic nedozví. Zkoušky v prohlížeči navíc běží jen
   v Chromiu (jiný prohlížeč v prostředí není), takže rozbité Safari
   na iPhonu by zůstalo neviditelné.

   KDE SE CHYBA ODCHYTÁVÁ. Ne tady. Tenhle soubor se načítá s `defer`,
   tedy až po zpracování stránky — a většina skriptů webu se spouští
   dřív, během ní. Posluchač založený tady by právě ty první pády
   propásl, a to jsou ty nejhorší (nespustí se vůbec nic). Odchytává
   je proto krátký vložený skript v hlavičce KAŽDÉ stránky
   (scripts/hlasic-chyb.mjs), který nic neposílá — jen si pády ukládá
   do pole `window.PK_CHYBY`. Tenhle modul je ODESÍLAČ: pole vybere
   a pak si jeho `push` převezme, takže od té chvíle každý další pád
   jde přímo k odeslání. Jedno místo odchytu, jedno místo odeslání,
   nic dvakrát.

   CO SE ODESÍLÁ. Čtyři věci:
     • jméno stránky  — „pozemek-tabor-tabor-abc123.html"
     • hláška         — „x is not a function", ořezaná
     • místo          — „js/min/ceny.js:14:9" (jen náš soubor)
     • prohlížeč      — „safari-17" nebo „chrome-129", nic víc

   CELÝ USER AGENT SE NEPOSÍLÁ. Verze, jazyk a model telefonu
   dohromady zužují okruh lidí na jednotky — je to slabý otisk.
   K odpovědi „padá to jen na Safari?" stačí rodina a hlavní číslo.

   Z HLÁŠKY SE ADRESY A E-MAILY VYHAZUJÍ. Do textu chyby se dostane
   cokoli, co do ní vložil programátor: adresa s parametry, obsah
   políčka, e-mail z formuláře. Ořez je tady i v databázi
   (supabase/chyby-klienta.sql), protože sem umí zapsat kdokoli
   s veřejným klíčem, ne jen tenhle skript.

   „Script error." SE ZAHAZUJE. Tak se chyba z cizího skriptu jeví
   stránce, která k němu nemá právo (rozšíření prohlížeče, blokovač
   reklam). Nenese jméno souboru, řádek ani skutečnou hlášku, takže
   se z ní nic neopraví — a přitom by to byla většina hlášení.

   KDY SE NEHLÁSÍ VŮBEC (stejné stráže jako u měření návštěvnosti,
   js/mereni.js — a ze stejných důvodů):
     • mimo ostrý web (localhost, náhledy, soubor z disku),
     • při „nesledovat" (DNT nebo Global Privacy Control). Technicky
       bychom mohli — čítač nikoho nesleduje — ale kdo si to zapnul,
       říká tím, že si nepřeje posílat nic. Cena je vědomá: pády
       zpřísněných prohlížečů neuvidíme, zato se web nerozchází
       s tím, co o sobě tvrdí,
     • v automatizovaném prohlížeči (navigator.webdriver), ať vlastní
       zkoušky nehlásí chyby, které si samy vyrobily.

   STROPY, ABY SE Z HLÁSIČE NESTAL ÚTOK NA VLASTNÍ DATABÁZI. Chyba
   v posluchači kreslení umí vzniknout stokrát za sekundu. Proto:
   stejná hláška ze stejného místa jen jednou za načtení, nejvýš tři
   různé za načtení a nejvýš osm za celou relaci v záložce.

   HLÁSIČ NESMÍ SPADNOUT SÁM. Běží ve chvíli, kdy už jedna chyba je;
   kdyby spadl, přebil by ji — proto je všechno v try/catch a vlastní
   běh je navíc pojištěný proti smyčce (pád uvnitř odesílání se
   nehlásí).
   ================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.document) return;

  var STROP_STRANKA = 3;
  var STROP_RELACE = 8;
  var KLIC_RELACE = 'pk_chyby_poslano';

  var videne = {};
  var poslanoZeStranky = 0;
  var uvnitr = false;
  var pripraveno = false;
  var cekam = [];

  /* Stráže (kdy se nesmí poslat nic), jméno stránky a cesta ven jsou
     v js/neosobni.js — totéž používá měření návštěvnosti. */
  function mamHlasit() {
    var N = window.PKNeosobni;
    return !!(N && N.smimePoslat());
  }

  /* Rodina a hlavní verze. Pořadí testů není libovolné: Edge i Chrome
     mají v user agentu „Safari", Chrome má „Safari" taky, a Samsung
     Internet má „Chrome". Od nejkonkrétnějšího k nejobecnějšímu. */
  function prohlizec() {
    try {
      var u = navigator.userAgent || '';
      var vzory = [
        [/Edg\/(\d+)/, 'edge'],
        [/SamsungBrowser\/(\d+)/, 'samsung'],
        [/OPR\/(\d+)/, 'opera'],
        [/Firefox\/(\d+)/, 'firefox'],
        [/Chrome\/(\d+)/, 'chrome'],
        [/Version\/(\d+).*Safari/, 'safari'],
      ];
      for (var i = 0; i < vzory.length; i++) {
        var m = u.match(vzory[i][0]);
        if (m) return vzory[i][1] + '-' + String(m[1]).slice(0, 3);
      }
    } catch (e) {}
    return 'jine';
  }

  function cistaHlaska(z) {
    var t = '';
    try { t = String(z == null ? '' : z); } catch (e) { return ''; }
    /* Z adresy zbyde jen jméno souboru — parametry umí nést token
       i e-mail, a ty do databáze nesmí dorazit vůbec. */
    t = t.replace(/https?:\/\/\S+/g, function (a) {
      try { return '‹' + (new URL(a).pathname.split('/').pop() || 'adresa') + '›'; }
      catch (e) { return '‹adresa›'; }
    });
    t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '‹e-mail›');
    t = t.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return t.slice(0, 200);
  }

  /* Místo chyby: jen náš soubor, bez domény a bez razítka ?v=.
     Cizí původ (rozšíření, CDN) se zahazuje — stejně k němu stránka
     nemá podrobnosti a jméno cizího souboru nám nic neopraví. */
  function misto(soubor, radek, sloupec) {
    var c;
    try {
      if (!soubor) return '';
      var u = new URL(String(soubor), location.href);
      if (u.origin !== location.origin) return '';
      c = decodeURIComponent(u.pathname).replace(/^\//, '').toLowerCase();
    } catch (e) { return ''; }
    if (!/^[a-z0-9._/-]{1,60}$/.test(c)) return '';
    var r = Math.max(0, Math.min(parseInt(radek, 10) || 0, 999999));
    var s = Math.max(0, Math.min(parseInt(sloupec, 10) || 0, 999999));
    return c + ':' + r + ':' + s;
  }

  function vRelaciJeste() {
    try {
      var n = parseInt(sessionStorage.getItem(KLIC_RELACE) || '0', 10) || 0;
      if (n >= STROP_RELACE) return false;
      sessionStorage.setItem(KLIC_RELACE, String(n + 1));
      return true;
    } catch (e) { return true; }   /* zakázané úložiště → rozhoduje strop stránky */
  }

  /* Jedna nahlášená chyba. `z` je čtveřice [hláška, soubor, řádek,
     sloupec], přesně jak ji ukládá vložený skript v hlavičce. */
  function nahlas(z) {
    /* ADRESA DATABÁZE JE V js/config.js, A TEN SE MŮŽE SPUSTIT POZDĚJI
       než tenhle modul (na každé stránce je pořadí skriptů jiné).
       Dokud není, chyba se nezahazuje — čeká ve frontě. Bez tohohle
       by se tiše zahodily právě ty nejranější pády, tedy to, proč
       hlásič vůbec vznikl. */
    if (!pripraveno) { if (cekam.length < 20) cekam.push(z); return; }
    if (uvnitr) return;             /* pád uvnitř hlásiče se nehlásí */
    uvnitr = true;
    try {
      if (!mamHlasit()) return;
      if (poslanoZeStranky >= STROP_STRANKA) return;
      var hlaska = cistaHlaska(z && z[0]);
      if (hlaska.length < 3) return;
      /* Cizí skript bez podrobností — nic, co by se dalo opravit. */
      if (/^script error/i.test(hlaska)) return;
      var kde = misto(z && z[1], z && z[2], z && z[3]);
      var klic = hlaska + '|' + kde;
      if (videne[klic]) return;
      videne[klic] = 1;
      if (!vRelaciJeste()) return;
      poslanoZeStranky++;
      window.PKNeosobni.posliRpc('zapis_chybu', JSON.stringify({
        p_stranka: window.PKNeosobni.jmenoStranky(),
        p_zprava: hlaska,
        p_zdroj: kde,
        p_prohlizec: prohlizec(),
      }));
    } catch (e) {
    } finally { uvnitr = false; }
  }

  /* Odesílat se začne až po načtení stránky: do té doby nemusí být
     známá adresa databáze a měření ani hlášení se nemá prát
     s vykreslením o hlavní vlákno. */
  function rozjed() {
    pripraveno = true;
    var q = cekam;
    cekam = [];
    for (var i = 0; i < q.length; i++) nahlas(q[i]);
  }
  if (document.readyState === 'complete') setTimeout(rozjed, 0);
  else window.addEventListener('load', function () { setTimeout(rozjed, 0); });

  /* PŘEVZETÍ FRONTY. Co se stalo před načtením tohohle souboru, leží
     v poli; co se stane potom, přijde přes převzatý `push`. Kdyby
     pole nebylo (stránka bez vloženého skriptu v hlavičce), založí
     se tady i posluchači — ať hlásič funguje i tak, jen bez těch
     nejranějších pádů. */
  var fronta = window.PK_CHYBY;
  if (fronta && typeof fronta.length === 'number') {
    var cekajici = fronta.slice(0, 20);
    fronta.length = 0;
    fronta.push = function (z) { nahlas(z); return 0; };
    for (var i = 0; i < cekajici.length; i++) nahlas(cekajici[i]);
  } else {
    window.PK_CHYBY = { push: function (z) { nahlas(z); return 0; } };
    window.addEventListener('error', function (e) {
      nahlas([e && e.message, e && e.filename, e && e.lineno, e && e.colno]);
    });
    window.addEventListener('unhandledrejection', function (e) {
      var d = e && e.reason;
      nahlas([(d && d.message) || String(d || ''), '', 0, 0]);
    });
  }
}());
