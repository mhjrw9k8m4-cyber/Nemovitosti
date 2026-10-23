-- =====================================================================
-- Parcelka — STROP NA POČET FOTEK V ÚLOŽIŠTI
-- Spustit jednou: Supabase → SQL Editor → vložit → Run.
-- (Je to i součástí supabase/00-vse.sql, který stačí pustit celý.)
--
-- PROČ. Úložiště `listing-photos` mělo zavřené všechno kromě počtu:
--   • velikost souboru  → 3 MB (file_size_limit na bucketu),
--   • typ souboru       → jen image/jpeg (allowed_mime_types),
--   • cizí složka       → zápis jen pod vlastní `uid` (insert policy),
--   • fotek v inzerátu  → nejvýš 8 (create_listing).
-- Kolik souborů si ale přihlášený účet do své složky nahraje, nehlídalo
-- NIC. Nahrávání jde z prohlížeče přímo do úložiště, ještě než inzerát
-- vznikne, takže k tomu nebyl potřeba ani jeden inzerát: účet, který si
-- kdokoli založí na libovolnou adresu, mohl sypat 3MB JPEGy, dokud by
-- se nenaplnilo úložiště projektu — a platí ho vlastník.
--
-- STROP: 24 souborů na účet, a u placeného účtu 24 × povolený počet
-- inzerátů. Čtyřiadvacítka je trojnásobek toho, co jeden inzerát umí
-- ukázat (8 fotek) — tedy se dá fotky dvakrát přefotit a nahrát znovu,
-- než strop dojde. Free účet má tím pádem nejvýš 24 × 3 MB = 72 MB.
--
-- Počítá se podle složky, ne podle sloupce `owner`: složka je ta samá
-- podmínka, na které stojí i zápis, a `name like '<uid>/%'` se umí
-- opřít o index (bucket_id, name). `owner` navíc u souboru nahraného
-- service-role klíčem být nemusí.
--
-- MUSÍ BĚŽET AŽ ZA listings-tiers.sql: čte `my_limit()`, a ta vzniká
-- teprve tam. Proto je to samostatný soubor a ne řádek v
-- listings-photos.sql.
-- =====================================================================

drop policy if exists "listing photos auth upload" on storage.objects;
create policy "listing photos auth upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      select count(*) from storage.objects o
      where o.bucket_id = 'listing-photos'
        and o.name like auth.uid()::text || '/%'
    ) < 24 * greatest(public.my_limit(), 1)
  );

-- Kolik fotek mi ještě zbývá (pro hlášku na webu, ne pro bezpečnost).
create or replace function my_photo_space()
returns integer language sql security definer set search_path = public stable as $$
  select greatest(0, 24 * greatest(my_limit(), 1) - (
    select count(*)::integer from storage.objects o
    where o.bucket_id = 'listing-photos'
      and o.name like auth.uid()::text || '/%'
  ));
$$;
grant execute on function my_photo_space() to authenticated;

-- ---------------------------------------------------------------------
-- A TOTÉŽ JEDNÍM PŘÍKAZEM. Politika výš se ptá dotazem na tutéž tabulku,
-- do které se zapisuje — a ten dotaz NEVIDÍ řádky z téhož příkazu.
-- Naměřeno: `insert … select … from generate_series(1, 30)` projde celý,
-- strop nestrop. Z prohlížeče ta cesta nevede (úložiště přijímá jeden
-- soubor na jeden dotaz a schéma `storage` není přes PostgREST vidět),
-- ale spoléhat na to, co zvenčí „zatím nejde", je slabá pojistka.
-- Spouštěč se na každý řádek volá zvlášť, takže už vidí i ty předchozí.
--
-- Je obalený v `do`, protože na hostovaném Supabase nemusí mít `postgres`
-- vlastnictví storage.objects. Když spouštěč vzniknout nemůže, strop drží
-- dál politika (per dotaz) a majitel to uvidí jako poznámku, ne jako
-- zastavený skript.
-- ---------------------------------------------------------------------
create or replace function uloziste_strop_fotek()
returns trigger language plpgsql security definer set search_path = public as $$
declare slozka text; lim integer; kolik integer;
begin
  if new.bucket_id is distinct from 'listing-photos' then return new; end if;
  slozka := (storage.foldername(new.name))[1];
  if slozka is null then return new; end if;
  lim := 24 * greatest(coalesce((select max_listings from account_tier
    where user_id::text = slozka), 1), 1);
  select count(*) into kolik from storage.objects o
    where o.bucket_id = 'listing-photos' and o.name like slozka || '/%';
  if kolik >= lim then
    raise exception 'dosažen strop fotek na účet (%)', lim;
  end if;
  return new;
end $$;

do $do$ begin
  drop trigger if exists uloziste_strop_fotek on storage.objects;
  create trigger uloziste_strop_fotek before insert on storage.objects
    for each row execute function uloziste_strop_fotek();
exception when insufficient_privilege or undefined_table then
  raise notice 'Spouštěč stropu fotek se nevytvořil (%). Strop drží politika; viz supabase/uloziste-strop.sql.', sqlerrm;
end $do$;

-- ---------------------------------------------------------------------
-- OSIŘELÉ FOTKY. `delete_listing` maže jen řádek v `listings` — fotky
-- zůstanou v úložišti. Dokud strop nebyl, byla to jen pomalu rostoucí
-- faktura; se stropem je to past: účet se zasekne na 24 fotkách, které
-- už k ničemu nepatří, a sám je neuklidí.
--
-- Tahle funkce JEN VYPÍŠE, co je k zahození. Mazat musí volající přes
-- Storage API (scripts/uklid-databaze.mjs se service klíčem), protože
-- smazat řádek v `storage.objects` by soubor v úložišti nechal ležet
-- navždy — a ještě by ho schoval před každým dalším úklidem.
--
-- Mladší fotky se nedotýká: mezi nahráním a založením inzerátu je
-- chvíle, kdy na fotku ještě nic neodkazuje, a to je normální stav,
-- ne odpad. Výchozí lhůta je proto celý den.
--
-- Smí ji spustit JEN service_role — vypisuje jména souborů napříč
-- všemi účty.
-- ---------------------------------------------------------------------
create or replace function osirele_fotky(p_starsi_nez_hodin integer default 24,
                                         p_limit integer default 500)
returns table(name text)
language sql security definer set search_path = public stable as $$
  select o.name from storage.objects o
  where o.bucket_id = 'listing-photos'
    and o.created_at < now() - make_interval(hours => greatest(coalesce(p_starsi_nez_hodin, 24), 1))
    /* `strpos`, ne `like`: ve jménu souboru by `%` nebo `_` byly
       zástupné znaky a hledalo by se něco jiného, než co tam stojí.
       Dnešní jména je neobsahují (`<uid>/<čas>-<poradi>-<náhoda>.jpg`),
       ale jméno smí poslat i service klíč, a pak už to platit nemusí. */
    and not exists (
      select 1 from listings l where strpos(l.photos::text, o.name) > 0
    )
  order by o.created_at
  limit greatest(least(coalesce(p_limit, 500), 1000), 1);
$$;
-- VŠECHNY ROLE JMENOVITĚ. „from public" zní jako „ode všech", ale
-- PUBLIC je pseudorole: neodebere právo, které má role udělené PŘÍMO,
-- a Supabase ho anonovi i přihlášenému na funkce ve schématu public
-- rovnou dává. Hlídá to scripts/test-kontrola-databaze.mjs.
revoke all on function osirele_fotky(integer, integer) from public, anon, authenticated;
grant execute on function osirele_fotky(integer, integer) to service_role;
