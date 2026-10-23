# Co musí zapojit majitel webu

Všechno ostatní je hotové v kódu a otestované. Tohle jsou věci, které
za majitele nikdo udělat nemůže — jsou to účty, klíče a peníze.

Řazeno podle toho, co nejvíc chybí lidem, kteří web používají dnes.

## Kolik to celkem zabere

Aby bylo vidět, že to není nekonečný seznam. Odhady jsou čistého času,
ne čekání na DNS.

| | co | kolik |
|---|---|---|
| 0 | měření návštěvnosti do Supabase | pár minut |
| 1 | doména v Resendu (3 záznamy u Wedosu) + klíč do Secrets | ~30 min |
| 2 | zapnout rozesílání upozornění | minuty, až je hotové 1 |
| 3 | databáze — pustit SQL a dvě tajemství | ~1 hodina |
| 4 | Stripe (ostré klíče až s IČO) | rozhodnutí, ne práce |
| 5 | push do telefonu (VAPID) | ~30 min |
| 6 | volitelné (Sreality) | ~10 min |
| 7 | rozhodnutí o čtyřech červených | jedno písmeno |
| 8 | ověřit, že se CI spouští sama | ~5 min |

**Body 0 a 1 jsou to podstatné**; zbytek web neblokuje. Reálně je to
jeden až dva večery a web je venku.

**Co NENÍ na tomhle seznamu, je hotové.** Kód i zkoušky jsou zavřené a
CI zelená. Co by se dalo ještě leštit (zbývá 28 ovládacích prvků
v oknech a naklikaných stavech, viz oddíl 108 v `docs/optimalizace.md`),
návštěvník nepozná a vydání to nebrání.

---

## 0. Nahrát měření návštěvnosti  ← nejlevnější a nejdřív

**Proč první:** je to jediný údaj, který o webu chybí úplně. Dokud ho
není, nedá se rozhodnout, co dodělávat, jestli má smysl platit doménu,
ani kolik ten web stojí. A hlavně: **měření začíná dnem nasazení.**
Zpětně se nedopočítá nic, takže každý den odkladu je den, který už
nikdy nebude v grafu.

**Co udělat (jednou, pár minut):**
1. Supabase → SQL Editor → nahrát `supabase/navstevnost.sql`
   (nebo celý `supabase/00-vse.sql`, je tam taky).
2. Za pár dní si to přečíst:
   `SUPABASE_SERVICE_ROLE_KEY=… node scripts/navstevnost.mjs`
   Servisní klíč je v Supabase → Project Settings → API → service_role.

**Co se měří:** datum, jméno stránky, doména odkazu, telefon/počítač.
Nic víc. Žádná cookie, žádná IP, žádný identifikátor — v databázi
nevzniká řádek za návštěvu, jen se zvedne čítač. Proto to nepotřebuje
souhlas ani lištu. Kdo má v prohlížeči „nesledovat", se nepočítá.

**Jak si ověřit, že to opravdu sedlo** (a zároveň že sedí zbytek
databáze — tabulky, funkce i to, kdo se k nim dostane):

```
SUPABASE_SERVICE_ROLE_KEY=… node scripts/kontrola-databaze.mjs
```

Nic nezapisuje a nevolá jedinou funkci — jen se databáze zeptá, co
v ní je, a porovná to s `supabase/00-vse.sql`. Co nesedí, vypíše
i s tím, co s tím dělat. Servisní klíč se do výpisu nedostane, takže
se výstup dá v klidu poslat dál.

Volitelně, a stojí to za to, přidejte přihlašovací údaje zkušebního
účtu: `PK_TEST_EMAIL=… PK_TEST_HESLO=…`. Projde se tím i role
„přihlášený uživatel" — a přesně v ní tu jednou byla díra, kvůli
které si statistiku návštěvnosti mohl přečíst každý, kdo si založil
účet.

---

## 1. Obnova hesla chodí z cizí adresy  ← nejnaléhavější

**Co se děje dnes:** `js/auth.js` volá `/auth/v1/recover`, tedy Supabase.
Ten posílá svým vlastním serverem. Má to dvě mouchy: přísný limit
(jednotky e-mailů za hodinu na volném tarifu, Supabase to sám označuje
za režim na zkoušení) a odesílatele, který není `parcelaka.cz` — takové
e-maily padají do spamu častěji.

**Co udělat:**
1. V Resendu potvrdit doménu `parcelaka.cz` (tři DNS záznamy u Wedosu —
   postup je v `docs/oprava-hlidani-a-pridavani.md`).
2. V Resendu vyrobit API klíč (oprávnění *Sending access*).
3. Supabase → Project Settings → Authentication → SMTP Settings:
   hostitel `smtp.resend.com`, port 465, uživatel `resend`,
   heslo = ten API klíč, odesílatel `hlidani@parcelaka.cz`.

---

## 2. Upozornění na nové pozemky e-mailem

Kód je hotový a otestovaný (`scripts/send-alerts.mjs`, 66 kontrol).
Bez klíčů běží nasucho a sám vypíše, co mu chybí.

1. Do tajných proměnných repozitáře (*Settings → Secrets and variables →
   Actions*) přidat `RESEND_API_KEY` (týž klíč jako výš) a
   `PK_MAIL_FROM` (např. `Parcelka <hlidani@parcelaka.cz>`).
2. Zkusit **jednou ručně**: Actions → „Rozeslat upozornění (e-mail
   a telefon)" → Run workflow, přepínač *Opravdu odeslat* **vypnutý**.
   Nic se neodešle, jen se vypíše, co by šlo.
3. Pak znovu s přepínačem **zapnutým**. První běh u každého hledání nic
   neposílá — jen si zapamatuje, co už je staré. Nedá se tedy omylem
   rozeslat dvě stě mailů o nabídkách, které tam byly včera.
4. Teprve pak v `js/config.js` přepnout `PK_MAIL_ZAPNUTO` na `true`.
   Do té doby se přepínač „posílat e-mailem" v aplikaci vůbec nevykreslí:
   slíbit poštu, která nepřijde, je horší než ji neslibovat.
5. Volitelně: aby pošta odcházela i bez ručního spouštění, musí se
   v `.github/workflows/rozesilani.yml` dopsat `--opravdu` natvrdo.
   **Zatím schválně není** — cron, který se po prvním zeleném běhu
   rozjede na skutečné lidi, se nemá stát omylem.

---

## 3. Databáze

`supabase/00-vse.sql` je jeden spustitelný soubor složený ze všech
dílčích migrací. Pustit v Supabase → SQL Editor (nebo tlačítkem
„Nasadit SQL" na GitHubu, workflow `nasad-sql.yml`).

**Na to tlačítko jsou potřeba tajemství, která jinde v tomhle seznamu
nestála:**

* `SUPABASE_URL` — adresa vašeho projektu (`https://…supabase.co`,
  najdete ji v Supabase → Settings → API). Čtou ji tři úlohy:
  `nasad-sql.yml`, `kontrola-inzeratu.yml` a `rozesilani.yml`. Tajná
  není, ale v Secrets být musí, jinak ty úlohy neví, kam se hlásit.
* `SUPABASE_PAT` — osobní přístupový token ze
  [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).
  Bez něj úloha skončí hláškou „Chybí SUPABASE_PAT". Přes SQL Editor
  v prohlížeči token potřeba není; je jen pro to tlačítko.

Obojí se vkládá v GitHubu → Settings → Secrets and variables → Actions.

**Pustit to SQL znovu, i když databáze už stojí — kvůli úložišti
fotek.** Od 23. 10. je ve `supabase/listings-photos.sql` navíc strop
na velikost souboru (3 MB), seznam povolených typů (jen `image/jpeg`)
a podmínka, že přihlášený smí nahrávat **jen do své složky**. Bez
spuštění zůstane běžící projekt bez nich: do veřejného úložiště by šlo
uložit cokoli a jak velkého. `on conflict` je napsané tak, že to
nastaví i existujícímu úložišti, takže stačí jeden běh a nic se
nerozbije. Hlídá to `scripts/test-sql-prava.mjs` (v repozitáři; že to
někdo pustil, pozná jen Supabase).

**A kvůli přihláškám k hlídání.** Týmž během přijde strop dvanácti
hlídaných míst na jednu e-mailovou adresu (`subscribe_watch` smí
zavolat kdokoli s veřejným klíčem) a funkce `uklid_hlidani()`, která
maže nepotvrzené přihlášky starší třiceti dní; volá ji noční
`uklid-databaze.mjs`. Dokud SQL neproběhne, může si jedna adresa
nechat založit přihlášku na každý okres a nepotvrzené řádky v tabulce
leží navždy.

*(Vysvětlená ta tajemství byla v samotných úlohách i ve skriptech, ale
ne tady — a tenhle seznam je to jediné, podle čeho se web spouští.
`SUPABASE_URL` jsem při prvním zápisu minul a našla ho až ta zkouška,
která na to od teď dohlíží: `scripts/test-tajemstvi.mjs`.)*

Změřeno 23. 10. na čistém PostgreSQL 16: **2 971 řádků, 16 tabulek,
43 vlastních funkcí, 14 politik RLS, 39 indexů.** Projde bez jediné
chyby. Čísla se s každou migrací mění, takže se **už neopisují ručně**:
vypisuje je `scripts/test-sql-cista.mjs` na doopravdy založené databázi
(řádek „· soupis: …"), odkud se sem mají brát. *(Dřív tu stálo „2 334
řádků, 56 funkcí" a pak „2 814 řádků, 39 funkcí" — pokaždé to
zestárlo dřív, než si toho kdo všiml.)*

**Pustit znovu, i když to už jednou proběhlo.** Přibyly dva soubory:

* `supabase/vykon.sql` — dva chybějící indexy, přepsané `my_threads()`
  a `unread_count()` (352 ms → 1,3 ms u odznaku nepřečtených, který se
  počítá při otevření každé stránky), jedinečnost potvrzovacích
  a odhlašovacích tokenů a úklid starších podob `save_search`;
* `supabase/ulozene-na-uctu.sql` — **uložené pozemky na účtu**. Bez něj
  zůstávají uložené pozemky jen v prohlížeči, tedy jako dřív: web si
  o ně řekne, databáze odpoví „takovou funkci neznám", a prohlížeč to
  tiše spolkne. Nic se nerozbije a nic se neztratí — jen se uložené
  pozemky nepřenesou na druhé zařízení.

Dokud se soubory nepustí, web jede na starých funkcích. Celý
`00-vse.sql` jde pustit opakovaně.

Jestli to už proběhlo, pozná se na `/diagnostika.html` — ta ověří
podpisy funkcí, které web volá.

---

## 4. Platby za zvýraznění inzerátu

Kód hotový: `api/create-checkout.js`, `api/stripe-webhook.js`,
zkouška `scripts/test-platba.mjs`. Ve formuláři je zaškrtávátko
„Zvýraznit inzerát 299 Kč" a pod ním poctivá věta, že se platba teprve
spouští a zatím je přidání zdarma.

**Chybí:** IČO pro ostrý režim a klíče Stripe. Do té doby se nic
neúčtuje a web nic neslibuje.

**Až se platby zapnou, patří k tomu jeden řádek v CSP.** Stránka
bude volat `api/create-checkout.js`; pokud ten koncový bod poběží na
jiné adrese než web, musí se přidat do `connect-src`
v `scripts/csp.mjs` (dnes tam je jen vlastní server, Supabase
a geokodér). Samo přesměrování na Stripe Checkout je navigace, tu
CSP neřeší. Hlídá to `scripts/test-csp.mjs`: kdyby se volalo nikam
nepovolené, zkouška ohlásí porušení `connect-src`.

---

## 5. Upozornění do telefonu (push)

Odložené na přání — necháváme jen e-mail. Klíče VAPID jsou vyrobené
a předané. Až bude zájem: tři tajné proměnné (`PK_VAPID_PRIVATNI`,
`PK_VAPID_VEREJNY`, `PK_VAPID_SUBJECT` ve tvaru `mailto:…`) a veřejný
klíč do `js/config.js` jako `PK_PUSH_VEREJNY_KLIC`.

Hotové je všechno ostatní: migrace, service worker, strana prohlížeče,
šifrování i rozesílač.

---

## 6. Volitelné

- `APIFY_TOKEN` + `APIFY_SREALITY_ACTOR` — přidá Sreality jako zdroj
  nabídek. Bez klíče se zdroj přeskočí, nic se nerozbije.

- **Až kdyby web běžel jinde než na GitHub Pages: tři hlavičky,
  které jde nastavit jen ze serveru.** Od 23. 10. nese každá stránka
  CSP v `<meta>` (viz `docs/optimalizace.md`, oddíl 112), ale
  prohlížeč v `<meta>` ignoruje `frame-ancestors`, `report-uri`
  a `sandbox`. Na vlastním hostingu tedy přibude:
  `Content-Security-Policy: frame-ancestors 'none'` (nebo
  `X-Frame-Options: DENY`) proti vložení webu do cizího rámu,
  `Referrer-Policy: strict-origin-when-cross-origin`
  a `Strict-Transport-Security`. **Nic z toho nedrží vydání** — je to
  zápis, aby se na to nezapomnělo, když se hosting změní.

---

## 7. Rozhodnutí o vzhledu: čtyři červené

**Co se děje dnes:** světlé červené podbarvení pod tmavě červeným textem
dělá na webu sedm míst — termín dražby „dnes", zamítnutý inzerát, chyba
ve zprávách, slabý poměr v předloze — a jsou na to **čtyři různé
červené** (`#E4483D` 6×, `#B03A2E` 4×, `#C83C28` 2×, `#AE1E1E` 1×).
Změřeno v prohlížeči: všech sedm míst sedí na **bílé kartě**, takže se
ta čtveřice nepřizpůsobuje různým plochám — jsou to čtyři odpovědi na
tutéž otázku.

Čitelnost je v pořádku u všech variant (nejnižší hodnota 6,73 proti
požadavku 4,5), takže se rozhoduje **jen o vzhledu**:

| | co to udělá | nejhorší posun vzhledu |
|---|---|---|
| **A** | jedna červená, průhlednosti zůstanou | 5,56 — na jednom místě vidět |
| **B** | jedna červená a jedna dvojice průhlednosti (0,10 / 0,30) | 4,52 — na jednom místě vidět |
| **C** | dvě červené podle role: paletová pro soud o stavu, jasná pro tlak času | 2,97 — na hranici poznatelnosti |

(Posun je odchylka v OKLabu ×100; do 2 se na obrazovce nepozná.)

**Doporučení: C.** Ty dvě červené nedělají totéž — „Dražba dnes" tlačí
časem a chce být vidět, „Zamítnuto" je hotový soud a tlačit nemá. Čtyři
barvy jsou chyba, dvě jsou rozhodnutí. A je to jediná varianta, u které
se dnešní web prakticky nezmění.

Web se dá vydat i bez toho — je to kosmetika, ne vada.

---

## 8. Ověřit, že se CI spouští sama

**Co se stalo 22. 10.:** push na větev `claude/web-design-sketch-ewjjrr`
nevyrobil žádný běh — ani po 35 minutách. Běh musel být zařazen ručně
(Actions → *Testy a kontrola kódu* → **Run workflow**) a pak doběhl
zeleně za 38 minut. Totéž u commitu datového robota, ale tam to normální
být může: push udělaný přes `GITHUB_TOKEN` workflow záměrně nespouští.

**Proč to stojí za pohled:** když se CI nespustí, commit vypadá jako
nezkoušený a nikdo to nepozná — zelená nechybí, ona prostě není.

**Co zkontrolovat:** GitHub → Settings → Actions, jestli nedošly minuty
nebo se nezměnilo oprávnění; a jestli se to opakuje. Ruční spuštění
funguje vždy, workflow má `workflow_dispatch`.

---

## Co se naopak čekat nemusí

Tyhle věci jsou hotové a nic k nim není potřeba zapojovat: stahování
nabídek ze šesti zdrojů 4× denně, archiv nabídek (`docs/roadmap.md`),
stránky pozemků, hlídání v aplikaci, psaní v aplikaci, účty, offline
režim, kontrola fotek.
