-- =====================================================================
-- Parcelka — AUTOMATICKÁ UPOZORNĚNÍ NA LOKALITU (e-mail)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- Co přidává:
--   1) subscribe_watch  — přihlášení k hlídání (z formuláře), s potvrzením
--      (double opt-in, zákon vyžaduje souhlas). Nastaví confirm_token.
--   2) confirm_watch    — potvrzení e-mailu (klik v potvrzovacím e-mailu).
--   3) unsubscribe_watch— odhlášení jedním klikem (zákon vyžaduje).
--   4) alert_seen       — evidence už viděných příležitostí, aby robot
--      posílal jen NOVÉ a neopakoval se.
-- Odesílání e-mailů dělá GitHub Action (scripts/send-alerts.mjs) přes Resend.
-- =====================================================================

-- ---------- Jistota: tabulka hlídání a všechny potřebné sloupce ----------
create table if not exists watch_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  email              text not null,
  okres              text,
  types              text[] default '{}',
  active             boolean not null default true,
  confirmed          boolean not null default false,
  confirm_token      text,
  unsubscribe_token  text default gen_random_uuid()::text,
  last_notified_at   timestamptz
);
alter table watch_subscriptions add column if not exists types text[] default '{}';
alter table watch_subscriptions add column if not exists active boolean not null default true;
alter table watch_subscriptions add column if not exists confirmed boolean not null default false;
alter table watch_subscriptions add column if not exists confirm_token text;
alter table watch_subscriptions add column if not exists unsubscribe_token text default gen_random_uuid()::text;
alter table watch_subscriptions add column if not exists last_notified_at timestamptz;
-- Kdy jsme naposledy poslali potvrzovací e-mail (ať ho neposíláme dokola)
alter table watch_subscriptions add column if not exists confirm_sent_at timestamptz;
-- Starým řádkům bez odhlašovacího tokenu ho doplníme
update watch_subscriptions set unsubscribe_token = gen_random_uuid()::text where unsubscribe_token is null;
alter table watch_subscriptions enable row level security;
-- Vkládání z prohlížeče (odeslání formuláře přes anon klíč) — jistota
drop policy if exists "verejne vkladani hlidani" on watch_subscriptions;
create policy "verejne vkladani hlidani"
  on watch_subscriptions for insert to anon with check (true);

-- ---------- Evidence už viděných příležitostí ----------
create table if not exists alert_seen (
  key         text primary key,       -- stabilní otisk příležitosti
  okres       text,
  type        text,
  place       text,
  price       integer,
  area        integer,
  lat         double precision,
  lng         double precision,
  url         text,
  first_seen  timestamptz not null default now()
);
create index if not exists alert_seen_okres_idx on alert_seen(okres);
create index if not exists alert_seen_first_idx on alert_seen(first_seen);
alter table alert_seen enable row level security;   -- čte/píše jen server (service_role)

-- ---------- 1) Přihlášení k hlídání (z formuláře) ----------
create or replace function subscribe_watch(p_email text, p_okres text, p_types text[] default '{}')
returns boolean language plpgsql security definer set search_path = public as $$
declare
  eml text := lower(trim(coalesce(p_email,'')));
  okr text := nullif(trim(coalesce(p_okres,'')),'');
begin
  if eml !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'neplatný e-mail';
  end if;
  -- Už existuje přihláška na stejný e-mail + okres? Jen ji oživíme a upravíme typy
  -- (neposíláme nové potvrzení). is not distinct from = správné i pro NULL okres.
  update watch_subscriptions
     set types = coalesce(p_types,'{}'), active = true
   where lower(email) = eml and okres is not distinct from okr;
  if not found then
    insert into watch_subscriptions(email, okres, types, active, confirmed, confirm_token)
    values (eml, okr, coalesce(p_types,'{}'), true, false, gen_random_uuid()::text);
  end if;
  return true;
end; $$;

-- ---------- 2) Potvrzení e-mailu ----------
create or replace function confirm_watch(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int; begin
  if coalesce(p_token,'') = '' then return false; end if;
  update watch_subscriptions
     set confirmed = true, confirm_token = null
   where confirm_token = p_token;
  get diagnostics n = row_count; return n > 0;
end; $$;

-- ---------- 3) Odhlášení ----------
create or replace function unsubscribe_watch(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int; begin
  if coalesce(p_token,'') = '' then return false; end if;
  update watch_subscriptions
     set active = false
   where unsubscribe_token = p_token;
  get diagnostics n = row_count; return n > 0;
end; $$;

-- Oprávnění: formulář i potvrzovací/odhlašovací odkaz běží z prohlížeče (anon)
grant execute on function subscribe_watch(text, text, text[]) to anon, authenticated;
grant execute on function confirm_watch(text) to anon, authenticated;
grant execute on function unsubscribe_watch(text) to anon, authenticated;
