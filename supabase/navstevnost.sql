-- =====================================================================
-- VLASTNÍ MĚŘENÍ NÁVŠTĚVNOSTI — BEZ COOKIES, BEZ IP, BEZ CIZÍ FIRMY
--
-- PROČ VŮBEC. Web má 2 183 stránek a nikdo neví, jestli na ně někdo
-- chodí. Bez toho čísla se nedá rozhodnout nic: ani co dodělat, ani
-- jestli má smysl platit za doménu, ani kolik ten web stojí. Je to
-- jediný údaj, který o projektu chybí úplně.
--
-- PROČ NE GOOGLE ANALYTICS. Web posílá do ciziny nulu — to je jedno
-- z mála tvrzení, která o sobě na stránce o soukromí dělá. Vložit tam
-- Google by znamenalo buď to tvrzení odvolat, nebo lhát. Navíc by
-- přibyla lišta se souhlasem, protože GA bez souhlasu v EU nejde.
--
-- JAK JE TO UDĚLANÉ, ABY SOUHLAS NEBYL POTŘEBA. Tahle tabulka
-- NEUKLÁDÁ NÁVŠTĚVNÍKY. Neukládá řádek za návštěvu, za relaci ani za
-- zařízení. Ukládá jen ČÍTAČE: za den, stránku, zdroj a druh displeje
-- jedno číslo, které se zvyšuje. Z takové tabulky se nedá zpětně
-- poznat, kdo kde byl, protože ta informace v ní nikdy nebyla —
-- není to anonymizace, je to nesebrání. Žádná cookie, žádná IP,
-- žádný otisk prohlížeče, žádný identifikátor.
--
-- CO SE TÍM NEDOZVÍME. Kolik je to různých lidí. Jestli se někdo vrací.
-- Kudy prošel webem. To je cena za to, že se nikdo nesleduje, a je
-- zaplacená vědomě: k rozhodnutí „chodí sem někdo a odkud" stačí
-- čítače, a nic víc k nim nepotřebujeme.
--
-- ZDROJ SE UKLÁDÁ JEN JAKO DOMÉNA. Z „https://www.google.com/search?q=
-- pozemek+na+prodej+tabor" zbyde „google.com". Celá adresa odkazujícího
-- umí nést i jméno člověka (odkaz z profilu, ze sdílené konverzace),
-- takže se zahazuje v prohlížeči a sem nikdy nedorazí.
--
-- ČÍSLA JSOU PŘIBLIŽNÁ A VÍ SE TO. Zapisovat smí kdokoli (jinak by to
-- nešlo z veřejné stránky), takže se dají nafouknout. Proti náhodnému
-- nesmyslu je obrana níž (jména stránek se ověřují proti vzoru, zdroj
-- se ořezává), proti cílenému ne. Na rozhodování „má ten web deset
-- návštěv denně, nebo tisíc" to stačí; na fakturaci inzerentovi ne.
-- =====================================================================

create table if not exists navstevnost (
  den       date not null,
  stranka   text not null,          -- jméno souboru, např. „index.html"
  zdroj     text not null,          -- doména odkazujícího, „" = přímo
  zarizeni  text not null,          -- „mobil" | „stolni"
  zobrazeni integer not null default 0,   -- kolikrát se stránka otevřela
  navstevy  integer not null default 0,   -- kolikrát jí relace začala
  primary key (den, stranka, zdroj, zarizeni)
);

alter table navstevnost enable row level security;

/* Číst smí jen přihlášený majitel přes funkci níž; přímo do tabulky
   nevidí nikdo. Zápis jde výhradně funkcí se security definer, takže
   ani vkládací pravidlo není potřeba — tabulka nemá žádnou politiku
   a tím je z webu neviditelná. */

-- ---------------------------------------------------------------------
-- ZÁPIS. Volá se z prohlížeče (js/mereni.js) přes veřejný klíč.
--
-- Všechno, co přijde zvenčí, se tu ověřuje znovu: jméno stránky musí
-- vypadat jako jméno souboru na tomhle webu, zdroj jako doména, druh
-- displeje je jedno ze dvou slov. Cokoli jiného se zahodí — ne odmítne
-- s chybou, jen tiše nezapíše. Měření nemá nikdy rozbít stránku.
-- ---------------------------------------------------------------------
create or replace function zapis_navstevu(
  p_stranka  text,
  p_zdroj    text default '',
  p_zarizeni text default 'stolni',
  p_prvni    boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
  z text;
  d text;
begin
  /* Jméno stránky: malá písmena, číslice, pomlčka, tečka, podtržítko.
     Nic jiného na tomhle webu neexistuje a nic jiného se nezapíše. */
  s := lower(coalesce(p_stranka, ''));
  if s = '' or s = '/' then s := 'index.html'; end if;
  if s !~ '^[a-z0-9._-]{1,80}$' then return; end if;

  /* Zdroj: doména, nebo prázdno. Delší než 60 znaků doména nebývá. */
  z := lower(coalesce(p_zdroj, ''));
  if z <> '' and z !~ '^[a-z0-9.-]{1,60}$' then z := ''; end if;

  d := case when p_zarizeni = 'mobil' then 'mobil' else 'stolni' end;

  insert into navstevnost (den, stranka, zdroj, zarizeni, zobrazeni, navstevy)
  values (current_date, s, z, d, 1, case when p_prvni then 1 else 0 end)
  on conflict (den, stranka, zdroj, zarizeni) do update
    set zobrazeni = navstevnost.zobrazeni + 1,
        navstevy  = navstevnost.navstevy + case when p_prvni then 1 else 0 end;
end;
$$;

-- Tady se povoluje hned zpátky (viz řádek níž) — zapsat návštěvu musí
-- umět i nepřihlášený, jinak by se nezměřilo nic. Vyjmenované role
-- jsou i tak: ať je z řádku vidět, komu se co bere, a ne jen „všem".
revoke all on function zapis_navstevu(text, text, text, boolean) from public, anon, authenticated;
grant execute on function zapis_navstevu(text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- ČTENÍ. Souhrn za posledních N dní — co se čte, ne co se ukládá.
--
-- Vrací tři pohledy naráz, protože tři dotazy ze stránky by znamenaly
-- tři kolečka po síti kvůli jedné tabulce o pár stech řádcích.
-- ---------------------------------------------------------------------
create or replace function prehled_navstevnosti(p_dni integer default 30)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with od as (select current_date - greatest(1, least(coalesce(p_dni, 30), 365)) as d),
  z as (select * from navstevnost, od where den > od.d)
  select jsonb_build_object(
    'dni', (select greatest(1, least(coalesce(p_dni, 30), 365))),
    'celkem', (select jsonb_build_object(
        'zobrazeni', coalesce(sum(zobrazeni), 0),
        'navstevy',  coalesce(sum(navstevy), 0)) from z),
    'po_dnech', (select coalesce(jsonb_agg(r order by r->>'den'), '[]'::jsonb) from (
        select jsonb_build_object('den', den, 'zobrazeni', sum(zobrazeni), 'navstevy', sum(navstevy)) as r
        from z group by den) t),
    'stranky', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object('stranka', stranka, 'zobrazeni', sum(zobrazeni)) as r
        from z group by stranka order by sum(zobrazeni) desc limit 40) t),
    'zdroje', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object('zdroj', case when zdroj = '' then '(přímo)' else zdroj end,
                                  'navstevy', sum(navstevy), 'zobrazeni', sum(zobrazeni)) as r
        from z group by zdroj order by sum(zobrazeni) desc limit 25) t),
    'zarizeni', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object('zarizeni', zarizeni, 'zobrazeni', sum(zobrazeni)) as r
        from z group by zarizeni) t)
  );
$$;

/* ČTE TO JEN SERVER, NE PŘIHLÁŠENÝ ČLOVĚK. Nejdřív tu stálo
   `to authenticated` — a odporovalo to tomu, co je napsané
   v hlavičce scripts/navstevnost.mjs: že se z přehledu NEDĚLÁ stránka
   právě proto, že web nemá pojem „majitel" a roli authenticated má
   každý, kdo si založí účet. Grant tedy dával celou návštěvnost webu
   komukoli, kdo se zaregistruje a zavolá si RPC sám; že na ni není
   odkaz, nic neznamená.
   Čte ji scripts/navstevnost.mjs se SUPABASE_SERVICE_ROLE_KEY, takže
   service_role stačí. Až bude web mít pojem majitele, přidá se jemu —
   do té doby ne. */
-- „from public" NESTAČÍ, a tohle je ta chyba podruhé. PUBLIC je
-- pseudorole „všichni"; odebrat ji neodebere právo, které má role
-- udělené PŘÍMO, a Supabase anonovi i přihlášenému práva na funkce
-- ve schématu public rovnou dává. Po první opravě tedy zůstala
-- statistika otevřená nepřihlášeným — tedy komukoli na internetu,
-- což je horší stav než ten, který se opravoval.
-- Každou roli je proto potřeba vyjmenovat. Že to platí i ve skutečné
-- databázi, a ne jen v tomhle souboru, hlídá kontrola_opravneni()
-- (supabase/kontrola-opravneni.sql) — ta tuhle díru taky našla.
revoke all on function prehled_navstevnosti(integer) from public, anon, authenticated;
grant execute on function prehled_navstevnosti(integer) to service_role;

/* ÚKLID. Čítače za rok a víc nikdo nečte a tabulka nemá růst donekonečna.
   Spouští se ručně nebo z rozesílače; nemaže nic, co by šlo potřebovat
   k meziročnímu srovnání kratšímu než dva roky. */
create or replace function uklid_navstevnosti()
returns integer
language sql
security definer
set search_path = public
as $$
  with smazano as (delete from navstevnost where den < current_date - 730 returning 1)
  select count(*)::integer from smazano;
$$;

-- Totéž, a tady by to bolelo víc: tahle funkce data MAŽE. Spustit ji
-- směl kdokoli, přihlášený i ne.
revoke all on function uklid_navstevnosti() from public, anon, authenticated;
