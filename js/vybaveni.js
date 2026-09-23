/* Co je u pozemku zavedené — a jestli se neprodává jen podíl.
 *
 * Proč to vzniklo: ve filtrech chybělo to, na co se lidé ptají nejdřív —
 * je tam elektřina? voda? a prodává se celý pozemek, nebo jen podíl?
 * V datech to nebylo, ale POPIS inzerátu se u většiny zdrojů stahuje už
 * dávno (Bezrealitky, OK dražby, Farmy) a jen se zahazoval; používal se
 * pouze k určení druhu pozemku.
 *
 * Tenhle modul z popisu vytáhne, co se dá — a hlavně se drží dvou pravidel:
 *
 * 1. ZÁPOR JE DŮLEŽITĚJŠÍ NEŽ SLOVO. „Pozemek bez elektřiny" obsahuje slovo
 *    „elektřina", a naivní hledání by ho označilo za pozemek s elektřinou.
 *    To by byla horší lež než mlčet. Před každým nálezem se proto kouká
 *    dozadu na zápor — a zápor platí i přes výčet („bez vody a elektřiny").
 *
 * 2. CO NENÍ V POPISU, NENÍ ZNÁMÉ — ne „není to tam". Modul říká jen to, co
 *    v textu opravdu stojí. Filtr proto musí mluvit o tom, co je UVEDENO,
 *    a nesmí tvrdit, že zbytek nabídky elektřinu nemá.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKVybaveni = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* VŠECHNO SE HLEDÁ V TEXTU BEZ DIAKRITIKY. Není to kosmetika: hranice
     slova (\b) v JavaScriptu zná jen anglickou abecedu, takže „není" se
     za „í" nikdy nechytí a zápor se ztratí. Přišlo se na to tak, že modul
     u věty „Na pozemku není zavedena elektřina" hlásil elektřinu. */
  function srovnej(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ');
  }
  var bezDiakritiky = srovnej;

  var SITE = [
    { klic: 'elektrina', nazev: 'Elektřina',
      re: /elektrin\w*|elektrick\w+ (?:pripojk|energi)\w*|\bel\.\s*(?:energi|pripojk)\w*|\belektro\b|\belektro(?:pripojk|mer)\w*/g },
    { klic: 'voda', nazev: 'Voda',
      re: /vodovod\w*|\bvod[aoyeu]\b|studn[ayei]\w*|\bvrt\b|pitn\w* vod\w*/g,
      /* Voda, která není přípojka. Odpadní, dešťová, spodní nebo rovnou
         záplavová voda je v inzerátu STAROST, ne to, co si člověk pod
         filtrem „voda" představí. U záplavového území se tím z varování
         dokonce dělala výhoda. Rozpozná se to podle slova TĚSNĚ PŘED
         nálezem — čeština ten přívlastek dává vždycky dopředu. */
      /* Schválně tu NENÍ „užitková" ani „závlahová": to jsou skutečné
         zdroje vody, jen ne pitné. Vyhazuje se jen voda, která je
         problém. */
      mimo: /(?:odpadn|destov|spodn|podzemn|povrchov|zaplav|zatopov|velk|stojat)\w*\s+$/ },
    /* „Jímka" se skloňuje i na -ou („odpadní vody řešeny JÍMKOU") — výčet
       koncovek na tenhle tvar nestačil a věta pak nehlásila nic. */
    { klic: 'kanalizace', nazev: 'Kanalizace',
      re: /kanaliz\w*|septik\w*|cistirn\w* odpadn\w*|\bcov\b|\bjimk\w*/g },
    { klic: 'plyn', nazev: 'Plyn',
      re: /plynov\w* pripojk\w*|plynofik\w*|\bplyn\b|\bplynu\b/g },
    /* „Komunikace" je v inzerátech stejně běžná jako „cesta" — jen se za
       ni musí dostat přívlastek, aby se nechytla „komunikace s majitelem".
       Na skutečných textech se objevuje jako zpevněná, místní, asfaltová,
       obecní nebo veřejná. */
    { klic: 'cesta', nazev: 'Příjezd',
      re: /prijezdov\w*|pristupov\w* cest\w*|zpevnen\w* cest\w*|prijezd k pozemku|asfaltov\w* cest\w*|(?:zpevnen|mistn|asfaltov|obecn|verejn|ucelov)\w*\s+komunikac\w*/g },
  ];

  /* Zápory. „Bez" a „není" jsou nejčastější, ale je jich víc — a musí se
     hledat i za slovem, protože čeština si zápor ráda odstrčí dozadu
     („elektřina zavedena není"). */
  /* Sloveso v záporu je stejně častý zápor jako „bez" — „vodovod ani
     kanalizace k pozemku NEVEDOU". Seznam je schválně výčtový, ne „ne+cokoli":
     to by chytalo i „nemovitost", „nejlepší" nebo „nedaleko". */
  var ZAPOR = /\b(?:bez|neni|nejsou|nema|nemaji|nemame|nevede|nevedou|nedosahuje|nedovoluje|neexistuj\w*|nelze|chybi|nezaveden\w*|nepriveden\w*|nepripojen\w*|zadn\w*)\b/g;
  var OKNO_PRED = 70;    // kolik znaků před nálezem se prohledá
  /* Dopředu se kouká dál než dozadu, protože čeština zápor ráda odsune až
     na konec: „Vodovod ani kanalizace k pozemku NEVEDOU" — od slova
     k záporu je to třiatřicet znaků. Čárka to stejně zastaví, takže
     „elektřina je, voda není" tím netrpí. */
  var OKNO_ZA = 48;      // a kolik za ním

  /* Je nález záporný? Kouká se do okna kolem něj. Dozadu jen krátce a
     nanejvýš do konce věty, aby „elektřina je, voda není" neshodilo i tu
     elektřinu. */
  function zaporny(text, od, do_) {
    var pred = text.slice(Math.max(0, od - OKNO_PRED), od);
    var za = text.slice(do_, do_ + OKNO_ZA);
    var hranice = /[.;!?]|\bale\b|\bzato\b|\bnicmene\b/g;
    var posledniHranice = -1, m;
    hranice.lastIndex = 0;
    while ((m = hranice.exec(pred)) !== null) posledniHranice = m.index + m[0].length;
    var usek = posledniHranice >= 0 ? pred.slice(posledniHranice) : pred;
    ZAPOR.lastIndex = 0;
    if (ZAPOR.test(usek)) return true;
    /* Dopředu jen do nejbližší čárky nebo konce věty: za čárkou už mluvíme
       o něčem jiném. */
    var zaKonec = za.split(/[.;!?,]/)[0];
    ZAPOR.lastIndex = 0;
    return ZAPOR.test(zaKonec);
  }

  /* Podíl. Tohle není odhad, ale to, co v inzerátu stojí černé na bílém:
     „spoluvlastnický podíl", „podíl o velikosti 1/2", „id. podíl". */
  /* Slovo „podíl" v tom přitom vůbec být nemusí. Dražby a listy
     vlastnictví píšou totéž jako „podílové spoluvlastnictví", „ideální
     polovina" nebo jen „id. 1/2" — a těch se modul napoprvé vůbec
     nechytil. „Ideální" se proto bere jako podíl jen se zlomkem nebo se
     zlomkovým slovem za sebou: samotné „ideální poloha" je chvála. */
  var ZLOMEK = '(?:\\d+\\s*\\/\\s*\\d+|polovin\\w*|tretin\\w*|ctvrtin\\w*|petin\\w*|sestin\\w*|osmin\\w*|desetin\\w*)';
  var PODIL = new RegExp(
    'spoluvlastnick\\w*\\s+podil\\w*' +
    '|podilov\\w*\\s+spoluvlastnictv\\w*' +
    '|\\bid\\.?\\s*podil\\w*' +
    '|podil\\w*\\s*(?:o\\s*velikosti\\s*)?\\d+\\s*\\/\\s*\\d+' +
    '|\\bpodil\\w*\\s+na\\s+pozemku' +
    '|\\bpodil\\w*\\s+ve\\s+vysi' +
    '|\\bidealn\\w*\\s+' + ZLOMEK +
    '|\\bid\\.\\s*\\d+\\s*\\/\\s*\\d+', 'g');
  var NENI_PODIL = /\bne\s+podil|nikoli\w*\s+podil|nejde\s+o\s+podil|nejedna\s+se\s+o\s+podil|\bneni\s+v\s+podilov\w*|nejde\s+o\s+podilov\w*/;

  /* Podíl na PŘÍSTUPOVÉ cestě není podíl na pozemku. V inzerátech se běžně
     píše „…prodej parcely • spoluvlastnickým podílem 1/8 na společném
     přístupovém pozemku…" — samotná parcela se přitom prodává celá.
     Označit takovou nabídku za podíl by bylo zavádějící, tak se tahle
     zmínka z textu před hledáním podílu vyjme. Ověřeno na skutečných
     inzerátech (robot si o ně na den řekl do logu). */
  var PODIL_CESTA = /(?:podil\w*|idealn\w*)\s*(?:o\s*velikosti\s*)?(?:\d+\s*\/\s*\d+\s*)?na\s+(?:spolecn\w*\s+)?(?:pristupov\w*|prijezdov\w*)\s+(?:pozemku|ceste|cesty|komunikaci)/g;

  /* Mluví ten nález vůbec o téhle síti? Kouká se na kousek textu těsně
     PŘED ním — přívlastek, který slovo převrací („odpadní vody"), stojí
     v češtině vždycky vlevo a hned vedle. */
  function mimoObor(def, text, od) {
    if (!def.mimo) return false;
    return def.mimo.test(text.slice(Math.max(0, od - 24), od));
  }

  function najdi(text) {
    var syrovy = String(text == null ? '' : text);
    var t = srovnej(syrovy);
    if (!t) return { site: [], podil: false, znamo: false };
    var ven = [];
    for (var i = 0; i < SITE.length; i++) {
      var def = SITE[i];
      def.re.lastIndex = 0;
      var m, ma = false;
      while ((m = def.re.exec(t)) !== null) {
        if (!zaporny(t, m.index, m.index + m[0].length) && !mimoObor(def, t, m.index)) { ma = true; break; }
        if (m.index === def.re.lastIndex) def.re.lastIndex++;   // pojistka proti zacyklení
      }
      if (ma) ven.push(def.klic);
    }
    PODIL.lastIndex = 0;
    PODIL_CESTA.lastIndex = 0;
    var bezCesty = t.replace(PODIL_CESTA, ' ');
    PODIL.lastIndex = 0;
    var podil = PODIL.test(bezCesty) && !NENI_PODIL.test(t);
    return { site: ven, podil: podil, znamo: t.length >= 40 };
  }

  function nazev(klic) {
    for (var i = 0; i < SITE.length; i++) if (SITE[i].klic === klic) return SITE[i].nazev;
    return klic;
  }

  return { SITE: SITE, najdi: najdi, nazev: nazev, bezDiakritiky: bezDiakritiky };
});
