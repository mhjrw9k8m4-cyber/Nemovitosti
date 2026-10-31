/* Hlavička stojí nahoře pořád. Žádné zhasínání při pohybu.
 *
 * DO 31. 10. ZHASÍNALA. Mělo to dobrý důvod: `position:fixed` na
 * iPhonu při setrvačném dojezdu a při sbalování lišty Safari vykreslí
 * pruh tam, kde okno bylo před chvílí — přes nadpis pak ležela půlka
 * hlavičky a obojí bylo vidět přes sebe (majitel to tehdy vyfotil).
 * Obejít se to dalo tím, že se hlavička při jakémkoli pohybu schová
 * a vrátí se, až se poloha stránky i okna nezmění ve dvou po sobě
 * jdoucích překresleních.
 *
 * Majitel 31. 10.: „to úplně nahoře udělej pevné, štve mě, jak to mizí
 * při hýbání." Mizení bylo lék, ne nemoc — a lék, který je vidět
 * pokaždé, když člověk hne prstem. Hlavička proto zůstává vidět
 * nepřetržitě; `position:fixed; top:0` v css/styles.css ji drží
 * nahoře a nic ji neschovává.
 *
 * CO SE TÍM VRACÍ DO HRY: na starším iOS může pruh při rychlém
 * rolování na okamžik zaostávat za obsahem. Je to jeho vykreslování,
 * ne chyba rozvržení, a na dnešních verzích se to chová podstatně líp
 * než v době, kdy tenhle modul vznikl. Kdyby se to vrátilo, dalším
 * krokem NENÍ zhasínat při každém pohybu, ale schovat pruh jen při
 * rolování DOLŮ a vrátit ho při prvním pohybu nahoru.
 *
 * Co odsud zmizelo i se jmény: třídy pro zhasnutí a příjezd, jejich
 * animace ve stylopisu a výjimka pro „omezený pohyb". Jména tu
 * schválně nestojí, protože zkoušky hledají jména tříd i ve
 * skriptech — zmínka v komentáři by je držela naživu a hlídač
 * mrtvých stylů by je viděl jako používané.
 */

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
/* KAM VEDE OVLADAČ ÚČTU, KDYŽ SE ČLOVĚK PŘIHLAŠUJE PŘÍMO NA STRÁNCE.
   Hlídání, Zprávy a Můj profil nepřihlášeného nikam neposílají — mají
   svůj vlastní formulář přihlášení v těle stránky (je to psané
   pravidlo, hlídá ho scripts/test-hlidani-prohlizec.mjs). Dlaždice
   účtu v liště ale od 30. 10. nese nápis „Přihlásit" a odkaz
   `muj-inzerat.html`, takže na těch stránkách odváděla člověka na
   jinou stránku, než na které stál, a k jinému formuláři, než který
   měl pod rukou. Na těch třech stránkách proto vede odhlášenému na
   formulář TADY; přihlášenému zůstává na profil, protože tomu se
   dlaždice přepne na „Profil". */
var KOTVA_PRIHLASENI = {
  'hlidani.html': '#prihlaseni',
  'zpravy.html': '#prihlaseni',
  'muj-inzerat.html': '#mi-auth',
};

(function () {
  'use strict';
  function vypln() {
    var stav = document.getElementById('nav-stav');
    var odkaz = document.getElementById('nav-ucet');
    if (!stav || !odkaz) return;
    var A = window.PKAuth;
    var prihlasen = !!(A && A.loggedIn && A.loggedIn());
    odkaz.classList.toggle('je-prihlasen', prihlasen);
    /* Příznak na <body>, ať se stránky účtu dají odlišit stylem. Kdo je
       přihlášený, nepotřebuje číst, k čemu Zprávy nebo Hlídání jsou —
       používá je. Změřeno na 390×844: ten úvodní blok zabral 162 až 189 px
       a záložky účtu začínaly až na y 297–324. */
    /* Tytéž třídy, jaké nasadil vložený skript v hlavičce stránky ještě
       před vykreslením. Tady se jen opraví, když token mezitím vypršel —
       vložený skript se dívá jen na to, jestli nějaký je. */
    try {
      var k = document.documentElement.classList;
      k.toggle('pk-prihlasen', prihlasen);
      k.toggle('pk-odhlasen', !prihlasen);
    } catch (e) {}
    var skupina = odkaz.closest ? odkaz.closest('.nav-sk') : null;
    if (skupina) skupina.classList.toggle('prihlasen', prihlasen);
    /* Viz KOTVA_PRIHLASENI výš. V HTML stojí `muj-inzerat.html`, aby
       i bez skriptu vedla dlaždice někam, kde se přihlásit dá. */
    var dlazdice = document.querySelector('.hdr-ucet');
    if (dlazdice) {
      var kotva = KOTVA_PRIHLASENI[(window.location.pathname.split('/').pop() || 'index.html')];
      dlazdice.setAttribute('href', (!prihlasen && kotva) ? kotva : 'muj-inzerat.html');
    }
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
 * Proč skriptem a ne do HTML: stránek jsou přes dva tisíce a většina se
 * generuje. (Přesné číslo tu nestojí schválně — mění se s nabídkami samo
 * od sebe a nikdo by ho neopravoval; počítá ho scripts/test-staticka.mjs
 * při každém běhu. Číslo 2 105 o řádek výš je naopak NAMĚŘENÝ stav z doby
 * před touhle opravou, a ten se měnit nemá.)
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
    b.innerHTML = '<svg class="ik" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-nahoru"/></svg><span>Nahoru</span>';
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
  var vyskaStranky = 0, vysKna = 0, cekaRam = false;
  /* KDE LEŽÍ HLAVNÍ AKCE STRÁNKY — a proč to vůbec řešíme.
     Majitel poslal fotku z iPhonu: plovoucí kolečko „nahoru" sedělo
     přes pravý konec tlačítka „Uložit". Naměřeno na 390 px: kolečko
     stojí na x 330–376, řádek akcí končí na 370, takže se překrývají
     o 40 px — a klepnutí do toho místa vyvolá rolování nahoru místo
     uložení pozemku. Plovoucí knoflík nesmí ležet na ovladači.
     Řeší se to ústupem: dokud je řádek s hlavní akcí v tom pásu u spodní
     hrany, kde knoflík stojí, knoflík se nekreslí. Poloha se BERE JEN
     PŘI PŘEMĚŘENÍ (při změně velikosti a po načtení), ne při rolování —
     dotaz na rozvržení při každém posunu stál kdysi 259 ms procesoru
     a to se už opakovat nemá (viž poznámka výš). */
  var AKCE_SEL = '.pz-akce-hlavni';
  var akceY = null, akceH = 0;

  function premer() {
    cekaRam = false;
    vyskaStranky = document.documentElement.scrollHeight;
    vysKna = window.innerHeight;
    var akce = document.querySelector(AKCE_SEL);
    if (akce) {
      var ra = akce.getBoundingClientRect();
      akceY = ra.top + (window.pageYOffset || document.documentElement.scrollTop || 0);
      akceH = ra.height;
    } else { akceY = null; akceH = 0; }
    /* Poloha patičky se tu brala kvůli schovávání u ní; to je pryč,
       takže odpadl i jeden dotaz na rozvržení při každém přeměření. */
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
    /* U PATIČKY SE UŽ NESCHOVÁVÁ. Stálo tu, že kdo je na konci, chce
       odkazy patičky a ne přes ně knoflík — „a zpátky nahoru se odtud
       dostane i tak". To druhé prostě není pravda: na telefonu se odtud
       nahoru nedostane nijak než palcem přes celou stránku, a ta má
       4 000 px (pozemek) až 14 000 px (úvod). Tlačítko tedy mizelo přesně
       tam, kde je nejvíc potřeba.
       A to první se nepotvrdilo. Změřeno na třech typech stránek
       (pozemek, úvod, okres) ve třech šířkách (390, 768, 1280): tlačítko
       stojí v pravém dolním rohu a překrývá NULA odkazů patičky ve všech
       devíti případech — patička má odkazy ve sloupcích vlevo a pravý
       okraj volný. Důvod ke schovávání tedy nebyl žádný, jen se to nikdy
       nezměřilo. */
    /* Pás, ve kterém knoflík stojí: od spodní hrany 24 px odsazení
       a 46 px výšky, tedy 24 až 70 px nade dnem okna. */
    var hornihrana = vysKna - 70, dolnihrana = vysKna - 24;
    var koliduje = akceY !== null
      && (akceY - y) < dolnihrana && (akceY + akceH - y) > hornihrana;
    b.classList.toggle('show', dlouha && y > PRAH_POSUNU && !koliduje);
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
