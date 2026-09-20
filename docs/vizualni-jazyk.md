# Vizuální jazyk a předloha

**`predloha.html`** je vzorník, podle kterého se web staví. Není součástí
webu (`noindex`) — je to nástroj. Když se přidává nový prvek, **vybere se
odsud, nevymýšlí se znovu.**

## Proč vznikl

Web byl „suchý": kontrast už seděl, ale chyběl tvar. Příčina byla
měřitelná — v šabloně bylo **71 různých stínů a 19 různých zaoblení**.
Nic z toho nebylo špatně samo o sobě, ale dohromady to nedávalo systém:
oko nemá podle čeho poznat, co leží výš, a všechno se slije.

Navíc mezi těmi stíny zůstávaly zbytky po tmavém motivu — `rgba(0,0,0,0.7)`
a podobné. Černý stín na světlém pozadí nedělá hloubku, dělá špínu.

## Hloubka: čtyři stupně

| Stupeň | Kde |
|---|---|
| `--e0` | vstupy, zapuštěné prvky |
| `--e1` | karty v seznamu, štítky |
| `--e2` | hover karty, rozbalovačka |
| `--e3` | panel detailu, modální okno, toast |
| `--e3-up` | panel vyjíždějící **zdola** — stín musí jít vzhůru |
| `--glow`, `--glow-lg` | značková záře pod modrými tlačítky |

Stíny jsou **chladně modré, ne černé**, a mají dvě vrstvy: ostrý obrys
blízko prvku a měkký rozptyl.

> Pravidlo: stupeň musí odpovídat tomu, jak moc prvek „leží nahoře".
> Když je všechno 2, nic nevystupuje.

Nahrazeno **46 hodnot**; zbylé jsou obrysy (`0 0 0 Npx`), vnitřní stíny
a záře podle barvy prvku (`currentColor`) — ty mají jiný účel a do škály
nepatří.

## Tvary: pět zaoblení

`--r-xs` 6 · `--r-sm` 10 · `--r-md` 14 · `--r-lg` 20 · `--r-pill` 999

Sjednoceno na **161 místech**. Malé prvky mají malý rádius, velké velký —
jinak vypadá drobný štítek jako nafouklá bublina a velká karta jako ostrý
papír. Vlasové proužky (2–3 px) a kruhy (50 %) do škály nepatří.

## Vlastní motivy

Web neměl nic svého. Pozemek se v katastru **zaměřuje do rohů** a kreslí
**do sítě** — odtud si bere obojí.

**Rohová značka** (`.s-rohy`, a automaticky na `.opp-item` a `.okr-item`):
dvě vlasové linky v rohu karty. Při najetí zčervená do mědi. Je na **obou**
druzích karet inzerátu — na mapě i na stránce okresu. Je to tentýž druh
objektu, takže musí vypadat stejně; jinak to není jazyk, ale náhoda.

**Katastrální mřížka** (`.s-mrizka`, a automaticky na úvodní ploše
a pásových sekcích): jemná síť 44 × 44 px, ke krajům se vytrácí. Je tak
slabá, že si jí nikdo přímo nevšimne — všimne si jen toho, že plocha není
mrtvá. **Není všude**: kdyby byla, přestane být textura a začne být vzor.

**Měděná vlasová linka** nad nadpisem sekce. Oko podle ní pozná, kde sekce
začíná, bez dalšího rámečku.

## Jak se to udrží

```
node scripts/test-predloha.mjs
```

Systém se nerozpadne naráz — rozpadne se po jednom stínu. Někdo potřebuje
kartu „o kousek výš", napíše si vlastní hodnotu, a za půl roku je jich zase
sedmdesát. Test to nedovolí: hlásí každý vlastní stín s rozptylem od 6 px
a každé zaoblení mimo škálu, a kontroluje, že **předloha neukazuje nic, co
v šabloně není** — vzorník, který lže, je horší než žádný.

Ověřeno obráceně: po vložení `box-shadow:0 9px 19px rgba(0,0,0,.5)`
a `border-radius:17px` test spadl a obojí vypsal.

> Test si nejdřív vyhodí komentáře a **sám si ověří, že mu to jde**. Bez
> toho by hlásil vlastní vysvětlivky (v komentáři se běžně píše
> „border-radius:14px") — a po „opravě" by mlčel navždy.

## Barevné přechody

Web měl barvu jen na tlačítkách, jinak samé plochy. Přechody jsou to, čím
velké weby drží plochu živou: **barva se plynule přelévá místo toho, aby
se lámala hranou.**

Všechny vycházejí ze **dvou** tónů, které web má — hluboké modři a mědi.
Duha z osmi barev není přechod, je to zmatek.

| Přechod | Kde |
|---|---|
| `--grad-plocha` | plocha stránky, svisle přes celou výšku |
| `--grad-karta` | lesk odshora na kartách |
| `--grad-warm` | linka nad nadpisem sekce, důrazy |
| `--grad-warm-soft` / `--grad-cool-soft` | štítky kategorií |
| `--grad-predel` | předěl sekcí, do stran se vytrácí |
| `--brand-grad` | tlačítka |

**Úvodní plocha** má vrstvený mesh: teplá barva vlevo nahoře, studená
vpravo, hluboká modř u dolního okraje. Poletující rozmazané skvrny
(`.aurora`) se ukázaly jako slepá ulička — jsou odsunuté za okraj sekce
a přes rozostření 80 px z nich zbude mlha. Vrstvené radiální přechody
dělají totéž doopravdy, a navíc nic neanimují, takže nežerou výkon.

**Předěly sekcí** se do stran vytrácejí. Tvrdá linka přes celou šířku
krájí stránku na díly; vytrácející se ji jen naznačí.

### Co u toho zase vyšlo najevo

Test kontrastu měl **třetí díru**: prvek, jehož pozadí je *průsvitný*
přechod, se přeskakoval úplně — a to je přesně úvodní plocha, tedy to
nejviditelnější místo webu. Teď se průsvitné vrstvy **skládají** na
neprůhledný podklad pod nimi a měří se i místo, kde se všechny potkají.

Jakmile to začalo fungovat, test rovnou zastavil první verzi meshe:
v nejsytějším místě měl nadřádek **2,8 : 1**. Mesh se proto zesvětlil
a úvodní plocha si uvnitř předefinuje `--copper-bright`
a `--text-ondark-mute` na tmavší tóny — **text na barevné ploše potřebuje
vlastní tón.** Okem se to nepozná.

> Ověřeno i obráceně: se zhoršenou barvou nadřádku test spadl a našel
> 8 prvků na třech stránkách.

## Dotažení detailů

Web se procházel stránku po stránce a měřil, ne odhadoval. Co se našlo:

**Barva lišty prohlížeče byla studeně šedá** (`theme-color: #EDEFF4`) na
všech 108 stránkách — z původní palety. Na mobilu se jí tónuje pruh nad
stránkou, takže mezi lištou telefonu a webem byl vidět **šev**. Nově
`#FBFAF8`, tedy barva hlavičky.

**Manifest měl tmavě navy** `#16232F` pro obojí. Po přidání na plochu by
úvodní obrazovka blikla tmavě a pak naskočila teplá bílá. Nově sedí.

**Dotykové terče byly malé.** Hamburger 36×28, filtry 30 px na výšku,
rychlé hodnoty 26 px, tlačítko „zobrazit heslo" 35×35. Norma to propustí,
ale palec ne — a právě tohle dělá rozdíl mezi „web funguje" a „web se
dobře ovládá". Vizuálně zůstaly stejné; zvětšila se plocha, na kterou jde
klepnout. Hlídá to `scripts/test-dotyk.mjs` (min. 36 px).

**Patička byla nejslabší část webu** — světle šedá plocha s odkazy, bez
barvy a bez hloubky, takže stránka končila do ztracena. Je tmavá, se
stejným jazykem jako pás u hlídání: světlo z rohů, katastrální mřížka,
měděné nadpisy sloupců. Spolu s tím pásem drží web pohromadě — jedna
tmavá sekce uprostřed by jinak působila jako výjimka.

## Hustota, napojení, zrno

Mobilní menu vypadalo **jako slabikář**: řádky přes 70 px, písmo 18 px,
holé obrysové ikony a mezi nimi vzduch. Osm položek zabralo celou
obrazovku a nic v nich nebylo k zapamatování. Teď: nižší řádky, ikona
v **barevné dlaždici**, aktivní položka s měděným proužkem, pozadí
s teplým přechodem a mřížkou. Osobní část menu (Upozornění, Zprávy,
Hlídání, Můj profil) má teplé dlaždice — oko tím pozná, že vstupuje do
„svého".

Kroky **„jak to funguje"** byly tři samostatné bílé kartičky s prázdným
rámečkem a spoustou vzduchu; nic je nespojovalo. Teď jsou to články
řetězu: číslo v barevné dlaždici, mezi nimi **svislá spojnice**, text
vedle. Odstíny jdou od teplé po hlubokou modř. Na počítači je spojnice
vodorovná.

**Zrno** přes celou stránku. Dokonale hladká plocha je to, co působí
digitálně a mrtvě — papír, plátno ani mapa hladké nejsou. Je to jeden
obrázek generovaný přímo v CSS (žádný soubor navíc), bez animace.

> Naměřeno: **2 % ztmavení**. To je pod hranicí, kde by to mohlo ohrozit
> kontrast — a ověřeno měřením, ne odhadem, protože `mix-blend-mode`
> v testu kontrastu vidět není.

### Test vrstvení měl chybu

Neprůhlednost menu četl jen z `background-color`. Jakmile menu dostalo
přechod, barva je průhledná a kryje až obrázek — test tedy hlásil
„obsah prosvítá", i když neprosvítal. Teď čte obojí a hlídá, že ani jedna
zarážka přechodu není průsvitná. **Ověřeno obráceně:** s úmyslně
průsvitným menu test spadne.
