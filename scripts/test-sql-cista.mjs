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
    /* Sloupec email tu musí být taky: rozesílač upozornění
       (hlidani_k_odeslani v supabase/hlidani-mailem.sql) z auth.users
       čte adresu, na kterou se píše. Bez něj hlásil tenhle test chybu
       prostředí, ne skriptu — a protože se chyba tvářila jako vada
       migrace, dala se snadno „opravit" tím, že by se funkce přestala
       na adresu ptát. Na Supabase ten sloupec je. */
    create table if not exists auth.users (id uuid primary key, email text,
      email_confirmed_at timestamptz);
    alter table auth.users add column if not exists email text;
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
    const vloz = (uid, misto, kontakt) => psqlVse(['-d', 'zkouska', '-tAc',
      `set pk.uid = '${uid}'; select create_listing('${misto}','Kolín','orná půda','1/1',1000,100000,50.0,15.0,'popis',${kontakt || "'777111222'"})`]);

    psql(['-d', 'zkouska', '-q', '-c',
      `insert into auth.users(id, email, email_confirmed_at) values ('${U1}', 'u1@test.cz', null), ('${U2}', 'u2@test.cz', now())`]);

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
    /* Volný účet má nárok na JEDEN inzerát. Píše to i my_listing_quota()
       („využito 1 z 1" v profilu) a scripts/test-meze.mjs hlídá, že se ta
       dvě čísla nerozejdou. Dokud tu v create_listing stálo 10, prošel
       druhý inzerát sám od sebe a tenhle krok tím měřil moderaci jen
       náhodou. Teď se kvóta nejdřív ověří a pak se účet schválně
       rozšíří — jinak by se tu místo moderace měřil limit. */
    const nadLimit = vloz(U2, 'Nad limit');
    pravda('volný účet má nárok na jeden inzerát', /dosažen limit/.test(nadLimit),
      'druhý inzerát prošel i bez rozšíření účtu: ' + nadLimit.trim().slice(0, 140));
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into account_tier(user_id, max_listings, note) values ('${U2}', 5, 'zkouška')`]);
    vloz(U2, 'Druha obec');
    const stav2 = jako(U2, `select status from listings where place='Druha obec'`).trim();
    pravda('druhý inzerát téhož účtu jde na mapu rovnou', stav2 === 'approved', `stav: ${stav2}`);

    /* 5b) PRAVIDLA, KTERÁ SE DO POSLEDNÍ PODOBY create_listing NEDOSTALA.
           Tohle je jediné místo, kde se dají zahrát doopravdy: ostatní
           zkoušky čtou SQL jako text, tady běží Postgres. Všechny tyhle
           kontroly v poslední podobě funkce chyběly (vznikla z jiné
           větve než ta před ní) — kdo spustil 00-vse.sql, tiše o ně
           přišel a nikde to nebylo vidět. */
    /* Mezi inzeráty je 90s pauza; v testu se obejde posunutím času.
       Bez toho by se místo kontaktu měřil cooldown a zkouška by
       „prošla" z úplně jiného důvodu. */
    psql(['-d', 'zkouska', '-q', '-c',
      `update listings set created_at = now() - interval '5 minutes'`]);
    const bezTelefonu = vloz(U2, 'Bez telefonu', "''");
    pravda('inzerát bez telefonu projde (pole je v pridat.html nepovinné)',
      !/ERROR/.test(bezTelefonu), bezTelefonu.trim().slice(0, 160));
    const spatnyKontakt = vloz(U2, 'Spatny kontakt', "'zavolejte mi'");
    pravda('ale „zavolejte mi" místo čísla neprojde', /kontakt musí být/.test(spatnyKontakt),
      'server to vzal jako kontakt: ' + spatnyKontakt.trim().slice(0, 160));
    const dlouhyPopis = psqlVse(['-d', 'zkouska', '-tAc',
      `set pk.uid = '${U2}'; select create_listing('Dlouhy popis','Kolín','orná půda','1/1',1000,100000,50.0,15.0,repeat('a',2100),'777111222')`]);
    pravda('popis delší než 2000 znaků neprojde', /popis je delší/.test(dlouhyPopis),
      'uložil se popis o 2100 znacích: ' + dlouhyPopis.trim().slice(0, 160));
    const znacky = psqlVse(['-d', 'zkouska', '-tAc',
      `set pk.uid = '${U2}'; select create_listing('Znacky','Kolín','orná půda','1/1',1000,100000,50.0,15.0,'<b>tučně</b>','777111222')`]);
    pravda('popis se značkami < > neprojde', /popis nesmí obsahovat/.test(znacky),
      'značky prošly: ' + znacky.trim().slice(0, 160));

    /* Bílý seznam sítí a přístupu musí znát to, co formulář POSÍLÁ:
       popisky, které člověk vidí („Elektřina", „Zpevněná cesta"), ne
       strojové tvary bez diakritiky. Když se rozejdou, server sítě
       zahodí a nikdo se nic nedozví — ani formulář, ani člověk. */
    psql(['-d', 'zkouska', '-q', '-c',
      `update listings set created_at = now() - interval '5 minutes'`]);
    psqlVse(['-d', 'zkouska', '-tAc',
      `set pk.uid = '${U2}'; select create_listing('S vybavenim','Kolín','orná půda','1/1',1000,100000,50.0,15.0,'popis','777111222','[]'::jsonb, array['Elektřina','Voda'], 'Zpevněná cesta')`]);
    const ulozeno = jako(U2, `select coalesce(array_to_string(features, ','), '') || '|' || coalesce(access, '') from listings where place='S vybavenim'`).trim();
    pravda('sítě a přístup z formuláře se opravdu uloží', ulozeno === 'Elektřina,Voda|Zpevněná cesta',
      `v databázi je „${ulozeno}" — server zahodil, co formulář poslal`);

    /* 6) Zamítnutý inzerát se nesmí zveřejnit ani po čase. */
    psql(['-d', 'zkouska', '-q', '-c',
      `update listings set status='rejected', public_at = now() - interval '1 day' where place='Druha obec'`]);
    const zamitnuty = jako(U2, `select count(*) from public_listings() where place='Druha obec'`).trim();
    pravda('zamítnutý inzerát se nezveřejní ani po čase', zamitnuty === '0',
      `na mapě: ${zamitnuty} — zamítnutí se dá přečkat`);

    /* ---- POSÍLÁNÍ HLÍDÁNÍ E-MAILEM -------------------------------
       Tyhle čtyři kontroly běží na SKUTEČNÉM PostgreSQL, ne nad zdrojem
       migrace: „default false" se dá napsat správně a stejně zrušit
       pozdějším příkazem v témže souboru. Souhlas je jediná věc, kterou
       se u pošty nedá omluvit — proto se ověřuje tam, kde platí. */
    const hledani = jako(U2, "select save_search('Pošta','Kolín','','',0,0,'{}',0,0,0,false,null,null,null)");
    pravda('nové hledání má posílání vypnuté',
      jako(U2, `select mailem from saved_searches where id = '${hledani}'`) === 'f',
      'nově uložené hledání má mailem = true — souhlas se předpokládal');
    pravda('rozesílač takové hledání nevidí',
      jako(U2, 'select count(*) from hlidani_k_odeslani(20)') === '0',
      'vypnuté hledání se objevilo v seznamu k odeslání');

    jako(U2, `select set_search_mail('${hledani}', true)`);
    const kOdeslani = jako(U2, 'select count(*) from hlidani_k_odeslani(20)');
    pravda('po zapnutí ho vidí (jinak by předchozí kontrola nic neměřila)',
      kOdeslani === '1', `v seznamu je ${kOdeslani} řádků, má být 1`);

    const tok = jako(U2, `select token from mail_nastaveni where user_id = '${U2}'`);
    pravda('a k účtu vznikl odhlašovací token', /[0-9a-f-]{20,}/.test(tok), `token: „${tok}"`);
    /* Odhlášení se zkouší BEZ přihlášení (pk.uid prázdné) — přesně tak,
       jak to dělá odkaz z e-mailu. */
    const odhl = jako('', `select unsubscribe_mail('${tok}')`);
    pravda('odhlášení jedním klikem funguje i bez přihlášení', odhl === 't', `vrátilo: „${odhl}"`);
    pravda('a vypne posílání u všech hledání naráz',
      jako(U2, `select count(*) from saved_searches where user_id = '${U2}' and mailem`) === '0',
      'po odhlášení zůstalo nějaké hledání zapnuté');
    pravda('a rozesílač už nikoho nevidí',
      jako(U2, 'select count(*) from hlidani_k_odeslani(20)') === '0',
      'odhlášený účet je pořád v seznamu k odeslání');
    /* DRUHÝ ZÁMEK, A MĚŘENÝ ZVLÁŠŤ. Odhlášení vypne obojí — příznak
       u účtu i jednotlivá hledání — takže při běžném průběhu by stačil
       jeden z nich a sabotáž „zruš filtr na odhlášení" by prošla
       (vyzkoušeno: prošla). Tady se proto hledání zapne natvrdo, jako
       by se k němu někdo dostal jinou cestou než funkcí set_search_mail,
       a účet zůstane odhlášený. Rozesílač pořád nesmí vidět nic. */
    psql(['-d', 'zkouska', '-q', '-c',
      `update saved_searches set mailem = true where id = '${hledani}'`]);
    pravda('odhlášený účet nedostane poštu, ani když je hledání zapnuté',
      jako(U2, 'select count(*) from hlidani_k_odeslani(20)') === '0',
      'zapnuté hledání přebilo odhlášení celého účtu');
    pravda('a po zapnutí přes set_search_mail (které odhlášení ruší) ho vidí znovu',
      (() => { jako(U2, `select set_search_mail('${hledani}', true)`);
        return jako(U2, 'select count(*) from hlidani_k_odeslani(20)'); })() === '1',
      'ani zapnutí přes funkci účet znovu nepřihlásilo');

    pravda('cizí token nic nezmění',
      jako('', "select unsubscribe_mail('00000000-0000-0000-0000-000000000000')") === 'f',
      'neznámý token vrátil true');
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
