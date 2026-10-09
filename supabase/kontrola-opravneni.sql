-- Kdo smí spustit kterou funkci — a hlavně kde to zůstalo na výchozím.
-- =====================================================================
-- PROČ. Web už jednou pustil ke statistice návštěvnosti každého, kdo si
-- založil účet. Nebyla to chyba v SQL: PostgreSQL dává nové funkci právo
-- spuštění PUBLIC, tedy všem, dokud se mu to výslovně nezakáže. Zapomenout
-- se dá jen tím, že se nic nenapíše — a to se špatně hledá, protože ten
-- řádek v souboru prostě není.
--
-- Zvenku se to zjistit nedá. scripts/kontrola-databaze.mjs to zkoušel
-- z výpisu PostgRESTu, jenže ten na klíče „sb_publishable_…" vrací 401,
-- takže zůstávalo u „ověřit se nepodařilo". Odpověď zná jedině databáze
-- sama, a tahle funkce se jí na to zeptá.
--
-- ČTE SE Z proacl, NE Z has_function_privilege. Rozdíl je přesně ten,
-- o který tu jde: prázdné proacl (NULL) znamená „nikdo se o oprávnění
-- nestaral", tedy výchozí PUBLIC. has_function_privilege by u takové
-- funkce taky vrátilo pravdu, ale nerozlišilo by, jestli to někdo
-- rozhodl, nebo na to zapomněl. Rozlišit se to musí: první je volba,
-- druhé je nehoda.
--
-- SAMA SEBE NEPUSTÍ KE SLOVU NIKOMU. Vypisuje, jak je databáze
-- zabezpečená, což je návod, kudy do ní. Proto revoke a grant jen
-- service_role — a proto je to první funkce, kterou si kontrola sama
-- ověřuje.

create or replace function kontrola_opravneni()
returns table (funkce text, komu text, vychozi boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.proname::text,
    case
      when p.proacl is null then 'PUBLIC'
      when a.grantee = 0 then 'PUBLIC'
      else pg_catalog.pg_get_userbyid(a.grantee)
    end,
    p.proacl is null
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  left join pg_catalog.aclexplode(p.proacl) a
    on a.privilege_type = 'EXECUTE'
  where n.nspname = 'public'
    and p.prokind = 'f'
    and (p.proacl is null or a.grantee is not null)
$$;

revoke all on function kontrola_opravneni() from public, anon, authenticated;
grant execute on function kontrola_opravneni() to service_role;
