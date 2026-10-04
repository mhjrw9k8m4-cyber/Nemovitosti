/* Graf vývoje cenové hladiny na stránce okresu a kraje.
 *
 * Data staví scripts/historie-cen.mjs z historie repozitáře (data se
 * commitují čtyřikrát denně, takže časová řada existuje sama od sebe).
 * Tenhle soubor je jen zobrazení — žádný výpočet hladiny tu není, aby
 * se graf nemohl rozejít s číslem, které o témž místě ukazuje zbytek webu.
 *
 * CO SE UKAZUJE A CO NE. Jen řady označené `klidna`. Hladina se totiž
 * mění i tím, že nabídky přibudou a zmizí, ne jen tím, že se hýbou ceny —
 * a u malých okresů to převáží: naměřeno, že okres Brno-venkov „zdražil"
 * za tři týdny o 132 %, zatímco celostátní orná půda se pohnula o 0,7 %.
 * Ukázat takový graf by znamenalo tvrdit něco, co data neunesou. Když
 * pro místo žádná klidná řada není, nekreslí se NIC — ani prázdný rámeček.
 *
 * Jedna řada znamená, že legenda nemá co rozlišovat; co je v grafu, říká
 * jeho nadpis. Popisek nese poslední hodnota, ne každý bod.
 */
(function (root) {
  'use strict';
  var ZDROJ = 'data/historie-cen.json';
  var nactene = null;      // slib, ať se soubor stahuje jednou, i když jsou grafy dva

  function nacti() {
    if (!nactene) {
      nactene = fetch(ZDROJ, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return nactene;
  }

  var MESICE = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
  function denKratce(iso) {
    var c = String(iso).split('-');
    return c.length === 3 ? (+c[2]) + '. ' + MESICE[+c[1] - 1] : iso;
  }
  function cislo(n) {
    return (Math.round(n * 10) / 10).toFixed(n < 100 ? 1 : 0).replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Z klidných řad pro dané místo vybere tu NEJLÉPE DOLOŽENOU: nejvíc
     naměřených dnů, při shodě větší vzorek. Není to vkus — řada s dírami
     by v grafu dělala skoky, které v datech nejsou. */
  function vyberRadu(H, uroven, nazev) {
    var nej = null;
    for (var k in H.rady) {
      if (!Object.prototype.hasOwnProperty.call(H.rady, k)) continue;
      var c = k.split('|');
      if (c[0] !== uroven || c[1] !== nazev) continue;
      var r = H.rady[k];
      if (!r.klidna) continue;
      var bodu = 0, vzorek = 0;
      for (var i = 0; i < r.cena.length; i++) {
        if (r.cena[i] !== null) { bodu++; vzorek = Math.max(vzorek, r.vzorek[i] || 0); }
      }
      if (bodu < 5) continue;   // ze čtyř bodů se čára kreslit nemá
      if (!nej || bodu > nej.bodu || (bodu === nej.bodu && vzorek > nej.vzorek)) {
        nej = { klic: k, druh: c[2], r: r, bodu: bodu, vzorek: vzorek };
      }
    }
    return nej;
  }

  /* TÁŽ VÝHRADA JAKO U ČÍSLA NAD GRAFEM.
     Na stránce okresu stojí medián a u něj, je-li vzorek malý,
     „na cenu okresu je to málo, berte to jako hrubé vodítko" (mez
     DOST_NABIDEK, dnes 25). Graf kreslil už od osmi nabídek a žádnou
     výhradu neměl — a to je horší, než kdyby ji neměl ani u čísla: oko
     čte TVAR čáry, ne poznámku, takže méně doložené tvrzení vypadalo
     přesvědčivěji než to lépe doložené. Dnes se ty dvě množiny nepřekrývají
     (23 okresů s grafem, 30 s výhradou, průnik nula), ale nic tomu
     nebránilo — stačilo jedno obnovení dat.
     Mez se neopisuje, bere se ze souboru s historií (pole `dost`), kam ji
     zapsal scripts/historie-cen.mjs z js/ceny.js. Chybí-li (starší soubor),
     výhrada se nepíše: radši nic než mez, kterou si graf vymyslel sám. */
  function maloVzorku(H, vzorek) {
    var dost = H && typeof H.dost === 'number' ? H.dost : 0;
    if (!dost || vzorek >= dost) return '';
    return 'Na cenu celého okresu je to málo — berte to jako hrubé vodítko. ';
  }

  function kresli(el, H, vyber, kde) {
    var dny = H.dny, r = vyber.r;
    var body = [];
    for (var i = 0; i < dny.length; i++) {
      if (r.cena[i] !== null) body.push({ den: dny[i], cena: r.cena[i], vzorek: r.vzorek[i] });
    }
    if (body.length < 5) return false;

    /* Kreslí se ve SKUTEČNÝCH pixelech kontejneru, ne do pevné soustavy.
       Pevný viewBox se totiž škáluje rovnoměrně (jinak by se kolečka
       odečtu protáhla na elipsy) — a na telefonu z grafu 900×190 zbylo
       při šířce 350 px pouhých 74 px výšky, do kterých se bublina
       s odečtem sotva vešla. Takhle má graf na každé šířce výšku, která
       se dá číst. */
    var W = Math.max(280, Math.round(el.clientWidth || 900));
    var Hh = W < 560 ? 150 : 190;
    var L = 8, P = 12, D = 30;
    var min = Infinity, max = -Infinity;
    body.forEach(function (b) { min = Math.min(min, b.cena); max = Math.max(max, b.cena); });
    /* Osa NEZAČÍNÁ nulou schválně: u řady, která se za tři týdny pohne
       o procento, by nulový začátek udělal rovnou čáru a tvářil se, že
       se neděje nic. Místo toho se kolem rozsahu nechá desetina — a pod
       grafem stojí, v jakém rozpětí se čte, aby to nikoho nepletlo. */
    /* OSA MUSÍ UNÉST I TO, ŽE SE NIC NEDĚJE.
       Napoprvé se natáhla přesně na rozsah dat, a to je past: okres
       Břeclav se za dvacet dní pohnul o 0,2 % (46,6 → 47,2 Kč/m²)
       a graf z toho udělal dramatické schody přes celou výšku. Rozpětí
       sice stálo v poznámce pod grafem, jenže oko čte TVAR, ne poznámku —
       a tvar tvrdil něco, co se nestalo.
       Osa proto drží nejméně desetinu hladiny: hýbe-li se řada míň,
       zbude plochá čára, což je pravda. Větší pohyb si osu roztáhne
       sám, takže skutečná změna se nezploští. */
    var stred = (max + min) / 2;
    var rozsah = Math.max((max - min) * 1.7, stred * 0.10) || 1;
    var dolu = stred - rozsah / 2, nahoru = stred + rozsah / 2;
    var x = function (i) { return L + (W - L - P) * (body.length === 1 ? 0.5 : i / (body.length - 1)); };
    var y = function (v) { return P + (Hh - P - D) * (1 - (v - dolu) / (nahoru - dolu)); };

    var d = body.map(function (b, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(b.cena).toFixed(1); }).join(' ');

    var prvni = body[0], posledni = body[body.length - 1];
    var zmena = prvni.cena ? (posledni.cena - prvni.cena) / prvni.cena * 100 : 0;
    var popisek = esc(vyber.druh.toLowerCase()) + ' ' + esc(kde);
    var nadpis = 'Nabídková cena za m² — ' + popisek;

    /* Body pro odečet: kruh je dost velký, aby se do něj dalo trefit
       prstem (hitbox je širší než značka). */
    var terce = body.map(function (b, i) {
      return '<g class="gc-bod" data-i="' + i + '">' +
        '<circle class="gc-hit" cx="' + x(i).toFixed(1) + '" cy="' + y(b.cena).toFixed(1) + '" r="14"></circle>' +
        '<circle class="gc-tec" cx="' + x(i).toFixed(1) + '" cy="' + y(b.cena).toFixed(1) + '" r="4.5"></circle></g>';
    }).join('');

    var radky = body.map(function (b) {
      return '<tr><td>' + esc(denKratce(b.den)) + '</td><td>' + cislo(b.cena) + ' Kč/m²</td><td>' + b.vzorek + '</td></tr>';
    }).join('');

    el.innerHTML =
      '<figure class="gc" data-rada="' + esc(vyber.klic) + '">' +
        '<figcaption class="gc-hlava">' +
          '<b>' + esc(nadpis) + '</b>' +
          '<span class="gc-ted">' + cislo(posledni.cena) + ' Kč/m²' +
            '<i class="gc-zmena' + (zmena > 0 ? ' up' : zmena < 0 ? ' down' : '') + '">' +
              (zmena > 0 ? '+' : '') + cislo(zmena) + ' % za ' + body.length + ' dní</i></span>' +
        '</figcaption>' +
        '<div class="gc-plocha">' +
          /* ŽÁDNÉ preserveAspectRatio="none": při natažení na šířku okna by
               se z koleček odečtu staly elipsy. */
            '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" ' +
            'aria-label="' + esc(nadpis + ': od ' + cislo(prvni.cena) + ' do ' + cislo(posledni.cena) + ' Kč za metr čtvereční') + '">' +
            /* ŽÁDNÁ VÝPLŇ POD ČAROU. Plocha se čte jako velikost měřená
               od nuly — jenže osa tady od nuly nezačíná, takže by ta
               plocha ukazovala množství, které graf vůbec neměří. Čára
               popisuje průběh a to je přesně to, o co jde. */
            '<path class="gc-cara" d="' + d + '"></path>' +
            '<line class="gc-kriz" x1="0" y1="' + P + '" x2="0" y2="' + (Hh - D) + '" hidden></line>' +
            terce +
          '</svg>' +
          '<div class="gc-bublina" hidden></div>' +
        '</div>' +
        '<div class="gc-osa"><span>' + esc(denKratce(prvni.den)) + '</span>' +
          '<span>' + esc(denKratce(posledni.den)) + '</span></div>' +
        '<p class="gc-pozn">Medián <b>nabídkové</b> ceny z <b>' + vyber.vzorek + '</b> nabídek ' +
          esc(kde) + ' — ne ceny, za které se pozemky prodaly; ty ve veřejných zdrojích nejsou. ' +
          maloVzorku(H, vyber.vzorek) +
          'Hladina se mění i tím, že nabídky přibývají a mizí. ' +
          'Svislá osa je v rozpětí ' + cislo(min) + '–' + cislo(max) + ' Kč/m², ne od nuly.</p>' +
        '<details class="gc-tab"><summary>Čísla v tabulce</summary>' +
          '<table><caption class="visually-hidden">' + esc(nadpis) + '</caption>' +
          '<thead><tr><th>Den</th><th>Medián</th><th>Z kolika nabídek</th></tr></thead>' +
          '<tbody>' + radky + '</tbody></table></details>' +
      '</figure>';

    /* ---- odečet pod prstem i myší ---- */
    var svg = el.querySelector('svg');
    var bub = el.querySelector('.gc-bublina');
    var kriz = el.querySelector('.gc-kriz');
    var plochaEl = el.querySelector('.gc-plocha');
    function ukaz(i) {
      var b = body[i];
      if (!b) return;
      bub.innerHTML = '<b>' + cislo(b.cena) + ' Kč/m²</b><span>' + esc(denKratce(b.den)) +
        ' · z ' + b.vzorek + ' nabídek</span>';
      bub.hidden = false;
      kriz.setAttribute('x1', x(i)); kriz.setAttribute('x2', x(i)); kriz.hidden = false;
      var pom = x(i) / W;
      bub.style.left = (pom * 100) + '%';
      /* Bublina se drží u SPODNÍHO okraje plochy, když je bod nahoře,
         a nahoře, když je bod dole — jinak leží přes čáru, kterou má
         vysvětlovat (napoprvé lezla i přes nadpis). */
      var vysoko = (y(b.cena) - P) / (Hh - P - D) < 0.5;
      bub.style.top = vysoko ? 'auto' : '2px';
      bub.style.bottom = vysoko ? '34px' : 'auto';
      bub.style.transform = 'translateX(' + (pom > 0.75 ? '-100%' : pom < 0.25 ? '0' : '-50%') + ')';
      [].forEach.call(el.querySelectorAll('.gc-bod'), function (g, j) { g.classList.toggle('on', j === i); });
    }
    function schovej() {
      bub.hidden = true; kriz.hidden = true;
      [].forEach.call(el.querySelectorAll('.gc-bod'), function (g) { g.classList.remove('on'); });
    }
    function zBodu(ev) {
      var r2 = svg.getBoundingClientRect();
      var kx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r2.left;
      var pom = kx / r2.width * W;
      var nej = 0, nejD = Infinity;
      for (var i = 0; i < body.length; i++) {
        var dd = Math.abs(x(i) - pom);
        if (dd < nejD) { nejD = dd; nej = i; }
      }
      ukaz(nej);
    }
    plochaEl.addEventListener('mousemove', zBodu);
    plochaEl.addEventListener('mouseleave', schovej);
    plochaEl.addEventListener('touchstart', function (e) { zBodu(e); }, { passive: true });
    plochaEl.addEventListener('touchmove', function (e) { zBodu(e); }, { passive: true });
    plochaEl.addEventListener('touchend', schovej);
    return true;
  }

  function postav(el) {
    var uroven = el.getAttribute('data-uroven');
    var nazev = el.getAttribute('data-nazev');
    var kde = el.getAttribute('data-kde') || nazev;
    if (!uroven || !nazev) return;
    nacti().then(function (H) {
      if (!H || !H.rady) return;
      var v = vyberRadu(H, uroven, nazev);
      // Žádná klidná řada → nekreslí se nic, ani prázdný rámeček.
      if (!v) return;
      try { kresli(el, H, v, kde); } catch (e) { /* graf navíc nesmí shodit stránku */ }
    });
  }

  function start() {
    var mista = [].slice.call(document.querySelectorAll('[data-graf-cen]'));
    if (!mista.length) return;
    /* Soubor s historií se stahuje, až když se k grafu někdo doroluje —
       na stránce okresu je hlavní obsah výpis nabídek, ne graf. */
    if (typeof IntersectionObserver === 'function') {
      var io = new IntersectionObserver(function (zaznamy) {
        zaznamy.forEach(function (z) {
          if (!z.isIntersecting) return;
          io.unobserve(z.target);
          postav(z.target);
        });
      }, { rootMargin: '300px' });
      mista.forEach(function (m) { io.observe(m); });
    } else {
      mista.forEach(postav);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  root.PKGrafCen = { postav: postav, vyberRadu: vyberRadu };
}(typeof window !== 'undefined' ? window : globalThis));
