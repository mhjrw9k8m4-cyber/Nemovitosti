/* =====================================================================
   Pozemkomat — JEDNO místo pro odesílání formulářů.

   Všechny formuláře na webu (upozornění na lokalitu, zpětná vazba,
   přidání pozemku, nahlášení inzerátu) čtou nastavení odsud.

   AKTUÁLNĚ ZAPOJENO přes FormSubmit.co — služba zdarma, bez registrace,
   posílá odeslané formuláře rovnou na váš e-mail.

   >>> JEDNORÁZOVÁ AKTIVACE (nutná jednou): <<<
   1. Otevřete NASAZENÝ web (ne lokálně) a odešlete jakýkoli formulář
      — třeba nahoře „Napište nám".
   2. Teprve TÍM se spustí potvrzovací e-mail od FormSubmit. Přijde na
      adresu níže — zkontrolujte i složku SPAM / Hromadné.
      Odesílatel je FormSubmit (ne Pozemkomat).
   3. Klikněte v něm na odkaz „Activate". Od té chvíle vám formuláře
      chodí do schránky.

   Chcete e-mail na webu skrýt? Po aktivaci vám FormSubmit pošle náhodný
   kód — nahraďte jím adresu níže (…/ajax/VASNAHODNYKOD). Nebo přejděte
   na Formspree: vložte jeho URL do PK_FORM_ENDPOINT.
   ===================================================================== */
window.PK_FORM_ENDPOINT = 'https://formsubmit.co/ajax/' + ['killerxxxpro', 'seznam.cz'].join('@');
window.PK_FORM_EMAIL = '';
