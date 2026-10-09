# Co webu chybí

Seznam je **měřený, ne vymyšlený** — u každé položky stojí číslo a jak
se zjistilo. Řazeno podle toho, kolik by to přineslo, ne podle toho, co
je snadné. U každé je napsané, kdo to může udělat: *já* (kód), nebo
*majitel* (účty, smlouvy, peníze).

Stav měření: 9. 10. 2026, 1 998 nabídek.

---

## 1. Čtyři pětiny nabídek visí na jednom zdroji — *já, ale potřebuje běh v CI*

| odkud | kolik |
|---|---|
| bezrealitky.cz | 1 629 (81 %) |
| bez odkazu (SPÚ) | 219 |
| okdrazby.cz | 125 |
| farmy.cz | 9 |
| ostatní dražební portály | 16 |

Kdyby bezrealitky změnily podobu stránky nebo robota zablokovaly, web
přijde o čtyři pětiny obsahu ze dne na den. Pojistky proti tichému
selhání jsou hotové a fungují (prázdný zdroj = stará data zůstanou
a úloha spadne, `scripts/fetch-opportunities.mjs`), jenže ty umí jen
**poznat**, že se to stalo. Nenahradí chybějící nabídky.

Chybí druhý velký zdroj. Nejlepší kandidát bez licenčních potíží je
**ÚZSVM** (veřejné nabídky majetku státu) a obecní úřední desky — data
jsou veřejná a nikdo je pořádně neagreguje. Sreality by přidal
`APIFY_TOKEN` (parser `fetchSreality` v kódu je), to je ale na majiteli.

**Poznámka z 9. 10.:** zkusil jsem k tomu sáhnout a z téhle strany to
nejde — ze sandboxu, kde pracuju, není vidět na internet vůbec (i
`example.com` vrací HTTP 000). Parser cizí stránky bych psal naslepo,
což je hádání, ne práce. Chce to nejdřív běh v CI, který tu stránku
stáhne a ukáže.

## 2. Žádné fotky, a nejde to obejít přímo — *já, oklikou*

U 1 998 stahovaných nabídek je fotek **nula**. Není to opomenutí:
cizí inzertní fotky se nesmějí přebírat a odkazovat se na ně napřímo
je křehké i sporné. Vlastní inzeráty fotky mají
(`docs/kontrola-fotek.md`).

Co se udělat **dá**: u pozemku je letecký snímek smysluplnější než
fotka od makléře, a stránka pozemku už leteckou vrstvu má. Chybí
v **kartě ve výpisu** a v náhledu při sdílení — ten je dnes obrázek
okresu, tedy u všech pozemků v okrese stejný.

## 3. ~~Stránky pozemků nemají strukturovanou cenu~~ — *hotovo 9. 10.*

Bylo 0 z 1 941. Teď nesou `Offer` s cenou v CZK a výměru jako
`QuantitativeValue`. Dražba dostává poznámku o vyvolávací ceně a
žádnou dostupnost, podíl se přizná. Hlídá
`scripts/test-nabidka-pro-stroje.mjs`.

Výhrada zůstává: Google pro pozemky nemá vyhrazený bohatý výsledek,
takže se nedá slíbit, že se cena ve výsledcích ukáže.

## 4. Nevíme, co lidé na webu dělají — *čeká na data, ne na práci*

Měření návštěvnosti je nasazené teprve od 9. 10. 2026. Do té doby se
o webu neví **nic**: kolik lidí chodí, odkud, na co se dívají, kde to
vzdají. Každé rozhodnutí „co dodělat dřív" je zatím odhad.

Za měsíc sbírání bude z čeho vycházet. Do té doby nemá cenu stavět nic
jen proto, že to „asi lidi chtějí".

## 5. Realizované ceny — *majitel (smlouva a peníze)*

Celý cenový model stojí na cenách **nabídkových**, ne na tom, za kolik
se pozemky opravdu prodaly. To je strop, o který se opře každé další
zlepšení odhadu — změřeno, vlastní predikční model nad týmiž daty
nepřidal nic (`scripts/mericka-model.mjs`). Realizované ceny vydává
ČÚZK přes dálkový přístup na smlouvu.

## 6. „Dá se tu stavět?" — *částečně já, částečně licence*

První otázka kupujícího a web na ni neodpovídá. Co by k ní patřilo:
bonita půdy (BPEJ) a z ní odvod za vynětí ze zemědělského fondu, který
u stavby dělá i statisíce; záplavové území; ochranná pásma; územní
plán obce.

Územní plán není nikde strojově čitelný jednotně a část vrstev je pod
licencí. Stránka pozemku dnes aspoň odkazuje na úřad a na katastr —
dál se bez dat jít nedá, a tipovat se to nesmí.

## 7. První načtení mapy stáhne 256 kB — *já*

Změřeno v gzipu: data nabídek 79 kB, `js/min/main.js` 60 kB, mapová
knihovna 41 kB, stylopis 37 kB, stránka 23 kB, hranice krajů 15 kB.
Není to špatné číslo, ale největší položka jsou data, ze kterých je na
první obrazovce vidět pár desítek bodů.

Dalo by se posílat nejdřív tenký řez a zbytek dotáhnout. Je to ale
zásah do jádra aplikace a bez měření návštěvnosti (bod 4) se nedá
poznat, jestli se tím někomu uleví — zatím tedy ne.

## 8. Platby a e-maily — *majitel*

Hotové v kódu, čekají na účty: IČO a klíče Stripe (zvýraznění
inzerátu), potvrzená doména v Resendu (obnova hesla a upozornění na
nové pozemky). Rozepsané je to v `docs/pred-vydanim.md`.

---

## Co naopak nechybí

Ať je seznam poctivý v obou směrech. Hotové a ověřené: stahování ze
šesti zdrojů 4× denně s pojistkami proti tichému selhání, archiv
nabídek a změn cen, 2 062 stránek pozemků se srovnáním cen, odhad ceny
proti okolí, hlídání v aplikaci, účty, psaní mezi lidmi, poznámky,
offline režim, kontrola fotek AI modelem a kontrola databáze
(`scripts/kontrola-databaze.mjs`). Zkoušek je 185 souborů a každá
pojistka je prověřená sabotáží.
