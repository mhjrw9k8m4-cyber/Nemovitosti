/* Hledání v nabídce: co člověk napíše, to musí najít.
 *
 * Problém, který to řeší: shoda se hledala jako jeden podřetězec v textu
 * „obec okres parcela", jen převedený na malá písmena. Tím pádem:
 *   • „rican" nenašlo Říčany, „usti" nenašlo Ústí — a háčky na telefonu
 *     píše málokdo. Z 1040 obcí v nabídce jich 732 má diakritiku a ani
 *     jedna z nich se bez háčků nenašla.
 *   • „Beroun Zdice" nenašlo nic, protože v datech stojí „Zdice Beroun".
 *     Na pořadí slov přitom nikdo nemyslí.
 *   • Dvě mezery navíc (překlep, kopie z katastru) shodu rozbily.
 *   • Druh pozemku se neprohledával vůbec, takže „beroun orná" = nic.
 *
 * Jak to funguje: dotaz i prohledávaný text projdou stejným srovnáním
 * (bez diakritiky, malá písmena, jedna mezera) a dotaz se rozpadne na
 * slova. Vyhoví záznam, ve kterém se najdou VŠECHNA slova — na pořadí
 * nezáleží. Každé slovo navíc hledání zužuje, nikdy nerozšiřuje, takže
 * delší dotaz nikdy nevrátí víc výsledků než kratší.
 *
 * Proč podřetězec a ne celá slova: „zdic" má najít Zdice a „lesn" Lesní
 * pozemek — lidé píší začátky slov a v půlce přestanou.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKHledani = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Jednotné srovnání: bez diakritiky, malá písmena, jedna mezera.
     NFD rozloží písmeno na základ + znaménko a znaménko se zahodí.
     Pomlčka se počítá za mezeru, takže „Plzeň-sever" a „plzen sever" je
     totéž. Musí to platit na OBOU stranách: dokud se pomlčka srovnávala
     jen v datech a ne v dotazu, název okresu opsaný přesně tak, jak ho
     web ukazuje, nenašel nic. */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[-\u2010-\u2015]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Dotaz na slova. Prázdný dotaz = žádná slova = neomezuje nic. */
  function tokeny(q) {
    var n = norm(q);
    return n ? n.split(' ') : [];
  }

  /* Text, ve kterém se hledá. Výsledek se schová do záznamu — filtruje se
     při každém úhozu přes dva tisíce nabídek a normalizovat je pokaždé
     znovu je zbytečná práce. */
  function seno(d) {
    if (!d) return '';
    if (typeof d.__seno === 'string') return d.__seno;
    var s = norm([d.place, d.okres, d.parcel, d.druh].join(' '));
    try { d.__seno = s; } catch (e) { /* zmrazený záznam — jen se nic neuloží */ }
    return s;
  }

  /* Vyhovuje záznam? Musí sedět všechna slova dotazu. */
  function vyhovuje(d, toks) {
    if (!toks || !toks.length) return true;
    var s = seno(d);
    for (var i = 0; i < toks.length; i++) if (s.indexOf(toks[i]) === -1) return false;
    return true;
  }

  /* --- Kde to je: obec podle názvu, jen z našich vlastních dat ---------
   *
   * Dřív se vzal PRVNÍ pozemek, jehož název obce dotaz obsahoval, a mapa
   * se vystředila na něj. Dvě potíže:
   *   • Stejný název má u nás 30 obcí, které jsou od sebe až 309 km
   *     (Slatina je na Klatovsku, Novojičínsku i v Brně). Která z nich to
   *     bude, rozhodovalo pořadí v datovém souboru — tedy náhoda. A protože
   *     se od toho bodu počítá „pozemky v okolí", byl pak špatně celý výpis.
   *   • Střed byl jeden konkrétní pozemek, klidně na okraji katastru.
   *
   * Teď: dotaz se rozpadne na slova, takže „slatina klatovy" vybere tu
   * správnou. Ze shod vyhraje ta obec, kde je nabídek nejvíc (u zbytku jde
   * nejspíš o shodu jména), a střed je MEDIÁN jejích souřadnic — jeden
   * pozemek se špatnými souřadnicemi tak střed nestrhne.
   */
  /* Souřadnice, která se dá použít. Pozor: NaN i Infinity JSOU „number",
     takže samotné typeof nestačí — a stačilo by, aby robot jednou zapsal
     rozbité číslo, a mapa by skočila do nekonečna. Našlo se to náhodným
     zatěžkáváním (scripts/test-nahodne.mjs), ne v datech. */
  function bod(la, ln) {
    return typeof la === 'number' && typeof ln === 'number'
      && isFinite(la) && isFinite(ln)
      && la >= -90 && la <= 90 && ln >= -180 && ln <= 180;
  }
  function median(a) {
    var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
  }
  function misto(data, q) {
    var toks = tokeny(q);
    if (!toks.length || norm(q).length < 2) return null;
    var skupiny = {}, vsechnyLat = [], vsechnyLng = [], i, k;
    for (i = 0; i < (data || []).length; i++) {
      var d = data[i];
      if (!bod(d.lat, d.lng)) continue;
      var obec = norm(d.place), okres = norm(d.okres), kde = obec + ' ' + okres;
      var vse = true;
      for (k = 0; k < toks.length; k++) if (kde.indexOf(toks[k]) === -1) { vse = false; break; }
      if (!vse) continue;
      /* Jak dobře to sedí: celý název obce > začátek názvu > kdekoli.
         Bez toho by „Police" vyhrála „Police nad Metují" jen počtem. */
      var prvni = toks[0];
      var kvalita = obec === prvni ? 3 : (obec.indexOf(prvni) === 0 ? 2 : (obec.indexOf(prvni) >= 0 ? 1 : 0));
      var g = skupiny[kde] || (skupiny[kde] = { lat: [], lng: [], kvalita: kvalita, place: d.place, okres: d.okres });
      if (kvalita > g.kvalita) g.kvalita = kvalita;
      g.lat.push(d.lat); g.lng.push(d.lng);
      vsechnyLat.push(d.lat); vsechnyLng.push(d.lng);
    }
    var nej = null;
    for (var kde2 in skupiny) {
      var g2 = skupiny[kde2];
      if (!nej || g2.kvalita > nej.kvalita
        || (g2.kvalita === nej.kvalita && g2.lat.length > nej.lat.length)) nej = g2;
    }
    if (!nej) return null;
    /* Když se netrefil žádný název obce, sedí dotaz nejspíš na okres nebo
       na část názvu napříč obcemi. Pak je poctivější střed všech shod než
       náhodně vybraná vesnice uvnitř. */
    if (!nej.kvalita) {
      return { lat: median(vsechnyLat), lng: median(vsechnyLng), place: null, okres: nej.okres, pocet: vsechnyLat.length };
    }
    return { lat: median(nej.lat), lng: median(nej.lng), place: nej.place, okres: nej.okres, pocet: nej.lat.length };
  }

  return { norm: norm, tokeny: tokeny, seno: seno, vyhovuje: vyhovuje, median: median, bod: bod, misto: misto };
});
