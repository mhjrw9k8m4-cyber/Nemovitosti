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
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[-‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* Slovník. Delší vazby stojí první — viz pravidlo 2. */
  /* Tvar [název pro člověka, SLOVO K NAPSÁNÍ, tvary k rozpoznání].
     Prostřední je to, co se vloží do políčka, když si někdo vybere
     z našeptávače: musí to být slovo, které parser zase přečte. Název
     „Stavební / zastavěná" by přečíst nešel a věta by se rozpadla. */
  var DRUHY = [
    ['Louka / travní porost', 'travní porost', ['trvaly travni porost', 'travni porost', 'louka', 'louky', 'travni', 'pastvina', 'pastviny']],
    ['Stavební / zastavěná', 'stavební', ['stavebni pozemek', 'stavebni parcela', 'stavebni', 'stavebak', 'zastavena']],
    ['Lesní pozemek', 'lesní', ['lesni pozemek', 'lesni', 'les', 'lesy', 'lesa']],
    ['Orná půda', 'orná', ['orna puda', 'orna', 'pole', 'poli']],
    ['Zahrada', 'zahrada', ['zahrada', 'zahrady', 'zahradu']],
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

  function cislo(s) {
    var c = s.replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(c)) return null;
    return parseFloat(c);
  }

  function vetsiPrvni(pole) {
    return pole.slice().sort(function (a, b) { return b.split(' ').length - a.split(' ').length || b.length - a.length; });
  }

  function rozeber(dotaz) {
    var slova = norm(dotaz).split(' ').filter(Boolean);
    var vzato = new Array(slova.length);
    var ven = { druh: null, typ: null, kraj: null, site: [], nejakeSite: false,
      jenCelek: false, levne: false, zaMetrOd: null, zaMetrDo: null,
      cenaOd: null, cenaDo: null, plochaOd: null, plochaDo: null, text: '', casti: [] };

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

    /* --- 1) Rozsahy s jednotkou: „do 1,5 mil", „nad 2 ha", „od 500 tis" --- */
    var SMERY = { do: 'do', pod: 'do', max: 'do', od: 'od', nad: 'od', min: 'od' };
    for (var i = 0; i < slova.length; i++) {
      if (vzato[i]) continue;
      var smer = SMERY[slova[i]];
      if (!smer) continue;
      var c = cislo(slova[i + 1] || '');
      if (c == null) continue;
      var jed = slova[i + 2] || '';
      var delkaJed = 1;
      /* „Kč za metr" — tři slova, jedna jednotka. */
      for (var zf = 0; zf < ZA_METR_FRAZE.length; zf++) {
        var f3 = ZA_METR_FRAZE[zf];
        if (slova[i + 2] === f3[0] && slova[i + 3] === f3[1] && slova[i + 4] === f3[2]) {
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
      var delka = 2 + delkaJed;
      if (!nas) {
        if (c < BEZ_JEDNOTKY_OD) continue;
        nas = [null, 1, 'cena'];
        delka = 2;
        jed = 'Kč';
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
      zaber(i, delka, { druh: kde, smer: smer, hodnota: hodnota,
        popis: slova[i] + ' ' + slova[i + 1] + ' ' + jed });
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
          popis: 'kolem ' + slova[bi] + ' ' + bjed });
      } else if (bnas[2] === 'cena') {
        if (ven.cenaOd != null || ven.cenaDo != null) continue;
        ven.cenaDo = bhod;
        zaber(bi, 2, { druh: 'cena', smer: 'do', hodnota: bhod,
          popis: 'do ' + slova[bi] + ' ' + bjed });
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
    return ven;
  }

  return { norm: norm, rozeber: rozeber,
    DRUHY: DRUHY, TYPY: TYPY, SITE: SITE, KRAJE: KRAJE, OSTATNI: OSTATNI };
});
