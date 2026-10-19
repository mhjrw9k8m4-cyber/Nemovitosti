# Seznam technických optimalizací

Co je tady, je **změřené**, ne odhadnuté — u každé položky stojí číslo
a jak se zjistilo. Pořadí je podle toho, kolik to přinese, ne podle
toho, co je snadné. Odškrtává se po jedné; hotová položka si nechává
číslo i měření PŘED a PO, ať je vidět, co ta práce opravdu udělala.

Měřeno 14. 10. 2026 na hotovém stromu, prohlížečem (Chromium 1194)
proti místnímu serveru, bez mezipaměti.

## Výchozí stav — co která stránka stáhne

| stránka | požadavků | staženo | z toho stylopis | využito ze stylopisu |
|---|---|---|---|---|
| `index.html` | 40 | 1 566 kB | 230 kB | 29 % |
| `pozemky-okres-benesov.html` | 14 | 300 kB | 118 kB | 18 % |
| `pozemek-…` (detail) | 28 | 447 kB | 139 kB | 20 % |
| `pridat.html` | 22 | 359 kB | 118 kB | 19 % |

Zabaleno (gzip): stylopis `zaklad.min.css` 22,8 kB, `styles.min.css`
40,0 kB, `js/min/main.js` 62,3 kB, `vendor/leaflet/leaflet.js` 42,6 kB.

---

## 1. Stylopis podle rodiny stránek — *HOTOVO 14. 10.*

**Nález.** Každá stránka mimo úvodní dostane týž zkrácený stylopis
(118 kB, 22,8 kB gz) a využije z něj pětinu. Rozdělovač
(`scripts/rozdel-styly.mjs`) přitom umí vyjmout pravidla, která na dané
stránce zabrat nemůžou — jen se dnes pouští jen jednou, na dělení
„úvodní stránka × všechno ostatní".

**Změřený potenciál** (týmž rozdělovačem, jen s jinou cílovou skupinou):

| balík | stránek | syrově | gzip | proti dnešku |
|---|---|---|---|---|
| dnešní `zaklad.min.css` | 2 253 | 118 kB | 22,8 kB | — |
| jen stránky pozemků | 2 118 | 45 kB | 10,5 kB | **−12,3 kB** |
| jen přehledy (okres, kraj, druh, rozpočet) | 108 | 56 kB | 12,5 kB | **−10,3 kB** |
| zbytek (účet, formuláře, texty) | 27 | 109 kB | 21,2 kB | −1,6 kB |

**Hotovo.** Rozdělovač staví čtyři balíky místo dvou a každá stránka si
bere ten svůj. Naměřeno na hotovém stromu:

| stránka | staženo před | po | stylopis před | po | využito |
|---|---|---|---|---|---|
| přehled okresu | 300 kB | **237 kB** | 118 kB | 56 kB | 18 → 37 % |
| detail pozemku | 447 kB | **388 kB** | 139 kB | 80 kB | 20 → 34 % |
| `pridat.html` | 359 kB | **338 kB** | 118 kB | 97 kB | 19 → 23 % |

Zabaleno to dělá −9,7 kB na každé z 2 119 stránek pozemků a −10,4 kB na
108 přehledech. Důkaz, že se nic nerozbilo, dává `test-rozdeleni-stylu`:
otevře dvanáct zástupců rodin dvakrát (se zkráceným a s plným
stylopisem) a porovná **vypočtený styl každého prvku** — 522 vlastností
na prvek, u `drazby-pozemku-nabidky.html` to je 1 180 prvků. Žádný
rozdíl.

Tři zkoušky u toho spadly, protože jména balíků znaly nazpaměť
(`test-minifikace` napočítala 24 stránek z 2 253, `test-predloha` 265
odchylek a `test-nahledy-vypisu` hledala atribuci v balíku, který
výpisy už nenačítají). Všechny tři si teď seznam berou z rozdělovače,
takže další balík se do nich doplní sám.

### A nakonec i úvodní stránka (totéž, jen opačný směr)

Úvodní stránka si brala **plnou** očištěnou kopii, protože je jediná
s mapou. Jenže „má mapu" neznamená „má všechno ostatní": pravidla pro
formulář přidání, porovnávací tabulku, smlouvu nebo stránky rádce na ní
zabrat nemůžou. Dostala proto `css/uvod.min.css` — **827 pravidel pryč,
215 → 137 kB, 39,3 → 26,0 kB zabaleno**. Úvodní stránka tím stáhne
o 78 kB méně (1 566 → 1 488 kB).

`css/styles.min.css` zůstává jako úplná očištěná kopie, kterou si
nebere žádná stránka — je to jediná poctivá míra, proti které
`test-rozdeleni-stylu` porovnává vypočtené styly. Teď jimi prochází
i úvodní stránka: **2 079 prvků × 523 vlastností, žádný rozdíl**.

## 2. Úvodní stránka: 1 566 kB a 40 požadavků

`js/min/main.js` má 226 kB (62,3 gz) a Leaflet dalších 147 kB (42,6 gz).
V jednom souboru je přitom i to, co se na první obrazovce nepoužije:
kreslení výběru prstem, vrstvy úřadů, rychlý výběr, vývoz do tabulky.
**Změřeno pokrytím (bez jediného klepnutí):** z `main.js` se spustí
**41 %**, z Leafletu 47 %, z `hledani.js` 9 %, z `auth.js` 14 %,
z `vyvoz.js` 17 %. Zbytek jsou obsluhy, které čekají na klepnutí —
nejde je smazat, jde je natáhnout později.

Skripty přitom NEJSOU brzdou vykreslování: všech 26 má `defer` (jediná
výjimka, `cisteni.js`, je tak schválně). Jde tedy o objem a čas
zpracování, ne o blokování.

**Největší kus prvního načtení není kód, ale data:**
`data/opportunities.json` má 631 kB (79 kB zabaleno) proti 221 kB
(62 kB) u `main.js`.

### Změřeno a ZAMÍTNUTO: zkrácené odkazy v datech
Pole `url` stojí 26 % souboru (160 kB syrově, **19 kB zabaleno**).
1 632 z 1 957 odkazů má tvar
`https://www.bezrealitky.cz/nemovitosti-byty-domy/{id}-{slug}` a u 1 355
z nich se `{slug}` dá složit z obce. Kdyby se ukládalo jen `b:{id}`,
soubor by spadl ze 79,3 na **69,7 kB zabaleno**.

Neudělal jsem to. `data/opportunities.json` je **veřejná data**, na
která web sám odkazuje ze stránky `data.html` — a `"url": "b:975585"`
je formát, který bez znalosti našeho rozbalovače nikdo nepřečte.
Deset kilobajtů za to nestojí. (A kdyby se to jednou dělalo, musí
u toho stát kontrola, která rozbalí všechny odkazy a porovná je
bajt po bajtu s původními — jinak je to hádání.)

### Pokrytí přeměřeno 15. 10. — a čísla výš byla mírně optimistická
Rozsahy, které V8 vrací, jsou **vnořené**: nejdřív celá funkce, pak
uvnitř ní jemnější kusy, které ji přebíjejí. Kdo je jen sečte podle
`count > 0`, dostane u všeho 100 % (zkoušeno, vyšlo přesně to).
Značí-li se po bajtech v pořadí, jak je V8 dává, vyjde do okamžiku,
kdy se ukáže první nabídka, tohle:

| skript | gzip | spuštěno | nevyužito (gzip) |
|---|---|---|---|
| `js/min/main.js` | 62,9 kB | **37 %** | 39,6 kB |
| `vendor/leaflet/leaflet.js` | 42,7 kB | 45 % | 23,5 kB |
| `js/min/dotaz.js` | 5,5 kB | 33 % | 3,7 kB |
| `js/min/hledani.js` | 2,6 kB | **9 %** | 2,3 kB |
| `js/min/hlidani-logika.js` | 3,7 kB | 43 % | 2,1 kB |
| `js/min/okruh.js` | 3,4 kB | 39 % | 2,1 kB |
| `js/min/ceny.js` | 6,6 kB | 69 % | 2,0 kB |
| `js/min/mapove-vrstvy.js` | 2,2 kB | **9 %** | 2,0 kB |
| `js/min/vyvoz.js` | 2,1 kB | 17 % | 1,8 kB |
| `js/min/auth.js` | 2,0 kB | 14 % | 1,7 kB |
| ostatních 18 skriptů | 20,6 kB | — | 9,0 kB |

**Dohromady leží na kritické cestě odhadem 90 kB zabaleného kódu,
který se do první nabídky nespustí ani řádkou.** Smazat se nedá —
jsou to obsluhy, které čekají na klepnutí. Natáhnout později ano.

Pro rozvahu, co to vlastně znamená v čase: vlastních bajtů má úvodní
stránka **339 kB zabaleno** a na slabé lince (1,6 Mb/s, 150 ms,
procesor ×4) je první nabídka vidět za **4,3 s**. Pouhý přenos by
zabral 1,8 s; zbytek je rozbalení, překlad a spuštění. Proto má smysl
krájet kód, ne jen data.

## 3. `js/main.js` je 433 kB v jednom souboru

Zdroj, ne očištěná kopie. Čte se špatně a každá změna v něm znamená
znovu stáhnout celý balík. Rozdělit podle funkcí (mapa, výpis, filtry,
rychlý výběr, vývoz) — ale až po položce 2, aby se to dělilo podle
měření, ne podle dojmu.

## 4. Mrtvá pravidla ve stylopisu — *HOTOVO 14. 10., a našlo se u toho víc*

Hledání mrtvých tříd vyplavilo něco horšího než pár kilobajtů:
**69 stránek pořád neslo čtyřsloupcovou patičku, kterou majitel
odmítl.** Nebyly to zapomenuté soubory — jsou to ukončené nabídky
a generátor je schválně nepřepisuje, aby zůstal zachovaný obsah
inzerátu. Jenže patička není obsah, je to rám stránky: kdo na takovou
stránku přišel z vyhledávače, viděl jiný web než na zbylých 2 178.

Patička se proto skládá na jednom místě (`scripts/paticka.mjs`) a krok
při sestavení ji vepíše do každé stránky — **táž úprava, jakou už má
lišta**. Změřeno po ní: podob patičky byly čtyři, teď jsou dvě (kánon
a kánon + odkaz na kanál novinek na dvou stránkách, kde má co
nabídnout).

Teprve pak šla pravidla pryč: `.foot-grid`, `.foot-col`, `.foot-brand`,
`.foot-brand-col`, `.foot-tag` a zbytky po `.reviews` — **1 409 B ze
zdroje**, doloženo měřením 0 z 2 249 stránek. `.no-ext` zůstává: je to
záchranka v `:not(.no-ext)`, tedy způsob, jak u odkazu vypnout šipku
„ven z webu". Rozdělovač obsah `:not()` ignoruje, takže nic nestojí.

## 5. Drobná duplicita v generátorech

`slug()` je ve čtyřech skriptech, `esc()` ve třech. Každý si ji píše
sám. Riziko není ve velikosti, ale v tom, že se dvě kopie rozejdou —
na tomhle webu se to u cen i u rad už stalo.

## 6. Zkoušek je 218, v CI běží 212 — *MYLNÝ POPLACH, ale něco z toho bylo*

Chybějící soubor byl jediný a nebyla to zkouška: falešný server, který
si startuje `test-kontrola-e2e`. Jenže jmenoval se „test-server" —
schválně bez přípony a bez zpětných uvozovek, protože ten soubor už
neexistuje a `test-staticka` hlídá, že dokumentace jmenuje jen to, co
na disku opravdu je. Takže
vypadal jako zkouška, která v CI neběží —
a tahle položka vznikla právě z toho. Přejmenován na
`scripts/falesny-server-kontroly.mjs`; od té chvíle platí jednoduché
pravidlo: **co se jmenuje `scripts/test-*.mjs`, to v CI běží.**
Ověřeno: 217 z 217.

## 7. Zkoušky měřily telefon bez dotyku — *rozdělaná, první kus HOTOV 15. 10.*

**Nález.** Pravidla pro telefon tu nestojí za šířkou okna, ale za
`@media (pointer: coarse)` a `(hover: none)`. Prohlížeč je v kontextu
bez emulace dotyku **nevyhodnotí** — a okno 390 px bez dotyku je
„telefon s myší", zařízení, které neexistuje. Naměřeno: **ze 45
zkoušek, které si otvírají okno užší než 561 px, 17 dotyk nezapíná**,
a za dotykovými a hover dotazy je ve stylopisu **36 pravidel**.

Jak se to ukázalo: nová pojistka na překryv ovladačů mapy prošla i se
sabotovaným CSS, které majitel vyfotil jako rozbité (bod 3da
v `docs/co-chybi.md`). Tlačítko bylo bez dotyku vysoké 36 px, s dotykem
44 — a právě těch osm pixelů byl celý překryv. Není to poprvé: týž
příběh stojí ve `css/styles.css` u tokenu `--plocha-plovouci-plna`.

**Hotovo jako první ta nejdůležitější:** `test-rozdeleni-stylu`,
tedy zkouška, která dokazuje, že zkrácený balík stylopisu dává tytéž
vypočtené styly jako plný. Měřila jedinou kombinaci (390 px bez
dotyku), takže o žádném z těch 36 pravidel netvrdila nic. Teď projede
**dva profily** — telefon s dotykem a monitor bez dotyku — tedy obě
větve každého takového dotazu i dvě šířky:

| | před | po |
|---|---|---|
| profily | 1 (390 px, bez dotyku) | **2** (390 s dotykem, 1280 bez) |
| kontrol | 28 | **56** |
| srovnaných hodnot na úvodní stránce | 2 200 752 | 2 × ~2 190 000 |

**Sabotáž, která to dokazuje:** z `css/region.min.css` jsem vyjmul
jedno pravidlo z bloku `@media (pointer:coarse)`
(`.crumbs a{min-height:44px;display:inline-flex;align-items:center}`).
Výsledek: profil **telefon padá** (`nav.crumbs: block-size =
„38,8 px" zkrácený / „58 px" plný`, `a: align-items = „normal" /
„center"`), profil **monitor prochází**. Přesně ta díra, o které je
tahle položka — a staré měření by to nepoznalo ani jedním profilem.

**U toho se našla druhá slepá skvrna, horší.** V profilu monitor
zkouška napoprvé spadla na `img.leaflet-tile: opacity = „0,925"
zkrácený / „0,94" plný` — Leaflet prolíná dlaždice tím, že jim po
snímcích přepisuje `style.opacity`. Není to animace podle CSS, takže
`getAnimations()` o ní neví a dosavadní vynechávání animovaných
vlastností ji nezachytilo. Ale hlavně: **vlastnost, kterou prvku
nastavuje skript do atributu `style`, o stylopisu nevypovídá nic** —
v kaskádě ho přebíjí. Takové vlastnosti se teď vynechávají, ale jen
tam, kde je žádné pravidlo s `!important` pasující na ten prvek
nevynucuje (`opacity:1 !important` ve stylopisu je, ale jen na
`header:focus-within`, takže na dlaždici mapy nic neznamená).
Vynechaných hodnot je **1 602 z 2 180 910 (0,07 %)**, strop zkoušky je
2 %.

### Hotovo 9 ze 17 — a každá něco našla

| zkouška | co se změnilo | co se tím našlo |
|---|---|---|
| `test-rozdeleni-stylu` | dva profily (28 → 56 kontrol) | nic rozbitého, ale dokázáno sabotáží; u toho slepá skvrna s `style.opacity` |
| `test-okraje` | dva profily, **39 → 80 prvků** | **tři tlačítka nad mapou měla obrys 1,45 : 1** (WCAG žádá 3) |
| `test-afordance` | dotyk zapnut | nic — a ta zkouška přitom STOJÍ na tom, že na telefonu není `:hover` |
| `test-najeti` | dva profily, **65 → 129 prvků** | nic |
| `test-stabilita` | dotyk v profilu telefon | nic, CLS zůstává 0 |

**Nalezená vada: obrys tlačítek nad mapou.** `.map-reset` mělo
`border:1px solid rgba(31,81,56,0.22)`, což je proti vlastní bílé
výplni **1,45 : 1** — pod mezí 3 : 1, kterou WCAG 1.4.11 žádá u hranice
ovládacího prvku. Týká se tří tlačítek na úvodní stránce (vrátit výběr,
kreslit, barvy). Token `--obrys-tlacitka` (4,10 : 1) je přesně na tohle
a čtyři ostatní vedlejší tlačítka ho už berou — tahle tři se k nim jen
nikdy nepřidala. Proč to nikdo neviděl: stará zkouška měřila jen okno
390 px, kde se ta tlačítka vůbec neukazují.

**A u toho spadla jiná zkouška, která nemohla projít.** `test-barvy`
klikala do všech pěti filtrů kategorií — jenže kategorie bez nabídek
svůj čip schválně neukazuje a klepnout do něj nejde. Naměřeno v datech:
`sale` 1 845, `drazba` 100, `exekuce` 12, `obec` **0**, `majitel` **0**.
Zkouška čekala třicet sekund na prvek, který se nikdy neobjeví, a celý
běh skončil výjimkou. Ověřeno `git stash`: padalo to **i na čistém
stromu**, takže to nebyla chyba webu, ale zkoušky. Teď u prázdné
kategorie tvrdí to, co tvrdit lze (čip není vidět), a hlídá, že se
změřily aspoň tři.

### A u čtyř dalších se našly DVA pravé nálezy — *15. 10.*

Dotyk zapnut v `test-ceska-pismena`, `test-stranky`, `test-pridat`
a (podle zařízení, ne podle šířky okna) v `test-souradnice`. První tři
prošly hned; `test-pridat` ne — a to byl nález.

**`test-pridat` padala na 22 kontrolách z 71, a ani jedna nebyla
o webu.** Dvě chyby, obě v té zkoušce:

1. **Vzor adresy, který nikdy nic nechytil.** Geokodér se podstrkoval
   vzorem bez lomítek (`**` + jméno stroje + `**`). Dvojitá zvězdička
   v Playwrightu zastupuje úseky cesty oddělené lomítky, ne libovolný
   kus textu, takže se o `https://nominatim.openstreetmap.org/search?…`
   neopřel. Dotaz spolkla obsluha „všechno ostatní zahoď", geokodér
   vrátil `null` a odeslání skončilo hláškou „Nepodařilo se najít obec
   na mapě". Změřeno třemi vzory na téže stránce: bez lomítek
   **nechyceno**, s lomítky kolem jména stroje **chyceno**, s celou
   adresou **chyceno**. (Po opravě 22 → 12 chyb.)
2. **Servisní pracovník obsluhoval soubory sám.** Web má offline režim
   a jeho pracovník si od DRUHÉ navigace v témž kontextu začne soubory
   obsluhovat z mezipaměti — a jeho dotazy přes `ctx.route` NEJDOU.
   Podstrčený `config.js` tím přestal platit a stránka „moje inzeráty"
   se po odeslání formuláře zeptala **opravdové databáze na
   supabase.co**. Ta je v testu nedostupná, takže se ukázalo
   „nepovedlo se načíst" a karet bylo nula. Změřeno na téže stránce:
   bez vypnutého pracovníka **0 karet** a `pf-count` = „—",
   s `serviceWorkers: 'block'` **1 karta** a `pf-count` = „1".
   (Po opravě 12 → **0 chyb, 75 kontrol prochází**.)

Druhá past je plošná: **60 zkoušek podstrkuje přes `ctx.route`
a pracovníka nevypíná**, mezi nimi takové, které v jednom kontextu
navigují sedmkrát (`test-uvod`) i jedenáctkrát (`test-poznamky`).
Dnes jsou zelené — past kousne jen tam, kde zkouška na podstrčeném
souboru opravdu závisí — ale je to tichá mina. Obě pasti jsou proto
zapsané v `CLAUDE.md` v oddílu o testech.

**Zbývá 8 zkoušek**, v pořadí podle toho, jak moc měří vzhled:
`test-mapa`, `test-leaflet`, `test-mapa-pozemku` (zbylé oddíly —
překryv ovladačů už dotyk má), `test-odznak-zprav`,
`test-hlidani-prohlizec`, `test-profil-vypadek`, `test-chat-prohlizec`,
`test-vzorek-verdiktu`. U každé se musí
rozhodnout, jestli měří ROZVRŽENÍ (pak dotyk zapnout) nebo jen
chování na úzkém okně (pak to u ní napsat, ať se to nezkouší znovu).

## 8. Celá sada se po změnách nespustila — a bylo v ní pět nálezů *15. 10.*

**Nález.** Měnil jsem nabídku, patičku a balíky stylopisu a spoléhal se
na zkoušky, které se těch změn týkaly. Když jsem pustil **celou rychlou
sadu (105 zkoušek)**, padalo jich **jedenáct** — a šest z nich byl
následek těch úprav, ne jejich příčina. Lekce je jednoduchá a patří
sem, protože stála nejvíc času: *po každé úpravě rámu stránky se pouští
celá sada, ne jen „ta zkouška, která se toho týká".*

| zkouška | co padlo | co to bylo |
|---|---|---|
| `test-pisma` | „stránky se stylopisem se našly (23)" | **díra v měření**: hledala `css/(styles\|zaklad)` a po rozdělení na čtyři balíky viděla 23 stránek z 2 250 — přednačtení písma tedy nehlídala na 2 226 stránkách |
| `test-data` | „nahoře je účet a hned pod ním hledání" | pravidlo z doby před přestavbou nabídky |
| `test-typografie` | „každé prostrkání je na stupnici" | `0.09em` v nadpisu oddílu šuplíku — mimo stupnici |
| `test-pravni-stranky` | „znění se od zápisu data nezměnilo" (2×) | otisk bral i **rám stránky**, takže ho rozhodila nabídka |
| `test-vyhledavac` | „na každou stránku ze sitemap vede odkaz" | **pravá vada webu**, viz níž |
| `test-cisla-okresu`, `test-kam-dal`, `test-rozesilac` | `slug is not defined` / `esc is not defined` | moje chyba v položce 5 (viz tam) |

**Pravá vada: dražba po termínu zůstávala v `sitemap.xml`.** Výpisy
proběhlou dražbu schválně vynechávají (`js/terminy.js`, `poTerminu`) —
okresní stránky i strojové řezy. Mapa webu ji ale dál nabízela, takže
vznikla adresa, kterou vyhledávač zná, na kterou **z webu nevede ani
jeden odkaz**, a která nabízí termín v minulosti. Naměřeno:
`pozemek-brno-mesto-brno-xz2874.html` (dražba 14. 10.), den po termínu
**jediná osiřelá adresa z 2 119**. Stránka zůstává dostupná (kdo přijde
s uloženým odkazem, nemá dostat 404), ale dostane `noindex,follow`
a z mapy webu vypadne — táž úvaha, jakou si o sobě napsala ukončená
nabídka: *dražba, která skončila, nemá hledajícímu co nabídnout.*

**Oprava otisku právních stránek je svou povahou totéž, co ta vada.**
Otisk měl hlídat ZNĚNÍ, a bral i lištu a patičku — tedy věci, které se
mění, kdykoli se mění menu. Zkouška pak chtěla upravit „Poslední
úprava", což by u právního textu byla lež. Rám se proto z otisku
vyjímá; doloženo, že po vyjmutí je text obou stránek proti commitu
`43b42466` **znak po znaku totožný** (8 445 a 2 862 znaků).

## 5. (dokončeno) Jeden `slug()` a `esc()` místo jedenácti kopií

`slug()` byla v sedmi skriptech, `esc()` ve čtyřech. Nebyly to kopie
téhož: `slug()` měla **dvě různá provedení** — seznam patnácti českých
písmen, a rozklad NFD, který zvládne jakékoli písmeno s diakritikou.

**Změřeno, než se sjednotilo** (jinak je to hádání, protože na téhle
funkci drží adresy 2 119 stránek):

| měření | výsledek |
|---|---|
| texty v `data/**` | 5 233 |
| rozdílů mezi oběma podobami `slug()` na nich | **0** |
| rozdílů na 20 000 náhodných řetězcích | 702, a vždy jen na písmenech, která čeština nemá (ä ñ ô ü ö ł) |
| rozdílů mezi čtyřmi podobami `esc()` | **0** z 6 444 |

Kánonem je proto rozklad NFD (`scripts/text.mjs`): na dnešních datech
nepřejmenuje ani jednu stránku a u prvního cizího jména udělá to
správné. **Dvě kopie zůstávají schválně:** `test-misto-prahy`
a `test-graf-cen` si slug skládají samy, protože měřují jména souborů,
která tou funkcí vznikla — se společnou funkcí by měřily funkci sama
sebou.

`fmt()` se nesjednotilo a je to **změřené rozhodnutí**, ne opomenutí:
`String(n).replace(…)` dělá oddělovač obyčejnou mezerou, `Intl` tou
nezlomitelnou, a u neceločíselné hodnoty dá první „1 234.6" (anglická
tečka!), druhá „1 235" (zaokrouhlí) a `toLocaleString` „1 234,6". Tři
různé výsledky, ne tři kopie. Obyčejná mezera je navíc schválně:
`scripts/sazba.mjs` ji v číslech sám mění na nezlomitelnou (doloženo
v `data.html`: „1 957").

**Jedna past u toho:** `export { slug } from './text.mjs'` re-exportuje,
ale **nedá** jméno do místního rozsahu — a `regiony-meta.mjs`,
`generate-data-rezy.mjs` i `mail-sklad.mjs` si tu funkci používají samy.
Tři zkoušky spadly na `slug is not defined`. Správně je
`import { slug } from './text.mjs'; export { slug };`.


## 9. Servisní pracovník obsluhoval zkoušky — devět červených a jedna skrytá vada *15. 10.*

**Tohle je největší nález téhle série a stojí za to ho napsat celý.**

`sw.js` (offline režim) volá `skipWaiting()` **i** `clients.claim()`.
To znamená, že pracovník **převezme i tu stránku, která ho právě
zaregistrovala** — ne až tu příští. Od té chvíle obsluhuje `config.js`
a `data/*.json` on, a **jeho dotazy přes `ctx.route` nejdou**: co si
zkouška podstrčila, přestane platit a stránka dostane OPRAVDOVÝ soubor.

Následek je zrádný tím, že zkouška nespadne na „podstrčení nezabralo",
ale na něčem úplně jiném — a hledá se chyba ve webu:

| zkouška | na co padala | co se opravdu stalo |
|---|---|---|
| `test-mapa-pozemku` | „bez mapové knihovny se ukáže nehybný snímek — náhrada false" | knihovna se NEPODAŘILO zahodit, pracovník ji vydal z mezipaměti — náhrada tedy neměla proč naskočit |
| `test-vrstvy-mapa` | „podstrčená vrstva se nabídne — přepínačů 0" | stránka dostala opravdové `data/mapove-vrstvy.json`, zkoušela pět živých vrstev úřadů a žádná v testu neodpověděla |
| `test-pridat` | 12 kontrol o „moje inzeráty" | stránka se ptala **opravdové databáze na supabase.co** |
| `test-pamet` | výjimka `.toast-akce` je null | — |
| `test-poznamky` | poznámka není vidět | — |
| `test-chat-prohlizec` | po klepnutí do vlákna není psací pole | — |
| `test-hlidani-prohlizec` | timeout | — |
| `test-odhlaseni` | stránka nepotvrdí odhlášení | — |

**Jedno `serviceWorkers: 'block'` v kontextu spravilo osm z nich.**
Devátá (`test-poznamky`) padala po tom ještě na jedné věci, a byla to
taky slepota měření: hledala `.por-pozn`, což je třída VYSVĚTLUJÍCÍCH
odstavců pod tabulkou, ne moje poznámka (`.por-moje-pozn`).

**A při tom se našly dvě pravé vady webu** — obě na první obrazovce
telefonu, obě v pruhu nad výpisem:

1. **Cena první nabídky nebyla vidět.** Když je v datech dražba po
   termínu, přidá se do pruhu třetí tlačítko („Zobrazit dražby po
   termínu (1)"). Naměřeno na 390 px: pruh má 370 px místa, ale
   „Zobrazit dražby po termínu (1)" je 213 px a „Stáhnout výběr
   (1 930)" 167 — dohromady 386. Zalomilo se to pod sebe, pruh vyrostl
   z 98 na **148 px**, první karta spadla o 50 px a cena končila na
   857 px z 844. Z tlačítka šlo pryč slovo „Zobrazit", které nic
   nenese (číslo v závorce říká, že se něco skrývá): 157 px, dohromady
   330, pruh zpátky na 98.
2. **Rychlý výběr na telefonu neřekl, co udělá.** Věta „Dvacet karet
   přes celou obrazovku — doprava uložit, doleva schovat" se na
   telefonu schovávala celá, a to bylo o půl věty moc: druhá polovina
   je jediné místo, kde se člověk PŘED klepnutím dozví, co se
   s pozemkem stane. Přeměřeno: celá věta přidá 26 px (pruh na 124),
   samotná druhá polovina 10 px (pruh 108, pod mezí 110). Deset pixelů
   za to je dobrý obchod; šestina obrazovky za celou větu byl špatný.

**A je to dotažené plošně.** Pravidlo stojí v `CLAUDE.md`
a od 15. 10. ho hlídá **`scripts/test-zkousky-meri.mjs`** — statická
zkouška (bez prohlížeče), která projde všechny `scripts/test-*.mjs`
a tvrdí dvě věci:

1. kdo podstrkuje přes `route`, vypíná servisního pracovníka,
2. kdo měří okno do 560 px, zapíná dotyk,

a **výjimka musí mít napsaný důvod** (dnes je jich osm: `test-offline`
měří toho pracovníka, `test-mapa` má změřené rozhodnutí z bodu 3db
a šest zkoušek si o dotyku rozhoduje podle profilu nebo zařízení,
takže se staticky nepozná). Devátá kontrola hlídá, že výjimka
neukazuje na soubor, který už neexistuje.

Podle toho se pak doplnilo **69 kontextů v 54 zkouškách** —
dnes zelených, ale byla to mina: stačilo do takové zkoušky přidat
kontrolu, která na podstrčeném souboru stojí, a padla by na něčem, co
s webem nemá nic společného. Změřeno po doplnění: **rychlá sada 105
z 105, prohlížečová 108 z 108.**

U toho se našla ještě jedna díra téhož druhu: `test-rozdeleni-stylu`
kontrolovala velikost balíků podle ručně vypsaného seznamu
`['zaklad','pozemek','region']` — **`uvod` v něm chybělo**, takže jeho
137 kB nikdo neměřil. Jména se teď berou z rozdělovače.

**A dvě zkoušky po doplnění spadly — obě poučně.** `test-hlavicka`
a `test-naseptavac` si kontext staví z proměnné (`newContext(opt)`),
takže hromadná úprava z nich tu proměnnou vyhodila: naměřeno
`--vyska-hlavicky (NaN)` a terč „0×0 px". Opraveno na
`Object.assign({ serviceWorkers: 'block' }, opt)`.

`test-barvy` padla na kontrole, kterou jsem si do ní sám o pár hodin
dřív přidal — a **procházela do té doby ze špatného důvodu**: tvrdila,
že kategorie bez nabídek svůj čip neukazuje, a dokud obsluhoval soubory
pracovník, neměla stránka nabídky ŽÁDNÉ, takže neukazovala ani jeden
čip. S vypnutým pracovníkem se ukázalo, že čip „Obec" vidět JE, i když
v `data/opportunities.json` ta kategorie nic nemá — stránka totiž počítá
i živé inzeráty z databáze. Kontrola se proto ptá stránky, ne datového
souboru: čip, který není vidět, se přeskočí; do viditelného se klepne
a musí přijít karta. Je to přesně ten druh chyby, kterou tahle položka
hledá: zelená zkouška, která neměří nic.

---

## 10. Letecké náhledy stahovaly 4,5 MB cizích obrázků pro nabídky, na které nikdo nedojel

Tohle nenašlo měření, ale člověk: *„stránka je extrémně pomalá
a dlouho se načítá"*. Hledání trvalo jedno měření.

**Co se měřilo.** Úvodní stránka na displeji 390 px, prázdná
mezipaměť, servisní pracovník zakázaný. Počítaly se požadavky podle
hostitele:

| hostitel | požadavků |
|---|---|
| `server.arcgisonline.com` | **115** |
| `*.tile.openstreetmap.org` | 15 |
| `tcinuzftgmkvjjgvadky.supabase.co` | 1 |

Dlaždice podkladu hlavní mapy je těch patnáct OSM. Těch sto patnáct
z Esri jsou **letecké náhledy na kartách nabídek** — každá karta má
snímek poskládaný z dlaždic (`js/snimek.js`). A teď to podstatné:

| | snímků | dlaždic |
|---|---|---|
| nad ohybem | **1** | **4** |
| pod ohybem | 23 | 111 |

Z dvaceti čtyř náhledů je na telefonu vidět **jeden**. Ostatních 111
dlaždic si telefon stahoval pro karty, na které většina lidí ani
nedojede — a soupeřily přitom o linku s `opportunities.json`
a se skripty, bez kterých stránka nejde vůbec.

Při měření přes škrcenou linku vyšlo požadavků ještě víc: **226**.
Karty se totiž vykreslují dvakrát — nejdřív ze záložních dat v
`js/main.js`, pak z `data/opportunities.json` — a každé vykreslení si
dlaždice objednalo znovu.

**Proč to nejde atributem.** `loading="lazy"` platí jen pro HTML
`<img>`; uvnitř SVG se na `<image>` neuplatní (zkoušeno). Náhled je
přitom SVG schválně: skládá dlaždice, špendlík a popisku do jednoho
souřadného systému, který se sám zvětší na šířku karty.

**Co se udělalo.** Adresa dlaždice čeká v `data-href` a doplní ji
`PK_SNIMEK.probud()` ve chvíli, kdy se náhled přiblíží k oknu
(`IntersectionObserver`, rozpětí 600 px). O nové karty se stará
`MutationObserver` — karty se překreslují při každém filtrování, takže
jeden průchod po načtení by nestačil. Bez `IntersectionObserver` se
probudí všechno rovnou: radši pomalá stránka než stránka bez náhledů.
Totéž dostala **fotka od majitele** (`js/main.js`), která je ještě
větší — nahrává ji člověk z telefonu.

**Naměřeno (displeji 390 px, procesor ×4, gzip jako na Vercelu,
dlaždice 20 kB, medián ze tří měření):**

| linka | | do první nabídky | cizích dlaždic | cizích bajtů |
|---|---|---|---|---|
| LTE (10 Mb/s, 40 ms) | dřív | 2 936 ms | 231 | 4,51 MB |
| LTE | **nyní** | **2 646 ms** | **1** | **0,02 MB** |
| slabý signál (1,6 Mb/s, 150 ms) | dřív | 4 645 ms | 227 | 4,43 MB |
| slabý signál | **nyní** | **4 322 ms** | **1** | **0,02 MB** |

Při pevném čekání dvanáct sekund (tedy včetně dlaždic, které si
hlídač doobjedná pro karty u okna) to je **226 → 32 požadavků**.

**Dvě poznámky proti vlastnímu nadšení.** Za prvé: *čas do první
nabídky se zlepšil jen o 7 %*. Dlaždice stahování nebrzdily, běžely
vedle — co se ušetřilo, jsou cizí bajty a cizí požadavky, ne čekání.
Kdo platí za data nebo má slabý signál, pozná to hodně; kdo má LTE
a dívá se na hodinky, málo. Zbývající 4,3 s je jiná položka (viz 2).

Za druhé: **první měření bylo špatně.** Můj testovací server posílal
soubory nezabalené, kdežto Vercel posílá gzip. Z toho vyšlo
9 290 ms místo 4 645 ms — tedy dvojnásobek. Číslo bez zabalení neměří
tenhle web, ale cizí server. Opraveno; v měřidle teď gzip je.

**Hlídá to** `scripts/test-line-dlazdice.mjs` (v CI). Prověřeno
sabotáží v obou směrech: s adresou zpátky ve značce padnou tři
kontroly (*„objednáno 108 dlaždic z 24 náhledů"*), s vyřazeným
probuzením padnou dvě jiné (*„s adresou 0 dlaždic — probuzení
nefunguje vůbec"*). Druhý směr je důležitý: líné načítání, které
nenačte nikdy, je horší vada než to, co se opravovalo.

---

## 11. Výpis čekal na cizí databázi — a když mlčela, neukázal se nikdy

Tohle je ta vada, kterou majitel webu hlásil jako *„stránka je extrémně
pomalá a dlouho se načítá"*. Našla se až měřením časové osy, ne
pohledem do kódu.

**První měření ukázalo, že viníkem není síť.** Telefon 390 px, slabá
linka (1,6 Mb/s, 150 ms), procesor ×4:

| | |
|---|---|
| FCP | 1 432 ms |
| vše stažené | **2 573 ms** |
| DOMContentLoaded | 2 404 ms |
| **první nabídka** | **4 621 ms** |

Dvě sekundy se tedy nestahuje, ale čeká. Profil procesoru ukázal
3 243 ms dlouhých úloh, z toho `(program)` (překlad skriptů) 1 190 ms,
cenový model 426 ms, `sortVis` + `declump` 304 ms.

**Jenže pravý viník byl jinde.** Úvodní stránka skládá výpis z pěti
zdrojů v jednom `Promise.all` a čtyři jsou soubory z našeho serveru.
Pátý je dotaz do databáze na inzeráty od majitelů — tedy do cizí
služby, která má na bezplatném tarifu studený start:

| databáze odpoví | první nabídka |
|---|---|
| hned | 4 264 ms |
| za 5 s | 9 187 ms |
| za 20 s | 23 686 ms |
| **vůbec** | **nikdy** |

Poslední řádek je ta vada: `fetch` bez stropu nikdy neskončí, takže
výpis zůstal navždy u šedých obdélníků — a 1 930 nabídek přitom už
dávno leželo v prohlížeči.

**Opraveno** lhůtou 2 500 ms. Co nestihne, to se nepočká: statický
soubor je ten web, inzeráty od majitelů jsou přídavek.

**Lhůta není vymyšlená — opsala se ze stránky pozemku.** Tam tatáž
oprava vznikla dřív (`ziveInzeraty()` v `js/pozemek.js`, s komentářem
„bez ní by na pomalé nebo spadlé databázi čekala i stránka obyčejné
stažené nabídky"). Poučení z devatenácti set stránek se tedy nedoneslo
na tu jedinou, kterou vidí každý první.

**Dluh, který u toho zůstal:** stránka pozemku se z pozdní odpovědi
ještě překreslí, úvodní ji zahodí. Celá mapa i výpis běží uvnitř
`boot()`, který data dostane jednou a dvakrát zavolat nejde (postavil
by mapu znovu); doplnit to znamená vyvést z `boot()` přípojku na
dodatečné nabídky. Dnes to nepálí — inzerátů od majitelů je v datech
nula.

**Hlídá** `scripts/test-zive-strop.mjs` (v CI), ve třech polohách:
databáze rychlá, mlčící 8 s a němá úplně. Prověřeno sabotáží — bez
stropu padnou tři kontroly a u němé databáze se naměří
*„němá null ms"*, tedy nabídky se neukázaly vůbec.

### Co z toho NEPLYNE
Zbylé zpoždění (4,3 s do první nabídky při zdravé databázi) je pořád
hlavně práce hlavního vlákna, ne síť. Měřil jsem i strop toho, co by
přineslo odložení Leafletu a osmi vedlejších skriptů: **stránka se
pak neukáže vůbec.** Výpis je totiž navázaný na mapu — `syncMarkers()`
nastaví `lastVis` a hned volá `updateMapView()`, takže bez Leafletu
nevznikne ani seznam. Rozpojit to je položka 3 (rozdělení
`js/main.js`), ne drobná úprava.

### A jedna oprava mého vlastního závěru
Měřidlo napočítalo 5 898 volání `MODEL.odhad()` na 1 930 nabídek a já
to nejdřív četl jako trojnásobnou práci. Není: `odhad()` má paměť
(`pametOdhadu`), takže drtivá většina těch volání jsou laciné zásahy
do ní. Celý cenový model stojí 426 ms, tedy devět procent — ne hlavní
chod.

---

## 12. Výpis čekal na 1 930 teček, které na telefonu nikdo nevidí

`syncMarkers()` stojí uprostřed `renderList()` — tedy DŘÍV, než se karty
zapíšou do stránky — a uvnitř rovnou kreslilo mapu: tečky, obrysy krajů
a závoj. Výpis tedy čekal na překreslení 1 930 teček. A na telefonu je
přitom mapa v základním pohledu schovaná
(`.map-app.mv-seznam .map-holder{display:none}`), takže se čekalo
na něco, co nikdo nevidí.

**Naměřeno** (telefon 390 px, slabá linka 1,6 Mb/s + 150 ms, procesor
×4), pět načtení v každé poloze:

| | jednotlivé běhy | medián |
|---|---|---|
| bez odložení | 4 327, 4 357, 4 473, 4 494, 4 584 | **4 473 ms** |
| s odložením | 3 998, 4 024, 4 040, 4 119, 4 580 | **4 040 ms** |

**O 433 ms rychleji** (10 %). Data pro výpis (`lastVis`) se nastaví dál
okamžitě — odkládá se jen kreslení, o jeden krok smyčky.

### Jedno měření tu neznamená nic
První běh po úpravě vyšel 4 877 ms, tedy HŮŘ než před ní — a kdybych
podle něj soudil, zahodil bych funkční opravu. Rozptyl mezi běhy je na
tomhle stroji přes 500 ms. Proto pětkrát a medián.

### Tichá vada, které se to muselo vyhnout
Tečky o jeden krok pozadu se na obrazovce nepoznají, ale zkouška, která
se na ně ptá hned po překreslení výpisu, by dostala stav před změnou —
a prošla by ze špatného důvodu. `mapaTed()` proto čekající kreslení
provede okamžitě a volá se ze všeho, co na tečky sahá (`PK_BARVY`).

### Co se u toho našlo a NEUDĚLALO
Měření ukázalo, že `renderList()` se při startu volá **dvakrát** (1 136
ms dohromady při procesoru ×4): jednou přímo z `boot()`, podruhé
z obnovy stavu hned po ní. Jedno z těch vykreslení je nejspíš zbytečné.

Nepustil jsem se do toho: jméno té druhé funkce jsem četl ze
zásobníku ZMINIFIKOVANÉHO skriptu, kde nemusí odpovídat zdroji, a obnova
stavu z adresy, z uloženého filtru a z návratu na pozemek jsou tři různé
cesty. Přestavovat podle nejistého čtení pořadí v osmitisícovém souboru
je způsob, jak rozbít něco, co dnes funguje. Zapsáno jako další položka.

## 13. Výpis se kreslil dvakrát každému, kdo se na web vrací *16. 10.*

Položka 12 končila tím, že `renderList()` se při startu volá dvakrát, a že
jsem se do toho nepustil: jméno druhé funkce jsem četl ze zásobníku
**zminifikovaného** skriptu. Tenhle zápis to dořešuje — ve zdroji, kde se
dá přečíst pořadí přesně.

Druhé volání je `if (obnovFiltr()) renderList();` na konci `boot()`, sto
řádků za prvním vykreslením. Komentář u něj to i přiznával: „Seznam se
vykresluje už dřív, takže po obnovení filtru se musí překreslit — jinak by
ovládací prvky ukazovaly filtr, který na výpis ještě nesedí."

**Proč to zkouška nenašla.** `scripts/test-jedno-vykresleni.mjs` hlídá, že
se výpis vykreslí JEDNOU, a procházela. Měřila ale čistou adresu
a prázdné úložiště — a `obnovFiltr()` se spustí jen tehdy, když v úložišti
leží `pk_filtr_v1`. Ten se uloží při prvním doteku kteréhokoli filtru
a zůstane tam. Zkouška tedy měřila jediný případ, ve kterém k té vadě
nedojde: první návštěvu.

**Naměřeno** (telefon 390 px, procesor ×4, medián ze tří běhů, čas
hlavního vlákna v úlohách přes `Performance.getMetrics`):

| | vykreslení | hlavní vlákno |
|---|---|---|
| bez uloženého filtru | 1 | 1 938 ms |
| s uloženým filtrem (před) | 2 | 2 465 ms |
| s uloženým filtrem (po) | 1 | 1 957 ms |

Tedy **půl sekundy práce navíc** u každého, kdo se vrací — a po opravě
je to stejné jako u první návštěvy.

**Oprava.** `obnovFiltr()` se volá o sto řádků výš, těsně před prvním
`renderList()`. Klíč `FILTR_KLIC` se musel přesunout nahoru k ostatním
klíčům úložiště: funkce jsou vytažené (hoisted), ale `var` by do té doby
byla `undefined` a obnova by tiše nenašla nic.

Pořadí je bezpečné a je to přečtené, ne odhadnuté: `obnovFiltr()` sahá jen
na ovládací prvky vyhledané kolem řádku 1044 a na proměnné filtrů; nic mezi
novým a starým místem filtry nečte. `renderHeroLegenda()` si čísla bere
z `DATA`, ne z vykresleného výpisu — má to u sebe napsané.

**Zkouška dostala tu chybějící polovinu.** Nově načte stránku, vloží do
úložiště filtr a načte ji znovu — a kontroluje obojí: že se vykreslí jednou
A že se filtr opravdu obnovil (záložka, cena, řazení, a že ve výpisu jsou
jen nabídky toho typu). Druhá polovina je stejně důležitá jako první:
oprava, po které web zapomene, co si člověk nastavil, je horší než ta
vada.

## 14. Souřadnice stály dva tisíce pixelů od mapy *16. 10.*

Na stránce pozemku byl mezi parametry řádek „Souřadnice" s číslem a dvěma
velkými tlačítky — „Kopírovat" a „Navigovat". Naměřeno na telefonu 390 px:
ten jediný řádek měl **230 px ze 400**, které celá tabulka parametrů měla,
a stál na 634 px, kdežto „Pozemek na mapě" začíná až na **2 697 px**.

Otázka „jak se tam dostanu" se přitom čte u mapy. Blok se proto přestěhoval
pod ni, kde stojí vedle ostatního ovládání mapy, a dostal podobu vlastní
karty: údaj nahoře, obě akce pod ním. Popisek, číslo i obě tlačítka byly
dřív čtyři volné prvky v jednom pružném řádku a lámaly se, jak zrovna
vyšla šířka — „Kopírovat" zůstalo u čísla a „Navigovat" spadlo samo přes
celou šířku. Teď jsou to dvě skupiny, takže se lámou jako celek: **96 px
místo 125**.

A hlavně: styl toho bloku se tím vystěhoval z vloženého `<style>`
v `pozemek.html`. Ten styl je kritický — nese první obrazovku a má strop
41 kB. Blok se souřadnicemi je nově hluboko pod přehybem, takže do něj
nepatří; vložený styl spadl ze **40,6 kB na 39,4 kB**.

### A u toho se našla zkouška, která měřila síť, ne kód

`scripts/test-poradi-pozemku.mjs` hlídá, že se celá stránka vejde do
4,2 obrazovky. Nezaclánila ale cizí požadavky — a mapa si u ČÚZK a dalších
úřadů zjišťuje, které vrstvy jedou, a podle odpovědi dokreslí řadu
přepínačů a legendu.

Naměřeno na téže stránce a témže kódu:

| | výška |
|---|---|
| bez mapových vrstev (služby nedojely) | 3 319 px |
| s vrstvami | 3 773 px |

**454 px, skoro tři čtvrtě obrazovky.** Zkouška tedy vycházela jinak
v sandboxu (služby blokované) než v CI, kde internet je — a dokonce i mezi
dvěma běhy vedle sebe, podle toho, jestli se odpověď stihla vrátit do dvou
a půl vteřiny.

Měří se teď v jednom známém stavu: cizí požadavky se odříznou, obrázky se
nahradí prázdným pixelem a Leaflet se podstrčí z místní kopie (bez něj by
se mapa nevykreslila vůbec a mez by změkla o celou mapu). Že se vrstvy
ukazují, když služby jedou, hlídají zkoušky mapy.

Prověřeno u toho i zbylých 35 prohlížečových zkoušek bez zaclánění:
jediné tři sahají na `scrollHeight` a ani jedna z nich ho neporovnává
s mezí — `test-ceny-hledani` měří stránku bez mapy vrstev, zbylé dvě jím
jen rolují. Tahle vada byla jedna, ne řada.

## 15. Okresní stránka měla dvaašedesát obrazovek *17. 10.*

Okresní stránka vypisovala všechny nabídky okresu — jiné typy stránek
strop mají (`STROP_RADKU` 60 u druhů, `STROP_ROZPOCET` 40 u rozpočtů),
tahle ne. Naměřeno na telefonu 390 px, okres Hodonín:

| | |
|---|---|
| nabídek ve výpisu | 114 |
| výška jedné karty | 417 px (medián) |
| výška stránky | **52 744 px = 62 obrazovek** |
| „Prohlédněte si okres na mapě" | 50 468 px |
| „Kde je v okrese nabídek nejvíc" | 50 739 px |

Dvě celé sekce tedy stály tam, kam se nikdo nedoroluje. Z 77 okresů má
31 přes pětadvacet nabídek a sedm přes padesát; u druhových stránek je
to dalších deset z třinácti.

**Zkrátit seznam ale nejde.** U Hodonína by se zahodilo 54 odkazů na
stránky pozemků, a ty jsou pro vyhledávač cesta dovnitř webu. Zbytek se
proto nezahazuje, jen skládá do `<details>`: obsah zůstává v HTML, čte
ho odečítač i vyhledávač a nepotřebuje to ani řádek skriptu — bez
JavaScriptu funguje `<details>` taky.

Po změně: **14 391 px** (17 obrazovek), mapa na 12 116 px místo 50 468.
Rozbalených zůstává 24 karet, zbytek je za ovladačem „Zobrazit zbylých
90 nabídek". Ovladač vypadá jako ostatní odkazy webu, ne jako nativní
trojúhelník — ten se v každém prohlížeči kreslí jinak.

### A zkouška, která tiše neměřila nic

Napsal jsem k tomu `scripts/test-dlouhy-vypis.mjs` a jeho nejdůležitější
kontrola zněla „na stránce je tolik nabídek, kolik jich okres v datech
má". Sabotáž (skutečné zahození zbytku výpisu) ji **nechala zelenou**.

Příčina: název okresu se četl z nadpisu vzorem `Pozemky v okrese (…)`
s obyčejnou mezerou, jenže krok sazby tam sází mezeru nezlomitelnou
(znak 160). Vzor se nechytil ani jednou, `continue` kontrolu přeskočil
u všech 77 stránek a zkouška hlásila úspěch, protože neměla co porovnat.

Je to past, kterou má tenhle repozitář popsanou už u `test-cerstvost`
(„vzor hlídá SLOVA, ne tvar mezery") — a stejně jsem do ní spadl.
Mezery se teď nejdřív srovnají a přibyla pojistka, která hlásí, kolik
okresů se opravdu porovnalo: kdyby jich bylo míň než 75, zkouška padne,
i kdyby všechny porovnané seděly.

## 16. Dva tisíce stránek zavíralo div, který neotevřely *17. 10.*

Statický výpis na stránce pozemku se vkládal takhle:

```js
h.replace(/<div id="pz-detail">[\s\S]*?<\/div>/, `<div id="pz-detail">${staticky}</div>`)
```

Vzor je **nenasytný**, takže se zastaví na PRVNÍM `</div>`. V předloze
je uvnitř ještě jeden div („Načítám pozemek…"), takže se nahradila jen
první polovina prvku a jeho vlastní zavírací značka zůstala navíc.
Každá z 2 140 stránek pozemků měla o jeden `</div>` víc, než otevřela.
Předloha `pozemek.html` přitom vyvážená byla — vadu dělal generátor.

**Proč se na to nepřišlo pohledem.** Prohlížeč přebytečnou zavírací
značku ignoruje, když není co zavřít, takže DOM vyšel správně: ověřeno,
že `#pz-detail` seděl v `main > .pz-wrap` a `<main>` neobsahoval
patičku. Na obrazovce tedy nebylo poznat nic. Platné HTML ale není
kosmetika: počítá s ním každý nástroj, který na rozdíl od prohlížeče
neodpouští.

Hranice prvku se teď najde **počítáním úrovní vnoření** (`nahradPrvek`),
ne regulárním výrazem — ten to neumí: nenasytný skončí u prvního
`</div>`, hladový u posledního na stránce. Když HTML vyvážené není,
funkce radši nesáhne na nic; pozná se to hned, stránka zůstane
s hláškou „Načítám pozemek…".

**Ukončené nabídky se znovu negenerují**, takže 221 stránek si tu vadu
neslo dál. Opravuje je migrace na přesný otisk té vady
(`</article></div></div>`, kde `</article>` uzavře statický výpis,
první `</div>` prvek `#pz-detail` a druhý je ten přebytečný) — ověřeno
na všech 221: vzor je na stránce právě jednou a po opravě vyjdou úrovně
na nulu u všech do jedné.

Hlídá `scripts/test-znackovani.mjs` přes všech 2 276 stránek. Měří
`<div>`, protože jich je nejvíc a nemůžou se uzavřít samy (na rozdíl od
`<li>` nebo `<p>`, kde prohlížeč zavírá za autora a nevyvážený zápis je
legální). A hlídá i sám sebe: do vzorku se vadu zkusí přidat a měření ji
musí poznat — jinak by zkouška mohla být zelená navždycky.

## 17. Dvě tlačítka lhala o svém stavu a CI bylo dva dny červené *17. 10.*

### Záložka na kartě říkala „Uložit" i poté, co uložila

Obsluha klepnutí na kartě výpisu dělala tři věci ze čtyř: přepnula
třídu, přepsala `aria-label` — a **viditelné slovo nechala být**.
Karta se překresluje jen při zapnutém filtru „jen uložené", takže
u uloženého pozemku dál stálo „Uložit", zatímco odečítač četl
„Odebrat z uložených". Změřeno klepnutím:

| | text na tlačítku | popisek pro odečítač | třída |
|---|---|---|---|
| před | `Uložit` | `Uložit pozemek` | ne |
| po (vada) | `Uložit` | `Odebrat z uložených` | ano |
| po (opraveno) | `Uloženo` | `Odebrat z uložených` | ano |

Na stránce pozemku bylo totéž tlačítko odjakživa v pořádku, takže
nešlo o rozhodnutí, ale o opomenutí na jednom ze dvou míst.
Hlídá `scripts/test-klic-ulozenych.mjs` — čtyři kontroly včetně cesty
zpátky (druhé klepnutí musí vrátit „Uložit"). Ověřeno sabotáží: po
odstranění jediného řádku zkouška spadne.

### Zvětšení mapy nabízelo zvětšit mapu, která už byla přes celou obrazovku

Tlačítko `#pzm-cela` nemá žádný text — veze jedinou ikonu se čtyřmi
rohy mířícími **ven**. Po zvětšení se měnil `aria-label` i bublina na
myši, ikona ne. Vedle sebe tedy stálo „Zmenšit mapu zpět do stránky"
a šipky ven; kdo odečítač nepoužívá, neměl z čeho poznat stav.

U tlačítka bez textu je ikona celé jeho sdělení, takže rohy se teď
obracejí dovnitř. Obě cesty leží v `js/pozemek.js` vedle sebe jako
`SIPKY_VEN` a `SIPKY_DOVNITR` a vykreslení si bere tutéž konstantu —
jinak by stačilo upravit ikonu na jednom ze dvou míst a tlačítko by se
po zvětšení překlopilo do jiného tvaru, než s jakým začalo.
Hlídá `scripts/test-mapa-pozemku.mjs`, taky ověřeno sabotáží.

### A hlavně: rychlá úloha v CI padala na chybějícím balíčku

`scripts/test-hledani-zavirani.mjs` a `scripts/test-lista-dole.mjs`
vznikly s histogramem cen a zapsaly se do úlohy `testy`, kde se
Playwright **neinstaluje**. Obě si ho berou importem hned v hlavičce,
takže v CI nemohly udělat nic než padnout na `Cannot find package
'playwright-core'` — a protože se tím zastaví celý běh, nespustilo se
za nimi nic dalšího. Přesně na tohle je
`scripts/test-staticka.mjs` a chybu opravdu našla. Jen se k ní dva dny
nikdo nedostal, protože moje místní dávka zkoušku přeskakovala podle
slova „playwright" **kdekoli v souboru** — a ta zkouška o něm mluví
v komentáři. Dávka teď hledá import, ne slovo, a seznam zkoušek si
bere přímo z `.github/workflows/testy.yml`, aby nemohl zestárnout.

### Pojistka na lži v komentářích byla slepá dvakrát

Kontrola „odkaz na soubor, který v repozitáři není" vznikla proto, že
dokumentace popisovala rozesílač, který nikdy neexistoval. Měla dvě
díry:

1. **Nečetla styly.** `css/styles.css` u třístupňové škály nadpisů
   tvrdilo „Hlídá scripts/test-nadpisy.mjs" — a taková zkouška není.
   Škálu přitom hlídá `scripts/test-jeden-styl.mjs`, takže
   kontrola existovala a jen se na ni odkazovalo jménem, které nikam
   nevede. Komentáře ve stylech jsou stejně podrobné jako v kódu,
   takže lhát umí stejně.
2. **Přiznání si obstarala sama cesta.** Zmínit chybějící soubor se
   smí, když se na témž řádku řekne, že chybí — a hledalo se to
   v celém řádku včetně té cesty. Jenže js/upozorneni.js (není tu)
   má ve jméně „neni", takže každá jeho zmínka se tvářila jako
   přiznaná absence. Ze sedmi zmínek odebraných Upozornění se dívala na jednu.

Po opravě (styly se čtou, cesta se z řádku vyškrtne a teprve zbytek se
čte jako věta o ní) prochází 2 733 souborů a všech sedm zmínek je
přeformulovaných tak, aby říkaly pravdu.

## 18. Tři tiché způsoby, jak web lhal o tom, co ví *17. 10.*

### Sken dražeb spolkl každou síťovou chybu

„OK dražby" se nestahují seznamem — projíždí se **3 021 ID po jednom**
a ptá se na každé zvlášť. Každá chyba u jednoho ID padala do prázdného
`catch`, takže běh, ve kterém se tři sta dotazů nedoručilo, vypadal
naprosto stejně jako běh, ve kterém portál opravdu měl míň dražeb.
Číslo z takového běhu pak šlo do `data/zdroje-historie.json` jako měření
a hlídač z něj počítal medián, podle kterého se hlásí úbytky.

Práh je **odvozený, ne hádaný**: ze 3 021 ID je dražba pozemku asi
1,5 %, takže desetina nedoručených dotazů znamená asi desetinu
chybějících nabídek — a o desetinu nižší číslo se už nesmí vydávat za
měření. Takový běh dostane vlastní stav `neuplne`, který

* `porovnejSHistorii` přeskočí (všímá si jen stavu `ok`), takže nespustí
  poplach o úbytku,
* `zapisDoHistorie` nezapíše (není v seznamu `ODPOVEDEL`), takže
  neotráví medián,
* a odznak na webu ukáže s vlastním popiskem: „část dotazů se
  nedoručila", ne „přinesl výrazně méně než jinak". To je jiné zjištění
  a vede k jinému hledání — u poklesu se čte parser, u neúplného skenu
  síť.

### Okno skenu se opíralo o číslo, které stárne

Sken začíná u nejvyššího ID z homepage; když se nenačte nebo se jí změní
podoba odkazů, spadne to na pevné číslo v kódu. To číslo bylo **27 100**,
zatímco dražby jsou dnes u **29 255** — sken by se posunul o dva tisíce
ID vedle a nenašel skoro nic. Dolní hranici teď drží i nejvyšší ID,
které už leží v datech; ta stárnout nemůže, protože se posouvá s nimi.

### A okno skenu se posouvalo pryč od dražeb, které v něm měly zůstat

Sken jde od nejvyššího ID o tři tisíce dolů. To okno se ale posouvá
s tím, jak dražeb přibývá — takže dražba, která je aktivní dlouho, z něj
jednou vypadne. **Zmizela by beze slova:** nebyla by v odpovědi, nic by
se nepokazilo, jen by jí ubylo. Naměřeno na ostrých datech: nejstarší
aktivní dražba má ID **27 070** při nejvyšším **29 255**, tedy rozpětí
2 185 — pod stropem, ale ne o moc.

Okno proto sahá i pod to, co už v datech leží (s rezervou 50 ID), a má
strop 6 000, aby ho jediný starý záznam nenatáhl donekonečna i s dobou
běhu.

### Bezrealitky samy hlásí, kolik jich mají — a nikdo to nečetl

Největší zdroj (92 % všech nabídek) se stahuje po stránkách po šedesáti
a smyčka se při chybě jedné stránky prostě **zastaví**. Zbytek se ani
nezkusí, takže se nemá co počítat jako selhání: běh vypadá úplný, jen
přinesl míň. Přitom v každé odpovědi chodí `totalCount` — počet inzerátů,
které zdroj na ten dotaz má. Vyžádal se a zahodil.

Používá se **opatrně**: co přesně `totalCount` počítá, se odsud ověřit
nedá (hostitel je ze schránky blokovaný), a kdyby počítal byť o kousek
víc než kolik vrací `list`, hlásil by se největší zdroj jako neúplný při
každém běhu a přestal by se zapisovat do historie — to by bylo horší než
vada, kterou to má hlídat. Číslo se proto použije jen tam, kde **už
víme**, že se smyčka utrhla chybou. Hlídá to vlastní kontrola: běh, který
došel do konce, se podle hlášeného počtu nesoudí, ať hlásí cokoli.

### U dražby chyběl termín právě tam, kde se čeká

Ze 109 dražeb a exekucí v datech má termín **všech 109** a **64 z nich je
do týdne**. U dražby je termín ta jediná věc, která nutí jednat.
E-mail ho posílá odjakživa (`scripts/mail-sklad.mjs`), stránka „Nové na
trhu" ho ukazuje — a dvě místa, kam se člověk dívá nejčastěji, o něm
mlčela:

* **karta hlídání** vypisovala „obec · výměra · cena" i o dražbě, která
  je pozítří,
* **uložené pozemky v profilu** taky, a právě uložený pozemek je ten,
  ke kterému se chce člověk vrátit včas.

Obojí teď počítá `js/terminy.js` — týž modul jako mapa, stránka pozemku
i pošta, aby web o téže dražbě netvrdil na dvou místech dvě různé věci.

### A v profilu se uložené pozemky vůbec nepárovaly

Tohle byla ze všeho nejtišší vada. Mapa ukládá pozemky pod klíčem
`obec|parcela|okres|šířka|délka#výměra` (`js/klic.js`), profil si ho
skládal po svém jako `obec|parcela|okres`. **Žádný uložený pozemek se
tedy v datech nenašel** — seznam vypisoval jen to, co se dalo přečíst
z klíče: obec, okres a odznak „Uložený". Žádný druh, žádná výměra, žádná
cena, a nikde nic, podle čeho by to šlo poznat. Porovnání
(`js/porovnani.js`) to přitom celou dobu dělalo správně, a to pod oběma
tvary klíče.

Změřeno před opravou a po ní, na třech uložených pozemcích (dva živé,
jeden už neexistující):

| | před | po |
|---|---|---|
| živý prodej | `Uložený · okres Kolín` | `Prodej · stavební pozemek · 900 m² · 650 000 Kč · okres Kolín` |
| živá dražba | `Uložený · okres Kolín` | `Dražba · orná půda · 2 400 m² · 310 000 Kč · okres Kolín · dražba za 3 dny` |
| skončená | `Uložený · okres Kolín` | `Nabídka skončila · okres Kolín · už není v nabídce` |

Ta třetí řádka je samostatný nález. Změřeno na archivu: za sedmnáct
říjnových dnů zmizelo **308 nabídek z 1 944** (skoro šestina) a medián
životnosti ukončené nabídky je **19 dní**. Uložený pozemek se tedy běžně
stane neexistujícím — a profil o tom mlčel a ještě nabízel „Zobrazit na
mapě", kde nebylo nic.

A opačná chyba, která by byla horší: „nenašel jsem" a „nemám kde hledat"
se nesmí plést. Když se data nestáhnou, nesmí profil prohlásit všechny
uložené pozemky za skončené — hlídá to `scripts/test-profil-ulozene.mjs`
vlastní kontrolou s nedostupným souborem.

### A hlídání, kterému nesedí nic, konečně řekne proč

Uložené hledání bez jediné shody dosud ukázalo „Celkem sedí: 0 pozemků"
a slíbilo, že až nějaký přibude, vypíše ho. Je to pravda a je to
k ničemu: člověk nepozná, jestli čeká na vzácnou nabídku, nebo si o dvě
stě tisíc níž uložil něco, co nemůže vyjít nikdy. **Hlídání, po kterém
nikdy nic nepřijde, si lidé vyloží jako rozbitý web, ne jako přísné
zadání.**

Odpověď se nehádá, měří se: každá uvolnitelná podmínka se zkusí vypustit
zvlášť a změří se, kolik by pak sedělo. Vrací se ta s největším nálezem:

> Zatím nesedí ani jeden pozemek. Nejvíc by pomohlo uvolnit **nejvyšší
> cenu** — bez té podmínky sedí 3 pozemky. Až nějaký přibude, vypíšeme
> ho rovnou sem.

Tři věci, na kterých to stojí a které hlídají zkoušky:

* **Místo a typ nabídky se nevypouštějí.** „V okrese Kolín nic není, ale
  v Táboře ano" není rada, je to popis toho, že hledání má smysl; a kdo
  hledá dražby, nechce slyšet, ať se podívá na prodeje.
* **Když nepomůže žádná jediná podmínka, řekne se to.** Polovičatá rada
  („zkuste cenu") by poslala člověka měnit něco, co samo o sobě nestačí.
* **Vybírá se největší nález, ne první nalezený.**

Cena výpočtu se měřila, ne odhadovala: devět pokusů nad dvěma tisíci
nabídek je devatenáct tisíc porovnání na jedno hledání — naměřeno
**554 ms za dvacet prázdných hledání**, a to na počítači. Místo a typ se
nevypouštějí nikdy, takže se jimi dá hromádka předem zúžit; po tom
zúžení je to **190 ms** za touž dvacítku a v okrese pár set porovnání
místo devatenácti tisíc.

## 19. Na stránce pozemku stálo nejdůležitější na třetí obrazovce *17. 10.*

Majitel: „když rozkliknu inzerát, informace nejsou seřazené podle
nejdůležitější k nejméně důležité." Tak jsem to změřil — pořadí
a svislou polohu každého bloku na telefonu 390 px, na živé nabídce
s popisem i sítěmi.

### Co se naměřilo

| obrazovka | blok | rozhoduje o |
|---|---|---|
| 0,2 | foto / mapka + odznak druhu | první dojem |
| 0,5 | nadpis: druh, výměra, obec | co to je |
| 0,7 | cena a Kč/m² | kolik |
| 0,8 | Parametry (výměra, Kč/m², druh) | — |
| 1,0 | Kategorie · Stav/zdroj | — |
| 1,2 | **verdikt ceny** | je to dobrá cena |
| 1,6 | Co byste měli vědět | co ověřit |
| 1,6 | tlačítko na inzerát | — |
| 1,8 | popis od inzerenta | co o tom říká prodávající |
| 2,2 | mapa | kde to je |
| **2,9** | **Sítě a vybavení** | **jestli se tam dá vůbec stavět** |
| 3,1+ | náklady, poznámka, katastr, kam dál | nástroje |

### Co z toho je vada

**Sítě a přístup na třetí obrazovce.** U pozemku je „vede tam cesta?"
a „je u toho elektřina?" otázka ANO/NE: pozemek bez přístupu je bez
ohledu na cenu něco jiného než pozemek s ním, a banka na něj nemusí
půjčit — říká to vlastní rádce `pristupova-cesta-pozemek.html`.
Rozhoduje to tedy **dřív než cena**, a stálo to **1 456 px pod**
parametry, až za mapou a za popisem inzerenta.

Sekce je přitom malá (dvě značky a věta, 110 px), takže ji stačilo
přesunout k parametrům. Naměřeno po přesunu: sítě z 2 458 px na
974 px, verdikt se posunul o 119 px dolů, **celková výška stránky se
nezměnila**.

**Kategorie dvakrát.** Odznak s druhem nabídky („Na prodej", „Dražba")
kreslí `heroLayers()` na úplný začátek stránky — a to v obou větvích,
s fotkami i bez nich, takže je tam vždycky. Řádek „Kategorie: Na
prodej" ho opakoval o 745 px níž, uvnitř bloku mezi klíčovými údaji
a verdiktem, tedy na nejdražším místě stránky. Tabulka po jeho
odebrání zhubla z 96 px na 48 px a zbylo v ní to, co opravdu přidává:
parcelní číslo a odkud je údaj.

Hlídá to `scripts/test-poradi-pozemku.mjs`, a to dvěma způsoby: na
stránce (sítě před verdiktem a před mapou) a — když na vzorku sítě
nejsou, protože o nich u té nabídky nic nevíme — v šabloně. Bez té
druhé cesty by zkouška nad prázdným vzorkem mlčky zezelenala.

### Co se změřilo a NEUDĚLALO

**Trojí opakování klíčových údajů.** Nadpis zní „Vodní plocha
14 101 m² — Nové Hrady", pruh pod ním „250 000 Kč · 18 Kč/m²"
a dlaždice „Parametry" ukazují znovu 14 101 m², 18 Kč/m² a Vodní
plochu — všechno do 250 px pod sebou. Vypadá to jako vata, ale není:
dlaždice ty hodnoty **pojmenovávají** („Výměra", „Cena za m²", „Druh"),
kdežto nadpis je věta, a u spoluvlastnických podílů nesou navíc
výhradu („váš podíl — celá parcela je větší"). Nadpis zároveň slouží
jako titulek pro vyhledávač, takže z něj ty údaje vyndat nejde.
Je to tedy cena za to, že SEO i čtenář potřebují totéž — ne vada.

**Popis od inzerenta až za tlačítkem.** Slova člověka, který pozemek
zná, stojí pod tlačítkem „Inzerát" — kdo klepne, nepřečte je. Posunout
je výš ale znamená posunout tlačítko pod polovinu stránky, a to je
mez, kterou `test-poradi-pozemku.mjs` hlídá schválně (dřív bylo
tlačítko až na čtvrté obrazovce). Jedno nebo druhé; rozhodnutí je na
majiteli, proto se tu nic neměnilo.

### A tlačítko „Na pozemek" bylo pod okrajem obrazovky *17. 10.*

Majitel poslal snímek malé mapy: „chybí tlačítko na vycentrování."
Tlačítko přitom existuje — ukazuje se, až se pohled odlepí od značky,
a vrací mapu přesně tam, kde začala. Měření ukázalo, proč ho neviděl.

Naměřeno na telefonu 390×844 po popojetí mapou:

| | mapa končí | tlačítko začíná | vejde se do okna |
|---|---:|---:|---|
| předtím | 555 px | **828 px** | ne — přetéká 28 px pod okraj |
| teď | 555 px | **569 px** | ano |

Komentář v kódu u něj tvrdil, že „v pruhu pod mapou je pořád na
dohled". Nebyla to pravda: v tom pruhu stálo až **za** podkladem
(Letecká/Základní), za tlačítky vrstev a za posuvníkem průhlednosti —
tedy v posledních šestnácti bodech obrazovky, a svou výškou 44 px
přetékalo pod okraj. Kdo mapou popojel, neviděl ho.

Opravou není plovoucí ovladač na mapě: ten už majitel dvakrát zamítl
a měl pravdu — mapa je na telefonu vysoká 300 bodů a každý plovoucí
prvek z ní ukusuje (naměřeno 130×44 px, tedy 6 % plochy). Tlačítko
proto zůstává v pruhu, jen je v něm **první**, ne poslední.

Hlídá to `scripts/test-mapa-pozemku.mjs` dvěma novými kontrolami:
celé se vejde do okna a od spodního okraje mapy je blíž než 80 px.
Ověřeno sabotáží: po vrácení na konec pruhu kontrola padne.

### Čtyři ovladače v jedné sestavě, dva různé tvary *17. 10.*

Majitel poslal snímek hlavičky výpisu: „všechny ty rámečky by měly být
stejně velké." Změřeno na telefonu 390 px — a je to jinak, než to
vypadá:

| ovladač | výška | zaoblení |
|---|---:|---:|
| Uložené | 44 px | 14 px |
| Doporučené (řazení) | 44 px | 14 px |
| Procházet po jednom | 44 px | **999 px** |
| Stáhnout výběr | 44 px | **999 px** |

**Na výšce se shodovaly všechny čtyři.** Lišil se jen rádius: horní
dva měkký obdélník, dolní dva plná pilulka. Vedle sebe to čte jako dvě
různé komponenty — přesně ten pocit „skoro hotové", který se nedá
ukázat prstem.

Pravidlo webu přitom existuje a je zapsané u tokenu `--r-ovladani`:
*co se ovládá, má `--r-ovladani`; pilulka zůstává ODZNAKU (zapínatelnému
filtru) a kulatému tlačítku s ikonou.* „Procházet po jednom" ani
„Stáhnout výběr" odznaky nejsou — nic nepřepínají, spouštějí akci.

**A proč to zkouška nechytila.** `scripts/test-zaobleni.mjs` vymáhala
jen polovinu pravidla: v kódu stálo `if (e.pilulka) continue;`, takže
jako pilulka prošlo cokoli. Teď se vymáhá celé — pilulku smí mít
přepínač (pozná se podle `aria-pressed`, `aria-checked`, `role="switch"`
nebo třídy zapnutého stavu), kulaté tlačítko s ikonou, nebo prvek
z pojmenovaného seznamu výjimek, kde je u každé napsáno proč.
Změřeno, kdo v tom seznamu musí být: `opp-fav` a `opp-skryt` (přepínají
a mění si slovo, ale `aria-pressed` schválně nemají, aby odečítač
nečetl stav dvakrát), `filter-chip` (vypnutý nenese žádnou třídu)
a `add-jak-sum` (rozbalovátko, ne tlačítko).

Ověřeno sabotáží: s vrácenou pilulkou zkouška hlásí přesně
`mc-nastroj (pilulka, ale není odznak) ×4`.

### Nadpis úvodní stránky říkal jméno webu, ne co na něm je *17. 10.*

Majitel: „tenhle nadpis Parcelka je zbytečný, vypadá chudě a hnusně."
Má pravdu dvakrát.

**Opticky.** Totéž slovo nese lišta o kousek výš, takže pod sebou
stálo dvakrát: logo „Parcelka" a pod ním velké „Parcelka". Komentář
u toho pravidla si toho byl vědom („slovo pod lištou, která nese
totéž, ale vypadá jako vada") a řešil to tím, že pod nadpis přidal
ještě větu — tedy další řádek navíc.

**Věcně.** `<h1>` je to nejcennější místo stránky pro vyhledávač
i pro odečítač obrazovky, a bylo v něm jméno webu — jediné slovo,
které o obsahu stránky neříká nic. Popis se schovával uvnitř jako
`visually-hidden`.

Teď je v nadpisu ta věta: „Nabízíme **1 940** pozemků na prodej,
v dražbě a v exekuci — na jedné mapě." Počet doplní `js/main.js`;
bez skriptu zůstane „Pozemky na prodej…", což dává smysl taky. Dva
prvky se slily v jeden a stránka se zkrátila:

| | první nabídka — telefon | — monitor |
|---|---:|---:|
| předtím | 407 px | 474 px |
| teď | 403 px | **428 px** |

**A u toho se našla mrtvá proměnná.** `--h1-domu` (stupeň „titulní
stránka je plakát") nepoužívalo jediné pravidlo — plakát šel kdysi
pryč a stupeň po něm zůstal. Nadpis si přitom držel opsaných 40 px
**mimo stupnici**, a to i mimo dosah zkoušky: `test-jeden-styl.mjs`
hledá pravidla se selektorem `h1`, kdežto tohle byla pouhá třída.
Stupeň teď znamená to, co na té stránce opravdu je (jedna věta, ne
plakát: `clamp(20px, 2.4vw, 28px)`), nadpis ho používá a selektor je
`h1.uvod-nadpis`, takže ho zkouška konečně vidí. Ověřeno sabotáží:
po vepsání 22px hlásí `„h1.uvod-nadpis" = 22px`.

### Jméno v liště mělo mluvit, a šeptalo *17. 10.*

Majitel: „tady ten nápis by měl mít duši a být velký."

Bylo to 24 px na monitoru, 20 px na telefonu a **barva běžného
textu** — tedy slovo, které v liště nic neřídí: stejně barevné jako
věta pod ním. Zelenou značku nesla jen dlaždice 29 px vedle.

Teď je to **28 px na všech šířkách, prostrkání -0.03em a tmavá zeleň
značky** (`--copper`, 8,2 : 1 na bílé liště). Rodina
písma se nemění — na tomhle webu dělá rozdíl mezi nadpisem a textem
váha, velikost a prostrkání, ne druhé písmo (viz komentář
u `--font-display`), a jméno značky má mít jedno písmo. Dlaždice
vyrostla 29 → 32 px, což je navíc kresba v měřítku 1 : 1:
`assets/logo-mark.svg` má plátno 32×32.

**Výška hlavičky se u toho nesměla hnout** — stránka si pod ni dělá
místo pevným číslem (`--vyska-hlavicky`: 65 px telefon, 85 px
monitor). Drží to `line-height:1` a ta dlaždice: řádek jména je
28 px, dlaždice 32 px, takže o výšce odkazu rozhoduje dlaždice —
přesně těch 32 px, co tam byly dřív (20 × 1,6). Na monitoru je navíc
rezerva, obsah lišty je tam 44 px vysoký kvůli tlačítku v navigaci.

| šířka | hlavička předtím | teď | šířka jména |
|---|---:|---:|---:|
| 320 px | 65 px | 65 px | 120 → 155 px |
| 390 px | 65 px | 65 px | 120 → 155 px |
| 880 px | 65 px | 65 px | 120 → 155 px |
| 1041 px | 85,4 px | 85,4 px | 136 → 155 px |
| 1440 px | 85,4 px | 85,4 px | 136 → 155 px |

Mezera mezi jménem a navigací, kvůli které kdysi v liště stálo
„ParcelkaMapa", je i v nejtěsnějším místě (1041 px) 267 px.

Nová zkouška v `scripts/test-hlavicka.mjs` hlídá obojí najednou,
protože to jde proti sobě: nápis musí **zůstat velký** (někdo ho
příště zmenší, aby se lišta „uklidnila") a zároveň **nesmí hlavičku
zvýšit**. Měří velikost, váhu, prostrkání, že barva není barva
běžného textu, spočítaný poměr jasů proti liště, a že výšku odkazu
drží dlaždice, ne řádek písma. Ověřeno sabotáží: s vrácenými
původními hodnotami hlásí 8 chyb (velikost, prostrkání, barva
a příčina výšky, pokaždé na telefonu i na monitoru).

**Váha zůstala 700, a stálo to jeden omyl.** Napsal jsem 800 —
vypadalo to líp — a `scripts/test-pismo.mjs` to zastavil: stupnice
vah webu má čtyři hodnoty a končí na 700, s výslovným pravidlem
„nepřidávej novou, vezmi nejbližší, která tam je". Je to tak správně:
nápis nemá být jediné místo webu s vlastní vahou. U toho se ale
našla **lež v komentáři** u `@font-face`. Stálo tam, že osa sahá
do 800, protože „sedm pravidel webu si o ni říká (zvýrazněná slova
v nadpisech úvodu)". Ta pravidla jsou dávno pryč — o váhu 800 si
dnes neříká ani jedno. Zápis `400 800` zůstává, protože popisuje
**soubor**, ne stylopis; komentář to teď říká takhle.

**A jedna past u té sabotáže.** První pokus sabotoval
`css/styles.min.css` a zkouška prošla — úvodní stránka ten soubor
vůbec nenačítá, má vlastní balík `css/uvod.min.css`. Sabotáž
na rozděleném CSS musí trefit ten balík, který stránka opravdu
stahuje, jinak „projde" znamená jen „neměřím".

### Databáze: kde se četla celá tabulka *17. 10.*

Databáze se dala zkoušet celou dobu — `scripts/test-sql-cista.mjs` umí
na holém PostgreSQL 16 založit úplně všechno z `supabase/00-vse.sql` —
jen se v ní nikdy neměřil VÝKON. Nasypal jsem do ní 2 000 účtů,
50 000 inzerátů a 200 000 zpráv (ne dnešek: dnes jsou v tabulkách
jednotky řádků) a pustil `explain analyze` na dotazy, které web volá
nejčastěji:

| dotaz | kdy se volá | předtím | teď |
|---|---|---:|---:|
| `unread_count()` | při otevření **každé** stránky (odznak v menu) | 352,6 ms | **1,3 ms** |
| `my_threads()` | schránka zpráv | 183,0 ms | **5,7 ms** |
| brzda chatu „3 vteřiny" | při **každé** odeslané zprávě | 16,8 ms | **0,05 ms** |
| hodinový limit zpráv | tamtéž | 14,0 ms | **0,08 ms** |
| kvóta inzerátů účtu | při každém přidání inzerátu | 8,8 ms | **0,16 ms** |
| brzda „inzerát za 90 s" | tamtéž | 3,9 ms | **0,03 ms** |
| `my_listings()` | moje inzeráty | 4,2 ms | **0,21 ms** |

Příčiny byly dvě a jedna z nich mě nejdřív nenapadla.

**Chyběly dva indexy.** `listings.user_id` čte osm míst v SQL a index
na něm nebyl žádný; `chat_messages.sender_id` se čte dvakrát při každé
odeslané zprávě, taky bez indexu. Zajímavé je, že cizí klíče na tom
byly dobře — katalog databáze ukázal **nula** cizích klíčů bez indexu.
Chyběly indexy přesně tam, kde vazba *není* cizí klíč.

**A pak to OR.** `my_threads()` i `unread_count()` se ptaly „buď jsem
kupující, NEBO jsem majitel inzerátu" jednou podmínkou. Takový dotaz
neumí PostgreSQL obsloužit indexem ani jedné strany a čte celou
tabulku zpráv. Nejdřív jsem z `my_threads()` vyhodil tři závislé
poddotazy (poslední zpráva, její čas a počet nepřečtených se počítaly
zvlášť pro každé vlákno) — vypadalo to jako ta pravá příčina.
**Naměřeno 189 ms místo 183 ms, tedy nic.** Teprve rozpad OR na UNION
dvou větví, z nichž každá jde po svém indexu, dal 5,7 ms. Bez měření
bych byl spokojený s tím prvním přepisem.

Obě podoby vracejí **přesně tytéž řádky** — porovnáno přes `EXCEPT`
v obou směrech, nula rozdílů. A protože to je výkonová oprava, kterou
jde snadno zase pokazit, hlídá ji zkouška, která v téže databázi
vyrobí i **starou podobu** a porovná ji s živou: shodu řádků a čas
poměrem (ne pevnou mezí v milisekundách, ta by na pomalejším stroji
hlásila planý poplach). Ověřeno sabotáží: s vráceným OR hlásí
„a je aspoň třikrát rychlejší" chybu, se zahozenými indexy hlásí
chybu „jde po indexu, ne přes celou tabulku".

**Čtyři podoby jedné funkce.** `save_search` přibírala parametry ve
čtyřech krocích (ceny, celé pozemky, střed a okruh) a každá podoba
v databázi zůstala. Nebyl to jen nepořádek: PostgREST si vybírá podle
jmen poslaných parametrů, takže kdyby klient jeden vynechal, uložilo
by se hledání TIŠE bez něj — třeba bez okruhu, a člověku by pak
chodila pošta z celé republiky. Zůstala jediná podoba. Mimochodem
právě tahle úklidová změna odhalila, že kontrola „anon nedostane nic
ze `save_search`" volala tu **nejstarší** podobu se sedmi parametry:
po jejím smazání by volání spadlo na „funkce neexistuje" a kontrola
by prošla, i kdyby funkce vracela cizí hledání komukoli.

**Tokeny spoléhaly na náhodu.** `confirm_token` i `unsubscribe_token`
slouží k tomu, že někdo BEZ přihlášení něco změní, hledají se podle
sebe sama a jedinečné nebyly — jen nepravděpodobné (`gen_random_uuid`).
Teď jsou jedinečné pravidlem databáze, a ten unikátní index je zároveň
to, po čem hledání jde. Totéž u `payments.stripe_session_id`: webhook
od Stripu umí přijít dvakrát a bez jedinečnosti by z jedné platby byly
dva řádky. Platby ještě neběží — pravidlo má být v databázi dřív než
první platba, ne po ní.

**Vazba, která byla jen v komentáři.** U `listings.payment_id` stálo
„vazba na tabulku payments". Žádná vazba to nebyla: sloupec nikdo
nečetl, nikdo nepsal a databáze o ní nevěděla. Teď je to cizí klíč.

**Úklid, který se nikdy nespustil.** `uklid_navstevnosti()` maže
čítače starší dvou let a existuje od začátku — v celém repozitáři na
ni byl jediný odkaz, a ten v komentáři jiného testu. `mail_poslane`
a `push_poslane` rostly úplně bez úklidu, přestože obě mají index na
čase (založený pro úklid, který se nenapsal). Přibyla funkce
`uklid_posty()` a hlavně `scripts/uklid-databaze.mjs`, který se pouští
z noční úlohy „Kontrola inzerátů" — tam, kde už servisní klíč je.
Úklid, který se nespouští, je jen slib.

### Robot: jedno 503 znamenalo šestihodinovou díru *17. 10.*

Každý zdroj si volal `fetch()` sám a každý jinak. **Osm z jedenácti
volání nemělo časový limit** — zaseknuté spojení by drželo celou úlohu
až do limitu GitHubu — a **žádné volání se neopakovalo**. Protože
robot běží jednou za šest hodin, byla z chvilkového výpadku
šestihodinová díra v datech. Hlídač zdrojů to pozná (`skenNeuplny`),
jenže poznat není totéž co přežít.

Všech jedenáct míst teď vede přes jeden `stahni()`:

* časový limit na každý pokus (20 s, u Apify 290 s),
* opakuje jen to, co má smysl: síťovou chybu a stavy 408, 425, 429,
  500, 502, 503, 504. Na 403 ani 404 se neopakuje — druhý pokus by jen
  přitížil cizímu serveru a odpověď by byla stejná,
* mezi pokusy čeká 1 s, 2 s a k tomu náhodný přídavek, ať tři zdroje
  nezaklepou ve stejnou milisekundu,
* **respektuje `Retry-After`**, když ho server pošle — ale ne přes
  třicet vteřin, aby jeden zdroj nezabral celý běh,
* u Apify schválně jediný pokus: ten běh trvá až pět minut a stojí
  kredit, opakovat ho znamená platit dvakrát za totéž.

**Co se schválně NEDĚLÁ: nic se neobchází.** Žádné střídání hlaviček
user-agent, žádné střídání adres, žádné předstírání prohlížeče. Robot
se představuje jmenovitě a pravdivě, a kdo ho nechce, má ho na co
zablokovat — to je cizí rozhodnutí a nepatří nám ho měnit. Jméno bylo
navíc v repozitáři **dvakrát jinak** (`www.parcelaka.cz`
a `parcelaka.cz`); pro člověka totéž, pro protistranu dvě různá jména.
Je v `scripts/bot-ua.mjs`, jednou.

Zkouška `scripts/test-stahovani.mjs` podstrčí vlastní `fetch()`
a hlídá čtyři věci, které jdou proti sobě: že se po chybě opakuje, že
se po 403/404 NEopakuje, že se čeká podle serveru, a že po poslední
marné zkoušce chyba vyletí, místo aby ji někdo spolkl. Sítě se
nedotkne.

### Tatáž funkce dvakrát na jedné stránce *17. 10.*

Web nemá bundler: stránka si načte moduly, které potřebuje, a modul si
nesmí nic doimportovat. Drobné pomůcky se proto psaly znovu v každém
modulu — změřeno **17 funkcí** s bajt po bajtu totožným dvojčetem
a **sedm dvojic**, které se potkávají na téže stránce, takže se stáhnou
obě.

Bajty jsou tu to menší zlo (jde o stovky znaků). Horší je rozejít se:
kdo opraví escapování HTML v jedné kopii a druhou nenajde, opraví půl
stránky a nic to neřekne.

Sloučit šlo jedno: `js/pozemek.js` měl vlastní `pkOtisk()`, přestože na
téže stránce leží `js/klic.js`, který totéž vyváží jako `PKKlic.otisk`
— a `pozemek.js` na `PKKlic` stejně sahá o pár řádků výš. U zbytku by
sloučení znamenalo novou závislost dražší než pět řádků kódu
(`js/hlidani-logika.js` běží i v Node v rozesílači a nesmí si
přitáhnout `js/ceny.js`, který sahá na DOM). Ty zůstávají — ale
pojmenované, s důvodem, a hlídané: `scripts/test-kopie-funkci.mjs`
hlásí každou NOVOU dvojí kopii a stejně tak dvojici ze seznamu, která
zmizela. To druhé je ten případ, kvůli kterému zkouška vznikla: zmizí
totiž i tehdy, když se **jedna kopie opraví a druhá ne**. Ověřeno
sabotáží.

Zkouška rovnou našla dvojici, kterou jsem při ručním procházení
přehlédl (`js/pridat.js:escHtml` a `js/snimek.js:esc` na `pridat.html`).

**A jedna chyba u toho.** Nový soubor jsem pojmenoval
`scripts/test-dvojnici.mjs` — a přepsal tím zkoušku, která se tak
jmenovala už dřív (týž pozemek pod dvěma inzeráty). Všimla si toho až
`test-staticka.mjs`, protože zkouška pak stála ve workflow dvakrát.
Původní je zpátky z gitu, nová se jmenuje `test-kopie-funkci.mjs`.

### Dva různé pozemky pod jedním klíčem *17. 10.*

Tohle našla sada sama, až na konci: `test-klic-ulozenych.mjs` hlásil,
že zbylé kolize klíčů se neliší jen cenou. Nebyla to moje změna —
přišlo to s daty robota a na čistém checkoutu by to padlo stejně.

Klíč pozemku je `pkey` (obec, okres, souřadnice na tři desetinná
místa) plus výměra. Když výměra chybí, dosadí se nula — a dva různé
pozemky na témže místě dostanou **týž klíč**. Změřeno v datech: 20
z 1 980 nabídek je bez výměry a jedna taková dvojice stojí ve Zlíně na
jedněch souřadnicích: **ovocný sad za 758 523 Kč a stavební pozemek za
6 104 Kč**. Uložit jeden znamenalo označit oba; poznámka napsaná
k jednomu se ukázala u druhého; „už jsem viděl" platilo za oba.

Rozlišuje je teď **druh**. Ne cena (mění se průběžně) a ne odkaz:
druh patří pozemku a drží i tehdy, když majitel nabídku stáhne
a vyvěsí znovu — kdežto odkaz se tím změní a klíč by přestal
označovat týž pozemek. (Právě proto `klicArchivu`, který si pamatuje
JEDNU NABÍDKU, odkaz používá — a kolizí má nula.) Starý tvar klíče se
dál čte, takže co si kdo uložil dřív, se neztratí.

Kolize různých pozemků: **1 → 0**, u pozemků s výměrou se klíč
nezměnil ani o znak.

### Dvě zkoušky, které hlídají zkoušky *17. 10.*

**Noční úklid běží se servisním klíčem — a výpisy běhů jsou veřejné.**
`scripts/uklid-databaze.mjs` dostává klíč, který obchází veškerá
oprávnění. `scripts/test-uklid-databaze.mjs` proto skript pustí
doopravdy, ale proti vlastnímu serveru na localhostu, a hlídá čtyři
věci: že bez údajů neudělá nic a skončí v pořádku, že chybějící
funkce v databázi (majitel ještě nepustil migraci) poradí, co s tím,
místo aby spadla, že selhání databáze je **varování, ne pád celé
noční úlohy** — a že se klíč neobjeví ve výpisu. Ověřeno sabotáží:
s klíčem dopsaným do chybové hlášky zkouška padá.

**A nejsilnější kontrola databáze mohla tiše nehlídat nic.**
`test-sql-cista.mjs` zakládá celou databázi na opravdovém PostgreSQL
— a když PostgreSQL není, přeskočí se. To je správné u člověka na
notebooku. V CI se ale balíček instaluje příkazem, který končí
`|| true` (aby úloha nespadla na výpadku zrcadla), takže kdyby se
jednou nestáhl, úloha by byla **zelená a neověřila by nic**. Workflow
teď nastavuje `PK_SQL_VYZADOVAN=1` a zkouška v tom případě končí
chybou. Ověřeno tím, že jsem PostgreSQL na chvíli schoval: s
proměnnou končí kódem 1, bez ní nulou.

### Detail inzerátu: co dělá stránku „technickou" *17. 10.*

Majitel: *„inzeráty působí uměle a neosobně — chybí dominantní fotka,
nahuštěný technický text, všechno má stejnou vizuální váhu, popis je
utopený, tlačítka jsou šedivá a schovaná."* Dvě věci z toho měření
vyvrátilo a je poctivé to říct dřív, než se začne něco „opravovat":

**Fotka nechybí někdy, chybí vždycky.** Změřeno: **0 z 1 982 nabídek**
má jedinou fotku — veřejné zdroje (dražby, SPÚ, inzeráty) je nedávají
a v datech pro ně není ani pole. Fotku může mít jen inzerát přidaný
přes náš formulář. Velká fotka v záhlaví tedy není věc vzhledu; muselo
by to začít u zdrojů dat.

**Záhlaví už dominantní je a není to ilustrace.** Vykresluje ho
`js/snimek.js`: je to skutečný satelitní snímek toho pozemku poskládaný
z dlaždic, 390 × 293 px na telefonu a 720 × 400 na monitoru. Sám jsem
se spletl — v měření vypadalo prázdně, protože jsem si v testovacím
prohlížeči blokoval externí obrázky, tedy právě ty dlaždice. (Dlaždice
se objednávají až u okna: jinak by úvodní stránka stáhla 2,23 MB
navíc, viz komentář v `js/snimek.js`.)

**Fixní spodní lišta na telefonu taky existuje** — `#pz-lista` s cenou,
cenou za m² a hlavním tlačítkem v akcentní zeleni; naskočí, jakmile
zmizí z dohledu cena i tlačítka.

Co se tedy opravdu změnilo:

| | předtím | teď |
|---|---|---|
| cena | 32 px | **40 px** (dlaždice mají 24, cena je konečně největší číslo stránky) |
| dlaždice | 3, bez značek | **3–4 se značkami** |
| čtvrtá dlaždice | — | **termín dražby**, nebo **podíl** |
| popis inzerenta | až ZA tlačítky | **před tlačítky**, na monitoru 18 px |
| řádek „Vlastnictví" v tabulce | vždy | jen tam, kde není dlaždicí |

**Čtvrtá dlaždice se ukáže, jen když má co říct.** Napsal jsem ji
nejdřív pro všechny — u běžné nabídky by stála „Celý pozemek", tedy že
tu nic zvláštního není. Taková výplň stojí celý další řádek mřížky
(naměřeno 134 px na telefonu), takže zůstává jen tam, kde nese
rozhodnutí: u dražby termín (má ho 148 ze 148), u podílu podíl (507
z 1 982). Jakmile je vlastnictví dlaždicí, mizí řádek v tabulce hned
pod ní, který říkal totéž (47 px a dvě tvrzení o jedné věci).

**A dlaždice, kterou jsem napsal jako první, byla lež.** „V nabídce ·
12 dní" — jenže **1 569 z 1 982 nabídek (79,2 %) má v `first_seen`
jedno a totéž datum**, protože se ten sloupec vyplnil najednou, když
vznikl. Stálo to i v komentáři o pár set řádků níž v tomtéž souboru;
našel jsem to až při čtení kódu kolem.

**Ikony byly chvíli neviditelné.** Vykreslily se, ale naměřeno
`svg 0 × 22 px` a barva `rgb(88,95,91)` místo měděné: popisky dlaždice
stylovalo `.pz-klic > span` (dvě třídy), kdežto značka měla
`.pz-klic-ic` (jedna). Prohrála na specificitě a výplň z toho pravidla
jí srazila šířku na nulu. Na snímku to vypadalo prostě „nic tam není".

**Mřížka dlaždic měla díru mezi 560 a 680 px.** Do řádku se vešly tři
dlaždice ze čtyř a čtvrtá zůstala sama: **359 px prázdna z 528, tedy
68 % posledního řádku**. `auto-fit` o počtu dlaždic neví, takže ji
neuměl zahnat; nahradily ho pevné stupně (1 / 2 / 4 sloupce) a `:has`
pro případy, kdy dlaždice nejsou čtyři. Změřeno na jedenácti šířkách
od 320 do 1 440 px a se třemi i se čtyřmi dlaždicemi: díra je všude
nula.

**Tři vlastní hodnoty mimo stupnici** chytila rychlá sada:
`padding-right:26px` (stupnice zná 24 a 28), `opacity:0.42` (mřížka po
0,05) a **řádkování 1,75**. Stupnice řádkování končí na 1,6 a v testu
stojí „vyber nejbližší hodnotu, nerozšiřuj ji" — volnější proklad
tedy neprošel a čitelnost popisu řeší to, co systém dovoluje: na
monitoru 18 px (18 × 1,6 = 28,8 px mezi řádky proti 25,6) a šířka
56 znaků.

Co jsem **neudělal**: dvousloupcové rozložení „tabulka parametrů |
popis" na monitoru. Ty dva bloky jsou v DOMu daleko od sebe (mezi nimi
verdikt o ceně a rádce) a posadit je vedle sebe by znamenalo přeskládat
pořadí, které se ladilo o den dřív. Je to samostatná práce, ne přívažek
k téhle.

Hlídá to `scripts/test-poradi-pozemku.mjs`: popis před tlačítky,
dlaždice se značkami, žádná výplňová čtvrtá dlaždice u běžné nabídky —
a že se u dražby termín opravdu ukáže, se měří **na skutečné dražební
stránce**, kterou si zkouška najde v datech. Natvrdo zapsaný odkaz by
za týden ukazoval na nabídku, která už skončila.

## 20. Uložené pozemky byly poslední věc, co zůstávala v jednom telefonu *17. 10.*

Poznámky k pozemkům chodily na účet (`supabase/poznamky.sql`), uložená
hledání taky (`supabase/saved-searches.sql`). To nejčastější — „tenhle
si schovám" — nechodilo nikam: seznam ležel v `localStorage` pod
`pk_fav_v1` a nic víc. Kdo si v autobuse uložil dvacet pozemků na
telefonu, doma na počítači neviděl ani jeden a tlačítko mu u všech
hlásilo „Uložit", tedy že uložené nejsou.

Databázová strana je `supabase/ulozene-na-uctu.sql`: tabulka `ulozene`
(klíč `user_id` + `klic`), RLS na čtení i mazání jen svých řádků
a čtyři funkce — `ulozeny_uloz`, `ulozeny_smaz`, `moje_ulozene`
a `ulozene_nahraj` pro hromadné nahrání jedním voláním. Dvacet
samostatných kol přes síť by na telefonu trvalo vteřiny a půlka by se
po cestě ztratila. Strop je 500 klíčů na účet; je to ochrana proti
tomu, aby si někdo z účtu udělal úložiště, ne škrcení člověka.
Vyzkoušeno na místním PostgreSQL 16: uložení projde, druhé uložení
téhož klíče nepřidá nic, hromadné nahrání dvou klíčů vrátí 2, mazání
projde a **prázdný klíč neprojde**.

**Těžká část nebylo ukládání, ale mazání.** „Mám to tady a na účtu to
není" jsou dvě různé situace a splést je znamená, že smazání nikdy
nedrží — na tom pohořely poznámky, než se to spravilo:

* klíč, který **už byl nahraný**, a na účtu teď není ⇒ někdo ho odebral
  na druhém zařízení, smaž ho i tady;
* klíč, který nahraný **nikdy nebyl** (uložený před přihlášením nebo bez
  signálu) ⇒ nahraj ho, nemazat.

Proto se vedle seznamu drží druhá mapa `pk_fav_nahrano_v1` — „co účet
určitě zná". Zápis jde vždycky **nejdřív do prohlížeče** a na účet až
potom, bez čekání: uložení musí být okamžité a nesmí se ztratit bez
signálu. Nepřihlášenému se nemění nic.

**Jedna chyba v tom byla a našla se čtením, ne testem.** Po hromadném
nahrání se značka „účet to zná" dávala **bez ohledu na to, jak volání
skončilo**. Kdo si uloží pozemek v metru, nahrání selže a značka přesto
padne — a příští sloučení ten klíč přečte jako „účet ho zná a teď tam
není", tedy jako smazaný jinde, a **smaže ho**. Z chybějícího signálu
by se tak stala ztráta dat. Značka se teď dává jen při úspěchu; nahrání
se zkusí příště znovu.

**Stránka pozemku taky musela stahovat.** Bez toho by pozemek uložený
na telefonu hlásil na počítači „Uložit" — synchronizace by běžela
jen na mapě, tedy přesně tam, kde to člověk nejspíš nehledá.

Hlídá to `scripts/test-ulozene-ucet.mjs` (21 kontrol v prohlížeči,
proti falešné Supabase, takže se měří celá cesta i mezi dvěma
„telefony"). Čtyři sabotáže, čtyři různé pády:

| co jsem rozbil | co spadlo |
|---|---|
| obrácená podmínka „nahraný ⇒ smaž" | 3 kontroly |
| „nikdy nemazat, co na účtu není" | smazání na jiném zařízení nedrží |
| odeslání i nepřihlášenému | uložení opustilo zařízení bez účtu |
| vypnuté stahování na stránce pozemku | 7 kontrol |

Zkouška se přitom ptá i na to, co se stát **nesmí**: nepřihlášenému
nesmí uložení opustit zařízení (uložené pozemky jsou seznam toho, o co
se člověk zajímá — bez účtu to není naše věc) a **jeden účet nesmí
vidět do druhého**.

**A tři větné sliby, které tím zestaraly.** Na stránce „Co si web
pamatuje" stálo, že uložené pozemky „na server nejdou"; ve výpisu
uložených se psalo „uloženo jen v tomhle prohlížeči"; a v kódu zůstal
komentář „účet na to zatím není". Všechno tři se opravilo — slib
o nakládání s údaji, který neodpovídá tomu, co web dělá, je horší než
žádný.

## 21. Mapa napřed rozbila čtrnáct zkoušek — a jedna z nich měla pravdu *18. 10.*

> **Dodatek z 18. 10. večer: výchozí pohled je zase SEZNAM.** Majitel si
> mapu napřed prohlédl na telefonu a rozhodl se pro seznam — vrátilo se
> to tedy tam, kde to bylo. Co z celé té cesty ZŮSTALO, a stojí za ni:
> paměť pohledu na dobu návštěvy (popsaná níž), pomůcka
> `scripts/zkouska-pohled.mjs`, která si pohled vyžádá **jménem**, a
> čtyři nálezy, které s pohledem nesouvisely vůbec. Zápis níž nechávám
> tak, jak vznikl — je to doklad o tom, co ta změna stála, a příště se
> podle něj dá rozhodnout rychleji.

Změna výchozího pohledu na telefonu (mapa místo seznamu, na přání
majitele) stála **čtrnáct padlých prohlížečových zkoušek ze 119**.
Deset z nich mělo jednu příčinu: výpis je v mapovém pohledu skrytý,
takže zkoušky čekaly třicet vteřin na tlačítka, která v DOMu jsou, ale
nejsou vidět. V hlášení to vypadalo jako „prvek chybí"; naměřeno
`y: 0 px`, `šířka 0 px`, `locator resolved to 24 elements` — tedy
„je jich čtyřiadvacet a ani jeden není vidět".

**Jedna z těch zkoušek ale nehlásila svou vadu, nýbrž moji.** Paměť
rolování (`scripts/test-pamet.mjs`, oddíl „návrat zpět vrátí člověka
tam, kde ve výpisu byl") padala správně: po mé změně se **každé**
načtení stránky otevřelo mapou, tedy i návrat z nabídky zpátky. Člověk
tím přišel o místo ve výpisu, které si prošel — a to je přesně ta vada,
která se tu kdysi pracně opravovala (dřív tam vycházela nula). Mapa
napřed má platit pro **otevření webu**, ne pro každé načtení stránky.
Volba pohledu se proto pamatuje na dobu návštěvy (`sessionStorage`,
klíč `pk_pohled_v1`); `localStorage` by z jednoho klepnutí udělal
nastavení, které si nikdo nezvolil. Platí to pro oba výchozí pohledy:
kdo si teď přepne na mapu a otevře z ní nabídku, vrátí se zpátky na
mapu, ne na začátek seznamu.

Statické značky v `index.html` se srovnaly s novým výchozím stavem —
dřív v HTML stálo „Seznam aktivní" a skript to po načtení obracel.

**Pomůcka pro zkoušky místo deseti opisů.** `scripts/zkouska-pohled.mjs`
(`naSeznam` / `naMapu`) a tři věci, které se do ní musely napsat, aby
nebyla horší než ten opis:

* **pohled se žádá jménem.** Zkouška podkladu mapy klikala na
  `.mvt-btn:not(.active)` ve významu „přepni na mapu". Jak se výchozí
  pohled obrátil, začalo to přepínat na seznam a dvě kontroly spadly na
  šířce 0 px;
* **čeká se na JS, ne na hodinky.** Tlačítka jsou ve statickém HTML, ale
  přepínají až od chvíle, kdy `js/main.js` navěsí obsluhu — klepnutí
  dřív by tiše nic neudělalo a zkouška by měřila skrytý pohled dál;
* **výsledek se ověřuje** na třídě `.map-app.mv-seznam` a při nezdaru se
  klepne ještě jednou.

Nová kontrola na paměť pohledu je v `scripts/test-prvni-obrazovka.mjs`
a prokázaly ji dvě sabotáže: zapomenout volbu ⇒ padne „po načtení
stránky znovu zůstane seznam"; vrátit seznam jako výchozí ⇒ padnou čtyři
kontroly (mapa po otevření, aktivní záložka, nová i příští návštěva).

**Čtyři nálezy, které s pohledem nesouvisely:**

* **Stránka „Moje data" mlčela o dvou klíčích**, které si web ukládá
  (`pk_fav_nahrano_v1`, `pk_pohled_v1`). Ta stránka slibuje úplný výčet,
  takže mlčení je tam chyba, ne drobnost — a našla to zkouška, ne já.
* **Zkouška hlídala doslovný zápis.** `test-mapa-pozemku` kontroloval
  regexem `arr.push(window.PKKlic.klicPozemku(d))`. Ten se změnil (klíč
  musí jít i na účet, takže leží v proměnné), ale záměr platí dál. Čte se
  teď **tělo** `toggleFav` a hlídá se, odkud klíč je; přibyla kontrola,
  že obě poloviny posílají na účet **týž** klíč, pod kterým uložily.
* **Ikony dlaždic měly o 0,22 px tlustší stopu** než zbytek webu
  (22 px × tah 1,8 v soustavě 24 = 1,65 px proti 1,43 px u 19px ikony;
  strop je 0,2 px). Zmenšeno na 20 px → 1,50 px.
* **Dvě natvrdo psané mezery mezi `</b>` a `<span>`** v `test-sliby` —
  táž třída chyby jako ty čtyři dřív, kdy oprava „14krajů → 14 krajů"
  rozbila vzory, které mezeru nečekaly.

## 22. Mezi tabletem a monitorem se stránka pozemku rozsypala *18. 10.*

Mřížka s cenou vpravo (720 px obsah + 340 px cena) začíná na 1 100 px —
pod ní se nevejde. Co se ale dělo POD tou mezí, nikdo neměřil: obsah se
rozpínal přes celé okno. **Naměřeno na 1 024 px** (iPad naležato, půlka
okna na monitoru): dlaždice parametrů **992 px**, zatímco odstavec popisu
drží čtecí míru **636 px**. Bloky téže stránky o 356 px rozdílné se
nečtou jako sloupec, nýbrž jako rozsypané bloky — a je to přesně ta
„nelogická vrstva obsahu", kterou šlo vidět a nešlo pojmenovat.

Míra je teď v pásmu 820–1 099 px stejná jako nad ním (720 px, vlevo),
takže se při změně šířky okna nic nepřeskládává. Místo vpravo zbude
prázdné — na monitoru tam patří cena.

**A rovnou past, do které jsem při tom spadl.** Napoprvé to stálo na
`#pz-detail > *{max-width:var(--m-sloupec)}`. Jenže selektor s ID
přebije třídu, takže to **rozšířilo odstavec popisu** z čtecích 636 px
na 720 — oprava šířky bloků by tím zhoršila to, co se opravdu čte.
Naměřeno a opraveno: míru má obal (`#pz-detail`), bloky se o ni podělí
a každý si svůj vlastní užší strop nechá.

Hlídá to `scripts/test-rozvrzeni.mjs` na čtyřech šířkách (820, 1 024,
1 099, 1 440) a měří OBOJÍ — že blok nepřeroste míru sloupce i že
přitom nezeširoknul odstavec. Sabotáž (vypnuté pravidlo) shodí tři
kontroly.

## 23. Co stojí start úvodní stránky na telefonu — změřeno, zatím neopraveno *18. 10.*

Profilováno na úvodní stránce při **čtyřnásobném zpomalení procesoru**
(střední telefon), nad místním serverem, tedy bez vlivu sítě:

| co | 1× CPU | 4× CPU |
|---|---:|---:|
| první nabídka ve výpisu | 1 188 ms | **1 692 ms** |
| dlouhých úloh (nad 50 ms) | 7 | 9 |
| nejdelší úloha | 279 ms | **367 ms** |
| součet dlouhých úloh | 1 000 ms | 1 654 ms |

Jedna úloha 367 ms znamená třetinu sekundy, kdy telefon nereaguje na
dotek. Skripty samy jsou po dřívějších úpravách v pořádku:
`js/min/main.js` leží **jen na úvodní stránce** (233 kB, 64 kB
gzipem; celkem 382 kB / 108 kB gzipem) a stránka pozemku si ho netahá.

**Kde ten čas je.** Z profilu (vlastní čas funkcí, 4× CPU): vyhodnocení
`main.js` 227 ms, `sortVis` 77 ms, cenový model `ceny` + `okoliCeny` +
`odhadSpocti` **221 ms** dohromady, `declump` 63 ms, Leaflet 77 ms.

**A tohle je to číslo, o které jde.** Obalil jsem `MODEL.odhad` a změřil
volání: **3 932 odhadů proběhne DŘÍV, než se vykreslí prvních 24 karet**
— tedy dvakrát na každou z 1 982 nabídek (druhé volání padne do paměti
výsledků, takže je levné), a hned po vykreslení ještě 1 942 percentilů.
Není to plýtvání z nepozornosti: výchozí řazení je „Doporučené" a to
potřebuje skóre pro **každou** nabídku, ne jen pro viditelné. Vnitřek
odhadu už jednou zlevněný byl (kroky se počítají až ve chvíli, kdy na
ně dojde) a `demand()` si výsledek pamatuje v `d._demand`.

**Co by to spravilo.** Odhad je deterministická funkce dat, takže ho může
spočítat generátor a prohlížeč jen přečíst hotové číslo — ušetří se těch
221 ms (13 % cesty k první nabídce na telefonu).

**A rovnou oprava toho, co jsem o tom napsal poprvé.** Stálo tu, že
`js/ceny.js` v Node neběží, protože sahá na DOM — **to je nepravda**
a vzal jsem ji z komentáře u povolené dvojí kopie v
`scripts/test-kopie-funkci.mjs` (opraveno i tam). Ověřeno: celý soubor
se v Node načte **bez jediné náhrady**, `postav` trvá 28 ms a odhad pro
všech 1 983 nabídek 69 ms. Generovat se tedy dá hned, a navíc TÍMŽ
kódem, co běží v prohlížeči — čímž padá i druhá obava (dva zdroje
pravdy o ceně tenhle web jednou pokazily: mapa měla vlastní kopii
výpočtu a u 34 nabídek tvrdila něco jiného než stránka pozemku).

**Rozhoduje to, co se posílá po drátě.** Změřeno gzipem:

| co by se posílalo navíc | raw | gzip | proti dnešním datům |
|---|---:|---:|---:|
| odhady jako objekty (13 polí) | 397 kB | **51 kB** | +64 % |
| odhady po sloupcích, zaokrouhlené | 62 kB | **15 kB** | +19 % |
| (dnešní `data/opportunities.json`) | 654 kB | 79 kB | — |

Patnáct kilobajtů gzipem je na LTE osm milisekund, na pomalém připojení
ale přes čtvrt sekundy — tedy víc, než kolik se ušetří na procesoru.
Objektová podoba je jednoznačně špatná, sloupcová vyhrává jen tam, kde
je signál. **Zajímavější je přitom druhá polovina:** stránka pozemku si
dnes tahá `data/model.json` (59 kB raw) jen proto, aby si jeden verdikt
spočítala sama. Tam by předpočítání bajty NEPŘIDALO, ale UBRALO —
verdikt je šest čísel a do vlastního datového ostrůvku stránky se vejde
zdarma. Jen je potřeba nejdřív doložit, že ty řádky nepotřebuje i seznam
srovnatelných pozemků pod verdiktem; dokud to není změřené, nechávám
obojí být.

**A spravedlivě k těm číslům výš:** „1,7 s" není prázdná obrazovka.
Změřeno při témže čtyřnásobném zpomalení procesoru: **první vykreslení
(FCP) 236 ms na úvodní stránce a 248 ms na stránce pozemku**, stránka
pozemku je celá načtená za 380 ms. Těch 1,7 s je čas, kdy je ve výpisu
první KARTA NABÍDKY — tedy až po nadpisu s živými čísly, hledání
a hlavičce výpisu, které jsou na obrazovce čtvrt sekundy po otevření.
(Měřeno 18. 10. dopoledne, kdy se úvodní stránka otevírala mapou;
pořadí prvků nad výpisem je v obou podobách stejné, čas k první kartě
taky — kreslí se z týchž dat a týmž kódem.) Dlouhé úlohy proto
nezdržují, co člověk vidí, ale to, jak rychle web reaguje na první
dotek.

Doměřeno i na stránce pozemku (4× CPU): `postav` tam stojí jen **7 ms**
(model se staví z malého souboru, ne z plných dat), takže předpočítání
verdiktu by tam ušetřilo bajty, ne čas — a zdaleka ne těch 110 ms, co
jsem čekal, než jsem to změřil. Nejdražší je tam `pvGrafOziv` (109 ms):
vynucené přepočítání rozvržení hned po vložení HTML, aby popisek
v histogramu nevylezl z karty. Běží to AŽ PO prvním vykreslení, takže
na tom, co člověk vidí, se to neprojeví — a odkládat to na pozdější
rámec by jen přesunulo tutéž práci a riskovalo poskok popisku (CLS má
strop 0,05).

Do té doby platí, co se změřilo: na výpis se na středním telefonu čeká
1,7 s a třetina toho je cenový model; obrazovka ale prázdná není.

## 24. K poznámce se člověk musel prorolovat celou stránkou *18. 10.*

Majitel to viděl na telefonu dřív než já: „Přidat poznámku by mělo být
hned nahoře." Změřeno, odkud kam: tlačítko je teď na **y 535 px**
(390 × 844), políčko poznámky leží na **y 2 436 px** — tedy **1 900 px
pod ním**, skoro dvě a půl obrazovky. Kdo se vrátí z prohlídky a chce
si zapsat, co viděl, musel projet celou stránkou.

**Nahoře je CESTA, ne druhé políčko.** Dvě pole na jednu poznámku by
znamenala dvě pravdy o tomtéž, a pořadí stránky („moje věci" patří
k sobě, dole) je změřené a hlídá ho `scripts/test-poradi-pozemku.mjs`.
Tlačítko tedy k políčku skočí, **rovnou do něj zaostří** (bez toho musí
člověk klepnout ještě jednou) a na chvíli ho obtáhne, aby bylo poznat,
kam přistál. Jakmile poznámka existuje, nahoře se z „Přidat poznámku"
stane „Moje poznámka" — na první obrazovce je vidět, že si u téhle
nabídky něco zapsal.

**Vedle nadpisu to nešlo a je to spočítané.** Nadpis má 28px písmo;
tlačítko měří 170 px, takže by nadpisu na 360px displeji zbylo 190 px —
čtyři řádky. Řádek „okres Benešov" má kolem 130 px, takže vedle sebe
vyjdou. Změřeno na 320 / 360 / 390 / 1 440 px: 170 × 44 px, nikde
nepřetéká a nikde nepřekrývá nadpis. Čtyřicet čtyři pixelů je mez, co
si web klade na dotykové terče.

**Dvě věci, které chytily zkoušky, ne já:**

* **Sabotáž „tlačítko zůstane skryté" shodila zkoušku timeoutem, ne
  pojmenovanou chybou.** Playwright na skryté tlačítko čeká třicet
  vteřin a pak celý soubor spadne — v CI by z toho nebylo poznat, co je
  špatně. Klepe se proto až po kontrole, že je tlačítko vidět.
* **Zvýraznění jsem napsal přes `box-shadow` a `test-vlozeny-styl.mjs`
  to odmítl:** `box-shadow` má `.pz-pozn-box` nastavený i ve vloženém
  stylu předlohy, takže by tutéž vlastnost řídila dvě místa a časem by
  se rozešla. Obtažení kreslí **outline** — ve vloženém stylu není, nic
  nepřeskládá (CLS) a ze stejného důvodu se píše `border-color`, ne
  zkratka `border`, kterou má předloha.

Devět nových kontrol v `scripts/test-poznamky.mjs`; sabotáž „zaostření
a zvýraznění pryč" shodí dvě z nich.

**A ještě jedna věc, kterou jsem si do toho zanesl sám:** skok jsem
napsal jako `behavior:'smooth'`. Stylopis sice `prefers-reduced-motion`
respektuje (vypíná `scroll-behavior`), jenže hodnota zadaná ze skriptu
to pravidlo přebije — a plynulé rolování přes dva tisíce pixelů je
přesně ten pohyb, kvůli kterému si ho lidé vypínají. Se zapnutým „méně
pohybu" se teď skáče rovnou a zaostřuje se hned (bez čekání na dojetí).
Měří to další tři kontroly (67/67) a sabotáž je shodí.

**Poznámka k metodě, protože mě to stálo jeden běh navíc:** první
sabotáž téhle věci jsem napsal tak, že za hodnotu v objektu připsala
`// SABOTAZ` — zbytek řádku se tím stal komentářem a celý modul přestal
být platný JavaScript. Zkouška spadla, ale na úplně jiné kontrole
(„na stránce pozemku je pole na poznámku") a s jedinou úspěšnou.
**Sabotáž, která rozbije syntax, nedokazuje nic:** neukáže, že kontrola
hlídá chování, jen že soubor musí jít přeložit. Platí ta druhá, která
vyměnila hodnotu za hodnotu.

**A ještě jedna zkouška k uloženým pozemkům na účtu**, protože jde
o situaci, která teprve nastane: mezi nasazením webu a puštěním
`supabase/ulozene-na-uctu.sql` odpovídá databáze na uložené pozemky
„takovou funkci neznám" (404). V tom okně se nesmí stát to nejhorší —
že web uložené pozemky **smaže**, protože je „na účtu nenašel".
Sabotáž (neúspěšné stažení brané jako prázdný účet) to shodí.

## 25. Dvě stránky se na úzkém telefonu daly posouvat do stran *18. 10.*

Přetékání do stran hlídá `scripts/test-konzole.mjs` — jenže chodilo po
webu na **1 280 a 390 px**, a 320 px (iPhone SE, levné Androidy) nikdo
neměřil, přestože jinde v repozitáři je to běžná šířka. Stálo to dva
tiché nálezy:

**1) Stránka pozemku: obsah 350 px v okně 320.** Vinu měla **tabulka
pro odečítač, kterou nikdo nevidí** — tatáž čísla, jaká kreslí histogram
cen, ve sloupcích. Třída `.visually-hidden` má `width:1px` a
`overflow:hidden`, jenže **tabulka `overflow` ignoruje** a její
nejmenší možná šířka vyhraje nad `width:1px`; absolutně umístěný prvek
pak roztáhne posuvnou plochu dokumentu (`clip` maluje, ale neměří).
Tabulka je teď zabalená v obyčejném `div`u s touž třídou — ten
`overflow` dodrží. Naměřeno po opravě: 320 px obsahu v okně 320.

**2) Stránka „přidat pozemek": obsah 349 px v okně 320 — ale jen
přihlášenému.** Políčko formuláře si drží vlastní nejmenší šířku
odvozenou z atributu `size` (dvacet znaků), **naměřeno 264 px**. Mřížka
`.add-grid` z toho udělala sloupec **329 px** uvnitř okna 320. Vidět to
nebylo ze dvou důvodů najednou: formulář se ukazuje jen přihlášenému
a zkouška po té stránce chodila nepřihlášená.

Opraveno dvakrát, a obojí schválně:

* `min-width:0` na políčkách formuláře — to je příčina;
* `grid-template-columns:minmax(0, 1fr)` místo `1fr` — `1fr` je zkratka
  pro `minmax(auto, 1fr)` a to „auto" znamená „nejmenší šířka obsahu",
  takže jediné přerostlé políčko roztáhne celý sloupec za okraj okna.

**Sabotáž ukázala, že stačí jedno:** když jsem odebral jen `min-width`,
zkouška prošla (mřížka to uhlídala). Shodí ji teprve odebrání obojího —
a pak padnou obě kontroly („žádnou stránkou nejde pohnout do stran"
i „nic nevyčuhuje"). Obě pravidla tedy zůstávají: jedno léčí příčinu,
druhé je pojistka pro příští políčko.

Od 18. 10. chodí zkouška i po **320 px**.

## 26. Pět ovladačů nad výpisem, pět různých velikostí *18. 10.*

Majitel poslal snímek telefonu s jedinou větou: všechna políčka mají mít
stejnou velikost. Měl pravdu a dá se to vyčíslit — tohle stálo nad
výpisem vedle sebe:

| ovladač | před | problém |
|---|---|---|
| hledání | 44 px, r14 | — |
| přepínač Seznam / Mapa | **54 px**, r10 | vlastní rámeček a výplň 4 px |
| „Uložené" | 44 px, **194 px** široké | — |
| řazení („Doporučené") | 44 px, **150 px**, **12px písmo** | strop šířky i menší písmo |
| „Procházet po jednom" | 44 px, **182 px**, **šedá výplň** | jiná plocha než pilulky nad ním |
| „Stáhnout výběr" | 44 px, **167 px**, šedá výplň | — |

Teď mají všechny 44 px, `--r-ovladani`, tutéž linku, 13px písmo (hledání
16 px — pod tím iPhone při klepnutí do pole zvětší celou stránku)
a **stejnou šířku**: dvojice se dělí o řádek na půl (181 px na 390px
displeji).

**Záložka v „Uložené" přitom nikdy neměla žádnou velikost.** Ikonu tam
vkládá `js/main.js` (BM_SVG) a v její značce není `width` ani `height` —
velikost jí musí dát styl a nikdy ji nedostala. Tlačítko bylo úzké
přesně na text, takže se ikona **scvrkla na nulu** a nikdo si toho
nevšiml. Jakmile se tlačítka srovnala na stejnou šířku, místo se našlo
a záložka vyrostla na **110 × 110 px přes půl řádku**, černá (bez
`fill:currentColor` zůstane výchozí). Šestnáct pixelů je táž míra, jakou
mají ikony v přepínači vedle.

**Dva pokusy, které měření vrátilo:**

* **Mřížka napoprvé rozsypala vnitřek tlačítek** — ta nenastavená ikona
  a druhý ovladač, který z řady vypadl, protože `.mc-akce` má
  `display:flex` níž v souboru a při stejné síle vyhrálo pozdější
  pravidlo (naměřeno: obě tlačítka 370 px na téže řádce). Po opravě
  ikony a se selektorem `.map-side .mc-akce` mřížka sedí.
* **Na 320 px dávaly dva sloupce políčka po 146 px**, kdežto „Procházet
  po jednom" potřebuje 160 a „Stáhnout výběr (1 942)" 167 — nápisy lezly
  přes rámeček a málem do sebe (vyfoceno). Pod 360 px se proto skládají
  pod sebe, každé na plnou šířku. Stejná velikost zůstává, jen jinak
  poskládaná.

Hlídá to nová `scripts/test-ovladani-vypisu.mjs` (16 kontrol na 390
i 320 px): jedna výška, jedno zaoblení, rovné dvojice, žádný nápis přes
rámeček a žádný posuv stránky do stran. Měří skutečné rozměry
v prohlížeči, ne zápis v CSS. Sabotáž (návrat k flexu a starému
přepínači) shodí **šest** kontrol.

## 27. Zkouška zaoblení nikdy nechodila po stránce pozemku *18. 10.*

Když se srovnal pruh nad výpisem (oddíl 26), udělal jsem si soupis tvarů
ovladačů na sedmi druzích stránek — výška × zaoblení × velikost písma.
Stránka pozemku jich měla **sedm**, stránka „přidat pozemek" **šest**:

| co | bylo | teď |
|---|---|---|
| „Otevřít v katastru" / „Sdílet" pod sebou | 52 px / **48 px** | obojí 52 px |
| „Kopírovat" a „Navigovat" pod mapou | **r10** | r14 |
| tlačítko zvětšení mapy | **r10** | r14 |
| přihlašovací karta: záložky / pole / tlačítko | **46 / 50 / 48 px** | 48 px |

**Proč to nikdo nechytil:** `scripts/test-zaobleni.mjs` vymáhá pravidlo
„co se ovládá, má `--r-ovladani`" — ale chodil po sedmi stránkách,
mezi kterými **stránka pozemku nebyla**. Je to přitom nejčastější druh
stránky na webu (2 159 kusů) a chodí se na ni z mapy i z vyhledávače.

Jakmile se do seznamu přidala, **našla hned dvě další porušení**, která
jsem okem minul: rozbalovátko „Co byste měli vědět" a **políčko na
poznámku** měly taky 10 px. Obojí je ovladač, ne plocha. Adresa se do
zkoušky bere z dat (`scripts/adresa-pozemku.mjs`), ne napevno — natvrdo
zapsaná nabídka jednou zmizí a zkouška by měřila prázdno.

Sabotáž (vrácení jednoho zaoblení na 10 px) kontrolu shodí, takže to
pokrytí není naoko. Čtrnáct dalších zkoušek, kterých se ty stránky
týkají, prošlo beze změny; vložený styl šablony je po přidaných
komentářích na 40,6 kB proti stropu 41 kB.

## 28. Ořízlý nápis, neviditelná záložka a hlavní akce, která nebyla vidět *18. 10.*

Majitel poslal snímek řady nad výpisem a tři věty: že je to graficky
špatně, že „procházet po jednom je jedna z hlavních věcí na webu, takže
by to mělo být nějak vidět", a že má být **u všeho ikonka**. Všechno
trojí šlo změřit.

### Co bylo naměřeno

| věc | naměřeno | kde |
|---|---|---|
| nápis „Obec, druh, cena…" | **145 px** textu do **135 px** místa | 390 px |
| řada hledání + přepínač | **331 px** do **300 px** šířky | 320 px |
| záložka v „Uložené" | **0 × 0 px** | 561 px a výš |
| lupa v poli hledání | **18 px**, ostatní značky 16 | všude |
| přepínač Seznam / Mapa | **46 px** vysoký, sousedé 44 | dotyk |
| „Procházet po jednom" | táž bílá plocha jako sousedé | všude |

První řádek je ten, který majitel vyfotil: nápis končil uprostřed slova
„cena". Druhý je horší a nebyl vidět vůbec — na 320px displeji se
přepínač do řady nevešel, a protože se zúžit nesmí (`flex:0 0 auto`),
**slovo „Mapa" leželo za okrajem obrazovky**. Stránkou to přitom nešlo
posunout, takže na to nevedla žádná cesta.

### Záložka, která v CSS „byla", a na obrazovce nebyla

Ikonu do „Uložených" vkládá `js/main.js` (BM_SVG) a v její značce není
ani `width`, ani `height`. Velikost jí dával stylopis — ale **jen
v bloku pro telefon** (do 560 px). Od 561 px výš tedy měřila 0 × 0 px:
tlačítko „Uložené" nemělo na tabletu ani na monitoru žádnou značku, jen
text. V oddílu 26 je popsaný opačný extrém téže chyby (110 × 110 px
a černá); tohle je ta tichá polovina, která vydržela o den déle, protože
nula nikoho netrkne. Míra se proto říká **jednou pro všechny šířky**.

### Co se změnilo

* **Nápis se vejde.** Lupa je blíž ke kraji (14 → 12 px) a odsazení
  zprava menší (14 → 10 px), přepínač užší (173 → **161 px**, menší
  výplň a mezera). Z 135 px místa je **155** proti 145px nápisu.
* **Pod 360 px se řada dělí na dva řádky** — pole přes celou šířku
  a pod ním přepínač jako dvě záložky. Na první obrazovce to nic
  nestojí: zkoušky prvního dojmu měří 390 px, kde řada zůstává
  jednořádková.
* **Linka přepínače je `outline`, ne `border`.** Okraj 1 px nahoře
  i dole dělal ze 44px tlačítek 46px ovladač, tedy o dva víc než
  u všech sousedů. `outline` s `outline-offset:-1px` vypadá stejně,
  ale do rozměru se nepočítá a dotykový terč zůstává 44 px. **Našla to
  až rozšířená zkouška**, ne oko — rozdíl dvou pixelů v jedné řadě
  nikdo nevidí, a přesně proto se měří.
* **Značka u každého ovladače.** Pět nových: stahování (šipka do
  přihrádky), hodiny u dražeb po termínu, lupa s plusem u podobných
  názvů, oko a přeškrtnuté oko u skrytých, šipka s čárami u řazení.
  Kreslí se do viewBoxu 24, velikost i tah dává jedno pravidlo
  (`.mcn-ic`), takže jsou všechny 16 px a tah 1,5 px na obrazovce.
  Značka řazení se bere z `data-ikona` na `<select>`, aby o ní
  rozhodovala stránka, ne obsluha rozbalovátka.
* **Hlavní akce je vidět.** „Procházet po jednom" má zelenou plochu
  a bílý nápis — týž jazyk, jakým web říká „zapnuto" u filtrů.
  **Velikost zůstává stejná** jako u sousedů; to si majitel vymohl
  o zprávu dřív a hlídá se to dál.
* **Jeden tvar i na monitoru.** „Uložené" bylo pilulka (`--r-pill`) bez
  plochy vedle bílých obdélníků s `--r-ovladani`; telefon to měl
  srovnané už dřív, teď to platí pro všechny šířky. Nářadí mělo
  `background:none`, ačkoli jeho vlastní komentář sliboval bílou.

### Zkouška

`scripts/test-ovladani-vypisu.mjs` vyrostla ze 16 na **26 kontrol**.
Nové hlídají, že každý ovladač má vykreslenou značku (ne značku
v kódu — nula se počítá jako „není"), že všechny značky mají tutéž
míru, že hlavní akce má jinou a **plnou** plochu než sousedé a že se
nápis v poli hledání vejde celý.

Šest sabotáží, každá vrácením jedné změny:

| sabotáž | shodila |
|---|---|
| odebraná značka u „Stáhnout výběr" | značku u každého ovladače |
| lupa zpátky na 18 px | tutéž míru značek |
| hlavní akce bez plochy | jinou plochu než sousedé |
| hlavní akce poloprůsvitná | plnou barvu, ne průhledno |
| větší odsazení v poli hledání | nápis se vejde celý |
| `outline` zpátky na `border` | jednu výšku v řadě |

Každá trefila právě tu kontrolu, kvůli které vznikla. Sabotáž
s odsazením shodila jen jednu ze dvou šířek — na 320 px je řada
rozdělená na dva řádky, takže tam pole má místa dost. Je to správně
a stojí to za zapsání: jedna kontrola na dvou šířkách nejsou dvě
nezávislé kontroly.

### Co na to řekla vlastní pravidla webu

Plná sada pak shodila **čtyři** další zkoušky — a všechny čtyři měly
pravdu. Stojí za vypsání, protože ani jednu z nich by oko nenašlo:

* **`test-odstupy`:** nová čísla 36, 7 a 5 px nebyla na stupnici odstupů.
  Opraveno na 32, 6 a 4 — stupnice má cenu jen potud, pokud se kvůli
  jednomu místu nerozšiřuje. (Řada se tím nezhoršila: pole má teď
  165 px vnitřku na 145px nápis, tedy ještě o čtyři víc než předtím.)
* **`test-zaobleni`:** zapnutá půlka přepínače má zaoblení 0, kdežto
  pravidlo zní „co se ovládá, má `--r-ovladani`". Je to ale půlka
  SLOŽENÉHO ovladače: zaoblení nese obal a ořezává jím obsah, a se
  čtrnáctkou uvnitř by se zelená půlka zakulatila i na vnitřní straně.
  Zkouška se proto naučila jednu úzkou výjimku — nula projde jen tehdy,
  když rodič má `--r-ovladani` **a zároveň** ořezává. Bez té druhé
  podmínky by stačilo cokoli zabalit do zakulaceného divu.
* **`test-okraje`:** „Uložené" a řazení zůstaly na telefonu bílé na
  skoro bílém pozadí (1,09 : 1) **bez okraje**. Nebyl to záměr: při
  sabotáži předtím vrátil hromadný `replace` v Pythonu linku na dvou
  místech místo jednoho a přepsal i pravidlo, kterého se netýkal. Je to
  poučení o metodě — sabotáž se musí vracet obnovením souboru, ne
  zpětnou záměnou řetězce, protože ten se trefí i jinam.
* **`test-hierarchie`:** sytou značkovou plochu smí na úvodní stránce
  nést nejvýš tři akce a „Procházet po jednom" byla čtvrtá. Zkouška
  k tomu rovnou říká, co se má stát: *rozhodněte, co je hlavní, místo
  zvedání stropu.* Ustoupila výzva v prázdném stavu „Pozemky od lidí" —
  ukazuje se, jen dokud žádný vložený pozemek není, stojí v čárkovaném
  boxu a vede na „Přidat pozemek", tedy na totéž co trvalé tlačítko
  v hlavičce. Dvakrát tatáž akce v plné zeleni je přesně to, čemu ten
  strop brání; výzvou být nepřestala, jen je teď obrysem.

Strop se tedy nezvedl. Zelená plocha na úvodní stránce zůstává na
třech a nese ji: tlačítko v hlavičce, „Zobrazit N pozemků" pod filtry
a nově „Procházet po jednom".

### A jedna červená, která s tím nesouvisela

`test-zlevnene-filtr` hlídá, jestli se vyplatí stahovat
`data/zlevneni.json`: archiv zná celou historii cen, poslední běh
robota jen změny proti včerejšku. Měřil to **podílem** — archiv musí
dodat víc než polovinu všech nalezených změn — a ten podíl spadl na
49 %. Změřeno den po dni z historie repozitáře:

| den | archiv | z běhu | podíl |
|---|---|---|---|
| 14. 10. | 38 | 25 | 60 % |
| 15. 10. | 38 | 27 | 58 % |
| 16. 10. | 39 | 30 | 57 % |
| 17. 10. | 41 | 30 | 58 % |
| 18. 10. | 40 | **42** | **49 %** |

Archiv je celé to období klidný (38–41, roste s počtem klíčů 69 → 76).
Co se zdvojnásobilo, je běh robota: 25 → 42. Podíl tedy spadl pod
polovinu, **aniž archiv o cokoli zeslábl**. Je to přesně tentýž hod
mincí, jaký ta zkouška v komentáři vytýká své ještě starší podobě
(„archiv dodal aspoň dvakrát tolik co běh" padlo na rovných 2,0).

Měří se proto nově **absolutní počet změn, o které by se bez archivu
přišlo** — na jmenovateli nezávisí a odpovídá přesně na tu otázku,
kvůli které zkouška vznikla. Mez je 30, tedy pod naměřeným pásmem
38–41 s rezervou, ale dost vysoko, aby kousla, kdyby archiv spadl na
polovinu. Podíl se dál vypisuje do hlášky, takže je posun vidět i ve
chvíli, kdy kontrola projde. Sabotáž (archiv zkrácený na dvanáct klíčů)
ji shodí: „bez archivu by chybělo 7 změn z 49 (14 %)".

## 29. Vysvětlivky k mapě byly psané nejmenším písmem na webu *18. 10.*

Majitel poslal snímek telefonu s pruhem pod mapou: *„dole je jen malý
nápis co je co, chtělo by to výraznější text, aby věděli, co ty barvy
znamenají."* Naměřeno na 390 px, jak to bylo:

| co | naměřeno | proč to vadí |
|---|---|---|
| písmo legendy | **12 px** | nejmenší stupeň, jaký web má — a to u jediného místa, kde se barvy vysvětlují |
| tečky | **10–12 px** | při téhle velikosti splývá kosočtverec (dražba) s trojúhelníkem (exekuce) |
| šířka pruhu | **304 z 390 px** | `max-width:calc(100% - 86px)` |
| nadpis | **žádný** | řádek čtyř slov s puntíky; nikde není řečeno, že je to klíč k mapě |

Ta `max-width` je nejzajímavější: **je to pozůstatek po stěhování.**
Legenda dřív PLAVALA nad mapou a musela uhýbat sloupci ovladačů vpravo —
proto si ubírala 86 px. Když se přestěhovala pod mapu (oddíl v tomhle
souboru o tom, že plovoucí legenda ukusovala 7 % plochy mapy), mez
zůstala. Pod mapou nemá čemu uhýbat a text se kvůli ní lámal na dva
řádky, i když místo bylo.

**Teď:** 13 px na telefonu a 14 na monitoru, tečky 14 px, plná šířka
a nadpis **„CO ZNAMENAJÍ ZNAČKY"** (při barvení podle ceny „CO ZNAMENAJÍ
BARVY" — legenda se mění s režimem, tak se s ním mění i nadpis). Nadpis
mluví týmž hlasem jako ostatní drobné popisky webu (`--popisek-proklad`,
verzálky, strojopis), takže nepřibyl patnáctý styl pro totéž.

Nadpis se přidává **až k hotovému obsahu**, ne na začátku: když v datech
není ani jeden druh, legenda zůstane prázdná a `.map-legend:empty` ji
schová. Se samotným nadpisem by se pruh ukázal a nevysvětloval nic.

Hlídá to `scripts/test-tvary.mjs` (17 kontrol místo 13): měří se **na
telefonu**, protože tam je místa nejmíň a tam to majitel vyfotil —
velikost písma, velikost teček, plná šířka pruhu i přítomnost nadpisu.
Čtyři sabotáže (zmenšit písmo, zmenšit tečky, vrátit `max-width`,
odebrat nadpis) shodí každá právě svou kontrolu.

## 30. Zkouška, která stála na tom, co zrovna vynese denní zamíchání *19. 10.*

`test-rychly-prohlizec` spadla přes noc, aniž se čehokoli v jejím oboru
dotkl. Příčina: skládá si klíč poznámky z toho, co karta **ukazuje** —
schválně, aby neopisovala implementaci. Jenže u pozemku **bez výměry**
to nejde: klíč je pak `pkey` + `#v0` + otisk druhu (`js/klic.js`) a ten
otisk na obrazovce nikde není. Zkouška brala prostě první kartu, a která
to je, rozhoduje denní zamíchání „Doporučených". Dnes vyšla Hrabová
s výměrou 0 a hlášení znělo:

    ✕ karta ukazuje výměru, ze které se klíč skládá
        karta Hrabová|—|Ostrava-město|49.767|18.282, výměra 0
    ✕ a uloží se pod klíč TÉ karty
        uloženo pod ["…#v0dprbxqq"]

**V aplikaci nebylo nic špatně** — poznámka se uložila přesně pod ten
klíč, pod který patří. Špatně bylo to, že zkouška sama neuměla klíč
poskládat, a tvářila se, že našla vadu.

Dobře na tom je jedna věc: **autor s tou možností počítal** a napsal si
přímo nad kontrolu „PŘEDPOKLAD: kdyby karta výměru neukazovala, složil
by se klíč `#v0` a kontrola níž by prošla na náhodě". Proto zkouška
spadla hlasitě, místo aby mlčky prošla na nesprávném klíči. Tohle je ten
rozdíl mezi křehkou a tichou zkouškou: křehká otravuje, tichá lže.

Opraveno dolistováním: hledá se mezi **prvními deseti** kartami ta
s výměrou. Kdyby žádná taková nebyla, řekne se to rovnou — mlčky měřit
dál by znamenalo prohlásit za ověřené něco, co ověřené není. Kontrola
klíče zůstává, co byla: sabotáž `klicPozemku` (klíč o jedničku vedle)
ji shodí.

## 31. Vyhledávání pozemků: pět dílů, pět různých vzhledů *19. 10.*

Majitel: *„vylepši vizuálně konečně to vyhledávání pozemků na další level
v úplnosti a profesionalitě."* Vyhledávání není jedno políčko — je to
pole, našeptávač obcí, odznaky rozpoznané z věty, odznaky druhů a panel
filtrů. Každý díl si žil vlastním životem; naměřeno na 390 px:

| co | bylo | teď |
|---|---|---|
| našeptávač obcí | **207 px z 370**, položky **57 px** (tři zalomené řádky) | přes celou řadu, jeden řádek na položku, 44 px |
| odznaky druhů | šedé `rgb(237,239,238)` vedle bílých sousedů | bílé jako sousedé |
| jejich šířky | 89 / 126 / 122 / 133 px | **181 px všechny** |
| značka druhu | **8 px** — kosočtverec splýval s trojúhelníkem | 12 px |
| odznaky z věty | **tři barvy** bez vysvětlení, terč **30 px** | jedna barva, 44 px |
| políčka druhů v panelu | první řada 77 px, zbylé 58 | všechna stejná |
| „Cena za m²" | hodnota nalepená za popiskem | v jednom sloupci se sousedy |

### Kdo je pro našeptávač souřadnicovou soustavou

Nejzajímavější je ten první řádek. `.ms-navrhy` má `left:0; right:0`,
takže se roztáhne na **nejbližšího pozicovaného předka** — a tím bylo
samo pole hledání (207 px). Řada má přitom 370. Sto třiašedesát pixelů
leželo vedle ladem a návrhy se do zbytku nevešly: „Brno-venkov" se
lámalo uprostřed jména.

Oprava není v šířce, ale v té soustavě: pole se vrátí do statického toku
(`position:static`) a relativní je celá řada. Lupa uvnitř pole je taky
absolutní, takže se přepočítá na tutéž řadu — `left:12px` platí dál,
protože pole začíná na jejím levém kraji, a `top:50%` taky, protože
jednořádková řada je stejně vysoká jako pole. Pro dvouřádkovou podobu
pod 360 px se obojí doopraví výslovně.

**Je to past na příště:** cokoli dalšího, co se do `.map-search` dá
s `position:absolute` (třeba křížek na vymazání), se napříště pozicuje
podle ŘADY, ne podle pole. Je to napsané u pravidla v `css/styles.css`.

### Jedna barva pro odznaky z věty

Odznaky rozpoznané z věty měly tři barvy: místo a druh zelené, cena
a výměra hnědé (`--accent-warm` #8A5512), sítě světle zelené. Vypadalo
to jako náhoda — a hůř: hnědá leží v téže rodině jako oranžová u dražeb,
takže si řádek půjčoval barvu, která na webu znamená něco jiného. Rozdíl
mezi místem, cenou a druhem přitom nese TEXT odznaku; barva by ho musela
nejdřív někde vysvětlit, a nikde se nevysvětluje.

### Zkouška a co na sobě našla

Nová `scripts/test-hledani-vzhled.mjs` (14 kontrol) měří skutečné
rozměry a barvy v prohlížeči. Devět sabotáží, každá vrací jednu změnu.

**Tři z nich napoprvé netrefily a stálo to za to.** Dvě byly nevěrné —
vracely jen půlku změny (`nowrap` jen u jména, mřížku bez druhého řádku
pravidla), takže se původní vada nevrátila a nebylo co chytit. Třetí
odhalila **chybu v samotné zkoušce**: kontrola „všechna políčka jsou
stejně vysoká" hlásila ✓ i po odebrání `grid-auto-rows:1fr`, zatímco
sonda ve stejnou chvíli měřila 77 / 77 / 58 / 58 / 58 / 58 / 58 / 58.
Zkouška si totiž před otevřením panelu napsala do hledání celou větu,
takže se dívala na **zúžený** seznam druhů, kde je výška jednotná i bez
té opravy. Měřila jinou skupinu, než o které mluvila. Po opravě (čistá
stránka před měřením) sabotáž kontrolu shodí.

Poučení k zapsání: **sabotáž musí vracet celou změnu, ne její půlku** —
jinak neprokazuje kontrolu, ale jen to, že zbytek pravidla ještě drží.

### Žádná pevná pauza

Zkouška původně spala 2 600 ms a pak měřila. Na vytížené mašině v CI je
to sázka: když se data načtou o chlup později, ohlásí vadu, která
v aplikaci není. Všech sedm pevných pauz je proto nahrazeno čekáním na
stav — že se dopočítal výpis, že se objevil první návrh, že se vykreslily
odznaky, že má panel políčka. V souboru nezbyl ani jeden
`waitForTimeout`.

## 32. Pryč se sklem: dvacet rozmazání a jedna průsvitná plocha *19. 10.*

Majitel: *„skleněné efekty, rozostření a poloprůhlednosti umějí působit
strašně pouťově, zapatlaně a nečitelně… ostré hrany, plné barvy,
absolutní minimalistická čistota."*

Má pravdu i měřitelně, ne jen vkusem: **text na průsvitné rozmazané
ploše má kontrast podle toho, co je zrovna pod ním.** U ovladačů nad
mapou to znamená, že kontrast nápisu „Celá ČR" závisí na tom, jestli
je pod ním les, pole nebo voda — takže se nedá ani zaručit, ani
změřit. Plná barva se změří jednou a platí vždycky. Celý web přitom
kontrast vymáhá zkouškou (`test-okraje`), takže průsvitné plochy byly
jediné místo, kde se ta zkouška dala obejít.

**Co se změnilo:**

* `--plocha-plovouci` byla `rgba(255,255,255,0.95)` a je `#fff`. Jeden
  řádek, ale týká se **23 míst** — všech ovladačů nad mapou, odznaků
  nad fotkami a plovoucích pruhů.
* **Dvacet deklarací `backdrop-filter`** je pryč. Zůstaly jen ztmavovací
  vrstvy pod dialogy (`.modal-backdrop`, `.nav-stin`, `.loc-ov`): ty
  nejsou sklo, ale tmavá plocha, bez které by dialog nebyl čitelný —
  jen už se pod nimi nic nerozmazává.

**Dva komentáře tím zestárly a musely se přepsat.** V tomhle
repozitáři jsou komentáře dokumentace, takže komentář popisující
rozmazání, které už neexistuje, je horší než žádný:

1. U lepivé hlavičky stálo, proč se rozmazání vypíná **jen na dotyku**
   (na iPhonu se rozmazaná vrstva překresluje se zpožděním a hlavička
   při rolování „ujede"). Platí to dál jako historie, ale teď je
   rozmazání pryč i z monitoru.
2. U mobilní nabídky stálo, že podivně počítaný `bottom` je kvůli
   tomu, že `backdrop-filter` hlavičky dělá vztažný rámec i pro
   `position:fixed` potomky. Od zrušení rozmazání to **neplatí** —
   jenže ten panel je `absolute`, takže se na jeho chování nic
   nezměnilo a počítaný `bottom` platí dál. Kdyby tam ta oprava
   nebyla, příští čtenář by se řídil nepravdou.

Ověřeno v prohlížeči: `.map-nastroj`, `.kraj-hint`, `.map-podklad`
i hlavička mají `rgb(255,255,255)` a `backdrop-filter: none`.

## 33. Zkouška, která našla díru dřív, než ji někdo prožil *19. 10.*

`docs/pred-vydanim.md` se jmenuje „Co musí zapojit majitel webu" a je
to jediný seznam, podle kterého se web spouští. Oddíl „3. Databáze"
odkazoval na tlačítko „Nasadit SQL", ale neřekl, že k němu je potřeba
token — takže kdo by podle toho seznamu postupoval, klepl by a dostal
„Chybí SUPABASE_PAT".

Doplnil jsem ho ručně. Pak jsem napsal `scripts/test-tajemstvi.mjs`,
který projde `.github/workflows/*.yml`, vybere z nich každé
`secrets.X` (kromě `GITHUB_TOKEN`, ten dává GitHub sám) a vymáhá dvojí:

* **A)** každé stojí v majitelově seznamu,
* **B)** a je vysvětlené tam, kde se používá — v komentáři úlohy nebo
  ve skriptu. Jméno samo neřekne, kde se ten klíč vezme.

**Na prvním běhu to shodilo mou vlastní opravu:** `SUPABASE_URL`
používají tři úlohy (`nasad-sql`, `kontrola-inzeratu`, `rozesilani`)
a v seznamu taky nebyl. Ruční doplnění jedné položky našlo jednu
díru; zkouška našla dvě. Soupis se vypisuje do hlášky, takže je posun
vidět, i když kontrola projde.

## 34. Vypnuté ovladače vypadaly sedmi způsoby — nebo nijak *19. 10.*

Z dokumentu o „perfektních stavech" vyšla jediná, zato pravá vada.
Naměřeno: ovladače se v `js/` vypínají na **17 místech**, ale vzhled
vypnutého stavu byl v CSS popsaný jen **sedmkrát a pokaždé jinak** —
průhlednost 0,45 / 0,4 / 0,4 / 0,5 / 0,6 / 0,8 a kurzor `default`,
`progress` i `not-allowed`. Zbylých deset ovladačů po vypnutí
nevypadalo nijak: že nejdou použít, se člověk dozvěděl, až když do nich
marně klepl.

**Dvě různé věci vypadaly stejně.** `disabled` znamená na webu dvojí:
„teď to nejde" (prázdný výběr, nic k vývozu) a „pracuje se" (zjišťuje
se poloha). Čekání se nemá tvářit jako zákaz. Rozlišuje se proto
`aria-busy`, který odečítač obrazovky přečte jako „zaneprázdněno" —
web ho ve stylopisu nepoužíval ani jednou:

| stav | plocha | kurzor |
|---|---|---|
| teď to nejde | průhlednost 0,45 | `not-allowed` |
| pracuje se (`aria-busy`) | průhlednost 0,7 | `progress` |

**Dvě pravidla se přede mnou schovala zápisem `[disabled]` místo
`:disabled`**, takže je hledání nenašlo a první sjednocení bylo
neúplné. Ohlásila to až rozšířená zkouška: `.map-near-btn[disabled]`
měl 0,8 a `progress` — a po přečtení bylo jasné, že to vůbec není
vypnutý stav, ale „hledá se poloha", tedy případ pro `aria-busy`.

`scripts/test-afordance.mjs` („na ovládání musí být vidět, že je
ovládání") dostal rub téhož pravidla, 6 → 9 kontrol: vypne skutečná
tlačítka na vykreslené stránce a změří, že zhubnou **stejně**, že
kurzor říká „nejde", a že se „pracuje se" liší.

## 35. Osmdesát čtyři natvrdo zapsaných barev, které tam nebyly *19. 10.*

Z dokumentu o čistém kódu vyšel bod „všechny barvy z centrálních
proměnných". Napočítal jsem 266 hexů v `css/styles.css` a odhadl, že
po odečtení tokenů a bílé zbývá kolem **84** k prověření. To číslo
bylo špatně a stojí za zapsání proč.

Po napsání přesného hledače (vynechat komentáře, `:root`, SVG v `data:`
a bílou) zbylo **146**, a z nich byla většina legitimní:

* **20× `#000`** — vždy uvnitř `mask-image`. Tam `#000` neznamená
  černou, ale **neprůhlednost**: je to alfa kanál masky. Nahradit to
  tokenem by nedávalo smysl.
* **záložní hodnoty ve `var()`** — `var(--c-drazba,#CC6B33)` je
  obranný zápis pro případ, že token chybí, ne duplicita.
* **definice přechodů v `:root`** — `--grad-warm` má stopy napsané
  hexem, protože token definuje.

Skutečných duplikátů, tedy hodnot napsaných ručně tam, kde na ně token
existuje, bylo **osm**: dvakrát `--c-warn`, dvakrát `--surface-2`,
dvakrát `--ink-dark`, jednou `--copper`, jednou `--c-ok-ink`. Všech
osm je nahrazeno.

**Poučení je o měření, ne o barvách:** „266 hexů" je údaj, který zní
jako nepořádek, ale 70 z nich je bílá a dalších 20 je alfa kanál.
Číslo bez rozboru svádí k práci, která není potřeba — přesně to, před
čím varuje zásada měřit dřív, než se vyvozuje.

## 36. Sedm volání ven bez limitu a osm úloh bez stropu *19. 10.*

Systémový audit (z majitelova zadání) našel jednu pravou vadu ve dvou
patrech, a je to ta nejtišší možná: nic nepadalo, jen to mohlo viset.

**Patro první — `fetch` bez limitu.** Z devíti skriptů, které běží
v úlohách GitHubu, volalo `fetch` **sedm** bez jakéhokoli
`AbortSignal`. `fetch` bez něj čeká, dokud druhá strana neodpoví nebo
nezavře spojení; když mlčí, čeká se dál.

**Patro druhé — žádný strop úlohy.** Ani jedna z **osmi** úloh neměla
`timeout-minutes`, takže visící běh nemělo co zastavit dřív než
GitHub sám — po **šesti hodinách**.

**Co by se stalo.** `send-alerts.mjs` rozesílá e-maily přes Resend.
Kdyby Resend neodmítl, ale jen přestal odpovídat, `rozesilani.yml`
visí šest hodin, spotřebuje minuty a hlavně **další naplánovaný běh
se do té doby nespustí**. Úloha přitom nespadne — v přehledu svítí
jako běžící, takže si toho nikdo nevšimne.

**Dva skripty byly na tom hůř:** `fetch-okresy.mjs` a
`uklid-databaze.mjs` neměly ani jeden `catch`. Výpadek zdroje je
shodil výjimkou, takže v logu zbyl stack trace místo věty.

### Co se změnilo

* **`scripts/fetch-s-limitem.mjs`** — jedno místo, kde se volá ven.
  Vzor je převzatý z `kontrola-inzeratu.mjs`, kde už byl
  (AbortController + `setTimeout`); tady je vytažený, aby se
  neopisoval do sedmi souborů. Výchozí limit **20 s**: déle než
  nejpomalejší zdroj (ČÚZK i Supabase odpovídají v jednotkách vteřin)
  a krátce dost, aby si toho úloha všimla dřív než člověk. Chyba
  z limitu se přejmenuje na „Zdroj neodpověděl do 20 s: …" — v logu je
  to rozdíl mezi hádáním a diagnózou.
* **Jedenáct volání** v sedmi skriptech přes něj.
* **Stropy do všech osmi úloh**, velkoryse nad obvyklou dobou běhu:
  robot 90 min, zkoušky 75, kontrola inzerátů 60, rozesílání 30,
  zbytek 20. Nejde o hlídání výkonu, ale o to, aby viselo nanejvýš
  tolik.
* **`try/catch` do těch dvou skriptů.** `uklid-databaze` vrací při
  výpadku stav 0 („nedošlo to tam"), který volající odliší od chyby,
  kterou databáze vrátila sama.

### Zkouška

`scripts/test-casove-limity.mjs` vybere z úloh **produkční** skripty
(zkoušky se nepočítají — ty běží pod vlastním `timeout` a míří na
vlastní server), vyhodí komentáře a hledá holé `fetch(`. Vlastní
AbortController bere jako rovnocennou obranu, protože tak to dělá
`kontrola-inzeratu.mjs`. Druhá kontrola porovná počet `runs-on`
s počtem `timeout-minutes` — strop musí mít **každá** úloha, ne
soubor.

Sabotáž (vrátit jeden `fetch` a smazat jeden strop) shodí obě
kontroly.
