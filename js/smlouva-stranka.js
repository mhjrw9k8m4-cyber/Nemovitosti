/* Stránka „Podklad pro kupní smlouvu" — obsluha formuláře.
 *
 * Vlastní skládání textu je v js/smlouva.js, které o stránce nic neví a
 * dá se zkoušet bez prohlížeče. Tady je jen to, co se bez prohlížeče
 * zkoušet nedá: čtení polí, překreslování a stahování.
 *
 * NIC SE NIKAM NEODESÍLÁ A NIC SE NEUKLÁDÁ. Jména, data narození a
 * adresy jsou to nejcitlivější, co kdy někdo do tohohle webu napíše.
 * Proto se nedrží ani v prohlížeči: po zavření stránky jsou pryč.
 * Je to nepohodlné — kdo si stránku omylem obnoví, píše znovu — a je
 * to ta správná volba: web, který si rodná data schová „pro pohodlí",
 * si je schová i pro případ, že se mu někdo podívá do localStorage.
 * Proto na stránce „Moje data" tenhle formulář žádný řádek nemá:
 * není co mazat.
 */
(function () {
  'use strict';
  var S = window.PKSmlouva;
  if (!S) return;

  var f = document.getElementById('sml-form');
  if (!f) return;

  var vystup = document.getElementById('sml-vystup');
  var pocetStran = { prodavajici: 1, kupujici: 1 };

  function pole(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function zaskrtnuto(id) { var e = document.getElementById(id); return !!(e && e.checked); }

  function osoby(kdo) {
    var out = [];
    for (var i = 1; i <= pocetStran[kdo]; i++) {
      var jm = pole('sml-' + kdo + '-jmeno-' + i);
      var nar = pole('sml-' + kdo + '-narozeni-' + i);
      var ad = pole('sml-' + kdo + '-adresa-' + i);
      /* Prázdný druhý blok se nepočítá — kdo ho otevřel a nevyplnil,
         nemá za to dostat výtku „chybí jméno u strany č. 2". */
      if (!jm && !nar && !ad && i > 1) continue;
      out.push({ jmeno: jm, narozeni: nar, adresa: ad });
    }
    return out;
  }

  function data() {
    return {
      prodavajici: osoby('prodavajici'),
      kupujici: osoby('kupujici'),
      pozemek: {
        parcela: pole('sml-parcela'), katastr: pole('sml-katastr'),
        kodKatastru: pole('sml-kod-ku'), obec: pole('sml-obec'),
        lv: pole('sml-lv'), vymera: pole('sml-vymera'),
        druh: pole('sml-druh'), podil: pole('sml-podil'),
      },
      cena: { castka: pole('sml-cena'), zaloha: pole('sml-zaloha'), zpusob: pole('sml-zpusob') },
      stav: {
        zastava: zaskrtnuto('sml-zastava'), bremeno: zaskrtnuto('sml-bremeno'),
        najem: zaskrtnuto('sml-najem'), popisVad: pole('sml-vady'),
      },
    };
  }

  function text(s) { return document.createTextNode(s); }
  function prvek(tag, trida, obsah) {
    var e = document.createElement(tag);
    if (trida) e.className = trida;
    if (obsah != null) e.appendChild(text(obsah));
    return e;
  }

  /* Vkládá se přes textContent a createElement, ne přes innerHTML:
     do polí píše člověk cokoli a jeho text se vrací na stránku. */
  function prekresli() {
    var d = data();
    vystup.textContent = '';

    var chyby = S.zkontroluj(d);
    var podstatne = chyby.filter(function (x) { return x.pole !== 'lv' && x.pole !== 'podil'; });

    if (podstatne.length) {
      var k = prvek('div', 'sml-karta sml-chyby');
      k.appendChild(prvek('h3', null, 'Ještě to nejde sestavit'));
      k.appendChild(prvek('p', 'sml-lead', 'Podklad s prázdnými místy by vypadal hotově, a podle takového papíru se podepisuje. Chybí:'));
      var ul = prvek('ul', 'sml-seznam');
      podstatne.forEach(function (c) { ul.appendChild(prvek('li', null, c.zprava)); });
      k.appendChild(ul);
      vystup.appendChild(k);
      return;
    }

    var t = S.smlouva(d);
    if (!t) return;

    /* 1) Text podkladu */
    var k1 = prvek('div', 'sml-karta');
    k1.appendChild(prvek('h3', null, 'Podklad pro advokáta'));
    var pre = prvek('pre', 'sml-text');
    pre.appendChild(text(t));
    k1.appendChild(pre);
    var akce = prvek('div', 'sml-akce');
    var bKopie = prvek('button', 'btn-secondary', 'Zkopírovat');
    bKopie.type = 'button';
    bKopie.addEventListener('click', function () {
      var hotovo = function () { bKopie.textContent = 'Zkopírováno'; setTimeout(function () { bKopie.textContent = 'Zkopírovat'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(hotovo, function () {});
      else { var s = window.getSelection(); var r = document.createRange(); r.selectNodeContents(pre); s.removeAllRanges(); s.addRange(r); }
    });
    var bStah = prvek('a', 'btn-secondary', 'Stáhnout jako text');
    /* Soubor se skládá v prohlížeči, nikam se pro něj nechodí. */
    bStah.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(t);
    bStah.setAttribute('download', 'podklad-kupni-smlouva.txt');
    var bTisk = prvek('button', 'btn-secondary', 'Vytisknout');
    bTisk.type = 'button';
    bTisk.addEventListener('click', function () { window.print(); });
    akce.appendChild(bKopie); akce.appendChild(bStah); akce.appendChild(bTisk);
    k1.appendChild(akce);
    vystup.appendChild(k1);

    /* 2) Hodnoty do úředního formuláře */
    var k2 = prvek('div', 'sml-karta');
    k2.appendChild(prvek('h3', null, 'Co napsat do návrhu na vklad'));
    var p2 = prvek('p', 'sml-lead');
    p2.appendChild(text('Návrh na vklad se podává na formuláři, který vydává ČÚZK — jiné podání katastrální úřad odmítne. Vlastní papír tedy nevyrábíme; tady jsou hodnoty, které se do kolonek opisují. Formulář je na '));
    var a2 = prvek('a', null, 'cuzk.gov.cz');
    a2.href = 'https://www.cuzk.gov.cz/Katastr-nemovitosti/Formulare.aspx';
    a2.target = '_blank'; a2.rel = 'noopener';
    p2.appendChild(a2); p2.appendChild(text('.'));
    k2.appendChild(p2);
    var tb = prvek('table', 'sml-tabulka');
    var tbody = document.createElement('tbody');
    (S.navrhNaVklad(d) || []).forEach(function (r) {
      var tr = document.createElement('tr');
      tr.appendChild(prvek('th', null, r.kolonka));
      tr.appendChild(prvek('td', null, r.hodnota));
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody);
    k2.appendChild(tb);
    vystup.appendChild(k2);

    /* 3) Kontrolní seznam */
    var k3 = prvek('div', 'sml-karta');
    k3.appendChild(prvek('h3', null, 'Co si ověřit, než podepíšete'));
    var ol = prvek('ol', 'sml-kontrola');
    S.kontrolniSeznam(d).forEach(function (x) {
      var li = document.createElement('li');
      li.appendChild(prvek('b', null, x.co));
      li.appendChild(prvek('span', 'sml-proc', x.proc));
      if (x.kde) {
        var a = prvek('a', 'sml-kde', x.kde.indexOf('.html') > 0 ? 'Otevřít návod' : x.kde);
        a.href = x.kde.indexOf('.html') > 0 ? x.kde : 'https://' + x.kde;
        if (x.kde.indexOf('.html') < 0) { a.target = '_blank'; a.rel = 'noopener'; }
        li.appendChild(a);
      }
      ol.appendChild(li);
    });
    k3.appendChild(ol);
    vystup.appendChild(k3);
  }

  /* Druhá strana se přidává, ne že by tam osiřele stála předem. */
  function pridej(kdo) {
    if (pocetStran[kdo] >= 2) return;
    pocetStran[kdo] = 2;
    var misto = document.getElementById('sml-' + kdo + '-dalsi');
    if (!misto) return;
    misto.hidden = false;
    var b = document.getElementById('sml-' + kdo + '-pridat');
    if (b) b.hidden = true;
    var prvni = misto.querySelector('input');
    if (prvni) prvni.focus();
    prekresli();
  }
  ['prodavajici', 'kupujici'].forEach(function (kdo) {
    var b = document.getElementById('sml-' + kdo + '-pridat');
    if (b) b.addEventListener('click', function () { pridej(kdo); });
  });

  /* Předvyplnění ze stránky pozemku. Jen údaje o pozemku a cena —
     nikdy nic o lidech. */
  (function predvypln() {
    var q = new URLSearchParams(location.search);
    var mapa = { parcela: 'sml-parcela', katastr: 'sml-katastr', obec: 'sml-obec',
                 vymera: 'sml-vymera', druh: 'sml-druh', cena: 'sml-cena', lv: 'sml-lv' };
    var neco = false;
    Object.keys(mapa).forEach(function (k) {
      var v = q.get(k);
      if (!v) return;
      var e = document.getElementById(mapa[k]);
      if (!e) return;
      /* Cena přijde v odkazu jako holé číslo (450000). Do pole se píše
         tak, jak ji člověk čte — po tisících. Modul si ji přečte tak
         i tak, tohle je jen proto, aby se v devíti číslicích nemusel
         nikdo počítat prstem. */
      e.value = (k === 'cena' || k === 'vymera') && S.cislo(v) != null ? S.mezery(S.cislo(v)) : v;
      neco = true;
    });
    if (neco) {
      var z = document.getElementById('sml-predvyplneno');
      if (z) z.hidden = false;
    }
  }());

  f.addEventListener('input', prekresli);
  f.addEventListener('change', prekresli);
  prekresli();
}());
