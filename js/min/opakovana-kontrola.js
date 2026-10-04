(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PKOpakovana = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var POKUSY = 3;
  var PAUZY = [0, 2000, 6000];

  function jeTrvalaChyba(stav) { return stav === 404 || stav === 410; }

  function domena(url) {
    try {
      var h = new URL(url).hostname.toLowerCase();
      return h.replace(/^www\./, '');
    } catch (e) { return ''; }
  }

  function vyhodnotOdkaz(puvodniUrl, pokusy) {
    if (!pokusy || !pokusy.length) return { stav: 'nedostupny', msg: 'odkaz se nepodařilo ověřit', pokusu: 0 };

    var uspesny = null, trvala = null;
    for (var i = 0; i < pokusy.length; i++) {
      var p = pokusy[i];
      if (!p.chyba && p.stav >= 200 && p.stav < 400) { uspesny = p; break; }
      if (jeTrvalaChyba(p.stav)) trvala = p;
    }

    if (uspesny) {
      var kam = domena(uspesny.url || puvodniUrl), odkud = domena(puvodniUrl);

      if (kam && odkud && kam !== odkud && kam.indexOf(odkud) === -1 && odkud.indexOf(kam) === -1) {
        return {
          stav: 'presmerovan', kod: uspesny.stav, pokusu: pokusy.length,
          msg: 'odkaz vede na ' + kam + ' místo na ' + odkud
        };
      }
      return { stav: 'ok', kod: uspesny.stav, pokusu: pokusy.length, msg: '' };
    }

    var trvalych = pokusy.filter(function (p) { return jeTrvalaChyba(p.stav); }).length;
    if (trvalych >= 2 || (trvalych === 1 && pokusy.length === 1)) {
      return { stav: 'mrtvy', kod: (trvala && trvala.stav) || 404, pokusu: pokusy.length,
               msg: 'odkaz už neexistuje (' + ((trvala && trvala.stav) || 404) + ')' };
    }
    var posledni = pokusy[pokusy.length - 1];
    return {
      stav: 'nedostupny', kod: posledni.stav || 0, pokusu: pokusy.length,
      msg: 'odkaz se ' + pokusy.length + 'krát po sobě nepodařilo otevřít' +
           (posledni.chyba ? ' (' + posledni.chyba + ')' : ' (' + posledni.stav + ')')
    };
  }

  function vyhodnotFotku(url, pokusy) {
    var zaklad = vyhodnotOdkaz(url, pokusy);
    if (zaklad.stav !== 'ok') {
      if (zaklad.stav === 'mrtvy') return { stav: 'chybi', pokusu: zaklad.pokusu, msg: 'fotka už v úložišti není' };
      return { stav: zaklad.stav, pokusu: zaklad.pokusu, msg: zaklad.msg.replace('odkaz', 'fotku') };
    }
    var uspesny = null;
    for (var i = 0; i < pokusy.length; i++) {
      if (!pokusy[i].chyba && pokusy[i].stav >= 200 && pokusy[i].stav < 400) { uspesny = pokusy[i]; break; }
    }
    var typ = (uspesny && uspesny.typ) || '';
    if (typ && !/^image\//i.test(typ)) {
      return { stav: 'nenifotka', pokusu: pokusy.length, msg: 'na adrese fotky je ' + typ + ', ne obrázek' };
    }
    return { stav: 'ok', pokusu: pokusy.length, msg: '' };
  }

  function otisk(jasy) {
    if (!jasy || jasy.length < 72) return null;
    var bity = '';
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        bity += (jasy[y * 9 + x] > jasy[y * 9 + x + 1]) ? '1' : '0';
      }
    }

    var hex = '';
    for (var i = 0; i < 64; i += 4) hex += parseInt(bity.slice(i, i + 4), 2).toString(16);
    return hex;
  }

  function vzdalenostOtisku(a, b) {
    if (!a || !b || a.length !== b.length) return null;
    var rozdil = 0;
    for (var i = 0; i < a.length; i++) {
      var x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (x) { rozdil += x & 1; x >>= 1; }
    }
    return rozdil;
  }

  function jeStejnaFotka(a, b) {
    var d = vzdalenostOtisku(a, b);
    return d != null && d <= 5;
  }

  return {
    POKUSY: POKUSY, PAUZY: PAUZY,
    vyhodnotOdkaz: vyhodnotOdkaz, vyhodnotFotku: vyhodnotFotku,
    otisk: otisk, vzdalenostOtisku: vzdalenostOtisku, jeStejnaFotka: jeStejnaFotka,
    domena: domena
  };
});
