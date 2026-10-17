-- =====================================================================
-- Parcelka — VÝKON: INDEXY, PŘEPSANÉ DOTAZY CHATU A ÚKLID STARÝCH PODOB
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run. Jde to opakovat.
--
-- PROČ TENHLE SOUBOR VZNIKL. Všechno níž je změřené na opravdovém
-- PostgreSQL 16 (scripts/test-sql-cista.mjs umí databázi založit a tenhle
-- soubor do ní pustí taky) nad nasypanými daty: 2 000 účtů, 50 000
-- inzerátů, 200 000 zpráv. To NENÍ dnešek — dnes je v tabulkách pár
-- řádků a nic z toho by se nepoznalo. Je to velikost, ve které se
-- sekvenční čtení celé tabulky pozná, a index se zakládá proto, aby se
-- ta chvíle nikdy nestala.
-- =====================================================================

-- ---------- 1) Inzeráty podle účtu ----------
-- Sloupec listings.user_id čte osm míst: kvóta při každém přidání
-- inzerátu, brzda „jeden inzerát za 90 vteřin", my_listings, mazání,
-- a přes něj chodí i politika čtení chatu. Index na něm nebyl žádný.
-- Změřeno (50 000 inzerátů):
--   count(*) podle účtu       8,78 ms → 0,16 ms
--   brzda 90 s                3,88 ms → 0,03 ms
--   my_listings (řazené)      4,23 ms → 0,21 ms
-- Druhý sloupec v indexu je created_at sestupně: tím index obslouží
-- i to řazení, ne jen hledání.
create index if not exists listings_user_idx on listings(user_id, created_at desc);

-- ---------- 2) Zprávy podle odesílatele ----------
-- send_message() se při KAŽDÉ odeslané zprávě ptá dvakrát: „neposlal
-- tenhle účet něco za poslední 3 vteřiny" a „kolik poslal za hodinu".
-- Obojí šlo přes celou tabulku zpráv. Změřeno (200 000 zpráv):
--   brzda 3 s                16,76 ms → 0,05 ms
--   hodinový limit           13,96 ms → 0,08 ms
create index if not exists chat_sender_idx on chat_messages(sender_id, created_at desc);

-- ---------- 3) Vlákna a odznak nepřečtených ----------
-- Obě funkce se ptaly „buď jsem kupující, nebo jsem majitel inzerátu"
-- jedním podmínkou s OR. Takový dotaz neumí PostgreSQL obsloužit
-- indexem ani jedné strany a čte celou tabulku zpráv — u my_threads()
-- 183 ms, u unread_count() 353 ms, a unread_count() se volá při
-- otevření každé stránky kvůli odznaku v nabídce.
--
-- POZOR, CO TO SPRAVILO. Nejdřív jsem z my_threads() vyhodil tři
-- závislé poddotazy (poslední zpráva, její čas a počet nepřečtených
-- se počítaly zvlášť pro každé vlákno) a nahradil je jedním průchodem
-- s agregací. Naměřeno 189 ms, tedy o nic lépe — ty poddotazy nebyly
-- ta drahá část. Drahé bylo to OR. Rozpad na UNION dvou větví, z nichž
-- každá jde po svém indexu, dal 5,7 ms a 1,3 ms. Obě podoby vracejí
-- přesně tytéž řádky (porovnáno přes EXCEPT v obou směrech: 0 rozdílů).
--
--   my_threads()     183 ms → 5,7 ms
--   unread_count()   353 ms → 1,3 ms
create or replace function my_threads()
returns table(
  listing_id uuid, buyer_id uuid, place text, okres text,
  is_owner boolean, last_body text, last_at timestamptz, unread integer
)
language sql security definer set search_path = public as $$
  with vlakna as (
    -- Vlákna, kde jsem kupující: rovnou po indexu chat_buyer_idx.
    select m.listing_id, m.buyer_id from chat_messages m
     where m.buyer_id = auth.uid()
    union
    -- Vlákna u mých inzerátů: po listings_user_idx a pak po
    -- chat_listing_buyer_idx. UNION navíc zahodí dvojí výskyt
    -- (vlastní inzerát, na který si píšu sám sobě).
    select m.listing_id, m.buyer_id from chat_messages m
      join listings l on l.id = m.listing_id
     where l.user_id = auth.uid()
  ), souhrn as (
    select v.listing_id, v.buyer_id,
           max(x.created_at) as last_at,
           count(*) filter (where x.sender_id <> auth.uid() and x.read_at is null)::int as unread
      from vlakna v
      join chat_messages x on x.listing_id = v.listing_id and x.buyer_id = v.buyer_id
     group by v.listing_id, v.buyer_id
  )
  select s.listing_id, s.buyer_id, l.place, l.okres,
         (l.user_id = auth.uid()) as is_owner,
         posl.body, s.last_at, s.unread
    from souhrn s
    join listings l on l.id = s.listing_id
    join lateral (
      select x.body from chat_messages x
       where x.listing_id = s.listing_id and x.buyer_id = s.buyer_id
       order by x.created_at desc limit 1
    ) posl on true
   order by s.last_at desc;
$$;
grant execute on function my_threads() to authenticated;

create or replace function unread_count()
returns integer language sql security definer set search_path = public as $$
  select coalesce(count(*), 0)::int from (
    select m.id from chat_messages m
     where m.read_at is null and m.sender_id <> auth.uid() and m.buyer_id = auth.uid()
    union
    select m.id from chat_messages m
      join listings l on l.id = m.listing_id
     where m.read_at is null and m.sender_id <> auth.uid() and l.user_id = auth.uid()
  ) t;
$$;
grant execute on function unread_count() to authenticated;

-- ---------- 4) Tokeny musí být jedinečné, ne jen náhodné ----------
-- confirm_watch() i unsubscribe_watch() hledají řádek PODLE TOKENU
-- a pak ho mění. Tokeny vznikají z gen_random_uuid(), takže se dvakrát
-- neobjeví — ale to je spoleh na náhodu, ne pravidlo databáze. Tohle
-- z toho pravidlo dělá a zároveň to je index, po kterém to hledání
-- jde (dosud se četla celá tabulka).
create unique index if not exists ws_confirm_token_idx
  on watch_subscriptions(confirm_token) where confirm_token is not null;
create unique index if not exists ws_unsub_token_idx
  on watch_subscriptions(unsubscribe_token) where unsubscribe_token is not null;
-- Totéž u plateb: webhook od Stripu umí přijít dvakrát za sebou
-- (opakování při chybě sítě) a bez jedinečnosti by z jedné platby
-- vznikly dva řádky. Platby zatím neběží, ale pravidlo má být v
-- databázi dřív než první platba, ne po ní.
create unique index if not exists payments_session_idx
  on payments(stripe_session_id) where stripe_session_id is not null;

-- ---------- 5) Vazba, která byla jen v komentáři ----------
-- U listings.payment_id stálo „vazba na tabulku payments". Žádná vazba
-- to nebyla: sloupec nikdo nečetl, nikdo nepsal a databáze o ní
-- nevěděla. Buď je to vazba, nebo to je mrtvý sloupec; tohle z toho
-- dělá vazbu. `on delete set null`, aby smazaná platba nesmazala
-- inzerát.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'listings_payment_fk') then
    alter table listings add constraint listings_payment_fk
      foreign key (payment_id) references payments(id) on delete set null;
  end if;
end $$;
create index if not exists listings_payment_idx on listings(payment_id) where payment_id is not null;

-- ---------- 6) Úklid starších podob save_search ----------
-- Funkce save_search přibírala parametry ve čtyřech krocích (ceny,
-- celé pozemky, střed a okruh) a každá podoba v databázi zůstala.
-- Čtyři podoby téže funkce nejsou jen nepořádek: PostgREST si vybírá
-- podle jmen poslaných parametrů, takže kdyby klient jeden parametr
-- vynechal, uloží se hledání TIŠE bez něj — třeba bez okruhu, a
-- člověku pak chodí pošta z celé republiky. Zůstává jen ta podoba,
-- kterou web volá (čtrnáct parametrů).
drop function if exists save_search(text, text, text, text, integer, integer, text[]);
drop function if exists save_search(text, text, text, text, integer, integer, text[], integer, integer, integer);
drop function if exists save_search(text, text, text, text, integer, integer, text[], integer, integer, integer, boolean);

-- ---------- 7) Pošta, která se už poslala, nemusí ležet navždy ----------
-- mail_poslane a push_poslane si drží klíč každé odeslané nabídky, aby
-- se neposlala podruhé. Nabídka ale z dat zmizí nejpozději do pár
-- měsíců (změřeno: 308 z 1 980 nabídek zmizelo za 17 dní), takže řádek
-- starší než půl roku už nemá co hlídat — nic, co by se mohlo shodovat,
-- v datech není. Index na čas u obou tabulek existoval, jen po něm
-- nikdy nikdo nešel: byl založený pro úklid, který se nenapsal.
create or replace function uklid_posty(p_dni integer default 180)
returns integer language plpgsql security definer set search_path = public as $$
declare dni int := greatest(coalesce(p_dni, 180), 30); smazano int := 0; n int;
begin
  delete from mail_poslane where poslano_at < now() - make_interval(days => dni);
  get diagnostics n = row_count; smazano := smazano + n;
  delete from push_poslane where poslano_at < now() - make_interval(days => dni);
  get diagnostics n = row_count; smazano := smazano + n;
  return smazano;
end; $$;
revoke all on function uklid_posty(integer) from public, anon, authenticated;
grant execute on function uklid_posty(integer) to service_role;
