(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKDruh = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function srovnej(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ');
  }

  var OKOLI = /(?:\bu|\bku|vedle|poblize?|poblizu|nedaleko|blizko|okraji|okraje|na kraji|smerem k|smerem na|vyhledem na|vyhled na|pohled na|obklopen\w*|lemovan\w*|sousedi s|sousedici s|prilehl\w*|navazuje na|kousek od|cestou k|cestou do|prijezd k)\s+$/;

  var ZAPOR = /\b(?:bez|neni|nejsou|nelze|nesmi|nedovoluje|zakaz\w*|mimo|nevhodn\w*|krome)\s+$/;

  var PRAVIDLA = [
    { druh: 'stavební pozemek',
      re: /\bstavebni\w*\b|\bk vystavbe\b|\bpro vystavbu\b|\bzasitovan\w*\b|\burcen\w* k stavbe\b/g,

      poMimo: /^\s+(?:uzaver\w*|zakaz\w*|pozemk\w* v okoli)\b/ },
    { druh: 'lesní pozemek', re: /\blesni\w*\b|\bles\b|\blesa\b|\blesy\b|\blesu\b|\blesem\b|\bzalesnen\w*\b/g },
    { druh: 'vinice', re: /\bvinic\w*\b/g },
    { druh: 'ovocný sad', re: /\bovocn\w* sad\w*\b|\bsad\b|\bsadu\b|\bsady\b|\bsadem\b/g },

    { druh: 'zahrada', re: /\bzahrad[ayeu]\b|\bzahradou\b|\bzahradami\b|\bzahradni parcel\w*\b|\bzahradkarsk\w* (?:osad|kolon)\w*\b/g },

    { druh: 'orná půda', re: /\born[aáyeou]\w*\b|\bk prodeji pol[eií]\b|\bprodej pol[eií]\b|\bprodam pol[eií]\b|\bjedna se o pol[eií]\b|\btyp pol[eií]\b|\bke koupi (?:podilu )?(?:\d+\/\d+ )?pol[eií]\b/g },
    { druh: 'trvalý travní porost', re: /\btrval\w* travn\w*\b|\btravn\w* porost\w*\b/g },
    { druh: 'louka', re: /\blouk[aiyou]\b|\bloukou\b|\bloukam\w*\b/g },
    { druh: 'pastvina', re: /\bpastvin\w*\b/g },
    { druh: 'ostatní plocha', re: /\bostatni ploch\w*\b/g },
    { druh: 'zemědělský pozemek', re: /\bzemedelsk\w*\b/g },
  ];

  var KATASTR = ['zastavěná plocha a nádvoří', 'trvalý travní porost', 'ostatní plocha',
    'lesní pozemek', 'vodní plocha', 'ovocný sad', 'orná půda', 'zahrada', 'vinice', 'chmelnice'];
  var KATASTR_SROV = {};
  for (var _i = 0; _i < KATASTR.length; _i++) KATASTR_SROV[srovnej(KATASTR[_i])] = KATASTR[_i];

  function katastrovyDruh(s) {
    var k = srovnej(s).replace(/[.,;:–-]+$/, '').trim();
    return Object.prototype.hasOwnProperty.call(KATASTR_SROV, k) ? KATASTR_SROV[k] : null;
  }

  var PAR_S_PLOCHOU = /o\s+vymere\s+([\d\s.,]+)\s*m(?:²|2)\s*\(([^)]{3,48})\)/g;
  var PAR = /\(([^)]{3,48})\)/g;
  var VETA = /(?:ved\w*\s+v\s+katastru(?:\s+nemovitosti)?(?:\s+jako)?|v\s+katastru(?:\s+nemovitosti)?\s+ved\w*(?:\s+jako)?|druh\s+pozemku)\s*:?\s*([^.;\n(]{3,48})/;

  function zKatastru(t) {
    var m, druh;

    var soucty = {}, poradi = [];
    PAR_S_PLOCHOU.lastIndex = 0;
    while ((m = PAR_S_PLOCHOU.exec(t)) !== null) {
      druh = katastrovyDruh(m[2]);
      if (!druh) continue;
      var plocha = parseFloat(String(m[1]).replace(/[\s.]/g, '').replace(',', '.'));
      if (!(plocha > 0)) continue;
      if (!Object.prototype.hasOwnProperty.call(soucty, druh)) { soucty[druh] = 0; poradi.push(druh); }
      soucty[druh] += plocha;
    }
    if (poradi.length) {
      var nej = poradi[0];
      for (var i = 1; i < poradi.length; i++) if (soucty[poradi[i]] > soucty[nej]) nej = poradi[i];
      return nej;
    }

    var vzavorkach = [];
    PAR.lastIndex = 0;
    while ((m = PAR.exec(t)) !== null) {
      druh = katastrovyDruh(m[1]);
      if (druh && vzavorkach.indexOf(druh) === -1) vzavorkach.push(druh);
    }
    if (vzavorkach.length === 1) return vzavorkach[0];
    if (vzavorkach.length > 1) return null;

    m = VETA.exec(t);
    if (m) { druh = katastrovyDruh(m[1]); if (druh) return druh; }
    return null;
  }

  function platny(text, zac, kon, pravidlo) {
    var pred = text.slice(Math.max(0, zac - 40), zac);
    if (ZAPOR.test(pred)) return false;
    if (OKOLI.test(pred)) return false;
    if (pravidlo.poMimo && pravidlo.poMimo.test(text.slice(kon, kon + 40))) return false;
    return true;
  }

  function bezJmen(t, jmena) {
    if (!jmena) return t;
    var pole = [].concat(jmena);
    for (var i = 0; i < pole.length; i++) {
      var j = srovnej(pole[i]).trim();
      if (j.length < 3) continue;
      t = t.split(j).join(' ');
    }
    return t.replace(/\s+/g, ' ');
  }

  function zTextu(text, jmenaMist) {
    var t = bezJmen(srovnej(text), jmenaMist);
    if (!t) return null;

    var zapsany = zKatastru(t);
    if (zapsany) return zapsany;
    for (var i = 0; i < PRAVIDLA.length; i++) {
      var p = PRAVIDLA[i];
      p.re.lastIndex = 0;
      var m;
      while ((m = p.re.exec(t)) !== null) {
        if (platny(t, m.index, m.index + m[0].length, p)) { p.re.lastIndex = 0; return p.druh; }
        if (m.index === p.re.lastIndex) p.re.lastIndex++;
      }
    }
    return null;
  }

  return { zTextu: zTextu, zKatastru: zKatastru, katastrovyDruh: katastrovyDruh,
    srovnej: srovnej, bezJmen: bezJmen, PRAVIDLA: PRAVIDLA, KATASTR: KATASTR };
});
