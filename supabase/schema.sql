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

-- watch_subscriptions a payments: žádný veřejný přístup (jen server přes service_role,
-- který RLS obchází). Proto zde záměrně nejsou policy pro anon.
