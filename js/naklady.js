/* Kalkulačka nákladů při koupi pozemku.
 *
 * PROČ VZNIKLA. Stránka „Kolik stojí koupě pozemku" měla devět nadpisů
 * textu a ani jedno vstupní pole: vyjmenovala vklad do katastru, advokáta,
 * úschovu, provizi i geometrický plán — a sečíst si to musel člověk sám na
 * papíře. Přitom je to jediná otázka, kvůli které na takovou stránku jde:
 * „kolik mě to bude stát dohromady".
 *
 * ODKUD JSOU ČÍSLA. Z téhle stránky, ne odjinud a ne z hlavy. Co text
 * říká přesně (vklad do katastru řádově 2 000 Kč, daň z nabytí zrušena),
 * je předvyplněné. Co text říká jen řádově („jednotky tisíc", „tisíce až
 * vyšší tisíce"), je UPRAVITELNÉ POLE s výchozí hodnotou uprostřed toho
 * rozsahu — ne tvrzení webu, ale odhad, který si člověk přepíše. Proto
 * taky výsledek nikdy neříká „bude to stát", ale „počítejte zhruba s".
 *
 * Nic se neodesílá: počítá se v prohlížeči a nikam to nechodí.
 */
(function () {
  'use strict';
  var box = document.getElementById('naklady');
  if (!box) return;

  function cislo(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var v = parseFloat(String(el.value).replace(/\s/g, '').replace(',', '.'));
    return isFinite(v) && v > 0 ? v : 0;
  }
  function zapnuto(id) { var el = document.getElementById(id); return !!(el && el.checked); }
  function fmt(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function spocti() {
    var cena = cislo('nak-cena');
    var polozky = [];

    /* Vklad do katastru je jediná pevná částka, kterou text uvádí číslem.
       Platí se za návrh, ne za pozemek — dva pozemky v jedné smlouvě
       znamenají jeden návrh. */
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
      /* Věta pod tabulkou není ozdoba: bez ní by součet vypadal jako cena,
         kterou web zaručuje. Zaručená je z něj jediná položka. */
      + '<p class="nak-pozn">Počítejte <b>zhruba</b> s touhle částkou. Pevně daný je jen '
      + 'správní poplatek za vklad; zbytek jsou odhady, které si tady můžete přepsat. '
      + 'Daň z nabytí se neplatí — byla zrušena.</p>';
  }

  box.addEventListener('input', spocti);
  box.addEventListener('change', spocti);

  /* Předvyplnění cenou z odkazu: ze stránky pozemku se sem dá přijít
     s ?cena=…, ať člověk nepřepisuje číslo, které web už zná. */
  try {
    var c = new URLSearchParams(location.search).get('cena');
    if (c && /^\d{3,12}$/.test(c)) {
      var el = document.getElementById('nak-cena');
      if (el) el.value = c;
    }
  } catch (e) {}

  spocti();
})();
