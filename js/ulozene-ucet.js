/* Uložené pozemky na účtu — ne jen v tomhle prohlížeči.
 * ====================================================================
 * PROČ. Poznámky k pozemkům i uložená hledání chodí na účet už dávno.
 * To nejčastější — „tenhle si schovám" — zůstávalo jen v localStorage:
 * kdo si v autobuse uložil dvacet pozemků na telefonu, doma na počítači
 * neviděl ani jeden. Databázovou stranu má supabase/ulozene-na-uctu.sql.
 *
 * ZÁPIS JDE VŽDYCKY NEJDŘÍV DO PROHLÍŽEČE. Uložení musí být okamžité
 * a nesmí se ztratit bez signálu; na účet se to posílá až potom a bez
 * čekání. Nepřihlášenému se nemění nic.
 *
 * A TEĎ TA TĚŽKÁ ČÁST: MAZÁNÍ. „Mám to tady a na účtu to není" jsou
 * DVĚ různé situace a splést je znamená, že smazání nikdy nedrží —
 * přesně na tom pohořely poznámky, než se to spravilo (viz js/poznamky.js):
 *   · klíč UŽ BYL NAHRANÝ a na účtu není  ⇒ smazáno na jiném zařízení,
 *     smaž ho i tady;
 *   · klíč nahraný NIKDY nebyl (uložený před přihlášením nebo bez
 *     signálu)                             ⇒ nahraj ho.
 * Proto se vedle seznamu drží druhá mapa „co už je na účtu".
 * ==================================================================== */
(function (root) {
  'use strict';

  var KLIC = 'pk_fav_v1';          // seznam klíčů (tentýž, jaký čte js/main.js)
  var NAHRANO = 'pk_fav_nahrano_v1'; // { klíč: 1 } — co účet určitě zná

  function cti(k, zaloha) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? zaloha : v; }
    catch (e) { return zaloha; }
  }
  function zapis(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* Odpovídá js/auth.js (PKAuth.prihlasen), ne tenhle modul: co znamená
     „přihlášený", je jedno pravidlo pro celý web. Tři slova obalu tu
     zůstávají, protože modul musí přežít i stránku bez auth.js. */
  function prihlasen() { return !!(root.PKAuth && root.PKAuth.prihlasen && root.PKAuth.prihlasen()); }
  function rpc(fn, args) {
    if (!prihlasen()) return Promise.resolve(null);
    try { return root.PKAuth.rpc(fn, args || {}).catch(function () { return null; }); }
    catch (e) { return Promise.resolve(null); }
  }

  /** Jeden klíč přibyl (pridano = true) nebo ubyl. Volá se AŽ PO zápisu
   *  do prohlížeče, takže na výsledku téhle funkce nic nestojí. */
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
      /* Značka se maže i při neúspěchu: kdyby zůstala, příští sync by
         ten klíč považoval za „účet ho zná a teď tam není" a smazal by
         ho i z prohlížeče — tedy přesně to, co člověk nechtěl. */
      delete nahrano[klic];
      zapis(NAHRANO, nahrano);
      return ok;
    });
  }

  /** Sloučení při přihlášení (a při otevření stránky s účtem).
   *  Vrací počet změn v seznamu, nebo null, když se nestahovalo. */
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
        if (nahrano[k]) return;            // smazáno na jiném zařízení
        vysledek.push(k); nahrat.push(k);  // účet ho nikdy neviděl
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
        /* ZNAČKA JEN PŘI ÚSPĚCHU. Kdyby se nahrání nepovedlo (bez
           signálu) a značka se dala přesto, příští sync by ty klíče
           přečetl jako „účet je zná a teď tam nejsou" a SMAZAL by je
           i z prohlížeče. Radši se nahrání zkusí znovu příště. */
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
