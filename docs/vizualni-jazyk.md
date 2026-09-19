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
