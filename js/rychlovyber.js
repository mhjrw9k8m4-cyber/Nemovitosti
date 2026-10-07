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
 * 3. MÁ TO KONEC, A TEN KONEC JE NA DOHLED. Balíček je konečný — jenže
 *    „konečný" napoprvé znamenalo 1 955 karet a v hlavičce stálo
 *    „Zbývá 1 955". To není síto, to je běžící pás, a vypadá to jako
 *    nekonečno. Nabízí se proto DÁVKA dvaceti karet: je vidět, kolikátá
 *    je na řadě, dávka se dojede za pár minut a teprve pak se člověk
 *    rozhodne, jestli chce další.
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

  /* DÁVKA. Kolik karet se nabídne najednou. Bez stropu měl balíček
     1 955 karet a v hlavičce stálo „Zbývá 1 955" — to není síto, to je
     běžící pás. Modul si přitom v hlavičce psal, že „má to konec";
     konec po dvou tisících rozhodnutích ale žádný konec není. Dvacet
     je tak akorát na jedno sednutí a jde dopočítat, kolik zbývá. */
  var DAVKA = 20;

  /* Balíček: z toho, co je PRÁVĚ VIDĚT (tedy po filtrech), se vynechá,
     co už člověk rozhodl. Pořadí se nemíchá — drží se to, v jakém se
     nabídky ukazují v seznamu, aby „doporučené" zůstalo doporučené.
     Vrací nejvýš jednu dávku; kolik bylo k dispozici celkem, říká
     nerozhodnutych(). */
  function balicek(viditelne, pomer) {
    pomer = pomer || {};
    var jeSkryty = pomer.jeSkryty || function () { return false; };
    var jeUlozeny = pomer.jeUlozeny || function () { return false; };
    var davka = pomer.davka === 0 ? 0 : (pomer.davka || DAVKA);
    var out = [];
    for (var i = 0; i < (viditelne || []).length; i++) {
      var d = viditelne[i];
      if (!d) continue;
      if (jeSkryty(d) || jeUlozeny(d)) continue;
      out.push(d);
      if (davka && out.length >= davka) break;
    }
    return out;
  }

  /** Kolik nerozhodnutých nabídek je k dispozici celkem (bez stropu). */
  function nerozhodnutych(viditelne, pomer) {
    return balicek(viditelne, (function () {
      var k = {}, n;
      for (n in (pomer || {})) if (Object.prototype.hasOwnProperty.call(pomer, n)) k[n] = pomer[n];
      k.davka = 0;
      return k;
    }())).length;
  }

  /* Druhý parametr je, kolik nerozhodnutých bylo celkem — ať se dá na
     konci dávky říct „zbývá dalších 1 935", a ne jen „hotovo". */
  function stav(karty, celkem) {
    var k = karty || [];
    return { karty: k, i: 0, historie: [],
      celkem: typeof celkem === 'number' ? celkem : k.length };
  }

  /** Kolikátá karta z dávky je na řadě (1 až delkaDavky). */
  function poradi(s) { return s ? Math.min(s.i + 1, s.karty.length) : 0; }
  /** Kolik karet má dávka. */
  function delkaDavky(s) { return s ? s.karty.length : 0; }
  /** Kolik nerozhodnutých zůstane, až se dojede tahle dávka. */
  function zbyvaPoDavce(s) {
    if (!s) return 0;
    return Math.max(0, (s.celkem || 0) - s.karty.length);
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

  return { VPRAVO: VPRAVO, VLEVO: VLEVO, DAVKA: DAVKA,
    balicek: balicek, nerozhodnutych: nerozhodnutych, stav: stav,
    aktualni: aktualni, zbyva: zbyva, hotovo: hotovo,
    poradi: poradi, delkaDavky: delkaDavky, zbyvaPoDavce: zbyvaPoDavce,
    rozhodni: rozhodni, zpet: zpet, lzeZpet: lzeZpet, souhrn: souhrn };
});
