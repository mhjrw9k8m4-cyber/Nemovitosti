-- =====================================================================
-- Parcelka — VYBAVENÍ POZEMKU (sítě, oplocení, přístup) v inzerátu
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- Přidá k inzerátu údaje, které kupující řeší jako první:
--   features = pole (Elektřina, Voda, Kanalizace, Plyn, Oplocení)
--   access   = přístup k pozemku (zpevněná cesta, polní cesta…)
-- create_listing je začne ukládat (jen povolené hodnoty — bez smyšlenin),
-- public_listings/my_listings je začnou vracet, aby se zobrazily na webu.
-- =====================================================================

alter table listings add column if not exists features text[] default '{}';
alter table listings add column if not exists access text;

-- Měníme signaturu / návratový typ → nejdřív zahodit staré verze
drop function if exists create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb);
drop function if exists public_listings();
drop function if exists my_listings();

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
  clean_photos jsonb := '[]'::jsonb;
  clean_features text[] := '{}';
  clean_access text;
  ph text;
  ft text;
  ok_prefix text;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if p_place is null or length(trim(p_place))=0 then raise exception 'obec je povinná'; end if;
  if p_lat is null or p_lng is null then raise exception 'poloha je povinná'; end if;
  if (coalesce(p_place,'') || ' ' || coalesce(p_description,'') || ' ' || coalesce(p_parcel,''))
       ~* '(kokot|kurv|piča|\mmrd|debil|čur[aá]k|zmrd|\mjeb|hovn)' then
    raise exception 'obsah obsahuje nevhodná slova';
  end if;
  if (select count(*) from listings where user_id = uid) >= 30 then
    raise exception 'dosažen limit inzerátů na účet (30)';
  end if;
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

  -- Vybavení: přijmi jen povolené hodnoty (žádné smyšleniny)
  if p_features is not null then
    foreach ft in array p_features loop
      if ft in ('Elektřina','Voda','Kanalizace','Plyn','Oplocení')
         and not (clean_features @> array[ft]) then
        clean_features := clean_features || ft;
      end if;
    end loop;
  end if;
  -- Přístup: jen povolené hodnoty
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

create or replace function public_listings()
returns table(id uuid,place text,okres text,druh text,parcel text,area integer,price integer,
              lat double precision,lng double precision,description text,contact text,
              photos jsonb,features text[],access text,views integer,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,
         coalesce(photos,'[]'::jsonb),coalesce(features,'{}'),access,views,created_at
  from listings where status='approved' order by created_at desc; $$;

create or replace function my_listings()
returns table(id uuid,place text,okres text,area integer,price integer,
              photos jsonb,features text[],access text,views integer,status text,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,area,price,coalesce(photos,'[]'::jsonb),coalesce(features,'{}'),access,views,status,created_at
  from listings where user_id = auth.uid() order by created_at desc; $$;

grant execute on function public_listings() to anon, authenticated;
grant execute on function my_listings() to authenticated;
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb,text[],text) to authenticated;
