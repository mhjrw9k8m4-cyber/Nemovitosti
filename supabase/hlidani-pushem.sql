-- =====================================================================
-- Parcelka — HLÍDÁNÍ JDE POSLAT I JAKO UPOZORNĚNÍ DO TELEFONU (push)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run. Lze opakovaně.
--
-- PROČ VEDLE E-MAILU. E-mail přijde, ale přečte se, až si ho někdo
-- otevře. U dražeb jde o hodiny: termín bývá vypsaný pár týdnů dopředu
-- a kdo se podívá za měsíc, čte historii. Web je navíc nainstalovatelný
-- jako aplikace (manifest.webmanifest, offline režim v sw.js), takže
-- upozornění na plochu telefonu je to, co z něj dělá aplikaci.
--
-- SOUHLAS SE NEPŘEDPOKLÁDÁ, DVAKRÁT. Jednou se o něj řekne prohlížeč
-- (bez povolení oznámení nevznikne odběr vůbec) a podruhé web: posílá se
-- jen u hledání, u kterého si to člověk zapne. Sloupec pushem má default
-- FALSE a žádná migrace ho nikomu nezapne.
--
-- ODBĚR JE ZAŘÍZENÍ, NE ČLOVĚK. Jeden účet může mít telefon, tablet
-- i počítač; každý má vlastní endpoint. Proto samostatná tabulka, a ne
-- sloupec u účtu.
--
-- CO ODBĚR OBSAHUJE: adresu push služby prohlížeče (endpoint) a dva
-- klíče, kterými se zpráva zašifruje PRO TO ZAŘÍZENÍ. Obsah upozornění
-- nevidí ani push služba (Google, Mozilla, Apple) — šifruje se u nás
-- (scripts/web-push.mjs, RFC 8291). Endpoint je ale identifikátor
-- zařízení: patří jen svému vlastníkovi a server ho nikomu nevydává.
--
-- MRTVÉ ODBĚRY SE MAŽOU. Když push služba odpoví 404 nebo 410, odběr
-- zanikl (odinstalovaná aplikace, odebrané povolení). Rozesílač takový
-- řádek smaže, jinak by se do něj tlačilo donekonečna.
-- =====================================================================

-- ---------- 1) Volba u jednotlivého hledání ----------
alter table saved_searches add column if not exists pushem boolean not null default false;
alter table saved_searches add column if not exists push_odeslano_at timestamptz;

-- ---------- 2) Odběry (jeden na zařízení) ----------
create table if not exists push_odbery (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  vytvoreno  timestamptz not null default now(),
  naposled   timestamptz
);
create index if not exists po_user_idx on push_odbery(user_id);
alter table push_odbery enable row level security;

-- Každý vidí a maže jen své odběry. Vkládá se funkcí níž, aby se
-- nemohlo zapsat cizí user_id.
drop policy if exists "po vlastni cteni" on push_odbery;
create policy "po vlastni cteni" on push_odbery for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "po vlastni mazani" on push_odbery;
create policy "po vlastni mazani" on push_odbery for delete to authenticated
  using (user_id = auth.uid());

-- ---------- 3) Co se komu už poslalo ----------
-- Stejný důvod jako u mail_poslane: aplikační seen_keys se mění tím, že
-- si člověk hledání otevře, takže by upozornění chodila podle toho, jak
-- kdo kliká.
create table if not exists push_poslane (
  hledani_id uuid not null references saved_searches(id) on delete cascade,
  klic       text not null,
  poslano_at timestamptz not null default now(),
  primary key (hledani_id, klic)
);
create index if not exists pp_kdy_idx on push_poslane(poslano_at);
alter table push_poslane enable row level security;   -- čte a píše jen server

-- ---------- 4) Uložení a zrušení odběru ----------
create or replace function push_odber_uloz(p_endpoint text, p_p256dh text, p_auth text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if coalesce(p_endpoint,'') = '' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = ''
    then return false; end if;
  -- Týž endpoint může po přeinstalování patřit témuž účtu znovu; klíče
  -- se pak mění, takže se přepíšou. Na cizí účet ho přepsat nelze.
  insert into push_odbery(user_id, endpoint, p256dh, auth)
    values (uid, p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update
      set p256dh = excluded.p256dh, auth = excluded.auth, vytvoreno = now()
      where push_odbery.user_id = uid;
  return true;
end; $$;
grant execute on function push_odber_uloz(text, text, text) to authenticated;

create or replace function push_odber_smaz(p_endpoint text)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  delete from push_odbery where endpoint = p_endpoint and user_id = uid;
  return true;
end; $$;
grant execute on function push_odber_smaz(text) to authenticated;

-- ---------- 5) Zapnout/vypnout u svého hledání ----------
create or replace function set_search_push(p_id uuid, p_pushem boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  update saved_searches set pushem = coalesce(p_pushem, false)
   where id = p_id and user_id = uid;
  get diagnostics n = row_count;
  return n > 0;
end; $$;
grant execute on function set_search_push(uuid, boolean) to authenticated;

-- ---------- 6) Co má rozesílač poslat ----------
-- Volá jen server (service_role). Vrací hledání se zapnutým pushem,
-- u kterých má účet aspoň jeden odběr. Filtry se vracejí tak, jak je zná
-- js/hlidani-logika.js — shodu počítá rozesílač TOUŽE funkcí jako
-- prohlížeč, ne vlastním SQL: dvě různá pravidla by znamenala, že
-- upozornění slibuje něco jiného než web.
create or replace function hlidani_k_odeslani_push(p_odstup_hodin integer default 20)
returns table(
  hledani_id uuid, user_id uuid, label text,
  okres text, druh text, ptype text,
  max_price integer, min_area integer, min_price integer, max_area integer,
  max_perm2 integer, jen_celek boolean, features text[],
  stred_lat double precision, stred_lng double precision, okruh_km integer,
  endpoint text, p256dh text, auth text)
language sql security definer set search_path = public as $$
  select s.id, s.user_id, s.label,
         s.okres, s.druh, s.ptype,
         s.max_price, s.min_area, s.min_price, s.max_area,
         s.max_perm2, s.jen_celek, s.features,
         s.stred_lat, s.stred_lng, s.okruh_km,
         o.endpoint, o.p256dh, o.auth
    from saved_searches s
    join push_odbery o on o.user_id = s.user_id
   where s.pushem = true
     and (s.push_odeslano_at is null
          or s.push_odeslano_at < now() - make_interval(hours => greatest(coalesce(p_odstup_hodin,20),1)))
$$;
revoke all on function hlidani_k_odeslani_push(integer) from public, anon, authenticated;
grant execute on function hlidani_k_odeslani_push(integer) to service_role;

-- ---------- 7) Zápis toho, co opravdu odešlo ----------
-- Zapisuje se JEN to, co v upozornění stálo. Zapsat i zbytek by znamenalo,
-- že se nabídky nad limit nikdy nepošlou — tiše by zmizely.
create or replace function push_odeslan(p_hledani uuid, p_klice text[])
returns integer language plpgsql security definer set search_path = public as $$
declare vlozeno int := 0;
begin
  insert into push_poslane(hledani_id, klic)
  select p_hledani, k from unnest(coalesce(p_klice,'{}')) as k
  on conflict (hledani_id, klic) do nothing;
  get diagnostics vlozeno = row_count;
  update saved_searches set push_odeslano_at = now() where id = p_hledani;
  return vlozeno;
end; $$;
revoke all on function push_odeslan(uuid, text[]) from public, anon, authenticated;
grant execute on function push_odeslan(uuid, text[]) to service_role;

-- ---------- 8) Smazání odběru, který zanikl ----------
-- Push služba odpoví 404/410, když aplikace zmizela nebo člověk odebral
-- povolení. Volá to rozesílač, ne prohlížeč.
create or replace function push_odber_mrtvy(p_endpoint text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from push_odbery where endpoint = p_endpoint;
  return true;
end; $$;
revoke all on function push_odber_mrtvy(text) from public, anon, authenticated;
grant execute on function push_odber_mrtvy(text) to service_role;
