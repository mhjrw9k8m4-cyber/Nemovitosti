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

  /* KOLIK METRŮ ZA TY PENÍZE OPRAVDU DOSTANU.
   *
   * U spoluvlastnického podílu stojí v inzerátu výměra CELÉ parcely, ale
   * cena jen za zlomek. Kdo dělí cenu celou výměrou, dostane číslo, které
   * neplatí pro nikoho: ani pro kupce podílu, ani pro srovnání s celými
   * pozemky. A právě tohle číslo se na webu ukazovalo jako „Kč/m²"
   * a řadilo se podle něj.
   *
   * Změřeno v Praze: prvních pět nabídek podle ceny, z toho čtyři podíly.
   * Lesní pozemek za 579 000 Kč se 7 770 m² svítil jako 75 Kč/m² —
   * nejlevnější ze všech. Jenže je to podíl 1/13, takže kupujícímu
   * připadne 598 m² a platí 969 Kč/m². Ve skutečnosti nejdražší z té
   * pětice. Pořadí bylo přesně obrácené.
   *
   * Proto se počítá z výměry, která kupujícímu připadne. Když velikost
   * podílu neznáme (inzerát ji neuvádí), nevrací se NIC — raději žádné
   * číslo než číslo, o kterém víme, že neplatí. */
  function zlomekPodilu(d) {
    if (!d) return null;
    if (!d.podil) return 1;
    var m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(d.zlomek || ''));
    if (!m) return null;
    var citatel = +m[1], jmenovatel = +m[2];
    if (!(citatel > 0) || !(jmenovatel > 0) || citatel > jmenovatel) return null;
    return citatel / jmenovatel;
  }
  /** Výměra, která kupujícímu opravdu připadne. null = nevíme. */
  function vymeraVCene(d) {
    if (!hasArea(d)) return null;
    var z = zlomekPodilu(d);
    return z == null ? null : d.area * z;
  }
  /** Cena za metr, který kupující opravdu dostane. null = nevíme. */
  function zaMetr(d) {
    var v = vymeraVCene(d);
    return (v > 0 && d && d.price > 0) ? d.price / v : null;
  }
  /** Vysvětlení k číslu, když je přepočtené z podílu (jinak prázdné). */
  function zaMetrPopis(d) {
    if (!d || !d.podil) return '';
    var z = zlomekPodilu(d);
    if (z == null) return '';
    return 'Přepočteno na spoluvlastnický podíl' + (d.zlomek ? ' ' + d.zlomek : '') +
      ' — tolik platíte za metr, který vám připadne. Výměra v inzerátu je celá parcela.';
  }

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
  /* Dvě hranice, o které se opírá celý web — mapa, karty i stránka pozemku.
     Jsou tady, a ne na třech místech v kódu, protože přesně takhle se už
     jednou rozešel cenový verdikt mezi mapou a stránkou. */
  var MEZ_SLEVA = 15;      // od kolika % pod obvyklou cenou se o slevě vůbec mluví
  var MEZ_POCHYBNA = 60;   // od kolika % už to není sleva, ale důvod k ověření
  /* KDY ODHADU SAMI NEVĚŘÍME.
   *
   * Když se ceny srovnávaných pozemků mezi sebou liší málo, je medián
   * pevný. Když se liší o násobky, je medián náhoda — a číslo pod ním
   * taky. Měřítkem je mezikvartilové rozpětí dělené mediánem: 0 znamená
   * „všechny stejné", 2 znamená „prostřední polovina se liší dvojnásobkem
   * mediánu".
   *
   * Že to není dojem, ukázalo měření BEZ použití ceny měřeného pozemku
   * (tedy bez kruhu): data se rozpůlila a z každé půlky se postavil
   * samostatný model. Kde je rozptyl malý, obě půlky se o témž pozemku
   * shodnou na 8–20 %. Nad 2 se rozcházejí o 41 % a nad 3 o 73 % — tedy
   * o víc, než kolik činí celá slevá, o které bychom člověku psali.
   * Takový odhad se nesmí podávat jako číslo, které něco znamená.
   * Na ostrých datech se to týká 34 ze 403 štítků „pod odhadem".
   *
   * Velikost vzorku NIC nepředpovídá (rozchod 13 % u vzorku do deseti
   * nabídek, 15 % u dvaceti) — proto se hlídá rozptyl, ne počet. */
  var MEZ_ROZPTYL = 2;

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
    /* JAK RYCHLE KLESÁ CENA ZA METR S VELIKOSTÍ POZEMKU
     *
     * Dosud se srovnávalo jen s pozemky podobné výměry (třetina až
     * trojnásobek) a uvnitř toho okna se na velikost nehledělo. U stavebních
     * pozemků je to hrubé: dvousetmetrová parcela a šestisetmetrová jsou
     * „podobné", ale metr je na té malé výrazně dražší.
     *
     * Proto se z celostátních dat pro každý druh spočítá sklon v log-log
     * (o kolik klesne cena za m², když je pozemek dvakrát větší) — a každá
     * srovnávací nabídka se přepočítá na výměru toho pozemku, který zrovna
     * odhadujeme.
     *
     * POUŽIJE SE JEN TAM, KDE TO SEDÍ. U stavebních pozemků sklon vysvětluje
     * čtvrtinu rozptylu (R² 0,24) a chyba odhadu klesla z 52,7 % na 44,7 %.
     * U orné půdy nebo zahrad nevysvětluje skoro nic (R² pod 0,05) a přepočet
     * by odhad zhoršil — tam se drží původní okno. Rozhoduje tedy měření na
     * datech, ne dojem: hranice je R² ≥ 0,15. Ověřeno protiproti všem druhům,
     * žádný si nepohoršil (scripts/test-ceny.mjs). */
    var R2_MEZ = 0.15;
    var SKLON = {};
    (function () {
      var podleDruhu = {};
      DATA.forEach(function (d) {
        if (!hasArea(d) || !d.price || d.type !== 'sale') return;
        var g = druhGroup(d.druh);
        (podleDruhu[g] = podleDruhu[g] || []).push({ a: d.area, m: d.price / d.area });
      });
      Object.keys(podleDruhu).forEach(function (g) {
        var v = podleDruhu[g];
        if (v.length < 40) { SKLON[g] = 0; return; }
        var n = v.length, sx = 0, sy = 0, i;
        var lx = new Array(n), ly = new Array(n);
        for (i = 0; i < n; i++) { lx[i] = Math.log(v[i].a); ly[i] = Math.log(v[i].m); sx += lx[i]; sy += ly[i]; }
        var mx = sx / n, my = sy / n, num = 0, den = 0;
        for (i = 0; i < n; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) * (lx[i] - mx); }
        var b = den ? num / den : 0;
        var ss = 0, sr = 0;
        for (i = 0; i < n; i++) { var pred = my + b * (lx[i] - mx); sr += (ly[i] - pred) * (ly[i] - pred); ss += (ly[i] - my) * (ly[i] - my); }
        var r2 = ss ? 1 - sr / ss : 0;
        SKLON[g] = r2 >= R2_MEZ ? b : 0;
      });
    }());

    /* Výměra a cena za m² zůstávají spolu; řadí se až vybraný výřez.
       Když pro druh máme spolehlivý sklon, ceny se přepočítají na výměru
       odhadovaného pozemku a okno se rozšíří (desetina až desetinásobek) —
       přepočet si s rozdílem poradí líp než ořezání vzorku. */
    function ceny(pole, plocha, druhG) {
      if (!pole) return null;
      var b = (druhG && SKLON[druhG]) || 0;
      var uzke = b ? 10 : 3;
      var out = [];
      for (var i = 0; i < pole.length; i++) {
        if (plocha && (pole[i].a < plocha / uzke || pole[i].a > plocha * uzke)) continue;
        out.push(b && plocha ? pole[i].m * Math.pow(plocha / pole[i].a, b) : pole[i].m);
      }
      out.sort(function (a, b2) { return a - b2; });
      return out;
    }

    var medianTypu = {};
    Object.keys(podleTypu).forEach(function (k) { medianTypu[k] = median(podleTypu[k]); });

    /* Kolik srovnatelných pozemků musí být, aby se z nich počítalo.
     *
     * Zkoušel jsem to snížit na 3 — vypadalo to slibně, dokud se měřila
     * jen srovnávací hladina. Přes skutečný odhad a s vynecháním měřené
     * nabídky z modelu to ale nepotvrdilo NIC: u 803 nabídek, kde odhad
     * vyšel v obou případech, byl práh 3 lepší u 168 a horší u 143
     * (znaménkový test p = 0,17, tedy klidně náhoda), medián rozdílu 0,00.
     * Zisk byl jen zdánlivý: přibylo 66 nových odhadů, jenže ty měly
     * medián chyby 64,7 % a nejhorší 3 996 %. Práh tedy zůstává 8 —
     * nepřesný odhad navíc není lepší než žádný.
     *
     * Co opravdu předpovídá spolehlivost, není počet srovnání, ale jejich
     * rozptyl — viz MEZ_ROZPTYL výš. */
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
        var a = ceny(kroky[i], d.area, g);
        if (a && a.length >= MIN_VZOREK) return median(a);
      }
      for (var j = 0; j < kroky.length; j++) {
        var b = ceny(kroky[j], 0, g);
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

    /* PODÍL SE S CELÝMI POZEMKY SROVNÁVAT NEDÁ.
     *
     * U spoluvlastnického podílu stojí v inzerátu výměra CELÉ parcely,
     * ale cena jen za zlomek — cena za metr proto vyjde nízká z podstaty
     * věci, ne proto, že je nabídka výhodná. Dokud se podíl nedal
     * poznat, model to vědět nemohl (viz komentář u MEZ_POCHYBNA:
     * „rozlišit skutečný trhák od podílu z dat NEJDE"). Teď to u části
     * nabídek jde: inzerát to sám říká a robot to čte do pole `podil`.
     *
     * Změřeno na ostrých datech: ze 629 nabídek, které web označoval za
     * výhodné, jich 194 (31 %) mělo v popisu napsáno, že jde o podíl —
     * a na úvodní stránce se rovnou nabízely jako nejlepší příležitosti.
     * Chválit je za cenu, která se s ostatními nedá srovnat, je horší
     * než o ní mlčet. */
    function nesrovnatelna(d) { return !!(d && d.podil); }

    /* Percentil ceny za m² proti stejnému typu a druhu. null, když není dost
     * srovnání, když je cena nevěrohodná — nebo když se ta cena s ostatními
     * srovnávat nedá (podíl, viz výš). */
    function percentil(d) {
      if (!hasArea(d) || !d.price || neduveryhodna(d) || nesrovnatelna(d)) return null;
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
      zdroje.forEach(function (z) { kroky.push({ arr: ceny(z.pole, d.area, g), uroven: z.uroven, kde: z.kde, podleVelikosti: true }); });
      zdroje.forEach(function (z) { kroky.push({ arr: ceny(z.pole, 0, g), uroven: z.uroven, kde: z.kde, podleVelikosti: false }); });
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
        var pod = castka > 0 ? Math.round((castka - d.price) / castka * 100) : 0;
        /* Jak jednotné jsou ceny, ze kterých medián vznikl. Pole je už
           seřazené (viz ceny()), takže kvartily jsou jen dva indexy. */
        var kvart = function (p) { return k.arr[Math.min(k.arr.length - 1, Math.floor(p * k.arr.length))]; };
        var rozptyl = med ? (kvart(0.75) - kvart(0.25)) / med : null;
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
          podOdhadem: pod,
          /* HRANICE UVĚŘITELNOSTI. Sleva přes MEZ_POCHYBNA procent není
             známka výhodné koupě — je to známka toho, že se ten pozemek
             s okolím srovnat nedá. Nejčastěji je to SPOLUVLASTNICKÝ PODÍL
             (v inzerátu je výměra celé parcely, ale cena jen za zlomek),
             dražba s jinou výměrou než uvádí popis, nebo špatně načtená
             cena. Doubravník na webu svítil jako „o 95 % pod obvyklou" —
             stavební pozemek za 59 Kč/m². Takový stavební pozemek není.
             Rozlišit skutečný trhák od podílu z dat NEJDE. Proto se to ani
             netvrdí: tyhle nabídky se neoznačují jako výhodné, ale jako
             „ověřit cenu". Hranice je úsudek, ne měření — rozdělení slev
             je plynulé a žádný zlom v datech není (změřeno na 1414
             nabídkách s odhadem podle velikosti). */
          /* `podil` je VLASTNÍ důvod, ne podtyp pochybnosti. Zkoušel jsem
             ho do `pochybna` přimíchat — a existující kontrola to právem
             shodila: pochybných by bylo 560 z 1471 (38 %), a to už není
             varování, ale šum. „Pochybná" má dál znamenat jedinou věc:
             tahle sleva je moc velká na to, aby byla pravda.
             Že se podíl nesmí chválit jako výhodná koupě, zařídí
             percentil (ten u něj nevznikne vůbec) a `podil` u odhadu —
             tam, kde se o slevě mluví, se na něj musí koukat. */
          podil: nesrovnatelna(d),
          pochybna: pod >= MEZ_POCHYBNA,
          // Jak moc se srovnávané ceny mezi sebou liší (mezikvartil/medián).
          rozptyl: rozptyl,
          /* Odhad, kterému sami nevěříme: srovnávané pozemky se cenou liší
             tak, že by z jiné poloviny dat vyšlo výrazně jiné číslo.
             Neskrývá se — jen se u něj nepíše částka, kterou bychom tím
             tvrdili přesněji, než jak to umíme. */
          nejisty: rozptyl != null && rozptyl > MEZ_ROZPTYL
        };
      }
      return null;
    }

    return {
      druhGroup: druhGroup,
      MEZ_POCHYBNA: MEZ_POCHYBNA,
      MEZ_SLEVA: MEZ_SLEVA,
      MEZ_ROZPTYL: MEZ_ROZPTYL,
      neduveryhodna: neduveryhodna,
      percentil: percentil,
      odhad: odhad,
      medianTypu: medianTypu
    };
  }

  /* Vysvětlující blok k odhadu — JEDNO místo pro mapu i stránku pozemku.
   *
   * Byl dvakrát: v js/main.js (okno na mapě) a v js/pozemek.js (stránka
   * pozemku). A rozešly se přesně tak, jak se kopie rozcházejí vždycky:
   * na stránce se u hluboké slevy psalo „takový rozdíl bývá spoluvlastnický
   * podíl nebo jiná výměra, ověřte si to", kdežto v okně na mapě totéž
   * číslo svítilo jako dobrá zpráva („o 96 % níž"). Tentýž pozemek, dvě
   * různá čtení podle toho, kam člověk klepl.
   *
   * volby: fmt (formátování čísel), esc (ošetření textu), trida (navíc
   * k .md-odhad), dlouhy (na stránce pozemku i věta o tom, čím odhad není).
   */
  function blokOdhadu(model, d, volby) {
    volby = volby || {};
    var fmt = volby.fmt || function (x) { return String(x); };
    var esc = volby.esc || function (x) { return x; };
    if (!model) return '';
    var o = model.odhad(d);
    /* Jen srovnání s podobně velkými pozemky. Cena za m² s výměrou klesá,
       takže velký pozemek by proti mediánu z malých parcel vyšel jako
       trhák vždycky — a nebyla by to pravda. Pod 15 % se o slevě nemluví:
       jinak by to u poloviny nabídek byla další řádka s číslem. */
    if (!o || !o.podleVelikosti || o.podOdhadem < 15) return '';
    var kde = kdeText(o.uroven, o.kde);
    var coJe = d.type === 'drazba' ? 'Vyvolávací cena' : (d.type === 'exekuce' ? 'Uváděná cena' : 'Nabídková cena');
    return '<div class="md-odhad' + (volby.trida || '') + '">' +
      '<div class="mo-radek"><span class="mo-k">' + coJe + '</span><span class="mo-v">' + fmt(d.price) + ' Kč</span></div>' +
      '<div class="mo-radek mo-hlavni"><span class="mo-k">Obvyklá cena ' + kde + '</span><span class="mo-v">' + fmt(o.castka) + ' Kč</span></div>' +
      // U pochybného rozdílu se nesmí jásat: tentýž údaj, jiné čtení.
      /* Podíl patří mezi důvody k tlumenému podání stejně jako pochybná
         sleva: text pod tím varuje, tak nesmí být vysázený jako radostná
         zpráva. */
      '<div class="mo-rozdil' + (o.pochybna || o.nejisty || o.podil ? ' mo-pochybna' : '') + '"><b>o ' + o.podOdhadem + ' % níž</b>' +
        (o.podil ? ' — jenže inzerát mluví o <b>spoluvlastnickém podílu</b>: v ceně je jen zlomek pozemku, kdežto výměra je celá. S celými pozemky se to srovnat nedá.'
          : o.pochybna ? ' — takový rozdíl bývá spoluvlastnický podíl nebo jiná výměra, ověřte si to'
          : o.nejisty ? ' — ale ceny podobných pozemků ' + kde + ' se mezi sebou liší násobky, takže tohle číslo je jen hrubé vodítko'
                    : ', tedy zhruba o ' + fmt(o.rozdil) + ' Kč') + '</div>' +
      '<p class="mo-pozn">Spočítáno z mediánu <b>' + fmt(Math.round(o.zaM2)) + ' Kč/m²</b> — z <b>' +
      o.vzorek + '</b> nabídek stejného druhu (' + esc(o.druh.toLowerCase()) + ') a podobné výměry ' + kde + '. ' +
      'Jsou to ceny <b>nabídkové</b>, ne za kolik se pozemky opravdu prodaly' +
      (volby.dlouhy ? ' — to ve veřejných zdrojích není. Berte to jako vodítko, ne jako odhad znalce.' : '.') +
      '</p></div>';
  }

  root.PK_CENY = { postav: postav, druhGroup: druhGroup, median: median, OKRES_KRAJ: OKRES_KRAJ,
    kdeText: kdeText, blokOdhadu: blokOdhadu,
    zlomekPodilu: zlomekPodilu, vymeraVCene: vymeraVCene, zaMetr: zaMetr, zaMetrPopis: zaMetrPopis };
}(typeof window !== 'undefined' ? window : globalThis));
