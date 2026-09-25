-- =====================================================================
-- Parcelka — PRVNÍ INZERÁT OD NOVÉHO ÚČTU SE NEJDŘÍV ZKONTROLUJE
-- Spustit jednou: Supabase → SQL Editor → vložit → Run.
--
-- PROČ:
-- Inzerát šel na mapu okamžitě — stačilo založit účet a zaškrtnout
-- „jsem oprávněn". U pozemků je to ideální prostředí pro podvod typu
-- „pošlete zálohu, pozemek je váš": stačí opsat cizí parcelu z katastru,
-- dát vlastní telefon a čekat. Než si toho někdo všimne, inzerát už je
-- pár dní na mapě a tváří se jako součást webu, který jinde poctivě
-- odkazuje na úřední zdroje. Ta důvěra je přesně to, co podvodník kupuje.
--
-- CO SE MĚNÍ:
--   1) E-MAIL MUSÍ BÝT POTVRZENÝ. Nepotvrzený e-mail znamená, že za
--      inzerátem nestojí vůbec nic — ani schránka, do které se dá napsat.
--      POZOR: dokud má projekt zapnuté „mailer_autoconfirm", potvrzuje
--      Supabase e-maily sama a tahle podmínka nic neudělá. Vypíná se
--      v Supabase → Authentication → Providers → Email → „Confirm email".
--      Jestli je zapnuté, ukazuje stránka /diagnostika.html.
--   2) PRVNÍ INZERÁT ÚČTU ČEKÁ NA KONTROLU. Druhý a další už jdou na
--      mapu rovnou — kdo jednou prošel, nemusí čekat pokaždé.
--   3) ABY NIKDO NEČEKAL DONEKONEČNA, má každý čekající inzerát v poli
--      public_at napsané, kdy se zveřejní sám: za 24 hodin. Je to úmyslný
--      kompromis. Zastaví to spam „vysyp a zmiz" a dá to čas zasáhnout,
--      ale trpělivého podvodníka to samo nezastaví. Bez něj by ale
--      poctivý prodávající čekal, dokud si někdo nevšimne — a to je
--      jistá škoda proti nejisté.
--
-- JAK SE INZERÁT SCHVALUJE (nebo zamítá) BEZ ADMIN ROZHRANÍ:
--   Supabase → Table Editor → listings → řádek se status = 'pending'
--     · pustit hned:  status → 'approved'
--     · zamítnout:    status → 'rejected'   (public_listings ho nikdy nevydá)
--   Kolik jich čeká, ukazuje /diagnostika.html.
-- =====================================================================

-- Kdy se čekající inzerát zveřejní sám. U starých řádků null → chovají se
-- jako dřív (rozhoduje jen status).
alter table listings add column if not exists public_at timestamptz;

-- JEDNO místo, kde je napsané, co je na mapě vidět. Používá to veřejný
-- seznam i rozhodnutí „je tenhle účet už zavedený". Kdyby to bylo
-- napsané dvakrát, rozejde se to: inzerát by se zveřejnil, ale účet by
-- se pořád tvářil jako nový a čekal by pokaždé znovu.
-- 'rejected' nevydá nikdy, ani po čase.
create or replace function listing_je_verejny(p_status text, p_public_at timestamptz)
returns boolean language sql stable set search_path = public as $$
  select p_status = 'approved'
      or (p_status = 'pending' and p_public_at is not null and p_public_at <= now()); $$;
grant execute on function listing_je_verejny(text, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 1) Zakládání inzerátu
-- ---------------------------------------------------------------------
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
  blob text;
  limit_uctu integer;
  prvni boolean;
  novy_stav text;
  kdy_verejne timestamptz;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if p_place is null or length(trim(p_place))=0 then raise exception 'obec je povinná'; end if;
  if p_lat is null or p_lng is null then raise exception 'poloha je povinná'; end if;

  -- Potvrzený e-mail. Bez něj za inzerátem nestojí ani schránka.
  /* Tabulka se musí pojmenovat: funkce vrací sloupec „id", takže holé
     „where id = uid" je pro PL/pgSQL dvojznačné a celé zakládání
     inzerátu spadne na „column reference id is ambiguous". */
  if (select u.email_confirmed_at from auth.users u where u.id = uid) is null then
    raise exception 'nejdřív potvrďte e-mail — poslali jsme vám odkaz';
  end if;

  -- Serverová ochrana obsahu (nejde obejít z prohlížeče): vulgarity + spam.
  blob := lower(coalesce(p_place,'') || ' ' || coalesce(p_description,'') || ' ' || coalesce(p_parcel,''));
  if blob ~ '(kokot|kurv|piča|píčovin|picovin|\mmrd|debil|čur[aá]k|čůr|zmrd|\mjeb|hovn|hajzl|zkur|prdel|hovado|\midiot|blb[eě]c|porno|penis|vagin)' then
    raise exception 'obsah obsahuje nevhodná slova';
  end if;
  if blob ~ '(viagra|casino|kasino|bitcoin|\mcrypto|klikni zde|výhr[aou]|vyhr[aou]j)' then
    raise exception 'obsah vypadá jako spam';
  end if;
  if blob ~ '(.)\1{6,}' then   -- 7+ stejných znaků za sebou (aaaa…, !!!!!)
    raise exception 'obsah vypadá jako spam';
  end if;

  -- Limit počtu inzerátů podle účtu (account_tier), jinak 10.
  select coalesce((select max_listings from account_tier where user_id = uid), 10) into limit_uctu;
  if (select count(*) from listings where user_id = uid) >= limit_uctu then
    raise exception 'dosažen limit inzerátů na účet (%)', limit_uctu;
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

  -- Vybavení a přístup: jen z povoleného seznamu
  if p_features is not null then
    foreach ft in array p_features loop
      if ft in ('elektrina','voda','plyn','kanalizace','cesta') then
        clean_features := array_append(clean_features, ft);
      end if;
    end loop;
  end if;
  if p_access in ('zpevnena','nezpevnena','pres_cizi','bez') then clean_access := p_access; end if;

  -- PRVNÍ INZERÁT ÚČTU ČEKÁ NA KONTROLU. Kdo už jeden schválený má,
  -- publikuje rovnou — kontrola je na nový účet, ne na každý inzerát.
  prvni := not exists (select 1 from listings
                        where user_id = uid and listing_je_verejny(status, public_at));
  if prvni then
    novy_stav := 'pending';
    kdy_verejne := now() + interval '24 hours';
  else
    novy_stav := 'approved';
    kdy_verejne := now();
  end if;

  insert into listings(status,public_at,user_id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,photos,features,access,featured,views)
  values(novy_stav,kdy_verejne,uid,trim(p_place),nullif(trim(coalesce(p_okres,'')),''),nullif(trim(coalesce(p_druh,'')),''),
         nullif(trim(coalesce(p_parcel,'')),''),p_area,p_price,p_lat,p_lng,
         nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_contact,'')),''),
         clean_photos,clean_features,clean_access,false,0)
  returning listings.id into new_id;
  return query select new_id;
end; $$;
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb,text[],text) to authenticated;

-- ---------------------------------------------------------------------
-- 2) Veřejný seznam: schválené + ty, kterým vypršelo čekání
--    'rejected' se nevydá nikdy, ani po čase.
-- ---------------------------------------------------------------------
create or replace function public_listings()
returns table(id uuid,place text,okres text,druh text,parcel text,area integer,price integer,
              lat double precision,lng double precision,description text,contact text,
              photos jsonb,features text[],access text,views integer,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,
         coalesce(photos,'[]'::jsonb),coalesce(features,'{}'),access,views,created_at
  from listings
  where listing_je_verejny(status, public_at)
  order by created_at desc; $$;
grant execute on function public_listings() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Majitel musí vidět, že se jeho inzerát kontroluje — a DO KDY.
--    Proto se vrací i public_at: web z něj napíše čas sám a nemusí
--    znát pravidlo „24 hodin". Kdyby ho znal taky, dřív nebo později
--    se ta dvě čísla rozejdou.
--    PostgreSQL nedovolí „create or replace" při změně návratového
--    typu, proto drop. Tohle je POSLEDNÍ verze my_listings v pořadí
--    (viz scripts/build-sql.mjs) — sloupce z listings-kontrola-
--    -vlastnikovi.sql se tu proto musí zopakovat, jinak by zmizely.
-- ---------------------------------------------------------------------
drop function if exists my_listings();

create or replace function my_listings()
returns table(id uuid, place text, okres text, area integer, price integer,
              photos jsonb, features text[], access text, views integer, status text,
              created_at timestamptz,
              kontrola_ok boolean, kontrola_kdy timestamptz, kontrola_nalezy jsonb,
              public_at timestamptz)
language sql security definer set search_path = public as $$
  select l.id, l.place, l.okres, l.area, l.price,
         coalesce(l.photos, '[]'::jsonb), coalesce(l.features, '{}'), l.access,
         l.views, l.status, l.created_at,
         k.ok, k.checked_at, coalesce(k.nalezy, '[]'::jsonb),
         l.public_at
    from listings l
    left join listing_checks k on k.listing_id = l.id
   where l.user_id = auth.uid()
   order by l.created_at desc;
$$;
grant execute on function my_listings() to authenticated;

-- ---------------------------------------------------------------------
-- 4) Kolik inzerátů čeká na kontrolu (pro /diagnostika.html).
--    Jen počet, žádný obsah — nikomu cizímu to nic neprozradí.
-- ---------------------------------------------------------------------
create or replace function pending_count()
returns integer
language sql security definer set search_path = public as $$
  select count(*)::integer from listings
   where status='pending' and not listing_je_verejny(status, public_at); $$;
grant execute on function pending_count() to anon, authenticated;
