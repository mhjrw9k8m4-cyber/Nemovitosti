/* =====================================================================
   Parcelka — nastavení pro ukládání formulářů.

   Formuláře (hlídání lokality, kontakt, zpětná vazba, nahlášení inzerátu)
   ukládají poptávky přímo do databáze Supabase.

   Klíč PK_SUPABASE_KEY je „publishable" (veřejný) — je bezpečné mít ho
   v prohlížeči. Chrání ho pravidla řádkové bezpečnosti (RLS): z webu jde
   jen VKLÁDAT (odeslat formulář), ne číst cizí data. Zprávy uvidíte
   v Supabase → Table Editor (tabulky messages a watch_subscriptions).
   ===================================================================== */
window.PK_SUPABASE_URL = 'https://tcinuzftgmkvjjgvadky.supabase.co';
window.PK_SUPABASE_KEY = 'sb_publishable_mnPDOe03iHjoDxc7C2x2iA_q4HOSec0';

/* Starší nastavení (Formspree) — už se nepoužívá, ponecháno jen pro jistotu. */
window.PK_FORM_ENDPOINT = '';
window.PK_FORM_EMAIL = '';
