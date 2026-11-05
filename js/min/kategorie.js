(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./druh.js'));
  else root.PKKategorie = factory(root.PKDruh);
})(typeof self !== 'undefined' ? self : this, function (PKDruh) {
  'use strict';

  function dejDruh() {
    if (!PKDruh || typeof PKDruh.srovnej !== 'function' || typeof PKDruh.bezJmen !== 'function') {
      throw new Error('kategorie z textu potřebují js/druh.js (srovnej, bezJmen) — načtěte ho dřív');
    }
    return PKDruh;
  }

  var KATEGORIE = [
    { klic: 'pozemek', jmeno: 'Pozemek', mnozne: 'Pozemky', ikona: 'druh', mera: 'pozemek' },
    { klic: 'dum', jmeno: 'Dům', mnozne: 'Domy', ikona: 'dum', mera: 'obe' },
    { klic: 'byt', jmeno: 'Byt', mnozne: 'Byty', ikona: 'budova', mera: 'podlahova' },
    { klic: 'chata', jmeno: 'Chata', mnozne: 'Chaty', ikona: 'dum', mera: 'obe' },
    { klic: 'farma', jmeno: 'Farma', mnozne: 'Farmy', ikona: 'dum', mera: 'obe' },
    { klic: 'areal', jmeno: 'Areál', mnozne: 'Areály', ikona: 'budova', mera: 'obe' },
    { klic: 'komercni', jmeno: 'Komerční objekt', mnozne: 'Komerční objekty',
      ikona: 'budova', mera: 'obe' },
    { klic: 'garaz', jmeno: 'Garáž', mnozne: 'Garáže', ikona: 'budova', mera: 'podlahova' },

    { klic: 'jine', jmeno: 'Jiná nemovitost', mnozne: 'Jiné nemovitosti',
      ikona: 'budova', mera: 'zadna' },
  ];

  var PODLE_KLICE = {};
  for (var i = 0; i < KATEGORIE.length; i++) PODLE_KLICE[KATEGORIE[i].klic] = KATEGORIE[i];

  var VYCHOZI = 'pozemek';

  var PRAVIDLA = [

    { kat: 'byt',
      re: /\bbyt[uyei]?\b|\bbytem\b|\bbytov\w* jednotk\w*\b|\bgarsonk\w*\b/g,
      poMimo: /^\s*(?:ov\w*\s+)?dom\w*\b/ },

    { kat: 'dum',
      re: /\bdum\b|\bdom[uy]\b|\bdomem\b|\bdome\b|\bdomek\b|\bdomku\b|\bdomky\b|\brodinn\w* dom\w*\b|\bbytov\w* dom\w*\b|\bvil[ayu]\b|\bvilou\b|\bchalup\w*\b|\bnovostavb\w* dom\w*\b/g,

      predMimo: /\b(?:zahradni|zahradkarsk\w*|drevostavb\w*|unimo|montovan\w*)\s+$/,
      poMimo: /^\s*na narad[ií]\b/ },
    { kat: 'chata',
      re: /\bchat[ayu]\b|\bchatou\b|\bchatk\w*\b|\brekreacni\w* objekt\w*\b|\bsrub\w*\b/g },

    { kat: 'areal',
      re: /\bareal\w*\b|\bkomplex\w*\b|\bbyval\w* kasarn\w*\b/g },
    { kat: 'farma',
      re: /\bfarm[ayu]\b|\bfarmou\b|\bstatek\b|\bstatku\b|\busedlost\w*\b|\bhospodarsk\w* dvur\b|\bkravin\w*\b|\bstodol\w*\b/g },

    { kat: 'komercni',
      re: /\bkomercni\w*\b|\bkancelar\w*\b|\bobchodni\w* prostor\w*\b|\bvyrobni\w* hal\w*\b|\bsklad\b|\bsklady\b|\bskladu\b|\bskladov\w*\b|\bprovozovn\w*\b|\brestaurac\w*\b|\bpenzion\w*\b|\bhotel\w*\b|\bubytovn\w*\b|\bubytovaci\w* zarizen\w*\b|\brekreacni\w* zarizen\w*\b|\bnebytov\w* prostor\w*\b/g },

    { kat: 'garaz',
      re: /\b(?:prodej|drazb[ayu]|aukc[eiy]|nabidk[ayu]|prodam)\s+(?:\w+\s+){0,2}garaz\w*\b|^\s*garaz\w*\b|\bgarazov\w* stani\b/g },

    { kat: 'byt', re: /\b\d\s*\+\s*(?:kk|1)\b/g },

    { kat: 'pozemek',
      re: /\bpozem(?:ek|ku|ky|em|cich|kem)\b|\bparcel\w*\b/g },
  ];

  var OKOLI = /(?:\bu|\bku|vedle|poblize?|poblizu|nedaleko|blizko|okraji|okraje|na kraji|smerem k|smerem na|vyhledem na|vyhled na|pohled na|obklopen\w*|lemovan\w*|sousedi s|sousedici s|prilehl\w*|navazuje na|kousek od|cestou k|cestou do|prijezd k|za)\s+$/;

  var ZAPOR = /\b(?:bez|neni|nejsou|nelze|nesmi|nedovoluje|zakaz\w*|mimo|nevhodn\w*|krome)\s+$/;

  var DOMENA = /\b[a-z0-9][a-z0-9-]*\.(?:cz|com|eu|sk|net|org|info|gov)\b/g;
  function bezDomen(t) {
    return String(t == null ? '' : t).replace(DOMENA, ' ');
  }

  function platny(t, od, doo, p) {
    var pred = t.slice(0, od);
    var po = t.slice(doo);
    if (OKOLI.test(pred)) return false;
    if (ZAPOR.test(pred)) return false;
    if (p.predMimo && p.predMimo.test(pred)) return false;
    if (p.poMimo && p.poMimo.test(po)) return false;
    return true;
  }

  function zTextu(text, jmenaMist) {
    var D = dejDruh();
    var t = D.bezJmen(bezDomen(D.srovnej(text)), jmenaMist);
    if (!t) return null;
    for (var i = 0; i < PRAVIDLA.length; i++) {
      var p = PRAVIDLA[i];
      p.re.lastIndex = 0;
      var m;
      while ((m = p.re.exec(t)) !== null) {
        if (platny(t, m.index, m.index + m[0].length, p)) { p.re.lastIndex = 0; return p.kat; }
        if (m.index === p.re.lastIndex) p.re.lastIndex++;
      }
    }
    return null;
  }

  function jmeno(k) {
    var z = PODLE_KLICE[k || VYCHOZI];
    return z ? z.jmeno : 'Nemovitost';
  }
  function mnozne(k) {
    var z = PODLE_KLICE[k || VYCHOZI];
    return z ? z.mnozne : 'Nemovitosti';
  }
  function ikona(k) {
    var z = PODLE_KLICE[k || VYCHOZI];
    return z ? z.ikona : 'druh';
  }

  function mera(k) {
    var z = PODLE_KLICE[k || VYCHOZI];
    return z ? z.mera : 'zadna';
  }

  function klicePodleDat(nabidky) {
    var videne = {};
    var pole = nabidky || [];
    for (var i = 0; i < pole.length; i++) videne[klic(pole[i] && pole[i].kat)] = true;
    return KATEGORIE.map(function (z) { return z.klic; })
      .filter(function (k) { return videne[k]; });
  }
  var SLOVA_POZEMEK = ['pozemek', 'pozemky', 'pozemků'];
  var SLOVA_NEMOVITOST = ['nemovitost', 'nemovitosti', 'nemovitostí'];

  function slovaPoctu(nabidky) {
    return vsePozemkove(klicePodleDat(nabidky)) ? SLOVA_POZEMEK : SLOVA_NEMOVITOST;
  }

  function vsePozemkove(klice) {
    var k = klice || [];
    return k.length < 2 && (k.length === 0 || k[0] === 'pozemek');
  }

  function jePozemkova(k) {
    return mera(k) === 'pozemek';
  }

  function klic(hodnota) {
    var h = String(hodnota == null ? '' : hodnota);
    return PODLE_KLICE[h] ? h : VYCHOZI;
  }

  function nadpisKategorie(o) {
    var k = klic(o && o.kat);
    return jePozemkova(k) ? null : jmeno(k);
  }

  function popisVymery(o) {
    return mera(klic(o && o.kat)) === 'podlahova' ? 'podlahová plocha' : '';
  }

  return {
    KATEGORIE: KATEGORIE,
    KLICE: KATEGORIE.map(function (z) { return z.klic; }),
    PRAVIDLA: PRAVIDLA,
    bezDomen: bezDomen,
    VYCHOZI: VYCHOZI,
    zTextu: zTextu,
    jmeno: jmeno,
    mnozne: mnozne,
    ikona: ikona,
    mera: mera,
    jePozemkova: jePozemkova,
    klicePodleDat: klicePodleDat,
    vsePozemkove: vsePozemkove,
    slovaPoctu: slovaPoctu,
    nadpisKategorie: nadpisKategorie,
    popisVymery: popisVymery,
    klic: klic,
  };
});
