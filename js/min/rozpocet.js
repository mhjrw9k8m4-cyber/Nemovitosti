(function () {
  'use strict';

  var MAX_OKRESU = 12;
  var data = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  function tvarNabidka(n) {
    if (n === 1) return 'nabídka';
    if (n >= 2 && n <= 4) return 'nabídky';
    return 'nabídek';
  }
  function tvarOkres(n) {
    if (n === 1) return 'okrese';
    return 'okresech';
  }

  function zadani() {
    function cislo(id) {
      var el = document.getElementById(id);
      if (!el) return null;
      var v = String(el.value || '').replace(/[\s ]/g, '').replace(',', '.');
      if (!v) return null;
      var n = Number(v);
      return isFinite(n) && n > 0 ? n : null;
    }
    var d = document.getElementById('rz-druh');
    return {
      rozpocet: cislo('rz-rozpocet'),
      odVymery: cislo('rz-od'),
      doVymery: cislo('rz-do'),
      druh: d && d.value !== '' ? Number(d.value) : null,
    };
  }

  function vyber(rez, z) {
    var ven = [];
    if (!rez || !rez.n) return ven;
    for (var i = 0; i < rez.n.length; i++) {
      var r = rez.n[i];
      if (z.druh != null && r[1] !== z.druh) continue;
      if (z.odVymery != null && r[3] < z.odVymery) continue;
      if (z.doVymery != null && r[3] > z.doVymery) continue;
      ven.push(r);
    }
    return ven;
  }

  function podleRozpoctu(vybrane, rozpocet) {
    var do_ = [], nad = [];
    for (var i = 0; i < vybrane.length; i++) {
      (rozpocet == null || vybrane[i][2] <= rozpocet ? do_ : nad).push(vybrane[i]);
    }
    return { do: do_, nad: nad };
  }

  function poOkresech(rez, radky) {
    var m = {};
    for (var i = 0; i < radky.length; i++) {
      var o = radky[i][0];
      if (!m[o]) m[o] = { o: o, pocet: 0, nejlevnejsi: Infinity };
      m[o].pocet++;
      if (radky[i][2] < m[o].nejlevnejsi) m[o].nejlevnejsi = radky[i][2];
    }
    var pole = [];
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) pole.push(m[k]);

    pole.sort(function (a, b) {
      return b.pocet - a.pocet || a.nejlevnejsi - b.nejlevnejsi
        || String(rez.okresy[a.o]).localeCompare(String(rez.okresy[b.o]), 'cs');
    });
    return pole;
  }

  function radekOkresu(rez, x) {
    var jmeno = esc(rez.okresy[x.o]);
    var soubor = rez.soubory && rez.soubory[x.o];
    var kde = soubor ? '<a class="rz-okres" href="' + esc(soubor) + '">' + jmeno + '</a>'
      : '<span class="rz-okres">' + jmeno + '</span>';
    return '<li class="rz-radek">' + kde
      + '<b class="rz-pocet">' + x.pocet + '</b>'
      + '<span class="rz-detail">od ' + fmt(x.nejlevnejsi) + ' Kč</span></li>';
  }

  function vykresli() {
    var cil = document.getElementById('rz-vysledek');
    if (!cil) return;
    if (!data) { cil.innerHTML = '<p class="rz-pozn">Načítám nabídky…</p>'; return; }
    var z = zadani();
    if (z.rozpocet == null) {
      cil.innerHTML = '<p class="rz-pozn">Napište rozpočet a hned uvidíte, kde se za něj dá koupit.</p>';
      return;
    }
    if (z.odVymery != null && z.doVymery != null && z.odVymery > z.doVymery) {
      cil.innerHTML = '<p class="rz-pozn">Výměra „od" je větší než „do" — prohoďte je.</p>';
      return;
    }

    var vybrane = vyber(data, z);
    var del = podleRozpoctu(vybrane, z.rozpocet);

    if (!del.do.length) {

      if (!vybrane.length) {
        cil.innerHTML = '<p class="rz-nic">Takový pozemek teď v nabídce není — ani dráž.'
          + ' Zkuste povolit větší rozsah výměry nebo jiný druh.</p>';
        return;
      }
      var nej = Infinity;
      for (var i = 0; i < vybrane.length; i++) if (vybrane[i][2] < nej) nej = vybrane[i][2];
      cil.innerHTML = '<p class="rz-nic">Do ' + fmt(z.rozpocet) + ' Kč se teď nevejde nic.'
        + ' Nejlevnější pozemek, který jinak odpovídá, stojí <b>' + fmt(nej) + ' Kč</b>'
        + ' — chybí vám ' + fmt(nej - z.rozpocet) + ' Kč.</p>';
      return;
    }

    var okresy = poOkresech(data, del.do);
    var vypsat = okresy.slice(0, MAX_OKRESU);
    var zbytek = okresy.length - vypsat.length;
    var html = '<p class="rz-shrnuti">Do <b>' + fmt(z.rozpocet) + ' Kč</b> se vejde <b>'
      + fmt(del.do.length) + ' ' + tvarNabidka(del.do.length) + '</b> v '
      + fmt(okresy.length) + ' ' + tvarOkres(okresy.length) + '.</p>'
      + '<ol class="rz-seznam">' + vypsat.map(function (x) { return radekOkresu(data, x); }).join('') + '</ol>';
    if (zbytek > 0) {
      html += '<p class="rz-pozn">a dalších ' + fmt(zbytek) + ' '
        + (zbytek === 1 ? 'okres' : tvarOkres(zbytek)) + ' s menším počtem.</p>';
    }
    cil.innerHTML = html;
  }

  function nacti() {
    var url = 'data/rozpocet.json';
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      data = j;
      naplnDruhy();
      vykresli();
    }).catch(function () {
      var cil = document.getElementById('rz-vysledek');

      if (cil) cil.innerHTML = '<p class="rz-pozn">Nabídky se nepodařilo načíst. Zkuste stránku obnovit.</p>';
    });
  }

  function naplnDruhy() {
    var sel = document.getElementById('rz-druh');
    if (!sel || !data || !data.druhy || sel.options.length > 1) return;
    for (var i = 0; i < data.druhy.length; i++) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = data.druhy[i];
      sel.appendChild(o);
    }
  }

  function sjednotCislo(el) {
    var pred = el.value.slice(0, el.selectionStart == null ? el.value.length : el.selectionStart);
    var cislicPred = pred.replace(/\D/g, '').length;
    var cislice = el.value.replace(/\D/g, '');
    if (!cislice) { el.value = ''; return; }
    var novy = cislice.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    el.value = novy;
    var i = 0, vid = 0;
    while (i < novy.length && vid < cislicPred) { if (/\d/.test(novy[i])) vid++; i++; }
    try { el.setSelectionRange(i, i); } catch (e) {   }
  }

  function start() {
    var rozp = document.getElementById('rz-rozpocet');
    if (rozp) rozp.addEventListener('input', function () { sjednotCislo(rozp); });
    var pole = ['rz-rozpocet', 'rz-od', 'rz-do', 'rz-druh'];
    for (var i = 0; i < pole.length; i++) {
      var el = document.getElementById(pole[i]);
      if (el) { el.addEventListener('input', vykresli); el.addEventListener('change', vykresli); }
    }
    nacti();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { vyber: vyber, podleRozpoctu: podleRozpoctu, poOkresech: poOkresech,
      tvarNabidka: tvarNabidka, tvarOkres: tvarOkres, MAX_OKRESU: MAX_OKRESU };
    return;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
