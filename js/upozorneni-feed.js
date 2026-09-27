/* Centrum upozornění — sestavení seznamu z toho, co web už ví.
 *
 * Proč vlastní soubor a proč vůbec: odznak s číslem řekne jen „něco je".
 * Teprve seznam řekne CO, OD KOHO a PROČ — a podle návodů na navrhování
 * upozornění to musí jít přečíst zhruba za dvě vteřiny. Tohle je ta část,
 * která z čísel dělá věty.
 *
 * Nic nového se nikam neukládá. Upozornění se skládají z věcí, které web
 * stejně načítá: z vláken chatu (my_threads) a z uložených hledání
 * (my_searches) porovnaných s pozemky. Díky tomu nepotřebuje nic v databázi
 * a nemůže se rozejít s tím, co ukazují stránky Zprávy a Hlídání.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./hlidani-logika.js'));
  else root.PKFeed = factory(root.PKHlidani);
})(typeof self !== 'undefined' ? self : this, function (HL) {
  'use strict';

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
    /* Do čtyřiadvaceti hodin se počítají HODINY, i když už je po
       půlnoci: „před 3 hodinami" je pro čerstvou věc užitečnější než
       „včera", které znělo, jako by to leželo celý den. Který den to
       bylo, říká nadpis skupiny — ten se řídí kalendářem. */
    if (r < DEN) return 'před ' + cislovka(Math.floor(r / 3600000), ['hodinou', 'hodinami', 'hodinami']);
    var dnu = dnuZpet(t, ted);
    if (dnu <= 1) return 'včera';
    if (dnu < 7) return 'před ' + cislovka(dnu, ['dnem', 'dny', 'dny']);
    var d = new Date(t);
    return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear();
  }

  // Seskupení podle času. Upozornění se čtou shora dolů a člověk potřebuje
  // hned vidět, kde končí „dnes" a začíná „to už jsem viděl".
  function seskupPodleCasu(polozky, ted) {
    ted = ted || Date.now();
    // První koš je pro to, u čeho datum neznáme. Datum nese až robot
    // (first_seen v data/opportunities.json) a starší záznamy ho nemají.
    // Hodit je pod nadpis „Starší" by bylo tvrzení, které nemáme čím
    // podložit — a znělo by to, jako by je uživatel už dávno minul.
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
      /* Taky podle kalendáře, ne podle uplynulých hodin — pod nadpisem
         „Dnes" nemá stát něco z včerejšího večera jen proto, že od té
         doby neuplynulo čtyřiadvacet hodin. Nadpis tvrdí den. */
      var dnu = dnuZpet(t, ted);
      if (dnu <= 0) kose[1].polozky.push(p);
      else if (dnu === 1) kose[2].polozky.push(p);
      else if (dnu < 7) kose[3].polozky.push(p);
      else kose[4].polozky.push(p);
    });
    return kose.filter(function (k) { return k.polozky.length; });
  }

  /* ---------- jednotlivá upozornění ---------- */

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

  // U hlídání nestačí počet: člověk chce vidět, CO přibylo, jinak musí na
  // mapu a hledat to sám. Ukazují se první tři a zbytek se dopočítá.
  var UKAZKA = 3;

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
      if (!nove.length) return;

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
            klic: HL.keyOf(d)
          };
        }),
        dalsich: Math.max(0, nove.length - UKAZKA),
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
    });
    return out;
  }

  /* ---------- celý seznam ---------- */

  function sestav(vstup) {
    vstup = vstup || {};
    var vse = zeZprav(vstup.vlakna).concat(zeHlidani(vstup.hledani, vstup.data));
    // Nejnovější nahoře; co nemá čas, jde dospodu (ne nahoru — jinak by se
    // nedatovaný pozemek tvářil jako to nejčerstvější, co uživatel má).
    vse.sort(function (a, b) {
      var ta = a.cas ? new Date(a.cas).getTime() : -Infinity;
      var tb = b.cas ? new Date(b.cas).getTime() : -Infinity;
      return tb - ta;
    });
    return vse;
  }

  function pocty(seznam) {
    var z = 0, p = 0;
    (seznam || []).forEach(function (u) {
      if (u.druh === 'zprava') z += u.pocet | 0; else p += u.pocet | 0;
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
