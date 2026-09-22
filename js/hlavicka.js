/* Hlavička: při pohybu zhasne, po zastavení se rozsvítí úplně nahoře.
 *
 * Dřív byla lepivá (position:sticky). Na iPhonu se při rolování zastavovala
 * kousek pod horním okrajem, nad ní prosvítal pruh stránky a přes nadpis
 * v úvodu ležela její polovina. Následovaly tři pokusy o opravu a žádný to
 * neodstranil — na počítači se ta chyba neprojeví, takže se ani nedala
 * ověřit jinak než na telefonu.
 *
 * ČTVRTÝ POKUS UŽ NENÍ ZÁPLATA, ALE JINÝ PŘEDPOKLAD.
 *
 * Předtím se tu věřilo, že „skončily scroll události = obraz stojí".
 * Na iPhonu to neplatí, a to ze dvou důvodů:
 *   • při setrvačném dojezdu události na chvíli přestanou chodit, i když
 *     se stránka pořád hýbe,
 *   • při sbalování a rozbalování lišty Safari se posouvá celé okno, což
 *     scroll událost nevyvolá vůbec — mění se jenom visualViewport.
 * Hlavička se tedy rozsvítila uprostřed pohybu a Safari ji nakreslilo tam,
 * kde okno bylo před chvílí. Odtud ten pruh obsahu nad ní.
 *
 * Teď se nečeká na ticho v událostech, ale ověřuje se SKUTEČNÁ POLOHA:
 * rozsvítí se, až se poloha stránky i okna nezmění ve dvou po sobě
 * jdoucích překresleních. Dokud se cokoli hýbe, hlavička je zhasnutá — a
 * co není vidět, nemůže ležet na špatném místě.
 *
 * Vždycky svítí: u horního okraje stránky, při otevřeném menu a když je
 * v ní kurzor (ovládání klávesnicí).
 */
(function () {
  'use strict';
  var h = document.querySelector('header');
  if (!h) return;

  var PRAH = 40;        // do 40 px od začátku stránky nezhasínáme
  var PAUZA = 180;      // po téhle době bez pohybu se teprve začne ověřovat
  var casovac = null, ramecek = null;
  var zhasnuta = false;
  var vv = window.visualViewport || null;

  // Kde jsme — stránka i okno dohromady. Na iPhonu se umí hýbat jen to
  // druhé (lišta Safari), a to je zrovna ta chvíle, kdy se to lámalo.
  function poloha() {
    return [
      Math.round(window.pageYOffset || document.documentElement.scrollTop || 0),
      vv ? Math.round(vv.offsetTop) : 0,
      vv ? Math.round(vv.height) : 0,
      vv ? Math.round(vv.pageTop || 0) : 0
    ].join('|');
  }
  function uVrcholu() {
    return (window.pageYOffset || document.documentElement.scrollTop || 0) <= PRAH;
  }
  function musiSvitit() {
    return document.body.classList.contains('nav-open') || h.contains(document.activeElement);
  }

  function rozsvit() {
    if (!zhasnuta) return;
    zhasnuta = false;
    h.classList.remove('hl-zhasnuta');
  }
  function zhasni() {
    if (zhasnuta || musiSvitit()) return;
    zhasnuta = true;
    h.classList.add('hl-zhasnuta');
  }

  /* Rozsvítit se smí, až se dvakrát po sobě nic nezměnilo. Jedno měření
     nestačí: mezi dvěma snímky setrvačného dojezdu bývá poloha náhodou
     stejná, a přesně na takovém falešném klidu to dřív padalo. */
  function azPoKlidu() {
    if (ramecek) cancelAnimationFrame(ramecek);
    var minula = poloha(), stejne = 0;
    (function krok() {
      var ted = poloha();
      if (ted === minula) {
        stejne++;
        if (stejne >= 2) { rozsvit(); ramecek = null; return; }
      } else {
        stejne = 0;
        minula = ted;
      }
      ramecek = requestAnimationFrame(krok);
    }());
  }

  function pohyb() {
    if (uVrcholu()) {
      // Úplně nahoře nemá co překážet a nemá co ujet — svítí hned.
      clearTimeout(casovac);
      if (ramecek) { cancelAnimationFrame(ramecek); ramecek = null; }
      rozsvit();
      return;
    }
    zhasni();
    clearTimeout(casovac);
    if (ramecek) { cancelAnimationFrame(ramecek); ramecek = null; }
    casovac = setTimeout(azPoKlidu, PAUZA);
  }

  window.addEventListener('scroll', pohyb, { passive: true });
  /* Lišta Safari se sbaluje bez scroll události — tohle je ta část, která
     tu dřív chyběla úplně. */
  if (vv) {
    vv.addEventListener('scroll', pohyb, { passive: true });
    vv.addEventListener('resize', pohyb, { passive: true });
  }
  window.addEventListener('orientationchange', pohyb, { passive: true });

  // Klepnutí, tah nebo klávesa uvnitř hlavičky ji vrátí okamžitě.
  h.addEventListener('focusin', rozsvit);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Tab') rozsvit();
  });
})();
