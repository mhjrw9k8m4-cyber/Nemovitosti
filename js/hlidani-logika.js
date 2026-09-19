/* Hlídání lokality — porovnávání pozemků s uloženým hledáním.
 *
 * Proč vlastní soubor: tahle logika žila uvnitř hlidani.html, takže ji
 * nešlo ani otestovat, ani použít jinde. A použít jinde je potřeba —
 * odznak v menu musí umět spočítat, kolik nových pozemků na člověka čeká,
 * jinak se to dozví, jen když si na stránku hlídání sám vzpomene.
 *
 * „Nové" znamená: sedí na uložené hledání a jeho otisk není mezi těmi,
 * které už uživatel viděl (seen_keys). Otisk musí být shodný s tím, co
 * počítá scripts/send-alerts.mjs, jinak by si web a robot protiřečily.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKHlidani = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normd(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // Stálý otisk pozemku. Shodný s keyOf() v scripts/send-alerts.mjs —
  // kdyby se rozešly, robot by považoval za nové něco, co už web ukázal.
  function keyOf(d) {
    return [d.type || '', normd(d.okres), normd(d.place), d.parcel || '', d.price || '', d.area || '']
      .join('|').slice(0, 240);
  }

  function matches(s, d) {
    if (!s || !d) return false;
    if (s.ptype && d.type !== s.ptype) return false;
    if (s.druh && normd(d.druh).indexOf(normd(s.druh)) < 0) return false;
    if (s.max_price && !(d.price > 0 && d.price <= s.max_price)) return false;
    if (s.min_area && !(d.area > 0 && d.area >= s.min_area)) return false;
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
           novychProHledani: novychProHledani, novychCelkem: novychCelkem };
});
