/* Jak se robot představuje — jedno jméno pro celý web.
   ====================================================================
   Hlavička user-agent stála v repozitáři čtyřikrát a dvakrát JINAK:
   scripts/fetch-opportunities.mjs posílal „(+https://www.parcelaka.cz)",
   scripts/kontrola-inzeratu.mjs „(+https://parcelaka.cz)" — tedy bez
   www. Pro člověka je to totéž, pro protistranu dvě různé jména: kdo
   si na nás na druhé straně udělá pravidlo, trefí jen půlku našich
   dotazů.

   JMÉNO ZŮSTÁVÁ PRAVDIVÉ. Je v něm, co to je (ParcelkaBot), verze
   a adresa, na které se dá zjistit, kdo za tím stojí a co s daty
   děláme. Nestřídá se, nepředstírá prohlížeč a neobchází nic — kdo
   tohle jméno nechce, má ho na co zablokovat, a to je v pořádku.
   ==================================================================== */
export const BOT_UA = 'ParcelkaBot/1.0 (+https://www.parcelaka.cz)';
