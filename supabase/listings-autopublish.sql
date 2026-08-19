-- =====================================================================
-- Parcelka — SAMOOBSLUHA INZERÁTŮ (automatické zveřejnění na mapě)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- Model (jako Bazoš): uživatel vloží inzerát → HNED je na mapě jako
-- „Od majitele". Dostane tajný token → přes něj vidí svůj inzerát,
-- počet zhlédnutí a může ho smazat. Bez přihlašování.
--
-- Bezpečnost: přístup jde JEN přes funkce (RPC) níže. Token se vrací
-- jen tomu, kdo inzerát vytvořil; veřejný seznam token ani e-mail
-- neprozradí.
-- =====================================================================

-- Rozšíření tabulky listings (tabulka už existuje ze schema.sql)
alter table listings add column if not exists token uuid not null default gen_random_uuid();
alter table listings add column if not exists views integer not null default 0;

-- RLS zapnuté, ŽÁDNÉ přímé policy pro anon — vše přes funkce (security definer)
alter table listings enable row level security;

-- 1) Vytvoření inzerátu → vrátí id + token (token = klíč pro majitele)
create or replace function create_listing(
  p_place text, p_okres text, p_druh text, p_parcel text,
  p_area integer, p_price integer,
  p_lat double precision, p_lng double precision,
  p_description text, p_contact text
) returns table(id uuid, token uuid)
language plpgsql security definer set search_path = public as $$
declare new_id uuid; new_token uuid;
begin
  -- základní pojistky
  if p_place is null or length(trim(p_place)) = 0 then
    raise exception 'obec je povinná';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'poloha je povinná';
  end if;

  insert into listings(status, place, okres, druh, parcel, area, price, lat, lng,
                       description, contact_phone, featured, views)
  values('approved', trim(p_place), nullif(trim(coalesce(p_okres,'')),''),
         nullif(trim(coalesce(p_druh,'')),''), nullif(trim(coalesce(p_parcel,'')),''),
         p_area, p_price, p_lat, p_lng,
         nullif(trim(coalesce(p_description,'')),''), nullif(trim(coalesce(p_contact,'')),''),
         false, 0)
  returning listings.id, listings.token into new_id, new_token;

  return query select new_id, new_token;
end; $$;

-- 2) Veřejný seznam pro mapu (BEZ tokenu — token se nikdy neprozradí)
create or replace function public_listings()
returns table(id uuid, place text, okres text, druh text, parcel text,
              area integer, price integer, lat double precision, lng double precision,
              description text, contact text, views integer, created_at timestamptz)
language sql security definer set search_path = public as $$
  select id, place, okres, druh, parcel, area, price, lat, lng,
         description, contact_phone, views, created_at
  from listings
  where status = 'approved'
  order by created_at desc;
$$;

-- 3) Můj inzerát podle tokenu (majitel vidí stav + zhlédnutí)
create or replace function my_listing(p_id uuid, p_token uuid)
returns table(id uuid, place text, okres text, area integer, price integer,
              views integer, status text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select id, place, okres, area, price, views, status, created_at
  from listings
  where id = p_id and token = p_token;
$$;

-- 4) Smazání vlastního inzerátu (jen se správným tokenem)
create or replace function delete_listing(p_id uuid, p_token uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from listings where id = p_id and token = p_token;
  get diagnostics n = row_count;
  return n > 0;
end; $$;

-- 5) Započítání zhlédnutí (když někdo otevře detail)
create or replace function bump_view(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update listings set views = views + 1 where id = p_id and status = 'approved';
end; $$;

-- Povolit anonymnímu (webovému) klíči volat tyto funkce
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text) to anon;
grant execute on function public_listings() to anon;
grant execute on function my_listing(uuid,uuid) to anon;
grant execute on function delete_listing(uuid,uuid) to anon;
grant execute on function bump_view(uuid) to anon;
