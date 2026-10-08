# Parcelka — kde to stojí a co zbývá

Cíl zůstává: web, který **sám** publikuje inzeráty, **sám** posílá upozornění na
lokalitu a **sám** přijímá platby za zvýraznění (299 Kč). Bez ručního zásahu
u běžného provozu.

Tenhle soubor dřív tvrdil, že není hotová ani první fáze — všech šest odrážek
bylo nezaškrtnutých, včetně účtů, databáze a samoobsluhy inzerátů, které běží.
Takový plán je horší než žádný: podle něj se nedá poznat, co ještě chybí.
Čísla níž jsou proto naměřená, ne odhadnutá.

<!-- PK-STAV-OD: přepočítá scripts/generate-roadmap-cisla.mjs -->

## Stav k 8. 10. 2026

| Co | Jak to je |
|---|---|
| Web | GitHub Pages, vlastní doména. **Přesun na Vercel z původního plánu se neuskutečnil a není potřeba** — Pages web nasazují samy z větve a server na pozadí dělá Supabase. U Vercelu zůstalo vedlejší nasazení, proto se tam zapíná jeho analytika. |
| Databáze | Supabase, 14 tabulek a 33 funkcí (RPC). Sloučený balík k nahrání je `supabase/00-vse.sql`. |
| Data příležitostí | 2 006 nabídek (1 843 prodejů, 132 dražeb, 31 exekucí), 1 618 popisů od inzerentů. Na webu je z toho vidět 1 950 — zbytek je týž pozemek na druhém portálu. Stahuje se samo každých 6 hodin (`update-data.yml`). |
| Stránky | 2 053 vlastních stránek pozemků, 77 okresních, 14 krajských — všechny generované, v `sitemap.xml`. |
| Zkoušky | 172 souborů, v CI dva úkoly: 77 bez prohlížeče, 91 s prohlížečem. |

<!-- PK-STAV-DO -->

## Fáze

- [x] **Fáze 0 — Účty a základ**
  Supabase, Resend i Stripe jsou založené; klíče k datům (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `APIFY_TOKEN`) jsou v tajných proměnných
  repozitáře a akce s nimi běží.

- [x] **Fáze 1 — Databáze + web na ní**
  Tabulky `listings`, `watch_subscriptions`, `saved_searches`, `payments`,
  `messages`, `chat_messages`, `account_tier`, `listing_checks`, `alert_seen`,
  `mail_nastaveni`, `mail_poslane`. Mapa čte zveřejněné inzeráty z databáze
  (RPC `public_listings`) a míchá je se stahovanými příležitostmi.
  *Jediná odrážka, která se nesplnila podle plánu: web neběží na Vercelu.
  Viz tabulka výš — nebylo proč.*

- [x] **Fáze 2 — Inzeráty automaticky**
  Vyšlo to **lepší, než plán sliboval**: žádný stav „čeká na kontrolu" a žádná
  schvalovací stránka. `create_listing` dá inzerát na mapu hned jako „Od
  majitele" a vrátí tajný token, kterým majitel vidí svůj inzerát, počet
  zhlédnutí a může ho smazat — bez přihlašování, jako na Bazoši. Fotky
  kontroluje AI model rovnou v prohlížeči (`docs/kontrola-fotek.md`), denní
  akce `kontrola-inzeratu.yml` hlídá inzeráty dál.

- [ ] **Fáze 3 — Platby (Stripe) za zvýraznění** ← *výdělek, ČEKÁ NA MAJITELE*
  Kód hotový: `api/create-checkout.js`, `api/stripe-webhook.js`, zkouška
  `scripts/test-platba.mjs`. Ve formuláři je zaškrtávátko „Zvýraznit inzerát
  299 Kč" a pod ním poctivá věta, že se platba právě spouští a zatím je
  přidání zdarma.
  **Co chybí:** IČO pro ostrý režim a klíče Stripe. Do té doby se nic
  neúčtuje a web to neslibuje.

- [ ] **Fáze 4 — Hlídání lokality e-mailem** ← *ČEKÁ NA MAJITELE*
  V aplikaci hotové a běží: uložená hledání na `hlidani.html`
  (`docs/hlidani-v-aplikaci.md`). Centrum upozornění a odznak s počtem
  nových tu dřív stály taky — funkce byla na přání odebrána celá
  (skript i stránka upozornění jsou z repozitáře pryč, stejně jako obě
  její dokumentace). Co z ní zbylo: počet nepřečtených zpráv ukazuje
  dlaždice v profilu.
  E-mailem hotové v kódu, ale **vypnuté**: `supabase/hlidani-mailem.sql`,
  `scripts/send-alerts.mjs`, `scripts/mail-sklad.mjs`,
  `.github/workflows/rozesilani.yml` (denně v 7:35 UTC) a odhlášení jedním
  klepnutím na `odhlasit-maily.html`. Akce zatím běží **nasucho** — vypíše,
  co by odeslala, a neodešle nic.
  **Co chybí, v tomhle pořadí:**
  1. v Resendu potvrdit doménu odesílatele;
  2. do tajných proměnných repozitáře dát `RESEND_API_KEY` a `PK_MAIL_FROM`
     (např. `Parcelka <hlidani@parcelaka.cz>`);
  3. zkusit to **jednou ručně**: Actions → „Rozeslat upozornění e-mailem" →
     Run workflow → `opravdu` = true. První běh u každého hledání nic
     neposílá, jen si zapamatuje, co už je staré — takže se nedá omylem
     rozeslat dvě stě mailů o nabídkách, které tam byly včera;
  4. teprve pak v `js/config.js` přepnout `PK_MAIL_ZAPNUTO` na `true`, aby
     se v aplikaci ukázalo zaškrtávátko „posílat e-mailem".

- [x] **Fáze 5 — Účty uživatelů**
  Přihlášení e-mailem a heslem (`js/auth.js`), uložené pozemky a hledání
  napříč zařízeními, poznámky, psaní v aplikaci (`docs/psani-v-aplikaci.md`),
  nastavení účtu (`docs/nastaveni-uctu.md`).

## Co musí zařídit majitel (nejde to za něj)

1. **IČO / živnostenský list** — bez něj nejde legálně brát a danit platby.
   Blokuje fázi 3.
2. **Resend: potvrzená doména odesílatele** + dvě tajné proměnné.
   Blokuje fázi 4. Postup je o čtyřech krocích výš.
3. **Klíče Stripe** (test stačí na zkoušku, ostré až s IČO). Blokuje fázi 3.

Nic jiného už na majiteli nevisí: data, stránky, mapa, inzeráty, hlídání
v aplikaci i kontrola fotek běží samy.

## Nápady, které čekají na data (ne na práci)

**Časová osa trhu** (posuvník zpět do historie: jak se na mapě objevovaly
a mizely exekuce a jak se hýbala cena). Technicky je to snadné a snímky
už se sbírají — `scripts/historie-cen.mjs` běží spolu s obnovou dat 4×
denně. Zatím ale není z čeho:

| co máme | rozsah |
|---|---|
| nabídky (`first_seen`) | 19. 9. – 4. 10. 2026, tedy **16 dní** |
| historie cenových hladin | **21 dní** |

Posuvník přes šestnáct dní by předstíral stroj času, který neexistuje.
Za **půl roku** sbírání začne ukazovat sezónu, za rok meziroční srovnání —
teprve tam to má cenu stavět. Do té doby by to byla ozdoba, ne nástroj.

**Realizované ceny.** Celý cenový model stojí na cenách *nabídkových*,
ne na tom, za kolik se pozemky opravdu prodaly. To je strop, o který se
opře každé zlepšení modelu (změřeno: vlastní predikční model nad týmiž
daty nepřidal nic, viz `scripts/mericka-model.mjs`). Realizované ceny má
ČÚZK a vydává je přes dálkový přístup na smlouvu — otázka smlouvy
a peněz, ne kódu.

## Co dělám já

Kód a zkoušky. Každou změnu měřím na skutečných datech a každou pojistku
zkouším rozbít — kontrola, kterou nejde položit sabotáží, nic nehlídá.

---

## Archiv nabídek (od 10/2026)

`data/archiv/YYYY-MM.jsonl` + `data/archiv/stav.json`, plní `scripts/archiv.mjs`
při každém běhu robota (`.github/workflows/update-data.yml`).

**Proč.** Web znal jen dnešek. `data/opportunities.json` se při každém běhu
přepíše celý a po zmizelé nabídce zbyl jen náhrobek, který se po 90 dnech
smaže. Nikde pak nebylo, že pozemek byl za tolik nabízený od–do — přitom
je to jediný údaj o trhu, který tenhle web získává sám.

**Co je řádek.** Uzavřené období, kdy jedna nabídka visela za jednu cenu:
klíč pozemku (bez ceny!), obec, okres, druh, typ, výměra, cena, `od`, `do`
a důvod (`zmizela` / `cena`). Z navazujících období se poskládá celá doba
na trhu i historie slev u konkrétního pozemku.

**Proč JSONL a ne SQLite nebo Parquet.** Jeden řádek na řádek souboru,
jeden soubor na měsíc, nikdy se nic nepřepisuje — git pak vidí jen nové
řádky a repozitář neroste. Binární formáty se nedají porovnat a každá
verze se v gitu uloží celá. Databáze se z těchhle řádků kdykoli vyrobí;
postup je známý jako *git scraping* (simonwillison.net/2021/Dec/7/git-history/).

**Zpětný dopočet.** `node scripts/archiv.mjs --zpetne` projde historii
`data/opportunities.json` v gitu a archiv z ní postaví. Při zavedení to
dalo 920 uzavřených období z 25 dnů (97 otisků od 14. 9. 2026).

**Co z toho jde dnes spočítat:** doba na trhu (medián 7 dnů u zmizelých),
kolik nabídek zlevnilo (138 z 920) a kde (Hodonín 14, Praha-východ 8).

**Pozor:** jsou to ceny NABÍDKOVÉ a „zmizela" neznamená „prodáno" —
nabídka mohla být i stažena. Nic jiného se z veřejných zdrojů poznat nedá.
