/* Podklad pro kupní smlouvu na pozemek a pro návrh na vklad do katastru.
 *
 * ČÍM TOHLE JE A ČÍM NENÍ. Není to „smlouva ke stažení". Vlastní rádce
 * na tomhle webu (kolik-stoji-koupe-pozemku.html) říká černé na bílém:
 * bezpečnější je nechat smlouvu připravit advokátem, ne stáhnout vzor
 * z internetu. Kdyby web vedle té věty začal generátor smluv vydávat
 * za hotovou smlouvu, popíral by sám sebe.
 *
 * Co tedy dělá: sestaví PODKLAD. Tedy (a) text, ve kterém jsou všechny
 * údaje na svém místě a nic nechybí, aby se s ním dalo jít k advokátovi
 * a neplatit mu za vyplňování kolonek; (b) hodnoty, které se opisují do
 * úředního formuláře návrhu na vklad; (c) seznam toho, co si má člověk
 * před podpisem ověřit. Rozhodnutí, že to nepředstírá hotový právní
 * dokument, je v tom nejdůležitější věc.
 *
 * NÁVRH NA VKLAD SE NEGENERUJE JAKO LISTINA. Podává se na formuláři,
 * který vydává ČÚZK, a jiné podání katastrální úřad odmítne. Vyrobit
 * vlastní „návrh na vklad" by tedy znamenalo vyrobit papír, který
 * k ničemu není. Místo toho se vypíšou hodnoty do kolonek.
 *
 * VŠECHNO SE DĚJE V PROHLÍŽEČI. Jména, rodná data ani adresy neodchází
 * nikam — tenhle soubor neumí síť a stránka kolem něj taky ne.
 *
 * Co se tady NETVRDÍ: výše správního poplatku ani sazby. Web o nich
 * mluví jen řádově a na jednom místě (rádce), tak to zůstává.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKSmlouva = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---- Čísla ------------------------------------------------------- */

  /* Lidé píšou „450 000", „450000", „450.000" i „450 000,-". Bere se
     všechno, co po odstranění oddělovačů dá číslo. */
  function cislo(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (x == null) return null;
    var s = String(x).replace(/ /g, ' ').replace(/[\s.]/g, '').replace(/,-$/, '').replace(/,/, '.');
    if (!/^-?[0-9]+(\.[0-9]+)?$/.test(s)) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function mezery(n) {
    var s = String(Math.abs(Math.round(n)));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (i && (s.length - i) % 3 === 0) out += ' ';
      out += s.charAt(i);
    }
    return (n < 0 ? '−' : '') + out;
  }

  /* ---- Částka slovy ------------------------------------------------ */
  /* PROČ VŮBEC. Ve smlouvě se cena píše číslem i slovy. Není to ozdoba:
     je to pojistka proti překlepu v číslici, a právě o tu číslici se
     tady hraje. Když si to má člověk dopisovat ručně, udělá chybu
     zrovna v tom jediném údaji, který nesmí být špatně.

     TVAROSLOVÍ. Čeština mění tvar podstatného jména podle číslovky a
     od dvaceti jedné výš se používá druhý pád množného čísla: „dvacet
     jedna korun českých", ne „dvacet jedna koruna česká". Pravidlo je
     tedy jen trojité: 1 → jeden tvar, 2–4 → druhý, všechno ostatní →
     třetí. Žádné výjimky na 11–14 se neřeší, protože ty do „ostatní"
     padnou samy. */
  /* Tři sady jednotek, a ten rozdíl je přesně to, co jsem si napsal
     špatně a odhalil až výpisem: rod se uplatní JEN u číslovky stojící
     samostatně („dvě koruny české", „dva tisíce"). Jakmile je jednotka
     součástí složené číslovky, tvar se nemění a je jeden pro všechno:
     „dvacet dva korun českých", „sto dva milionů". Napoprvé mi z toho
     vycházelo „dvacet dvě korun českých" — ženská číslovka slepená s
     druhým pádem množného čísla, což nedává smysl ani v jednom z obou
     dovolených způsobů. */
  var JEDN = ['', 'jeden', 'dva', 'tři', 'čtyři', 'pět', 'šest', 'sedm', 'osm', 'devět'];
  var JEDN_Z = ['', 'jedna', 'dvě', 'tři', 'čtyři', 'pět', 'šest', 'sedm', 'osm', 'devět'];
  var JEDN_SLOZ = ['', 'jedna', 'dva', 'tři', 'čtyři', 'pět', 'šest', 'sedm', 'osm', 'devět'];
  var TEEN = ['deset', 'jedenáct', 'dvanáct', 'třináct', 'čtrnáct', 'patnáct',
              'šestnáct', 'sedmnáct', 'osmnáct', 'devatenáct'];
  var DES = ['', '', 'dvacet', 'třicet', 'čtyřicet', 'padesát', 'šedesát',
             'sedmdesát', 'osmdesát', 'devadesát'];
  var STO = ['', 'sto', 'dvě stě', 'tři sta', 'čtyři sta', 'pět set',
             'šest set', 'sedm set', 'osm set', 'devět set'];

  /* Jedna trojice číslic slovy. `rod` platí jen pro samostatné 1 a 2 —
     uvnitř složených číslovek se bere tvar „dvacet jedna", „dvacet dva",
     který se nemění. */
  function trojice(n, rod) {
    if (n <= 0) return '';
    var d = [];
    var s = Math.floor(n / 100), z = n % 100;
    if (s) d.push(STO[s]);
    if (z >= 20) {
      var j = z % 10;
      d.push(DES[Math.floor(z / 10)]);
      if (j) d.push(JEDN_SLOZ[j]);        // „dvacet jedna", „dvacet dva"
    } else if (z >= 10) {
      d.push(TEEN[z - 10]);
    } else if (z > 0) {
      /* Rod se uplatní jen u číslovky, která stojí sama. Za stovkou už
         je součástí složené číslovky: „sto dva korun českých". */
      d.push(s ? JEDN_SLOZ[z] : (rod === 'z' ? JEDN_Z : JEDN)[z]);
    }
    return d.join(' ');
  }

  /* Tvar podstatného jména: [1, 2–4, ostatní] */
  var TVARY = {
    koruna: ['koruna česká', 'koruny české', 'korun českých'],
    tisic: ['tisíc', 'tisíce', 'tisíc'],
    milion: ['milion', 'miliony', 'milionů'],
    miliarda: ['miliarda', 'miliardy', 'miliard'],
  };
  function tvar(jmeno, n) {
    var t = TVARY[jmeno];
    return n === 1 ? t[0] : (n >= 2 && n <= 4 ? t[1] : t[2]);
  }

  var SKUPINY = [
    { del: 1000000000, jmeno: 'miliarda', rod: 'z' },
    { del: 1000000, jmeno: 'milion', rod: 'm' },
    { del: 1000, jmeno: 'tisic', rod: 'm' },
  ];

  function slovy(x) {
    var n = cislo(x);
    if (n == null || n < 0 || n !== Math.round(n)) return null;
    if (n === 0) return 'nula ' + TVARY.koruna[2];
    if (n >= 1000000000000) return null;        // tolik za pozemek nikdo nedá
    var d = [], zbytek = n;
    for (var i = 0; i < SKUPINY.length; i++) {
      var g = SKUPINY[i], kolik = Math.floor(zbytek / g.del);
      if (!kolik) continue;
      zbytek -= kolik * g.del;
      /* „jeden tisíc" se běžně zkracuje na „tisíc" — ale jen u tisíce
         („milion" se nezkracuje) a jen když tisíc celou částku vede.
         Uvnitř delšího čísla by se zkratkou ztratil: „jeden milion
         tisíc korun" se čte jako chyba, „jeden milion jeden tisíc" ne. */
      var slovem = trojice(kolik, g.rod);
      if (kolik === 1 && g.jmeno === 'tisic' && !d.length) slovem = '';
      d.push((slovem ? slovem + ' ' : '') + tvar(g.jmeno, kolik));
    }
    if (zbytek) d.push(trojice(zbytek, 'z') + ' ' + tvar('koruna', zbytek));
    else d.push(TVARY.koruna[2]);
    return d.join(' ').replace(/ /g, ' ');
  }

  function castka(x) {
    var n = cislo(x);
    return n == null ? null : mezery(n) + ' Kč';
  }

  /* ---- Označení pozemku ------------------------------------------- */
  /* TOHLE JE TA JEDINÁ VĚTA, KTEROU NELZE ODBÝT. Nemovitost musí být ve
     smlouvě označená tak, aby nemohlo být pochyb, o kterou jde: parcelní
     číslo SAMO O SOBĚ NESTAČÍ, protože se v každém katastrálním území
     opakuje. Bez katastrálního území by smlouva mohla znamenat kterýkoli
     z desítek pozemků se stejným číslem po celé republice — a právě
     tohle je chyba, kterou laický vzor dělá nejčastěji. Proto se na
     katastrální území kontroluje a bez něj se podklad nesestaví. */
  function oznaceniPozemku(p) {
    if (!p) return null;
    var parc = String(p.parcela == null ? '' : p.parcela).trim();
    var ku = String(p.katastr == null ? '' : p.katastr).trim();
    if (!parc || !ku) return null;
    var d = ['pozemek parc. č. ' + parc];
    if (p.druh) d.push('(' + String(p.druh).trim() + ')');
    var v = cislo(p.vymera);
    if (v) d.push('o výměře ' + mezery(v) + ' m²');
    d.push('v katastrálním území ' + ku);
    if (p.kodKatastru) d[d.length - 1] += ' (kód ' + String(p.kodKatastru).trim() + ')';
    if (p.obec) d.push('obec ' + String(p.obec).trim());
    if (p.lv) d.push('zapsaný na listu vlastnictví č. ' + String(p.lv).trim());
    return d.join(', ');
  }

  /* ---- Kontrola vstupu -------------------------------------------- */
  /* Vrací seznam toho, co chybí nebo nedává smysl. Prázdný seznam = dá
     se sestavit. Není to otravování: každý řádek je něco, bez čeho by
     podklad byl k ničemu, nebo rovnou zavádějící. */
  function osobaChybi(o, kdo, i, celkem) {
    var jm = celkem > 1 ? kdo + ' č. ' + (i + 1) : kdo;
    var v = [];
    if (!o || !String(o.jmeno || '').trim()) v.push({ pole: 'jmeno', zprava: jm + ': chybí jméno a příjmení.' });
    if (!o || !String(o.narozeni || '').trim()) v.push({ pole: 'narozeni', zprava: jm + ': chybí datum narození. Katastr potřebuje stranu rozpoznat; jen jméno nestačí, stejných jmen je v republice mnoho.' });
    if (!o || !String(o.adresa || '').trim()) v.push({ pole: 'adresa', zprava: jm + ': chybí adresa.' });
    return v;
  }

  function zkontroluj(d) {
    var v = [];
    var dd = d || {};
    var pr = dd.prodavajici || [], ku = dd.kupujici || [];
    if (!pr.length) v.push({ pole: 'prodavajici', zprava: 'Není uvedený ani jeden prodávající.' });
    if (!ku.length) v.push({ pole: 'kupujici', zprava: 'Není uvedený ani jeden kupující.' });
    pr.forEach(function (o, i) { v = v.concat(osobaChybi(o, 'Prodávající', i, pr.length)); });
    ku.forEach(function (o, i) { v = v.concat(osobaChybi(o, 'Kupující', i, ku.length)); });

    var p = dd.pozemek || {};
    if (!String(p.parcela || '').trim()) v.push({ pole: 'parcela', zprava: 'Chybí parcelní číslo.' });
    if (!String(p.katastr || '').trim()) {
      v.push({ pole: 'katastr', zprava: 'Chybí katastrální území. Bez něj není pozemek určený — parcelní číslo se v každém katastrálním území opakuje, takže by smlouva mohla znamenat kterýkoli z desítek pozemků se stejným číslem.' });
    }
    if (!String(p.lv || '').trim()) v.push({ pole: 'lv', zprava: 'Chybí číslo listu vlastnictví. Není nutné pro platnost, ale bez něj se podklad hůř ověřuje — najdete ho na nahlizenidokn.cuzk.cz.' });

    var c = cislo((dd.cena || {}).castka);
    if (c == null) v.push({ pole: 'cena', zprava: 'Chybí kupní cena.' });
    else if (c <= 0) v.push({ pole: 'cena', zprava: 'Kupní cena musí být víc než nula. Bezúplatný převod není kupní smlouva, ale darování — a to je jiná smlouva.' });

    var z = cislo((dd.cena || {}).zaloha);
    if (z != null && c != null && z > c) {
      v.push({ pole: 'zaloha', zprava: 'Záloha je vyšší než celá kupní cena (' + castka(z) + ' z ' + castka(c) + ').' });
    }
    var podil = String(p.podil || '').trim();
    if (podil && !/^[0-9]+\s*\/\s*[0-9]+$/.test(podil)) {
      v.push({ pole: 'podil', zprava: 'Podíl se píše zlomkem, například 1/2. Zapsáno je „' + podil + '".' });
    }
    return v;
  }

  /* ---- Text podkladu ---------------------------------------------- */

  function osoba(o) {
    var d = [String(o.jmeno || '').trim()];
    if (o.narozeni) d.push('nar. ' + String(o.narozeni).trim());
    if (o.adresa) d.push('bytem ' + String(o.adresa).trim());
    return d.join(', ');
  }

  function strany(list, jedn, mn) {
    return list.length > 1
      ? mn + ':\n' + list.map(function (o, i) { return '  ' + (i + 1) + ') ' + osoba(o); }).join('\n')
      : jedn + ': ' + osoba(list[0]);
  }

  var ZPUSOBY = {
    uschova: 'Kupní cena bude složena do advokátní nebo notářské úschovy a prodávajícímu vyplacena až po zápisu vlastnického práva kupujícího do katastru nemovitostí.',
    prevod: 'Kupní cena bude uhrazena bezhotovostním převodem na bankovní účet prodávajícího.',
    hotovost: 'Kupní cena bude uhrazena v hotovosti při podpisu této smlouvy.',
  };

  function smlouva(d) {
    var dd = d || {};
    var chyby = zkontroluj(dd);
    /* Chybí-li něco podstatného, nevrací se text s prázdnými místy —
       takový papír je horší než žádný, protože vypadá hotově.

       ČTE SE PAK I TAK OPATRNĚ. Tenhle výjezd je jediná branka, ale
       funkce se volá při každém stisku klávesy ve formuláři, takže na
       rozbitém vstupu nesmí umřít — spadlý skript by vzal celou
       stránku. Přistiženo sabotáží: bez téhle branky zkouška nepadla
       pojmenovanou chybou, ale výjimkou, a to je horší zpráva. */
    var podstatne = chyby.filter(function (x) { return x.pole !== 'lv' && x.pole !== 'podil'; });
    if (podstatne.length) return null;

    var pr = dd.prodavajici || [], ku = dd.kupujici || [];
    if (!pr.length || !ku.length) return null;
    var p = dd.pozemek || {}, c = dd.cena || {};
    var oz = oznaceniPozemku(p);
    var podil = String(p.podil || '').trim();
    var predmet = podil ? 'podíl o velikosti ' + podil + ' na nemovitosti: ' + oz : oz;
    var cena = cislo(c.castka);

    var t = [];
    t.push('PODKLAD PRO KUPNÍ SMLOUVU O PŘEVODU POZEMKU');
    t.push('');
    t.push('Tento text není hotová smlouva. Je to podklad, ve kterém jsou');
    t.push('všechny údaje na svém místě — projděte ho s advokátem nebo');
    t.push('notářem a nechte si ho upravit na svůj případ.');
    t.push('');
    t.push('I. Smluvní strany');
    t.push(strany(pr, 'Prodávající', 'Prodávající'));
    t.push('');
    t.push(strany(ku, 'Kupující', 'Kupující'));
    t.push('');
    t.push('II. Předmět smlouvy');
    t.push('Prodávající je vlastníkem nemovitosti: ' + oz + '.');
    t.push('Prodávající převádí ' + predmet + ' na kupujícího a kupující');
    t.push('tuto nemovitost do svého vlastnictví přijímá.');
    t.push('');
    t.push('III. Kupní cena');
    t.push('Kupní cena činí ' + castka(cena) + ' (slovy: ' + slovy(cena) + ').');
    var zal = cislo(c.zaloha);
    if (zal) t.push('Z toho záloha ' + castka(zal) + ' (slovy: ' + slovy(zal) + ').');
    t.push(ZPUSOBY[c.zpusob] || ZPUSOBY.uschova);
    t.push('');
    t.push('IV. Prohlášení prodávajícího');
    var st = dd.stav || {};
    var vady = [];
    if (st.zastava) vady.push('zástavní právo');
    if (st.bremeno) vady.push('věcné břemeno (služebnost)');
    if (st.najem) vady.push('nájem nebo pacht');
    if (vady.length) {
      t.push('Na nemovitosti je: ' + vady.join(', ') + '.');
      if (String(st.popisVad || '').trim()) t.push('Blíže: ' + String(st.popisVad).trim());
      t.push('Strany si ujednají, jak se s tím naloží — tohle je bod, kde');
      t.push('se podklad bez právníka dál nedostane.');
    } else {
      t.push('Prodávající prohlašuje, že na nemovitosti nejsou zástavní');
      t.push('práva, věcná břemena, nájem ani jiné právní vady, a že mu');
      t.push('nejsou známy vady, které by kupujícímu zatajil.');
      t.push('Ověřte si to sami na listu vlastnictví — prohlášení ve');
      t.push('smlouvě není totéž co zápis v katastru.');
    }
    t.push('');
    t.push('V. Předání pozemku a náklady');
    /* DVĚ VĚCI, O KTERÉ SE NEJČASTĚJI VEDE SPOR, A V KOSTŘE CHYBĚLY.
       Kdo zaplatí správní poplatek za návrh na vklad, zákon
       nepředepisuje — je to ujednání stran, takže to do smlouvy patří,
       jinak se na to přijde až na úřadě. A kdy se pozemek předává:
       bez data se předává „někdy", a prodávající na něm zatím seče,
       pase nebo ho má pronajatý.
       Konkrétní částka tu NESTOJÍ. Výši poplatku web uvádí jen řádově
       a na jednom jediném místě (rádce o nákladech); opisovat ji sem
       by znamenalo mít ji dvakrát a jednou špatně. */
    var kdo = { kupujici: 'kupující', prodavajici: 'prodávající', napul: 'strany společně, každá jednou polovinou' };
    t.push('Správní poplatek za návrh na vklad hradí '
      + (kdo[(d.vklad || {}).plati] || kdo.kupujici) + '.');
    /* Po předložce „do" je druhý pád, a ten má u dne jen dva tvary:
       „do 1 dne" a „do N dnů". Žádná trojice jako u jmenovaného pádu. */
    var dni = cislo((d.vklad || {}).predaniDni);
    t.push(dni != null && dni >= 1
      ? 'Pozemek bude předán do ' + mezery(dni) + (dni === 1 ? ' dne' : ' dnů')
        + ' od zápisu vlastnického práva do katastru nemovitostí.'
      : 'Den předání pozemku strany doplní — bez něj se pozemek předává „někdy".');
    t.push('Daň z nemovitých věcí za rok, ve kterém dojde ke změně');
    t.push('vlastníka, a přiznání k ní strany vyřeší podle zákona;');
    t.push('přiznání podává nový vlastník do konce ledna roku');
    t.push('následujícího po nabytí.');
    t.push('');
    t.push('VI. Vklad do katastru nemovitostí');
    t.push('Vlastnické právo přechází na kupujícího zápisem (vkladem) do');
    t.push('katastru nemovitostí. Do té doby kupující vlastníkem není, i');
    t.push('kdyby byla smlouva podepsaná a cena zaplacená.');
    t.push('Návrh na vklad se podává na formuláři, který vydává ČÚZK.');
    t.push('');
    t.push('VII. Závěrečná ustanovení');
    t.push('Smlouva se vyhotovuje v počtu potřebném pro strany a pro');
    t.push('katastrální úřad. Podpisy stran na vyhotovení určeném pro');
    t.push('katastrální úřad musí být úředně ověřené.');
    t.push('');
    t.push('V ................................ dne ........................');
    t.push('');
    pr.forEach(function (o) { t.push('....................................   ' + String(o.jmeno).trim()); });
    ku.forEach(function (o) { t.push('....................................   ' + String(o.jmeno).trim()); });
    return t.join('\n');
  }

  /* ---- Hodnoty do formuláře návrhu na vklad ----------------------- */
  function navrhNaVklad(d) {
    if (!d) return null;
    var p = d.pozemek || {};
    var oz = oznaceniPozemku(p);
    if (!oz) return null;
    var r = [];
    r.push({ kolonka: 'Katastrální úřad pro', hodnota: p.urad ? String(p.urad).trim() : '— doplňte podle polohy pozemku' });
    r.push({ kolonka: 'Katastrální pracoviště', hodnota: p.pracoviste ? String(p.pracoviste).trim() : '— doplňte podle polohy pozemku' });
    r.push({ kolonka: 'Obec', hodnota: p.obec ? String(p.obec).trim() : '—' });
    r.push({ kolonka: 'Katastrální území', hodnota: String(p.katastr).trim() + (p.kodKatastru ? ' (kód ' + String(p.kodKatastru).trim() + ')' : '') });
    r.push({ kolonka: 'Parcela', hodnota: 'parc. č. ' + String(p.parcela).trim() + (cislo(p.vymera) ? ', výměra ' + mezery(cislo(p.vymera)) + ' m²' : '') });
    if (p.lv) r.push({ kolonka: 'List vlastnictví', hodnota: 'č. ' + String(p.lv).trim() });
    if (String(p.podil || '').trim()) r.push({ kolonka: 'Převáděný podíl', hodnota: String(p.podil).trim() });
    (d.prodavajici || []).forEach(function (o, i) {
      r.push({ kolonka: 'Účastník — převodce' + ((d.prodavajici.length > 1) ? ' ' + (i + 1) : ''), hodnota: osoba(o) });
    });
    (d.kupujici || []).forEach(function (o, i) {
      r.push({ kolonka: 'Účastník — nabyvatel' + ((d.kupujici.length > 1) ? ' ' + (i + 1) : ''), hodnota: osoba(o) });
    });
    r.push({ kolonka: 'Navrhovaný zápis', hodnota: 'vklad vlastnického práva ve prospěch nabyvatele' });
    r.push({ kolonka: 'Přílohy', hodnota: 'kupní smlouva s úředně ověřenými podpisy' });
    return r;
  }

  /* ---- Co si ověřit před podpisem --------------------------------- */
  /* Pořadí není libovolné: nahoře stojí to, co se dá ještě zvrátit, a
     co se nejvíc proplácí. List vlastnictví je první, protože se z něj
     poznají zástavy, břemena i to, že prodávající vůbec není vlastník. */
  function kontrolniSeznam(d) {
    var dd = d || {}, p = dd.pozemek || {}, st = dd.stav || {};
    var s = [];
    s.push({ co: 'List vlastnictví v katastru', proc: 'Je prodávající opravdu vlastník? Nejsou na pozemku zástavy, břemena nebo exekuce? Nahlížení do katastru je zdarma.', kde: 'nahlizenidokn.cuzk.cz' });
    if (String(p.podil || '').trim()) {
      s.push({ co: 'Předkupní právo ostatních spoluvlastníků', proc: 'Kupujete podíl, ne celý pozemek. U spoluvlastnictví je to první věc, na kterou se naráží.' });
    }
    s.push({ co: 'Územní plán obce', proc: 'Co se na pozemku smí stavět, neurčuje inzerát ani jeho popis, ale územní plán obce.' });
    s.push({ co: 'Přístupová cesta', proc: 'Vede k pozemku veřejná cesta, nebo se jezdí přes cizí parcelu? Bez přístupu se nestaví a pozemek se těžko prodává dál.', kde: 'pristupova-cesta-pozemek.html' });
    s.push({ co: 'Třída ochrany zemědělské půdy', proc: 'U I. a II. třídy stát vynětí ze zemědělského půdního fondu povoluje jen výjimečně — na takovém poli se nestaví, i kdyby to územní plán dovoloval. Na stránce pozemku si zapněte vrstvu BPEJ.' });
    s.push({ co: 'Sítě na hranici pozemku', proc: 'Voda, elektřina, kanalizace. Přivedení zdaleka může být dražší než samotný pozemek.' });
    if (!st.zastava && !st.bremeno && !st.najem) {
      s.push({ co: 'Prohlášení o vadách proti skutečnosti', proc: 'V podkladu je prohlášení, že na pozemku nic není. Srovnejte ho s listem vlastnictví — prohlášení ve smlouvě není totéž co zápis v katastru.' });
    }
    s.push({ co: 'Úschova peněz', proc: 'Prodávající dostane cenu až po zápisu do katastru. Bez úschovy nese jedna ze stran celé riziko.' });
    s.push({ co: 'Úředně ověřené podpisy', proc: 'Bez nich katastrální úřad vklad nepovolí. Ověří je notář nebo Czech POINT.' });
    s.push({ co: 'Náklady kolem koupě', proc: 'Správní poplatek za vklad, advokát, úschova, případně geometrický plán.', kde: 'kolik-stoji-koupe-pozemku.html' });
    return s;
  }

  return {
    cislo: cislo, mezery: mezery, castka: castka, slovy: slovy, trojice: trojice, tvar: tvar,
    oznaceniPozemku: oznaceniPozemku, zkontroluj: zkontroluj,
    smlouva: smlouva, navrhNaVklad: navrhNaVklad, kontrolniSeznam: kontrolniSeznam,
  };
}));
