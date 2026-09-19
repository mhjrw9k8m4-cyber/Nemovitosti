# Kontrola fotek u inzerátu

Fotka projde čtyřmi vrstvami. Každá umí něco jiného a každá může fotku
zastavit — kromě té poslední, která u nejistoty raději pustí dál.

| # | Vrstva | Co pozná | Kde to je |
|---|---|---|---|
| 1 | Rozměry a tvar | moc malá fotka, protáhlý proužek (snímek obrazovky) | `js/kontrola.js` → `fotkaRozmery` |
| 2 | Jas a pestrost | vyfocená zeď, prst přes objektiv, fotka potmě, přesvícená | `js/kontrola.js` → `fotkaObsah` |
| 3 | EXIF | snímek obrazovky, čas v budoucnosti, místo pořízení daleko od obce | `js/exif.js`, `js/kontrola.js` → `fotkaPuvod`, `fotkaMisto` |
| 4 | Co je na fotce | zabalené zboží, jídlo, obrazovka, nábytek, člověk — proti krajině | `js/fototema.js` |

Vrstvy 1–3 jsou levné a běží hned. Vrstva 4 stahuje model (5 MB), proto až
u první fotky.

## Vrstva 4 — jak rozhoduje

Model **MobileNet v1 0.50** (`assets/mobilenet/`) rozpozná 1000 běžných
předmětů. Neumí říct „tohle je pozemek" — umí říct „tohle je packet /
military uniform / web site". Každá z těch 1000 tříd má proto přiřazenou
skupinu (`js/fotoskupiny.js`, jeden znak na třídu):

- **V** — venku: krajina, zemědělství, ploty, stavby v krajině, rostliny, houby
- **N** — proti: jídlo, obaly, obrazovky a dokumenty, nábytek, spotřebiče,
  nářadí, oblečení, elektronika
- **.** — neutrální: zvířata, vozidla, sport, budovy obecně

Neutrální skupina je důležitá: **kráva na louce ani auto u plotu nesmí
fotku shodit.**

Fotka se projde **třikrát** — celek, střed a spodní třetina (tam u pozemku
bývá povrch) — a pravděpodobnosti se zprůměrují. Jeden pohled se dá snadno
zmást; průměr ze tří je výrazně stabilnější.

Prahy (`PRAHY` v `js/fototema.js`):

```
obrazovka ≥ 25 % a venku < 5 %  → zamítnout jako snímek obrazovky
proti     ≥ 35 % a venku < 5 %  → zamítnout
proti     ≥ 15 % a venku < 3 %  → upozornit, ale pustit
jinak                            → pustit
```

Je to **záměrně nesymetrické**: zamítá se jen tam, kde model mluví jistě
a nevidí přitom nic venkovního. Vyhodit poctivou fotku je horší než pustit
jednu nepovedenou — kdo přijde o fotku pozemku, už ji podruhé nenahraje.

## Naměřené případy

| Obrázek | Model vidí | Skóre | Výsledek |
|---|---|---|---|
| Balíček slaniny (ostrý) | zabalené zboží 16 %, dudlík 13 % | venku 0 · proti 44 | zamítnuto |
| Balíček slaniny (jiný výřez) | zabalené zboží 18 %, hodiny 12 % | venku 0 · proti 54 | zamítnuto |
| Snímek stránky s textem | webová stránka 34 %, dokument 30 % | venku 0 · proti 77 | zamítnuto |
| Tentýž balíček rozmazaný | dudlík nebo obal | proti pod 35 | jen upozornění |
| Louka se senem | seno 40 %, stodola 15 % | venku 55 | projde |

Poslední řádek ukazuje hranici: **čím horší kvalita, tím slabší signál.**
Rozmazanou fotku model nepozná jistě, takže se jen upozorní.

## Co to neumí

**Odlišit tvůj pozemek od cizí louky.** Pozná „tohle není fotka venku",
ne „tohle je zrovna ta parcela". Fotka jakékoli louky projde. Na to je
jediná jistota fronta na schválení.

## Když se to plete

1. Pusť `node scripts/build-skupiny.mjs --vypis` a podívej se, kde třída sedí.
2. Špatné zařazení oprav v `scripts/build-skupiny.mjs` (ruční seznamy mají
   přednost před pravidly podle názvu) a soubor přegeneruj.
3. Přidej případ do `scripts/test-fototema.mjs`, ať se chyba nevrátí.
4. Prahy měň v `js/fototema.js` → `PRAHY`; testy hned ukážou, co to udělá
   s naměřenými případy.

> Pozor na pravidla podle názvu: „Cardigan" je plemeno psa, ne svetr,
> „hammerhead" je žralok a „acorn squash" je dýně. Proto jsou v generátoru
> ruční výjimky — a proto test kontroluje, že každá třída v seznamech
> v modelu opravdu existuje.

## Opakovaná kontrola po zveřejnění

Jedna kontrola při odeslání nestačí. Odkaz na cizí nabídku po čase zmizí
nebo se přesměruje jinam a fotka se může z úložiště ztratit — proto
`scripts/kontrola-inzeratu.mjs` projde zveřejněné inzeráty znovu, jednou
denně (`.github/workflows/kontrola-inzeratu.yml`).

Každá adresa se zkouší **třikrát za sebou** s rostoucí pauzou (0 s, 2 s, 6 s).
Jedna odpověď ze sítě nic nedokazuje: server může být na deset vteřin
nedostupný nebo shodit spojení, a kdo by na tom stavěl, stahoval by poctivé
inzeráty kvůli výpadku. Rozhoduje se až nad všemi pokusy:

| Co se stalo | Závěr |
|---|---|
| kdykoli odpověď 2xx/3xx | v pořádku |
| dvakrát a vícekrát 404 nebo 410 | odkaz je mrtvý |
| jen výpadky, 503, 429 | dočasně nedostupný (nehlásí se jako mrtvý) |
| přesměrování na jinou doménu | hlásí se — „vede na X místo na Y" |
| u fotky přijde `text/html` | není to obrázek, ale chybová stránka |

Navíc se z každé fotky spočítá **otisk** (perceptuální hash, 64 bitů z
šedé zmenšeniny 9×8) a porovná se s ostatními. Fotka zkopírovaná z cizího
inzerátu se tím pozná i po zmenšení a překomprimování — a právě to je
u realit častější podvod než nevhodný obsah.

Výsledky jdou do tabulky `listing_checks`. Úloha sama **nic nemaže ani
neskrývá** — jen zapíše, co našla.

**Ověřeno testem** (`scripts/test-kontrola-e2e.mjs`): proti zkušebnímu
serveru, na kterém jeden odkaz dvakrát po sobě shodí spojení a teprve
potřetí odpoví. Test hlídá hlavně to, že se takový odkaz **nenahlásí**.
