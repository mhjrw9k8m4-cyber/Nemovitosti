-- =====================================================================
-- Parcelka — OPRAVA chatu + úklid. Spustit jednou: Supabase → SQL Editor.
-- Řeší nálezy z automatického testu:
--   1) thread_messages padalo na dvojznačnosti názvů sloupců (#variable_conflict)
--   2) delete_listing(p_id) pro přihlášeného majitele nebylo nasazené
--      (kvůli tomu nešlo smazat inzerát v profilu ani uklidit test)
--   3) smaže zkušební inzeráty „ZKUŠEBNÍ …", které vytvořil test
-- =====================================================================

-- 1) Oprava čtení konverzace
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

-- 2) Mazání inzerátu přihlášeným majitelem (chybělo → nešlo mazat v profilu)
create or replace function delete_listing(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int; begin
  delete from listings where id = p_id and user_id = auth.uid();
  get diagnostics n = row_count; return n > 0; end; $$;
grant execute on function delete_listing(uuid) to authenticated;

-- 3) Úklid zkušebních inzerátů z testu (kaskádou zmizí i jejich zprávy)
delete from listings where place like 'ZKUŠEBNÍ %';
