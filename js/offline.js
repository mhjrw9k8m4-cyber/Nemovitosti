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
 */
(function () {
  if (!('serviceWorker' in navigator)) return;
  /* Service worker potřebuje https nebo localhost. Na file:// a na
     nezabezpečeném původu by registrace jen vyhodila chybu do konzole,
     a ta se na webu hlídá testem (scripts/test-konzole.mjs). */
  if (!window.isSecureContext) return;
  window.addEventListener('load', function () {
    try {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    } catch (e) { /* schválně mlčky: viz hlavička */ }
  });
}());
