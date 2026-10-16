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
    /* „POLE" JEN TAM, KDE JE PŘEDMĚTEM PRODEJE. Slovo samo o sobě je
       past: v nabídce je „k.ú. Dobré Pole u Vitic" a „k.ú. Vysoké Pole"
       (jména obcí), „volně navazuje na pole" (okolí, ne pozemek),
       „nejedná se o obyčejné pole" (zápor) a „z 80 % kvalitní pole,
       z 20 % smíšený les" (obojí). Z čtrnácti výskytů v popisech by
       široké pravidlo pochybilo u sedmi — proto se chytá jen vazba, ve
       které je pole tím, co se prodává. Naměřeno na 1 623 popisech:
       sedm zásahů, všech sedm správně, a sedm vynechaných je přesně
       těch sedm, která se vynechat mají.
       Pole je v katastru orná půda — a tohle pravidlo stojí nad
       „zemědělským pozemkem", takže čtyři nabídky, které dosud měly
       jen ten vágní druh, dostanou konkrétní. */
    { druh: 'orná půda', re: /\born[aáyeou]\w*\b|\bk prodeji pol[eií]\b|\bprodej pol[eií]\b|\bprodam pol[eií]\b|\bjedna se o pol[eií]\b|\btyp pol[eií]\b|\bke koupi (?:podilu )?(?:\d+\/\d+ )?pol[eií]\b/g },
    { druh: 'trvalý travní porost', re: /\btrval\w* travn\w*\b|\btravn\w* porost\w*\b/g },
    { druh: 'louka', re: /\blouk[aiyou]\b|\bloukou\b|\bloukam\w*\b/g },
    { druh: 'pastvina', re: /\bpastvin\w*\b/g },
    { druh: 'ostatní plocha', re: /\bostatni ploch\w*\b/g },
    { druh: 'zemědělský pozemek', re: /\bzemedelsk\w*\b/g },
  ];

  /* ---------------------------------------------------------------
     CITACE KATASTRU MÁ PŘEDNOST PŘED HÁDÁNÍM Z KLÍČOVÝCH SLOV.

     Pravidla výš hádají druh z toho, jaká slova v inzerátu padla, a
     berou první nález podle PŘEDNOSTI (stavební → lesní → …). Jenže
     část inzerátů druh neříká mezi řečí — CITUJE katastr:

       „Nabízím k prodeji pozemek o výměře 3974 m², vedený v katastru
        jako trvalý travní porost. Parcela č. 3975 … dle územního plánu
        určena k zastavění …"

     Tady hádání prohrálo s vlastním textem: slovo o zastavění je
     v inzerátu taky, „stavební pozemek" má přednost — a web napsal
     „stavební pozemek" o pozemku, o kterém tentýž inzerát říká, že je
     v katastru travní porost. Naměřeno na ostrých datech: 6 inzerátů
     cituje katastr větou a u 3 z nich web uváděl jiný druh, VŽDY
     „stavební pozemek".

     Druhý, mnohem častější obrat je výpis z listu vlastnictví, kde je
     druh za každou parcelou v závorce:

       „k.ú. Cotkytle LV č. 561 o celkové výměře 97502 m²
        • Parcela č. 5010 - o výměře 70654 m² (Lesní pozemek)
        • Parcela č. 5011 - o výměře 26848 m² (Orná půda)"

     Takových je 1 292. U 730 je v závorkách jediný druh a tam web
     souhlasil v 701 případech — a 29× ne. U zbylých 556 je to SMĚS
     a web z ní vybíral podle přednosti klíčových slov, ne podle toho,
     čeho je víc: ve 200 případech (36 %) by podle PLOCHY vyšel jiný
     druh, nejčastěji „lesní pozemek" → orná půda (62×) nebo travní
     porost (53×). Jedna malá lesní parcela v balíku polí tak z celého
     balíku dělala les — a podle druhu se filtruje, počítá obvyklá cena
     i staví statistiky okresů.

     Proto: když inzerát katastr cituje, věří se citaci; ze směsi se
     bere druh s NEJVĚTŠÍ plochou. Hádání zůstává až pro inzeráty,
     které nic takového neříkají.

     Co citace nikdy nevrátí: „stavební pozemek". Katastr takový druh
     nezná — vyhláška jich zná deset a všechny jsou v KATASTR níž.
     Jestli se na pozemku dá stavět, je věc územního plánu, ne druhu;
     to je samostatný nedodělek a plést to do druhu by znamenalo
     tvrdit o katastru něco, co v něm nestojí. */
  var KATASTR = ['zastavěná plocha a nádvoří', 'trvalý travní porost', 'ostatní plocha',
    'lesní pozemek', 'vodní plocha', 'ovocný sad', 'orná půda', 'zahrada', 'vinice', 'chmelnice'];
  var KATASTR_SROV = {};
  for (var _i = 0; _i < KATASTR.length; _i++) KATASTR_SROV[srovnej(KATASTR[_i])] = KATASTR[_i];

  /* Obsah závorky (nebo konec věty) musí být PŘESNĚ jeden z druhů —
     nestačí, že ho obsahuje. „(mimo lesní pozemek)" nebo „(lesní
     pozemek sousedí)" by se jinak počítaly jako citace. */
  function katastrovyDruh(s) {
    var k = srovnej(s).replace(/[.,;:–-]+$/, '').trim();
    return Object.prototype.hasOwnProperty.call(KATASTR_SROV, k) ? KATASTR_SROV[k] : null;
  }

  /* „o výměře 70654 m² (Lesní pozemek)" — plocha a druh v jednom obratu.
     Dvojka za m se psát nemusí jako ², proto obě podoby. */
  var PAR_S_PLOCHOU = /o\s+vymere\s+([\d\s.,]+)\s*m(?:²|2)\s*\(([^)]{3,48})\)/g;
  var PAR = /\(([^)]{3,48})\)/g;
  var VETA = /(?:ved\w*\s+v\s+katastru(?:\s+nemovitosti)?(?:\s+jako)?|v\s+katastru(?:\s+nemovitosti)?\s+ved\w*(?:\s+jako)?|druh\s+pozemku)\s*:?\s*([^.;\n(]{3,48})/;

  function zKatastru(t) {
    var m, druh;
    /* 1) Výpis parcel s plochami → vyhrává největší plocha. Při rovnosti
          ten, který je v textu první: výsledek musí být na témž textu
          vždycky stejný, ne závislý na pořadí v objektu. */
    var soucty = {}, poradi = [];
    PAR_S_PLOCHOU.lastIndex = 0;
    while ((m = PAR_S_PLOCHOU.exec(t)) !== null) {
      druh = katastrovyDruh(m[2]);
      if (!druh) continue;
      var plocha = parseFloat(String(m[1]).replace(/[\s.]/g, '').replace(',', '.'));
      if (!(plocha > 0)) continue;
      if (!Object.prototype.hasOwnProperty.call(soucty, druh)) { soucty[druh] = 0; poradi.push(druh); }
      soucty[druh] += plocha;
    }
    if (poradi.length) {
      var nej = poradi[0];
      for (var i = 1; i < poradi.length; i++) if (soucty[poradi[i]] > soucty[nej]) nej = poradi[i];
      return nej;
    }
    /* 2) Druhy v závorkách bez ploch → jen když je jediný. Ze směsi bez
          ploch se vybrat nedá a hádat se nebude. */
    var vzavorkach = [];
    PAR.lastIndex = 0;
    while ((m = PAR.exec(t)) !== null) {
      druh = katastrovyDruh(m[1]);
      if (druh && vzavorkach.indexOf(druh) === -1) vzavorkach.push(druh);
    }
    if (vzavorkach.length === 1) return vzavorkach[0];
    if (vzavorkach.length > 1) return null;
    /* 3) Věta „vedený v katastru jako …" / „druh pozemku: …" */
    m = VETA.exec(t);
    if (m) { druh = katastrovyDruh(m[1]); if (druh) return druh; }
    return null;
  }

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
    /* Citace katastru napřed — viz dlouhá poznámka u zKatastru. */
    var zapsany = zKatastru(t);
    if (zapsany) return zapsany;
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

  return { zTextu: zTextu, zKatastru: zKatastru, katastrovyDruh: katastrovyDruh,
    srovnej: srovnej, bezJmen: bezJmen, PRAVIDLA: PRAVIDLA, KATASTR: KATASTR };
});
