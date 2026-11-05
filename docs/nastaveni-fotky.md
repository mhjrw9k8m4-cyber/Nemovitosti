# Zapnutí fotek u inzerátů — co udělat v Supabase (jednou, ~3 minuty)

Kód je hotový. Aby fotky začaly fungovat naživo, stačí jednou spustit
připravený SQL — ten sám založí úložiště fotek i bezpečnostní pravidla.

## Krok za krokem

1. Otevři **Supabase** → svůj projekt → vlevo **SQL Editor** → **New query**.
2. Otevři v repu soubor **`supabase/00-vse.sql`**, zkopíruj **celý obsah**
   a vlož ho do editoru.
3. Klikni **Run** (vpravo dole). Mělo by to skončit „Success".

> **Proč celý balík, a ne jen `supabase/listings-photos.sql`.** Dřív tu
> stál ten jeden soubor a byla to rada na půl práce. `00-vse.sql` ho
> obsahuje celý a kromě kbelíku spraví i `zapis_chybu()` — tedy **dvě ze
> tří věcí**, které živé databázi podle měření z 24. 10. chybí
> (`docs/pro-majitele.md`, oddíl 5). Samotný `listings-photos.sql` navíc
> začíná `alter table listings`, takže na prázdném projektu, kde ta
> tabulka ještě není, padne. Balík jde pustit celý a **opakovaně**:
> kbelík má `on conflict do update`, sloupce `if not exists` a pravidla
> `drop policy if exists`, takže druhé spuštění nic nerozbije.
>
> **Kbelík v Supabase nezakládej ručně.** Balík ho zakládá sám, i se
> stropem 3 MB na soubor a jen typem JPEG; ruční kbelík bývá bez stropů,
> a to je horší než žádný.

Tím se:
- založí veřejné úložiště **`listing-photos`** (fotky pozemků),
- nastaví bezpečnost: nahrávat smí **jen přihlášený**, číst může kdokoli,
  mazat jen ten, kdo fotku nahrál,
- rozšíří ukládání inzerátu tak, aby k němu patřily i fotky (max 8).

## Jak to pak funguje

- Ve formuláři **Přidat pozemek** uživatel klepne na „Přidat fotky", vybere je
  z mobilu (klidně několik naráz).
- Fotky se **před odesláním v prohlížeči zmenší** (max 1600 px) a překódují na
  JPEG — menší data a **odstraní se skrytá EXIF/GPS poloha** (soukromí).
- Po odeslání se fotka objeví **přímo v inzerátu** i jako náhled karty na mapě.

## Automatická kontrola (co dělá a co ne — poctivě)

- **Dělá:** přijme jen skutečné obrázky, jen od přihlášeného, jen odkazy do
  našeho úložiště (nejde podstrčit cizí adresu), omezí počet i velikost.
- **Nedělá:** neposuzuje *obsah* fotky (že na ní opravdu je pozemek). Na to by
  byla potřeba placená služba na rozpoznávání obrazu. Zatím platí stejné
  pravidlo jako u textu: závadnou fotku jde **nahlásit a smažeme ji**.
