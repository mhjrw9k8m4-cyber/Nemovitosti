/* =====================================================================
   Pozemkomat — JEDNO místo pro odesílání formulářů.

   Všechny formuláře na webu (upozornění na lokalitu, zpětná vazba,
   přidání pozemku, nahlášení inzerátu) čtou nastavení odsud.

   AKTUÁLNĚ ZAPOJENO přes FormSubmit.co — služba zdarma, bez registrace,
   posílá odeslané formuláře rovnou na váš e-mail.

   >>> JEDNORÁZOVÁ AKTIVACE (nutná jednou): <<<
   1. Otevřete web, odešlete jakýkoli formulář (např. „Napište nám").
   2. Na váš e-mail dorazí od FormSubmit potvrzovací zpráva — klikněte
      v ní na odkaz „Activate".
   3. Od té chvíle vám všechny formuláře chodí do schránky.

   Chcete e-mail na webu skrýt? Po aktivaci vám FormSubmit pošle náhodný
   kód — nahraďte jím adresu níže (…/ajax/VASNAHODNYKOD).
   Nebo přejděte na Formspree: vložte jeho URL do PK_FORM_ENDPOINT.
   Když obojí vyprázdníte, běží poctivý „offline" režim (nic se neodešle).
   ===================================================================== */
window.PK_FORM_ENDPOINT = 'https://formsubmit.co/ajax/' + ['killerxxxpro', 'seznam.cz'].join('@');
window.PK_FORM_EMAIL = '';
