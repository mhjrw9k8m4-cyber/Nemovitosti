/* FOTKA NABÍDKY — jedna adresa, dvě strany webu
 * =====================================================================
 * Do 8. 11. 2026 nemělo fotku ANI JEDNO z 3 886 inzerátů na webu
 * (změřeno; viz úkol „Náhled bez fotky je tmavá deska"). Karta proto
 * ukazovala letecký snímek z katastru — poctivé, ale člověk, který si
 * vybírá dům, chce vidět dům.
 *
 * Sitemapa Bezrealitek u každého inzerátu fotku uvádí (§470), takže ji
 * od té doby máme. Adresa má ale sto třicet znaků:
 *
 *   https://api.bezrealitky.cz/media/cache/record_main/data/images/
 *   advert/1076k/1076264/1076264-1792345838-foto-1.jpg
 *
 * Kdyby se do dat ukládala celá, narostl by soubor, který si stahuje
 * ÚVODNÍ STRÁNKA, o 3 161 × 130 B, tedy o 410 kB. Z té adresy je přitom
 * odvoditelné všechno kromě názvu souboru: předpona je stejná pro
 * všechny a obě části cesty se počítají z čísla inzerátu
 * (1076264 → „1076k/1076264/"). V datech proto stojí jen název souboru
 * (pole `f`, kolem 30 znaků) a adresu skládá tenhle modul.
 *
 * PROČ ZVLÁŠTNÍ MODUL A NE DVA ŘÁDKY NA DVOU MÍSTECH. Skládat tu adresu
 * potřebuje web (karta ve výpisu, stránka nabídky) i sestavení
 * (generátory stránek) a rozkládat ji potřebuje robot. To jsou tři
 * místa — a pravidlo opsané na třech místech se rozejde tiše
 * (§436-třída): stačilo by, aby zdroj změnil předponu, a polovina webu
 * by ukazovala fotky a druhá prázdná místa.
 *
 * ADRESY SE NESTAHUJÍ, JEN SE PŘEDAJÍ PROHLÍŽEČI. Hostitel
 * api.bezrealitky.cz má v robots.txt „Disallow: /" a robot tam nesmí
 * (a nechodí — hlídá scripts/test-bezrealitky.mjs). robots.txt ale
 * mluví o ROBOTECH; návštěvník, kterému prohlížeč vykreslí obrázek,
 * robot není. Proto se fotka nikam nekopíruje: v HTML je odkaz na
 * originál a vedle něj odkaz na inzerát, odkud je.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PK_FOTKA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Předpona a tvar cesty — naměřeno 8. 11. 2026 na třech inzerátech
     z sitemapy (1076264, 992722, 610702): u všech tří vyšla složka jako
     Math.floor(id / 1000) + 'k' a pod ní složka s celým číslem. */
  var PREDPONA = 'https://api.bezrealitky.cz/media/cache/record_main/data/images/advert/';
  var HOSTITEL = 'api.bezrealitky.cz';

  /** Číslo inzerátu z jeho adresy na Bezrealitkách, nebo null. */
  function cisloInzeratu(url) {
    var m = /\/(\d{3,})-nabidka-/.exec(String(url == null ? '' : url));
    return m ? m[1] : null;
  }

  /**
   * Název souboru z plné adresy fotky — to, co se ukládá do dat.
   * Vrací null, když adresa nemá očekávaný tvar: vymyslet si zkratku
   * by znamenalo uložit odkaz, který nikam nevede.
   */
  function zkratka(url, id) {
    var u = String(url == null ? '' : url);
    if (!u || u.indexOf(PREDPONA) !== 0) return null;
    var cislo = String(id == null ? '' : id);
    if (!/^\d{3,}$/.test(cislo)) return null;
    var cesta = Math.floor(Number(cislo) / 1000) + 'k/' + cislo + '/';
    var zbytek = u.slice(PREDPONA.length);
    if (zbytek.indexOf(cesta) !== 0) return null;
    var jmeno = zbytek.slice(cesta.length);
    /* Jen název souboru, žádná další složka a žádný dotaz — kdyby se
       tvar adresy změnil, je lepší fotku neukázat než složit nesmysl. */
    return /^[A-Za-z0-9._-]+\.(jpe?g|png|webp|avif)$/i.test(jmeno) ? jmeno : null;
  }

  /**
   * Plná adresa fotky nabídky, nebo null.
   *   d.f   — název souboru z dat
   *   d.url — adresa inzerátu (je v ní číslo)
   * Nabídka od majitele má vlastní `photos` a tahle funkce se jí netýká.
   */
  function url(d) {
    if (!d || !d.f) return null;
    var cislo = cisloInzeratu(d.url);
    if (!cislo) return null;
    return PREDPONA + Math.floor(Number(cislo) / 1000) + 'k/' + cislo + '/' + d.f;
  }

  return {
    PREDPONA: PREDPONA,
    HOSTITEL: HOSTITEL,
    cisloInzeratu: cisloInzeratu,
    zkratka: zkratka,
    url: url,
  };
});
