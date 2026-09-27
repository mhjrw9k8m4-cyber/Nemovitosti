/* =====================================================================
   Parcelka — JEDNA BRANKA PRO VŠECHNA DATA O POZEMCÍCH.

   Na web se sbíhají tři zdroje: robot (dražební rejstříky a inzertní weby),
   schválené inzeráty v repozitáři a živé inzeráty od majitelů. Ani u jednoho
   nerozhodujeme o obsahu textů. Vypisují se přes innerHTML a adresa odkazu
   jde rovnou do href, takže „<img onerror=…>" by se spustilo každému
   návštěvníkovi a „javascript:…" po klepnutí na odkaz.

   PROČ VLASTNÍ SOUBOR: tahle branka vznikla uvnitř js/main.js, tedy jen pro
   mapu na úvodní stránce. Tatáž data ale čtou ještě stránka pozemku
   (js/pozemek.js), hlídání a Můj inzerát — a ty branku neměly. Spoléhaly na
   to, že si každé jednotlivé místo, kde se text vypisuje, zavolá esc().
   U textů to vycházelo, u ODKAZŮ ne: na stránce pozemku se adresa inzerátu
   escapovala (takže atribut nešlo rozbít), ale „javascript:" v ní zůstalo —
   změřeno v prohlížeči, na podstrčených datech tam vznikl odkaz, který
   po klepnutí spustí cizí kód. Proto je to teď jeden soubor pro všechny.

   Co se dělá s čím:
     – text:   ven letí „<", „>" a uvozovka, sloučí se mezery, zkrátí se délka.
               Nic se nenahrazuje entitami — tohle NENÍ escapování pro HTML
               (to dělá esc() na místě výpisu), tohle je zahození znaků, které
               v datech o pozemku nemají co dělat.
       – odkaz: povolí se jen http(s). Cokoli jiného (javascript:, data:,
               vbscript:) se zahodí celé, protože rozumný odkaz na inzerát
               takový nikdy není.
     – typ:    neznámý druh by shodil vykreslení, tak padá na „sale".
   ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PKCisteni = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DRUHY = { sale: 1, drazba: 1, exekuce: 1, obec: 1, majitel: 1 };

  function text(v, max) {
    return String(v == null ? '' : v).replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 120);
  }

  function odkaz(v) {
    var u = String(v == null ? '' : v).trim();
    if (!/^https?:\/\//i.test(u)) return '';        // jen http(s), nic jiného
    if (/["'<>\s]/.test(u)) return '';               // uvozovka by rozbila href
    return u.slice(0, 500);
  }

  /* Délky nejsou od oka: sedí na to, co do těch polí patří, a hlavně na
     meze, které si hlídá i server u inzerátů od majitelů
     (supabase/listings-prvni-kontrola.sql). Kdo pošle víc, přijde o konec
     textu — ne o celý inzerát. */
  var POLE = {
    place: 80, okres: 60, parcel: 40, druh: 60, extra: 160,
    contact: 80, description: 600, access: 40,
    // cast = čtvrť z Nominatimu, zlomek = velikost podílu z vyhlášky.
    // Obojí je text odjinud, i když se do dat dostane naší cestou.
    cast: 80, zlomek: 40
  };

  // Mění pozemek NA MÍSTĚ a vrací ho — ať se nekopírují pole, o kterých
  // tady nevíme (fotky, vybavení, _id doplněné později).
  function pozemek(d) {
    if (!d || typeof d !== 'object') return null;
    if (!DRUHY[d.type]) d.type = 'sale';
    for (var k in POLE) if (Object.prototype.hasOwnProperty.call(POLE, k)) {
      if (d[k] != null || k === 'place') d[k] = text(d[k], POLE[k]);
    }
    if (!d.place) d.place = 'Neuvedeno';
    d.url = odkaz(d.url);
    return d;
  }

  function pozemky(arr) {
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var d = pozemek(arr[i]);
      if (d) out.push(d);
    }
    return out;
  }

  return { text: text, odkaz: odkaz, pozemek: pozemek, pozemky: pozemky, DRUHY: DRUHY };
});
