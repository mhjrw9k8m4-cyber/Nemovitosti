/* Měření lepivé hlavičky přímo na zařízení, kde zlobí.
 *
 * Hlášení „nad hlavičkou je při rolování mezera" se nedá ověřit na počítači:
 * Chromium i Firefox hlavičku drží na nule, takže se dvakrát po sobě opravilo
 * něco, co nebylo příčinou. Tohle měří tam, kde se to děje — během rolování
 * sleduje, jak daleko od horního okraje hlavička je, a pamatuje si nejhorší
 * hodnotu. K tomu vypíše všechno, co u lepivých prvků bývá příčinou:
 * ořezávající, posunutý nebo filtrovaný rodič, hlavička jako položka flexu,
 * plovoucí lišta prohlížeče.
 *
 * Nenačítá se běžným návštěvníkům. Spustí se jen s „?mereni" v adrese:
 *   https://www.parcelaka.cz/index.html?mereni=1
 */
(function () {
  'use strict';
  if (location.search.indexOf('mereni') === -1 && location.hash.indexOf('mereni') === -1) return;

  var h = document.querySelector('header');
  var panel = document.createElement('div');
  panel.id = 'pk-mereni-hlavicky';
  panel.setAttribute('style', [
    'position:fixed', 'left:8px', 'right:8px', 'bottom:8px', 'z-index:99999',
    'background:#0B1410', 'color:#EAEEE9', 'border:1px solid #3D6B52', 'border-radius:12px',
    'padding:12px 14px', 'font:12px/1.5 ui-monospace,Menlo,Consolas,monospace',
    'max-height:56vh', 'overflow:auto', '-webkit-overflow-scrolling:touch',
    'box-shadow:0 10px 30px rgba(0,0,0,0.5)'
  ].join(';'));
  // Skript se načítá až po zbytku stránky, takže DOMContentLoaded už mohlo
  // dávno proběhnout — čekat na něj by znamenalo nezobrazit vůbec nic.
  function pripoj() { if (document.body && !panel.parentNode) document.body.appendChild(panel); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pripoj);
  else pripoj();

  var nejhorsi = 0, nejhorsiScroll = 0, mereni = 0;

  function podezreliRodice() {
    var ven = [];
    if (!h) return ven;
    for (var el = h.parentElement; el; el = el.parentElement) {
      var c = getComputedStyle(el), duvody = [];
      if (c.overflow !== 'visible' || c.overflowX !== 'visible' || c.overflowY !== 'visible') duvody.push('overflow ' + c.overflowX + '/' + c.overflowY);
      if (c.transform && c.transform !== 'none') duvody.push('transform');
      if (c.filter && c.filter !== 'none') duvody.push('filter');
      if (c.perspective && c.perspective !== 'none') duvody.push('perspective');
      if (c.contain && c.contain !== 'none') duvody.push('contain ' + c.contain);
      if (c.display === 'flex' || c.display === 'grid') duvody.push(c.display + ' → hlavička je jeho položka');
      if (duvody.length) ven.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ': ' + duvody.join(', '));
    }
    return ven;
  }

  function vypis() {
    if (!h) { panel.textContent = 'Na téhle stránce žádná hlavička není.'; return; }
    var r = h.getBoundingClientRect(), c = getComputedStyle(h), vv = window.visualViewport;
    var rodice = podezreliRodice();
    var css = document.querySelector('link[href*="css/styles.css"]');
    var zle = nejhorsi > 2;
    panel.innerHTML =
      '<div style="font-size:14px;font-weight:700;color:' + (zle ? '#FF9B7A' : '#9BE3B4') + '">' +
        (zle ? 'MEZERA NAD HLAVIČKOU: ' + Math.round(nejhorsi) + ' px' : 'Hlavička drží u okraje (0 px)') +
      '</div>' +
      '<div>měřeno ' + mereni + '× při rolování' + (zle ? ', nejhůř po odrolování ' + Math.round(nejhorsiScroll) + ' px' : '') + '</div>' +
      '<div>teď: ' + Math.round(r.top) + ' px od okraje · vysoká ' + Math.round(r.height) + ' px · odrolováno ' + Math.round(window.scrollY) + ' px</div>' +
      '<div>hlavička: ' + c.position + ', top ' + c.top + ', transform ' + (c.transform === 'none' ? 'žádný' : 'ANO') +
        ', rozmazání ' + ((c.backdropFilter && c.backdropFilter !== 'none') ? 'ANO' : 'žádné') + '</div>' +
      '<div>rodiče: ' + (rodice.length ? rodice.join(' | ') : 'nic neořezává ani neposouvá') + '</div>' +
      '<div>okno: ' + window.innerHeight + ' px' + (vv ? ' · viditelné ' + Math.round(vv.height) + ' px · posun shora ' +
        Math.round(vv.offsetTop) + ' px · přiblížení ' + (Math.round(vv.scale * 100) / 100) : ' · bez visualViewport') + '</div>' +
      '<div>styly: ' + (css ? css.getAttribute('href') : '?') + (navigator.standalone ? ' · z plochy' : '') + '</div>' +
      '<div style="opacity:.7">' + navigator.userAgent + '</div>';
  }

  function zmer() {
    if (!h) return;
    var t = h.getBoundingClientRect().top;
    mereni++;
    if (t > nejhorsi) { nejhorsi = t; nejhorsiScroll = window.scrollY; }
    vypis();
  }
  window.addEventListener('scroll', zmer, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', zmer);
    window.visualViewport.addEventListener('scroll', zmer);
  }
  function start() { h = h || document.querySelector('header'); pripoj(); vypis(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  setInterval(zmer, 1000);
})();
