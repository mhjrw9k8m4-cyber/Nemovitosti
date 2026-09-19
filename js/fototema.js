/* =====================================================================
   Parcelka — rozpoznání, co je na fotce.

   Na fotky už web kouká třikrát: rozměry, jas a pestrost, a údaje v EXIFu.
   Žádná z těch kontrol ale neví, CO je na obrázku — proto prošla i fotka
   balíčku slaniny z obchodu.

   Tahle vrstva používá MobileNet (rozpoznávání 1000 běžných předmětů),
   uložený rovnou v repozitáři (assets/mobilenet/). Model neumí říct „tohle
   je pozemek" — umí říct „tohle je packet / military uniform / web site".
   Rozhodnutí proto stojí na skupinách tříd a na tom, jak jistě model mluví.

   Naměřeno na skutečných obrázcích (viz scripts/test-fototema.mjs):
     fotka balíčku slaniny  → packet 26 %, rotisserie 10 %, plastic bag 4 %
     snímek stránky s textem→ envelope 46 %, web site 44 %
     portrét člověka        → military uniform 58 %, suit 15 %
     hráč na kurtu          → ballplayer 88 %

   Rozhodnutí je záměrně nesymetrické: zamítá se jen tam, kde model mluví
   jistě a nic venkovního nevidí. Když si není jistý, fotka projde —
   vyhodit poctivou fotku je horší než pustit jednu nepovedenou.
   ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PKFotoTema = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Skupiny bere z js/fotoskupiny.js — jeden znak pro každou z 1000 tříd
     (V venku / N proti / . neutrální). Dřív tu byl ruční seznam asi 120
     tříd a zbylých 880 nepatřilo nikam: fotka slaniny označená modelem
     jako „oil filter" nebo „nipple" tím propadla bez povšimnutí. */

  // Pro hlášku uživateli — ať se nedozví „packet", ale co to znamená.
  var CESKY = {
    'packet': 'zabalené zboží', 'plastic bag': 'igelitová taška', 'carton': 'krabice',
    'refrigerator, icebox': 'lednice', 'rotisserie': 'gril', 'plate': 'talíř',
    'grocery store, grocery, food market, market': 'obchod', 'butcher shop, meat market': 'řeznictví',
    'web site, website, internet site, site': 'webová stránka', 'envelope': 'dokument nebo obálka',
    'screen, CRT screen': 'obrazovka', 'monitor': 'monitor', 'menu': 'jídelní lístek',
    'military uniform': 'člověk v uniformě', 'suit, suit of clothes': 'člověk v obleku',
    'jersey, T-shirt, tee shirt': 'oblečení', 'desk': 'psací stůl', 'dining table, board': 'jídelní stůl',
    'toilet seat': 'záchod', 'bathtub, bathing tub, bath, tub': 'vana', 'cup': 'hrnek',
    'pizza, pizza pie': 'pizza', 'cheeseburger': 'hamburger', 'laptop, laptop computer': 'notebook',
    'nipple': 'dudlík nebo obal', 'oil filter': 'strojní součástka', 'hard disc, hard disk, fixed disk': 'elektronika',
    'mousetrap': 'past', 'cassette': 'kazeta', 'racket, racquet': 'sportovní náčiní',
    'pill bottle': 'lahvička', 'digital clock': 'hodiny', 'rule, ruler': 'pravítko',
    'hard disc, hard disk, fixed disk': 'elektronika', 'switch, electric switch, electrical switch': 'vypínač',
    'wall clock': 'hodiny', 'spotlight, spot': 'světlo', 'hamper': 'koš', 'confectionery, confectionary, candy store': 'cukrárna',
    'hay': 'seno', 'barn': 'stodola', 'valley, vale': 'údolí', 'lakeside, lakeshore': 'břeh',
    'alp': 'hory', 'tractor': 'traktor', 'picket fence, paling': 'plot', 'corn': 'kukuřice',
    'greenhouse, nursery, glasshouse': 'skleník', 'agaric': 'houby', 'daisy': 'kopretiny'
  };

  var PRAHY = {
    obrazovka: 25,     // % — snímek obrazovky nebo dokument
    zamitnout: 35,     // % — jistě nevhodný obsah, když zároveň nic venkovního
    upozornit: 15,     // % — slabší podezření
    venkuJistota: 5    // % — kolik stačí „venku", aby se nezamítalo
  };

  function nazev(predikce) { return (predikce && predikce.trida) || ''; }
  /* Český název třídy — jen pro ty, které umíme pojmenovat. U ostatních
     vrací prázdno: hláška „spíš jako pill bottle" uživateli nic neřekne,
     tak ji raději necháme bez dovětku. */
  function cesky(trida) { return CESKY[trida] || ''; }

  /* Vstup: predikce [{index, trida, jistota}] a řetězec skupin.
     Výstup: {ok, msg?, varovani?, detail} — detail nese čísla, aby se
     uživateli i v testech dalo ukázat, PROČ to dopadlo, jak dopadlo. */
  function vyhodnot(predikce, skupiny) {
    var detail = { venku: 0, proti: 0, obrazovka: 0, nej: [] };
    if (!predikce || !predikce.length) return { ok: true, detail: detail };
    skupiny = skupiny || (typeof PKSkupiny !== 'undefined' ? PKSkupiny : null) ||
      (typeof require === 'function' ? null : null);

    var OBRAZOVKOVE = ['web site, website, internet site, site', 'screen, CRT screen', 'monitor',
      'television, television system', 'laptop, laptop computer', 'notebook, notebook computer',
      'desktop computer', 'hand-held computer, hand-held microcomputer', 'envelope', 'menu',
      'comic book', 'crossword puzzle, crossword', 'book jacket, dust cover, dust jacket, dust wrapper',
      'binder, ring-binder', 'cellular telephone, cellular phone, cellphone, cell, mobile phone'];

    for (var i = 0; i < predikce.length; i++) {
      var p = predikce[i];
      var skupina = (skupiny && p.index != null) ? skupiny.charAt(p.index) : '.';
      var j = p.jistota || 0;
      if (skupina === 'V') detail.venku += j;
      else if (skupina === 'N') detail.proti += j;
      if (OBRAZOVKOVE.indexOf(p.trida) !== -1) detail.obrazovka += j;
      if (detail.nej.length < 3) detail.nej.push({ trida: p.trida, cesky: cesky(p.trida), jistota: Math.round(j), skupina: skupina });
    }
    detail.venku = Math.round(detail.venku);
    detail.proti = Math.round(detail.proti);
    detail.obrazovka = Math.round(detail.obrazovka);

    var prvniCesky = cesky(nazev(predikce[0]));

    if (detail.obrazovka >= PRAHY.obrazovka && detail.venku < PRAHY.venkuJistota) {
      return { ok: false, msg: 'vypadá jako snímek obrazovky nebo dokument, ne jako fotka pozemku', detail: detail };
    }
    if (detail.proti >= PRAHY.zamitnout && detail.venku < PRAHY.venkuJistota) {
      return { ok: false, msg: 'nevypadá jako fotka pozemku' + (prvniCesky ? ' — spíš jako ' + prvniCesky : ' (není na ní vidět krajina ani porost)'), detail: detail };
    }
    if (detail.proti >= PRAHY.upozornit && detail.venku < 3) {
      return { ok: true, varovani: 'Jedna fotka možná nezachycuje pozemek' + (prvniCesky ? ' (vypadá jako ' + prvniCesky + ')' : '') + ' — zkontrolujte ji prosím.', detail: detail };
    }
    return { ok: true, detail: detail };
  }

  /* --- část pro prohlížeč: načtení modelu a klasifikace obrázku ---
     Model se stahuje až u první fotky (5 MB) a pak ho drží prohlížeč
     v paměti. Když se načíst nepovede, kontrola se přeskočí. */
  var _model = null, _stav = 'idle', _slib = null;

  function nactiSkript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { rej(new Error('skript')); };
      document.head.appendChild(s);
    });
  }

  function pripravModel(zdrojTf) {
    if (_stav === 'ready') return Promise.resolve(_model);
    if (_stav === 'failed') return Promise.resolve(null);
    if (_slib) return _slib;
    _stav = 'loading';
    _slib = Promise.resolve()
      .then(function () { return window.tf ? null : nactiSkript(zdrojTf || 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'); })
      .then(function () { return window.tf.loadLayersModel('assets/mobilenet/model.json'); })
      .then(function (m) { _model = m; _stav = 'ready'; return m; })
      .catch(function () { _stav = 'failed'; return null; });
    return _slib;
  }

  /* Klasifikace z více výřezů. Jeden pohled na zmenšený celek se dá snadno
     zmást — model pak hlásí „oil filter" tam, kde je balíček slaniny. Proto
     se fotka projde třikrát (celek, střed, spodní třetina, kde u pozemku
     bývá povrch) a pravděpodobnosti se zprůměrují. Stojí to tři průchody
     modelem, tedy zlomek vteřiny. */
  function klasifikuj(imgEl, tridy, kolik) {
    return pripravModel().then(function (m) {
      if (!m || !window.tf) return [];
      try {
        var tf = window.tf;
        return tf.tidy(function () {
          var puvodni = tf.browser.fromPixels(imgEl).toFloat();
          var v = puvodni.shape[0], s = puvodni.shape[1];
          var vyrezy = [puvodni];
          var strana = Math.min(v, s);
          if (strana > 40) {
            vyrezy.push(tf.slice(puvodni, [Math.round((v - strana) / 2), Math.round((s - strana) / 2), 0], [strana, strana, 3]));
            var tretina = Math.round(v / 3);
            if (tretina > 20) vyrezy.push(tf.slice(puvodni, [v - tretina, 0, 0], [tretina, s, 3]));
          }
          var vstup = tf.concat(vyrezy.map(function (t) {
            return tf.image.resizeBilinear(t, [224, 224]).div(127.5).sub(1).expandDims(0);
          }), 0);
          var out = m.predict(vstup);
          if (Array.isArray(out)) out = out[0];
          var prumer = out.mean(0).dataSync();
          var poradi = [];
          for (var i = 0; i < prumer.length; i++) poradi.push(i);
          poradi.sort(function (a, b) { return prumer[b] - prumer[a]; });
          return poradi.slice(0, kolik || 6).map(function (i) {
            return { index: i, trida: (tridy && tridy[i]) || String(i), jistota: prumer[i] * 100 };
          });
        });
      } catch (e) { return []; }
    });
  }

  // Celý posudek jedné fotky: klasifikace + rozhodnutí.
  function posud(imgEl, tridy, skupiny) {
    return klasifikuj(imgEl, tridy, 6).then(function (p) { return vyhodnot(p, skupiny); });
  }

  return {
    vyhodnot: vyhodnot,
    klasifikuj: klasifikuj,
    posud: posud,
    pripravModel: pripravModel,
    PRAHY: PRAHY,
    cesky: cesky
  };
});
