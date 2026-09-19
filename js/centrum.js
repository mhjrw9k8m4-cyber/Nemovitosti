/* Centrum upozornění (upozorneni.html) — vykreslení a obsluha.
 *
 * Návrh vychází z toho, na čem se návody na upozornění shodují:
 *   - seznam musí jít přečíst za dvě vteřiny → kdo, co, kdy, hned nahoře,
 *   - seskupit podle času (dnes / tento týden / starší),
 *   - „označit vše jako přečtené" na dosah, ne schované v nabídce,
 *   - prázdný stav není chyba, ale příležitost něco nabídnout,
 *   - uživatel si musí umět druhy upozornění vypnout,
 *   - změny seznamu hlásit screen readerům přes aria-live="polite"
 *     (ne assertive — to je na chyby, ne na novinky).
 */
(function () {
  'use strict';
  var A = window.PKAuth, F = window.PKFeed;
  var root = document.getElementById('up-root');
  if (!root || !A || !F) return;

  var PREF = 'pk_up_prefs_v1';
  var filtr = 'vse';
  var seznam = [];
  var hledani = [];

  var ICO = {
    zprava: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    pozemky: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    prazdno: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
  };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  /* ---------- nastavení ---------- */
  function prefs() {
    try { return Object.assign({ zpravy: true, pozemky: true }, JSON.parse(localStorage.getItem(PREF) || '{}')); }
    catch (e) { return { zpravy: true, pozemky: true }; }
  }
  function ulozPrefs(p) { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch (e) {} }

  /* ---------- přihlášení ---------- */
  function vykresliPrihlaseni() {
    root.innerHTML =
      '<div class="up-card"><div class="up-empty">' + ICO.prazdno +
      '<b>Upozornění jsou soukromá</b>' +
      '<div>Přihlaste se a uvidíte zprávy i nové pozemky ze svého hlídání.</div>' +
      '<a class="up-a pri" href="zpravy.html">Přihlásit se</a>' +
      '</div></div>';
  }

  /* ---------- jedno upozornění ---------- */
  function vykresliPolozku(u) {
    var h = '<div class="up-item">' +
      '<div class="up-ico ' + u.druh + '">' + ICO[u.druh] + (u.nove ? '<span class="dot" aria-hidden="true"></span>' : '') + '</div>' +
      '<div class="up-main">' +
        '<div class="up-head"><span class="up-title">' + esc(u.titulek) + '</span>' +
          (u.cas ? '<span class="up-time">' + esc(F.relativniCas(u.cas, Date.now())) + '</span>' : '') + '</div>' +
        '<div class="up-where">' + esc(u.misto) + '</div>';
    if (u.ukazka) h += '<div class="up-quote">' + esc(u.ukazka) + '</div>';
    if (u.polozky && u.polozky.length) {
      h += '<ul class="up-list">';
      u.polozky.forEach(function (p) { h += '<li><span>' + esc(p.popis) + (p.druh ? ' — ' + esc(p.druh) : '') + '</span></li>'; });
      h += '</ul>';
      if (u.dalsich) h += '<div class="up-more">a ' + F.cislovka(u.dalsich, ['další', 'další', 'dalších']) + '…</div>';
    }
    h += '<div class="up-acts"><a class="up-a pri" href="' + esc(u.odkaz) + '">' + esc(u.odkazPopis) + '</a>';
    // Označit jako viděné jde jen u hlídání: u zpráv to udělá samo otevření
    // konverzace a dvě cesty k témuž by si mohly protiřečit.
    if (u.druh === 'pozemky') h += '<button class="up-a" type="button" data-videno="' + esc(u.hledaniId) + '">Označit jako viděné</button>';
    h += '</div></div></div>';
    return h;
  }

  /* ---------- celý seznam ---------- */
  function vykresli() {
    var p = prefs();
    var podlePrefs = seznam.filter(function (u) {
      return u.druh === 'zprava' ? p.zpravy : p.pozemky;
    });
    var c = F.pocty(podlePrefs);
    var videt = F.filtruj(podlePrefs, filtr === 'vse' ? null : (filtr === 'zpravy' ? 'zprava' : 'pozemky'));

    var h = '<div class="up-bar">' +
      '<div class="up-filters" role="group" aria-label="Filtr upozornění">' +
        tlacitkoFiltru('vse', 'Vše', c.celkem) +
        tlacitkoFiltru('zpravy', 'Zprávy', c.zpravy) +
        tlacitkoFiltru('pozemky', 'Pozemky', c.pozemky) +
      '</div>' +
      '<button class="up-clear" type="button" id="up-all"' + (c.pozemky ? '' : ' disabled') + '>Označit vše jako viděné</button>' +
    '</div>';

    if (!videt.length) {
      h += '<div class="up-card"><div class="up-empty">' + ICO.prazdno +
        (seznam.length
          ? '<b>Tady nic nového není</b><div>V jiné záložce možná ano — zkuste „Vše".</div>'
          : '<b>Máte hotovo</b><div>Nic nového nečeká. Jakmile vám někdo napíše nebo přibude pozemek, který sedí na vaše hlídání, najdete to tady.</div>' +
            '<a class="up-a" href="hlidani.html">Nastavit hlídání</a>') +
        '</div></div>';
    } else {
      F.seskupPodleCasu(videt, Date.now()).forEach(function (k) {
        h += '<div class="up-group">' + esc(k.nadpis) + '</div><div class="up-card">';
        k.polozky.forEach(function (u) { h += vykresliPolozku(u); });
        h += '</div>';
      });
    }

    h += '<div class="up-prefs">' +
      '<h2>Co mi ukazovat</h2>' +
      '<p>Platí jen pro tenhle prohlížeč. Nic se tím neruší — jen se to tu neukáže.</p>' +
      '<label class="up-sw"><input type="checkbox" id="pf-z"' + (p.zpravy ? ' checked' : '') + '> Zprávy od lidí</label>' +
      '<label class="up-sw"><input type="checkbox" id="pf-p"' + (p.pozemky ? ' checked' : '') + '> Nové pozemky z hlídání</label>' +
      '<div class="up-note">Upozornění tady uvidíte jen tehdy, když na web přijdete. ' +
        'Aby vás zastihla i jindy, je potřeba e-mail — ten se zapíná na stránce <a href="hlidani.html">Hlídání</a>.</div>' +
    '</div>';

    root.innerHTML = h;
    zapoj();
  }

  function tlacitkoFiltru(klic, popis, n) {
    return '<button class="up-f" type="button" data-f="' + klic + '" aria-pressed="' + (filtr === klic) + '">' +
      esc(popis) + (n ? '<span class="n">' + n + '</span>' : '') + '</button>';
  }

  function rekni(text) {
    var el = document.getElementById('up-live');
    if (el) el.textContent = text;
  }

  function zapoj() {
    root.querySelectorAll('[data-f]').forEach(function (b) {
      b.addEventListener('click', function () { filtr = b.getAttribute('data-f'); vykresli(); });
    });
    root.querySelectorAll('[data-videno]').forEach(function (b) {
      b.addEventListener('click', function () { oznacVideno([b.getAttribute('data-videno')]); });
    });
    var vse = document.getElementById('up-all');
    if (vse) vse.addEventListener('click', function () {
      oznacVideno(seznam.filter(function (u) { return u.druh === 'pozemky'; }).map(function (u) { return u.hledaniId; }));
    });
    var pz = document.getElementById('pf-z'), pp = document.getElementById('pf-p');
    if (pz) pz.addEventListener('change', function () { var p = prefs(); p.zpravy = pz.checked; ulozPrefs(p); vykresli(); });
    if (pp) pp.addEventListener('change', function () { var p = prefs(); p.pozemky = pp.checked; ulozPrefs(p); vykresli(); });
  }

  function oznacVideno(ids) {
    var cile = seznam.filter(function (u) { return u.druh === 'pozemky' && ids.indexOf(u.hledaniId) >= 0; });
    if (!cile.length) return;
    var kolik = cile.reduce(function (a, u) { return a + u.pocet; }, 0);
    // Seznam se upraví hned; kdyby server odmítl, další načtení to vrátí.
    Promise.all(cile.map(function (u) {
      return A.rpc('mark_search_seen', { p_id: u.hledaniId, p_keys: u.vsechnyKlice }, true);
    })).then(function () {
      seznam = seznam.filter(function (u) { return cile.indexOf(u) < 0; });
      vykresli();
      rekni(F.cislovka(kolik, ['pozemek označen', 'pozemky označeny', 'pozemků označeno']) + ' jako viděné.');
    });
  }

  /* ---------- načtení ---------- */
  function nacti() {
    Promise.all([
      A.rpc('my_threads', {}, true),
      A.rpc('my_searches', {}, true)
    ]).then(function (r) {
      var vlakna = (r[0] && r[0].ok && Array.isArray(r[0].data)) ? r[0].data : [];
      hledani = (r[1] && r[1].ok && Array.isArray(r[1].data)) ? r[1].data : [];
      if (!hledani.length) { seznam = F.sestav({ vlakna: vlakna, hledani: [], data: [] }); vykresli(); return; }
      // Soubor s pozemky se stahuje, jen když je s čím porovnávat.
      fetch('data/opportunities.json', { cache: 'default' })
        .then(function (x) { return x.ok ? x.json() : null; })
        .then(function (d) {
          seznam = F.sestav({ vlakna: vlakna, hledani: hledani, data: (d && d.opportunities) || [] });
          vykresli();
        })
        .catch(function () { seznam = F.sestav({ vlakna: vlakna, hledani: [], data: [] }); vykresli(); });
    });
  }

  function start() {
    if (!A.loggedIn()) { vykresliPrihlaseni(); return; }
    nacti();
  }

  if (!window.PK_SUPABASE_URL || !window.PK_SUPABASE_KEY) {
    root.innerHTML = '<div class="up-card"><div class="up-empty">Upozornění teď nejsou dostupná. Zkuste to prosím později.</div></div>';
    return;
  }
  if (A.keepAlive) A.keepAlive().then(start, start); else start();
})();
