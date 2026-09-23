-- =====================================================================
-- Parcelka — VÝSLEDEK NOČNÍ KONTROLY SE UKÁŽE MAJITELI INZERÁTU
-- Spustit jednou: Supabase → SQL Editor → vložit → Run.
-- (Je součástí supabase/00-vse.sql, takže kdo pustil ten, má i tohle.)
--
-- Proč to vzniklo: každou noc projde scripts/kontrola-inzeratu.mjs
-- zveřejněné inzeráty, zkusí u každého odkaz a fotky (třikrát za sebou,
-- aby jeden výpadek sítě nic neodsoudil) a výsledek zapíše do tabulky
-- listing_checks. Ta kontrola schválně nic nemaže ani neskrývá —
-- „rozhodnutí zůstává na člověku".
--
-- Jenže ten člověk se to neměl jak dozvědět. Výsledky nečetla ŽÁDNÁ
-- stránka: ani web, ani „moje inzeráty", nic. Kontrola tedy každou noc
-- běžela, spotřebovala čas a zapsala řádky, na které se nikdo nikdy
-- nepodíval. To je fakticky vypnutá funkce, jen dráž.
--
-- Tenhle soubor to spojuje: my_listings() vrací navíc, jestli u inzerátu
-- něco vázne a co přesně. Dostane se to tím k majiteli — k jedinému
-- člověku, který s tím může něco udělat (vyměnit fotku, opravit odkaz).
-- Veřejný seznam public_listings() se NEMĚNÍ: do výsledků kontroly
-- cizího inzerátu nikomu nic není.
-- =====================================================================

-- PostgreSQL nedovolí „create or replace", když se mění NÁVRATOVÝ TYP
-- („cannot change return type of existing function") — a tady přibývají
-- tři sloupce. Bez tohohle drop by celý skript v SQL Editoru spadl
-- a nikdo by se nedozvěděl, že se změna nenasadila. Stejně to dělají
-- i listings-photos.sql a listings-features.sql.
drop function if exists my_listings();

create or replace function my_listings()
returns table(id uuid, place text, okres text, area integer, price integer,
              photos jsonb, features text[], access text, views integer, status text,
              created_at timestamptz,
              -- null = inzerát ještě nikdy neprošel kontrolou (třeba je nový)
              kontrola_ok boolean, kontrola_kdy timestamptz, kontrola_nalezy jsonb)
language sql security definer set search_path = public as $$
  select l.id, l.place, l.okres, l.area, l.price,
         coalesce(l.photos, '[]'::jsonb), coalesce(l.features, '{}'), l.access,
         l.views, l.status, l.created_at,
         k.ok, k.checked_at, coalesce(k.nalezy, '[]'::jsonb)
    from listings l
    left join listing_checks k on k.listing_id = l.id
   where l.user_id = auth.uid()
   order by l.created_at desc;
$$;
grant execute on function my_listings() to authenticated;
