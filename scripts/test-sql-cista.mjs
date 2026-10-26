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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
/* PŘÍPRAVA DATABÁZE JE V JEDNOM MÍSTĚ pro tenhle test i pro
   scripts/mericka-databaze.mjs a scripts/test-sql-vykon.mjs. Dřív ji
   měl tenhle soubor vlastní — a dvě kopie téhle přípravy se rozejdou:
   zkouška by pak hlídala jiné prostředí, než ve kterém se měří. */
import { spustPostgres, podstrcSupabase, najdiPg } from './zkouska-postgres.mjs';

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

if (!najdiPg()) {
  console.log('\nZaložení databáze na čistém PostgreSQL');
  console.log('  ⚠ PostgreSQL tu není — test se přeskakuje.');
  /* A V CI SE NEPŘESKAKUJE. Instalace balíčku ve workflow končí
     „|| true", aby úloha nespadla na dočasném výpadku zrcadla — jenže
     tím se z „nejsilnější kontrola databáze" stane „zelená úloha,
     která nehlídá nic", a nikdo si toho nevšimne. Workflow proto
     nastavuje PK_SQL_VYZADOVAN=1 a tady to končí chybou. */
  if (process.env.PK_SQL_VYZADOVAN === '1') {
    console.log('    PK_SQL_VYZADOVAN=1 — tady se přeskakovat nesmí.\n');
    console.log('::error::Databáze: PostgreSQL chybí, a tahle úloha ho vyžaduje.'
      + ' Zkouška by jinak prošla, aniž by cokoli ověřila.');
    process.exit(1);
  }
  console.log('    (U sebe je to v pořádku; v CI to hlídá PK_SQL_VYZADOVAN.)\n');
  process.exit(0);
}

const pg = spustPostgres('zkouska');
const { psql, psqlVse, zavri } = pg;
try {
  podstrcSupabase(psql, 'zkouska');

  const vystup = psqlVse(['-d', 'zkouska', '-f', path.join(ROOT, 'supabase', '00-vse.sql')]);
  const chyby = vystup.split('\n').filter((r) => /ERROR:/.test(r))
    .filter((r) => !JEN_SUPABASE.test(r))
    .map((r) => r.replace(/^psql:[^:]*:/, 'řádek '));
  pravda('00-vse.sql projde na čisté databázi bez chyb', chyby.length === 0,
    chyby.slice(0, 8).join('\n      '));

  /* SOUPIS, CO Z TOHO VZNIKLO — vypisuje se schválně.
     docs/pred-vydanim.md cituje čísla („tolik tabulek, tolik funkcí"),
     a ta se s každou migrací mění. Dokud se nevypisovala, opisovala se
     ručně a tiše stárla: stálo tam „56 funkcí", když jich bylo 39.
     Tohle je jediné místo, kde je lze změřit na doopravdy založené
     databázi, takže se odsud mají brát. */
  {
    const spocti = (sql) => Number((psql(['-d', 'zkouska', '-tAc', sql]) || '0').trim()) || 0;
    const zdroj = readFileSync(path.join(ROOT, 'supabase', '00-vse.sql'), 'utf8');
    /* VLASTNÍ funkce, ne všechno, co v public leží. Dotaz na pg_proc jich
       napočítá 79, protože v public jsou i funkce z rozšíření a spouštěčů —
       a číslo v dokumentaci má být o tom, co píšeme my. Proto se protne
       s tím, co 00-vse.sql doopravdy zakládá. */
    const nasePodleZdroje = new Set([...zdroj.matchAll(/create (?:or replace )?function\s+(\w+)\s*\(/g)]
      .map((m) => m[1]));
    const vPublic = (psql(['-d', 'zkouska', '-tAc',
      `select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'`]) || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const souhrn = {
      tabulek: spocti(`select count(*) from pg_tables where schemaname = 'public'`),
      funkci: vPublic.filter((f) => nasePodleZdroje.has(f)).length,
      politik: spocti(`select count(*) from pg_policies where schemaname = 'public'`),
      indexu: spocti(`select count(*) from pg_indexes where schemaname = 'public'`),
      radku: zdroj.split('\n').length,
    };
    console.log(`  · soupis: ${souhrn.radku} řádků SQL → ${souhrn.tabulek} tabulek, `
      + `${souhrn.funkci} vlastních funkcí, ${souhrn.politik} politik RLS, ${souhrn.indexu} indexů`);
  }

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

  /* ---- KOMU SE DÁ CO ZAVOLAT -------------------------------------
     Že funkce vznikne, neznamená, že ji smí zavolat ten správný.
     A pozor na to, jak se PostgreSQL chová: CREATE FUNCTION dává
     EXECUTE roli PUBLIC, dokud to někdo neodebere. Z 59 funkcí se
     `revoke all ... from public` dělá u jedenácti, takže ostatní smí
     zavolat i nepřihlášený — a jestli to k něčemu je, rozhoduje až
     jejich tělo.
     Naměřeno: prehled_navstevnosti(integer), souhrn návštěvnosti
     CELÉHO webu, byla dokonce grantovaná přímo roli authenticated.
     V hlavičce scripts/navstevnost.mjs přitom stojí, že se z přehledu
     NEDĚLÁ stránka právě proto, že web nemá pojem „majitel" a účet si
     založí kdokoli. Kód si odporoval s vlastním odůvodněním a nebylo
     to z čeho poznat. */
  {
    const jdeZavolat = (role, vyraz) => {
      const out = psqlVse(['-d', 'zkouska', '-tAc',
        `set role ${role}; select ${vyraz};`]);
      return { ok: !/ERROR/i.test(out), vystup: out.replace(/\s+/g, ' ').trim().slice(0, 120) };
    };

    /* TOHLE JE TA KONKRÉTNÍ VĚC, KVŮLI KTERÉ TO VZNIKLO. */
    for (const role of ['anon', 'authenticated']) {
      const r = jdeZavolat(role, 'prehled_navstevnosti(7)');
      pravda(`${role} nesmí přečíst statistiku návštěvnosti`, !r.ok,
        'prošlo a vrátilo: ' + r.vystup);
    }
    /* A server smí — jinak by oprava jen rozbila vlastní nástroj. */
    pravda('ale service_role ji přečte (jinak by si ji nepřečetl ani server)',
      jdeZavolat('service_role', 'prehled_navstevnosti(7)').ok);

    /* Zápis čítače naopak musí jít i nepřihlášenému: měří se návštěva. */
    pravda('zápis návštěvy smí i nepřihlášený (to je jeho účel)',
      jdeZavolat('anon', `zapis_navstevu('index.html', '', 'telefon', true)`).ok);

    /* A SOUKROMÉ VĚCI. Tady rozhoduje auth.uid() v těle funkce, ne
       grant: EXECUTE na většinu z nich má PUBLIC (tak to PostgreSQL
       dělá samo) a `revoke ... from public` se používá u jedenácti
       z 59. Nestačí tedy čist práva — musí se to ZAVOLAT a podívat se,
       co to vrátí. Naměřeno: u všech desíti se nepřihlášený nedozví
       nic, protože auth.uid() je prázdné. Platí to dnes a tahle
       kontrola je tu proto, aby to platilo i po příští úpravě. */
    for (const fn of ['moje_poznamky()', 'my_listings()', 'my_threads()', 'my_searches()',
      'unread_count()', 'my_limit()', 'my_listing_quota()',
      /* ŽIVÁ PODOBA, NE TA PRVNÍ. Dokud tu stálo volání se sedmi
         parametry, kontrola měřila něco jiného, než si myslela:
         supabase/vykon.sql starší podoby save_search zahazuje, takže
         by volání spadlo na „funkce neexistuje" — a `!r.ok` by prošlo
         i kdyby funkce komukoli vracela cizí hledání. */
      `save_search('x','x','x','x',0,0,'{}',0,0,0,false,null,null,null)`,
      `send_message('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','ahoj')`,
      `thread_messages('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')`]) {
      const r = jdeZavolat('anon', fn);
      /* Buď to spadne, nebo nevrátí žádné UUID — tedy žádný cizí
         záznam. Prázdný výstup i chyba jsou obojí v pořádku. */
      pravda(`anon nedostane nic z ${String(fn).replace(/\(.*/, '()')}`,
        !r.ok || !/[0-9a-f]{8}-/.test(r.vystup), 'vrátilo: ' + r.vystup);
    }
  }

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

  /* ---- VÝKON: INDEXY A PŘEPSANÉ DOTAZY CHATU ---------------------
     Tady se neměří zdroj, ale PLÁN a ČAS na opravdových datech.
     Nasype se 300 účtů, 20 000 inzerátů a 60 000 zpráv — ne proto, že
     by tolik dnes bylo (dnes je v tabulkách pár řádků), ale proto, že
     při téhle velikosti se pozná rozdíl mezi „jde po indexu" a „čte
     celou tabulku". Při dnešní velikosti by se nepoznalo nic a
     kontrola by platila vždycky.

     ČAS SE MĚŘÍ POMĚREM, NE PEVNÝM ČÍSLEM. Stará podoba se v téhle
     databázi vyrobí znovu (…_stare) a porovná se s živou. Pevná mez
     v milisekundách by na pomalejším stroji hlásila planý poplach;
     poměr dvou dotazů na témže stroji ne. Naměřeno při psaní:
     unread_count 74,5 → 1,3 ms, my_threads 61,2 → 8,6 ms. */
  {
    const nasyp = `
      insert into auth.users (id, email, email_confirmed_at)
        select gen_random_uuid(), 'v'||g||'@priklad.cz', now() from generate_series(1,300) g;
      insert into listings (status, place, okres, area, price, user_id, created_at)
        select 'approved','Obec'||(g%50),'Okres'||(g%76),1000,200000,u.id, now()-(g||' minutes')::interval
        from generate_series(1,20000) g
        join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % 300) + 1;
      insert into chat_messages (listing_id, buyer_id, sender_id, body, created_at)
        select l.id, u.id, case when g%2=0 then u.id else l.user_id end, 'z'||g, now()-(g||' seconds')::interval
        from generate_series(1,60000) g
        join (select id, user_id, row_number() over (order by id) n from listings) l on l.n = (g*7 % 20000) + 1
        join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g*13 % 300) + 1;
      analyze;`;
    psql(['-d', 'zkouska', '-q'], nasyp);
    const kdo = psql(['-d', 'zkouska', '-tAc',
      'select buyer_id from chat_messages group by buyer_id order by count(*) desc limit 1']).trim();

    /* Stará podoba obou funkcí, slovo od slova jak vypadala před
       supabase/vykon.sql. Je tu proto, aby bylo s čím porovnávat —
       a aby bylo vidět, co přesně se změnilo. */
    psql(['-d', 'zkouska', '-q'], `
      create or replace function unread_count_stare() returns integer
      language sql security definer set search_path = public as $f$
        select coalesce(count(*),0)::int from chat_messages m
        join listings l on l.id = m.listing_id
        where m.read_at is null and m.sender_id <> auth.uid()
          and (m.buyer_id = auth.uid() or l.user_id = auth.uid());
      $f$;
      create or replace function my_threads_stare()
      returns table(listing_id uuid, buyer_id uuid, place text, okres text,
        is_owner boolean, last_body text, last_at timestamptz, unread integer)
      language sql security definer set search_path = public as $f$
        with mine as (
          select distinct m.listing_id, m.buyer_id from chat_messages m
          join listings l on l.id = m.listing_id
          where m.buyer_id = auth.uid() or l.user_id = auth.uid()
        )
        select mine.listing_id, mine.buyer_id, l.place, l.okres, (l.user_id = auth.uid()),
          (select body from chat_messages x where x.listing_id = mine.listing_id and x.buyer_id = mine.buyer_id order by x.created_at desc limit 1),
          (select created_at from chat_messages x where x.listing_id = mine.listing_id and x.buyer_id = mine.buyer_id order by x.created_at desc limit 1),
          (select count(*) from chat_messages x where x.listing_id = mine.listing_id and x.buyer_id = mine.buyer_id and x.sender_id <> auth.uid() and x.read_at is null)::int
        from mine join listings l on l.id = mine.listing_id order by 7 desc;
      $f$;`);

    // Nejkratší ze tří běhů — jeden běh umí zdržet cokoli, co běží vedle.
    const cas = (dotaz) => {
      let nej = Infinity;
      for (let i = 0; i < 3; i++) {
        const out = psqlVse(['-d', 'zkouska', '-tAc',
          `set pk.uid = '${kdo}'; explain (analyze, costs off) ${dotaz}`]);
        const m = /Execution Time: ([\d.]+) ms/.exec(out);
        if (m) nej = Math.min(nej, parseFloat(m[1]));
      }
      return nej;
    };
    /* psql vrátí i hlášku „SET" od prvního příkazu, takže se bere
       POSLEDNÍ neprázdný řádek. Bez toho se porovnávaly řetězce
       „SET\n0" a kontrola hlásila rozdíl tam, kde žádný nebyl. */
    const jakoKdo = (dotaz) => {
      const radky = psql(['-d', 'zkouska', '-tAc', `set pk.uid = '${kdo}'; ${dotaz}`])
        .split('\n').map((r) => r.trim()).filter(Boolean);
      return radky.length ? radky[radky.length - 1] : '';
    };

    /* 1) Odznak nepřečtených — volá se při otevření KAŽDÉ stránky. */
    pravda('unread_count() vrací totéž co jeho stará podoba',
      jakoKdo('select unread_count()') === jakoKdo('select unread_count_stare()'),
      `nové ${jakoKdo('select unread_count()')} vs staré ${jakoKdo('select unread_count_stare()')}`);
    const unNove = cas('select unread_count()');
    const unStare = cas('select unread_count_stare()');
    pravda('a je aspoň třikrát rychlejší (OR rozpadlý na UNION jde po indexu)',
      unNove * 3 <= unStare, `nové ${unNove} ms, staré ${unStare} ms`);

    /* 2) Schránka. Shoda se měří přes EXCEPT v OBOU směrech — jinak by
       prošla i podoba, která vrátí jen část vláken. */
    const rozdil = jakoKdo(`select count(*) from (
        (select * from my_threads() except select * from my_threads_stare())
        union all
        (select * from my_threads_stare() except select * from my_threads())) t`);
    pravda('my_threads() vrací přesně tytéž řádky co stará podoba', rozdil === '0',
      `řádků, které se liší: ${rozdil}`);
    const mtNove = cas('select * from my_threads()');
    const mtStare = cas('select * from my_threads_stare()');
    pravda('a je taky aspoň třikrát rychlejší', mtNove * 3 <= mtStare,
      `nové ${mtNove} ms, staré ${mtStare} ms`);

    /* 3) Kvóta a brzdy — nejčtenější dotazy nad listings a chat_messages.
       Tady se dá plán přečíst přímo, protože to není volání funkce. */
    const plan = (dotaz) => psqlVse(['-d', 'zkouska', '-tAc',
      `set pk.uid = '${kdo}'; explain (costs off) ${dotaz}`]);
    pravda('počítání inzerátů účtu jde po indexu, ne přes celou tabulku',
      !/Seq Scan on listings/.test(plan(`select count(*) from listings where user_id = '${kdo}'`)),
      'plán čte celou tabulku listings');
    pravda('brzda chatu („neposlal jsi něco před chvílí") jde po indexu',
      !/Seq Scan on chat_messages/.test(plan(
        `select 1 from chat_messages where sender_id = '${kdo}' and created_at > now() - interval '3 seconds'`)),
      'plán čte celou tabulku chat_messages');

    /* 4) Jedinečnost tokenů. Náhoda není pravidlo — tohle je pravidlo. */
    const dvojity = psqlVse(['-d', 'zkouska', '-tAc',
      `insert into watch_subscriptions(email, confirm_token) values ('a@priklad.cz','TOTEZ'),('b@priklad.cz','TOTEZ')`]);
    pravda('dvakrát týž potvrzovací token databáze nepustí', /ERROR/.test(dvojity),
      'oba řádky se uložily — jeden token by pak potvrdil dvě hlídání');

    /* 5) save_search má jedinou podobu. Čtyři podoby znamenaly, že
       PostgREST mohl vybrat tu starší a hledání uložit TIŠE bez okruhu. */
    const podob = psql(['-d', 'zkouska', '-tAc',
      `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'save_search'`]).trim();
    pravda('save_search má v databázi jedinou podobu', podob === '1',
      `podob je ${podob} — klient může trefit starší a uložit hledání bez části filtrů`);

    /* 6) Úklid odeslané pošty: smí ho pustit jen server a maže jen staré. */
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into mail_poslane(hledani_id, klic, poslano_at)
         select id, 'stary', now() - interval '400 days' from saved_searches limit 1;
       insert into mail_poslane(hledani_id, klic, poslano_at)
         select id, 'cerstvy', now() from saved_searches limit 1;`]);
    for (const role of ['anon', 'authenticated']) {
      const r = psqlVse(['-d', 'zkouska', '-tAc', `set role ${role}; select uklid_posty(180);`]);
      pravda(`${role} nesmí pustit úklid pošty`, /ERROR/i.test(r), 'prošlo: ' + r.replace(/\s+/g, ' ').slice(0, 90));
    }
    const smazano = psql(['-d', 'zkouska', '-tAc', 'select uklid_posty(180)']).trim();
    pravda('úklid smaže starý záznam o odeslané poště', smazano === '1', `smazáno ${smazano} řádků`);
    pravda('a čerstvý nechá být (jinak by se nabídka poslala podruhé)',
      psql(['-d', 'zkouska', '-tAc', `select count(*) from mail_poslane where klic = 'cerstvy'`]).trim() === '1',
      'úklid smazal i čerstvý záznam');

    /* 7) Přihlášky k hlídání e-mailem. subscribe_watch je jediná funkce,
       kterou smí zavolat kdokoli s veřejným klíčem A která zvětšuje
       databázi. Měříme to proto rolí anon, ne superuživatelem —
       tedy přesně tou cestou, kterou má cizí skript k dispozici. */
    /* `set role anon;` v témže -c vypíše navíc řádek SET, takže se díváme
       na POSLEDNÍ neprázdný řádek: `t` = přihláška prošla. */
    const prihlas = (eml, okres) => {
      const vystup = psqlVse(['-d', 'zkouska', '-tAc',
        `set role anon; select subscribe_watch('${eml}', ${okres === null ? 'null' : `'${okres}'`});`]);
      const radky = vystup.split('\n').map((r) => r.trim()).filter(Boolean);
      return { chyba: /ERROR/i.test(vystup), ano: radky[radky.length - 1] === 't' };
    };
    const OKRESY = ['Benešov', 'Beroun', 'Blansko', 'Brno-město', 'Brno-venkov', 'Bruntál',
      'Břeclav', 'Cheb', 'Chomutov', 'Chrudim', 'Jeseník', 'Jičín'];
    let prosloPrihlasek = 0;
    for (const okres of OKRESY) if (prihlas('dotera@priklad.cz', okres).ano) prosloPrihlasek++;
    pravda('dvanáct míst na jeden e-mail databáze pustí', prosloPrihlasek === 12,
      `prošlo jen ${prosloPrihlasek} z 12 — strop je přísnější, než má být`);
    pravda('a třinácté už ne', prihlas('dotera@priklad.cz', 'Karlovy Vary').chyba,
      'třináctá přihláška prošla — jedna adresa si nasbírá přihlášku na každý okres');
    pravda('strop platí na adresu, ne na celou tabulku (jiný e-mail projde)',
      prihlas('druhy@priklad.cz', 'Karlovy Vary').ano,
      'strop zablokoval i cizí adresu — to by vypnulo hlídání všem');
    pravda('a znovupřihlášení na už hlídaný okres strop nezdrží',
      prihlas('dotera@priklad.cz', 'Benešov').ano,
      'oživení existující přihlášky narazilo na strop — člověk si pak nezmění typy');

    /* 8) Poznámky na účtu: strop na počet a na délku klíče.
       Zkouší se rolí přihlášeného člověka (pk.uid), tedy tou cestou,
       kterou má kdokoli registrovaný. */
    const JA = '11111111-1111-1111-1111-111111111111';
    const jako = (sql) => psqlVse(['-d', 'zkouska', '-tAc', `set pk.uid = '${JA}'; ${sql}`]);
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into auth.users(id, email) values ('${JA}', 'ja@priklad.cz') on conflict (id) do nothing;
       insert into poznamky(user_id, klic, text)
         select '${JA}', 'klic-' || i, 'poznámka ' || i from generate_series(1, 299) i;`]);
    const prvni = jako(`select poznamka_uloz('klic-300', 'tristá poznámka')`);
    pravda('tři stě poznámek na účet databáze pustí', !/ERROR/i.test(prvni),
      'prošlo jen ' + prvni.replace(/\s+/g, ' ').slice(0, 90));
    const nadstrop = jako(`select poznamka_uloz('klic-301', 'o jednu víc')`);
    pravda('a tři sta první už ne', /ERROR/i.test(nadstrop),
      'účet si může psát řádky bez konce — databáze je na bezplatném tarifu');
    const uprava = jako(`select poznamka_uloz('klic-5', 'upravený text u plného stropu')`);
    pravda('u plného stropu jde upravit poznámka, která už existuje', !/ERROR/i.test(uprava),
      'u stropu by nešlo ani uklidit: ' + uprava.replace(/\s+/g, ' ').slice(0, 90));
    const smazani = jako(`select poznamka_uloz('klic-5', '')`);
    pravda('a smazat taky', !/ERROR/i.test(smazani),
      smazani.replace(/\s+/g, ' ').slice(0, 90));
    const poSmazani = jako(`select poznamka_uloz('klic-302', 'teď je místo')`);
    pravda('a po smazání se zas jedna vejde (strop není zámek)', !/ERROR/i.test(poSmazani),
      poSmazani.replace(/\s+/g, ' ').slice(0, 90));
    /* DÉLKA KLÍČE SE MĚŘÍ NA PRÁZDNÉM ÚČTU. Nejdřív to stálo tady,
       u účtu plného poznámek — a zkouška prošla i tehdy, když jsem
       strop na délku z SQL vyhodil: odmítnutí přišlo od stropu na
       POČET, ne od délky. Kontrola tedy měřila něco jiného, než co
       tvrdila. Druhý účet žádné poznámky nemá, takže o odmítnutí
       rozhoduje jen délka. */
    const DRUHY = '22222222-2222-2222-2222-222222222222';
    const jakoDruhy = (sql) => psqlVse(['-d', 'zkouska', '-tAc', `set pk.uid = '${DRUHY}'; ${sql}`]);
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into auth.users(id, email) values ('${DRUHY}', 'druhy@priklad.cz') on conflict (id) do nothing;`]);
    pravda('je co měřit — na prázdném účtu krátký klíč projde',
      !/ERROR/i.test(jakoDruhy(`select poznamka_uloz('kratky-klic', 'text')`)),
      'ani krátký klíč neprošel — pak o délce nic neví ani kontrola pod tím');
    const dlouhyKlic = jakoDruhy(`select poznamka_uloz(repeat('k', 300), 'dlouhý klíč')`);
    pravda('dlouhý klíč pozemku databáze odmítne', /ERROR/i.test(dlouhyKlic),
      'klíč je text bez stropu — tudy projde megabajt');
    const dlouhyText = jakoDruhy(`select poznamka_uloz('klic-7', repeat('a', 2100))`);
    pravda('a dlouhý text taky (to platilo už dřív)', /ERROR/i.test(dlouhyText),
      'strop 2 000 znaků neplatí');
    psql(['-d', 'zkouska', '-q', '-c', `delete from poznamky where user_id = '${DRUHY}'`]);
    psql(['-d', 'zkouska', '-q', '-c', `delete from poznamky where user_id = '${JA}'`]);

    /* 9) Odběry upozornění do telefonu: strop na počet, tvar a délka.
       Zkouší se rolí přihlášeného, tedy tou cestou, kterou má kdokoli
       registrovaný. Druhý účet (prázdný) je tu schválně: na plném účtu
       by odmítnutí mohlo přijít od stropu na POČET, a kontrola tvaru by
       pak měřila něco jiného, než co tvrdí — na to jsem u poznámek
       (oddíl 121) už jednou narazil. */
    const TEL = '33333333-3333-3333-3333-333333333333';
    const PRAZDNY = '44444444-4444-4444-4444-444444444444';
    const jakoTel = (sql) => psqlVse(['-d', 'zkouska', '-tAc', `set pk.uid = '${TEL}'; ${sql}`]);
    const jakoPrazdny = (sql) => psqlVse(['-d', 'zkouska', '-tAc', `set pk.uid = '${PRAZDNY}'; ${sql}`]);
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into auth.users(id, email) values ('${TEL}', 'tel@priklad.cz'), ('${PRAZDNY}', 'prazdny@priklad.cz')
         on conflict (id) do nothing;
       insert into push_odbery(user_id, endpoint, p256dh, auth)
         select '${TEL}', 'https://push.priklad.cz/' || i, 'klic-' || i, 'auth-' || i from generate_series(1, 9) i;`]);
    pravda('desáté zařízení na účet projde',
      !/ERROR/i.test(jakoTel(`select push_odber_uloz('https://push.priklad.cz/10','klic','auth')`)),
      'neprošlo ani desáté — strop je přísnější, než má být');
    pravda('a jedenácté už ne',
      /ERROR/i.test(jakoTel(`select push_odber_uloz('https://push.priklad.cz/11','klic','auth')`)),
      'účet si může zakládat odběry bez konce');
    pravda('přeuložení klíčů u známého zařízení jde i při plném stropu',
      !/ERROR/i.test(jakoTel(`select push_odber_uloz('https://push.priklad.cz/5','novy-klic','novy-auth')`)),
      'po přeinstalování prohlížeče by se klíče neuložily');
    pravda('je co měřit — na prázdném účtu platný odběr projde',
      !/ERROR/i.test(jakoPrazdny(`select push_odber_uloz('https://push.priklad.cz/jiny','klic','auth')`)),
      'ani platný odběr neprošel — pak kontroly pod tím nic neváží');
    pravda('co není https adresa, se jako odběr nepřijme',
      /ERROR/i.test(jakoPrazdny(`select push_odber_uloz('tohle není adresa','klic','auth')`)),
      'do tabulky šel uložit jakýkoli text');
    pravda('a dlouhá adresa taky ne',
      /ERROR/i.test(jakoPrazdny(`select push_odber_uloz('https://push.priklad.cz/' || repeat('x', 600),'klic','auth')`)),
      'bez stropu na délku se sem dá uložit megabajt');
    pravda('ani dlouhé klíče',
      /ERROR/i.test(jakoPrazdny(`select push_odber_uloz('https://push.priklad.cz/dalsi', repeat('k', 300),'auth')`)),
      'klíče jsou base64 o 87 a 22 znacích, tohle je něco jiného');
    psql(['-d', 'zkouska', '-q', '-c',
      `delete from push_odbery where user_id in ('${TEL}', '${PRAZDNY}')`]);

    /* 10) Dvě cesty, kterými by databáze rostla zvenčí.
       (a) Měření návštěvnosti: řádek vzniká pro každou kombinaci
       (den, stránka, zdroj, zařízení) a oba texty jsou volné, takže
       kdokoli anonymně vyrobí libovolně mnoho řádků. Strop se zkouší
       tak, že se tabulka na dnešní den předem naplní. */
    psql(['-d', 'zkouska', '-q', '-c',
      `delete from navstevnost where den = current_date;
       insert into navstevnost(den, stranka, zdroj, zarizeni, zobrazeni, navstevy)
         select current_date, 'strana-' || i || '.html', '', 'stolni', 1, 1 from generate_series(1, 4998) i;`]);
    const kolik = () => Number(psql(['-d', 'zkouska', '-tAc',
      `select count(*) from navstevnost where den = current_date`]).trim());
    const predStropem = kolik();
    psqlVse(['-d', 'zkouska', '-tAc', `set role anon; select zapis_navstevu('nova-1.html','','stolni',true);`]);
    pravda('pod stropem se nová kombinace zapíše', kolik() === predStropem + 1,
      `řádků bylo ${predStropem}, po zápisu ${kolik()}`);
    psqlVse(['-d', 'zkouska', '-tAc', `set role anon; select zapis_navstevu('nova-2.html','','stolni',true);`]);
    const naStropu = kolik();
    for (let i = 0; i < 5; i++) {
      psqlVse(['-d', 'zkouska', '-tAc', `set role anon; select zapis_navstevu('vymyslena-${i}.html','zdroj${i}.cz','stolni',true);`]);
    }
    pravda('nad stropem už nové řádky nevznikají', kolik() === naStropu + 1,
      `pět vymyšlených stránek přidalo ${kolik() - naStropu} řádků (čekal se jen řádek (strop))`);
    pravda('a zahozená zobrazení se spočítají do řádku „(strop)"',
      Number(psql(['-d', 'zkouska', '-tAc',
        `select coalesce(sum(zobrazeni),0) from navstevnost where den = current_date and stranka = '(strop)'`]).trim()) === 5,
      'čísla toho dne by se tiše rozešla se skutečností');
    pravda('ale už známá kombinace se počítá dál i nad stropem',
      Number(psql(['-d', 'zkouska', '-tAc',
        `select zobrazeni from navstevnost where den = current_date and stranka = 'nova-1.html'`]).trim()) >= 1
      && (psqlVse(['-d', 'zkouska', '-tAc', `set role anon; select zapis_navstevu('nova-1.html','','stolni',false);`]),
          Number(psql(['-d', 'zkouska', '-tAc',
            `select zobrazeni from navstevnost where den = current_date and stranka = 'nova-1.html'`]).trim()) === 2),
      'strop by zahodil i měření stránek, které se dnes už počítaly');
    psql(['-d', 'zkouska', '-q', '-c', `delete from navstevnost where den = current_date`]);

    /* (b) Hromadné nahrání uložených pozemků. Strop 500 je na ÚČET;
       `limit 500` v SQL omezoval jedno volání, takže se dvěma voláními
       obešel. */
    const HROM = '55555555-5555-5555-5555-555555555555';
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into auth.users(id, email) values ('${HROM}', 'hromada@priklad.cz') on conflict (id) do nothing;
       delete from ulozene where user_id = '${HROM}';`]);
    const nahraj = (od, do_) => psqlVse(['-d', 'zkouska', '-tAc',
      `set pk.uid = '${HROM}'; select ulozene_nahraj(array(select 'k' || i from generate_series(${od}, ${do_}) i));`]);
    nahraj(1, 400);
    nahraj(401, 900);
    const celkem = Number(psql(['-d', 'zkouska', '-tAc',
      `select count(*) from ulozene where user_id = '${HROM}'`]).trim());
    pravda('hromadné nahrání neobejde strop 500 na účet', celkem === 500,
      `na účtu je ${celkem} uložených pozemků`);
    const dalsi = nahraj(1000, 1100).trim();
    pravda('a další nahrání už nevloží nic', /(^|\n)\s*0\s*$/.test(dalsi),
      `vrátilo „${dalsi.replace(/\s+/g, ' ')}" — mělo vrátit 0`);
    psql(['-d', 'zkouska', '-q', '-c', `delete from ulozene where user_id = '${HROM}'`]);

    /* Úklid nepotvrzených. Bez něj v tabulce navždy leží řádky po někom,
       kdo si přihlášku nikdy nepotvrdil (třeba ji vypsal cizí skript). */
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into watch_subscriptions(email, okres, confirmed, confirm_token)
         values ('stary@priklad.cz', 'Kladno', false, 'TOKEN-STARY'),
                ('potvrzeny@priklad.cz', 'Kladno', true, 'TOKEN-POTVRZENY');
       update watch_subscriptions set created_at = now() - interval '90 days'
        where email in ('stary@priklad.cz', 'potvrzeny@priklad.cz');`]);
    for (const role of ['anon', 'authenticated']) {
      const r = psqlVse(['-d', 'zkouska', '-tAc', `set role ${role}; select uklid_hlidani(30);`]);
      pravda(`${role} nesmí pustit úklid hlídání`, /ERROR/i.test(r),
        'prošlo: ' + r.replace(/\s+/g, ' ').slice(0, 90));
    }
    const uklizeno = psql(['-d', 'zkouska', '-tAc', 'select uklid_hlidani(30)']).trim();
    pravda('úklid smaže starou nepotvrzenou přihlášku', uklizeno === '1', `smazáno ${uklizeno} řádků`);
    pravda('a potvrzenou nechá být, i když je stejně stará',
      psql(['-d', 'zkouska', '-tAc',
        `select count(*) from watch_subscriptions where email = 'potvrzeny@priklad.cz'`]).trim() === '1',
      'úklid smazal potvrzenou přihlášku — člověk by přestal dostávat poštu bez slova');
    pravda('a čerstvé nepotvrzené taky (má ještě čas si kliknout)',
      psql(['-d', 'zkouska', '-tAc',
        `select count(*) from watch_subscriptions where email = 'dotera@priklad.cz'`]).trim() === '12',
      'úklid smazal i dnešní přihlášky');
    pravda('a kratší lhůtu než týden si vynutit nenecháme',
      psql(['-d', 'zkouska', '-tAc', 'select uklid_hlidani(0)']).trim() === '0',
      'uklid_hlidani(0) smazal čerstvé řádky — podlaha sedmi dní neplatí');

    /* ÚLOŽIŠTĚ FOTEK. Do dneška se jeho práva neproměřila ani jednou:
       bez schématu `storage` se tři politiky nad storage.objects
       nevytvořily a chyba se promíjela (viz příprava prostředí výš).
       Zavřené tam bylo všechno kromě POČTU: velikost 3 MB, typ jen
       JPEG, zápis jen do vlastní složky, 8 fotek v inzerátu — ale
       kolik souborů účet nahraje, nehlídalo nic, a nahrává se přímo
       z prohlížeče, ještě než inzerát vznikne. */
    const POL = Number(psql(['-d', 'zkouska', '-tAc',
      `select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'`]).trim());
    pravda(`politiky úložiště se opravdu vytvořily (${POL})`, POL === 3,
      'na storage.objects jsou ' + POL + ' politiky — bez nich zkoušky níž neměří nic');

    const F1 = '66666666-6666-6666-6666-666666666666';   // free účet
    const F2 = '77777777-7777-7777-7777-777777777777';   // placený účet
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into auth.users(id, email) values ('${F1}', 'fotky1@priklad.cz'), ('${F2}', 'fotky2@priklad.cz')
         on conflict (id) do nothing;
       insert into account_tier(user_id, max_listings) values ('${F2}', 20)
         on conflict (user_id) do update set max_listings = 20;
       delete from storage.objects where bucket_id = 'listing-photos';`]);
    // Nahrání JEDNÉ fotky jako přihlášený člověk — přesně tak, jak chodí z prohlížeče.
    const nahrajFotku = (kdo, jmeno) => psqlVse(['-d', 'zkouska', '-tAc',
      `set role authenticated; set pk.uid = '${kdo}';
       insert into storage.objects(bucket_id, name, owner) values ('listing-photos', '${jmeno}', '${kdo}');`]);

    pravda('fotka do vlastní složky projde', /INSERT 0 1/.test(nahrajFotku(F1, F1 + '/1.jpg')),
      'nahrání vlastní fotky skončilo chybou — zkoušky níž by měřily zavřené dveře');
    pravda('fotka do CIZÍ složky neprojde', /ERROR/i.test(nahrajFotku(F1, F2 + '/pod-cizim.jpg')),
      'prošel zápis pod cizí předponu — podle složky se pozná, čí fotka to je');

    /* Strop. Prvních 23 souborů se doplní jako vlastník tabulky (RLS se
       na něj nevztahuje) — zkouší se až to jedno nahrání NAD stropem,
       a to už jako přihlášený člověk. Jinak by se měřilo, jak dlouho
       trvá 24 zápisů, ne jestli strop drží. */
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into storage.objects(bucket_id, name, owner)
         select 'listing-photos', '${F1}/' || i || '.jpg', '${F1}' from generate_series(2, 24) i;`]);
    const zbyvaPredStropem = psql(['-d', 'zkouska', '-tAc',
      `set pk.uid = '${F1}'; select my_photo_space()`]).trim().split('\n').pop();
    pravda('na stropu hlásí my_photo_space() nulu', zbyvaPredStropem === '0',
      `hlásí ${zbyvaPredStropem} — web by sliboval místo, které už není`);

    /* STROP DRŽÍ VE DVOU VRSTVÁCH a musí se měřit každá zvlášť. Politika
       nad jedním zápisem, spouštěč nad vícerádkovým (politika se ptá
       dotazem na tutéž tabulku a ten řádky z téhož příkazu nevidí).
       Dokud se měřily spolu, prošla sabotáž: vyndal jsem stropovou
       podmínku z politiky a zkouška zůstala zelená, protože ji dochytil
       spouštěč. Proto se tu spouštěč SCHVÁLNĚ odpojí. */
    psql(['-d', 'zkouska', '-q', '-c', 'drop trigger if exists uloziste_strop_fotek on storage.objects']);
    pravda('dvacátá pátá fotka free účtu neprojde ani bez spouštěče (drží politika)',
      /ERROR/i.test(nahrajFotku(F1, F1 + '/25.jpg')),
      'strop 24 souborů na účet nedrží v politice — zbyl by jen spouštěč');
    psql(['-d', 'zkouska', '-q', '-c',
      `create trigger uloziste_strop_fotek before insert on storage.objects
         for each row execute function uloziste_strop_fotek()`]);

    /* A placený účet má strop vyšší — jinak by byl strop jen zdánlivě
       odstupňovaný a 24 by platilo pro všechny. */
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into storage.objects(bucket_id, name, owner)
         select 'listing-photos', '${F2}/' || i || '.jpg', '${F2}' from generate_series(1, 24) i;`]);
    pravda('placenému účtu dvacátá pátá fotka projde', /INSERT 0 1/.test(nahrajFotku(F2, F2 + '/25.jpg')),
      'strop se nenásobí povoleným počtem inzerátů (my_limit)');
    /* A JEDNÍM PŘÍKAZEM? Politika se ptá dotazem na tutéž tabulku,
       takže je otázka, jestli při vícerádkovém zápisu vidí řádky
       z téhož příkazu. Kdyby ne, obešel by se strop jedním vložením
       o dvaceti pěti řádcích. Měří se to schválně: tahle cesta sice
       z prohlížeče nevede (úložiště přijímá jeden soubor na jeden
       dotaz a schéma storage není přes PostgREST vidět), ale vědět
       se to má. */
    psql(['-d', 'zkouska', '-q', '-c', `delete from storage.objects where name like '${F1}/%'`]);
    const najednou = psqlVse(['-d', 'zkouska', '-tAc',
      `set role authenticated; set pk.uid = '${F1}';
       insert into storage.objects(bucket_id, name, owner)
         select 'listing-photos', '${F1}/h' || i || '.jpg', '${F1}' from generate_series(1, 30) i;`]);
    const poNajednou = Number(psql(['-d', 'zkouska', '-tAc',
      `select count(*) from storage.objects where name like '${F1}/%'`]).trim());
    pravda('strop nejde obejít ani jedním příkazem o třiceti řádcích (tady měří spouštěč)',
      /ERROR/i.test(najednou) && poNajednou === 0,
      `vložilo se ${poNajednou} řádků (čekalo se 0 a chyba)`);

    const zbyvaPlacenemu = psql(['-d', 'zkouska', '-tAc',
      `set pk.uid = '${F2}'; select my_photo_space()`]).trim().split('\n').pop();
    pravda('a my_photo_space() mu hlásí zbytek, ne nulu', Number(zbyvaPlacenemu) > 0,
      `hlásí ${zbyvaPlacenemu}`);
    psql(['-d', 'zkouska', '-q', '-c', `delete from storage.objects where bucket_id = 'listing-photos'`]);

    /* OSIŘELÉ FOTKY. delete_listing maže jen řádek v listings, fotky
       zůstanou — a se stropem je to past: účet se zasekne na fotkách,
       které už k ničemu nepatří. osirele_fotky() je vypíše (mazat je
       musí Storage API, viz scripts/uklid-databaze.mjs). */
    psql(['-d', 'zkouska', '-q', '-c',
      `insert into listings(place, okres, druh, area, price, lat, lng, description, contact_phone, status, user_id, photos)
         values ('Fotkova','Kolín','orná půda',1000,100000,50,15,'popis','777111222','approved','${F1}',
                 '["https://x/storage/v1/object/public/listing-photos/${F1}/drzena.jpg"]'::jsonb);
       insert into storage.objects(bucket_id, name, owner, created_at) values
         ('listing-photos', '${F1}/drzena.jpg', '${F1}', now() - interval '3 days'),
         ('listing-photos', '${F1}/osirela.jpg', '${F1}', now() - interval '3 days'),
         ('listing-photos', '${F1}/vcerejsi.jpg', '${F1}', now() - interval '10 minutes');`]);
    const osirele = psql(['-d', 'zkouska', '-tAc', `select name from osirele_fotky()`])
      .trim().split('\n').map((x) => x.trim()).filter(Boolean);
    pravda('osiřelá fotka se najde', osirele.indexOf(F1 + '/osirela.jpg') >= 0,
      'vrátilo: ' + (osirele.join(', ') || '(nic)'));
    pravda('a ta, na kterou inzerát odkazuje, se nenajde',
      osirele.indexOf(F1 + '/drzena.jpg') < 0, 'úklid by smazal fotku živého inzerátu');
    pravda('ani ta právě nahraná (ještě nemá k čemu patřit)',
      osirele.indexOf(F1 + '/vcerejsi.jpg') < 0,
      'úklid by smazal fotku, která čeká na založení inzerátu');
    for (const role of ['anon', 'authenticated']) {
      const r = psqlVse(['-d', 'zkouska', '-tAc', `set role ${role}; select name from osirele_fotky();`]);
      pravda(`${role} si seznam fotek napříč účty vypsat nesmí`, /ERROR/i.test(r),
        'prošlo: ' + r.replace(/\s+/g, ' ').slice(0, 90));
    }
    psql(['-d', 'zkouska', '-q', '-c',
      `delete from storage.objects where bucket_id = 'listing-photos';
       delete from listings where place = 'Fotkova';`]);
  }

  /* UPOZORNĚNÍ NA KONTAKTNÍ FORMULÁŘ. Funkce notify_new_message() a její
     spouštěč v databázi běžely, ale v repozitáři nebyly — a klíč
     k Resendu měly napsaný přímo v těle. Měří se tu obojí, co z toho
     plyne: že spouštěč vznikl a že vložení zprávy přežije i stav, kdy
     pošta nastavená NENÍ. To druhé je důležitější: kontaktní formulář
     nesmí spadnout kvůli tomu, že se nemá kam poslat upozornění. */
  /* psql bez -q připojí za výsledek ještě příkazovou značku („INSERT 0 1"),
     takže se porovnává první řádek. Kdyby se tu porovnával celý výstup,
     zkouška by hlásila pád tam, kde vložení prošlo — což se mi při psaní
     taky stalo. */
  const vlozeno = (v) => !/ERROR/i.test(v) && v.trim().split('\n')[0].trim() === '1';

  const SPOUSTEC = psql(['-d', 'zkouska', '-tAc',
    `select count(*) from pg_trigger where tgname = 'trg_notify_new_message'`]).trim();
  pravda('spouštěč upozornění na zprávu vznikl', SPOUSTEC === '1',
    'trg_notify_new_message v databázi není — upozornění na kontaktní formulář by nechodila');

  const odeslano = () => Number(psql(['-d', 'zkouska', '-tAc',
    'select count(*) from net.volani']).trim());

  psql(['-d', 'zkouska', '-q', '-c',
    'delete from vault.decrypted_secrets; delete from net.volani;']);
  const bezPosty = psqlVse(['-d', 'zkouska', '-tAc',
    `insert into messages(kind, name, email, okres, message)
     values ('kontakt', 'Bez Posty', 'bez@priklad.cz', 'Brno-venkov', 'ahoj') returning 1;`]);
  pravda('zpráva se uloží i bez nastavené pošty', vlozeno(bezPosty),
    'vložení spadlo: ' + bezPosty.replace(/\s+/g, ' ').slice(0, 120));
  pravda('a bez klíče se neodesílá nic', odeslano() === 0,
    'funkce volala Resend, i když klíč ve Vaultu není');

  psql(['-d', 'zkouska', '-q', '-c',
    `insert into vault.decrypted_secrets(name, decrypted_secret) values
       ('RESEND_API_KEY', 're_zkouska'), ('PK_MAIL_TO', 'majitel@priklad.cz'),
       ('PK_MAIL_FROM', 'upozorneni@priklad.cz');`]);
  const sPostou = psqlVse(['-d', 'zkouska', '-tAc',
    `insert into messages(kind, name, email, okres, message)
     values ('kontakt', 'S Postou', 's@priklad.cz', 'Brno-mesto', 'ahoj') returning 1;`]);
  pravda('a uloží se i s ní (odeslání nic neblokuje)', vlozeno(sPostou),
    'vložení spadlo: ' + sPostou.replace(/\s+/g, ' ').slice(0, 120));
  pravda('s nastavenou poštou odešlo právě jedno volání', odeslano() === 1,
    'volání Resendu: ' + odeslano());
  const POSLANE = psql(['-d', 'zkouska', '-tAc',
    `select (headers->>'Authorization') || ' | ' || (body->>'to') || ' | ' || (body->>'subject')
       from net.volani order by id desc limit 1`]).trim();
  pravda('klíč i příjemce se vzaly z Vaultu, ne z těla funkce',
    POSLANE.startsWith('Bearer re_zkouska | majitel@priklad.cz |'),
    'odešlo: ' + POSLANE);

  /* SABOTÁŽ: kdyby v hlavičce chyběl příjemce, nesmí se poslat nic.
     Bez téhle kontroly by stačilo, aby se Vault vyprázdnil, a funkce
     by volala Resend s prázdnou adresou — tedy marně a při každé
     zprávě. */
  psql(['-d', 'zkouska', '-q', '-c',
    `delete from vault.decrypted_secrets where name = 'PK_MAIL_TO';
     delete from net.volani;`]);
  const bezPrijemce = psqlVse(['-d', 'zkouska', '-tAc',
    `insert into messages(kind, name, message) values ('kontakt', 'Bez Prijemce', 'ahoj') returning 1;`]);
  pravda('bez příjemce se zpráva uloží', vlozeno(bezPrijemce),
    'vložení spadlo: ' + bezPrijemce.replace(/\s+/g, ' ').slice(0, 120));
  pravda('a bez příjemce se neodesílá nic', odeslano() === 0,
    'funkce volala Resend s prázdnou adresou — marně a při každé zprávě');
  psql(['-d', 'zkouska', '-q', '-c',
    `delete from messages where email like '%@priklad.cz' or name = 'Bez Prijemce';
     delete from vault.decrypted_secrets; delete from net.volani;`]);
} finally {
  zavri();
}

console.log('\nZaložení databáze na čistém PostgreSQL');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Databáze: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
