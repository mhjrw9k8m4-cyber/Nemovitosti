(function () {
  'use strict';
  var box = document.getElementById('naklady');
  if (!box) return;

  var MEZE = { 'nak-provize-pct': [0, 20] };

  function cislo(id) {
    var el = document.getElementById(id);
    if (!el) return 0;

    var v = parseFloat(String(el.value).replace(/[\s\u00a0]/g, '').replace(',', '.'));
    if (!isFinite(v) || v <= 0) return 0;
    var m = MEZE[id];
    if (m) { if (v < m[0]) v = m[0]; if (v > m[1]) v = m[1]; }
    return v;
  }
  function zapnuto(id) { var el = document.getElementById(id); return !!(el && el.checked); }
  function fmt(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function spocti() {
    var cena = cislo('nak-cena');
    var polozky = [];

    polozky.push({ k: 'Vklad do katastru', v: 2000, pozn: 'správní poplatek za návrh' });

    if (zapnuto('nak-advokat')) {
      polozky.push({ k: 'Smlouva od advokáta', v: cislo('nak-advokat-kc'), pozn: 'místo vzoru z internetu' });
    }
    if (zapnuto('nak-uschova')) {
      polozky.push({ k: 'Úschova peněz', v: cislo('nak-uschova-kc'), pozn: 'peníze dostane prodávající až po přepisu' });
    }
    if (zapnuto('nak-realitka')) {
      var pct = cislo('nak-provize-pct');
      polozky.push({ k: 'Provize realitní kanceláři', v: cena * pct / 100, pozn: pct + ' % z kupní ceny' });
    }
    if (zapnuto('nak-geoplan')) {
      polozky.push({ k: 'Geometrický plán', v: cislo('nak-geoplan-kc'), pozn: 'když se pozemek dělí nebo zaměřuje' });
    }
    if (zapnuto('nak-posudek')) {
      polozky.push({ k: 'Znalecký posudek', v: cislo('nak-posudek-kc'), pozn: 'často ho chce banka u hypotéky' });
    }

    var navic = polozky.reduce(function (a, p) { return a + p.v; }, 0);
    var radky = polozky.map(function (p) {
      return '<tr><th scope="row">' + p.k + '<span>' + p.pozn + '</span></th>'
        + '<td>' + fmt(p.v) + ' Kč</td></tr>';
    }).join('');

    var vysledek = document.getElementById('nak-vysledek');
    vysledek.innerHTML =
      '<table class="nak-tab"><tbody>' + radky
      + '<tr class="nak-mezi"><th scope="row">Náklady navíc</th><td>' + fmt(navic) + ' Kč</td></tr>'
      + (cena
        ? '<tr class="nak-celkem"><th scope="row">Cena pozemku a náklady dohromady</th><td>'
          + fmt(cena + navic) + ' Kč</td></tr>'
        : '')
      + '</tbody></table>'

      + '<p class="nak-pozn">Počítejte <b>zhruba</b> s touhle částkou. Pevně daný je jen '
      + 'správní poplatek za vklad; zbytek jsou odhady, které si tady můžete přepsat. '
      + 'Daň z nabytí se neplatí — byla zrušena.</p>';
  }

  box.addEventListener('input', spocti);
  box.addEventListener('change', spocti);

  box.addEventListener('focusout', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'text') return;
    if (!String(el.value).trim()) return;
    var v = cislo(el.id);
    if (el.id === 'nak-provize-pct') {

      el.value = String(v).replace('.', ',');
    } else {
      el.value = v ? fmt(v) : '';
    }
    spocti();
  });

  try {
    var c = new URLSearchParams(location.search).get('cena');
    if (c && /^\d{3,12}$/.test(c)) {
      var el = document.getElementById('nak-cena');
      if (el) el.value = fmt(+c);
    }
  } catch (e) {}

  ['nak-advokat-kc', 'nak-uschova-kc', 'nak-geoplan-kc', 'nak-posudek-kc', 'nak-cena']
    .forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || !el.value) return;
      var v = cislo(id);
      if (v) el.value = fmt(v);
    });

  spocti();
})();
