# Barvy, kontrast a proč web působil mdle

## Co se měřilo

Kontrast není věc vkusu — je to číslo. Norma WCAG 2.1 AA žádá poměr jasu
**4,5 : 1** u běžného textu a **3 : 1** u velkého (nad 24 px, nebo nad
18,66 px tučně). Pod tím se text na mobilu na slunci prostě nepřečte.

`scripts/test-kontrast.mjs` projde osm stránek, u každého textu dohledá
**skutečné** pozadí (i přes několik průhledných vrstev) a spočítá poměr.

**Výchozí stav: 73 prvků neprošlo, v 10 různých případech.**
**Po opravě: 0.**

## Co bylo špatně

| Barva | Kde | Poměr | Nově |
|---|---|---|---|
| `#3D63EE` značková modrá | odkazy, štítky, čísla | 3,7–4,5 | `#314FBE` → 5,2–7,0 |
| `#565F72` tlumený text | popisky, poznámky | 4,79 | `#49536A` → 5,7–7,6 |
| `#4E6FD4` „na prodej" | štítky okresů | 4,15 | `#3C55A2` → 5,2 |
| `#FB2B2B` exekuce | nadpisy v cenách | 3,83 | `#AE1E1E` → 5,2 |
| `#FFA60A` dražba | text štítku | **1,67** | `#7C5105` → 5,2 |

Zlatá `#FFA60A` je na světlém pozadí prakticky nečitelná. Proto vznikly
**textové varianty s příponou `-ink`**: sytý odstín je správný pro puntík
na mapě nebo výplň štítku, ale ne pro drobné písmo.

> Pozor: u puntíků na mapě nese `color` jen barvu záře
> (`box-shadow: … currentColor`), žádné písmeno se tam nečte — tam musí
> zůstat sytá barva, jinak puntíky zhasnou.

## Proč to působilo „mdle a futuristicky"

Kontrast byl jen půlka věci. Zbytek dělala typografie a efekty:

1. **Hlavní nadpis měl tloušťku písma 360** při velikosti 54 px. To je
   velmi světlé písmo — bledý, nerozhodný dojem. Nově **800**
   a sevřenější prostrkání. Sebevědomí dělá typografie, ne efekty.
2. **Nadpisy sekcí měly 500.** Vedle nadpisu stránky působily nedopsaně.
   Sjednoceno na 700–800; hierarchii má dělat velikost, ne bledost.
3. **Zvýrazněné slovo v nadpisu mělo 400** proti 800 ve zbytku — půlka
   věty vypadala vybledle.
4. **Modrofialový přechod obtisknutý do písmen.** Vypadalo to jako každá
   druhá technologická stránka a odstín uprostřed navíc vybledal.
5. **Přechod na tlačítkách končil ve fialové** `#6A34D8` — to byl hlavní
   zdroj „futuristického" dojmu a k modroindigovému logu se netrefoval.
   Nově jde z modři do hluboké modři; bílý text na něm drží 4,6 : 1
   i v nejsvětlejším místě (dřív 3,46 — pod normou).
6. **Rozmazané poletující skvrny** na pozadí (`.aurora`) ztlumeny na
   polovinu. Nemazaly se — drží hloubku —, ale jedna z nich je teď teplá.
7. **Linky byly na 0,13 průhlednosti**, takže karty splývaly s pozadím.
   Nově 0,18 a 0,34.

## Šmrnc: měď

Proměnné se odjakživa jmenují `--copper` (měď), jenže držely modrofialovou
— původní teplý tón se cestou ztratil a zůstala obecná technologická modř.

Měď `--accent-warm: #A8450F` (5,1 : 1 na stránce) se vrací, ale **ve vší
střídmosti — jen na třech místech**:

- puntík u nadřádku nad nadpisem,
- podtržení zvýrazněného slova v nadpisu,
- teplá skvrna v pozadí.

Jeden teplý tón proti hluboké modři dává webu tvář. Deset teplých tónů by
z něj udělalo cirkus.

> Podtržení jde **za** písmena (`z-index:-1`). Kdyby leželo nad nimi,
> přeškrtlo by ocásky u „y" a „j" a vypadalo by to jako chyba; takhle to
> čte jako zvýrazňovač.

## Jak to udržet

```
node scripts/test-kontrast.mjs     # spadne, když nějaký text klesne pod normu
```

Běží v CI. Ověřeno i obráceně: s úmyslně zhoršenou barvou test opravdu
spadne (kód 1) — test, který nikdy nespadne, nehlídá nic.

Když přidáváte barvu pro **text**, vezměte variantu `-ink`. Když pro
**plochu nebo puntík**, vezměte sytou.
