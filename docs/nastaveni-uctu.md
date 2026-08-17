# Nastavení účtů — krok za krokem (pro majitele)

Tohle je jediná část, kterou musíte udělat vy (jsou to účty na vaše jméno).
Všechny mají verzi zdarma. Až budete mít přihlašovací údaje, pošlete mi je
bezpečně (ne do veřejného chatu / repozitáře) a já web propojím.

> Pořadí nespěchá. Klidně po jednom. Nic se nerozbije — web mezitím běží dál.

## 1. Stripe (platby) — asi 15 minut

1. Jděte na **stripe.com** → „Start now" / „Sign in" → založte účet e-mailem.
2. Zemi nastavte **Česká republika**, měnu **CZK**.
3. Zatím zůstaňte v **testovacím režimu** (přepínač „Test mode" vpravo nahoře) —
   v něm můžeme vše vyzkoušet bez skutečných peněz.
4. V menu **Developers → API keys** najdete dva klíče:
   - `Publishable key` (začíná `pk_test_…`)
   - `Secret key` (začíná `sk_test_…`) — tenhle je tajný, nikam ho nedávejte veřejně
5. Ostrý režim (skutečné peníze) se zapne, až budete mít **IČO** a vyplníte
   ve Stripe firemní údaje. Do té doby stavíme v testu.

## 2. Vercel (kde web poběží) — asi 10 minut

1. Jděte na **vercel.com** → „Sign up" → přihlaste se přes **GitHub**.
2. „Add New… → Project" → vyberte repozitář **Nemovitosti**.
3. Nechte výchozí nastavení, dejte **Deploy**. Za chvíli poběží na adrese
   `…vercel.app`. (github.io adresa zůstává funkční souběžně.)
4. Tajné klíče se sem budou vkládat v **Settings → Environment Variables**
   (provedu vás, až budeme mít klíče).

## 3. Supabase (databáze) — asi 10 minut

1. Jděte na **supabase.com** → „Start your project" → přihlaste se přes GitHub.
2. „New project", zvolte region **Frankfurt (EU)** (blízko, kvůli rychlosti i GDPR).
3. Heslo k databázi si uložte.
4. Z **Project Settings → API** budu potřebovat `Project URL` a klíče
   (`anon` a `service_role`).

## 4. Resend (odesílání e-mailů) — asi 10 minut

1. Jděte na **resend.com** → „Get started" → účet.
2. Later: přidáme vaši doménu, ať e-maily chodí z `něco@vasedomena.cz`
   (lepší doručitelnost). Do té doby jde posílat z testovací adresy.
3. Z **API Keys** vytvořte klíč (`re_…`).

## 5. Doména (nepovinné hned) — asi 15 minut

- Doporučené registrátory v ČR: **Wedos, Forpsi, Cloudflare**.
- Cena okolo **150–300 Kč/rok**.
- Až ji budete mít, napojíme ji na Vercel (nasměrování je pár kliknutí).

---

### Jak mi klíče předat bezpečně

- **Nedávejte** klíče do chatu ani do souborů v repozitáři.
- Nejlepší: vložte je rovnou do **Vercel → Environment Variables** sami (názvy
  proměnných vám dám přesně), nebo mi je pošlete přes jednorázový bezpečný odkaz
  (např. **onetimesecret.com**).

Seznam proměnných, které budeme plnit, je v `.env.example`.
