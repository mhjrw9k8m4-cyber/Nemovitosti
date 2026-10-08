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

   A PAK UŽ NENÍ CO OTEVÍRAT. Panel pod křížkem je zrušený: na úzkém
   displeji je nabídka spodní lišta (vidět pořád), na širokém vodorovná
   navigace v hlavičce. S panelem zmizela i celá jeho obsluha —
   přepínač, Escape, klepnutí mimo, tah dolů — a tlačítko „hamburger"
   je odebrané i ze značky 2 178 stránek, protože se po té změně
   nezobrazovalo nikde.

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
      var cil = h.split('#')[0].split('?')[0].split('/').pop();
      if (cil && cil === oznac) odkazy[i].setAttribute('aria-current', 'page');
    }

  }

  /* NAPOJENÍ. Přepínač „hamburger" tu býval a s ním otevírání, zavírání
     Escapem, klepnutím mimo i tahem dolů. Všechno zmizelo s panelem:
     na úzkém displeji je nabídka spodní lišta, která je vidět pořád,
     Není co otevírat, takže není co obsluhovat — a tlačítko, které se
     nikde nezobrazí, je odebrané i ze značky (bylo na 2 178 stránkách). */
  function napoj(doc) {
    var d = doc || document;
    var nav = d.getElementById('nav');
    if (!nav) return false;
    oznacStranku(d, nav);
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
