# Hlídání a přidávání inzerátů — co spravit a v jakém pořadí

Hlídání lokality, přidávání inzerátů i zprávy visí na dvou společných věcech:
na **databázi (Supabase)** a na **odesílání e-mailů (Resend)**. Když přestanou
fungovat naráz, skoro vždy za to může jedna z nich — ne kód stránky.

Tenhle postup je seřazený tak, aby každý krok šel hned ověřit.

---

## 1. Srovnat databázi (5 minut)

**Problém:** funkce `create_listing` vznikala postupně a v repozitáři je jí
sedm verzí s různým počtem parametrů. Web volá tu poslední — se třinácti
(fotky, vybavení, přístup). Když v databázi běží starší, PostgREST žádnou
takovou funkci nenajde, vrátí **404** a přidání inzerátu skončí chybou.

**Řešení:** je připravený jeden soubor, který uvede databázi do stavu, jaký
web očekává — včetně úklidu zastaralých podob funkce.

1. Otevři **Supabase → svůj projekt → SQL Editor → New query**
2. Zkopíruj **celý** obsah souboru `supabase/00-vse.sql`
3. Vlož a dej **Run**

Jde to pustit i opakovaně — tabulky se zakládají přes `if not exists`,
politiky se před vytvořením ruší a funkce se přepisují.

> Soubor `00-vse.sql` se needituje ručně. Když upravíš některý dílčí skript
> v `supabase/`, spusť `node scripts/build-sql.mjs` a přegeneruje se.

**Ověření:** otevři na webu **`/diagnostika.html`**. Řádky „Přidání inzerátu:
funkce odpovídá správně" a „Hlídání: funkce subscribe_watch odpovídá" musí být
zelené.

---

## 2. Rozchodit odesílání e-mailů (Resend)

**Problém:** v logu úlohy „Rozesílání upozornění" stojí:

```
Aktivních přihlášek: 2
  Resend selhal pro ... → 403 validation_error
  "You can only send testing emails to your own email address"
Upozorňovacích e-mailů: 0
```

Resend bez ověřené domény je v **testovacím režimu** — pošle jedině na adresu
majitele účtu. Databáze i hledání nových nabídek přitom fungují; padá až
samotné odeslání.

1. **Resend → Domains → Add domain** → zadej doménu webu (např. `parcelaka.cz`)
2. Resend vypíše DNS záznamy (**SPF** a **DKIM**) — vlož je u registrátora domény
3. Počkej, až se stav překlopí na **Verified** (obvykle do hodiny)
4. **GitHub → Settings → Secrets and variables → Actions** doplň:
   - `ALERT_FROM` = `Parcelka <upozorneni@tvojedomena.cz>` (adresa z ověřené domény)
   - `SITE_URL` = `https://tvojedomena.cz` (kvůli odkazům na odhlášení)
   - `SUPABASE_URL` = adresa projektu (dnes je prázdné a skript si pomáhá zálohou)

**Ověření:** GitHub → Actions → „Rozesílání upozornění" → **Run workflow**.
V logu musí být `Upozorňovacích e-mailů:` větší než nula a žádné „Resend selhal".

> Od teď úloha při neodeslaném e-mailu **spadne** (červeně) místo aby tiše
> skončila zeleně. Dřív vypadalo všechno v pořádku, i když nikomu nic nepřišlo.

---

## 3. Potvrzovací e-maily u registrace

**Problém:** kdo si chce přidat inzerát, musí mít účet. Registrace jde přes
Supabase a ten při zapnutém *Confirm email* pošle potvrzení **svým vlastním**
mailerem — ten má na volném plánu limit jednotek e-mailů za hodinu a často
končí ve spamu. Bez potvrzení se člověk nepřihlásí a inzerát nepřidá.

Na `/diagnostika.html` to pozná podle řádku „Účet čeká na potvrzovací e-mail".

Dvě možnosti:

- **Rychlá:** Supabase → Authentication → Providers → Email → **Confirm email = OFF**.
  Účet je hned použitelný. Nevýhoda: nikdo neověří, že adresa opravdu existuje.
- **Správná:** Supabase → Project Settings → Authentication → **SMTP Settings** →
  nastavit vlastní SMTP (klidně přes Resend — hostitel `smtp.resend.com`, port 465,
  uživatel `resend`, heslo = API klíč). Vyžaduje hotový krok 2.

---

## Co se změnilo v kódu (už je hotové)

| Změna | Proč |
|---|---|
| `supabase/00-vse.sql` + `scripts/build-sql.mjs` | jeden spustitelný soubor místo dohadování, které z dvanácti skriptů už v databázi běží |
| `scripts/send-alerts.mjs` | **soubor v repozitáři není** — tahle řádka popisuje stav, který nenastal; e-maily se dnes neposílají |
| `js/pridat.js` | když databáze nezná aktuální funkci, uživatel se to dozví — dřív viděl jen „nepovedlo se" |
| `diagnostika.html` | ověří podpisy funkcí, které web volá, a nastavení přihlašování |

## Co zůstává na později

Formulář „přidat inzerát" pro **nepřihlášené** ukládá text do tabulky
`messages` (jako zprávu), ne mezi inzeráty — na mapě se sám neobjeví.
Přihlášený uživatel jde správnou cestou přes `create_listing`. Sjednotit to
je práce navíc, ne porucha.
