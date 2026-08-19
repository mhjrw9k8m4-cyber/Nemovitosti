-- =====================================================================
-- Parcelka — INZERÁTY S PŘIHLÁŠENÍM (ochrana proti spamu)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
-- Nahrazuje předchozí token model — inzeráty jsou nově vázané na účet
-- (auth.users). Přidat/smazat smí jen přihlášený vlastník.
--
-- DŮLEŽITÉ nastavení Supabase (jednou):
--   Authentication → Sign In / Providers → Email → povolené,
--   a pro hladký start klidně VYPNOUT „Confirm email" (Authentication →
--   Providers → Email → Confirm email = OFF). Pak se lidé přihlásí hned.
-- =====================================================================

alter table listings add column if not exists user_id uuid;
alter table listings add column if not exists token uuid;   -- ponecháno kvůli starým datům
alter table listings add column if not exists views integer not null default 0;
alter table listings enable row level security;

-- Vytvoření inzerátu — POUZE pro přihlášeného (auth.uid()); přiřadí se mu.
create or replace function create_listing(
  p_place text, p_okres text, p_druh text, p_parcel text,
  p_area integer, p_price integer, p_lat double precision, p_lng double precision,
  p_description text, p_contact text)
returns table(id uuid)
language plpgsql security definer set search_path = public as $$
declare new_id uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if p_place is null or length(trim(p_place))=0 then raise exception 'obec je povinná'; end if;
  if p_lat is null or p_lng is null then raise exception 'poloha je povinná'; end if;
  -- Serverová ochrana: filtr nevhodných slov (nejde obejít z prohlížeče)
  if (coalesce(p_place,'') || ' ' || coalesce(p_description,'') || ' ' || coalesce(p_parcel,''))
       ~* '(kokot|kurv|piča|\mmrd|debil|čur[aá]k|zmrd|\mjeb|hovn)' then
    raise exception 'obsah obsahuje nevhodná slova';
  end if;
  -- Limit proti spamu: max 30 inzerátů na účet
  if (select count(*) from listings where user_id = uid) >= 30 then
    raise exception 'dosažen limit inzerátů na účet (30)';
  end if;
  insert into listings(status,user_id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,featured,views)
  values('approved',uid,trim(p_place),nullif(trim(coalesce(p_okres,'')),''),nullif(trim(coalesce(p_druh,'')),''),
         nullif(trim(coalesce(p_parcel,'')),''),p_area,p_price,p_lat,p_lng,
         nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_contact,'')),''),false,0)
  returning listings.id into new_id;
  return query select new_id;
end; $$;

-- Veřejný seznam pro mapu (beze změny — bez osobních klíčů)
create or replace function public_listings()
returns table(id uuid,place text,okres text,druh text,parcel text,area integer,price integer,
              lat double precision,lng double precision,description text,contact text,views integer,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,views,created_at
  from listings where status='approved' order by created_at desc; $$;

-- Moje inzeráty (všechny, které patří přihlášenému uživateli)
create or replace function my_listings()
returns table(id uuid,place text,okres text,area integer,price integer,views integer,status text,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,area,price,views,status,created_at
  from listings where user_id = auth.uid() order by created_at desc; $$;

-- Smazání vlastního inzerátu (jen vlastník)
create or replace function delete_listing(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int; begin
  delete from listings where id=p_id and user_id=auth.uid();
  get diagnostics n=row_count; return n>0; end; $$;

-- Započítání zhlédnutí
create or replace function bump_view(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin update listings set views=views+1 where id=p_id and status='approved'; end; $$;

-- Oprávnění: veřejné čtení pro anon, vytváření/správa pro přihlášené
grant execute on function public_listings() to anon, authenticated;
grant execute on function bump_view(uuid) to anon, authenticated;
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text) to authenticated;
grant execute on function my_listings() to authenticated;
grant execute on function delete_listing(uuid) to authenticated;
