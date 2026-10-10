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

## Co naopak nechybí

Ať je seznam poctivý v obou směrech. Hotové a ověřené: stahování ze
šesti zdrojů 4× denně s pojistkami proti tichému selhání, archiv
nabídek a změn cen, 2 062 stránek pozemků se srovnáním cen, odhad ceny
proti okolí, hlídání v aplikaci, účty, psaní mezi lidmi, poznámky,
offline režim, kontrola fotek AI modelem a kontrola databáze
(`scripts/kontrola-databaze.mjs`). Zkoušek je 185 souborů a každá
pojistka je prověřená sabotáží.
