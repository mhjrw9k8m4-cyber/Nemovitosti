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
      (nabidkyCR[g] = nabidkyCR[g] || []).push(m2);
      if (d.okres) (nabidkyOkres[g + '|' + d.okres] = nabidkyOkres[g + '|' + d.okres] || []).push(m2);
      var kraj = okresKraj[d.okres];
      if (kraj) (nabidkyKraj[g + '|' + kraj] = nabidkyKraj[g + '|' + kraj] || []).push(m2);
    });

    function serad(idx) { Object.keys(idx).forEach(function (k) { idx[k].sort(function (a, b) { return a - b; }); }); }
    serad(podleTypu); serad(nabidkyOkres); serad(nabidkyKraj); serad(nabidkyCR);

    var medianTypu = {};
    Object.keys(podleTypu).forEach(function (k) { medianTypu[k] = median(podleTypu[k]); });

    /* Cena pod padesátinou mediánu své skupiny není skvělá koupě — je to skoro
     * jistě spoluvlastnický podíl nebo chyba v inzerátu. U zemědělské půdy
     * pravidlo prakticky nezabírá (medián 44 Kč/m², nejnižší 5); bije jen tam,
     * kde je rozptyl obrovský, tedy u stavebních pozemků. */
    function neduveryhodna(d) {
      if (!hasArea(d) || !d.price) return false;
      var med = medianTypu[d.type + '|' + druhGroup(d.druh)];
      if (!med) return false;
      var m2 = d.price / d.area;
      if (m2 < med / 50) return true;
      /* A stejně tak shora. Na ostrých datech vyšla dražba v Tišnově za
       * 23 334 850 Kč s odhadem 36 911 Kč, tedy „63 119 % nad odhadem" —
       * nesmysl. Za tím bývá stavba na pozemku nebo špatně přečtená výměra;
       * s holou parcelou se to srovnávat nedá. */
      return m2 > med * 25;
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

    var MIN_VZOREK = 8;
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
      var kroky = [
        { arr: nabidkyOkres[g + '|' + d.okres], uroven: 'okres', kde: d.okres },
        { arr: nabidkyKraj[g + '|' + okresKraj[d.okres]], uroven: 'kraj', kde: okresKraj[d.okres] }
      ];
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

  root.PK_CENY = { postav: postav, druhGroup: druhGroup, median: median, OKRES_KRAJ: OKRES_KRAJ };
}(typeof window !== 'undefined' ? window : globalThis));
