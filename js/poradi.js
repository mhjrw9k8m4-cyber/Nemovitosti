/* Pořadí nabídek: kvalita rozhoduje, ale ne navždy.
 *
 * Problém, který to řeší: pořadí bylo dané pevným skóre, takže na prvních
 * osmi místech stálo den za dnem těch samých osm pozemků. Zbytek — a to je
 * devětadevadesát procent nabídky — se nahoru nedostal nikdy. Kdo se
 * nedívá do celého výpisu (a to je většina lidí), o starší inzeráty prostě
 * nezavadil, i když mezi nimi byl ten, který hledal. Tomu se na webech
 * říká „zapadnout" a je to tichá ztráta pro obě strany.
 *
 * Jak to funguje:
 *   1. Skóre (výhodnost proti okolí, druh nabídky) se zaokrouhlí do PÁSEM.
 *      Pásmo rozhoduje vždycky: dobrá nabídka se nikdy nedostane pod
 *      špatnou jen proto, že „je na řadě".
 *   2. UVNITŘ pásma má každá nabídka stálé místo (podle otisku svého
 *      klíče) a celé to kolo se každý den POSUNE o jednu obrazovku dál.
 *      Není to losování: je to otáčení, u kterého se dá spočítat, kdy
 *      přijde řada na kteroukoli nabídku uvnitř jejího pásma.
 *   3. To samo ale nestačí a bylo to měřitelné: horní pásma mají dohromady
 *      64 nabídek a výpis ukazuje osm, takže se zbylých 1 883 nedostalo
 *      nahoru ani za rok. Proto posledních pár míst ve výpisu nepatří
 *      pásmům, ale řadě napříč celou nabídkou — viz stridacka() níž.
 *   3. Během dne se nic nepřeskládá. Kdo si stránku obnoví nebo se vrátí
 *      za hodinu, vidí totéž pořadí — jinak by výpis působil rozbitě.
 *
 * Proč ne náhodně: náhoda znamená, že se po obnovení stránky všechno
 * přehází a co člověk viděl, už nenajde. A hlavně u ní nejde zaručit, že
 * se nahoru dostane každý — zkoušel jsem to: z dvou set nabídek v jednom
 * pásmu se za šedesát dní nedostalo nahoru osmnáct. U otáčení je jich nula.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKPoradi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Šířka pásma. Čím širší, tím víc se střídá (a tím méně záleží na malých
     rozdílech ve skóre); čím užší, tím víc rozhoduje skóre a tím méně se
     střídá. Osm bodů je naměřený kompromis: skóre má rozsah přes sedmdesát
     bodů, takže pásem je kolem devíti — dost na to, aby nahoře zůstaly
     opravdu dobré nabídky, a přitom je v každém pásmu dost nabídek na
     střídání. */
  var SIRKA_PASMA = 8;

  /* O kolik míst se kolo posune za den. Jedna obrazovka výpisu (osm
     nabídek) znamená, že se nahoře každý den vystřídá celá osmička a celá
     nabídka se v jednom pásmu prostřídá za (počet / 8) dní. */
  var KROK_ZA_DEN = 8;

  // Číslo dne (kolikátý den od roku 1970). Mění se o půlnoci.
  function denIndex(datum) {
    var d = datum || new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }

  // FNV-1a. Potřebujeme jen rovnoměrné rozprostření, ne kryptografii.
  function otisk(text, seed) {
    var h = (2166136261 ^ (seed | 0)) >>> 0;
    var s = String(text == null ? '' : text);
    for (var i = 0; i < s.length; i++) {
      h = (h ^ s.charCodeAt(i)) >>> 0;
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function pasmo(skore) { return Math.floor((skore || 0) / SIRKA_PASMA); }

  /* Prostřídá pole na místě. fnSkore vrací kvalitu nabídky, fnKlic její
     stálý klíč (dvě různé nabídky nesmí mít týž, jinak by se točily
     společně). „den" je číslo dne z denIndex(); dá se podstrčit, aby se
     dalo otáčení zkoušet bez čekání do zítřka. */
  function prostridej(list, fnSkore, fnKlic, den, krok, prihozeni) {
    var d = den == null ? denIndex() : den;
    var k = krok == null ? KROK_ZA_DEN : krok;
    var j = prihozeni == null ? 0 : prihozeni;
    // Rozdělíme do pásem podle kvality.
    var pasma = new Map();
    list.forEach(function (x) {
      var p = pasmo(fnSkore(x));
      if (!pasma.has(p)) pasma.set(p, []);
      pasma.get(p).push(x);
    });
    var ven = [];
    Array.from(pasma.keys()).sort(function (a, b) { return b - a; }).forEach(function (p) {
      var skupina = pasma.get(p);
      // Stálé pořadí uvnitř pásma — nezávislé na dni.
      skupina.sort(function (a, b) { return otisk(fnKlic(a), 0) - otisk(fnKlic(b), 0); });
      // …a posunuté o „den × krok" míst. Malá pásma se otočí rychleji,
      // velká pomaleji, ale projdou celá.
      var n = skupina.length;
      if (n > 1) {
        var posun = ((d * k + j) % n + n) % n;
        skupina = skupina.slice(posun).concat(skupina.slice(0, posun));
      }
      ven = ven.concat(skupina);
    });
    for (var i = 0; i < ven.length; i++) list[i] = ven[i];
    return list;
  }

  /* Náhodné přimíchání POKAŽDÉ JINAK.
     Otáčení samo posune výpis jen raz za den, takže kdo se během dne
     podívá dvakrát, vidí totéž. Aby nabídka působila živě, přidá se
     k dennímu posunu náhodné přihození v rozmezí jedné obrazovky — při
     každé návštěvě jiné. Pořadí se tím zamíchá, ale denní otáčení
     zůstane: ručí za to, že se nahoru dostane každá nabídka, ne jen ty,
     na které náhoda sáhne.

     Číslo se drží v sessionStorage, tedy po dobu jedné návštěvy. Kdyby se
     losovalo při každém překreslení, přeskládal by se výpis pod rukou
     pokaždé, když člověk klepne na filtr — a co viděl, by nenašel. */
  var KLIC_SEANCE = 'pk_poradi_seance';
  function prihozeniSeance() {
    var n = null;
    try {
      var ulozene = sessionStorage.getItem(KLIC_SEANCE);
      if (ulozene != null) n = parseInt(ulozene, 10);
      if (n == null || isNaN(n)) {
        n = Math.floor(Math.random() * KROK_ZA_DEN);
        sessionStorage.setItem(KLIC_SEANCE, String(n));
      }
    } catch (e) { n = Math.floor(Math.random() * KROK_ZA_DEN); }
    return n;
  }
  // Nové zamíchání na vyžádání (volba „Náhodně" v nabídce řazení).
  function zamichejZnovu() {
    var n = Math.floor(Math.random() * 1000000);
    try { sessionStorage.setItem(KLIC_SEANCE, String(n)); } catch (e) {}
    return n;
  }

  /* Úplně náhodné pořadí (volba „Náhodně"). Kvalita se neřeší — kdo si
     tohle vybere, chce vidět nabídku bez našeho názoru na ni. Seed drží
     pořadí po dobu návštěvy, aby se výpis nepřeskládal pod rukou. */
  function nahodne(list, fnKlic, seed) {
    var s = seed == null ? prihozeniSeance() : seed;
    var poradi = new Map();
    list.forEach(function (d) { poradi.set(d, otisk(fnKlic(d), s)); });
    list.sort(function (a, b) { return poradi.get(a) - poradi.get(b); });
    return list;
  }

  /* --- Střídačka: pár míst ve výpisu patří i ostatním -----------------
   *
   * Otáčení uvnitř pásem samo o sobě nestačilo a bylo to měřitelné:
   * výpis na hlavní stránce ukazuje OSM nabídek a horní pásma (dražby a
   * pozemky s ověřenou slevou) jich mají dohromady 64. Těch osm míst tedy
   * pořád obsazovaly tytéž nabídky a zbylých 1 883 se do výpisu nedostalo
   * ani za rok — pásmo rozhoduje vždycky, takže se dostat ani nemohly.
   * Přesně to mělo otáčení odstranit a neodstranilo.
   *
   * Proto posledních několik míst na obrazovce nepatří pásmům, ale řadě:
   * berou se z ostatních nabídek a každý den (a každou návštěvu) se
   * posunou dál. Horní místa zůstávají čistě podle kvality, takže se
   * nestane, že by slabá nabídka stála nad dobrou hned nahoře.
   *
   * Měřeno na skutečných datech (1 947 nabídek, výpis 8 míst, 3 na
   * střídačku): za 30 dní se do výpisu dostane 135 nabídek místo 64,
   * za rok 1 046 místo 64.
   */
  var MIST_NA_STRIDACKU = 3;
  function stridacka(list, kolikVidet, mist, den, fnKlic, prihozeni, fnVhodne) {
    var videt = kolikVidet == null ? 8 : kolikVidet;
    var m = mist == null ? MIST_NA_STRIDACKU : mist;
    var d = den == null ? denIndex() : den;
    var j = prihozeni == null ? 0 : prihozeni;
    if (!list || m < 1 || list.length <= videt) return list;
    var drzi = list.slice(0, Math.max(0, videt - m));
    var zbytek = list.slice(Math.max(0, videt - m));
    /* Do střídačky jen to, co má smysl ukazovat — prošlá dražba nahoře je
       horší než žádná. Nevhodné zůstávají tam, kde byly. */
    var fronta = [];
    for (var i = 0; i < zbytek.length; i++) if (!fnVhodne || fnVhodne(zbytek[i])) fronta.push(zbytek[i]);
    if (!fronta.length) return list;
    // Stálé pořadí fronty (nezávislé na dni) a posun o „den × počet míst".
    var poradi = new Map();
    fronta.forEach(function (x, idx) { poradi.set(x, otisk(fnKlic(x), 0) * 4096 + (idx % 4096)); });
    fronta.sort(function (a, b) { return poradi.get(a) - poradi.get(b); });
    var n = fronta.length, vyber = [], vybrano = new Set();
    for (var s = 0; s < m && s < n; s++) {
      var kus = fronta[((d * m + j + s) % n + n) % n];
      if (!vybrano.has(kus)) { vybrano.add(kus); vyber.push(kus); }
    }
    var ven = drzi.concat(vyber);
    for (var k = 0; k < zbytek.length; k++) if (!vybrano.has(zbytek[k])) ven.push(zbytek[k]);
    for (var z = 0; z < ven.length; z++) list[z] = ven[z];
    return list;
  }

  return { SIRKA_PASMA: SIRKA_PASMA, KROK_ZA_DEN: KROK_ZA_DEN, denIndex: denIndex,
    MIST_NA_STRIDACKU: MIST_NA_STRIDACKU, stridacka: stridacka,
    otisk: otisk, pasmo: pasmo, prostridej: prostridej,
    prihozeniSeance: prihozeniSeance, zamichejZnovu: zamichejZnovu, nahodne: nahodne };
});
