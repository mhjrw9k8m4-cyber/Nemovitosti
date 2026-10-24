// Test: cesty do databáze nesmí zpomalovat s počtem řádků.
//
// Spuštění: node scripts/test-sql-vykon.mjs
//   (potřebuje PostgreSQL; bez něj se test přeskočí, ale NAHLAS)
//
// PROČ VZNIKL. scripts/mericka-databaze.mjs změřilo na objemech, jaké
// web unese za rok provozu, dvě cesty, které nerostly s počtem řádků
// hezky, ale ošklivě:
//
//   osirele_fotky(24, 500)      23 785 ms   (desetina dat: 257 ms → ×92)
//   public_listings()               99 ms   (desetina dat: 10,9 ms)
//
// První se ptala u KAŽDÉ fotky, jestli její jméno stojí někde v
// `photos` některého inzerátu — tedy fotky × inzeráty. Druhá měla
// v podmínce funkci se `set search_path`, a taková funkce se nedá
// vložit do dotazu: PostgreSQL ji počítá řádek po řádku a nemůže
// použít index.
//
// Po opravě: 238 ms a 37 ms. Tenhle test hlídá, aby se ani jedno
// nemohlo vrátit — a hlídá i to, co ta rychlost nesmí stát: obě
// funkce musí dávat STEJNÉ odpovědi jako jejich pomalé podoby.
//
// ČAS SE MĚŘÍ POMĚREM, NE PEVNÝM ČÍSLEM. Stejně jako v
// scripts/test-sql-cista.mjs: pomalá podoba se vyrobí v téže databázi
// vedle živé a porovnají se mezi sebou. Pevná mez v milisekundách by
// na pomalejším stroji hlásila planý poplach; poměr dvou dotazů na
// témže stroji ne.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spustPostgres, podstrcSupabase, najdiPg } from './zkouska-postgres.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

console.log('\nRychlost cest do databáze');
if (!najdiPg()) {
  console.log('  ⚠ PostgreSQL tu není — test se přeskakuje.');
  if (process.env.PK_SQL_VYZADOVAN === '1') {
    console.log('    PK_SQL_VYZADOVAN=1 — tady se přeskakovat nesmí.\n');
    process.exit(1);
  }
  console.log('    (U sebe je to v pořádku; v CI to hlídá PK_SQL_VYZADOVAN.)\n');
  process.exit(0);
}

const pg = spustPostgres('vykon');
const { psql, psqlVse, zavri, db } = pg;

/* KOLIK ŘÁDKŮ. Desetina toho, co sype měřidlo: tady nejde o absolutní
   čísla, ale o POMĚR mezi dvěma podobami téhož dotazu — a ten se
   u kvadratického chování projeví i na desetině. Víc řádků by jen
   prodloužilo CI. */
const UCTU = 300, INZERATU = 4000, FOTEK = 1500, POZNAMEK = 20000;

try {
  podstrcSupabase(psql, db);
  const vystup = psqlVse(['-d', db, '-f', path.join(KOREN, 'supabase', '00-vse.sql')]);
  const chybySql = vystup.split('\n').filter((r) => /ERROR:/.test(r));
  pravda('balík supabase/00-vse.sql proběhl bez chyb', chybySql.length === 0,
    chybySql.slice(0, 3).join('\n      '));

  psql(['-d', db, '-q'], `
    insert into auth.users (id, email, email_confirmed_at)
      select gen_random_uuid(), 'v'||g||'@priklad.cz', now() from generate_series(1,${UCTU}) g;
    /* MÍCHANICE STAVŮ, NE SAMÉ SCHVÁLENÉ: část čeká s prošlým časem
       zveřejnění (ta je veřejná), část s budoucím (ta ne) a část je
       zamítnutá (ta nikdy). Na samých schválených by se nepoznalo, že
       podmínka vybírá správně — vybralo by se všechno. */
    insert into listings (status, place, okres, druh, area, price, lat, lng, user_id, created_at, public_at, photos)
      select case when g%20 < 14 then 'approved' when g%20 < 17 then 'pending' else 'rejected' end,
             'Obec'||(g%50),'Okres'||(g%76),'orná půda',1000+(g%9000),200000+(g*37%800000),
             48.6+(g%300)/100.0, 14.0+(g%400)/100.0, u.id,
             now()-(g||' minutes')::interval,
             case when g%40 < 17 then now()-(g||' minutes')::interval else now()+interval '2 days' end,
             ('["https://x.supabase.co/storage/v1/object/public/listing-photos/'||u.id||'/f'||g||'.jpg"]')::jsonb
      from generate_series(1,${INZERATU}) g
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % ${UCTU}) + 1;
    insert into poznamky (user_id, klic, text, zmeneno)
      select u.id, 'k'||g, 'poznámka '||g, now()-(g||' minutes')::interval
      from generate_series(1,${POZNAMEK}) g
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % ${UCTU}) + 1;
    insert into ulozene (user_id, klic, kdy)
      select u.id, 'u'||g, now()-(g||' minutes')::interval
      from generate_series(1,${POZNAMEK}) g
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % ${UCTU}) + 1;
    insert into saved_searches (user_id, label, okres, druh, ptype, max_price, mailem, created_at)
      select u.id, 'hledání '||g, 'Okres'||(g%76), 'orná půda', 'sale', 500000, (g%3=0), now()-(g||' minutes')::interval
      from generate_series(1,${POZNAMEK}) g
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % ${UCTU}) + 1;
    insert into storage.buckets (id, name, public) values ('listing-photos','listing-photos',true) on conflict do nothing;
    insert into storage.objects (bucket_id, name, owner, created_at)
      select 'listing-photos', u.id||'/f'||g||'.jpg', u.id, now()-(g||' hours')::interval
      from generate_series(1,${FOTEK}) g
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % ${UCTU}) + 1;
    analyze;`);

  // Nejkratší ze tří běhů — jeden běh umí zdržet cokoli, co běží vedle.
  const cas = (dotaz, pred) => {
    let nej = Infinity;
    for (let i = 0; i < 3; i++) {
      const out = psqlVse(['-d', db, '-tAc',
        `${pred ? pred + '; ' : ''}explain (analyze, costs off) ${dotaz}`]);
      const m = /Execution Time: ([\d.]+) ms/.exec(out);
      if (m) nej = Math.min(nej, parseFloat(m[1]));
    }
    return nej;
  };
  const radky = (dotaz) => psql(['-d', db, '-tAc', dotaz])
    .split('\n').map((r) => r.trim()).filter(Boolean);

  /* ---- 1) OSIŘELÉ FOTKY: fotky × inzeráty, nebo jeden průchod? ---- */
  psql(['-d', db, '-q'], `
    -- Stará podoba, slovo od slova, jak stála v supabase/uloziste-strop.sql.
    create or replace function osirele_fotky_stare(p_starsi_nez_hodin integer default 24,
                                                   p_limit integer default 500)
    returns table(name text)
    language sql security definer set search_path = public stable as $f$
      select o.name from storage.objects o
      where o.bucket_id = 'listing-photos'
        and o.created_at < now() - make_interval(hours => greatest(coalesce(p_starsi_nez_hodin, 24), 1))
        and not exists (select 1 from listings l where strpos(l.photos::text, o.name) > 0)
      order by o.created_at
      limit greatest(least(coalesce(p_limit, 500), 1000), 1);
    $f$;`);

  /* NEJDŘÍV STEJNÁ ODPOVĚĎ, PAK RYCHLOST. Rychlejší funkce, která
     odpovídá jinak, není zlepšení — a tady by „jinak" znamenalo
     smazané fotky živých inzerátů. Na čistých datech se musí obě
     shodnout do posledního jména. */
  psql(['-d', db, '-q', '-c', `insert into storage.objects (bucket_id, name, owner, created_at)
    select 'listing-photos', u.id||'/osirela'||g||'.jpg', u.id, now() - interval '48 hours'
    from generate_series(1,7) g join (select id, row_number() over (order by id) n from auth.users) u on u.n = g`]);
  const nova = radky('select name from osirele_fotky(24, 1000) order by 1');
  const stara = radky('select name from osirele_fotky_stare(24, 1000) order by 1');
  pravda('osirele_fotky vypíše totéž co pomalá podoba',
    nova.length === stara.length && nova.every((n, i) => n === stara[i]),
    `nová ${nova.length} jmen, stará ${stara.length}`);
  pravda('osirele_fotky našla všech 7 opravdu osiřelých fotek',
    nova.length === 7 && nova.every((n) => /\/osirela\d+\.jpg$/.test(n)),
    'našla: ' + nova.slice(0, 9).join(', '));

  const casStary = cas('select * from osirele_fotky_stare(24, 500)');
  const casNovy = cas('select * from osirele_fotky(24, 500)');
  /* MEZ 10×, naměřeno 100×. Mez je nízko schválně: hlídá se TVAR
     dotazu (jeden průchod proti součinu tabulek), ne přesné číslo, a
     na stroji, kde vedle běží něco jiného, se poměr srazí. */
  pravda('osirele_fotky je proti pomalé podobě aspoň 10× rychlejší',
    casNovy > 0 && casStary / casNovy >= 10,
    `stará ${casStary.toFixed(1)} ms, nová ${casNovy.toFixed(1)} ms`
    + ` — poměr ${(casStary / casNovy).toFixed(1)}×`);

  /* ---- 2) POJISTKY OSIŘELÝCH FOTEK (zahrané sabotáží) ------------
     Chyba tady nemaže řádky v databázi, ale FOTKY LIDÍ, a nedá se
     vzít zpět. Obě pojistky musí být vidět na chování, ne jen
     v komentáři. */
  {
    const pred = radky('select name from osirele_fotky(24, 1000)').length;
    /* Původní hodnota se schová a pak vrátí PŘESNĚ, ne „nějaká
       podobná": kdyby se vrátila adresa na jinou fotku, zůstala by
       ta původní bez odkazu a vyšla by jako osiřelá — zkouška by pak
       padala na vlastním úklidu, ne na vadě. */
    const terc = radky('select id from listings order by id limit 1')[0];
    const puvodni = radky(`select photos::text from listings where id = '${terc}'`)[0];
    psql(['-d', db, '-q', '-c',
      `update listings set photos = '["tohle-neni-adresa"]'::jsonb where id = '${terc}'`]);
    const po = radky('select name from osirele_fotky(24, 1000)').length;
    pravda('rozbitý tvar adresy fotky funkci ZTIŠÍ (nehlásí všechno jako osiřelé)',
      pred === 7 && po === 0,
      `před sabotáží ${pred} jmen, po ní ${po} — čekám 7 a pak 0`);
    psql(['-d', db, '-q'],
      `update listings set photos = $json$${puvodni}$json$::jsonb where id = '${terc}';`);
    pravda('po vrácení tvaru funkce opět vypisuje',
      radky('select name from osirele_fotky(24, 1000)').length === 7);
  }
  {
    /* Jméno s mezerou se v adrese píše jako %20, takže by se porovnání
       minulo a živá fotka by vyšla jako osiřelá. Takových jmen se
       funkce nesmí dotknout vůbec. */
    psql(['-d', db, '-q', '-c', `insert into storage.objects (bucket_id, name, owner, created_at)
      select 'listing-photos', u.id||'/moje foto.jpg', u.id, now() - interval '48 hours'
      from (select id, row_number() over (order by id) n from auth.users) u where u.n = 1`]);
    const jmena = radky('select name from osirele_fotky(24, 1000)');
    pravda('jména, která se v adrese kódují (mezera), se nevypisují',
      jmena.length === 7 && !jmena.some((j) => / /.test(j)),
      'vypsáno: ' + jmena.length + ' jmen');
    psql(['-d', db, '-q', '-c', `delete from storage.objects where name like '%moje foto%'`]);
  }

  /* ---- 3) VEŘEJNÝ SEZNAM: funkce v podmínce proti indexu --------- */
  psql(['-d', db, '-q'], `
    -- Stará podoba: tatáž podmínka, ale ve funkci se SET klauzulí,
    -- kterou PostgreSQL neumí vložit do dotazu.
    create or replace function listing_je_verejny_stare(p_status text, p_public_at timestamptz)
    returns boolean language sql stable set search_path = public as $f$
      select p_status = 'approved'
          or (p_status = 'pending' and p_public_at is not null and p_public_at <= now());
    $f$;
    create or replace function public_listings_stare()
    returns table(id uuid,place text,okres text,druh text,parcel text,area integer,price integer,
                  lat double precision,lng double precision,description text,contact text,
                  photos jsonb,features text[],access text,views integer,created_at timestamptz)
    language sql security definer set search_path = public as $f$
      select id,place,okres,druh,parcel,area,price,lat,lng,description,contact_phone,
             coalesce(photos,'[]'::jsonb),coalesce(features,'{}'),access,views,created_at
      from listings
      where listing_je_verejny_stare(status, public_at)
      order by created_at desc;
    $f$;`);
  {
    const a = radky('select id from public_listings() order by 1');
    const b = radky('select id from public_listings_stare() order by 1');
    pravda('public_listings vrací TOTÉŽ co podoba s funkcí v podmínce',
      a.length > 0 && a.length === b.length && a.every((x, i) => x === b[i]),
      `nová ${a.length} řádků, stará ${b.length}`);
    const cNovy = cas('select * from public_listings()');
    const cStary = cas('select * from public_listings_stare()');
    /* MEZ 1,5×, naměřeno 2,5–6,4× (podle toho, kolik inzerátů je
       veřejných). Nízko schválně — viz mez u osiřelých fotek. */
    pravda('public_listings je proti podobě s funkcí v podmínce aspoň 1,5× rychlejší',
      cNovy > 0 && cStary / cNovy >= 1.5,
      `stará ${cStary.toFixed(1)} ms, nová ${cNovy.toFixed(1)} ms`
      + ` — poměr ${(cStary / cNovy).toFixed(1)}×`);
  }

  /* A PROČ TO JE RYCHLEJŠÍ, ať se to nedá „zrychlit" zpátky:
     funkce nesmí mít SET klauzuli (jinak se nevloží do dotazu) a
     částečný index se musí opravdu použít. */
  pravda('listing_je_verejny nemá SET klauzuli (jinak ji nelze vložit do dotazu)',
    radky(`select coalesce(array_to_string(proconfig, ','), '-') from pg_proc
           where proname = 'listing_je_verejny'`)[0] === '-',
    'má nastavení: ' + radky(`select array_to_string(proconfig, ',') from pg_proc
                              where proname = 'listing_je_verejny'`).join(''));
  {
    /* A ŽE SE OPRAVDU VLOŽILA DO DOTAZU. Tělo funkce se přečte
       z katalogu (pg_proc.prosrc), takže se nezkouší můj opis, ale to,
       co v databázi doopravdy stojí, a pustí se na něj EXPLAIN. Když
       se funkce vložila, je podmínka v plánu rozepsaná na operátory;
       když ne, stojí v plánu její volání — a to je ten pomalý stav,
       řádek po řádku. Rozdíl nejde vidět na `explain` volání samotné
       funkce: ta má SET klauzuli, takže se v plánu ukáže jen jako
       „Function Scan" a dovnitř není vidět. */
    const telo = radky(`select prosrc from pg_proc where proname = 'public_listings'`).join(' ');
    const plan = psqlVse(['-d', db, '-tAc', 'explain (costs off) ' + telo]);
    pravda('podmínka veřejnosti se vložila do dotazu (není v plánu jako volání funkce)',
      /status = 'approved'/.test(plan) && !/listing_je_verejny/.test(plan),
      'plán: ' + plan.split('\n').filter(Boolean).slice(0, 4).join(' / '));
  }
  {
    /* Rychlost nesmí přijít o správnost: čekající inzerát s budoucím
       časem zveřejnění ve veřejném seznamu BÝT NESMÍ, s prošlým MUSÍ.
       Kdyby se podmínka částečného indexu zúžila, tohle padne. */
    const u = radky('select id from auth.users limit 1')[0];
    psql(['-d', db, '-q'], `
      insert into listings (status, place, okres, druh, area, price, user_id, public_at)
        values ('pending','Budoucí','Okres1','orná půda',1000,100000,'${u}', now() + interval '3 days'),
               ('pending','Prošlá','Okres1','orná půda',1000,100000,'${u}', now() - interval '1 hour'),
               ('rejected','Zamítnutá','Okres1','orná půda',1000,100000,'${u}', now() - interval '1 hour');`);
    const misto = radky(`select place from public_listings()
      where place in ('Budoucí','Prošlá','Zamítnutá')`);
    pravda('veřejný seznam bere čekající až po čase zveřejnění a zamítnuté nikdy',
      misto.length === 1 && misto[0] === 'Prošlá', 'vrátil: ' + misto.join(', '));
  }

  /* ---- 4) CESTY PŘIHLÁŠENÉHO: jdou po indexu, ne přes celou tabulku
     Plán těchhle funkcí není zvenčí vidět (funkce se SET klauzulí se
     do dotazu nevloží, takže EXPLAIN ukáže jen „Function Scan").
     Měří se proto CHOVÁNÍM: týž dotaz se pustí znovu s vypnutými
     indexy. Když funkce po indexu jde, bude bez nich výrazně pomalejší;
     když po něm nejde, nezmění se nic — a to je ta vada. */
  {
    const bezIndexu = 'set enable_indexscan=off; set enable_bitmapscan=off; set enable_indexonlyscan=off';
    const kdo = radky('select user_id from poznamky group by user_id order by count(*) desc limit 1')[0];
    for (const [jmeno, dotaz] of [
      ['moje_poznamky()', 'select * from moje_poznamky()'],
      ['moje_ulozene()', 'select * from moje_ulozene()'],
      ['my_searches()', 'select * from my_searches()'],
    ]) {
      const sIndexem = cas(dotaz, `set pk.uid = '${kdo}'`);
      const bez = cas(dotaz, `set pk.uid = '${kdo}'; ${bezIndexu}`);
      pravda(`${jmeno} jde po indexu, ne přes celou tabulku`,
        sIndexem > 0 && bez / sIndexem >= 3,
        `s indexem ${sIndexem.toFixed(2)} ms, bez indexů ${bez.toFixed(2)} ms`
        + ` — poměr ${(bez / sIndexem).toFixed(1)}× (čekám aspoň 3×)`);
    }
  }

  /* ---- 5) HLÍDÁNÍ: oba rozesílače řadí od toho, kdo čeká nejdél --
     Rozesílač se po PK_MAIL_LIMIT / PK_PUSH_LIMIT zastaví. Bez pořadí
     se nedá říct, koho obslouží — a u pushe pořadí dlouho chybělo. */
  {
    const u = radky('select id from auth.users order by id limit 3');
    /* ZRALÍ MUSÍ BÝT JEN TI TŘI. První podoba téhle kontroly nechala
       zralé všechny a brala prvních 400 řádků — v nich byli jen lidé,
       kterým se neposlalo nikdy, a oba označení účty vyšly mimo.
       Zkouška pak hlásila vadu pořadí tam, kde byla vada zkoušky. */
    psql(['-d', db, '-q'], `
      insert into mail_nastaveni (user_id, vypnuto, token)
        select id, false, md5(id::text) from auth.users on conflict (user_id) do nothing;
      insert into push_odbery (user_id, endpoint, p256dh, auth)
        select id, 'https://push.priklad.cz/'||id, 'k'||id, 'a'||id from auth.users
        on conflict do nothing;
      update saved_searches set mailem = true, pushem = true,
        mail_odeslano_at = now(), push_odeslano_at = now();
      update saved_searches set mail_odeslano_at = now() - interval '400 days',
                                push_odeslano_at = now() - interval '400 days'
        where user_id = '${u[0]}';
      update saved_searches set mail_odeslano_at = now() - interval '30 hours',
                                push_odeslano_at = now() - interval '30 hours'
        where user_id = '${u[1]}';
      update saved_searches set mail_odeslano_at = null, push_odeslano_at = null
        where user_id = '${u[2]}';
      analyze;`);
    for (const [jmeno, dotaz] of [
      ['hlidani_k_odeslani', 'hlidani_k_odeslani(20)'],
      ['hlidani_k_odeslani_push', 'hlidani_k_odeslani_push(20)'],
    ]) {
      const kdo = radky(`select user_id from ${dotaz}`);
      const nikdy = kdo.indexOf(u[2]), davno = kdo.indexOf(u[0]), nedavno = kdo.indexOf(u[1]);
      pravda(`${jmeno} řadí od toho, kdo čeká nejdéle`,
        nikdy === 0 && nikdy < davno && davno < nedavno,
        `komu se neposlalo nikdy je ${nikdy}., komu před 400 dny ${davno}.,`
        + ` komu před 30 hodinami ${nedavno}. (z ${kdo.length} řádků)`);
      pravda(`${jmeno} vydá jen zralá hledání`,
        kdo.length > 0 && new Set(kdo).size === 3,
        `různých lidí ve výpisu: ${new Set(kdo).size} — čekám 3`);
    }
  }
} finally {
  zavri();
}

console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Rychlost databáze: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
