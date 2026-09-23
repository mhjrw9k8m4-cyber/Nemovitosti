// Test: ptáme se databáze jen na sloupce, které opravdu existují.
//
// Spuštění: node scripts/test-sloupce.mjs
//
// Pravidelná kontrola inzerátů padala hned na prvním kroku:
//
//     CHYBA: Supabase 400: column listings.url does not exist
//
// V dotazu byl sloupec „url", jenže ten má jen sbíraná příležitost, ne
// inzerát od člověka. Supabase na neznámý sloupec odmítne CELÝ dotaz, takže
// se neprověřila ani jedna fotka — a protože ten úklid běží podle plánu
// a ne při nahrání kódu, nikoho to nevyrušilo.
//
// Překlep ve jménu sloupce je přitom to nejsnazší, co se dá udělat, a nikde
// se neprojeví dřív než v ostrém provozu. Tenhle test porovná každý dotaz
// v kódu se schématem v supabase/*.sql. Databázi k tomu nepotřebuje.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// --- Co v databázi je --------------------------------------------------
const sqlSoubory = readdirSync(path.join(KOREN, 'supabase')).filter((f) => f.endsWith('.sql'));
const sql = sqlSoubory.map((f) => readFileSync(path.join(KOREN, 'supabase', f), 'utf8')).join('\n');
const tabulky = new Map();
for (const m of sql.matchAll(/create table if not exists (\w+)\s*\(([\s\S]*?)\n\);/g)) {
  const sloupce = new Set();
  for (const radek of m[2].split('\n')) {
    const r = radek.trim();
    if (!r || r.startsWith('--')) continue;
    if (/^(constraint|primary key|unique|check|foreign key)\b/i.test(r)) continue;
    const g = r.match(/^([a-z_][a-z0-9_]*)\s/);
    if (g) sloupce.add(g[1]);
  }
  tabulky.set(m[1], sloupce);
}
// Sloupce dodané později.
for (const m of sql.matchAll(/alter table (\w+) add column if not exists (\w+)/g)) {
  if (!tabulky.has(m[1])) tabulky.set(m[1], new Set());
  tabulky.get(m[1]).add(m[2]);
}
pravda('schéma databáze se načetlo', tabulky.size >= 5,
  `našlo se jen ${tabulky.size} tabulek v supabase/*.sql`);

// --- Na co se kód ptá --------------------------------------------------
// Testy samy sem nepatří — píše se v nich o dotazech, ne že by je dělaly.
const soubory = [
  ...readdirSync(path.join(KOREN, 'scripts')).filter((f) => f.endsWith('.mjs') && !f.startsWith('test-')).map((f) => 'scripts/' + f),
  ...readdirSync(path.join(KOREN, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f),
];
const spatne = [], neznameTabulky = [], dotazy = [];
let dotazu = 0;
for (const f of soubory) {
  const t = readFileSync(path.join(KOREN, f), 'utf8');
  for (const m of t.matchAll(/[`'"](\w+)\?select=([a-zA-Z0-9_,()*]+)/g)) {
    dotazu++;
    const [, tabulka, seznam] = m;
    dotazy.push({ tabulka, soubor: f });
    if (!tabulky.has(tabulka)) { neznameTabulky.push(`${f}: ${tabulka}`); continue; }
    for (const s of seznam.split(',')) {
      const sloupec = s.split('(')[0].trim();
      if (!sloupec || sloupec === '*') continue;
      if (!tabulky.get(tabulka).has(sloupec)) spatne.push(`${f}: ${tabulka}.${sloupec}`);
    }
  }
}
// Přímých dotazů na tabulky je v kódu jen pár — skoro všechno jde přes
// uložené funkce (RPC), které se kontrolují níž. Ať je ale jisté, že test
// opravdu něco čte, a hlavně že vidí ten dotaz, který padal.
pravda('dotazy na tabulky se našly', dotazu >= 2, `našlo se jen ${dotazu}`);
pravda('a je mezi nimi kontrola inzerátů', dotazy.some((d) => d.tabulka === 'listings'),
  'právě tenhle dotaz kvůli neexistujícímu sloupci padal — test ho musí vidět');
// Tohle je jádro testu.
pravda('každý dotazovaný sloupec v databázi existuje', spatne.length === 0,
  spatne.join('\n      ') +
  '\n      Supabase na neznámý sloupec odmítne CELÝ dotaz (400) — ta funkce prostě přestane fungovat.');
pravda('a každá dotazovaná tabulka taky', neznameTabulky.length === 0,
  neznameTabulky.join('\n      ') + '\n      (pohledy a RPC se tu nehlídají — ty v supabase/*.sql nejsou)');

// --- Uložené funkce (RPC) --------------------------------------------
// Tudy jde skoro celá aplikace: přihlášení, inzeráty, zprávy, hlídání.
// Překlep ve jméně funkce vypadá stejně nevinně jako překlep ve sloupci
// a projeví se taky až v ostrém provozu.
const funkce = new Set();
for (const m of sql.matchAll(/create (?:or replace )?function (?:public\.)?(\w+)/g)) funkce.add(m[1]);
const volane = new Map();
for (const f of soubory) {
  const t = readFileSync(path.join(KOREN, f), 'utf8');
  // Dvojí zápis: přímá adresa (.../rest/v1/rpc/jmeno) a pomocník rpc('jmeno', …).
  for (const m of t.matchAll(/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)/g)) volane.set(m[1], f);
  for (const m of t.matchAll(/\brpc\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g)) volane.set(m[1], f);
}
pravda('uložené funkce se ve schématu našly', funkce.size >= 5, `jen ${funkce.size}`);
pravda('a volání se v kódu opravdu našla', volane.size >= 5, `našlo se jen ${volane.size} — test by mlčel`);
const chybejici = [...volane].filter(([n]) => !funkce.has(n));
pravda('každá volaná uložená funkce v databázi existuje', chybejici.length === 0,
  chybejici.map(([n, f]) => `${f}: ${n}()`).join('\n      '));

/* --- Změna návratového typu potřebuje DROP ---------------------------
   PostgreSQL nedovolí „create or replace function", když se mění
   návratový typ — skončí to chybou „cannot change return type of
   existing function". V 00-vse.sql se přitom některé funkce definují
   několikrát za sebou, jak se postupně rozšiřovaly. Bez „drop function
   if exists" před tou další spadne CELÝ skript v SQL Editoru a člověk
   se nedozví, že se změna nenasadila — web pak volá starou verzi
   a chybí mu sloupce, o kterých si myslí, že je má.
   Stalo se to při psaní listings-kontrola-vlastnikovi.sql: první verze
   drop neměla.

   Pozor na dvě věci, na kterých se první podoba téhle kontroly spletla:
     · Funkce se v PostgreSQL rozlišují jménem I ARGUMENTY. create_listing
       s deseti a s třinácti parametry jsou dvě různé funkce a navzájem
       si nevadí. Porovnávat se proto musí až v rámci téhož seznamu
       argumentů.
     · Drop nemusí stát těsně nad definicí. Stačí, když je kdekoli mezi
       předchozí definicí téže funkce a touhle. */
{
  const vse = readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8');
  const radky = vse.split('\n');
  const hlavicky = [];
  for (let i = 0; i < radky.length; i++) {
    const m = radky[i].match(/^create or replace function ([a-z_][a-z0-9_]*)\s*\(/);
    if (!m) continue;
    let text = '';
    for (let j = i; j < Math.min(radky.length, i + 14); j++) {
      text += ' ' + radky[j];
      if (/as \$\$/.test(radky[j])) break;
    }
    const args = (text.match(/\(([\s\S]*?)\)\s*returns/i) || [])[1] || '';
    const vraci = (text.match(/returns\s+([\s\S]*?)\s+language/i) || [])[1] || '';
    /* Podpis se pozná podle TYPŮ argumentů, ne podle jejich jmen. */
    const typy = args.split(',').map((a) => a.trim().split(/\s+/).slice(1).join(' ').toLowerCase()).join(',');
    hlavicky.push({ radek: i, jmeno: m[1], podpis: m[1] + '(' + typy + ')',
      vraci: vraci.replace(/\s+/g, ' ').trim() });
  }
  const spatne = [];
  const posledni = new Map();   // podpis → {radek, vraci}
  for (const h of hlavicky) {
    const drive = posledni.get(h.podpis);
    if (drive && drive.vraci !== h.vraci) {
      const mezi = radky.slice(drive.radek, h.radek).join('\n');
      const maDrop = new RegExp('drop function if exists ' + h.jmeno + '\\s*\\(').test(mezi);
      if (!maDrop) {
        spatne.push(`${h.jmeno}() na řádku ${h.radek + 1} mění návratový typ oproti řádku ${drive.radek + 1}, a mezi nimi není „drop function if exists"`);
      }
    }
    posledni.set(h.podpis, { radek: h.radek, vraci: h.vraci });
  }
  pravda('každá změna návratového typu má před sebou drop', spatne.length === 0,
    spatne.join('\n      ') + '\n      (bez něj skript v SQL Editoru spadne a změna se nenasadí)');
}

console.log('\nDotazy do databáze proti schématu');
console.log(zpravy.join('\n'));
console.log(`\nzkontrolováno ${dotazu} dotazů a ${volane.size} volaných funkcí proti ${tabulky.size} tabulkám`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Sloupce v dotazech: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
