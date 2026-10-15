/* Letecký snímek pozemku s OBRYSEM ROZSAHU.
 *
 * Proč zvlášť: tentýž snímek se skládal dvakrát — jednou v js/main.js pro
 * náhled na kartě, podruhé v js/pozemek.js pro velký obrázek na stránce.
 * Dvě kopie téhož výpočtu se dřív nebo později rozejdou; u cen a u rad se to
 * na tomhle webu už stalo. Tady je to jednou.
 *
 * Co se kreslí:
 *   – letecký snímek poskládaný z dlaždic tak, aby byl pozemek UPROSTŘED,
 *   – špendlík na přesném bodě,
 *   – dole název místa a výměra.
 *
 * Čtverec o skutečné výměře tu chvíli byl a je pryč. Měl říkat, jak je
 * pozemek velký proti domům vedle, jenže na snímku působil jako obrys
 * parcely — a ten nemáme, je v katastru. Radši nic než čára, kterou si
 * někdo splete s hranicí pozemku.
 *
 * Přiblížení se pořád řídí výměrou: hektarový pozemek se tak na snímku
 * ukáže v jiném měřítku než zahrádka, což je to samé sdělení bez čáry.
 */
(function (global) {
  'use strict';

  var ZDROJ = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';

  /* Podklady pro ŽIVOU mapu (Leaflet) v detailu pozemku. Adresa leteckých
     dlaždic je tatáž jako u nehybného snímku nad tím — proto sedí tady
     a ne v js/pozemek.js. Dvě kopie téže adresy se rozejdou úplně stejně,
     jako se kdysi rozešly dva výpočty snímku; to je celý důvod, proč
     tenhle soubor vznikl. */
  var PODKLADY = [
    { id: 'letecka', nazev: 'Letecká', url: ZDROJ + '{z}/{y}/{x}',
      uvedeni: '&copy; Esri, Maxar, Earthstar Geographics', max: 19 },
    { id: 'zakladni', nazev: 'Základní', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      uvedeni: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', max: 19 }
  ];

  function worldX(lng, n) { return (lng + 180) / 360 * 256 * n; }
  function worldY(lat, n) {
    var r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * n;
  }
  /** Kolik metrů připadá na jeden obrazový bod při daném přiblížení. */
  function metryNaBod(lat, z) {
    return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
  }
  /** Přiblížení podle výměry: aby se pozemek vešel a nebyl přitom tečka. */
  function priblizeni(d, sirka, vyska) {
    if (!(d.area > 0) || !isFinite(d.lat)) return 16;
    var strana = Math.sqrt(d.area);                 // v metrech
    var cil = Math.min(sirka, vyska) * 0.52;        // ať kolem zbyde okolí
    for (var z = 18; z >= 13; z--) {
      if (strana / metryNaBod(d.lat, z) <= cil) return z;
    }
    return 13;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /**
   * @param d     pozemek (lat, lng, area, place, okres, type)
   * @param nast  {sirka, vyska, barva, id, popis:true/false}
   */
  function html(d, nast) {
    nast = nast || {};
    var Vw = nast.sirka || 384, Vh = nast.vyska || 240;
    var barva = nast.barva || '#0F5C3B';
    var id = 'sn' + (nast.id != null ? nast.id : 0);
    var z = priblizeni(d, Vw, Vh), n = Math.pow(2, z);
    var WX = worldX(d.lng, n), WY = worldY(d.lat, n);
    var ox = WX - Vw / 2, oy = WY - Vh / 2;

    /* DLAŽDICE SE NEOBJEDNÁVAJÍ HNED — ADRESA ČEKÁ V data-href.
       Naměřeno 15. 10. na displeji 390 px: úvodní stránka má 24 těchto
       snímků a v nich 118 dlaždic ze serveru Esri. Nad ohybem je z nich
       JEDEN snímek a 4 dlaždice; ostatních 114 si telefon stahoval pro
       nabídky, na které nikdo ani nedojel. Přes slabou linku (1,6 Mb/s,
       150 ms, procesor ×4) to bylo 2,23 MB a 9 290 ms, než se ukázala
       první nabídka — a ty dlaždice přitom soupeřily o linku s daty
       a skripty, bez kterých stránka nejde vůbec.
       Líné načítání tu nejde udělat atributem: loading="lazy" umí jen
       HTML <img>, uvnitř SVG se na <image> neuplatní (zkoušeno). Adresa
       proto čeká v data-href a doplní ji `probud()` ve chvíli, kdy se
       snímek přiblíží k oknu. */
    var dlazdice = '';
    for (var tx = Math.floor(ox / 256); tx <= Math.floor((ox + Vw) / 256); tx++) {
      for (var ty = Math.floor(oy / 256); ty <= Math.floor((oy + Vh) / 256); ty++) {
        var u = ZDROJ + z + '/' + ty + '/' + tx;
        dlazdice += '<image data-href="' + u + '" x="' + (tx * 256 - ox).toFixed(1) +
          '" y="' + (ty * 256 - oy).toFixed(1) + '" width="256" height="256" preserveAspectRatio="none"/>';
      }
    }

    var cx = Vw / 2, cy = Vh / 2;
    var spendlik = '<g transform="translate(' + cx + ',' + cy + ')" filter="url(#' + id + ')">' +
      '<path d="M0 0C-7 -12 -12 -18 -12 -25 A12 12 0 1 1 12 -25 C12 -18 7 -12 0 0Z" fill="' + barva +
      '" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle cx="0" cy="-25" r="4.6" fill="#fff"/></g>';

    return '<svg class="opp-map" data-sn="ceka" viewBox="0 0 ' + Vw + ' ' + Vh + '" preserveAspectRatio="xMidYMid slice" ' +
      'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">' +
      '<defs><filter id="' + id + '" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(0,0,0,0.5)"/></filter></defs>' +
      '<rect width="' + Vw + '" height="' + Vh + '" fill="#12241A"/>' +
      '<g stroke="rgba(206,228,212,0.06)" stroke-width="1">' +
      '<path d="M64 0V' + Vh + 'M128 0V' + Vh + 'M192 0V' + Vh + 'M256 0V' + Vh + 'M320 0V' + Vh +
      'M0 60H' + Vw + 'M0 120H' + Vw + 'M0 180H' + Vw + '"/></g>' +
      dlazdice + spendlik +
      '</svg>';
  }

  /* Popiska přes spodek snímku. Popisuje OBRÁZEK, ne stránku — proto je pod ní
     výměra (to je, co ten čtverec ukazuje), a ne okres, který stojí hned pod
     snímkem v hlavičce. A proto je pro odečítač obrazovky skrytá: název místa
     i výměru si přečte z textu stránky, dvakrát je slyšet nepotřebuje. */
  function popis(d) {
    if (!d.place) return '';
    var v = d.area > 0
      ? (d.area >= 10000 ? (d.area / 10000).toFixed(d.area >= 100000 ? 0 : 1).replace('.', ',') + '\u00a0ha'
                         : String(Math.round(d.area)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0m²')
      : '';
    return '<span class="sn-popis" aria-hidden="true">' +
      '<b>' + esc(d.place) + '</b>' +
      (v ? '<i>' + v + '</i>' : '') +
      (d.area > 0 ? '<u>přesný obrys pozemku najdete v katastru</u>' : '') +
      '</span>';
  }

  /* NÁHLED VE VÝPISU: JEDNA DLAŽDICE, NE SKLÁDANÝ SNÍMEK.
   * Velký snímek nahoře skládá tolik dlaždic, kolik se jich do okna
   * vejde. U čtvercového náhledu ve výpisu by to byly v průměru 2,6
   * dlaždice na nabídku — při 24 nabídkách na stránce přes šedesát
   * požadavků navíc, a to na stránkách, které si schválně nestahují
   * ani mapový web.
   * Náhled proto bere JEDNU dlaždici celou a špendlík se do ní posadí
   * tam, kde pozemek v té dlaždici doopravdy leží (`ox`, `oy` jsou
   * body uvnitř dlaždice, 0–256).
   *
   * PŘIBLÍŽENÍ SE VYBÍRÁ PODLE TOHO, KAM BOD PADNE. Dlaždice jsou pevná
   * mříž, takže při jednom přiblížení může pozemek ležet těsně u kraje
   * a kolem něj není vidět nic. Zkouší se proto po řadě a bere se první
   * přiblížení, ve kterém bod padne do prostřední poloviny dlaždice;
   * když žádné nesedí, platí první z řady — radši bod u kraje než
   * žádný snímek.
   *
   * Je to TADY, a ne ve skriptu sestavení, schválně: adresa dlaždic
   * i přepočet souřadnic na body stojí v tomhle souboru jednou a tahle
   * funkce z nich vychází. Dvě kopie téhož výpočtu se rozejdou — kvůli
   * tomu tenhle soubor vznikl (viz komentář nahoře). */
  function nahled(d, zoomy) {
    if (!d || !isFinite(d.lat) || !isFinite(d.lng)) return null;
    /* Měřítko si určuje VÝMĚRA, ne pořadí v seznamu: pro desetihektarový
       pozemek je dlaždice z přiblížení 19 výřez o padesáti metrech, tedy
       kus jednoho rohu. Vybírá se proto nejdřív přiblížení podle výměry
       (tentýž výpočet, jaký používá velký snímek) a teprve kolem něj se
       zkouší sousední o stupeň výš a níž. Naměřeno na pozemku 10 442 m²
       v Praze: bez tohohle pořadí vyšlo přiblížení 19 a na snímku nebyl
       pozemek, ale jedna zahrada vedle něj. */
    var zaklad = priblizeni(d, 256, 256);
    var rada = zoomy || [zaklad, zaklad - 1, zaklad + 1, zaklad - 2]
      /* STROP 18, NE 19. Když dlaždice chybí, nakreslí prohlížeč do rohu
         ikonu rozbitého obrázku (zkoušeno a vyfoceno) — a letecké
         podklady bývají nejřidší právě v nejbližším přiblížení nad poli
         a lesy, tedy přesně tam, kde jsou pozemky. Stupeň 18 má
         0,4 m na bod, což na náhled 128 px bohatě stačí. */
      .filter(function (z) { return z >= 13 && z <= 18; });
    var prvni = null;
    for (var i = 0; i < rada.length; i++) {
      var z = rada[i], n = Math.pow(2, z);
      var WX = worldX(d.lng, n), WY = worldY(d.lat, n);
      var tx = Math.floor(WX / 256), ty = Math.floor(WY / 256);
      var kus = { z: z, x: tx, y: ty, ox: WX - tx * 256, oy: WY - ty * 256,
        url: ZDROJ + z + '/' + ty + '/' + tx };
      if (!prvni) prvni = kus;
      /* Prostřední pětina stran ponechaná stranou: u bodu blíž ke kraji
         než 48 bodů (z 256) je na jedné straně vidět sotva nic. */
      if (kus.ox > 48 && kus.ox < 208 && kus.oy > 48 && kus.oy < 208) return kus;
    }
    return prvni;
  }

  /* ================================================================
     LÍNÉ DLAŽDICE
     ================================================================
     `probud(el)` doplní do všech <image data-href> uvnitř `el` skutečnou
     adresu; tím se dlaždice teprve objedná. Volá se sama — hlídač níž
     sleduje, kdy se snímek přiblíží k oknu.

     XLINK SE DOPLŇUJE TAKY. V značce už není (dvě adresy v jednom prvku
     by znamenaly dva požadavky, kdyby si prohlížeč vybral oba), ale
     starší prohlížeče rozumí jen jemu, a tenhle web se o ně stará —
     proto se tu nastavuje obojí, href i xlink:href.

     ROZPĚTÍ 600 px: dlaždice se objedná, ještě než na ni člověk dojede,
     takže při obvyklém rolování nevidí prázdné místo. Naměřeno: první
     snímek na displeji 390 px začíná 1 040 px od začátku stránky, takže
     s tímhle rozpětím se stáhne hned — a to je dobře, ten se vidí. */
  var XLINK = 'http://www.w3.org/1999/xlink';
  function probud(el) {
    if (!el || !el.querySelectorAll) return;
    el.removeAttribute && el.removeAttribute('data-sn');
    var o = el.querySelectorAll('image[data-href]');
    for (var i = 0; i < o.length; i++) {
      var u = o[i].getAttribute('data-href');
      o[i].removeAttribute('data-href');
      o[i].setAttribute('href', u);
      try { o[i].setAttributeNS(XLINK, 'xlink:href', u); } catch (e) {}
    }
  }

  var hlidac = null;
  if (global.IntersectionObserver) {
    hlidac = new global.IntersectionObserver(function (zapisy) {
      for (var i = 0; i < zapisy.length; i++) {
        if (!zapisy[i].isIntersecting) continue;
        hlidac.unobserve(zapisy[i].target);
        probud(zapisy[i].target);
      }
    }, { rootMargin: '600px 0px' });
  }

  function prihlas(korene) {
    for (var k = 0; k < korene.length; k++) {
      var r = korene[k];
      if (!r || r.nodeType !== 1) continue;
      var sez = r.matches && r.matches('[data-sn="ceka"]') ? [r] : [];
      if (r.querySelectorAll) {
        var dal = r.querySelectorAll('[data-sn="ceka"]');
        for (var i = 0; i < dal.length; i++) sez.push(dal[i]);
      }
      for (var j = 0; j < sez.length; j++) {
        /* BEZ IntersectionObserver SE PROBUDÍ ROVNOU. Lepší pomalá
           stránka než stránka bez snímků; tohle není ozdoba, náhled
           nabídky je to, podle čeho člověk vybírá. */
        if (hlidac) hlidac.observe(sez[j]); else probud(sez[j]);
      }
    }
  }

  /* Karty se vykreslují až ze skriptu (a překreslují při každém
     filtrování), takže se na nové snímky nedá čekat jedním průchodem
     po načtení — hlídá se, co do stránky přibude. */
  if (global.MutationObserver && global.document) {
    new global.MutationObserver(function (zmeny) {
      for (var i = 0; i < zmeny.length; i++) {
        if (zmeny[i].addedNodes && zmeny[i].addedNodes.length) prihlas(zmeny[i].addedNodes);
      }
    }).observe(global.document.documentElement, { childList: true, subtree: true });
  }
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () { prihlas([global.document.body]); });
    } else { prihlas([global.document.body]); }
  }

  global.PK_SNIMEK = { html: html, popis: popis, priblizeni: priblizeni, metryNaBod: metryNaBod,
    nahled: nahled, podklady: PODKLADY, probud: probud, prihlas: prihlas };
})(window);
