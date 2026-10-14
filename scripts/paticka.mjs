/* Jedna patička pro celý web — skládá se tady, ne na 2 249 místech.
   ==================================================================
   PROČ TENHLE SOUBOR VZNIKL. Změřeno 14. 10.: patička měla na webu
   ČTYŘI podoby. 2 178 stránek nese tu dnešní (jeden řádek), dvě k ní
   přidávají odkaz na kanál novinek — a **69 stránek pořád nese tu
   čtyřsloupcovou, kterou majitel odmítl**. Nejsou to zapomenuté
   soubory: jsou to UKONČENÉ nabídky, a ty generátor schválně
   nepřepisuje, aby zůstal zachovaný obsah inzerátu.

   Jenže patička není obsah, je to rám stránky. Zmrazit inzerát dává
   smysl; zmrazit rozvržení, které se mezitím zrušilo, ne — člověk,
   který na takovou stránku přijde z vyhledávače, uvidí jiný web než
   na ostatních 2 178 stránkách.

   JE TO TÁŽ ÚPRAVA, JAKOU UŽ MÁ LIŠTA (scripts/hlavicka.mjs): kánon
   stojí na jednom místě a krok při sestavení ho vepíše do každé
   stránky, která patičku má.

   CO JE KÁNON. Jeden řádek: copyright a tři právní odkazy. Čtyři
   sloupce odkazů (Produkt, Informace, Rádce, Právní) byly rozcestník,
   kterým nikdo neprocházel — všechno, co v nich stálo, vede i z menu
   v hlavičce. Je to ROZHODNUTÍ MAJITELE, ne můj závěr z měření, a
   hlídá ho scripts/test-paticka.mjs. Nepřidávat sem sloupce.
   ================================================================== */

/* Odkaz na kanál novinek stojí v patičce jen tam, kde má co nabídnout
   — na úvodní stránce a na rozcestníku obecních nabídek. Čtečky si
   kanál najdou samy přes <link rel="alternate"> v hlavičce, ale ČLOVĚK,
   který si ho chce dát do své čtečky, na adresu jinak nepřijde. Na
   ostatních 2 178 stránkách by to byl čtvrtý odkaz v řádku, který se
   týká něčeho jiného, než na co se člověk zrovna dívá. */
export const S_KANALEM = new Set(['index.html', 'pozemek-od-obce.html']);

const KANAL = '\n      <a href="novinky.xml" type="application/rss+xml">Kanál novinek</a>';

export function paticka(soubor) {
  return `<footer>
  <div class="wrap foot-bottom">
    <span class="mono">© 2026 Parcelka · data z veřejných zdrojů</span>
    <span class="foot-pravni">
      <a href="ochrana-udaju.html" data-info="soukromi">Zásady soukromí</a>
      <a href="podminky.html" data-info="podminky">Podmínky použití</a>
      <a href="kontakt.html">Kontakt</a>${S_KANALEM.has(soubor) ? KANAL : ''}
    </span>
  </div>
</footer>`;
}

const VZOR = /<footer[\s\S]*?<\/footer>/;

/** Vepíše kánon do jedné stránky. Vrací ji beze změny, když patičku nemá. */
export function sjednotPaticku(html, soubor) {
  if (!VZOR.test(html)) return html;
  return html.replace(VZOR, paticka(soubor));
}
