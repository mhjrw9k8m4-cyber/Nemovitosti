# Co webu chybí

Seznam je **měřený, ne vymyšlený** — u každé položky stojí číslo a jak
se zjistilo. Řazeno podle toho, kolik by to přineslo, ne podle toho, co
je snadné. U každé je napsané, kdo to může udělat: *já* (kód), nebo
*majitel* (účty, smlouvy, peníze).

Stav měření: 9. 10. 2026, 1 998 nabídek.

---

## 1. Čtyři pětiny nabídek visí na jednom zdroji — *já, ale potřebuje běh v CI*

| odkud | kolik |
|---|---|
| bezrealitky.cz | 1 629 (81 %) |
| bez odkazu (SPÚ) | 219 |
| okdrazby.cz | 125 |
| farmy.cz | 9 |
| ostatní dražební portály | 16 |

Kdyby bezrealitky změnily podobu stránky nebo robota zablokovaly, web
přijde o čtyři pětiny obsahu ze dne na den. Pojistky proti tichému
selhání jsou hotové a fungují (prázdný zdroj = stará data zůstanou
a úloha spadne, `scripts/fetch-opportunities.mjs`), jenže ty umí jen
**poznat**, že se to stalo. Nenahradí chybějící nabídky.

Chybí druhý velký zdroj. Nejlepší kandidát bez licenčních potíží je
**ÚZSVM** (veřejné nabídky majetku státu) a obecní úřední desky — data
jsou veřejná a nikdo je pořádně neagreguje. Sreality by přidal
`APIFY_TOKEN` (parser `fetchSreality` v kódu je), to je ale na majiteli.

**Poznámka z 9. 10.:** zkusil jsem k tomu sáhnout a z téhle strany to
nejde — ze sandboxu, kde pracuju, není vidět na internet vůbec (i
`example.com` vrací HTTP 000). Parser cizí stránky bych psal naslepo,
což je hádání, ne práce. Chce to nejdřív běh v CI, který tu stránku
stáhne a ukáže.

## 2. Žádné fotky, a nejde to obejít přímo — *já, oklikou*

U 1 998 stahovaných nabídek je fotek **nula**. Není to opomenutí:
cizí inzertní fotky se nesmějí přebírat a odkazovat se na ně napřímo
je křehké i sporné. Vlastní inzeráty fotky mají
(`docs/kontrola-fotek.md`).

Co se udělat **dá**: u pozemku je letecký snímek smysluplnější než
fotka od makléře, a stránka pozemku už leteckou vrstvu má. Chybí
v **kartě ve výpisu** a v náhledu při sdílení — ten je dnes obrázek
okresu, tedy u všech pozemků v okrese stejný.

**Posunuto 9. 10.:** náhledy pro sdílení mělo 91 stránek (kraje
a okresy) a všechny ostatní padaly na jeden společný obrázek webu —
odkaz na „les na prodej" nebo „pozemky do 500 tisíc" tedy ve zprávě
vypadal jako odkaz na úvodní stránku. Tematických náhledů je teď 14
dalších a `scripts/test-sdileni.mjs` hlídá obojí: že odkazovaný obrázek
existuje (překlep v názvu se jinak pozná teprve z poslané zprávy) a že
žádný vyrobený neleží ladem. U **jednotlivých pozemků** to pořád není
— 2 062 vlastních obrázků by znamenalo desítky megabajtů v repozitáři
a bez leteckého snímku by stejně nesly jen text, který už je v náhledu
napsaný.

## 3. ~~Stránky pozemků nemají strukturovanou cenu~~ — *hotovo 9. 10.*

Bylo 0 z 1 941. Teď nesou `Offer` s cenou v CZK a výměru jako
`QuantitativeValue`. Dražba dostává poznámku o vyvolávací ceně a
žádnou dostupnost, podíl se přizná. Hlídá
`scripts/test-nabidka-pro-stroje.mjs`.

Výhrada zůstává: Google pro pozemky nemá vyhrazený bohatý výsledek,
takže se nedá slíbit, že se cena ve výsledcích ukáže.

## 3b. ~~Upozornění mlčela o ceně, které web sám nevěří~~ — *hotovo 9. 10.*

E-mail uměl pojmenovat přiznaný spoluvlastnický podíl. Měřeno ale:
mezi nabídkami pod 20 Kč/m² je přiznaný podíl **jeden**, kdežto cen,
které cenový model označuje za pochybné, **93** — to varování tedy
chytalo jednu nabídku z 94. Zbytek jsou nepřiznané podíly a chyby ve
výměře (v datech je „stavební pozemek 3 315 m²" za tři koruny za
metr, tedy celý pozemek za deset tisíc). Rozesílač si teď načítá týž
model jako web a řádek nese „cena k ověření".

## 3c. ~~Web neuměl otázku „na co mám?"~~ — *přidáno 9. 10.*

Uměl odpovědět „kolik stojí pozemek tady". Otázku, kterou má kupující
první — *mám milion, kde za to něco koupím* — zadat nešlo.
`na-co-mam-pozemek.html` z rozpočtu a výměry spočítá, ve kterých
okresech se dnes dá koupit, a kolik jich tam je. Nic se nemodeluje:
počítají se nabídky, které jsou právě na trhu, takže je výsledek
ověřitelný fakt. Dražby, podíly a ceny, kterým web nevěří, se do toho
nepočítají — a je to na stránce napsané.

## 3d. ~~Rozpočet se nedal najít z vyhledávače~~ — *přidáno 9. 10.*

Nástroj z bodu 3c odpovídá na jakoukoli částku, ale žije ve skriptu —
do vyhledávače se z něj nedostane nic, a „pozemky do 500 tisíc" se
hledá pořád. Vznikly čtyři statické výpisy (200 tisíc, půl milionu,
milion, dva miliony) s vlastním obsahem, ne jedna šablona ve čtyřech
adresách.

Číslo, kvůli kterému ty stránky stojí za to: **do milionu korun je
v celé nabídce jeden jediný stavební pozemek ze 768.** Do dvou milionů
dvacet z 889. Kdo si myslí, že si za půl milionu koupí parcelu na dům,
to má vědět z první obrazovky, ne po projití sta inzerátů. Hlídá
`scripts/test-rozpocet-stranky.mjs` — 117 kontrol, každá přepočítaná
z `data/opportunities.json`, ne z generátoru.

## 3e. ~~Web neumí říct, co se na trhu POHNULO~~ — *přidáno 9. 10.*

Uměl říct, co na trhu je. To, co se na něm změnilo — a to je jediná
věc, pro kterou se člověk na takový web vrací — se dalo odebírat jen
kanálem RSS po krajích. Stránka, kam se dá poslat odkaz, nebyla žádná.

`nove-pozemky.html` má nově přidané po dnech, zlevněné (59),
**zdražené (5)** a zvlášť skokové změny k ověření (1). Zdražení se
neschovává záměrně: kdyby stránka ukazovala jen slevy, vypadal by trh
jako jednosměrka dolů.

Dvě věci, které tahle stránka musí přiznat, jinak je to lež, a obě
přiznává nad seznamem: „nové" znamená **nové v naší evidenci** (prvního
dne naskočilo naráz 1 600 nabídek, které na trhu byly dřív — ty se
nepočítají), a změna pod 3 % není zpráva.

Dvě chyby, které se při tom našly a opravily:

* Řez se nedal prokázat. Podmínku „vynechat první den evidence" jsem
  z generátoru zkusmo smazal a zkouška prošla **zeleně** — čtrnáctidenní
  okno ten den vylučuje samo, takže se chování na dnešních datech
  vyzkoušet nedá. Řez je proto ve `scripts/novinky-rez.mjs` jako
  funkce a zkouška jí podstrčí vzorek, kde první den evidence leží
  uvnitř okna. Teď sabotáž padá.
* „Za posledních sedm dní" počítalo **osm** kalendářních dnů (od
  `dnes − 7`). Na dnešních datech je v tom čtrnáct nabídek — číslo
  nadsazené ve vlastní prospěch.

## 3f. ~~Ze stránky pozemku nevedl odkaz nikam do webu~~ — *opraveno 9. 10.*

Naměřeno v prohlížeči na hotové stránce, ne ve zdroji — a jen tak se to
dalo najít. Stránka pozemku má statickou část (pro vyhledávače a pro
toho, kdo nemá JavaScript) a plný detail, který `js/pozemek.js` po
načtení vykreslí **na její místo**: přepíše celý `#pz-detail`. Odkaz na
okresní stránku stál jen v té statické části, takže ho viděl výhradně
robot. Z vykresleného detailu nevedl **ani jeden** odkaz na okres, kraj
ani druh pozemku — a přitom je stránka pozemku u 1 941 adres ta hlavní
cesta dovnitř webu. Kdo přišel z vyhledávače na jednu parcelu, měl
odsud na výběr mapu, obec v mapě a čtyři srovnatelné pozemky.

Nově je na konci rozcestník **Kam dál**: okres, kraj, druh a nejnižší
rozpočtová hladina, do které se cena vejde. 1 941 stránek ho má,
z toho 1 416 se čtyřmi dlaždicemi, 449 se třemi a 76 se dvěma — podle
toho, které regionální stránky dnes vznikly. Vnitřních odkazů na webu
přibylo 7 163. Kraj se zároveň přidal do drobečků ve strukturovaných
datech; hierarchie je Pozemky › kraj › okres › pozemek a krajský stupeň
se dosud přeskakoval.

Odkazuje se jen na soubory, které opravdu leží na disku (okresní
stránka vzniká od tří nabídek, krajská od patnácti, druhová i
rozpočtová od čtyřiceti). Počty nabídek v dlaždicích **schválně
nejsou**: spočítat „35 nabídek v okrese" by znamenalo druhé místo,
které to číslo počítá, a okresní stránka si ho počítá po svém.

Při tom se našly a opravily tři další věci:

* Tabulka krajů a tabulka druhových stránek ležely uvnitř generátoru
  regionů. Jakmile na ně měla odkazovat i stránka pozemku, byly by to
  dvě kopie téhož — jsou teď ve `scripts/regiony-meta.mjs`. Dvě
  zkoušky si je přitom vytahovaly ze **zdroje** generátoru regulárním
  výrazem; přestěhování jim vzorek rozbilo a obě to hlasitě ohlásily.
  Čtou teď tentýž modul, ne text souboru.
* Ve vloženém stylu stránky pozemku zůstala dvě mrtvá pravidla po
  přejmenování (`.pv-fill` a `.pz-term`, k tomu osiřelé `@keyframes
  pruhNajed` v `css/styles.css`) — 901 bajtů ve zdroji, který se
  vkládá do každé z 1 941 stránek.
* Pravidlo „neodkazuj na stránku, která neexistuje" se na dnešních
  datech **vyzkoušet nedalo**: všech 77 okresů, ve kterých nějaký
  pozemek je, svou stránku má, takže sabotáž (ověřování vypuštěno)
  prošla zeleně. Zkouška proto skládá rozcestník i pro podstrčené
  nabídky — neznámý okres, druh bez stránky, cena nad nejvyšší mez,
  dražba. Teď sabotáž padá.

## 3g. ~~Vložený styl posílal komentáře do 2 062 stránek~~ — *opraveno 9. 10.*

Stránka pozemku si nese vlastní `<style>` přímo v HTML, a má to důvod:
detail se otevírá z výsledků hledání a čeká se u něj na cenu, takže se
nemá čekat ještě na druhý soubor. Jenže ten vložený styl se jako jediná
cesta ke čtenáři **nečistil**. `css/styles.css` i `js/*.js` se zbavují
komentářů už dávno (`scripts/minifikace.mjs`); vložený styl si je nesl
do každé z 2 062 vygenerovaných stránek pozemků.

Naměřeno: 37,9 kB vloženého stylu, z toho 16,5 kB komentářů. Napříč
webem **32,9 MB**, které nikdo nikdy nepřečte — a přes drát 7,2 kB
při každém otevření inzerátu (celá stránka gzipem 17,0 kB → 9,8 kB,
tedy o 42 % méně). Je to zrovna ta stránka, na kterou lidé přicházejí
z vyhledávače.

Čistí se **jen vygenerované stránky**, ne předloha `pozemek.html` ani
ručně psané stránky: předloha je zdroj a komentáře v ní jsou to, podle
čeho se styl upravuje.

> **DOPSÁNO 19. 10.: předloha se od výstupu oddělila.** Strop na její
> velikost (41 kB) se naplnil do bajtu a stal se tím stropem na
> KOMENTÁŘE. Zdroj vloženého stylu je dnes `css/pozemek-vlozeny.css`
> (42 kB i s komentáři, bez stropu) a do `<style>` ve `pozemek.html` ho
> vkládá už očištěný `scripts/vloz-styl-pozemku.mjs` — tedy týmž
> čističem a se stejným výsledkem, jaký měly vygenerované stránky
> (ověřeno znak po znaku). `pozemek.html` spadla z **52,0 na 29,7 kB**,
> a je to stránka, na kterou se chodí z mapy z každé stránky pozemku. Čistič je týž, jakým prochází `css/styles.css`,
a výsledek je znak po znaku tentýž styl — ověřeno porovnáním po
odstranění komentářů, mezer a středníku před závorkou.

Úklid sedí v **generátoru**, ne až v minifikaci, a stálo to jeden
pokus navíc. Napoprvé jsem ho dal do `scripts/minifikace.mjs` —
a `scripts/test-oprav.mjs` pak spadl na 1 944 rozešlých stránkách.
Důvod: generátor stránek pozemků pouští i jiné zkoušky
(`scripts/test-ukonceno.mjs` staví zkušební osiřelou stránku), takže
po nich zůstal strom, který se se sestavením neshoduje. Dnes v CI
běží `test-oprav` dřív, takže by se to projevilo až při přeházení
pořadí — tiše a jinde. Teď platí, že co generátor zapíše, je hotové.

Strop velikosti v `scripts/test-vlozeny-styl.mjs` se tím musel
přepsat: dosud měřil předlohu **i s komentáři** („do stránek se
vkládají taky"), což přestalo platit. Měřit dál předlohu by znamenalo
hlídat číslo, které nikdo nestahuje — a hlavně by komentáře zdražovaly
styl, takže by se vyplatilo je nepsat. Měří se teď hotová stránka
(21,0 kB, strop 24) a zvlášť se hlídá, že se komentáře do hotových
stránek opravdu nedostanou a že z předlohy nezmizí.

## 3h. ~~128 ukončených stránek hlásilo „Pozemek nenalezen"~~ — *opraveno 9. 10.*

Generátor stránky zmizelých nabídek schválně **nemaže**. Nechává na
nich všechno, co o pozemku víme — cenu, výměru, parcelu, zdroj, tři
podobné pozemky v okrese — a přidá pruh „Tato nabídka už není
aktuální" i s datem. Důvod je v generátoru napsaný: smazaná stránka
vrátí 404 a neřekne nic, a hlavní aktivum webu jsou zaindexované
adresy. Hlídá to `scripts/test-ukonceno.mjs` — jenže **ze souboru**,
a soubor byl v pořádku.

V prohlížeči to dopadlo jinak. Nabídka v datech logicky není (proto je
stránka ukončená), `js/pozemek.js` ji nenašel a celý `#pz-detail`
přepsal hláškou **„Pozemek nenalezen"**. Pro člověka prázdná stránka,
pro vyhledávač měkká čtyřistačtyřka — přesně to, čemu se mělo
předejít. Takových stránek bylo **124 ze 127** a žádná zkouška to
neviděla, protože všechny četly HTML, ne vykreslenou stránku.

Zbylé tři byly druhá strana téže mince: jejich nabídka v datech pořád
je (dostala jen jiný soubor, stránky se rozlišují otiskem klíče),
takže se vykreslily jako **živé** — na adrese, která o sobě o kus výš
tvrdí, že aktuální není. Dvě adresy s týmž obsahem a jedna si
odporuje. Rozhoduje pruh: ukončená stránka se už nepřekresluje.

Nová zkouška `scripts/test-ukoncena-v-prohlizeci.mjs` otevírá vzorek
v prohlížeči a hlídá obojí — že ukončená stránka svůj obsah udrží,
**a** že se hláška pořád objeví tam, kam patří (`pozemek.html`
s neznámým klíčem, i s `noindex`). Do vzorku se schválně přidávají ty
tři těžké případy. Dvě sabotáže vyzkoušeny, obě padají.

## 3i. ~~Emodži z cizího inzerátu uprostřed věty~~ — *opraveno 9. 10.*

Nahlásila to `scripts/test-pisma.mjs` po obnově dat: prohledá všechny
zdroje webu (2 210 souborů, 160 různých znaků) a ověří, že každý
znak leží v podřezané sadě písem. Jeden neležel — 📝 v popisu od
inzerenta („📝 Popis nemovitosti"). Žádné textové písmo emodži nemá,
takže by se vykreslil systémovým emodži písmem uprostřed věty, jinou
velikostí i barvou, na webu, který jinak emodži nikde nepoužívá.

Čistí se **při stahování** (`scripts/text-inzeratu.mjs`, volá
`fetch-opportunities.mjs`), ne při skládání stránek: tam text do
repozitáře vstupuje a je to jedno místo. Kdyby se čistil až
v generátoru, zůstala by ozdoba v `data/popisy.json`, který se
publikuje taky — a zkouška by pořád padala.

Nemaže se víc, než je potřeba: °, ², ×, –, €, šipky i zaškrtnutí ✓
v sadě jsou a zůstávají. Ze 1 620 popisů se změnily tři a žádný
nezůstal prázdný.

## 3j. ~~Nadpis pozemku byl po vykreslení jen jméno obce~~ — *opraveno 9. 10.*

Táž dvojí podoba stránky jako u bodu 3h, jen jinde. Servírovaný `<h1>`,
`<title>` i strukturovaná data nesly jedinečný **„Trvalý travní porost
4 889 m² — Bystřice"**. `js/pozemek.js` ale `#pz-detail` přepíše celý
a nadpis skládal po svém: **„Bystřice"**. A protože vyhledávač stránku
vykresluje, počítá se ten druhý.

Naměřeno: **1 269 z 1 941** stránek (65 %) mělo po vykreslení nadpis
shodný s nějakou jinou — osmnáct se jich jmenovalo „Slatina",
sedmnáct „Brno", sedmnáct „Praha". Totéž u titulku: servírované
„… | Parcelka" skript přepisoval na „Bystřice — 190 550 Kč ·
Parcelka". Po opravě sdílí nadpis znění s jinou stránkou **0 %**;
titul se skládá jedním místem (generátor, i s rozlišením shodných
titulků) a do stránky jde ostrůvkem.

Při tom vzniklo a hned se opravilo nové zdvojení: rozlišení přidává
do nadpisu i okres (u 1 433 z 1 944 nabídek, aby se dvě stejně velké
parcely v „Chlumu" daly rozeznat), takže pod nadpisem
„… — Luhačovice, okres Zlín" stálo ještě jednou „okres Zlín". Řádek
pod nadpisem okres vypíše, jen když v nadpisu není; čtvrť tam zůstává
vždycky.

Na telefonu (390 px) má nadpis dva řádky u mediánu a tři u nejdelších
jmen — 97 px, cena pořád nad ohybem. Měřeno, ne odhadnuto.

Hlídá to `scripts/test-hlavicka-pozemku.mjs`: porovnává servírovanou
a vykreslenou podobu v prohlížeči. Pět sabotáží vyzkoušeno, všechny
padají.

## 3k. ~~Odznak nad snímkem byl na telefonu 202 px vysoký~~ — *opraveno 9. 10.*

Všimnul jsem si toho na snímku obrazovky při měření nadpisu výš.
Odznak „Na prodej" nad náhledem pozemku měl na displeji 390 px
**95 × 202 px místo 95 × 31** a protože má rozostřené pozadí
(`backdrop-filter`), rozmazal popisku pod sebou: jméno obce i výměra
byly nečitelné.

Příčina je sdílené pravidlo. V úzkém zobrazení se odznak posouvá na
`bottom:7px` — a to kvůli **kartám na mapě**, kde je náhled vysoký
116 px a nahoře sedí záložka. Stránka pozemku mu dává `top:13px`
(vyšší váha selektoru), jenže `bottom` nic nepřebíjelo, takže se
odznak natáhl mezi oba okraje. Hero snímek na stránce pozemku je
358 px široký; pravidla pro stopadesátipixelovou kartu na něj
nepatří, teď se tedy ruší výslovně (`bottom:auto`, a u počtu fotek
`display`).

Na širokém displeji to bylo celou dobu v pořádku — kontrola, která se
nepodívá na telefon, by to minula. Nová kontrola proto měří na 390 px.

Zkouška `scripts/test-hlavicka-pozemku.mjs` (9 kontrol) porovnává
servírovanou a vykreslenou podobu v prohlížeči a měří hlavičku na
telefonu. Šest sabotáží vyzkoušeno, všechny padají.

## 3l. ~~Tlačítko „Vrátit" po skrytí pozemku nedělalo nic~~ — *opraveno 9. 10.*

Ve výpisu jde pozemek křížkem skrýt. Tlačítko „Vrátit" v hlášce, která
se po tom ukáže, vzniklo kvůli konkrétní stížnosti: *„klikám na
pozemky a skrývají se mi a nevím proč, a nejdou dát pryč."* Jenže
nefungovalo — pozemek zůstal skrytý a seznam se ani nepřekreslil.

Je to chyba v klíči. `prepniSkryty` ukládá `PKKlic.klicPozemku`
(pkey + výměra) od chvíle, kdy se **hrubý** pkey ukázal jako
nedostatečný (jeden klíč v Jirnech označil pět různých pozemků za 6,6
až 11,2 milionu). Na `odskryj` se při té opravě zapomnělo: hledala
dál hrubý pkey, nenašla nic a vrátila `false`. Teď se ptá přes
`PKKlic.klicVe`, který zná obě podoby klíče — takže se vrátí i to, co
si člověk skryl pod starým tvarem.

**Zkouška to hlásila celou dobu.** `scripts/test-pamet.mjs` na to má
kontrolu. Jenže prohlížečová úloha v CI se při každém dalším pushi
zrušila dřív, než se k ní dostala: v posledních devíti bězích je
pětkrát `cancelled` a běhy, které doběhly, padaly na něčem dřívějším.
Červená zkouška, ke které se nedoběhne, je stejně užitečná jako
žádná.

A zkouška sama měla vadu v hlášení: když karta ve výpisu nebyla,
spadla na `TypeError: Cannot read properties of undefined` — takže
v CI zbyla jen ta věta a všech čtrnáct kontrol, které předtím prošly,
se nevypsalo. Hledání karty je teď v jedné funkci, která z chybějící
karty udělá čitelnou větu i s výpisem toho, co ve výpisu opravdu je.
Po sabotáži (klíč zpátky na hrubý) vyjde: „„Vrátit" vrátí pozemek do
výpisu ✕" a hned pod tím proč.

## 3m. ~~U 537 stránek se prodává podíl a název o tom mlčel~~ — *opraveno 9. 10.*

U čtvrtiny nabídek (525 z 2 001) se neprodává pozemek, ale
**spoluvlastnický podíl**: cena je za zlomek, výměra je celé parcely.
Tělo stránky to říká jasně a strukturovaná data to mají ve výhradě
u ceny — ale titulek, nadpis, popisek ani jméno ve strukturovaných
datech o tom neřekly nic. **Ani jedna z 537 stránek** neměla slovo
„podíl" v názvu.

Nejhůř to zní tam, kde je podíl malý: *„Lesní pozemek 547 418 m²"* za
**42 000 Kč**. Půl milionu metrů za čtyřicet tisíc. Ve výsledku
vyhledávače a ve sdíleném odkazu je přitom vidět jen tenhle řádek —
tedy přesně to tvrzení, kterému se web všude jinde vyhýbá. V
generátoru u toho navíc stálo, že se „nabídka popíše jako podíl rovnou
v názvu"; nepopisovala.

Nově: *„Lesní pozemek 547 418 m², podíl 1/88 — Hodonín, okres
Hodonín"*. Zlomek známe u 515 z 525 nabídek, takže se píše konkrétně;
u zbylých deseti aspoň „spoluvlastnický podíl". Podíl ustupuje
z titulku až jako poslední — dřív se vzdá okres i výměra, a když ani
to nestačí, i druh pozemku („Podíl 1/2 — Mikulášovice, 120 000 Kč").
**521 z 521** živých stránek podílů ho teď v názvu má a žádný titulek
nepřesáhl mez 65 znaků.

Jednu výjimku si to vyžádalo a stojí za zapsání, protože vypadá jako
ústupek a není: u 17 z 511 nabídek se zlomek **i výměra** do titulku
nevejdou, a tam ustupuje zlomek. Důvod je ve Strunkovicích nad
Blanicí — dvě nabídky, obě 29 900 Kč, obě podíl 1/10, liší se jedině
výměrou (1 026 a 1 017 m²). Kdyby ustoupila výměra, měly by obě
TÝŽ titulek a vyhledávač by jednu z nich zahodil. „Orná půda
1 026 m², podíl — Strunkovice" říká to podstatné a zároveň odliší.

Vedlejší zisk: stránek se shodným nadpisem ubylo ze 44 na **2**.

Zkouška `scripts/test-podil-v-nazvu.mjs` (12 kontrol) čte hotové
stránky a porovnává je s daty. Hlídá i opačný směr — že se slovo
„podíl" neobjevilo plošně i tam, kde žádný podíl není. Dvě sabotáže
vyzkoušeny, obě padají.

## 3n. ~~Rozcestník „Kam dál" přetáhl stránku přes mez délky~~ — *opraveno 9. 10.*

Vlastní regres z bodu 3f, chycený zkouškou `test-poradi-pozemku`:
stránka pozemku se má vejít do **4,2 obrazovky telefonu** (mez je
naměřená proti stavu 4,7 před předěláním). Rozcestník přidal na
telefonu 330 px a nadpis z bodu 3j vyrostl z jednoho řádku na tři —
naměřeno **3 429 px = 4,3 obrazovky**.

Mez jsem nezvedal: zvednout ji kvůli vlastnímu přírůstku znamená
tiše zrušit pravidlo, které jsem porušil. Dlaždice jsou místo toho
na úzkém displeji ve dvou sloupcích a bez podtitulků — jména („Okres
Benešov", „Středočeský kraj") říkají, kam vedou, i bez nich; na
širokém displeji podtitulky zůstávají. Blok ze **330 na 150 px**,
stránka na **3 325 px = 4,16 obrazovky**.

K tomu pojistka navíc: `test-kam-dal` teď kontroluje výšku dlaždice
i v úzkém zobrazení, ne jen v základním pravidle. Zmenšovat se smí,
ale ne pod dotykové minimum 44 px — a zrovna na telefonu se na ni
klepe prstem.

**Dodatek z 9. 10. večer, a je to druhý vlastní regres z téže opravy.**
Odstup nadpisu rozcestníku jsem na úzkém displeji napsal „od oka" na
**24 px**. Jenže odstupy na stránce pozemku smí být jen ze slovníku
**8/10/20/40 px** a hlídá to `scripts/test-parametry.mjs`. Chytila to
teprve **plná dávka** sta prohlížečových zkoušek — cílené dávky, které
jsem u té opravy pouštěl (`test-kam-dal`, `test-poradi-pozemku`), na to
nesahají. Změněno na 20 px; rozdíl čtyř pixelů nikdo nepozná,
rozsypaný slovník ano.

## 3o. ~~Dvě zkoušky hlídaly klíč, který se před rokem změnil~~ — *opraveno 9. 10.*

Vedlejší nález k bodu 3l. Commit, který zavedl klíč `pkey + výměra`
(aby jeden klíč neoznačoval pět různých pozemků), po sobě nechal tři
věci: jednu skutečnou vadu — nefunkční „Vrátit" — a dvě zkoušky,
které si dál sahaly pro **hrubý** klíč.

`scripts/test-rychly-prohlizec.mjs` ověřoval, že se poznámka z
rychlého výběru uloží pod klíč té karty. Četl `data-pk`, což je hrubý
pkey, zatímco poznámky se ukládají pod `klicPozemku`. **V aplikaci to
bylo celou dobu v pořádku** — poznámka se ukládá správně; zkouška to
jen nedokázala ověřit a hlásila vadu, která tam není. Skládá teď klíč
stejně jako `scripts/test-poznamky.mjs`, tedy z `data-pk` a výměry,
kterou karta ukazuje.

Proč se na to přišlo až teď: prohlížečová úloha v CI se při každém
dalším pushi zrušila dřív, než se k těm zkouškám dostala. Pomohlo
teprve pustit **všech 101 prohlížečových zkoušek najednou** lokálně,
kde je nic nezruší — 99 zelených, tyhle dvě červené.

## 3p. ~~Všech 162 zkoušek psalo do CI tutéž nicneříkající větu~~ — *opraveno 9. 10.*

Nález z vlastní práce, a stál mě dnes nejvíc času. Když zkouška
spadne v CI, z celého výpisu se do přehledu a do e-mailu dostane
jedině řádek `::error::`. A na něm stálo u všech zkoušek totéž:

```
::error::Stabilita: 1 kontrol neprošlo.
```

Která kontrola a proč, zůstalo ve výpisu běhu — a ten se u běhu,
který přepsal další push, už nedá stáhnout (jde jen o anotace, a ty
nesou právě tenhle jediný řádek). Diagnóza proto začínala tím, že se
celý běh musel zopakovat místně. U zkoušky, která **místně projde**,
nezačala vůbec: zrovna `test-stabilita` padla v CI a místně dala
50 z 50 v pořádku padesátkrát za sebou.

Přitom to v každé zkoušce leželo připravené. Pole `zpravy` nese
u každé padlé kontroly jméno a hned pod ním naměřený důvod — jen se
do hlášky nepsalo. Změřeno před opravou: **126 zkoušek** s touto
hláškou, z toho **126** má pole `zpravy`, a v něm **126** značku ✕.
Ani jedna výjimka, takže se to dalo opravit mechanicky.

Nově `scripts/chyby-hlaska.mjs` složí z padlých kontrol jednu řádku
(víc `::error::` neunese): čtyři jmenovitě, zbytek sečte, nad 900
znaků zkrátí sám, ať to nedělá přehled CI bez varování. Z téhle
sabotáže je vidět, co by to bylo ušetřilo:

```
::error::Okresy: 10 kontrol neprošlo. Co padlo: Holedeč → okres Louny
vyšlo: Louny | Veselí nad Lužnicí → okres Tábor vyšlo: Tábor | …a dalších 6
```

Zapojeno ve **162 zkouškách** (těch 126 plus zkoušky, které hlášku
píšou v jiném tvaru). `scripts/test-chybova-hlaska.mjs` hlídá jak
funkci samu (10 kontrol), tak to, že si ji **všechny** zkoušky
opravdu volají — jinak by se příští nová zkouška tiše vrátila
k tomu, co se právě opravilo. Dvě sabotáže vyzkoušeny, obě padají.

Vedlejší úklid: `test-nahoru` si tutéž věc psal zvlášť a ručně.
Teď volá společnou funkci, takže je implementace jedna.

## 3q. ~~Výpis stavebních pozemků slíbil stavební a stránka za odkazem říkala orná~~ — *opraveno 9. 10.*

Nález z přeměření toho, co tematické stránky tvrdí, proti datům:
u každé okresní, krajské, druhové a rozpočtové stránky jsem si ověřil,
že každý vypsaný pozemek opravdu patří tam, kde je. Ze 101 stránek
sedělo všechno kromě jednoho řádku.

Na `pozemky-stavebni.html` stálo **„stavební pozemek · 1 370 m² ·
okres Karviná"** za 999 000 Kč. Odkaz z toho řádku vedl na stránku
s nadpisem **„Orná půda 1 370 m²"**. Inzerát sám přitom píše: „Tento
pozemek je v současné době veden jako **orná půda**, avšak s možností
změny územního plánu v budoucnu může být ideální pro výstavbu."

Příčina: ten pozemek je na Bezrealitkách vyvěšený **dvakrát**, pod
dvěma čísly inzerátu (1050655 a 1050656), a prodejce u jednoho zvolil
„stavební pozemek" a u druhého „orná půda". Shodné je všechno
ostatní — obec, okres, souřadnice, výměra 1 370 m², cena. A obě
hlásí parcelu č. 232 v k. ú. Pudlov.

Web duplicity odstraňuje (`js/hlidani-logika.js`, `bezDuplicit`) —
ale `tyzPozemek` porovnává i **druh**, takže dva zápisy lišící se
jen prodejcovou škatulkou projdou jako dva různé pozemky. A protože
jméno stránky se skládá z klíče, výměry a ceny — a ty jsou shodné —
**stránka vznikla jen jedna**. Řádek stavebního pozemku tedy vedl na
stránku toho druhého zápisu.

Opraveno u zdroje, ne u následku: `bezDvojnic()` v
`scripts/fetch-opportunities.mjs` sloučí zápisy, které se liší jedině
číslem inzerátu. **Při rozporu v druhu zůstane ta méně tvrdící
varianta** — pozemek se nemá tvářit jako stavební, dokud o tom nemáme
doklad; stejné pravidlo jako u ceny za metr, která se u neznámého
podílu neuvádí vůbec.

Změřeno na 2 001 nabídkách: **12 takových dvojic**, všechny
z Bezrealitky, všechny se shodným dnem prvního vidění. Tři jsou
podíly — a i zlomek mají shodný (1/10, 1/2, 1/4), takže to nejsou dva
různé podíly na jedné parcele. Vyhazované zápisy nenesou nic, co by
ten ponechaný neměl: stejný počet polí, stejné sítě, stejné parcelní
číslo.

Jedenáct z těch dvanácti web nikomu neukazoval — `bezDuplicit` je
zahodil až u sebe, ale v `data/opportunities.json` ležely dál a
zabíraly místo ve stropu na zdroj. Dvanáctý, ten bohumínský, prošel
až na stránku. Čísla, která web o datech zveřejňuje, se změnila
z **1 945 / 2 001 / 56 duplicit** na **1 944 / 1 989 / 45** — ten
jeden ubraný ukazovaný pozemek je právě Bohumín.

Vedlejší nález: `data/popisy.json` se klíčuje týmž klíčem s cenou
a výměrou, takže si ty dvojice **přepisovaly text inzerátu** mezi
sebou. Teď je na klíč jeden.

`scripts/test-dvojnici.mjs` (18 kontrol) hlídá tři věci: funkci samu
na nasazených vzorcích — každý rozlišující údaj (výměra, cena,
parcelní číslo, typ, obec, okres, souřadnice) má vlastní kontrolu, že
se dvě různé nabídky **ne**sloučí, protože sloučit skutečné dvě by
bylo horší než nechat projít jednu duplicitu; dál že v hotových
datech nezůstal ani jeden dvojník; a nakonec invariant, na kterém to
celé stojí — že **každá nabídka má vlastní jméno stránky**. Právě ten
se v Bohumíně porušil. Sabotáž (data zpátky na stav před opravou)
hlásí obě poslední kontroly a jmenuje konkrétní pozemky.

## 3r. ~~Jedna kontrola tvrdila opak své vlastní věty — a byla zelená, protože vada existovala~~ — *opraveno 9. 10.*

Tohle vyplavala oprava z bodu 3q a stojí za zapsání celá, protože
ukazuje, jak se zkouška může obrátit proti smyslu, který má hlídat.

Po sloučení dvojníků spadla v CI prohlížečová zkouška
`test-klic-ulozenych` a anotace rovnou řekla, co padlo: *„a ty zbylé
se liší jen cenou (jinak by to byl nedodělek)"*. Na tom řádku stálo:

```js
pravda('a ty zbylé se liší jen cenou (jinak by to byl nedodělek)', jinak.length, 0);
```

Druhý argument je **výsledek**, třetí **důvod**. Tady na místě
výsledku stál POČET skupin, které se liší i jinak než cenou — a každý
nenulový počet je pravda. Kontrola tedy procházela právě tehdy, když
vada byla, a spadla ve chvíli, kdy se spravila. Nula na místě důvodu
je ta druhá polovina téhož překlepu: autor (já) zamýšlel porovnání
`=== 0` a napsal z něj dva argumenty.

Je to tiší druh vady než rozbitý web: zkouška neřekne nic a vypadá
zeleně, přičemž hlídá opak. Zvlášť nepříjemné je, že se chová jako
pojistka proti vadě, kterou si **vyžaduje**.

Opraveno na `jinak.length === 0` s čitelným důvodem. Sabotáž (vrátit
bohumínského dvojníka do dat) teď hlásí „✕ a ty zbylé se liší jen
cenou" — tedy správným směrem.

**Přeměřeno, jestli je to jev nebo ojedinělý překlep.** Napsal jsem
na to čtečku argumentů (ne regulární výraz — argumenty nesou vnořené
závorky, šablonové texty a čárky uvnitř) a prošel všech 163 zkoušek,
**2 300 volání** `pravda()`. Hledaly se dvě značky: číslo na místě
důvodu a počet bez porovnání na místě výsledku. **Jediný výskyt
v celém repozitáři** — ten výše.

Pojistka je v `scripts/test-chybova-hlaska.mjs`, kde už kontrakt
`pravda`/`zpravy` bydlí: důvod musí být text, protože jde do řádku
`::error::`, a výsledek nesmí být holý počet. Komentáře se před
hledáním vyhazují, jinak si lint najde sám sebe — vysvětlení nad ním
ten špatný tvar cituje. Sabotáž (nasadit ten tvar do
`test-okres.mjs`) padá.

## 3s. ~~Ukončená nabídka strojům tvrdila, že pořád platí~~ — *opraveno 9. 10.*

Z přeměření strukturovaných dat na všech 2 072 stránkách pozemků:
jestli se parsují, jestli cena v nich sedí s cenou na stránce, jestli
drobečky jdou po sobě od jedničky a jestli dostupnost odpovídá tomu,
co stránka říká.

Nesedělo poslední. Na ukončené stránce stojí nahoře pruh **„Tato
nabídka už není aktuální. Zmizela ze zdroje 4. 10. 2026."** — a pod
ním ve strukturovaných datech zůstávalo `availability: InStock`,
tedy strojové tvrzení, že nabídka platí. Popis pro stroje k tomu
začínal „Na prodej · 210 000 Kč". Člověk se dozvěděl pravdu, stroj
opak.

Naměřeno na 127 ukončených stránkách: **7** to tvrdilo, u jedné
dražby nestálo nic a zbylých 119 nabídku v datech vůbec nemá (cena 0).
Sedm je dnešní stav, ale roste to s každou skončenou nabídkou — a
skončí jich několik denně.

`OutOfStock`, ne `SoldOut`: nabídka zmizela ze zdroje, což neznamená,
že se prodala. `priceValidUntil` je ten den, kdy zmizela — po něm
o té ceně nic netvrdíme. Popis dostane dopředu tutéž větu, jakou má
pruh.

**Oprava musela jít dvěma cestami, a tohle je na tom to podstatné.**
`ukoncenaStranka()` se volá jen ve chvíli, kdy nabídka právě skončila.
Stránky, které skončily dřív, chodí jinou cestou — migracemi, které
se musí dostat na každou stránku webu. Kdyby se to opravilo jen v té
první, zůstalo by těch sedm stránek tvrdit InStock navždy. Přepis je
proto vlastní funkce `migrujUkoncenaData()` zapojená v obou.

Zkouška v `scripts/test-ukonceno.mjs` (28 kontrol, dřív 18) měří
obojí: na nasazené stránce cestu „nabídka právě skončila" (OutOfStock,
`priceValidUntil`, věta v popisu, a že se druhým během nezdvojí)
a pak celý hotový strom — 127 ukončených a 1 944 živých stránek:
žádná ukončená strojově netvrdí, že platí, a **žádné živé se to
pravidlo nerozlilo**. Sabotáž (vypnout migraci a vrátit jedné stránce
InStock) hlásí „✕ ani jedna ukončená stránka strojově netvrdí, že
nabídka platí" a jmenuje ji.

Dvě věci, které z téhož měření vyšly jako **správné**, a tak je tu
nehlásím jako nález: u 111 živých dražeb `availability` chybí
schválně (vyvolávací cena není nabídka k prodeji, viz komentář
v generátoru) a `pozemek-od-obce.html` je ručně psaná stránka, která
se mi do měření připletla jménem.

## 3t. ~~Pravidlo „nepiš do komentáře počet, který se mění sám" porušoval i soubor, kde je zapsané~~ — *opraveno 9. 10.*

V hlavičce `sw.js` stojí:

> *Číslo tu schválně nestojí. Stálo — „na 2 125 stránkách" — a za pár
> týdnů jich bylo 2 158, protože stránek pozemku přibývá a ubývá
> s nabídkami. Počet, který se mění sám od sebe, se do komentáře psát
> nemá: nikdo ho neopraví a začne lhát.*

O šedesát řádek níž v tomtéž souboru: *„Strop, aby úložiště nerostlo
donekonečna. **Stránek je 2 130** a nabídky se obnovují čtyřikrát
denně…"*. A v `js/hlavicka.js`: *„Proč skriptem a ne do HTML: **stránek
je 2 105** a většina se generuje."*

Skutečný počet: **2 207**. Obě čísla tedy lhala přesně tak, jak to ta
hlavička předpovídá. Je to nejmenší z dnešních nálezů — nic se tím
nerozbije — ale je to měřitelné a opravitelné, a hlavně se to dá
uhlídat, aby se to nevracelo.

Čísla jsou pryč; místo nich je odkaz na to, kde se počítají
(`scripts/test-staticka.mjs` je vypisuje při každém běhu).

Pojistka je tam, kde se ty stránky počítají. Hlídá se **jen přítomný
čas s číslem** („stránek je 2 105"); naměřený stav v minulém čase
(„na 2 105 stránkách", „naměřeno na 2 001 nabídkách") je něco jiného
— ten se měnit NEMÁ, protože popisuje, co se tehdy změřilo.

Lint při prvním běhu narazil na dvě místa typu *„z 2 014 nabídek je
1 852 na prodej (92 %)"*. Správná odpověď byla **zúžit lint**, ne
přepsat poctivě naměřené číslo: pravidlo je o počtu stránek, ne o větě,
která říká, co se naměřilo. Sabotáž (vrátit do `sw.js` „Stránek je
2 130") padá a jmenuje soubor i řádek.

## 3u. ~~Zkouška, která hlídá nejdražší chybu webu, po včerejší opravě přestala měřit~~ — *opraveno 9. 10.*

`test-shoda` hlídá to, co kdysi proklouzlo na **310 stránek**: aby na
stránce pozemku stálo procento z modelu BEZ duplicit, tedy totéž, co
ukazuje mapa. Dělá to tak, že postaví model ze syrové i z očištěné
hromádky, najde pozemky, kde se rozcházejí, a ty stránky **opravdu
otevře** a přečte z nich větu.

Po sloučení dvojníků (bod 3q) spadla. Anotace z CI řekla rovnou co:
*„percentil jinak u 40, odhad u 0"* a *„našly se pozemky, u kterých se
úroveň srovnání liší (0)"*.

Přeměřeno na obou verzích dat:

| | syrově → čistě | percentil jinak | jiná ÚROVEŇ | jiné ČÍSLO |
|---|---|---|---|---|
| před sloučením | 2 001 → 1 945 | 299 | **6** | 186 |
| po sloučení | 1 989 → 1 944 | 40 | **0** | 33 |

Zkouška si vybírala vzorky **jen podle rozdílu v úrovni** srovnání
(okres × kraj) — a těch šest pozemků, na kterých to stálo, bylo mezi
dvojníky. Zbylo třiatřicet pozemků, kde se při téže úrovni liší
procento, a to stránka vypisuje jako „Levnější než 28 %". Zkouška se
tím sama odřízla od jediného rozdílu, který v datech zůstal.

Nově bere oba druhy rozdílu, úrovňové první (silnější signál). U procent
je potřeba opatrnost navíc: u prostřední ceny stojí ve větě „zhruba
uprostřed" bez čísla, a taková stránka se **nepočítá za změřenou** —
jinak by kontrola prošla naprázdno.

A při tom vyplavala **druhá vada, tentokrát v samotné kontrole**. Model
vrací `cheaper` (kolik procent je levnějších) a `pct = 100 − cheaper`;
stránka u výhodné ceny píše „Levnější než *cheaper* %", u vyšší „Dražší
než *pct* %". Kontrola porovnávala vždycky s `cheaper`, takže na každé
stránce s větou „Dražší" hlásila rozdíl, který tam není. Nikdo si toho
nevšiml, protože vzorky dosud padaly jen na věty „Levnější" — první
vzorek z nové sady to odhalil hned: Dolní Týnec, stránka *„Dražší než
72 %"*, model `cheaper` 28. Totéž číslo, jen z druhé strany.

Obě věci opravené, 27 kontrol prochází. Sabotáž: nechat kontrolu čekat
číslo ze SYROVÉHO modelu — padá, tedy stránky opravdu berou ten
očištěný.

Vedlejší zjištění, které stojí za zapsání: u mezí se vyžadovalo
`percentil jinak > 20 && odhad jinak > 20`. Odhad je dnes 0 — zbylých
45 duplicit už neposune odhad obvyklé ceny ani u jedné nabídky. Na
odhadu se kontrola zastavovat nemá, protože **žádné z tvrzení níž odhad
nečte**; vypisuje se dál, jen se na něm neprochází.

## 3v. Zkouška stability: dva pozorovatelé, kteří se rozešli — a příčinou byla výměna písma — *opraveno 10. 10.*

Přímé pokračování bodu 3p. Jmenovitá hláška v CI poprvé řekla, co
`test-stabilita` vlastně nahlásila:

```
Stabilita: 1 kontrol neprošlo. Co padlo: monitor · hlidani.html:
rozvržení neposkakuje (CLS 0.2426 ≤ 0.05) 86 ms, 0.243: DIV.wrap, ?, ?
```

Tedy: stránka hlídání, na monitoru, posun **0,2426** (mez je 0,05)
v 86. milisekundě, a viník `DIV.wrap`. To je o celé řády víc, než
čeho jsem se dopátral místně.

**Co jsem vyzkoušel a nevyšlo.** Místně dává zkouška 50 z 50
v pořádku. Postavil jsem si k tomu vlastní měření se zpomalením
procesoru 1×, 4× a 8× (přes CDP `Emulation.setCPUThrottlingRate`):
CLS vždy **0,0037**, vždy z téhož uzlu `DIV.wrap`, jen se posouvá čas
(104 → 318 → 673 ms). **Rozdíl tedy není v rychlosti stroje.** Písma
leží u nás v `fonts/` a přednačítají se, takže ani teorie „v CI dojede
webfont a text přeteče" neplatí — v obou prostředích se berou ze
stejného místa.

**Co se ale opravit dalo, a je to nález sám pro sebe.** Pozorovatel
posunů byl v tom souboru **dvakrát** a ty dvě kopie se už rozešly:
jedna u uzlu vypisovala i třídu, druhá jen značku a id. Odtud ta
nicneříkající část hlášky („`DIV.wrap, ?, ?`" — dva ze tří zdrojů bez
jména). Teď je pozorovatel jeden a ke každému posunu připisuje
**geometrii**: odkud kam se obdélník posunul a jak byl vysoký.

Místně to vypadá takhle:

```
106 ms, 0.004: DIV.wrap [334/566→342/558]
```

Tedy posun o **8 px** dolů a o 8 px nižší blok. V CI z toho bude
vidět, o kolik se to posunulo tam — a teprve pak se dá hledat příčina.
Dokud na hlášce stál jen součet, nedalo se hádat vůbec.

**Co k tomu přibylo 10. 10.** Změřeno na pomalé lince (400 kb/s,
odezva 300 ms), protože na místní rychlosti se nic nehne:

* úvodní stránka: CLS **0,0212**, zdroj výpis
  (`UL.opp-list [579/265→637/207]`, lišta nad ním `525→547`);
* stránka hlídání: CLS **0,0377** (mez je 0,05, tedy blízko), a to ze
  dvou posunů — `DIV.wrap [381/463→389/455]` v 2,6 s a větší
  `0,0325` ve 3,15 s, kde se hýbou prvky u horního kraje
  (`A [60/44]`, dva už odstraněné uzly `190→188` a `215→238`).

**Dvě hypotézy vyvrácené měřením, ať se k nim nikdo nevrací:**
pozdě dojeté písmo (CLS 0,0212 se přednačtením ext i bez něj naprosto
stejně — viz zamítnuté nápady níž) a hlavička (`js/hlavicka.js`
zablokovaný: CLS zůstal 0,0377 do znaku stejný).

Co zůstalo jako kandidát a **nedá se zatím potvrdit**: rezerva místa
pro obsah, který dojde skriptem (`.hl-load{min-height}` na stránce
hlídání). Jednou mi vyšlo, že hotový obsah má 911 px proti rezervě
862/880, jinde zase 911 proti 911 — kostra je tak brzo přepsaná, že se
nedá spolehlivě změřit. **Ladit rezervu podle takhle rozkmitaného
čísla nebudu:** přesně tím se dnešní hodnoty 862/880 dostaly tam, kde
jsou (komentář u nich vypisuje kroky 296 → 340 → 370 px), a znovu by
to byla jen jiná náhodná čísla.

Zapsané jako **rozpracované**, ne opravené: vím, kde to padá, čím to
NENÍ, a kde to dál hledat. Příští červený běh v CI má teď v hlášce
geometrii posunu, a teprve z té se dá rozhodnout.

### Co k tomu přibylo 10. 10. večer: historie běhů

Geometrie v hlášce už něco vynesla. Prošel jsem **historii běhů CI** a
porovnal ji s místním měřením:

1. **Není to pokaždé.** Z běhů, které se k tomuhle kroku vůbec
   dostaly, **pětkrát spadl, čtyřikrát prošel**. Zbytek (16) se k němu
   nedostal, protože úloha skončila dřív na jiné zkoušce — tím se
   vysvětluje, proč to vypadalo jako „padá to pořád".
2. **Když spadne, je to pokaždé TOTÉŽ ČÍSLO** — 0,2426 na čtyři
   desetinná místa, a tytéž obdélníky. Žádné kolísání podle rychlosti
   stroje: ten posun se buď započítá celý, nebo vůbec.
3. **Týž posun se děje i místně.** `DIV.wrap [334/566→342/558]` vyjde
   místně v 155 ms úplně stejně — ale s hodnotou **0,004**.
4. **Rozdíl jsou dva další zdroje v témže posunu**, které má jen CI:
   `? [192/45→192/45]` a `? [166/20→192/20]`. Ty dva dělají z 0,004
   hodnotu 0,243.
5. **Zpoždění písem to místně nevysvětlí.** Zdržel jsem soubory
   `fonts/*.woff2` o 0, 150, 400 a 1 200 ms: 0,243 se neobjeví ani
   jednou (vyjde 0,0073 a jiné uzly).

### A oprava vlastního tvrzení

Nejdřív jsem si k bodu 4 napsal, že ty dva „?" jsou **textové uzly**.
To ale nebylo měření, jen domněnka: starý výpis psal „?" stejně u
textového uzlu (nemá `tagName`) jako u uzlu, který už v DOM není
(prohlížeč pak vrátí `null`). Změřeno oběma směry na podstrčené
stránce, kde posun nastane na zavolání:

* text posunutý rostoucím inline-blokem dá zdroj s **nezměněným**
  obdélníkem `[6/17→6/17]` — tedy přesně tvar prvního „?" z CI;
* odebraný prvek se naopak pořád hlásí jménem (`DIV#z`), takže
  `null` je ta vzácnější možnost.

Textové uzly jsou tedy pravděpodobnější, **ale potvrzené to není** —
rozhodne až běh CI s novými jmény.

### Co se proto měří navíc

Dvě věci, obě vyzkoušené na té podstrčené stránce (bez toho bych
posílal do CI řádek, o kterém jen doufám, že se vykreslí):

* **textový uzel se pojmenuje podle rodiče** — vypíše se `text v BODY`
  místo „?", a „?" pak zbude jen na uzel, který v DOM není; ty dvě
  možnosti se tím od sebe konečně poznají;
* **ke každému posunu se připíše stav písem** — `[písma loading]`
  nebo `[písma loaded]`. Jedno slovo, a rozhodne mezi dvěma výklady,
  které by se jinak jen hádaly. (Místně vychází u toho posunu
  `loading`.)

### A běh CI to řekl — příčina je výměna písma

Příští červený běh přišel a jmenovaná hláška odpověděla na obojí:

```
85 ms, 0.243 [písma loading]: DIV.wrap [334/566→342/558],
                              text v P.sub [192/45→192/45],
                              text v B [166/20→192/20]
```

Tedy:

1. Ty dva „?" **byly textové uzly**, ne uzly mimo DOM — a jsou to přesně
   ty, které jsem našel místně: úvodní odstavec hrdiny na stránce
   hlídání (`<p class="sub"><b>Hlídejte si nové pozemky.</b> …`).
2. `text v B` klesne ze 166 na 192 px, tedy **o 26 px = přesně jeden
   řádek**. Ten odstavec se přelomí.
3. U posunu stojí **`[písma loading]`** — v tu chvíli ještě písma nebyla
   načtená.

Příčina je tedy `font-display: swap`: prohlížeč vykreslí záložním
písmem a po dojetí vlastního ho vymění — a výměna přeláme řádky.
Místně se to nereprodukovalo proto, že tady záložní písmo (Liberation
Sans přes alias Arialu) láme řádky shodně jako Inter; kontejner CI má
jiná písma. Tím se vysvětluje i to, proč to „není pokaždé": záleží na
tom, jestli se výměna stihne před prvním vykreslením, nebo po něm.

### Oprava — `optional` místo `swap`

Naměřeno na `hlidani.html` se zdrženými soubory woff2 (bez zdržení
dojedou dřív než první vykreslení a nic se neprojeví):

| režim | zdržení | CLS | písma se použila? |
|---|---|---|---|
| `swap` | 0 ms | 0,0037 | ano |
| `swap` | 300 ms | **0,0073** (mezi zdroji zas `text v B`) | ano |
| `swap` | 1 500 ms | **0,0073** | ano |
| `optional` | 300 ms | **0** | ano |
| `optional` | 1 500 ms | **0** | ano |

Po změně ve stylopisu změřeno znovu na opravdu přestavěném stromu:
**CLS 0** při 300 i 1 500 ms zdržení, a Fraunces i Inter se načtou
a použijí (h1 31 px, úvodní odstavec 76 px — shodně se `swap`).

**Co se za to platí, poctivě:** `optional` vlastní písmo po prvním
vykreslení už nevyměňuje, takže na velmi pomalém připojení může celé
načtení proběhnout v záložním písmu. Při přednačtení na všech
stránkách, vlastním serveru a 22 kB na soubor se to ale stihne. Stabilní
rozvržení za cenu, kterou skoro nikdo nezaplatí, je lepší obchod než
přelomený text u každého návštěvníka s prázdnou cache.

Zbývající posun `DIV.wrap [334/566→342/558]` (0,004) tím nezmizí — ten
nedělá písmo, ale skript, a je dvanáctkrát pod mezí. Byl tam i dřív.

### Pojistka

`scripts/test-pisma.mjs` má 14 → **15** kontrol: hlídá, že všechna čtyři
`@font-face` mají `font-display: optional`. Vrácení na `swap` je změna
o jedno slovo, které by si nikdo nevšiml — a vrátilo by to celou vadu.

Místně je zelených 11 prohlížečových zkoušek včetně těch, které měří
vykreslení (`test-stabilita`, `test-naseptavac`, `test-uvod`,
`test-mapa-pozemku`). **Jestli je zelená i v CI, ukáže až běh po tomhle
commitu** — místně ta vada nikdy nespadla, takže to tady dokázat nejde.

### Běh CI to potvrdil — a hned poslal účet

Krok `test-stabilita` v CI **prošel** (a celý běh byl zelený), takže
oprava funguje tam, kde se vada projevovala. Zároveň ale `optional`
něco stojí a zaplatilo se to o commit později: `test-rozdeleni-stylu`
spadlo na `zpravy.html` s hláškou

```
a.btn-primary.header-cta: inline-size = „74px" zkrácený / „73.4531px" plný
```

Ta zkouška načte tutéž stránku **dvakrát** (raz se zkráceným
stylopisem, raz s podstrčeným plným) a porovnává vypočtené vlastnosti
prvek po prvku. U `swap` se vlastní písmo použilo vždycky, takže obě
načtení kreslila stejně. U `optional` se použije jen tehdy, když dojede
do asi 100 ms — a to je u každého načtení jinak. Jedno načtení tedy
kreslilo Interem, druhé záložním písmem, a šířky se rozešly o desetiny
pixelu. **Se stylopisem to nemělo nic společného.**

Opraveno v té zkoušce: v obou načteních se soubory `woff2` zahazují,
takže obě kreslí týmž záložním písmem. Rozdíl ve stylopisu to nezakryje
— kdyby zkrácený stylopis přišel o `@font-face` nebo o `font-family`,
ta vlastnost se v porovnání rozejde jako kterákoli jiná.
**Prokázáno sabotáží:** po úpravě jsem ze zkráceného stylopisu vyndal
pravidlo `.wrap{max-width…}` a zkouška spadla na třech stránkách.

Poučení, které platí dál: `optional` znamená, že vykreslení **není mezi
dvěma načteními zaručeně shodné**. Zkouška, která žádá přesnou shodu,
si proto musí stav písem postavit sama.

## 3w. ~~Stažená tabulka mohla v cizím Excelu spustit vzorec~~ — *zavřeno 10. 10.*

Excel, LibreOffice i Google Tabulky berou buňku, která začíná **`=`,
`+` nebo `@`** (a taky tabulátorem nebo CR), jako **vzorec**, ne jako
text. Stažená tabulka se přitom otevírá na cizím počítači — tedy
u člověka, který si jen stáhl výpis pozemků.

`pole()` v `js/vyvoz.js` uvozoval správně podle RFC 4180 (středník,
uvozovka, nová řádka), ale vedoucí rovnítko neřešil.

**Odkud by se tam vzalo.** Obec, okres a druh u inzerátu od majitele
píše člověk a živé inzeráty se zveřejňují samy. Formulář i server
u obce hlídají délku, číslice a odkaz (`js/kontrola.js`, `obec()`;
`supabase/listings-prvni-kontrola.sql`), ale *„=SUM(…)Lhota"* obsahuje
písmena, takže projde oběma. Branka `js/cisteni.js` zahazuje `<`, `>`
a uvozovku — rovnítko ne, a v HTML ho zahazovat netřeba.

**Poctivě k velikosti nálezu:** v dnešních datech taková hodnota není
ani jedna (změřeno na všech 1 988 nabídkách, polích
`place`/`okres`/`druh`/`extra`/`parcel`/`access`/`zlomek`/`cast`/`url`)
a inzerátů od majitelů je zatím nula. **Zavírám cestu, nehlásím
nalezenou vadu** — a píšu to takhle schválně, aby se z toho za měsíc
nestal „nalezený exploit".

Nově se před takovou buňku dá apostrof. **Čísla se nechávají být:**
„−12" je počet dnů do dražby u termínu, který už minul, a v tabulce se
podle něj třídí — apostrof by z čísla udělal text. Pomlčka se proto
neutralizuje jen tam, kde za ní nestojí číslo.

`scripts/test-vyvoz.mjs` (53 kontrol, dřív 44) zkouší pět vedoucích
znaků a k nim i opačný směr — že výměra, cena a záporný počet dnů
zůstaly čísly, včetně kontroly předpokladu, že ten termín je opravdu
v minulosti. Sabotáž (vyjmout tu jednu řádku) hlásí všech pět.

GPX se netýká: `xml()` escapuje `&`, `<`, `>` i uvozovku a ve wpt nemá
vzorec co dělat.

## 3x. ~~S veřejným klíčem šlo vložit už potvrzenou přihlášku k hlídání~~ — *opraveno v repozitáři 10. 10., čeká na spuštění v databázi*

Prošel jsem si statickou kontrolou celý `supabase/00-vse.sql`: jestli má
každá tabulka zapnutou řádkovou bezpečnost a co dovolují pravidla pro
veřejný („publishable") klíč, který je — správně — v `js/config.js`.

**RLS má všech 15 tabulek**, to je v pořádku. Zápis s veřejným klíčem
dovolují dvě pravidla a jedno z nich znělo:

```sql
on watch_subscriptions for insert to anon with check (true)
```

`with check (true)` nehlídá **hodnoty**. Tabulka přitom má dvojí
potvrzení (double opt-in) — sloupce `confirmed` a `confirm_token` —
a u nich v `schema.sql` stojí *„zákon vyžaduje souhlas"*. Kdo má
veřejný klíč, mohl tedy vložit řádek, který už má `confirmed = true`,
nebo si zvolit vlastní `confirm_token` a poslat ho do veřejné funkce
`confirm_watch()`. Obojí obejde potvrzení e-mailu, tedy přesně to, co
ty sloupce zajišťují.

**Poctivě k velikosti nálezu, protože to vypadá horší, než to je.**
Z téhle tabulky se **žádná pošta neposílá**. Rozesílač
(`scripts/send-alerts.mjs`) čte `saved_searches` přes
`hlidani_k_odeslani()`, a ta vyžaduje `u.email_confirmed_at is not
null`, tedy opravdu potvrzený účet v Supabase. `watch_subscriptions` je
starší, nepoužívaná cesta — stojí to i v komentáři v `js/config.js`.
Takže **tohle není „kdokoli rozešle mail komukoli"**; je to otevřená
branka u mechanismu, který by se tím obešel, kdyby se někdy zapojil,
a zatím volný zápis do cizí databáze.

Pravidlo se neruší celé, a to kvůli jediné věci, která ho používá:
tlačítko „Uložení hlídání" v `diagnostika.html`, kterým si majitel
ověřuje, že zápis do databáze vůbec projde. Správná cesta zápisu vede
funkcí `subscribe_watch()`, a ta je `security definer`, takže RLS
obchází — pravidlo pro anon k přihlášení potřeba není.

Nově (`supabase/hlidani-anon-uzce.sql`) smí vložit jen řádek, který
**není potvrzený, nemá potvrzovací token**, je aktivní, nikomu nic
neposlal a má rozumné délky. Takový řádek nikomu nic nepošle a nedá se
sám potvrdit. Diagnostika posílá jen e-mail a okres, takže projde.

`scripts/test-anon-zapis.mjs` (8 kontrol) čte **hotový balík** — to, co
majitel opravdu spustí — a u každého pravidla bere jeho POSLEDNÍ podobu
v souboru, protože pozdější `create policy` tu dřívější přepíše. Hlídá,
že každý volný zápis má u sebe **napsaný důvod** (dnes jediný:
`messages`, kontaktní formulář bez účtu, jehož čtení má jen majitel),
a hlídá i opačný směr — že důvod nezůstal po pravidle, které už není.
Sabotáž (vrátit podmínku na `true`) hlásí obě konkrétní kontroly.

**Co zůstává na majiteli:** pustit `supabase/00-vse.sql` v Supabase →
SQL Editor (tedy celý balík, ne jen `hlidani-anon-uzce.sql`). Balík
obsahuje tenhle zúžený zápis i všechno pozdější — od 17. 10. hlavně
`supabase/vykon.sql` s chybějícími indexy a přepsanými dotazy chatu.
Kdo databázi zakládá znovu, dostane rovnou všechno; v té dnes běžící
je pravidlo pořád to staré. Celý balík jde pustit opakovaně.

## 3y. Graf na stránku „Ceny pozemků" — a nález, že graf a číslo nad ním počítá každé jinak — *částečně 10. 10.*

Zadání bylo jednoduché: *„pořád tam nejsou ty grafy, jak jsme
požadovali."* Zjištěný stav: graf cenové hladiny byl na **91 stránkách**
(77 okresů, 14 krajů), ale na `cena-pozemku.html` — tedy na stránce,
která je přímo o cenách — **nebyl**, a přitom data pro celostátní řadu
v `data/historie-cen.json` ležela od začátku: osm řad podle druhu,
z toho čtyři dost klidné na kreslení.

**Proč se nekreslil.** Klíč řady je „úroveň|název|druh" a u celé ČR je
prostřední část prázdná (`cr||Orná půda`). V `js/graf-cen.js` stála
podmínka `if (!uroven || !nazev) return;`, takže celostátní graf
propadl na prázdném jménu. Jméno se teď vyžaduje jen tam, kde ho klíč
opravdu má. Hotovo: na stránce cen je graf *„Nabídková cena za m² —
orná půda v celé ČR, 43,3 Kč/m², −0,7 % za 26 dní"* z 835 nabídek,
týmž prvkem i skriptem jako na okresech, bez druhého výpočtu.

### A u toho vyplavala větší věc

V hero té stránky stojí **63 Kč/m²** (zemědělská půda) a graf pod tím
kreslí čáru na **43,3**. Dvě čísla o téže věci vedle sebe — tedy přesně
ta vada, které se tenhle web bojí nejvíc. **Přeměřeno na 17 okresních
stránkách, kde je obojí:** medián rozdílu **−23 %**, nejvíc **−85 %** —
Česká Lípa má na stránce 55 Kč/m² a graf čáru na **8 Kč/m²**. Písek 110
proti 38,8.

To osmikorunové číslo je přitom doslova to, které si generátor sám
zakázal: v komentáři u dolní meze stojí *„Medián zemědělské půdy
vycházel v některých okresech na 8 Kč/m². Tolik pole v Česku nestojí…
Znojmo 8, Česká Lípa 8."* Stránka ho zahodila, graf ho kreslí dál.

**Příčiny, obě změřené:**

1. **Dolní mez uvěřitelnosti.** `priceStats` (stránka) odřízne nejnižší
   shluk; dnes je mez **16,2 Kč/m²** a odřízne **137 z 1 096** nabídek
   zemědělské půdy (13 %) — medián tím jde z 54,1 na **63,1**. Model,
   ze kterého kreslí graf, žádnou takovou mez nemá.
2. **Jiné škatulky.** Stránka slučuje druhy do čtyř hrubých skupin
   (`Zemědělská půda`), graf má osm jemných (`Orná půda`, `Louka`…).

Co příčinou **není**, i když to tak vypadá: spoluvlastnické podíly.
Změřeno — bez nich jde celostátní orná z 43,3 jen na 45,5 a Česká Lípa
zůstane na 7,9. Model je drží schválně a má to u sebe změřené.

### Co je hotové a co ne

Hotové: graf na stránce cen a u **všech 92 grafů** věta, co ta čára
je — *„Čára je z hladiny, kterou web používá ke srovnávání nabídek;
medián nad grafem se počítá přísněji (odřízne nejnižší shluk, který
bývá spoluvlastnický podíl), takže bývá vyšší. Z grafu se proto čte
tvar, ne výška."* Žádné číslo v té větě není schválně — mez se mění
sama a do textu nepatří (viz bod 3t).

**Nehotové, a je to příští krok:** ty dva výpočty mají být jeden.
Správná cesta je vytáhnout `priceStats`, `spoctiMeze` a hrubé `druhGroup`
z `scripts/generate-region-pages.mjs` do vlastního modulu (jako se to
udělalo s `scripts/regiony-meta.mjs`) a stavět z něj i řady v
`scripts/historie-cen.mjs`. Řady se tím změní, takže k tomu patří
zvýšení `VERZE` a přepočet celé historie od začátku — na to je
v tom skriptu připravený `--prepocitat`. **Vysvětlující věta je
náplast, ne oprava**, a tohle je důvod, proč to tu stojí napsané.

Zkouška `scripts/test-graf-cen.mjs` (38 kontrol, dřív 29) hlídá
i celostátní graf: že na stránce cen je, že je to řada `cr|`, že mluví
o celé ČR a ne o okrese, že má aspoň pět bodů a čísla i v tabulce.

## 3z. Barevné přechody měl web popsané, otestované — a dojely na jednu stránku z 2 207 — *opraveno 10. 10.*

Zadání: *„pořád web [nemá] ty grady, jak jsme požadoval."* Nejdřív jsem
to přečetl jako „grafy" a dodělal graf na stránku cen (3y). Opraveno:
*„Ne grady / Grady je české slovo."* Takže gradienty, barevné přechody.
A na nich se dalo něco změřit.

**Co web má.** `predloha.html` má celý oddíl „5. Barevné přechody"
a `css/styles.css` k němu pět tokenů (`--grad-warm`, `--grad-warm-soft`,
`--grad-cool-soft`, `--grad-predel`, `--brand-grad`) s vysvětlením,
proč vycházejí ze dvou tónů a ne z osmi. Zkouška `test-kontrast.mjs` se
kvůli nim naučila měřit kontrast i na přechodu.

**Kam se dostaly.** Naměřeno na vykreslených stránkách (šířka 1280,
počítají se jen plochy nad 12 000 px²; plocha se bere s gradientem,
když ho má `background-image` nebo `::before`/`::after`):

| stránka | ploch | z toho s přechodem |
|---|---|---|
| `index.html` | 544 | 52 (10 %) — a 48 z nich je týž přechod na 24 kartičkách |
| `pozemky-okres-benesov.html` | 162 | **5** (3 %) |
| `cena-pozemku.html` | 140 | 8 |
| `pozemek-…-rsg5bb.html` | 105 | **4** (4 %) |

Na stránce pozemku ty čtyři byly: záložka mapy, její popisek, souhrn
rádce a patička. Vlastní tělo stránky — cena, verdikt, parametry,
„Kam dál" — bylo celé plné placek.

**Jedno číslo, které to vysvětluje.** Hlavní značka oddílu z předlohy je
měděná vlasovka nad nadpisem, `.section-head::before` s tokenem
`--grad-warm`. Třídu `.section-head` nese **jedna stránka webu**:

```
section-head   pozemek-*.html 0/2072 · pozemky-okres-*.html 0/77
               pozemky-*kraj*.html 0/14 · cena-pozemku.html 0/1
               nove-pozemky.html 0/1 · index.html 1/1
```

Stránka pozemku si nadpisy oddílů jmenuje `.pz-sect-h` (sedm na stránku)
a přehledové stránky `.rules-sect > h2` (tři na okresní). Ani jedna ta
třída značku neměla. Vizuální jazyk se nerozhodl špatně — jen nikdy
nedojel za úvodní stránku.

**Co je opravené.** Žádný nový token, žádná nová barva, žádný nový
rozměr:

- `.rules-sect > h2::before` — tatáž vlasovka 52×2 px s `--grad-warm`
  na nadpisech oddílů 95 přehledových stránek (okres, kraj, druh,
  rozpočet, ceny, novinky). V článcích ne: tam oddíl značí číslo
  (`.clanek .rules-sect::before`) a dvě značky by si konkurovaly.
- `.pz-sect-h::before` — táž vlasovka na stránkách pozemků. Stojí
  **mimo tok** (`position:absolute; top:-14px`), a to po nálezu: nejdřív
  byla v toku jako na úvodní stránce a odstup nadpisu jsem zkrátil o to,
  co si vezme (26 + 2 + 12 = 40 px). Opticky souhlas, jenže
  `test-parametry.mjs` nečte optiku, čte odstupy — ohlásil „navíc:
  6, 26 px". Soustava 40/20/10/8 px má držet v číslech, ne v součtu.
- V souhrnu rádce vlasovka není (`.pz-gtk-sum .pz-sect-h::before`) —
  ten řádek se rozbaluje, značka oddílu by z něj dělala nadpis. Totéž
  pravidlo, jaké má `.rail .section-head::before`.
- `.pz-gtk` a `.pzm` (688×562 a 688×450 px, dvě největší placky na
  stránce) nesou přelev shora dolů z `--ink-soft2` do `--ink-soft`,
  stejný jako `.add-card` na přehledech.

Po opravě: stránka pozemku **4 → 9** ploch s přechodem, okresní **5 → 8**,
ceny **8 → 9**, novinky 12. Zelené: `test-kontrast`, `test-parametry`
(33), `test-rozvrzeni` (149), `test-predloha`, `test-mapa-pozemku` (131),
`test-stabilita` (50), `test-stranky`.

### A vedlejší nález: komentář křísil mrtvá pravidla pro 2 202 stránek

Když jsem k té vlasovce na stránce pozemku napsal vysvětlení, které
citovalo cizí pravidlo `.rail .section-head::before{display:none}`,
`css/zaklad.min.css` o **sedm pravidel povyrostlo** — zrovna o sloupcové
rozvržení úvodní stránky, které na stránce pozemku nemá co dělat.

Příčina je v `scripts/rozdel-styly.mjs`. Tokeny stránky se sbírají jako
**slova** z `<style>` a `<script>`, a to je správně: jméno třídy se do
skriptu dostane i přes `classList.add('x')` nebo slepením řetězců a na
to se regulárním výrazem spolehlivě nepřijde (hlídá to bod 3 v
`test-rozdel-styly.mjs`). Jenže slovo je slovo i ve **vysvětlení** —
takže stačilo jméno třídy zmínit v komentáři a mrtvé pravidlo obživlo
pro všech 2 202 stránek.

Změřeno na celém webu: **15 pravidel, 3 030 B zdroje** drželo ve
zkráceném stylopisu jedině to, že je někde zmínil komentář —

- osm pravidel tmavé kontaktní sekce `#realitky`, protože komentář
  v `muj-inzerat.html` napsal slovo „realitky" (vada, která tam byla
  dřív než já),
- sedm pravidel `.rail`, a to byl můj vlastní komentář.

Opraveno vyhozením komentářů před sbíráním slov. Funkce `bezKomentaru`
existovala už v `test-chybova-hlaska.mjs` (kde si bez ní lint našel sám
sebe), takže je teď na jednom místě v `scripts/bez-komentaru.mjs` a
slouží oběma. V CSS se `//` schválně nehledá — `url(//cdn/x.png)` by se
jím sežral.

Jako čtvrtý bod přibyl do `test-rozdel-styly.mjs` (30 kontrol), včetně
sabotáže: stránka, která jméno třídy má jen v komentáři `<style>`,
nesmí ten token mít, a zároveň třída ze skutečného kódu ve `<script>`
ho mít musí — aby oprava bodu 4 nerozbila bod 3. S vrácenou vadou
padají tři kontroly, bez ní je 30/30.

`css/zaklad.min.css` je po obou změnách **o 316 B menší** než před nimi,
a to včetně tří nových pravidel pro vlasovku.

## 3aa. NALEZENO: „obvyklá cena" se počítala ze dvou různých světů — a obrana proti tomu stála na premise, kterou data vyvrací — *opraveno 10. 10.*

Šel jsem sjednotit dva cenové výpočty (slíbeno v 3y) a cestou narazil na
něco většího.

### Co se našlo

Generátor stránek měl „spodní mez uvěřitelnosti": heuristiku, která
v rozdělení cen hledala mezeru a nejlevnější shluk odřízla. Odůvodnění
stálo v kódu i v zkoušce černé na bílém — ten shluk jsou prý
spoluvlastnické podíly. Tak jsem to změřil **jmenovitě na tom, co ta
heuristika odřízla**:

```
Ořez nejlevnějšího shluku — Zemědělská půda: mez 16,2 Kč/m², odříznuto 137,
z toho spoluvlastnický podíl 0 (0 %) — nejvíc Česká Lípa 23×, Brno-venkov 19×,
Znojmo 12×
```

**Nula ze 137.** A nemohlo to být jinak: podíly přepočítává `CENY.zaMetr`
dřív, než se ořez spustí, takže jejich cena za metr je dávno srovnaná —
a jejich medián je 150 Kč/m², tedy **nad** trhem, ne pod ním. Premisa byla
obrácená.

Co v tom shluku opravdu bylo: ze 135 nabídek zemědělské půdy pod mezí
16,2 Kč/m² bylo **132 prodejem státní půdy podle § 12** zákona
č. 503/2012. SPÚ prodává oprávněné osobě za cenu **stanovenou úředně**.
To není nabídková cena a nikdy nebyla.

### Jak velké to bylo

Nabídek SPÚ je 204 z 1 988 (**10 %**), všechny vedené jako běžný prodej.
Medián Kč/m² (1 943 nabídek bez duplicit):

| druh | SPÚ | trh | dohromady | rozdíl |
|---|---|---|---|---|
| orná půda | **8** (127) | 74 (685) | 62 | 9,3× |
| zahrada | **40** (26) | **791** (47) | **157** | **19,8×** |
| ostatní plocha | 19 (14) | 67 (43) | 53 | 3,5× |
| louka | 14 (26) | 50 (277) | 48 | 3,6× |
| vinice / sad | 9 (6) | 102 (55) | 89 | 11,3× |

U zahrady web vydával za obvyklou cenu **157 Kč/m²** — číslo, které
neplatí ani pro stát (40), ani pro trh (791). A heuristika u zahrad
schválně nehledala nic („u zahrady je levná cena normální cena"), takže
tam nehlídala vůbec: 26 úředních cen ze 73 šlo do mediánu bez jakékoli
výhrady.

Dohad podle tvaru rozdělení se přitom mýlil **na obě strany**: tři
skutečné tržní nabídky uřízl, 21 nabídek SPÚ nad mezí 16,2 nechal projít,
a na 7 okresních stránkách utnul vzorek pod deset nabídek, takže stránka
o ceně **mlčela** (Brno-město, Kladno, Kutná Hora, Nymburk, Náchod,
Znojmo, České Budějovice).

### A netrefovalo to jen stránky s cenami

Tatáž hromádka je i srovnávací hladina u konkrétního pozemku. Změřeno na
1 632 nabídkách, kde odhad vyjde v obou případech:

- hladina se posunula o **>10 % u 271 nabídek (17 %)**, o >50 % u 143,
- nejvíc u Nehvizd (orná půda): hladina **8 → 126 Kč/m², tedy 16,6×**,
- a u **31 nabídek (1,9 %) se verdikt otočil**: Česká Lípa, orná půda, ze
  „182 % nad obvyklou cenou" na „51 % pod ní". Web kupujícímu tvrdil
  přesný opak.

### Jak je to opravené

Jmenovitou výjimkou, na jednom místě — `CENY.spravniCena(d)` v
`js/ceny.js` — stejně jako se jmenovitě vynechává vyvolávací cena dražby.
Jmenovitou výjimku si čtenář může ověřit; tvar rozdělení je dohad.

- **`js/ceny.js`**: úřední cena se vynechává hned u vstupu do modelu, ne
  až u srovnávací hladiny. Kdyby se vynechávala níž, počítal by se z ní
  percentil („dražší než 78 % podobných") — a ten by u zahrad srovnával
  trh s cenami dvacetkrát nižšími.
- **`scripts/generate-region-pages.mjs`**: `jeBeznaNabidka` se ptá
  `CENY.spravniCena`; `dolniMez`, `MEZE_DRUHU`, `spoctiMeze` a mrtvý
  počítač `ODFILTROVANO`, který si nikdo nikdy nepřečetl, jsou pryč.
- **`scripts/generate-data-rezy.mjs`**: `data/model.json` tyhle nabídky
  už nevozí. Musí se vynechat už tam, protože sloupcový formát nenese
  pole `extra`, takže by je prohlížeč rozpoznat nemohl — a model z malého
  souboru by dal jiné číslo než z plných dat. Soubor je o 6 kB menší.
- **`scripts/historie-cen.mjs`**: `VERZE` 2 → 3 a řada přepočítaná od
  začátku, takže v grafu nevznikne schod.
- **Metodika na `cena-pozemku.html`** tvrdila „nezapočítáváme
  spoluvlastnické podíly … hledáme mezeru v samotném rozdělení". Obojí
  byla nepravda (podíly se počítají, jen přepočtené). Teď tam stojí, co se
  opravdu děje, včetně čísel 8 proti 74.

### Co se tím změnilo na webu

Vytištěná čísla: zahrada **157 → 791 Kč/m²**, Česká Lípa 55 → 43,
Liberecký kraj 70 → 77, celostátní zemědělská půda 63 → 69; Jablonec nad
Nisou po vynechání SPÚ nemá deset tržních nabídek, takže cenu neuvádí.

Graf a číslo nad ním se k sobě přiblížily: největší rozdíl na 27
stránkách, kde stojí obojí, spadl z **6,88× na 2,81×** a Česká Lípa z
6,88× (55 proti 8) na 1,23× (43 proti 35). Zbytek už není rozdíl ve
výpočtu — obě strany počítají z téže hromádky — ale v tom, **o čem** to
číslo je: nad grafem stojí medián za hrubou skupinu („zemědělská půda" =
orná i louky), graf kreslí jeden konkrétní druh. To je teď u grafu
napsané.

### Dvě zkoušky, které měřily vedle

- **`scripts/test-statistika.mjs`** heuristiku hlídala a její odůvodnění
  citovala. Přepsaná: hlídá jmenovitou výjimku, že heuristika je pryč,
  a že se ty dva světy v datech opravdu liší (kdyby se srovnaly, nebylo
  by proč výjimku držet). 29 kontrol.
- **`scripts/test-ceny.mjs`** chtěla po modelu, aby uhodl **úředně
  stanovenou cenu**. Takový odhad se musí mýlit o stovky procent a padal
  do hromádky „jistých", čímž smazal rozdíl mezi jistými a nejistými
  odhady: poměr 1,67 proti prahu 1,7. Měří se teď jen to, co model
  modeluje.
- A ten **práh 1,7 byl sám příliš těsný**. Stál na dnu 1,90, naměřeném
  ze tří rozdělení. Na osmi rozděleních téhož pravidla vychází
  1,81 · 1,77 · 1,69 · 1,91 · 1,65 · 1,55 · 1,87 · 1,65, tedy dno **1,55**
  — práh ležel nad ním a test padal na losu, ne na vadě. Sabotáž (příznak
  „nejistý" si hodí korunou) dává na týchž rozděleních strop **1,01**.
  Práh je proto **1,3**: 1,29× nad stropem rozbité, 1,19× pod dnem
  funkční. Model se přitom nezhoršil — medián chyby všech odhadů klesl
  z 23,8 na 23,5 %.

Sabotáž obou oprav: s vrácenou vadou padá pět kontrol v `test-statistika`
a jedna v `test-model-vstup` (ta přímo na tom, že model z malého souboru
dá jinde jiné číslo), bez ní je 29/29 a 14/14.

### Co zbývá

Hrubé skupiny (`druhGroup` v generátoru slučuje ornou a louky do
„zemědělské půdy", kdežto `js/ceny.js` je drží zvlášť) jsou poslední
rozdíl mezi číslem a grafem. Je to volba, ne vada — ale jedno slovo
„medián" u dvou různých věcí na jedné obrazovce je pořád past.

## 3ab. Tři stovky čísel na přehledových stránkách nikdo nepřepočítával — a pokus „spravit" podíly v hladině skončil o dvě třetiny horším odhadem — *10. 10.*

Dvě měření, jedno s nálezem a jedno bez. Obě stojí za zápis.

### A) ZMĚŘENO A ZAMÍTNUTO: přepočítat podíly v srovnávací hladině

`js/ceny.js` má u srovnávací hladiny poznámku, že spoluvlastnické podíly
v ní **zůstávají surové** (cena dělená celou výměrou), a dvě změřené
varianty: nechat je tak, nebo je vynechat. Vynechat je horší, protože
z okresu zmizí 28 % vzorku.

Jenže je tam **třetí možnost, kterou to měření nemělo**: nechat je, ale
přepočítané přes `zaMetr` — tedy cenou za metr, který kupujícímu opravdu
připadne. Zní to jako nejlepší ze všech: vzorek se neztratí a zkreslení
se spraví. Změřeno (tři desetinásobná rozdělení, cílem jsou celé pozemky):

| varianta | medián chyby odhadu |
|---|---|
| A surové (dnešní stav) | 23,1 · 23,6 · **22,5 %** |
| B podíly vynechat | 23,2 · 25,0 · 23,9 % |
| C přepočítané | **39,3 · 39,5 · 41,0 %** |

Přepočet je **o dvě třetiny horší** než nedělat nic. Důvod stojí o pár
desítek řádků výš v témže souboru, u stropu uvěřitelnosti: přepočtené
podíly mají medián 150 Kč/m² proti 54 u celých pozemků, tedy skoro
trojnásobek. Nejsou „správnější", jsou **jinak pokřivené** — u podílu se
nedá věřit vztahu ceny a výměry v inzerátu. Surové číslo je aspoň
pokřivené dolů u všech stejně a medián to unese.

Měření je zapsané do komentáře v `js/ceny.js`, aby ten třetí sloupec
nikdo nemusel hledat znovu.

### B) Tři stovky čísel, které nikdo nepřepočítával

Okresních stránek je 77, krajských 14 a každá o sobě tvrdí čtyři až šest
čísel: kolik pozemků evidujeme, od kolika do kolika korun jsou ceny,
a dlaždice s rozpadem podle typu („35 na prodej · 1 exekuce · 8 dražeb").
Dohromady **348 tvrzení** — a žádné z nich nikdo nepřepočítával.

Přepočítal jsem je všechna z dat: **0 rozporů**. Čísla na stránkách jsou
v pořádku. Vada to tedy není — ale 348 čísel bez jediné pojistky je
místo, kde se jednou tiše něco rozejde (stačí zaměnit filtr, zapomenout
na řez po termínu nebo spočítat typ z jiné hromádky), a okem se to
nepozná: „v okrese Benešov evidujeme 36 pozemků" vypadá správně vždycky.

Nová zkouška `scripts/test-cisla-okresu.mjs` (11 kontrol) je proto
přepočítává při každém běhu.

**Jak se ta zkouška brání vlastní prázdnotě.** Kontrola, která čte čísla
regulárním výrazem, umí tiše přestat měřit. Při psaní se mi to stalo
**dvakrát**:

- `pozemk\w+` nesedne na „pozemků", protože `\w` české písmeno není,
- `dražb\w*` nesedne na „dražba" ze stejného důvodu — čtyřicet dlaždic
  s dražbami se přeskočilo a kontrola hlásila nula rozporů,
- a jméno kraje se nedá brát z `<h1>`: tam stojí skloněné („v Jihočeském
  kraji", „na Vysočině", „v Praze"), kdežto klíč v datech je „Jihočeský" —
  první pokus dal čtrnáct falešných rozchodů. Převod má jedno místo,
  `scripts/regiony-meta.mjs`, odkud jména vyrábí i generátor.

Zkouška proto nejdřív ověří, **kolik** se toho přečetlo (77 počtů,
154 mezí, 75 dlaždic, 14 krajů, 28 krajských mezí), a každá dlaždice
s neznámým slovem je **chyba**, ne přeskočení.

A ještě jedna poctivost: `poTerminu` (řez na proběhlé dražby) dnes
neodřezává **nic** — vyzkoušeno sabotáží, bez filtru projde všech 348
čísel stejně. Filtr v zkoušce zůstává, protože ho má i generátor a až
nějaká proběhlá dražba v datech bude, musí se obě strany shodnout; ale
nedělá se z něj zásluha — vypisuje se, kolik odřízl.

Sabotáž: změněné číslo na okresní stránce, změněné na krajské
a neznámé slovo na dlaždici — každé shodí příslušnou kontrolu; bez nich
11/11.

## 3ac. NALEZENO: u spoluvlastnického podílu web tiskl slevu proti ceně CELÉ parcely — na 184 stránkách — *opraveno 10. 10.*

Prohlížel jsem stránku pozemku na telefonu a narazil na tohle:

```
Uváděná cena                       28 000 Kč
Obvyklá cena v okolí do 25 km     293 289 Kč
o 90 % níž — jenže inzerát mluví o spoluvlastnickém podílu:
             v ceně je jen zlomek pozemku, kdežto výměra je celá.
```

Těch 293 289 Kč je cena **celé parcely** (5 023 m² × 58 Kč/m²), kdežto
28 000 Kč je cena za její **šestinu**. Rozdíl mezi nimi není sleva, je to
ten zlomek. Text pod číslem to říká — jenže tučné „o 90 % níž" si oko
přečte dřív než větu, která ho ruší, a obě čísla stojí vedle sebe
v tabulce, jako by patřila k sobě.

**Byla to jediná díra v jinak důsledném pravidle.** Odznak na kartě,
percentil („dražší než 78 % podobných") i řazení podle slevy u podílu
schválně mlčí — `nesrovnatelna(d)` je v `js/ceny.js` od začátku a
`js/main.js` ji respektuje na šesti místech. Rádce v `js/radce.js` má pro
podíl vlastní větev. Jen blok odhadu to číslo pořád tiskl.

**Kolik toho bylo.** Blok se ukazuje u **544** nabídek a **184 z nich
(34 %) je podíl**. Vytištěná „sleva" u nich má medián **30 %** a maximum
**90 %**; u **třiceti** z nich web tvrdil slevu přes polovinu.

**Proč se to nedá spravit přepočtem.** Nabízelo se počítat obvyklou cenu
z výměry, která kupujícímu připadne (medián × plocha × zlomek). Změřeno
na 457 podílech se známým zlomkem: medián by se z „10 % pod" překlopil na
**−215 %**, tedy „dražší", a u podílu 9/792 z lesa by vyšlo **−4 244 %**.
U 297 ze 457 (65 %) by se otočilo znaménko. Cena podílu prostě není cena
pozemku krát zlomek — a vymýšlet si místo jednoho špatného čísla jiné
špatné číslo nemá cenu.

**Opraveno tím, že se netvrdí nic.** U podílu blok nově neukazuje ani
celkovou obvyklou cenu, ani procento. Zůstává věta, co se doopravdy
kupuje, a **hladina za metr** — údaj, který na stránce jinde není:

```
Srovnání s okolím tu neděláme — v ceně je jen spoluvlastnický podíl,
kdežto výměra v inzerátu je celá parcela. Rozdíl proti obvyklé ceně
by byl ten zlomek, ne sleva.

Kolik tu stojí celé pozemky: medián 58 Kč/m² — z 10 nabídek stejného
druhu (orná půda) a podobné výměry v okolí do 25 km.
```

Mez „aspoň 15 % pod odhadem" u podílu přestala platit: gatovala procento,
které se už netiskne. Blok se proto u podílu ukáže vždycky, když je
z čeho hladinu spočítat (430 nabídek místo dosavadních 184) — a tam, kde
se dosud mlčelo, teď aspoň stojí, co se kupuje.

Hlídá to `scripts/test-doporuceni.mjs` (38 kontrol): u podílu blok nesmí
obsahovat „% níž" ani „Obvyklá cena", musí obsahovat hladinu v Kč/m², a —
sabotáž naruby — u **celého** pozemku se srovnání tisknout musí dál, aby
oprava neumlčela celý web. S vrácenou vadou padají tři kontroly.

## 3ad. NALEZENO: zlevnění smazalo nabídce věk — 14 pozemků stálo zároveň v „Nově přidané" i „Zlevněné" — *opraveno 10. 10.*

Hledal jsem, jestli se dá na stránce pozemku ukázat, jak dlouho nabídka
visí (pro kupujícího je to po ceně to druhé nejužitečnější). Data na to
mají pole `first_seen`. Při měření se ukázalo, že to pole lže.

### Co se našlo

Robot přenáší `first_seen` z minulého souboru podle otisku:

```js
const otisk = (o) => [o.type, okres, place, o.parcel, o.price, o.area].join('|')
```

V otisku je **cena**. Jakmile tedy prodejce zlevní, nabídka se v minulém
souboru nenajde — a dostane dnešek. **Přijde o svůj věk.**

Změřeno: všech **25 z 25** nabídek se zaznamenanou změnou ceny mělo
`first_seen` přesně ten den, kdy se cena změnila. Bylo to vidět na
stránce „Co je nového": **14 pozemků** stálo zároveň v sekci „Nově
přidané" **i** v „Zlevněné" — 23 % té první sekce. Je to protimluv: nově
přidaná nabídka nemá co zlevnit. A stránka přitom v metodice slibuje
„Co přišlo potom, je skutečně nové".

### Oprava v robotovi

Druhé kolo párování otiskem **bez ceny** — ale jen tam, kde je shoda
jednoznačná na obou stranách. Jinak by si dvě různé nabídky téže výměry
ve stejném katastru vyměnily věk. Změřeno: vypuštění ceny přidá
v dnešních datech **tři kolize z 1 988** nabídek, a právě ty se tím
pravidlem přeskočí.

Párování je teď vyvedené jako `prirazPrvniVideni()`, aby šlo zkoušet bez
sítě.

### A oprava dat, která už o datum přišla

Robot to od teď dělá správně, ale nabídky, kterým datum zmizelo dřív, se
samy neopraví. `data/opportunities.json` má ale v gitu **104 verzí** a
každá nese `updated` — takže se dá pro každý otisk bez ceny najít
nejstarší den, kdy v datech byl. Dělá to `scripts/prvni-videno.mjs`
(`--zapsat`), stejnou úvahou, jakou používá `scripts/historie-cen.mjs`
na cenové řady.

Dopočet dostal dřívější datum **1 292 z 1 988 nabídek (65 %)** a nejstarší
den se posunul z 19. 9. na **14. 9.** Datum se nikdy neposouvá dopředu.

**Co to neumí:** starší, než je první commit, se nedostaneme — nabídka
mohla viset měsíce předtím, než ji robot poprvé uviděl. Dopočtené datum
je tedy **spodní mez**, ne skutečné stáří inzerátu.

### Výsledek

| | před | po |
|---|---|---|
| nabídek se změnou ceny, které měly `first_seen` v den změny | **25 z 25** | **1 z 25** |
| pozemků zároveň v „Nově přidané" i „Zlevněné" | **14** | **2** |
| „nových za 14 dní" na stránce novinek | 274 | 174 |

Obě zbylá překrytí jsou oprávněná: u jednoho (Dubí) zdroj uvedl
předchozí cenu hned při prvním spatření — ověřeno procházkou celou
historií, nabídka se 5. 10. opravdu objevila poprvé.

Hlídá to `scripts/test-prvni-videno.mjs` (17 kontrol): otisky, přenos
data po zlevnění, **nepřenos** u dvojznačné shody, že dopočet posouvá jen
dozadu, a na ostrých datech že „first_seen = den změny" je nejvýš
hrstka. Sabotáž (zpět na jednokolové párování) shodí tři kontroly.

### Co z toho zatím NEPLYNE

Ukázat na stránce pozemku „na trhu už N dní" pořád nejde poctivě:
evidence začíná 14. 9., takže by 1 192 pozemků z 1 988 hlásilo totéž
číslo — a bylo by to stáří naší evidence, ne inzerátu. Až bude okno
dost dlouhé, data už budou v pořádku; dřív by to byla jen hezčí podoba
téhož zkreslení.

## 3ae. Nové: „Nekupujete jen tuhle parcelu" — shluky sousedících nabídek na 187 stránkách — *10. 10.*

Kdo kupuje půdu, nekupuje tvar parcely, ale **výměru na jednom místě**.
Pět hektarů v jednom kuse je něco úplně jiného než pět hektarů
roztroušených po okrese — a z výpisu se to nepozná, protože každá
parcela je v něm samostatná řádka.

Web o okolí dosud říkal tři věci a ani jedna na tohle neodpovídala:

| co už tam bylo | o čem to je |
|---|---|
| „Vzdušnou čarou: Benešov 25 km" | kde to je |
| „V obci Slatina je v nabídce ještě 6 pozemků" | počet, ale přes celou obec a bez výměry |
| „Srovnatelné pozemky v okolí" | **cena**, a bere se z celého okresu |

Nově na stránce pozemku stojí:

> **Nekupujete jen tuhle parcelu.** V okruhu 300 m se prodávají ještě
> 2 další pozemky — dohromady 1,06 ha za 1 817 000 Kč.
> *Jsou to vzdušné čáry mezi nabídkami, ne hranice parcel — a každou může
> prodávat někdo jiný. Na mapě je uvidíte pohromadě.*

**Jak se shluk pozná.** Spojují se nabídky do 300 m vzdušnou čarou,
a to **tranzitivně**: A—B a B—C dá jeden shluk, i když A a C jsou dál.
Tak se chová pás pozemků podél cesty, což je přesně ten případ, o který
jde. Měřeno na 1 943 nabídkách bez duplicit: do 150 m je 17 shluků o třech
a více nabídkách, do 300 m **47 shluků se 187 nabídkami (10 % webu)**,
do 600 m už 85 shluků s 375 nabídkami. Mez 300 m je kompromis: dost na
pás parcel, málo na „celá vesnice".

Největší nalezené shluky: Újezd u Brna 12× (2,77 ha), Ústí nad Orlicí
10× (jedna dražba rozdělená na deset položek), Podolí u Vsetína 8×,
Mochov 8× (4,92 ha za 373 tis. Kč).

**Co se schválně NETVRDÍ.** Že spolu parcely **sousedí** — na to by byly
potřeba hranice z katastru, které web nemá; tvrdí se jen vzdálenost.
Že se dají koupit **najednou** — prodejců může být víc. A shluk **pod tři
nabídky se nehlásí vůbec**: „vedle je ještě jeden pozemek" už říká věta
o obci a třetí odstavec o témže by stránku jen nafoukl.

Dvě opatrnosti navíc, obě vynucené daty:
- **cena se sčítá, jen když ji má každá nabídka ve shluku.** Součet, ve
  kterém jedna chybí, by vypadal jako cena celého bloku a byl by nižší.
- **spoluvlastnický podíl se u součtu přizná** („3 z nich jsou
  spoluvlastnické podíly, takže jejich výměra je za celé parcely"):
  v inzerátu je výměra celé parcely, ale kupuje se zlomek, takže podíl
  součet výměry nafukuje.

### Chyba, která mlčela

První verze dala blok na **0 z 1 943 stránek** a generátor hlásil úspěch.
Mapa shluků byla klíčovaná **objektem nabídky** — jenže `nabidky()`
v generátoru čte `data/opportunities.json` z disku **znovu u každé
stránky**, takže `Map.get(d)` dostával pokaždé jiný objekt a vracel
`undefined`. Klíč je teď řetězec ze všeho, čím se nabídka od jiné liší,
a zkouška to ověřuje kopií objektu, ne tímtéž objektem.

Hlídá to `scripts/test-bloky.mjs` (16 kontrol): vzdálenost, mez,
tranzitivita, nabídka bez souřadnic, klíč proti totožnosti objektu,
souhrn, nesčítání neúplné ceny, podíl, čeština věty (dvojka musí mít
sloveso v množném čísle) a čísla v ostrůvcích na hotových stránkách.
Sabotáže: klíč zpět na objekt (2 kontroly padnou), sčítání neúplné ceny
(1) a mez 3 000 m místo 300 (2).

## 3af. Nová stránka „Víc pozemků pohromadě" — a dva nálezy, na které u ní došlo — *10. 10.*

### Stránka

Shluky, které od minula zná stránka pozemku, teď mají vlastní výpis:
**`pozemky-pohromade.html`** — 15 lokalit, 91 nabídek, dohromady **59 ha**,
seřazeno od největší celkové výměry. Mez je tu **čtyři** nabídky, ne tři
jako u jednotlivého pozemku: trojic je 32 ze 47 a stránka by z nich byla
seznam drobností, ve kterém by se Doksy (15,8 ha) a Bakov (14,4 ha)
ztratily.

Co stránka říká o sobě, je stejně důležité jako výpis: měří se **vzdušná
čára mezi nabídkami, ne hranice parcel**, netvrdí se, že spolu pozemky
sousedí ani že se dají koupit najednou, a u skupiny s podílem je
napsané, že jeho výměra je za celou parcelu.

### Nález 1: dva články na webu, na které nevedl odkaz odnikud

Při kontrole, jestli na novou stránku vede odkaz, jsem to projel pro
celý web. Výsledek: **sirotci byli dva** — nová stránka a
**`pozemek-od-obce.html`** („Jak koupit pozemek od obce"), hotový článek,
který je **v sitemap**, takže ho web nabízí vyhledávačům, ale žádná
stránka na něj neodkazuje. Čtenář se na něj nedostane.

Důvod je poučný: rádce na stránce pozemku na články odkazuje **podmíněně
podle druhu nabídky** — a nabídek typu „od obce" je v datech **nula**,
takže ta větev nikdy nenastane. *Odkaz, který závisí na datech, není
odkaz.* (`kupni-smlouva-pozemek.html` na tom byl podobně: jediný statický
odkaz na něj vedl z toho sirotka.)

Opraveno kartou **„Než něco podepíšete"** na rozcestníku
`pozemky-podle-okresu.html` (195 příchozích odkazů) — deset článků
pohromadě, včetně obou osiřelých.

### Nález 2: vzor stránky pozemku se nabízel k zaindexování

`pozemek.html` je **vzor, ne stránka**: bez `?p=` v adrese je na něm
jediná věta „Načítám pozemek…". Přitom měl `robots: index,follow`
a `canonical` sám na sebe — takže web zval vyhledávač k zaindexování
prázdné skořápky, na kterou navíc míří odkaz „Otevřít na mapě"
z každé z 1 944 stránek pozemků.

Vzor je nově `noindex,follow` (odkazy ven se sledovat mají) a generátor
to hotovým stránkám **otáčí zpátky** na `index,follow`. Po opravě:
vzor neindexovaný, **1 944 živých stránek indexovaných**, 129 ukončených
neindexovaných.

### Zkouška

`scripts/test-vyhledavac.mjs` (11 kontrol) hlídá obojí: že na každou
stránku ze sitemap vede statický odkaz, že odkazovaná indexovatelná
stránka v sitemap nechybí, a indexovatelnost **z obou stran** — protože
obrátit tu dvojici naruby by potichu odindexovalo celý web a na číslech
návštěvnosti by se to projevilo za týdny, ne hned.

Počítají se jen odkazy ve **statickém HTML**. Odkaz, který vykreslí až
skript, vyhledávač ani čtenář s vypnutým JavaScriptem nevidí — a je to
přesně ten případ, který tuhle chybu dělal nenápadnou.

Sabotáže: vzor zpět na `index` (2 kontroly padnou), generátor neotáčí
robots zpátky (1), odkaz na sirotka pryč (1).

### A jedna moje chyba, kterou chytila stará zkouška

Odkazy na pozemky v nové stránce jsem psal jako `${str}`, jenže
`STRANKY` mapuje na **záznam**, ne na jméno souboru — do stránky se tím
vepsalo `href="[object Object]"` 91×. Ohlásil to `test-staticka`
(„Odkaz na [object Object] nikam nevede"), ne prohlížeč a ne oko.

## 3ag. NALEZENO: částka napsaná česky („do 1 500 000") hledání nenašlo — a web ji sám všude tak tiskne — *opraveno 10. 10.*

Zkoušel jsem na hledání pětadvacet vět, jaké lidi opravdu píšou, a dvě
třídy z nich selhaly.

### 1. Mezera po tisících

Věta se rozebírá **po slovech**, takže „1 500 000" byla tři slova a
z prvního vyšla jednička — ta je pod mezí, od které se bez jednotky
tipuje cena. Celé „do 1 500 000" tedy spadlo do hledání **obce**
a výpis byl prázdný.

| věta | před | po |
|---|---|---|
| `do 1500000` | ✅ 1 500 000 Kč | ✅ |
| `do 1 500 000` | ❌ text | ✅ |
| `do 1 500 000 Kč` | ❌ text | ✅ |
| `od 500 000` | ❌ text | ✅ |
| `do 900 000 korun` | ❌ text | ✅ |
| `stavební parcela do 1 500 000` | ❌ jen druh | ✅ druh + cena |

Přitom **mezera po tisících je český pravopis** a web sám všechna čísla
tiskne takhle: „28 000 Kč", „1 817 000 Kč". Kdo si částku zkopíruje
z vlastní stránky webu a vloží ji do hledání, dostal nulu.

Opraveno funkcí `cisloSkupiny`: první skupina jedna až tři číslice,
každá další **přesně tři**, aspoň dvě skupiny. Jedna skupina je obyčejné
číslo a to umí `cislo()`; desetinné „1,5" sem nespadne a parcela „769/2"
taky ne.

### 2. Ar

U polí a zahrad je **ar** (100 m²) běžnější jednotka než hektar —
„prodám 20 arů". Web ji neznal, takže „50 arů" padalo celé do hledání
obce. Samotné „a" se schválně nebere: v české větě je to spojka
a „pozemek 50 a les" by se přečetlo jako padesát arů.

### Zkoušky — a sabotáž, kterou jsem nenašel

`scripts/test-dotaz.mjs` 137 → 155 kontrol. Sabotáž „slepování pryč"
shodí sedm kontrol, sabotáž „ar pryč" tři.

Třetí sabotáž ale **prošla**: povolit skupinám jednu až čtyři číslice
místo přesně tří neshodilo ani jednu ze 153 kontrol — všechny
realistické věty vyjdou stejně tak i tak. Místo abych si tu volnost
nechal projít jako „nehlídané, ale asi v pořádku", přidal jsem dvě
kontroly **přímo na pravidlo** (`do 5 1000` se nesmí přečíst jako
51 000). Nejsou to realistické věty a je to u nich napsané; stojí tam
místo sabotáže, která nebyla.

### A při tom úklid

`scripts/bloky.mjs` si psal vlastní haversine. `js/okruh.js` už jeden
má a stojí u něj, že je jeden pro celou mapu. Přeměřeno na čtyřech
dvojicích bodů (111 m až 211 km): shoda do **1e-10 m**, takže kopie
zmizela. (`js/ceny.js` si tu svou nechává schválně — načítá se na skoro
dvou tisících stránkách a kvůli jednomu vzorci tam další skript nepůjde.)

## 3ah. NALEZENO: rozsah ceny se četl obráceně — „500 tisíc – 1 milion" znamenalo „do 500 tisíc" — *opraveno 10. 10.*

Druhé kolo probírání hledání skutečnými větami. Minule to vydalo mezery
po tisících a ar; tentokrát dvě věci, z nichž jedna je horší než
nenalezení.

### 1. Rozsah od–do

| věta | před | po |
|---|---|---|
| `500 tisíc – 1 milion` | ❌ **cenaDo 500 000** | ✅ 500 000–1 000 000 |
| `mezi 500 a 800 tisíci` | ❌ cenaDo 800 000, „500" šlo hledat obec | ✅ 500 000–800 000 |
| `od 500 do 900 tisíc` | ❌ cenaDo 900 000, „500" šlo hledat obec | ✅ 500 000–900 000 |
| `od 1000 do 5000 m2` | ❌ | ✅ výměra 1 000–5 000 |
| `1 – 2 ha` | ❌ | ✅ výměra 10 000–20 000 |

První řádek není jen nenalezení: **dolní mez se stala stropem**, takže
web vyloučil přesně to, co člověk chtěl jako minimum, a jako bonus
poslal „1 milion" hledat obec.

Rozsah se čte **před** jednosměrnými mezemi, jinak si „do 900 tisíc"
vezme jednosměrná větev a dolní mez zůstane ležet. Jednotka smí stát
jen u druhého čísla („od 500 do 900 tisíc") — pak platí pro obě,
protože tak se česky mluví. „od 900 do 500" se nečte vůbec: to není
rozsah, to je překlep.

**Pomlčka se přepisuje na „až"**, ale jen tam, kde je to rozsah: musí mít
kolem sebe mezery a před ní musí stát číslo nebo jednotka částky.
Složené názvy mezery nemají („Praha-východ", „Frýdek-Místek"), takže se
jich to nedotkne. Při psaní se to **rozbilo**: jednotky se porovnávaly
jako podřetězec, takže se „ha" našlo na konci slova „praha" a z
„Praha - 5" se stalo „praha az 5". Teď se shoduje celé slovo a je na to
kontrola.

### 2. Druh řečený dvakrát

Web sám své druhy pojmenovává dvojslovně — „Louka / travní porost",
„Vinice / sad" — takže je lidi tak i píšou. Rozpoznalo se první slovo
a druhé zbylo na hledání **obce**:

```
orná pole Znojmo            → obec „pole znojmo"    ✗ → „znojmo"   ✓
louka travní porost Vsetín  → obec „louka vsetin"   ✗ → „vsetin"   ✓
les lesní pozemek Šumava    → obec „les sumava"     ✗ → „sumava"   ✓
```

Spotřebují se jen názvy **téhož** druhu: „louka les" zůstává loukou
a slovo „les" nezmizí — o druhu už bylo rozhodnuto a zahodit jiný mlčky
by bylo horší než ho nechat. Slova se zároveň dopisují do odznaku, aby
je křížek uměl vyškrtnout z věty.

### Zkoušky

`scripts/test-dotaz.mjs` 155 → **177 kontrol**. Sabotáže: rozsahová
větev pryč (8 kontrol padne), pomlčka se nepřepisuje (3), druh se
podruhé nespotřebuje (4).

## 4. Nevíme, co lidé na webu dělají — *čeká na data, ne na práci*

Měření návštěvnosti je nasazené teprve od 9. 10. 2026. Do té doby se
o webu neví **nic**: kolik lidí chodí, odkud, na co se dívají, kde to
vzdají. Každé rozhodnutí „co dodělat dřív" je zatím odhad.

Za měsíc sbírání bude z čeho vycházet. Do té doby nemá cenu stavět nic
jen proto, že to „asi lidi chtějí".

## 5. Realizované ceny — *majitel (smlouva a peníze)*

Celý cenový model stojí na cenách **nabídkových**, ne na tom, za kolik
se pozemky opravdu prodaly. To je strop, o který se opře každé další
zlepšení odhadu — změřeno, vlastní predikční model nad týmiž daty
nepřidal nic (`scripts/mericka-model.mjs`). Realizované ceny vydává
ČÚZK přes dálkový přístup na smlouvu.

## 6. „Dá se tu stavět?" — *částečně já, částečně licence*

První otázka kupujícího a web na ni neodpovídá. Co by k ní patřilo:
bonita půdy (BPEJ) a z ní odvod za vynětí ze zemědělského fondu, který
u stavby dělá i statisíce; záplavové území; ochranná pásma; územní
plán obce.

Územní plán není nikde strojově čitelný jednotně a část vrstev je pod
licencí. Stránka pozemku dnes aspoň odkazuje na úřad a na katastr —
dál se bez dat jít nedá, a tipovat se to nesmí.

## 7. První načtení mapy stáhne 461 kB — *já*

**OPRAVA ČÍSLA 10. 10.: dřív tu stálo 256 kB a byla to nepravda.**
Výčet pod tím sečetl šest největších položek (data 79 + `main.js` 60 +
Leaflet 41 + stylopis 37 + stránka 23 + kraje 15 = 255 kB) a **vynechal
písma i zbývajících 27 skriptů**. Změřeno znovu v prohlížeči, všechno
v gzipu, co si úvodní stránka opravdu stáhne (42 požadavků):

| skupina | gzip | podíl |
|---|---|---|
| **písma** (4 soubory woff2) | **149,4 kB** | **32 %** |
| skripty `js/min/*` (27) | 109,4 kB | 24 % |
| data (nabídky 77,5 + kraje 15,1 + zlevnění 2,5) | 95,1 kB | 21 % |
| Leaflet (js + css) | 44,9 kB | 10 % |
| stylopis | 37,3 kB | 8 % |
| stránka | 23,1 kB | 5 % |
| ikony | 1,5 kB | 0 % |

Největší položka tedy **nejsou data**, ale **písma** — a právě o nich
ten odstavec mlčel, takže úvahy o zeštíhlení mířily jinam, než kde jsou
bajty. (Dlaždice mapy se nepočítají: jdou z cizího serveru.)

**Písma už podřezaná jsou** (253 → 149 kB, viz komentář v `css/styles.css`).
Co z nich ještě jde a co by to stálo, **změřeno**: Fraunces nese osu
optické velikosti (`opsz` 9–144). Připnout ji na jednu hodnotu ušetří
**49,5 kB** (105,2 → 55,7 kB, tedy o 53 % méně) — jenže je to záměr:
`font-optical-sizing:auto` je výchozí, takže se dnes řez mění s velikostí
písma, a Fraunces se na webu používá od **12 px do 68 px**. Porovnání
snímků nadpisu (50 px, 2× zvětšení) ukazuje, že rozdíl **vidět je**:
15,8 % bajtů obrázku se liší, průměrně o 174 ze 255. Při `opsz` 9 je
nadpis znatelně tučnější a rozmáchlejší. Za 49,5 kB by se tedy platilo
typografií; je to **rozhodnutí majitele, ne oprava**, a tady je oceněné.

**Co se 10. 10. opravdu odebralo:** `js/min/radce.js` (6,1 kB gzip) se
stahoval na `index.html`, kde `PK_RADCE` nevolá nikdo. Je to čistá
knihovna — ani jeden dotek s DOM, sítí nebo časem — takže sama od sebe
nedělá nic; volá ji jen `js/pozemek.js`, a ten na úvodní stránce není.
Zůstal tam po zrušeném panelu detailu nad mapou (komentáře v
`js/main.js` o něm mluví v minulém čase). Naměřeno: 466,9 → **460,9 kB**
a o jeden požadavek méně.

A hlavně: **pravidlo se přestalo psát ručně.** `scripts/test-skripty-na-strance.mjs`
mělo výčet knihoven o jedné položce (`hlidani-logika`), takže na `radce`
nemohlo přijít. Teď se knihovny **hledají**: modul, který vystaví
globální `PK…` a přitom nesahá na DOM, síť ani čas, nemá jak něco udělat
sám od sebe — a stránka, která ho načte, musí jeho jméno použít. Najde
se jich **24** a kontrola projde všech **2 209 stránek**. Dvě sabotáže:
vrácení mrtvého skriptu na úvodní stránku kontrolu shodí, a rozbité
hledání knihoven shodí pojistku „našlo se jich dost" (jinak by kontrola
tiše měřila prázdno).

Zbývající velká položka jsou pořád **data**: dalo by se posílat nejdřív
tenký řez a zbytek dotáhnout. Je to ale zásah do jádra aplikace a bez
měření návštěvnosti (bod 4) se nedá poznat, jestli se tím někomu uleví —
zatím tedy ne. (Změřeno i to malé: zkrátit souřadnice na pět desetinných
míst ušetří 3,1 kB ze 77,5, na čtyři 5,6 kB. Za to nestojí riskovat, že
se změní klíče, podle kterých mají lidé uložené pozemky.)

**Nalezeno a odebráno 9. 10. — na STRÁNKÁCH, kam chodí lidé
z vyhledávačů:**

* `js/hlidani-logika.js` (11 kB očištěných) se načítalo na **126
  stránkách** a `PKHlidani` na nich nevolal nikdo. Stálo tam kvůli
  odznaku upozornění v nabídce, jenže ta funkce je z webu odebraná
  a `#nav-zpravy` ani `#nav-hlidani` dnes neplní žádný skript.
* `js/graf-cen.js` (8,4 kB) chodilo na všech 105 generovaných
  stránkách, přestože graf je jen na 91 z nich (okresy a kraje).

Dohromady 19,4 kB zdroje navíc, a nic z toho nespadlo ani by nespadlo.
Změřeno v gzipu, co si stránka opravdu stahuje: stránka podle rozpočtu
**13,0 → 6,0 kB skriptů** (o 54 % méně), stránka okresu 13,0 → 9,3 kB
(o 29 % méně, graf na ní zůstává). Hlídá
`scripts/test-skripty-na-strance.mjs`: skript vázaný na prvek se smí
načítat jen tam, kde ten prvek je, a knihovna jen tam, kde její jméno
někdo opravdu použije.

## 8. Platby a e-maily — *majitel*

Hotové v kódu, čekají na účty: IČO a klíče Stripe (zvýraznění
inzerátu), potvrzená doména v Resendu (obnova hesla a upozornění na
nové pozemky). Rozepsané je to v `docs/pred-vydanim.md`.

---

## Zvážené a ZAMÍTNUTÉ, protože to data neunesou

Ať je vidět i to, co se nepostavilo, a proč. Jinak se ten nápad po
půl roce vrátí jako nový.

**Přednačítat i rozšířené řezy písem.** Změřeno, že to neplatí za to.
Přednačítají se dva soubory ze čtyř (`inter-latin`, `fraunces-latin`),
rozšířené řezy (`-ext`, nesou č, ě, ř, š, ž, ů) se najdou až ze
stylopisu. Přitom **všech 2 207 stránek** má ve viditelném textu
aspoň jeden znak z Latin Extended-A — ty soubory se tedy stahují
vždycky, takže jejich přednačtení nestojí ani bajt navíc. Vypadá to
jako zdarma.

Naměřeno na úvodní stránce, telefon 390 px, linka 400 kb/s a odezva
300 ms, čtyři běhy proti čtyřem:

| | první vykreslení (FCP) | písma hotová |
|---|---|---|
| dnešní stav | **4 680–4 712 ms** | 9 021 ms |
| s přednačtením ext | 4 860–5 352 ms | **7 529 ms** |

Tedy **−1 492 ms na dojetí písem, ale +180 ms na první vykreslení** —
a to opakovaně, ne jako rozptyl. Čtyři přednačtená písma soutěží
o linku se stylopisem, který vykreslení blokuje. První vykreslení
platí každý; pozdější výměna písma je kosmetická. Zamítnuto.

Vedlejší zjištění z téhož měření: **posun rozvržení to nezpůsobuje.**
CLS vyšel 0,0212 v obou variantách do znaku stejně, a zdrojem byl
výpis (`UL.opp-list [579/265→637/207]`), ne text. Hypotéza „v CI dojede
písmo pozdě a text přeteče" je tím vyvrácená — viz bod 3v.

**„Přejdi hranici okresu a ušetříš."** Sousedství okresů se z
`data/okresy-hranice.json` spočítat dá — vyšlo 190 sousedních párů
a kontrola na Benešovu i Praze sedí. Jenže aby se o dvou okresech dalo
tvrdit, že se mezi nimi cena liší, musí mít OBA dost vzorků: při mezi
25 nabídek (`CENY.DOST_NABIDEK`, tatáž, jakou web používá všude jinde)
zůstanou ze 190 párů **čtyři** — a z nich tři mají rozdíl 2 až 5 %,
tedy nic. Jediný opravdový je Břeclav proti Brnu-venkov (62 vs.
81 Kč/m², o 23 % levněji). Stránka postavená na jednom páru by byla
chytlavý nadpis nad jedním číslem; při snížení meze na 10 nabídek by
párů bylo 63, ale ta mez už o okrese nic neříká. Až bude dat víc,
spočítá se to znovu.

**„Jak dlouho je pozemek v nabídce" u jednotlivé parcely.** U každé
nabídky máme `first_seen`, takže stáří spočítat jde — jenže znamená
*kdy jsme ji poprvé viděli my*, ne kdy ji prodejce vystavil. Evidence
začala 19. 9. 2026 a prvního dne naskočilo naráz všechno, co na trhu
už bylo; poctivě se tedy dá počítat jen u nabídek, které přibyly
potom. To je dnes **373 z 2 001 (19 %)** a nejstarší z nich má
**19 dní**. Věta „v nabídce 9 dní" u pozemku, který se možná prodává
rok, je horší než mlčení, a u čtyř pětin stránek by nebyla vůbec.
Trh jako celek tu osu má (puls na `cena-pozemku.html`), kde se počítá
z toho, co se za tu dobu POHNULO, a to zkreslené není. Až bude
evidence stará aspoň půl roku, spočítá se to znovu.

**Vlastní stránka pro každou obec.** Obcí je v nabídce 1 067, ale
nabídek na obec málo: aspoň deset má **čtrnáct** obcí, aspoň osm
dvacet tři, dvacet a víc ani jedna. Stránka o osmi řádcích je thin
content — proto má přehled podle druhu mez čtyřicet nabídek. Obce
s aspoň dvěma nabídkami navíc už stojí jako rozcestník na stránce
svého okresu, takže cesta k nim existuje.

## 3ai. NALEZENO: karta tvrdila „levnější než 78 % pozemků v okrese" o dražbě, kde se srovnávaly jen dražby — *opraveno 10. 10.*

Verdikt o ceně („Výhodná cena — levnější než 78 % pozemků téhož druhu")
se počítá jako percentil v přihrádce **`typ | druh | okres`**. To slovo
`typ` je podstatné: dražba se srovnává **jen s dražbami**, prodej jen
s prodeji. U dražby to tedy je vyvolávací cena proti vyvolávacím cenám
— ne proti tomu, za kolik se v okolí pozemky prodávají. Je to jiné
tvrzení a jen jedno ze tří míst na webu ho vyslovovalo správně:

| kde | věta před opravou |
|---|---|
| stránka pozemku | „levnější než 78 % pozemků téhož druhu **v dražbě** v okrese Litoměřice (53 nabídek)" ✅ |
| karta na mapě | „levnější než 78 % pozemků téhož druhu v okrese Litoměřice (53 nabídek)" ❌ |
| tipy na úvodní stránce | „levnější než 92 % **podobných** v okrese Litoměřice" ❌ |

Týž pozemek tak o sobě na kartě a na své vlastní stránce tvrdil dvě
různé věci — a to na kartě bylo to nepravdivé. Ověřeno v prohlížeči na
`pozemek-litomerice-vinne-114ei4a.html`: stránka tiskne „Levnější než
97 % pozemků téhož druhu **v dražbě** v okrese Litoměřice (29
nabídek)".

**Změřeno na ostrých datech.** Percentil mimo prodej dostane **62
nabídek**, všech 62 v jediném okrese: na Litoměřicku, kde jsou dvě
přihrádky dražeb dost velké (ostatní plocha 53 nabídek, orná půda 11)
— nikde jinde v republice dražeb tolik není.

Kolik z toho je vidět na kartě, je potřeba říct přesně, protože **první
číslo, které jsem naměřil (19 karet), neplatilo**: odznaky na kartě
jsou řada `else if` a větev s percentilem je v ní až čtvrtá — před ní
se chytají tři větve odhadu („ověřit cenu", „cena k ověření", „−N %
proti okolí"). Mimo prodej se tedy do ní dostane **129 nabídek** a jen
u **dvou** by věta nesla procento; zbylých 127 má obecnější tvar „cena
za m² patří k nejnižším u pozemků téhož druhu", kterému typ chyběl
stejně. Mezi dnešními čtyřmi tipy na úvodní stránce dražba není, ale
nic jí v tom nebrání: tipy se vybírají ze všech nabídek bez ohledu na
typ.

**Oprava.** Větu o skupině skládá jedno místo, `PK_CENY.skupinaText`
v `js/ceny.js` (`v prodeji` / `v dražbě` / `v nabídce`), a používají ho
všechna tři místa. Dřív to znění existovalo jen v `js/pozemek.js`,
takže se ta tři místa rozešla, aniž by se to dalo poznat.

**Pojistky** (`scripts/test-ceny.mjs`, prověřeno sabotáží):

* přihrádka percentilu je opravdu podle typu — měří se na skutečných
  datech, že vzorek dražby (53) je menší než všechny typy téže
  přihrádky (57). Kdyby se přihrádka rozšířila na všechny typy,
  kontrola spadne — a zároveň by ta věta „v dražbě" začala být naopak
  zavádějící, takže hlídá i opačný regres.
* `js/main.js` i `js/pozemek.js` musí `skupinaText` volat, a staré
  znění „% podobných" se do nich nesmí vrátit.
* že je co měřit: kontrola nejdřív ohlásí, kolik nabídek mimo prodej
  percentil vůbec dostane, a pod pěti spadne. Jinak by po změně dat
  tiše procházela naprázdno.

## 3aj. Pojistka: každý filtr, který věta umí pojmenovat, musí být zapojený

Jedno políčko rozebírá celou větu do sedmnácti klíčů (`druh`, `cenaOd`,
`okruh`, `jenCelek`, …). Ruční výčet kontrol v `scripts/test-dotaz.mjs`
hlídal jedenáct z nich — a s parserem se rozejde tak, že si toho nikdo
nevšimne: kdo přidá nový klíč, rozebranou větu o něj obohatí (člověk
dokonce uvidí odznak, že to web pochopil), ale mapa o něm neví a filtr
neudělá nic. **Tiché nic je horší než chybová hláška.**

Kontrola teď bere seznam klíčů ze **zdroje parseru** (`var ven = {…}`
v `js/dotaz.js`) a každý musí být v `js/main.js` někde použitý — buď
jako `dotazFiltr.<klíč>`, nebo jako `r.<klíč>` (tak se zpracovává
`okruhMisto`, ze kterého se počítá střed okruhu). Měřeno: všech
sedmnáct zapojených je, tedy dnes žádná mezera — kontrola je tu proti
té příští. Sabotáží prověřeno obojí: přidaný nezapojený klíč shodí
kontrolu, a rozbité čtení seznamu shodí pojistku „seznam se opravdu
přečetl" (bez ní by kontrola měřila prázdno).

## 3ak. NALEZENO: řádek dražby tvrdil „−37 % proti okolí" — sleva z ceny, od které se teprve přihazuje — *opraveno 10. 10.*

Hladina, proti které se ten odznak měří, je z běžných nabídek na prodej
— to je správná srovnávací skupina. Jenže číslo, které se s ní srovnává,
u dražby není cena, za kterou se pozemek prodává: je to **vyvolávací
cena**, od níž se přihazuje. „−37 % proti okolí" se čte jako sleva
a slibuje něco, co dražba teprve rozhodne.

**Změřeno na vygenerovaných stránkách:** 2 194 řádků, z toho 205 dražeb
a exekucí; odznak nese **14** z nich — na stránce dražeb a na okresech
Beroun a Litoměřice. Stránka pozemku je u téhož pozemku opatrná
(„Vyvolávací cena 1 875 000 Kč" a „o 37 % níž — takový rozdíl bývá…"),
ale `pozemky-okres-beroun.html` neobsahovala slovo „vyvolávací" **ani
jednou** — a je to ta stránka, na kterou se chodí z vyhledávačů.

**Oprava.** Odznak teď u dražby i exekuce cenu pojmenuje
(`−37 % proti okolí (vyvolávací cena)`) a u všech 205 řádků mimo prodej
stojí u čísla popisek, co to číslo je. Odznak se nezahazuje: bez něj by
čtenář o vztahu vyvolávací ceny k okolí nevěděl nic.

**Pojistky** (`scripts/test-odhad-regiony.mjs`, všechny tři prověřené
sabotáží):

* řádky mimo prodej se opravdu našly (216) — jinak by kontroly níž
  neměřily nic,
* u každého stojí, co to číslo je,
* a odznak slevy tu cenu pojmenuje.

Přitom se našla **tichá chyba v té zkoušce samotné**: vzor na cenu zněl
`class="okr-cena"><b>` a přidaný popisek ho rozbil — 122 z 2 111 řádků
z kontroly beze slova vypadlo, protože mez „prošly se stovky řádků" je
splněná i bez nich. A vypadly by právě dražby, kvůli kterým ten popisek
vznikl. Zkouška teď hlásí, u kolika řádků se cena **opravdu přečetla**
(2 411 z 2 411), takže se to podruhé nestane tiše.

## 3al. NALEZENO: o státní půdě za úřední cenu web tvrdil „Výhodná cena" a zároveň „ověřte si to" — na 204 nabídkách — *opraveno 10. 10.*

Desetina všech nabídek na webu je **státní půda prodávaná podle § 12**:
cenu u ní nestanovil trh, ale Státní pozemkový úřad, a prodává ji
oprávněné osobě. Web to **sám vysvětluje** na `cena-pozemku.html` —
„do mediánů nezapočítáváme ceny, které nestanovil trh… u orné půdy
medián 8 Kč/m² proti 74 Kč/m² na trhu, u zahrady 40 proti 791". Do
srovnávacích přihrádek se takové nabídky opravdu nedostanou. Jenže
**verdikt se pro ně pořád počítal** — a tak se cena stanovená úřadem
porovnávala s nabídkovými cenami na trhu.

Co z toho vzniklo, ověřeno v prohlížeči na
`pozemek-nymburk-velke-vykleky-1ahu3b2.html` (orná půda, 9 Kč/m²):

> **Výhodná cena** · Levnější než **98 %** pozemků téhož druhu v prodeji
> v okrese Nymburk (11 nabídek).
> **Nabídková cena** 5 057 Kč · **Obvyklá cena v okolí do 25 km**
> 28 125 Kč · **o 82 % níž** — takový rozdíl bývá spoluvlastnický podíl
> nebo jiná výměra, ověřte si to

Nepravdivé jsou všechny tři věty: výhodná není (za tu cenu nekoupí
kdokoli), nabídková ta cena není (stanovil ji úřad) a ověřovat není co
(podíl to není, výměra je správná — cena je taková ze zákona). A hned
vedle **„ověřte si to" a „Výhodná cena" o témže čísle**, tedy varování
i doporučení zároveň.

**Změřeno na ostrých datech (204 nabídek se správní cenou):**

| kde | co tam stálo | kolikrát |
|---|---|---|
| stránka pozemku | percentil „Výhodná cena / levnější než N %" | **162** |
| stránka pozemku | blok s tučným „o N % níž" | **154** |
| karta na mapě | „ověřit cenu" („bývá to spoluvlastnický podíl… chyba v inzerátu") | **136** |
| karta na mapě | „cena k ověření" | **11** |
| okresní a druhové výpisy | „cena k ověření" (ze 340 řádků SPÚ) | **248** |
| okresní a druhové výpisy | „−N % proti okolí" | **3** |
| doporučení | plných 45 bodů za „slevu", tedy mezi vším viditelným nejvíc | **2** |

**Oprava — jedno pravidlo, čtyři místa.** Úředně stanovená cena
nedostane verdikt o trhu:

* `percentil()` pro ni vrací `null` (162 → 0; u běžných nabídek jich
  dál funguje 942),
* blok na stránce pozemku se ukazuje dál, ale **jinak**: cena se jmenuje
  **„Cena stanovená úředně"** a místo tučné slevy stojí „Se trhem to
  nesrovnáváme — tuhle cenu nestanovil trh, ale úřad: SPÚ prodává podle
  § 12 oprávněné osobě". Pod tím zůstane, kolik tu stojí pozemky **na
  trhu** — to je údaj, který na stránce jinde není,
* karta na mapě i řádek výpisu říkají **„úřední cena (§ 12)"**, a to
  týmž neutrálním stylem jako „podíl": není to varování ani výhoda, je
  to fakt o tom, za co se prodává (340 → 340 správně popsaných řádků,
  248 falešných varování pryč),
* „Doporučujeme" na ni nesedne — ani bodováním, ani přes pojistku
  u výběru.

**Pojistky** (`scripts/test-ceny.mjs` a `scripts/test-odhad-regiony.mjs`,
pět sabotáží, všechny chycené). Jedna z nich **neprošla hned**: kontrola
na doporučení se ptala celého `js/main.js`, jestli v něm někde stojí
`MODEL.spravniCena(d)` — a to je splněné i po vyřazení podmínky
z bodování, protože výraz zůstal na tom druhém místě. Kontrola se teď
dívá do **vyříznutého těla** `demand()` a zvlášť do výběru
`hotIds`; po té opravě sabotáž padá na obou.

Zkoušky navíc hlásí, kolik toho přečetly (204 nabídek, 365 řádků), a že
**bez té výjimky by varovala nebo slevila většina** (151 z 204) — kdyby
to číslo spadlo, výjimka nic neřeší a měření je mylné.

A ještě jedna zkouška se k tomu ozvala sama: `scripts/test-strop-ceny.mjs`
hlídá, že **každá** nabídka, kterou model považuje za nedůvěryhodnou,
nese v řádku varování — a čtyři ze čtrnácti takových jsou právě státní
půda. Výjimka tam je teď napsaná adresně: u státní půdy se čeká „úřední
cena (§ 12)" a varování tam stát **nesmí**; u všech ostatních se vyžaduje
dál. Zkouška navíc hlásí, že výjimka platí pro **část** (4 ze 14), ne pro
všechny nebo pro nikoho — jinak by nic neměřila.

## 3am. NALEZENO: odznak „Zlevněno o 30 %" u dražby — tam ale nikdo nezlevnil — *opraveno 10. 10.*

Třetí nález téhož druhu jako 3ai a 3ak: **web si o téže věci na dvou
místech protiřečil, a to místo, které se čte víc, mělo nepravdu.**

Stránka „Co je na trhu nového" pod seznamem zlevněných píše: *„U N z nich
jde o dražbu: tam nikdo nic nezlevnil, jen soud nebo dražebník vypsal
nižší vyvolávací cenu v opakované dražbě."* V kódu k tomu stojí komentář
„Číslo je pravdivé, věta o něm nebyla" — a opravila se tehdy jen ta jedna
stránka. **Odznak na kartě** a **řádek na stránce pozemku** dál psaly
„Zlevněno o 30 %", protože větu skládá `js/zlevneni.js`, který typ
nabídky neznal.

A je to zrovna ten údaj, u kterého si člověk nemá jak pomoct: minulou
cenu pozemku **nevidí nikde jinde než u nás**.

**Změřeno:** změn ceny je dnes 20 (15 zlevnění, 3 zdražení, 1 podezřelý
skok u prodeje) a **jedna** z nich je dražba — Ondřejov, okres
Praha-východ, −30 %. Na tom čísle nález nestojí; stojí na tom, že ta věta
je u dražby nepravdivá bez ohledu na to, kolikrát se zobrazí.

**Oprava v jednom místě.** `krok()` si teď s sebou nese typ nabídky,
takže všechna místa dostanou správné znění zdarma:

| typ | odznak | popisek navíc |
|---|---|---|
| prodej | `Zlevněno o 30 %` | — (nezměněno) |
| dražba | `Vyvolávací cena −30 %` | „Není to sleva od prodávajícího: u dražby se v opakovaném kole vypisuje nižší vyvolávací cena a od té se znovu přihazuje." |
| exekuce | `Uváděná cena −30 %` | „…u exekuce tohle číslo uvádí exekutor a může ho v dalším kole snížit, prodejní cena se tím neslibuje." |

U **zdražení** se nic nevysvětluje: věta o opakované dražbě by tam
neplatila, vyvolávací cena se v dalším kole nezvedá. Podezřelý skok si
drží svou vlastní větu („Cena se změnila o N % — ověřit"), ta má přednost.

**Co to stojí v pixelech, změřeno, ne odhadnuto.** Nové znění je o šest
znaků delší (21 proti 15) a `.opp-zlevneno` nemá `white-space:nowrap`,
takže se text zlomí. Na té jedné dražbě, které se to dnes týká, při
šířkách 320 / 360 / 414 / 768 px: odznak **nikde nevyčuhuje z karty**
a karta vyroste **jen při 360 px**, z 226 na 245 px (jedna řádka odznaků
navíc). Kratší „Vyvolávací −30 %" by těch 19 px ušetřilo za cenu věty,
která nic neříká — proto zůstává to delší.

**Pojistky** (`scripts/test-zlevneni.mjs`, 31 kontrol, tři sabotáže,
všechny chycené): že typ do kroku doopravdy vstoupí (bez něj padne sedm
kontrol), že vysvětlení v popisku je, a že typ projde i u změny
**dopočítané z archivu** (pole `h`) — právě odtud ji bere stránka
pozemku, takže ta cesta se dá rozbít zvlášť.

## 3an. MŮJ REGRES: zkouška se kotvila doslovným opisem řádku, a já ten řádek změnil — *opraveno 10. 10.*

Tohle je chyba moje, ne webova, a patří sem stejně jako ostatní.

`scripts/test-doporuceni.mjs` si bral kus `js/main.js` od doslovného
opisu řádku:

```js
const mainKarta = main.slice(main.indexOf('var _od = MODEL ? MODEL.odhad(d) : null;'));
```

Když do té podmínky přibylo vyřazení úředně stanovené ceny (nález 3al),
řádek začal znít `var _od = (MODEL && !_uredni) ? MODEL.odhad(d) : null;`
— `indexOf` vrátil **−1** a `slice(-1)` uřízl **poslední znak souboru**.
Kontrola pak spadla na tom, že se v jednom znaku nenašlo varování
„ověřit cenu". Ne proto, že by se web zhoršil; proto, že se v něm hnulo.

**A kdyby byl vzor pod tím shovívavější, dopadlo by to hůř: prošla by
naprázdno.** To je přesně ten druh tiché kontroly, který tenhle
dokument jinde popisuje jako horší než žádnou.

**Oprava.** Kotva je teď vzor (`/var _od = [^\n]*MODEL\.odhad\(d\)[^\n]*;/`)
a zvlášť se tvrdí, že se **našla** — takže se příště ozve chybou „kotva
se nenašla", ne záhadným propadem o kus dál. Dvě sabotáže, obě chycené:
přejmenování proměnné shodí kontrolu kotvy i tu pod ní, a odebrání
varování z karty shodí jen tu druhou.

**Jak to uteklo a co s tím.** Po nálezu 3al jsem pustil jen čtyři
prohlížečové zkoušky, kterých se změna podle mě týkala — ne celou
dávku. Nespadlo nic a pushnul jsem to; CI pak na `v-prohlizeci`
spadlo. Výběr „co se toho asi týká" tady nestačí: tahle zkouška čte
`js/main.js` jako **text**, takže se jí může dotknout každá změna
v něm. Před pushem teď jede celá dávka (101 prohlížečových zkoušek).

## 3ao. NALEZENO: v „srovnatelných nabídkách v okolí" stála jako důkaz o trhu cena, kterou stanovil úřad — na 37 stránkách — *opraveno 10. 10.*

Přímé pokračování bodu 3al. Tam se státní půda podle **§ 12** přestala
chválit odznakem „výhodná cena" a přestala dostávat percentil. Jenže
verdikt o trhu neříká web jen odznakem: stránka pozemku má sekci
**Srovnatelné pozemky**, kde stojí věta „z pěti nabídek do 17 km je
tenhle nejdražší" a pod ní všech pět i s cenami. A tam ta úřední cena
zůstala.

### Proč to je chyba

Státní pozemkový úřad prodává podle § 12 **oprávněné osobě** za cenu,
kterou nestanovil trh. Z VŠECH srovnávacích přihrádek v `js/ceny.js`
taková nabídka vypadává — komentář u `spravniCena` to říká naplno:
„Na to je cena, kterou stanovil úřad, špatné pozorování ve VŠECH
přihrádkách, ne jen v té srovnávací." Vypsaný seznam srovnatelných je
ale taky přihrádka, jen vidět. Síto v `generate-parcel-pages.mjs`
vyhazovalo dražby (`type !== 'sale'`), podíly (hvězdička v klíči
skupiny) i ceny, před kterými web sám varuje (`pochybna`) — na § 12 se
zapomnělo, protože ta nabídka JE `sale`.

### Jak velké to bylo

Změřeno na datech z 10. 10. — a nejdřív nad sítem generátoru, pak
ještě na hotovém HTML (ostrůvek `#pz-srovnani-data`), aby to nebylo
jen tvrzení o kódu:

| | |
|---|---|
| nabídek s úřední cenou | 204 |
| z nich projde sítem do srovnávání | 51 |
| stránek s aspoň jedním § 12 řádkem | **37** |
| takových řádků | **82** |
| stránek § 12, které dostaly vlastní pořadí proti trhu | **20** |

Jak daleko je ta cena od trhu (medián Kč/m², jen nabídky k prodeji):

| druh | trh | § 12 | poměr |
|---|---|---|---|
| Orná půda | 46 | 8 | 5,6× |
| Zahrada | 696 | 57 | 12,1× |
| Vinice / sad | 64 | 9 | 6,9× |
| Louka / travní porost | 39 | 16 | 2,5× |

Nejkřiklavější případ ze stránek: `pozemek-brno-mesto-brno-zzd0y3.html`
tvrdila „Z pěti nabídek do 17 km je tenhle **nejdražší**" — a tři
z těch pěti byly ceny od úřadu (157, 127 a 17 Kč/m²). Pozemek za
36 Kč/m² byl jinde „z čtyř nejdražší" proti 31 Kč/m² od úřadu. Za
tolik se louka neprodává; to je cena pro oprávněnou osobu.

### Oprava a co stojí

Jeden řádek v sítu generátoru (`if (MODEL.spravniCena(d)) continue;`),
tedy stejné pravidlo jako všude jinde v modelu. Změřeno před a po:

| | před | po |
|---|---|---|
| stránek se sekcí srovnatelných | 963 | 935 |
| § 12 řádků | 82 | **0** |
| stránek § 12 s pořadím proti trhu | 20 | **0** |
| medián okruhu | 16 km | 16 km |
| 90. percentil okruhu | 24 km | 24 km |

Sekci tedy ztratí 28 stránek z 963 (−2,9 %) a z nich 20 jsou právě ty
§ 12, které verdikt o trhu mít neměly. Okruh se neprotáhl ani
o kilometr.

Přestavba se na tom shodne do jedné stránky: změnilo se **39** souborů
`pozemek-*.html` — 28 sekci ztratilo (přesně ten rozdíl 963 → 935)
a 11 si ji nechalo s jinými řádky. Ověřeno proti HEAD, že **všech 39**
tu sekci předtím mělo: nic jiného se tím nepohnulo.

### Zkoušky — a proč jsou dvě

`scripts/test-srovnatelne.mjs` má 35 → **42** kontrol, ve dvou
vrstvách:

1. **nad daty** — zrcadlí síto generátoru a hlídá, že se § 12 nedostane
   mezi kandidáty ani do vypsaných řádků;
2. **nad hotovým HTML** — projde všech 1 941 stránek, přečte ostrůvek
   `#pz-srovnani-data` a změří totéž na tom, co se opravdu vygenerovalo.

Druhá vrstva je tam proto, že první si pravidlo **opisuje**: kdyby
někdo ten řádek z generátoru vyndal, zůstane zelená, protože měří svou
kopii, ne web. K obojímu patří pojistka na pojistku („stránky s úřední
cenou se dohledaly (204)", „seznamy se opravdu našly (935, 4 580
řádků)"), bez kterých by nuly byly zelené i na prázdném vzorku.

**Prokázáno sabotáží, obě vrstvy zvlášť:** s vrácenými stránkami
z posledního commitu (stav před opravou) spadly obě kontroly nad HTML;
s vyndaným sítem ze zkoušky spadly obě kontroly nad daty. Nic z toho
neprošlo omylem.

## 3ap. NALEZENO: rádce u státní půdy hádal tři špatné důvody, zatímco web ten pravý zná — na 151 stránkách — *opraveno 10. 10.*

Třetí plocha ve téže věci (po bodech 3al a 3ao). Cenový blok na stránce
pozemku od rána říká u § 12 naplno „**Se trhem to nesrovnáváme** — tuhle
cenu nestanovil trh, ale úřad" a komentář u něj dodává, že staré
vysvětlení bylo **nepravdivé**: „ověřovat tu není co". Hned pod ním ale
stojí rádce (`js/radce.js`, sekce „Co říká cena") — a ten to staré
vysvětlení tiskl dál. Stránka si odporovala sama se sebou.

### Co přesně stránky tvrdily

Změřeno na ostrých datech, všech 204 nabídek s úřední cenou:

| co rádce říkal | nabídek |
|---|---|
| „Takový rozdíl už nebývá sleva: nejčastěji je v inzerátu výměra **celé parcely**, ale prodává se jen **spoluvlastnický podíl**, nebo jde o dražbu s jinou výměrou, případně o chybu v ceně. **Ověřte si to na listu vlastnictví**" | **136** |
| „Cena za m² je **hluboko pod** obvyklou… To bývá nejčastěji spoluvlastnický podíl… **nebo je to chyba v inzerátu**" | 11 |
| „**Může to být příležitost**" | **2** |
| „o 50 % pod obvyklou" | 2 |
| bez cenové rady (odhad nevznikl) | 53 |

Dohromady **151 ze 204** (74 %) tvrdilo o té ceně něco, co neplatí —
a dvě stránky ji rovnou chválily, tedy právě to, co se dnes odebralo
odznaku na kartě. Ukázka: Velké Výkleky (orná půda) — „Cena je o 82 %
pod obvyklou… Vychází to na 9 Kč/m² proti obvyklým 49 Kč/m². Takový
rozdíl už nebývá sleva: nejčastěji je v inzerátu výměra celé parcely,
ale prodává se jen spoluvlastnický podíl… Ověřte si to na listu
vlastnictví." Žádný podíl to není, dražba taky ne a chyba v ceně už
vůbec — je to § 12 a web to v témže bloku ví.

### Oprava

V `cena()` stojí nová větev **jako první**, dřív než obě stará
varování. Říká, co to je, že rozdíl není sleva — a hlavně to jediné
použitelné: že se tu neověřuje cena, ale **kupující**. Oprávněná osoba
je podmínka, kterou stránka nikde jinde v jedné větě nemá.

Protože ta větev nepotřebuje odhad, dostane vysvětlení i těch **53
nabídek, které dřív mlčely** — všech 204 tedy místo hádání dostane
totéž, co říká blok nad rádcem.

Ověřeno, že se změna nerozlezla jinam: porovnáním textu cenové rady
u **všech 1 940** nabídek proti verzi z gitu se změnilo přesně **204**
rad, a všechny jsou § 12. Nikde jinde ani jedna.

### Zkoušky

`scripts/test-radce.mjs` má 61 → **69** kontrol. Nad vymyšleným vzorkem
se hlídá, že se řekne § 12, že se **nehádá** podíl, dražba ani chyba
v inzerátu, že se nechválí příležitost a že se ověřuje kupující —
a vzorek je schválně takový, že by bez té větve spadl do varování
o pochybné ceně, aby se poznalo, že nová větev stojí **dřív** než
staré. K tomu kontrola, že tatáž nabídka **bez** zmínky o SPÚ dostane
starou radu beze změny.

Na ostrých datech přibyla výjimka k pravidlu „u vyčísleného rozdílu
musí stát i cena za metr a z kolika nabídek". § 12 je druhá výjimka
z téhož důvodu jako podíl: srovnání se nedá udělat, takže se o něm
nemluví, a čísla o trhu tiskne blok NAD rádcem. Výjimka je pojištěná,
aby nebyla plošná: hlídá se, že vyjímá dost nabídek, aby se projevila,
**a zároveň ne všechny** (140 ze 436), a že u všech vyjmutých rádce
opravdu říká tu správnou věc.

**Prokázáno sabotáží:** s vypnutou větví (`if (false && …)`) spadly
všechny čtyři nové kontroly i ta na ostrých datech.

## 3aq. NALEZENO: porovnávací tabulka byla poslední místo, kde úřední cena vyšla jako obyčejné „Na prodej" — *opraveno 10. 10.*

Čtvrtá a poslední plocha téže věci (po 3al, 3ao a 3ap). Po třech
opravách jsem všechna místa, která o ceně něco tvrdí, prošel
soustavně — a jedno zbylo: tabulka na `porovnani.html`.

### Co tam bylo

Tabulka má sloupec „Kategorie", kde se tiskne typ nabídky. U státní
půdy podle § 12 tam stálo prostě **„Na prodej"**. A ve sloupci „Cena za
m²" tabulka **zeleně označuje nejnižší hodnotu** — takže cena, kterou
stanovil úřad, mohla zelenou dostat vedle cen z trhu, bez jediné
známky, že je z jiného světa.

Změřeno na ostrých datech:

| | |
|---|---|
| skupin okres\|druh s aspoň dvěma nabídkami | 282 |
| z nich míchá úřední cenu s trhem | **42** |
| skupin, kde by zelenou „nejnižší cena za m²" dostala úřední cena | **51** |
| nejhorší případ | Česká Lípa / orná půda: **24 z 26** nabídek od SPÚ |

Jedna věc je naopak v pořádku, a ověřil jsem si ji: **živá ukázka**,
kterou vidí nový návštěvník bez uložených pozemků, dnes § 12 neobsahuje
— vybírá se největší skupina téhož okresu a druhu a dnes vyhrává
Praha-východ / stavební pozemek, kde není ani jedna. Je to ale vlastnost
dat, ne pravidlo, takže se na to nedá spoléhat.

### Oprava — a co se NEzměnilo

Do sloupce „Kategorie" se k typu připisuje **úřední cena (§ 12)**,
stejným tónem jako odznak v krajských výpisech, s popiskem shodným
s odznakem na kartě.

**Zelená značka zůstává, a je to rozhodnutí, ne opomenutí.** Ta cena za
metr opravdu nejnižší JE a značka o sobě tvrdí přesně tohle — pod
tabulkou stojí „Zeleně je **nejnižší cena za m²**… Který pozemek je
nejlepší, z tabulky nevyplývá". Odebrat zelenou pravdivě nejnižšímu
číslu by tabulka lhala na druhou stranu. Co chybělo, nebylo číslo, ale
**čí ta cena je** — a to se teď píše vedle.

### Zkouška

`scripts/test-porovnani.mjs` má 27 → **32** kontrol. Uloží se schválně
**smíšená** dvojice (jedna § 12, jedna běžná), aby se poznalo i to, že
se odznak nerozlezl na všechny řádky: hlídá se, že u úřední ceny odznak
je, že jeho popisek mluví o úřadu a oprávněné osobě, a že u běžné
nabídky **není**. K tomu pojistka, že v datech je obojího dost.

**Prokázáno sabotáží:** s vypnutou podmínkou (`if (false && …)`) spadly
obě kontroly na odznak.

### Tím je ta série uzavřená

Všechna místa, která na webu něco tvrdí o ceně, § 12 teď poznají:

| plocha | stav |
|---|---|
| odznak na kartě, percentil, blok s odhadem | 3al |
| řádek v krajských a okresních výpisech | 3al |
| srovnatelné pozemky na stránce pozemku | 3ao |
| rádce („Co říká cena") | 3ap |
| porovnávací tabulka | **3aq** |
| grafy a mediány historie cen | už dřív (VERZE 3) |
| `data/model.json` a řezy dat | už dřív |
| zlevnění | netýká se — 0 z 204 má starou cenu |
| rozesílané hlídání | netýká se — o ceně netvrdí nic |

Poslední dvě řádky jsou změřené negativní výsledky, ne domněnky.

## 3ar. Pojistka: celá značka „§ 12" stojí na jedné větě, na které se robot a web nikde nedohodli — *doplněno 10. 10.*

Po čtyřech opravách (3al, 3ao, 3ap, 3aq) jsem si položil otázku, na čem
to všechno vlastně stojí — a odpověď byla nepříjemně tenká.

### Co se změřilo

Nejdřív dobrá zpráva. Hledal jsem planý poplach: `spravniCena` je
regulární výraz nad polem `extra`, a to bývá volný text z cizího
inzerátu, takže by stačilo, aby někdo v popisu napsal „sousedí se
státní půdou". Změřeno: **všech 204** shod pochází z jediného
doslovného řetězce, a ten si **robot píše sám**:

```
prodej státní půdy (SPÚ, § 12)      ← scripts/fetch-opportunities.mjs
```

Unikátních textů `extra` mezi těmi 204 nabídkami: **jeden**. Planý
poplach tedy nehrozí.

### Čím se za to platí

Je to **dohoda na slovo, kterou nikdo nehlídal.** Kdyby robot začal
psát „SPU" bez diakritiky nebo „Státní pozemkový úřad", přestane web na
204 nabídkách poznávat, že cenu stanovil úřad — a tiše se vrátí
všechno, co se dnes opravovalo: odznak „výhodná cena", percentil,
srovnatelné pozemky, rádce i porovnávací tabulka. A **nic by
nespadlo**: zkoušky té značky si ten řetězec **opisují u sebe**
(`test-statistika.mjs`, `test-radce.mjs`), takže by zůstaly zelené nad
vlastní kopií.

K tomu druhá slabina: ten výraz je na webu ve **čtyřech kopiích**.

| soubor | k čemu |
|---|---|
| `js/ceny.js` (`spravniCena`) | cenu stanovil úřad |
| `js/pozemek.js` (`isSPU`) | odkaz „Nabídka SPÚ ↗" |
| `js/radce.js` | rada o dosavadních pachtýřích |
| `scripts/generate-region-pages.mjs` (`jeSPU`) | odkaz v krajském výpisu |

Dvě z nich odpovídají na jinou otázku (má se odkázat na nabídku SPÚ),
takže sloučit do jedné funkce je nejde — ale **shodný výraz v nich
zůstat musí**, jinak stránka označí cenu za úřední a odkaz povede
jinam. Je to týž tvar, jaký se už jednou rozešel u tabulky okres → kraj
(a u dvou pozorovatelů v `test-stabilita`).

### Pojistka

`scripts/test-ceny.mjs` má 136 → **144** kontrol. Čte se znění
**přímo z robota** (`extra:` na větvi SPÚ), ne opsané, a zkouší se, že:

* výraz na úřední cenu se najde ve všech čtyřech souborech,
* všechny čtyři kopie jsou **shodné**,
* model pozná to, co robot opravdu píše,
* a pozná to i každá ze těch čtyř kopií zvlášť.

K tomu pojistka, že se v robotovi vůbec nějaké takové `extra:` našlo —
jinak by kontroly běžely nad prázdnem.

**Prokázáno dvěma sabotážemi:**

* robotovi jsem změnil znění na „prodej pozemku SPU podle paragrafu 12"
  → **5 kontrol spadlo** (model ani jedna ze čtyř kopií to nepozná);
* jedné kopii výrazu jsem ubral alternativu („státní půd")
  → **2 kontroly spadly** a hláška pojmenovala ten soubor.

Žádná oprava kódu tu nebyla potřeba — chyběla pojistka. Zapsáno proto,
že právě tyhle tiché dohody se rozcházejí nejdřív.

## 3as. NALEZENO: „elektřina v dosahu" se na webu čtla jako pozemek s elektřinou — *opraveno 10. 10.*

Štítky „Elektřina", „Voda", „Kanalizace", „Plyn" a „Příjezd" jsou po
ceně to nejrozhodnější, co o pozemku web tvrdí — a dá se podle nich
filtrovat. Vytahuje je `js/vybaveni.js` z textu inzerátu a modul se
pečlivě brání dvěma pastem: **záporu** („bez elektřiny", „elektřina
zavedena není") a **jinému druhu** („odpadní voda", „záplavová voda").

Třetí past neznal. Mezi „elektřina je zavedena" a „elektřina tu není"
leží ještě **„je někde poblíž"**:

| věta v inzerátu | co web tvrdil |
|---|---|
| „obecní cesta je na hranici pozemku, **elektřina v dosahu**" | Elektřina |
| „přípojky k inženýrským sítím (kanalizace, voda, elektřina, plyn), **které jsou v blízkosti hranice pozemku**" | Elektřina + Voda + Kanalizace + Plyn |

Inzerát to přitom sám netvrdí — naopak se od toho distancuje. Kdo si
podle štítku vybere, dozví se to až na místě.

### Rozsah

Změřeno na 1 617 skutečných popisech: z **895** tvrzení o sítích jich
na téhle formulaci stojí **5 (0,6 %)**, ve dvou inzerátech (Ostředek
na Benešovsku, Dubí na Teplicku).

### Oprava a proč je vzor ÚZKÝ

Přidala se třetí kategorie `jenVOkoli` — hledá `v dosahu`,
`v blízkosti`, `v bezprostřední blízkosti`, `poblíže`, `nedaleko`
v témže okně jako zápor.

Zkoušel jsem k tomu přidat i **„možnost připojení"**, a vyjímá to 8
tvrzení — jenže **4 z nich jsou z inzerátu, kde o dvě věty dřív stojí
„Pozemek je plně zasíťovaný"**. Tam ta tvrzení platí, jen z jiné věty,
a pravidlo by je zahodilo neprávem. Takže ne. (`nedaleko` ani
„v bezprostřední blízkosti" naopak nepřidávají ani neubírají nic — 5
ve všech variantách — takže jsou ve vzoru bez rizika.)

**Výslovné tvrzení o přítomnosti má přednost.** Bez toho by věta „Voda
je zavedena na pozemek, les je v dosahu" o tu vodu přišla — a to byla
chyba, kterou jsem si do opravy nejdřív zavedl a odhalila ji vlastní
kontrolní věta. Hledá se jen v nejbližší čárkové části na obě strany,
a „možnost připojení" se za tvrzení o přítomnosti nebere (slovo
„připojení" by jinak samo rozsvítilo celý výčet).

### A oprava DAT, kde na to málem došlo k horší chybě

Štítky čte web z **uloženého** `d.site` v `data/opportunities.json`, ne
z textu, takže oprava modulu by se projevila až na dalším běhu robota.
Chtěl jsem proto `site` přepočítat z `data/popisy.json` — a to by byla
chyba: **přepočet chtěl změnit 385 nabídek**, vždy `[cesta] → []`.
Důvod: robot měl k dispozici delší text než ten, který se do
`popisy.json` ukládá, takže z něj „Příjezd" vyjde a z uloženého
popisu ne.

Správně se tedy opravilo jen to, za co může **změna modulu**: rozdíl
staré a nové verze na tomtéž textu, a to jen směrem k odebrání. Ověřeno
po zápisu: hlavička souboru shodná, 1 985 nabídek jako dřív, změněné
přesně **dvě**.

### Zkouška

`scripts/test-vybaveni.mjs` má 94 → **102** kontrol, ve dvou
polovinách: tři na to, co se vyjmout MÁ, a pět na to, co se vyjmout
NESMÍ (včetně toho „plně zasíťovaný" inzerátu a staré kontroly, že
zápor pořád drží).

**Prokázáno dvěma sabotážemi:** vypnutí nového pravidla srazilo 3
kontroly, vypnutí přednosti tvrzení o přítomnosti 2.

## 3at. NALEZENO: u 359 podílů se cena za metr dělila zlomkem DVAKRÁT — u 3/20 vyšla sedminásobná — *opraveno 10. 10.*

Tohle je nejdražší chyba, jakou web dnes měl, a ležela v místě, které
`js/ceny.js` sám označil za nejisté.

### Nejednoznačnost, kterou model přiznával

Model počítá cenu za metr jako `price / (area × zlomek)` a komentář
u toho tvrdí: *„Výměra v inzerátu je celá parcela."* O pár řádků níž
ale u stropu uvěřitelnosti stojí: *„Nevíme, které z těch dvou čísel
v inzerátu je špatně — jestli je cena za celou parcelu, nebo je
**výměra už jen podílová**."* Dvě tvrzení, která se vylučují.

Text inzerátu na to u jednoho zdroje odpovídá černé na bílém:

```
k.ú. Rudice LV č. 65 o výměře 1976 m², podíl 1/2
• Parcela č. 3591 - o výměře 3952 m² (Lesní pozemek)
```

Parcela má **3 952 m²**, podíl je polovina, a uložená `area` je
**1 976** — tedy **už ta polovina**. Model ji dělil dvojkou ještě
jednou a tiskl **29 Kč/m² místo 15**.

### Jak se to ověřilo — aritmetikou, ne výkladem

Pro podíl 2/3 inzerát vypisuje parcely 1 629 + 73 + 4 398 = **6 100**;
krát 2/3 = **4 067** — a `area` je 4 067. Změřeno hromadně:

| | |
|---|---|
| podílů s neuříznutým výpisem parcel | 308 |
| z nich **součet parcel × zlomek ≈ `area`** (do 1 %) | **219** |
| nesedí (většinou uříznutý výpis) | 89 |

Sedne to i u zlomků jako 3/20 nebo 2/3, takže o shodu náhodou nejde.

### Jak velká byla ta chyba

| nabídka | web tiskl | správně |
|---|---|---|
| Trpín 1/3 | 40 Kč/m² | **13** |
| Úštěk 1/3 | 35 Kč/m² | **12** |
| Rudice 1/2 | 29 Kč/m² | **15** |
| Velká nad Veličkou 3/20 | 146 Kč/m² | **22** |

Násobek je přesně `1/zlomek`: u poloviny dvojnásobek, u 3/20
sedminásobek. Model si té chyby byl částečně vědom — právě tyhle
nabídky mu lezly nad strop uvěřitelnosti (ten komentář jmenuje podíl
1/73 s 370 703 Kč/m²).

### Oprava

Příznak **`vymera_podilu`** v datech. Nasazuje ho robot a **jen tam,
kde to inzerát dokazuje** — dvě nezávislé cesty, stačí jedna, obě
vyžadují známý zlomek:

* **A)** součet vypsaných parcel × zlomek ≈ `area` (do 1 %);
* **B)** inzerát uvádí „LV č. N o výměře X" se X ≈ `area` **a zároveň**
  je aspoň jedna vypsaná parcela větší než `area`. Kdyby `area` byla
  celá parcela, nemohla by ji žádná jediná parcela přesáhnout. Tahle
  cesta zachytí i uříznuté výpisy.

Kde se to dokázat nedá, zůstává starý výpočet. V datech z 10. 10. má
příznak **359 z 522** podílů (69 %).

`vymeraVCene()` pak u takové nabídky vrací `area` beze změny, a věta
pod číslem přestala tvrdit, že se přepočítávalo.

### Co se tím NEPOHNULO — a je to změřené

| | |
|---|---|
| změněná cena za metr | **359** |
| překlopených verdiktů „pochybná cena" | **0** |
| změněných hodnot „% pod odhadem" | **0** |
| medián okresu, kraje, percentily | **beze změny** |

Důvod je v kódu: srovnávací přihrádky i percentil počítají `price/area`
**surově** (řádek 357 v `js/ceny.js`), ne přes `zaMetr`. Oprava se tedy
dotkla čísla, které člověk čte, a ničeho jiného. Ověřeno porovnáním
staré a nové verze modelu nad všemi nabídkami.

### A druhá kopie, kterou našly zkoušky

Totéž počítá podruhé `js/hlidani-logika.js` (hlídání musí fungovat i bez
`ceny.js`). Změnil jsem jen `ceny.js` — a `scripts/test-strop-ceny.mjs`
spolu s `scripts/test-hlidani.mjs` to okamžitě ohlásily: *„zaMetr: obě
kopie dávají na všech datech totéž"* spadlo a vypsalo
`Úštěk: ceny.js 11,54 × hlidani-logika.js 34,62`. Tohle je ta pojistka,
která se vyplatila; doplněno na obou místech.

### Zkoušky

* `scripts/test-parcely-z-textu.mjs` — osm nových kontrol na detektor,
  ve dvou polovinách: co se poznat **má** (obě cesty, i zlomek 3/20)
  a co se poznat **nesmí** (bez vypsaných parcel, bez zlomku, u nabídky
  bez podílu, a hlavně když se součet parcel **rovná** uložené výměře —
  tam je výměra opravdu celá parcela a příznak by cenu podstřelil).
* `scripts/test-ceny.mjs` 144 → **151** kontrol: cena s příznakem
  i bez, výměra v ceně, vysvětlení pod číslem, a na ostrých datech, že
  příznak v datech je a u všech 359 se výměra v ceně rovná uložené.
* `data/pole.json` pole popisuje (zkouška spadne, kdyby chybělo), a
  popis u `podil` se opravil — tvrdil, že výměra je vždy celá parcela.

**Prokázáno sabotáží:** když model příznak ignoruje, spadnou 3 kontroly;
když detektor přijme i nabídku bez vypsaných parcel, spadne ta na to
určená.

## 3au. NALEZENO: po každém ukončení nabídky se strom na jeden běh rozešel s tím, co generátory spočítají — *opraveno 10. 10.*

Našlo se to tak, že robot v podvečer poslal čerstvá data a hned po nich
spadla zkouška `scripts/test-oprav.mjs` („repozitář se rovná tomu, co
generátory spočítají"). Při opakování prošla — protože ta zkouška
generátory **sama spustí**, takže si rozdíl prvním během opravila. To
samo o sobě je poučení: zelená při druhém pokusu ještě neznamená, že
tam nic nebylo.

### Co to bylo

Generátor má na ukončené stránky **dvě cesty**:

| stránka | čím projde |
|---|---|
| **už ukončená** | `migrujUkoncenaData(migrujPredvykresleni(šablona, migrujSkripty(šablona, …)))` |
| **nově ukončená** | `ukoncenaStranka()` — a ta `migrujSkripty` ani `migrujPredvykresleni` nepouštěla |

Takže stránka, kterou robot právě ukončil, dostala blok skriptů v tom
pořadí, v jakém ho měla, a plná přestavba ho pak srovnala jinak.
Změřeno: robot ukončil dvě nabídky (Domousnice, Žalany) a obě se lišily
osmnácti řádky v bloku skriptů. **Žádný skript nechyběl** — `pozemek.js`
i `hlidani-logika.js` tam byly a ve správném pořadí, jen byly jinak
přeskládané. Takže to nebyla rozbitá stránka, ale tiché, **opakované**
rozcházení: stávalo se to po každém ukončení nabídky, znovu a znovu.

Druhý důvod, proč to nikdo neviděl: **úloha s daty zkoušky nepouští.**
Na robotově commitu běží jen `build`, `deploy` a `report-build-status`,
ne `testy` ani `v-prohlizeci`. Rozdíl tedy čekal na příští lidský
commit.

### Oprava

Nově ukončená stránka projde týmiž dvěma přepisy jako ta už ukončená.
Ověřeno na obou skutečných stránkách z robotova commitu: po doplnění
přepisů **vyjde přesně to**, co dává plná přestavba.

### Pojistka — na vlastnost, ne na zápis

`scripts/test-stranky-pozemku.mjs` má 33 → **36** kontrol. Hlídá se, že
**ukončení stránky je idempotentní**: vezme se živá stránka pozemku,
ukončí se první cestou, a na výsledek se pustí druhá cesta — ta už ho
nesmí změnit. K tomu dvě pojistky: že se živá stránka vůbec našla,
a že ukončená stránka opravdu dostala `noindex` i datum (jinak by byla
hlavní kontrola zelená o prázdnu).

**Prokázáno sabotáží:** vrácením cesty pro nově ukončené stránky do
původního stavu kontrola spadla.

## 3av. NALEZENO: kontrola poznámek počítala značky, a tím měřila něco jiného, než měla — *opraveno 10. 10.*

CI spadla na kroku „Soukromá poznámka k pozemku": *„a ve výpisu je
u toho pozemku vidět značka — značek: 3 (čekala se právě jedna)"*.

### Proč to byla chyba v kontrole, ne na webu

Ta kontrola žádala `v.znacek === 1`, ale **komentář o pár řádků výš
v té samé zkoušce** říká: *„Na účtu leží i poznámka z bloku 5 (tentýž
účet, tentýž falešný server), takže se nečeká „právě jedna"."* Dvě
věci, které si odporují — a ta spodní rozhodovala.

Kolik značek se opravdu vykreslí, závisí na dvou věcech, které ta
zkouška neřídí: kolik poznámek se na společném falešném účtu nasbíralo
a které z těch pozemků jsou právě ve výpisu **vidět**. Změřeno 10. 10.
s doplněným výpisem do zkoušky:

| | |
|---|---|
| v CI | 3 značky → spadlo |
| místně při témže spuštění | 2 poznámky ve schránce, **1** značka → prošlo |

Takže pravidlo bylo křehké z podstaty. Přispěla k tomu i moje dnešní
oprava cen u podílů — změnila cenu za metr u 405 nabídek, a tím
i pořadí ve výpisu, tedy které karty jsou vidět. Ty dvě příčiny od sebe
oddělit nejdu; podstatné je, že počet značek nikdy nebyl vlastnost, na
které by se mělo stavět.

### Co se hlídat MUSÍ

Ta kontrola tam vznikla kvůli skutečné staré chybě (bod ze seznamu:
*„uložení jednoho pozemku označí všechny jeho sousedy"*). To se teď
hlídá **přímo**: každá vykreslená značka musí sedět na kartě, která
poznámku opravdu má — a naše karta je mezi nimi. Počet se nepočítá, jen
„aspoň jedna".

`scripts/test-poznamky.mjs` má 53 → **54** kontrol.

**Prokázáno sabotáží:** nechal jsem značku prolézt na každou kartu
(podmínka `PKPoznamky.text(d)` nahrazená „má účet aspoň jednu
poznámku") a nová kontrola to ohlásila: *„žádná značka nevisí na kartě,
která poznámku nemá"* spadlo. Stará kontrola by přitom takovou chybu
poznala jen náhodou — podle toho, kolik karet je zrovna vidět.

## 3aw. NALEZENO (z tvého průchodu webem): u nefunkční vrstvy web sliboval, že to zkusí „až příště" — a tlačítko nedal — *opraveno 11. 10.*

Z tvého seznamu bod 1. Potvrzeno v kódu: stránka pozemku vypsala

> Vrstvy Územní plán, Záplavy teď neodpovídají — zkusíme to znovu, až
> sem přijdete příště.

a žádné tlačítko u toho nebylo. Ta věta byla doslova pravdivá: mrtvá
vrstva se pamatuje v `sessionStorage` **na půl hodiny**
(`js/mapove-vrstvy.js`), aby se u každého dalšího pozemku nečekalo
znovu pět vteřin na službu, která stejně neodpoví. Jenže výpadky těch
služeb bývají krátké, takže komu zrovna spadl územní plán, ten neměl
jak si ho vyžádat.

### Oprava

Tlačítko **Zkusit znovu** u té hlášky. Opakování je **přídavné**:
zapomene se paměť, dozkouší se všechno, a přepínače, které už na
panelu jsou, se přeskočí — jinak by měl člověk dvojí katastr a zapnutá
vrstva by se odpojila od svého tlačítka. `zapomen()` byl dosud jen šev
pro zkoušky (`_zapomen`); teď je to část rozhraní, staré jméno zůstalo.

### A co z toho vypadlo: strop vloženého stylu je skoro plný

Dvě nová pravidla pro to tlačítko přetáhla předlohu `pozemek.html`
o **79 znaků** přes strop 40 kB a `scripts/test-vlozeny-styl.mjs` to
ohlásil. Ten strop má důvod: vložený styl jde do 1 941 stránek.
Tlačítko proto **žádný vlastní vzhled nedostalo** — používá `pzm-z`,
drobné tlačítko, které v ovládání mapy už existuje a sem se hodí
(je to podnět, ne hlavní akce). Třída `pzm-znovu` zůstává bez
pravidla, jen jako úchyt pro zkoušku.

Stojí za zapsání, že **volného místa je 190 znaků**: další pravidlo se
tam nevejde a bude se muset nejdřív něco uvolnit.

### Zkouška

`scripts/test-mapa-pozemku.mjs` má 131 → **138** kontrol. Modul vrstev
se v ní **podstrkuje**: napoprvé jsou všechny mrtvé, po zapomenutí
paměti jedna naskočí — jinak by zkouška záležela na tom, jestli zrovna
odpovídá cizí server. Hlídá se, že tlačítko je, že hláška už neslibuje
„až příště", že kliknutí paměť zapomene a zeptá se znovu, že se živá
vrstva objeví jako přepínač (jeden, ne dva) a že hláška i s tlačítkem
zmizí.

**Prokázáno sabotáží:** s vypnutým tlačítkem kontrola spadla.

## 3ax. NEPOTVRZENO (z tvého průchodu webem): „hlavička při rolování prosvítá a překrývá tlačítko Přidat" — *změřeno 11. 10.*

Dvě tvrzení v jednom bodě, obě se daly změřit, a ani jedno nevyšlo.

### 1. Prosvítání

Hlavička je lepivá a **na monitoru záměrně poloprůhledná** (0,85 bílé
+ `blur(10px)`), na dotykovém zařízení ale **úplně krycí**: pravidlo
`@media (hover:none)` jí dává `--plocha-plovouci-plna` a blur vypíná.
Naměřeno na třech stránkách ve dvou sestavách:

| sestava | krytí | pozadí | blur |
| --- | --- | --- | --- |
| telefon (dotyk) | 1 | `rgb(245,250,247)` | žádný |
| monitor | 0,85 | `rgba(255,255,255,0.85)` | `blur(10px)` |

Zůstává tedy otázka, jestli to na monitoru nevadí čitelnosti. Změřeno
složením: obsah pod hlavičkou se vyfotil **bez** hlavičky (je vyňatá
z toku, takže se tím nic neposune), spočítala se průměrná barva pásu
za textem (rozmazání 10 px je právě zprůměrování okolí) a složila se
s `rgba(255,255,255,0.85)`. Proti výsledku se spočítal kontrast textu.
Nejhorší hodnota z pěti stránek a všech poloh rolování:

| stránka | nejhorší kontrast | co bylo pod hlavičkou |
| --- | --- | --- |
| `pozemek-…-rsg5bb.html` | **5,58 : 1** | `rgb(16,32,23)` — tmavý pás |
| `index.html` | 5,61 : 1 | `rgb(18,36,26)` — tmavý pás |
| `cena-pozemku.html` | 6,99 : 1 | světlý obsah |
| `nove-pozemky.html` | 7,09 : 1 | světlý obsah |
| `porovnani.html` | 7,23 : 1 | světlý obsah |

Ta hranice navíc platí **pro jakýkoli obsah**, ne jen pro změřené
stránky: při krytí 0,85 je nejtmavší možné složení `0,85 × 255 = 217`,
tedy `rgb(217,217,217)` — a proti barvě odkazů v hlavičce to dává
právě těch ~5,5 : 1. Pod čtyři a půl (hranice AA pro běžný text) se
hlavička dostat nemůže, ani kdyby pod ní projel čistě černý obrázek.

Co z toho zůstává: **vzhledová** námitka (že obsah je skrz hlavičku
vidět) je oprávněná a je to záměr — matné sklo. Čitelnost to neohrožuje.

### 2. „Překrývá tlačítko Přidat"

Hlavička je `position:fixed`, takže si pod ni stránka drží místo sama
(`body{padding-top:--vyska-hlavicky}`, 85 px na monitoru, 119 px na
úzkém displeji, kde má dvě řady). Změřeno na 13 šířkách od 360 do
1600 px na třech stránkách:

* výška hlavičky **nikdy nepřekročila** vyhrazené místo (117,11 px
  proti 119 na úzkém, 85,11 proti 85 na širokém — těch 0,11 px je
  spodní linka),
* na souřadnicích tlačítka „Přidat" dostane klik **samo tlačítko**
  (`document.elementFromPoint` vrací prvek uvnitř něj) ve všech
  sestavách, kde je tlačítko vidět,
* nikde nic nepřetéká do strany.

A třetí čtení té stížnosti — že se pod hlavičku dostane něco
**lepivého** na stránce — taky neplatí: při skutečném rolování po
pěti stránkách ve dvou sestavách nevyjela horní hrana žádného prvku
s `position:sticky` pod spodní hranu viditelné hlavičky.

**Prokázáno sabotáží:** s `.add-aside, .obsah { top:0 }` kontrola
překryv ohlásila (683,8 px na `aside.add-aside`, 85,1 px na
`nav.obsah`). Bez sabotáže mlčí. Napoprvé přitom mlčela i se
sabotáží — vzorky se brály 90 ms po posunu, kdy je hlavička ještě
zhasnutá (`header.hl-zhasnuta` při rolování), takže měření nekoukalo
na nic. Teprve s 550 ms začalo vidět (0 zhasnutých vzorků z 19–57).

### Vedlejší nález, který není vada

`.add-aside` na `pridat.html` má `position:sticky; top:96px`, ale
**nelepí se** — a je to v pořádku. Odhlášenému se místo dlouhého
formuláře ukazuje přihlašovací karta, takže obal `.add-grid` má
583 px a panel sám 570: na lepení zbývá 13 px. Jakmile je člověk
přihlášený a formulář se rozbalí, lepení smysl má. Nic se tu
neopravuje, jen je dobré to vědět, než to někdo bude „opravovat".

## 3ay. NALEZENO (z tvého průchodu webem): web sliboval obecní záměry „z úřední desky", do které se nikdy nepodíval — *opraveno 11. 10.*

Na úvodní stránce stojí pět kategorií příležitostí a u každé svítí živý
počet. U „Obecního záměru" stála odrážka **„Z úřední desky — přihlásit
se jde ve lhůtě"** a pod ní štítek **„zatím žádné"**.

Obojí bylo zavádějící. V datech je `obec` **nula** a nula to bude i do
budoucna, protože **úřední desky obcí nemáme zapojené ani jednu** —
každá obec má svou vlastní. Změřeno na ostrých datech:

| kategorie | v datech | zdroj |
| --- | --- | --- |
| `sale` | 1 829 | Bezrealitky, Farmy, SPÚ |
| `drazba` | 127 | CEVD, OK dražby |
| `exekuce` | 28 | tytéž evidence |
| `obec` | **0** | **žádný** |
| `majitel` | 0 | lidé, kteří vloží inzerát (zatím nikdo) |

### Proč je to vada, a ne jen prázdná kategorie

Nula má **dva různé důvody** a web pro ně měl jeden text:

* „zatím žádné" = *zdroj máme, zeptali jsme se, nic nenašel.* To platí
  pro pozemky od majitelů.
* „nesbíráme" = *nebylo koho se zeptat.* To platí pro obecní záměry.

Kdo si u obecních záměrů přečetl „zatím žádné" a nad tím „Z úřední
desky", mohl si poctivě odvodit, že obce teď nic neprodávají. To není
pravda — obce prodávají pořád, jen my o tom nevíme. Lhalo se číslem,
aniž cokoli spadlo.

### Co je na webu teď

Karta přiznává, co je, a místo slibu dává člověku cestu:

> **Obecní záměr** · *zatím nesbíráme*
> · Obec oznámila **záměr prodat** pozemek, přihlásit se jde **ve lhůtě**
> · **Tyhle zatím nesbíráme** — každá obec má svou úřední desku a ani
>   jednu nemáme zapojenou. [Jak takový pozemek najít sám →](../pozemek-od-obce.html)

Ten odkaz vede na `pozemek-od-obce.html`, stránku, která přesně tohle
vysvětluje — a z úvodní stránky na ni dosud nevedl **žádný** odkaz.

Štítek se počítá v `js/main.js`: karta, která o sobě ví, že zdroj nemá,
to má napsané v `data-bez-zdroje` a dostane „zatím nesbíráme". Jakmile
data dorazí, štítek ukáže počet jako u ostatních — značka počet
nepřehluší.

Poctivé je i README: slibovalo „dražby, exekuce, prodeje a obecní
záměry". Teď jmenuje tři a o páté říká, že je v kódu hotová a nesbírá se.

### Zkouška

`scripts/test-sliby.mjs` má 35 → **42** kontrol. Hlídá se:

1. každá **prázdná** kategorie na úvodní stránce přiznává, proč je
   prázdná (výjimka je jmenovitě `majitel` — zdroj „lidé" je skutečný,
   i když zatím nikdo nevložil),
2. a opačný směr: značka **nesmí** zůstat na kategorii, která už data
   má — jinak by web zapíral vlastní nabídky,
3. přiznání je v **textu** karty, ne jen v atributu,
4. karta **neslibuje zdroj**, do kterého se web nedívá (odrážka
   začínající „Z úřední desky"),
5. ve vykreslené stránce se ty dva stavy opravdu **liší** („zatím
   nesbíráme" u obce × „zatím žádné" u majitelů × „1 829 teď na mapě"
   u prodeje),
6. a s **podstrčeným** záměrem obce štítek ukáže počet, ne „nesbíráme".

Kvůli bodu 6 umí `host()` v té zkoušce podstrčit i nabídky od robota —
cesta pro inzeráty od lidí to neumí, ta všemu vnutí `type:'majitel'`.

**Prokázáno sabotáží — šest různých:** sundaná značka (spadly 3
kontroly), značka nasazená na kategorii s daty (2), z textu zmizelé
přiznání (1), vrácená původní odrážka o úřední desce (1), zrušená
větev ve skriptu (2) a štítek, který by přehlušil i skutečný počet (1).
Bez sabotáže 42 z 42.

### Co se tím NEŘEŠÍ

Nadpis sekce pořád říká „Pět druhů příležitostí — každý svou barvou."
To zůstává: pět druhů web opravdu rozlišuje a každý má svou barvu, a
hned pod nadpisem si každá karta řekne sama, jak na tom je. Dynamický
počet druhů by znamenal číslo, které se dopočítá až skriptem — tedy
poskočení rozvržení kvůli jednomu slovu.

A hlavně: **sbírat obecní záměry je pořád nedodělek**, ne vyřešená věc.
Zapsaný je v bodu o chybějících zdrojích výš (ÚZSVM a obecní úřední
desky). Tohle byla oprava toho, že se web tvářil, že je sbírá.

## 3az. NALEZENO (z tvého průchodu webem): web psal „stavební pozemek" o pozemku, o kterém tentýž inzerát říká, že je v katastru travní porost — *opraveno 11. 10.*

Ve Vysokém Mýtě (okres Ústí nad Orlicí) stál na webu pozemek jako
**stavební**. Inzerát k němu začíná takto:

> „Nabízím k prodeji pozemek o výměře 3974 m², **vedený v katastru jako
> trvalý travní porost**. … Pozemek tvoří udržovaná louka s rovinatým
> terénem …"

Druh se poznává z textu inzerátu (`js/druh.js`) a dosud to bylo
**výhradně hádání podle klíčových slov s pevnou předností**: stavební →
lesní → vinice → sad → zahrada → orná → travní porost. Kdekoli v textu
padlo slovo o stavbě, vyhrálo — i proti větě, ve které inzerent cituje
katastr.

### Dvě měření na ostrých datech

**Citace větou** („vedený v katastru jako…", „druh pozemku: …"): takových
inzerátů je 6, web souhlasil u 3 a u 3 ne — **vždy** tím, že napsal
„stavební pozemek".

**Výpis z listu vlastnictví**, kde je druh za každou parcelou v závorce:

> „k.ú. Cotkytle LV č. 561 o celkové výměře 97502 m²
> • Parcela č. 5010 - o výměře 70654 m² (Lesní pozemek)
> • Parcela č. 5011 - o výměře 26848 m² (Orná půda)"

| | počet |
| --- | --- |
| inzerátů s druhem v závorce | 1 292 |
| z toho **jediný** druh (jednoznačné) | 730 |
| z nich web souhlasil | 701 |
| **rozpor** | **29** |
| z toho **směs** druhů | 562 |
| u nichž by podle PLOCHY vyšel jiný druh | **200 (36 %)** |

Ta druhá polovina je ta zajímavější: web ze směsi vybíral podle
přednosti klíčových slov, ne podle toho, čeho je víc. Jedna malá lesní
parcela v balíku polí dělala z celého balíku les — 62× „lesní pozemek"
místo orné půdy a 53× místo travního porostu, dohromady **115 nabídek**.
A podle druhu se filtruje, počítá obvyklá cena a staví statistiky
77 okresů.

### Co se změnilo

`js/druh.js` se teď nejdřív podívá, jestli inzerát katastr **cituje**:

1. výpis parcel s plochami → vyhrává druh s **největší plochou**
   (při rovnosti ten první v textu, ať je výsledek na témž textu
   vždycky stejný),
2. druhy v závorkách bez ploch → bere se jen tehdy, je-li **jediný**;
   ze směsi bez ploch se nehádá,
3. věta „vedený v katastru jako …" / „druh pozemku: …".

Teprve když nic z toho v textu není, rozhoduje jako dosud hádání.

Obsah závorky musí být **přesně** jeden z druhů, ne věta, která ho
obsahuje — „(mimo lesní pozemek)" ani „(lesní pozemek sousedí)" citace
nejsou.

A jedna věc, která z toho plyne sama: **citace nikdy nevrátí „stavební
pozemek"**. Katastr takový druh nezná, vyhláška jich zná deset. Jestli
se na pozemku dá stavět, je věc územního plánu — to je samostatný
nedodělek a plést to do druhu by znamenalo tvrdit o katastru něco, co
v něm nestojí.

### Uložená data se ZÁMĚRNĚ nepřepisují

Nové pravidlo by na uložených datech změnilo druh u **233 nabídek
z 1 616** s popisem (14,4 %), z toho 12× pryč od „stavebního pozemku".
Přesto se tu nic nepřepisuje, a to z měřeného důvodu: `data/popisy.json`
drží popis **zkrácený na 460 znaků** (`cistyPopis`), kdežto robot
rozpoznává druh z **celého** textu inzerátu. Přepočet z uloženého textu
by u inzerátů s delším výpisem parcel utnul seznam v polovině a
„největší plocha" by se spočítala z části — tedy přepsal bych správný
druh na špatný. Totéž už se tu jednou stalo u štítků „cesta", kde by
naivní přepočet smazal 385 správných.

Robot běží každých 6 hodin a druh **nepřenáší ze starých dat** —
počítá ho při každém běhu znovu z plného textu. Data se tím srovnají
sama při nejbližším běhu, i s tím, co moje měření ze zkráceného popisu
vidět nemohlo.

### Zkouška

`scripts/test-druh.mjs` má 37 → **55** kontrol. Kromě pravidel výš se
hlídá i to, co citace dělat nesmí: vybrat „stavební" nebo „zemědělský
pozemek" (katastr je nezná), vzít závorku, která druh jen obsahuje,
nebo hádat ze směsi bez ploch. Zkouška se opírá o **skutečný text** toho
inzerátu z Vysokého Mýta, ne o vymyšlený.

**Prokázáno sabotáží — třemi:** (A) když se citace přestane ptát, spadnou
4 kontroly; (B) když se ze směsi bere první místo největšího, spadne ta
o lesní parcele v balíku polí; (C) když stačí, že závorka druh obsahuje,
spadnou obě kontroly o „(mimo lesní pozemek)".

Napoprvé přitom sabotáž (A) chytila jen 2 kontroly ze 4: zkušební větu
jsem si vymyslel („určena k zastavění") a hádání na ni nereaguje —
pravidlo zná „k výstavbě" a „určen k stavbě", ne „k zastavění". Zkouška
tím neprokazovala nic. Teprve s větou o stavebním povolení, která
hádání opravdu spustí, začala měřit to, co měla.

## 3ba. NALEZENO (z tvého průchodu webem): 465 starých nabídek vypadalo mladších, než jsou — a web z toho hlásil o 29 % víc novinek — *opraveno 11. 10.*

Stránka „Co je nového" tvrdila: **„Za posledních sedm dní přišlo 54
pozemků."** Po opravě jich je **42**. Za čtrnáct dní 174 → **158**.

### Proč to lhalo

`first_seen` (kdy robot nabídku poprvé uviděl) se přenáší z minulého
souboru podle **otisku** — a ten otisk stojí na `type | okres | obec |
parcela | cena | výměra`. Jsou to ale přesně ta pole, která si web sám
občas přepočítá:

* 21. 9. se zpřesnilo určení okresu podle **skutečné hranice** okresu
  (dřív se bral první stejnojmenný),
* 5. 10. se opravilo čtení **obce z adresy** inzerátu.

Po každé takové opravě se otisk rozešel s tím, co jsme o nabídce věděli
z minula, nabídka se v minulém souboru nenašla — a dostala **dnešek**.
Stará nabídka tím na webu zestárla naopak: objevila se mezi novinkami.

### Měření

Průchodem **celé gitové historie** souboru `data/opportunities.json`
(112 verzí) se dá pro každý inzerát najít nejstarší den, kdy v datech
byl. Proti tomu:

| | |
| --- | --- |
| nabídek s odkazem na inzerát | 1 765 |
| z nich **vypadalo mladších, než jsou** | **455 (26 %)** |
| z toho v datech od prvního dne (14. 9.), ale nesly 19. 9. | 405 |

### Čím se to opravilo

Identitou, kterou si web **nemůže sám přepočítat**: číslem inzerátu
u jeho zdroje. Párování má teď tři kola od nejspolehlivějšího
k nejslabšímu — (0) podle **čísla inzerátu**, (1) podle otisku s cenou,
(2) podle otisku bez ceny (prodejce zlevnil) — a každou starou nabídku
smí „darovat" datum jen **jedno** kolo a jen **jednou**.

Proč číslo inzerátu a ne celá adresa: Bezrealitky u běžícího inzerátu
mění konec adresy. Z `985306-nabidka-prodej-pozemku` se jednoho dne
stane `985306-nabidka-prodej-pozemku-luhacovice`. Změřeno: **u 63
z 1 918 inzerátů** se adresa takhle změnila, zatímco číslo zůstalo. Na
celou adresu by tedy právě těch 63 o věk přišlo — táž chyba, jen o řád
menší. Odkaz nemá každá nabídka (219 z 1 984 je bez něj — SPÚ a část
dražeb) a pro ty zůstávají otisky jedinou cestou.

### Uložená data se tentokrát opravit DALI

Na rozdíl od druhu pozemku (bod 3az) tady přepočet z historie nic
nehádá: čte skutečné staré verze souboru, ne zkrácený popis. Dopočet
`scripts/prvni-videno.mjs --zapsat` vrátil dřívější datum **465
nabídkám z 1 984** — všech 465 podle čísla inzerátu, ani jednu podle
otisku. Rozložení po dnech se tím srovnalo:

| den | dřív | teď |
| --- | --- | --- |
| 14. 9. (první den evidence, nepočítá se do novinek) | 1 186 | **1 634** |
| 19. 9. | **442** | 17 |
| 21. 9. | 40 | 21 |
| ostatní dny | 13–71 | 4–23 |

Těch 442 z 19. 9. nebyl pohyb na trhu — byl to den, kdy se zpřesňoval
okres. Teď dávají jednotlivé dny 4–23 nabídek, což **vypadá jako trh**,
a první den evidence stránka přiznává (1 632 nabídek, přímo v textu).

Dopočet navíc u nabídky, která odkaz **má**, otisk už vůbec nepoužije:
když ji historie pod jejím číslem nezná, nikdy jsme ji neviděli a shoda
otisku by byla shoda s **jiným** inzerátem téže výměry v témže
katastru. U robota ta pojistka být nemusí (páruje dva po sobě jdoucí
běhy a kontroluje jednoznačnost na obou stranách), kdežto dopočet
prohledává 112 verzí a sedl by na cokoli, co kdy existovalo.

### Zkouška

`scripts/test-prvni-videno.mjs` má 17 → **33** kontrol. Nově se hlídá:
zpřesněný okres a obec neberou nabídce věk; doplněné jméno obce
v adrese nic nemění (a je to vidět i na tom, že klíč je `br|985306`,
ne celá adresa); dva pozemky pod jedním odkazem si datum nevezmou (ani
když ten odkaz měly dvě staré nabídky); stará nabídka nedaruje datum
dvakrát; rozbitá verze v historii dopočet neshodí; a nabídka s jiným
odkazem si cizí věk nevezme.

**Prokázáno sabotáží — pěti:** zrušené kolo podle odkazu (spadly 4
kontroly), identita z celé adresy místo čísla (4), stará nabídka smí
darovat víckrát (1), dopočet beroucí otisk i tam, kde zná odkaz (1),
a zrušená kontrola jednoznačnosti odkazu (1).

Jedna z těch sabotáží byla napsaná špatně a **nespadla vůbec** —
smazala deklaraci `let m`, takže zkouška skončila chybou ReferenceError
a žádná kontrola neproběhla. To není „sabotáž prošla", to je „zkouška
se nespustila"; napsaná znovu správně chytila 4 kontroly.

## 3bb. Z tvého průchodu webem: tři body, které se NEPOTVRDILY (a jeden, který vyřešila jiná oprava) — *změřeno 11. 10.*

Poctivost v obou směrech: tyhle body jsem změřil a vada v nich není.

### „Mikroparcely v dražbách se ukazují jako Výhodná cena" — už opraveno 5. 10.

Příčina existovala a byla horší, než jak to vypadalo zvenčí: **tatáž
dražba ležela v datech dvakrát**, protože přichází ze dvou zdrojů —
z evidence CEVD (s parcelním číslem a výměrou JEDNÉ parcely) a z OK
dražeb (bez čísla, ale s výměrou CELÉ dražby). Vyvolávací cena přitom
platí pro celou dražbu, takže ta s menší výměrou dávala cenu za metr
několikanásobně vyšší. Změřeno dnes v surových datech:
**44 dražeb z 81 rozpoznaných leží dvakrát** (88 řádků), cena je v nich
ve všech 44 případech shodná a výměra se liší u 24.

Spojuje je `bezDuplicit` v `js/hlidani-logika.js` podle **adresy
zdroje** (po srovnání `www.` a protokolu) a z dvojice bere tu s větší
výměrou. Všech 155 řádků se tím scvrkne na **110 skutečných dražeb**
a prochází tím i každý generátor stránek. Ověřeno: pro dražbu 28338
(Úštěk × Kalovice) existuje **jedna** stránka pozemku, ne dvě.

Co z toho plyne pro ten odznak, změřeno dnes na sjednocených datech:

* na kartách se zapnutým filtrem „Dražba" padne „Výhodná cena" na
  **3 dražby** a nejmenší z nich má **1 259 m²**,
* na stránce pozemku dostane „Výhodná cena" **9 dražeb ze 110**
  (78 nedostane verdikt vůbec) a nejmenší z nich má **547 m²**,
* na stránkách `drazby-pozemku*.html` není ten odznak **ani jednou**.

Mikroparcela (do 200 m² je jich v datech 26) tedy „Výhodná cena"
nedostane žádná.

Ještě jedna věc se k tomu nabízela a taky nepotvrdila: těch 9 verdiktů
stojí na vzorku 29 dražeb téhož druhu v okrese Litoměřice, což by mohly
být jen sestry z jedné dražební položky. Změřeno: je v nich **deset
různých dražebních termínů**, nejvíc pět na jeden den. Není to srovnání
se sebou samým a stránka velikost vzorku přiznává („29 nabídek").

### „Nově přidané a zároveň zlevněné v jeden den (Dubí, Svinaře)"

Tenhle protimluv vyřešila oprava věku nabídek (bod 3ba). Po dopočtu
z historie **není v datech ani jedna** nabídka, která by měla
`first_seen` v den změny ceny — dřív jich bylo 25 z 25, po první
opravě 1 z 24, teď 0 z 24. Dubí: poprvé viděno 22. 9., cena se změnila
5. 10. Svinaře: čtyři nabídky z prvního dne evidence, bez změny ceny.

### „Újezd u Brna je odlehlá hodnota"

Jev v datech je: v Újezdu u Brna je **14 nabídek a 13 z nich je státní
půda podle § 12** za 7–11 Kč/m², zatímco ta čtrnáctá (inzerát) stojí
686 Kč/m². Úřední cena o trhu nevypovídá a web ji proto do modelu
nepouští (`spravniCena`) — opravené 10. 10. v bodech 3ao/3ap/3aq.
Ověřeno na té jedné tržní nabídce: „Srovnatelné pozemky v okolí" jí
ukazují 274, 81, 76 a 73 Kč/m² a věta nad nimi říká „Z pěti nabídek do
6 km je tenhle nejdražší" — tedy žádná desetikoruna za metr mezi nimi.
Místo, kde by ta úřední cena pokazila číslo, jsem nenašel.

Zůstává tím nepopsaný důvod, proč ten bod v tvém seznamu je. Je dost
možné, že jsem se nedíval na tu stránku, na kterou ses díval ty — kdyby
se to dalo doplnit (která stránka, které číslo), doměřím to.

## 3bc. NALEZENO (z tvého průchodu webem): obě právní stránky tvrdily „Poslední úprava: srpen 2026" — *opraveno 11. 10.*

Na konci zásad soukromí i podmínek použití stála věta **„Poslední
úprava: srpen 2026."** Změřeno v gitu: `ochrana-udaju.html` se od té
doby změnila ve **229 commitech** a `podminky.html` ve **227**,
naposledy **10. října**. Mezitím do textu přibyl offline režim,
upozornění do telefonu, měření návštěvnosti, mapové vrstvy úřadů i
Nominatim — tedy nové zpracovatele a nové kategorie údajů.

Kdo si to datum přečetl, musel si myslet, že od srpna se nic nezměnilo.
U dokumentu, podle kterého se někdo rozhoduje, jestli svěřit svoje
údaje, je to zbytečná lež — a navíc taková, kterou nelze odhalit
klikáním.

### Proč se datum nebere z gitu

Vypadá to lákavě, ale je to past ve dvou krocích:

1. kdyby datum zapisoval generátor, **změnil by tím soubor**, takže by
   gitové datum toho souboru bylo zase o commit vedle;
2. „poslední úprava" u právního textu znamená úpravu **ZNĚNÍ** — ne
   přesun uzávorkování nebo přejmenování třídy v HTML.

Místo toho drží nová zkouška **otisk viditelného textu** (bez značek,
bez komentářů a bez té věty s datem) vedle zapsaného data. Změní-li se
znění, otisk se rozejde a zkouška řekne: uprav datum a zapiš nový
otisk. Kosmetická úprava značek projde, změna znění ne.

### Co ještě přibylo do zásad

Obchodní sdělení má vlastní zákon a ten žádá tři věci: **předchozí
souhlas, poznat odesílatele a snadné odhlášení**. Všechny tři tu platily
od začátku (přepínač je ve výchozím stavu vypnutý, v každém e-mailu je
odhlášení na jedno kliknutí), ale nebylo to napsané, takže se to nedalo
ověřit přečtením. Teď u té odrážky stojí **zákon č. 480/2004 Sb. (§ 7)**
a k tomu, že reklamu třetích stran neposíláme a adresu nikomu nedáváme.

### Zkouška

Nová `scripts/test-pravni-stranky.mjs` — **14 kontrol**: datum a otisk
znění u obou stránek, jmenovaný provozovatel a kontakt, dozorový úřad
i s odkazem na `uoou.gov.cz`, odkaz na nařízení 2016/679, zákon
480/2004 a všechny tři jeho požadavky, přiznaný přenos mimo EU — a
**že si zásady nevymýšlejí IČO** ani obchodní firmu (provozovatel je
fyzická osoba nepodnikající, takže IČO nemá; napsat ho by byla horší
vada než to, že tam není).

**Prokázáno sabotáží — šesti:** změna znění bez změny data (1), vrácené
staré datum (1), smazaný dozorový úřad (1), vymyšlené IČO (2), zmizelý
zákon o obchodních sděleních (2) a přepínač e-mailů prý zapnutý (2).

Dvě sabotáže přitom napoprvé **nespadly a ukázaly chybu ve zkoušce**:

* vzorek na „jen s vaším předchozím souhlasem" hledal obyčejnou mezeru,
  kdežto `scripts/sazba.mjs` po jednoznakové předložce vkládá
  nezlomitelnou (U+00A0). To není „text zmizel", to je „text se
  vysázel" — vzorky teď počítají s obojím;
* vzorek na „480/2004" prošel i po přepsání té věty, protože totéž
  číslo stálo v HTML **komentáři** nad ní. Komentář nikdo nečte, takže
  se próza teď hlídá na **viditelném textu**, ne ve zdroji; odkazy a
  značky dál ve zdroji, protože ve viditelném textu nejsou.

### Co na tobě pořád zůstává: jméno provozovatele

GDPR čl. 13 odst. 1 písm. a) žádá **totožnost a kontaktní údaje
správce**. Na stránce dnes stojí jen „soukromá osoba — fyzická osoba
nepodnikající" a e-mail. To je u fyzické osoby **málo**: totožnost
znamená jméno.

Vymyslet ho nemůžu a tvoje jméno ani adresu do veřejné stránky bez
tvého slova nenapíšu. Až to řekneš, je to jeden řádek — v
`ochrana-udaju.html` v oddílu „Kdo údaje spravuje" a v `podminky.html`
u provozovatele. Dvě možnosti, jak to obvykle řeší fyzická osoba
nepodnikající:

1. **Plné uvedení:** „Provozovatelem webu Parcelka (parcelaka.cz) je
   *Jméno Příjmení*, *adresa*. Kontakt: info@parcelaka.cz."
2. **Jen jméno, adresa na vyžádání:** „Provozovatelem je *Jméno
   Příjmení*, fyzická osoba nepodnikající; adresu sdělíme na vyžádání
   na info@parcelaka.cz."

Druhá možnost je slabší, ale pořád o řád lepší než dnešní stav. Jakmile
bude jméno na stránce, přidám k tomu i kontrolu, že tam zůstane.

## 3bd. NALEZENO (z tvého průchodu webem): „0 inzeráty" — a týž tvar byl v kódu na dvaceti místech — *opraveno 11. 10.*

Na stránce s daty stálo o statickém odrazu inzerátů od majitelů:

> „Statický odraz schválených inzerátů je v `data/user-listings.json`
> (teď **0 inzeráty**)."

Čeština má u počtu tři tvary: 1 pozemek, 2–4 pozemky, 0 a 5+ pozemků.
**Nula patří k té třetí skupině.** Podmínka byla ale napsaná takhle:

```js
n === 1 ? 'inzerát' : (n < 5 ? 'inzeráty' : 'inzerátů')
```

a nula je menší než pět, takže spadla do tvaru pro dvě až čtyři.

### Nebyla to jedna věta, byl to tvar

Změřeno průchodem všech zdrojů: týž tvar `n < 5 ?` byl v kódu na
**20 místech**. U většiny z nich se nula stát nemohla, protože ji
odchytilo něco dřív (`if (!n) return ''`, `if (novych)`, `pc.sample > 0`,
`n === 0 ? … :`). U **tří** ale mohla:

| kde | co by stálo na obrazovce | kdy |
| --- | --- | --- |
| rychlý výběr | „Hotovo · **0 nabídky**" | rozsah, do kterého nic nespadne — stačí „cena od sta milionů" |
| hlídané místo | „je tu **0 pozemky**" | okolí bez nabídek |
| odznak zpráv (popisek pro čtečku) | „**0 nepřečtené zprávy**" | počítá se i při nule |

Všech dvacet míst je proto přepsaných na tvar, který nulu zvládne sám:

```js
n === 1 ? 'inzerát' : (n >= 2 && n <= 4 ? 'inzeráty' : 'inzerátů')
```

Je to táž práce, jen se na ní nedá zapomenout. Arity ani slova se
nemění — mění se jen podmínka, takže nic jiného než chování pro nulu.

### Zkouška

Nová `scripts/test-mnozstvi.mjs` — **6 kontrol**. Hlídá tvar, ne text:
v kódu, který mluví k lidem (2 318 souborů včetně HTML), nesmí být
`n < 5 ?`. Kdyby někdy vznikl případ, kde to s množným číslem nemá nic
společného, patří do seznamu `VYJIMKY` s napsaným důvodem — dnes je
prázdný a to je cíl.

Zákaz tvaru by sám nestačil: kdo tu podmínku smaže celou (třeba ji
vytáhne do pomocné funkce, která bude špatná), zákazem projde. Tři
místa, kde se nula na obrazovku dostane, se proto hlídají **jmenovitě**,
a nakonec se kontroluje výsledek — ta jediná věta na `data.html`, která
vadu ukázala: tvar slova musí sedět k tomu, co v ní zrovna stojí za
číslo.

**Prokázáno sabotáží — čtyřmi:** vrácený tvar `< 5` (spadly 2 kontroly),
„0 inzeráty" na hotové stránce (1), rychlý výběr přepsaný na pomocnou
funkci (1) a rozbité hlídané místo (1).

Jedna sabotáž napoprvé nešla ani spustit: hledal jsem v `data.html`
řetězec „teď 0 inzerátů" s obyčejnými mezerami, kdežto sazba tam dává
nezlomitelné. Tatáž past jako u právních stránek o pár bodů výš — a
důvod, proč tahle zkouška hledá číslo i slovo vzorkem, který obě
podoby mezery připouští.

## 3be. NALEZENO (z tvého průchodu webem): dvě stránky o témže řekly 1 939 a 1 940, a jiné dvě 522 a 521 — *opraveno 12. 10.*

Dvě dvojice čísel, které si na webu odporovaly o jedničku. Oba případy
byly zvenčí stejné („web neumí počítat") a vevnitř úplně jiné.

### 1 939 proti 1 940

| stránka | co psala |
| --- | --- |
| `data.html` | „…takže na stránkách najdete **1 939** pozemků." |
| `cena-pozemku.html` | „Okno je 27 dní a **1 940** nabídek na trhu pořád je." |

Obě čísla platila, jen počítala jiné množiny. 1 939 je dnešní soubor po
odstranění duplicit. 1 940 je **archiv** — množina, kterou web sleduje
v čase. Změřeno porovnáním klíčů:

* archiv vede jako živé **2** nabídky, které v dnešním souboru už nejsou
  (zmizely ze zdroje a archiv je zavírá až dalším během),
* a **nezná 1**, která dnes přibyla.
* 1 939 + 2 − 1 = **1 940**.

Ta jednička tedy není chyba v počítání, je to vlastnost archivu — a
přesně proto se nedala nechat bez vysvětlení. Věta na stránce s cenami
teď říká „1 940 **sledovaných** nabídek na trhu pořád je": jedno slovo,
které z rozporu dělá informaci. Statistika, kterou ta věta zdůvodňuje
(cenzurování zprava), se navíc o sledovanou množinu opírá, takže je to
i přesnější.

### 522 proti 521

| stránka | co psala |
| --- | --- |
| `data.html` | „U spoluvlastnického podílu (`podil: true`, **522** nabídek)…" |
| mapa (filtr „podíl") | **521** |

Tady je důvod triviální: v souboru je 522 **řádků** s `podil: true`, ale
jeden z nich je tatáž nabídka vypsaná dvakrát ze dvou zdrojů. Stránka
s daty to u celkového počtu přiznává od začátku („z toho je 45 duplicit
… na stránkách najdete 1 939"), jen u podílů se na to zapomnělo. Teď
tam stojí **„522 řádků v souboru, na webu 521 po odstranění duplicit"**
a počítá se to **touž funkcí**, jakou k tomu používá web
(`PKHlidani.bezDuplicit`), ne vlastní kopií pravidla.

### Co se naopak nepotvrdilo

Hledal jsem i třetí ohlášený rozpor — tři různé počty změn cen.
Změřeno: stránka „Co je nového" i mapa dávají **55** zlevněných, a to
týmž pravidlem (`PKZlevneni.zmena`) nad týmiž daty; z toho 20 z
posledního běhu robota a 45 z archivu, 7 zdražení a 3 podezřelé změny
jdou mimo. Třetí číslo jsem nenašel. V datech je ještě 24 nabídek
s polem `cena_zmena`, ale to je údaj z posledního běhu a na žádné
stránce jako „počet zlevněných" nestojí.

A ještě jedna věc, která vypadala jako rozpor a není: na úvodní stránce
jsou ve zdroji čísla 1 955, 2 017 a 2 004. Všechna tři jsou
v **HTML komentářích** (poznámky k historii oprav), takže je návštěvník
nikdy neuvidí.

### Zkouška

`scripts/test-sliby-data.mjs` má 8 → **11** kontrol:

1. číslo na stránce s daty je opravdu soubor **po** odstranění duplicit,
2. větě o cenzurování zůstalo slovo „sledovaných",
3. archiv se od dnešního souboru **nerozešel** — živých může být o pár
   víc (zmizelé se zavírají až dalším během), ale ne o 5 % a víc; to už
   by nebyla vlastnost, ale vada.

**Prokázáno sabotáží — třemi:** smazané slovo „sledovaných" (1 kontrola),
počet před odstraněním duplicit na stránce s daty (1) a archiv rozešlý
o 120 podstrčených nabídek (1).

Čtvrtá sabotáž nebyla potřeba — kontrola archivu se **přiznala sama**:
klíč v `data/archiv/stav.json` se jmenuje `nabidky`, já napsal `zive`,
a kontrola tím tiše neměřila nic (0 živých → podmínka se přeskočila).
Poznalo se to tak, že nic nevypsala.

## 3bf. NALEZENO (z tvého průchodu webem): v žebříčku „Ceny po krajích" chyběla Praha a stránka o tom neřekla slovo — *opraveno 12. 10.*

Na `cena-pozemku.html` stojí žebříček **„Ceny po krajích — zemědělská
půda v Kč/m², od nejlevnějšího kraje."** Krajů je čtrnáct, v žebříčku
jich bylo **třináct**. Kdo je z Prahy, prohlédl celý seznam a nenašel
sebe — bez vysvětlení to vypadá jako vada výpisu.

### Proč tam nebyla

Není to vada výpočtu, je to **správné pravidlo s nepřiznaným
následkem**. `priceStats` nepočítá do ceny zemědělské půdy nabídky nad
**500 Kč/m²**: pole za takovou cenu je fakticky stavební parcela vedená
v katastru jako „orná" a medián kraje by vytáhlo nahoru. Na obvyklou
cenu je pak potřeba aspoň **10** nabídek téhož druhu.

Naměřeno pro Prahu:

| | |
| --- | --- |
| nabídek celkem | 23 |
| z toho zemědělská půda | 10 |
| …s cenou a výměrou v rozsahu | 10 |
| **…do 500 Kč/m²** | **6** |
| mez pro žebříček | 10 |

Kč/m² těch deseti: 104, 114, 150, 204, 225, 295, 359, **660, 910,
1 326**. Čtyři nejdražší pravidlo vyřadí — a tím spadne i celá Praha.
V Praze je to tak správně: pole za 1 326 Kč/m² není cena zemědělské
půdy. Pravidlo se proto nemění.

### Co se změnilo

Pod žebříčkem teď stojí věta, která to přizná a dá cestu dál:

> **Jeden kraj tu není:** [Praha](../pozemky-praha-kraj.html).
> Zemědělské půdy je v nabídce málo na to, aby z ní vyšla obvyklá cena —
> potřebujeme aspoň 10 nabídek, u kterých cena za metr nepřekročí
> 500 Kč. Dražší pole už je fakticky stavební parcela (viz „Jak tahle
> čísla počítáme" pod tabulkou), a v Praze je takových většina. Vlastní
> stránku ten kraj má.

Jméno kraje je **odkaz** na jeho stránku: kdo se v žebříčku nenašel, má
jít jedním klepnutím tam, kde nabídky toho kraje opravdu jsou. Seznam se
nepíše ručně, dopočítá se z týchž dat jako žebříček, takže se s ním
nemůže rozejít — a až Praha jednou mez překročí, věta zmizí sama.

### Zkouška

`scripts/test-ceny.mjs` má 151 → **154** kontrol. Hlídá se **vztah**, ne
konkrétní počet: každý kraj, který má na webu vlastní stránku, musí být
**buď v žebříčku, nebo jmenovitě ve větě o tom, kdo v něm není** — a
u chybějících musí být napsané proč (mez 10 nabídek a 500 Kč/m²).

**Prokázáno sabotáží — třemi:** smazaná věta o chybějících krajích (1
kontrola), věta bez důvodu (1) a další kraj vypadlý ze žebříčku (1).

Zkouška přitom napoprvé hlásila jako chybějící i **Vysočinu a Prahu** —
a obě tam byly:

* `vetaChybi[1].split('.')` rozseklo větu na „pozemky-praha-kraj**.**html",
  takže jméno kraje z odkazu vypadlo. Značky se teď odstraňují **dřív**,
  než se věta dělí na tečce.
* kraje se píšou třemi způsoby („Ústecký kraj", „**Kraj** Vysočina",
  „Praha"), takže srovnání muselo slovo „kraj" odstranit z obou stran,
  ne jen z konce.

Obě chyby byly ve zkoušce, ne na webu — a jsou tu zapsané proto, že
právě takhle vzniká zelená zkouška, která nic nehlídá.

## 3bg. NALEZENO (z tvého průchodu webem): hlídání se omlouvalo databází a zdroj dražeb měl na webu dvě různá jména — *opraveno 12. 10.*

Dva body z tvého seznamu, oba o tom, jak web mluví.

### „Databáze je ještě neumí"

Když se hlídání uloží jen částečně (migrace `supabase/hlidani-anon-uzce.sql`
čeká na nasazení, takže formulář ukládá postupně na méně a méně sloupců),
vypíše se, co se nepropsalo. Správné chování — jenže hláška zněla:

> „Hlídání uloženo, ale **cena od / výměra do / cena za m²** se zatím
> neuložily — **databáze je ještě neumí**."

Dvě věci na tom byly špatně. „Databáze je ještě neumí" je **naše** potíž,
ne jeho, a zní to, jako by se web přiznával k rozestavěnosti. A políčka
se jmenovala jinak než na obrazovce, oddělená lomítky jako výpis z kódu.

Teď hláška zní:

> „Hlídání jsme uložili, ale **„cenu od", „výměru do" a „nejvýš za metr
> čtvereční"** zatím hlídat neumíme. **Ostatní podmínky platí** a nové
> pozemky vám podle nich najdeme."

### Zdroj dražeb měl na webu dvě jména, a jedno z nich bylo opačné

Na úvodní stránce se zdroj jmenoval **„Nucené dražby (exekuce)"**, kdežto
u nabídky stojí **„dražba 26. 10. 2026 · OK dražby"**. Dvě jména pro
jeden zdroj, a to druhé je zkratka, kterou návštěvník nikde nepotká.

Hlavně ale: to první jméno **není pravda**. Změřeno v datech — zdroj
dodává **81** nabídek:

| | |
| --- | --- |
| běžné dražby | **53** |
| nucené (exekuce) | 28 |

Dvě třetiny toho zdroje tedy čip pojmenoval opačně; kdo hledá běžnou
dražbu a přečte si „nucené dražby (exekuce)", ten zdroj přeskočí. Čip
se jmenuje **„Dražby a exekuce (OK dražby)"** — říká, co v něm je, a
jméno sedí s tím, co stojí u nabídky.

Mimochodem, při tom měření vyšlo ještě jedno číslo: zdroj **CEVD**
(Centrální evidence veřejných dražeb) má v datech po odstranění duplicit
**0** nabídek. Není to vada — jsou to tytéž dražby, které dodává i OK
dražby, a z dvojice vítězí ta s výměrou celé dražby (viz bod 3bb). Čip
CEVD přitom ukazuje, kolik záznamů zdroj naposledy vrátil (88×), takže
nelže; jen je dobré vědět, že ani jedna nabídka na webu jeho značku
nenese.

### Co se naopak NEPOTVRDILO: tykání a vykání

Ohlášené míchání tykání a vykání jsem **nenašel**. Změřeno vzorkem na
neformální tvary (tvůj, máš, můžeš, klikni, napiš, zadej, vyber, uvidíš,
najdeš…) ve **viditelném textu 30 ručně psaných stránek** a ve
**všech řetězcích v `js/`** (komentáře vynechané): **0 nálezů**.
A opačným směrem: honorifikum uprostřed věty taky nikde — 105 výskytů
„vám/vaše/vás" malým písmenem, 11 velkým, a všech 11 je na začátku věty
(„Vaše soukromí bereme vážně.") nebo štítek políčka („Vaše obec"), kde
velké písmeno patří.

### Zkoušky

`scripts/test-hlidani.mjs` 173 → **189** kontrol: hláška o částečném
uložení existuje, neobviňuje databázi, říká, co platí dál, a políčka
jmenuje přesně tak, jak jsou popsaná ve formuláři (to se ověřuje proti
textu `hlidani.html`, ne proti seznamu v hlavě).

`scripts/test-sliby.mjs` 42 → **44** kontrol: jméno čipu zdroje nesmí
**zúžit** to, co zdroj dodává. Hlídá se to jen u zdrojů, které se
v datech podepisují (dnes 4 ze 5), a je to tak napsané, aby se to
nedalo splést s „prošlo to".

**Prokázáno sabotáží — čtyřmi:** vrácená stará hláška (3 kontroly),
políčka zpátky jako výpis z kódu (3), vrácený čip „Nucené dražby
(exekuce)" (1).

Ta poslední sabotáž přitom **dvakrát neprošla** a kontrola byla slepá:

1. napsal jsem podmínku jako „jméno musí zmínit dražby **i** exekuce" —
   a „Nucené dražby (exekuce)" obě slova obsahuje. Vadí **přívlastek**:
   „nucené dražby" běžné dražby vylučuje, i když slovo „dražby" ve
   jméně je;
2. opravený vzorek `nucen\w*\s+dražb` nesedl na „nucené", protože `\w`
   v JavaScriptu zná jen anglickou abecedu a „é" do něj nepatří. Táž
   past, kterou mají popsanou `js/vybaveni.js` i `js/druh.js` — a potřetí
   jsem na ni šlápl ve zkoušce, která měla hlídat něco jiného.

## 3bh. NALEZENO (ze tvého seznamu, část o vyhledávačích): Praha měla dvě stránky o jednom území a obě se prohlašovaly za kanonickou — *opraveno 12. 10.*

Praha je **kraj i okres naráz** a web z toho udělal dvě stránky:

| | listuje nabídek | kanonická byla | co píše |
| --- | --- | --- | --- |
| `pozemky-praha-kraj.html` | 12 | sama sebou | „Aktuálně evidujeme 23 pozemků v Praze" |
| `pozemky-okres-praha.html` | 23 | sama sebou | „Aktuálně evidujeme 23 pozemků v okrese Praha" |

Změřeno: těch 12 nabídek na krajské stránce je **podmnožinou** těch 23
na okresní (shoda 12 z 12). Je to tedy jedno území, dvě stránky, dvě
sebe-kanonické adresy — pro vyhledávač dvě stránky o jedné věci, které
si berou váhu navzájem.

Krajská stránka teď ukazuje jako kanonickou **tu okresní** (nese všech
23 nabídek, kdežto krajská je rozcestník na jediný okres — sama na
sebe), a tím pádem taky nepatří do sitemapy: vyhledávač by z ní dostal
adresu, o které mu táž stránka vzápětí řekne „kanonická je jiná".
Člověku zůstává obojí, krajská stránka funguje dál.

Pravidlo je **obecné, ne „když Praha"**: platí pro kterýkoli kraj, který
má jediný okres téhož jména. Jiný takový dnes není, ale kdyby přišel,
chová se stejně.

### Co se u toho NEPOTVRDILO

| ohlášeno | změřeno |
| --- | --- |
| „canonical říká `/data.html`, ale servíruje se `/data`" | Na ostrém webu ne. `vercel.json` má `cleanUrls: true`, takže na Vercelu `/data.html` přesměruje na `/data` — ale veřejný web běží na **GitHub Pages** pod vlastní doménou (stojí to v komentáři u analytiky v `index.html`) a tam se servíruje `/data.html`, tedy přesně to, co říká canonical. Platí to jen pro vercelový náhled. |
| „stránky chybí v sitemapě" | 150 stránek v sitemapě není a **u všech je to správně**: 138 ukončených nabídek (noindex) a 12 aplikačních stránek (hlídání, profil, moje data, odhlášení, diagnostika, 404 — všechny noindex). Změřeno i naopak: v sitemapě není ani jedna adresa, pro kterou by soubor neexistoval. |
| „odkazy s `?kraj=` a `?obec=` množí adresy" | Odkazů je hodně (1 641 `?obec=`, 91 `?kraj=`), ale všechny vedou na `index.html`, jehož canonical je `https://www.parcelaka.cz/`. Právě na tohle canonical je — všechny ty varianty se sloučí do jedné adresy. |
| „odkazy na `/index.html`" | 2 317 odkazů na 2 211 stránkách. Není to vada: `index.html` má canonical na `/`, takže se obě adresy slijí. Jako úklid by to smysl mělo (jeden přesměrovaný klik méně), ale je to 2 211 stránek změn za nulový rozdíl v tom, co člověk uvidí — nechávám a zapisuji. |

### A jeden vedlejší nález

`pozemky-od-lidi.html` má `noindex,follow` **a** canonical na
`index.html#mapa`. Dvě věci naráz: noindex a canonical jsou protichůdné
signály (Google canonical na neindexované stránce ignoruje) a ten
canonical navíc vede na `index.html`, který má canonical na `/` — tedy
řetězec. Nechávám to být, protože noindex je ten silnější a zamýšlený
signál a stránka je mimo index tak jako tak; zapisuji, aby to nevypadalo
nedoměřené.

### Zkoušky

Obě úpravy nahlodaly pravidla, na kterých stály dvě existující zkoušky —
a to je ta zajímavější část:

* `scripts/test-vyhledavac.mjs` hlídá „odkazovaná indexovatelná stránka
  nesmí chybět v sitemapě". Krajská stránka Prahy je odkazovaná,
  indexovatelná (noindex nemá) a v sitemapě teď **není** — zkouška to
  ohlásila jako vadu. Pravidlo dostalo druhou výjimku (stránka, která
  ukazuje kanonickou jinam) **a k ní protiváhu**: ta kanonická adresa
  musí být sama v sitemapě, jinak by se tím jen zametlo, že stránku
  vyhledávač nikde nedostane. 11 → **12** kontrol.
* `scripts/test-sdileni.mjs` hlídá „og:url ukazuje na vlastní stránku" —
  jenže specifikace Open Graphu žádá **kanonickou** adresu a táž zkouška
  o dva řádky dál hlídá, že se og:url a canonical nerozcházejí. Bez
  výjimky by si ty dvě kontroly protiřečily. 13 → **14** kontrol.

**Prokázáno sabotáží — čtyřmi:** kanonická adresa Prahy vyhozená ze
sitemapy (spadly 3 kontroly), krajská stránka vrácená sama na sebe (1),
og:url ukazující na třetí stránku (2).

## 3bi. NALEZENO (z tvého průchodu webem): jako jméno obce stála věta z inzerátu — a byla i v adrese stránky — *opraveno 12. 10.*

Ve výpisu stála nabídka jménem

> „**Vráž je známá pro svoje lázeňské sanatorium zaměřené na léčb**"

a web z toho udělal i adresu stránky, nadpis, titulek a řádek
v sitemapě:

```
pozemek-pisek-vraz-je-znama-pro-svoje-lazenske-sanatorium-zamerene-na-lecb-gdahk1.html
```

Příčina: u Farmy.cz se obec bere vzorkem „Obec … Okres" z textu
stránky. Když mezi těmi dvěma slovy leží věta, vezme se celá věta —
a `slice(0, 60)` ji jen zkrátil doprostřed slova („na léčb").

### Měření

Prohlédnuto **všech 1 041 různých jmen** v datech. Pokažená jsou tři,
každé jinak:

| jméno | zdroj | co s ním |
| --- | --- | --- |
| „Vráž je známá pro svoje lázeňské sanatorium zaměřené na léčb" | Farmy.cz | → **Vráž** |
| „Žeravice u Kyjova a k.ú. Syrovín" | OK dražby | → **Žeravice u Kyjova** (dvě katastrální území slepená v jedno) |
| „V Hlubokém" | Bezrealitky | nezlomitelná mezera (U+00A0) → obyčejná |

A čtyři jména ulic z Bezrealitky („Dr. E. Beneše", „Padlých hrdinů",
„Černá cesta", „Hořanská cesta") se **neopravují**: ulice je sice taky
špatně v poli pro obec, ale je to skutečné místo, ne věta — a která část
adresy je obec, se dá poznat jen z adresy samotné (to řeší
`mistoZBezrealitky`, opravené 5. 10. pro případy, které se dokázat
dají). Vymyslet si k ulici obec by bylo horší než ji tam nechat.

### Čím se to opravilo

Nová `jmenoObce()` v `scripts/fetch-opportunities.mjs`: řetězec se
ukrojí tam, kde začíná **próza** (slovo, které v názvu obce nikdy
nestojí — *je, jsou, pro, svoje, která, kde, nachází, známá*…) nebo
**slepenec** („a k.ú."), mezery se srovnají a co zbude, musí vypadat
jako jméno obce (do 45 znaků, do pěti slov). Jinak se vrátí `null` a
volající si doplní okres — a hlavně se to **ohlásí** do protokolu běhu.

Pět slov je naměřená mez, ne odhad: moje první, přísnější verze (čtyři
slova a velká písmena) zamítla osm existujících jmen, mezi nimi
„Rychnov u Jablonce nad Nisou" a „Doksy u Máchova jezera".

Zapojeno je to **na jednom místě** — jedním průchodem přes `fresh`, ne
v každém stahovači zvlášť: pokazit jméno umí tři zdroje třemi způsoby a
tři kopie pravidla by se rozešly.

### Uložená data a tři stránky, které zmizely

Na rozdíl od druhu pozemku (bod 3az) tady přepočet nic nehádá —
`jmenoObce` je čistá funkce nad řetězcem, který už v datech leží — takže
se data opravila hned. Tím se ale **změnil i otisk** nabídky, a s ním
jméno souboru: vznikly tři nové stránky se správnou adresou a tři staré
osiřely.

Osiřelé stránky archivář sám překlopil na „Nabídka už neplatí" — a to
by byla **lež**: ta nabídka platí dál, jen je na jiné adrese. Smazal
jsem je proto (ověřeno, že je další sestavení nevzkřísí). Je to jediné
místo na webu, kde se stránka pozemku maže, a důvod je úzký: ta adresa
nikdy neměla vzniknout a nevede na ni nic než naše vlastní (přestavěné)
rozcestníky. Na věku nabídek se to neprojevilo — ten se od včerejška
páruje podle **čísla inzerátu** (bod 3ba), ne podle otisku, takže
přejmenování obce ho nepohne.

### Zkouška

`scripts/test-misto-inzeratu.mjs` má 15 → **31** kontrol: oba pokažené
řetězce se ukrojí správně, osm existujících jmen zůstane, nezlomitelná
mezera se srovná, z prázdna nevznikne nic — a na ostrých datech už není
co očišťovat (s pojistkou, že se opravdu měří na 1 987 nabídkách).
Nakonec statická kontrola, že očištění je v robotovi zapojené u všech
zdrojů naráz.

**Prokázáno sabotáží — pěti:** vypnuté ukrajování prózy (1 kontrola),
vypnuté ukrajování „k.ú." (1), přísnější mez na čtyři slova (2),
nezapojené očištění v robotovi (1) a věta vrácená do dat (1).

## 3bj. NALEZENO (CI): našeptávač spadl v prohlížečové dávce na scénáři, který si vymyslel autor zkoušky — *opraveno 12. 10.*

Dávka `v-prohlizeci` byla na mém commitu **červená** — a nebyla to moje
změna. `scripts/test-naseptavac.mjs` měl v sobě dotaz napsaný natvrdo:

```
les Praha do 10 tis
```

a čekal, že web odpoví „Nejvíc omezuje **hledaný text**". Prošlo to,
dokud v datech byl aspoň jeden les pod deset tisíc. Robot takovou
nabídku jednou v noci přinesl a podruhé ne: **dnes není levnější les než
12 000 Kč**, takže dotaz nevrátil nic ani po zrušení místa — a protože
se tím nedá ukázat, který filtr prázdno způsobil, web správně napsal
obecnou hlášku a zkouška spadla.

Vada byla ve **zkoušce**, ne na webu. Dotaz se teď skládá z dat (táž
zásada, jakou tenhle test už používá na jméno obce): nejlevnější les
určí mez „do X tis" a vybere se obec, ve které les není ani jeden.
Dnes z toho vyjde „les Újezd u Brna do 12 tis".

A hlavně: scénář se **sám ověří**, než se podle něj něco tvrdí — pod
mezí musí být aspoň jeden les a v té obci ani jeden. Bez té pojistky
zkouška procházela i tehdy, když se obec vybrala špatně (vyzkoušeno
sabotáží: obec, která lesy má, prošla taky, protože je nemusí mít pod
mezí).

15 → **143** kontrol celkem (3 nové). **Prokázáno sabotáží:** s mezí
pod cenou nejlevnějšího lesa spadly 3 kontroly — a první z nich rovnou
řekne, že scénář nedrží, místo aby se to poznalo až na podivné hlášce.

Zapsáno i proto, že je to **druhá** zkouška v tomhle repozitáři, která
se opírala o náhodu v datech (první byla mez 220 px naladěná na místní
vykreslení). Vzor je stejný: číslo nebo dotaz z hlavy místo z dat.

## 3bk. NALEZENO (ze tvého seznamu, bod 26): zkratka „vyplnit z odkazu" nikde neřekla, že pozemek smí vložit jen majitel — *opraveno 12. 10.*

Ve formuláři na `pridat.html` je pole „Vložte odkaz na svůj inzerát".
Vloží se adresa, web ji najde ve vlastních datech (`js/predvyplneni.js`)
a doplní obec, okres, výměru, cenu, druh a sítě. **Nic se neověřuje** —
stačí odkaz na *kterýkoli* inzerát, který náš robot kdy stáhl, tedy
1 939 cizích nabídek z Bezrealitek, Farmy.cz, státní půdy a dražebních
portálů. Hotová nabídka se pak na mapě objeví s odznakem **„Přímo od
majitele"** (`pridat.html`, `.ul-verified`).

Hláška, kterou zkratka napsala, končila větou *„Zkontrolujte to
a připište popis — ten za vás vymýšlet nebudeme."* O tom, kdo pozemek
vložit smí, neřekla nic. Web tím mlčky vedl k tomu, že někdo vezme cizí
inzerát, proklikne čtyři políčka a jeho pozemek se tu zveřejní jako
„přímo od majitele". Ověřit vlastnictví neumíme (k tomu by byl potřeba
výpis z katastru) — ale **říct to umíme**, a dokud to tam nestálo,
nedalo se nikomu vyčítat, že to nevěděl.

**Oprava.** `js/predvyplneni.js` má teď jednu věc navíc — větu, která
se připojí ke **každé** hlášce o doplnění:

> Vložit pozemek smí jen jeho majitel nebo ten, kdo k tomu má jeho
> souhlas — na mapě se objeví jako „Přímo od majitele".

Připojuje se na obou cestách: i když se nedoplnilo nic (odkaz vedl na
víc pozemků a údaje se rozcházejí), formulář se dál vyplňuje a výsledek
bude pořád „Přímo od majitele".

**Co se nezměnilo:** nic se nezakazuje ani neblokuje. Vlastnictví
neověřujeme, takže tvrdit „zkontrolovali jsme to" by byla lež; první
nabídku z nového účtu si tak jako tak projdeme ručně (to na stránce
stojí). Tahle oprava jen doplňuje, co na obrazovce chybělo.

49 → **53** kontrol v `scripts/test-predvyplneni.mjs`. **Prokázáno
sabotáží:** když se věta ze zdroje i z `js/min/` vyřízne a nahradí
neutrálním „Hotovo.", spadnou **4 kontroly** — tři na modulu (obě cesty
hlášky i zmínka o odznaku) a jedna **v prohlížeči**, na textu, který
je po vložení skutečného odkazu z dat vidět nad formulářem. Ta poslední
je ta důležitá: hlídá, že věta došla na obrazovku, ne jen do modulu.

## 3bl. NALEZENO (ze tvého seznamu, body 7 a 22): na jedné kartě stálo „cena je zhruba uprostřed" a hned pod tím „o 69 % níž" — *opraveno 12. 10.*

Na stránce pozemku jsou dvě srovnání pod sebou: verdikt (percentil ceny
za m²) a blok odhadu obvyklé ceny. Verdikt bere všechny výměry, odhad jen
podobné — a protože cena za metr s výměrou klesá, mohou vyjít jinak.
Pojistka proti tomu v `js/ceny.js` existovala, ale hlídala jen krajní
verdikt („Vyšší cena"). Prostřední jí propadl. Naměřeno na 1 987
nabídkách: u **39 z 981** verdiktů byl na obrazovce tenhle rozpor
(Koloveč, okres Domažlice, stavební pozemek 1 161 m²):

> Průměrná cena · Cena za m² je zhruba **uprostřed** pozemků téhož druhu
> v prodeji v Plzeňském kraji (10 nabídek).
> Nabídková cena 1 295 000 Kč · Obvyklá cena v Plzeňském kraji
> 4 122 087 Kč · **o 69 % níž**

Obě věty se odvolávají na týž kraj a týž druh. Medián rozdílu u těch 39
je 27 %, maximum 71 %.

**Oprava.** Pravidlo je teď jedno a platí pro celou stupnici: když odhad
tiskne slevu (≥ 15 %), smí nad ní stát jen ten nízký verdikt. Cena: 981 →
**942** verdiktů (−4 %). Číslo se nezahazuje — blok odhadu zůstává a je
to to konkrétnější tvrzení (srovnává s podobně velkými pozemky).

154 → **159** kontrol v `scripts/test-ceny.mjs`. Zkouška je **párová**:
týž pozemek na 43. percentilu dvakrát, jen cena podobně velkých sousedů
se liší. S drahými sousedy verdikt zmizí, s levnými zůstane — takže se
nedá splést „pojistka zabrala" s „na data nebylo dost vzorku".
**Prokázáno sabotáží:** návrat meze na `pct >= 65` shodí 2 kontroly,
z toho jedna vypíše všech 39 skutečných nabídek i s jejich čísly.

**Vedlejší nález, a ten je vlastní chyba.** `scripts/test-shoda.mjs` měl
mez „percentil dostane víc než polovina nabídek". V CI spadla sama od
sebe ještě **před** touhle opravou (948 z 1 942, tedy 48,8 %) — jen tím,
že robot přisypal data. Mez naladěná na dnešní poměr je stejná chyba jako
dotaz „les Praha do 10 tis" v §3bj: číslo z hlavy místo z toho, co mez má
hlídat. Má poznat, kdyby verdikt zmizel SKORO VŠEM, a na to stačí
třetina. Nová mez je **0,35**, zbytek je rezerva na pohyb dat; proč, to
u ní stojí napsané. Že pořád měří, je ověřeno: s mezí 0,99 kontrola
spadne.

## 3bm. VLASTNÍ CHYBA (CI): jméno políčka si s sebou vezlo vysvětlení a věta se rozsypala — *opraveno 12. 10.*

Při přepisu hlášky o částečném uložení hlídání (§3bg) se do výčtu
nepropsaných políček dostalo `'okolí vašeho místa — hlídá se celý
okres'`. Výčet se vkládá doprostřed věty, takže na obrazovce stálo:

> Hlídání jsme uložili, ale **okolí vašeho místa — hlídá se celý okres**
> zatím hlídat neumíme.

Chytla to `scripts/test-okruh-hlidani.mjs` v CI (hledala v hlášce slovo
„okruh", které tím přepisem zmizelo) — tedy zkouška, která tu už byla,
ne nová. Místní dávka to nechytla proto, že jsem po té opravě pustil jen
zkoušky kolem hlídání ve formuláři, ne tuhle.

**Oprava.** Políčko se jmenuje `„okruh" kolem vašeho místa` a co se
hlídá místo něj, je vlastní věta: *„Místo okruhu hlídáme celý okres."*

Dvě nové kontroly v `scripts/test-hlidani.mjs`: ta věta musí existovat,
a **žádné jméno políčka ve výčtu nesmí obsahovat pomlčku s vysvětlením**
— to je ta past, do které jsem spadl. **Prokázáno sabotáží:** po
vyříznutí věty spadnou dvě kontroly, jedna z nich v prohlížeči na
skutečné hlášce po neúspěšném uložení.

## 3bn. NA PŘÁNÍ: web na telefonu podle Sreality — velké fotky, širší karty, sbalené hledání, vysouvací nabídka — *12. 10.*

Zadání od majitele, zkráceně: *fotky roztáhnout a zvětšit, celou kartu
roztáhnout víc do stran, hledání neukazovat celé (jen po rozkliknutí),
a menu udělat jako normální vysouvací panel — „menu na mobilu jezdí
nahoře, je to strašné".* Všechny čtyři jsou hotové a změřené; u sbaleného hledání stojí níž
i to, jak jsem ho napoprvé udělal špatně.

### 1. Karty: fotka přes celou šířku

Karta byla na telefonu vodorovný řádek — náhled 116 × 128 px vlevo,
údaje vpravo. Důvod byl poctivý a platí dál (svislá karta zabere skoro
celou obrazovku), ale je to rozhodnutí vlastníka webu a je zapsané jako
jeho, ne jako závěr z měření.

| | před | po |
|---|---|---|
| náhled | 116 × 128 px | **356 × 223 px** (5,7× plocha) |
| šířka karty | 318 px | **358 px** |
| výška karty | ~148 px | ~390 px |
| karet na obrazovku | ~5 | ~2 |

Karta se roztáhla do stran tím, že na telefonu zmizelo trojí odsazení
(20 px u `.map-wide`, 16 px u `.map-side`, rámeček `.map-app`), které
na displeji přes celou šířku nic neohraničovalo.

**Co z toho vyplynulo samo:** zkrácené popisky odznaků (`Záměr obce`
místo `Obecní záměr`) existovaly jen proto, že se do náhledu 116 px
nevešly plné. Do 356 px se vejde i nejdelší (94 px), takže zkrácená
podoba se nikde nevykreslovala — a popisek, který nikdo neuvidí, je
mrtvá značka na každé kartě. Je pryč i s pravidly ve stylopisu.

### 4. Nabídka: vysouvací panel

Čtvrtá podoba za tenhle rok, a je to rozhodnutí majitele proti číslu,
které jsem sem sám citoval (navigace použitá v 57 % úkolů pod
hamburgerem proti 86 %, když část zůstala vidět — NN/g podle
designstudiouiux.com, u zdroje neověřeno). Jenže ten pás, který měl
„zůstat vidět", ukázal z šesti odkazů dva; zbytek se musel odjet
prstem, takže o něm nikdo nevěděl. Panel je zleva, přes 88 % šířky,
odkazy po 56 px s ikonami, účet se stavem přihlášení nahoře a „Přidat
pozemek" dole. Hlavička spadla ze 119 na **65 px**.

**Tlačítko ani panel nejsou ve značce ani jedné stránky** — staví je
`js/menu.js` z toho, co v hlavičce už je. Jinak by hamburger musel do
2 212 souborů a stál by na 2 212 místech místo na jednom.

### 3. Sbalené hledání: napoprvé špatně, napodruhé dobře

**Napoprvé** to byla lišta s tlačítkem „Upravit hledání" a panel přes
celou obrazovku. Nevyšlo to, a chyba byla v návrhu, ne v provedení:
**v tom panelu nejsou jen filtry.** Je v něm i našeptávač obcí, odznaky
„co web z tvé věty pochopil" a „Pozemky v okolí", tedy věci, které musí
být vidět i po zavření. Každá oprava toho překryvu si vyžádala další:
zavírání klepnutím mimo otevřelo pod panelem inzerát → zatmívací plocha
→ ta skončila nad panelem (panel leží ve vlastním vrstvícím kontextu,
`.map-wide` má `z-index:1`) → po přesunu ležela na tlačítku „Zobrazit
i podobné názvy" → Escape zavíral celé hledání místo našeptávače →
výběr obce panel nezavíral, protože našeptávač si událost zastavuje.
Zahodil jsem to.

**Napodruhé** je to rozbalení **v toku**, ne překryv, a schovává se jen
to, co se nastaví jednou:

| vidět pořád | rozbalí se po klepnutí do pole |
|---|---|
| pole s lupou + našeptávač | Pozemky v okolí |
| odznaky rozpoznaných filtrů | druhy nabídek (Vše / Prodej / Dražba / Exekuce) |
| | Druh, cena, výměra a řazení |

Naměřeno na 390 px: nad výpisem ubylo **278 px** a první karta se
posunula z 697 na 419 px. Zavírá se „Hotovem" pod rozbaleným blokem.
Rozbalí se i zaměřením pole, ne jen klepnutím — kdo se do něj dostane
tabulátorem, má mít filtry po ruce stejně.

A z té celé řady potíží nezbylo nic: blok v toku nemá co překrýt, takže
není potřeba zatmívací plocha, nemá se co prát o vrstvy a Escape nemá
co zavírat. Ve zkouškách stačí **jedno** klepnutí do pole na stránku
(`scripts/rozbal-hledani.mjs`) — u překryvu jich bylo potřeba dvacet
a i to byl signál, že je špatně návrh.

### 4b. Karta stála nakřivo o 12 px a text pod fotkou měl pět řádků

Na snímku z telefonu bylo vidět, že karta nesedí v panelu rovně, a že
pod velkým náhledem je sloupec drobných odstavců. Obojí byla skutečná
chyba, ne dojem.

**Nakřivo.** Výpis `.opp-list` si drží `margin:0 -6px` + `padding:0 6px`,
aby `overflow-y:auto` neodřízl zdvih karty pod myší. Proti tomu ale
stálo `max-width:100%`: šířka se srazila na šířku rodiče, levý záporný
okraj platil dál a pravý se jako přebytečný zahodil. Naměřeno na 390px
displeji: karta **10 → 368 px**, tedy 10 px vlevo a 22 px vpravo. Mez
teď počítá s oběma okraji (`calc(100% + 12px)`) a na mobilu, kde výpis
nic neřeže, záporné okraje odpadly úplně. Karta stojí **10 → 380 px**
a je o 12 px širší.

**Text.** Pod fotkou stálo pět samostatných odstavců: cena, název,
okres, druh, čísla — každý jiné písmo a jiný odstup, dohromady 218 px.
Teď jsou tři řádky:

| | dřív | teď |
|---|---|---|
| pořadí | cena, název, okres, druh, čísla | **název**, okres · druh, **cena** + čísla |
| řádků textu | 5 | 3 |
| výška těla karty | 218 px | **153 px** |
| výška celé karty | 443 px | **385 px** |
| odznaky | dva řádky (60 px) | jeden (28 px) |

Název místa je nadpis karty — podle něj se pozemek ve výpisu pozná, tak
stojí první a je tučnější. Okres a druh se vešly na jeden jemný řádek;
oddělovač kreslí stylopis, ne skript, aby řádek nezačínal tečkou, když
druh chybí. Cena zůstává největším písmem, jen už není první shora, a
čísla (výměra, Kč/m², vzdálenost) stojí na účaří hned za ní. Zalomení
je povolené: „379 320 000 Kč" je samo 150 px široké, takže na úzkém
displeji čísla spadnou pod cenu místo přetečení z karty.

Cena za to: nic. Karta je o 58 px nižší a o 12 px širší zároveň.

### 5. Inzerát a lišta nad výpisem podle velkých zahraničních webů

Na přání: „máme super informace, ale vypadá to jako dětská appka".
Seděla v tom pravda a šla pojmenovat: barevné plochy. Stránka pozemku
měla oranžovou desku u dražby, zelenou u ceny, zelený přeliv u rádce —
pod sebou z toho byla skládanka a text se v ní ztrácel. K tomu patkové
písmo v nadpisu i u ceny, které spolu s pastelem dělá časopis o přírodě.

Co se změnilo:

| | dřív | teď |
|---|---|---|
| desky | vybarvené naplocho (zelená, oranžová, přeliv) | bílé, tenká šedá linka, **barevný proužek vlevo** |
| písmo nadpisu a ceny | patkové (Fraunces) | totéž bezpatkové jako zbytek |
| odkaz na dražebníka | oranžové tlačítko | neutrální, oranžová zůstala významu „dražba" |
| nadpis na telefonu | 28 px, lámal se mezi „14 272" a „m²" | 24 px, nezlomitelná mezera před jednotkou |

Barva nezmizela, jen přestala přebíjet text — a kontrast stoupl, protože
tmavý text na bílé je nejvyšší, jaký jde mít.

**Rychlý výběr dostal důvod, proč do něj lézt.** Byl to šestý stejně
vypadající knoflík v řadě a stálo na něm jen jméno funkce; co dělá
(jedna nabídka přes celou obrazovku, doprava uložit, doleva schovat),
se člověk dozvěděl až uvnitř. Teď je to pruh přes celou šířku s počtem
(to je ten důvod — u pěti pozemků žádný není a tam se taky nenabízí)
a s větou o tom, co se stane doprava a doleva.

### 6. Dole na inzerátu stál sloupec pilulek

Čtyři tlačítka pod sebou, každé přes celou šířku: Mapy.cz, panorama,
katastr, sdílet. Nebyl to záměr — `.pz-btn` má základ 200 px a dvě
takové chtějí 410, kdežto na 390px displeji zbývá 358, takže se každá
roztáhla na vlastní řádek. Při základu 140 px se dvě vejdou vedle sebe.

A „Otevřít v katastru" — jediná věc, kterou má člověk na té stránce
opravdu udělat, totiž ověřit si vlastníka — byla vybarvená na deset
procent zelené, což vypadalo jako vypnuté tlačítko. Je teď plná tmavá
zeleň s bílým textem, tedy jediné plné tlačítko na stránce. Spodek
inzerátu je o 62 px kratší.

### 7. Šev mezi lištou prohlížeče a hlavičkou — a rozcestník na úvodu

**Šev.** Na snímku ze Seznamu je vidět, že lišta prohlížeče přechází do
stránky bez čáry. U nás čára byla a šlo ji změřit: na dotykovém
zařízení se hlavičce vypíná rozmazání pozadí a bere neprůhlednou barvu
`#F5FAF7`, kdežto `theme-color`, kterým si prohlížeč obarví lištu, je
`#F9FAF9`. Čtyři jednotky na červeném kanálu — málo na to, aby to člověk
pojmenoval, dost na to, aby viděl hranu.

Horší je, proč to neohlásila zkouška, která přesně tohle hlídá:
`test-barva-listy` měřila **bez dotyku**, tedy v jediném zobrazení, kde
platí průsvitná varianta a kde to sedělo. Měří teď obě a navíc porovnává
i to, co hlavičce předepisuje stylopis. Sabotáží ověřeno: se starou
hodnotou kontrola spadne.

(Co se naopak ukázalo jako *ne*-vada: při rolování hlavička schválně
zhasíná a pod ní prosvítá mapa — naměřeno `#0F1F16`. Zkouška to zprvu
hlásila jako chybu; tvrzení, které platí vždycky, je „dokud je hlavička
vidět, má barvu lišty", a tak je i zapsané.)

**Rozcestník.** Na přání a podle Sreality: na telefonu je pod hlavičkou
velká značka (38px znak proti 29 v liště), jedna věta a šest dlaždic —
Stavební, Zahrady, Dražby, Exekuce, Nové, Okresy. Každá vede na stránku,
kterou web už má. Na širokém displeji se nezobrazuje, tam zabírá mapa
půl obrazovky.

Napoprvé měl 288 px ve dvou sloupcích a `test-rozvrzeni` to shodil:
hledání spadlo na 320×568 na 73 % obrazovky, tedy pod ohyb. Tři sloupce
a dva řádky dávají 216 px a hledání je na 55 % (375×667: 47 %,
390×844: 37 %).

A jedna kontrola z toho vyšla přesnější: „nad hledáním nezůstal prázdný
pruh" měřila vzdálenost hlavičky k poli, jenže nad polem teď stojí
obsah, kvůli kterému tam je. Ptá se proto na to, na co se ptala vždycky
— kolik místa pod hlavičkou nenese **nic** (naměřeno 0 px).

### Co našly zkoušky (a co z toho byla moje chyba)

Z plné dávky 102 prohlížečových zkoušek jich osm zčervenalo:

1. **`test-vmacknuto` našel skutečný regres.** Na 1280 px sebrala lišta
   nad výpisem tolik místa, že do seznamu nezbylo ani na jednu celou
   kartu: 246 px proti kartě 275 px. Posouvá se proto celý sloupec, ne
   jen seznam uvnitř něj — a ovládání odjede nahoru s ním.
2. **Dvě kontroly hlídaly přesně to, co jsem zrušil** (`test-barvy`
   obtažení karty barvou druhu, `test-verdikt` zelenou desku verdiktu).
   Obě tvrdily něco, co platí dál, jen to nese něco jiného: odznak na
   fotce a proužek u desky. Přepsány na to, měří teď silněji než dřív
   (51 a 30 kontrol).
3. **`test-klic-ulozenych` četl cenu jako první „… Kč" v textu karty** —
   a po přerovnání se napřed trefil do „25 Kč/m²". Čte ji z `.opp-price`.
4. **Dvě moje nedbalosti:** odstupy mimo slovník webu (`test-jazyk`,
   `test-parametry`) a zapomenutý pomocný server na portu 8399, přes
   který `test-prihlaseni` nemohl nastartovat ten svůj.
5. **Jeden můj nápad zkoušky zamítly a měly pravdu:** schoval jsem na
   telefonu počet v hlavičce výpisu jako zdvojený (v přepínači nad ním
   stojí „Seznam (1 938)"). Shodilo to osm kontrol ve třech souborech —
   hlavička je místo, odkud se počet čte. Vráceno.

### Co se přitom našlo (vlastní chyby z téhle přestavby)

1. **Panel vyjel 20 px za levý kraj obrazovky.** Po pásu odkazů zbylo
   pravidlo `#nav{margin:0 -20px}`. Naměřeno x = −20.
2. **Pod hlavičkou zel prázdný pruh 20 px.** `--vyska-hlavicky` jsem
   nechal na 85 px, skutečná výška jednořádkové hlavičky je 65. Hlídá
   to teď `test-hlavicka` — proměnná se musí shodovat se změřenou
   výškou.
3. **Jméno „Parcelka" odletělo k pravému kraji** a mezi ním
   a hamburgerem bylo 186 px prázdna (`justify-content:space-between`
   se dvěma prvky).
4. **Zprávy a Hlídání z nabídky zmizely.** `display:contents` na
   `<details>` rozbije jeho vykreslování — v repozitáři o tom byl
   komentář z minula a stejně jsem do toho spadl znovu.
5. **Odkazy v panelu neměly ikony** a místo nich zůstala prázdná
   22px mezera.
6. **Odznak kategorie si sedl na křížek „skrýt".** Posunul jsem ho
   nahoru doleva, jenže přesně tam na dotykových zařízeních sedí
   křížek. Shodila to `test-rozvrzeni` na všech 24 kartách.
7. **Rozvržení poskakovalo: CLS 0,184 proti dovoleným 0,05.** Výpis je
   chvíli prázdný a oddíl „14 krajů" pod ním stál na 689 px; po
   dokreslení karet spadl na 10 636 px, tedy skok o 9 947 px. Dřív to
   nevadilo, protože nad výpisem stálo 512 px ovládání a ten oddíl
   začínal pod ohybem. Výpis si teď drží výšku obrazovky dopředu.
8. **Čtyři barvy a dva stíny mimo paletku** a jeden rozměr písma
   o pixel vedle. Vymyslel jsem si jména tokenů (`--text`, `--znacka`,
   `--text-mute`), která v tomhle webu nikdy neexistovala.
9. **Odstup nad hledáním je sevřený ze dvou stran.** Hlavička se dřív
   při rolování zmenšovala (pás odkazů z ní mizel) a uhýbala tak sama;
   jednořádková hlavička se uhnout nemá čím, takže to místo musí být
   nad hledáním: 50 px, protože `test-pod-hlavickou` chce aspoň tolik
   a `test-rozvrzeni` nedovolí víc než 64. U obou je to napsané.

### Zkoušky

`test-menu` 20 → **30** kontrol a měří něco jiného: zavřený panel
nesmí být vidět, otevřený musí nabídnout všech šest cílů, musí jít
zavřít Escapem i klepnutím na odkaz, a hamburger musí být v hlavičce
vlevo a mít 44 px. `test-hlavicka` 60 → **63**, nově včetně shody
`--vyska-hlavicky` se skutečnou výškou. `test-rozvrzeni` a
`test-odznaky` přepsané na jeden popisek odznaku.

A jedna kontrola se opravila sama od sebe: „tlačítko Nahoru nezakrývá
text v kartách" porovnávala obdélníky blokových prvků, tedy i prázdno
za koncem krátkého řádku. U úzkých karet to nevadilo, u širokých začala
hlásit překryv ničeho. Měří teď obdélníky samotných písmen (Range).

## 3bo. NA PŘÁNÍ: celý web předělaný vizuálně — jedna bílá, jedno písmo, žádná textura — *13. 10.*

Zadání znělo: nechat všechny informace, předělat jen vzhled, vzít si
příklad z nějakého obrovského realitního webu, propojit dva návrhy
a udělat to extrémně čistě. Vzal jsem si **Hemnet** (švédský, největší
v zemi) a **Idealistu** (španělský). Co mají společného a co jsem
odtud vzal: neutrální téměř bílá stránka, čistě bílé karty, téměř černé
písmo, barva značky jen jako akcent — a jedno bezpatkové písmo na všechno.

### 1. Paletka: ze zelenošedé do neutrální

Stránka byla laděná dozelena (`--bg:#F2F5F2`, plochy s nádechem),
protože web je o pozemcích. Jenže zelená ve VŠEM nedovolí zelené
znamenat něco konkrétního. Teď je podklad `#F2F4F3`, karty `#FFFFFF`,
text `#101513` — a zelená zbyla jen na značku, hlavní tlačítko a odkazy.

### 2. Hlavička: jedna neprůhledná barva, žádné sklo

Hlavička byla na monitoru průsvitná s rozmazaným pozadím
(`backdrop-filter`). Tři důvody, proč je pryč:

* **Barva.** Průsvitná hlavička mění barvu podle toho, co se pod ní
  zrovna roluje. Lišta prohlížeče (`meta theme-color`) je přitom jedna
  pevná hodnota, takže se nahoře nikdy netrefí a je vidět šev.
* **`position:fixed` uvnitř.** `backdrop-filter` dělá vztažný rámec,
  takže se pevně umístěné potomky polohují podle hlavičky, ne podle okna.
* **Jednota.** Na dotyku sklo nebylo (kvůli iOS), na monitoru ano. Web
  tedy vypadal na každém zařízení jinak.

`test-hlavicka` hlídala **pravý opak** („na monitoru sklo zůstalo") —
přepsal jsem tu kontrolu na to, co teď platí: neprůhledná všude.

### 3. Zrno přes celou stránku — zrušené

Přes celý web ležela vrstva velmi jemného šumu (`body::after`,
`mix-blend-mode:multiply`). Měla dělat plochy méně skelné. Co stála:

* **Barvu.** Násobením ztmavila všechno pod sebou. Naměřeno: bílá
  hlavička `#FFFFFF` se vykreslila jako `#FAFAFA`. Obcházelo se to tím,
  že se do `theme-color` psala ta ztmavená hodnota — tedy barva, která
  se nerovnala ničemu ve stylopisu.
* **Plynulost na iOS.** Míchaná celoobrazovková vrstva nad hlavičkou
  nutí prohlížeč u každého snímku počítat, co je pod ní. Proto už dřív
  nebyla na dotyku vůbec.
* **Čistotu.** Velké realitní weby jedou na plochých bílých kartách.

Nová pojistka v `test-hlavicka`: *pevná vrstva přes celé okno nesmí mít
`mix-blend-mode`*. Ověřeno sabotáží — s vrácenou vrstvou spadly tři
kontroly, bez ní je zelená.

### 4. Jedno písmo místo dvou

Nadpisy byly patkové (Fraunces). Hemnet, Idealista, Zillow, Rightmove
i Immobiliare jedou **všechny** na jednom bezpatkovém a rozdíl mezi
nadpisem a textem u nich dělá váha, velikost a prostrkání. Fraunces je
tedy pryč a s ní:

* dva soubory písem, **105 kB**,
* jeden `<link rel="preload">` na **2 228 stránkách**,
* a jedno načítání písma, které mělo dojet před prvním vykreslením nadpisu.

Při té příležitosti odešel i přepis prostrkání nadpisů na −0,01 em —
ta hodnota byla povolená kvůli patkám, u Interu ve 32 a 42 px dělá
rozsypaný nadpis. Nadpisy jsou zpátky na −0,03 em, které si nesou samy.

`test-pisma` počítala natvrdo „čtyři @font-face" a „všechna čtyři písma".
Přepsal jsem obě kontroly na počet SOUBORŮ, takže si při další změně
sednou samy. Ověřeno sabotáží: po smazání jednoho `@font-face` hlásí
„1 ku 2".

### 5. NALEZENO při tom: lišta nad mapou měla na monitoru 570 × 128 px prázdna

Tohle je vlastní starší chyba, kterou odhalila až prohlídka hotového
vzhledu. Lišta nad mapou má na širokém displeji mřížku s pojmenovanými
plochami: nahoře hledání, okolí a filtry, dole rychlé filtry. Jenže
když kvůli telefonu přibyl obal `.ms-rozsirene` (schová všechno kromě
pole s lupou), přestaly být ty prvky přímými dětmi lišty — selektory
s `>` je minuly a všechny spadly do **jedné** buňky.

Naměřeno na 1440×900 před opravou:

| | před | po |
|---|---|---|
| výška lišty | 174 px | **105 px** |
| pole hledání | 570 px, samo v levé polovině | **660 px** |
| rychlé filtry | 512 px ve sloupci vpravo | **1 102 px** přes celou šířku |
| prázdno v liště | 570 × 128 px | **žádné** |

Opraveno jedním řádkem (`display:contents` na obalu, jen nad 1041 px)
a přepsáním čtyř selektorů z přímých na potomkové — `display:contents`
mění vykreslování, ne strom, takže `>` by dál nesedělo.

### 6. NALEZENO: tlačítka a pole měla čtyři různá zaoblení

Změřeno na sedmi stránkách ve dvou šířkách, na vykreslených prvcích
(ne na zápisu v stylopisu): ovládací prvky se kreslily ve **čtyřech**
zaobleních — 6 px (kontaktní formulář), 10 px (hledání nad mapou,
řazení, souhrn filtrů, záložky přihlášení), 14 px (hlavní tlačítko,
přihlašovací pole, „Pozemky v okolí") a pilulka.

Jednotlivě si toho nikdo nevšimne. Vedle sebe v jedné řadě ano: nad
mapou stálo pole hledání na 10 px, hned vedle „Pozemky v okolí" na 14
a za ním souhrn filtrů zase na 10. To je přesně ten pocit „je to skoro
hotové", který se nedá ukázat prstem.

Pravidlo je teď jedno a je napsané u tokenu `--r-ovladani`:

* co se **ovládá** (tlačítko, pole, rozbalovač) → `--r-ovladani`,
* **pilulka** zůstává odznakům (zapínatelný filtr) a kulatým tlačítkům
  s ikonou — tam netvrdí, že je to pole,
* **nula** je v pořádku u prvků bez vlastní plochy a bez okraje:
  zaoblení ničeho není vidět.

Hlídá to nová `scripts/test-zaobleni.mjs` (95 změřených prvků).
Ověřeno sabotáží: po vrácení řazení na 10 px hlásí `map-select (10 px) ×2`.

### Zkoušky

Celá dávka z CI na hotovém stromu: **97 neprohlížečových** kontrol
zelených, prohlížečová dávka **102** kontrol zelená (plus nová `test-zaobleni`,
takže v CI je jich 103). Tři kontroly musely změnit, co měří, a u každé je v souboru napsané proč:
`test-hlavicka` (sklo na monitoru → neprůhledná všude, + nová pojistka
na míchanou vrstvu), `test-pisma` (čtyři písma → počet souborů),
`test-barva-listy` (konstanta světlé barvy `#F9FAF9` → `#FFFFFF`).

## 3bp. NA PŘÁNÍ: kompozice a logické uspořádání — nástroj je stránka, oddíly jdou po tom, co člověk potřebuje — *13. 10.*

Zadání: „extrémně změnit vizuál na lepší kompozici, na větší čistotu
a hlavně logické uspořádání". Tohle je ta vrstva nad barvou a písmem —
kde co stojí a jak velké to je.

### 1. Nástroj byl obrázek ve stránce. Teď je to stránka.

Mapa se seznamem stála jako zaoblená deska **1 136 px uprostřed 1 440px
okna**: 152 px prázdna vlevo, 152 vpravo, sloupec s kartami 380 px —
vešla se do něj jedna karta a kousek. Nástroj, kvůli kterému sem člověk
jde, dostal 62 % plochy a tvářil se jako jeho ukázka.

Zillow, Idealista, Hemnet i Rightmove to mají stejně: mapový pohled jde
od kraje ke kraji a je na jednu obrazovku. Naměřeno po přestavbě
(1440×900):

| | před | po |
|---|---|---|
| šířka desky | 1 136 px | **1 440 px** (celé okno) |
| výška desky | 684 px | **767 px** (přesně zbytek obrazovky) |
| sloupec s výpisem | 380 px | **460 px** — karta se vejde celá |
| pole hledání | 570 px | **520 px** (strop, ne roztažení přes okno) |

Pole hledání má strop schválně: bez něj z něj na 1 440 px bylo
**1 340 px široké pole na jméno obce**. Ovládání je vlevo, vpravo vzduch.

### 2. Mezera nad deskou — dvě slepé uličky a jedno měření

Deska nejdřív začínala rovnou pod hlavičkou (hezké). Jenže stačilo
odrolovat 60 px a pole hledání vjelo pod připíchnutou hlavičku:
naměřeno na 1280×900 — pole na y 36–82, hlavička přes ně sahá 33 px.
Horní třetina pole je **vidět**, ale klepnutí na ni trefí hlavičku;
přesně to hlídá `test-pod-hlavickou`.

Druhý pokus: nechat lištu ovládání přilepenou (`sticky`) pod hlavičkou.
Ovládání drží, ale mapa se pod ni podsune i s vlastními tlačítky —
změřeno: po 60 px rolování ležela „Celá ČR", „Kreslit výběr" i „Podle
ceny" pod lištou. Jedna vada za druhou není oprava.

Platí tedy totéž co na telefonu: nad prvním ovládáním musí být místo.
**48 px**, protože tolik má spodní odsazení celého oddílu — mezera nad
deskou a pod ní je pak táž a nepřidá do stránky další číslo.

### 3. Pořadí oddílů: podle toho, co člověk zrovna potřebuje

Bylo: kraje → tipy → *zdroje* → jak to funguje → druhy → od majitelů →
*kontaktní formulář* → slovníček → dotazy. Tedy velká tmavá deska
o zdrojích dat hned po procházení, vysvětlení toho, co člověk na mapě
viděl, až čtvrté — a kontaktní formulář uprostřed stránky.

Teď: **tipy → kraje → druhy příležitostí → jak to funguje → zdroje →
od majitelů → slovníček → dotazy → kontakt.** Tedy: nabídky, procházení,
porozumění, postup, důvěra (odpověď na otázku, kterou postup vyvolá),
pro majitele, příručka, kontakt na konci. Kotvy zůstaly, odkazy drží.

### 4. Kartičky druhů byly nedokreslená plocha

Pět kartiček „Pět druhů příležitostí" mělo barevný přechod, který končil
na **pevných 240 px** — ať byla kartička široká 380 nebo 1 160 px,
obarvená byla pořád jen levá čtvrtina a zbytek mizel do stránky. Vedle
bílých karet s rámečkem, ze kterých je zbytek webu, to nevypadalo jako
záměr. Teď je to bílá karta s rámečkem a barevnou linkou u levé hrany —
táž součástka jako posudek ceny na stránce pozemku. Pátá kartička se
přestala roztahovat přes oba sloupce: jako skutečná karta to říkalo
„tahle je důležitější", což není pravda, jen jich je lichý počet.

### 5. Tipy na dobrou koupi se četly odzadu

Sytý zelený odznak („levnější než 97 % pozemků v prodeji v Ústeckém
kraji") stál **nad** jménem obce a byl to nejhlasitější prvek v oddílu —
přitom nese vedlejší informaci. Pořadí je teď místo → popis → cena
a odůvodnění pod tím, jako poznámka pod tvrzením; odznak zůstal zelený,
ale bez přechodu a bez stínu.

### 6. Drobnosti, které rozhodily řádek

* Čtveřice obřích čísel v tmavém pásu: „**4× denně**" se zalomilo na dva
  řádky a popisky pod čísly si přestaly sedět na jednu linku. Hodnota je
  teď „4×", zbytek je popisek.
* Nadpis „Ozvěte se nám." začínal o 220 px vlevo proti nadpisům nad ním,
  protože jediný neměl sloupec se značkou. Štítek „Kontakt" se
  přestěhoval z vlastní řádky do toho sloupce — táž informace na místě,
  kde ji stránka už má.
* Mezi hlavičkou a deskou zůstávaly dvě vodorovné linky 48 px od sebe;
  horní rámeček desky odešel, schod zmizel.

### Vlastní chyby, které zkoušky z téhle přestavby vytáhly

1. **`#realitky .eyebrow` zůstalo jako mrtvé pravidlo** po přesunu
   štítku — a `test-rozdel-styly` to ohlásil oklikou: pravidlo se
   objevilo ve zkráceném stylopisu, protože slovo „realitky" drží
   komentář na jiné stránce.
2. **Štítek na tmavé ploše měl kontrast 1,53 : 1** (nutné 4,5). Vzal si
   barvu z paletky pro světlý podklad. Našel `test-kontrast`.
3. **Slovník odstupů úvodní stránky přetekl z 22 na 24 hodnot** —
   přidal jsem 50 px (mezera nad deskou), 24 px (odsazení lišty) a 3 px
   (odznak tipu). Všechny tři nahrazeny čísly, která stránka už má
   (48, 20, 4). Našel `test-jazyk`.
4. **`test-barvy` hlídal přesně ten přechod, který jsem zrušil.**
   Kontrola se přepsala na to, co barvu nese teď: tloušťku svislé čáry
   (≥ 3 px) a vlastní bílou plochu kartičky.

### Zkoušky

Celá dávka z CI na hotovém stromu: **97 neprohlížečových** a **102
prohlížečových** kontrol zelených.

## 3bq. NA PŘÁNÍ: jedna svislice na celý web — vnitřní stránky přestaly uhýbat — *13. 10.*

Předchozí kolo spravilo kompozici úvodní stránky. Tohle je zbytek webu:
stránky cen, hlídání, přidání pozemku, profilu, zpráv, rádců a výpisů.

### Co se změřilo

Projel jsem levé hrany hlavních bloků na dvanácti stránkách (1440×900)
a spočítal, kolik RŮZNÝCH svislic každá stránka má:

| stránka | před | po |
|---|---|---|
| `hlidani.html` | **5** (392 nadpis · 152 záložky · 440 karta) | **1** (152) |
| `pridat.html` | **5** (392 nadpis a dotazy · 152 formulář · 264 karta) | **1** (152) |
| `porovnani.html` | **5** (392 proti 232) | **1** (152) |
| `cena-pozemku.html` | 3 (232) | **1** (152) |
| `zpravy.html`, `muj-inzerat.html` | 4 (centrovaná karta na 440 a 500) | **1** (152) |
| `drazby-pozemku.html` a další rádci | 2 (234 osnova · 518 text) | **152 · 372** (osnova a text, jako oddíly úvodu) |

### Proč to tak bylo

Obaly si braly **tři různé míry** — `--m-wrap` (1200), `--m-siroky`
(1040) a `--m-sloupec` (720) — a každý se ve své vystředil. Různě široké
vystředěné obaly nemůžou mít stejnou levou hranu. K tomu se tatáž
součástka (přihlašovací karta) na třech stránkách středila ve třech
různých sloupcích: 212 px na Hlídání, 264 na Přidat pozemek, 500 na
Můj profil.

### Co se udělalo

* **Obal má jednu míru** (`--m-wrap`), čtecí míru si nese OBSAH:
  `.add-wrap > *` do 720 px. Řádek textu se tím nenatáhne přes celou
  obrazovku a levá hrana je všude táž.
* **Stránky okresů, krajů a cen** (`.okr-wrap`) dostaly tutéž míru.
* **Přihlašovací karta se nestředí**, drží levou hranu — na všech třech
  stránkách stejně.
* **Osnova článku** (rádci) se opírá o levou hranu stránky místo o střed:
  byla na 234 px, text na 518.
* **Postranní sloupec je jeden na celý web**: osnova článku měla 180 + 72,
  oddíly úvodní stránky 172 + 48. Dvaatřicet pixelů, které nikdo
  nepojmenuje, ale při přechodu z úvodu na článek je vidět, že se
  stránka pohnula. Teď jsou to tatáž čísla.

### A co se tím uvolnilo

Karty na stránce cen byly po sjednocení 1 136 px široké, ale obsah
v nich zůstával v levé polovině:

* **Ceny po krajích** — třináct krajů pod sebou v pruhu 560 px, vedle
  nich 576 px prázdna. Teď dva sloupce po 560; pár „kraj — číslo"
  zůstane sevřený (to byl původní důvod té meze) a karta se využije.
* **Jak rychle nabídky mizí** — čtyři údaje ve třech sloupcích, takže
  čtvrtý visel sám na druhém řádku. Teď čtyři sloupce, jedna řada.

Stránka `cena-pozemku.html` se tím zkrátila z **3 359 na 2 813 px**
(o 16 %), aniž by z ní cokoli zmizelo.

### Zkoušky

**97 neprohlížečových** a **102 prohlížečových** kontrol z CI zelených.

Jedna poznámka k poctivosti měření: první běh dávky hlásil osmnáct
pádů v řadě. Nebyla to regrese — běžely dvě dávky najednou a praly se
o port 8310 (`EADDRINUSE`). Po úklidu a čistém běhu je zelená celá.

## 3br. Stránka pozemku na monitoru: dva sloupce — a tři vady, které to vytáhlo na světlo — *13. 10.*

Byla to poslední stránka mimo společnou svislici: jeden vystředěný
sloupec 720 px, který na 1440px okně začínal na **376 px**, zatímco
hlavička a všechny ostatní stránky na 152.

### Co se udělalo

Obal má teď míru stránky a obsah si čtecí míru (720 px) nese sám.
Vpravo tím zbylo místo, které velké realitní weby používají na jednu
věc: **cenu, která zůstane na očích i po odrolování k popisu**. Cenový
blok dostal v js/pozemek.js vlastní nádobu (`.pz-bok`) — mřížka umí do
sloupce posadit jen souvislý prvek, dva sourozence z různých míst stromu
do jednoho připnutého pruhu nespojí. Na telefonu má ta nádoba
`display:contents`, takže se tváří, že tam není, a **pořadí bloků
zůstalo do puntíku takové, jaké bylo**.

Vedlejší nález při tom: `#pz-detail > *{grid-column:1}` je selektor
s ID a přebil `.pz-bok{grid-column:2}` — cenový pruh skončil v levém
sloupci nad mapou. Pravidlo musí mít tutéž váhu, tedy taky přes ID.

### Tři vady, které se tím vyloupnuly

**1. Vložený styl se na ukončené stránky nedostával.** Ukončená stránka
se schválně nepřepisuje celá (obsah nabídky už neplatí a má zůstat).
Jenže `<style>` není obsah, je to vzhled — a tak **167 stránek** viselo
na starém rozvržení, dokud nezestárnou a nesmažou se. Ohlásil to
`test-vlozeny-styl` hned, jakmile se v předloze změnila míra obalu.
Styl se proto migruje i tam, jako skripty a předvykreslení — a čistí se
od komentářů stejně jako u živé stránky.

**2. Ukončené stránky stahovaly celá data — 639 kB místo 12 kB.**
Stránka pozemku si nese ostrůvek `window.PK_POZEMEK={…,"r":"data/okres/
blansko.json"}` a podle něj sáhne po ŘEZU svého okresu. Na ukončených
stránkách se ale ostrůvek octl **až za** blokem skriptů (ten se vkládá
na místo prvního vyjmutého skriptu, a to je nad ním). Když skript běžel,
proměnná ještě neexistovala, takže použil zálohu: `data/opportunities.json`.
Naměřeno `test-data-stranky`, jakmile se mu do vzorku dostala ukončená
stránka. Pořadí se teď rovná i tudy.

**3. Dvě zkoušky stály na prazích, které zestárly s daty.**
* `test-cisla-okresu` chtěl „aspoň 60 dlaždic podle typu". Po dávce dat
  13. 10. jich bylo 55 — ne proto, že by se něco pokazilo, ale protože
  v okresech ubyly dražby a exekuce. Práh, který se hýbe s daty, nehlídá
  web, ale náladu trhu. Počítá se teď, kolik dlaždic má z dat vzniknout,
  a porovnává se to s tím, kolik jich na stránkách je (**55 ku 55**).
  Ověřeno sabotáží: po vypnutí dlaždice exekucí v generátoru hlásí
  „42 ku 55".
* `test-ceny` bral okresy od **12** nabídek, kdežto model počítá
  percentil z okresu až od **25** (`PK_CENY.DOST_NABIDEK`) — pod tím
  sáhne po kraji. Zkouška si tak mohla vybrat okres, pro který model
  vlastní hladinu nemá, a porovnávala tutéž křivku se sebou: Česká Lípa
  82 % vs Brno-město 83 %, tedy opačně, než má vyjít. Práh se srovnal
  s modelem a navíc se ověřuje, že oba percentily opravdu stojí na
  vlastním okrese (`uroven === 'okres'`).

### A tři věci, které spadly až na hotovém

**`test-stabilita`: CLS 0,0556 proti dovoleným 0,05.** Mřížku jsem
nejdřív dal na obal `.pz-wrap` a `#pz-detail` nechal `display:contents`.
Vypadalo to správně, ale obal s `display:contents` zmizí z toku, takže
se po dojetí písem přepočítávala celá mřížka i s patičkou pod ní
(naměřeno: `FOOTER [850/50→0/0]`). Mřížka přímo na `#pz-detail` je
o vrstvu jednodušší — a CLS je zpátky na nule. Ověřeno obojí:
s vypnutou mřížkou zkouška prošla, s mřížkou na obalu padala.

**`test-parametry`: mezera 93 px, která na stránce nebyla vidět.**
Zkouška měří odstupy mezi bloky stránky a bere je jako přímé děti
jednoho obalu. Jenže cenový blok se přestěhoval do `.pz-bok`, který má
na telefonu `display:contents` — tedy nemá vlastní rozměr. Zkouška ten
blok přeskočila a mezeru mezi jeho sousedy naměřila jako jednu velkou.
Měří teď to, co je VIDĚT: obaly s `display:contents` se rozbalí.

**`test-shoda` padala na stavu trhu, ne webu.** Tvrdila „v datech je
podíl se známou velikostí" — a v dávce z 13. 10. nebyl ani jeden
spoluvlastnický podíl se zlomkem do 1/2, známou výměrou, cenou
a parcelním číslem. Zkouška teď řekne, že neměla co měřit, a mlčí;
zbytek měří dál. (Třetí případ téhož druhu v jednom dni — spolu
s prahem dlaždic a prahem okresů u cen.)

### Zkoušky

**104 neprohlížečových** a **104 prohlížečových** kontrol zelených.
Obě chyby, které předtím shodily CI (`testy` i `v-prohlizeci`), jsou
opravené u kořene, ne obejité.

## 3bs. NA PŘÁNÍ (pokračování): jedna stupnice odstupů — osmnáct vymyšlených hodnot pryč — *13. 10.*

Tohle není nález z obrazovky, ale ze zdroje. Hledal jsem v mobilním
auditu, co kde přetéká, a při tom se ukázalo něco horšího než
přetečení: **odstupy na webu neměly žádnou soustavu.**

### Co se naměřilo

V `css/styles.css` bylo 29 různých hodnot odstupu, z toho **18 mimo
jakoukoli stupnici** — 3, 5, 7, 9, 11, 13, 15, 18, 22, 26, 30, 34, 38,
42, 44, 50, 52 a 128 px, celkem **77 výskytů**. Ve vložených stylech
a v `style="…"` na ručních stránkách a v generátorech dalších **32**.

Na obrazovce je rozdíl mezi 18 a 20 px nepostřehnutelný. Problém není
vidět, je v hlavě: **když má odstup libovolnou hodnotu, nejde se při
psaní stylu o nic opřít** — každé nové místo si vymyslí vlastní číslo
a po pár měsících má web 29 druhů mezery, kterou nikdo neumí
pojmenovat. Proto ty hodnoty vznikly: ne rozhodnutím, ale doladěním
jednoho místa bez ohledu na ostatní.

### Stupnice

Po dvou px dole, kde je rozdíl vidět, po čtyřech a osmi nahoře, kde
už ne:

```
0  1  2  4  6  8  10  12  14  16  20  24  28  32  40  48  56  64  80  96  128
```

1 px je vlasová linka (rámeček, podtržení), ne odstup. Hodnoty uvnitř
`var(--x, 85px)` jsou rozměry — výška hlavičky — a nepočítají se.

Všech 109 výskytů mimo stupnici je přepsaných na nejbližší hodnotu,
která v ní je. Největší posun je 2 px, většina 1 px — nic se
nepřeskládalo, jen se to dá od teď číst.

### Dva vedlejší nálezy, které z toho vypadly

**Poznámky pod nadpisy stály 2 px vedle.** `.okr-more` měla
`margin:12px 2px 0` a stejný stranový posun měly čtyři vložené styly.
Mobilní sonda to změřila jako třetí svislici obsahu: **0, 20 a 22 px**
místo dvou. Na pěti typech stránek — ceny, kraje, okresy, dražby,
novinky — se tedy jedna věta pod nadpisem lišila o 2 px od všeho
ostatního. Stranový posun je pryč, svislice jsou dvě.

**Porovnávací tabulka nepřetéká — MYLNÝ NÁLEZ.** Sonda ohlásila
`.por-tab 21..793` na 390px okně, což vypadalo jako 772px tabulka
vystrčená ze stránky. Doměřeno: `document.scrollWidth` je 390 =
`clientWidth`, tabulka sedí v `.por-tab-obal` s `overflow-x:auto`
a prvním přilepeným sloupcem. Chyba byla v sondě, ne na webu — sonda
hlásila každý prvek, který kouká z okna, i když ho drží posuvný
kontejner. Opraveno v sondě; **na webu nebylo co opravovat.** Žádná
z 32 kontrolovaných stránek dokument nepřetéká.

### Pojistka

`scripts/test-odstupy.mjs` čte stylopis, ruční stránky (vložený styl
i `style="…"`) a generátory HTML — 83 souborů — a padne na každé
hodnotě mimo stupnici, s číslem řádku. `build-og.mjs` je venku a je
u toho napsané proč: kreslí náhled pro sdílení 1200×630 px, kde jsou
odstupy ve vlastní soustavě.

Ověřeno sabotáží: do `.okr-more` jsem vložil `margin:17px` a zkouška
ohlásila `css/styles.css:4268  17px  margin:17px 2px 0`. Po vrácení
zase zelená.

V komentáři zkoušky je napsané to hlavní: **když nový odstup do
stupnice nepatří, nepřidávej ho tam** — vyber nejbližší hodnotu, která
tam je. Stupnice má cenu jen potud, pokud se nerozšiřuje.

## 3bt. NALEZENO: zkouška dotykových terčů měřila 5 stránek z 32 — na zbylých bylo pět terčů pod mezí — *opraveno 13. 10.*

Ten samý mobilní audit. `scripts/test-dotyk.mjs` existuje dávno a mez
má správnou — **44 px, tedy normu, ne slevu z ní**, a je u toho
napsané, proč tam dřív stála 36. Jenže měřila `index.html`,
`pridat.html`, `pozemky-okres-tabor.html`, `kontakt.html`
a `hlidani.html`. **Pět stránek z třiceti dvou.**

Doměřeno sondou se stejnou logikou (stejné selektory, stejná mez,
stejný terč u zaškrtávátek) na všech ručních stránkách:

| terč | rozměr | stránka |
|---|---|---|
| „Přidat druhého prodávajícího" | 211×33 | kupni-smlouva-pozemek.html |
| „Přidat druhého kupujícího" | 191×33 | kupni-smlouva-pozemek.html |
| zaškrtávátko „Zástavní právo" | 292×22 | kupni-smlouva-pozemek.html |
| „Odhlásit" | 42×44 | muj-inzerat.html |
| „Otevřít mapu" | 130×39 | porovnani.html |

**Pět terčů, a ani jeden na stránce, na kterou se ta zkouška kdy
podívala.** Mez byla pravdivá, jen slepá — čtvrtý případ téhož druhu
za dva dny (práh dlaždic, práh okresů u cen, existence podílu u shody).

### Příčina u kořene, ne pět záplat

Tři z pěti mají jednu příčinu: **`.btn-primary` ani `.btn-secondary`
neměly `min-height` vůbec.** Výška vycházela z 10px odsazení a řádku,
tedy 39 a 41 px, a jakmile někde kleslo písmo nebo odsazení
(`.sml-akce .btn-secondary` má 13px/10px), spadl terč na 33. Výška
tlačítka je součást tlačítka, ne výsledek odsazení — obě teď mají
`min-height:44px` a `.btn-primary` k tomu zarovnání na střed, aby
text uprostřed té výšky seděl.

Zbylé dva:

- **Zaškrtávátka u kupní smlouvy.** Terč je celý `<label>`, ne 20px
  vstup uvnitř — a `.sml-volba` byla 22 px vysoká. Teď 44.
- **„Odhlásit" na mém inzerátu.** Výška se tu kdysi spravila
  (`@media (pointer: coarse)` → `min-height:44px`), **šířka ne**: pod
  480 px se skrývá text a zůstane jen ikona, takže terč měl 42×44.
  Mez platí pro obě strany.

### Pojistka

Seznam stránek v `test-dotyk.mjs` je rozšířený z 5 na **34** — všechny
ruční stránky a po jedné z každého druhu vyrobených (okres, kraj,
rozpočet, rozcestník); mezi sebou se liší jen daty.

Ověřeno sabotáží dvakrát, protože první kolo jednu opravu nevrátilo
a tím ji nedokázalo:

- Vráceny tři opravy → zkouška ohlásila `211×33`, `191×33`, `292×22`
  a `42×44` s názvy stránek.
- Vrácena zvlášť jen `.btn-primary` → zkouška ohlásila
  `130×39 .btn-primary „Otevřít mapu" · porovnani.html`.
- Po vrácení oprav zase zelená, obojí.

## 3bu. NALEZENO: dvanáct půlpixelových velikostí písma — a pravidlo, které je nemohlo vidět — *opraveno 13. 10.*

Třetí věc ze stejného auditu, a stejného druhu: `test-typografie.mjs`
hlídá, že **se žádné dvě velikosti písma neliší o jediný pixel** — s tím,
že platí jen od 20 px výš, protože pod tím jsou sousední hodnoty
(12/13/14) chtěné a smysluplné. To je správná úvaha. Jen má dno:
v té dovolené oblasti sedělo

- **12,5 px** — 7× (nabídka v hlavičce, odznak na kartě, štítky, poznámka
  u ověření, poznámka u parametru, poznámka u historie ceny, „skryté" na
  mapě),
- **13,5 px** — 4× (místo na kartě, místo a podtitul ve výpisu,
  soukromí a předvyplnění u kupní smlouvy),
- **14,5 px** — 1× (vložený styl v `predloha.html`).

Mezi 12 a 13 tedy byla třetí velikost o půl pixelu, a mezi 13 a 14 taky.
**Půlpixel nikdo nerozhodl** — takhle se dolaďuje jedno místo, když se
někomu zdá 12 malé a 13 velké, a kdo pak přidává pravidlo, opíše to dál.
Pravidlo o jednom pixelu to nezachytilo, protože hlídá rozdíl **rovný
jednomu** a až od dvaceti.

Velikost písma je od teď **celé číslo pixelů**: 12,5 → 13, 13,5 → 14,
14,5 → 15. Posun o půl pixelu, nic se nepřeskládalo.

**Relativní velikosti tím nejsou dotčené** a je to v komentáři napsané:
`.ext-ikona` má `font-size:0.9em`, protože šipka ↗ má růst s písmem
svého odkazu — vyjde z toho 11,7 px a mobilní sonda to ohlásila jako
drobný text. Je to jedna dekorativní značka s `aria-hidden`, ne
velikost v soustavě. Zůstává.

### Pojistka

Nová věta v `test-typografie.mjs`: „velikosti písma jsou celé pixely
(půlpixel je vždycky nehoda)", se seznamem souborů u každé hodnoty.
Hned při prvním spuštění našla **dvanáctou** velikost, kterou jsem ve
stylopisu minul — `14.5px` ve vloženém stylu `predloha.html` —
protože měří všechny živé stránky, ne jen `css/styles.css`.

Ověřeno sabotáží: 13px zpátky na 12,5px → `✕ velikosti písma jsou celé
pixely … 12.5px`. Po vrácení 7 v pořádku, 0 chyb.

## 3bv. Řádkování po desetinách: 28 hodnot → 9, a každý krok má svou práci — *13. 10.*

Čtvrtá osa téže soustavy. Řádkování bylo psané od ruky stejně jako
odstupy: **28 různých hodnot na 190 deklarací** —

```
0.82  0.92  0.95  1  1.03  1.04  1.05  1.1  1.12  1.15  1.18
1.2  1.22  1.25  1.3  1.35  1.4  1.45  1.5  1.55  1.58  1.6
1.62  1.65  1.68
```

Mezi 1.5 a 1.55 je na šestnáctipixelovém písmu **0,8 px na řádek**.
To nikdo nepozná — a nikdo to taky nerozhodl. Takhle se doladí jedno
místo, protože se tam text zdál hustý, a kdo pak přidává pravidlo,
opíše hodnotu od sousedního. Nejlepší důkaz: `body` měl `1.58`,
a vedle něj existovalo `1.5`, `1.55`, `1.6`, `1.62`, `1.65` a `1.68`.
Šest způsobů, jak napsat „normální text".

### Stupnice

Po desetinách, a **každý krok má svou práci** — to je ten rozdíl mezi
stupnicí a seznamem čísel:

| krok | na co |
|---|---|
| **0.9** | velké číslice na dlaždicích (aby blok nebyl zbytečně vysoký) |
| **1** | jednořádkové terče a ikony |
| **1.1** | velké nadpisy |
| **1.2** | podnadpisy |
| **1.3** | krátké věty na kartě |
| **1.4** | rozhraní a popisky |
| **1.5** | běžný text |
| **1.6** | text na čtení — odstavce, články, pravidla |

Přepsáno **83 deklarací v 7 souborech**. Nadpisový trs (1.03 / 1.04 /
1.05) a podnadpisový (1.12 až 1.25) se sjednotily **úmyslně** na 1.1
a 1.2, ne zaokrouhlením: stejná práce má mít stejnou hodnotu. Zbytek
je nejbližší krok na stupnici, při remíze nahoru — víc vzduchu se čte
lépe.

`build-og.mjs` je venku ze stejného důvodu jako u odstupů: kreslí
náhled pro sdílení 1200×630 px s písmem 96 px, kde `1.03` dává smysl
a se stupnicí stránky nemá co dělat.

### Pojistka

Nová věta v `test-typografie.mjs`: „každé řádkování je na stupnici
(9 kroků po desetinách)", se jmény souborů u každé hodnoty mimo.
Měří se jen řádkování **bez jednotky** — `line-height:44px` je výška
řádku pro vystředění ikony, ne řádkování textu.

Hned při prvním spuštění zkouška ohlásila, že na 2 101 stránkách
pozemků je pořád `1.15`, `1.45`, `1.55` a `1.62` — správně, protože
jsem ještě nepřestavěl a ty stránky si nesou vložený styl z
`pozemek.html`. Po `node scripts/oprav.mjs` zelená.

Ověřeno sabotáží: `1.6` zpátky na `1.55` → `✕ každé řádkování je na
stupnici`. Po vrácení 8 v pořádku, 0 chyb.

## 3bw. Vrstvy (z-index): 29 čísel beze soustavy — pořádek je teď vypsaný a hlídaný — *13. 10.*

Pátá osa. Ve stylopisu bylo **29 různých hodnot z-indexu**: −1, 0, 1, 2,
3, 4, 5, 20, 21, 40, 41, 45, 90, 91, 100, 450, 500, 590, 600, 900, 1100,
1200, 1300, 2500, 3000, 4000, 5000.

Čísla sama nejsou chyba. Chyba je, že **nikde nestálo, co je nad čím
a proč**, takže kdo přidával vrstvu, napsal číslo o kus větší než to, co
mu právě překrývalo panel. Takhle vzniklo 4000 vedle 5000 vedle 2500.

### Co jsem NEUDĚLAL a proč

**Nepřečísloval jsem je.** Přečíslovat vrstvy znamená změnit, co je nad
čím, a to se zkouškou spolehlivě neověří: překryv nastává jen
v určitých okamžicích — otevřená nabídka nad otevřeným našeptávačem nad
mapou, hlášení nad modálním oknem, závoj při kreslení výběru. Mám 201
kontrol a ani jedna nepokrývá všechny páry. Měnit pořadí naslepo
a doufat, že se to nikde neprojeví, je přesně to, co tu dvě stě
kontrol má zabránit.

Čísla tedy zůstávají, jak jsou. Pořadí se nezměnilo ani o pixel.

### Co jsem udělal

Pořádek je **vypsaný na jednom místě** — tabulka v `css/styles.css`,
kde má každá hodnota jméno a práci: od našeptávače (20) přes vysunutou
nabídku (91), ovladače nad mapou (500–600), hlavičku (1100), vysouvací
vrstvy (1200–1300), modální okno (3000) a hlášení (4000) až po
celoobrazovkové překrytí (5000). Místní pořadí uvnitř součástky
(−1 až 9) se vědomě nehlídá: tam jde o to, jestli je odznak nad fotkou,
ne o pořádek na stránce.

### Pojistka

`scripts/test-vrstvy.mjs` (nová, v CI) hlídá tři věci:

1. vypsaný pořádek je **rostoucí** — tabulka sama je platné pořadí,
2. ve stylopisu ani na ručních stránkách **není jiné číslo** než
   vypsané (nad místní hranicí 9),
3. **žádná vypsaná vrstva není mrtvá** — co je v tabulce, se používá.

Třetí bod je tam proto, aby tabulka nezůstala pozadu za webem: kdyby
někdo vrstvu zrušil a tabulku nechal, zkouška to ohlásí.

Ověřeno sabotáží jedním zásahem: `z-index:900` → `999` shodilo **obě**
kontroly — `✕ žádný není mimo vypsaný pořádek` (999 v tabulce není)
a `✕ žádná vypsaná vrstva není mrtvá` (900 se tím přestalo používat).
Po vrácení 4 v pořádku, 0 chyb.

## 3bx. Zbylé osy soustavy: průhlednost, vlasová linka, čas nájezdu — a jeden poctivý negativní nález — *13. 10.*

Šestá a poslední osa. Tři věci, které svou zkoušku neměly, a jedna
věc, u které se ukázalo, že chyba nebyla, kde jsem ji čekal.

### Průhlednost: osm hodnot zapsaných dvakrát

24 hodnot `opacity` — a **osm z nich byla táž hodnota dvěma způsoby**:
`.42` vedle `0.42`, `.45` vedle `0.45`, a stejně `.5`, `.6`, `.7`,
`.75`, `.8`, `.85`. To nepozná ani oko, ani hledání: `grep opacity:0.85`
našel **tři z devíti** míst.

Je to přesně ta vada, na kterou už `test-typografie` hlídá prostrkání
(„.03em vedle -0.03em se nepozná") — a která je tam i vysvětlená.
Jen u průhlednosti nikdo nehlídal. Zápis je teď jeden (s vedoucí
nulou, 21 míst přepsáno) a hodnoty leží na **dvacetinové mřížce**:
krok 0,05 je nejmenší rozdíl, který na ploše ještě jde poznat. Mimo
mřížku bylo 0.085, 0.12, 0.14, 0.32, 0.42 a 0.78 — devět výskytů.

### Vlasová linka: 1,6 px vedle 1,5 px

1 px (217×), 1.5 px (19×), 2 px (13×), 3 px (7×) — a jedno **1.6 px**
u šipky v nabídce. Šestnáct setin pixelu vedle patnácti nikdo
nerozhodl. Dovolené jsou čtyři šířky a každá má svou práci: 1 linka,
1,5 obrys ovladače, 2 zaměření, 3 barevný pruh na kartě.

### Čas: NEGATIVNÍ NÁLEZ, a pak jeden skutečný

Začal jsem s tím, že „trvání má 29 různých hodnot". **Po doměření to
není pravda tak, jak to vypadalo.** `transition:` mělo surové trvání
na **jediném místě z celého stylopisu** — všude jinde už brala
přechody čas z tokenů `--cas-rychly`, `--cas-zakladni`,
`--cas-pomaly`. Zbylých 28 čísel byly **animace**, a tam je rozdíl
skutečný:

- radar na mapě pulsuje 2,6 s, pink 1,7 s, třpyt 1,4 s — to je rytmus,
  ne doba nájezdu,
- tři obláčky na pozadí mají 14, **18** a 16 s **záměrně různě**, aby
  se nesesynchronizovaly,
- `.reveal` má žebřík zpoždění 0.09 / 0.18 / 0.27 / 0.36 s — jedna
  soustava (0,09 × n), ne čtyři náhody.

Nic z toho se sjednocovat nemá a nesjednotilo se.

**Co je ale skutečný nález:** rodina **nájezdů a odezev** — „panel se
objevil", „číslo se přepočítalo", „karta odletěla". Jedna a tatáž
práce, a devět trvání: .12, .14, .2, .26, .3, .34, .42, .45, .5. Osmnáct
míst je teď na třech tokenech. Nejhezčí jednotlivost: fajfka po
odeslání inzerátu měla `animation:asxCheck .35s … .45s` — kreslí se po
kolečku a čekala 0,45 s, protože kolečko trvalo 0,5. Teď čeká
`var(--cas-pomaly)`, tedy přesně dokud se kolečko kreslí: **„začni, až
to druhé skončí" místo dvou čísel, která si musí odpovídat.**

### Pojistka

`scripts/test-soustava.mjs` (nová, v CI) hlídá šest věcí: zápis
průhlednosti s vedoucí nulou, průhlednost na mřížce, čtyři šířky
linek, žádné surové trvání v `transition`, žádné v nájezdových
animacích — a **že žádná vypsaná výjimka není mrtvá.** Deset animací
s vlastním rytmem je v seznamu `VLASTNI_CAS`, každá s napsaným
důvodem, a zkouška ověří, že ta animace opravdu existuje; bez toho by
se ze seznamu výjimek stalo smetiště.

Ověřeno sabotáží jedním zásahem naráz — `opacity:.85`, `opacity:0.72`,
`border:1.7px`, `animation:locOvIn .2s` — a zkouška ohlásila všechny
čtyři s čísly řádků (710, 825, 1426, 3147). Po vrácení 6 v pořádku,
0 chyb.

### A ještě jedna věc, kterou našel projekt sám na mně

Commit `8d9415c105` shodil v CI `testy`, a bylo to poučné:
`test-chybova-hlaska` je metazkouška, která hlídá, že **každá zkouška
na svém `::error::` řádku jmenuje, co padlo** — jinak se z přehledu CI
nedá nic vyčíst. Moje nová `test-vrstvy.mjs` psala jen obecnou radu.
Ohlásila to slovy „bez hlášky: test-vrstvy.mjs".

Opraveny tři: `test-vrstvy`, `test-soustava` a `test-odstupy` (ta
`::error::` neměla vůbec). Teď říkají například:
`::error::Odstupy: 1 mimo stupnici. Co padlo: css/styles.css:4316 13px`.

## 3by. NALEZENO: řádky textu měly 91 až 187 znaků — čtecí sloupec existoval a nebyl použitý — *opraveno 13. 10.*

Tohle je ten nejpodstatnější nález z celé kompozice, protože se **nedá
poznat ze snímku.** Délka řádku je jediná typografická míra, která se
dá splést s velkorysostí: čím širší sloupec, tím „vzdušněji" návrh
vypadá — a tím hůř se čte. Nad devadesát znaků oko na konci řádku
ztrácí, kde začít další, a čte tentýž řádek dvakrát. Čitelné optimum
je 60–75.

### Změřeno

Monitor 1440 px, 33 stránek, střední šířka znaku změřená v canvasu
**v tom písmu, které ten odstavec má** (ne odhad z font-size):

| stránka | medián | maximum |
|---|---|---|
| na-co-mam-pozemek | **183** | 187 |
| cena-pozemku | **179** | 187 |
| pozemky-stredocesky-kraj | 172 | 186 |
| pozemky-okres-tabor | 164 | 173 |
| nove-pozemky | 138 | 143 |
| moje-data | — | 180 |
| data | 83 | 170 |
| uzemni-plan-pozemek | 95 | 96 |
| kolik-stoji-koupe-pozemku | 94 | 97 |
| …a dalších 12 rádcovských stránek | 90–92 | 94–100 |

Nejhorší jednotlivost: **poznámka pod metodikou cen — 13px písmo přes
1136 px šířky, tedy 187 znaků na řádek.** Dvakrát a půl víc, než se dá
číst. Text rádcovských a právních stránek měl 720 px při 16 px, tedy
91 až 98.

### Příčina: token existoval, jen nebyl použitý

`--m-text:62ch` je v paletě odjakživa a byl použitý na **dvaceti
místech** — `.sources-four`, `.faq-item p`, `.add-hero .sub`,
`.om-pozn` a dalších. Jen ne na textu, který se opravdu táhl. Tohle
tedy není nové rozhodnutí o vzhledu; je to **dotažení toho starého**
na jedenáct dalších selektorů: `.rules-note`, `.okr-more`, `.gc-pozn`,
`.dt-cisla`, `.md-pozn`, `.rules-sect > p`, `.rule-list > li`,
`.sml-seznam > li`, `.por-prazdno p` a `.wrap > p`.

(Pátý případ téhož druhu za dva dny: práh dlaždic, práh okresů u cen,
existence podílu u shody, pět stránek z třiceti dvou u dotykových
terčů — a teď token, který existoval a nebyl použitý.)

### Proč 62ch a ne pixely

`ch` i `em` se počítají z písma **toho prvku**, na kterém jsou. Jedna
hodnota tím dává stejný počet znaků u 13px poznámky (484 px) i u 16px
odstavce (595 px). V pixelech by to musela být dvě různá čísla, která
si nikdo neudrží a která se při změně velikosti písma rozejdou.

`max-width` je **strop, ne šířka**: krátký odstavec se nezúží
a zarovnání vlevo se nemění, takže svislice obsahu z bodu 3bq zůstává,
kde byla.

### Po opravě

| | před | po |
|---|---|---|
| medián | 51–183 | **72–85** |
| maximum | 187 | **89** |
| odstavců nad 90 znaků | 160 | **0** |

### Pojistka

`scripts/test-mira.mjs` (nová, v CI, prohlížečová) měří délku řádku na
26 stránkách s dlouhým textem. Strop je **90** — není to optimum (to
je 75), je to hranice, za kterou čtení měřitelně trpí; mediány po
opravě sedí na 80, takže mez má rezervu a nepadne na jednom slově
navíc.

Zkouška má i **předpoklad o sobě**: kdyby se stránky nenačetly nebo se
změnila značka odstavců, hlásila by „všechno v pořádku" a přitom by se
na žádný odstavec nepodívala. Proto padne, když změří méně než 100
odstavců nebo méně než 15 stránek. (Teď měří **305 odstavců na 26
stránkách**.)

Ověřeno sabotáží: celé pravidlo čtecího sloupce ze stylopisu pryč,
přestavět — zkouška spadla a vypsala `187 znaků .rules-note (13px,
1136px) · cena-pozemku.html` a dalších šest. Po vrácení zelená.

### A hned nato ta zkouška našla vadu v sobě samé

Commit s čtecím sloupcem shodil v CI `v-prohlizeci` — a shodila ho
**ta nová zkouška**, kterou jsem právě napsal: `.okr-more` na
`pozemky-do-500-tisic.html` mělo **91 znaků**, zatímco místně mi
vyšlo 89. Dva různé výsledky na témže kódu.

Příčina nebyla sazba, byl to **závod**. Inter je vlastní webfont
(`fonts/inter-latin*.woff2`). Dokud se nenačte, kreslí prohlížeč
v záložním Arialu — a canvas, kterým zkouška měří střední šířku znaku,
taky ještě Inter nezná, takže naměří Arial. Ten je širší, takže
vychází o dva až tři znaky víc, a kdy přesně se font načte, je jinak
místně a jinak v CI. Zkouška teď čeká na `document.fonts.ready`, ne na
čas.

**A pak jsem šel dál, protože mě ten nález dovedl k něčemu
podstatnějšímu.** I po opravě metody vycházelo nejhorší místo na 89
znaků — tedy **jediný znak** pod stropem 90. Jeden znak není rezerva:
stačí jiné slovo a pojistka se překlopí. A 89 znaků je i tak za
hranicí 75, kde se text čte nejlépe. Token `--m-text` je proto
**56ch místo 62ch** (`ch` je šířka nuly, ne střední šířka znaku —
nula je v Interu širší než průměrné písmeno, takže 56ch vyjde na ~72
opravdových znaků, ne na 56):

| | 62ch | 56ch |
|---|---|---|
| medián | 80 | **73** |
| nejhorší | 89 | **81** |
| rezerva do stropu 90 | 1 znak | **9 znaků** |

Mediány teď sedí v optimu 60–75, kam od začátku měly.

## 3bz. NALEZENO: 95 stránek mělo přeskočenou úroveň nadpisu — a jedna si nesla patičku, kterou nikdo jiný nemá — *opraveno 13. 10.*

Poslední věc z kompozice, a jediná, která je **doslova** „logické
uspořádání": osnova nadpisů. Nadpisy nejsou velikost písma, jsou
**obsah**. Podle nich se po stránce pohybuje čtečka pro nevidomé (skok
na další oddíl) i vyhledávač, který z nich bere, o čem stránka je. Když
osnova přeskočí úroveň, čtečka ohlásí „oddíl třetí úrovně" tam, kde
žádný druhý není.

### Změřeno: 95 z 2 064 živých stránek

**1. Krajské a okresní výpisy: `h1 → h3 → h2`** (91 stránek, plus výpis
dražeb a rozcestník podle okresů). Blok s odkazem na mapu —
„Prohlédněte si okres Tábor na mapě" — stál hned za h1 a měl h3.
První skutečný oddíl stránky (h2, „Nabídky pozemků v okrese Tábor") se
tím tvářil jako **nadřazený** tomu, co bylo nad ním. Osnova šla
1 → 3 → 2.

Příčina: nadpis v tom bloku byl **vždycky** h3, protože blok obvykle
stojí uvnitř oddílu — na `cena-pozemku`, `nove-pozemky` nebo
`drazby-pozemku` je h3 správně. Jen na čtyřech typech stránek stojí
jako první věc za titulkem. **Úroveň určuje osnova stránky, ne vzhled**
— selektor je teď `:is(h2, h3)` a vypadá to stejně, takže značka smí
jít za osnovou.

**2. Úvodní stránka: `h2 → h4`, a to osmnáctkrát.** Každý pojem ve
slovníčku byl `<summary><h4>` pod oddílem h2 „Nevyznáte se v pojmech?".
Na vzhled to nemělo vliv ani před opravou — `.gl-item summary h3` má
`font:inherit`, tedy bere písmo od `<summary>`.

**3. `pozemek-od-obce.html`: `h3 → h5`** — a tenhle nález byl
nejzajímavější, protože ta přeskočená úroveň byla jen **příznak**.

### Jedna stránka si nesla starou patičku

Hledal jsem, odkud se na jedné stránce vzalo h5, a našel jsem, že
`pozemek-od-obce.html` je **jediná živá stránka na webu, která má ještě
starou sloupcovou patičku**: značku s claimem, tagline, tři navigační
sloupce („Produkt", „Rádce", „Právní") a hlavičky sloupců v h5. Všech
ostatních 2 063 živých stránek má jednoduchou patičku — copyright a tři
právní odkazy.

Zůstala tam při úklidu patiček (bod ze seznamu „Odebrat patičku") a dva
měsíce si nikdo nevšiml, protože vypadá dobře — jen jinak než celý
zbytek webu. Teď má tu samou patičku jako všechno ostatní (1 385 znaků
→ 728) a osnova je 1,2,2,…,2,3.

**Mrtvý styl z toho nevznikl, a je to ověřené:** `test-mrtve-styly`
zůstala zelená, protože `.foot-grid`, `.foot-col`, `.foot-brand-col`
a `.foot-tag` dál potřebuje **69 archivních stránek** — ty se záměrně
negenerují znovu a drží si podobu z doby, kdy nabídka platila.

### Po opravě

| | před | po |
|---|---|---|
| stránek s přeskočenou úrovní | **95** | **0** |
| živých stránek bez jednoho h1 | 0 (po odečtení doložených) | 0 |

### Pojistka

`scripts/test-osnova.mjs` (nová, v CI) čte 2 064 živých stránek
(5 609 nadpisů) a hlídá dvě věci: **právě jeden h1** a **žádná
přeskočená úroveň**. Archiv přeskakuje — stránka ukončené nabídky se
záměrně nepředělává.

Čtyři stránky h1 ve značkách mít nemají a mají **doloženou výjimku**:
`pozemek.html` (předloha, h1 vkládá `js/pozemek.js`), `inzerce.html`
a `pozemky-od-lidi.html` (přesměrování), `predloha.html` (vzorník,
ukazuje podobu h1 jako exponát). **Výjimka se nevěří na slovo:**
zkouška u každé ověří, že značka, kvůli které výjimka je, na stránce
pořád je.

### A jeden omyl mé vlastní sondy, který stojí za zapsání

První sonda hlásila, že **úvodní stránka má dva h1**. Nemá. Nad tím
nadpisem stojí komentář, který začíná slovy „Jediný `<h1>`, co úvodní…"
— a sonda počítala i ten. Zkouška proto komentáře, `<script>` i
`<style>` **vybílí** (ne smaže, aby čísla řádků dál ukazovala na
opravdový řádek). Zkouška, která hlásí chyby, jež na stránce nejsou, je
horší než žádná: přestane se jí věřit.

Ověřeno sabotáží dvakrát:

- jeden pojem ve slovníčku zpátky na h4 → `✕ žádná nepřeskočí úroveň`,
- v `pozemek.html` přepsána značka `PK_POZEMEK` → `✕ výjimka tvrdí
  „h1 vkládá js/pozemek.js", ale značka PK_POZEMEK na stránce není`.

Po vrácení obojího 3 v pořádku, 0 chyb.

## 3ca. NALEZENO: mapa webu měla 2 051 adres a u žádné datum — a „doplnit polícko" by bylo horší než nic — *opraveno 14. 10.*

`sitemap.xml` měla u každé adresy `changefreq` a `priority`, a u žádné
`lastmod`. **Google `changefreq` ignoruje** — píše to ve své
dokumentaci — a řídí se `lastmod`. Vyhledávač tedy neměl z čeho poznat,
která z dvou tisíc stránek se dnes změnila. U webu, kde se data
obnovují čtyřikrát denně, to je zrovna ta jediná informace, která tam
patří.

### Proč to není „doplnit polícko"

Nejsnazší by bylo napsat všude datum sestavení. Jenže to by znamenalo
tvrdit, že se každý den změnilo všech 2 051 stránek — a to není pravda.
**Takový `lastmod` se vyhledávač naučí přehlížet** a mapa webu pak
neříká nic, i když vypadá bohatěji. Datum proto musí být pravda o té
konkrétní stránce, a každý druh stránky má svůj zdroj:

| co | odkud datum | proč
|---|---|---|
| 2 102 stránek pozemků | **z archivu** — den, kdy se nabídka objevila (`first_seen`), nebo kdy se naposled změnila cena | obsah stránky se mění přesně tím |
| 91 krajských a okresních výpisů, druhy, rozpočty, dražby | **den datové dávky** | vypisují nabídky, mění se s každou dávkou |
| 30 ručních stránek (rádce, právní, kontakt) | **den, kdy se změnil jejich obsah** | mění se, jen když je někdo přepíše |

Datum se bere ze **stejného archivu** jako historie ceny na stránce
pozemku, ne z `mtime` souboru: každé sestavení přepíše všech 2 102
stránek, takže `mtime` je vždycky dnešní u všech.

Výsledek: **31 různých dat**, nejčastější 2026-09-14 u 1 561 adres (den,
odkdy archiv vidí trh), nejnovější dnešní u 124.

### Dvě vady, na které mě přivedly zkoušky

**1. Rozbil jsem generátor a šest zkoušek to naráz ohlásilo.** Datum
jsem nejdřív přidal tak, že jsem místo jmen souborů začal do seznamu
hotových stránek dávat objekty `{soubor, lastmod}`. O pár řádků níž se
ten seznam používá jako `new Set(hotove)` k poznání, které stránky na
disku už v datech nejsou — a objekty se jménům nerovnají. Generátor
proto **označil za ukončené všech 2 102 stránek**. Hlásily to
`test-oprav`, `test-nabidka-pro-stroje`, `test-stranky-pozemku`,
`test-nove-pozemky`, `test-ukonceno` a `test-vyhledavac`. Datum jde
teď vedle, v samostatné mapě.

**2. `test-oprav` odhalila, že datum z gitu není reprodukovatelné.**
Ruční stránky jsem nejdřív datoval podle `git log -1 --format=%cs`.
Ta zkouška zkopíruje repozitář do dočasné složky, pustí tam generátory
a porovná výsledek — a v kopii žádný `.git` není, takže se datum
nevyplnilo a mapa webu se rozcházela. Je to správný nález, ne
nepohodlí zkoušky: **výstup generátoru nesmí záležet na tom, jestli
stojí v klonu.**

Datum ručních stránek se proto drží v `data/zmeny-stranek.json` vedle
**otisku obsahu** té stránky. Při sestavení se otisk přepočítá: liší-li
se, stránka se opravdu změnila a datum je dnešní; neliší-li se,
zůstává staré. Soubor se commituje, takže v dočasné kopii vyjde totéž.
Z otisku se vyřezávají verzovací přívěsky `?v=…` — ty se mění, kdykoli
se změní jakýkoli styl, a to není změna *téhle* stránky; jinak by se po
každé úpravě stylopisu rozsvítilo třicet dat naráz.

Ověřeno: dvě sestavení za sebou dají **týž otisk** `sitemap.xml`
i `zmeny-stranek.json`.

**3. A ještě jedna zkouška byla příliš doslovná** — `test-nove-pozemky`
hlídala `nove-pozemky.html</loc>\s*<changefreq>daily`, tedy že ty dvě
značky stojí hned za sebou. Vložené `<lastmod>` to rozbilo. Hlídá teď,
co měla hlídat od začátku: že je ta stránka ohlášená jako denně se
měnící.

### Pojistka

`scripts/test-mapa-webu.mjs` (nová, v CI) nehlídá, že tam datum **je**,
ale že **nelže**:

1. každá adresa má `<lastmod>` (bloky se čtou celé, ne po značkách —
   jinak by prošel i stav, kdy jedna adresa má data dvě a druhá žádné),
2. je zapsané jako `YYYY-MM-DD`,
3. není z budoucnosti,
4. data nejsou všechna stejná,
5. **a nejčastější z nich není dnešní** — tedy mapa webu nevydává
   sestavení za změnu.

Pátý bod je ten podstatný a je **bez libovolné mezní hodnoty**: neříká
„nejvýš tolik procent", říká „nevydávej sestavení za změnu".

Ověřeno sabotáží třikrát: datum sestavení všude → padnou kontroly 4 a 5
(`všech 2051 adres má 2026-10-14`); jedné adrese datum pryč → padne 1
s její adresou; datum 2027-01-01 → padne 3 se jménem stránky. Po
vrácení 6 v pořádku, 0 chyb.

## 3cb. NALEZENO: šest pražských stránek tvrdilo obec, která neexistuje — *opraveno 14. 10.*

Měřil jsem, jestli web nevystavuje nesmyslné ceny. **Nevystavuje** —
rozsah 5 Kč/m² u orné půdy až 23 000 Kč/m² u pražských stavebních
parcel je věrohodný, žádná cena za korunu ani v miliardách. Při tom
měření ale vypadlo něco jiného: mezi 1 024 místy stojí **názvy ulic**.

### Změřeno

V okrese Praha je **23 nabídek** a jejich místa jsou:

```
Praha | Ke Korunce | Devonská | Na Chvalce | Borovská | Ibišková | Na Kindlovce
```

Šest ze sedmi jsou **ulice**. Titulek i nadpis z toho skládaly

> Stavební pozemek 778 m² — **Ibišková, okres Praha**

tedy tvrdily obec, která neexistuje. Kdo hledá pozemek v Praze, takový
titulek nenajde; kdo ho najde, přečte si z něj nepravdu.

**Není to dohad.** Zdrojové adresy inzerátů jsou tvaru
`…/prodej-pozemku-ke-korunce-praha` — portál sám ulici a město
rozlišuje, jen do pole obce posílá ulici.

### Oprava

Pravidlo platí **právě a jen pro okres Praha**, protože tam je obec
vždy Praha. Jinde je `place` opravdu obec a nemění se nic. Nadpis teď
čte město, pak ulici:

> Pozemek 10 442 m² — **Praha, Ke Korunce**

a „okres Praha" se nepřidává, protože Praha už v tom řádku je.

**Data se nemění**, a je to v komentáři napsané proč: `place` je
v klíči pozemku i v názvu souboru (`pozemek-praha-devonska-…`), takže
přepsat ho by znamenalo zahodit adresy, na které už vedou odkazy.
Mění se jen to, co stránka říká — titulek, nadpis i popisek pro
vyhledávač, všechny z jedné funkce `mistoFraze()`.

### Pojistka

`scripts/test-misto-prahy.mjs` (nová, v CI) hlídá obě strany: že se
u Prahy skládá „Praha, ulice", a že se **mimo Prahu nic nerozlilo** —
že tam nadpis pořád jmenuje okres a nikde se neobjeví „okres Praha".
Má i předpoklad o sobě: padne, kdyby v datech žádná pražská nabídka
s ulicí nebyla, protože pak by všechny kontroly prošly naprázdno.

Ověřeno sabotáží: pravidlo vypnuto → `✕ vyšlo „Devonská, okres Praha"`
a `✕ pozemek-praha-borovska-wgv9wp.html (h1): „Borovská, okres Praha"`.

### A dvě chyby, které si ta zkouška napsala sama na sebe

Při prvním spuštění ohlásila **šest chyb, které na webu nejsou**:

1. Vzor `^pozemek-praha-` bere i **Prahu-východ a Prahu-západ** — a to
   jsou opravdové okresy s opravdovými obcemi (Jirny, Jevany, Hrusice).
   Navíc `okres Praha` se shoduje s předponou `okres Praha-východ`.
   Obojí je teď vyloučené: ve vzoru i v hledání (`Praha(?![-\wÀ-ž])`).
2. Čekala okres v nadpisu u **všech** stránek mimo Prahu a ohlásila
   „22 z 34". Jenže okres v titulku **ustupuje záměrně**, když se
   nevejde do meze délky — to je napsané u `slozTitulek`. Chyba byla
   v mém očekávání, ne na webu.

Oba omyly jsou v komentáři zkoušky zapsané, protože jsou poučné: vzor
na jméno souboru je tak dobrý, jak dobře zná výjimky, a kontrola, která
nezná záměr, hlásí jako chybu právě ten záměr.

## 3cc. NEGATIVNÍ NÁLEZ: 68 294 vnitřních odkazů a ani jeden rozbitý — a pojistka na to, ať to tak zůstane — *14. 10.*

Pojistku na rozbité vnitřní odkazy web neměl, tak jsem ji chtěl
napsat — a nejdřív změřil, co by našla:

| | změřeno | rozbitých |
|---|---|---|
| vnitřní odkazy (`href`, `src`) | **68 294** | **0** |
| odkazy na kotvu (`#oddil`) | **6 613** | **0** |

Na 2 064 živých stránkách. **Nic k opravě.** Zapisuju to, protože
negativní nález je taky nález: kdybych to neuvedl, vypadalo by to, že
jsem pojistku psal zbytečně — a ona zbytečná není.

### Proč tu ta pojistka přesto je

Rozbitý odkaz je vada, která vzniká **ticho**: někdo přejmenuje
stránku, generátor ji přestane vyrábět, zruší se oddíl s `id` — a odkaz
na ni zůstane. Nic nespadne, nic se nerozsvítí; jen člověk, který na
něj klikne, skončí na 404 nebo na stránce, která neodskočí tam, kam
slíbila. Při 2 064 stránkách a 68 tisících odkazech to ručně neuhlídá
nikdo, a přitom je to jedna z mála vad, kterou lze ověřit **úplně** —
ne na vzorku, ale na všem. Trvá to 1,3 s.

`scripts/test-vnitrni-odkazy.mjs` (nová, v CI). Co se vědomě neměří
a proč, je v jejím komentáře: cizí adresy (síť do CI nepatří a na
zdroje dat má web vlastního hlídače), obsah `<script>` a komentářů
(tam bývají ukázky, ne odkazy ke kliknutí), archiv ukončených nabídek
(záměrně se nepřegenerovává) a kotva na stránku, která sama neexistuje
(hlásí to první kontrola, ať se jedna vada nepočítá dvakrát).

Ověřeno sabotáží: v `kontakt.html` jsem odkazu na podmínky přidal
jedno „y" do jména souboru a kotvě `#mapa` jedno „a" — zkouška oboje
ohlásila i s tím, odkud ten odkaz vede.

(A hned nato našla druhou vadu, tentokrát v tomhle textu: `test-staticka`
hlídá, že **dokumentace nejmenuje soubory, které neexistují**, a já tu
původně ten přepsaný název napsal jako cestu. Správný nález — do
dokumentace nepatří jméno, které v repozitáři nic nemá, i když je
myšlené jako ukázka chyby.)

## 3cd. NALEZENO: česká uvozovka se zavírala rovnou — 52 párů z 63 — *opraveno 14. 10.*

Přečetl jsi první stránku a chválíš text. Šel jsem se tedy podívat na
to, co se na textu dá změřit — a našel jsem vadu, kterou čtenář
nepojmenuje, ale vidí ji.

### Změřeno

Na 2 064 živých stránkách:

| | počet |
|---|---|
| otevíracích `„` (U+201E) | 63 |
| zavíracích správných `"` (U+201C) | **10** |
| párů zavřených **rovnou** `"` | **52** |

Levá uvozovka je dole, jak se v češtině patří — a vpravo visí kolmá
čárka jako z psacího stroje: „Obvyklá" cena, „Cena do", „jak stojí
a leží", „nic tam není". Na dvaceti stránkách, nejvíc na cenách
pozemků a na stránce s daty.

Jedno místo zavíralo dokonce **entitou** `&quot;` — v prohlížeči to
vypadá stejně, ve zdroji se to hledá jinak, a hrubé hledání znaku `"`
ho mine.

### Oprava je v kroku sazby, ne v textech

`scripts/sazba.mjs` už existuje právě pro tuhle třídu věcí — zavírá
jednopísmenné předložky nezlomitelnou mezerou a drží číslo s jednotkou
pohromadě. Má v komentáři napsané proč: *„pravidlo musí platit i pro
generované stránky a pro text, který teprve někdo napíše. Jedno místo,
jedno pravidlo."* Uvozovka patří tam.

**Pravidlo je úzké schválně:** rovná uvozovka se změní na `"` jen
tehdy, když je nějaká `„` otevřená. Rovná uvozovka, před kterou nic
otevřeno není, se nechá být — může to být palec (`1"`), citace kódu
nebo cokoli, o čem sazba nic neví. Ověřeno na pěti případech, mezi
nimi `<pre>` (nesází se vůbec) a dva samostatné odstavce (uvozovka
jednoho nepokračuje do druhého).

Stav se drží **přes značky**, protože uvozovka běžně obklopuje odkaz
nebo zvýraznění („Jak tahle čísla **počítáme**"), a zahazuje se na
blokové značce: kdyby se někde zapomnělo zavřít, nesmí to otrávit
zbytek stránky.

Po opravě: **63 otevíracích, 63 zavíracích, nula vadných, žádná
stránka s nepárovou uvozovkou.**

### Pojistka

Rozšířená `test-sazba` — je to pravidlo téže sazby, tak patří do téže
zkoušky. Tři nové věty: uvozovek je z čeho brát (63 párů), žádná se
nezavírá rovnou, a na žádné stránce nezůstala nepárová.

Ověřeno sabotáží dvakrát: jedna zavírací `"` zpátky na rovnou →
`✕ index.html: …„bez elektřiny"…` a zároveň `✕ otevíracích 2,
zavíracích 1`; smazaná zavírací uvozovka → `✕ data.html: otevíracích
13, zavíracích 12`.

### A jeden tvrdý nález navíc: otisk právních stránek

Oprava uvozovek shodila `test-pravni-stranky`. Ta zkouška drží **otisk
znění** zásad soukromí a podmínek, aby nikdo nezměnil text bez toho,
že upraví „Poslední úprava" — dobrá pojistka. Jenže teď chtěla, abych
to datum upravil kvůli **jednomu znaku za tiskárnu.**

To by byla lež: podmínky se nezměnily. Správná oprava není v datu, ale
v otisku — **má sledovat, co je napsáno, ne jak je to vysázeno.**
Všechny podoby dvojité uvozovky (včetně `&quot;`) se proto před
otiskem sjednotí.

Než jsem nové otisky zapsal, **ověřil jsem znak po znaku**, že se
znění obou stránek proti předchozímu commitu nezměnilo ani o slovo:
`ZNĚNÍ SHODNÉ — změna byla jen v sazbě`. Datum zůstává „říjen 2026".

A že pojistka nepřestala platit, je ověřené taky: po změně jedné věty
v podmínkách zkouška hlásí `otisk a2f5132c5e74e5b0 ≠ zapsaný`.
(První pokus o sabotáž byl naprázdno — vybral jsem frázi „jak stojí
a leží" a nenašel ji, protože po sazbě je v ní nezlomitelná mezera.
Málem jsem z toho usoudil, že je pojistka rozbitá; byla to moje
záměna, ne její vada.)

## 3ce. NALEZENO: text, který se skládá až v prohlížeči, českou sazbou nikdy neprošel — 116 zlomů ze 4 713 řádků — *opraveno 14. 10.*

Oprava uvozovek (3cd) ještě doběhla a hned ukázala další díru. Doplnil
jsem do sazby nezlomitelné mezery do čísla, datumu, za `§` a za „č."
a změřil v prohlížeči, kolik řádků se opravdu láme na špatném místě.
Na 22 rádcovských a právních stránkách ve dvou šířkách (8 042 řádků)
to bylo **15 zlomů**: jedenáct rozlomených datumů na
`nove-pozemky.html` při 390 px („13." na konci řádku, „10." na
dalším), jedna cena „2 / 000 Kč" a jeden „zákon č. / 480/2004".
`§` se při tom neobjevil na konci řádku ani jednou — tahle část je
pojistka, ne nález, a je to tak i napsané.

Pak jsem stejnou sondu pustil na stránky **pozemků**. A tam to bylo
jiné číslo: **116 zlomů ze 4 713 řádků, tedy 2,5 %** — stejný řád jako
celá původní vada s předložkami, kvůli které krok sazby vůbec vznikl.

### Proč: stránka pozemku se celá nevykresluje na serveru

Dvě různé příčiny, obě téhož druhu — sazba běží nad HTML, ale ten text
v HTML není:

1. **Datové ostrůvky.** Popis inzerátu a čtyři výpisy leží
   v `<script type="application/json">` a do stránky je vkládá
   prohlížeč. Krok sazby obsah `<script>` **záměrně přeskakuje**
   (jsou tam skripty, ne věty) — takže se v 1 628 popisech našlo
   **10 466 jednopísmenných předložek s obyčejnou mezerou a nula
   s nezlomitelnou**, plus 4 718 čísel s jednotkou a 190 rozlomitelných
   tisíců.
2. **Věty skládané v JS.** „Obvyklá cena v okolí do 25 km", „Cena
   vychází o 80 % pod obvyklou", „sítě a příjezd" nevznikají na serveru
   vůbec — skládá je `js/ceny.js` a `js/pozemek.js` z vlastních
   řetězců.

Nejnázornější byl tenhle případ: ve statickém HTML stálo
`všechny pozemky v<NBSP>okrese` **správně**, a hned pod tím v JSON
ležela tatáž věta s obyčejnou mezerou — a JS tím správně vysázený
seznam přepsal. **Sestavení odvedlo práci a prohlížeč ji zahodil.**

### Oprava datových ostrůvků: chirurgicky, ne odhadem

V `sazba.mjs` se ostrůvky přečtou jako JSON, sází se **jen řetězcové
hodnoty**, a zapíšou se zpátky v téže podobě, jakou píšou generátory
(`&`, `<`, `>` jako `\u00XX`). Že je přepis chirurgický, není dohad:
**10 314 z 10 314 ostrůvků** se bez sazby vrátí **znak za znak
totožné**, takže se mění právě a jen to, co se vysázelo. Adresy
a cesty se vynechávají, čísla a stavba dat se nedotknou. Uvozovky se
tu **nesázejí**: v JSON je rovná uvozovka řídicí znak, a popis inzerátu
je navíc cizí text — nezlomitelná mezera je typografie, přepsaná
uvozovka už zásah do znění.

### Oprava vět z JS: do kopie pro prohlížeč, ne do zdroje

Sází je očištění skriptů (`minifikace.mjs`), které už umí JavaScript
rozebrat na kusy, takže řetězce od kódu, vzorů a komentářů rozliší
samo. Uvnitř `${…}` se nesahá na nic — to je výraz, ne text.

Sází se do `js/min/*.js`, které si stránky opravdu berou, **ne do
zdroje**. Ne že by ve zdroji nezlomitelná mezera nebyla — je jich tam
devadesát, napsaných rukou u cen a oddělovače tisíců. **Právě proto:**
je to neviditelný znak, a devadesát ručních výskytů je zrovna ta míra,
při které se na jednadevadesátý zapomene. Po opravě je v kopiích
630 místo 90.

### Jak se pozná věta od dat — a co to měření rozhodlo

Tohle byla jediná opravdu nebezpečná část, tak jsem ji nenechal na
dohadu a vypsal si **všechny** navržené změny:

* **jen diakritika** — bezpečné, ale vynechalo by „v okrese",
  „v prodeji", „v exekuci";
* **bez podmínky** — změnilo by navíc 24 úseků a **tři by rozbilo**:
  `viewBox="0 0 384 240"`, dvě SVG cesty („M0 120H") a seznam
  výplňových slov našeptávače;
* **platí tedy: diakritika, nebo aspoň dvě slova a žádná číslice.**
  Číslice vyřadí všechnu kreslicí geometrii — `viewBox` ani cesta se
  bez ní neobejde.

Po tom zbyla jediná výjimka, kterou pravidlo poznat nemůže: seznam
výplňových slov našeptávače je česká věta bez číslic, jen se nečte,
ale **dělí** — `.split(' ')` na literální mezeru, takže nezlomitelná
mezera by z „v" a „ve" udělala jedno slovo. Je zapsaná jmenovitě
a `test-minifikace` hlásí, kdyby zmrtvěla.

### Výsledek

| měřeno v prohlížeči | zlomů na špatném místě |
|---|---|
| před opravou | 116 ze 4 713 řádků |
| po osazení datových ostrůvků | 69 z 5 049 |
| po osazení vět z JS | **0 ze 4 549** |

A na 22 rádcovských a právních stránkách z 15 taky nula.

### Pojistky — a jedna, kterou mi sabotáž rozmetala

`test-sazba` dostala čtyři kontroly (rozlomené tisíce, rozlomené
datum, `§` a „č.", a předpoklad „je z čeho brát" — 21 148 čísel,
715 datumů, 728 paragrafů). Všechny čtyři jsem prokázal sabotáží
a každá pojmenuje stránku i místo.

`test-minifikace` dostala **čtyři pasti**, a ty tam jsou kvůli
vlastnímu nálezu: napsal jsem nejdřív počítadlo „kolik nezlomitelných
mezer v kopii přibylo" a při sabotáži, kdy jsem hlavní pravidlo vypnul
úplně, **prošlo** — mezery přibyly z okrajů u sčítání řetězců
(`'… do ' + R + ' km'`). Zkouška se tedy ptala na následek, ne na
pravidlo. Pasti se ptají přímo: věta se osadit **musí**, kreslicí
geometrie a seznam výplňových slov **nesmí**. Obě sabotáže (mrtvé
pravidlo, zrušená podmínka číslice) teď padnou na pasti.

Při té sabotáži vyšlo najevo ještě něco malého a protivného: hlášení
pasti vypisovalo dva řádky, které vypadaly **úplně stejně** — rozdíl
byl jeden neviditelný znak. Hlášení, které člověk nepřečte, je
polovina hlášení, takže se nezlomitelná mezera ve výpisu ukazuje jako
`·`.

### Co se neopravilo

* `test-ukonceno` hlídala, že datum je psané pro lidi, vzorem
  s **literální** mezerou — a nezlomitelná mezera ji shodila. To je
  tatáž past jako u otisku právních stránek: zkouška měla pravdu
  o smyslu a mýlila se o zápisu. Vzor teď bere obě mezery; datum
  zůstalo lidské.
* Pět předložek v popisech inzerátů zůstává s obyčejnou mezerou —
  stojí za čárkou **bez mezery** („pole,z 80 %"). Sazba vyžaduje
  vlevo hranici slova, a tahle hranice v tom cizím textu chybí.
  Pět míst z 10 466 a vada je v inzerátu, ne v sazbě.
* „za 1 měs." se nespojuje: jednotka `měs.` v seznamu není. Zlom
  se na ní v měření ani jednou neobjevil, tak jsem seznam nerozšiřoval
  jen podle dohadu.

## 3cf. A co ta oprava stála: osm zkoušek mělo pravdu o smyslu a mýlilo se o zápisu — *14. 10.*

Sazba do textu skládaného v prohlížeči (3ce) měla následek, který jsem
měl předvídat a nepředvídal: **osm zkoušek porovnávalo vykreslenou
českou větu přes literální mezeru.** Jak jen v té větě stála
jednopísmenná předložka, přestalo to sedět.

| zkouška | co nesedělo |
|---|---|
| `test-ukonceno` | vzor na lidské datum `\d{1,2}\. \d{1,2}\. \d{4}` |
| `test-stranky-pozemku` | jméno obce „Čistá **u** Horek" |
| `test-cerstvost` | `/dnes v 7:00/` |
| `test-ceny-hledani` | `/v nabídce/`, `/nemáme v nabídce/` |
| `test-mapa-pozemku` | nadpis „Sítě **a** vybavení", `/z textu inzerátu/` |
| `test-okoli` | `/u obce \s*\S/` |
| `test-poznamky` | `/k vašemu účtu/` |
| `test-vyhodna-cena` | odznak „cena **k** ověření" |
| `test-rychly-prohlizec` | `/z (\d+)/` v hlavičce — a to je vlastní kapitola |

### Oprava je na místě čtení, ne v každém vzoru

U prvních dvou jsem látal vzor. Pak mi došlo, že to je špatně
položená otázka: zkouška se ptá na **slova**, ne na tvar mezery.
Takže se mezery sjednotí **už tam, kde se text ze stránky čte** —
jedno `.replace(/\s+/g, ' ')` a všechny kontroly pod tím jsou odolné.
`\s` v JavaScriptu nezlomitelnou mezeru zahrnuje, takže to nic
nestojí. U `test-mapa-pozemku` to bylo vidět nejlíp: `chips` se
takhle čtou odjakživa, a právě proto ta jediná kontrola nepadla.

### Jedna kaskáda, která vypadala jako rozbitý web

`test-rychly-prohlizec` nespadl na kontrole, ale na
`page.click: Timeout 30000ms exceeded`. Řetěz byl tenhle:

1. hlavička říká „Karta 3 **z** 20" a sazba tam správně vloží
   nezlomitelnou mezeru,
2. zkouška z ní čte velikost dávky vzorem `/z (\d+)/` — s obyčejnou
   mezerou, takže nenajde nic a `davka` vyjde **nula**,
3. smyčka `for (i = 0; i < davka + 1; i++)` tedy stiskne **jednu**
   šipku místo jedenadvaceti,
4. dávka nikdy nedojede, konec se nevykreslí, tlačítko „Projít
   dalších 20" nikdy nevznikne,
5. klik do něj po třiceti sekundách vyprší.

Z jednoho vzoru pět kroků, a na konci hlášení, které o příčině
neříká nic. **Web byl celou dobu v pořádku.**

### Jak jsem to hledal — a jedna slepá ulička

Postup: dávka to ohlásila, zopakoval jsem to samo (takže ne výpadek),
pak jsem **vrátil `js/min` před svou změnu** — 45 z 45 v pořádku —
a s vysázenými kopiemi spadlo. Tím bylo prokázané, že je to **můj**
regres a ne cizí. Po souborech vyšlo, že je to `js/min/main.js`.

Slepá ulička: v `js/main.js` je záložní datová tabulka a v ní
`extra:'v exekuci'`, ze kterého sazba udělala `'v exekuci'`.
Vypadalo to jako jistá příčina — vysázená **data**, ne text. Ověřil
jsem to a je to planý poplach: `extra` se nikde neporovnává
s literálem, prohání se funkcí `daysUntil()`, která z něj zkouší
vyčíst datum, a nezlomitelná mezera na tom nemění nic. Zapisuju to
sem schválně: byl to nejpravděpodobnější podezřelý a nebyl to on.

### Co z toho zůstává jako poučení

Sázet řetězce v kódu je bezpečné jen do té míry, do jaké jde poznat
text od dat — a poznat to **podle tvaru** nelze úplně. Dnešní
pravidlo („diakritika, nebo dvě slova a žádná číslice", plus
jmenovitá výjimka) prošlo přes 1 398 řetězců a nerozbilo ani jeden,
což je změřené, ne odhadnuté. Ale je to pravidlo s předpokladem,
a ten předpoklad je napsaný u `jeVeta` v `scripts/minifikace.mjs`,
ať je po ruce tomu, kdo tam bude přidávat další.

## 3cg. Hledání něčeho viditelného: pět měření, pět negativních nálezů — *14. 10.*

Po sazbě jsem šel hledat něco, co bude na první pohled vidět. Zapisuju
to sem celé, i když z toho **nevzešla ani jedna oprava**, protože
příště to nemá nikdo měřit znovu — a protože tři z pěti „nálezů"
nebyly vady webu, ale rozhodnutí, která tenhle web už jednou udělal
a napsal si proč.

**1. Obrys parcely na snímku (vedl jsem si ho jako otevřený bod).**
Není to vada. `js/snimek.js` to má napsané: čtverec o skutečné výměře
tam byl a je pryč, protože na leteckém snímku působil jako obrys
parcely, a ten nemáme — je v katastru. Dřív se na mapě kreslil
pětiúhelník, jehož tvar vycházel z `Math.sin(poradiVPoli…)` a plocha
v mediánu na **58 % skutečné výměry**. Hlídá to `test-obrys.mjs`.
Opravdový obrys je dostupný jen jako vrstva „Hranice parcel" z ČÚZK,
a ta v detailní mapě je.

**2. Vata na stránkách pozemků.** Změřeno na 1 928 živých stránkách:
viditelného textu je 1 881 529 znaků a vět, které stojí na víc než
polovině stránek, je z toho **9,9 %** — průměrně 97 znaků z 976 na
stránku, a je to patička a jedna výzva. Stránky přeplácané nejsou.

**3. Váha stránky.** Ze souborů na disku to vypadalo na 1,5 MB u úvodní
stránky. Se skutečným přenosem (gzip, jak to servíruje GitHub Pages)
je to **25 kB HTML + 40 kB stylů + ~90 kB skriptů + 92 kB dat**, tedy
kolem čtvrt megabajtu na mapovou aplikaci s dvěma tisíci body. Dvě
největší data v repozitáři (`okresy-hranice.json` 925 kB,
`popisy.json` 827 kB) si prohlížeč **nestahuje vůbec** — jsou jen pro
sestavení. Není co zeštíhlovat.

**4. Vodorovný přetok na telefonu.** Dvanáct stránek na 390 px:
dokument má všude přesně **390 px**, přetékajících prvků nula. (Čtyři
„nálezy" na stránce pozemku jsou dlaždice leteckého snímku, které se
schválně kreslí šíř a ořezávají.)

**5. Prázdný pravý pás u detailu pozemku.** Změřeno: pás je 527 px
široký, stránka 3 557 px vysoká a cena v něm zabírá 40 px, tedy
**1,1 %**. Vypadalo to jako nevyužité místo — jenže je to záměr
a v `css/styles.css` je u něj napsané proč: velké realitní weby tam
drží jednu věc, cenu, která zůstane na očích i po odrolování. U téhož
pravidla je i poučení, proč mřížka stojí na `#pz-detail` a ne na obalu
(s obalem naměřila `test-stabilita` CLS 0,0556 proti dovoleným 0,05).

**A jedna věc, kterou jsem si vymyslel ze zmenšeného snímku:** zdálo
se mi, že popisek „Cena za m²" má „m²" jinou barvou. Změřeno
v prohlížeči: všechny popisky mají `rgb(88, 95, 91)`, všechny hodnoty
`rgb(16, 21, 19)`, pozadí bílé. Byl to artefakt zmenšeniny. Mezi
„vidím to na obrázku" a „změřil jsem to" je pořád tentýž rozdíl.

## 3ch. NALEZENO: stránce pozemku zbylo bez JavaScriptu 23 % textu — *opraveno 14. 10.*

Změřeno v prohlížeči s vypnutým JavaScriptem: ze stránky pozemku
zbylo **699 znaků z 3 101**, tedy 23 %, a 2 nadpisy z 8. Pro srovnání
výpis okresu má 100 %, rádcovská stránka 79 %, mapová 51 % (tam je
to z povahy věci).

**Nejdřív oprava mého vlastního závěru.** Vypadalo to, že stránka bez
skriptu nemá nic. Nemá to tak: generátor do ní píše statický
`<article>` se seznamem faktů, srovnatelnými pozemky a rozcestníkem —
506 znaků, a je to tam zdůvodněné. Chyběl v něm ale ten nejdelší
a jediný nezaměnitelný kus textu: **popis od inzerenta**. Ležel jen
v datovém ostrůvku `<script type="application/json">`, odkud ho bere
skript. Pro vyhledávač, který stránku nevykreslí, je to přitom to
jediné, čím se tahle stránka liší od dvou tisíc ostatních.

### Oprava: text jde do HTML, ostrůvek se ruší

Popis teď píše generátor přímo do statického článku
(`<p id="pz-popis-text">`), prohnaný `esc()` — je to cizí text, takže
se do stránky nedostane holá lomená závorka ani uvozovka.
`js/pozemek.js` ho čte odtamtud. Datový ostrůvek se u živých stránek
**ruší**, aby týž text nebyl v dokumentu dvakrát; archiv si ho drží
dál (ukončené stránky se záměrně nepřegenerovávají), a čtení z něj
proto ve skriptu zůstává.

| | před | po |
|---|---|---|
| text bez JavaScriptu | 699 znaků (23 %) | **1 187 znaků (38 %)** |
| nadpisů bez JavaScriptu | 2 z 8 | 3 z 8 |

Na webu: **1 628 z 1 928 živých stránek** má popis v HTML, dohromady
664 247 znaků, průměrně 408 na stránku. Živá stránka se starým
ostrůvkem: **0**. Archivovaných se starým ostrůvkem: 80 — a tak to má
být.

### Co to rozbilo a co se z toho naučilo

Cizí text se tím dostal pod **naše** jazykové kontroly a dvě z nich
hned spadly. Všechny čtyři nálezy byly uvnitř toho, co napsal
prodávající:

* „…o rozlohách 1044m²a 909m²" — chybí mezera, předložka se nedá
  poznat,
* „110 000m2,z 80 % kvalitní pole" — čárka bez mezery,
* „4 pozemků" tam, kde čeština chce „4 pozemky",
* inzerát se dvěma otevíracími uvozovkami a žádnou zavírací.

Opravit to nejde — znamenalo by to přepisovat cizí větu. Vznikl proto
`scripts/cizi-text.mjs`: citace se z jazykových měření **vybílí**
(nahradí mezerami, aby čísla řádků v hlášení zůstala pravdivá), ne
smaže. Typografie na ten text pořád platí: nezlomitelná mezera nic
nepřepisuje, jen nedovolí zlom.

A protože vynechávka je oslabení kontroly, hlídá se i ona:
`test-sazba` počítá, kolik cizích citací na webu je, a pod pěti sty
hlásí chybu. Prokázáno sabotáží v obou směrech — vada v **našem**
textu se přes vynechávku pořád najde, a mrtvá vynechávka se ohlásí.

## 3ci. NALEZENO: 86 dražeb mělo cenu a žádnou platnost — a jak mě při opravě chytil vlastní výstup — *opraveno 14. 10.*

Po nálezu o JavaScriptu (3ch) jsem prošel strukturovaná data, která se
posílají vyhledávačům. Nejdřív co je v pořádku, ať je to poctivě
v obou směrech: **všech 2 222 bloků** se přečte jako JSON, nabídek je
2 003 a všechny mají kladnou cenu v CZK; **cena ve strukturovaných
datech se u žádné stránky nerozchází s cenou ve viditelném textu.**

Nález je jeden: **86 živých stránek s dražbou mělo cenu, ale žádný
údaj o tom, do kdy platí.**

### Proč u dražby chybí „availability" — a proč je to správně

Vypadá to jako opomenutí a sám jsem to tak napoprvé přečetl. Je to
záměr: u dražby by `InStock` byla nepravda, protože pozemek si
nekoupíte, musíte přihodit v termínu. Schema.org nemá hodnotu, která
by dražbu popsala poctivě, tak se raději neuvádí nic. Teď je to
u toho řádku napsané, aby to příště nikdo „neopravil".

Jenže tím zůstávala nabídka strojově platná **navždy**, i když dražba
dávno proběhla. Termín přitom známe — stojí v datech a na stránce
z něj jde odpočet ve výpisu.

### Oprava a jedna past, do které jsem spadl

Do nabídky jde `validThrough` s termínem dražby. Datum čte tentýž
modul jako odpočet (`js/terminy.js`, `auctionYMD`), aby se nedalo
vyčíst dvěma způsoby.

A teď ta past: `auctionYMD` vrací **slepený tvar „20261022"**, ne ISO
datum. Poslal jsem to tam tak, jak to z funkce vypadlo, a vyšlo to na
**všech 86 stránek** — neplatná hodnota. Chytlo to až přečtení
vygenerovaného souboru, ne jméno té funkce. Převod na `2026-10-22` je
proto ve vlastní funkci se zdůvodněním, a zkouška hlídá **tvar**
zvlášť od **přítomnosti**.

Obojí prokázáno sabotáží: slepený tvar i chybějící termín se ohlásí
i s názvem stránky.

## 3cj. Jak je web poskládaný pro vyhledávač: čtyři měření, tři čisté a jedna otázka na majitele — *14. 10.*

Po nálezu s dražbami (3ci) jsem doměřil zbytek téhle rodiny. Zapisuju
i to, co vyšlo dobře, aby to nikdo neměřil znovu.

**Kanonické adresy — čisté.** 2 236 stránek, u všech právě jedna
kanonická adresa, všechny absolutní `https` na téže doméně. Bez
kanonické jsou tři (404, diagnostika, předloha) a všechny tři jsou
`noindex`. Jinam než na sebe ukazují tři a všechny tři jsou záměrné
přesměrovací patníky po starých adresách.

**Doména souhlasí všude.** Mapa webu, `og:url`, kanonické adresy,
`robots.txt` i kanály — všude `https://www.parcelaka.cz`, bez jediné
výjimky.

**Hloubka od úvodní stránky — nejvýš tři kliknutí.** 1 stránka v nule,
30 na první úrovni, 456 na druhé, 1 570 na třetí, a dál už nic.
**Ani jedna adresa z mapy webu není odkazem nedosažitelná.** Sedm
živých stránek nemá statický odkaz odnikud a všech sedm je buď
`noindex` (404, diagnostika, předloha, odhlašovací stránka), nebo
patník po staré adrese; `porovnani.html` otevírá appka z uložených
pozemků, takže ji statický průchod odkazů ani vidět nemůže. To je
mez téhle metody a patří ji přiznat.

**Mimo mapu webu je 13 živých stránek** a dvanáct z nich je `noindex`,
tedy správně. Třináctá (`pozemky-praha-kraj.html`) je indexovatelná,
ale má kanonickou adresu na okresní stránku — Praha je okres, ne kraj,
takže by to byla tatáž stránka dvakrát. Kombinovat `noindex`
s kanonickou adresou se naopak nedoporučuje (jsou to protichůdné
pokyny), takže tenhle tvar je v pořádku.

### A jedna věc, kterou odsud rozhodnout nejde

**V repozitáři není soubor `CNAME`** a nikdy nebyl. Vlastní doména je
tedy nastavená jen v nastavení GitHub Pages. Dokud se na nastavení
nesáhne, funguje to; při přepnutí způsobu nasazení ale bývá tohle
přesně to, co tiše spadne, a v repozitáři o doméně není ani řádka.

Přidat `CNAME` je oprava na jeden řádek — jenže **špatný řádek shodí
web**, a já odsud nepoznám, jestli je nastavená doména `parcelaka.cz`,
nebo `www.parcelaka.cz`. Celý web (kanonické adresy, mapa webu,
`og:url`) mluví o `www`. **Pro majitele:** v nastavení repozitáře →
Pages stojí jedna z těch dvou; stačí ji říct a soubor doplním.

## 3ck. NALEZENO: devět českých písmen kreslilo systémové písmo uprostřed slov — *opraveno 14. 10.*

Z měření skutečného načtení stránky vypadlo, že `inter-latin.woff2` se
stahuje **před** událostí `load`, kdežto `inter-latin-ext.woff2` **až
po ní**. A v tom druhém souboru leží zrovna **č ď ě ň ř š ť ů ž**.

Změřeno v prohlížeči: **9 znaků z 19 kreslilo náhradní písmo.** Na
českém webu to znamená dvě písma v jednom slově — „pří**š**tí" mělo tři
znaky z Interu a jeden ze systémového.

### Příčina není v tom souboru, ale v tom, kdy dojede

Nejdřív jsem podezíral podřezání písem: že se při zužování ztratily
glyfy. Ověřil jsem to tak, že jsem oba soubory načetl mimo stylopis
a změřil přímo z nich — **ext soubor má všechny české glyfy**, od `ě`
po `Ř`. Dokumentace ve `fonts/PUVOD.md` nelhala.

Vadilo tohle: stránky přednačítaly (`<link rel="preload">`) jen latinku.
Rozšířenou si prohlížeč objednal až při vykreslování, nestihla okno —
a protože je u obou `font-display: optional`, prohlížeč ji pak
**nepoužil vůbec**. `optional` je přitom správná volba, drží CLS;
chyboval ten chybějící řádek.

| | před | po |
|---|---|---|
| českých znaků v náhradním písmu | **9 z 19** | **0 z 19** |
| stránek s oběma přednačteními | 0 | **2 235** |

Oprava je jeden `<link>` na stránku (16 kB navíc na kritické cestě).

### Pojistka, která tu byla a byla slepá

`test-pisma` hlídal, že stránka přednačítá **nějaké** písmo — a jedno
stačilo. Je to ta nejčastější podoba slepé kontroly: správná, a přitom
vadu mine. Teď se ptá na **oba** soubory jmenovitě.

### A moje vlastní zkouška to musela zkusit třikrát

1. **Šířka proti `sans-serif`.** Ohlásila, že náhradní písmo kreslí
   i znaky, které Inter má. Měření bylo rozbité, ne web.
2. **Obraz glyfu v canvasu.** Vypadalo to neprůstřelně — jenže canvas
   si písmo vyhodnotí ZNOVU a `font-display:optional` v něm neplatí.
   Zkouška prošla i tehdy, když jsem přednačtení schválně odstranil
   ze všech šesti stránek. Sabotáž odhalila slepou pojistku.
3. **Šířka proti TŘEM náhradám** (`monospace`, `serif`, `sans-serif`).
   Když znak kreslí Inter, vyjdou všechny tři stejně; když chybí,
   rozejdou se. Na náhodnou shodu dvou šířek to nenaletí — a právě ta
   mi v druhé podobě vyrobila **vymyšlený nález** (velké `Ě` prý chybí;
   nechybí, Inter má u `E` skoro tutéž šířku jako monospace).

Mezi kontrolními znaky je proto teď schválně i velké `E` a `S`: právě
na nich se ta slepota pozná. Hotová zkouška hlásí sabotáž na všech
osmnácti znacích a na čistém webu nehlásí nic.

## 3cl. Připnutý pruh měl cenu, ale ne akci — a tři sabotáže, které nic nedokázaly — *14. 10.*

Na širokém displeji je od předělávky vpravo **připnutý pruh s cenou**:
roluje se popisem, cena zůstane na očích. Chyběla v něm ale ta jediná
věc, kvůli které se na stránku chodí — **odkaz na nabídku**. „Inzerát"
a „Uložit" ležely v levém sloupci a po odrolování zmizely, takže
rozhodnutí podle ceny v pruhu znamenalo rolovat zpátky nahoru.

Změřeno na 1440×900 (`pozemek-benesov-benesov-1sjtz7b.html`): po
odrolování o 2 200 px byl hlavní odkaz na `top −1 284 px`, tedy
mimo obrazovku, zatímco cena stála na `top 195 px`.

### Proč to nešlo udělat stylem
`.pz-akce-hlavni` a `.pz-bok` jsou **dva různé uzly stromu** a pruh
zabírá `grid-row:1 / span 99`. Mřížka do jednoho připnutého prvku dva
sourozence z různých míst nespojí; `position:fixed` by se při rolování
od ceny odlepil a druhé vykreslení bloku by znamenalo **dvakrát
`id="pz-fav"`** — tedy „Uložit", které se hlásí jen napoprvé.

Řešení je proto přesun **jednoho a téhož uzlu** (js/pozemek.js,
`pripniAkce`), řízený `matchMedia('(min-width:1100px)')`, s komentářem
jako kotvou pro cestu zpátky. Komentář schválně: prázdný `<div>` by
v levém sloupci po přesunu nechal mezeru.

Naměřeno po opravě: 1440 px → akce v pruhu, po odrolování o 2 200 px
`top 256 px` (vidět); 390 px → nic se nezměnilo, pořadí `rádce 749 px
< akce 826 px` jako dřív; 1024 px → mimo pruh; zúžení okna za chodu
vrátí blok pod rádce.

### A teď to podstatné: tři sabotáže, které NIC nedokázaly
Zkoušku jsem po zelené napsal sabotovat — jak se to tady dělá vždycky.
Vyřadil jsem volání přesunu, pak jsem přesun udělal bezpodmínečný, pak
jsem místo přesunu udělal kopii. **Všechny tři sabotáže prošly
17 z 17 kontrol.** Vypadalo to na slepou zkoušku.

Nebylo. Sabotoval jsem `js/pozemek.js` a `css/styles.css` — tedy
**zdroje**. Vygenerovaná stránka pozemku si ale bere `js/min/pozemek.js`
a `css/zaklad.min.css`. Prohlížeč můj vandalismus nikdy neviděl.

Po zopakování na skutečně servírovaných souborech chytla zkouška
všechny čtyři:

| sabotáž (v servírovaném souboru) | spadlo kontrol |
|---|---|
| přesun se nevolá | 2 |
| přesouvá se vždy, i na 900 px | 4 |
| místo přesunu kopie (dvě `#pz-fav`) | 3 |
| pruh se odlepí (`sticky` → `static`) | 1 |

**Poučení, které si tu nechávám napsané:** sabotáž zdroje nedokazuje
nic, dokud zdrojem neprojde `node scripts/oprav.mjs`. Na tomhle webu
se servíruje `js/min/*.js` a `css/zaklad.min.css`, ne to, co edituju.
Málem jsem z toho udělal opačný závěr — že zkouška je slepá — a zahodil
funkční pojistku.

### A ještě jedna cizí pojistka mě chytla při téže opravě
Pravidlo pro pruh jsem napsal do `css/styles.css`. Spadlo
`test-vlozeny-styl.mjs`:

```
pz-btn: width
pz-akce-hlavni: display, gap, margin
(dvě místa pro tutéž vlastnost se rozejdou)
```

Mělo pravdu: `.pz-akce-hlavni` se celá řídí **vloženým stylem**
v `pozemek.html`, takže tytéž vlastnosti by si od té chvíle odporovaly
ze dvou souborů. Pravidlo se proto přestěhovalo k ní a nese jen vlastní
třídu `.pz-akce-v-boku` — žádné `@media`, protože mez 1100 px drží
skript a dvě místa pro touž mez by se zase rozešla.

### Strop na předlohu měl 18 bajtů rezervy
Při stěhování spadla druhá kontrola: `pozemek.html` se má vejít do
40 kB **i s komentáři**, protože je to jediná stránka, která je
zároveň zdroj i servírovaná stránka (generované stránky si komentáře
čistí, viz 3bz). Jenže naměřeno **40 942 B z 40 960** — osmnáct bajtů
rezervy. To není rozpočet, to je zmrazení dnešní velikosti: neprojde
ani jedna věta komentáře.

Co s tím bylo uděláno, a říkám to rovnou, protože zvednout strop kvůli
vlastní změně je podezřelé:
1. Dvě **mrtvá pravidla** pryč (`.g-ok`, `.g-warn` — změřeno, že je
   nevyrábí žádný skript ani generátor): −105 B.
2. Druhé nové pravidlo (`width:100%` na tlačítka) **zrušeno jako
   zbytečné** — v mřížce se prvky do sloupce natáhnou samy; ověřeno
   měřením, šířky zůstaly 306/306 px.
3. Strop zvednut na **41 kB**, s důvodem napsaným přímo u čísla.

Skutečná oprava je jinde a zůstává k udělání: oddělit předlohu od
výstupu, aby i `pozemek.html` servírovala styl bez těch **16,5 kB
komentářů**. Pak může strop spadnout hluboko pod 40.


## 3cm. NALEZENO: na telefonu stálo před prvním pozemkem 634 px ovládání — *opraveno 14. 10.*

Majitel řekl, že na webu nevidí žádnou změnu. Tak jsem se přestal dívat
do kódu a otevřel si úvodní stránku na telefonu 390×844. Naměřeno:

| co | výška |
|---|---|
| lišta | 65 px |
| rozcestník (značka „Parcelka" **podruhé**, nadpis, 6 dlaždic 3×2) | 218 px |
| hledání + přepínač Seznam/Mapa | 135 px |
| nadpis výsledků + řazení | 88 px |
| pruh „Projít … po jednom" + „Stáhnout výběr" | 136 px |
| **první nabídka začíná na** | **y 699 z 844** |

Kdo přišel koupit pozemek, neviděl po otevření ani jeden. A značka
„Parcelka" stála dvakrát pod sebou — v liště a čtrnáct pixelů pod ní
ještě jednou, s písmem 26 px.

Zvlášť se vyplatí podívat se na ten poslední řádek: pruh nástrojů se
**na monitoru** odjakživa smršťoval (`@media (min-width:1041px)`
schovává vysvětlující větu a zmenšuje ikonu), kdežto na telefonu se
zobrazoval celý. Šetřilo se místem přesně tam, kde ho je nejvíc.

### Co se změnilo
1. Druhá značka pryč (`.uvod-logo{display:none}` pod 1040 px). Důvod,
   co u ní byl napsaný — „jediné místo, kde má značka na sebe
   upozornit" — neplatil: tím místem je lišta o 14 px výš.
2. Šest dlaždic ve dvou řadách → **jeden vodorovný pás pilulek** s ikonou
   vedle popisku. Terč má 44 px, tedy mez z `test-dotyk`.
3. Pruh nástrojů se na telefonu smršťuje stejně jako na monitoru.
   Ztrácí se tím věta „Dvacet karet přes celou obrazovku — doprava
   uložit, doleva schovat."; nadpis tlačítka s počtem zůstává a na
   tabletu i monitoru se věta čte dál.

**Naměřeno po opravě: první nabídka na y 505 místo 699 a na první
obrazovce je vidět i cena** (dřív tam nezačala ani karta).

### A černý obdélník místo fotky? MYLNÝ NÁLEZ
Na snímku vypadal náhled u každé nabídky jako nenačtená fotka — velký
skoro černý obdélník. Málem jsem to šel „opravit". Je to SVG s podkladem
`#12241A` a přes něj čtyři dlaždice leteckého snímku ze
`server.arcgisonline.com`; v sandboxu padají na `ERR_TUNNEL_CONNECTION_FAILED`,
takže zbude jen podklad. **Na webu se snímek načte.** Měření: 112
obrázkových požadavků, 48 selhalo, všechny na tunelu proxy.

### Nová zkouška a tři sabotáže
`scripts/test-prvni-obrazovka.mjs` se neptá, jak to vypadá, ale na jednu
věcnou otázku: *uvidí člověk hned po otevření aspoň jednu nabídku i s
cenou?* Sabotáže (opět v **servírovaném** `css/styles.min.css`, ne ve
zdroji — viz poučení v 3cl):

| sabotáž | spadlo kontrol |
|---|---|
| vrátit druhou značku | 2 |
| vrátit dlaždice do mřížky 3×2 | 1 |
| vrátit vysvětlivku do pruhu nástrojů | 1 |

Ta třetí napoprvé **neprošla ani jednou kontrolou**: mez na začátek
první karty je volná schválně a 46 px navíc se v ní ztratilo. Proto
k ní přibyla zvlášť mez na výšku pruhu nástrojů — 110 px, a je to
počítané číslo: 98 dnes, 144 s vrácenou větou.


## 3cn. NALEZENO: výpis měl 460 px při okně 1440 i 1920 — *opraveno 14. 10.*

Druhá polovina téže otázky jako 3cm, jen z druhé strany: **kolik nabídek
je vidět bez rolování.** Naměřeno na úvodní stránce:

| okno | sloupec s výpisem | mapa |
|---|---|---|
| 1440 px | 460 px | 980 px |
| 1920 px | **460 px** | **1 460 px** |

Strop `min(34vw, 460px)` se zarazil už kolem 1 350 px okna. Od té chvíle
rostla jen mapa — o 480 px, tedy o celou šířku dalšího výpisu — a na
obrazovce byla pořád jedna a půl nabídky, ať byl monitor jakkoli velký.
Mapa tím dostala na jednu nabídku víc místa než nabídka sama.

### Co se změnilo
Od 1 600 px si sloupec vezme `min(46vw, 900px)` a karty se do něj
skládají **po dvou**. Mapa má pořád přes polovinu okna.

| okno | sloupec | mapa | celých karet bez rolování |
|---|---|---|---|
| 1440 px | 460 px (beze změny) | 980 px | 1 |
| 1680 px | 773 px | 907 px | 2 |
| 1920 px | 883 px | 1 037 px | 4 |

Dvojice, ne trojice: při třech sloupcích spadne karta pod 280 px
a titulek „Trvalý travní porost 14 272 m²" se láme na tři řádky.

### Zkouška a dvě sabotáže
Přibyla do `scripts/test-prvni-obrazovka.mjs` — je to tatáž otázka, jen
na jiné šířce. Hlídá se **výsledek, ne zápis**: že druhá karta začíná
vpravo od první, ne že v CSS stojí `repeat(2, …)`.

| sabotáž (v servírovaném `css/styles.min.css`) | spadlo |
|---|---|
| strop sloupce zpátky na 460 px | 1 |
| `display:grid` → `display:block` na výpisu | 1 |


## 3co. NALEZENO: vpravo od každého úvodu leželo 571 px prázdna — *opraveno 14. 10.*

Majitel řekl, že spravuju jednu sekci po druhé a že má jít o celý web.
Měl pravdu, tak jsem si místo další sekce změřil **devět vstupních
stránek naráz** v okně 1440 px:

| stránka | nadpis x..x | úvodní odstavec x..x | obsah |
|---|---|---|---|
| cena-pozemku | 152..1288 | 152..717 (565 px) | 1 136 px |
| pozemky-stavebni | 152..1288 | 152..717 | 1 136 px |
| nove-pozemky | 152..1288 | 152..717 | 1 136 px |
| na-co-mam-pozemek | 152..1288 | 152..717 | 1 136 px |
| pozemky-stredocesky-kraj | 152..1288 | 152..717 | 1 136 px |
| drazby-pozemku | 372..979 | 372..937 | 1 136 px |
| podminky | 372..979 | 372..937 | 1 136 px |

Dvě věci naráz:
1. **Vpravo od každého úvodu zbývalo 571 px prázdna** — a bylo to tak
   na celém webu, ne na jedné stránce.
2. **Nebylo to ani jednotné:** sedm stránek sráželo text doleva na
   x 152, dvě ho měly na střed na x 372.

A tvrdá čísla — „239 pozemků", „71 okresů", tedy to jediné, co člověka
z vyhledávače zajímá do první vteřiny — ležela **až pod hlavičkou**,
v dalším oddíle, za zlomem obrazovky.

### Co se změnilo
Hlavička je od 1 040 px **dvousloupcová**: nadpis a úvod vlevo v čtecí
míře, čísla vpravo u okraje obsahu, zarovnaná na spodek úvodu. Pod
1 040 px zůstává všechno pod sebou, jen jsou čísla nově uvnitř pásu
hlavičky, ne pod ním.

Markup se **nepřepisoval v devíti šablonách**. Přesouvá ho jedna funkce
`dvousloupcovaHlavicka()` v `scripts/generate-region-pages.mjs` při
zápisu stránky — šablon je devět, čísla má pět z nich, takže by se
změna psala pětkrát a šestá by se zapomněla. Takhle platí i pro šablonu,
která vznikne příště. **Dopadlo to na 102 stránek.**

Je to **stěhování, ne kopie**: kdyby čísla zůstala i dole, stála by na
stránce dvakrát. A když stránka čísla nemá (rozcestník dražeb), panel
se nevyrobí — prázdný rámeček vpravo by byl horší než prázdné místo.

### Sabotáž našla slepé místo v mé vlastní zkoušce
`scripts/test-hlavicka-stranky.mjs` měří výsledek, ne zápis. Napoprvé
se ptal jen vodorovně: *leží levý okraj panelu za pravým okrajem
odstavce?* Sabotáž „zruš mřížku" tím **prošla** — čísla spadla pod
úvod, ale zůstala u pravého okraje, protože se zarovnávají doprava sama
od sebe. Vodorovně to sedělo, vedle textu to nestálo a uprostřed
hlavičky zela díra přes půl obrazovky.

Přibyla proto svislá podmínka: panel musí začínat **dřív, než úvodní
odstavec skončí**. Teprve pak zkouška chytá všechny tři:

| sabotáž | spadlo kontrol |
|---|---|
| mřížka hlavičky zrušena (`display:grid` → `block`) | 1 |
| přesun v generátoru vypnutý | 2 |
| kopie místo stěhování (čísla zůstanou i dole) | 1 |


## 3cp. NALEZENO: názvy obcí v seznamu se rozjížděly o 78 px — *opraveno 14. 10.*

Naměřeno na `pozemky-stavebni.html`, prvních 14 řádků výpisu: levý okraj
názvu obce měl **tři různé hodnoty — 195, 266 a 273 px**. Pod sebou
stálo „Jizerní Vtelno" na 195 a o dva řádky níž odsazené „Lovosice"
na 273.

Příčina: každý řádek je **vlastní mřížka** a sloupec s odznakem byl
`auto`. Řádek bez odznaku ho zúžil na nulu, s „Dražba" na 71 px,
s „Exekuce" na 78 — a mřížky spolu nemluví, takže je nikdo nesrovná.
Na stránkách s jedním druhem nabídky to vidět nebylo (odznak mají buď
všechny řádky, nebo žádný); vylézalo to přesně na přehledech, kde se
druhy míchají — a těch je většina (stavební: 3 řádky s odznakem z 60).

Oprava je jedno pravidlo a nepotřebovala ani řádek v generátoru:
`.okr-list:has(.okr-badge) .okr-item{grid-template-columns:78px …}`.
Seznam, který odznaky obsahuje, drží sloupec na 78 px (šířka nejširšího
odznaku); seznam bez odznaků si nechává `auto`, tedy nulu, a neplýtvá
místem. `:has()` je tu zavedené — ve stylopisu už bylo osmnáctkrát.

### A potřetí za jeden den tatáž past
Sabotáž „pravidlo pryč" **prošla**. Pak i druhá. Vypadalo to na slepou
zkoušku — jenže jsem zase sabotoval soubor, který si ta stránka nebere.
Tentokrát `css/styles.min.css`, zatímco vstupní stránky čtou
`css/zaklad.min.css`.

Změřeno, ať to příště nemusím hádat — **který stylopis si která stránka
bere:**

| stránka | stylopis |
|---|---|
| `index.html` | `styles.min.css` |
| **všechno ostatní** (pozemek, okres, kraj, druh, rozpočet, ceny) | `zaklad.min.css` |

A je to pohyblivé: `rozdel-styly.mjs` přiřazuje stránky podle toho, jaké
třídy používají, takže se stránka může mezi balíky přesunout, když jí
přibude pravidlo. **Pravidlo pro příště: před sabotáží si v té stránce
přečíst `<link rel="stylesheet">`, ne předpokládat.**

Po zopakování ve správném souboru zkouška chytla obojí:

| sabotáž (v `css/zaklad.min.css`) | spadlo |
|---|---|
| pravidlo pryč (sloupec zpátky `auto`) | 1 |
| sloupec 60 px, tedy užší než slovo „Exekuce" | 1 |

Druhá sabotáž napoprvé taky prošla a měla pravdu: zarovnání a překrývání
jsou dvě různé otázky. Užší sloupec nechá názvy na svislici a odznak
jim přeteče do textu — přibyla proto druhá kontrola, že pravý okraj
odznaku nepřesáhne levý okraj názvu.


## 3cq. NALEZENO: stránky účtu byly telefon roztažený na monitor — *opraveno 14. 10.*

Majitel řekl, ať nechám vstupní stránky a podívám se na inzeráty, funkce
a menu. Měl pravdu, že jsem se zasekl u jedné rodiny stránek. Změřeno
na 1440 px:

| stránka | hlavní blok | prázdno vpravo | prvků vedle |
|---|---|---|---|
| Můj profil | x 152–592 | **696 px** | **0** |
| Zprávy | x 152–592 | **696 px** | **0** |
| Hlídání | x 152–592 | **696 px** | **0** |
| Přidat pozemek | x 152–592 | 696 px | 24 (panel s tipy) |
| Inzerce | x 152–592 | 696 px | 24 (panel s tipy) |

Rozdíl je v posledním sloupci. „Přidat pozemek" a „Inzerce" mají vpravo
panel s tipy, takže je karta vlevo správně. **Na „Můj profil",
„Zprávy" a „Hlídání" vedle ní nestojí nic** — nula prvků za x 640. Tedy
ne dvousloupcový rozvrh, ale telefonní stránka roztažená na monitor:
přihlašovací karta přilepená k levému okraji a vedle ní půl obrazovky
prázdna.

### Dva pokusy, které měření shodilo
1. **`margin-inline:auto` rovnou na `.auth-card`.** Úvaha byla, že na
   „Přidat pozemek" je sloupec přesně široký jako karta, takže se nic
   nehne. Měření: karta se tam posunula ze 152 na **263 px** — sloupec
   má 662 px, ne 440.
2. **Vystředit jen kartu.** Nadpis „Můj profil", úvodní věta i pás
   záložek zůstaly vlevo a stránka vypadala rozpůlená — **hůř než
   původní stav.**

Platí proto, že se středí **celý sloupec** (nadpis, úvod, záložky
i karta) a jen tam, kde vedle nic nestojí: `:not(:has(.add-aside))`.
A pás záložek se středí jako celek, ne po jedné: s `margin-inline:auto`
na potomcích se tři záložky rozlezly na x 297, 671 a 1044 px, protože
je to vodorovný flex a automatický okraj si rozdělil volné místo.

### Zkouška a tři sabotáže
`scripts/test-stranky-uctu.mjs` se neptá na pevná čísla, ale jestli je
prázdno vlevo a vpravo zhruba stejné — a zvlášť hlídá, že „Přidat
pozemek" vystředěné NENÍ.

| sabotáž | spadlo |
|---|---|
| oddíl účtu zpátky vlevo | 1 |
| sloupec zpráv zpátky vlevo (vložený styl) | 1 |
| vystředit i „Přidat pozemek" (přestřelená oprava) | 1 |

První a třetí napoprvé „prošly" — zase kvůli tomu, že jsem sabotoval
nesprávný zápis selektoru. Minifikace spojila dvě pravidla do jednoho
(`…>.add-wrap>*,.app-hero>.add-wrap>*`), takže se hledaný řetězec
nenašel a soubor se vůbec nezměnil. **Assert na počet výskytů to
odhalil; bez něj bych ohlásil slepou zkoušku.**


## 3cs. ODMÍTNUTO: do menu se nesahá — *14. 10.*

Oddíl 3cr popisoval dva nálezy v horní liště (terče 22 px a značka
„tady jsi", která svítila na jediné stránce) a jejich opravu.
**Majitel změnu odmítl: menu dělal sám a o zásah nestál.** Commit je
celý vrácený, lišta měří zase 63×22, 108×22, 100×22, 51×22, 45×22
a 146×44 jako předtím, zkouška test-lista-nahore.mjs je smazaná (schválně bez zpětných
uvozovek: zkouška test-staticka hlídá, že každý soubor jmenovaný
v dokumentaci opravdu existuje, a tenhle existovat nemá)
i s krokem v CI a `test-rozvrzeni` má zpátky původní poznávání
zalomeného odkazu.

Nález tu zůstává zapsaný **jako odmítnutý, ne jako chyba k opravě** —
stejně jako čtyřsloupcová patička v `test-paticka.mjs`. Je to rozhodnutí
majitele o jeho webu, ne nedopatření, a příště (ani mnou) se nemá
„opravovat" znovu.

**Dodatek téhož dne:** majitel pokyn sám otočil — „to menu ještě pořád
předělej, hodně to předělej, extrémní změnu to chce, koukni na velké
realitky a předělej to podle nich". Co z toho vzniklo, je v oddílu 3cu.
To, co je např psané níž, tím neztrácí platnost: do společné součásti webu
se sáhne, když o to majitel řekne, ne když si myslím, že by to chtěla.

**Poučení pro mě:** obě věci, do kterých jsem dnes sáhl a neměl —
patička a menu — mají jedno společné: majitel je už jednou řešil. U
patičky mě zarazila zkouška, která to měla napsané. U menu nic takového
nebylo a došlo to až na jeho reakci. Než příště sáhnu do společné
součásti webu (lišta, patička, navigace), hledám napřed v
`docs/co-chybi.md` a ve zkouškách, jestli se o ní už nerozhodlo.


## 3ct. Místo proužku s puntíkem skutečný graf rozdělení cen — *14. 10.*

U verdiktu o ceně byl proužek „levné → drahé" s jedním puntíkem. Říkal
„jsi na 7 %", ale neukázal, **z čeho to vyšlo**: kolik nabídek to je,
jak jsou rozsazené a jestli je ta naše na kraji hloučku, nebo osamocená.
Data na to přitom byla celou dobu v prohlížeči — model si pole cen za m²
drží (počítá z něj ten percentil) a stránka ho zahazovala.

### Dvě slepé uličky, obě shozené měřením
**Histogram.** Změřeno na ostrých datech: přihrádek s aspoň deseti
nabídkami je **49** a medián jejich velikosti je **16 nabídek**.
Histogram by z toho dělal dva kusy na sloupec — šum ve tvaru grafu.

**Osa v korunách.** U **15 ze 49 přihrádek (31 %)** je nejdražší nabídka
víc než trojnásobek p90; u dražeb ostatních ploch na Litoměřicku je
medián 104 Kč/m², p90 1 077 a maximum **17 071**. Naměřeno i na
konkrétní stránce: pozemek za 314 Kč/m² proti mediánu 42 odsunul všech
jedenáct ostatních teček do levé desetiny grafu.

### Co z toho je
**Jedna tečka = jedna nabídka, vodorovně seřazené podle ceny.** Osa je
tedy pořadí — totéž, co tvrdí věta nad grafem („levnější než 93 %"),
takže se graf a věta nemůžou rozejít, a žádný extrém ho nerozmáčkne.
Koruny se nezamlčují: pod osou stojí nejlevnější, medián a nejdražší,
a u značky naše cena. Tečky se zmenšují podle hustoty (nad 22 a nad 45
nabídek), ať se při 74 neslijí v pruh.

**HTML, ne SVG.** První podoba kreslila kružnice do SVG roztaženého přes
šířku karty (`preserveAspectRatio="none"`) — a to roztáhne i je, takže
z teček byly ovály. Vidět na snímku, opraveno polohovanými `<span>`y.

### Čtyři cizí pojistky mě chytly při jedné změně
| zkouška | co řekla |
|---|---|
| `test-ceny` | „v js/pozemek.js se zase někde dělí cena celou výměrou" — počítal jsem si cenu za metr sám; u spoluvlastnických podílů to lže, patří to z modelu |
| `test-odstupy` | `margin:0 7px` je mimo stupnici odstupů |
| `test-tokeny` | `--w` zůstal v seznamu výjimek, ale po zrušení proužku ho nikdo nenastavuje |
| `test-vlozeny-styl` | předloha přes strop o 127 B |

### Zkouška a tři sabotáže
`test-pohyb.mjs` měřil, jak puntík najíždí. Puntík není, ale měřit je co:
graf se schválně **nenajíždí** (tečky jsou data, ne efekt), takže se
ptá na opak — a navíc na to, že **nakreslí tolik teček, kolik nabídek
slibuje věta nad ním**.

| sabotáž | spadlo |
|---|---|
| graf kreslí jen deset teček místo všech | 1 |
| model přestane posílat hodnoty (graf zmizí) | 3 |
| značka dostane najížděcí animaci | 1 |


## 3cu. Nabídka podle velkých realitních webů — a úvodní stránka bez prázdného pruhu — *14. 10.*

Zadání znělo: *„to menu ještě pořád předělej, hodně to předělej,
extrémní změnu to chce, koukni na velké realitky a předělej to podle
nich — i ten design na úvodní stránce, ať je to čisté a úderné."*

### Nejdřív nález, který se nedal přehlédnout: lišta měla tři podoby

Navěšená v každé stránce zvlášť: **2 141 stránek jednu, 106 druhou
a `index.html` třetí**. Jakákoli změna navigace znamenala upravit tři
šablony a doufat, že se na čtvrtou nezapomnělo. Teď je kánon jediný
(`scripts/hlavicka.mjs`) a krok `sjednot-hlavicku.mjs` ho při sestavení
vepíše do všech 2 248 stránek naráz.

### Co se změnilo

**Na monitoru** místo plochého seznamu sedmi odkazů čtyři skupiny tak,
jak to mají velké inzertní weby: vlevo *Pozemky ▾ · Příležitosti ▾ ·
Ceny pozemků · Rádce ▾ · Kontakt*, svislá čárka, vpravo *Můj profil ▾*
a jediné tlačítko s výplní. Levá půlka odpovídá na „co tu najdu",
pravá na „co tu můžu udělat".

**Na telefonu** je z téže značky šuplik rozdělený na oddíly: účet
s jménem a stavem, pak POZEMKY, PŘÍLEŽITOSTI, Ceny pozemků, RÁDCE,
Kontakt a dole akce. Nadpis oddílu nese ikonu, řádky v oddílu jsou
o stupeň nižší a zarovnané pod jeho text.

### Tři vady, které to vyplavilo (všechny naměřené, ne hádané)

| co | číslo |
|---|---|
| nadpisy oddílů v šuplíku byly neviditelné | starší pravidlo `.nav-sk > summary{display:none}` stálo v souboru níž, takže přebíjelo nové; šuplik byl jeden seznam sedmnácti řádků bez pořádku |
| tlačítko „Přidat pozemek" mělo 44 px místo 66 | šuplik je svislý flex s pevnou výškou a přetékající položky se **smršťují** — sedlo si přesně na svoje `min-height`; `#nav > *{flex:none}` |
| tečka „jsi přihlášený" svítila schovaná v panelu | kreslila se na `#nav-ucet`, a ten je od přestavby odkaz *uvnitř* rozbalovače; přesunuta na nadpis skupiny |

### Zkoušky: dvě nové kontroly místo jedné zastaralé

`test-menu` chtěl „ikonu u každého cíle". To platilo pro plochou
šestičlennou nabídku; při sedmnácti cílech by to byla hromada obrázků
a každý nový odkaz by zkoušku shodil. Místo toho se hlídá to, **kvůli
čemu to pravidlo vzniklo**: nikde nesmí zůstat prázdné místo po ikoně
(`::before`, který nic nekreslí) a každý oddíl musí mít obrázek
u nadpisu.

| sabotáž | spadlo |
|---|---|
| řádkům v oddílu se vrátí prázdný `::before` | 1 (jmenovitě 23 řádků) |
| nadpis „Rádce" přijde o ikonu | 1 (vypsalo, který ze čtyř) |
| tečka přihlášení se vrátí na `#nav-ucet` | 1 (`obsah:none, šířka 0`) |

### Úvodní stránka: dva prázdné pruhy a nadpis, který nebyl nadpis

**Pruh pod hlavičkou.** Komentář u pravidla tvrdil „navazuje to rovnou
na hlavičku, bez mezery" a hned pod ním stálo `margin-top:48px`.
Naměřeno na 1440×900: hlavička končí na y 85, aplikace začínala na
y 133 a mezi tím byl přes celou šířku prázdný šedý pruh — tedy přesně
ten schod, před kterým komentář varuje, jen o 28 px vyšší.

**Na telefonu je těch 48 px nosných** (hlídá `test-pod-hlavickou`:
65 + 50 + 10 = 125, aby hledání po odrolování nezmizelo pod lepivou
hlavičkou), takže se tam nemazaly — jen se z nich stalo **odsazení
uvnitř bílé desky** místo odstupu venku. Stejné místo, jiná barva:
vzduch nad hledáním, ne šedý pruh. Ovládání se nehnulo ani o pixel.

**Nadpis výpisu** měl 14 px/600 — přesně tolik, co popisky tlačítek pod
ním, takže první obrazovka byla pět stejně hlasitých řádků, než začala
první nabídka. Teď je 17 px/700, číslo a poznámka jsou tišší přípona
a vedle nadpisu stojí řazení.

| 1440×900 | před | po |
|---|---|---|
| začátek aplikace | y 133 | y 85 |
| hlavička výpisu (výška) | 192 px | 145 px |
| první nabídka | y 450 | y 383 |

**Past, do které jsem při tom šlápl:** `flex:1 1 200px` na nadpisu je
v řádku šířka, ale na telefonu má taž sestava hlavní osu svislou —
takže z téhož zápisu byla **výška 200 px**: nadpis se nafoukl z 63 na
200, řádky se v něm rozprostřely (zalomený flex roztahuje své řádky)
a první nabídka spadla o 165 px níž. Vidět na snímku, opraveno
omezením pravidla na šířky, kde je řada vodorovná.


## 3cv. NALEZENO: na porovnání končila věta slovem „co…" — *14. 10.*

Na snímku stránky `porovnani.html`: pod nadpisem „Takhle to vypadá"
stálo *„Tohle **nejsou** vaše uložené pozemky — jsou to tři skutečné
nabídky druhu stavební pozemek z okresu Praha-východ, aby bylo vidět,
co…"* a tím to skončilo.

**Příčina:** třída `.por-pozn` sloužila dvěma různým věcem — čtyřem
vysvětlujícím odstavcům na stránce a MOJÍ poznámce v buňce tabulky.
Pravidlo psané pro tu buňku (`-webkit-line-clamp:2`, „tabulka má
ukazovat, co se liší, ne být deníkem") uřízlo i ty odstavce. Naměřeno:
odstavec dostal 36 px, potřeboval 54. Buňka se jmenuje nově
`.por-moje-pozn` a zkracuje se dál.

**Kontrola** v `test-porovnani.mjs` měří obojí: že žádný odstavec na
stránce nekončí v půlce (porovnává `scrollHeight` s `clientHeight` —
samotný `overflow:hidden` ještě nic neznamená, dokud se text vejde)
a že se poznámka v tabulce zkracovat nepřestala. Bez té druhé poloviny
by kontrola prošla i po zrušení zkracování úplně, tedy po záměně jedné
vady za druhou.

| sabotáž | spadlo |
|---|---|
| zkracování míří zase i na `.por-pozn` | 1 (vypsalo větu, 36 proti 54 px) |
| zkracování se zruší docela | 1 (`-webkit-line-clamp` je „none") |

**A poctivý negativní nález k tomu:** prošel jsem stejným měřením
dvanáct dalších stránek (účet, hledání, rádce, ceny) na 1440 i 390 px
a žádný další uříznutý text na nich není. Jediné, co vyskočilo, je
rozdíl 2 px u `h1` — ten ale nic neořezává, je to zaokrouhlení řádku
proti dotahům písmen.

## 3cw. NALEZENO: oprava pražských ulic měla v sobě chybný předpoklad — *14. 10.*

Oddíl o pražských nabídkách (`place` je tam ulice, ne obec) končil
větou **„jinde je `place` opravdu obec"**. Změřeno a neplatí.

Mimo okres Praha je v datech **sedm** nabídek, jejichž místo začíná
předložkou, tedy je to ulice:

| místo | okres |
|---|---|
| U Pískovny | Jablonec nad Nisou |
| Ke Trati | Kladno |
| Ve Višňovce | Beroun |
| V Hlubokém, K Rybníku | Praha-západ |
| Na Vrchách, V Dymáku | Praha-východ |

U **tří** z nich se do titulku nevešel dlouhý tvar, okres z něj tedy
vypadl a zbyl nadpis *„Stavební pozemek 534 m² — V Hlubokém"* — který
neukazuje nikam. Obec u těchhle nabídek neznáme (zdroj ji neposlal
a dohledat ji ze sandboxu nejde), takže se nepřepisuje nic: jen když
se musí něco vypustit, ustoupí **výměra, ne okres**. Kde se nevejde ani
druh pozemku, zbude „U Pískovny, okres Jablonec nad Nisou" — pořád
místo, ne nic.

Pravidlo pozná ulici podle dvou podmínek naráz: první slovo je
předložka **a** druhé začíná velkým písmenem. Samotná předložka
nestačí — obcí s předložkou uprostřed („Ústí nad Orlicí", „Újezd
u Brna", „Mníšek pod Brdy") je v datech 129 a žádná sem nepatří.

| sabotáž | spadlo |
|---|---|
| krátký tvar (jen místo) se u ulice zase smí použít | 1, a vypsala všechny tři vadné stránky i s nadpisy |

### Dvě měření, která nic nenašla
* **Nesmyslně vysoké ceny.** Šest nabídek je nad 50 milionů, nejvyšší
  379 320 000 Kč. Po přepočtu na metr ale sedí: 18 966 m² v Praze za
  20 000 Kč/m². Dalších pět stejně (Horní Planá u Lipna 14 000 Kč/m²,
  17 ha u Budyně za 1 057 Kč/m²). Chyba v datech to není.
* **Uříznutý text jinde než na porovnání.** Dvanáct dalších stránek na
  1440 i 390 px: nic. Jediné, co vyskočilo, je rozdíl 2 px u `h1` —
  ten nic neořezává, je to zaokrouhlení řádku proti dotahům písmen.

## 3cx. Výpis na stránkách z vyhledávačů dostal letecké náhledy — *14. 10.*

Na 103 stránkách okresů, krajů, druhů a rozpočtů byl výpis **holý
text**: podtržené jméno obce, věta s tečkami, vpravo cena. Jsou to
přitom právě ty stránky, na které lidé chodí z vyhledávačů, a vypadaly
jako rejstřík, ne jako nabídka pozemků. Velké realitní weby mají
v seznamu obrázek, protože podle něj se rozhoduje dřív než podle čísel.

Fotky k cizím inzerátům přebírat nesmíme (oddíl 2). Jediný poctivý
obrázek u pozemku je **letecký snímek jeho okolí** — a ten už web
umí, jen ho ukazoval až na stránce pozemku.

### Jedna dlaždice na nabídku, ne skládaný snímek
Velký snímek na stránce pozemku se skládá z tolika dlaždic, kolik se
jich do okna vejde. U čtvercového náhledu by to vycházelo na 2,6
dlaždice na nabídku — při šedesáti nabídkách na stránce **přes sto
padesát požadavků**, a to na stránkách, které si schválně nestahují
ani mapový web.

Náhled proto bere **jednu dlaždici celou** a špendlík se do ní posadí
tam, kde pozemek v té dlaždici doopravdy leží. Přiblížení se vybírá
podle výměry (týž výpočet, jaký používá velký snímek) a pak se zkouší
sousední stupně, aby bod nepadl těsně ke kraji: u 78 % nabídek se
trefí do prostřední poloviny dlaždice, zbytek je u kraje, ale pořád na
správném místě.

| rozhodnutí | proč |
|---|---|
| `loading="lazy"` + pevné rozměry | stahuje se, až když se řádek blíží obrazovce, a stránka pod prstem neposkočí |
| strop přiblížení 18, ne 19 | když dlaždice chybí, nakreslí prohlížeč ikonu rozbitého obrázku (vyzkoušeno a vyfoceno) a letecké podklady bývají nejřidší právě nad poli |
| výpočet je v `js/snimek.js` | tentýž soubor kreslí velký snímek; druhá kopie přepočtu souřadnic na dlaždice by se rozešla, kvůli tomu ten soubor vznikl |
| odznak dražby leží **na** snímku | uvolnil se tím sloupec, který se dosud musel držet na 78 px kvůli svislici názvů |

### Zásady soukromí to musely říct
Stály tam věty „podklad mapy" a **„dokud mapu neotevřete, nepředá se
jim nic"** — a to by od téhle změny nebyla pravda: náhled sahá na Esri
i na stránce, kde žádná mapa není. Je tam proto nový odstavec: co se
stahuje, odkud, kdy (až při dorolování) a že se tím Esri dozví i to,
jak daleko ve výpisu člověk došel.

### Nová zkouška `test-nahledy-vypisu.mjs` (2 797 nabídek na 103 stránkách)

| sabotáž | spadlo |
|---|---|
| `loading="lazy"` pryč | 1 |
| špendlík posazený mimo snímek | 1 |
| atribuce Esri vymazaná ze stylopisu | 1 (a jmenovala oba balíky stylů) |

## 3cy. Graf cen se dá projet prstem — a vyhubl o 1,3 kB na stránku — *14. 10.*

Tečky v grafu měly `title`, tedy popisek, **který na telefonu
neexistuje**. Hodnota jednotlivé nabídky se tak dala přečíst jedině
myší; na dotyku byl graf jen obrázek.

### Pás je jeden terč, ne sedmdesát malých
Tečka má 5 až 7 px, dotykový terč má mít 44. Sedmdesát
čtyřicetičtyřpixelových terčů se na kartu nevejde a i kdyby, trefit
mezi nimi tu pravou nejde. Celý pás je proto jeden terč (54 px na
výšku): prst jede po ose, nad nejbližší tečkou vyskočí bublina
s cenou a pořadím („14 Kč/m² · 4. z 13", u naší nabídky „tento
pozemek"), tečka se zvětší a projde jí svislice.

`touch-action:pan-y` je nutnost, ne ozdoba — bez něj by prst jedoucí
po grafu přestal rolovat stránku a web by působil zaseknutě. Na myši
bublina sleduje kurzor a zmizí s odchodem, na dotyku zůstane 2,5 s,
aby se dala přečíst poté, co ji prst odkryje.

**Za gesto se nic neschovalo.** Vše (tento pozemek, medián, nejlevnější,
nejdražší, počet nabídek) dál stojí v textu kolem grafu a v popisku pro
odečítač obrazovky; bublina je navíc, ne místo toho.

### Osa zůstala pořadím
Na dotaz „ať to vypadá jako na Sreality" jsem **neměnil osu na koruny**
a je to měřené rozhodnutí, ne lenost: u 15 ze 49 přihrádek je nejdražší
nabídka víc než trojnásobek devadesátého percentilu (u dražeb na
Litoměřicku medián 113 Kč/m², maximum 17 071), takže v korunách by se
všechny ostatní tečky slily u levého kraje. Pořadí navíc říká totéž co
věta nad grafem, takže se graf a věta nemůžou rozejít.

### Vedlejší nález: 1,3 kB na každé z 1 995 stránek
Pravidla grafu ležela ve **vloženém** stylu pozemek.html. Ten tam je
kvůli tomu, co se kreslí hned — jenže graf skládá `js/pozemek.js` až po
dopočtení ceny, tedy dávno po tom, co stylopis dorazil. Přestěhoval se
proto do `css/styles.css`; rozdělovač stylopisu ho v základním balíku
nechá, protože k tokenům stránky přičítá slova ze všech skriptů, které
si stránka tahá. Vložený styl předlohy spadl z 42,0 na 39,5 kB.

| sabotáž | spadlo |
|---|---|
| obsluha dotyku se nepověsí | 3 (bublina, zvýrazněná tečka, poloha bubliny) |
| pás se zmenší zpátky na 26 px bez `touch-action` | 2 (terč 26 px, rolování) |

A jeden nález z vlastní zkoušky: bublina s pevným ořezem na 16–84 %
přečuhovala u levého kraje **3 px z karty ven** — šířka bubliny se mění
podle textu, takže se musí srovnat až po vykreslení, ne pevným
procentem.

## 3cz. Nabídka zúžená z 25 odkazů na 14 — *14. 10.*

Majitel: *„to menu chce zredukovat, je tam toho moc, nech tam jen to
důležité."* Ze šuplíku na telefonu to bylo vidět nejlíp — 25 odkazů
ve čtyřech oddílech, skoro dvě obrazovky rolování.

**Co odešlo, bylo změřené, ne odhadnuté.** U každého cíle jsem spočítal,
z kolika stránek na něj vede odkaz **mimo lištu a patičku**:

| cíl | odkazů mimo lištu | zůstává v liště? |
|---|---|---|
| orná půda | 920 | ne |
| louky | 421 | ne |
| stavební | 257 | **ano** (nejhledanější druh) |
| náklady koupě | 112 | **ano** |
| na co mám? | 106 | ne |
| podle okresu | 105 | **ano** (rozcestník) |
| nové na trhu | 97 | **ano** |
| list vlastnictví | 92 | ne |
| zahrady 79, vinice 61, lesní 100 | | ne |
| ceny pozemků | 68 | **ano** |
| přístupová cesta 12, stavební vs. zemědělský 9, územní plán 8 | | územní plán **ano** |
| dražby 5, hypotéka 4, věcné břemeno 4, exekuce 3, kupní smlouva 1 | | dražby, exekuce, kupní smlouva **ano** |

Druhy pozemků vedou z každé stránky pozemku toho druhu, takže je lišta
nosit nemusí. U rádců to bylo nejtěsnější — proto zůstali **tři, ne
jeden**: každý rádce odkazuje na všech osm ostatních, takže jeden
odkaz v liště stačí, aby se k nim člověk dostal, a tři jsou tam proto,
že pokrývají tři otázky kupujícího v tom pořadí, v jakém přicházejí:
*smím tu stavět* (územní plán), *jak se to převádí* (kupní smlouva),
*co to stojí nad rámec ceny* (náklady koupě).

| | před | po |
|---|---|---|
| odkazů v nabídce | 25 | **14** |
| výška šuplíku na 390×844 | ~2 000 px | **1 195 px** |
| oddílů | 4 | 4 |

Podlaha v `test-rozvrzeni` spadla z dvaceti cílů na dvanáct — pod
dvanáct by z nabídky zmizelo něco, co jinde na webu není (účet, mapa,
ceny, kontakt, akce).

## 3da. Tlačítko „Na pozemek" leželo na přibližování — a zkouška to neviděla — *15. 10.*

Majitel poslal snímek mapy v detailu pozemku: tlačítko „Na pozemek"
sedělo přesně na ovladači „+/−".

**Změřeno** v prohlížeči proti rámu mapy, telefon 390×844 (mapa
356×300):

| ovladač | x | y |
|---|---|---|
| zvětšení | 302–346 | 10–54 |
| **Na pozemek** | 216–346 | **64–108** |
| přibližování | 298–344 | **100–192** |
| měřítko | 5–83 | 277–295 |
| uvedení zdrojů | 188–356 | 272–300 |

Osm pixelů přes sebe a čtyři ovladače v jednom sloupci u pravého
okraje. Na monitoru (mapa 718×390) se to neukázalo: mapa je o 90 px
vyšší, takže přibližování sedí níž a mezera vyjde.

Tlačítko je teď **dole vlevo** (`left:10px; bottom:34px`), tedy nad
měřítkem a mimo pravý sloupec. Naměřeno po přesunu: telefon
`x 10–134, y 222–266`, monitor `x 10–134, y 320–356`. Levý okraj si
bere telefon na gesto „zpět" — proto `bottom` a ne `top`, ať tlačítko
nestojí v dráze toho gesta nahoře, kde se jím listuje.

Při přesunu šel pryč i `top:64px` z dotykového bloku: s `bottom` naráz
by tlačítko **natáhlo přes celou mapu**, naměřeno 202 px na výšku
místo 44.

### Co bylo horší než to tlačítko: zkouška měřila telefon, jaký neexistuje

K přesunu jsem napsal pojistku — průnik každé dvojice ovladačů na obou
šířkách. Pak jsem ji **prověřil sabotáží**: vrátil jsem do
`pozemek.html` přesně to CSS, které majitel vyfotil. **Zkouška
prošla.**

Důvod: pravidla pro telefon tu nestojí za šířkou okna, ale za
`@media (pointer: coarse)`. Playwright do nich pustí jen kontext
s `hasTouch` — a bez něj prohlížeč v okně 390 px vykreslí **layout
monitoru**. Naměřeno: tlačítko bylo bez dotyku vysoké 36 px, s dotykem
44, a právě těch osm pixelů byl celý překryv. Zkouška tedy měřila
rozvržení, které na žádném telefonu neexistuje.

Po doplnění `dotyk: true` sabotáž spadne tak, jak má:
`✕ telefon 356×300: žádné dva ovladače mapy neleží na sobě — Na
pozemek × přibližování (46×8 px)` — osm pixelů, přesně jak jsem je
naměřil rukou. S opraveným CSS je zelená.

**A není to jediná taková zkouška.** Ve `css/styles.css` u tokenu
`--plocha-plovouci-plna` stojí týž příběh z minula („zkouška to
neviděla, protože měřila bez dotyku"). Projel jsem proto všechny:
**ze 45 zkoušek, které si otvírají úzké okno, 17 nezapíná dotyk** —
mezi nimi `test-okraje`, `test-afordance`, `test-stabilita` a
`test-rozdeleni-stylu`, tedy ta, která dokazuje, že zkrácený stylopis
dává tytéž vypočtené styly jako plný. Za dotykovými a hover dotazy je
ve stylopisu **36 pravidel**, a žádné z nich ta zkouška nikdy
nesrovnala. To je další položka v `docs/optimalizace.md`, ne věc na
jeden řádek.

## 3dd. Tlačítko „Na pozemek" je pryč z mapy — *15. 10.*

Majitel poslal snímek podruhé: *„to tlačítko na pozemek chce dát jinam,
překáží tam."* Měl pravdu a problém nebyl v tom, KDE nad mapou stojí.

Napoprvé stálo vpravo nahoře a leželo na přibližování (bod 3da, osm
pixelů překryvu). Přesunul jsem ho dolů vlevo, kde bylo podle měření
volno — a překáželo dál: na mapě **430×300** zabíralo **130×44 bodů,
tedy 6 % její plochy**, a leželo přes letecký snímek i přes hranice
parcel. Mapa je na telefonu vysoká 300 bodů. Na takové mapě žádné
„volné místo" není; je tam jen míň zajímavé místo.

**Tlačítko proto nestojí na mapě vůbec** — je v pruhu pod ní, vedle
podkladu a vrstev, tedy mezi ostatním ovládáním mapy, kam patří. Nad
mapou zbylo jen zvětšení na celou obrazovku a přibližování. Naměřeno
po přesunu (mapa, y se počítá od jejího horního okraje):

| | telefon 356×300 | monitor 718×390 |
|---|---|---|
| zvětšení | y 10–54 | y 10–46 |
| přibližování | y 100–192 | y 202–282 |
| **Na pozemek** | **y 436–480 (pod mapou)** | **y 493–527 (pod mapou)** |

Chová se dál stejně: ukáže se, až když se pohled od pozemku odlepí,
a stisk vrátí přesně původní výřez. Terč má na dotyku 44 px, jako
přepínače vedle.

**Doloženo sabotáží:** vrácení `position:absolute; right:10px; top:56px`
shodí novou kontrolu v obou profilech („leží přes mapu — patří do pruhu
pod ní"), s opraveným CSS je zelená. Celkem `test-mapa-pozemku` 147
kontrol, 0 chyb.

## 3de. Hlavní mapa: rozhraní z ní ubralo 18 %, teď 6 % — *15. 10.*

Majitel poslal snímek úvodní mapy na telefonu se zadáním „předěláme to
podle velké realitky". Z tohohle prostředí se na cizí weby nedostanu
(odchozí spojení je zavřené; textové hledání vrátilo jen obecné
články), takže jsem **nekopíroval jeden konkrétní portál** — to bych si
musel vymýšlet. Udělal jsem to podle toho, co mají velké mapové
portály společné a co se dá na našem webu ZMĚŘIT: nad mapou pár
drobných tlačítek, všechno ostatní za jedním.

**Změřeno před změnou** (displej 430 px, mapa 430×640):

| co leželo přes mapu | rozměr | plocha |
|---|---|---|
| nápověda „Klepněte na kraj" | 144×39 | 2,0 % |
| sloupec čtyř ovladačů | 135×188 | 9,2 % |
| legenda | 344×56 | 7,0 % |
| **dohromady** | | **18,3 %** |

**Po změně: 5,7 %** (nápověda + sloupec tří tlačítek 56×156). Volné
plochy mapy je o 12 258 bodů² víc, i když je mapa o 55 px nižší —
legenda si je vzala pod sebou.

Co se změnilo:

1. **Tři tlačítka místo čtyř pilulek.** Ikona a pod ní slovo: 56 px
   široké místo 135. Samotné ikony ne — na tomhle webu platí, že
   ovládání, které se objevuje jen občas, se nemá kde naučit.
2. **Panel „co je na mapě vidět"** za tlačítkem „Vrstvy": podklad,
   barvy teček a vrstvy úřadů. Barvy teček jsou teď DVĚ tlačítka vedle
   sebe („Podle druhu" / „Podle ceny"); z jedné pilulky „Podle ceny"
   se nedalo poznat, co zrovna platí.
3. **Legenda pod mapou.** Schovat ji za tlačítko nejde (vysvětluje
   tvary značek), ale není důvod, aby brala 7 % mapy.

### Vada, kterou by sloučení způsobilo — a nezpůsobilo

Vrstvy úřadů se zkoušely ve chvíli, kdy se otevřel jejich panel; tehdy
to znamenalo „chci vrstvy". Jakmile je v témž panelu i podklad, znamenalo
by otevření, že **kdo si jen přepne na letecký snímek, pošle pět dotazů
na servery úřadů** — proti tomu, co web píše v zásadách soukromí.
V řadě proto čeká tlačítko „Zkusit, které vrstvy jedou" a ptá se teprve
ono. Hlídá to `scripts/test-vrstvy-mapa.mjs`.

### Co u toho spadlo a co to říká

Šest zkoušek — a každá ukázala na něco, co se dalo spočítat předem:

| zkouška | co padlo | co to bylo |
|---|---|---|
| `test-tahy` | „každá ikona kreslí tah 1,5 px" → 1,74 | ikona vyrostla z 15 na 19 px a zůstala jí stará tloušťka tahu |
| `test-typografie` | řádkování 1,15 mimo stupnici | → 1,2 |
| `test-vrstvy` | `z-index:620` mimo vypsaný pořádek | uvnitř `.map-tools` (z-index 600) stačí místní pořadí |
| `test-mapa-tazeni` | „rozhraní mapu opravdu zakrývá (6,4 %)" | mez 10 % byla odvozená ze starého rozhraní; nová je 4 % |
| `test-podklad-mapy` | přepínač podkladu není vidět | je v panelu — zkouška ho teď otevře |
| `test-vrstvy-mapa` | tlačítko „Vrstvy" se neschovalo | schovává se ŘADA uvnitř, ne tlačítko |

### A dvě slepé skvrny ve zkoušce rozdělení stylopisu

`test-rozdeleni-stylu` porovnává vypočtený styl každého prvku při
zkráceném a plném stylopisu. Po přesunu legendy začala hlásit rozdíly,
které se stylopisem nemají co dělat:

* `svg: block-size 791 proti 745 px` a `canvas 1318 proti 1242` —
  mapová knihovna si velikost svých vrstev nese v ATRIBUTECH
  `width`/`height` (a tvar čar v `d`) a přepisuje je po každém posunu.
  Vlastnosti odvozené z prezentačního atributu se proto vynechávají —
  táž úvaha jako u vlastností nastavených do `style` (bod v
  `docs/optimalizace.md`, položka 7).
* `zkrácený 2 072 prvků, plný 2 107` — o 35 dlaždic mapy jinak.
  Kolik jich v DOM je, rozhoduje knihovna podle toho, kam se stihla
  posunout. Dlaždice se proto do porovnání nepočítají; všechno ostatní
  včetně panelů a ovladačů ano.

**Doloženo sabotáží, že zkouška pořád kouše:** vyjmutí jediného
pravidla `.map-legend` z `css/uvod.min.css` ji shodí v obou profilech.

## 3db. OTEVŘENÁ OTÁZKA: klepnutí prstem na značku kraje — *15. 10.*

Při zapínání dotyku ve zkouškách (bod 3da) se `scripts/test-mapa.mjs`
rozbila na šesti kontrolách naráz: po klepnutí do plátna se nevybral
kraj. Vyzkoušel jsem v dotykovém kontextu **tři způsoby podstrčeného
vstupu a všechny tři selhaly** — `mouse.click`, `touchscreen.tap`
i `locator.click`. Přitom:

* klepnutí, které si zkouška vyrobí DOM voláním `.click()`, projde
  i s dotykem (jiný oddíl téže zkoušky, zelený),
* značka kraje má v `js/main.js` obsluhu `mk.on('click', vyber)` —
  a tu prohlížeč z opravdového prstu spustí, protože klepnutí na prvek
  vyrobí `click` sám,
* změřeno, že bod ve středu značky NENÍ ničím zakrytý
  (`elementFromPoint` vrací tu značku) — to je od té doby v té zkoušce
  pojistka, aby se z toho nestala kaskáda nesouvisejících chyb.

**Nedokázal jsem oddělit, jestli je to omezení podstrčeného vstupu,
nebo vada webu** — a tvrdit jedno nebo druhé bez měření nebudu. Zkouška
proto zůstává v tom profilu, ve kterém byla zelená (bez dotyku), s tím
napsaným u sebe. Co se o dotyku na úvodní mapě tvrdit DÁ, měří
`scripts/test-dotyk.mjs` a `scripts/test-rozvrzeni.mjs` — obě s dotykem
zapnutým a obě zelené: značka kraje má terč aspoň 44 px.

**Jak se to dá dořešit:** na opravdovém telefonu (nebo přes CDP
`Input.dispatchTouchEvent` s následnou kontrolou, jestli prohlížeč
`click` dosyntetizoval) klepnout na značku kraje a podívat se, jestli
se kraj vybere. Do té doby je to otázka, ne nález.

### ODPOVĚĎ — *20. 10.*: web je v pořádku, past byla jinde

Změřeno patnácti průchody ve čtyřech profilech (390 i 1280 px, s dotykem
i bez, `hasTouch` samotné i s `isMobile`), vždy s podstrčenými dlaždicemi:

* **klepnutí na značku kraje VYBERE kraj ve VŠECH profilech**, a to
  `mouse.click`, `touchscreen.tap` i `dispatchEvent` — v dotykovém
  kontextu stejně jako bez něj (ověřeno na „Jihočeský kraj" i na
  „Kraj Vysočina", zoom skočil ze 6,25 na 8). Podstrčený vstup tedy
  omezení není a vada webu to není taky.
* **Proč se to 15. 10. nepovedlo změřit:** na telefonu se úvodní stránka
  otevírá na SEZNAMU a mapa je za přepínačem — `.map-holder` má
  `display:none`, takže značky mají v DOM rozměr 0 × 0 a klepnutí nemá
  kam dopadnout. Měřeno: při 390 px je mapa skrytá kvůli `.map-holder`,
  při 1280 px má 845 × 592 px. (`scripts/test-mapa.mjs` přepínač
  používá — ale probe, kterým se to tehdy zkoušelo, ne.)

**A pak se našlo i to zbylé — zkouška běží s dotykem.** Když se dotyk
zapnul celé zkoušce, padalo osm kontrol v kaskádě. Příčina je JEDNA
a je v kódu webu napsaná jako záměr: na dotyku je mapa po načtení
**zamčená** (bere rolování stránky) a první klepnutí ji jen PROBUDÍ —
`probudMapu()` v `js/main.js` vrátí `true` a obsluha skončí. Na myši se
to nedělá, protože kolečko mapa nebere a zamykat není proč. Změřeno na
obrysu Plzeňského kraje: bez dotyku vybere kraj jedno klepnutí, s dotykem
ani `mouse.click`, ani `touchscreen.tap`, ani `dispatchEvent` — ale
po probouzecím klepnutí vyberou kraj všechny tři.

`scripts/test-mapa.mjs` proto běží v profilu `hasTouch + isMobile`
a klepání má obalené: když je mapa zamčená, klepne dvakrát, jak to na
telefonu dělá člověk. Přibyly tři kontroly (mapa je po načtení zamčená,
první klepnutí ji probudí, a je kam klepnout naprázdno) a sada je
51/51 zelená. Sabotáž `dotykoveOvladani = false` shodí tu prostřední.

## 3dc. NALEZENO: devět prohlížečových zkoušek je červených a nebylo to ode mě — *15. 10.*

Pustil jsem celou prohlížečovou sadu (108 zkoušek) a **dvanáct jich
padalo**. Místo hádání jsem si vyrobil **základ**: pracovní kopii
stromu na commitu `8cee2d9b`, tedy před veškerou prací z 14.–15. 10.,
a tytéž dvanáct zkoušek pustil tam. Výsledek rozdělil vinu na dvě
hromádky:

**Tři byly moje** (na základu zelené, u mě červené) — a všechny tři
jsou následky přestavby nabídky:

| zkouška | co padlo | proč |
|---|---|---|
| `test-sliby` | „12 otázek proti 9 napsaným" | hledala `<summary>` kdekoli na stránce; oddíly šuplíku jsou taky `<details><summary>` |
| `test-vrstveni` | „žádný odkaz není bez ikony" | ikona teď patří ODDÍLU, ne každému řádku — čtrnáct ikon pod sebou dělalo z nabídky vánoční stromek |
| `test-mapa` | šest kontrol klepání | zapnutý dotyk, viz bod 3db |

Všechny tři jsou spravené a zelené.

**Devět bylo červených už na základu** — tedy před touhle prací:
`test-chat-prohlizec`, `test-hlidani-prohlizec`, `test-mapa-pozemku`,
`test-odhlaseni`, `test-pamet`, `test-poznamky`,
`test-prvni-obrazovka`, `test-rychly-prohlizec`, `test-vrstvy-mapa`.

Co u nich padá (jen zaznamenáno, ne rozebráno):

| zkouška | hlášení |
|---|---|
| `test-prvni-obrazovka` | cena „68 696 Kč" končí na 857 px, obrazovka má 844; pruh nástrojů 148 px proti stropu 110 |
| `test-rychly-prohlizec` | na tlačítku stojí „Projít 1 930 pozemků po jednom ›" |
| `test-vrstvy-mapa` | „podstrčená vrstva se nabídne" — přepínačů v panelu 0 |
| `test-mapa-pozemku` | „bez mapové knihovny se ukáže nehybný snímek — náhrada false, snímek false" |
| `test-odhlaseni` | stránka nepotvrdí, že pošta chodit nebude |
| `test-pamet` | výjimka: `.toast-akce` je null (hláška „Vrátit" se neukázala) |
| `test-poznamky` | poznámka u nabídky není vidět |
| `test-chat-prohlizec` | po klepnutí do vlákna se neukáže psací pole |
| `test-hlidani-prohlizec` | timeout |

Dvě z nich jsem už v téhle sérii spravil jinde (`test-barvy`,
`test-pridat`), takže se ta hromádka tenčí. **Je to seznam, ne
výmluva** — jde se po jedné.

## Co naopak nechybí

Ať je seznam poctivý v obou směrech. Hotové a ověřené: stahování ze
šesti zdrojů 4× denně s pojistkami proti tichému selhání, archiv
nabídek a změn cen, 2 062 stránek pozemků se srovnáním cen, odhad ceny
proti okolí, hlídání v aplikaci, účty, psaní mezi lidmi, poznámky,
offline režim, kontrola fotek AI modelem a kontrola databáze
(`scripts/kontrola-databaze.mjs`). Zkoušek je 185 souborů a každá
pojistka je prověřená sabotáží.

---

## 3df. Úvodní stránka: nad první nabídkou leželo 487 px ovládání — *15. 10.*

Majitel webu poslal snímek vršku úvodní stránky z telefonu se slovy, že
je to příšerné a že to má být předělané podle velkých realitních webů.
Měl pravdu a dá se to změřit.

**Co bylo (390×844, naměřeno):**

| blok | px |
|---|---|
| hlavička | 65 |
| **prázdný pruh pod ní** | **48** |
| pole hledání | 46 |
| přepínač Seznam / Mapa přes celou šířku | 54 |
| nadpis výsledků, poznámka, „Uložené" a řazení | 92 |
| pruh „Projít 1 930 po jednom" + „Stáhnout výběr" | 106 |
| **první nabídka začínala na** | **487 px** |

Pětaosmdesát procent toho, co člověk po otevření viděl, byly ovladače.
A kdo už web používal, měl mezi tím ještě pruh naposledy prohlédnutých
— na majitelově snímku dva řádky, tedy kolem 640 px.

**Co dělají velké realitní weby jinak.** Na mobilu mají nahoře
hledání, pod ním JEDEN řádek s počtem a řazením, a hned nabídky.
Přepínač na mapu je drobné tlačítko vedle hledání, ne pruh. Nářadí
na práci s výpisem (export, hromadné procházení) je až pod výsledky
nebo v nabídce. *Pozn.: v téhle schránce není přístup k internetu
(proxy odmítá i `parcelaka.cz`), takže jsem si ty weby nemohl otevřít
a vycházel jsem z toho, co mají společné. Kdyby se měl brát za vzor
jeden konkrétní, musel by ho majitel ukázat.*

**Co se změnilo:**

1. **Prázdný pruh 48 → 40 px.** Nejdřív jsem napsal 14 a byla to
   chyba: `test-pod-hlavickou` neměří jen výchozí stav, ale i stránku
   posunutou o 60 px, a o tom, jestli se na pole hledání dá ještě
   klepnout, rozhoduje jeho STŘED. Počítáno: 65 (hlavička) + odsazení
   + 10 (vnitřek panelu) + 23 (polovina pole) ≥ 125 ⇒ odsazení ≥ 27.
   Se čtrnácti byl střed pole 53 px POD hranou hlavičky a na levou
   polovinu nešlo klepnout. Těch 48 px tedy nebylo prázdno pro nic za
   nic — ubralo se z nich osm, ne čtyřiatřicet.
2. **Přepínač Seznam/Mapa na řádek k hledání.** Ušetřených 54 px.
   Do `.map-side` (kam patří významem) nesmí: pravidlo
   `.map-app:not(.mv-seznam) .map-side{display:none}` ho schovává
   spolu se seznamem, takže by po přepnutí na mapu nebylo čím zpět.
3. **Krátký nadpis na telefonu.** „Doporučené příležitosti · 1 930 na
   mapě" → „1 930 na mapě": schová se POPIS, ne počet.
   *Druhý pokus.* Nejdřív tam stála druhá, úplně krátká podoba
   „1 930 pozemků" a dlouhá se celá schovávala — a spadly na tom dvě
   zkoušky (`test-naseptavac`, `test-zlevnene-filtr`). Patnáct zkoušek
   totiž čte počet z toho prvku přes `innerText`, tedy jen to, co je
   doopravdy vykreslené, a hledá v něm „N na mapě"; se schovanou
   `.mc-sub` jim vycházelo −1. Přepsat je nešlo: „na mapě" je ve
   zkouškách na 150 místech. A je to tak správně i bez nich — dvě
   podoby téhož čísla by se dřív nebo později rozešly.
4. **„Projít po jednom" a „Stáhnout výběr" až POD seznam** — spolu
   s naposledy prohlédnutými. Jsou to nástroje pro toho, kdo výpis už
   vidí. Na monitoru zůstávají nahoře, kde místo nechybí: `.map-side`
   je svislý flex, takže stačilo určit `order` nad 1040 px.

**Naměřeno po přestavbě: první nabídka na 289 px místo 487** — a cena
je na první obrazovce celá (vyfoceno).

### Dvě vady, které vyplavilo až focení
Měření obě přehlédlo, protože obě byly o vzhledu, ne o výšce:

- **Počet i obě tlačítka byly vycentrované**, odsazené od levého kraje
  o 67 px. Příčina: pravidlo o pár řádků výš dělá z `.ms-vysledky`
  na telefonu SLOUPEC, a moje `align-items:center` v něm neznamenalo
  „na jeden řádek", ale „všechno doprostřed". Řada se musela vrátit
  výslovně.
- **Nápis v poli hledání se ořízl** uprostřed slova „cena": pole mělo
  188 px a nápis 200. Přepínač proto na telefonu přišel o ikony —
  pravidlo „ikona sama nic neřekne" tu platí obráceně, popisek sám
  o sobě řekne všechno. Pole má 230 px.

### Pojistka a tři sabotáže
`scripts/test-prvni-obrazovka.mjs` měl mez 560 px; utáhla se na **330**
(naměřený stav 289) a přibyly dvě kontroly: nástroje i naposledy
prohlédnuté musí začínat ZA první nabídkou.

Sabotáž nejdřív odhalila díru v mé vlastní kontrole: když se z
`index.html` vyhodí celé `id="mc-akce"`, `js/main.js` má záložní cestu
a tlačítka připíše dovnitř nadpisu — pruh je zase nahoře, ale
`getElementById` nenajde nic a kontrola projde **naprázdno**. Hledá se
proto podle třídy `.mc-akce`, která je v obou případech. Po opravě
sabotáž padá na obou kontrolách: *„nástroje začínají na 217 px, první
nabídka na 383 px"*.

### A ještě jedna, o které jsem si myslel, že je spravená
`test-rozdeleni-stylu` spadla v jednom běhu a o pár minut dřív táž
zkouška prošla: *„stejný strom zkrácený 2 070 prvků, plný 2 105"*.

Zkouška porovnává dvě načtení téže stránky a první, co musí platit, je
„je to tentýž strom". Čekala pevných 900 ms — jenže obsah úvodní
stránky doskakuje z několika zdrojů najednou (`opportunities.json`,
živé inzeráty z databáze, `zlevneni.json`) a Leaflet si do stránky
dokresluje dlaždice a shluky. Když jedno z toho doběhlo před měřením
a podruhé až po něm, liší se STROM, ne stylopis.

Dřívější oprava ten rozdíl přičetla dlaždicím mapy a vyňala
`.leaflet-tile` z porovnání. **Vyjmutí je správně a zůstává** — kolik
dlaždic v DOM je, o stylopisu opravdu nic neříká —, ale příčinu to
nevysvětlilo, jen zakrylo: rozdíl se vracel dál. Teď se čeká, dokud se
počet prvků dvakrát po sobě nezopakuje (nejdéle 5 s). Dvakrát po sobě
zeleně.

Mimochodem: při hledání se ukázalo, že pořadí výpisu se mění i mezi
dvěma návštěvami téhož dne — `js/poradi.js` přidává k dennímu otáčení
náhodné přihození uložené v `sessionStorage`. Je to tak schválně
a popsané to tam je; kdo si otevře dvě karty, uvidí dvě pořadí.

---

## 3dg. NALEZENO: výpis čekal na databázi, a když mlčela, neukázal se nikdy — *15. 10.*

Viz `docs/optimalizace.md`, položka 11. Shrnutí: úvodní stránka měla
dotaz do cizí databáze v témže `Promise.all` jako vlastní datové
soubory a `fetch` bez časového stropu nikdy neskončí. Při databázi
mlčící 20 s se první nabídka ukázala za 23 686 ms, při němé nikdy.
Opraveno lhůtou 2 500 ms — stejnou, jakou má `js/pozemek.js`, kde
tatáž oprava vznikla dřív a na úvodní stránku se nedonesla.

**Otevřený dluh:** stránka pozemku se z pozdní odpovědi překreslí,
úvodní ji zahodí. Celá mapa i výpis běží uvnitř `boot()`, který data
dostane jednou a dvakrát zavolat nejde. Doplnit to znamená vyvést
z `boot()` přípojku na dodatečné nabídky. Dnes to nepálí: inzerátů od
majitelů je v datech nula — až jich bude víc, musí se to udělat.

---

## 3dh. NALEZENO: sdílený odkaz na výřez mapy na pomalejším telefonu nefungoval — *15. 10.*

Našlo se to při hledání zbytečné práce, ne při hledání vady — a je to
vada vážnější než to, kvůli čemu jsem tam šel.

**Co se dělo.** `js/odkaz.js` zapisuje výřez mapy do adresy
(`#m=šířka,délka,zoom`) při každé jeho změně, a první taková změna je
ustavení mapy při startu. Obnova z adresy (`obnovZAdresy()`) běží
AŽ POTOM — takže na pomalém zařízení četla hash, který si web mezitím
přepsal sám. Sdílený výřez se tím ztratil a zahodil se do výchozího
pohledu na celou republiku.

**Naměřeno** (telefon 390 px, odkaz `#m=49.1951,16.6068,12`, tři běhy
v každé poloze, čekaný zoom 12):

| procesor | zoom po otevření |
|---|---|
| ×1 | 12, 12, 12 |
| ×2 | 12, 12, 12 |
| **×4** | **9, 9, 9** |
| **×6** | **9, 9, 9** |

Na rychlém stroji to fungovalo — proto si toho nikdo nevšiml. Na
telefonu, kterému to trvá, odkaz na konkrétní místo poslal příjemce
na celou republiku.

**Opraveno** tím, že se adresa čte, jak vypadala PŘI OTEVŘENÍ stránky
(`ADRESA_PRI_OTEVRENI`, zachycená při načtení skriptu, tedy dřív, než
se vůbec postaví mapa). Po opravě je zoom 12 při ×1 i ×6.

**Vedlejší zisk, kvůli kterému jsem tam původně šel:** odpadlo druhé
celé překreslení výpisu. Naměřeno (slabá linka, procesor ×4, medián
z pěti běhů):

| | první nabídka | hlavní vlákno zaneprázdněno | uklidní se v |
|---|---|---|---|
| před | 4 228 ms | 2 870 ms | 5 446 ms |
| **po** | 3 894 ms | **2 030 ms** | **4 475 ms** |

Telefon udělá o 840 ms méně práce (−29 %) a stránka se uklidní skoro
o sekundu dřív. Čas do první nabídky se skoro nezměnil — to druhé
překreslení běželo až po ní.

**Hlídá** `scripts/test-jedno-vykresleni.mjs` (v CI), obě poloviny:
při čisté adrese se výpis vykreslí JEDNOU, a sdílený odkaz se pořád
obnovuje (zoom i místo). Druhá polovina je stejně důležitá — kdyby se
opravilo jen to první, web by přestal umět to, kvůli čemu ta obnova
vznikla. Sabotáží ověřeno: s návratem ke čtení `location.hash` padnou
všechny tři kontroly.

**Jak se měří:** počtem vykreslení (`window.PK_VYKRESLENI`), ne časem.
Čas by na zatíženém stroji kolísal víc než rozdíl, který se hlídá.
A zkouška si schválně zpomaluje procesor čtyřikrát — bez toho se start
stihne dřív, než si `js/odkaz.js` stačí do adresy zapsat, a prošla by
ze špatného důvodu.

---

## 3di. Výpis vypadal „suše a roboticky" — karta nebyla karta — *15. 10.*

Majitel webu poslal snímek se slovy, že to vypadá strašně suše
a roboticky a že to má vypadat jako realitní web. Jádro se našlo
v jedné řádce stylopisu:

```
.opp-item{padding:0; border:0; background:none; box-shadow:none;}
```

Zaoblení a stín měla **jen fotka**; text ležel volně na pozadí stránky.
Jedna nabídka tak přecházela do druhé bez hranice a mezi obrázkem
a písmem nebyl žádný vztah. To není inzerát, to je výpis záznamů.

**Co se změnilo:**

| | dřív | teď |
|---|---|---|
| nabídka | text volně na stránce | vlastní bílá deska: vlasová linka, měkký stín, vzduch kolem textu |
| fotka | vlastní zaoblení i stín | horní část desky (dva zaoblené tvary v sobě dělaly dvojitý rám) |
| pozadí výpisu | bílé | tónované `--plocha-vypis` #F4F6F4 |
| cena | 22 px | 26 px, těsnější prostrkání, odsazená od řádku nad sebou |
| obec | holý text | se špendlíkem místa (maska v `--ikona-spendlik`) |
| odznaky | obdélníky s plnou linkou | pilulky, menší písmo, tenčí linka |

**Tónovaný podklad je ta věc s největším účinkem a nejmíň kódu.** Bílá
karta na bílé stránce se nezvedne, i kdyby měla stín — je z ní plocha
textu s linkami. Každý velký realitní web má pod kartami podklad.

### Pruhování, které jsem si vyrobil sám
Mezi hlavičkou a první nabídkou ležely **tři vlasové linky na 220 px**
(pod hlavičkou, nad hledáním, pod hledáním) a mezi nimi se střídala
bílá s tónovanou. Z dálky žebřík proužků, ne stránka. Panel s hledáním
má teď týž podklad jako výpis a jedinou bílou plochou v něm je samo
pole, kam se píše.

K tomu jedna linka navíc: `.map-app` měla `border-top` na y=105, tedy
přesně doprostřed prázdného pásma pod hlavičkou. Telefonní pravidlo ji
rušilo, ale základní `.map-app{border:1px solid var(--line-strong)}` je
zapsané později a přebíjelo ho.

### A oprava mého vlastního dřívějšího zásahu
Nadpis výpisu jsem předtím na telefonu schoval, abych ušetřil 28 px.
Zbylo nad výpisem holé **„1 923 na mapě"** — řeč stroje, ne nabídky,
a přesně ta „robotičnost". Nadpis je zpátky; vešel se na jeden řádek,
takže první nabídka klesla jen z 289 na 292 px (mez ve zkoušce je 330).
Osmadvacet pixelů za to nestálo.
