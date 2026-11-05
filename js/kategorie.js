/* KATEGORIE NEMOVITOSTI — pozemek, dům, byt, areál, …
 * =====================================================================
 * Web začínal u pozemků a celý mu rozumí: `druh` říká, jestli je to orná
 * půda nebo stavební parcela, cena se počítá na Kč/m² pozemku a stránka
 * se jmenuje `pozemek-…`. Majitel 5. 11. rozhodl, že na webu budou
 * VŠECHNY nemovitosti — domy, byty, farmy, areály. Tohle je první kámen:
 * jeden rozměr `kat`, který říká, CO se vlastně prodává.
 *
 * PROČ ZVLÁŠŤ OD `druh`. Jsou to dvě různé otázky a plete se to:
 *   · `kat`  = co se prodává (pozemek / dům / byt / garáž / areál …)
 *   · `druh` = jaký je to pozemek (orná půda, les, stavební …)
 * U domu je `druh` nanejvýš druh pozemku POD ním, u bytu nemá smysl
 * vůbec. Kdyby to byl jeden sloupec, filtr „stavební pozemek" by začal
 * vracet domy a obvyklá cena by se počítala napříč nesrovnatelnými
 * věcmi.
 *
 * CO SE NEPOZNÁ, SE NEHÁDÁ — `zTextu()` vrací null a volající si doplní
 * `pozemek`. Je to týž závazek jako v js/druh.js a má stejný důvod: podle
 * kategorie se bude filtrovat i počítat cena, takže špatně zapsaná
 * kategorie je horší než žádná.
 *
 * POPIS A PRAVIDLA JSOU ODDĚLENĚ, stejně jako v js/druh.js. Důvod je
 * praktický: na jednu kategorii vede víc různě silných pravidel.
 * U bytu třeba slovo „byt" (jisté) a dispozice „3+kk" (slabá nápověda).
 * Kdyby byla pravidla přišpendlená k popisu, nešla by přednostmi
 * rozsypat mezi ostatní kategorie — a právě tím se ukázalo, že dispozice
 * nesmí hrát dřív než dům a chata (naměřeno: „Prodej chaty 2+1 u lesa"
 * vycházel jako byt).
 *
 * PŘEDNOSTI NEJSOU DETAIL. „Dražba rodinného domu s pozemkem" je DŮM,
 * ne pozemek. „Rodinný dům s garáží" je dům, ne garáž. Pořadí v PRAVIDLA
 * proto jde od nejkonkrétnější věci k nejobecnější; pozemek je až
 * poslední, protože slovo „pozemek" stojí skoro v každém inzerátu.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./druh.js'));
  else root.PKKategorie = factory(root.PKDruh);
})(typeof self !== 'undefined' ? self : this, function (PKDruh) {
  'use strict';

  /* ZÁVISLOST SE NEOBCHÁZÍ TICHO, ALE AŽ KDYŽ JE POTŘEBA.
   *
   * `srovnej` (bez diakritiky, malá písmena) už v repozitáři je dvakrát
   * — v js/druh.js a js/vybaveni.js — a třetí kopie by byla třetí místo,
   * kde se to může rozejít. Když modul chybí, musí to spadnout nahlas:
   * tichý náhradní normalizátor by znamenal, že se kategorie v prohlížeči
   * počítá jinak než v robotovi, a to se pozná teprve na datech.
   *
   * KDE SE TO KONTROLUJE, JE ALE ZÁSADNÍ. Nejdřív to stálo tady, hned
   * při vzniku modulu — a tím se kategorie nedaly v prohlížeči použít
   * vůbec: js/druh.js je modul ROBOTA, žádná stránka ho nenačítá
   * (viz pouzivaneStrankami() v scripts/minifikace.mjs) a kvůli jedné
   * funkci by si ho musel stáhnout každý návštěvník. Naměřeno 5. 11.:
   * js/druh.js má 12 420 B zdroje, 5 423 B přes drát v gzipu.
   *
   * Prohlížeč přitom text nikdy nerozebírá. Kategorii poznává robot při
   * stahování dat a ukládá ji do `kat`; stránce stačí popis (jméno,
   * množné číslo, ikona, míra). Kontrola se proto přesunula do
   * `zTextu()`, tedy do té jediné funkce, která druh opravdu potřebuje.
   * Kdo ji zavolá bez něj, dostane výjimku se jménem obou modulů —
   * ticho to není. Hlídá to scripts/test-kategorie.mjs. */
  function dejDruh() {
    if (!PKDruh || typeof PKDruh.srovnej !== 'function' || typeof PKDruh.bezJmen !== 'function') {
      throw new Error('kategorie z textu potřebují js/druh.js (srovnej, bezJmen) — načtěte ho dřív');
    }
    return PKDruh;
  }

  /* ---- POPIS KATEGORIÍ ---------------------------------------------
     `mera` říká, co znamená výměra, a rozhoduje o tom, co smí stát
     v „Kč/m²" a jestli se smí počítat obvyklá cena proti pozemkům:
       'pozemek'    — výměra je plocha pozemku (dnešní stav)
       'podlahova'  — výměra je podlahová plocha (byt, garáž)
       'obe'        — má obojí a nesmí se to míchat (dům, areál, farma)
     IKONY jsou zatím vzaté z dnešní sady (dum, budova, druh). Vlastní
     kresba pro byt, garáž a areál je práce pro pero, ne pro tenhle
     soubor — až bude, změní se tady jedno slovo. */
  var KATEGORIE = [
    { klic: 'pozemek', jmeno: 'Pozemek', mnozne: 'Pozemky', ikona: 'druh', mera: 'pozemek' },
    { klic: 'dum', jmeno: 'Dům', mnozne: 'Domy', ikona: 'dum', mera: 'obe' },
    { klic: 'byt', jmeno: 'Byt', mnozne: 'Byty', ikona: 'budova', mera: 'podlahova' },
    { klic: 'chata', jmeno: 'Chata', mnozne: 'Chaty', ikona: 'dum', mera: 'obe' },
    { klic: 'farma', jmeno: 'Farma', mnozne: 'Farmy', ikona: 'dum', mera: 'obe' },
    { klic: 'areal', jmeno: 'Areál', mnozne: 'Areály', ikona: 'budova', mera: 'obe' },
    { klic: 'komercni', jmeno: 'Komerční objekt', mnozne: 'Komerční objekty',
      ikona: 'budova', mera: 'obe' },
    { klic: 'garaz', jmeno: 'Garáž', mnozne: 'Garáže', ikona: 'budova', mera: 'podlahova' },
    /* JINÁ NEMOVITOST JE POCTIVÁ ODPOVĚĎ, NE ODPADKOVÝ KOŠ.
       Zdroj někdy řekne jen „je to stavba" (ÚZSVM má kategorii
       „Stavby" a „Jiné objekty") a text nic konkrétnějšího neprozradí.
       Budova se v takovém případě NESMÍ stát pozemkem — výměra by se
       počítala jako plocha pozemku a obvyklá cena za m² by byla číslo
       bez významu. Proto má „nevím co, ale pozemek to není" vlastní
       jméno a `mera: 'zadna'`, tedy Kč/m² se u ní nepíše vůbec. */
    { klic: 'jine', jmeno: 'Jiná nemovitost', mnozne: 'Jiné nemovitosti',
      ikona: 'budova', mera: 'zadna' },
  ];

  var PODLE_KLICE = {};
  for (var i = 0; i < KATEGORIE.length; i++) PODLE_KLICE[KATEGORIE[i].klic] = KATEGORIE[i];

  /** Výchozí kategorie: data bez `kat` jsou pozemky (tak web začínal). */
  var VYCHOZI = 'pozemek';

  /* ---- PRAVIDLA, V POŘADÍ PŘEDNOSTI -------------------------------- */
  var PRAVIDLA = [
    /* BYT jistě: řekne to slovem. „Nebytový prostor" se do \bbyt
       nechytí (hranice slova), ale „bytový dům" je DŮM na prodej jako
       celek, ne byt — proto stojí dům v poMimo. */
    { kat: 'byt',
      re: /\bbyt[uyei]?\b|\bbytem\b|\bbytov\w* jednotk\w*\b|\bgarsonk\w*\b/g,
      poMimo: /^\s*(?:ov\w*\s+)?dom\w*\b/ },
    /* DŮM. Nominativ je „dům" → bez diakritiky „dum", a to je jiný
       tvar než „domu/domy" — napoprvé tu nominativ chyběl a „Rodinný
       dům s garáží" nevyšel jako nic. */
    { kat: 'dum',
      re: /\bdum\b|\bdom[uy]\b|\bdomem\b|\bdome\b|\bdomek\b|\bdomku\b|\bdomky\b|\brodinn\w* dom\w*\b|\bbytov\w* dom\w*\b|\bvil[ayu]\b|\bvilou\b|\bchalup\w*\b|\bnovostavb\w* dom\w*\b/g,
      /* „Zahradní domek" ani „domek na nářadí" nedělá z pozemku dům —
         a slovo stojí PŘED nálezem, takže zápor dopředu na to nestačí. */
      predMimo: /\b(?:zahradni|zahradkarsk\w*|drevostavb\w*|unimo|montovan\w*)\s+$/,
      poMimo: /^\s*na narad[ií]\b/ },
    { kat: 'chata',
      re: /\bchat[ayu]\b|\bchatou\b|\bchatk\w*\b|\brekreacni\w* objekt\w*\b|\bsrub\w*\b/g },
    /* AREÁL PŘED FARMOU, A JE TO ROZHODNUTÍ, NE NÁHODA. Naměřeno na
       názvu „Dražba zemědělského areálu, bývalý kravín": `kravin` je
       ve pravidlech farmy, takže při obráceném pořadí vyšla farma —
       a přitom slovo, které předmět prodeje POJMENOVÁVÁ, je „areál".
       Kravín je popis toho, co v areálu stávalo. Vyhrává jméno
       předmětu, ne jeho příslušenství. */
    { kat: 'areal',
      re: /\bareal\w*\b|\bkomplex\w*\b|\bbyval\w* kasarn\w*\b/g },
    { kat: 'farma',
      re: /\bfarm[ayu]\b|\bfarmou\b|\bstatek\b|\bstatku\b|\busedlost\w*\b|\bhospodarsk\w* dvur\b|\bkravin\w*\b|\bstodol\w*\b/g },
    /* „UBYTOVACÍ" A „REKREAČNÍ ZAŘÍZENÍ" jsou v seznamu proto, že je
       zdroj opravdu píše — ne proto, že mě napadly. Naměřeno naostro
       5. 11. v nabídce ÚZSVM: „Horní Albeřice, č. p. 42, ubytovací
       zařízení" a „Rekreační zařízení, k.ú. Antonínov". Obojí bez nich
       vycházelo jako „jiná nemovitost", přitom je to komerční objekt.
       Samotné slovo „zařízení" se nebere: to je v popisech i o
       technickém zařízení budovy. */
    { kat: 'komercni',
      re: /\bkomercni\w*\b|\bkancelar\w*\b|\bobchodni\w* prostor\w*\b|\bvyrobni\w* hal\w*\b|\bsklad\b|\bsklady\b|\bskladu\b|\bskladov\w*\b|\bprovozovn\w*\b|\brestaurac\w*\b|\bpenzion\w*\b|\bhotel\w*\b|\bubytovn\w*\b|\bubytovaci\w* zarizen\w*\b|\brekreacni\w* zarizen\w*\b|\bnebytov\w* prostor\w*\b/g },
    /* GARÁŽ JEN TAM, KDE JE PŘEDMĚTEM PRODEJE. „Rodinný dům s garáží"
       je dům (a dům vyhraje přednostmi), ale „pozemek s garáží" by
       široké pravidlo přepsalo na garáž. Chytá se proto jen vazba, ve
       které se garáž prodává, nebo garáž na začátku názvu. */
    { kat: 'garaz',
      re: /\b(?:prodej|drazb[ayu]|aukc[eiy]|nabidk[ayu]|prodam)\s+(?:\w+\s+){0,2}garaz\w*\b|^\s*garaz\w*\b|\bgarazov\w* stani\b/g },
    /* DISPOZICE JE AŽ TADY, A TO JE CELÁ POINTA. „3+kk" sama o sobě
       neznamená byt — dispozici má i dům i chata. Naměřeno: dokud
       dispozice hrála dřív, vycházel „Prodej chaty 2+1 u lesa" jako
       byt. Když ale v textu není ŽÁDNÉ jiné slovo o předmětu prodeje,
       je dispozice ta nejlepší nápověda, jakou máme, a nejčastěji
       opravdu patří bytu. */
    { kat: 'byt', re: /\b\d\s*\+\s*(?:kk|1)\b/g },
    /* Pozemek je poslední schválně — viz hlavička. Když se nepozná nic
       konkrétnějšího, vrací se null a volající doplní pozemek; tím
       zůstanou dnešní data bit za bit stejná. */
    { kat: 'pozemek',
      re: /\bpozem(?:ek|ku|ky|em|cich|kem)\b|\bparcel\w*\b/g },
  ];

  /* Slovo TĚSNĚ PŘED nálezem, po kterém kategorie popisuje OKOLÍ, ne
     předmět prodeje. Táž past jako u druhu: „pozemek vedle domu" není
     dům. Seznam je schválně stejný jako v js/druh.js — je to tentýž jev. */
  var OKOLI = /(?:\bu|\bku|vedle|poblize?|poblizu|nedaleko|blizko|okraji|okraje|na kraji|smerem k|smerem na|vyhledem na|vyhled na|pohled na|obklopen\w*|lemovan\w*|sousedi s|sousedici s|prilehl\w*|navazuje na|kousek od|cestou k|cestou do|prijezd k|za)\s+$/;

  /* Zápor před nálezem: „bez domu", „nelze stavět dům". */
  var ZAPOR = /\b(?:bez|neni|nejsou|nelze|nesmi|nedovoluje|zakaz\w*|mimo|nevhodn\w*|krome)\s+$/;

  /* JMÉNO WEBU NENÍ PŘEDMĚT PRODEJE.
     ------------------------------------------------------------------
     Nabídky nesou v poli `extra` svůj původ: „inzerát – Farmy.cz".
     Slovo „Farmy" je ve pravidlech farmy, takže KAŽDÁ nabídka z toho
     zdroje vycházela jako farma — naměřeno na ostrých datech při psaní
     zkoušky: ze 2 303 pozemků jich takhle propadlo několik desítek
     a nic by to neohlásilo, jen by na webu ležely farmy, které jsou
     pole. Je to táž rodina vad jako jméno obce v js/druh.js (Louka,
     Loukov, Kostelec nad Černými lesy), jen sem teče jméno webu.
     Doména se proto vyhazuje dřív, než se cokoli hledá. Seznam
     koncovek je úmyslně krátký — chrání zkratky jako „p.č." a „k.ú.",
     které by širší pravidlo rozkouslo. */
  var DOMENA = /\b[a-z0-9][a-z0-9-]*\.(?:cz|com|eu|sk|net|org|info|gov)\b/g;
  function bezDomen(t) {
    return String(t == null ? '' : t).replace(DOMENA, ' ');
  }

  function platny(t, od, doo, p) {
    var pred = t.slice(0, od);
    var po = t.slice(doo);
    if (OKOLI.test(pred)) return false;
    if (ZAPOR.test(pred)) return false;
    if (p.predMimo && p.predMimo.test(pred)) return false;
    if (p.poMimo && p.poMimo.test(po)) return false;
    return true;
  }

  /**
   * Kategorie z volného textu (název + popis nabídky).
   * Vrací klíč kategorie, nebo null, když se nic nepozná.
   * `jmenaMist` se z textu vyhazují týmž způsobem jako u druhu: v nabídce
   * jsou obce jako Domašov, Chatov nebo Statenice a jejich jméno by
   * z pozemku udělalo dům.
   */
  function zTextu(text, jmenaMist) {
    var D = dejDruh();
    var t = D.bezJmen(bezDomen(D.srovnej(text)), jmenaMist);
    if (!t) return null;
    for (var i = 0; i < PRAVIDLA.length; i++) {
      var p = PRAVIDLA[i];
      p.re.lastIndex = 0;
      var m;
      while ((m = p.re.exec(t)) !== null) {
        if (platny(t, m.index, m.index + m[0].length, p)) { p.re.lastIndex = 0; return p.kat; }
        if (m.index === p.re.lastIndex) p.re.lastIndex++;   // pojistka proti zacyklení
      }
    }
    return null;
  }

  /** Popis kategorie pro oči. Neznámý klíč nepředstírá, že ho zná. */
  function jmeno(k) {
    var z = PODLE_KLICE[k || VYCHOZI];
    return z ? z.jmeno : 'Nemovitost';
  }
  function mnozne(k) {
    var z = PODLE_KLICE[k || VYCHOZI];
    return z ? z.mnozne : 'Nemovitosti';
  }
  function ikona(k) {
    var z = PODLE_KLICE[k || VYCHOZI];
    return z ? z.ikona : 'druh';
  }
  /** Co znamená výměra u téhle kategorie — viz komentář u `mera`. */
  function mera(k) {
    var z = PODLE_KLICE[k || VYCHOZI];
    return z ? z.mera : 'zadna';
  }
  /**
   * Smí se u téhle kategorie počítat obvyklá cena proti pozemkům?
   * Jen u pozemků. U domu je v ceně stavba, u bytu podlahová plocha —
   * Kč/m² pozemku by tam bylo číslo bez významu a verdikt „levné"
   * postavený na něm by byla lež.
   */
  /* JAKÝM SLOVEM SE POČÍTÁ — JEDNA PRAVDA PRO WEB I PRO ZKOUŠKY.
     Dokud jsou v datech samé pozemky, počítá se „8 pozemků"; jak
     přijde první byt, musí být „8 nemovitostí", protože těch osm už
     pozemky všechny nejsou.

     Bylo to napevno v js/main.js a zkoušky v prohlížeči si slovo
     opsaly do svých vzorků (/\d+ pozem/). Robot přinesl 5. 11. první
     nepozemkové nabídky, web správně přepnul na „nemovitostí" — a tři
     zkoušky v CI spadly na vlastní opsané slovo, ne na vadě webu.
     Proto je rozhodnutí tady a všichni se ptají jeho. */
  function klicePodleDat(nabidky) {
    var videne = {};
    var pole = nabidky || [];
    for (var i = 0; i < pole.length; i++) videne[klic(pole[i] && pole[i].kat)] = true;
    return KATEGORIE.map(function (z) { return z.klic; })
      .filter(function (k) { return videne[k]; });
  }
  var SLOVA_POZEMEK = ['pozemek', 'pozemky', 'pozemků'];
  var SLOVA_NEMOVITOST = ['nemovitost', 'nemovitosti', 'nemovitostí'];
  /* A JEDNA PRAVDA O TOM, JAKÝM SLOVEM SE POČÍTAJÍ NABÍDKY, které
     dostane volající. Dostane celou trojici (1., 2.–4., 5. a dál),
     protože česky se počítá třemi tvary a vybrat z nich umí sklonění
     u volajícího.

     Množina se PODÁVÁ, a to je celá pointa: slovo se řídí tím, co to
     číslo počítá. Okresní stránka nese všechno, co v okrese je, takže
     u ní rozhoduje okres; druhová stránka nese po § 421 jen pozemky,
     takže u ní vyjde „pozemků" sama od sebe. Žádné výjimky, žádné
     „tahle stránka je zvláštní". */
  function slovaPoctu(nabidky) {
    return vsePozemkove(klicePodleDat(nabidky)) ? SLOVA_POZEMEK : SLOVA_NEMOVITOST;
  }

  function vsePozemkove(klice) {
    var k = klice || [];
    return k.length < 2 && (k.length === 0 || k[0] === 'pozemek');
  }

  function jePozemkova(k) {
    return mera(k) === 'pozemek';
  }
  /** Platný klíč, nebo výchozí pozemek. Nikdy nevrací nesmysl. */
  function klic(hodnota) {
    var h = String(hodnota == null ? '' : hodnota);
    return PODLE_KLICE[h] ? h : VYCHOZI;
  }

  /* ---- CO SE PRODÁVÁ, PRO OČI --------------------------------------
     Tyhle dvě funkce berou celou NABÍDKU, ne klíč. Jsou tu proto, že
     totéž rozhodnutí padá na pěti místech — karta ve výpisu, bublina na
     mapě, řádka v historii, stránka nabídky a stránky okresů — a pět
     opsaných podmínek je pět příležitostí, jak se rozejít. */

  /**
   * Nadpis nabídky: co se prodává. Vrací null u pozemku.
   *
   * NULL JE ODPOVĚĎ, NE CHYBĚJÍCÍ ÚDAJ. U pozemku dělá nadpis DRUH
   * („Orná půda", „Stavební parcela"), a to je pro kupujícího
   * konkrétnější než slovo „pozemek" — tak to na webu stojí odjakživa
   * a nemá se to měnit. Volající si tedy píše
   *   nadpisKategorie(d) || <dosavadní nadpis z druhu>
   * a u pozemků se nezmění ani znak.
   *
   * U všeho ostatního naopak `druh` nepomůže: u bytu nemá smysl vůbec
   * a u domu je to nanejvýš druh pozemku pod ním, takže by v nadpisu
   * stálo „Zastavěná plocha a nádvoří" tam, kde se prodává dům.
   */
  function nadpisKategorie(o) {
    var k = klic(o && o.kat);
    return jePozemkova(k) ? null : jmeno(k);
  }

  /**
   * Co ta výměra u nabídky je. Prázdný řetězec znamená „netvrdí se nic".
   *
   * U bytu a garáže je výměra podlahová plocha — holé „54 m²" vedle
   * pozemků, kde totéž číslo znamená plochu parcely, je dvojsmysl
   * přesně toho druhu, jaký web už jednou řešil u spoluvlastnických
   * podílů (štítek „celá parcela" / „výměra podílu").
   *
   * U domu, areálu a farmy (`mera: 'obe'`) se schválně NEŘÍKÁ NIC:
   * ze zdrojů nevyplývá, jestli uložené číslo je plocha parcely, nebo
   * zastavěná plocha, a tipovat to by bylo horší než mlčet.
   */
  function popisVymery(o) {
    return mera(klic(o && o.kat)) === 'podlahova' ? 'podlahová plocha' : '';
  }

  return {
    KATEGORIE: KATEGORIE,
    KLICE: KATEGORIE.map(function (z) { return z.klic; }),
    PRAVIDLA: PRAVIDLA,
    bezDomen: bezDomen,
    VYCHOZI: VYCHOZI,
    zTextu: zTextu,
    jmeno: jmeno,
    mnozne: mnozne,
    ikona: ikona,
    mera: mera,
    jePozemkova: jePozemkova,
    klicePodleDat: klicePodleDat,
    vsePozemkove: vsePozemkove,
    slovaPoctu: slovaPoctu,
    nadpisKategorie: nadpisKategorie,
    popisVymery: popisVymery,
    klic: klic,
  };
});
