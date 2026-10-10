(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKDotaz = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(s) {

    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/(^|\s)(\d+|tis\w*|mil\w*|korun\w*|kc|czk|ha|hektar\w*|m2|ar|aru|ary)\s[-‐-―]\s(?=\d)/g, '$1$2 az ')
      .replace(/[-‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  var DRUHY = [

    ['Zemědělská půda', 'zemědělská', ['zemedelska puda', 'zemedelskou pudu', 'zemedelske pozemky', 'zemedelsky pozemek', 'zemedelska', 'zemedelsky']],
    ['Louka / travní porost', 'travní porost', ['trvaly travni porost', 'travni porost', 'louka', 'louky', 'travni', 'pastvina', 'pastviny']],

    ['Stavební / zastavěná', 'stavební', ['stavebni pozemek', 'stavebni parcela',
      'na stavbu domu', 'pod stavbu domu', 'k vystavbe domu', 'na stavbu rodinneho domu',
      'na stavbu', 'pod stavbu', 'k vystavbe', 'pro stavbu', 'pod dum', 'na dum',
      'stavebni', 'stavebak', 'zastavena', 'stavbu', 'vystavbe', 'vystavba']],
    ['Lesní pozemek', 'lesní', ['lesni pozemek', 'lesni', 'les', 'lesy', 'lesa']],
    ['Orná půda', 'orná', ['orna puda', 'orna', 'pole', 'poli']],

    ['Zahrada', 'zahrada', ['zahrada', 'zahrady', 'zahradu', 'zahradka', 'zahradky', 'zahradku']],
    ['Vinice / sad', 'vinice', ['ovocny sad', 'vinice', 'vinici', 'sad', 'sady']],
    ['Ostatní plocha', 'ostatní', ['ostatni plocha', 'ostatni']],
  ];
  var TYPY = [
    ['drazba', 'Dražba', 'dražba', ['drazba', 'drazby', 'drazbu', 'v drazbe']],
    ['exekuce', 'Exekuce', 'exekuce', ['exekuce', 'exekucni', 'exekuci']],
    ['obec', 'Od obce', 'od obce', ['od obce', 'obecni', 'obec prodava']],
    ['majitel', 'Od majitele', 'od majitele', ['od majitele', 'primo od majitele', 'majitel', 'soukromnik']],
    ['sale', 'Běžná nabídka', 'inzerát', ['inzerat', 'inzeraty', 'bezny prodej']],
  ];

  var SITE = [
    ['elektrina', 'Elektřina', 'elektřina', ['elektrina', 'elektriny', 'elektrinou', 'elektro', 'proud', 'el. energie', 'el energie']],
    ['voda', 'Voda', 'voda', ['vodovod', 'vodovodem', 'voda', 'vody', 'vodou', 'studna', 'studnu', 'studnou', 'vrt', 'vrtem']],
    ['kanalizace', 'Kanalizace', 'kanalizace', ['kanalizace', 'kanalizaci', 'kanalizacimi', 'septik', 'septikem', 'cov']],
    ['plyn', 'Plyn', 'plyn', ['plyn', 'plynu', 'plynem', 'plynofikace', 'plynovod']],
    ['cesta', 'Příjezd', 'příjezd', ['prijezd', 'prijezdem', 'prijezdova cesta', 'prijezdovou cestou', 'pristupova cesta', 'pristupovou cestou', 'pristup', 'pristupem', 'cesta', 'cestou', 'komunikace', 'komunikaci']],
  ];
  var CELEK = ['bez podilu', 'jen cele', 'cely pozemek', 'cele pozemky', 'celek', 'nepodil'];

  var KRAJE = [

    ['Praha', 'hlavní město Praha', ['hlavni mesto praha', 'hl. m. praha', 'kraj praha']],
    ['Středočeský', 'Středočeský', ['stredocesky', 'stredocesky kraj', 'stredni cechy', 'stredoceskeho']],
    ['Jihočeský', 'Jihočeský', ['jihocesky', 'jihocesky kraj', 'jizni cechy', 'jihoceskeho']],
    ['Plzeňský', 'Plzeňský', ['plzensky', 'plzensky kraj', 'plzenska', 'plzenskeho']],
    ['Karlovarský', 'Karlovarský', ['karlovarsky', 'karlovarsky kraj', 'karlovarskeho']],
    ['Ústecký', 'Ústecký', ['ustecky', 'ustecky kraj', 'severni cechy', 'usteckeho']],
    ['Liberecký', 'Liberecký', ['liberecky', 'liberecky kraj', 'libereckeho']],
    ['Královéhradecký', 'Královéhradecký', ['kralovehradecky', 'kralovehradecky kraj', 'kralovehradeckeho']],
    ['Pardubický', 'Pardubický', ['pardubicky', 'pardubicky kraj', 'pardubickeho']],
    ['Vysočina', 'Vysočina', ['vysocina', 'kraj vysocina', 'vysocinu', 'vysocine', 'vysociny']],
    ['Jihomoravský', 'Jihomoravský', ['jihomoravsky', 'jihomoravsky kraj', 'jizni morava', 'jihomoravskeho']],
    ['Olomoucký', 'Olomoucký', ['olomoucky', 'olomoucky kraj', 'olomouckeho']],
    ['Zlínský', 'Zlínský', ['zlinsky', 'zlinsky kraj', 'zlinskeho']],
    ['Moravskoslezský', 'Moravskoslezský', ['moravskoslezsky', 'moravskoslezsky kraj', 'moravskoslezsko', 'moravskoslezskeho']],
  ];

  var VYPLN = {};
  ('a i s se v ve na do od ze z k ke u o po pro pri za nad pod mezi kolem okoli'
   + ' jen pouze hledam hledame chci chceme koupim koupit sehnat shanim'
   + ' prodej prodam prodava nabidka nabidky nabizim inzerce'
   + ' pozemek pozemky pozemku pozemkem pozemcich parcela parcely parcelu parcelou'
   + ' okres okrese okresu obec obce obci'
   + ' potrebuji potrebujeme bych bychom koupe prodeje'
   + ' prosim dekuji').split(' ').forEach(function (w) { if (w) VYPLN[w] = true; });

  var NASOBEK = [
    [/^(?:kc\/m2|kc\/m²|\/m2|\/m²|kc\/metr)$/, 1, 'zaMetr'],
    [/^(?:mil|mili[oó]n\w*|m)$/, 1000000, 'cena'],
    [/^(?:tis|tis\.|tisic\w*|k)$/, 1000, 'cena'],
    [/^(?:kc|korun\w*|czk)$/, 1, 'cena'],
    [/^(?:ha|hektar\w*)$/, 10000, 'plocha'],

    [/^(?:ar|aru|ary|arech|arů)$/, 100, 'plocha'],
    [/^(?:m2|m²|metru|metry|metr)$/, 1, 'plocha'],
  ];

  var ZA_METR_FRAZE = [['kc', 'za', 'metr'], ['kc', 'za', 'm2'], ['korun', 'za', 'metr'],
    ['kc', 'na', 'metr'], ['kc', 'za', 'm²']];

  var LEVNE = ['levny', 'levna', 'levne', 'levnejsi', 'levny pozemek', 'levne pozemky',
    'vyhodny', 'vyhodna', 'vyhodne', 'vyhodna koupe', 'vyhodna cena',
    'pod cenou', 'pod obvyklou cenou', 'pod obvyklou', 'pod odhadem', 've slevě', 've sleve'];

  var SITE_OBECNE = ['site', 'sitemi', 'siti', 'sitich', 'inzenyrske site', 'inzenyrskymi sitemi',
    'inzenyrskych siti', 'vsechny site', 'veskere site', 'is'];

  var OSTATNI = [
    ['levne', 'Pod obvyklou cenou', 'levné', LEVNE],
    ['site', 'Uvedené sítě', 'sítě', SITE_OBECNE],
  ];

  var BEZ_JEDNOTKY_OD = 10000;

  var PRIBLIZNE = 0.25;

  var KM_JEDNOTKA = /^(?:km|kilometr|kilometru|kilometry|kilometrem|kilometrech)$/;

  var OKRUH_MIN = 1, OKRUH_MAX = 300;
  function platnyOkruh(n) {
    return typeof n === 'number' && isFinite(n) && n >= OKRUH_MIN && n <= OKRUH_MAX;
  }

  var OKRUH_PRED = { do: 1, max: 1, pod: 1, nejvys: 1 };

  function cislo(s) {
    var c = s.replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(c)) return null;
    return parseFloat(c);
  }

  function cisloSkupiny(slova, i) {
    if (!/^\d{1,3}$/.test(slova[i] || '')) return null;
    var slov = 1;
    while (/^\d{3}$/.test(slova[i + slov] || '')) slov++;
    if (slov < 2) return null;
    return { hodnota: parseFloat(slova.slice(i, i + slov).join('')), slov: slov };
  }

  function vetsiPrvni(pole) {
    return pole.slice().sort(function (a, b) { return b.split(' ').length - a.split(' ').length || b.length - a.length; });
  }

  function puvodniSlova(dotaz, slova) {
    var p = String(dotaz == null ? '' : dotaz)
      .replace(/[\u2010-\u2015-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    return p.length === slova.length ? p : slova;
  }

  function rozdelSlepene(slova, psano) {
    var vsl = [], vps = [];
    for (var i = 0; i < slova.length; i++) {
      var t = slova[i], m = /^(\d+(?:[.,]\d+)?)(.+)$/.exec(t), jed = m && m[2];
      var zname = false;
      if (jed) {
        if (KM_JEDNOTKA.test(jed)) zname = true;
        else for (var n = 0; n < NASOBEK.length; n++) if (NASOBEK[n][0].test(jed)) { zname = true; break; }
      }

      var orig = psano[i] == null ? t : psano[i];
      if (!zname || orig.length !== t.length) { vsl.push(t); vps.push(orig); continue; }
      vsl.push(m[1], jed);
      vps.push(orig.slice(0, m[1].length), orig.slice(m[1].length));
    }
    return [vsl, vps];
  }

  function rozeber(dotaz) {
    var slova = norm(dotaz).split(' ').filter(Boolean);

    var psano = puvodniSlova(dotaz, slova);
    var rozdelene = rozdelSlepene(slova, psano);
    slova = rozdelene[0]; psano = rozdelene[1];
    var usek = function (od, delka) { return psano.slice(od, od + delka).join(' '); };
    var vzato = new Array(slova.length);
    var ven = { druh: null, typ: null, kraj: null, site: [], nejakeSite: false,
      jenCelek: false, levne: false, zaMetrOd: null, zaMetrDo: null,
      cenaOd: null, cenaDo: null, plochaOd: null, plochaDo: null,
      okruh: null, okruhMisto: '', text: '', casti: [] };

    function zkus(od, fraze) {
      var f = fraze.split(' ');
      for (var i = 0; i < f.length; i++) {
        if (vzato[od + i] || slova[od + i] !== f[i]) return false;
      }
      return true;
    }
    function zaber(od, delka, cast) {
      for (var i = 0; i < delka; i++) vzato[od + i] = true;

      cast.slova = slova.slice(od, od + delka);
      ven.casti.push(cast);
    }

    for (var ki = 0; ki < slova.length && ven.okruh == null; ki++) {
      if (vzato[ki]) continue;
      var pred = OKRUH_PRED[slova[ki]] ? 1 : 0;
      var kpos = ki + pred;
      if (vzato[kpos] || vzato[kpos + 1]) continue;
      var kc = cislo(slova[kpos] || '');
      if (kc == null || !KM_JEDNOTKA.test(slova[kpos + 1] || '')) continue;
      if (!platnyOkruh(kc)) continue;
      ven.okruh = kc;

      zaber(ki, pred + 2, { druh: 'okruh', smer: 'do', hodnota: kc,
        popis: 'do ' + slova[kpos] + ' km' });
    }

    var ROZSAH_PRED = { od: 1, mezi: 1 };
    var ROZSAH_SPOJ = { do: 1, a: 1, az: 1 };
    function cteCislo(iw) {
      var sk = cisloSkupiny(slova, iw);
      if (sk) return { hodnota: sk.hodnota, slov: sk.slov };
      var c1 = cislo(slova[iw] || '');
      return c1 == null ? null : { hodnota: c1, slov: 1 };
    }
    function cteJednotku(iw) {
      var j = slova[iw] || '';
      for (var n2 = 0; n2 < NASOBEK.length; n2++) if (NASOBEK[n2][0].test(j)) {
        return { nas: NASOBEK[n2], slov: 1 };
      }
      return null;
    }
    for (var ri = 0; ri < slova.length; ri++) {
      if (vzato[ri]) continue;
      var rPred = ROZSAH_PRED[slova[ri]] ? 1 : 0;
      var aPos = ri + rPred;
      var ra = cteCislo(aPos);
      if (!ra) continue;
      var rja = cteJednotku(aPos + ra.slov);
      var spoj = aPos + ra.slov + (rja ? rja.slov : 0);
      if (!ROZSAH_SPOJ[slova[spoj]]) continue;
      var rb = cteCislo(spoj + 1);
      if (!rb) continue;
      var rjb = cteJednotku(spoj + 1 + rb.slov);
      var rnas = rjb || rja;
      if (!rnas) {

        if (ra.hodnota < BEZ_JEDNOTKY_OD || rb.hodnota < BEZ_JEDNOTKY_OD) continue;
        rnas = { nas: [null, 1, 'cena'], slov: 0 };
      }
      var nasA = rja ? rja.nas : rnas.nas;
      var hodA = Math.round(ra.hodnota * nasA[1]);
      var hodB = Math.round(rb.hodnota * rnas.nas[1]);
      if (!(hodA < hodB)) continue;
      var kam = rnas.nas[2];
      if (kam === 'zaMetr') {
        if (ven.zaMetrOd != null || ven.zaMetrDo != null) continue;
        ven.zaMetrOd = hodA; ven.zaMetrDo = hodB;
      } else if (kam === 'plocha') {
        if (ven.plochaOd != null || ven.plochaDo != null) continue;
        ven.plochaOd = hodA; ven.plochaDo = hodB;
      } else {
        if (ven.cenaOd != null || ven.cenaDo != null) continue;
        ven.cenaOd = hodA; ven.cenaDo = hodB;
      }
      var rDelka = (spoj + 1 + rb.slov + (rjb ? rjb.slov : 0)) - ri;
      zaber(ri, rDelka, { druh: kam, smer: 'rozsah', hodnota: hodB, hodnotaOd: hodA,
        popis: usek(ri, rDelka) });
    }

    var SMERY = { do: 'do', pod: 'do', max: 'do', od: 'od', nad: 'od', min: 'od' };
    for (var i = 0; i < slova.length; i++) {
      if (vzato[i]) continue;
      var smer = SMERY[slova[i]];
      if (!smer) continue;

      var sk = cisloSkupiny(slova, i + 1);
      var slovCisla = sk ? sk.slov : 1;
      var c = sk ? sk.hodnota : cislo(slova[i + 1] || '');
      if (c == null) continue;
      var jp = i + 1 + slovCisla;
      var jed = slova[jp] || '';
      var delkaJed = 1;

      for (var zf = 0; zf < ZA_METR_FRAZE.length; zf++) {
        var f3 = ZA_METR_FRAZE[zf];
        if (slova[jp] === f3[0] && slova[jp + 1] === f3[1] && slova[jp + 2] === f3[2]) {
          jed = 'kc/m2'; delkaJed = 3; break;
        }
      }
      var nas = null;
      for (var n = 0; n < NASOBEK.length; n++) if (NASOBEK[n][0].test(jed)) { nas = NASOBEK[n]; break; }

      var delka = 1 + slovCisla + delkaJed;
      var delkaJedZapsana = true;
      if (!nas) {
        if (c < BEZ_JEDNOTKY_OD) continue;
        nas = [null, 1, 'cena'];
        delka = 1 + slovCisla;
        jed = 'Kč';
        delkaJedZapsana = false;
      }
      var hodnota = Math.round(c * nas[1]);
      var kde = nas[2];
      if (kde === 'zaMetr') {
        ven[smer === 'do' ? 'zaMetrDo' : 'zaMetrOd'] = hodnota;
      } else {
        ven[kde + (smer === 'do' ? 'Do' : 'Od')] = hodnota;
      }

      zaber(i, delka, { druh: kde, smer: smer, hodnota: hodnota,
        popis: delka === 2 && !delkaJedZapsana ? usek(i, 2) + ' Kč' : usek(i, delka) });
    }

    for (var bi = 0; bi < slova.length; bi++) {
      if (vzato[bi]) continue;
      var bc = cislo(slova[bi]);
      if (bc == null || bc <= 0) continue;
      var bjed = slova[bi + 1] || '';
      var bnas = null;
      for (var bn = 0; bn < NASOBEK.length; bn++) if (NASOBEK[bn][0].test(bjed)) { bnas = NASOBEK[bn]; break; }
      if (!bnas || vzato[bi + 1]) continue;
      var bhod = Math.round(bc * bnas[1]);
      if (bnas[2] === 'plocha') {
        if (ven.plochaOd != null || ven.plochaDo != null) continue;
        ven.plochaOd = Math.round(bhod * (1 - PRIBLIZNE));
        ven.plochaDo = Math.round(bhod * (1 + PRIBLIZNE));
        zaber(bi, 2, { druh: 'plocha', smer: 'kolem', hodnota: bhod,
          popis: 'kolem ' + usek(bi, 2) });
      } else if (bnas[2] === 'cena') {
        if (ven.cenaOd != null || ven.cenaDo != null) continue;
        ven.cenaDo = bhod;
        zaber(bi, 2, { druh: 'cena', smer: 'do', hodnota: bhod,
          popis: 'do ' + usek(bi, 2) });
      } else if (bnas[2] === 'zaMetr') {

        if (ven.zaMetrOd != null || ven.zaMetrDo != null) continue;
        ven.zaMetrDo = bhod;
        zaber(bi, 2, { druh: 'zaMetr', smer: 'do', hodnota: bhod,
          popis: 'do ' + usek(bi, 2) });
      }
    }

    function projdi(seznam, hotovo) {
      for (var s = 0; s < seznam.length; s++) {
        var zaznam = seznam[s];
        var fraze = vetsiPrvni(zaznam[zaznam.length - 1]);
        for (var f = 0; f < fraze.length; f++) {
          for (var i2 = 0; i2 < slova.length; i2++) {
            if (vzato[i2]) continue;
            if (!zkus(i2, fraze[f])) continue;
            if (hotovo(zaznam, i2, fraze[f].split(' ').length)) return;
          }
        }
      }
    }
    projdi(DRUHY, function (z, i2, d) {
      if (ven.druh) return false;
      ven.druh = z[0];
      zaber(i2, d, { druh: 'druh', hodnota: z[0], popis: z[0] });

      var dalsi = vetsiPrvni(z[z.length - 1]);
      for (var f2 = 0; f2 < dalsi.length; f2++) {
        var casti2 = dalsi[f2].split(' ');
        for (var j = 0; j < slova.length; j++) {
          if (vzato[j] || !zkus(j, dalsi[f2])) continue;
          for (var k = 0; k < casti2.length; k++) vzato[j + k] = true;

          ven.casti[ven.casti.length - 1].slova =
            ven.casti[ven.casti.length - 1].slova.concat(slova.slice(j, j + casti2.length));
        }
      }
      return true;
    });

    projdi(KRAJE, function (z, i2, d) {
      if (ven.kraj) return false;
      ven.kraj = z[0];
      zaber(i2, d, { druh: 'kraj', hodnota: z[0], popis: z[1] === 'Praha' ? 'Praha' : z[1] + ' kraj' });
      return true;
    });
    projdi(TYPY, function (z, i2, d) {
      if (ven.typ) return false;
      ven.typ = z[0];
      zaber(i2, d, { druh: 'typ', hodnota: z[0], popis: z[1] });
      return false;
    });
    projdi(SITE, function (z, i2, d) {
      if (ven.site.indexOf(z[0]) >= 0) return false;
      ven.site.push(z[0]);
      zaber(i2, d, { druh: 'sit', hodnota: z[0], popis: z[1] });
      return false;
    });

    var obecne = vetsiPrvni(SITE_OBECNE);
    var obecneHotovo = false;
    for (var oi = 0; oi < obecne.length && !obecneHotovo; oi++) {
      for (var oj = 0; oj < slova.length; oj++) {
        if (vzato[oj] || !zkus(oj, obecne[oi])) continue;
        var dl = obecne[oi].split(' ').length;
        if (ven.site.length) {

          for (var ok2 = 0; ok2 < dl; ok2++) vzato[oj + ok2] = true;
        } else {
          ven.nejakeSite = true;
          zaber(oj, dl, { druh: 'site', hodnota: 'nejake', popis: 'uvedené sítě' });
        }
        obecneHotovo = true;
        break;
      }
    }
    var lv = vetsiPrvni(LEVNE);
    for (var li = 0; li < lv.length && !ven.levne; li++) {
      for (var lj = 0; lj < slova.length; lj++) {
        if (vzato[lj] || !zkus(lj, lv[li])) continue;
        ven.levne = true;
        zaber(lj, lv[li].split(' ').length, { druh: 'levne', hodnota: true, popis: 'pod obvyklou cenou' });
        break;
      }
    }
    var celek = vetsiPrvni(CELEK);
    for (var ci = 0; ci < celek.length && !ven.jenCelek; ci++) {
      for (var cj = 0; cj < slova.length; cj++) {
        if (vzato[cj] || !zkus(cj, celek[ci])) continue;
        ven.jenCelek = true;
        zaber(cj, celek[ci].split(' ').length, { druh: 'celek', hodnota: true, popis: 'jen celé pozemky' });
        break;
      }
    }

    var zbytek = [];
    for (var z2 = 0; z2 < slova.length; z2++) {
      if (vzato[z2] || VYPLN[slova[z2]]) continue;
      zbytek.push(slova[z2]);
    }
    ven.text = zbytek.join(' ');

    if (ven.okruh != null && zbytek.length) {
      ven.okruhMisto = ven.text;
      ven.text = '';
      for (var oc = 0; oc < ven.casti.length; oc++) {
        if (ven.casti[oc].druh !== 'okruh') continue;
        ven.casti[oc].slova = (ven.casti[oc].slova || []).concat(zbytek);
        break;
      }
    }
    return ven;
  }

  return { norm: norm, rozeber: rozeber, platnyOkruh: platnyOkruh,
    OKRUH_MIN: OKRUH_MIN, OKRUH_MAX: OKRUH_MAX,
    DRUHY: DRUHY, TYPY: TYPY, SITE: SITE, KRAJE: KRAJE, OSTATNI: OSTATNI };
});
