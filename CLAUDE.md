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

**Hledat jméno proměnné vzorem `\b…\b` nestačí.** `\bmap\b` se trefí
i doprostřed `'map-podklad'` nebo `'map-filters'`, protože pomlčka je
hranice slova — a napočítá o tři čtvrtiny míst víc, než kolik jich je.
Jméno v kódu se hledá pohledem vzad a dopředu:
`(?<![\w'"-])map(?![\w-])`. Chytilo se to dvakrát, pokaždé na tomtéž
(docs/optimalizace.md, oddíly 65 a 102).

**A příkaz nekončí jen středníkem.** Rozkráječ, který dělí tělo funkce
podle `;` na úrovni jedna, slije `if (…) { … }` s tím, co je za ním —
blok totiž středníkem nekončí. Dva takové bloky tak zůstaly 22. 10.
nenalezené, a každý z nich znamenal ŽÁDNÝ výpis a chybu v konzoli.
Dělit se musí i na `}`, a rozlišovat je od `} else`, `} catch`,
`} finally` a `});`.

**Sledovač vložený tam, kde byla hodnota `null`, je pravdivý — a tím
změní tu větev, kterou měříš.** Pokus nahradit `map` objektem, který by
nahlásil každé sáhnutí, skončil hned: `if (map) …` se obrátilo a kód,
který se měl odložit, se provedl rovnou. Když se měří, CO se bez
hodnoty stane, musí ta hodnota zůstat nepravdivá; seznam míst pak dá
rozkráječ a chyby v konzoli.

**Odložení není hotové tím, že se práce zapíše do fronty.** Fronta
zachytí jen to, co zavolal příkaz v odloženém bloku. Co proběhlo
naprázdno jinde — v tomhle případě čtyři věci, které volá
`renderList()` — se musí dohnat jmenovitě a každá z nich musí snést
druhé zavolání. Seznam takových míst se nehádá: `map` dostal pojistku
`if (!map) return`, a každé místo, které se po postavení mapy
neobnovilo samo, se našlo jako chybějící tečka, obrys nebo zámek.

**Mrtvou pojistku pozná jedině odebrání.** `chciMapu()` v přepínači
pohledu vypadalo nutně — přepnutí na mapu přece knihovnu potřebuje.
Po odebrání zůstala zkouška 31 z 31: `boot()` je jedna úloha
prohlížeče, takže dřív než doběhne, nemá klepnutí jak dorazit, a na
konci `boot()` se o knihovnu říká vždycky. Pojistka, která nemá jak
zafungovat, je horší než žádná — vypadá, že se o něco stará.

**Přesunout stylopis znamená přepsat kaskádu.** Když se `<link>`
přestane psát do HTML a začne vkládat z JavaScriptu, skončí na KONCI
hlavičky — a tím přebije všechno, co jsme napsali my, pokud má stejnou
specifičnost. Leafletovo `display:block` na `.leaflet-marker-icon` tak
22. 10. porazilo naše `.pk-shluk-obal{display:flex}` a číslo v odznaku
shluku se přestalo středit: o 8 px vedle, na obrazovce nepoznatelné,
v zeměpisu 3 km. Vkládá se proto `insertBefore` před první stylopis
v hlavičce, ne `appendChild`. A hlídá to zkouška, která měří
GEOMETRII, ne vzhled (scripts/test-mapa.mjs, oddíl 1a).

**Vzorek pevným krokem není malý vzorek — je JEDEN vzorek.** Zkouška,
která si vezme každou n-tou stránku a chce na nich aspoň N nálezů,
nepadá a neprochází podle webu, ale podle toho, kam krok dopadl.
22. 10. čekalo ve vzorku 24 stránek ~11 verdiktů o ceně (má je 47,6 %
nabídek) a vzorek chytil sedm — CI červená, na webu nic. Kde se měří na
vzorku, patří k němu PRÁH NA TO, CO SE ZMĚŘILO: vzorek se rozšiřuje,
dokud nálezů není dost, a strop drží dobu běhu.

**Co porovnáváš, scvrkni stejně.** Zkouška brala jméno obce z HTML
stránky okresu, kde prošlo českou sazbou (`Klobouky u\u00a0Brna`), a
hledala ho v textu odznaku, který si předtím scvrkla přes `\s+` — a to
`\u00a0` zahrnuje. Porovnávaly se dva zápisy téhož jména a `indexOf`
vracel −1. Mina ležela ve zkoušce od začátku: pevnou mezeru má 18 z 319
odkazů na obec (5,6 %) a spustila ji až data, která dvě z nich poslala
na první místo. Jedna strana normalizovaná a druhá ne je chyba, která
počká na vzácný vstup. A obráceně: když zkouška spadne na datech a web
je v pořádku, podezřelý je ZÁPIS, ne hodnota. A platí to i obráceně:
**změna vzhledu textu je změna dat pro každou zkoušku, která ten text
čte.** Když web začal sázet česky i v prohlížeči (oddíl 107), spadly
čtyři zkoušky — a ani jedna kvůli webu.

**Vzorek je tvrzení o tom, jak stránka vypadá — a musí být pravdivé.**
Postavit prvek jiným tagem, než ho web používá (`<button>` tam, kde
stránka skládá `<a>`), vyrobí nález o vzorku, ne o webu — a to je horší
než díra v pokrytí, protože se to tváří jako práce. U každého vzorku
patří napsat, z čeho je odvozený, a prvky v něm nesou `id` se slovem
„vzorek", aby bylo v nálezu vidět, odkud je.

**Zkouška, která měří jen to, co vidí odhlášený, neměří celou stránku.**
`muj-inzerat.html` je v seznamu zkoušky okrajů od začátku, ale odhlášenému
se seznam inzerátů nevykreslí — celý řádek s tlačítky vzniká až z odpovědi
databáze. Zkouška tedy otevřela stránku, naměřila přihlašovací pole a
odešla se zelenou; mezitím mělo tlačítko „Smazat" hranici 1,60 : 1 proti
požadovaným 3,0 (WCAG 1.4.11). Kde se ovládání vykresluje až po
přihlášení, patří ke zkoušce VZOREK postavený tak, jak ho stránka skládá —
a do vzorku jen to, co ta zkouška doopravdy měří.

**A sabotáž, která neshodila nic, může znamenat, že zkouška měří něco
jiného, než si myslíš.** Táž zkouška přežila zvýšení počtu v `js/ceny.js`
— protože očekávanou hodnotu si počítá týmž modelem ze zdroje, takže se
posunou obě strany. Složila ji až změna v servírované kopii
`js/min/ceny.js`. Dokud nevíš, PROČ sabotáž neprošla, nevíš ani, co ta
zkouška hlídá; a když to zjistíš, patří to k ní napsat.

**Živý stav není konec časové osy.** Historie ceny se skládá
z uzavřených období v archivu a nakonec z živé nabídky — a ten poslední
bod se přilepoval na konec bez porovnání dne. `od` živé nabídky je
přitom VĚK INZERÁTU, ne den, kdy začala platit dnešní cena: když
nabídka ze zdroje zmizí a znovu se objeví, přinese si původní, starší
datum. 22. 10. se tím jedna historie obrátila a vypadala jako zdražení
tam, kde pozemek zlevnil o 25 %. Naměřeno: z 126 živých nabídek
s archivem jich pět nese starší `od`, a jen u jedné se k tomu liší
cena — proto se to objevilo až teď a jen v CI, na datech, která robot
dovezl po mém posledním běhu sady. Dolní mez je `do` posledního
uzavřeného období: datum si nevymýšlíme, jen se nelže o pořadí.
Obecně: **kde se jedna řada skládá ze dvou zdrojů, patří k napojení
porovnání, ne důvěra v pořadí.**

**Dokumentace není použití — a tím pádem ani důkaz.** Hlídač mrtvých
pravidel (scripts/test-mrtve-styly.mjs) hledá jména tříd v celém
repozitáři a z HTML i JS si správně odstraňuje komentáře: věta o třídě
není její použití. Markdown ale nečistil nijak, takže próza o kódu
platila za kód. 22. 10. to zaskočilo: popis kaskádové pasti výše napsal
jméno skládané Leafletovy třídy celé, hlídač ji uznal za doslova
přítomnou a výjimku pro ni prohlásil za zbytečnou — ačkoli se ta třída
pořád skládá za běhu. Opraveno u kořene: `.md` se do hledání nepočítá.
Změřeno před změnou, aby to nebyla slepá úprava: bez Markdownu nezmrtví
ani jedno pravidlo a potřeba je všech osm výjimek místo sedmi. Píše-li
se tedy nějaká stráž „hledám to slovo kdekoli", patří k ní seznam
míst, kde zmínka použitím NENÍ, a ne jen seznam přípon.

**A sabotáž umí ukázat chybu v novém kódu, ne v sabotáži.** Vrácení
značky `<script>` zpátky mělo shodit pět kontrol o řezu; shodilo deset,
protože nová cesta „knihovna už je na světě při startu" sahala na
proměnné, které v té chvíli ještě nikdo nenastavil. Když sabotáž shodí
víc, než co popírá, ten přebytek je nález.

**Dva naměřené časy se porovnávají jen tehdy, když jsou měřené stejně.**
Čas vykreslení výpisu zjištěný opakovaným dotazem po 10 ms je až o těch
10 ms pozdější, než ve skutečnosti byl; čas zdroje ze záznamu
`performance` je přesný. Na localhostu byly ty dvě chvíle 22 ms od sebe
— kontrola by v CI kolísala. Místo porovnávání časů se zaznamenává
OKAMŽIK: synchronně při vložení značky `<script>` se zapíše, jestli už
karty ve výpisu ve stránce jsou. To kolísat nemá čím.

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

**U barvy nerozhoduje její hodnota, ale jak vypadá tam, kde se
používá.** Průhlednou barvu se musí měřit PO SLOŽENÍ přes podklad
a při těch průhlednostech, které se opravdu používají. Naměřeno
(oddíl 91): patnáct barev bez jména mělo od pojmenované dvojnice
odchylku 0,7–4,8 v OKLabu, ale po složení 0,08–1,42, tedy nic — byly
to barvy z paletky napsané přibližně, ne nové barvy. A obráceně:
#1F5138 vypadala s 2,48 jako „totéž", při průhlednosti 0,7 ale vyšla
2,80 a jméno dostala.

**U odkládání měř dvakrát a věz, co ti měření zaslepilo.** „Globál se
při načtení nepřečte" má tři různé příčiny a každá vede k jinému
spouštěči: nikdy se nepoužije, použije se až po rolování, nebo až
odpoví cizí server. A u modulu, který se spouští SÁM (posluchač na
DOMContentLoaded), neříká nečtený globál vůbec nic — je to jen export.
Naměřeno v oddílu 88: ze čtyř nul byly dvě nálezy a dvě past.

**Kdo zavede nový zápis, zavede ho i všem čtenářům.** Zkoušky čtou
zdroje vzory, a vzor umí jen tu abecedu, kterou dostal. Naměřeno
(oddíl 87): průhledné barvy se začaly psát `rgba(var(--c-ok-rgb),.12)`,
což na obrazovce nezměnilo nic (spočítaná hodnota je byte za byte
stejná), a hned nato dvě zkoušky v rychlé sadě hlásily nesmysly —
jedna „čte test vůbec styles.css?", druhá vlastní stín na stránce,
která se nezměnila. Správná oprava je naučit čtenáře nový zápis
rozbalit, nikdy ne ubrat, co měří.

**A „nikdo to nečte" je tvrzení o budoucím hledání, ne o kódu.**
Skládá se nejen psaní jména, ale i jeho ČTENÍ: `DRUHY.find((c) =>
e.classList.contains(c))` nenajde nikdo, kdo hledá
`classList.contains('sale')`. Naměřeno tvrdě (oddíl 86): smazal jsem
`d.type` z karty jako mrtvé jméno a shodil tím zkoušku, která podle
něj měří barvy odznaků. Před takovým mazáním patří obyčejný
`grep -rn 'jméno'` přes celý repozitář, bez vzoru — a pak **celá** sada
v prohlížeči, ne vybraná podmnožina.

**`hidden` na živé oblasti znamená, že ta oblast neexistuje.** `hidden`
je `display:none`, a takový prvek v přístupnostním stromu NENÍ — text
vložený do skryté `aria-live` oblasti tedy není změna, kterou by
odečítač viděl, a oblast, která se do stromu přidá už s hotovým textem,
je nový uzel, ne aktualizace. Pořadí „nastav text, pak odkryj" vypadá
v kódu nevinně a na obrazovce funguje bezchybně; chybí jen to, co na
obrazovce není vidět. Naměřeno (oddíl 92) na všech třech obsluhách
toastu. Platí to i obecněji: **vada, která není vidět, se nenahlásí
sama** — stejný druh nálezu jako tlačítko, které se nekreslilo nikde
(oddíl 85), a oddíl s obsahem na `opacity:0` (89).

**Co se na stránce změní, se musí dát i slyšet — a jde to spočítat.**
Nasaď MutationObserver na `<body>`, udělej to, co by udělal člověk,
a u každého změněného místa se podívej, jestli leží v živé oblasti.
Naměřeno (oddíl 93): po napsání hledání se na úvodní stránce změní 19
míst a v živé oblasti je jedno — a ani to není ono. Devatenáct ku jedné
není dojem, je to číslo. U takového ohlášení pak platí tři věci, každá
vykoupená vlastní chybou: čeká se, aby odečítač nemluvil přes psaní;
porovnává se DOTAZ, ne ta věta (týž počet u jiného dotazu by hlášení
spolkl); a základ se bere hned při prvním vykreslení, ne až v čekajícím
hlášení (jinak ho zruší dotaz napsaný do 700 ms).

**A nula naměřená špatným zadáním vypadá stejně jako nula skutečná.**
Naměřeno (oddíl 94): „po klepnutí na Přihlásit se se nezmění nic" bylo
moje zadání, ne vada — do políčka jsem dal neplatný e-mail a odeslání
zastavila vlastní kontrola prohlížeče, takže se obsluha nespustila.
V každé sadě kontrol proto patří jedna, která měří jen to, že BYLO CO
měřit. A v témž oddílu i opačná stránka té věci: jedna změna mimo živou
oblast je horší nález než devatenáct — čím je stránka prostší, tím
dražší je mlčení.

**Placeholder není jméno pole.** Je to nápověda, co napsat, a mizí
právě ve chvíli, kdy se pole používá. Naměřeno (oddíl 95): z 946
ovladačů na dvanácti typech stránek neměl přístupné jméno jeden jediný
a byl to textarea s placeholderem. Hlídá to scripts/test-aria-cile.mjs.
**A 945 z 946 je dobrá zpráva, kterou je stejně potřeba zapsat** —
jinak se za rok nepozná, jestli se ta jedna výjimka spravila, nebo
jestli se jen přestalo měřit.

**Zelená zkouška není hotová zkouška: sabotuj KAŽDOU kontrolu zvlášť.**
Naměřeno (oddíl 96): zkouška na zaměření klávesnice měla 32 zelených
kontrol a dvě z nich byly PLANÉ — shodit se nedaly ničím. Obě z téhož
důvodu: měřily na prvku, který měl záchranu (políčko s `id` se najde
podle id i při rozbitém vracení; první karta ve výpisu zůstane první,
takže klíč i pořadí ukazují na totéž), takže rozbité chování vypadalo
stejně jako správné. U každé kontroly si proto řekni větu „co by
vypadalo stejně, i kdyby to bylo rozbité" — a změř to tam, kde žádná
záchrana není. Pozor i na stav, který si kontroly přestavují navzájem,
a na to, že `page.reload()` čistou stránku nedělá: web si stav zapisuje
do adresy.

**A měř ve stavu, do kterého se člověk dostane.** `click()` ze skriptu
funguje i na prvek, který není zaměřitelný a není vidět — sonda pak
poslušně naměří chování, které v životě nenastane. Naměřeno (oddíl 97):
„okno rozsahu ceny nevrací zaměření" byl artefakt, protože jsem ho
otvíral z pilulky v zavřeném `<details>`; s otevřeným panelem je to
okno v pořádku a změny, které jsem podle toho „nálezu" udělal, jsou
vrácené. Než se z měření stane nález, musí být jasné, že se k tomu
prvku dá dojít: jde zaměřit a hit-test v jeho středu vrací jeho vlastní
prvek. **A slib v atributu je závazek na všechno, co znamená:**
`aria-modal="true"` není jen vzhled — je to zaměření dovnitř, zámek
tabulátoru, Escape a vrácení zaměření. Tři ze čtyř oken ho napsaná
měla a nedržela.

**Hláška nad formulářem a chyba u pole nejsou totéž.** Živá oblast to
řekne jednou a pak je to pryč; `aria-invalid` + `aria-describedby` na
poli to řeknou vždycky, když se k němu člověk vrátí — a nasadit se
musí DŘÍV, než se tam přesune zaměření, protože odečítač čte pole ve
chvíli příchodu. Naměřeno (oddíl 99): na pridat.html nebylo ani jedno
z obojího. Má být obojí.

**A lokálně zelená zkouška neznamená zelená v CI, dokud je nástroj
v obou jiný.** CI si Playwright instaluje v každém běhu nepřipnutý
(`npm install playwright-core playwright`), takže běží na nejnovějším;
lokálně je v node_modules 1.49.1. Naměřeno (oddíl 101): v 1.64 už
`page.accessibility` NENÍ, takže kontrola prošla lokálně a v CI spadla
na hlášku o webu. Co je citlivé na verzi, změř v té, kterou si
nainstaluje CI (instalace do vedlejší složky a jeden `node -e` to řekne
za půl minuty), a strom čti přes CDP, ne přes obal. **A `try/catch`
kolem měření umí udělat z poruchy nástroje nález o webu** — když se
měření nepovede, musí to kontrola říct jako „nepovedlo se změřit".

## Testy

250 zkoušek v CI (120 bez prohlížeče, 130 s ním) ve čtyřech úlohách:
rychlá `testy` a tři směny v prohlížeči (`v-prohlizeci`,
`v-prohlizeci-2`, `v-prohlizeci-3`) — ty běží vedle sebe, v CI 18 až
22 minut samotných zkoušek (naměřeno v běhu 655). Místně jedna sada za
druhou, dohromady kolem 65 minut:

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
jedou ve **třech směnách** (`v-prohlizeci`, `v-prohlizeci-2`,
`v-prohlizeci-3`), každá ve vlastní úloze na vlastním stroji, kolem
20 minut; místně se pouští jedna sada za druhou. Rozdělené jsou podle
NAMĚŘENÉHO času, ne podle počtu (oddíl 134 v `docs/optimalizace.md`) —
kdo přidá zkoušku, nemusí nic přepočítávat, ale po větší změně se to
má přeměřit.

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
   **A pozor, co se tím vlastně simuluje.** Zkouška, která vstup
   napíše (`window.scrollTo`, `dispatchEvent`), nesimuluje jen
   prohlížeč — simuluje i člověka, protože aplikace ty dva od sebe
   nerozezná. `test-stabilita` takhle vyžadoval, aby stránka srovnala
   nahoru „obnovenou polohu" zapsanou jako `scrollTo(0, 900)`, a držel
   tím v kódu vadu: hlídka vršku srovnávala KAŽDÉ první zarolování, i to
   lidské (§209). Kde se simuluje stav prohlížeče, musí se vyrobit
   prohlížečem (obnovit stránku, zakrýt vlastnost init-skriptem), ne
   zápisem, který umí i uživatel.
   **A pozor, že stylopis má `scroll-behavior:smooth`:** každé
   `scrollTo` ze zkoušky se tím ROZJEDE, takže kontrola měří cestu, ne
   cíl. Tím prošla sabotáž „srovnávej plynule" — hlídka srovnávala
   z 30 px, a to stihne i animace. Kde se měří poloha, roluje se
   `behavior:'instant'`.
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
   **A kde se spoléhá na SERVER, čeká se na potvrzení, ne na odeslání.**
   `waitForRequest` říká jen „požadavek opustil prohlížeč" — server
   v té chvíli ještě dočítá tělo a nemá zapsáno. Zkouška, která za tím
   zavře prohlížeč nebo otevře druhý a ptá se účtu, tím měří závod:
   `test-poznamky` takhle padal v CI 781 a lokálně nikdy (§215).
   Čeká se na `waitForResponse`. Kde je ten požadavek SÁM tím měřeným
   tvrzením (`test-ceny-hledani`: „rejstřík se stáhne, až když se do
   pole klepne"), je `waitForRequest` naopak správně.
   **A pozor, že web má přechody:** zkouška, která prvku dosadí barvu
   a vypočtený styl přečte hned, dostane ještě tu PŘED přechodem.
   `test-najeti` tím přestal měřit cokoli (143 → 0 prvků, §215). Na to
   je `reducedMotion: 'reduce'`, ne čekání.
   **A kdo si dosazuje stav z CSS, musí počítat celý kaskádový spor.**
   Specificita jen mezi pravidly `:hover` nestačí — pravidlo bez
   `:hover` může být silnější a dosazená barva se na obrazovku nikdy
   nedostane. `test-najeti` tím ohlásil kontrast 1,90:1 na zapnutém
   filtru „Vše", který bílý text má a nikdy ho neztratí (§215).
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
  nejmensi-veta: "12 px. Jedenáctky nesou štítky, čísla os a značku odkazu ven — celá věta pod dvanáctkou je nehoda, ne záměr (hlídá blok 6a2 v scripts/test-rozvrzeni.mjs)."
  pozor:     "hodnota, která se nemá kde zlomit (číslo s jednotkou za nezlomitelnou mezerou), se zmenšuje podle NAMĚŘENÉ šířky, ne podle počtu znaků — při devíti znacích je „Podíl 1/2“ 105 px a „neuvedena“ 130,8 px. Dělá to pzVelikostHodnot v js/pozemek.js, hlídá scripts/test-parametry.mjs."
  hlida:     scripts/test-pismo.mjs, test-typografie.mjs, test-pisma.mjs
barvy:
  znacka:        "#004F2F"   # plná plocha hlavní akce
  znacka-tmava:  "#0F5C3B"   # --znacka, text a linky
  znacka-svetla: "#2B7652"   # --znacka-svetla (jen na bílém)
  znacka-na-tmave: "#5CBC93" # --znacka-na-tmave, akcent na tmavé desce (7,01 : 1)
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
hlava-stranky:
  pravidlo: "KAŽDÁ stránka s obsahem začíná TMAVOU DESKOU: zpětný odkaz, odznak-pilulka, h1, případně úvodní věta nebo čísla. Jsou na ni tři značky (.st-hlava, .add-hero:not(.app-hero), .okr-band), ale JEDNA sada tokenů --pas-* — kdo potřebuje na desce novou barvu, přepíše token v tom rozsahu, ne pravidlo."
  vyjimka:  ".app-hero (Hlídání, Zprávy, Můj inzerát) zůstává světlá — tam se pracuje a deska by ubrala místo. Patička taky: --pas-plocha-paticka se vyhodnocuje až u ní."
  odznak:   "pilulka (--r-pill). Ručně psané stránky nesou .st-odznak, vygenerované .eyebrow uvnitř desky; vzhled sdílejí jedním pravidlem. Obočí MIMO desku (.section-head) zůstává čárkou — to je nadtitul oddílu, ne odznak stránky."
  akcent:   "na desce --znacka-na-tmave, NIKDY --znacka-svetla (ta má na #12241A 2,63 : 1)"
  hlida:    scripts/test-kontrast.mjs, test-jeden-styl.mjs, test-hlavicka-stranky.mjs
u-hrany:
  pravidlo: "na telefonu má blok s vlastní plochou jen dvě správné polohy: 0 px (schválně od kraje ke kraji) nebo aspoň 16 px. Cokoli mezi tím vzniká rozdílem dvou čísel, která se měla rovnat — záporný okraj se proto píše z tokenu (calc(-1 * var(--okraj-stranky))), ne ručně."
  plovouci: "prvek přilepený k hraně okna se počítá z PRUHU vedle obsahu ((100vw − strop obsahu)/2), ne z okna. Pevné odsazení platí jen pro šířku, na které se zrovna dívalo."
  hlida:    scripts/test-u-hrany.mjs, test-nahoru.mjs
vypis-nabidek:
  rám:      "karta je karta NABÍDKY, ne rám kolem seznamu karet — výpis stojí na ploše stránky (.okr-blok), ne v .add-card. Výkladové bloky kartou zůstávají."
  sloupce:  "od 1200 px dva sloupce; v užším sloupci se parametry nevejdou se zdrojem do jedné řady, takže mají celou šířku textu a zdroj je pod nimi"
  hlida:    scripts/test-seznam-nabidek.mjs
cenovy-stupen:
  pravidlo: "slovo o ceně stojí na dvou místech (odznak u ceny, verdikt níž) a rozhoduje o něm JEDNA funkce cenovyStupen() v js/pozemek.js. Odznak nese jen slovo a odkaz; větu, místo srovnání a počet nabídek nese verdikt."
  proc:     "verdikt začínal na telefonu průměrně na y=1157 px, cena na 580 — hlavní argument stránky byl pod ohybem. Odznak je na 673."
  bez-barvy: "odznak nenese barevnou pilulku; rozlišuje slovo, ne odstín — a tím ho má i ten, kdo barvy nerozezná."
  hlida:    scripts/test-cenovy-stupen.mjs
barvy:
  pravidlo: "NEPŘIDÁVAT. 27. 10.: „nepotřebujeme barvy, ale čistotu." Nová plocha se dělá odstupem, vlásečnicí a pořadím, ne další barvou; barvu nese jen to, co ji na webu neslo předtím (značková zeleň v tlačítkách a hlavičce, stavy nabídky)."
  priklady: "zelený závěrečný pás, barevná pilulka u ceny a zelená dlaždice v rozcestníku — všechno vzniklo 27. 10. a všechno šlo týž den pryč."
co-je-upevnene:
  pravidlo: "co majitel jednou schválil, se nepředělává — ani ve jménu marketingu. 27. 10.: „nemůžeš si dovolit překopat věci, které jsem já sám už upevnil; musíš dělat věci, které jsem ještě neupevnil.“ Platí hlavně pro úvodní desku, soustavu barev a rozvržení výpisu."
  co-delat: "vady (překryv, nečitelnost, mrtvá pravidla, prázdná místa) ano; přepisování hotového vzhledu ne, dokud si o to neřekne."
nabidka:
  pravidlo: "lišta je cesta k prodeji, ne obsah. Šest odkazů: mapa, ceny, tři osobní stránky a „Přidat pozemek“. Jediná skupina je účet."
  co-tam-neni: "dražby, exekuce, nové na trhu, rozcestník okresů, rádce a kontakt — vedou z úvodní stránky, z mapy a z patičky; stránky samy zůstávají kvůli vyhledávačům."
  hlida:    scripts/test-rozvrzeni.mjs, test-vrstveni.mjs, test-menu.mjs
vyrazena-nabidka:
  co:       "stránka pozemku, který zmizel ze zdroje. Generátor ji schválně nepřegeneruje, takže se nevykreslí detail a zůstane statická záloha (article.pz-staticky) — 327 z 2 271 stránek pozemků."
  pravidlo: "nejdřív rozcestí (kam místo toho), pak záznam. Záznam zůstává úplný, jen vypadá jako tabulka, ne jako výpis z databáze."
  kde:      "pravidla pro .pz-konec a .pz-staticky patří do css/styles.css, NE do css/pozemek-vlozeny.css: vložený stylopis mají vyřazené stránky zamrzlý z doby, kdy nabídka platila, a změna v něm se k nim nikdy nedostane."
  hlida:    scripts/test-vyrazena-nabidka.mjs
odstupy:
  stupnice: [0, 1, 2, 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 128]
  pravidlo: "přísná čtyřková mříž; 1 a 2 px jsou vlásečnice a mezery v řádku, ne odstupy rozvržení"
  pozor:    "klíčový rozměr se ŘÍKÁ, ne dopočítává z odsazení — dotykový terč min-height:44px, hlavička min-height:var(--vyska-hlavicky). Dvě místa na tom spadla, když mříž ubrala 2 px (viz docs/optimalizace.md, položka 41)."
  hlida:    scripts/test-odstupy.mjs, test-rozvrzeni.mjs, test-hlavicka.mjs
deska:
  # DESKA je cokoli s vlastní plochou a rámem nebo stínem: karta, panel,
  # okno, mapa, fotka. Na celém webu se kreslí JEDNÍM receptem.
  zaobleni: 14px  # --r-plocha (= --r-ovladani = --r-obraz)
  ram:      "1px --line (0,14)"
  stin:     "--e1 na stránce, --e3 nad obsahem; --e2 JEN pro zvednutí při najetí"
  odsazeni: "16 px. Kontejner, jehož děti nesou odsazení samy (karta s fotkou, tabulka, mapa), má nulu. Jednořádkový proužek si ho řídí podle výšky."
  vyjimky:  "prázdný stav 32/20 (vzdušný schválně), přihlašovací karta 32/28 (stojí sama místo obsahu), pruh se záložkami 4 (lůžko pro zapnutou záložku) — každá je v test-deska.mjs jmenovitě a s důvodem"
  pravidlo: "deska je deska, ať je čehokoli — karta, panel i mapa"
  pozor:    "pruh UVNITŘ desky (legenda v mapě, panel pod mapou) má zaoblení 0 a jen border-top: rodič ho ořízne, vlastní zaoblení by nebylo vidět."
  hlida:    scripts/test-deska.mjs
zaobleni:
  r-xs: 6px      # prstenec zaměření u drobných ovladačů
  r-sm: 10px     # --r-drobnost: odznak, štítek, náhled (do výšky 44 px)
  r-md: 14px     # --r-plocha i --r-ovladani: desky, tlačítka, pole
  r-pill: 999px  # ODZNAK (zapínatelný filtr) a kulaté tlačítko s ikonou
  pravidlo: "deska i ovladač mají 14 px; 10 px je jen pro drobnost uvnitř desky; pilulka patří odznaku"
  zrušeno:  "r-lg (20px) — po sjednocení 29. 10. ho nekreslilo nic. A padlo pravidlo „karta je hranatější než tlačítko\": platilo v stylopisu, ale ne na obrazovce (viz docs/optimalizace.md §212)."
  hlida:    scripts/test-zaobleni.mjs, scripts/test-deska.mjs
ikony:
  zdroj:   scripts/ikony.mjs — JEDINÉ místo, kde se ikona kreslí
  volani:  '<svg class="ik" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-jmeno"/></svg>'
  pero:    "plátno 24, kresba v ploše 3,5–20,5, jen tahy, obdélníky rx 2,5"
  stopa:   "tloušťka se počítá k velikosti: 36/šířka, aby stopa na obrazovce byla 1,5 px (16px → 2,25; 18 → 2; 20 → 1,8)"
  ruka:    "co stojí na zemi, stojí na lince y=20 (obzor); uprostřed špendlíku, zaměřovače a mapy je otočený čtverec (hraniční kámen), ne kolečko"
  pozor:   "pero NESMÍ na <symbol> jako atribut — na obsah symbolu nedosáhne žádný selektor, takže by přebilo i tloušťku z CSS. Drží ho třída .ik."
  pozor2:  "odkaz se píše CELÝ ('#i-karty'), nikdy skládaný z proměnné — sestavení podle něj pozná, co má do stránky vložit"
  hlida:   scripts/test-ikony.mjs
casy:
  rychly: .12s   zakladni: .2s   pomaly: .4s
prechody:
  recept:   "--prechod-barvy (barva, pozadí, rám, stín, průhlednost, filtr — základním časem) + --prechod-pohyb (posun — rychlým); dohromady --prechod"
  kde:      "nasazeno na rodinu ovladačů, na OBSAH ovladače a na řádky, které ovladačem nejsou. Nepíše se po jednom u každého tlačítka."
  stisk:    "jedno gesto na celý web: transform:translateY(1px). Výjimka: záložka „Uložit\" poskočí (scale 1.2) — to není stisk, ale potvrzení zápisu."
  neanimuje: "outline (prstenec zaměření má naskočit hned) a rozměry (width/height/top/left překreslují rozvržení na každém snímku)"
  hlida:    scripts/test-prechody.mjs, scripts/test-soustava.mjs
popisek:
  recept:  "popisek verzálkami nad obsahem desky má JEDEN recept: var(--font-popisek), 12px, řez 600, letter-spacing var(--popisek-proklad), barva var(--popisek)"
  barva:   "tichý text nad deskou je --popisek, ne --muted. Zelená (--znacka-svetla) jen jako ozdoba na tmavém pásu."
  pozor:   "--font-popisek se do 29. 10. jmenoval --font-mono, a žádné neproporcionální písmo v něm není — web má jedno písmo (Inter) ve čtyřech tokenech. Strojopis je na celém webu jediné místo: výpis kódu v diagnostika.html (§216)."
  hlida:   scripts/test-pismo.mjs
plochy:
  karta:      "--plocha-karta (bílá). Změřeno: 30 z 38 desek."
  zapustena:  "--plocha-zapustena — ovladač se zapuštěnou plochou (vstupy, pole, záložky, duchová tlačítka) a plocha mapy pod dlaždicemi"
  tlumena:    "--plocha-tlumena — zvednutí při najetí/zapnutí; velká plocha, kde teprve něco bude (náhled bez fotky, plovoucí hláška); informace, která už neplatí"
  pozor:      "jméno --plocha-tlumena říkalo jen „hover, aktivní\", ale polovina použití byla klidová (§216). Než ji někam napíšeš, podívej se, jestli to není zapuštěná plocha."
  hlida:      scripts/test-deska.mjs
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

### Hlídač s výjimkou na celou složku nehlídá tam, kde se píše nejvíc

Pravidlo „počet, který se mění sám od sebe, nepatří do přítomného času"
platilo od 19. 10., ale hlídač vynechával `test-*.mjs` a `docs/` — a
zastaralá čísla se sešla přesně tam (viz oddíl 111). **Výjimka se zúží
na svůj důvod, ne na složku:** důvod byl, že hlídač cituje staré
nepravdy a spadl by sám na sobě, takže se dnes vynechává řádek
s uvozovkami, ne celá složka se zkouškami. Když se píše nová výjimka,
patří k ní věta, co přesně kryje — a měření, co po ní zbyde
nepokryté.

### Nový vložený skript ve stránce znamená nový hash v CSP

Od 23. 10. nese každá stránka `Content-Security-Policy` v `<meta>`
a `script-src` je bez `'unsafe-inline'` — vložený skript se spustí
jen tehdy, když je jeho hash v hlavičce. Hashe počítá
`scripts/csp.mjs` jako krok `oprav.mjs`, takže **po každé změně
vloženého skriptu (i o jeden znak) se musí pustit `node
scripts/oprav.mjs`**, jinak si prohlížeč vlastní skript stránky
zakáže. Hlídá to `scripts/test-csp.mjs` a doloženo je to sabotáží
v obou směrech. Cizí původ (nový obrázkový server, nové API) patří
do politiky v `scripts/csp.mjs`, a adresa Supabase se tam neopisuje
— čte se z `js/config.js`.

Dvě věci k tomu patří. **Generátor nesmí hlavičku dědit
z předlohy** — předloha má jiné vložené skripty, takže zděděný hash
stránku rozbije (naměřeno na 1 930 stránkách); kdo pouští generátor
v živém adresáři, dohání si po něm `csp.mjs` stejně, jako si už
dohání `sazba.mjs`. A **`'unsafe-eval'` nese jen `pridat.html`**, kde
bez něj nepoběží kontrola fotek; je to odvozené pravidlem (bere
`pridat.js`/`fototema.js` a má `<input type="file">`), ne seznamem,
a zkouška hlídá oba směry i to, že si žádný skript v `js/`
nepouští text jako kód.

### Zkouška v prohlížeči si CSP obchází (`bypassCSP: true`)

Playwright roluje k prvku a čeká na podmínku vstřikovaným kódem,
který si volá `eval` — pod přísným `script-src` tedy přestane
fungovat OVLÁDÁNÍ, ne web. Když CSP přišla na web, spadlo tím
třicet zkoušek a vypadalo to na rozbité stránky; v hlášce
o porušení nebyl žádný zdrojový soubor, což je ta nápověda. Nová
zkouška v prohlížeči proto zakládá kontext s `bypassCSP: true`
— jediná vyjímka je `scripts/test-csp.mjs`, která měří právě to,
jestli hlavička platí. Hlídá se to v obou směrech.

### Cizí server do politiky patří ze ZDROJE, ne z měření

Vrstvy mapy (sedm úředních WMS serverů) v první podobě politiky
chyběly, protože se při měření v prohlížeči nezapnuly — ač byly
celou dobu jmenované v zásadách soukromí. Hosty se proto čtou
z `data/mapove-vrstvy.json` a adresa Supabase z `js/config.js`.
Měření v prohlížeči říká, co se děje na té jedné cestě, kterou
jsi prošel; zdroj říká, co se může stát na všech.

### Co běží při parsování, nesmí se opírat o to, co má `defer`

`js/pozemek.js` se vykonává už při parsování stránky, kdežto
`js/auth.js` a `js/config.js` mají `defer` — při prvním vykreslení
(z ostrůvku dat v HTML) tedy přihlášení často JEŠTĚ NENÍ po ruce.
Kdo v takovém místě napíše `if (PKAuth && PKAuth.prihlasen())`,
dostane „nepřihlášený" a tiše neudělá nic. Nalezeno 23. 10. na dvou
místech (uložené pozemky a poznámky), kde to znamenalo, že se cizí
zařízení hlásilo „Uložit" a u poznámky stála nepravda o tom, kde
skončí. Správně: pokus zopakovat po `load` (a ještě krátce po něm,
protože obnova prošlého tokenu je asynchronní), nebo to volat při každém
vykreslení, jak to dělá `js/main.js`.

### Nová úloha v CI má napsaná práva a balíčky bere ze zámku

Osm úloh v `.github/workflows` mělo 23. 10. napsané `permissions:`
jen ve třech případech; zbylé jely s tím, co má repozitář nastavené
v prohlížeči — tedy mimo historii. Pravidlo: každá nová úloha má
`permissions: contents: read`, a `contents: write` jen tehdy, když
opravdu pushuje. Úloha, která nepushuje, přidá checkoutu
`persist-credentials: false` (token pak neleží v `.git/config`,
dokud v téže úloze běží stovky skriptů a instalace z npm).

Balíčky se instalují `npm ci --omit=dev --ignore-scripts` (zámek
rozhoduje), a když to jinak nejde, s PŘIPNUTOU verzí
(`playwright@1.64.1`). `npm install jmeno` bez verze neposlouchá
`package-lock.json` — a rozdíl verzí playwrightu už jednou udělal
červenou CI při zelené zkoušce. Cizí akce (co není `actions/*`) musí
být připnutá na SHA. Hlídá to `scripts/test-ci-prava.mjs`.

### Co z účtu leží i v prohlížeči, to odhlášení maže — a texty to musí rozlišovat

Uložené pozemky a poznámky jsou u přihlášeného člověka na serveru
a v prohlížeči jen jako mezipaměť. Platí pro ně dvě věci:

1. **Odhlášení tu kopii maže** (`uklidMistniKopie()` v `js/auth.js`) —
   ale jen to, co účet zná (`nahrano` u poznámky, `pk_fav_nahrano_v1`
   u uložených). Co se nikdy nenahrálo, zůstává a `logout()` to vrátí
   v `zbylo`. Přibude-li třetí taková mezipaměť, patří do téhož seznamu
   a do `js/ulozene.js` s příznakem `zUctu: true` — shodu obou seznamů
   hlídá `scripts/test-sliby-data.mjs`.
2. **Žádný text nesmí tvrdit, že „nikam nejdou", bez rozlišení.** Platí
   to jen bez přihlášení. Nestačí ve větě zmínit slovo „přihlášení"
   (odpověď „Žádná registrace ani přihlášení…" ho nese a nerozlišuje
   nic) — musí tam být „bez přihlášení" nebo „s účtem". Hlídá to táž
   zkouška na všech stránkách, v jejich strukturovaných datech i v polích
   `popis`/`nazev`/`sub`/`veta` ve skriptech.

### Co vzniká z JS, statický hlídač nevidí — a výjimka se platí hlídačem

Prvek, který na stránku dopisuje až prohlížeč, ve zdroji HTML není.
Hlídači, kteří čtou soubory (`test-vaha-stranky`,
`test-skripty-na-strance`), ho proto nenajdou a hlásí „skript na
stránce nemá co dělat". Je to pravdivé čtení nepravdivého podkladu.

Výjimku v takovém hlídači si **kupuješ hlídačem v prohlížeči**:
napsaný důvod v seznamu výjimek a vedle něj kontrola, která na
skutečné stránce změří, že ta věc opravdu vznikne. Bez druhé části je
to jen vypnutá kontrola — a přesně tudy by se dalo tiše vypnout
cokoli, co se kreslí z JS.

A ještě jednou totéž z druhé strany: `querySelectorAll` nad hotovým
dokumentem proběhne JEDNOU. Modul, který si takhle hledá svá místa,
nikdy nenajde prvek, který vznikl později — a nehlásí to, protože
žádná chyba nenastala. Nic se prostě nenakreslí.

### Rychlá sada není celá sada

134 zkoušek v `scripts/zkousky.mjs` je zelených i tehdy, když web
nefunguje: mapa skákala na první dotek a prodávající z celého okresu
nemohl inzerovat, a rychlá sada o tom nevěděla. Žije to v sadě, která
běží v prohlížeči.

Než něco pošleš, podívej se na výsledek „Testy a kontrola kódu"
v CI — ne na svoji rychlou sadu. Nasazení na web se na zkoušky
neptá, takže červené CI znamená, že na webu je rozbitý stav.
