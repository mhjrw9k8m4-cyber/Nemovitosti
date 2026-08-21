# Zapnutí automatických upozornění na lokalitu (e-mail)

Robot pošle e-mailem nové příležitosti lidem, kteří si nechali hlídat okres.
Kód je hotový a je **záměrně opatrný**: dokud ho sám nezapneš, běží ve
**zkušebním režimu** — jen si do logu vypíše, co by poslal, ale **nic neodešle**.

Postupuj v tomto pořadí. Klidně to dáme spolu krok za krokem.

## 1) Spustit SQL (Supabase) — ~2 min
- Supabase → **SQL Editor** → New query.
- Vlož celý obsah **`supabase/watch-alerts.sql`** → **Run** (Success).
- Tím vzniknou funkce pro potvrzení/odhlášení hlídání a evidence už
  rozeslaných příležitostí.

## 2) Účet Resend (posílání e-mailů) — zdarma
- Založ účet na **resend.com** (zdarma do 3 000 e-mailů/měsíc).
- **API klíč:** Resend → API Keys → Create → zkopíruj (začíná `re_...`).
- **Odesílatel:**
  - **Na start (test):** nech výchozí `onboarding@resend.dev`. Pozor —
    v testu Resend doručí jen na **tvůj vlastní** e-mail (kterým ses registroval).
    To stačí na vyzkoušení celého toku.
  - **Naostro:** přidej v Resendu doménu **parcelaka.cz** a nastav pár DNS
    záznamů (Resend je přesně vypíše). Pak můžeš posílat komukoli z adresy
    `upozorneni@parcelaka.cz`. Tohle klidně necháme na později.

## 3) Klíče do GitHubu — ~3 min
GitHub → repo → **Settings → Secrets and variables → Actions**.

**Secrets** (tajné, klikni „New repository secret"):
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API →
  **service_role** klíč (dlouhý, tajný — nikam ho nedávej veřejně).
- `RESEND_API_KEY` — ten `re_...` z Resendu.

**Variables** (záložka Variables, nejsou tajné):
- `ALERT_FROM` = `Parcelka <onboarding@resend.dev>` (nebo tvoje doména, až ji ověříš)
- `SITE_URL` = `https://parcelaka.cz`
- `SUPABASE_URL` = `https://tcinuzftgmkvjjgvadky.supabase.co`
- `ALERTS_LIVE` — zatím **nenastavuj** (necháme zkušební režim).

## 4) Vyzkoušet nasucho (nic se neodešle)
- GitHub → **Actions** → „Rozesílání upozornění na lokalitu" → **Run workflow**.
- V logu uvidíš, kolik je přihlášek a co by robot poslal (řádky `[dry-run]`).
- **První běh** si jen zapamatuje současné příležitosti a nic nepošle — to je
  správně (pojistka, ať nikoho nezavalí starý seznam).

## 5) Zapnout naostro — až budeš spokojený
- Přidej **Variable** `ALERTS_LIVE` = `1`.
- Od teď robot posílá doopravdy: nepotvrzeným pošle **potvrzovací** e-mail
  (musí kliknout — tak to vyžaduje zákon), potvrzeným pak **nové příležitosti**
  v jejich okrese. Každý má v e-mailu odkaz na **odhlášení**.
- Robot běží automaticky každých 6 hodin (30 min po aktualizaci dat).

## Kdyby něco
Vypnout jde kdykoli: smaž Variable `ALERTS_LIVE` (zpět do zkušebního režimu),
nebo v Actions workflow zakaž. Nic se nerozbije.
