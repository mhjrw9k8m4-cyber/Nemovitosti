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
     – popis:  totéž, ale ZŮSTÁVAJÍ ŘÁDKY. Popis od majitele je jediné pole,
               které člověk píše po odstavcích, a sloučení mezer z něj dělalo
               jeden nekonečný blok textu.
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

  /* Popis od majitele je jediné pole, které člověk píše po odstavcích.
     Projít přes text() znamenalo sloučit i řádky, takže se z něj na
     stránce stal jeden blok — a on ho psal jinak. Mezery a tabulátory se
     slučují dál (na jeden blok textu se jinak dá „nakreslit" cokoli),
     jen se zachovají řádky a nejvýš jedna prázdná mezi odstavci. */
  function viceradkovy(v, max) {
    return String(v == null ? '' : v)
      .replace(/[<>"]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim().slice(0, max || 2000);
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
    /* Popis smí mít 2 000 znaků — tolik povoluje formulář (MEZE.popisMax
       v js/kontrola.js) i server. Stálo tu 600, takže majiteli, který
       napsal delší text, se posledních 1 400 znaků nikde neukázalo.
       Nebyla to ochrana, byl to tichý střih. */
    contact: 80, description: 2000, access: 40,
    // cast = čtvrť z Nominatimu, zlomek = velikost podílu z vyhlášky.
    // Obojí je text odjinud, i když se do dat dostane naší cestou.
    cast: 80, zlomek: 40
  };

  /* CO NENÍ TEXT, TO SE TAKY MUSÍ ČISTIT. Branka dosud propouštěla
     všechno kromě textů beze změny. Přitom na stránku pozemku se data
     dostávají i přes sessionStorage (mapa tam pozemek předá, aby se
     stránka ukázala okamžitě) — a tam mezitím může sáhnout kdokoli, kdo
     na tomhle webu umí spustit skript. U fotek je to nejvíc vidět: jejich
     adresa se vypisuje rovnou do atributu src, takže cizí hodnota není
     jen nesmysl na stránce, ale rovnou cesta, jak z atributu utéct.
     Schválně se tu NEOPISUJE seznam povoleného vybavení. Ten je jeden
     (formulář v pridat.html, OK_FEAT v js/main.js a create_listing na
     serveru, shodu hlídá scripts/test-meze.mjs) a čtvrtá kopie by se
     s ním jen rozešla. Branka hlídá TVAR, ne sortiment. */
  var FOTKA = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/listing-photos\/[^"'<>\s]{1,400}$/;
  function klicSite(a) {
    if (!Array.isArray(a)) return [];
    var out = [];
    for (var i = 0; i < a.length && out.length < 8; i++) {
      if (typeof a[i] === 'string' && /^[a-z]{3,20}$/.test(a[i]) && out.indexOf(a[i]) < 0) out.push(a[i]);
    }
    return out;
  }
  function popisky(a) {
    if (!Array.isArray(a)) return [];
    var out = [], v;
    for (var i = 0; i < a.length && out.length < 6; i++) {
      v = text(a[i], 40);
      if (v && v.indexOf('<') < 0 && v.indexOf('>') < 0 && out.indexOf(v) < 0) out.push(v);
    }
    return out;
  }
  function fotky(a) {
    if (!Array.isArray(a)) return [];
    var out = [];
    for (var i = 0; i < a.length && out.length < 8; i++) {
      if (typeof a[i] === 'string' && FOTKA.test(a[i]) && out.indexOf(a[i]) < 0) out.push(a[i]);
    }
    return out;
  }

  // Mění pozemek NA MÍSTĚ a vrací ho — ať se nekopírují pole, o kterých
  // tady nevíme (_id doplněné později).
  function pozemek(d) {
    if (!d || typeof d !== 'object') return null;
    if (!DRUHY[d.type]) d.type = 'sale';
    for (var k in POLE) if (Object.prototype.hasOwnProperty.call(POLE, k)) {
      if (k === 'description') continue;            // ten má vlastní čištění (řádky)
      if (d[k] != null || k === 'place') d[k] = text(d[k], POLE[k]);
    }
    if (d.description != null) d.description = viceradkovy(d.description, POLE.description);
    if (!d.place) d.place = 'Neuvedeno';
    d.url = odkaz(d.url);
    if (d.site != null) d.site = klicSite(d.site);
    if (d.features != null) d.features = popisky(d.features);
    if (d.photos != null) d.photos = fotky(d.photos);
    if (d.podil != null) d.podil = !!d.podil;
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
