// Parcelka — vlastní hezký rozbalovací seznam (místo ošklivého systémového na iPhonu)
// + rychlé volby (chips) u ceny a výměry. Panel se pozicuje vůči obrazovce (fixed),
// takže ho karta neořízne a jde s ním normálně scrollovat.
(function () {
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    var opened = null;
    function close() {
      if (!opened) return;
      opened.panel.style.display = 'none';
      opened.root.classList.remove('open');
      opened.btn.setAttribute('aria-expanded', 'false');
      opened = null;
    }
    document.addEventListener('click', function (e) {
      if (opened && !opened.root.contains(e.target) && !opened.panel.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    window.addEventListener('scroll', function () { if (opened) close(); }, true);
    window.addEventListener('resize', function () { if (opened) close(); });

    Array.prototype.forEach.call(document.querySelectorAll('select.map-select'), enhance);
    Array.prototype.forEach.call(document.querySelectorAll('.mc-chips'), wireChips);

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
      panel.style.display = 'none';
      document.body.appendChild(panel); // do body → karta ho neořízne

      function buildOptions() {
        panel.innerHTML = '';
        Array.prototype.forEach.call(sel.options, function (o) {
          var it = document.createElement('button');
          it.type = 'button'; it.className = 'cdd-opt'; it.setAttribute('role', 'option');
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
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (opened && opened.root === root) { close(); return; }
        close(); buildOptions(); syncLabel();
        panel.style.display = 'block'; place(btn, panel);
        root.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
        opened = { root: root, btn: btn, panel: panel };
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

    // Rychlé volby u ceny/výměry — klepnutím doplní číslo do políčka.
    function wireChips(box) {
      var input = document.getElementById(box.getAttribute('data-chips'));
      if (!input) return;
      function refresh() {
        Array.prototype.forEach.call(box.children, function (b) {
          b.classList.toggle('on', String(input.value) === b.getAttribute('data-v'));
        });
      }
      Array.prototype.forEach.call(box.children, function (b) {
        b.addEventListener('click', function () {
          input.value = b.getAttribute('data-v');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          refresh();
        });
      });
      input.addEventListener('input', refresh);
      input.addEventListener('pk-reset', refresh);
      refresh();
    }
  });
})();
