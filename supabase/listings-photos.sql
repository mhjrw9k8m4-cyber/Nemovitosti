-- =====================================================================
-- Parcelka — FOTKY U INZERÁTŮ (úložiště + automatická kontrola)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- Co to dělá:
--   1) Založí veřejné úložiště „listing-photos" pro fotky pozemků.
--   2) Nastaví bezpečnost: nahrávat smí jen přihlášený, číst může kdokoli
--      (fotka se ukazuje v inzerátu). Mazat jen vlastník.
--   3) Rozšíří create_listing o fotky (přijme jen odkazy z NAŠEHO úložiště
--      — nejde podstrčit cizí adresu) a public_listings/my_listings je
--      začnou vracet, aby se zobrazily na webu.
-- =====================================================================

-- ---------- 1) Úložiště fotek ----------
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do update set public = true;

-- ---------- 1b) Jistota: sloupce, které funkce potřebují ----------
alter table listings add column if not exists user_id uuid;
alter table listings add column if not exists views integer not null default 0;
alter table listings add column if not exists photos jsonb default '[]'::jsonb;
alter table listings add column if not exists contact_phone text;

-- ---------- 2) Bezpečnost úložiště (Row Level Security na storage.objects) ----------
-- Veřejné čtení (fotka se ukáže v inzerátu)
drop policy if exists "listing photos public read" on storage.objects;
create policy "listing photos public read"
  on storage.objects for select
  using (bucket_id = 'listing-photos');

-- Nahrávat smí jen přihlášený uživatel
drop policy if exists "listing photos auth upload" on storage.objects;
create policy "listing photos auth upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos');

-- Mazat smí jen vlastník nahrané fotky
drop policy if exists "listing photos owner delete" on storage.objects;
create policy "listing photos owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and owner = auth.uid());

-- ---------- 3) Vytvoření inzerátu VČETNĚ fotek ----------
-- p_photos je JSON pole odkazů (URL) na fotky. Server přijme jen odkazy,
-- které skutečně vedou do našeho veřejného úložiště listing-photos —
-- tím je zaručené, že se nepodstrčí cizí/škodlivá adresa. Max 8 fotek.
-- Nejdřív zahodíme starší verze funkcí (mění se návratový typ / počet parametrů).
drop function if exists create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text);
drop function if exists public_listings();
drop function if exists my_listings();

create or replace function create_listing(
  p_place text, p_okres text, p_druh text, p_parcel text,
  p_area integer, p_price integer, p_lat double precision, p_lng double precision,
  p_description text, p_contact text, p_photos jsonb default '[]'::jsonb)
returns table(id uuid)
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  uid uuid := auth.uid();
  clean_photos jsonb := '[]'::jsonb;
  ph text;
  ok_prefix text;
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
  -- Cooldown proti hromadnému spamu: další inzerát nejdřív za 90 sekund
  if exists (select 1 from listings where user_id = uid and created_at > now() - interval '90 seconds') then
    raise exception 'chvíli počkejte před přidáním dalšího inzerátu';
  end if;

  -- Automatická kontrola fotek: přijmi jen odkazy do našeho úložiště.
  -- Prefix veřejného úložiště: <projekt>.supabase.co/storage/v1/object/public/listing-photos/
  if p_photos is not null and jsonb_typeof(p_photos) = 'array' then
    for ph in select value::text from jsonb_array_elements_text(p_photos) loop
      ok_prefix := '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/listing-photos/';
      if ph ~ ok_prefix and length(ph) < 500 then
        clean_photos := clean_photos || to_jsonb(ph);
      end if;
      exit when jsonb_array_length(clean_photos) >= 8;   -- max 8 fotek
    end loop;
  end if;

  insert into listings(status,user_id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,photos,featured,views)
  values('approved',uid,trim(p_place),nullif(trim(coalesce(p_okres,'')),''),nullif(trim(coalesce(p_druh,'')),''),
         nullif(trim(coalesce(p_parcel,'')),''),p_area,p_price,p_lat,p_lng,
         nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_contact,'')),''),clean_photos,false,0)
  returning listings.id into new_id;
  return query select new_id;
end; $$;

-- ---------- 4) Vracet fotky ve veřejném seznamu i v „Moje inzeráty" ----------
create or replace function public_listings()
returns table(id uuid,place text,okres text,druh text,parcel text,area integer,price integer,
              lat double precision,lng double precision,description text,contact text,
              photos jsonb,views integer,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,
         coalesce(photos,'[]'::jsonb),views,created_at
  from listings where status='approved' order by created_at desc; $$;

create or replace function my_listings()
returns table(id uuid,place text,okres text,area integer,price integer,
              photos jsonb,views integer,status text,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,area,price,coalesce(photos,'[]'::jsonb),views,status,created_at
  from listings where user_id = auth.uid() order by created_at desc; $$;

-- Oprávnění (funkce se mění, jistota)
grant execute on function public_listings() to anon, authenticated;
grant execute on function my_listings() to authenticated;
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb) to authenticated;
