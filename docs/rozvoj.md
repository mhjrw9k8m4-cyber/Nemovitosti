# Jak web rozvíjet dál

Postup, ne seznam nápadů. `docs/slaba-mista.md` říká, co je slabé;
tenhle dokument říká, **v jakém pořadí a podle čeho** se to má
rozhodovat, aby se nepracovalo podle dojmu.

---

## 1. Čím prioritizovat: teď ICE, od prvních dat RICE

**RICE** (Reach × Impact × Confidence ÷ Effort) je lepší metoda, jenže
`Reach` je počet lidí, kterých se změna dotkne — a ten se dnes spočítat
nedá, protože web nemá nasazené měření návštěvnosti. Dosadit do vzorce
odhad znamená dostat zpátky vlastní dojem vynásobený třemi čísly.

**Dokud není měření, používejte ICE** — tři čísla 1–10:

* **I**mpact — o kolik to posune to, co má web dělat.
* **C**onfidence — jak moc víte, že to tak dopadne (ne jak moc tomu
  věříte: čím víc odhadu, tím nižší číslo).
* **E**ase — jak snadné to je. (Pozor: v ICE se dělí, ne násobí —
  `I × C × E` s „Ease" jako vyšší = snazší.)

Skóre = I × C × E, nejvýš 1000.

### Takhle vychází dnešní backlog

| Co | I | C | E | ICE | Poznámka |
|---|---:|---:|---:|---:|---|
| Nasadit měření návštěvnosti | 9 | 10 | 10 | **900** | Odemyká všechno ostatní |
| Zapnout e-maily hlídání | 9 | 9 | 7 | **567** | Hotová funkce, chybí doména u Resendu |
| Říct u odhadu, jak je nejistý | 6 | 9 | 9 | **486** | Půlden; odstraní jediné místo, kde web tvrdí víc, než ví |
| Druhý velký zdroj (Sreality) | 10 | 7 | 5 | **350** | Opravuje tři slabá místa naráz |
| Rozhodnout o identitě provozovatele | 7 | 8 | 6 | **336** | Není to kód, je to rozhodnutí |
| Rozšířit rádce na 1 500+ slov | 5 | 6 | 4 | **120** | Dlouhá návratnost, ale skládá se |
| Platby za zvýraznění | 6 | 4 | 3 | **72** | Nula inzerátů = nula poptávky |

Tabulka není věštba — je to **zápis argumentu**. Hodnota ICE není v tom
čísle, ale v tom, že se o každém sloupci musí někdo rozhodnout nahlas.
Když vám z ní vyjde pořadí, se kterým nesouhlasíte, je špatně některý
odhad: najděte který, a to je ten nejcennější výstup.

**Až budou data** (řádově po měsíci měření), přepněte na RICE: `Reach`
bude počet návštěv dotčené stránky za měsíc, `Impact` 0,25 / 0,5 / 1 / 2 / 3,
`Effort` v člověkodnech. Tehdy teprve má smysl porovnávat „změna na
úvodní stránce" s „změna v profilu".

---

## 2. Cyklus zlepšování — a kdy na A/B testy ještě nemáte

### A/B testy zatím NE, a dá se to spočítat

Na rozpoznání **20% relativního zlepšení** u konverze kolem 5 % (při
95% hladině a 80% síle) potřebujete asi **8 100 návštěv na variantu**,
tedy **přes 16 000 celkem**. Na rozpoznání 50% zlepšení stačí asi
1 500 na variantu, tedy **3 000 celkem**.

Dokud web tolik lidí nemá — a dnes se neví, kolik jich má vůbec —
A/B test neřekne nic a jen zdrží. **Experiment, který nemá sílu, je
horší než žádný: vydá číslo, podle kterého se rozhodne.**

### Co dělat místo toho (a je to levnější)

1. **Měření napřed.** `supabase/navstevnost.sql` počítá stránku, zdroj
   odkazu a telefon/počítač. Bez cookie, bez IP. Za měsíc víte, které
   stránky někdo otevírá a odkud chodí.
2. **Pět lidí a jeden úkol.** Dejte pěti lidem, kteří web neznají, úkol
   („najděte pozemek do milionu v okrese, kde bydlíte, a zjistěte, jestli
   je ta cena dobrá") a jen se dívejte. Pět lidí najde kolem 80 % potíží
   v použitelnosti; šestý už jen opakuje.
3. **Zpětná vazba z webu.** Formulář na `kontakt.html` je dnes jediná
   cesta. Jedna otázka na konci detailu pozemku („Pomohla vám tahle
   stránka rozhodnout? ano / ne / proč") dá řádově víc odpovědí.
4. **Ship-and-watch.** Nasaďte změnu, sledujte týden to jedno číslo,
   které měla zlepšit. Není to kauzální důkaz, ale u téhle velikosti
   provozu je to poctivější než podsílený test.

### Co měřit jako první (severní hvězda)

Web nemá prodej, takže „konverze" se musí definovat. Navrhuji:

* **Hlavní:** počet lidí, kteří si uložili hledání NEBO pozemek.
  Je to první skutečný závazek vůči webu a jde to měřit bez účtu.
* **Vedlejší:** proklik na zdroj nabídky (to je okamžik, kdy web
  posloužil), návrat do 30 dnů, přidání vlastního inzerátu.

---

## 3. UX a konverzní optimalizace

### Průchod webem a kde se zadrhává

Hlavní cesta je **mapa → detail pozemku → odkaz na zdroj**. Změřená
třecí místa, seřazená podle toho, kolik lidí se jich dotkne:

1. **Hlídání je za přihlášením, a za ním nic nepřijde.** Uložení
   hledání vyžaduje účet („Hlídání je vázané na váš účet"), ale
   rozesílání e-mailů je vypnuté. Člověk tedy zaplatí účtem a dostane
   uložený filtr. **Buď e-maily zapnout, nebo do té doby říct rovnou
   u přihlášení, co hlídání dnes umí a co ne.** Nerovnováha mezi cenou
   (účet) a odměnou (nic nepřijde) je klasická příčina toho, že se lidé
   nevrátí.
2. **Polovina pozemků nedostane verdikt na místní úrovni.** U 50 %
   nabídek má skupina okres + druh míň než deset kusů, takže se
   porovnává přes kraj nebo celou ČR. Na stránce by mělo být vidět,
   **z čeho** se srovnává — dnes se to píše, ale drobně.
3. **Uložené pozemky už na účet chodí — ale jen přihlášenému.**
   Od `supabase/ulozene-na-uctu.sql` a `js/ulozene-ucet.js` se seznam
   slučuje mezi zařízeními (uložení jde vždycky nejdřív do prohlížeče,
   na účet až potom; odebrání na jednom telefonu drží i na druhém —
   hlídá to `scripts/test-ulozene-ucet.mjs`). **Co zbývá:** bez účtu
   to dál žije v jednom prohlížeči, což je záměr, jenže se o tom člověk
   dozví až z titulku tlačítka. Nabídnout „přenést do účtu" v okamžiku,
   kdy má uložené tři a víc, je levná konverze s jasnou protihodnotou —
   nahrání už je hotové (`ulozene_nahraj`), chybí jen ta výzva.
4. **Odchod na zdroj je slepý konec.** Jakmile člověk klikne na
   inzerát, web o něm neví a nemá ho čím vrátit. Jediná dnešní pojistka
   je uložení pozemku — a to je dobrovolné. Nabídnout uložení **ve
   chvíli odchodu** (ne hned při otevření) je přesně ten okamžik, kdy
   dává smysl.

### Důvěryhodnost

Co web dělá dobře a má v tom pokračovat: **říká, co neví.** „Za kolik
se pozemek nakonec prodal, se z veřejných zdrojů zjistit nedá."
„Průměrnou dobu prodeje tu nenajdete, protože by to byla nepravda."
Tohle je silnější než jakákoli pečeť důvěry — je to doložitelné
a konkurence to nedělá.

Co chybí:

* **Identita.** „Provozovatelem webu je soukromá osoba." U rozhodnutí
  za miliony je anonymita slabina. (Viz `docs/slaba-mista.md`.)
* **Počty místo přídavných jmen.** Místo „sbíráme z veřejných zdrojů"
  → „pět zdrojů, 1 980 nabídek, poslední kontrola před hodinou".
  Čísla web má, jen je neukazuje jako argument.
* **Ukázat, co se za rok zlepšilo.** Archiv změn cen i ukončených
  nabídek existuje (`data/archiv/`) — z toho jde udělat veřejnou
  stránku „co se na trhu děje", která zároveň dokazuje, že web běží
  dlouho a měří poctivě.

Co **nedoporučuji**: vymyšlené recenze, „už si prohlíží 14 lidí",
odpočty a podobné nátlakové prvky. U produktu, jehož jediná výhoda je
poctivost čísel, by jeden takový prvek zlevnil všechno ostatní.

---

## 4. Technika a SEO

### Rychlost je hotová věc — neinvestujte do ní

Změřeno na telefonu 390 px se **čtyřikrát zpomaleným procesorem**:

| stránka | FCP | LCP | CLS |
|---|---:|---:|---:|
| úvodní | 296 ms | 296 ms | 0,058 |
| okresní | 360 ms | 360 ms | 0 |
| ceny pozemků | 272 ms | 392 ms | 0 |
| hlídání | 200 ms | 200 ms | 0 |

Všechno hluboko v pásmu „dobré" (LCP < 2,5 s, CLS < 0,1). Úvodní
stránka stáhne 410 kB ve 40 požadavcích. **Tady už není co získat** —
další práce na rychlosti je práce bez výnosu.

Jediná drobnost: posun 0,052 na úvodní stránce kolem druhé vteřiny
(`.msv-ovladani` a `#opp-list`). Je pod prahem a nestojí za honění;
kdyby se jednou šlo po něm, vede stopa k překreslení výpisu.

**Platí to o stránce, ne o databázi** — a to je rozdíl, který tahle
kapitola původně nedělala. Databáze se tehdy neměřila vůbec. Když
se změřila (17. 10., na čistém PostgreSQL 16 s 50 000 inzeráty
a 200 000 zprávami), ukázalo se, že `unread_count()` — dotaz, který
se počítá při otevření **každé** stránky kvůli odznaku v nabídce —
trval 353 ms, protože podmínku s OR neumí PostgreSQL obsloužit
indexem. Po přepsání 1,3 ms. Na dnešních datech by to nikdo
nepoznal: v tabulkách jsou jednotky řádků. Poznalo by se to až ve
chvíli, kdy by web začal růst — tedy přesně tehdy, kdy je na ladění
nejmíň času. Podrobnosti v `docs/optimalizace.md`.

Z toho plyne i obecnější poučení pro tenhle dokument: *„rychlost je
hotová"* smí platit jen o tom, co se opravdu změřilo.

### Strukturovaná data

Stav: **2 275 bloků, všechny platný JSON** — `Place` + `BreadcrumbList`
na stránkách pozemků, `CollectionPage` na krajských a okresních,
`Article` u rádců (drobečky jim právě přibyly).

* **FAQPage nerozšiřovat.** Google v roce 2023 omezil zobrazování FAQ
  na výsledky několika typů webů; psát další FAQ kvůli rich snippetům
  je dnes práce do koše. Psát je kvůli lidem je něco jiného.
* **`Organization` má smysl až s identitou.** Dokud je provozovatel
  anonymní, není co do značky napsat.
* **`RealEstateListing`** je schema.org typ bližší tomu, co stránky
  pozemků jsou, než `Place`. Nenese to zaručený rich snippet (Google
  pro nemovitosti žádný nemá), ale je to přesnější popis.

### Kde je organický růst

**Trvalou hodnotu nesou krajské, okresní a druhové stránky (104) plus
rádci (11). Stránky pozemků jsou z principu dočasné** — medián života
nabídky je 19 dní a 215 stránek je dnes `noindex`. Nestavte obsahovou
strategii na nich.

Tři směry, od nejlevnějšího:

1. **Prohloubit rádce.** Dnes mají 408–640 slov. Na dotazy jako „věcné
   břemeno pozemek" nebo „hypotéka na pozemek" to na první stranu
   nestačí; konkurence má násobek. Vzít tři nejbližší tématu webu
   a dotáhnout je na 1 500–2 000 slov s konkrétními čísly a odkazy na
   zákon — ne nalít vatu.
2. **Okresní stránky dotáhnout na „cena pozemku v okrese X".** Stránky
   už ta čísla počítají. Dotaz „ceny pozemků okres Kolín" má jasný
   úmysl a web na něj má lepší odpověď než kdokoli jiný, protože
   počítá z živých nabídek.
3. **Veřejná data jako obsah.** `data.html` nabízí data ke stažení —
   z archivu cen jde udělat pravidelný „přehled trhu", na který se
   odkazuje. Je to jediný druh obsahu, který roste sám s tím, jak web
   běží.

---

## 5. Roadmapa

### Rychlé výhry (do týdne, většinou ne kód)

* Nasadit `supabase/navstevnost.sql` a za měsíc si to přečíst.
* Zapnout e-maily hlídání (doména u Resendu, klíč do GitHub Secrets).
* U odhadu ceny doplnit, jak je nejistý; u druhů s chybou přes 50 %
  ho nevydávat.
* Na přihlašovací kartě hlídání napsat, co hlídání umí dnes.
* Nahradit obecná tvrzení čísly, která web stejně má („pět zdrojů,
  1 980 nabídek, kontrola před hodinou").

### Střednědobé (1–3 měsíce)

* **Sreality jako druhý velký zdroj.** Největší jednotlivá změna
  v užitečnosti webu.
* **Rozhodnout o identitě** a podle toho buď dodělat platby, nebo je
  z webu úplně odstranit (dnes je ten blok skrytý — to je mezistav).
* **Přenesení uložených pozemků do účtu**, nabídnuté ve správnou chvíli.
* **Tři rádce dotáhnout do hloubky** a propojit je s okresními
  stránkami.
* **Jedna otázka na detailu pozemku** jako trvalý kanál zpětné vazby.

### Dlouhodobé (3+ měsíců)

* **Odhad postavený na prodejních, ne nabídkových cenách.** Dnešní
  model měří, co lidé chtějí, ne za kolik se prodalo. Jakmile by byl
  zdroj realizovaných cen, je to skok v přesnosti, který nic jiného
  nenahradí.
* **Hlídání jako hlavní produkt.** Pozemek je nákup jednou za život —
  ale agentury, obce a developeři sledují trh trvale. Hlídání s e-maily,
  historií cen a exportem je to jediné, za co by někdo opravdu platil.
* **Vlastní inzerce, nebo konec.** Je postavená a prázdná. Za rok
  bez prvních inzerentů má smysl ji odstavit a nenést její údržbu —
  rozhodnutí je lepší než tiché čekání.
* **A/B testování**, ale až bude provoz na to, aby test něco změřil.
  Čísla jsou výš v oddílu 2.
