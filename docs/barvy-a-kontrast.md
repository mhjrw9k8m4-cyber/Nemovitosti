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

---

# Druhé kolo: tři písma, teplé neutrály a tmavý pás

Web pořád neměl „šmrnc". Podle toho, jak to dělají velké realitní weby
([Compass, Luxury Presence a spol.](https://www.luxurypresence.com/blogs/brand-fonts-real-estate-website/)),
chyběly tři věci — a **žádná z nich nebyla gradient**.

## 1. Tři písma místo dvou

Velké weby stojí na trojici: **patkové na nadpisy** (tvář a vážnost),
**bezpatkové na text a ovládání** (čitelnost), **strojové na čísla
a štítky** (data). Compass to má jako Tiempos + Harmonia + Pressura Mono.

Parcelka měla jen dvě. Nadpisy dostaly **Fraunces** — vybrané z pěti
kandidátů, které se vyrenderovaly vedle sebe s českou pangramou
a všemi háčky (`Ř Ě Š Č Ž Ů Ť Ď`). Instrument Serif a Libre Caslon jsou
na užitkový web příliš křehké, Playfair je okoukaný.

> Dvě písma dělají web korektní. Teprve třetí mu dá charakter.

## 2. Teplé neutrály místo studené šedi

Pozadí bylo `#EBEDF0` — studená šeď. Nově `#F1EFEA`, teplá bílá. Je to
rozdíl, který v číslech skoro není (text 15,3 : 1 místo 15,0 : 1) a
v dojmu je velký: **jako v bytě denní světlo místo zářivky.**

## 3. Tmavý pás

Tohle byla největší chybějící věc. Web byl celý světlý — jedna dlouhá
plocha bez nádechu, takže neměl rytmus. Sekce hlídání je teď tmavá,
s měděným nadřádkem, teplo-studeným přechodem a katastrální mřížkou.

Na webu je **jedna**. Kdyby byly tři, je z toho zase jednolitá plocha,
jen tmavá.

Na tmavém pozadí platí jiné barvy: `--text-ondeep-mute` (10,8 : 1)
a `--accent-warm-bright` (8,0 : 1). Šeď ze světlého motivu by tam zmizela
a měď by zhnědla.

## Co přitom vyšlo najevo — test kontrastu měl dvě díry

Tohle je důležitější než barvy.

**Díra 1: neměřily se přechody.** Prvek s přechodem na pozadí se
přeskakoval — přitom přechod je právě to místo, kde kontrast selže,
protože text leží na dvou různých barvách. Teď se čtou barevné zarážky
a bere se **ta nejhorší**, ne průměr.

**Díra 2: neměřilo se nic pod ohybem stránky.** Sekce s třídou `.reveal`
jsou do doby, než se na ně doroluje, průhledné — a měření je jako
neviditelné přeskakovalo. **„0 chyb" tedy znamenalo jen „0 chyb nahoře."**
Test je teď před měřením odkryje a projede stránku dolů a zpět.

**A za třetí: samotný test byl rozbitý.** Měřicí kód je uvnitř šablonového
řetězce (template literal), takže zpětné lomítko v regulárním výrazu musí
být zdvojené. Nebylo — JavaScript ho spolkl, výraz hledal nesmysl,
`parseFloat` vrátil `NaN`, a **`NaN < 4,5` je vždy nepravda**. Test tedy
mlčel a tvářil se, že je všechno v pořádku.

Poznalo se to jedině tak, že se barva **úmyslně zhoršila a ověřilo se, že
test spadne.** Jakmile začal fungovat, hned našel skutečnou chybu, kterou
jsem právě udělal: drobný text pod formulářem na tmavém pásu měl 2,02 : 1,
protože jsem na jednu třídu zapomněl.

> Ponaučení: **test, o kterém nevíte, že umí spadnout, nehlídá nic.**
> U každého hlídače v tomhle projektu je proto ověřeno i to, že při
> porušení pravidla opravdu skončí chybou.
