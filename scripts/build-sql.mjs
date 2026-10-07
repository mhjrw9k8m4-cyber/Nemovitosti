// Složí supabase/00-vse.sql z jednotlivých SQL souborů.
//
// Proč: funkce create_listing existuje v repozitáři v několika verzích (jak
// přibývaly fotky, vybavení, limity…). Nikde nebylo zapsané, co už v databázi
// běží, takže se snadno stalo, že web volal novější podobu, než jaká tam byla
// — a přidání inzerátu skončilo chybou 404. Jeden soubor, který se pustí celý,
// tuhle otázku ruší.
//
// Ruční spuštění: node scripts/build-sql.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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
  ['saved-searches-vice.sql', 'hlídání: min. cena, max. výměra a cena za m²'],
  ['saved-searches-celek.sql', 'hlídání: jen celé pozemky (bez spoluvlastnických podílů)'],
  ['saved-searches-okruh.sql', 'hlídání: střed a okruh v km, ne jen název okresu'],
  // Až za okruhem: funkce hlidani_k_odeslani() vrací i stred_lat/okruh_km.
  ['hlidani-mailem.sql', 'hlídání e-mailem — dobrovolné, vypnuté, s odhlášením na klik'],
  ['hlidani-pushem.sql', 'hlídání jako upozornění do telefonu — dobrovolné, vypnuté'],
  ['watch-alerts.sql', 'hlídání lokality (double opt-in) + tabulka alert_seen'],
  ['listings-autopublish.sql', 'automatické zveřejnění inzerátu + token na úpravy'],
  ['listings-auth.sql', 'inzeráty pod účtem (user_id), my_listings, public_listings'],
  ['listings-photos.sql', 'fotky u inzerátu'],
  ['listings-features.sql', 'vybavení pozemku a přístup'],
  ['listings-moderation.sql', 'přísnější moderace obsahu'],
  ['listings-tiers.sql', 'limity počtu inzerátů podle účtu (account_tier)'],
  ['listings-rekonstrukce.sql', 'poslední verze create_listing — tu volá web'],
  ['listing-checks.sql', 'výsledky pravidelné kontroly odkazů a fotek'],
  // Musí být AŽ ZA listing-checks.sql (čte z jeho tabulky) a za
  // listings-rekonstrukce.sql, protože přepisuje my_listings().
  ['listings-kontrola-vlastnikovi.sql', 'výsledek noční kontroly vidí majitel inzerátu'],
  // Úplně poslední: přepisuje create_listing, public_listings i my_listings
  // (tomu přidává public_at), takže musí běžet až za vším, co je definuje.
  ['listings-prvni-kontrola.sql', 'první inzerát nového účtu čeká na kontrolu'],
  // Na ničem výš nezávisí: váže se jen na účet (auth.uid()) a na klíč
  // pozemku, který je text z dat, ne cizí klíč do listings.
  ['poznamky.sql', 'soukromé poznámky k pozemkům na účet, ne jen v prohlížeči'],
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

/* NA ŽÁDNOU MIGRACI SE NESMÍ ZAPOMENOUT.
   Seznam výš se píše ručně, protože na pořadí záleží — jenže ruční seznam
   se dá přehlédnout. Přesně to se stalo: saved-searches-okruh.sql přidává
   do uložených hledání střed a okruh, v repozitáři ležel, ale v seznamu
   nebyl. 00-vse.sql ho tedy neobsahoval, a protože web radí pouštět JEN
   00-vse.sql, nikdo by ty sloupce v databázi nezaložil: hlídání okruhu by
   po nasazení padalo na chybějící sloupec. Vada bez jediného příznaku
   v repozitáři — všechny soubory byly na svém místě.
   Teď se seznam porovnává s adresářem v obou směrech a sestavení se
   zastaví, dokud se nedoplní. Nic se nedoplňuje samo: kam soubor
   v pořadí patří, ví člověk, ne skript. */
/* A co se do balíku ÚMYSLNĚ nedává, se píše sem s důvodem. Mlčení by
   znamenalo, že se na soubor dá zapomenout podruhé. */
const MIMO = new Map([
  ['aktualizace.sql', 'starší dohánějící balík: nese create_listing o 13 parametrech '
    + 'a tabulku listing_checks, obojí už je v listings-rekonstrukce.sql '
    + 'a listing-checks.sql. V balíku by podle místa v pořadí mohl přepsat '
    + 'create_listing starší podobou — tedy přesně to, proti čemu 00-vse.sql je.'],
]);
{
  const naDisku = readdirSync(SQL).filter((f) => f.endsWith('.sql') && f !== '00-vse.sql').sort();
  const vSeznamu = PORADI.map(([j]) => j);
  const zapomenute = naDisku.filter((f) => !vSeznamu.includes(f) && !MIMO.has(f));
  const mimoNeexistuje = [...MIMO.keys()].filter((f) => !naDisku.includes(f));
  const mimoAZaroven = [...MIMO.keys()].filter((f) => vSeznamu.includes(f));
  const prebyvajici = vSeznamu.filter((f) => !naDisku.includes(f));
  const dvakrat = vSeznamu.filter((f, i) => vSeznamu.indexOf(f) !== i);
  const zle = [];
  if (zapomenute.length) {
    zle.push(`Tyhle soubory v supabase/ nejsou v seznamu PORADI, takže se do 00-vse.sql `
      + `nedostanou: ${zapomenute.join(', ')}. Zařaďte je tam, kam podle závislostí patří.`);
  }
  if (prebyvajici.length) zle.push(`V seznamu je soubor, který na disku není: ${prebyvajici.join(', ')}.`);
  if (mimoNeexistuje.length) zle.push(`Výjimka se píše na soubor, který na disku není: ${mimoNeexistuje.join(', ')}.`);
  if (mimoAZaroven.length) zle.push(`Soubor je zařazený i vyřazený naráz: ${mimoAZaroven.join(', ')}.`);
  if (dvakrat.length) zle.push(`V seznamu je soubor dvakrát: ${[...new Set(dvakrat)].join(', ')}.`);
  if (zle.length) { for (const z of zle) console.error('::error::' + z); process.exit(1); }
}

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
console.log(`Složeno ${PORADI.length} souborů do ${path.relative(ROOT, cil)}.`
  + (MIMO.size ? ` Mimo balík zůstává ${MIMO.size} (s napsaným důvodem).` : ''));
