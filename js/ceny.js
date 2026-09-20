/* Cenový model — jediné místo, kde se počítá, co je pozemek zhruba hodný.
 *
 * Proč zvlášť: mapa (js/main.js) i stránka pozemku (js/pozemek.js) měly každá
 * vlastní kopii srovnávání cen. Kopie se rozešly — stránka pozemku hlásila
 * „Výhodná cena" i u nabídek, které mapa už odmítala jako nevěrohodné.
 * Teď je model jeden a testuje se sám o sobě (scripts/test-ceny.mjs).
 *
 * Co model umí a co NEUMÍ — tohle je důležité a píše se to i uživateli:
 * pracujeme s cenami NABÍDKOVÝMI (inzeráty) a s vyvolávacími cenami dražeb.
 * Za kolik se pozemek nakonec opravdu prodal, ve veřejných zdrojích není.
 * Odhad proto říká „obvyklá nabídková cena podobných pozemků v okolí“,
 * ne „tržní cena“. Kdo si to splete, přeplatí.
 *
 * Používá se přes globální PK_CENY (žádné moduly — web je prosté skripty).
 */
(function (root) {
  'use strict';

  function hasArea(d) { return typeof d.area === 'number' && d.area > 0; }

  function druhGroup(s) {
    s = (s || '').toLowerCase();
    if (s.indexOf('les') !== -1) return 'Lesní pozemek';
    if (s.indexOf('stavební') !== -1 || s.indexOf('zastav') !== -1) return 'Stavební / zastavěná';
    if (s.indexOf('orná') !== -1) return 'Orná půda';
    if (s.indexOf('zahrad') !== -1) return 'Zahrada';
    if (s.indexOf('travní') !== -1 || s.indexOf('louk') !== -1 || s.indexOf('pastvin') !== -1) return 'Louka / travní porost';
    if (s.indexOf('vinice') !== -1 || s.indexOf('sad') !== -1) return 'Vinice / sad';
    if (s.indexOf('ostatní') !== -1) return 'Ostatní plocha';
    return 'Jiný pozemek';
  }

  /* Okres → kraj. Bylo to jen v js/main.js, takže cenový model o krajích
   * nevěděl a odhad rovnou padal na celostátní medián. Patří to sem —
   * používá to model i mapa. */
  var OKRES_KRAJ = {
  'Hlavní město Praha':'Praha','Praha':'Praha',
  'Benešov':'Středočeský','Beroun':'Středočeský','Kladno':'Středočeský','Kolín':'Středočeský','Kutná Hora':'Středočeský','Mělník':'Středočeský','Mladá Boleslav':'Středočeský','Nymburk':'Středočeský','Praha-východ':'Středočeský','Praha-západ':'Středočeský','Příbram':'Středočeský','Rakovník':'Středočeský',
  'České Budějovice':'Jihočeský','Český Krumlov':'Jihočeský','Jindřichův Hradec':'Jihočeský','Písek':'Jihočeský','Prachatice':'Jihočeský','Strakonice':'Jihočeský','Tábor':'Jihočeský',
  'Domažlice':'Plzeňský','Klatovy':'Plzeňský','Plzeň-město':'Plzeňský','Plzeň-jih':'Plzeňský','Plzeň-sever':'Plzeňský','Rokycany':'Plzeňský','Tachov':'Plzeňský',
  'Cheb':'Karlovarský','Karlovy Vary':'Karlovarský','Sokolov':'Karlovarský',
  'Děčín':'Ústecký','Chomutov':'Ústecký','Litoměřice':'Ústecký','Louny':'Ústecký','Most':'Ústecký','Teplice':'Ústecký','Ústí nad Labem':'Ústecký',
  'Česká Lípa':'Liberecký','Jablonec nad Nisou':'Liberecký','Liberec':'Liberecký','Semily':'Liberecký',
  'Hradec Králové':'Královéhradecký','Jičín':'Královéhradecký','Náchod':'Královéhradecký','Rychnov nad Kněžnou':'Královéhradecký','Trutnov':'Královéhradecký',
  'Chrudim':'Pardubický','Pardubice':'Pardubický','Svitavy':'Pardubický','Ústí nad Orlicí':'Pardubický',
  'Havlíčkův Brod':'Vysočina','Jihlava':'Vysočina','Pelhřimov':'Vysočina','Třebíč':'Vysočina','Žďár nad Sázavou':'Vysočina',
  'Blansko':'Jihomoravský','Brno-město':'Jihomoravský','Brno-venkov':'Jihomoravský','Břeclav':'Jihomoravský','Hodonín':'Jihomoravský','Vyškov':'Jihomoravský','Znojmo':'Jihomoravský',
  'Jeseník':'Olomoucký','Olomouc':'Olomoucký','Prostějov':'Olomoucký','Přerov':'Olomoucký','Šumperk':'Olomoucký',
  'Kroměříž':'Zlínský','Uherské Hradiště':'Zlínský','Vsetín':'Zlínský','Zlín':'Zlínský',
  'Bruntál':'Moravskoslezský','Frýdek-Místek':'Moravskoslezský','Karviná':'Moravskoslezský','Nový Jičín':'Moravskoslezský','Opava':'Moravskoslezský','Ostrava-město':'Moravskoslezský'
  };

  /* Kraj v 6. pádu. Skládat větu jako „v " + název + " kraji" dává
   * „v Středočeský kraji" — a u Vysočiny dokonce „v Vysočina kraji".
   * Čeština tohle neodpustí a čtenář si toho všimne dřív než čehokoli
   * jiného, co na té stránce stojí. */
  var KRAJ_KDE = {
    'Praha': 'v Praze',
    'Středočeský': 've Středočeském kraji',
    'Jihočeský': 'v Jihočeském kraji',
    'Plzeňský': 'v Plzeňském kraji',
    'Karlovarský': 'v Karlovarském kraji',
    'Ústecký': 'v Ústeckém kraji',
    'Liberecký': 'v Libereckém kraji',
    'Královéhradecký': 'v Královéhradeckém kraji',
    'Pardubický': 'v Pardubickém kraji',
    'Vysočina': 'na Vysočině',
    'Jihomoravský': 'v Jihomoravském kraji',
    'Olomoucký': 'v Olomouckém kraji',
    'Zlínský': 've Zlínském kraji',
    'Moravskoslezský': 'v Moravskoslezském kraji'
  };
  /** „ve Středočeském kraji" / „na Vysočině" / „v okrese Benešov". */
  function kdeText(uroven, nazev) {
    if (uroven === 'okres') return 'v okrese ' + nazev;
    return KRAJ_KDE[nazev] || ('v kraji ' + nazev);
  }

  function median(serazene) {
    if (!serazene.length) return null;
    var n = serazene.length, p = Math.floor(n / 2);
    return n % 2 ? serazene[p] : (serazene[p - 1] + serazene[p]) / 2;
  }

  /* Postaví z dat indexy cen za m². Vrací objekt s metodami, ne globální stav —
   * ať se dá v testu postavit několik modelů vedle sebe. */
  function postav(DATA, okresKraj) {
    okresKraj = okresKraj || OKRES_KRAJ;
    var podleTypu = {};     // type|druh  → ceny za m² (na percentil a na věrohodnost)
    var nabidkyOkres = {};  // druh|okres → ceny za m² POUZE z běžných nabídek
    var nabidkyKraj = {};
    var nabidkyCR = {};

    DATA.forEach(function (d) {
      if (!hasArea(d) || !d.price) return;
      var g = druhGroup(d.druh), m2 = d.price / d.area;
      (podleTypu[d.type + '|' + g] = podleTypu[d.type + '|' + g] || []).push(m2);
      // Do srovnávací hladiny patří jen běžné nabídky. Vyvolávací cena dražby
      // je pod trhem z podstaty věci — kdyby se počítala do průměru, srovnávali
      // bychom dražby samy se sebou a žádný rozdíl by nevyšel.
      if (d.type !== 'sale') return;
      // Ukládá se i výměra: cena za m² s velikostí pozemku klesá, takže
      // dvanáctihektarový pozemek nejde poměřovat mediánem postaveným
      // z tisícimetrových parcel — vyšel by vždycky jako trhák.
      var z = { a: d.area, m: m2 };
      (nabidkyCR[g] = nabidkyCR[g] || []).push(z);
      if (d.okres) (nabidkyOkres[g + '|' + d.okres] = nabidkyOkres[g + '|' + d.okres] || []).push(z);
      var kraj = okresKraj[d.okres];
      if (kraj) (nabidkyKraj[g + '|' + kraj] = nabidkyKraj[g + '|' + kraj] || []).push(z);
    });

    function serad(idx) { Object.keys(idx).forEach(function (k) { idx[k].sort(function (a, b) { return a - b; }); }); }
    serad(podleTypu);
    /* Výměra a cena za m² zůstávají spolu; řadí se až vybraný výřez. */
    function ceny(pole, plocha) {
      if (!pole) return null;
      var out = [];
      for (var i = 0; i < pole.length; i++) {
        if (plocha && (pole[i].a < plocha / 3 || pole[i].a > plocha * 3)) continue;
        out.push(pole[i].m);
      }
      out.sort(function (a, b) { return a - b; });
      return out;
    }

    var medianTypu = {};
    Object.keys(podleTypu).forEach(function (k) { medianTypu[k] = median(podleTypu[k]); });

    var MIN_VZOREK = 8;
    /* Obvyklá cena za m² pro tenhle pozemek — MÍSTNÍ, ne celostátní.
     * Nejdřív okres, pak kraj, pak celá ČR, a jako poslední záchrana
     * medián stejného typu a druhu.
     *
     * Na místě záleží. Celostátní medián trvalého travního porostu je
     * 39 Kč/m², jenže louka u Prahy za 1 000 Kč/m² je normální cena, ne
     * chyba. Když se proti celostátnímu mediánu poměřovalo, označilo to
     * 34 běžných nabídek v Praze, Turnově nebo Ostravě za podezřelé. */
    function hladina(d) {
      var g = druhGroup(d.druh);
      var kroky = [nabidkyOkres[g + '|' + d.okres], nabidkyKraj[g + '|' + okresKraj[d.okres]], nabidkyCR[g]];
      for (var i = 0; i < kroky.length; i++) {
        var a = ceny(kroky[i], d.area);
        if (a && a.length >= MIN_VZOREK) return median(a);
      }
      for (var j = 0; j < kroky.length; j++) {
        var b = ceny(kroky[j], 0);
        if (b && b.length >= MIN_VZOREK) return median(b);
      }
      return medianTypu[d.type + '|' + g] || null;
    }

    /* Cena hluboko POD místní hladinou není skvělá koupě — je to skoro jistě
     * spoluvlastnický podíl nebo chyba v inzerátu. U zemědělské půdy pravidlo
     * prakticky nezabírá; bije tam, kde je rozptyl obrovský, tedy u stavebních
     * pozemků.
     *
     * Shora se ÚMYSLNĚ nic neoznačuje, i když to tu chvíli bylo. Poměr k místní
     * hladině totiž neměří kvalitu dat, ale MĚSTO: zahrada v Klatovech za
     * 1 775 Kč/m² vyjde 56× nad hladinou a je to úplně běžná cena, kdežto statek
     * v Tišnově vedený jako orná půda vyjde 632× — a mezi těmi dvěma nevede
     * žádná čára. Při prahu 25× to označovalo 34 normálních nabídek v Praze,
     * Turnově nebo Ostravě za podezřelé.
     * To, kvůli čemu tu horní mez vznikla — nevydat nesmyslný odhad — řeší
     * kontrola přímo v odhadu (cena víc než osminásobek odhadu = nesrovnatelný
     * pozemek), a ta je přesná, protože porovnává dvě stejná čísla. */
    function neduveryhodna(d) {
      if (!hasArea(d) || !d.price) return false;
      var med = hladina(d);
      return med ? (d.price / d.area) < med / 50 : false;
    }

    /* Percentil ceny za m² proti stejnému typu a druhu. null, když není dost
     * srovnání nebo když je cena nevěrohodná. */
    function percentil(d) {
      if (!hasArea(d) || !d.price || neduveryhodna(d)) return null;
      var arr = podleTypu[d.type + '|' + druhGroup(d.druh)];
      if (!arr || arr.length < 10) return null;
      if (arr[arr.length - 1] <= arr[0] * 1.2) return null;
      var val = d.price / d.area, below = 0;
      for (var i = 0; i < arr.length; i++) { if (arr[i] <= val) below++; }
      var pct = Math.max(2, Math.min(98, Math.round(below / arr.length * 100)));
      return { pct: pct, cheaper: 100 - pct, sample: arr.length };
    }

    /* Odhad obvyklé nabídkové ceny. Bere medián Kč/m² u stejného druhu —
     * nejdřív v okrese, pak v kraji. Dál NE.
     *
     * Celostátní medián tu původně byl jako poslední záchrana a na ostrých
     * datech se ukázalo, že by z něj padalo 56 ze 73 odhadů. Jenže medián
     * orné půdy za celou republiku nevypovídá o konkrétním okrese nic —
     * je to číslo, které jen vypadá jako odhad. Radši žádný odhad než
     * takový: kdo podle něj jednou přeplatí, už se nevrátí.
     *
     * Vrací se i to, z čeho se počítalo, aby se pod číslo dalo napsat,
     * jak jsme k němu došli. */
    function odhad(d) {
      if (!hasArea(d) || !d.price || neduveryhodna(d)) return null;
      var g = druhGroup(d.druh);
      var zdroje = [
        { pole: nabidkyOkres[g + '|' + d.okres], uroven: 'okres', kde: d.okres },
        { pole: nabidkyKraj[g + '|' + okresKraj[d.okres]], uroven: 'kraj', kde: okresKraj[d.okres] }
      ];
      /* Nejdřív srovnání s podobně velkými pozemky (třetina až trojnásobek
       * výměry). Když jich není dost, ustoupí se k srovnání bez ohledu na
       * velikost — a řekne se to, aby si člověk mohl číslo přebrat. */
      var kroky = [];
      zdroje.forEach(function (z) { kroky.push({ arr: ceny(z.pole, d.area), uroven: z.uroven, kde: z.kde, podleVelikosti: true }); });
      zdroje.forEach(function (z) { kroky.push({ arr: ceny(z.pole, 0), uroven: z.uroven, kde: z.kde, podleVelikosti: false }); });
      for (var i = 0; i < kroky.length; i++) {
        var k = kroky[i];
        if (!k.arr || k.arr.length < MIN_VZOREK) continue;
        var med = median(k.arr);
        if (!med) continue;
        var castka = Math.round(med * d.area);
        /* Poslední kontrola, a zásadní: sedí ta nabídka vůbec do téhle
         * hladiny? Vyvolávací cena dražby BÝVÁ hluboko pod odhadem — o to
         * tu jde a dolů se proto nic neořezává. Ale když je cena výrazně
         * NAD místní hladinou, nejde o srovnatelný pozemek: bývá na něm
         * stavba, nebo se špatně přečetla výměra. Na ostrých datech takhle
         * vznikaly perly jako „576 000 Kč, odhad 8 062 Kč, 7 045 % nad
         * odhadem". Takový odhad radši nevydáme vůbec. */
        if (d.price > castka * 8) return null;
        return {
          castka: castka,
          zaM2: med,
          uroven: k.uroven,
          kde: k.kde,
          vzorek: k.arr.length,
          podleVelikosti: k.podleVelikosti,
          druh: g,
          rozdil: castka - d.price,
          // O kolik je cena pozemku pod odhadem, v procentech odhadu.
          podOdhadem: castka > 0 ? Math.round((castka - d.price) / castka * 100) : 0
        };
      }
      return null;
    }

    return {
      druhGroup: druhGroup,
      neduveryhodna: neduveryhodna,
      percentil: percentil,
      odhad: odhad,
      medianTypu: medianTypu
    };
  }

  root.PK_CENY = { postav: postav, druhGroup: druhGroup, median: median, OKRES_KRAJ: OKRES_KRAJ, kdeText: kdeText };
}(typeof window !== 'undefined' ? window : globalThis));
