(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKSmlouva = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cislo(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (x == null) return null;
    var s = String(x).replace(/ /g, ' ').replace(/[\s.]/g, '').replace(/,-$/, '').replace(/,/, '.');
    if (!/^-?[0-9]+(\.[0-9]+)?$/.test(s)) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function mezery(n) {
    var s = String(Math.abs(Math.round(n)));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (i && (s.length - i) % 3 === 0) out += ' ';
      out += s.charAt(i);
    }
    return (n < 0 ? '−' : '') + out;
  }

  var JEDN = ['', 'jeden', 'dva', 'tři', 'čtyři', 'pět', 'šest', 'sedm', 'osm', 'devět'];
  var JEDN_Z = ['', 'jedna', 'dvě', 'tři', 'čtyři', 'pět', 'šest', 'sedm', 'osm', 'devět'];
  var JEDN_SLOZ = ['', 'jedna', 'dva', 'tři', 'čtyři', 'pět', 'šest', 'sedm', 'osm', 'devět'];
  var TEEN = ['deset', 'jedenáct', 'dvanáct', 'třináct', 'čtrnáct', 'patnáct',
              'šestnáct', 'sedmnáct', 'osmnáct', 'devatenáct'];
  var DES = ['', '', 'dvacet', 'třicet', 'čtyřicet', 'padesát', 'šedesát',
             'sedmdesát', 'osmdesát', 'devadesát'];
  var STO = ['', 'sto', 'dvě stě', 'tři sta', 'čtyři sta', 'pět set',
             'šest set', 'sedm set', 'osm set', 'devět set'];

  function trojice(n, rod) {
    if (n <= 0) return '';
    var d = [];
    var s = Math.floor(n / 100), z = n % 100;
    if (s) d.push(STO[s]);
    if (z >= 20) {
      var j = z % 10;
      d.push(DES[Math.floor(z / 10)]);
      if (j) d.push(JEDN_SLOZ[j]);
    } else if (z >= 10) {
      d.push(TEEN[z - 10]);
    } else if (z > 0) {

      d.push(s ? JEDN_SLOZ[z] : (rod === 'z' ? JEDN_Z : JEDN)[z]);
    }
    return d.join(' ');
  }

  var TVARY = {
    koruna: ['koruna česká', 'koruny české', 'korun českých'],
    tisic: ['tisíc', 'tisíce', 'tisíc'],
    milion: ['milion', 'miliony', 'milionů'],
    miliarda: ['miliarda', 'miliardy', 'miliard'],
  };
  function tvar(jmeno, n) {
    var t = TVARY[jmeno];
    return n === 1 ? t[0] : (n >= 2 && n <= 4 ? t[1] : t[2]);
  }

  var SKUPINY = [
    { del: 1000000000, jmeno: 'miliarda', rod: 'z' },
    { del: 1000000, jmeno: 'milion', rod: 'm' },
    { del: 1000, jmeno: 'tisic', rod: 'm' },
  ];

  function slovy(x) {
    var n = cislo(x);
    if (n == null || n < 0 || n !== Math.round(n)) return null;
    if (n === 0) return 'nula ' + TVARY.koruna[2];
    if (n >= 1000000000000) return null;
    var d = [], zbytek = n;
    for (var i = 0; i < SKUPINY.length; i++) {
      var g = SKUPINY[i], kolik = Math.floor(zbytek / g.del);
      if (!kolik) continue;
      zbytek -= kolik * g.del;

      var slovem = trojice(kolik, g.rod);
      if (kolik === 1 && g.jmeno === 'tisic' && !d.length) slovem = '';
      d.push((slovem ? slovem + ' ' : '') + tvar(g.jmeno, kolik));
    }
    if (zbytek) d.push(trojice(zbytek, 'z') + ' ' + tvar('koruna', zbytek));
    else d.push(TVARY.koruna[2]);
    return d.join(' ').replace(/ /g, ' ');
  }

  function castka(x) {
    var n = cislo(x);
    return n == null ? null : mezery(n) + ' Kč';
  }

  function oznaceniPozemku(p) {
    if (!p) return null;
    var parc = String(p.parcela == null ? '' : p.parcela).trim();
    var ku = String(p.katastr == null ? '' : p.katastr).trim();
    if (!parc || !ku) return null;
    var d = ['pozemek parc. č. ' + parc];
    if (p.druh) d.push('(' + String(p.druh).trim() + ')');
    var v = cislo(p.vymera);
    if (v) d.push('o výměře ' + mezery(v) + ' m²');
    d.push('v katastrálním území ' + ku);
    if (p.kodKatastru) d[d.length - 1] += ' (kód ' + String(p.kodKatastru).trim() + ')';
    if (p.obec) d.push('obec ' + String(p.obec).trim());
    if (p.lv) d.push('zapsaný na listu vlastnictví č. ' + String(p.lv).trim());
    return d.join(', ');
  }

  function osobaChybi(o, kdo, i, celkem) {
    var jm = celkem > 1 ? kdo + ' č. ' + (i + 1) : kdo;
    var v = [];
    if (!o || !String(o.jmeno || '').trim()) v.push({ pole: 'jmeno', zprava: jm + ': chybí jméno a příjmení.' });
    if (!o || !String(o.narozeni || '').trim()) v.push({ pole: 'narozeni', zprava: jm + ': chybí datum narození. Katastr potřebuje stranu rozpoznat; jen jméno nestačí, stejných jmen je v republice mnoho.' });
    if (!o || !String(o.adresa || '').trim()) v.push({ pole: 'adresa', zprava: jm + ': chybí adresa.' });
    return v;
  }

  function zkontroluj(d) {
    var v = [];
    var dd = d || {};
    var pr = dd.prodavajici || [], ku = dd.kupujici || [];
    if (!pr.length) v.push({ pole: 'prodavajici', zprava: 'Není uvedený ani jeden prodávající.' });
    if (!ku.length) v.push({ pole: 'kupujici', zprava: 'Není uvedený ani jeden kupující.' });
    pr.forEach(function (o, i) { v = v.concat(osobaChybi(o, 'Prodávající', i, pr.length)); });
    ku.forEach(function (o, i) { v = v.concat(osobaChybi(o, 'Kupující', i, ku.length)); });

    var p = dd.pozemek || {};
    if (!String(p.parcela || '').trim()) v.push({ pole: 'parcela', zprava: 'Chybí parcelní číslo.' });
    if (!String(p.katastr || '').trim()) {
      v.push({ pole: 'katastr', zprava: 'Chybí katastrální území. Bez něj není pozemek určený — parcelní číslo se v každém katastrálním území opakuje, takže by smlouva mohla znamenat kterýkoli z desítek pozemků se stejným číslem.' });
    }
    if (!String(p.lv || '').trim()) v.push({ pole: 'lv', zprava: 'Chybí číslo listu vlastnictví. Není nutné pro platnost, ale bez něj se podklad hůř ověřuje — najdete ho na nahlizenidokn.cuzk.cz.' });

    var c = cislo((dd.cena || {}).castka);
    if (c == null) v.push({ pole: 'cena', zprava: 'Chybí kupní cena.' });
    else if (c <= 0) v.push({ pole: 'cena', zprava: 'Kupní cena musí být víc než nula. Bezúplatný převod není kupní smlouva, ale darování — a to je jiná smlouva.' });

    var z = cislo((dd.cena || {}).zaloha);
    if (z != null && c != null && z > c) {
      v.push({ pole: 'zaloha', zprava: 'Záloha je vyšší než celá kupní cena (' + castka(z) + ' z ' + castka(c) + ').' });
    }
    var podil = String(p.podil || '').trim();
    if (podil && !/^[0-9]+\s*\/\s*[0-9]+$/.test(podil)) {
      v.push({ pole: 'podil', zprava: 'Podíl se píše zlomkem, například 1/2. Zapsáno je „' + podil + '".' });
    }
    return v;
  }

  function osoba(o) {
    var d = [String(o.jmeno || '').trim()];
    if (o.narozeni) d.push('nar. ' + String(o.narozeni).trim());
    if (o.adresa) d.push('bytem ' + String(o.adresa).trim());
    return d.join(', ');
  }

  function strany(list, jedn, mn) {
    return list.length > 1
      ? mn + ':\n' + list.map(function (o, i) { return '  ' + (i + 1) + ') ' + osoba(o); }).join('\n')
      : jedn + ': ' + osoba(list[0]);
  }

  var ZPUSOBY = {
    uschova: 'Kupní cena bude složena do advokátní nebo notářské úschovy a prodávajícímu vyplacena až po zápisu vlastnického práva kupujícího do katastru nemovitostí.',
    prevod: 'Kupní cena bude uhrazena bezhotovostním převodem na bankovní účet prodávajícího.',
    hotovost: 'Kupní cena bude uhrazena v hotovosti při podpisu této smlouvy.',
  };

  function smlouva(d) {
    var dd = d || {};
    var chyby = zkontroluj(dd);

    var podstatne = chyby.filter(function (x) { return x.pole !== 'lv' && x.pole !== 'podil'; });
    if (podstatne.length) return null;

    var pr = dd.prodavajici || [], ku = dd.kupujici || [];
    if (!pr.length || !ku.length) return null;
    var p = dd.pozemek || {}, c = dd.cena || {};
    var oz = oznaceniPozemku(p);
    var podil = String(p.podil || '').trim();
    var predmet = podil ? 'podíl o velikosti ' + podil + ' na nemovitosti: ' + oz : oz;
    var cena = cislo(c.castka);

    var t = [];
    t.push('PODKLAD PRO KUPNÍ SMLOUVU O PŘEVODU POZEMKU');
    t.push('');
    t.push('Tento text není hotová smlouva. Je to podklad, ve kterém jsou');
    t.push('všechny údaje na svém místě — projděte ho s advokátem nebo');
    t.push('notářem a nechte si ho upravit na svůj případ.');
    t.push('');
    t.push('I. Smluvní strany');
    t.push(strany(pr, 'Prodávající', 'Prodávající'));
    t.push('');
    t.push(strany(ku, 'Kupující', 'Kupující'));
    t.push('');
    t.push('II. Předmět smlouvy');
    t.push('Prodávající je vlastníkem nemovitosti: ' + oz + '.');
    t.push('Prodávající převádí ' + predmet + ' na kupujícího a kupující');
    t.push('tuto nemovitost do svého vlastnictví přijímá.');
    t.push('');
    t.push('III. Kupní cena');
    t.push('Kupní cena činí ' + castka(cena) + ' (slovy: ' + slovy(cena) + ').');
    var zal = cislo(c.zaloha);
    if (zal) t.push('Z toho záloha ' + castka(zal) + ' (slovy: ' + slovy(zal) + ').');
    t.push(ZPUSOBY[c.zpusob] || ZPUSOBY.uschova);
    t.push('');
    t.push('IV. Prohlášení prodávajícího');
    var st = dd.stav || {};
    var vady = [];
    if (st.zastava) vady.push('zástavní právo');
    if (st.bremeno) vady.push('věcné břemeno (služebnost)');
    if (st.najem) vady.push('nájem nebo pacht');
    if (vady.length) {
      t.push('Na nemovitosti je: ' + vady.join(', ') + '.');
      if (String(st.popisVad || '').trim()) t.push('Blíže: ' + String(st.popisVad).trim());
      t.push('Strany si ujednají, jak se s tím naloží — tohle je bod, kde');
      t.push('se podklad bez právníka dál nedostane.');
    } else {
      t.push('Prodávající prohlašuje, že na nemovitosti nejsou zástavní');
      t.push('práva, věcná břemena, nájem ani jiné právní vady, a že mu');
      t.push('nejsou známy vady, které by kupujícímu zatajil.');
      t.push('Ověřte si to sami na listu vlastnictví — prohlášení ve');
      t.push('smlouvě není totéž co zápis v katastru.');
    }
    t.push('');
    t.push('V. Vklad do katastru nemovitostí');
    t.push('Vlastnické právo přechází na kupujícího zápisem (vkladem) do');
    t.push('katastru nemovitostí. Do té doby kupující vlastníkem není, i');
    t.push('kdyby byla smlouva podepsaná a cena zaplacená.');
    t.push('Návrh na vklad se podává na formuláři, který vydává ČÚZK.');
    t.push('');
    t.push('VI. Závěrečná ustanovení');
    t.push('Smlouva se vyhotovuje v počtu potřebném pro strany a pro');
    t.push('katastrální úřad. Podpisy stran na vyhotovení určeném pro');
    t.push('katastrální úřad musí být úředně ověřené.');
    t.push('');
    t.push('V ................................ dne ........................');
    t.push('');
    pr.forEach(function (o) { t.push('....................................   ' + String(o.jmeno).trim()); });
    ku.forEach(function (o) { t.push('....................................   ' + String(o.jmeno).trim()); });
    return t.join('\n');
  }

  function navrhNaVklad(d) {
    if (!d) return null;
    var p = d.pozemek || {};
    var oz = oznaceniPozemku(p);
    if (!oz) return null;
    var r = [];
    r.push({ kolonka: 'Katastrální úřad pro', hodnota: p.urad ? String(p.urad).trim() : '— doplňte podle polohy pozemku' });
    r.push({ kolonka: 'Katastrální pracoviště', hodnota: p.pracoviste ? String(p.pracoviste).trim() : '— doplňte podle polohy pozemku' });
    r.push({ kolonka: 'Obec', hodnota: p.obec ? String(p.obec).trim() : '—' });
    r.push({ kolonka: 'Katastrální území', hodnota: String(p.katastr).trim() + (p.kodKatastru ? ' (kód ' + String(p.kodKatastru).trim() + ')' : '') });
    r.push({ kolonka: 'Parcela', hodnota: 'parc. č. ' + String(p.parcela).trim() + (cislo(p.vymera) ? ', výměra ' + mezery(cislo(p.vymera)) + ' m²' : '') });
    if (p.lv) r.push({ kolonka: 'List vlastnictví', hodnota: 'č. ' + String(p.lv).trim() });
    if (String(p.podil || '').trim()) r.push({ kolonka: 'Převáděný podíl', hodnota: String(p.podil).trim() });
    (d.prodavajici || []).forEach(function (o, i) {
      r.push({ kolonka: 'Účastník — převodce' + ((d.prodavajici.length > 1) ? ' ' + (i + 1) : ''), hodnota: osoba(o) });
    });
    (d.kupujici || []).forEach(function (o, i) {
      r.push({ kolonka: 'Účastník — nabyvatel' + ((d.kupujici.length > 1) ? ' ' + (i + 1) : ''), hodnota: osoba(o) });
    });
    r.push({ kolonka: 'Navrhovaný zápis', hodnota: 'vklad vlastnického práva ve prospěch nabyvatele' });
    r.push({ kolonka: 'Přílohy', hodnota: 'kupní smlouva s úředně ověřenými podpisy' });
    return r;
  }

  function kontrolniSeznam(d) {
    var dd = d || {}, p = dd.pozemek || {}, st = dd.stav || {};
    var s = [];
    s.push({ co: 'List vlastnictví v katastru', proc: 'Je prodávající opravdu vlastník? Nejsou na pozemku zástavy, břemena nebo exekuce? Nahlížení do katastru je zdarma.', kde: 'nahlizenidokn.cuzk.cz' });
    if (String(p.podil || '').trim()) {
      s.push({ co: 'Předkupní právo ostatních spoluvlastníků', proc: 'Kupujete podíl, ne celý pozemek. U spoluvlastnictví je to první věc, na kterou se naráží.' });
    }
    s.push({ co: 'Územní plán obce', proc: 'Co se na pozemku smí stavět, neurčuje inzerát ani jeho popis, ale územní plán obce.' });
    s.push({ co: 'Přístupová cesta', proc: 'Vede k pozemku veřejná cesta, nebo se jezdí přes cizí parcelu? Bez přístupu se nestaví a pozemek se těžko prodává dál.', kde: 'pristupova-cesta-pozemek.html' });
    s.push({ co: 'Třída ochrany zemědělské půdy', proc: 'U I. a II. třídy stát vynětí ze zemědělského půdního fondu povoluje jen výjimečně — na takovém poli se nestaví, i kdyby to územní plán dovoloval. Na stránce pozemku si zapněte vrstvu BPEJ.' });
    s.push({ co: 'Sítě na hranici pozemku', proc: 'Voda, elektřina, kanalizace. Přivedení zdaleka může být dražší než samotný pozemek.' });
    if (!st.zastava && !st.bremeno && !st.najem) {
      s.push({ co: 'Prohlášení o vadách proti skutečnosti', proc: 'V podkladu je prohlášení, že na pozemku nic není. Srovnejte ho s listem vlastnictví — prohlášení ve smlouvě není totéž co zápis v katastru.' });
    }
    s.push({ co: 'Úschova peněz', proc: 'Prodávající dostane cenu až po zápisu do katastru. Bez úschovy nese jedna ze stran celé riziko.' });
    s.push({ co: 'Úředně ověřené podpisy', proc: 'Bez nich katastrální úřad vklad nepovolí. Ověří je notář nebo Czech POINT.' });
    s.push({ co: 'Náklady kolem koupě', proc: 'Správní poplatek za vklad, advokát, úschova, případně geometrický plán.', kde: 'kolik-stoji-koupe-pozemku.html' });
    return s;
  }

  return {
    cislo: cislo, mezery: mezery, castka: castka, slovy: slovy, trojice: trojice, tvar: tvar,
    oznaceniPozemku: oznaceniPozemku, zkontroluj: zkontroluj,
    smlouva: smlouva, navrhNaVklad: navrhNaVklad, kontrolniSeznam: kontrolniSeznam,
  };
}));
