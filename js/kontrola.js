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
    if (URL_V_TEXTU.test(s)) return chyba('Odkaz nepatří do popisu — vložte ho do pole „Odkaz na inzerát nebo katastr".');
    if (EMAIL.test(s)) return chyba('E-mail nepatří do popisu — vložte ho do pole „Telefon nebo e-mail".');
    if (TELEFON.test(s)) return chyba('Telefon nepatří do popisu — vložte ho do pole „Telefon nebo e-mail".');
    return ok();
  }

  function odkaz(v) {
    var s = text(v);
    if (!s) return ok();                                    // odkaz je nepovinný
    if (s.length > MEZE.odkazMax) return chyba('Odkaz je moc dlouhý.');
    if (/^(javascript|data|file|vbscript):/i.test(s)) return chyba('Tenhle odkaz nejde použít.');
    var u = s;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;       // „bezrealitky.cz/…" doplníme
    var host = '';
    try {
      var parsed = typeof URL === 'function' ? new URL(u) : null;
      if (!parsed) return chyba('Odkaz nevypadá platně.');
      if (!/^https?:$/.test(parsed.protocol)) return chyba('Odkaz musí začínat http:// nebo https://.');
      host = parsed.hostname.toLowerCase();
    } catch (e) { return chyba('Odkaz nevypadá platně — zkontrolujte ho.'); }
    if (host.indexOf('.') === -1) return chyba('Odkaz nevypadá platně — chybí doména.');
    if (/^(localhost|127\.|0\.|10\.|192\.168\.)/.test(host)) return chyba('Odkaz musí vést na veřejnou stránku.');
    if (ZKRACOVACE.test(host)) return chyba('Zkrácené odkazy nepřijímáme — vložte prosím přímou adresu inzerátu.');
    if (/^(parcelaka\.cz|www\.parcelaka\.cz)$/.test(host)) return chyba('Odkaz má vést na jiný web (inzerát nebo katastr), ne zpět na Parcelku.');
    return ok();
  }

  function kontakt(v) {
    var s = text(v);
    if (!s) return chyba('Zadejte prosím telefon nebo e-mail — zájemci se jinak neozvou.');
    if (EMAIL.test(s) && s.indexOf('@') > 0) {
      var domena = s.split('@')[1] || '';
      if (domena.split('.').pop().length < 2) return chyba('E-mail nevypadá platně.');
      if (/^(test|aaa|xxx|asdf|nic|neuvedeno)@/i.test(s)) return chyba('Zadejte prosím skutečný e-mail.');
      return ok();
    }
    var cislice = s.replace(/\D/g, '');
    if (cislice.length < 9) return chyba('Zadejte platný telefon (9 číslic) nebo e-mail.');
    if (cislice.length > 13) return chyba('Telefonní číslo je moc dlouhé.');
    var devet = cislice.slice(-9);
    if (/^(\d)\1{8}$/.test(devet)) return chyba('Zadejte prosím skutečné telefonní číslo.');
    if (devet === '123456789' || devet === '987654321') return chyba('Zadejte prosím skutečné telefonní číslo.');
    if (!/^[2-9]/.test(devet)) return chyba('České číslo nezačíná nulou ani jedničkou — zkontrolujte ho.');
    return ok();
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
      ['p-vymera', vymera(d.vymera)],
      ['p-cena', cena(d.cena)],
      ['p-cena', cenaZaMetr(d.cena, d.vymera)],
      ['p-parcela', parcela(d.parcela)],
      ['p-popis', popis(d.popis)],
      ['p-odkaz', odkaz(d.odkaz)],
      ['p-jmeno', jmeno(d.jmeno)],
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
    popis: popis, odkaz: odkaz, kontakt: kontakt, jmeno: jmeno, parcela: parcela,
    fotkaRozmery: fotkaRozmery, fotkaObsah: fotkaObsah,
    formular: formular,
    _jeSprosty: jeSprosty, _jeSpam: jeSpam, _podilVelkych: podilVelkych
  };
});
