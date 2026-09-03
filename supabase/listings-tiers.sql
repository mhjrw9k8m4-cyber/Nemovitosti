-- =====================================================================
-- Parcelka — ÚROVNĚ ÚČTU (free vs. placený limit inzerátů)
-- Spustit jednou: Supabase → SQL Editor → vložit → Run.
--
-- Model:
--   • FREE (výchozí) = 1 inzerát na účet.
--   • PLACENÝ        = až 20 inzerátů (účet je v tabulce account_tier).
--
-- Bezpečné: běžný uživatel si úroveň NEMŮŽE sám nastavit (žádná RLS policy),
-- placený účet přidává majitel v Supabase (Table Editor) nebo přes service role.
-- Online placení (karta) = samostatný krok (platební brána) — tohle je logika limitu.
-- =====================================================================

create table if not exists account_tier (
  user_id      uuid primary key,
  max_listings integer not null default 20,
  granted_at   timestamptz not null default now(),
  note         text                      -- např. „zaplaceno 20.3.2026, faktura 2026-014"
);
alter table account_tier enable row level security;
-- ZÁMĚRNĚ žádná policy → přes anon/authenticated klíč nejde číst ani zapisovat.
-- Řídí to jen majitel (service role / Table Editor). create_listing níže čte
-- tabulku jako security definer, takže limit funguje i bez policy.

-- Kolik inzerátů smí přihlášený uživatel (placený tier, jinak 1).
create or replace function my_limit()
returns integer language sql security definer set search_path = public stable as $$
  select coalesce((select max_listings from account_tier where user_id = auth.uid()), 1);
$$;
grant execute on function my_limit() to authenticated;

-- create_listing s odstupňovaným limitem (free 1 / placený až 20).
-- Vše ostatní (moderace textu, fotky jen z našeho úložiště, whitelist sítí/přístupu,
-- cooldown 90 s) zůstává jako v listings-moderation.sql.
create or replace function create_listing(
  p_place text, p_okres text, p_druh text, p_parcel text,
  p_area integer, p_price integer, p_lat double precision, p_lng double precision,
  p_description text, p_contact text, p_photos jsonb default '[]'::jsonb,
  p_features text[] default '{}', p_access text default null)
returns table(id uuid)
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  uid uuid := auth.uid();
  lim integer;
  clean_photos jsonb := '[]'::jsonb;
  clean_features text[] := '{}';
  clean_access text;
  ph text;
  ft text;
  ok_prefix text;
  blob text;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if p_place is null or length(trim(p_place))=0 then raise exception 'obec je povinná'; end if;
  if p_lat is null or p_lng is null then raise exception 'poloha je povinná'; end if;

  -- Moderace obsahu (nejde obejít z prohlížeče)
  blob := lower(coalesce(p_place,'') || ' ' || coalesce(p_description,'') || ' ' || coalesce(p_parcel,''));
  if blob ~ '(kokot|kurv|piča|píčovin|picovin|\mmrd|debil|čur[aá]k|čůr|zmrd|\mjeb|hovn|hajzl|zkur|prdel|hovado|\midiot|blb[eě]c|porno|penis|vagin)' then
    raise exception 'obsah obsahuje nevhodná slova';
  end if;
  if blob ~ '(viagra|casino|kasino|bitcoin|\mcrypto|klikni zde|výhr[aou]|vyhr[aou]j)' then
    raise exception 'obsah vypadá jako spam';
  end if;
  if blob ~ '(.)\1{6,}' then
    raise exception 'obsah vypadá jako spam';
  end if;

  -- Limit dle úrovně účtu: placený tier, jinak 1 (free)
  lim := coalesce((select max_listings from account_tier where user_id = uid), 1);
  if (select count(*) from listings where user_id = uid) >= lim then
    raise exception 'dosažen limit inzerátů na účet (limit %)', lim;
  end if;
  -- Cooldown: další inzerát nejdřív za 90 sekund
  if exists (select 1 from listings where user_id = uid and created_at > now() - interval '90 seconds') then
    raise exception 'chvíli počkejte před přidáním dalšího inzerátu';
  end if;

  -- Fotky: jen odkazy do našeho úložiště (max 8)
  if p_photos is not null and jsonb_typeof(p_photos) = 'array' then
    for ph in select value::text from jsonb_array_elements_text(p_photos) loop
      ok_prefix := '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/listing-photos/';
      if ph ~ ok_prefix and length(ph) < 500 then
        clean_photos := clean_photos || to_jsonb(ph);
      end if;
      exit when jsonb_array_length(clean_photos) >= 8;
    end loop;
  end if;

  -- Vybavení: jen povolené hodnoty
  if p_features is not null then
    foreach ft in array p_features loop
      if ft in ('Elektřina','Voda','Kanalizace','Plyn','Oplocení')
         and not (clean_features @> array[ft]) then
        clean_features := clean_features || ft;
      end if;
    end loop;
  end if;
  if p_access in ('Zpevněná cesta','Polní / nezpevněná cesta','Přes cizí pozemek','Bez přístupu') then
    clean_access := p_access;
  end if;

  insert into listings(status,user_id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,photos,features,access,featured,views)
  values('approved',uid,trim(p_place),nullif(trim(coalesce(p_okres,'')),''),nullif(trim(coalesce(p_druh,'')),''),
         nullif(trim(coalesce(p_parcel,'')),''),p_area,p_price,p_lat,p_lng,
         nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_contact,'')),''),
         clean_photos,clean_features,clean_access,false,0)
  returning listings.id into new_id;
  return query select new_id;
end; $$;
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb,text[],text) to authenticated;

-- Kvóta pro web: kolik mám a kolik smím (1 free / až 20 placený).
create or replace function my_listing_quota()
returns table(used integer, max integer)
language sql security definer set search_path = public as $$
  select (select count(*)::integer from listings where user_id = auth.uid()),
         coalesce((select max_listings from account_tier where user_id = auth.uid()), 1);
$$;
grant execute on function my_listing_quota() to authenticated;

-- =====================================================================
-- JAK ZAPNOUT PLACENÝ ÚČET (dokud nemáme platební bránu):
-- V Supabase → SQL Editor spusť (nahraď e-mail za e-mail zákazníka):
--
--   insert into account_tier (user_id, max_listings, note)
--   select id, 20, 'zaplaceno' from auth.users where email = 'zakaznik@email.cz'
--   on conflict (user_id) do update set max_listings = 20, note = 'zaplaceno';
--
-- Zpět na free: delete from account_tier where user_id =
--   (select id from auth.users where email = 'zakaznik@email.cz');
-- =====================================================================
