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
/* Modul s výpočtem vzdálenosti se podává LÍNĚ, ne hned při načtení.
   Dva důvody, oba naměřené: v index.html stojí js/okruh.js AŽ ZA tímhle
   souborem, takže v okamžiku vzniku ještě neexistuje, a hlidani.html ho
   dřív nenačítala vůbec. Kdyby se odkaz uložil natvrdo, zůstal by
   navždycky prázdný a hlídání s okruhem by tiše nepouštělo nic. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(function () { return require('./okruh.js'); });
  } else {
    root.PKHlidani = factory(function () { return root.PKOkruh; });
  }
})(typeof self !== 'undefined' ? self : this, function (dejOkruh) {
  'use strict';

  /* KOLIK METRŮ ZA TY PENÍZE OPRAVDU DOSTANU.
   *
   * U spoluvlastnického podílu stojí v inzerátu výměra CELÉ parcely, ale
   * cena jen za zlomek. Kdo dělí cenu celou výměrou, dostane číslo, které
   * neplatí pro nikoho — v Praze tím vyšel podíl 1/13 lesa jako 75 Kč/m²,
   * tedy nejlevnější nabídka ze všech, zatímco kupující platí 969 Kč/m²
   * a je to ta nejdražší. Když velikost podílu neznáme, nevrací se NIC:
   * raději žádné číslo než číslo, o kterém víme, že neplatí.
   *
   * TOHLE JE DRUHÁ KOPIE TÉHOŽ VÝPOČTU, co má js/ceny.js — a je to
   * schválně. Cenový model se načítá na 1 998 stránkách, tenhle soubor na
   * 2 111; na těch zbývajících (okresy, kraje, rádci) by hlídání jinak
   * cenu za metr počítat neumělo. Přidat cenový model (40 kB) kvůli deseti
   * řádkům všude, nebo vyrobit třetí soubor, který by se musel načítat
   * ještě dřív než oba, je horší než tohle: ŽE SE TY DVĚ KOPIE NEROZEŠLY,
   * HLÍDÁ scripts/test-hlidani.mjs — porovnává je na všech nabídkách
   * z data/opportunities.json a na hraničních případech (podíl bez
   * zlomku, rozbitý zlomek, nulová výměra). */
  function zlomekPodilu(d) {
    if (!d) return null;
    if (!d.podil) return 1;
    var m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(d.zlomek || ''));
    if (!m) return null;
    var citatel = +m[1], jmenovatel = +m[2];
    if (!(citatel > 0) || !(jmenovatel > 0) || citatel > jmenovatel) return null;
    return citatel / jmenovatel;
  }
  function vymeraVCene(d) {
    if (!d || typeof d.area !== 'number' || !(d.area > 0)) return null;
    /* Příznak `vymera_podilu` znamená, že uložená výměra UŽ je podílová
       a zlomkem se nedělí (celé odůvodnění i měření jsou u téže funkce
       v js/ceny.js). Tady to musí být taky: scripts/test-strop-ceny.mjs
       hlídá, že obě kopie dávají na všech datech totéž — a přesně to
       tuhle vynechanou polovinu odhalilo. */
    if (d.vymera_podilu) return d.area;
    var z = zlomekPodilu(d);
    return z == null ? null : d.area * z;
  }
  /* Strop uvěřitelnosti musí být stejný jako v js/ceny.js — tam je
     i celé odůvodnění s naměřenými čísly. Tady stojí jen hodnota,
     protože tenhle soubor musí fungovat i bez ceny.js (hlidani.html ho
     dřív nenačítala vůbec). Že se ty dvě kopie nerozešly, hlídá
     scripts/test-hlidani.mjs — a právě on tenhle rozchod zachytil, když
     jsem mez přidal jen do jedné z nich. */
  var MEZ_NEUVERITELNA = 30000;
  /** Cena za metr, který kupující opravdu dostane. null = nevíme. */
  /* DVOJČE. Tahle funkce stojí doslovně i v js/ceny.js. Rozesílání
     upozornění běží v Node, kde se prohlížečový modul js/ceny.js
     nenačte, takže si pravidlo musí nést s sebou.
     Když se kopie rozejdou, nic nespadne — jen začne web tvrdit jiné
     číslo než mail o téže nabídce. Hlídá to scripts/test-strop-ceny.mjs:
     prožene obě kopie celými daty a výsledek musí být na znak stejný. */
  function zaMetr(d) {
    var v = vymeraVCene(d);
    if (!(v > 0) || !d || !(d.price > 0)) return null;
    var zm = d.price / v;
    return zm > MEZ_NEUVERITELNA ? null : zm;
  }

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
  /* TÁŽ DRAŽBA DVAKRÁT — a klíč shody ji nechytí.
   *
   * Nahlášeno z webu a změřeno: ze 166 vedených dražeb a exekucí bylo
   * jen 106 skutečných. 45 jich tam leželo dvakrát, dvacet z nich pod
   * DVĚMA RŮZNÝMI OBCEMI (okdrazby 28338 jako Úštěk i jako Kalovice —
   * Kalovice jsou část Úštěku) a dvacet čtyři s DVĚMA RŮZNÝMI VÝMĚRAMI,
   * a tedy s nesmyslnou cenou za metr: dražba 28319 vyšla jednou na
   * 25 Kč/m² a podruhé na 134 Kč/m².
   *
   * Klíč shody (obec, okres, cena, výměra, druh) je na to krátký —
   * rozcházely se právě obec a výměra. Jenže obě ty nabídky odkazovaly
   * na TUTÁŽ stránku dražby. Adresa zdroje je tedy silnější identita než
   * cokoli, co se dá z inzerátu přečíst: když dva záznamy míří na jednu
   * dražbu, je to jedna dražba, i kdyby se ve všem ostatním lišily.
   *
   * Adresa se před porovnáním SROVNÁ. Příčina té duplicity byla, že
   * starší záznamy nesly „okdrazby.cz" a novější „www.okdrazby.cz" —
   * pro člověka táž stránka, pro porovnání řetězců dvě různé.
   *
   * Srovnává se jen protokol, „www." a lomítko na konci. Dotaz za
   * otazníkem se NEODSTRAŇUJE: u některých zdrojů je v něm identita
   * nabídky, takže by se jeho zahozením slily různé nabídky do jedné. */
  function klicZdroje(d) {
    var u = (d && d.url) ? String(d.url) : '';
    if (!u) return null;
    return u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
  }

  /* KTERÝ ZE DVOU ZÁZNAMŮ TÉŽE DRAŽBY JE TEN SPRÁVNÝ.
   *
   * Změřeno na všech 45 dvojicích: starší záznam měl parcelní číslo ve
   * všech 45 případech a vždy menší nebo stejnou výměru; novější měl
   * v názvu zdroje „OK dražby" a ve všech 24 rozdílných případech
   * výměru větší. Starší tedy popisuje JEDNU PARCELU, novější CELOU
   * DRAŽBU — a vyvolávací cena platí pro celou dražbu, ne pro jednu
   * parcelu z ní. Správná je proto ta větší výměra; s menší vycházela
   * cena za metr pětkrát vyšší, než jaká je.
   *
   * Parcelní číslo ze staršího záznamu se přebírá JEN TEHDY, když se
   * výměry shodují. Když se liší, popisoval starší záznam jednu parcelu
   * z několika — přilepit jeho číslo k výměře celé dražby by znamenalo
   * tvrdit, že ta parcela má výměru všech dohromady. */
  function lepsiZeDvou(a, b) {
    var va = (typeof a.area === 'number') ? a.area : 0;
    var vb = (typeof b.area === 'number') ? b.area : 0;
    var lepsi, druhy;
    if (va !== vb) {
      lepsi = (vb > va) ? b : a;
    } else {
      /* Při shodné výměře rozhoduje, který záznam je ŽIVÝ. Starší pochází
         z dřívější podoby stahovače a ten ho už neobnovuje — novější se
         obnovuje při každém běhu, takže termín i cena u něj drží krok. */
      var da = String(a.first_seen || ''), db = String(b.first_seen || '');
      lepsi = (db > da) ? b : a;
    }
    druhy = (lepsi === a) ? b : a;
    /* Parcelní číslo z toho druhého se přebírá JEN při shodné výměře —
       viz komentář výš: u rozdílné výměry popisoval jednu parcelu
       z několika a jeho číslo by k výměře celé dražby nepatřilo. */
    if (va === vb && !znamaParcela(lepsi) && znamaParcela(druhy)) {
      var kopie = {};
      for (var k in lepsi) if (Object.prototype.hasOwnProperty.call(lepsi, k)) kopie[k] = lepsi[k];
      kopie.parcel = druhy.parcel;
      return kopie;
    }
    return lepsi;
  }

  function bezDuplicit(list) {
    var skupiny = {}, ven = [];
    /* NEJDŘÍV PODLE ADRESY ZDROJE. Až to, co zbude, prochází klíčem
       shody — ten řeší jiný případ: tutéž nabídku ze dvou různých
       zdrojů, kde adresa pochopitelně shodná není. */
    var podleZdroje = {}, poZdroji = [];
    for (var z = 0; z < (list || []).length; z++) {
      var zd = list[z], kz = klicZdroje(zd);
      if (!kz) { poZdroji.push(zd); continue; }
      if (!Object.prototype.hasOwnProperty.call(podleZdroje, kz)) {
        podleZdroje[kz] = poZdroji.length;
        poZdroji.push(zd);
      } else {
        var kam = podleZdroje[kz];
        poZdroji[kam] = lepsiZeDvou(poZdroji[kam], zd);
      }
    }
    list = poZdroji;
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
       Počítá se z výměry, KTERÁ KUPUJÍCÍMU PŘIPADNE, viz zaMetr() výš:
       dělit celou výměrou znamenalo pouštět do uloženého hledání „do 20
       Kč/m²" právě ty nejklamavější nabídky — spoluvlastnické podíly,
       které po přepočtu stojí desetinásobek. Mapa i stránka pozemku to
       tak počítají odjakživa (js/ceny.js), hlídání ne. Komu přijde
       upozornění, tomu má přijít na to, co si uložil. */
    if (s.max_perm2) {
      var zm = zaMetr(d);
      if (zm == null) return false;
      if (zm > s.max_perm2) return false;
    }
    /* JEN CELÉ POZEMKY. Mapa ten filtr umí odjakživa (js/main.js, okCelek),
       hlídání ne — a to je vidět na číslech: z 2 018 nabídek je 530
       spoluvlastnických podílů, tedy 26 %, a 71 z nich je menší než
       desetina (zlomky jako 9/792 nebo 1/71). Kdo si uložil okres,
       dostával tedy upozornění, z nichž čtvrtina byla na ideální podíl
       na poli — pro většinu lidí bezcenný, a ještě vypadá jako trhák,
       protože v ceně je zlomek, ale výměra celé parcely.
       Prázdná hodnota znamená „neřeším", tedy přesně dosavadní chování. */
    if (s.jen_celek && d.podil) return false;
    /* OKRUH OD MÍSTA. Mapa to umí odjakživa („Pozemky v okolí"),
       hlídání znalo jedinou podobu místa — NÁZEV okresu nebo obce.
       Jenže kdo bydlí v Tišnově a dojede za hodinu, nehledá „okres
       Brno-venkov": z okolí Tišnova do 25 km spadá pět okresů naráz
       a žádný z nich celý.
       Počítá se TÝMŽ modulem jako na mapě (PKOkruh.km), aby upozornění
       chodila přesně na to, co člověk viděl, když si hledání ukládal.
       Kdyby modul chyběl, hlídání radši NEPUSTÍ nic než aby pouštělo
       všechno: tiché rozšíření okruhu na celou republiku by se poznalo
       až podle záplavy upozornění. */
    if (s.okruh_km > 0) {
      if (!isFinite(s.stred_lat) || !isFinite(s.stred_lng)) return false;
      if (!isFinite(d.lat) || !isFinite(d.lng)) return false;
      var O = dejOkruh && dejOkruh();
      var okruhKm = (O && O.km) ? O.km({ lat: s.stred_lat, lng: s.stred_lng }, d) : Infinity;
      if (!(okruhKm <= s.okruh_km)) return false;
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

  /* KTERÉ pozemky jsou pro jedno uložené hledání nové. Jedno jediné
     místo, kde se to počítá — počet i výpis z něj vycházejí ze stejné
     hromádky, takže se nemohou rozejít.

     Rozhodují KLÍČE, ne záznamy: tatáž nabídka bývá v datech dvakrát,
     jednou z každého zdroje (dnes 13 dvojic z 1 970), a jako „dvě nové"
     by to byla lež o jednom pozemku.

     Přesně tahle past už jednou sklapla. Tady se počítalo přes klíče,
     ale centrum upozornění (js/upozorneni-feed.js) si filtrovalo záznamy
     po svém — a hlásilo 1 970 nových pozemků, zatímco stránka hlídání
     i mapa jich ukazovaly 1 957. Dvě čísla pro tutéž věc, a to jedno
     z nich byl odznak, na který se klikalo právě na tu druhou stránku.

     Řadí se od nejnovějšího. Pozemky bez data (robot je ještě
     nepodepsal) jdou dospodu, ať se netváří jako to nejčerstvější. */
  function noveProHledani(s, data) {
    var videno = {}, identityVidene = {};
    (s && s.seen_keys ? s.seen_keys : []).forEach(function (k) {
      videno[k] = 1;
      var b = bezCeny(k);
      if (b) identityVidene[b.identita] = 1;
    });
    var mam = {}, out = [];
    (data || []).forEach(function (d) {
      var k = keyOf(d);
      if (mam[k] || videno[k] || !matches(s, d)) return;
      /* Týž pozemek s jinou cenou není nový — patří do
         zmeneneProHledani(). Bez tohohle se ohlásil jako nový, což
         nebyla pravda a zahodilo to lepší zprávu („zlevnilo z X na Y"). */
      var b = bezCeny(k);
      if (b && identityVidene[b.identita]) return;
      mam[k] = 1;
      out.push(d);
    });
    out.sort(function (a, b) {
      return String(b.first_seen || '').localeCompare(String(a.first_seen || ''));
    });
    return out;
  }
  // Kolik jich je. Nikdy se nepočítá jinak než délkou toho seznamu výš.
  function novychProHledani(s, data) { return noveProHledani(s, data).length; }

  /* --- ZMĚNA CENY NENÍ NOVÝ POZEMEK --------------------------------

     Klíč obsahuje cenu, takže když prodávající cenu upraví, vznikne
     klíč, který uživatel nikdy neviděl — a pozemek se ohlásil jako
     NOVÝ. To není pravda a zahazuje to lepší zprávu: napříč dvaceti
     verzemi dat se cena změnila 12× ze 37 085 pozorování (0,03 %) a
     byly to věci, které stojí za vědění — Loučovice 8 999 000 →
     7 900 000 Kč, Heřmanice 1 690 000 → 1 590 000.

     Cenu proto z klíče NEVYHAZUJEME (tím bychom o ten signál přišli);
     jen se pozná, že jde o týž pozemek s jinou cenou. Slouží k tomu
     identita bez ceny, spočítaná z klíče: klíč má šest částí oddělených
     svislítkem, cena je pátá. Že se to dá takhle rozebrat, drží
     scripts/test-hlidani.mjs — žádné pole v datech svislítko neobsahuje
     a nejdelší klíč má 71 znaků, tedy ani zdaleka nedosáhne na 240,
     kde se klíč zkracuje. */
  var CENA_V_KLICI = 4;
  function bezCeny(klic) {
    var c = String(klic == null ? '' : klic).split('|');
    if (c.length !== 6) return null;      // jiný tvar klíče — nehádáme
    var stara = c[CENA_V_KLICI];
    c.splice(CENA_V_KLICI, 1);
    return { identita: c.join('|'), cena: stara };
  }

  /* Pozemky, které uživatel zná, ale mezitím u nich změnili cenu.
     Vrací i tu starou cenu — bez ní se nedá napsat „zlevnilo z X na Y",
     a právě to je na tom to užitečné. */
  function zmeneneProHledani(s, data) {
    var videno = {}, podleIdentity = {};
    (s && s.seen_keys ? s.seen_keys : []).forEach(function (k) {
      videno[k] = 1;
      var b = bezCeny(k);
      if (b) podleIdentity[b.identita] = b.cena;
    });
    var mam = {}, out = [];
    (data || []).forEach(function (d) {
      var k = keyOf(d);
      if (mam[k] || videno[k] || !matches(s, d)) return;
      var b = bezCeny(k);
      if (!b || !(b.identita in podleIdentity)) return;      // opravdu nový
      var stara = parseInt(podleIdentity[b.identita], 10);
      if (!isFinite(stara) || stara === (d.price | 0)) return;
      mam[k] = 1;
      out.push({ pozemek: d, staraCena: stara });
    });
    out.sort(function (a, b) {
      return String(b.pozemek.first_seen || '').localeCompare(String(a.pozemek.first_seen || ''));
    });
    return out;
  }

  /* Klíče VŠECH pozemků, které na hledání sedí — ne jen nových.
     Tohle se ukládá do seen_keys, když člověk klepne na „označit jako
     viděné": mark_search_seen tím polem celé seen_keys PŘEPÍŠE.

     Dřív se posílaly klíče jen NOVÝCH pozemků a tím se o zbytek přišlo.
     Chovalo se to pak takhle (změřeno na okrese Kolín, 20 pozemků):
       1. návštěva  20 nových → označí → seen_keys 20
       2. znovu      0 nových                                  ✓
       3. robot přidá 3 → 3 nové → označí → seen_keys už jen 3
       4. znovu     20 „nových" — těch, co člověk dávno viděl   ✕
       5. znovu      3 „nové"  … a pak pořád dokola 20 / 3
     Odznak se tedy nikdy neusadil a „nové pozemky" lhaly. Stačilo
     k tomu, aby robot jednou něco přidal — proto to tak dlouho vydrželo.

     Kolik se toho posílá: u hlídání celé ČR je to dnes 1 956 klíčů,
     tedy 84 kB, nejdelší klíč 71 znaků. Na občasné klepnutí „označit
     jako viděné" to je v pořádku a víc než tolik pozemků v datech není.
     Zkracovat ten seznam nemá smysl — právě tím zkrácením ta chyba
     vznikla. */
  function kliceProHledani(s, data) {
    var mam = {}, out = [];
    (data || []).forEach(function (d) {
      var k = keyOf(d);
      if (mam[k] || !matches(s, d)) return;
      mam[k] = 1;
      out.push(k);
    });
    return out;
  }

  /* Součet přes všechna hledání: kolik nových věcí na člověka čeká.
     Jeden pozemek může sedět na dvě hledání; počítá se jednou, ať se
     číslo nenafukuje.

     DNES HO NIKDO NEVYKRESLUJE. Býval to odznak v nabídce a ten šel
     pryč s Upozorněními. Nechává se tu schválně: je to pravidlo
     HLÍDÁNÍ, ne upozornění, a jeho zkoušky drží slučování duplicit
     i započítání zlevnění — tedy chování, které živé zůstává.

     Co je nové, se tu nerozhoduje podruhé — bere se z noveProHledani().
     Vlastní kopie toho pravidla tu dřív byla a právě tím se rozešla
     s centrem upozornění; nemá smysl si o to říkat znovu. */
  function novychCelkem(hledani, data) {
    var nove = {};
    (hledani || []).forEach(function (s) {
      noveProHledani(s, data).forEach(function (d) { nove[keyOf(d)] = 1; });
      /* Změna ceny se na odznaku počítá taky — centrum ji ukazuje jako
         vlastní upozornění („1 pozemek zlevnil"), takže odznak, který by
         ji vynechal, by hlásil menší číslo než stránka pod ním. Přesně
         to se tu už jednou stalo u překrývajících se hledání. */
      zmeneneProHledani(s, data).forEach(function (x) { nove[keyOf(x.pozemek)] = 1; });
    });
    return Object.keys(nove).length;
  }

  /* CO SE Z HLEDÁNÍ OPRAVDU ULOŽILO.
   *
   * Hlídání se ukládá na tři stupně: když databáze novější sloupce ještě
   * nemá, web ustoupí k té podobě, kterou umí, a člověku řekne, co se
   * nepropsalo. Jenže hned po uložení se ještě označují dnešní nabídky
   * za „viděné", aby nepřišly jako nové — a ta množina se MUSÍ počítat
   * ze stejných kritérií, jaká v databázi doopravdy leží.
   *
   * Když se spletou, chyba je tichá a nepříjemná: síto na „viděné" je
   * přísnější než to, kterým hlídání pak porovnává, takže všechno, co
   * odfiltruje navíc, se druhý den ozve jako nové. U „jen celých
   * pozemků" je to 530 nabídek z 2 018 — čtvrtina dat v jednom
   * upozornění, hned po uložení prvního hlídání.
   *
   * Proto to rozhodnutí nestojí ve stránce, ale tady, kde se dá zkoušet:
   * scripts/test-hlidani.mjs. */
  var OKRUH_SLOUPCE = ['stred_lat', 'stred_lng', 'okruh_km'];
  var SLOUPCE_STUPNU = {
    // nejnovejsi podoba — vsechno vcetne okruhu
    celek: null,
    // bez okruhu (supabase/saved-searches-okruh.sql nespusten)
    bezOkruhu: OKRUH_SLOUPCE,
    // a navic bez „jen cele pozemky" (saved-searches-celek.sql nespusten)
    siroke: OKRUH_SLOUPCE.concat(['jen_celek']),
    // nejstarsi podoba (ani saved-searches-vice.sql nespusten)
    uzke: OKRUH_SLOUPCE.concat(['jen_celek', 'min_price', 'max_area', 'max_perm2'])
  };
  function kriteriaUlozena(k, uroven) {
    if (!k) return k;
    var pryc = SLOUPCE_STUPNU[uroven];
    if (pryc === undefined) throw new Error('neznámý stupeň uložení: ' + uroven);
    if (pryc === null) return k;
    var out = {};
    for (var kl in k) {
      if (!Object.prototype.hasOwnProperty.call(k, kl)) continue;
      if (pryc.indexOf(kl) >= 0) continue;
      out[kl] = k[kl];
    }
    return out;
  }

  return {
    tyzPozemek: tyzPozemek, normd: normd, keyOf: keyOf, matches: matches,
           kriteriaUlozena: kriteriaUlozena, STUPNE_ULOZENI: SLOUPCE_STUPNU,
           mistoSedi: mistoSedi, druhSedi: druhSedi,
           klicShody: klicShody, bezDuplicit: bezDuplicit,
           noveProHledani: noveProHledani, novychProHledani: novychProHledani, kliceProHledani: kliceProHledani,
           zmeneneProHledani: zmeneneProHledani, bezCeny: bezCeny, novychCelkem: novychCelkem,
           /* Ven jen kvůli hlídači: scripts/test-hlidani.mjs porovná
              vypsaný seznam s data/okresy.json. Bez toho by se rozešel
              potichu — chování se totiž změní jen u jména, které je
              předponou jiného okresu, tedy dnes jedině u Prahy. */
           /* Ven kvůli zkoušce, která tenhle výpočet porovnává
              s js/ceny.js — viz komentář u zaMetr(). */
           zaMetr: zaMetr, vymeraVCene: vymeraVCene, zlomekPodilu: zlomekPodilu,
           OKRESY: OKRESY };
});
