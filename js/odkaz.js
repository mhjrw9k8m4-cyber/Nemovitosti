/* Stav mapy v adrese — aby šel výřez a filtry poslat odkazem.
 *
 * PROČ. Kdo si na mapě nastavil „exekuce do 300 000 kolem Kolína", neměl
 * jak to někomu poslat: adresa zůstávala pořád stejná. Odkaz na konkrétní
 * pozemek (?p=) fungoval odjakživa, ale pohled na výběr ne.
 *
 * PROČ HASH, A NE ?parametry. Parametry jsou na tomhle webu JEDNORÁZOVÉ
 * PŘÍKAZY: ?kraj=, ?obec=, ?lid=, ?p= něco provedou a pak je cleanUrl()
 * schválně smaže, aby se při obnovení stránky nespustily znovu. Stav mapy
 * je pravý opak — má v adrese zůstat a měnit se při každém posunu. Kdyby
 * sdílel totéž místo, přetahovaly by se o něj.
 *
 * CO SE NESDÍLÍ, A PROČ. Ne všechno, co filtruje, do odkazu patří:
 *
 *   · MOJE POLOHA. „Pozemky do 10 km ode mě" je filtr jako každý jiný,
 *     jenže v odkazu by to byly GPS souřadnice toho, kdo ho posílá.
 *     Sdílet odkaz nesmí znamenat prozradit, kde bydlím.
 *   · ULOŽENÉ, SKRYTÉ A PROŠLÉ. Tyhle seznamy leží v localStorage
 *     prohlížeče a u příjemce jsou prázdné. Odkaz „jen moje uložené" by
 *     mu ukázal nic a vypadalo by to jako chyba webu.
 *
 * Každý filtr proto musí být v jednom z těch dvou seznamů. Že na žádný
 * nový nezapomeneme, hlídá scripts/test-odkaz.mjs: čte js/main.js, vybere
 * z filtrovací funkce proměnné a spadne, dokud nejsou zařazené.
 */
(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.PKOdkaz = tovarna();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* klic   — jak se to jmenuje v adrese (krátce, ať je odkaz čitelný)
     stav   — jak se to jmenuje v js/main.js
     tvar   — 'text' | 'cislo' | 'logicka' | 'seznam' */
  var SDILENE = [
    { klic: 't',        stav: 'activeType',      tvar: 'text',    vychozi: 'all' },
    { klic: 'd',        stav: 'druhVybrane',     tvar: 'seznam' },
    { klic: 'co',       stav: 'minPrice',        tvar: 'cislo' },
    { klic: 'cd',       stav: 'maxPrice',        tvar: 'cislo' },
    { klic: 'po',       stav: 'minArea',         tvar: 'cislo' },
    { klic: 'pd',       stav: 'maxArea',         tvar: 'cislo' },
    { klic: 'm2',       stav: 'maxPerM2',        tvar: 'cislo' },
    { klic: 'v',        stav: 'zadaneVybaveni',  tvar: 'seznam' },
    { klic: 'celek',    stav: 'jenCelek',        tvar: 'logicka' },
    { klic: 'konci',    stav: 'urgentOnly',      tvar: 'logicka' },
    { klic: 'levne',    stav: 'levneOnly',       tvar: 'logicka' },
    /* „Zlevněné" se sdílí stejně jako „pod obvyklou cenou": odkaz na
       zlevněné pozemky v jednom okrese je přesně to, co si lidi posílají.
       Bez tohohle řádku by se filtr zapnul, ale z odkazu vypadl. */
    { klic: 'slevy',    stav: 'zlevneneOnly',    tvar: 'logicka' },
    { klic: 'podobne',  stav: 'ukazPodobne',     tvar: 'logicka' },
    /* DVA FILTRY NA KRAJ, NE JEDEN. „krajFiltr" je rozbalovátko nad
       mapou, „selectedKraj" je kraj vybraný klepnutím do mapy (ta se na
       něj i přiblíží). Dělají skoro totéž, ale jsou to dva ovladače a
       člověk může mít zapnutý každý zvlášť — kdyby se sdílel jen jeden,
       odkaz by ukázal jiný výběr. Na tohle přišla až kontrola, která
       čte filtrovací funkci z js/main.js. */
    { klic: 'kraj',     stav: 'krajFiltr',       tvar: 'text',    vychozi: 'all' },
    { klic: 'krajmapa', stav: 'selectedKraj',    tvar: 'text' },
    { klic: 'q',        stav: 'hledani',         tvar: 'text' },
    /* ŘAZENÍ PATŘÍ DO ODKAZU TAKY. Není to filtr — ve filtrovací funkci
       se neobjeví — ale je to půlka toho, co člověk vidí: kdo pošle
       „nejlevnější nahoře", čeká, že to příjemce uvidí stejně. Přišlo se
       na to až zkouškou celého kolečka v prohlížeči. */
    { klic: 'razeni',   stav: 'sortMode',        tvar: 'text',    vychozi: 'demand' },
    { klic: 'obec',     stav: 'mistoObec',       tvar: 'text' },
    { klic: 'okres',    stav: 'mistoOkres',      tvar: 'text' }
  ];

  /* Filtry, které do odkazu VĚDOMĚ nepatří. Důvod se píše sem, ne do
     hlavy někomu, kdo to bude za rok číst. */
  var NESDILENE = [
    { stav: 'mojeMisto',    proc: 'GPS souřadnice toho, kdo odkaz posílá' },
    { stav: 'okoliAktivni', proc: 'odvozeno z mojeMisto' },
    { stav: 'kmOd',         proc: 'počítá vzdálenost od mojeMisto' },
    { stav: 'okruh',        proc: 'poloměr kolem mojeMisto' },
    { stav: 'okruhStred',   proc: 'střed okruhu je moje poloha' },
    { stav: 'favOnly',      proc: 'uložené pozemky leží v localStorage, u příjemce je prázdno' },
    { stav: 'ukazSkryte',   proc: 'skryté pozemky jsou místní volba, neukládá se ani mezi návštěvami' },
    { stav: 'ukazProsle',   proc: 'místní volba, u příjemce by nic neznamenala' },
    { stav: 'mistoFiltr',   proc: 'do adresy jde rozložené na obec a okres' },
    { stav: 'searchToks',   proc: 'odvozeno z hledaného textu (q)' },
    { stav: 'userPos',      proc: 'moje poloha — a s ní i řazení „nejblíž ke mně", které z ní vychází' },
    { stav: 'kmFromUser',   proc: 'počítá vzdálenost od mojí polohy' },
    { stav: 'dotazFiltr',   proc: 'odvozeno z hledaného textu (q)' },
    /* Nakreslený tvar by se do adresy zakódovat DAL — je to jen geometrie,
       nic osobního. Nesdílí se z jiného důvodu: hlídání i uložená hledání
       umí OKRUH (střed a poloměr), ne mnohoúhelník. Odkaz s nakresleným
       tvarem by tedy vedl k výběru, který si příjemce nemůže uložit ani
       hlídat — a první, o co se pokusí, je právě to. Kreslení je rychlé
       zúžení na místě; co má přetrvat, patří do hlídání jako okruh. */
    { stav: 'vyberTvar',    proc: 'nakreslený tvar je zúžení na místě; hlídání umí okruh, ne mnohoúhelník' }
  ];

  function cislo(x) { var n = Number(x); return isFinite(n) && n > 0 ? Math.round(n) : 0; }

  /* Poloha a přiblížení. Na pět desetinných míst, což je zhruba metr —
     delší číslo jen prodlužuje odkaz a na mapě není vidět. */
  function polohaText(stred) {
    if (!stred || !isFinite(stred.lat) || !isFinite(stred.lng)) return '';
    var z = cislo(stred.zoom);
    return [(+stred.lat).toFixed(5), (+stred.lng).toFixed(5), z || 7].join(',');
  }
  function polohaZeStr(s) {
    var k = String(s || '').split(',');
    if (k.length < 2) return null;
    var lat = Number(k[0]), lng = Number(k[1]), z = Number(k[2]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat: lat, lng: lng, zoom: (isFinite(z) && z > 0) ? Math.round(z) : 0 };
  }

  /* Stav → text do adresy. Co je ve výchozím stavu, se VYNECHÁVÁ: adresa
     má nést jen to, co člověk opravdu nastavil, jinak je z ní nečitelná
     šňůra a nikdo nepozná, co v ní je podstatné. */
  function zapis(stav) {
    stav = stav || {};
    var kusy = [];
    var p = polohaText(stav.poloha);
    if (p) kusy.push('m=' + p);
    SDILENE.forEach(function (s) {
      var v = stav[s.stav];
      if (s.tvar === 'logicka') { if (v) kusy.push(s.klic + '=1'); return; }
      if (s.tvar === 'cislo') { var n = cislo(v); if (n) kusy.push(s.klic + '=' + n); return; }
      if (s.tvar === 'seznam') {
        var pole = (v || []).filter(function (x) { return x != null && x !== ''; });
        if (pole.length) kusy.push(s.klic + '=' + pole.map(encodeURIComponent).join(','));
        return;
      }
      var t = (v == null ? '' : String(v)).trim();
      if (t && t !== s.vychozi) kusy.push(s.klic + '=' + encodeURIComponent(t));
    });
    return kusy.join('&');
  }

  /* Text z adresy → stav. Co nepoznáme, zahodíme — do adresy může sáhnout
     kdokoli a rozbitý odkaz nesmí shodit stránku. */
  function cti(hash) {
    var s = String(hash || '').replace(/^#/, '');
    var out = {};
    if (!s) return out;
    var podleKlice = {};
    SDILENE.forEach(function (x) { podleKlice[x.klic] = x; });
    s.split('&').forEach(function (kus) {
      var i = kus.indexOf('=');
      if (i < 0) return;
      var klic = kus.slice(0, i), hod = kus.slice(i + 1);
      var dekod = function (x) { try { return decodeURIComponent(x); } catch (e) { return ''; } };
      if (klic === 'm') { var pol = polohaZeStr(dekod(hod)); if (pol) out.poloha = pol; return; }
      var def = podleKlice[klic];
      if (!def) return;
      if (def.tvar === 'logicka') { out[def.stav] = hod === '1'; return; }
      if (def.tvar === 'cislo') { var n = cislo(hod); if (n) out[def.stav] = n; return; }
      if (def.tvar === 'seznam') {
        var pole = hod.split(',').map(dekod).filter(function (x) { return x !== ''; });
        if (pole.length) out[def.stav] = pole;
        return;
      }
      var t = dekod(hod).trim();
      if (t) out[def.stav] = t;
    });
    return out;
  }

  /* Je ten hash náš, nebo je to kotva (#podminky)? Podle toho se pozná,
     jestli má scroll řídit stránka, nebo my. */
  function jeStavMapy(hash) {
    var s = String(hash || '').replace(/^#/, '');
    if (!s || s.indexOf('=') < 0) return false;
    var zname = { m: 1 };
    SDILENE.forEach(function (x) { zname[x.klic] = 1; });
    return s.split('&').some(function (kus) { return zname[kus.split('=')[0]] === 1; });
  }

  return { zapis: zapis, cti: cti, jeStavMapy: jeStavMapy,
    SDILENE: SDILENE, NESDILENE: NESDILENE };
});
