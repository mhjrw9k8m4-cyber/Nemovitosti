# Slabá místa webu

Rozbor k 17. 10. 2026, nad daty z posledního běhu robota (1 980
nabídek). Není to seznam přání ani plán — je to seznam
míst, kde web stojí na tenkém ledě, seřazený podle toho, kolik by
stálo, kdyby se prolomil.

**Čím se to liší od ostatních dokumentů.** `docs/pred-vydanim.md` je
seznam věcí, které musí zapojit majitel (účty, klíče, peníze).
`docs/optimalizace.md` je deník toho, co se našlo a opravilo. Tohle je
to třetí: co je špatně i poté, co se všechno zapne a všechny nálezy
opraví.

**Každé číslo je změřené, ne odhadnuté.** U každého stojí, čím.
Co je můj úsudek a ne měření, je označené jako úsudek.

---

## 1. Web stojí na jediném zdroji

Změřeno nad `data/opportunities.json`:

| zdroj | nabídek | podíl |
|---|---:|---:|
| Bezrealitky | 1 619 | 82 % |
| SPÚ (§ 12) | 204 | 10 % |
| OK dražby | 81 | 4 % |
| Centrální evidence dražeb | 67 | 3 % |
| Farmy.cz | 9 | 0,5 % |

**Kdyby Bezrealitky přestaly odpovídat, zbylo by 361 nabídek z 1 980 —
a 25 ze 77 okresů by zůstalo úplně prázdných.** Medián okresu by spadl
na tři nabídky. Z mapy českého trhu s pozemky by se stal seznam
státních pozemků a dražeb.

Není to teoretická obava. Hlídač zdrojů právě poprvé chytil skutečný
výpadek: „OK dražby" pět dnů nevrátily nic a pak přišly se 45 místo
obvyklých 84–95. (V dalším běhu se zdroj vrátil na 81, takže to byl
výpadek, ne konec.) U zdroje, který nese 4 % obsahu, se to dá přežít.
U toho, který nese 82 %, by to byl konec webu na tu dobu.

**Chybí Sreality**, tedy největší realitní portál v zemi. Zdroj je
v kódu napsaný a čeká na `APIFY_TOKEN` (viz `docs/pred-vydanim.md`).
Dokud neběží, web neukazuje trh — ukazuje jeden portál plus státní
nabídky.

**Úsudek:** tohle je největší slabé místo webu a zároveň jediné, které
se nedá opravit kódem. Každý další zdroj je pojistka; dnes žádná není.

---

## 2. Jádro slibu — odhad ceny — má velkou chybu a mlčí o ní

Web odpovídá na otázku „je tahle cena dobrá?". Přesnost té odpovědi se
měří křížově na desetinách (`scripts/mericka-odhadu.mjs`): model se
postaví z devíti dílů dat a odhaduje ten desátý.

**Celkem: medián chyby 27,5 %**, a odhad vůbec nevznikne u 245 z 1 329
měřitelných nabídek. Rozpad podle druhu (totéž měřidlo):

| druh | medián chyby | odhad vznikl |
|---|---:|---:|
| Orná půda | 21,6 % | 545 z 571 |
| Louka / travní porost | 27,5 % | 257 z 270 |
| Lesní pozemek | 33,6 % | **27 z 64** |
| Stavební / zastavěná | **34,3 %** | 192 z 221 |
| Vinice / sad | 36,2 % | 34 z 44 |
| Ostatní plocha | **58,9 %** | 24 z 61 |
| Jiný pozemek | 854 % | 5 z 39 |

Tři věci z té tabulky:

1. **Nejhorší je to tam, kde jde o nejvíc peněz.** U stavebního pozemku
   je medián chyby 34 %. Na pozemku za dva miliony je to ±680 000 Kč.
   Zároveň je to druh, kvůli kterému na takový web lidé chodí nejčastěji.
2. **U lesních pozemků odhad většinou nevznikne vůbec** (27 ze 64).
   Člověk tam nedostane špatnou odpověď, dostane mlčení.
3. **„Jiný pozemek" a „Ostatní plocha" jsou mimo.** U pěti nabídek ze
   devětatřiceti vyšla chyba v řádu stovek procent. Pojistka v `js/ceny.js`
   ořezává jen odhady, které jsou hluboko POD cenou (to je u dražeb
   správně) — odhad několikanásobně NAD cenou projde.

**A čtvrtá věc, která platí pro všechny řádky:** měří se proti
**nabídkové** ceně, ne prodejní. Web tedy neříká „tolik ten pozemek
stojí", ale „tolik za podobné pozemky lidé chtějí". Data o skutečných
prodejních cenách nemáme a z veřejných zdrojů je nevezmeme.

**Úsudek:** verdikt v percentilech („dražší než 70 % pozemků téhož
druhu v okrese, z 23 nabídek") je poctivý a ten bych nechal. Problém je
číselný odhad vedle něj: tváří se přesněji, než je. Chybělo by u něj
říct, jak široké je to rozmezí — a u druhů, kde je chyba přes 50 %,
ho možná nevydávat vůbec.

**HOTOVO 23. 10.** Obojí. U čísla teď stojí „u tohoto druhu mine odhad
typicky o 22 %, tedy zhruba 52–81 Kč/m², změřeno křížově na 567
nabídkách", a u ostatní plochy (61 %) a „jiného pozemku" (284 %) se
částka nevydává vůbec — percentil zůstává. Naměřená chyba jede s daty,
ne jako konstanta v kódu, takže nezestárne potichu. Podrobně
v `docs/optimalizace.md`, oddíl 109.

---

## 3. Polovina nabídek nemá s čím se srovnat

Změřeno nad daty: **998 z 1 980 nabídek (50 %) leží ve skupině
okres + druh, která má méně než deset kusů.** Model na to má ústup
(okres → kraj → celá ČR), takže odpověď dostanou — ale postavenou na
vzorku, o kterém vlastní komentář v `js/ceny.js` píše, že je méně
místní, a měřením doloženo, že míchání s krajem výsledek zhoršuje.

Je to přímý důsledek bodu 1: víc nabídek = hustší srovnání = přesnější
odhad. Dvě slabá místa, ale jedna příčina.

---

## 4. Retenční smyčka je hotová a vypnutá

Hlídání umí hodně: okres i okruh od místa, druh, cenu, výměru, Kč/m²,
jen celé pozemky, vybavení. Umí poznat nové i zlevněné. Od dneška umí
i říct, proč hledání nesedí nic, a ukázat termín dražby.

**Jenže `window.PK_MAIL_ZAPNUTO = false`** (`js/config.js`), takže se
nikomu nic neozve. Člověk si uloží hledání a musí se sám vracet na web,
aby zjistil, že něco přibylo. To není hlídání, to je uložený filtr.
Push je na tom stejně (`PK_PUSH_VEREJNY_KLIC` je prázdný).

Všechno, co k tomu chybí, je v `docs/pred-vydanim.md`: ověřená doména
u Resendu, klíč v GitHub Secrets a vlastní SMTP v Supabase.

**Úsudek:** z pohledu produktu je tohle druhá nejdražší slabina po
zdrojích. Web, který umí poslat „pozemek, který hlídáte, zlevnil
o 200 000", je něco jiného než web, kam se musí chodit.

---

## 5. O webu se neví nic

**Nula návštěv je změřených.** Není nasazené měření (`supabase/navstevnost.sql`
čeká v `docs/pred-vydanim.md` jako bod 0). Nedá se tedy říct, jestli
někdo chodí, odkud, co hledá a kde odchází — a tím pádem se nedá
rozhodnout, co dodělávat.

Každé rozhodnutí o webu je dnes rozhodnutí poslepu. **Tohle je nejlevnější
položka z celého seznamu** a jediná, která se zpětně nedopočítá: graf
začíná dnem nasazení.

---

## 6. Web nemá tvář

`kontakt.html` říká: „Provozovatelem webu Parcelka je soukromá osoba."
Žádné jméno, žádné IČO, žádná adresa.

U webu, přes který lidé zvažují koupi za miliony, je to slabina ve dvou
směrech:

* **Důvěra.** Kdo tomu odhadu má věřit, když neví, kdo ho počítá.
* **Peníze.** Zpoplatněné zvýraznění inzerátu (`supabase/listings-tiers.sql`
  je připravený) bez identity a IČO prodat nejde. Platby tedy nečekají
  na kód, čekají na rozhodnutí o identitě.

**Úsudek:** tohle není technický dluh, je to rozhodnutí majitele a může
být záměrné. Ale je dobré vědět, co stojí.

---

## 7. Vlastní inzerce je prázdná

Celá polovina webu — přidávání inzerátů, fotky, kontrola fotek,
moderace, zprávy mezi lidmi, profil, zvýraznění — **má dnes nula
inzerátů** (`data/user-listings.json`).

Je to postavené, otestované a nepoužité. Dokud nepřijde první inzerent,
nese to jen údržbu: kód, zkoušky, databázové tabulky a pravidla
oprávnění, které se musí držet v chodu kvůli funkci, kterou nikdo
nepoužívá.

**Úsudek:** není to vada, je to nevyužitá investice — a hodnota se
nerozhodne kódem, ale tím, jestli se najde cesta k prvním inzerentům.
Bez bodu 5 (měření) se ani nepozná, jestli se o to někdo pokouší.

---

## 8. Obsah stárne rychleji, než se zdá

Změřeno nad archivem (`data/archiv/2026-10.jsonl`): **za sedmnáct
říjnových dnů zmizelo 308 nabídek z 1 980** — skoro šestina. Medián
životnosti ukončené nabídky je **19 dní**.

Důsledky:

* **SEO.** Z 2 156 stránek pozemků je 215 označených `noindex` —
  náhrobky po skončených nabídkách, které čekají 90 dnů, než se smažou.
  Trvalou hodnotu ve vyhledávači nesou krajské, okresní a druhové
  stránky; stránky jednotlivých pozemků jsou z principu dočasné.
* **Uložené pozemky.** Člověk si uloží pozemek a za tři týdny je
  v polovině případů pryč. (Profil to od dneška říká; předtím mlčel.)
* **Dražby.** Ze 148 dražeb a exekucí je 66 do týdne. U nich je lhůta
  všechno — a na tu se nedá upozornit bez bodu 4.

---

## 9. Čtvrtina nabídek je něco jiného, než se zdá

**523 z 1 980 nabídek (26 %) jsou spoluvlastnické podíly.** V ceně je
zlomek pozemku, v inzerátu bývá výměra celé parcely. Pro většinu
kupujících je to bezcenné a zároveň to vypadá jako trhák.

Web to na každém místě pojmenovává (cena za metr se počítá z výměry,
která kupujícímu připadne; hlídání umí „jen celé pozemky"; verdikt se
u podílu nevydává). Zbývající slabina je jinde: ~~**podíly ředí vzorek,
ze kterého se počítá obvyklá cena**~~ — **tohle měření 23. 10. vyvrátilo,
viz níž**. Měřidlo přesnosti pracuje s 1 329
nabídkami z 1 980 — jsou to celé pozemky na prodej, tedy bez podílů
a bez dražeb, jejichž vyvolávací cena se s nabídkovou srovnávat nedá.

**ZMĚŘENO 23. 10., A VYŠLO TO NAOPAK.** Že podíly vzorek křiví, zní
samozřejmě — jejich cena za metr je uměle nízká. Jenže když se z něj
vyhodí, odhad se ZHORŠÍ: medián chyby 29,8 → 31,8 % (+2,0 p.b.)
a znaménkový test je proti (417 nabídek blíž, 484 dál). Druhá varianta,
podíl přepočítaný na výměru, která kupujícímu připadne, je taky horší:
31,1 % (+1,2 p.b.), párově 207 : 259. Vyhozením se navíc ztratí
jedenadvacet odhadů, protože v řídkých okresech klesne vzorek pod mez.
Mechanismus neznám a nebudu si ho vymýšlet; vím jen, že dnešní model je
z těch tří variant nejlepší, takže se **nic nemění**. Obě varianty
zůstávají v měřidle (`--bez-podilu`, `--podil-prepocet`), aby se ta
otázka nemusela otevírat znovu od nuly.

A druhá nerovnováha: **stavebních pozemků je jen 234 (12 %)**, zatímco
orné půdy 571. Nabídka webu je zemědělská, zatímco poptávka na podobných
webech bývá stavební. *(Druhá polovina té věty je úsudek — bez měření
návštěvnosti ji nemám čím doložit.)*

---

## 10. Křehkost provozu

* **Scrapery stojí na cizích stránkách, které se mění bez ohlášení.**
  Hlídač zdrojů to pozná (změna podoby stránky = parser nic nenajde =
  „prázdno" zastaví běh), ale opravit to musí člověk.
* **„OK dražby" se stahují projížděním 3 021 ID po jednom.** Je to
  nejkřehčí zdroj: závisí na tom, že homepage vydá nejvyšší ID a že
  API odpoví na tisíce dotazů. Od dneška se aspoň pozná, když se část
  dotazů nedoručí.
* **Data se obnovují čtyřikrát denně** (cron po 6 hodinách). U dražby,
  která je zítra, to stačí; u nového inzerátu to znamená, že web o něm
  ví nejpozději za šest hodin. Rychlejší obnova znamená víc zátěže na
  cizí servery.
* **Jeden repozitář, jeden člověk, jedna větev.** Zkoušky drží CI ve dvou
  sadách (bez prohlížeče a v něm); kolik jich je, říká `scripts/` a běh CI,
  ne tenhle odstavec — číslo tady zastaralo za dva dny. Bus faktor je 1.

---

## 11. Osm výhrad k celku — co z nich platí (měřeno 18. 10.)

Majitel sepsal osm výhrad k systému jako celku. Tady je u každé číslo,
ne dojem: co platí, co už neplatí a co platí, ale nejde to odsud.

**1) Úřední desky obcí nejsou zapojené — PLATÍ.** Změřeno nad
`data/opportunities.json`: typu `obec` je **0 z 1 982 nabídek**.
Roura pro ně přitom hotová je (kategorie „Obecní záměr" v mapě,
generátor stránek, `scripts/test-obec.mjs` projde celou cestu od dat
po detail) — chybí jen zdroj. Web o tom **nelže**: slib „Z úřední
desky" se 11. 10. odstranil a hlídá to `scripts/test-sliby.mjs`.
Zapojení nejde udělat odsud: `edesky.cz` i `data.gov.cz` jsou ze
zdejšího prostředí nedostupné (síťová politika odpoví na CONNECT 403;
přeměřeno 23. 10., stále platí),
takže parser se nemá o co opřít a psát ho podle hádaného formátu
znamená robota, který spadne až v provozu.

**2) Závislost na třetích stranách — PLATÍ, zmírněno.** Podíly zdrojů
jsou v oddíle 1 (82 % jeden zdroj). Co se změnilo: stahování má tři
pokusy, respektuje `Retry-After`, má časový limit 20 s a tichý výpadek
jednotlivého zdroje hlásí hlídač. To ale neřeší závislost — jen ji
přestane zakrývat.

**3) Tečky místo polygonů — PLATÍ, ale ne z nedbalosti.** Polygon
parcely se kreslí z katastrálního území a parcelního čísla. Změřeno:
**skutečné parcelní číslo má 283 z 1 982 nabídek (14,3 %)**, u zbytku
stojí v datech „—"; kód katastrálního území nemáme ani u jedné.
Polygon by tedy šel u sedmi nabídek z padesáti, a i u nich by se
musela obkreslit data ČÚZK (odsud nedostupná; sledování listů
vlastnictví jsem odmítl a trvám na tom). Co jde bez identifikace
parcely, hotové je: katastrální hranice jsou na mapě jako vrstva.

**4) „Všechno na jedné dlouhé stránce" — ČÁSTEČNĚ.** Změřeno na
telefonu 390 × 844: stránka pozemku **3 263 px, tedy 3,9 obrazovky**,
a dvě nejdelší části (rádce, „Co byste měli vědět") jsou sbalené.
Okresní výpis má strop 60 řádků. Úvodní stránka se otevírá seznamem
nabídek (17. 10. se to na přání majitele obrátilo na mapu a 18. 10.
vrátilo zpátky); mapa je na jedno klepnutí vedle a volba vydrží celou
návštěvu. Zbývá: na monitoru pod
1 100 px se stránka pozemku rozpínala do šířky okna — opraveno
18. 10. (viz `docs/optimalizace.md`, oddíl 22).

**5) Ukládání jen do prohlížeče — NEPLATÍ UŽ.** Uložené pozemky chodí
od 18. 10. na účet (`supabase/ulozene-na-uctu.sql`,
`js/ulozene-ucet.js`, 21 kontrol v prohlížeči); poznámky a hlídaná
hledání chodily na účet už dřív. **Bez přihlášení** to dál zůstává
v jednom prohlížeči — to je záměr, ne nedostatek.

**6) Slabý onboarding — ČÁSTEČNĚ NEPLATÍ.** Co je na první obrazovce
telefonu změřeno: věta s živými čísly („Nabízíme 1 942 pozemků…“),
hledání, přepínač **i s počtem** („Seznam (1 942)") a nad mapou
nápověda „Klepněte na kraj". Chybí průvodce prvním hledáním; to je
úsudek, ne měření.

**7) Chybí platební model — PLATÍ, je ale hotový a vypnutý.** Stripe
i placené zvýraznění inzerátu jsou napsané a zkoušené; čekají na IČO
a účet (`docs/pred-vydanim.md`). Dokud to majitel nezapne, nejde
o vývoj, ale o rozhodnutí.

**8) Alerty nejsou okamžité — PLATÍ.** Rozesílání běží plánovaně
ráno (cron 7:35) a je **vypnuté** (`PK_MAIL_ZAPNUTO = false`,
`--opravdu` v `rozesilani.yml`). Okamžitost znamená dvě věci:
zapnout maily a běhat častěji než jednou denně. První je rozhodnutí
majitele, druhé je pak jeden řádek v plánu.

## 12. Značková barva na webu JE — a není měděná *18. 10.*

Jedna z výhrad zněla „chybějící vizuální identita, všechno je šedé".
Změřil jsem to tokeny, ne okem: nad ohybem telefonu 390 × 844 nese
značkovou barvu **175 prvků** — aktivní záložka přepínače
(`#004F2F` s bílým textem), ovládání mapy a tlačítko „Nahoru"
(`#2B7652`), značka v hlavičce (`#0F5C3B`) i odznaky shluků.

Identita tedy existuje a je **tmavě zelená**, ne šedá. (Token se
historicky jmenuje `--znacka`, ačkoli v něm dávno žádná měď není —
to je na přejmenování, ne na přebarvení.)

Požadavek na tmavě modrou (navy) je proto **změna vkusu, ne oprava
vady**: kontrastní zkouška nad zelenou prochází, `docs/vizualni-jazyk.md`
i barevné zkoušky na ní stojí. Přebarvit se dá, ale je to práce na
celou paletu a nic změřeného ji nevyžaduje — proto ji nedělám sám
od sebe.

---

## 13. Zabezpečení: co je zavřené a co zavřít nejde *23. 10.*

Tenhle dokument o zabezpečení dosud neměl ani řádek, a to byla mezera
sama o sobě. Co je po dnešním průchodu zavřené (každá položka má
zkoušku a sabotáž, podrobně `docs/optimalizace.md`, oddíly 112–123):

* **CSP na všech 2 360 stránkách** s hashi vložených skriptů; cizí
  skript ani podstrčený `<script>` se nespustí.
* **Cizí text se vykreslí jako text** — měřeno nepřátelskými daty na
  třech frontách (vykreslení v prohlížeči, zprávy mezi lidmi,
  generátory stránek).
* **Práva v databázi**: RLS na všech tabulkách, u každé `security
  definer` funkce volatelné veřejným klíčem je doloženo, čím si ověřuje
  volajícího.
* **Stropy na všechno, co jde zvenčí ZAPSAT**: přihlášky k hlídání,
  poznámky, uložené pozemky (jednotlivě i hromadně), odběry upozornění,
  inzeráty, zprávy, hledání — a denní strop na řádky měření
  návštěvnosti.
* **Odhlášení** ruší sezení i na serveru a maže v prohlížeči kopii toho,
  co patří účtu.
* **Úlohy v CI** mají napsaná nejmenší potřebná práva, nenechávají si
  token na disku a balíčky instalují ze zámku bez životních skriptů.
* **Rámování cizí stránkou** (clickjacking) je na stránkách, kde
  klepnutí mění účet nebo uložená data, zavřené — a změřeno, že chrání
  skrytí, ne vyskakování z rámu.
* **Jednorázový token na obnovu hesla** se z adresy maže hned, ne až po
  uložení nového hesla.
* **Heslo** má aspoň osm znaků u zakládání i u nového hesla — a u
  přihlášení se délka schválně nehlídá, aby zvýšení nevyhodilo lidi se
  staršími kratšími hesly.
* **Odkazy do nového okna** mají `rel` s `noopener` všechny (2 790 na
  2 806 prohlédnutých souborech), takže cizí stránka nemůže přepsat
  adresu v okně, ze kterého se na ni kleplo. Dřív to hlídala jedna
  kontrola na jednom odkazu.

Dvě měření, která **nic nenašla** (a je to taky výsledek): `npm audit
--omit=dev` hlásí 0 zranitelností a v repozitáři není žádný tajný klíč —
jediný řetězec, který na klíč vypadá, je *falešný* klíč ve zkoušce, na
němž se ověřuje, že se klíče z výpisů mažou. Veřejný „publishable" klíč
v `js/config.js` tam patří a je u něj napsané proč.

Co zavřít **nejde odsud** a co je vědomá hranice:

1. **Hlavičky, které umí jen server.** `Strict-Transport-Security`,
   `X-Frame-Options`/`frame-ancestors`, `Permissions-Policy`. GitHub
   Pages je statické hosting a `<meta>` část z nich ignoruje. Je to
   v `docs/pred-vydanim.md` jako volitelný bod 6 (až na Vercelu nebo za
   CDN). U `Referrer-Policy` to `<meta>` umí — ale změřeno 23. 10., že
   dnešní prohlížeč posílá cizím serverům jen původ i bez ní, takže by
   nezměnila nic (oddíl 127 v `docs/optimalizace.md`).
2. **Nastavení projektu v Supabase**: povolené adresy pro odkazy
   z e-mailu, potvrzování e-mailu, vlastní SMTP. Z repozitáře se to
   nedá ani nastavit, ani změřit — jen napsat do seznamu před vydáním.
3. **Čítače se dají nafouknout** (`bump_view`, `zapis_navstevu`). Brzda
   by potřebovala poznat, kdo volá, tedy ukládat IP nebo označení
   zařízení ke každému zhlédnutí — to zásady soukromí slibují nedělat
   a získalo by se tím málo (čísla vidí jen majitel, nikde se podle
   nich neřadí). Zapsáno jako hranice, ne jako nedodělek.
4. **Zkouška umí měřit jen repozitář.** Jestli někdo pustil
   `supabase/00-vse.sql` na běžícím projektu, pozná jen Supabase —
   a dokud se nepustí, platí všechny stropy výš jen na papíře.
5. **Počet fotek v úložišti není zastropovaný.** Velikost ano (3 MB),
   typ ano (jen JPEG), cizí složka ne (zápis jen pod vlastní `uid`)
   a v inzerátu je jich nejvýš osm — ale kolik souborů si přihlášený
   účet do své složky nahraje, nehlídá nic, a platí to vlastník
   projektu. Je to jediná ze zapisovatelných cest, která zůstala bez
   stropu; sepsáno jako úkol, ne jako hranice.

---

## Co bych dělal a v jakém pořadí

Seřazeno podle poměru „co to přinese" ku „co to stojí". **První tři
položky nejsou kód** — a to je samo o sobě zjištění.

1. **Nasadit měření návštěvnosti.** Nejlevnější věc na seznamu a jediná,
   která se zpětně nedopočítá. Bez ní je všechno ostatní hádání.
2. **Zapnout e-maily hlídání.** Hotová funkce, která dnes nedělá nic.
   Mění web z „místa, kam se chodí" na „web, který se ozve".
3. **Rozhodnout o identitě provozovatele.** Odemyká důvěru i platby.
4. **Druhý velký zdroj nabídek** (Sreality přes Apify). Opravuje bod 1,
   3 a kus bodu 2 naráz — víc nabídek znamená hustší srovnání a tím
   přesnější odhad.
5. ~~**Říct u odhadu, jak je nejistý** — a u druhů, kde je medián chyby
   přes 50 %, ho nevydávat.~~ **Hotovo 23. 10.** (oddíl 109
   v `docs/optimalizace.md`).

Co bych **nedělal**: nepouštěl bych se do dalších funkcí vlastní
inzerce, dokud nebude bod 1. Je postavená celá a prázdná; další kus
by byl další nevyužitá investice.
