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

/* Tlačítko „nahoru" na dlouhých stránkách.
 *
 * MĚŘENÍ, KTERÉ TO VYVOLALO (šířka 390 px, výška okna 844 px):
 *   drazby-pozemku-nabidky   18 700 px = 22 obrazovek
 *   pozemky-okres-praha-vychod  11 086 px = 13 obrazovek
 *   cena-pozemku             10 287 px = 12 obrazovek
 *   pozemky-podle-okresu      6 985 px =  8 obrazovek
 *   okresní výpisy            5 693 px =  7 obrazovek
 *   rádce                  3 300–4 500 px = 4–5 obrazovek
 * Tlačítko přitom bylo jen v index.html — na jedné stránce z 2 105.
 * Kdo dojel na konec dvaadvacetiobrazovkového výpisu dražeb, neměl
 * čím se vrátit: hlavička je sice pevná, ale při pohybu zhasíná, a
 * obsahový rozcestník rádců se na telefonu neukazuje vůbec.
 *
 * Proč skriptem a ne do HTML: stránek je 2 105 a většina se generuje.
 * V index.html tlačítko v HTML zůstává (najde se a použije), jinde se
 * dopíše — stránka bez skriptu tím nic neztratí, rolovat se dá pořád.
 *
 * Na krátkých stránkách se neukáže. Práh jsou tři obrazovky a počítá se
 * při každém pohybu, ne jednou po načtení: výpisy dorůstají daty až po
 * něm. Hlídání, zprávy, kontakt (1,8–2,4 obrazovky) tak zůstanou čisté —
 * plovoucí knoflík na stránce, kde je konec na dosah, je jen smetí.
 */
(function () {
  'use strict';
  var PRAH_POSUNU = 500;      // dřív nemá smysl: nahoru je vidět
  var PRAH_OBRAZOVEK = 3;     // kratší stránka tlačítko nedostane

  var b = document.getElementById('to-top');
  if (!b) {
    b = document.createElement('button');
    b.id = 'to-top';
    b.className = 'to-top';
    b.type = 'button';
    b.setAttribute('aria-label', 'Zpět nahoru');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M12 19V6M6 12l6-6 6 6"/></svg><span>Nahoru</span>';
    (document.body || document.documentElement).appendChild(b);
  }

  /* PŘI ROLOVÁNÍ SE NESMÍ NIC MĚŘIT.
     Napoprvé se tu při každém pohybu četl `scrollHeight` a `getBoundingClientRect()`
     patičky. Obojí je dotaz na rozvržení, a dotaz na rozvržení donutí
     prohlížeč všechno přepočítat. Navíc to viselo i na ResizeObserveru
     nad <body>, který se během stavby mapy a výpisu hýbe pořád dokola.
     Naměřeno profilerem s brzdou 4× (tedy zhruba běžný telefon) na úvodní
     stránce: 259 ms procesoru jen v téhle funkci, druhá nejdražší věc na
     celé stránce hned za kreslením mapy.
     Je to přesně ta vada, před kterou varuje poznámka v hlavičce
     index.html — tam kdysi stálo 2 017 ms v toTop ze stejného důvodu.
     Opsal jsem ji znovu, protože „zeptat se na výšku stránky" vypadá
     nevinně.
     Teď se míry berou JEN při změně velikosti (a ty se stejně dějí
     v dávkách, takže je sbírá requestAnimationFrame). Při rolování už
     zbývá jen porovnání dvou čísel. */
  var vyskaStranky = 0, vysKna = 0, patkaOd = 1e9, cekaRam = false;

  function premer() {
    cekaRam = false;
    vyskaStranky = document.documentElement.scrollHeight;
    vysKna = window.innerHeight;
    var pat = document.querySelector('footer');
    /* offsetTop sčítá odsazení předků, ne polohu v okně — nezávisí tedy
       na rolování a nepotřebuje se číst znovu při každém pohybu. */
    patkaOd = pat ? (pat.getBoundingClientRect().top + (window.pageYOffset || 0)) : 1e9;
    prekresli();
  }
  function premerPozdeji() {
    if (cekaRam) return;
    cekaRam = true;
    (window.requestAnimationFrame || setTimeout)(premer);
  }

  function prekresli() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var dlouha = vyskaStranky > vysKna * PRAH_OBRAZOVEK;
    /* U patičky tlačítko uhne. Kdo je na konci, chce její odkazy, ne aby
       mu přes ně ležel knoflík — a zpátky nahoru se odtud dostane i tak. */
    var vPatce = (patkaOd - y) < (vysKna - 60);
    b.classList.toggle('show', dlouha && y > PRAH_POSUNU && !vPatce);
  }

  window.addEventListener('scroll', prekresli, { passive: true });
  window.addEventListener('resize', premerPozdeji, { passive: true });
  /* Výpisy a mapa dorůstají po načtení — bez tohohle by se tlačítko na
     dlouhé stránce objevilo až po prvním posunu po doplnění dat. */
  if ('ResizeObserver' in window && document.body) {
    try { new ResizeObserver(premerPozdeji).observe(document.body); } catch (e) {}
  }
  /* A JEŠTĚ JEDNOU, AŽ JE STRÁNKA HOTOVÁ. Míry se berou při startu a pak
     už jen při změně velikosti okna nebo rozměru <body>. To stačí, dokud
     se všechno, co stránku prodlužuje, promítne do výšky body — jenže
     obrázky, písma a mapa dojíždějí po načtení a ne každá taková změna
     se musí v body projevit (např. když roste prvek s vlastním
     rozvržením). Zůstane pak uložená STARÁ poloha patičky a tlačítko
     „nahoru" u ní neuhne, protože podle svých čísel k ní ještě nedojelo.
     Jedno přeměření po `load` to srovná a nestojí nic: při rolování se
     dál jen porovnávají dvě čísla. */
  window.addEventListener('load', premerPozdeji);
  premer();

  b.addEventListener('click', function (e) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    /* Skok pohledem nestačí: kdo chodí klávesou, zůstal by v pořadí
       tabulátoru dole u patičky a další Tab by ho vrátil tam, odkud
       odjel. Kurzor proto putuje s obrazem.
       NE NA <main>. Ten má v šabloně id="obsah" a je to cíl přeskakovacího
       odkazu; dát mu tabindex="-1" a zaostřit ho znamená, že globální
       pravidlo `:focus-visible{outline:2px}` obtáhne rámečkem celý obsah
       stránky — dvoupixelová linka kolem všeho, co je vidět. Kurzor jde
       proto na přeskakovací odkaz: ten se zaostřením sám ukáže („Přeskočit
       na obsah"), takže je vidět, kde člověk stojí, a jedno Enter ho pustí
       do textu. Další Tab pokračuje v menu, jako po načtení stránky.
       Myší se kurzor nehýbe vůbec — jinak by klepnutí vytáhlo přeskakovací
       odkaz na světlo někomu, kdo klávesnici nepoužívá. Klávesou vyvolané
       kliknutí pozná `detail === 0`. */
    if (e.detail !== 0) return;
    var cil = document.querySelector('.skip-link') || document.querySelector('header a');
    if (cil) { try { cil.focus({ preventScroll: true }); } catch (x) { cil.focus(); } }
  });
})();
