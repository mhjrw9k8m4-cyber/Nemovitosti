/* MAPOVÉ VRSTVY NAD POZEMKEM — územní plán, hranice parcel, záplavy, ochrana.
 *
 * Proč vůbec: u pozemku není dražší otázka než „smím tu stavět?" a web na ni
 * neodpovídal. Odkaz „Najít územní plán" člověka jen poslal hledat jinam;
 * odpověď je přitom vidět na jediném pohledu, když se plán položí PŘES ten
 * pozemek. To tady dělá přepínač vrstev v detailní mapě.
 *
 * Proč se adresy služeb nečtou z kódu, ale z data/mapove-vrstvy.json:
 * jsou to cizí veřejné služby českých úřadů a ty se stěhují (ČÚZK přešel
 * z services.cuzk.cz na .gov.cz, geoportály se přečíslovávají). Kdyby byly
 * adresy v kódu, znamenala by každá taková změna zásah do skriptu. Takhle
 * se opraví jeden řádek v JSONu.
 *
 * A proč se každá vrstva ZKOUŠÍ, než se nabídne:
 * přepínač, po kterém se nic nestane, je horší než chybějící přepínač —
 * člověk neví, jestli je chyba v mapě, v pozemku, nebo v něm. Proto se
 * z každé služby stáhne jedna malá zkušební dlaždice nad tím konkrétním
 * pozemkem a vrstva se ukáže JEN když služba odpoví obrázkem. Když je
 * u vrstvy víc adres, vyhraje první, která odpoví; pořadí v JSONu je tedy
 * pořadí podle důvěry. Tenhle postup má i tu vlastnost, že se nová vrstva
 * dá přidat do JSONu naslepo: dokud nefunguje, nikdo ji neuvidí.
 */
(function (global) {
  'use strict';

  var CESTA = 'data/mapove-vrstvy.json';
  var PAMET = 'pk_vrstvy_v1';        // sessionStorage: ať se nezkouší na každém pozemku znovu
  var PLATNOST = 30 * 60 * 1000;
  var LIMIT = 5000;                  // jak dlouho se čeká na zkušební dlaždici

  /** Web Mercator (EPSG:3857) — stejná projekce, v jaké kreslí Leaflet. */
  function merc(lat, lng) {
    var R = 6378137;
    var y = R * Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360));
    return [R * lng * Math.PI / 180, y];
  }
  /** Čtverec o straně 2× polomer (v metrech) okolo bodu, jako WMS bbox. */
  function bbox3857(lat, lng, polomer) {
    var s = merc(lat, lng), r = polomer || 300;
    return [(s[0] - r).toFixed(1), (s[1] - r).toFixed(1), (s[0] + r).toFixed(1), (s[1] + r).toFixed(1)].join(',');
  }

  /* WMS 1.1.1, ne 1.3.0. Ve verzi 1.3.0 se u některých souřadnicových
     systémů obrací pořadí osy (latitude/longitude) a služby se v tom
     rozcházejí — s 1.1.1 a „srs" je pořadí vždy x,y a nedá se splést.
     Leaflet ostatně sám posílá 1.1.1, takže zkouška i vrstva mluví
     stejným jazykem: co projde zkouškou, projde i v mapě. */
  function wmsAdresa(s, param) {
    var q = {
      SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap',
      LAYERS: s.vrstvy || '', STYLES: '', SRS: 'EPSG:3857',
      FORMAT: s.format || 'image/png', TRANSPARENT: 'TRUE'
    };
    for (var k in param) if (Object.prototype.hasOwnProperty.call(param, k)) q[k] = param[k];
    var casti = [];
    for (var j in q) if (Object.prototype.hasOwnProperty.call(q, j)) casti.push(j + '=' + encodeURIComponent(q[j]));
    return s.url + (s.url.indexOf('?') === -1 ? '?' : '&') + casti.join('&');
  }

  /** Adresa zkušební dlaždice pro jednu službu nad daným místem. */
  function zkusebniAdresa(s, lat, lng) {
    if (s.typ === 'dlazdice') {
      /* U obyčejných dlaždic (XYZ) se spočítá ta, ve které to místo leží. */
      var z = s.zkusebniPriblizeni || 14, n = Math.pow(2, z);
      var x = Math.floor((lng + 180) / 360 * n);
      var rad = lat * Math.PI / 180;
      var y = Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n);
      return s.url.replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{s}', 'a');
    }
    return wmsAdresa(s, { WIDTH: 64, HEIGHT: 64, BBOX: bbox3857(lat, lng, 300) });
  }

  /* Vysvětlivky (WMS GetLegendGraphic). U územního plánu nese sdělení
     BARVA — žlutá bydlení, šedá výroba, zelená zeleň — takže bez klíče
     je z mapy jen barevná skvrna. Služby ten obrázek vydávají samy.
     Pozor na jednotné číslo: GetMap má „LAYERS", GetLegendGraphic „LAYER",
     a vždycky jen jednu. Když služba vysvětlivky nedá, nebudou — platí
     tu stejná pojistka jako u vrstvy samotné. */
  function legendaAdresa(s) {
    if (!s || s.typ !== 'wms' || !s.vrstvy) return '';
    return wmsAdresa(s, { REQUEST: 'GetLegendGraphic', LAYER: String(s.vrstvy).split(',')[0] });
  }

  /** Stáhne obrázek a řekne, jestli to obrázek byl. Nikdy nespadne. */
  function zkus(url, limit) {
    return new Promise(function (hotovo) {
      var img = new Image(), dobehlo = false;
      function konec(vysledek) {
        if (dobehlo) return;
        dobehlo = true;
        clearTimeout(cas);
        img.onload = img.onerror = null;
        hotovo(vysledek);
      }
      /* Mlčící služba je pro člověka totéž co rozbitá, jen ho zdrží.
         Čeká se pět vteřin a dost — vrstva se prostě nenabídne. */
      var cas = setTimeout(function () { try { img.src = ''; } catch (e) {} konec(false); }, limit || LIMIT);
      img.onload = function () { konec(img.naturalWidth > 0 && img.naturalHeight > 0); };
      /* Chybová odpověď WMS je XML („ServiceException"), ne obrázek —
         prohlížeč ji neumí dekódovat a spadne sem. Přesně to chceme:
         nefunkční služba se nemá nabízet, i když odpověděla stavem 200. */
      img.onerror = function () { konec(false); };
      img.src = url;
    });
  }

  var nactene = null;
  /** Nastavení vrstev. Načte se jednou; když soubor chybí, vrstvy nejsou. */
  function nacti() {
    if (nactene) return nactene;
    nactene = fetch(CESTA, { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && Array.isArray(j.vrstvy)) ? j.vrstvy : []; })
      .catch(function () { return []; });
    return nactene;
  }

  function zPameti() {
    try {
      var s = JSON.parse(sessionStorage.getItem(PAMET) || 'null');
      if (s && (Date.now() - s.kdy) < PLATNOST) return s.stav || {};
    } catch (e) {}
    return {};
  }
  function doPameti(stav) {
    try { sessionStorage.setItem(PAMET, JSON.stringify({ kdy: Date.now(), stav: stav })); } catch (e) {}
  }

  /**
   * Zjistí, které vrstvy nad tímhle místem opravdu jdou.
   * @param stred {lat, lng}
   * @param naVrstvu volitelně: zavolá se hned, jak je jedna vrstva hotová
   * @return Promise pole {def, sluzba}
   */
  function pripravene(stred, naVrstvu) {
    return nacti().then(function (defs) {
      var pamet = zPameti(), novaPamet = {};
      return Promise.all(defs.map(function (def) {
        var sluzby = Array.isArray(def.sluzby) ? def.sluzby : [];
        /* Co se jednou v tomhle sezení ukázalo jako mrtvé, nezkouší se
           při každém dalším pozemku znovu — jsou to vteřiny čekání
           a odpověď se mezi dvěma kliky nemění. */
        var znamo = pamet[def.id];
        if (znamo === -1) { novaPamet[def.id] = -1; return Promise.resolve(null); }
        var poradi = (typeof znamo === 'number' && sluzby[znamo]) ? [znamo] : sluzby.map(function (_, i) { return i; });
        var i = 0;
        function dal() {
          if (i >= poradi.length) {
            novaPamet[def.id] = -1;
            return null;
          }
          var idx = poradi[i++];
          return zkus(zkusebniAdresa(sluzby[idx], stred.lat, stred.lng)).then(function (ok) {
            if (!ok) return dal();
            novaPamet[def.id] = idx;
            return { def: def, sluzba: sluzby[idx] };
          });
        }
        return Promise.resolve(dal()).then(function (v) {
          if (v && typeof naVrstvu === 'function') { try { naVrstvu(v); } catch (e) {} }
          return v;
        });
      })).then(function (vse) {
        doPameti(novaPamet);
        var ziva = vse.filter(Boolean);
        /* Které vrstvy neodpověděly. Bez toho vypadala nabídka náhodně:
           z pěti přepínačů se ukázal jeden a nikde nestálo, že ty
           ostatní jsme zkoušeli. Člověk pak neví, jestli územní plán
           neumíme, nebo jestli se právě něco pokazilo. */
        ziva.mrtve = defs.filter(function (def) {
          return !ziva.some(function (z) { return z.def.id === def.id; });
        }).map(function (def) { return def.nazev; });
        return ziva;
      });
    });
  }

  /** Z jednoho záznamu udělá vrstvu pro Leaflet. */
  function leafletVrstva(z, L) {
    L = L || global.L;
    if (!L) return null;
    var s = z.sluzba, d = z.def;
    /* `odPriblizeni` se dosud používalo jen ve chvíli zapnutí vrstvy —
       mapa se k němu přiblížila a tím to skončilo. Kdo pak mapu oddálil,
       posílal ČÚZK dotazy na dlaždice, které služba v tom měřítku
       stejně nekreslí, a dostával zpátky prázdno. Leaflet to umí sám:
       pod minZoom se vrstva nezobrazuje a o dlaždice si neřekne.
       Že je vrstva zapnutá, ale zrovna mimo dosah, řekne stránka pod
       mapou (js/pozemek.js) — tichý prázdný snímek vypadal rozbitě. */
    var nast = {
      opacity: typeof d.kryti === 'number' ? d.kryti : 1,
      attribution: d.uvedeni || '',
      maxZoom: 19,
      crossOrigin: false
    };
    if (d.odPriblizeni) nast.minZoom = d.odPriblizeni;
    if (s.typ === 'dlazdice') return L.tileLayer(s.url, nast);
    return L.tileLayer.wms(s.url, Object.assign({
      layers: s.vrstvy || '', format: s.format || 'image/png',
      transparent: true, version: '1.1.1', uppercase: true
    }, nast));
  }

  global.PK_VRSTVY = {
    nacti: nacti,
    pripravene: pripravene,
    leafletVrstva: leafletVrstva,
    legendaAdresa: legendaAdresa,
    // ——— švy pro testy ———
    _zkus: zkus,
    _bbox3857: bbox3857,
    _zkusebniAdresa: zkusebniAdresa,
    _zapomen: function () { nactene = null; try { sessionStorage.removeItem(PAMET); } catch (e) {} }
  };
})(window);
