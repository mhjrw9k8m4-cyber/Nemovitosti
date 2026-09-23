# Centrum upozornění

`upozorneni.html` — jedno místo, kde je vidět **co je nového**: zprávy od
lidí a nové pozemky z hlídání.

## Proč vzniklo

Odznak s číslem v menu řekne jen „něco je". Teprve seznam řekne **co, od
koho a proč** — a podle návodů na navrhování upozornění to musí jít
přečíst zhruba **za dvě vteřiny**, protože upozornění lidé čtou letmo, při
něčem jiném. Do té doby musel člověk obejít dvě stránky (Zprávy, Hlídání)
a na mapě si dohledat, co vlastně přibylo.

## Čtyři vrstvy, každá na něco jiného

Takhle to mají postavené weby, kde upozornění fungují — a takhle to má
teď i Parcelka:

| Vrstva | Kde | Říká |
|---|---|---|
| **Odznak** s číslem | menu, všechny stránky | „něco tu je" |
| **Tečka** na tlačítku menu | mobil, všechny stránky | totéž, když je menu zavřené |
| **Centrum** | `upozorneni.html` | co přesně, od koho, kdy |
| **Vyskakovací upozornění** | kdekoli, při přírůstku | „přibylo to právě teď" |
| *(zatím chybí)* e-mail | — | zastihne i toho, kdo nepřijde |

**Toast se ukáže jen při přírůstku**, ne při každém načtení stránky. Na
tomhle se návody shodují: toast, který vyskakuje pořád, si lidé odnaučí
vnímat, a pak jim unikne i ten, na kterém záleží. První příchod v relaci
toast nevyvolá — pozná se podle toho, že záznam v paměti **chybí**, ne
podle nuly. Skok z nuly na tři je totiž přesně ten případ, kdy vyskočit má.

## Co se tam dá dělat

- **Filtry** Vše / Zprávy / Pozemky, s počty.
- **Označit vše jako viděné** — na dosah, ne schované v nabídce.
  U zpráv tlačítko není: ty se označí otevřením konverzace a dvě cesty
  k témuž by si mohly protiřečit.
- **Nastavení** „co mi ukazovat" — bez možnosti si to vypnout se
  z upozornění stane otrava.
- **Prázdný stav** nabídne, co dál (nastavit hlídání).

U pozemků se ukazují **tři konkrétní** (obec · výměra · cena · druh) a
zbytek číslem. Tlačítko „označit jako viděné" přitom pracuje se **všemi**
klíči, ne jen s těmi třemi — jinak by po kliknutí zůstalo viset 17
neoznačených.

## Přístupnost

- Hlášení o změnách jde přes `role="status"` + `aria-live="polite"`.
  **Ne `assertive`** — to patří chybám, ne novinkám; skákalo by do řeči.
- Živá oblast je v stránce **od začátku a mimo překreslovanou část**:
  oblast, která vznikne a hned se naplní, se nestihne zaregistrovat
  a hlášení zapadne.
- Filtry mají `aria-pressed`, odznaky `aria-label` s celým počtem
  („12 novinek", ne „9+"), tlačítko menu řekne, že něco čeká.
- `@media (prefers-reduced-motion)` vypne animaci toastu.

## Čeština

`1 nový pozemek` · `3 nové pozemky` · `7 nových pozemků` — tři tvary podle
počtu. Bez toho by tam stálo „5 nové pozemky", což pozná každý Čech a web
okamžitě vypadá jako automat. Hlídá to test.

## Odkud se berou data

**Z ničeho nového.** Skládá se to z toho, co web stejně načítá:

- `my_threads()` → nepřečtené zprávy,
- `my_searches()` + `data/opportunities.json` → nové pozemky.

Žádná nová tabulka, žádné SQL navíc — a tím pádem se to **nemůže rozejít**
s tím, co ukazují stránky Zprávy a Hlídání.

### Datum „poprvé viděno"

`scripts/fetch-opportunities.mjs` teď každému pozemku doplní `first_seen`:
přenese ho ze starého souboru podle otisku, a co tam nebylo, dostane
dnešek. Díky tomu jde říct „přibylo včera" a řadit od nejnovějšího.

Otisk musí být **shodný** napříč třemi místy — `js/hlidani-logika.js`,
`scripts/fetch-opportunities.mjs` (e-mailový rozesílač v repozitáři není) — jinak by
se pozemky „obnovovaly" při každém běhu robota. Hlídá to test.

> `first_seen` slouží k **zobrazení a řazení**, ne k určení, co je nové.
> Nové = sedí na hledání a není mezi viděnými (`seen_keys`). Proto se
> nestane, že by po prvním podepsání dat vypadalo jako nové všechno.
> Záznamy bez data spadnou do skupiny **„Čeká na vás"** — tvrdit o nich
> „Starší" by byl výmysl.

## Testy

```
node scripts/test-upozorneni.mjs       # 55 testů: věty, čas, seskupení, filtry
node scripts/test-chat-prohlizec.mjs   # 45 kontrol v Chromiu
```

Prohlížečový test projde celé centrum: obě strany seznamu, filtry, vypnutí
druhu, „označit vše" i to, že označení **přežije obnovení stránky**
(tedy že si to server opravdu zapsal). A že toast vyskočí jen při
přírůstku a dá se zavřít.

> Při úpravách testu pozor na jednu past: dokud je otevřená konverzace,
> ptá se každých 15 s na nové zprávy a tím si je označuje za přečtené.
> Je to správné chování aplikace, ale nepřečtená zpráva v testu nevydrží —
> stránku je potřeba zavřít.

## Vrstvení v menu

Položka **Upozornění** patří k osobním stránkám (Zprávy, Hlídání, Můj
profil), ne k veřejným. Oddělovač skupin proto vede **nad ní**, ne nad
Zprávami — dokud byl na starém místě, vypadalo Upozornění jako součást
veřejné části menu.

Ten oddělovač měl ještě jednu vadu: položky menu mají `border-radius:14px`,
takže se jednopixelová čára na obou koncích **zakřivila a četla se jako
horní hrana plovoucí karty**. Působilo to, že se v menu něco špatně vrství.
Řeší to `border-top-left-radius:0` a `border-top-right-radius:0` — oddělovač
má být rovná vlasová linka.

Ikony: **Upozornění má zvonek** (obvyklý znak centra upozornění) a
**Hlídání dostalo oko** — dva zvonky vedle sebe se pletly a hlídání
lokality je spíš sledování než zvonění.

Hlídá to `scripts/test-vrstveni.mjs`: že jsou oddělovače dva, že první
odděluje osobní stránky, že nejsou zaoblené a že **žádná položka menu není
bez ikony** (prázdné místo v řádku vypadá jako chyba).

> Past při měření vrstvení: hlavička je lepivá a překrývá horních ~66 px.
> Bod, který pod ni spadne, měří hlavičku, ne to pod ní. Sám jsem na to
> naletěl a málem „opravil" mapu, která byla celou dobu v pořádku — proto
> si test nejdřív ověří, že měřené prvky leží pod hlavičkou.
