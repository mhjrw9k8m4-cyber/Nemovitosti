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
   + ' prosim dekuji').split(' ').forEach(function (w) { if (w) VYPLN[w] = true; });

  /* Čísla s jednotkou. „1,5 mil" i „1.5 mil" i „500tis". */
  var NASOBEK = [
    [/^(?:mil|mili[oó]n\w*|m)$/, 1000000, 'cena'],
    [/^(?:tis|tis\.|tisic\w*|k)$/, 1000, 'cena'],
    [/^(?:kc|korun\w*|czk)$/, 1, 'cena'],
    [/^(?:ha|hektar\w*)$/, 10000, 'plocha'],
    [/^(?:m2|m²|metru|metry|metr)$/, 1, 'plocha'],
  ];
  /* Od jakého čísla se „do 100000" čte jako koruny. Pod tím se netipuje. */
  var BEZ_JEDNOTKY_OD = 10000;

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
    var ven = { druh: null, typ: null, kraj: null, site: [], jenCelek: false,
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
      var nas = null;
      for (var n = 0; n < NASOBEK.length; n++) if (NASOBEK[n][0].test(jed)) { nas = NASOBEK[n]; break; }
      /* Bez jednotky se dřív nehádalo vůbec — jenže „les do 100000" je
         jasná věta a celé „do 100000" padalo do textu, takže výpis byl
         prázdný. Statisícové číslo je v téhle větě vždycky cena
         v korunách. Malá čísla zůstávají textem: „do 5" může být
         cokoli a tipovat se nebude. */
      var delka = 3;
      if (!nas) {
        if (c < BEZ_JEDNOTKY_OD) continue;
        nas = [null, 1, 'cena'];
        delka = 2;
        jed = 'Kč';
      }
      var hodnota = Math.round(c * nas[1]);
      var kde = nas[2];                          // 'cena' nebo 'plocha'
      ven[kde + (smer === 'do' ? 'Do' : 'Od')] = hodnota;
      /* V odznaku stojí to, co člověk NAPSAL („nad 2 ha"), ne co si z toho
         web přeložil („od 2 ha“). Jinak se odznak nedá spárovat s větou
         a rušení by působilo, že se maže něco jiného. */
      zaber(i, delka, { druh: kde, smer: smer, hodnota: hodnota,
        popis: slova[i] + ' ' + slova[i + 1] + ' ' + jed });
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

  return { norm: norm, rozeber: rozeber, DRUHY: DRUHY, TYPY: TYPY, SITE: SITE, KRAJE: KRAJE };
});
