-- =====================================================================
-- Parcelka — ŠIRŠÍ VÝBĚR U HLÍDÁNÍ.
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- Hlídání umělo jen „nejvýš tolik korun" a „aspoň tolik metrů". To je na
-- pozemky málo: kdo hledá stavební parcelu, potřebuje i horní hranici
-- výměry (tisíc metrů ano, deset hektarů ne) a spodní hranici ceny
-- (pod ní bývají spoluvlastnické podíly, ne pozemky). A hlavně chybělo
-- to, podle čeho se pozemky srovnávají nejčastěji — cena za metr.
--
-- Staré hledání zůstává platné: nové sloupce jsou prázdné a prázdná mez
-- se nekontroluje.
-- =====================================================================

alter table saved_searches add column if not exists min_price  integer;
alter table saved_searches add column if not exists max_area   integer;
alter table saved_searches add column if not exists max_perm2  integer;

-- Uložit hledání (max 20 na účet) — širší podoba.
-- Stará funkce se sedmi parametry zůstává vedle: kdyby se web nasadil
-- dřív než tenhle soubor, pořád má co volat.
create or replace function save_search(
  p_label text, p_okres text, p_druh text, p_type text,
  p_max_price integer, p_min_area integer, p_features text[],
  p_min_price integer, p_max_area integer, p_max_perm2 integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if (select count(*) from saved_searches where user_id = uid) >= 20 then
    raise exception 'máte uložených už 20 hledání (víc nejde)';
  end if;
  insert into saved_searches(user_id, label, okres, druh, ptype,
      max_price, min_area, features, min_price, max_area, max_perm2)
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
    nullif(p_max_perm2, 0))
  returning id into new_id;
  return new_id;
end; $$;
grant execute on function save_search(text,text,text,text,integer,integer,text[],integer,integer,integer) to authenticated;
