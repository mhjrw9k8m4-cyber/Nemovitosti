/* =====================================================================
   Parcelka — čtení EXIFu z fotky.

   K čemu to je: fotka pořízená mobilem s sebou nese značku a model
   přístroje, čas pořízení a často i souřadnice. Snímek obrazovky ani
   obrázek stažený z cizího inzerátu tyhle údaje obvykle nemají — a když
   souřadnice jsou, dá se porovnat, jestli fotka vznikla někde poblíž
   pozemku, nebo o dvě stě kilometrů jinde.

   Čte se jen hlavička (prvních pár desítek kilobajtů), ne celý soubor.

   Důležité omezení: **chybějící EXIF nic nedokazuje.** Messenger, WhatsApp
   i některé galerie údaje při sdílení mažou, takže poctivá fotka o ně
   snadno přijde. Proto „bez EXIFu" nikdy nic nezamítá — váhu má jen to,
   co v EXIFu opravdu stojí.
   ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PKExif = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAG = {
    MAKE: 0x010F, MODEL: 0x0110, ORIENTACE: 0x0112,
    EXIF_IFD: 0x8769, GPS_IFD: 0x8825,
    DATUM: 0x9003,           // DateTimeOriginal (v Exif IFD)
    SW: 0x0131               // Software — u snímků obrazovky bývá název systému
  };
  var GPS = { LAT_REF: 1, LAT: 2, LNG_REF: 3, LNG: 4 };

  function cti(pohled, pozice, delka, malyEndian) {
    if (delka === 1) return pohled.getUint8(pozice);
    if (delka === 2) return pohled.getUint16(pozice, malyEndian);
    return pohled.getUint32(pozice, malyEndian);
  }

  /* Jedna položka IFD: 12 bajtů — značka, typ, počet, hodnota (nebo odkaz
     na hodnotu, když se do čtyř bajtů nevejde). */
  function hodnota(pohled, vstup, tiff, malyEndian) {
    var typ = pohled.getUint16(vstup + 2, malyEndian);
    var pocet = pohled.getUint32(vstup + 4, malyEndian);
    var velikost = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[typ] || 1;
    var celkem = velikost * pocet;
    var kde = celkem <= 4 ? vstup + 8 : tiff + pohled.getUint32(vstup + 8, malyEndian);
    if (kde + celkem > pohled.byteLength) return null;

    if (typ === 2) {                                   // text
      var s = '';
      for (var i = 0; i < pocet; i++) {
        var z = pohled.getUint8(kde + i);
        if (!z) break;
        s += String.fromCharCode(z);
      }
      return s.trim();
    }
    if (typ === 5 || typ === 10) {                     // zlomek (i pole zlomků)
      var out = [];
      for (var j = 0; j < pocet; j++) {
        var citatel = pohled.getUint32(kde + j * 8, malyEndian);
        var jmenovatel = pohled.getUint32(kde + j * 8 + 4, malyEndian);
        out.push(jmenovatel ? citatel / jmenovatel : 0);
      }
      return pocet === 1 ? out[0] : out;
    }
    return cti(pohled, kde, velikost, malyEndian);     // čísla
  }

  function ctiIfd(pohled, kde, tiff, malyEndian) {
    var polozky = {};
    if (kde + 2 > pohled.byteLength) return polozky;
    var pocet = pohled.getUint16(kde, malyEndian);
    if (pocet > 512) return polozky;                   // nesmysl → poškozená hlavička
    for (var i = 0; i < pocet; i++) {
      var vstup = kde + 2 + i * 12;
      if (vstup + 12 > pohled.byteLength) break;
      var znacka = pohled.getUint16(vstup, malyEndian);
      polozky[znacka] = hodnota(pohled, vstup, tiff, malyEndian);
    }
    return polozky;
  }

  // „50/1, 5/1, 3036/100" → 50.0842…  (stupně, minuty, vteřiny)
  function naStupne(dms, smer) {
    if (!dms || !dms.length) return null;
    var st = (dms[0] || 0) + (dms[1] || 0) / 60 + (dms[2] || 0) / 3600;
    if (smer === 'S' || smer === 'W') st = -st;
    return st;
  }

  /* Vrací { znacka, model, software, datum, lat, lng, maEXIF } — co se
     nepodaří přečíst, chybí. Nikdy nevyhazuje výjimku. */
  function zBuferu(buffer) {
    var prazdno = { maEXIF: false };
    try {
      var p = new DataView(buffer);
      if (p.byteLength < 12) return prazdno;
      if (p.getUint16(0) !== 0xFFD8) return prazdno;   // není JPEG

      // projdi značky, dokud nenarazíš na APP1 s „Exif\0\0"
      var pozice = 2, tiff = -1;
      while (pozice + 4 < p.byteLength) {
        if (p.getUint8(pozice) !== 0xFF) break;
        var znacka = p.getUint8(pozice + 1);
        var delka = p.getUint16(pozice + 2);
        if (znacka === 0xE1 && pozice + 10 < p.byteLength &&
            p.getUint32(pozice + 4) === 0x45786966 && p.getUint16(pozice + 8) === 0x0000) {
          tiff = pozice + 10;
          break;
        }
        if (znacka === 0xDA) break;                    // začala obrazová data
        pozice += 2 + delka;
      }
      if (tiff < 0 || tiff + 8 > p.byteLength) return prazdno;

      var razeni = p.getUint16(tiff);
      if (razeni !== 0x4949 && razeni !== 0x4D4D) return prazdno;
      var malyEndian = razeni === 0x4949;
      if (p.getUint16(tiff + 2, malyEndian) !== 0x002A) return prazdno;

      var ifd0 = ctiIfd(p, tiff + p.getUint32(tiff + 4, malyEndian), tiff, malyEndian);
      var vysledek = { maEXIF: true };
      if (ifd0[TAG.MAKE]) vysledek.znacka = String(ifd0[TAG.MAKE]);
      if (ifd0[TAG.MODEL]) vysledek.model = String(ifd0[TAG.MODEL]);
      if (ifd0[TAG.SW]) vysledek.software = String(ifd0[TAG.SW]);

      if (ifd0[TAG.EXIF_IFD]) {
        var exif = ctiIfd(p, tiff + ifd0[TAG.EXIF_IFD], tiff, malyEndian);
        if (exif[TAG.DATUM]) vysledek.datum = String(exif[TAG.DATUM]);   // „2026:09:18 14:03:22"
      }
      if (ifd0[TAG.GPS_IFD]) {
        var gps = ctiIfd(p, tiff + ifd0[TAG.GPS_IFD], tiff, malyEndian);
        var lat = naStupne(gps[GPS.LAT], gps[GPS.LAT_REF]);
        var lng = naStupne(gps[GPS.LNG], gps[GPS.LNG_REF]);
        if (lat != null && lng != null && (lat || lng)) { vysledek.lat = lat; vysledek.lng = lng; }
      }
      return vysledek;
    } catch (e) { return prazdno; }
  }

  // „2026:09:18 14:03:22" → Date (nebo null)
  function datumNaCas(s) {
    var m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return isNaN(d.getTime()) ? null : d;
  }

  // Vzdálenost dvou bodů v kilometrech (haversine).
  function vzdalenostKm(a, b, c, d) {
    if ([a, b, c, d].some(function (x) { return typeof x !== 'number' || isNaN(x); })) return null;
    var R = 6371, rad = Math.PI / 180;
    var dLat = (c - a) * rad, dLng = (d - b) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  return { zBuferu: zBuferu, datumNaCas: datumNaCas, vzdalenostKm: vzdalenostKm };
});
