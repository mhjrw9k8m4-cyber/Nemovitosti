-- =====================================================================
-- Parcelka — HLÍDAT SE DÁ I OKRUH, NE JEN POJMENOVANÝ OKRES.
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- PROČ. Mapa umí „Pozemky v okolí": člověk ukáže místo a posuvníkem
-- nastaví okruh (2 až 100 km). Uložit si to ale nešlo — hlídání znalo
-- jedinou podobu místa, totiž NÁZEV okresu nebo obce. Kdo bydlí
-- v Tišnově a dojede za hodinu, nehledá „okres Brno-venkov": okres je
-- jednou příliš velký a jindy končí pár kilometrů od domu. Z okolí
-- Tišnova do 25 km spadá pět okresů naráz a žádný z nich celý.
--
-- Uložené hledání proto umí i střed a poloměr. Vzdálenost se počítá
-- stejně jako na mapě (haversine, js/hlidani-logika.js), takže
-- upozornění chodí na totéž, co člověk viděl, když si hledání ukládal.
--
-- Staré hledání zůstává platné: prázdné sloupce znamenají „neřeším",
-- tedy přesně dnešní chování.
-- =====================================================================

alter table saved_searches add column if not exists stred_lat double precision;
alter table saved_searches add column if not exists stred_lng double precision;
alter table saved_searches add column if not exists okruh_km  integer;

-- Uložit hledání (max 20 na účet) — nově i se středem a okruhem.
-- Starší podoby funkce zůstávají vedle: kdyby se web nasadil dřív než
-- tenhle soubor, pořád má co volat.
create or replace function save_search(
  p_label text, p_okres text, p_druh text, p_type text,
  p_max_price integer, p_min_area integer, p_features text[],
  p_min_price integer, p_max_area integer, p_max_perm2 integer,
  p_jen_celek boolean,
  p_stred_lat double precision, p_stred_lng double precision, p_okruh_km integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if (select count(*) from saved_searches where user_id = uid) >= 20 then
    raise exception 'máte uložených už 20 hledání (víc nejde)';
  end if;
  -- Okruh dává smysl jen se středem. Poloměr bez místa by znamenal
  -- „do 25 km od ničeho" a hlídání by tiše pouštělo všechno.
  if p_okruh_km is not null and p_okruh_km > 0
     and (p_stred_lat is null or p_stred_lng is null) then
    raise exception 'okruh se ukládá jen se středem';
  end if;
  -- Souřadnice mimo svět jsou chyba volajícího, ne volba uživatele.
  if p_stred_lat is not null and (p_stred_lat < -90 or p_stred_lat > 90) then
    raise exception 'neplatná zeměpisná šířka';
  end if;
  if p_stred_lng is not null and (p_stred_lng < -180 or p_stred_lng > 180) then
    raise exception 'neplatná zeměpisná délka';
  end if;
  insert into saved_searches(user_id, label, okres, druh, ptype,
      max_price, min_area, features, min_price, max_area, max_perm2, jen_celek,
      stred_lat, stred_lng, okruh_km)
  values (uid,
    nullif(trim(coalesce(p_label,'')),''),
    nullif(trim(coalesce(p_okres,'')),''),
    nullif(trim(coalesce(p_druh,'')),''),
    nullif(trim(coalesce(p_type,'')),''),
    nullif(p_max_price, 0),
    nullif(p_min_area, 0),
    coalesce(p_features, '{}'),
    nullif(p_min_price, 0),
    nullif(p_max_area, 0),
    nullif(p_max_perm2, 0),
    coalesce(p_jen_celek, false),
    p_stred_lat, p_stred_lng, nullif(p_okruh_km, 0))
  returning id into new_id;
  return new_id;
end; $$;
grant execute on function save_search(text,text,text,text,integer,integer,text[],integer,integer,integer,boolean,double precision,double precision,integer) to authenticated;
