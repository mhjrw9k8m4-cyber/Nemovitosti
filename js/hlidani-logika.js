/* Hlídání lokality — porovnávání pozemků s uloženým hledáním.
 *
 * Proč vlastní soubor: tahle logika žila uvnitř hlidani.html, takže ji
 * nešlo ani otestovat, ani použít jinde. A použít jinde je potřeba —
 * odznak v menu musí umět spočítat, kolik nových pozemků na člověka čeká,
 * jinak se to dozví, jen když si na stránku hlídání sám vzpomene.
 *
 * „Nové" znamená: sedí na uložené hledání a jeho otisk není mezi těmi,
 * které už uživatel viděl (seen_keys). Nic se nikam neposílá — počítá se
 * to tady v prohlížeči a výsledek je vidět u hlídání a v odznaku v menu.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKHlidani = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normd(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // Stálý otisk pozemku. Musí přežít i to, že tentýž pozemek přijde ze
  // zdroje znovu — jinak by se „nové" hlásilo pokaždé dokola.
  function keyOf(d) {
    return [d.type || '', normd(d.okres), normd(d.place), d.parcel || '', d.price || '', d.area || '']
      .join('|').slice(0, 240);
  }

  /* Tentýž pozemek chodí ze dvou zdrojů a ve výpisu se pak objevil dvakrát
     (zrovna „Trubín, 1 875 000 Kč" hned dvakrát za sebou). Shoda obce,
     okresu, ceny, výměry i druhu je jistota — dvě různé nabídky se v tomhle
     všem netrefí.

     Je to tady, a ne v js/main.js, protože počítat musí obě strany stejně:
     mapa hlásila 1 940 pozemků, kdežto hlídání 1 953, a to je na dvou
     stránkách téhož webu rozdíl, který se nedá vysvětlit. */
  function klicShody(d) {
    return [d.place, d.okres, d.price, d.area, d.druh].join('|');
  }
  /* Shoda v obci, okrese, ceně, výměře i druhu ještě neznamená týž pozemek.
     V Polici nad Metují takhle zmizely TŘI dražby: čtyři sousední parcely
     (769/274, /276, /277, /278) měly stejnou výměru i vyvolávací cenu, ale
     každá svůj termín — 24. 9., 15. 10., 22. 10. a 5. 11. Web z nich
     ukázal jednu a tři dražby prostě nebyly vidět.
     Proto: když obě strany parcelní číslo znají a liší se, jsou to různé
     pozemky. Totéž u termínu dražby. Když to jeden ze záznamů neuvádí
     (u inzerátů parcelní číslo většinou chybí), rozhoduje dál shoda
     v ostatním — tam je opakování ze dvou zdrojů to pravděpodobnější. */
  function znamaParcela(d) {
    var p = (d && d.parcel != null) ? String(d.parcel).trim() : '';
    return (p && p !== '—' && p !== '-') ? p : null;
  }
  function znamyTermin(d) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec((d && d.extra) || '');
    return m ? m[0] : null;
  }
  function tyzPozemek(a, b) {
    var pa = znamaParcela(a), pb = znamaParcela(b);
    if (pa && pb && pa !== pb) return false;
    var ta = znamyTermin(a), tb = znamyTermin(b);
    if (ta && tb && ta !== tb) return false;
    return true;
  }
  /* Když je týž pozemek ze dvou stran, VYHRÁVÁ MAJITEL.
     Prodávající, který má pozemek na Bezrealitkách, si ho sem přidá
     odkazem — formulář z něj obec, výměru i cenu předvyplní
     (js/predvyplneni.js), takže jeho záznam vyjde s těmi čísly shodně
     se sbíranou nabídkou. Sbíraná se přitom do seznamu dostane dřív,
     takže by ta jeho tiše zmizela: přidá inzerát, nic se nestane
     a nikde se nedozví proč.
     A i kdyby ne: záznam od majitele nese přímý kontakt, bez provize
     a bez portálu mezi tím. To je ta lepší z těch dvou. */
  function bezDuplicit(list) {
    var skupiny = {}, ven = [];
    for (var i = 0; i < (list || []).length; i++) {
      var d = list[i], k = klicShody(d);
      var skup = skupiny[k] || (skupiny[k] = []);
      var kolize = null;
      for (var j = 0; j < skup.length; j++) { if (tyzPozemek(skup[j], d)) { kolize = skup[j]; break; } }
      if (kolize) {
        if (d.type === 'majitel' && kolize.type !== 'majitel') {
          var pozice = ven.indexOf(kolize);
          if (pozice !== -1) ven[pozice] = d;
          skup[skup.indexOf(kolize)] = d;
        }
        continue;
      }
      skup.push(d);
      ven.push(d);
    }
    return ven;
  }

  /* Tytéž věci, dva zdroje. Pole `features` a `access` vyplňuje majitel
     ve formuláři — má je tedy jen hrstka vlastních inzerátů. U nabídek
     sbíraných robotem stojí totéž v POPISU a robot si to z něj vytáhne
     do pole `site` (js/vybaveni.js).
     Dokud se hlídání dívalo jen na `features`, znamenalo zaškrtnutí
     „Elektřina" ticho: ze sbíraných nabídek nemá pole `features` ani
     jedna, takže hlídání nemohlo najít nic — a nikde to neřeklo.
     Co se z popisu vyčíst nedá (oplocení, stavba k rekonstrukci), tu
     schválně není: to musí dál pocházet z formuláře. */
  var SITE_KLIC = {
    'Elektřina': 'elektrina',
    'Voda': 'voda',
    'Kanalizace': 'kanalizace',
    'Plyn': 'plyn',
    'Přístupová cesta': 'cesta',
  };

  /* MÍSTO: hotový název, ne kus slova.
   *
   * Hlídané místo se porovnávalo podřetězcem kdekoli v okrese i v názvu
   * obce. Na skutečných datech to dělalo 141 falešných shod u sedmi
   * okresů — a u hlídání to nejsou jen „výsledky navíc", podle toho
   * chodí upozornění:
   *   „Jičín"   chytal celý okres NOVÝ Jičín (17 nabídek, 250 km jinam),
   *   „Most"    Mosty u Jablunkova, Dlouhý Most i Kněžmost,
   *   „Písek"   Moravský Písek, „Teplice" Teplice nad Metují,
   *   „Benešov" Horní Benešov a Benešovice u Všelibic.
   *
   * OKRES se bere i s tím, co za jménem následuje: kdo hlídá „Praha",
   * má dostat i Prahu-východ a Prahu-západ — jsou to okresy kolem
   * Prahy a přesně ty ten člověk hledá (113 nabídek). Proto se u okresu
   * uznává i „jméno + další slovo".
   * OBEC naopak jen přesně: „Most" není „Dlouhý Most" ani „Mosty
   * u Jablunkova" a Teplice nejsou Teplice nad Metují.
   *
   * Že by se překlepem trefil prázdný výběr, hlídat nemusíme: formulář
   * u sebe průběžně píše, kolika nabídkám zadání dnes odpovídá, a při
   * nule to řekne nahlas. */
  function normMisto(s) {
    return normd(s).replace(/[-\u2010-\u2015]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(?:okres|obec)\s+/, '');
  }
  /* Všech 77 okresů. Modul potřebuje vědět, které zadané jméno je samo
     o sobě okresem — bez toho se nedá rozhodnout, jestli „Praha"
     znamená okres Praha, nebo taky Prahu-východ a Prahu-západ, což jsou
     jiné okresy, a ještě ve Středočeském kraji. Že se seznam neroz-
     chází s daty, hlídá scripts/test-hlidani.mjs proti data/okresy.json. */
  var OKRESY = [
    'Praha', 'Praha-východ', 'Praha-západ', 'Benešov', 'Beroun', 'Kladno', 'Kolín',
    'Kutná Hora', 'Mělník', 'Mladá Boleslav', 'Nymburk', 'Příbram', 'Rakovník',
    'České Budějovice', 'Český Krumlov', 'Jindřichův Hradec', 'Písek', 'Prachatice',
    'Strakonice', 'Tábor', 'Domažlice', 'Cheb', 'Karlovy Vary', 'Klatovy', 'Plzeň-město',
    'Plzeň-jih', 'Plzeň-sever', 'Rokycany', 'Sokolov', 'Tachov', 'Česká Lípa', 'Děčín',
    'Chomutov', 'Jablonec nad Nisou', 'Liberec', 'Litoměřice', 'Louny', 'Most', 'Semily',
    'Teplice', 'Ústí nad Labem', 'Havlíčkův Brod', 'Hradec Králové', 'Chrudim', 'Jičín',
    'Náchod', 'Pardubice', 'Rychnov nad Kněžnou', 'Svitavy', 'Trutnov', 'Ústí nad Orlicí',
    'Jihlava', 'Pelhřimov', 'Třebíč', 'Žďár nad Sázavou', 'Blansko', 'Brno-město',
    'Brno-venkov', 'Břeclav', 'Hodonín', 'Vyškov', 'Znojmo', 'Kroměříž', 'Uherské Hradiště',
    'Vsetín', 'Zlín', 'Jeseník', 'Olomouc', 'Prostějov', 'Přerov', 'Šumperk', 'Bruntál',
    'Frýdek-Místek', 'Karviná', 'Nový Jičín', 'Opava', 'Ostrava-město'
  ];
  var JE_OKRES = {};
  for (var io_ = 0; io_ < OKRESY.length; io_++) JE_OKRES[normMisto(OKRESY[io_])] = 1;

  function mistoSedi(zadane, d) {
    var k = normMisto(zadane);
    if (!k) return true;
    var okres = normMisto(d.okres);
    if (okres === k) return true;
    /* „Jméno + další slovo" jen tehdy, když zadané jméno samo okresem
       NENÍ. Hlídání „Praha" hlásilo 141 pozemků, ale na mapě jich bylo
       28 — zbylých 113 byly Praha-východ a Praha-západ. Kdo napíše
       Praha, myslí Prahu.
       U „Plzeň", „Ústí" nebo „Brno" žádný okres toho jména neexistuje,
       takže tam se předpona bere dál a zahrne všechny (Plzeň-město,
       -jih, -sever). To je jediné, co si pod tím jménem lze představit. */
    if (!JE_OKRES[k] && okres.indexOf(k + ' ') === 0) return true;
    return normMisto(d.place) === k;
  }

  /* DRUH: celé slovo, ne kus. Volba „sad" má najít „ovocný sad" — to je
     celé slovo uvnitř názvu. Nesmí ale stačit kus slova: jinak by se
     jednou objevil druh, ve kterém je volba schovaná uprostřed, a filtr
     by tiše vracel něco jiného, než na co si člověk klikl. */
  function druhSedi(zadany, druhPozemku) {
    var k = normd(zadany).replace(/\s+/g, ' ').trim();
    if (!k) return true;
    var t = normd(druhPozemku).replace(/\s+/g, ' ').trim();
    return t === k || (' ' + t + ' ').indexOf(' ' + k + ' ') >= 0;
  }

  function matches(s, d) {
    if (!s || !d) return false;
    if (s.ptype && d.type !== s.ptype) return false;
    if (s.druh && !druhSedi(s.druh, d.druh)) return false;
    if (s.max_price && !(d.price > 0 && d.price <= s.max_price)) return false;
    if (s.min_price && !(d.price > 0 && d.price >= s.min_price)) return false;
    if (s.min_area && !(d.area > 0 && d.area >= s.min_area)) return false;
    if (s.max_area && !(d.area > 0 && d.area <= s.max_area)) return false;
    /* Cena za metr je to, podle čeho se pozemky srovnávají nejčastěji —
       sto tisíc je u zahrady moc a u pole na deseti hektarech málo.
       Počítá se stejně jako všude jinde na webu: cena děleno výměra. */
    if (s.max_perm2) {
      if (!(d.price > 0 && d.area > 0)) return false;
      if (d.price / d.area > s.max_perm2) return false;
    }
    if (s.okres && !mistoSedi(s.okres, d)) return false;
    if (s.features && s.features.length) {
      var f = d.features || [];
      var site = d.site || [];
      for (var i = 0; i < s.features.length; i++) {
        var need = s.features[i];
        var klic = SITE_KLIC[need];
        if (klic && site.indexOf(klic) >= 0) continue;   // stojí to v popisu nabídky
        if (need === 'Přístupová cesta') {
          if ((d.access || '').indexOf('cesta') < 0) return false;
        } else if (f.indexOf(need) < 0) return false;
      }
    }
    return true;
  }

  // Kolik nových pozemků sedí na jedno uložené hledání.
  function novychProHledani(s, data) {
    var videno = {};
    (s && s.seen_keys ? s.seen_keys : []).forEach(function (k) { videno[k] = 1; });
    var n = 0;
    (data || []).forEach(function (d) { if (matches(s, d) && !videno[keyOf(d)]) n++; });
    return n;
  }

  // Součet přes všechna hledání — to je číslo na odznaku. Jeden pozemek
  // může sedět na dvě hledání; počítá se jednou, ať odznak nenafukuje.
  function novychCelkem(hledani, data) {
    var nove = {};
    (hledani || []).forEach(function (s) {
      var videno = {};
      (s.seen_keys || []).forEach(function (k) { videno[k] = 1; });
      (data || []).forEach(function (d) {
        var k = keyOf(d);
        if (matches(s, d) && !videno[k]) nove[k] = 1;
      });
    });
    return Object.keys(nove).length;
  }

  return {
    tyzPozemek: tyzPozemek, normd: normd, keyOf: keyOf, matches: matches,
           mistoSedi: mistoSedi, druhSedi: druhSedi,
           klicShody: klicShody, bezDuplicit: bezDuplicit,
           novychProHledani: novychProHledani, novychCelkem: novychCelkem,
           /* Ven jen kvůli hlídači: scripts/test-hlidani.mjs porovná
              vypsaný seznam s data/okresy.json. Bez toho by se rozešel
              potichu — chování se totiž změní jen u jména, které je
              předponou jiného okresu, tedy dnes jedině u Prahy. */
           OKRESY: OKRESY };
});
