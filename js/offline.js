/* PŘIHLÁŠENÍ SERVICE WORKERU (offline režim).
 *
 * Proč vlastní soubor a ne pár řádků v hlavičce stránky: registrace se
 * musí stát na KAŽDÉ stránce, ne jen na úvodní. Kdo přijde z vyhledávače
 * přímo na stránku pozemku — a to je většina návštěv — by se jinak
 * offline režimu nikdy nedočkal.
 *
 * Proč až po load: registrace stahuje sw.js a při prvním načtení soupeří
 * o linku s mapou a s daty. Mapa je to, na co člověk přišel; offline
 * režim se uplatní až příště, takže počká.
 *
 * Co když to selže: nic. Offline režim je příplatek, ne podmínka — každá
 * chyba se spolkne a web běží dál jako dřív.
 *
 * A JEŠTĚ JEDNA PRÁCE NAVÍC: tenhle soubor hlídá, že otevřená karta
 * nezůstane viset na staré verzi webu. Proč zrovna tady — registrace
 * je jediné místo, které má po ruce `registration`, a běží na každé
 * stránce. Podrobnosti u funkce hlidejNovouVerzi níž.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;
  /* Service worker potřebuje https nebo localhost. Na file:// a na
     nezabezpečeném původu by registrace jen vyhodila chybu do konzole,
     a ta se na webu hlídá testem (scripts/test-konzole.mjs). */
  if (!window.isSecureContext) return;
  window.addEventListener('load', function () {
    try {
      navigator.serviceWorker.register('sw.js').then(hlidejNovouVerzi).catch(function () {});
    } catch (e) { /* schválně mlčky: viz hlavička */ }
  });

  /* ==================================================================
     OTEVŘENÁ KARTA SE MÁ DOZVĚDĚT, ŽE JE NOVÁ VERZE.
     ==================================================================
     Nasazení verze skončilo v 10:25:40, majitelův snímek téže stránky
     je z 10:32 a je na něm verze předchozí — a tohle se 30. 10.
     opakovalo čtyřikrát za dopoledne. Jedna polovina příčiny byla
     v ukládání (viz sw.js, §250), druhá je tady: kdo má stránku
     OTEVŘENOU a jen se k ní vrátí z jiné aplikace, žádné nové
     načtení nedělá — a tedy se o nové verzi nemá jak dozvědět.
     Prohlížeč se po sw.js sám ptá při navigaci a zhruba jednou za
     den; v odložené kartě tedy nikdy.

     Co se tu děje:
       1. jakmile je karta zase vidět, zeptáme se na novou podobu
          sw.js (registration.update()) — jeden dotaz, většinou 304;
       2. když se opravdu vymění obsluha (sw.js dělá skipWaiting
          a clients.claim, takže se vymění hned), karta se jednou
          načte znovu a člověk vidí aktuální web.

     POJISTKA PROTI SMYČCE: překreslení se povolí jen jednou za život
     stránky. Kdyby se obsluha vyměnila podruhé, karta se už
     nepřekreslí — lepší stará stránka než web, který se přelévá
     pořád dokola.
     A NE PŘI PRVNÍM PŘIHLÁŠENÍ: když se service worker instaluje
     poprvé, `controllerchange` přijde taky — jenže stránka je v tu
     chvíli ta nejnovější, jakou prohlížeč má, a načíst ji znovu by
     bylo blikání bez důvodu. Pozná se to podle toho, že před tím
     žádná obsluha nebyla. */
  function hlidejNovouVerzi(reg) {
    if (!reg) return;
    /* TŘI UDÁLOSTI, NE JEDNA. „Člověk se vrátil ke kartě" hlásí každý
       systém trochu jinak: `visibilitychange` při přepnutí mezi kartami,
       `pageshow` při návratu z paměti zpátky/vpřed (tudy chodí iOS
       Safari, když se vrátíte z jiné aplikace) a `focus` při návratu
       do okna. Poslouchá se všechno a sejde se to v jednom dotazu.
       ŠKRTIDLO: dotaz nejvýš jednou za půl minuty. Bez něj by tři
       události při jednom návratu znamenaly tři dotazy na sw.js. */
    var naposled = 0;
    function zeptejSe() {
      var ted = Date.now();
      if (ted - naposled < 30000) return;
      naposled = ted;
      try { reg.update(); } catch (e) { /* viz hlavička: příplatek, ne podmínka */ }
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') zeptejSe();
    });
    window.addEventListener('pageshow', zeptejSe);
    window.addEventListener('focus', zeptejSe);
    if (!navigator.serviceWorker.controller) return;   // první instalace
    var uzSePrekreslilo = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (uzSePrekreslilo) return;
      uzSePrekreslilo = true;
      try { location.reload(); } catch (e) {}
    });
  }
}());
