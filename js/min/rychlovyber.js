(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.PKRychly = tovarna();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VPRAVO = 'vpravo', VLEVO = 'vlevo';

  var DAVKA = 20;

  function balicek(viditelne, pomer) {
    pomer = pomer || {};
    var jeSkryty = pomer.jeSkryty || function () { return false; };
    var jeUlozeny = pomer.jeUlozeny || function () { return false; };
    var davka = pomer.davka === 0 ? 0 : (pomer.davka || DAVKA);
    var out = [];
    for (var i = 0; i < (viditelne || []).length; i++) {
      var d = viditelne[i];
      if (!d) continue;
      if (jeSkryty(d) || jeUlozeny(d)) continue;
      out.push(d);
      if (davka && out.length >= davka) break;
    }
    return out;
  }

  function nerozhodnutych(viditelne, pomer) {
    return balicek(viditelne, (function () {
      var k = {}, n;
      for (n in (pomer || {})) if (Object.prototype.hasOwnProperty.call(pomer, n)) k[n] = pomer[n];
      k.davka = 0;
      return k;
    }())).length;
  }

  function stav(karty, celkem) {
    var k = karty || [];
    return { karty: k, i: 0, historie: [],
      celkem: typeof celkem === 'number' ? celkem : k.length };
  }

  function poradi(s) { return s ? Math.min(s.i + 1, s.karty.length) : 0; }

  function delkaDavky(s) { return s ? s.karty.length : 0; }

  function zbyvaPoDavce(s) {
    if (!s) return 0;
    return Math.max(0, (s.celkem || 0) - s.karty.length);
  }

  function aktualni(s) { return (s && s.karty && s.i < s.karty.length) ? s.karty[s.i] : null; }
  function zbyva(s) { return s ? Math.max(0, s.karty.length - s.i) : 0; }
  function hotovo(s) { return zbyva(s) === 0; }

  function rozhodni(s, smer) {
    var d = aktualni(s);
    if (!d) return null;
    if (smer !== VPRAVO && smer !== VLEVO) return null;
    s.historie.push({ smer: smer, pozemek: d, index: s.i });
    s.i++;
    return { akce: smer === VPRAVO ? 'uloz' : 'skryj', pozemek: d };
  }

  function zpet(s) {
    if (!s || !s.historie.length) return null;
    var p = s.historie.pop();
    s.i = p.index;
    return { akce: p.smer === VPRAVO ? 'zrus-uloz' : 'zrus-skryj', pozemek: p.pozemek };
  }

  function lzeZpet(s) { return !!(s && s.historie && s.historie.length); }

  function souhrn(s) {
    var u = 0, sk = 0;
    for (var i = 0; i < ((s && s.historie) || []).length; i++) {
      if (s.historie[i].smer === VPRAVO) u++; else sk++;
    }
    return { ulozeno: u, skryto: sk, celkem: u + sk };
  }

  return { VPRAVO: VPRAVO, VLEVO: VLEVO, DAVKA: DAVKA,
    balicek: balicek, nerozhodnutych: nerozhodnutych, stav: stav,
    aktualni: aktualni, zbyva: zbyva, hotovo: hotovo,
    poradi: poradi, delkaDavky: delkaDavky, zbyvaPoDavce: zbyvaPoDavce,
    rozhodni: rozhodni, zpet: zpet, lzeZpet: lzeZpet, souhrn: souhrn };
});
