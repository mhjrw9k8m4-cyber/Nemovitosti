/* Návratnost koupě pozemku — kolik z toho zbude, když ho zase prodám.
 *
 * PROČ. Stránka pozemku uměla říct, co pozemek stojí, a odkazem poslat na
 * kalkulačku nákladů. Co z toho vyjde při prodeji, si musel člověk spočítat
 * sám — a právě kvůli tomu na pozemek jako na investici kouká.
 *
 * ČÍ JE TO ČÍSLO. Prodejní cenu zadává ČLOVĚK, web ji nenavrhuje ani
 * nenapovídá. Kdybychom ji dopočítali my, byla by z kalkulačky předpověď —
 * a předpovídat, za kolik se pozemek prodá, neumíme a ani to nejde: záleží
 * na územním plánu, na sítích a na tom, kdo zrovna shání. Všechno ostatní
 * jsou buď čísla z inzerátu, nebo upravitelné odhady.
 *
 * DAŇ Z PŘÍJMU SE NESMÍ VYNECHAT. Kdo prodá dřív, než pozemek deset let
 * vlastní, odvede z výdělku daň. Kalkulačka, která na to zapomene, nadsadí
 * zisk přesně o tu část, na které záleží — u krátkého držení jde o pětinu
 * výdělku. Lhůta i sazba jsou proto upravitelné: zákon se mění a tenhle
 * soubor není jeho výklad. Web u toho musí napsat, že to není daňová rada.
 *
 * DRAŽBA JE JINÁ. U dražby je v inzerátu VYVOLÁVACÍ cena, ne kupní —
 * vydražuje se výš. Kupní cena je proto pole, ne napevno převzaté číslo,
 * a u dražby se k němu říká, co to číslo znamená.
 *
 * Nic se neodesílá: počítá se v prohlížeči.
 */
(function (root) {
  'use strict';

  /* Lhůta, po které je příjem z prodeje nemovitosti od daně osvobozený.
     Výchozí hodnoty, ne tvrzení o zákonu — obojí jde v rozhraní přepsat
     a u obojího stránka říká, že si to má člověk ověřit. */
  var LET_OSVOBOZENI = 10;
  var SAZBA_DANE = 15;          // %
  /* Jediná pevná částka, kterou web uvádí číslem (viz
     kolik-stoji-koupe-pozemku.html): správní poplatek za návrh na vklad. */
  var VKLAD = 2000;

  function kladne(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[\s ]/g, '').replace(',', '.'));
    return (isFinite(n) && n > 0) ? n : 0;
  }

  /**
   * Spočítá návratnost. Vrací null, dokud nejsou obě ceny — výsledek
   * z poloviny zadání by byl číslo bez významu.
   *
   * @param {{kupni:number, naklady:number, prodejni:number, let:number,
   *          sazba:number, lhuta:number}} z
   */
  function spocti(z) {
    z = z || {};
    var kupni = kladne(z.kupni);
    var prodejni = kladne(z.prodejni);
    if (!kupni || !prodejni) return null;

    var naklady = kladne(z.naklady);
    var let_ = kladne(z.let);
    var sazba = (z.sazba === 0) ? 0 : kladne(z.sazba) || SAZBA_DANE;
    var lhuta = (z.lhuta === 0) ? 0 : kladne(z.lhuta) || LET_OSVOBOZENI;

    var vlozeno = kupni + naklady;
    /* Výdělek se daní po odečtení toho, co pozemek stál — tedy včetně
       nákladů kolem koupě, ne jen kupní ceny. Proto se počítá z `vlozeno`,
       a ne z `kupni`. */
    var vydelek = prodejni - vlozeno;
    var osvobozeno = let_ >= lhuta;
    /* ZTRÁTA SE NEDANÍ. Bez téhle podmínky by kalkulačka u prodělku
       „vrátila daň" a ztráta by vyšla menší, než je. */
    var dan = (osvobozeno || vydelek <= 0) ? 0 : vydelek * sazba / 100;
    var cisty = vydelek - dan;

    /* Zhodnocení se počítá z toho, co člověk doopravdy vložil, ne z kupní
       ceny: náklady kolem koupě jsou taky jeho peníze. */
    var zhodnoceni = cisty / vlozeno * 100;
    /* Ročně SLOŽENĚ, ne podílem. Dělit zhodnocení počtem let je u víceleté
       držby nadsazené — 100 % za 10 let není 10 % ročně, ale 7,2 %.
       U držby kratší než rok se roční číslo nepočítá vůbec: přepočet
       dvouměsíčního obchodu na rok dává stovky procent a není to údaj,
       je to iluze. */
    var rocne = null;
    if (let_ >= 1 && vlozeno > 0 && (vlozeno + cisty) > 0) {
      rocne = (Math.pow((vlozeno + cisty) / vlozeno, 1 / let_) - 1) * 100;
    }

    return {
      vlozeno: vlozeno, vydelek: vydelek, dan: dan, cisty: cisty,
      zhodnoceni: zhodnoceni, rocne: rocne,
      osvobozeno: osvobozeno, prodelek: cisty < 0,
      sazba: sazba, lhuta: lhuta
    };
  }

  root.PKNavratnost = {
    spocti: spocti,
    VKLAD: VKLAD, LET_OSVOBOZENI: LET_OSVOBOZENI, SAZBA_DANE: SAZBA_DANE
  };
}(typeof window !== 'undefined' ? window : globalThis));
