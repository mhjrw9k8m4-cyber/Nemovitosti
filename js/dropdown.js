// Parcelka — vlastní hezký rozbalovací seznam (místo ošklivého systémového na iPhonu).
// Panel se pozicuje vůči obrazovce (fixed), takže ho karta neořízne a jde s ním
// normálně scrollovat.
(function () {
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    var opened = null, poradiPanelu = 0;
    function close(vratFokus) {
      if (!opened) return;
      var btn = opened.btn;
      opened.panel.style.display = 'none';
      opened.root.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      opened = null;
      // Po zavření klávesou musí fokus skončit na tlačítku, jinak spadne na
      // začátek stránky a člověk neví, kde je.
      if (vratFokus) { try { btn.focus(); } catch (e) {} }
    }
    document.addEventListener('click', function (e) {
      if (opened && !opened.root.contains(e.target) && !opened.panel.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(true); });
    /* Zavřít při rolování STRÁNKY ano — panel je připíchnutý na pevné
       souřadnice a s obsahem by se rozešel. Ale panel sám se roluje
       (má max-height a víc voleb, než se do ní vejde), a tenhle posluchač
       bral i jeho rolování: kdo chtěl dolistovat ke spodním volbám, tomu se
       seznam zavřel pod rukama. Změřeno u řazení — 419 px obsahu do 278 px
       okna, takže poslední čtyři volby nešly vybrat vůbec: ani rolováním,
       ani klávesou (tu rozbalovač neměl). Rolování uvnitř panelu se proto
       přeskakuje. */
    /* KDY ČLOVĚK NAPOSLEDY SÁHL NA ROLOVÁNÍ. Kolečko, prst, klávesa —
       nic jiného rolování z vlastní vůle nezačne. Programové rolování
       (scrollIntoView po klepnutí na odkaz) ani dojíždějící setrvačnost
       žádný takový vstup nemají, a právě v tom je rozdíl, na kterém tady
       všechno stojí. */
    var poslVstup = 0;
    ['wheel', 'touchmove', 'keydown'].forEach(function (u) {
      window.addEventListener(u, function () { poslVstup = Date.now(); }, { passive: true, capture: true });
    });
    window.addEventListener('scroll', function (e) {
      if (!opened) return;
      var t = e.target;
      if (t === opened.panel || (t && t.nodeType === 1 && opened.panel.contains(t))) return;
      /* Rolování, které už BĚŽELO, když se seznam otevřel, ho nesmí hned
         zavřít. Stránka má scroll-behavior:smooth a na telefonu dojíždí
         setrvačnost, takže kdo klepne na rozbalovač chvíli po klepnutí na
         odkaz nebo po švihnutí prstem, viděl, jak se seznam otevře a v tomtéž
         okamžiku zase zmizí — zvenčí to vypadá, že tlačítko nefunguje.
         Po tu dobu se panel jen posouvá za svým tlačítkem.

         ROZHODUJE VSTUP, NE HODINY. Stálo tu „400 ms od otevření" a byl to
         dohad — délku plynulého rolování si prohlížeč řídí podle vzdálenosti.
         Změřeno na úvodní stránce: události chodily ještě 355 až 426 ms po
         klepnutí, tedy přesně na hranici, takže se seznam zavíral asi
         v každém druhém případě. Ani „počkat, než události přestanou
         chodit" nestačilo: stačí jedno vynechané překreslení a mezera mezi
         dvěma událostmi tu lhůtu přeskočí.
         Vstup je na to jistý znak: rolování, které začalo DŘÍV než se
         seznam otevřel, člověk potvrdit nemohl — tak ho panel jen
         doprovází. Jakmile sáhne na kolečko nebo na obrazovku POTOM,
         zavírá se, a je jedno, jak dlouho už to jede. */
      if (poslVstup <= opened.kdy) { opened.presun(); return; }
      close();
    }, true);
    window.addEventListener('resize', function () { if (opened) close(); });

    Array.prototype.forEach.call(document.querySelectorAll('select.map-select'), enhance);

    function place(btn, panel) {
      var r = btn.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, MAXH = 280;
      panel.style.width = r.width + 'px';
      panel.style.left = Math.max(8, Math.min(r.left, vw - r.width - 8)) + 'px';
      var below = vh - r.bottom - 10, above = r.top - 10;
      if (below >= 170 || below >= above) {
        panel.style.top = (r.bottom + 6) + 'px'; panel.style.bottom = 'auto';
        panel.style.maxHeight = Math.min(MAXH, Math.max(120, below)) + 'px';
      } else {
        panel.style.bottom = (vh - r.top + 6) + 'px'; panel.style.top = 'auto';
        panel.style.maxHeight = Math.min(MAXH, Math.max(120, above)) + 'px';
      }
    }

    function enhance(sel) {
      var root = document.createElement('div'); root.className = 'cdd';
      sel.parentNode.insertBefore(root, sel);
      root.appendChild(sel);
      sel.classList.add('cdd-native'); sel.setAttribute('tabindex', '-1'); sel.setAttribute('aria-hidden', 'true');

      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'map-select cdd-btn';
      btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
      if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
      var lbl = document.createElement('span'); lbl.className = 'cdd-lbl'; btn.appendChild(lbl);
      root.appendChild(btn);

      var panel = document.createElement('div'); panel.className = 'cdd-panel'; panel.setAttribute('role', 'listbox');
      panel.id = 'cdd-panel-' + (++poradiPanelu);
      btn.setAttribute('aria-controls', panel.id);
      panel.style.display = 'none';
      document.body.appendChild(panel); // do body → karta ho neořízne

      function buildOptions() {
        panel.innerHTML = '';
        Array.prototype.forEach.call(sel.options, function (o) {
          /* Dřív to byly <button>. role="option" na tlačítku přebije jeho
             vlastní roli, takže odečítač obrazovky ohlásil volbu, ale přišel
             o to, že se dá stisknout — a stisk stejně nikdo neobsluhoval.
             Teď je to div s role="option", fokus se po něm posouvá
             klávesami a Enter i mezerník volbu vyberou. */
          var it = document.createElement('div');
          it.className = 'cdd-opt'; it.setAttribute('role', 'option');
          it.tabIndex = -1;
          it.setAttribute('data-value', o.value); it.textContent = o.textContent;
          if (o.value === sel.value) { it.classList.add('sel'); it.setAttribute('aria-selected', 'true'); }
          it.addEventListener('click', function (e) { e.stopPropagation(); pick(o.value); });
          panel.appendChild(it);
        });
      }
      function syncLabel() {
        var o = sel.options[sel.selectedIndex];
        lbl.textContent = o ? o.textContent : '';
        Array.prototype.forEach.call(panel.children, function (it) {
          var on = it.getAttribute('data-value') === sel.value;
          it.classList.toggle('sel', on); it.setAttribute('aria-selected', on ? 'true' : 'false');
        });
      }
      function pick(v) {
        if (sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        syncLabel(); close(); try { btn.focus(); } catch (e) {}
      }
      function volby() { return Array.prototype.slice.call(panel.children); }
      function zamer(i) {
        var v = volby(); if (!v.length) return;
        if (i < 0) i = v.length - 1; else if (i >= v.length) i = 0;
        var it = v[i];
        /* preventScroll a dorolování ručně: kdyby fokus odroloval STRÁNKU,
           zavřel by si panel sám (rolování stránky ho zavírá, a správně —
           panel je připíchnutý na pevné souřadnice). Uvnitř panelu se tedy
           posouváme sami. */
        try { it.focus({ preventScroll: true }); } catch (e) { try { it.focus(); } catch (e2) {} }
        var horni = it.offsetTop - panel.clientTop;
        var dolni = horni + it.offsetHeight;
        if (horni < panel.scrollTop) panel.scrollTop = horni - 6;
        else if (dolni > panel.scrollTop + panel.clientHeight) panel.scrollTop = dolni - panel.clientHeight + 6;
      }
      /* Klávesy v rozbaleném seznamu. Bez nich se sem fokus nedostal vůbec:
         panel visí na konci <body>, takže tabulátorem byl až za celou
         stránkou, a šipky nic nedělaly. Kdo nepoužívá myš, neměl jak volbu
         vybrat. */
      panel.addEventListener('keydown', function (e) {
        var v = volby(), i = v.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); zamer(i + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); zamer(i - 1); }
        else if (e.key === 'Home') { e.preventDefault(); zamer(0); }
        else if (e.key === 'End') { e.preventDefault(); zamer(v.length - 1); }
        else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          if (i >= 0) pick(v[i].getAttribute('data-value'));
        } else if (e.key === 'Tab') { close(true); }
      });
      // Šipka na zavřeném tlačítku seznam rozbalí — tak se to u rozbalovačů čeká.
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        if (opened && opened.root === root) return;
        e.preventDefault(); otevri();
      });
      function otevri() {
        close(); buildOptions(); syncLabel();
        panel.style.display = 'block'; place(btn, panel);
        root.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
        opened = { root: root, btn: btn, panel: panel, kdy: Date.now(),
          presun: function () { place(btn, panel); } };
        /* Fokus na vybranou volbu: odtud jdou šipky nahoru i dolů a odečítač
           obrazovky přečte, co je právě zvolené. Zároveň se tím panel
           odroluje tak, aby ta volba byla vidět. */
        var v = volby();
        var kde = 0;
        for (var i = 0; i < v.length; i++) if (v[i].getAttribute('data-value') === sel.value) { kde = i; break; }
        zamer(kde);
      }
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (opened && opened.root === root) { close(); return; }
        otevri();
      });

      try {
        var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        if (desc && desc.get && desc.set) {
          Object.defineProperty(sel, 'value', {
            get: function () { return desc.get.call(sel); },
            set: function (v) { desc.set.call(sel, v); syncLabel(); },
            configurable: true
          });
        }
      } catch (e) {}
      try { new MutationObserver(function () { if (opened && opened.root === root) { buildOptions(); place(btn, panel); } syncLabel(); }).observe(sel, { childList: true }); } catch (e) {}
      sel.addEventListener('change', syncLabel);
      buildOptions(); syncLabel();
    }

  });
})();
