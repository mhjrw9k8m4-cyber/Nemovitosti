/* Co si web o člověku pamatuje — na jednom místě.
 *
 * PROČ TO VZNIKLO. Web si v prohlížeči drží dvaadvacet různých věcí:
 * uložené pozemky, poznámky, skryté nabídky, filtry, naposledy
 * prohlížené, nastavení mapy, vzhled… Dozvědět se to ale nešlo odnikud
 * a smazat jednotlivě už vůbec. Zásady soukromí o tom mluví slovy,
 * jenže slova se nedají stisknout: kdo chtěl mít po sobě uklizeno,
 * musel vymazat data celého webu — tedy i to, co si chtěl nechat.
 *
 * TENHLE SOUBOR JE SEZNAM, NE LOGIKA. Každý klíč má česky napsané, co
 * v něm je a k čemu to je, jak se spočítá „kolik toho tam je" a kam
 * patří. Stránka „Moje data" z toho staví výpis; zkouška z toho hlídá,
 * že žádné nové úložiště nevznikne potichu — kdo přidá klíč a nezapíše
 * ho sem, shodí test-ulozene.mjs.
 *
 * CO TU NENÍ: věci vázané na účet (uložená hledání, zprávy, inzeráty).
 * Ty neleží v prohlížeči, ale v databázi, a mažou se tam, kde se
 * spravují. Míchat obojí do jednoho seznamu by znamenalo slíbit
 * smazání, které tenhle kód nemůže provést.
 */
(function (root) {
  'use strict';

  function poleDelka(s) { try { var a = JSON.parse(s); return Array.isArray(a) ? a.length : null; } catch (e) { return null; } }
  function klicuObjektu(s) {
    try { var o = JSON.parse(s); return (o && typeof o === 'object' && !Array.isArray(o)) ? Object.keys(o).length : null; }
    catch (e) { return null; }
  }
  function jeNeco(s) { return s == null ? null : 1; }

  /* kde: 'local' přežije zavření prohlížeče, 'session' jen tu návštěvu.
     skupina: podle toho se to na stránce řadí.
     pocet: funkce, která z uložené hodnoty udělá počet (null = nepočítá se). */
  var KLICE = [
    { klic: 'pk_fav_v1', kde: 'local', skupina: 'vyber', nazev: 'Uložené pozemky',
      popis: 'Pozemky, které jste si uložili tlačítkem se záložkou.',
      pocet: poleDelka, jednotka: ['pozemek', 'pozemky', 'pozemků'] },
    { klic: 'pk_poznamky_v1', kde: 'local', skupina: 'vyber', nazev: 'Soukromé poznámky',
      popis: 'Co jste si k pozemkům napsali. Nikam se neodesílají.',
      pocet: klicuObjektu, jednotka: ['poznámka', 'poznámky', 'poznámek'] },
    { klic: 'pk_skryte_v1', kde: 'local', skupina: 'vyber', nazev: 'Skryté nabídky',
      popis: 'Pozemky, které jste odklepli jako „tenhle mě nezajímá".',
      pocet: poleDelka, jednotka: ['nabídka', 'nabídky', 'nabídek'] },
    { klic: 'pk_otevrene_v1', kde: 'local', skupina: 'vyber', nazev: 'Už otevřené pozemky',
      popis: 'Podle toho se ve výpisu značí, co jste už viděli.',
      pocet: klicuObjektu, jednotka: ['pozemek', 'pozemky', 'pozemků'] },
    { klic: 'pk_recent_v1', kde: 'local', skupina: 'vyber', nazev: 'Naposledy prohlížené',
      popis: 'Krátký seznam pro rychlý návrat.', pocet: poleDelka, jednotka: ['položka', 'položky', 'položek'] },

    { klic: 'pk_filtr_v1', kde: 'local', skupina: 'nastaveni', nazev: 'Nastavené filtry',
      popis: 'Druh, cena a výměra, které jste si na mapě nastavili.', pocet: jeNeco },
    { klic: 'pk_misto_v1', kde: 'local', skupina: 'nastaveni', nazev: 'Moje místo a okruh',
      popis: 'Bod a vzdálenost pro „Pozemky v okolí".', pocet: jeNeco },
    { klic: 'pk_podklad_v1', kde: 'local', skupina: 'nastaveni', nazev: 'Podklad mapy',
      popis: 'Jestli se mapa kreslí základní, nebo leteckým snímkem.', pocet: jeNeco },
    { klic: 'pk_vrstvy_v1', kde: 'local', skupina: 'nastaveni', nazev: 'Zapnuté vrstvy mapy',
      popis: 'Katastr, územní plán, záplavy, ochrana přírody.', pocet: jeNeco },
    { klic: 'pk_rezim_v1', kde: 'local', skupina: 'nastaveni', nazev: 'Vzhled',
      popis: 'Světlý, tmavý, nebo podle systému.', pocet: jeNeco },
    { klic: 'pk_up_prefs_v1', kde: 'local', skupina: 'nastaveni', nazev: 'Co chci v upozorněních',
      popis: 'Které druhy zpráv se mají ukazovat.', pocet: jeNeco },

    { klic: 'pk_navsteva_v1', kde: 'local', skupina: 'provoz', nazev: 'Datum minulé návštěvy',
      popis: 'Podle něj se pozná, co od té doby přibylo.', pocet: jeNeco },
    { klic: 'pk_videno_den_v1', kde: 'local', skupina: 'provoz', nazev: 'Co se už ukázalo jako nové',
      popis: 'Aby tatáž nabídka nesvítila jako nová podruhé.', pocet: jeNeco },
    { klic: 'pk_upozorneni_znamo_v1', kde: 'local', skupina: 'provoz', nazev: 'Přečtená upozornění',
      popis: 'Poslední počet, který jste viděli — kvůli odznaku v menu.', pocet: jeNeco },
    { klic: 'pk_add_draft_v1', kde: 'local', skupina: 'provoz', nazev: 'Rozepsaný inzerát',
      popis: 'Co jste nedopsali ve formuláři „Přidat pozemek".', pocet: jeNeco },
    { klic: 'pk_device', kde: 'local', skupina: 'provoz', nazev: 'Označení zařízení',
      popis: 'Náhodné číslo, aby šlo poznat tentýž prohlížeč. Není v něm nic o vás.',
      pocet: jeNeco },

    { klic: 'pk_auth', kde: 'local', skupina: 'ucet', nazev: 'Přihlášení',
      popis: 'Klíč k vašemu účtu. Smazáním se odhlásíte.', pocet: jeNeco },

    { klic: 'pk_open', kde: 'session', skupina: 'provoz', nazev: 'Rozbalené části stránky',
      popis: 'Co jste měli otevřené, než jste přešli jinam.', pocet: jeNeco },
    { klic: 'pk_map_return', kde: 'session', skupina: 'provoz', nazev: 'Návrat na mapu',
      popis: 'Kam se mapa vrátí, až se vrátíte z detailu.', pocet: jeNeco },
    { klic: 'pk_upozorneni_v1', kde: 'session', skupina: 'provoz', nazev: 'Upozornění mezi stránkami',
      popis: 'Krátkodobá paměť, ať se počet nenačítá na každé stránce znovu.', pocet: jeNeco },
    { klic: 'pk_videno_v1', kde: 'session', skupina: 'provoz', nazev: 'Započítaná zhlédnutí',
      popis: 'Aby se zhlédnutí inzerátu nepočítalo dvakrát za návštěvu.', pocet: jeNeco },
    { klic: 'pk_poradi_seance', kde: 'session', skupina: 'provoz', nazev: 'Pořadí v této návštěvě',
      popis: 'Aby se nabídky nepřeskupovaly při každém překreslení.', pocet: jeNeco },
  ];

  var SKUPINY = [
    { id: 'vyber', nazev: 'Co jste si vybrali',
      popis: 'Tohle je vaše práce — uložené pozemky, poznámky k nim a co jste odmítli.' },
    { id: 'nastaveni', nazev: 'Jak to má vypadat',
      popis: 'Nastavení, aby se nemuselo klikat pokaždé znovu.' },
    { id: 'provoz', nazev: 'Drobnosti kvůli chodu webu',
      popis: 'Pomocné údaje. Smazáním o nic nepřijdete, jen se pár věcí nastaví znovu.' },
    { id: 'ucet', nazev: 'Přihlášení', popis: '' },
  ];

  function skladiste(kde) {
    try { return kde === 'session' ? sessionStorage : localStorage; } catch (e) { return null; }
  }
  /** Co v prohlížeči doopravdy je. Vrací [{def, pocet, bajtu}]. */
  function stav() {
    var out = [];
    for (var i = 0; i < KLICE.length; i++) {
      var d = KLICE[i];
      var s = skladiste(d.kde);
      var v = null;
      try { v = s ? s.getItem(d.klic) : null; } catch (e) { v = null; }
      if (v == null) continue;
      out.push({ def: d, pocet: d.pocet ? d.pocet(v) : null, bajtu: v.length });
    }
    return out;
  }
  /** Smaže jeden klíč. */
  function smaz(klic) {
    for (var i = 0; i < KLICE.length; i++) {
      if (KLICE[i].klic !== klic) continue;
      var s = skladiste(KLICE[i].kde);
      try { if (s) s.removeItem(klic); return true; } catch (e) { return false; }
    }
    return false;
  }
  /** Smaže celou skupinu. Vrací, kolik klíčů zmizelo. */
  function smazSkupinu(id) {
    var n = 0;
    for (var i = 0; i < KLICE.length; i++) {
      if (KLICE[i].skupina !== id) continue;
      var s = skladiste(KLICE[i].kde);
      try { if (s && s.getItem(KLICE[i].klic) != null) { s.removeItem(KLICE[i].klic); n++; } } catch (e) {}
    }
    return n;
  }

  /* Čeština počítá na tři způsoby: jedna poznámka, dvě poznámky, pět
     poznámek. „1 poznámek" je drobnost, která celou stránku shodí do
     dojmu, že ji psal stroj — a tahle stránka má přesvědčit o tom, že
     se s daty zachází pečlivě. */
  function tvar(n, formy) {
    if (!formy) return '';
    if (typeof formy === 'string') return formy;
    if (n === 1) return formy[0];
    if (n >= 2 && n <= 4) return formy[1];
    return formy[2];
  }

  root.PKUlozene = { KLICE: KLICE, SKUPINY: SKUPINY, stav: stav, smaz: smaz,
    smazSkupinu: smazSkupinu, tvar: tvar };
}(typeof window !== 'undefined' ? window : globalThis));
