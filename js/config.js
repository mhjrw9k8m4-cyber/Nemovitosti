/* =====================================================================
   Parcelka — nastavení pro ukládání formulářů.

   Formuláře (hlídání lokality, kontakt, zpětná vazba, nahlášení inzerátu)
   ukládají poptávky přímo do databáze Supabase.

   Klíč PK_SUPABASE_KEY je „publishable" (veřejný) — je bezpečné mít ho
   v prohlížeči. Chrání ho pravidla řádkové bezpečnosti (RLS): z webu jde
   jen VKLÁDAT (odeslat formulář), ne číst cizí data. Zprávy uvidíte
   v Supabase → Table Editor, tabulka messages.
   (Dřív tu stálo i watch_subscriptions. Ta tabulka zůstala prázdná —
   hlídání se ukládá do saved_searches, viz supabase/watch-alerts.sql.
   Poslat někoho hledat data do tabulky, která se neplní, znamená, že
   dojde k závěru „nic se neukládá".)
   ===================================================================== */
window.PK_SUPABASE_URL = 'https://tcinuzftgmkvjjgvadky.supabase.co';
window.PK_SUPABASE_KEY = 'sb_publishable_mnPDOe03iHjoDxc7C2x2iA_q4HOSec0';

/* Starší nastavení (Formspree) — už se nepoužívá, ponecháno jen pro jistotu. */
window.PK_FORM_ENDPOINT = '';
window.PK_FORM_EMAIL = '';

/* ---------------------------------------------------------------------
   POSÍLÁNÍ HLÍDÁNÍ E-MAILEM — vypnuté, dokud rozesílač opravdu neběží.

   Všechno pro to je hotové: migrace supabase/hlidani-mailem.sql,
   rozesílač scripts/send-alerts.mjs i stránka na odhlášení. Chybí jediná
   věc, kterou nejde napsat v repozitáři — klíč poštovní služby
   (RESEND_API_KEY) a potvrzená doména odesílatele.

   Dokud tu stojí false, web o e-mailech nikde nemluví: přepínač
   u uloženého hledání se vůbec nevykreslí. Slíbit poštu, která nepřijde,
   je horší než ji neslibovat — člověk přestane web otevírat, protože
   čeká, že se mu ozve sám.

   Až klíč bude, stačí přepsat na true. Nic jiného se neupravuje.
   --------------------------------------------------------------------- */
window.PK_MAIL_ZAPNUTO = false;

/* ---------------------------------------------------------------------
   UPOZORNĚNÍ DO TELEFONU (push) — vypnuté, dokud nejsou klíče.

   Veřejný klíč VAPID. Je veřejný ze své podstaty: prohlížeč ho potřebuje
   ve chvíli, kdy si člověk odběr zapíná, takže patří do stránky.
   Vyrobí se spolu s privátním: node scripts/vapid-klice.mjs.
   Privátní patří do secrets repozitáře (PK_VAPID_PRIVATNI), NIKDY sem.

   Dokud je tu prázdný řetězec, web o upozorněních nikde nemluví:
   přepínač u uloženého hledání se vůbec nevykreslí. Bez klíče by odběr
   ani nemohl vzniknout, takže by to byl přepínač, po kterém nikdy nic
   nepřijde.

   Hotové je všechno ostatní: migrace supabase/hlidani-pushem.sql,
   obsluha v sw.js, strana prohlížeče v js/push.js, šifrování
   v scripts/web-push.mjs a rozesílač scripts/send-push.mjs.
   --------------------------------------------------------------------- */
window.PK_PUSH_VEREJNY_KLIC = '';
