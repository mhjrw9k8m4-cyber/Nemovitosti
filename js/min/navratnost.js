(function (root) {
  'use strict';

  var LET_OSVOBOZENI = 10;
  var SAZBA_DANE = 15;

  var VKLAD = 2000;

  function kladne(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[\s ]/g, '').replace(',', '.'));
    return (isFinite(n) && n > 0) ? n : 0;
  }

  function spocti(z) {
    z = z || {};
    var kupni = kladne(z.kupni);
    var prodejni = kladne(z.prodejni);
    if (!kupni || !prodejni) return null;

    var naklady = kladne(z.naklady);
    var let_ = kladne(z.let);
    var sazba = (z.sazba === 0) ? 0 : kladne(z.sazba) || SAZBA_DANE;
    var lhuta = (z.lhuta === 0) ? 0 : kladne(z.lhuta) || LET_OSVOBOZENI;

    var vlozeno = kupni + naklady;

    var vydelek = prodejni - vlozeno;
    var osvobozeno = let_ >= lhuta;

    var dan = (osvobozeno || vydelek <= 0) ? 0 : vydelek * sazba / 100;
    var cisty = vydelek - dan;

    var zhodnoceni = cisty / vlozeno * 100;

    var rocne = null;
    if (let_ >= 1 && vlozeno > 0 && (vlozeno + cisty) > 0) {
      rocne = (Math.pow((vlozeno + cisty) / vlozeno, 1 / let_) - 1) * 100;
    }

    return {
      vlozeno: vlozeno, vydelek: vydelek, dan: dan, cisty: cisty,
      zhodnoceni: zhodnoceni, rocne: rocne,
      osvobozeno: osvobozeno, prodelek: cisty < 0,
      sazba: sazba, lhuta: lhuta
    };
  }

  root.PKNavratnost = {
    spocti: spocti,
    VKLAD: VKLAD, LET_OSVOBOZENI: LET_OSVOBOZENI, SAZBA_DANE: SAZBA_DANE
  };
}(typeof window !== 'undefined' ? window : globalThis));
