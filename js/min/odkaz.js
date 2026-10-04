(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.PKOdkaz = tovarna();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SDILENE = [
    { klic: 't',        stav: 'activeType',      tvar: 'text',    vychozi: 'all' },
    { klic: 'd',        stav: 'druhVybrane',     tvar: 'seznam' },
    { klic: 'co',       stav: 'minPrice',        tvar: 'cislo' },
    { klic: 'cd',       stav: 'maxPrice',        tvar: 'cislo' },
    { klic: 'po',       stav: 'minArea',         tvar: 'cislo' },
    { klic: 'pd',       stav: 'maxArea',         tvar: 'cislo' },
    { klic: 'm2',       stav: 'maxPerM2',        tvar: 'cislo' },
    { klic: 'v',        stav: 'zadaneVybaveni',  tvar: 'seznam' },
    { klic: 'celek',    stav: 'jenCelek',        tvar: 'logicka' },
    { klic: 'konci',    stav: 'urgentOnly',      tvar: 'logicka' },
    { klic: 'levne',    stav: 'levneOnly',       tvar: 'logicka' },
    { klic: 'podobne',  stav: 'ukazPodobne',     tvar: 'logicka' },

    { klic: 'kraj',     stav: 'krajFiltr',       tvar: 'text',    vychozi: 'all' },
    { klic: 'krajmapa', stav: 'selectedKraj',    tvar: 'text' },
    { klic: 'q',        stav: 'hledani',         tvar: 'text' },

    { klic: 'razeni',   stav: 'sortMode',        tvar: 'text',    vychozi: 'demand' },
    { klic: 'obec',     stav: 'mistoObec',       tvar: 'text' },
    { klic: 'okres',    stav: 'mistoOkres',      tvar: 'text' }
  ];

  var NESDILENE = [
    { stav: 'mojeMisto',    proc: 'GPS souřadnice toho, kdo odkaz posílá' },
    { stav: 'okoliAktivni', proc: 'odvozeno z mojeMisto' },
    { stav: 'kmOd',         proc: 'počítá vzdálenost od mojeMisto' },
    { stav: 'okruh',        proc: 'poloměr kolem mojeMisto' },
    { stav: 'okruhStred',   proc: 'střed okruhu je moje poloha' },
    { stav: 'favOnly',      proc: 'uložené pozemky leží v localStorage, u příjemce je prázdno' },
    { stav: 'ukazSkryte',   proc: 'skryté pozemky jsou místní volba, neukládá se ani mezi návštěvami' },
    { stav: 'ukazProsle',   proc: 'místní volba, u příjemce by nic neznamenala' },
    { stav: 'mistoFiltr',   proc: 'do adresy jde rozložené na obec a okres' },
    { stav: 'searchToks',   proc: 'odvozeno z hledaného textu (q)' },
    { stav: 'userPos',      proc: 'moje poloha — a s ní i řazení „nejblíž ke mně", které z ní vychází' },
    { stav: 'kmFromUser',   proc: 'počítá vzdálenost od mojí polohy' },
    { stav: 'dotazFiltr',   proc: 'odvozeno z hledaného textu (q)' }
  ];

  function cislo(x) { var n = Number(x); return isFinite(n) && n > 0 ? Math.round(n) : 0; }

  function polohaText(stred) {
    if (!stred || !isFinite(stred.lat) || !isFinite(stred.lng)) return '';
    var z = cislo(stred.zoom);
    return [(+stred.lat).toFixed(5), (+stred.lng).toFixed(5), z || 7].join(',');
  }
  function polohaZeStr(s) {
    var k = String(s || '').split(',');
    if (k.length < 2) return null;
    var lat = Number(k[0]), lng = Number(k[1]), z = Number(k[2]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat: lat, lng: lng, zoom: (isFinite(z) && z > 0) ? Math.round(z) : 0 };
  }

  function zapis(stav) {
    stav = stav || {};
    var kusy = [];
    var p = polohaText(stav.poloha);
    if (p) kusy.push('m=' + p);
    SDILENE.forEach(function (s) {
      var v = stav[s.stav];
      if (s.tvar === 'logicka') { if (v) kusy.push(s.klic + '=1'); return; }
      if (s.tvar === 'cislo') { var n = cislo(v); if (n) kusy.push(s.klic + '=' + n); return; }
      if (s.tvar === 'seznam') {
        var pole = (v || []).filter(function (x) { return x != null && x !== ''; });
        if (pole.length) kusy.push(s.klic + '=' + pole.map(encodeURIComponent).join(','));
        return;
      }
      var t = (v == null ? '' : String(v)).trim();
      if (t && t !== s.vychozi) kusy.push(s.klic + '=' + encodeURIComponent(t));
    });
    return kusy.join('&');
  }

  function cti(hash) {
    var s = String(hash || '').replace(/^#/, '');
    var out = {};
    if (!s) return out;
    var podleKlice = {};
    SDILENE.forEach(function (x) { podleKlice[x.klic] = x; });
    s.split('&').forEach(function (kus) {
      var i = kus.indexOf('=');
      if (i < 0) return;
      var klic = kus.slice(0, i), hod = kus.slice(i + 1);
      var dekod = function (x) { try { return decodeURIComponent(x); } catch (e) { return ''; } };
      if (klic === 'm') { var pol = polohaZeStr(dekod(hod)); if (pol) out.poloha = pol; return; }
      var def = podleKlice[klic];
      if (!def) return;
      if (def.tvar === 'logicka') { out[def.stav] = hod === '1'; return; }
      if (def.tvar === 'cislo') { var n = cislo(hod); if (n) out[def.stav] = n; return; }
      if (def.tvar === 'seznam') {
        var pole = hod.split(',').map(dekod).filter(function (x) { return x !== ''; });
        if (pole.length) out[def.stav] = pole;
        return;
      }
      var t = dekod(hod).trim();
      if (t) out[def.stav] = t;
    });
    return out;
  }

  function jeStavMapy(hash) {
    var s = String(hash || '').replace(/^#/, '');
    if (!s || s.indexOf('=') < 0) return false;
    var zname = { m: 1 };
    SDILENE.forEach(function (x) { zname[x.klic] = 1; });
    return s.split('&').some(function (kus) { return zname[kus.split('=')[0]] === 1; });
  }

  return { zapis: zapis, cti: cti, jeStavMapy: jeStavMapy,
    SDILENE: SDILENE, NESDILENE: NESDILENE };
});
