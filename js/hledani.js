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

  /* --- Našeptávač: nabídni obec dřív, než ji člověk dopíše -----------
   *
   * V nabídce je přes tisíc obcí a nikdo neví, jak se která jmenuje v
   * katastru („Dobšice u Znojma", „Police nad Metují"). Kdo napíše jen
   * kus, má dostat na výběr — i s tím, kolik tam čeho je, ať nekliká
   * naslepo na místo, kde je jediný pozemek.
   *
   * Pořadí: celý název > začátek názvu > kdekoli uvnitř; při shodě
   * rozhoduje počet nabídek. Okres se nabízí taky, ale až za obcemi —
   * kdo píše „Beroun", myslí spíš město než okres.
   */
  function navrhy(data, q, limit) {
    var toks = tokeny(q);
    if (!toks.length || norm(q).length < 2) return [];
    var max = limit || 6, prvni = toks[0], i, k;
    var obce = {}, okresy = {};
    for (i = 0; i < (data || []).length; i++) {
      var d = data[i];
      var obec = norm(d.place), okres = norm(d.okres);
      if (!obec && !okres) continue;
      var kde = obec + ' ' + okres, sedi = true;
      for (k = 0; k < toks.length; k++) if (kde.indexOf(toks[k]) === -1) { sedi = false; break; }
      if (!sedi) continue;
      if (obec && obec.indexOf(prvni) >= 0) {
        var kl = obec + '|' + okres;
        if (!obce[kl]) obce[kl] = { text: d.place, okres: d.okres, pocet: 0, typ: 'obec',
          poradi: obec === prvni ? 0 : (obec.indexOf(prvni) === 0 ? 1 : 2) };
        obce[kl].pocet++;
      } else if (okres && okres.indexOf(prvni) >= 0) {
        if (!okresy[okres]) okresy[okres] = { text: d.okres, okres: null, pocet: 0, typ: 'okres',
          poradi: okres === prvni ? 0 : (okres.indexOf(prvni) === 0 ? 1 : 2) };
        okresy[okres].pocet++;
      }
    }
    var ven = [];
    for (var a in obce) ven.push(obce[a]);
    ven.sort(function (x, y) { return x.poradi - y.poradi || y.pocet - x.pocet || x.text.localeCompare(y.text, 'cs'); });
    var okr = [];
    for (var b in okresy) okr.push(okresy[b]);
    okr.sort(function (x, y) { return x.poradi - y.poradi || y.pocet - x.pocet; });
    /* Okres si drží pár míst i tehdy, když se obcí najde spousta. Jinak
       by „kol" nabídlo šest vesniček a okres Kolín — tedy to, co člověk
       nejspíš hledá — by se do nabídky vůbec nevešel. */
    var proOkresy = Math.min(okr.length, max > 3 ? 2 : 1);
    return ven.slice(0, max - proOkresy).concat(okr.slice(0, proOkresy)).slice(0, max);
  }

  /* --- Překlep: „mysleli jste…?" -------------------------------------
   *
   * Když se nenajde nic, bývá na vině jedno přehozené písmeno. Hledá se
   * nejbližší název obce podle počtu úprav (Levenshtein) — ale jen mezi
   * názvy podobné délky a jen do vzdálenosti dvou úprav, aby web nikdy
   * nenabízel něco, co s napsaným slovem nemá nic společného.
   */
  function vzdalenost(a, b, strop) {
    if (Math.abs(a.length - b.length) > strop) return strop + 1;
    var pred = new Array(b.length + 1), akt = new Array(b.length + 1), i, j;
    for (j = 0; j <= b.length; j++) pred[j] = j;
    for (i = 1; i <= a.length; i++) {
      akt[0] = i;
      var nejmensi = akt[0];
      for (j = 1; j <= b.length; j++) {
        var cena = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        akt[j] = Math.min(akt[j - 1] + 1, pred[j] + 1, pred[j - 1] + cena);
        if (akt[j] < nejmensi) nejmensi = akt[j];
      }
      if (nejmensi > strop) return strop + 1;   // dál už to nemá cenu počítat
      for (j = 0; j <= b.length; j++) pred[j] = akt[j];
    }
    return pred[b.length];
  }
  function mysleliJste(data, q) {
    var n = norm(q);
    if (n.length < 3 || n.indexOf(' ') >= 0) return null;   // víceslovné dotazy neopravujeme
    var strop = n.length <= 4 ? 1 : 2;
    var nej = null, videno = {}, i, jm;
    for (i = 0; i < (data || []).length; i++) {
      var d = data[i];
      if (!d) continue;
      // Okresy patří do nabídky taky: „Kolim" má vést na okres Kolín,
      // ne na náhodnou vesnici, která je shodou okolností taky na dvě
      // úpravy daleko.
      for (var c = 0; c < 2; c++) {
        jm = c ? d.okres : d.place;
        if (!jm) continue;
        var nj = norm(jm);
        if (!nj || videno[nj]) continue;
        videno[nj] = 1;
        if (nj === n) return null;               // trefa, není co opravovat
        // První písmeno musí sedět: jinak to není překlep, ale jiné slovo.
        if (nj.charAt(0) !== n.charAt(0)) continue;
        var v = vzdalenost(n, nj, strop);
        if (v <= strop && (!nej || v < nej.v)) nej = { v: v, text: jm };
      }
    }
    return nej ? nej.text : null;
  }

  return { norm: norm, tokeny: tokeny, seno: seno, vyhovuje: vyhovuje, median: median, bod: bod,
    misto: misto, navrhy: navrhy, vzdalenost: vzdalenost, mysleliJste: mysleliJste };
});
