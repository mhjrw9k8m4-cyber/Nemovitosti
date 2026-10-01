/* Obsah dlouhého rádce — svislý seznam oddílů vedle sazby.
 *
 * Proč vznikl: rádcovské stránky mají čtecí sloupec 656 px na obrazovce
 * široké 1280. To je na čtení správná míra, jenže po stranách zbývá přes
 * 500 px prázdna — naměřeno na čtrnácti stránkách, všechny stejně. Vedle
 * sazby dosud stálo jediné: pořadové číslo oddílu. Zpětná vazba zněla
 * „spousta prázdných míst a zároveň přeplácané"; tohle je ta první půlka.
 *
 * Obsah je zároveň to, co dlouhému textu chybělo nejvíc: články mají šest
 * až devět oddílů a nedalo se v nich přeskakovat.
 *
 * Co se tu NEDĚLÁ: nic se nepřepisuje. Značky stránky zůstávají, jak jsou,
 * přibyde jediný prvek navíc. Bez skriptu stránka vypadá a funguje přesně
 * jako dosud — proto je obsah stavěný tady a ne v generátoru: je to
 * navigace, ne obsah, a stránky rádců musí dávat smysl i bez JavaScriptu.
 *
 * Čísla se NEPOČÍTAJÍ znovu: v sazbě je dělá CSS (counter pk-oddil) a dvě
 * nezávislá počítadla se dřív nebo později rozejdou. Bere se pořadí oddílu
 * v téže sekci, tedy přesně to, co počítá i prohlížeč.
 */
(function () {
  'use strict';

  function slug(text, i) {
    var z = String(text || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return 'oddil-' + (i + 1) + (z ? '-' + z.slice(0, 40) : '');
  }

  function postav() {
    /* Sekce, ve které běží číslování, je i tou, ve které má obsah smysl:
       článek bývá rozdělený do dvou karet a obsah musí pokrýt obě. */
    var sekce = document.querySelector('.section .clanek');
    if (!sekce) return;
    sekce = sekce.closest('.section');
    var obal = sekce.querySelector('.add-wrap');
    if (!obal || obal.querySelector('.obsah')) return;

    var oddily = [].slice.call(sekce.querySelectorAll('.clanek .rules-sect'));
    /* Pod pět oddílů je obsah delší než užitek — čtenář je vidí všechny
       na jedné obrazovce a seznam by jen přidal práci. */
    if (oddily.length < 5) return;

    var nav = document.createElement('nav');
    nav.className = 'obsah';
    nav.setAttribute('aria-label', 'Obsah stránky');
    var nadpis = document.createElement('p');
    nadpis.className = 'obsah-nadpis';
    nadpis.textContent = 'Obsah';
    nav.appendChild(nadpis);
    var ol = document.createElement('ol');

    var cile = [];
    oddily.forEach(function (sec, i) {
      var h = sec.querySelector('h2, h3');
      if (!h) return;
      if (!sec.id) sec.id = slug(h.textContent, i);
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + sec.id;
      a.textContent = h.textContent.trim();
      li.appendChild(a);
      ol.appendChild(li);
      cile.push({ sec: sec, a: a });
    });
    if (!cile.length) return;
    nav.appendChild(ol);
    obal.insertBefore(nav, obal.firstChild);

    /* Kde zrovna jsem. Bez toho je seznam jen rozcestník; s tím je to
       ukazatel postupu v dlouhém textu. Sleduje se pruh pod hlavičkou,
       ne celé okno — jinak se zvýrazní oddíl, který je ještě pod hranou. */
    if (typeof IntersectionObserver !== 'function') return;
    var videne = Object.create(null);
    var pozorovatel = new IntersectionObserver(function (zaznamy) {
      zaznamy.forEach(function (z) {
        var i = cile.findIndex(function (c) { return c.sec === z.target; });
        if (i >= 0) videne[i] = z.isIntersecting;
      });
      var prvni = -1;
      for (var i = 0; i < cile.length; i++) if (videne[i]) { prvni = i; break; }
      cile.forEach(function (c, i) {
        if (i === prvni) c.a.setAttribute('aria-current', 'true');
        else c.a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-110px 0px -60% 0px' });
    cile.forEach(function (c) { pozorovatel.observe(c.sec); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', postav);
  } else {
    postav();
  }
})();
