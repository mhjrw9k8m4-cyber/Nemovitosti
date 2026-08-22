// Parcelka — vlastní hezký rozbalovací seznam místo ošklivého systémového
// (na iPhonu vyskakoval nevzhledný nativní výběr). Původní <select> zůstává
// skrytý jako „zdroj pravdy", takže veškerá logika mapy funguje beze změny.
(function () {
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    var opened = null;
    function close() {
      if (!opened) return;
      opened.root.classList.remove('open');
      opened.btn.setAttribute('aria-expanded', 'false');
      opened = null;
    }
    document.addEventListener('click', function (e) { if (opened && !opened.root.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    Array.prototype.forEach.call(document.querySelectorAll('select.map-select'), enhance);

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
      root.appendChild(panel);

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
        root.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
        opened = { root: root, btn: btn };
      });

      // Když se hodnota nastaví z kódu (např. řazení „Nejblíž ke mně"), aktualizuj popisek.
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
      // Když se doplní volby za běhu (druh pozemku), přestav seznam.
      try { new MutationObserver(function () { if (opened && opened.root === root) buildOptions(); syncLabel(); }).observe(sel, { childList: true }); } catch (e) {}
      sel.addEventListener('change', syncLabel);

      buildOptions(); syncLabel();
    }
  });
})();
