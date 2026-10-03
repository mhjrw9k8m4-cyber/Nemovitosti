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

## Komentáře

Píšou se **proč**, ne *co*. Čtvrtina souborů má v hlavičce odstavec
„proč tahle zkouška/funkce existuje" i s naměřenými čísly a s tím, co se
zkoušelo a nefungovalo. Je to nejcennější věc v repozitáři: brání tomu,
aby někdo (včetně AI) „uklidil" řešení, jehož důvod není vidět z kódu.

## Testy

86 skriptů v CI, dva joby: rychlý (`testy`) a prohlížečový
(`v-prohlizeci`). Celá sada místně trvá kolem 45 minut:

```
bash /tmp/suite.sh        # potřebuje PW_CHROMIUM a PK_LEAFLET_DIR
```

Browser testy sdílejí port 8310 — nesmí běžet dva naráz.
