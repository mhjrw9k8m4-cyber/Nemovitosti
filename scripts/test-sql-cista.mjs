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
    /* Na Supabase je auth.uid() přihlášený člověk a auth.users tabulka
       účtů. Tady se obojí podstrčí tak, aby se dal uživatel PŘEPÍNAT —
       jinak by se průchod novým účtem nedal zahrát. */
    create table if not exists auth.users (id uuid primary key, email_confirmed_at timestamptz);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('pk.uid', true), '')::uuid $$;
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
  /* ---- A TEĎ CELÝ PRŮCHOD NOVÝM ÚČTEM -----------------------------
     Že skript proběhne bez chyb, neznamená, že dělá, co má. Tohle je
     jediná ochrana proti podvodu „pošlete zálohu, pozemek je váš",
     takže se zahraje doopravdy: založí se účet, zkusí se vložit
     inzerát, a kouká se, co je vidět na mapě. */
  {
    const U1 = '11111111-1111-1111-1111-111111111111';
    const U2 = '22222222-2222-2222-2222-222222222222';
    /* `set` a `select` v jednom příkazu vypíšou i „SET" — a to by se
       porovnávalo místo výsledku. Bere se poslední neprázdný řádek.
       (První verze testu na tohle naletěla: hlásila „stav: SET".) */
    const jako = (uid, sql) => {
      const radky = psqlVse(['-d', 'zkouska', '-tAc', `set pk.uid = '${uid}'; ${sql}`])
        .split('\n').map((x) => x.trim()).filter(Boolean);
      return radky.length ? radky[radky.length - 1] : '';
    };
    /* U zakládání se nekouká na výsledek, ale na CELÝ výpis: když
       funkce vyhodí výjimku, je hlášení na stderru a poslední řádek
       nese jen „CONTEXT: …". Podle něj by se nedalo poznat, PROČ to
       spadlo — a kontrola „odmítl to ze správného důvodu" by prošla
       i při úplně jiné chybě. */
    const vloz = (uid, misto) => psqlVse(['-d', 'zkouska', '-tAc',
      `set pk.uid = '${uid}'; select create_listing('${misto}','Kolín','orná půda','1/1',1000,100000,50.0,15.0,'popis','777111222')`]);

    psql(['-d', 'zkouska', '-q', '-c',
      `insert into auth.users(id, email_confirmed_at) values ('${U1}', null), ('${U2}', now())`]);

    /* 1) Nepotvrzený e-mail = za inzerátem nestojí ani schránka. */
    const bezMailu = vloz(U1, 'Bez potvrzení');
    pravda('bez potvrzeného e-mailu inzerát nevznikne',
      /potvrďte e-mail/.test(bezMailu),
      'účet s nepotvrzeným e-mailem inzerát vložil: ' + bezMailu.trim().slice(0, 140));

    /* 2) První inzerát potvrzeného účtu čeká na kontrolu — a hlavně
          NENÍ na mapě. */
    const vysledek1 = vloz(U2, 'Prvni obec');
    pravda('potvrzený účet inzerát vloží', !/ERROR/.test(vysledek1), vysledek1.slice(0, 200));
    const stav1 = jako(U2, `select status from listings where place='Prvni obec'`).trim();
    pravda('první inzerát nového účtu čeká na kontrolu', stav1 === 'pending', `stav: ${stav1}`);
    const verejne1 = jako(U2, `select count(*) from public_listings() where place='Prvni obec'`).trim();
    pravda('a na mapě zatím není', verejne1 === '0', `na mapě: ${verejne1}`);
    const ceka = jako(U2, `select pending_count()`).trim();
    pravda('a je vidět, že něco čeká na kontrolu', ceka === '1', `pending_count: ${ceka}`);

    /* 3) Majitel musí vědět, DO KDY se čeká — jinak neví, jestli
          web spadl, nebo se nic neděje. */
    const doKdy = jako(U2, `select public_at is not null from my_listings() where place='Prvni obec'`).trim();
    pravda('majitel se dozví, do kdy se čeká', doKdy === 't', `public_at: ${doKdy}`);

    /* 4) Nikdo nečeká donekonečna: až čas vyprší, inzerát se zveřejní
          sám — a status v tabulce se přitom nemění, rozhoduje čas. */
    psql(['-d', 'zkouska', '-q', '-c',
      `update listings set public_at = now() - interval '1 minute' where place='Prvni obec'`]);
    const verejne2 = jako(U2, `select count(*) from public_listings() where place='Prvni obec'`).trim();
    pravda('po vypršení čekání se inzerát zveřejní sám', verejne2 === '1', `na mapě: ${verejne2}`);

    /* 5) A kdo už jednou prošel, nečeká podruhé. Tohle byla past:
          dokud se „zavedený účet" poznával podle status='approved',
          zůstal po samozveřejnění navždy nový a čekal pokaždé znovu. */
    psql(['-d', 'zkouska', '-q', '-c',
      `update listings set created_at = now() - interval '5 minutes' where place='Prvni obec'`]);
    vloz(U2, 'Druha obec');
    const stav2 = jako(U2, `select status from listings where place='Druha obec'`).trim();
    pravda('druhý inzerát téhož účtu jde na mapu rovnou', stav2 === 'approved', `stav: ${stav2}`);

    /* 6) Zamítnutý inzerát se nesmí zveřejnit ani po čase. */
    psql(['-d', 'zkouska', '-q', '-c',
      `update listings set status='rejected', public_at = now() - interval '1 day' where place='Druha obec'`]);
    const zamitnuty = jako(U2, `select count(*) from public_listings() where place='Druha obec'`).trim();
    pravda('zamítnutý inzerát se nezveřejní ani po čase', zamitnuty === '0',
      `na mapě: ${zamitnuty} — zamítnutí se dá přečkat`);
  }
} finally {
  try { if (bezi) execSync(`su postgres -c ${JSON.stringify(`${bin}/pg_ctl -D ${data} stop -m immediate`)}`, { stdio: 'ignore' }); } catch (e) {}
  try { rmSync(zaklad, { recursive: true, force: true }); } catch (e) {}
}

console.log('\nZaložení databáze na čistém PostgreSQL');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Databáze: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
