(function () {
  'use strict';
  var box = document.getElementById('hypo');
  if (!box) return;

  function cislo(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var v = parseFloat(String(el.value).replace(/\s/g, '').replace(',', '.'));
    return isFinite(v) && v > 0 ? v : 0;
  }
  function fmt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  function splatka(jistina, rocniPct, roky) {
    var n = Math.round(roky * 12);
    if (!(jistina > 0) || !(n > 0)) return 0;
    var i = rocniPct / 100 / 12;
    if (i <= 0) return jistina / n;
    var q = Math.pow(1 + i, n);
    return jistina * i * q / (q - 1);
  }

  function spocti() {
    var cena = cislo('hypo-cena');
    var vlastni = cislo('hypo-vlastni');
    var urok = cislo('hypo-urok');
    var roky = cislo('hypo-roky');
    var out = document.getElementById('hypo-vysledek');

    if (!cena) {
      out.innerHTML = '<p class="hypo-prazdno">Zadejte cenu pozemku a dopočítá se zbytek.</p>';
      return;
    }
    var pujcka = Math.max(0, cena - vlastni);
    var ltv = cena > 0 ? (pujcka / cena) * 100 : 0;
    var mes = splatka(pujcka, urok, roky);
    var zaplaceno = mes * Math.round(roky * 12);
    var preplatek = Math.max(0, zaplaceno - pujcka);

    var radky =
      '<tr><th scope="row">Vlastní peníze<span>akontace</span></th><td>' + fmt(vlastni) + ' Kč</td></tr>' +
      '<tr><th scope="row">Půjčíte si<span>' + (ltv ? ltv.toFixed(0) + ' % z ceny (LTV)' : '') + '</span></th><td>' + fmt(pujcka) + ' Kč</td></tr>' +
      (pujcka && roky
        ? '<tr class="hypo-mes"><th scope="row">Měsíční splátka<span>' + (urok ? urok + ' % p. a., ' + roky + ' let' : roky + ' let bez úroku') + '</span></th><td>' + fmt(mes) + ' Kč</td></tr>'
          + '<tr><th scope="row">Zaplatíte navíc na úrocích<span>za celou dobu</span></th><td>' + fmt(preplatek) + ' Kč</td></tr>'
        : '');

    out.innerHTML = '<table class="nak-tab"><tbody>' + radky + '</tbody></table>'

      + '<p class="nak-pozn">Tohle je výpočet z vašich čísel, ne nabídka. '
      + '<b>Kolik vám banka opravdu půjčí</b>, závisí na druhu pozemku, územním plánu, '
      + 'přístupové cestě a sítích — u pozemků bývá LTV nižší než u domů a zemědělskou '
      + 'půdu banky financují nerady. Úrok i LTV si ověřte přímo u bank.</p>';
  }

  box.addEventListener('input', spocti);
  box.addEventListener('change', spocti);

  try {
    var c = new URLSearchParams(location.search).get('cena');
    if (c && /^\d{3,12}$/.test(c)) {
      var el = document.getElementById('hypo-cena');
      if (el) el.value = c;
    }
  } catch (e) {}

  spocti();
})();
