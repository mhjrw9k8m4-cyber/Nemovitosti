# Pozemkomat — plán plné (automatické) verze

Cíl: web, který **sám** publikuje inzeráty, **sám** posílá upozornění na lokalitu
a **sám** přijímá platby za zvýraznění (299 Kč). Bez ručního zásahu u běžného provozu.

## Stack (co na čem poběží)

| Vrstva | Nástroj | Proč | Cena |
|---|---|---|---|
| Web (to, co je vidět) | zůstává, jen se přesune na **Vercel** | auto-nasazení z GitHubu, jedno místo pro web i server | zdarma (Hobby) |
| Server na pozadí | **Vercel Functions** (Node) | platby, publikace, odesílání | zdarma do slušného provozu |
| Databáze | **Supabase** (Postgres) | inzeráty, přihlášky na hlídání, platby | zdarma do 500 MB |
| Platby | **Stripe** | karty + Apple/Google Pay, rychlý start | ~1,4 % + 6 Kč z platby |
| E-maily | **Resend** | potvrzení, upozornění na lokalitu | zdarma do 3000 e-mailů/měs. |
| Data příležitostí | **GitHub Action** (už běží) | denní stahování z veřejných zdrojů | zdarma |

Odhad nákladů do rozjezdu: **doména ~300 Kč/rok**, zbytek zdarma dokud není velký
provoz. Platební poplatky platíte, jen když někdo zaplatí. „Pár tisíc" pokryje
klidně první rok.

## Fáze (v tomto pořadí — každá je funkční celek)

- [ ] **Fáze 0 — Účty a základ** *(zařizuje majitel, provedu krok za krokem)*
  - Založit: Vercel, Supabase, Stripe (test režim stačí hned), Resend, doména
  - Propojit klíče (do Vercelu jako proměnné prostředí)

- [ ] **Fáze 1 — Databáze + přesun na Vercel**
  - Tabulky: `listings` (inzeráty), `watch_subscriptions` (hlídání), `payments`
  - Web se načítá z Vercelu, mapa čte publikované inzeráty z databáze

- [ ] **Fáze 2 — Inzeráty automaticky**
  - „Přidat pozemek" ukládá do databáze (stav: *čeká na kontrolu*)
  - Jednoduchá schvalovací stránka pro majitele → po schválení je inzerát hned na mapě

- [ ] **Fáze 3 — Platby (Stripe) za zvýraznění** ← *výdělek*
  - Tlačítko „Zvýraznit za 299 Kč" → Stripe Checkout → po zaplacení web **sám**
    nastaví inzerátu `featured` a pošle potvrzení
  - (Kód je připravený v `/api`, čeká na klíče a IČO pro ostrý režim)

- [ ] **Fáze 4 — Automatické hlídání lokality**
  - Denní robot porovná nové příležitosti s přihláškami a **sám** rozešle e-maily
  - Odhlášení jedním klikem (zákon vyžaduje)

- [ ] **Fáze 5 — Účty uživatelů** *(volitelné)*
  - Uložené pozemky napříč zařízeními (přihlášení e-mailem)

## Co musí zařídit majitel (nejde to za něj)

1. **IČO / živnostenský list** — nutné pro legální příjem a danění plateb *(zařizuje se)*
2. **Účty** u Vercel, Supabase, Stripe, Resend (vše zdarma, self-service)
3. **Doména** (nepovinné hned)
4. **Kontrola inzerátů** — schválit/zamítnout, ať se na web nedostane spam
   (web to slibuje: „po naší kontrole")

## Co dělám já

Veškerý kód: databázi, serverové funkce, platební tok, rozesílání upozornění,
napojení webu. Postupně, po fázích, a vždy ověřím, že to funguje.
