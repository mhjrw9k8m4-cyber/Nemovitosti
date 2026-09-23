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
  /* Shoda v obci, okrese, ceně, výměře i druhu ještě neznamená týž pozemek.
     V Polici nad Metují takhle zmizely TŘI dražby: čtyři sousední parcely
     (769/274, /276, /277, /278) měly stejnou výměru i vyvolávací cenu, ale
     každá svůj termín — 24. 9., 15. 10., 22. 10. a 5. 11. Web z nich
     ukázal jednu a tři dražby prostě nebyly vidět.
     Proto: když obě strany parcelní číslo znají a liší se, jsou to různé
     pozemky. Totéž u termínu dražby. Když to jeden ze záznamů neuvádí
     (u inzerátů parcelní číslo většinou chybí), rozhoduje dál shoda
     v ostatním — tam je opakování ze dvou zdrojů to pravděpodobnější. */
  function znamaParcela(d) {
    var p = (d && d.parcel != null) ? String(d.parcel).trim() : '';
    return (p && p !== '—' && p !== '-') ? p : null;
  }
  function znamyTermin(d) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec((d && d.extra) || '');
    return m ? m[0] : null;
  }
  function tyzPozemek(a, b) {
    var pa = znamaParcela(a), pb = znamaParcela(b);
    if (pa && pb && pa !== pb) return false;
    var ta = znamyTermin(a), tb = znamyTermin(b);
    if (ta && tb && ta !== tb) return false;
    return true;
  }
  function bezDuplicit(list) {
    var skupiny = {}, ven = [];
    for (var i = 0; i < (list || []).length; i++) {
      var d = list[i], k = klicShody(d);
      var skup = skupiny[k] || (skupiny[k] = []);
      var uz = false;
      for (var j = 0; j < skup.length; j++) { if (tyzPozemek(skup[j], d)) { uz = true; break; } }
      if (uz) continue;
      skup.push(d);
      ven.push(d);
    }
    return ven;
  }

  /* Tytéž věci, dva zdroje. Pole `features` a `access` vyplňuje majitel
     ve formuláři — má je tedy jen hrstka vlastních inzerátů. U nabídek
     sbíraných robotem stojí totéž v POPISU a robot si to z něj vytáhne
     do pole `site` (js/vybaveni.js).
     Dokud se hlídání dívalo jen na `features`, znamenalo zaškrtnutí
     „Elektřina" ticho: ze sbíraných nabídek nemá pole `features` ani
     jedna, takže hlídání nemohlo najít nic — a nikde to neřeklo.
     Co se z popisu vyčíst nedá (oplocení, stavba k rekonstrukci), tu
     schválně není: to musí dál pocházet z formuláře. */
  var SITE_KLIC = {
    'Elektřina': 'elektrina',
    'Voda': 'voda',
    'Kanalizace': 'kanalizace',
    'Plyn': 'plyn',
    'Přístupová cesta': 'cesta',
  };

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
      var site = d.site || [];
      for (var i = 0; i < s.features.length; i++) {
        var need = s.features[i];
        var klic = SITE_KLIC[need];
        if (klic && site.indexOf(klic) >= 0) continue;   // stojí to v popisu nabídky
        if (need === 'Přístupová cesta') {
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

  return {
    tyzPozemek: tyzPozemek, normd: normd, keyOf: keyOf, matches: matches,
           klicShody: klicShody, bezDuplicit: bezDuplicit,
           novychProHledani: novychProHledani, novychCelkem: novychCelkem };
});
