/* PŘEDVYPLNĚNÍ INZERÁTU Z ODKAZU.
 *
 * Kdo prodává pozemek, má ho skoro vždycky vypsaný ještě někde jinde —
 * a přepisovat obec, výměru, cenu a druh podruhé ručně je otrava, ve
 * které se navíc dělají chyby. Formulář má přitom políčko „odkaz na
 * inzerát" odjakživa; jen se do něj odkaz zapsal a nic se s ním nedělo.
 *
 * Nic se nestahuje. Nabídky z portálů, které procházíme (Bezrealitky,
 * Farmy.cz, SPÚ, dražební portály), MÁME UŽ U SEBE v datech — u každé
 * je uložená i její adresa. Odkaz se tedy jen najde v našich datech.
 * Je to okamžité, přesné a nepotřebuje to server ani cizí službu.
 * Když odkaz mezi našimi zdroji není, neděláme nic a řekneme to.
 *
 * Adresa se před porovnáním srovná do jednoho tvaru: lidé kopírují
 * odkazy s „www", s lomítkem na konci i s ocasem od reklamy
 * (?utm_source=…), a to všechno je tentýž inzerát. Dotaz se ale
 * nezahazuje celý — u Farmy.cz je číslo nabídky právě v něm
 * (nabidka_detail?nab=123), takže by se bez něj slily všechny.
 */
(function (global) {
  'use strict';

  // Ocasy od reklamy a proklikových statistik. Nejsou součástí adresy inzerátu.
  var REKLAMNI = /^(utm_[a-z_]+|fbclid|gclid|mtm_[a-z_]+|ref|source|from)$/i;

  /** Adresa srovnaná do tvaru, ve kterém se dají dvě podoby téhož porovnat. */
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

  /** Najde v našich datech nabídku, na kterou ten odkaz vede. */
  function najdiPodleOdkazu(url, data) {
    var hledany = normalizujOdkaz(url);
    if (!hledany || !data || !data.length) return null;
    for (var i = 0; i < data.length; i++) {
      if (data[i] && data[i].url && normalizujOdkaz(data[i].url) === hledany) return data[i];
    }
    return null;
  }

  /* Druh pozemku: katastr jich zná desítky, formulář nabízí šest.
     Bez převodu se do výběru nedostalo nic („lesní pozemek" se
     s volbou „Les" neshoduje) — a hláška přitom tvrdila, že druh
     doplnila. Tvrdit něco, co je na obrazovce vidět jinak, je horší
     než to nedoplnit vůbec. Co se nedá zařadit, se nechá na člověku. */
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

  /* Co z nalezené nabídky umíme do formuláře přenést. Popis ne: robot
     si ho neukládá (ukládá jen to, co z něj vyčetl), takže bychom ho
     museli vymyslet — a vymyšlený popis cizího pozemku je to poslední,
     co na inzerát patří. */
  var POLE = [
    { id: 'p-obec', z: 'place', nazev: 'obec' },
    { id: 'p-okres', z: 'okres', nazev: 'okres' },
    { id: 'p-vymera', z: 'area', nazev: 'výměru' },
    { id: 'p-cena', z: 'price', nazev: 'cenu' },
    { id: 'p-parcela', z: 'parcel', nazev: 'parcelní číslo' },
  ];

  /** Hodnoty k doplnění — bez sahání do dokumentu, ať se to dá vyzkoušet. */
  function coDoplnit(nabidka) {
    var ven = { hodnoty: {}, nazvy: [], druh: null, site: [] };
    if (!nabidka) return ven;
    POLE.forEach(function (p) {
      var v = nabidka[p.z];
      if (v == null || v === '' || v === '—') return;
      ven.hodnoty[p.id] = String(v);
      ven.nazvy.push(p.nazev);
    });
    var volba = volbaDruhu(nabidka.druh);
    if (volba) { ven.druh = volba; ven.nazvy.push('druh pozemku'); }
    /* Co robot vyčetl z popisu (elektřina, voda, cesta…). Zaškrtne se to
       jako návrh — prodávající to vidí a může odškrtnout. */
    if (nabidka.site && nabidka.site.length) {
      ven.site = nabidka.site.slice();
      ven.nazvy.push('sítě uvedené v inzerátu');
    }
    return ven;
  }

  /** Věta pro člověka: co se doplnilo. */
  function hlaska(co) {
    if (!co || !co.nazvy.length) return '';
    var n = co.nazvy.slice();
    var posledni = n.pop();
    return 'Doplnili jsme ' + (n.length ? n.join(', ') + ' a ' + posledni : posledni) +
      '. Zkontrolujte to a připište popis — ten za vás vymýšlet nebudeme.';
  }

  global.PKPredvyplneni = {
    normalizujOdkaz: normalizujOdkaz,
    volbaDruhu: volbaDruhu,
    najdiPodleOdkazu: najdiPodleOdkazu,
    coDoplnit: coDoplnit,
    hlaska: hlaska,
  };
})(typeof window !== 'undefined' ? window : globalThis);
