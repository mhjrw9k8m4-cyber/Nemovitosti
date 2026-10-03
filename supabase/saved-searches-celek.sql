-- =====================================================================
-- Parcelka — HLÍDÁNÍ UMÍ VYNECHAT SPOLUVLASTNICKÉ PODÍLY.
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- PROČ. Mapa umí filtr „jen celé pozemky" odjakživa (js/main.js, okCelek),
-- hlídání ne. Kdo si uložil okres, dostával upozornění i na ideální podíl
-- 1/24 na poli — a to je pro většinu lidí bezcenné: v ceně je zlomek,
-- ale výměra celé parcely, takže to ještě vypadá jako trhák.
--
-- Měřeno na ostrých datech: z 2 018 nabídek je 530 spoluvlastnických
-- podílů, tedy 26 %. Sedmdesát jedna z nich je menší než desetina —
-- zlomky jako 9/792, 1/71, 1/66. Čtvrtina všech upozornění tedy mohla
-- být šum, který se nedal vypnout.
--
-- Staré hledání zůstává platné: prázdný sloupec znamená „neřeším",
-- tedy přesně dnešní chování.
-- =====================================================================

alter table saved_searches add column if not exists jen_celek boolean;

-- Uložit hledání (max 20 na účet) — s volbou „jen celé pozemky".
-- Starší podoby funkce zůstávají vedle: kdyby se web nasadil dřív než
-- tenhle soubor, pořád má co volat.
create or replace function save_search(
  p_label text, p_okres text, p_druh text, p_type text,
  p_max_price integer, p_min_area integer, p_features text[],
  p_min_price integer, p_max_area integer, p_max_perm2 integer,
  p_jen_celek boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if (select count(*) from saved_searches where user_id = uid) >= 20 then
    raise exception 'máte uložených už 20 hledání (víc nejde)';
  end if;
  insert into saved_searches(user_id, label, okres, druh, ptype,
      max_price, min_area, features, min_price, max_area, max_perm2, jen_celek)
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
    coalesce(p_jen_celek, false))
  returning id into new_id;
  return new_id;
end; $$;
grant execute on function save_search(text,text,text,text,integer,integer,text[],integer,integer,integer,boolean) to authenticated;
