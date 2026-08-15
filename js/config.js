/* =====================================================================
   Pozemkomat — JEDNO místo pro odesílání formulářů.

   Všechny formuláře (upozornění na lokalitu, zpětná vazba, přidání
   pozemku, nahlášení inzerátu) čtou nastavení odsud.

   ZAPOJENO přes Formspree — odesílá na váš e-mail, který na webu NENÍ
   vidět (endpoint je jen náhodný kód). Chcete cíl změnit? Vložte jiný
   Formspree odkaz do PK_FORM_ENDPOINT, nebo pole vyprázdněte (pak běží
   poctivý „offline" režim a nic se neodešle).
   ===================================================================== */
window.PK_FORM_ENDPOINT = 'https://formspree.io/f/moeanjaz';
window.PK_FORM_EMAIL = '';
