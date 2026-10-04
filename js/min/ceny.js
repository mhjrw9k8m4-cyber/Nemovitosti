(function (root) {
  'use strict';

  function hasArea(d) { return typeof d.area === 'number' && d.area > 0; }

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
    if (!hasArea(d)) return null;
    var z = zlomekPodilu(d);
    return z == null ? null : d.area * z;
  }

  function zaMetr(d) {
    var v = vymeraVCene(d);
    return (v > 0 && d && d.price > 0) ? d.price / v : null;
  }

  function zaMetrPopis(d) {
    if (!d || !d.podil) return '';
    var z = zlomekPodilu(d);
    if (z == null) return '';
    return 'Přepočteno na spoluvlastnický podíl' + (d.zlomek ? ' ' + d.zlomek : '') +
      ' — tolik platíte za metr, který vám připadne. Výměra v inzerátu je celá parcela.';
  }

  function druhGroup(s) {
    s = (s || '').toLowerCase();
    if (s.indexOf('les') !== -1) return 'Lesní pozemek';
    if (s.indexOf('stavební') !== -1 || s.indexOf('zastav') !== -1) return 'Stavební / zastavěná';
    if (s.indexOf('orná') !== -1) return 'Orná půda';
    if (s.indexOf('zahrad') !== -1) return 'Zahrada';
    if (s.indexOf('travní') !== -1 || s.indexOf('louk') !== -1 || s.indexOf('pastvin') !== -1) return 'Louka / travní porost';
    if (s.indexOf('vinice') !== -1 || s.indexOf('sad') !== -1) return 'Vinice / sad';
    if (s.indexOf('ostatní') !== -1) return 'Ostatní plocha';
    return 'Jiný pozemek';
  }

  var OKRES_KRAJ = {
  'Hlavní město Praha':'Praha','Praha':'Praha',
  'Benešov':'Středočeský','Beroun':'Středočeský','Kladno':'Středočeský','Kolín':'Středočeský','Kutná Hora':'Středočeský','Mělník':'Středočeský','Mladá Boleslav':'Středočeský','Nymburk':'Středočeský','Praha-východ':'Středočeský','Praha-západ':'Středočeský','Příbram':'Středočeský','Rakovník':'Středočeský',
  'České Budějovice':'Jihočeský','Český Krumlov':'Jihočeský','Jindřichův Hradec':'Jihočeský','Písek':'Jihočeský','Prachatice':'Jihočeský','Strakonice':'Jihočeský','Tábor':'Jihočeský',
  'Domažlice':'Plzeňský','Klatovy':'Plzeňský','Plzeň-město':'Plzeňský','Plzeň-jih':'Plzeňský','Plzeň-sever':'Plzeňský','Rokycany':'Plzeňský','Tachov':'Plzeňský',
  'Cheb':'Karlovarský','Karlovy Vary':'Karlovarský','Sokolov':'Karlovarský',
  'Děčín':'Ústecký','Chomutov':'Ústecký','Litoměřice':'Ústecký','Louny':'Ústecký','Most':'Ústecký','Teplice':'Ústecký','Ústí nad Labem':'Ústecký',
  'Česká Lípa':'Liberecký','Jablonec nad Nisou':'Liberecký','Liberec':'Liberecký','Semily':'Liberecký',
  'Hradec Králové':'Královéhradecký','Jičín':'Královéhradecký','Náchod':'Královéhradecký','Rychnov nad Kněžnou':'Královéhradecký','Trutnov':'Královéhradecký',
  'Chrudim':'Pardubický','Pardubice':'Pardubický','Svitavy':'Pardubický','Ústí nad Orlicí':'Pardubický',
  'Havlíčkův Brod':'Vysočina','Jihlava':'Vysočina','Pelhřimov':'Vysočina','Třebíč':'Vysočina','Žďár nad Sázavou':'Vysočina',
  'Blansko':'Jihomoravský','Brno-město':'Jihomoravský','Brno-venkov':'Jihomoravský','Břeclav':'Jihomoravský','Hodonín':'Jihomoravský','Vyškov':'Jihomoravský','Znojmo':'Jihomoravský',
  'Jeseník':'Olomoucký','Olomouc':'Olomoucký','Prostějov':'Olomoucký','Přerov':'Olomoucký','Šumperk':'Olomoucký',
  'Kroměříž':'Zlínský','Uherské Hradiště':'Zlínský','Vsetín':'Zlínský','Zlín':'Zlínský',
  'Bruntál':'Moravskoslezský','Frýdek-Místek':'Moravskoslezský','Karviná':'Moravskoslezský','Nový Jičín':'Moravskoslezský','Opava':'Moravskoslezský','Ostrava-město':'Moravskoslezský'
  };

  var KRAJ_KDE = {
    'Praha': 'v Praze',
    'Středočeský': 've Středočeském kraji',
    'Jihočeský': 'v Jihočeském kraji',
    'Plzeňský': 'v Plzeňském kraji',
    'Karlovarský': 'v Karlovarském kraji',
    'Ústecký': 'v Ústeckém kraji',
    'Liberecký': 'v Libereckém kraji',
    'Královéhradecký': 'v Královéhradeckém kraji',
    'Pardubický': 'v Pardubickém kraji',
    'Vysočina': 'na Vysočině',
    'Jihomoravský': 'v Jihomoravském kraji',
    'Olomoucký': 'v Olomouckém kraji',
    'Zlínský': 've Zlínském kraji',
    'Moravskoslezský': 'v Moravskoslezském kraji'
  };

  function kdeText(uroven, nazev) {
    if (uroven === 'okres') return 'v okrese ' + nazev;
    return KRAJ_KDE[nazev] || ('v kraji ' + nazev);
  }

  function median(serazene) {
    if (!serazene.length) return null;
    var n = serazene.length, p = Math.floor(n / 2);
    return n % 2 ? serazene[p] : (serazene[p - 1] + serazene[p]) / 2;
  }

  var MEZ_SLEVA = 15;
  var MEZ_POCHYBNA = 60;

  var MEZ_ROZPTYL = 2;

  function postav(DATA, okresKraj) {
    okresKraj = okresKraj || OKRES_KRAJ;
    var podleTypu = {};

    var typOkres = {};
    var typKraj = {};
    var nabidkyOkres = {};
    var nabidkyKraj = {};
    var nabidkyCR = {};

    DATA.forEach(function (d) {
      if (!hasArea(d) || !d.price) return;
      var g = druhGroup(d.druh), m2 = d.price / d.area;
      (podleTypu[d.type + '|' + g] = podleTypu[d.type + '|' + g] || []).push(m2);
      if (d.okres) {
        var ko = d.type + '|' + g + '|' + d.okres;
        (typOkres[ko] = typOkres[ko] || []).push(m2);
        var kk = okresKraj[d.okres];
        if (kk) { var k2 = d.type + '|' + g + '|' + kk; (typKraj[k2] = typKraj[k2] || []).push(m2); }
      }

      if (d.type !== 'sale') return;

      var z = { a: d.area, m: m2 };
      (nabidkyCR[g] = nabidkyCR[g] || []).push(z);
      if (d.okres) (nabidkyOkres[g + '|' + d.okres] = nabidkyOkres[g + '|' + d.okres] || []).push(z);
      var kraj = okresKraj[d.okres];
      if (kraj) (nabidkyKraj[g + '|' + kraj] = nabidkyKraj[g + '|' + kraj] || []).push(z);
    });

    function serad(idx) { Object.keys(idx).forEach(function (k) { idx[k].sort(function (a, b) { return a - b; }); }); }
    serad(podleTypu);
    serad(typOkres);
    serad(typKraj);

    var R2_MEZ = 0.15;
    var SKLON = {};
    (function () {
      var podleDruhu = {};
      DATA.forEach(function (d) {
        if (!hasArea(d) || !d.price || d.type !== 'sale') return;
        var g = druhGroup(d.druh);
        (podleDruhu[g] = podleDruhu[g] || []).push({ a: d.area, m: d.price / d.area });
      });
      Object.keys(podleDruhu).forEach(function (g) {
        var v = podleDruhu[g];
        if (v.length < 40) { SKLON[g] = 0; return; }
        var n = v.length, sx = 0, sy = 0, i;
        var lx = new Array(n), ly = new Array(n);
        for (i = 0; i < n; i++) { lx[i] = Math.log(v[i].a); ly[i] = Math.log(v[i].m); sx += lx[i]; sy += ly[i]; }
        var mx = sx / n, my = sy / n, num = 0, den = 0;
        for (i = 0; i < n; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) * (lx[i] - mx); }
        var b = den ? num / den : 0;
        var ss = 0, sr = 0;
        for (i = 0; i < n; i++) { var pred = my + b * (lx[i] - mx); sr += (ly[i] - pred) * (ly[i] - pred); ss += (ly[i] - my) * (ly[i] - my); }
        var r2 = ss ? 1 - sr / ss : 0;
        SKLON[g] = r2 >= R2_MEZ ? b : 0;
      });
    }());

    function ceny(pole, plocha, druhG) {
      if (!pole) return null;
      var b = (druhG && SKLON[druhG]) || 0;
      var uzke = b ? 10 : 3;
      var out = [];
      for (var i = 0; i < pole.length; i++) {
        if (plocha && (pole[i].a < plocha / uzke || pole[i].a > plocha * uzke)) continue;
        out.push(b && plocha ? pole[i].m * Math.pow(plocha / pole[i].a, b) : pole[i].m);
      }
      out.sort(function (a, b2) { return a - b2; });
      return out;
    }

    var medianTypu = {};
    Object.keys(podleTypu).forEach(function (k) { medianTypu[k] = median(podleTypu[k]); });

    var MIN_VZOREK = 8;

    function hladina(d) {
      var g = druhGroup(d.druh);
      var kroky = [nabidkyOkres[g + '|' + d.okres], nabidkyKraj[g + '|' + okresKraj[d.okres]], nabidkyCR[g]];
      for (var i = 0; i < kroky.length; i++) {
        var a = ceny(kroky[i], d.area, g);
        if (a && a.length >= MIN_VZOREK) return median(a);
      }
      for (var j = 0; j < kroky.length; j++) {
        var b = ceny(kroky[j], 0, g);
        if (b && b.length >= MIN_VZOREK) return median(b);
      }
      return medianTypu[d.type + '|' + g] || null;
    }

    function neduveryhodna(d) {
      if (!hasArea(d) || !d.price) return false;
      var med = hladina(d);
      return med ? (d.price / d.area) < med / 50 : false;
    }

    function nesrovnatelna(d) { return !!(d && d.podil); }

    function percentil(d) {
      if (!hasArea(d) || !d.price || neduveryhodna(d) || nesrovnatelna(d)) return null;
      var g = druhGroup(d.druh);
      var zdroje = [
        { pole: typOkres[d.type + '|' + g + '|' + d.okres], uroven: 'okres', kde: d.okres },
        { pole: typKraj[d.type + '|' + g + '|' + okresKraj[d.okres]], uroven: 'kraj', kde: okresKraj[d.okres] }
      ];
      for (var z = 0; z < zdroje.length; z++) {
        var arr = zdroje[z].pole;
        if (!arr || arr.length < 10) continue;
        if (arr[arr.length - 1] <= arr[0] * 1.2) continue;
        var val = d.price / d.area, below = 0;
        for (var i = 0; i < arr.length; i++) { if (arr[i] <= val) below++; }
        var pct = Math.max(2, Math.min(98, Math.round(below / arr.length * 100)));

        var od = odhad(d);
        if (od && od.podleVelikosti && !od.podil) {
          if (pct >= 65 && od.podOdhadem >= 15) return null;
          if (pct <= 35 && od.podOdhadem <= -15) return null;
        }
        return { pct: pct, cheaper: 100 - pct, sample: arr.length,
          uroven: zdroje[z].uroven, kde: zdroje[z].kde };
      }
      return null;
    }

    var pametOdhadu = (typeof WeakMap === 'function') ? new WeakMap() : null;
    function odhad(d) {
      if (!pametOdhadu || !d || typeof d !== 'object') return odhadSpocti(d);
      if (pametOdhadu.has(d)) return pametOdhadu.get(d);
      var v = odhadSpocti(d);
      pametOdhadu.set(d, v);
      return v;
    }
    function odhadSpocti(d) {
      if (!hasArea(d) || !d.price || neduveryhodna(d)) return null;
      var g = druhGroup(d.druh);
      var zdroje = [
        { pole: nabidkyOkres[g + '|' + d.okres], uroven: 'okres', kde: d.okres },
        { pole: nabidkyKraj[g + '|' + okresKraj[d.okres]], uroven: 'kraj', kde: okresKraj[d.okres] }
      ];

      var kroky = [];
      zdroje.forEach(function (z) { kroky.push({ pole: z.pole, plocha: d.area, uroven: z.uroven, kde: z.kde, podleVelikosti: true }); });
      zdroje.forEach(function (z) { kroky.push({ pole: z.pole, plocha: 0, uroven: z.uroven, kde: z.kde, podleVelikosti: false }); });
      for (var i = 0; i < kroky.length; i++) {
        var k = kroky[i];
        k.arr = ceny(k.pole, k.plocha, g);
        if (!k.arr || k.arr.length < MIN_VZOREK) continue;
        var med = median(k.arr);
        if (!med) continue;
        var castka = Math.round(med * d.area);

        if (d.price > castka * 8) return null;
        var pod = castka > 0 ? Math.round((castka - d.price) / castka * 100) : 0;

        var kvart = function (p) { return k.arr[Math.min(k.arr.length - 1, Math.floor(p * k.arr.length))]; };
        var rozptyl = med ? (kvart(0.75) - kvart(0.25)) / med : null;
        return {
          castka: castka,
          zaM2: med,
          uroven: k.uroven,
          kde: k.kde,
          vzorek: k.arr.length,
          podleVelikosti: k.podleVelikosti,
          druh: g,
          rozdil: castka - d.price,

          podOdhadem: pod,

          podil: nesrovnatelna(d),
          pochybna: pod >= MEZ_POCHYBNA,

          rozptyl: rozptyl,

          nejisty: rozptyl != null && rozptyl > MEZ_ROZPTYL
        };
      }
      return null;
    }

    function hladinaMista(uroven, nazev, druhG) {
      var pole = uroven === 'okres' ? nabidkyOkres[druhG + '|' + nazev]
        : uroven === 'kraj' ? nabidkyKraj[druhG + '|' + nazev]
        : nabidkyCR[druhG];
      var a = ceny(pole, 0, druhG);
      if (!a || a.length < MIN_VZOREK) return null;
      return { zaM2: median(a), vzorek: a.length };
    }

    return {
      druhGroup: druhGroup,
      hladinaMista: hladinaMista,
      MIN_VZOREK: MIN_VZOREK,
      MEZ_POCHYBNA: MEZ_POCHYBNA,
      MEZ_SLEVA: MEZ_SLEVA,
      MEZ_ROZPTYL: MEZ_ROZPTYL,
      neduveryhodna: neduveryhodna,
      percentil: percentil,
      odhad: odhad,
      medianTypu: medianTypu
    };
  }

  function blokOdhadu(model, d, volby) {
    volby = volby || {};
    var fmt = volby.fmt || function (x) { return String(x); };
    var esc = volby.esc || function (x) { return x; };
    if (!model) return '';
    var o = model.odhad(d);

    if (!o || !o.podleVelikosti || o.podOdhadem < 15) return '';
    var kde = kdeText(o.uroven, o.kde);
    var coJe = d.type === 'drazba' ? 'Vyvolávací cena' : (d.type === 'exekuce' ? 'Uváděná cena' : 'Nabídková cena');
    return '<div class="md-odhad' + (volby.trida || '') + '">' +
      '<div class="mo-radek"><span class="mo-k">' + coJe + '</span><span class="mo-v">' + fmt(d.price) + ' Kč</span></div>' +
      '<div class="mo-radek mo-hlavni"><span class="mo-k">Obvyklá cena ' + kde + '</span><span class="mo-v">' + fmt(o.castka) + ' Kč</span></div>' +

      '<div class="mo-rozdil' + (o.pochybna || o.nejisty || o.podil ? ' mo-pochybna' : '') + '"><b>o ' + o.podOdhadem + ' % níž</b>' +
        (o.podil ? ' — jenže inzerát mluví o <b>spoluvlastnickém podílu</b>: v ceně je jen zlomek pozemku, kdežto výměra je celá. S celými pozemky se to srovnat nedá.'
          : o.pochybna ? ' — takový rozdíl bývá spoluvlastnický podíl nebo jiná výměra, ověřte si to'
          : o.nejisty ? ' — ale ceny podobných pozemků ' + kde + ' se mezi sebou liší násobky, takže tohle číslo je jen hrubé vodítko'
                    : ', tedy zhruba o ' + fmt(o.rozdil) + '\u00a0Kč') + '</div>' +
      '<p class="mo-pozn">Spočítáno z mediánu <b>' + fmt(Math.round(o.zaM2)) + ' Kč/m²</b> — z <b>' +
      o.vzorek + '</b> nabídek stejného druhu (' + esc(o.druh.toLowerCase()) + ') a podobné výměry ' + kde + '. ' +
      'Jsou to ceny <b>nabídkové</b>, ne za kolik se pozemky opravdu prodaly' +
      (volby.dlouhy ? ' — to ve veřejných zdrojích není. Berte to jako vodítko, ne jako odhad znalce.' : '.') +
      '</p></div>';
  }

  var DOST_NABIDEK = 25;

  root.PK_CENY = { DOST_NABIDEK: DOST_NABIDEK,
    postav: postav, druhGroup: druhGroup, median: median, OKRES_KRAJ: OKRES_KRAJ,
    kdeText: kdeText, blokOdhadu: blokOdhadu,
    zlomekPodilu: zlomekPodilu, vymeraVCene: vymeraVCene, zaMetr: zaMetr, zaMetrPopis: zaMetrPopis };
}(typeof window !== 'undefined' ? window : globalThis));
