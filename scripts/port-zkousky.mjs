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
export const PORT = 8310;
export const BASE = `http://127.0.0.1:${PORT}`;
