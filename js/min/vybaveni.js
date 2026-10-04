(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKVybaveni = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function srovnej(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ');
  }
  var bezDiakritiky = srovnej;

  var SITE = [
    { klic: 'elektrina', nazev: 'Elektřina',
      re: /elektrin\w*|elektrick\w+ (?:pripojk|energi)\w*|\bel\.\s*(?:energi|pripojk)\w*|\belektro\b|\belektro(?:pripojk|mer)\w*/g },
    { klic: 'voda', nazev: 'Voda',
      re: /vodovod\w*|\bvod[aoyeu]\b|studn[ayei]\w*|\bvrt\b|pitn\w* vod\w*/g,

      mimo: /(?:odpadn|destov|spodn|podzemn|povrchov|zaplav|zatopov|velk|stojat)\w*\s+$/ },

    { klic: 'kanalizace', nazev: 'Kanalizace',
      re: /kanaliz\w*|septik\w*|cistirn\w* odpadn\w*|\bcov\b|\bjimk\w*/g },
    { klic: 'plyn', nazev: 'Plyn',
      re: /plynov\w* pripojk\w*|plynofik\w*|\bplyn\b|\bplynu\b/g },

    { klic: 'cesta', nazev: 'Příjezd',
      re: /prijezdov\w*|pristupov\w* cest\w*|zpevnen\w* cest\w*|prijezd k pozemku|asfaltov\w* cest\w*|(?:zpevnen|mistn|asfaltov|obecn|verejn|ucelov)\w*\s+komunikac\w*/g },
  ];

  var ZAPOR = /\b(?:bez|neni|nejsou|nema|nemaji|nemame|nevede|nevedou|nedosahuje|nedovoluje|neexistuj\w*|nelze|chybi|nezaveden\w*|nepriveden\w*|nepripojen\w*|zadn\w*)\b/g;
  var OKNO_PRED = 70;

  var OKNO_ZA = 48;

  function zaporny(text, od, do_) {
    var pred = text.slice(Math.max(0, od - OKNO_PRED), od);
    var za = text.slice(do_, do_ + OKNO_ZA);
    var hranice = /[.;!?]|\bale\b|\bzato\b|\bnicmene\b/g;
    var posledniHranice = -1, m;
    hranice.lastIndex = 0;
    while ((m = hranice.exec(pred)) !== null) posledniHranice = m.index + m[0].length;
    var usek = posledniHranice >= 0 ? pred.slice(posledniHranice) : pred;
    ZAPOR.lastIndex = 0;
    if (ZAPOR.test(usek)) return true;

    var zaKonec = za.split(/[.;!?,]/)[0];
    ZAPOR.lastIndex = 0;
    return ZAPOR.test(zaKonec);
  }

  var ZLOMEK = '(?:\\d+\\s*\\/\\s*\\d+|polovin\\w*|tretin\\w*|ctvrtin\\w*|petin\\w*|sestin\\w*|osmin\\w*|desetin\\w*)';
  var PODIL = new RegExp(
    'spoluvlastnick\\w*\\s+podil\\w*' +

    '|spoluvlastnick\\w*\\s+(?:vymer|cast|velikost)\\w*' +
    '|prod\\w*\\s+(?:sveho|svuj|sve)\\s+podil\\w*' +
    '|podilov\\w*\\s+spoluvlastnictv\\w*' +
    '|\\bid\\.?\\s*podil\\w*' +
    '|podil\\w*\\s*(?:o\\s*velikosti\\s*)?\\d+\\s*\\/\\s*\\d+' +
    '|\\bpodil\\w*\\s+na\\s+pozemku' +
    '|\\bpodil\\w*\\s+ve\\s+vysi' +
    '|\\bidealn\\w*\\s+' + ZLOMEK +
    '|\\bid\\.\\s*\\d+\\s*\\/\\s*\\d+', 'g');
  var NENI_PODIL = /\bne\s+podil|nikoli\w*\s+podil|nejde\s+o\s+podil|nejedna\s+se\s+o\s+podil|\bneni\s+v\s+podilov\w*|nejde\s+o\s+podilov\w*/;

  var PODIL_CESTA = /(?:podil\w*|idealn\w*)\s*(?:o\s*velikosti\s*)?(?:\d+\s*\/\s*\d+\s*)?na\s+(?:spolecn\w*\s+)?(?:pristupov\w*|prijezdov\w*)\s+(?:pozemku|ceste|cesty|komunikaci)/g;

  function mimoObor(def, text, od) {
    if (!def.mimo) return false;
    return def.mimo.test(text.slice(Math.max(0, od - 24), od));
  }

  var ZLOMEK_U_PODILU = /(?:podil\w*|spoluvlastnick\w*|idealn\w*)[^.;!?]{0,28}?(\d{1,6})\s*\/\s*(\d{1,6})/;

  function zlomekPodilu(t) {
    var m = ZLOMEK_U_PODILU.exec(t);
    if (!m) return null;
    var a = parseInt(m[1], 10), b = parseInt(m[2], 10);

    if (!(a > 0) || !(b > 0) || a >= b) return null;
    return a + '/' + b;
  }

  function najdi(text) {
    var syrovy = String(text == null ? '' : text);
    var t = srovnej(syrovy);
    if (!t) return { site: [], podil: false, znamo: false };
    var ven = [];
    for (var i = 0; i < SITE.length; i++) {
      var def = SITE[i];
      def.re.lastIndex = 0;
      var m, ma = false;
      while ((m = def.re.exec(t)) !== null) {
        if (!zaporny(t, m.index, m.index + m[0].length) && !mimoObor(def, t, m.index)) { ma = true; break; }
        if (m.index === def.re.lastIndex) def.re.lastIndex++;
      }
      if (ma) ven.push(def.klic);
    }
    PODIL.lastIndex = 0;
    PODIL_CESTA.lastIndex = 0;
    var bezCesty = t.replace(PODIL_CESTA, ' ');
    PODIL.lastIndex = 0;
    var podil = PODIL.test(bezCesty) && !NENI_PODIL.test(t);

    return { site: ven, podil: podil, zlomek: podil ? zlomekPodilu(bezCesty) : null,
      znamo: t.length >= 40 };
  }

  function nazev(klic) {
    for (var i = 0; i < SITE.length; i++) if (SITE[i].klic === klic) return SITE[i].nazev;
    return klic;
  }

  function nazvy(d) {
    var ven = [], i, n;
    var klice = (d && d.site) || [], popisky = (d && d.features) || [];
    for (i = 0; i < klice.length; i++) { n = nazev(klice[i]); if (ven.indexOf(n) < 0) ven.push(n); }
    for (i = 0; i < popisky.length; i++) if (ven.indexOf(popisky[i]) < 0) ven.push(popisky[i]);
    return ven;
  }

  function klice(popisky) {
    var ven = [], i, j;
    for (i = 0; i < (popisky || []).length; i++) {
      for (j = 0; j < SITE.length; j++) {
        if (SITE[j].nazev === popisky[i] && ven.indexOf(SITE[j].klic) < 0) ven.push(SITE[j].klic);
      }
    }
    return ven;
  }

  return { SITE: SITE, najdi: najdi, nazev: nazev, nazvy: nazvy, klice: klice,
    bezDiakritiky: bezDiakritiky };
});
