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

  /** Všechny nabídky, na které ten odkaz vede. */
  /* Vrací POLE, ne jednu nabídku. Jedna dražba totiž může mít víc
     pozemkových celků a každý je u nás vlastní záznam se stejnou adresou:
     v dnešních datech takhle sedí sedm odkazů, každý na dva pozemky —
     a u okdrazby.cz/drazba/27824 jsou to dokonce dvě různé obce (Velké
     Opatovice a Bezděčí u Velkých Opatovic). Kdo bral první nalezenou,
     předvyplnil prodávajícímu cizí obec a tvrdil mu, že to doplnil
     správně. */
  function najdiVsePodleOdkazu(url, data) {
    var hledany = normalizujOdkaz(url);
    var ven = [];
    if (!hledany || !data || !data.length) return ven;
    for (var i = 0; i < data.length; i++) {
      if (data[i] && data[i].url && normalizujOdkaz(data[i].url) === hledany) ven.push(data[i]);
    }
    return ven;
  }

  /** Jedna nabídka podle odkazu — pro případ, kdy stačí vědět, že tam je. */
  function najdiPodleOdkazu(url, data) {
    var v = najdiVsePodleOdkazu(url, data);
    return v.length ? v[0] : null;
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

  /* Jedna hodnota, na které se všechny nalezené nabídky shodnou — nebo nic.
     Když se rozcházejí, není z čeho vybírat: hádat jednu z nich znamená
     napsat prodávajícímu do formuláře cizí údaj. */
  function shodnaHodnota(nabidky, pole) {
    var prvni = null, mam = false;
    for (var i = 0; i < nabidky.length; i++) {
      var v = nabidky[i][pole];
      if (v == null || v === '' || v === '—') return null;   // chybí u některé → nedoplňujeme
      var t = String(v);
      if (!mam) { prvni = t; mam = true; }
      else if (t !== prvni) return null;                      // rozcházejí se
    }
    return mam ? prvni : null;
  }

  /** Hodnoty k doplnění — bez sahání do dokumentu, ať se to dá vyzkoušet. */
  /* Bere jednu nabídku i pole nabídek. U víc nabídek doplní jen to, na čem
     se shodnou, a zbytek pojmenuje v `rozdilne`, ať se o tom dá říct. */
  function coDoplnit(nabidka) {
    var ven = { hodnoty: {}, nazvy: [], druh: null, site: [], pocet: 0, rozdilne: [] };
    var nabidky = Array.isArray(nabidka) ? nabidka.filter(Boolean) : (nabidka ? [nabidka] : []);
    if (!nabidky.length) return ven;
    ven.pocet = nabidky.length;
    POLE.forEach(function (p) {
      var v = shodnaHodnota(nabidky, p.z);
      if (v == null) {
        // Chybějící údaj není rozpor — mlčet se o něm má jen tehdy, když ho
        // nemá nikdo. Když se liší, prodávající musí vědět, co dopsat.
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
    /* Co robot vyčetl z popisu (elektřina, voda, cesta…). Zaškrtne se to
       jako návrh — prodávající to vidí a může odškrtnout. U víc pozemků jen
       to, co je u všech: síť u jednoho z nich neznamená síť u toho druhého. */
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

  /** Věta pro člověka: co se doplnilo. */
  function hlaska(co) {
    if (!co) return '';
    /* Odkaz na víc pozemků se musí říct. Bez toho by člověk viděl vyplněnou
       obec a věřil jí, i když jsme si jednu z dvou vybrali my. */
    var uvod = '';
    if (co.pocet > 1) {
      uvod = 'Tenhle odkaz vede na ' + (co.pocet < 5 ? co.pocet + ' pozemky' : co.pocet + ' pozemků') +
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
      // Nová věta má začít velkým písmenem, i když ta slova jsou názvy políček.
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
