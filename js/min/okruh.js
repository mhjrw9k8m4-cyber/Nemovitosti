(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKOkruh = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function km(a, b) {
    if (!a || !b) return Infinity;
    var la1 = a.lat, ln1 = a.lng, la2 = b.lat, ln2 = b.lng;
    if (typeof la1 !== 'number' || typeof ln1 !== 'number'
      || typeof la2 !== 'number' || typeof ln2 !== 'number') return Infinity;
    if (!isFinite(la1) || !isFinite(ln1) || !isFinite(la2) || !isFinite(ln2)) return Infinity;
    var r = Math.PI / 180, dLat = (la2 - la1) * r, dLng = (ln2 - ln1) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function spolecnyZacatek(a, b) {
    var n = Math.min(a.length, b.length), i = 0;
    while (i < n && a.charAt(i) === b.charAt(i)) i++;
    return i;
  }
  function kmenSedi(a, b) {
    if (!a || !b) return false;
    var p = spolecnyZacatek(a, b), kratsi = Math.min(a.length, b.length);
    if (p < 3) return false;
    if (p < kratsi - 2) return false;
    return p >= Math.ceil(kratsi * 0.6);
  }

  function nazevSedi(dotazSlova, nazevSlova) {
    if (!dotazSlova.length || dotazSlova.length > nazevSlova.length) return 0;
    var skore = 0;
    for (var i = 0; i < dotazSlova.length; i++) {
      if (!kmenSedi(dotazSlova[i], nazevSlova[i])) return 0;
      skore += spolecnyZacatek(dotazSlova[i], nazevSlova[i]);
    }
    return skore;
  }

  var OKRESNI_MESTA = {
    "Praha": [50.083, 14.421],
    "Praha-východ": [50.09, 14.66],
    "Praha-západ": [49.95, 14.3],
    "Benešov": [49.783, 14.686],
    "Beroun": [49.964, 14.072],
    "Kladno": [50.147, 14.103],
    "Kolín": [50.028, 15.2],
    "Kutná Hora": [49.948, 15.268],
    "Mělník": [50.35, 14.474],
    "Mladá Boleslav": [50.411, 14.904],
    "Nymburk": [50.185, 15.041],
    "Příbram": [49.689, 14.01],
    "Rakovník": [50.104, 13.733],
    "České Budějovice": [48.975, 14.48],
    "Český Krumlov": [48.811, 14.315],
    "Jindřichův Hradec": [49.144, 15.003],
    "Písek": [49.309, 14.148],
    "Prachatice": [49.013, 13.997],
    "Strakonice": [49.261, 13.902],
    "Tábor": [49.414, 14.657],
    "Domažlice": [49.44, 12.93],
    "Cheb": [50.079, 12.37],
    "Karlovy Vary": [50.231, 12.871],
    "Klatovy": [49.395, 13.295],
    "Plzeň-město": [49.747, 13.377],
    "Plzeň-jih": [49.6, 13.5],
    "Plzeň-sever": [49.85, 13.3],
    "Rokycany": [49.742, 13.594],
    "Sokolov": [50.181, 12.64],
    "Tachov": [49.795, 12.634],
    "Česká Lípa": [50.685, 14.537],
    "Děčín": [50.774, 14.212],
    "Chomutov": [50.46, 13.417],
    "Jablonec nad Nisou": [50.724, 15.171],
    "Liberec": [50.767, 15.056],
    "Litoměřice": [50.534, 14.132],
    "Louny": [50.354, 13.797],
    "Most": [50.503, 13.636],
    "Semily": [50.601, 15.333],
    "Teplice": [50.64, 13.824],
    "Ústí nad Labem": [50.661, 14.032],
    "Havlíčkův Brod": [49.607, 15.58],
    "Hradec Králové": [50.209, 15.832],
    "Chrudim": [49.951, 15.795],
    "Jičín": [50.436, 15.351],
    "Náchod": [50.416, 16.166],
    "Pardubice": [50.038, 15.779],
    "Rychnov nad Kněžnou": [50.164, 16.276],
    "Svitavy": [49.755, 16.469],
    "Trutnov": [50.561, 15.912],
    "Ústí nad Orlicí": [49.974, 16.394],
    "Jihlava": [49.397, 15.591],
    "Pelhřimov": [49.431, 15.223],
    "Třebíč": [49.215, 15.882],
    "Žďár nad Sázavou": [49.563, 15.94],
    "Blansko": [49.365, 16.644],
    "Brno-město": [49.195, 16.608],
    "Brno-venkov": [49.1, 16.5],
    "Břeclav": [48.759, 16.882],
    "Hodonín": [48.855, 17.132],
    "Vyškov": [49.277, 16.999],
    "Znojmo": [48.855, 16.048],
    "Kroměříž": [49.298, 17.393],
    "Uherské Hradiště": [49.07, 17.459],
    "Vsetín": [49.339, 17.996],
    "Zlín": [49.226, 17.671],
    "Jeseník": [50.229, 17.204],
    "Olomouc": [49.594, 17.251],
    "Prostějov": [49.472, 17.111],
    "Přerov": [49.455, 17.451],
    "Šumperk": [49.965, 16.971],
    "Bruntál": [49.988, 17.464],
    "Frýdek-Místek": [49.683, 18.35],
    "Karviná": [49.854, 18.541],
    "Nový Jičín": [49.594, 18.01],
    "Opava": [49.938, 17.902],
    "Ostrava-město": [49.834, 18.282],
  };

  var PRIVESKY = { mesto: 1, venkov: 1, jih: 1, sever: 1, vychod: 1, zapad: 1 };
  function nazevMesta(okres) {
    var kus = String(okres).split('-');
    if (kus.length === 2 && PRIVESKY[norm(kus[1])]) return kus[0];
    return okres;
  }

  function median(a) {
    var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
  }

  function stred(data, text) {
    var slova = norm(text).split(' ').filter(Boolean);
    if (!slova.length) return null;
    var dotaz = slova.join('');
    var nej = null, ok;
    for (ok in OKRESNI_MESTA) {
      var nw = norm(ok).split(' ');
      var skore = nazevSedi(slova, nw);
      if (!skore) continue;
      var rozdil = Math.abs(dotaz.length - nw.join('').length);
      if (!nej || skore > nej.skore || (skore === nej.skore && rozdil < nej.rozdil)) {
        nej = { skore: skore, rozdil: rozdil, okres: ok };
      }
    }
    if (nej) {
      var xy = OKRESNI_MESTA[nej.okres];
      return { lat: xy[0], lng: xy[1], nazev: nazevMesta(nej.okres), zdroj: 'mesto' };
    }

    var skupiny = {}, i;
    for (i = 0; i < (data || []).length; i++) {
      var d = data[i];
      if (!d || typeof d.lat !== 'number' || typeof d.lng !== 'number') continue;
      if (!isFinite(d.lat) || !isFinite(d.lng)) continue;
      var nn = norm(d.place);
      if (!nn) continue;
      var g = skupiny[nn] || (skupiny[nn] = { lat: [], lng: [], nazev: d.place, slova: nn.split(' ') });
      g.lat.push(d.lat); g.lng.push(d.lng);
    }
    var nejO = null, k;
    for (k in skupiny) {
      var gg = skupiny[k];
      var sk = nazevSedi(slova, gg.slova);
      if (!sk) continue;
      var r2 = Math.abs(dotaz.length - k.replace(/ /g, '').length);
      if (!nejO || sk > nejO.skore || (sk === nejO.skore && r2 < nejO.rozdil)
        || (sk === nejO.skore && r2 === nejO.rozdil && gg.lat.length > nejO.g.lat.length)) {
        nejO = { skore: sk, rozdil: r2, g: gg };
      }
    }
    if (!nejO) return null;
    return { lat: median(nejO.g.lat), lng: median(nejO.g.lng),
      nazev: nejO.g.nazev, zdroj: 'obec', pocet: nejO.g.lat.length };
  }

  var VELKA_MESTA = ['Praha', 'Brno-město', 'Ostrava-město', 'Plzeň-město',
    'Liberec', 'Olomouc', 'České Budějovice', 'Hradec Králové',
    'Ústí nad Labem', 'Pardubice'];

  var POUZE_OKRES = { venkov: 1, jih: 1, sever: 1, vychod: 1, zapad: 1 };
  function maMesto(okres) {
    var kus = String(okres || '').split('-');
    return !(kus.length === 2 && POUZE_OKRES[norm(kus[1])]);
  }

  function nahradniSouradnice(d) {
    if (!d || !d.okres) return false;
    var t = OKRESNI_MESTA[d.okres];
    if (!t) return false;
    return Math.abs(d.lat - t[0]) < 0.0015 && Math.abs(d.lng - t[1]) < 0.0015;
  }

  function kmDo(d, okres) {
    var t = OKRESNI_MESTA[okres];
    if (!t) return null;
    var k = km({ lat: t[0], lng: t[1] }, d);
    return isFinite(k) ? k : null;
  }
  function nejblizsiVelke(d) {
    var nej = null;
    for (var i = 0; i < VELKA_MESTA.length; i++) {
      var k = kmDo(d, VELKA_MESTA[i]);
      if (k == null) continue;
      if (!nej || k < nej.km) nej = { okres: VELKA_MESTA[i], nazev: nazevMesta(VELKA_MESTA[i]), km: k };
    }
    return nej;
  }

  function celeKm(k) {
    if (k < 10) return String(Math.round(k * 10) / 10).replace('.', ',') + '\u00a0km';
    return Math.round(k) + '\u00a0km';
  }

  function popisVzdalenosti(d) {
    if (!d || typeof d.lat !== 'number' || typeof d.lng !== 'number') return '';
    if (!isFinite(d.lat) || !isFinite(d.lng)) return '';
    if (nahradniSouradnice(d)) return '';
    var kusy = [], okresMesto = '';
    if (maMesto(d.okres)) {
      var doOkresu = kmDo(d, d.okres);
      if (doOkresu != null) {
        okresMesto = nazevMesta(d.okres);
        kusy.push(okresMesto + ' ' + celeKm(doOkresu));
      }
    }
    var velke = nejblizsiVelke(d);

    if (velke && norm(velke.nazev) !== norm(okresMesto)) {
      kusy.push(velke.nazev + ' ' + celeKm(velke.km));
    }
    return kusy.join(' · ');
  }

  function vTvaru(lat, lng, body) {
    if (!body || body.length < 3) return false;
    if (!isFinite(lat) || !isFinite(lng)) return false;
    var uvnitr = false;
    for (var i = 0, j = body.length - 1; i < body.length; j = i++) {
      var yi = body[i][0], xi = body[i][1];
      var yj = body[j][0], xj = body[j][1];
      if (((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) uvnitr = !uvnitr;
    }
    return uvnitr;
  }

  return { km: km, stred: stred, norm: norm, kmenSedi: kmenSedi, nazevSedi: nazevSedi,
    nazevMesta: nazevMesta, median: median, OKRESNI_MESTA: OKRESNI_MESTA,
    VELKA_MESTA: VELKA_MESTA, maMesto: maMesto, nahradniSouradnice: nahradniSouradnice,
    kmDo: kmDo, nejblizsiVelke: nejblizsiVelke, celeKm: celeKm,
    popisVzdalenosti: popisVzdalenosti, vTvaru: vTvaru };
}));
