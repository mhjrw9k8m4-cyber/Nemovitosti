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
        <a href="pozemky-zahrada.html">Zahrady</a>
        <a href="pozemky-lesni.html">Lesní</a>
        <a href="pozemky-orna-puda.html">Orná půda</a>
        <a href="pozemky-louka.html">Louky</a>
        <a href="pozemky-vinice-sady.html">Vinice a sady</a>
        <a href="pozemky-podle-okresu.html">Podle okresu</a>
      </div></details>
      <details class="nav-sk nav-sk-sance"><summary>Příležitosti</summary><div class="nav-sk-panel">
        <a href="drazby-pozemku.html">Dražby</a>
        <a href="exekuce-pozemku.html">Exekuce</a>
        <a href="nove-pozemky.html">Nové na trhu</a>
        <a href="na-co-mam-pozemek.html">Na co mám?</a>
      </div></details>
      <a href="cena-pozemku.html">Ceny pozemků</a>
      <details class="nav-sk nav-sk-radce"><summary>Rádce</summary><div class="nav-sk-panel">
        <a href="uzemni-plan-pozemek.html">Územní plán</a>
        <a href="stavebni-vs-zemedelsky-pozemek.html">Stavební vs. zemědělský</a>
        <a href="pristupova-cesta-pozemek.html">Přístupová cesta</a>
        <a href="list-vlastnictvi-katastr.html">List vlastnictví</a>
        <a href="kupni-smlouva-pozemek.html">Kupní smlouva</a>
        <a href="kolik-stoji-koupe-pozemku.html">Náklady koupě</a>
        <a href="hypoteka-na-pozemek.html">Hypotéka</a>
        <a href="vecne-bremeno-pozemek.html">Věcné břemeno</a>
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
