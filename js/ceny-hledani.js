/* Ceny podle lokality — napište obec a dostanete číslo.
 *
 * PROČ TO VZNIKLO. Na stránce stál seznam 14 krajů, pod ním barevná mapa
 * okresů a pod ní seznam 36 okresů: padesát řádků, ze kterých každého
 * zajímá jeden. Kdo chce vědět, kolik stojí půda u něj, nechce procházet
 * republiku.
 *
 * HLEDÁ SE PODLE OBCE, CENA JE ZA OKRES. Tak lidé přemýšlejí („kolik to
 * je u nás ve Zdicích"), jenže z 1 046 obcí v nabídce by na vlastní
 * medián jednoho druhu mělo dost dat devět. Číslo z pěti nabídek v jedné
 * vesnici není cena v té vesnici, je to náhoda. Okres je nejmenší celek,
 * za který se dá něco tvrdit — a u výsledku je napsané, že je okresní.
 *
 * DATA AŽ NA VYŽÁDÁNÍ. Rejstřík obcí má 41 kB a stránku si spousta lidí
 * jen proletí. Stahuje se proto, teprve když někdo začne psát.
 *
 * SHODU ŘEŠÍ js/hledani.js — tentýž kód jako našeptávač na mapě, takže
 * „rican" najde Říčany a na pořadí slov nezáleží. Druhá kopie těch
 * pravidel by se s ním rozešla.
 */
(function () {
  'use strict';
  var vstup = document.getElementById('cenh-vstup');
  var navrhyEl = document.getElementById('cenh-navrhy');
  var vysledekEl = document.getElementById('cenh-vysledek');
  if (!vstup || !navrhyEl || !vysledekEl) return;

  var H = window.PKHledani;
  var data = null, nacitaSe = null, vybrano = -1, seznam = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (z) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z];
    });
  }
  /* Nezlomitelná mezera po tisících, jako všude na webu. */
  function cislo(n) { return Math.round(n).toLocaleString('cs-CZ').replace(/ /g, ' '); }
  function tvar(n, t) {
    n = Math.abs(n | 0);
    return n === 1 ? t[0] : (n >= 2 && n <= 4 ? t[1] : t[2]);
  }

  function nactiData() {
    if (data) return Promise.resolve(data);
    if (nacitaSe) return nacitaSe;
    nacitaSe = fetch('data/ceny-mist.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { data = j; return j; })
      .catch(function () { nacitaSe = null; return null; });
    return nacitaSe;
  }

  /* Rejstřík se převede na záznamy, kterým rozumí PKHledani.navrhy():
     potřebuje `place` a `okres`. Okres sám je taky záznam, ať ho jde
     najít rovnou („Benešov" jako okres i jako obec). */
  function proHledani(d) {
    var out = [];
    d.ok.forEach(function (o) { out.push({ place: '', okres: o.n }); });
    d.ob.forEach(function (o) { out.push({ place: o[0], okres: o[1] }); });
    return out;
  }

  function okresPodle(jmeno) {
    if (!data) return null;
    for (var i = 0; i < data.ok.length; i++) if (data.ok[i].n === jmeno) return data.ok[i];
    return null;
  }
  function pocetVObci(obec, okres) {
    if (!data) return 0;
    for (var i = 0; i < data.ob.length; i++) {
      if (data.ob[i][0] === obec && data.ob[i][1] === okres) return data.ob[i][2];
    }
    return 0;
  }

  /* ---------- výsledek ---------- */
  var POradi = ['Zemědělská půda', 'Lesní pozemek', 'Zahrada', 'Stavební'];
  var NAZEV = { 'Stavební': 'Stavební pozemek' };

  function ukazVysledek(volba) {
    var ok = okresPodle(volba.okres);
    if (!ok) { vysledekEl.innerHTML = ''; return; }
    var druhy = POradi.filter(function (g) { return ok.p[g]; });
    var radky = druhy.map(function (g) {
      var c = ok.p[g];
      return '<li class="cenh-radek"><span class="cenh-druh">' + esc(NAZEV[g] || g) + '</span>'
        + '<b class="cenh-cena">' + cislo(c.med) + ' Kč/m²</b>'
        + '<span class="cenh-detail">obvykle ' + cislo(c.lo) + '–' + cislo(c.hi) + '\u00a0Kč/m²'
        + ' · z ' + cislo(c.n) + ' ' + tvar(c.n, ['nabídky', 'nabídek', 'nabídek']) + '</span></li>';
    }).join('');

    var hlava, pozn = '';
    if (volba.obec) {
      var vObci = pocetVObci(volba.obec, volba.okres);
      hlava = esc(volba.obec) + ' <span class="cenh-okres">okres ' + esc(volba.okres) + '</span>';
      /* NA ROVINU, ŽE JE TO ČÍSLO ZA OKRES. Bez té věty by člověk četl
         medián okresu jako cenu ve své vesnici — a to je rozdíl, podle
         kterého se rozhoduje o statisících. */
      pozn = 'Ceny jsou <b>za celý okres ' + esc(volba.okres) + '</b>. Pro samotnou obec '
        + esc(volba.obec) + ' je v nabídce ' + (vObci ? '<b>' + cislo(vObci) + '</b> '
          + tvar(vObci, ['pozemek', 'pozemky', 'pozemků']) : 'málo nabídek')
        + ' — na vlastní medián to nestačí.';
    } else {
      hlava = 'okres ' + esc(volba.okres);
      pozn = 'Medián nabídkových cen v okrese. Z <b>' + cislo(ok.c) + '</b> '
        + tvar(ok.c, ['nabídky', 'nabídek', 'nabídek']) + ' celkem.';
    }

    vysledekEl.innerHTML = '<div class="cenh-karta">'
      + '<h3 class="cenh-hlava">' + hlava + '</h3>'
      + (radky
        ? '<ul class="cenh-radky">' + radky + '</ul>'
        : '<p class="cenh-nic">V tomhle okrese zatím není dost nabídek na to, aby se dala spočítat cena za metr.</p>')
      + '<p class="cenh-pozn">' + pozn + '</p>'
      + '<a class="cenh-odkaz" href="' + esc(ok.h) + '">Prohlédnout nabídky v okrese ' + esc(ok.n) + ' →</a>'
      + '</div>';
  }

  /* ---------- našeptávač ---------- */
  function zavri() {
    navrhyEl.hidden = true;
    navrhyEl.innerHTML = '';
    navrhyEl.style.marginTop = ''; navrhyEl.style.marginBottom = '';
    navrhyEl.style.top = ''; navrhyEl.style.bottom = ''; navrhyEl.style.maxHeight = '';
    if (hlaskaEl) { hlaskaEl.hidden = true; hlaskaEl.style.top = ''; hlaskaEl.style.bottom = ''; }
    vstup.setAttribute('aria-expanded', 'false');
    vybrano = -1;
    seznam = [];
  }

  /* Řádek „Mysleli jste…“ nad návrhy. Leží MIMO <ul>: uvnitř by to byla
     položka listboxu, která se nedá vybrat, a posunula by indexy — šipka
     dolů by svítila na jiný návrh, než který by se pak Enterem vybral.
     Vyrábí se teprve, když je potřeba. */
  var hlaskaEl = null;
  function ukazHlasku(oprava, napsano) {
    if (!oprava) { if (hlaskaEl) hlaskaEl.hidden = true; return; }
    if (!hlaskaEl) {
      hlaskaEl = document.createElement('p');
      hlaskaEl.className = 'cenh-hlaska';
      navrhyEl.parentNode.insertBefore(hlaskaEl, navrhyEl);
    }
    hlaskaEl.innerHTML = 'Nic jako „' + esc(String(napsano).trim())
      + '". Mysleli jste <b>' + esc(oprava) + '</b>?';
    hlaskaEl.hidden = false;
  }

  function kresli(n, oprava, napsano) {
    seznam = n;
    if (!n.length) { zavri(); return; }
    navrhyEl.innerHTML = n.map(function (x, i) {
      var popis = x.typ === 'okres' ? 'okres' : 'okres ' + esc(x.okres);
      return '<li class="cenh-navrh" role="option" id="cenh-n' + i + '" aria-selected="false" data-i="' + i + '">'
        + '<span class="cenh-n-nazev">' + esc(x.text) + '</span>'
        + '<span class="cenh-n-kde">' + popis + '</span></li>';
    }).join('');
    ukazHlasku(oprava, napsano);
    navrhyEl.hidden = false;
    /* Teprve teď, když je seznam v DOM a vidět: změřit volné místo nad
       klávesnicí a seznam tomu přizpůsobit (a odsunout od hlášky). */
    nadKlavesnici();
    vstup.setAttribute('aria-expanded', 'true');
  }

  /* Volné místo i odsun od hlášky počítá společná funkce z js/hledani.js —
     stejně to potřebuje i našeptávač na mapě. Tady umí i překlopit seznam
     nahoru: pole leží v polovině stránky, takže po vyjetí klávesnice pod
     ním místo není žádné. 320 px je strop z CSS. */
  function nadKlavesnici() {
    if (navrhyEl.hidden || !H || !H.nadKlavesnici) return;
    H.nadKlavesnici(navrhyEl, { pole: vstup, hlaska: hlaskaEl, strop: 320 });
  }
  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.addEventListener('resize', nadKlavesnici);
    window.visualViewport.addEventListener('scroll', nadKlavesnici);
  }

  function zvyrazni(i) {
    var polozky = navrhyEl.querySelectorAll('.cenh-navrh');
    for (var k = 0; k < polozky.length; k++) {
      polozky[k].classList.toggle('je', k === i);
      polozky[k].setAttribute('aria-selected', k === i ? 'true' : 'false');
    }
    vybrano = i;
    vstup.setAttribute('aria-activedescendant', i >= 0 ? 'cenh-n' + i : '');
  }

  function vyber(i) {
    var x = seznam[i];
    if (!x) return;
    vstup.value = x.text;
    zavri();
    ukazVysledek({ obec: x.typ === 'okres' ? null : x.text, okres: x.typ === 'okres' ? x.text : x.okres });
  }

  var cas = null;
  vstup.addEventListener('input', function () {
    clearTimeout(cas);
    var q = vstup.value;
    cas = setTimeout(function () {
      if (!H || !H.navrhy) return;
      nactiData().then(function (d) {
        if (!d) {
          vysledekEl.innerHTML = '<p class="cenh-nic">Ceny se teď nepovedlo načíst. Zkuste to za chvíli.</p>';
          return;
        }
        var zaznamy = proHledani(d);
        var n = H.navrhy(zaznamy, q, 7);
        /* JEDNO PÍSMENO VEDLE A VYHLEDÁVÁNÍ ZMLÌKNE. Při nula shodách se
           našeptávač prostě zavřel a člověk nevěděl, jestli tu obec
           nemáme, nebo jestli má překlep. Teď se oprava zkusí hned a
           vypíšou se rovnou NÁZVY k ní — označené, ať je vidět, že se
           hledalo něco jiného, než co je napsané. */
        var opravaN = null;
        if (!n.length && H.mysleliJste && H.norm && H.norm(q).length >= 2) {
          var zkus = H.mysleliJste(zaznamy, q);
          if (zkus) {
            var jine = H.navrhy(zaznamy, zkus, 7);
            if (jine.length) { opravaN = zkus; n = jine; }
          }
        }
        kresli(n, opravaN, q);
        /* TICHO VYPADÁ JAKO ROZBITÝ VYHLEDÁVAČ. V nabídce je kolem tisícovky
           obcí z šesti a půl tisíce, takže „nic jsme nenašli" je ten
           NEJČASTĚJŠÍ případ — a když se na něj nic neukáže, člověk neví,
           jestli špatně píše, nebo jestli web nefunguje. Řekne se to,
           a když to vypadá na překlep, nabídne se oprava. */
        if (!n.length && H.norm && H.norm(q).length >= 2) {
          /* Až sem se dojde teprve tehdy, když ani oprava nenašla nic —
             překlep už vyřešil našeptávač výš a nabídl názvy k němu. */
          vysledekEl.innerHTML = '<div class="cenh-karta"><p class="cenh-nic">'
            + 'Pro „' + esc(q.trim()) + '" nemáme v nabídce žádný pozemek.'
            + ' Zkuste okres — třeba Benešov nebo Kolín.'
            + '</p></div>';
        } else if (n.length) {
          /* Dokud si člověk nevybere, starý výsledek dole mate: nahoře
             se píše nová obec, dole svítí cena té minulé. */
          vysledekEl.innerHTML = '';
        }
      });
    }, 160);
  });
  /* Stáhnout rejstřík už při prvním zaměření: než člověk dopíše obec,
     je tu — a první napsané písmeno pak nečeká na síť. */
  vstup.addEventListener('focus', function () { nactiData(); });

  vstup.addEventListener('keydown', function (e) {
    if (navrhyEl.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); zvyrazni(Math.min(vybrano + 1, seznam.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); zvyrazni(Math.max(vybrano - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); vyber(vybrano >= 0 ? vybrano : 0); }
    else if (e.key === 'Escape') { zavri(); }
  });
  navrhyEl.addEventListener('mousedown', function (e) {
    var li = e.target.closest ? e.target.closest('.cenh-navrh') : null;
    if (!li) return;
    e.preventDefault();
    vyber(parseInt(li.getAttribute('data-i'), 10));
  });
  document.addEventListener('click', function (e) {
    if (navrhyEl.hidden) return;
    if (navrhyEl.contains(e.target) || e.target === vstup) return;
    if (hlaskaEl && hlaskaEl.contains(e.target)) return;   // hláška patří k nabídce
    zavri();
  });
}());
