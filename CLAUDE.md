# Jak se na Parcelce pracuje

Tenhle soubor je kontext projektu — pro člověka i pro AI, která v něm bude
pokračovat. Není to seznam přání, ale pravidla, která si web vynutil sám.
U každého je důvod; bez důvodu by se stejně neudržela.

## Co to je

Statický web (žádný server, žádný build-step kromě vlastních skriptů),
hostovaný na GitHub Pages. Data sbírá robot v GitHub Actions každých
6 hodin a commituje je do repozitáře.

- **jazyk**: JavaScript (prohlížeč, ES5-kompatibilní styl bez transpilace)
  a Node pro skripty. **Žádný Python**, žádný bundler, žádný framework.
- **mapa**: Leaflet z `vendor/` (ne z cizí CDN), tečky se kreslí na canvas
- **databáze**: Supabase jen pro účty, hlídání a zprávy. Nabídky jsou
  statický `data/opportunities.json`.

## Tři pravidla, bez kterých se to rozejde

### 1. Po každé změně zdroje spusť `node scripts/oprav.mjs`

Řetězí generátory stránek → sazbu (nezlomitelné mezery) → otisky verzí
(`?v=`) → složení SQL. Bez něj se rozejdou generované stránky se zdrojem
a `test-verze` spadne, protože otisk nesedí s obsahem.

### 2. Nový test musí hned do `.github/workflows/testy.yml`

`scripts/test-staticka.mjs` spadne, jakmile v `scripts/` leží
`test-*.mjs`, které CI nespouští. Je to schválně: test, který nikdo
nepouští, je horší než žádný — vypadá jako pojistka a není.

### 3. Každou novou pojistku dokaž sabotáží

Napsat kontrolu je snadné. Napsat kontrolu, která **umí spadnout**, je ta
práce. Postup: oprav vadu → napiš kontrolu → *rozbij opravu* → ověř, že
kontrola zčervená → vrať zpět. Bez toho se v repozitáři hromadí zkoušky,
které tvrdí, že je všechno v pořádku, protože neměří nic.

Typické způsoby, jak kontrola měří prázdno (všechny se tu už staly):
- vzorek, ve kterém ta past vůbec není → **ověř, že past je skutečná**
  (např. že surový výpočet opravdu dá jiné číslo než ten správný)
- kontrola, která si odpověď spočítá týmž kódem jako stránka → opisuje
  sama sebe a projde i s obrácenou úvahou
- tvrzení o seznamu, který je prázdný → nejdřív ověř, že něco obsahuje

## Čtyři zásady, které drží obsah poctivý

1. **Cena za metr se počítá z výměry, která kupujícímu připadne.**
   U spoluvlastnického podílu je v ceně zlomek, ale výměra celá — dělení
   jedním druhým dá číslo desetkrát nižší a z nejdražší nabídky udělá
   zdánlivý trhák. Počítá to `js/ceny.js` a **nikdo si to nepočítá sám**.

2. **Neuvěřitelná sleva není nabídka, ale varování.** „−91 % proti okolí"
   znamená podíl, chybnou cenu nebo jiný druh. Web v takovém případě píše
   „cena k ověření", ne slevu.

3. **Jedno číslo se na webu píše jedním způsobem.** `fmt()` s nezlomitelnou
   mezerou. Tři zápisy téhož počtu na jedné obrazovce už tu byly.

4. **Co se neví, se neříká.** Když zdroj neodpověděl, stojí to v datech
   u toho zdroje — ne „aktualizováno dnes" za všechno dohromady.

## Měř, než něco prohlásíš

Tenhle web má spoustu optimalizací, které se **neudělaly**, protože měření
ukázalo, že nepomáhají — a je to u nich napsané. Než sáhneš na výkon nebo
rozvržení, změř to za stejných podmínek a prostříhaně (A/B v jednom běhu).
Pozor: místní server bez komprese nadhodnocuje velikosti 3–8×, protože
GitHub Pages gzipuje.

A pozor na práh naměřený „na jednom vzorku": 20. 10. spadly v CI dvě
kontroly, které lokálně procházely, a obojí mělo tentýž kořen — číslo
vypadalo jako změřené, jenže se měřilo jen tam, kde to bylo pohodlné.
Jednou to byla mez 429 px odvozená z jediné stránky se třemi čísly (na
stránce se čtyřmi se vešla o tři pixely a v CI ji sebral posuvník),
podruhé premisa „v datech taková nabídka je", kterou určuje skladba
trhu. Mez se měří na nejhorším případě, ne na prvním, a premisa, kterou
určují data, se nepodmiňuje — vypíše se a větev se přeskočí.

A u sjednocování se ptej, co z toho je vůbec VIDĚT. 20. 10. měl web
sedm podob zaměření; samo sjednocení do jedné by vypadalo jako hotová
práce. Teprve změřený kontrast ukázal, že formulářová pole si obrys
vypínala a nahradila ho změnou okraje na 1,2 : 1 — tedy že na nich
klávesnicí nebylo vidět vůbec nic, zatímco zbytek webu má 5,5 : 1.
Počet receptů je příznak; měřit se má ten rozdíl, kvůli kterému ty
recepty existují.

A když kontrola PROJDE, zeptej se jednou, **na čem** prošla — a to
číslo si vypiš. 20. 10. se ukázalo, že úklid přelivů (oddíl 19) minul
pět ozdobných přelivů, protože hlídač četl jen dva stylopisy a do
vložených `<style>` ručně psaných stránek nedosáhl; a že vzor na rodiny
písma si zakazoval uvozovky, takže každou rodinu zapsanou od uvozovky
roky tiše pouštěl (133 viděných deklarací proti 138 skutečným). Hlídač
platí jen pro soubory, do kterých se podívá, a pro abecedu, kterou si
dovolí číst.

A „které moduly stránka potřebuje" se taky MĚŘÍ, nečte z kódu: na
`window` se dá přes `Object.defineProperty` pověsit getter, který si
zapíše první přečtení a odkud přišlo. Z úkolu „osm skriptů načítat až
při prvním použití" tak zbyly tři — zbylé čtyři se při startu opravdu
čtou (viz docs/optimalizace.md, oddíl 64).

## Komentáře

Píšou se **proč**, ne *co*. Čtvrtina souborů má v hlavičce odstavec
„proč tahle zkouška/funkce existuje" i s naměřenými čísly a s tím, co se
zkoušelo a nefungovalo. Je to nejcennější věc v repozitáři: brání tomu,
aby někdo (včetně AI) „uklidil" řešení, jehož důvod není vidět z kódu.

**Komentář, který lže, je horší než žádný.** Žádný nikoho nikam
nepošle; lživý pošle. Když se funkce odstraní nebo přestaví, komentář
u ní se musí přepsat týmž krokem — jinak zůstane popis světa, který už
neplatí, a nikdo se o tom nedozví, protože na obrazovce se nic
nepokazilo. Naměřeno (oddíl 83): patnáct řádků popisovalo v přítomném
čase barevné obtažení karty podle druhu, které na webu nikdy nebylo,
a jiný komentář tvrdil, že stylopis schová nadpis na telefonu —
pravidlo k tomu neexistuje. Když se měření v komentáři ještě hodí,
nemaže se: přepíše se na **záznam rozhodnutí** („zváženo, neuděláno,
a proč").

**Jméno třídy je slib, že existuje pravidlo.** Jméno, které píše JS
a nečte je ani stylopis, ani kód, ani zkouška, pošle čtenáře hledat
něco, co není. Hlídat se to dá jen měřením v prohlížeči (jména z DOM
proti selektorům), ne čtením zdroje — skládaná jména jako
`'opp-item ' + d.type` žádný regex spolehlivě nesloží.

**A „nikdo to nečte" je tvrzení o budoucím hledání, ne o kódu.**
Skládá se nejen psaní jména, ale i jeho ČTENÍ: `DRUHY.find((c) =>
e.classList.contains(c))` nenajde nikdo, kdo hledá
`classList.contains('sale')`. Naměřeno tvrdě (oddíl 86): smazal jsem
`d.type` z karty jako mrtvé jméno a shodil tím zkoušku, která podle
něj měří barvy odznaků. Před takovým mazáním patří obyčejný
`grep -rn 'jméno'` přes celý repozitář, bez vzoru — a pak **celá** sada
v prohlížeči, ne vybraná podmnožina.

## Testy

237 zkoušek v CI (116 bez prohlížeče, 121 s ním) ve třech úlohách:
rychlá `testy` a dvě směny v prohlížeči (`v-prohlizeci`,
`v-prohlizeci-2`) — ty běží vedle sebe, každá kolem 31 minut. Místně
jedna sada za druhou, dohromady kolem 50 minut:

```
bash /tmp/suite.sh        # potřebuje PW_CHROMIUM a PK_LEAFLET_DIR
```

Browser testy sdílejí port 8310 — nesmí běžet dva naráz.
**Sabotáž se vrací ze ZÁLOHY souboru, ne přes `git checkout --`** — ten
smaže i nezacommitované opravy v témže souboru (stalo se: zmizela
oprava `test-roadmap`, která sčítá obě směny). A **sabotovat se musí ten
balíček stylů, který stránka opravdu načítá**: úvodní stránka má
`css/uvod.min.css`, okresní `css/region.min.css`; sabotáž ve
`css/styles.min.css` pro ně neudělá nic a vypadá to jako slepá zkouška.
**Úvodní stránka stahuje `data/mapa.json`, ne celek.** Je to týž soubor
bez duplicit a bez pole `url` (−19 kB gzipem, čtvrtina toho, co se
přenese; měření v `docs/optimalizace.md` 58). Na adrese inzerátu přitom
visely dvě věci, které se bez ní rozbijí TICHO: slučování duplicit
(`klicZdroje` v js/hlidani-logika.js — proto se duplicity odstraňují už
v překladu) a historie cen (`data/zlevneni.json` je proto klíčovaný
klíčem POZEMKU, ne nabídky). Klíč uložených pozemků adresu nepoužívá
a používat nesmí. Když se do řezu něco přidává nebo ubírá, hlídá to
`scripts/test-data-rezy.mjs` znak za znakem.

**Odstup nikdy nepatří do `style=`** — ani v šabloně, ani ve značkách
skládaných v JavaScriptu. Hlídá to `scripts/test-odstupy.mjs` (čte
stylopisy, stránky, generátory i `js/*.js`); výjimky jsou dvě a mají
napsaný důvod: `scripts/mail-sklad.mjs` a `js/mereni-hlavicky.js`.
V atributu smí zůstat jen to, co je **daty**: šířka pruhu v procentech,
poloha špendlíku. Nestandardní hodnota dostane **jméno podle role**
(`okr-mezi`, `okr-dal`, `okr-tesne`, `okr-zacatek`, `pod-textem`,
`tesne-nahore`, `mc-prazdno`).

Tři věci, na kterých to při přepisu stojí (naměřeno, `docs/optimalizace.md`
55–56):
1. **Nové jméno třídy si nejdřív ověř grepem po celém stylopisu.**
   `okr-blok` už bylo obsazené a přidalo odstavci 25 px výplně a linku.
2. **Jeden prvek v selektoru přebije tři třídy.** `.clanek .rules-sect > p
   + .rules-note` vyhraje nad `.rules-sect > .rules-note.pod-textem`,
   i když stojí v souboru výš.
3. **V mřížce se okraje neslévají.** Odstup mezi dvěma deskami proto
   nese deska PŘED mezerou (`:has(+ .add-card){margin-bottom}`), jinak
   se na širokém displeji přičte k tomu, co si karta nese sama.

**Vložený styl stránky pozemku se píše v `css/pozemek-vlozeny.css`**, ne
ve `pozemek.html` — tam ho vkládá už očištěný
`scripts/vloz-styl-pozemku.mjs` (a pak ho dědí i ~2 000 vygenerovaných
stránek). Pravidlo dopsané rukou do `pozemek.html` zmizí při příštím
sestavení; hlídá to `scripts/test-vlozeny-styl.mjs` znak po znaku. V CI proto
jedou ve **dvou směnách** (`v-prohlizeci`, `v-prohlizeci-2`), každá ve
vlastní úloze na vlastním stroji, kolem 31 minut; místně se pouští
jedna sada za druhou.

**Tři pasti, které udělají ze zelené zkoušky slepou** (první dvě naměřeny
15. 10., třetí 19. 10.; popsané v `docs/optimalizace.md`, položky 7 a 37):

1. **Dotyk se musí říct.** Pravidla pro telefon stojí za
   `@media (pointer: coarse)` a `(hover: none)`, ne za šířkou okna.
   Kontext bez `hasTouch` vykreslí v okně 390 px rozvržení monitoru,
   takže 36 pravidel stylopisu zkouška nevyhodnotí vůbec.
2. **Servisní pracovník se musí vypnout** (`serviceWorkers: 'block'`),
   kdykoli se v jednom kontextu něco podstrkuje přes `ctx.route`
   a naviguje se víckrát. Od druhé navigace obsluhuje soubory
   pracovník a jeho dotazy přes `route` NEJDOU — podstrčený
   `config.js` přestane platit a stránka se zeptá opravdové databáze.
3. **Čeká se na stav, ne na hodinky.** Karta rychlého výběru odlétá
   300 ms a až potom se vykreslí další (`rvRozhodni` v `js/main.js`).
   Zkouška, která po stisku čekala 260 ms, sahala doprostřed toho okna
   — a `p.type('#rv-pozn', …)` do SKRYTÉHO textarea „napíše" bez
   chyby: klávesy spadnou do stránky a nikam se nezapíšou. Stejně
   mlčky lže `p.focus` na skrytém prvku. V CI (pomalejší stroj) tím
   spadl běh 553 na třech kontrolách poznámky, zatímco lokálně to
   procházelo. Místo prodlužování čekání se čeká na pozorovatelný stav
   (`waitForFunction`: karta je na místě a nemá třídu `odlet-`,
   políčko má `hidden === false`, poznámka je v `localStorage`).
   A kde se měří, že se něco NESTALO, měří se hned po stisku: obsluha
   klávesy přilepí třídu `odlet-` synchronně, takže na hodinky není
   důvod čekat.
   **Ale pozor na opačnou chybu:** `waitForTimeout` někdy NENÍ čekání na
   připravenost, ale **měřicí okno** — `test-stabilita` jím sbírá poskoky
   rozvržení (CLS), `test-pohyb` jím nechává dojet animaci značky (ta DOM
   nemění) a `test-stabilita` jím čeká, až aplikaci VYPRŠÍ lhůta hlídky
   vršku. Zkrátit je na „DOM utichl" znamená, že zkouška projde, protože
   se nekoukala — nebo spadne na vadě, která v aplikaci není. U všech je
   to na místě napsané.
   **A pozor na ručně vyvolanou událost:** `page.click()` si playwright
   opakuje, dokud prvek nereaguje, ale `evaluate` s
   `dispatchEvent(new Event('input'))` se provede hned — když ještě
   není navěšená obsluha, neudělá nic a zkouška měří cizí stav. Přesně
   tím spadl v CI běh 556 (`test-shoda`). Čeká se proto na VÝSLEDEK té
   události, ne na dobu po ní.
   **A po ručně vyvolané události se čeká na VÝSLEDEK.** Filtr, řazení
   i hledání vedou v js/main.js na jedinou `renderList()`, která si
   přičte `window.PK_VYKRESLENI` — z toho je `vykresleniPo(p, zásah)`.
   Dvě pasti pod tím (naměřeno 20. 10., `docs/optimalizace.md` 61):
   `zapisAdresu()` zapisuje adresu ODLOŽENĚ (setTimeout), takže
   překreslení ještě neznamená stav v adrese; a `html{scroll-behavior:
   smooth}` dělá z `click` i `fill` plynulé rolování, takže se geometrie
   měří v půlce pohybu — na to je `reducedMotion: 'reduce'` v kontextu,
   ne delší čekání. Čekat naslepo na „něco se změnilo" nejde tam, kde se
   píše týž text jako posledně: pak se čeká na pořadí „zavřelo se →
   otevřelo se".
   Pomůcky: `scripts/zkouska-pripraveno.mjs` (čekání na stav),
   `scripts/zkouska-pad.mjs` (při pádu vypíše, kam zkouška došla —
   jinak v CI zbyde jen stopa výjimky a ani jedna ✕).

---

## Designová soustava — jeden blok, ne tři sta komentářů

Formát je převzatý z `design-md-format=spec` (gstack). Důvod: tokeny
byly rozsypané po komentářích v `css/styles.css` a po 2 300 řádcích
`docs/optimalizace.md`, takže se k nim nedalo dostat jinak než čtením
celého stylopisu. Tohle je jejich soupis na jednom místě. **Zdrojem
pravdy zůstává `css/styles.css` a zkoušky** — když se rozejdou, platí
ony; tenhle blok se má srovnat.

```yaml
pismo:
  rodina:   Inter (display, ui i mono — jedna rodina, podřezaná v fonts/)
  velikosti: [11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96]
  vahy:      [400, 500, 600, 700]
  prokladani: [-0.04em, -0.03em, -0.02em, -0.01em, 0, .02em, .07em, .1em]
  radkovani: nejvyse 1.6
  pozor:     "hodnota, která se nemá kde zlomit (číslo s jednotkou za nezlomitelnou mezerou), se zmenšuje podle NAMĚŘENÉ šířky, ne podle počtu znaků — při devíti znacích je „Podíl 1/2“ 105 px a „neuvedena“ 130,8 px. Dělá to pzVelikostHodnot v js/pozemek.js, hlídá scripts/test-parametry.mjs."
  hlida:     scripts/test-pismo.mjs, test-typografie.mjs, test-pisma.mjs
barvy:
  znacka:        "#004F2F"   # plná plocha hlavní akce
  znacka-tmava:  "#0F5C3B"   # --znacka, text a linky
  znacka-svetla: "#2B7652"   # --znacka-svetla
  text:          "#101513"
  plocha-stranky: "#F2F4F3"
  plocha-zapustena: "#EDEFEE"
  panel:         "#ffffff"   # i --plocha-plovouci: plná, nikdy průsvitná
  linka:         "rgba(16,21,19,0.55)"
  druhy:
    prodej:  "#4361B8"
    drazba:  "#CC6B33"
    exekuce: "#8C2F1E"
    obec:    "#277686"
  hlida:     scripts/test-odstiny.mjs, test-tokeny.mjs, test-okraje.mjs
odstupy:
  stupnice: [0, 1, 2, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 128]
  pravidlo: "přísná čtyřková mříž; 1 a 2 px jsou vlásečnice a mezery v řádku, ne odstupy rozvržení"
  pozor:    "klíčový rozměr se ŘÍKÁ, ne dopočítává z odsazení — dotykový terč min-height:44px, hlavička min-height:var(--vyska-hlavicky). Dvě místa na tom spadla, když mříž ubrala 2 px (viz docs/optimalizace.md, položka 41)."
  hlida:    scripts/test-odstupy.mjs, test-rozvrzeni.mjs, test-hlavicka.mjs
zaobleni:
  r-xs: 6px     # drobnosti uvnitř tlačítek
  r-sm: 10px    # --r-plocha: karty, panely
  r-md: 14px    # --r-ovladani: tlačítka, pole, rozbalovátka
  r-lg: 20px    # --r-obraz: mapa, fotky
  r-pill: 999px # ODZNAK (zapínatelný filtr) a kulaté tlačítko s ikonou
  pravidlo: "co se ovládá, má --r-ovladani; pilulka patří odznaku"
  hlida:    scripts/test-zaobleni.mjs
casy:
  rychly: .12s   zakladni: .2s   pomaly: .4s
stavy:
  vypnuto:    "opacity .45, cursor not-allowed, bez stínu a bez reakce na hover"
  pracuje-se: "aria-busy=true → opacity .7, cursor progress"
  hlida:      scripts/test-afordance.mjs
dotyk:
  terc: "nejméně 44 px pod @media (pointer: coarse)"
  hlida: scripts/test-dotyk.mjs
strop:
  syta-znackova-plocha: "nejvýš 3 prvky na index.html"
  hlida: scripts/test-hierarchie.mjs
prelivy:
  pravidlo: "ozdobný přeliv na ploše ne — plná barva. ZŮSTÁVAJÍ: masky (konec posuvného pruhu), mřížková textura, závoj nad fotkou (drží čitelnost bílého písma) a šimr kostry načítání; smazat je = vzít afordanci nebo kontrast"
  hlida:    scripts/test-predloha.mjs, test-kontrast.mjs, test-tvary.mjs
zakazano:
  - "backdrop-filter kdekoli (sklo a rozostření — zrušeno 19. 10., viz oddíl 32)"
  - "SVĚTLÁ průsvitná plocha pod TMAVÝM textem: kontrast pak závisí na
     tom, co je pod ní. Opačný směr (tmavá plocha + bílý text) dovolen
     je — má spočitatelný strop: i nad bílou fotkou vyjde 8,19 : 1.
     Tak jsou udělané odznaky na fotkách karet."
  - "font jiný než Inter bez podřezání v fonts/ (test-pisma pozná znak mimo sadu)"
  - "nové barvy mimo tokeny"
```

### Dva vizuální směry před psaním kódu

Když se navrhuje nová sekce nebo se předělává vzhled stávající,
**nejdřív se ukážou dvě podoby jako snímky a majitel si vybere** —
teprve pak se píše kód. Důvod je úsporný: dvě varianty v prohlížeči
stojí pár minut, kdežto nasazená a pak zamítnutá přepsaná sekce stojí
běh celé sady zkoušek a ještě jednou tutéž práci.
