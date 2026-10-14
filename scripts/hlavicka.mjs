/* Jedna lišta pro celý web — skládá se tady, ne na 2 248 místech.
   ==================================================================
   PROČ TENHLE SOUBOR VZNIKL. Lišta byla v každé stránce vepsaná zvlášť
   a změřeno: měla TŘI různé podoby (2 141 stránek jednu, 106 druhou,
   index.html třetí). Jakákoli změna navigace tedy znamenala upravit
   tři šablony a doufat, že se na čtvrtou nezapomnělo. Teď je kánon tady
   a `sjednotHlavicku()` ho při sestavení vepíše do každé stránky.

   JAK JE SKLÁDANÁ. Vlevo to, co se na webu hledá (pozemky, dražby,
   ceny, rádce), vpravo účet a jediné tlačítko s výplní. Tak to mají
   velké inzertní weby a má to důvod: levá půlka odpovídá na „co tu
   najdu", pravá na „co tu můžu udělat". Dřív stál „Můj profil" jako
   PRVNÍ položka mezi obsahem — účet se tím pletl do cesty každému,
   kdo přišel hledat pozemek.

   KOLIK TOHO V NÍ JE: deset odkazů, ne dvacet pět. Majitel: „to menu
   chce zredukovat, je tam toho moc, nech tam jen to důležité." Co z ní
   odešlo, se neztratilo — bylo to změřené, ne odhadnuté. Počty
   odkazů MIMO lištu a patičku:

     orná půda 920 · louky 421 · stavební 257 · lesní 100 · zahrady 79
     · vinice a sady 61 — druhy pozemků vedou z každé stránky pozemku
       toho druhu, takže je lišta nosit nemusí (zůstává „Stavební"
       jako nejhledanější a „Podle okresu" jako rozcestník),
     na co mám? 106 · podle okresu 105 · nové na trhu 97 · ceny 68,
     rádci: náklady koupě 112 · list vlastnictví 92 · přístupová
       cesta 12 · stavební vs. zemědělský 9 · územní plán 8 ·
       hypotéka 4 · věcné břemeno 4 · kupní smlouva 1.

   U RÁDCŮ TO BYLO NEJTĚSNĚJŠÍ, a proto zůstali tři, ne jeden: každý
   rádce odkazuje na všech osm ostatních, takže jeden odkaz v liště
   stačí, aby se k nim člověk dostal. Tři jsou tam proto, že pokrývají
   tři otázky, které má kupující v tomhle pořadí: smím tu stavět
   (územní plán), jak se to převádí (kupní smlouva), co to stojí nad
   rámec ceny (náklady koupě).

   SKUPINY JSOU <details>, NE VLASTNÍ SKRIPT. Rozbalení umí prohlížeč
   sám, včetně klávesnice a čtečky, a funguje i bez JavaScriptu.
   A hlavně: na telefonu se z TÉHOŽ kódu stane oddíl šuplíku — panel se
   nechá viditelný a ze `summary` je nadpis skupiny (viz css/styles.css).
   Šuplík totiž žádné odkazy nekopíruje, přebírá rovnou #nav
   (js/menu.js), takže jedna značka slouží oběma podobám.

   PROČ MÁ KAŽDÁ SKUPINA VLASTNÍ TŘÍDU (nav-sk-pozemky, -sance, -radce).
   V šuplíku se oddíly řadí jinak než v liště a každý má svou ikonu
   u nadpisu. Dalo by se to psát přes :nth-of-type, ale pak by přidání
   jedné skupiny beze slova přeházelo pořadí i ikony celé nabídky.
   ================================================================== */

/* Odkaz na mapu je „#mapa" jen na úvodní stránce; odjinud musí vést
   na index.html, jinak by skočil do prázdna. Dosazuje se při sazbě. */
export const NAV_MAPA = '{{MAPA}}';

export const NAV_HTML = `<nav id="nav" aria-label="Hlavní navigace">
      <details class="nav-sk nav-sk-pozemky"><summary>Pozemky</summary><div class="nav-sk-panel">
        <a href="${NAV_MAPA}">Hledat na mapě</a>
        <a href="pozemky-stavebni.html">Stavební</a>
        <a href="pozemky-podle-okresu.html">Podle okresu</a>
      </div></details>
      <details class="nav-sk nav-sk-sance"><summary>Příležitosti</summary><div class="nav-sk-panel">
        <a href="drazby-pozemku.html">Dražby</a>
        <a href="exekuce-pozemku.html">Exekuce</a>
        <a href="nove-pozemky.html">Nové na trhu</a>
      </div></details>
      <a href="cena-pozemku.html">Ceny pozemků</a>
      <details class="nav-sk nav-sk-radce"><summary>Rádce</summary><div class="nav-sk-panel">
        <a href="uzemni-plan-pozemek.html">Územní plán</a>
        <a href="kupni-smlouva-pozemek.html">Kupní smlouva</a>
        <a href="kolik-stoji-koupe-pozemku.html">Náklady koupě</a>
      </div></details>
      <a href="kontakt.html" class="nav-kontakt">Kontakt</a>
      <span class="nav-del" aria-hidden="true"></span>
      <details class="nav-sk nav-ucet-sk"><summary id="nav-sk-ucet"><span class="nav-ucet-t">Můj profil</span><span class="nav-stav" id="nav-stav">Nepřihlášeno</span></summary><div class="nav-sk-panel">
        <a href="muj-inzerat.html" id="nav-ucet">Moje inzeráty</a>
        <a href="zpravy.html" id="nav-zpravy">Zprávy</a>
        <a href="hlidani.html" id="nav-hlidani">Hlídání</a>
      </div></details>
      <a href="pridat.html" class="btn-primary nav-add">Přidat pozemek</a>
      <span class="nav-cta-note">Prodáváte pozemek? Přidejte ho zdarma a bez provize.</span>
    </nav>`;

const VZOR = /<nav id="nav"[\s\S]*?<\/nav>/;

/** Vepíše kánon do jedné stránky. Vrací ji beze změny, když lištu nemá. */
export function sjednotHlavicku(html, soubor) {
  if (!VZOR.test(html)) return html;
  /* Na úvodní stránce vede mapa na kotvu, odjinud na index.html —
     relativní „#mapa" by jinde skočil na místo, které tam není. */
  const naMape = /(^|\/)index\.html$/.test(String(soubor || ''));
  return html.replace(VZOR, NAV_HTML.replace(NAV_MAPA, naMape ? '#mapa' : 'index.html#mapa'));
}
