-- =====================================================================
-- Parcelka — HLÍDÁNÍ SE DÁ POSLAT E-MAILEM (dobrovolně, vypnuté)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- PROČ. Uložené hledání dnes funguje jen V APLIKACI: kdo si web neotevře,
-- o nový pozemek přijde. U dražeb to má cenu v hodinách — termín bývá
-- vypsaný pár týdnů dopředu a kdo se podívá za měsíc, čte historii.
--
-- SOUHLAS SE NEPŘEDPOKLÁDÁ. To, že si někdo uložil hledání, není souhlas
-- s e-maily; účet si zakládal kvůli ukládání, ne kvůli poště. Posílá se
-- proto jen tomu, kdo si u KONKRÉTNÍHO hledání zapne „posílat e-mailem" —
-- sloupec mailem má default FALSE a žádná migrace ho nikomu nezapne.
-- E-mail je už potvrzený přihlášením (Supabase ho ověřuje při registraci),
-- takže se nepotvrzuje podruhé; chybí-li potvrzení, rozesílač řádek
-- přeskočí.
--
-- ODHLÁŠENÍ JEDNÍM KLIKEM je povinnost, ne laskavost. Každý účet má
-- vlastní token; odkaz s ním vypne všechno naráz a nepotřebuje
-- přihlášení — kdo se odhlašuje, nebude se kvůli tomu logovat.
--
-- CO SE UŽ POSLALO, SE NEPOSÍLÁ ZNOVU. Tabulka mail_poslane si drží klíč
-- nabídky u každého hledání zvlášť. Aplikační seen_keys na to nestačí:
-- ty se mění tím, že si člověk hledání otevře, takže by pošta chodila
-- podle toho, jak kdo kliká.
--
-- Pustit se to dá i opakovaně.
-- =====================================================================

-- ---------- 1) Volba u jednotlivého hledání ----------
alter table saved_searches add column if not exists mailem boolean not null default false;
alter table saved_searches add column if not exists mail_odeslano_at timestamptz;

-- ---------- 2) Odhlašovací token na účet ----------
create table if not exists mail_nastaveni (
  user_id   uuid primary key,
  token     text not null unique default gen_random_uuid()::text,
  vypnuto   boolean not null default false,
  zmeneno   timestamptz not null default now()
);
alter table mail_nastaveni enable row level security;
-- Každý vidí jen svůj řádek. Odhlášení přes token jde zvlášť, funkcí níž.
drop policy if exists "mn vlastni" on mail_nastaveni;
create policy "mn vlastni" on mail_nastaveni for select to authenticated
  using (user_id = auth.uid());

-- ---------- 3) Co se komu už poslalo ----------
create table if not exists mail_poslane (
  hledani_id uuid not null references saved_searches(id) on delete cascade,
  klic       text not null,
  poslano_at timestamptz not null default now(),
  primary key (hledani_id, klic)
);
create index if not exists mp_kdy_idx on mail_poslane(poslano_at);
alter table mail_poslane enable row level security;   -- čte a píše jen server

-- ---------- 4) Zapnout/vypnout posílání u svého hledání ----------
create or replace function set_search_mail(p_id uuid, p_mailem boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  update saved_searches set mailem = coalesce(p_mailem, false)
   where id = p_id and user_id = uid;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  -- Token musí existovat DŘÍV, než odejde první e-mail: bez něj by v něm
  -- nebyl odhlašovací odkaz, a e-mail bez něj se posílat nesmí.
  insert into mail_nastaveni(user_id) values (uid)
    on conflict (user_id) do nothing;
  -- Kdo si posílání znovu zapne, tím ruší dřívější celkové odhlášení.
  if coalesce(p_mailem, false) then
    update mail_nastaveni set vypnuto = false, zmeneno = now() where user_id = uid;
  end if;
  return true;
end; $$;
grant execute on function set_search_mail(uuid, boolean) to authenticated;

-- ---------- 5) Odhlášení jedním klikem (bez přihlášení) ----------
create or replace function unsubscribe_mail(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if coalesce(p_token,'') = '' then return false; end if;
  select user_id into uid from mail_nastaveni where token = p_token;
  if uid is null then return false; end if;
  update mail_nastaveni set vypnuto = true, zmeneno = now() where user_id = uid;
  -- Vypne se to i u jednotlivých hledání, aby se po zapnutí u jednoho
  -- nerozjela pošta ze všech ostatních.
  update saved_searches set mailem = false where user_id = uid;
  return true;
end; $$;
grant execute on function unsubscribe_mail(text) to anon, authenticated;

-- ---------- 6) Co má rozesílač poslat ----------
-- Volá to jen server (service_role). Vrací hledání, u kterých je
-- posílání zapnuté, účet není odhlášený a e-mail je potvrzený. Filtry
-- hledání se vracejí tak, jak je zná js/hlidani-logika.js — shodu počítá
-- rozesílač TOUŽE funkcí jako prohlížeč, ne vlastním SQL: dvě různá
-- pravidla by znamenala, že e-mail slibuje něco jiného než web.
create or replace function hlidani_k_odeslani(p_odstup_hodin integer default 20)
returns table(
  hledani_id uuid, user_id uuid, email text, label text,
  okres text, druh text, ptype text,
  max_price integer, min_area integer, min_price integer, max_area integer,
  max_perm2 integer, jen_celek boolean, features text[],
  stred_lat double precision, stred_lng double precision, okruh_km integer,
  token text)
language sql security definer set search_path = public, auth as $$
  select s.id, s.user_id, u.email, s.label,
         s.okres, s.druh, s.ptype,
         s.max_price, s.min_area, s.min_price, s.max_area,
         s.max_perm2, s.jen_celek, s.features,
         s.stred_lat, s.stred_lng, s.okruh_km,
         n.token
    from saved_searches s
    join auth.users u on u.id = s.user_id
    join mail_nastaveni n on n.user_id = s.user_id
   where s.mailem = true
     and n.vypnuto = false
     and u.email is not null
     and u.email_confirmed_at is not null
     and (s.mail_odeslano_at is null
          or s.mail_odeslano_at < now() - make_interval(hours => greatest(coalesce(p_odstup_hodin,20), 1)))
   order by s.mail_odeslano_at nulls first, s.created_at;
$$;
revoke all on function hlidani_k_odeslani(integer) from public, anon, authenticated;
grant execute on function hlidani_k_odeslani(integer) to service_role;

-- ---------- 7) Zapsat, co odešlo ----------
create or replace function mail_odeslan(p_hledani uuid, p_klice text[])
returns integer language plpgsql security definer set search_path = public as $$
declare vlozeno int := 0;
begin
  insert into mail_poslane(hledani_id, klic)
  select p_hledani, k from unnest(coalesce(p_klice,'{}')) as k
  on conflict (hledani_id, klic) do nothing;
  get diagnostics vlozeno = row_count;
  update saved_searches set mail_odeslano_at = now() where id = p_hledani;
  return vlozeno;
end; $$;
revoke all on function mail_odeslan(uuid, text[]) from public, anon, authenticated;
grant execute on function mail_odeslan(uuid, text[]) to service_role;
