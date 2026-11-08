-- TYP NEMOVITOSTI U INZERÁTU OD ČLOVĚKA
-- =====================================================================
-- Web od 5. 11. ukazuje všechny nemovitosti — domy, byty, garáže,
-- komerční objekty — a z veřejných zdrojů je jich na mapě 1 600
-- z 3 886 (změřeno 8. 11.). VLOŽIT se ale dal jen pozemek: formulář
-- neměl kam typ zapsat a tabulka `listings` pro něj neměla sloupec.
-- Stránka pro realitní kanceláře to musela přiznat — a realitka
-- prodává hlavně domy a byty, takže to byl ten nejdražší chybějící
-- kousek.
--
-- PROČ OBÁLKA A NE DRUHÁ KOPIE FUNKCE. `create_listing` nese všechna
-- serverová pravidla: přihlášení, povinnou obec a polohu, filtr
-- nevhodných slov, strop 30 inzerátů na účet, čekání 90 s mezi
-- inzeráty, kontrolu adres fotek a výčet vybavení. Kdyby se kvůli
-- jednomu novému parametru celé tělo opsalo, vznikla by DVĚ místa
-- s týmiž pravidly — a ta se rozejdou tiše (v tomhle repozitáři
-- §436-třída). Nová podoba proto jen zavolá tu starou a potom
-- k založenému inzerátu dopíše typ.
--
-- CO SE NEKONTROLUJE PROTI SEZNAMU KATEGORIÍ: databáze seznam
-- kategorií NEZNÁ a znát nemá — ten je v js/kategorie.js a ptají se
-- na něj web i robot. Tady se hlídá jen TVAR (krátké slovo bez
-- diakritiky), takže se do sloupce nedostane věta ani kus HTML;
-- jestli je to kategorie, kterou web umí vykreslit, rozhoduje
-- js/cisteni.js při čtení — a to je jediné místo, kam data vstupují.
--
-- POZEMEK SE NEZAPISUJE. Výchozí stav webu je pozemek (PKKategorie
-- .VYCHOZI) a nabídka bez `kat` je pozemek všude na webu. Zapisovat
-- „pozemek" by znamenalo mít tutéž informaci dvěma způsoby.

alter table listings add column if not exists kat text;

-- Tvar, ne význam: krátké slovo malými písmeny bez diakritiky.
alter table listings drop constraint if exists listings_kat_tvar;
alter table listings add constraint listings_kat_tvar
  check (kat is null or kat ~ '^[a-z]{3,12}$');

-- Starší podoba obálky (kdyby se měnil počet parametrů).
drop function if exists create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb,text[],text,text);

create or replace function create_listing(
  p_place text, p_okres text, p_druh text, p_parcel text,
  p_area integer, p_price integer, p_lat double precision, p_lng double precision,
  p_description text, p_contact text, p_photos jsonb,
  p_features text[], p_access text, p_kat text)
returns table(id uuid)
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  k text := nullif(trim(coalesce(p_kat, '')), '');
begin
  if k is not null and k !~ '^[a-z]{3,12}$' then
    raise exception 'neznámý typ nemovitosti';
  end if;
  /* Všechna pravidla jsou v té původní podobě; tady se jen zavolá. */
  select c.id into new_id
    from create_listing(p_place, p_okres, p_druh, p_parcel, p_area, p_price,
                        p_lat, p_lng, p_description, p_contact,
                        coalesce(p_photos, '[]'::jsonb),
                        coalesce(p_features, '{}'), p_access) c;
  if k is not null and k <> 'pozemek' then
    /* Podmínka na vlastníka je tu podruhé schválně: `security definer`
       znamená, že funkce běží s právy svého tvůrce, takže update bez ní
       by při chybě v budoucí úpravě sahal na cizí řádky. */
    update listings set kat = k where listings.id = new_id and listings.user_id = auth.uid();
  end if;
  return query select new_id;
end $$;
grant execute on function create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb,text[],text,text) to authenticated;

-- Čtení: typ musí jít z databáze na web, jinak by se dům po vložení
-- ukázal jako pozemek (a spočítal se do ceny pozemků za metr).
--
-- OBĚ FUNKCE SE OPISUJÍ Z listings-prvni-kontrola.sql, protože PostgreSQL
-- neumí „přidej sloupec do návratového typu" — funkce se musí napsat
-- celá. Co se tím opisuje, je nutné dodržet, jinak by se tichou cestou
-- ztratilo:
--   · public_listings() pouští jen to, co je VEŘEJNÉ podle
--     listing_je_verejny(status, public_at) — ne všechno se stavem
--     „approved" (první inzerát nového účtu čeká na kontrolu);
--   · my_listings() nese výsledek noční kontroly (kontrola_*) a
--     public_at, podle kterých stránka „Moje inzeráty" říká, jestli
--     inzerát už lidé vidí.
-- Proto musí tenhle soubor v PORADI stát ZA listings-prvni-kontrola.sql
-- a hlídá to zkouška scripts/test-vkladani-kategorie.mjs.
-- POZOR: přidání sloupce do návratového typu `create or replace`
-- NEUMÍ — PostgreSQL to odmítne („cannot change return type of existing
-- function"). Obě funkce se proto nejdřív zahodí. Chytila to zkouška
-- scripts/test-sql-cista.mjs, která balík pouští na čisté databázi.
drop function if exists public_listings();
drop function if exists my_listings();

create or replace function public_listings()
returns table(id uuid,place text,okres text,druh text,parcel text,area integer,price integer,
              lat double precision,lng double precision,description text,contact text,
              photos jsonb,features text[],access text,kat text,views integer,created_at timestamptz)
language sql security definer set search_path = public as $$
  select id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,
         coalesce(photos,'[]'::jsonb),coalesce(features,'{}'),access,kat,views,created_at
  from listings
  where listing_je_verejny(status, public_at)
  order by created_at desc; $$;
grant execute on function public_listings() to anon, authenticated;

create or replace function my_listings()
returns table(id uuid, place text, okres text, area integer, price integer,
              photos jsonb, features text[], access text, kat text, views integer, status text,
              created_at timestamptz,
              kontrola_ok boolean, kontrola_kdy timestamptz, kontrola_nalezy jsonb,
              public_at timestamptz)
language sql security definer set search_path = public as $$
  select l.id, l.place, l.okres, l.area, l.price,
         coalesce(l.photos, '[]'::jsonb), coalesce(l.features, '{}'), l.access, l.kat,
         l.views, l.status, l.created_at,
         k.ok, k.checked_at, coalesce(k.nalezy, '[]'::jsonb),
         l.public_at
    from listings l
    left join listing_checks k on k.listing_id = l.id
   where l.user_id = auth.uid()
   order by l.created_at desc;
$$;
grant execute on function my_listings() to authenticated;
