-- =====================================================================
-- Parcelka — CHYTRÁ UPOZORNĚNÍ (uložená hledání) — v aplikaci, bez e-mailu.
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- Uživatel si uloží, co hledá (okres, druh, typ, cena, výměra + detaily jako
-- elektřina/voda/přístup). Aplikace pak porovná jeho hledání s aktuálními
-- pozemky a ukáže, kolik NOVÝCH mu přibylo od posledního zobrazení.
-- „Nové" se pozná porovnáním klíčů pozemků (seen_keys) — čistě v appce.
-- =====================================================================

create table if not exists saved_searches (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid not null default auth.uid(),
  label           text,
  okres           text,
  druh            text,
  ptype           text,                 -- '' = vše | 'sale'|'drazba'|'exekuce'|'obec'|'majitel'
  max_price       integer,
  min_area        integer,
  features        text[] not null default '{}',   -- Elektřina, Voda, Kanalizace, Plyn, Oplocení
  seen_keys       text[] not null default '{}',
  last_checked_at timestamptz
);
create index if not exists ss_user_idx on saved_searches(user_id);
alter table saved_searches enable row level security;

-- Každý vidí a spravuje jen svoje hledání.
drop policy if exists "ss vlastni" on saved_searches;
create policy "ss vlastni" on saved_searches for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Uložit hledání (max 20 na účet).
create or replace function save_search(
  p_label text, p_okres text, p_druh text, p_type text,
  p_max_price integer, p_min_area integer, p_features text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if (select count(*) from saved_searches where user_id = uid) >= 20 then
    raise exception 'máte uložených už 20 hledání (víc nejde)';
  end if;
  insert into saved_searches(user_id, label, okres, druh, ptype, max_price, min_area, features)
  values (uid,
    nullif(trim(coalesce(p_label,'')),''),
    nullif(trim(coalesce(p_okres,'')),''),
    nullif(trim(coalesce(p_druh,'')),''),
    nullif(trim(coalesce(p_type,'')),''),
    nullif(p_max_price, 0),
    nullif(p_min_area, 0),
    coalesce(p_features, '{}'))
  returning id into new_id;
  return new_id;
end; $$;
grant execute on function save_search(text,text,text,text,integer,integer,text[]) to authenticated;

-- Moje uložená hledání.
create or replace function my_searches()
returns setof saved_searches
language sql security definer set search_path = public as $$
  select * from saved_searches where user_id = auth.uid() order by created_at desc;
$$;
grant execute on function my_searches() to authenticated;

-- Smazat hledání.
create or replace function delete_search(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int; begin
  delete from saved_searches where id = p_id and user_id = auth.uid();
  get diagnostics n = row_count; return n > 0; end; $$;
grant execute on function delete_search(uuid) to authenticated;

-- Označit hledání jako „prohlédnuté" (uloží aktuální klíče → příště se nové
-- počítají od těchhle). Volá appka, když uživatel hledání otevře.
create or replace function mark_search_seen(p_id uuid, p_keys text[])
returns boolean language plpgsql security definer set search_path = public as $$
declare n int; begin
  update saved_searches
     set seen_keys = coalesce(p_keys, '{}'), last_checked_at = now()
   where id = p_id and user_id = auth.uid();
  get diagnostics n = row_count; return n > 0; end; $$;
grant execute on function mark_search_seen(uuid, text[]) to authenticated;
