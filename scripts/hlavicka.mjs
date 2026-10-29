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

   KOLIK TOHO V NÍ JE: sedm odkazů a účet, ne dvacet pět. Majitel:
   „to menu chce zredukovat, je tam toho moc, nech tam jen to
   důležité." Co z ní odešlo, se neztratilo — bylo to změřené, ne
   odhadnuté. Počty odkazů MIMO lištu a patičku:

     orná půda 920 · louky 421 · stavební 257 · lesní 100 · zahrady 79
     · vinice a sady 61 — druhy pozemků vedou z každé stránky pozemku
       toho druhu, takže je lišta nosit nemusí,
     na co mám? 106 · podle okresu 105 · nové na trhu 97 · ceny 68,
     rádci: náklady koupě 112 · list vlastnictví 92 · přístupová
       cesta 12 · stavební vs. zemědělský 9 · územní plán 8 ·
       hypotéka 4 · věcné břemeno 4 · kupní smlouva 1.

   PODRUHÉ A POŘÁDNĚ — A JE TO ZMĚŘENÉ. Při prvním úklidu zůstali
   v nabídce tři rádci a „Stavební"; obojí tu bylo odůvodněné, ale
   nabídka pořád nevycházela. NAMĚŘENO 26. 10. v šuplíku na 390×844:
   obsah 1 206 px v 844px okně, tedy 362 px za okrajem — a prvních
   230 px zabíralo tlačítko s prodejní větou pod ním, dalších 228 px
   účet. Kdo nabídku otevřel, viděl nejdřív inzerci a svůj profil;
   pozemky začínaly až na 436 px. Majitel: „menu nemá mít tisíc
   kolonek ani tisíce textů, má to být čistě přehledné."
   Ubralo se tedy ještě:
     · PRODEJNÍ VĚTA pod tlačítkem (56 px) — tlačítko ji říká samo,
     · „STAVEBNÍ" (52 px) — vede na ni 257 odkazů odjinud a od 26. 10.
       je i v pilulkách pod nadpisem úvodní stránky,
     · TŘI RÁDCI NA JEDEN ODKAZ (104 px) na nový rozcestník
       radce.html, kde jsou všichni i s větou, o čem jsou. Důvod pro
       tři padl: tři položky v nabídce slibovaly, že rádci jsou tři,
       zatímco jich je devět.
   Účet se přesunul POD obsah (css/styles.css, `order` v šuplíku) —
   je to tentýž důvod, pro který nestojí první ani v liště na monitoru.
   A nadpisy skupin se na telefonu neukazují: v šuplíku jsou panely
   stejně rozbalené, takže nadpis jen přidával řádek navíc.
   Výsledek naměřený v prohlížeči: 844 px obsahu v 844px okně —
   nabídka se vejde celá a neroluje se. Hlídá scripts/test-menu.mjs.

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

/* ŠEST POLOŽEK, NE ŠESTNÁCT. Nabídka měla dvě rozbalovátka na
   procházení (Pozemky, Příležitosti), pět odkazů pod nimi a k tomu
   Ceny, Rádce a Kontakt — dohromady třináct odkazů a tři nadpisy
   skupin. Majitel: „zbav se těch věcí v menu a prokliků, nemá to být
   příručka, ale web na prodej."
   Zůstává to, čím se prodává: mapa (vlastní produkt), ceny a tlačítko
   přidat pozemek; účet je zvlášť, protože to není procházení.
   Co odešlo, nezmizelo z webu — jen z lišty:
     · Dražby, Exekuce, Nové na trhu — vstupní odznaky na úvodní
       stránce (.uvod-vstupy) vedou na tytéž stránky a stojí nad
       výpisem, tedy tam, kde se vybírá;
     · Podle okresu — rozcestník je na mapě i v patičce;
     · Rádce a Kontakt — v patičce, kde se hledá výklad a spojení.
   Stránky samy zůstávají (chodí na ně vyhledávač), jen si na ně
   lišta nenárokuje místo. */
export const NAV_HTML = `<nav id="nav" aria-label="Hlavní navigace">
      <a href="${NAV_MAPA}">Hledat na mapě</a>
      <a href="cena-pozemku.html">Ceny pozemků</a>
      <span class="nav-del" aria-hidden="true"></span>
      <details class="nav-sk nav-ucet-sk"><summary id="nav-sk-ucet"><span class="nav-ucet-t">Můj profil</span><span class="nav-stav" id="nav-stav">Nepřihlášeno</span></summary><div class="nav-sk-panel">
        <a href="muj-inzerat.html" id="nav-ucet">Moje inzeráty</a>
        <a href="zpravy.html" id="nav-zpravy">Zprávy</a>
        <a href="hlidani.html" id="nav-hlidani">Hlídání</a>
      </div></details>
      <a href="pridat.html" class="btn-primary nav-add"><svg class="ik" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-plus"/></svg>Přidat pozemek</a>
    </nav>`;

const VZOR = /<nav id="nav"[\s\S]*?<\/nav>/;

/* CTA „Přidat pozemek" V LIŠTĚ SE VYNDÁVÁ, nevkládá.
   Mezi značkou a navigací stál na 2 311 stránkách odkaz
   `<a class="btn-primary header-cta">` se dvěma variantami popisku —
   a `css/styles.css` ho schovával dvěma pravidly `display:none`, jedním
   pro široký displej a druhým uvnitř @media pro telefon. Nekreslil se
   tedy nikde: akce je na širokém displeji v navigaci (.nav-add) a na
   telefonu první věcí v šuplíku (změřené rozhodnutí, viz
   scripts/test-rozvrzeni.mjs). Vyndává se to tudy, protože lišta je
   kánon pro celý web — včetně stránek ukončených nabídek, které se
   obsahově nepřepisují a kterých by se změna šablony nedotkla.
   Idempotentní: druhý průchod už nemá co odebrat. */
const CTA_PRYC = /[ \t]*<a href="pridat\.html" class="btn-primary header-cta">[\s\S]*?<\/a>\n?/;

/** Vepíše kánon do jedné stránky. Vrací ji beze změny, když lištu nemá. */
export function sjednotHlavicku(html, soubor) {
  if (!VZOR.test(html)) return html;
  /* Na úvodní stránce vede mapa na kotvu, odjinud na index.html —
     relativní „#mapa" by jinde skočil na místo, které tam není. */
  const naMape = /(^|\/)index\.html$/.test(String(soubor || ''));
  const bezCta = html.replace(CTA_PRYC, '');
  return bezCta.replace(VZOR, NAV_HTML.replace(NAV_MAPA, naMape ? '#mapa' : 'index.html#mapa'));
}
