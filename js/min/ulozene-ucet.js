(function (root) {
  'use strict';

  var KLIC = 'pk_fav_v1';
  var NAHRANO = 'pk_fav_nahrano_v1';

  function cti(k, zaloha) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? zaloha : v; }
    catch (e) { return zaloha; }
  }
  function zapis(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  function prihlasen() { return !!(root.PKAuth && root.PKAuth.prihlasen && root.PKAuth.prihlasen()); }
  function rpc(fn, args) {
    if (!prihlasen()) return Promise.resolve(null);
    try { return root.PKAuth.rpc(fn, args || {}).catch(function () { return null; }); }
    catch (e) { return Promise.resolve(null); }
  }

  function zmena(klic, pridano) {
    if (!klic || !prihlasen()) return Promise.resolve(false);
    var nahrano = cti(NAHRANO, {});
    if (pridano) {
      return rpc('ulozeny_uloz', { p_klic: klic }).then(function (r) {
        var ok = !!(r && r.ok);
        if (ok) { nahrano[klic] = 1; zapis(NAHRANO, nahrano); }
        return ok;
      });
    }
    return rpc('ulozeny_smaz', { p_klic: klic }).then(function (r) {
      var ok = !!(r && r.ok);

      delete nahrano[klic];
      zapis(NAHRANO, nahrano);
      return ok;
    });
  }

  function sync() {
    if (!prihlasen()) return Promise.resolve(null);
    return rpc('moje_ulozene', {}).then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.data)) return null;
      var naUctu = {};
      r.data.forEach(function (x) { if (x && x.klic) naUctu[x.klic] = 1; });
      var mistni = cti(KLIC, []);
      if (!Array.isArray(mistni)) mistni = [];
      var nahrano = cti(NAHRANO, {});
      var vysledek = [], nahrat = [];
      var videno = {};
      mistni.forEach(function (k) {
        if (!k || videno[k]) return;
        videno[k] = 1;
        if (naUctu[k]) { vysledek.push(k); return; }
        if (nahrano[k]) return;
        vysledek.push(k); nahrat.push(k);
      });
      Object.keys(naUctu).forEach(function (k) { if (!videno[k]) { videno[k] = 1; vysledek.push(k); } });
      var zmen = 0;
      if (vysledek.length !== mistni.length) zmen = Math.abs(vysledek.length - mistni.length);
      else { for (var i = 0; i < vysledek.length; i++) if (mistni.indexOf(vysledek[i]) < 0) zmen++; }
      zapis(KLIC, vysledek);
      var novaZnacka = {};
      vysledek.forEach(function (k) { if (naUctu[k]) novaZnacka[k] = 1; });
      zapis(NAHRANO, novaZnacka);
      if (nahrat.length) {

        rpc('ulozene_nahraj', { p_klice: nahrat }).then(function (r) {
          if (!r || !r.ok) return;
          var z = cti(NAHRANO, {});
          nahrat.forEach(function (k) { z[k] = 1; });
          zapis(NAHRANO, z);
        });
      }
      return zmen;
    });
  }

  root.PKUlozeneUcet = { zmena: zmena, sync: sync, prihlasen: prihlasen, KLIC: KLIC, NAHRANO: NAHRANO };
}(typeof window !== 'undefined' ? window : globalThis));
