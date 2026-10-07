/* Nové pozemky z uložených hledání — z čísel udělá věty.
 *
 * Byla to část centra upozornění; to se na přání majitele odebralo celé
 * a tenhle kus zůstal, protože dělá něco jiného: ví, které pozemky jsou
 * u daného hledání nové, a umí je vypsat s obcí, výměrou a cenou. Používá
 * ho stránka hlídání, která je vypisuje rovnou v kartě hledání.
 *
 * Nic se nikam neukládá. Skládá se to z toho, co web stejně načítá —
 * z uložených hledání (my_searches) porovnaných s pozemky — takže se to
 * nemůže rozejít s tím, co ukazuje mapa.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(function () { return require('./hlidani-logika.js'); });
  /* PRAVIDLA HLÍDÁNÍ SE HLEDAJÍ AŽ PŘI VOLÁNÍ, ne při načtení. Dřív se
     brala rovnou (factory(root.PKHlidani)), takže stačilo, aby se
     tenhle soubor načetl o řádek dřív než js/hlidani-logika.js, a HL
     bylo navždycky undefined. Na stránce hlídání to tak doopravdy je
     a skript padal na „Cannot read properties of undefined". Pořadí
     je srovnané, ale spoléhat se na něj znamená čekat, až ho někdo
     zase prohodí. */
  else root.PKFeed = factory(function () { return root.PKHlidani; });
})(typeof self !== 'undefined' ? self : this, function (pravidla) {
  'use strict';

  var HL = new Proxy({}, { get: function (_, jm) { return pravidla()[jm]; } });

  var DEN = 86400000;

  /* ---------- čeština ---------- */

  // 1 → první tvar, 2–4 → druhý, jinak třetí. Bez tohohle by v upozorněních
  // stálo „5 nové pozemky", což vypadá jako strojový překlad.
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

  /* ---------- čas ---------- */

  // „před 5 min" se čte rychleji než „19. 9. 2026 4:42". U starších věcí
  // je to naopak — tam chce člověk datum.
  /* Kolik KALENDÁŘNÍCH dnů zpátky. Ne uplynulých čtyřiadvacetihodin —
     „včera" je den, ne časový úsek. Dokud se to počítalo z uplynulého
     času, dostalo označení „včera" všechno mezi 24 a 48 hodinami: ve
     dvě ráno v pondělí tedy i to, co přišlo v sobotu v poledne. */



  // U hlídání nestačí počet: člověk chce vidět, CO přibylo, jinak musí na
  // mapu a hledat to sám. Ukazují se první tři a zbytek se dopočítá.
  /* Kolik pozemků se u jednoho hledání vypíše. Tři stačily do řádku
     upozornění; v kartě hlídání, kde je na to místo, jich unese pět. */
  var UKAZKA = 5;

  function zeHlidani(hledani, data) {
    var out = [];
    (hledani || []).forEach(function (s) {
      /* Které pozemky jsou nové, počítá js/hlidani-logika.js — jedno
         místo pro celý web. Dřív si to tenhle soubor filtroval po svém
         a přehlédl, že tatáž nabídka bývá v datech dvakrát (jednou
         z každého zdroje): centrum hlásilo 1 970 nových pozemků,
         zatímco stránka hlídání i mapa jich ukazovaly 1 957 — a odznak
         přitom vedl právě na ně. Řazení od nejnovějšího je tam taky. */
      var nove = HL.noveProHledani(s, data);
      /* Dřív se tu při prázdném seznamu končilo. Teď se pod tímhle
         blokem řeší ještě změny cen, takže se jen přeskočí upozornění
         o nových — ne celé hlídání. */
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
            /* ADRESA VLASTNÍ STRÁNKY POZEMKU. Vypsané pozemky byly jen
               řádky textu: člověk se dozvěděl, že mu přibyly tři, i které
               to jsou — a otevřít si mohl leda celou mapu a hledat je mezi
               tečkami. Klíč HL.keyOf() na to nestačí, ten je jiný (slouží
               k poznání, co už bylo viděno), takže se adresa skládá tady,
               kde je celý pozemek po ruce. Týž tvar jako všude jinde na
               webu: pkey() v js/main.js, pkeyPlny() v js/pozemek.js. */
            odkaz: (typeof d.lat === 'number' && typeof d.lng === 'number')
              ? 'pozemek.html?p=' + encodeURIComponent([d.place || '', d.parcel || '', d.okres || '',
                  d.lat.toFixed(3), d.lng.toFixed(3)].join('|')) + '&ll=' + d.lat + ',' + d.lng
              : ''
          };
        }),
        dalsich: Math.max(0, nove.length - UKAZKA),
        /* Klíče NOVÝCH pozemků — kvůli součtu v hlavičce. Jeden pozemek
           může sedět na dvě hledání a pak je ve dvou upozorněních; jako
           dva pozemky by to byla lež. Nesmí se to plést s vsechnyKlice,
           které jdou na server a obsahují všechno, co na hledání sedí. */
        noveKlice: nove.map(HL.keyOf),
        /* VŠECHNY, které na hledání sedí — ne jen nové. Tímhle polem
           server celé seen_keys přepíše, takže poslat jen nové znamená
           o zbytek přijít: pak se dávno viděné pozemky vrátí jako nové.
           Podrobně v js/hlidani-logika.js u kliceProHledani(). */
        vsechnyKlice: HL.kliceProHledani(s, data),
        odkaz: 'index.html?' + (s.okres ? 'q=' + encodeURIComponent(s.okres) + '&' : '') +
               (s.druh ? 'druh=' + encodeURIComponent(s.druh) + '&' : '') +
               (s.max_price ? 'maxc=' + s.max_price + '&' : '') +
               (s.min_area ? 'mina=' + s.min_area + '&' : '') + '#mapa',
        odkazPopis: 'Zobrazit na mapě'
      });
      }

      /* ZMĚNA CENY je vlastní zpráva, ne „nový pozemek". Dřív se tak
         hlásila, protože klíč pozemku cenu obsahuje — a tím se zahodilo
         to nejzajímavější, co hlídání umí říct: že pozemek zlevnil.
         Druh zůstává „pozemky", aby ikona, filtr, součty i tlačítko
         „označit jako viděné" fungovaly stejně jako u nových. */
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


  /* Součty do hlavičky.
     Zprávy se sčítají — dvě nepřečtené zprávy jsou dvě zprávy.
     Pozemky NE: jeden pozemek může sedět na dvě uložená hledání a být
     tedy ve dvou upozorněních. Sečtením by z něj byly dva a hlavička by
     hlásila jiné číslo než odznak v menu, který pozemky počítá jednou
     (novychCelkem v js/hlidani-logika.js). Na dvou hledáních přes týž
     okres to dělalo 56 proti 28. Proto se tady pozemky spočítají přes
     klíče, tedy stejně jako na odznaku. */


  /* Ven jde jen to, co po odebrání upozornění někdo volá: skloňování
     (používá ho i hlídání pro „3 nové") a výpis nových pozemků.
     Zbytek — řazení podle času, upozornění ze zpráv, slučování a
     počítání druhů — patřil centru upozornění a šel s ním. */
  return {
    mnozne: mnozne, cislovka: cislovka, cena: cena, vymera: vymera,
    zeHlidani: zeHlidani, UKAZKA: UKAZKA
  };
});
