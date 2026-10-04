/* Soukromá poznámka k pozemku.
 *
 * PROČ. Kdo si vybírá pozemek, obchází jich deset a po týdnu si
 * nepamatuje, který měl rozbitý plot a u kterého volal majitel zpátky.
 * Web zatím uměl pozemek jen uložit — tedy ANO/NE, bez jediného slova
 * proč. Poznámka je to, co si člověk stejně píše do mobilu, jen u toho
 * pozemku, ke kterému patří.
 *
 * ZŮSTÁVÁ V PROHLÍŽEČI, a je to tak schválně. Nikam se neodesílá,
 * nepotřebuje účet a nikdo jiný ji nevidí — ani my. Cenou je, že se
 * nepřenese do jiného telefonu; to je u poznámky poctivý obchod,
 * protože opačná volba znamená posílat nám soukromé věty o cizích
 * lidech („majitel vypadal divně") na server.
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

  function cti() {
    try {
      var z = JSON.parse(localStorage.getItem(KLIC) || '{}');
      return (z && typeof z === 'object' && !Array.isArray(z)) ? z : {};
    } catch (e) { return {}; }
  }
  function klicPozemku(d) {
    if (!d) return '';
    if (root.PKKlic && root.PKKlic.pkey) { try { return root.PKKlic.pkey(d); } catch (e) {} }
    return '';
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
    var k = klicPozemku(d);
    if (!k) return '';
    var z = cti()[k];
    return (z && typeof z.text === 'string') ? z.text : '';
  }
  /** Uloží (prázdný text poznámku smaže). Vrací true, když se to povedlo. */
  function uloz(d, novy) {
    var k = klicPozemku(d);
    if (!k) return false;
    var m = cti();
    var t = String(novy == null ? '' : novy).slice(0, ZNAKU);
    if (!t.trim()) delete m[k];
    else m[k] = { text: t, kdy: Date.now() };
    try {
      localStorage.setItem(KLIC, JSON.stringify(uklid(m)));
      return true;
    } catch (e) {
      /* Plná schránka. Tiché selhání by bylo nejhorší — člověk by psal
         do pole, které si nic nepamatuje. Volající to pozná podle
         false a řekne to. */
      return false;
    }
  }
  function vsechny() { return cti(); }
  function kolik() { return Object.keys(cti()).length; }

  root.PKPoznamky = { text: text, uloz: uloz, vsechny: vsechny, kolik: kolik,
    KLIC: KLIC, STROP: STROP, ZNAKU: ZNAKU };
}(typeof window !== 'undefined' ? window : globalThis));
