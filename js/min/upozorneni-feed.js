(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./hlidani-logika.js'));
  else root.PKFeed = factory(root.PKHlidani);
})(typeof self !== 'undefined' ? self : this, function (HL) {
  'use strict';

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

  function dnuZpet(t, ted) {
    var a = new Date(t), b = new Date(ted);
    var da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((db - da) / DEN);
  }
  function relativniCas(iso, ted) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return '';
    ted = ted || Date.now();
    var r = ted - t;
    if (r < 0) return 'právě teď';
    if (r < 60000) return 'právě teď';
    if (r < 3600000) return 'před ' + cislovka(Math.floor(r / 60000), ['minutou', 'minutami', 'minutami']);

    if (r < DEN) return 'před ' + cislovka(Math.floor(r / 3600000), ['hodinou', 'hodinami', 'hodinami']);
    var dnu = dnuZpet(t, ted);
    if (dnu <= 1) return 'včera';
    if (dnu < 7) return 'před ' + cislovka(dnu, ['dnem', 'dny', 'dny']);
    var d = new Date(t);
    return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear();
  }

  function seskupPodleCasu(polozky, ted) {
    ted = ted || Date.now();

    var kose = [
      { nadpis: 'Čeká na vás', polozky: [] },
      { nadpis: 'Dnes', polozky: [] },
      { nadpis: 'Včera', polozky: [] },
      { nadpis: 'Tento týden', polozky: [] },
      { nadpis: 'Starší', polozky: [] }
    ];
    (polozky || []).forEach(function (p) {
      var t = p.cas ? new Date(p.cas).getTime() : NaN;
      if (!isFinite(t) || !t) { kose[0].polozky.push(p); return; }

      var dnu = dnuZpet(t, ted);
      if (dnu <= 0) kose[1].polozky.push(p);
      else if (dnu === 1) kose[2].polozky.push(p);
      else if (dnu < 7) kose[3].polozky.push(p);
      else kose[4].polozky.push(p);
    });
    return kose.filter(function (k) { return k.polozky.length; });
  }

  function zeZprav(vlakna) {
    var out = [];
    (vlakna || []).forEach(function (t) {
      var n = t.unread | 0;
      if (n <= 0) return;
      out.push({
        druh: 'zprava',
        id: 'z:' + t.listing_id + ':' + t.buyer_id,
        cas: t.last_at || null,
        nove: true,
        pocet: n,
        titulek: t.is_owner
          ? cislovka(n, ['nová zpráva od zájemce', 'nové zprávy od zájemce', 'nových zpráv od zájemce'])
          : cislovka(n, ['nová zpráva od majitele', 'nové zprávy od majitele', 'nových zpráv od majitele']),
        misto: (t.place || 'Pozemek') + (t.okres ? ' · okr. ' + t.okres : ''),
        ukazka: (t.last_body || '').slice(0, 90),
        odkaz: 'zpravy.html?l=' + encodeURIComponent(t.listing_id) +
               '&b=' + encodeURIComponent(t.buyer_id) + '&o=' + (t.is_owner ? '1' : '0'),
        odkazPopis: 'Otevřít konverzaci'
      });
    });
    return out;
  }

  var UKAZKA = 3;

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

  function sestav(vstup) {
    vstup = vstup || {};
    var vse = zeZprav(vstup.vlakna).concat(zeHlidani(vstup.hledani, vstup.data));

    vse.sort(function (a, b) {
      var ta = a.cas ? new Date(a.cas).getTime() : -Infinity;
      var tb = b.cas ? new Date(b.cas).getTime() : -Infinity;
      return tb - ta;
    });
    return vse;
  }

  function pocty(seznam) {
    var z = 0, videne = {}, p = 0;
    (seznam || []).forEach(function (u) {
      if (u.druh === 'zprava') { z += u.pocet | 0; return; }
      var klice = u.noveKlice;
      if (klice && klice.length) {
        klice.forEach(function (k) { if (!videne[k]) { videne[k] = 1; p++; } });
      } else {
        p += u.pocet | 0;
      }
    });
    return { zpravy: z, pozemky: p, celkem: z + p };
  }

  function filtruj(seznam, druh) {
    if (!druh || druh === 'vse') return seznam || [];
    return (seznam || []).filter(function (u) { return u.druh === druh; });
  }

  return {
    mnozne: mnozne, cislovka: cislovka, cena: cena, vymera: vymera,
    relativniCas: relativniCas, seskupPodleCasu: seskupPodleCasu, dnuZpet: dnuZpet,
    zeZprav: zeZprav, zeHlidani: zeHlidani, sestav: sestav,
    pocty: pocty, filtruj: filtruj, UKAZKA: UKAZKA
  };
});
