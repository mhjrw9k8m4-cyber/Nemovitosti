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

  /* Příjezd. Rozsvítit se za desetinu vteřiny vypadá, že se hlavička
     zjevila — „připlave rychlostí světla". Krátká animace (necelá půl
     vteřiny, pár pixelů shora) ukáže, odkud přišla. Třída se po dojetí
     zase sundá, aby hlavička v klidu neměla žádnou transformaci: pevně
     umístěný prvek ji nepotřebuje a na Safari je historicky zdroj potíží. */
  function rozsvit() {
    if (!zhasnuta) return;
    zhasnuta = false;
    h.classList.remove('hl-zhasnuta');
    h.classList.remove('hl-prijezd');
    // Vynucené přepočítání, jinak by se animace nespustila znovu.
    void h.offsetWidth;
    h.classList.add('hl-prijezd');
  }
  h.addEventListener('animationend', function (e) {
    if (e.animationName === 'hlPrijezd') h.classList.remove('hl-prijezd');
  });
  function zhasni() {
    if (zhasnuta || musiSvitit()) return;
    zhasnuta = true;
    /* Běžící animace příjezdu si drží průhlednost sama a zhasnutí by
       přebila — hlavička by ještě půl vteřiny svítila přes obsah. Proto
       se animace nejdřív sundá. (Chyceno testem, ne odhadem.) */
    h.classList.remove('hl-prijezd');
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

/* Stav přihlášení v menu.
 *
 * Menu nikde neříkalo, jestli je člověk přihlášený. „Můj profil" vypadal
 * stejně přihlášenému i nepřihlášenému a stál až čtvrtý mezi osobními
 * položkami — kdo si chtěl ověřit účet, musel na profil přejít a počkat,
 * co se načte. Teď je účet v menu první a pod ním stojí, na koho je
 * přihlášeno, nebo že přihlášený nikdo není.
 *
 * Píše se to skriptem, ne do HTML: stránek je přes sto a stav se mění.
 * V HTML je proto „Nepřihlášeno" jako výchozí, aby i bez skriptu stálo
 * něco pravdivého — nepřihlášený je totiž výchozí stav.
 */
(function () {
  'use strict';
  function vypln() {
    var stav = document.getElementById('nav-stav');
    var odkaz = document.getElementById('nav-ucet');
    if (!stav || !odkaz) return;
    var A = window.PKAuth;
    var prihlasen = !!(A && A.loggedIn && A.loggedIn());
    odkaz.classList.toggle('je-prihlasen', prihlasen);
    var skupina = odkaz.closest ? odkaz.closest('.nav-moje') : null;
    if (skupina) skupina.classList.toggle('prihlasen', prihlasen);
    if (!prihlasen) { stav.textContent = 'Nepřihlášeno'; return; }
    var mail = (A.email && A.email()) || '';
    /* Dlouhý e-mail by řádek rozbil; zkrátí se jméno, ne doména —
       podle domény člověk pozná účet spolehlivěji. */
    if (mail.length > 26) {
      var zav = mail.indexOf('@');
      if (zav > 3) mail = mail.slice(0, Math.max(3, 24 - (mail.length - zav))) + '…' + mail.slice(zav);
    }
    stav.textContent = mail || 'Přihlášeno';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', vypln);
  } else { vypln(); }
  /* Po přihlášení nebo odhlášení se stránka nemusí načítat znovu. */
  window.addEventListener('storage', vypln);
  window.addEventListener('pk-auth', vypln);

  /* PŘIHLÁŠENÍ SE OBNOVOVALO JEN NA PĚTI STRÁNKÁCH. keepAlive() volaly
     hlidani, zpravy, muj-inzerat, upozorneni a pridat — tedy ne úvodní
     stránka a ne stránky pozemků, kde člověk tráví většinu času. Tam
     platnost tokenu tiše doběhla a přihlášení se probralo, až když
     někam došel.
     Hlavička je na 2 050 z 2 055 stránek, takže sem to patří. Levné to
     je: keepAlive() nic nepošle, dokud platnost nedochází (zbývá-li
     přes pět minut, vrátí se rovnou). Po obnově se hlavička překreslí
     — e-mail se do ní jinak dostane až po dalším načtení stránky. */
  try {
    if (window.PKAuth && PKAuth.keepAlive && PKAuth.loggedIn && PKAuth.loggedIn()) {
      PKAuth.keepAlive().then(vypln, vypln);
    }
  } catch (e) {}
})();
