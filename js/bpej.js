/* Kód BPEJ pro jeden bod — dotaz na službu úřadu a přečtení odpovědi.
 *
 * BPEJ (bonitovaná půdně ekologická jednotka) je pětimístný kód kvality
 * zemědělské půdy. U zemědělského pozemku je to to hlavní, co o něm jde
 * zjistit: určuje úřední cenu půdy i třídu ochrany, a u I. a II. třídy
 * stát vynětí ze zemědělského půdního fondu povoluje jen výjimečně.
 *
 * ODKUD SE BERE. Web už vrstvu BPEJ umí ukázat na mapě (data/mapove-vrstvy.json,
 * služby SPÚ a ČÚZK). Mapová dlaždice ale kód nenese — je to obrázek. Na
 * konkrétní bod se musí zeptat zvlášť, dotazem GetFeatureInfo, a to je
 * přesně to, co tenhle soubor dělá.
 *
 * ZEPTÁ SE AŽ PROHLÍŽEČ NÁVŠTĚVNÍKA, a jen když si o to řekne. Platí tedy
 * totéž, co u ostatních vrstev úřadů: dokud nikdo nezmáčkne tlačítko,
 * neodejde na cizí server nic. Je to tak i napsané v ochraně údajů.
 *
 * CO TENHLE SOUBOR NEDĚLÁ: nepočítá úřední cenu. Tabulka cen podle BPEJ je
 * v příloze vyhlášky 298/2014 Sb. a v repozitáři není — a vymýšlet ceny
 * půdy je přesně ten druh čísla, které si web nemůže dovolit tvrdit.
 * Ukáže se tedy to, co služba vrátí, a nic navíc.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKBpej = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Jména atributů, pod kterými kód v odpovědích chodí. Služby úřadů se
     neshodnou ani na velikosti písmen, natož na jméně. */
  var JMENA = ['bpej', 'kod_bpej', 'kodbpej', 'kod', 'bpej_kod', 'bpejkod', 'cislo_bpej'];

  /* Pětimístný kód se píše slitě (50810) i po částech (5.08.10). Tvar je
     vždycky 1 + 2 + 2 číslice. */
  var TVAR = /(?:^|[^0-9])([0-9])[.\-\s]?([0-9]{2})[.\-\s]?([0-9]{2})(?:[^0-9]|$)/;

  function normalizuj(s) {
    if (s == null) return null;
    var m = TVAR.exec(String(s));
    if (!m) return null;
    return m[1] + m[2] + m[3];
  }

  /* Dotaz na bod. WMS neumí „co je tady" samo o sobě — musí se mu podsunout
     malinký výřez mapy a zeptat se na pixel uprostřed. Výřez je schválně
     úzký (zhruba dvacet metrů), ať odpověď patří opravdu tomu bodu. */
  function dotazUrl(sluzba, lat, lng, nast) {
    if (!sluzba || !sluzba.url || !isFinite(lat) || !isFinite(lng)) return null;
    var o = nast || {};
    var d = o.vyrez == null ? 0.0002 : o.vyrez;      // ~20 m ve stupních
    var px = o.px || 101;                             // lichý, ať je střed celé číslo
    var stred = Math.floor(px / 2);
    var p = [
      'SERVICE=WMS', 'REQUEST=GetFeatureInfo', 'VERSION=1.1.1',
      'LAYERS=' + encodeURIComponent(sluzba.vrstvy || ''),
      'QUERY_LAYERS=' + encodeURIComponent(sluzba.vrstvy || ''),
      'SRS=EPSG:4326',
      'BBOX=' + [lng - d, lat - d, lng + d, lat + d].join(','),
      'WIDTH=' + px, 'HEIGHT=' + px, 'X=' + stred, 'Y=' + stred,
      'INFO_FORMAT=' + encodeURIComponent(o.format || 'application/json'),
      'FEATURE_COUNT=1',
    ];
    return sluzba.url + (sluzba.url.indexOf('?') >= 0 ? '&' : '?') + p.join('&');
  }

  /* Z odpovědi vytáhne kód. Formáty jsou tři a každá služba posílá jiný:
     JSON (GeoServer), GML/XML (ČÚZK) a HTML tabulka (ArcGIS).

     POŘADÍ JE PODSTATNÉ. Nejdřív se hledá POJMENOVANÝ atribut — tam je kód
     jistě kód. Teprve když žádný není, zkusí se tvar 1+2+2 kdekoli v textu,
     a to je záloha, která se může splést: parcelní číslo „5.0810" má
     stejný tvar. Proto se tvarová shoda bere jen z hodnot atributů, ne
     z celého dokumentu i s hlavičkami. */
  function kodZOdpovedi(text) {
    if (text == null) return null;
    var s = String(text);
    var dvojice = [];

    /* JSON: vlastnosti jsou v properties, ale bereme je i z plochého objektu. */
    try {
      var j = JSON.parse(s);
      var zdroje = [];
      if (j && Array.isArray(j.features)) j.features.forEach(function (f) { if (f && f.properties) zdroje.push(f.properties); });
      if (j && j.properties) zdroje.push(j.properties);
      if (j && typeof j === 'object' && !Array.isArray(j) && !j.features) zdroje.push(j);
      zdroje.forEach(function (o) {
        Object.keys(o).forEach(function (k) { dvojice.push([k, o[k]]); });
      });
    } catch (e) { /* není JSON, zkusí se značkování níž */ }

    if (!dvojice.length) {
      /* XML/GML: <bpej:KOD_BPEJ>50810</bpej:KOD_BPEJ> */
      var re = /<(?:[A-Za-z0-9_]+:)?([A-Za-z0-9_]+)[^>]*>([^<]{1,60})<\//g, m;
      while ((m = re.exec(s))) dvojice.push([m[1], m[2]]);
      /* HTML tabulka: <th>BPEJ</th><td>5.08.10</td> i <td>BPEJ</td><td>…</td> */
      var rt = /<t[hd][^>]*>\s*([^<]{1,40}?)\s*<\/t[hd]>\s*<t[hd][^>]*>\s*([^<]{1,60}?)\s*<\/t[hd]>/gi, t;
      while ((t = rt.exec(s))) dvojice.push([t[1], t[2]]);
      /* Prostý text: „BPEJ = 50810" nebo „BPEJ: 5.08.10" */
      var rp = /([A-Za-z_]{3,20})\s*[:=]\s*([0-9.\-\s]{5,12})/g, q;
      while ((q = rp.exec(s))) dvojice.push([q[1], q[2]]);
    }

    /* 1) pojmenovaný atribut */
    for (var i = 0; i < dvojice.length; i++) {
      var jm = String(dvojice[i][0] || '').toLowerCase().replace(/[^a-z_]/g, '');
      if (JMENA.indexOf(jm) === -1) continue;
      var k = normalizuj(dvojice[i][1]);
      if (k) return k;
    }
    /* ŽÁDNÁ ZÁLOHA, KTERÁ HÁDÁ. Chvíli tu stálo „když kód není pod svým
       jménem, vezmi první pětimístné číslo v odpovědi". Zní to užitečně
       a je to past: parcelní číslo, souřadnice i identifikátor mají týž
       tvar, takže by web občas vypsal cizí číslo jako bonitu půdy —
       a nikdo by nepoznal, že je špatně.

       Přistiženo sabotáží: zkusil jsem hledání rozšířit na celý dokument
       a zkouška zůstala zelená, protože moje pasti ten rozdíl nerozeznaly.
       Místo chytřejší pasti je správná odpověď jednodušší: nehádat vůbec.
       Když se kód nenajde pod známým jménem, vrátí se null a web řekne,
       že se bonitu zjistit nepodařilo. Neznámé jméno atributu se přidá
       do JMENA — to je změna o jedno slovo, a je vidět. */
    return null;
  }

  return { dotazUrl: dotazUrl, kodZOdpovedi: kodZOdpovedi, normalizuj: normalizuj, JMENA: JMENA };
}));
