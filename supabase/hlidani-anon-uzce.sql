-- =====================================================================
-- Parcelka — ÚZKÁ BRANKA PRO VEŘEJNÝ ZÁPIS DO watch_subscriptions
--
-- Spustí se jednou: Supabase → SQL Editor → vložit → Run.
-- Nic nemaže a nic nepřesouvá; jen zužuje jedno pravidlo zápisu.
--
-- CO SE OPRAVUJE
-- Tabulka watch_subscriptions má dvojí potvrzení (double opt-in) —
-- sloupec `confirmed` a `confirm_token` — a u něj v schema.sql stojí
-- „zákon vyžaduje souhlas". Zapisovat do ní z prohlížeče ale smí
-- kdokoli s veřejným klíčem, a to pravidlem
--
--     on watch_subscriptions for insert to anon with check (true)
--
-- `with check (true)` nehlídá HODNOTY. Kdo má veřejný klíč (a ten je
-- v js/config.js, jak má být), může tedy vložit řádek, který už má
-- `confirmed = true` — nebo si zvolit vlastní `confirm_token` a hned
-- ho poslat do veřejné funkce confirm_watch(). Obojí obchází potvrzení
-- e-mailu, tedy přesně to, co ten sloupec zajišťuje.
--
-- CO SE DNES NEDĚJE, A JE POCTIVÉ TO NAPSAT
-- Z téhle tabulky se žádná pošta neposílá. Rozesílač (scripts/send-alerts.mjs)
-- čte saved_searches přes hlidani_k_odeslani(), a ta funkce vyžaduje
-- `u.email_confirmed_at is not null`, tedy opravdu potvrzený účet
-- v Supabase. watch_subscriptions je starší, nepoužívaná cesta — stojí to
-- i v komentáři v js/config.js. Takže tohle není „kdokoli rozešle mail
-- komukoli"; je to otevřená branka u mechanismu, který by se tím
-- obešel, kdyby se někdy zapojil, a volný zápis do databáze zatím.
--
-- PROČ SE PRAVIDLO NEZRUŠÍ CELÉ
-- Správná cesta zápisu vede funkcí subscribe_watch(), a ta je
-- `security definer`, takže RLS obchází — pravidlo pro anon tedy
-- k přihlášení potřeba není. Zůstává proto jen kvůli jediné věci,
-- která ho používá: tlačítko „Uložení hlídání" v diagnostika.html,
-- kterým si majitel ověřuje, že zápis do databáze vůbec projde. To
-- posílá jen e-mail a okres, takže zúženou podmínkou projde.
--
-- CO SE TÍM POVOLÍ
-- Vložit smí jen řádek, který NENÍ potvrzený a nemá potvrzovací token
-- (ten umí vyrobit jen subscribe_watch), je aktivní, ještě nikomu nic
-- neposlal a má rozumné délky. Takový řádek nikomu nic nepošle a nedá
-- se sám potvrdit.
-- =====================================================================

drop policy if exists "verejne vkladani hlidani" on watch_subscriptions;
create policy "verejne vkladani hlidani"
  on watch_subscriptions for insert to anon
  with check (
    confirmed = false
    and confirm_token is null
    and active = true
    and last_notified_at is null
    and email is not null
    and length(email) between 5 and 160
    and (okres is null or length(okres) <= 60)
    and (types is null or coalesce(array_length(types, 1), 0) <= 4)
  );

-- Kontrolní výpis: co teď u téhle tabulky platí.
select polname as pravidlo, polcmd as prikaz, pg_get_expr(polwithcheck, polrelid) as podminka
  from pg_policy
 where polrelid = 'public.watch_subscriptions'::regclass;
