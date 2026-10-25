/* Port zkušebního serveru pro kontrolu inzerátů, na jednom místě.
   ==================================================================
   Stejný důvod jako u scripts/port-zkousky.mjs: číslo portu se opisovalo
   na dvou místech (server a zkouška, která na něj čeká), a zkouška si
   ho musí umět přečíst, aniž by ten server spustila. Modul je proto
   schválně bez činnosti — jedna konstanta, nic víc.
   ================================================================== */
export const PORT = 8200;
