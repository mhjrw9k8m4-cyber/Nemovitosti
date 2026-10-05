(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(function () { return require('./okruh.js'); });
  } else {
    root.PKHlidani = factory(function () { return root.PKOkruh; });
  }
})(typeof self !== 'undefined' ? self : this, function (dejOkruh) {
  'use strict';

  function zlomekPodilu(d) {
    if (!d) return null;
    if (!d.podil) return 1;
    var m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(d.zlomek || ''));
    if (!m) return null;
    var citatel = +m[1], jmenovatel = +m[2];
    if (!(citatel > 0) || !(jmenovatel > 0) || citatel > jmenovatel) return null;
    return citatel / jmenovatel;
  }
  function vymeraVCene(d) {
    if (!d || typeof d.area !== 'number' || !(d.area > 0)) return null;
    var z = zlomekPodilu(d);
    return z == null ? null : d.area * z;
  }

  var MEZ_NEUVERITELNA = 30000;

  function zaMetr(d) {
    var v = vymeraVCene(d);
    if (!(v > 0) || !d || !(d.price > 0)) return null;
    var zm = d.price / v;
    return zm > MEZ_NEUVERITELNA ? null : zm;
  }

  function normd(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function keyOf(d) {
    return [d.type || '', normd(d.okres), normd(d.place), d.parcel || '', d.price || '', d.area || '']
      .join('|').slice(0, 240);
  }

  function klicShody(d) {
    return [d.place, d.okres, d.price, d.area, d.druh].join('|');
  }

  function znamaParcela(d) {
    var p = (d && d.parcel != null) ? String(d.parcel).trim() : '';
    return (p && p !== '—' && p !== '-') ? p : null;
  }
  function znamyTermin(d) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec((d && d.extra) || '');
    return m ? m[0] : null;
  }
  function tyzPozemek(a, b) {
    var pa = znamaParcela(a), pb = znamaParcela(b);
    if (pa && pb && pa !== pb) return false;
    var ta = znamyTermin(a), tb = znamyTermin(b);
    if (ta && tb && ta !== tb) return false;
    return true;
  }

  function klicZdroje(d) {
    var u = (d && d.url) ? String(d.url) : '';
    if (!u) return null;
    return u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
  }

  function lepsiZeDvou(a, b) {
    var va = (typeof a.area === 'number') ? a.area : 0;
    var vb = (typeof b.area === 'number') ? b.area : 0;
    var lepsi, druhy;
    if (va !== vb) {
      lepsi = (vb > va) ? b : a;
    } else {

      var da = String(a.first_seen || ''), db = String(b.first_seen || '');
      lepsi = (db > da) ? b : a;
    }
    druhy = (lepsi === a) ? b : a;

    if (va === vb && !znamaParcela(lepsi) && znamaParcela(druhy)) {
      var kopie = {};
      for (var k in lepsi) if (Object.prototype.hasOwnProperty.call(lepsi, k)) kopie[k] = lepsi[k];
      kopie.parcel = druhy.parcel;
      return kopie;
    }
    return lepsi;
  }

  function bezDuplicit(list) {
    var skupiny = {}, ven = [];

    var podleZdroje = {}, poZdroji = [];
    for (var z = 0; z < (list || []).length; z++) {
      var zd = list[z], kz = klicZdroje(zd);
      if (!kz) { poZdroji.push(zd); continue; }
      if (!Object.prototype.hasOwnProperty.call(podleZdroje, kz)) {
        podleZdroje[kz] = poZdroji.length;
        poZdroji.push(zd);
      } else {
        var kam = podleZdroje[kz];
        poZdroji[kam] = lepsiZeDvou(poZdroji[kam], zd);
      }
    }
    list = poZdroji;
    for (var i = 0; i < (list || []).length; i++) {
      var d = list[i], k = klicShody(d);
      var skup = skupiny[k] || (skupiny[k] = []);
      var kolize = null;
      for (var j = 0; j < skup.length; j++) { if (tyzPozemek(skup[j], d)) { kolize = skup[j]; break; } }
      if (kolize) {
        if (d.type === 'majitel' && kolize.type !== 'majitel') {
          var pozice = ven.indexOf(kolize);
          if (pozice !== -1) ven[pozice] = d;
          skup[skup.indexOf(kolize)] = d;
        }
        continue;
      }
      skup.push(d);
      ven.push(d);
    }
    return ven;
  }

  var SITE_KLIC = {
    'Elektřina': 'elektrina',
    'Voda': 'voda',
    'Kanalizace': 'kanalizace',
    'Plyn': 'plyn',
    'Přístupová cesta': 'cesta',
  };

  function normMisto(s) {
    return normd(s).replace(/[-\u2010-\u2015]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(?:okres|obec)\s+/, '');
  }

  var OKRESY = [
    'Praha', 'Praha-východ', 'Praha-západ', 'Benešov', 'Beroun', 'Kladno', 'Kolín',
    'Kutná Hora', 'Mělník', 'Mladá Boleslav', 'Nymburk', 'Příbram', 'Rakovník',
    'České Budějovice', 'Český Krumlov', 'Jindřichův Hradec', 'Písek', 'Prachatice',
    'Strakonice', 'Tábor', 'Domažlice', 'Cheb', 'Karlovy Vary', 'Klatovy', 'Plzeň-město',
    'Plzeň-jih', 'Plzeň-sever', 'Rokycany', 'Sokolov', 'Tachov', 'Česká Lípa', 'Děčín',
    'Chomutov', 'Jablonec nad Nisou', 'Liberec', 'Litoměřice', 'Louny', 'Most', 'Semily',
    'Teplice', 'Ústí nad Labem', 'Havlíčkův Brod', 'Hradec Králové', 'Chrudim', 'Jičín',
    'Náchod', 'Pardubice', 'Rychnov nad Kněžnou', 'Svitavy', 'Trutnov', 'Ústí nad Orlicí',
    'Jihlava', 'Pelhřimov', 'Třebíč', 'Žďár nad Sázavou', 'Blansko', 'Brno-město',
    'Brno-venkov', 'Břeclav', 'Hodonín', 'Vyškov', 'Znojmo', 'Kroměříž', 'Uherské Hradiště',
    'Vsetín', 'Zlín', 'Jeseník', 'Olomouc', 'Prostějov', 'Přerov', 'Šumperk', 'Bruntál',
    'Frýdek-Místek', 'Karviná', 'Nový Jičín', 'Opava', 'Ostrava-město'
  ];
  var JE_OKRES = {};
  for (var io_ = 0; io_ < OKRESY.length; io_++) JE_OKRES[normMisto(OKRESY[io_])] = 1;

  function mistoSedi(zadane, d) {
    var k = normMisto(zadane);
    if (!k) return true;
    var okres = normMisto(d.okres);
    if (okres === k) return true;

    if (!JE_OKRES[k] && okres.indexOf(k + ' ') === 0) return true;
    return normMisto(d.place) === k;
  }

  function druhSedi(zadany, druhPozemku) {
    var k = normd(zadany).replace(/\s+/g, ' ').trim();
    if (!k) return true;
    var t = normd(druhPozemku).replace(/\s+/g, ' ').trim();
    return t === k || (' ' + t + ' ').indexOf(' ' + k + ' ') >= 0;
  }

  function matches(s, d) {
    if (!s || !d) return false;
    if (s.ptype && d.type !== s.ptype) return false;
    if (s.druh && !druhSedi(s.druh, d.druh)) return false;
    if (s.max_price && !(d.price > 0 && d.price <= s.max_price)) return false;
    if (s.min_price && !(d.price > 0 && d.price >= s.min_price)) return false;
    if (s.min_area && !(d.area > 0 && d.area >= s.min_area)) return false;
    if (s.max_area && !(d.area > 0 && d.area <= s.max_area)) return false;

    if (s.max_perm2) {
      var zm = zaMetr(d);
      if (zm == null) return false;
      if (zm > s.max_perm2) return false;
    }

    if (s.jen_celek && d.podil) return false;

    if (s.okruh_km > 0) {
      if (!isFinite(s.stred_lat) || !isFinite(s.stred_lng)) return false;
      if (!isFinite(d.lat) || !isFinite(d.lng)) return false;
      var O = dejOkruh && dejOkruh();
      var okruhKm = (O && O.km) ? O.km({ lat: s.stred_lat, lng: s.stred_lng }, d) : Infinity;
      if (!(okruhKm <= s.okruh_km)) return false;
    }
    if (s.okres && !mistoSedi(s.okres, d)) return false;
    if (s.features && s.features.length) {
      var f = d.features || [];
      var site = d.site || [];
      for (var i = 0; i < s.features.length; i++) {
        var need = s.features[i];
        var klic = SITE_KLIC[need];
        if (klic && site.indexOf(klic) >= 0) continue;
        if (need === 'Přístupová cesta') {
          if ((d.access || '').indexOf('cesta') < 0) return false;
        } else if (f.indexOf(need) < 0) return false;
      }
    }
    return true;
  }

  function noveProHledani(s, data) {
    var videno = {}, identityVidene = {};
    (s && s.seen_keys ? s.seen_keys : []).forEach(function (k) {
      videno[k] = 1;
      var b = bezCeny(k);
      if (b) identityVidene[b.identita] = 1;
    });
    var mam = {}, out = [];
    (data || []).forEach(function (d) {
      var k = keyOf(d);
      if (mam[k] || videno[k] || !matches(s, d)) return;

      var b = bezCeny(k);
      if (b && identityVidene[b.identita]) return;
      mam[k] = 1;
      out.push(d);
    });
    out.sort(function (a, b) {
      return String(b.first_seen || '').localeCompare(String(a.first_seen || ''));
    });
    return out;
  }

  function novychProHledani(s, data) { return noveProHledani(s, data).length; }

  var CENA_V_KLICI = 4;
  function bezCeny(klic) {
    var c = String(klic == null ? '' : klic).split('|');
    if (c.length !== 6) return null;
    var stara = c[CENA_V_KLICI];
    c.splice(CENA_V_KLICI, 1);
    return { identita: c.join('|'), cena: stara };
  }

  function zmeneneProHledani(s, data) {
    var videno = {}, podleIdentity = {};
    (s && s.seen_keys ? s.seen_keys : []).forEach(function (k) {
      videno[k] = 1;
      var b = bezCeny(k);
      if (b) podleIdentity[b.identita] = b.cena;
    });
    var mam = {}, out = [];
    (data || []).forEach(function (d) {
      var k = keyOf(d);
      if (mam[k] || videno[k] || !matches(s, d)) return;
      var b = bezCeny(k);
      if (!b || !(b.identita in podleIdentity)) return;
      var stara = parseInt(podleIdentity[b.identita], 10);
      if (!isFinite(stara) || stara === (d.price | 0)) return;
      mam[k] = 1;
      out.push({ pozemek: d, staraCena: stara });
    });
    out.sort(function (a, b) {
      return String(b.pozemek.first_seen || '').localeCompare(String(a.pozemek.first_seen || ''));
    });
    return out;
  }

  function kliceProHledani(s, data) {
    var mam = {}, out = [];
    (data || []).forEach(function (d) {
      var k = keyOf(d);
      if (mam[k] || !matches(s, d)) return;
      mam[k] = 1;
      out.push(k);
    });
    return out;
  }

  function novychCelkem(hledani, data) {
    var nove = {};
    (hledani || []).forEach(function (s) {
      noveProHledani(s, data).forEach(function (d) { nove[keyOf(d)] = 1; });

      zmeneneProHledani(s, data).forEach(function (x) { nove[keyOf(x.pozemek)] = 1; });
    });
    return Object.keys(nove).length;
  }

  var OKRUH_SLOUPCE = ['stred_lat', 'stred_lng', 'okruh_km'];
  var SLOUPCE_STUPNU = {

    celek: null,

    bezOkruhu: OKRUH_SLOUPCE,

    siroke: OKRUH_SLOUPCE.concat(['jen_celek']),

    uzke: OKRUH_SLOUPCE.concat(['jen_celek', 'min_price', 'max_area', 'max_perm2'])
  };
  function kriteriaUlozena(k, uroven) {
    if (!k) return k;
    var pryc = SLOUPCE_STUPNU[uroven];
    if (pryc === undefined) throw new Error('neznámý stupeň uložení: ' + uroven);
    if (pryc === null) return k;
    var out = {};
    for (var kl in k) {
      if (!Object.prototype.hasOwnProperty.call(k, kl)) continue;
      if (pryc.indexOf(kl) >= 0) continue;
      out[kl] = k[kl];
    }
    return out;
  }

  return {
    tyzPozemek: tyzPozemek, normd: normd, keyOf: keyOf, matches: matches,
           kriteriaUlozena: kriteriaUlozena, STUPNE_ULOZENI: SLOUPCE_STUPNU,
           mistoSedi: mistoSedi, druhSedi: druhSedi,
           klicShody: klicShody, bezDuplicit: bezDuplicit,
           noveProHledani: noveProHledani, novychProHledani: novychProHledani, kliceProHledani: kliceProHledani,
           zmeneneProHledani: zmeneneProHledani, bezCeny: bezCeny, novychCelkem: novychCelkem,

           zaMetr: zaMetr, vymeraVCene: vymeraVCene, zlomekPodilu: zlomekPodilu,
           OKRESY: OKRESY };
});
