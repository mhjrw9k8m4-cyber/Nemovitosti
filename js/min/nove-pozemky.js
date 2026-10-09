(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(function () { return require('./hlidani-logika.js'); });

  else root.PKFeed = factory(function () { return root.PKHlidani; });
})(typeof self !== 'undefined' ? self : this, function (pravidla) {
  'use strict';

  var HL = new Proxy({}, { get: function (_, jm) { return pravidla()[jm]; } });

  var DEN = 86400000;

  function mnozne(n, tvary) {
    n = Math.abs(n | 0);
    if (n === 1) return tvary[0];
    if (n >= 2 && n <= 4) return tvary[1];
    return tvary[2];
  }
  function cislovka(n, tvary) { return n + ' ' + mnozne(n, tvary); }

  function cena(n) {
    if (!n || n <= 0) return 'cena neuvedena';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';
  }
  function vymera(n) {
    if (!n || n <= 0) return '';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' m²';
  }

  var UKAZKA = 5;

  function zeHlidani(hledani, data) {
    var out = [];
    (hledani || []).forEach(function (s) {

      var nove = HL.noveProHledani(s, data);

      if (nove.length) {
        out.push({
        druh: 'pozemky',
        id: 'h:' + (s.id || s.label || ''),
        hledaniId: s.id,
        cas: nove[0] && nove[0].first_seen ? nove[0].first_seen + 'T12:00:00Z' : null,
        nove: true,
        pocet: nove.length,
        titulek: cislovka(nove.length, ['nový pozemek', 'nové pozemky', 'nových pozemků']),
        misto: 'Hlídání „' + (s.label || (s.okres || 'celá ČR')) + '"',
        polozky: nove.slice(0, UKAZKA).map(function (d) {
          return {
            popis: [d.place, vymera(d.area), cena(d.price)].filter(Boolean).join(' · '),
            druh: d.druh || '',
            typ: d.type || '',
            klic: HL.keyOf(d),

            odkaz: (typeof d.lat === 'number' && typeof d.lng === 'number')
              ? 'pozemek.html?p=' + encodeURIComponent([d.place || '', d.parcel || '', d.okres || '',
                  d.lat.toFixed(3), d.lng.toFixed(3)].join('|')) + '&ll=' + d.lat + ',' + d.lng

                  + (isFinite(d.area) ? '&v=' + Math.round(d.area) : '')
                  + (isFinite(d.price) ? '&c=' + Math.round(d.price) : '')
              : ''
          };
        }),
        dalsich: Math.max(0, nove.length - UKAZKA),

        noveKlice: nove.map(HL.keyOf),

        vsechnyKlice: HL.kliceProHledani(s, data),
        odkaz: 'index.html?' + (s.okres ? 'q=' + encodeURIComponent(s.okres) + '&' : '') +
               (s.druh ? 'druh=' + encodeURIComponent(s.druh) + '&' : '') +
               (s.max_price ? 'maxc=' + s.max_price + '&' : '') +
               (s.min_area ? 'mina=' + s.min_area + '&' : '') + '#mapa',
        odkazPopis: 'Zobrazit na mapě'
      });
      }

      var zmen = HL.zmeneneProHledani(s, data);
      if (zmen.length) {
        var dolu = zmen.filter(function (x) { return x.pozemek.price < x.staraCena; }).length;
        var nahoru = zmen.length - dolu;
        var titulek;
        if (!nahoru) titulek = cislovka(dolu, ['pozemek zlevnil', 'pozemky zlevnily', 'pozemků zlevnilo']);
        else if (!dolu) titulek = cislovka(nahoru, ['pozemek zdražil', 'pozemky zdražily', 'pozemků zdražilo']);
        else titulek = cislovka(zmen.length, ['pozemek změnil cenu', 'pozemky změnily cenu', 'pozemků změnilo cenu']);
        out.push({
          druh: 'pozemky',
          zmena: true,
          id: 'c:' + (s.id || s.label || ''),
          hledaniId: s.id,
          cas: zmen[0].pozemek.first_seen ? zmen[0].pozemek.first_seen + 'T12:00:00Z' : null,
          nove: true,
          pocet: zmen.length,
          titulek: titulek,
          misto: 'Hlídání „' + (s.label || (s.okres || 'celá ČR')) + '"',
          polozky: zmen.slice(0, UKAZKA).map(function (x) {
            return {
              popis: [x.pozemek.place, cena(x.staraCena) + ' → ' + cena(x.pozemek.price)].filter(Boolean).join(' · '),
              druh: x.pozemek.druh || '',
              typ: x.pozemek.type || '',
              klic: HL.keyOf(x.pozemek)
            };
          }),
          dalsich: Math.max(0, zmen.length - UKAZKA),
          noveKlice: zmen.map(function (x) { return HL.keyOf(x.pozemek); }),
          vsechnyKlice: HL.kliceProHledani(s, data),
          odkaz: 'index.html?' + (s.okres ? 'q=' + encodeURIComponent(s.okres) + '&' : '') + '#mapa',
          odkazPopis: 'Zobrazit na mapě'
        });
      }
    });
    return out;
  }

  return {
    mnozne: mnozne, cislovka: cislovka, cena: cena, vymera: vymera,
    zeHlidani: zeHlidani, UKAZKA: UKAZKA
  };
});
