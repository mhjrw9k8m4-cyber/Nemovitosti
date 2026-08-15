/* =====================================================================
   Pozemkomat — JEDNO místo pro zapnutí odesílání formulářů.

   Všechny formuláře na webu (upozornění na lokalitu, zpětná vazba,
   přidání pozemku, nahlášení inzerátu) čtou nastavení odsud. Stačí
   vyplnit JEDEN z řádků níže a je to živé na celém webu.

   A) Formspree — doporučeno, zdarma, ~2 minuty, bez vlastního serveru:
      1. Založte si účet na https://formspree.io
      2. Vytvořte formulář a zkopírujte jeho URL
         (např. https://formspree.io/f/abcdwxyz)
      3. Vložte ji do PK_FORM_ENDPOINT mezi uvozovky.

   B) Nebo jen e-mail — vyplňte PK_FORM_EMAIL (např. 'vas@email.cz').
      Formuláře pak otevřou poštovní aplikaci s předvyplněnou zprávou.

   Dokud je obojí prázdné, formuláře nic neodešlou a nikde netvrdíme,
   že zpráva dorazila (poctivý „offline" režim).
   ===================================================================== */
window.PK_FORM_ENDPOINT = '';
window.PK_FORM_EMAIL = '';
