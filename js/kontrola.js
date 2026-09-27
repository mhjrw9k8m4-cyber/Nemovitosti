/* =====================================================================
   Parcelka — kontroly zadaných údajů.

   Proč vlastní soubor: kontroly byly rozdrobené v obsluze formuláře a daly
   se vyzkoušet jedině tak, že člověk otevřel stránku a ručně vyplňoval.
   Tady jsou to čisté funkce nad textem — vejde řetězec, vyjde rozhodnutí.
   Díky tomu je umí projet i `node scripts/test-kontrola.mjs` (a projíždí je
   při každém pushi), takže se pozná, když se některá pokazí.

   Každá funkce vrací:
     { ok: true }                      … prošlo
     { ok: false, msg: 'proč' }        … neprojde, uživateli ukážeme msg
     { ok: true,  varovani: 'proč' }   … projde, ale stojí za upozornění

   Kontroly v prohlížeči jsou rychlá zpětná vazba pro poctivého člověka —
   kdo chce, obejde je. Tvrdá hranice je vždycky na serveru (create_listing
   v supabase/). Proto tady i tam platí stejná čísla; když se mění, musí se
   změnit na obou místech.
   ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // node (testy)
  else root.PKKontrola = api;                                               // prohlížeč
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Meze — stejné jako na serveru
  var MEZE = {
    vymeraMin: 10, vymeraMax: 5000000,          // m²
    cenaMin: 1000, cenaMax: 500000000,          // Kč
    perM2Min: 1, perM2Max: 100000,              // Kč/m² — chytá překlep v ceně
    popisMin: 20, popisMax: 2000,
    obecMin: 2, obecMax: 60,
    odkazMax: 300,
    fotekMax: 8
  };

  function ok(varovani) { return varovani ? { ok: true, varovani: varovani } : { ok: true }; }
  function chyba(msg) { return { ok: false, msg: msg }; }
  function text(v) { return String(v == null ? '' : v).trim(); }
  function cislo(v) { var n = parseInt(String(v).replace(/\s/g, ''), 10); return isNaN(n) ? null : n; }

  // --- společné vzorce -------------------------------------------------
  var SPROSTA = /(kokot|kurv|píč|pic[ao]vin|\bmrd|debil|čur[aá]k|čůr|zmrd|\bjeb|hovn|hajzl|zkur|prdel|hovado|\bsra[čc])/i;
  var SPAM = /(viagra|casino|kasino|bitcoin|\bcrypto|krypto\s*měn|klikni\s*zde|rychlá\s*půjčka|půjčka\s*bez|výhra|vyhrál\s*jste)/i;
  var OPAKOVANI = /(.)\1{6,}/;                       // „aaaaaaaa"
  var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  var TELEFON = /(\+?\d[\d\s]{7,}\d)/;
  var URL_V_TEXTU = /(https?:\/\/|www\.)\S+/i;
  var ZKRACOVACE = /^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|ow\.ly|cutt\.ly|rb\.gy|shorturl\.at|rebrand\.ly)$/i;

  function jeSprosty(s) { return SPROSTA.test(s); }
  function jeSpam(s) { return SPAM.test(s) || OPAKOVANI.test(s); }

  /* Podíl velkých písmen — „PRODÁM POZEMEK LEVNĚ!!!" se čte hůř a působí
     jako křik. Počítáme jen z písmen, číslice a interpunkce nevadí. */
  function podilVelkych(s) {
    var pismena = s.replace(/[^A-Za-zÁ-Žá-ž]/g, '');
    if (pismena.length < 12) return 0;
    var velka = pismena.replace(/[^A-ZÁ-Ž]/g, '').length;
    return velka / pismena.length;
  }

  // --- jednotlivá pole -------------------------------------------------

  function obec(v) {
    var s = text(v);
    if (!s) return chyba('Vyplňte prosím obec nebo lokalitu.');
    if (s.length < MEZE.obecMin) return chyba('Název obce je moc krátký.');
    if (s.length > MEZE.obecMax) return chyba('Název obce je moc dlouhý.');
    if (/^\d+$/.test(s)) return chyba('Do obce patří název, ne číslo.');
    if (!/[A-Za-zÁ-Žá-ž]/.test(s)) return chyba('Název obce musí obsahovat písmena.');
    if (URL_V_TEXTU.test(s)) return chyba('Do obce nepatří odkaz.');
    if (jeSprosty(s) || jeSpam(s)) return chyba('Název obce vypadá nesmyslně.');
    return ok();
  }

  function vymera(v) {
    var n = cislo(v);
    if (n == null || n <= 0) return chyba('Zadejte prosím výměru v m².');
    if (n < MEZE.vymeraMin) return chyba('Výměra pod ' + MEZE.vymeraMin + ' m² nevypadá jako pozemek — zkontrolujte ji.');
    if (n > MEZE.vymeraMax) return chyba('Výměra nad ' + (MEZE.vymeraMax / 10000) + ' ha je nejspíš překlep.');
    return ok();
  }

  function cena(v) {
    var n = cislo(v);
    if (n == null || n <= 0) return chyba('Zadejte prosím cenu v Kč.');
    if (n < MEZE.cenaMin) return chyba('Cena pod ' + MEZE.cenaMin + ' Kč vypadá jako překlep.');
    if (n > MEZE.cenaMax) return chyba('Cena nad 500 mil. Kč vypadá jako překlep.');
    return ok();
  }

  /* Nejčastější chyba není nesmyslná cena ani výměra, ale jejich poměr:
     přidaná nula v ceně nebo m² zapsané v arech. Samo o sobě projde obojí,
     teprve Kč/m² to prozradí. */
  function cenaZaMetr(cenaV, vymeraV) {
    var c = cislo(cenaV), v = cislo(vymeraV);
    if (!c || !v || c <= 0 || v <= 0) return ok();
    var perM2 = c / v;
    if (perM2 < MEZE.perM2Min) return chyba('Vychází ' + perM2.toFixed(2) + ' Kč/m² — zkontrolujte cenu a výměru.');
    if (perM2 > MEZE.perM2Max) return chyba('Vychází ' + Math.round(perM2) + ' Kč/m², což je pro pozemek nereálné — zkontrolujte cenu a výměru.');
    if (perM2 > 20000) return ok('Vychází ' + Math.round(perM2) + ' Kč/m² — u pozemku hodně vysoká cena. Sedí to?');
    return ok();
  }

  function popis(v) {
    var s = text(v);
    if (!s) return ok();                                    // popis je nepovinný
    if (s.length < MEZE.popisMin) return chyba('Popis je moc krátký — napište aspoň větu (' + MEZE.popisMin + ' znaků), nebo ho nechte prázdný.');
    if (s.length > MEZE.popisMax) return chyba('Popis je moc dlouhý (max ' + MEZE.popisMax + ' znaků).');
    if (/[<>]/.test(s)) return chyba('Popis nesmí obsahovat značky < a >.');
    if (jeSprosty(s)) return chyba('Popis obsahuje nevhodná slova.');
    if (jeSpam(s)) return chyba('Popis vypadá jako spam.');
    if (podilVelkych(s) > 0.6) return chyba('Popis je psaný velkými písmeny — přepište ho prosím normálně.');
    /* Odkaz v popisu je spam a mate: dřív tahle hláška posílala člověka
       do pole „Odkaz na inzerát nebo katastr", jenže to pole se zahazovalo
       (a proto už na formuláři není). Tak ať aspoň neradí nesmysl. */
    if (URL_V_TEXTU.test(s)) return chyba('Odkazy do popisu nepatří — zájemci se ozvou přes Zprávy nebo na telefon.');
    if (EMAIL.test(s)) return chyba('E-mail do popisu nepatří — zájemci vám napíšou přes Zprávy, adresu máme z vašeho účtu.');
    if (TELEFON.test(s)) return chyba('Telefon nepatří do popisu — vložte ho do pole „Telefon".');
    return ok();
  }

  /* Domény, na které odkaz u pozemku běžně vede. Není to zákaz ostatních —
     jen se u neznámé domény ozveme, ať si člověk zkontroluje, kam odkazuje. */
  var ZNAME_DOMENY = /(^|\.)(bezrealitky\.cz|sreality\.cz|farmy\.cz|reality\.idnes\.cz|nahlizenidokn\.cuzk\.cz|cuzk\.cz|okdrazby\.cz|exdrazby\.cz|eurodrazby\.cz|drazby\.net|portaldrazeb\.cz|centralniadresa\.cz|spucr\.cz|justice\.cz|uzemnisouhlas\.cz|mapy\.cz|google\.com)$/i;
  var STAHOVANI = /\.(exe|apk|zip|rar|7z|dmg|msi|bat|sh|scr|jar|iso)$/i;

  function odkaz(v) {
    var s = text(v);
    if (!s) return ok();                                    // odkaz je nepovinný
    if (s.length > MEZE.odkazMax) return chyba('Odkaz je moc dlouhý.');
    if (/\s/.test(s)) return chyba('Odkaz nesmí obsahovat mezery — vložte jen samotnou adresu.');
    if (/^(javascript|data|file|vbscript|blob):/i.test(s)) return chyba('Tenhle odkaz nejde použít.');
    var u = s;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;       // „bezrealitky.cz/…" doplníme
    var parsed;
    try {
      parsed = typeof URL === 'function' ? new URL(u) : null;
      if (!parsed) return chyba('Odkaz nevypadá platně.');
    } catch (e) { return chyba('Odkaz nevypadá platně — zkontrolujte ho.'); }
    if (!/^https?:$/.test(parsed.protocol)) return chyba('Odkaz musí začínat http:// nebo https://.');

    var host = parsed.hostname.toLowerCase();
    if (host.indexOf('.') === -1) return chyba('Odkaz nevypadá platně — chybí doména.');
    if (!/^[a-z0-9.-]+$/.test(host)) return chyba('Odkaz obsahuje nepovolené znaky v doméně.');
    if (/\.\./.test(host) || host.charAt(0) === '.' || host.charAt(host.length - 1) === '.') return chyba('Odkaz nevypadá platně — zkontrolujte doménu.');
    if (!/\.[a-z]{2,}$/.test(host)) return chyba('Odkaz nevypadá platně — chybí koncovka domény.');
    if (/^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return chyba('Odkaz musí vést na veřejnou stránku, ne do vnitřní sítě.');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return chyba('Vložte prosím adresu s doménou, ne s číselnou IP.');

    // Přihlašovací údaje v adrese (https://jmeno:heslo@…) — klasický trik,
    // jak schovat, kam odkaz opravdu vede.
    if (parsed.username || parsed.password || /^https?:\/\/[^/@\s]*@/i.test(u)) {
      return chyba('Odkaz nesmí obsahovat přihlašovací údaje před adresou.');
    }
    // Doména zapsaná znaky, které vypadají jako latinka (bezreality vs. bezreaIity).
    if (/^xn--/i.test(host) || /(^|\.)xn--/i.test(host)) {
      return chyba('Odkaz používá doménu se zvláštními znaky — vložte prosím běžnou adresu.');
    }
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      return chyba('Odkaz s vlastním portem nepřijímáme.');
    }
    if (STAHOVANI.test(parsed.pathname || '')) return chyba('Odkaz vede na soubor ke stažení, ne na stránku.');
    if (ZKRACOVACE.test(host)) return chyba('Zkrácené odkazy nepřijímáme — vložte prosím přímou adresu inzerátu.');
    if (/^(parcelaka\.cz|www\.parcelaka\.cz)$/.test(host)) return chyba('Odkaz má vést na jiný web (inzerát nebo katastr), ne zpět na Parcelku.');

    var cesta = (parsed.pathname || '/') + (parsed.search || '');
    if (cesta.replace(/\/+$/, '').length <= 1 && !ZNAME_DOMENY.test(host)) {
      return ok('Odkaz vede jen na úvodní stránku webu — lepší je adresa konkrétního inzerátu nebo parcely.');
    }
    if (!ZNAME_DOMENY.test(host)) {
      return ok('Odkaz vede na ' + host + ' — zkontrolujte prosím, že míří tam, kam má.');
    }
    return ok();
  }

  /* Uklidí sledovací přívěsky (utm_*, fbclid, gclid) a mezery. Adresa zůstane
     funkční, jen se z ní nestane půlstránkový slepenec. */
  function ocistiOdkaz(v) {
    var s = text(v);
    if (!s) return '';
    var u = /^https?:\/\//i.test(s) ? s : 'https://' + s;
    try {
      var p = new URL(u);
      var pryc = [];
      p.searchParams.forEach(function (_, k) {
        if (/^(utm_|fbclid|gclid|mc_eid|mc_cid|igshid|ref_src)/i.test(k)) pryc.push(k);
      });
      pryc.forEach(function (k) { p.searchParams.delete(k); });
      return p.toString();
    } catch (e) { return s; }
  }

  /* Co plyne z EXIFu. Chybějící údaje nic nezamítají — messenger je z fotek
     maže, takže „bez EXIFu" má poctivý člověk stejně často jako podvodník.
     Zamítá se jen to, co EXIF přímo prozradí. */
  function fotkaPuvod(info, typSouboru, w, h) {
    info = info || {};
    var sw = String(info.software || '');
    // Snímek obrazovky: bez údajů o přístroji, ve formátu PNG a s rozměry
    // přesně odpovídajícími displeji.
    var displeje = ['1170x2532', '1179x2556', '1290x2796', '1284x2778', '1125x2436', '1080x1920', '1080x2400', '828x1792', '750x1334'];
    var rozmer = w + 'x' + h, rozmerNaVysku = h + 'x' + w;
    if (/png/i.test(typSouboru || '') && !info.znacka &&
        (displeje.indexOf(rozmer) !== -1 || displeje.indexOf(rozmerNaVysku) !== -1)) {
      return chyba('vypadá jako snímek obrazovky — nahrajte prosím vyfocený pozemek');
    }
    if (/screenshot|snímek|snimek/i.test(sw)) {
      return chyba('vypadá jako snímek obrazovky — nahrajte prosím vyfocený pozemek');
    }
    var cas = info.datum ? datumNaCas(info.datum) : null;
    if (cas) {
      var ted = Date.now();
      if (cas.getTime() > ted + 36 * 3600 * 1000) return chyba('má čas pořízení v budoucnosti — zkontrolujte datum v telefonu');
      var roky = (ted - cas.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (roky > 10) return ok('je starší než deset let — je pozemek pořád v tomhle stavu?');
    }
    return ok();
  }

  // Sedí místo pořízení fotky k obci z inzerátu?
  function fotkaMisto(vzdalenostKm) {
    if (vzdalenostKm == null) return ok();               // fotka souřadnice nemá
    if (vzdalenostKm > 100) return chyba('byla vyfocena ' + Math.round(vzdalenostKm) + ' km od zadané obce — patří k tomuhle pozemku?');
    if (vzdalenostKm > 25) return ok('jedna fotka vznikla ' + Math.round(vzdalenostKm) + ' km od zadané obce — zkontrolujte, že patří k pozemku.');
    return ok();
  }

  // „2026:09:18 14:03:22" → Date (stejný tvar jako v js/exif.js)
  function datumNaCas(s) {
    var m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return isNaN(d.getTime()) ? null : d;
  }

  /* JEN TELEFON. Pole se ptalo na „telefon nebo e-mail" z doby, kdy se
     inzerát dal podat bez účtu. Dnes se bez přihlášení podat nedá, takže
     e-mail už máme — ptát se na něj podruhé je práce navíc a vypadá to,
     že si web nepamatuje, kdo je přihlášený.
     Číslo je NEPOVINNÉ: zájemci mají u inzerátu tlačítko „Napsat
     majiteli", které vede do Zpráv. Telefon je zkratka pro toho, kdo
     chce rovnou volat — ne jediná cesta. Kdyby byl povinný, vyloučili
     bychom tím ty, kdo číslo zveřejnit nechtějí, a to dřív nebylo. */
  function kontakt(v) {
    var s = text(v);
    if (!s) return ok();
    if (EMAIL.test(s) && s.indexOf('@') > 0) {
      return chyba('Sem patří telefonní číslo. E-mail už máme z vašeho účtu a do inzerátu se nedává.');
    }
    var cislice = s.replace(/\D/g, '');
    if (cislice.length < 9) return chyba('Telefonní číslo má devět číslic — zkontrolujte ho prosím.');
    if (cislice.length > 13) return chyba('Telefonní číslo je moc dlouhé.');
    var devet = cislice.slice(-9);
    if (/^(\d)\1{8}$/.test(devet)) return chyba('Zadejte prosím skutečné telefonní číslo.');
    if (devet === '123456789' || devet === '987654321') return chyba('Zadejte prosím skutečné telefonní číslo.');
    if (!/^[2-9]/.test(devet)) return chyba('České číslo nezačíná nulou ani jedničkou — zkontrolujte ho.');
    return ok();
  }

  /* OKRES SE NEKONTROLOVAL VŮBEC. Bylo to volné políčko s nápovědou
     „např. Kolín" — prošlo cokoli. Přitom okres rozhoduje o víc věcech
     než kterýkoli jiný údaj: podle něj se inzerát zařadí na krajskou
     a okresní stránku, podle něj ho najdou uložená hlídání a podle
     něj se cena srovnává s okolím. Překlep znamená, že pozemek nikdo
     nenajde a jeho cena se poměřuje s cizím okresem.
     Okresů je 77 a jsou to jediné platné hodnoty. Seznam se tu
     nekopíruje — je v js/hlidani-logika.js, kde ho test drží shodný
     s data/okresy.json. Čte se až při kontrole, ne při načtení
     souboru: skripty se na stránce načítají v jiném pořadí. */
  function normOkres(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[-\u2010-\u2015]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^okres\s+/, '');
  }
  /* Vzdálenost dvou slov v úpravách (Levenshtein). Na „Kolim" → „Kolín"
     stačí; delší jména snesou dvě úpravy, kratší jednu, ať se nenabízí
     nesmysl. */
  function vzdalenost(a, b) {
    var m = a.length, n = b.length, i, j, radek = [], predchozi;
    if (Math.abs(m - n) > 2) return 99;
    for (j = 0; j <= n; j++) radek[j] = j;
    for (i = 1; i <= m; i++) {
      predchozi = radek[0]; radek[0] = i;
      for (j = 1; j <= n; j++) {
        var tmp = radek[j];
        radek[j] = Math.min(radek[j] + 1, radek[j - 1] + 1,
          predchozi + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        predchozi = tmp;
      }
    }
    return radek[n];
  }
  function znameOkresy() {
    var g = (typeof window === 'object' && window) || (typeof globalThis === 'object' && globalThis) || {};
    return (g.PKHlidani && g.PKHlidani.OKRESY) || [];
  }
  function okres(v) {
    var s = text(v);
    /* Povinný. Dřív nebyl a bez něj se nedalo zkontrolovat vůbec nic:
       obec „Lhota" se našla kdekoliv a pozemek skončil o sto kilometrů
       vedle. Se seznamem 77 okresů v našeptávači je to jedno slovo. */
    if (!s) return chyba('Vyberte prosím okres — podle něj pozemek zařadíme na mapu i do srovnání cen.');
    var zn = znameOkresy();
    /* Bez seznamu se nehádá. Kdyby se js/hlidani-logika.js nenačetl,
       je lepší pustit dál, než odmítnout platný okres. */
    if (!zn.length) return ok();
    var n = normOkres(s);
    var i, nej = null, nejd = 3;
    for (i = 0; i < zn.length; i++) {
      var zi = normOkres(zn[i]);
      if (zi === n) return ok();
      var d = vzdalenost(n, zi);
      if (d < nejd) { nejd = d; nej = zn[i]; }
    }
    if (nej && nejd <= (n.length <= 5 ? 1 : 2)) {
      return chyba('Okres „' + s + '" neznáme. Nemysleli jste ' + nej + '?');
    }
    return chyba('Okres „' + s + '" neznáme — vyberte prosím jeden ze 77 okresů (napovídá se při psaní).');
  }

  /* --- nemá to člověk u nás už jednou? --------------------------------

     Podat tentýž pozemek dvakrát je snadné: formulář je dlouhý, odeslání
     chvíli trvá a kdo si není jistý, že to prošlo, klepne znovu. Pak má
     v „Moje inzeráty" dvě stejné nabídky, zájemci je vidí obě a neví,
     která platí.

     Shoda se posuzuje přísně — obec, okres a výměra do dvou procent.
     Volněji to nejde: developer může ve vsi prodávat dvě sousední parcely
     stejné velikosti a ty dvě nabídky jsou obě poctivé. Proto se taky
     nezakazuje, jen upozorní: kdo ví, že jde o jiný pozemek, klepne na
     Zveřejnit podruhé a projde to. Blokovat by znamenalo tvrdit si své
     proti člověku, který svůj pozemek zná líp než my. */
  function normMisto(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function jakoMoje(d, mojeInzeraty) {
    var vymera = cislo(d.vymera);
    if (!vymera || vymera <= 0) return null;
    var obec = normMisto(d.obec), okres = normOkres(d.okres);
    if (!obec) return null;
    var list = mojeInzeraty || [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (normMisto(m.place) !== obec) continue;
      if (normOkres(m.okres) !== okres) continue;
      var mv = cislo(m.area);
      if (!mv || Math.abs(mv - vymera) > Math.max(1, 0.02 * vymera)) continue;
      return m;
    }
    return null;
  }

  /* --- padl špendlík do vybraného okresu? -----------------------------

     Nejhorší chyba v inzerátu není překlep v ceně, ale špatné místo:
     pozemek se pak ukazuje o sto kilometrů jinde a nikdo ho nenajde.
     Stává se to snadno — obcí jménem Lhota je v Česku přes dvacet a
     našeptávač adres vrátí tu první.

     Ptáme se proto souřadnic, ne jména: leží bod, který vyšel z obce,
     ve vybraném okrese? Hranice jsou proředěné (data/okresy-hrube.json,
     35 kB místo megabajtu), takže se s nimi nedá rozhodovat na metry.
     Nerozhodujeme: ptáme se „je ten bod od okresu dál než 5 km?".
     Na všech skutečných pozemcích v datech leží nejvzdálenější správný
     bod 1,76 km vně svého okresu — práh 5 km má skoro trojnásobnou
     rezervu, a přesto odhalí 98,9 % špatných dvojic obec–okres.
     Obojí měří scripts/test-okres.mjs. */
  var PRAH_KM = 5;
  /* Stupeň zeměpisné délky je u nás asi 0,64násobek stupně šířky. Bez
     téhle opravy by se měřilo nakřivo a práh by na západ–východ platil
     jiný než na sever–jih. */
  var KM_LNG = Math.cos(50 * Math.PI / 180) * 111.32, KM_LAT = 111.32;

  // Paprskový test: kolikrát polopřímka z bodu protne obvod.
  function vPrstenci(x, y, r) {
    var uvnitr = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) uvnitr = !uvnitr;
    }
    return uvnitr;
  }
  function kmOdUsecky(lng, lat, a, b) {
    var dx = (b[0] - a[0]) * KM_LNG, dy = (b[1] - a[1]) * KM_LAT;
    var l2 = dx * dx + dy * dy;
    var t = l2 ? (((lng - a[0]) * KM_LNG * dx + ((lat - a[1]) * KM_LAT) * dy) / l2) : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var px = (lng - a[0]) * KM_LNG - t * dx, py = (lat - a[1]) * KM_LAT - t * dy;
    return Math.sqrt(px * px + py * py);
  }
  function kmVenZOkresu(lat, lng, prstence) {
    var i, j, k, r, nej = Infinity;
    for (i = 0; i < prstence.length; i++) if (vPrstenci(lng, lat, prstence[i])) return 0;
    for (i = 0; i < prstence.length; i++) {
      r = prstence[i];
      for (j = 0, k = r.length - 1; j < r.length; k = j++) {
        var d = kmOdUsecky(lng, lat, r[k], r[j]);
        if (d < nej) nej = d;
      }
    }
    return nej;
  }
  // Do kterého okresu bod spadl (podle hrubých hranic). null = do žádného.
  function okresBodu(lat, lng, hrube) {
    for (var jm in hrube) {
      if (!Object.prototype.hasOwnProperty.call(hrube, jm)) continue;
      var p = hrube[jm];
      for (var i = 0; i < p.length; i++) if (vPrstenci(lng, lat, p[i])) return jm;
    }
    return null;
  }

  /* Vybraný okres přeložený na přesný název ze seznamu ('kolin' → 'Kolín').
     null = takový okres neznáme. */
  function kanonOkres(v) {
    var n = normOkres(v), zn = znameOkresy(), i;
    if (!n) return null;
    for (i = 0; i < zn.length; i++) if (normOkres(zn[i]) === n) return zn[i];
    return null;
  }

  function poloha(lat, lng, okresNazev, hrube) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) return ok();
    if (!hrube) return ok();                       // hranice se nenačetly — nehádáme
    var jm = kanonOkres(okresNazev);
    if (!jm || !hrube[jm]) return ok();            // okres neznáme, řeší okres()
    var km = kmVenZOkresu(lat, lng, hrube[jm]);
    if (km <= PRAH_KM) return ok();
    var kde = okresBodu(lat, lng, hrube);
    return chyba('Podle obce vychází místo ' + Math.round(km) + ' km mimo okres ' + jm +
      (kde ? ' — spíš to vypadá na okres ' + kde + '.' : '.') +
      ' Zkontrolujte prosím obec a okres, jinak by se pozemek ukázal jinde.');
  }

  function jmeno(v) {
    var s = text(v);
    if (!s) return chyba('Uveďte prosím své jméno.');
    if (s.length < 3) return chyba('Jméno je moc krátké.');
    if (s.length > 60) return chyba('Jméno je moc dlouhé.');
    if (/\d/.test(s)) return chyba('Do jména nepatří číslice.');
    if (URL_V_TEXTU.test(s) || EMAIL.test(s)) return chyba('Do jména nepatří odkaz ani e-mail.');
    if (jeSprosty(s) || jeSpam(s)) return chyba('Jméno vypadá nesmyslně.');
    if (s.indexOf(' ') === -1) return ok('Uveďte prosím i příjmení — zájemci víc věří inzerátu s celým jménem.');
    return ok();
  }

  /* Parcelní číslo: „123", „123/4", „st. 45", „St.45/2".
     Přísnější být nemůžeme — katastr zná i podivnější tvary. */
  function parcela(v) {
    var s = text(v);
    if (!s) return ok();
    if (s.length > 20) return chyba('Parcelní číslo je moc dlouhé.');
    if (!/^(st\.?\s*)?\d+(\/\d+)?$/i.test(s)) return chyba('Parcelní číslo zadejte ve tvaru 123, 123/4 nebo st. 45.');
    return ok();
  }

  /* Rozměry a obsah fotky. Vlastní obrázek sem nedáváme — funkce dostane
     už změřené hodnoty, aby šla otestovat bez prohlížeče. */
  function fotkaRozmery(w, h) {
    if (!w || !h) return chyba('poškozený obrázek');
    if (Math.max(w, h) < 500) return chyba('je moc malá (aspoň 500 px) — nahrajte fotku z mobilu');
    var pomer = Math.max(w, h) / Math.min(w, h);
    if (pomer > 3.5) return chyba('má nezvykle protáhlý tvar — vypadá to na snímek obrazovky, ne na fotku pozemku');
    return ok();
  }

  /* Jednolitá plocha = vyfocená zeď, stůl nebo prst přes objektiv.
     Dostane průměrný jas (0–255) a směrodatnou odchylku jasu. */
  function fotkaObsah(prumer, odchylka) {
    if (odchylka != null && odchylka < 12) return chyba('je skoro jednobarevná — vyfoťte prosím pozemek');
    if (prumer != null && prumer < 25) return chyba('je hodně tmavá — vyfoťte ji prosím za světla');
    if (prumer != null && prumer > 240) return chyba('je přesvícená — vyfoťte ji prosím znovu');
    return ok();
  }

  /* Celý formulář najednou — vrací první chybu (kvůli fokusu na pole)
     a zvlášť sesbíraná varování. */
  function formular(d) {
    var poradi = [
      ['p-obec', obec(d.obec)],
      ['p-okres', okres(d.okres)],
      ['p-vymera', vymera(d.vymera)],
      ['p-cena', cena(d.cena)],
      ['p-cena', cenaZaMetr(d.cena, d.vymera)],
      ['p-parcela', parcela(d.parcela)],
      ['p-popis', popis(d.popis)],
      /* Odkaz ani jméno tu už nejsou: formulář se na ně neptá, protože
         create_listing ani jedno nebere a v inzerátu se neukazují.
         Funkce odkaz() a jmeno() zůstávají — používá je jiné místo
         a budou potřeba, až se jméno začne opravdu ukládat. */
      ['p-kontakt', kontakt(d.kontakt)]
    ];
    var varovani = [];
    for (var i = 0; i < poradi.length; i++) {
      var id = poradi[i][0], v = poradi[i][1];
      if (!v.ok) return { ok: false, msg: v.msg, id: id, varovani: varovani };
      if (v.varovani) varovani.push({ id: id, msg: v.varovani });
    }
    return { ok: true, varovani: varovani };
  }

  return {
    MEZE: MEZE,
    obec: obec, vymera: vymera, cena: cena, cenaZaMetr: cenaZaMetr,
    popis: popis, odkaz: odkaz, kontakt: kontakt, jmeno: jmeno, parcela: parcela, okres: okres,
    poloha: poloha, kanonOkres: kanonOkres, PRAH_KM: PRAH_KM,
    jakoMoje: jakoMoje,
    fotkaRozmery: fotkaRozmery, fotkaObsah: fotkaObsah,
    fotkaPuvod: fotkaPuvod, fotkaMisto: fotkaMisto, ocistiOdkaz: ocistiOdkaz,
    formular: formular,
    _jeSprosty: jeSprosty, _jeSpam: jeSpam, _podilVelkych: podilVelkych,
    _kmVenZOkresu: kmVenZOkresu, _okresBodu: okresBodu
  };
});
