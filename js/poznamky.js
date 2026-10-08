/* Soukromá poznámka k pozemku.
 *
 * PROČ. Kdo si vybírá pozemek, obchází jich deset a po týdnu si
 * nepamatuje, který měl rozbitý plot a u kterého volal majitel zpátky.
 * Web zatím uměl pozemek jen uložit — tedy ANO/NE, bez jediného slova
 * proč. Poznámka je to, co si člověk stejně píše do mobilu, jen u toho
 * pozemku, ke kterému patří.
 *
 * DŘÍV ZŮSTÁVALA JEN V PROHLÍŽEČI. Bylo to tak schválně: nepotřebovala
 * účet a nikdo jiný ji neviděl, ani my. Cenou bylo, že se nepřenesla do
 * druhého telefonu a že o ní člověk nevěděl, dokud neotevřel přesně ten
 * pozemek. Z používání přišlo, že ta cena je vysoká — poznámka má být
 * svázaná s účtem a vidět i mimo inzerát.
 *
 * TEĎ TEDY: kdo je přihlášený, má poznámky na účtu (supabase/poznamky.sql,
 * řádek vidí jen jeho autor). Kdo přihlášený není, má je dál jen
 * v prohlížeči a nic se nikam neposílá.
 *
 * A ŘÍKÁ SE TO NAHLAS. Do poznámek se píšou věty o cizích lidech
 * („majitel vypadal divně"). Dokud ležely v prohlížeči, nikdo jiný se
 * k nim dostat nemohl; teď leží u nás, a web to u políčka musí napsat —
 * ne drobným písmem, ale místo původního slibu, že se nikam neodesílají.
 *
 * PROHLÍŽEČ ZŮSTÁVÁ MEZIPAMĚTÍ. Čtení je pořád okamžité a bez sítě:
 * zbytek webu se ptá PKPoznamky.text() uprostřed vykreslování karty
 * a čekat na server tam nejde. Server se dohání na pozadí.
 *
 * MEZE. 300 poznámek a 2 000 znaků na jednu. localStorage má kolem
 * 5 MB na celý web a sdílí se se vším ostatním, co si web pamatuje;
 * bez mezí by jedna vložená kniha vyhodila oblíbené i hlídání.
 */
(function (root) {
  'use strict';
  var KLIC = 'pk_poznamky_v1';
  var STROP = 300;
  var ZNAKU = 2000;

  /* ROZPARSOVANÉ POZNÁMKY SE DRŽÍ. text() se volá u KAŽDÉ karty ve
     výpisu. Naměřeno v Chromiu na plné schránce (300 poznámek po 2 000
     znacích = 600 kB): šedesát karet stálo 36,5 ms, a to celé jen
     opakovaným parsováním pořád stejného JSONu.

     Mezipaměť se neruší oznámením, ale SROVNÁNÍM TOHO SUROVÉHO TEXTU.
     Samotné getItem bez parsování stojí 0,015 ms na šedesát karet, takže
     se schránka může číst při každém volání — a parsuje se jen tehdy, když
     se text od posledně změnil. Je to o 2400× méně práce, a hlavně to
     platí bez ohledu na to, KDO psal: událost `storage` se v té kartě,
     která zapsala, vůbec nespustí, takže mezipaměť rušená oznámením by
     zvětrala u každého zápisu mimo tenhle soubor. */
  var mezi = null;
  var meziText = null;
  function cti() {
    var surovy;
    try { surovy = localStorage.getItem(KLIC) || '{}'; }
    catch (e) { return mezi || {}; }
    if (mezi && surovy === meziText) return mezi;
    try {
      var z = JSON.parse(surovy);
      mezi = (z && typeof z === 'object' && !Array.isArray(z)) ? z : {};
    } catch (e) { mezi = {}; }
    meziText = surovy;
    return mezi;
  }
  /* KLÍČ SE BERE Z js/klic.js, a je to klicPozemku (pkey + výměra),
     ne hrubý pkey. Pod hrubým klíčem sedí v Jirnech pět různých pozemků
     a poznámky jednoho se objevily u všech pěti.
     ČTE SE I STARÝ TVAR: co si člověk zapsal dřív, je uložené pod pkey
     a nesmí zmizet. Zapisuje se nový. */
  function klicPozemku(d) {
    if (!d) return '';
    if (root.PKKlic && root.PKKlic.klicPozemku) { try { return root.PKKlic.klicPozemku(d); } catch (e) {} }
    return '';
  }
  /* Pod kterým klíčem to v té schránce doopravdy je — nový, nebo starý. */
  function klicVeSchrance(m, d) {
    if (!d) return '';
    if (root.PKKlic && root.PKKlic.klicVe) {
      try { var k = root.PKKlic.klicVe(m, d); if (k) return k; } catch (e) {}
    }
    return klicPozemku(d);
  }
  /* Když je plno, vyhodí se NEJSTARŠÍ podle času úpravy. Pořadí klíčů
     v JSON není nic, na co by se dalo spolehnout. */
  function uklid(m) {
    var k = Object.keys(m);
    if (k.length <= STROP) return m;
    k.sort(function (a, b) { return (m[b].kdy || 0) - (m[a].kdy || 0); });
    var out = {};
    k.slice(0, STROP).forEach(function (x) { out[x] = m[x]; });
    return out;
  }

  /** Text poznámky k pozemku ('' = žádná). */
  function text(d) {
    var m = cti();
    var k = klicVeSchrance(m, d);
    if (!k) return '';
    var z = m[k];
    return (z && typeof z.text === 'string') ? z.text : '';
  }
  /** Uloží (prázdný text poznámku smaže). Vrací true, když se to povedlo. */
  function uloz(d, novy) {
    var k = klicPozemku(d);
    if (!k) return false;
    var m = cti();
    var t = String(novy == null ? '' : novy).slice(0, ZNAKU);
    /* Kdyby tu poznámka ležela pod STARÝM klíčem, zůstala by vedle nové
       a text by se po uložení nezměnil — čte se totiž ta, která se najde
       první. Starý zápis se proto vždycky zahodí. */
    var stary = klicVeSchrance(m, d);
    if (stary && stary !== k) delete m[stary];
    if (!t.trim()) delete m[k];
    /* `nahrano` se zápisem SHAZUJE: tenhle text na účtu ještě není.
       Nastaví se až tím, co se z účtu doopravdy vrátí (viz sync). */
    else m[k] = { text: t, kdy: Date.now() };
    /* `m` je ten objekt z mezipaměti a právě se do něj psalo — kdyby
       setItem spadl na plné schránce, držela by mezipaměť poznámku,
       která ve schránce není. Srovnání surového textu to pozná samo
       (uložený text se nezměnil, kdežto `meziText` ano), ale spoléhat
       se na to by bylo zbytečně křehké. */
    meziText = null;
    try {
      localStorage.setItem(KLIC, JSON.stringify(uklid(m)));
      /* Na účet až potom, a bez čekání: psaní se nesmí zadrhnout
         o síť. Když to neprojde, zůstává poznámka v prohlížeči
         a příští sync() ji dožene. */
      posli(k, t);
      return true;
    } catch (e) {
      /* Plná schránka. Tiché selhání by bylo nejhorší — člověk by psal
         do pole, které si nic nepamatuje. Volající to pozná podle
         false a řekne to. */
      return false;
    }
  }
  /* KOPIE, ne vnitřní objekt: dokud se parsovalo při každém volání,
     nemohl volající ničemu uškodit. S mezipamětí by jeho úprava
     přepsala to, co vidí celý zbytek webu. */
  function vsechny() {
    var m = cti(), out = {};
    Object.keys(m).forEach(function (k) {
      out[k] = { text: m[k] && m[k].text, kdy: m[k] && m[k].kdy };
    });
    return out;
  }
  function kolik() { return Object.keys(cti()).length; }

  /* ===== ÚČET ========================================================
     Zápis jde vždycky nejdřív do prohlížeče (ať je psaní okamžité a ať
     se nic neztratí, když zrovna není signál) a teprve pak na server.
     Opačné pořadí by znamenalo, že poznámka napsaná v lese zmizí. */
  function prihlasen() {
    try { return !!(root.PKAuth && root.PKAuth.ready && root.PKAuth.loggedIn()); }
    catch (e) { return false; }
  }
  function posli(klic, t) {
    if (!prihlasen()) return Promise.resolve(false);
    return root.PKAuth.rpc('poznamka_uloz', { p_klic: klic, p_text: t })
      .then(function (r) {
        var ok = !!(r && r.ok);
        /* AŽ TEĎ je pravda, že účet tu poznámku zná — a jen o tom se
           smí opřít pozdější úsudek „chybí na účtu, tedy ji někdo
           smazal". Značka se dává jen tomu textu, který se opravdu
           odeslal: když člověk mezitím napsal další větu, patří
           potvrzení té předchozí, ne té rozepsané. */
        if (ok && t) oznacNahrano(klic, t);
        return ok;
      })
      .catch(function () { return false; });
  }
  function oznacNahrano(klic, t) {
    var m = cti();
    if (!m[klic] || m[klic].text !== t || m[klic].nahrano) return;
    m[klic].nahrano = true;
    meziText = null;
    try { localStorage.setItem(KLIC, JSON.stringify(m)); } catch (e) {}
  }

  /* SLOUČENÍ PŘI PŘIHLÁŠENÍ. Na jedné straně poznámky z tohohle
     prohlížeče, na druhé z účtu. Rozhoduje ČAS ÚPRAVY, ne strana:
     kdo psal naposled, ten má pravdu. Místní poznámky, které na účtu
     nejsou, se nahrají — jinak by přihlášením zmizely z dohledu, i když
     by dál ležely v prohlížeči.

     POZOR, MAZÁNÍ. „Místní poznámka, která na účtu není" jsou DVĚ úplně
     jiné situace a splést je dohromady znamená, že smazání nikdy
     nedrží. Naměřeno na čisté slučovací logice: poznámka smazaná na
     telefonu se na počítači vzkřísila a ještě se nahrála zpátky na účet,
     takže ji smazání nezabilo ani napodruhé.
       • nahrano = true  → účet ji zná, a teď tam není ⇒ někdo ji smazal
                           na jiném zařízení, smaž ji i tady;
       • nahrano = false → napsaná před přihlášením nebo bez signálu,
                           účet o ní nikdy nevěděl ⇒ nahraj ji.
     Vrací POČET POZNÁMEK, KTERÉ SE TÍM ZMĚNILY, ne počet všech: volající
     podle toho pozná, jestli má překreslovat. Nula znamená „stahovalo se
     a nic nového nepřišlo"; null znamená „nestahovalo se vůbec". Kdyby se
     vracel celkový počet, překresloval by se výpis po každém načtení
     stránky i tehdy, když se nezměnilo nic. */
  function sync() {
    if (!prihlasen()) return Promise.resolve(null);
    return root.PKAuth.rpc('moje_poznamky', {}).then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.data)) return null;
      var mistni = cti();
      var nahore = {};
      r.data.forEach(function (x) {
        if (!x || !x.klic) return;
        nahore[x.klic] = { text: String(x.text || ''), kdy: Date.parse(x.zmeneno || '') || 0 };
      });
      var vysledek = {};
      var nahrat = [];
      var smazano = [];
      Object.keys(mistni).concat(Object.keys(nahore)).forEach(function (k) {
        if (vysledek[k] || smazano.indexOf(k) >= 0) return;
        var m = mistni[k], n = nahore[k];
        if (m && n) {
          var mistniNovejsi = (m.kdy || 0) > (n.kdy || 0);
          vysledek[k] = mistniNovejsi
            ? { text: m.text, kdy: m.kdy, nahrano: false }
            : { text: n.text, kdy: n.kdy, nahrano: true };
          /* Když je místní novější, server o tom neví — dohnat. */
          if (mistniNovejsi) nahrat.push(k);
        } else if (m) {
          if (m.nahrano) smazano.push(k);          // smazáno jinde
          else { vysledek[k] = m; nahrat.push(k); } // účet ji nikdy neviděl
        } else {
          vysledek[k] = { text: n.text, kdy: n.kdy, nahrano: true };
        }
      });
      var zmen = 0;
      Object.keys(vysledek).forEach(function (k) {
        var m = mistni[k];
        if (!m || m.text !== vysledek[k].text) zmen++;
      });
      Object.keys(mistni).forEach(function (k) { if (!vysledek[k]) zmen++; });
      try { localStorage.setItem(KLIC, JSON.stringify(uklid(vysledek))); } catch (e) {}
      nahrat.forEach(function (k) {
        if (vysledek[k] && vysledek[k].text) posli(k, vysledek[k].text);
      });
      return zmen;
    }).catch(function () { return null; });
  }

  root.PKPoznamky = { text: text, uloz: uloz, vsechny: vsechny, kolik: kolik,
    sync: sync, prihlasen: prihlasen,
    KLIC: KLIC, STROP: STROP, ZNAKU: ZNAKU };
}(typeof window !== 'undefined' ? window : globalThis));
