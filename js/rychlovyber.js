/* Rychlý výběr — třídění nabídek po jedné, palcem.
 *
 * PROČ. Na telefonu se dvěma tisíci nabídkami nedá rozumně procházet
 * seznam. Tohle je rychlé síto: jedna velká karta, doprava „schovat si",
 * doleva „tohle ne". Obě akce přitom NEJSOU nic nového — web uložené
 * i skryté pozemky má odjakživa, tohle je jen rychlejší způsob, jak je
 * rozdat.
 *
 * TŘI VĚCI, KTERÉ MUSÍ PLATIT, JINAK TO ŠKODÍ:
 *
 * 1. JDE TO VZÍT ZPĚT. Palec sklouzne a pozemek za 800 tisíc zmizí
 *    „navždy". Proto se každé rozhodnutí pamatuje a poslední jde vrátit.
 *    Bez toho by rychlost byla past.
 *
 * 2. NEJDE JEN O POSUN PRSTEM. Kdo ovládá web klávesnicí nebo čtečkou,
 *    musí mít tlačítka. Modul proto nezná gesta — dostává jen SMĚR
 *    a je jedno, jestli přišel z prstu, z klávesy, nebo z klepnutí.
 *
 * 3. MÁ TO KONEC. Balíček je konečný a dojde. Nekonečné sypání karet
 *    by z nástroje na hledání pozemku udělalo hrací automat; tohle má
 *    člověku ušetřit čas, ne ho u toho držet.
 *
 * Co už rozhodnuté je, se znovu nenabízí: uložené ani skryté pozemky se
 * do balíčku nedávají. Jinak by se člověk protáčel dokola přes totéž.
 */
(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.PKRychly = tovarna();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VPRAVO = 'vpravo', VLEVO = 'vlevo';

  /* Balíček: z toho, co je PRÁVĚ VIDĚT (tedy po filtrech), se vynechá,
     co už člověk rozhodl. Pořadí se nemíchá — drží se to, v jakém se
     nabídky ukazují v seznamu, aby „doporučené" zůstalo doporučené. */
  function balicek(viditelne, pomer) {
    pomer = pomer || {};
    var jeSkryty = pomer.jeSkryty || function () { return false; };
    var jeUlozeny = pomer.jeUlozeny || function () { return false; };
    var out = [];
    for (var i = 0; i < (viditelne || []).length; i++) {
      var d = viditelne[i];
      if (!d) continue;
      if (jeSkryty(d) || jeUlozeny(d)) continue;
      out.push(d);
    }
    return out;
  }

  function stav(karty) {
    return { karty: karty || [], i: 0, historie: [] };
  }

  function aktualni(s) { return (s && s.karty && s.i < s.karty.length) ? s.karty[s.i] : null; }
  function zbyva(s) { return s ? Math.max(0, s.karty.length - s.i) : 0; }
  function hotovo(s) { return zbyva(s) === 0; }

  /* Rozhodnutí. Vrací, CO SE MÁ STÁT — modul sám nikam nesahá, aby se
     dal zkoušet bez prohlížeče i bez úložiště. */
  function rozhodni(s, smer) {
    var d = aktualni(s);
    if (!d) return null;
    if (smer !== VPRAVO && smer !== VLEVO) return null;
    s.historie.push({ smer: smer, pozemek: d, index: s.i });
    s.i++;
    return { akce: smer === VPRAVO ? 'uloz' : 'skryj', pozemek: d };
  }

  /* Krok zpět. Vrací, co se má odvolat — a posune se na tu kartu, ať ji
     člověk vidí a může se rozhodnout jinak. */
  function zpet(s) {
    if (!s || !s.historie.length) return null;
    var p = s.historie.pop();
    s.i = p.index;
    return { akce: p.smer === VPRAVO ? 'zrus-uloz' : 'zrus-skryj', pozemek: p.pozemek };
  }

  function lzeZpet(s) { return !!(s && s.historie && s.historie.length); }

  /* Kolik čeho člověk rozdal — pro shrnutí na konci. */
  function souhrn(s) {
    var u = 0, sk = 0;
    for (var i = 0; i < ((s && s.historie) || []).length; i++) {
      if (s.historie[i].smer === VPRAVO) u++; else sk++;
    }
    return { ulozeno: u, skryto: sk, celkem: u + sk };
  }

  return { VPRAVO: VPRAVO, VLEVO: VLEVO, balicek: balicek, stav: stav,
    aktualni: aktualni, zbyva: zbyva, hotovo: hotovo,
    rozhodni: rozhodni, zpet: zpet, lzeZpet: lzeZpet, souhrn: souhrn };
});
