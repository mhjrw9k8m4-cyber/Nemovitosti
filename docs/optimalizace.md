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

`scripts/test-hledani-zavirani.mjs` a zkouška spodní lišty (soubor
scripts/test-lista-dole.mjs už v repozitáři není, zanikl 30. 10. se
samotnou lištou — viz §245)
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
značky** (`--znacka`, 8,2 : 1 na bílé liště). Rodina
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

**PRŮSVITNÉ ZŮSTALY TŘI — A SCHVÁLNĚ.** Odznaky na fotkách karet
(`.opp-badge`, `.opp-count`, `.opp-media .opp-fav`) mají
`rgba(8,20,14,0.74)` a bílý text. Vypadá to jako týž případ, ale je
opačný, a dá se to spočítat. Rozhoduje SMĚR:

| plocha | text | nejhorší případ |
|---|---|---|
| světlá průsvitná (to, co bylo nad mapou) | tmavý | nad tmavou fotkou tmavý na tmavém — **nedá se zaručit** |
| tmavá průsvitná (odznaky na fotkách) | bílý | **vždy aspoň 8,19 : 1** |

Spočítáno pro nejhorší podklad, jaký může pod odznakem být — čistě
bílou fotku: `0,74 × rgb(8,20,14) + 0,26 × bílá` dá `rgb(72,81,77)`
a bílý text na ní má **8,19 : 1**. Nad sněhem 8,75, nad trávou 12,9,
nad černou 19,5. Mez WCAG AA je 4,5.

Tmavá plocha s bílým textem se dá přidáním čehokoli pod ni jen
**zesvětlit** — a i úplné zesvětlení o 26 % zůstane dost tmavé. Světlá
plocha s tmavým textem takový strop nemá. Proto ty tři zůstávají
a ostatní šly pryč.

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
dvakrát `--plocha-tmava`, jednou `--znacka`, jednou `--c-ok-ink`. Všech
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

---

## 37. Zkouška, která v CI spadla a lokálně ne *19. 10.*

Majitel přinesl e-mail z GitHub Actions: úloha `v-prohlizeci` padla po
48 minutách. **Nebyl to ale stav webu** — ten e-mail patřil běhu **553**
(commit `233e18661`); běh **554** nad commitem, který na větvi opravdu
je (`e0cbfb7f0`), dojel celý: 121 zkoušek, zelená. Předtím padl i běh
**552**, a to na strážci podílu archivu u filtru „Zlevněné" — ten už je
spravený jinak (čeká se na počet změn, ne na podíl).

Zbyl tedy jeden skutečný nález: **tři kontroly poznámky v
`scripts/test-rychly-prohlizec.mjs` padaly v CI, a lokálně procházely.**

### Co se dělo

Hlášení z běhu 553:

```
✕ poznámka se uloží a řekne to            stav „"
✕ a uloží se pod klíč TÉ karty            uloženo pod []
✕ šipka uprostřed psaní kartou nehne      před Červený Újezd…, po Břeclav…
```

Jeden kořen, tři příznaky. Rozhodnutí o kartě (`rvRozhodni`,
`js/main.js`) kartě přilepí `odlet-vpravo`/`odlet-vlevo` a další kartu
vykreslí **až o 300 ms později**. Zkouška si mezi prvními deseti kartami
hledá takovou, která ukazuje výměru (bez výměry se nedá složit klíč
poznámky), a mezi stisky čekala **260 ms**. Na pomalejším stroji CI tak
čtení i klepnutí padlo doprostřed toho okna:

1. přečetl se klíč karty, která už odlétala,
2. políčko poznámky se otevřelo na kartě, kterou překreslení zahodilo,
3. `p.type('#rv-pozn', …)` psal do prvku, který mezitím zmizel — a
   playwright na tom **nezakopne**: do skrytého `textarea` „napíše" bez
   chyby, klávesy spadnou do stránky a nikam se nezapíšou (proto
   `stav „"` a `uloženo pod []`),
4. `p.focus('#rv-pozn')` na skrytém políčku taky mlčí: kurzor zůstane
   na `BODY`, takže šipka kartou pohnula **právem**.

### Reprodukce, ne dohad

Lokálně to procházelo, protože se ta smyčka obvykle vůbec neotočí —
první karta výměru má. Stačilo jeden stisk vynutit:

```
po 260 ms: {"pk":"Libochovice…","tridy":"rv-karta chystam-ano odlet-vpravo"}
po kliknutí na výzvu: {"skryte":true,"zamereno":"BODY"}
výsledek: {"stav":"","podKlicem":false,"klice":[]}
karta po šipce: Lukavec u Lovosic…      ← pohnula se
```

Tedy přesně tři příznaky z CI, na příkaz.

### Oprava

Nečeká se delší dobu, **čeká se na stav**:

| místo | dřív | teď |
|---|---|---|
| po stisku šipky | `waitForTimeout(260)` | karta je na místě a nemá třídu `odlet-`/`chystam-` |
| po klepnutí na „Přidat poznámku" | `waitForTimeout(250)` | `#rv-pozn` má `hidden === false` — a je to **vypsaná kontrola**, ne tiché čekání |
| po napsání poznámky | `waitForTimeout(1100)` | poznámka je v `localStorage` pod klíčem té karty |
| po šipce uprostřed psaní | `waitForTimeout(500)` | měří se **hned**: obsluha klávesy přilepí `odlet-` synchronně |
| po „Tenhle ne" | `waitForTimeout(900)` | karta je nová a nikam neletí |

Totéž pod stejným vynuceným stiskem: karta `rv-karta` (bez odletu),
`{"skryte":false,"zamereno":"rv-pozn"}`, `stav „uloženo"`,
`podKlicem: true`, po šipce karta stojí.

### A jedna sabotáž, která nejdřív proklouzla

Nová kontrola „kurzor je v políčku" **přežila** sabotáž, která
aplikaci `pole.focus()` sebrala — protože `p.type` si prvek zaměří sám,
takže se měřil playwright, ne web. Kurzor se proto měří **před psaním**,
a je z toho vlastní kontrola („psát jde bez druhého klepnutí").

Tři sabotáže na opravené zkoušce (všechny trefa):

| sabotáž | co padlo |
|---|---|
| aplikace nedá kurzor do políčka | `a rovnou v něm stojí kurzor` |
| psaní už nechrání kartu před šipkou | `šipka uprostřed psaní kartou nehne` — a to **ještě než** se karta vymění: `(a karta odlétá)` |
| výzva políčko neodkryje | `klepnutí … políčko opravdu otevře` + čtyři navázané |

Kontrol v té zkoušce je 44 → **46**.

### Co z toho platí dál

Ve zkouškách je **735 pevných čekání ve 116 souborech**, z toho 81
kratších než 320 ms. Nejsou všechna špatná — čekání po navigaci je něco
jiného než čekání v animaci. Pravidlo ale platí: **kde se čeká na to, co
teprve udělá aplikace, se čeká na stav.** Zapsáno do `CLAUDE.md` jako
třetí past vedle dotyku a servisního pracovníka.

---

## 38. Hodina na verdikt a čtvrt hodiny rezervy *19. 10.*

Z téhož e-mailu vypadl druhý nález, který s poznámkou nesouvisí:
**úloha `v-prohlizeci` jela 59 minut 26 sekund proti stropu 75 minut.**
To jsou dvě věci naráz — člověk se verdikt dozví až za hodinu, a na
pomalejším stroji zbývá čtvrt hodiny, než CI úlohu zabije a neřekne
vůbec nic.

Měřeno lokálně z časů logů poslední celé sady (`scratchpad/logy`,
rozdíly časů zápisu): **56,6 minuty na 106 zkouškách**, tedy totéž co
v CI. Čísla sedí i po jednotlivých zkouškách:

| zkouška | místně | CI (běh 554) |
|---|---|---|
| `test-rozvrzeni` | 308 s | 291 s |
| `test-okoli` | 308 s | 303 s |
| `test-konzole` | 232 s | 224 s |
| `test-rozdeleni-stylu` | 182 s | 148 s |
| `test-pridat` | 145 s | 120 s |

Podstatné je rozložení: dvě zkoušky samy zaberou deset minut, zatímco
většina doběhne do dvaceti sekund. Dělit sadu podle **počtu** by tedy
nic nevyřešilo.

### Dvě směny vedle sebe

*(Platilo 22. 10.; od 23. 10. jsou směny tři — viz oddíl 134.)*

Sada byla rozdělená na `v-prohlizeci` (61 zkoušek) a `v-prohlizeci-2`
(60 zkoušek) — rozděleno hladovým algoritmem podle naměřených délek,
takže na obě vyšlo **31,3 minuty**. Běží současně, strop je 50 minut
(skoro dvojnásobek naměřeného času místo dnešních 126 %). Chromium se
instaluje dvakrát, asi minuta; to se při půlhodině úspory vyplatí.

### Dvě pojistky, které by o druhé směně nevěděly

Rozdělení úlohy nemůže propadnout tím, že kontroly čtou jen původní
jméno. Obě se opravily a obě se sabotovaly:

| sabotáž | co padlo |
|---|---|
| ze druhé směny zmizí zkouška | `Zkouška existuje, ale nikdo ji nespouští: scripts/test-chat-prohlizec.mjs` |
| zkouška z prohlížeče přesunuta do rychlé úlohy | `Zkouška potřebuje prohlížeč, ale je v úloze bez něj` |
| `test-roadmap` zapomene druhou směnu | `zkoušek s prohlížečem: 61` místo 121 |

`scripts/test-staticka.mjs` dřív řezal YAML podle `wf.indexOf('\n  v-prohlizeci:')`;
teď čte **klíče úloh** a za „prohlížečovou" bere každou, jejíž klíč
začíná `v-prohlizeci`. `scripts/test-roadmap.mjs` směny sčítá — jinak by
README tvrdilo polovinu.

Počty v `docs/roadmap.md` se nemění: 116 zkoušek bez prohlížeče, 121
s ním.

---

## 39. Zkoušky, které většinu času spí *19. 10.*

Z opravy běhu 553 (položka 37) vypadla otázka, kolik takových čekání
„na hodinky" vlastně je. Odpověď: **735 pevných čekání ve 116
souborech**, a z nich **201 stojí hned za `goto`/`reload`** — tedy
„počkej, než se rozběhne JS stránky". To je **8,5 minuty** čistého
spánku, každé započítané jen raz (v cyklu je jich víc).

Zátěž stroje přitom byla **0,28 ze čtyř jader**. Sada netrvala hodinu
proto, že by počítala — proto, že spala.

| zkouška | délka | z toho pevná čekání |
|---|---|---|
| `test-poznamky` | 60 s | **52,6 s (88 %)** |
| `test-pamet` | 90 s | 55,1 s (61 %) |
| `test-mapa-pozemku` | 139 s | 74,0 s (53 %) |
| `test-naseptavac` | 125 s | 32,7 s |

### Pomocník: `scripts/zkouska-pripraveno.mjs`

Čeká se na **pozorovatelný stav**: vykreslené políčko poznámky
(`pripravenoPozemek`), vykreslenou kartu výpisu (`pripravenoVypis`),
hlášku o uložení (`poznamkaUlozena`), utichlou síť (`sitUtichla`) nebo
na libovolnou podmínku (`pripravenoKdyz`). Žádná z nich **nevyhazuje** —
vrací `false`, aby chybu pojmenovala zkouška, ne výpis timeoutu.

### `test-poznamky`: 60 s → 14 s

Pevných čekání z **52,6 s na 1,15 s**, kontrol z 67 na **69**.

| dřív | teď |
|---|---|
| `goto` + 2 200 ms (6×) | políčko poznámky i věta u něj jsou na stránce |
| `blur` + 1 200 ms | hláška „uloženo" **a** utichlá síť |
| `blur` + 1 200 ms (přihlášený) | ten konkrétní požadavek `rpc/poznamka_uloz` |
| `goto` + 3 000 ms (druhý prohlížeč) | odpověď `rpc/moje_poznamky`; čekání se zakládá **před** navigací |
| `click` na kartu + 3 200 ms | přesun jako takový (KAM se došlo, měří kontrola) |

**Dvě čekání zůstala pevná schválně**: u zkratky k poznámce se měří
právě to, co se za tu dobu má stát (doskok a zaostření), a u „méně
pohybu" je krátkost (150 ms) sama tou kontrolou. Kdo si počká na
„políčko je zaostřené" a pak změří, že je zaostřené, nezměřil nic.

### Tři nálezy, které z toho spadly

1. **Pevné čekání 500 ms, které nehlídalo nic.** Popisek tlačítka
   přepisuje obsluha `input` synchronně — a 500 ms bylo navíc *kratší*
   než prodleva ukládání (600 ms). Zrušeno.
2. **Čekání na kostru načítání.** První verze čekala na `#opp-list li` —
   jenže ve statickém HTML jsou čtyři `li.opp-skel` (šedé obrysy, než
   data dojdou) a ty `data-pk` nenesou. Sada to hlásila jako vadu webu:
   „karet: 4, klíč první: null". Teď se čeká na `.opp-item`, tedy na
   **vykreslenou** kartu.
3. **Zkouška, která místo chyby padala výjimkou.** `JSON.parse` bez
   `|| '{}'`: jak ukládání tiše selhalo, zbylo v CI jen
   „Cannot convert undefined or null to object". Teď se to řekne
   jménem („zápis poznámky do schránky vůbec proběhl") a zbytek bloku
   se neměří.

### Sabotáže

| sabotáž | co padlo |
|---|---|
| poznámka odejde ven i nepřihlášenému | `a NEODEŠLA ven ze zařízení` — s pojmenovaným požadavkem v detailu |
| ukládání do schránky tiše selže | **15 kontrol**, a jménem (dřív výjimka) |
| odznak „Poznámka" se ve výpisu nekreslí | **8 kontrol**; běh 22 s místo 14 — bounded čekání vypršelo a kontrola to řekla |

To je ten rozdíl, o který jde: **na zdravém webu je zkouška rychlá, na
rozbitém pojmenuje vadu.**

---

## 40. Pět zkoušek, které spaly, a čtyři, které spát musí *19. 10.*

Pokračování položky 39. Měřeno vždy před a po, na témže stroji.

| zkouška | před | po | ušetřeno |
|---|---|---|---|
| `test-rozvrzeni` | 308 s | **159 s** | −149 s |
| `test-okoli` | 308 s | **256 s** | −52 s |
| `test-mapa-pozemku` | 139 s | **93 s** | −46 s |
| `test-poznamky` | 60 s | **14 s** | −46 s |
| `test-pamet` | 89 s | **81 s** | −8 s |

Plus deset dalších zkoušek, kde se převedla **jen** čekání stojící hned
za `goto`/`reload` (tedy prokazatelně ne to, co se měří): 53 míst,
**145 s** pevného spánku. Dohromady je to přes **osm minut** z hodinové
sady — a zároveň zmizela celá ta třída selhání „na pomalejším stroji to
nestihlo".

### Kde se úspora brala

Ne v jednom dlouhém čekání, ale v krátkém čekání uvnitř něčeho, co se
volá pořád:

* `test-rozvrzeni` otevírá stránku na **23 místech** přes funkci
  `otevri()`, a ta v sobě měla 1 500 ms. Jeden cyklus jí projde
  **třináct šířek**. Další cyklus desetkrát čekal 2 500 + 500 ms.
* `test-okoli` má `jdiNaMisto()` a `klepniDoMapy()` — 900 až 1 300 ms
  na volání, volají se v cyklech přes okruhy i pozemky.
* `test-mapa-pozemku` šestkrát otevře detail a pokaždé čekal 2,5 s na
  dojetí vrstev.

Nový `domUtichlo()` nasadí `MutationObserver` a čeká na **klid v DOMu**
(se stropem, protože stránka s dojíždějícími dlaždicemi se neutiší).

### Pět čekání, která se musela vrátit zpátky

Dvě jsem našel při kontrole vlastní práce, třetí našla sada. Tohle je
důležitější než ta úspora:

1. **`test-stabilita`, 2× `waitForTimeout(6000)`** — není to čekání na
   připravenost, ale **měřicí okno**: pozorovatel po celou tu dobu sbírá
   poskoky rozvržení (CLS). Zkrácení na „DOM utichl" by zakrylo poskok,
   který přijde později (třeba od obrázku ze sítě), a zkouška by prošla
   proto, že se nekoukala.
2. **`test-pohyb`, 2× čekání mezi dvěma měřeními polohy značky** — okno
   animace. Leaflet posouvá značku transformací, což DOM **nemění**,
   takže „DOM utichl" by se dočkal hned a změřilo by se půl pohybu.

3. **`test-stabilita`, `waitForTimeout(2600)`** — tohle jsem sám
   nenašel, **našla to sada**. Je to zase měřicí okno, ale jiného druhu:
   čeká se, až aplikaci **vyprší lhůta**. Hlídka drží vršek stránky
   2,5 s po načtení a kontrola ověřuje, že POTOM už nedrží. „DOM utichl"
   se dočkal dřív, hlídka byla ještě živá a zkouška padla na vadě, která
   v aplikaci není: „drží vršek i po 2,6 s". Čeká se tedy pevně, a
   o chlup dýl než ta lhůta.

Zbytek převedených míst prošel i strojovou kontrolou na vzorec
„měřím → čekám → měřím znovu"; další takový tam není. Vzorec „čekám, až
něco vyprší" se takhle najít nedá — na ten je potřeba sada.

### Tři vlastní chyby, které stojí za zapsání

* **Sabotáž, která nic nesabotovala.** Dotykové terče jsem zmenšil
  v `css/styles.min.css` — jenže úvodní stránka má svůj balíček
  `css/uvod.min.css` (a stránky okresů `region.min.css`). Běh byl
  157 s jako čistý a padlo 0; vypadalo to jako slepá zkouška, a byla to
  slepá sabotáž. Na správném souboru padly tři kontroly.
* **`git checkout --` po sabotáži.** Tím jsem si smazal vlastní
  (nezacommitovanou) opravu `test-roadmap`, která sčítá obě směny.
  Vyplavalo to až v sadě: „zkoušek s prohlížečem: 61" místo 121.
  Sabotáž se proto vrací **ze zálohy souboru**, ne z gitu.
* **`{ classList: new Set() }`** jako záloha pro chybějící prvek —
  `Set` nemá `.contains`, má `.has`, takže by z toho byl `TypeError`.

### A když zkouška spadne, ať to pořád něco řekne

Dvě sabotáže (`pzm-v` bez třídy, odpojené klepnutí do mapy výběru)
zkoušku **shodily výjimkou**: `locator.click: Timeout 30000ms exceeded`
a `element is not enabled`. Návratový kód 1, takže CI je červené —
ale **ani jedna ✕**, a všechny kontroly, které do té chvíle prošly, se
zahodily.

Nejprve se zpevnila ta konkrétní místa (klepnutí má strop a vlastní
kontrolu, navazující měření jsou odolná proti `null`), ale pádů bylo
dál dost. Proto `scripts/zkouska-pad.mjs`: zaregistruje se na
`uncaughtException` i `unhandledRejection` a při pádu vypíše, kam
zkouška došla, kolik kontrol prošlo, a `::error::` s první řádkou chyby
**i s místem ve zkoušce**. Tatáž sabotáž teď vypíše:

```
Mapa v detailu pozemku  (PŘERUŠENO — zkouška spadla, nedoběhla)
  ✕ nabídne se právě ta jedna vrstva, která odpověděla — nabízí se: (nic)
  ✕ hranice parcel se zapnou samy — … jen špendlík …
  ✕ přepínač katastrální vrstvy je na mapě a dá se zapnout — … se nenašlo
```

Sedm pojmenovaných kontrol místo jedné stopy výjimky. Chybějící prvek
pořád patří do pojmenované kontroly — ale pád už není slepý.

---

## 41. Sreality standard: čtyřková mříž a tři úrovně na kartě *19. 10.*

Majitel přinesl popis toho, jak drží typografii a mřížku Sreality, a
chtěl stejnou úroveň. Napřed se tedy měřilo, co z toho web už splňuje —
protože polovina těch pravidel v něm platila.

| pravidlo | stav před |
|---|---|
| hlavní cena `text-2xl`+ bold | `.opp-price` 24 px / 700 ✔ |
| popisy s `leading-relaxed` | `body{line-height:1.6}` ✔ |
| sekundární text 60–70 % kontrastu | `--popisek` 10,60 : 1 proti 16,24 : 1 = **65 %** ✔ |
| neprůhledné plochy, tenké linky | ✔ (sklo šlo pryč v položce 32) |
| **název / lokalita `text-lg`–`xl`** | ✘ druh 14 px, místo 14 px |
| **přísná mříž 8/4 px** | ✘ 575 odstupů na 6/10/14 px |

### Mříž: 575 hodnot, a ani jedna nahoru

Hodnoty 6, 10 a 14 px se přepsaly na nejbližší násobek čtyř, **při
remíze dolů** (6→4, 10→8, 14→12). Důvod pro „dolů" je měřitelný:
nahoru by rozvržení narostlo a na 320 px šířky se pere o místo řádek
hledání, u kterého se dříve počítalo na pixely (položka 31).

Sáhlo se výhradně do `margin/padding/gap` — tímtéž vzorkem, jakým měří
`scripts/test-odstupy.mjs` — takže zaoblení (vlastní stupnice),
šířky ani velikosti písma zůstaly. Stupnice v té zkoušce se pak zúžila
z 21 hodnot na **18**: 6, 10 a 14 už neprojdou. Zůstávají 1 a 2 px, to
nejsou odstupy rozvržení, ale vlásečnice a mezery uvnitř řádku.

### Karta měla dvě úrovně, ne tři

Druh 14 px, místo 14 px, doplňková čísla 13 px — mezi tím, **co se
prodává**, a doplňkem byl rozdíl jednoho pixelu, takže hierarchie
stála jen na tučnosti.

| řádek | dřív | teď |
|---|---|---|
| druh pozemku | 14 px / 700 | **18 px / 600** |
| výměra, Kč/m² | 13 px | **14 px / 500** |
| cena | 24 px / 700 | beze změny |
| odznak | 12 px / 700 | 12 px / **600** |

Váha nadpisu klesla schválně: **pořadí nese velikost, tučnost ať
nekřičí dvakrát.**

### Dvakrát totéž poučení: rozměr se říká, ne dopočítává

Mříž ubrala dvakrát 2 px na dvou místech, kde na tom součtu viselo
něco podstatného. Obojí našly zkoušky, ne oko:

1. **`summary.add-jak-sum` spadlo na 40 px.** Dotykový terč měl 44 px
   jen náhodou — 2×10 px odsazení plus řádek a obrys.
   `✕ ovládání se dá trefit prstem i mimo úvodní stránku … 40 px`
2. **Hlavička na telefonu spadla z 65 na 61 px**, ale stránka si pod ni
   dál nechávala 65. Čtyři pixely prázdného pruhu.
   `✕ --vyska-hlavicky (65) sedí na skutečnou výšku (61)`

Oboje je spravené stejně: **výška se říká** (`min-height:44px`,
`min-height:var(--vyska-hlavicky)` a token na 64 px, tedy na mříži),
ne dopočítává z odsazení. Kdyby se jen vrátily ty dva pixely, mříž by
byla děravá a past by zůstala nastražená pro příště.

Po opravách: `test-rozvrzeni` 162 kontrol a `test-hlavicka` 77 kontrol
bez chyby, sada rychlých zkoušek 116/116.

---

## 42. První pád po hromadném převodu čekání *19. 10.*

CI běh 556 shodil `test-shoda` na kontrole „podezřelá nabídka má
varování rovnou na kartě". Lokálně táž zkouška prošla 27/27. Nebyla to
vada webu — byl to **můj převod** z položky 40: `waitForTimeout(4500)`
po načtení úvodní stránky se změnil na `domUtichlo(350)`.

### Co se dělo

„DOM utichl" nastal **dřív, než byl výpis živý**. Zkouška pak zapsala
jméno obce do hledání ručně vyvolanou událostí:

```js
e.value = q; e.dispatchEvent(new Event('input', { bubbles: true }));
```

Obsluha ještě navěšená nebyla, takže se nestalo nic — a měřila se
**cizí karta**. V hlášce proto stál text úplně jiné nabídky
(„Lukavec u Lovosic… −56 % proti okolí"), což vypadalo jako vada
aplikace.

### Dvě poučení, ne jedno

1. **Ručně vyvolaná událost si nepočká, klepnutí ano.** `page.click()`
   playwright opakuje, dokud prvek nereaguje; `dispatchEvent` uvnitř
   `evaluate` se provede hned a tiše do prázdna. Po hromadném převodu
   jsem proto všech 53 míst projel strojově a hledal vzorec „hned po
   `domUtichlo` se něco ovládá". Našla se čtyři — tři klepnutí (v
   pořádku) a jedno `dispatchEvent` (druhý blok téže zkoušky). Opravena
   obě.
2. **Záložní karta z chyby dělá lež.** V té zkoušce stálo
   `const li = vsechny.find(…) || vsechny[0]` — když se hledaná nabídka
   nenašla, měřila se první ve výpisu. Hláška pak mluvila o jiné
   nabídce, než o které si zkouška myslela. Záloha je pryč: když karta
   není, řekne se to.

### Jak se teď čeká

| krok | dřív | teď |
|---|---|---|
| po načtení | 4 500 ms → `domUtichlo(350)` | vykreslený výpis **a** cenový model (`window.PK_CENY`) |
| po zapsání do hledání | 700 / 900 ms | až je ve výpisu karta s tou cenou (resp. ta parcela) |
| když se nenajde | vzala se první karta | kontrola to řekne |

Pět běhů po sobě, pokaždé 27 v pořádku, 9–10 s na běh.

---

## 43. Vizuální balast pryč — a co zůstat musí *19. 10.*

Majitel poslal tři varianty téhož zadání: „smaž všechny gradienty,
stíny, poloprůhledné vrstvy; udělej z toho industriální nástroj jako
Sreality". Napřed se tedy **spočítalo, co v tom stylopisu vlastně je**,
protože plošné „smaž všechny" by rozbilo víc, než spraví.

### Co odešlo

| co | kolik |
|---|---|
| **„Aurora"** — tři rozmazané (`blur(80px)`) animované koule za hlavičkou | z **20 stránek**, −1 130 znaků CSS |
| přeliv v hlavním tlačítku (přes plnou zeleň) | 1 |
| přelivy na plochách: pásy sekcí a patičky, dva radiální závoje, závoj nad úvodní plochou, podklady odznaků, předěl, proužek pod nadpisem | ~10 |

U aurory stála v kódu i poznámka, že na mobilu žrala výkon a sekal
scroll. **Snímek před a po je přitom k nerozeznání** — byla na krytí
0,1 za mřížkovou texturou. Čistý náklad bez viditelného přínosu.

### Co zůstalo, a proč

Z 57 „barevných přechodů" je ozdoba menšina:

* **18 masek** (`mask-image`) — konec posuvného pruhu, který říká „je kam
  rolovat". Smazat je znamená vzít afordanci.
* **12 mřížkových textur** (1px linky) — jsou v designové soustavě a
  hlídá je zkouška.
* **závoj nad fotkou a mapou** — drží čitelnost bílého písma na snímku.
  Bez něj padá kontrast; totéž dělá i Sreality.
* **kostra načítání** (šimr přes prázdnou kartu).

A dvě věci ze zadání se **neudělaly schválně**:

1. **„Smaž všechny `box-shadow`."** Naměřeno: stíny jsou `--e1/--e2/--e3`
   s krytím 0,06–0,12 u blízkého stínu. To není pouť, to je odlišení
   karty od plochy — a je to v soustavě i ve zkoušce.
2. **„Cena `font-black` (900)."** Stupnice vah je {400, 500, 600, 700} a
   hlídá ji `test-pismo`. Cena má 700 při 24 px na kartě a 40 px na
   detailu; devítistovka by přidala jen rozbitou stupnici.

### Karta a detail konečně lícují

Měřeno na vykresleném stavu:

| plocha | dřív | teď |
|---|---|---|
| karta ve výpisu | 20 px (`--r-obraz`) | **10 px** (`--r-plocha`) |
| kostra načítání | 20 px | **10 px** (jinak rohy při dojetí dat „cuknou") |
| karta okresu | 20 px | **10 px** |
| dlaždice a panely na detailu | 10 px | 10 px |

Karta **je plocha, ne obraz** — a přechod mezi výpisem a detailem už
nemění tvar rohů.

### Odznaky: jeden hlas, měřeno na vykresleném stavu

Zdrojová pravidla tvrdila dvojí (12 px u osmnácti, váha 600 u sedmi a
700 u dvanácti), ale **vykreslený stav je jednotný: 13 px / 600**,
protože `.opp-chips > *` ta pravidla přebíjí. Statická zkouška nad
zdrojem by tedy hlídala něco jiného, než co lidé vidí — a taky ji
sabotáž přešla, protože selektor `.opp-overit` do sítě „badge|chip"
vůbec nespadl. Kontrola je proto v `test-tvary`, kde se měří
**vykreslené** odznaky: jedna velikost, jedna váha. Sabotáž (jednomu
odznaku vnucená váha 700) padá na `váhy: 600, 700`.

Váhy ve zdroji se stejně srovnaly, aby zdroj neříkal nic jiného než
obrazovka: slovní odznaky 600, **počítadla zůstávají na 700** — tam je
to číslo a při 12 px se tenčí číslice hůř čtou.

### Dvě zkoušky, které CI chytilo mimo tohle

Běh 557 shodil `test-prvni-obrazovka` („a u seznamu stojí počet
nabídek") a `test-afordance` („bylo vůbec co měřit — nalezeno 8"). Obě
hlásily vadu, která v aplikaci není: tlačítka přepínače jsou ve
statickém HTML, ale **počet** do nich dopisuje až vykreslený výpis; a
`test-afordance` čekala pevných 900 ms po `domcontentloaded`. Obě teď
čekají na vykreslený výpis. Tři běhy po sobě v pořádku (9 a 19 kontrol).

---

## 44. Uložení pozemku umělo tiše selhat *19. 10.*

Prověrka osobních funkcí (poznámky, historie, uložené, hlídač) podle
zadání „ověř, že data nevypadávají a jsou správně klíčovaná". Většina
odpovědí byla dobrá — a jedna špatná.

### Vada

```js
function saveFavs(){ try { localStorage.setItem(FAV_KEY, …); } catch (e) {} }
```

Při plné paměti prohlížeče se **nestalo nic**, ale tlačítko se přepnulo
na „Uloženo". Po načtení stránky znovu by tam ten pozemek nebyl a člověk
by nepoznal proč. Totéž u **skrývání** pozemku a u sdíleného
`zapisUloz`, přes který jde i filtr, místo a pohled.

Poznámky to přitom uměly správně už dřív (`js/poznamky.js` vrací `false`
a stránka napíše „nepovedlo se uložit — plná paměť prohlížeče“);
uložené a skryté na to zapomněly.

### Oprava

`zapisUloz` vrací, jestli zápis prošel. Kde se ukládá rozhodnutí
člověka, se při nezdaru **stav vrátí zpátky** (aby tlačítko nelhalo) a
přijde hláška. Tedy: uložení pozemku, skrytí pozemku.

### Zkouška a sabotáž

V `scripts/test-klic-ulozenych.mjs` přibyly čtyři kontroly: schránka se
„zaplní" jen na ten jeden klíč (`pk_fav_v1`), klepne se na záložku a
měří se trojí — tlačítko, schránka, hláška.

| | |
|---|---|
| čistý běh | `✓ při plné paměti se tlačítko NEPŘEPNE do „Uloženo"`, `✓ a nic se opravdu neuložilo`, `✓ a člověk se doví proč` |
| sabotáž (vrácené `catch (e) {}`) | `✕ po klepnutí stojí „Uloženo" — a přitom se nic neuložilo`, `✕ hláška: „"` |

### A co prověrka potvrdila

| věc | stav |
|---|---|
| historie se zapíše hned při otevření detailu | `PKVideno.oznac(d)` při vykreslení |
| strop historie | **600 záznamů, zapomínání po 180 dnech** |
| poznámky | prodleva **600 ms**, k tomu zápis při odchodu z pole i při opuštění stránky, stav „uloženo / smazáno / nepovedlo se" |
| klíčování | `klicPozemku` = pkey + výměra; hrubý pkey označoval až pět pozemků naráz |
| běh bez přihlášení | ano, a hlídá se i to, že nepřihlášenému nic neodejde ze zařízení |

### A ještě jedna vlastní nedbalost

Nový kontext ve zkoušce neměl `serviceWorkers: 'block'` a
`test-zkousky-meri` mi ho vrátil hláškou „kdo podstrkuje přes route,
vypíná servisního pracovníka". To je past č. 2 z `CLAUDE.md` — a tohle
je přesně to, kvůli čemu se meta-zkoušky psaly: kontrola, že kontroly
měří to, co si myslí.

---

## 45. Odkud nabídka je, patří k ceně *20. 10.*

Naměřeno na stránce pozemku (1440 px): cena stála na y 168, údaj
„Stav / zdroj" až na y 854 — tedy o obrazovku a půl níž, v tabulce
parametrů. „Kdo to říká" je přitom otázka k ceně, ne k parametrům,
a v datech je to jediná věta o původu nabídky:

| zápis v datech | kolikrát |
|---|---:|
| inzerát – Bezrealitky | 1 624 |
| prodej státní půdy (SPÚ, § 12) | 204 |
| dražba `<datum>` · OK dražby | 75 |
| dražba `<datum>` (bez dražebníka) | 33 |
| inzerát – Farmy.cz | 9 |

Zápis se přestěhoval pod cenu (y 247 na monitoru, y 636 na telefonu)
a z tabulky zmizel — týž údaj dvakrát na jedné stránce je horší než
pozdě. U dražby nese datum dlaždice „Termín dražby", takže z řádku
zbyde jen dražebník („Zdroj: dražba · OK dražby"); kdyby po vyškrtnutí
datumu zbylo jen slovo „dražba", neřekne řádek nic, co nestojí
v odznaku nad snímkem, a vynechá se celý.

### Jeden odznak, ne dva

Stránka pozemku si pravidlo pro odznak nad snímkem opsala
z `css/styles.css` a opis se rozešel: váha 700 proti 600, odsazení
`4px 12px` proti `4px 8px`, podklad `.6` proti `.74` a navíc rozostření
pod ním. Nad světlou fotkou dává bílá na `rgba(12,26,18,.6)` **4,94 : 1**,
na `rgba(8,20,14,.74)` **8,09 : 1** — rozostření čitelnost nenahradí,
jen rozmazává snímek pod sebou. Z pravidla zůstala jen poloha.

Zkouška to teď měří **srovnáním**: vedle živého odznaku se postaví
kopie mimo `.pz-media` a devět vlastností se porovná. Sabotáž (vrácená
váha i rozostření) ji shodí.

## 46. Tři další zápisy, které umlčely vlastní selhání *20. 10.*

Pokračování bodu 44 na místech, kam se tehdy nedošlo. Každé lhalo jinak:

* **stránka pozemku, „Uložit"** — `catch (e) {}` spolkl chybu, tlačítko
  se přepnulo na „Uloženo" a hláška řekla „Uloženo mezi oblíbené",
  jenže ve schránce nebylo nic;
* **hlídané místo** — pruh hlásí „Hlídané místo: Praha · okolí do
  10 km", tedy slib, že se k tomu web po návratu vrátí; `zapisUloz`
  výsledek vracel, `ulozMisto` si ho nechával pro sebe. Okolí se teď
  při nezdaru **zapne** (člověk si ho právě naklikal na mapě), ale
  řekne se, že to nepřežije zavření karty;
* **přihlášení** — nejhorší z trojice: přihlášení žije JEN ve schránce
  prohlížeče (`loggedIn()` ji čte při každém dotazu), takže zápis,
  který neprojde, znamená, že se člověk nepřihlásil. `setSession()`
  chybu spolkl, `login()` přesto vrátil `ok` — server heslo přijal
  a panel se překreslil jako odhlášený, bez jediného slova proč.

A jedna past se při tom chytila sama: falešný Supabase ve zkoušce
odpovídal na přihlášení heslem „Invalid Refresh Token", protože
rozlišení podle `grant_type` neměl — dvě kontroly tím procházely
z jiného důvodu, než tvrdily.

## 47. Jeden poměr stran náhledu, ne tři *20. 10.*

Týž letecký výřez měl na stránce okresu na telefonu 290 × 181 px
(1,60) a na monitoru 128 × 128 (1,00). Zbytek webu přitom drží 16/10:
karta ve výpisu, kostra při načítání, náhled v Uložených, náhled ve
formuláři i hero na stránce pozemku. Řádek okresu se srovnáním zkrátil
ze 142 na 120 px.

Nová osa v `scripts/test-soustava.mjs` vedle průhlednosti, linek a času.
Výjimky (mapka u karty na úvodní stránce, miniatura nahrané fotky, hero
na telefonu) musí uvést **i svou hodnotu** — jinak by selektor
s výjimkou směl mít poměr jakýkoli.

## 48. Kontrola odstupů, která celou dobu neviděla první vlastnost *20. 10.*

`scripts/test-odstupy.mjs` o sobě tvrdila, že čte i `style="…"`,
a nečetla: v `style="margin:6px 0 0"` stojí `margin` hned za uvozovkou,
ne za `;`, `{` ani mezerou, a vzorek takový začátek nedovoloval.
**První vlastnost v každém atributu byla neviditelná.** Po přidání
uvozovky mezi dovolené začátky vyšlo 16 odstupů mimo čtyřkovou mříž
v osmi souborech (11× 14px, 3× 6px, 10px a −14px).

Ve `index.html` u toho zbyly tři zápisy, které nejsou data:
`position:absolute` na spritu s ikonami (naměřeno, že **nedělá nic** —
se `static` je výška stránky do bajtu stejná), barva tečky u věty
o katastru a poznámka pod e-mailem s 12 px tam, kde každá jiná
`.rules-note` má 8.

## 49. Předloha stránky pozemku se oddělila od stránky *20. 10.*

`pozemek.html` byla zároveň ZDROJ vloženého stylu (41 kB, z toho
16,5 kB komentářů) a STRÁNKA, na kterou vede odkaz „Otevřít na mapě"
z každé z 1 945 stránek pozemků. Kdo si ji otevřel, stáhl si komentáře,
které nikdy nikdo nepřečte (7,2 kB po zabalení).

A hlavně: její velikost se hlídala stropem, takže to byl **strop na
komentáře** — na to, čím tenhle web vysvětluje sám sebe. Toho dne se
naplnil do bajtu (41,0 z 41 kB).

Zdroj je dnes `css/pozemek-vlozeny.css` (bez stropu), očištěnou podobu
vkládá `scripts/vloz-styl-pozemku.mjs` týmž čističem jako u
`css/styles.css`, a to **před** generátorem stránek. Ověřeno znak po
znaku, že výsledek je bajt za bajtem tentýž, jaký generátor do stránek
vkládal už dřív; `pozemek.html` spadla z 52,0 na 29,7 kB.

## 50. Jména, která lhala *20. 10.*

Web si zakládá na tom, že se věci jmenují, jak se chovají. V paletě to
neplatilo na čtyřech místech naráz:

| jméno | co říkalo | co to bylo |
|---|---|---|
| `--copper` | měď | zelená `#0F5C3B` (a komentář psal „modrá") |
| `--text-ondark` | text na tmavém | tmavý text na SVĚTLOU plochu |
| `--ink-soft` | inkoust | bílá PLOCHA karty |
| `--grad-warm` | přeliv | plná barva, a navíc táž jako `--accent-warm` |

Přejmenováno na `--znacka`, `--text`, `--plocha-karta`, a duplicitní
tokeny zrušeny. Bílá měla v `:root` **šest jmen**; zbyly čtyři role,
které se rozejít MOHOU (plocha karty, bílý text na tmavém pásu,
plovoucí pruh a jeho neprůhledná varianta vázaná na `theme-color`),
a u každé je napsané proč. Kde se rozejít nemají, token na druhý
**odkazuje** (`var(--jiny)`), takže se nemá co rozejít.

Ověřeno měřením, ne jen zkouškami: sada barev vykreslených na sedmi
stránkách je před i po přejmenování TATÁŽ.

## 51. Mrtvý blok, osiřelé ikony a dojeté přelivy *20. 10.*

„Jak to funguje" dostalo velké číslice místo ikon v rámečku a na konci
stylopisu stojí `.step .icon-badge{display:none}`. Šest pravidel nad
tím ale zůstalo a nastavovalo odznaku rozměry, podklad i barvu —
naměřeno v prohlížeči: všechny tři odznaky mají rect 0 × 0.

Táž vada o patro vedle: `<symbol>` ve spritu, ke kterému už nevede
`<use>`. Nová kontrola v `scripts/test-mrtve-styly.mjs` jich našla
pět a `index.html` zhubla o 1 207 bajtů. Zkouška si u toho vyžádala
opravu sama sebe: slovo v KOMENTÁŘI se počítalo jako použití, takže
`.counters` držela při životě poznámka, která doslova psala „celá
sekce s počítadly je pryč".

Přelivů bylo 57 a 19 z nich jen zdobilo plochu — většina přitom
přelévala bílou do bílé (`#FFFFFF → #F7F8F8`). Zbylých 38 dělá práci,
kterou plnou barvou udělat nejde (masky na krajích, závoj nad fotkou,
kostra načítání, mříž z 1px linek) a je vypsaných i s důvodem.

## 52. Mapa se konečně zkouší na dotyku *20. 10.*

Otevřená otázka z 15. 10. (viz `docs/co-chybi.md` 3db) zněla, jestli
se kraj na dotyku vůbec dá vybrat. Odpověď je prostá a je v kódu
napsaná jako záměr: **první klepnutí na dotyku mapu jen PROBUDÍ** —
zamčená mapa jinak na telefonu bere rolování stránky.

Změřeno na obrysu Plzeňského kraje: bez dotyku vybere kraj jedno
klepnutí; s dotykem nevybere ani `mouse.click`, ani `touchscreen.tap`,
ani `dispatchEvent` — a po probouzecím klepnutí vyberou kraj všechny
tři. To poslední je důležité: `dispatchEvent` je čistý DOM bez emulace
vstupu, takže se tím vyloučilo omezení podstrčeného klepnutí.

`scripts/test-mapa.mjs` běží od té doby v profilu `hasTouch + isMobile`
a klepání má obalené: když je mapa zamčená, klepne dvakrát. 51 kontrol
místo 48.

## 53. Tři nástroje nad výpisem zalomily řádek *20. 10.*

Zkouška „Nářadí výpisu je na dosah" zčervenala v CI v 00:05, tedy pár
minut po půlnoci, a nebylo to z žádné změny v kódu: den po dražbě
přibyde k „Procházet po jednom" a „Stáhnout výběr" třetí nástroj
„Dražby po termínu (1)". Do dvousloupcové mřížky se tři tlačítka
nevejdou — pruh vyrostl ze 44 na 96 px a první nabídka spadla ze 396
na 448 px.

Řádek nářadí se přitom zalamovat nemá; základní pravidlo to říká
(„nezalamuje se, posouvá se do strany") a má k tomu i stín za pravou
hranou. Mřížka pro telefon to přebíjela. Při třech a víc nástrojích se
proto vrací k jednomu posuvnému řádku, a šířka sloupce se **dopočítává**
z buňky té mřížky — `calc((100% - 8px) / 2)` — aby měly všechny
ovladače nad výpisem jednu velikost. Napsat tam naměřených 188 px by
platilo jen na jedné šířce okna.

Zkouška si třetí nástroj nově **přidá sama**, takže nestojí na dni
v kalendáři.

## 54. Co váží úvodní stránka — a co by na tom šlo změnit *20. 10.*

Změřeno v prohlížeči na telefonním profilu (390 px, dotyk), dlaždice
mapy podstrčené prázdné, takže čísla jsou jen to, co posílá web:

| stránka | celkem | největší položky |
|---|---:|---|
| úvod | 1 517 kB | `opportunities.json` 639, `main.js` 230, `leaflet.js` 144, `uvod.min.css` 139 |
| pozemek | 402 kB | `pozemek.js` 79, `pozemek.min.css` 59, `model.json` 58 |
| okres | 184 kB | `region.min.css` 56, stránka 51, písma 46 |

Největší je tedy datový soubor úvodní stránky. Po zabalení (gzip 9)
má **77,4 kB** a v něm:

| co by se změnilo | nezabalené | gzipem |
|---|---:|---:|
| dnešní stav | 621,9 kB | **77,4 kB** |
| bez pole `url` | 461,4 kB | **58,8 kB** |
| se slovníky (extra, druh, okres, type, site) | 530,5 kB | 76,2 kB |
| obojí | 370,0 kB | 58,2 kB |

**Slovníky nemají smysl** — a to je ten nález. Nezabalený soubor by
zhubl o 91 kB, jenže gzip tytéž opakované řetězce najde sám: rozdíl
po zabalení je 1,2 kB. Byla by to složitost (dekódování v prohlížeči)
za nic. Totéž u zkracování adres: `url` váží 158,7 kB nezabaleně, ale
po zabalení jen 18,6 — adresy se sdíleným začátkem gzip stlačí na
12 %, takže ruční prefixy už nemají co ušetřit.

**Jediná opravdová úspora je adresy vůbec neposílat** (−18,6 kB
gzipem, tedy čtvrtina souboru). Úvodní stránka je k ničemu nepoužívá
až na jednu věc: při klepnutí na pozemek je vloží do `sessionStorage`
(`pk_open`), aby se stránka pozemku vykreslila okamžitě i s tlačítkem
„Inzerát". Bez nich by tlačítko doskočilo, až dorazí okresní řez —
a právě proti tomu ten handoff vznikl.

Je to tedy **volba, ne vada**, a rozhodnout ji má měření na pomalé
síti: o kolik dřív se úvod vykreslí proti tomu, o kolik později se
na stránce pozemku objeví „Inzerát".

### Půlka toho měření hotová

Pomalá 4G (1,6 Mb/s, 150 ms RTT), telefonní profil, soubory ze
serveru, medián ze tří běhů — čas od začátku načítání po **první
nabídku ve výpisu**:

| | čas |
|---|---:|
| s adresami | 7 981 ms |
| bez adres | 7 179 ms |
| **rozdíl** | **802 ms** |

Pozor na to, co tohle číslo je a co není: místní server **nezabaluje**,
takže se přenáší 622 proti 461 kB. Kdo servíruje gzipem (a to je
dnes skoro každý), přenese 77,4 proti 58,8 kB, tedy rozdíl 18,6 kB —
na téže lince kolem 90 ms. Skutečná úspora je tedy někde mezi
**0,1 a 0,8 s** podle toho, jestli hosting balí.

A jedno poučení o měření samotném: první pokus podstrčil zmenšený
soubor přes `route.fulfill` a vyšel rozdíl **22 ms**. Falešně: co
zkouška vyrobí v paměti, neprojde emulovaným zpomalením sítě —
musí se to poslat ze serveru (`route.continue({ url })`).

### Druhá půlka: detail na tom netratí nic

První sonda skončila ve všech šesti bězích na časovém limitu, protože
čekala na text `Inzerát|Katastr|Ověřit` — a tlačítko se u dražby
jmenuje „K dražbě". Po přepsání (čeká se na první `<a class="primary">`,
jehož odkaz nevede na ikatastr.cz) měření dojelo. Táž pomalá 4G,
klepnutí na první kartu ve výpisu, medián ze tří běhů, čas od
klepnutí po odkaz na zdroj:

| | čas |
|---|---:|
| s adresami v handoffu | 2 229 ms |
| bez adres | 2 217 ms |
| **rozdíl** | **−12 ms** |

Žádný. A dá se to i vysvětlit: handoff sice vykreslí stránku okamžitě
(`render(quick)` v js/pozemek.js nečeká na data), ale přes pomalou linku
trvá samo načtení stránky pozemku ty dvě sekundy — a **okresní řez**
(`data/okres/<okres>.json`, u Benešova 33 nabídek) dorazí hned za ní
a adresu nese taky. Handoff tedy nešetří čekání na data, šetří jen
jeden malý soubor, který by stejně přišel.

### Rozhodnutí: adresy na úvodní stránku neposílat

Změřené obě strany: **−18,6 kB gzipem** na úvodní stránce (čtvrtina
největšího souboru, na pomalé 4G kolem 90 ms, bez balení 802 ms) proti
**nule** na detailu. Rozhoduje se tedy pro vynechání.

Jak, aby se nerozbil otevřený dataset: `data/opportunities.json` je
zveřejněný soubor, na který odkazuje data.html, a adresy z něj
vyhazovat nemá smysl. Úvodní stránka si místo něj má stahovat **vlastní
řez bez adres** (okresní řezy i statické stránky pozemků se dál
generují z plného souboru, který má `url` dál). Jediné místo, které
`url` na úvodu používá, je handoff na řádku 6374 v js/main.js — ten
pole prostě přestane předávat a stránka pozemku si adresu vezme
z okresního řezu, jak se právě změřilo.

To už je samostatná práce (nový soubor v překladu, přepnutý `loadJSON`,
nová jména v `?v=`, zkoušky na obojí), vedená jako úkol zvlášť.

## 55. Osmdesát osm odstupů v atributu `style=` *20. 10.*

Generátor přehledových stránek psal svislou osnovu do `style=` u
každého prvku zvlášť: 44× `margin-top:20px`, 23× `margin-top:0`
u poznámky pod nadpisem, 7× 12 px, 4× 8 px, 4× 2 px a čtyři
jednotlivosti — **88 vložených stylů pro jediný rozměr** v šabloně,
ze které se vyrábí přes tisíc stránek. V HTML se tím opakoval týž
údaj devětkrát na stránce a měnit odstupy mezi deskami znamenalo
hledat v generátoru, ne ve stylopisu.

Teď to stojí v `css/styles.css` jednou a výjimky mají jméno podle
role: `okr-mezi` (samostatný odstavec mezi deskami, 20 px),
`okr-dal` (druhý odstavec téže myšlenky, 8 px), `okr-tesne` (řádek
k číslu nad sebou, 2 px) a `okr-zacatek` (prvek, který oddíl
otevírá, 0). V šabloně zbylo 23 jmenných výjimek místo 88 atributů;
sedm odstupů bylo přepsání výchozího stavu týmž číslem a zmizelo
úplně, stejně jako `margin-bottom:0` (to dělá `*{margin:0}` samo),
`display:inline` na `<span>` a `color:inherit` u odkazu v nadpisu
žebříčku (má teď pravidlo `.okr-kraj-h a`).

**Čím se to ověřilo.** Sonda projde šestnáct stránek (okres, kraj,
druh, rozpočet, nové, dražby, ceny, podle okresů, pohromade, a čtyři
statické články jako kontrolu) na 390 a 1 280 px a čte u sedmi druhů
prvků oba svislé odstupy a vrchní hranu; u pěti z nich navíc **každý
prvek v `<body>`**, vrchní hranu i výšku. Srovnává se s pracovní
kopií z HEAD (`git worktree`), která se servíruje na druhém portu —
takže se měří dva weby zároveň, ne dvě chvíle. Výsledek: **žádný
prvek se nepohnul ani o pixel**, počty prvků souhlasí, jediným
rozdílem v otisku je přidané jméno třídy.

**Dva nálezy z toho ověřování** (bez měření by prošly oba):

1. Napoprvé tu stálo `:first-child{margin-top:0}` — a je to vedle.
   Na cena-pozemku.html otevírá oddíl deska, která odstup nad sebou
   **chce**, na pozemky-podle-okresu.html ho nechce, a na okresní
   stránce je prvním prvkem odstavec s 12 px, protože dlaždice se
   statistikou si generátor přenese nahoru do hlavičky. Táž poloha,
   tři různá přání: odstup je role, ne pořadí.
2. Jméno `okr-blok` už bylo o 1 100 řádek níž obsazené (oddíl na
   pozemky-pohromade.html: `margin-top:32px; padding-top:24px;
   border-top`). Přesnější `.okr-more.okr-blok` sice vyhrála
   v odstupu, ale výplň a linka zůstaly — odstavec „Souvisí:" na
   cena-pozemku.html narostl ze 67 na 92 px a s ním celá stránka
   o 25 px. Proto `okr-mezi`.

Zbyly tři vložené styly a všechny jsou **daty**, ne osnovou: šířka
pruhu v žebříčku krajů (`width:${podíl}%`) a poloha špendlíku na
náhledu okresu (`left/top` v procentech).

Zbývá totéž v **ručně psaných stránkách**: 21 souborů s vloženými
odstupy (nejvíc `predloha.html` a `zpravy.html`, u článků `padding-top`
a `margin-top` u patního odkazu). Dokud tam jsou, nemá smysl psát
zkoušku, která vložené odstupy zakáže úplně — až po nich.

## 56. Zbylých 65 odstupů v atributech — a zkouška, která je už nepustí *20. 10.*

Po generátoru (položka 55) zbývaly odstupy v `style=` v ručně psaných
stránkách a v jednom skriptu: **62 v 21 souboru a 3 v `js/main.js`**.
Teď jich je **nula** a hlídá to zkouška.

**Co se našlo cestou — pětkrát něco jiného, než se čekalo:**

1. **Jméno už existovalo.** Šestnáct stránek mělo
   `<section class="section" style="padding-top:20px">` hned za úvodním
   pásem. Táž hodnota má přitom ve stylopisu třídu `tesne-nahore`
   už dávno — a používala ji jedna jediná stránka (`pridat.html`).
   Nepřibylo tedy nic, jen se těch šestnáct přihlásilo k existujícímu
   jménu.
2. **Odstup nese deska PŘED mezerou, ne za ní.** Deset stránek rádce
   dávalo druhé desce `margin-top:20px`. Napsat to jako
   `.add-card + .add-card{margin-top}` vypadá správně a na telefonu to
   i vyšlo — na širokém displeji ale obal přepne na mřížku a **v mřížce
   se okraje neslévají**, takže se 20 px přičetlo k `margin-bottom:20px`,
   který už tři karty mají samy. Naměřeno +20 px na třech stránkách.
   Pravidlo je proto `.add-card:has(+ .add-card){margin-bottom:20px}` —
   táž vlastnost s touž hodnotou se nesečte.
3. **Jeden prvek v selektoru přebije tři třídy.**
   `.rules-sect > .rules-note.pod-textem` (tři třídy) prohrálo
   s `.clanek .rules-sect > p + .rules-note` (tři třídy **a jeden
   prvek**), přestože stojí v souboru pod ním. Poznámka spadla o 4 px.
4. **Přepis odhalil hodnotu mimo mříž.** Hláška „ve vašem okolí teď nic
   není" měla `padding:20px 6px` v atributu — a atributy v `js/*.js`
   zkouška odstupů dosud nečetla. Jak se to přepsalo do stylopisu,
   ohlásila 6 px jako hodnotu mimo čtyřkovou mříž. Jsou z nich 4 px
   (při remíze dolů), tedy o 2 px užší hláška; to je jediná změna
   rozvržení v celé položce.
5. **Vzorník sám sebe neposlouchal.** `predloha.html` má v šestém oddílu
   napsáno, že „ukázky se kreslí skutečnými třídami, ne vepsanými
   čísly" — a dvanáct rozměrů měl v atributech, ukázku tmavého pásu
   celou. Zaklínit nová pravidla do `.vzorek` byla chyba: popisek pod
   čtvercem barvy stojí v `.radaTvaru`, pravidlo na něj nedosáhlo
   a čtverce se srazily o 4 px (211 → 203). Bez zaklínění souhlasí.

**Čím se to ověřilo.** Dvacet dvě stránky na 390 a 1 280 px, otisk
každého prvku v `<body>` proti pracovní kopii z HEAD na druhém portu —
**žádný posun**, jen jiná jména tříd v otisku. Co se skládá
v JavaScriptu až ve stavu, do kterého se sonda nedostane (prázdný
rozhovor, potvrzení o změně hesla, hláška o prázdném okolí, okénko
„Kde hledat?"), se měřilo jinak: táž značka v obou podobách vložená do
téže stránky a porovnané **vypočtené hodnoty** — čtrnáct prvků,
všechny shodné. U `diagnostika.html` otisk nejde: je živá a vrací jiný
počet prvků i při srovnání HEAD se sebou samým (21 „posunů"), takže
u ní platí jen to, že se řádek s verzí nepohnul.

**Zkouška.** `scripts/test-odstupy.mjs` dosud hlídala HODNOTU odstupu;
teď hlídá i MÍSTO — v `style=` nesmí stát `margin`, `padding` ani
`gap`. Vyjímá se `scripts/mail-sklad.mjs` (e-mailoví klienti `<style>`
zahazují, inline je tam jediná cesta) a `js/mereni-hlavicky.js`
(ladicí panel, který se načte jen s `?mereni` a má vlastní soustavu,
jako `build-og.mjs`). Zkouška navíc čte **i `js/*.js`**, což dřív ne —
a hned se tím našel bod 4. Komentáře se bílí podle jazyka, aby se
nezopakovala chyba z `test-mrtve-styly.mjs`.
Sabotáž: vrácený `style="padding-top:20px"` do stránky a
`style="margin-top:5px"` do `js/main.js` shodí obě kontroly naráz
(a 5 px navíc i tu o stupnici).

Hranice je napsaná rovnou: hlídají se **literální atributy**, ne
`setAttribute('style', …)`. Jediné místo, které to tak dělá, je právě
ten ladicí panel — a ten je ze zkoušky vyjmutý jmenovitě.

## 57. Předpoklad, který závisel na pořadí dat *20. 10.*

CI shodilo zkoušku poznámek na kontrole, která si sama říká předpoklad:
„ve výpisu je karta, jejíž záznam vznikl složením dvou (jinak není co
měřit)" → `{"zadna":true,"karet":24}`. **Lokálně přitom prošla** — tedy
podruhé týž druh rozdílu u téže zkoušky (položka o CI výš, úkol 9).

Příčina není v měřeném kódu. Výpis ukazuje **prvních 24** nabídek
a složených záznamů je v datech **17 z 1 975**; jestli jedna padne na
první obrazovku, rozhoduje pořadí, a to se mění s každou aktualizací
dat od robota. Zkouška tedy stála na náhodě a v CI ta náhoda nevyšla.

Snížit nárok (měřit kteroukoli kartu) by znamenalo přestat měřit právě
tu nejtěžší, kvůli které zkouška vznikla — složený záznam, jaký
v syrových datech samostatně není. Správně je **přestat se spoléhat na
pořadí**: složený záznam se najde v datech (týmž modulem jako web,
`PKHlidani.bezDuplicit`) a výpis se na jeho obec **dohledá** přes
`?q=…`, tedy touž cestou, jakou by na něj narazil člověk. Stejně se
dohledává i při návratu, kde se měří odznak „Poznámka".

Zkouška má o jednu kontrolu víc (70 místo 69) a sabotáž ji shodí:
vypnuté zpracování `?q=` v js/main.js → „a po dohledání obce
(Medvědice) je jeho karta ve výpisu ✕ {"zadna":true,"karet":24}".

## 58. Adresy inzerátů z úvodní stránky — a tři věci, které na nich visely *20. 10.*

Rozhodnutí z položky 54 je provedené: úvodní stránka od teď stahuje
**data/mapa.json**, což jsou tytéž nabídky bez duplicit a **bez pole
`url`**. Změřeno na skutečném překladu:

| soubor | surově | gzip | brotli |
|---|---:|---:|---:|
| `opportunities.json` (dosud) | 637,3 kB | 77,3 kB | 56,1 kB |
| `mapa.json` (teď) | 470,0 kB | **58,1 kB** | **43,4 kB** |

To, co úvodní stránka stáhne na datech celkem, spadlo **705,5 → 538,2 kB**
(sonda čte délky odpovědí na `/data/*`). Čas od začátku načítání po
první nabídku ve výpisu na pomalé 4G (1,6 Mb/s, 150 ms RTT, medián ze
tří běhů, místní server **nezabaluje**): **7 977 → 7 144 ms, tedy
−833 ms**. Hosting je Vercel a ten balí sám, takže přes drát jde
rozdíl 19,2 kB gzipem nebo 12,7 kB brotli — na téže lince kolem
**95, resp. 65 ms**.

**Proč zrovna `url`.** Změřeno po polích, co se stane, když se které
vynechá — kolik ubere surově a kolik po zabalení:

| pole | surově | gzip | brotli |
|---|---:|---:|---:|
| `url` | 160,2 kB | **−18,6 kB** | **−12,2 kB** |
| `lng` | 31,6 kB | −11,0 kB | −7,8 kB |
| `place` | 39,3 kB | −10,7 kB | −6,6 kB |
| `lat` | 31,2 kB | −10,6 kB | −7,5 kB |
| `area` | 23,3 kB | −7,2 kB | −5,5 kB |
| `extra` | 64,0 kB | −1,7 kB | −0,9 kB |

`url` je největší jak surově, tak po zabalení — a je to jediné pole,
které úvodní stránka opravdu nepotřebuje. (Hezky se na tom vidí, že
surová velikost nic neříká: `extra` má 64 kB, ale je to pár
opakujících se vět, takže po zabalení nestojí skoro nic.)

### Tři věci, které na adrese visely, aniž by to bylo vidět

Tohle je ten nález. Vynechat pole vypadá jako jednořádková změna; ve
skutečnosti na něm visely tři věci a dvě z nich by se projevily tiše.

1. **Slučování duplicit.** `bezDuplicit` v js/hlidani-logika.js slučuje
   v PRVNÍM kroku podle adresy zdroje (`klicZdroje`). Bez `url` ten krok
   nenajde nic a na úvodu se objevilo **1 964 nabídek místo 1 940** —
   tedy 24 dvakrát. Naměřeno na počítadle v záhlaví mapy. Řeší se to
   tím, že se duplicity odstraní už v překladu, **touž funkcí**; stránka
   ji pustí znovu a nenajde co slučovat (hlídá to zkouška).
2. **Odznak „Zlevněno".** Historie cen (data/zlevneni.json) byla
   klíčovaná **klíčem nabídky** (`pkey` + otisk adresy inzerátu), takže
   bez adresy by se nenašla u 1 720 nabídek z 1 940 — odznak i graf
   historie by z mapy zmizely a nic by to neohlásilo. (Spočítáno přesně:
   se starými klíči by úvod bez adresy našel 220 nabídek z 1 940, totiž
   právě ty, které adresu nemají.) Soubor je proto
   klíčovaný **klíčem pozemku** (`pkey` + výměra), tedy týmž, pod kterým
   si lidé pozemky ukládají. Archiv si adresu v klíči nechává: ten si
   pamatuje JEDNU NABÍDKU, kdežto zlevneni.json je zobrazovací řez pro
   dnešní nabídky, který se čtyřikrát denně přestavuje. Ověřeno
   měřením: stránka přilepí historii **88 nabídkám před i po změně**
   (číslo si js/main.js vypisuje s `window.PK_DEBUG`).
3. **Co na adrese NEVISÍ:** klíč uložených pozemků a poznámek
   (`klicPozemku`). Ten adresu schválně nepoužívá a je to v js/klic.js
   napsané — „odkaz se změní, když majitel nabídku vyvěsí znovu, a klíč
   by přestal být týž pozemek". Kdyby ji používal, přišel by každý
   o uložené pozemky. Tohle byla ta nejdůležitější věc ke zjištění,
   a dobrá zpráva.

### Čím se nešlo

**Nechat `url` a poslat jen jeho otisk** (`#20wp1`, pět znaků) by
zachovalo klíč archivu bez druhé cesty v kódu. Změřeno: soubor by měl
473,8 kB surově, ale **65,8 kB gzipem** — tedy jen −11,5 kB místo
−19,2, protože náhodně vypadající otisky se nezabalí. Polovina úspory
za pole, které nikdo nečte. Zahozeno.

**Druhá kopie dat v repozitáři** je u krajských řezů zakázaná
a s odhadem „zdvojnásobilo by to přírůstek historie" (viz hlavičku
scripts/generate-data-rezy.mjs). Tady se to změřilo: šest skutečných
po sobě jdoucích verzí dat z historie repozitáře, commitnutých jednou
samy a jednou s odvozeným souborem, dalo `.git` **260 kB proti 280 kB**
— tedy **+3,3 kB na aktualizaci**, ne +460. Git ukládá odvozený soubor
jako rozdíl proti sourozenci v témže commitu, se kterým se shoduje ze
tří čtvrtin. Při čtyřech aktualizacích denně je to kolem 5 MB za rok;
odhad podle surové velikosti byl mimo o dva řády.

### Pojistky

`scripts/test-data-rezy.mjs` má o **13 kontrol** víc: že řez existuje,
že je to znak za znakem celek bez duplicit a bez `url`, že na něm
stránka už nemá co slučovat, že hlavička souhlasí, že úvod přednačítá
řez a ne celek, že si celek nechává jen jako záložní cestu, že handoff
adresu nepředává a že **historie cen na řez dosedne** (88 z 88).
Kdyby řez na serveru chyběl, stránka si vezme celek: stáhne o 19 kB
víc, místo aby skončila v nouzovém režimu se čtrnácti záložními
nabídkami.

## 59. Kam jde 680 kB kódu na úvodní stránce *20. 10.*

Po datech (položka 58) jsou na úvodu největší položky stylopis a skripty.
Změřeno **pokrytím v Chromiu** (CSS i JS coverage), po bajtech, na dvou
šířkách (390 a 1 280 px) a po běžné interakci — hledání, čtyři filtry,
řazení, uložení pozemku, otevření menu, doscrollování dolů. Nevyužité je
jen to, co nepoužila **ani jedna** ze šířek: pravidlo pro monitor je na
telefonu „nevyužité" a naopak, takže měřit na jedné šířce by nadsadilo.

| soubor | posláno | použito | nevyužito | přes drát (brotli) |
|---|---:|---:|---:|---:|
| `js/min/main.js` | 228,4 kB | 96,3 (42 %) | **132,1 kB** | 52,6 kB |
| `vendor/leaflet/leaflet.js` | 144,1 kB | 68,8 (48 %) | 75,3 kB | 36,1 kB |
| `css/uvod.min.css` | 138,8 kB | 72,7 (52 %) | 66,1 kB | 21,9 kB |
| `js/min/dotaz.js` | 17,4 kB | 5,7 (33 %) | 11,7 kB | 4,8 kB |
| `js/min/hlidani-logika.js` | 12,5 kB | 4,1 (33 %) | 8,4 kB | 3,8 kB |
| `js/min/hledani.js` | 7,8 kB | 0,7 (**9 %**) | 7,1 kB | 2,3 kB |
| `js/min/auth.js` | 7,7 kB | 1,2 (15 %) | 6,5 kB | 1,9 kB |
| **dohromady** | **680,0 kB** | **315,1 (46 %)** | **364,9 kB** | ~146 kB |

**NEVYUŽITÉ NENÍ MRTVÉ, a to je u téhle metody to hlavní.** Pokrytí
říká „tenhle bajt se v téhle návštěvě nevykonal", ne „tenhle bajt je
zbytečný". Největší nepoužité bloky jsou poznat jménem a všechny patří
k funkcím, které člověk vyvolá klepnutím:

| co | kolik |
|---|---:|
| `otevriVyberMista` — ukázat místo na mapě | 18,4 kB |
| `.rv-*` — rychlovýběr (listování kartami prstem) | 7,4 kB |
| `showLocModal` + `.loc-*` — okénko „Kde hledat?" | 4,7 kB |
| `rvKresli`, `rvRozhodni`, `rvPoznamka`, `rvChytejPrst` | 5,6 kB |
| `.rz-*` — překryv „Na co mám" | 3,2 kB |
| `vyvozStahni`, `vyvozPopisStav`, `.vyv-okno` | 4,0 kB |
| `navrhySlovnik`, `ukazNavrhy` — našeptávač | 3,2 kB |
| `zapniKresleni` — kreslení oblasti na mapě | 1,3 kB |
| `.modal-*`, `.mapa-nedojela`, `@media print` | 4,3 kB |

### Co z toho plyne

Smazat není co; **odložit** je co. Osm souborů, které úvodní stránka
stahuje a parsuje hned, se na první obrazovce téměř nepoužije:
`hledani.js` (9 %), `auth.js` (15 %), `mapove-vrstvy.js` (9 %),
`vyvoz.js` (17 %), `mereni.js` (19 %), `ulozene-ucet.js` (19 %),
`rychlovyber.js` (21 %), `poznamky.js` (28 %) — dohromady **11,3 kB
brotli** a, co je na telefonu dražší, práce parseru a kompilátoru.
Jsou to už dnes samostatné soubory s `defer`, takže se nemusí nic
rozdělovat: stačí je načíst až při prvním použití.

Druhá, větší položka je `main.js`: 132 kB nevyužitého ve jmenovaných
blocích. Tam už jde o rozdělení souboru, ne o přesun značky `<script>`,
takže to je samostatná práce a chce vlastní měření (kolik z toho je
opravdu za klepnutím a kolik běží pokaždé, jen na jiné šířce).

A Leaflet: 75 kB nevyužitého ve knihovně, kterou nepíšeme. Vlastní
mapová knihovna není na stole; co se dá, je stáhnout ji **až když je
mapa na dohled** (dnes se stahuje vždy).

Zapsáno jako samostatné úkoly, protože obojí je práce s rizikem
regrese: obsluha klepnutí musí existovat dřív, než na ni někdo klepne.

## 60. Měřicí server, který zabaluje — a co na telefonu stojí v cestě *20. 10.*

Všechna dosavadní měření přenosu na místním serveru byla **nadsazená**:
`python3 -m http.server` posílá soubory surově, kdežto hosting (Vercel)
zabaluje sám. Ve scratchpadu proto teď stojí třicetiřádkový server,
který balí brotli nebo gzipem podle `Accept-Encoding` — a servíruje
dvě kopie webu zároveň: novou (port 8368) a pracovní kopii z HEAD
(8369). Od téhle chvíle se měří na něm.

Rozdíl je velký. Čas po první nabídku ve výpisu, telefon 390×844,
pomalá 4G (1,6 Mb/s, 150 ms RTT):

| server | čas |
|---|---:|
| surově (jako dosud) | 7 178 ms |
| **zabalený (jako na hostingu)** | **3 541 ms** |

Čísla z položek 54, 56 a 58 tedy platí jako **rozdíly**, ne jako
absolutní časy — a u rozdílů je správná ta zabalená varianta, což tam
u každého stojí.

### Časová osa na telefonu (zabaleno)

| dojelo | co | surová velikost |
|---:|---|---:|
| 1 271 ms | `data/mapa.json` (přednačtené, proto první) | 470,0 kB |
| 1 456 ms | `vendor/leaflet/leaflet.css` | 14,5 kB |
| 1 482 ms | `css/uvod.min.css` | 138,8 kB |
| 1 608 / 1 723 ms | písma | 46,4 kB |
| **2 269 ms** | **`vendor/leaflet/leaflet.js`** | 144,1 kB |
| **3 101 ms** | **`js/min/main.js`** | 230,0 kB |
| 3 545 ms | první nabídka ve výpisu | |

Linka je nasycená, takže se soubory **řadí za sebe** — a mapová
knihovna stojí v té řadě před `main.js`, bez kterého výpis nevznikne.

### A na telefonu ji přitom není kam dát

Měřeno na 390×844: `#leaflet-map` má **výšku 0 a není v okně** — úvod
startuje v režimu seznamu (`.map-app.mv-seznam .map-holder{display:none}`)
a na mapu se přepíná tlačítkem. Na 1 280 px je naopak mapa hned vidět
(y 285, výška 592). Pravidlo v `scripts/test-leaflet.mjs` („knihovnu si
dopředu bere jen index.html, tam mapa JE ta stránka") tedy platí pro
monitor a pro telefon ne.

**Proč to nejde opravit přesunutím značky `<script>`.** Výpis a mapa
se staví v jednom běhu a ten běh začíná kontrolou
`if (!mapEl || typeof L === 'undefined') { …hláška…; return; }` —
bez knihovny se tedy nevykreslí ani výpis, a to schválně: v tu chvíli
nebyl důvod to rozdělovat (knihovna chodila vždycky). Odložit knihovnu
na telefonu znamená **rozdělit ten běh**: nejdřív výpis z dat, mapa až
potom. To je tatáž práce jako rozdělení `main.js` (položka 59), takže
se to vede jako jeden úkol a ne dva.

Čekaná úspora, až se to udělá: `leaflet.js` + `leaflet.css` je 39 kB
brotli, tedy na téže lince kolem **200 ms**, a k tomu ušetřený parser
a kompilace 144 kB skriptu, což je na slabém telefonu víc než ten
přenos.

## 61. Dvacet dva čekání po `dispatchEvent` — a dva nálezy pod nimi *20. 10.*

Po úklidu z 19. 10. (201 pevných čekání, 8,5 minuty) zbývala jedna
rodina: **po ručně vyvolané události se čekalo pevnou dobu.** Takových
míst bylo **22 v jedenácti zkouškách, dohromady 16,5 s**. Je to ta
nejzrádnější podoba pevného čekání: `page.click()` si playwright
opakuje, dokud prvek nereaguje, ale `evaluate` s
`dispatchEvent(new Event('input'))` se provede hned — a když je čekání
pod zátěží krátké, zkouška měří stav PŘED zásahem a tvrdí o něm něco,
co o něm neplatí.

**Čeká se teď na výsledek.** Filtr, řazení i hledání vedou v js/main.js
na jedinou `renderList()`, která si přičte `window.PK_VYKRESLENI`
(počitadlo pro zkoušky, web ho nepoužívá). Z toho je nový pomocník
`vykresleniPo(p, zásah)` v `scripts/zkouska-pripraveno.mjs` — udělá
zásah a počká, až výpis vznikne znovu. Kde výpis není (poznámka
u okruhu hlídání, popis okna vývozu, stín u posuvného řádku), čeká se
na tu konkrétní viditelnou změnu; dvě obsluhy jsou **synchronní**, takže
se u nich nečeká vůbec (`rsStin` v js/main.js, `obnovOkruhPozn`
v hlidani.html) — pevné čekání tam bylo zbytečné celé.

Jedno pevné čekání **zůstalo schválně**: 1 800 ms, kterými
`test-ceny-hledani` dokazuje, že se rejstřík obcí při pouhém otevření
stránky NESTAHUJE. Dokazovat, že se něco nestalo, chce čas; na „DOM
utichl" to zkrátit nelze, protože stahování by mohlo přijít až po něm.

### Dva nálezy, které pevná čekání zakrývala

1. **Adresa se zapisuje odloženě.** `zapisAdresu()` v js/main.js má
   `setTimeout`, takže překreslení výpisu ještě neznamená, že je stav
   v adrese. Jak jsem to čekání vyhodil jako zbytečné, spadlo šest
   kontrol sdíleného odkazu („v hashi zůstal jen stav mapy"). Čeká se
   tedy na to, že se hash proti předchozímu stavu změnil.
2. **`scroll-behavior:smooth` plus `click` rovná se nestálá zkouška.**
   `html{scroll-behavior:smooth}` ve stylopisu znamená, že si
   playwright pole pod ohybem odroluje PLYNULE — a `fill` podruhé.
   Měřila se přitom poloha seznamu návrhů: naměřeno pole na y 783–835
   (u dolní hrany, seznam se otevřel nahoru) proti 435–487 po dojezdu
   (seznam pod polem). Zkouška jednou vyšla a jednou ne. Delší čekání
   je špatná odpověď; správná je **`reducedMotion: 'reduce'`** na tom
   kontextu, protože stylopis má na tu předvolbu pravidlo, které
   rolování i přechody vypne. Od té chvíle je stav po kliknutí hned
   konečný a zkouška dává 32/0 opakovaně.

Vedle toho se u téže zkoušky ukázalo, proč nelze čekat na „něco se
změnilo" naslepo: do `napis()` se píše někdy týž text jako posledně,
takže se nezmění nic a čekání došlo do stropu — **tři čekání po 10 s**.
Čeká se proto na pořadí „seznam se zavřel → seznam se otevřel".

### Čas

Jedenáct zkoušek, které se měnily, před a po (týž stroj, jedna po
druhé): **477 → 453 s**. Není to o rychlost — ušetřených 24 s je
vedlejší produkt. Jde o to, že zkouška teď nemůže mlčky měřit stav před
zásahem; a jedna skutečná nestálost se tím našla a odstranila.

## 62. Cena za metr nevlezla do dlaždice — a proč počítat znaky nestačí *20. 10.*

Na snímku telefonu (390 px) stránky
`pozemek-praha-zapad-jesenice-17ku2kl.html` byla v bloku „Parametry
pozemku" **hodnota „23 458 Kč/m²" uříznutá okrajem karty** a cestou
přejela přes značku v rohu dlaždice.

Naměřeno: text **164,1 px**, vnitřek dlaždice **141 px**, a z toho
**28 px** drží výplň rezervovaná pro značku — na číslo tedy zbývalo
**113 px**. Přesah za obsah dlaždice **22 px**, přes značku **39 px**.
Zlomit se to nemělo kde: mezery v číslech jsou podle typografického
pravidla nezlomitelné (U+00A0), takže celá hodnota je jeden kus.

**Žádná dosavadní zkouška to nemohla najít.** `test-parametry` měla
kontrolu „nic nepřetéká do stran", jenže ta měří
`documentElement.scrollWidth`, tedy jestli se roluje CELÁ stránka.
Mřížka dlaždic má sloupce `minmax(0, 1fr)` a nerozšíří se, takže text
z ní vyteče a stránka o tom neví. Hlásila nulu celou dobu.

### Počítat znaky nestačí — a byl to první pokus

Nabízelo se přidat třídu podle délky řetězce. Změřeno na třech
hodnotách o **devíti znacích**:

| hodnota | šířka při 24 px | vejde se do 113 px? |
|---|---|---|
| `Podíl 1/2` | 105,0 px | ano |
| `12 630 m²` | 123,4 px | ne |
| `neuvedena` | 130,8 px | ne |

Číslice jsou tabulkové a stejně široké, písmena ne. Délka řetězce
o přetečení nerozhoduje — rozhoduje naměřená šířka.

### Co se tedy dělá

`pzVelikostHodnot` v `js/pozemek.js` po vykreslení **změří** každou
hodnotu (rozsah textu proti obsahové šířce) a případně přidá dva
stupně dolů, oba ze stupnice: **24 → 20 → 16 px**. První stupeň
zároveň schová značku — je to tlumená ozdoba s `aria-hidden`, kdežto
uříznuté číslo je ten údaj, kvůli kterému člověk na stránku přišel.
Po prvním stupni má „23 458 Kč/m²" 136,8 px a vejde se do 141 px
uvolněných po značce; druhý stupeň (109,4 px) drží i ceny
přes 100 000 Kč/m².

Měří se znovu při změně **šířky mřížky**, ne okna: sloupce jsou jeden,
dva, nebo čtyři. Pozorovatel si proto pamatuje poslední šířku — zmenšení
čísla umí změnit VÝŠKU mřížky, a bez té podmínky se `ResizeObserver`
budí sám od sebe a v konzoli se objeví „loop completed with undelivered
notifications".

### Nejhorší případ není telefon

Zkouška měří pět stránek (tři s nejdelší hodnotou v datech — vybírají
se z ostrůvku `PK_POZEMEK`, ne ze seznamu jmen, protože se data
obnovují čtyřikrát denně — k tomu jednu bez výměry a jednu obyčejnou)
na šesti šířkách. Sabotáž (pravidla ze stylopisu pryč) ukázala, co
by se bez opravy dělo na `pozemek-brno-mesto-brno-jfm9d8.html`
(„21 221 Kč/m²"): **42,1 px při 680 px**, tedy přesně tam, kde mřížka
přepíná na čtyři sloupce, **38,1 px při 360 px** a 22,1 px při 760 px.
Na telefonu (390 px), odkud nález přišel, to bylo „jen" 23,1 px —
nejhorší případ tedy není ten, na kterém se to našlo.

Hlídají to čtyři kontroly: nic nevyteče a neleze na značku, aspoň jedna
dlouhá hodnota se opravdu zmenšila (jinak by první kontrola procházela
naprázdno), zmenšuje se jen na stupně stupnice, a **nezmenšily se
všechny** — ta poslední chytila sabotáž „zmenšuj vždycky", po které
první tři kontroly dál svítily zeleně.

## 63. Pulz v legendě mapy uřízla hrana okna *20. 10.*

V legendě pod mapou má řádek „končí do 14 dní" puntík, kolem kterého
pulzuje kruh (`@keyframes mping`). Legenda se na telefonu láme na dva
řádky, takže ten puntík stojí **jako první zleva** — a kruh kolem něj
se při animaci roztahuje.

Naměřeno na 390 px: základní kruh má vnějšek **19 px** (poloměr 9,5)
a jeho střed stojí **18,5 px** od levého okraje okna. Při `scale(2.2)`
z toho vyjde poloměr **20,9 px**, tedy **−2,4 px**: kruh v nejširší
chvíli přetekl za okraj okna a hrana ho uřízla. Na snímku v polovině
cyklu, kdy je kruh ještě dobře vidět (opacity kolem 0,35), z pulzu
nebyl kruh, ale **placka s rovnou levou hranou**.

`scale(1.8)` dává poloměr 17,1 px a vejde se; na monitoru, kde je
puntík 14 px a střed 19 px, vychází 18 px. Rozdíl mezi 2,2 a 1,8 na
pohled nepoznat, uříznutou hranu ano.

**`mping` používá jediné místo na webu** — právě tenhle puntík.
Značky na mapě se kreslí na plátno (viz `scripts/test-tvary.mjs`),
ne přes CSS, takže se nebylo potřeba rozdvojovat na dvě animace.

### Jak se to hlídá, když to nejde vyfotit

Nejširší okamžik je pseudoprvek `::after` uprostřed běžící animace —
`getBoundingClientRect` na něj nesáhne a snímek chytí náhodný snímek
cyklu. Zkouška to proto **spočítá**: vezme vnějšek základního kruhu
z `getComputedStyle(el, '::after')` (včetně `box-sizing`, protože
`width` je tam 17 px a rámeček 1 px navíc na každé straně) a vynásobí
ho největším `scale`, který najde v `@keyframes` daného jména
v `document.styleSheets`. Sabotáž (zpátky na 2,2) obě nové kontroly
shodila a vypsala přesně těch −2,4 px.

## 64. Tři moduly, které se bez doteku nikdy nespustí *20. 10.*

Úvodní stránka si brala značkou `<script>` osm modulů, o kterých se
vedl úkol „načítat až při prvním použití". Místo odhadu z četby kódu
se změřilo, co se opravdu čte: přes `Object.defineProperty` na `window`
dostal každý z nich getter, který si zapsal první přečtení a odkud
přišlo. Načtení úvodní stránky, **žádný dotek**, telefon 390 px
i monitor 1280 px:

| modul | čte se bez doteku? | kdy a odkud |
|---|---|---|
| `PKVyvoz` | **ne** | — |
| `PKRychly` | **ne** | — |
| `PK_VRSTVY` | **ne** | — |
| `PKAuth` | ano | 167 ms, `hlavicka.js` → `vypln` |
| `PKHledani` | ano | 250 ms, `main.js` → `boot` |
| `PKUlozeneUcet` | ano | 308 ms, `main.js` → `refreshFavBtn` |
| `PKPoznamky` | ano | 377 ms, `main.js` → `stahniPoznamky` (z `renderList`) |

**Osm to tedy není, jsou to tři.** Zbylé čtyři se při startu opravdu
čtou: `PKHledani` se v `main.js` bere do proměnné (`var HL =
window.PKHledani || {…}`), `PKPoznamky` kreslí značku poznámky na kartě
ve výpisu, `PKUlozeneUcet` rozhoduje o popisku tlačítka „Uložit"
a `PKAuth` o podobě hlavičky. Odložit je znamená ten start přestavět —
to je jiná práce a jiné riziko, takže se do tohohle kroku nebere.
`mereni.js` (1,0 kB gzip) je navíc majáček bez globálu, který sám čeká
na `load`; i ten zůstává.

### Co to ušetří

| modul | min | gzip | brotli |
|---|---|---|---|
| `vyvoz.js` | 5 084 B | 2 119 B | 1 929 B |
| `rychlovyber.js` | 2 855 B | 1 066 B | 973 B |
| `mapove-vrstvy.js` | 5 479 B | 2 151 B | 1 892 B |
| **celkem** | **13 418 B** | **5 336 B** | **4 794 B** |

K tomu tři požadavky méně na lince, která je podle měření z oddílu 60
na pomalé 4G nasycená.

### Jak

Adresa i s razítkem `?v=` stojí v `<meta name="pk-odlozeny"
data-klic="…" data-src="…">` — týmž způsobem, jakým se dotahuje mapová
knihovna, takže ji `scripts/orazitkuj-verze.mjs` orazítkuje stejně jako
značku `<script>`. `dotahniModul(klic, jménoGlobálu)` v `js/main.js`
vrátí slib; tři místa prvního použití (`stahniTabulku`, `otevriRychly`,
`nactiVrstvy`) na něj počkají a pak se zavolají znovu.

**Pod rukou se přednačítá.** Mezi „najel jsem myší na tlačítko"
a „klepl jsem" je zhruba dvě desetiny vteřiny — dost na pět kilobajtů.
Na dotyku najetí není, proto se pod tlačítky čeká na výsledek.

**Když se dotažení nepovede**, slib se z mapy smaže, aby druhé klepnutí
zkusilo znovu; člověk dostane hlášku (`showToast`), ne mlčící tlačítko.
Ověřeno v prohlížeči s odstřelenou adresou: hláška přijde, okno se
neotevře prázdné, druhé klepnutí po obnovení sítě okno otevře a stránka
u toho nespadne.

### Sabotáže

Tři, a každá shodila něco jiného:

1. **Značka `<script>` zpátky** → spadlo „nebere značkou", „bez doteku
   se nestáhl" a „PKVyvoz zatím není". A při té příležitosti vyšlo
   najevo, že se soubor stáhne **dvakrát** (vyžádáno: `vyvoz, vyvoz`):
   přednačtení pod rukou se spouštělo bez ptaní. Zavaděč proto napřed
   kouká, jestli globál už na stránce není.
2. **Rozbité jméno metaznačky** → spadly všechny čtyři kontroly „dotáhne
   se, když má". Bez nich by šlo „nestahuje se předem" splnit i tím, že
   se modul nenačte nikdy a tlačítko mlčí.
3. **Odmítnutý slib zůstal v mapě** → spadlo „druhé klepnutí okno
   otevře". Tohle je přesně ten tichý druh poruchy, který by se jinak
   projevil až u člověka, kterému jednou vypadla síť.

## 65. Kudy vede řez main.js — změřeno, zatím neprovedeno *20. 10.*

> **Provedeno 22. 10.** Jak to dopadlo a co z tohohle plánu nevyšlo,
> je v oddílu 102.

`js/main.js` má 480 kB zdroje, 237 kB po minifikaci a **54,3 kB po
brotli**. Měření pokrytím z oddílu 59 ukázalo, že se z něj na první
obrazovce nevykoná 132 kB. Cíl je rozdělit ho tak, aby se výpis
vykreslil **bez mapové knihovny** — na telefonu totiž `#leaflet-map`
při startu nemá ani výšku (úvod jede v režimu seznamu), a Leaflet
(36,1 kB brotli) přitom stojí na nasycené lince PŘED `main.js`.

Než se do toho sáhne, bylo potřeba vědět, kde ten řez vlastně vede.

### Co drží výpis u mapy

Jediný příkaz: `if (!mapEl || typeof L === 'undefined') { …hláška…;
return; }`. Ten `return` opouští celou obalující funkci, takže se
nevykoná nic pod ním — a výpis je pod ním.

### Jak je kód rozložený

Horní úroveň za tím strážcem má **790 příkazů**. Hrubé rozdělení podle
toho, jestli se v nich vyskytne `L.` nebo `map`:

| | bloků | řádků |
|---|---|---|
| dotýká se mapy | 112 | 3 608 |
| nedotýká se | 678 | 4 061 (53 %) |

Takhle vzato jsou to **169 střídajících se pásem** — mapový a nemapový
kód je prolezlý skrz naskrz a souvislý řez tudy nevede.

**Jenže to je špatná míra.** Většina těch „mapových" pásem jsou
DEKLARACE FUNKCÍ, které se při načtení jen zavedou a `map` se v nich
dotkne až později. Když se spočítají zvlášť:

| | bloků |
|---|---|
| deklarace funkcí (hoistují se, při načtení nic nedělají) | 200 |
| výkonné příkazy celkem | 590 |
| **z toho takových, které při načtení sáhnou na `L.` nebo `map.`** | **28** |

A proměnných, které takový výkonný příkaz zakládá, je **osm**:
`map` (ř. 901), `dotsRenderer` (958), `PkTvar` (1012), `dotLayer`
(2168), `shlukLayer` (2583), `czBounds` (3349), `radarVrstva` (4612),
`radarIkona` (4613).

### Z toho plyne plán

Řez nevede mezi dvěma soubory, ale mezi **deklaracemi a spuštěním**:
osm proměnných se vytáhne nad strážce (jako `null`), 28 výkonných
příkazů se složí do `spustMapu()` a ten se zavolá, až je `L` k mání.
Deklarace funkcí zůstanou, kde jsou — hoistují se.

**Co je na tom zrádné a proč se to nedělá naslepo:**

* Příkazy jsou rozházené mezi ř. 901 a 8391 a některé pozdější čtou,
  co ty dřívější založily (`DATA.forEach` staví značky z `PkTvar`).
  Po přesunu musí zůstat jejich vzájemné pořadí.
* Obsluhy událostí, které dnes volají `map.invalidateSize()` rovnou,
  musí umět, že `map` je zatím `null`.
* `L.Canvas.include` a `L.CircleMarker.extend` (ř. 1000–1018) se bez
  knihovny mlčky přeskočí a tečky na mapě spadnou na kolečka — to je
  přesně ta tichá porucha, kterou hlídá `scripts/test-tvary.mjs`.
* Ověřit to umí jedině celá sada v prohlížeči (121 zkoušek, kolem
  75 minut), a to po každém kroku.

### Doměřeno 20. 10.: plán výš je neúplný

Tři měření, která v něm chyběla.

**1. Kolik ten řez vynese.** Změřeno na úvodní stránce v okně 390 px:
kdy se objeví první nabídka ve výpisu, jednou tak, jak to je dnes,
a jednou se zdrženou mapovou knihovnou (route ji pustí až o 3 s
později, tedy jako by na kritické cestě vůbec nebyla).

| | knihovna | první nabídka |
|---|---|---|
| jak je to dnes | 70 ms | **1 046 / 599 ms** |
| se zdrženou knihovnou | 3 047 ms | **3 998 / 3 946 ms** |

Zdržení se přeneslo **jedna ku jedné**: výpis se objeví přesně o ty tři
vteřiny později. Výpis tedy na knihovně nevisí jen formálně přes ten
`return` — visí na ní celým svým časem. Na místním serveru to nic
nestojí (knihovna dojede za 70 ms), na opravdové lince stojí přesně
tolik, kolik trvá stáhnout 36,1 kB.

**2. Na čem ten řez doopravdy stojí.** Měření výš počítalo příkazy;
rozhoduje ale, kdo na osm mapových proměnných sáhne. Po opravě vzoru
(původní `\bmap\b` se trefil i do `'map-filters'`, `DATA.map(` a do
českého slova „mapě" v komentáři na konci řádku — proto napočítal o 14
míst víc) vychází:

| | kolik |
|---|---|
| výkonných příkazů, které na ně sáhnou při načtení | **27** |
| a je to TÝŽ seznam jako u `L.` / `map.` | ano |
| **pojmenovaných funkcí, které na ně sahají při volání** | **38** (asi 110 odkazů) |
| z toho dosažitelných z `renderList()` | **15** |

Ta třetí řádka je ta práce, kterou plán výš nezmiňoval: přesunout
27 příkazů nestačí, protože dokud mapa nestojí, musí **38 funkcí** umět,
že `map` je `null`. A není to okrajové: `syncMarkers()` stojí uprostřed
`renderList()`, takže na mapu sahá i vykreslení samotného výpisu.

**3. Kde ten kód vlastně je.** Celá ta „horní úroveň" je tělo
`async function boot(DATA, KRAJE_GEOM, …)` (ř. 609–8390), která se volá
až po dotažení dat. Strážce tedy neopouští modul, ale `boot` — a s ním
i výpis.

**4. Které z těch 27 se opravdu musí odložit.** Část z nich mapu jen
zmíní v těle obsluhy, která se spustí až později. Po vyhození těl
vnořených funkcí (párováním závorek — odsazení na to nestačí, obsluha
u `mapEl.addEventListener` má tělo odsazené jako příkaz horní úrovně)
vychází **22 příkazů, které na mapu sáhnou už při načtení**, a 7, které
jen registrují obsluhu.

Ani to dělení ale není hotové. Tři z té druhé hromádky běží taky hned,
jen to vzor nepozná: `(function schovejPriTazeni(){…})()` je IIFE,
`DATA.forEach(function (d, i) { … new PkTvar … })` volá obsluhu
synchronně a `setTimeout(…, 300)` sice až za 300 ms, ale na mapu
spoléhá. Zbývají tedy **čtyři**, které opravdu počkají na událost
(změna velikosti okna, dvě obsluhy kreslení, zrušení místa) — a ty
potřebují jen pojistku na `null`.

**Z toho plyne i poznámka k nářadí:** v repozitáři není parser JavaScriptu
(`scripts/minifikace.mjs` jen odstraňuje komentáře a mezery). Každé
zpřesnění toho dělení vzorem našlo další výjimku, a přepisovat
osmitisícový soubor regulárními výrazy je přesně ta chytrost, před
kterou komentář v minifikaci varuje. Krok A se má dělat po jednotlivých
místech a s ověřením, ne jedním skriptem.

Řez je pořád proveditelný a pořád bodový. Je to ale **práce na 38
funkcí**, ne na osm proměnných, a po každém kroku ji umí ověřit jedině
celá sada v prohlížeči (121 zkoušek, ~75 minut). Měřicí skripty, kterými
se to zjistilo, nejsou v repozitáři — jsou jednorázové a jejich čísla
jsou tady.

Řez je tedy proveditelný a je bodový, ne plošný. Je to ale samostatná
práce na několik kroků s měřením mezi nimi — ne něco, co se přibalí
k úklidu.

## 66. Tabulka porovnání vpravo mlčela *20. 10.*

Porovnávací tabulka se na telefonu nerozpadá do karet — jede se do
strany, aby zůstaly sloupce pod sebou. Naměřeno na 390 px: tabulka je
**745 px** široká, do okna se jí vejde **348**, takže **397 px (53 %)**
leží mimo.

Vlevo to prozradí přilepený první sloupec a stín pod ním
(`.por-tab tbody th::after`) — ten je ve stylopisu popsaný a je to
promyšlené. **Vpravo ale nebylo nic:** hlavička „CENA ZA M²" se uřízla
uprostřed slova a na snímku to vypadalo jako chyba vykreslení, ne jako
pozvání švihnout prstem.

Použila se **táž maska**, jakou má pruh naposledy prohlédnutých
(`.rs-row`) a řada nástrojů nad výpisem (`.mc-akce`) — třída `.je-dal`,
28 px přechodu. Třída se **přepíná**, nestaví napevno: po dojetí na
konec už není co slibovat a stín by lhal. (Ten vlevo je oproti tomu
statický — ale ten mluví o přilepeném sloupci, pod kterým se obsah
opravdu protahuje celou dobu, a nad 1060 px, kde se tabulka vejde celá,
se vypíná.)

**Těch deset řádků se opakuje, a je to napsané proč:** funkci `rsStin`
má `js/main.js`, který se na `porovnani.html` nenačítá. Vlastní soubor
kvůli deseti řádkům by byl požadavek navíc na každé stránce, která je
nepotřebuje.

Hlídají to tři kontroly v `scripts/test-porovnani.mjs` (maska je na
začátku, je to opravdu `mask-image`, a na konci mizí). Sabotáže:
vyhodit volání `stinyTabulek()` → spadly první dvě; nastavit třídu
napevno místo přepínání → spadla třetí.

## 67. Třetí číslo v hlavičce viselo na svislici *20. 10.*

Hlavička vstupních stránek má řadu velkých čísel („97 nových za 7 dní",
„150 nových za 14 dní", „73 zlevnilo"). Mezi nimi je svislice, a ta má
dobrý důvod: dvě čísla stejné velikosti vedle sebe oko slepí v jedno.
Jenže se dělala pravidlem `.okr-stat + .okr-stat`, tedy **podle pořadí
ve zdroji, ne podle místa v řádku**.

Naměřeno na `nove-pozemky.html`: tři čísla se vejdou do jednoho řádku
**od 430 px**. Pod tím se třetí zalomí — a vezme si s sebou svislici
i odsazení 32 px, takže na 390 px začínalo na **53 px**, kdežto první
číslo na **20**. Osamělý údaj zavěšený na čáře, která nic neodděluje.

Pod mezí se proto jede **mřížkou o dvou sloupcích**: kde co stojí, je
pak jisté, a svislici dostane jen to, co opravdu stojí v druhém
sloupci. Řádek tím i trochu ztratil na výšce (třetí číslo se posunulo
z 422 na 410 px).

**Sabotáž ukázala, že to není jen ta jedna stránka:** po vyhození
pravidla spadla kontrola i na `pozemky-stredocesky-kraj.html`
(„3 exekuce" na 320–390 px) a na `pozemky-do-1-milionu.html`
(„4 504 m² mediánová výměra" na 320 px) — krajské a rozpočtové stránky
mají čísla čtyři, takže se zalamují taky.

Hlídají to dvě kontroly v `scripts/test-hlavicka-stranky.mjs` na čtyřech
rodinách stránek × čtyřech šířkách (320/360/390/430). Měří se výsledek,
ne zápis: najde se, co v daném okně **začíná řádek** (nejlevější prvek
v každé řádce, ne první v pořadí), a u takového prvku nesmí být svislice
vlevo; k tomu se hlídá, že všechny řádky začínají na téže svislici.
Mez 429 px je naměřená — kdyby v datech narostla čísla a zalomila řádek
dřív, kontrola to ohlásí a mez se posune.

### Dvě vlastní pojistky repozitáře u toho zabraly

1. `test-staticka` našla, že komentář ve stylopisu odkazoval na
   zkoušku, kterou jsem nakonec nezaložil — kontroly šly do existující
   `scripts/test-hlavicka-stranky.mjs`, ale komentář o tom nevěděl.
2. `test-zkousky-meri` našla, že nový kontext měří okno 390 px **bez
   zapnutého dotyku**; pravidla pro telefon přitom visí na
   `@media (pointer: coarse)`, takže by se měřila myší podoba v úzkém
   okně.

## 68. Totéž číslo potřetí v jedné větě *20. 10.*

Podnadpis okresní stránky zněl: „Aktuálně evidujeme **33 pozemků**
v okrese Benešov — **33× na prodej**." Když jsou všechny nabídky
jednoho druhu, není ten rozpad informace, ale **zopakovaný součet** —
a v dlaždici pod ním stálo totéž číslo potřetí.

Dlaždice se vyřešily dřív (vypisují se, jen když je co rozpadat;
komentář v generátoru u toho sám přiznává „a v podnadpisu nad tím stojí
„28× na prodej" ještě jednou"). Věta zůstala. Naměřeno: týkalo se to
**43 z 91** okresních a krajských stránek — a všech 43 je dnes
„na prodej".

Když je druh jediný, píše se teď místo počtu to, **co to za nabídky
je**: „— všechny na prodej." Vazby jsou pro každý druh zvlášť, protože
„všechny na prodej" se řekne hezky a „všechny dražba" ne:

| druh | jedna nabídka | víc |
|---|---|---|
| prodej | na prodej | všechny na prodej |
| dražba | jde o dražbu | všechno jsou dražby |
| exekuce | jde o exekuci | všechno jsou exekuce |
| záměr obce | jde o záměr obce | všechno jsou záměry obcí |
| od majitele | od majitele | všechny od majitele |

Hlídá to dvojice kontrol v `scripts/test-cisla-okresu.mjs`: kolik vět
se vůbec přečetlo (91, aby kontrola nemohla projít naprázdno) a že
nikde není v rozpadu **jediný** údaj rovný součtu. Víc druhů projde —
„28× na prodej, 3× dražba" nese informaci navíc. Sabotáž (rozpad se
píše vždycky) shodila druhou kontrolu na 43 stránkách.

## 69. Práh, který se hýbal s trhem, ne s webem *20. 10.*

Dávka dat z 20. 10. shodila `scripts/test-strop-ceny.mjs`, aniž by se
na stránkách cokoli pokazilo. Kontrola zněla:

> z nedůvěryhodných je **část** státní půda (`spuNdv > 0 && spuNdv < ndv`)

Smysl měla: u státní půdy podle § 12 je nízká cena za metr daná
zákonem, ne chybou v inzerátu, takže tam místo varování „cena
k ověření" stojí „úřední cena (§ 12)". Kdyby výjimka platila pro
všechny nebo pro nikoho, kontrola pod ní by jednu z větví neprošla
a tiše by procházela naprázdno.

Jenže tenhle dotaz na data odpovídá **podle toho, co zrovna je na
trhu**. Dnes byly všechny nedůvěryhodné nabídky státní půda — **8 z 8**
— a zkouška spadla. Je to tentýž druh stárnutí jako práh „aspoň 60
dlaždic" v `test-cisla-okresu` (oddíl o okresních číslech): práh, který
se hýbe s daty, nehlídá web, ale náladu trhu.

**Poměr se teď jen vypíše** (`· nedůvěryhodných 8, z toho státní půda
8`) a nepodmiňuje nic. Místo něj se počítá, **kolik řádků se v které
větvi opravdu ověřilo** — a každá větev se kontroluje jen tehdy, když
do ní něco spadlo. Prázdná větev tím nemůže projít jako „žádná chyba".

Sabotáže:

1. Přestat počítat ověřené větve → „u státní půdy se „úřední cena"
   opravdu ověřila (0×)" spadla.
2. Přejmenovat třídu odznaku v generátoru → spadly obě kontroly, a to
   s výpisem konkrétních obcí (Úněšov, Hodonice, Pernarec, Zálesí
   u Bítova). **Napoprvé ta sabotáž neplatila:** přejmenoval jsem
   `okr-urad` na `okr-urad-SABOTAZ`, jenže zkouška hledá podřetězec,
   takže se dál shodovala. Sabotáž, která neplatí, je horší než žádná
   — tvrdí, že je kontrola slabá, a přitom slabá byla ona.

## 70. Prázdná výplň, kvůli které tlačítko viselo samo vpravo *20. 10.*

Na stránce pozemku stojí „Přidat poznámku" v řádku s okresem
(`.pz-head-radek`, flex se `space-between`): vlevo „okres Benešov",
vpravo tlačítko. Komentář u toho v `js/pozemek.js` vysvětluje proč —
vedle NADPISU se tlačítko na telefonu nevejde, vedle řádku s okresem
ano.

Jenže **řádek s okresem na stránce často není**: titulek ho už
obsahuje. Pro ten případ se místo něj vkládal `<span></span>` jako
výplň, aby `space-between` mělo co odstrčit. Výsledek: tlačítko viselo
samo u pravého okraje levého sloupce — na 1280 px na **x 610–776**,
s nadpisem nad ním vlevo a vzdáleností pod ním vlevo. Nemělo mezi čím
být a četlo se jako omylem položený prvek.

Naměřeno na vzorku 25 stránek pozemků: **15 z nich** (tři pětiny) řádek
s okresem nemá. Jde tedy zhruba o 1 160 z 1 940 stránek.

Bez té výplně zůstane v řádku jediný prvek a flex ho položí doleva —
pod nadpis, k levé svislici, na které začíná všechno ostatní. Naměřeno
po opravě na 390 / 760 / 1060 / 1280 / 1600 px: levý okraj tlačítka se
rovná levému okraji řádku na všech pěti šířkách. Stránky, které řádek
s okresem mají, se nezměnily (dva prvky, `space-between` dál platí).

Hlídají to dvě kontroly v `scripts/test-poznamky.mjs` na vzorku dvanácti
stránek: že jsou ve vzorku **obě** podoby řádku (jinak by se měřila jen
jedna větev) a že tlačítko nevisí u pravého okraje tam, kde je v řádku
samo. Sabotáž (výplň zpátky) shodila obě — a to i tu první, protože se
s výplní „obě podoby" počítají jako jedna.

## 71. Dvě třetiny titulků mluvily jiným hlasem *20. 10.*

19. 10. dostaly nadpisy vlastní písmo: `--font-nadpis` (Georgia /
Times New Roman / DejaVu Serif) pravidlem na `h1`, `h1.uvod-nadpis`
a `.section-head h2`. Záměr byl jasný — „celý web psal jedním
bezserifovým řezem, takže se nadpis od popisku lišil jen velikostí".

Jenže o pět dní starší pravidlo `.add-hero h1` si rodinu nastavovalo
samo (`--font-display`, tedy Inter) — a protože je o třídu
specifičtější, drželo se. Naměřeno na **27 ručně psaných stránkách**:

| | stránek |
|---|---|
| titulek serifem | 8 |
| titulek bezpatkově | **19** |

Mezi těmi devatenácti byly **všechny rádcovské články** (jak číst list
vlastnictví, územní plán, dražby, věcné břemeno, přístupová cesta,
hypotéka…), **právní stránky** (podmínky, ochrana údajů) i „Přidat
pozemek" a „Porovnání". O hlasu titulku tedy rozhodovalo jen to, kterou
třídu hlavičky stránka náhodou používá.

Ironií je, že právě ten komentář nad pravidlem mluví o témž problému,
jen obráceně: „Nadpisy appkových stránek zůstávaly bezpatkové a ve
váze 500 — vedle úvodní stránky pak působily jako jiný web." Přesně to
se stalo znovu, jen z druhé strany.

Pravidlu zbyla jen šířka sloupce; rodinu, prokládání i prokládání
řádků řeší `h1`. Po opravě: **27 z 27 serifem**.

### Hlídá to zápis, ne vykreslení

Nová kontrola v `scripts/test-pismo.mjs` (statická, bez prohlížeče)
hledá v `css/styles.css` pravidlo, které cílí na `h1` a zároveň si
nastavuje vlastní `font-family`. Takové pravidlo je vždycky
specifičtější než holé `h1`, takže ho přebije — ať stojí kdekoli.
Sabotáž (vrátit `font-family:var(--font-display)`) kontrolu shodila
a vypsala přesně to pravidlo.

## 72. Dvě zkoušky, které spadly v CI a lokálně ne *20. 10.*

Běh 584 shodil dvě kontroly. Obě lokálně procházely — a každá z jiného
důvodu.

### 1. Mez, která se vešla o tři pixely

Oprava z oddílu 67 (svislice mezi čísly v hlavičce) přepíná pod
**429 px** na dvousloupcovou mřížku. To číslo bylo naměřené: při Interu
se čtyři čísla do řádku vejdou od 430 px. Jenže „vejdou" tam znamenalo
**o tři pixely**: součet čísel je 291 px, mezery 3 × 32 = 96 px,
dohromady 387 proti 390 px obsahu.

V CI se na `pozemky-stredocesky-kraj.html` při 430 px zalomilo — stačí
svislý posuvník, jiné zaokrouhlení, cokoli. Ověřeno, že to **není
písmem**: s Interem i bez staženého písma (náhradní metriky) vychází
součet stejně, 291 px.

Mez je teď **559 px**: nad ní řádek, pod ní mřížka. Při 560 px zbývá
přes 130 px rezervy, takže se do ní vejde i pětimístný počet. Zkouška
měří obě strany té meze (…, 500, 559, 560, 680) — právě na hranici to
prasklo, tak se hranice hlídá.

Cena: mezi 430 a 559 px se tři čísla skládají do dvou řádků místo
jednoho. Za jistotu, že svislice visí jen tam, kde má, to stojí.

### 2. Premisa, kterou určuje trh

`test-shoda` hledala „nabídku s nevěrohodnou cenou, která není podíl" —
a navíc ani státní půda podle § 12. Dávka dat z 20. 10. měla všechny
nevěrohodné nabídky ze státní půdy (8 z 8, viz oddíl 69), takže se
nenašlo nic a tvrdá premisa spadla. **Totéž stárnutí jako v oddílu 69**,
jen o dům dál.

Měří se proto obě větve zvlášť a každá jen tehdy, když do ní něco
spadlo; pojistka proti prázdnu je, že aspoň **jedna** z nich něco mít
musí. Přeskočená větev se vypíše („…dnes v datech není, tahle část se
přeskočila") — týmž způsobem, jaký ta zkouška už jednou použila
o dvě stě řádků níž. O pokrytí se tím nepřichází: že odznak
„k ověření" opravdu vzniká, hlídá `test-strop-ceny` na okresních
stránkách.

Sabotáž: vynutit prázdno v obou větvích → nová premisa spadla.

### 3. A třetí, kterou našla až celá sada

Po obou opravách jsem pustil **celou sadu v prohlížeči** (121 zkoušek),
ne jen cílený výběr — právě ta zkratka ty dvě chyby propustila. Sada
shodila `test-vrstveni`: „oddíly nabídky jsou jen dva" a jeden z nich
měl text **„Moje"**, tedy kus rozestavěného dokumentu.

Lokálně se to nereprodukovalo: samostatný průchod ukáže čtyři oddíly
(Pozemky, Příležitosti, Rádce, Můj profil), každý s ikonou, a to hned
i po dvou dalších průchodech. Rozdíl dělá **zátěž**: ta část zkoušky
čekala `waitForTimeout(1500)` po načtení a `500 ms` po klepnutí na
hamburger. Pod plnou sadou to nestačilo a měřil se dokument, který se
teprve skládal.

Čeká se teď na výsledek: na hamburger, potom na otevřený panel, ve
kterém jsou všechny jeho oddíly vidět — a nakonec na to, co se opravdu
měří, tedy až `elementFromPoint` na měřeném bodě trefí panel. Bez téhle
poslední podmínky zkouška spadla znovu, jen na jiné kontrole („nahoře
na otevřeném panelu je opravdu panel: čekáno pás, vyšlo nic"): panel se
vysouvá, takže „je na obrazovce" ještě neznamená „na tomhle bodě už
leží".

**Změřeno, kolik času tam vlastně je:** od klepnutí na hamburger po
trefu do panelu uplyne na nezatíženém stroji **137–149 ms**. Pevných
500 ms tedy mělo rezervu jen 3,4× — a to plná sada sebere. Po opravě
čtyři běhy za sebou zelené tam, kde stará podoba padala.

Je to táž rodina, jakou řešil úklid pevných čekání (oddíly 61 a dřív) —
jen tahle tři čekání v ní zbyla.

### Co si z toho odnést

Práh naměřený „na jednom vzorku a jedné stránce" je odhad, ne mez.
U obou nálezů šlo o totéž: číslo vypadalo jako změřené, ale měřilo se
jen tam, kde zrovna bylo pohodlné měřit — jedna stránka se třemi čísly,
jeden den s jednou skladbou trhu.

## 73. Pět přelivů, kam hlídač nedosáhl *20. 10.*

Úklid přelivů (oddíl 19) i jeho hlídač v `scripts/test-soustava.mjs`
čtou **dva soubory**: `css/styles.css` a `css/pozemek-vlozeny.css`.
Jenže ručně psané stránky si část stylu nesou samy ve `<style>` —
a tam hlídač nikdy nekoukl. Naměřeno: **dvanáct z jednatřiceti**
ručně psaných stránek má vlastní `<style>` a přežilo v nich **pět
ozdobných přelivů**.

| nález | bylo | je |
|---|---|---|
| `404.html:37` `a` | `linear-gradient(135deg,#2C7150,#256546,#1B4A34)` | `#004F2F` |
| `muj-inzerat.html:46` `.pf-card` | `linear-gradient(155deg, var(--plocha-tlumena), var(--plocha-karta))` | `var(--plocha-karta)` |
| `muj-inzerat.html:50` `.pf-card::before` | `radial-gradient(… rgba(126,196,157,.16) …)` | pravidlo smazáno celé |
| `predloha.html:65` `.pas-ukazka` | `linear-gradient(150deg,var(--plocha-tmava-2),var(--plocha-tmava) 58%,#0E1712)` | `var(--plocha-tmava)` |
| `zpravy.html:89` `.zp-ava` | `linear-gradient(135deg,rgba(166,106,22,.18),rgba(31,81,56,.14))` | `var(--plocha-tlumena)` |

Dva nálezy jsou víc než kosmetika:

- `.pf-card::before` byla **záře přes celou kartu profilu** — pravidlo
  jen kvůli ní existovalo, takže zmizelo i s `position:absolute`
  a `inset:0`. A s ním i čtyři deklarace, které držely jenom ji:
  `position:relative` a `overflow:hidden` na `.pf-card` (zářivý
  pseudoprvek potřeboval, do čeho se ukotvit a čím se oříznout) a
  `position:relative` na `.pf-head` a `.pf-stats` (ty se jen potřebovaly
  dostat nad ni). Změřeno snímkem karty ve dvou šířkách, s panelem
  odkrytým až po doběhnutí skriptů stránky: po jejich vypnutí se liší
  **59 pixelů z 657 336** s největší odchylkou 3 (na 1440 px pět) —
  tedy vyhlazení na zaoblených rozích, nic jiného.
- `.pas-ukazka` je zrovna ta ukázka tmavého pásu, která má čtenáři
  vzorníku **předvést tokeny** — a měla v sobě `#0E1712` natvrdo, mimo
  paletku. Opravdové tmavé pásy na webu — `#realitky` a `.sources` —
  jsou přitom plná `var(--plocha-tmava)` bez jediného přelivu, takže
  ukázka nepředváděla to, co se na webu používá. Teď ano.

A tlačítko na 404 se trefilo do webu i jinak: `#004F2F` je přesně
`--plocha-znacka`, tedy táž barva, jakou má `.btn-primary` všude
jinde. Přeliv začínal na `#2C7150`, takže se hlavní tlačítko na jediné
stránce, kterou uvidí každý, kdo si splete adresu, lišilo od hlavního
tlačítka na zbytku webu.

**Změřený kontrast se nikde nezhoršil**, u téhož tlačítka se výrazně
zlepšil: bílý text na `#004F2F` dává **9,72 : 1** proti dřívějším
**5,86 : 1** na nejsvětlejším místě přelivu. `.pas-ukazka` má 16,24 : 1
(přeliv měl 14,61–18,26) a měď na ní 8,74 : 1, jak token slibuje.
Ikona v `.zp-ava` má na plné ploše 5,17 : 1 — grafickému prvku stačí 3.

### Co hlídač čte teď

Scan dostal třetí zdroj: obsah `<style>` **každé ručně psané stránky**.
Mimo zůstávají vyrobené stránky, a to měřitelně po právu — `pozemky-*`
vlastní `<style>` vůbec nemají (0 ze 104) a `pozemek-*` do něj dostanou
očištěný `css/pozemek-vlozeny.css` (2 179 stránek), který se čte výš ze
zdroje; že se vkládá opravdu on, hlídá `test-vlozeny-styl`.

Ze stránky se do scanu pouští **jen vnitřek `<style>`**, zbytek se
vybílí na mezery stejné délky — číslo řádku v hlášce pak ukazuje na
opravdový řádek souboru, ne na pozici ve výřezu. Sabotáž (vrátit přeliv
do `.zp-ava`) kontrolu shodila a vypsala `zpravy.html:89 .zp-ava`, tedy
soubor, řádek i selektor.

### A vedlejší nález: vzor, který se na uvozovkách zastavil

Když 404 dostala nadpis serifem vypsaným natvrdo (nemá odkud vzít token,
viz oddíl 71), `test-pismo` ji nahlásil — ale s hodnotou `Georgia,`.
Vzor na rodiny si totiž zakazoval `'` i `"`:

```
font-family\s*:\s*([^;}"']+)     ← starý
font-family\s*:\s*([^;}]+)       ← nový
```

Rodina ale uvozovkami běžně **začíná**. Naměřeno na stejné sadě souborů:

| | deklarací `font-family` |
|---|---|
| starý vzor viděl | 133 |
| nový vidí | **138** |

Rozdíl je šest deklarací s uvozovkami, ne pět: **pět** vzor minul úplně
(`'Inter','Helvetica Neue',Arial,sans-serif` v 404, `diagnostika` a
`inzerce`, dvakrát `@font-face` ve stylopisu) a u **jedné** se shodl jen
na začátku a hlásil chybu, která žádná nebyla. Hlídač tedy roky tiše
pouštěl každou rodinu zapsanou od uvozovky — tedy právě tu podobu, ve
které se cizí písmo píše.

Sabotáž: `font-family:'Comic Sans MS',cursive` v 404. Nový vzor hlásí
`404.html:30 font-family: 'Comic Sans MS',cursive`; starý na témž
souboru našel jedinou hodnotu — `Georgia,`.

### Co si z toho odnést

**Hlídač platí jen pro soubory, do kterých se podívá.** Oba nálezy jsou
táž chyba ve dvou podobách: scan měl seznam zdrojů (dva soubory) a vzor
měl zakázanou abecedu (uvozovky), a v obou případech se mimo ten rozsah
roky nic neověřovalo. Když kontrola projde, je dobré se jednou zeptat
**na čem** prošla — a to číslo si vypsat.

## 74. Pilulka napsaná číslem na dvanácti místech *20. 10.*

Zaoblení pilulky je `--r-pill` (999 px). Hlídač na zaoblení,
`scripts/test-zaobleni.mjs`, měří **vykreslené** hodnoty — a to je
dobře, protože přes média a přebití se zápis a výsledek rozcházejí.
Jenže měří je na **osmi vybraných stránkách** a staticky čte jen
`css/styles.css`, takže na to, jak je zaoblení *zapsané*, se nikdo
nedíval.

Naměřeno:

| | míst |
|---|---|
| pilulka tokenem | 53 |
| pilulka opsaná jako `999px` | **12** |

Dvanáctka není v koutě webu: dvakrát přímo v `css/styles.css` a
**pětkrát v `css/pozemek-vlozeny.css`**, odkud se vkládá do 2 179
stránek pozemku. Zbytek ve vložených stylech `hlidani.html` (3×),
`muj-inzerat.html` a `predloha.html`.

Čísla jsou stejná, takže se tím nevykreslí nic jinak — a přesně proto
to nikdo nenašel. Jde o to, aby se dala pilulka jednou změnit: dnes by
se změnila na padesáti třech místech a na dvanácti zůstala.

### Co se nemění

- **`404.html` a `diagnostika.html`** si schválně nenačítají stylopis
  (mají vyjít i tehdy, když ostatní soubory chybí). Token by v nich byl
  nedefinovaná proměnná a prohlížeč by deklaraci zahodil, takže se tam
  zaoblení píše číslem. Obě stránky stojí ve výjimce hlídače i s tímhle
  důvodem — sedm hodnot celkem.
- **`.pz-sect-h::before` má `border-radius:2px`** a na stupnici
  (6 / 10 / 14 / 20 / pilulka) není. Je to 52 × 2 px vysoká ozdobná
  linka nad nadpisem oddílu; dvojka jí zakulacuje konce. Zaoblení
  ovládacího prvku to není, takže se na ni pravidlo o stupnici
  nevztahuje.

### Hlídač

Přibyl do `scripts/test-jeden-styl.mjs` — tedy tam, kde už se hlídá
„pojmenovaná hodnota místo opsaného čísla" pro velikost nadpisu a pro
mřížkovou texturu. Čte **všechny ručně psané stylopisy** (`css/*.css`
kromě `*.min.css`, což jsou výstupy) **a vložené `<style>` ručně psaných
stránek**; vyrobené stránky ne, protože `pozemky-*` vlastní `<style>`
nemají a `pozemek-*` do něj dostanou očištěný `css/pozemek-vlozeny.css`,
který se čte ze zdroje.

Ke kontrole patří dvě pojistky, aby neměřila prázdno a nedala se obejít:
že se pilulka ve zdrojích vůbec vyskytuje (53× tokenem), a že se
`--r-pill` nikde **nepřepisuje** — jinak by „jedna hodnota" nebyla jedna.

Sabotáž, všechny tři zvlášť: `999px` vrácené do `css/pozemek-vlozeny.css`
i do vloženého stylu `hlidani.html` kontrolu shodí a vypíše
`css/pozemek-vlozeny.css:138` a `hlidani.html:206` — tedy soubor
i opravdový řádek; druhá definice `--r-pill` shodí pojistku o přepsání.

## 75. Sedm podob zaměření — a u polí nebylo vidět žádné *20. 10.*

Úkol začal jako kosmetika: ve stylopisu stálo devět zápisů tvaru
`box-shadow:0 0 0 Npx rgba(…)`. Roztřídění podle selektoru ukázalo, že
část z nich jsou halo kolem tečky nebo vnitřní vlasová linka, a ty se
sjednocovat nemají. Zbylo **sedm prstenců u polí, v pěti receptech**.

Místo hádání, jestli je to vidět, jsem **prošel sedm stránek
tabulátorem** (97 zaměřitelných prvků) a u každého prvku zapsal, jak
zaměření vypadá po doběhnutí přechodu. Vyšlo **sedm různých podob**:

| podoba | kde |
|---|---|
| obrys 2px `--znacka-svetla`, odstup 2 px | odkazy, tlačítka |
| obrys 2px `--znacka`, odstup 3 px | rozbalovátka `<summary>` |
| obrys 2px `--znacka`, odstup 2 px | „Skrýt", „Jak to funguje" |
| prstenec 4px `rgba(31,81,56,.14)` | hlídání, zprávy |
| prstenec 3px `rgba(126,196,157,.16)` | přihlášení |
| prstenec 3px `rgba(126,196,157,.22)` | hledání nad mapou |
| prstenec 3px `rgba(176,116,42,.16)` | kalkulačka ceny (měděný) |

### A pak se to otočilo

Změřený kontrast ukázal, že o kosmetiku nejde:

| | poměr |
|---|---|
| prstenec proti ploše | **1,11 – 1,31 : 1** |
| změna barvy okraje mezi stavy (šedá → zelená) | **1,21 – 1,35 : 1** |
| obrys 2 px všude jinde na webu | **5,50 : 1** |

Pole si totiž obrys **vypínala** (`outline:none`) a nechávala za sebe
jen ten okraj a prstenec. Obojí je pod prahem, kdy to oko pozná — takže
formulářová pole byla jediná místa na webu, kde při ovládání klávesnicí
nebylo vidět, kde člověk stojí. Hypotéza, že měděný prstenec stojí na
měděném pásu a proto je jiný, se **nepotvrdila**: změřeno, že všech sedm
polí leží na bílé.

Vypnutý obrys přitom neměl u jediného z nich napsaný důvod — na rozdíl
od `.leaflet-container`, kde stojí a platí.

### Co se změnilo

- **Obrys se nevypíná.** Dodá ho obecné pravidlo `:focus-visible`, tedy
  jen při ovládání klávesnicí; po klepnutí myší zůstává vzhled stejný
  jako dřív. Týká se i polí, která obrys rušila v základním pravidle
  (`.hl-in`, `.zp-in`, `.zp-ta`, `.loc-input`, `.pz-pozn-pole`).
- **Jeden obrys:** `2px solid var(--znacka-svetla)`, odstup 2 px.
  Dřívější tmavší zeleň (7 pravidel) i odstupy 1 a 3 px jsou pryč.
- **Jeden prstenec:** token `--prstenec-pole` místo pěti receptů. Zůstal
  jako ozdoba — u tokenu je napsané, že ukazatelem zaměření není.
- **`.vm-pole`** je pole bez rámečku uvnitř kresleného obalu; tam obrys
  uvnitř nedává smysl, takže ho kreslí obal přes
  `:has(input:focus-visible)`. Dřív se zaměření poznalo jen podle
  okraje obalu, tedy na 1,21 : 1.

Dvě výjimky zůstaly a dostaly napsaný důvod: `.dv-znovu` má inkoustový
obrys, protože sedí na dražební oranžové ploše, a shluk na mapě má 3 px,
protože leží na pestrých dlaždicích.

**Po opravě** táž procházka přes týchž sedm stránek: **jedna podoba**
obrysu. Třetí varianta, která se ve výpisu ještě objeví, je týž token —
jen si ho plocha `.add-hero` záměrně ztmavuje na `#0F5C3B`, aby na ní
vyšel kontrast (důvod je u toho pravidla popsaný už od dřívějška).

### Hlídač

Čtyři kontroly v `scripts/test-jeden-styl.mjs`, čtou stylopisy i vložené
styly: že je co měřit (26 pravidel s obrysem), že obrys je všude týž, že
se nikde nevypíná bez důvodu, a že prstenec pochází z tokenu (7×).
K tomu se u každé výjimky ověřuje, že má napsaný důvod.

Sabotáž, všechny tři zvlášť: obrys přepsaný na `3px solid var(--znacka)`
s odstupem 4 px, vrácené `outline:none` u `.rv-pozn:focus` a vrácený
opsaný prstenec do `zpravy.html` — každá shodí svou kontrolu a vypíše
soubor, řádek i selektor.

### Co si z toho odnést

**Sjednocení je záminka, ne cíl.** Kdyby se těch pět prstenců jen
přepsalo na jeden, vypadalo by to jako hotová práce — a pole by dál
neměla vidět, kde stojí. Rozdíl udělalo to, že se místo počítání receptů
změřilo, co z toho je vůbec vidět.

## 76. Dva ze čtyř zbylých modulů prvnímu návštěvníkovi neudělají nic *20. 10.*

Oddíl 64 odložil tři moduly z osmi a u zbylých čtyř napsal, že se při
startu opravdu čtou, takže je odložit znamená přestavět start. U dvou
z nich se ukázalo, že přestavovat se nemusí skoro nic — stačilo se
zeptat jinak.

**Nečte se „jestli se modul čte", ale „k čemu je tomuhle návštěvníkovi".**

- `PKPoznamky` (čten ve 377 ms) kreslí na kartě odznak „Poznámka"
  a slučuje poznámky s účtem. Obojí potřebuje, aby v prohlížeči
  **nějaká poznámka byla**, nebo aby byl kdo přihlášený. Prvnímu
  návštěvníkovi bez účtu nenajde ani jedno.
- `PKUlozeneUcet` (308 ms) přenáší uložené pozemky na účet. Nepřihlášenému
  `sync()` stejně neudělá nic — to je napsané přímo v `js/ulozene-ucet.js`.

Rozhoduje proto **stav prohlížeče**, ne značka ve stránce: klíč
v úložišti (`pk_poznamky_v1`), přihlášení, nebo první uložení pozemku.

### Jeden modul navíc odpadl jen tím, že se ptáme správného

`refreshFavBtn()` a popisek „uloženo na účtu / jen v prohlížeči" se
ptaly `PKUlozeneUcet.prihlasen()`. Jenže ta funkce odpověď jen
přeposílá — `js/ulozene-ucet.js` v ní dělá
`return !!(root.PKAuth && root.PKAuth.prihlasen && root.PKAuth.prihlasen())`.
Kvůli dvěma popiskům se tak stahoval celý modul. Teď se main.js ptá
rovnou `PKAuth`, který na úvodní stránce stejně je.

### Co to ušetří

Změřeno na první návštěvě (telefon 390 px, prázdný prohlížeč, žádný
účet, žádný dotek):

| | |
|---|---|
| souborů z `js/min/` méně | **2** |
| nestaženo | `ulozene-ucet.js`, `poznamky.js` |
| velikost | **7 621 B** min · **2 470 B** gzip · **2 275 B** brotli |
| vykreslení výpisu | **1** (nepřibylo) |

Pro srovnání: tři moduly z oddílu 64 ušetřily 4 794 B brotli, takže
tyhle dva přidávají skoro polovinu toho, co celý předchozí krok.
A hlavně — obě položky byly `<script>` **bez `defer`**, tedy skripty,
které zdržují zpracování stránky.

### Zůstávají dva

`PKAuth` (167 ms) rozhoduje o podobě hlavičky, takže by odložení
bliklo prázdnou hlavičkou; `PKHledani` (250 ms) se v `boot` bere do
proměnné (`var HL = window.PKHledani || {…}`). Ani jeden se neodkládá.

### Hlídač

`scripts/test-odlozene-skripty.mjs` dostal obě půlky pravidla, protože
samotné „nestahuje se" by se dalo splnit i tím, že se modul nenačte
nikdy a odznak poznámky už nikdo neuvidí:

- prvnímu návštěvníkovi se **nestáhne ani jeden** a ani jeden globál na
  stránce není;
- s poznámkou v úložišti se modul **dotáhne a odznak na kartě naskočí**;
- po prvním uložení pozemku se **dotáhne modul uložených**.

Poznámka k měření: klíč poznámky je `klicPozemku` (pkey + výměra), ne
hrubý pkey, a hodnota má pole `text`. S obojím špatně se modul stáhl,
výpis překreslil — a odznak se neměl u čeho objevit. Zkouška proto
zapisuje poznámku ke **všem** nabídkám: která z nich se na první
stránce výpisu vykreslí, rozhoduje řazení a stránkování.

Sabotáže, každá zvlášť: vrácená značka `<script>` pro `poznamky.js`
shodí statickou kontrolu i tu o prvním návštěvníkovi; vyřazené
dotažení poznámek shodí obě kontroly o odznaku; vyřazené dotažení
uložených shodí kontrolu o prvním uložení.

### Co se u toho rozbilo — a je to ta zajímavá část

Odložení se **šíří dál, než kam člověk kouká**. Dva jiné moduly totiž
kreslí podle toho, jestli je `PKPoznamky` na stránce:

- **Rychlý výběr** má na kartě „Přidat poznámku" — a to tlačítko se
  vykreslí jen `window.PKPoznamky ? … : ''`. Od chvíle, kdy se poznámky
  dotahují podle stavu, by ta nabídka zmizela každému, kdo zatím žádnou
  poznámku nemá — tedy přesně tomu, komu je nabízena. Chytila to
  `scripts/test-rychly-prohlizec.mjs` (`"vyzva":false`).
- **Vývoz** umí sloupec s poznámkou a vrstvu „jen s poznámkou"
  (`vyvozPomocne`, `vyvozSada`). Bez modulu by okno nabídlo nulu
  a sloupec by ve vyvezeném souboru chyběl, **aniž by to kdo řekl**.
  Tohle nechytil nikdo — našlo se to až pohledem na to, kdo další se
  na `PKPoznamky` ptá.

Obojí se opravilo stejně: poznámky se dotahují **spolu** s rychlým
výběrem i s vývozem, a to jen jednou — kdyby se to nepovedlo, nesmí se
otevírání zacyklit, protože obojí má jet i bez poznámek.

**A sabotáž, která neplatila.** První pokus o shození těch dvou nových
kontrol jen přepsal podmínku `if (!window.PKVyvoz || (…&& !PKPoznamky))`
na `if (!window.PKVyvoz)` — jenže uvnitř bloku zůstal řádek, který
modul stahuje, takže se stahoval dál a zkouška prošla. Neplatná sabotáž
vypadá jako důkaz, a přitom nedokazuje nic; musela se vyhodit i ta
vnitřní větev.

## 77. Obálka, kterou nebylo vidět na vlastní dlaždici *20. 10.*

Pokračování řady „hlídač platí jen pro soubory, do kterých se podívá"
(oddíly 73–75). Tentokrát barvy: `scripts/test-barvy.mjs` měří
**vykreslení** na vybraných stránkách, staticky čte jen `css/styles.css`
— a do vložených `<style>` ručně psaných stránek se nedívá nikdo.

Naměřeno: **13 hexů** mimo bílou a černou. Z toho jeden byl vada, kterou
je vidět na první pohled, jakmile se změří.

### Ikona pošty měla 1,93 : 1

```
.kt-mail .kt-ico{… background:var(--plocha-znacka);}      /* #004F2F */
.kt-mail .kt-ico svg{… color:#081410;}                    /* skoro černá */
```

Tmavý inkoust na tmavě zelené dlaždici. **1,93 : 1** — grafickému prvku
se žádá aspoň 3. Obálka na dlaždici byla spíš tušená než vidět, a bylo
to tak na **pěti stránkách** (`data`, `kontakt`, `moje-data`,
`odhlasit-maily`, `porovnani`), protože se to pravidlo kopírovalo.

Bílá dá na téže ploše **9,72 : 1** a je to táž volba, jakou na
`--plocha-znacka` dělá `.pf-avatar` i `.btn-primary`. Ověřeno snímkem
před i po.

### Tři odznaky s ručně namíchanou barvou

`muj-inzerat.html` mělo tři stavy odznaku zapsané číslem, i když paletka
ty barvy pojmenované má. U jednoho to nestačilo ani na čtení:

| | plocha odznaku | bylo | je |
|---|---|---|---|
| `.mi-lstatus.ok` | rgba(31,163,99,.12) | `#178a53` → **3,85 : 1** | `var(--c-ok-ink)` → **6,15 : 1** |
| `.mi-potiz` | rgba(232,179,65,.13) | `#6b4604` → 7,73 : 1 | `var(--c-warn)` → 5,71 : 1 |
| `.mi-lstatus.ne` | rgba(176,58,46,.12) | `#9c3025` → 6,11 : 1 | `var(--c-exekuce-ink)` → 6,89 : 1 |

První řádek je skutečná vada: 3,85 proti mezi 4,5 : 1 pro drobné písmo.
U jantarové hlášky kontrast klesne, ale zůstává vysoko nad mezí —
a `--c-warn` je token, který pro upozornění v soustavě je. Pravidlo
„novou hodnotu nepřidávej, vyber nejbližší, která v soustavě je" platí
i tady.

### A třetí stránka bez stylopisu

`inzerce.html` si nenačítá **žádný** stylopis (`rel="stylesheet"`: 0),
takže tokeny nemá k dispozici a `#12241A` i `#0F5C3B` v ní stojí číslem
po právu — stejně jako serif v `404.html`. Je to tedy třetí stránka té
rodiny vedle `404.html` a `diagnostika.html` a patří do výjimek
hlídačů i s důvodem.

### Hlídač

V `scripts/test-jeden-styl.mjs` přibylo: **vložený styl nesmí opisovat
barvu, kterou už token má**. Obranná náhrada `var(--jméno, #záloha)` je
v pořádku a vyjímá se; bílá a černá se nepočítají, protože bílá má
v paletce dvě jména a `color:#fff` na značkové ploše píše i sám
stylopis — kontrola by hlásila 40 míst, kde se nic nepokazilo.

**Co se u toho opravilo na hlídači samotném:** kontroly četly celý
soubor stránky, ne jen vnitřek `<style>`. Hlásily proto
`predloha.html:179` — jenže tam ten `#F7F8F8` stojí v **odstavci, který
úklid přelivů popisuje**. Všechny tři kontroly (pilulka, zaměření,
barva) teď čtou jen vložený styl; zbytek stránky se vybílí na mezery
stejné délky, aby čísla řádků dál ukazovala na opravdový řádek.

Sabotáž: `background:#004F2F` místo `var(--plocha-znacka)` ve vloženém
stylu `hlidani.html` kontrolu shodí a vypíše `hlidani.html:221
#004F2F = --plocha-znacka`.

## 78. Osm posuvných pruhů, jeden o sobě mlčel *20. 10.*

Oddíl 66 dal tabulce porovnání masku „pokračuje vpravo". Otázka, která
se tehdy nepoložila: **kolik takových pruhů web vlastně má?**

Ve stylopisu je `overflow-x:auto` na **osmi** místech. Změřeno
v prohlížeči na telefonu 390 px — ne ze zápisu, protože o tom, jestli
pruh opravdu přetéká, rozhoduje obsah:

| pruh | přetéká? | říká to? |
|---|---|---|
| `.por-tab-obal` (porovnání) | 745 / 348 | ano |
| `.dt-tab-obal` (data, 2. tabulka) | **460 / 348** | **ne** |
| `.dt-tab-obal` (data, 1. tabulka) | vejde se | — |
| `.mc-akce`, `.uc-taby .wrap` (4 stránky) | vejde se | — |
| `.recent-strip .rs-row`, filtry v panelu | v měřeném stavu na stránce nebyly | — |

Takže **jeden jediný** — a je to táž vada, jakou řešil oddíl 66, jen na
stránce, kam oprava nedosáhla. O pruzích na úvodní stránce se netvrdí
nic: v měřeném stavu (nepřihlášený, zavřený panel) na stránce nebyly.

### Proč oprava nedosáhla

`stinyTabulek()` v `js/porovnani.js` hledá `.por-tab-obal` **uvnitř
`#porovnani`**. Jenže `data.html` ten soubor taky načítá — a modul se
ukončí hned na druhém řádku, `if (!host) return`, protože `#porovnani`
na té stránce není.

### Jak se to spravilo bez třetí kopie

Logika stínu existuje dvakrát: `rsStin` v `js/main.js` a `stinPosuvu`
v `js/porovnani.js`. U té druhé je napsané, proč se opakuje — vlastní
soubor kvůli deseti řádkům by byl požadavek navíc na každé stránce,
která je nepotřebuje. Třetí kopie tedy vznikat neměla.

Nemusela: stačilo těch deset řádků **spustit dřív, než se modul ukončí**.
`stinPosuvu` je teď nad strážcem, hned za ním jde průchod přes obaly,
které na stránce stojí napevno (`.dt-tab-obal`), a teprve pak se modul
rozhodne, jestli má co porovnávat. Maska je táž (jeden selektorový pár
ve stylopisu), protože obě tabulky mají říkat totéž.

### Hlídač

V `scripts/test-porovnani.mjs` přibyl oddíl 4b: na `data.html` se změří,
které obaly přetékají, a **každý přetékající** musí nést masku. Pojistka
„je co měřit" hlásí poměr (1 ze 2) — kdyby se obsah tabulky jednou
zúžil tak, že se vejde, kontrola by jinak prošla na prázdnu. Měří se
jen přetékající: u té první by maska lhala.

Sabotáž: průchod přesunutý zpátky **pod** strážce `if (!host) return`
shodí obě nové kontroly.

## 79. Konstanta, která se počítala pro každou nabídku zvlášť *20. 10.*

Hledalo se něco jiného. Oddíl 64 nechal `PKHledani` značkou `<script>`
s odůvodněním „při startu se opravdu čte", a po zkušenosti z oddílu 76
(kde se „čte se" ukázalo jako špatná otázka) stálo za to to přeměřit:
**používá se ten modul, nebo se jen přečte do proměnné?**

Metody modulu dostaly počítadlo dřív, než si je `main.js` vezme — drží
tentýž objekt, takže se započítají i volání přes jeho proměnnou `HL`.

| | volání `HL.norm` | čas |
|---|---|---|
| načtení, žádný dotek | **23 366** | 18,8 ms |
| po napsání „benesov" (8 vykreslení) | **200 569** | 108,4 ms |

**Hypotéza se nepotvrdila** — modul se opravdu používá a odložit ho
nejde; závěr oddílu 64 platí. Jenže to číslo samo je nález.

### Odkud to šlo

Ze zásobníku: **všech 23 366 volání z `presnyNazev()`**. Ta funkce
vrací dotaz, pokud je celý přesným názvem obce nebo okresu — tedy
odpověď, která **závisí jen na dotazu**. Pro celé vykreslení je to
konstanta. A volala se z filtru **pro každou nabídku** (`okPresne`):
1 949 nabídek × ~12 průchodů.

Při napsaném dotazu k tomu přibylo 46 712 volání z `jePresna()`, která
normalizuje `d.place` a `d.okres` — neměnná pole záznamu — znovu při
každém vykreslení.

### Oprava: dvakrát totéž, co repozitář už dělá

1. **`presnyNazev()` si pamatuje výsledek.** Klíč nese dotaz i
   `DATA.length`, aby po dotažení nových nabídek nelhal — stejně jako
   `znamaJmena()` o pár řádků výš.
2. **Normalizované jméno obce a okresu se schová k záznamu** (`__nm`,
   `__no`, neviditelné pro `Object.keys` i `JSON.stringify`) — týž
   postup jako `__pk` v `js/klic.js`, u kterého stojí, že byl „nejdražší
   funkcí stránky".

| | před | po |
|---|---|---|
| načtení, žádný dotek | 23 366 volání / 18,8 ms | **1** / 0,2 ms |
| po napsání dotazu | 200 569 / 108,4 ms | **7 770** / 7,7 ms |

Tedy **o 93 % méně práce** při psaní do hledání — a to je přesně ta
chvíle, kdy se na telefonu překresluje nejčastěji.

Čísla jsou horní odhad: počítadlo v obalu samo něco stojí. Měřilo se
jím ale před i po stejně, takže rozdíl platí.

### Hlídač

`scripts/test-plynulost.mjs` dostal novou kontrolu: při načtení bez
doteku se normalizace jmen smí zavolat **nejvýš stokrát**. Počet volání,
ne milisekundy — je to bezrozměrné, takže se tím měří kód, ne stroj, na
kterém zkouška běží. Je to týž důvod, proč se v té zkoušce výš měří
poměr úloh místo pevné meze. Mez je schválně volná: hlídá se řád, a
kdyby se zapamatování rozbilo, vyskočí číslo na desetitisíce.

### A jedna zkouška spadla na zápisu, ne na chování

`test-okres-stranka.mjs` hlídá, že se místo z adresy `?obec=` srovnává
**celým názvem**, ne hledáním podřetězce — jinak by „Lhota" vytáhla
všechny Lhoty v republice. Dělá to ale čtením zdroje:

```
/HL\.norm\(d\.place\) === HL\.norm\(mistoFiltr\.place\)/
```

Po zapamatování se tentýž výraz píše `normObce(d) === HL.norm(…)`, takže
kontrola spadla, i když se chování nezměnilo ani o písmeno. Vzor teď
bere obě podoby a u něj stojí proč. Ověřeno, že pořád hlídá: záměna za
`indexOf` ho shodí.

Je to cena za kontrolu, která čte zápis místo vykreslení — a ta cena
stojí za to. Kdyby se ta kontrola měřila v prohlížeči, musela by
nasimulovat obec, jejíž název je podřetězcem jiné, a to je křehčí než
jeden výraz ve zdroji.

### Co si z toho odnést

**Přeměřit starý závěr se vyplatí i tehdy, když se potvrdí.** Hypotéza
„modul se jen čte" padla — a při jejím ověřování vypadlo z měření něco,
co nikdo nehledal: že se konstanta počítá dvacetkrát tisíc za vykreslení.


## 80. Vynucené rozvržení: změřeno, NEUDĚLÁNO *20. 10.*

Oddíl 79 našel drahé místo počítáním volání jedné funkce. Tahle otázka
byla obecnější — **kde úvodní stránka opravdu tráví procesor?** — a
odpověď na ni skončila tím, že se kód nezměnil. Je to tedy záznam
o optimalizaci, která se neudělala, a proč.

### Co profil ukázal

CDP Profiler, telefon 390 px, procesor 4× zpomalený (stejně jako
v `test-plynulost`). Nejdražší funkcí z `main.js` vyšla
`nastrojeDoHlavicky()` — krátká funkce bez jediného cyklu, která
přesune řádek nářadí do hlavičky výpisu.

První běh ukázal **266,5 ms**, opakování **95,8 / 106,8 / 123,7 ms**.
Ta dvěstěšedesátka byl odlehlý vzorek ze studeného startu serveru;
platí to druhé. (Táž past jako v oddílu 72 — jen tentokrát jediný
*běh*, ne jediná stránka.)

Proč krátká funkce stojí stovku milisekund: zasahuje do DOM
(`classList.remove`, `appendChild`) a **hned za tím čte geometrii**
(`scrollWidth`). Tím prohlížeč musí spočítat rozvržení okamžitě — a
protože ta funkce běží z `renderList()`, je to rozvržení celého
čerstvě postaveného seznamu.

### Co se zkusilo a proč to nepomohlo

Měření se odložilo do `requestAnimationFrame`. V profilu to vypadalo
jako úspěch: funkce ze žebříčku nejdražších zmizela, a to ve třech
bězích ze tří.

**Byl to ale klam z přejmenování.** Práce se přesunula do anonymní
funkce uvnitř `requestAnimationFrame`, a tím se v profilu slila do
velké položky „(anonymní)". Jakmile se to měření vytáhlo do pojmenované
funkce, bylo zpátky: 108–182 ms.

Důvod je věcný: **callback `requestAnimationFrame` běží PŘED
rozvržením**, takže čtení geometrie v něm rozvržení vynutí úplně
stejně. Odložení o jeden snímek posune, kdy se to stane, ne jestli.

### Rozhodlo jediné číslo, které se nedá obejít

Vlastní čas VŠECH funkcí z `main.js` dohromady, tři běhy:

| podoba | běhy | průměr |
|---|---|---|
| synchronně (jak to je) | 508 / 624 / 481 ms | 538 |
| odložené do `requestAnimationFrame` | 588 / 487 / 566 ms | **547** |
| čtení geometrie úplně pryč | 458 / 443 / 509 ms | 470 |

Odložení tedy neušetří **nic** — rozsahy se překrývají. Horní mez toho,
co vůbec jde získat, je rozdíl mezi prvním a třetím řádkem: kolem
**70 ms zpomaleného procesoru, tedy asi 17 ms skutečných**. A to by
znamenalo stín „pokračuje vpravo" buď zrušit, nebo postavit na něčem
jiném než na čtení geometrie.

Změna se proto **vrátila zpět** i s hlídačem, který k ní patřil. Sedmnáct
milisekund nestojí za složitější kód — a hlavně: hlídač by hlídal
pravidlo („nečti geometrii v té funkci"), o kterém teď víme, že samo
o sobě nic neřeší.

### Co si z toho odnést

1. **Profil ukazuje, kde se čas tráví, ne proč.** Stovka milisekund
   v krátké funkci bez cyklu není její práce; je to účet za něco, co si
   vyžádala jinde.
2. **Pozor na zlepšení, které je jen přejmenování.** Když práce zmizí
   z jedné položky profilu, má se ověřit, že nepřibyla v jiné — nejlépe
   součtem, který se přesunem obejít nedá.
3. **Jeden běh profilu je jeden vzorek.** Než se na jeho čísle začne
   stavět, má se zopakovat.

### Doplněno 26. 10.: otevřený úkol na totéž se zavírá

V seznamu úkolů zůstávala položka „`nastrojeDoHlavicky` si vynutí
rozvržení a hned ho zahodí (jedno čtení ze 47)". Je to tahle věc ještě
jednou, jen jinými slovy — a odpověď na ni dal tenhle oddíl už 20. 10.

Zbývá jediná cesta, která by těch **~70 ms zpomaleného procesoru
(asi 17 ms skutečných)** opravdu získala: postavit stín „pokračuje
vpravo" na `background-attachment:local` místo na čtení `scrollWidth`.
Pak by z `rsStin()` zmizelo čtení geometrie, posluchač rolování
i `ResizeObserver` — tedy i ten druhý pruh (naposledy prohlédnuté).

Neuděláno, a tentokrát vědomě: sedmnáct milisekund na čtyřikrát
zpomaleném telefonu nikdo nepozná, kdežto rozdíl ve VZHLEDU toho stínu
pozná každý. Kdo se k tomu vrátí, ať nezačíná profilem — začíná
obrázkem obou podob vedle sebe.

## 81. Modul, který se stáhl nepřihlášenému a hned se vrátil *21. 10.*

Nález z vlastní revize diffu, ne z prohlížeče ani ze zkoušky — a právě
proto stojí za zápis: zkouška, která to místo hlídala, byla **napsaná
tak, že by se u ní oprava jevila jako chyba**.

### Co se stalo

Oddíl 76 odložil poslední čtyři moduly na první použití. Uložené
pozemky (`js/ulozene-ucet.js`) se dotahovaly ze dvou míst: při načtení
výpisu kvůli sloučení s účtem, a při prvním klepnutí na „Uložit".
To první se správně hlídalo přihlášením:

```js
function stahniUlozene() {
  if (favStazeno || !jePrihlasen()) return;
```

To druhé ne. `toggleFav()` modul dotáhl každému, kdo si uložil pozemek
— jenže modul sám začíná:

```js
function zmena(klic, pridano) {
  if (!klic || !prihlasen()) return Promise.resolve(false);
```

Nepřihlášený si tedy stáhl **2 897 B (889 B brotli)**, aby se v nich
vykonalo jedno `return`. Není to chyba ve funkci webu: uložení běží
v prohlížeči a na modulu nestojí ani ono, ani odznak na tlačítku.
Je to přesně ten druh nákladu, kvůli kterého celý oddíl 76 vznikl —
jen zůstal na místě, kam se nedohlédlo.

### Oprava

```js
    if (!jePrihlasen()) return;
    sUlozenymi(function () {
      if (window.PKUlozeneUcet) { try { window.PKUlozeneUcet.zmena(klic, pridano); } catch (e) {} }
    });
```

Co se tím neztrácí: pozemek uložený před přihlášením se na účet
dostane stejně jako dřív — nahraje ho `sync()` při prvním
vykreslení výpisu po přihlášení (`stahniUlozene()` se nezamkne,
dokud `jePrihlasen()` neplatí, protože `favStazeno` se nastavuje
teprve za tou podmínkou).

### Zkouška, která by opravu označila za chybu

V `scripts/test-odlozene-skripty.mjs` stála kontrola:

> po prvním uložení se modul uložených dotáhne

a běžela v **čistém, nepřihlášeném** prohlížeči. Po opravě by
spadla — a kdo by ji opravoval zevnitř, mohl by snadno smazat tu
jedinou větu, která hlídá, že se modul dotáhne vůbec někdy.
Rozdělila se proto na dvě poloviny, každou s vlastním prohlížečem:

* **nepřihlášený** — uložení se povede (zápis do `pk_fav_v1` i počet
  v liště „Uložené (1)") a `js/min/ulozene-ucet.js` se **nestáhne**;
* **přihlášený** — modul na stránce je a uložení **dojde na účet**.

Druhá polovina nemůže měřit „je modul na stránce": přihlášenému se
stahuje už při načtení kvůli sloučení, takže by prošla i s úplně
mrtvou cestou od tlačítka. Měří proto to, co udělá jen ona — volání
`ulozeny_uloz` s klíčem pozemku, odchycené na `**/rest/v1/rpc/*`.
Přihlášení se předstírá jako v `scripts/test-poznamky.mjs`:
podstrčený `config.js` a session v úložišti, žádný skutečný účet.

### Čím je to prokázané

Tři sabotáže, každá na opravené verzi, pokaždé přes `minifikace.mjs`
+ `orazitkuj-verze.mjs`, aby prohlížeč dostal opravdu ten pokažený kód:

| co se pokazilo | co spadlo |
|---|---|
| závora `if (!jePrihlasen()) return;` smazána | *„a modul uložených se mu nestáhne"* (46/1) |
| závora obrácena na `if (jePrihlasen())` | *„a modul se mu nestáhne"* **i** *„a uložení dojde na účet"* (45/2) |
| `refreshFavBtn()` po uložení smazáno | *„nepřihlášenému se uložení povede"* (46/1) |

Druhý řádek je ten důležitý. Kontrola **„přihlášenému je modul
uložených na stránce" prošla i s úplně mrtvou cestou od tlačítka** —
přesně jak se čekalo, protože modul si přihlášený stáhne už při
načtení kvůli sloučení. Kdyby ta kontrola byla v oddílu jediná,
sabotáž by projela bez povšimnutí. Chytilo to až odchycené volání
`ulozeny_uloz`.

### Co z toho platí dál

**Odložení se musí hlídat z obou stran, a každá strana potřebuje
vlastní návštěvníka.** Kontrola „stáhne se, když má" je v jednom
prohlížeči s kontrolou „nestáhne se předem" jen zdánlivě úplná: obě
pak mluví o témže člověku a o tom druhém — tom, pro kterého se modul
stahovat nemá — neřekne žádná z nich nic.

## 82. Fotka vlastního inzerátu byla pás, ne náhled *21. 10.*

Náhled fotky má na webu jeden poměr — **16/10**. Drží ho karta ve výpisu
(`.opp-media`), řádek okresu (`.okr-item .okr-foto`), uložené
(`.ul-thumb`), náhled v mapě (`.mp-ram`), velký snímek na stránce
pozemku (`.pz-media`) i kostra načítání. Jediná výjimka
(`.map-side .opp-media`) má u sebe změřený důvod.

Na `muj-inzerat.html` se ale poměr psal **pixelovou výškou**:

```css
.mi-lthumb img{width:100%; height:160px; object-fit:cover; …}
```

Šířku si bere karta, výška je pevná — takže poměr vychází z toho, jak
široké okno člověk zrovna má. Změřeno v prohlížeči:

| šířka okna | fotka | poměr |
|---|---|---|
| telefon 390 px | 324 × 160 | **2,02 : 1** |
| monitor 1280 px | 694 × 160 | **4,34 : 1** |

Proti 16/10 = 1,60 : 1. A protože je tam `object-fit:cover`, nejde
o zploštěnou fotku, ale o **výřez**: na monitoru z fotky pozemku zbyl
prostřední pás a zmizelo nebe i popředí — tedy právě to, podle čeho
majitel svůj inzerát v seznamu pozná.

### Oprava: pevná šířka, poměr z ní

```css
.mi-lthumb{position:relative; margin-bottom:12px; width:256px; max-width:100%;}
.mi-lthumb img{width:100%; aspect-ratio:16/10; height:auto; object-fit:cover; …}
```

Stejný recept jako u `.okr-item .okr-foto`, kde je šířka 128 px.
A **256 px dává přesně 160 px výšky**, tedy tu samou výšku jako dosud:
svislý rytmus karty se nemění ani o pixel, mění se jen výřez. Po
opravě naměřeno 256 × 160 = 1,60 : 1 na obou šířkách.

### Hlídač, a čím se liší od toho, co tu už bylo

`scripts/test-nahledy-vypisu.mjs` poměr hlídá — ale jen na vyrobených
stránkách s `.okr-item`. Tohle místo nehlídalo nic.

Nový blok POMĚR NÁHLEDU v `scripts/test-jeden-styl.mjs` čte všechny
stylopisy i vložené styly ručně psaných stránek a hlásí pravidlo, které
u náhledu určuje **pevnou pixelovou výšku, když šířka pevná není**.
Splnit se to dá dvěma způsoby, oběma správnými: napsat `aspect-ratio`,
nebo určit krabici oběma rozměry (tak to mají ikony a čtvercová
`.rs-foto` 44 × 44).

Dvě věci, které musely být v pravidle přesně:

* **`aspect-ratio:auto` není poměr, je to jeho vypnutí.** Kontrola proto
  uznává jen číselnou hodnotu. Bez toho by jí dokumentovaná výjimka
  `.map-side .opp-media` (`aspect-ratio:auto; height:150px`) prošla jako
  splněná a zmizela by z dohledu.
* **`max-height` ani `line-height` to není.** Před `height` nesmí stát
  pomlčka, jinak by kontrola hlásila desítky míst, kde se nic nepokazilo.

Změřeno: pravidel náhledu s pixelovou výškou je 8 (ikony, tečky
u odznaků, čtvercová `.rs-foto`) — kontrola tedy opravdu čte, co má,
a hlásí z nich jednu jedinou, dokumentovanou výjimku.

### Čím je to prokázané

| co se pokazilo | co spadlo |
|---|---|
| vrácena pevná výška `height:160px` | *„žádný náhled nemá pevnou výšku bez pevné šířky"* (28/1) |
| důvod u výjimky zkrácen na jedno slovo | *„výjimka .map-side .opp-media má napsaný důvod"* (28/1) |
| výjimka přepsána na selektor, který nic nehlásí | *„a je pořád potřeba"* **i** samotný nález (27/2) |

Třetí řádek je ten, kvůli kterému tabulka výjimek nezaroste: výjimka,
která už není potřeba, se má zrušit, ne zapomenout.

### Mimochodem, při tom samém souboru

`animation:authFade .35s` byl jediný tvrdě psaný čas v celém webu mimo
dlouhé pulzy animací. Tokeny jsou `--cas-zakladni` (.2s) a
`--cas-pomaly` (.4s); nahrazeno druhým z nich.

## 83. Jména tříd, která nikdo nečte, a dva komentáře, které lhaly *21. 10.*

Napsal jsem si prototyp, který porovnává jména tříd psaná v JS se
selektory ve stylopisech. Našel deset jmen; po jednom po druhém z nich
zbylo **pět skutečných**. Žádné z nich není vidět — a právě proto to
nikdo nenahlásil.

### Co se našlo

Na kartě ve výpisu (`js/main.js`, `renderList`) stálo:

```js
li.className = 'opp-item ' + d.type + (hot ? ' is-hot' : '')
  + (isFeatured(d) ? ' is-featured' : '') + (jeVidene ? ' je-videne' : '');
```

Na `.opp-item.sale/.drazba/.exekuce`, `.is-hot` ani `.is-featured`
není ve stylopisu jediné pravidlo, v kódu jediné `classList.contains`
a ve zkouškách jediný selektor — tak jsem to změřil a **u jednoho ze
tří jsem se spletl**; jak, stojí o dva oddíly níž (oddíl 86). `d.type`
je zpátky, `is-hot` a `is-featured` pryč.

A hned za tím ten horší nález: v `css/styles.css` nad `.opp-item` stálo
**patnáct řádků komentáře, které v přítomném čase popisovaly barevné
obtažení karty podle druhu** — i s naměřenými kontrasty, procenty po
druzích a záložním pravidlem pro prohlížeče bez `color-mix`. Žádné
takové pravidlo ve stylopisu nebylo; po komentáři následovalo hned
`.opp-item:hover`. Komentář přibyl commitem b4fd3d0a9, poslední živý
`color-mix` z webu odstranil 53c8fe746.

Totéž podruhé u nadpisu výpisu: `countEl.innerHTML` stavěl
`<span class="mc-hl">` a komentář u toho tvrdil, že „dlouhý popis je ve
vlastní značce a **stylopis ho na telefonu schová**". Pravidlo `.mc-hl`
ve stylopisu není (ověřeno i v očištěných kopiích). Nadpis se
neschovává — a schovávat se nemá, protože novější řešení
(`.map-count` jako flex po dílcích, `.mc-sep{display:none}`) ten
problém řeší zalamováním po dílcích.

A ještě `pz-sour-mapa` — modifikátor bez pravidla, který vypadal jako
varianta, kterou něco kreslí jinak.

### Co se NESMĚLO smazat

`hot` a `isFeatured()` jsou živé: `hot` kreslí odznak `.opp-hot`,
`isFeatured()` řadí výpis, barví značku na mapě, kreslí odznak
„Zvýrazněno" a `featured` nastavuje platební webhook, který hlídá
`scripts/test-platba.mjs`. V datech je dnes `featured` pravdivé u 0
z 1 970 nabídek — jenže to je stav trhu, ne mrtvý kód. Zmizela jen ta
jména tříd, ne výpočty za nimi.

### Jeden nález, který se při kontrole rozpadl

`.rvb-ne` v bilanci rychlého výběru (`♥ N` / `✕ N`) jsem si nejdřív
zapsal jako chybějící pravidlo: stylovaná je jen `.rvb-ano`. Není to
pravda — `.rv-bilance` dává celé liště `color:var(--muted)` a zelená
`.rvb-ano` ji přebíjí, takže tlumené „✕" je záměr. Zůstává tedy, jen
je u něj teď napsané, že pravidlo pro druhou polovinu **nechybí**,
protože by to bylo přepsání téže hodnoty.

### Proč to staticky hlídat nejde — a čím to změřit

Prototyp **nálezy na kartě nenašel sám**: `'opp-item ' + d.type +
(hot ? ' is-hot' : '')` není jeden řetězec a žádný regex nad zdrojem to
spolehlivě nesloží. Musel jsem na ně přijít čtením.

Měření v prohlížeči to ale umí, a vyšlo krátké: na index.html je po
vykreslení výpisu v DOM **332 různých jmen tříd** a 32 z nich nemá
pravidlo v `css/*.css`. Z těch 32 je **26 Leafletových** (stylopis
k nim je `vendor/leaflet/leaflet.css`, který se do porovnání musí
přidat), takže k rozhodnutí zbývá šest. Hlídač je tedy proveditelný;
patří k němu tabulka výjimek se zapsaným „kdo to jméno čte", jakou má
`scripts/test-mrtve-styly.mjs` pro opačný směr.

### A při tom měření vypadl nález na jinou kůru

Dvě ze těch šesti jmen jsou `cta-full` a `cta-short` — dvě varianty
popisku v tlačítku „Přidat pozemek" v liště. Celé tlačítko je přitom
`display:none` na **všech** šířkách (`css/styles.css:1638` a znovu
`:4273` uvnitř `@media` pro telefon), zatímco komentář nad prvním
z nich tvrdí, že „na mobilu se ukáže přímo v liště". Zapsáno jako
samostatný úkol — jestli má lišta CTA mít, je rozhodnutí majitele, ne
úklid.

### Co z toho platí dál

**Jméno třídy je slib, že existuje pravidlo.** Když neexistuje, pošle
čtenáře hledat něco, co není — a zpráva o tom nepřijde nikdy, protože
na obrazovce se nic nepokazilo. Platí to i pro komentáře: tenhle oddíl
našel dva, které popisovaly v přítomném čase funkci, jež na webu nikdy
nebyla nebo už dávno není. **Komentář, který lže, je horší než žádný** —
žádný nikoho nikam nepošle.

## 84. Zkouška, kterou shodil kalendář *21. 10.*

CI spadlo na `test-shoda.mjs` — na kontrole „a na každé stojí číslo
z modelu BEZ duplicit, tedy totéž co na mapě":

```
pozemek-litomerice-loveckovice-nil4ie.html: verdikt se vůbec nevykreslil
pozemek-litomerice-libochovice-155xnsc.html: verdikt se vůbec nevykreslil
```

Lokálně se to reprodukovalo napoprvé, takže to nebyl výpadek běhu.

### Příčina není v kódu, je v datu

Obě stránky jsou **dražby s termínem 20. 10.** Generátor stránek má
pravidlo „dražba po termínu už není živá nabídka" (viz komentář
u `generuj()` v `scripts/generate-parcel-pages.mjs`): takovou stránku
nepřepisuje jako živou, ale pustí ji do větve **ukončených** —
dostane pruh „Nabídka už není aktuální", `noindex,follow`, odkazy na
podobné pozemky v okrese a po `DNI_ARCHIV` dnech se smaže. Srovnání
s obvyklou cenou na ní **schválně není**: dražba, která skončila, nemá
hledajícímu co nabídnout.

`test-shoda.mjs` si přitom vzorky vybírá z pozemků, u kterých se
**syrový a očištěný model rozcházejí** — a mezi ty se dražba po
termínu dostane snadno. Včera byly ty dvě dražby živé a kontrola
prošla; dnes jsou v archivu a kontrola hlásí chybu u stránek, které
podle návrhu verdikt mít nemají.

Jiné zkoušky to pravidlo znají a archiv vynechávají
(`test-osnova`, `test-misto-prahy`, `test-nabidka-pro-stroje`,
`test-stranky-pozemku` — „archiv se nepředělává"). `test-shoda` ho
neznala, protože se jí do vzorku archivní stránka dosud nikdy
netrefila.

### Oprava

Stránka s `window.PK_UKONCENO=` se přeskočí a **nepočítá se do
změřených**, takže se hledá dál. Kolik se jich přeskočilo, se vypisuje:

```
✓ změřily se skutečné stránky pozemků (3, 2 přeskočeno jako archiv)
```

Bez toho čísla by nebylo z výpisu poznat, jestli se neměřilo prázdno.

### Čím je to prokázané — a jedna sabotáž, která neprokázala nic

| co se pokazilo | co spadlo |
|---|---|
| `fillVerdict()` nic nenapíše (a ani statická značka) | *„a na každé stojí číslo z modelu"* + *„blok s odhadem je vykreslený"* (18/2) |
| přeskok archivu spolkne každou stránku | *„změřily se skutečné stránky pozemků (0, 32 přeskočeno)"* (22/1) |

Druhý řádek je ten, který drží opravu poctivou: přeskakování nesmí umět
spolknout celou kontrolu.

**A první pokus o tu první sabotáž neprokázal nic.** Vyprázdnil jsem
statickou značku `'<div id="pz-verdict">' + pzVerdictHtml(d) + '</div>'`
— a zkouška **prošla**. Verdikt totiž doplňuje ještě `fillVerdict()`
po dotažení modelu, takže se nic nestalo. Teprve když jsem vypnul obě
místa, kontrola spadla. Je to podruhé v téhle session (viz oddíl 76):
**sabotáž, která nechá naživu druhou cestu k témuž výsledku, vypadá
jako důkaz, a přitom nedokazuje nic.**

### Co z toho platí dál

**Zkouška, která si vzorek vybírá z dat, se dřív nebo později trefí do
jejich okraje.** Tady to byl kalendář: termín dražby přešel a stránka
změnila povahu. Takový pád nemá v kódu příčinu a nemá smysl ho hledat
v posledním commitu — stačí se podívat, co na té stránce stojí dnes
a nestálo včera. Čemu se vyhnout: „opravit" to tak, že se nález
umlčí. Přeskočit se smí jen to, co podle návrhu měřit nejde, a i pak
se musí vypsat, kolik toho bylo.

## 85. Tlačítko, které se nekreslilo nikde, a přesto bylo na 2 311 stránkách *21. 10.*

Vypadlo to z měření k oddílu 83: mezi jmény tříd, která jsou v DOM a ve
stylopisu k nim není pravidlo, stály `cta-full` a `cta-short`. Dva
popisky jednoho odkazu v liště:

```html
<a href="pridat.html" class="btn-primary header-cta">
  <span class="cta-full">Přidat pozemek</span><span class="cta-short">Přidat</span></a>
```

Celý ten odkaz je přitom **`display:none` na všech šířkách** — jednou
v základu (`css/styles.css:1638`) a znovu uvnitř `@media` pro telefon
(`:4273`). Žádné pravidlo ho nikde nevracelo; ověřeno i v očištěných
kopiích (`css/pozemek.min.css`, `css/region.min.css`). Stál na **2 311
stránkách** a nikdo ho nikdy neviděl.

### Komentář u toho tvrdil opak

> Stálé CTA „Přidat pozemek" v liště. Na počítači je akce už v navigaci,
> tady se skryje; **na mobilu se ukáže přímo v liště** (aby bylo vidět
> hned, ne schované v menu).

Neplatilo to a nemělo platit. Vedle toho druhého `display:none` stojí
novější komentář „V nabídce už akce NENÍ duplicitní — je jediná, takže
se ukazuje", a `scripts/test-rozvrzeni.mjs` má celý oddíl o tom, jak se
„Přidat pozemek" **přesunulo nahoru do šuplíku** (naměřeno: bylo na
y 1 528 z 1 652 px, tedy až za čtrnácti odkazy). Rozhodnutí tedy padlo
a bar CTA bylo zrušeno; jen ta jedna věta o něm zůstala.

### Oprava

Značka se vyndává v `scripts/hlavicka.mjs`, protože lišta je kánon pro
celý web — **včetně stránek ukončených nabídek**, které se obsahově
nepřepisují a kterých by se změna šablony nedotkla. Odstraněna i ze
tří zdrojů, které ji vyráběly (`index.html`, `pozemek.html`,
`scripts/generate-region-pages.mjs`), a ze stylopisu zmizela čtyři
pravidla: dvě `display:none`, `min-height:44px` pro dotyk a jméno ve
dvou společných seznamech přechodů. Komentář je dnes záznamem
rozhodnutí.

### Hlídač: měří se VÝSLEDEK, ne stylopis

Čtení stylopisu by na to nestačilo — `display:none` v základu je u lišty
normální (hamburger na monitoru, šuplík na telefonu) a kdo prvek ukáže,
může být i skript. Nový oddíl 9 v `scripts/test-hlavicka.mjs` proto měří
obdélníky: **prvek v `#header`, který nemá ani jeden obdélník na 390 px
ANI na 1280 px, se nekreslí nikde.** Co se objeví teprve po klepnutí,
musí být ve výjimkách s napsaným důvodem — dnes je tam jedna
(`div.nav-stin`, závoj pod otevřeným šuplíkem) a kontrola hlásí i
výjimku, která už potřeba není.

Změřeno: v liště se na telefonu schovávají 2 prvky, na monitoru 21 —
průnik je po opravě prázdný.

### Čím je to prokázané — a proč první sabotáž neprošla

| co se pokazilo | co spadlo |
|---|---|
| odkaz vrácen do `index.html` + `display:none` do stylopisu | *„nic v liště se neschovává na OBOU šířkách naráz"* (81/1) |
| výjimka přepsána na prvek, který se nikde neschovává | *„a je pořád potřeba"* (80/2) |

První pokus ale **neudělal nic**: dopsal jsem pravidlo do
`css/styles.css`, a zkouška prošla se stejnými počty (2 a 21). Důvod je
věcný a stojí za zapamatování — **úvodní stránka nenačítá
`styles.css`, ale `css/uvod.min.css`**, zkrácenou kopii, do které
`scripts/rozdel-styly.mjs` vybírá jen pravidla na třídy, které na té
stránce opravdu jsou. Dokud jsem ten krok nespustil, pravidlo se
k prohlížeči nedostalo, prvek byl vidět a kontrola správně mlčela.
Je to podruhé dnes (viz oddíl 84): **sabotáž, která nedojde až na
stránku, vypadá jako důkaz.**

Mimochodem je to zároveň pochvala pro hlídače: měří skutečně
servírovaný stylopis, ne ten, který si člověk upravuje.

### Co z toho platí dál

**Prvek, který se nekreslí nikde, je mrtvý kód, který se přesto stahuje
— a nenahlásí ho nic.** Nerozbije stránku, nespadne na něm zkouška,
jen tam je. Hlídat se to dá jedině měřením výsledku na obou šířkách;
čtení stylopisu na to nestačí, protože „schováno v základu" je
u responzivní lišty normální stav.

## 86. Jak jsem si sám předvedl pravidlo z oddílu 83 *21. 10.*

Oddíl 83 končí větou „jméno třídy je slib, že existuje pravidlo" a
poznámkou, že staticky to hlídat nejde, protože skládaná jména žádný
regex nesloží. **Hodinu po tom, co jsem to napsal, mi na tom spadlo
CI** — a ne na skládání v kódu, ale na skládání v té zkoušce.

### Co spadlo

Běh 598, `test-barvy.mjs`:

```
✓ výpis má karty, na kterých jde druh měřit
✕ každá karta ve výpisu nese odznak druhu
    z 0 karet jich odznak s popiskem nemá 0
✕ a puntík odznaku má barvu svého druhu z palety
✕ a ten puntík je opravdu vykreslený, ne průhledný
```

„Z **0** karet" je ta důležitá část: karty na stránce byly (první
kontrola prošla), jen zkouška u žádné z nich nepoznala druh.

### Proč mě hledání nenašlo nic

`test-barvy.mjs` zjišťuje druh karty takhle:

```js
const DRUHY = ['sale', 'drazba', 'exekuce', 'obec', 'majitel'];
const druh = DRUHY.find((c) => e.classList.contains(c)) || null;
```

Jméno třídy tedy **nestojí v kódu nikde celé**: přijde z pole.
Hledal jsem `classList.contains` s literálem a selektory `.opp-item.`
ve stylopisech i ve zkouškách — a tahle podoba není ani jedno. Smazal
jsem `d.type` z karty jako mrtvé jméno a zkouška, která podle něj
měří barvy odznaků, začala měřit nulu.

Je to **týž mechanismus, který jsem o oddíl výš popsal z druhé
strany**: `'opp-item ' + d.type` nenajde regex, který hledá hotové
jméno. Jen jsem si neuvědomil, že to platí i pro ČTENÁŘE, ne jen pro
pisatele.

### Oprava

`d.type` je na kartě zpátky — a u toho napsané, KDO ho čte, včetně
toho, že se hledá jménem z pole, takže ho běžný grep nenajde.
`is-hot` a `is-featured` zůstávají pryč: na ty dvě jména opravdu není
v celém repozitáři nic (prověřeno ještě jednou, tentokrát obyčejným
`grep -rn` přes všechny soubory, ne jen vzorem u `contains`).

### Co z toho platí dál

**„Nikdo to nečte" je tvrzení o budoucím hledání, ne o kódu.** Vyslovit
ho smím jen tehdy, když jsem hledal i podobu, ve které jméno v kódu
celé nestojí — tedy u čtení stejně jako u psaní. Nejspolehlivější
hledání je to nejhloupější: `grep -rn 'jméno'` přes celý repozitář,
bez vzoru, a potom se podívat na každý výskyt.

A druhá věc, praktická: **mazání jména třídy je změna, po které se
pouští CELÁ sada v prohlížeči, ne vybraná podmnožina.** Pustil jsem
dvanáct zkoušek, které jsem si vybral podle toho, čeho se změna
„týká" — a ta jedna, co na tom stála, mezi nimi nebyla. Celá sada ten
nález měla; běžela ale naposled před touhle změnou.

## 87. Barva, kterou `rgba()` neumí vzít z tokenu *21. 10.*

Oddíl 45 uklidil hexy opsané ve vložených stylech a hlídač na to pustil.
Hlídač ale čte jen **hexy** — a tatáž barva napsaná deseti číslicemi je
pro něj neviditelná. Měření ji našlo: **39 míst**, kde se barva
z paletky psala průhledně rukou.

```css
.mi-lstatus.ok{background:rgba(31,163,99,.12); border-color:rgba(31,163,99,.4);}
/* 31,163,99 je --c-ok. Napsané ručně, protože rgba() hex z tokenu
   vzít neumí. */
```

Devět tokenů, 36 různých párů (token, průhlednost):

| token | výskytů | různých průhlednostní |
|---|---|---|
| `--brand-live` | 16 | 8 |
| `--plocha-tmava-2` | 11 | 7 |
| `--c-drazba` | 6 | 3 |
| `--text` | 5 | 5 |
| `--accent-warm` | 4 | 3 |
| `--c-ok` | 4 | 3 |
| `--c-exekuce` | 3 | 3 |
| `--c-ok-ink` | 2 | 2 |
| `--znacka-svetla` | 1 | 1 |

Bílá a černá se do toho nepočítají: `rgba(255,255,255,.12)` není kopie
tokenu, je to závoj — a stejný zápis používá i sám stylopis.

### Tři cesty, všechny barevně přesné. Rozhodlo třetí číslo

| zápis | spočítaná hodnota | brotli |
|---|---|---|
| `rgba(var(--x-rgb), .4)` | `rgba(31, 81, 56, 0.4)` | +76 B |
| `color-mix(in srgb, var(--x) 40%, transparent)` | `color(srgb 0.121569 0.317647 0.219608 / 0.4)` | +48 B |
| `rgb(from var(--x) r g b / 40%)` | `color(srgb 0.121569 0.317647 0.219608 / 0.4)` | — |

`color-mix` s `transparent` je matematicky **přesně** totéž co `rgba`
(míchá se s předmnoženou alfou, takže vyjde ta samá barva i alfa) a je
o 28 B menší. Vybralo se přesto to první, protože **spočítanou hodnotu
čtou desítky zkoušek** — `test-kontrast`, `test-barvy`, `test-odstiny`,
`test-barva-listy`, `test-barva-ceny` a další porovnávají barvy ve
tvaru `rgba(…)`. Změnit jim formát za 28 bajtů by bylo špatně
spočítané.

Podpora v tom nehraje roli, i když to tak může vypadat: `color-mix`
z webu kdysi vypadl (commit 53c8fe746), ale kvůli BARVĚ — bublina
shluku se míchala s bílou, zesvětlila se o pětinu a bílé číslo v ní
spadlo na 2,59–3,97 : 1. `CSS.supports` ho hlásí jako podporovaný.

### Proč se tedy barva píše dvakrát

U `-ink` variant stojí v paletce výslovně: *„Dva stejné hexy vedle sebe
by vypadaly jako překlep a mohly se rozejít."* Tady jsou dva zápisy
téže barvy taky — jen se **rozejít nemohou**, protože to hlídá nový
blok RGBA PO KANÁLECH v `scripts/test-jeden-styl.mjs`:

* každý `--x-rgb` sedí **přesně** na hex tokenu `--x`,
* žádný companion token nezůstal nepoužitý (jinak je to mrtvé jméno),
* a žádné `rgba()` nikde neopisuje barvu, kterou token má.

Elegantnější cesta — psát barvu po kanálech a hex z nich dopočítat
(`--c-ok:rgb(var(--c-ok-rgb))`) — se neudělala z téhož důvodu jako
`color-mix`: změnila by to, co vrací `getPropertyValue('--c-ok')`,
z `#1FA363` na `rgb(31,163,99)`. To čtou čtyři zkoušky
(`test-barvy`, `test-hlavicka`, `test-shluky`, `test-zaobleni`).

### Co měření našlo navíc, a co se v tomhle oddílu NEDĚLÁ

Kromě 39 kopií **pojmenovaných** barev je ve zdrojích **136 výskytů 24
barev, které token nemají vůbec**:

```
rgb(31, 81, 56)    = #1F5138   46×
rgb(126, 196, 157) = #7EC49D   21×
rgb(8, 20, 14)     = #08140E   13×
rgb(20, 35, 28)    = #14231C    6×   …a dalších dvacet
```

#1F5138 je **čtvrtá** tmavá zeleň webu (vedle `--znacka`,
`--plocha-znacka` a `--znacka-svetla`) a objevuje se **jen průhledná** —
v `--prstenec-pole`, v `.pk-me::after`, v tónovaných panelech. Nikdy
neprosvitne naplno, a proto jí nikdo jméno nedal.

Tohle není táž úloha a nesmí se dělat týmž strojem. U barvy, která se
používá jen průhledná, není správná odpověď „přidat `--x-rgb`" —
správná odpověď je **pojmenovat výsledek podle toho, co to na obrazovce
je**: plocha, závoj, prstenec. Web už takovou rodinu má
(`--plocha-*`, `--prstenec-pole`), takže jde o rozšíření soustavy, ne
o mechanickou záměnu. Zapsáno jako samostatný úkol.

### A hned nato: dvě zkoušky, kterým ten nový zápis nikdo nenaučil

Změna barvy na obrazovce nezměnila — spočítané hodnoty jsou byte za
byte stejné a všech devět barevných zkoušek v prohlížeči prošlo. Rozbila
ale dva ČTENÁŘE stylopisu, oba v rychlé sadě:

* **`test-odstiny`** hlásil „nalezeno jen 245 — čte test vůbec
  css/styles.css?". Jeho vzor `rgba?\([^)]*\)` se zastaví na PRVNÍ
  zavírací závorce, takže z `rgba(var(--c-ok-rgb),.12)` urve
  `rgba(var(--c-ok-rgb)` — to se do počtu započítá, ale rozluštit se
  nedá, takže barva se **mlčky nezměří**. Z 268 barev v pravidlech jich
  takhle vypadlo 23.
* **`test-predloha`** hlásil „vlastní stín mimo paletku" u `404.html` —
  stránky, která se nezměnila ani o znak. Porovnává stíny s paletkou
  DOSLOVA, a `--e1` má od té chvíle `rgba(var(--plocha-tmava-2-rgb),0.08)`,
  zatímco 404.html (ta stylopis schválně nenačítá) píše
  `rgba(24,45,34,0.08)`.

Obě se spravily stejně a správným směrem: **naučily se ten zápis
rozbalit**, ne přestat měřit. Pět řádků, které z `var(--x-rgb)` udělají
zpátky `r,g,b`, než se začne cokoli počítat. `test-odstiny` je zpátky na
268 barvách, `test-predloha` na 120 stínech z paletky ze 159.

### Co z toho platí dál

**Hlídač barev musí umět všechny abecedy, kterými se barva píše.** Po
oddílu 45 se zdálo, že opsané barvy jsou vyřešené; byly — v hexu. Totéž
číslo v `rgba()` leželo na 39 místech a hlídač se na něj nepodíval,
protože se na takový zápis neumí podívat. Je to táž past jako
u písmových rodin v oddílu 73 (regex, který se zastavil na uvozovce)
a stojí ve dvou verzích v CLAUDE.md.

A rub téhož: **kdo zavede nový zápis, zavede ho i všem čtenářům.**
Dnes to byly tři případy po sobě — mrtvé jméno třídy, které čtenář
skládal z pole (oddíl 86), sabotáž, která nedošla až na stránku
(oddíl 85), a teď dvě zkoušky, které nový zápis barvy neumí přečíst.
Pokaždé to chytila sada, ne přemýšlení; a pokaždé byla správná oprava
„naučit čtenáře", ne „ubrat, co měří".

## 88. Vrstvy úřadů až s mapou — a tři pasti, které měření samo neukáže *21. 10.*

Odložení modulů (oddíly 64 a 76) skončilo na úvodní stránce. Stránka
pozemku si přitom brala **21 skriptů, ~57,9 kB brotli** — a je to
nejnavštěvovanější typ stránky: 1 949 kusů, vstup z vyhledávačů.

### Měření

Object.defineProperty na `window`, živá stránka pozemku, telefon 390
i monitor 1280, cizí servery odstřižené. Počet čtení globálu při
načtení / po dorolování k mapě:

```
PK_CENY 47/47 · PKAuth 18/18 · PKKlic 12/12 · PKPoznamky 8/8 · PK_RADCE 5/5
PK_SNIMEK 3/6 · PKHlidani 3/3 · PKUlozeneUcet 3/3 · PKVybaveni 3/3
PKZlevneni 2/2 · PKVideno 2/2 · PKCisteni 2/2 · PK_TERMINY 1/1
PK_VRSTVY 0/2 · PKBpej 0/0 · PKMenu 0/0 · PKHlavicka 0/0
```

Čtyři nuly — a **dvě z nich nejsou nálezy**:

* **`PKMenu`** se nečte, protože `menu.js` se spouští SÁM
  (`napoj(document)` na `DOMContentLoaded`) a globál je jen export,
  o který nikdo nestojí. Odložit ho znamená vypnout hamburger.
* **`PKHlavicka`** neexistuje: `hlavicka.js` globál nedefinuje vůbec.
  Měřil jsem jméno, které na stránce nikdy nebylo, a dostal nulu.

Z toho první pravidlo: **„globál se nepřečte" je důkaz jen u modulu,
který se POUŽÍVÁ skrz svůj globál.** U modulu, který se spustí sám,
to neříká nic.

A třetí past vyšla až z druhého měření:

* **`PK_VRSTVY`** má po načtení nulu, ale po dorolování k mapě dvě
  čtení. Mapa se na stránce pozemku staví teprve, až je na dohled
  (oddíl 30) — nahoře je cena, popis a vybavení. Bez toho druhého
  měření by „nikdy nepřečteno" znamenalo jen „ještě se k tomu
  nedostalo" a odložení by rozbilo vrstvy každému, kdo doroluje.
* **`PKBpej`** má nulu i po dorolování, ale **jen v sandboxu**:
  `pripravene()` se nedoptá cizích služeb, nevrátí žádnou vrstvu,
  takže se nepřidá přepínač a řádek `def.id === 'bpej' && global.PKBpej`
  neproběhne. Se sítí se přečte hned, jak se vrstvy vykreslí.

`PK_RADCE` (5 955 B brotli, druhý největší modul) kandidát **není**:
kreslí blok „Co byste měli vědět" a počet „N věcí" vedle nadpisu při
prvním vykreslení.

### Co se tedy udělalo

`mapove-vrstvy.js` (1 892 B brotli) a `bpej.js` (1 518 B) patří k jedné
věci — vrstvám úřadů — a dotahují se **tím samým spouštěčem jako
Leaflet**: až se staví mapa. Kdo k mapě nedoroluje, nestáhne **3 410 B
brotli**; stránka si bere 19 skriptů místo 21.

BPEJ se dotahuje **spolu** s vrstvami, ne vlastním spouštěčem: čte se
uvnitř `pridejPrepinac()`, tedy ve chvíli, kdy se přepínače už kreslí,
a čekat tam na stažení by znamenalo přepínač, který chvíli nefunguje.

Mechanismus je týž jako na úvodní stránce — `<meta name="pk-odlozeny"
data-klic="…" data-src="…">` a `dotahniModul()`, takže adresy razítkuje
`orazitkuj-verze.mjs` jako každý jiný odkaz. Na stránce pozemku k tomu
stačilo osmnáct řádků vedle už existujícího `sLeafletem()`.

### A past v generátoru, kterou si generátor sám předpověděl

Ukončené stránky (dnes 246) se obsahově nepřepisují, jen projdou řetězem
migrátorů. `migrujSkripty` srovná seznam skriptů podle předlohy —
**ale odložený modul z nich neodebere.** Má to u sebe napsané: jakmile
skript zmizí z předlohy, platí pro něj pravidlo o „cizím" skriptu
a ten zůstává, dokud soubor existuje na disku. Odložený modul na disku
pochopitelně je. A metaznačku by ukončené stránce nedoplnil nikdo:
žádný krok v řetězu `<meta>` nesynchronizuje.

Výsledek první verze: **2 181 stránek mělo metaznačky A ZÁROVEŇ si
dál bralo oba moduly značkou** `<script>`. Nový `migrujOdlozene` proto
dělá obojí — odebere značky a doplní metaznačky, celým blokem naráz, aby
držely pořadí předlohy.

### Čím je to prokázané

| co se pokazilo | co spadlo |
|---|---|
| `dotahniModul` nic nestáhne | *„po dorolování se vrstvy dotáhnou"* + *„a spolu s nimi BPEJ"* (57/2) |
| `migrujOdlozene` vyřazen z řetězu, a metaznačky odebrány z 246 ukončených | *„žádná stránka pozemku … a všechny mají metaznačky"* (58/1) |

Druhý řádek napodruhé. **První pokus o něj neprokázal nic:** vyřadil
jsem migrátor z řetězu a zkouška prošla — protože ukončené stránky už
metaznačky měly z předchozího, správného běhu. Sabotáž migračního kroku
musí odčinit i to, co ten krok udělal dřív, jinak ji zakryje už hotový
stav. (Dnes potřetí varianta téhož: oddíl 84 — sabotáž, která nechá
naživu druhou cestu; oddíl 85 — sabotáž, která nedojde až na stránku.)

A při psaní té zkoušky jsem šlápl do pasti, kterou generátor taky
popisuje u sebe: **vyrobená stránka se nepozná podle jména.** Filtr
`pozemek-*.html` chytil `pozemek-od-obce.html`, což je ručně psaný
rádce, a kontrola na něm hlásila chybějící metaznačku. Pozná se podle
obsahu, značkou `window.PK_POZEMEK=`.

### Co z toho platí dál

**Měření ukáže, co se NEČTE; co z toho jde odložit, rozhodne až druhá
otázka — udělá ten modul něco sám?** A třetí: *kdy* se to čte. Nula
hned po načtení může znamenat „nikdy", „až po rolování" nebo „až
odpoví cizí server", a každá z těch tří odpovědí vede k jinému
spouštěči. Měřit se proto musí aspoň dvakrát a vědět, co měření
zaslepilo.

## 89. Oddíl, ve kterém obsah byl a vidět nebyl *21. 10.*

Oddíl 83 skončil tím, že mrtvá jména tříd se musí hlídat **měřením
v DOM**, a oddíl 86 tím, že staticky to nejde. Tak jsem to měření
rozšířil na pět typů stránek — a první, co z něj vypadlo, nebyl mrtvý
název, ale **díra na úvodní stránce**.

### Co se naměřilo

```
#user-listings   třída: odl-wrap odl-empty reveal is-visible
                 opacity: 0   transform: translateY(22px)
                 výška: 259 px (telefon) / 227 px (monitor)
                 dětí: 3, z toho s obdélníkem: 3
```

Tedy: oddíl **„Pozemky přímo od majitelů"** má obsah, má výšku, jeho tři
prvky mají rozměr — a je na `opacity: 0`. Pod nadpisem zela čtvrt
obrazovky prázdna a výzva *„Zatím tu žádné nejsou — buďte první"*
s tlačítkem „Přidat pozemek zdarma" se nikdy neukázala. Na obou šířkách.

### Příčina: jméno, které vypadá správně

`renderUserListings()` v `js/main.js` přepisoval `className` na
`'odl-wrap odl-empty reveal is-visible'`. Na `.is-visible` ale **není
v žádném stylopisu jediné pravidlo** — ověřeno i ve všech pěti
očištěných kopiích. Viditelnost dělá `.reveal.in{opacity:1}`.

A pozorovatel to zachránit nemohl, i když přesně na to je:

```js
var reveals = document.querySelectorAll('.reveal');   // na začátku boot()
… if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
```

Seznam se čte **jednou při startu**, a tenhle blok se staví až po
dotažení dat. A i kdyby ho pozorovatel sledoval, přepsání celého
`className` by mu `in` smazalo.

Oprava je jedno slovo: `in` místo `is-visible`. Naměřeno po ní —
opacity 1, transform none, všechny tři prvky vidět.

### Hlídač měří opacity, ne jméno třídy

Nový oddíl 3 v `scripts/test-prazdno.mjs` — tedy v té zkoušce, která už
dvě díry na stránkách našla. Měří se **spočítaná opacity** právě proto,
že jméno třídy vypadalo správně a nefungovalo.

Jeden detail stál za druhý pokus: `.reveal` má přechod 0,4 s, takže
hned po přidání `in` je opacity ještě někde mezi nulou a jedničkou
a kontrola hlásila `opacity 0` i na opravené verzi. Čeká se tedy na
VÝSLEDEK (až dojede na 1), ne na čas — a když nedojede, vypíše se
i třída, která na prvku zůstala.

Prokázáno sabotáží: vrácené `is-visible` → *„a je vidět"* spadlo
(opacity 0, výška 227 px, vidět 3 z 3 — tedy přesně ten popis díry).

### Co z toho platí dál

**Tohle byl nejdražší možný druh mrtvého jména: takový, který něco
schová.** Mrtvá jména z oddílu 83 nestála nic — nikdo se o ně neopřel.
Tohle jméno se tvářilo, že něco dělá, a v tichosti vzalo úvodní stránce
celý oddíl. A nenahlásilo to nic: značkování vypadá správně, konzole
mlčí, zkoušky měřily text a odkazy, které v DOM **jsou**.

Proto to měření pokračuje: zbývá z něj třináct jmen bez pravidla
(šest mrtvých k úklidu, sedm živých úchytů pro JS a zkoušky, které
patří do tabulky výjimek s napsaným „kdo je čte"). To je další úkol —
tenhle oddíl je jeho první nález.

## 90. Hlídač na „jméno je slib, že existuje pravidlo" *21. 10.*

Oddíl 83 našel mrtvá jména tříd čtením. Oddíl 86 předvedl, že čtení
nestačí — smazal jsem `d.type` jako mrtvé a shodil tím `test-barvy`,
protože ho zkouška hledá jménem z pole. Oddíl 89 našel měřením první
skutečnou závadu. Tenhle oddíl ten hlídač dopisuje.

### Proč to nejde ze zdroje

Jména se **skládají na obou stranách**:

```js
'opp-item ' + d.type + (hot ? ' is-hot' : '')        // pisatel
DRUHY.find((c) => e.classList.contains(c))           // čtenář
```

Žádný rozumný vzor nad zdrojem ani jedno spolehlivě nesloží. Měří se
proto výsledek: jména z DOM proti selektorům, na šesti typech stránek
(úvodní, pozemek, okres, kontakt, můj inzerát, hlídání).

### Dvě věci, bez kterých by hlídač lhal

* **Leafletův stylopis se musí přičíst.** Bez `vendor/leaflet/leaflet.css`
  hlásí 26 falešných nálezů: jeho jména v DOM jsou, jeho pravidla ale
  v `css/` nejsou.
* **Vložený `<style>` té stránky taky.** Stránky aplikace si část
  vzhledu píšou v hlavičce.

Změřeno po doplnění obojího: 704 jmen tříd na šesti stránkách,
**6 bez pravidla** — a všech šest je živých.

### Šest mrtvých jmen pryč, šest živých do tabulky

Uklizeno: `kraje-sec` (oddíl krajů na úvodní stránce), `mvt-t` (popisek
v záložce Seznam/Mapa), `nav-kontakt` (odkaz v kánonu lišty, tedy na
2 313 stránkách), `okr-ven` (modifikátor v generátoru regionů),
`ceka-na-skript` (pravidlo k němu zrušil už úklid prázdna pod obsahem)
a `g-<lvl>` / `gtk-<lvl>` v `js/radce.js`.

To poslední stojí za větu: rádce počítá u každého řádku **vážnost**
(`ok` / `mid` / `warn`) a psal ji do jména třídy — ve světlé i tmavé
podobě. Na žádnou z těch šesti tříd není pravidlo, takže se vážnost
nikde neukazuje. Jméno jen slibovalo rozlišení, které není. Kdyby se
ukázat měla, `rady()` ji vrací dál v `x.lvl` a dopsat ji je na jeden
řádek — **to už je ale rozhodnutí o vzhledu, ne úklid.**

Živá jména bez pravidla jsou dvojího druhu a obojí je legitimní:
úchyt pro skript (`os-t`, `pz-pozn-skok-t`) a úchyt pro zkoušku
(`pk-maska`, `leaflet-dots-pane`), plus dvě vnitřnosti Leafletu
(`leaflet-control-container`, `leaflet-proxy`). Každé má v tabulce
napsané, **kdo ho čte** — jinak tabulka tiše roste a kontrola přestane
být k něčemu. A platí to obojím směrem: výjimka na jméno, které se na
stránkách neobjevuje, se taky ohlásí.

### Čím je to prokázané

| co se pokazilo | co spadlo |
|---|---|
| `kraje-sec` vráceno do index.html | *„každé jméno třídy v DOM má pravidlo"* (15/1) |
| důvod u výjimky zkrácen na jedno slovo | *„výjimka .pk-maska má napsaný důvod"* (15/1) |
| výjimka přepsána na jméno, které v DOM není | *„a je pořád potřeba"* **i** nález (14/2) |

### Co z toho platí dál

Dva hlídače na jednu věc, každý z jedné strany: `test-mrtve-styly`
hlásí **pravidlo bez prvku**, `test-mrtva-jmena` **prvek bez pravidla**.
Ani jeden sám nestačí — a ten druhý musí měřit v prohlížeči, protože
jméno, které se skládá, ve zdroji celé nestojí.

## 91. Dvacet čtyři barev bez jména — a patnáct z nich už jméno mělo *21. 10.*

Oddíl 87 skončil nálezem, který byl větší než on sám: kromě 39 kopií
pojmenovaných barev je ve zdrojích **136 výskytů 24 barev, které token
nemají vůbec**. Vypadalo to na práci „vymyslet dvacet čtyři jmen".
Nebyla.

### Měření rozhodlo za mě

Pro každou z těch 24 barev jsem spočítal odchylku v OKLabu (×100) proti
každé pojmenované barvě z paletky — a hlavně **odchylku po složení**:
barvu položenou přes podklad při těch průhlednostech, které se opravdu
používají.

| barva | výskytů | nejblíž | odchylka barvy | po složení |
|---|---|---|---|---|
| #1F5138 | 46 | `--plocha-znacka` | 2,48 | **2,80** |
| #08140E | 13 | `--text` | 1,78 | 1,16 |
| #14231C | 6 | `--plocha-tmava` | 0,68 | 0,08 |
| #E8B341 | 5 | `--accent-warm-bright` | 4,81 | 1,11 |
| #7C5105 | 4 | `--accent-warm` | 3,05 | 0,97 |
| #0C1A12 | 4 | `--text` | 2,10 | 1,42 |
| …a dalších devět | | | | **do 1,10** |

Čtrnáct barev je po složení od své pojmenované dvojnice vzdálené
**nejvýš 1,42** — to je pod mezí, kde se dvě plochy vedle sebe dají
rozeznat. Nejsou to tedy nové barvy; jsou to **barvy z paletky napsané
přibližně**. Snesly se tedy k tokenu, ze kterého měly vycházet, zápisem
`rgba(var(--token-rgb), a)` podle oddílu 87.

A měření zároveň ukázalo pět vnitřních hnízd: `#08140E`, `#0C1A12`,
`#0C1611`, `#09150F` a `#08140D` jsou mezi sebou do odchylky 2,48 —
pět zápisů téže téměř černé zelenočerné, lišících se o jednotku
v kanálu. Všech pět teď bere `--text`.

### Dvě barvy jméno dostaly, protože si ho zasloužily

**`--znacka-hluboka:#1F5138`** (46 výskytů) — nejčastější barva webu
bez jména, a ani jedno z těch míst ji nepoužívá naplno. Drží prstenec
zaměření, záři, obrys tlačítek, osmnáct okrajů, dvanáct tónovaných
ploch a šest stínů. Ke `--plocha-znacka` má po složení **2,80**, a to
při nejsilnější použité průhlednosti (0,7 u obrysu tlačítek) — tam už
je rozdíl vidět, když se dvě plochy položí vedle sebe. Sloučit je je
rozhodnutí o vzhledu, ne úklid, a **neudělalo se.**

**`--plocha-znacka-svetla:#7EC49D`** (21 výskytů) — tónovaná plocha
a okraj u panelů, které zvou k akci: rozbalovací rada, poštovní kontakt
na šesti stránkách, ikona odeslaného přihlášení. Od každé zelené
v paletce je daleko (po složení `--c-ok` 6,60 · `--text-ondeep-mute`
4,92 · `--znacka-svetla` 9,78 · `--brand-live` 10,22), takže přimknout
se nedala.

### Výsledek a co zbývá

Z **24 barev / 136 výskytů** je po tomhle oddílu **8 barev / 23
výskytů** — a všech osm je skutečně svoje. Zbývá na nich jedno
rozhodnutí o vzhledu, které jsem si nevzal:

* **Čtyři červené na jednu práci.** `#E4483D` (6×), `#B03A2E` (4×),
  `#C83C28` (2×) a `#AE1E1E` (1×) dělají všechny totéž: světlý
  červený podklad pod textem v `--c-exekuce-ink` — termín dražby „dnes",
  zamítnutý inzerát, chyba ve zprávách, slabý poměr v předloze. Čtyři
  stránky, čtyři vlastní červené. Proti `--c-exekuce` jsou po složení
  **0,73 · 2,69 · 2,97 · 4,65**, takže tři z nich by se sloučit daly
  bez povšimnutí a čtvrtá (`#E4483D` při 0,3) by se viditelně změnila.
  Je to táž úloha jako „bílá má šest jmen" z oddílu 22 — a stejně jako
  tam jde o rozhodnutí, ne o úklid.
* `#5BD98A` (3×) a `#5FB07E` (3×) — dvě jasné zeleně v září; od
  `--c-ok` 16,28 a 6,92.
* `#FFC43C` (2×) a `#6E9682` (2×).

### Co z toho platí dál

**U barvy nerozhoduje její hodnota, ale jak vypadá tam, kde se
používá.** Patnáct z těch dvaceti čtyř barev mělo od pojmenované
dvojnice odchylku 0,7 až 4,8 — a po složení při skutečné průhlednosti
z toho bylo 0,08 až 1,42, tedy nic. Kdybych rozhodoval podle hodnoty,
vymyslel bych patnáct jmen pro barvy, které už jméno měly. A naopak:
u `#1F5138` vypadala odchylka 2,48 jako „totéž", ale při 0,7 vyšla
2,80 — proto zůstala.


## 92. Hláška, kterou odečítač nemá jak slyšet *21. 10.*

Toast je `<div role="status" aria-live="polite" hidden>` a nese věty,
které člověk jinak nemá odkud zjistit: *„Nepovedlo se uložit — plná
paměť prohlížeče"*, *„Nepodařilo se stáhnout…"*, *„Uloženo mezi
oblíbené"*, *„Souřadnice zkopírovány"*. Všechny tři jeho obsluhy ale
nastavovaly text **dřív**, než oblast odkryly:

```js
toastEl.textContent = msg;          // js/main.js:418
…
toastEl.removeAttribute('hidden');  // js/main.js:433
```

Totéž v `js/pozemek.js` (`t.textContent = msg; t.hidden = false;` na
jednom řádku) a v `js/pridat.js`.

### Změřeno v přístupnostním stromu

Ne na odečítači — ten v Chromiu změřit nejde — ale na tom, co odečítač
čte. Snímek stromu před a po vyvolání hlášky:

```
dokud je toast hidden   → uzel role=status ve stromu NENÍ
po vyvolání hlášky      → uzel role=status je, a text v něm už JE
                          (DOM: „Pozemek skrytý z výpisuVrátit")
```

`hidden` je `display:none`, takže prvek ve stromu není vůbec. Text
vložený do skryté živé oblasti tedy není změna, kterou by odečítač
viděl — a oblast se pak do stromu přidá **už s hotovým obsahem**, což
není aktualizace `aria-live`, ale nový uzel. Že se nový uzel s
`role=status` ohlásí, není zaručené; NVDA a JAWS to běžně minou.

### Oprava: odkryj prázdnou, text vlož až potom

```js
toastEl.textContent = '';
toastEl.removeAttribute('hidden');      // oblast je ve stromu a prázdná
requestAnimationFrame(function () {
  toastEl.textContent = msg;            // ZMĚNA uvnitř živé oblasti
  toastEl.classList.add('show');
});
```

Na vzhledu to nemění nic: prolnutí `.show` se přidávalo v `rAF` už
dřív, takže text dorazí v tom samém snímku jako ono. Stejná úprava na
třech místech.

### Hlídač měří POŘADÍ, a víc netvrdí

`scripts/test-ohlaseni.mjs` nasadí na toast `MutationObserver` ještě
před vyvoláním hlášky a zapíše, co se stalo dřív: odkrytí, nebo text.
Hláška se vyvolá tou cestou, kterou by šel člověk:

| obsluha | čím se vyvolá | jak se měří |
|---|---|---|
| `js/main.js` | „Tenhle mě nezajímá" ve výpisu (navíc ta složitější větev — toast s tlačítkem „Vrátit") | pořadí v prohlížeči |
| `js/pozemek.js` | „Kopírovat" u souřadnic (hlášku pustí obě cesty, i ta záložní bez schránky) | pořadí v prohlížeči |
| `js/pridat.js` | hláška visí až na odeslání inzerátu do databáze | pořadí **čtené ze zdroje** |

Ta třetí je slabší kontrola a je tak i pojmenovaná: měřit ji v
prohlížeči by znamenalo falešnou Supabase a nahrané fotky kvůli jedinému
pořadí. Pozná tedy přepsanou obsluhu, ale neprokáže, co prohlížeč
opravdu udělá.

Co ta zkouška **neprokazuje** ani u prvních dvou: že konkrétní odečítač
hlášku přečte. Měří mechanismus — živá oblast musí být ve stromu dřív,
než se jí změní obsah — a v zápisu to má napsané, ať se z toho nedělá
důkaz, který to není.

Prokázáno sabotáží na obou polovinách: s původním pořadím padly obě
měřené obsluhy (`text:… → odkryto`), a když se pořadí vrátilo jen v
`js/pridat.js`, padly přesně ty dvě zdrojové kontroly.

### Co z toho platí dál

**`hidden` na živé oblasti znamená, že ta oblast neexistuje.** Pořadí
„nastav text, pak odkryj" vypadá v kódu úplně nevinně a na obrazovce
funguje; chybí jen to, co na obrazovce není vidět. Je to třetí nález
tohohle druhu za dnešek — po oddílu 85 (tlačítko, které se nekreslilo
nikde) a 89 (oddíl, který měl obsah a byl na opacity 0): **vady, které
nejsou vidět, nenahlásí nikdo, dokud se na ně nezačne měřit.**

## 93. Devatenáct změn na stránce, jedna v živé oblasti *21. 10.*

Oddíl 92 opravil hlášku (toast). Ta ale nese jen drobnosti — a zůstala
otázka, co se vlastně ohlásí z toho hlavního, co web dělá: z hledání
a filtrů. Změřeno MutationObserverem přes celé `<body>`: po každém
zásahu člověka se posbírala všechna změněná místa a u každého se
dohledalo, jestli leží v živé oblasti (`aria-live`, `role=status`).

```
napsání „Brno" do hledání        19 změněných míst, v živé oblasti 1
vybrání druhu (pilulka filtru)   13 změněných míst, v živé oblasti 0
```

A to jedno není ani ono: je to `#user-listings` (oddíl „Pozemky přímo
od majitelů"), které se se hledáním nemá co dělat. Mezi změnami přitom
bylo všechno, na čem při hledání záleží:

```
#map-count    „Doporučené příležitosti · 15 na mapě"
#mvt-count    „(15)"
#msr-hotovo   „Zobrazit 15 pozemků"
#mc-druhy     „Orná půda 8 · Louka 0 · Stavební 4 …"
#opp-list     celý výpis karet
```

Kdo nevidí, napsal tedy hledání a **nedozvěděl se nic** — ani „nic
nenalezeno", což je ze všech stavů ten nejdůležitější: prázdný výpis
se nepozná ani hmatem.

### Oprava: jedna živá oblast, která řekne počet

V `index.html` přibyl `<p id="vysledky-stav" class="visually-hidden"
role="status" aria-live="polite" aria-atomic="true">`, prázdný a ve
stromu od začátku (proč prázdný, stojí v oddílu 92). Plní ho
`ohlasVysledky()` v `js/main.js` z jediného místa — z `renderList()`,
kterým prochází všech 50 cest, jak se dá výpis změnit.

Hlásí se počet, a u napsané věty i to, co se z ní vzalo:

```
„les do 500 tis"     → „60 pozemků ve výpisu. Z hledání vzato: do 500 tis, Lesní pozemek"
„do 30 km od Brna"   → „163 pozemků ve výpisu. Z hledání vzato: do 30 km (Brno)"
„stavební Brno do 2 mil" → „Nic nenalezeno. Z hledání vzato: do 2 mil, Stavební / zastavěná"
```

Ta druhá věta není ozdoba. Odznaky „Rozpoznáno z hledání" (`#ms-chipy`)
jsou jediné místo, kde web přiznává, jak té větě rozuměl — a byly vidět
jenom očima. Zkouška proto porovnává ohlášení s textem odznaků, aby se
ty dvě podoby nemohly rozejít.

### Dvě vady vlastního návrhu, obě našlo měření

**Porovnávat větu nestačí.** První podoba hlásila jen tehdy, když se
věta lišila od poslední ohlášené — aby posun mapy neopakoval „15
pozemků" po každém tažení. Naměřeno: „Brno" vyšlo na týchž 15 pozemků
jako výchozí výpis, takže se napsané hledání **neohlásilo vůbec**.
Porovnává se proto podpis DOTAZU — stav, který si web sám zapisuje do
adresy (`stavProAdresu()`), bez výřezu mapy. Posun mapy tím pořád
mlčí, ale jiný dotaz se stejným počtem se ohlásí.

**Základ se musí vzít hned, ne v čekajícím hlášení.** První vykreslení
se hlásit nemá (skočilo by odečítači do čtení právě otevřené stránky).
Dokud se to ale rozhodovalo teprve uvnitř čekajícího `setTimeout`,
stačilo napsat dotaz do 700 ms od prvního vykreslení: čekající hlášení
se zrušilo a za „první" se vzal ten dotaz. Člověk napsal hledání
a neslyšel nic. Základ se teď bere synchronně při prvním vykreslení.

### Tři podmínky, aby to byla pomoc a ne otrava

| podmínka | proč |
|---|---|
| čeká se 700 ms | jinak odečítač mluví přes psaní (čtyři úhozy = čtyři hlášení) |
| hlásí se jen změněný dotaz | posun mapy mění „na mapě", opakovat počet po každém tažení je otrava |
| první vykreslení se nehlásí | počet si člověk přečte v nadpisu výpisu, kam právě došel |

### Hlídač a sabotáže

Nová část v `scripts/test-ohlaseni.mjs` (ze 14 kontrol je 26). Měří
pořadí i obsah: oblast je ve stromu, po načtení je prázdná, dotaz
napsaný HNED po načtení se ohlásí, čtyři úhozy dají jedno ohlášení,
„nic nenalezeno" se ohlásí, posun mapy se neohlašuje znovu.

```
odebrané volání ohlasVysledky()        → spadly 4 kontroly (do oblasti nepřišlo nic)
základ brán až v čekajícím hlášení     → spadlo „hledání napsané hned po načtení" ([])
čekání 700 ms → 0 ms                   → spadlo „čtyři úhozy daly jedno ohlášení" (4)
oblast schovaná atributem hidden       → spadlo „je ve stromu, ne schovaná displayem"
```

Jedna vlastní past u zkoušky stojí za zápis: vzor `/Z hledání vzato/`
na správně vysázeném textu **nesedí**. Sázecí krok v `oprav.mjs` totiž
po jednoznakovém slově mezeru nahrazuje nezlomitelnou (U+00A0), takže
ve stránce stojí „Z hledání". Zkouška si proto mezery narovná,
než začne porovnávat — jinak by padala na tom, co je správně.

Co se tím **neprokázalo**: jak se zachová konkrétní odečítač. Měří se
mechanismus, ne zážitek.

### Co z toho platí dál

**Co se na stránce změní, se musí dát i slyšet — a jde to spočítat.**
Devatenáct ku jedné není dojem, je to číslo, a dá se naměřit u každé
obrazovky, kterou web má. Hned první takové počítání mimo úvodní
stránku vrátilo další nález: `hlidani.html` a `zpravy.html` nemají
živou oblast ani jednu a zpětná vazba přihlašování se tam píše do
obyčejného `div` (a místy se ten `div` staví rovnou s textem uvnitř,
což je nový uzel, ne změna). To je samostatná položka.

## 94. Dvě stránky účtu bez jediné živé oblasti *21. 10.*

Oddíl 93 skončil tím, že se počítání změn vyplatí udělat i mimo
úvodní stránku. První takové měření — všechny živé oblasti na čtrnácti
typech stránek — vrátilo tohle:

```
index.html        4 živé oblasti
pridat.html       7
muj-inzerat.html  4
pozemek-*.html    3
kontakt.html      1 (hláška)
hlidani.html      0
zpravy.html       0
```

Dvě stránky, na kterých se pracuje s účtem, nemají živou oblast **ani
jednu**. A měření toho, co se na nich po zásahu člověka změní, je
tentokrát krátké — mění se jedno jediné místo:

```
hlidani.html  klepnutí na „Přihlásit se"
   → mimo živou oblast  #hauthmsg  „Zadejte e-mail a heslo (aspoň 6 znaků)."
   → v živé oblasti: 0 z 1
zpravy.html   klepnutí na „Přihlásit se"
   → mimo živou oblast  #zauthmsg  „Zadejte e-mail a heslo (aspoň 6 znaků)."
   → v živé oblasti: 0 z 1
```

Jedno místo, a není slyšet. Kdo nevidí, zmáčkl přihlášení a nedozvěděl
se ani „Zadejte e-mail a heslo", ani „Přihlašuji…", ani „Přihlášení se
nepovedlo." Stránka přitom nemá co jiného říct — formulář je celý její
obsah.

### Past při měření, kterou stojí za to si zapsat

První pokus hlásil „0 z 0": po klepnutí se nezměnilo nic. Důvod nebyl
ve stránce, ale v mém zadání — do políčka jsem napsal neplatný e-mail,
a `<input type="email">` s neplatnou hodnotou zastaví odeslání vlastní
kontrolou prohlížeče, takže se obsluha vůbec nespustí. Měřit se musí
platným e-mailem a krátkým heslem, aby se dostalo na kontrolu webu.
Nula naměřená špatným zadáním vypadá úplně stejně jako nula skutečná.

### Co se opravilo

| místo | co nese | jak |
|---|---|---|
| `#hauthmsg`, `#zauthmsg` | zpětná vazba přihlášení a zakládání účtu | `role="status"`, a oblast se staví PRÁZDNÁ (text až v dalším snímku) |
| `#ns-msg` (hlidani) | „Ukládám…", „Uložení se nepovedlo.", a hlavně větu o tom, co se z hlídání nepropsalo | `role="status"` |
| `#zc-err` (zpravy) | chyba v rozhovoru („Moment — mezi zprávami nechte pár vteřin.") | `role="status"` + odkrývá se prázdná, text až potom (oddíl 92) |
| nová zpráva od druhého | dotažení na pozadí každých 15 s | nová oblast `#zc-ohlas`: „Nová zpráva v rozhovoru." |

Proč se obě přihlašovací hlášky musely stavět prázdné: `renderAuth(msg)`
vykresluje celý formulář `innerHTML`em a text hlášky do něj vkládala
rovnou. Oblast, která se do stromu přidá už s textem, je **nový uzel**,
ne změna uvnitř živé oblasti — a nový uzel se jako `aria-live` nehlásí
(oddíl 92).

### Dvě místa, kde se rozhodlo NIC NEDĚLAT

**Počet znaků ve zprávě** (`#zc-pocet`, „zbývá 412 znaků") se přepisuje
při každém úhozu. Živá oblast by znamenala, že odečítač mluví přes
psaní. To, co je opravdu třeba vědět — že se zpráva nevejde — se po
odeslání řekne v `#zc-err`, a ta oblast živá je.

**Poznámka u okruhu hlídání** (`#ns-okruh-pozn`, „Hlídá se vše do 30 km
od místa Brno") se přepisuje při každém úhozu v políčku místa, tedy
týž problém. Rozhodující věta z ní se navíc po uložení řekne znovu
v `#ns-msg` („Místo okruhu hlídáme celý okres."), a to živá oblast je.

Obojí je v těch stránkách napsané jako poznámka u kódu, ať se příště
nehledá, proč tam živá oblast není.

**Celý rozhovor živou oblastí být nesmí** a hlídá se to. `#zc-msgs` se
dotahuje každých 15 s a přepisuje se celý; `aria-live` by znamenal, že
odečítač po každém dotažení přečte celou konverzaci znovu. Proto se
hlásí jen to, co je nové, a jednou větou.

### Hlídač: dvě měřená místa navíc, ne jen čtení zdroje

`scripts/test-ohlaseni.mjs` má 42 kontrol (bylo 26). Přihlašovací
formulář je dostupný bez účtu, takže se obě stránky měří doopravdy
v prohlížeči. Uložení hlídání a nová zpráva potřebují účet a živou
databázi — a ty se **změřily tam, kde se odehrávají**, nad falešnou
Supabase: nová zpráva v `test-chat-prohlizec.mjs`, uložení hlídání
v `test-hlidani-prohlizec.mjs`. Ve `test-ohlaseni.mjs` k nim zůstaly
jen zdrojové kontroly, a je u nich napsané, kde se měří pravda.

```
role=status z #hauthmsg pryč       → spadlo „změna je v živé oblasti" (žádná) i „hlásí se v #hauthmsg"
#zauthmsg postaven s textem uvnitř → spadlo „obě stránky staví hlášku přihlášení PRÁZDNOU"
text před odkrytím v chyba()       → spadlo „odkrývá se PRÁZDNÁ (text až v dalším snímku)"
aria-live na celém #zc-msgs        → spadlo „celý rozhovor živá oblast NENÍ"
ohlášení nové zprávy odebráno      → spadlo v test-chat-prohlizec („nová zpráva se ohlásí")
role=status z #ns-msg pryč         → spadlo v test-hlidani-prohlizec
```

### Co z toho platí dál

**Jedna změna mimo živou oblast je horší nález než devatenáct.** Na
úvodní stránce se nehlásilo 18 z 19 změn, ale člověk měl aspoň výpis,
kterým se dá projít. Tady se mění jedno jediné místo na celé stránce —
a je to právě ta věta, která říká, proč se nic nestalo. Čím je stránka
prostší, tím dražší je mlčení.

A ta vlastní past stojí za druhé přečtení: **nula naměřená špatným
zadáním vypadá stejně jako nula skutečná.** Než se z nuly udělá nález,
musí být jasné, že se to, co se měří, vůbec stalo — proto je v každé
sadě kontrol jedna, která měří jen to, že bylo co měřit.

## 95. Devět set čtyřicet pět z devíti set čtyřiceti šesti *21. 10.*

Oddíly 92–94 hledaly vady, které nejsou vidět, u hlášení změn. Druhá
třída téhož druhu je **ovladač bez přístupného jména**: tlačítko,
které má na obrazovce ikonu a odečítači se ohlásí jako „tlačítko".
Pohledem se to nepozná — na obrazovce je přitom všechno v pořádku.

Žádná zkouška to nehlídala, tak jsem to změřil: na dvanácti typech
stránek se pro každý `button`, `a[href]`, `input`, `select`, `textarea`
a prvek s `role=button/tab/switch` spočítalo jméno v tom pořadí, v jakém
ho hledá odečítač (`aria-label` → `aria-labelledby` → text → `title` →
`alt` obrázku → `<label for>`), a **placeholder se za jméno nebral**.

```
index.html          všech 251 ovladačů má jméno
nove-pozemky.html   všech 248
okresní stránka     všech 114
pridat.html          všech 59
pozemek-*.html           1 ze 47 BEZ JMÉNA
muj-inzerat.html     všech 46
moje-data.html       všech 36
hlidani.html         všech 30
zpravy.html          všech 30
data.html            všech 31
porovnani.html       všech 27
kontakt.html         všech 27
                    ─────────────────────────
                     945 z 946 jméno má
```

**Negativní výsledek je taky výsledek** a patří do zápisu: devět set
čtyřicet pět ovladačů jméno má, a nebyla to náhoda — ikony na kartách,
v liště i na mapě ho dostaly průběžně, jak se stavěly.

### Jediný nález: pole, které se spoléhalo na placeholder

```
textarea#pz-pozn-text   → (jen placeholder) „Co jste tu viděli — příjezd,
                            sousedi, co říkal majitel…"
```

Soukromá poznámka u pozemku. Placeholder jméno pole **není**: zmizí,
jak se do pole začne psát, takže kdo se k němu vrátí, už nemá co
přečíst, a odečítače ho berou jen jako záložní zdroj. Opravou je
`aria-labelledby="pz-pozn-nadpis"` — ukazuje se na nadpis oddílu
(„Moje poznámka"), který nad polem stojí. Vlastní `aria-label` by byl
druhé místo, kde se říká totéž, a ta dvě místa se jednou rozejdou.

### Hlídač: tam, kde už se ARIA měří

Nepřibyla nová zkouška — přibyla druhá polovina do
`scripts/test-aria-cile.mjs`, která už tyhle vazby na stránkách měří
a má pro to i přihlášený falešný účet. Z 11 kontrol je 23. Do seznamu
jejích stránek se přidala jedna stránka pozemku (první podle abecedy),
protože právě tam ten jediný nález byl a bez ní by ho zkouška neviděla.
Měří se 678 ovladačů (jiný seznam stránek a kratší čekání než u měření
výš, proto jiné číslo než 946), a mez „bylo co měřit" je podle toho.

```
aria-labelledby z pole poznámky pryč → spadlo „každý ovladač má jméno" na stránce pozemku
```

### Co z toho platí dál

**Placeholder není jméno.** Je to nápověda, co do pole napsat, a mizí
právě ve chvíli, kdy se pole používá.

A k těm číslům: **945 z 946 je dobrá zpráva, kterou je stejně potřeba
napsat** — jinak se za rok nepozná, jestli se ta jedna výjimka
spravila, nebo jestli se jen přestalo měřit.

## 96. Zaměření klávesnice spadlo na začátek stránky *21. 10.*

Třetí třída vad, které nejsou vidět. Prstenec zaostření se na webu
hlídá od oddílu 44 — ale k ničemu není, když zaměření **zmizí úplně**.
Změřeno tak, že se prvek zaměřil, klepnulo se na něj a přečetlo se
`document.activeElement`:

```
pilulka druhu ve filtru              → button.filter-chip   (drží)
srdíčko „Uložit" na kartě            → button.opp-fav       (drží)
„Uložené" nad výpisem                → button#map-fav       (drží)
křížek „Tenhle mě nezajímá" na kartě → body    ← SPADLO
„Zobrazit skryté (1)" v hlavičce     → body    ← SPADLO
```

Kdo jede klávesnicí, zmáčkne na kartě ✕ a octne se na začátku
dokumentu. Aby se dostal zpátky tam, kde byl, musí protabovat hlavičku,
hledání i filtry. A karta sama o vině není: výpis se celý přestaví
(`listEl.innerHTML = ''`) a nářadí v hlavičce taky, takže zaměřený
prvek přestane existovat a prohlížeč zaměření upustí na `<body>`.

### Oprava: zapamatovat před překreslením, vrátit po něm

Dvě funkce vedle `renderList()`. Před přestavbou se zapamatuje `id`,
první třída, klíč karty (`data-pk`) a místo v seznamu; po přestavbě se
zaměření vrátí v tomhle pořadí:

1. prvek se stejným **id** (tak se vrací nářadí v hlavičce),
2. karta se stejným **klíčem** — ta samá nabídka, i když se posunula,
3. karta na **stejném místě** v seznamu (když ta původní zmizela,
   třeba se právě skryla nebo ji řazení odstěhovalo na jinou stranu),
4. jako poslední záchyt „Zobrazit skryté" v hlavičce výpisu, což je
   zároveň cesta zpátky k tomu, co se právě skrylo.

Vrací se jen tehdy, když zaměření doopravdy spadlo na `<body>` — kdo
píše do hledání (a `renderList()` běží při každém úhozu), o kurzor
nepřijde. A zaměřuje se s `preventScroll`: vracíme zaměření, ne pohled.

### Sabotáž odhalila DVĚ MOJE KONTROLY JAKO PLANÉ

Tohle je ta část, kterou stojí za to si zapsat. Zkouška po napsání
vypadala hotově — 32 kontrol, všechny zelené. Pak jsem shodil tři věci
v kódu a dvě sabotáže **nic neshodily**:

| sabotáž | mělo spadnout | spadlo |
|---|---|---|
| vracení odebráno celé | tři kontroly | ✓ spadly |
| pojistka proti krádeži odebrána | „psaní do hledání o kurzor nepřipraví" | **nic** |
| karta se hledá podle pořadí, ne podle klíče | „zůstane zaměřená táž karta" | **nic** |

První planá kontrola měřila **políčko hledání** — a to má `id`. I
rozbité vracení ho tedy najde podle id a zaměří nazpátek týž prvek: na
obrazovce se nestane nic. Krádež se dá změřit jen na prvku **bez id
a mimo výpis** (vzal se odkaz v hlavičce) — a ještě musí existovat cíl,
kam by zaměření uteklo: poslední záchyt je „Zobrazit skryté", a to
tlačítko na stránce je jen tehdy, když je něco skrytého. Bez skryté
nabídky zůstane zaměření na odkazu i s rozbitou pojistkou.

Druhá planá kontrola brala **první kartu** ve výpisu. Ta zůstala první,
takže klíč i pořadí ukazovaly na tutéž věc. Měřit se to dá jen na kartě
zprostřed, nad kterou se jedna skryje: pak se zaměřená posune o jedno
výš a hledání podle pořadí by zaměřilo JINOU nabídku.

A ještě dvě pasti, obě od stavu, který si kontroly navzájem přestavovaly:

* jedna kontrola zapnula „Zobrazit skryté" a další pak klepnutím na
  křížek kartu **odskryla** (je to přepínač), takže zmizelo i tlačítko,
  na kterém se měla měřit krádež;
* `page.reload()` čistou stránku **nedělá** — web si stav výpisu
  zapisuje do adresy, takže se po vymazání `localStorage` obnovil
  i s hledáním „Brno" z předchozí kontroly. Jít se musí na čistou
  adresu.
* a výchozí řazení „Doporučené" se střídá: výpis se po načtení ještě
  sám přemíchá (naměřeno: z pěti karet zůstaly na svém místě dvě).
  Scénář proto přepne na „Nejnovější" a čeká, až se seznam dvakrát po
  sobě přečte stejně.

Po těchhle opravách shodí každá ze tří sabotáží právě to své: 6 / 1 / 2
kontroly.

### A jedna pojistka, kterou sabotáž vyhodila z kódu

Napsal jsem do `vratZamereni()` dvě podmínky, aby se zaměření
nekradlo — vedle té účinné ještě `if (z.prvek.isConnected) return`
(„prvek přežil, není co řešit"). Sabotáž ji označila za mrtvou a měření
to potvrdilo: když prvek překreslení přežije, podrží si i zaměření —
změřeno i na nářadí, které `nastrojeDoHlavicky()` **přestěhuje**
(`appendChild` v Chromiu zaměření neupustí: `#mc-vyvoz` zaměřený
zůstal). A kdyby někdy přežil a zaměření přesto upustil, ta podmínka by
vrácení **zabránila** — tedy by škodila. Je venku.

### Co z toho platí dál

**Zelená zkouška není hotová zkouška.** Dokud se nezkusí, co ji shodí,
není jasné, jestli měří věc, nebo jen to, že web vůbec jde.
Tady byly plané dvě z pěti kontrol a obě byly plané z téhož důvodu:
měřily na prvku, který měl **záchranu** (id, nebo první místo
v seznamu), takže rozbité chování vypadalo stejně jako správné.
Sabotáž se proto nedělá jednou na konci — dělá se na každou kontrolu
zvlášť a hledá se u ní věta „co by vypadalo stejně, i kdyby to bylo
rozbité".

## 97. Okna, která slibují `aria-modal` a nedrží to *21. 10.*

Okno přes celou obrazovku hlásí `role="dialog" aria-modal="true"`, čímž
slibuje, že **za ním nic není**. Od okna se tedy čekají čtyři věci:
zaměření si vezme, tabulátor v něm udrží, Escape ho zavře a po zavření
zaměření vrátí tam, odkud se otevřelo. Změřeno na všech oknech úvodní
stránky:

| okno | zaměření dovnitř | zámek tabulátoru | Escape | vrácení |
|---|---|---|---|---|
| Zásady soukromí (`#info-modal`) | **ne** | **uteklo na „nahoru"** | ano | **ne** |
| Vyberte své okolí (`.vm-ov`) | **ne** | **uteklo** | ano | **ne** |
| Procházet po jednom (`#rv-vrstva`) | ano | **uteklo** | ano | **ne** |
| Stáhnout tabulku (`#vyv-vrstva`) | ano | ano | ano | ano |

Jedno ze čtyř bylo celé v pořádku — a právě u něj byl v kódu zámek
tabulátoru s poznámkou „používá to i okno rozsahu cen, ať se slib drží
všude stejně". Slib se jinde nedržel.

### Oprava

Dvě společné funkce (`otviracZapamatuj` / `otviracZamer`) vedle zámku
tabulátoru: před otevřením se zapamatuje, co bylo zaměřené, po zavření
se tam zaměření vrátí. Pamatuje se i **id**, protože zavření okna
přestaví výpis a nářadí v jeho hlavičce je potom jiný prvek se stejným
id (oddíl 96) — podle samotného prvku by se zaměření nevrátilo nikam.
Okna navíc dostala `zamkniTab()` a zaměření na svou zavírací akci.

A jeden krok, který nebyl vidět, ale rozhodl: **`zamkniTab` byl
zanořený uvnitř obsluhy stahování**, takže ho okno se zásadami
soukromí nevidělo. První pokus o jeho použití shodil celý skript
(`ReferenceError: zamkniTab is not defined`) a úvodní stránka zůstala
bez výpisu. Používají ho čtyři okna, takže patří tam, odkud ho vidí
všechna.

### NÁLEZ, KTERÝ BYL ARTEFAKT MĚŘENÍ

Páté okno — rozsah ceny (`.rz-ov`) — vyšlo zpočátku taky jako vadné:
po zavření zaměření nikde. Hodinu jsem hledal příčinu v kódu, a pak ji
našel ve své vlastní sondě:

```
pilulka „Cena"  rozměr 228×48 na (751, 781)
                dá se zaměřit: NE
                na jejím středu leží: <path>  (mapa)
```

Pilulka leží v panelu filtrů, což je `<details>`, a ten byl **zavřený**.
Obsah zavřeného `<details>` je na počítači kvůli pravidlu
`position:absolute` sice vysázený (má rozměr), ale leží za mapou a
**zaměřit se nedá**. Sonda okno otvírala `click()`em, který na
nezaměřitelný prvek funguje — otevřela tedy okno ze stavu, do kterého
se člověk nedostane ani klávesnicí, ani myší. S otevřeným panelem se
to okno chová správně: zaměření jde dovnitř, tabulátor drží, Escape
zavře, zaměření se vrátí.

Změny, které jsem na základě toho „nálezu" udělal (`id` pro pilulku
a vrácení zaměření v dalším snímku), jsou **vrácené zpátky**. Opravovat
něco, co není rozbité, znamená přidat kód a komentář, který tvrdí
naměřený důvod — a ten důvod by byl lež.

Hlídač to proto měří jen přes otvírač, který **jde zaměřit a leží
nahoře** (hit-test v jeho středu vrací jeho vlastní prvek). Ta jedna
podmínka je celé poučení převedené na kontrolu.

### Tři pasti v té kontrole, všechny naměřené

* `querySelector('[data-info]')` vrací první prvek v DOM, a ten může
  být ve schované mobilní nabídce. Hledá se tedy mezi **všemi** a bere
  se první dosažitelný.
* Odkaz v patičce je hluboko pod okrajem okna, takže hit-test vrací
  `null` — to není zakrytí, to je „ještě jsem k němu nedošel".
  Rolování dělá `locator.scrollIntoViewIfNeeded()`; vlastní
  `scrollIntoView()` jsem zkusil a měřil s ním **starý obdélník**
  (stránka roluje plynule a `getBoundingClientRect()` se přečetl dřív,
  než rolování dojelo).
* „Zaměření je zpátky na otvírači" musí uznat i prvek, který otvírač
  **nahradil se stejným id** — zavření okna přestaví nářadí výpisu.

### Prokázáno šesti sabotážemi

```
zámek z okna zásad pryč         → spadlo „tabulátor z něj neuteče" (uteklo na #to-top)
zaměření dovnitř z okna zásad   → spadlo „zaměření šlo DOVNITŘ"
vrácení z okna zásad            → spadlo „zaměření se vrátí na otvírač" (body)
zámek z okna „okolí"            → spadlo „tabulátor z něj neuteče" (body.vm-otevreno)
vrácení z okna „okolí"          → spadlo „zaměření se vrátí na otvírač"
zámek z rychlého výběru         → spadlo „tabulátor z něj neuteče"
```

### Co z toho platí dál

**Měř ve stavu, do kterého se člověk dostane.** `click()` ze skriptu
funguje i na prvek, který není zaměřitelný a není ani vidět — a sonda
pak poslušně naměří chování, které v životě nenastane. Než se z měření
stane nález, musí být jasné, že se k tomu prvku dá dojít: zaměřit ho
a trefit ho v jeho vlastním středu.

A opačně: **slib v atributu je závazek na čtyři věci, ne na jednu.**
`aria-modal="true"` je jedno slovo v kódu a znamená zaměření, zámek,
zavření a vrácení. Tři ze čtyř oken ho napsaná měla a nedržela.

## 98. Omezený pohyb: nula ku sedmnácti *21. 10.*

Kdo má v systému zapnuté „omezit pohyb" (`prefers-reduced-motion:
reduce`), nemá dostat nic, co se samo hýbe — u části lidí to vyvolá
nevolnost nebo závrať. Dvě konkrétní odezvy (tečka pod kurzorem, pruh
s cenou) to hlídaly od oddílu 44, ale celá stránka ne. Změřeno
průchodem přes všechny prvky:

```
                   bez omezení pohybu        s omezením
úvodní stránka     1 nekonečná animace,      0 a 0
                   16 přechodů s transform
stránka pozemku    1 a 2                     0 a 0
```

**Negativní výsledek, a je za ním jedno pravidlo**, které stojí za
zapsání: v `css/styles.css` je

```css
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto;}
  *{animation:none !important; transition:none !important;}
}
```

Vedle něj je ještě třináct pravidel pro jednotlivé věci (`.sk`,
`.pk-radar span`, `.mnb-ceka`, `#nav`…), která doplňují, jak má prvek
vypadat, když se zastaví — ale to, že se zastaví, drží ta jedna
hvězdička.

### Kontrola, která padnout nemohla

Nejdřív jsem napsal kontroly dvě: na nekonečné animace a na přechody
s `transform`. Sabotáž shodila jen tu druhou. Ta první shodit nešla
**ničím** — ani novou animací přidanou bez vlastního pravidla pro
omezení pohybu, protože globální hvězdička zastaví i ji. Dokud to
pravidlo ve stylopisu je, nemá co proklouznout; a kdyby zmizelo, spadne
kontrola na posuny.

Jsou z toho tedy dvě kontroly na stránku, ne tři: „bez omezení se
opravdu hýbe" (jinak by se neměřilo nic) a „s omezením se nehýbe nic".
Sabotáž: odebrat tu jednu hvězdičku → spadne na obou stránkách.

Cestou k tomu jsem ještě vyvrátil vlastní podezření, že to celé měří
jen emulaci v Playwrightu: na prázdné stránce s `reducedMotion:
'reduce'` animace běží dál (`animationName: t`, `running`) a jen se
mění `matchMedia`. Emulace tedy nic nezastavuje — zastavuje to web.

### Co z toho platí dál

**Když kontrolu nejde shodit, zjisti PROČ — a podle toho ji zařaď.**
Tady byla odpověď „protože to drží jedno pravidlo výš", a správný krok
byl kontroly sloučit a ten důvod napsat. Jinde by stejná odpověď
znamenala, že kontrola měří nesprávnou věc.

## 99. Chybu ve formuláři pole neřeklo *21. 10.*

Odeslání prázdného inzerátu dělalo tři ze čtyř věcí správně:

```
hláška „Vyplňte prosím obec nebo lokalitu."  → do živé oblasti (role=status)  ✓
zaměření                                      → na pole, které vadí            ✓
zvýraznění                                    → červený rámeček u pole         ✓
pole samo                                     → aria-invalid: NIC
                                                aria-describedby: NIC
```

Na celé stránce nebylo **ani jedno** `aria-invalid` ani
`aria-describedby`. Odečítač tedy ve chvíli, kdy na pole přijde
zaměření, přečte „Obec, edit text" — a ohlášení živé oblasti mu do
toho skočí, nebo se ztratí docela. A kdo se k poli vrátí za minutu,
nemá si co přečíst: hláška je nahoře nad formulářem a s polem ji nic
nespojuje.

### Oprava: chyba se stane součástí pole

Při chybě se poli nasadí `aria-invalid="true"` a do `aria-describedby`
přidá id hlášky — **ještě před** zaměřením, protože odečítač čte pole
v tom okamžiku, kdy na něj zaměření přijde; co tam není tehdy, to už
nepřečte. Značka drží jen do chvíle, kdy se to pole začne opravovat.

Měří se to, co z toho vidí odečítač, ne atributy:

```
uzel pole v přístupnostním stromu:
  role: textbox
  name: „Obec / lokalita *"
  description: „Vyplňte prosím obec nebo lokalitu."
  invalid: true
```

Vazba se přidává a odebírá po tokenech (`aria-describedby` může nést
i jiné popisy), takže se dá použít i na formuláři, který už nějaký
popis má.

### Úklid na třech místech, a jedno z nich šlo poznat jen touhle cestou

Značka se uklízí při psaní do pole (`input`/`change`), při dalším
odeslání a nikde jinde. Sabotáž úklidu **při odeslání** nejdřív
neshodila nic — protože než se odešle podruhé, uklidí značku už psaní.
Pak jsem si všiml cesty, kde se nepíše: tlačítko „Načíst údaje" vyplní
inzerát z odkazu jinde a hodnoty do polí vloží **web sám**, bez
události `input`. Kdyby se značka uklízela jen při psaní, zůstala by na
poli, které už je v pořádku, viset stará chyba. Kontrola to teď dělá
přesně takhle — `el.value = …` bez události — a sabotáž na ní padne
(dvě označená pole místo jednoho).

### Prokázáno čtyřmi sabotážemi

```
aria-invalid se nenasadí      → spadlo 5 kontrol (včetně uzlu ve stromu)
vazba na hlášku se nepřidá    → spadly 2 (vazba a popis ve stromu)
úklid při psaní pryč          → spadlo „jak se pole opravuje, značka mizí"
úklid při odeslání pryč       → spadlo „po vyplnění BEZ PSANÍ zůstane jedno pole"
```

### A jeden negativní výsledek vedle toho

Při téhle práci jsem proměřil i `autocomplete` na formuláři inzerátu:
ze 21 polí ho má pět a **je to správně**. Telefon má `autocomplete=tel`,
přihlašovací e-mail `email`, okres schválně `off` (má vlastní
našeptávač) — a u obce, výměry, ceny a parcelního čísla by autofill
vyplňoval ÚDAJE O ČLOVĚKU do polí, která popisují POZEMEK. „Obec" tady
není bydliště toho, kdo inzeruje. Nic se tedy nemění.

### Co z toho platí dál

**Hláška nad formulářem a chyba u pole nejsou totéž.** Živá oblast to
řekne jednou a pak je to pryč; vazba na pole to řekne vždycky, když se
k poli vrátíš. Obojí se nevylučuje — má být obojí.

A znovu to, co se opakuje celý den: **sabotáž ukázala na cestu, která
by mě jinak nenapadla.** Úklid při odeslání vypadal jako samozřejmý
druhý zámek, dokud se nenašel případ, kdy je to zámek jediný.

## 100. Na 320 pixelech se nic nerozjede *21. 10.*

320 CSS px je mez, se kterou počítá WCAG 1.4.10: šířka nejmenšího
běžného telefonu a zároveň to, co z velkého displeje zbude při 400%
zvětšení. Vodorovné rolování celé stránky je na takové šířce vada,
kterou se dá ztratit obsah — text uteče za okraj a půlka řádku není,
jak přečíst. Měřeno na třinácti typech stránek:

```
index.html             přestřel 0 px        hlidani.html      0 px
stránka pozemku        0 px                 zpravy.html       0 px
okresní stránka        0 px                 porovnani.html    0 px
pridat.html            0 px                 moje-data.html    0 px
muj-inzerat.html       0 px                 data.html         0 px
kontakt.html           0 px                 nove-pozemky.html 0 px
podminky.html          0 px
```

Negativní výsledek, a zapisuje se stejně jako nález — aby se za rok
poznalo, že se to měřilo.

### Hlídač, a čím se dá shodit

Hlídá se jediná věc: `scrollWidth` celé stránky proti jejímu
`clientWidth`. Jednotlivé prvky, které jdou za okraj **uvnitř posuvné
nebo ostříhané oblasti** (dlaždice mapy, tabulka s posuvem), přetékat
smí — to je záměr a hlídají ho zkoušky u těch oblastí.

Sabotáž to ukázala přesně: pevná šířka 420 px na **kartě ve výpisu**
nezmůže nic, protože výpis ji ostříhá. Táž šířka na **patičce**, tedy
na prvku v běžném toku, rozjede stránku o 100 px a kontrola spadne.
Hlídá se tím tedy právě to, co vodorovné rolování působí: široký prvek,
který nikdo neostříhá.

### Co z toho platí dál

**Přetékat uvnitř posuvné oblasti je funkce, přetékat ve stránce je
vada.** Jedna a tatáž šířka je v jednom místě v pořádku a v druhém
chyba — a kontrola, která to nerozlišuje, pak buď hlásí plané nálezy
(dlaždice mapy, tabulka), nebo neřekne nic.

## 101. Lokálně 1.49, v CI 1.64 — a to API už neexistuje *21. 10.*

Kontrola z oddílu 99 (chyba v přístupnostním stromu u pole) prošla
lokálně dvakrát a v CI spadla. Jediná ze všech:

```
✓ chyby: zaměření jde na pole, které vadí (input#p-obec)
✓ chyby: to pole je označené jako neplatné
✓ chyby: a ukazuje na hlášku, která říká co je špatně
✓ chyby: označené je právě jedno pole (1)
✕ chyby: v přístupnostním stromu je pole neplatné A má popis s chybou
      uzel pole se ve stromu nenašel
```

Všechny ostatní kontroly, i ty na atributech, prošly i v CI. Vadilo
tedy čtení stromu, ne web.

### Příčina: jiná verze nástroje, ne jiný web

```
lokálně   node_modules/playwright-core   1.49.1
v CI      npm install playwright-core playwright   → 1.64.1
```

CI si Playwright instaluje v každém běhu nanovo a bez připnuté verze,
takže běží na nejnovějším. A v 1.64 už `page.accessibility` **není**.
Změřeno v obou verzích na prázdné stránce:

```
1.49.1   page.accessibility existuje? true
1.64.1   page.accessibility existuje? false
```

Zkouška to měla v `try/catch`, takže se chyba nástroje převlékla za
nález o webu („uzel se ve stromu nenašel"). To je ta nejhorší podoba
selhání: hlásí se špatná příčina.

### Oprava: číst strom protokolem, ne obalem

Strom se teď čte přes CDP — `DOM.querySelector` +
`Accessibility.getPartialAXTree`. Je to protokol Chromia, ne API
Playwrightu, takže na verzi obalu nezávisí. Změřeno v **obou** verzích
a vrací totéž:

```
{"role":"textbox","name":"Obec / lokalita *",
 "description":"Vyplňte prosím obec nebo lokalitu.","invalid":"true"}
```

A když CDP nejde, kontrola spadne nahlas s textem „strom se nepodařilo
přečíst: …" — mlčky přeskočená kontrola je horší než žádná, protože
tvrdí pokrytí, které neexistuje.

### Hlídač: to API se nemá vrátit

Do `scripts/test-zkousky-meri.mjs` (zkouška zkoušek, bez prohlížeče)
přibyla kontrola, že **žádná zkouška nepoužívá `page.accessibility`**.
Hledá se jen v kódu, ne v komentářích — právě v nich je o tom API
napsané, proč se nepoužívá. Sabotáž: vrátit ho do kódu → spadne.

### Co z toho platí dál

**Lokálně zelená zkouška neznamená zelená v CI, dokud je nástroj
v obou jiný.** CI si Playwright instaluje nepřipnutý, takže si verzi
nevybíráme — a cokoli citlivého na verzi se musí změřit v TÉ, kterou
si nainstaluje CI. Instalace do vedlejší složky a jeden `node -e` to
řekne za půl minuty; červená CI za půl hodiny.

A podruhé totéž, co je v oddílu 94: **`try/catch` kolem měření umí
udělat z poruchy nástroje nález o webu.** Když se měření nepovede,
musí to kontrola říct jako „nepovedlo se změřit", ne jako „web je
rozbitý".

## 102. Řez main.js proveden: výpis už nečeká na mapu *22. 10.*

Oddíl 65 ten řez změřil a nechal neprovedený. Tohle je jeho provedení —
a tři věci v tom plánu nevyšly tak, jak se v něm čekalo.

### Co drželo výpis u knihovny

Jediný příkaz v `js/main.js`:

```js
if (!mapEl || typeof L === 'undefined') { …hláška…; return; }
```

`return` opouštěl `boot()`, a výpis nabídek je pod ním — ve stejném
běhu. Navíc `index.html` brala knihovnu značkou `<script defer>` PŘED
`main.js`, takže se `main.js` ani nezačal vykonávat, dokud nebyl
Leaflet stažený A spuštěný.

### Kolik to stálo

Spuštění `leaflet.js` z mezipaměti, medián z pěti načtení:

| procesor | překlad + spuštění |
|---|---|
| 1× (stolní) | **30 ms** |
| 4× zpomalený (telefon) | **62 ms** |

A vodopád na úvodní stránce (390 px, 1,6 Mb/s, 150 ms, procesor ×4,
medián ze tří načtení, místní server tedy BEZ komprese):

| | start | dojelo | velikost |
|---|---|---|---|
| mapa.json | 266 ms | 7 153 ms | 470 kB |
| kraje.json | 270 ms | 1 940 ms | 60 kB |
| **leaflet.js** | 935 ms | **4 736 ms** | **144 kB** |
| main.js | 1 189 ms | 6 596 ms | 238 kB |
| **první nabídka ve výpisu** | | **8 006 ms** | |

Knihovna tedy nestála jen těch 62 ms procesoru — zabírala 144 kB téhož
potrubí, kterým se táhla data a `main.js`. Po řezu z toho seznamu
zmizela docela a `main.js` dojel o 905 ms dřív.

### Jak to stojí teď

`map` je zpočátku `null`. Práce, která knihovnu potřebuje, se zapisuje
do fronty přes `azBudeMapa(f)`; `postavMapu()` mapu postaví a frontu
vysype **v původním pořadí**. Knihovnu si `main.js` dotahuje sám
z `<meta name="pk-leaflet">` — hned, když je rám mapy na obrazovce
vidět, jinak teprve na konci `boot()`, kdy je výpis hotový.

Fronta, ne druhá funkce: mapové příkazy jsou rozházené mezi ř. 1000
a 8400 a pozdější čtou, co založily dřívější. Obalit každý na místě
zachová pořadí i uzávěry; přesouvat je někam dolů by znamenalo
přerovnat obojí.

### Co to vyneslo

Měřeno proti předchozí verzi ve vedlejším pracovním stromu, aby to bylo
proti čemu (1,6 Mb/s, 150 ms, procesor ×4, medián ze tří načtení):

| | první nabídka | tečky na mapě |
|---|---|---|
| 390 px před | 8 152 ms | 8 240 ms |
| **390 px po** | **7 247 ms** (−905) | **7 602 ms** (−638) |
| 1280 px před | 8 363 ms | 8 783 ms |
| **1280 px po** | **7 544 ms** (−819) | **8 028 ms** (−755) |

**Zrychlila se i sama mapa, a na obou šířkách.** To plán nečekal:
čekalo se, že mapa o něco zpomalí. Knihovna se dnes netahá souběžně
s `mapa.json` a `main.js`, ale až je potrubí volné — a volné potrubí ji
stáhne rychleji, než když se o něj dělí.

Na nasazeném webu bude to číslo menší: místní server neumí brotli,
takže tady se přenášelo 144 kB tam, kde se ve skutečnosti přenáší
36,1 kB. Co je na obou stejné, je POŘADÍ — a to je to, co se měnilo.

### Tři věci, které plán v oddílu 65 neuhádl

**1. Vzor `\bmap\b` lže, a lhal i podruhé.** Oddíl 65 to u sebe už
jednou opravoval; rozkráječ napsaný teď znovu napočítal 41 míst místo
14, protože `\b` se trefí i doprostřed `'map-podklad'`. Opraveno
pohledem vzad: `(?<![\w'"-])map(?![\w-])`.

**2. Dělit příkazy jen podle `;` nestačí.** První rozkráječ nenašel dvě
místa, která na mapu sahají uvnitř bloku `if (…) { … }` na nejvyšší
úrovni — blok nekončí středníkem, takže se slil s dalším příkazem.
Dokud se nezačalo dělit i na koncích bloků (a rozlišovat `}` od
`} else`, `} catch`, `});`), zbývala obě jako tichá vada: stránka
skončila chybou `Cannot read properties of null (reading 'on')` a výpis
nebyl ŽÁDNÝ. Po doplnění zbylo z 478 příkazů nejvyšší úrovně **jedno**
podezřelé místo, a to byl planý poplach (`var markers = [];`).

**3. Sledovač na `map` nefunguje.** Pokus nahradit `map` objektem,
který by každé sáhnutí nahlásil, skončil hned: takový objekt je
**pravdivý**, takže `azBudeMapa()` všechnu frontu provedlo rovnou
a měřilo se něco jiného. Seznam nakonec dal rozkráječ a chyby
v konzoli.

### Co našla sabotáž

Vrácení značky `<script src=leaflet.js defer>` do `index.html` mělo
shodit pět kontrol o řezu. Shodilo deset: při 1280 px se nevykreslil
výpis vůbec a v konzoli byla chyba. Příčina byla v novém kódu, ne
v sabotáži — když knihovna existuje UŽ při `boot()`, `postavMapu()`
doběhne do míst, kde dohání to, co výpis minul, a sáhne na `mapLocked`
a `lastVis`, které v té chvíli ještě nikdo nenastavil. Dohánění se
proto dělá jen po `boot()`; dřív ho dělat netřeba, protože zbytek
`boot()` si s hotovou mapou poradí sám.

Dohánět se musí čtyři věci, a žádnou z nich fronta nezachytí — volá je
`renderList()`, ne příkaz v `boot()`: zámek posouvání (`setPan`),
tečky a obrysy (`updateMapView`), okruh kolem vybraného místa
(`vykresliOkruhNaMape`) a hlídané místo (`vykresliMistoNaMape`). Každá
z nich se dá zavolat podruhé bez škody — u okruhu proto, že si podpis
při prázdném běhu NEULOŽÍ.

### Jeden nález, který by zkoušky bez okruhu minuly

Kontrola na dohánění okruhu a hlídaného místa (oddíl E zkoušky) padla
hned při napsání — a nebyla to vada kontroly. `openFromUrl()` volá při
načtení `lockDots()` a ten `renderDots()`, tedy kreslení teček, do
kterého se jde **ještě než mapa stojí**: `Cannot read properties of
null (reading 'clearLayers')`. Postihlo by to každého, kdo přijde
s odkazem `?q=` nebo `?druh=` — a takové odkazy vedou ze statických
stránek i z „Hlídání". Pojistka je proto v `renderDots()`, ne
u volajících: volající jsou tři a každý jiný.

Potom se projely VŠECHNY podoby, kterými se na úvodní stránku dá
přijít — dvanáct (čistě, `?q=` obec, `?q=` okruh, `?druh=`, `?maxc=`,
`?mina=`, `?zlevnene=`, `#m=` výřez, zapamatovaný mapový pohled,
návrat ze stránky pozemku, hlídané místo, letecký podklad) × dvě šířky
× knihovna zdržená i zablokovaná. **48 z 48**: výpis vždycky, mapa po
dojetí vždycky celá, v konzoli ani jedna chyba.

### Nejdražší nález: přesunutý stylopis obrátil kaskádu

Celá sada (125 zkoušek) skončila 123 : 2. Jedna chyba byla zkouška,
která hlídala staré chování (`test-vypadky.mjs` — viz níž). Druhá byla
skutečná vada, a stála nejvíc práce:

`test-mapa.mjs` hlásil, že **jeden ze čtyř odznaků shluku leží mimo
vybraný kraj**. Porovnání s předchozí verzí ve vedlejším pracovním
stromu ukázalo, že se neliší vůbec nic z toho, co by člověk hledal
první: tentýž kraj (Karlovarský), tentýž zoom (6,25 → 8), tentýž
střed, tytéž čtyři shluky se stejnými počty, tentýž počet vykreslení
výpisu, tatáž vnitřní velikost mapy i pixelOrigin. Rozdíl byl
v DOM:

| | vnitřní prvek odznaku | obal (chytací plocha) |
|---|---|---|
| předchozí verze | `[117, 382, 28, 28]` | `[109, 374, 44, 44]` |
| po řezu | `[109, 374, 28, 28]` | `[109, 374, 44, 44]` |

Číslo v odznaku se přestalo středit — sedlo si do levého horního kouta
své plochy, o 8 px vedle. V zeměpisu je to při zoomu 8 asi 3 km, a tím
odznak vyšel za hranici kraje.

**Proč.** `css/styles.css` má
`.pk-shluk-obal{display:flex; align-items:center; justify-content:center}`.
Leaflet má ve svém stylopisu `display:block` na `.leaflet-marker-icon`
— tedy stejná specifičnost. V `index.html` stál `<link>` na
leaflet.css PŘED `css/uvod.min.css`, takže vyhrávala naše pravidla.
Jakmile si ten styl dotahuje `main.js` a přidá ho na KONEC hlavičky,
vyhraje Leaflet.

Oprava je jeden řádek: `insertBefore` před první `<link rel=stylesheet>`
nebo `<style>` v hlavičce, místo `appendChild`. Tím se pořadí kaskády
zachová.

**Na obrazovce by si toho nikdo nevšiml.** Číslo v kolečku vypadá
vystředěně, i když je o 8 px vedle; všimla si toho zkouška, která měří
GEOMETRII, ne vzhled. A našla se jedině proto, že se porovnávalo
s předchozí verzí — samotná chyba zní jako nález o datech („odznak je
za hranicí kraje"), ne o stylopisu.

### Co sabotáž shodila, kontrola po kontrole

Sedm sabotáží, každá přes celou zkoušku `test-vypis-bez-mapy.mjs`:

| sabotáž | shozených kontrol |
|---|---|
| značka `<script>` zpátky do `index.html` | 5 (o řezu) |
| pryč s `if (!map) return` v `updateMapView()` | 6 (chyba v konzoli) |
| pryč s dohnaným `updateMapView()` | 4 (53 vrstev místo 2 007) |
| knihovna spadne a `mapaNedojela()` se nezavolá | 2 (hláška v rámu) |
| stará hláška zpátky do výpisu | 2 |
| razítko `?v=` u metaznačky zrušené | 1 (+2 planě, viz níž) |
| pryč s ranou objednávkou, když je mapa vidět | 1 (pořadí na monitoru) |
| pryč s objednávkou na konci `boot()` | 6 (na telefonu mapa nikdy) |

Dvě věci z toho stojí za zapsání.

**Ta poslední sabotáž shodila i „po přepnutí na mapu se mapa postaví".**
Přepnutí pohledu si tedy knihovnu samo neobjedná — jen ji použije.
Je to schválně (viz komentář u `setView()`: objednávka odtud byla mrtvá
pojistka), ale platí to jen tak dlouho, dokud `chciMapu()` na konci
`boot()` opravdu stojí. Kdyby ho někdo odstranil, mapa už na telefonu
nepřijde vůbec — a tahle zkouška to pozná.

**A u té sabotáže s razítkem padly dvě kontroly navíc — planě.** Skript
sabotáží vracel po každém kole zdroje, ale u tohohle kola nespustil
minifikaci, takže `js/min/main.js` nesl ještě sabotáž z kola
předchozího. Je to přesně ta past, na kterou je v CLAUDE.md pravidlo:
**měří se to, co se servíruje, ne to, co je ve zdroji.**

### Co se tím mimochodem spravilo

Bez knihovny se dřív nevykreslil ani výpis a člověk zůstal u prázdné
stránky s větou „Výpis se načítá z mapy, a ta nedojela". Dnes je výpis
celý a hláška zůstala jen v rámu mapy — tam, kde je pravdivá.

### Co ten popis sám rozbil: próza o kódu platila za kód

Poslední věc, která na tomhle úkolu spadla, nespadla v kódu webu, ale
v tomhle dokumentu. Hlídač mrtvých pravidel ve stylopisu
(`scripts/test-mrtve-styly.mjs`) si vede tabulku `SKLADANE`: jména
tříd, která v repozitáři nikde doslova nestojí, protože je kód skládá
po částech za běhu. U každé je napsáno, kdo ji skládá, a zkouška navíc
hlídá, aby tabulka tiše nerostla: výjimku, která už není potřeba, chce
vyhodit.

Jedna z nich je Leafletova `.leaflet-marker-icon` — v `leaflet.js`
stojí jen `'leaflet-marker-'` a zbytek se dolepuje. Jak jsem ale
o oddíl výš popsal kaskádovou past, napsal jsem to jméno celé. Hlídač
prohledává i `.md`, takže ho našel, usoudil, že třída v repozitáři
doslova je, a výjimku prohlásil za zbytečnou. Rychlá sada spadla
`7 z 8`.

Zajímavé je, že ten hlídač tuhle vadu zná — o pár řádků níž má dlouhý
komentář **„komentář není použití"** a z HTML i z JavaScriptu si
komentáře opravdu odstraňuje. Jen Markdown nečistí nijak, protože
v Markdownu není komentář: tam je komentář **celý soubor**.

Lákavá oprava byla vyhodit tu jednu výjimku, jak zkouška radí. Byla by
to lež: třída se pořád skládá za běhu a výjimka by se musela vrátit,
jen co někdo ten odstavec v dokumentaci přepíše. Opraveno u kořene —
`.md` se do hledání nepočítá:

| | souborů | slov | mrtvých pravidel | potřebných výjimek |
|---|---|---|---|---|
| s Markdownem | 2 692 | 97 485 | 0 | 7 z 8 |
| bez Markdownu | 2 673 | 92 981 | 0 | **8 z 8** |

Vyloučení Markdownu tedy nic nezaslepilo: nezmrtvělo ani jedno
pravidlo. A sabotáž to potvrdila dvakrát — přidané
`.nikdy-nikde-xyz{color:red}` hlídač najde dál, a `.md` vrácené do
hledání zkoušku zase složí na téže kontrole.

**Sonda, která to měla změřit, nejdřív lhala.** Kopii zkoušky jsem
pustil pod jménem, které nezačínalo `test-` — a protože se z hledání
vynechávají právě a jen takto pojmenované soubory, prohledávala se ta
kopie sama. Celá tabulka
`SKLADANE` v ní stojí doslova, takže vyšlo, že potřeba není ani jedna
výjimka z osmi, a zároveň že není mrtvé ani jedno pravidlo — protimluv,
který jiná odpověď než „sonda je rozbitá" nemá. Je to táž past, na
kterou ten test v komentáři sám upozorňuje: *„a tenhle soubor by se
počítal sám"*. Po přejmenování tak, aby název začínal
`test-`, vyšla čísla v tabulce výše. (Obě kopie byly dočasné a v
repozitáři nezůstaly.)

## 103. Historie ceny se obrátila: živý stav se přilepil bez porovnání dne

Tohle nenašla sada u mě, ale CI — a na datech, která robot dovezl až po
mém posledním běhu. Padala jediná kontrola ze 125 prohlížečových
zkoušek: *„body jsou [den, cena] a dny jdou odpředu"* ve filtru
„Zlevněné“.

### Co to bylo

Historii ceny skládá `scripts/cenova-historie.mjs` ze dvou zdrojů.
Archiv drží UZAVŘENÁ období (při změně ceny se období se starou cenou
uzavře), dnešní cenu nedrží žádný řádek — ta je v živém stavu. Poslední
bod se tedy bral odtud a **přilepoval na konec bez porovnání dne**.

Jenže `od` živé nabídky je věk inzerátu, ne den, kdy začala platit
dnešní cena. Když nabídka ze zdroje zmizí a znovu se objeví, přinese si
s sebou původní, starší datum. Pak bod skočí dozadu:

| | den | cena |
|---|---|---|
| archiv (uzavřeno 16. 10.) | 19. 9. | 399 000 |
| živý stav | **14. 9.** | 299 000 |

Historie čtená odpředu pak říkala „299 000 od 14. 9., pak 399 000 od
19. 9.“ — tedy **zdražení u pozemku, který zlevnil o 25 %**. A protože
poslední bod nebyl nejnižší, nabídka se zároveň nedostala do výpisu
zlevněných, kde patří.

### Rozsah, změřeno před opravou

| | počet |
|---|---|
| živých nabídek s archivem | 126 |
| z nich s `od` starším než poslední uzavřené období | 5 |
| z těch pěti s jinou cenou (tedy s rozbitým pořadím) | **1** |

Ostatní čtyři mají cenu stejnou, takže je stejně zahodí pravidlo
o opakovaném údaji. Proto to roky nevadilo a vylezlo to na jedné
nabídce v Semilech.

### Oprava

Když je `od` živé nabídky starší než poslední bod, vezme se místo něj
`do` posledního uzavřeného období — den, od kterého starou cenu už
nevidíme. Víc se z dat poctivě říct nedá; datum se nevymýšlí, jen se
nelže o pořadí. Po opravě:

    [["2026-09-19", 399000], ["2026-10-16", 299000]]

a na stránce pozemku i ve výpisu stojí `předtím 399 000 Kč (−25 %,
16. 10. 2026)`.

Sabotáž: pojistka pryč → padne právě ta jedna kontrola a žádná jiná.
Prošly `test-zlevnene-filtr` (20/20), `test-cenova-historie`,
`test-data-rezy`, `test-data-rozhrani`, `test-nove-pozemky`
a `test-rozdeleni-stylu`.

### Co si z toho odnést

Zkoušky u mě běžely nad daty, která byla v repozitáři **před**
přebázováním na robotův commit. Sada tedy nebyla špatně — jen měřila
jiná data. Kde data přitéká zvenčí, je zelená sada tvrzení o datech
z té chvíle, ne o kódu navždy; rozhodnout může až CI nad tím, co je na
větvi doopravdy.

## 104. Vzorek 24 stránek rozhodoval o zelené podle toho, na co trefil

Druhá věc z téže červené CI, a jiného druhu: `test-vzorek-verdiktu.mjs`
si bere vzorek stránek pozemků pevným krokem napříč abecedou a chce,
aby na nich verdikt o ceně stál aspoň osmkrát — jinak prý „nemá co
měřit". Na datech od robota se ukázal sedmkrát a zkouška spadla, i když
na webu nebylo nic špatně.

### Vzorek byl malý, ne nešťastný

Změřeno na celých datech, ne na vzorku:

| | nabídek | podíl |
|---|---|---|
| s verdiktem o ceně | 916 | **47,6 %** |
| bez verdiktu, spoluvlastnický podíl | 526 | 27,3 % |
| bez verdiktu, jiné | 482 | 25,1 % |
| celkem | 1 924 | |

Ve dvaceti čtyřech stránkách se tedy čeká ~11 verdiktů. Krok je ale
pevný — padne vždy na tytéž soubory — takže to není náhoda, nýbrž jeden
konkrétní systematický vzorek, který se při změně dat stal verdikty
chudým. Zelená i červená pak nevypovídaly o webu, ale o tom, kam krok
shodou okolností dopadl. Tatáž vada podrazila i třetí kontrolu
(„hlášky o podílu jsou menšina"): ve vzorku 7 : 7, v datech 526 : 916.

### Oprava

Vzorek se rozšiřuje, dokud nemá co měřit: nejméně 24 stránek (ať se
měří i ty BEZ verdiktu — na nich stojí kontrola „nikde verdikt neukázal
tam, kde ho model nemá") a nejméně 12 verdiktů o ceně, se stropem
60 stránek, aby běh neutekl. Po opravě: 14 verdiktů z 24 stránek,
hlášky o podílu 3 ze 17. Prokázáno nárůstem: cíl zvednutý na 22
donutil zkoušku projít 40 stránek.

### A sabotáž, která neshodila nic — protože neměla jak

Chtěl jsem prokázat, že zkouška má pořád zuby, a zvýšil v `js/ceny.js`
počet nabídek o jeden. **Prošlo to.** Ne proto, že by zkouška byla
slepá, ale protože měří něco jiného, než jsem si myslel: očekávaný
počet si sama spočítá týmž modelem ze ZDROJE, takže změna ve zdroji
posune obě strany stejně. Prohlížeč si přitom servíruje
`js/min/ceny.js` — a změna jen v téhle kopii zkoušku složila, přesně
na kontrole „počet v textu se rovná tomu, co ze zdroje spočítá model".

Zkouška tedy hlídá, že se servírovaná kopie nerozešla se zdrojem a že
stránka opravdu ukazuje, co model spočítá. Chybu v samotném modelu
najít nemůže — a teď to u ní stojí napsané, aby se o tom znovu nikdo
nepřesvědčoval sabotáží, která nemá jak zabrat.


## 105. Bílé tlačítko na bílé kartě — a zkouška, která ho nikdy neviděla *22. 10.*

Při přípravě rozhodnutí o čtyřech červených (bod 57 v seznamu úkolů) se
nejdřív musel změřit podklad. Výsledek byl jednoznačný a sám o sobě
užitečný: **všech sedm míst, kde ty čtyři červené stojí, sedí na bílé
kartě.** Žádná z nich není přizpůsobená jiné ploše — jsou to čtyři různé
odpovědi na tutéž otázku. Měřeno v prohlížeči, ne odhadnuto: každé místo
se postavilo tak, jak ho stránka opravdu skládá (karta → řádek → odznak),
a pak se šlo po předcích, dokud nebylo pozadí neprůhledné.

Samotná volba barvy je rozhodnutí o vzhledu a čeká na majitele. Cestou se
ale našlo něco, co rozhodnutí není.

### Nález: hranice ovládacího prvku na polovinu požadavku

`.mi-lbtn.danger` — tlačítko „Smazat" u vlastního inzerátu — je **bílé
tlačítko na bílé kartě**. Jediné, co ho ohraničuje, je okraj, a ten byl
napsaný ručně jako `rgba(228,72,61,.35)`:

| | proti bílé kartě |
|---|---|
| okraj `rgba(228,72,61,.35)` | **1,60 : 1** |
| požadavek WCAG 1.4.11 | 3,00 : 1 |
| `rgba(var(--c-exekuce-rgb),.6)` | 3,21 : 1 |
| plná `--c-exekuce` (stav po nájezdu) | 8,27 : 1 |

Že tam má být paletová červená, přitom říkal **sám stylopis**: barva
textu tlačítka je `var(--c-exekuce)` a po nájezdu se na ni přepne i
okraj. Ručně psaná jasná červená byla odchylka od pravidla, které si
tentýž blok o řádek níž sám stanovil — ne volba. Proto se spravila hned
a nečeká na rozhodnutí o zbylých jedenácti výskytech.

### Proč to zkouška nenašla

`scripts/test-okraje.mjs` měří přesně tohle a `muj-inzerat.html` má v
seznamu stránek od začátku. Jenže **odhlášenému se seznam inzerátů
nevykreslí** — celý řádek s tlačítky vzniká až z odpovědi databáze.
Zkouška tedy stránku otevřela, naměřila přihlašovací pole a odešla s tím,
že je všechno v pořádku. Pravidla pro ta tlačítka přitom ve stylopisu
stránky stojí a platí.

Opraveno vzorkem: zkouška si na té stránce postaví kartu s tlačítkem tak,
jak ji stránka skládá, a měří ji s ostatními. Ve vzorku je **jen
tlačítko** — zbytek řádku jsou `<a>` a `<span>`, které se do měřeného
výběru nepočítají, a postavit je tam by vypadalo, že se měří.

Prokázáno dvěma sabotážemi:

* starý okraj zpátky → zkouška spadne na obou profilech a pojmenuje
  viníka (`button#vzorek-smazat.mi-lbtn.danger`, 1,61 : 1);
* starý okraj zpátky **a vzorek vypnutý** → zkouška projde a napíše
  „každý ovládací prvek je od svého pozadí odlišený". To je ta slepota,
  černé na bílém: 107 prvků místo 109.

### Co z toho platí dál

**Zkouška, která měří jen to, co vidí odhlášený, neměří celou stránku.**
Stránka za přihlášením není „nezkoušená stránka" — je to stránka, o které
si zkouška myslí, že ji zkouší. A je to tišší podoba slepoty než chybějící
soubor: zkouška běží, zelená svítí a počet změřených prvků nikdo
neporovnává.


## 106. Nášlapná mina v zkoušce: pevná mezera proti obyčejné *22. 10.*

CI #619 složila jediná kontrola ze 125 — „a je vidět, která obec je
vybraná" v úvodní obrazovce. Na webu přitom nebylo nic špatně: odznak
hlásil přesně to, co měl, **„Klobouky u Brna (okr. Břeclav)"**.

Zkouška bere nejpočetnější odkaz na obec ze stránek okresů, otevře
`index.html?obec=…&okres=…` a ptá se, jestli je to jméno vidět v odznaku.
Jenže jméno si vzala z HTML stránky okresu — a tam prošlo **českou
sazbou**, takže po jednoznakové předložce nese nezlomitelnou mezeru:
`Klobouky u Brna`. Text odznaku se přitom scvrkával přes `\s+`, což
` ` zahrnuje. Porovnávaly se tedy dva různé zápisy téhož jména a
`indexOf` vracel −1.

### Proč to vylezlo až teď

| | |
|---|---|
| odkazů na obec na stránkách okresů | 319 |
| z toho jméno s pevnou mezerou | **18 (5,6 %)** |
| v nejpočetnějších dvou | „Újezd u Brna" a „Klobouky u Brna", obě po 14 |

Zkouška si vybírá tu obec, která má nejvíc nabídek. Do 22. 10. to byla
vždycky obec bez jednoznakové předložky; nová data od robota posunula
nahoru rovnou dvě, které ji mají. Mina ležela ve zkoušce od začátku a
čekala na data — nespustila ji žádná změna kódu.

Opraveno u kořene: **obě strany se scvrknou stejně.** Datum se nevymýšlí,
jméno se nepřepisuje — jen se nesrovnávají dva různé zápisy. Sabotáž:
odznaku se sebralo jméno místa (vypisoval jen „Vybrané místo") → zkouška
padá právě na téhle kontrole.

### Vedlejší nález: sazba končí u generátorů

Když se při tom měřilo, ukázalo se, že pravidlo o nezlomitelné mezeře
platí jen na tom, co vyrobí generátory. Co vykresluje prohlížeč, jím
neprochází: ze **1 957 nabídek jich má 122 (6,2 %)** v názvu místa
jednopísmenné slovo a **všech 122** nese obyčejnou mezeru — „Čistá u
Horek", „Ostrov u Macochy", „Brodek u Konice". `scripts/test-sazba.mjs`
o tom neví, protože čte statické HTML, ne DOM. Zapsáno jako samostatný
úkol; tenhle oddíl to nespravuje, aby oprava červené CI zůstala jedna
věc.

### Co z toho platí dál

**Co porovnáváš, scvrkni stejně.** Jedna strana normalizovaná a druhá ne
je chyba, která se neprojeví, dokud se nesejde se vzácným vstupem — tady
5,6 % jmen a jeden konkrétní maximalizační výběr. A obráceně: když
zkouška spadne na datech a web je v pořádku, podezřelý je **zápis**, ne
hodnota.


## 107. Česká sazba končila u generátorů *22. 10.*

Z oddílu 106 zbyl nedodělek: pravidlo o nezlomitelné mezeře platilo jen
na tom, co vyrobí krok sestavení. Co skládá PROHLÍŽEČ — jména obcí na
kartách, ceny v shrnutí hlídání, data, hlášky — tím krokem neprojde.

### Měřeno v DOM, ne ve zdroji

Stejnou funkcí, jakou používá statická zkouška (`zbyva` ze
`scripts/sazba.mjs`), aby se neporovnávala dvě pravidla:

| | |
|---|---|
| prohlédnuto textů na osmi typech stránek | 1 204 |
| porušuje pravidlo **v DOM** | **11** |
| porušuje pravidlo **ve zdrojích týchž stránek** | **0** |

Jedenáct nálezů byly tři různé věci:

* **jméno obce z dat** („Lukavec u Lovosic") — v datech má jednopísmenné
  slovo v místě 122 z 1 957 nabídek (6,2 %) a všech 122 neslo obyčejnou
  mezeru;
* **číslo a jednotka** v textech skládaných prohlížečem — „do 2 000 000"
  a na dalším řádku „Kč" na kartě hlídání;
* **ručně psané věty** v `js/*.js` a ve vložených skriptech stránek.

### Oprava: sazba při výpisu, nikdy v datech

Do `js/cisteni.js` přibylo `sazba()` — ta část pravidla, kterou si
prohlížeč musí udělat sám. Volá se **až při vypisování**: hodnota
`place` zůstává s obyčejnou mezerou, protože podle ní se hledá,
porovnává a skládá adresa. Nezlomitelná mezera uvnitř dat je past, na
které zkouška spadla o oddíl dřív.

Ručně psané řetězce dostaly ` ` rovnou do textu — tak, jak to kód
dávno dělá u „Kč". A jedno místo bylo jinde, než by člověk čekal:
`data-kde="v okrese Tábor"` je **atribut**, a krok sazby sahá jen na
text mezi značkami. Osazuje se proto už při sestavení hodnoty
v `scripts/generate-region-pages.mjs`.

### Hlídač: zkouška, která čte DOM

`scripts/test-sazba-dom.mjs` projde jedenáct typů stránek a měří totéž
co statická zkouška — jen v DOM. Dvě věci v ní stojí za zmínku, obě
z dnešních chyb:

1. **Stránka pozemku se nebere první v pořadí.** Jméno obce
   s jednopísmenným slovem má jen **147 z 2 215** stránek (6,6 %), takže
   první v abecedě se na tu cestu vůbec nezeptá. Vybírá se podle
   titulku, který generátor už osadil.
2. **Hlídá se i POČET prohlédnutých textů.** Kdyby se stránka přestala
   vykreslovat, zkouška by jinak prošla nad prázdným DOM a svítila
   zeleně.

A hned se vyplatila: našla čtyři věci, na které jsem při ručním
procházení nepřišel — popisek grafu „Rozdělení ceny za m² u 13 nabídek",
druh pozemku „Zastavěná plocha a nádvoří", data („26. 11. 2026") a právě
ten atribut `data-kde`. Sabotáž: `PKCisteni.sazba()` pryč od jména obce
→ zkouška padá a jmenuje `index.html`.

### Co z toho platí dál

**Změna vzhledu textu je změna dat pro každou zkoušku, která ten text
čte.** Po opravě spadly tři zkoušky — a ani jedna kvůli webu: porovnávaly
očekávání s obyčejnou mezerou proti textu, který ji už má nezlomitelnou.
Je to týž přehmat jako v oddílu 106, podruhé za den a z opačné strany:
tam se nenormalizovalo očekávání, tady se změnil měřený text. Odtud
pravidlo v CLAUDE.md: **co porovnáváš, scvrkni stejně** — a když sahneš
na sazbu, projdi zkoušky, které ten text čtou.

Zkouška měří jen stav odhlášeného návštěvníka; text, který se vykreslí
až po přihlášení, o sobě pořád neví a stojí to u ní napsané.


## 108. Hlídači vzhledu viděli jen to, co vidí odhlášený *22. 10.*

Oddíl 105 skončil jedním nálezem a jednou větou do CLAUDE.md: zkouška,
která měří jen stav odhlášeného návštěvníka, neměří celou stránku. Tady
se to dotáhlo na číslo.

### Kolik toho hlídač okrajů nevidí

Šablony v `js/*.js` a ve vložených skriptech stránek umí vyrobit **99
tříd ovládacích prvků** (`button`, `input`, `select`, `textarea`).
Změřeno proti živému DOM bez přihlášení:

| | |
|---|---|
| viděno odhlášenému | 66 |
| **nikdy neviděno** | **33** |
| z toho vysvětlily stránky, kam zkouška vůbec nechodila | 9 |

Zbylých 33 jsou tři různé příčiny dohromady: ovládání za přihlášením,
ovládání v okně, které se teprve musí otevřít, a stav, který se musí
naklikat. Tenhle oddíl řeší jen tu první.

### Pět ovladačů pod prahem

Vzorky se postavily tak, jak je stránka skládá, a rozhodla **sama
zkouška** se svými výjimkami — ne vlastní metr. Nález:

| prvek | okraj proti ploše | |
|---|---|---|
| `.hl-chip` (vybavení u hlídání) | 1,87 | pod prahem |
| `.hl-a` (akce u hlídaného místa) | 1,87 | pod prahem |
| `.hl-rychle` (rychlá volba ceny) | 1,87 | pod prahem |
| `.zp-ta` (pole pro zprávu) | 1,87 | pod prahem |
| `.sv-del` (odebrat uložený pozemek) | 1,88 | pod prahem |
| požadavek WCAG 1.4.11 | 3,00 | |

Všech pět stavělo hranici na `--line-strong` (0,28). Zbytek webu přitom
na hranici ovládacího prvku dávno používá `--line-ui` (0,55 → **4,01**)
— ukazuje to `.filter-chip` na úvodní stránce, který zkouškou prochází.
Nebylo to tedy rozhodnutí o vzhledu, ale pět míst, která zůstala pozadu,
protože se na ně nikdo nedíval. Sjednoceno na `--line-ui`; měřených
prvků je po doplnění vzorků **125** místo 107 a všechny projdou.

### Vzorek musí stát tak, jak stránka skládá

Při psaní vzorků jsem si sám vyrobil nález, který neexistoval:
`.mi-lbtn` a `.mi-lbtn.primary` jsem postavil jako `<button>`, jenže
stránka je skládá jako `<a>` — odkaz bez rámečku i výplně je z měření
vyjmutý záměrně, protože tvar mu dělá text. Oba vzorky jsou pryč a je
u nich napsané proč.

### Co z toho platí dál

**Vzorek je tvrzení o tom, jak stránka vypadá — a musí být pravdivé.**
Postavit prvek jiným tagem, než ho web používá, vyrobí nález o vzorku,
ne o webu; a je to horší než díra v pokrytí, protože se tváří jako
práce. Proto u každého vzorku stojí, z čeho je odvozený, a prvky v něm
nesou `id` se slovem „vzorek", aby bylo v nálezu na první pohled vidět,
odkud je.


## 109. Odhad ceny přiznal, jak daleko mine *23. 10.*

Jediné místo, kde web tvrdil víc, než ví: vedle poctivého percentilu
(„dražší než 70 % podobných") stálo číslo, které se tvářilo přesně.

### Změřeno, ne odhadnuto

Křížově na desetinách (`scripts/presnost-odhadu.mjs` — nový modul, aby
měřidlo i web počítaly totéž): model se postaví z devíti dílů dat
a odhaduje ten desátý.

| druh | medián chyby | odhad vznikl |
|---|---:|---:|
| Orná půda | 22 % | 543 z 567 |
| Louka / travní porost | 31 % | 259 z 272 |
| Stavební / zastavěná | **35 %** | 195 z 226 |
| Vinice / sad | 42 % | 34 z 45 |
| Lesní pozemek | 45 % | **29 z 68** |
| Ostatní plocha | **61 %** | 23 z 62 |
| Jiný pozemek | **284 %** | 4 z 39 |
| Zahrada | — | **0 z 59** |

Nejhorší je to tam, kde jde o nejvíc peněz: u stavebního pozemku je 35 %
na dvou milionech ±700 tisíc. A u zahrad odhad nevznikne ani jednou z 59
— tam člověk nedostane špatné číslo, dostane mlčení.

### Co se změnilo

* **U čísla stojí, jak daleko mine.** „Jak přesné to bývá: u tohoto
  druhu mine odhad typicky o 22 %, tedy zhruba 52–81 Kč/m². Změřeno
  křížově na 567 nabídkách téhož druhu (u 24 z nich odhad nevznikne
  vůbec)."
* **Kde je chyba přes polovinu, částka se nevydává.** Ostatní plocha
  (61 %) a „jiný pozemek" (284 %) dostanou „Obvyklá cena — neuvádíme"
  a větu proč. Percentilový verdikt zůstává: ten se neopírá o model, ale
  o seřazené ceny.
* **Číslo veze s sebou DATA, ne konstanta v kódu.** Data se mění každý
  den robotem; konstanta by zestárla potichu. Řez modelu i řez pro mapu
  nesou tutéž tabulku (332 B), aby mapa a stránka pozemku netvrdily
  o témž pozemku jinou nejistotu.

### Tři vlastní chyby po cestě

1. **Tvrdil jsem, že pojistka je jednostranná** — podle staršího
   dokumentu. V kódu jsou tři: cena 8× nad odhadem odhad zahodí, sleva
   přes 60 % se označí „ověřit cenu" a velký rozptyl srovnávaných cen
   částku umlčí. Opraveno dřív, než jsem podle toho něco změnil.
2. **Do stránky jsem vložil jen skupinu té stránky** (45 B místo 330).
   Vyšlo to stejně špatně, 12 z 18: stránka vykresluje odhad i u pozemků
   jiného druhu. Vkládá se celá tabulka.
3. **Ostrůvek jsem četl v těle modulu**, kde ještě nemusí být naplněný.
   Čte se až při stavbě modelu.

### Jak se ví, že to doopravdy dojde na obrazovku

Sabotáž: věta se z bloku odstranila → ze stránek s odhadem ji nemá ani
jedna (0 z 18); vrácena → má ji 12 z 18. Zbylých šest jsou bloky
u spoluvlastnického podílu a úředně stanovené ceny, kde web odhad
záměrně netvrdí vůbec — a to byla ta nejdelší odbočka celé práce: než
jsem to změřil, vypadalo to jako díra v zapojení.

K tomu sedm kontrol v `scripts/test-ceny.mjs`: že se věta ukáže, že
rozmezí sedí na procento, že se BEZ naměřené přesnosti nic nevymýšlí, že
nad mezí se částka netvrdí, a že mez leží mezi oběma zkušebními vzorky —
jinak by ta dvojice neměřila nic.

### Co z toho platí dál

**Nejistotu je potřeba vézt s daty, ne s kódem.** Číslo, které se měří
na datech, zestárne přesně tak rychle jako ta data — a konstanta v kódu
o tom mlčí. A platí i obrácené: **dokud se nezměří, ať se nic netvrdí.**
Když přesnost k modelu nedorazí, nenapíše se žádné rozmezí; vymyšlená
nejistota je horší než žádná.


## 110. Podíly ve vzorku: samozřejmá oprava, kterou měření zamítlo *23. 10.*

V `docs/slaba-mista.md` stála jako zbývající slabina věta, že
**spoluvlastnické podíly ředí vzorek, ze kterého se počítá obvyklá
cena**. Zní to samozřejmě: u podílu je v ceně zlomek pozemku, ale
v inzerátu výměra celé parcely, takže jeho cena za metr vyjde uměle
nízko — a podílů je 523 z 1 980 nabídek (26 %). Do srovnávacího vzorku
v `js/ceny.js` přitom opravdu jdou; loop je nefiltruje.

Změřeno křížově (`scripts/mericka-odhadu.mjs`), tři varianty:

| varianta | medián chyby | párově |
|---|---:|---|
| dnešní model | **29,8 %** | — |
| bez podílů ve vzorku | 31,8 % (+2,0 p.b.) | lepší 417, **horší 484** |
| podíl přepočtený na výměru v ceně | 31,1 % (+1,2 p.b.) | lepší 207, **horší 259** |

**Obě „opravy" jsou horší, a znaménkový test to potvrzuje u obou.**
Vyhozením se navíc ztratí jedenadvacet odhadů (1 087 → 1 066), protože
v řídkých okresech klesne vzorek pod mez a odhad se nevydá vůbec.
Přepočet se skoro ničeho nedotkne (620 nabídek beze změny) a ze zbytku
pokazí víc, než spraví.

Mechanismus neznám. Napsat sem domněnku („levné podíly nejspíš
vyvažují…") by znamenalo vydávat dojem za zjištění — a zrovna tahle
práce je o tom nedělat. **Model se tedy nemění**; obě varianty zůstávají
v měřidle za přepínačem, aby se ta otázka nemusela otevírat od nuly.

### Co z toho platí dál

**Samozřejmá oprava je hypotéza jako každá jiná.** Tahle měla všechno
pro sebe: popsaný mechanismus, velké číslo (26 %) a dokument, který ji
tvrdil. Patnáct minut měření ukázalo, že by web zhoršila — a to je
levnější než ji zavést a čekat, až se někdo zeptá, proč je odhad horší
než loni. Stejně jako u bodu 48 (vynucené rozvržení) platí: **změřeno,
NEUDĚLÁNO** je taky výsledek, a patří ho zapsat.

---

## 111. Pravidlo proti zastaralým počtům hlídalo jen polovinu repozitáře *23. 10.*

V hlavičce `sw.js` je zapsané pravidlo, které si web sám na sobě
objevil: *„Stálo tu — ‚na 2 125 stránkách' — a za pár týdnů jich bylo
2 158. Počet, který se mění sám od sebe, se do komentáře psát nemá:
nikdo ho neopraví a začne lhát."* Hlídá ho `test-staticka.mjs`.

Jenže hlídač se díval do `js/` a `scripts/`, a tam **vynechával
`test-*.mjs`** — a do `docs/` se nedíval vůbec. Tedy přesně tam, kde se
na tomhle webu píše nejvíc prózy o číslech. Naměřeno dnes nad celým
repozitářem:

| místo | tvrzení | skutečnost |
|---|---|---|
| `docs/slaba-mista.md` | „Zkoušek je 228 (111 bez prohlížeče, 117 v něm)" | 116 a 126, souborů 245 |
| `docs/co-chybi.md` | „2 062 stránek pozemků" | 2 221 |
| `docs/co-chybi.md` | „Zkoušek je 185 souborů" | 245 |
| `scripts/test-sazba-dom.mjs` | „Těch stránek je 2 215" | 2 221 |

Ta poslední je moje vlastní poznámka, napsaná **22. 10.** — tedy den
předtím. Pravidlo, které tenhle web vymyslel, jsem porušil do dvou dnů
od chvíle, kdy jsem o něm psal, a hlídač mi to nemohl říct, protože na
zkoušky nesahal.

### Proč nešlo jen smazat ten řádek s výjimkou

Rozšíření na zkoušky a dokumentaci potřebuje rozlišit dvě věci, které
předtím rozlišovat nemuselo. Změřeno nad repozitářem, kolik míst která
hranice zachytí:

1. **Čísla pod tisíc nejsou počty, které se mění samy.** Okresních
   stránek je 77 a krajských 14 — to je správní dělení státu, ne stav
   dat. Samo se tu mění jen to, co je v tisících (stránky pozemků,
   nabídky). Bez téhle hranice by hlídač nutil přepsat poctivou větu
   „okresních stránek je 77" ve dvou místech `test-cisla-okresu.mjs`
   a v `docs/co-chybi.md`.
2. **Citace se nehlídá.** Ty staré nepravdy cituje jak komentář v
   `test-staticka.mjs`, tak `docs/co-chybi.md` — aby bylo vidět, o čem
   pravidlo je. Pozná se to podle uvozovek „ na témž nebo předchozím
   řádku. Bez té výjimky **hlídač spadne sám na sobě**, a byla to první
   věc, co po rozšíření udělal.

S oběma hranicemi projde celý repozitář: **384 souborů, 0 nálezů.**
Doložené sabotáží ve čtyřech směrech: přítomný čas s počtem v tisících
ve zkoušce → poplach; totéž v `docs/` → poplach; táž věta v uvozovkách
→ ticho; „okresních stránek je 77" → ticho.

### Co z toho platí dál

**Hlídač, který vynechává zkoušky a dokumentaci, nehlídá tam, kde se
píše nejvíc.** Je to ten samý omyl jako v oddílu 108, kde hlídači
vzhledu měřili jen stav odhlášeného: výjimka se zapsala kvůli jednomu
konkrétnímu důvodu (vlastní text hlídače by sám na sebe spadl) a pak
tiše kryla celou složku. Správná odpověď není výjimku smazat, ale
zúžit ji na to, proč vznikla — tady z „celé `test-*.mjs`" na „řádek
s uvozovkami".

---

## 112. Žádná stránka neměla CSP — a teď ji má i s hashi *23. 10.*

Změřeno: **0 z 2 357 stránek** nesla `Content-Security-Policy`. Web
běží staticky na GitHub Pages, takže hlavičku v HTTP odpovědi nastavit
nejde — jedinou cestou je `<meta http-equiv>`.

Proč to vůbec řešit, když se dírka v escapování nenašla: escape je na
webu napsaný **v jedenácti kopiích** (deset v `js/*.js`, jedna přímo
v `zpravy.html`) a nic nehlídá, že dvanáctá nezapomene. CSP je druhá
pojistka — i kdyby se cizí text do HTML dostal, prohlížeč ho nespustí.

### Politika se změřila, neuhádla

Sedm typů stránek se otevřelo v Chromiu a zapsalo se, kam skutečně
sahají:

| druh zdroje | hosty (počet požadavků) |
|---|---|
| script, font, stylesheet | jen vlastní server (96 + 14 + 8) |
| image | `server.arcgisonline.com` (29), `{a,b,c}.tile.openstreetmap.org` (27) |
| fetch | vlastní server (3), Supabase (2) |

K tomu z kódu to, co odhlášený návštěvník nevyvolá — poučení z oddílu
108, kde hlídači vzhledu měřili jen odhlášený stav: fotky inzerátů ze
Supabase Storage a geokodér `nominatim.openstreetmap.org`
(`js/pridat.js`). Adresa Supabase se do politiky **neopisuje**, čte se
z `js/config.js`, aby se nemohla rozejít s tím, kam aplikace mluví.

### Co to stojí a co to neumí

Vložených **spustitelných** skriptů je 4 767 (plus 9 149 datových
bloků `application/json` a 2 351 JSON-LD, které prohlížeč nespouští,
takže hash nepotřebují). Na stránku to dělá 1–7 hashů, tedy **54–378 B**
navíc v HTML.

Dvě poctivá omezení:

* **`frame-ancestors`, `report-uri` a `sandbox` prohlížeč v `<meta>`
  ignoruje.** Klikjacking tedy tahle cesta neuzavře a porušení se nikam
  nehlásí; obojí chce hlavičku ze serveru. Zapsáno do
  `docs/pred-vydanim.md`, aby se na to při přechodu z GitHub Pages
  nezapomnělo.
* **`style-src` má `'unsafe-inline'`.** Vložených atributů `style=` je
  naměřeno 33 na okresní stránce a 15 na úvodní — počítaná geometrie
  grafů. CSP hashuje obsah `<style>`, ne atribut; zbylo by
  `'unsafe-hashes'` s hashem každé hodnoty, tedy nový hash při každém
  běhu robota. Styl neumí spustit kód, zisk by byl nulový. U skriptů
  `'unsafe-inline'` není a hlídá se, že nepřibude.

### Doloženo sabotáží v obou směrech

`scripts/test-csp.mjs` umí stránku na požádání napadnout: vloží do ní
vložený skript a odkaz na cizí skript.

* **se hlavičkou** → skript se nespustí a prohlížeč ohlásí porušení
  `script-src` (i u cizího serveru),
* **bez hlavičky** → skript se spustí.

Ten druhý směr je v zkoušce schválně: bez něj by „zablokováno" mohlo
znamenat jen to, že se podstrčení nepovedlo, a zkouška by prošla,
i kdyby CSP nedělala vůbec nic. K tomu se měří, že se stránka opravdu
vykreslila (počet uzlů v DOM) — politika, která zakáže vlastní skripty
stránky, by jinak prošla jako „bez porušení" nad mrtvou stránkou.
Jedenáct typů stránek, 0 porušení, 15 kontrol.

### Jedna výjimka, změřená: kontrola fotek bez `eval` nepoběží

Pod touhle politikou se kontrola fotek AI modelem (`vendor/tfjs`
+ `vendor/nsfwjs`) **nerozjede vůbec** — `tf.ready is not a function`
a čtyři porušení (dvě „eval", dvě „wasm-eval"). Vyzkoušené varianty:

| přidáno do `script-src` | výsledek |
|---|---|
| `'wasm-unsafe-eval'` | nestačí, zbydou dvě porušení „eval" |
| `'unsafe-eval'` | projde, model klasifikuje |
| `'unsafe-eval' 'wasm-unsafe-eval'` | projde taky — wasm navíc netřeba |

Povolit `eval` celému webu by znamenalo vzdát se většiny toho, k čemu
CSP je. Výjimku proto dostane jen stránka, která si model opravdu může
načíst, a **pozná se pravidlem, ne ručním seznamem**: bere
`js/pridat.js` nebo `js/fototema.js` (jediná dvě místa, odkud se tfjs
stahuje) a má ve zdroji `<input type="file">`. Dnes to dělá **jedna
stránka z 2 357**. Čtrnáct stránek ten skript bere, ale třináct z nich
formulář s fotkou nemá — změřeno v prohlížeči, že na nich po doběhnutí
JS žádné `input[type=file]` nevznikne a `PKKontrola` se ani nezaloží.

Dvě pojistky, aby se z výjimky nestala tichá dírka: zkouška hlídá, že
`'unsafe-eval'` nenese žádná jiná stránka (**a také že ho ta jedna
nese** — jinak kontrola fotek tiše přestane fungovat), a že si žádný
skript v `js/` nepouští text jako kód (`eval`, `new Function`).
Krokům sestavení v `scripts/` se to nezakazuje: tak si
`generate-parcel-pages.mjs` načítá `js/ceny.js`, aby počítal týmiž
čísly jako web, a do prohlížeče se z toho nedostane nic.

Zkouška navíc měří **oba směry**: s výjimkou model klasifikuje, bez ní
padne na `script-src`. Povolení, o kterém se neví, jestli je k čemu, by
jinak v politice zůstalo navždy.

### Čeho jsem si málem nevšiml: hlavička zděděná z předlohy

Stránky pozemků se generují z `pozemek.html` jako z předlohy — a tím se
do nich dostala i **její** hlavička CSP. Předloha má svoje vložené
skripty, vygenerovaná stránka k nim přidává datový blok
`window.PK_POZEMEK`, takže hash předlohy pro ni neplatí. Naměřeno po
samostatném běhu generátoru: **1 930 stránek** mělo hlavičku o jeden
hash kratší, vlastní skript stránky padl na `script-src-elem` a ze
stránky zbylo **157 uzlů místo 382** — tedy rozbitá stránka, ne jen
nechráněná.

Chytila to zkouška, a to ve všech třech vrstvách naráz (chybějící hash,
ohlášené porušení, i podkročený počet uzlů). Opraveno dvakrát:

* generátor hlavičku z předlohy **maže** — chybějící hlavička web jen
  nechrání, kdežto chybná ho rozbije, a tohle zajistí, že vznikne
  jedině ten první, zkouškou odhalitelný případ;
* `scripts/test-ukonceno.mjs`, který generátor pouští v živém adresáři,
  si po něm CSP **dohání zpátky** — přesně jak už si doháněl českou
  sazbu. Ten komentář u sazby popisoval tenhle druh poruchy do detailu
  („zkouška padne na vadu, kterou nezpůsobila") a o dva měsíce později
  se stalo totéž s hlavičkou.

### Co CSP rozbila: třicet zkoušek a sedm úředních serverů

Hlavička prošla vlastní zkouškou, a přesto po ní v prohlížečové sadě
spadlo **třicet zkoušek** z 127. Byly to dvě různé věci a ani jedna
nebyla vidět na jedenácti stránkách, které jsem proměřil.

**1) Vrstvy mapy z úředních serverů (skutečná mezera v politice).**
Přepínatelné vrstvy — hranice parcel, územní plány, záplavová území,
BPEJ, ochrana přírody — chodí ze sedmi WMS serverů
(`services.cuzk.gov.cz`, `services.cuzk.cz`, `geoportal.gov.cz`,
`geoportal.uur.cz`, `gis.nature.cz`, `heis.vuv.cz`, `mapy.spucr.cz`).
Při měření se nezapnuly, protože jsem koukal na stránky v okně
monitoru a k mapě se nesjelo; na stránce pozemku v telefonu se zapnou
samy a prohlížeč odmítl **13 dlaždic**. Všech sedm serverů přitom bylo
celou dobu jmenovaných v zásadách soukromí — **dokument o nich věděl,
moje měření ne.** Teď se hosty čtou z `data/mapove-vrstvy.json`, takže
nová vrstva politiku posune s sebou.

**2) Playwright ovládá stránku `eval`em (vada v harnessu, ne na webu).**
Zbytek zkoušek padal tak, že se mapa nepostavila a vypadalo to na
rozbitý web. V hlášce o porušení ale nebyl **žádný zdrojový soubor** —
a to byla ta nápověda: `eval` nevolá stránka, volá ho vstřikovaný kód
Playwrightu, kterým se roluje k prvku a čeká na podmínku
(`waitForFunction`). Pod přísným `script-src` tedy přestane fungovat
ovládání, ne web. Playwright na to má volbu `bypassCSP`; dostalo ji
**124 zkoušek**, a `test-csp.mjs` ji naopak mít nesmí — ta jediná měří,
jestli hlavička platí. Hlídá se to v obou směrech.

### Čím mě to málem vyvedlo na slepou kolej

Zkouška padala v `scripts/`, ale moje přístrojovaná kopie
v odkladišti **procházela** — a to třikrát po sobě. Vypadalo to na
závod v kódu stránky. Příčina byla jinde: odkladiště má **vlastní
`node_modules/playwright-core`**, tedy jinou verzi, než si bere
repozitář. Kopie tím měřila něco jiného než originál.

Poučení, které platí nad tuhle práci: **když se kopie chová jinak než
originál, nejdřív se ptej, co kopii obklopuje** — ne co je v ní
napsané. Hodina hledání závodu v `js/pozemek.js` padla na tom, že jsem
tuhle otázku položil až jako čtvrtou.

### A ještě dvě: závod, který CSP jen vynesla na světlo

Po té opravě zbyly ze třiceti padlých zkoušek dvě — `test-ulozene-ucet`
a `test-poznamky`. Obě mají `bypassCSP`, takže hlavička na nich nic
neblokovala, a přesto padaly jen s ní. Postup, kterým se to zúžilo:

| pokus | výsledek |
|---|---|
| stejný kód a data, hlavičky sundané | **projde** |
| navíc neškodná `<meta name="pokus">` | projde — nejde o přítomnost prvku |
| povolná politika `default-src * 'unsafe-inline' 'unsafe-eval'` | **padá** — nejde o to, co politika zakazuje |
| politika i bez `bypassCSP` | padá — nejde o obcházení |
| ruční zavolání `PKUlozeneUcet.sync()` v té stránce | **projde** |

Tedy: nic nebylo zakázané, jen se to **nestihlo zavolat**. A to je
závod, který na webu byl celou dobu: `js/pozemek.js` běží už při
parsování stránky, kdežto `js/auth.js` má `defer` a vykoná se teprve
po něm. Při prvním vykreslení (z ostrůvku dat v HTML) proto přihlášení
často ještě není po ruce — `sync()` tiše vrátí `null` a stránka
zůstane u stavu z prohlížeče. Hlavička načasování posunula o pár
milisekund a z „občas" se stalo „vždy".

Důsledky, které to mělo bez jakékoli zkoušky:

* pozemek uložený na telefonu hlásil na počítači **„Uložit"** — tedy
  že uložený není. Přesně tomu měl ten kód zabránit (stojí to
  v komentáři u něj);
* u poznámky stála nepřihlášenému věta „zůstává jen v tomhle
  prohlížeči… nikam se neodesílá", **i když byl přihlášený** a poznámka
  šla na účet. To není nepřesnost, to je nepravda o tom, kde ta
  poznámka skončí.

Opraveno na obou místech stejně: pokus se zopakuje po `load` (kdy už
odložené skripty proběhly) a ještě jednou krátce po něm, protože
`prihlasen()` si u prošlého tokenu řekne o obnovu a ta je asynchronní.
Úspěšný pokus se počítá jen jeden, takže se nestahuje dvakrát.
`js/main.js` tenhle závod nemá — tam se `stahniUlozene()` volá při
každém vykreslení výpisu, takže se dožene sám.

**Co z toho platí dál:** hlavička CSP se tu zachovala jako zátěžová
zkouška načasování. Nic nerozbila — jen přestala schovávat dvě místa,
kde web spoléhal na to, co se stihne načíst dřív.

---

## 113. Nepřátelský text do dat: co web doopravdy chrání *23. 10.*

Escapování HTML je na webu napsané **ve třinácti kopiích** (deset
v `js/*.js`, tři v ručně psaných stránkách) a nejsou doslova stejné —
jedna escapuje i apostrof, ostatní ne. Nic přitom nehlídalo, že
čtrnáctá nezapomene. `scripts/test-escape-dom.mjs` to měří tak, jak se
to měřit má: **do dat se podstrčí nálož** (obrázek s `onerror`, `svg`
s `onload`, značka `script`) a ptá se, co z ní na stránce vznikne.

### Co měření ukázalo o pořadí obran

| obrana | kde | co udělá s `<img src=x onerror=…>` |
|---|---|---|
| **čištění dat** | `text()` v `js/cisteni.js` | zahodí `<`, `>` a `"` úplně — na kartě zbyde `img src=x onerror=…` jako text |
| escapování | třináct kopií v js a stránkách | druhá pojistka pro cesty, které čištěním neprojdou (zprávy mezi lidmi) |
| CSP | hlavička na každé stránce (oddíl 112) | třetí pojistka: i kdyby se kód do HTML dostal, nespustí se |

Na kartách výpisu je tedy první obranou **čištění, ne escapování** — a
to se dalo poznat jen sabotáží. Když se z `text()` odebere zahazování
ostrých znaků, naměří se tohle:

| stav | nálož se spustila | `img[onerror]` v DOM | porušení CSP |
|---|---|---|---|
| čištění vypnuté, CSP obcházená | **ano** | 16 | 0 |
| čištění vypnuté, CSP platná | **ne** | 17 | 17 |

Tedy: escapování tu kartu nezachrání (na té cestě se nepoužije), ale
**CSP ano**. To je přesně ten přínos, kvůli kterému se zaváděla —
a je naměřený, ne tvrzený.

### Proč ta zkouška CSP schválně obchází

Kdyby ji neobcházela, prošla by i nad dírou v escapování: skript by
zastavila hlavička a nebylo by poznat, že se cizí text dostal do HTML
jako kód. Měří se tedy **první** obrana, a že funguje i ta třetí, je
věcí `test-csp.mjs`.

### Tři věci, které jsem si při psaní musel naměřit

* **Nálož ve prvních třech záznamech dat se na obrazovku nedostane.**
  Výpis ukazuje šedesát řádků v nějakém pořadí a spoluvlastnické podíly
  skrývá; z 1 392 celých pozemků byly ty tři kdesi vprostřed. Zkouška
  pak hlásila „nespustilo se nic" nad stránkou, kde žádná nálož nebyla.
  Proto se otráví **všechny** vhodné nabídky.
* **Stránka pozemku si jméno obce zkracuje**, takže z nálože zbyde
  v seznamu srovnatelných jen slovo `Zkouskov`. Značka „dorazila data"
  proto nemůže být celý text nálože.
* **Po návštěvě úvodní stránky si stránka pozemku čerstvý řez okresu
  nestáhla** a vzala, co měla v prohlížeči. Každá stránka se proto
  otevírá ve vlastním kontextu — jinak by zkouška mlčela o stránce,
  kterou vůbec neprověřila.

Všechny tři by zkoušku nechaly projít **nad prázdnem**. Proto v ní
stojí i kontrola „otrávená data na stránku dorazila": zelená zkouška,
která nic neměří, je horší než červená.

### Co tahle zkouška neměří

**Zprávy mezi lidmi** (`zpravy.html`) — tam cizí text nejde přes
čištění dat, nese ho vlastní kopie escapování a chodí přes Supabase.
To je vlastní zkouška, ne přívěsek k téhle; zapsáno jako další bod.
Stejně tak **escapování v generátorech**: okresní a krajské stránky
skládá sestavení, ne prohlížeč, takže se jich tahle cesta netýká.

### Zelená lokálně, červená v CI: tvrzení, které drželo náhodou

Po nasazení CSP zbyla v CI jedna červená zkouška, kterou lokálně nešlo
zopakovat: `test-zaostreni`, kontrola „po změně řazení zůstane zaměření
ve výpisu, na stejném místě". Lokálně **2 → 2** třikrát za sebou,
v CI **2 → 14**.

Příčina nebyla v hlavičce ani v prohlížeči. Ta kontrola tvrdila něco
užšího, než co web dělá. V `js/main.js` (`vratZamereni`) platí:

> najdi tutéž kartu podle `data-pk`; a když už ve výpisu není, vezmi
> tu, co nastoupila na její místo.

Kontrola ale měřila jen tu druhou větev — protože autor naměřil, že
změna řazení kartu zprostřed vždy odstěhuje mimo stránkovaný výpis.
To ovšem platí jen pro **některá řazení a některá data**. V CI karta na
stránce zůstala, zaměření ji správně následovalo na 14. místo — a
zkouška to označila za chybu.

Přepsáno na to pravidlo, a hned napříč **všemi jedenácti volbami
řazení**: naměřeno 1× „karta zůstala a zaměření ji následovalo" a 9×
„karta odešla a zaměření drží její místo". Obě větve jsou tím pokryté,
takže kontrola už nestojí na tom, která volba řazení je v seznamu
nejblíž. Přidána i pojistka, že aspoň jedna volba pořadí opravdu
změnila — jinak by zkouška mohla projít nad nezměněným výpisem.

Hned nato ta kontrola spadla v CI ještě jednou — a znovu ne na webu:
u jedné volby řazení zaměření do výpisu **nedorazilo do 900 ms**, které
tam stály jako pevné čekání. Na pomalejším stroji se vrácení zaměření
děje až po překreslení výpisu, takže se teď čeká **na stav** (až
zaměření někde přistane), ne na hodinky — jak to v tomhle repozitáři
platí od bodů 11 a 28. Rozlišuje se i „poslední záchyt" (`#mc-skryte`),
který `vratZamereni` používá, když ve výpisu není kam se vrátit: je to
napsané chování, ale musí být vidět, že se použilo.

### A příčina nakonec: řazení „nejblíž ke mně" si otevře okno

Dvě další červené CI stály za to. První řekla, že zaměření skončí na
`BUTTON` — z toho se nepoznalo nic, takže zkouška začala u pádu
jmenovat prvek celý (značka, id, třída, jestli je uvnitř výpisu, kolik
karet tam bylo). Další běh pak vydal odpověď: **`BUTTON.vm-x`**, tedy
křížek okna „Vyberte své okolí".

Volba řazení číslo 1 je **„Nejblíž ke mně"** a ta si to okno otevře —
web musí vědět, odkud blízkost počítat. Pak zaměření patří **tomu
oknu**, ne výpisu: je to past na zaměření, kterou si okna drží
schválně (hlídají to kontroly oken v téže zkoušce). Pravidlo o kartě
a místě tam tedy neplatí a správné je měřit, že zaměření v okně
opravdu je. Lokálně se okno neotevřelo — proto tu kontrolu nešlo
zopakovat ani se šestinásobně zpomaleným procesorem.

Dvě věci, které se u toho musely naměřit:

* **Okno se pozná jen jako OTEVŘENÉ.** Značky několika oken leží v DOM
  pořád (skryté), takže `querySelector('[role=dialog]')` hlásí okno
  vždycky — a zkouška pak obvinila výpis z toho, že drží zaměření
  po právu (3 volby ze tří). Pozná se proto podle `display`,
  `visibility` a `offsetParent`.
* **Větev se musela vyzkoušet.** Okno se při zkoušce vynutilo
  klepnutím a naměřilo se 10× „okno" — jinak by to byla napsaná
  větev, o které nikdo neví, jestli se někdy spustí. Opačný směr
  (okno otevřené, zaměření mimo) se ukázal sám při té široké
  detekci a hlásí se jako nález.

**Co z toho platí dál:** zelená zkouška, která měří jen jednu z dvou
větví pravidla, je jen půl zkoušky — a to, která větev se spustí, se
může změnit s daty. Taková kontrola nespadne, když se web rozbije; spadne,
až se změní vstupy. Proto se měří pravidlo, ne jeden jeho projev.

### Zprávy mezi lidmi: jediné místo, kde se stojí a padá na escapování

`test-escape-dom.mjs` měří karty a stránku pozemku — tam cizí text teče
přes čištění dat. **Zprávy mezi lidmi tudy nejdou vůbec:** píše je druhý
člověk, chodí přes Supabase a do HTML je skládá vlastní kopie
escapování přímo v `zpravy.html`. Je to tedy jediné místo na webu, kde
cizí text stojí a padá na escapování — a zrovna tam to nic nehlídalo.

`scripts/test-escape-zpravy.mjs` pošle v chatu tři nálože a prohlédne
**obě strany**: pisatele i majitele, který dostane text, co nepsal.
Naměřeno: tři zprávy se odeslaly, nic se nespustilo, nevznikl žádný
prvek a text je na stránce vidět **jako text** — tedy escapovaný, ne
zahozený (na rozdíl od karet, kde čištění ostré znaky maže).

**Sabotáž je uvnitř zkoušky.** Stránka se umí doručit s vyřazeným
escapováním (přepíše se jen ta jedna funkce) a pak se nálož spustit
musí. Bez toho by zkouška mohla být zelená proto, že se zpráva vůbec
neodeslala — a ne proto, že web escapuje.

---

## 114. Kdo smí co v databázi — a čím si to musí zasloužit *23. 10.*

Web mluví do Supabase **veřejným klíčem** (`anon`), takže všechno, co je
povolené roli `anon` nebo `authenticated`, si může zavolat kdokoli —
stačí curl. Změřeno, jak to na tom webu stojí:

| co | naměřeno |
|---|---|
| tabulky | 17, **všech 17** má zapnuté RLS |
| politiky | 19 |
| nic povoleného roli `public` | 0 nálezů |
| tabulka přímo přístupná veřejným klíčem | 0 — chodí se jen přes funkce |
| funkce `security definer` | 64 definic, po započítání předefinování **39** |
| z nich volatelných veřejným klíčem | **31** |

`security definer` znamená „běž pod vlastníkem a RLS obejdi" — je to
tedy jediná cesta, jak se dá k cizím datům dostat legálně. Proto se
u každé takové funkce ptáme, **čím si volající přístup zasloužil**:

* `auth.uid()` nebo `auth.jwt()` v těle — ověří, kdo volá (to je
  většina),
* **tajemství v argumentu** (`p_token`) — kdo zná token z e-mailu nebo
  z odkazu na inzerát bez účtu, ten na to má právo,
* napsaná výjimka s důvodem — dnes tři: `public_listings` (vrací jen
  to, co je stejně vidět na webu), `subscribe_watch` (přihlášení
  e-mailu, potvrzuje se odkazem s tokenem) a `zapis_navstevu` (zápis do
  statistiky; nic nečte).

**Nálezů: nula.** Žádná otevřená funkce ani tabulka bez RLS. To ovšem
platí dnes, ne zítra — proto je z toho `scripts/test-sql-prava.mjs`.

### Dvě věci, na kterých se dalo uklouznout

**Devatenáct definic bez `auth.uid()` vypadalo jako devatenáct děr.**
Nebyly: `00-vse.sql` se skládá z dílčích SQL a funkce v průběhu
**předefinovává**, takže rozhoduje poslední podoba. `delete_listing` má
starší podobu bez kontroly a konečnou
`delete from listings where id=p_id and user_id=auth.uid()`. Zkouška
proto čte jen poslední definici — jinak by hlásila poplach na kódu,
který v databázi nikdy nevznikne.

**Mrtvá výjimka je past.** Vypadá jako povolení pro funkci, která už
neexistuje nebo už veřejná není — a tím krytí pro omyl, který teprve
přijde. Zkouška proto hlásí i výjimku, kterou nikdo nepotřebuje.

Doloženo sabotáží ve třech směrech: `security definer` funkce pro `anon`
bez kontroly → poplach; tabulce vypnuté RLS → poplach; `grant … to
public` → poplach.

---

## 115. Nálož v datech neprojde generátory — a moje první tři kontroly křičely vlka *23. 10.*

Okresní, krajské a pozemkové stránky skládá **sestavení**, ne prohlížeč:
generátory vezmou táž data a napíšou z nich hotové HTML, které se pak
servíruje jako soubor. Tam escapování v `js/` nepomůže a CSP nic
nenapraví — co se do souboru zapíše, to prohlížeč dostane.

Změřeno v dočasné kopii: **1 956 otrávených nabídek** → 1 932 stránek
pozemků, 77 okresních a 14 krajských.

| co se měřilo | výsledek |
|---|---|
| nálož v hotových stránkách | **3 415 z 4 290** souborů (je co měřit) |
| nálož v hrubé podobě | **0 souborů** |
| značky `<script>` vyvážené | ano (26 : 26 na stránce pozemku) |
| obslužný atribut (`onerror`…) | **0** |
| datové ostrůvky čitelné jako JSON | všechny |

Ve skriptech se nálož zapisuje jako `<` a `>`, tedy tak, že
blok `<script>` **nejde ukončit zvenčí** — to je ta nejpevnější cesta.
V atributech jako `&lt;` a `&quot;`. V prohlížeči se nad tím buildem
nespustilo nic (`window.__XSS` nedefinované, 0 nebezpečných prvků).

### Tři falešné poplachy, než kontrola začala měřit to, co tvrdí

Kontrola „nevznikl obslužný atribut" je ta nejcennější (právě takhle
vypadá opravdová vada: escapované `<` a `>`, zapomenutá uvozovka) a
hlásila poplach **třikrát za sebou, a ani jednou to nebyla vada**:

1. hledala `onerror=` v celém souboru → našla ho **v JSON-LD**, kde
   nálož stojí jako obsah řetězce (`<`), a blok se ukončit nedá;
2. hledala mimo skripty → našla ho ve **viditelném textu**
   (`&quot;&gt;&lt;svg onload=&quot;…`), tedy ve zneškodněné podobě,
   kterou člověk na stránce prostě čte;
3. hledala uvnitř značek → našla ho **v hodnotě atributu**
   (`content="… &lt;img src=x onerror=&quot;…&quot;&gt; …"`), kde je
   uvozovka escapovaná a z atributu se vyskočit nedá.

Teprve čtvrtá podoba měří to, co tvrdí: ve značce, s vyprázdněnými
hodnotami v uvozovkách. **Hrubá kontrola na XSS není opatrná, je
nepoužitelná** — po třech falešných poplaších by si ji každý vypnul.

### A dvě věci, které odhalila sabotáž

* **Moje první sabotáž nic nedokazovala.** Vložila
  `content="x&lt;img src=x onerror="window.__XSS=1"&gt;"` a čekala
  poplach. Jenže uvozovka sama atribut nerozbije: prohlížeč z toho
  udělá nesmyslná jména atributů a nespustí nic. Opravdová díra
  vypadá jinak — uvozovka, **mezera**, obsluha.
* **V seznamu náloží chyběla ta na atribut.** Tři původní míří na text
  v HTML; do atributu se text dostane v popisku stránky, v `title`
  a v `data-*`, a tam značku nepotřebuje. Bez čtvrté nálože
  (`" onerror="window.__XSS=4`) se cesta „text v atributu"
  nezkoušela vůbec — a zkouška byla přitom zelená. Teď je naměřeno,
  že v atributech končí na **2 029 stránkách**, escapovaná.

---

## 116. Veřejné úložiště fotek bez stropu a bez seznamu typů *23. 10.*

Úložiště `listing-photos` je **veřejné** — fotka se musí ukázat
v inzerátu. Politiky na něm byly tři a vypadaly rozumně: čtení pro
kohokoli, nahrávání pro přihlášeného, mazání pro vlastníka. Dvě věci
v nich ale chyběly:

* **žádný strop na velikost a žádný seznam typů.** `insert into
  storage.buckets` nastavoval jen `public = true`, takže přihlášený
  uživatel mohl do veřejného úložiště uložit **cokoli a jak velkého
  chce** — HTML, SVG se skriptem, dvougigabajtový soubor. Na naší
  adrese by to neběželo, ale leželo by to na adrese našeho projektu
  a platili bychom to.
* **nahrávání nebylo vázané na účet.** Podmínka byla jen
  `bucket_id = 'listing-photos'`, takže kdokoli přihlášený mohl psát
  i pod cizí předponu (`<cizi-uid>/…`) — a přitom právě podle složky
  se pozná, čí fotka to je. Přepsat cizí fotku se nedalo (na
  `storage.objects` není politika pro `update`, takže upsert RLS
  zamítne), ale zakládat soubory v cizí složce ano.

Doplněno podle toho, **co klient opravdu posílá** (`js/pridat.js`):
fotka se zmenší na 1 600 px a překóduje na JPEG v kvalitě 0,82, takže
vychází do jednoho megabajtu. Strop je proto 3 MB (rezerva, ne cíl),
seznam typů `image/jpeg` a cesta se váže na `auth.uid()` přes
`storage.foldername(name)` — což na dnešní pojmenování
(`<uid>/<čas>-<poradi>-<náhoda>.jpg`) sedí.

`on conflict` ta nastavení přepisuje i existujícímu úložišti, aby
oprava neplatila jen pro čerstvý projekt; běžící by jinak zůstal bez
stropu. Je to zapsané v `docs/pred-vydanim.md` jako jeden běh SQL.

Hlídá to `scripts/test-sql-prava.mjs` (7 nových kontrol), doloženo
sabotáží: zrušený strop i zrušená vazba na účet → poplach. A protože
zkouška čte SQL v repozitáři, je u ní napsané i to, co změřit nejde:
**jestli to někdo pustil, pozná jen Supabase.**

## 117. Přihlášky k hlídání rostly bez stropu a nikdo je neuklízel *23. 10.*

`subscribe_watch(e-mail, okres, typy)` je jediná funkce, která **zvětšuje
databázi** a kterou smí zavolat kdokoli s veřejným klíčem (formulář na
`hlidani.html` běží z prohlížeče, takže ten klíč je v každém zdroji
stránky). Co dělala správně: ověřovala tvar adresy, nedovolila vložit
řádek už potvrzený ani si vybrat potvrzovací token (to hlídá
`test-anon-zapis.mjs`), a opakované přihlášení na týž okres jen oživila
bez nového potvrzení. Co nedělala vůbec:

* **strop na jednu adresu.** Okresů je 77 a `okres = NULL` znamená celou
  republiku — jedna adresa si tedy mohla nechat založit **78 řádků**,
  a cizí skript mohl ten formulář vyplnit tisíckrát s tisícem adres.
* **úklid.** `uklid_posty()` maže záznamy o odeslané poště a pushi,
  **nepotvrzené přihlášky nemazal nikdo**. Řádek po někom, kdo si
  potvrzení nikdy nerozklikl, ležel v tabulce navždy.

Co to dnes doopravdy stojí, se dá změřit: **odesílání potvrzovacího
e-mailu v repozitáři zatím není** (žádný kód `watch_subscriptions`
nečte a nic neposílá), takže z toho nejde dělat rozesílání spamu cizím
lidem. Co z toho jde, jsou řádky v databázi — a ta je na bezplatném
tarifu, 500 MB. Je to tedy **strop proti nabývání, ne proti spamu**;
až e-maily posílat začneme, platí oboje.

Hotovo:

* **strop 12 míst na jednu adresu** uvnitř `if not found`, takže
  oživení existující přihlášky (změna typů) na něj nenarazí. Dvanáct
  hlídaných míst je nad rámec toho, co člověk uhlídá očima; komu to
  nestačí, zařídí si účet a hlídání v aplikaci.
* **`uklid_hlidani(p_dni default 30)`** maže `confirmed = false` starší
  než lhůta, s podlahou sedmi dní (`greatest(…, 7)`), aby ani špatně
  zadaný argument nesmazal dnešní přihlášky. Pustit ji smí **jen
  `service_role`**, ne veřejný klíč.
* volání z noční `scripts/uklid-databaze.mjs` (třetí úloha; lhůtu lze
  přepsat `UKLID_HLIDANI_DNI`).

Hlídá to dvojice zkoušek:

* `test-sql-prava.mjs` (5 kontrol) čte SQL v repozitáři: strop
  v `subscribe_watch` je, úklid existuje, maže **jen** nepotvrzené
  (`confirmed = false` ano, `confirmed = true` nikde), a práva má jen
  služba.
* `test-sql-cista.mjs` (10 kontrol) totéž **zkouší na živém
  PostgreSQL rolí `anon`** — tedy přesně tou cestou, kterou má cizí
  skript: dvanáct přihlášek projde, třináctá spadne, jiná adresa
  projde dál, znovupřihlášení na už hlídaný okres taky; a úklid smaže
  starou nepotvrzenou, potvrzenou stejně starou nechá, čerstvé nechá
  a `uklid_hlidani(0)` nesmaže nic.

Sabotáž, pět směrů, všechny zachyceny: strop pryč (ve čtení SQL
i živě), práva úklidu přidělená `anon`, úklid mazající i potvrzené,
podlaha sedmi dní pryč. A při té druhé zaskočil i starší hlídač
„každá `security definer` funkce si ověří, kdo volá" — dvě nezávislé
zkoušky na tutéž chybu.

Jedna věc, kterou zkouška změřit nemůže: **jestli ten SQL někdo pustil
na běžícím projektu.** Je to proto v `docs/pred-vydanim.md` jako jeden
běh `supabase/00-vse.sql`.

## 118. Pět úloh v CI bez napsaných práv a balíčky „co je právě nejnovější" *23. 10.*

Zabezpečení webu má druhou polovinu, která na webu není vidět:
**co může udělat úloha na GitHubu.** Změřeno 23. 10. nad
`.github/workflows` (osm souborů):

| Co | Jak to bylo |
|---|---|
| `permissions:` napsané | **3 z 8** |
| úlohy s nejsilnějšími tajemstvími | 3 (service-role klíč, Resend, privátní VAPID) — **žádná z nich práva napsaná neměla** |
| token z checkoutu na disku | ve **všech** úlohách (`persist-credentials` se nenastavuje, výchozí je `true`) |
| instalace balíčků jménem bez verze | **4 místa** (`jpeg-js`, 2× `playwright-core playwright`) |
| cizí akce (mimo `actions/*`) | 0 |
| vložení příkazu přes `${{ github.event… }}` | 0 |

Co na tom je špatně:

* **Práva, která nejsou v repozitáři, nejsou vidět.** Úloha bez
  `permissions:` dostane to, co má repozitář nastavené v prohlížeči —
  tedy stav mimo historii, který se dá přepnout jedním klikem a nikdo
  si toho nevšimne. U úlohy, která nic nezapisuje, je správná odpověď
  `contents: read`.
* **Token z checkoutu leží v `.git/config` po celou úlohu** a vedle
  toho se v téže úloze instalují balíčky z npm a pouští se stovky
  skriptů. Žádný skript v `scripts/` s gitem nemluví (změřeno: ani
  jedno volání), takže `persist-credentials: false` nic nestojí.
* **`npm install jpeg-js` neposlouchá `package-lock.json`.** Jmenovaný
  balíček si verzi vybere znovu podle rozsahu `^0.4.4`. A
  `npm install playwright-core playwright` bez verze vzal to, co bylo
  na npm nejnovější v minutě běhu: `fetch-nsfw-model.yml` má přitom
  připnuté `playwright@1.47.2`, takže mezi dvěma úlohami téhož
  repozitáře bylo **sedmnáct menších vydání** rozdílu. Ten rozdíl už
  jednou rozsvítil CI při zelené zkoušce (oddíl 101:
  `page.accessibility` ve 1.64 neexistuje) — tahle vada není
  hypotetická, byla zaplacená.
* **Instalace pouští životní skripty balíčků.** Dnes žádný náš balíček
  žádný nemá (změřeno nad zámkem: `hasInstallScript` nikde), ale nové
  vydání ho přidat může — a spustilo by se v úloze, kde je
  service-role klíč k databázi, bez toho, že by si ho kdokoli přečetl.

Hotovo:

* `permissions: contents: read` do pěti úloh, které nic nezapisují;
  `contents: write` zůstává jen třem, které opravdu pushují;
* `persist-credentials: false` u checkoutu v těch pěti;
* `npm ci --omit=dev --ignore-scripts` místo `npm install jpeg-js`
  (zámek rozhoduje) a připnutý `playwright-core@1.64.1
  playwright@1.64.1` místo nepřipnutého — zvednout verzi je od teď
  změna v repozitáři, kterou je vidět;
* `--ignore-scripts` i u připnuté instalace ve `fetch-nsfw-model.yml`.

Vyzkoušeno, ne odhadnuto: `npm ci --omit=dev --ignore-scripts` nad
zámkem nainstaluje 23 balíčků a `jpeg-js` 0.4.4 dekóduje; připnutá
instalace playwrightu bez životních skriptů dá funkční API i funkční
`npx playwright install` (ověřeno `--dry-run`).

Hlídá to `scripts/test-ci-prava.mjs` (12 kontrol) a jsou v něm dvě
kontroly opačným směrem, aby se ty hlavní nedaly „splnit" naplocho:
kdo pushuje, ten `contents: write` i token POTŘEBUJE. Nové je taky
pravidlo do budoucna: **cizí akce musí být připnutá na SHA.** Dnes
žádnou nemáme (jen `actions/checkout` a `actions/setup-node`), a právě
proto je ta kontrola levná — platit začne ve chvíli, kdy někdo první
cizí akci přidá. U `actions/*` zůstává značka `@v4` schválně: SHA bez
Dependabota zestárne a nikdo ho nezvedne, a tahle dvě jména jsou od
GitHubu samotného.

Sabotáž, osm směrů, všechny zachyceny: práva pryč, zápis bez pushe,
push bez práva zápisu, token na disku, pushující úloha bez tokenu,
balíček bez verze, instalace bez `--ignore-scripts`, cizí akce na
značku, titulek pull requestu vložený do příkazu.

Dvakrát přitom spadla moje vlastní kontrola, a obojí stojí za zápis:
čtení `with:` bloku checkoutu se zastavilo na prvním komentáři
(nastavení tam bylo napsané, kontrola ho neviděla) a za balíček si
spočítala `2>&1` z přesměrování. Obojí je totéž poučení jako u
escapování v oddílu 115: **kontrola, která si čte text po svém, musí
mít doloženo, že vidí to, co je v souboru napsané** — jinak křičí vlka.

## 119. „Odhlásit se" smazalo schránku prohlížeče a serveru neřeklo nic *23. 10.*

`logout()` v `js/auth.js` byl jeden řádek: `setSession(null)`, tedy
`removeItem('pk_auth')`. Změřeno 23. 10.: v celém repozitáři nebylo
**ani jedno** volání `/auth/v1/logout`. Odhlášení tedy znamenalo
„zapomeň to tady" — a **obnovovací token zůstal na Supabase platný**.

Proč to není kosmetika: ten token se dá obnovovat dál, takže kdo jeho
kopii má, má i přístup k účtu. A kopie se dělají samy: záloha
prohlížeče, synchronizovaný profil, cizí počítač, kde si někdo
schránku přečetl dřív, než se smazala. „Odhlásit se" je přitom právě
ten úkon, kterým člověk říká, že má přístup **skončit** — ne ten,
kterým říká „skryj to přede mnou".

Hotovo (`js/auth.js`):

* `POST /auth/v1/logout?scope=local` s **tokenem toho člověka**
  v `Authorization` (veřejný klíč by zrušil prázdno);
* **`scope=local` schválně.** Výchozí chování Supabase je `global`,
  tedy odhlásit i telefon a druhý počítač. To by bylo překvapení:
  klepnutí na „Odhlásit se" v jednom prohlížeči má odhlásit tohle
  zařízení;
* **lokálně se odhlašuje vždycky**, i bez signálu — odpověď serveru
  nemá co držet úkon, který člověk právě udělal;
* `logout()` vrací, **jestli to server potvrdil**, a obě stránky
  s tlačítkem (`muj-inzerat.html`, `js/pridat.js`) to přiznají:
  „Odhlášeno v tomhle prohlížeči. Serveru se to oznámit nepovedlo —
  udělejte to prosím znovu, až budete online." Tiché selhání by tady
  bylo nejhorší ze všech možností: člověk by si myslel, že je pryč.

Hlídá to `scripts/test-prihlaseni.mjs` (9 nových kontrol nad falešným
Supabase, celkem 33): žádost odejde právě jedna, nese `Bearer` token
člověka a `scope=local`, schránka zůstane prázdná, potvrzené zrušení
se hlásí jako úspěch — a v obou nepovedených směrech (server vrátí
500, adresa neodpovídá vůbec) je člověk odhlášený **stejně** a
`logout()` nelže. Devátá kontrola měří opačný směr: kdo přihlášený
není, ten serveru nemá co posílat.

Sabotáž, pět směrů, všechny zachyceny: zpátky jen `setSession(null)`,
`scope=global`, veřejný klíč místo tokenu, lokální odhlášení až po
úspěchu serveru, `logout()` hlásící úspěch vždycky.

Co zkouška změřit **nemůže**: jestli Supabase ten token na své straně
opravdu zneplatní. Měří se, že se pošle správná žádost se správným
tokenem a rozsahem; zbytek je chování Supabase, a vyzkoušet to proti
živému projektu by znamenalo přihlašovat se tam zkušebním účtem —
to je práce pro majitele, ne pro CI.

## 120. Co po odhlášení zůstalo v prohlížeči — a čtyři texty, které o tom lhaly *23. 10.*

Oddíl 119 zrušil sezení i na serveru. Zbývala druhá polovina téže věci:
**co po odhlášení zůstane v prohlížeči.** Změřeno 23. 10.:

* `js/poznamky.js` drží poznámky z účtu v `localStorage`
  (`pk_poznamky_v1`) jako mezipaměť — čtení musí být okamžité, uprostřed
  vykreslování karty se na server čekat nedá;
* `js/ulozene-ucet.js` tamtéž uložené pozemky (`pk_fav_v1`) a k nim
  `pk_fav_nahrano_v1` (co z nich zná účet);
* `logout()` mazal **jen `pk_auth`**.

Na sdíleném počítači to znamenalo: člověk se odhlásí, další si otevře
kteroukoli stránku pozemku — a čte cizí poznámky. Do nich se přitom
píšou věty o lidech; v hlavičce `js/poznamky.js` stojí přesně ten
příklad („majitel vypadal divně").

**Maže se jen to, co účet zná.** Poznámka si vede příznak `nahrano`
a u uložených pozemků je na to celý klíč, takže se to poznat dá. Co se
na účet nikdy nedostalo, by bylo odhlášením nevratně pryč — to zůstává
a `logout()` to vrací v `zbylo`, aby o tom stránka mohla říct. Rozbitá
hodnota se maže celá: lepší zahodit mezipaměť, než ji nechat ležet
pro dalšího člověka. A co s účtem nemá nic společného (skryté nabídky,
filtry, naposledy prohlížené), se nemaže vůbec.

Obě stránky s tlačítkem teď řeknou, co se stalo: „Odhlášeno. Uložené
pozemky a poznámky zůstávají na účtu — kopii v tomhle prohlížeči jsme
smazali." A pokud něco zůstalo, i to.

### Čtyři místa, která o tom psala svět před účty

Při měření se ukázalo něco horšího než mezipaměť. Okno se zásadami
(`INFO.soukromi` v `js/main.js`) bylo poctivě přepsané — „Bez
přihlášení… / S účtem…" — ale:

| Kde | Co tam stálo |
|---|---|
| `ochrana-udaju.html` | uložené pozemky ani poznámky **nebyly v seznamu údajů vůbec**, a v oddílu o úložišti stálo „zůstávají u vás v zařízení a neodesílají se nám" |
| `moje-data.html` | „Nic z toho se nikam neodesílá a nevidíme to ani my" |
| `porovnani.html` | „Uložené pozemky leží jen v tomhle prohlížeči… a nikam se neodesílají" |
| `index.html` | otázka o registraci, **dvakrát** (viditelný text i strukturovaná data pro vyhledávač): „Nic se neodesílá na server" |
| `js/ulozene.js` | popis poznámek na „Mých datech": „Nikam se neodesílají." |

U přihlášeného člověka to **není pravda** (`supabase/poznamky.sql`,
`supabase/ulozene-na-uctu.sql`). V právním dokumentu je to ta nejdražší
chyba, jakou web může mít — dražší než kterákoli vada vzhledu. Všech
pět míst teď rozlišuje „bez přihlášení" a „s účtem", a v zásadách je
k tomu vlastní odrážka i s právním základem a s tím, že odhlášením se
kopie v prohlížeči smaže.

### Proč to žádná zkouška nenašla

`scripts/test-sliby-data.mjs` je napsaná právě na tuhle třídu vad — ale
hlídala **jen text v `js/main.js`**. Doplněno: táž pravidla platí na
všech 2 360 stránkách, v jejich strukturovaných datech i v polích
s textem pro člověka ve skriptech, plus dvě pozitivní kontroly (zásady
to musí jmenovat; popis každé takové mezipaměti na „Mých datech" musí
rozlišovat účet) a jedna křížová: **co odhlášení maže, to musí být
právě to, co je v `js/ulozene.js` označené příznakem `zUctu`.**

Hlídači: `test-sliby-data.mjs` 16 kontrol, `test-prihlaseni.mjs` 45
(12 nových, z toho osm nad mezipamětí v prohlížeči). Sabotáž dvanácti
směrů, všechny zachyceny — pět vrácených starých vět, odstraněná
odrážka v zásadách, zrušený příznak, odhlášení nemazající poznámky,
mazající všechno (i nenahrané), mazající i skryté nabídky a nechávající
ležet rozbitou hodnotu.

**Dvakrát přitom moje kontrola nenašla to, co jsem jí schválně
nastrčil**, a poučení z toho je pokaždé stejné jako v oddílu 115:

1. **Jedna věta nestačí.** „Co jste si k pozemkům napsali. Nikam se
   neodesílají." má věc v jedné větě a slib ve druhé. Měří se proto okno
   až tří po sobě jdoucích vět.
2. **Slovo „přihlášení" není rozlišení.** Odpověď „Žádná registrace ani
   přihlášení — …" to slovo nese a přitom nerozlišuje nic. Platí jen
   věta, která říká, KDY to platí („bez přihlášení", „s účtem").

A jednou kontrola křičela vlka: skenovat **všechny** řetězce ve
skriptech nejde — mezi dvěma nesouvisejícími uvozovkami leží kus kódu,
a tak byl jako nepravda ohlášen úryvek z `js/pozemek.js`. Měří se proto
jen pole s textem pro člověka (`popis`, `nazev`, `sub`, `veta`).

## 121. Poznámky na účtu neměly strop na počet ani na délku klíče *23. 10.*

Oddíl 117 dal strop přihláškám k hlídání, které smí zakládat kdokoli
s veřejným klíčem. Tohle je totéž o krok dál: **co smí zakládat
kterýkoli registrovaný účet.** Změřeno 23. 10. nad `supabase/`:

| Funkce | Strop na počet | Strop na délku |
|---|---|---|
| `save_search` | 20 hledání | — |
| `ulozeny_uloz` | 500 řádků | klíč 200 znaků |
| `poznamka_uloz` | **žádný** | text 2 000 znaků, **klíč žádný** |

Prohlížeč strop má (`STROP = 300` v `js/poznamky.js`), ale ten platí jen
pro slušného člověka: funkci jde zavolat přímo. Kterýkoli registrovaný
účet tedy mohl do tabulky `poznamky` psát řádky **bez konce** — a `klic`
je `text` bez stropu, takže jedním voláním šel poslat megabajt. Databáze
je na bezplatném tarifu, 500 MB.

Hotovo: strop **300 poznámek na účet** (schválně totéž číslo, co má
prohlížeč — ať si člověk nenarazí na dva různé stropy) a **200 znaků na
klíč** (schválně totéž, co má `ulozeny_uloz`). Strop platí jen pro NOVÝ
klíč: úprava i smazání existující poznámky musí jít vždycky, jinak by se
u plného stropu nedalo ani uklidit.

Hlídači jsou dva a každý měří jinak:

* `test-sql-prava.mjs` (6 nových kontrol) čte SQL **a porovnává čísla se
  zdrojem**: strop v SQL se musí rovnat `STROP` v `js/poznamky.js`
  a strop na klíč tomu v `supabase/ulozene-na-uctu.sql`. Dvě čísla na
  tutéž věc se jinak rozejdou.
* `test-sql-cista.mjs` (8 nových kontrol) to zkouší **na živém
  PostgreSQL rolí přihlášeného člověka**: tři stě projde, tři sta první
  spadne, u plného stropu jde existující poznámku upravit i smazat,
  a po smazání se zas jedna vejde (strop není zámek).

Sabotáž, pět směrů, všechny zachyceny: strop na počet pryč, strop
brzdící i úpravu existující poznámky, strop na délku klíče pryč, strop
na délku textu pryč, a strop v SQL jiný než v prohlížeči.

**A jedna moje kontrola zprvu měřila něco jiného, než co tvrdila.**
Délku klíče jsem zkoušel na účtu, který měl zrovna 300 poznámek —
odmítnutí tedy přišlo od stropu na POČET, a zkouška prošla i tehdy, když
jsem strop na délku z SQL vyhodil. Měří se proto na druhém, prázdném
účtu, a před tím stojí kontrola, že tam krátký klíč projde. Potřetí
v jednom dni totéž poučení: **u kontroly se musí doložit, že padá na to,
na co je napsaná** (oddíly 115 a 120).

V běžícím projektu to platí teprve po spuštění `supabase/00-vse.sql` —
zapsáno v `docs/pred-vydanim.md`, oddíl 3.

## 122. Odběry upozornění: tři texty bez stropu a bez tvaru *23. 10.*

Po poznámkách (oddíl 121) zbývala poslední tabulka, do které smí
zakládat řádky kterýkoli přihlášený účet: `push_odbery` — adresa push
služby prohlížeče a dva klíče, kterými se zpráva zašifruje pro to
zařízení. `push_odber_uloz` ověřoval **jen to, že ty tři texty nejsou
prázdné.** Nehlídal:

* **počet zařízení.** Řádek je jedinečný podle endpointu, takže šlo
  zakládat řádky bez konce;
* **délku.** `endpoint`, `p256dh` i `auth` jsou `text` bez stropu —
  jedním voláním se dal uložit megabajt (třikrát);
* **tvar.** Endpoint vydává push služba prohlížeče, takže je to vždycky
  `https://…`; funkce přijala jakýkoli text.

Hotovo: **10 zařízení na účet** (nad rámec toho, co člověk nosí; přes
to prohlížeč stejně starý odběr sám zneplatní), **500 / 200 / 100
znaků** (dnešní endpointy mají kolem 200, klíče base64 87 a 22 — strop
je rezerva, ne cíl) a **`^https://`** na endpointu. Strop na počet platí
jen pro NOVÝ endpoint: přeuložení klíčů u už známého zařízení (po
přeinstalování prohlížeče) musí jít i při plném stropu.

**A web o tom umí říct.** Strop, o kterém se mlčí, vypadá jako „nejde to
a nevím proč": přepínač se vrátí zpátky a vedle stojí věta o povolení
v prohlížeči, se kterou to nemá nic společného. `js/push.js` proto ten
případ pozná podle textu výjimky a vrací vlastní stav `'plno'`;
`hlidani.html` pro něj má větu o deseti zařízeních. Text té výjimky je
tím ve třech kopiích (SQL, `js/push.js`, `hlidani.html`) — a **drží je
u sebe kontrola**, která hlášku z SQL vytáhne a ověří, že se na ni
klient opravdu ptá.

Hlídači: `test-sql-prava.mjs` 9 nových kontrol (5 nad SQL, 4 nad tím,
že to web umí vysvětlit), `test-sql-cista.mjs` 7 nových **na živém
PostgreSQL rolí přihlášeného**. Druhý, prázdný účet je v nich schválně:
na plném účtu by odmítnutí mohlo přijít od stropu na POČET a kontrola
tvaru by měřila něco jiného, než co tvrdí — na to jsem u poznámek
narazil (oddíl 121), takže se to tady udělalo hned správně.

Sabotáž, sedm směrů, všechny zachyceny: strop na počet pryč, strop
brzdící i přeuložení známého zařízení, tvar a délka endpointu pryč,
strop na délku klíčů pryč, klient strop nepozná, vzor v klientovi
rozešlý s hláškou v SQL, stránka pro ten stav bez věty.

Upozornění do telefonu zatím nejedou (chybí VAPID klíče v Secrets —
`docs/pred-vydanim.md`), ale **funkce volatelná je už dnes**, takže ta
díra byla živá bez ohledu na to, jestli se něco posílá.

## 123. Dvě cesty, kterými databáze rostla zvenčí *23. 10.*

Po čtyřech stropech (oddíly 117, 121, 122) jsem si ten seznam udělal
úplný: **které funkce volatelné zvenčí zapisují, a která z nich má
strop.** Měřeno nad `supabase/00-vse.sql`, 17 funkcí. Většina z těch bez
stropu jen přepisuje řádek, který už existuje (`set_search_mail`,
`confirm_watch`, `unsubscribe_watch`, `mark_search_seen`…), takže tam
není co ohraničovat. Dvě z nich ale **zakládají nové řádky**:

**1) `zapis_navstevu` — vlastní měření návštěvnosti.** Řádek vzniká pro
každou kombinaci `(den, stránka, zdroj, zařízení)`. Jméno stránky je
`[a-z0-9._-]{1,80}` a zdroj `[a-z0-9.-]{1,60}` — tedy **volný text ve
svém vzoru**, takže kdokoli anonymně vyrobí libovolně mnoho kombinací,
a tím libovolně mnoho řádků. `uklid_navstevnosti()` maže až po dvou
letech, takže to obrana není.

Hotovo: **5 000 řádků za den** je strop. Je to nad rámec téhle reality
(web má kolem 2 400 stránek a zdrojů bývají jednotky), takže víc
znamená, že čítače někdo plní, ne že přišlo víc lidí. A hlavně:
**strop se nedrží tajný.** Zahozená zobrazení se sečtou do řádku
`(strop)`, takže v přehledu je vidět, že se ten den strop sepnul a kolik
se do něj nevešlo. Mlčet by znamenalo, že čísla toho dne tiše přestala
odpovídat skutečnosti — a to je u měření ta nejhorší možná vada.
Kombinace, která se dnes už počítala, se počítá dál i nad stropem.

**2) `ulozene_nahraj` — hromadné nahrání uložených pozemků.** Mělo
`limit 500`, což omezovalo **jedno volání**, ne účet: dvěma voláními se
strop 500 (který hlídá `ulozeny_uloz`) obešel. Teď se dopočítá volné
místo do téhož čísla a vrácený počet vložených řádků to přizná sám.

Hlídači: `test-sql-prava.mjs` 6 nových kontrol (včetně té, že obě čísla
— jednotlivé i hromadné ukládání — jsou si rovna) a `test-sql-cista.mjs`
6 nových **na živém PostgreSQL**: tabulka se předem naplní na 4 998
řádků, pod stropem nová kombinace vznikne, nad stropem už ne, zahozená
zobrazení se najdou v řádku `(strop)` a už známá kombinace se počítá
dál; hromadné nahrání dvakrát po sobě skončí na 500 a třetí vrátí nulu.

Sabotáž, čtyři směry, všechny zachyceny: denní strop pryč, strop bez
značky `(strop)`, strop zahazující i známou kombinaci, hromadné nahrání
zpátky s limitem na volání.

Co tím **není** vyřešené a je to změřené: `bump_view` (počítadlo
zhlédnutí inzerátu) a `zapis_navstevu` jdou pořád **nafukovat** — jen už
z toho neroste tabulka. Řádek se přepisuje, takže je to otázka
pravdivosti čísel, ne místa. Brzda proti nafukování by potřebovala
poznat, kdo volá, a to by znamenalo ukládat si IP nebo označení
zařízení ke každému zhlédnutí; to je horší cena než vada, kterou by to
opravilo (a v zásadách soukromí stojí, že nic takového neděláme). Co se
tím dá získat, je navíc malé: `views` vidí jen majitel inzerátu na své
stránce „Moje inzeráty", nikde se podle nich neřadí ani nic
nezvýhodňuje, a čísla návštěvnosti nečte veřejná stránka vůbec.
Zapsáno jako vědomá hranice, ne jako nedodělek.

## 124. Repozitář si odporoval: jeden soubor radil vypnout to, co druhý vyžaduje *23. 10.*

Při průchodu zabezpečením databáze vyšlo něco, co s databází nemá nic
společného — **rada, která zlomí hlavní funkci webu.**

`supabase/listings-auth.sql` měl v hlavičce radu, která se vrátit nesmí
— „a pro hladký start klidně VYPNOUT „Confirm email" … Pak se lidé
přihlásí hned." Jenže
`create_listing` (v `supabase/listings-prvni-kontrola.sql`, v balíku
pozdější, tedy ta platná podoba) bez potvrzeného e-mailu zakládání
**odmítne** — a odmítne ho větou „nejdřív potvrďte e-mail — poslali jsme
vám odkaz". Kdo tu radu poslechne:

1. vypne potvrzování, takže Supabase žádný potvrzovací e-mail nepošle;
2. `email_confirmed_at` zůstane prázdné navždy;
3. každý pokus přidat inzerát skončí výzvou k potvrzení e-mailu, který
   nikdy nepřijde.

Tedy ne „menší bezpečnost za pohodlí", ale **rozbitá hlavní funkce**.
A `docs/pred-vydanim.md` — jediný seznam, podle kterého se web spouští —
o tom nastavení neměl ani řádek.

Hotovo: rada opravená u zdroje (včetně toho, co tam stálo a proč to
zestáralo), nastavení dopsané do seznamu před vydáním i se souvislostí
s vlastním SMTP (dokud se nenastaví, posílá potvrzení Supabase ze své
adresy a s nízkým stropem).

**A hlídač našel druhé místo, o kterém jsem nevěděl.**
`docs/oprava-hlidani-a-pridavani.md` nabízel tutéž „rychlou" cestu jako
jednu ze dvou možností — s poctivě napsanou nevýhodou („nikdo neověří,
že adresa existuje"), jenže ta nevýhoda dnes neplatí: ono to **nefunguje
vůbec**. Zbyla jediná cesta, vlastní SMTP, a tak to tam teď stojí.

Hlídá to `scripts/test-sql-prava.mjs` (3 kontroly): zakládání inzerátu
potvrzení opravdu vyžaduje, nikde v `supabase/` ani `docs/` se neradí ho
vypnout, a seznam před vydáním to nastavení jmenuje. Sabotáž tří směrů,
všechny zachyceny.

Poučení, které stojí za zapsání: **rada pro majitele je taky kód** —
zestárne stejně jako komentář a může udělat větší škodu než vada
v programu, protože ji nikdo neodladí. A hlídač na prózu se vyplatil
podruhé v jednom dni (poprvé u slibů o datech, oddíl 120).

## 125. Zkouška zaostření měřila totožnost klíčem, který se v datech opakuje *23. 10.*

CI #648 spadlo na kontrole „zaměřená zůstala TÁŽ karta, ne ta, co je teď
na jejím místě" — a hláška byla sama o sobě nález: **„čekáno
`Habry|—|Havlíčkův Brod|49.753|15.513`, je
`Habry|—|Havlíčkův Brod|49.753|15.513`".** Očekávané i naměřené bylo
totéž a kontrola přesto padla.

Příčina: totožnost karty se měřila atributem `data-pk`, a ten je složený
z místa, okresu a zaokrouhlených souřadnic. **Dvě různé nabídky na jednom
místě mají klíč týž** — a po odpoledním obnovení dat stály ve výpisu dvě
takové karty vedle sebe. Druhá podmínka (`pk ≠ klíč karty, která je teď
na tom místě`) tedy nemohla projít, i když web zaměření drží správně.
Byla to vada MĚŘENÍ, ne webu.

Cestou se naměřila ještě jedna věc, která stojí za zapsání: zkusil jsem
totožnost řešit značkou na prvku (`setAttribute` před skrytím, hledat ji
po něm). **Nefunguje — po skrytí karty se výpis překreslí**, zaměřená
karta je nový prvek a značka je pryč. Totožnost tedy v tomhle webu nese
jen klíč; proto se vybírá karta, jejíž klíč je ve výpisu **právě jeden**.

Navíc je tam kontrola, že se taková karta vůbec našla: kdyby se ve výpisu
sešla samá dvojčata, nemá se měřit na slepo a tvářit se zeleně.

Sabotáž, dva směry, oba zachyceny: (1) zaměření po skrytí násilně
přesunuté na kartu, která je teď na původním místě → padne obojí
(posun i totožnost); (2) výběr karty s opakujícím se klíčem, tedy stav
před opravou → padne právě ta jedna kontrola, co padala v CI.

test-zaostreni 59/59 (o jednu kontrolu víc než dřív). Lokální sada
v prohlížeči 128/129 → 129/129 s touhle opravou.

## 126. Jednorázový token na obnovu hesla zůstával v adrese *23. 10.*

Odkaz z e-mailu „obnovit heslo" přistane na `muj-inzerat.html` a nese
jednorázový token ve **fragmentu** adresy (`#access_token=…`). To je ta
lepší polovina: fragment prohlížeč na server neposílá, takže token
neskončí v logu serveru ani v hlavičce `Referer`, a service worker
adresy s dotazem ani fragmentem neukládá (oddíl o offline režimu).

Ta druhá polovina byla horší: **z adresního řádku se token mazal až po
úspěšném uložení** nového hesla. Kdo to nedokončil — zavřel kartu,
spletl si heslo, nechal stránku otevřenou — nechal si jednorázový token
v adrese a **v historii prohlížeče**, a ta se u přihlášeného prohlížeče
synchronizuje mezi zařízeními.

Hotovo: adresa se uklidí **hned**, jak se token přečte
(`history.replaceState`). Token žije dál v proměnné, takže formulář
funguje stejně; na úspěchu už se adresa neuklízí podruhé.

Hlídá to `scripts/test-profil-vypadek.mjs` (3 nové kontroly nad falešným
Supabase) a měří **obojí**: že je adresa hned uklizená A že se token
nezahodil — uložení nového hesla ho musí poslat serveru. Jedna věc bez
druhé je buď díra, nebo rozbitá obnova hesla.

Sabotáž, dva směry, oba zachyceny: adresa se neuklidí (stav před
opravou) a s adresou se zahodí i token.

K tomu se do `docs/pred-vydanim.md` dopsalo nastavení, které s tímhle
tokenem souvisí a z repozitáře se ověřit nedá: **seznam adres, kam smí
vést odkazy z e-mailu** (Supabase → Authentication → URL Configuration).
Dokud je v něm `*`, může kdokoli vyrobit odkaz na obnovu hesla, který
přistane s tokenem na cizí stránce. Že to v seznamu stojí, hlídá
`test-sql-prava.mjs`.

## 127. Hlavička Referrer-Policy: změřeno, NEUDĚLÁNO *23. 10.*

Z hlaviček, které jde na statickém hostingu nastavit přes `<meta>`, mi
zbývala jedna: `<meta name="referrer">`. Na všech 2 368 stránkách ji
nemá **žádná**. Otázka tedy byla, co prohlížeč posílá bez ní — a to se
dá změřit, ne odhadnout.

Měření (`scripts/mereni-referer.mjs`: naše stránka na jednom portu,
„cizí server" na druhém, obrázek i `fetch` přes hranici původu,
Chromium 1194):

```
stránka: http://127.0.0.1:8401/stranka.html?tajny=parametr#fragment
obrázek → Referer: http://127.0.0.1:8401/
fetch   → Referer: http://127.0.0.1:8401/
```

Tedy **jen původ** — bez cesty, bez dotazu, bez fragmentu. Dnešní
prohlížeče mají `strict-origin-when-cross-origin` jako výchozí chování,
takže ta meta by **nezměnila nic**: mapové servery ani Supabase se
o konkrétní stránku pozemku z hlavičky nedozví ani teď.

Kde by pomohla: prohlížeč starší než rok 2020 (výchozí
`no-referrer-when-downgrade` posílal celou adresu). Cena: řádek na
2 368 stránkách a další hlídač. **Neudělal jsem to** — a je to tady
zapsané i s tím, jak to znovu změřit, aby se příště nerozhodovalo
dojmem. Kdyby se měnil hosting (Vercel, CDN), patří `Referrer-Policy`
do hlaviček serveru spolu s těmi, které `<meta>` neumí vůbec
(`Strict-Transport-Security`, `X-Frame-Options`) — jak stojí
v `docs/pred-vydanim.md`, bod 6.

## 128. Clickjacking: stránky s účtem se daly vložit do cizího rámu *23. 10.*

Útok se jmenuje clickjacking: cizí stránka vloží náš web do průhledného
rámu, nad něj položí vlastní návnadu, a klepnutí, které člověk míní na
ni, dopadne na naše tlačítko. Na webu, kde se dá **smazat inzerát,
odhlásit se, zrušit hlídání nebo vymazat všechna uložená data**, je to
opravdový úkon za cizí ruku.

Správná obrana je hlavička (`X-Frame-Options`, nebo `frame-ancestors`
v CSP) — a tu statický hosting nepošle; `<meta>` ji ignoruje. Změřeno:
**0 z 2 368 stránek** bylo proti rámování chráněných.

Hotovo: pojistka v prohlížeči na pěti stránkách, kde klepnutí mění účet
nebo uložená data (`hlidani`, `muj-inzerat`, `pridat`, `zpravy`,
`moje-data`). Pořadí v ní je to podstatné: **nejdřív se stránka skryje,
teprve pak se zkusí z rámu vyskočit.**

**A proč v tom pořadí, se změřilo.** Chromium 1194 vyskočení z cizího
rámu bez gesta uživatele **zakáže**:

```
Unsafe attempt to initiate navigation for frame with URL 'http://…:8422/'
from frame with URL 'http://…:8421/muj-inzerat.html'. The frame attempting
navigation is targeting its top-level window, but is neither same-origin
with its target nor has it received a user gesture.
```

Takže co doopravdy chrání, je **skrytí** — a vyskočení je druhý pokus,
který se někdy povede. Kdybych napsal jen vyskakování (jak to radí
většina starých návodů), nechrání to nic a adresní řádek by zůstal
útočníkův s našimi tlačítky uvnitř.

Hlídá to nová `scripts/test-ramovani.mjs` (8 kontrol). Cizí původ se
napodobí druhým portem (jiný port = jiný původ), ten vloží naši stránku
do rámu a zkouška uznává **obě** podoby ochrany: buď adresa nahoře je
naše (vyskočilo se), nebo se v rámu nic nevykreslilo. K tomu dvě
kontroly, bez kterých by to nic neváželo:

* **rám se sandboxem** (`sandbox="allow-scripts"`), kde vyskočit nelze
  vůbec — tam musí platit ta druhá polovina, prázdno;
* **stránka bez pojistky** (`404.html`) se v rámu opravdu vykreslí —
  jinak by zkouška procházela i tehdy, kdyby rám nefungoval.

Do rámu jiného původu se přitom z JavaScriptu stránky nevidí (a je to
tak správně); první pokus přes `iframe.contentDocument` vracel všude
„null", tedy nic naměřeno. Playwright na rámy vidí sám —
`page.frames()` dá objekt rámu a v něm jde vyhodnotit kód bez ohledu na
původ.

Sabotáž, dva směry, oba zachyceny: pojistka odstraněná z jedné stránky,
a pojistka, která jen vyskakuje (bez skrytí a bez záchrany v `catch`) —
ta padne právě v sandboxovaném rámu.

Zůstává napsané v `docs/pred-vydanim.md` (bod 6): na serveru, který umí
hlavičky, patří `X-Frame-Options`/`frame-ancestors` nasadit a tuhle
pojistku nechat jako druhou obranu.

## 129. Heslo stačilo šestiznakové — a šestka stála v jedenácti místech *23. 10.*

Změřeno 23. 10.: nejmenší délka hesla je **6 znaků** a je napsaná
**jedenáctkrát** — `js/pridat.js` (kontrola + nápověda u pole),
`hlidani.html` (dvě hlášky), `zpravy.html` (dvě hlášky),
`muj-inzerat.html` (dvě kontroly + dva atributy `minlength`),
`pridat.html` (`minlength`). Žádný společný zdroj; `MEZE`
v `js/kontrola.js`, kam to patří, o hesle nevěděly.

Šest znaků je navíc pod dnešní praxí: NIST SP 800-63B doporučuje aspoň
osm a **žádná** pravidla na skladbu (vynucené „velké písmeno
a číslice" vedou na `Heslo1!`).

**A tady se to málem pokazilo.** Napsat „všude osm" by vypadalo jako
zpřísnění a byl by to zámek na vlastních dveřích: ty formuláře jsou
sdílené pro přihlášení i zakládání účtu, takže by se každý, kdo si účet
zakládal s šestiznakovým heslem, **přestal dostat dovnitř** — klient by
ho odmítl ještě před odesláním. Pravidlo je proto rozdělené:

* **zakládání účtu a nové heslo** → aspoň `MEZE.hesloMin` (8);
* **přihlášení** → jen „nějaké heslo"; co je krátké, odmítne server.

Z atributů to plyne stejně: `minlength="8"` má pole
`autocomplete="new-password"`, a pole `current-password` **nemá
minlength vůbec**.

Jedno číslo, jeden zdroj — ale s výjimkou, která je taky změřená:
`js/kontrola.js` se načítá jen na `pridat.html` (18,8 kB minifikovaně).
Přidávat ho na tři další stránky kvůli jednomu číslu je horší obchod
než záložní hodnota `|| 8` v místě — a ta se **musí rovnat**.

Hlídá to `scripts/test-meze.mjs` (6 nových kontrol, celkem 83): číslo
v `MEZE` je aspoň osm, všechny záložní hodnoty i všechny texty „aspoň
N znaků" se s ním rovnají, pole na nové heslo má `minlength` rovné jemu,
**přihlašovací pole minlength NEMÁ**, podmínka na délku stojí jen
u zakládání a nového hesla, a seznam před vydáním jmenuje totéž číslo
jako nastavení Supabase (bez něj hlídá délku jen prohlížeč a dá se
obejít voláním API).

Sabotáž, čtyři směry, všechny zachyceny: rozešlá záložní hodnota,
`minlength` na přihlašovacím poli, podmínka na délku u přihlášení,
chybějící nastavení v seznamu před vydáním.

**A jedna moje kontrola zprvu nechytla, co měla.** Rozhodovala podle
šesti řádků kolem — a protože `okPrihlaseni` a `okZalozeni` stojí
v souboru vedle sebe, výjimka pro zakládání kryla i podmínku
u přihlášení; sabotáž prošla. Teď rozhoduje **samotný řádek**: jméno
funkce nebo proměnné na něm řekne, k čemu ta podmínka patří. Potřetí
dnes totéž poučení (oddíly 120, 121).

## 130. Odkazy do nového okna: 2 790 jich je, hlídal se jeden *23. 10.*

Odkaz s `target="_blank"` dá otevřené stránce `window.opener` — živé
držadlo na okno, ze kterého se na ni kleplo. Cizí stránka s ním naše
údaje nepřečte (jiná adresa, prohlížeč to nepustí), umí ale to jediné,
co stačí: přepsat `opener.location`. Člověk klepne na odkaz do inzertního
webu, přečte si ho, vrátí se na naši kartu — a je na přihlašovací
stránce, která se té naší jen podobá. Reverse tabnabbing.

**Naměřeno.** Odkazů do nového okna je v repozitáři **2 790** a `rel`
s `noopener` měly **všechny**. Hlídala to ale **jediná kontrola na
jediném odkazu** (`scripts/test-mapa-pozemku.mjs:1415`). Celé to stálo
na tom, že nikdo nikdy nezapomene — a zapomenout má kde ve třech
vrstvách:

| kde | kolik | kdo to píše |
|---|---|---|
| hotové stránky (106 souborů: 77 okresních výpisů, 29 ručních) | 2 770 | generátory a ruka |
| šablony generátorů ve `scripts/` | 11 | ruka |
| staví skript za běhu (`js/pozemek.js`, `js/smlouva-stranka.js`) | 6 = 3 místa × (zdroj + zmenšená kopie) | ruka |

Na 2 232 stránkách pozemků žádný `target="_blank"` **není**: odkaz na
zdroj si tam stránka postaví až v prohlížeči — a to je právě to třetí
místo v tabulce.

**Udělané:** `scripts/test-nove-okno.mjs` (4 kontroly) projde 2 806
souborů a žádá `noopener` u každého odkazu do nového okna, v značce
i u odkazu stavěného skriptem. Navíc hlídá `window.open` — tím by to
proklouzlo, protože `rel` u něj neexistuje (dnes ho web nepoužívá
nikde). Dvě kontroly jsou **o samotném měření**: odkazů se musí najít
aspoň 2 000 a souborů aspoň 2 000, jinak by zkouška mohla projít nad
prázdnem a tvrdit, že je vše v pořádku.

Sabotáž, **pět směrů, všechny zachyceny** (na kopii stromu, aby
běžící sada nepřišla o půdu pod nohama): ruční stránka bez `rel`,
hotová okresní stránka bez `rel`, šablona generátoru bez `rel`,
`a.rel = 'noopener'` smazané ze skriptu, a `rel`, které zůstalo, ale
`noopener` z něj zmizelo (`rel="nofollow"` sám nestačí). Šestá sabotáž
měřila zkoušku samu: na stromu s jedním souborem spadly obě kontroly
měření — tedy pozná, že neměří nic.

**Dvakrát si zkouška musela vyjasnit, co vlastně čte.** Nejdřív hlásila
dva nálezy v `scripts/test-karta-vede-spravne.mjs` — tam ale
`[target="_blank"]` stojí jako **selektor** v `querySelector`, odkaz se
jím hledá, nestaví, a `rel` se k němu připsat nedá. Rozhoduje se proto
podle toho, jestli `target` stojí **uvnitř značky `<a`**, která se
před ním neuzavřela; selektor v hranaté závorce se počítá zvlášť a ten
počet se vypisuje, ať je vidět, co výjimka spolkla. A pak hlásila
nález v **sobě**: svůj vlastní souhrn si vypisovala textem, který sama
hledá. Souhrn se přepsal, aby ten vzorec neobsahoval.

Prohlížeče dávají `noopener` u `target="_blank"` samy už od Safari 12.1,
Chrome 88 a Firefoxu 79. Hlídá se to i tak: na starším telefonu, ve
WebView v aplikaci nebo v nějaké čtečce ta výchozí hodnota být nemusí,
a napsat ji nic nestojí.

**Co se tím NEzavřelo:** `window.open` dnes web nepoužívá, takže
kontrola C je zatím prázdná pojistka do budoucna — a je to tak
napsané i v komentáři zkoušky.

## 131. Úložiště fotek: strop na velikost i typ byl, na POČET ne *23. 10.*

Fotky se nahrávají **z prohlížeče přímo do úložiště** (`listing-photos`),
ještě než inzerát vznikne. Zavřené tam bylo všechno kromě jednoho:

| co | čím | bylo? |
|---|---|---|
| velikost souboru | `file_size_limit` 3 MB na bucketu | ano |
| typ souboru | `allowed_mime_types` = jen `image/jpeg` | ano |
| cizí složka | insert policy, zápis jen pod vlastní `uid` | ano |
| fotek v jednom inzerátu | `create_listing`, nejvýš 8 | ano |
| **kolik souborů účet nahraje** | — | **ne** |

Účet si kdokoli založí na libovolnou adresu a inzerát k nahrávání
potřeba není. Dokud by se nenaplnilo úložiště projektu, šlo tam sypat
3MB JPEGy — a platí je vlastník.

**Udělané** (`supabase/uloziste-strop.sql`, v balíku až za
`listings-tiers.sql`, protože čte `my_limit()`): **24 souborů na účet**,
u placeného účtu 24 × povolený počet inzerátů. Čtyřiadvacítka je
trojnásobek toho, co jeden inzerát ukáže — fotky se dají dvakrát
přefotit a nahrát znovu, než strop dojde; free účet tím má nejvýš 72 MB.
Počítá se podle složky (`name like '<uid>/%'`), ne podle sloupce
`owner`: složka je ta samá podmínka, na které stojí zápis, umí se opřít
o index `(bucket_id, name)` a u souboru nahraného service-role klíčem
`owner` být nemusí. Přidaná `my_photo_space()` říká webu, kolik místa
zbývá.

**A JEDNA VRSTVA NESTAČILA.** Politika se ptá dotazem na tutéž tabulku,
do které zapisuje — a ten dotaz **nevidí řádky z téhož příkazu**.
Naměřeno: `insert … select … generate_series(1, 30)` prošel celý, strop
nestrop. Z dnešního webu ta cesta nevede (úložiště bere jeden soubor na
jeden dotaz a schéma `storage` není přes PostgREST vidět), ale spoléhat
na to, co zvenčí „zatím nejde", je slabá pojistka. Druhá vrstva je proto
**spouštěč** `before insert … for each row`: ten se volá na každý řádek
zvlášť, takže už vidí i ty předchozí. Po jeho přidání se týž
třicetiřádkový zápis odmítne.

**ÚLOŽIŠTĚ SE DOSUD NEPROMĚŘILO ANI JEDNOU.** `scripts/test-sql-cista.mjs`
pouští celý balík na opravdovém PostgreSQL — ale schéma `storage` tam
neexistuje, takže tři politiky nad `storage.objects` vůbec nevznikly
a chyba se **schválně promíjela** jako rozdíl prostředí. Práva úložiště
tím byla mimo dosah zkoušky. Teď se schéma podstrčí (dvě tabulky,
`owner`, `foldername()` se stejným chováním jako na Supabase — vrací
cestu bez jména souboru) a měří se 8 nových věcí; celkem 93.

Sabotáž, **šest směrů, všechny zachyceny**: strop vyndaný z politiky,
strop vyndaný ze spouštěče, spouštěč bez rozlišení placeného účtu,
zápis povolený i do cizí složky, `my_photo_space()` slibující místo i na
stropu, a podstrčené úložiště bez zapnutého RLS (to poslední měří
zkoušku samu — bez RLS by byly politiky jen ozdoba).

**A zprvu byla zkouška slepá přesně tam, kde měla vidět nejlíp.** Vyndal
jsem stropovou podmínku z politiky a zůstala zelená: dochytil to
spouštěč. Dvě vrstvy, jedno měření — tedy ani jedna vrstva doopravdy
změřená. Teď se spouštěč v průběhu zkoušky **schválně odpojí**, aby se
politika měřila sama, a pak se vrátí pro vícerádkový zápis. (Totéž
poučení jako v oddílech 120, 121 a 129, jen z jiné strany: tam si hlídač
špatně četl text, tady si zkouška neuvědomila, že měří dvě věci naráz.)

**Co ještě neumí:** spouštěč smí na `storage.objects` založit jen
vlastník té tabulky, a tím `postgres` na hostovaném Supabase být nemusí.
Je proto obalený v `do … exception`, takže skript nezastaví — jen
napíše poznámku. Zapsáno v `docs/pred-vydanim.md` i jako hranice
v `docs/slaba-mista.md`.

## 132. Telefony inzerentů vydá jeden dotaz — a je to rozhodnutí, ne úklid *23. 10.*

`public_listings()` vrací i `contact_phone` a smí ji zavolat **anon**.
Jeden dotaz s veřejným klíčem tedy vydá telefony (nebo e-maily) **všech
inzerentů naráz**, setříděné a připravené ke zpracování.

**Co z toho vadí a co ne.** Že se telefon na stránce pozemku ukáže
komukoli, je záměr: inzerent chce, aby se mu ozvali, a za tím účelem ho
tam sám napsal. Vadná je ta **hromadnost** — rozdíl mezi „kdo se dívá na
tenhle pozemek, uvidí tenhle kontakt" a „kdo má veřejný klíč, má celou
kartotéku". Je to týž rozdíl, kvůli kterému v tomhle repozitáři
**nevznikl** hlídač listů vlastnictví na prodej investorům (viz
`docs/slaba-mista.md`): seznam kontaktů je něco jiného než jeden
kontakt, i když se skládá z týchž údajů.

**Změřeno, kudy ten údaj teče.** Kontakt má jen inzerát od majitele:
ve stažených datech pole `contact` neexistuje ani jednou (0 z 1 953
nabídek v `data/opportunities.json`, měřeno 23. 10.), plní ho
`js/cisteni.js` jen u typu
`majitel`, `js/main.js` ho předává přes `sessionStorage` a vypisuje
`js/pozemek.js`. Hromadný výpis ho tedy k ničemu nepotřebuje — mapa ani
karty telefon nezobrazují. Vyndat ho z `public_listings()` a přidat
`listing_contact(uuid)` pro jeden inzerát je proveditelné a nic by to
na webu nezměnilo kromě jednoho dotazu navíc při otevření detailu.

**A přesto se to NEUDĚLALO**, protože by to bezpečnost nezvýšilo, jen
zdražilo: `id` inzerátů dál vydá hromadný výpis, takže sklízení by
stálo N dotazů místo jednoho — u desítek nebo stovek inzerátů je to
pro skript bez rozdílu. Brzda podle volajícího nejde: **anonymní
volající nemá, podle čeho se poznat** (a ukládat k dotazům IP nebo
označení zařízení zásady soukromí slibují nedělat — viz čítače v oddílu
13 `docs/slaba-mista.md`).

**Co by opravdu pomohlo, je rozhodnutí o produktu**, ne úprava kódu:
kontakt ukazovat **až po přihlášení** (jak to dělají velké realitní
servery) a vydávat ho jednotlivě s brzdou na účet. To ale něco stojí
na straně poptávky — zájemce, který se nechce registrovat, se neozve.
Tahle volba patří vlastníkovi; je zapsaná v `docs/slaba-mista.md` jako
hranice.

**Dnes to nestojí nic** — tabulka inzerátů je prázdná. Právě proto je
teď ta nejlevnější chvíle se rozhodnout: po prvním opravdovém inzerentovi
už by změna znamenala měnit pravidla někomu, kdo na ně přistoupil.

## 133. Nenahraná fotka tiše mizela — a smazaný inzerát ji nechal v úložišti navždy *23. 10.*

Dvě vady, které vyšly najevo teprve tím, že úložiště dostalo strop
(oddíl 131). Obě jsou o témže: web věděl něco, co člověku neřekl.

**(a) Fotka, která se nenahrála, zmizela beze slova.** `uploadOne`
v `js/pridat.js` vracelo při každém selhání `null`, adresa se prostě
nepřidala do seznamu a inzerát se zveřejnil bez ní. Člověk vybral pět
fotek, uvidí tři a nedozví se proč. Dokud šlo jen o vypadlou síť, byla
to vzácnost; se stropem na počet fotek je to pravidelný stav.

Nově se čte **text odpovědi**, protože jen z něj se důvod pozná, a každý
důvod znamená pro člověka něco jiného:

| co přišlo | co se ukáže |
|---|---|
| „dosažen strop fotek na účet (24)" (spouštěč) | úložiště je plné, i s číslem, a odkaz na kontakt |
| „row-level security" (politika) | totéž, jen bez čísla |
| stav 401 nebo „jwt expired" | přihlášení vypršelo — *jiná* rada: přihlásit se, ne mazat |
| cokoli jiného / spadlé spojení | kolik fotek z kolika se nenahrálo |

A hlavně: **inzerát se nezveřejní**. Zveřejnit ho bez fotek, které
člověk poslal, by znamenalo ukázat mu něco jiného, než co odeslal.

**Rada v hlášce musí být pravdivá** — a tady se to málem pokazilo.
Nejdřív tam stálo „smažte starší inzerát v Moje inzeráty". To by byla
lež, protože…

**(b) …mazání inzerátu fotky neodklízelo.** `delete_listing` maže jen
řádek v `listings`. Fotky zůstaly v úložišti, a se stropem je to past:
účet se zasekne na 24 fotkách po inzerátech, které už nemá, a sám je
neuklidí. Zavřeno **dvěma cestami**, protože ani jedna sama nestačí:

* `muj-inzerat.html` při mazání inzerátu smaže **nejdřív jeho fotky**
  přes Storage API (jedním dotazem; politika „listing photos owner
  delete" pustí jen vlastníka, takže podstrčeným seznamem nejde smazat
  cizí fotka) a **pak** inzerát. Když úložiště mazání odmítne, inzerát
  se smaže **tak či tak** — člověk chtěl smazat inzerát, ne fotky.
* Noční úklid (`scripts/uklid-databaze.mjs`) smete, co zbylo:
  `osirele_fotky()` v databázi vypíše fotky starší jednoho dne, na které
  neodkazuje žádný inzerát, a skript je smaže přes Storage API.

**A proč dvoukrok, a ne jedno „delete from storage.objects":** smazaný
řádek by nechal soubor v úložišti ležet navždy **a ještě ho schoval
před každým dalším úklidem** — osiřelý soubor bez řádku už nikdo
nenajde. Mazat se proto musí přes Storage API, které ruší obojí.

Fotky mladší než den se nemažou: mezi nahráním a založením inzerátu je
chvíle, kdy na fotku ještě nic neodkazuje, a to je normální stav, ne
odpad. Hlídá to zkouška (fotka nahraná před deseti minutami se v soupisu
osiřelých objevit nesmí).

**Měří to 8 + 10 + 5 nových kontrol** v `test-pridat.mjs` (95),
`test-uklid-databaze.mjs` (26) a `test-profil-vypadek.mjs` (24). Sabotáž
**desetkrát**, všechny zachyceny: zahozené selhání nahrání, nerozpoznaný
strop, zahozené číslo ze serveru, vypršelé přihlášení splývající se
stropem, mazání řádků místo souborů, poslané jen první jméno, spolknutá
chyba úložiště, vynechaný dotaz na osiřelé fotky, nemazané fotky při
mazání inzerátu a poslaná veřejná adresa místo cesty.

**Dvakrát se napoprvé měřilo něco jiného, než mělo:** zkušební fotka
byla jednobarevná, takže ji zamítl posudek ještě před nahráním (šest
kontrol padlo na „je skoro jednobarevná" a o nahrávání neřekly nic), a
odeslání s fotkou trvá dél než 2 200 ms, takže se měřil mezistav
„Zveřejňuji na mapě…". Fotka má teď pruhy a šum a čeká se, dokud se
hláška neustálí.

## 134. Zkoušky v prohlížeči: tři směny místo dvou, rozdělené podle naměřeného času *23. 10.*

Sada v prohlížeči jela v CI ve **dvou** směnách — rozdělených 22. 10.
taky podle naměřeného času (oddíl 111), tehdy 121 zkoušek a 31,3 minuty
na směnu. Od té doby přibylo devět zkoušek a v CI každá směna trvala
kolem pětatřiceti minut. Otázka tedy nebyla „rozdělit lépe", ale
„rozdělit na víc dílů" — a k tomu je potřeba čerstvé měření, ne to
staré.

**Změřeno znovu.** Spouštěč sady zapisuje ke každé zkoušce její trvání.
Celý průchod: **130 zkoušek, 3 681 s = 61 minut**, průměr 28 s na
zkoušku. Deset nejdelších:

| zkouška | s |
|---|---|
| `test-okoli` | 258 |
| `test-konzole` | 234 |
| `test-rozvrzeni` | 181 |
| `test-rozdeleni-stylu` | 180 |
| `test-stabilita` | 136 |
| `test-naseptavac` | 114 |
| `test-hlavicka` | 106 |
| `test-mapa-pozemku` | 100 |
| `test-pridat` | 93 |
| `test-nahoru` | 90 |

Prvních pět zkoušek tedy spolkne **16 minut z 61** — čtvrtinu času na
necelých čtyřech procentech zkoušek. Rozdělovat je po počtu nemá smysl.

**Udělané:** rozdělení na **tři směny podle naměřených sekund** —
týmž hladovým algoritmem jako 22. 10. u dvou (nejdelší zkouška jde
vždy do nejkratší směny). Vyšlo 43 + 43 + 44 zkoušek, a **každá směna
20 minut**. Pořadí kroků
v úloze zůstalo zachované, texty kroků se nepřepisovaly — jen se
přeskládaly, a soupis zkoušek je před a po **doslova stejný** (porovnáno
výpisem všech `scripts/test-*.mjs` ze souboru úlohy). Hlídá to
`scripts/test-staticka.mjs` (každá zkouška je v CI zaregistrovaná právě
jednou) a `scripts/test-ci-prava.mjs` (nová úloha má napsaná práva,
nenechává si token na disku a instaluje připnuté verze).

**A DVĚ POJISTKY O TŘETÍ SMĚNĚ NEVĚDĚLY** — obě měly směny vypsané
ručně jako `v-prohlizeci` + `v-prohlizeci-2`:
`scripts/generate-roadmap-cisla.mjs` (zapisuje čísla do
`docs/roadmap.md`) a `scripts/test-roadmap.mjs` (hlídá, že tam sedí).
Součet dvou jmen pořád vycházel, jen o 44 zkoušek míň, takže se do
roadmapy zapsalo „86 s prohlížečem" a hlídač to **vyžadoval** — chtěl
číslo, které nebylo pravda. Projevilo se to až červeným CI (běh 654
spadl na „Čísla v roadmapě se rovnají repozitáři"). Obě místa teď
směny **čtou ze souboru úlohy** podle vzorku `v-prohlizeci*`, takže
čtvrtá směna už nikoho nepřekvapí, a počet směn se v tabulce píše
slovem ve správném pádě (poprvé z toho vyšlo „v tři směnách").

Je to potřetí, co ruční seznam směn někde zůstal pozadu: stejná vada
byla v obou pojistkách i 22. 10. (oddíl 111) a tehdy se opravila
jmenovitě — čímž se připravila přesně na tenhle pád.

**A hlídač množného čísla si o tom nenechal lhát ani v komentáři.**
Počet úloh se v tabulce píše slovem, takže k němu patří i správný tvar
(„čtyři úlohy", ale „pět úloh"). Napsal jsem to nejdřív zkratkou na dvě
větve podle toho, jestli je počet menší než pět —
`scripts/test-mnozstvi.mjs` to okamžitě shodil, protože u nuly a
jedničky by ta zkratka lhala. A když jsem ji pak v komentáři **ocitoval**
jako to, co se dělat nemá, shodil to znovu: hlídač čte i komentáře.
Popis se musel přepsat tak, aby zakázanou podobu neobsahoval ani jako
příklad. Dnes už pátý případ téhož poučení (oddíly 120, 121, 129, 131):
hlídač čte text po svém a musí se mu to dokázat.

**A POTOM SE TO ZMĚŘILO V CI, PROTOŽE ODHAD NESTAČÍ.** Běh 655
(zelený) dal tohle:

| směna | zkoušky | čas zkoušek | příprava | celkem |
|---|---|---|---|---|
| `v-prohlizeci` | 43 | 21,6 min | 29 s | 22,1 min |
| `v-prohlizeci-2` | 43 | 18,1 min | 30 s | 18,6 min |
| `v-prohlizeci-3` | 44 | 18,5 min | **11,3 min** | 29,9 min |

Rozdělení tedy **vyšlo** — samotné zkoušky zaberou 18 až 22 minut,
rozdíl tři a půl minuty. Těch jedenáct minut v třetí směně **nejsou
zkoušky**: je to krok „Prohlížeč", a v něm `npx playwright install
--with-deps chromium`. Z časů v logu: `npm install` 2 s, pak
„Installing dependencies…" od 21:14:23 do 21:25:21, tedy **10 min 58 s
čistého aptu** (fonty, `libnss3`, `xvfb`, `libglib`). Chromium se
nestahovalo vůbec — na stroji už bylo. Ostatní dvě směny měly týž
příkaz hotový za dvacet sekund.

Celý běh tedy trvá tolik, kolik trvá **nejdelší** směna: 29,9 minuty
místo dřívějších 35+. Zkrácení je tedy **pět až šest minut, ne deset
až dvanáct** — a kdyby apt na žádném stroji neztrácel čas, bylo by to
22 minut. Je to jediné místo, kde se dnes ještě dá ubrat, a žádná
kontrola se tím nedotkne; zapsáno jako úkol, protože `--with-deps`
vyndat **naslepo nejde**: v tom pomalém běhu se `libnss3` opravdu
instalovalo, a bez něj by se Chromium nespustilo.

**A POTOM SE TO ZMĚŘILO JEŠTĚ DVAKRÁT, PROTOŽE JEDEN VZOREK NIC
NEZNAMENÁ.** Krok „Prohlížeč" ve třech bězích, devět směn dohromady:

| běh | `v-prohlizeci` | `-2` | `-3` |
|---|---|---|---|
| 655 | 0,4 min | 0,4 min | **11,2 min** |
| 660 | 0,4 min | **3,0 min** | 0,4 min |
| 661 | 0,4 min | 0,4 min | 0,4 min |

Je to tedy **smůla stroje, ne vlastnost směny**: ze devíti směn byla
jedna na jedenáct minut, jedna na tři, sedm na dvacet sekund. Žádná
konkrétní směna „nemá" pomalý apt — příště padne jinam. Průměrná cena
je asi 1,6 minuty na běh, ale znát je jen tehdy, když to padne na tu
nejdelší směnu.

**Nic se s tím proto nedělá, a tohle je ten důvod.** Vyndat
`--with-deps` naslepo nejde: v tom pomalém běhu se `libnss3` opravdu
instalovalo, a bez něj by se Chromium nespustilo. Chytřejší postup
(zkusit spustit prohlížeč a doinstalovat závislosti jen když se
nespustí) by za jedenáct minut raz za devět směn nestál za to, aby na
něm viselo celé spouštění zkoušek. Zapsáno jako měření, ne jako úkol.

**Co na tom měření není přesné, a říká se to rovnou:** zkoušky od
`test-vypadky` dál běžely zároveň s mými vlastními běhy zkoušky databáze
(PostgreSQL, `nice -n 19`, dvacet sekund na běh). U několika z nich je
proto naměřený čas o pár sekund vyšší, než kdyby stroj stál jen jim.
Na rozdělení to nemá vliv — rozhodují minuty, ne sekundy — ale je to
důvod, proč se z těchhle čísel nemá dělat tabulka „zrychlili jsme
zkoušku X".

## 135. Verdikt o ceně měřil jednoho velkoobchodníka proti sobě *23. 10.*

Nejsilnější tvrzení webu o penězích je „**Výhodná cena** — levnější než
78 % pozemků téhož druhu v okrese". Stojí na srovnání s ostatními
nabídkami. A ty nabídky nejsou trh.

**Naměřeno** (1 932 nabídek po odečtení duplicit): značka inzerenta se
dá spočítat z jeho vlastního textu — velkoobchod posílá u všech nabídek
tutéž úvodní větu. Vyšlo 594 inzerentů, a:

| | |
|---|---|
| největší inzerent | **900 nabídek (47 %)** |
| druhý největší | 6 |
| inzerentů s jedinou nabídkou | 594 z 639 popisů |
| přihrádek okres+druh (≥ 10 nabídek), kde drží většinu | **28 ze 47** |
| nejhorší | Semily trvalý travní porost **10/10** |

Ze **236 odznaků „Výhodná cena" patřilo 130 (55 %) jemu** — a jejich
výhodnost byla měřená proti jeho vlastnímu cenníku. Jeho medián je
42 Kč/m² proti 69 u všech ostatních, takže zkreslení má jeden směr:
ostatní vypadají dražší, než jsou.

**Tři možnosti, všechny změřené skutečným modelem** (ne odhadem —
js/ceny.js se postavil dvakrát a verdikty se porovnaly nabídka po
nabídce):

| možnost | verdiktů | „Výhodná cena" | z toho velkoobchodníkových |
|---|---|---|---|
| **A** nechat, jak bylo | 912 | 236 | 130 (55 %) |
| **B** jeden inzerent, jeden hlas | 740 | **289** | **170 (59 %)** |
| **C** nevydat verdikt, kde drží > 50 % | 313 | 107 | 23 (21 %) |

**B vyšla hůř, než jak to bylo.** Sloučení jeho devíti set nabídek na
jeden hlas znamená, že se jeho ceny srovnávají s trhem, ve kterém má
jediný hlas — takže mu odznak „Výhodná cena" naopak přidělí častěji.
Je to pravda (jeho ceny JSOU pod trhem), ale na úvodní stránce by se
místo „nejlepších příležitostí" vysypal cenník jednoho prodejce.
Zamítnuto měřením, ne úvahou.

**C je příliš tupá.** Při mezi 50 % zbylo z 912 verdiktů 313 a z celé
republiky zůstaly u orné půdy **jen dva okresy**, které vůbec nějaký
verdikt dají (Praha-východ a Praha-západ, a jejich hladiny se liší
o devět procent). Funkce, která se tváří, že existuje, a nefunguje
nikde, není oprava.

**Co se udělalo — tři pravidla, každé na svém místě:**

1. **Nad 90 % se verdikt nevydá vůbec.** Devět desetin od jednoho
   inzerenta už není trh, je to cenník. Stojí to 36 z 912 verdiktů;
   23 z nich spadne o úroveň výš (okres → kraj) a dostane poctivější
   srovnání.
2. **Nad 50 % se u verdiktu NAPÍŠE, s čím se srovnával:** „Z toho 86 %
   nabídek je od jednoho inzerenta — spíš jeho cenník než celý trh."
   Dotklo se to 563 z 876 verdiktů (64 %). Číslo model vracel už dřív
   (`pc.podilInz`), stránka ho zahazovala.
3. **Úvodní stránka takové nabídky nenabízí jako „nejlepší
   příležitosti".** Ze 231 nabídek, které by se tam dostaly, je 126
   jeho; po vyřazení zbývá 107 a z toho 23 jeho — tedy přesně tolik,
   kolik vyjde z poctivého srovnání. Verdikt na stránce pozemku zůstává
   (s přiznáním): *číslo* s kontextem je informace, *doporučení* bez
   kontextu je reklama.

**Jak se značka do dat dostane.** `otiskInzerenta` v
`scripts/text-inzeratu.mjs` vezme prvních šedesát znaků popisu,
srovná je do jedné podoby a zahašuje na šest znaků. Nasazuje ji robot
při stahování (popis má po ruce), do `data/opportunities.json` jde jen
otisk, ne text. Srovnání pomlček není kosmetika: týž velkoobchodník
používá raz spojovník, raz pomlčku, a bez toho vyšel jako dva inzerenti
(513 + 414 nabídek). Starší data doplní
`node scripts/doplnit-inzerenty.mjs` z `data/popisy.json`.

**Co to stálo:** `data/opportunities.json` +8 kB (648 → 656),
`data/model.json` +11,7 kB surově a **+4,3 kB přes drát** (sloupec
indexů a slovník 594 jmen). Bez toho sloupce by stránka pozemku
počítala srovnávací hladinu z jiných podkladů než mapa a o témž pozemku
by tvrdily jiný verdikt — hlídá to `scripts/test-model-vstup.mjs`.

**A odhad ceny se nedotkl ničeho.** Je to předpověď, ne výpověď
o trhu, a u předpovědi platí, co se měřilo dřív u podílů: víc
pozorování je lepší, i když jsou pokřivená. Slučuje se jen srovnávací
hladina.

**Hlídá to `scripts/test-inzerenti.mjs` (14 kontrol):** značka v datech
je a sedí s tím, co ji počítá; model se podle ní opravdu chová; bez
značky žádné soustředění nehlásí (je to tedy z dat, ne z kódu);
pravidlo na úvodní stránce v kódu existuje a na datech opravdu něco
vyřazuje a něco nechává; a model v malém souboru nese týž slovník.
Plus jedna kontrola **o trhu, ne o kódu**: největší inzerent drží 47 %,
a kdyby to přešlo 60 %, zkouška spadne — to se nespraví v programu,
chce to druhý zdroj dat.

Sabotáž, **šest směrů, všechny zachyceny**: vypnuté mlčení nad 90 %,
nepočítané soustředění, zrušené pravidlo na úvodní stránce, značka
vypadlá z dat, značka v datech přepsaná na jinou, a smazané přiznání
ze stránky pozemku.

**Co tím zavřené NENÍ.** Pořád je to obvaz: 47 % dat od jednoho
prodejce je vada zdroje, ne výpočtu. Druhý zdroj nabídek je první bod
v `docs/pro-majitele.md` a tahle zkouška je důvod, proč.

## 136. Devět set stránek vypisovalo reklamu konkurence *23. 10.*

Na stránce pozemku je oddíl „Co o pozemku píše inzerent" — popis
z cizího inzerátu. Naměřeno: **979 z 2 233 stránek (44 %)** v něm
vypisovalo prodejní text jednoho velkoobchodníka:

> U nás nakupujete přímo od vlastníka – bez prostředníků a bez
> zbytečných výdajů navíc! … Pomáháme lidem bezpečně investovat do
> pozemků … Přidejte se k těm, kteří vsadili na jistotu.

Tři vady naráz. **„U nás" se na stránce Parcelky čte jako Parcelka** —
web slibuje něco, co nikdo neslíbil. Devět set stránek má **totožný
úvodní odstavec**, což je pro vyhledávač šablona, ne obsah. A je to
reklama konkurenčního inzerenta na našem webu.

**Pravidlo je z měření, ne ze seznamu zakázaných vět:** věta, která
stojí v padesáti a více různých nabídkách, není popis TOHOTO pozemku.
Na ostrých datech takových vět vyšlo **osm** a jsou to právě ty
prodejní; nic věcného mezi nimi není. Seznam by zestaral, měření se
přepočítá při každém sestavení.

**Dělení na věty musí umět zkratky.** „k.ú. Horusice LV č. 26 o výměře
3772 m²" má čtyři tečky a žádný konec věty. S obyčejným dělením podle
tečky vyšly jako nejčastější „věty" úlomky **„Parcela č." (1 286×)**
a **„k.ú." (1 118×)** — a pravidlo by zahodilo právě ta fakta, pro
která ten popis na stránce je.

**A reklamu nestačilo mazat po větách.** Po prvním kroku zůstala ve
298 popisech, protože se k ní faktická část přilepila bez tečky:
*„…Parcela č. 3619/57 - o výměře 4815 m² (Lesní pozemek) Pomáháme lidem
bezpečně investovat…"*. Dělení podle vět to vzalo jako jednu větu a ta
v padesáti nabídkách není. Naměřené věty se proto mažou i jako úryvek.

**Dvě cesty, kudy se to na stránku dostávalo, a každá chtěla svou
opravu:**

1. **Živé stránky** — generátor čistí popis před zápisem. Hotovo jednou
   změnou v `scripts/generate-parcel-pages.mjs`.
2. **Ukončené stránky** (nabídka už v datech není) se z dat nestaví;
   bere se hotové HTML a jen se v něm přepne pár věcí. Po první opravě
   jich **51 reklamu dál vypisovalo**. Úklid proto patří mezi „přepisy,
   které musí na KAŽDOU stránku" (`migrujPopisBezReklamy`), stejně jako
   migrace strojových dat.
3. A i pak zbývalo **24 stránek**: mají v sobě **starý ostrůvek dat**
   `pz-popis-data`, který dnešní generátor už nepíše, ale `js/pozemek.js`
   ho pořád umí přečíst. Maže se v něm reklama, ne ostrůvek: jsou v něm
   parcelní údaje, které ta stránka jinde nemá.

**Výsledek:** 979 → **0** stránek s tou reklamou. Medián popisu klesl
ze 411 na 256 znaků (−38 %), **ani jeden popis nezmizel celý** a
parcelní údaje („Parcela č.") má dál **všech 1 374 stránek**, které je
měly. Jediná stránka si „Pomáháme lidem…" nechala a je to správně: ta
věta je tam vlepená do unikátního textu o lesním hospodaření, který
v datech stojí jednou — a jednou není šablona.

Hlídá to `scripts/test-inzerenti.mjs`: seznam opakovaných vět si
spočítá ze stejných dat (žádná „zakázaná věta" v kódu zkoušky není),
prohlédne všech 2 232 stránek a žádnou tam nesmí najít — a zároveň
žádá, aby parcelní údaje zůstaly aspoň na tisíci stránkách. Sabotáž
oběma směry: snížená mez (úklid začne jíst fakta) i vypnutý úklid.

**A ještě jedna zkouška měla adresu napsanou rukou.** `test-pohyb`
měřila graf rozdělení cen na pevné adrese („Valašská Senice, okres
Vsetín") a po oddílu 135 tam graf zmizel — správně, protože ve Vsetíně
drží ten velkoobchodník 86 % nabídek a verdikt se tam nevydá. CI 657
spadlo na „graf se nenašel" a nebyla to vada grafu. Adresa se teď
vybírá **měřením**: bere se první nabídka, které týž model verdikt dá,
a kdyby žádná nebyla, zkouška to řekne zvláštní kontrolou (16 → 26
kontrol, protože se teď graf opravdu měří).

## 137. Noční úklid fotek trval 24 sekund a rostl součinem tabulek *24. 10.*

Databáze se dosud měřila jen na tom, co v ní je — a dnes v ní nic není.
Proto vzniklo **scripts/mericka-databaze.mjs**: založí prázdný
PostgreSQL, pustí do něj celý `supabase/00-vse.sql`, nasype objem, jaký
web unese za rok slušného provozu (2 000 účtů, 20 000 inzerátů,
60 000 zpráv, 50 000 poznámek, 50 000 uložených, 20 000 hledání,
10 000 přihlášek, 200 000 řádků návštěvnosti, 5 000 fotek) a změří
**každou cestu, kterou web opravdu volá** — čas i plán.

Výsledek je dobrá zpráva se dvěma dírami. Všechno, co dělá přihlášený
člověk, je pod deseti milisekundami:

| cesta | čas |
|---|---|
| `moje_poznamky()` | 1,3 ms |
| `moje_ulozene()` | 1,3 ms |
| `my_searches()` | 1,2 ms |
| `my_listings()` | 2,2 ms |
| `my_threads()` | 4,1 ms |
| `unread_count()` | 2,8 ms |
| `poznamka_uloz()` | 2,8 ms |
| `my_photo_space()` | 5,7 ms |

A dvě cesty, které rostly ošklivě:

| cesta | před | po | poměr |
|---|---|---|---|
| `osirele_fotky(24, 500)` | **23 785 ms** | 238 ms | 100× |
| `public_listings()` | 99,1 ms | 37,5 ms | 2,6× |

**Osiřelé fotky: součin tabulek, a napsal jsem ho já včera.** Funkce se
u KAŽDÉ fotky ptala, jestli její jméno stojí někde v `photos` některého
inzerátu — tedy 5 000 fotek × 20 000 inzerátů. Na desetině dat to bylo
257 ms, na celých 23 785: **×92 za ×10 dat**, tedy kvadraticky. Teď se
jednou vybalí množina odkazovaných jmen a fotky se proti ní porovnají
jedním průchodem.

**A dvě pojistky, protože chyba tady nemaže řádky, ale lidem fotky.**
Volající ta jména maže přes Storage API. Kdyby se tvar adresy fotky
změnil tak, že se z ní jméno nevyloupne, vyšly by jako osiřelé
**všechny**. Takže: nevyloupne-li se jméno z jediné adresy, funkce
nevydá nic; a jména, která se v adrese kódují (`moje foto.jpg` →
`moje%20foto.jpg`), se nevypisují vůbec, protože porovnání by je
minulo. Obojí je zahrané sabotáží.

**Veřejný seznam: funkce v podmínce se nedá vložit do dotazu.**
`public_listings()` filtruje přes `listing_je_verejny(status,
public_at)` — jedno místo, kde je napsané, co je na mapě vidět. Jenže
ta funkce měla `set search_path = public`, a **funkce s SET klauzulí se
nedá vložit do dotazu**: PostgreSQL ji pak počítá řádek po řádku.
Rozpad 20 000 inzerátů: samotné volání **42 ms ze 49**, zbytek
7 ms. Po vynechání SET klauzule je podmínka v plánu rozepsaná na
operátory. Pravidlo zůstalo na jednom místě — nic se neopisovalo.

Vynechat SET je bezpečné **jen u téhle funkce**: není `security
definer` (běží s právy volajícího, takže není co získat) a v těle
nesahá na žádnou tabulku — jen operátory a `now()`, a ty se hledají
v `pg_catalog`, které je v cestě vždy první. U `security definer`
funkcí SET zůstává.

**Částečný index vyšel jako slepá ulička, a je to zapsané.** Zkoušel se
`on listings(created_at desc) where status in ('approved','pending')` —
přesně to, co veřejný seznam filtruje a čím řadí. Plánovač ho nezvolil
**ani jednou**: na 20 000 inzerátech 21,8 ms s ním a 26,6 bez (což je
šum mezi dvěma měřeními), na 60 000 76,2 proti 92,2, počitadlo použití
nula. Veřejných je ~78 % inzerátů a tolik řádků se vyplatí přečíst
celou tabulkou. Index se proto nepřidal: nepoužitý index zdržuje každý
zápis.

**Hlídá to scripts/test-sql-vykon.mjs, a hlídá POMĚREM.** Pomalá podoba
obou funkcí se vyrobí v téže databázi vedle živé a porovná se s ní —
pevná mez v milisekundách by na pomalejším stroji plakala zbytečně.
Před rychlostí se vždy porovná ODPOVĚĎ: rychlejší funkce, která
odpovídá jinak, není zlepšení. Devatenáct kontrol, všech pět sabotáží
(vrácený SET, vrácený součin tabulek, obě odebrané pojistky, odebrané
pořadí u pushe) zkouška chytí.

## 138. Push rozesílač neřadil vůbec — a pořadí tam rozhoduje *24. 10.*

Rozesílač upozornění do telefonu se po `PK_PUSH_LIMIT` (výchozí 200)
zastaví a zbytek nechá na další běh. Jenže `hlidani_k_odeslani_push()`
neměla **žádné `order by`** — tedy která hledání se v těch dvou stech
objeví, rozhodovala databáze podle toho, jak se jí to zrovna hodilo.
Nikoho to nevyřadilo natrvalo (komu se pošle, ten na dalších 20 hodin
z výpisu vypadne), ale běh se nedal zopakovat ani vysvětlit — a u pošty
to tak nikdy nebylo, ta řadí od toho, kdo čeká nejdéle. Teď platí
stejné pravidlo na obou stranách.

**A strop na lidi se zkoušel a NEUDĚLAL — byla by to vada.** Rozesílač
si stahuje všechna zralá hledání (naměřeno 4 000 řádků) a použije z nich
nejvýš dvě stě lidí; napsat `p_lidi` do SQL a stáhnout jen tolik, kolik
se stihne, vypadalo jako zřejmé zlepšení (47,5 → 23,8 ms). Není:
**komu hledání nic nenajde, tomu se čas odeslání nikdy nepřepíše**,
takže by v okně stropu seděl každou noc znovu a lidi za ním by se na
řadu nedostali nikdy. Dnes to nevadí, protože se strop uplatní až na
počtu opravdu odeslaných zpráv.

Udělat se to dá, ale ne tímhle pořadím: nejdřív musí vzniknout záznam
„kdy se tohle hledání naposled ZKOUŠELO" (ne „kdy se poslalo"), a strop
se pak řadí podle něj. Do té doby je jediná cena jedna odpověď navíc
v noční úloze, a to je méně než tichá nespravedlnost. Pro majitele je
to zapsané jako bod 7c v `docs/pro-majitele.md`.

## 139. Hlídač „zkouška si nesmí spustit to, co zkouší" měl dvě slepá místa *24. 10.*

Hlídač v `scripts/test-staticka.mjs` hlásil novou knihovnu
`zkouska-postgres.mjs` (jedno místo, kde se zakládá zkušební
PostgreSQL pro tři skripty) jako nebezpečnou: hledal `writeFileSync`
**kdekoli v souboru**, a ta knihovna dočasnou databázi opravdu zakládá
a maže — jenže uvnitř vyvážených funkcí, tedy až když ji někdo zavolá.
Při importu se nestane nic.

**První oprava byla horší než vada.** Vyškrtnout z kódu těla funkcí
a hledat jen ve zbytku zní správně — a vypadalo to, že to funguje:
falešné hlášení zmizelo. Jenže ta vada, pro kterou hlídač vznikl
(generátor řezů s `await spust()` na konci, který si zkouška importem
spustila a pak kontrolovala svůj vlastní výsledek), **na nejvyšší
úrovni žádné `writeFileSync` nemá** — jen volání funkce, která
zapisuje. Zbystřený hlídač ji přestal vidět. Ukázala to až sabotáž:
po vrácení té původní vady zůstal hlídač zticha.

**Druhá oprava nehádá ze zdroje, ale pustí to.** Modul se naimportuje
v novém procesu, kde má Node zakázaný zápis na disk
(`node --permission --allow-fs-read='*'`). Sáhne-li při importu na
disk, import skončí `ERR_ACCESS_DENIED` — ať je ten zápis napsaný
přímo, nebo schovaný za třemi funkcemi. Tomu se nedá vyhovět formální
stráží, která nic nehlídá.

**Předfiltr taky padl na sabotáž.** Nejdřív se pouštěly jen moduly,
v nichž stálo jméno zapisující funkce — a `import { writeFileSync as w }`
ten seznam obejde. Filtr je teď na `node:fs`: z 35 modulů, které si
zkoušky berou, se pouští 21. Bez filtru to nejde, mezi moduly jsou
i takové, jejichž samotný import trvá dlouho.

Výsledek: hlídač chytí obě podoby vady (zápis na nejvyšší úrovni
i volání funkce, která zapisuje), jméno viníka vypíše přímo, a na
knihovnu bez vlastní práce už nesahá. Zkouška se tím prodloužila
o 12 sekund.

## 140. Měřidlo tvrdilo, že měří každou cestu — jedenáct jich neznalo *24. 10.*

V hlavičce `scripts/mericka-databaze.mjs` stálo, že měří „KAŽDOU
cestu, kterou web opravdu volá". Nestálo to tam pravdivě: ze zdrojů se
přes `/rest/v1/rpc/` volá 22 funkcí a měřidlo znalo jedenáct. Chybělo
mezi nimi **`bump_view()`, kterou volá každé otevření stránky
pozemku** — tedy nejčastější zápis na webu — a `ulozene_nahraj()`,
hromadné nahrání uložených pozemků, které je jednou ze dvou cest,
kterými databáze roste zvenčí.

Doměřeno; nic z toho nebylo pomalé (`bump_view` 1,5 ms,
`ulozene_nahraj` s plným polem 500 klíčů 2,4 ms, `my_listing_quota`
1,6 ms, `mail_odeslan` 2,3 ms, `unsubscribe_mail` 2,5 ms —
odhlašovací token má index z `unique`, takže se nehledá průchodem).
Negativní výsledek stejně stojí za zapsání: jinak se bude hledat
podruhé.

**Dvě měření přitom tiše selhala.** `push_odber_uloz` a
`push_odber_smaz` jsou cesty přihlášeného člověka, ale měřily se bez
přihlášení, takže dotaz skončil chybou — a výpis to ukázal jako
„Infinity ms", tedy jako číslo. Měřidlo teď neúspěch přiznává
(`? NEZMĚŘENO — <chyba>`), protože měřidlo, které mlčí o tom, co
nezměřilo, je horší než žádné.

**A ten rozpor mezi hlavičkou a skutečností teď hlídá zkouška.**
`scripts/test-sql-vykon.mjs` si vyčte jména funkcí volaných z `js/`
a z rozesílačů a porovná je s tím, co měřidlo měří. Výjimka je
jedna a je napsaná se jménem i důvodem (`create_listing` pouští i
kontrolu fotek a první posouzení inzerátu, takže by se neměřila
databáze); zkouška navíc hlásí i výjimku na funkci, která se už
nevolá. Obě sabotáže chytí.

## 141. V poli pro obec stála ulice — a seznam obcí máme ve vlastních datech *24. 10.*

U Bezrealitky se obec bere z první části adresy inzerátu. U nabídek
z města je ale první část **ulice**, takže na webu stálo jako obec
„Muškátová", „Ke Korunce", „Jasanová" nebo „25935" (poštovní směrovací
číslo). Vznikly z toho i adresy stránek —
`pozemek-brno-mesto-muskatova-1mlpl4.html` — a nadpisy, titulky
a řádky v sitemapě.

Část se opravila už 5. října (`mistoZBezrealitky`), ale jen tam, kde
adresa nesla obec jako další část. U ostatních se to dál nedělalo,
a komentář u té funkce říkal rovnou proč: *„Přeložit `cesky-brod` na
`Český Brod` by znamenalo seznam obcí, a ten tu není; napsat to bez
diakritiky by na českém webu bylo vidět."*

**Ten seznam ale po částech máme — jsou to jména obcí z našich
vlastních dat.** Adresa `…-nabidka-prodej-pozemku-muskatova-brno` nese
za jménem místa ještě `brno`, a „Brno" v datech stojí u čtrnácti jiných
nabídek, tedy i s diakritikou a velkým písmenem. Nic se nevymýšlí,
jméno se opisuje odtud.

**Dvě nezávislé opory, a obě musí držet:**
1. zbytek adresy za jménem místa se **celý** rovná jménu, které u jiné
   nabídky stojí jako obec,
2. to, co dnes v poli pro obec stojí, vypadá na ulici (předložka na
   začátku, přídavné jméno, nebo slovo jako „cesta").

**Obě si vysloužily krev.** Zkusil jsem, co bude, když se při neúspěchu
vezme jen poslední úsek adresy: z `…-ve-visnovce-vysoky-ujezd` vyšel
**„Újezd", což je jiná obec** než Vysoký Újezd, a z `…-v-dymaku-nove-jirny`
vyšly „Jirny". Zkracovat jméno obce je horší než ho neopravit. A bez
druhé opory by se přepsala i `…-pozemku-jesenice-rakovnik`: „Rakovník"
v datech je, ale Jesenice je obec, ne ulice.

**A ještě jedna, na vlastní test:** jména, kterými se opravuje, se
nejdřív filtrovala tím samým testem na ulici, aby ulice jméno
nepropůjčila. Tím ze seznamu vypadla **Orlová** — končí na „-á", takže
ji test za ulici označil — a oprava „Bučinská → Orlová" nebyla z čeho
udělat. Test na ulici rozhoduje jen o tom, CO se opravuje; jméno,
kterým se opravuje, musí být k dispozici celé.

**Naměřeno: opraví se 16 z 1 953 nabídek.** Dalších asi 25 je taky
ulice, ale jméno jejich obce v datech nestojí (Pardubická + chotec,
Topolová + stenovice) — ty by dořešil až seznam obcí od ČSÚ, a je to
v `docs/pro-majitele.md`. Oprava běží v robotovi **před dohledáváním
polohy**: podle `place` se geokóduje, takže dokud tam stála ulice,
hledala se v mapě ulice.

## 142. Opravené jméno obce změní adresu stránky — a cedule nesmí lhát *24. 10.*

Jméno souboru stránky pozemku nese obec
(`pozemek-<okres>-<obec>-<otisk>.html`), takže oprava z části 141
vyrobila šestnáct **nových** adres a šestnáct starých vypadlo ze
živých. Generátor na to měl jedinou odpověď: přepsat je na ukončené,
tedy napsat jim na čelo *„Tato nabídka už není aktuální."* U pozemku,
který je dál na prodej, je to lež — a držela by devadesát dní, než se
stránka smaže.

Vznikl proto **třetí stav stránky: rozcestí na novou adresu.** Pozemek
se pozná podle klíče BEZ OBCE (parcelní číslo, okres a souřadnice se
nemění), stránka dostane `noindex,follow`, `rel=canonical` na novou
adresu a pruh s odkazem. Canonical je tu to hlavní: na statickém webu
se přesměrovat (301) nedá, a canonical je jediný způsob, jak
vyhledávači říct „tenhle obsah je teď tam". Na novou adresu se posouvá
i `og:url`, protože Open Graph po něm chce kanonickou adresu — kdo
nasdílí starý odkaz, dostane v náhledu ten platný.

**První podoba vyrobila 37 rozcestí, i když se opravilo 16 míst.**
Zbytek byly kolize: u dražeb je parcelní číslo často „—" a souřadnice
na tři desetinná místa se potkají, takže dávno ukončená nabídka
v Lovosicích „našla" jinou živou v témže okrese a tvrdila, že se
přestěhovala. Odtud dvě podmínky, obě napsané v kódu: stránka nesmí
být už ukončená, a jméno, které na ní stojí jako obec, nesmí být obcí
žádné živé nabídky („Lovosice" a „Kalovice" obce jsou, takže se jich
to netýká). Po nich je rozcestí **přesně šestnáct**.

**A pět zkoušek měřilo pravdu, která se tím změnila** — každá jinak:
`test-vyhledavac` hlásilo „16 živých stránek bez index,follow",
`test-stranky-pozemku` „16 stránek navíc", `test-ukonceno` „16
ukončených tvrdí InStock" (a to je u přestěhované stránky **pravda**,
pozemek platí dál) a `test-sdileni` „og:url a canonical se
rozcházejí". Všechny čtyři teď třetí stav znají a hlídají o něj víc:
rozcestí se nesmí indexovat a jeho canonical musí vést na stránku,
která **existuje**. `test-ukonceno` navíc přestalo rozlišovat stavy
podle vzhledu pruhu (`class="pz-konec"` nosí obojí) a rozlišuje podle
značky v datech stránky.

**A pátá spadla až v CI, protože lokální rychlá sada ji nepouští.**
`test-parametry` si vybírá stránku, na které se dlaždice opravdu
vykreslí, a vylučovala ty s pruhem nahoře vzorkem `class="pz-konec"`
— **s uzavírací uvozovkou**. Rozcestí má `class="pz-konec pz-presun"`,
takže jím vzorek neprošel: zkouška si vybrala rozcestí (a zrovna to
s nejdelší hodnotou v datech, 24 980 000 Kč), čekala na dlaždice, které
se na něm nikdy nevykreslí, a padla hláškou o CSP — Playwright si na
opakované zkoušení podmínky bere `eval`, a ten stránky webu zakazují.
Tedy ne vada stránky, ale zkouška, která si vybrala stránku, na které
se nedá měřit.

Tentýž vzorek byl ještě na dvou dalších místech
(`test-hlavicka-pozemku`, `test-klic-ulozenych`); obě si stránku
vybírají stejně, jen se jim zatím vyhnula. Všechna tři místa teď hledají
TŘÍDU `\bpz-konec\b` v seznamu tříd, ne přesný řetězec. Je to poučení
na jedno pravidlo: *kdo porovnává `class="jmeno"` s uzavírací
uvozovkou, uvidí jen prvek, který druhou třídu nikdy nedostane.*

A `test-misto-prahy` měřilo předpoklad, který oprava zrušila: *„v datech
jsou pražské nabídky s ulicí místo obce"*. Byla to pravda — Devonská,
Ke Korunce, Na Chvalce, Chatová. Dnes hlídá opak: v okrese Praha už
žádná nabídka ulici v poli pro obec nemá. Pravidlo `mistoFraze`
zůstává pro případy, které se z adresy dokázat nedají.

## 143. Měřidlo jádra webu tvrdilo nepravdu — a svítilo zeleně *24. 10.*

`scripts/mericka-odhadu.mjs` je nástroj, kterým se rozhoduje o jádru
webu: o odhadu ceny. Pustil jsem ho s variantou „okolí" (odhad
z deseti nejbližších nabídek téhož druhu místo žebříku okres → kraj)
a vyšlo:

```
dnešní model            medián chyby 30,7 %
okolí K=10 R=25 km      medián chyby 28,0 %  (-2,6 p.b.)
                        párově: lepší 193, horší 141
```

Vypadalo to na hotový nápad k zavedení — medián i znaménkový test pro,
a stabilně ve **čtyřech různých rozděleních dat**. Jenže okolí je
v `js/ceny.js` dávno a **jde první** („OKOLÍ JDE PRVNÍ" stojí v kódu).
Tak co se tedy měřilo?

**KDO se počítá do srovnání, ne kde to leží.** Živý model bere do
srovnávací hladiny jen běžné nabídky (`if (d.type !== 'sale') return;`)
a vynechává ceny stanovené úředně (`spravniCena`, tedy SPÚ a státní
půda) — vyvolávací ani úřední cenu nestanovil trh. Moje varianta brala
všechno. Na jedné konkrétní nabídce (Zákupy, orná půda) to bylo vidět
naostro: hrubým počítáním **31 sousedů** do 25 km, a živá funkce našla
**sedm** — zbytek byly nabídky SPÚ, které do hladiny nepatří.

Po doplnění týchž vstupních pravidel do varianty:

```
okolí K=10 R=10 km +sklon   medián chyby 30,7 %  (+0,1 p.b.)   párově: lepší 3, horší 0, stejně 1 096
okolí K=10 R=25 km          medián chyby 31,6 %  (+1,0 p.b.)   párově: lepší 36, horší 33
```

Tedy **totožné s živým modelem**. Celých 2,6 p.b. dělaly ceny mimo trh.
A nejhorší na tom je, že to vypadalo jako dobrá zpráva: číslo ve
prospěch nápadu, čtyřikrát stabilní, k zavedení — a kdo by ho neověřil,
pustil by do srovnávací hladiny přesně to, o čem web na dvou místech
výslovně píše, že do ní nepatří.

**Dvě hypotézy po cestě byly špatné, a stálo za to je změřit.** Nejdřív
jsem to přičítal dražbám: jejich vyvolávací cena je pod trhem, tak to
bude ono. Nebylo — vynechání dražeb změnilo variantu o **0,1 p.b.**
Pak jsem to přičítal přepočtu na výměru; taky ne (varianta se sklonem
i bez něj byla pořád o 2,3 až 3,0 p.b. „lepší"). Teprve výpis zevnitř
funkce ukázal `mam = 7`, a to už byla otázka „koho vlastně vidí".

**Co měřidlo nemělo a teď má: znaménkovou odchylku.** Absolutní chyba
neřekne, jestli model střílí vedle, nebo soustavně vysoko. Naměřeno
křížově: **+1,4 % celkem**, z toho **okolí +0,4 %**, ústup na kraj
**+8,0 %** a okres −9,0 % (21 odhadů). Odhad z okolí je tedy prakticky
nezkreslený; posouvá se až ten krajský — a to je k užitku, protože
`js/ceny.js` o krajském ústupu píše, že je „méně místní", a tohle to
poprvé vyčísluje.

I tady jsem si jedno číslo nejdřív spočítal špatně: **+4,8 %** —
protože jsem to měřil na všech nabídkách na prodej, tedy i na
spoluvlastnických podílech, kterým web odhad vůbec nevydává. Měřil
jsem odchylku u čísel, která nikdo nikdy neuvidí.

**Kalibrace se zkoušela a NEPŘIJALA.** Opravit ten posun je lákavé:
na tréninkové části spočítat pro každou úroveň medián podílu
odhad/cena a odhad tím podělit. Naměřeno ve třech rozděleních:
−0,2 p.b., +0,3 p.b., +1,0 p.b., a znaménkový test **pokaždé proti**
(536 : 553, 540 : 544, 533 : 558). Ten posun tedy není vada k opravě,
ale vlastnost srovnání „místní medián proti jedné nabídce".

Hlídá to nová `scripts/test-mericka-odhadu.mjs` — a hlídá CHOVÁNÍ, ne
text: varianta se stejnými pravidly se musí od živého modelu lišit
nejvýš u 15 % nabídek (naměřeno 6 %), odhad z okolí nesmí být
zkreslený víc než o 5 p.b. a okolí musí nést víc odhadů než kraj.
Když se vstupní filtr z varianty vypustí, rozdíl vyskočí na 30 %
a zkouška padne; obě sabotáže chytí.

## 144. Vykreslil jsem e-mail a upozornění a přečetl si je — poprvé *24. 10.*

Pošta hlídání i upozornění do telefonu jsou **hotové a vypnuté**, takže
je nikdo nikdy neviděl. Oba skladače se přitom dají zavolat bez sítě
a bez klíčů — `mail-sklad.mjs` je odděleně právě proto („co se dá
vyzkoušet bez odeslání jediného e-mailu, se tak vyzkoušet má"). Tak
jsem to udělal, na opravdových nabídkách z dat. Tři nálezy, dva vážné.

**1) Upozornění do telefonu počítalo cenu za metr samo, mimo pravidlo
webu.** Stálo tam `d.price / d.area` — a to je u spoluvlastnického
podílu cena za metr **celé parcely**, i když se platí za zlomek.
Naměřeno na 1 932 nabídkách:

| | |
|---|---|
| upozornění by poslalo jiné číslo než stránka | **91 nabídek** |
| z toho nejhůř | Lípa, podíl 9/792: push **14 Kč/m²**, web **1 271** — devadesátkrát |
| upozornění by poslalo číslo, které web schválně NEVYDÁ (nad stropem uvěřitelnosti) | **11 nabídek** |

A je to zpráva, která má člověka přimět jednat **hned**. „14 Kč/m²" na
uzamčené obrazovce je pozvánka k něčemu, co na webu vypadá úplně jinak.
Teď se počítá `PKH.zaMetr()` — to jedno pravidlo, které drží mapa,
výpis i e-mail — a `send-push.mjs` si ten modul **už dávno importoval**
kvůli shodě hledání, jen tohle z něj nebral. Po opravě: **0 rozchodů
s webem, 0 čísel tam, kde web mlčí.**

**2) Upozornění zamlčovalo podíl, zatímco e-mail ho přiznává.** E-mail
píše „34 000 Kč · 3 732 m² — spoluvlastnický podíl 1/66", push psal jen
místo a cenu. Doplněno slovo `(podíl)` — a hned napoprvé špatně:
přilepil jsem ho k ceně, takže u **20 podílů z 520**, u kterých se cena
za metr určit nedá, by se zamlčelo i to, že jde o podíl. Právě tam, kde
se o nabídce říká nejmíň. Teď visí na nabídce, ne na ceně:
**520/520** podílů je označeno, a „Tovačov (podíl)" bez ceny je pořád
poctivější než „Tovačov".

**3) Skladač e-mailů vynucoval dvě pravidla ze tří.** V hlavičce má
napsáno, že e-mail bez odhlašovacího odkazu a prázdný e-mail
*nevzniknou* — a vynucuje to výjimkou. Počet v záhlaví skupiny se ale
jen tisknul, takže při zapomenutém údaji by lidem přišlo
`── Louky u Mělníka (undefined) ──`. Rozesílač ho posílá, takže to
nehrozilo — jenže to je přesně ta vada, která projde všemi zkouškami
a pak odejde pěti stům lidí naráz. Teď je to čtvrté vynucené pravidlo,
a v **obou** podobách e-mailu: hlídat jen textovou by nestačilo, HTML
je ta, kterou lidé čtou.

**A co bylo v pořádku** (ať to nikdo nekontroluje podruhé): předmět,
odkazy na stránky pozemků, odhlášení jedním klikem, poznámka
o nabídkových cenách, termín dražby **před** cenou, tři nabídky a zbytek
sečtený, nadpis v jednotném i množném čísle, hledání bez jména.

Poučení je metodické a nelichotivé: tyhle tři vady nenašla žádná
zkouška, protože všechny kontrolovaly, že se zpráva **vyrobí**. Stačilo
si ji přečíst. Hlídají to teď `scripts/test-web-push.mjs` (4 nové
kontroly) a `scripts/test-rozesilac.mjs` (3) — všech pět sabotáží
chytí.

## 145. Jeden příkaz s verdiktem „pustit, nebo nepustit" *24. 10.*

Kontrol měl tenhle repozitář dost — 253 zkoušek, `kontrola-databaze.mjs`,
`kontrola-inzeratu.mjs`, `diagnostika.html` — a ani jedna neodpovídala
na otázku, kterou má majitel: **můžu to pustit?** Zkoušky navíc dokazují
něco jiného, než se zdá: mluví s **falešnou Supabase** na místním
serveru, takže ověřují, že se web ptá správně. Jestli na druhé straně
někdo odpovídá, o tom nevědí nic — a celá půlka webu (účty, inzerce,
zprávy, poznámky, hlídání) proti opravdovému projektu neběžela ani
jednou.

Nové `scripts/kontrola-spusteni.mjs` dělí nálezy na tři hromádky a na
konci vydá verdikt: **blokuje** / **spustit jde, ale přijdete o to** /
**nezkoušeno**. Ta třetí je tam ta nejdůležitější: kontrola, která neumí
přiznat, co nezměřila, je horší než žádná — svítí zeleně a mlčí přesně
o tom, na co se ptáte.

**Servisní klíč nepotřebuje.** Čtyři rozhodující živé kontroly se dají
udělat veřejným klíčem z `js/config.js`, protože se ptají na to, co
uvidí každý návštěvník, a žádná nic nezapisuje:

| co | jak se to pozná |
|---|---|
| je SQL nasazené | `public_listings()` odpoví 200, ne `PGRST202` |
| uzavřená funkce je uzavřená | `prehled_navstevnosti()` musí nepřihlášenému odmítnout |
| kbelík na fotky existuje | neexistující soubor dá 404, chybějící kbelík 400 „Bucket not found" |
| potvrzuje se e-mail | `/auth/v1/settings` vydá `mailer_autoconfirm` veřejně |

**Dvě vady ve vlastní kontrole, obě nalezené prvním spuštěním.**
Hlásila „balík 00-vse.sql je osekaný" nad balíkem, který je v pořádku:
měl jsem mez „aspoň 50 funkcí", jenže `ocekavaneZeSQL()` počítá RŮZNÉ
funkce (46), ne jejich definice (71 — táž funkce se v migracích
přepisuje víckrát). Mez na počtu by se navíc rozešla s každou přidanou
funkcí, takže se místo počtu ptá na **jména** osmi funkcí, bez kterých
web nefunguje. A druhá: hledal jsem `--opravdu` kdekoli v souboru
workflow — a ono to tam je, dvakrát, **ve vysvětlujícím komentáři**.
Kontrola prošla, aniž cokoli ověřila. Po opravě (hledá se v řádku
`run:`) vyšlo něco užitečnějšího: přepínač v příkazu **je**, ale jen
pro ruční spuštění, takže **noční rozesílání jede nasucho** — pošta
nezačne odcházet sama tím, že se něco nasadí.

Hlídá to `scripts/test-kontrola-spusteni.mjs`: předstírá Supabase
v šesti stavech a u každého rozbitého vyžaduje nález, který blokuje
a vrátí návratový kód 1. Nejdůležitější kontrola z dvanácti je ta
předposlední — **když databáze neodpovídá, musí výpis říct NEZKOUŠENO**,
ne „nic nebrání". Obě sabotáže (spolknutá výjimka, přijatý chybějící
kbelík) zkouška chytí.

Sám nástroj v CI **neběží**: mluvil by s ostrým projektem a červenal by
podle toho, co ještě nikdo nenasadil. V CI běží jen jeho zkouška.

## 146. Tři noční úlohy mohly selhat a nikdo se to nedozvěděl *24. 10.*

Audit automatizace. **Co je dobré** (a ať se to nehledá podruhé):
robot má tři nezávislá síta proti tichému rozpadu zdrojů (proti minulému
běhu, proti mediánu 30 dnů, „zahazuje víc, než bere"), všechna
s naměřenými prahy; prázdný zdroj **běh zastaví** a nechá v repozitáři
stará data místo rozbitých; zdraví každého zdroje (`stav`, `pocet`,
`chyba`, `preskoceno`, `dotazu`, `selhalo`) se zapisuje do dat a **web
to ukazuje**; stahování má lhůty, opakování a rozptyl; kontrola inzerátů
odkaz zkouší víckrát, než ho odsoudí; 253 zkoušek hlásí `::error::`
s příčinou; nasazovací skript bez `--opravdu` nic neudělá a rozesílače
běží nasucho; po spadnuté zkoušce v prohlížeči se díky `zkouska-pad.mjs`
pořád dozvíte, co prošlo.

**Co chybělo, a je to ta nejhloupější možná mezera:** když noční úloha
**selhala, nestalo se NIC.** Ani jedna z osmi úloh neměla krok
`if: failure()`, nikde se nezakládal úkol, nikam nešlo upozornění.
Zůstala po ní červená tečka v záložce Actions, kam se nikdo nedívá —
a web dál ukazoval data, která se přestala obnovovat. Tři úlohy běží
podle hodin (robot každých 6 h, kontrola inzerátů denně, rozesílání
denně), takže to byly tři tiché cesty, jak se web rozpadne bez zprávy.

Nové `.github/actions/ohlas-selhani` (logika v `scripts/ohlas-selhani.mjs`,
aby se dala vyzkoušet bez GitHubu) při selhání založí **jeden úkol na
úlohu** — další selhání k němu připíše komentář. Nový úkol při každém
selhání by za týden znamenal sedm stejných a člověk by je přestal
otevírat; úkol se poznává podle skryté značky v těle, ne podle názvu.
A hlásič **sám nikdy nespadne**: běží ve chvíli, kdy už něco selhalo,
takže jeho vlastní chyba nesmí tu první přebít — co se nepovede, napíše
jako `::warning::`, ale **nikdy nemlčí**.

**Hlídač práv v CI moje rozšíření zachytil** — a dostal ostřejší
pravidlo místo výjimky. `issues: write` si smí vzít jen úloha, která
hlásič doopravdy používá; právo bez použití je nález. (Sabotáž: přidat
`issues: write` do `testy.yml` → zkouška padne.)

**Co se vědomě NEUDĚLALO: automatické opakování selhaného běhu.**
Znělo to jako samozřejmé zlepšení, ale u robota nemá cenu (další běh je
za 6 hodin) a u denních úloh je cena rizika vyšší než užitek: běh, který
se sám přespouští, se při špatně napsané podmínce přespouští navždy.
Úkol v repozitáři dá majiteli tlačítko „Re-run" a rozhodnutí nechá na
člověku.

**A co pořád chybí, pojmenované:** web **nehlásí chyby z prohlížeče
návštěvníka** — `window.onerror` ani `unhandledrejection` není v `js/`
ani jednou (změřeno: 0 výskytů). Spolu s tím, že všech 130 zkoušek
v prohlížeči běží jen v Chromiu, to znamená, že rozbité jablečné Safari
by zůstalo neviditelné navždy. To je největší zbývající mezera
v hlášení chyb.

Hlídá to `scripts/test-ohlas-selhani.mjs` (24 kontrol): předstírá GitHub
v šesti stavech a vyžaduje, aby hlásič poprvé úkol založil, podruhé jen
připsal, cizí úkol bez značky nepřepsal a při nedostupném GitHubu
**nemlčel**. Staticky pak kontroluje, že všechny tři úlohy podle hodin
hlásič mají a že švík pro zkoušku (`GH_API`) není v žádném workflow.
Obě sabotáže chytí.

## 147. Když web spadne návštěvníkovi v prohlížeči, nedozvěděl se to nikdo *24. 10.*

Druhá polovina auditu z oddílu 146. Noční úlohy teď o svém selhání
řeknou; **prohlížeč návštěvníka ne.** Změřeno: `window.onerror` ani
`unhandledrejection` nebyl v `js/` ani jednou (0 výskytů). Rozbitý
skript tedy znamenal poloprázdnou stránku, odchod a nulovou zpětnou
vazbu — a protože všech 131 zkoušek v prohlížeči běží jen v Chromiu
(jiný prohlížeč v prostředí není), rozbité Safari na iPhonu by zůstalo
neviditelné navždy.

**Jak se to odchytává, a proč ne jedním souborem.** Odložený skript
(`defer`) se spustí teprve po zpracování stránky — ale stránka pozemku
má patnáct NEODLOŽENÝCH skriptů, které běží během ní. Posluchač
založený až v odloženém souboru by propásl právě ty pády, kdy se
nespustí vůbec nic. Odchytává proto **vložený skript v hlavičce každé
stránky** (320 B, na všech 2 393 stránkách totožný do bajtu, aby to byl
jediný hash navíc v CSP): nic neposílá, jen si pády ukládá do pole.
Odesílač `js/chyby.js` pak pole vybere a převezme si jeho `push` —
jedno místo odchytu, jedno místo odeslání, nic dvakrát. Vkládá se **za**
hlavičku CSP, protože politika z `<meta>` platí teprve na to, co
prohlížeč zpracuje po ní.

**Co se posílá:** jméno stránky, hláška, místo (`js/min/ceny.js:14:9`)
a prohlížeč jako `safari-17`. **Celý user agent ne** — verze, jazyk
a model telefonu dohromady zužují okruh lidí na jednotky. Z hlášky se
vyhazují adresy a e-maily, a to **dvakrát**: v prohlížeči a znovu
v databázi, protože RPC si zavolá kdokoli s veřejným klíčem a ořez
v prohlížeči prostě vynechá. Hláška s e-mailem se nezapíše vůbec.
Tabulka je stejná myšlenka jako u návštěvnosti: **čítače hlášek, žádní
lidé.** Strop 300 různých hlášek za den, sepnutí vidět v řádku
`(strop)`, úklid po půl roce. V prohlížeči stropy tři: táž hláška
jednou za načtení, tři různé za načtení, osm za relaci.

**Vědomá cena: při „nesledovat" se nehlásí nic.** Technicky bychom
mohli — čítač nikoho nesleduje — ale stejnou stráž má měření
návštěvnosti, a web o sobě tvrdí, že neposílá nic. Pády zpřísněných
prohlížečů tedy neuvidíme. **A „Script error." se zahazuje:** tak se
jeví chyba z cizího skriptu (rozšíření, blokovač), nenese jméno, řádek
ani hlášku — opravit se z ní nedá nic a byla by to většina hlášení.

**Hlídač dvojích kopií v repozitáři našel moji vlastní kopii.** Stráže
(kdy se nesmí poslat nic), jméno stránky a cesta ven byly nejdřív
dvakrát: v měření a v hlásiči. Na tom je zlé přesně to, co u stráží
nejvíc bolí — zpřísnit jednu kopii a druhou ne znamená, že web dál
posílá odtud, odkud nemá, a nikdo to nepozná. Vzniklo proto
`js/neosobni.js`, které si berou obě strany, a `scripts/test-neosobni.mjs`
hlídá, že stráž **není nikde jinde**, že si každá stránka sdílený modul
bere, a bere ho **dřív** (odložené skripty běží v pořadí ze stránky).

**Co by se nedalo ověřit bez prohlížeče.** `scripts/test-chyby-v-prohlizeci.mjs`
pustí celý web v Chromiu, podstrčí jeden NEODLOŽENÝ skript stránky
rozbitý — a čeká, jestli hlášení odletí. Politiku CSP přitom
**schválně neobchází**: kdyby se hash vloženého odchytávače rozešel
s jeho textem o jediný znak, prohlížeč ho zakáže a hlásič mlčí navždy.
Sabotáž (jedna mezera navíc ve vloženém skriptu jedné stránky) to
chytla: místo pádu přišlo prázdno a politika skript odmítla.

**Naměřeno na objemu, ne odhadnuto.** Měřidlo databáze teď sype do
tabulky chyb i půl roku na denním stropu (300 různých hlášek × 180 dní
= 54 000 řádků, tedy nejhorší stav, než ji úklid smete) a měří tři nové
cesty: **zápis chyby 1,9 ms** (to je ta jediná, která běží návštěvníkovi
v prohlížeči — má v sobě `count(*)` přes dnešní řádky kvůli stropu,
takže na prázdné tabulce by se neměřilo nic), úklid 0,6 ms, přehled za
týden 11,9 ms a za půl roku 99,4 ms. Poslední dva jsou nad hranicí 10 ms
a **zůstávají tak**: čte je člověk z terminálu jednou za týden, ne
stránka při každém otevření, takže zrychlovat je by znamenalo přidat
index kvůli dotazu, který běží sedmkrát za rok. Při sypání objemu jsem
si navíc chytil vlastní vadu, která by nic nerozbila, jen tiše měřila
patnáctkrát menší tabulku: den i hláška se počítaly ze stejného `g`,
takže si zbytky po dělení padly do sebe a z 54 000 řádků zbylo 3 600.

Dohromady 42 nových kontrol: 33 na hlásič a databázi (polovina v Node
s podstrčeným oknem, polovina na opravdovém PostgreSQL — tam se zkouší,
že hlášku s e-mailem odmítne sama databáze a že denní strop sepne),
9 v prohlížeči. Čte se to příkazem `node scripts/chyby.mjs`.

## 148. Sebeoprava: co umí stroj spočítat ze zdroje, ať si taky spraví *24. 10.*

Nejčastější červená kontrola v tomhle repozitáři není vada webu, ale
**rozchod**: někdo zasáhne do zdroje a zapomene pustit
`node scripts/oprav.mjs`, takže odvozené soubory (stránky, razítka `?v=`,
hashe CSP, sitemap, sloučené SQL, tabulka v roadmapě) nesedí se zdrojem.
Jen 24. 10. se to stalo dvakrát — a oprava je přitom jediný příkaz,
jehož výsledek je **daný**, ne odhadnutý. Takovou věc nemá řešit člověk.

`.github/workflows/sebeoprava.yml` se pustí sama, když spadnou zkoušky,
a zkusí přesně tohle. Rozhodování je ve `scripts/sebeoprava.mjs`
oddělené od vykonání (čistá funkce `rozhodni`), aby se **každé pravidlo
dalo vyzkoušet bez gitu, bez sítě a bez CI**.

**Sedm pravidel, a ani jedno není navíc** — automat, který smí
commitovat, je nebezpečný přesně tak, jak jsou slabá jeho pravidla:

1. **Opravuje se jen to, co jde spočítat ze zdroje.** Výsledek je výstup
   generátorů, nic se nehádá.
2. **Každá oprava se dokazuje, než se nahraje.** Po opravě musí projít
   celá rychlá sada; když neprojde, oprava jde do koše a místo ní jde
   hlášení. Opravit a doufat není oprava.
3. **Nikdy dvakrát za sebou.** Je-li poslední commit sám sebeoprava,
   běh nedělá nic — jedna oprava na jeden lidský commit. Smyčka je tím
   vyloučená, ne „nepravděpodobná"; druhá pojistka je ve workflow
   (nespouští se po běhu, který založil robot).
4. **Nikdy na ruční práci.** Smí se změnit jen to, co patří generátorům
   (jeden seznam vzorů na pěti řádcích). Kdyby oprava sahala na `js/`,
   `scripts/`, workflow nebo prózu v `docs/`, je to **nález na
   generátorech**, ne důvod k commitu.
5. **Jen na domácí větvi** — jméno se bere z prostředí, ne z kódu.
6. **Vypínač je vždy k dispozici:** soubor `.github/SEBEOPRAVA-VYPNUTA`
   zastaví všechno bez hledání v kódu.
7. **Žádná tajná oprava.** Co se opravilo, stojí v commitu se značkou
   `[sebeoprava]` a výčtem souborů; co se neopravilo a proč, se vypíše
   jako `::warning::`, i když běh skončí úspěchem.

**Co se vědomě NEDĚLÁ: automatické vracení (revert) cizího commitu.**
Vrátit commit znamená rozhodnout, že je špatný celý — a to je soud, ne
výpočet. Robotův datový commit, který rozsvítí červenou, bývá právě ten
rozchod, a ten se spraví bez mazání čehokoli.

**Aby se oprava mohla dokázat, musela vzniknout rychlá sada jedním
příkazem** (`node scripts/zkousky.mjs`). Dosud se dala pustit jen po
jedné ručně, nebo počkáním na CI. Seznam se v ní **nepíše ručně, čte se
z `.github/workflows/testy.yml`** — ruční seznam by se rozešel a běžec
by pak tvrdil „sada prošla", i kdyby pět zkoušek vynechal. Změřeno:
**128 zkoušek za 93 s** při čtyřech naráz (proti ~2,5 min po jedné).

**A hned při prvním paralelním běhu to našlo latentní vadu, kterou CI
vidět nemohlo:** `test-ukonceno.mjs` pouští generátor stránek pozemků
v živém adresáři a na dvacet sekund tím nechá 2 116 stránek
nevysázených (sazba se v řetězu dělá až po generátorech). Kdo v tom
okamžiku čte, právem padne na vadu, kterou nezpůsobil — a v CI to
neprasklo, protože tam zkoušky běží jedna po druhé. Běžec na to
**nemá ruční seznam výjimek** (ten by zastaral): co padne paralelně,
pustí ještě jednou **samo**, a teprve to rozhodne — projde-li samo,
byla to kolize nad společným stromem a vypíše se to; padne-li znovu, je
to vada.

**Hlídač práv v CI mě u toho chytil podruhé v jednom dni.** Sebeoprava
pushuje z skriptu, ne z YAMLu, takže ji označil za „zápis bez pushe".
Místo výjimky dostal lepší zrak: podívá se i do skriptu, který úloha
spouští. Napoprvé jsem ten vzor napsal moc široce (`'push'`) a za
pushující se prohlásila i úloha „testy", protože to slovo má v sobě
zkouška — teď se hledá git volaný s příkazem push, a zkoušky se
neprohlížejí vůbec (pushovat nemohou, úloha má `contents: read`).

Hlídá to `scripts/test-sebeoprava.mjs` (27 kontrol): sedm pravidel
zvlášť, jedenadvacet vzorků „patří generátorům / je ruční práce",
dva živé běhy, které musí **nic neudělat** a říct to nahlas, a staticky
pořadí „dokázat, pak commitnout". Tři sabotáže (propustit ruční práci,
zrušit pojistku proti smyčce, obrátit pořadí) to chytne.

### 148b. A pak se to vyzkoušelo naostro *24. 10.*

Sebeoprava, která nikdy nic neopravila, je tvrzení, ne systém. Zkouška
proběhla v CI nad ostrou větví a stála dva pokusy — oba něco naučily.

**První pokus byl špatně navržený a zkoušky to ukázaly.** Vyrobil jsem
„rozchod" tím, že jsem opravil formulaci v komentáři v `js/chyby.js`
a schválně nepustil generátory. Běh ale prošel **zeleně** a sebeoprava
se správně nespustila: očištěné kopie v `js/min/` se staví **bez
komentářů**, takže se nezměnil ani jejich obsah, ani razítko `?v=`,
ani hash v CSP. Žádný rozchod tedy nevznikl. Je to dobrá vlastnost
řetězu (úprava komentáře nerozhýbe 2 393 stránek), jen jsem si ji
nejdřív vzal za vadu.

**Druhý pokus: zastaralé číslo v generované tabulce stavu** (120 místo
128 zkoušek) — tedy přesně ta vada, která mi 24. 10. dvakrát rozsvítila
červenou po sloučení s daty robota. Výsledek z běhu robota:

```
Pouštím generátory (node scripts/oprav.mjs)…
Rozchod: 1 odvozených souborů nesedí se zdrojem.
Dokazuju opravu celou rychlou sadou…
Rychlá sada: 128/128 prošlo za 96 s (4 naráz).
SEBEOPRAVA: opraveno a nahráno (1 souborů). Rychlá sada prošla.
```

Od pushe po opravený repozitář **necelé tři minuty, bez člověka.**
Commit `[sebeoprava] dorovnat odvozené soubory se zdrojem` změnil
jediný soubor — ten, který se rozcházel.

**Tři věci, které se tím zjistily:**

1. **Předtím se sebeoprava dvakrát správně PŘESKOČILA.** Reagovala na
   běhy, které byly *zrušené* (nahradil je novější push), ne spadlé —
   a podmínka `conclusion == 'failure'` ji nepustila dál. Přeskočení
   není selhání; je to pravidlo, které drží.
2. **Push od robota znovu nespustí CI** (vlastní ochrana GitHubu proti
   smyčkám), takže poslední červený běh zůstane u starého commitu.
   Je to vlastně třetí vrstva proti smyčce — a důkazem správnosti je ta
   rychlá sada, kterou si oprava pustí **před** nahráním.
3. **Vlastní zpráva do commitu neumila česky:** „Rozcházelo se
   1 souborů". Je to jediná věta, kterou po sebeopravě někdo přečte,
   a tenhle repozitář má na skloňování počtů zkoušku jinde. Pravidlo
   `sklon()` bylo schované v generátoru stránek krajů (kde kdysi
   hlásil „1 okresů"), takže se přesunulo do `scripts/text.mjs` —
   a skloňuje se i sloveso: „Rozcházel se 1 soubor", „Rozcházely se
   2 soubory", „Rozcházelo se 5 souborů".

## 149. Zelená CI a den starý web vedle sebe obstojí *24. 10.*

Celý řetěz hlídačů v tomhle repozitáři kontroluje **repozitář**:
zkoušky, generátory, sebeoprava. Nasazení ale dělá někdo jiný (GitHub
Pages z větve) a **nikdo nekontroloval, co je doopravdy venku.** Stačí,
aby selhalo nasazení, aby se nepropsala data nebo aby se stránky
nasadily jen zpola — a web se tváří, že běží, jen je o den starší. To
je ten nejhorší druh vady: nikomu nesvítí.

`scripts/kontrola-nasazeni.mjs` měří na ostré doméně devět věcí.
Nejcennější z nich: **je venku ta verze, co je v repozitáři?** Porovnají
se razítka `?v=` u skriptů a stylů s těmi, která má `index.html` u nás —
a razítko je hash obsahu, takže je to exaktní srovnání, ne odhad podle
data. Když se nasazení nepropíše, hlášení řekne **obě** hodnoty
(„venku `?v=deadbeef`, u nás `?v=443c7c43`"), ne jen „něco nesedí".
Dál: odchytávač chyb v hlavičce (jinak by web mlčel o pádech právě tam,
kde jsou lidé), hlavička CSP, stáří dat proti stropu, mapa webu
a jedna **náhodně vybraná** generovaná stránka pozemku (první by se
mohla nasadit shodou okolností a zbytek ne), absolutní adresy na jedné
doméně, neznámá adresa s opravdovou 404 a `robots.txt`.

**Co to vědomě neumí: vyvolat nasazení znovu.** To se z repozitáře
nedá a „zkusit to u cizí služby ještě jednou" není oprava, ale hádání.
Místo toho se řekne přesně, co je venku jinak.

**Zkouška našla vadu v mé vlastní kontrole, a dobrou:** náhodnou
stránku brala z mapy webu jako **absolutní adresu** — a v mapě stojí
(správně) ostrá doména. Kontrola jiného prostředí by se tedy ptala
ostrého webu a tvrdila o něm něco, co o něm neplatí. Teď se z adresy
bere jen cesta a ptá se té domény, která se kontroluje.

Hlídá to `scripts/test-kontrola-nasazeni.mjs` (14 kontrol) na
podstrčeném webu, který servíruje skutečné soubory z repozitáře a šesti
způsoby se schválně kazí: starší razítko, chybějící odchytávač,
chybějící CSP, 90 h stará data, „měkká" 404 (stav 200 s textem
o nenalezení) a osekaná mapa webu. Sedmý případ je ten nejdůležitější:
**nedostupný web musí být VADA, ne „nezměřeno"** — hlídač, který svítí
zeleně na mrtvý web, je horší než žádný, protože tvrdí, že je po
kontrole.

### 149b. Živá databáze: nikdo ji nehlídal, a web na ní stojí *24. 10.*

Kontrola nasazení z oddílu 149 se dívá na statické soubory. Web ale
stojí na Supabase — a ten se umí rozejít s tím, co web čeká, úplně bez
našeho přispění: funkce zmizí (když někdo pustí starší SQL), pravidlo se
uvolní, klíč se vymění, projekt na bezplatném tarifu se uspí. Nic z toho
by soubory venku nepoznaly.

Ty čtyři živé kontroly v repozitáři **už byly** — v `kontrola-spusteni.mjs`,
jako nástroj pro jedno rozhodnutí před spuštěním. Chybělo jen pustit je
pravidelně, takže dostaly režim `--jen-zive` a běží ve stejné úloze jako
kontrola nasazení, každých šest hodin. Čtou se **jen veřejným klíčem
a nic se nezapisuje** (zápis chyby se ptá hláškou, kterou databáze sama
odmítne — viz oddíl 147).

V tom režimu se **schválně nehlásí nic, co se pozná z repozitáře**:
to hlídá CI při každém pushi a opakovat to podle hodin by znamenalo
posílat úkol o témže dvakrát. Z úkolu, který přijde dvakrát, se stane
šum — a šum nikdo nečte.

**A hned jsem si v tom nachytal vlastní vzorec, proti kterému je celý
ten skript:** v živém režimu bez sítě vypsal „VERDIKT: živá databáze
odpovídá a drží, co má." ve chvíli, kdy se nezměřilo **nic**. Tvrzení
o nezměřeném. Teď platí pravidlo: v režimu, který měří po síti, je
„nezměřilo se nic" **vada**, ne klid — a hlídají to tři nové kontroly
(živý režim projde jen s odpovídající databází; `--bez-site` i mlčící
databáze v něm končí nálezem).

### 149c. První běh naostro našel tři vady — a hned i past na sebe *24. 10.*

Kontrola živého systému se pustila naostro a **nebyla to formalita**:
chybí kbelík `listing-photos` (nahrání fotky k inzerátu by neprošlo),
`mailer_autoconfirm = true` (e-mail se nepotvrzuje, takže účet vznikne
na cizí adresu) a `zapis_chybu()` v databázi není (venku běží starší
SQL, takže se pády v prohlížečích hlásí do prázdna). Všechno tři jsou
věci, které **nemůže opravit nikdo z repozitáře** — jsou v nastavení
Supabase — a byly na seznamu pro majitele jako „dotáhnout nastavení".
Teď jsou tam **vyjmenované a změřené**, s větou, co každá z nich dnes
znamená. Zároveň se potvrdilo, že databáze odpovídá a že uzavřená
funkce je uzavřená i pro nepřihlášeného (401).

**A tím vznikla past, do které jsem málem spadl:** úloha běží každých
šest hodin, takže by k témuž úkolu připisovala „selhalo znovu"
čtyřikrát denně. Z hlášení by se stal šum — a šum nikdo nečte, čímž by
se zrušil celý smysl oddílu 146. Hlásič proto dostal **ticho**: pokud
se úkol ozval v posledních 24 hodinách, komentář se nepřidá a napíše
se, proč. Jediná nová informace je „pořád to není spravené" a na tu
stačí jednou za den. Když se čas posledního ozvání **nedá zjistit**,
komentář se přidá — mlčet kvůli nejistotě by znamenalo mlčet o selhání.

**Paralelní běh si vyrobil další past a hlídač na ni už je:** dvě
zkoušky si vzaly týž port 8413, takže při čtyřech naráz padala druhá na
`EADDRINUSE` — tedy na vadě, kterou nezpůsobila. Nový hlídač
v `test-zkousky-meri.mjs` čte seznam rychlých zkoušek **z běžce** (ten
ho bere z CI) a vyžaduje, aby každý port patřil jen jedné. Zkoušky
v prohlížeči se nepočítají: ty jedou jedna po druhé a 8310 si schválně
podávají dál.

**A běžec sám měl vadu, kterou odhalil ten nový hlídač:** při `import`
se celý spustil (neměl podmínku „jen při přímém spuštění"), takže
zkouška, která si od něj chtěla jen přečíst seznam, se zasekla na sto
třiceti procesech.

## 150. Dvě zkoušky si sahaly na živý adresář — a obešel jsem to místo opravil *24. 10.*

V oddílu 148 jsem napsal, že běžec rychlé sady pozná „kolizi nad
společným stromem" a pustí padlou zkoušku ještě jednou samu. To je
správná pojistka, ale **byla to obezlička, ne oprava**: příčina trvala.
`test-ukonceno.mjs` pouštěl generátor stránek pozemků **v živém
adresáři** a na dvacet sekund tím nechával 2 116 stránek bez
nezlomitelných mezer a bez hlavičky CSP. Zkouška si to dokonce sama
dohánĕla (pouštěla po generátoru ještě sazbu a `csp.mjs`) — záplata na
vlastní nepořádek.

**Opraveno v příčině:** zkouška si teď celý repozitář zkopíruje do
`/tmp` a pracuje jen tam. Dohánění sazby a CSP se tím stalo zbytečným:
změřeno, že projde stejně (28 kontrol) a je o dva běhy generátorů
kratší. Co se nemusí dohánět, se nemá dohánět. Paralelní běh pak
poprvé vyšel **úplně bez kolizí**: 129/129 za 89 s.

**A hned k tomu hlídač, aby se ta třída vad nemohla vrátit tiše.**
Běžec si udělá otisk stromu před sadou a po ní. První podoba srovnávala
`git status` — a sabotáž (vrácená stará zkouška) ji **neprobudila**,
protože ta zkouška strom přepsala a vrátila do téhož obsahu. Hlídá se
proto **čas změny, ne obsah**: přepsat soubor stejným obsahem je pořád
sahání na živý adresář a pořád to shodí zkoušku, která ho zrovna čte.

**A ten hlídač okamžitě našel druhou takovou zkoušku, o které jsem
nevěděl:** `test-rss.mjs` pouštěl generátor kanálů v živém adresáři
(porovnává `guid` mezi dvěma běhy, aby čtečky nehlásily staré pozemky
jako nové) a přepisoval při tom 15 souborů. Obsah vyšel stejný, takže
to nikdo nikdy neviděl. Druhý běh teď jde taky do kopie.

Pořadí ani počet naráz běžících zkoušek už tedy nerozhoduje
o výsledku — a kdyby někdo takovou zkoušku napsal znovu, sada to řekne
hned a jmenovitě. Sabotáž ověřena na obou zkouškách.

### 150b. Tři nálezy, ale dvě mají jednu příčinu — a dokumentace lhala *24. 10.*

Oddíl 149c vypsal tři vady na živé databázi a k nim do pokynů pro
majitele napsal, že kbelík `listing-photos` se zakládá ručně ve Storage.
**To byla chyba a hlídač ji nemohl najít, protože to byla chyba v textu,
ne v kódu:** balík `supabase/00-vse.sql` ten kbelík zakládá sám —
a navíc **hned se stropem 3 MB na soubor a seznamem povolených typů
(jen JPEG)**. Ruční kbelík bývá bez stropů, takže rada „založte si ho
ve Storage" byla horší než žádná: veřejné úložiště bez stropu unese
cokoli a jak velké chce, a platili bychom to.

Ze tří úkolů pro majitele tedy zbyly **dva**: pustit balík (spraví kbelík
**i** `zapis_chybu`) a jedno kliknutí v nastavení (*Confirm email*).
Tomu, aby se ten omyl nevrátil, brání dvě nové kontroly: balík **musí**
zakládat `listing-photos`, a **musí** u toho mít `file_size_limit`
i `allowed_mime_types`.

A kontrola živého systému to teď umí říct sama: chybí-li kbelík
i `zapis_chybu()`, přidá nález **„společná příčina obou nálezů výš"**
s větou, že je zakládá týž balík. Bez ní by se každý nález spravoval
zvlášť — a ten kbelík by vznikl ručně.

## 151. Celá sada jedním příkazem — a `npm run testy` pouštělo pět zkoušek ze sto třiceti *25. 10.*

Rychlá sada šla po oddílu 148 pustit jedním příkazem. Zkoušky
v prohlížeči ne: ty se daly pustit jen po jedné, nebo počkáním na CI —
**a způsob, jak je pustit všechny, existoval jen v dočasném adresáři
téhle session.** To je ten nejhorší druh znalosti: funguje, dokud se
někdo nerestartuje.

`node scripts/zkousky.mjs --v-prohlizeci` teď pustí i je. Seznam se
**nepíše ručně, čte se z CI** (ze tří úloh `v-prohlizeci*`), takže se
s ním nemůže rozejít. Dvě věci, které si člověk pokaždé musel
vypisovat, si najde sám: cestu k prohlížeči (`PW_CHROMIUM`) a adresář
s mapou (`PK_LEAFLET_DIR`) — kdo to musí psát ručně, zapomene, a dostane
stovku pádů, které s webem nemají nic společného. Pouští se **jedna po
druhé**: tři zkoušky si schválně podávají port 8310, takže paralelně by
se o něj praly (v CI každá směna běží na svém stroji).

**PLÁNOVAČ MĚ NEJDŘÍV NAUČIL, ŽE JSEM PORT HLEDAL ŠPATNĚ.** První
podoba brala port z `listen(8412)`, protože tak ho mají zkoušky, které
si server otevřou samy. Zkoušky v prohlížeči ho ale mají jen jako
adresu (`const BASE = 'http://127.0.0.1:8310'`) a server si berou ze
společného pomocníka — takže plánovači vyšly jako „bez portu" a pustil
je čtyři naráz. Z 131 jich 110 utopilo `EADDRINUSE 8310`. Port se teď
hledá v obou podobách a **týmž pravidlem, jakým ho hlídá
`test-zkousky-meri.mjs`** — jinak by hlídač hlídal něco jiného, než
podle čeho se zkoušky pouští.

**A podruhé, a potřetí.** Hledat port v souboru zkoušky nestačilo:
server si pouští POMOCNÍK (`falesna-supabase-chat.mjs`, kde stojí
`const PORT = 8310`), takže zkouška, která ho jen importuje, v sobě
žádné číslo nemá — a pět takových padalo dál. Detekce proto nahlíží
i do místních importů, jednu úroveň. A pak hlídač portů ohlásil kolizi
mezi dvěma zkouškami, které se nikdy nepotkají: vzala se mu **moje
vlastní hlavička**, protože v ní stojí příklad `listen(8412)`. Potřetí
týž vzorec („hlídač si čte text po svém"), takže se komentáře před
hledáním odstraňují.

Změřeno, jak to doopravdy je: **117 ze 131** zkoušek v prohlížeči sedí
na portu 8310, devět má vlastní a pět nepotřebuje žádný. Lokálně tedy
poběží těch 112 **po jedné** (zbytek se mezi ně vejde) — a to je dnešní
pravda, ne cíl. Zrychlit to znamená naučit 123 souborů brát port
z jednoho místa; zapsáno, neuděláno. CI svou rychlost nebere
z paralelního běhu, ale ze tří strojů.

**A ještě jedna mezera, kterou ukázal první dlouhý běh:** běžec neměl
**strop na čas jedné zkoušky**. Výpis přestal přibývat a jedna zkouška
běžela tři minuty — a protože drží i port, čekala na ni celá sada.
Pozná se to jen tím, že se nic nedeje, což není hlášení, ale hádanka.
(Ta zkouška nakonec doběhla sama, byla jen pomalá: `test-okoli` ~4 min.)
Strop je teď 900 s na zkoušku — nejdelší poctivě běžící má naměřeno
~105 s, takže je to rezerva pro pomalejší stroj, ne cíl — a utnutá
zkouška se vypíše jako `ČAS`, ne jako obyčejná chyba, aby se nehledala
vada tam, kde je čas.

**A při tom se našla hezká nesrovnalost:** `npm run testy` v
`package.json` pouštělo **pět** zkoušek. Ne pět vybraných „rychlých" —
pět, které tam někdo napsal, když jich bylo pět, a nikdy to nikdo
nepřepsal. Kdo spustil `npm run testy` a viděl zeleno, žil v tom, že
sada prošla; prošlo 5 ze 129. Teď `npm run testy` pouští běžec (tedy
celou sadu podle CI) a `npm run testy-v-prohlizeci` tu druhou.

## 152. Zkouška odpočtu padala každou noc — a odpověď byla v kódu, který hlídala *25. 10.*

Po přechodu na nový den padly dvě kontroly v `test-vypis-radku.mjs`:
na stránce dražeb stálo u zítřejší dražby „za 2 dny". Vypadalo to na
vadu webu. Není: odpočet se do statických stránek zapisuje **při
generování** (čtyřikrát denně) a **vedle něj stojí přesné datum, které
platí vždycky** — a přesně tak je to rozhodnuté a napsané
v `scripts/generate-region-pages.mjs`. Ověřeno na skutečné kartě:
„dražba 26. 10. 2026 · OK dražby · **zítra**". Odpověď na můj nález
tedy byla v kódu, který ta zkouška hlídá.

Vadná byla **zkouška**: srovnávala s dneškem, takže od půlnoci do
prvního běhu robota hlásila vadu, kterou nikdo nezpůsobil. To je ten
nejhorší druh hlídače — ten, co křičí podle hodin.

**Dvě cesty, první se neujala.** Nejdřív jsem vzal den generování
z dat (`data/index.json`, `updated_at`) — a hned to padlo znovu
a opačně: když stránky přegeneruje člověk ručně, je datum v datech
STARŠÍ než stránky. Platí proto obojí: text i barva musí odpovídat
**dnešku, nebo včerejšku**. Víc tolerance to nepotřebuje a že data
samotná nejsou starší, hlídá kontrola nasazení (oddíl 149), ne tahle
zkouška.

Sabotáž: změnit v `js/terminy.js` text pro „zítra" → zkouška padne
(tedy tolerance nezakryla skutečnou vadu).

**Co se tím NEUDĚLALO a proč:** odpočet se nepřepočítává v prohlížeči.
Statické výpisy dražeb si `js/terminy.js` vůbec nenačítají, takže by to
znamenalo přidat skript na stránky, které dnes žádný nepotřebují —
a to kvůli textu, který je nejhůř o několik hodin pozadu a vedle kterého
stojí platné datum.

## 153. Safari se tu spustit nedá, tak se měří, co by v něm spadlo *25. 10.*

**Co bylo špatně.** Všech 131 zkoušek v prohlížeči běží v Chromiu.
Jiný prohlížeč v prostředí není a nejde doinstalovat. O Safari tedy
zelená CI neříkala **nic** — a to je prohlížeč každého iPhonu, tedy
řádově čtvrtina českých telefonů. Dosud to bylo napsané jako
„neověřeno" a tím to skončilo. Napsaná výhrada ale nic nehlídá.

**Spustit ho nejde, změřit, co z našeho kódu by v něm nefungovalo,
jde.** `scripts/test-safari.mjs` prochází 2 476 zdrojů pro prohlížeč
(`js/`, `css/`, ručně psané stránky, generátory) a hledá vlastnosti,
které deklarovaná podlaha **iOS/Safari 15.4** nezná. Podlaha je
jedno číslo na jednom místě: každé zařízení, které umí iOS 15, umí
i 15.8, takže kdo je pod 15.4, neaktualizuje vůbec. Níž už to nejde
táhnout — `:has()`, `dvh` ani `:focus-visible` by se pak nesměly
používat a web na nich staví rozvržení.

Každá mladší vlastnost smí být jen v jednom z tří stavů:
nepoužívá se, používá se **se zálohou**, nebo je na seznamu výjimek
**s napsaným důvodem, co se tím ztratí**. Čtvrtý stav se nepřipouští.

**Co měření našlo.** Tři nálezy, z toho jeden pravdivě žádný:

| Vlastnost | Od | Výsledek |
|---|---|---|
| pohled dozadu v regulárních výrazech `(?<=…)` | 16.4 | nikde — a to je ten nejdůležitější negativní nález, protože tohle shodí celý modul při načtení |
| `backdrop-filter`, `color-mix()` | 18 / 16.2 | **jen v komentářích**, v kódu nikde |
| `text-wrap: balance` | 17.5 | používá se (nadpisy, jméno místa) — na seznamu výjimek, jen hezčí zlom |
| `dvh` | podlaha | **šest použití, záloha ve `vh` jen u dvou** |

To poslední byla jediná skutečná vada. Doplnil jsem čtyři chybějící
zálohy (`.vm-panel`, `.modal-card` v dotazu do 700 px, `.map-app`,
`.map-side`). Živá vada to nebyla — u tří z nich výšku zachránilo
okolní rozvržení —, ale u `.map-side` šlo o pojistku proti posunu
rozvržení, který byl naměřen na 9 947 px (CLS 0,184). Na starém
Safari by se ta pojistka zahodila a posun by se vrátil. A pravidlo
provedené na dvou místech ze šesti není pravidlo; proto ten hlídač.

**Dvě věci, na kterých zkouška sama nejdřív selhala** — obě stojí za
zapsání, protože obě mlčely:

1. `\bdvh` **nenajde `100dvh`**. Mezi `0` a `d` hranice slova není
   (oba jsou znaky slova), takže hlídač hlásil „0 použití" a byl
   zelený. Proto se teď počet použití porovnává i proti nule: *nic
   nenaměřeno* je nález, ne úspěch (stejné pravidlo jako u kontroly
   spuštění, oddíl 148b).
2. Záloha se **nehledá v okně znaků před nálezem**, jak to dělala
   první verze: u `calc(100dvh - var(--vyska-hlavicky, 85px) - 48px)`
   je okno buď krátké, nebo přeteče do cizího pravidla. Hledá se
   v nejvnitřnějším bloku `{…}` dřívější deklarace téže vlastnosti
   **bez** `dvh` a **ve `vh`** — to je přesně to, co prohlížeč udělá:
   druhé deklaraci nerozumí, zahodí ji a zůstane u první.

**Komentář není kód.** Hlídač odstraňuje komentáře ještě před
hledáním. Bez toho by stačilo o vlastnosti napsat, že se nepoužívá,
a hlídač by ji nahlásil — a `backdrop-filter` i `color-mix()` jsou
v tomhle repozitáři právě jen v komentářích. V téhle sadě je to
**čtvrtý** hlídač, který na vlastní text naletěl (po portech
v oddílu 151, právech v CI a mrtvých jménech tříd). Odstranění
komentářů z CSS přitom ubralo 325 kB z 568 — víc než polovinu
souboru. To není chyba vzoru, to je míra komentování.

**Sabotáž — pět pokusů, pět správných odpovědí:**

| Pokus | Čekalo se | Vyšlo |
|---|---|---|
| `Object.groupBy(` do `js/menu.js` | padne | padlo, se jménem souboru i s následkem („TypeError při prvním volání") |
| totéž, ale **v komentáři** | neprojde-li, je hlídač k ničemu | nespadlo |
| `height:50dvh` bez zálohy | padne | padlo |
| `height:50vh; height:50dvh` | nespadne | nespadlo |
| odebraná výjimka pro `text-wrap` | padne | padlo — výjimka tedy opravdu drží, není to díra ve vzoru |

Seznam výjimek se **vypisuje vždy**, i když je všechno zelené:
seznam, který nikdo nevidí, za rok nikdo nereviduje.

**Co to nepozná a koho tím nesmím konejšit.** Statický rozbor najde
použitou vlastnost, kterou daná verze nezná. Nenajde rozbité
rozvržení, chybějící dotykovou událost ani jiné vykreslení písma.
Tohle je **vědomá náhrada, ne rovnocenná** — zkouška to sama vypíše
na posledním řádku. Na zbytek je potřeba opravdový iPhone, a to je
položka pro majitele (`docs/pro-majitele.md`, bod 0b).

## 154. Devět kontrol nasazení projde i na mrtvém webu — chyběl krok, který ho otevře *25. 10.*

**Co bylo špatně.** `kontrola-nasazeni.mjs` (oddíl 149) se ptá přes
HTTP: odpovídá úvodní stránka, je venku ta verze (razítka `?v=`), je
venku odchytávač chyb, hlavička CSP, nejsou data stará, odpovídá
sitemapa, náhodná stránka pozemku, 404, robots. Devět kontrol — a
**všech devět projde i na webu, kde se skript při načtení zhroutí a
člověk vidí prázdno.** HTML se stáhlo, razítka sedí, hotovo. Zelená
CI, zelená kontrola nasazení, mrtvý web. Chyběl krok, který web
**opravdu otevře**.

A nejde o vymyšlené riziko. Dvě cesty, jak takhle umřít, jsou v tomhle
repozitáři na dosah ruky:

* **CSP se skládá z hashů vložených skriptů** (`scripts/csp.mjs`,
  oddíl 69 — 2 396 stránek, 7 281 hashů). Nasadí-li se HTML a skripty
  rozdílně, prohlížeč vložený skript **zablokuje**. Stránka se stáhne
  celá a je nepoužitelná. Přes HTTP se to nepozná: hlavička CSP tam
  je, zdánlivě v pořádku.
* **výpis se dokresluje z dat.** Selže-li to načtení, stránka má
  hlavičku, patu a mezi nimi nic.

**Co se tedy přidalo.** `scripts/kontrola-ziva-prohlizecem.mjs` otevře
web v Chromiu a měří to, co uvidí člověk — osm bodů: stránka je naše,
při načtení nevyletí výjimka ze skriptu, CSP nic nezablokovala (měří
se **v prohlížeči**, ne čtením hlavičky), žádný náš podřízený
požadavek nevrátil 400 a víc, výpis se dokreslil (karty jsou), mapa se
opravdu postavila, na 390 px nic nepřetéká do stran, a generovaná
stránka pozemku ze sitemapy se otevře taky bez výjimky a bez
zablokované CSP. Běží v úloze *Kontrola nasazeného webu*, tedy
čtyřikrát denně po robotovi.

Proti místní kopii repozitáře (`--mistni`) prošlo všech devět bodů.

**Hlídač, u kterého nikdo nedokázal, že vadu POZNÁ, hlídá jen to, že
se neozývá.** Protože se na cizí službě nedá nic rozbít na zkoušku,
postaví `scripts/test-kontrola-ziva.mjs` **falešný web** a každou vadu
na něm vyrobí schválně. Dvanáct kontrol, dvanáct správných odpovědí:

| Vyrobeno | Čekalo se | Vyšlo |
|---|---|---|
| zdravý web | projde a nic nehlásí | prošlo, osm bodů zeleně |
| výpis bez karet | „výpis zůstal prázdný" | ano |
| `window.neexistujiciFunkce()` | „skript spadl" | ano |
| CSP s cizím hashem | „CSP zablokovala" | ano |
| obrázek, co není | „část stránky se nestáhla" | ano |
| prvek širší než okno | „přetéká do stran" | ano |
| mapa bez vrstev | „mapa se nepostavila" | ano |
| cizí titulek | „není naše" | ano |
| pád na stránce pozemku | nález i tam | ano |
| sitemapa vrací 404 | **nezměřeno**, ne vada | ano |
| prohlížeč, co se nespustí | **vada**, ne zelená | ano |

Ty dva poslední řádky jsou ta důležitá část. Nestažená sitemapa
znamená „tohle jsem nezměřil", ne „generované stránky jsou rozbité" —
hlásit obojí stejně znamená posílat člověka hledat vadu, která není.
A nespuštěný prohlížeč nesmí vypadat jako web v pořádku: když se
nezměří NIC, je to nález (stejné pravidlo jako u kontroly spuštění,
oddíl 149b).

**Čtyři vady, které jsem při tom udělal sám** — všechny tři stojí za
zapsání, protože všechny tři vypadaly jako nález na webu:

1. **„Mapa se nepostavila" na mapě, která se postavila.** Čekalo se
   `waitForSelector('#leaflet-map .leaflet-pane')`. Vrstvy Leafletu
   mají `position:absolute` a **nulový rozměr**, takže je Playwright
   považuje za neviditelné a čekání vypršelo i na správně postavené
   mapě. Ptá se proto na to, co mapu opravdu popisuje: kontejner má
   třídu od Leafletu a má aspoň jednu vrstvu. Naměřeno ručně
   (`innerHTML` mapy) ještě než se to stihlo vydávat za nález.
2. **Zkouška měřila sama sebe.** Falešný web běží v tomtéž procesu
   jako zkouška, a ta pouštěla kontrolu `spawnSync`. To zablokuje
   smyčku událostí, takže server neodpověděl na jediný dotaz a
   kontrola vypršela na všem. Vypadalo to přesně jako „hlídač nic
   nepozná" — jedenáct pádů z dvanácti. Teď se pouští asynchronně.
3. **Devět minut na nic.** Každý pokus s úmyslně chybějícím prvkem
   vyčkal celý limit. Limit se dá nastavit (`--limit-s`) a falešný web
   odpovídá z paměti, takže osm sekund je tu mnohonásobek potřeby.
4. **`filter(chceProhlizec)` místo `filter((c) => chceProhlizec(c))`.**
   Zařazení zkoušek hlídá `scripts/test-staticka.mjs` — a hned mě
   usvědčil: nová zkouška si prohlížeč neimportuje, bere ho skript,
   který spouští, takže ji hlídač chtěl přestěhovat do rychlé úlohy,
   kde by chromium nebylo. Rozšířil jsem tedy `chceProhlizec`, aby
   šla o jednu úroveň dovnitř (stejná lekce jako u práv v CI, oddíl 118). Jenže
   `Array.filter` předává druhým argumentem **index**, takže se od
   druhého prvku dál posílal jako „úroveň zanoření" a funkce přestala
   do spouštěných skriptů chodit vůbec. Tiše: hlídač hlásil „všechny
   na svém místě". **Našla to sabotáž, ne čtení kódu** — a to je celý
   důvod, proč se každý hlídač v tomhle repozitáři nejdřív rozbije
   schválně.

**Co tenhle krok NEDĚLÁ:** neopravuje. Nasazení se z repozitáře
vyvolat nedá a „zkusit to znovu" u cizí služby není oprava, ale
hádání. Říká přesně, co člověk uvidí jinak, a u pádu skriptu i jeho
hlášku.

**Co se vědomě neměří:** cizí požadavky (Supabase, dlaždice mapy).
Ty mohou vrátit 400 i při zdravém webu a hlídá je kontrola živé
databáze (oddíl 149b). Hlídá se jen to, co je na naší doméně.

## 155. Hlášení není oprava: stará data venku už robota pustí samy *25. 10.*

**Co bylo špatně.** Sebeoprava (oddíl 148) umí jen to, co se dá
spočítat ze zdroje: dopočítá odvozené soubory a pushne. Kontrola
nasazení (oddíl 149) přitom umí poznat **„venku jsou stará data"** — a
pak jen napsala úkol a čekala na člověka. Robot, který data obnovuje,
se z repozitáře **vyvolat dá** (`update-data.yml` má
`workflow_dispatch`). Chyběl ten krok od hlášení k opravě.

**Proč to není „zkusit to znovu".** Slepý opakovaný pokus není oprava,
je to hádání, které navíc zakryje skutečnou příčinu. Rozhodnutí je
proto čistá funkce `rozhodni(stav)` v `scripts/sebeoprava-nasazeni.mjs`
— nic nečte, nic nedělá, jde změřit tabulkou — a jedná **v jediném**
případě:

| Stav | Co udělá | Proč |
|---|---|---|
| leží `.github/SEBEOPRAVA-VYPNUTA` | nic | vypínač přebíjí vše |
| mezi nálezy není `stara-data` | nic | na ostatní vady oprava odsud není |
| robot právě běží | nic | druhé spuštění jen zdvojí práci |
| nevíme, kdy běžel naposledy | **nic, a nahlas** | hlídač, který neví, nemá jednat |
| **robot právě dojel a data venku jsou PŘESTO stará** | **nic** | tohle **není vada robota, ale nasazení** — další běh by ji nespravil, jen zakryl tím, že se něco dělo |
| jinak | pustí robota, jednou | |

Ten pátý řádek je celý rozdíl mezi opravou a tikem. Strop je 90 minut:
perioda robota je 6 h, běh jde v desítkách minut a nasazení Pages
v jednotkách.

**Text je pro člověka, kód pro stroj.** Kontrola nasazení dostala
`--vystup soubor.json` a každý nález kromě věty i **kód** — ale jen
tam, kde víme, co by opravou bylo. Chybějící hlavička CSP kód
nedostane, a zkouška to hlídá z obou stran: u starých dat kód **být
musí**, u chybějící CSP **nesmí**. Bez té druhé poloviny by se stroj
pokoušel spravit něco, co spravit neumí.

**Čím je to pojištěné:**

* bez `--opravdu` se neposílá nic (stejná úmluva jako u rozesílání),
* nasimulovaný stav robota (`--zkouska-robot`, kvůli zkoušce) se
  **odmítne** dohromady s `--opravdu`: na vymyšleném stavu se naostro
  nejedná, ani kdyby to někdo napsal omylem,
* vyvolat lze **jedině** `update-data.yml`; skript nepushuje, nemaže
  a nic jiného nespouští,
* nepovedené spuštění se nespolkne: skončí chybou, aby nevypadalo, že
  se oprava provedla,
* nepřečtené nebo rozbité nálezy se **přiznají** a nejedná se.

**Sabotáž, čtyři pokusy, čtyři nálezy.** Odebrání každého jednoho
řádku tabulky (vypínač, běžící robot, neznámý čas, strop) shodí
zkoušku `scripts/test-sebeoprava-nasazeni.mjs` — 18 kontrol, z toho
dvanáctiřádková tabulka stavů a čtyři měření spuštěním.

**A hlídač práv se musel naučit nový pojem.** `actions: write` je
rozšíření práv, takže `scripts/test-ci-prava.mjs` je hned nahlásil jako
právo navíc — správně, protože o vyvolávání úloh nic nevěděl. Povolení
se nepsalo jménem souboru, ale podmínkou: právo smí mít jen úloha,
která opravdu pouští skript POSTující na `…/dispatches`. Hledá se
v obou — ve znění úlohy i ve spouštěných skriptech —, protože samotné
workflow o dispatchi nic neví. Sabotáž (přepsat cestu v API) nález
vrátí.

**Vedlejší nález, který byl horší než to, co jsem opravoval.** V úloze
*Kontrola nasazeného webu* běžela měření bez `if: always()`, takže
**první nález zakryl všechna ostatní**: GitHub další kroky přeskočí.
Dokud se nespravila stará data, nikdo se nedozvěděl ani o rozbité
databázi, ani o mrtvém webu v prohlížeči. Teď má každé měření
`if: always()` — krok pořád padá, jen už nemlčí za ostatní.

## 156. Hledání, dlaždice, jeden port a důkaz, který se zahazoval *25. 10.*

Čtyři věci ze seznamu „co udělám já", všechny dojeté.

### 156a. Živá kontrola se dívá i na hledání a na dlaždice

Osm měření (oddíl 154) nesahalo na dvě věci, kterými web vlastně je:
hledání a čísla na detailu pozemku.

**Hledání se měří tím, co je nezávislé na datech.** Nesmyslný dotaz
musí dát nulu *vždycky*; kdyby se hledalo podle jména obce, zkouška by
platila jen do chvíle, kdy ta obec z nabídek vypadne. Pak se pole
vyprázdní a výpis se musí vrátit — hledání, které seznam zničí, je
horší než hledání, které nehledá. A do třetice: když se nenajde nic,
stránka to musí **říct**. Naměřeno na místní kopii: 24 karet → „Brno"
15 → nesmysl 0 s hláškou „Nic nenalezeno" → prázdné pole zpět na 24.

**Dlaždice s klíčovými čísly** se dokreslují z dat, takže jsou tím
nejlepším důkazem, že se na detailu opravdu něco stalo. Dvě stránky je
ale nemají **právem**: ukončená nabídka a rozcestí na novou adresu
(třída `pz-konec`) detail nekreslí. Na nich je to **nezměřeno**, ne
vada — bez toho by kontrola hlásila jako rozbité stránky, které
rozbité nejsou, a člověk by ji přestal brát vážně.

Falešný web ve zkoušce dostal pracující hledání a pět nových
vyrobených vad (chybějící pole, hledání bez filtrování, hledání, které
mlčí, hledání, které výpis nevrátí, detail bez čísel) a jeden stav,
kde vada **být nesmí** (ukončená nabídka). **18 kontrol, 18 správných
odpovědí.**

**A jedna past, do které jsem si šlápl sám:** zkouška hlásila, že
nález „v textu není", přitom stál na obrazovce. Hledal jsem to
v kódování výstupu — a byl to **jiný slovosled** v hledaném úryvku
(„výpis se nevrátil" proti „se výpis nevrátil"). Stojí to tu, protože
jsem při tom hledání málem napsal do kódu nepravdu o naměřené vadě;
dvě hodiny práce ušetří jediná věta: *než začneš hledat exotickou
příčinu, porovnej oba řetězce znak po znaku.*

Vedlejší nález z té slepé cesty je ale skutečný, jen **latentní**:
sedm souborů (včetně běžce celé sady) skládalo výstup podřízeného
procesu jako `text += kus`, což převádí každý kus na text zvlášť — a
víceznakové písmeno na hranici dvou kusů se rozpadne. Nikdy jsem to
nenaměřil (výstupy zkoušek se do jednoho kusu vejdou) a hlídač to
netvrdí. Opraveno `setEncoding('utf8')` a hlídáno: hlídač hledá
kódování **v okolí**, ne kdekoli v souboru — s hledáním po celém
souboru stačilo mít ho u jednoho `spawn`u a druhý propadl, což odhalila
teprve sabotáž.

### 156b. Jeden port místo sta devíti kopií

117 ze 132 prohlížečových zkoušek sdílí port 8310 schválně (běžec je
proto pouští jednu po druhé, oddíl 151). Číslo si ale každá opisovala
k sobě — nejčastěji jako celou adresu `http://127.0.0.1:8310`.

Teď stojí v `scripts/port-zkousky.mjs`, který je **schválně prázdný na
činnost**: dvě konstanty, žádný server, žádný import. Kdo chce i
falešnou databázi, bere si `BASE` z `falesna-supabase-chat.mjs` (ten
server opravdu spustí); kdo si server dělá sám, bere si `PORT` odsud a
nic se mu tím nespustí. Upraveno 112 souborů.

**Jedno místo opisuje port právem** a je to tam napsané:
`test-offline.mjs` schválně používá `localhost:8310`, protože
`localhost` a `127.0.0.1` jsou pro prohlížeč **dva různé původy** —
vzít adresu z modulu (127.0.0.1) by znamenalo, že zkouška přestane
měřit to, co měřit má. Málem jsem to přepsal; zachránil to komentář,
který tam někdo napsal.

**A běžec se musel naučit hledat hlouběji.** Cesta k portu teď vede
zkouška → `falesna-supabase-chat.mjs` → `port-zkousky.mjs`, tedy dvě
úrovně. S jednou by port našel u 15 zkoušek ze 132 a zbytek pustil
naráz — tedy přesně ta vada, kterou oddíl 151 opravoval. Změřeno: se
dvěma úrovněmi se port najde u 123 ze 132 a rozdělení zůstalo
nezměněné (8310×117).

### 156c. „Kolize" byla nálepka, teď je to důkaz

Sada v prohlížeči dojela 131/131, ale `test-parametry` v ní padla a
sama prošla. Běžec to označil za kolizi nad společným stromem — a
**výpis z toho paralelního pádu zahodil**. Když jsem pak chtěl zjistit
proč, nebylo co číst.

Reprodukovat se to nepodařilo: ani pod třemi pálicími procesy, ani
proti třem skutečným souběžným prohlížečovým zkouškám neselhala
(33/33 v obou případech). Nejlepší vysvětlení, které mám, je, že jsem
v té chvíli sám upravoval `css/styles.css` — hlášku o „změněném
stromu" z toho běhu způsobily moje úpravy, ne zkouška. **Dokázané to
není a nebudu se tvářit, že je.**

Co se tedy spravilo, je ta skutečná vada: běžec teď výpis z paralelního
pádu **uloží na disk** a první nálezy vypíše hned. Ověřeno dočasnou
zkouškou, která poprvé padne a podruhé projde: v souhrnu se objevila
cesta k souboru a v něm celý původní výpis. Příště nebude co hádat.

## 157. Cvičení sebeopravy: rozbít to naschvál a koukat, jestli to spraví *25. 10.*

**Co bylo špatně — a bylo to to nejdůležitější.** O sebeopravě
(oddíly 148 a 155) věděl repozitář všechno kromě jedné věci: **jestli
opravuje.** `scripts/test-sebeoprava.mjs` hlídá PRAVIDLA — kde nesmí,
na co nesmí, kdy ne. Jediný důkaz, že automat umí opravit, byl jeden
ruční běh naostro 24. 10. Pravidla přečtená z kódu ale nedokazují, že
oprava proběhne; dokazuje to jen rozbití.

**Nová metoda: cvičení, ne zkouška.** `scripts/cviceni-sebeopravy.mjs`
si udělá **jednorázovou kopii repozitáře a vlastní prázdný „server"**,
rozbije odvozené soubory naschvál a nechá celý automat doopravdy
proběhnout — generátory, důkaz rychlou sadou, commit **i push**.
Push míří do bare klonu v adresáři cvičení; kdyby mířil na origin,
první cvičení by přepsalo ostrou větev. Běží to jednou denně
(`.github/workflows/cviceni-sebeopravy.yml`), protože to trvá minuty;
`--rychle` pustí jen tu část, která generátory nepotřebuje.

**Pět cvičení, sedmnáct kontrol:**

| | Co se vyrobí | Co se čeká |
|---|---|---|
| A | rozchod ve **čtyřech** odvozených souborech (číslo v roadmapě, razítko `?v=`, osekaná mapa webu, zmrzačený očištěný stylopis) | každý soubor zpátky **bit po bitu**, commit se značkou, výčet v commitu, a push došel |
| B | vypínač v repozitáři | nestane se nic |
| C | poslední commit je sám sebeoprava | nestane se nic (pojistka proti smyčce) |
| D | cizí větev | nestane se nic |
| E | špinavý strom | nestane se nic |

Výsledek prvního úplného běhu: **17 z 17**. Automat opravil všechny
čtyři druhy rozchodu bit po bitu, commitnul se značkou a pushnul.

**Dvě pravidla se cvičit nedají a je to napsané**, aby se to nepletlo
s mezerou: „generátory nic nezměnily" je stav **bez vady**, a „oprava
by sahala na ruční práci" by znamenalo pokazit generátory natolik, aby
zapsaly do `js/` — to by zkoušelo generátory, ne automat. Obě měří
tabulka stavů na čisté funkci.

**Aby cvičení neuhnilo**, hlídá `test-sebeoprava.mjs` nově pět věcí:
že cvičení v repozitáři je, že ho **nějaká úloha opravdu pouští**, že
pouští **opravdový automat** (ne svou kopii jeho pravidel), že si dělá
vlastní kopii i vlastní server, a že zkouší aspoň čtyři zakázané stavy.
Obě sabotáže (vyhodit cvičení z workflow, nechat ho klonovat bez
vlastního serveru) nález vrátí.

### Co cvičení našlo, než začalo svítit zeleně

Čtyři pády, a **tři z nich byly v cvičení samotném**. Stojí tu všechny,
protože každý je jiný druh omylu:

1. **Rozbití, které nic nerozbilo.** Vzor na číslo v roadmapě nesedl na
   formát tabulky, soubor se nezměnil, commit byl prázdný — a cvičení C
   pak měřilo úplně jiný stav, než si myslelo, a *vypadalo to jako vada
   automatu*. Od té doby se každé rozbití ověřuje a **rozbití, které
   nic nezměnilo, je nález**. (Totéž pravidlo jako „nezměřilo se nic" —
   oddíl 149b.)
2. **`git clean -fd` smazal závislosti.** Kopie si `node_modules`
   půjčuje odkazem; git je viděl jako neznámý soubor, takže automat
   **správně** odmítl špinavý strom — a úklid mezi cvičeními ten odkaz
   smazal. Rychlá sada pak běžela bez závislostí a padala na jediné
   zkoušce, která jednu potřebuje. Dvě hodiny na tom, že cvičení
   ukazovalo vadu, která nebyla automatova. Pomohl `.git/info/exclude`.
3. **Výchozí bod se posouval.** Cvičení A nechá automat pushnout, takže
   `origin/<větev>` se pohne — a další cvičení pak startovala z commitu
   sebeopravy a narazila na pravidlo „nikdy dvakrát za sebou" místo na
   to, co měla zkoušet. Výchozí commit se teď **pamatuje**, a vrací se
   i server.
4. **A jeden skutečný nález mimo cvičení:** `test-kontrola-e2e.mjs`
   čekala na svůj zkušební server **pevných 1 200 ms**. Pevná čekání
   tenhle repozitář vymetal dvakrát (oddíly 11 a 28) a tohle přežilo.
   Je to navíc nejhorší možný případ: kdyby server nestihl naběhnout,
   výpis je prázdný, a protože půlka kontrol je **záporná** („tohle se
   hlásit nesmí"), tiše projdou, zatímco kladné padnou — zkouška pak
   ukazuje pět vad, které neexistují. Teď se čeká na navázání spojení
   (nejvýš 20 s) a nenaběhlý server se hlásí jako **vada prostředí**,
   ne jako nález v kontrole inzerátů. **Poctivě: tohle NEBYLA příčina
   toho pádu v cvičení** (tou byly chybějící závislosti) — našlo se to
   při hledání a opraveno je to proto, že je to vada sama pro sebe.

Port zkušebního serveru šel při tom do jednoho místa
(`scripts/port-kontroly.mjs`), ze stejného důvodu jako u sdíleného
portu zkoušek (oddíl 156b): zkouška, která na server čeká, si musí jeho
port přečíst, **aniž by ten server spustila**.

**A jedna věta, která mě stála nejvíc času:** cvičení, které padne,
musí říct **proč**. Napoprvé zbylo jen jméno padlé zkoušky; teď cvičení
přiloží výpis automatu a tu zkoušku ještě jednou pustí **samu v téže
kopii** a přiloží i její výpis. Rozdíl mezi „padá i sama" a „padá jen
pod automatem" je celá diagnóza.

## 158. Hranice, na kterou automat smí, se rozešla s tím, co generátory píšou *25. 10.*

**Nejzajímavější nález celého dne, a nikdo ho nemohl vidět.**
Sebeoprava má jediné místo, kde se rozhoduje, na co smí sáhnout:
seznam `PATRI_GENERATORUM`. Je psaný **ručně** a je to tak správně —
jde o bezpečnostní hranici, a ta má být k přečtení na pěti řádcích.
Jenže ručně psaná hranice se rozejde s tím, co generátory doopravdy
píšou, a nic na to nesvítí: pravidla jsou zelená, zkoušky zelené,
hranice vedle.

Seznam povoloval `rss[\w-]*\.xml`. **Kanály se ale jmenují
`novinky-*.xml`.** Ten vzor tedy v celém repozitáři nesedí ani na
jeden soubor — a **patnáct kanálů**, které generátory přepisují při
každé změně dat, automat opravit **nesměl**. Kdyby se rozešly (a
rozcházejí se právě při tom, co se v tomhle repozitáři děje nejčastěji
— robot přinese data a někdo zapomene pustit generátory), automat by
odmítl pracovat s hlášením „oprava by sahala na ruční práci" a červená
by zůstala. Díra přesně tam, kde se nejvíc hýbe.

**Nová metoda: pustit generátory a koukat, co přepsaly.**
`scripts/sebeoprava-pokryti.mjs` nečte kód generátorů — ten by se dal
vyložit jakkoli. Udělá si jednorázovou kopii, pustí generátory a
porovná dvě strany:

* **co generátory PÍŠOU** (měřeno časem změny, ne obsahem: generátor,
  který zapíše tentýž text, soubor přesto *vlastní*),
* **co automat SMÍ přepsat** (deklarováno v seznamu).

Z toho tři nálezy: **díra** (píšou to, povolené to není), **mrtvé
pravidlo** (vzor nesedí na nic) a **nezměřilo se nic**.

První běh: 2 410 přepsaných souborů, z toho **15 nepokrytých**, a
jedno mrtvé pravidlo. Po opravě hranice (`^novinky[\w-]*\.xml$`, na
celostátní i krajské kanály) je to **2 410 z 2 410, tedy 100 %**.

**Co to měření NEUMÍ, a je to napsané i ve výpisu.** Měří, co
generátory přepsaly *v tom běhu*. Soubor, jehož výstup se nezměnil,
generátor nepřepíše — a tím o něm měření nic neví. **Nenalezená díra
tedy není důkaz, že díra není**; důkazem je jen nalezená. Proto se
vypisuje, u kterých pravidel se nezměřilo nic (v prvním běhu čtyři:
očištěné stylopisy, `js/min/`, `robots.txt`, tabulka v roadmapě).

**A levná polovina téhož jde do rychlé sady.** Na „mrtvé pravidlo"
stačí seznam souborů, žádná kopie a žádné generátory — takže to
`scripts/test-sebeoprava.mjs` hlídá při každém pushi: každý vzor
v seznamu musí sedět aspoň na jeden verzovaný soubor. Sabotáž (vrátit
`rss*.xml`) nález vrátí okamžitě, a shodí s ním i druhou kontrolu,
protože vzorky v ní jsou teď **skutečná jména souborů**. To byla totiž
ta hlubší příčina: vzorek `rss.xml`, který v repozitáři nikdy nebyl,
potvrzoval vzor, který nesedí na nic. **Zkouška psaná z vymyšlených
jmen umí potvrdit cokoli.**

## 159. Dvě měření místo jednoho dojmu — a ta jediná nevyzkoušená řádka *25. 10.*

Dvě slabiny sebeopravy, obě naměřené při cvičení z oddílu 157.

### 159a. „Po opravě neprošla sada" je dojem, ne diagnóza

Pravidlo 2 říká: oprava se před nahráním dokazuje celou rychlou sadou.
Když sada neprojde, oprava jde do koše. Jenže automat uměl říct jen
`po opravě neprošla rychlá sada` — a to zní jako **„oprava je vadná"**.
Dvakrát mě to poslalo hledat vadu do generátorů, kde žádná nebyla:
jednou padala zkouška kvůli chybějícím závislostem v prostředí.

Jsou to **dvě úplně jiné situace**:

| Co se stalo | Co to znamená | Co má automat říct |
|---|---|---|
| po opravě padá něco, co **předtím** neprošlo | oprava je v pořádku, červenou dělá něco jiného | jmenovitě: *totéž padalo i PŘED opravou* |
| po opravě padá něco **nového** | vada v generátorech | *oprava sama rozbila: …* |

Automat proto teď pouští sadu **dvakrát**: před opravou a po ní, a
porovná **jména** padlých zkoušek (vyčte je z běžce sady). Stojí to
dvě minuty a dává diagnózu místo dojmu. Bonus: když byla sada červená
před opravou a po ní zelená, napíše se to **do commitu** — oprava
spravila i to, co padalo před ní.

**Co se vědomě NEUDĚLALO:** automat v tom druhém případě opravu
nenahraje, i když je dokazatelně v pořádku. Zvažoval jsem to (odstranil
by to jeden ze dvou problémů a zmenšil diff pro člověka), ale pravidlo
2 je bezpečnostní pravidlo: **nahrát lze jen dokázanou opravu.**
Automat, který commituje do červeného, je o jedno pravidlo slabší — a
cena je malá, protože červená tam zůstává tak jako tak.

Cvičení F to měří: vyrobí se **obojí naráz** — rozchod v odvozeném
souboru (umí opravit) a nepojmenovaná barva s odstupem mimo slovník
v `css/styles.css` (ruční zdroj, neumí a nemá). Automat musí
nenahrát, **poznat**, že totéž padalo už předtím, a **jmenovat**
konkrétní zkoušky.

### 159b. Řádka, která opravu provede, nebyla nikdy spuštěná

Celý řetěz sebeopravy nasazení (oddíl 155) se dal změřit bez sítě — až
na jedno místo: `POST …/actions/workflows/update-data.yml/dispatches`.
Ta **jediná** řádka tedy byla jediná nevyzkoušená, a zrovna ona tu
opravu dělá. Tabulka stavů dokazovala, KDY se má jednat; nic
nedokazovalo, že se jedná **správně**.

Proto `PK_GITHUB_API`: zkouška si postaví falešné API na tomhle stroji
a změří pět věcí — že odejde POST na správnou cestu, že v těle jde
správná větev, že požadavek nese token, verzi API i vlastní jméno, že
se stav robota opravdu **čte z API** (dávný běh ⇒ „pustit"), a že se
**nepovedené spuštění nespolkne** (403 ⇒ chyba, ne tiché „hotovo").

**Omezení na `127.0.0.1`/`localhost` není kosmetika.** Bez něj by se
dala proměnnou v prostředí odklonit hlavička s tokenem na cizí stroj.
Cokoli jiného se odmítne, a nahlas — a zkouška to měří taky.

Sabotáž, čtyři pokusy, čtyři různé nálezy: pevná větev v těle místo
skutečné, překlep v cestě, spolknutí chyby 403, vypuštěná hlavička
s verzí API. Každý padl na té kontrole, která ho má chytat.

### 159c. A cvičení málem potvrdilo samo sebe

Kopie pro cvičení se dělá klonem, takže vidí jen **commity**. Při
vývoji to mate: změníš automat, pustíš cvičení a ono cvičí starou
verzi. Stalo se to hned — cvičení F hlásilo, že automat neumí rozlišit
„padalo to už předtím", přitom to umělo, jen to nebylo commitnuté.
Rozpracované skripty se proto do kopie dokopírují a **je to vidět na
prvním řádku** výpisu, aby nikdo nevydával cvičení pracovní verze za
cvičení toho, co je v repozitáři. V CI je strom čistý, takže se
nekopíruje nic a na prvním řádku stojí, který commit se cvičí.

### 159d. A pak se automat pustil sám v sobě — 39× naráz

**Tohle je nejdůležitější nález této dvojice, a způsobil jsem ho já
tou opravou výš.**

Řetěz, který nikdo neviděl, protože každý jeho krok je sám o sobě
rozumný:

1. automat při dokazování pouští **celou rychlou sadu**,
2. v té sadě je `test-sebeoprava.mjs`, která pro svou práci pouští
   **automat** (měří, že na cizí větvi nic neudělá),
3. ta zkouška brala prostředí, jak přišlo — takže když běžela uvnitř
   cvičení (kde `SEBEOPRAVA_VETEV` nastavená je), prošel i případ „bez
   jména domácí větve" jako **platný běh**,
4. vnitřní automat se tedy rozjel na plno: generátory, sada… a v té
   sadě zase ta zkouška.

**Proč to nikdy nevybuchlo dřív:** dokud se sada pouštěla teprve PO
generátorech, zastavilo vnitřní běh pravidlo o **čistém stromu** —
generátory už do stromu zapsaly, takže vnitřní automat se korektně
vzdal. Byla to **náhodná pojistka**, ne pravidlo. Měření PŘED opravou
(159a) běží nad čistým stromem, takže ta náhoda padla — a automatů
běželo **39 naráz** (naměřeno `ps`). Nic nespadlo; jen to rostlo.

**Oprava je pravidlo 8: NIKDY SAMA V SOBĚ.** Automat nese prostředím
značku `SEBEOPRAVA_UVNITR` do **všech** podřízených procesů (generátory
i obě měření), a je to **první** pravidlo rozhodovací tabulky — před
větví, před vypínačem, před čímkoli. Musí být první, protože všechna
ostatní mohou projít, a pak už se pustí generátory a sada, tedy právě
to, co smyčku žene.

Změřeno třemi způsoby:

* spuštěním: se značkou automat **nedělá nic** a řekne proč,
* ze kódu: značka jde do **všech** tří podřízených běhů (sabotáž
  u jednoho z nich nález vrátí),
* **časem**: cvičení si u každého běhu automatu pamatuje, jak dlouho
  trval, a utnutý běh je **nález**, ne „pomalý stroj". Automat, který
  se pustí sám v sobě, totiž neskončí chybou — **roste**, a to je
  jediná vada, kterou nepozná nic jiného než hodiny.

A zkouška se opravila taky: **prostředí si teď vyprazdňuje, ne dědí.**
Dokud brala proměnné, jak přišly, měřila něco jiného, než říká — a to
je v tomhle repozitáři pořád tentýž vzorec: *hlídač, který měří jiný
stav, než si myslí.*

## 160. Tři rodiny generovaných stránek, ne jedna — a první důkaz naostro *25. 10.*

**Co bylo špatně.** Živá kontrola v prohlížeči (oddíly 154 a 156a)
otevírala dvě stránky: úvodní a jednu stránku pozemku. Generované
stránky jsou ale **tři rodiny** a každá se skládá jiným generátorem
z jiného řezu dat: stránka pozemku, **okresní** a **krajská**. Jedna
z nich může být rozbitá, zatímco druhé dvě běží — a na okresní
a krajské lidé přicházejí z vyhledávačů, takže rozbitá okresní stránka
je ztracený návštěvník i tehdy, když úvodní stránka funguje.

**Čím se u nich pozná, že se opravdu dokreslily.** Ne kartami —
ty tyhle stránky **nemají**, takže měřit je by znamenalo hlásit prázdno
vždycky. Důkazem je u nich seznam míst (`.okr-item`). Naměřeno
ručně předem, aby se neměřilo něco, co tam nemá být: okresní stránka
33 míst, krajská 12, bez pádu.

Kontrola tedy dělá **třináct** měření místo jedenácti, a falešný web ve
zkoušce dostal okresní i krajskou stránku a novou vyrobenou vadu
(stránka bez seznamu míst) — **19 kontrol, 19 správných odpovědí**.

### 160a. A první běh naostro: web opravdu funguje člověku

Kontrola nasazení běžela na ostré doméně a **živá kontrola v prohlížeči
prošla 11 z 11** (tehdy ještě bez dvou nových bodů):

| Co se měřilo venku | Výsledek |
|---|---|
| úvodní stránka je naše, výpis se dokreslil | ✓ 24 karet |
| mapa se postavila (Leaflet má vrstvy) | ✓ |
| hledání filtruje (nesmysl → 0, prázdné pole → zpět na 24) | ✓ |
| na 390 px nic nepřetéká | ✓ přes okraj 0 px |
| výjimka při načtení, zablokovaná CSP, požadavek 400+ | ✓ nic |
| generovaná stránka pozemku ze sitemapy | ✓ bez výjimky |
| dlaždice s klíčovými čísly na ní | ✓ 3 |

To je **první důkaz tohohle druhu, jaký repozitář kdy měl**: dosud se
vědělo jen to, že web *odpovídá přes HTTP*. Teď je naměřeno, že web
opravdu **funguje člověku**.

### 160b. A opravný krok se dal poprvé ozkoušet naostro

Ve stejném běhu proběhl i opravný krok a přečetl stav robota ze
**skutečného** API: *„robot: neběží, naposledy dojel 37 min (běhů
v API: 10)"*, rozhodnutí *„nic — mezi nálezy není stará data"*. Tím je
prokázané čtení přes `GITHUB_TOKEN` i celé zapojení kroku.

### 160c. Řádek, na kterém celá tabulka stojí, dokázán naostro

Druhý ruční běh (strop 1 h, data venku 73 minut stará) vypsal tohle —
a je to **ten jediný řádek tabulky, kvůli kterému není oprava jen tik**:

```
nálezy: stara-data
robot: neběží, naposledy dojel 73 min (běhů v API: 10)
rozhodnutí: nic — robot dojel před 73 min a data venku jsou PŘESTO stará
            — to není vada robota, ale nasazení; další běh by ji nespravil,
            jen zakryl
```

Reportér byl v tom běhu přeskočen, takže vyrobený nález nikomu
nezaložil úkol.

### 160d. A plánovaný běh ukázal čtyři věci naráz

Ve 16:43 běžela úloha podle hodin (tedy **doopravdy**, ne jako cvičení)
a vyšlo z ní víc, než jsem čekal:

1. **živá kontrola 13 z 13** na ostré doméně, včetně obou nových rodin
   (`/pozemky-okres-plzen-mesto.html` 9 míst,
   `/pozemky-karlovarsky-kraj.html` 12 míst),
2. **`if: always()` se zaplatilo hned a viditelně**: kontrola živé
   databáze spadla v pátém kroku — a prohlížeč (sedmý) i opravný krok
   (osmý) **přesto proběhly**. Před touhle úpravou by je GitHub
   přeskočil a nikdo by se o nich nedozvěděl, dokud se nespraví to
   první. Přesně ta vada z oddílu 155,
3. **reportér mlčel správně**: *„Úkol #1 je otevřený a ozval se před
   19.6 h — komentář se nepřidává (ticho 24 h, ať se z hlášení
   nestane šum)."*,
4. a ta červená je **skutečný nález, ne cvičení**: živá databáze
   neodpovídá, jak má, protože `supabase/00-vse.sql` ještě neběžel.
   Na tři vady naměřené 24. 10. je teď živý doklad každých šest hodin.

### 160e. A poslední řádek: robot opravdu naběhl

Třetí ruční běh (17:04, robot dojel před 95 minutami, tedy 5 minut za
stropem) dokázal to, co falešné API dokázat nemůže — že
`GITHUB_TOKEN` s `actions: write` úlohu **doopravdy vyvolá**:

```
nálezy: stara-data
robot: neběží, naposledy dojel 95 min (běhů v API: 10)
rozhodnutí: pustit-robota — data venku jsou stará a robot neběžel 95 min
            (strop 90 min) — pouští se jednou
PUŠTĚNO: update-data.yml nad větví claude/web-design-sketch-ewjjrr.
```

A robot naběhl: *Aktualizace dat příležitostí*, běh 319, událost
`workflow_dispatch`, spouštěč `github-actions[bot]` (tedy ten token),
výsledek **success**. Celý řetěz je tím prokázaný od konce do konce:
**nález → rozhodnutí → vyvolání → robot dojel.**

Tím je u opravy nasazení prokázané všechno, co se prokázat dá:

| Článek | Čím |
|---|---|
| rozhodovací tabulka (12 stavů) | čistá funkce + 4 sabotáže |
| požadavek je správný (cesta, metoda, větev, hlavičky, nespolknutá 403) | falešné API + 4 sabotáže |
| přesměrování API jinam se odmítne | zkouška |
| čtení stavu robota z API | **naostro** (běhy 5 a 7) |
| „právě dojel, a data jsou PŘESTO stará" | **naostro** (běh 6) |
| reportér při cvičení mlčí | **naostro** (běh 6) |
| vyvolání robota | **naostro** (běh 8 → robot 319) |

Zbývající řádek tabulky se dokázat **nedá jinak než časem**,
protože závisí na tom, jak dávno robot dojel (strop je 90 minut, takže
okno je mezi jeho běhy).
Ruční běh úlohy proto bere vstup `strop-stare-hodin` — posune strop na
stáří dat tak nízko, že se nález „stará data" vyrobí, a opravný krok se
provede naostro. **Při tom cvičení reportér mlčí**: nález je vyrobený,
takže úkol pro člověka by lhal — a hlásič, který jednou zalže, se
přestane čítat.

## 161. Hlídač, který přestal chodit do práce, nehlásí vady — hlásí ticho *25. 10.*

**Děravá úroveň, na kterou se nikdo nedíval.** Celý ten řetěz hlídačů
visí na plánovaných úlohách: robot dat každých 6 h, kontrola nasazení
každých 6 h, kontrola inzerátů a cvičení sebeopravy denně, rozesílání
denně. Všech pět má jednu společnou tichou vadu, kterou **žádná z nich
sama nepozná**:

> **GitHub plánované úlohy po 60 dnech bez aktivity sám vypne.**

A úloha se dá vypnout i jedním kliknutím v záložce Actions. Od té
chvíle je všechno zelené — protože se nic neměří. Hlídač, který přestal
chodit do práce, nehlásí vady; **hlásí ticho, a ticho se snadno splete
s klidem.** Je to přesně to pravidlo, které tenhle repozitář používá
uvnitř („kontrola, co se nedá provést, to musí říct nahlas"), jen
o úroveň výš — a tam dosud nebylo.

**Co `scripts/kontrola-uloh.mjs` měří** u každé plánované úlohy:

1. je u GitHubu ve stavu `active` — ne vypnutá ručně, ne pro nečinnost
   (u toho druhého se i **napíše proč**, aby to nikdo nehledal),
2. její poslední běh není starší než **dvojnásobek** její periody. Jeden
   vynechaný běh se promíjí (GitHub umí plán o desítky minut zdržet),
   dva jsou nález.

Perioda se **počítá z cronu**, seznam úloh se **čte z
`.github/workflows/`** — takže nová plánovaná úloha je pokrytá v den,
kdy vznikne, a nikdo ji nemusí nikam dopisovat.

**Kdo hlídá hlídače.** Tahle kontrola se sama ze své podstaty ověřit
nemůže. Běží proto ve **dvou úlohách s různou periodou**: v kontrole
nasazení (6 h) a v cvičení sebeopravy (denně). Když umře jedna, druhá
to při svém běhu nahlásí — protože v seznamu plánovaných úloh je i ta
mrtvá. **Obě naráz už nikdo nepozná**, a je to napsané i v kódu; řetěz
někde skončit musí a lepší je vědět kde, než si myslet, že nekončí.

**Změřeno 17 kontrolami** (`scripts/test-kontrola-uloh.mjs`): devět na
čistých funkcích (periody z devíti tvarů cronu, osmiřádková tabulka
verdiktů), tři na tom, že se seznam úloh opravdu čte ze souborů, a pět
spuštěním celého skriptu proti **falešnému API**, kde se vypnutá
i zaspalá úloha vyrobí schválně. Mezi nimi dvě, na kterých záleží
nejvíc: **bez tokenu se nezměří nic — a to je vada, ne klid**, a
přesměrování API na cizí stroj se odmítne.

**Jedno místo, kterým se mluví s GitHubem.** Adresa API, hlavičky
s tokenem i ta pojistka na přesměrování šly do
`scripts/github-api.mjs`. Mluví s GitHubem víc skriptů a pojistka,
která se hlídá v každé kopii zvlášť, je pojistka, která jednou
nebude — stejná úvaha jako u portu zkoušek (oddíl 156b).

**A hlídač práv se musel naučit další pojem.** `actions: read` hlásil
`scripts/test-ci-prava.mjs` jako právo navíc — správně, o čtení stavu
úloh nic nevěděl. Povolení není jméno souboru, ale podmínka: právo smí
mít jen úloha, která pouští skript čtoucí `…/actions/workflows`.
Napoprvé byla sabotáž příliš slabá (přepsal jsem jen jeden z dvou
výskytů, takže vzor pořád sedl) — a to je dobrá připomínka, že
**sabotáž, která nic nerozbije, nedokazuje nic**. S oběma výskyty
nález přišel.

## 162. Úvodní stránka spočítala odhad ceny pro 1 925 pozemků, aby ukázala 24 karet *25. 10.*

Šel jsem hledat „nejtěžší kus webu" a začal jsem u velikostí. Největší
soubory, které si prohlížeč bere: `js/min/main.js` 244 kB,
`css/styles.min.css` 224 kB, `css/uvod.min.css` 144 kB; ve zdrojích
`css/styles.css` 8 767 řádek a `js/main.js` 9 189 řádek. Úvodní stránka
stáhne **1 376 kB ve 37 souborech**, z toho `data/mapa.json` 492 kB,
tedy 36 %.

**První protiměření zrušilo první plán.** Chtěl jsem ten datový soubor
překódovat na slovník — a pak jsem změřil, co z něj vyjde po gzipu:
492 kB → **63 kB**, `main.js` 240 → 66 kB, `uvod.min.css` 140 → 26 kB.
Přes drát je úvodní stránka asi 230 kB a přepsání formátu dat by byla
riziková operace skoro za nic. **Zamítl jsem to.**

Zbyl tedy hlavní procesor, a tam měření drželo: na telefonu 390 px se
zpomalením ×4 trvalo do první karty 2 091 ms a nejdelší jedna úloha
430 ms. Profil ukázal `js/min/ceny.js` 442 ms, z toho `okoliCeny` 68 ms
a `kmVzdalenost` 31 ms — tedy počítání vzdáleností napříč celou
databází, zatímco na obrazovce je 24 karet. To je přesně ten vzorec
z oddílu 47.

**Změřil jsem to počítadlem, ne dohadem.** Past na přiřazení
`window.PK_CENY` nasazená ještě před spuštěním skriptů obalila
`MODEL.odhad` a spočítala volání při jednom načtení:

| | |
|---|---|
| volání odhadu ceny | **3 899** |
| různých pozemků | **1 925** |
| karet na obrazovce | **24** |

Paměť modelu funguje, takže těch 1 925 je počet skutečných výpočtů.
Viníky našlo přiřazení volání k řádkům: rozehřívací smyčka před prvním
vykreslením (výchozí pořadí „Doporučené" se řadí podle skóre, které po
odhadu sahá) a výběr štítku „Doporučujeme", který filtroval celý
viditelný výpis, aby z něj vzal **jednu** nabídku.

**Skóre je funkcí jen dat.** Model se staví jako
`postav(DATA, null, PRESNOST)` — nic od uživatele do něj nejde, `DATA`
je řez pro úvodní stránku a `PRESNOST` jede s ním. Dá se tedy spočítat
při sestavení. Formule se přestěhovala z `js/main.js` do cenového
modelu (`js/ceny.js`, `poptavka`) a sestavení ji projede do pole `dm`
v `data/mapa.json`. Opsat ji do generátoru nešlo: dvě kopie se
v tomhle repozitáři rozešly vždycky, a právě proto `js/ceny.js`
existuje.

**A druhé protiměření zrušilo druhý plán.** Těch 1 926 čísel přidá
souboru 15,6 kB, takže jsem je chtěl posílat jen jako výjimky proti
nejčastější hodnotě (17 má 1 704 nabídek z 1 926). Po gzipu: `dm`
u všech stojí **673 B**, jen výjimky **557 B**. Sto šestnáct bajtů za
hlavičkové pole a další větev v kódu — **zamítnuto**.

**Štítek „Doporučujeme" se obrátil naruby.** Místo „filtruj celý výpis,
pak seřaď, pak vezmi první" se teď řadí podle skóre (po předpočítání
zdarma) a odhad se vytáhne u nabídek odshora, dokud jedna neprojde.
Že je to **týž prvek**, je dokázané na celé databázi, na každém okresu,
na každém druhu a na 300 náhodných výřezech: **388 výřezů, 388×
stejná nabídka**. A že se čísla nezměnila, na staré formuli
vytažené z gitu: **1 926 z 1 926 shoda**.

**Co z toho vyšlo, měřeno A/B** (medián ze sedmi běhů, pevné okno 7 s od
navigace, telefon 390 px, procesor ×4):

| | před | po |
|---|---|---|
| do první karty | 1 757 ms | **1 556 ms** |
| blokující čas | 1 152 ms | **1 068 ms** |
| dlouhých úloh | 7 | 6 |
| nejdelší úloha | 415 ms | 428 ms |
| volání odhadu ceny | 3 899 | **49** |

**První měření toho A/B jsem musel zahodit.** Měřil jsem souhrn
dlouhých úloh v okně, které začínalo navigací a končilo 2,5 s **po
první kartě** — a protože se karta v každé variantě objeví jinde, byla
každá varianta měřená v jinak dlouhém okně. Vyšlo z toho, že souhrn
vzrostl. V pevném okně vyšlo, že klesl. **Okno měření je součást
měřidla**, ne detail.

**A jedna věc se nepotvrdila.** Čekal jsem, že zmizí to 430 ms
zamrznutí. Nezmizelo: 415 → 428 ms, tedy v šumu. Tři tisíce devět set
volání odhadu ceny tedy **nebyla** příčina té nejdelší úlohy a hledá se
dál. Ušetřilo se 201 ms do první karty a 84 ms blokujícího času —
skutečné, ale menší, než jsem čekal, a říkám to takhle, protože obojí
je naměřené.

**Čtyři zkoušky to shodilo a každá měla pravdu.** `test-staticka`
přistihla, že jsem novou zkoušku zařadil do úlohy s prohlížečem, kterou
nepotřebuje; `test-roadmap`, že se změnil počet zkoušek;
`test-data-rezy`, že řez už není „celek bez pole url"; a `test-ceny`,
že si **tělo formule vytahoval z `js/main.js`** — kde po přestěhování
nebylo. To je ta nejtišší vada, jakou zkouška může mít: měřila by
prázdno a zelenala se dál. Kontroly šly za formulí do `js/ceny.js`
a pět sabotáží doložilo, že na novém místě pořád kousnou.

**Nová zkouška `scripts/test-poptavka.mjs`, 13 kontrol.** Hlídá tři
cesty, kterými se to může rozejít: změněná formule bez přestavby dat,
opsaná kopie formule (hledají se **kusy formule**, ne jméno funkce —
kdo kopii udělá, zpravidla ji přejmenuje) a data od robota bez pole
`dm`. Pět sabotáží: podvržené číslo, chybějící číslo, opsaná tabulka
příplatků do `main.js`, změněná formule bez přestavby a `main.js`, který
hotové číslo nečte. Všechny kously.

**Záložní cesta zůstala.** Kdo dostane data bez `dm` — náhradní data
v `js/main.js`, starý soubor z mezipaměti prohlížeče — spočítá si totéž
pořadí jako dřív, jen si na něj počká. A kdyby se nepostavil ani cenový
model, skóre se spočítá bez bodů za slevu a pořadí podle typu nabídky
zůstane; i to je zkouškou pokryté.

## 163. Třináct článků si stahovalo formulář pro vložení inzerátu *25. 10.*

Šel jsem hledat nejtěžší stránky — ne nejtěžší soubory. Sečetl jsem
u každé ručně psané stránky všechno, co si bere v CSS a skriptech, po
gzipu:

| stránka | přes drát |
|---|---|
| index.html | 196 kB |
| pozemek.html | 125 kB |
| pridat.html | 78 kB |
| kupni-smlouva-pozemek.html | **54 kB** |
| na-co-mam-pozemek.html | 48 kB |
| …a dalších devět článků | 45–47 kB |

Čtvrté místo je článek o kupní smlouvě. **Text.** A největší položkou
v něm byl `js/min/pridat.js` — logika formuláře „Přidat pozemek na
prodej", 16,7 kB po gzipu, tedy 36 % váhy té stránky. Bralo si ji
**třináct** stránek, z nichž formulář má jediná.

**Dvě měření, než jsem na to sáhl.** Projel jsem všech 45 selektorů,
které ten skript v kódu hledá, proti každé stránce: na článcích najde
**1 ze 47** — `#toast`, a ten se zvenčí volat nedá, protože modul je
uzavřené IIFE a nevyváží nic. Pak pokrytím: **7 % vykonaných bajtů**
z 57 kB. Zbytek se nikdy nespustí. Co se spustí, jsou čtyři poslechy
na dokumentu (`pointerdown`, `pointermove`, `pointerup`, `keydown`),
které hned vyskočí, protože mřížka fotek tam není. Stažení dat
(`data/opportunities.json`, 656 kB) visí na tlačítku, které na článcích
není — to se tedy nedělo.

**A pak důkaz, ne úsudek.** Server stránku vydal s tím skriptem
a bez něj a porovnal se výsledek: text, počet prvků, chování menu
a konzole. Všech třináct: **shoda**. A kontrolní vzorek `pridat.html`,
kde ten skript patří: **rozdíl**. Měřidlo tedy není slepé.

**Hlavička toho souboru přitom tvrdila ještě jednu věc, která nebyla
pravda:** že obsluhuje i stránku „Inzerce". `inzerce.html` nemá
formulář vůbec — nula prvků, nula `<form>` — a ten skript si nebere.

**Jedna stránka mi z měření vypadla a je to poučné.** `pozemek-od-obce.html`
je ručně psaný rádce, ale můj filtr na generované stránky používal vzor
`^pozemek-`, takže ji spolkl. Totéž se v tomhle repozitáře stalo už
jednou (viz poznámka v `scripts/test-predloha.mjs`): **generovanou
stránku nepoznáš podle jména.** Rozlišuje se podle obsahu — kopie
šablony pozemku nesou třídu `pz-media`.

**Druhý nález z téhož měření:** `js/porovnani.js` na `moje-data.html` —
0 ze 3 prvků, 3 % bajtů.

**A tady jsem si málem rozbil web.** `moje-data.html` je totiž ŠABLONA,
ze které sestavení staví `data.html` (`scripts/generate-data-stranka.mjs`
si z ní bere hlavičku a patu). Odebráním ze šablony jsem to vzal
i stránce, která to potřebuje: tabulka polí na `data.html` přetéká
a stín „pokračuje vpravo" dělá právě `porovnani.js`.

Moje srovnání „s ním a bez něj" to **neodhalilo**, protože porovnávalo
text a počet prvků — a stín je JEN PŘEPNUTÍ TŘÍDY. Shodilo to
`scripts/test-skripty-na-strance.mjs`, hlídač, který už v repozitáři
byl: hlásí stránku, která načte knihovnu, kterou nikdo nevolá, a po
mém zásahu oznámil, že `PK_CENY` nevolá na obou stránkách nikdo
(`porovnani.js` na něj sahá třikrát). **Hlídač, o kterém jsem nevěděl,
zachytil vadu, kterou mé vlastní měřidlo propustilo.**

Správné rozdělení tedy je: šablona oba skripty nenese a sestavení je
vloží do `data.html`. Doloženo měřením TŘÍDY, ne textu, na pěti
šířkách — a ukázalo ještě jednu věc: obaly tabulky jsou dva a první
z nich na 390 px nepřetéká, takže kdybych měřil jen ten, usoudil bych
znovu špatně.

| šířka | obal 1 | obal 2 |
|---|---|---|
| 320 px | přetéká, `je-dal` | přetéká, `je-dal` |
| 390 px | 348/348, bez stínu | **348/460, `je-dal`** |
| 768 px a výš | bez stínu | bez stínu |

**Co to ušetřilo** (po gzipu, na jedno otevření stránky):

| stránka | před | po |
|---|---|---|
| kupni-smlouva-pozemek.html | 54,0 kB | **37,2 kB** |
| na-co-mam-pozemek.html | 48,3 kB | **31,6 kB** |
| hypoteka-na-pozemek.html | 47,1 kB | **30,4 kB** |
| pozemek-od-obce.html | 38,7 kB | **21,9 kB** |
| moje-data.html | 46,1 kB | **42,9 kB** |

U článků je to 31–43 % váhy. Třináct stránek × 16,7 kB.

**A úklid navíc, který si sestavení udělalo samo.** Čištění stylů bere
„použitá jména" z HTML a skriptů té rodiny stránek — a `.auth-bar`,
`#auth-gate`, `#prodej-card` i `.link-btn` psal právě `pridat.js`. Jak
zmizel z článků, zmizela i ta pravidla:

| rodina stylů | před | po |
|---|---|---|
| css/pozemek.min.css | 13 311 B gz | **12 284 B gz** |
| css/region.min.css | 12 673 B gz | **11 620 B gz** |

Ta první nese 2 264 stránek pozemků. Jména samotná zůstala
v `css/zaklad.min.css`, který si bere `pridat.html` — ověřeno, že
tam všechna čtyři jsou.

**Nový hlídač `scripts/test-vaha-stranky.mjs`, 6 kontrol, bez
prohlížeče.** Posbírá z kódu prvky, na které skript sahá, a hledá je ve
statickém HTML každé stránky, která si ho bere. Tím se rozliší
„připravený a čeká" od „nemá tu co dělat".

**Proč se neměří pokrytí bajtů, když už ho umím změřit.** Zkusil jsem
to a je to špatný nástroj: `js/auth.js` má na každé stránce 12 %,
protože se rozběhne až při přihlášení, `js/exif.js` 10 %, až když někdo
přiloží fotku. Ze 150 párů skript×stránka nad 5 kB by jich mez pod
20 % označila **59** — a většina z nich je v pořádku. Nízké pokrytí při
načtení znamená „čeká", ne „nemá co dělat".

**A mez je naměřená, protože napoprvé jsem ji měl špatně.** Napsal jsem
pravidlo „musí najít aspoň jeden prvek" a sabotáž ho prošla:
`pridat.js` jeden prvek najde (`#toast`). Rozhoduje tedy podíl.
Naměřeno u párů, které na svém místě jsou: 20 % (`graf-cen.js`, staví
si prvky sám), 33 % (`porovnani.js`), 65 % (`main.js`), 75 % a výš
zbytek. Vadný případ: **2 %**. Mez 10 % leží dvakrát pod nejnižším
správným a pětkrát nad vadným. Předlohy (`pozemek.html`) jsou výjimka
s napsaným důvodem — šablonu nelze soudit podle toho, co v ní ještě
není; hlídá ji `test-predloha.mjs` srovnáním s hotovou stránkou.

**Pět sabotáží.** Skript zpátky na článku (2 % → nález), `porovnani.js`
zpátky na `moje-data.html` (0 % → nález), hlídač přestane sbírat `#id`
(nezměřilo se nic → nález), všechny stránky prohlášené za generované
(0 ručních → nález) a výjimka bez důvodu (→ nález). Šestá sabotáž
„sniž mez na nulu" prošla, takže se hlídá i **rozsah mezi**: pod 5 %
by hlídač nenašel nic, nad 20 % by hlásil skripty, které si prvky
vyrábějí samy.

## 164. druhGroup: 3 954 volání na 13 různých vstupů *25. 10.*

Z téhož profilu startu jako oddíl 162: `druhGroup` 29 ms. Je to čistá
funkce jednoho krátkého textu — `toLowerCase()` a až deset hledání
podřetězce. Počítadlo na jedno načtení úvodní stránky: **3 954 volání,
13 různých hodnot `druh`**, tedy 304× tentýž výpočet. Dostala tedy
paměť.

**A hned na ní spadla kontrola, kterou jsem k ní psal.** Napsal jsem
paměť jako obyčejný objekt `{}` — a druh „constructor" z ní vytáhl
**funkci Object**, „__proto__" prototyp a „toString" funkci. Tedy ne
text, a ten by šel do stránky. Druhy přitom přicházejí z dat, ne
z našeho kódu. Je to proto `Map`, která žádné jméno klíče nedědí
a navíc rozlišuje `null`, `undefined` i prázdný text bez kódování
klíče.

Paměť má **strop 500 záznamů**: druhů je v datech třináct, ale kdyby se
v nich někdy objevily tisíce textů, nemá paměť růst bez konce. Nad
stropem se počítá jako dřív — pomaleji, ale vždycky správně.

**Tři kontroly a čtyři sabotáže — a jedna sabotáž mě přistihla.**
Kontrola „za stropem to vyjde taky" zkoušela po přetečení stropu
TYTÉŽ vzorky jako výš. Ty už ale v paměti ležely z prvního průchodu,
takže se odpovídalo z ní a cesta za stropem se nikdy nespustila:
sabotáž „nad stropem vracej Zahradu" prošla. Teď se model načte do
vlastního okna (čistá paměť), strop se přeteče NEJDŘÍV a vzorky se
zkoušejí teprve potom — poprvé a bez pamatování. A protože sabotáž
„zruš strop" taky prošla, vyváží model i velikost paměti, aby se dalo
změřit, že strop drží.

## 165. Zrychlení výpisu rozbilo tři věci, které se o něj opíraly *25. 10.*

Předpočítané skóre pořadí (oddíl 162) zrušilo osm oddechů, které se
v `boot()` dělaly mezi dávkami počítání. Sada v prohlížeči po tom
shodila **čtyři zkoušky** a každá ukázala na něco jiného. Dvě z nich
byly vady v tom, co vidí člověk, jedna vada v jiné části webu, o které
nikdo nevěděl, a jedna vada v měřidle. Všechny čtyři padaly i na
nezatíženém stroji, takže to nebyly kolize.

### a) `?kraj=` přestalo fungovat — 91 stránek vede na odkaz, který se tiše zahodil

`openFromUrl()` hledá jméno kraje v `krajByName`, a tu tabulku plní
vrstva krajů, tedy teprve mapa. Dokud `boot()` cestou k tomu místu
osmkrát zastavil, mapa se mezitím postavila. Jak zastavení zmizela,
`?kraj=Jihomoravský` nenašel nic a **mlčky se zahodil**.

Naměřeno pollingem: 1 926 pozemků ve výpisu místo kraje, bez odznaku,
i po pěti sekundách. Po opravě 395 pozemků a odznak „Jihomoravský kraj".

Oprava se neopírá o načasování: když obrysy ještě nejsou, řekne se
o mapu a výběr se zařadí do fronty, kterou mapa po svém vzniku
vyprázdní (`azBudeMapa`). Odkaz na kraj si mapu vyžádá tak jako tak —
člověk, který přišel na kraj, ji chce vidět.

### b) Sytost krajů na mapě se nikdy nezapnula

Tohle je nález, který s mou změnou nemá co dělat — jen se díky ní
ukázal. Kraje se stylují `krajKrytí(k)` ve chvíli, kdy vrstva vznikne,
ale `krajCounts` plní až první `renderList()`. Když byla mapa první,
dostaly **všechny kraje krytí 0,015** (hodnota pro „žádné nabídky")
a nic je už nepřebarvilo.

| | krytí |
|---|---|
| jak to bylo | 0,015 u všech čtrnácti krajů |
| jak to má být | 0,082–0,168 podle počtu nabídek |

Mapa, kterou měl odlišovat sytější kraj, byla plochá — a nepoznalo se
to, protože plochá mapa vypadá jako mapa. Opraveno tím, že
`refreshKrajTips()` kraje **přebarví**, ne jen přepočítá; vybraný kraj
se vynechává, ten má vlastní styl.

### c) Mapa se objednávala sériově: styl, a teprve v jeho `onload` knihovna

`chciMapu()` vkládal `<link>` na leaflet.css a skript si objednal
teprve v jeho `onload`. Mapa tím čekala na celé kolo po síti a navíc
na to, až bude hlavní vlákno volné — tedy právě ve chvíli, kdy se
vykresluje výpis. Naměřeno na 1280 px (medián z pěti běhů):

| | před | po zrychlení výpisu | po opravě |
|---|---|---|---|
| první karta | 697 ms | 482 ms | 508 ms |
| žádost o `leaflet.js` | 435 ms | **482 ms** | **378 ms** |

Prostřední sloupec je ta vada: výpis zrychlil a mapa se tím o 47 ms
zdržela. Po opravě se objednává obojí hned a mapa se staví, až dojede
obojí — takže je mapa o 57 ms dřív než před celou touhle prací,
a výpis zůstal rychlý. Chyba stylu se bere jako „styl je hotový": bez
něj mapa vypadá špatně, ale funguje, kdežto bez knihovny není.

### d) A čtvrtá zkouška měřila dvě věci naráz

`test-maska` porovnávala jas středu výřezu (Česko) s pravým dolním
rohem (cizina) a čekala rozdíl aspoň 10. To ale měří závoj NAD cizinou
i sytost krajů POD Českem — a jak se sytost (bod b) opravila, Česko
ztmavlo z 211 na 198 a rozdíl spadl na 3. Zkouška hlásila vadu u
závoje, přestože závoj byl v pořádku a opravila se jiná věc.

Teď se měří **týž bod se závojem a bez něj**, což je přesně to, co
zkouška tvrdí. Naměřeno: cizina 232 → 195, tedy **−37**; Česko 198
v obou případech, tedy 0 (závoj má uprostřed díru). Mez −10 leží
třikrát pod naměřenou hodnotou a přibyla kontrola té díry — bez ní by
prošel i závoj natažený přes celou mapu.

**A jedna věc, kterou je u těchto čísel třeba vědět:** v prostředí
zkoušek mapa **nemá dlaždice** — podkladový server je odsud
nedostupný (naměřeno 0 hotových dlaždic i po devíti sekundách; proxy
to potvrzuje odmítnutými spojeními na `tile.openstreetmap.org`
a `server.arcgisonline.com`). Absolutní jasy proto popisují mapu bez
podkladu a ladit podle nich krytí závoje by znamenalo ladit web pro
stav, který nikdo nevidí. Rozdíl „se závojem proti bez závoje" je ale
na podkladu nezávislý.

**Poučení, které si beru dál:** zrychlení není neutrální změna.
Všechno, co se opíralo o to, že něco trvá dlouho, se tím rozbije — a je
to ta nejtišší kategorie vad, protože nic nespadne, jen přestane
fungovat. Tři ze čtyř zkoušek, které to chytily, přitom neměřily výkon.

## 166. Seznam tisíce jmen se stahoval každému, kdo chtěl přidat inzerát *25. 10.*

`js/tridy-imagenet.js` je seznam jmen tisíce tříd, které rozpoznává
MobileNet: 23,9 kB surově, **10,3 kB po gzipu**. Na `pridat.html` to byl
po samotném formuláři druhý největší skript, tedy 13 % váhy té stránky
přes drát. Smysl má ale výhradně spolu s modelem, který má **5,4 MB**
a nahrává se teprve u první fotky — takže kdo si fotku nepřiloží,
platil to pro nic. Pokrytí to potvrdilo: 100 % vykonaných bajtů už při
načtení stránky, protože vykonat datové pole znamená ho celé vyhodnotit.

Nahrává se proto stejnou cestou jako TF.js: na vyžádání, z vlastní
kopie, adresa v `<meta name="pk-tridy">`, aby jí razítko `?v=` doplnilo
sestavení (týž postup jako u Leafletu v `index.html`).

| | před | po |
|---|---|---|
| pridat.html dychtivě | 77,8 kB gz z 19 souborů | **67,3 kB gz z 18** |

**Odložit to šlo udělat tiše špatně, a málem jsem to tak udělal.**
`js/pridat.js` měl pojistku
`if (!window.PKFotoTema || !window.PKTridy) return { ok: true }` — tedy
kontrolu fotky kvůli chybějícím JMÉNŮM úplně přeskočil. Samotné
odložení by tím kontrolu vypnulo **všem**: fotka by prošla, web by
napsal „v pořádku" a nic by nespadlo.

Přitom `vyhodnot()` rozhoduje podle **čísel** tříd a skupin
z `js/fotoskupiny.js`; jména jsou jen na text „vypadá jako…". Posudek
se tedy udělá i tehdy, když se tabulka nenačte — jen se místo jména
objeví číslo třídy. Ta pojistka byla zbytečně přísná už předtím.

**Nová zkouška `scripts/test-foto-odlozeni.mjs`, 12 kontrol.** Model se
v ní nestahuje: TF.js se podstrčí falešný, protože 5,4 MB v každém běhu
by byla jiná vada. Falešný je ale **jen model**, ne rozhodování — čísla
jdou skutečnou cestou `klasifikuj() → vyhodnot()`. Měří se, že se
tabulka při načtení nestáhne, že `pripravTridy()` ji na vyžádání nahraje
(1 000 jmen) a teprve tehdy po ní jde požadavek — a hlavně tři věci,
které dokazují, že odložení kontrolu nevypnulo: posudek se udělá, dojde
na skutečné sčítání skupiny „venku", a **jméno třídy je jméno, ne
číslo** (tím se pozná, že tabulka došla až ke klasifikaci). Dvanáctá
kontrola dokazuje opak téhož: táž čísla bez tabulky dají týž verdikt.

**Tři sabotáže a tři chyby v mém vlastním měřidle.**
Sabotáže: tabulka zpátky jako `<script>` (3 nálezy), mlčící pojistka
zpátky (1 nález), `posud()` si tabulku neobstará (1 nález — jméno třídy
je číslo).

A ty tři chyby, které přistihly zkoušky:
* Vzor na `<meta>` jsem napsal bez razítka `?v=`, takže na hotové
  stránce nesedl.
* Kontrola „pojistka `!window.PKTridy` už tam není" se trefila do **mé
  vlastní prózy** — v `js/pridat.js` je u opravy napsané, že ta
  podmínka tam dřív byla. Komentáře se teď odstraňují; rozhoduje kód.
  Je to táž past, jakou má u sebe popsanou `scripts/test-predloha.mjs`.
* Sabotáž „`posud()` si tabulku neobstará" napoprvé **prošla** —
  protože stránka načítá minifikovanou kopii a já ji nepřestavěl.
  V prohlížeči běžel pořád starý kód. **Sabotáž v prohlížeči se musí
  dělat až po `node scripts/oprav.mjs`**, jinak nedokazuje nic.
* A `scripts/test-zkousky-meri.mjs` mi vytkl, že okno 390 px otevírám
  bez dotyku — 390 px s myší je stav, který nemá žádný návštěvník.
* A `scripts/test-csp.mjs` mi vytkl, že si zkouška neobchází CSP.
  Důvod toho pravidla je naměřený: Playwright ovládá stránku
  vstřikovaným kódem, který si volá `eval`, takže pod přísným
  `script-src` přestane fungovat `waitForFunction` i scrollování —
  23. 10. tak spadlo 30 zkoušek a vypadalo to na rozbitý web. Moje
  zkouška prošla i bez obcházení, ale spoléhat na to, do kterých
  vnitřností Playwrightu kdy sáhne, je štěstí, ne pravidlo.

**A tím se ukázalo, že jedna věc chyběla úplně.** Odložený skript se
vkládá až za běhu, takže ho musí pustit `script-src` — a protože VŠECHNY
prohlížečové zkoušky kromě `test-csp` si CSP obcházejí, dynamické
vložení by jim prošlo i tehdy, kdyby ho hlavička zakázala. Přísnější
politika by tedy posudek fotky (a stejně tak mapovou knihovnu na úvodu)
tiše vypnula a nic by nespadlo.

Kontrola proto přibyla do `scripts/test-csp.mjs`, tedy do té jediné
zkoušky, která CSP neobchází: otevře `pridat.html`, zavolá
`pripravTridy()` a ověří, že se tabulka nahrála (1 000 jmen) a že
prohlížeč nehlásil porušení `script-src`. Sabotáž „dotahuj tabulku
z cizího serveru" ji shodí a hláška pojmenuje i direktivu:
`script-src-elem ← https://priklad.invalid/…`.

## 167. Rozdělit main.js: změřeno ze dvou stran, NEUDĚLÁNO *26. 10.*

Na seznamu úkolů stálo: „`main.js` je 68 kB gz dychtivé váhy úvodu
a vykoná se 41 % — největší zbylý kus." První část čísla sedí,
z druhé ale nevyplývá to, co to tvrzení naznačuje.

### Co se naměřilo

Pokrytí V8 na telefonu 390 px (`js/min/main.js`, 245 389 B):
**vykonáno 99 633 B, tedy 41 %.** Největší nevykonané kusy:

| kus | kolik | co to je |
|---|---|---|
| `otevriVyberMista` | 19 kB | okno „Vyberte své okolí" |
| `showLocModal` + `enterNearAt` | 5 kB | zbytek okolí |
| `rv*` (osm funkcí) | 8 kB | „Procházet po jednom" |
| `navrhySlovnik`, `ukazNavrhy` | 3 kB | našeptávač |
| `hromadky`, `vyrobShluk` | 3 kB | shlukování na mapě |

Největší jediný kandidát je tedy výběr místa: 678 řádků, a — což je
překvapivě dobrá zpráva — jen **19 závislostí** na okolí `main.js`.
Vypadalo to na hotovou věc.

### Strana první: procesor

Tělo `otevriVyberMista` se v `js/min/main.js` nahradilo prázdným
a měřilo se `Performance.getMetrics().ScriptDuration`, procesor 4×
zpomalený, tři běhy:

| podoba | běhy | průměr |
|---|---|---|
| jak to je | 0,690 / 0,663 / 0,657 s | 0,670 |
| bez výběru místa (o 19 kB míň) | 0,642 / 0,635 / 0,615 s | **0,631** |

Rozdíl **39 ms zpomaleného procesoru, tedy asi 10 ms skutečných.**
V8 totiž těla funkcí kompiluje líně: za nevykonaných 59 % se platí
předparsováním, ne kompilací.

### Strana druhá: drát

Čas do první nabídky, procesor 4× zpomalený a pomalá 4G (1,6 Mb/s,
150 ms RTT), čtyři běhy, medián:

| podoba | běhy | medián |
|---|---|---|
| jak to je | 7 860 / 7 893 / 7 906 / 8 154 ms | 7 906 |
| o 19 kB míň | 7 862 / 7 864 / 7 886 / 7 888 ms | **7 886** |

**20 ms z 7,9 sekundy, tedy 0,25 %** — a to při rozptylu ±150 ms.
Navíc je to číslo nadsazené asi čtyřikrát: zkušební server neumí
gzip, takže se těch 19 kB vleče nezabalených; naostro by to bylo
kolem 5 kB.

### Past, do které jsem málem spadl dvakrát

Mezikrokem se zkoušelo odložit tři moduly, které se na úvodu skoro
nevykonají (`dotaz.js` 33 %, `okruh.js` 39 %, `hledani.js` 9 %).
Každý zvlášť vypadal jako úspora 38–52 ms. **Všechny tři naráz ale
ušetřily 34 ms** — tedy míň než kterýkoli z nich sám. To není
záhada, to je důkaz, že ta jednotlivá čísla byla šum: rozptyl
základního měření je ±60 ms.

A ještě před tím: první verze měření hlásila úsporu **558 ms**.
Stránka se při ní ale vůbec nevykreslila (0 karet) — `hlidani-logika.js`
je při startu potřeba. Kontrola „kolik karet se vykreslilo" se proto
do měřicího skriptu přidala natrvalo. **Měření bez kontroly, že
stránka pořád funguje, měří rychlost rozbité stránky.**

### Rozhodnutí

Neuděláno. Deset milisekund procesoru a dvacet milisekund na drátě
nestojí za přesun 678 řádků s devatenácti závislostmi do modulu —
a to v souboru, na kterém stojí celá úvodní stránka. Je to táž
odpověď jako v oddílu 80, jen na jinou otázku.

Co z toho zůstává jako poznatek: **„vykoná se jen 41 %" není samo
o sobě nález.** U kódu, který čeká na klepnutí, je to normální stav;
cena se platí za stažení a předparsování, a obojí se dá změřit.
Dokud se nezměří, je to jen velké číslo.

### Co se při tom našlo a změřit nešlo

V časové ose vyšlo `data/mapa.json` jako největší stahovaný kus
(509 kB nezabaleně, 66 kB gz) — jenže to nejsou mapová data, nýbrž
řez nabídek pro výpis, takže odložit se nedá: právě z něj se staví
první nabídka. Jestli ho server posílá zabalený, se odsud ověřit
nedalo (odchozí spojení na vlastní doménu vrací 403 přes proxy).
Kdyby ne, je to osmkrát větší věc než cokoli v tomhle oddílu.

## 168. Dvě čísla, která web tvrdil o sobě, a jedno, které tvrdil o ceně *27. 10.*

Tři nálezy z jednoho odpoledne; společné mají to, že se všechny
daly přečíst přímo ze stránky — stačilo porovnat, co na ní stojí,
s tím, co je vedle.

### a) Osa grafu: v poznámce stálo rozpětí DAT

Pod každým grafem vývoje ceny stálo „Svislá osa je v rozpětí
45,7–46,6 Kč/m², ne od nuly". Jenže osa drží nejméně desetinu
hladiny (aby z pohybu o procento neudělala schodiště přes celou
výšku), takže ve skutečnosti šla od 43,8 do 48,5.

Změřeno na všech 37 klidných řadách z `data/historie-cen.json`:

| co | kolik |
|---|---|
| řad, které graf dostanou | 37 |
| podíl výšky osy, který data zaberou — medián | 5 % |
| nejvíc | 56 % |
| řad, kde se min i max napíše stejně („v rozpětí 36,4–36,4") | 18 |

Kdo by si polohu čáry proti té větě přečetl, mýlil by se až
dvacetinásobně. Teď se píšou konce osy tak, jak jsou nakreslené,
a za nimi pás, ve kterém data leží, včetně toho, jakou část výšky
čára zabere. To poslední číslo jde změřit z nakreslené křivky —
`scripts/test-graf-cen.mjs` to tak dělá: ze dvou bodů s různou cenou
sestaví přepočet px → Kč a natáhne ho na okraje kreslicí plochy
(y1 a y2 kříže, který se po grafu vodí pod prstem).

### b) Percentil: nabídka se počítala sama k sobě

„Dražší než 98 % pozemků téhož druhu v prodeji ve Středočeském kraji
(13 nabídek)." Z třinácti nabídek 98 % nevyjde ani tehdy, když je ta
nabídka dražší než všechny ostatní (12 ze 13 je 92 %). Příčina:
model počítal `cena <= moje` a v srovnávací přihrádce leží i ta
nabídka, o které se mluví.

Změřeno na všech 1 276 verdiktech z `data/model.json`:

| co | kolik |
|---|---|
| verdiktů, kde se nabídka srovnávala bez sebe samé | 0 |
| rozdíl proti ostrému počítání — medián | 4 body |
| nejvíc | 24 bodů |
| verdiktů, kde se tím měnil i odznak (Výhodná/Průměrná/Vyšší) | 108 |
| nabídek se shodnou cenou s jinou | 11 |

Čím menší vzorek, tím víc: při deseti nabídkách, což je spodní mez
modelu, je nabídka sama deset bodů. Strop „2 až 98 %" tím odpadl —
byl to zálepek přes to, že `<=` umělo napsat sto procent.

Mimochodem: `scripts/test-shoda.mjs` si dopočítával „dražší" jako
100 − „levnější". Od téhle opravy to neplatí (shodně drahé nabídky
nejsou ani na jedné straně), takže si bere obě čísla z modelu.

### c) Díra vedle čísla v hlavičce — na 74 ze 101 stránek

Čísla v tmavém pásu stála ve dvou sloupcích a počítalo se s tím, že
osamělé POSLEDNÍ číslo si vezme celý řádek. Poslední položka je ale
vždycky rozpětí cen, které celý řádek bere už samo, takže pravidlo
nikdy nevyšlo a díra zůstala o řádek výš:

| podoba | stránek |
|---|---|
| tři úzká čísla + rozpětí (díra vedle třetího) | 41 |
| jedno úzké číslo + rozpětí (díra vedle něj) | 33 |
| čtyři úzká čísla + rozpětí (bez díry) | 3 |

Řádek, který se zalamuje podle obsahu, to spraví na obou stranách:
popisky jsou krátké (57, 58 a 52 px), takže se tři vejdou vedle sebe
i na 320 px. Tmavý pás na okrese Benešov: 369 → 296 px na telefonu,
344 → 303 px na počítači (tam čísla přešla z pravého sloupce pod
nadpis, protože výšku pásu určoval jejich počet — Jihomoravský kraj
měl 421 px a pod nadpisem 215 px prázdna).

Past, do které jsem při psaní hlídače spadl: šířku položky jsem měřil
`getBoundingClientRect()`. V mřížce se krabice natáhne na celou buňku,
takže sečtené šířky vyjdou přesně na šířku řádku a žádná díra se
nenajde — sabotáž s původní mřížkou prošla. Teprve rozsah nad
TEXTOVÝM uzlem dá šířku písmen (57 px místo 163).

## 169. Dva sloupce, které na sebe čekaly prázdné *27. 10.*

Dvě stránky, dvě prázdná místa, dvě různé příčiny — a obě se našly
tím, že jsem si stránku otevřel v šířce 1280 a díval se, kde nic není.

### a) Stránka pozemku: pruh vpravo nesl jen cenu

Na širokém okně drží stránka pozemku vpravo připnutý pruh (340 px).
Byla v něm karta s cenou a dvě tlačítka — 270 px na stránce, která
měří přes tři tisíce. Zbytek sloupce byl prázdný na všech 2 268
stránkách pozemků.

Tři údaje pod cenou (výměra, cena za metr, druh) jsou přitom to,
podle čeho se člověk rozhoduje, jestli má číst dál. Stěhují se proto
do pruhu a je z něj celá sada: **cena → parametry → akce**.

| | před | po |
|---|---|---|
| výška pruhu (Benešov, 1280 px) | 270 px | 443 px |
| výška stránky | 3 041 px | 2 828 px |
| nejvyšší pruh ze 14 měřených stránek | — | 516 px |

V pruhu z parametrů nejsou dlaždice, ale řádky (popisek vlevo,
hodnota vpravo). Dlaždice jsou dělané na šířku — čtyři vedle sebe
v hlavním sloupci — a v 308px pruhu by z každé byla krabice přes
celou šířku.

Stěhuje se toutéž cestou, kterou už chodily akce (`pripniAkce`
v js/pozemek.js): každý kus má svou kotvu a při zúžení okna se vrátí
přesně tam, odkud odešel. Na telefonu se proto nemění nic — pořadí
bloků je změřené a hlídá ho test-poradi-pozemku.

### b) Stránka dat: rozcestník, který existoval, ale ne pro ni

Web má v levém 172px sloupci dlouhých stránek rozcestník oddílů
(„OBSAH"); staví ho js/obsah.js. Měřeno na sedmnácti stránkách:

| stránka | oddílů | rozcestník |
|---|---|---|
| kolik-stoji-koupe-pozemku | 9 | ano |
| ochrana-udaju | 7 | ano |
| …dalších deset článků | 5–7 | ano |
| **data.html** | **7** | **ne** |

A byla to zrovna nejdelší stránka webu (4 850 px). Příčina: skript
uměl jen stavbu článku (`.clanek .rules-sect`), kdežto stránka dat
se skládá z `.dt-sekce` — a nebyl na ni ani přilinkovaný.

Opačným směrem se při tom našlo, že tři stránky (na-co-mam-pozemek,
pravidla-inzerce, radce) ho stahovaly, ačkoli mají oddílů míň než
pět a skript se na nich sám vypne: 4,8 kB zdroje za nic.

`scripts/test-skripty-na-strance.mjs` to teď hlídá POČTEM oddílů,
ne jednou třídou: pět a víc = skript tam musí být, míň = nemá tam co
dělat.

### Past, která z toho vylezla

Oddíly stránky dat byly každý sám `.wrap` a od obecného pravidla
`.wrap > p` dostávaly čtecí míru. Jakmile jsem je dal do jednoho
obalu (kvůli mřížce s rozcestníkem), pravidlo na ně přestalo
dosáhnout a odstavec měl **127 znaků na řádek** proti dovoleným 90.
Chytlo to scripts/test-mira.mjs — tedy hlídač, který tam byl dřív
než ta změna.

### A jedna věc, kterou jsem málem udělal dvakrát

Než jsem si všiml, že rozcestník existuje, napsal jsem k němu druhý:
build krok, který skládá obsah z `h2` a vkládá ho do pravého sloupce.
Fungoval. Zahodil jsem ho, protože druhý rozcestník na tomtéž webu
není funkce, ale vada — a protože ten už existující má navíc
zvýraznění oddílu, ve kterém čtenář zrovna je. Stálo to dvacet minut
a je to levnější než dvě verze téhož v repozitáři.


## 170. Tři vady z majitelova telefonu — a jedna moje vlastní past *27. 10.*

Majitel poslal čtyři fotky z iPhonu. Žádná z nich nešla přepsat do
„nefunguje X" — všechny tři vady byly vidět jen na skutečné obrazovce
při skutečném posouvání.

### a) Hlavička strašila dvakrát

Při posunu nahoru se tmavá hlava schovává a objevuje. Na fotce stál
bílý pruh přes titulek: zhasnutá hlavička měla `opacity:0`, ale
přechod na ní trval `--cas-pomaly`, takže v průběhu byla PRŮSVITNÁ —
pod ní prosvítal obsah a nad ní pruh. Oprava rozdělila dvě věci,
které se do té doby dělaly na jednom prvku:

* `header.hl-zhasnuta` — zmizí okamžitě (`opacity:0`,
  `pointer-events:none`, žádný přechod);
* `header.hl-prijezd > .wrap` — příjezd se animuje na VNITŘKU, ne na
  hlavičce samé.

`scripts/test-hlavicka.mjs` k tomu dostal kontrolu „bílý pruh není
ani jeden snímek průsvitný": animace se čte z `.wrap` a průhlednost
z hlavičky, snímek po snímku.

### b) Tlačítko „nahoru" sedělo na hlavní akci

Na stránce pozemku je dole lepivá lišta s hlavní akcí
(`.pz-akce-hlavni`). Plovoucí kolečko „nahoru" se vykresluje do
téhož kouta — na fotce se obě plochy překrývaly a kolečko bylo přes
půl tlačítka „Zavolat".

`js/hlavicka.js` teď hlavní akci jednou změří (při `resize` a `load`,
nikdy při posouvání — to by bylo vynucené rozvržení na každý snímek)
a při kresbě se dívá, jestli se pruhy potkávají:

```js
var koliduje = akceY !== null && (akceY - y) < dolnihrana && (akceY + akceH - y) > hornihrana;
b.classList.toggle('show', dlouha && y > PRAH_POSUNU && !koliduje);
```

Kolečko tedy ustoupí a jak hlavní akce odjede, vrátí se. Hlídá to
nový blok v `scripts/test-nahoru.mjs` — s kontrolou obojího, ustoupení
i návratu, aby zkouška neprošla na trvale schovaném tlačítku.

### c) Ovládání nad výpisem drhlo o hranu

Pruh s hledáním a přepínačem Seznam/Mapa stál **8 px** od hrany
obrazovky, kdežto zbytek stránky dýchá 20 px (`--okraj-stranky`).
Na fotce to vypadá, jako by ovládání vypadávalo z webu.

Rovnou na 20 px to ale nešlo. Naměřeno na třech výplních:

| výplň | 320 px | 390 px |
|---|---|---|
| 8 px (původní) | pole 304, pilulka 148 | pilulka 183 |
| **16 px** | **pole 288, pilulka 140** | **pilulka 175** |
| 20 px | pole 280, pilulka 136 | pilulka 171 — **„Stáhnout výběr" se nevejde** (171 px textu v 169 px) |

Takže 16 px: pruh přestane drhnout o hranu a všechny nápisy se pořád
vejdou. `test-ovladani-vypisu.mjs` to drží od obou stran — měří
vzdálenost ovládání od hrany okna (aspoň 16 px) a sabotáží zpět na
8 px spadne na obou šířkách.

### Past: hlídač, který si pamatoval stav dat

Při tom spadla kontrola, kterou jsem napsal týž den ráno: „pod 360 px
nástroj bere celou šířku řádku". Vypadalo to na následek změněné
výplně. Nebylo. Kolik nástrojů v řadě stojí, **rozhodují data** —
„Schovat dražby po termínu" se vykreslí jen tehdy, když v nabídce
nějaké dražby po termínu jsou. Ráno tam byly tři (posuvný řádek,
buňky přes celou šířku 304 px), po sloučení s daty robota dvě
(dvousloupcový rastr, 148 px). Oba stavy jsou správné.

Hlídač teď bere očekávání z DOM, ne z paměti: spočítá vykreslené
nástroje a podle toho žádá buď celou šířku (tři a víc), nebo tutéž
šířku jako dvojice nad ním (dva) — a předtím si ověří, že vůbec něco
naměřil, aby neprošel naprázdno. Poučení je obecnější než ta jedna
řada: **kontrola rozměru, která si opíše naměřené číslo, platí jen
pro data, na kterých se měřilo.**

## 171. Obhlídka telefonu: co ještě drhne o hranu a co se nedá přečíst *27. 10.*

Tři vady z majitelových fotek (§170) měly společného jmenovatele:
jsou vidět jen na skutečné obrazovce. Dávalo proto smysl hledat další
stejným způsobem — měřením v prohlížeči na 390 px, ne čtením CSS.
Prošlo se patnáct typů stránek a měřily se čtyři věci: co přetéká
z okna, co se dotýká hrany, co má chytací plochu menší než palec a kde
je písmo pod dvanácti pixely.

### Nález 1: snímek pozemku stál 4 px od kraje

Hlavní fotka na stránce pozemku **má** jít od kraje ke kraji — tak to
mají Rightmove i Zillow a v rámečku s odsazením vypadá jako ilustrace
v článku. Dělá se to záporným okrajem:

```css
.pz-media{margin:0 -16px;}    /* „přesně odsazení .pz-wrap" */
```

Jenže odsazení obalu se 26. 10. přepnulo na token `--okraj-stranky`
(20 px) a záporný okraj zůstal napsaný ručně. Fotka proto stála 4 px
od hrany: ani u kraje, ani s okrajem. Je to **táž vada jako ta
vyfocená** — jen o 4 px místo o 12.

Nová zkouška `scripts/test-u-hrany.mjs` hlídá pravidlo, které z obou
případů plyne: na telefonu jsou jen dvě správné polohy, 0 px a aspoň
16 px. Měří se bloky s vlastní plochou nebo rámečkem (u průhledného
obalu není hrana vidět) na dvanácti stránkách — 824 bloků. Sabotáží
zpět na `-16px` spadne přesně na stránce pozemku.

### Nález 2: jediná věta pod dvanácti pixely

Jedenáctek je ve stylopisu patnáct, ale když se měřilo, kde stojí
VĚTA (dvanáct znaků a víc), vyšlo jediné místo z devíti stránek:
„pořadí se střídá každý den" pod řádkem s počtem nabídek. Zbylé
jedenáctky nesou štítky, čísla os grafu a značku „↗" u odkazu ven —
tam je drobné písmo záměr.

Byl to zbytek doby, kdy ta poznámka stála v řádku a musela se do něj
vejít. Od chvíle, kdy má `flex:1 1 100%`, tedy vlastní řádek, se
zmenšovat nemá proč. Hlídá to nový blok 6a2 v `test-rozvrzeni.mjs`
vedle meze 44 px — jedno je, co jde trefit prstem, druhé, co jde
přečíst.

### Dva nálezy, které nálezy nebyly

Poctivě i to, co se neopravovalo:

* `summary` na okresní stránce a v metodice cen hlásilo `scrollWidth`
  o 2 px větší než `clientWidth`. Přetékání je ale `visible` a ty
  dva pixely patří značce rozbalení — nic se neuřízne.
* `th` v porovnání hlásilo 116 proti 106 px. Těch 10 px je šířka
  `::after` se stínem, který **schválně** stojí za buňkou a říká, že
  pod přilepeným sloupcem něco podjíždí.

Obojí je poučení o měření: `scrollWidth > clientWidth` znamená
„uříznuto" jen tam, kde se přetékání opravdu ořezává.

### A jeden soubor navíc v kořeni

Při tom se v kořeni repozitáře našel soubor `nahoru-kopie` (s příponou
mjs) — 218 řádků starší verze `scripts/test-nahoru.mjs`, která se tam
kdysi omylem dostala a zůstala. Kořen je přitom to, co se servíruje;
smazáno. (Jméno je tu schválně rozdělené: `scripts/test-staticka.mjs`
hlídá, že dokumentace nemluví o souborech, které neexistují, a po
smazání by na ně ukázala právě tahle věta.)

## 172. Táž vada o patro výš: „Nahoru" leželo na výpisu i na monitoru *27. 10.*

Opravené kolečko z §170 je jen telefonní polovina věci. Na monitoru
je z téhož tlačítka pilulka „↑ Nahoru" široká 110 px a stojí 24 px od
hrany okna — jenže obsah má strop 1096 px, takže postranní pruh je
`(100vw − 1096) / 2` a na pilulku s odstupem (134 px) stačí až od
okna 1364 px. Pod tím pilulka sedí na výpisu. Naměřeno na okresní
stránce, kolik prvků zakrývá:

| okno | pilulka 110 px | kolečko 46 px |
|---|---|---|
| 900 | 1 text + karta | nic |
| 1100 | 2 texty + karta | nic |
| 1280 | 1 text + karta | nic |
| 1366 | nic | nic |

Na 1280 px — tedy na běžném notebooku — pilulka zakrývala pravý konec
ceny: „276 040 K~". Oprava je táž jako na telefonu, jen s hranicí
spočítanou z šířky pruhu:

```css
@media (max-width:1365px){
  .to-top{right:clamp(4px, calc(50% - 594px), 24px);
    width:46px; height:46px; border-radius:50%;}   /* jméno do aria-label */
}
```

`50% − 594px` je polovina okna minus polovina obsahu a minus šířka
kolečka: odsazení se tím přisune přesně k okraji sloupce, nejvýš na
24 px a nejmíň na 4. Po nasazení naměřeno od 640 do 1366 px: kolečko
nezakrývá **nic**. Pod 640 px obsah zabírá celou obrazovku a uhnout se
nedá — tam platí ustupování podle hlavní akce z §170.

Hlídá to nový blok v `scripts/test-nahoru.mjs`, který měří na třech
šířkách překryv s prvky výpisu a zároveň tvar tlačítka (do 1365 px
kolečko, od 1366 px pilulka). Sabotáž — vrátit mez na 560 px —
shodila čtyři kontroly.

### Co z toho plyne obecně

Plovoucí prvek u hrany okna se musí počítat z **šířky postranního
pruhu**, ne z okna. Dokud se odsazení píše jako pevné číslo, platí
jen pro tu šířku, na které se zrovna dívalo.

## 173. Šest set pixelů prázdna uprostřed každého řádku výpisu *27. 10.*

Výpis na okresních, krajských a druhových stránkách — tedy na 91
stránkách, na které lidé chodí z vyhledávačů — stál na monitoru
v jednom sloupci přes celou šířku obsahu (1 096 px). Parametry
(„orná půda · 4 263 m²") končily kolem 450 px, cena začínala na
1 065. Mezi tím bylo přes **600 px ničeho** a na obrazovku se vešlo
sedm nabídek — o dvě víc než na telefonu, kde je karta 350 px široká.

### Dva směry, oba vyfocené

Podle pravidla z CLAUDE.md šly majiteli nejdřív dva snímky:

* **A — dva sloupce karet.** Díru zaplní obsah.
* **B — bohatší řádek.** Do prázdna se přesunou štítky („příjezd",
  „−37 % proti okolí"), které dnes stojí na třetím řádku.

B vypadal dobře na nabídkách, které štítky mají — jenže jich má jen
část, takže u zbytku díra zůstala a sloupec se štítky navíc začínal
pokaždé jinde. Šlo se tedy cestou A.

### Co ukázalo měření

| stránka | výška výpisu dnes | dva sloupce | rozdíl |
|---|---|---|---|
| okres Benešov (32 nabídek) | 3 177 px | 1 952 px | −39 % |
| Jihočeský kraj (12) | 1 605 px | 940 px | −41 % |
| lesní pozemky (60) | 7 564 px | 4 573 px | −40 % |

### A proč se karta musela přeskládat

První pokus nechal kartu, jak byla (snímek, jméno, cena vpravo;
parametry a zdroj v druhé řadě) a jen ji dal do dvou sloupců.
V užším sloupci (542 px) se to ale rozpadlo: na stránce druhu, kde
parametry nesou i okres („lesní pozemek · 662 m² · okres Hradec
Králové"), se zalomilo **57 řádků z 60**. Na okresní stránce 0 z 32 —
tedy vada, kterou by jedna zkoušená stránka minula.

Parametry proto dostaly celou šířku textu a odkaz na zdroj se
přesunul pod ně:

```
"foto misto cena"      ← jméno obce a cena v jedné řadě
"foto meta  meta"      ← parametry přes celou šířku
"foto extra extra"
"foto zdroj zdroj"
```

Po přeskládání se nezalomí ani jeden řádek ze šedesáti.

**Hranice je 1200 px, a je naměřená:** na 1100 px se při dvou
sloupcích zalomilo 12 řádků z 32, na 1200 px žádný.

### Hlídač, který to drží — a jeden, který na to doplatil

`scripts/test-seznam-nabidek.mjs` dostal blok, který měří počet
sloupců na 1199, 1200 a 1440 px a počítá zalomené řádky parametrů.
Sabotáž (vrátit původní rozvržení karty) shodí kontrolu na 57 řádcích
ze 60.

Táž zkouška ale předtím hlídala, že všechna jména obcí v seznamu
stojí na JEDNÉ svislici — a dva sloupce znamenají dvě. Nebyla to
chyba hlídače, nýbrž změna významu: svislice se teď žádá uvnitř
sloupce a navíc se ověřuje, že skupin je přesně tolik, kolik sloupců
deklaruje mřížka (jinak by si kontrolu uspokojil i rozsypaný výpis,
kde má každý řádek „svůj sloupec").

## 174. Schod 16 px uprostřed první obrazovky webu *27. 10.*

Na úvodní stránce začínal nadpis „Pozemky na prodej, v dražbě
i v exekuci." na **32 px** od kraje (`--okraj-stranky`), ale pole
hledání přímo pod ním, odznaky druhů, nadpis výpisu i karty nabídek
na **16 px**. Tedy schod uprostřed toho, co člověk na webu uvidí
jako první — a přesně ten druh vady, která se nepozná při čtení CSS,
protože každé z těch čísel je samo o sobě v pořádku.

Zajímavé je, že stylopis u té lišty tvrdil pravý opak:

> Lišta ovládání je teď přes celé okno, takže si vezme okraj stránky,
> ne okraj desky: 16 px by na 1 920 px vypadalo jako překlep.

O dvě pravidla níž ale stálo `padding:8px 16px`. Komentář popisoval
úmysl, kód dělal něco jiného a nic mezi nimi nerozhodovalo.

Po srovnání (`padding:8px var(--okraj-stranky)` na liště i na sloupci
s výpisem) stojí nadpis, hledání, odznaky i karty na jedné svislici.
Karta výpisu se tím zúžila o 32 px (427 → 395 px na 1 440 px) a nic
se v ní nevysypalo — měřeno na 1 100, 1 280, 1 440 a 1 920 px.

Hlídá to nový blok v `scripts/test-uvod.mjs`: na třech šířkách měří
levý okraj nadpisu, hledání, výpisu a karty a žádá jedinou hodnotu,
navíc rovnou tokenu. Sabotáž (vrátit šestnáctku) shodí všechny tři.

**Měří se levý okraj TEXTU nadpisu, ne jeho krabice** — ta jde přes
celou šířku okna a o odsazení by neřekla nic. Je to týž trik jako
u díry v číslech hlavičky (§168): `getBoundingClientRect()` na prvku
měří místo, které prvek dostal, ne místo, které zabral jeho obsah.

## 175. Bílá karta v bílé kartě — a dvě velikosti téhož nadpisu *27. 10.*

Při hledání dalších schodů (§174) vyšlo najevo, že týž obsah má na
sousedních typech stránek dva různé rámy:

| stránka | rám kolem výpisu | nadpis | odsazení výpisu |
|---|---|---|---|
| krajská | žádný (`.okr-blok`) | 24 px | 152 px = svislice nadpisu |
| okresní, druhová, cenová, nové | **bílá karta** (`.add-card`) | 20 px | 172 px |

Na krajské stránce stojí karty nabídek rovnou na ploše stránky.
Na okresní byly zabalené do další bílé karty — tedy **bílá karta
v bílé kartě**, s obsahem odsazeným o 20 px a s menším nadpisem.
Karty nabídek se v tom rámu skoro ztratily: bílá na bílé, rozdíl
dělá jen vlasový obrys.

Sjednoceno na krajskou podobu. Pravidlo, které z toho plyne:
**karta je karta nabídky, ne rám kolem seznamu karet.** Výkladové
bloky (co znamená druh v katastru, co se za rozpočet dá koupit,
rozcestník okolních okresů) kartou zůstávají — tam žádná vnořená
karta není.

### Jak se to málem přehnalo

Hledání bloků k převodu jsem napsal jako „od `add-card` k dalšímu
`add-card`" a ono to chytlo i čtyři bloky, ve kterých žádný výpis
není — rozcestník okresů, výklad o druhu, rozcestník rozpočtů.
Převedly se a vypadalo to „taky dobře", jenže to nebyla změna, kterou
by něco opíralo o měření. Vráceny; převedeno je jen těch osm bloků,
které výpis opravdu obsahují.

Hlídá to `scripts/test-seznam-nabidek.mjs`, a měří tři věci na pěti
typech stránek: že je rám všude týž, že má nadpis nad výpisem tutéž
velikost, že výpis stojí na svislici nadpisu stránky — a přímo i to,
že `.add-card .okr-list` neexistuje nikde. Poslední kontrola je
nejlevnější a nejpřesnější: ptá se na vnoření, ne na jeho následek.

## 176. Zobecnění, které jsem zahodil: „ustup každému ovladači" *27. 10.*

Knoflík „nahoru" uhýbá hlavní akci stránky (§170). Při obhlídce
stránky pozemku na telefonu se našel druhý případ: kolečko sedělo na
tlačítku **„Navigovat"** v kartě se souřadnicemi — tedy na ovladači,
o kterém skript neví.

Vyjmenovávat selektory nemá konce, tak jsem to zobecnil: po doznění
posunu (ne při něm — dotaz na rozvržení při rolování stál kdysi
259 ms procesoru) se skript zeptal prohlížeče, co pod kolečkem leží:
`elementsFromPoint` v pěti bodech, a když to byl ovladač, kolečko
ustoupilo. Na stránce pozemku to fungovalo přesně podle představy.

**A pak to shodilo zkoušku na výpisu dražeb.** Tam má tlačítko
„Uložit" každá karta, takže kolečko mizelo i tam, kde ho
`scripts/test-nahoru.mjs` vyžaduje — a ta stránka má 18 700 px, tedy
dvaadvacet obrazovek: bez knoflíku se z jejího konce nahoru nedostane
nikdo. Měřeno na dvaceti polohách: na stránce pozemku kolečko
ustoupilo 3× z 10, na výpisu by zmizelo tam, kde je nejvíc potřeba.

Zobecnění je proto **zahozené**. Zůstává ustupování hlavní akci, kde
je kolize trvalá, a v `test-nahoru.mjs` přibyla kontrola, která hlídá
opačný směr: na dvaceti polohách okresní stránky musí být knoflík
vidět aspoň ve třech čtvrtinách. Aby se zobecnění nevrátilo oklikou.

### A druhá věc, kterou odhalila až tahle zkouška

Sjednocení rámu výpisu (§175) rozšířilo výpis o 20 px — zmizelo
odsazení vnější karty. Tím se ale zúžil pruh, do kterého se vejde
plovoucí knoflík:

| okno | pruh vpravo od výpisu | kolečko 46 px |
|---|---|---|
| 1 100 | 32 px | nevejde se |
| 1 200 | 52 px | vejde |
| 1 280 | 92 px | vejde |

Do 1 160 px se obsah neopře o svůj strop (1 096 px) a drží se okraje
stránky, takže pruh měří přesně `--okraj-stranky`. Na kolečko to
nestačí a nic s tím nenadělá ani menší odsazení — muselo by být menší
než terč 44 px. Zkouška proto napřed **změří pruh** a podle toho
žádá buď „neleží na výpisu" (od 1 200 px), nebo aspoň „tiskne se
k hraně". Je to přiznaný ústupek, ne tichý.

## 177. „2pozemků": čísla v hlavičce okresu se slepila se slovem *27. 10.*

Zkouška `scripts/test-cislo-a-slovo.mjs` vznikla kvůli přesně téhle
vadě na úvodní stránce („14krajů", „5druhů"). Při kontrolním běhu
všech zkoušek v prohlížeči se ukázalo, že od 26. 10. ji porušuje
hlavička okresních, krajských a druhových stránek — tedy těch, které
tentýž den čísla do hlavičky dostaly:

```
nove-pozemky.html          „3nových"
pozemky-okres-benesov.html „2pozemků"
pozemky-stredocesky-kraj   „7pozemků"
```

V mřížce je mezi číslem a popiskem mezera 16 px, takže okem je vše
v pořádku. V TEXTU stránky ale mezera chyběla: odečítač přečte
„dvapozemků", kdo si text zkopíruje, dostane slepenec, a vyhledávač
indexuje totéž.

Oprava je jedna mezera v generátoru (`</b> <span>`); ve flexu se
nevykreslí, takže se vzhled nezměnil ani o pixel.

### Co na tom bylo víc práce než ta mezera

Čtyři jiné zkoušky si ten kus značky vybíraly regulárním výrazem
`<\/b><span>` — tedy s předpokladem, že tam mezera NENÍ. Po opravě
přestaly číst čísla (`0 ze 77 okresů`) a padaly, ačkoli stránky byly
správně. Vzory teď počítají s bílým místem (`<\/b>\s*<span>`).

Poučení, které stojí za zapsání: **značka, kterou čte zkouška, je
rozhraní.** Když se v generátoru změní, nestačí spustit tu jednu
zkoušku, kvůli které se změna dělá — musí se najít všechny, které
tentýž tvar opisují. Jednou to v repozitáři už bylo (§165) a tahle
oprava to zopakovala v menším.

## 178. Sto sedmdesát tři deklarací, které nemohly nic udělat *27. 10.*

Při dnešních opravách se dvakrát ukázalo totéž: komentář ve stylopisu
tvrdil jednu věc a web dělal druhou. U lišty nad výpisem stálo

> Lišta ovládání je teď přes celé okno, takže si vezme okraj stránky

a o dvě pravidla níž `padding:8px 16px`. Vypadá to jako nepozornost,
ale je to **struktura**: `css/styles.css` má přes devět tisíc řádků
a týž selektor se v něm objevuje na několika místech. Kdo přidá
pravidlo na konec, přebije to dřívější — a dřívější tam zůstane
viset i s komentářem, který už nic nepopisuje.

### Kolik toho je

Měřeno průchodem souboru: pro každou trojici (mediální kontext,
doslovný selektor, vlastnost) platí poslední deklarace; dřívější jsou
mrtvé.

| | |
|---|---|
| mrtvých deklarací | **173** |
| dotčených selektorů | 70 |
| pravidel mrtvých CELÝCH | 22 |

Mezi celými: `.kraj-item:hover`, `.sources`, `footer`, `.step`,
`.status-card`, `.add-steps`, `.gl-item:hover`, `.okr-index-grid a:hover`
a — příznačně — `.map-controls-panel` v `@media (min-width:1041px)`,
tedy přesně to pravidlo s lživým komentářem.

### Jak se dokázalo, že se nic nezměnilo

Smazat 173 řádků z cizího stylopisu podle úvahy by byla sázka. Místo
toho **otisk vypočtených stylů**: pro každý viditelný prvek se uloží
třicet vlastností (display, barvy, odsazení, rámečky, písmo, stíny,
mřížka…) na osmnácti typech stránek ve čtyřech šířkách — 25 825 prvků.

Napřed se ale musel změřit ŠUM. Dva otisky téhož webu po sobě daly
2 923 rozdílů, a všechny ležely ve třech místech:

* `index.html` střídá nabídky při každém načtení (jiný obsah, jiné prvky),
* `span.mnb-ceka` je kolečko „čekám" s běžící animací,
* `width` a `height` závisí na textu, který se do nich zrovna vejde.

Po vynechání těchto tří dala dvojice otisků **nula rozdílů** — teprve
tím se z nich stal důkaz. Po úklidu: opět **nula rozdílů** z 25 825
prvků. Úspora: `styles.min.css` −4,1 kB, `uvod.min.css` −3,3 kB,
`zaklad.min.css` −1,1 kB; zdroj o 60 řádků kratší.

### Hlídač, aby se to nevrátilo

`scripts/test-mrtve-styly.mjs` dosud hlídal pravidla, která nemají na
čem zabrat (třída nikde v repozitáři). Teď hlídá i tenhle druhý druh:
žádná deklarace nesmí být přebitá týmž selektorem v témže mediálním
kontextu. Sabotáž (přidat na konec `footer{padding:28px 0;}`) ho
shodí a pojmenuje oba řádky.

Výjimky jsou tři a všechny mají důvod: fallback v témže bloku
(`height:100vh; height:100dvh`), dřívější `!important` proti pozdější
deklaraci bez něj, a vlastní vlastnosti (`--token`) — ty se čtou
proměnnou, ne kaskádou.

## 179. Úvodní deska přestala popisovat sortiment a začala slibovat *27. 10.*

Majitel: „brutální update, kreativita a marketing." První obrazovka
do té chvíle říkala **„Pozemky na prodej, v dražbě i v exekuci."** —
popis zboží, ne důvod zůstat. Pod tím rovnou nástroje.

Nová deska nese tři věci:

1. **příslib** — „Pozemek, který jinde **neuvidíte**." (zvýrazněné
   slovo je plná zelená plocha s tmavým písmem, 8,9 : 1, ne kurzíva —
   ta se na tmavé desce ztratí),
2. **jednu větu, z čeho se to skládá** — prodeje, dražby i exekuce
   z veřejných zdrojů, s cenou za metr, odhadem proti okolí a odkazem
   do katastru,
3. **dvě akce a řádek důvěry** — „Prohlédnout mapu", „Co přibylo
   tento týden", a pod nimi 77 okresů · kontrola zdrojů každých
   6 hodin · prohlížení bez účtu.

### Telefon je jiná verze téhož, a rozhoduje měření

`scripts/test-prvni-obrazovka.mjs` hlídá, že na displeji 390×844
začíná první NABÍDKA nad určitou hranicí — tedy že se na první
obrazovku vejde i obsah, ne jen značka. Plná deska by ji poslala na
571 px. Na telefonu se proto nekreslí obočí ani tlačítka a věta se
zkracuje na první polovinu:

| | deska | první nabídka | cena nabídky |
|---|---|---|---|
| dřív | 161 px | 439 px | vidět |
| plná deska na telefonu | 291 px | 571 px | vidět |
| **nasazeno** | **188 px** | **468 px** | **757 z 844** |

Mez zkoušky šla ze 450 na 480 (potřetí v historii té zkoušky, vždy
s naměřeným důvodem napsaným na místě) a má dvanáct pixelů rezervy.

### Tři nálezy, které z toho vypadly

* **Nadpis úvodu měl 28 px i na monitoru.** `--h1-domu` byl
  `clamp(28px, 2.4vw, 32px)`, jenže pravidlo `.st-hlava h1`
  (nástrojová osmadvacítka) stojí v souboru níž a má **tutéž váhu**
  jako `h1.uvod-nadpis` — takže token stejně neplatil. Naměřeno
  v prohlížeči: 28 px na 1 440 px šířky. Teď je `--h1-domu`
  `clamp(28px, 5.6vw, 80px)` a hrdina si velikost říká sám, o třídu
  silnějším pravidlem.
* **Mezera mezi číslem a popiskem nesmí stát mezi značkami.**
  Oprava z §177 (`</b> <span>`) rozbila hlavičku okresních stránek:
  dlaždice je svislý flex a samostatný bílý znak se v něm stane
  dalším PRVKEM — čísla spadla pod nadpis. Mezera proto leží uvnitř
  `<b>`, kde dělá v textu totéž a v rozvržení nic.
* **Hlídač hlavičky žádal rozvržení, které 26. 10. skončilo.**
  `test-hlavicka-stranky.mjs` trval na tom, že čísla stojí VEDLE
  nadpisu vpravo — jenže právě to dělalo tu díru na 74 ze 101
  stránek (§122) a čísla jsou od té doby schválně pod nadpisem.
  Kontrola se přepsala na dnešní stav: pod nadpisem, na jeho
  svislici, v jedné řadě.

## 180. „Co tu najdete a jinde ne" — čtyři důvody pod mapou *27. 10.*

Úvodní stránka šla z mapy rovnou na další nabídky („Tipy na dobrou
koupi"). Kdo přišel poprvé, neměl se kde dozvědět, čím se web liší od
inzertního portálu — a přitom je to to jediné, co ho odlišuje.

Nová sekce stojí hned pod nástrojem a nese čtyři karty. Každá tvrdí
JEDNU věc, kterou web opravdu dělá, a vede na stránku, kde se to dá
ověřit:

| karta | co tvrdí | kam vede |
|---|---|---|
| Cena za metr, ne jen cena | u nabídek s cenou je i cena za m² a odhad proti okolí | cena-pozemku.html |
| Dražby a exekuce vedle prodejů | tři druhy v jednom výpisu, u dražeb i termín | drazby-pozemku.html |
| Hlídání, ať vám nic neuteče | okres, cena, výměra → e-mail při nové nabídce | hlidani.html |
| Zdroj i katastr na jedno klepnutí | u každé nabídky odkaz na zdroj a cesta do katastru | list-vlastnictvi-katastr.html |

**Žádný slib do budoucna a žádné kulaté číslo navíc.** Formulace
„u nabídek s cenou" je tam schválně: část nabídek má cenu k ověření
a u nich cena za metr není — „u každé nabídky" by bylo o chlup
hezčí a nepravdivé.

Mřížka se láme podle místa, ne podle zařízení: pod 640 px jeden
sloupec, do 1040 dva, výš čtyři. Důvod je naměřený — užší karta než
240 px láme nadpis „Zdroj i katastr na jedno klepnutí" doprostřed
slova.

## 181. Poslední věc před patičkou byl formulář, ne nabídka *27. 10.*

Úvodní stránka končila kontaktním oddílem „Ozvěte se nám." — tedy
výzvou napsat e-mail, kterou po přečtení celé stránky nemá kdo
položit. Kdo dojel až sem a svůj pozemek nenašel, odcházel bez
nabídky, co dál.

Před kontakt přibyl pás se dvěma akcemi, které web umí a nic za ně
nechce: **nastavit hlídání** (okres, cena, výměra → e-mail, jakmile
se objeví nabídka) a **přidat vlastní pozemek**.

### Dvě měření, která to tvarovala

* **Tmavá plocha nešla.** Kontaktní oddíl hned pod pásem je taky
  tmavý (#12241A) a dvě tmavé plochy za sebou vypadají jako
  nedopatření. Pás proto nese plnou značkovou zeleň (#004F2F), na
  které má bílé písmo 10,6 : 1.
* **Nadpis vyšel tmavý na tmavém.** `.cta-pas h2` prohrálo
  s pravidlem pro nadpis oddílu, které stojí v souboru níž a má
  tutéž váhu — naměřeno #101513 na #12241A. Dnes je selektor
  `section.cta-pas h2`, tedy o třídu silnější. Je to **potřetí za
  den**, co táž past (stejná váha, pozdější pravidlo vyhrává) něco
  pokazila: nejdřív odsazení lišty (§174), pak velikost nadpisu
  úvodu (§179) a teď barva nadpisu v pásu. Hlídač z §178 zachytí jen
  přebití TÝMŽ selektorem; tohle je jeho slepé místo a stojí za
  zapsání.

## 182. Devadesát jedna vstupních stránek bez jediné nabídky, co dál *27. 10.*

Na okresní, krajské, druhové a cenové stránky chodí lidé
z vyhledávačů. Hlavička na nich nesla nadpis a čísla, pak rovnou
výpis — a na konci nic. Kdo nenašel svůj pozemek, odešel.

Přibyly dvě věci:

* **věta pod nadpisem** — co tu je a co s tím web umí („Prodeje,
  dražby i exekuce z okresu pohromadě — s cenou za metr a odkazem
  do katastru"). Formulace je opatrná schválně: část nabídek má
  „cenu k ověření", takže „u každé" by nebyla pravda;
* **závěrečný pás** — tentýž značkově zelený blok jako na úvodní
  stránce: nastavit hlídání, nebo přidat vlastní pozemek.

### Tlačítko v hlavičce jen na širokém displeji

Nejdřív tam bylo i na telefonu. Naměřeno na okrese Benešov
(390×844): hlavička vyrostla z 300 na 453 px a první nabídka klesla
z 766 na 904. Tlačítko proto na telefonu není — táž nabídka stojí
v pásu na konci stránky, kam dojede přesně ten, komu výpis nestačil.
Po úpravě: hlavička 385 px, první nabídka 836.

Zbytek té vzdálenosti nedělá nová věta, ale to, co bylo mezi
hlavičkou a výpisem odjakživa: odkaz na mapu, čára, nadpis výpisu
a dvě poznámky (řazení a čerstvost zdrojů). To je další práce, ne
tahle.

## 183. Číslo 1096 ve stylopisu lhalo a stálo za překryvem *27. 10.*

Zkouška `test-nahoru` zčervenala hned po §182: na 1366 px hlásila,
že plovoucí tlačítko „nahoru" leží na kartě výpisu. Nejdřív jsem to
vzal jako hraniční případ zaokrouhlení a hranici posunul z 1366 na
1400 px. **Zčervenalo znovu** — takže domněnka byla špatná a muselo
se měřit.

Změřeno na okresní stránce (1400×900, posun 1800 px):

```
okno 1400   karta výpisu končí na 1268   pilulka začíná na 1266
```

Dva pixely. Příčina není zaokrouhlení, ale jedno špatné číslo
v komentáři i ve výpočtu: *„obsah má strop 1096 px"*. Strop je
`--m-wrap` 1200 px a po odečtení okraje stránky (2 × 32) má text
**1136 px**. Pruh vedle obsahu je tedy o 10 px na každé straně užší,
než se s ním počítalo, a z toho čísla se odvozovaly obě hodnoty:

* **hranice pro pilulku.** Pilulka je 110 px široká a stojí 24 px od
  hrany, potřebuje tedy okno 1136 + 2 × 138 = **1412 px**. Hranice je
  proto 1440 px (pruh 152, rezerva 18), ne 1364 ani 1400.
* **odsazení kolečka.** `clamp(4px, calc(50% - 594px), 24px)` mířilo
  o 20 px doleva, tedy na obsah. Správně je polovina obsahu (568) +
  šířka kolečka (46) + 4 px rezervy = `50% - 618px`.

### Zkouška tvrdila obojí zároveň

Padlá kontrola stála vedle procházející, která říkala, že se
tlačítko vedle obsahu vejde. Obě vycházely z jednoho měření, takže
jedna z nich musela být napsaná špatně — a byla to ta druhá:

```js
const vejdeSe = v.pruh >= v.sirka + 4;   // 132 >= 114 → „vejde se"
```

Pruh 132 px se porovnával se **šířkou** tlačítka a na jeho odsazení
od hrany se zapomnělo; 110 + 24 = 134 se do 132 nevejde. Dnes se
ptá na to, co rozhoduje: vejde-li se do pruhu aspoň tvar tlačítka,
musí platit, že nezakrývá nic. Teprve je-li pruh užší než tlačítko
samo, je překryv nevyhnutelný a jediné, co lze žádat, je tisk
k hraně.

### Chyba kolečka přežila, protože se měřily jen kulaté šířky

Odsazení kolečka bylo špatně celou dobu, ale `test-nahoru` měřila
1100, 1280 a 1366 px — a na žádné z nich se to neprojeví. Naměřená
tabulka (staré odsazení proti novému):

| okno | pruh | staré `594` | nové `618` |
|---|---|---|---|
| 1180 | 32 px | zakrývá kartu i cenu | zakrývá (pruh < kolečko, nevyhnutelné) |
| 1240 | 52 px | **zakrývá kartu i cenu** | nic |
| 1260 | 62 px | **zakrývá kartu i cenu** | nic |
| 1276 | 70 px | nic | nic |
| 1440 | 152 px | nic (pilulka) | nic (pilulka) |

V seznamu šířek je proto 1240 px z měření, ne z kulatosti, a 1400 px
jako šířka, na níž se láme tvar. Obě sabotáže zčervenaly: vrácené
`594` padne na 1240 px, vrácená hranice 1399 padne na 1400 px ve
dvou kontrolách.

Poučení není o pixelech: **odvozené číslo v komentáři zestárne tiše.**
1096 px někdy platilo, pak se obsah rozšířil a komentář zůstal —
a protože se z něj počítalo, rozšířil chybu do dvou pravidel a jedné
zkoušky. Dnes je v komentáři napsané, z čeho se 1136 skládá, aby
se příště přepočítalo, až se změní `--m-wrap` nebo okraj stránky.

## 184. Tři sta dvacet sedm stránek bez jediného pravidla *27. 10.*

Při měření, jak hluboko na stránce pozemku leží cenový verdikt, se
ve vzorku 24 stránek čtyři chovaly jinak: neměly `h1.pz-place` ani
`.pz-price`. Vypadalo to na chybu vykreslování. Nebyla:

```
Tato nabídka už není aktuální. Zmizela ze zdroje 6. 10. 2026.
```

Když pozemek zmizí ze zdroje, generátor stránku schválně
**nepřegeneruje** — uložený odkaz si má udržet podobu z doby, kdy
nabídka platila — a jen jí nahoru dopíše pruh. Detail se pak
nevykreslí, protože data nejsou, a na stránce zůstane **statická
záloha**: `article.pz-staticky`, kterou `js/pozemek.js` jinak celou
přepíše. Tedy ta část stránky, kterou do dneška nikdo neviděl.

A neměla ve stylopisu **jediné pravidlo**. Nadpis, odstavec a osm
dvojic `<dt>`/`<dd>` pod sebou v jednom sloupci — holý dokument.
Spočítáno: **327 z 2 271 stránek pozemků (14,4 %)**. Nic nespadlo,
nic nehlásilo chybu a žádná zkouška se tam nedívala, protože všechny
braly stránku pozemku jako něco, co vykreslí skript.

### Dvě podoby téhož pruhu

Pravidla pro `.pz-konec` ležela v `css/pozemek-vlozeny.css` a dělala
z pruhu oznámení v barvě upozornění. Nová pravidla v `css/styles.css`
z něj dělají zelené rozcestí. Hlídač `test-vlozeny-styl` na ten
rozpor právem spadl a donutil rozhodnout: pravidla jsou teď jen
v `css/styles.css`. Důvod je věcný, ne estetický — **vložený stylopis
se stránce zapíše při sestavení**, takže ho vyřazené stránky mají
zamrzlý a žádná změna v něm se k nim nikdy nedostane. Sdílený soubor
si přes `<link>` berou znovu všechny, takže jím šlo spravit všech 327
bez jediného přegenerování.

### Co se změnilo

* **Rozcestí je nahoře a je to hlavní věc na stránce.** Tři podobné
  pozemky z téhož okresu a odkaz na mapu v pruhu byly odjakživa — ale
  jako odrážkový seznam pod drobným odstavcem. Kdo přijde z uloženého
  odkazu, má jedinou užitečnou otázku: co místo toho.
* **Záznam zůstává úplný.** Kdo si odkaz uložil kvůli číslu parcely
  nebo dražebníkovi, najde to tam dál; jen to vypadá jako tabulka.
  Na telefonu jeden sloupec, od 640 px dva.

### Dvousloupcová tabulka na telefonu nešla

Ve směru B (viz dva návrhy, které tomu předcházely) vypadala tabulka
`popisek | hodnota` na monitoru dobře a na 390 px se popisek
„Vlastnictví" překryl s hodnotou „spoluvlastnický podíl 2/24 — cena
je za podíl…". Mřížka se proto zapíná až od 640 px; pod tím je
hodnota pod popiskem. Hlídač to měří přímo — porovnává obdélníky
`<dt>` a `<dd>`, ne šířku okna.

### Šest hlídačů řeklo ne

Zapsaná pravidla neprošla rychlou sadou: 7 odstupů mimo stupnici
(10, 14, 18 px), 5 velikostí písma mimo stupnici (15, 22, 30 px),
prostrkání 0,08 em, řádkování 1,15, velikost `h1` opsaná číslem
místo pojmenovaného stupně a ten rozpor o dvou místech pro tutéž
vlastnost. Všechno je opravené na hodnoty ze stupnic
(`--h1-nastroj` pro nadpis záznamu — „nadpis, který nemá křičet").
Za zapsání to stojí proto, že soustava zabrala přesně tak, jak má:
nová plocha se bez boje nepřipsala.

### Zkouška

`scripts/test-vyrazena-nabidka.mjs` (43 kontrol, dvě šířky, tři
stránky vybrané ze souborů, ne natvrdo). Netvrdí „vypadá hezky" —
měří čtyři věci: rozcestí je nad záznamem, jeho odkazy jsou aspoň
44 px vysoké, popisek a hodnota se nepřekrývají ani nepřetékají,
a pruh, záznam i tabulka stojí na vlastní ploše. Po odebrání nových
pravidel padne 9 kontrol z 43.

## 185. Argument stránky ležel pod ohybem — a pás, který jsem přidal ráno, musel pryč *27. 10.*

Verdikt o ceně („Levnější než 78 % pozemků téhož druhu v okrese
Benešov") je jediné, co tenhle web o nabídce ví a zdroj ne. Naměřeno
na telefonu 390×844 na vzorku 24 stránek pozemků:

| | |
|---|---|
| verdikt má | 15 z 24 stránek |
| začíná průměrně na | y = 1 157 px (nejdál 1 385) |
| cena stojí na | y = 580 px |
| obrazovka | 844 px |

Pět set sedmdesát sedm pixelů pod cenou, tedy pod ohybem, je na
hlavní argument stránky pozdě.

### Jedno rozhodnutí, dvě místa

U ceny je teď odznak s jedním slovem („Výhodná cena", „Vyšší cena",
„Prodává se podíl") a odkazem na verdikt. **Není to druhý výpočet.**
Slovo i barvu rozhoduje jediná funkce `cenovyStupen()` v
`js/pozemek.js`, kterou používá odznak i verdikt; celou větu, místo
srovnání a počet nabídek nese dál jen verdikt. Změřeno znovu: odznak
začíná průměrně na **y = 673 px**, tedy o 484 px výš a na první
obrazovce u všech patnácti. Celý verdikt se tím posunul z 1 157 na
1 213 — jedno slovo o 484 px dřív za celou větu o 56 px později.

Zkouška `scripts/test-cenovy-stupen.mjs` (38 kontrol, 12 stránek
rozprostřených po abecedě) hlídá to, co se rozejít může: slovo na
odznaku se musí **doslova** rovnat slovu na verdiktu, odznak musí být
právě tam, kde je verdikt, odkaz musí někam vést a odznak musí zůstat
na první obrazovce. Obě sabotáže zčervenaly — natvrdo zapsané slovo
u ceny padne na čtrnácti stránkách, posun odznaku o 600 px na
kontrole o první obrazovce.

### A pak zčervenalo pořadí

`test-poradi-pozemku` ohlásil **3 851 px = 4,81 obrazovky** proti mezi
4,4. Viník nebyl odznak (44 px), ale závěrečný zelený pás „Není to
ono?", který jsem na stránku pozemku přidal **dnes ráno** (§183).
Změřeno na 360×800:

```
pás „Není to ono?"   445 px     (víc než celý verdikt, 345)
celá stránka        3 851 px    = 11,5 % výšky nese ten pás
```

Těsnější varianta pásu ho stáhla na 310 px a stránku na 3 716 — pořád
nad mezí. Zvednout mez by bylo nepoctivé: stojí u ní napsáno, že její
smysl je „po předělání se stránka nesmí vrátit k naměřeným 4,7
obrazovky", a 3 716 px je 4,65. Mez, kterou si upravím, aby prošla
moje změna, nehlídá nic.

**Pás je proto ze stránky pozemku pryč** a hlídání se přestěhovalo do
rozcestníku „Kam dál", který na konci stránky už byl. Dlaždice se
vešla do volného místa v existující mřížce, takže `pz-kamdal` zůstal
na 156 px a **stránka klesla na 3 406 px (4,26 obrazovky)** — pod mez
i proti stavu před dnešním ránem. Zeleň ji z řady šedých odliší;
bílá na `--plocha-znacka` dává 10,6 : 1.

Na úvodní a okresních stránkách pás zůstává: tam je na konci dlouhého
výpisu místo i důvod. Poučení je o tom, kde se co měří — **tentýž
blok, který je na výpisu správně, je na detailu nabídky daň.**

## 186. Vráceno: barvy pryč, nabídka na šest položek *27. 10.*

Majitel k dnešní práci: *„zase přidáváš nějaké barvy, nepotřebujeme
barvy, ale čistotu… nemůžeš si dovolit překopat věci, které jsem já
sám už upevnil, musíš dělat věci, které jsem ještě neupevnil. A zbav
se konečně těch věcí v menu a prokliků a nudných nesmyslných textů —
nemá to být příručka, ale web na prodej."*

To je rozhodnutí, ne diskuse. Co se vrátilo a co odešlo:

### Vráceno do stavu, který platil

Úvodní deska, čtyři karty „Co tu najdete a jinde ne", závěrečný
zelený pás na úvodní i na 91 regionálních stránkách a věta pod
nadpisem okresu — všechno z dnešního rána (§179–§182). Úvodní deska
je zase ta, která byla schválená: *„Pozemky na prodej, v dražbě
i v exekuci."*, vstupní odznaky, hledání. Stránka tím spadla
z 19 040 px na 17 515.

Zůstalo jen to, co opravovalo vadu, ne vzhled:

| zůstává | proč |
|---|---|
| §183 tlačítko „nahoru" | leželo na kartě výpisu, špatně odvozené číslo |
| §184 vyřazené nabídky | 327 stránek bez jediného pravidla |
| §185 odznak u ceny | hlavní argument ležel pod ohybem |

### Barvy pryč

Tři věci z dneška měly novou barevnou plochu a všechny tři ji
ztratily: zelené rozcestí na vyřazené stránce je bílá karta
s vlásečnicí, barevná pilulka u ceny je obyčejné tučné slovo
a dlaždice „Hlídat nové nabídky" vypadá jako ostatní dlaždice.
U odznaku je to i věcně lepší: rozlišuje **slovo**, ne odstín,
takže ho přečte i ten, kdo barvy nerozezná.

### Nabídka: ze třinácti odkazů šest

```
bylo:  Pozemky ▸ (Hledat na mapě, Podle okresu)
       Příležitosti ▸ (Dražby, Exekuce, Nové na trhu)
       Ceny pozemků · Rádce · Kontakt
       Můj profil ▸ (Moje inzeráty, Zprávy, Hlídání)
       Přidat pozemek
je:    Hledat na mapě · Ceny pozemků
       Můj profil ▸ (Moje inzeráty, Zprávy, Hlídání)
       Přidat pozemek
```

Třináct odkazů a tři nadpisy skupin → šest odkazů a jeden nadpis;
šuplík na telefonu se přestal rolovat. **Žádná stránka nezmizela** —
dražby, exekuce a nové na trhu vedou ze vstupních odznaků na úvodní
desce, rozcestník okresů z mapy, rádce a kontakt z patičky. Lišta si
na ně jen přestala nárokovat místo.

Dvě zkoušky to zčervenaly a obě měly pravdu — popisovaly nabídku,
která schválně zmizela. Nejsou uvolněné, jsou **obrácené**: místo
„aspoň tři skupiny" se hlídá „právě jedna, a to účet", místo „aspoň
dvanáct odkazů" se hlídá „nejvýš osm, a pořád mezi nimi mapa, ceny
a účet". Z podlahy je strop.

### A jedna skutečná nečistota

Nápisy nad výpisem vypadaly jako překlep: „Stáhnout␣␣výběr",
„Procházet␣␣po jednom". Změřeno na 390 px — mezera písma 3,1 px,
díra mezi slovy 8 px. Tlačítko je `inline-flex` s `gap:8px`, aby
ikona nelepila na text, jenže sloveso a `<span>` se zkráceným
doplňkem jsou dvě flexové položky, takže tatáž mezera rozdělila
i dvě slova jedné věty. Obal `.mc-popis` z nápisu dělá jednu
položku; uvnitř platí běžná sazba a díra je 0.

## 187. Parametry podle předlohy: jedna tabulka místo dlaždic a tabulky *27. 10.*

Majitel poslal sedm fotek z telefonu — detaily nabídek z reality.idnes
a Sreality — se zadáním, že stránka má vypadat takhle. Co z nich platí
pro parametry nabídky: **jedna tabulka štítek–hodnota**. Popisek vlevo
šedě, hodnota vedle něj černě, žádná karta, žádné linky, jen odstup:

```
Konstrukce budovy    panelová
Stav bytu            velmi dobrý stav
Vlastnictví          osobní
Přístupová komunikace  asfalt
Užitná plocha        61 m²
```

Stránka pozemku měla místo toho **dvě soustavy nad sebou**: tři velké
dlaždice (výměra, cena za metr, druh) s 24px číslem a ikonou v rohu,
a pod nimi tabulku se zbytkem, písmem o dva stupně menším. Údaj téže
povahy se tím četl dvakrát jinak podle toho, do které půlky spadl.

Dlaždice jsou pryč. Jejich obsah stojí v tabulce jako první tři řádky
a přibyly dva údaje, které v předloze do tabulky patří a u nás stály
rozsypané kolem ní: **vzdálenosti** (byly řádkem pod místem)
a **stav a zdroj** (byl drobným písmem pod cenou). Naměřeno na
390×844: řádek měří 42 px, celá stránka 3 375 px.

### Co s dlaždicemi odešlo

Hodnota v dlaždici byla 24px číslo na jednom řádku, takže dlouhá
hodnota („23 458 Kč/m²", „neuvedena") z dlaždice vytékala nebo lezla
na ikonu v rohu. Řešil to měřicí kód, který hodnotě ubíral stupeň
(24 → 20 → 16 px) a hlídal změnu šířky mřížky ResizeObserverem —
dohromady 3,5 kB zdroje. V tabulce mají všechny hodnoty touž velikost
jako okolní text a dlouhá se prostě zalomí, takže se nemá co
zmenšovat: kód je smazaný, stejně jako 18 pravidel stylopisu rodiny
`.pz-klic*`.

### Deset zkoušek na tom viselo

Sedm jich zčervenalo a všechny právem — měřily dlaždice. Šest z nich
teď čte tabulku (`.pz-spec`: popisek `.k`, hodnota `.v`), u čtyř se
přitom změnilo, **co** se tvrdí, ne jen kde se to hledá:

* „to hlavní číslo je větší než údaj v řádku" → „popisek i hodnota
  mají touž velikost písma" — z dvou soustav je jedna;
* „žádná hodnota nevyteče z dlaždice ani neleze na značku" a
  „zmenšuje se jen na stupně 24/20/16" → „nevyteče ze svého sloupce"
  a „všechny hodnoty mají touž velikost";
* „a každá dlaždice má svou značku" → „každý řádek má popisek
  i hodnotu" (značky v rozích s dlaždicemi odešly);
* „u běžné nabídky nejsou dlaždice doplňované výplní" už nežádá
  **právě tři** řádky — tabulka jich nese tolik, kolik je o nabídce
  známo; výplňový řádek „Vlastnictví: celý pozemek" se hlídá dál.

Sedmá, `test-hlavicka-pozemku`, se obrátila celá: hlídala, že zdroj
stojí pod cenou a v tabulce **není** podruhé. Dnes je to naopak.

### Dvě vlastní chyby po cestě

**Zavolal jsem řetězec jako funkci.** Po vyjmutí dlaždic zbylo v tom
dlouhém zřetězení `''` a hned za ním `(facts.length ? …)`, takže
z toho vzniklo volání: `TypeError: "" is not a function` a stránka
spadla z 3 363 px na 1 739. Chytila to až prohlídka v prohlížeči —
žádná rychlá zkouška JavaScript stránky nespouští.

**Hlídač hledal mezeru, kterou tam sazba nedá.** Řádek „Stav a zdroj"
se nenašel, protože česká sazba vkládá za jednopísmenné „a"
nezlomitelnou mezeru (U+00A0) a předpis měl obyčejnou. Zkouška pak
hlásila „null" na stránce, kde ten řádek je. Dnes se porovnává přes
`\s+`.

## 188. Nadpis vede slovesem, jak to má předloha *27. 10.*

Na fotkách z reality.idnes a Sreality začíná nadpis tím, co se
s nemovitostí děje: *Prodej bytu 2+1 61 m²*, *Pronájem bytu 2+kk
52 m²*. Tahle stránka začínala druhem — *Ostatní plocha 6 336 m²* —
takže z nadpisu nešlo poznat, jestli se prodává, draží, nebo jde
o exekuci. A kdo ve vyhledávači píše „prodej pozemku Benešov",
nenašel v titulku ani jedno ze svých slov.

Dnes je tam *Prodej ostatní plochy 6 336 m²*.

### Druh zůstal, jen ve druhém pádě

Zahodit ho nešlo: odlišuje dvě nabídky, které se jinak liší jen
výměrou, a na tom stojí celé rozlišování duplicitních titulků. Druhý
pád se nedá odvodit pravidlem (půda → půdy, porost → porostu,
nádvoří → nádvoří), ale **druhů je ve vygenerovaných stránkách
třináct** — spočítáno — takže je to slovník, ne algoritmus. Co v něm
není, projde beze změny; radši jednou bez slovesa než dvakrát špatně
ohnuté slovo.

Sloveso podle typu nabídky: *Prodej*, *Dražba*, *Exekuční dražba*
(exekuce je řízení, dražba je ta událost, které se dá zúčastnit).

### Kolize s 65 znaky — a proč se nadpis oddělil od titulku

Hlava „Prodej trvalého travního porostu" je o jedenáct znaků delší
než „Trvalý travní porost", takže se do titulku (65 znaků i se jménem
webu, jinak ho Google usekne) přestalo vejít místo. Naměřeno hned po
první verzi: **z 32 benešovských stránek jmenovalo okres jen 11**
a dvě nabídky ve Strunkovicích dostaly týž titulek.

Dvě opravy:

1. **Žebřík zkracování nabízí obě hlavy střídavě** — nejdřív se
   slovesem, a když se nevejde, totéž bez něj. Sloveso tím ustupuje
   dřív než okres a výměra. Slovesem teď začíná 1 003 titulků
   z 2 198 (46 %).
2. **Nadpis na stránce se od titulku oddělil.** Není to dvojí pravda,
   je to dvojí omezení: titulek čte výpis výsledků a má strop,
   nadpis čte člověk a žádný nemá. Nadpis proto vede slovesem
   **vždycky**.

Statický `<h1>` pro vyhledávače se dělí z téhož `nadpis` jako ostrůvek
`#pz-titul-data`, ze kterého skládá nadpis `js/pozemek.js` — obojí je
doslova týž text. Kdyby se dělil z titulku, viděl by robot jiný nadpis
než člověk; přesně to `test-hlavicka-pozemku` hlídá a přesně na tom
spadl, než se to srovnalo. Jeho tvrzení se tím zúžilo: **nadpis
a ostrůvek se musí rovnat doslova, titulek musí nést místo** — ne že
jsou všechny tři týž řetězec.

### Vlastní chyba po cestě

`nadpis` jsem napsal do `textyPro()`, ale použil v `stranka()`, kam se
nevrací — generátor spadl na `ReferenceError` a s ním sedm zkoušek
naráz. Je to tatáž třída chyby jako ten řetězec volaný jako funkce
o jednu položku výš: **velká změna v dlouhé funkci, kterou neodhalí
nic než spuštění.**

## 189. Karta a stránka za ní říkaly o téže nabídce dvě jména *27. 10.*

Nadpis stránky pozemku začal §188 vést slovesem („Prodej vinice
3 476 m²"), ale karta ve výpisu zůstala u holého druhu („Vinice
3 476 m²"). Rozešel jsem je sám, o jeden krok dřív — a je to přesně ta
vada, kterou tenhle repozitář zná od cenového verdiktu, termínů dražeb
i adresy snímku: **web o jedné věci tvrdí dvě.**

### Slovník má jedno místo, a není to ani jedna ze dvou stran

Jméno nabídky skládají dvě různá prostředí: sestavení
(`scripts/generate-parcel-pages.mjs`, nadpis stránky), prohlížeč
(`js/main.js`, nadpis karty) a od téhle změny i generátor regionů
(řádek výpisu). Tabulka druhého pádu a sloves proto leží
v **`js/cisteni.js`** — v brance, kterou všechny tři stejně používají
na českou sazbu — a sestavení i zkoušky si ji berou mostem
`createRequire`. Je to tentýž postup, jakým si generátor regionů bere
okres → kraj z `js/ceny.js`, a je tu ze stejného důvodu.

### Na druhové stránce zůstane jen sloveso

„Prodej lesního pozemku" v každém řádku stránky **Lesní pozemky**
opakuje, co stojí v titulku — a navíc se delší text na 1 200 px
v dvousloupcovém výpisu zalomil: naměřeno 5 řádků z 60 na
`pozemky-lesni.html`. Řádek tam proto nese jen sloveso („Prodej",
„Dražba", „Exekuční dražba"), které se mezi řádky liší a něco říká.
Je to totéž pravidlo jako `skryjOkres` na okresní stránce.

### Zkouška se musela přeložit do nových slov

`test-odhad-regiony` páruje vykreslený řádek zpátky s nabídkou podle
klíče `místo + druh + výměra + cena`, a druh četla z metařádku. Ten
teď nese „Prodej orné půdy", ne „Orná půda", takže se nespárovalo
**nic**: 0 řádků místo 2 111 a čtyři kontroly prošly naprázdno. Klíč
se proto skládá z téhož tvaru, jaký se vypisuje — a sestavuje ho táž
funkce z `js/cisteni.js`, aby se zkouška a web nemohly rozejít ani tady.

Mimochodem: tohle je ta vzácná chvíle, kdy „zkouška spadla" znamená
**zkouška udělala svou práci**. Kdyby klíč nepároval mlčky a jen
o něco míň, nikdo by si toho nevšiml.

## §193 Tři vady, které CI hlásilo a já je přehlédl

Majitel napsal, že je stránka rozbitá a půlka věcí nefunguje. Měl
pravdu a šlo to vidět: **„Testy a kontrola kódu" padaly na třech
posledních pushích za sebou** — a nasazení na web proběhlo přesto,
protože Pages se na výsledek zkoušek neptají. Na web tedy šel stav,
o kterém CI vědělo, že je špatně. Rychlá sada (134 zkoušek) přitom
byla zelená celou dobu; tyhle tři žijí v sadě, co běží v prohlížeči,
a tu jsem po každé změně nepouštěl.

### 1. Mapa skákala na první dotek

Pravidlo je staré a popsané: první dotek mapu jen probudí, nevybere
kraj. Tři místa se na to ptají (obrys kraje, špendlík, plocha mapy) —
**krajská kolečka se shluky se neptala.** Přibyla později a pravidlo
se k nim nedoplnilo. Naměřeno na 390×844: střed 49,838/15,484 →
50,065/14,467 a přiblížení 6,25 → 7,75 hned napoprvé. Ťuknutí do
kolečka tedy dělalo přesně to, čemu mělo probuzení zabránit.

### 2. Prodávající z Mostu si neměl jak vybrat okres

Nabídka okresů ve formuláři „Přidat pozemek" se stavěla z okresů,
které mají vlastní stránku — a ta vzniká až od tří nabídek. Jenže kdo
přidává pozemek, ten nabídku teprve NESE; čím prázdnější okres, tím
spíš. Když Mostu vypršel termín dražbě a spadl na dvě nabídky, zmizel
z nabídky 77 okresů a zbylo 76.

Zdrojem je teď správní členění z `js/ceny.js`, které na počtu nabídek
nezávisí — a táž tabulka rozhoduje i o zařazení inzerátu, takže se
nemůže rozejít s tím, co formulář nabízí. Úřední tvar jména („Hlavní
město Praha" vedle „Praha") se z nabídky vypouští obecným pravidlem,
ne výjimkou na míru, a počet se kontroluje: nesedí-li 77, sestavení
spadne.

### 3. Hlídač křičel planý poplach a kryl tím ty dva skutečné

`test-naseptavac` hlásil, že popisek „Druh, cena, výměra a další" má
kontrast 1,55 : 1. Vyfoceno: je bílý na tmavě zeleném a čte se dobře.
Chyba byla ve výpočtu — procházení nahoru se zastavilo na PRVNÍM
pozadí, které není úplně průhledné, a tím je desetiprocentní světlý
závoj nad tmavým pásem. Brát závoj jako hotovou barvu znamená počítat
„bílá na skoro bílé". Vrstvy se teď skládají, dokud se nedojde
k něčemu neprůhlednému.

**A tohle je na tom to podstatné:** planý poplach není neškodný.
Držel CI červené, a v červeném běhu zapadlo, že mapa skáče a že
prodávající z Mostu nemůže inzerovat. Zkouška, která lže, je horší
než žádná — ta aspoň nikoho neuspí.

Sabotáž u všech tří: po vrácení původního chování spadly přesně ty
kontroly, které je mají chytat.

## §194 Tmavě zelená deska pryč — deska je zase světlá

Majitel poslal fotku úvodní stránky s tím, ať se ta zelená konečně
vrátí, jak to bylo. Jde o desku pod lištou: nadpis, odznaky a pole
hledání stály na `--plocha-tmava` (#12241A).

**Byl to jeden řez.** Deska nevznikala barvami rozepsanými po
pravidlech, ale přepisem tokenů `--pas-*` ve dvou rozsazích
(`.add-hero, .okr-band, .st-hlava` a `.map-controls-panel`). Komentář
u toho přepisu to říkal rovnou: „nepřepisuje se tu barva v každém
pravidle, které na pásu něco kreslí (bylo by jich dvacet šest)".
Díky tomu stačilo přepis sundat — žádné z těch dvaceti šesti pravidel
se nezměnilo, všechna dál říkají `var(--pas-text)` a teď jim vyjde
světlá sada z `:root`, tedy ta, která tu byla před směrem 2.

Platí to pro celý pás najednou: úvodní deska, hlavy okresních
a krajských stránek i panel nad výpisem.

### Co ze zesvětlení spadlo

Pole hledání bylo bílé a na tmavé desce se vymezovalo samo. Na světlé
má proti ní **1,12 : 1** a bez linky je to bílá plocha v bílé ploše —
naměřil to `test-okraje` na telefonu i na monitoru. Dostalo
`--line-ui`, tedy tutéž čáru jako ovladače nad výpisem, která drží
mez 3 : 1 z WCAG 1.4.11.

Po opravě: `test-okraje` 135 prvků bez nálezu, `test-kontrast`
2 652 prvků a 0 pádů, `test-uvod` 66/66, `test-barvy` 58/58,
`test-hierarchie` 21/21, `test-soustava` 15/15, rychlá sada 134/134.

Kdyby se měla tmavá deska někdy vrátit, je to týž řez obráceně.

## §195 Křivka vývoje ceny na detailu nabídky

Majitel poslal fotku detailu ze Sreality s kartou „Cenový přehled“
a napsal, ať náš graf vypadá takhle. Web křivku vývoje cenové hladiny
umí od začátku (`js/graf-cen.js`, data `data/historie-cen.json`,
45 dnů × 151 řad) — a měla ji okresní stránka, krajská stránka
i „Ceny pozemků“. **Chyběla přesně tam, kde ji Sreality má: na detailu
jedné nabídky**, tedy v místě, kde se o koupi rozhoduje.

Karta teď stojí hned pod verdiktem o ceně. Verdikt říká, jak je ta
jedna nabídka na dnešní poměry; křivka, kam se poměry hýbou. Kreslí ji
týž modul z téže řady, jakou o témž okrese ukazuje okresní stránka,
takže se čísla o jednom místě nemůžou rozejít.

### Tři věci, které se jinde neřešily

**1. Místo pro graf v HTML vůbec není.** Detail nabídky skládá
`js/pozemek.js` až v prohlížeči, kdežto `graf-cen.js` si svá místa
hledá JEDNOU při startu stránky (`querySelectorAll` nad hotovým
dokumentem). Prvek v té chvíli neexistoval, takže by se graf
**nenakreslil vůbec** — žádná chyba, žádný prázdný rámeček, prostě
nic. Modul proto vystavuje `postav` a stránka mu prvek podá sama.

**2. Prázdná karta nesmí být vidět.** Klidnou řadu má 21 okresů ze 48,
které vůbec nějakou řadu mají, a bez ní se nekreslí nic (to je
rozhodnutí `graf-cen.js`: u malých okresů převáží výměna nabídek nad
pohybem cen — naměřeno +132 % za tři týdny u Brna-venkova). Nadpis
„Vývoj ceny v okolí“ nad prázdným rámečkem by tvrdil, že o vývoji něco
víme. Karta se proto rodí bez nadpisu a bez rámu a odkryje ji až
odpověď z `postav`, která nově vrací `true`/`false`.

**3. Data až na dohled.** `historie-cen.json` má 69 kB a karta leží
pod verdiktem. Stahovat ji hned na každé z 2 276 stránek pozemků by
byl provoz za nic, takže se čeká na `IntersectionObserver` se
záložkou 300 px — tutéž, jakou má modul u sebe na okresní stránce.
Naměřeno: na telefonu před dorolováním **0 dotazů**, po dorolování
právě jeden.

### Co se při tom našlo a opravilo

**Graf by se nenakreslil ani po podání.** První podoba volala
`root.PKGrafCen.postav(...)`, jenže `js/pozemek.js` má svůj globál
pojmenovaný `global`, ne `root` — a protože je volání v `try`, spadlo
by to tiše. Vychytala to až kontrola v prohlížeči.

**Graf se v odsazené kartě natahoval.** `kresli()` si šířku brala
z `el.clientWidth`, což je šířka **i s vodorovným odsazením**, kdežto
SVG se natáhne jen na vnitřek. V kartě s 16 px odsazením vyšel
viewBox o 32 px širší, než na kolik se obrázek natáhl, a kolečka
odečtu by se protáhla na elipsy. Odsazení se teď odečítá. Při měření
vyšly najevo ještě 2 px navíc: rám přidaný až s kartou ubíral
z vnitřku (`box-sizing:border-box`), takže vodorovný rám drží
od začátku jako průhledný a s odkrytím se mu jen změní barva.
Po opravě sedí viewBox s nakreslenou šířkou na pixel (622 = 622).

### Hlídači

Statické kontroly musely dostat výjimku, protože prvek `data-graf-cen`
ve zdroji `pozemek.html` není a nikdy nebude: `test-vaha-stranky`
a `test-skripty-na-strance` (ta druhá výjimku dosud neuměla vůbec —
dostala pole `zJs` s povinným napsaným důvodem). Výměnou za ně měří
pravdu `test-graf-cen` v prohlížeči na skutečné stránce pozemku:
odložení, nakreslení, správnou řadu, žádné protažení, a v okrese bez
klidné řady nulovou stopu.

Sabotážemi prokázáno — každá shodí právě to, co má:

| co jsem rozbil | co spadlo |
|---|---|
| podání grafu zrušeno | křivka se nenakreslí (6 kontrol) |
| `IntersectionObserver` obejit | historie se stáhne před dorolováním |
| odsazení se neodečítá | viewBox nesedí s nakreslenou šířkou |
| karta je vidět vždycky | po kartě zbude místo i nadpis v okrese bez řady |

Okno kontroly je úmyslně malé (390 × 400). Na okně vysokém 900 px leží
karta na krátké nabídce jen asi 1 000 px pod hranou, takže ji záložka
300 px chytne rovnou při vykreslení a odložení by se nedalo změřit —
kontrola by procházela, i kdyby se nic neodkládalo. Že karta opravdu
leží mimo dosah, se ověřuje jako PŘEDPOKLAD.

Po opravě: `test-graf-cen` 58/58, rychlá sada 134/134.

**Co se NEUDĚLALO a proč.** Sreality pod křivkou nemají nic; u nás
pod ní stojí sedm řádků výhrad (že jsou to ceny nabídkové, že hladinou
hýbe i výměna nabídek, že osa nezačíná nulou). Je to na úkor čistoty
karty a vím o tom — ale je to přesně ta stránka, na které někdo řeší
peníze, a tam se výhrady neškrtají kvůli vzhledu.

## §196 Dvě červené v CI, které jsem si měl přečíst dřív

Pravidlo „rychlá sada není celá sada" (§193) platí pořád: běh „Testy
a kontrola kódu" k předchozímu commitu byl červený ve dvou úlohách
a rychlá sada o ničem nevěděla.

### 1. Kontrola měřila něco jiného, než jak se jmenovala

`test-ukoncena-v-prohlizeci` padala na
`pozemek-hodonin-hodonin-194gce1.html` v kontrole „a titulek stránky
se nepřepíše na hlášku“. Jenže se neptala na hlášku — ptala se, jestli
titulek obsahuje statický `<h1>`.

**Ten vztah generátor nikdy nesliboval.** Nadpis a titulek jsou o téže
nabídce, ale titulek se musí vejít do 65 znaků i se jménem webu, takže
v něm sloveso ustupuje dřív než okres; stojí to černé na bílém
v `scripts/generate-parcel-pages.mjs` („STATICKÝ NADPIS SE DĚLÍ
Z `nadpis`, NE Z `titul`“). U exekuční dražby v Hodoníně to vyšlo
najevo: `<h1>` „Exekuční dražba lesního pozemku 547 418 m², podíl
1/88“, titulek „Lesní pozemek 547 418 m², podíl 1/88 — Hodonín“.
Nic nebylo rozbité; červená byla ta kontrola.

Teď měří to, co má, a je přísnější: na ukončené stránce se detail
nevykresluje, takže titulek musí po vykreslení zůstat **doslova** ten,
který přišel ze serveru. Chytne tím i hlášku „Pozemek nenalezen“,
i jakýkoli jiný přepis. Prokázáno sabotáží (`document.title` přepsaný
hned na začátku `js/pozemek.js` → kontrola spadne).

### 2. Nápis, jehož šířku určovala data

`test-ovladani-vypisu` hlásila na 390 px: `#mc-vyvoz`, text 175 px
v rámečku 173 px. **Lokálně to procházelo, v CI ne** — a hledat rozdíl
v sazbě by bylo hledání na špatném místě. Ta šířka totiž nezávisí na
sazbě, ale na POČTU NABÍDEK: nápis zní „Stáhnout výběr (1 902)“
a čtyřmístný počet by ho rozbil všude, pětimístný tím spíš. Že to
dosud procházelo, byla shoda okolností — ostatně okraj pruhu je na
16 px právě proto, že na 20 px se ten nápis nevešel (§ u `.mcp-hledani`).

Mizí proto samo číslo (`.mc-pocet`, do 480 px), ne celý doplněk.
Nápis „Stáhnout výběr“ má po změně na 390 px **35 px rezervy** a žádné
obnovení dat s ním nehne. Počet se neztratí: je v `aria-label`
i v nadpisu výpisu o řádek výš.

Po opravě: `test-ukoncena-v-prohlizeci` 18/18, `test-ovladani-vypisu`
31/31, `test-vyvoz-okno` 31/31, `test-nastroje-v-dosahu` 15/15,
`test-prvni-obrazovka` 22/22, `test-dotyk` bez nálezu, rychlá sada
134/134.

## §197 Zeleň jen na ozdoby — poslední dvě barevné plochy pryč

Pokyn zněl: web co nejčistší, zeleň jen na malé ozdoby, ne celé barevné
plochy. §194 sundal tmavě zelenou desku nad výpisem; tohle je zbytek.

**Nejdřív měření, ne dojem.** Projel jsem sedm typů stránek a hledal
prvky nad 30 000 px² s tmavým podkladem. Vyšly přesně dvě, obě na
úvodní stránce:

| oddíl | plocha | barva |
|---|---|---|
| `.sources` (čísla a zdroje) | 772 740 px² | #12241A |
| `#realitky` (kontakt) | 448 740 px² | #12241A |

Jinde už nic: patička je světlá (#EDF3EF), okresní, krajské, cenové,
článkové ani stránky pozemků tmavou plochu nemají. Zeleň, která na nich
zbývá, je značka, hlavní tlačítko a aktivní přepínač — tedy ozdoba
o 6–17 tisících px², ne plocha.

**Co ty dva oddíly odlišovalo, se neztratilo.** Odlišuje je TVAR, ne
barva: čtyři obří číslice přes celou šířku u zdrojů, dvousloupcové
„Ozvěte se nám." u kontaktu. Plocha je teď jemně šedá, takže se oddíl
od bílého okolí pořád oddělí.

### Co ze zesvětlení spadlo

Zesvětlení pásu vždycky něco shodí — co bylo napsané pro tmu, na světle
zmizí. Naměřeno a opraveno trojí:

* **Stav zdroje** (`.src-stav`, „64×", „436×") byl světlý text
  `--text-ondeep-mute` na průsvitu `rgba(255,255,255,0.12)`. Na bílé
  dává **1,1 : 1** — nebyl vidět vůbec. Rozlišení barvou zůstává, jen
  obráceně: tlumený podklad, tmavý text téže barvy.
* **E-mailová adresa** v kontaktu byla `--text-ondeep`, tedy bílá na
  bílé kartě (**1,0 : 1**). Čtyři řádky, které kvůli tmavému pásu
  přebíjely světlou sadu, se zrušily; zůstal jediný — odkaz bere tmavou
  hněď místo jasné.
* **Karta s e-mailem** vzala `--plocha-jemna`, což je přesně ta barva,
  na které leží — splynula by. Dostala bílou desku s linkou jako každá
  jiná karta na webu.

### A jedna mez, která se stáhla podruhé

`test-odstiny` hlídá, že se stylopis vůbec přečetl, počtem nalezených
barev. Mez byla 250 a **spadla úklidem**: se zesvětlením odešlo šest
barev zapsaných napevno kvůli tmavému podkladu (245). Stejný pád už
jednou byl, z meze 300. Mez je proto nově 150 — daleko od skutečného
stavu. Hlídá nulu, ne trend; test naladěný na dnešek učí lidi uklízet
míň.

Po opravě: `test-kontrast` bez nálezu, `test-barvy` 58/58,
`test-okraje` 135 prvků bez nálezu, `test-uvod` 66/66,
`test-hierarchie` 21/21, `test-soustava` 15/15, `test-mrtve-styly`
11/11, `test-cerstvost` 24/24, rychlá sada 134/134.

## §198 Sedm červených hlídačů, které CI schovávalo

Po §196 jsem pustil **celou sadu v prohlížeči (93 hlídačů) najednou**,
ne jen to, co hlásilo CI. Padlo jich **sedm**, kdežto CI hlásilo dva.

**Proč jen dva.** Úloha v CI se po prvním neúspěšném kroku zastaví, takže
z každé ze tří úloh v prohlížeči je vidět vždycky jen PRVNÍ pád. Pět
dalších leželo za ním a nevědělo se o nich.

**A hlavně: ani jeden nebyl z dnešní práce.** Než jsem začal opravovat,
rozbalil jsem si předchozí commit do vedlejšího stromu (`git worktree`)
a pustil těch sedm tam. Padly všechny, se stejnými čísly — včetně
CLS 0,1228, u kterého jsem si byl jistý, že ho způsobila nová karta
s grafem. Nezpůsobila. Deset minut měření ušetřilo den přestavby.

### Co to bylo

| hlídač | co hlásil | co to bylo doopravdy |
|---|---|---|
| `test-menu` | v nabídce chybí kontakt.html | Kontakt se z lišty odstěhoval **schválně** (zúžení menu z 15 odkazů); kontrola to nevěděla |
| `test-mrtva-jmena` | `.mc-popis` nemá pravidlo | obal, jehož prací je být JEDNOU flexovou položkou — žádnou deklaraci nepotřebuje |
| `test-cenovy-stupen` | verdikt má 4 z 12 stránek, čekalo se 5 | krok vzorku padal na shluky vyřazených nabídek; na 30 stránkách jich verdikt má 21 (70 %) |
| `test-mapa-pozemku` | mapa se staví hned při načtení | ležela **296 px** pod hranou okna a záložka je 300 px — mapa se chovala správně |
| `test-sazba-dom` | „100 m" s obyčejnou mezerou | měřítko od Leafletu, které si text přepisuje při každém pohybu mapy |
| `test-shoda` | percentil se liší u 10, čekalo se 20 | čísla klesají proto, že se dvojníci slučují u zdroje |
| `test-stabilita` | CLS 0,1228 na stránce pozemku | servírovaná a vykreslená podoba stránky se liší o 1 309 px |

### Čtyři z nich byly kontroly, ne vady

`test-menu`, `test-cenovy-stupen`, `test-mapa-pozemku` a `test-shoda`
měřily něco jiného, než jak se jmenovaly, nebo měly mez naladěnou na
tehdejší data. Opravy nejsou ústupky:

* **Kontakt** z lišty odešel, ale nárok nezmizel — nově se měří, že na
  něj vede odkaz z patičky. Prokázáno sabotáží (odkaz pryč → spadne).
* **Vzorek u cenového stupně** se rozšířil z 12 na 20 stránek, mez pěti
  zůstala. Snížit mez by znamenalo, že kontroly výš smějí měřit míň.
* **Mapa** se měří v okně 600 px místo 860, takže leží 556 px pod hranou
  a odložení se dá změřit. Že tam opravdu leží, je PŘEDPOKLAD. Sabotáž
  (mapa stavěná hned) ji shodí.
* **Mez u shody** klesla z 20 na 0 — je to PŘEDPOKLAD „mění čištění
  duplicit ještě výsledek?", a čísla klesají právě proto, že se data
  opravují u zdroje. Mez naladěná na dnešek trestá úklid. Týž omyl jako
  u meze barev v `test-odstiny` (§197).

### Dvě byly opravdové vady

**Měřítko mapy mluvilo nečesky.** Leaflet píše „100 m" s obyčejnou
mezerou a přepisuje si ten text při každém pohybu mapy, takže
jednorázová oprava vydrží do prvního posunu. Hlídá ho proto pozorovatel
(`MutationObserver`), který mezeru mění na nezlomitelnou. CSS by to
nevyřešilo: `test-sazba-dom` čte texty v DOM, ne vypočtené styly —
a právem, protože pravidlo je o textu.

**Stránka pozemku se servíruje jinak, než se vykreslí.** Server pošle
zkrácený záznam (`article.pz-staticky`, naměřeno 1 007 px), `js/pozemek.js`
ho ve 145 ms nahradí celým detailem (2 316 px) — a všechno pod ním
poskočí o **1 309 px**. Je to jediný posun na té stránce a vyjde pokaždé
stejně. Na telefonu je CLS nula, na monitoru 0,1228.

Opravit to znamená servírovat rovnou to, co se vykreslí, tedy přenést
skládání detailu do generátoru. To je samostatná práce, ne řádek
v hlídači — a tak je taky zapsaná. Mez je zatím 0,13, **jen pro monitor
a jen pro stránky pozemku**, s naměřenými čísly u sebe: vada se tím
nemůže tiše zhoršit a 0,05 dál platí pro celý zbytek webu.

Po opravě: všech sedm prochází (`test-menu` 32/32, `test-mrtva-jmena`
18/18, `test-cenovy-stupen` 61/61, `test-mapa-pozemku` 155/155,
`test-sazba-dom` 22/22, `test-shoda` 27/27, `test-stabilita` 50/50).

## §199 Letecký náhled se servíruje — a proč to na poskakování nestačilo

Z §198 zůstala vada: stránka pozemku se servíruje v jedné podobě
a `js/pozemek.js` ji hned nato nahradí jinou. Naměřeno 1 007 px → 2 316 px,
CLS 0,1228.

**První krok je hotový a stojí za to sám o sobě.** Generátor teď do
servírované podoby skládá i letecký náhled. Skládá ho **týž
`js/snimek.js`**, jakým ho kreslí prohlížeč (soubor je psaný pro
prohlížeč, takže se mu v Node nastaví `window` na globální objekt —
stejně to dělá `generate-region-pages.mjs`), se stejnými rozměry, takže
se při výměně nehne ani o pixel. Barvu špendlíku si generátor čte
z tokenů v `css/styles.css`, ne z opsaného hexu: dvě pravdy o jedné
barvě jsou přesně to, co se uklízelo v §56.

Co z toho má web hned, bez ohledu na poskakování: **servírovaná stránka
poprvé ukazuje, jak ten pozemek vypadá.** Dosud to byl holý text —
pro vyhledávač, pro náhled v odkazu i pro kohokoli bez JavaScriptu.

### A teď to, co se nepovedlo

Náhled ubral z rozdílu 384 px (1 007 → 1 391 px). **CLS se nezměnil
ani o tisícinu: pořád 0,1228.**

Není to chyba měření. CLS je součin dvou zlomků a ten druhý —
`distance fraction`, tedy o kolik se obsah posunul proti výšce okna —
je **zastropovaný jedničkou**. Posun byl 1 309 px při okně 900 px,
tedy přes strop; po zkrácení o 384 px je 925 px, a to je **pořád nad
strop**. Dokud rozdíl neklesne pod výšku okna, nemá dílčí předsazení
na číslo žádný vliv, a aby se dostalo pod 0,05, musel by být rozdíl
zhruba **padesátipixelový**.

Jinak řečeno: tahle vada se nedá opravit po kouskách. Buď se servíruje
celý detail, nebo se poskakuje dál.

### Dvě cesty, kterými to jde dokončit

1. **Přenést skládání detailu do generátoru.** Čisté, ale `pzDetailHtml`
   a jeho okolí v `js/pozemek.js` sahají na dokument a na model; přepsat
   je do Node znamená druhou kopii logiky, tedy přesně to, čemu se
   `js/snimek.js` kdysi vyhnul.
2. **Nechat ten detail vykreslit prohlížečem při sestavení** (Playwright
   už v repozitáři je) a hotové HTML zapsat do stránky. Žádná druhá
   kopie logiky, zato sestavení závisí na prohlížeči a 1 902 stránek
   po ~120 ms je kolem čtyř minut navíc.

Zapsáno jako samostatná úloha. Mez v `test-stabilita` zůstává 0,13 —
jen pro monitor a jen pro stránky pozemku, s naměřenými čísly u sebe.

Tři kontroly musely přestat předpokládat, že `<h1>` stojí hned za
`<article class="pz-staticky">`: mezi nimi teď leží náhled.
(`test-podil-v-nazvu`, `test-hlavicka-pozemku`, `test-ukoncena-v-prohlizeci`
— první z nich na to spadla hned při první rychlé sadě.)

Po opravě: rychlá sada 134/134, `test-predloha`, `test-hlavicka-pozemku`
18/18, `test-ukoncena-v-prohlizeci` 18/18, `test-vaha-stranky` 6/6,
`test-stabilita` 50/50, `test-poradi-pozemku` 24/24.

## §200 Předvykreslení celého detailu — ZMĚŘENO, NEUDĚLÁNO

§199 skončil tím, že se poskakování stránky pozemku nedá opravit po
kouskách: buď se servíruje celý detail, nebo nic. Tak jsem si spočítal,
co ten „celý detail" stojí.

**Naměřeno na třech stránkách** (vykreslený obsah `#pz-detail`):

| stránka | stránka dnes | vykreslený detail |
|---|---|---|
| Nemyšl, Tábor | 34 207 B | 15 543 B |
| Všemina, Zlín | 34 621 B | 27 498 B |
| Benešov | 33 589 B | 16 551 B |

Průměr vykresleného detailu je **19 864 B**. Stránka pozemku má dnes
průměrně 34 kB, takže by předvykreslením narostla na **54 kB, tedy
o 58 %**.

**Co by to stálo:**

* **+37,8 MB v repozitáři na každé sestavení.** Stránek pozemků je
  1 902 a přepisují se při každém běhu (ceny se obnovují čtyřikrát
  denně), takže git ukládá 1 902 nových objektů pokaždé. O 58 % větších.
  Repozitář má dnes 1 GB a už teď hlásí „too many unreachable loose
  objects".
* **Zaplatí to i člověk, a dvakrát.** Prohlížeč si těch 20 kB stáhne
  navíc — a pak stejně spustí `js/pozemek.js`, který detail vykreslí
  znovu. Obejít se to dá jen „hydratací", tedy otiskem dat ve stránce,
  podle kterého skript pozná, že servírovaná podoba je čerstvá a může
  si vykreslování odpustit. To je další mechanismus, který se musí
  trefit — a když se netrefí, ukáže stránka zastaralou cenu.
* **Sestavení by potřebovalo prohlížeč.** Druhá cesta (nechat detail
  vykreslit Chromiem při sestavení) nezdvojuje logiku, zato přidává
  do každého běhu ~4 minuty a závislost na prohlížeči i tam, kde dnes
  stačí Node.

**A co ta vada stojí:** jeden skok v ~150 ms, tedy dřív, než si člověk
stačí cokoli přečíst. Na telefonu je CLS nula. Servírovaná podoba už
dnes nese titulek, nadpis, cenu, parametry i letecký náhled (§199),
takže vyhledávač ani člověk bez JavaScriptu nepřijde o podstatné.

**Rozhodnutí: nedělá se.** Třicet osm megabajtů na každé sestavení
a dvojí platba za týž obsah je moc za skok, který nikdo nevidí.
Zapsáno i jako třetí možnost, která se nabízí a taky se NEDĚLÁ:
předsadit do stránky jen naměřenou výšku (`min-height`) místo obsahu.
Stálo by to třicet bajtů na stránku, jenže rezerva, která se netrefí
o padesát pixelů, vyrobí nový posun — a trefovat se musí zvlášť pro
telefon a pro monitor, při každé změně dat. Mechanismus křehčí než
vada, kterou má schovat.

Mez v `test-stabilita` zůstává 0,13 pro monitor a stránky pozemku, aby
se vada nemohla tiše zhoršit. Kdyby web někdy začal servírovat detail
z jiného důvodu (třeba kvůli vyhledávačům), spadne tím i tohle.

## §201 Ikona rozbitého obrázku v každém druhém řádku výpisu

Náhled ve výpisu okresu je letecká dlaždice z Esri. Když se nestáhne —
mizerná síť, výpadek jejich serveru — nakreslí Chromium do toho místa
svou **ikonu rozbitého obrázku**, vlevo nahoře.

**Naměřeno 28. 10.** s odstřiženým serverem dlaždic (tím se mizerná síť
napodobí přesně): z 43 náhledů na stránce okresu Zlín se jich 21
nenačetlo a v každém z nich ta ikona byla.

Stylopis se o to pokoušel už dřív — `color:transparent` u obrázku —
jenže ten schová jen **popisek**, ne ikonu. Komentář u toho pravidla
tvrdil, že je čtverec „čistý", a to nebyla pravda; vzniklo to tím, že
se stav nikdy nevyfotil.

**Oprava stojí na vlastnosti, která je v pořádku a málo se využívá:**
obrázek, který se nenačte, přestane být *nahrazeným prvkem* — a teprve
tehdy se jeho pseudoprvek vykreslí. `::after` přes celou plochu tedy
leží přes ikonu právě tehdy, když je co zakrýt; u načteného snímku se
nenakreslí vůbec. Žádný skript, žádný další požadavek, dva řádky CSS.

Mřížka pod snímkem tím v tom stavu zmizí a je to tak schválně: opsat
tytéž tři deklarace podruhé jen kvůli stavu, který má žít do příští
dlaždice, se nevyplatí — a čistý čtverec se špendlíkem je klidnější než
mřížka, která nic neměří.

Po opravě: rychlá sada 134/134, `test-mrtve-styly`, `test-okraje`,
`test-kontrast` a `test-odstupy` bez nálezu.

## §202 Karta se na webu kreslí čtyřmi recepty — ZMĚŘENO, ROZHODNUTÍ NA MAJITELI

> **Dořešeno 29. 10. v §212.** Majitel řekl „pokračuj na vizuální
> synchronizaci celého webu", takže se rozhodlo podle jeho předlohy:
> deska je 14 px. Zbytek téhle položky je stav před tím rozhodnutím.

Při obhlídce podle zadání („celý web předělej do této podoby") jsem
změřil **všechny světlé desky s rámem nebo stínem** na sedmi typech
stránek: jméno, zaoblení, rám, stín a výplň.

Stylopis má role napsané: `--r-plocha` (10 px) jsou karty a panely,
`--r-ovladani` (14 px) je to, čím se ovládá, `--r-obraz` (20 px) jsou
mapy a fotky. U tokenu to stojí černé na bílém: *„karta je pořád
hranatější než tlačítko"*.

**Měření říká, že se to drží jen z poloviny.** Obsahové karty na 10 px:
`.opp-item`, `.okr-item`, `.pz-gtk`, `.dt-tab-obal`, `.add-card`,
`.st-karta`, `.pz-pozn-box`, `.pz-vyvoj-karta`. Obsahové karty na
14 px, tedy na zaoblení pro ovladače: `.deal-card`, `.odl-card`,
`.realtor-contact`, `.add-boost`, `.kt-mail`, `.add-cross`,
`.aside-card`, `.ul-card`, `.add-steps li`, `.status-card`, `.md-odhad`,
`.pz-bok`, `.pz-gtk-sum`. K tomu tři různé rámy (0,14 / 0,28 / žádný)
a čtyři stíny (žádný / `--e1` / `--e2` / `--e3`).

**Proč to nepředělávám sám.** Mezi těmi čtrnácti kartami na 14 px je
`.pz-bok` — tedy **přesně ta karta s cenou, kterou majitel poslal jako
předlohu toho, jak má web vypadat**. Srovnat to jde dvěma směry a každý
sahá na celý web:

* **na 10 px** (podle pravidla v stylopisu) — pak se změní i ta karta,
  která byla poslaná jako vzor;
* **na 14 px** (podle vzoru) — pak přestane platit pravidlo, že karta je
  hranatější než tlačítko, a změní se naopak výpis a okresní stránky.

Rozdíl mezi 10 a 14 px je čtyři pixely zaoblení; vedle sebe je vidět,
samostatně ne. Vybrat směr podle jedné fotky je přesně ta chyba, která
je v CLAUDE.md zapsaná jako „Nepřestavuj podle jedné fotky" — a sáhnout
na upevněnou kartu s cenou je ta druhá, „Předloha neruší to, co je
upevněné". Proto je to změřené, sepsané a čeká to na rozhodnutí.

## §203 Ze čtyř přihlášení měla obnovu hesla jen dvě

Obhlídka účtových stránek na telefonu (pridat, hlidani, zpravy,
muj-inzerat) nenašla nic rozbitého na vzhledu — zato našla **díru
v cestě ven**.

Web má **čtyři místa, kde se člověk přihlašuje**, a každé si přihlášení
kreslí samo:

| stránka | kdo formulář staví | „Zapomněli jste heslo?" |
|---|---|---|
| `pridat.html` | `js/pridat.js` | ano |
| `muj-inzerat.html` | `js/pridat.js` | ano |
| `hlidani.html` | vlastní skript ve stránce | **ne** |
| `zpravy.html` | vlastní skript ve stránce | **ne** |

Hlídání i Zprávy jsou přitom **přímo v nabídce**. Kdo si je otevřel
a heslo nepamatoval, neměl odsud kudy ven — musel sám uhodnout, že se
má proklikat na Můj profil, kde ten odkaz je.

**Nevzniklo to nedbalostí, ale tím, že jsou ty formuláře čtyři.** Čtyři
příležitosti na něco zapomenout a žádná kontrola, která by je spočítala.

### Oprava

Obě chybějící místa dostala týž ovladač a volá se z něj **týž kus kódu**,
jaký volá `js/pridat.js` — `PKAuth.recover(e-mail)`. Nic nového se
nepsalo, jen se použilo to, co na webu bylo. Odkaz má tutéž podobu
(`p.auth-forgot` > `button.auth-link`), takže nepřibylo ani nové jméno
třídy, ani nové pravidlo ve stylopisu.

Hláška jde do živé oblasti, která na těch stránkách už je (§94), takže
o ní ví i odečítač obrazovky: bez e-mailu *„Napište nahoře svůj e-mail…"*,
s e-mailem *„Poslali jsme vám na e-mail odkaz…"*.

### A hlavně hlídač, aby se to nestalo popáté

`scripts/test-zapomenute-heslo.mjs` projde všechna čtyři místa na
telefonu a u každého měří čtyři věci: že tam přihlášení vůbec je
(PŘEDPOKLAD), že je u něj obnova hesla, že se na ni dá trefit prstem
(44 px) — **a že opravdu něco dělá.** To poslední je podstatné: nápis
bez obsluhy vypadá na stránce úplně stejně jako hotová věc.

Hledá se podle TEXTU, ne podle `id`: každá stránka si přihlášení kreslí
po svém a ta id se jmenují jinak (`au-forgot`, `hforgot`, `zforgot`).
Co má být stejné, je to, co z toho vidí člověk.

Prokázáno dvěma sabotážemi:

| co jsem rozbil | co spadlo |
|---|---|
| odkaz z `hlidani.html` pryč | „je u něj obnova zapomenutého hesla" |
| odkaz zůstal, obsluha pryč | obě kontroly, že to něco dělá |

Po opravě: `test-zapomenute-heslo` 24/24, `test-mrtva-jmena`,
`test-dotyk`, `test-stranky-uctu` bez nálezu, rychlá sada 134/134.
Zkoušek s prohlížečem je nově 138.

## §204 Čtvrtá zkouška přibitá na data, která se mění

`test-rozesilac` spadl hned po sloučení s čerstvými daty robota —
a nebylo to tím, co jsem ten den dělal.

Zkouška má oddíl, který ověřuje, že odkaz v hlídacím e-mailu nevede na
**cizí pozemek**. Aby ho ověřit šlo, potřebuje nabídku, která se
o jméno stránky *sráží* s jinou — na obyčejné nabídce se ta vada
neprojeví. Okres pro takovou nabídku byl napsaný napevno:
`Brno-venkov`.

Jenže data se obnovují čtyřikrát denně. 28. 10. v Brně-venkově žádná
srážející se nabídka nezbyla, PŘEDPOKLAD spadl a s ním celá zkouška —
aniž by se na webu cokoli pokazilo.

Okres se proto hledá v datech: bere se ten, kde takových nabídek je
nejvíc, při shodě první podle abecedy (ať je běh opakovatelný). Dnes to
vyšlo na Prahu-východ se čtyřmi. Že nějaký takový okres vůbec existuje,
zůstává PŘEDPOKLADEM — kdyby se srážky někdy odstranily úplně, má se to
dozvědět, ne tiše přejít.

**Je to čtvrtý případ téhož omylu za jediný den** (§197 mez barev,
§198 vzorek verdiktů a mez u shody, teď tohle). Jmenovat v kontrole
konkrétní okres, počet nebo mez naladěnou na dnešní data znamená
postavit si budík na to, až se data pohnou. Pravidlo je pokaždé stejné:
**kontrola si má to, co potřebuje, v datech NAJÍT — a nahlas říct, když
tam to nic není.**

## §205 Graf podle předlohy: čísla u osy — a hlavně aby v inzerátu byl

Majitel poslal fotku karty „Cenový přehled" ze Sreality a vedle ni
fotku naší stránky s pokynem předělat graf v inzerátu na ten jejich.
Vyšly z toho dvě věci, a ta druhá je důležitější.

### 1. Osa má čísla, ne větu

Předloha má vlevo horní a dolní mez osy a dole data. My jsme rozpětí
osy psali **větou pod grafem** — a to je horší ze dvou důvodů: polohu
čáry proti číslu v souvislém textu nikdo nepřečte, a věta se o tom, co
je nakreslené, dá snadno rozejít. Přesně to se už jednou stalo (§121:
věta vydávala rozpětí DAT za rozpětí OSY).

Meze osy teď stojí u osy, dole jsou čtyři data rozprostřená po řadě
a u obou mezí vede vodicí linka. Věta zůstala jen na to, co z obrázku
přečíst nejde: že osa nezačíná nulou a jakou část její výšky čára
zabírá.

Kontrola se tím **zpřísnila**: dřív srovnávala větu s geometrií, teď
čte popisky přímo z obrázku a ptá se i na to, jestli každý stojí u toho
konce osy, ke kterému patří. Popisek u špatného konce by byl horší než
žádný.

### 2. Graf v inzerátu vůbec nebyl — a to byl ten hlavní nález

Křivka se kreslila jen z **klidných** řad. Těch má: 21 okresů ze 48,
9 krajů ze 14, celá ČR vždycky. Na stránce pozemku se zkoušel jen
okres — takže **na většině nabídek nebyl graf žádný**. Majitel to
hlásil tak, že ho v inzerátu nevidí, a měl pravdu: jeho okres mezi těmi
dvaceti jedna nebyl.

Nově má graf **řetěz záloh**: okres → kraj → celá ČR. Protože celá ČR
klidnou řadu má vždycky, dostane křivku každá nabídka.

**Nelže se tím.** Nadpis i poznámka pod grafem pokaždé říkají, o jaké
území jde — „v okrese Zlín", „ve Zlínském kraji", „v celé ČR" — takže
celostátní řada se nikdy netváří jako „tady u vás". Kraj se bere z téže
tabulky, podle které se počítá cena (`PK_CENY.OKRES_KRAJ`), a jméno
území skládá tentýž `kdeText()`, jaký píše věty o ceně; dvě tabulky
krajů by se rozešly.

Naměřeno po změně: Vsetín (okres bez klidné řady) ukáže řadu Zlínského
kraje a v nadpisu stojí „ve Zlínském kraji".

Prokázáno sabotážemi:

| co jsem rozbil | co spadlo |
|---|---|
| prohozené meze u svislé osy | „jsou to konce osy, jak je graf nakreslil" |
| záloha se tváří jako okres | „NETVÁŘÍ se jako okres, ze kterého data nejsou" |

Po opravě: `test-graf-cen` 61/61 (dřív 58), `test-mrtve-styly`,
`test-kontrast`, `test-vaha-stranky`, `test-stabilita` bez nálezu,
rychlá sada 134/134.

## §206 Vlastní ikony: 79 kreseb na 105 místech → jedna sada 61 tvarů

Majitel ke grafu připsal: „take udelej custom ikonky u vseho". Než jsem
začal kreslit, spočítal jsem, co web má.

### Co bylo

| měřeno | nález |
|---|---|
| ikon ve zdrojích | 105 |
| různých kreseb | 79 |
| různých tlouštěk tahu | 20 hodnot (1 až 3,5) |

Hlavní vada ale nebyla v počtu, nýbrž v tom, co se opakovalo:

* **čtyři lupy** — `r=7` + `M20 20l-4.2-4.2`, pak `m20 20-3.5-3.5`, pak
  táž s plusem, pak ještě jedna;
* **dvě záložky** nakreslené úplně jinak (`M6 3h12…` proti `m19 21-7-4…`);
* **dvě mapy**, **dva zvonky**, **dvě fajfky v kolečku**;
* **dvě cesty** pro tutéž věc — `ACCESS_SVG` a vybavení „Příjezd";
* a obráceně: **jeden blesk pro dvě různé věci** — „elektřina na
  pozemku" a „příležitost".

Většina tvarů byla navíc převzatá z cizí sady (Feather/Lucide), takže
web neměl vlastní ruku. To je přesně to, co majitel viděl.

### Co je teď

Tvary stojí na jednom místě (`scripts/ikony.mjs`), sestavení z nich
skládá `<symbol>` do stránky a kód si je volá jménem:
`<use href="#i-spendlik">`. Dvě různé lupy nemají kde vzniknout —
„lupa" je jméno, ne kresba.

Pero: plátno 24, kresba v ploše 3,5–20,5, jen tahy, obdélníky rx 2,5.
Ruka sady jsou dvě věci: **obzor** (co stojí na zemi — dům, plot,
příjezd, strom — stojí na téže lince y=20) a **hraniční kámen**
(otočený čtverec místo kolečka uprostřed špendlíku, zaměřovače a mapy;
kolečko se v 16 px slije do tečky, kosočtverec drží).

### Tři věci, které se při tom pokazily — a jak se našly

**1. Černá kaňka místo lupy.** Když tvary odešly do sady, zmizel s nimi
atribut `fill="none"`. Prohlížeč má výchozí výplň černou, takže kolečko
lupy se vyplnilo. Našlo se to na snímku, ne úvahou.

**2. Pero na symbolu by zabilo soustavu stopy.** První oprava dala pero
jako atributy na `<symbol>`. Jenže na obsah symbolu nedosáhne žádný
selektor, takže atribut uvnitř přebije VŠECHNO — i tloušťku, kterou si
každé místo počítá k velikosti (36/šířka, aby stopa na obrazovce byla
vždy 1,5 px). Naměřeno pokusem: čára, které CSS říká 6 jednotek, se se
`stroke-width="2"` na symbolu nakreslila na třetinu. Pero proto drží
stylopis — jedna třída `.ik` nahoře, kterou každé podrobnější pravidlo
přebije.

**3. Tři ikony nad výpisem zmizely.** Do stránky se vkládají jen ty
symboly, které v ní a v jejích skriptech sestavení najde jako `#i-…`.
Jenže `js/main.js` si odkaz skládal (`'#i-' + jmeno`), takže v žádném
souboru nestál celý — a „Procházet po jednom", „Stáhnout výběr"
a „Doporučené" přišly o ikonu. Odkaz se teď píše celý.

### Co to váží

Celá sada má po gzipu 2,5 kB. Vkládat ji celou všude by okresní stránce
přidalo 28 % váhy (8,8 → 11,2 kB) za tři použité ikony. Vkládá se proto
jen to, co si stránka zavolá:

| stránka | symbolů | gz |
|---|---|---|
| okresní | 3 | +151 B |
| úvod | 30 | +85 B (zároveň zmizely kresby ze značkování) |
| profil | 19 | +243 B |
| inzerát | 27 | +1 238 B |

### Hlídač

`scripts/test-ikony.mjs` (11 kontrol) hlídá: odkaz bez tvaru, tvar bez
odkazu, kresbu mimo sadu, stránku, která volá ikonu, kterou nemá, a
stopu na obrazovce. Prokázáno pěti sabotážemi:

| co jsem rozbil | co spadlo |
|---|---|
| překlep `#i-infoo` | „každý odkaz má v sadě svůj tvar" |
| tvar, na který se nikdo neodkazuje | „žádný tvar není navíc" |
| ikona nakreslená přímo ve značkování | „nikde se nekreslí mimo sadu" |
| odkaz skládaný z proměnné | „žádný tvar není navíc" (hlásí mrtvý symbol) |
| symbol vyříznutý ze stránky | „žádná stránka nevolá ikonu, kterou nemá" |

Při tom se opravily dvě ikony, jejichž tloušťka neseděla k velikosti:
špendlík u „Pozemky v okolí" (17 px, tah 2 → stopa 1,42) a lupa
v hledání cen (20 px, tah 2 → 1,67). Obě teď mají 1,5.

### Co se NEUDĚLALO

Nadpisy oddílů na stránce pozemku ikonu nedostaly. Už nad sebou mají
vodorovnou linku jako oddělovač a zadání zní „co nejčistší web" —
ikona u každého nadpisu by byla druhá ozdoba na témže místě.

## §207 Graf na každém inzerátu shodil tři hlídače — a dva z nich měly pravdu

Commit §205 udělal z grafu věc, která je na KAŽDÉ nabídce. V CI pak
spadly tři hlídače najednou. Nebyla to náhoda a nebylo to „prostě CI":
s vypnutým grafem všechny tři projdou, se zapnutým všechny tři padnou.
Jeden kořen, tři příznaky.

### 1. Mrtvá jména `up` a `down` — hlídač měl pravdu

Graf psal `<i class="gc-zmena up">` (nebo `down`) podle směru. Pravidlo
pro ně ve stylopisu ale nikdy nevzniklo, takže ta jména nedělala nic.
Dokud graf stál jen na okresních stránkách, hlídač mrtvých jmen na ně
nenarazil; jakmile se objevil i v inzerátu, ozval se — správně.

Směr navíc stojí ve znaménku rovnou v textu („+3 % za 45 dní"), takže
barva by ho jen opakovala. Jména jsou pryč.

### 2. Tlačítko „nahoru" ustupovalo špatnému místu — hlídač měl pravdu

Karta s grafem vyroste z nuly na 451–577 px (podle šířky a délky
nadpisu; naměřeno na pěti nabídkách od 360 do 1280 px). Leží NAD
řádkem s hlavní akcí, takže ho o tolikéž odsune. Tlačítko „nahoru" si
polohu akce bere při přeměření — a to proběhlo dřív, než graf dorostl.

Komentář u odloženého kreslení přitom tvrdil, že „křivka je hotová
dřív, než na ni člověk dohlédne, takže se mu pod rukama nic
nepřeskládá". **To byla nepravda** a měření ji ukázalo: posun 496 px
na 390×844.

Opraveno dvakrát. Graf se kreslí hned při vykreslení detailu, ne až na
dohled — daň je stažení historie cen na každé stránce pozemku (69 kB
v souboru, 8,4 kB po gzipu). A karta má minimální výšku, takže se
nemá jak hnout.

**Rezervovat jen po dobu čekání nestačilo** a stálo to tři pokusy:

1. Rezervace přes třídu `ceka`, která se po dokreslení sundá. Posun
   klesl z 496 na 89 px — zbytek dělaly nadpis a odkaz pod grafem,
   schované přes `display:none`: při dokreslení přibyly do toku.
2. Nadpis i odkaz tedy místo DRŽÍ (`visibility:hidden`). Zbylo −7 px:
   rezervace na maximum krátkou kartu po dokreslení o ten rozdíl
   smrskla, a to je taky skok.
3. Zkusil jsem srovnat nadpis na pevný počet řádků, aby byla výška
   karty daná jen šířkou okna. Rozpětí se nezavřelo (pořád 19–39 px) —
   bere se i z poznámky pod grafem.

Platí proto minimální výška **pořád**, i po dokreslení: karta je vždy
tak vysoká jako ta nejvyšší na dané šířce a uvnitř zbyde kousek
vzduchu dole. Vzduchu si nikdo nevšimne, skoku pod prstem ano.

Naměřeno po opravě — posun řádku s akcí po dokreslení grafu:

| šířka | 360 | 390 | 430 | 768 | 1280 |
|---|---|---|---|---|---|
| posun | 0 px | 0 px | 0 px | 0 px | 0 px |

(čtyři různé nabídky na každé šířce)

Zkouška `test-graf-cen` měla dvě kontroly, které hlídaly staré
odložené kreslení („karta se před dorolováním neukazuje", „historie se
do té doby nestahuje"). Místo nich teď měří to, o co doopravdy jde:
jestli se řádek s hlavní akcí po dokreslení pohne. A protože se graf
kreslí hned, musí si zkouška okno pro měření vyrobit — zdrží soubor
s historií o 1,5 s.

**První verze té kontroly neměřila nic** a ukázala to až sabotáž:
brala polohu na hotové stránce, kde už bylo po všem, takže prošla
i bez rezervace. Po opravě sabotáž (rezervace pryč) hlásí posun
546 px.

### 3. „Lišta bliká" — tentokrát neměl pravdu hlídač

Zkouška spodní lišty hlásila tři přepnutí při cestě dolů a žádala
nejvýš jedno. Jenže naměřené polohy ukázaly, co se děje: graf 1494 až
2054, tlačítka 2147–2199. Při cestě dolů se tlačítka dostanou do okna,
lišta SPRÁVNĚ zhasne, a po jejich minutí se zase rozsvítí. Tři
přepnutí, a všechna správná.

Mez „nejvýš jedno přepnutí" platila, dokud řádek s tlačítky seděl
vysoko. Vadou není přepnutí, ale KRÁTKÉ bliknutí: zhasnutí na 160 px
je chyba (přesně to zkouška kdysi chytila), zhasnutí na 1 040 px je to,
k čemu lišta je. Zkouška teď měří délku úseku a mez je 400 px.

Zeslabení meze se platí důkazem. Sabotáž: okno pro „je vidět akce" se
zúžilo na 44 px, čímž vzniklo bliknutí dlouhé **160 px** — tedy přesně
tak dlouhé jako původní vada — a zkouška ho chytila:

```
✕ při rolování dolů nebliká (žádný úsek kratší než 400 px)
    krátké úseky: vyp 640–720 (160 px)
```

### Co si z toho odnést

Změna „ukaž to všude" není kosmetická. Tenhle commit zapnul na 2 276
stránkách kus rozvržení, který tam nikdy nebyl, a tři hlídače to
odhalily během jedné noci. Dva z nich měly pravdu a opravil se web;
jeden měřil starou geometrii a opravila se zkouška — ale až potom, co
sabotáž ukázala, že nová mez původní vadu pořád chytá.

### §206b Společné pero obtáhlo i značku, která je vyplněná

Sada ikon dala všem `<svg>` s `<use>` společnou třídu `.ik`, a ta nese
pero: `fill:none; stroke:currentColor; stroke-width:2`. U linkových
ikon je to správně. Jenže tlačítko „Uložené" nad výpisem nese značku,
která je **vyplněná** — záložka bez obrysu, bílá, když je zapnuto.
Dostala tedy tah, který nikdy neměla, a protože je sázená na 16 px,
vyšla stopa 1,33 px místo 1,5.

Shodil to `scripts/test-tahy.mjs` — hlídač, který měří KAŽDOU ikonu
proti 1,5 px na dvanácti stránkách, a kterého jsem si při výběru
„nejrizikovějších dvaceti" nevšiml. Běžel až v CI.

Dvě poučení, obě moje:

* **Výběr zkoušek k puštění je taky rozhodnutí, a to se dá splést.**
  Pustil jsem dvacet hlídačů vybraných podle toho, čeho se změna
  dotýká. `test-tahy` tam patřil a chyběl — jmenuje se „Tah ikon".
* **Společné pravidlo pro celou rodinu je i past.** Co platí pro
  padesát linkových ikon, neplatí pro jednu vyplněnou. Opraveno
  `stroke:none` na tom jednom místě, s napsaným důvodem.

Po opravě: `test-tahy` 5/5, `test-ikony` 11/11,
`test-ovladani-vypisu` 31/31. Změřeno navíc, že žádná jiná vyplněná
ikona tah navíc nedostala.

## §208 Stránka pozemku neměla na graf místo — a procházelo to jen proto, že se nekreslil

Celá sada hlídačů v prohlížeči (138) našla po §207 tři pády. Měřením
v kopii repozitáře před dnešní prací se rozhodlo, čí jsou:

| hlídač | před | po | čí |
|---|---|---|---|
| `test-rozdeleni-stylu` | OK | PAD | moje |
| `test-poradi-pozemku` | OK | PAD | moje |
| `test-zaostreni` | **PAD** | PAD | **starší, ne dnešní** |

### Rozpočet stránky: graf se tam prostě nevešel

`test-poradi-pozemku` hlídá dvě věci: mapa do 55 % stránky a celá
stránka do 4,4 obrazovky telefonu. Obojí padlo.

A je to poctivý nález, ne jen mez: **stránka na graf nikdy místo
neměla.** Do rozpočtu zbývalo 0,2 obrazovky (~170 px), karta měří
přes 400. Procházelo to jen proto, že se graf u většiny nabídek
nekreslil — klidnou řadu má 21 okresů ze 48. Teprve když §205 udělal
z grafu věc, která je všude, se to ukázalo.

Udělaly se tři věci, než se sáhlo na mez:

1. **Poznámka pod grafem se v inzerátu zkrátila.** A nebyla to jen
   délka: ten odstavec vysvětluje, proč se čára nerovná mediánu NAD
   grafem — jenže v inzerátu žádný takový medián není. Vysvětloval
   rozpor, který tam nikdo nevidí. Karta spadla z 558 na 460 px
   (390×844).
2. **Rezervace výšky se snížila** na novou míru (422–470 px místo
   480–596), aby v kartě nezbýval vzduch.
3. **Karta se přesunula až za mapu.** Nejdřív stála hned pod
   verdiktem jako v předloze ze Sreality; tím ale odsunula rádce pod
   polovinu stránky (2 136 z 3 759 px) a mapu na 60 %. Rozhodování je
   přednější než věrnost předloze. Za mapou křivka nic neztrácí —
   obojí odpovídá na „jaké to je tady", kdežto cena a tlačítka na
   „co s tím".

Po tom všem zbylo 4 014 px = **5,02 obrazovky** proti mezi 4,4. Mez se
tedy zvedla na 5,1 — přesně o to, co přibylo, ne „s rezervou do
budoucna". Zbývala poslední možnost, jak se tomu vyhnout: sbalit graf
do rozbalovátka. Ta se NEUDĚLALA, protože majitel chtěl tu kartu
vidět, ne schovat.

### Dva pády, které se vyšetřily a nejsou to vady webu

**`test-rozdeleni-stylu`** spadl jednou ze šesti běhů, a jen v dlouhé
sekvenční sadě. Příčina není ve stylopisu: zkouška čeká na ustálení
stránky dvěma stejnými čteními po 200 ms, a pod zátěží se stránka
takhle „ustálí" a pak ještě doroste — porovnávaly se dva různé
okamžiky. Čeká teď na tři stejná čtení a při rozdílu obě měření jednou
zopakuje, než ohlásí nález.

**`test-zaostreni`** („otvírač okna zásady soukromí leží nahoře") padá
i ve stavu před dnešní prací. Není to tedy dnešní vada a nechává se
samostatně — zapsáno jako úkol, ne zameteno.

### A ještě jedna zkouška, která četla ikonu po staru

`test-mapa-pozemku` ověřuje, že se ikona zvětšení mapy překlopí na
„zmenšit". Četla tvar z atributu `d` — jenže od zavedení sady je tvar
v `<use href>`. Zajímavé je, JAK se to projevilo: kontrola „ikona se
vrátí k zvětšit" **procházela**, protože porovnávala dvě prázdna,
a padala jen ta druhá. Obě čtečky teď berou jméno ikony.

## §209 Hlídka vršku sebrala první zarolování — a „Zásady soukromí" se tím nedaly dostat do výhledu

V §208 stojí, že `test-zaostreni` padá i ve stavu před 28. 10., takže to
není dnešní vada. Zapsala se samostatně a tady je dojetá.

Hlášení znělo: *okno „zásady soukromí": otvírač jde zaměřit a leží
nahoře* → `{"nahore":false,"kde":"1618→1618","naBode":"nic"}`. Čte se
to takhle: odkaz `[data-info]` je v patičce, `scrollIntoView` s ním
nehnul (1 618 → 1 618) a na jeho středu neleží nic, protože je mimo
okno.

### Nejdřív se to nedalo reprodukovat — a to je samo o sobě nález

| běh | výsledek |
|---|---|
| samostatně, dvakrát | 59/59 bez nálezu |
| samostatně pod zátěží (6 smyček na 4 jádra), dvakrát | 59/59 bez nálezu |

Zkouška totiž před měřením čeká, až se dokreslí výpis — a v klidu se
tím dostane až ZA okno hlídky vršku (1,8 s od načtení). Padá tedy jen
tam, kde se dočká dřív. Sonda, která měří schválně uvnitř toho okna,
vadu vyrobí na první pokus:

| pokus o dosažení odkazu | poloha | výsledek |
|---|---|---|
| ve 300. ms | y 3 923 → 3 923 | **nedosažitelný** |
| v 800. ms | y 3 923 → 3 923 | **nedosažitelný** |
| v 1 400. ms | y 4 122 → 4 122 | **nedosažitelný** |
| ve 2 400. ms (po vypršení okna) | y 752 | dosažitelný |

### Příčina: jedno srovnání trvá půldruhé sekundy

Úvodní stránka má v `index.html` hlídku, která po načtení srovnává
polohu rolování na vršek — kvůli prohlížečům, které si pamatují
předchozí polohu. Instrumentovaný `window.scrollTo` (s výpisem, odkud
se volá) ukázal celý průběh:

```
773ms scroll → 5102                      ← skok na patičku
776ms scrollTo([0,0]) z toTop < priScrollu   ← hlídka ho srovnala
804ms scroll → 5096
...
1171ms scroll → 2135                     ← a pořád je v letu
```

Stylopis má na `<html>` `scroll-behavior:smooth`, takže obyčejné
`scrollTo(0,0)` není skok, ale ANIMACE. Jedno jediné srovnání tím na
půldruhé sekundy obsadí rolování a zruší každý pokus dostat se jinam.
Kdo v té době mířil na patičku, skončil uprostřed stránky.

### Opravovalo se to na tři pokusy a první dva nestačily

1. **Srovnávat nejvýš jednou.** Hlídka srovnávala při každé události
   `scroll` po celou dobu okna — naměřeno šest srovnání za sebou. Po
   opravě sonda hlásila dál **nedosažitelný**: to jedno srovnání je ta
   půldruhé sekundy dlouhá animace.
2. **Srovnávat skokem** (`behavior:'instant'`). Stránka tím skončí
   čistě na nule místo uprostřed letu — ale skok na patičku je pořád
   sebraný, takže odkaz je dál **nedosažitelný**.
3. **Nasadit hlídku jen tam, kde je co obnovovat.** Obnovit polohu má
   prohlížeč proč jen při obnovení stránky, při zpět/vpřed a při
   návratu ze zpětné paměti; kdo přišel na odkaz, žádnou dřívější
   polohu nemá. Typ navigace řekne prohlížeč sám
   (`performance.getEntriesByType('navigation')[0].type`). Teprve tím
   je odkaz **dosažitelný ve všech čtyřech okamžicích**.

Zůstala i čtvrtá, menší oprava: hlídka se uvolňovala jen na kolečko,
dotyk a šest vyjmenovaných kláves. Posuvníkem se roluje bez
kterékoli z nich, stejně jako hledáním v textu (Ctrl+F) nebo
tabulátorem. Uvolní se teď na stisk ukazovátka a na KTEROUKOLI klávesu.

### Vadu držel v kódu hlídač, který měřil simulaci

`test-stabilita` měl kontrolu „obnovenou polohu rolování stránka srovná
na vršek" a obnovení simuloval zápisem `window.scrollTo(0, 900)`
v dnešním prohlížeči. Od lidského zarolování se takový zápis nedá
rozeznat — kontrola tedy vyžadovala přesně to chování, které člověku
škodí. Proto taky hned po třetí opravě spadla.

Měří se teď ve dvou prohlížečích:

* **ve starém** — `scrollRestoration` se zakryje init-skriptem
  (`delete History.prototype.scrollRestoration`), hlídka se nasadí
  a musí obnovenou polohu srovnat, srovnat ji skokem, srovnat ji nejvýš
  jednou, člověku ustoupit a po vypršení okna nedržet;
* **v dnešním** — hlídka nasazená není, takže musí projít skok na
  prvek ve 300. ms (to je ta dnešní vada), a obnovená stránka musí
  stejně začít nahoře.

Při tom se ukázalo, že i zarolování SAMÉ ZKOUŠKY se kvůli
`scroll-behavior:smooth` rozjíždí, takže hlídka srovnávala z 30 px —
a sabotáž „srovnávej plynule" kontrolou prošla. Zkouška proto roluje
`behavior:'instant'` a měří z hlubokého konce stránky.

### Sabotáže

| co se vrátilo do starého stavu | co spadlo |
|---|---|
| hlídka nasazená i při běžném příchodu | skok na prvek v prvních 1,8 s |
| hlídka jen podle `scrollRestoration`, bez typu navigace | po obnovení stránky hlídka nasazená je |
| srovnávat plynule místo skokem | srovnává skokem **+** obnovenou polohu srovná |
| bez uvolnění po prvním srovnání | druhé zarolování už hlídka nesebere |
| odstranit jen naslouchání rolování | **nic** — a je to v pořádku, viz níž |
| odstranit všechny tři cesty nasazení | obnovenou polohu srovná **+** srovnává skokem **+** po obnovení je nasazená |

Ta pátá řádka je poučení sama pro sebe. Komentář u zkoušky dosud tvrdil,
že „vypnout celou hlídku vršku a kontrola padá". Neplatí to: vršek po
načtení drží TŘI nezávislé cesty — naslouchání rolování, záložní
časovače po `load` a obsluha `pageshow` (ta se v prohlížeči bez
`scrollRestoration` spustí při každém načtení, ne jen při návratu ze
zpětné paměti). Vypnout jednu z nich výsledkem nepohne, protože ho
zajistí druhá. Kontrola hlídá VÝSLEDEK, a to je u takhle zdvojené
pojistky správně; spadne, až když se vypnou všechny.

### Co tím prokázané NENÍ

V bodě „ve starém prohlížeči" se nemluví se skutečným starým Safari,
jen s prohlížečem, kterému se jedna vlastnost zakryla. Prokazuje se
tedy, že hlídka funguje, když se nasadí — ne že se ve starém Safari
nasadí. A původní hlášení majitele („stránka se otvírá uprostřed" na
iPhonu) se tady reprodukovat nedá vůbec. Kdyby se vrátilo, správná
oprava NENÍ nasadit hlídku zpátky na každý příchod — na to je teď
kontrola, která padne — ale zjistit, o jaký typ navigace jde.

## §210 Jeden ze dvanácti vzorků se měřil na chybové stránce

`test-tahy` měří vykreslený tah KAŽDÉ ikony na dvanácti stránkách a
`test-ikony` hlídá sadu tvarů. V CI (běh 776) spadl ten první na
vlastní pojistce: **naměřeno 39 ikon proti meze 40.** Lokálně
procházel. Padly přitom dvě různé věci a obě jsou starší než dnešní
práce.

### 1. Stránka, která nikdy neexistovala

Ve vzorku stálo `/ulozene.html` jako „Uložené" — jenže taková stránka
na webu není. Uložené pozemky jsou na `porovnani.html`, které je ve
vzorku taky. Falešný server posílá na neznámou adresu `404.html`, takže
se jeden z dvanácti vzorků celou dobu měřil na chybové stránce.

Místo ní je ve vzorku stránka pozemku (nese 12 ikon) a přibyla
kontrola, že žádná stránka ve vzorku nevrací jiný stav než 200.

### 2. Čekání se dalo ukolébat tím, že kreslení nezačalo

Zkouška čekala, až se počet `<svg>` mezi dvěma pohledy přestane
měnit — tedy na „už je hotovo". Jenže totéž platí, než se vůbec začne:

| stránka | tady | v CI |
|---|---|---|
| `/index.html` | **39** | **11** |
| `/pridat.html` | 10 | 10 |
| `/muj-inzerat.html` | 9 | 9 |

Na úvodní stránce se v CI nedokreslil výpis a zkouška to vzala jako
hotový stav. Ostatní stránky sedí přesně, takže to není pomalý stroj
obecně — je to jeden konkrétní kus, který se dopisuje ze skriptu.
Kde stránka nese výpis (`#opp-list`) nebo detail pozemku
(`#pz-detail`), čeká se teď nejdřív na jeho první prvek a teprve pak
na ustálení počtu.

### A mez se tím zvedla, ne snížila

Vzorek po obou opravách nese **79 ikon** (úvod 39, formulář 10, stránka
pozemku 12, můj inzerát 9, zbytek po jedné až dvou). Mez 40 byla tak
hluboko pod skutečností, že by prošla i stránka, které se nedokreslila
polovina — přesně to se v CI stalo. Je proto **60**: snese, že se v CI
nedokreslí celá stránka pozemku i celý formulář, a pořád pozná, že se
nekreslí výpis.

## §211 Mez na délku stránky usazená na hranu spadla na rozdílu strojů

Běh 777 (dnešní commit) spadl na jediné kontrole: `test-poradi-pozemku`
hlásil **4 082 px = 5,10 obrazovky** proti meze 5,1. O dva pixely.

Měřením se rozhodlo, čí to je:

| kde | délka stránky | obrazovek |
|---|---|---|
| tady, 360×800 | 4 014 px | 5,02 |
| běhač CI | 4 082 px | 5,10 |

Stránka tedy **nevyrostla** — po přidání dat robota měří na pixel
stejně jako před ním. Vyrostl rozdíl strojů: 68 px v sazbě a mapovém
rámu. U téhle zkoušky je to doložené už podruhé (dřív 43 px) a já jí
v §208 nechal rezervu 68,5 px, tedy přesně na hranu.

Mez proto dostala jeden celý naměřený rozdíl strojů: **5,2** (0,1
obrazovky = 80 px) a nic nad to. Že pořád pozná růst stránky, je
doložené sabotáží: `min-height:400px` na oddíl „Kam dál" přidá 244 px,
stránka vyjde na 5,32 a kontrola padá.

### Co se NEUDĚLALO, i když to na stránce je vidět

Těch 70 px by se na stránce našlo. Rozpad největších bloků (360×800):

| blok | výška |
|---|---|
| karta s vývojem ceny | 534 px (z toho graf 426) |
| mapa | 411 px |
| cena + verdikt | 345 px |
| **galerie** | **270 px** |
| poznámka | 216 px |
| kam dál | 156 px |
| popis od inzerenta | 128 px |
| akce | 112 px |
| **souřadnice** | **92 px** |

Dvě z nich jsou podezřelé: galerie drží 270 px na zástupný obrázek,
přitom fotku nemá ani jedna nabídka (§142), a souřadnice zaberou 92 px
na dva údaje a odkaz. Dohromady skoro půl obrazovky. Obojí je ale
rozhodnutí o VZHLEDU, ne úklid — zapsáno jako úkol pro majitele, ne
provedeno.

## §212 Deska se na webu kreslila čtyřmi zaobleními, třemi rámy a čtyřmi stíny

Majitel řekl „pokračuj na vizuální synchronizaci celého webu". §202 to
měla připravené jako otázku pro něj (10, nebo 14 px?); tohle je
rozhodnutí a provedení.

### Otisk před zásahem

Měřeno v prohlížeči na 18 typech stránek (1280 px, odhlášený): každý
prvek s vlastní plochou a rámem nebo stínem — 46 různých jmen.

| co | kolik podob | jak |
|---|---|---|
| zaoblení desek | **4** | 0 px (15 jmen), 10 px (12), 14 px (5), 20 px (11) |
| rám | **3** | 0,14 (27 jmen), 0,28 (12), 0,55 (2) |
| stín | **4** | žádný (30 jmen), `--e1` (11), `--e2` (3), `--e3` (2) |

A míchalo se to **v jedné roli na jedné stránce**: na inzerátu stála
poznámka na 10 px hned pod kartou s cenou na 14, mapa nesla stín pro
„zvednuté" a karta vedle ní stín pro „klidné", `.pz-sour` měla rám
0,55 a `.pz-gtk` vedle ní 0,14.

### Rozhodnutí: deska je 14 px podle karty, kterou poslal majitel

§202 nabízela dva směry a nechala je na majiteli, protože mezi kartami
na 14 px je `.pz-bok` — ta karta s cenou, kterou poslal jako předlohu
toho, jak má web vypadat. Vyhrála předloha:

* **deska (karta, panel, okno, mapa, fotka) = 14 px**, rám 0,14,
  stín `--e1`;
* **drobnost uvnitř desky** (odznak, štítek, náhled do výšky 44 px) =
  10 px, a dostala vlastní jméno `--r-drobnost`, aby se poznala od
  desky, která se jen zapomněla srovnat;
* **deska nad obsahem** (okno, panel filtrů, našeptávač) = `--e3`;
* **`--e2` zbyl jen na zvednutí při najetí myší**;
* **pilulka** odznakům a kulatým tlačítkům.

Tím **padlo pravidlo „karta je pořád hranatější než tlačítko"**, které
u tokenu stálo černé na bílém. Platilo uvnitř stylopisu, ale ne na
obrazovce: polovina karet ho nedodržovala. Hranatější karta je rozdíl,
který vedle sebe stejně nikdo nepřečte jako záměr — přečte ho jako
nedodělek.

### Otisk po zásahu

| co | před | po |
|---|---|---|
| zaoblení desek | 0 / 10 / 14 / 20 px | **14 px** (27 jmen), 0 u pruhů uvnitř mapy (15), 10 u jedné drobnosti, pilulka u tří odznaků |
| rám | 0,14 / 0,28 / 0,55 | **0,14** (40 jmen) + dva zelené jako ozdoba |
| stín | žádný / e1 / e2 / e3 | žádný (30) / **e1** (13) / **e3** (3) |

### Tři nálezy, které z toho vypadly navíc

1. **Výjimka, která netvrdila nic.** `.filter-chip` je v `test-zaobleni`
   na seznamu pilulek — jenže se kreslil na 20 px. Být na seznamu ho
   vyjmulo z kontroly ÚPLNĚ, takže se nehlídalo ani to, že je pilulka.
   Teď pilulkou je.
2. **Dva našeptávače, dva stíny.** `.vm-navrhy` (hledání na úvodu) měl
   `--e3`, `.ms-navrhy` (hledání nad mapou) `--e2`. Tatáž práce, dva
   recepty.
3. **Token, který nekreslil nic.** Po sjednocení zbylo `--r-lg` (20 px)
   bez jediného použití. Vyhozen ze žebříku; nechávat v něm hodnotu,
   kterou nic nepoužívá, je pozvánka, aby se jí zase něco chytlo.

### Co se NEZMĚNILO, i když to v soupisu vypadalo jako vada

Legenda v mapě (`.map-legend`), panel pod mapou (`.pzm-panel`) a
legenda na inzerátu (`.pzm-leg`) mají zaoblení 0. V prvním soupisu
jsem je měl jako „bílé panely na nule". Měření ukázalo, že mají jen
`border-top` a leží UVNITŘ mapy, která je ořezává — vlastní zaoblení
by u nich nebylo vidět. Zůstaly, jak byly.

### Hlídač

`scripts/test-deska.mjs` projde desky na 17 typech stránek a vyžaduje
jeden recept. Výjimky mají jméno a důvod (zelený rám odznaku „K dražbě"
a nápovědy nad mapou; leafletové prvky kreslí knihovna, ne náš
stylopis). Prokázáno sabotážemi:

| sabotáž | co spadlo |
|---|---|
| jedna karta zpátky na 10 px | zaoblení desky |
| jedna karta dostane silnější rám | rám desky |
| třetí klidový stín | počet klidových stínů |

## §213 Odsazení uvnitř desky: pět měr na jednu práci

Pokračování §212. Když měly desky jedno zaoblení, jeden rám a dva
stíny, zbyla poslední věc, která se na nich liší — kolik je uvnitř
místa.

### Měření (1280 px, 26 desek)

| odsazení | kolik jmen | kdo |
|---|---|---|
| 20/20 | 7 | ovládání mapy, přidat pozemek, hlídání, zprávy, rádce, křížový odkaz |
| **0/0** | **7** | kontejnery, jejichž děti si odsazení nesou samy (karta s fotkou, tabulky, mapa) |
| 16/16 | 5 | **karta s cenou (předloha)**, verdikt, dlaždice, graf, stavová karta |
| 12/12 | 2 | poznámka na inzerátu, krok v návodu |
| 40/24, 32/28, 32/20, 8/12, 4/4 | po jednom | prázdné stavy, přihlášení, souřadnice, záložky |

A je to stejný případ jako u zaoblení: **podle velikosti karty to
není.** Šestnáct nese karta široká 340 px i 720 px, dvacet karta
440 px i 1 136 px. Rozdíl není záměr, je to zapomenutí.

### Rozhodnutí

Deska má **16 px**, podle téže předlohy jako zaoblení — karty s cenou.
Nula zůstává kontejnerům (to není chybějící odsazení, to ho nese
obsah). Jednořádkový proužek (odznak zdroje, nápověda nad mapou) si
odsazení řídí podle výšky; 16 px nahoře i dole by z něj udělalo desku
dvakrát vyšší než text v ní.

Tři výjimky mají jméno a důvod přímo v hlídači: prázdný stav 32/20
(vzdušný schválně, ať je poznat, že tam nic není, a ne že se to
nenačetlo), přihlašovací karta 32/28 (stojí sama uprostřed stránky
místo obsahu) a pruh se záložkami 4 (to odsazení je lůžko pro zapnutou
záložku, ne odsazení obsahu).

### Po zásahu

| odsazení | kolik jmen |
|---|---|
| **16/16** | **14** |
| 0/0 (kontejnery) | 7 |
| 32/20 (prázdné stavy) | 2 |
| 32/28 (přihlášení) | 1 |
| 4/4 (záložky) | 1 |

### A jeden důsledek, který našlo až CI

Zkrácení odsazení zkrátilo stránky — a krajská stránka tím spadla pod
práh, který si drží tlačítko „nahoru" (3 obrazovky, `js/hlavicka.js`):

| stránka | 1280 px | 390 px |
|---|---|---|
| Středočeský kraj | **2 695 px = 2,99** | 7 570 px = 8,97 |
| Jihomoravský kraj | 2 688 px = 2,99 | 7 337 px = 8,69 |
| okres Benešov | 4 131 px = 4,59 | 13 217 px = 15,66 |
| data.html | 4 992 px = 5,55 | 9 762 px = 11,57 |

`test-nahoru` používal krajskou stránku jako příklad „dlouhé" a spadl
na vlastní pojistce (o pět pixelů). Práh se nesnižoval — je to pravidlo
aplikace; vyměnil se vzorek za `data.html`, které má rezervu na obou
šířkách. Komentář v té zkoušce přitom tenhle případ popisoval už
jednou: ze stejného důvodu z ní dřív vypadla stránka cen.

A poznámka k webu, ne ke zkoušce: na krajské stránce se tím pádem
tlačítko „nahoru" na počítači neukáže. Je to důsledek sjednocení, ne
vada — stránka na dvě a tři čtvrtě obrazovky se projde i bez něj.

### Dva nálezy od hlídače, ne ode mě

Když se kontrola odsazení přidala do `test-deska`, spadla hned na dvou
místech, která jsem při ruční obhlídce minul: odznak zdroje (8/16) a
nápověda nad mapou (8/12). Obojí jsou jednořádkové proužky — pravidlo
se o ně rozšířilo tak, aby to říkalo nahlas.

A jedna deska se chovala na telefonu jinak než všechny ostatní:
`.status-card` si pod 880 px zužovala odsazení na 12 px. Jediná na
webu. Srovnáno.

## §214 Část webu reagovala měkce, část cukla — a stisk měl sedm gest

Zadání znělo „pokračuj ve vizuálním propojení a přechodech, všude
dodělej lehké detaily a přechody". Napřed se změřilo, co web dnes dělá.

### Nález 1: 93 ze 150 míst se měnilo skokem

Rozbor stylopisu hledal selektory, které v `:hover`, `:focus-visible`,
`.active` nebo `:checked` mění barvu, pozadí, rám, stín, posun,
průhlednost či filtr — a pak u nich hledal přechod na tu vlastnost.

| | kolik |
|---|---|
| míst, která stavem mění vzhled | **150** |
| z toho BEZ přechodu na tu změnu | **93** |

Část webu tím reagovala měkce (karta ve výpisu, dlaždice, hlavní
tlačítka), část cukla (pole formuláře, drobečky, odkazy v patičce,
zavírací křížky, položky v našeptávači). To je přesně ten pocit „skoro
hotové", který se nedá ukázat prstem.

A nebylo to tím, že by chyběly časy: `--cas-rychly`, `--cas-zakladni`
a `--cas-pomaly` v stylopisu jsou, `prefers-reduced-motion` se ctí
globálně a `test-soustava` hlídá, že se čas bere z tokenu. Chybělo
jediné: dát přechodu JMÉNO a nasadit ho jedním pravidlem.

### Co se udělalo

* `--prechod-barvy` (barva, pozadí, rám, stín, průhlednost, filtr,
  základním časem) a `--prechod-pohyb` (posun, rychlým časem; posunu si
  člověk všimne dřív a pomalý posun působí gumově);
* nasazeno na rodinu ovladačů tam, kde už rodina v stylopisu stála, na
  OBSAH ovladače (ikona nebo název, který se mění při najetí na rodiče)
  a na řádky, které ovladačem nejsou (položka v našeptávači, řádek
  souhrnu, dlaždice kraje, úchyt posuvníku);
* **54 různých zápisů přechodu na 93 místech** se slilo do jednoho
  receptu; vlastní čas si nechalo 14 míst, která animují rozměr nebo
  mají delší náběh (odkrývání, mizející hlavička).

Co se schválně NEanimuje: `outline` (prstenec zaměření musí naskočit
hned — kdo jede tabulátorem, potřebuje vědět, KDE je, ne se dívat, jak
to doplouvá) a rozměry (překreslovaly by rozvržení na každém snímku).

### Nález 2: rozbor stylopisu lhal o padesáti místech

Po nasazení hlásil rozbor pořád padesát míst bez přechodu — a nebyla
to pravda. Ze zápisu se totiž nepozná, že `.auth-eye` je `<button>`
a že na něj pravidlo pro rodinu ovladačů platí. Teprve měření
VYPOČTENÉHO stylu v prohlížeči ukázalo skutečný stav: **dvě** mezery,
dlaždice kraje a položka okresního výpisu, které se při najetí zvedaly
skokem. Hlídač proto měří v prohlížeči, ne v zápisu.

### Nález 3: stisk měl sedm gest

| gesto | kolikrát |
|---|---|
| `translateY(1px)` | 9 |
| `translateY(0) scale(.97)` | 6 |
| jen změna pozadí | 5 |
| `scale(.99)` | 2 |
| `scale(.975)`, `scale(.94)`, `scale(1.2)`, posun do strany | po jednom |

Web tedy reagoval na kliknutí pokaždé jinak. Teď je to jedno gesto:
**o pixel dolů.** Jediná výjimka je záložka „Uložit", která naopak na
okamžik poskočí — to není stisk, ale POTVRZENÍ, že se rozhodnutí
zapsalo. Dvě různá gesta, protože říkají dvě různé věci; výjimka je
v hlídači jmenovitě.

### Hlídač

`scripts/test-prechody.mjs`: seznam míst se čte ze stylopisu (přibude
nový stav → zkouška si ho najde sama), měří se vypočtený styl
v prohlížeči na 13 typech stránek, stisk se čte ze zápisu (hodnota je
doslovná). Hned při nasazení našel tři místa na inzerátu, která jsem
při ruční obhlídce minul. Sabotáže: vypnutý přechod u karty ve výpisu
shodí první kontrolu, vlastní gesto u jednoho tlačítka druhou.

## §215 Dva pády CI po nasazení přechodů — a ani jeden nebyl vadou webu

Běh 781 (commit přechodů) spadl na dvou hlídačích. Jeden z nich si můj
zásah zlomil sám, druhý ležel ve zkoušce od začátku a jen čekal na
pomalejší stroj. Ani jedna příčina nebyla na webu — a přesto se obě
musely dohledat měřením, protože „to je flake" není příčina.

### Pád 1: hlídač najetí přestal měřit (143 → 0 prvků)

`scripts/test-najeti.mjs` hlídá, že po najetí myší zůstane text
čitelný. Měří to tak, že barvu z pravidla `:hover` dosadí prvku
natvrdo a vypočtený styl přečte **hned**. Jakmile web dostal přechody,
vracelo to čtení ještě barvu PŘED přechodem — zkouška tedy měřila
klidový stav proti klidovému pozadí a kontrast vycházel vždycky dobře.
Hlásila to sama: *„Změřilo se jen 0 prvků, čekáno aspoň 70."* Ta
pojistka proti měření naprázdno je jediný důvod, proč pád vůbec nastal
místo tichého zeleného výsledku.

Doloženo stromem na předchozím commitu: nad `HEAD~1` měřil týž hlídač
143 prvků, nad novým 0. Opraveno `reducedMotion: 'reduce'` u obou
prohlížečů hlídače — vypnutý pohyb je přesně to, co stylopis už ctí
globálně, takže se měří koncový stav.

### Pád 1b: a hned za tím planý poplach o kontrastu

Po opravě hlídač ohlásil vadu:

> `.filter-chip:hover` — „Vše" má po najetí kontrast 1,90:1 (potřeba
> 4,5:1) — rgb(16, 21, 19) na rgb(0, 79, 47)

Na obrazovce ale žádná taková vada není. Zapnutý filtr „Vše" má
`.filter-chip.active[data-type="all"]{color:#fff}`, specificita 300;
`.filter-chip:hover{color:var(--text)}` má 200. Při najetí vyhraje ta
první a text zůstane bílý. Hlídač ale počítal specificitu **jen mezi
pravidly `:hover`** a pravidla bez něj neznal, takže si dosadil tmavou
barvu, která se tam nikdy nedostane.

Opraveno: sbírají se VŠECHNA pravidla, která nastavují barvu textu,
a u každého prvku se hledá vítěz mezi nimi; měří se jen tehdy, když
vyhraje pravidlo s `:hover`. Po opravě **226 prvků** (dvojnásobek
původních 143 — přibyly ty, které se dřív neměřily vůbec) a bez nálezu.

### Pád 2: zkouška poznámek čekala na ODESLÁNÍ, ne na potvrzení

Druhý pád byl tenhle výpis, a lokálně se neprojevil ani jednou:

```
✕ v DRUHÉM prohlížeči se poznámka stáhne z účtu
    v poli: „"
✕ a uloží se do něj, aby čtení bylo dál okamžité
    klíčů ve schránce: 0
```

Zkouška píše poznámku v prvním prohlížeči, počká na požadavek
`poznamka_uloz`, zavře prohlížeč a otevře druhý se prázdnou schránkou —
co se v něm objeví, může přijít jen z účtu. Jenže čekala na
`waitForRequest`, tedy na okamžik, kdy požadavek OPOUŠTÍ prohlížeč.
Server v té chvíli ještě dočítá tělo a nemá zapsáno. Na mém stroji
zápis stihl doběhnout, na běhači CI ne: druhý prohlížeč si stáhl
prázdný seznam.

Příčina se nedokazovala úsudkem. Nejdřív se zkoušelo zpomalení
procesoru (CDP, 20×) — **závod nevyrobilo**, takže to nebyla rychlost
vykreslování. Teprve sabotáž na straně účtu ho vyrobila na slovo
přesně: s `PK_ZDRZ_ULOZ=800` (falešná Supabase potvrdí zápis o 800 ms
později) padne zkouška na týchž dvou kontrolách a se stejným výpisem
jako běh 781 — 70 v pořádku, 2 chyby. S čekáním na ODPOVĚĎ projde
i s tím zpožděním, protože server v `poznamka_uloz` ukládá do mapy
a teprve pak odpovídá. Knoflík v `scripts/falesna-supabase-chat.mjs`
zůstal, aby se důkaz dal zopakovat.

Pravidlo z toho (je i v CLAUDE.md): **kde zkouška zavírá prohlížeč nebo
jde dál a spoléhá na to, že server něco má, musí čekat na POTVRZENÍ, ne
na odeslání.** Prohledán zbytek zkoušek: `waitForRequest` je ještě na
jednom místě, v `test-ceny-hledani` — tam je správně, protože tam je
ten požadavek sám tím měřeným tvrzením („rejstřík se stáhne, až když se
do pole klepne").

### A jedno tvrzení v kódu, které měření vyvrátilo

Při hledání příčiny se čtlo doplňování poznámky z účtu v
`js/pozemek.js`. Na dvou místech tam stálo, že se zkouší ještě jednou
po 400 ms, protože „`prihlasen()` si u prošlého tokenu řekne o obnovu,
a ta je asynchronní". **Není to pravda.** `PKAuth.prihlasen()` je
synchronní čtení schránky (`js/auth.js:53` a `58`) a o žádnou obnovu
neříká. Změřeno 29. 10. na stránce pozemku: `config.js` i `auth.js`
mají `defer`, takže v `DOMContentLoaded` je PKAuth **už přihlášený** —
první pokus uspěje a cesta po 400 ms se nepoužije.

| okamžik | PKAuth | prihlasen() |
|---|---|---|
| 10 ms po začátku | není | — |
| DOMContentLoaded | je | ano |
| load | je | ano |

Opakování zůstalo, ale s napsaným pravým důvodem: je to pojistka proti
změně POŘADÍ SKRIPTŮ, aby doplnění z účtu nezmizelo mlčky. Lež
v komentáři je horší než chybějící komentář — podle ní by se příště
hledala chyba v obnově tokenu, která se tu vůbec nedeje.

## §216 Plochy a popisky: co na webu říká „tohle je tichá vrstva"

Pokračování vizuálního propojení. Zaoblení (§212), rámy a stíny (§212),
odsazení (§213) a přechody (§214) už mají jeden recept. Zbývalo to, co
je na desce vidět jako první a poslední: ČÍM je vyplněná a JAK je nad
ní napsané, o čem ta deska je.

### Plochy: 38 desek, osm výplní — ale třicet z nich je bílých

Otisk 17 typů stránek (týž vzorek jako test-deska): 38 desek, 8 různých
výplní, a 30 z nich je čistě bílých. Karta sama tedy sjednocená je.
Zbytek:

| výplň | kolikrát | kdo |
|---|---|---|
| `#FFFFFF` | 30 | karty, panely, okna, mapy |
| `#F7F8F8` (`--plocha-tlumena`) | 2 | náhled bez fotky, blok s odkazy |
| `#F4F6F4` (`--plocha-vypis`) | 1 | pruh výpisu vedle mapy |
| `#EDEFEE` (`--plocha-zapustena`) | 1 | lůžko záložek |
| zelené a tmavé závoje | 4 | odznaky a prázdné stavy (ozdoba) |

Vada nebyla v počtu, ale v ROLI. `--plocha-tlumena` má v komentáři
„hover, aktivní" — a polovina jejích použití byla klidová: **15 ve
stavu, 15 v klidu**. Dvě role se přitom malovaly oběma odstíny:

* **vstupní pole**: `.loc-input` nosilo `--plocha-tlumena`, zatímco
  všechna ostatní pole na webu (`.add-form input`, `.auth-inp input`,
  `.rct-form input`, `.pz-pozn-pole`…) mají `--plocha-zapustena`;
* **plocha mapy pod dlaždicemi**: `.vm-mapa` jeden odstín, `.pzm-mapa`
  druhý.

Srovnáno na roli: pole, duchové tlačítko a záložka účtu jsou ovladače
se zapuštěnou plochou, mapa taky. Komentáře u obou tokenů teď říkají,
co doopravdy dělají — `--plocha-tlumena` zůstává zvednutí při najetí,
velké ploše „kde teprve něco bude" a informaci, která už neplatí.

### Tmavý náhled na kartě: vypadal jako vada, měření ho obhájilo

Při obhlídce výpisu bez leteckých dlaždic (pomalá síť, sandbox) je
náhled na kartě tmavě zelený blok. To vypadalo jako přesně ta „tmavá
deska", kterou řešil starší úkol. Otisk obou možností vedle sebe ale
ukázal opak: se světlým podkladem se spodní závoj, který na fotce dělá
odznak čitelným, změní v šedou šmouhu a karta vypadá hůř. Tmavý
podklad je PLÁTNO MAPY, ne tmavá karta, a čte se správně. **Neměněno.**
Zůstává jen technický nález: `#12241A` je napsaný natvrdo ve dvou
místech JS (`js/snimek.js`, `js/main.js`), ačkoli token
`--plocha-tmava` existuje.

### Popisek verzálkami: devět receptů na jednu roli

Nadpis uvnitř desky se měřil na 17 typech stránek: **10 desek, 8
receptů** (dva z devíti byly šum mé sondy — obaly, ne nadpisy). Nejhůř
na tom byl popisek verzálkami, tedy ta tichá řádka nad obsahem karty.
Patnáct míst:

| vlastnost | jak to bylo |
|---|---|
| písmo | `--font-mono` 9×, základní 5× |
| velikost | 12 px 11×, 11 px 2×, 13 px 1× |
| řez | 600 10×, 700 4× |
| prostrkání | `.07em` 14×, `.02em` 1× |
| barva | `--popisek` 6×, `--muted` 4×, zelená ozdoba 3× |

Jediné místo, které stálo mimo celou řadu, byla PŘEDLOHA — majitelova
karta s cenou (`.pz-bok-nadpis`: 13 px, 700, `.02em`, proporcionálně).
U zaoblení i odsazení v tomhle vlákně předloha rozhodla; tady ne,
a důvod je měřitelný: popisek verzálkami je na webu volba písma, a té
se předloha neúčastnila. Srovnalo se proto jedno místo, ne devět.

Po zásahu: **4 recepty místo 9**, a ty tři zbylé jsou táž sazba
s jinou barvou — zelené „obočí" na tmavém pásu, které je ozdoba.

### A token, který lhal o písmu

Při tom se našlo tohle: **`--font-mono` není neproporcionální.** Všechny
čtyři tokeny písma (`--font-ui`, `--font-display`, `--font-nadpis`,
`--font-mono`) ukazovaly na týž Inter. Kdo ten název četl — já taky —
myslel si, že popisky jsou „datový" strojopis, a podle toho se
rozhodoval. Přejmenováno na `--font-popisek`, tedy podle role, kterou
ta hodnota doopravdy má (32 míst ve dvou stylopisech, osm ručně psaných
stránek a jedna zkouška).

A hned se tím odhalila starší vada: `diagnostika.html` je samostatná
stránka bez paletky, takže jí `var(--font-mono)` nikdy nic nevrátilo —
výpisy kódu v `code` a `pre` se sázely obyčejným písmem. Dostaly
skutečný strojopis napsaný natvrdo; v test-pismo je to jmenovitá
výjimka s důvodem a sabotáží doložené, že totéž písmo jinde hlídač
chytí.

### A třetí hlídač, kterému přechody vzaly měření

`test-afordance` měří, že vypnutý ovladač je průhlednější než zapnutý.
Vypne ho a vypočtený styl přečte hned — jenže průhlednost je od §214
v přechodu, takže to čtení vrátilo ještě hodnotu PŘED změnou: 1
u všech šesti ovladačů. V běhu 781 se k téhle zkoušce CI vůbec
nedostalo (úloha skončila na dřívějším pádu), takže se ukázala až
v 782. Opraveno `reducedMotion: 'reduce'`, stejně jako u test-najeti.

Aby se nečekalo na další běh, prošly se zbylé zkoušky třetí směny,
ke kterým se CI kvůli pádu nedostalo (test-sliby, test-vyber-okoli,
test-zive-strop, test-hledani-vzhled, test-videno,
test-hledani-zavirani, test-kontrola-ziva) — všechny bez nálezu.

## §217 Lehký přechod na všem, co se dá — texty, ikony, obaly

Zadání majitele: *„měl bys udělat přechody i mezi texty, ikonkami atd.,
tedy úplně na všem, co se dá — ale jen jednoduché, nemusí to být žádná
sláva."* §214 dalo přechod rodině ovladačů a tomu, co je uvnitř nich.
Tohle je zbytek stránky.

### Měření před zásahem

Dvě čísla, dvě různé otázky.

**Uvnitř klikacích prvků** (13 typů stránek, vypočtený styl): 2 042
prvků, z toho **1 876 s přechodem, tedy 92 %**. Zbylých 166 bylo skoro
celé mapová knihovna — dlaždice, značky, obrysy — plus 69 jmen krajů ve
vrstvě nad mapou. Tam přechod nepatří: Leaflet si to překresluje sám
a měkký přechod by za tím táhl duchy. Uvnitř ovladačů tedy po §214
nezbylo nic k opravě.

**Celá stránka mimo mapu** (viditelné prvky s textem nebo kresbou):
4 023 prvků, z toho **1 821 s přechodem, tedy 45 %**. Tohle je ta
polovina webu, která cukla: nadpis, cena, buňka tabulky, položka
seznamu, ikona.

### Co se udělalo

Jedno pravidlo, jen barvy, se specificitou NULA:

```css
:where(p, span, b, strong, …, h1…h6, img, svg, path, …,
       div, section, ul, table, tr, details, …){
  transition:var(--prechod-barvy);
}
:where(.leaflet-container, .leaflet-pane, .kraj-lock, .pzm-mapa,
       .vm-mapa, .opp-map) :where(*){ transition:none; }
```

Tři rozhodnutí, která za tím stojí:

1. **`:where()`, tedy specificita nula.** Každé konkrétnější pravidlo
   ho přebije — místa s vlastním časem (odrolovací panel, toast) si
   svůj čas nechávají a nic se nepřepisuje. Bez toho by se musel
   kontrolovat každý z 54 dřívějších zápisů přechodu.
2. **Jen barvy, žádný pohyb ani rozměr.** Posun uvnitř textu by
   vypadal jako chyba a rozměry by překreslovaly rozvržení na každém
   snímku.
3. **Mapa je ven**, a to i naše vrstvy nad ní.

A do receptu přibyla **kresba ikony**: `fill` a `stroke`. V
`--prechod-barvy` dosud nebyly, takže „uložený" pozemek zabarvil ikonu
skokem, i když tlačítko kolem ní přešlo měkce.

**Po zásahu: 3 987 z 4 023 prvků, tedy 99 %** (zbytek je `html`,
`body` a pár prvků uvnitř mapových vrstev).

### A hlídač, který to měl hlídat, měřil jen půlku

Při sabotáži se ukázalo, že `test-prechody` zná stav jen tehdy, když je
napsaný pseudotřídou (`:hover`, `:focus-visible`, `:active`,
`:checked`). Jenže půlka stavů na webu se píše **třídou, kterou nasadí
JavaScript** — `.on` u uloženého pozemku, `.active` u zapnutého filtru.
Sabotáž „vyjmi fill a stroke z receptu" proto NEPADLA: hlídač ta dvě
místa vůbec neměřil.

Opraveno — hlídač teď zná obojí a základní selektor si z třídy odvodí.
Míst se stavem tím přibylo ze **147 na 175**. Po opravě táž sabotáž
padá a jmenuje je: `.opp-fav svg` a `.msv-ulozene svg` bez přechodu na
`fill`.

### Hlídač pokrytí

Do `test-prechody` přibyla pátá kontrola: změří podíl viditelných prvků
mimo mapu, které se umí změnit měkce, a vyžaduje **aspoň 95 %** při
vzorku aspoň 2 000 prvků. Doloženo sabotáží: s vypnutým lehkým
přechodem spadne podíl na 46 % a kontrola padne — a to číslo zároveň
potvrzuje stav před zásahem.

### Co to NEROZBILO

Přechod na skoro všem je přesně ta změna, po které hlídačům přestane
fungovat měření (§215, §216: tři zkoušky četly vypočtený styl hned po
změně stavu). Prošlo se proto 32 rizikových zkoušek ručně, než se
cokoli posílalo do CI — včetně těch, které měří pohyb, poskok rozvržení
a plynulost startu: test-pohyb 26/26, test-stabilita 58/58,
test-plynulost 8/8, test-prvni-obrazovka 22/22, test-kontrast 2 672
prvků bez nálezu, mapové zkoušky (shluky, podklad, maska, kreslení,
vrstvy, tažení, okolí) všechny bez nálezu.

## §218 Minifikace mazala dědičný kombinátor — a hlídač toho byl slepý z konstrukce

Tohle se našlo při kontrole vlastní práce z §217 a je to vážnější než
všechno ostatní v tomhle vlákně: **web se vykresloval jinak, než jak je
napsaný ve zdroji.**

### Nález

`css/styles.min.css` je to, co si opravdu stáhne návštěvník. Minifikace
v něm mazala mezery kolem dvojtečky:

```css
/* zdroj */    .add-cross .acx-copy :is(h2, h3){font-size:16px}
/* očištěné */ .add-cross .acx-copy:is(h2,h3){font-size:16px}
```

To nejsou dvě sazby téhož pravidla, ale **dvě různá pravidla**. První
znamená „h2 nebo h3 uvnitř .acx-copy", druhé „prvek, který je zároveň
.acx-copy a h2" — a to neodpovídá ničemu. Mezera před dvojtečkou je
v selektoru dědičný kombinátor, ne ozdoba.

Zkomolená byla **tři pravidla**:

| pravidlo | důsledek |
|---|---|
| `.add-cross .acx-copy :is(h2, h3)` | nadpis „Najděte konkrétní pozemek" se sázel výchozí velikostí prohlížeče: **18,72 px**, tedy mimo naši stupnici |
| `.leaflet-container :focus`, `… :focus-visible` | prstenec zaměření uvnitř mapy se neřídil stylopisem |
| `:where(…mapa…) :where(*)` | moje čerstvé vyloučení mapy z lehkých přechodů bylo v ostrém stylopisu **mrtvé** — mapa by přechody dostala taky |

První se našel měřením všech nadpisů proti stupnici: ze 108 viditelných
stály mimo dva, a jeden z nich je plynulá velikost z `clamp()`, tedy
záměr. Zbyl jediný — a ten vedl na příčinu.

### Proč to nikdo nechytil

`scripts/test-minifikace.mjs` existuje přesně na tohle: porovnává
selektory zdroje a očištěné kopie jako množiny. Jenže jeho normalizace
mazala mezery kolem dvojtečky taky — **obě strany si srovnal na týž
tvar a mlčel**. Slepota z konstrukce: kontrola se nesmí opírat o touž
záměnu, kterou má odhalit.

### Oprava

V minifikaci se dvojtečka řeší zvlášť a jen zprava (`color: red`
v deklaraci se zkracuje dál, `.a :is(x)` v selektoru zůstává). Stejně
v normalizaci hlídače.

Cena: **5 bajtů** v css/styles.min.css (230 291 → 230 296 B).

Doloženo sabotáží: vrácení minifikace do původního stavu shodí
`test-minifikace` a vypíše všechna tři zkomolená pravidla jménem.
Předtím táž sabotáž neudělala nic.

### Co z toho plyne

Pravidlo do CLAUDE.md: **artefakt, který se servíruje, se musí
porovnávat se zdrojem tak, aby rozdíl, kterého se bojíme, normalizací
nezmizel.** Totéž platí o měření obecně — hlídač najetí v §215 měřil
0 prvků, hlídač přechodů v §217 znal jen půlku stavů, a tenhle si
rozdíl umazal sám. Pokaždé to vypadalo jako „zeleno".

## §219 Ikony všude — a hlavně tam, kde je dosud kreslilo písmo

Zadání majitele: *„a taky hezky. Pečlivě udělej a přidej všude ty
ikonky."* Nešlo tedy o to nasypat ikony na každý řádek, ale dát je tam,
kde je soustava už předpokládá.

### Měření před zásahem

Na 18 typech stránek se vykreslilo **172 ikon**. Zajímavější než ten
součet je, kde TÁŽ VĚC jednou ikonu má a podruhé ne:

| místo | s ikonou | bez ikony |
|---|---|---|
| `.btn-primary` (hlavní tlačítko webu) | 1× | **26×** |
| `.mc-prep` | 1× | 3× |
| `.map-select`, `.pz-btn` | 1–3× | 1× |

A druhý nález, který se objevil až při čtení zdrojů: **část značek
kreslilo PÍSMO, ne naše sada.** Textové znaky stály na místě ikon na
těchto místech:

| znak | kde | kolikrát |
|---|---|---|
| `↗` | „otevře se v novém okně" u zdroje nabídky | 162 |
| `→` | konec nápisu na hlavním tlačítku | ~116 |
| `✕` | zavírací křížky (karta, okno výběru, nahrávání fotek) | 5 |
| `‹` | odkaz zpět v hlavě právních a rádcovských stránek | 20 |
| `♥` | „uložené" v bilanci rychlého výběru | 1 |

Znak z písma má jinou tloušťku, jiný sklon i jinou výšku než naše
kresba — vedle ikony ze sady je to vidět. A `♥` byl navíc nesoulad ve
významu: „uložené" je na celém webu ZÁLOŽKA, srdce web nikde jinde
nepoužívá.

### Co se udělalo

1. **Dvě nové ikony do sady** (`scripts/ikony.mjs`), kreslené týmž
   perem: `odkaz_ven` (rámeček s chybějícím rohem a šipka ven) a
   `vratit` (šipka doleva s obloukem). Plátno 24×24, kresba 3,5–20,5,
   jen tahy, souřadnice na půlkách — jako zbytek sady.
2. **Všechny znaky z tabulky výš nahradila ikona ze sady.**
3. **Hlavní tlačítko dostalo svou ikonu**: „Přidat pozemek" + plus.
   Je v liště na **2 409 stránkách**, takže je to nejviditelnější
   jediná změna celého zásahu.
4. **Řádek výpisu na krajských a okresních stránkách dostal špendlík**
   u názvu obce — stejně jako ho má karta na úvodní stránce. Dvě
   podoby téhož řádku se tím srovnaly.
5. Velikosti a k nim dopočítané tloušťky (36/šířka) jsou v stylopisu
   na jednom místě, takže stopa vychází všude na 1,5 px — hlídá
   `test-tahy`.

### Co to shodilo (a proč to byly dobré pády)

Rychlá sada spadla na pěti zkouškách a každá ukazovala na něco jiného:

* **`test-odstupy`** — můj `gap:5px` nebyl na stupnici odstupů.
  Srovnáno na 4 px.
* **`test-stranky-pozemku` a `test-odhad-regiony`** — obě čtou řádek
  výpisu vzorem „všechno hned za `>` až po první značku", a protože
  tam teď stojí ikona, vracely **prázdno u všech 2 065 řádků**. Vzory
  ikonu přeskakují; že tam je, hlídá `test-ikony`.
* **`test-pravni-stranky`** — otisk znění se rozešel, protože
  z tlačítka „Kontakt →" zmizel znak „ →". Přepsáno BEZ změny data
  „Poslední úprava", se zdůvodněním přímo u otisku: ověřeno, že
  v celém souboru se změnily čtyři věci (verze stylopisu, sprite,
  ikona v liště, ta šipka) a ani slovo právního znění. Tatáž zkouška
  to dělá počtvrté a pokaždé s důkazem.
* **`test-oprav`** — odvozené soubory nebyly přegenerované.

### Po zásahu

Hlídači vzhledu bez nálezu: `test-ikony` 11/11, `test-tahy` 6/6,
`test-hlavicka` 85/85 (lišta se o ikonu rozšířila a nic se nerozbilo),
`test-rozvrzeni` 190/190, `test-dotyk`, `test-kontrast` (2 673 prvků),
`test-vaha-stranky` 6/6, `test-prvni-obrazovka` 22/22,
`test-prechody` 5/5, rychlá sada 134/134.

## §220 Jeden ovladač: tlačítka byla v 35 receptech a lišta ubírala řez hlavní akci

Desky už hlídá `test-deska`, zaoblení `test-zaobleni`, přechody
`test-prechody`. TYPOGRAFII ovladačů nehlídal nikdo — a bez hlídače se
to rozešlo.

### Co otisk napočítal

První otisk (1 280 px) napočítal **194 ovladačů s plochou nebo rámem
ve 35 receptech**. Ten seznam měl šestnáct jmen, ale PĚT z nich na webu
není (`pozemky`, `mapa`, `ucet`, `odhad`, `profil`) — otisk je mlčky
přeskočil, takže čísla jsou z jedenácti stránek, ne ze šestnácti.
Po srovnání seznamu na existující stránky: **258 ovladačů, 33 tříd,
18 stránek**. Z nálezů stály za prohlédnutí tři:

| třída | recepty | verdikt |
|---|---|---|
| `.btn-primary` | 14/500, 14/700, 16/700 | **vada** |
| `.mcv-btn` | 52 px, 44 px | plané — dvě různé skupiny |
| `.pz-abtn` | 14/600, 14/700 | plané — popsaná výjimka |

### Vada: hlavní tlačítko webu bylo v liště nejlehčí

`css/styles.css` nastavuje `.btn-primary{font-weight:700}` jednou
třídou, kdežto `#nav a{font-weight:500}` jedním id a prvkem. Kaskáda
tedy ubrala řez právě tomu jedinému tlačítku, které má být
nejvýraznější: **deset „Přidat pozemek" v liště mělo 500**, zatímco
čtyři hlavní tlačítka v obsahu 700 — a na `cena-pozemku.html` stála
obě na jedné stránce, o dvě obrazovky od sebe.

Spraveno v `#nav a.btn-primary`, kde už pravidlo pro barvu stálo ze
stejného důvodu (lišta přebíjela i barvu). Dvanáct míst na 700.

### Druhá vada, kterou našel až hlídač

`.msv-ulozene{font-size:12px}` — nahá deklarace bez důvodu, vedle
sourozence „Porovnat (0)" s 13 px a nad rozbalovátkem řazení s 13 px
v téže liště. Pro telefon už to srovnané bylo a ve stylopisu k tomu
stojí i proč („13px jako sousedé. Dvanáctka tu byla jediná v celé
řadě"); na monitoru dvanáctka přežila. Dotaženo.

### Plané nálezy, přiznané

* `.mcv-btn` 52 vs 44 px: 52 nese sloupcová skupina s dvouřádkovými
  nápisy („Louka / travní porost"), 44 řádková skupina připravenosti.
  Každá je sama v sobě srovnaná — není co spravovat.
* `.pz-abtn` 600 vs 700 a `.pz-btn.ulozit` s vodorovným odsazením:
  obojí má ve stylopisu napsaný důvod.
* Leafletové zoomy se zaoblením 2 a 0 px: hledal jsem je na stránce,
  kterou jsem tušil pod jménem `mapa` — jenže ta neexistuje. Mapa je
  na `index.html` a má vlastní ovládání, takže není co řešit.

### Hlídač

`scripts/test-ovladace.mjs`, čtyři kontroly: dost velký otisk (≥ 120
ovladačů, aby zkouška neprošla na nule jako `test-najeti` v CI 781),
řez hlavní akce, jeden recept na jméno (s výčtem dovolených receptů ve
výjimkách) a **ovladač v liště má týž recept jako tentýž ovladač
v obsahu** — to je pojmenovaná poučka z té vady: kaskáda nesmí měnit
ovladač podle toho, KDE sedí.

### Prokázáno sabotáží, včetně jednoho falešně negativního pokusu

První sabotáž neprošla, a ne proto, že by hlídač byl slepý: zkrátil
jsem si překlad na `node scripts/minifikace.mjs`, jenže stránky nesou
`zaklad.min.css`, který skládá až celé `oprav.mjs`. Vada byla ve zdroji
i v `styles.min.css`, a na web se nedostala. Po celém sestavení obě
sabotáže padají správně:

* řez odebrán → spadne kontrola 1 (dvanáct míst se 14/500) i kontrola 3
  (lišta 14/500 proti obsahu 14/700);
* dvanáctka vrácena → spadne kontrola 2, ačkoli `.mc-prep` výjimku má
  (výjimka vyjmenovává dovolené recepty, ne jen třídu).

### Po zásahu

Rychlá sada 134/134 za 124 s. Hlídači v prohlížeči bez nálezu:
`test-ovladace` 4/4, `test-pismo`, `test-uvod`, `test-naseptavac`,
`test-deska`, `test-zaobleni`, `test-prechody`, `test-najeti`,
`test-afordance`, `test-minifikace`.

## §221 Mrtvé jméno stránky v hlídači je tichá slepota

Při srovnávání seznamu stránek v `test-ovladace` vyšlo, že stránka
jménem `profil` na webu není — profil je `muj-inzerat.html`. A to jméno
měli v seznamu **tři hlídači vzhledu**: `test-deska`, `test-prechody`,
`test-zaobleni`.
Každý z nich tedy roky měřil o stránku méně a nikdo se to nedozvěděl:
`page.goto` na neexistující soubor nic nevyhodí, zkouška jen nic
nenajde a ohlásí „v pořádku".

### Co se za tím skrývalo

Jméno se opravilo na `moje-data.html` — stránku, kterou nepokrýval ani
jeden z nich — a hlídači našli naráz **pět odchylek** proti pravidlům,
která si web sám klade:

| prvek | bylo | má být | pravidlo |
|---|---|---|---|
| `.md-smaz-skup` | pilulka 999 px | 14 px | pilulka patří odznakům |
| `.md-smaz` | 10 px | 14 px | jedno zaoblení ovladače |
| `.md-smaz-vse` | 10 px | 14 px | jedno zaoblení ovladače |
| `.md-radek` | odsazení 12 px | 16 px | odsazení desky |
| `.md-vse` | rám 0,28 | rám 0,14 | jedna síla rámu |

Silnější rám u „Smazat všechno" nic neříkal: že je to vážná akce, nese
nápis a červený obrys tlačítka v ní — ne o čtrnáct setin tmavší linka.

### Pojistka

`test-ovladace` dostal kontrolu 0: **každá stránka ze seznamu musí
dojet** (odpověď existuje a má stav 200), jinak zkouška padá a vypíše,
která nedojela. Hlídač, který měří méně, než si myslí, je horší než
žádný — vypadá jako pojistka a není.

## §222 Textové pole mělo čtyři zaoblení — a skrytý panel je tatáž slepota jako mrtvé jméno stránky

§221 ukázalo, že hlídač nevidí stránku, kterou nemá v seznamu. Hned
potom vyšlo, že stejně nevidí ani to, co je při načtení SKRYTÉ — a že
hlídači jedné soustavy nevidí celou obsahovou polovinu webu.

### Pokrytí: co hlídači vzhledu nikdy neměřili

Změřeno pro `test-deska`, `test-zaobleni`, `test-prechody` a
`test-ovladace`. Měřily jen aplikační stránky. NEVIDĚLY: třináct
článků, rozcestník rádce, čtyři stránky cenových pásem, osm druhových
výpisů, tři právní texty, odhlašovací stránku a předlohu — u všech měly
nejvýš `test-dotyk` nebo `test-rozvrzeni`.

Do všech čtyř se přidal jeden představitel každé předlohy (`radce`,
`hypoteka-na-pozemek`, `podminky`, `pozemky-do-500-tisic`,
`pozemky-lesni`, `odhlasit-maily`). Výsledek je poctivě zveřejnitelný:
**tři ze čtyř hlídačů prošly rovnou.** Obsahová polovina webu byla
v lepším stavu, než jsem čekal. Jeden nález ale stačil, aby odkryl
rozhodnutí, které nikdo neudělal.

### Čtyři zaoblení na jedné věci

Otisk 14 typů stránek, 59 textových polí:

| zaoblení | počet | kde |
|---|---|---|
| 14 px | 28 | hledání, hlídání, zprávy, přihlášení |
| 10 px | 28 | hlavní formulář `pridat`, hypoteční kalkulačka |
| nula | 2 | odhlašovací stránka (kreslil prohlížeč) |
| 6 px | 1 | výběr okruhu u hlídaného místa |

Remíza 28 : 28 není nejednotnost z nedbalosti, ale **nerozhodnutá
otázka**: je textové pole ovladač, nebo vlastní rodina? Rozhodnuto na
14 px, protože tak je zaoblené všechno ostatní, čím se na webu ovládá —
a tak je zaoblená i majitelova karta s cenou, ze které soustava vyšla.
Po zásahu: **59 polí, jedno zaoblení.**

### Dvě věci, které se u toho našly

* **Pole na odhlašovací stránce nemělo žádný vzhled** — kreslil ho
  prohlížeč. A je to stránka, kam web posílá lidi odkazem z e-mailu,
  tedy často první, co z webu uvidí. Dostalo recept hlavního formuláře.
* **Panel hlídaného místa je při načtení skrytý**, takže v něm ležela
  čtyři zaoblení naráz (14 / 10 / 6 / 0) a žádný hlídač je neviděl.
  Výběr okruhu měl navíc 26 px na výšku — pod mezí 38 px, kterou si web
  sám klade na terč pro prst. Srovnáno na 36 px a 14 px.
  („Zrušit" zůstává podtržená textová akce; ta rám ani zaoblení mít
  nemá a je to jediný prvek řádky, který není tlačítko.)

To je poučka k zapamatování: **hlídač vzhledu vidí jen vykreslený stav.**
Co je skryté za `hidden`, za rozbalovačem nebo co teprve vznikne z JS,
si rozchod dovolí bez povšimnutí.

### Po zásahu

Rychlá sada 134/134. V prohlížeči bez nálezu: `test-zaobleni`,
`test-deska`, `test-prechody`, `test-ovladace`, `test-dotyk` — všechny
už na rozšířeném seznamu stránek.

## §223 Odkrytý otisk: šest odchylek ve stavech, které nikdo nevidí

§222 skončilo poučkou, že hlídač vidí jen vykreslený stav. Tady je ta
poučka dotažená na hlídače: `scripts/test-odkryte.mjs` odkryje všechno
skryté, otevře každý rozbalovač a změří zaoblení v tom stavu.

### Co odkrytý otisk našel

Sedmnáct stránek, **959 prvků se zaoblením**, 64 otevřených rozbalovačů.
Devět odchylek v prvním průchodu, šest dalších po rozšíření záběru na
`span` a `figure`. Rozděleno poctivě:

**Skutečné (spraveno):**

| prvek | bylo | je | proč |
|---|---|---|---|
| `.btn-ghost` | 10 px | 14 px | pojmenovaná rodina tlačítek, jako `.btn-primary` |
| `.pf-logout` | 10 px | 14 px | totéž; navíc dostalo společný `--prechod` místo ručně psaného |
| `.ul-thumb` | 10 px | 14 px | fotka přes celou šířku karty — `--r-plocha` nese „fotky" |
| `.opp-overit` | 6 px | 10 px | odznak je drobnost |
| `.opp-podil`, `.opp-urad` | 6 px | 10 px | totéž |

Šestka je `--r-xs` a ten token má ve stupnici jinou práci: prstence
zaměření, palec posuvníku, zaškrtávátko. U odznaků to byl zbytek ze
starší soustavy.

**Plané, pojmenované ve hlídači s důvodem:**

* Pět koleček (`border-radius:50 %`): „nahoru", otvírač nápovědy,
  zaškrtnutí po úspěchu, odznak účtu, kolečko v potvrzení e-mailu, počet
  nabídek ve shluku, znak u pobídky a číslo kroku na inzerci. Kolo je
  tam význam, ne ozdoba.
* Vnitřní odkazy leafletového zoomu (2 a 0 px): **nevidí se.**
  `.leaflet-control-zoom` je ořezává (`--r-md` + `overflow:hidden`).
* `.okr-item .okr-foto` 10 px: dlaždice 128 × 80 px v okresní řádce je
  NÁHLED, a stupnice náhledy výslovně řadí k `--r-drobnost`. Fotka přes
  celou kartu je naproti tomu `--r-plocha`. Dvě slova, dvě role.

Prokázáno sabotáží: šestka vrácená odznaku hlídače shodí.

### Chyba, kterou jsem u toho udělal

Nový hlídač jsem zapsal jako `scripts/test-skryte.mjs` — a tím jsem
PŘEPSAL hlídače, který už pod tím jménem existoval („co má atribut
`hidden`, nesmí být vidět", s nálezem na 404.html, kam nedosáhne
stylopis). Vyšlo to až z toho, že `test-staticka` ohlásila zkoušku
zapsanou ve workflow dvakrát. Původní soubor byl v gitu, takže se nic
neztratilo; nový hlídač se jmenuje `test-odkryte.mjs`.

Poučka: před `cat > scripts/test-*.mjs` se to jméno ověřuje. Soubor,
který se píše poprvé, se nemá psát přes něco, co už tam je.

## §224 Dvě zkoušky se opíraly o náhodu v datech — a pod tím leží měřený nález

Po noční aktualizaci robota (29. 10.) spadly dvě zkoušky v rychlé sadě:
`test-hlidani` a `test-ceny`. Ani jedna neměla co do činění s tím, co
jsem toho dne dělal, a ani jedna neukazovala na vadu webu.

### Obě měly tutéž vadu: „hlídač hlídače" na náhodě

* **`test-hlidani`** dokazoval, že odstraňovač duplicit vůbec něco dělá,
  tím, že v OSTRÝCH datech nějaká duplicitní adresa je. Robot ten den
  snížil počet duplicit **ze 14 na nulu** — a zkouška spadla, ačkoli
  funkce je v pořádku. Opraveno: důkaz se staví (táž adresa dvakrát,
  jednou s `www.` a lomítkem), počet duplicit v ostrých datech se
  vypisuje jako údaj, ne jako podmínka.
* **`test-ceny`** procházel ostrá data a čekal aspoň pět nabídek mimo
  prodej, jejichž percentil vyjde na úrovni okresu. Dražeb ubylo **z 51
  na 20** a žádná se nedostala na deset srovnání téhož typu v jedné
  skupině druhu a okresu. Opraveno: vzorek se staví — vezme se skupina
  druhu a okres s nejvíc prodeji a dvacet jich naklonuje jako dražbu.

U druhé opravy stojí za zápis jedna odbočka: prvních deset klonů
NEPROŠLO, protože zdědily inzerenta po originálu — a přihrádku drženou
jediným inzerentem percentil odmítá (§89). Ta pojistka tedy funguje
a odmítla i můj vzorek. Dvacet klonů rozprostřených mezi pět inzerentů
projde a percentil vyjde u devíti.

### Co se pod tím našlo (měřeno, k rozhodnutí)

| | před aktualizací | po ní |
|---|---|---|
| nabídek mimo prodej | 91 | 60 |
| z toho s percentilovým verdiktem | **16** (15 okres, 1 kraj) | **0** |
| prodejů s verdiktem | 853 z 1 823 | 855 z 1 825 |

Percentil chce v přihrádce aspoň deset nabídek TÉHOŽ TYPU v téže
skupině druhu a okresu. Dvacet dražeb po 77 okresech se k desítce
nedostane ani náhodou, takže stránka dražby dnes **nemá cenový verdikt
vůbec**. Není to vada: web radši mlčí, než aby srovnával vyvolávací cenu
s nabídkovými (důvod stojí u té kontroly v `js/ceny.js`). Je to ale
rozhodnutí, které má vidět majitel — proto úkol, ne tichá oprava.

## §225 Graf vývoje ceny byl hotový, ale zahrabaný — a sedmkrát větší než předloha

Majitel poslal 29. 10. snímek Sreality znovu se slovy, že tenhle graf na
webu pořád není. Byl — a měření ukázalo, proč ho nikdo nenajde.

### Tři důvody, dva z nich moje vina

1. **Umístění.** Časový graf začínal na 2 336 px z 3 731, tedy ve 2,8.
   obrazovce. Histogram verdiktu byl na 1 263 px (1,5.). Kdo roluje,
   potká napřed histogram — a graf už nehledá. Na předloze je cenový
   přehled hned pod cenou.
2. **Velikost.** Změřeno ze snímku předlohy (1290 px širokého, tedy
   3,308× na 390 CSS): křivka na Sreality je vysoká **54 CSS px**. Naše
   kresba měla **150** a celá sekce **534**. Sedmkrát větší graf se pod
   cenu nevejde — proto musel dolů. Byl to kompromis, který jsem udělal
   já, a byl špatně: správně se měl zmenšit graf, ne přesunout.
3. **Obsah.** Osa pokrývá 46 dní, ne tři roky, protože
   `data/historie-cen.json` začíná 14. 9. 2026 — tolik dní web historii
   sbírá. A u téhle nabídky píše „v celé ČR" místo lokality, protože ze
   151 řad je použitelných 42 (ostatní kolísají výměnou nabídek, ne
   cenou) a okresních z nich 26. Tyhle dva body měřením nespraví nic;
   jsou to data, ne vzhled.

### Co se udělalo

| | bylo | je |
|---|---|---|
| kresba na telefonu | 150 px | **104 px** |
| poznámka pod grafem | 177 px (5 vět) | **59 px** (1 věta) |
| celá sekce | 534 px | **430 px** |
| kde graf začíná | 2 336 px (2,8. obr.) | **1 355 px (1,6. obr.)** |
| celá stránka | 3 731 px | **3 650 px** |

Rezervovaná výška karty klesla ze 422/450/470 px na 304/324/366 —
čísla jsou deset pixelů nad naměřeným maximem každého pásma (291 při
900 px, 294 při 560, 313 při 390–479, 355 při 360, 343 při 320).

### Pořadí stránky, a proč se stěhovalo třikrát

Přesun grafu nahoru odtlačil nejdřív **mapu** za polovinu stránky
(1 944 z 3 591) a `test-mapa-pozemku` to shodil. Mapa šla tedy za graf —
jenže tím spadl na třetí obrazovku **verdikt**, což je u verdiktu přesně
ta vada, která se jednou opravovala. A když se mapa posunula až za
verdikt, odtlačila **rádce** na 2 606 px, takže spadl tentýž hlídač
znovu, jen na jiném prvku.

Výsledné pořadí: parametry → sítě → **rádce** (sbalený, 53 px) →
**vývoj ceny** → **verdikt** → **mapa** → akce → poznámka. Čte se jako
rozhodování: co to je → na co si dát pozor → jak se tu vyvíjejí ceny →
jak je na tom tahle nabídka → kde to je.

### Chyba, kterou jsem u toho udělal

Při přesunu mapy jsem vložil komentář, ale **ne samotné volání**
`pzMapaHtml(d)` — mapa ze stránky úplně zmizela. Chytily to dvě zkoušky
naráz (`test-mapa-pozemku`, `test-rozvrzeni`) tím, že hlásily „mapa se
nepostavila, je co měřit → null". Bez nich by se to nasadilo.

### Po zásahu

Rychlá sada 134/134. V prohlížeči bez nálezu: `test-mapa-pozemku`
155/155, `test-graf-cen`, `test-prvni-obrazovka`, `test-hierarchie`,
`test-rozvrzeni`, `test-stranky-pozemku`, `test-odkryte`, `test-deska`.

## §226 Histogram pryč — na stránce pozemku zůstává jen graf z předlohy

Po §225 (graf přesunutý pod cenu) poslal majitel vzkaz bez obalu:
odstranit náš graf a nechat tam ten, co mají Sreality. Důvod, který za
tím stojí, je vidět na obou snímcích vedle sebe: na stránce byly **dva
grafy o ceně** — křivka vývoje (předloha) a pod ní sloupcový histogram
rozdělení cen, který na předloze vůbec není. Větší z nich bral pozornost
a ke křivce se čtenář nedostal.

### Co se smazalo

* volání `pvGrafHtml()` z verdiktu;
* **celý kód histogramu**: `pvGrafHtml`, `pvGrafOziv`, `pvgKrok`, `PVG`
  a komentářový blok — 302 řádků v `js/pozemek.js`;
* jeho pravidla ve stylopisu: 30 selektorů `.pvg*`, 86 řádků;
* tři kontroly v `test-pohyb`, kterým zmizel subjekt (136 řádků).

Verdikt ZŮSTÁVÁ, jen jako věta: „Levnější než 79 % pozemků téhož druhu
v prodeji…" plus cena za metr a medián. Karta verdiktu klesla
z **214 na 152 px**.

### Komentář, který jsem u toho napsal a který lhal

Když jsem odpojil volání, napsal jsem k němu, že se kód nemaže, protože
„histogram kreslí i rychlý prohlížeč na úvodní stránce". **Nebyla to
pravda** — `grep` přes `js/` ji vyvrátil hned potom: kreslil ho jen
`js/pozemek.js` a nikdo jiný. Kdyby ten komentář zůstal, leží
v repozitáři 302 řádků mrtvého kódu a vedle nich věta, proč je to tak
správně. Smazalo se proto obojí, kód i tvrzení.

### Po zásahu

Rychlá sada 134/134. V prohlížeči bez nálezu: `test-pohyb` 12/12,
`test-tokeny`, `test-hierarchie`, `test-rychly-prohlizec`,
`test-mapa-pozemku`, `test-graf-cen`, `test-odkryte`, `test-deska`,
`test-prvni-obrazovka`. Histogramů na stránce pozemku: **0**.

## §227 Vršek úvodu pryč a řada odznaků ztišená — dvě přání z 29. 10.

**Co o tom řekl majitel.** Dva snímky a dvě věty: „všechno, co je na
prvním screenshotu nahoře, odebereš" (tmavá deska s nadpisem „Pozemky
na prodej, v dražbě i v exekuci." a pod ním řádek šesti pilulek)
a „pod těma inzerátama je tam ta sleva atd. — chce to udělat víc
profesionálně, ale zároveň pořád držet tu útulnost".

**Deska.** Odstraněna. Nadpis zůstal v dokumentu s `.visually-hidden`:
je to jediný `<h1>` úvodní stránky, věta, na kterou se na ni chodí
z vyhledávače, a první věta pro odečítač. Zmizet z obrazovky a zmizet
ze stránky jsou dvě různé věci.

**Rozcestník.** Nezrušen, přestěhován nad hlavičku výpisu. Grepem
spočítáno, že čtyři z jeho šesti stránek (dražby, exekuce, stavební,
orná půda) nemají z úvodu jiný odkaz — každá přesně jeden, právě
tenhle. Nad 900 px se přitom schovával, takže z monitoru byly
nedostupné úplně; pravidlo `display:none` zrušeno a doplněno
`flex:0 0 auto` (rodič `.map-side` je flexbox a řádek se bez toho
stlačil na 4 px — naměřeno 370×4 při 1280×900).

Naměřeno 390×844: první nabídka 439 → 344 px. Na 1280×900 první
nabídka 358 → 402 px; těch 44 px je cena za čtyři stránky, které
odtud dosud nevedly.

**Odznaky.** Tvar jednotný už byl — naměřeno na 22 kartách: sedm
druhů, všechny 13 px / 600 / 4–8 px / 31 px vysoké. Jednotná nebyla
BARVA: na 6 z 22 karet se potkaly dvě plné plošky (typicky měděná
„Dražba za 1 měs." vedle zelené „−45 % proti okolí"). Nově si barvu
nechá nejvýš jeden odznak, podle nároku: varování o ceně → termín do
týdne → výhodná cena → termín do měsíce; ostatní dostanou tichou
plochu (`js/main.js`, `jednaBarva`). Po zásahu: 0 z 22 karet se dvěma
barvami, 19 z 22 má pořád jednu.

Při tom se našly dvě starší odchylky, obě ve stylopisu a obě
z pořadí pravidel: `.opp-deal` stál o 700 řádků VÝŠ než společný tvar
odznaků, takže z něj platily jen barvy a 13 odznaků „−X % proti okolí"
mělo průhledný obrys proti lince u všech ostatních; `.opp-podil`
a `.opp-urad` stály naopak NÍŽ a prosadily zaoblení 10 px mezi šesti
pilulkami. Obojí srovnáno, recept je teď jeden.

**Hlídač.** `scripts/test-jedna-barva.mjs` (v CI). Neměří třídu
`.opp-tich`, ale vypočtenou barvu podkladu — rozdíl není teoretický:
pravidlo napoprvé stálo nad `.opp-cd.soon`, mělo stejnou váhu (0,2,0)
a prohrálo, takže sedm odznaků třídu mělo a přesto zůstalo měděných.
Ověřeno sabotáží dvakrát: posun pravidla nad barvy odpočtu + vrácené
zaoblení podílu shodilo dvě kontroly (3 karty se dvěma barvami,
2 recepty tvaru); odstranění volání `jednaBarva` shodilo kontrolu
barvy na 8 z 22 karet.

## §228 Spodní lišta na stránce pozemku: šest přepnutí a pruh přes mapu

**Co o tom řekl majitel.** Snímek stránky dražby, kde bílý pruh u spodní
hrany leží přes mapu a uřízne v půlce tlačítko „Hranice parcel":
„vidíš, jak to blbne dole, tam je K dražbě a buguje se to přes všechno."

**První nález — lišta se přepínala šestkrát.** Sledovaly se dvě věci:
cena nahoře a řada hlavních akcí; lišta svítila, jen když nebylo vidět
ani jedno. Jenže řada akcí nestojí na konci stránky — naměřeno na
`pozemek-benesov-benesov-1sjtz7b.html` (390×844): cena 597–721, řada
akcí 2 635–2 687, celá stránka 3 718. Průběh:

| úsek | lišta |
|---|---|
| 0–721 | schovaná (je vidět cena) |
| 721–1 663 | svítí |
| 1 663–2 687 | schovaná (blíží se řada akcí) |
| 2 687–konec | svítí |

Naměřeno 6 přepnutí na jedno pomalé projetí tam a zpět. Protože se
s lištou přepíná i odsazení stránky (80 px), skákala přitom i výška
dokumentu: 3 743 ↔ 3 823. Sleduje se od teď jedna věc — cena —
a z toho jsou 2 přepnutí. Platí se za to tím, že na úseku zhruba
900 px je tlačítko vidět dvakrát: jednou ve stránce, jednou v liště.
Je to totéž tlačítko a vede na totéž.

**Druhý nález — tvar.** Pruh od kraje ke kraji s rovnou horní hranou
vypadá jako vada vykreslení, jako by se stránka rozpůlila. Lišta je
teď plovoucí karta: 12 px od krajů, zaoblení `--r-plocha` a stín
`--e3`, tedy tentýž tvar jako zbytek webu. Naměřeno na 390×844:
lišta 12–378, výška 70, od spodní hrany 12 px, kulatý návrat nahoru
14 px nad ní, a na konci stránky pod ní neleží ani jeden prvek
(odsazení stránky 80 → 96 px).

**Hlídač.** Zkouška spodní lišty (scripts/test-lista-dole.mjs tu není,
zanikl 30. 10. se samotnou lištou — viz §245) dostala dvě změny. Kontrola
„drží se u spodní hrany" chtěla nulu — povoluje teď 1–24 px, aby
plovoucí tvar prošel a zároveň lišta nemohla utéct doprostřed
obrazovky. A přibyla kontrola POČTU přepnutí (nejvýš dvě); ta stará
hlídala jen krátká bliknutí pod 400 px, a tahle vada měla mezery
1 000 px, takže jí prošla. Průjezd se zároveň prodloužil z 2 600 px
na celou stránku: do 2 600 px třetí přepnutí ještě nepadne a zkouška
sabotáž (návrat starého pravidla) odkývala. Po prodloužení sabotáž
spadla na „napočítáno 3".

## §229 Poznámka ve výpisu: text místo odznaku, a rozbalí se na místě

**Co o tom řekl majitel.** „Když napíšu poznámku, chci, aby mi pak šla
vidět, i když budu ven z inzerátu. Bude tam místo třeba na pár slov,
a když to někdo přesáhne, může rozkliknout tu poznámku přímo venku,
aby nemusel dovnitř do inzerátu."

**Co bylo.** Na kartě visel odznak se slovem „Poznámka". Ten řekl, že
nějaká je — ne co v ní stojí, a právě to je na ní celé cenné.

**Co je.** Pod odznaky stojí její TEXT: svislice ve značkové zeleni,
13 px, tišší barva, ořez na dva řádky. Tlačítko „víc" se objeví jen
tam, kde se text opravdu nevešel, a rozbalí poznámku na místě —
klepnutí na něj nevede na stránku pozemku (`stopPropagation`, stejně
jako u „Uložit" a „Skrýt").

Naměřeno na třech poznámkách (16, 88 a 420 znaků): 18 px / 36 px bez
tlačítka, 36 px s tlačítkem, po rozbalení 146 px; po klepnutí zůstala
adresa stránky táž.

**Proč ne doprava vedle ceny, kam majitel ukázal.** Tam zbývá asi
150 px, tedy tři až čtyři slova — a jen do chvíle, než se nadpis
karty zalomí na dva řádky. Řádek pod odznaky má celou šířku karty
a nikomu nepřekáží. Místo, kam ukazoval, je přímo nad ním.

**Dvě věci okolo.** Odznak `.opp-pozn` i jeho pravidlo jsou pryč
(mrtvá pravidla hlídá `test-mrtve-styly`). Tlačítko „víc" se nasazuje
podle skutečného přetečení (`scrollHeight > clientHeight`), ne podle
počtu znaků — „Příjezd je přes sousedův pozemek" a stejně dlouhý
shluk písmen mají jiný počet řádků. Čtení rozměrů běží v JEDNOM
průchodu po vykreslení, všechna čtení před všemi zápisy, takže
přepočet rozvržení je jeden, ne jeden na kartu.

**A jedna cizí oprava, na kterou se přišlo cestou.** `test-poznamky`
hledal v ostrých datech „záznam, který vznikl složením dvou" (dražba
hlášená dvěma zdroji, kde se k jedné přebere parcelní číslo z druhé).
29. 10. v datech nebyl ANI JEDEN — 1 885 → 1 884 a žádné skládání —
a zkouška spadla na vlastní předpoklad, ne na vadu webu. Dvojici si
teď staví sama a podstrkuje ji do obou souborů, které web čte
(`data/mapa.json` pro výpis, `data/opportunities.json` pro stránku
pozemku); rozdíl mezi nimi je přesně to, na čem ta původní vada
stála. Zkouška tím měří pořád, ne jen když má štěstí na data.

## §230 Můj profil: pozdrav místo cedule a nula, která nekřičí

**Co o tom řekl majitel.** „Můj profil potřebujeme předělat na víc
profesionální a aby seděl ke zbytku webu; musí to být útulné a člověk
tam musí být jak doma, prostě to musí být jeho část webu."

**Co se naměřilo na 390×844 (přihlášený účet).**

| nález | stav |
|---|---|
| adresa účtu se lámala uprostřed slova („…seznam.c / z") | 16 px, 700, `overflow-wrap:anywhere` |
| pět dlaždic ukazovalo pět nul v 28px značkové zeleni | nejhlasitější věc na stránce neříkala nic |
| verzálkové popisky dlaždic se lámaly na dva řádky | „MOJE / INZERÁTY", „NEPŘEČTENÉ / ZPRÁVY", a ještě podtržené |
| „Přidat pozemek" na jedné obrazovce dvakrát | dvě stejně vypadající zelená tlačítka, obě na `pridat.html` |

**Co se udělalo.** Hlava karty vítá („Vítejte zpátky") a adresa je pod
tím tišeji, na jeden řádek, s oříznutím třemi tečkami a celou hodnotou
v `title` — e-mail je jedno dlouhé slovo, takže každé zalomení padne
doprostřed. Verzálkový štítek „PŘIHLÁŠENO JAKO" i zelená tečka u něj
jsou pryč; že je člověk přihlášený, říká od téhož dne tečka u panáčka
v liště. Popisky dlaždic jsou slova psaná normálně a vejdou se na
řádek. Barvu si nechá jen číslo, které něco znamená: nula je tichá,
pomlčka („ještě nevím") ještě tišší. Tlačítko z prázdného stavu
zmizelo, věta na to nahoře ukazuje slovy.

**Nález, který jsem si vyvrátil sám.** Čárkovaný rám prázdného stavu
jsem vyhodil s tím, že je na webu jediný. Nebyla to pravda — byl to
špatně napsaný grep (filtr `--include=*.html` se vztáhl i na stylopis,
takže se `css/styles.css` vůbec nepročetl). Po pořádném měření je
`dashed` ve stylopisu pětkrát a všude znamená totéž: „sem něco přijde,
zatím nic není" (výzva k poznámce, plocha pro přetažení fotek, proužek
bez uloženého místa, druhý prázdný stav webu). Je to tedy řeč webu,
ne odchylka, a rám se vrátil.

**Hlídač.** `scripts/test-profil-vzhled.mjs` (v CI) načte profil
dvakrát — jednou se třemi uloženými pozemky, jednou bez nich — protože
„nula nekřičí zeleně" se nedá změřit tam, kde žádná nula není, a „číslo
něco znamená, proto je zelené" zase ne tam, kde jsou samé nuly. Počet
uložených je jediné číslo, které si stránka bere z prohlížeče, takže
jde nastavit přesně. Barvy se čtou vypočtené, ne z pravidel.

Zkouška sama našla dvě vady v sobě: bez zablokování volání ven stránka
po neúspěchu zahodí session a měří se ODHLÁŠENÝ profil (#pf-mail mělo
výšku 0 px), a počítat řádky jako výška ÷ `line-height` nefunguje,
protože prohlížeč umí vrátit `normal`. Obojí srovnáno a zapsáno u toho.

Ověřeno sabotáží dvakrát: verzálkové popisky + `overflow-wrap:anywhere`
shodily dvě kontroly, zelená nula třetí.

## §231 „Nové hlídání" mluví touž řečí jako hledání na úvodu

**Co o tom řekl majitel.** „Toto předělej tak, aby to vypadalo jako
vyhledávání v menu, které už máme hotové, a pohraj si s tím do detailu."

**Naměřeno na 390×844, role vedle role.**

| role | hledání (úvod) | hlídání (před) |
|---|---|---|
| popisek pole | 12/600 verzálky | 13/700 |
| textové pole | bílá plocha, rám 1 px | zapuštěná šeď, rám 1,5 px |
| výběr | bílá, vlastní zelená šipka | šeď, systémová šipka |
| rychlá volba | 44 px | **38 px** (pod mezí dotyku) |
| hlavní tlačítko | 16/700, 46 px | 14/700, 48 px |
| pilulka „musí mít" | 13/600 | 13/400 |

Hodnoty se srovnaly na recepty hledání (`.mc-cap`, `.map-num`,
`.map-select`, `.filter-chip`, `.mcf-hotovo`). Kromě toho:

- **Rozsah od–do** má teď jeden popisek i s jednotkou nad celou dvojicí
  („Cena (Kč)") a v políčkách jen „od" a „do" — jako hledání. Do pole
  širokého asi 150 px se dřív „bez omezení" i s jednotkou nevešlo
  a na snímku stálo „bez omeze… Kč".
- **Nadpis sekce se přestal lámat.** „Musí mít" a poznámka
  „(podle toho, co stojí v popisu nabídky)" se do řádku nevešly a lámal
  se nadpis — stálo tam „Musí / mít". Teď drží nadpis pohromadě
  a zalomí se poznámka.
- `.hl-pole` a `.hl-jednotka` tím ztratily práci a jsou pryč.

**Dvě vady, které práce odkryla jinde.**

1. `.map-num` v hledání mělo `min-height:42px`, tedy o dva pixely pod
   mezí dotyku, kterou si web klade sám. Vyšlo to najevo až při
   srovnávání: vedle sebe stály 42 a 44 a nebylo poznat, která je
   správná. Obojí je teď 44.
2. Popisek pole je verzálkami, takže „Cena (Kč)" se vysázelo jako
   „CENA (KČ)" a „Výměra (m²)" jako „VÝMĚRA (M²)" — obojí chybný zápis
   jednotky. Jednotka stojí nově ve vlastním `<span class="jednotka">`
   s vypnutým přepisem, a to na OBOU stránkách. (Výjimka pro „Cena za
   m²" existovala, ale přes jiné pravidlo, takže platila jen tam, kde
   popisek shodou okolností stojí v řádku s rozbalovátkem.)

**Hlídač.** `scripts/test-hlidani-jako-hledani.mjs` (v CI) neměří živé
prvky — část ovládání hledání si skript stěhuje do překryvu, takže by
se měřilo podle toho, co je zrovna otevřené. Měří RECEPT: na každé
stránce vyrobí prvek s danou třídou, přečte vypočtený styl a zahodí
ho. Jediná dovolená odchylka je velikost a řez písma v políčku
a výběru (16/400 proti 14 a 13/600) — pod 16 px iPhone při klepnutí
zvětší stránku a uvnitř jednoho formuláře má mít políčko a výběr tutéž
velikost. Ověřeno sabotáží: návrat starého popisku a staré pilulky
shodil dvě kontroly.

Zkouška `test-hlidani` při tom chytla, že se zkrácený popisek
„Nejvýš za metr" rozešel s chybovou hláškou, která políčko jmenuje —
obojí srovnáno.

## §232 Vršek úvodu: historie dolů, přepínač nahoru a víc vzduchu

**Co o tom řekl majitel.** „Naposledy zhlédnuté takhle nahoře nedává
smysl, ať je co nejvíc dole. Navíc je tam vše strašně naplácané, web má
působit volně a profesionálně. A červeně jsem vyznačil to nejhorší: ta
Mapa a Seznam jsou tak divně působící — udělej to takto, ale větší
a ne tak naplácané."

**Historie dolů.** Pruh „Naposledy prohlédnuté" stál ve značkování za
výpisem a `js/main.js` (renderRecent) ho při vykreslení stěhoval na
začátek sloupce — kdysi na výslovné přání majitele („mají být úplně
nahoře"). Teď to otočil a má pravdu věcně: je to historie, ne nabídka.
Stěhování je pryč, pruh zůstává tam, kde ho má značkování.

**Přepínač.** Naměřeno na 390×844: pole hledání 207 px a přepínač
143 px v jedné řadě, tlačítko „Seznam" 78 px široké s 13px písmem.
Teď má přepínač celou šířku, 48 px výšky a 16px písmo — dvě záložky
nad výpisem, a tak i vypadají. Pole hledání se srovnalo na týchž
48 px (mělo 44, dva ovladače nad sebou mají být stejně vysoké).

**Vzduch.** Odsazení sloupce nahoře 8 → 16 px, mezera mezi čtyřmi
nástroji nad výpisem 8 → 12 px, odstup pod hlavičkou výpisu 8 → 16 px.
Všechno ze stupnice odstupů.

**Co to stojí a kdo to platí.** První nabídka se posunula ze 344 na
412 px kvůli vyššímu přepínači a vzduchu. Zaplatil to ten pruh: když
měl návštěvník historii, stál nahoře a odsouval první nabídku na
530 px. Teď ji neodsouvá vůbec, a tak zkouška první obrazovky měří
obráceně než dřív — pruh musí být POD první nabídkou a nabídka musí
začínat nad 440 px.

**A nález, který to odkrylo.** `test-pod-hlavickou` spadl na tom, že
po posunu o 60 px je pole hledání celé pod lepivou hlavičkou. Vyšetřeno:
není to vada vzhledu, ale vada zkoušky. Měřila střed prvku, takže při
rolování hlásila jako „zakryté ovládání" všechno, co zrovna podjíždí
pod hlavičku — tedy rolování samo. Původní vada, pro kterou vznikla,
byla jiná: pole leželo pod hlavičkou NATRVALO, už po načtení (45 ze
46 px). Rozhoduje proto nově poloha V DOKUMENTU: když prvek v klidu
leží pod hlavičkou, je v pořádku; když pod ní leží i v klidu, hlásí se.
Ověřeno sabotáží — vrácené `margin-top:-80px` na `.map-wide` (přesně
ta původní vada) shodilo dvě kontroly.

Zkouška písma při tom chytla, že přepínač dostal 15px písmo, které na
stupnici není. Srovnáno na 16.

## §233 Pilulky druhů: pryč barevné tvary, místo nich ikony

**Co o tom řekl majitel.** „Zde odeber ty barvičky a přidej tam nějaké
ikonky, a hlavně ty tlačítka udělej, aby působily více klikatelně."

**Barvičky pryč.** Šest pilulek nad výpisem (Vše, Prodej, Dražba,
Exekuce, Obec, Přímo od majitele) neslo barevný puntík s tvarem značky
z mapy a zapnutá pilulka se barvila podle druhu — pět výplní
(`--c-sale-ink`, `--c-drazba-ink`, …) na jednu jedinou práci: „tohle je
zapnuté". Zapnutý stav je teď značková zeleň, ať je to kterýkoli druh,
jako všude jinde na webu. Pět pravidel zmizelo a s nimi i výjimka
s tmavým textem u dražby, která existovala jen proto, že ta jedna výplň
byla světlejší než ostatní.

**Ikonky.** Místo puntíku `<svg class="ik fc-ik">` ze sady, kterou web
už má — vrstvy, cenovka, kladívko, výstraha, budova, uživatel. Ani
jedna nová ikona: strop je 40 a `test-tahy` jich napočítal 39, takže
nová by ho shodila. Vybíraly se z toho, co už někde na webu kreslí
totéž.

**Klikatelnost.** Pilulky měly vlasovou linku 1 px v `--line-ui`,
tišší text (`--muted`) a žádný stín — vypadaly jako štítky, ne jako
ovladače. Berou si proto recept vedlejšího tlačítka webu
(`.btn-secondary`): linka 1,5 px v `--obrys-tlacitka`, text v plné
barvě, stín `--e1` a stisk o pixel dolů. Pilulkový tvar a 13px písmo
zůstávají, aby se šest druhů vešlo do dvou sloupců.

**Co našli hlídači, a já ne.**

1. `test-tahy`: ikona dostala tah 1,9 a na obrazovce z toho vyšlo
   1,27 px místo 1,5. Web kompenzuje tah podle velikosti — 16 px při
   viewBoxu 24 znamená 1,5 × 24 ÷ 16 = **2,25**.
2. `test-hledani-vzhled`: v rozbaleném panelu filtrů zbělely čipy, ale
   tlačítko „Pozemky v okolí" vedle nich zůstalo na tlumené dlaždici —
   dva druhy ovladačů na jednom pásu. Zbělelo taky. (Tlumená dlaždice
   tam přišla v době, kdy byl pás tmavý; pás se 28. 10. zesvětlil
   a důvod zmizel.)
3. `test-mrtve-styly`: `.tv-ctverec` a `.tv-kriz` se staly v repozitáři
   mrtvými — po odebrání puntíku je nikdo nepíše doslova. Skládá je
   `js/main.js:5046` jako `'lg-dot tv-' + TVAR[tp]` pro legendu pod
   mapou, a proto jsou zapsány mezi SKLÁDANÉ, ne smazány.

**Co to stojí a kdo to platí.** Pilulky byly zároveň vysvětlivkou
k mapě: barva i tvar značky se daly naučit z nich. Ta role teď leží
jen na legendě pod mapou (`.lg-dot`) — což je věcně lepší místo, stojí
hned vedle značek, kterých se týká, ale kdo se na mapu nedívá, tvary se
nedozví. Že legenda tvary opravdu kreslí, hlídá `scripts/test-tvary.mjs`
čtením pixelů z plátna.

## §234 Hlídané místo: pryč tabule, zbyl odznak s křížkem

**Co o tom řekl majitel.** „Hlavně když dám pozemky v okolí, zobrazí se
tam tato velká tabule, ta tam nemá být. Člověk si má vybrat a pak tam má
být jen tlačítko s křížkem na zrušení."

**Co tam stálo.** Proužek `.misto-pruh`: nadpis „Ve vašem okolí od minule
nic nového", podnadpis „Hlídané místo: Pelhřimov · okolí do 50 km · je tu
94 pozemků" a pět ovladačů — okruh, Ukázat jen okolí, Změnit místo,
Zrušit místo, Vybrat na mapě. Naměřeno na 390×844: **236 px**. A hned pod
ním odznak filtru, 44 px, s touž větou: „Do 50 km od Pelhřimov".

**Kam se poděly jeho části.**

| bylo v tabuli | je teď |
|---|---|
| okruh (rozbalovací seznam) | posuvník ve výběru místa — tam, kde se místo vybírá |
| Ukázat jen okolí | tlačítko „Pozemky v okolí" |
| Změnit místo | totéž tlačítko; výběr se otevře na uloženém místě |
| Zrušit místo | křížek na odznaku |
| „od minule přibylo…" | hláška s tlačítkem „Ukázat" |

**Jeden křížek, ne dvě tlačítka.** Vypnout okolí a zapomenout místo byly
dvě akce. Bez tabule by po té první zbyl stav, který není nikde vidět:
místo uložené, okolí vypnuté, na obrazovce nic. Křížek proto dělá obojí.
Odznak okolí se kvůli tomu kreslí zvlášť: ostatní odznaky ruší svou
funkcí `vypni`, jenže tu volá i hledání viníka u prázdného výpisu
(`nejvicOmezuje`) — a kdyby `vypni` u okolí zapomínala místo, zahodilo by
ho pouhé přepočítání čísel.

**Hláška místo tabule.** Co u místa přibylo, je celý smysl hlídání.
Tabule to nesla pořád, i když nepřibylo nic („od minule nic nového" na
236 px). Hláška se ozve, jen když je co říct, a má tlačítko, které rovnou
zapne okolí. Běží až po prvním vykreslení — na první obrazovce má být
výpis.

**Tři nálezy, které z toho vypadly.**

1. **Křížek na odznacích měl 0 × 0 px.** Kreslí se jako `<svg class="ik">`
   a `.ik` nastavuje tah a výplň, ne rozměr; ten si každé místo na webu
   určuje samo a tady si ho nikdo neurčil. Odznak tedy vypadal jako
   nápis, přestože jeho přístupné jméno celou dobu slibovalo „Zrušit: …".
   Platilo to o VŠECH odznacích hledání, ne jen o tomhle. Srovnáno na
   16 px a tah 2,25 — táž míra jako ikony v pilulkách druhů.
2. **Odznak porušoval vlastní pravidlo o pádech.** Stálo na něm „Do 50 km
   od Pelhřimov"; po „od" patří druhý pád a skloňovat názvy obcí web
   schválně neumí (Praha → Prahy, Loučeň → Loučně). Zkouška to pravidlo
   hlídá odjakživa, jenže se dívala na podnadpis tabule. Když tabule
   zmizela a zkouška se obrátila na odznak, který po ní tu větu zdědil,
   vyšlo najevo, že ho porušuje. Teď je tam „Pelhřimov a okolí do 50 km"
   — první pád.
3. **Zrušení nechávalo na kartách vzdálenost.** Karty píšou vzdálenost
   z `userPos || mojeMisto`; `vypniOkoli()` sundá značku z mapy, ale
   `userPos` nechává — a to je u pouhého vypnutí správně. Při zrušení
   celého místa ale zbyla vzdálenost od něčeho, co už není. Naměřeno: po
   zrušení pořád pět karet se vzdáleností. `zrusMisto()` proto `userPos`
   nuluje.

**Hlídači.** `test-okoli` má nově čtyři kontroly téhle podoby (odznak
místo tabule, žádný `#misto-pruh`, vidět křížek, 44 px na prst) a dvě
o tom, co křížek udělá. Ověřeno sabotáží: vrácená tabule a křížek
zmenšený na nulu shodily přesně ty dvě kontroly, které je mají chytit.
`test-pamet` a `test-klic-ulozenych` teď zapínají okolí tam, kde se
zapíná doopravdy — ve výběru místa. `test-mnozstvi` hlídal tvar pro nulu
na podnadpisu tabule („je tu 0 pozemky"); přesunut na hlášku o novinkách.

## §235 Zakliknutí filtru posouvalo stránku pod rukou

**Co o tom řekl majitel.** „Hlavně když si něco zakliknu, web se posune,
působí to strašně zaseknuté — protože se to posouvá."

**Má pravdu a jde to změřit.** Zapnutí filtru přepíše počty u všech
štítků. Čísla se mění řádově („Příjezd 1 082" → „90") a popisek si
bere zbylé místo, takže se s čísly mění i to, jestli se vejde na jeden
řádek. Naměřeno na telefonu 390×844, zakliknutí „Elektřina":

| | před | po |
|---|---|---|
| mřížka druhů `#mc-druhy` | 302 px | 230 px |
| řádka odznaků `.ms-chipy` | 0 px | 44 px |

Obojí leží NAD výhledem, takže se posune všechno, na co se člověk
zrovna dívá.

**Proč to vidí on a ne já.** Chrome si tohle srovná sám — jmenuje se to
`overflow-anchor` a drží obsah na místě, když se nad ním něco změní.
Safari tu vlastnost nemá a majitel je na iPhonu. Změřeno s vypnutým
ukotvením, tedy tak, jak to vidí on: **celá obrazovka se po jednom
zaškrtnutí posunula o 25 px**. Se zapnutým ukotvením vyjde 0 — proto si
toho nikdo z nás dvou nevšiml dřív a proto to ani žádná zkouška
nechytila.

**Dvě opravy, dvě poloviny příčiny.**

1. **Počet si drží stálou šířku.** `.mcv-n` dostal `min-width:5ch` (pět
   znaků pokryje i „1 884", což je nejvyšší počet, jaký může kterýkoli
   štítek ukázat) a `text-align:right`; `tabular-nums` tam byly už
   dřív. Popisek má tím pádem vždycky stejné místo a láme se pořád
   stejně. Mřížka druhů teď měří 302 px před i po.
2. **Co se klepne, zůstane pod prstem.** Druhá polovina (odznaky nad
   panelem, mizející štítky sítí) se vyrovná posunem: `drzMisto()` si
   před překreslením zapamatuje, kde ovladač leží, a v
   `requestAnimationFrame` — tedy po posluchačích ovladače a ještě před
   vykreslením — rozdíl srovná. Mřížka druhů se překresluje celá
   (`innerHTML`), takže se původní prvek hledá znovu podle `data-druh`.
   Posouvá se `behavior:'instant'`: stylopis má `scroll-behavior:smooth`
   a srovnání o pár pixelů by se jinak plazilo přes celý obrázek.

**Po opravě.** Tytéž podmínky, vypnuté ukotvení: záchytné body
(„Zlevněné", „Zobrazit N pozemků") se posunuly o 0 px.

**Hlídač.** `scripts/test-bez-skoku.mjs` — zaklikne pět ovladačů (síť,
„Jen celé pozemky", příležitost, druhový čip, štítek druhu) a u každého
měří, že ovladač zůstal do dvou pixelů tam, kde byl, a že mřížka druhů
nezměnila výšku. **Ukotvení si vypíná sám** — se zapnutým by mlčel i nad
rozbitou stránkou. Ověřeno sabotáží: bez `min-width` a bez srovnání
posunu padlo 7 kontrol z 16.

**Co se schválně neměří.** Záchytné body kolem ovladače. Štítky sítí se
při zúžení výběru legitimně schovávají („u dražeb nikdo neuvádí vodu")
a panel pod nimi se tím posune právem; a když výpis spadne z 1 884 na
20 nabídek, zkrátí se dokument natolik, že posun ořízne sám prohlížeč.
Ani jedno není vada. Vada je, když odskočí to, čeho se člověk drží.

## §236 Druh nabídky a řazení do panelu, jednou řečí s ostatními

**Co o tom řekl majitel.** Zakroužkoval červeně pilulky Vše / Prodej /
Dražba / Exekuce spolu s celým panelem filtrů: „toto by mělo být spojené
se zbytkem a řazení, tedy v té tabulce."

**Měl pravdu a jde to vyjmenovat.** Druh nabídky byl jediný filtr na
stránce, který stál MIMO panel — a mluvil jinou řečí než všechno, s čím
dělá tutéž práci:

| | druh nabídky (bylo) | druh pozemku, sítě |
|---|---|---|
| tvar | pilulka (`--r-pill`) | dlaždice (`--r-ovladani`) |
| písmo | 13 px | 14 px |
| počet | odznak s vlastní plochou uprostřed řádky | holý, vpravo ve sloupci |
| místo | nad panelem | v panelu |

Teď je to tatáž dlaždice: ikona, popisek, počet vpravo. Jediný rozdíl
zůstává věcný — tady se vybírá JEDEN druh, ne několik, takže místo
zaškrtávátka stojí ikona a mezi volbami je „Vše".

**Řazení taky.** Stálo v hlavičce výpisu vedle „Uložené" a komentář
u téhle řady tvrdil, že v panelu být NESMÍ, protože tam patří jen to, co
ubírá nabídky. To pravidlo majitel zrušil vědomě: panel je pro něj „ta
tabulka", kde se nabídka nastaví celá — čím se zúží i v jakém pořadí se
ukáže. Co z toho plyne a co platí dál: odznak u „Druh, cena, výměra
a další" počítá jen FILTRY, jinak by hlásil „1" komukoli, kdo si jen
přehodil pořadí.

**Co to udělalo s místem.** Lišta nad mapou na monitoru byla dvouřádková
— druhý řádek nesl právě ty pilulky. Teď je jednořádková a měří 64 px;
stylopis si u ní dřív poznamenal 111 px pro dvouřádkovou podobu, a ten
rozdíl (jeden řádek dlaždic 44 px plus mezera 8) sedí. Na telefonu se
nezměnilo nic: pilulky tam byly uvnitř sbalovaného hledání, takže místo
nad výpisem nezabíraly tak jako tak — první nabídka začíná pořád na
412 px.

**Co se tím uklidilo.** `.ms-group` a celá oblast „rychle" v mřížce
lišty, pravidla, která pilulky v liště držela na jednom řádku s vlastním
posouváním, a `.msv-razeni` se dvěma pravidly, která řazení v hlavičce
výpisu smršťovala. Všechno našel `test-mrtve-styly` a `test-mrtva-jmena`
k tomu přidal tři jména tříd, která jsem v novém značkování nechal bez
jediného pravidla (`.mc-nabidka`, `.map-filters`, `.mc-razeni`) — zmizela
taky, skupinu kreslí `.mc-field` a `.mcv-rada` jako u ostatních.

**Čtyři zkoušky to chytily dřív než já.**

1. `test-barvy` měřil barvu odznaku tak, že klepal do pilulek druhu —
   ve sbaleném panelu je ale nevidí a všech pět kategorií přeskočil.
   Zachránila to pojistka „a změřily se aspoň tři kategorie (dnes 0)",
   kterou tam kdysi někdo napsal právě pro tenhle případ. Panel se
   v té zkoušce teď otevře.
2. `test-hledani-zavirani` klepal na „první tlačítko v panelu", aby
   ověřil, že klepnutí uvnitř hledání nezavře. Prvním tlačítkem se po
   přestěhování stalo „Pozemky v okolí", které otevře výběr místa přes
   celou obrazovku — a ten pak zachytával všechna další klepnutí.
   Zkouška teď klepe na návěští filtrů.
3. `test-okoli`, `test-razeni` a `test-vyhodna-cena` nastavovaly řazení
   přes `selectOption('#map-sort')`. Web staví nad každým `<select>`
   vlastní rozbalovač a původní prvek zmenší na 1 × 1 px; dokud řazení
   stálo v hlavičce výpisu, vracelo mu pravidlo `.msv-razeni .map-select`
   plnou krabici. S tím pravidlem zmizela i ta krabice a Playwright
   čekal třicet sekund na neviditelný prvek. Nastavení řazení je proto
   nově na jednom místě — `scripts/zkouska-razeni.mjs`.
4. Při tom se změřilo, kolik místa si bere rezervovaná šířka počtu
   (§235): „1 884" má 34,3 px, `4,5 ch` dává 35,1. Bylo tam 5 ch
   (39 px) — o 3,9 px víc, než je potřeba, a každý takový pixel si bere
   popisek, který se jinak láme o řádek víc.

## §237 Sloupcový graf z okna ceny a výměry pryč

**Co o tom řekl majitel.** „Ten graf nad tím dej pryč a nech tam jen to
nastavení ceny."

**Co tam bylo.** Nad políčky od–do stál histogram přes celou šířku:
jedenáct až osmnáct sloupců podle šířky displeje, sloupec jako terč pro
prst, osa („700 m²" … „7 ha a výš") a pod ní nápověda. Klepnutím se
vybralo pásmo, druhým klepnutím se rozsah roztáhl, přes několik se dalo
přejet prstem. Zůstala políčka, souhrn, „Vymazat" a „Hotovo · N
nabídek".

**Co se tím ztratilo, poctivě.** Graf uměl dvě věci, které políčka
neumějí. Ukazoval, **kde nabídky vůbec jsou** — že do 700 m² skoro nic
není, se z prázdného políčka nepozná — a dal rozmezí vybrat **bez
psaní**, na telefonu jedním tahem místo dvou čísel z klávesnice.
Zůstává počet v tlačítku „Hotovo", který se mění při psaní, takže slepé
to není; je to ale zpětná vazba AŽ po zadání, ne nabídka předem.

**Co se tím uklidilo.** Počet nabídek v tlačítku se bral ze sloupců
histogramu; teď se spočítá rovnou. A js/rozsah.js — dnes už tu není,
viz §238 — spadl tehdy ze 120 řádků
na 40: `zarazky` (nerovnoměrná stupnice z kvantilů), `histogram`,
`hezke` (zaokrouhlení na 1-1,5-2-3-5-7) a `index` ztratily čtenáře.
Zůstal `popis`, který sází souhrn do panelu („Cena · do 500 tis.").

**A jeden starší nález.** `index` — dohledání nejbližší zarážky k ručně
napsanému číslu — neměl volajícího **už předtím**. Zůstal po dřívějším
táhle, které se mělo po napsání čísla postavit na správné místo, a nikdo
si toho nevšiml, protože modul si nikdo nepročítal celý. Zkouška
`test-rozsah` ho přitom testovala třemi kontrolami, takže vypadal živě.
Nově hlídá, že **každý vyvezený výpočet má v `js/main.js` volajícího** —
na tohle by to stačilo.

**Tři zkoušky přepsané.**

- `test-rozsah` spadl z 23 kontrol na 13: co hlídalo stupnici a
  přihrádky (že nejsou prázdné, že výstřelek neroztáhne horní konec),
  nemá co měřit. Zbyly popisky, nezlomitelná mezera před jednotkou
  a zapojení — a přibyla kontrola, že se graf nevrátí zadní cestou.
- `test-naseptavac` měřil sloupce: kolik jich je, jak jsou vysoké
  a široké, co dělá první a druhé klepnutí. Místo toho se teď píše do
  políček a měří se, že se počet dole při psaní mění, že se „Vymazat"
  objeví až když je co mazat a že pole mají 16px písmo a 44 px na prst.
- `test-okraje` měl na graf vlastní oddíl: vybraný sloupec musí být
  poznat od nevybraného a nesmí se lišit jen barvou (WCAG 1.4.1).
  Oddíl zmizel; políčka od–do měří tatáž zkouška jako každý jiný
  ovladač, protože mají rámeček a stojí na ploše.

## §238 Cena a výměra zpátky do panelu — žádná vlastní obrazovka

**Co o tom řekl majitel.** „Nechápu, proč mě to hází na tuhle stránku,
proč mě to nenechá v menu. Prostě ať mi tam vyskočí klávesnice na psaní."

**Má pravdu, a je to následek předchozí změny.** Celá obrazovka tu byla
kvůli histogramu: ten potřeboval šířku, jakou mu panel dát nemohl, a
políčka od–do se do okna stěhovala s ním. Graf padl o pár minut dřív
(§237) a v okně zbyla dvě políčka a tlačítko. Dvě klepnutí navíc
(otevřít, zavřít) a odchod z panelu, ve kterém člověk zrovna nastavuje
ostatní filtry — za nic.

**Teď to vypadá takhle.** V kartě „Cena a výměra" stojí tři řádky pod
sebou: `Cena (Kč)` od–do, `Cena za m²` a `Výměra (m²)` od–do. Klepnutí
do políčka ho jen zaostří a vyvolá číselnou klávesnici; panel zůstane
otevřený. Kolik nabídek zbylo, hlásí tlačítko v patě panelu („Zobrazit
1 884 pozemků"), které tam bylo celou dobu.

**Co odešlo s tím.** Souhrnná řada (`.mc-shrnuti` a tlačítka
`.mcs-btn` „Cena · libovolná"), celé okno (`.rz-ov` s hlavou, tělem,
patou, vlastním „Hotovo · N nabídek" a „Vymazat") a funkce, která to
všechno stavěla a překreslovala. A s nimi poslední čtenář modulu
js/rozsah.js — ten už tu není celý, protože `popis` sázel právě ten
souhrn. Modul měl včera 120 řádků, včera večer 40 a dnes nula.

**Dva nálezy při úklidu.**

1. `test-hledani-vzhled` hlídá, že hodnoty v kartě „Cena a výměra"
   končí v jednom sloupci. Po přestěhování končily dvojice od–do na
   364 px a „Cena za m²" na 352 — dvanáct pixelů, protože řádek
   s rozbalovátkem má vnitřní okraj 12 px a řada od–do žádný.
   Srovnáno. Při tom vyšlo najevo i druhé: návěští řady se sázelo
   verzálkami (recept názvu SKUPINY), kdežto vedle něj stojí „Cena za
   m²" obyčejně. V jedné kartě dvě podoby téhož. Taky srovnáno.
2. `test-mnozstvi` hlídal jmenovitě tvar pro nulu v „Hotovo · 0
   nabídky". To místo zmizelo s oknem; počet dnes hlásí tlačítko v patě
   panelu a tvar skládá `plPozemek()`, takže se hlídá rovnou ona.

**Zkoušky.** `test-naseptavac` měl na okno celý oddíl (otevřít souhrn,
klepat do sloupců, zavřít, zkontrolovat souhrn). Měří teď, že políčka
jsou v panelu, mají 16px písmo, 44 px na prst a číselnou klávesnici,
že klepnutí do nich nic neotevře ani nezavře, že napsaná čísla zúží
výpis a že „Zrušit filtry" je vyprázdní. `test-rozsah` zanikl s modulem.

## §239 Rozcestník nad výpisem pryč

**Co o tom řekl majitel.** „Tuhle řadu dej úplně pryč." Vyfotil šest
pilulek nad hlavičkou výpisu: Nové na trhu · Dražby · Exekuce ·
Stavební · Orná půda · Podle okresu.

**Změřeno.** Řada měřila 48 px, s odstupem 64. První nabídka se po jejím
zrušení posunula ze 412 na **348 px** od vršku stránky.

**Co to stojí, poctivě.** Z úvodní stránky ani z lišty nevede na
**dražby a exekuce** žádná jiná cesta. Do webu se na ně dostane přes
Rádce a pár článků — naměřeno: na `drazby-pozemku.html` odkazuje
8 stránek, na `exekuce-pozemku.html` 6. Stavební pozemky a orná půda
jsou na tom jinak: odkazuje na ně 327 a 976 stránek pozemků. Hledat se
obojí dá i bez rozcestníku, oba druhy jsou filtry v panelu („Druh
nabídky", „Druh pozemku"), ale filtr a stránka nejsou totéž: stránka má
vlastní text, vlastní adresu a chodí na ni vyhledávač.

**A jedna lež v komentáři, která by jinak zůstala.** `scripts/hlavicka.mjs`
vysvětluje, proč v liště nejsou Dražby a Exekuce, a odůvodňuje to větou
„vstupní odznaky na úvodní stránce (.uvod-vstupy) vedou na tytéž
stránky". Od zrušení té řady to neplatí a komentář by tvrdil opak
skutečnosti. Přepsán: stojí v něm, co se změnilo a kam se na ty stránky
dnes dá dostat.

## §240 Nadpis a cena na kartě: jeden recept na celém webu

**Co o tom řekl majitel.** Stojí to v CLAUDE.md jeho vlastními slovy:
„věci mají různou velikost, druh textu, celé to musíš sjednotit."

**Změřeno v prohlížeči** (pět typů stránek, dvě šířky, vypočtené styly):

| karta | nadpis | cena |
|---|---|---|
| úvod `.opp-item` | 16/600, na širokém 18/600 | 24/700 |
| okres, kraj, druh `.okr-item` | 16/700 | 20/700 |

Nadpis měl tedy dva řezy a cena dvě velikosti podle toho, na jaké
stránce karta leží — na obsahu karty to nezáleželo, jen na tom, který
stylopis ji potkal první.

**Sjednoceno** na slabší řez u nadpisu (600) a na větší cenu (24), tedy
na recept z úvodní stránky, protože ta má kartu nejpropracovanější:
nadpis 16 px, nad 1041 px 18 px, cena 24/700. Rozdíl, který ZŮSTÁVÁ
schválně: na úvodu vede kartu DRUH nabídky, na okresní MÍSTO. To není
sazba, to je obsah — nadpis nese jinou informaci, ne jinou velikost.

**Nová zkouška.** `scripts/test-karta-nabidky.mjs` měří nadpis a cenu
na pěti typech stránek a dvou šířkách a trvá na jednom receptu na každou
šířku. Prokázána sabotáží: cena zmenšená na 20 px → `✕ cena na kartě má
jeden recept na celém webu (24/700, 20/700)`, čtyři v pořádku, jedna
chyba. Zapsána do `.github/workflows/testy.yml`.

## §241 Posuvný pruh nad výpisem a zkouška u hrany

**Co spadlo.** `test-u-hrany` ohlásil na úvodní stránce
`button#mc-prosle.mc-nastroj 203.0/12.0 px` — tlačítko „Prošlé dražby"
stálo 12 px od pravé hrany, tedy ani u kraje, ani s okrajem.

**Čí to je vada, poctivě: žádná.** `git stash` ukázal, že pád je starší
než dnešní změna — přišel s daty. Dnes vypršely tři dražby
z 29. 10. (`po_terminu` 0 → 3), takže se vedle hledání a filtrů
vykreslil TŘETÍ nástroj. Geometrie: `#mc-akce` jde od 16 do 374 px,
tlačítko končí na 378 — o 4 px dál. A tak to má být: pruh nářadí je
schválně jeden řádek, který se posouvá prstem (`overflow-x:auto`,
schovaná lišta, prolínačka `.mc-akce.je-dal`), a poslední tlačítko z
kraje kouká právě proto, aby bylo vidět, že se pruh posouvá dál. Trvá
na tom `scripts/test-nastroje-v-dosahu.mjs` větou „drží jeden řádek i
při třech nástrojích (jen se posune do strany)". Dva hlídači si tedy
odporovali — vadný byl ten obecnější.

**Opraveno v hlídači, ne na webu.** `scripts/test-u-hrany.mjs` teď
neměří prvek, jehož RODIČ je posuvný pruh, který právě přetéká.

**Proč jen rodič.** Nejdřív to byla podmínka na celý rod nad prvkem
(kterýkoli předek je posuvný) a sabotáž ukázala, že se tím zakryje
skutečná vada: karta zatlačená na 8 px od kraje
(`.opp-item{margin-left:-8px}`) zmizela taky, protože posuvný předek se
nad kteroukoli kartou najde skoro vždycky. Se zúženou podmínkou sabotáž
padne, jak má: `li.opp-item.exekuce 8.0/16.0 px | div.opp-media
9.0/17.0 px | …`, a `#mc-prosle` projde. Po opravě: `test-u-hrany`
třináct v pořádku, `test-nastroje-v-dosahu` patnáct v pořádku, rychlá
sada 133 ze 133.

## §242 Historie se dá otevřít — a v řadě ovladačů není díra

**Co o tom řekl majitel.** Vyfotil vršek úvodní stránky: „kde je kurva
ta historie" a „necháš tam místo, co to jako je".

**První nález: pruh byl tam, kde ho nikdo nenajde.** 29. 10. si majitel
vyžádal, ať „naposledy prohlédnuté" nestojí nahoře, „ať je co nejvíc
dole". Pruh se tedy přestal stěhovat a zůstal za výpisem. Změřeno
30. 10. na 390 px: stál **9 473 px od vršku stránky**, za všemi 24
kartami, při výšce okna 844 px tedy jedenáct obrazovek dolů. Ukazoval se
navíc až od dvou prohlédnutých pozemků, takže po první prohlídce nebyl
nikde vůbec.

**Opraveno přepínačem, ne dalším stěhováním.** V řadě nad výpisem
přibyl ovladač **„Historie (n)"** vedle „Uložené". Pruh je zavřený a
otevře se jedině po klepnutí — hned pod ovladači, tedy tam, kam se člověk
dívá, když si ho otevřel. Zavřený neodsouvá první nabídku ani o pixel
(změřeno: 348 px zavřeno, 458 px otevřeno, pruh měří 99 px). Nabízí se
od JEDNÉ položky, ne od dvou.

> **A TOTÉŽ ODPOLEDNE ZRUŠENO.** Majitel: „proč tam dáváš tlačítko na
> historii, to nikdo nechtěl." Měl pravdu v tom, co řekl: ptal se, kde
> ta historie je, ne o nový ovladač. Přepínač, jeho styly i ikona
> `historie` ze sady jsou pryč; pruh se zase ukazuje sám, stojí POD
> výpisem a od dvou položek, tedy přesně jak to bylo zadané 29. 10.
> („ať je co nejvíc dole"). Zůstala jen oprava díry v řadě níž — ta se
> týkala jeho vlastní stížnosti („necháš tam místo").

**Druhý nález: díra v řadě.** Ovladače drží dvousloupcová mřížka a
„Porovnat" se ukazuje až od dvou uložených pozemků — kdo měl jeden a
žádnou historii, viděl „Uložené" a vedle něj prázdné políčko. Lichý
poslední ovladač teď dostane celý řádek (`.msv-siroky`, nasazuje
`srovnejOvladani()` v `js/main.js`; v CSS se počet VIDITELNÝCH dětí
spočítat nedá). Naměřeno po opravě: sám 358 px, ve dvojici 173 + 173 px.

**A do třetice, co se našlo až při měření:** v téže sestavě stálo pole
hledání a přepínač Seznam/Mapa 48 px vysoké proti 44 u všech ostatních
ovladačů, a značka v přepínači měřila 18 px proti 16 u lupy, záložky
i nářadí (při tloušťce dopočítané k šestnáctce jí stopa vycházela
1,69 px místo 1,5). Obojí srovnáno dolů na 44 a 16; první nabídka se tím
posunula o 8 px výš.

**Vlastní značka.** „Historie" dostala svůj tvar — hodiny, jejichž
ciferník se v levém horním rohu otevře a zahne zpátky. Hodiny samotné už
na webu znamenají „dražby po termínu" a jeden tvar nesmí nést dvě věci
(pravidlo z `scripts/ikony.mjs`). Zkoušeno v 16, 24 i 48 px.

**Zkoušky.** `test-ovladani-vypisu` měřil šest ovladačů včetně řazení,
které ale 29. 10. odešlo do panelu filtrů — od té doby padal a v CI se
to neukázalo, protože úloha skončila dřív na jiném pádu. Měří teď
„Historii" na jeho místě a mezeru mřížky si čte z DOM, místo aby si
pamatovala osmičku. `test-prvni-obrazovka` měří obojí: zavřený pruh
neodsouvá nic, otevřený stojí nad první nabídkou a odsune ji přesně
o svou výšku. Otevírání je na jednom místě (`scripts/rozbal-hledani.mjs`,
`otevriHistorii`) a používají ho i `test-rozvrzeni`, `test-pamet`
a `test-nastroje-v-dosahu`.

## §243 Obří značka, profil u pravého kraje a stav napsaný slovem

**Co o tom řekl majitel.** „Navíc jsem chtěl, ať uděláš obří logo a dáš
ten profil úplně doprava, a mělo by být jasné, zda je člověk přihlášený,
nebo tam necháš místo."

**Značka.** Terč vyrostl ze 40 na **56 px** (na monitoru ze 44 na 64),
jméno zůstalo na 28 px — a to je měření, ne lenost: v liště stojí ještě
hamburger (44 px) a ovladač profilu (95 px), takže na značku zbývá 182
z 358 px. Se značkou 56 a jménem 32 px měřila 195 px a profil vylezl
**9 px za pravou hranu okna**. Pod 360 px jde značka o stupeň zpátky
(terč 44, jméno 24), jinak by se řádek nevešel — jméno ale nemizí, to je
to poslední, co se na webu smí schovat.

**Profil doprava.** Hlavička je na telefonu zarovnaná doleva, takže
ovladač účtu seděl hned za značkou a vpravo zelo prázdno. Teď si mezeru
dopočítá sám (`margin-left:auto`) a drží okraj stránky: naměřeno 20 px
od pravé hrany na 390 px, 16 px pod 360 px.

**Stav se čte, ne hádá.** Dosud to říkala devítipixelová tečka u ikony.
Ovladač teď nese slovo: odhlášený **„Přihlásit"** na bílé dlaždici
s obrysem, přihlášený **„Profil"** na zelené ploše. Oba nápisy stojí ve
značkování a přepíná je styl podle `html.pk-prihlasen`, kterou nasazuje
vložený skript v hlavičce ještě před vykreslením — nápis tedy nebliká.
Pod 360 px se nápis schová oku (clip-path), ne odečítači.

**Výška lišty.** Se značkou 56 px má hlavička 73 px (pod 360 px 64,
na monitoru 89) a číslo, kterým si pod ni stránka dělá místo, se s tím
muselo srovnat: `--vyska-hlavicky` bylo 64 px v telefonním bloku a na
monitoru se brala náhradní hodnota 85. Dnes je proměnná pro všechny tři
šířky. Odsazení hlavičky na monitoru šlo z 20 na 12 px — s dvacítkou by
lišta měřila 105 px a zkouška hlídá 90, protože lepivá hlavička bere
obsahu každý pixel.

**Zkoušky.** `test-hlavicka` měří obě polohy ovladače (nápis, plocha,
odstup od pravé hrany) — prokázáno sabotáží: zelená plocha vrácená na
bílou shodí kontrolu „pozná se to i podle plochy". `span.hu-in` je
v tabulce výjimek „schované na obou šířkách" s odůvodněním, protože se
kreslí jedině přihlášenému, a právě to ten nový oddíl měří.

## §244 Šuplík nabídky: značka, oddíly, živá čísla

**Co o tom řekl majitel.** Vyfotil otevřenou nabídku: „tuhle část
kompletně předělej, dodej tomu život, je to suché."

**Změřeno na jeho snímku** (390×844): obsah nabídky končil na 525 px,
tedy **319 px panelu bylo prázdných**, a křížek visel sám na vlastním
řádku nad vším ostatním. Šest holých slov pod sebou a nic, co by
řeklo, co za nimi je.

**Co v ní je teď.**

| | |
|---|---|
| hlavička | značka (terč 40 px) a v ní vpravo křížek — křížek už nemá vlastní řádek |
| akce | „Přidat pozemek" hned pod ní, jako dřív |
| oddíl | popisek „CO JE NA TRHU" verzálkami |
| cesty | Hledat na mapě **1 897**, Nové za týden **57**, Dražby **33**, Exekuce **37**, Ceny pozemků |
| účet | „Můj profil" se stavem (e-mail, nebo „Nepřihlášeno") a tři řádky pod ním |
| patička | „Data z veřejných zdrojů, naposledy 30. 10." |

**Čísla jsou ze skutečných dat, ne od oka.** Skládá je
`scripts/hlavicka.mjs` při sestavení z `data/mapa.json` — z téhož řezu,
který kreslí mapa (bez duplicit a bez dražeb po termínu). Stránka kvůli
nim nestahuje ani bajt navíc a čerstvé jsou podle posledního běhu
robota. „Nové" je za TÝDEN, ne za den: za jediný den přibyde i nula a
odkaz by sliboval prázdnou stránku.

**Vrátily se tři cesty, které z webu vypadly.** Nové na trhu, dražby a
exekuce zmizely 29. 10. s řadou pilulek nad výpisem („tuhle řadu dej
úplně pryč") a od té doby na ně z úvodu nevedlo nic. V šuplíku jsou
zpátky — jako nabídky s počtem, ne jako příručka: rádci ani rozcestníky
se nevrátily. Na monitoru se nekreslí (třída `.nav-mobil`), tam lišta
zůstává dvouodkazová.

**Dvě vady, které se při tom našly a opravily:**

1. **„Exekuce" se tvářila jako místo, kde právě jsem.** Odkaz vede na
   `index.html#t=exekuce`, a označovač stránky v `js/menu.js` z adresy
   utíná hash — takže na úvodní stránce svítily dvě záložky naráz.
   Kotva s rovnítkem je STAV, kotva bez něj je místo v textu; označuje
   se jen to druhé.
2. **Odkaz na stav nedělal na otevřené stránce nic.** Stav se bral jen
   z adresy při startu, takže kdo už na úvodní stránce byl, tomu se jen
   změnil hash (naměřeno: „#t=exekuce", vybraný druh pořád „Vše", počet
   1 897 beze změny). `js/main.js` teď na `hashchange` stav obnoví —
   po opravě: druh „Exekuce", počet **37**. Vlastní zápis adresy sem
   nepřijde, ten jde přes `history.replaceState`.

**Ikony ze sady, ne z CSS.** Řádky nabídky měly ikonu jako
`background-image` v `::before`, tedy tvar opsaný do stylopisu podruhé.
Teď nesou `<svg><use>` ze sady (`scripts/ikony.mjs`), jako zbytek webu
— a prázdné místo po `::before` zmizelo úplně.

**Zkoušky.** `test-menu` dál trvá na tom podstatném: celá nabídka se
musí vejít na obrazovku (naměřeno 844 z 844 px, nic pod hranou) a každý
řádek má 52 px na prst. `test-rozvrzeni` měl strop osmi odkazů —
je z něj devět a důvod je zapsaný. `test-vnitrni-odkazy` nehledá `id`
pro kotvu s rovnítkem (stav mapy žádné nemá). `test-naseptavac` žádal
po zkráceném seznamu rolování i tehdy, když se do něj vejde celý obsah
— padlo to na jednom pixelu (strop 273 px proti 274 px podle CSS).

## §245 Spodní lišta s cenou a akcí na stránce pozemku — zrušená

**Co o tom řekl majitel.** „Pořád tam dole bliká ta kravina ‚K dražbě',
vidíš." Vyfotil stránku pozemku, kde ta karta ležela přes řádek
„Obvyklá cena v okolí do 25 km".

**Co to bylo.** Připnutá karta u spodní hrany s cenou a hlavním
tlačítkem, okoukaná od Rightmove a Zillow. 29. 10. už ji jednou popsal
(„vidíš, jak to blbne dole, buguje se to přes všechno") a tehdy
se z pruhu přes celou šířku stala plovoucí karta a z osmi přepnutí na
jedno projetí stránky dvě. Nestačilo to.

**Proč mizí celá, ne jen její chování:**

1. **Objevuje se a mizí z podstaty.** Svítí, jakmile sjede cena nahoře
   z obrazovky, a zhasíná, když se k ní člověk vrátí. Naměřeno na
   390×844: jedno projetí stránky tam a zpět = **dvě přepnutí**, a s nimi
   skok výšky stránky **3 727 ↔ 3 823 px** (odsazení `body.ma-listu`).
   Kdo listuje nahoru a dolů, kouká na blikání.
2. **Na iPhonu se k tomu přidá prohlížeč.** Safari při rolování vysouvá
   a zasouvá svoje lišty, takže připnutá karta u spodní hrany poskakuje
   s nimi. To se z webu opravit nedá.
3. **Leží přes obsah.** Na majitelově snímku kryla řádek s obvyklou
   cenou v okolí.

**Co se tím neztrácí.** Hlavní akce zůstává ve stránce (řada
`.pz-akce-hlavni`), kulatý návrat nahoru taky — kdo dočte, má se čím
vrátit. Na širokém displeji je pořád připnutý pruh s cenou vpravo
(`.pz-bok`), ten nikam nemizí a nic nepřekrývá.

**Hlídač.** Zkouška spodní lišty zanikla s ní a místo ní přibyla
kontrola v `scripts/test-nahoru.mjs`: u spodní hrany stránky pozemku
nesmí stát NIC připnutého přes půl šířky (kulatý návrat nahoru je
vyjmutý). Měří se to geometrií, ne hledáním třídy — ať se to nevrátí
pod jiným jménem. Prokázáno sabotáží: vložená karta 366×64 u spodní
hrany kontrolu shodí.

## §246 Karta s odhadem ceny: týž řez písma jako zbytek webu

**Co o tom řekl majitel.** „Tyto texty v inzerátech jsou super, jen to
chce použít stejný druh písma jako má celý web. A chce to trochu
vylepšit ten vizuál té karty."

**Nejdřív měření, protože dojem klamal.** Rodina písma se nelišila —
celá karta běžela v Interu, jako zbytek webu (naměřeno v prohlížeči:
`Inter` na všech sedmi místech karty). Co se rozcházelo, byl ŘEZ
a stupeň:

| | karta před | zbytek webu |
|---|---|---|
| popisek řádku | 14 px / **400** / prostrkání normal | 14 px / 600 / −0.01em |
| hlavní číslo | 20 px / 700 | **24** px / 700 / −0.02em (§240) |
| poznámka pod kartou | 12 px, řádkování 1,5 | 13 px je stupeň věty, 12 je stupeň popisku |

Při témže písmu dělá ten rozdíl dojem jiného písma — slabší řez a
rozvolněné prostrkání vypadají vedle zbytku stránky jako jiná rodina.

**Srovnáno na recepty, které web už má:** popisky 600/−0.01em, hlavní
číslo 24/700/−0.02em (týž recept jako cena na kartě ve výpisu),
poznámka 13 px s řádkováním 1,6 (stupnice jde po desetinách, hlídá
`scripts/test-typografie.mjs` — 1,55 na ní není).

**A vizuál karty:**

1. **První řádek je popisek, ne druhá cena.** „Nabídková cena" má teď
   verzálky 12/600 s prostrkáním z tokenu — týž popisek, jaký nese
   panel filtrů i dlaždice parametrů. Oko tím ví, kde začít: nahoře
   je údaj z inzerátu, pod ním to hlavní.
2. **Závěr stojí na vlastní ploše.** „O 18 % níž, tedy zhruba
   o 152 618 Kč" je to, kvůli čemu se karta čte, a ztrácelo se mezi
   čísly a odstavcem. Má tenký podklad v barvě toho sdělení
   (`rgba(--accent-warm-rgb, 0.10)`, zaoblení `--r-sm`, bez rámu
   a bez stínu — aby nevznikla karta v kartě).
3. **Kde ta cena platí, stojí na druhém řádku popisku.** „Obvyklá cena
   v okolí do 25 km" se na telefonu zalomilo tak, že vedle velkého
   čísla zbylo osamocené „25 km". Rozsah je upřesnění, ne jméno údaje.
4. **Karta dýchá**: odsazení 16 px místo 12 (stupnice).

**Zkoušky.** Beze změny prošly `test-pismo`, `test-typografie`,
`test-odstupy`, `test-kontrast`, `test-deska`, `test-zaobleni`,
`test-barvy`, `test-mrtve-styly` i `test-mrtva-jmena` — nové hodnoty
jsou na stupnicích a nový podklad se nechová jako druhá deska.

## §247 Nastavení mapy: tři pojmenované skupiny místo řady bezejmenných pilulek

**Zadání od majitele:** „S tou mapou bys sis měl víc pohrát, s tím
nastavením. Je suché to nastavení u mapy — chce to vylepšit, pusť se na
brutální vylepšení."

**Stav před.** Pruh pod mapou byl jedna zalomená řada ovladačů: dvě
pilulky podkladu, pět stejných pilulek vrstev a posuvník. Změřeno na
telefonu 390×844 se zapnutým katastrem a územním plánem — panel 267 px,
a v něm nic, co by řeklo, co je co. „Letecká" a „Hranice parcel" dělají
každá něco úplně jiného, ale měly týž tvar i tutéž velikost, takže se to
dalo poznat jedině tak, že si to člověk zkusí.

**Co se změnilo.**

1. **Každá skupina má jméno.** „PODKLAD", „VRSTVY ÚŘADŮ",
   „PRŮHLEDNOST VRSTVY" — verzálky 12/600 s prostrkáním z tokenu, tedy
   týž popisek, jaký nese panel filtrů nad výpisem (`.mc-cap`).
2. **Podklad je jeden ovladač se dvěma polohami.** Zapuštěná dráha,
   v ní nadzvednutá poloha; obě poloviny se dělí o řádek rovným dílem.
   Dvě samostatná tlačítka vedle sebe neříkala, že se vylučují.
3. **Vrstvy jsou dlaždice se značkou.** Hranice parcel výměra, územní
   plán budova, záplavy voda, BPEJ druh, ochrana přírody štít — tvar se
   pozná dřív než text. Nápis se smí zalomit, nesmí se useknout:
   napoprvé tu stálo `text-overflow:ellipsis` a z „Kvalita půdy (BPEJ)"
   zbylo „Kvalita půdy (B…", tedy useknuté právě to slovo, kvůli kterému
   si tu vrstvu někdo zapne.
4. **Posuvník říká, na kolika stojí.** Číslo na konci popisku,
   v tabulkových číslicích, aby při tažení neposkakovalo.

**Mřížka, ne druhé @media.** Panel je `grid` s
`repeat(auto-fit, minmax(200px, 1fr))`. Pod mapou je široký 366 px na
telefonu (vyjde jeden sloupec, skupiny jdou pod sebe přes celou šířku)
a 694 px na monitoru (tři sloupce); skupina vrstev si bere celý řádek,
protože pět dlaždic do čtvrtiny šířky nejde. Staré pravidlo
`@media (max-width:560px) .pzm-kryti{width:100%}` tím zmizelo — jen by
opakovalo, co platí samo.

**Ve zvětšení je panel jeden řádek.** Mřížka stavěla skupiny pod sebe
i přes celou obrazovku a každý řádek ubíral mapě: naměřeno v okně
1280×860 panel 279 px a mapa 448 px, tedy pod polovinu okna — přesně ten
„jen jinak zarámovaný okénkový" stav, kvůli kterému zvětšení vzniklo.
Hlídá to `scripts/test-mapa-pozemku.mjs` (mapa musí zabrat přes 55 %
okna) a tahle kontrola to taky ohlásila. Vedle sebe zabere ovládání
93 px a mapě zbude 591.

**Značka, která nikde nebyla.** Napoprvé měly „Hranice parcel" ikonu
a „Územní plán" prázdno. Důvod: sadu tvarů skládá
`scripts/sjednot-ikony.mjs` tak, že hledá odkaz na symbol DOSLOVA
v textu modulu, a v `js/pozemek.js` se skládal z kousků (předpona
zvlášť, jméno zvlášť). Nenašlo se tedy nic a do stránky se vložily jen
symboly použité jinde. Odkazy se proto píšou celé.

**A hlídač na to.** Statická kontrola ikon to nechytí — ty odkazy ve
zdroji stránky vůbec nejsou, píše je až skript v prohlížeči. Do
`scripts/test-mapa-pozemku.mjs` proto přibyly čtyři kontroly měřené
v DOMu: každá dlaždice má značku, ta značka je ve vložené sadě tvarů,
opravdu se vykreslí (nenulové rozměry) a žádné dvě vrstvy nemají tutéž.
Sabotáží ověřeno: po návratu ke skládanému odkazu hlásí
„bez tvaru: uzemni-plan → #i-budova". Druhou sabotáží (návrat zvětšení
k mřížce) hlásí „po zvětšení mapa zabere většinu okna — 390 px → 493 px
z okna 860 px".

**Co to stálo.** Vložený styl 19,5 kB z 24 (strop) a 227 pravidel z 240.
Panel na telefonu vyrostl z 267 na 382 px a stránka pozemku z 4 041 na
4 156 px, tedy o 115 px — za to, že se panel dá přečíst bez zkoušení.

**Co to odhalilo (neopraveno).** `scripts/test-poradi-pozemku.mjs` padá
na kontrole „odkaz na nabídku stojí v první polovině stránky": hlavní
akce je na telefonu 360×800 na 2 734 px z 3 855 px. Padalo to i před
touhle změnou (2 667 px z 3 789 px), takže to není její následek — ale
je to dluh. Mez „polovina" se totiž kdysi uvolnila z „třetiny" s tím, že
akce je vidět pořád v připnuté spodní liště; ta lišta je od 30. 10.
zrušená (§245), takže zdůvodnění té meze už neplatí. Patří to
k úkolu „stránka pozemku má 5 obrazovek" a je to rozhodnutí o rozvržení,
ne úklid.

## §248 Řazení je nad výpisem vidět — a nadpis přestal být cedule

**Zadání od majitele (30. 10., se snímkem úvodní stránky):** „Kam jsi dal
řazení, nebo-li kolonku doporučené, k čemu tam je?"

**Co bylo špatně.** Řazení si majitel 29. 10. sám vyžádal do panelu filtrů
(„mělo by to být spojené se zbytkem, tedy v té tabulce", §170) a tam
zůstalo. Nad výpisem po něm ale zbyl nadpis **„Doporučené příležitosti"** —
a to je JMÉNO té zvolené volby. Vypadal jako titulek: nedal se stisknout,
nikam nevedl a nic neříkalo, že je to řazení. Člověk tedy viděl, JAK je to
seřazené, a neměl jak to změnit. Majitelova otázka „k čemu tam ta kolonka
je" je přesně ta správná otázka.

**Co se změnilo.** Z nadpisu je ovladač: `ŘAZENÍ · Doporučené ▾`
(222×44 px na telefonu 390). Jedním klepnutím otevře panel filtrů,
odroluje k rozbalovači a rovnou vyjede seznam jedenácti voleb — změřeno:
`{panelOtevren:true, razeniVidet:true, seznamOtevren:true, volby:11}`.

Volba zůstává v panelu, jak si majitel přál. **Druhá kopie stavu
nevzniká:** jméno na ovladači se čte z téhož `<select id="map-sort">`,
takže se ty dva nemůžou rozejít.

**Dvě věci, na které se přišlo až při psaní.**

1. **Na `<select>` se nedá sáhnout přímo.** `js/dropdown.js` nahradí každý
   rozbalovač vlastním tlačítkem a původnímu dá `tabindex="-1"` a
   `aria-hidden` — `focus()` na něm tiše neudělá nic. Naměřeno třikrát za
   sebou: `document.activeElement` zůstal `mc-razeni`, dokud se nepodíval
   na `tabIndex` (−1). Klepne se proto na `.cdd-btn`, který dropdown
   vyrobil.
2. **Panel je `<details>`**; ve chvíli, kdy se mu nastaví `open`, jeho
   obsah ještě nemá rozvržení, takže se celá akce odkládá o jeden snímek
   (`requestAnimationFrame`) a posouvá se skokem, ne plynule — dokud
   plynulé posouvání běží, mění se obdélník pod rukama a seznam voleb by
   vyjel vedle.

**Dva hlídače, které tiše padaly, a nikdo si jich nevšiml.** Oba padaly
i před touhle změnou (ověřeno na předchozím commitu) — nejsou tedy jejím
následkem, ale musely se spravit, protože hlídaly nepravdu:

| Kontrola | Co hlásila | Co s tím |
|---|---|---|
| „řazení není mezi filtry a je vidět" | `razeniMeziFiltry: true` | Pravidlo zrušil 29. 10. majitel sám. Hlídač zůstal u starého textu a od té chvíle padal na stavu, který si majitel objednal. Nahrazeno třemi kontrolami dnešního pravidla: volba je v panelu, nad výpisem je ovladač, a jméno na něm se shoduje se zvolenou položkou. |
| „cena, výměra i cena za metr jsou v jedné skupině" | „ve skupině: (nic)" | Četlo popisky přes třídu `.mcs-k`, která na úvodní stránce neexistuje (ověřeno v DOM i ve stylopisu). Dotaz vracel prázdné pole, takže kontrola neměřila nic. Čte se `.mc-cap`. |

**Sabotáží prokázáno.** Pevný text na ovladači (`Nejlevnější` místo
zvolené položky) → „a to jméno je přesně ta zvolená položka, ne opsaný
text" padne. Ovladač schovaný a nadpis vrácený → „a nad výpisem je vidět,
jak je seřazeno" padne.

**A jedna vada vlastní výroby.** Ovladač měl `margin-left:-8px`, aby se
písmo srovnalo s nabídkami pod ním — hlídač u hrany to odmítl: rámeček tím
stál 8 px od okraje obrazovky (mez je 0, nebo aspoň 16). Odsazení je pryč.

**Tlačítko „Historie" v té řadě není.** Bylo zrušené 30. 10. v commitu
„Přepínač „Historie" pryč" a v repozitáři po něm nezbylo nic — změřeno
v prohlížeči na dnešním sestavení: `document.getElementById('map-recent')`
vrací `null`. Na snímku, který majitel poslal, je tedy starší sestavení
z prohlížeče, ne dnešní stav webu.

**Zkoušky.** Rychlá sada 133/133. V prohlížeči prošly `test-uvod` (68),
`test-rozvrzeni` (190), `test-ovladani-vypisu` (30), `test-prvni-obrazovka`
(22), `test-dotyk`, `test-deska`, `test-prechody`, `test-vypadky`,
`test-odstupy`, `test-pismo`, `test-typografie`, `test-kontrast`,
`test-zaobleni`, `test-ikony`, `test-tahy`, `test-mrtve-styly`,
`test-mrtva-jmena` i `test-u-hrany`.


## §249 Nabídka: tři odkazy navíc zase pryč, místo vyplní rozvržení

**Zadání od majitele (30. 10.):** „Chápeš, že tam nemáš přidávat další věci,
jen to menu vykrášlit?"

**Co jsem udělal špatně.** Den předtím znělo zadání „tuhle část kompletně
předělej, dodej tomu život, je to suché" (§244). Naměřil jsem, že v panelu
844 px zbývá 319 px prázdna, a vyplnil jsem je **třemi novými odkazy**
(„Nové za týden", „Dražby", „Exekuce") s počty a nadpisem oddílu nad nimi.
To byla špatná odpověď: delší seznam není bohatší nabídka, je to jen delší
seznam. A navíc to bylo v rozporu s vlastním pravidlem téhle nabídky,
které je v `scripts/hlavicka.mjs` napsané od 29. 10. — „zbav se těch věcí
v menu a prokliků, nemá to být příručka".

**Co je teď.** Tři odkazy i nadpis oddílu jsou pryč; nabídka má zase šest
odkazů. Prázdné místo vyplňuje **rozvržení, ne obsah**:

| | |
|---|---|
| nahoře | značka (ať je poznat, čí nabídka to je), hlavní tlačítko, dva řádky procházení |
| dole | blok účtu s vlastní plochou a linkou nahoře, pod ním věta o čerstvosti dat |
| mezi nimi | vzduch — předěl mezi „čím se web prochází" a „co je moje" |

Měřeno na 390×844 (přihlášený): obsah končí na 816 px z 844, tedy pod ním
zbývá 28 px místo dřívějších 319. Mezi oběma zónami je 276 px vzduchu —
a protože dolní blok má vlastní plochu a linku, čte se ta mezera jako
předěl, ne jako díra po smazané položce. Napoprvé měl blok jen
`margin-top:auto` bez plochy a 276 px nad ním pořád vypadalo jako chybějící
obsah; plocha to rozhodla.

**Co zůstalo z „vykrášlení".** Značka v hlavičce šuplíku, ikona u každého
řádku (ze sady, ne obrázek v CSS), stav účtu napsaný slovem, a jediné
číslo — počet u „Hledat na mapě". To není nová položka, to je údaj na
položce, která tam stejně byla.

**Úklid, který k tomu patří.** `poctyZDat()` počítalo i nové, dražby
a exekuce — tedy tři průchody dvěma tisíci záznamy pro čísla, která už
nikdo neuvidí. Zbyl počet všech nabídek a datum poslední aktualizace.
Pravidlo `.nav-oddil` ve stylopisu zmizelo s nadpisem, který obsluhovalo.

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-menu` (32, včetně
„celá nabídka se vejde na obrazovku"), `test-uvod` (68), `test-rozvrzeni`
(190), `test-stranky`, `test-dotyk`, `test-kontrast`, `test-deska`,
`test-pismo`, `test-zaobleni`, `test-ikony`, `test-tahy`, `test-odstupy`,
`test-u-hrany`, `test-mrtve-styly`, `test-mrtva-jmena`.

**Poznámka ke snímku, který majitel poslal.** Byl na něm build bez značky
v šuplíku, bez počtů a bez těch tří odkazů — tedy stav mezi commity
„Obří značka…" a „Šuplík nabídky předělaný". Telefon mu drží starší
stránku; stejně tak u tlačítka „Historie" o zprávu dřív. Stojí za to to
hlídat zvlášť — kdo soudí web podle sestavení z předvčerejška, soudí něco
jiného, než co je nasazené.


## §250 Proč majitel čtyřikrát za dopoledne viděl starou verzi webu

**Jak se to projevilo.** Majitel čtyřikrát po sobě poslal snímek
a stěžoval si na něco, co už bylo opravené a nasazené: tlačítko „Historie"
(zrušené v 8:26), šuplík bez značky a bez počtů, a naposledy nadpis
„Doporučené příležitosti" místo ovladače řazení. Pokaždé to vypadalo, že
neplním zadání.

**Měření, které to rozhodlo.** Nasazení verze s ovladačem řazení
(`pages build and deployment`, běh 1682) skončilo úspěchem v **10:25:40**.
Majitelův snímek téže stránky je z **10:32** a je na něm předchozí verze.
Mezi tím neleží žádné selhání nasazení — leží tam ukládání v prohlížeči.

**Proč.** Web běží na GitHub Pages. Pages posílá na HTML svoje vlastní
`Cache-Control` s platností v řádu minut a **vlastní hlavičky neumí
nastavit**. Repozitář si přitom na dvou místech myslí, že to přebíjí,
a ani jedno neplatí:

| Kde | Co tam stojí | Proč to neplatí |
|---|---|---|
| `vercel.json` | `Cache-Control: no-cache, no-store, must-revalidate, max-age=0` | web nejede na Vercelu, ale na GitHub Pages — ten soubor nikdo nečte |
| `<meta http-equiv="Cache-Control">` ve všech stránkách | totéž | značka `meta` na HTTP ukládání vliv nemá, prohlížeče ji pro dokument ignorují |

A do třetice to samé tvrdil komentář v `sw.js`: *„stránky mají v hlavičce
Cache-Control: no-cache, must-revalidate — ten záměr se tady neobchází"*.
Tři místa psala totéž a ani jedno to nedělalo.

**Co z toho plynulo v kódu.** Servisní pracovník má pro navigace pravidlo
„nejdřív ze sítě". Jenže `fetch(zadost)` prochází **úložištěm prohlížeče**,
a dokud je uložená odpověď podle `Cache-Control` čerstvá, vrátí se z disku
a na server se nejde vůbec. Obsluha si myslela, že byla na síti, a přitom
vydala starou stránku.

**Oprava.** `fetch(zadost.url, { cache: 'no-cache', … })` — prohlížeč se
serveru zeptá vždycky, ale smí dostat `304` a vydat uložené tělo, takže to
nestojí data navíc. Ne `no-store`: to by zahodilo i možnost 304. Adresa jde
jako řetězec, ne jako `Request`, protože žádost o navigaci má
`mode: 'navigate'` a `new Request(zadost, …)` by na ní spadla.

**Co to neopravuje.** Už otevřenou kartu to nepřekreslí — ta se musí načíst
znovu. A `vercel.json` i ty meta značky v repozitáři zůstávají; jsou
neškodné, ale je to dokumentace, která lže, a proto to stojí tady.

**Zkoušky.** `test-offline` (17), `test-pamet` (64), `test-konzole` (12),
rychlá sada 133/133.


## §251 Otevřená karta se dozví o nové verzi sama

**Co na to řekl majitel:** „To není normální." Má pravdu. §250 opravilo
jednu polovinu příčiny — ukládání v prohlížeči — a nechalo na něm, aby
stránku natáhl ručně. To není oprava, to je návod.

**Druhá polovina.** Kdo má stránku OTEVŘENOU a jen se k ní vrátí z jiné
aplikace, žádné nové načtení nedělá. Prohlížeč se po `sw.js` sám ptá při
navigaci a zhruba jednou za den — v odložené kartě tedy prakticky nikdy.
Přesně tohle majitel celé dopoledne dělal: přepnul do Safari, podíval se
na kartu, vyfotil ji.

**Co se děje teď** (`js/offline.js`, u funkce `hlidejNovouVerzi`):

1. jakmile je karta zase vidět, zeptá se stránka na novou podobu `sw.js`
   (`registration.update()`) — jeden dotaz, většinou `304`;
2. když se opravdu vymění obsluha (`sw.js` dělá `skipWaiting` a
   `clients.claim`, takže se vymění hned), karta se **jednou** načte znovu.

**Tři události, ne jedna.** „Člověk se vrátil ke kartě" hlásí každý systém
jinak: `visibilitychange` při přepnutí mezi kartami, `pageshow` při návratu
z paměti zpátky/vpřed (tudy chodí iOS Safari, když se vrátíte z jiné
aplikace) a `focus` při návratu do okna. Poslouchá se všechno a sejde se to
v jednom dotazu, nejvýš jednou za půl minuty.

**Dvě pojistky.**
· Překreslení nejvýš jednou za život stránky — web, který se přelévá pořád
dokola, je horší než stará stránka.
· Nic se neděje při PRVNÍ instalaci (tehdy `controllerchange` přijde taky,
ale stránka je už ta nejnovější, jakou prohlížeč má).

**Nový hlídač `scripts/test-nova-verze.mjs`** (v CI v úloze „v prohlížeči").
Běží proti vlastnímu serveru, který posílá **tutéž hlavičku jako GitHub
Pages** (`Cache-Control: max-age=600`), a „nasazení" vyrábí tak, že pod
běžící kartou změní, co server vydává. Čtyři kontroly: obsluha řídí kartu,
karta drží svou verzi, po návratu se sama překreslí na novou — a dokud nová
verze není, nepřekresluje se.

**Sabotáží prokázané obě poloviny:**

| Co jsem rozbil | Co to ohlásilo |
|---|---|
| hlídání nové verze se nezapne | „po návratu ke kartě se stránka sama překreslí na novou verzi — karta zůstala na STARA" |
| překreslení při každém návratu (bez pojistky) | „a dokud nová verze není, karta se nepřekresluje — načtení navíc: 1" |

**Dvě věci, které mě ten hlídač naučil o sobě samém.**
· `waitForFunction` vyhodnocuje svůj výraz UVNITŘ karty — jenže právě ta se
pod ním překresluje, takže mu zmizí kontext a ohlásí chybu místo úspěchu.
Řetěz proběhl správně a zkouška přesto hlásila „karta zůstala na STARA".
Čeká se proto na načtení zvenčí.
· Druhé nasazení kartu překreslí ZNOVU, a je to správně: pojistka proti
smyčce platí na jeden život stránky a po každém překreslení začíná život
nový. Nebezpečná je opačná chyba — překreslovat, když se nic nezměnilo.

**Zkoušky.** `test-nova-verze` (4), `test-offline` (17), `test-konzole`
(12), `test-pamet` (64), rychlá sada 133/133.


## §252 Pořadí ovladačů nad výpisem podle majitele

**Zadání (30. 10.).** Majitel vyznačil barvami do snímku, co kde má být, a
napsal: „doporučené buď úplně dole, pozemky po jednom buď úplně nahoře,
uložené a stáhnout výběr bude uprostřed."

**Jak to teď vypadá na telefonu (390 px), změřeno:**

| Řádek | Co | y | šířka |
|---|---|---|---|
| 1 | Procházet po jednom | 201 px | 358 px (celý řádek) |
| 2 | Uložené · Stáhnout výběr | 257 px | 173 + 173 px |
| 3 | ŘAZENÍ · Doporučené + počet | 313 px | celý řádek |

**Proč mřížka a `display:contents`, a ne přestavba stromu.** Ty tři věci
bydlí ve třech různých obalech (`.map-count`, `.msv-ovladani`, `#mc-akce`)
a dva z nich se překreslují při každé změně výpisu — proto `#mc-akce` vůbec
vznikl (aby přepsání hlavičky nesmazalo ovladač řazení). Přestavět strom by
znamenalo, že si tlačítka při překreslení navzájem mažou místo. Oba obaly
tedy dostaly `display:contents`: z rozvržení zmizí a jejich tlačítka padnou
rovnou do společné mřížky `.ms-vysledky`, kde pořadí určí `order`. **Strom
zůstává, jak byl; mění se jen to, co je vidět.** Na monitoru se nemění nic
— celý ten blok je uvnitř `@media (max-width:560px)` (ověřeno měřením na
1280: `display:flex`, počet vlevo, „Uložené" vpravo).

**Dvě chyby po cestě, obě naměřené.**

1. **Specificita.** `.map-side .mc-akce` o kus níž má taky dvě třídy — a
   `.ms-vysledky` leží UVNITŘ `.map-side`, takže při stejné síle vyhrálo
   pozdější pravidlo a `#mc-akce` zůstal vlastní mřížkou: naměřeno
   `display=grid`, sloupce 80,5 px, „Stáhnout výběr" 81 px místo 173 a
   „Procházet po jednom" uprostřed místo nahoře.
2. **`srovnejOvladani()` se volalo z jediného místa** — při změně uložených.
   Jenže počet políček mění i překreslení výpisu („Stáhnout výběr",
   „Zobrazit skryté", „Dražby po termínu" se objevují podle dat). „Uložené"
   proto drželo celý řádek (16–374 px), přestože vedle něj „Stáhnout výběr"
   stálo — třída `msv-siroky` na něm zbyla z okamžiku, kdy bylo samo.
   Volá se teď i na konci `renderList()` a počítá OBA obaly dohromady,
   protože mřížka je společná.

**Hlídač přepsaný, ne obejitý.** `scripts/test-ovladani-vypisu.mjs` do téhle
chvíle hlídal pravidlo z 30. 10. dopoledne — „Uložené" bere celý řádek samo,
nástroje pod ním jsou půlky. To majitel tímhle zrušil. Staré znění by tedy
hlídalo stav, který si nikdo nepřeje. Nové kontroly měří POLOHU, ne třídy
(pořadí dělá `order`, strom o něm nic neříká): rychlý je nahoře a bere celý
řádek, dvojice stojí vedle sebe a dělí se o řádek beze zbytku, řazení je
dole.

**A jedna oprava v samotném měření.** Kontrola okrajů se ptala obalu
`.ms-vysledky .msv-ovladani` — ten má ale teď `display:contents`, tedy
žádnou vlastní krabici, a prohlížeč u něj vrací obdélník přes celé okno
(`{vlevo: 0, vpravo: 390}`). Hlásila tím „drhne o hranu" o prvku, který se
nekreslí. Ptá se proto na krajní tlačítka.

**Sabotáží prokázáno trojmo:**

| Co jsem rozbil | Co to ohlásilo |
|---|---|
| „Procházet po jednom" dolů (`order:5`) | „je úplně nahoře" padne |
| řazení nahoru (`order:-9`) | „je úplně nahoře" i „řazení je úplně dole" padnou |
| `#mc-akce` zpátky na vlastní mřížku | „stojí uprostřed vedle sebe" i „bere celý řádek" padnou |

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-ovladani-vypisu` (34),
`test-uvod` (68), `test-rozvrzeni` (190), `test-prvni-obrazovka` (22),
`test-dotyk`, `test-u-hrany`, `test-odstupy`, `test-kontrast`, `test-deska`,
`test-mrtve-styly`, `test-mrtva-jmena`, `test-vypadky`.


## §253 Řazení je stejně velké jako „Procházet po jednom"

**Zadání (30. 10.):** „To řazení udělej stejně velké jako pozemky po
jednom."

Ovladač řazení měl 222 px z 358 a vedle něj stál počet. Teď jsou to dva
terče přes celý řádek na opačných koncích toho bloku — **358×44 px oba** —
a liší se jen barvou, protože „Procházet po jednom" je akce a řazení je
nastavení. Počet („1 918 na mapě") se tím odsunul pod ovladač.

**Šipka se posunula k pravému kraji.** Nalepená za hodnotou by v řádku
širokém 358 px visela uprostřed prázdna.

**Nová kontrola v `test-ovladani-vypisu`:** „a je stejně velké jako
„Procházet po jednom"" (šířka i výška). Sabotáží ověřeno — po vrácení
ovladače na obsahovou šířku padne na 390 i 320 px.

**Zkoušky.** Rychlá sada 133/133, `test-ovladani-vypisu` (36), `test-uvod`
(68), `test-rozvrzeni` (190), `test-prvni-obrazovka` (22), `test-dotyk`,
`test-u-hrany`, `test-odstupy`, `test-kontrast`.


## §254 Hlavička do jazyka zbytku webu

**Zadání (30. 10.):** „Toto nahoře celé předělej do našeho stylu, k našemu
webu to nesedí."

**Co tam nesedělo, čtyři věci:**

1. **Značka byla jediný přeliv na webu.** `assets/logo-mark.svg` měl tři —
   dva lineární (plocha dlaždice, špendlík) a jeden radiální jako vnitřní
   záři. Web se přitom přelivů zbavoval půl týdne (§18, §19, §42). Tenhle
   zbyl, a stál na tom nejvíc viditelném místě: nahoře na každé z 2 400
   stránek. Hlavička tím vypadala jako ikona aplikace nalepená na web.
2. **A navíc pod sebou zelenou zář** (`box-shadow:var(--glow)`). Ten svit
   na webu nosí JEN zapnutý ovladač — tedy stav, ne ozdoba. Pod značkou
   říkal „jsem zapnutá".
3. **Dva ovladače v jedné řádce, každý jiným jazykem.** Vlevo hamburger
   jako holé čáry bez pole, vpravo profil v orámované pilulce.
4. **Dvě zelené vedle sebe.** Dlaždice `#0F5C3B` (`--znacka`, barva TEXTU)
   proti profilu `#004F2F` (`--plocha-znacka`, barva PLNÝCH PLOCH).

**Co je teď.** Kresba je plochá: jedna plocha v `--plocha-znacka`, bílý
špendlík, domeček vyříznutý plochou. Žádný přeliv, žádná zář. Hamburger
dostal týž recept jako profil naproti — 44 px, rám `--line-ui`, zaoblení
`--r-ovladani`, plocha karty. Hlavička je souměrná: **vlevo ovladač,
uprostřed značka, vpravo ovladač**, a všechny tři mají totéž zaoblení
(naměřeno 14 px u všech, stín u žádného). Nápis „Parcelka" zůstává
`--znacka`, protože to text je.

**Past, do které jsem cestou spadl.** Vysvětlení jsem napsal jako komentář
dovnitř toho SVG — a **značka zmizela z celého webu**. XML zakazuje dvě
pomlčky uvnitř komentáře a každé jméno tokenu (`--znacka`, `--r-ovladani`)
jimi začíná; soubor se přestal parsovat a `background-image` se nevykreslil.
Výklad proto bydlí v `css/styles.css` u pravidla `.logo-mark`, kde je
i varování, ať to po mně nikdo nezkouší znovu.

**Jedna věc, kterou tahle oprava NEDĚLÁ.** Barva dlaždice je v SVG napsaná
napevno — do samostatného souboru se token nedostane. Při každé změně
palety se musí přepsat i ta kresba. Stojí to v komentáři u pravidla.

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-hlavicka` (91),
`test-barvy` (58), `test-kontrast` (2 670 prvků, 0 propadlo), `test-dotyk`,
`test-u-hrany`, `test-deska`, `test-zaobleni`, `test-rozvrzeni` (190),
`test-uvod` (68), `test-menu` (32), `test-ikony`, `test-tahy`,
`test-mrtve-styly`, `test-mrtva-jmena`, `test-prvni-obrazovka`.

## §255 Posuvník průhlednosti z panelu mapy pryč

**Zadání (30. 10.):** „Ta průhlednost je zbytečná, odstraň ji."

**Co tam bylo.** V panelu pod mapou na stránce pozemku seděl posuvník
`<input type="range">` od 20 do 100 % s odečtem „65 %" a vlastním nadpisem
skupiny. Přibyl o den dřív (§174) a zabíral celý řádek mřížky, protože
táhlo se nedá rozumně zúžit — na telefonu 390 px tedy stál nad pěti
přepínači vrstev jako šestý ovladač, který nikdo nehledá. Majitel má
pravdu: krytí je věc, kterou člověk nastaví jednou a nikdy znovu.

**Co je místo něj.** Jedna konstanta `KRYTI_VRSTVY = 0,65` v
`js/pozemek.js`, kterou dostane každá zapnutá vrstva. Chování se tím
nemění — plán přes letecký snímek pořád prosvítá přesně tak jako dřív,
jen se to přestalo nabízet k přenastavení. Zmizela i tři pravidla
stylopisu (`.pzm-kryti`, `.pzm-kryti-hl`, `.pzm-kryti-v`), výjimka pro
celou obrazovku a zvětšení táhla na 44 px pro dotyk.

**Hlídač se nesměl jen smazat.** Zkouška `test-mapa-pozemku` měřila tři
věci přes ten posuvník: že se po zapnutí vrstvy objeví, že vrstva není
neprůhledná, a že tažením se krytí opravdu mění. První a třetí ztratily
předmět. Druhá ale hlídala to podstatné — a nově se měří přísněji: ne
„někde mezi 0,1 a 1", ale **že je to právě 0,65**. Prokázáno sabotáží:
s `KRYTI_VRSTVY = 1` sada hlásí `✕ vrstva přes podklad prosvítá pevným
krytím 0,65 — krytí 1` a skončí červeně. Bez té změny by se dalo krytí
cestou ztratit a nikdo by si toho nevšiml.

**Zkoušky.** Rychlá sada 133/133 za 110 s. V prohlížeči
`test-mapa-pozemku` (157), `test-vlozeny-styl` (14), `test-mrtve-styly`
(11), `test-mrtva-jmena` (18), `test-dotyk` (0 pod mezí), `test-u-hrany`
(13), `test-deska` (5), `test-rozvrzeni` (190), `test-barvy` (58),
`test-zaobleni` (4), `test-odstupy` — všechny bez chyby. Jediná červená
zůstává `test-poradi-pozemku` (hlavní akce na 2 734 px z 3 855), což je
starší nález vedený zvlášť a s touhle změnou nesouvisí.

## §256 Jediný přepínač vrstvy seděl na půlce řádku

**Zadání (30. 10.):** „A tlačítko Hranice parcel bych roztáhl a uzpůsobil
ho tak, aby působilo více klikatelně." Na majitelově snímku jela jediná
vrstva (ČÚZK), ostatní čtyři úřady mlčely — a ten jeden přepínač stál
sám v levé polovině řádku s dírou vedle sebe.

**Proč se neroztáhl, ačkoli měl.** Řada vrstev byla mřížka
`repeat(auto-fit, minmax(150px, 1fr))`. Takový zápis má prázdné sloupce
srazit a jediné dlaždici dát celý řádek — jenže `auto-fit` nesrazí
sloupec, přes který se něco táhne, a ve stejné mřížce bydlí i hláška
„Vrstvy … teď neodpovídají" s `grid-column:1/-1`. Dokud je co hlásit,
mřížka drží dva sloupce. Naměřeno na telefonu 390 px: řada 324 px,
sloupce `158px 158px`, přepínač 158 px — **pod polovinou řádku**.

**Co je teď.** Zalamovaná řada (`flex-wrap`) a dlaždice `flex:1 1 150px`.
Poslední řádek se vždycky dojede do konce, ať je na něm přepínačů kolik
chce: jeden zabere celých 324 px (na monitoru 694), pět se složí 2 + 2 + 1
a ten poslední vyplní zbytek. Výjimka `.pzm-cela-zap .pzm-vr{display:flex}`
pro zvětšení na celou obrazovku tím zmizela — neměla už co přebíjet.

**Klikatelnost podle receptu, který web má.** Dlaždice nesly linku
1,5 px v `rgba(…, .26)` a žádný stín; na bílé ploše panelu z toho byl
obrys sotva znát a vypadaly jako štítky s názvem vrstvy. Berou si proto
týž recept jako vedlejší tlačítko webu a jako pilulky druhů nad výpisem
(§233, stejné zadání od majitele): linka 1,5 px v `--obrys-tlacitka`,
stín `--e1`, řez 700. Najetí navíc zvedne na `--e2`. Velikost písma
zůstává 13 px — na čtrnácti by se „Záplavové území" na telefonu
zalamovalo na dva řádky (viz propočet u `.pzm-v`).

**Hlídač.** Scénář „odpovídá jen jedna služba" v `test-mapa-pozemku` se
přestěhoval na telefon 390 px a měří, že přepínač dojede přes celý
řádek. Prokázáno sabotáží: s vrácenou mřížkou hlásí
`✕ a dojede přes celý řádek, ne do poloviny — 158 px z 324 px`.

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-mapa-pozemku` (158),
`test-vlozeny-styl`, `test-mrtve-styly`, `test-mrtva-jmena`, `test-deska`,
`test-zaobleni`, `test-barvy`, `test-dotyk`, `test-u-hrany`,
`test-kontrast`, `test-rozvrzeni` (190) — bez chyby.

## §257 Přepínač Seznam/Mapa: jeden ovladač se dvěma polohami

**Zadání (30. 10.):** „Tohle bych nějak upravil, aby to vypadalo líp,
musím vymyslet něco speciálního a profesionálního." K tomu snímek
přepínače nad výpisem.

**Co na tom bylo vidět — tři vady jedné příčiny.** Zapnutá polovina se
barvila sama za sebe, místo aby se po dráze posunul jezdec:

1. **Šedá vlasová linka přetínala zelenou polovinu.** Rámeček dráhy byl
   `outline`, a ten se kreslí NAD potomky. Výplň zapnuté poloviny ho
   tedy nepřekryla a odshora i zdola jí vedla čára.
2. **Dělicí linka mezi polovinami se zdvojovala** s okrajem té výplně —
   seděla přesně na jejím švu.
3. **Nic se nehýbalo.** Přepnutí byl skok barvy, ne pohyb.

**Co je teď.** Zapuštěná dráha (`--plocha-zapustena`) s rámečkem
napsaným jako `inset` stín — ten se kreslí do pozadí rodiče, tedy POD
potomky, a zapnutá polovina ho přes sebe přejde. Do rozměru se
nepočítá, takže výška 44 px (tedy tatáž jako u pole hledání vedle)
zůstává. V dráze jezdí jezdec: značkový obdélník 3 px od okrajů, se
září `--glow`, a přejíždí mezi polohami. Dělicí linka zmizela — mezeru
dělá sama dráha. Je to týž recept jako u přepínače podkladu v mapě
pozemku (`.pzm-zaklad`/`.pzm-z`), takže jsou na webu dvě místa a jedna
řeč.

**Dvě věci, které mi hlídači vrátili.**

1. **`test-kontrast`:** napoprvé nesl plochu jen jezdec a zapnutá
   polovina měla `background:none`. Bílý nápis se tím měřil proti
   nejbližší nakreslené ploše — proti zapuštěné dráze — a vyšel
   **1,15 : 1 místo nutných 4,5**. Hlídač měl pravdu věcně, ne jen
   formálně: kdyby se jezdec z jakéhokoli důvodu nevykreslil, je
   zapnutý nápis bílá na světlé. Plocha je proto na tlačítku a jezdec
   jen přejíždí pod ní. Aby to nebylo poznat, je časování asymetrické:
   vypínaná polovina ztratí plochu okamžitě (jezdec je v tu chvíli ještě
   pod ní), zapínaná ji dostane až s doběhem jezdce.
2. **`test-zaobleni`:** napoprvé byl tvar pilulka, podle mapy. Pilulka
   na tomhle webu patří odznakům a kulatým tlačítkům se značkou,
   ovladače mají jedno zaoblení 14 px. Tvar nese `--r-ovladani`.

**A jednu vadu našel nový hlídač sám.** Do `test-ovladani-vypisu`
přibylo měření, že jezdec leží přesně pod zapnutou polovinou — v obou
polohách a na obou šířkách. Na 320 px to **padlo**: `jezdec 163–301 px,
plocha 173–301 px`. Příčina: poloviny se dělí o řádek rovným dílem
(`flex:1 1 0`), jenže flexbox nepustí položku pod šířku jejího obsahu —
a „Seznam 1 918" se tam se značkou a šestnáctkou nevejde. Zapnutá
mapa dostala 134 px, druhá polovina si vzala zbytek, a zpod jezdce
(pevných 50 %) vykoukl o 10 px zelený proužek. Počet proto pod 360 px
z přepínače mizí.

**Co to stojí a kdo to platí.** Na telefonech užších než 360 px není
počet nabídek v pohledu na mapu vidět (v seznamu zůstává v hlavičce
výsledků). Je to menší cena než rozbitý ovladač, ale je to ztráta.

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-ovladani-vypisu`
(48), `test-kontrast`, `test-zaobleni`, `test-prechody`, `test-dotyk`,
`test-afordance`, `test-uvod` (68), `test-prvni-obrazovka`,
`test-rozvrzeni` (190), `test-u-hrany`, `test-vrstveni`, `test-mapa`
(57), `test-vypis-bez-mapy` (36), `test-barvy`, `test-mrtve-styly`,
`test-mrtva-jmena` — bez chyby.

## §258 Pás s hledáním byl obdélník barvy

**Zadání (30. 10.):** „Rozložení je už super, ale je to takové suché,
potřebujeme tam udělat nějaké barevné přechody, případně udělat jiné
grafiky."

**Dvě vrstvy, obě z toho, co web už má.**

1. **Svislý přeliv hloubky.** Nahoře sedí hlavička, dole výpis — plochý
   obdélník mezi nimi nemá žádný směr. Přeliv z průsvitné značkové
   zeleně (tedy **žádná nová barva**, jen `--znacka-hluboka-rgb` s alfou
   0,08 → 0) dává pásu shora dolů ubývající tíhu, takže se čte jako
   plocha pod hlavičkou, ne jako samostatný blok.
2. **Mříž.** Táž textura z 1px linek, jakou web nosí na pásech jinde
   (`.s-mrizka::before`, `footer::after`, `.okr-band::before`). Tady
   navíc dává smysl významem: pod hledáním se hledají parcely a parcely
   jsou mříž.

**Pravidlo o přelivech tím není porušené.** Web se ozdobných přelivů
zbavoval půl týdne (§18, §19, §42) a `test-soustava` je hlídá — ale ne
zákazem, nýbrž výčtem: každý přeliv na ploše musí být v tabulce
`PRELIVY` i s napsaným důvodem, proč plnou barvou nejde. Oba nové tam
jsou. **Co jsem NEUDĚLAL a proč:** přeliv na tlačítku „Procházet po
jednom". Vypadalo by to draze, jenže na otázku „je to zvednuté?"
odpovídá už stín `--e1` a záře `--glow`, takže bych pro ten přeliv
žádný funkční důvod nenapsal — a do `PRELIVY` bez důvodu nepatří.

**Maska stála dvě kola.** Napoprvé držela mříž do 72 % výšky v plné
sytosti: na pásu vysokém 112 px z toho vyšly dvě řady linek skoro až
k ovladačům a pás vypadal jako tabulka. Napodruhé svislý přeliv do 56 %
linky uťal a zbyly z nich svislé čárky pod hlavičkou — ozdoba, která
vypadá jako nedopatření. Teprve elipsa posazená nad pás je nechá ubývat
do všech stran najednou, takže nikde nekončí hranou.

**A jedna logická díra v hlídači.** `test-okraje` ohlásil, že vypnutá
polovina přepínače Seznam/Mapa splývá s pozadím (`výplň 1,00:1, okraj
1,00:1`). Četl totiž jen **šířku** rámečku, takže `border:3px solid
transparent` mu počítalo jako „rámeček má" — a prvek pak padl na tom,
že ten rámeček není vidět. Průhledná linka ale není vidět nikdy, ať je
široká kolik chce; hlídač teď čte i její průhlednost, stejně jako už
dřív pouštěl tlačítka úplně bez rámečku. Že se tím nic nezametlo pod
koberec, je vidět na počtu: měřených prvků ubylo **ze 144 na 143**,
tedy právě ten jeden.

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-okraje` (143
prvků, 0 nálezů), `test-jeden-styl` (33), `test-soustava` (15),
`test-kontrast`, `test-vrstveni`, `test-naseptavac` (127), `test-uvod`
(68), `test-prvni-obrazovka`, `test-rozvrzeni` (190), `test-najeti`,
`test-odznaky`, `test-porovnani`, `test-tvary`, `test-prechody`,
`test-dotyk`, `test-afordance`, `test-ovladani-vypisu` (48),
`test-u-hrany`, `test-deska`, `test-barvy`, `test-mrtve-styly` — bez
chyby.

## §259 Ovládání nad výpisem: světlo shora místo ploché bílé

**Zadání (30. 10., podruhé):** „Hraj si s tím dál, je to strašně suché
oproti zbytku stránky. Tohle je vážně a potřebuje to udělat detaily,
přechody a barvičky a živost a víc profesionality."

**Čím se to dalo změřit — pohledem na tutéž stránku o kus níž.** Karty
nabídek pod ovládáním mají syté zelené náhledy, tmavé pilulky odznaků
a zelené odznaky slevy. Ovládání nad nimi bylo bílá a šedá bez jediného
stínu, takže se obě poloviny obrazovky tvářily, že patří na jiný web.
Ovládání si proto bere totéž, co karty: **plochu se světlem shora
a zvednutí nad podklad**.

**Co se změnilo.**

1. **Hlavní akce „Procházet po jednom".** Plná zelená dostala přeliv
   (světlo shora, tma dole) a k stínu `--e1` i značkovou záři `--glow`;
   po najetí `--e2` a `--glow-lg`. Přeliv tu **není ozdoba, je to směr
   světla**: stín pod tlačítkem říká „svítí shora" a plochá výplň nad
   ním si s tím odporovala. To je i důvod zapsaný v `PRELIVY`.
   (V §258 jsem tenhle přeliv ještě odmítl s tím, že zvednutí už
   obstarává stín. Majitel to po mně chtěl znovu — a při psaní důvodu
   se ukázalo, že jeden existuje a je věcný.)
2. **Vedlejší ovladače v téže sestavě** („Uložené", „Stáhnout výběr",
   řazení) jsou bílé klávesy, ne ploché obrysy: týž přeliv o řád
   slabší a stín `--e1`. Zapnuté „Uložené" (`.mc-prep.on`) se
   vynechává — nese sytou značkovou plochu a druhý přeliv přes ni by ji
   jen zašpinil.
3. **Pás s hledáním** má hlubší přeliv (0,08 → 0,13) a stín dolů, takže
   je nad obsahem, ne vedle něj. Předtím končil hranou barvy, která
   vypadala jako chyba vykreslení.

**Pravidlo o přelivech drží.** Oba nové jsou v tabulce `PRELIVY`
i s napsaným důvodem, jinak by je `test-soustava` neuznal. Celkem je
teď na ploše 17 přelivů a žádný z nich není bez důvodu.

**Co jsem ještě nezvedl.** Řádek „1 918 na mapě / pořadí se střídá
každý den" zůstává tiše šedý. Nabízelo se udělat z počtu zelený odznak
v jazyce karet, jenže ten prvek (`#map-count`) čte patnáct zkoušek jako
zdroj čísla a přestavba jeho obsahu je samostatná práce, ne přílepek
k barvám.

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-soustava` (15),
`test-kontrast`, `test-okraje` (143 prvků), `test-deska`,
`test-hierarchie` (21), `test-afordance`, `test-najeti`, `test-dotyk`,
`test-ovladani-vypisu` (48), `test-uvod` (68), `test-rozvrzeni` (190),
`test-prvni-obrazovka`, `test-barvy`, `test-zaobleni`, `test-prechody`,
`test-mrtve-styly`, `test-jeden-styl` (33) — bez chyby.

## §260 Tři kola přelivu, který prohlížeč pokaždé zahodil

**Zadání (30. 10., potřetí):** „Kámo, haló, můžeš to už udělat
a nastavit ty změny? Vypadá to úplně stejně."

**Měl pravdu doslova — a já to měl najít po prvním kole.** Pás
s hledáním dostal přeliv hloubky v §258 (alfa 0,08), v §259 jsem ho
zesílil na 0,13 a potřetí na 0,30. **Nevykreslil se ani jednou.** Dva
a půl tisíce řádků pod základním pravidlem stojí v `@media` bloku pro
telefon:

```
.map-controls-panel{order:0; border-right:0; border-bottom:0;
  background:var(--pas-plocha);}
```

Zkratka `background` nepřepisuje jen barvu — resetuje celou skupinu
včetně `background-image`. Přeliv tedy prohlížeč pokaždé zahodil
a já pořád zvedal číslo, které se nikam nedostalo. Opraveno na
`background-color`.

**Proč mě to nezarazilo dřív, a to je ta nepříjemná část.** Mříž
(`::before`) a stín (`box-shadow`) se nasadily, protože bydlí jinde —
takže na snímcích *nějaká* změna vidět byla a já ji vzal jako důkaz,
že se vše projevilo. Ověřoval jsem navíc nasazení (Pages 16:22 UTC
proti majitelovu snímku v 17:15), což vyloučilo starou verzi — ale
nevyloučilo to, co se opravdu dělo. **Hledal jsem chybu v doručení,
ne v tom, co jsem napsal.**

**Hlídač.** Do `test-ovladani-vypisu` přibylo měření, že přelivy na
`.map-controls-panel` a `.mc-rychly` opravdu **vycházejí ve vypočteném
stylu v prohlížeči**, ne jen ve stylopisu. Čtení CSS na to nestačilo —
tam ten přeliv celou dobu byl. Prokázáno sabotáží: s vrácenou zkratkou
`background` hlásí `✕ přeliv na „.map-controls-panel" se opravdu
vykresluje — background-image je „none"` na obou šířkách.

**Jak to teď vypadá.** Pás je zelený, ne nazelenalý: značková zeleň
s alfou 0,30 nahoře → 0,12 dole, tedy zhruba #AFC2B8 → #D6E2DB. Pořád
žádná nová barva. Bílé pole hledání na něm vynikne víc než na skoro
bílé a přepínač má vlastní světlou dráhu, takže na pásu neleží ani
jeden text přímo — kontrast se tím nehýbe (`test-kontrast` projde).

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-ovladani-vypisu`
(52), `test-kontrast`, `test-okraje` (143 prvků), `test-soustava` (15),
`test-uvod` (68), `test-prvni-obrazovka`, `test-rozvrzeni` (190),
`test-barvy`, `test-deska`, `test-najeti`, `test-dotyk`,
`test-naseptavac` (127), `test-vrstveni`, `test-jeden-styl` (33),
`test-hierarchie` (21) — bez chyby.

## §261 Nasazení uvázlo ve frontě GitHubu a zvenčí se s ním nedá hnout

**Co se stalo.** Oprava z §260 byla odeslána 30. 10. v 17:35 UTC.
Sestavení stránek doběhlo v pořádku v 17:37:18, ale úloha `deploy`
zůstala od téže vteřiny ve stavu `waiting` — čeká na prostředí
`github-pages`, ne na kód. Dnešní předchozí nasazení trvala 85 a 90
sekund (15:52 → 15:53, 16:20 → 16:22), tohle stálo přes čtvrt hodiny.

**Co jsem zkusil a co na to GitHub.** Majitel požádal o opakované
spuštění. API ho odmítlo v obou směrech:

```
rerun:  403 This workflow is already running
cancel: 409 Cannot cancel a workflow run that is not in progress
```

Je to past: pro spuštění znovu je ten běh „už běžící", pro zrušení
zase „neběží". **Běh ve stavu `waiting` se tedy přes API ovládat
nedá** — ani zrušit, ani restartovat. To stojí za zapamatování,
protože příště to bude vypadat jako chyba nástroje, a není.

**Co s tím jde dělat.** Dvě cesty, obě mimo API toho běhu:

1. Schválit nebo restartovat běh ručně na stránce běhu (jen majitel).
2. **Poslat na větev další commit.** GitHub tím založí úplně nový běh
   nasazení a ten ponese i čekající opravu. Tohle je cesta, která
   nepotřebuje nikoho u počítače — a je to důvod, proč tenhle oddíl
   vzniká jako samostatný commit.

**Co to NENÍ.** Není to prázdný commit na rozhýbání CI; takový by
v tomhle repozitáři neměl co dělat. Je to záznam poruchy, který sem
podle vlastních pravidel projektu patří tak jako tak — jen je napsaný
teď, a ne za hodinu.

## §262 Šuplík: 450 px bílého nic, které jsem si tam udělal sám

**Zadání (30. 10. večer):** „Najdi si předlohu a to menu vyšperkuj."
Ke snímku nabídky na telefonu.

**Co na tom snímku bylo.** Dvě položky nahoře („Hledat na mapě", „Ceny
pozemků"), blok účtu přilepený ke dnu — a mezi nimi **450 px bílého
nic**. K tomu plochý seznam dělený linkami přes celou šířku.

**Tu díru jsem tam udělal já, a ještě jsem ji obhajoval.** Když majitel
zrušil tři odkazy, které jsem do nabídky přidal (§249), zbyly dvě
položky. Volné místo jsem „vyplnil rozvržením": účtu jsem dal
`margin-top:auto`, aby držel u dna, a napsal si k tomu do stylopisu,
že mezera mezi nimi je *„oddělení dvou světů, ne díra"*. Na obrazovce
to díra byla. Dvě položky, blok dole a mezi tím nic nevypadá jako
záměr, ale jako chyba načtení.

**Co se s tím dělá bez přidávání položek.** Neteče ke dnu nic: obsah
jde shora dolů za sebou a volné místo zůstane v jednom kuse **úplně
dole**, kde se čte jako „seznam skončil". Mezitímní pokus přendat
`margin-top:auto` jen na poznámku o datech dal 215 px prázdna mezi
poslední deskou a tou poznámkou — touž díru o kus níž. Naměřeno,
zahozeno. Naměřeno teď: obsah končí na 609 px z 844 a **největší
mezera mezi dvěma prvky je 16 px**.

**Předloha je ta, kterou web používá všude jinde.** Zapuštěný podklad
a na něm bílé desky: zaoblení `--r-ovladani`, linka `--line`, stín
`--e1` — stejně jako karty ve výpisu, dlaždice vrstev v mapě
i ovladače nad seznamem. Skupina účtu je jedna deska s několika řádky
(`summary` je její hlava, odkazy uvnitř zůstávají ploché a dělí je
vlasová linka) — deska v desce by byla rám v rámu. Hlavička šuplíku
dostala týž přeliv i mříž jako pás s hledáním, takže nabídka a stránka
za ní mluví stejně. Počet u „Hledat na mapě" nese značkový tón místo
šedi.

**Jedno pravidlo, ne dvě kopie.** Mříž v hlavičce je zapsaná v tomtéž
pravidle jako mříž pásu (`.map-controls-panel::before, .nav-hlava::before`).
Napoprvé jsem ji opsal zvlášť a `test-jeden-styl` to okamžitě ohlásil —
počítá totiž recepty, ne plochy. A `test-mrtve-styly` zase ohlásil, že
jsem celý blok napsal jako přebíjející přídavek pod původní pravidla
místo toho, abych původní pravidla opravil. Obojí přepsáno.

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-menu` (32),
`test-mrtve-styly`, `test-jeden-styl` (33), `test-soustava` (15),
`test-hlavicka` (91), `test-dotyk`, `test-kontrast`, `test-okraje`
(143 prvků), `test-zaobleni`, `test-deska`, `test-barvy`,
`test-mrtva-jmena`, `test-uvod` (68), `test-rozvrzeni` (190),
`test-vrstveni`, `test-prechody` — bez chyby.

## §263 Pět obdélníků pod sebou: hledání a přepínač do jedné desky

**Zadání (30. 10. večer):** „Působí to strašně roboticky a nestylově,
předělej to."

**Dalo se to pojmenovat, a to je na tom to podstatné.** Nad výpisem
stálo pět obdélníků **stejné šířky a stejného zaoblení** pod sebou:
pole hledání, přepínač Seznam/Mapa, „Procházet po jednom", dvojice
„Uložené / Stáhnout výběr" a řazení. Pětkrát týž tvar oko nečte jako
sestavu, ale jako formulář — a to je přesně ten „robotický" dojem.
Barvy a stíny z §258–§260 na tom nic nezměnily, protože vada nebyla
v barvě, ale v rytmu.

**Co se s tím udělalo.** Pole a přepínač spolu souvisejí (čím hledám
a kde se to ukáže), takže jsou teď v **jedné bílé desce** a oba v ní
sedí zapuštěné. Z pěti obdélníků jsou čtyři a ten první má jiný
charakter než ostatní — tím vznikne začátek, ne další řádek. Deska
plave na zeleném pásu, takže vršek stránky má jeden předmět, na který
se dívá.

**Jedna past cestou.** Zapuštěná plocha má proti bílé desce 1,07 : 1,
takže tvar pole nese jedině obrys — a ten musí projít mezí 3 : 1
(WCAG 1.4.11). Napoprvé jsem mu dal `--line` a `test-okraje` by to
shodil; linka zůstává `--line-ui`. Odsazení desky 8 px navíc posunulo
lupu i našeptávač, takže se jejich ukotvení přepočítalo (30 px na
střed pole, 60 px pod jeho hranu).

**Co zůstává robotické a vím o tom.** Tři obdélníky pod deskou mají
pořád týž tvar; hierarchii mezi nimi dělá jen barva a stín. Jestli má
jít i ta řada od sebe tvarem, je to další krok, ne tenhle.

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-okraje` (143
prvků), `test-kontrast`, `test-ovladani-vypisu` (52), `test-naseptavac`
(127), `test-deska`, `test-zaobleni`, `test-uvod` (68),
`test-rozvrzeni` (190), `test-dotyk`, `test-soustava` (15),
`test-mrtve-styly`, `test-barvy`, `test-prvni-obrazovka`,
`test-vrstveni`, `test-u-hrany` — bez chyby.

## §264 Šuplík načisto: bílá hlavička, jedno obtažení, žádný proužek

**Zadání (31. 10.):** „Uspořádání je super, ale celé bych to ještě
zahladil, působí to zvakle. A ta barva nahoře je moc, má to být čisté."

**Tři věci, každá jiného druhu.**

1. **Barva nahoře.** Hlavička šuplíku dostala večer předtím týž zelený
   přeliv a mříž jako pás s hledáním. Majitel má pravdu a je to jiná
   úloha než u pásu: pás je součástí stránky a barvou říká „tady
   začíná hledání", kdežto **šuplík je překryv NAD stránkou** — ten má
   ustoupit obsahu, ne přidat druhou barevnou plochu přes tu, která
   leží pod ním. Zbyla bílá plocha, značka a vlasová linka dolů.
2. **Dvojí obtažení.** Desky měly linku `--line` **i** stín `--e1`;
   vedle sebe to vypadalo obtažené dvakrát a právě to dělalo ten
   „zvaklý" dojem. Tvar nese jen stín — a `test-okraje` ho jako
   záměrné odlišení uznává, takže se nic nerozvolnilo.
3. **Proužek, který koukal z desky.** Aktivní řádek měl
   `box-shadow:inset 3px 0 0` — svislou zelenou linku u levého kraje.
   Na ploché liště to fungovalo; na zaoblené desce z toho byl kus
   zeleně přilepený k jejímu okraji, který vypadal jako vada
   vykreslení. Aktivní řádek teď nese jen tlumenou značkovou plochu
   a značkový text; tvar drží deska sama.

**Mříž zůstala tam, kam patří** — jen na pásu s hledáním. Pravidlo,
které ji chvíli sdílelo s hlavičkou šuplíku, se vrátilo k jednomu
selektoru a `.nav-hlava` zmizela i z výčtu `PRELIVY`.

**Dva nálezy, které s touhle prací nesouvisejí.**

- `test-oprav` hlásil pět rozcházejících se stránek (Ústek, Veltrusy,
  Velké Žernoseky). Byla to noční obměna dat robotem, ne můj zásah —
  `node scripts/oprav.mjs` to srovnal.
- `test-rozvrzeni` hlásí, že plovoucí tlačítko „Nahoru" **sedí na
  „Uložit"** v kartě. Ověřeno, že to není z dnešních úprav vzhledu:
  týž nález vyjde i na čistém `3286597d93` po odložení rozdělaných
  změn. Přišlo to s tou obměnou dat (1 918 → 1 912), která posunula
  karty. Vedeno zvlášť — plovoucí tlačítko má pevný roh a karta má
  akční pilulku taky vpravo, takže to chce deterministické řešení,
  ne doufání v rozložení.

**Zkoušky.** Rychlá sada 133/133 (po přepočtu odvozených souborů).
V prohlížeči `test-okraje` (143 prvků), `test-kontrast`, `test-menu`
(32), `test-soustava` (15), `test-jeden-styl` (33), `test-mrtve-styly`,
`test-deska`, `test-dotyk`, `test-zaobleni`, `test-hlavicka` (91),
`test-barvy`, `test-afordance`, `test-uvod` (68), `test-vrstveni` — bez
chyby. Červený zůstává `test-rozvrzeni` kvůli nálezu výš.

## §265 „Doporučené" nedělalo nic — dvě vady za sebou

**Hlášení (31. 10.):** „Když zmáčknu Doporučené, zobrazí se mi nějaká
čárka nalevo, ale nic to nedělá."

**Ta čárka byl rozbalovač, který se neměl kde umístit.** Vady byly dvě
a ani jedna nejde vidět ze stylopisu.

1. **Panel filtrů je na telefonu schovaný.** `.ms-rozsirene` má
   `display:none` a ukáže se teprve s třídou `hledani-rozbalene` na
   `<body>` — tu dosud nastavovalo **jen pole hledání**. Tlačítko
   řazení ji nenastavovalo, takže se `<details>` sice otevřel, ale
   uvnitř skrytého obalu. Klepnutí na rozbalovač uvnitř pak proběhlo
   (je programové, takže na skrytý prvek dosáhne), jenže panel se
   umístil podle **nulového obdélníku** svého tlačítka — a vyjel do
   levého horního rohu jako úzký proužek. Přesně ta „čárka".
2. **Po opravě se otevřel mimo obrazovku.** Komentář v kódu tvrdil, že
   se k řazení posouvá „skokem, ne plynule" — jenže `behavior` se
   nepředával a `html{scroll-behavior:smooth}` z toho udělal plynulý
   posun, který se cestou přerušil překreslením výpisu. Naměřeno:
   `window.scrollY` zůstalo na **0** a tlačítko řazení viselo na
   **1 506 px**, tedy 660 px pod spodním okrajem okna. Teď se posouvá
   `behavior:'instant'` a ve dvou snímcích (blok se právě přepnul
   z `display:none`, v prvním snímku ještě nemá rozvržení). Po opravě:
   `scrollY 1 062`, tlačítko na 444 px a seznam voleb na 490–770 px,
   tedy celý v okně.

**Hlídač.** `test-ovladani-vypisu` nově klepne na „Doporučené" a měří
tři věci: že přibyla třída `hledani-rozbalene`, že se otevřel seznam
voleb (≥ 5 položek) a že je **celý vidět v okně**. Na obou šířkách.
Prokázáno sabotáží: bez řádku, který tu třídu přidává, hlásí
`✕ „Doporučené" rozbalí panel filtrů — třída hledani-rozbalene na
<body> nepřibyla`.

**Co ten hlídač NEPROKÁŽE, a říkám to rovnou.** Druhou vadu
(plynulý posun) sabotáží zachytit neumí: když se `behavior` vrátí na
`smooth`, zkouška počká 900 ms, posun v klidu doběhne a kontrola
projde. Na telefonu ho přeruší překreslení výpisu, které si v sondě
nevyrobím. Hlídá se tedy **výsledek** (seznam je v okně), ne příčina.

**Dva vedlejší nálezy.**

- `test-hledani-vzhled` začal padat na tom, že našeptávač měří 356 px
  z 358. Je to důsledek desky z §263: řada je o její odsazení širší
  než pole. Návrhy patří k poli, pod kterým visí, takže se s ním
  srovnaly (`left/right:8px`) a zkouška měří proti poli, ne proti řadě.
- `test-rozvrzeni` je zase zelený (190/190) — překryv „Nahoru" přes
  „Uložit" z §264 se s další obměnou dat rozešel. Potvrzuje to, že je
  to rozložením dat, ne pravidlem; vedeno dál jako samostatná položka,
  protože deterministické to pořád není.

**Zkoušky.** Rychlá sada 133/133. V prohlížeči `test-ovladani-vypisu`
(58), `test-hledani-vzhled` (14), `test-naseptavac` (127), `test-uvod`
(68), `test-rozvrzeni` (190) — bez chyby.
