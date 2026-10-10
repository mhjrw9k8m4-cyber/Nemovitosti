/* Jedno políčko, které rozumí všemu.
 *
 * Hledání umělo jen místo, okres, parcelu a druh — a to jen jako text.
 * Kdo chtěl „stavební pozemek na Berounsku do milionu, kde je elektřina",
 * musel projít čtyři různá ovládátka na třech místech stránky. Přitom to
 * celé je jedna věta, kterou si člověk v hlavě stejně řekne najednou.
 *
 * Tenhle modul tu větu rozebere: co pozná, udělá z toho FILTR (a web to
 * ukáže jako odznak, který jde zrušit), a co nepozná, nechá jako text na
 * hledání obce. Nic se nezahazuje mlčky.
 *
 * Tři pravidla, na kterých to stojí:
 *
 * 1. JEDNOTKA ROZHODUJE, NE POŘADÍ. „do 2 ha" je výměra, „do 2 mil" cena.
 *    Holé číslo („769/2") zůstane textem — je to nejspíš parcela.
 * 2. DELŠÍ VAZBA MÁ PŘEDNOST. „trvalý travní porost" se musí poznat dřív
 *    než samotné „travní", jinak by zbytek věty osiřel.
 * 3. CO NEPOZNÁM, NEZAHODÍM. Zbytek jde do hledání místa, takže „Beroun"
 *    vedle „stavební" pořád funguje jako dřív.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKDotaz = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(s) {
    /* POMLČKA MEZI MEZERAMI PŘED ČÍSLEM JE ROZSAH, ne oddělovač slov.
       „500 tisíc – 1 milion" se jinak rozpadlo na čtyři slova bez vazby
       a z rozsahu zbyla jeho DOLNÍ mez jako strop: hledání vrátilo
       „do 500 tisíc", tedy přesný opak toho, co člověk chtěl. Česky se
       ten rozsah píše „až", takže se jím pomlčka nahradí.
       KDY SE POMLČKA PŘEPÍŠE: musí mít kolem sebe mezery a před ní musí
       stát číslo nebo jednotka částky. Složené názvy mezery nemají
       („Praha-východ", „Brno-venkov", „Frýdek-Místek"), takže se jich
       to nedotkne — a „Praha - 5" se psané s mezerami taky nerozbije,
       protože „praha" není jednotka. Jednotka se přitom musí shodovat
       jako CELÉ SLOVO: bez toho se „ha" našlo na konci slova „praha"
       a z „Praha - 5" se stalo „praha az 5". Vyzkoušeno na obojím. */
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/(^|\s)(\d+|tis\w*|mil\w*|korun\w*|kc|czk|ha|hektar\w*|m2|ar|aru|ary)\s[-‐-―]\s(?=\d)/g, '$1$2 az ')
      .replace(/[-‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* Slovník. Delší vazby stojí první — viz pravidlo 2. */
  /* Tvar [název pro člověka, SLOVO K NAPSÁNÍ, tvary k rozpoznání].
     Prostřední je to, co se vloží do políčka, když si někdo vybere
     z našeptávače: musí to být slovo, které parser zase přečte. Název
     „Stavební / zastavěná" by přečíst nešel a věta by se rozpadla. */
  var DRUHY = [
    /* Souhrn, ne konkrétní druh v katastru: pokrývá ornou půdu i louky,
       stejně jako ho sčítá stránka s cenami. Stojí první, aby se
       „zemědělská půda" nerozpadla na jednotlivá slova. */
    ['Zemědělská půda', 'zemědělská', ['zemedelska puda', 'zemedelskou pudu', 'zemedelske pozemky', 'zemedelsky pozemek', 'zemedelska', 'zemedelsky']],
    ['Louka / travní porost', 'travní porost', ['trvaly travni porost', 'travni porost', 'louka', 'louky', 'travni', 'pastvina', 'pastviny']],
    /* „pozemek na stavbu domu" a „parcela pod dům" jsou věty, které
       člověk napíše dřív než slovo „stavební" — měřeno na vlastních
       dotazech: zbylo z nich „stavbu domu" a „dum", což se hledalo jako
       NÁZEV OBCE, takže výpis byl prázdný. Delší vazby stojí první. */
    ['Stavební / zastavěná', 'stavební', ['stavebni pozemek', 'stavebni parcela',
      'na stavbu domu', 'pod stavbu domu', 'k vystavbe domu', 'na stavbu rodinneho domu',
      'na stavbu', 'pod stavbu', 'k vystavbe', 'pro stavbu', 'pod dum', 'na dum',
      'stavebni', 'stavebak', 'zastavena', 'stavbu', 'vystavbe', 'vystavba']],
    ['Lesní pozemek', 'lesní', ['lesni pozemek', 'lesni', 'les', 'lesy', 'lesa']],
    ['Orná půda', 'orná', ['orna puda', 'orna', 'pole', 'poli']],
    /* Zahrádka je zahrada. Bez toho se „zahrádka Praha" hledala jako
       obec „zahradka praha" a nenašla nic. */
    ['Zahrada', 'zahrada', ['zahrada', 'zahrady', 'zahradu', 'zahradka', 'zahradky', 'zahradku']],
    ['Vinice / sad', 'vinice', ['ovocny sad', 'vinice', 'vinici', 'sad', 'sady']],
    ['Ostatní plocha', 'ostatní', ['ostatni plocha', 'ostatni']],
  ];
  var TYPY = [
    ['drazba', 'Dražba', 'dražba', ['drazba', 'drazby', 'drazbu', 'v drazbe']],
    ['exekuce', 'Exekuce', 'exekuce', ['exekuce', 'exekucni', 'exekuci']],
    ['obec', 'Od obce', 'od obce', ['od obce', 'obecni', 'obec prodava']],
    ['majitel', 'Od majitele', 'od majitele', ['od majitele', 'primo od majitele', 'majitel', 'soukromnik']],
    ['sale', 'Běžná nabídka', 'inzerát', ['inzerat', 'inzeraty', 'bezny prodej']],
  ];
  /* Pády. Lidé nepíšou „elektřina", píšou „S ELEKTŘINOU" — a sedmý pád
     ve slovníku nebyl. Nepoznané slovo přitom spadne do hledání místa,
     kde žádná obec „elektřinou" není, takže věta vrátila prázdno.
     Změřeno na ostrých datech: „s elektřinou", „pozemek s vodou"
     i „zahrada s vodou a elektřinou" vracely nula nabídek. */
  var SITE = [
    ['elektrina', 'Elektřina', 'elektřina', ['elektrina', 'elektriny', 'elektrinou', 'elektro', 'proud', 'el. energie', 'el energie']],
    ['voda', 'Voda', 'voda', ['vodovod', 'vodovodem', 'voda', 'vody', 'vodou', 'studna', 'studnu', 'studnou', 'vrt', 'vrtem']],
    ['kanalizace', 'Kanalizace', 'kanalizace', ['kanalizace', 'kanalizaci', 'kanalizacimi', 'septik', 'septikem', 'cov']],
    ['plyn', 'Plyn', 'plyn', ['plyn', 'plynu', 'plynem', 'plynofikace', 'plynovod']],
    ['cesta', 'Příjezd', 'příjezd', ['prijezd', 'prijezdem', 'prijezdova cesta', 'prijezdovou cestou', 'pristupova cesta', 'pristupovou cestou', 'pristup', 'pristupem', 'cesta', 'cestou', 'komunikace', 'komunikaci']],
  ];
  var CELEK = ['bez podilu', 'jen cele', 'cely pozemek', 'cele pozemky', 'celek', 'nepodil'];

  /* Kraje. Po obci je to nejpřirozenější způsob, jak si člověk výpis
     zúží — web pro kraj má vlastní filtr i vlastní pohled na mapě, jen
     ho věta neuměla pojmenovat. „Jihočeský kraj" i „orná půda Vysočina"
     proto padaly do hledání OBCE a vracely nulu.
     Tvary jsou schválně i ty hovorové („jižní Čechy", „Moravskoslezsko"):
     lidé je tak píšou. Pozor na to, aby se nepotkaly s OBCÍ stejného
     jména — proto tu není holé „Plzeň" ani „Brno", jen „Plzeňský"
     a „Jihomoravský". */
  var KRAJE = [
    /* PRAHA JE VÝJIMKA a musí jí zůstat. Je to zároveň kraj, obec i tři
       okresy (Praha, Praha-východ, Praha-západ). Kdyby se holé „Praha"
       bralo jako kraj, „Praha-východ" by se rozpadlo na kraj Praha
       + slovo „východ" — a to nenajde nic, protože okres Praha-východ
       do kraje Praha nepatří (je středočeský). Vyzkoušeno: vrátilo to
       nula nabídek tam, kde jich předtím byly desítky.
       Holé „Praha" proto zůstává hledáním MÍSTA, kde najde obec i oba
       okolní okresy — tedy víc, než by dal filtr kraje. Jako kraj se
       Praha zadá buď z rozbalovátka, nebo plným názvem. */
    ['Praha', 'hlavní město Praha', ['hlavni mesto praha', 'hl. m. praha', 'kraj praha']],
    ['Středočeský', 'Středočeský', ['stredocesky', 'stredocesky kraj', 'stredni cechy', 'stredoceskeho']],
    ['Jihočeský', 'Jihočeský', ['jihocesky', 'jihocesky kraj', 'jizni cechy', 'jihoceskeho']],
    ['Plzeňský', 'Plzeňský', ['plzensky', 'plzensky kraj', 'plzenska', 'plzenskeho']],
    ['Karlovarský', 'Karlovarský', ['karlovarsky', 'karlovarsky kraj', 'karlovarskeho']],
    ['Ústecký', 'Ústecký', ['ustecky', 'ustecky kraj', 'severni cechy', 'usteckeho']],
    ['Liberecký', 'Liberecký', ['liberecky', 'liberecky kraj', 'libereckeho']],
    ['Královéhradecký', 'Královéhradecký', ['kralovehradecky', 'kralovehradecky kraj', 'kralovehradeckeho']],
    ['Pardubický', 'Pardubický', ['pardubicky', 'pardubicky kraj', 'pardubickeho']],
    ['Vysočina', 'Vysočina', ['vysocina', 'kraj vysocina', 'vysocinu', 'vysocine', 'vysociny']],
    ['Jihomoravský', 'Jihomoravský', ['jihomoravsky', 'jihomoravsky kraj', 'jizni morava', 'jihomoravskeho']],
    ['Olomoucký', 'Olomoucký', ['olomoucky', 'olomoucky kraj', 'olomouckeho']],
    ['Zlínský', 'Zlínský', ['zlinsky', 'zlinsky kraj', 'zlinskeho']],
    ['Moravskoslezský', 'Moravskoslezský', ['moravskoslezsky', 'moravskoslezsky kraj', 'moravskoslezsko', 'moravskoslezskeho']],
  ];

  /* Slova, která nikdy neurčují MÍSTO. Zbytek věty se totiž hledá jen
     v názvu obce, okresu, parcele a druhu — takže jedno přebytečné
     „jen" nebo „pozemek" vynuluje celý výpis. Vyhodit slovo může výpis
     jen rozšířit, nikdy zúžit; proto je bezpečné je zahodit.
     Předložky tu jsou schválně i ty, které bývají v názvech míst
     („Ústí NAD Labem"): hledá se podřetězcem, takže „usti" a „labem"
     tu obec najdou i bez nich. */
  var VYPLN = {};
  ('a i s se v ve na do od ze z k ke u o po pro pri za nad pod mezi kolem okoli'
   + ' jen pouze hledam hledame chci chceme koupim koupit sehnat shanim'
   + ' prodej prodam prodava nabidka nabidky nabizim inzerce'
   + ' pozemek pozemky pozemku pozemkem pozemcich parcela parcely parcelu parcelou'
   + ' okres okrese okresu obec obce obci'
   + ' potrebuji potrebujeme bych bychom koupe prodeje'
   + ' prosim dekuji').split(' ').forEach(function (w) { if (w) VYPLN[w] = true; });

  /* Čísla s jednotkou. „1,5 mil" i „1.5 mil" i „500tis".
     Cena ZA METR je vlastní jednotka, ne cena: „do 20 Kč/m²" a
     „do 20 tisíc" jsou dvě úplně jiné věty. Rozbalovátko na cenu za metr
     má web odjakživa, jen se do políčka nedalo napsat. */
  var NASOBEK = [
    [/^(?:kc\/m2|kc\/m²|\/m2|\/m²|kc\/metr)$/, 1, 'zaMetr'],
    [/^(?:mil|mili[oó]n\w*|m)$/, 1000000, 'cena'],
    [/^(?:tis|tis\.|tisic\w*|k)$/, 1000, 'cena'],
    [/^(?:kc|korun\w*|czk)$/, 1, 'cena'],
    [/^(?:ha|hektar\w*)$/, 10000, 'plocha'],
    /* AR je u polí a zahrad běžnější jednotka než hektar („prodám 20 arů")
       a web ji neznal: „50 arů" padalo celé do hledání obce. Samotné „a"
       se tu schválně NEBERE — v české větě je to spojka, ne jednotka,
       a „pozemek 50 a les" by se přečetlo jako padesát arů. */
    [/^(?:ar|aru|ary|arech|arů)$/, 100, 'plocha'],
    [/^(?:m2|m²|metru|metry|metr)$/, 1, 'plocha'],
  ];
  /* „Kč za metr" jsou tři slova, ne jedno — než se sáhne po jednotce,
     slepí se zpátky na jednu. */
  var ZA_METR_FRAZE = [['kc', 'za', 'metr'], ['kc', 'za', 'm2'], ['korun', 'za', 'metr'],
    ['kc', 'na', 'metr'], ['kc', 'za', 'm²']];

  /* Věci, které web umí filtrovat, ale věta je neuměla pojmenovat. */
  var LEVNE = ['levny', 'levna', 'levne', 'levnejsi', 'levny pozemek', 'levne pozemky',
    'vyhodny', 'vyhodna', 'vyhodne', 'vyhodna koupe', 'vyhodna cena',
    'pod cenou', 'pod obvyklou cenou', 'pod obvyklou', 'pod odhadem', 've slevě', 've sleve'];
  /* „Sítě" bez upřesnění = aspoň jedna z elektřiny, vody, kanalizace
     a plynu. Víc se z toho vyčíst nedá a víc se tvrdit nebude.
     Příjezdová cesta mezi ně nepatří — to není síť. */
  var SITE_OBECNE = ['site', 'sitemi', 'siti', 'sitich', 'inzenyrske site', 'inzenyrskymi sitemi',
    'inzenyrskych siti', 'vsechny site', 'veskere site', 'is'];

  /* Co se dá ještě nabídnout v našeptávači. Tvar je stejný jako u SITE:
     [klíč, název pro člověka, SLOVO K NAPSÁNÍ, tvary]. To třetí je
     důležité — našeptávač ho vkládá do věty a parser ho musí zase
     přečíst, jinak by si nabídka rozbila vlastní dotaz. */
  var OSTATNI = [
    ['levne', 'Pod obvyklou cenou', 'levné', LEVNE],
    ['site', 'Uvedené sítě', 'sítě', SITE_OBECNE],
  ];
  /* Od jakého čísla se „do 100000" čte jako koruny. Pod tím se netipuje. */
  var BEZ_JEDNOTKY_OD = 10000;
  /* Jak široké je „kolem 1000 m²". Čtvrtina na každou stranu: užší pásmo
     by vyhazovalo parcely, které člověk chce vidět, širší by přestalo
     být odpovědí na to, co napsal. */
  var PRIBLIZNE = 0.25;

  /* OKRUH KOLEM MÍSTA — „do 30 km od Brna".
     Nejpřirozenější dotaz na pozemek byl do teď ten jediný, který vracel
     nulu: „do" a „od" jsou výplňová slova, „km" nebyla jednotka a číslo
     bez jednotky se pod deseti tisíci netipuje, takže do hledání OBCE
     šlo „30 km brna". Změřeno na ostrých datech: „do 30 km od Brna",
     „pozemek do 25 km od Prahy", „les do 10 km od Jihlavy" → 0 nalezených.
     Kdo kupuje pozemek, přitom hledá skoro vždycky kolem něčeho.
     Kde to místo na mapě je, počítá js/okruh.js; tady se čte jen věta. */
  var KM_JEDNOTKA = /^(?:km|kilometr|kilometru|kilometry|kilometrem|kilometrech)$/;
  /* Mez je tu, a ne v js/okruh.js, protože je to otázka o VĚTĚ:
     „do 5000 km od Brna" není okruh, ale omyl v jednotce (a kdyby se
     přečetl, vybral by celou republiku a vypadal jako rozbitý filtr).
     Nad 300 km už okruh v Česku nic neomezuje — republika je 500 km
     široká. Pod jedním kilometrem to zas není hledání, ale adresa. */
  var OKRUH_MIN = 1, OKRUH_MAX = 300;
  function platnyOkruh(n) {
    return typeof n === 'number' && isFinite(n) && n >= OKRUH_MIN && n <= OKRUH_MAX;
  }
  /* Slova, která smí před číslem stát („do 30 km", „max 30 km").
     „od" tu schválně NENÍ: „od 30 km" by byl okruh naopak, a to nikdo
     nemyslí — „od" ve větě patří k místu („od Brna"). */
  var OKRUH_PRED = { do: 1, max: 1, pod: 1, nejvys: 1 };

  function cislo(s) {
    var c = s.replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(c)) return null;
    return parseFloat(c);
  }

  /* ČÍSLO PSANÉ PO TISÍCÍCH, tedy „1 500 000".
   *
   * Věta se rozebírá po SLOVECH, takže částka s mezerami byla tři slova
   * a z prvního („1") vyšla jednička — ta je pod mezí, od které se bez
   * jednotky tipuje cena, takže celé „do 1 500 000" spadlo do hledání
   * obce a výpis byl prázdný. Naměřeno:
   *     do 1500000        → cena 1 500 000   ✓
   *     do 1 500 000      → text „1 500 000" ✗
   *     do 1 500 000 Kč   → text             ✗
   *     od 500 000        → text             ✗
   * Přitom mezera po tisících je český pravopis a web sám všechna čísla
   * tiskne takhle („28 000 Kč"). Kdo si částku odtud zkopíruje, dostal
   * prázdný výpis.
   *
   * Co se za jedno číslo POVAŽUJE: první skupina jedna až tři číslice,
   * každá další přesně tři. Dvě skupiny a víc — jedna skupina je obyčejné
   * číslo a to umí cislo() výš. Desetinné číslo („1,5") sem nespadne
   * (není to samá číslice) a parcela („769/2") taky ne. */
  function cisloSkupiny(slova, i) {
    if (!/^\d{1,3}$/.test(slova[i] || '')) return null;
    var slov = 1;
    while (/^\d{3}$/.test(slova[i + slov] || '')) slov++;
    if (slov < 2) return null;
    return { hodnota: parseFloat(slova.slice(i, i + slov).join('')), slov: slov };
  }

  function vetsiPrvni(pole) {
    return pole.slice().sort(function (a, b) { return b.split(' ').length - a.split(' ').length || b.length - a.length; });
  }

  /* Táž slova, jak je člověk napsal. norm() jen zmenší písmena, sundá
     diakritiku a udělá z pomlček mezery — nic nespojuje ani nerozděluje
     jinak, takže se dělí na týchž místech a indexy si odpovídají. Kdyby
     se přesto rozešly (jiný prohlížeč, jiná normalizace), bere se radši
     znormalizovaná podoba než špatné slovo. */
  function puvodniSlova(dotaz, slova) {
    var p = String(dotaz == null ? '' : dotaz)
      .replace(/[\u2010-\u2015-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    return p.length === slova.length ? p : slova;
  }

  /* ČÍSLO A JEDNOTKA NAPSANÉ DOHROMADY. Komentář u NASOBEK slibuje, že
     „500tis" se přečte — jenže slova se dělila jen mezerou, takže
     „500tis", „2ha", „1000m2", „1mil" ani „20Kč/m²" neprošly a padaly
     do hledání OBCE. Výsledek: nula nabídek na větu, které každý člověk
     rozumí. Rozdělí se tu, a jen když je za číslem ZNÁMÁ jednotka —
     parcelní číslo „769/2" ani obec s číslicí se tím nerozbije. */
  function rozdelSlepene(slova, psano) {
    var vsl = [], vps = [];
    for (var i = 0; i < slova.length; i++) {
      var t = slova[i], m = /^(\d+(?:[.,]\d+)?)(.+)$/.exec(t), jed = m && m[2];
      var zname = false;
      if (jed) {
        if (KM_JEDNOTKA.test(jed)) zname = true;
        else for (var n = 0; n < NASOBEK.length; n++) if (NASOBEK[n][0].test(jed)) { zname = true; break; }
      }
      /* Původní slovo se dělí na TÉMŽE místě. Kdyby mělo jinou délku
         (jiná normalizace písmen), radši se nedělí nic — špatně
         rozpůlené slovo je horší než nerozdělené. */
      var orig = psano[i] == null ? t : psano[i];
      if (!zname || orig.length !== t.length) { vsl.push(t); vps.push(orig); continue; }
      vsl.push(m[1], jed);
      vps.push(orig.slice(0, m[1].length), orig.slice(m[1].length));
    }
    return [vsl, vps];
  }

  function rozeber(dotaz) {
    var slova = norm(dotaz).split(' ').filter(Boolean);
    /* V ODZNAKU STOJÍ, CO ČLOVĚK NAPSAL. Dřív se popisek skládal ze
       znormalizovaných slov, takže „pole do 20 Kč/m²" vyrobilo odznak
       „do 20 kc/m²" a „do 20 Kč za metr" dokonce „do 20 kc/m2" — web
       člověku přepsal jeho vlastní větu do strojové podoby. U jednotek
       bez diakritiky („ha", „km", „mil") to vidět nebylo, u koruny ano. */
    var psano = puvodniSlova(dotaz, slova);
    var rozdelene = rozdelSlepene(slova, psano);
    slova = rozdelene[0]; psano = rozdelene[1];
    var usek = function (od, delka) { return psano.slice(od, od + delka).join(' '); };
    var vzato = new Array(slova.length);
    var ven = { druh: null, typ: null, kraj: null, site: [], nejakeSite: false,
      jenCelek: false, levne: false, zaMetrOd: null, zaMetrDo: null,
      cenaOd: null, cenaDo: null, plochaOd: null, plochaDo: null,
      okruh: null, okruhMisto: '', text: '', casti: [] };

    function zkus(od, fraze) {
      var f = fraze.split(' ');
      for (var i = 0; i < f.length; i++) {
        if (vzato[od + i] || slova[od + i] !== f[i]) return false;
      }
      return true;
    }
    function zaber(od, delka, cast) {
      for (var i = 0; i < delka; i++) vzato[od + i] = true;
      /* Odznak se ruší tak, že se z věty vyškrtnou slova, ze kterých
         vznikl. Dřív se škrtala slova POPISKU — jenže popisek bývá jiný
         než to, co člověk napsal: napíšu „bez podílu" a odznak říká
         „jen celé pozemky", napíšu „s elektřinou" a odznak říká
         „Elektřina". Slova se nepotkala a křížek nedělal nic; mrtvá
         byla polovina odznaků. Proto si každá část pamatuje SVOJE
         slova, ne svůj popisek. */
      cast.slova = slova.slice(od, od + delka);
      ven.casti.push(cast);
    }

    /* --- 0) Okruh kolem místa: „do 30 km od Brna", „50 km od Brna" ----
       Čte se PRVNÍ, aby si kilometry nespletl s cenou nikdo jiný: číslo
       nad deset tisíc se dál ve větě čte jako koruny, takže „do 20000 km"
       by se jinak stalo cenou a zbylo by „km od Brna".
       Místo se tu ještě nehledá — to, co ve větě zbude, si jako „kolem
       čeho" vezme až konec rozboru (viz níž). */
    for (var ki = 0; ki < slova.length && ven.okruh == null; ki++) {
      if (vzato[ki]) continue;
      var pred = OKRUH_PRED[slova[ki]] ? 1 : 0;
      var kpos = ki + pred;
      if (vzato[kpos] || vzato[kpos + 1]) continue;
      var kc = cislo(slova[kpos] || '');
      if (kc == null || !KM_JEDNOTKA.test(slova[kpos + 1] || '')) continue;
      if (!platnyOkruh(kc)) continue;
      ven.okruh = kc;
      /* V odznaku stojí jen vzdálenost; místo se k ní dopíše teprve,
         až se najde (web nesmí v odznaku tvrdit „od Brna", když Brno
         nenašel). Doplní ho js/main.js. */
      zaber(ki, pred + 2, { druh: 'okruh', smer: 'do', hodnota: kc,
        popis: 'do ' + slova[kpos] + ' km' });
    }

    /* --- 0b) ROZSAH OD–DO: „od 500 do 900 tisíc", „mezi 500 a 800 tisíci",
       „500 tisíc až 1 milion".
       Čte se PŘED jednosměrnými mezemi, jinak si „do 900 tisíc" vezme
       jednosměrná větev a dolní mez zůstane na hledání obce. Naměřeno
       před opravou:
         500 tisíc – 1 milion   → cenaDo 500 000 (dolní mez jako STROP!)
         mezi 500 a 800 tisíci  → cenaDo 800 000, „500" šlo hledat obec
         od 500 do 900 tisíc    → cenaDo 900 000, „500" šlo hledat obec
       Jednotka smí stát jen u druhého čísla („od 500 do 900 tisíc"):
       pak platí pro obě, protože tak se česky mluví. */
    var ROZSAH_PRED = { od: 1, mezi: 1 };
    var ROZSAH_SPOJ = { do: 1, a: 1, az: 1 };
    function cteCislo(iw) {
      var sk = cisloSkupiny(slova, iw);
      if (sk) return { hodnota: sk.hodnota, slov: sk.slov };
      var c1 = cislo(slova[iw] || '');
      return c1 == null ? null : { hodnota: c1, slov: 1 };
    }
    function cteJednotku(iw) {
      var j = slova[iw] || '';
      for (var n2 = 0; n2 < NASOBEK.length; n2++) if (NASOBEK[n2][0].test(j)) {
        return { nas: NASOBEK[n2], slov: 1 };
      }
      return null;
    }
    for (var ri = 0; ri < slova.length; ri++) {
      if (vzato[ri]) continue;
      var rPred = ROZSAH_PRED[slova[ri]] ? 1 : 0;
      var aPos = ri + rPred;
      var ra = cteCislo(aPos);
      if (!ra) continue;
      var rja = cteJednotku(aPos + ra.slov);
      var spoj = aPos + ra.slov + (rja ? rja.slov : 0);
      if (!ROZSAH_SPOJ[slova[spoj]]) continue;
      var rb = cteCislo(spoj + 1);
      if (!rb) continue;
      var rjb = cteJednotku(spoj + 1 + rb.slov);
      var rnas = rjb || rja;
      if (!rnas) {
        /* Bez jednotky platí totéž, co u jednosměrné meze: pod deseti
           tisíci se nic netipuje, aby „mezi 5 a 8" nebyla cena. */
        if (ra.hodnota < BEZ_JEDNOTKY_OD || rb.hodnota < BEZ_JEDNOTKY_OD) continue;
        rnas = { nas: [null, 1, 'cena'], slov: 0 };
      }
      var nasA = rja ? rja.nas : rnas.nas;
      var hodA = Math.round(ra.hodnota * nasA[1]);
      var hodB = Math.round(rb.hodnota * rnas.nas[1]);
      if (!(hodA < hodB)) continue;            // „od 900 do 500" není rozsah
      var kam = rnas.nas[2];
      if (kam === 'zaMetr') {
        if (ven.zaMetrOd != null || ven.zaMetrDo != null) continue;
        ven.zaMetrOd = hodA; ven.zaMetrDo = hodB;
      } else if (kam === 'plocha') {
        if (ven.plochaOd != null || ven.plochaDo != null) continue;
        ven.plochaOd = hodA; ven.plochaDo = hodB;
      } else {
        if (ven.cenaOd != null || ven.cenaDo != null) continue;
        ven.cenaOd = hodA; ven.cenaDo = hodB;
      }
      var rDelka = (spoj + 1 + rb.slov + (rjb ? rjb.slov : 0)) - ri;
      zaber(ri, rDelka, { druh: kam, smer: 'rozsah', hodnota: hodB, hodnotaOd: hodA,
        popis: usek(ri, rDelka) });
    }

    /* --- 1) Rozsahy s jednotkou: „do 1,5 mil", „nad 2 ha", „od 500 tis" --- */
    var SMERY = { do: 'do', pod: 'do', max: 'do', od: 'od', nad: 'od', min: 'od' };
    for (var i = 0; i < slova.length; i++) {
      if (vzato[i]) continue;
      var smer = SMERY[slova[i]];
      if (!smer) continue;
      /* Číslo může být psané po tisících („do 1 500 000"), a pak zabere
         víc než jedno slovo — jednotka se hledá až za ním. */
      var sk = cisloSkupiny(slova, i + 1);
      var slovCisla = sk ? sk.slov : 1;
      var c = sk ? sk.hodnota : cislo(slova[i + 1] || '');
      if (c == null) continue;
      var jp = i + 1 + slovCisla;              // kde může začínat jednotka
      var jed = slova[jp] || '';
      var delkaJed = 1;
      /* „Kč za metr" — tři slova, jedna jednotka. */
      for (var zf = 0; zf < ZA_METR_FRAZE.length; zf++) {
        var f3 = ZA_METR_FRAZE[zf];
        if (slova[jp] === f3[0] && slova[jp + 1] === f3[1] && slova[jp + 2] === f3[2]) {
          jed = 'kc/m2'; delkaJed = 3; break;
        }
      }
      var nas = null;
      for (var n = 0; n < NASOBEK.length; n++) if (NASOBEK[n][0].test(jed)) { nas = NASOBEK[n]; break; }
      /* Bez jednotky se dřív nehádalo vůbec — jenže „les do 100000" je
         jasná věta a celé „do 100000" padalo do textu, takže výpis byl
         prázdný. Statisícové číslo je v téhle větě vždycky cena
         v korunách. Malá čísla zůstávají textem: „do 5" může být
         cokoli a tipovat se nebude. */
      var delka = 1 + slovCisla + delkaJed;
      var delkaJedZapsana = true;
      if (!nas) {
        if (c < BEZ_JEDNOTKY_OD) continue;
        nas = [null, 1, 'cena'];
        delka = 1 + slovCisla;
        jed = 'Kč';
        delkaJedZapsana = false;
      }
      var hodnota = Math.round(c * nas[1]);
      var kde = nas[2];                          // 'cena', 'plocha' nebo 'zaMetr'
      if (kde === 'zaMetr') {
        ven[smer === 'do' ? 'zaMetrDo' : 'zaMetrOd'] = hodnota;
      } else {
        ven[kde + (smer === 'do' ? 'Do' : 'Od')] = hodnota;
      }
      /* V odznaku stojí to, co člověk NAPSAL („nad 2 ha"), ne co si z toho
         web přeložil („od 2 ha“). Jinak se odznak nedá spárovat s větou
         a rušení by působilo, že se maže něco jiného. */
      /* Bez jednotky si ji web domyslel, takže ji k odznaku dopíše;
         jinak se vezme přesně ten úsek věty, který odznak zabral. */
      zaber(i, delka, { druh: kde, smer: smer, hodnota: hodnota,
        popis: delka === 2 && !delkaJedZapsana ? usek(i, 2) + ' Kč' : usek(i, delka) });
    }

    /* --- 1b) Číslo s jednotkou BEZ „do" a „nad" ------------------------
       „Les 5 ha" je jasná věta, jenže celé „5 ha" dosud propadlo do
       hledání obce a výpis byl prázdný. Čte se to takhle:
         · výměra PŘIBLIŽNĚ — kdo píše 1000 m², nechce přijít o parcelu
           s 1050 m². Pásmo je ±25 % a v odznaku stojí „kolem", aby bylo
           poznat, že se nehledá přesné číslo.
         · cena jako STROP — „pozemek za 500 tisíc" je rozpočet, ne
           požadavek na cenu přesně pět set tisíc. */
    for (var bi = 0; bi < slova.length; bi++) {
      if (vzato[bi]) continue;
      var bc = cislo(slova[bi]);
      if (bc == null || bc <= 0) continue;
      var bjed = slova[bi + 1] || '';
      var bnas = null;
      for (var bn = 0; bn < NASOBEK.length; bn++) if (NASOBEK[bn][0].test(bjed)) { bnas = NASOBEK[bn]; break; }
      if (!bnas || vzato[bi + 1]) continue;
      var bhod = Math.round(bc * bnas[1]);
      if (bnas[2] === 'plocha') {
        if (ven.plochaOd != null || ven.plochaDo != null) continue;
        ven.plochaOd = Math.round(bhod * (1 - PRIBLIZNE));
        ven.plochaDo = Math.round(bhod * (1 + PRIBLIZNE));
        zaber(bi, 2, { druh: 'plocha', smer: 'kolem', hodnota: bhod,
          popis: 'kolem ' + usek(bi, 2) });
      } else if (bnas[2] === 'cena') {
        if (ven.cenaOd != null || ven.cenaDo != null) continue;
        ven.cenaDo = bhod;
        zaber(bi, 2, { druh: 'cena', smer: 'do', hodnota: bhod,
          popis: 'do ' + usek(bi, 2) });
      } else if (bnas[2] === 'zaMetr') {
        /* Táž úvaha jako u ceny o řádek výš: „20 Kč/m²" je strop, co je
           člověk ochoten dát za metr, ne požadavek na přesně dvacet.
           Bez tohohle zbylo „20 kc/m²" na hledání OBCE a výpis byl
           prázdný — stejná vada jako u slepeného „500tis". */
        if (ven.zaMetrOd != null || ven.zaMetrDo != null) continue;
        ven.zaMetrDo = bhod;
        zaber(bi, 2, { druh: 'zaMetr', smer: 'do', hodnota: bhod,
          popis: 'do ' + usek(bi, 2) });
      }
    }

    /* --- 2) Slovník: druh, typ nabídky, sítě, celek --- */
    function projdi(seznam, hotovo) {
      for (var s = 0; s < seznam.length; s++) {
        var zaznam = seznam[s];
        var fraze = vetsiPrvni(zaznam[zaznam.length - 1]);
        for (var f = 0; f < fraze.length; f++) {
          for (var i2 = 0; i2 < slova.length; i2++) {
            if (vzato[i2]) continue;
            if (!zkus(i2, fraze[f])) continue;
            if (hotovo(zaznam, i2, fraze[f].split(' ').length)) return;
          }
        }
      }
    }
    projdi(DRUHY, function (z, i2, d) {
      if (ven.druh) return false;
      ven.druh = z[0];
      zaber(i2, d, { druh: 'druh', hodnota: z[0], popis: z[0] });
      /* DRUH ŘEČENÝ DVAKRÁT SE SPOTŘEBUJE CELÝ.
         Web sám své druhy pojmenovává dvojslovně („Louka / travní
         porost", „Vinice / sad"), takže je lidi tak i píšou — a druhé
         slovo zbylo na hledání OBCE a výpis byl prázdný. Naměřeno:
           orná pole Znojmo            → obec „pole znojmo"   ✗
           louka travní porost Vsetín  → obec „louka vsetin"  ✗
           les lesní pozemek Šumava    → obec „les sumava"    ✗
         Spotřebují se jen názvy TÉHOŽ druhu: „louka les" musí dál zůstat
         loukou a slovo „les" nesmí zmizet, protože o druhu už bylo
         rozhodnuto a zahodit ho mlčky by bylo horší než ho nechat. */
      var dalsi = vetsiPrvni(z[z.length - 1]);
      for (var f2 = 0; f2 < dalsi.length; f2++) {
        var casti2 = dalsi[f2].split(' ');
        for (var j = 0; j < slova.length; j++) {
          if (vzato[j] || !zkus(j, dalsi[f2])) continue;
          for (var k = 0; k < casti2.length; k++) vzato[j + k] = true;
          /* Do odznaku se ta slova dopíšou, ať je křížek umí vyškrtnout
             z věty — jinak by po zrušení odznaku zbylo „pole" a hledání
             obce by se rozbilo podruhé. */
          ven.casti[ven.casti.length - 1].slova =
            ven.casti[ven.casti.length - 1].slova.concat(slova.slice(j, j + casti2.length));
        }
      }
      return true;
    });
    /* Kraje se čtou stejně jako druh, typ a sítě. Na pořadí tu nezáleží:
       slova se porovnávají celá (viz zkus()), takže se „Jihomoravský"
       nemůže potkat s žádným druhem ani typem. Zkoušeno přeházením —
       výsledek se nezměnil. */
    projdi(KRAJE, function (z, i2, d) {
      if (ven.kraj) return false;
      ven.kraj = z[0];
      zaber(i2, d, { druh: 'kraj', hodnota: z[0], popis: z[1] === 'Praha' ? 'Praha' : z[1] + ' kraj' });
      return true;
    });
    projdi(TYPY, function (z, i2, d) {
      if (ven.typ) return false;
      ven.typ = z[0];
      zaber(i2, d, { druh: 'typ', hodnota: z[0], popis: z[1] });
      return false;
    });
    projdi(SITE, function (z, i2, d) {
      if (ven.site.indexOf(z[0]) >= 0) return false;
      ven.site.push(z[0]);
      zaber(i2, d, { druh: 'sit', hodnota: z[0], popis: z[1] });
      return false;
    });
    /* Obecné „sítě" se čtou AŽ PO konkrétních: „s elektřinou a sítěmi"
       má hlásit elektřinu, ne mlhavé „něco tam je". */
    var obecne = vetsiPrvni(SITE_OBECNE);
    var obecneHotovo = false;
    for (var oi = 0; oi < obecne.length && !obecneHotovo; oi++) {
      for (var oj = 0; oj < slova.length; oj++) {
        if (vzato[oj] || !zkus(oj, obecne[oi])) continue;
        var dl = obecne[oi].split(' ').length;
        if (ven.site.length) {
          /* Konkrétní síť má přednost — ale to slovo se musí POHLTIT
             i tak. Kdyby zbylo v textu, hledala by se obec „sítěmi"
             a věta „s elektřinou a sítěmi" by vrátila prázdno, tedy
             pravý opak toho, oč v ní jde. Filtr nepřidává: elektřina
             už je konkrétnější. */
          for (var ok2 = 0; ok2 < dl; ok2++) vzato[oj + ok2] = true;
        } else {
          ven.nejakeSite = true;
          zaber(oj, dl, { druh: 'site', hodnota: 'nejake', popis: 'uvedené sítě' });
        }
        obecneHotovo = true;
        break;
      }
    }
    var lv = vetsiPrvni(LEVNE);
    for (var li = 0; li < lv.length && !ven.levne; li++) {
      for (var lj = 0; lj < slova.length; lj++) {
        if (vzato[lj] || !zkus(lj, lv[li])) continue;
        ven.levne = true;
        zaber(lj, lv[li].split(' ').length, { druh: 'levne', hodnota: true, popis: 'pod obvyklou cenou' });
        break;
      }
    }
    var celek = vetsiPrvni(CELEK);
    for (var ci = 0; ci < celek.length && !ven.jenCelek; ci++) {
      for (var cj = 0; cj < slova.length; cj++) {
        if (vzato[cj] || !zkus(cj, celek[ci])) continue;
        ven.jenCelek = true;
        zaber(cj, celek[ci].split(' ').length, { druh: 'celek', hodnota: true, popis: 'jen celé pozemky' });
        break;
      }
    }

    /* --- 3) Co zbylo, je text na hledání místa --- */
    var zbytek = [];
    for (var z2 = 0; z2 < slova.length; z2++) {
      if (vzato[z2] || VYPLN[slova[z2]]) continue;
      zbytek.push(slova[z2]);
    }
    ven.text = zbytek.join(' ');
    /* Když věta nese okruh, není zbytek hledáním obce, ale STŘEDEM toho
       okruhu — „do 30 km od Brna" nehledá obec Brna (ta neexistuje,
       je to 2. pád), hledá kolem Brna. Kdyby zbytek zůstal i textem,
       vyšla by nula: text se hledá podřetězcem a „brna" v „Brno" není.
       Slova místa se přidají k odznaku okruhu, aby ho křížek zrušil
       celý; půlka věty („od Brna") by po zrušení nehledala nic. */
    if (ven.okruh != null && zbytek.length) {
      ven.okruhMisto = ven.text;
      ven.text = '';
      for (var oc = 0; oc < ven.casti.length; oc++) {
        if (ven.casti[oc].druh !== 'okruh') continue;
        ven.casti[oc].slova = (ven.casti[oc].slova || []).concat(zbytek);
        break;
      }
    }
    return ven;
  }

  return { norm: norm, rozeber: rozeber, platnyOkruh: platnyOkruh,
    OKRUH_MIN: OKRUH_MIN, OKRUH_MAX: OKRUH_MAX,
    DRUHY: DRUHY, TYPY: TYPY, SITE: SITE, KRAJE: KRAJE, OSTATNI: OSTATNI };
});
