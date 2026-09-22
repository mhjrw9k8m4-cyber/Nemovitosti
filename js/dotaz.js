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
  var SITE = [
    ['elektrina', 'Elektřina', 'elektřina', ['elektrina', 'elektriny', 'elektro', 'proud', 'el. energie']],
    ['voda', 'Voda', 'voda', ['vodovod', 'voda', 'vody', 'studna', 'vrt']],
    ['kanalizace', 'Kanalizace', 'kanalizace', ['kanalizace', 'kanalizaci', 'septik', 'cov']],
    ['plyn', 'Plyn', 'plyn', ['plyn', 'plynu', 'plynofikace']],
    ['cesta', 'Příjezd', 'příjezd', ['prijezd', 'prijezdova cesta', 'pristupova cesta', 'pristup', 'cesta']],
  ];
  var CELEK = ['bez podilu', 'jen cele', 'cely pozemek', 'cele pozemky', 'celek', 'nepodil'];

  /* Čísla s jednotkou. „1,5 mil" i „1.5 mil" i „500tis". */
  var NASOBEK = [
    [/^(?:mil|mili[oó]n\w*|m)$/, 1000000, 'cena'],
    [/^(?:tis|tis\.|tisic\w*|k)$/, 1000, 'cena'],
    [/^(?:kc|korun\w*|czk)$/, 1, 'cena'],
    [/^(?:ha|hektar\w*)$/, 10000, 'plocha'],
    [/^(?:m2|m²|metru|metry|metr)$/, 1, 'plocha'],
  ];
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
    var ven = { druh: null, typ: null, site: [], jenCelek: false,
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
      if (!nas) continue;                        // bez jednotky nehádáme
      var hodnota = Math.round(c * nas[1]);
      var kde = nas[2];                          // 'cena' nebo 'plocha'
      ven[kde + (smer === 'do' ? 'Do' : 'Od')] = hodnota;
      /* V odznaku stojí to, co člověk NAPSAL („nad 2 ha"), ne co si z toho
         web přeložil („od 2 ha“). Jinak se odznak nedá spárovat s větou
         a rušení by působilo, že se maže něco jiného. */
      zaber(i, 3, { druh: kde, smer: smer, hodnota: hodnota,
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
    for (var z2 = 0; z2 < slova.length; z2++) if (!vzato[z2]) zbytek.push(slova[z2]);
    ven.text = zbytek.join(' ');
    return ven;
  }

  return { norm: norm, rozeber: rozeber, DRUHY: DRUHY, TYPY: TYPY, SITE: SITE };
});
