# Zapnutí fotek u inzerátů — co udělat v Supabase (jednou, ~3 minuty)

Kód je hotový. Aby fotky začaly fungovat naživo, stačí jednou spustit
připravený SQL — ten sám založí úložiště fotek i bezpečnostní pravidla.

## Krok za krokem

1. Otevři **Supabase** → svůj projekt → vlevo **SQL Editor** → **New query**.
2. Otevři v repu soubor **`supabase/listings-photos.sql`**, zkopíruj **celý obsah**
   a vlož ho do editoru.
3. Klikni **Run** (vpravo dole). Mělo by to skončit „Success".

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
