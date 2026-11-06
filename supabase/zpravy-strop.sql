-- =====================================================================
-- Parcelka — STROP NA ZPRÁVY Z FORMULÁŘE
--
-- NÁLEZ (6. 11., oponentní posudek k §466). Tabulka `messages` měla
-- pravidlo `for insert to anon with check (true)` — tedy kdokoli smí
-- vložit cokoli, kolikrát chce. A nad tou tabulkou visí spouštěč
-- `trg_notify_new_message`, který každým vložením pošle e-mail přes
-- Resend (supabase/zprava-upozorneni.sql). Dohromady:
--
--   for i in $(seq 1 1000); do
--     curl -s -X POST "$URL/rest/v1/messages" -H "apikey: $ANON" \
--       -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
--       -d '{"kind":"kontakt","message":"x"}'
--   done
--
-- Tisíc e-mailů majiteli a vyčerpaná kvóta poštovní služby — týmž
-- klíčem se posílá i hlídání nabídek (scripts/send-alerts.mjs), takže
-- by s ní padlo i to. Sloupec `message` je `text` bez stropu, takže
-- stejnou cestou jde poslat jeden řádek o desítkách megabajtů.
--
-- A TOHLE JE TÁŽ TŘÍDA VADY JAKO §466, JEN O TABULKU DÁL. Hlídač
-- scripts/test-anon-zapis.mjs měl `messages` na seznamu povoleného
-- volného zápisu s důvodem „čtení té tabulky má jen majitel a žádný
-- sloupec nic nepovoluje". Obě poloviny té věty platí. Ani jedna
-- ale neví o SPOUŠTĚČI — a ten z práva vložit řádek dělá právo poslat
-- e-mail. Díra nebyla v žádném z těch dvou tvrzení, byla mezi nimi.
--
-- CO SE TU DĚLÁ (pořadí v balíku: AŽ ZA schema.sql, které pravidlo
-- zakládá, a ZA zprava-upozorneni.sql, které zakládá spouštěč):
--   1) strop na délku každého pole — nikdo nepošle megabajtový řádek;
--   2) strop na počet vložení za hodinu — nikdo nenafoukne tabulku;
--   3) strop na počet ODESLANÝCH e-mailů za hodinu. Ty dva stropy jsou
--      schválně dva: zpráva se uloží, i když se e-mail neposílá, takže
--      se při nálezu nic neztratí — majitel je vidí v Table Editoru.
--
-- Čísla jsou volená podle skutečného provozu, ne od oka: v hlavičce
-- zprava-upozorneni.sql stojí, že „kontaktní formulář vyplní za den
-- jednotky lidí". Třicet zpráv za hodinu je tedy dvacetinásobek
-- špičky a dvanáct e-mailů za hodinu je víc, než kolik jich za den
-- kdy přišlo.
--
-- Pustit jde opakovaně.
-- =====================================================================

-- 1) POČÍTADLO. Musí být `security definer`: pravidlo se vyhodnocuje
--    právem toho, kdo vkládá, a ten na `messages` žádné právo ke čtení
--    nemá (a mít nesmí — jsou to cizí zprávy). Bez definer by `count(*)`
--    viděl nulu a strop by nikdy nesepnul.
--    Vydává JEDINÉ číslo, kolik zpráv přišlo za posledních N minut;
--    nic z jejich obsahu. Proto ho smí spustit i nepřihlášený — jinak
--    by pravidlo skončilo na „permission denied" a formulář by přestal
--    fungovat celý.
create or replace function zprav_poslednich(p_minut integer)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from messages
   where created_at > now() - make_interval(mins => greatest(1, least(1440, coalesce(p_minut, 60))));
$$;
revoke all on function zprav_poslednich(integer) from public, anon, authenticated;
grant execute on function zprav_poslednich(integer) to anon, authenticated;

-- 2) PRAVIDLO SE ZÚŽÍ. `kind` se schválně NEVYJMENOVÁVÁ: formuláře na
--    webu posílají „kontakt" a „nahlaseni" (data-pk-druh) a js/pridat.js
--    k tomu „inzerat". Seznam v SQL by při přidání čtvrtého formuláře
--    tiše odmítal odeslání a nikdo by nevěděl proč; strop na délku
--    stejnou práci odvede bez té pasti.
drop policy if exists "verejne vkladani zprav" on messages;
create policy "verejne vkladani zprav"
  on messages for insert to anon
  with check (
    length(coalesce(kind, '')) <= 40
    and length(coalesce(name, '')) <= 120
    and length(coalesce(email, '')) <= 160
    and length(coalesce(org, '')) <= 160
    and length(coalesce(okres, '')) <= 80
    and length(coalesce(message, '')) between 1 and 4000
    and zprav_poslednich(60) < 30
  );

-- 3) SPOUŠTĚČ PŘESTANE PSÁT, KDYŽ JE TOHO PŘÍLIŠ. Tělo se přepisuje
--    celé (je to `create or replace`), přidaný je jen ten jeden strop
--    hned na začátku — a je PŘED čtením Vaultu, aby se při zahlcení
--    nečetlo ani tajemství.
create or replace function notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  klic       text;
  prijemce   text;
  odesilatel text;
begin
  /* STROP NA POŠTU. Zpráva je v tuhle chvíli už uložená (spouštěč je
     `after insert`), takže se tím nic neztrácí — jen se o ní
     neupozorňuje. Dvanáct za hodinu je nad vším, co kdy přišlo;
     cokoli nad tím není provoz, ale někdo, kdo mačká tlačítko. */
  if (select count(*) from messages
       where created_at > now() - interval '1 hour') > 12 then
    return new;
  end if;

  -- Tajemství leží ve Vaultu, ne tady. Čte se při každém vložení;
  -- kontaktní formulář vyplní za den jednotky lidí, takže se nevyplatí
  -- to cachovat a riskovat, že se po výměně klíče posílá starým.
  select decrypted_secret into klic
    from vault.decrypted_secrets where name = 'RESEND_API_KEY';
  select decrypted_secret into prijemce
    from vault.decrypted_secrets where name = 'PK_MAIL_TO';
  select decrypted_secret into odesilatel
    from vault.decrypted_secrets where name = 'PK_MAIL_FROM';

  if coalesce(klic, '') = '' or coalesce(prijemce, '') = '' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || klic,
      'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', coalesce(nullif(odesilatel, ''), 'onboarding@resend.dev'),
      'to', prijemce,
      'subject', 'Nova zprava z Parcelky (' || coalesce(new.kind, 'zprava') || ')',
      'text', 'Typ: '    || coalesce(new.kind, '')    || E'\n'
           || 'Jmeno: '  || coalesce(new.name, '')    || E'\n'
           || 'E-mail: ' || coalesce(new.email, '')   || E'\n'
           || 'Okres: '  || coalesce(new.okres, '')   || E'\n'
           || 'Zprava:'  || E'\n' || coalesce(new.message, '')));
  return new;
exception when others then
  -- Formulář nesmí spadnout kvůli poště. Dřívější podoba tohle neměla:
  -- kdyby zmizelo rozšíření pg_net nebo přístup do Vaultu, přestalo by
  -- jít odeslat zprávu — a návštěvník by viděl chybu, kterou nezpůsobil.
  raise warning 'notify_new_message: upozornění neodešlo (%)', sqlerrm;
  return new;
end $$;
revoke all on function notify_new_message() from public, anon, authenticated;
