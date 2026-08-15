/* =====================================================================
   Pozemkomat — JEDNO místo pro zapnutí odesílání formulářů.

   Všechny formuláře (upozornění na lokalitu, zpětná vazba, přidání
   pozemku, nahlášení inzerátu) čtou nastavení odsud. Žádný e-mail
   není na webu — dokud je níže prázdno, formuláře nic neodešlou a
   nikde netvrdíme opak (poctivý „offline" režim).

   AŽ BUDETE CHTÍT ODESÍLÁNÍ ZAPNOUT — bez toho, aby byl váš e-mail
   vidět na webu — použijte Formspree (zdarma, ~2 minuty):
     1. Založte si účet na https://formspree.io (e-mail zadáte jen tam,
        na web se nedostane).
     2. Vytvořte formulář a zkopírujte jeho URL, např.
        https://formspree.io/f/abcdwxyz  (je to náhodný kód, ne e-mail).
     3. Vložte ji mezi uvozovky do PK_FORM_ENDPOINT níže — a je to živé.
   ===================================================================== */
window.PK_FORM_ENDPOINT = '';
window.PK_FORM_EMAIL = '';
