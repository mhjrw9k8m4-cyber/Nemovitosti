/* Stránka „Moje data" — vypíše, co si web v prohlížeči pamatuje,
 * a nechá to smazat.
 *
 * Seznam klíčů i jejich popisy jsou v js/ulozene.js; tenhle soubor je
 * jen zobrazení a mazání. Kdyby se popisy psaly tady, rozešly by se
 * s tím, co kód doopravdy ukládá — a stránka o soukromí, která lže,
 * je horší než žádná.
 *
 * MAŽE SE PO SKUPINÁCH I PO JEDNOM, a vždycky až po potvrzení: smazání
 * je nevratné a „uložené pozemky" můžou být práce několika večerů.
 */
(function (root) {
  'use strict';
  var U = root.PKUlozene;
  var host = document.getElementById('md-obsah');
  if (!U || !host) return;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function velikost(b) {
    if (b < 1024) return b + ' B';
    return (b / 1024).toFixed(b < 10240 ? 1 : 0).replace('.', ',') + ' kB';
  }

  function vykresli() {
    var stav = U.stav();
    if (!stav.length) {
      host.innerHTML = '<div class="md-prazdno"><h2>Zatím tu nic není</h2>' +
        '<p>Parcelka si o vás v tomhle prohlížeči nic nepamatuje. ' +
        'Jakmile si uložíte pozemek nebo něco nastavíte, objeví se to tady.</p></div>';
      return;
    }
    var celkem = stav.reduce(function (s, x) { return s + x.bajtu; }, 0);
    var html = '';
    U.SKUPINY.forEach(function (sk) {
      var moje = stav.filter(function (x) { return x.def.skupina === sk.id; });
      if (!moje.length) return;
      html += '<section class="md-skup">' +
        '<div class="md-skup-h"><h2>' + esc(sk.nazev) + '</h2>' +
          (sk.id === 'ucet' ? '' :
            '<button type="button" class="md-smaz-skup" data-skup="' + esc(sk.id) + '">Smazat vše z této části</button>') +
        '</div>' +
        (sk.popis ? '<p class="md-skup-p">' + esc(sk.popis) + '</p>' : '');
      moje.forEach(function (x) {
        var pocet = (x.pocet != null && x.def.jednotka)
          ? '<b>' + x.pocet + '</b> ' + esc(U.tvar(x.pocet, x.def.jednotka)) : '';
        html += '<div class="md-radek">' +
          '<div class="md-r-text"><b>' + esc(x.def.nazev) + '</b>' +
            '<span>' + esc(x.def.popis) + '</span>' +
            '<i class="md-r-kolik">' + (pocet ? pocet + ' · ' : '') + velikost(x.bajtu) +
              (x.def.kde === 'session' ? ' · zmizí po zavření prohlížeče' : '') + '</i>' +
          '</div>' +
          '<button type="button" class="md-smaz" data-klic="' + esc(x.def.klic) + '" ' +
            'aria-label="Smazat: ' + esc(x.def.nazev) + '">Smazat</button>' +
        '</div>';
      });
      html += '</section>';
    });
    html += '<section class="md-vse">' +
      '<p>Dohromady je to <b>' + velikost(celkem) + '</b> v ' + stav.length + ' položkách.</p>' +
      '<button type="button" class="md-smaz-vse" id="md-smaz-vse">Smazat úplně všechno</button>' +
      /* Co tahle stránka NEUMÍ, musí být napsané. Slíbit „smazáno" a nechat
         přitom data na serveru by bylo horší než mlčet. */
      '<p class="md-pozn">Tohle maže jen to, co je ve vašem prohlížeči. Co je na vašem ' +
        '<b>účtu</b> — uložená hledání, zprávy a vaše inzeráty — leží v databázi a maže se ' +
        'tam, kde se spravuje: <a href="hlidani.html">Hlídání</a>, ' +
        '<a href="zpravy.html">Zprávy</a>, <a href="muj-inzerat.html">Moje inzeráty</a>.</p>' +
    '</section>';
    host.innerHTML = html;
  }

  function hlaska(t) {
    var el = document.createElement('p');
    el.className = 'md-hotovo';
    el.setAttribute('role', 'status');
    el.textContent = t;
    host.insertBefore(el, host.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
  }

  host.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    if (b.classList.contains('md-smaz')) {
      var k = b.getAttribute('data-klic');
      var def = U.KLICE.filter(function (x) { return x.klic === k; })[0];
      if (!confirm('Smazat „' + (def ? def.nazev : k) + '"? Zpátky to nejde.')) return;
      U.smaz(k);
      vykresli();
      hlaska('Smazáno: ' + (def ? def.nazev : k));
    } else if (b.classList.contains('md-smaz-skup')) {
      var id = b.getAttribute('data-skup');
      var sk = U.SKUPINY.filter(function (x) { return x.id === id; })[0];
      if (!confirm('Smazat celou část „' + (sk ? sk.nazev : id) + '"? Zpátky to nejde.')) return;
      var n = U.smazSkupinu(id);
      vykresli();
      hlaska('Smazáno položek: ' + n);
    } else if (b.id === 'md-smaz-vse') {
      if (!confirm('Smazat opravdu všechno, co si web v tomhle prohlížeči pamatuje? '
        + 'Včetně uložených pozemků a poznámek. Zpátky to nejde.')) return;
      var celkem = 0;
      U.SKUPINY.forEach(function (s) { celkem += U.smazSkupinu(s.id); });
      vykresli();
      hlaska('Smazáno položek: ' + celkem);
    }
  });

  vykresli();
}(typeof window !== 'undefined' ? window : globalThis));
