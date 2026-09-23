// Test: celá databáze se dá založit na čistém PostgreSQL.
//
// Spuštění: node scripts/test-sql-cista.mjs
//   (potřebuje PostgreSQL; bez něj se test přeskočí, ale NAHLAS)
//
// Proč vznikl: supabase/00-vse.sql má v hlavičce napsáno, že je to
// „CELÁ DATABÁZE V JEDNOM SOUBORU" — člověk ho jednou vloží do SQL
// Editoru a má hotovo. Jenže se to nikdy nezkusilo. Když jsem ho pustil
// proti opravdovému PostgreSQL 16, vysypal tohle:
//
//   184: ERROR: column l.user_id does not exist
//   246: ERROR: column l.user_id does not exist
//   247: ERROR: function my_threads() does not exist
//   277: ERROR: column l.user_id does not exist
//   278: ERROR: function unread_count() does not exist
//   749: ERROR: cannot change return type of existing function
//
// Tabulka listings dostávala sloupec user_id až o pět set řádků později,
// jenže politiky chatu na něj sahaly dřív — takže se na novém projektu
// NEVYTVOŘILY funkce my_threads() ani unread_count() a zprávy
// nefungovaly. A „create or replace" nesmí měnit návratový typ, na což
// doplatily create_listing i public_listings.
//
// Chyba proběhne uprostřed dlouhého výpisu a SQL Editor jede dál, takže
// si jí nikdo nevšimne. Proto tenhle test: skript se pustí doopravdy
// a nesmí ohlásit ŽÁDNOU chybu, kromě těch, které patří jen Supabase.
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Supabase má navíc schéma `storage` (úložiště fotek). Na holém
   PostgreSQL neexistuje, takže chyby kolem něj NEJSOU vada skriptu —
   jsou rozdíl prostředí. Všechno ostatní vada je. */
const JEN_SUPABASE = /schema "storage" does not exist|relation "storage\.[a-z_]+" does not exist/;

function najdiPg() {
  for (const v of ['16', '15', '14', '17']) {
    const bin = `/usr/lib/postgresql/${v}/bin`;
    if (existsSync(path.join(bin, 'initdb'))) return bin;
  }
  return null;
}

const bin = najdiPg();
if (!bin) {
  console.log('\nZaložení databáze na čistém PostgreSQL');
  console.log('  ⚠ PostgreSQL tu není — test se přeskakuje.');
  console.log('    (V CI musí být, jinak tenhle test nic nehlídá.)\n');
  process.exit(0);
}

const zaklad = mkdtempSync(path.join('/var/tmp', 'pk-sql-'));
const data = path.join(zaklad, 'data');
let bezi = false;
try {
  /* PostgreSQL odmítá běžet pod rootem, a v CI i v sandboxu se běžně
     jede jako root. Pustí se proto pod uživatelem `postgres`, kterého
     balíček zakládá. */
  const jsemRoot = (() => { try { return process.getuid() === 0; } catch (e) { return false; } })();
  const jako = (cmd) => jsemRoot ? `su postgres -c ${JSON.stringify(cmd)}` : cmd;
  if (jsemRoot) execSync(`chown -R postgres ${zaklad}`);
  execSync(jako(`${bin}/initdb -D ${data} -U pg --auth=trust`), { stdio: 'ignore' });
  execSync(jako(`${bin}/pg_ctl -D ${data} -o "-k ${zaklad} -h ''" -l ${zaklad}/log start`), { stdio: 'ignore' });
  bezi = true;
  execSync('sleep 2');

  /* POZOR: psql píše chyby na STDERR, a bez -v ON_ERROR_STOP končí
     s návratovým kódem 0. Kdo čte jen stdout, nevidí ani jednu chybu
     a kontrola „projde bez chyb" pak nemůže selhat nikdy — přesně to se
     stalo první verzi tohohle testu. Proto se oba proudy slévají. */
  const psql = (args, vstup) => execFileSync('psql', ['-h', zaklad, '-U', 'pg', ...args],
    { input: vstup, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const psqlVse = (args) => {
    const r = spawnSync('psql', ['-h', zaklad, '-U', 'pg', ...args], { encoding: 'utf8' });
    return String(r.stdout || '') + String(r.stderr || '');
  };

  psql(['-d', 'postgres', '-q', '-c', 'create database zkouska']);
  /* Co na Supabase existuje samo od sebe a na holém PostgreSQL ne:
     schéma `auth` s funkcí uid(), rozšíření pgcrypto a role, kterým se
     přidělují práva. Bez nich by test hlásil chyby prostředí a hlásil
     by je pořád — tedy by neřekl nic o skriptu samotném. */
  psql(['-d', 'zkouska', '-q'], `
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql as $$ select gen_random_uuid() $$;
    create extension if not exists pgcrypto;
    do $do$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $do$;
  `);

  const vystup = psqlVse(['-d', 'zkouska', '-f', path.join(ROOT, 'supabase', '00-vse.sql')]);
  const chyby = vystup.split('\n').filter((r) => /ERROR:/.test(r))
    .filter((r) => !JEN_SUPABASE.test(r))
    .map((r) => r.replace(/^psql:[^:]*:/, 'řádek '));
  pravda('00-vse.sql projde na čisté databázi bez chyb', chyby.length === 0,
    chyby.slice(0, 8).join('\n      '));

  /* A hlavně: opravdu z toho vznikne to, co web volá. Samotné „bez
     chyb" nestačí — chyba uprostřed skriptu se dá i přehlédnout. */
  const potreba = ['create_listing', 'my_listings', 'public_listings', 'save_search',
    'my_searches', 'send_message', 'my_threads', 'unread_count', 'my_listing_quota', 'delete_listing'];
  const maji = psql(['-d', 'zkouska', '-tAc',
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`])
    .split('\n').map((x) => x.trim()).filter(Boolean);
  const chybi = potreba.filter((f) => maji.indexOf(f) < 0);
  pravda('a vzniknou všechny funkce, které web volá', chybi.length === 0,
    'chybí: ' + chybi.join(', ') + ' — web je bude volat a dostane 404');

  /* Výsledek noční kontroly se má dostat k majiteli — to je celý smysl
     listings-kontrola-vlastnikovi.sql. */
  const sloupce = psql(['-d', 'zkouska', '-tAc',
    `select coalesce(array_to_string(p.proargnames, ','), '') from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'my_listings'`]).trim();
  pravda('my_listings vrací i výsledek noční kontroly',
    /kontrola_ok/.test(sloupce) && /kontrola_nalezy/.test(sloupce),
    `sloupce: ${sloupce}`);
} finally {
  try { if (bezi) execSync(`su postgres -c ${JSON.stringify(`${bin}/pg_ctl -D ${data} stop -m immediate`)}`, { stdio: 'ignore' }); } catch (e) {}
  try { rmSync(zaklad, { recursive: true, force: true }); } catch (e) {}
}

console.log('\nZaložení databáze na čistém PostgreSQL');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Databáze: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
