(function (global) {
  'use strict';

  var REKLAMNI = /^(utm_[a-z_]+|fbclid|gclid|mtm_[a-z_]+|ref|source|from)$/i;

  function normalizujOdkaz(url) {
    var s = String(url == null ? '' : url).trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    var u;
    try { u = new URL(s); } catch (e) { return ''; }
    var host = u.hostname.toLowerCase().replace(/^www\./, '');
    var cesta = u.pathname.replace(/\/+$/, '').toLowerCase();
    var dotazy = [];
    try {
      u.searchParams.forEach(function (v, k) { if (!REKLAMNI.test(k)) dotazy.push(k.toLowerCase() + '=' + v.toLowerCase()); });
    } catch (e) {}
    dotazy.sort();
    return host + cesta + (dotazy.length ? '?' + dotazy.join('&') : '');
  }

  function najdiVsePodleOdkazu(url, data) {
    var hledany = normalizujOdkaz(url);
    var ven = [];
    if (!hledany || !data || !data.length) return ven;
    for (var i = 0; i < data.length; i++) {
      if (data[i] && data[i].url && normalizujOdkaz(data[i].url) === hledany) ven.push(data[i]);
    }
    return ven;
  }

  function najdiPodleOdkazu(url, data) {
    var v = najdiVsePodleOdkazu(url, data);
    return v.length ? v[0] : null;
  }

  var DRUH_NA_VOLBU = [
    [/stavebn|zastav/i, 'Stavební'],
    [/orná|orna/i, 'Orná půda'],
    [/les/i, 'Les'],
    [/zahrad/i, 'Zahrada'],
    [/travní|travni|louk|pastvin/i, 'Louka / pastvina'],
    [/ostatní plocha|ostatni plocha|vinice|sad|vodní|vodni|nádvoří|nadvori/i, 'Ostatní'],
  ];
  function volbaDruhu(druh) {
    var d = String(druh == null ? '' : druh);
    if (!d) return null;
    for (var i = 0; i < DRUH_NA_VOLBU.length; i++) {
      if (DRUH_NA_VOLBU[i][0].test(d)) return DRUH_NA_VOLBU[i][1];
    }
    return null;
  }

  var POLE = [
    { id: 'p-obec', z: 'place', nazev: 'obec' },
    { id: 'p-okres', z: 'okres', nazev: 'okres' },
    { id: 'p-vymera', z: 'area', nazev: 'výměru' },
    { id: 'p-cena', z: 'price', nazev: 'cenu' },
    { id: 'p-parcela', z: 'parcel', nazev: 'parcelní číslo' },
  ];

  function shodnaHodnota(nabidky, pole) {
    var prvni = null, mam = false;
    for (var i = 0; i < nabidky.length; i++) {
      var v = nabidky[i][pole];
      if (v == null || v === '' || v === '—') return null;
      var t = String(v);
      if (!mam) { prvni = t; mam = true; }
      else if (t !== prvni) return null;
    }
    return mam ? prvni : null;
  }

  function coDoplnit(nabidka) {
    var ven = { hodnoty: {}, nazvy: [], druh: null, site: [], pocet: 0, rozdilne: [] };
    var nabidky = Array.isArray(nabidka) ? nabidka.filter(Boolean) : (nabidka ? [nabidka] : []);
    if (!nabidky.length) return ven;
    ven.pocet = nabidky.length;
    POLE.forEach(function (p) {
      var v = shodnaHodnota(nabidky, p.z);
      if (v == null) {

        if (nabidky.length > 1) {
          var ruzne = {};
          nabidky.forEach(function (d) { var x = d[p.z]; if (x != null && x !== '' && x !== '—') ruzne[String(x)] = 1; });
          if (Object.keys(ruzne).length > 1) ven.rozdilne.push(p.nazev);
        }
        return;
      }
      ven.hodnoty[p.id] = v;
      ven.nazvy.push(p.nazev);
    });
    var druhy = {};
    nabidky.forEach(function (d) { var x = volbaDruhu(d.druh); if (x) druhy[x] = 1; });
    var jmenaDruhu = Object.keys(druhy);
    if (jmenaDruhu.length === 1) { ven.druh = jmenaDruhu[0]; ven.nazvy.push('druh pozemku'); }
    else if (jmenaDruhu.length > 1) ven.rozdilne.push('druh pozemku');

    var spolecne = null;
    nabidky.forEach(function (d) {
      var site = (d.site || []).slice();
      if (spolecne === null) { spolecne = site; return; }
      spolecne = spolecne.filter(function (k) { return site.indexOf(k) !== -1; });
    });
    if (spolecne && spolecne.length) {
      ven.site = spolecne;
      ven.nazvy.push('sítě uvedené v inzerátu');
    }
    return ven;
  }

  function hlaska(co) {
    if (!co) return '';

    var uvod = '';
    if (co.pocet > 1) {
      uvod = 'Tenhle odkaz vede na ' + (co.pocet === 1 ? '1 pozemek' : co.pocet < 5 ? co.pocet + ' pozemky' : co.pocet + ' pozemků') +
        ' v jedné dražbě, takže doplňujeme jen to, co mají společné. ';
    }
    if (!co.nazvy.length) {
      return uvod ? uvod + 'Údaje se u nich rozcházejí, vyplňte je prosím podle svého pozemku.' : '';
    }
    var n = co.nazvy.slice();
    var posledni = n.pop();
    var veta = uvod + 'Doplnili jsme ' + (n.length ? n.join(', ') + ' a ' + posledni : posledni) + '.';
    if (co.rozdilne.length) {
      var r = co.rozdilne.slice();
      var rp = r.pop();
      var vyjmenovane = (r.length ? r.join(', ') + ' a ' + rp : rp);

      veta += ' ' + vyjmenovane.charAt(0).toUpperCase() + vyjmenovane.slice(1) +
        (r.length ? ' se u nich rozcházejí' : ' se u nich rozchází') +
        ' — doplňte prosím podle svého pozemku.';
    }
    return veta + ' Zkontrolujte to a připište popis — ten za vás vymýšlet nebudeme.';
  }

  global.PKPredvyplneni = {
    normalizujOdkaz: normalizujOdkaz,
    volbaDruhu: volbaDruhu,
    najdiPodleOdkazu: najdiPodleOdkazu,
    najdiVsePodleOdkazu: najdiVsePodleOdkazu,
    coDoplnit: coDoplnit,
    hlaska: hlaska,
  };
})(typeof window !== 'undefined' ? window : globalThis);
