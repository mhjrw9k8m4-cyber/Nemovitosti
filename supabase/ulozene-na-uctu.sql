-- =====================================================================
-- Parcelka — ULOŽENÉ POZEMKY NA ÚČTU (ne jen v prohlížeči)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run. Jde opakovaně.
--
-- PROČ. Uložené pozemky byly jediná věc, kterou si web pamatoval POUZE
-- v prohlížeči (localStorage, klíč pk_fav_v1). Poznámky k pozemkům
-- i uložená hledání na účet chodí už dávno (poznamky.sql,
-- saved-searches.sql) — jenže to nejčastější, totiž „tenhle si
-- schovám", zůstávalo v jednom zařízení. Kdo si v autobuse uložil
-- dvacet pozemků na telefonu, doma na počítači neviděl ani jeden.
--
-- JAK TO FUNGUJE. Stejně jako poznámky: zápis jde VŽDYCKY nejdřív do
-- prohlížeče (ať je uložení okamžité a ať se nic neztratí bez signálu)
-- a teprve pak na účet. Nepřihlášenému se nic nemění — uložené pozemky
-- fungují dál jen v prohlížeči.
--
-- KLÍČ JE TÝŽ, JAKÝ POČÍTÁ js/klic.js (PKKlic.klicPozemku): pkey plus
-- výměra, případně rozlišení podle druhu. Kdyby se tu použil jiný,
-- rozešly by se dva seznamy téhož.
-- =====================================================================

create table if not exists ulozene (
  user_id uuid not null default auth.uid(),
  klic    text not null,
  kdy     timestamptz not null default now(),
  primary key (user_id, klic)
);
alter table ulozene enable row level security;

-- Každý vidí a maže jen svoje. Zápis jde přes funkci níž (kvůli stropu).
drop policy if exists "ulozene vlastni cteni" on ulozene;
create policy "ulozene vlastni cteni" on ulozene for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "ulozene vlastni mazani" on ulozene;
create policy "ulozene vlastni mazani" on ulozene for delete to authenticated
  using (user_id = auth.uid());

/* STROP JE OCHRANA ÚČTU, NE ŠKRCENÍ ČLOVĚKA. Pět set uložených
   pozemků je víc, než kolik si kdo projde za rok; smysl má jen proti
   tomu, aby si někdo z účtu udělal úložiště. Prohlížeč má svůj vlastní
   strop (viz js/ulozene.js) a je nižší. */
create or replace function ulozeny_uloz(p_klic text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text := trim(coalesce(p_klic, ''));
begin
  if uid is null then return false; end if;
  if k = '' or length(k) > 200 then return false; end if;
  if (select count(*) from ulozene where user_id = uid) >= 500
     and not exists (select 1 from ulozene where user_id = uid and klic = k) then
    raise exception 'uložených pozemků je už 500 — nejdřív nějaké odeberte';
  end if;
  insert into ulozene(user_id, klic) values (uid, k)
    on conflict (user_id, klic) do nothing;
  return true;
end; $$;
grant execute on function ulozeny_uloz(text) to authenticated;

create or replace function ulozeny_smaz(p_klic text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  delete from ulozene where user_id = uid and klic = trim(coalesce(p_klic, ''));
  return true;
end; $$;
grant execute on function ulozeny_smaz(text) to authenticated;

/* Celý seznam najednou — slučování dělá prohlížeč (js/main.js), aby
   byla pravidla sloučení na jednom místě a dala se zkoušet bez sítě. */
create or replace function moje_ulozene()
returns table(klic text, kdy timestamptz)
language sql security definer set search_path = public as $$
  select u.klic, u.kdy from ulozene u where u.user_id = auth.uid() order by u.kdy desc;
$$;
grant execute on function moje_ulozene() to authenticated;

/* Hromadné nahrání toho, co má člověk v prohlížeči — při prvním
   přihlášení. Jedním voláním, ne dvaceti: dvacet kol přes síť by na
   telefonu trvalo vteřiny a půlka by se po cestě ztratila. */
create or replace function ulozene_nahraj(p_klice text[])
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); vlozeno int := 0;
begin
  if uid is null then return 0; end if;
  insert into ulozene(user_id, klic)
  select uid, k from unnest(coalesce(p_klice, '{}')) as k
   where trim(k) <> '' and length(k) <= 200
   limit 500
  on conflict (user_id, klic) do nothing;
  get diagnostics vlozeno = row_count;
  return vlozeno;
end; $$;
grant execute on function ulozene_nahraj(text[]) to authenticated;
