/* Druh pozemku z volného textu inzerátu.
 *
 * Dřív to byl seznam kousků slov a první, který se v textu kdekoli
 * vyskytl, vyhrál — `t.includes('stavebn')`, `t.includes('lesa')`,
 * `t.includes('louk')`. Na volném textu inzerátu to znamená tři různé
 * chyby naráz:
 *
 * 1. KUS SLOVA. „nestavební pozemek" obsahuje „stavebn", takže se
 *    pozemek, na kterém se stavět NESMÍ, zapsal jako stavební. Totéž
 *    „nezastavěná plocha".
 * 2. OKOLÍ MÍSTO POZEMKU. „louka u lesa" je louka. „Pozemek nedaleko
 *    lesa", „s výhledem na les" — pořád to není lesní pozemek. Čeština
 *    dává tenhle vztah dopředu předložkou, takže se dá poznat.
 * 3. NÁZEV OBCE. U Bezrealitky a Sreality se do rozpoznávání posílal
 *    i název a adresa nabídky. V nabídce je deset obcí, které mají
 *    klíčové slovo přímo ve jméně: Louka, Loukov, Sadská, Zahradní,
 *    Lešany, Kostelec nad Černými lesy… Pozemek v Kostelci nad Černými
 *    lesy se tím stal lesním pozemkem.
 *
 * Pravidla jsou proto tady, ve sdíleném modulu, aby je web i robot četly
 * stejně a daly se zkoušet bez sítě — stejně jako js/vybaveni.js, které
 * tentýž problém řeší u sítí a příjezdu.
 *
 * CO NENÍ JISTÉ, SE NEHÁDÁ. Když se nic nepozná, vrátí se null a volající
 * si doplní obecné „pozemek". Zapsat špatný druh je horší než žádný:
 * podle druhu se filtruje, počítá obvyklá cena i staví statistiky okresů.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKDruh = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Bez diakritiky, a to i kvůli hranicím slov: \b v JavaScriptu zná jen
     anglickou abecedu, takže by se za „í" nikdy nechytla. Stejný důvod
     jako v js/vybaveni.js. */
  function srovnej(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ');
  }

  /* Slovo TĚSNĚ PŘED nálezem, po kterém druh popisuje OKOLÍ, ne pozemek.
     „louka u lesa", „vedle lesa", „s výhledem na les", „obklopeno lesy". */
  var OKOLI = /(?:\bu|\bku|vedle|poblize?|poblizu|nedaleko|blizko|okraji|okraje|na kraji|smerem k|smerem na|vyhledem na|vyhled na|pohled na|obklopen\w*|lemovan\w*|sousedi s|sousedici s|prilehl\w*|navazuje na|kousek od|cestou k|cestou do|prijezd k)\s+$/;

  /* Zápor před nálezem. Předponové „ne-" řešit nemusíme: hranice slova
     se do „nestavebni" nechytí sama od sebe. */
  var ZAPOR = /\b(?:bez|neni|nejsou|nelze|nesmi|nedovoluje|zakaz\w*|mimo|nevhodn\w*|krome)\s+$/;

  /* Pořadí = priorita, stejně jako dřív. Nejžádanější druhy napřed. */
  var PRAVIDLA = [
    { druh: 'stavební pozemek',
      re: /\bstavebni\w*\b|\bk vystavbe\b|\bpro vystavbu\b|\bzasitovan\w*\b|\burcen\w* k stavbe\b/g,
      /* „Stavební uzávěra" znamená pravý opak než stavební pozemek —
         a slovo stojí AŽ ZA nálezem, takže zápor dopředu na to nestačí. */
      poMimo: /^\s+(?:uzaver\w*|zakaz\w*|pozemk\w* v okoli)\b/ },
    { druh: 'lesní pozemek', re: /\blesni\w*\b|\bles\b|\blesa\b|\blesy\b|\blesu\b|\blesem\b|\bzalesnen\w*\b/g },
    { druh: 'vinice', re: /\bvinic\w*\b/g },
    { druh: 'ovocný sad', re: /\bovocn\w* sad\w*\b|\bsad\b|\bsadu\b|\bsady\b|\bsadem\b/g },
    /* Jen zahrada jako pozemek. „Zahradní domek", „zahradnictví" ani
       „zahradní nábytek" pozemek zahradou nedělají. */
    { druh: 'zahrada', re: /\bzahrad[ayeu]\b|\bzahradou\b|\bzahradami\b|\bzahradni parcel\w*\b|\bzahradkarsk\w* (?:osad|kolon)\w*\b/g },
    { druh: 'orná půda', re: /\born[aáyeou]\w*\b/g },
    { druh: 'trvalý travní porost', re: /\btrval\w* travn\w*\b|\btravn\w* porost\w*\b/g },
    { druh: 'louka', re: /\blouk[aiyou]\b|\bloukou\b|\bloukam\w*\b/g },
    { druh: 'pastvina', re: /\bpastvin\w*\b/g },
    { druh: 'ostatní plocha', re: /\bostatni ploch\w*\b/g },
    { druh: 'zemědělský pozemek', re: /\bzemedelsk\w*\b/g },
  ];

  /* Je nález opravdu o tomhle pozemku? */
  function platny(text, zac, kon, pravidlo) {
    var pred = text.slice(Math.max(0, zac - 40), zac);
    if (ZAPOR.test(pred)) return false;
    if (OKOLI.test(pred)) return false;
    if (pravidlo.poMimo && pravidlo.poMimo.test(text.slice(kon, kon + 40))) return false;
    return true;
  }

  /* Název místa z textu pryč, ať se nerozpoznává adresa místo pozemku.
     Nestačí adresu nepředávat: Bezrealitky i Sreality mají obec přímo
     v NÁZVU nabídky („Prodej pozemku, Kostelec nad Černými lesy").
     Vyhodit jméno může výsledek jen zpřesnit, nikdy pokazit — druh
     pozemku se z názvu obce poznat nedá tak jako tak. */
  function bezJmen(t, jmena) {
    if (!jmena) return t;
    var pole = [].concat(jmena);
    for (var i = 0; i < pole.length; i++) {
      var j = srovnej(pole[i]).trim();
      if (j.length < 3) continue;
      t = t.split(j).join(' ');
    }
    return t.replace(/\s+/g, ' ');
  }

  /**
   * Druh pozemku z textu, nebo null když se nic bezpečně nepozná.
   * @param {string} text   název a popis nabídky
   * @param {string|string[]} [jmenaMist]  název obce a okresu — vyškrtnou
   *        se z textu předem. V nabídce je deset obcí, které mají klíčové
   *        slovo přímo ve jméně (Louka, Loukov, Sadská, Zahradní, Lešany,
   *        Kostelec nad Černými lesy…).
   */
  function zTextu(text, jmenaMist) {
    var t = bezJmen(srovnej(text), jmenaMist);
    if (!t) return null;
    for (var i = 0; i < PRAVIDLA.length; i++) {
      var p = PRAVIDLA[i];
      p.re.lastIndex = 0;
      var m;
      while ((m = p.re.exec(t)) !== null) {
        if (platny(t, m.index, m.index + m[0].length, p)) { p.re.lastIndex = 0; return p.druh; }
        if (m.index === p.re.lastIndex) p.re.lastIndex++;   // pojistka proti zacyklení
      }
    }
    return null;
  }

  return { zTextu: zTextu, srovnej: srovnej, bezJmen: bezJmen, PRAVIDLA: PRAVIDLA };
});
