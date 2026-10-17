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
