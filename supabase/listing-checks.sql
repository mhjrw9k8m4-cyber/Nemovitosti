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
