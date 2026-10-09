-- =====================================================================
-- POZNÁMKY K POZEMKŮM NA ÚČET
--
-- Doteď byla poznámka jen v prohlížeči (localStorage) a bylo to tak
-- schválně: nepotřebovala účet a nikdo jiný ji neviděl, ani my. Cenou
-- bylo, že se nepřenesla do druhého telefonu a že o ní člověk nevěděl,
-- dokud neotevřel přesně ten pozemek.
--
-- Z používání přišlo, že ta cena je vysoká: „poznámka má být spjatá
-- s profilem a vidět i mimo inzerát". Tahle tabulka je ta změna.
--
-- CO TO ZNAMENÁ, ŘEKNEME NAHLAS. Do poznámek se píšou věty o cizích
-- lidech („majitel vypadal divně", „soused si stěžoval"). Dokud ležely
-- v prohlížeči, nikdo jiný se k nim dostat nemohl. Ted leží u nás, a web
-- to u políčka musí napsat — ne drobným písmem, ale místo původního
-- slibu, že se nikam neodesílají.
--
-- PRÁVO K NIM MÁ JEN JEJICH PISATEL. Řádek je svázaný s user_id a každá
-- ze čtyř operací si to ověřuje zvlášť (RLS). Nikdo jiný — ani majitel
-- pozemku, ani druhý zájemce — se k cizí poznámce nedostane.
-- =====================================================================

create table if not exists poznamky (
  user_id    uuid not null default auth.uid(),
  klic       text not null,                    -- klíč pozemku (PKKlic.pkey)
  text       text not null,
  zmeneno    timestamptz not null default now(),
  primary key (user_id, klic)
);

-- Výpis „kde mám poznámku" se ptá po účtu a řadí podle času úpravy.
create index if not exists poznamky_kdy_idx on poznamky(user_id, zmeneno desc);

alter table poznamky enable row level security;

-- Čtyři pravidla místo jednoho „for all": u psaní se musí hlídat i to,
-- CO se zapisuje (with check), ne jen co se čte.
drop policy if exists "pozn cteni" on poznamky;
create policy "pozn cteni" on poznamky for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "pozn zapis" on poznamky;
create policy "pozn zapis" on poznamky for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "pozn uprava" on poznamky;
create policy "pozn uprava" on poznamky for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "pozn mazani" on poznamky;
create policy "pozn mazani" on poznamky for delete to authenticated
  using (user_id = auth.uid());

-- ---------- Uložit (nebo smazat prázdnou) ----------
-- Jedna cesta pro obojí: prázdný text znamená „poznámku zahoď". Jinak by
-- smazání bylo druhé volání a dvě cesty se časem rozejdou.
-- Strop 2 000 znaků je týž jako v prohlížeči (js/poznamky.js); delší text
-- se NEOŘEZÁVÁ potichu, ale odmítne, ať člověk neztratí konec věty.
create or replace function poznamka_uloz(p_klic text, p_text text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(trim(p_klic), '') = '' then
    raise exception 'chybí klíč pozemku';
  end if;
  if length(coalesce(p_text, '')) > 2000 then
    raise exception 'poznámka je delší než 2000 znaků';
  end if;

  if coalesce(trim(p_text), '') = '' then
    delete from poznamky where user_id = auth.uid() and klic = p_klic;
  else
    insert into poznamky (user_id, klic, text, zmeneno)
    values (auth.uid(), p_klic, p_text, now())
    on conflict (user_id, klic)
    do update set text = excluded.text, zmeneno = now();
  end if;
end;
$$;

revoke all on function poznamka_uloz(text, text) from public, anon, authenticated;
grant execute on function poznamka_uloz(text, text) to authenticated;

-- ---------- Všechny moje poznámky ----------
-- Vrací i text, ne jen klíče: výpis „u kterých pozemků mám poznámku" ho
-- ukazuje rovnou, aby se kvůli každé nemuselo chodit zvlášť.
create or replace function moje_poznamky()
returns table (klic text, text text, zmeneno timestamptz)
language sql
security invoker
set search_path = public
as $$
  select p.klic, p.text, p.zmeneno
    from poznamky p
   where p.user_id = auth.uid()
   order by p.zmeneno desc;
$$;

revoke all on function moje_poznamky() from public, anon, authenticated;
grant execute on function moje_poznamky() to authenticated;
