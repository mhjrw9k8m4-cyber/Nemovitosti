# Co musí zapojit majitel webu

Všechno ostatní je hotové v kódu a otestované. Tohle jsou věci, které
za majitele nikdo udělat nemůže — jsou to účty, klíče a peníze.

Řazeno podle toho, co nejvíc chybí lidem, kteří web používají dnes.

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

`supabase/00-vse.sql` je jeden spustitelný soubor (2 334 řádků,
56 funkcí, 16 politik RLS) složený ze všech dílčích migrací.
Pustit v Supabase → SQL Editor.

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

---

## Co se naopak čekat nemusí

Tyhle věci jsou hotové a nic k nim není potřeba zapojovat: stahování
nabídek ze šesti zdrojů 4× denně, archiv nabídek (`docs/roadmap.md`),
stránky pozemků, hlídání v aplikaci, psaní v aplikaci, účty, offline
režim, kontrola fotek.
