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
  /* STROP UVĚŘITELNOSTI. Nad ním se cena za metr NEVRACÍ — platí tu
   * stejná věta jako u neznámého podílu o pár řádků výš: raději žádné
   * číslo než číslo, o kterém víme, že neplatí.
   *
   * Naměřeno na ostrých datech (1 957 nabídek, z toho 516 podílových):
   *   nabídky BEZ podílu   medián 54, 99 % 13 500, maximum 23 498 Kč/m²
   *   podíly, jak se počítají tady   medián 150, 99 % 10 906, maximum 370 703
   *   tytéž podíly, kdyby se nedělilo   medián 38, 99 % 1 032, maximum 5 078
   *
   * Nad 30 000 Kč/m² jsou přesně dvě nabídky a obě jsou podíly:
   *   Jihlava, zahrada 256 m² za 1 300 000 Kč, podíl 1/73 → 370 703 Kč/m²
   *   Praha, stavební 2 992 m² za 12 490 000 Kč, podíl 3/69 → 96 013 Kč/m²
   * U té jihlavské by z toho vyšlo, že celá ta zahrada má hodnotu
   * 94,9 milionu. Taková zahrada v Jihlavě není. Nevíme, které z těch
   * dvou čísel v inzerátu je špatně — jestli je cena za celou parcelu,
   * nebo je výměra už jen podílová — takže se netvrdí ani jedno.
   *
   * Proč pevné číslo a ne percentil z dat: percentil by s počtem
   * nesmyslů v datech sám vyrostl a strážce by se tiše rozpustil.
   * Pevné číslo naopak stárne, až trh poroste — proto k němu patří
   * zkouška, která přeměří skutečné maximum nabídek bez podílu a ozve
   * se, až se k mezi přiblíží (scripts/test-strop-ceny.mjs). Dnes je
   * mezi maximem a mezí 28 %. */
  var MEZ_NEUVERITELNA = 30000;
  /** Cena za metr, který kupující opravdu dostane. null = nevíme. */
  function zaMetr(d) {
    var v = vymeraVCene(d);
    if (!(v > 0) || !d || !(d.price > 0)) return null;
    var zm = d.price / v;
    return zm > MEZ_NEUVERITELNA ? null : zm;
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
    /* Okolí se jmenuje poloměrem, ne obcí: je to kruh kolem pozemku,
       ne správní jednotka, a tvářit se jinak by bylo nepřesné. */
    if (uroven === 'okoli') return 'v okolí do ' + nazev;
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
   * „všechny stejné", 1,2 znamená „prostřední polovina se liší o 1,2
   * mediánu" — a protože dolní kvartil je vždy pod mediánem, znamená to
   * taky, že horní kvartil je nejmíň 2,2krát vyšší než dolní. Naměřeno
   * na označených odhadech: nejmíň 2,6krát, obvykle 4,8krát. Text „ceny
   * se mezi sebou liší násobky" tedy není nadsázka u žádného z nich.
   *
   * ČÍM SE HRANICE OVĚŘILA. Ne dojmem, a ne ani srovnáním modelu se sebou:
   * desetinovým křížovým měřením, ve kterém model cenu odhadovaného
   * pozemku NEVIDÍ (postaví se z devíti desetin dat a odhaduje tu
   * desátou). U označených odhadů je medián chyby 44–51 %, u ostatních
   * 23–24 % — tedy dvojnásobek, a shodně při šesti různých rozdělení do
   * desetin (poměr 1,90 až 2,11). Tolik se mýlit a tvrdit přitom částku
   * na korunu nelze.
   *
   * HRANICE SE MUSELA PŘEPOČÍTAT, když se první krok srovnání změnil na
   * deset nejbližších pozemků do 25 km. Dřív se srovnávalo s celým
   * okresem nebo krajem, kde jsou ceny roztahanější (medián rozptylu
   * 0,80), a hranice 2 tam dávala smysl. V okolí je rozptyl těsnější
   * (medián 0,47), takže 2 najednou označovalo jen 4 % odhadů — a u těch
   * byla chyba 32 % proti 26 % u neoznačených, tedy skoro žádný rozdíl.
   * Příznak tím přestal cokoli oddělovat. Měření na pěti hranicích:
   *
   *   hranice  označeno  chyba označených / ostatních  štítků „pod odhadem"
   *   0,75     33 %      44 % / 21 %                   43 %  (moc)
   *   1,0      20 %      52 % / 22 %                   29 %  (moc)
   *   1,2      14 %      46 % / 23 %                   18 %
   *   1,5       8 %      46 % / 25 %                   12 %  (slabší odstup)
   *   2,0       5 %      32 % / 26 %                    6 %  (neoddělí nic)
   *
   * 1,2 je nejnižší hranice, u které „nejistých" zůstává menšina štítků
   * „pod odhadem" (18 % ze 488) — nad ní by z varování byl šum — a zároveň
   * nejvyšší, u které odstup chyby drží dvojnásobek při každém rozdělení.
   *
   * Velikost vzorku NIC nepředpovídá (rozchod 13 % u vzorku do deseti
   * nabídek, 15 % u dvaceti) — proto se hlídá rozptyl, ne počet. */
  var MEZ_ROZPTYL = 1.2;

  /* ROZBALENÍ SLOUPCOVÉHO VSTUPU MODELU (data/model.json).
   *
   * Stránka pozemku nepotřebuje celá data — z uložených nabídek čte
   * model jen pět polí (okres, druh, typ, výměra, cena). Generátor řezů je
   * proto ukládá sloupcově a se slovníky: 42,6 kB místo 638 kB surově
   * a 12,0 kB místo 56,5 kB přes drát. Tady se to zpátky rozbalí na
   * pole objektů, jaké postav() čeká.
   *
   * Nic se nedopočítává a nic nezaokrouhluje: výměra a cena jsou celá
   * čísla ze zdroje, takže model z tohohle vstupu vyjde znak za znakem
   * stejně jako z plných dat. Měří to scripts/test-model-vstup.mjs na
   * všech nabídkách, ne na vzorku.
   *
   * Vrací null, když vstup nemá tvar, jaký má mít — volající pak ví, že
   * má sáhnout po plných datech, místo aby postavil model z ničeho.
   */
  function rozbalModel(j) {
    if (!j || !Array.isArray(j.a) || !Array.isArray(j.c)) return null;
    var okresy = j.okresy || [], druhy = j.druhy || [], typy = j.typy || [];
    var o = j.o || [], d = j.d || [], t = j.t || [], a = j.a, c = j.c;
    var la = j.la || [], lo = j.lo || [];
    var n = a.length;
    if (!n || c.length !== n || o.length !== n || d.length !== n || t.length !== n) return null;
    var ven = new Array(n);
    for (var i = 0; i < n; i++) {
      ven[i] = {
        okres: okresy[o[i]] || '',
        druh: druhy[d[i]] || '',
        type: typy[t[i]] || '',
        area: a[i],
        price: c[i],
        lat: la[i] ? la[i] / 1e4 : 0,
        lng: lo[i] ? lo[i] / 1e4 : 0,
        /* Příznak podílu ve vstupu není a nemá být: model ho čte vždy
           z nabídky, o které se rozhoduje, ne z uložených polí. */
      };
    }
    return ven;
  }

  function postav(DATA, okresKraj) {
    okresKraj = okresKraj || OKRES_KRAJ;
    var podleTypu = {};     // type|druh  → ceny za m² (na věrohodnost)
    /* TÉŽ, ALE MÍSTNĚ. Percentil bral pozemky téhož druhu z CELÉ
       republiky. Odhad o kus níž to schválně nesmí — stojí u něj, že
       „medián orné půdy za celou republiku nevypovídá o konkrétním
       okrese nic". Odznak se tím neřídil, a tak si web na jedné
       obrazovce odporoval: „Vyšší cena — dražší než 78 % podobných"
       a hned pod tím „o 26 % pod obvyklou cenou v okrese Praha-západ".
       Změřeno na 1 973 nabídkách: ze 1 403 odznaků by 410 (33 %) při
       místním srovnání vyšlo JINAK. Nejde o pár výjimek, ale o třetinu
       verdiktů. Srovnává se proto stejně jako u odhadu — okres, pak
       kraj, dál ne. */
    var typOkres = {};      // type|druh|okres → ceny za m²
    var typKraj = {};       // type|druh|kraj  → ceny za m²
    var nabidkyOkres = {};  // druh|okres → ceny za m² POUZE z běžných nabídek
    var nabidkyKraj = {};
    var nabidkyCR = {};
    /* Přihrádky po půl stupni (asi 55 × 35 km). Hledá se v devíti
       sousedních, takže kruh 25 km se do nich vždycky vejde — a místo
       dvou tisíc nabídek se projde pár desítek. Bez toho by úvodní mapa
       počítala vzdálenosti dva miliony krát. */
    var OKOLI_PRIHRADKA = 0.5;
    var okoliPrihradky = {};

    DATA.forEach(function (d) {
      if (!hasArea(d) || !d.price) return;
      var g = druhGroup(d.druh), m2 = d.price / d.area;
      (podleTypu[d.type + '|' + g] = podleTypu[d.type + '|' + g] || []).push(m2);
      if (d.okres) {
        var ko = d.type + '|' + g + '|' + d.okres;
        (typOkres[ko] = typOkres[ko] || []).push(m2);
        var kk = okresKraj[d.okres];
        if (kk) { var k2 = d.type + '|' + g + '|' + kk; (typKraj[k2] = typKraj[k2] || []).push(m2); }
      }
      // Do srovnávací hladiny patří jen běžné nabídky. Vyvolávací cena dražby
      // je pod trhem z podstaty věci — kdyby se počítala do průměru, srovnávali
      // bychom dražby samy se sebou a žádný rozdíl by nevyšel.
      if (d.type !== 'sale') return;
      /* SPOLUVLASTNICKÉ PODÍLY V HLADINĚ ZŮSTÁVAJÍ — a stálo to za změření.
       *
       * Vypadá to jako chyba: u podílu je cena za zlomek, ale výměra celá,
       * takže jeho Kč/m² není cena za metr země. Web to sám jinde říká —
       * podílu se odhad ani percentil nedělá, protože „s celými pozemky se
       * to srovnat nedá". Jako srovnávací vzorek se ale používá dál, a to
       * zavání dvojím metrem. Je jich přitom dost: 516 z 1 861 nabídek na
       * prodej (27,7 %) a jejich medián leží na 72 % hladiny celých
       * pozemků (38 proti 53 Kč/m²).
       *
       * Změřeno metodou „vynech jeden" — hladina se postaví bez té nabídky,
       * kterou zrovna odhadujeme, a odhad se porovná s její skutečnou
       * nabídkovou cenou. Na téže množině 1 095 celých pozemků:
       *
       *     s podíly v hladině    medián chyby 30,1 %
       *     bez podílů            medián chyby 31,3 %
       *     bez podílů je odhad blíž u 350, DÁL u 415, stejně u 330
       *     a 53 nabídek by o odhad přišlo úplně (vzorek klesne pod mez)
       *
       * Vynechat je tedy odhad ZHORŠÍ. Medián je proti jednotlivým
       * pokřiveným číslům odolný, kdežto ztráta 28 % vzorku v okrese už
       * odolná není. Hezká úvaha proti měření prohrála; nechávat se tu
       * řídit úvahou by znamenalo zhoršit číslo, podle kterého se lidé
       * rozhodují. (scripts/ tohle neměří, je to na 25 s výpočtu —
       * kdo to bude chtít zopakovat, ať postaví model dvakrát a porovná
       * chybu, ne dojem.) */
      // Ukládá se i výměra: cena za m² s velikostí pozemku klesá, takže
      // dvanáctihektarový pozemek nejde poměřovat mediánem postaveným
      // z tisícimetrových parcel — vyšel by vždycky jako trhák.
      var z = { a: d.area, m: m2 };
      /* ---- OKOLÍ: tytéž ceny, ale se souřadnicemi ----
         Hranice okresu je úřední čára a cena se po ní neláme. Naměřeno
         křížově na desetinách (scripts/mericka-odhadu.mjs, čtyři různá
         rozdělení dat): odhad z deseti nejbližších nabídek téhož druhu
         do 25 km má medián chyby o 1,7 až 3,0 p.b. nižší než dnešní
         žebřík okres → kraj, a znaménkový test je pokaždé pro
         (např. 388 nabídek blíž proti 319 dál).
         Souřadnice se zaokrouhlují na čtyři desetinná místa (asi 11 m),
         protože na tutéž přesnost je ukládá data/model.json — jinak by
         model z malého souboru dal jiné číslo než z plných dat. */
      if (isFinite(d.lat) && isFinite(d.lng)) {
        var zz = { a: d.area, m: m2,
          lat: Math.round(d.lat * 1e4) / 1e4, lng: Math.round(d.lng * 1e4) / 1e4 };
        var klic = g + '|' + Math.floor(zz.lat / OKOLI_PRIHRADKA) + '|' + Math.floor(zz.lng / OKOLI_PRIHRADKA);
        (okoliPrihradky[klic] = okoliPrihradky[klic] || []).push(zz);
      }
      (nabidkyCR[g] = nabidkyCR[g] || []).push(z);
      if (d.okres) (nabidkyOkres[g + '|' + d.okres] = nabidkyOkres[g + '|' + d.okres] || []).push(z);
      var kraj = okresKraj[d.okres];
      if (kraj) (nabidkyKraj[g + '|' + kraj] = nabidkyKraj[g + '|' + kraj] || []).push(z);
    });

    function serad(idx) { Object.keys(idx).forEach(function (k) { idx[k].sort(function (a, b) { return a - b; }); }); }
    serad(podleTypu);
    serad(typOkres);
    serad(typKraj);
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
    /* ZKOUŠENO A ZAMÍTNUTO: FITOVAT SKLON BEZ SPOLUVLASTNICKÝCH PODÍLŮ.
     *
     * Výš stojí, proč podíly zůstávají ve srovnávací hladině. Fit sklonu
     * je ale JINÉ rozhodnutí nad týmiž daty a svedlo by se měřit zvlášť:
     * u podílu je cena za zlomek, ale výměra celá, takže velký podíl
     * vypadá jako levný velký pozemek — a přesně to sklon zkresluje.
     *
     * Na datech to vyšlo nečekaně ostře. U lesního pozemku je podílů 84
     * z 222 a sklon se bez nich změní z −0,147 (R² 0,03) na −0,380
     * (R² 0,16) — les by tedy mez prolezl a přepočet na výměru dostal.
     * U stavebních se nestane nic (−0,612 proti −0,600), podílů je tam
     * 10 z 262.
     *
     * JENŽE ODHAD SE TÍM NEZLEPŠÍ. Měřeno křížově na desetinách (model
     * se vždy postaví bez té desetiny, kterou odhaduje) na 1 131 celých
     * pozemcích na prodej:
     *
     *     dnes                     medián chyby 30,9 %
     *     bez podílů ve fitu       medián chyby 30,6 %
     *     párově: lepší u 134, HORŠÍ u 154, medián rozdílu 0,00 p.b.
     *     les: medián 34,7 % → 31,5 %, ale párově 44 lepších : 51 horších
     *     stavební: 41,9 % → 42,4 %
     *
     * U lesa se tedy zlepší medián, ale znaménkový test jde proti
     * (p ≈ 0,54, čistá náhoda) — stejný důvod, kterým tu níž padlo
     * snížení MIN_VZOREK na 3. Že měřidlo rozdíl pozná, je ověřeno
     * sabotáží: vnutit sklon −1,2 všem druhům zhorší chybu na 63,9 %
     * a 754 nabídek proti 272. Zůstává to tedy, jak to je. */
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

    /* ---- CENY Z OKOLÍ POZEMKU ----
       Vrátí SEŘAZENÉ pole cen za m² z OKOLI_K nejbližších nabídek téhož
       druhu do OKOLI_R km, přepočtených na výměru odhadovaného pozemku
       týmž sklonem, jakým to dělá ceny(). Když jich tolik není, vrátí
       null a odhad pokračuje okresem a krajem jako dřív.

       Nefiltruje se tu podle výměry (jak to dělá ceny() svým oknem):
       změřená varianta brala deset nejbližších bez ohledu na velikost
       a přepočet sklonem si s rozdílem poradí. Filtrovat navíc by
       znamenalo měřit něco jiného, než co se naměřilo. */
    var OKOLI_K = 10;
    var OKOLI_R = 25;
    function kmVzdalenost(aLat, aLng, bLat, bLng) {
      var R = 6371, r = Math.PI / 180;
      var dx = (bLat - aLat) * r, dy = (bLng - aLng) * r;
      var h = Math.sin(dx / 2) * Math.sin(dx / 2)
        + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dy / 2) * Math.sin(dy / 2);
      return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
    }
    function okoliCeny(d, g) {
      if (!isFinite(d.lat) || !isFinite(d.lng) || !hasArea(d)) return null;
      var lat = Math.round(d.lat * 1e4) / 1e4, lng = Math.round(d.lng * 1e4) / 1e4;
      var pi = Math.floor(lat / OKOLI_PRIHRADKA), pj = Math.floor(lng / OKOLI_PRIHRADKA);
      var bliz = [];
      for (var i = -1; i <= 1; i++) {
        for (var j = -1; j <= 1; j++) {
          var pole = okoliPrihradky[g + '|' + (pi + i) + '|' + (pj + j)];
          if (!pole) continue;
          for (var n = 0; n < pole.length; n++) {
            var x = pole[n];
            /* Sám sebe do srovnání ne: porovnávat cenu s cenou téhož
               pozemku by odhad vždycky přitáhlo k ní. */
            if (x.lat === lat && x.lng === lng && x.a === d.area && x.m * x.a === d.price) continue;
            var vzd = kmVzdalenost(lat, lng, x.lat, x.lng);
            if (vzd > OKOLI_R) continue;
            bliz.push({ vzd: vzd, a: x.a, m: x.m });
          }
        }
      }
      if (bliz.length < OKOLI_K) return null;
      /* Při shodné vzdálenosti rozhoduje výměra a pak cena — ať je pořadí
         dané daty, ne pořadím v souboru. */
      bliz.sort(function (p, q) { return (p.vzd - q.vzd) || (p.a - q.a) || (p.m - q.m); });
      var b = SKLON[g] || 0;
      var ven = [];
      for (var k = 0; k < OKOLI_K; k++) {
        var y = bliz[k];
        ven.push(b ? y.m * Math.pow(d.area / y.a, b) : y.m);
      }
      ven.sort(function (p, q) { return p - q; });
      return ven;
    }

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
    /* ZKOUŠENO A ZAMÍTNUTO: MÍCHAT OKRESNÍ MEDIÁN S KRAJSKÝM.
     *
     * Odhad bere PRVNÍ úroveň, která má aspoň MIN_VZOREK srovnání —
     * okres s osmi nabídkami se tedy použije celý, kdežto se sedmi
     * propadne na kraj. Taková mez vypadá hrubě a učebnicová oprava je
     * míchat obě úrovně podle velikosti vzorku (w = n/(n+K)).
     *
     * Měřeno stejně jako výš, křížově na desetinách, v obou podobách
     * (vážený průměr i geometrický):
     *
     *     dnes      30,9 %
     *     K = 4     32,4 %     K = 16    33,3 %
     *     K = 8     32,8 %     K = 64    34,0 %
     *
     * Čím víc kraje, tím hůř — a monotónně, takže to není náhoda.
     * Kontrola K = 0 (tedy čistý okres) vyšla na číslo totožné s dneškem,
     * čímž je ověřeno, že se opravdu měřila ta změna a ne nic.
     *
     * Vysvětlení je prosté: ceny půdy jsou extrémně místní. Krajský
     * medián je složený z jiné směsi obcí, takže i osm okresních srovnání
     * nese víc informace než sto krajských. Učebnice tu prohrála.
     *
     * (Stejně padla i úroveň OBCE před okresem: při prahu 8 by na ni
     * dosáhlo jen 71 nabídek ze 2 018 a všech sedm skupin je zemědělských
     * — tedy tam, kde je odhad už nejpřesnější. U stavebních, kde je
     * chyba 42 %, ani jedna. Navíc `place` je u Bezrealitky často název
     * ulice, ne obce.) */
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
    /* Vrací se i to, s čím se srovnávalo (uroven, kde) — bez toho se pod
       číslo nedá napsat, odkud je, a „dražší než 78 % podobných pozemků"
       si každý přečte jako „v okolí". Když místní vzorek nestačí, vrací
       se null: radši žádný verdikt než verdikt o cizím kraji. Tímhle
       o odznak přijde 160 z 1 403 nabídek — stejná daň, jakou už platí
       odhad, a ze stejného důvodu. */
    function percentil(d) {
      if (!hasArea(d) || !d.price || neduveryhodna(d) || nesrovnatelna(d)) return null;
      var g = druhGroup(d.druh);
      var zdroje = [
        { pole: typOkres[d.type + '|' + g + '|' + d.okres], uroven: 'okres', kde: d.okres },
        { pole: typKraj[d.type + '|' + g + '|' + okresKraj[d.okres]], uroven: 'kraj', kde: okresKraj[d.okres] }
      ];
      for (var z = 0; z < zdroje.length; z++) {
        var arr = zdroje[z].pole;
        if (!arr || arr.length < 10) continue;
        if (arr[arr.length - 1] <= arr[0] * 1.2) continue;
        var val = d.price / d.area, below = 0;
        for (var i = 0; i < arr.length; i++) { if (arr[i] <= val) below++; }
        var pct = Math.max(2, Math.min(98, Math.round(below / arr.length * 100)));
        /* A CO KDYŽ SI TA DVĚ ČÍSLA ODPORUJÍ? Percentil srovnává cenu za
           metr s místními nabídkami; odhad navíc PŘEPOČÍTÁVÁ NA VELIKOST,
           protože cena za metr s rostoucí výměrou klesá. Malý pozemek
           v levném okrese proto může být nad místním mediánem a zároveň
           pod odhadem pro svou velikost — obojí pravda, jenže na stránce
           by vedle sebe stálo „Vyšší cena" a „o 22 % pod obvyklou".
           Zúžení srovnávací skupiny na okres a kraj snížilo takové
           případy ze 16 na 11 z 1 400. Zbytek se neukáže vůbec: verdikt,
           který si stránka o dva odstavce níž sama vyvrátí, je horší než
           žádný. Číslo se tím nezahazuje — rada pod ním ho řekne dál,
           a s konkrétními korunami. */
        var od = odhad(d);
        if (od && od.podleVelikosti && !od.podil) {
          if (pct >= 65 && od.podOdhadem >= 15) return null;
          if (pct <= 35 && od.podOdhadem <= -15) return null;
        }
        return { pct: pct, cheaper: 100 - pct, sample: arr.length,
          uroven: zdroje[z].uroven, kde: zdroje[z].kde };
      }
      return null;
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
    /* ODHAD SE PRO TUTÉŽ NABÍDKU POČÍTÁ JEDNOU.
       Je to čistý výpočet nad modelem a nad tou nabídkou — podruhé vyjde
       totéž. Jenže se volá pořád dokola: naměřeno při načtení úvodní
       stránky 6 004 volání na 1 996 nabídek (tedy třikrát na každou:
       z výpisu, z odznaků a z pruhu nahoře) a každá změna filtru přidá
       dalších zhruba 1 500, protože seznam se překresluje celý. Uvnitř
       přitom každé volání čtyřikrát profiltruje a setřídí ceny okolí.
       Naměřeno profilerem: nejdražší jméno při načítání stránky.
       Pamatuje se to ve WeakMapě klíčované NABÍDKOU, takže se paměť
       uvolní s daty a nová data (postav se volá znovu) mají pokaždé
       vlastní. Výsledek se nikde nepřepisuje — ověřeno hledáním; kdyby
       ano, sdílel by se ten přepis dál. */
    var pametOdhadu = (typeof WeakMap === 'function') ? new WeakMap() : null;
    function odhad(d) {
      if (!pametOdhadu || !d || typeof d !== 'object') return odhadSpocti(d);
      if (pametOdhadu.has(d)) return pametOdhadu.get(d);
      var v = odhadSpocti(d);
      pametOdhadu.set(d, v);
      return v;
    }
    function odhadSpocti(d) {
      if (!hasArea(d) || !d.price || neduveryhodna(d)) return null;
      var g = druhGroup(d.druh);
      var zdroje = [
        { pole: nabidkyOkres[g + '|' + d.okres], uroven: 'okres', kde: d.okres },
        { pole: nabidkyKraj[g + '|' + okresKraj[d.okres]], uroven: 'kraj', kde: okresKraj[d.okres] }
      ];
      /* Nejdřív srovnání s podobně velkými pozemky (třetina až trojnásobek
       * výměry). Když jich není dost, ustoupí se k srovnání bez ohledu na
       * velikost — a řekne se to, aby si člověk mohl číslo přebrat. */
      /* Kroky se POČÍTAJÍ AŽ VE CHVÍLI, KDY NA NĚ DOJDE. Dřív se všechny
         čtyři spočítaly dopředu a smyčka pod tím se skoro vždycky vrátila
         hned u prvního — tři čtvrtiny práce se tedy zahodily. Uvnitř
         ceny() je přitom filtrace a setřídění celého okolí. Pořadí
         zůstává: napřed podle velikosti (okres, kraj), potom bez ohledu
         na ni. */
      var kroky = [];
      /* OKOLÍ JDE PRVNÍ. Je to nejtěsnější srovnání, jaké máme: deset
         nejbližších pozemků téhož druhu. Když jich tolik do 25 km není
         (řídké okresy), ustoupí se na okres a kraj jako dřív. */
      var okoli = okoliCeny(d, g);
      if (okoli) kroky.push({ arr: okoli, uroven: 'okoli', kde: OKOLI_R + ' km', podleVelikosti: true });
      zdroje.forEach(function (z) { kroky.push({ pole: z.pole, plocha: d.area, uroven: z.uroven, kde: z.kde, podleVelikosti: true }); });
      zdroje.forEach(function (z) { kroky.push({ pole: z.pole, plocha: 0, uroven: z.uroven, kde: z.kde, podleVelikosti: false }); });
      for (var i = 0; i < kroky.length; i++) {
        var k = kroky[i];
        if (!k.arr) k.arr = ceny(k.pole, k.plocha, g);
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

    /* HLADINA MÍSTA SAMA O SOBĚ — bez konkrétního pozemku.
     *
     * Celý model do téhle chvíle uměl odpovědět jen na otázku „co je
     * obvyklé pro TENHLE pozemek". Pro časovou řadu je ale potřeba něco
     * jiného: „jaká je hladina v okrese Blansko u orné půdy", bez
     * ohledu na jakoukoli nabídku. Počítá se to tady, a ne v tom
     * skriptu, který řadu staví, aby se pravidlo o tom, co se do
     * hladiny započítává, nerozešlo s tím, co webu ukazuje dnes —
     * přesně tak se už jednou rozešel cenový verdikt mezi mapou
     * a stránkou pozemku.
     *
     * Velikost se schválně NEFILTRUJE (ceny(…, 0, …)): u konkrétního
     * pozemku se srovnává s podobně velkými, ale hladina okresu má
     * popsat celý okres. Vzorek pod MIN_VZOREK vrací null — radši
     * v grafu díra než bod, který nic neznamená. */
    function hladinaMista(uroven, nazev, druhG) {
      var pole = uroven === 'okres' ? nabidkyOkres[druhG + '|' + nazev]
        : uroven === 'kraj' ? nabidkyKraj[druhG + '|' + nazev]
        : nabidkyCR[druhG];
      var a = ceny(pole, 0, druhG);
      if (!a || a.length < MIN_VZOREK) return null;
      return { zaM2: median(a), vzorek: a.length };
    }

    return {
      druhGroup: druhGroup,
      hladinaMista: hladinaMista,
      MIN_VZOREK: MIN_VZOREK,
      MEZ_POCHYBNA: MEZ_POCHYBNA,
      MEZ_SLEVA: MEZ_SLEVA,
      MEZ_ROZPTYL: MEZ_ROZPTYL,
      neduveryhodna: neduveryhodna,
      percentil: percentil,
      odhad: odhad,
      medianTypu: medianTypu,
      /* Ven kvůli scripts/mericka-odhadu.mjs: měřidlo porovnává varianty
         odhadu a potřebuje týž sklon, jaký používá model sám. */
      sklon: SKLON
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
      '<div class="mo-radek"><span class="mo-k">' + coJe + '</span><span class="mo-v">' + fmt(d.price) + ' Kč</span></div>' +
      '<div class="mo-radek mo-hlavni"><span class="mo-k">Obvyklá cena ' + kde + '</span><span class="mo-v">' + fmt(o.castka) + ' Kč</span></div>' +
      // U pochybného rozdílu se nesmí jásat: tentýž údaj, jiné čtení.
      /* Podíl patří mezi důvody k tlumenému podání stejně jako pochybná
         sleva: text pod tím varuje, tak nesmí být vysázený jako radostná
         zpráva. */
      '<div class="mo-rozdil' + (o.pochybna || o.nejisty || o.podil ? ' mo-pochybna' : '') + '"><b>o ' + o.podOdhadem + ' % níž</b>' +
        (o.podil ? ' — jenže inzerát mluví o <b>spoluvlastnickém podílu</b>: v ceně je jen zlomek pozemku, kdežto výměra je celá. S celými pozemky se to srovnat nedá.'
          : o.pochybna ? ' — takový rozdíl bývá spoluvlastnický podíl nebo jiná výměra, ověřte si to'
          : o.nejisty ? ' — ale ceny podobných pozemků ' + kde + ' se mezi sebou liší násobky, takže tohle číslo je jen hrubé vodítko'
                    : ', tedy zhruba o ' + fmt(o.rozdil) + '\u00a0Kč') + '</div>' +
      '<p class="mo-pozn">Spočítáno z mediánu <b>' + fmt(Math.round(o.zaM2)) + ' Kč/m²</b> — z <b>' +
      o.vzorek + '</b> nabídek stejného druhu (' + esc(o.druh.toLowerCase()) + ') a podobné výměry ' + kde + '. ' +
      'Jsou to ceny <b>nabídkové</b>, ne za kolik se pozemky opravdu prodaly' +
      (volby.dlouhy ? ' — to ve veřejných zdrojích není. Berte to jako vodítko, ne jako odhad znalce.' : '.') +
      '</p></div>';
  }

  /* KOLIK NABÍDEK UŽ JE NA CENU OKRESU DOST.
     Není to mez pro počítání (to je MIN_VZOREK = 8, nejmenší vzorek, ze
     kterého se medián vůbec smí vzít), ale mez pro JISTOTU: pod ní se
     u čísla píše „na cenu okresu je to málo, berte to jako hrubé
     vodítko". Stojí to tady, protože ji potřebují tři místa — generátor
     stránek okresů, soubor s historií cen a graf v prohlížeči — a tři
     opsané dvacetpětky se jednou rozejdou. Rozejdou-li se, bude na téže
     stránce číslo s výhradou a nad ním graf bez ní, oba z téhož vzorku. */
  var DOST_NABIDEK = 25;

  root.PK_CENY = { DOST_NABIDEK: DOST_NABIDEK,
    postav: postav, rozbalModel: rozbalModel, druhGroup: druhGroup, median: median, OKRES_KRAJ: OKRES_KRAJ,
    kdeText: kdeText, blokOdhadu: blokOdhadu,
    zlomekPodilu: zlomekPodilu, vymeraVCene: vymeraVCene, zaMetr: zaMetr, zaMetrPopis: zaMetrPopis,
    /* Ven kvůli scripts/test-strop-ceny.mjs: zkouška přeměřuje, jestli
       je mez pořád dost daleko od skutečných cen. */
    MEZ_NEUVERITELNA: MEZ_NEUVERITELNA };
}(typeof window !== 'undefined' ? window : globalThis));
