-- =====================================================================
-- Parcelka — ZRUŠENÍ STARÉHO TOKENOVÉHO MODELU INZERÁTŮ
--
-- NÁLEZ (6. 11.). V databázi vedle sebe ležely DVA modely vlastnictví
-- inzerátu a ten starší z toho novějšího udělal díru:
--
--   1) listings-autopublish.sql (starší): inzerát patří tomu, kdo zná
--      tajný `token` ve sloupci `listings.token`. Na ten token jsou
--      navázané `my_listing(uuid,uuid)` a `delete_listing(uuid,uuid)`
--      a OBĚ jsou povolené roli `anon`, tedy webovému klíči, který má
--      v prohlížeči kdokoli (js/config.js).
--   2) listings-auth.sql (novější, ten platný): inzerát patří účtu
--      (`user_id` = auth.uid()). Mazat smí jen přihlášený vlastník
--      funkcí `delete_listing(uuid)` o JEDNOM parametru.
--
-- Celý ten starší model stál na tom, že token je tajný. Jenže pravidlo
-- „verejne cteni schvalenych" (supabase/schema.sql) pouští kdokoli
-- SELECT * na celou tabulku `listings`, a `*` zahrnuje i `token`. Tedy:
--   GET  /rest/v1/listings?select=id,token   → id i token každého inzerátu
--   POST /rest/v1/rpc/delete_listing {p_id, p_token}  → inzerát je smazaný
-- Dva dotazy veřejným klíčem a kdokoli smaže kterýkoli zveřejněný
-- inzerát. Nic z toho nebylo potřeba: web ani jedno z toho nevolá
-- (prohlížeč čte `public_listings()` a maže `delete_listing(p_id)`),
-- takže je to čistý přebytek po starém modelu.
--
-- A JEDEN KOMENTÁŘ TU DÍRU LEGALIZOVAL. V scripts/kontrola-databaze.mjs
-- stálo, že `my_listing` „je pro anon povolená schválně, chce k tomu
-- tajný token v parametru". To by platilo, kdyby token tajný byl.
-- Nebyl — ležel ve veřejném výpisu tabulky. Hlídač tedy díru viděl
-- a odůvodnil ji.
--
-- CO TENHLE SOUBOR DĚLÁ (pořadí v balíku: AŽ ZA listings-auth.sql):
--   1) bere `anon` i `authenticated` právo spustit obě tokenové funkce
--      a ruší je;
--   2) ruší veřejné čtení celé tabulky `listings` — veřejná data jdou
--      přes `public_listings()`, která vybírá sloupce jmenovitě a token
--      ani `user_id` nikdy nevydá (je `security definer`, takže jí RLS
--      nevadí);
--   3) maže sloupec `token` samotný, ať se na něj nedá navázat znovu.
--
-- Pustit jde opakovaně: všechno je „if exists".
-- =====================================================================

-- 1) Tokenové funkce pryč. Samotný `drop` bere i všechna práva, která
--    k nim byla přidělená — `revoke` před ním by byl jen šum (a navíc
--    by si ho hlídač oprávnění zapsal jako „tahle funkce tu má být,
--    jen zavřená", což by po jejím smazání hlásil jako chybějící).
--    Žádná náhrada se nezakládá: co tyhle dvě umějí, umí pod účtem
--    `my_listings()` a `delete_listing(uuid)` z listings-auth.sql.
drop function if exists my_listing(uuid,uuid);
drop function if exists delete_listing(uuid,uuid);

-- 2) Veřejné čtení celé tabulky pryč. Zůstává zapnuté RLS bez pravidla
--    pro select, takže nepřihlášenému vrátí dotaz na `listings`
--    prázdno (HTTP 200, `[]`) — ne řádky.
--
--    POZOR, ať se to nevrátí: pravidlo zakládá supabase/schema.sql
--    a ten je v balíku PRVNÍ. Tenhle soubor musí zůstat za ním.
drop policy if exists "verejne cteni schvalenych" on listings;

-- 3) A sloupec sám. Dokud existuje, může se na něj nová funkce navázat
--    a díra se otevře znovu. Žádná funkce v balíku ho už nečte:
--    create_listing (listings-prvni-kontrola.sql), public_listings
--    i my_listings vracejí sloupce jmenovitě a token mezi nimi není.
alter table listings drop column if exists token;
