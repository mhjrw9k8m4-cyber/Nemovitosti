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

  // Názvy tříd musí přesně odpovídat tomu, co model vrací (ImageNet, 1000 tříd).
  var OBRAZOVKA = [
    'web site, website, internet site, site', 'screen, CRT screen', 'monitor',
    'laptop, laptop computer', 'notebook, notebook computer', 'desktop computer',
    'television, television system', 'cellular telephone, cellular phone, cellphone, cell, mobile phone',
    'hand-held computer, hand-held microcomputer', 'envelope', 'menu',
    'comic book', 'crossword puzzle, crossword', 'book jacket, dust cover, dust jacket, dust wrapper',
    'binder, ring-binder'
  ];

  var JIDLO_A_OBALY = [
    'packet', 'plastic bag', 'carton', 'refrigerator, icebox', 'rotisserie',
    'grocery store, grocery, food market, market', 'butcher shop, meat market',
    'shopping basket', 'shopping cart', 'plate', 'plate rack', 'soup bowl', 'mixing bowl',
    'measuring cup', 'cup', 'espresso', 'espresso maker', 'beer bottle', 'wine bottle',
    'pop bottle, soda bottle', 'water bottle', 'pill bottle', 'bottlecap', 'corkscrew, bottle screw',
    'pizza, pizza pie', 'cheeseburger', 'hotdog, hot dog, red hot', 'meat loaf, meatloaf',
    'bagel, beigel', 'pretzel', 'ice cream, icecream', 'guacamole', 'French loaf', 'trifle',
    'chocolate sauce, chocolate syrup', 'dough', 'burrito', 'carbonara', 'potpie', 'mashed potato'
  ];

  var LIDE = [
    'military uniform', 'suit, suit of clothes', 'bow tie, bow-tie, bowtie',
    'academic gown, academic robe, judge\'s robe', 'Windsor tie', 'mortarboard',
    'jersey, T-shirt, tee shirt', 'sunglasses, dark glasses, shades', 'sunglass',
    'ballplayer, baseball player', 'scuba diver', 'groom, bridegroom',
    'bikini, two-piece', 'maillot', 'brassiere, bra, bandeau', 'diaper, nappy, napkin',
    'cowboy hat, ten-gallon hat', 'bathing cap, swimming cap', 'wig', 'lab coat, laboratory coat'
  ];

  var INTERIER = [
    'washbasin, handbasin, washbowl, lavabo, wash-hand basin', 'toilet seat', 'bathtub, bathing tub, bath, tub',
    'dining table, board', 'desk', 'wardrobe, closet, press', 'microwave, microwave oven',
    'dishwasher, dish washer, dishwashing machine', 'stove', 'studio couch, day bed',
    'four-poster', 'rocking chair, rocker', 'lampshade, lamp shade', 'table lamp',
    'home theater, home theatre', 'window shade', 'shoji', 'radiator', 'bookcase',
    'chiffonier, commode', 'file, file cabinet, filing cabinet', 'medicine chest, medicine cabinet',
    'quilt, comforter, comfort, puff', 'pillow', 'bath towel', 'paper towel', 'soap dispenser'
  ];

  // Co naopak k pozemku sedí — krajina, zemědělství, ploty, technika, rostliny.
  var VENKU = [
    'lakeside, lakeshore', 'valley, vale', 'alp', 'cliff, drop, drop-off', 'seashore, coast, seacoast, sea-coast',
    'sandbar, sand bar', 'promontory, headland, head, foreland', 'volcano', 'geyser',
    'hay', 'barn', 'greenhouse, nursery, glasshouse', 'boathouse', 'church, church building',
    'castle', 'monastery', 'mobile home, manufactured home', 'picket fence, paling',
    'worm fence, snake fence, snake-rail fence, Virginia fence', 'chainlink fence', 'stone wall',
    'tractor', 'plow, plough', 'lawn mower, mower', 'barrow, garden cart, lawn cart, wheelbarrow',
    'park bench', 'maze, labyrinth', 'birdhouse', 'mountain tent', 'beacon, lighthouse, beacon light, pharos',
    'daisy', 'yellow lady\'s slipper, yellow lady-slipper, Cypripedium calceolus, Cypripedium parviflorum',
    'corn', 'ear, spike, capitulum', 'rapeseed', 'buckeye, horse chestnut, conker', 'acorn',
    'hip, rose hip, rosehip', 'agaric', 'bolete', 'coral fungus', 'stinkhorn, carrion fungus',
    'earthstar', 'hen-of-the-woods, hen of the woods, Polyporus frondosus, Grifola frondosa',
    'pot, flowerpot', 'sundial', 'swing'
  ];

  // Pro hlášku uživateli — ať se nedozví „packet", ale co to znamená.
  var CESKY = {
    'packet': 'zabalené zboží', 'plastic bag': 'igelitová taška', 'carton': 'krabice',
    'refrigerator, icebox': 'lednice', 'rotisserie': 'gril', 'plate': 'talíř',
    'grocery store, grocery, food market, market': 'obchod', 'butcher shop, meat market': 'řeznictví',
    'web site, website, internet site, site': 'webová stránka', 'envelope': 'dokument nebo obálka',
    'screen, CRT screen': 'obrazovka', 'monitor': 'monitor', 'menu': 'jídelní lístek',
    'military uniform': 'člověk v uniformě', 'suit, suit of clothes': 'člověk v obleku',
    'jersey, T-shirt, tee shirt': 'oblečení', 'ballplayer, baseball player': 'sportovec',
    'desk': 'psací stůl', 'dining table, board': 'jídelní stůl', 'toilet seat': 'záchod',
    'bathtub, bathing tub, bath, tub': 'vana', 'cup': 'hrnek', 'pizza, pizza pie': 'pizza',
    'cheeseburger': 'hamburger', 'laptop, laptop computer': 'notebook'
  };

  function vSkupine(skupina, trida) { return skupina.indexOf(trida) !== -1; }
  function soucet(predikce, skupina) {
    var s = 0;
    for (var i = 0; i < predikce.length; i++) {
      if (vSkupine(skupina, predikce[i].trida)) s += (predikce[i].jistota || 0);
    }
    return s;   // v procentech
  }

  /* Vstup: [{trida, jistota}] seřazené od nejjistější (stačí prvních 5–6).
     Výstup jako u ostatních kontrol: {ok} / {ok, varovani} / {ok:false, msg}. */
  function vyhodnot(predikce) {
    if (!predikce || !predikce.length) return { ok: true };            // model mlčí → propustíme

    var obrazovka = soucet(predikce, OBRAZOVKA);
    var spatne = soucet(predikce, JIDLO_A_OBALY) + soucet(predikce, LIDE) +
                 soucet(predikce, INTERIER) + obrazovka;
    var venku = soucet(predikce, VENKU);
    var prvni = predikce[0];
    var cesky = CESKY[prvni.trida] || null;

    if (obrazovka >= 25 && venku < 5) {
      return { ok: false, msg: 'vypadá jako snímek obrazovky nebo dokument, ne jako fotka pozemku' };
    }
    if (spatne >= 35 && venku < 5) {
      return { ok: false, msg: 'nevypadá jako fotka pozemku' + (cesky ? ' — spíš jako ' + cesky : '') };
    }
    if (spatne >= 15 && venku < 3) {
      return { ok: true, varovani: 'Jedna fotka možná nezachycuje pozemek' + (cesky ? ' (vypadá jako ' + cesky + ')' : '') + ' — zkontrolujte ji prosím.' };
    }
    return { ok: true };
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

  // Vrátí prvních `kolik` tříd s jistotou v procentech (nebo [] při potížích).
  function klasifikuj(imgEl, tridy, kolik) {
    return pripravModel().then(function (m) {
      if (!m || !window.tf) return [];
      try {
        var tf = window.tf;
        return tf.tidy(function () {
          var t = tf.browser.fromPixels(imgEl).toFloat();
          t = tf.image.resizeBilinear(t, [224, 224]).div(127.5).sub(1).expandDims(0);
          var out = m.predict(t);
          if (Array.isArray(out)) out = out[0];
          var p = out.dataSync();
          var poradi = [];
          for (var i = 0; i < p.length; i++) poradi.push(i);
          poradi.sort(function (a, b) { return p[b] - p[a]; });
          return poradi.slice(0, kolik || 6).map(function (i) {
            return { trida: (tridy && tridy[i]) || String(i), jistota: p[i] * 100 };
          });
        });
      } catch (e) { return []; }
    });
  }

  return {
    vyhodnot: vyhodnot,
    klasifikuj: klasifikuj,
    pripravModel: pripravModel,
    _skupiny: { OBRAZOVKA: OBRAZOVKA, JIDLO_A_OBALY: JIDLO_A_OBALY, LIDE: LIDE, INTERIER: INTERIER, VENKU: VENKU }
  };
});
