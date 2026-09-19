/* =====================================================================
   Parcelka — opakovaná kontrola odkazů a fotek.

   Jedna kontrola při odeslání nestačí ze dvou důvodů:

   1) Jedna zpráva ze sítě nic nedokazuje. Server může být na deset vteřin
      nedostupný, vrátit 503 při údržbě nebo shodit spojení. Kdo by na
      takové jediné odpovědi stavěl, stahoval by poctivé inzeráty kvůli
      výpadku. Proto se každý odkaz zkouší **třikrát za sebou** s rostoucí
      pauzou a rozhoduje až výsledek všech pokusů.

   2) Inzerát žije dál. Odkaz na cizí nabídku po čase zmizí nebo se
      přesměruje jinam, fotka se v úložišti smaže. Proto tytéž kontroly
      běží pravidelně i po zveřejnění (scripts/kontrola-inzeratu.mjs).

   Tenhle soubor je jen rozhodování nad výsledky — samotné stahování dělá
   ten skript. Díky tomu jde všechno otestovat bez sítě.
   ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PKOpakovana = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var POKUSY = 3;                    // kolikrát odkaz zkusit, než ho odsoudíme
  var PAUZY = [0, 2000, 6000];       // ms mezi pokusy — ať to není útok na cizí server

  /* Jeden pokus vypadá takto:
       { stav: 200, url: 'https://…', chyba: null }        … odpověď serveru
       { stav: 0,   url: null, chyba: 'ETIMEDOUT' }        … nedošlo spojení
     Rozhodnutí se dělá až nad celou trojicí. */

  function jeTrvalaChyba(stav) { return stav === 404 || stav === 410; }
  function jeDocasna(stav, chyba) {
    if (chyba) return true;                          // spojení nedošlo → může být chvilkové
    return stav === 0 || stav === 408 || stav === 429 || (stav >= 500 && stav < 600);
  }

  // Doména bez „www." a malými písmeny — kvůli porovnání, kam odkaz vede.
  function domena(url) {
    try {
      var h = new URL(url).hostname.toLowerCase();
      return h.replace(/^www\./, '');
    } catch (e) { return ''; }
  }

  /* Vyhodnotí pokusy o jeden odkaz.
     Vrací: { stav: 'ok' | 'mrtvy' | 'presmerovan' | 'nedostupny',
              msg, pokusu, kod } */
  function vyhodnotOdkaz(puvodniUrl, pokusy) {
    if (!pokusy || !pokusy.length) return { stav: 'nedostupny', msg: 'odkaz se nepodařilo ověřit', pokusu: 0 };

    var uspesny = null, trvala = null;
    for (var i = 0; i < pokusy.length; i++) {
      var p = pokusy[i];
      if (!p.chyba && p.stav >= 200 && p.stav < 400) { uspesny = p; break; }
      if (jeTrvalaChyba(p.stav)) trvala = p;
    }

    if (uspesny) {
      var kam = domena(uspesny.url || puvodniUrl), odkud = domena(puvodniUrl);
      // Přesměrování v rámci webu je běžné; skok na jinou doménu ale znamená,
      // že odkaz vede jinam, než sliboval (prodaná doména, parkovací stránka).
      if (kam && odkud && kam !== odkud && kam.indexOf(odkud) === -1 && odkud.indexOf(kam) === -1) {
        return {
          stav: 'presmerovan', kod: uspesny.stav, pokusu: pokusy.length,
          msg: 'odkaz vede na ' + kam + ' místo na ' + odkud
        };
      }
      return { stav: 'ok', kod: uspesny.stav, pokusu: pokusy.length, msg: '' };
    }

    // Ani jeden pokus neuspěl. „Nenalezeno" bereme vážně jen tehdy, když
    // se to zopakovalo — jinak je to pro nás jen dočasná nedostupnost.
    var trvalych = pokusy.filter(function (p) { return jeTrvalaChyba(p.stav); }).length;
    if (trvalych >= 2 || (trvalych === 1 && pokusy.length === 1)) {
      return { stav: 'mrtvy', kod: (trvala && trvala.stav) || 404, pokusu: pokusy.length,
               msg: 'odkaz už neexistuje (' + ((trvala && trvala.stav) || 404) + ')' };
    }
    var posledni = pokusy[pokusy.length - 1];
    return {
      stav: 'nedostupny', kod: posledni.stav || 0, pokusu: pokusy.length,
      msg: 'odkaz se ' + pokusy.length + 'krát po sobě nepodařilo otevřít' +
           (posledni.chyba ? ' (' + posledni.chyba + ')' : ' (' + posledni.stav + ')')
    };
  }

  /* Totéž pro fotku. U fotek nás zajímá i typ obsahu: když má obrázek
     najednou typ text/html, nejde o obrázek, ale o chybovou stránku. */
  function vyhodnotFotku(url, pokusy) {
    var zaklad = vyhodnotOdkaz(url, pokusy);
    if (zaklad.stav !== 'ok') {
      if (zaklad.stav === 'mrtvy') return { stav: 'chybi', pokusu: zaklad.pokusu, msg: 'fotka už v úložišti není' };
      return { stav: zaklad.stav, pokusu: zaklad.pokusu, msg: zaklad.msg.replace('odkaz', 'fotku') };
    }
    var uspesny = null;
    for (var i = 0; i < pokusy.length; i++) {
      if (!pokusy[i].chyba && pokusy[i].stav >= 200 && pokusy[i].stav < 400) { uspesny = pokusy[i]; break; }
    }
    var typ = (uspesny && uspesny.typ) || '';
    if (typ && !/^image\//i.test(typ)) {
      return { stav: 'nenifotka', pokusu: pokusy.length, msg: 'na adrese fotky je ' + typ + ', ne obrázek' };
    }
    return { stav: 'ok', pokusu: pokusy.length, msg: '' };
  }

  /* --- otisk fotky (perceptuální hash) ---
     Spočítá se z šedé zmenšeniny 9×8: každý bod se porovná se sousedem
     vpravo a z výsledku vznikne 64 bitů. Dvě fotky téhož pozemku vyjdou
     skoro stejně i po zmenšení nebo překomprimování — proto se tím dá
     poznat obrázek zkopírovaný z cizího inzerátu.

     Vstup: pole jasů (0–255), 9 sloupců × 8 řádků, po řádcích. */
  function otisk(jasy) {
    if (!jasy || jasy.length < 72) return null;
    var bity = '';
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        bity += (jasy[y * 9 + x] > jasy[y * 9 + x + 1]) ? '1' : '0';
      }
    }
    // 64 bitů jako 16 znaků šestnáctkově
    var hex = '';
    for (var i = 0; i < 64; i += 4) hex += parseInt(bity.slice(i, i + 4), 2).toString(16);
    return hex;
  }

  // Kolik bitů se liší (0 = tentýž obrázek, do 5 = skoro jistě tentýž motiv)
  function vzdalenostOtisku(a, b) {
    if (!a || !b || a.length !== b.length) return null;
    var rozdil = 0;
    for (var i = 0; i < a.length; i++) {
      var x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (x) { rozdil += x & 1; x >>= 1; }
    }
    return rozdil;
  }

  function jeStejnaFotka(a, b) {
    var d = vzdalenostOtisku(a, b);
    return d != null && d <= 5;
  }

  return {
    POKUSY: POKUSY, PAUZY: PAUZY,
    vyhodnotOdkaz: vyhodnotOdkaz, vyhodnotFotku: vyhodnotFotku,
    otisk: otisk, vzdalenostOtisku: vzdalenostOtisku, jeStejnaFotka: jeStejnaFotka,
    domena: domena
  };
});
