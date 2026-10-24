-- =====================================================================
-- CHYBY Z PROHLÍŽEČE NÁVŠTĚVNÍKA — ČÍTAČE, NE ZÁZNAMY O LIDECH
--
-- PROČ. Změřeno 24. 10.: v js/ nebyl ani jeden window.onerror a ani
-- jeden posluchač unhandledrejection (0 výskytů ve 48 souborech).
-- Když tedy web někomu v prohlížeči spadne, nikdo se to nedozví —
-- návštěvník vidí poloprázdnou stránku a odejde. Všech 130 zkoušek
-- v prohlížeči navíc běží jen v Chromiu (jiný prohlížeč v prostředí
-- není), takže rozbité Safari na iPhonu by zůstalo neviditelné
-- navždy. Tohle je ta chybějící zpětná vazba.
--
-- STEJNÝ RECEPT JAKO U NÁVŠTĚVNOSTI, A ZE STEJNÉHO DŮVODU. Tabulka
-- NEUKLÁDÁ NÁVŠTĚVNÍKY. Neukládá řádek za pád, za relaci ani za
-- zařízení; ukládá ČÍTAČ na kombinaci (den, stránka, hláška, místo,
-- prohlížeč). Z takové tabulky se nedá poznat, komu to spadlo,
-- protože ta informace v ní nikdy nebyla. Žádná cookie, žádná IP,
-- žádný otisk prohlížeče, žádný identifikátor.
--
-- PROHLÍŽEČ JEN JAKO RODINA A HLAVNÍ ČÍSLO. Z celého user agenta
-- zbyde „safari-17" nebo „chrome-129". Celý user agent je slabý
-- otisk (verze + jazyk + model telefonu dohromady zužují okruh lidí
-- na jednotky), a k odpovědi „padá to jen na Safari?" je rodina
-- a hlavní verze všechno, co potřebujeme.
--
-- CO SE DO HLÁŠKY NESMÍ DOSTAT. Hláška je text z prohlížeče a může
-- v sobě nést cokoli, co programátor vložil do chyby — adresu
-- s parametry, e-mail z formuláře, obsah políčka. Ořezává se proto
-- DVAKRÁT: v prohlížeči (js/chyby.js) a znovu tady, protože sem
-- může zapsat kdokoli s veřejným klíčem, ne jen náš skript. Adresy
-- se nahrazují značkou, delší text se zkracuje a nic jiného než
-- tisknutelné znaky neprojde.
--
-- ZAPISOVAT SMÍ KDOKOLI, TEDY ČÍSLA JDOU NAFOUKNOUT. Jinak by to
-- z veřejné stránky nešlo. Proti náhodnému nesmyslu je obrana níž
-- (vzory na všechna čtyři pole, denní strop na počet řádků), proti
-- cílenému ne. K odpovědi „padá to někomu, a kde" to stačí.
-- =====================================================================

create table if not exists chyby_klienta (
  den       date not null,
  stranka   text not null,          -- jméno souboru, např. „index.html"
  zprava    text not null,          -- hláška, ořezaná a bez adres
  zdroj     text not null,          -- „js/min/ceny.js:14:9", „" = neznámo
  prohlizec text not null,          -- „safari-17", „chrome-129", „jine"
  pocet     integer not null default 0,
  naposled  timestamptz not null default now(),
  primary key (den, stranka, zprava, zdroj, prohlizec)
);

alter table chyby_klienta enable row level security;

/* Číst smí jen server přes funkci níž; přímo do tabulky nevidí nikdo.
   Zápis jde výhradně funkcí se security definer, takže ani vkládací
   pravidlo není potřeba — tabulka nemá žádnou politiku a tím je
   z webu neviditelná.

   PROČ SE ČTENÍ NEDÁ PŘIHLÁŠENÉMU. Role authenticated má každý, kdo
   si založí účet; hlášky chyb umí nést jména našich souborů a cesty
   v kódu, což je návod, kde web tlačit. Poučení z oddílu o přehledu
   návštěvnosti: „není na to odkaz" není oprávnění. */

-- ---------------------------------------------------------------------
-- ZÁPIS. Volá se z prohlížeče (js/chyby.js) přes veřejný klíč.
--
-- Všechno, co přijde zvenčí, se ověřuje znovu. Co se nevejde do vzoru,
-- se zahodí — ne odmítne s chybou, jen tiše nezapíše. Hlásič chyb
-- nemá nikdy rozbít stránku, na které už jedna chyba je.
-- ---------------------------------------------------------------------
create or replace function zapis_chybu(
  p_stranka   text,
  p_zprava    text,
  p_zdroj     text default '',
  p_prohlizec text default 'jine'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
  z text;
  m text;
  pr text;
begin
  /* Jméno stránky: stejný vzor jako u návštěvnosti. */
  s := lower(coalesce(p_stranka, ''));
  if s = '' or s = '/' then s := 'index.html'; end if;
  if s !~ '^[a-z0-9._-]{1,80}$' then return; end if;

  /* Hláška. Nejdřív pryč adresy (mohou nést parametry, token, e-mail),
     pak zalomení a víc mezer na jednu, pak zkrácení na 200 znaků.
     Prázdná nebo samý nesmysl se nezapisuje — čítač bez hlášky by
     byl jen počet, ze kterého se nic neopraví. */
  m := regexp_replace(coalesce(p_zprava, ''), 'https?://[^[:space:]]+', '‹adresa›', 'g');
  m := btrim(regexp_replace(m, '[[:space:]]+', ' ', 'g'));
  m := left(m, 200);
  if length(m) < 3 then return; end if;
  if m ~ '[^[:print:]]' then return; end if;
  /* E-mail v hlášce znamená, že ořez v prohlížeči selhal nebo že
     zapisuje někdo jiný než náš skript. Takový řádek nechceme mít
     v databázi vůbec — ani „pro jistotu zkrácený". */
  if m ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' then return; end if;

  /* Místo: jméno našeho souboru s řádkem a sloupcem, nebo prázdno. */
  z := lower(coalesce(p_zdroj, ''));
  if z <> '' and z !~ '^[a-z0-9._/-]{1,60}:[0-9]{1,6}:[0-9]{1,6}$' then z := ''; end if;

  /* Prohlížeč: rodina a hlavní verze, nic víc. */
  pr := lower(coalesce(p_prohlizec, ''));
  if pr !~ '^[a-z]{1,12}-[0-9]{1,3}$' then pr := 'jine'; end if;

  /* DENNÍ STROP NA POČET ŘÁDKŮ. `zprava` je volný text ve svém vzoru,
     takže kdokoli anonymně vyrobí libovolně mnoho různých hlášek,
     tedy libovolně mnoho řádků; úklid níž maže až po půl roce, takže
     to není obrana. Tři stovky různých hlášek za den je nad rámec
     téhle reality: web má 48 skriptů a různých pádů bývají jednotky.
     Víc znamená, že tabulku někdo plní, ne že se web rozsypal.
     STROP SE NEDRŽÍ TAJNÝ — stejně jako u návštěvnosti se přetečené
     zápisy sčítají do řádku „(strop)", aby bylo v přehledu vidět, že
     se ten den sepnul, a ne aby čísla tiše odešla od skutečnosti. */
  if (select count(*) from chyby_klienta where den = current_date) >= 300
     and not exists (select 1 from chyby_klienta
                      where den = current_date and stranka = s and zprava = m
                        and zdroj = z and prohlizec = pr) then
    insert into chyby_klienta (den, stranka, zprava, zdroj, prohlizec, pocet)
    values (current_date, '(strop)', '(strop)', '', pr, 1)
    on conflict (den, stranka, zprava, zdroj, prohlizec) do update
      set pocet = chyby_klienta.pocet + 1, naposled = now();
    return;
  end if;

  insert into chyby_klienta (den, stranka, zprava, zdroj, prohlizec, pocet)
  values (current_date, s, m, z, pr, 1)
  on conflict (den, stranka, zprava, zdroj, prohlizec) do update
    set pocet = chyby_klienta.pocet + 1, naposled = now();
end;
$$;

-- Povoluje se hned zpátky: nahlásit pád musí umět i nepřihlášený,
-- jinak by se nedozvěděl nikdo nic. Role se vyjmenovávají, ať je
-- z řádku vidět, komu se co dává, a ne jen „všem".
revoke all on function zapis_chybu(text, text, text, text) from public, anon, authenticated;
grant execute on function zapis_chybu(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- ČTENÍ. Souhrn za posledních N dní — pro scripts/chyby.mjs.
-- ---------------------------------------------------------------------
create or replace function prehled_chyb(p_dni integer default 7)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with od as (select current_date - greatest(1, least(coalesce(p_dni, 7), 365)) as d),
  z as (select * from chyby_klienta, od where den > od.d)
  select jsonb_build_object(
    'dni', (select greatest(1, least(coalesce(p_dni, 7), 365))),
    'celkem', (select coalesce(sum(pocet), 0) from z),
    'po_dnech', (select coalesce(jsonb_agg(r order by r->>'den'), '[]'::jsonb) from (
        select jsonb_build_object('den', den, 'pocet', sum(pocet)) as r
        from z group by den) t),
    'hlasky', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object('zprava', zprava, 'zdroj', zdroj,
                                  'pocet', sum(pocet),
                                  'stranek', count(distinct stranka),
                                  'naposled', max(naposled)) as r
        from z group by zprava, zdroj order by sum(pocet) desc limit 40) t),
    'prohlizece', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object('prohlizec', prohlizec, 'pocet', sum(pocet)) as r
        from z group by prohlizec order by sum(pocet) desc limit 25) t),
    'stranky', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object('stranka', stranka, 'pocet', sum(pocet)) as r
        from z group by stranka order by sum(pocet) desc limit 25) t)
  );
$$;

-- Čte to server (scripts/chyby.mjs se SUPABASE_SERVICE_ROLE_KEY).
-- „from public" nestačí: PUBLIC je pseudorole „všichni" a odebrat ji
-- neodebere právo, které má role udělené PŘÍMO — a Supabase anonovi
-- i přihlášenému práva na funkce ve schématu public rovnou dává.
revoke all on function prehled_chyb(integer) from public, anon, authenticated;
grant execute on function prehled_chyb(integer) to service_role;

/* ÚKLID. Půl roku starou hlášku už nikdo neopraví a tabulka nemá růst
   donekonečna. Spouští se stejně jako úklid návštěvnosti. */
create or replace function uklid_chyb_klienta()
returns integer
language sql
security definer
set search_path = public
as $$
  with smazano as (delete from chyby_klienta where den < current_date - 180 returning 1)
  select count(*)::integer from smazano;
$$;

-- Tahle funkce data MAŽE. Spustit ji nesmí nikdo z webu.
revoke all on function uklid_chyb_klienta() from public, anon, authenticated;
