-- =====================================================================
-- Parcelka — UPOZORNĚNÍ NA NOVOU ZPRÁVU Z KONTAKTNÍHO FORMULÁŘE
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run. Jde opakovaně.
--
-- PROČ TENHLE SOUBOR VZNIKL AŽ TEĎ. Funkce notify_new_message() i její
-- spouštěč trg_notify_new_message nad tabulkou messages v databázi
-- BĚŽELY, ale v repozitáři nebyly — ani v souborech, ani v historii
-- gitu. Kdyby se projekt Supabase zakládal znovu ze supabase/00-vse.sql,
-- obojí by tiše zmizelo a upozornění na vyplněný kontaktní formulář by
-- přestala chodit, aniž by to cokoli ohlásilo. Teprve když se počet
-- funkcí v databázi nesrovnal s tím, co svazek zakládá, se na to přišlo.
--
-- KLÍČ UŽ NENÍ V TĚLE FUNKCE. Dřívější podoba měla klíč k Resendu
-- napsaný přímo v SQL ('Bearer re_…'). Přes veřejné API se k němu nikdo
-- nedostal (pg_proc je v pg_catalog a PostgREST vydává jen schéma
-- public), ale nešel otočit z repozitáře, byl na dvou místech zároveň
-- a odcházel s každou zálohou databáze. Teď se čte ze Supabase Vaultu,
-- takže v tomhle souboru žádné tajemství není a smí ležet na GitHubu.
--
-- NEŽ SE TOHLE PUSTÍ, musí ve Vaultu existovat tři záznamy. Zakládají
-- se jednou, v SQL Editoru, a jejich hodnoty do repozitáře nepatří:
--
--   select vault.create_secret('re_…',              'RESEND_API_KEY');
--   select vault.create_secret('adresa@…',          'PK_MAIL_TO');
--   select vault.create_secret('upozorneni@…',      'PK_MAIL_FROM');
--
-- Chybí-li klíč nebo příjemce, funkce mlčky neudělá nic — formulář se
-- uloží dál. To je schválně: zpráva od člověka je cennější než
-- upozornění na ni.
--
-- POZOR NA ODESÍLATELE. Dokud je PK_MAIL_FROM zkušební adresa Resendu
-- (onboarding@resend.dev), projde pošta jen na vlastní adresu majitele
-- účtu; jinam ji Resend odmítne. Na ostro tam patří adresa na ověřené
-- doméně — viz docs/pro-majitele.md, bod o Resendu a Wedosu.
--
-- DRUHÁ CESTA POŠTY. Hlídání pozemků e-mailem neposílá databáze, ale
-- scripts/send-alerts.mjs v GitHub Action, a ten má klíč v GitHub
-- Secrets. Klíč k Resendu tedy žije na DVOU místech a při výměně se
-- mění obě.
-- =====================================================================

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

-- PostgreSQL dává nové funkci právo spuštění všem, dokud se mu to
-- nezakáže (viz supabase/kontrola-opravneni.sql). Spouštěč to nepotřebuje
-- — ten běží právem toho, kdo ho založil.
revoke all on function notify_new_message() from public, anon, authenticated;

drop trigger if exists trg_notify_new_message on messages;
create trigger trg_notify_new_message
  after insert on messages
  for each row execute function notify_new_message();
