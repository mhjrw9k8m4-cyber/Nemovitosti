-- =====================================================================
-- Parcelka — CELÁ DATABÁZE V JEDNOM SOUBORU
--
-- Proč tenhle soubor vznikl: funkce create_listing existovala v repozitáři
-- v sedmi verzích, každá v jiném souboru a s jiným počtem parametrů. Nikde
-- nebylo zapsané, co už v databázi běží — a když v ní zůstane starší verze,
-- web ji volá se třinácti parametry, PostgREST žádnou takovou funkci
-- nenajde a přidání inzerátu skončí chybou 404, kterou uživatel vidí jen
-- jako „nepovedlo se".
--
-- Jak to použít:
--   Supabase → SQL Editor → New query → vložit CELÝ tento soubor → Run.
--
-- Je to bezpečné pustit i opakovaně: tabulky se zakládají přes
-- „if not exists", politiky se před vytvořením ruší a funkce se přepisují.
-- Nic se nemaže kromě zastaralých podob funkce create_listing hned na
-- začátku — ty musí pryč, jinak by u volání vznikla nejednoznačnost.
--
-- NEUPRAVUJ RUČNĚ. Vzniká z jednotlivých souborů v supabase/ příkazem
--   node scripts/build-sql.mjs
-- =====================================================================

-- Zastaralé podoby create_listing (10 a 11 parametrů). Když v databázi
-- zůstanou vedle nové, je volání nejednoznačné a PostgREST ho odmítne.
drop function if exists create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text);
drop function if exists create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb);


-- ---------------------------------------------------------------------
-- schema.sql — základní tabulky: listings, watch_subscriptions, payments, messages
-- ---------------------------------------------------------------------

-- Pozemkomat — návrh databáze (Postgres / Supabase).
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
-- Obsahuje tři tabulky: inzeráty, hlídání lokality, platby.

-- ============================================================
-- 1) INZERÁTY OD MAJITELŮ (sekce „Pozemky od lidí")
-- ============================================================
create table if not exists listings (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  -- pending = čeká na kontrolu, approved = na mapě, rejected = zamítnuto
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  place           text not null,          -- obec / lokalita
  okres           text not null,
  druh            text,                   -- druh pozemku (orná půda, zahrada…)
  parcel          text,                   -- parcelní číslo (nepovinné)
  area            integer,                -- výměra v m²
  price           integer,                -- cena v Kč
  lat             double precision,       -- souřadnice (doplní geokód)
  lng             double precision,
  description     text,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  photos          jsonb default '[]'::jsonb,  -- pole URL fotek
  -- zvýraznění (placené)
  featured        boolean not null default false,
  featured_until  timestamptz,            -- do kdy zvýraznění platí
  payment_id      uuid                    -- vazba na tabulku payments
);

create index if not exists listings_status_idx on listings(status);
create index if not exists listings_featured_idx on listings(featured);

-- ============================================================
-- 2) HLÍDÁNÍ LOKALITY (upozornění e-mailem)
-- ============================================================
create table if not exists watch_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  email              text not null,
  okres              text,               -- okres nebo obec, kterou hlídat
  types              text[] default '{}',-- které typy (sale, drazba, exekuce, obec); prázdné = vše
  active             boolean not null default true,
  -- dvojité potvrzení (double opt-in) — zákon vyžaduje souhlas
  confirmed          boolean not null default false,
  confirm_token      text,
  unsubscribe_token  text default gen_random_uuid()::text,
  last_notified_at   timestamptz
);

create index if not exists watch_email_idx on watch_subscriptions(email);
create index if not exists watch_active_idx on watch_subscriptions(active, confirmed);

-- ============================================================
-- 3) PLATBY (Stripe)
-- ============================================================
create table if not exists payments (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  stripe_session_id      text,
  stripe_payment_intent  text,
  amount                 integer,        -- v haléřích (29900 = 299 Kč)
  currency               text default 'czk',
  status                 text default 'pending', -- pending | paid | refunded
  email                  text,
  listing_ref            text,           -- reference na inzerát
  purpose                text default 'zvyrazneni'
);

-- ============================================================
-- BEZPEČNOST (Row Level Security)
-- Veřejnost smí ČÍST jen schválené inzeráty. Zápis jde jen přes server
-- (service_role klíč v serverových funkcích), ne z prohlížeče.
-- ============================================================
alter table listings enable row level security;
alter table watch_subscriptions enable row level security;
alter table payments enable row level security;

-- Veřejné čtení jen schválených inzerátů
drop policy if exists "verejne cteni schvalenych" on listings;
create policy "verejne cteni schvalenych"
  on listings for select
  using (status = 'approved');

-- watch_subscriptions a payments: čtení jen přes server (service_role, obchází RLS).
-- Vkládání z prohlížeče (odeslání formuláře) povolíme níže.

-- ============================================================
-- 4) ZPRÁVY Z FORMULÁŘŮ (kontakt, zpětná vazba, nahlášení)
-- ============================================================
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  kind        text,        -- 'kontakt' | 'zpetna_vazba' | 'nahlaseni'
  name        text,
  email       text,
  org         text,
  okres       text,
  message     text
);
alter table messages enable row level security;

-- ============================================================
-- VEŘEJNÉ VKLÁDÁNÍ Z PROHLÍŽEČE (odeslání formuláře přes anon klíč)
-- Návštěvník smí jen VLOŽIT (odeslat), ne číst cizí data. Čtení má jen
-- majitel v Supabase (service_role / přihlášený do dashboardu).
-- ============================================================
drop policy if exists "verejne vkladani zprav" on messages;
create policy "verejne vkladani zprav"
  on messages for insert to anon with check (true);

drop policy if exists "verejne vkladani hlidani" on watch_subscriptions;
create policy "verejne vkladani hlidani"
  on watch_subscriptions for insert to anon with check (true);


-- ---------------------------------------------------------------------
-- messaging.sql — zprávy mezi zájemcem a majitelem
-- ---------------------------------------------------------------------

-- =====================================================================
-- Parcelka — PSANÍ V APLIKACI (chat kupující ⇄ prodejce)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- Princip: zpráva se váže na inzerát (listings.id). „Vlákno" = dvojice
--   (inzerát, kupující). Majitel inzerátu je vždy listings.user_id.
--   Nikdo nevidí e-mail ani telefon toho druhého — jen si píší v appce.
--   Číst smí jen účastník (kupující daného vlákna nebo majitel inzerátu).
--   Psát jde jen přes funkci send_message (bezpečně určí, kdo je příjemce).
-- =====================================================================

create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  listing_id  uuid not null references listings(id) on delete cascade,
  buyer_id    uuid not null,          -- ta strana, která NENÍ majitel (klíč vlákna)
  sender_id   uuid not null,          -- kdo zprávu napsal (kupující nebo majitel)
  body        text not null,
  read_at     timestamptz
);
create index if not exists chat_listing_buyer_idx on chat_messages(listing_id, buyer_id);
create index if not exists chat_buyer_idx on chat_messages(buyer_id);
alter table chat_messages enable row level security;

-- Číst smí jen účastník: kupující vlákna, nebo majitel inzerátu.
drop policy if exists "chat select ucastnik" on chat_messages;
create policy "chat select ucastnik" on chat_messages for select to authenticated
using (
  auth.uid() = buyer_id
  or auth.uid() = (select l.user_id from listings l where l.id = chat_messages.listing_id)
);
-- Přímý zápis z prohlížeče zakázán — jen přes send_message (žádná insert policy).

-- Odeslat zprávu. Kupující píše majiteli; majitel odpovídá konkrétnímu kupujícímu.
create or replace function send_message(p_listing uuid, p_buyer uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); owner uuid; the_buyer uuid; mid uuid;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if p_body is null or length(trim(p_body)) = 0 then raise exception 'zpráva je prázdná'; end if;
  if length(p_body) > 2000 then raise exception 'zpráva je příliš dlouhá'; end if;
  select user_id into owner from listings where id = p_listing;
  if owner is null then raise exception 'inzerát neexistuje'; end if;

  if uid = owner then
    -- Majitel odpovídá → příjemcem je zvolený kupující (musí mít s ním vlákno)
    the_buyer := p_buyer;
    if the_buyer is null then raise exception 'komu odpovídáte?'; end if;
    if not exists (select 1 from chat_messages m where m.listing_id = p_listing and m.buyer_id = the_buyer) then
      raise exception 's tímto zájemcem zatím žádná zpráva není';
    end if;
  else
    -- Kupující píše (nebo odpovídá) → vlákno je (inzerát, on sám)
    the_buyer := uid;
  end if;

  -- Jemná ochrana proti spamu: max 1 zpráva za 3 s, max 40 zpráv/hodinu na účet
  if exists (select 1 from chat_messages where sender_id = uid and created_at > now() - interval '3 seconds') then
    raise exception 'chvíli počkejte';
  end if;
  if (select count(*) from chat_messages where sender_id = uid and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'příliš mnoho zpráv, zkuste to za chvíli';
  end if;

  insert into chat_messages(listing_id, buyer_id, sender_id, body)
  values (p_listing, the_buyer, uid, trim(p_body))
  returning id into mid;
  return mid;
end; $$;
grant execute on function send_message(uuid, uuid, text) to authenticated;

-- Moje vlákna (schránka): pro každé vlákno poslední zpráva + počet nepřečtených.
create or replace function my_threads()
returns table(
  listing_id uuid, buyer_id uuid, place text, okres text,
  is_owner boolean, last_body text, last_at timestamptz, unread integer
)
language sql security definer set search_path = public as $$
  with mine as (
    select distinct m.listing_id, m.buyer_id
    from chat_messages m
    join listings l on l.id = m.listing_id
    where m.buyer_id = auth.uid() or l.user_id = auth.uid()
  )
  select mine.listing_id, mine.buyer_id, l.place, l.okres,
    (l.user_id = auth.uid()) as is_owner,
    (select body from chat_messages x where x.listing_id = mine.listing_id and x.buyer_id = mine.buyer_id order by x.created_at desc limit 1) as last_body,
    (select created_at from chat_messages x where x.listing_id = mine.listing_id and x.buyer_id = mine.buyer_id order by x.created_at desc limit 1) as last_at,
    (select count(*) from chat_messages x where x.listing_id = mine.listing_id and x.buyer_id = mine.buyer_id and x.sender_id <> auth.uid() and x.read_at is null)::int as unread
  from mine join listings l on l.id = mine.listing_id
  order by last_at desc;
$$;
grant execute on function my_threads() to authenticated;

-- Zprávy jednoho vlákna (a rovnou označí došlé jako přečtené).
create or replace function thread_messages(p_listing uuid, p_buyer uuid)
returns table(id uuid, created_at timestamptz, sender_id uuid, body text, mine boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := auth.uid(); owner uuid;
begin
  select user_id into owner from listings where id = p_listing;
  if uid is null or (uid <> p_buyer and uid <> owner) then
    raise exception 'nemáte přístup k této konverzaci';
  end if;
  update chat_messages m set read_at = now()
    where m.listing_id = p_listing and m.buyer_id = p_buyer and m.sender_id <> uid and m.read_at is null;
  return query
    select m.id, m.created_at, m.sender_id, m.body, (m.sender_id = uid) as mine
    from chat_messages m
    where m.listing_id = p_listing and m.buyer_id = p_buyer
    order by m.created_at asc;
end; $$;
grant execute on function thread_messages(uuid, uuid) to authenticated;

-- Kolik mám celkem nepřečtených (pro odznak v menu).
create or replace function unread_count()
returns integer language sql security definer set search_path = public as $$
  select coalesce(count(*),0)::int from chat_messages m
  join listings l on l.id = m.listing_id
  where m.read_at is null and m.sender_id <> auth.uid()
    and (m.buyer_id = auth.uid() or l.user_id = auth.uid());
$$;
grant execute on function unread_count() to authenticated;


-- ---------------------------------------------------------------------
-- messaging-fix.sql — oprava chatu a úklid
-- ---------------------------------------------------------------------

-- =====================================================================
-- Parcelka — OPRAVA chatu + úklid. Spustit jednou: Supabase → SQL Editor.
-- Řeší nálezy z automatického testu:
--   1) thread_messages padalo na dvojznačnosti názvů sloupců (#variable_conflict)
--   2) delete_listing(p_id) pro přihlášeného majitele nebylo nasazené
--      (kvůli tomu nešlo smazat inzerát v profilu ani uklidit test)
--   3) smaže zkušební inzeráty „ZKUŠEBNÍ …", které vytvořil test
-- =====================================================================

-- 1) Oprava čtení konverzace
create or replace function thread_messages(p_listing uuid, p_buyer uuid)
returns table(id uuid, created_at timestamptz, sender_id uuid, body text, mine boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := auth.uid(); owner uuid;
begin
  select user_id into owner from listings where id = p_listing;
  if uid is null or (uid <> p_buyer and uid <> owner) then
    raise exception 'nemáte přístup k této konverzaci';
  end if;
  update chat_messages m set read_at = now()
    where m.listing_id = p_listing and m.buyer_id = p_buyer and m.sender_id <> uid and m.read_at is null;
  return query
    select m.id, m.created_at, m.sender_id, m.body, (m.sender_id = uid) as mine
    from chat_messages m
    where m.listing_id = p_listing and m.buyer_id = p_buyer
    order by m.created_at asc;
end; $$;
grant execute on function thread_messages(uuid, uuid) to authenticated;

-- 2) Mazání inzerátu přihlášeným majitelem (chybělo → nešlo mazat v profilu)
create or replace function delete_listing(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int; begin
  delete from listings where id = p_id and user_id = auth.uid();
  get diagnostics n = row_count; return n > 0; end; $$;
grant execute on function delete_listing(uuid) to authenticated;

-- 3) Úklid zkušebních inzerátů z testu (kaskádou zmizí i jejich zprávy)
delete from listings where place like 'ZKUŠEBNÍ %';


-- ---------------------------------------------------------------------
-- saved-searches.sql — uložená hledání
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- watch-alerts.sql — hlídání lokality (double opt-in) + tabulka alert_seen
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- listings-autopublish.sql — automatické zveřejnění inzerátu + token na úpravy
-- ---------------------------------------------------------------------

-- =====================================================================
-- Parcelka — SAMOOBSLUHA INZERÁTŮ (automatické zveřejnění na mapě)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- Model (jako Bazoš): uživatel vloží inzerát → HNED je na mapě jako
-- „Od majitele". Dostane tajný token → přes něj vidí svůj inzerát,
-- počet zhlédnutí a může ho smazat. Bez přihlašování.
--
-- Bezpečnost: přístup jde JEN přes funkce (RPC) níže. Token se vrací
-- jen tomu, kdo inzerát vytvořil; veřejný seznam token ani e-mail
-- neprozradí.
-- =====================================================================

-- Rozšíření tabulky listings (tabulka už existuje ze schema.sql)
alter table listings add column if not exists token uuid not null default gen_random_uuid();
alter table listings add column if not exists views integer not null default 0;

-- RLS zapnuté, ŽÁDNÉ přímé policy pro anon — vše přes funkce (security definer)
alter table listings enable row level security;

-- 1) Vytvoření inzerátu → vrátí id + token (token = klíč pro majitele)
create or replace function create_listing(
  p_place text, p_okres text, p_druh text, p_parcel text,
  p_area integer, p_price integer,
  p_lat double precision, p_lng double precision,
  p_description text, p_contact text
) returns table(id uuid, token uuid)
language plpgsql security definer set search_path = public as $$
declare new_id uuid; new_token uuid;
begin
  -- základní pojistky
  if p_place is null or length(trim(p_place)) = 0 then
    raise exception 'obec je povinná';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'poloha je povinná';
  end if;

  insert into listings(status, place, okres, druh, parcel, area, price, lat, lng,
                       description, contact_phone, featured, views)
  values('approved', trim(p_place), nullif(trim(coalesce(p_okres,'')),''),
         nullif(trim(coalesce(p_druh,'')),''), nullif(trim(coalesce(p_parcel,'')),''),
         p_area, p_price, p_lat, p_lng,
         nullif(trim(coalesce(p_description,'')),''), nullif(trim(coalesce(p_contact,'')),''),
         false, 0)
  returning listings.id, listings.token into new_id, new_token;

  return query select new_id, new_token;
end; $$;

-- 2) Veřejný seznam pro mapu (BEZ tokenu — token se nikdy neprozradí)
create or replace function public_listings()
returns table(id uuid, place text, okres text, druh text, parcel text,
              area integer, price integer, lat double precision, lng double precision,
              description text, contact text, views integer, created_at timestamptz)
language sql security definer set search_path = public as $$
  select id, place, okres, druh, parcel, area, price, lat, lng,
         description, contact_phone, views, created_at
  from listings
  where status = 'approved'
  order by created_at desc;
$$;

-- 3) Můj inzerát podle tokenu (majitel vidí stav + zhlédnutí)
create or replace function my_listing(p_id uuid, p_token uuid)
returns table(id uuid, place text, okres text, area integer, price integer,
              views integer, status text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select id, place, okres, area, price, views, status, created_at
  from listings
  where id = p_id and token = p_token;
$$;

-- 4) Smazání vlastního inzerátu (jen se správným tokenem)
create or replace function delete_listing(p_id uuid, p_token uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from listings where id = p_id and token = p_token;
  get diagnostics n = row_count;
  return n > 0;
end; $$;

-- 5) Započítání zhlédnutí (když někdo otevře detail)
create or replace function bump_view(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update listings set views = views + 1 where id = p_id and status = 'approved';
end; $$;

-- Povolit anonymnímu (webovému) klíči volat tyto funkce
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text) to anon;
grant execute on function public_listings() to anon;
grant execute on function my_listing(uuid,uuid) to anon;
grant execute on function delete_listing(uuid,uuid) to anon;
grant execute on function bump_view(uuid) to anon;


-- ---------------------------------------------------------------------
-- listings-auth.sql — inzeráty pod účtem (user_id), my_listings, public_listings
-- ---------------------------------------------------------------------

-- =====================================================================
-- Parcelka — INZERÁTY S PŘIHLÁŠENÍM (ochrana proti spamu)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
-- Nahrazuje předchozí token model — inzeráty jsou nově vázané na účet
-- (auth.users). Přidat/smazat smí jen přihlášený vlastník.
--
-- DŮLEŽITÉ nastavení Supabase (jednou):
--   Authentication → Sign In / Providers → Email → povolené,
--   a pro hladký start klidně VYPNOUT „Confirm email" (Authentication →
--   Providers → Email → Confirm email = OFF). Pak se lidé přihlásí hned.
-- =====================================================================

alter table listings add column if not exists user_id uuid;
alter table listings add column if not exists token uuid;   -- ponecháno kvůli starým datům
alter table listings add column if not exists views integer not null default 0;
alter table listings enable row level security;

-- Vytvoření inzerátu — POUZE pro přihlášeného (auth.uid()); přiřadí se mu.
create or replace function create_listing(
  p_place text, p_okres text, p_druh text, p_parcel text,
  p_area integer, p_price integer, p_lat double precision, p_lng double precision,
  p_description text, p_contact text)
returns table(id uuid)
language plpgsql security definer set search_path = public as $$
declare new_id uuid; uid uuid := auth.uid();
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
  insert into listings(status,user_id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,featured,views)
  values('approved',uid,trim(p_place),nullif(trim(coalesce(p_okres,'')),''),nullif(trim(coalesce(p_druh,'')),''),
         nullif(trim(coalesce(p_parcel,'')),''),p_area,p_price,p_lat,p_lng,
         nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_contact,'')),''),false,0)
  returning listings.id into new_id;
  return query select new_id;
end; $$;

-- Veřejný seznam pro mapu (beze změny — bez osobních klíčů)
create or replace function public_listings()
returns table(id uuid,place text,okres text,druh text,parcel text,area integer,price integer,
              lat double precision,lng double precision,description text,contact text,views integer,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,views,created_at
  from listings where status='approved' order by created_at desc; $$;

-- Moje inzeráty (všechny, které patří přihlášenému uživateli)
create or replace function my_listings()
returns table(id uuid,place text,okres text,area integer,price integer,views integer,status text,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,area,price,views,status,created_at
  from listings where user_id = auth.uid() order by created_at desc; $$;

-- Smazání vlastního inzerátu (jen vlastník)
create or replace function delete_listing(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int; begin
  delete from listings where id=p_id and user_id=auth.uid();
  get diagnostics n=row_count; return n>0; end; $$;

-- Započítání zhlédnutí
create or replace function bump_view(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin update listings set views=views+1 where id=p_id and status='approved'; end; $$;

-- Oprávnění: veřejné čtení pro anon, vytváření/správa pro přihlášené
grant execute on function public_listings() to anon, authenticated;
grant execute on function bump_view(uuid) to anon, authenticated;
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text) to authenticated;
grant execute on function my_listings() to authenticated;
grant execute on function delete_listing(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- listings-photos.sql — fotky u inzerátu
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- listings-features.sql — vybavení pozemku a přístup
-- ---------------------------------------------------------------------

-- =====================================================================
-- Parcelka — VYBAVENÍ POZEMKU (sítě, oplocení, přístup) v inzerátu
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- Přidá k inzerátu údaje, které kupující řeší jako první:
--   features = pole (Elektřina, Voda, Kanalizace, Plyn, Oplocení)
--   access   = přístup k pozemku (zpevněná cesta, polní cesta…)
-- create_listing je začne ukládat (jen povolené hodnoty — bez smyšlenin),
-- public_listings/my_listings je začnou vracet, aby se zobrazily na webu.
-- =====================================================================

alter table listings add column if not exists features text[] default '{}';
alter table listings add column if not exists access text;

-- Měníme signaturu / návratový typ → nejdřív zahodit staré verze
drop function if exists create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb);
drop function if exists public_listings();
drop function if exists my_listings();

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
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if p_place is null or length(trim(p_place))=0 then raise exception 'obec je povinná'; end if;
  if p_lat is null or p_lng is null then raise exception 'poloha je povinná'; end if;
  if (coalesce(p_place,'') || ' ' || coalesce(p_description,'') || ' ' || coalesce(p_parcel,''))
       ~* '(kokot|kurv|piča|\mmrd|debil|čur[aá]k|zmrd|\mjeb|hovn)' then
    raise exception 'obsah obsahuje nevhodná slova';
  end if;
  if (select count(*) from listings where user_id = uid) >= 30 then
    raise exception 'dosažen limit inzerátů na účet (30)';
  end if;
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

  -- Vybavení: přijmi jen povolené hodnoty (žádné smyšleniny)
  if p_features is not null then
    foreach ft in array p_features loop
      if ft in ('Elektřina','Voda','Kanalizace','Plyn','Oplocení')
         and not (clean_features @> array[ft]) then
        clean_features := clean_features || ft;
      end if;
    end loop;
  end if;
  -- Přístup: jen povolené hodnoty
  if p_access in ('Zpevněná cesta','Polní / nezpevněná cesta','Přes cizí pozemek','Bez přístupu') then
    clean_access := p_access;
  end if;

  insert into listings(status,user_id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,photos,features,access,featured,views)
  values('approved',uid,trim(p_place),nullif(trim(coalesce(p_okres,'')),''),nullif(trim(coalesce(p_druh,'')),''),
         nullif(trim(coalesce(p_parcel,'')),''),p_area,p_price,p_lat,p_lng,
         nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_contact,'')),''),
         clean_photos,clean_features,clean_access,false,0)
  returning listings.id into new_id;
  return query select new_id;
end; $$;

create or replace function public_listings()
returns table(id uuid,place text,okres text,druh text,parcel text,area integer,price integer,
              lat double precision,lng double precision,description text,contact text,
              photos jsonb,features text[],access text,views integer,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,
         coalesce(photos,'[]'::jsonb),coalesce(features,'{}'),access,views,created_at
  from listings where status='approved' order by created_at desc; $$;

create or replace function my_listings()
returns table(id uuid,place text,okres text,area integer,price integer,
              photos jsonb,features text[],access text,views integer,status text,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,area,price,coalesce(photos,'[]'::jsonb),coalesce(features,'{}'),access,views,status,created_at
  from listings where user_id = auth.uid() order by created_at desc; $$;

grant execute on function public_listings() to anon, authenticated;
grant execute on function my_listings() to authenticated;
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb,text[],text) to authenticated;


-- ---------------------------------------------------------------------
-- listings-moderation.sql — přísnější moderace obsahu
-- ---------------------------------------------------------------------

-- =====================================================================
-- Parcelka — PŘÍSNĚJŠÍ MODERACE INZERÁTŮ (server). Spustit jednou:
-- Supabase → SQL Editor → vložit → Run.
--
-- Co mění oproti dřívějšku (create_listing z listings-features.sql):
--   1) LIMIT inzerátů na účet: 30 → 10 (proti spamu; klidně změň číslo níže).
--   2) Silnější filtr NEVHODNÝCH slov + zjevného SPAMU (nejde obejít z prohlížeče).
--   Vše ostatní (fotky jen z našeho úložiště, whitelist sítí/přístupu, cooldown)
--   zůstává. Podpisová (signatura) funkce se nemění → stačí CREATE OR REPLACE.
-- =====================================================================

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
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if p_place is null or length(trim(p_place))=0 then raise exception 'obec je povinná'; end if;
  if p_lat is null or p_lng is null then raise exception 'poloha je povinná'; end if;

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

  -- Limit proti spamu: max 10 inzerátů na účet (změň číslo dle potřeby).
  if (select count(*) from listings where user_id = uid) >= 10 then
    raise exception 'dosažen limit inzerátů na účet (10)';
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

  -- Vybavení: jen povolené hodnoty (žádné smyšleniny)
  if p_features is not null then
    foreach ft in array p_features loop
      if ft in ('Elektřina','Voda','Kanalizace','Plyn','Oplocení')
         and not (clean_features @> array[ft]) then
        clean_features := clean_features || ft;
      end if;
    end loop;
  end if;
  -- Přístup: jen povolené hodnoty
  if p_access in ('Zpevněná cesta','Polní / nezpevněná cesta','Přes cizí pozemek','Bez přístupu') then
    clean_access := p_access;
  end if;

  insert into listings(status,user_id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,photos,features,access,featured,views)
  values('approved',uid,trim(p_place),nullif(trim(coalesce(p_okres,'')),''),nullif(trim(coalesce(p_druh,'')),''),
         nullif(trim(coalesce(p_parcel,'')),''),p_area,p_price,p_lat,p_lng,
         nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_contact,'')),''),
         clean_photos,clean_features,clean_access,false,0)
  returning listings.id into new_id;
  return query select new_id;
end; $$;

grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb,text[],text) to authenticated;

-- Kolik inzerátů mi zbývá (pro hezký ukazatel na webu). 10 = limit výše.
create or replace function my_listing_quota()
returns table(used integer, max integer)
language sql security definer set search_path = public as $$
  select (select count(*)::integer from listings where user_id = auth.uid()), 10;
$$;
grant execute on function my_listing_quota() to authenticated;


-- ---------------------------------------------------------------------
-- listings-tiers.sql — limity počtu inzerátů podle účtu (account_tier)
-- ---------------------------------------------------------------------

-- =====================================================================
-- Parcelka — ÚROVNĚ ÚČTU (free vs. placený limit inzerátů)
-- Spustit jednou: Supabase → SQL Editor → vložit → Run.
--
-- Model:
--   • FREE (výchozí) = 1 inzerát na účet.
--   • PLACENÝ        = až 20 inzerátů (účet je v tabulce account_tier).
--
-- Bezpečné: běžný uživatel si úroveň NEMŮŽE sám nastavit (žádná RLS policy),
-- placený účet přidává majitel v Supabase (Table Editor) nebo přes service role.
-- Online placení (karta) = samostatný krok (platební brána) — tohle je logika limitu.
-- =====================================================================

create table if not exists account_tier (
  user_id      uuid primary key,
  max_listings integer not null default 20,
  granted_at   timestamptz not null default now(),
  note         text                      -- např. „zaplaceno 20.3.2026, faktura 2026-014"
);
alter table account_tier enable row level security;
-- ZÁMĚRNĚ žádná policy → přes anon/authenticated klíč nejde číst ani zapisovat.
-- Řídí to jen majitel (service role / Table Editor). create_listing níže čte
-- tabulku jako security definer, takže limit funguje i bez policy.

-- Kolik inzerátů smí přihlášený uživatel (placený tier, jinak 1).
create or replace function my_limit()
returns integer language sql security definer set search_path = public stable as $$
  select coalesce((select max_listings from account_tier where user_id = auth.uid()), 1);
$$;
grant execute on function my_limit() to authenticated;

-- create_listing s odstupňovaným limitem (free 1 / placený až 20).
-- Vše ostatní (moderace textu, fotky jen z našeho úložiště, whitelist sítí/přístupu,
-- cooldown 90 s) zůstává jako v listings-moderation.sql.
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
  lim integer;
  clean_photos jsonb := '[]'::jsonb;
  clean_features text[] := '{}';
  clean_access text;
  ph text;
  ft text;
  ok_prefix text;
  blob text;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if p_place is null or length(trim(p_place))=0 then raise exception 'obec je povinná'; end if;
  if p_lat is null or p_lng is null then raise exception 'poloha je povinná'; end if;

  -- Moderace obsahu (nejde obejít z prohlížeče)
  blob := lower(coalesce(p_place,'') || ' ' || coalesce(p_description,'') || ' ' || coalesce(p_parcel,''));
  if blob ~ '(kokot|kurv|piča|píčovin|picovin|\mmrd|debil|čur[aá]k|čůr|zmrd|\mjeb|hovn|hajzl|zkur|prdel|hovado|\midiot|blb[eě]c|porno|penis|vagin)' then
    raise exception 'obsah obsahuje nevhodná slova';
  end if;
  if blob ~ '(viagra|casino|kasino|bitcoin|\mcrypto|klikni zde|výhr[aou]|vyhr[aou]j)' then
    raise exception 'obsah vypadá jako spam';
  end if;
  if blob ~ '(.)\1{6,}' then
    raise exception 'obsah vypadá jako spam';
  end if;

  -- Limit dle úrovně účtu: placený tier, jinak 1 (free)
  lim := coalesce((select max_listings from account_tier where user_id = uid), 1);
  if (select count(*) from listings where user_id = uid) >= lim then
    raise exception 'dosažen limit inzerátů na účet (limit %)', lim;
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

  -- Vybavení: jen povolené hodnoty
  if p_features is not null then
    foreach ft in array p_features loop
      if ft in ('Elektřina','Voda','Kanalizace','Plyn','Oplocení')
         and not (clean_features @> array[ft]) then
        clean_features := clean_features || ft;
      end if;
    end loop;
  end if;
  if p_access in ('Zpevněná cesta','Polní / nezpevněná cesta','Přes cizí pozemek','Bez přístupu') then
    clean_access := p_access;
  end if;

  insert into listings(status,user_id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,photos,features,access,featured,views)
  values('approved',uid,trim(p_place),nullif(trim(coalesce(p_okres,'')),''),nullif(trim(coalesce(p_druh,'')),''),
         nullif(trim(coalesce(p_parcel,'')),''),p_area,p_price,p_lat,p_lng,
         nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_contact,'')),''),
         clean_photos,clean_features,clean_access,false,0)
  returning listings.id into new_id;
  return query select new_id;
end; $$;
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb,text[],text) to authenticated;

-- Kvóta pro web: kolik mám a kolik smím (1 free / až 20 placený).
create or replace function my_listing_quota()
returns table(used integer, max integer)
language sql security definer set search_path = public as $$
  select (select count(*)::integer from listings where user_id = auth.uid()),
         coalesce((select max_listings from account_tier where user_id = auth.uid()), 1);
$$;
grant execute on function my_listing_quota() to authenticated;

-- =====================================================================
-- JAK ZAPNOUT PLACENÝ ÚČET (dokud nemáme platební bránu):
-- V Supabase → SQL Editor spusť (nahraď e-mail za e-mail zákazníka):
--
--   insert into account_tier (user_id, max_listings, note)
--   select id, 20, 'zaplaceno' from auth.users where email = 'zakaznik@email.cz'
--   on conflict (user_id) do update set max_listings = 20, note = 'zaplaceno';
--
-- Zpět na free: delete from account_tier where user_id =
--   (select id from auth.users where email = 'zakaznik@email.cz');
-- =====================================================================


-- ---------------------------------------------------------------------
-- listings-rekonstrukce.sql — poslední verze create_listing — tu volá web
-- ---------------------------------------------------------------------

-- =====================================================================
-- Parcelka — přidání volby „Stavba k rekonstrukci" k inzerátům.
-- Spustit jednou: Supabase → SQL Editor → vložit → Run.
-- (Navazuje na listings-tiers.sql — jen rozšiřuje whitelist vybavení
--  o „Stavba k rekonstrukci". Vše ostatní zůstává stejné.)
-- =====================================================================

create or replace function create_listing(
  p_place text, p_okres text, p_druh text, p_parcel text,
  p_area integer, p_price integer, p_lat double precision, p_lng double precision,
  p_description text, p_contact text, p_photos jsonb default '[]'::jsonb,
  p_features text[] default '{}', p_access text default null)
returns table(id uuid)
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid; uid uuid := auth.uid(); lim integer;
  clean_photos jsonb := '[]'::jsonb; clean_features text[] := '{}'; clean_access text;
  ph text; ft text; ok_prefix text; blob text;
begin
  if uid is null then raise exception 'musíte být přihlášeni'; end if;
  if p_place is null or length(trim(p_place))=0 then raise exception 'obec je povinná'; end if;
  if p_lat is null or p_lng is null then raise exception 'poloha je povinná'; end if;
  blob := lower(coalesce(p_place,'') || ' ' || coalesce(p_description,'') || ' ' || coalesce(p_parcel,''));
  if blob ~ '(kokot|kurv|piča|píčovin|picovin|\mmrd|debil|čur[aá]k|čůr|zmrd|\mjeb|hovn|hajzl|zkur|prdel|hovado|\midiot|blb[eě]c|porno|penis|vagin)' then
    raise exception 'obsah obsahuje nevhodná slova'; end if;
  if blob ~ '(viagra|casino|kasino|bitcoin|\mcrypto|klikni zde|výhr[aou]|vyhr[aou]j)' then
    raise exception 'obsah vypadá jako spam'; end if;
  if blob ~ '(.)\1{6,}' then raise exception 'obsah vypadá jako spam'; end if;

  -- Meze čísel a délek. Prohlížeč je hlídá taky (js/kontrola.js), ale tam je
  -- kdokoli obejde — tohle je ta tvrdá hranice. Čísla musí sedět s MEZE
  -- v js/kontrola.js; když se mění, mění se na obou místech.
  if p_area is null or p_area < 10 or p_area > 5000000 then
    raise exception 'výměra musí být mezi 10 m² a 500 ha'; end if;
  if p_price is null or p_price < 1000 or p_price > 500000000 then
    raise exception 'cena musí být mezi 1 000 Kč a 500 mil. Kč'; end if;
  if p_price::numeric / p_area < 1 or p_price::numeric / p_area > 100000 then
    raise exception 'cena za m² je mimo reálné rozpětí — zkontrolujte cenu a výměru'; end if;
  if length(trim(p_place)) < 2 or length(trim(p_place)) > 60 then
    raise exception 'název obce musí mít 2 až 60 znaků'; end if;
  if p_description is not null and length(p_description) > 2000 then
    raise exception 'popis je delší než 2000 znaků'; end if;
  if p_description ~ '[<>]' then
    raise exception 'popis nesmí obsahovat značky < a >'; end if;
  if p_parcel is not null and length(trim(p_parcel)) > 20 then
    raise exception 'parcelní číslo je moc dlouhé'; end if;
  -- Kontakt: buď e-mail, nebo aspoň devět číslic. Bez něj je inzerát k ničemu.
  if p_contact is null or not (
       p_contact ~ '^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$'
       or length(regexp_replace(p_contact, '[^0-9]', '', 'g')) between 9 and 13
     ) then
    raise exception 'kontakt musí být platný telefon nebo e-mail'; end if;

  lim := coalesce((select max_listings from account_tier where user_id = uid), 1);
  if (select count(*) from listings where user_id = uid) >= lim then
    raise exception 'dosažen limit inzerátů na účet (limit %)', lim; end if;
  if exists (select 1 from listings where user_id = uid and created_at > now() - interval '90 seconds') then
    raise exception 'chvíli počkejte před přidáním dalšího inzerátu'; end if;
  if p_photos is not null and jsonb_typeof(p_photos) = 'array' then
    for ph in select value::text from jsonb_array_elements_text(p_photos) loop
      ok_prefix := '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/listing-photos/';
      if ph ~ ok_prefix and length(ph) < 500 then clean_photos := clean_photos || to_jsonb(ph); end if;
      exit when jsonb_array_length(clean_photos) >= 8;
    end loop; end if;
  -- Whitelist vybavení — NOVĚ i „Stavba k rekonstrukci"
  if p_features is not null then
    foreach ft in array p_features loop
      if ft in ('Elektřina','Voda','Kanalizace','Plyn','Oplocení','Stavba k rekonstrukci')
         and not (clean_features @> array[ft]) then
        clean_features := clean_features || ft; end if;
    end loop; end if;
  if p_access in ('Zpevněná cesta','Polní / nezpevněná cesta','Přes cizí pozemek','Bez přístupu') then
    clean_access := p_access; end if;
  insert into listings(status,user_id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,photos,features,access,featured,views)
  values('approved',uid,trim(p_place),nullif(trim(coalesce(p_okres,'')),''),nullif(trim(coalesce(p_druh,'')),''),
         nullif(trim(coalesce(p_parcel,'')),''),p_area,p_price,p_lat,p_lng,
         nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_contact,'')),''),
         clean_photos,clean_features,clean_access,false,0)
  returning listings.id into new_id;
  return query select new_id;
end; $$;
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb,text[],text) to authenticated;


-- ---------------------------------------------------------------------
-- listing-checks.sql — výsledky pravidelné kontroly odkazů a fotek
-- ---------------------------------------------------------------------

-- =====================================================================
-- Parcelka — výsledky pravidelné kontroly inzerátů.
-- Spustit jednou: Supabase → SQL Editor → vložit → Run.
-- (Je součástí supabase/00-vse.sql, takže kdo pustil ten, má i tohle.)
--
-- Co se sem zapisuje: co našel scripts/kontrola-inzeratu.mjs, když
-- několikrát po sobě zkusil odkaz inzerátu a jeho fotky. Nic to nemaže
-- ani neskrývá — jen to eviduje, rozhodnutí zůstává na člověku.
-- =====================================================================

create table if not exists listing_checks (
  listing_id   uuid primary key references listings(id) on delete cascade,
  checked_at   timestamptz not null default now(),
  ok           boolean not null default true,
  -- co se našlo: [{typ:'odkaz'|'fotka', stav:'mrtvy'|'presmerovan'|…, msg:'…'}]
  nalezy       jsonb not null default '[]'::jsonb,
  -- otisky fotek (perceptuální hash) — podle nich se poznají kopie
  otisky       jsonb not null default '[]'::jsonb
);

create index if not exists listing_checks_ok_idx on listing_checks(ok);
create index if not exists listing_checks_time_idx on listing_checks(checked_at desc);

-- Čte a píše jen server (service_role, který obchází RLS). Veřejně nic:
-- návštěvníkovi je do výsledků kontroly nic, a majitel inzerátu se
-- o problému dozví jinak než čtením cizí tabulky.
alter table listing_checks enable row level security;
drop policy if exists "verejne cteni kontrol" on listing_checks;

comment on table listing_checks is
  'Výsledky pravidelné kontroly odkazů a fotek u zveřejněných inzerátů (scripts/kontrola-inzeratu.mjs).';
