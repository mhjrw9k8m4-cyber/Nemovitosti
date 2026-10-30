/* MOBILNÍ MENU — jedno jediné místo pro celý web.
   ==================================================================
   Tenhle kód byl v repozitáři ČTRNÁCTKRÁT a v JEDENÁCTI různých
   podobách (naměřeno): v js/main.js, js/pozemek.js, js/pridat.js
   a vložený v jedenácti ručně psaných stránkách. Kopie se rozešly
   přesně tak, jak se kopie rozcházejí vždycky — a nejhůř na tom byla
   ta nejrozšířenější:

     · js/pozemek.js (tedy 1 999 stránek pozemků) umělo jen přepnout
       třídu. NEZAVÍRALO se Escapem ani klepnutím na odkaz v menu —
       člověk si menu otevřel, klepl na odkaz, stránka se změnila
       a menu zůstalo přes ni roztažené.
     · jedenáct vložených kopií nezavíralo menu klepnutím mimo.
     · upozorneni.html k tomu neměnilo aria-label, takže odečítač
       pořád hlásil „Otevřít menu", i když bylo otevřené.

   Tady je sjednocení toho nejlepšího ze všech kopií: přepnutí třídy,
   aria-expanded, aria-label, zámek rolování (body.nav-open), zavření
   Escapem, zavření klepnutím na odkaz a zavření klepnutím mimo.

   A JE TO MALÉ. Stránky okresů a krajů si kvůli menu tahaly celý
   js/pridat.js, tedy 73,4 kB formulářové logiky k přidání pozemku —
   na stránce, kde žádný takový formulář není. Tohle má pod 2 kB.

   A PANEL JE ZPÁTKY — NA VÝSLOVNÉ PŘÁNÍ. Mezitím byla nabídka na
   telefonu vodorovný pás pilulek v hlavičce, který se posouval prstem.
   Majitel na něj řekl: „menu na mobilu jezdí nahoře, je to strašné."
   Má pravdu i měřitelně: pás je 44 px vysoký pruh, do kterého se
   z šesti odkazů vejdou dva a zbytek se musí odjet do strany, takže
   o existenci ostatních se člověk nedozví. Místo něj je tedy
   VYSOUVACÍ PANEL — hamburger vlevo, panel přes většinu obrazovky,
   v něm všechny odkazy pod sebou a velké.

   TLAČÍTKO SI SKRIPT POSTAVÍ SÁM. Značku hlavičky má 2 212 stránek
   a většinu z nich píše generátor; vkládat hamburger do všech by
   znamenalo přegenerovat celý web kvůli jednomu tlačítku a hlavně
   mít ten prvek na 2 212 místech místo na jednom. Panel i tlačítko
   proto vznikají tady, z toho, co v hlavičce už je.

   Nic se tu nespouští, když na stránce nabídka není: bez #nav se
   funkce vrátí a neudělá nic. */
(function (root) {
  'use strict';

  /* NABÍDKA V HLAVIČCE.
     ------------------------------------------------------------------
     Na úzkém displeji není nabídka schovaná pod ničím: je to vodorovný
     pás odkazů v hlavičce, který se dá posunout prstem do strany.
     Skript k tomu dělá jedinou věc, kterou stylem udělat nejde —
     OZNAČÍ, NA KTERÉ STRÁNCE JSEM. Třídu .active nasazoval jen
     scroll-spy na úvodní stránce, a ten sleduje kotvy v textu, ne
     adresu; na ostatních stránkách tedy nesvítil žádný odkaz. */
  function oznacStranku(d, nav) {
    if (nav.getAttribute('data-lista') === 'ano') return;
    nav.setAttribute('data-lista', 'ano');

    var tady = (d.location && d.location.pathname || '').split('/').pop() || 'index.html';
    /* Stránky účtu nemají v liště vlastní záložku — mají dlaždice
       v profilu, protože nepřihlášenému vedou jen na přihlášení. Když
       je člověk na nich, má svítit Profil; jinak by na nich nesvítilo
       nic a lišta by tvrdila, že jsem někde jinde. */
    var podProfilem = { 'zpravy.html': 1, 'hlidani.html': 1 };
    var oznac = podProfilem[tady] ? 'muj-inzerat.html' : tady;
    var odkazy = nav.querySelectorAll('a[href]');
    for (var i = 0; i < odkazy.length; i++) {
      var h = odkazy[i].getAttribute('href') || '';
      if (h.charAt(0) === '#') continue;                    // kotva řeší scroll-spy
      /* ODKAZ NA STAV NENÍ ODKAZ NA STRÁNKU. „Exekuce" v nabídce vede
         na index.html#t=exekuce, tedy na TUTÉŽ stránku s nastaveným
         filtrem. Bez téhle podmínky se na úvodní stránce rozsvítila
         jako „tady jsem" vedle „Hledat na mapě" — dvě svítící záložky
         naráz (vyfoceno 30. 10.). Kotva s rovnítkem je stav, kotva bez
         něj je místo v textu. */
      var kotva = h.indexOf('#') >= 0 ? h.slice(h.indexOf('#') + 1) : '';
      if (kotva.indexOf('=') >= 0) continue;
      var cil = h.split('#')[0].split('?')[0].split('/').pop();
      if (cil && cil === oznac) odkazy[i].setAttribute('aria-current', 'page');
    }

  }

  var BURGER_SVG = '<svg class="ik" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-menu"/></svg>';
  var KRIZEK_SVG = '<svg class="ik" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-zavrit"/></svg>';

  /* VYSOUVACÍ PANEL.
     ------------------------------------------------------------------
     Postaví hamburger, zatmívací plochu a zavírací křížek v panelu.
     Odkazy zůstávají ty, co v #nav už jsou — nic se nekopíruje, takže
     se nemá co rozejít (to byla ta chyba z úvodu souboru, jedenáct
     kopií v jedenácti podobách).

     ZAVÍRÁ SE PĚTI ZPŮSOBY, a každý z nich někdo opravdu použije:
     tlačítkem, křížkem, Escapem, klepnutím na odkaz (jinak panel
     zůstane přes novou stránku) a klepnutím mimo. */
  function postavPanel(d, nav) {
    if (nav.getAttribute('data-panel') === 'ano') return;
    nav.setAttribute('data-panel', 'ano');
    var wrap = nav.parentNode;
    if (!wrap) return;

    var burger = d.createElement('button');
    burger.type = 'button';
    burger.className = 'nav-burger';
    burger.setAttribute('aria-controls', 'nav');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Otevřít nabídku');
    burger.innerHTML = BURGER_SVG;
    /* Hamburger patří PŘED logo, k levému kraji: tam ho palec čeká
       a tam ho má i Sreality, Seznam i všechno ostatní na telefonu. */
    wrap.insertBefore(burger, wrap.firstChild);

    var stin = d.createElement('div');
    stin.className = 'nav-stin';
    stin.hidden = true;
    wrap.appendChild(stin);

    var zavrit = d.createElement('button');
    zavrit.type = 'button';
    zavrit.className = 'nav-zavrit';
    zavrit.setAttribute('aria-label', 'Zavřít nabídku');
    zavrit.innerHTML = KRIZEK_SVG;
    /* KŘÍŽEK PATŘÍ DO HLAVIČKY ŠUPLÍKU, vedle značky. Dřív visel sám
       na vlastním řádku nad vším ostatním a bral 48 px — na snímku
       z telefonu z toho byl prázdný pruh s křížkem v rohu. Hlavička
       `.nav-hlava` přišla 30. 10.; když ji stránka ještě nemá (stará
       podoba v mezipaměti), vrátí se křížek na začátek panelu. */
    var hlava = nav.querySelector('.nav-hlava');
    if (hlava) hlava.appendChild(zavrit);
    else nav.insertBefore(zavrit, nav.firstChild);

    function otevreno() { return d.body.classList.contains('nav-otevreno'); }
    function prepni(na) {
      d.body.classList.toggle('nav-otevreno', na);
      burger.setAttribute('aria-expanded', na ? 'true' : 'false');
      burger.setAttribute('aria-label', na ? 'Zavřít nabídku' : 'Otevřít nabídku');
      stin.hidden = !na;
      /* Když je panel otevřený, je co zavírat — a focus má jít do něj,
         ne zůstat na tlačítku za zatmívací plochou. */
      if (na) { try { zavrit.focus(); } catch (e) { /* nevadí */ } }
      else { try { burger.focus(); } catch (e) { /* nevadí */ } }
    }

    burger.addEventListener('click', function () { prepni(!otevreno()); });
    zavrit.addEventListener('click', function () { prepni(false); });
    stin.addEventListener('click', function () { prepni(false); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && otevreno()) prepni(false);
    });
    nav.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (a && otevreno()) prepni(false);
    });
    /* Po otočení na šířku nebo na velkém displeji panel neexistuje —
       ale zámek rolování na <body> by po něm zůstal a stránka by se
       nedala posunout. Naměřeno dřív u jiného překryvu, proto rovnou. */
    if (root.matchMedia) {
      var mq = root.matchMedia('(min-width:1041px)');
      var hlid = function (ev) { if (ev.matches && otevreno()) prepni(false); };
      if (mq.addEventListener) mq.addEventListener('change', hlid);
      else if (mq.addListener) mq.addListener(hlid);
    }
  }

  function napoj(doc) {
    var d = doc || document;
    var nav = d.getElementById('nav');
    if (!nav) return false;
    oznacStranku(d, nav);
    postavPanel(d, nav);
    return true;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { napoj: napoj };
  } else {
    root.PKMenu = { napoj: napoj };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { napoj(document); });
    } else {
      napoj(document);
    }
  }
}(typeof window !== 'undefined' ? window : globalThis));
