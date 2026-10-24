/* JEDNO MÍSTO, KDE SE ZAKLÁDÁ ZKUŠEBNÍ POSTGRESQL.
   ==================================================================
   Používá to scripts/test-sql-cista.mjs (pustí celý balík na čisté
   databázi a prohlédne, co z toho vzniklo) i
   scripts/mericka-databaze.mjs (měří čas dotazů na opravdových
   objemech). Dvě kopie téhle přípravy by se rozešly — a rozešlá kopie
   je horší než žádná: měřidlo by měřilo jiné prostředí, než ve kterém
   se pak hlídá.

   CO TO DĚLÁ. Najde initdb, založí dočasnou databázi, pustí ji pod
   uživatelem `postgres` a podstrčí do ní to, co na Supabase existuje
   samo od sebe.

   CO TO NEDĚLÁ. Nepouští supabase/00-vse.sql — to si volající udělá
   sám, protože se pak liší, co se s výsledkem dělá.
   ================================================================== */
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

export function najdiPg() {
  for (const v of ['16', '15', '14', '17']) {
    const bin = `/usr/lib/postgresql/${v}/bin`;
    if (existsSync(path.join(bin, 'initdb'))) return bin;
  }
  return null;
}

/* Vrací { psql, psqlVse, zavri, db } — nebo `null`, když PostgreSQL
   na stroji není. Co s tím, rozhoduje volající: u sebe je to důvod
   přeskočit, v CI nikdy (hlídá to PK_SQL_VYZADOVAN u volajících). */
export function spustPostgres(jmenoDb) {
  const bin = najdiPg();
  if (!bin) return null;
  const db = jmenoDb || 'zkouska';
  const zaklad = mkdtempSync(path.join('/var/tmp', 'pk-sql-'));
  const data = path.join(zaklad, 'data');

  /* PostgreSQL odmítá běžet pod rootem, a v CI i v sandboxu se běžně
     jede jako root. Pustí se proto pod uživatelem `postgres`, kterého
     balíček zakládá. */
  const jsemRoot = (() => { try { return process.getuid() === 0; } catch (e) { return false; } })();
  const jako = (cmd) => (jsemRoot ? `su postgres -c ${JSON.stringify(cmd)}` : cmd);
  if (jsemRoot) execSync(`chown -R postgres ${zaklad}`);
  execSync(jako(`${bin}/initdb -D ${data} -U pg --auth=trust`), { stdio: 'ignore' });
  execSync(jako(`${bin}/pg_ctl -D ${data} -o "-k ${zaklad} -h ''" -l ${zaklad}/log start`), { stdio: 'ignore' });
  execSync('sleep 2');

  /* POZOR: psql píše chyby na STDERR, a bez -v ON_ERROR_STOP končí
     s návratovým kódem 0. Kdo čte jen stdout, nevidí ani jednu chybu
     a kontrola „projde bez chyb" pak nemůže selhat nikdy — přesně to
     se stalo první verzi zkoušky databáze. Proto se oba proudy
     slévají v psqlVse. */
  const psql = (args, vstup) => execFileSync('psql', ['-h', zaklad, '-U', 'pg', ...args],
    { input: vstup, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const psqlVse = (args) => {
    const r = spawnSync('psql', ['-h', zaklad, '-U', 'pg', ...args], { encoding: 'utf8' });
    return String(r.stdout || '') + String(r.stderr || '');
  };
  const zavri = () => {
    try { execSync(jako(`${bin}/pg_ctl -D ${data} stop -m immediate`), { stdio: 'ignore' }); } catch (e) { /* už neběží */ }
    try { rmSync(zaklad, { recursive: true, force: true }); } catch (e) { /* smazáno */ }
  };

  try {
    psql(['-d', 'postgres', '-q', '-c', `create database ${db}`]);
  } catch (e) { zavri(); throw e; }
  return { psql, psqlVse, zavri, db, zaklad };
}

/* CO NA SUPABASE EXISTUJE SAMO OD SEBE A NA HOLÉM POSTGRESQL NE.
   Bez tohohle by zkoušky hlásily chyby prostředí — a hlásily by je
   pořád, takže by o samotném skriptu neřekly nic. */
export function podstrcSupabase(psql, db) {
  psql(['-d', db || 'zkouska', '-q'], `
    create schema if not exists auth;
    /* Na Supabase je auth.uid() přihlášený člověk a auth.users tabulka
       účtů. Tady se obojí podstrčí tak, aby se dal uživatel PŘEPÍNAT —
       jinak by se průchod novým účtem nedal zahrát.
       Sloupec email tu musí být taky: rozesílač upozornění
       (hlidani_k_odeslani v supabase/hlidani-mailem.sql) z auth.users
       čte adresu, na kterou se píše. Bez něj hlásila zkouška chybu
       prostředí, ne skriptu — a protože se chyba tvářila jako vada
       migrace, dala se snadno „opravit" tím, že by se funkce přestala
       na adresu ptát. Na Supabase ten sloupec je. */
    create table if not exists auth.users (id uuid primary key, email text,
      email_confirmed_at timestamptz);
    alter table auth.users add column if not exists email text;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('pk.uid', true), '')::uuid $$;
    create extension if not exists pgcrypto;
    /* A SCHÉMA „storage" (úložiště fotek). Na Supabase ho zakládá samo
       úložiště, na holém PostgreSQL neexistuje — a dokud se
       nepodstrčilo, PRÁVA ÚLOŽIŠTĚ SE ZKOUŠKOU NIKDY NEPROHNALA: tři
       politiky nad storage.objects padaly na „schema does not exist"
       a ta chyba se promíjela jako rozdíl prostředí. Stačí na to tolik,
       kolik 00-vse.sql opravdu používá: dvě tabulky, vlastník
       a foldername().
       Pozor na foldername: na Supabase vrací cestu BEZ jména souboru,
       takže u „<uid>/a.jpg" je [1] to uid. Tady se to napodobuje
       stejně, jinak by se měřila jiná funkce, než jaká poběží. */
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text, owner uuid, created_at timestamptz not null default now());
    alter table storage.objects enable row level security;
    create or replace function storage.foldername(name text) returns text[]
      language sql immutable as $fn$
        select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
      $fn$;
    do $do$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $do$;
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, delete on storage.objects to anon, authenticated, service_role;
    grant select on storage.buckets to anon, authenticated, service_role;
  `);
}
