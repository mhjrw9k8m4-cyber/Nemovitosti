-- =====================================================================
-- Parcelka — DOPLŇKY K EXISTUJÍCÍM POZEMKŮM (sítě a přístup)
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
--
-- U pozemků z veřejných zdrojů (dražby, exekuce…) nemáme sítě/přístup
-- ověřené. Tady je můžou doplnit lidé i majitel — ale:
--   * jen ze seznamu povolených hodnot (žádný volný text = žádné smyšleniny),
--   * na webu se to ukáže s poznámkou „uvádí uživatel · neověřeno".
-- Klíč (key) je stabilní otisk pozemku, který web spočítá z jeho údajů.
-- =====================================================================

create table if not exists opp_extras (
  key         text primary key,
  features    text[] default '{}',
  access      text,
  updated_at  timestamptz not null default now()
);
alter table opp_extras enable row level security;

-- Veřejné čtení (ať se doplňky ukážou na webu)
drop policy if exists "opp_extras read" on opp_extras;
create policy "opp_extras read" on opp_extras for select using (true);

-- Uložení/úprava doplňku (z prohlížeče, přes anon) — validuje hodnoty.
create or replace function set_opp_extra(p_key text, p_features text[], p_access text)
returns boolean language plpgsql security definer set search_path = public as $$
declare cf text[] := '{}'; ft text; ca text;
begin
  if coalesce(p_key,'') = '' or length(p_key) > 240 then return false; end if;
  if p_features is not null then
    foreach ft in array p_features loop
      if ft in ('Elektřina','Voda','Kanalizace','Plyn','Oplocení') and not (cf @> array[ft]) then
        cf := cf || ft;
      end if;
    end loop;
  end if;
  if p_access in ('Zpevněná cesta','Polní / nezpevněná cesta','Přes cizí pozemek','Bez přístupu') then
    ca := p_access;
  end if;
  insert into opp_extras(key, features, access, updated_at)
  values (p_key, cf, ca, now())
  on conflict (key) do update set features = excluded.features, access = excluded.access, updated_at = now();
  return true;
end; $$;

grant execute on function set_opp_extra(text, text[], text) to anon, authenticated;
