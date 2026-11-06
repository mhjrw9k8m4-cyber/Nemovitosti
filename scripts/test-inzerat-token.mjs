// Test: cizí inzerát nesmí jít smazat veřejným klíčem (§466).
//
// Spuštění: node scripts/test-inzerat-token.mjs   (bez sítě, bez databáze)
//
// NÁLEZ 6. 11. V supabase/00-vse.sql ležely vedle sebe DVA modely
// vlastnictví inzerátu:
//   starý  — inzerát patří tomu, kdo zná `listings.token`;
//            my_listing(uuid,uuid) a delete_listing(uuid,uuid), obě
//            povolené roli `anon`, tedy klíči z js/config.js;
//   nový   — inzerát patří účtu (user_id = auth.uid()), maže
//            delete_listing(uuid) a chce přihlášení.
//
// Starý model stál na tom, že token je tajný. Nebyl: pravidlo
// „verejne cteni schvalenych" pouštělo komukoli `select=*` na celou
// tabulku `listings` a `*` zahrnuje `token`. Dva dotazy veřejným
// klíčem — přečíst `id,token`, zavolat delete_listing — a kdokoli
// smaže kterýkoli zveřejněný inzerát.
//
// CO SE TU HLÍDÁ. Ne přítomnost řádků v SQL (tu se dá obejít tím, že
// se pod ně dopíše opak), ale KONEČNÝ STAV balíku: co v databázi
// zůstane, až 00-vse.sql doběhne celý. Čte se to tedy v pořadí
// příkazů a u funkcí podle podpisu, protože delete_listing existuje
// ve dvou podobách a smí přežít právě ta jednoparametrová.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { VEREJNE_TABULKY } from './kontrola-databaze.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nInzerát a starý token');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Inzerát a starý token: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const SQL = readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8');

/* ---------- 1) KONEČNÝ STAV: funkce a jejich podpisy -------------
   Vlastní čtení schválně, ne přes ocekavaneZeSQL(): kdyby se v tom
   parseru stala chyba, hlídač postavený na něm by ji zopakoval
   a mlčel by o ní zároveň s ním (§438 — kontrola, která zná jen to,
   co zná hlídané místo, nehlídá nic). */
function typyZSeznamu(seznam) {
  const kusy = [];
  let hloubka = 0, ted = '', vApostrofu = false;
  for (const z of String(seznam)) {
    if (vApostrofu) { ted += z; if (z === "'") vApostrofu = false; continue; }
    if (z === "'") { vApostrofu = true; ted += z; continue; }
    if (z === '(' || z === '[') hloubka++;
    if (z === ')' || z === ']') hloubka--;
    if (z === ',' && hloubka === 0) { kusy.push(ted); ted = ''; continue; }
    ted += z;
  }
  if (ted.trim()) kusy.push(ted);
  return kusy.map((k) => {
    const t = k.replace(/\s+default\s[\s\S]*$/i, '').trim().replace(/\s+/g, ' ');
    const slova = t.split(' ');
    if (slova.length > 1 && !/^(precision|varying)$/i.test(slova[1])) return slova.slice(1).join(' ').toLowerCase();
    return t.toLowerCase();
  }).join(',');
}
/** Podpisy funkcí daného jména, které po doběhnutí SQL zůstanou. */
function zbylePodpisy(jmeno) {
  const zive = new Set();
  const re = new RegExp(
    `^(create (?:or replace )?function|drop function if exists) (${jmeno})\\s*\\(([^)]*(?:\\([^)]*\\)[^)]*)*)\\)`, 'gmi');
  for (const m of SQL.matchAll(re)) {
    const podpis = typyZSeznamu(m[3]);
    if (/^create/i.test(m[1])) zive.add(podpis); else zive.delete(podpis);
  }
  return zive;
}

const myListing = zbylePodpisy('my_listing');
pravda('my_listing(uuid,uuid) v databázi po nasazení NEZŮSTANE',
  !myListing.has('uuid,uuid'), [...myListing].join(' | ') || 'žádný podpis');
pravda('a nezůstane po ní vůbec nic (náhradu má my_listings() pod účtem)',
  myListing.size === 0, [...myListing].join(' | '));

const delListing = zbylePodpisy('delete_listing');
pravda('delete_listing(uuid,uuid) — mazání cizím tokenem — nezůstane',
  !delListing.has('uuid,uuid'), [...delListing].join(' | '));
pravda('ale delete_listing(uuid) pod účtem zůstat MUSÍ (web ji volá)',
  delListing.has('uuid'), [...delListing].join(' | ') || 'žádný podpis');

/* ---------- 2) KONEČNÝ STAV: veřejné čtení tabulky listings ------
   Pravidlo zakládá supabase/schema.sql a ruší listings-token-pryc.sql.
   Hlídá se pořadí: kdyby se soubor v PORADI přesunul před schema.sql,
   pravidlo by vzniklo PO zrušení a díra by se otevřela znovu — a řádky
   v obou souborech by přitom zůstaly nedotčené. */
function politikyNaListings() {
  const zive = new Set();
  const re = /^(create policy|drop policy if exists)\s+"([^"]+)"\s*(?:\r?\n\s*)?on (\w+)/gmi;
  for (const m of SQL.matchAll(re)) {
    if (m[3].toLowerCase() !== 'listings') continue;
    if (/^create/i.test(m[1])) zive.add(m[2]); else zive.delete(m[2]);
  }
  return zive;
}
const politiky = politikyNaListings();
pravda('pravidlo „verejne cteni schvalenych" na listings nepřežije',
  !politiky.has('verejne cteni schvalenych'), [...politiky].join(' | ') || 'žádné pravidlo');
pravda('a nezůstane na té tabulce ŽÁDNÉ pravidlo '
  + '(veřejná data jdou funkcí public_listings, ta vybírá sloupce jmenovitě)',
  politiky.size === 0, [...politiky].join(' | '));
pravda('RLS na listings je přitom zapnuté (bez něj by prázdno pravidel pustilo všechno)',
  /alter table listings enable row level security/i.test(SQL), 'chybí „enable row level security"');

/* ---------- 3) KONEČNÝ STAV: sloupec token ----------------------- */
function sloupecTokenZbyva() {
  let je = false;
  /* Zakládá ho `create table`? Pak je na začátku. */
  const telo = (SQL.match(/^create table if not exists listings\s*\(([\s\S]*?)\n\);/mi) || [])[1] || '';
  if (/^\s*token\s/mi.test(telo)) je = true;
  for (const m of SQL.matchAll(/^alter table listings (add|drop) column if (?:not )?exists token\b/gmi)) {
    je = m[1].toLowerCase() === 'add';
  }
  return je;
}
pravda('sloupec listings.token po nasazení neexistuje', !sloupecTokenZbyva(),
  'dokud existuje, může se na něj navázat nová funkce a díra se otevře znovu');

/* ---------- 4) nic ho nečte ani nevydává ------------------------- */
const vydavaToken = [...SQL.matchAll(/^create (?:or replace )?function (public_listings|my_listings)\b[\s\S]*?\$\$;/gmi)]
  .filter((m) => /\btoken\b/.test(m[0])).map((m) => m[1]);
pravda('ani public_listings, ani my_listings token nevydávají',
  vydavaToken.length === 0, vydavaToken.join(', '));

/* ---------- 5) web o tokenovém modelu neví ----------------------- */
const strankyAJs = [
  ...readdirSync(KOREN).filter((f) => f.endsWith('.html')).map((f) => path.join(KOREN, f)),
  ...readdirSync(path.join(KOREN, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join(KOREN, 'js', f)),
];
const volaTokenem = [];
for (const f of strankyAJs) {
  const t = readFileSync(f, 'utf8');
  if (/p_token\s*[:=]/.test(t) && /delete_listing|my_listing\b/.test(t)) volaTokenem.push(path.basename(f));
}
pravda('žádná stránka ani modul nevolá mazání inzerátu s tokenem',
  volaTokenem.length === 0, volaTokenem.join(', '));

/* ---------- 6) a hlídač databáze už tu výjimku nemá -------------- */
pravda('kontrola databáze nepovažuje za v pořádku, že tabulku čte kdokoli',
  Array.isArray(VEREJNE_TABULKY) && VEREJNE_TABULKY.length === 0,
  'VEREJNE_TABULKY = ' + JSON.stringify(VEREJNE_TABULKY));
/* NA PRÓZU SE TU NESPOLÉHÁ. Pokušení je přidat kontrolu „a v tom
   souboru už nestojí, že my_listing je pro anon povolená schválně" —
   jenže ta věta v něm stát MÁ: je tam zapsaná jako nález, s tím, proč
   neplatila. Hlídač, který zakazuje slova, by nutil smlčet, co se
   zjistilo. Drží to tedy chování: `VEREJNE_TABULKY` výš. Kdyby se
   `listings` do toho seznamu vrátily, padne tahle kontrola — a je to
   přesně ten krok, kterým by díra vznikla znovu. */
const kontrola = readFileSync(path.join(KOREN, 'scripts', 'kontrola-databaze.mjs'), 'utf8');
pravda('a je v ní napsané, kde se ta díra zavřela (ať se to dá dohledat)',
  /listings-token-pryc\.sql/.test(kontrola),
  'odkaz na supabase/listings-token-pryc.sql chybí');

hotovo();
