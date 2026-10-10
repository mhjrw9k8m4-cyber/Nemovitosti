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
čeho se styl upravuje. Čistič je týž, jakým prochází `css/styles.css`,
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

## 3v. Zkouška stability: dva pozorovatelé, kteří se rozešli — *rozpracováno 9. 10.*

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

**Co zůstává na majiteli:** pustit `supabase/hlidani-anon-uzce.sql`
v Supabase → SQL Editor. V repozitáři je to hotové a v balíku
`00-vse.sql` taky, takže kdo databázi zakládá znovu, dostane ji už
zúženou; v té dnes běžící je pravidlo pořád to staré.

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

## 7. První načtení mapy stáhne 256 kB — *já*

Změřeno v gzipu: data nabídek 79 kB, `js/min/main.js` 60 kB, mapová
knihovna 41 kB, stylopis 37 kB, stránka 23 kB, hranice krajů 15 kB.
Není to špatné číslo, ale největší položka jsou data, ze kterých je na
první obrazovce vidět pár desítek bodů.

Dalo by se posílat nejdřív tenký řez a zbytek dotáhnout. Je to ale
zásah do jádra aplikace a bez měření návštěvnosti (bod 4) se nedá
poznat, jestli se tím někomu uleví — zatím tedy ne.

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

## Co naopak nechybí

Ať je seznam poctivý v obou směrech. Hotové a ověřené: stahování ze
šesti zdrojů 4× denně s pojistkami proti tichému selhání, archiv
nabídek a změn cen, 2 062 stránek pozemků se srovnáním cen, odhad ceny
proti okolí, hlídání v aplikaci, účty, psaní mezi lidmi, poznámky,
offline režim, kontrola fotek AI modelem a kontrola databáze
(`scripts/kontrola-databaze.mjs`). Zkoušek je 185 souborů a každá
pojistka je prověřená sabotáží.
