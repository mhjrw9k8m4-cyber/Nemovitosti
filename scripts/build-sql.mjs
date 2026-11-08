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
  // Hned za schema.sql: potřebuje jen tabulku messages, kterou zakládá.
  // Dřív v repozitáři nebyl vůbec a v databázi přitom běžel — viz hlavička
  // souboru.
  ['zprava-upozorneni.sql', 'upozornění na novou zprávu z kontaktního formuláře'],
  // Hned za zprava-upozorneni.sql: zužuje pravidlo ze schema.sql
  // a přepisuje notify_new_message, takže musí běžet za oběma.
  ['zpravy-strop.sql', 'strop na zprávy z formuláře — anon je mohl posílat bez konce'],
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
  // Hned za listings-auth.sql: ruší to, co listings-auth.sql nahradil —
  // tokenový model vlastnictví inzerátu. Musí být AŽ ZA ním (bere
  // my_listing a delete_listing o dvou parametrech) a za schema.sql
  // (ruší jeho pravidlo na veřejné čtení celé tabulky listings).
  ['listings-token-pryc.sql', 'starý tokenový model inzerátů pryč — token šel přečíst veřejným klíčem'],
  ['listings-photos.sql', 'fotky u inzerátu'],
  ['listings-features.sql', 'vybavení pozemku a přístup'],
  ['listings-moderation.sql', 'přísnější moderace obsahu'],
  ['listings-tiers.sql', 'limity počtu inzerátů podle účtu (account_tier)'],
  // Až za listings-tiers.sql: strop na počet fotek se násobí povoleným
  // počtem inzerátů, a ten umí jen my_limit() z toho souboru.
  ['uloziste-strop.sql', 'strop na počet fotek, které účet nahraje do úložiště'],
  ['listings-rekonstrukce.sql', 'poslední verze create_listing — tu volá web'],
  ['listing-checks.sql', 'výsledky pravidelné kontroly odkazů a fotek'],
  // Musí být AŽ ZA listing-checks.sql (čte z jeho tabulky) a za
  // listings-rekonstrukce.sql, protože přepisuje my_listings().
  ['listings-kontrola-vlastnikovi.sql', 'výsledek noční kontroly vidí majitel inzerátu'],
  // Úplně poslední: přepisuje create_listing, public_listings i my_listings
  // (tomu přidává public_at), takže musí běžet až za vším, co je definuje.
  ['listings-prvni-kontrola.sql', 'první inzerát nového účtu čeká na kontrolu'],
  // Hned za ní, a to je podstatné: přepisuje create_listing (přidává typ
  // nemovitosti), public_listings i my_listings, takže musí běžet až za
  // souborem, který je definuje naposledy. Kdyby stála výš, přepsala by
  // ji zpátky podoba bez `kat`.
  ['listings-kategorie.sql', 'typ nemovitosti u inzerátu od člověka (dům, byt, garáž…)'],
  // Na ničem výš nezávisí: váže se jen na účet (auth.uid()) a na klíč
  // pozemku, který je text z dat, ne cizí klíč do listings.
  ['poznamky.sql', 'soukromé poznámky k pozemkům na účet, ne jen v prohlížeči'],
  // Taky na ničem nezávisí: vlastní tabulka čítačů, žádný cizí klíč,
  // žádná vazba na účet. Může být kdekoli, je tedy na konci.
  ['navstevnost.sql', 'vlastní měření návštěvnosti — čítače, bez cookies a bez IP'],
  // Taky bez vazeb: vlastní tabulka čítačů, žádný cizí klíč. Hned za
  // návštěvností, protože je to tatáž myšlenka na jiném čísle — čítač
  // místo záznamu o člověku.
  ['chyby-klienta.sql', 'chyby z prohlížeče návštěvníka — čítače hlášek, žádní lidé'],
  // Až za watch-alerts.sql: zužuje pravidlo, které zakládá schema.sql
  // a znovu potvrzuje watch-alerts.sql, takže musí běžet po obou.
  ['hlidani-anon-uzce.sql', 'veřejný zápis do watch_subscriptions bez obejití potvrzení e-mailu'],
  // Až za vším, co zakládá tabulky a funkce: přepisuje my_threads()
  // i unread_count() a zahazuje starší podoby save_search, takže musí
  // běžet po souborech, které je vytvořily.
  // Na ničem výš nezávisí: vlastní tabulka, klíč pozemku je text z dat.
  ['ulozene-na-uctu.sql', 'uložené pozemky na účtu, ne jen v prohlížeči'],
  ['vykon.sql', 'indexy, přepsané dotazy chatu a úklid starších podob funkcí'],
  // Úplně na konci schválně: vypisuje oprávnění všech funkcí výš, takže
  // má smysl teprve až jsou všechny založené.
  ['kontrola-opravneni.sql', 'kdo smí spustit kterou funkci — a kde to zůstalo na výchozím'],
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

/* FUNKCE BEZ PARAMETRŮ SE PŘED VYTVOŘENÍM ZAHODÍ.
   „create or replace function" umí přepsat tělo, ale NE návratový typ.
   Jakmile se u takové funkce změní tvar vracené tabulky — třeba se do
   výpisu inzerátů přidá sloupec — odmítne Postgres celý balík hláškou
   „cannot change return type of existing function" a nenasadí se NIC,
   ani to, co s tou funkcí nesouvisí. Právě na tom první ostré nasazení
   spadlo (public_listings).
   Zahazuje se podle PŘESNÉ podoby bez parametrů, ne přes cascade: cascade
   by vzal s sebou i to, co na funkci visí, a to je u databáze s ostrými
   daty příliš velká pravomoc na jeden příkaz. Seznam se čte ze složeného
   SQL, takže na novou funkci se nedá zapomenout.
   Funkce S parametry se nezahazují: u nich se podoba mění vzácně a slepé
   zahození by mohlo sebrat jinou funkci téhož jména s jinými parametry. */
const slozene = casti.join('');
/* SPOUŠTĚČOVÉ FUNKCE SE ZAHAZOVAT NESMÍ — a právě na tom nasazení
   6. 11. spadlo s chybou, která zahodila CELÝ balík:

     ERROR 2BP01: cannot drop function notify_new_message() because
     other objects depend on it
     DETAIL: trigger trg_notify_new_message on table messages depends on it

   Spouštěč na funkci visí, takže `drop function` bez `cascade` PostgreSQL
   odmítne. A protože se celý soubor posílá jako jeden dotaz, neprojde
   ani jeden z 3 820 řádků. Balík se tedy od chvíle, kdy do něj přibyl
   první spouštěč, nedal nasadit VŮBEC — a nikdo to nevěděl, protože
   nasazení se pouští ručně a mezitím se posílalo jen „nasucho".

   Důvod, proč se funkce bez parametrů zahazují, na spouštěčové neplatí:
   jde o změnu návratového typu, kterou „create or replace" neumí. Jenže
   návratový typ spouštěčové funkce je vždycky `trigger` a nic jiného
   z ní být nemůže. Zahazovat je tedy nepotřebné i škodlivé.

   `cascade` by to taky „vyřešilo" — vzalo by s sebou spouštěč. Jenže
   to je přesně ta pravomoc, kterou tenhle generátor nemá mít (viz
   komentář výš): na ostré databázi by jeden příkaz mohl odstranit něco,
   co se už znovu nevytvoří. */
const spoustecove = new Set(
  [...slozene.matchAll(/create\s+or\s+replace\s+function\s+([a-z_][a-z0-9_]*)\s*\(\s*\)\s*returns\s+trigger/gi)]
    .map((m) => m[1].toLowerCase()));
const bezParametru = [...new Set(
  [...slozene.matchAll(/create\s+or\s+replace\s+function\s+([a-z_][a-z0-9_]*)\s*\(\s*\)/gi)]
    .map((m) => m[1])
    .filter((f) => !spoustecove.has(f.toLowerCase()))
)].sort();
/* A KDYŽ NA FUNKCI NĚCO VISÍ, NEZAHAZUJE SE — ANI SE KVŮLI TOMU NESMÍ
   ZASTAVIT CELÉ NASAZENÍ.
   Naměřeno 8. 11. 2026 na ostré databázi: balík spadl hned na začátku
   hláškou
     ERROR 2BP01: cannot drop function my_limit() because other objects
     depend on it
     DETAIL: policy "listing photos auth upload" on table storage.objects
     depends on function my_limit()
   — tedy na pravidle úložiště, které si tu funkci volá. Nenasadilo se
   NIC, ani to, co s ní nesouvisí.
   `cascade` tu nemá co dělat: vzalo by s sebou to pravidlo a kbelík
   s fotkami by zůstal bez stropu. Drop je přitom jen PŘÍPRAVA pro
   případ, že se změnil návratový typ; když zahodit nejde, je pořád
   dobře možné, že se typ nezměnil a `create or replace` o kus níž
   projde. Proto se výjimka „na funkci něco visí" spolkne a pokračuje
   se dál. Když se návratový typ opravdu změnil, ohlásí to až to
   `create or replace` — a to je hláška, která říká pravdu, ne „nešlo
   zahodit". */
const dropy = bezParametru.length
  ? '\n-- Funkce bez parametrů: zahodit, než se vytvoří znovu. Viz komentář\n'
    + '-- v scripts/build-sql.mjs — jde o změnu návratového typu, kterou\n'
    + '-- „create or replace" neumí a která by shodila celé nasazení.\n'
    + '-- Když na funkci visí pravidlo nebo pohled, zahodit NEJDE a nezahodí\n'
    + '-- se: balík jede dál a typ si pohlídá „create or replace" níž.\n'
    + 'do $pk_dropy$\nbegin\n'
    + bezParametru.map((f) =>
      `  begin execute 'drop function if exists ${f}()';`
      + ` exception when dependent_objects_still_exist then null; end;`).join('\n')
    + '\nend $pk_dropy$;\n'
  : '';

const cil = path.join(SQL, '00-vse.sql');
/* Dropy patří hned za hlavičku, tedy před všechno ostatní. */
const znacka = HLAVA;
writeFileSync(cil, slozene.replace(znacka, znacka + dropy), 'utf8');
console.log(`Funkcí bez parametrů k zahození: ${bezParametru.length}`
  + (spoustecove.size ? ` (spouštěčové se nezahazují: ${[...spoustecove].sort().join(', ')})` : ''));
console.log(`Složeno ${PORADI.length} souborů do ${path.relative(ROOT, cil)}.`
  + (MIMO.size ? ` Mimo balík zůstává ${MIMO.size} (s napsaným důvodem).` : ''));
