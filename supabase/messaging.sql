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
