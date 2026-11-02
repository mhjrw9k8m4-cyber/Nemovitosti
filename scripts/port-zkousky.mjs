/* JEDEN PORT NA JEDNOM MÍSTĚ.
   ==================================================================
   117 ze 132 prohlížečových zkoušek sdílí tentýž port — schválně:
   běžec sady je proto pouští jednu po druhé a nepadají na EADDRINUSE
   (viz docs/optimalizace.md, oddíl 151). Číslo si ale každá z nich
   opisovala k sobě, většinou dokonce jako celou adresu. Sto devět
   kopií jednoho čísla znamená, že změnit port nejde.

   Tenhle modul je proto SCHVÁLNĚ PRÁZDNÝ NA ČINNOST: jen dvě
   konstanty, žádný server, žádný import. Kdo chce i falešnou
   databázi, bere si `BASE` z `falesna-supabase-chat.mjs` (ten server
   opravdu spustí); kdo si server dělá sám, bere si `PORT` odsud a
   nic se mu tím nespustí.
   ================================================================== */
/* PŘEPÍNATELNÝ PŘES PROMĚNNOU, AŤ JDOU SMĚNY PUSTIT SOUBĚŽNĚ.
   V CI běží tři prohlížečové směny jako tři úlohy vedle sebe, každá na
   svém stroji. Lokálně sdílely jediný port, takže musely jít jedna po
   druhé — naměřeno 12 zkoušek za 25 minut, celá sada přes pět hodin.
   Tím se stalo, že jsem před pushem pouštěl jen rychlou sadu a CI pak
   padalo na něčem, co rychlá sada nezná (viz docs §319).
   S `PK_PORT` jde každé směně dát vlastní port a pustit je naráz.
   Výchozí hodnota se nemění, takže kdo nic nenastaví, má to jako dřív. */
export const PORT = Number(process.env.PK_PORT) || 8310;
export const BASE = `http://127.0.0.1:${PORT}`;

/* VOLNÝ PORT NA POŽÁDÁNÍ.
   ==================================================================
   Patnáct zkoušek si drží VLASTNÍ server (falešná databáze, falešné
   GitHub API, stránka bez mapy…) a každá k tomu měla port napsaný
   natvrdo. Pevné číslo je sázka na to, že ho na stroji nikdo nemá —
   a ta sázka 2. 11. třikrát prohrála: `test-parametry` (8321) spadlo
   na portu souběžné směny a `test-nova-verze` s `test-prihlaseni`
   (8399) na obyčejném serveru, který jsem si pustil k měření. Pokaždé
   to vypadalo jako vada webu a pokaždé stálo kolo hledání.

   Tahle funkce si o port řekne operačnímu systému: otevře naslouchání
   na nule (což znamená „dej mi jakýkoli volný"), přečte si číslo a zase
   zavře. Mezi zavřením a znovuotevřením je teoreticky skulina, kam se
   vejde cizí program — jenže jádro přiděluje efemérní porty po řadě
   a nevrací se k nim hned, takže je to řádově bezpečnější než číslo
   opsané v souboru před třemi týdny.

   SDÍLENÝ PORT (PORT výš) TÍM NEKONČÍ a je to schválně: 117 zkoušek
   na něm staví týž server s falešnou databází a běžec sady je právě
   proto pouští jednu po druhé. Tohle je pro ty, které mají server
   svůj. */
export function volnyPort() {
  return new Promise((splnit, zamitnout) => {
    import('node:net').then(({ default: net }) => {
      const s = net.createServer();
      s.once('error', zamitnout);
      s.listen(0, '127.0.0.1', () => {
        const cislo = s.address().port;
        s.close(() => splnit(cislo));
      });
    }, zamitnout);
  });
}
