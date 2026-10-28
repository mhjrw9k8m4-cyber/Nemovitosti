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
    return c.length === 3 ? (+c[2]) + '.\u00a0' + MESICE[+c[1] - 1] : iso;
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
        nej = { klic: k, druh: c[2], uroven: c[0], r: r, bodu: bodu, vzorek: vzorek };
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
  function maloVzorku(H, vzorek, uroven) {
    var dost = H && typeof H.dost === 'number' ? H.dost : 0;
    if (!dost || vzorek >= dost) return '';
    /* Výhrada musí mluvit o tom, co graf ukazuje. Stálo tu „celého
       okresu" i pro kraj, a od chvíle, co je graf i na celé ČR, by to
       znělo rovnou nesmyslně. */
    var kde = uroven === 'kraj' ? 'celého kraje' : (uroven === 'cr' ? 'celé ČR' : 'celého okresu');
    return 'Na cenu ' + kde + ' je to málo — berte to jako hrubé vodítko. ';
  }

  /* STRUČNÁ POZNÁMKA PRO INZERÁT. Dlouhá metodika pod grafem je na
     okresní stránce na místě — tam je graf hlavní obsah a vedle něj
     stojí medián za celou skupinu druhů, se kterým se čára nerovná.
     V inzerátu žádné takové číslo nad grafem NENÍ, takže by ten
     odstavec vysvětloval rozpor, který tam nikdo nevidí — a stojí
     přitom ~250 px z karty vysoké 558. Stránka pozemku má přitom
     změřený rozpočet 4,4 obrazovky telefonu a zbývalo do něj 170 px.
     Místo odstavce zůstane věta, co čára je, věta o ose (bez ní se
     křivka čte špatně) a odkaz na podrobnosti. */
  function kresli(el, H, vyber, kde, strucne) {
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
    /* ŠÍŘKA SE MĚŘÍ BEZ ODSAZENÍ. clientWidth nese i vodorovné
       odsazení prvku, kdežto SVG se natáhne jen na jeho vnitřek —
       v odsazené kartě (detail nabídky má 16 px z každé strany) by
       tedy viewBox vyšel o 32 px širší, než na kolik se obrázek
       natáhne, a z koleček odečtu by se staly elipsy. Na stránce
       okresu je odsazení nulové, takže se tam nic nemění. */
    var st = root.getComputedStyle ? root.getComputedStyle(el) : null;
    var odsad = st ? (parseFloat(st.paddingLeft) || 0) + (parseFloat(st.paddingRight) || 0) : 0;
    var W = Math.max(280, Math.round((el.clientWidth || 900) - odsad));
    var Hh = W < 560 ? 150 : 190;
    /* OSY MAJÍ ČÍSLA, NE JEN POZNÁMKU POD GRAFEM — podle předlohy ze
       Sreality („Cenový přehled"), kterou poslal majitel 28. 10.:
       vlevo horní a dolní mez osy, dole data. Dosud se rozpětí osy
       psalo VĚTOU pod grafem, což je horší ze dvou důvodů: číst polohu
       čáry ze souvislého textu nejde, a věta se o tom, co je
       nakreslené, dá snadno rozejít (přesně to se stalo v §121).
       Vlevo proto zbyde místo na nejširší popisek („1 234 Kč/m²"),
       dole na jeden řádek dat. */
    var L = W < 560 ? 56 : 68, P = 14, D = 28;
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
    var podilOsy = (max - min) / rozsah * 100;   // jakou část výšky osy čára zabere
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

    /* POPISKY OSY. Vlevo mez osy nahoře a dole — ne nejvyšší a nejnižší
       NAMĚŘENÁ hodnota: čára se nedotýká okraje a popisek u okraje by
       tvrdil, že se dotýká. Dole čtyři data rozprostřená po řadě; víc
       jich na telefon nejde čitelně dát, míň už neříká, jak je řada
       dlouhá. Krajní dva se zarovnávají dovnitř, aby je neuřízl okraj. */
    var osaY = '<text class="gc-popisek" x="' + (L - 8) + '" y="' + (P + 4) + '" text-anchor="end">'
        + cislo(nahoru) + ' Kč/m²</text>'
      + '<text class="gc-popisek" x="' + (L - 8) + '" y="' + (Hh - D + 4) + '" text-anchor="end">'
        + cislo(dolu) + ' Kč/m²</text>';
    /* Dvě vodicí linky u mezí osy. Mřížka to není — dvě čáry jen říkají,
       kde ta dvě čísla vlevo platí. */
    var linky = '<line class="gc-vodici" x1="' + L + '" y1="' + P + '" x2="' + (W - P) + '" y2="' + P + '"></line>'
      + '<line class="gc-vodici" x1="' + L + '" y1="' + (Hh - D) + '" x2="' + (W - P) + '" y2="' + (Hh - D) + '"></line>';
    var kdyIndexy = [0, Math.round((body.length - 1) / 3), Math.round((body.length - 1) * 2 / 3), body.length - 1]
      .filter(function (v, i, p2) { return p2.indexOf(v) === i; });
    var osaX = kdyIndexy.map(function (i, poradi) {
      var kotva = poradi === 0 ? 'start' : (poradi === kdyIndexy.length - 1 ? 'end' : 'middle');
      return '<text class="gc-popisek" x="' + x(i).toFixed(1) + '" y="' + (Hh - D + 18) + '" text-anchor="' + kotva + '">'
        + esc(denKratce(body[i].den)) + '</text>';
    }).join('');

    var radky = body.map(function (b) {
      return '<tr><td>' + esc(denKratce(b.den)) + '</td><td>' + cislo(b.cena) + ' Kč/m²</td><td>' + b.vzorek + '</td></tr>';
    }).join('');

    el.innerHTML =
      '<figure class="gc" data-rada="' + esc(vyber.klic) + '">' +
        '<figcaption class="gc-hlava">' +
          '<b>' + esc(nadpis) + '</b>' +
          '<span class="gc-ted">' + cislo(posledni.cena) + ' Kč/m²' +
            /* ŽÁDNÁ TŘÍDA PODLE SMĚRU. Dřív tu stálo class="gc-zmena up"
               nebo down — jenže pravidlo pro ně ve stylopisu nikdy
               nevzniklo, takže ta jména nic nedělala a hlídač mrtvých
               jmen je právem hlásil, jakmile se graf objevil i na
               stránce pozemku. Směr navíc stojí ve znaménku rovnou
               v textu, barva by ho jen opakovala. */
            '<i class="gc-zmena">' +
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
            linky + osaY + osaX +
            '<path class="gc-cara" d="' + d + '"></path>' +
            '<line class="gc-kriz" x1="0" y1="' + P + '" x2="0" y2="' + (Hh - D) + '" hidden></line>' +
            terce +
          '</svg>' +
          '<div class="gc-bublina" hidden></div>' +
        '</div>' +
        '<p class="gc-pozn">Medián <b>nabídkové</b> ceny z <b>' + vyber.vzorek + '</b> nabídek ' +
          esc(kde) + ' — ne ceny, za které se pozemky prodaly; ty ve veřejných zdrojích nejsou. ' +
          (strucne ? '' : maloVzorku(H, vyber.vzorek, vyber.uroven) +
          'Hladina se mění i tím, že nabídky přibývají a mizí. ') +
          /* PROČ SE ČÁRA NESHODUJE S MEDIÁNEM NAD GRAFEM. Nejsou to dvě
             verze téhož čísla — a od opravy úředně stanovených cen už
             to není ani rozdíl ve VÝPOČTU: obě strany počítají z téže
             hromádky (js/ceny.js vynechává prodej státní půdy stejně
             jako ho vynechává generátor stránek). Zbývá rozdíl
             v TOM, O ČEM to číslo je: nad grafem stojí medián za hrubou
             skupinu (celá „zemědělská půda", tedy orná i louky), kdežto
             graf kreslí jeden konkrétní druh — ten, který je nejlépe
             doložený, a je napsaný v nadpisu grafu.
             Naměřeno na 27 stránkách, kde stojí obojí: po opravě je
             největší rozdíl 2,8× (dřív 6,9×) a Česká Lípa, kde číslo
             stálo na 55 a čára na 8 Kč/m², je dnes 43 proti 35. */
          (strucne ? '' : 'Nad grafem stojí medián za celou skupinu druhů, kdežto čára je ' +
          'za ten jeden druh, který je v nadpisu — proto se čísla nerovnají. ') +
          /* CO TU STÁLO A PROČ TO BYLA NEPRAVDA.
             „Svislá osa je v rozpětí 45,7–46,6 Kč/m²" — jenomže to je
             rozpětí DAT, ne osy. Osa drží nejméně desetinu hladiny (viz
             výpočet výš), takže ve skutečnosti šla od 43,8 do 48,5.
             Změřeno na všech 37 řadách, které graf dostanou: data zabe-
             rou mediánově 5 % výšky osy (nejvíc 56 %), takže kdo by si
             polohu čáry proti té větě přečetl, mýlí se až dvacetinásobně.
             Na osmnácti z nich — na těch, které se za celou dobu nepohnuly
             ani o desátou korunu — z toho navíc vyšlo „v rozpětí 36,4–36,4
             Kč/m²", což není rozpětí.
             Teď se píše osa tak, jak je nakreslená, a pod ní pás, ve kterém
             data leží — včetně toho, jakou část výšky čára zabere. To
             poslední číslo se dá změřit přímo z nakreslené křivky, a tak
             to taky scripts/test-graf-cen.mjs dělá.
             A OD 28. 10. SE MEZE OSY UŽ NEPÍŠOU VĚTOU: stojí u osy,
             protože tam patří (viz předloha ze Sreality, kterou poslal
             majitel). Větou zbývá jen to, co z obrázku přečíst nejde —
             že osa nezačíná nulou a jakou část její výšky čára zabírá. */
          'Čísla u svislé osy jsou meze, mezi kterými se čte; osa nezačíná nulou. ' +
          (cislo(min) === cislo(max)
            ? 'Po zaokrouhlení vyšly všechny naměřené dny na ' + cislo(min) + ' Kč/m², proto je čára plochá.'
            : 'Naměřené hodnoty leží mezi ' + cislo(min) + ' a ' + cislo(max) + ' Kč/m², takže čára zabírá ' +
              (podilOsy < 1 ? 'necelé procento' : Math.round(podilOsy) + ' %') + ' výšky osy.') +
          '</p>' +
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

  /* VRACÍ SLIB: `true`, když se graf opravdu nakreslil, jinak `false`.
     Stránce okresu je to jedno — tam je místo pro graf napsané ve zdroji
     a prázdné místo nic nestojí. Detail nabídky to ale potřebuje: obal
     grafu si tam staví js/pozemek.js a bez téhle odpovědi by nad
     nenakresleným grafem zůstal nadpis a rámeček o ničem. A nebyl by to
     okrajový případ: klidnou řadu má 23 okresů ze 77, takže většina
     stránek pozemků graf nedostane. */
  function postav(el) {
    var uroven = el.getAttribute('data-uroven');
    /* CELÁ ČR NEMÁ JMÉNO. Klíč řady je „úroveň|název|druh" a u celostátní
       řady je prostřední část prázdná (`cr||Orná půda`) — tak to píše
       scripts/historie-cen.mjs. Podmínka `!nazev` tedy celostátní graf
       zahazovala: data pro něj v souboru ležela od začátku (osm řad, z toho
       čtyři klidné), ale nakreslit se nedal a žádná stránka ho nežádala.
       Jméno se proto vyžaduje jen tam, kde ho klíč opravdu má. */
    var nazev = el.getAttribute('data-nazev') || '';
    var kde = el.getAttribute('data-kde') || nazev;

    /* ZÁLOHY: KDYŽ OKRES ŘADU NEMÁ, UKÁŽE SE VĚTŠÍ ÚZEMÍ.
       Klidnou řadu má 21 okresů ze 48, 9 krajů ze 14 a celá ČR vždycky.
       Bez záloh tedy na většině nabídek nebyl graf žádný — a přesně to
       majitel 28. 10. hlásil („ten graf v inzerátu"): na své stránce ho
       neviděl, protože její okres mezi těmi dvaceti jedna nebyl.
       Nelže se tím: nadpis i poznámka pod grafem pokaždé říkají, o jaké
       území jde, takže „v celé ČR" se nikdy netváří jako „tady u vás".
       Pořadí je od nejbližšího k nejobecnějšímu a zapisuje se do
       `data-zalohy` jako „úroveň|název|kde", oddělené středníkem. */
    var seznam = [];
    if (uroven) seznam.push({ uroven: uroven, nazev: nazev, kde: kde });
    (el.getAttribute('data-zalohy') || '').split(';').forEach(function (z) {
      var c = z.split('|');
      if (c[0]) seznam.push({ uroven: c[0], nazev: c[1] || '', kde: c[2] || c[1] || '' });
    });
    if (!seznam.length) return Promise.resolve(false);
    /* Stránka si řekne o stručnou poznámku sama (data-strucne);
       okresní a krajské stránky ji nemají, takže tam zůstane celá. */
    var strucne = el.hasAttribute('data-strucne');

    return nacti().then(function (H) {
      if (!H || !H.rady) return false;
      for (var i = 0; i < seznam.length; i++) {
        var m = seznam[i];
        /* Celá ČR jméno nemá (klíč `cr||Orná půda`); u ostatních úrovní
           je jméno povinné, jinak by se hledala řada bez místa. */
        if (m.uroven !== 'cr' && !m.nazev) continue;
        var v = vyberRadu(H, m.uroven, m.nazev);
        // Žádná klidná řada → zkusí se další záloha.
        if (!v) continue;
        try { if (kresli(el, H, v, m.kde, strucne) === true) return true; }
        catch (e) { return false; /* graf navíc nesmí shodit stránku */ }
      }
      return false;
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
