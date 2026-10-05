/* Okruh kolem místa — „pozemky do 30 km od Brna".
 *
 * Proč to tu je: pole hledání umí druh, cenu, výměru, kraj i obec, ale
 * NEJPŘIROZENĚJŠÍ dotaz na pozemek byl dřív ten jediný, který vracel
 * nulu. Změřeno na ostrých datech (2 019 nabídek): „do 30 km od Brna",
 * „pozemek do 25 km od Prahy", „les do 10 km od Jihlavy" i „orná půda
 * 50 km od Brna" → 0 nalezených. Věta se rozpadla: „do" a „od" jsou
 * výplňová slova, číslo bez jednotky se pod deseti tisíci netipuje,
 * „km" nebyla jednotka — a do hledání OBCE pak šlo „30 km brna", což
 * není název žádné obce. Kdo kupuje pozemek, přitom skoro vždycky
 * hledá kolem něčeho: kolem práce, kolem chalupy, kolem města.
 *
 * Dvě části, schválně oddělené:
 *   - JAK DALEKO    → km(a, b), jediný haversine pro mapu i filtr,
 *   - KOLEM ČEHO    → stred(data, text), název v 2. padě na souřadnici.
 *
 * ČESKÝ 2. PÁD SE NEOHÝBÁ PODLE PRAVIDEL, ale podle kmene. „od Brna",
 * „od Prahy", „od Plzně", „od Liberce", „od Českých Budějovic" — koncovka
 * je jiná pokaždé a žádný seznam pravidel to nepokryje (Plzeň→Plzně
 * a Liberec→Liberce navíc vypouští písmeno uvnitř slova). Porovnává se
 * proto SPOLEČNÝ ZAČÁTEK slova, ne koncovka: „plzn" je společné pro
 * „plzne" i „plzen", „liberc" pro „liberce" i „liberec".
 *
 * Souřadnice okresních měst jsou KOPIE data/okresy.json. V prohlížeči
 * nejde o ten soubor sáhnout bez další žádosti na server a mapa už tři
 * má; 2,5 kB tabulky je menší cena než čtvrtý kolotoč na startu. Že se
 * ty dvě kopie nerozešly, hlídá scripts/test-okruh.mjs — stejně jako
 * u js/hlidani-logika.js, kde je ten problém vyřešený takhle taky.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKOkruh = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Stejná normalizace jako v js/hledani.js — bez diakritiky, jen slova.
     Kdyby se ty dvě rozešly, hledání by našlo obec, kterou by okruh
     neuměl najít, a naopak; hlídá to scripts/test-okruh.mjs. */
  function norm(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /* --- JAK DALEKO ---------------------------------------------------
     Jeden haversine pro celou mapu: okolí hlídaného místa, okruh z věty
     i řazení „nejblíž ke mně" ho měly každé svůj, a dva z těch tří se
     lišily i zápisem (asin proti atan2). Stránka pozemku si svůj nechává
     — načítá se na 1 998 stránkách a kvůli jednomu vzorci tam další
     skript nepůjde. */
  function km(a, b) {
    if (!a || !b) return Infinity;
    var la1 = a.lat, ln1 = a.lng, la2 = b.lat, ln2 = b.lng;
    if (typeof la1 !== 'number' || typeof ln1 !== 'number'
      || typeof la2 !== 'number' || typeof ln2 !== 'number') return Infinity;
    if (!isFinite(la1) || !isFinite(ln1) || !isFinite(la2) || !isFinite(ln2)) return Infinity;
    var r = Math.PI / 180, dLat = (la2 - la1) * r, dLng = (ln2 - ln1) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  /* --- KOLEM ČEHO ---------------------------------------------------
     Shoda kmenů. Dvě slova si odpovídají, když mají dost dlouhý společný
     začátek: aspoň tři znaky, aspoň 60 % kratšího z nich a nejvýš dva
     znaky na konci se smí lišit. Měřeno na skutečných tvarech:
       brna/brno 3, prahy/praha 4, plzne/plzen 3, liberce/liberec 5,
       melnika/melnik 6, ceskych/ceske 4, budejovic/budejovice 9.
     Co to naopak NESMÍ spojit: kolin/kladno (1), tabor/trutnov (1). */
  function spolecnyZacatek(a, b) {
    var n = Math.min(a.length, b.length), i = 0;
    while (i < n && a.charAt(i) === b.charAt(i)) i++;
    return i;
  }
  function kmenSedi(a, b) {
    if (!a || !b) return false;
    var p = spolecnyZacatek(a, b), kratsi = Math.min(a.length, b.length);
    if (p < 3) return false;
    if (p < kratsi - 2) return false;
    return p >= Math.ceil(kratsi * 0.6);
  }
  /* Víceslovné názvy („České Budějovice", „Ústí nad Labem") se srovnávají
     slovo po slově od začátku. Kratší dotaz je dovolený — kdo napíše
     „od Ústí", myslí Ústí nad Labem; obráceně to neplatí. */
  function nazevSedi(dotazSlova, nazevSlova) {
    if (!dotazSlova.length || dotazSlova.length > nazevSlova.length) return 0;
    var skore = 0;
    for (var i = 0; i < dotazSlova.length; i++) {
      if (!kmenSedi(dotazSlova[i], nazevSlova[i])) return 0;
      skore += spolecnyZacatek(dotazSlova[i], nazevSlova[i]);
    }
    return skore;
  }

  /* Okresní města — KOPIE data/okresy.json, viz hlavička. */
  var OKRESNI_MESTA = {
    "Praha": [50.083, 14.421],
    "Praha-východ": [50.09, 14.66],
    "Praha-západ": [49.95, 14.3],
    "Benešov": [49.783, 14.686],
    "Beroun": [49.964, 14.072],
    "Kladno": [50.147, 14.103],
    "Kolín": [50.028, 15.2],
    "Kutná Hora": [49.948, 15.268],
    "Mělník": [50.35, 14.474],
    "Mladá Boleslav": [50.411, 14.904],
    "Nymburk": [50.185, 15.041],
    "Příbram": [49.689, 14.01],
    "Rakovník": [50.104, 13.733],
    "České Budějovice": [48.975, 14.48],
    "Český Krumlov": [48.811, 14.315],
    "Jindřichův Hradec": [49.144, 15.003],
    "Písek": [49.309, 14.148],
    "Prachatice": [49.013, 13.997],
    "Strakonice": [49.261, 13.902],
    "Tábor": [49.414, 14.657],
    "Domažlice": [49.44, 12.93],
    "Cheb": [50.079, 12.37],
    "Karlovy Vary": [50.231, 12.871],
    "Klatovy": [49.395, 13.295],
    "Plzeň-město": [49.747, 13.377],
    "Plzeň-jih": [49.6, 13.5],
    "Plzeň-sever": [49.85, 13.3],
    "Rokycany": [49.742, 13.594],
    "Sokolov": [50.181, 12.64],
    "Tachov": [49.795, 12.634],
    "Česká Lípa": [50.685, 14.537],
    "Děčín": [50.774, 14.212],
    "Chomutov": [50.46, 13.417],
    "Jablonec nad Nisou": [50.724, 15.171],
    "Liberec": [50.767, 15.056],
    "Litoměřice": [50.534, 14.132],
    "Louny": [50.354, 13.797],
    "Most": [50.503, 13.636],
    "Semily": [50.601, 15.333],
    "Teplice": [50.64, 13.824],
    "Ústí nad Labem": [50.661, 14.032],
    "Havlíčkův Brod": [49.607, 15.58],
    "Hradec Králové": [50.209, 15.832],
    "Chrudim": [49.951, 15.795],
    "Jičín": [50.436, 15.351],
    "Náchod": [50.416, 16.166],
    "Pardubice": [50.038, 15.779],
    "Rychnov nad Kněžnou": [50.164, 16.276],
    "Svitavy": [49.755, 16.469],
    "Trutnov": [50.561, 15.912],
    "Ústí nad Orlicí": [49.974, 16.394],
    "Jihlava": [49.397, 15.591],
    "Pelhřimov": [49.431, 15.223],
    "Třebíč": [49.215, 15.882],
    "Žďár nad Sázavou": [49.563, 15.94],
    "Blansko": [49.365, 16.644],
    "Brno-město": [49.195, 16.608],
    "Brno-venkov": [49.1, 16.5],
    "Břeclav": [48.759, 16.882],
    "Hodonín": [48.855, 17.132],
    "Vyškov": [49.277, 16.999],
    "Znojmo": [48.855, 16.048],
    "Kroměříž": [49.298, 17.393],
    "Uherské Hradiště": [49.07, 17.459],
    "Vsetín": [49.339, 17.996],
    "Zlín": [49.226, 17.671],
    "Jeseník": [50.229, 17.204],
    "Olomouc": [49.594, 17.251],
    "Prostějov": [49.472, 17.111],
    "Přerov": [49.455, 17.451],
    "Šumperk": [49.965, 16.971],
    "Bruntál": [49.988, 17.464],
    "Frýdek-Místek": [49.683, 18.35],
    "Karviná": [49.854, 18.541],
    "Nový Jičín": [49.594, 18.01],
    "Opava": [49.938, 17.902],
    "Ostrava-město": [49.834, 18.282],
  };

  /* U okresů, které nejsou obec („Brno-město", „Praha-východ",
     „Plzeň-jih"), se v odpovědi říká jen město. Věta „do 30 km od
     Brno-venkov" by byla nesmysl a hlavně by vypadala jako chyba. */
  var PRIVESKY = { mesto: 1, venkov: 1, jih: 1, sever: 1, vychod: 1, zapad: 1 };
  function nazevMesta(okres) {
    var kus = String(okres).split('-');
    if (kus.length === 2 && PRIVESKY[norm(kus[1])]) return kus[0];
    return okres;
  }

  function median(a) {
    var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
  }

  /* Název (klidně v 2. padě) → souřadnice.
     Nejdřív okresní města: kdo píše „kolem čeho" hledá, myslí skoro
     vždycky město, a u 77 okresních měst známe souřadnici přesně. Až
     když se netrefí žádné, zkusí se obce z nabídky — tam je středem
     medián souřadnic jejích pozemků, protože vlastní souřadnici obce
     web nemá a tipovat ji od stolu nebude. */
  function stred(data, text) {
    var slova = norm(text).split(' ').filter(Boolean);
    if (!slova.length) return null;
    var dotaz = slova.join('');
    var nej = null, ok;
    for (ok in OKRESNI_MESTA) {
      var nw = norm(ok).split(' ');
      var skore = nazevSedi(slova, nw);
      if (!skore) continue;
      var rozdil = Math.abs(dotaz.length - nw.join('').length);
      if (!nej || skore > nej.skore || (skore === nej.skore && rozdil < nej.rozdil)) {
        nej = { skore: skore, rozdil: rozdil, okres: ok };
      }
    }
    if (nej) {
      var xy = OKRESNI_MESTA[nej.okres];
      return { lat: xy[0], lng: xy[1], nazev: nazevMesta(nej.okres), zdroj: 'mesto' };
    }
    /* Obce z nabídky. */
    var skupiny = {}, i;
    for (i = 0; i < (data || []).length; i++) {
      var d = data[i];
      if (!d || typeof d.lat !== 'number' || typeof d.lng !== 'number') continue;
      if (!isFinite(d.lat) || !isFinite(d.lng)) continue;
      var nn = norm(d.place);
      if (!nn) continue;
      var g = skupiny[nn] || (skupiny[nn] = { lat: [], lng: [], nazev: d.place, slova: nn.split(' ') });
      g.lat.push(d.lat); g.lng.push(d.lng);
    }
    var nejO = null, k;
    for (k in skupiny) {
      var gg = skupiny[k];
      var sk = nazevSedi(slova, gg.slova);
      if (!sk) continue;
      var r2 = Math.abs(dotaz.length - k.replace(/ /g, '').length);
      if (!nejO || sk > nejO.skore || (sk === nejO.skore && r2 < nejO.rozdil)
        || (sk === nejO.skore && r2 === nejO.rozdil && gg.lat.length > nejO.g.lat.length)) {
        nejO = { skore: sk, rozdil: r2, g: gg };
      }
    }
    if (!nejO) return null;
    return { lat: median(nejO.g.lat), lng: median(nejO.g.lng),
      nazev: nejO.g.nazev, zdroj: 'obec', pocet: nejO.g.lat.length };
  }

  /* --- JAK DALEKO TO JE ODSUD -----------------------------------------
     „Kde to je" nebyla na stránce pozemku odpověď, ale souřadnice a mapa.
     Přitom první otázka u pozemku na vsi je, jak daleko je to do města —
     a ta se z názvu obce („Lovečkovice") nepozná. Změřeno na datech:
     k okresnímu městu je medián 13 km a k nejbližšímu velkému městu
     33 km, takže to u každého pozemku říká něco jiného. Je to vzdušná
     čára, ne silnice; tak se to taky musí napsat.

     PÍŠE SE „KOLÍN 26 KM", NE „26 KM DO KOLÍNA". Druhý pád českých
     jmen míst se neodvodí pravidlem (Kolín→Kolína, Praha→Prahy,
     Plzeň→Plzně, Česká Lípa→České Lípy, Semily→Semil) a tabulka 77
     ručně psaných tvarů by byla 77 příležitostí k chybě, kterou nemá
     co zkontrolovat. První pád je ukazatel u cesty: krátký a vždycky
     správný. */
  var VELKA_MESTA = ['Praha', 'Brno-město', 'Ostrava-město', 'Plzeň-město',
    'Liberec', 'Olomouc', 'České Budějovice', 'Hradec Králové',
    'Ústí nad Labem', 'Pardubice'];

  /* POZOR, TŘI OKRESY ZE ČTYŘ V TABULCE NEJSOU MĚSTO. „Praha-východ",
     „Brno-venkov" nebo „Plzeň-jih" jsou okresy BEZ vlastního města
     a souřadnice v data/okresy.json je u nich jen bod někde v okrese.
     Psát podle ní „Praha 25 km" je rovnou dvakrát špatně: Mukařov je
     od středu Prahy 25 km a vyšlo by 12, Máslovice naopak 15 a vyšlo
     by 25. Vzdálenost k takovému okresu se proto neuvádí vůbec —
     skutečnou Prahu, Brno i Plzeň má v seznamu velkých měst, kde je
     souřadnice středem města. */
  var POUZE_OKRES = { venkov: 1, jih: 1, sever: 1, vychod: 1, zapad: 1 };
  function maMesto(okres) {
    var kus = String(okres || '').split('-');
    return !(kus.length === 2 && POUZE_OKRES[norm(kus[1])]);
  }

  /* NĚKTERÉ SOUŘADNICE NEJSOU SOUŘADNICE POZEMKU. Když zdroj GPS nedodá,
     robot posadí nabídku na okresní město (viz data/okresy.json) — a psát
     u ní „Benešov 0 km" by znamenalo tvrdit, že pozemek leží na náměstí.
     Těch nabídek je 8 z 2 019; u nich se vzdálenosti neuvádějí vůbec,
     protože se neví. */
  function nahradniSouradnice(d) {
    if (!d || !d.okres) return false;
    var t = OKRESNI_MESTA[d.okres];
    if (!t) return false;
    return Math.abs(d.lat - t[0]) < 0.0015 && Math.abs(d.lng - t[1]) < 0.0015;
  }

  function kmDo(d, okres) {
    var t = OKRESNI_MESTA[okres];
    if (!t) return null;
    var k = km({ lat: t[0], lng: t[1] }, d);
    return isFinite(k) ? k : null;
  }
  function nejblizsiVelke(d) {
    var nej = null;
    for (var i = 0; i < VELKA_MESTA.length; i++) {
      var k = kmDo(d, VELKA_MESTA[i]);
      if (k == null) continue;
      if (!nej || k < nej.km) nej = { okres: VELKA_MESTA[i], nazev: nazevMesta(VELKA_MESTA[i]), km: k };
    }
    return nej;
  }
  /* Do deseti kilometrů jedna desetinka: u pozemku čtyři kilometry za
     městem je rozdíl mezi 4 a 4,6 km poznat. Od deseti výš už ne —
     vzdušná čára se od silnice liší o víc, a desetinka by předstírala
     přesnost, kterou tohle číslo nemá. */
  function celeKm(k) {
    if (k < 10) return String(Math.round(k * 10) / 10).replace('.', ',') + '\u00a0km';
    return Math.round(k) + '\u00a0km';
  }

  /* Hotová věta pro stránku pozemku. Skládá se na JEDNOM místě: do
     stránky ji vepisuje generátor (staticky, i pro vyhledávače) a tutéž
     ji pak vypisuje js/pozemek.js. Dvě skládání téhož textu by se
     rozešla — v tomhle projektu už se to stalo u ceny i u klíče. */
  function popisVzdalenosti(d) {
    if (!d || typeof d.lat !== 'number' || typeof d.lng !== 'number') return '';
    if (!isFinite(d.lat) || !isFinite(d.lng)) return '';
    if (nahradniSouradnice(d)) return '';
    var kusy = [], okresMesto = '';
    if (maMesto(d.okres)) {
      var doOkresu = kmDo(d, d.okres);
      if (doOkresu != null) {
        okresMesto = nazevMesta(d.okres);
        kusy.push(okresMesto + ' ' + celeKm(doOkresu));
      }
    }
    var velke = nejblizsiVelke(d);
    /* Nejbližší velké město se neopakuje: u pozemku u Brna by stálo
       „Brno 9 km · Brno 9 km". */
    if (velke && norm(velke.nazev) !== norm(okresMesto)) {
      kusy.push(velke.nazev + ' ' + celeKm(velke.km));
    }
    return kusy.join(' · ');
  }

  /* Co je ještě rozumný okruh, nerozhoduje tenhle modul, ale parser
     (js/dotaz.js): je to otázka o VĚTĚ, ne o mapě — „do 5000 km od Brna"
     není okruh, je to omyl v jednotce. Mez je proto jen na jednom místě,
     tam, kde se věta čte.

     Tady zůstává jen geometrie a hledání místa. */

  /* --- JE BOD UVNITŘ NAKRESLENÉHO TVARU? ------------------------------
     Pro výběr nakreslený prstem na mapě (js/main.js). Paprskový test:
     kolikrát polopřímka z bodu protne obvod — lichý počet znamená uvnitř.

     POČÍTÁ SE VE STUPNÍCH, NE V KILOMETRECH, a je to tak správně: tvar
     i body jsou ve stejné soustavě, takže zkreslení poledníků se vykrátí.
     Přepočet na kilometry (jako u km() výš) by tu nic nepřidal a jen by
     zdržoval — tohle se volá na dvou tisících nabídek při každém překreslení.

     TÝŽ ALGORITMUS JE I v js/kontrola.js (vPrstenci), kde slouží k určení
     okresu podle souřadnic. Nejsou sloučené schválně: kontrola.js se
     načítá i tam, kde okruh.js není (a v Node ho berou zkoušky samostatně),
     takže by sloučení znamenalo nový vztah mezi moduly kvůli šesti řádkům.
     Že se ty dvě kopie nerozešly, hlídá scripts/test-okruh.mjs — stejně
     jako u shody hledání a okruhu výš. */
  function vTvaru(lat, lng, body) {
    if (!body || body.length < 3) return false;
    if (!isFinite(lat) || !isFinite(lng)) return false;
    var uvnitr = false;
    for (var i = 0, j = body.length - 1; i < body.length; j = i++) {
      var yi = body[i][0], xi = body[i][1];
      var yj = body[j][0], xj = body[j][1];
      if (((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) uvnitr = !uvnitr;
    }
    return uvnitr;
  }

  return { km: km, stred: stred, norm: norm, kmenSedi: kmenSedi, nazevSedi: nazevSedi,
    nazevMesta: nazevMesta, median: median, OKRESNI_MESTA: OKRESNI_MESTA,
    VELKA_MESTA: VELKA_MESTA, maMesto: maMesto, nahradniSouradnice: nahradniSouradnice,
    kmDo: kmDo, nejblizsiVelke: nejblizsiVelke, celeKm: celeKm,
    popisVzdalenosti: popisVzdalenosti, vTvaru: vTvaru };
}));
