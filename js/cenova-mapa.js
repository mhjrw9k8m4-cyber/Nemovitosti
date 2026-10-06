/* CENOVÁ MAPA OKRESŮ (cena-pozemku.html).
 *
 * Stránka „Kolik stojí pozemek?" uměla ceny po okresech jen jako SEZNAM
 * sedmdesáti sedmi řádků seřazených podle ceny. Z toho se dá přečíst,
 * který okres je nejdražší, ale ne to, na co se člověk u půdy ptá první:
 * KDE to je. Cena půdy je souvislá v prostoru — levné okresy drží spolu
 * při hranicích, drahé kolem Prahy a Brna — a seznam přesně tuhle
 * vlastnost zahodí.
 *
 * ---------------------------------------------------------------------
 * ODKUD BEROU ČÍSLA. Z ostrůvku dat ve stránce (#cen-mapa-data), který
 * tam zapsal TÝŽ výpočet, co vysázel tabulku pod mapou — ne z vlastního
 * počítání nad nabídkami. Kdyby si mapa počítala sama, mohla by u téhož
 * okresu ukázat jinou cenu než tabulka o kus níž; to už se na tomhle
 * webu jednou stalo (mapa proti stránce pozemku, viz js/ceny.js) a je to
 * horší než nemít mapu.
 *
 * HRANICE jsou data/okresy-hrube.json — zjednodušené obrysy okresů
 * (77 okresů, 1 961 bodů, 36 kB), které už web stahuje kvůli určení
 * okresu podle souřadnic. Žádná nová data se kvůli mapě nestahují.
 *
 * ŽÁDNÝ CIZÍ SERVER. Mapa je bez podkladových dlaždic: kreslí se jen
 * obrysy na pozadí stránky. Je to tak i hezčí (podklad by ty barvy
 * přebil), ale hlavně to znamená, že si otevření téhle stránky
 * nevyžádá spojení s žádným cizím serverem a že mapa funguje i offline.
 *
 * PŘÍSTUPNOST. Obrysy v Leafletu nejdou ovládat z klávesnice a barva
 * sama není informace. Mapa je proto doplněk, ne jediná cesta k údaji:
 * tytéž ceny stojí pod ní v seznamu, který je čitelný odečítačem
 * i bez barev, a mapa to o sobě ve stránce říká.
 */
(function (global) {
  'use strict';

  var MALO = 'rgba(128,128,128,0.18)';  // okres bez dostatku nabídek

  function cti() {
    var el = document.getElementById('cen-mapa-data');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function sLeafletem(hotovo) {
    if (global.L && global.L.map) return hotovo();
    var zn = document.querySelector('meta[name="pk-leaflet"]');
    var adresa = (zn && zn.getAttribute('data-src')) || 'vendor/leaflet/leaflet.js';
    var s = document.createElement('script');
    s.src = adresa;
    /* Při chybě se zavolá taky: mapa se pak nevykreslí a zůstane
       seznam pod ní, což je pořád celá informace. Mlčet a nechat
       „Načítám" navždy by bylo horší. */
    s.onload = function () { hotovo(); };
    s.onerror = function () { hotovo(); };
    document.head.appendChild(s);
  }

  /* BARVA JE JEN POŘADÍ, NE HODNOTA. Kdyby se mířilo lineárně na cenu,
     slila by se většina okresů do jednoho odstínu: medián je 26 Kč/m²,
     ale Praha-východ má 160, takže jedna hodnota roztáhne celou stupnici.
     Škáluje se proto podle POŘADÍ (percentilu) a legenda říká hranice
     slovy i čísly, aby z odstínu nikdo nečetl přesnou cenu. */
  function stupnice(hodnoty) {
    var set = hodnoty.slice().sort(function (a, b) { return a - b; });
    return function (v) {
      var i = 0;
      while (i < set.length && set[i] < v) i++;
      return set.length > 1 ? i / (set.length - 1) : 0.5;
    };
  }

  function barva(t) {
    /* TÁŽ ZELENÁ jako podbarvení řádků v seznamu pod mapou, jen s větším
       rozsahem krytí, ať je rozdíl vidět i na malé ploše.

       Bývala to modř rgba(91,184,214) a komentář tvrdil, že je to
       --c-sale. Nebyla: --c-sale je #4361B8, kdežto tohle byl tyrkys
       o odstínu 196° — jediná modrá plocha na zeleno-bílém webu.

       Krytí, ne jiná barva: funguje to ve světlém i tmavém režimu, kde
       pozadí prosvítá, a nevzniká odstín, který by v jednom z nich
       zmizel. */
    return 'rgba(44,113,80,' + (0.12 + t * 0.78).toFixed(3) + ')';
  }

  function kresli(data) {
    var ram = document.getElementById('cen-mapa');
    if (!ram || !global.L || !global.L.map) return;
    var zprava = document.getElementById('cen-mapa-stav');

    fetch('data/okresy-hrube.json').then(function (r) { return r.json(); }).then(function (hranice) {
      var L = global.L;
      var mapa = L.map(ram, {
        zoomControl: false, attributionControl: false,
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        /* Nehýbe se s ní schválně: je to obrázek celé republiky, ne
           nástroj na hledání. Kdo chce hledat, má odkaz na mapu
           pozemků — a vypnuté posouvání znamená, že se stránka na
           telefonu dál roluje prstem i přes mapu. */
        boxZoom: false, keyboard: false, touchZoom: false
      });

      var ceny = [];
      for (var k in data) if (data[k] && typeof data[k].med === 'number') ceny.push(data[k].med);
      var kam = stupnice(ceny);
      var vse = [];
      Object.keys(hranice).forEach(function (okres) {
        var kruhy = hranice[okres];
        if (!kruhy || !kruhy.length) return;
        var zaznam = data[okres];
        var ma = !!(zaznam && typeof zaznam.med === 'number');
        /* V souboru jsou body [lng, lat], Leaflet chce [lat, lng]. */
        var body = kruhy.map(function (kruh) {
          return kruh.map(function (b) { return [b[1], b[0]]; });
        });
        var tvar = L.polygon(body, {
          fillColor: ma ? barva(kam(zaznam.med)) : MALO,
          fillOpacity: 1,
          color: 'rgba(60,85,162,0.55)',
          weight: 0.8,
          /* Obrys je potřeba i u okresu bez dat: bez něj by v mapě byla
             děravá místa a vypadalo by to jako chyba vykreslení, ne jako
             „tady nevíme". */
          interactive: true
        });
        var popis = ma
          ? '<b>' + okres + '</b><br>Zemědělská půda ' + zaznam.med + ' Kč/m²'
            + (zaznam.lo != null && zaznam.hi != null ? '<br>rozpětí ' + zaznam.lo + '–' + zaznam.hi : '')
            + (zaznam.n != null ? ' · ' + zaznam.n + ' nab.' : '')
          : '<b>' + okres + '</b><br>málo nabídek na spolehlivý medián';
        tvar.bindTooltip(popis, { sticky: true });
        /* Okres a cena i do atributů vykresleného obrysu. Jednak se tím
           dá zkontrolovat, že mapa říká totéž jako seznam pod ní
           (scripts/test-cenova-mapa.mjs to čte odsud), jednak je to
           poctivější než držet tu informaci jen v bublině, která se
           objeví po najetí myší — na telefonu se nenajíždí. */
        tvar.on('add', function () {
          if (!tvar._path) return;
          tvar._path.setAttribute('data-okres', okres);
          if (ma) tvar._path.setAttribute('data-cena', String(zaznam.med));
          else tvar._path.setAttribute('data-malo', '1');
        });
        if (ma && zaznam.odkaz) {
          tvar.on('click', function () { global.location.href = zaznam.odkaz; });
          tvar.on('add', function () { if (tvar._path) tvar._path.style.cursor = 'pointer'; });
        }
        tvar.addTo(mapa);
        vse.push(tvar);
      });

      if (!vse.length) { if (zprava) zprava.textContent = 'Obrysy okresů se nepodařilo načíst.'; return; }
      var hranicePole = L.featureGroup(vse).getBounds();
      mapa.fitBounds(hranicePole, { padding: [6, 6] });
      /* Po dopočítání rozměrů ještě jednou: kontejner mívá v okamžiku
         vykreslení nulovou výšku, když se stránka teprve skládá. */
      setTimeout(function () { mapa.invalidateSize(); mapa.fitBounds(hranicePole, { padding: [6, 6] }); }, 60);
      ram.setAttribute('data-hotovo', String(vse.length));
      if (zprava) zprava.textContent = '';
    }).catch(function () {
      if (zprava) zprava.textContent = 'Obrysy okresů se nepodařilo načíst.';
    });
  }

  function start() {
    var ram = document.getElementById('cen-mapa');
    if (!ram) return;
    var data = cti();
    if (!data) return;
    /* Až na dohled: nahoře na stránce jsou ceny podle druhu, ne mapa,
       a Leaflet má 42 kB. */
    function zapni() { sLeafletem(function () { kresli(data); }); }
    if (!('IntersectionObserver' in global)) return zapni();
    var hlidac = new IntersectionObserver(function (zaznamy) {
      for (var i = 0; i < zaznamy.length; i++) {
        if (zaznamy[i].isIntersecting) { hlidac.disconnect(); zapni(); return; }
      }
    }, { rootMargin: '300px' });
    hlidac.observe(ram);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}(typeof self !== 'undefined' ? self : this));
