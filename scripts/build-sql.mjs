// Složí supabase/00-vse.sql z jednotlivých SQL souborů.
//
// Proč: funkce create_listing existuje v repozitáři v několika verzích (jak
// přibývaly fotky, vybavení, limity…). Nikde nebylo zapsané, co už v databázi
// běží, takže se snadno stalo, že web volal novější podobu, než jaká tam byla
// — a přidání inzerátu skončilo chybou 404. Jeden soubor, který se pustí celý,
// tuhle otázku ruší.
//
// Ruční spuštění: node scripts/build-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = path.join(ROOT, 'supabase');

// Pořadí není abecední, ale podle závislostí: tabulky dřív než funkce nad nimi,
// listings-tiers dřív než listings-rekonstrukce (potřebuje account_tier) a
// poslední v řadě je ta verze create_listing, kterou web opravdu volá.
const PORADI = [
  ['schema.sql', 'základní tabulky: listings, watch_subscriptions, payments, messages'],
  ['messaging.sql', 'zprávy mezi zájemcem a majitelem'],
  ['messaging-fix.sql', 'oprava chatu a úklid'],
  ['saved-searches.sql', 'uložená hledání'],
  ['watch-alerts.sql', 'hlídání lokality (double opt-in) + tabulka alert_seen'],
  ['listings-autopublish.sql', 'automatické zveřejnění inzerátu + token na úpravy'],
  ['listings-auth.sql', 'inzeráty pod účtem (user_id), my_listings, public_listings'],
  ['listings-photos.sql', 'fotky u inzerátu'],
  ['listings-features.sql', 'vybavení pozemku a přístup'],
  ['listings-moderation.sql', 'přísnější moderace obsahu'],
  ['listings-tiers.sql', 'limity počtu inzerátů podle účtu (account_tier)'],
  ['listings-rekonstrukce.sql', 'poslední verze create_listing — tu volá web'],
  ['listing-checks.sql', 'výsledky pravidelné kontroly odkazů a fotek'],
];

const HLAVA = `-- =====================================================================
-- Parcelka — CELÁ DATABÁZE V JEDNOM SOUBORU
--
-- Proč tenhle soubor vznikl: funkce create_listing existovala v repozitáři
-- v sedmi verzích, každá v jiném souboru a s jiným počtem parametrů. Nikde
-- nebylo zapsané, co už v databázi běží — a když v ní zůstane starší verze,
-- web ji volá se třinácti parametry, PostgREST žádnou takovou funkci
-- nenajde a přidání inzerátu skončí chybou 404, kterou uživatel vidí jen
-- jako „nepovedlo se".
--
-- Jak to použít:
--   Supabase → SQL Editor → New query → vložit CELÝ tento soubor → Run.
--
-- Je to bezpečné pustit i opakovaně: tabulky se zakládají přes
-- „if not exists", politiky se před vytvořením ruší a funkce se přepisují.
-- Nic se nemaže kromě zastaralých podob funkce create_listing hned na
-- začátku — ty musí pryč, jinak by u volání vznikla nejednoznačnost.
--
-- NEUPRAVUJ RUČNĚ. Vzniká z jednotlivých souborů v supabase/ příkazem
--   node scripts/build-sql.mjs
-- =====================================================================

-- Zastaralé podoby create_listing (10 a 11 parametrů). Když v databázi
-- zůstanou vedle nové, je volání nejednoznačné a PostgREST ho odmítne.
drop function if exists create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text);
drop function if exists create_listing(text,text,text,text,integer,integer,double precision,double precision,text,text,jsonb);
`;

const casti = [HLAVA];
for (const [jmeno, popis] of PORADI) {
  const obsah = readFileSync(path.join(SQL, jmeno), 'utf8').trimEnd();
  casti.push(
    '\n\n-- ---------------------------------------------------------------------\n' +
    `-- ${jmeno} — ${popis}\n` +
    '-- ---------------------------------------------------------------------\n\n' +
    obsah + '\n'
  );
}

const cil = path.join(SQL, '00-vse.sql');
writeFileSync(cil, casti.join(''), 'utf8');
console.log(`Složeno ${PORADI.length} souborů do ${path.relative(ROOT, cil)}.`);
