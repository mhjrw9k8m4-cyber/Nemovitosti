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
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKHlidani = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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
  function bezDuplicit(list) {
    var videno = {}, ven = [];
    for (var i = 0; i < (list || []).length; i++) {
      var k = klicShody(list[i]);
      if (videno[k]) continue;
      videno[k] = true;
      ven.push(list[i]);
    }
    return ven;
  }

  function matches(s, d) {
    if (!s || !d) return false;
    if (s.ptype && d.type !== s.ptype) return false;
    if (s.druh && normd(d.druh).indexOf(normd(s.druh)) < 0) return false;
    if (s.max_price && !(d.price > 0 && d.price <= s.max_price)) return false;
    if (s.min_price && !(d.price > 0 && d.price >= s.min_price)) return false;
    if (s.min_area && !(d.area > 0 && d.area >= s.min_area)) return false;
    if (s.max_area && !(d.area > 0 && d.area <= s.max_area)) return false;
    /* Cena za metr je to, podle čeho se pozemky srovnávají nejčastěji —
       sto tisíc je u zahrady moc a u pole na deseti hektarech málo.
       Počítá se stejně jako všude jinde na webu: cena děleno výměra. */
    if (s.max_perm2) {
      if (!(d.price > 0 && d.area > 0)) return false;
      if (d.price / d.area > s.max_perm2) return false;
    }
    if (s.okres) {
      var k = normd(s.okres);
      if (normd(d.okres).indexOf(k) < 0 && normd(d.place).indexOf(k) < 0) return false;
    }
    if (s.features && s.features.length) {
      var f = d.features || [];
      for (var i = 0; i < s.features.length; i++) {
        var need = s.features[i];
        if (need === 'Přístupová cesta') {
          // vyžaduje reálnou cestu — tu mají jen vlastní inzeráty (pole access)
          if ((d.access || '').indexOf('cesta') < 0) return false;
        } else if (f.indexOf(need) < 0) return false;
      }
    }
    return true;
  }

  // Kolik nových pozemků sedí na jedno uložené hledání.
  function novychProHledani(s, data) {
    var videno = {};
    (s && s.seen_keys ? s.seen_keys : []).forEach(function (k) { videno[k] = 1; });
    var n = 0;
    (data || []).forEach(function (d) { if (matches(s, d) && !videno[keyOf(d)]) n++; });
    return n;
  }

  // Součet přes všechna hledání — to je číslo na odznaku. Jeden pozemek
  // může sedět na dvě hledání; počítá se jednou, ať odznak nenafukuje.
  function novychCelkem(hledani, data) {
    var nove = {};
    (hledani || []).forEach(function (s) {
      var videno = {};
      (s.seen_keys || []).forEach(function (k) { videno[k] = 1; });
      (data || []).forEach(function (d) {
        var k = keyOf(d);
        if (matches(s, d) && !videno[k]) nove[k] = 1;
      });
    });
    return Object.keys(nove).length;
  }

  return { normd: normd, keyOf: keyOf, matches: matches,
           klicShody: klicShody, bezDuplicit: bezDuplicit,
           novychProHledani: novychProHledani, novychCelkem: novychCelkem };
});
