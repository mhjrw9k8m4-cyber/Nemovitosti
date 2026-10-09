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
