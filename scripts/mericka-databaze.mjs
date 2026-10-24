#!/usr/bin/env node
/* MĚŘIDLO DATABÁZE — co kolik stojí, až jich bude hodně.
   ==================================================================
   Spuštění: node scripts/mericka-databaze.mjs
             node scripts/mericka-databaze.mjs --maly   (desetina dat)

   PROČ. Dnes jsou tabulky skoro prázdné, takže každý dotaz je rychlý
   a o rychlosti to neříká nic. Rozdíl mezi „jde po indexu" a „čte
   celou tabulku" se pozná až na objemu — a tam se pozná pozdě, až
   u lidí. Měřidlo proto založí databázi, pustí do ní celý
   supabase/00-vse.sql, nasype objemy, jaké web unese za rok provozu,
   a změří KAŽDOU cestu, kterou web opravdu volá: čas i plán.

   CO SE MĚŘÍ A PROČ TYHLE OBJEMY (odhad na rok při slušném provozu):
     2 000 účtů · 20 000 inzerátů · 60 000 zpráv
     50 000 poznámek · 50 000 uložených pozemků
     20 000 uložených hledání · 10 000 přihlášek k hlídání
     200 000 řádků návštěvnosti · 5 000 fotek v úložišti

   JAK SE ČTE VÝSTUP. U každé cesty je čas v ms a jestli v plánu stojí
   „Seq Scan" nad velkou tabulkou. Seq Scan sám o sobě není vada —
   u malé tabulky je rychlejší než index. Vada je, když roste s počtem
   řádků a web ho volá při každém načtení stránky.

   TOHLE NENÍ ZKOUŠKA. Nic netvrdí, jen měří; hlídá se to v
   scripts/test-sql-vykon.mjs, kde jsou mezní čísla naměřená tímhle.
   ================================================================== */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spustPostgres, podstrcSupabase } from './zkouska-postgres.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MALY = process.argv.includes('--maly');
const N = (x) => Math.max(1, Math.round(MALY ? x / 10 : x));

const pg = spustPostgres('mericka');
if (!pg) { console.log('PostgreSQL tu není — nemám co měřit.'); process.exit(0); }
const { psql, psqlVse, zavri, db } = pg;

try {
  podstrcSupabase(psql, db);
  const vystup = psqlVse(['-d', db, '-f', path.join(KOREN, 'supabase', '00-vse.sql')]);
  const chyby = vystup.split('\n').filter((r) => /ERROR:/.test(r));
  if (chyby.length) { console.log('00-vse.sql hlásí chyby:\n' + chyby.slice(0, 5).join('\n')); process.exit(1); }

  console.log(`\nNasypávám data${MALY ? ' (desetina)' : ''}…`);
  const t0 = Date.now();
  psql(['-d', db, '-q'], `
    insert into auth.users (id, email, email_confirmed_at)
      select gen_random_uuid(), 'u'||g||'@priklad.cz', now() from generate_series(1,${N(2000)}) g;
    insert into listings (status, place, okres, druh, area, price, lat, lng, user_id, created_at, public_at, photos)
      select 'approved','Obec'||(g%300),'Okres'||(g%76),'orná půda',1000+(g%9000),200000+(g*37%800000),
             48.6+(g%300)/100.0, 14.0+(g%400)/100.0, u.id, now()-(g||' minutes')::interval, now()-(g||' minutes')::interval,
             ('["https://x.supabase.co/storage/v1/object/public/listing-photos/'||u.id||'/f'||g||'.jpg"]')::jsonb
      from generate_series(1,${N(20000)}) g
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % ${N(2000)}) + 1;
    insert into chat_messages (listing_id, buyer_id, sender_id, body, created_at)
      select l.id, u.id, case when g%2=0 then u.id else l.user_id end, 'z'||g, now()-(g||' seconds')::interval
      from generate_series(1,${N(60000)}) g
      join (select id, user_id, row_number() over (order by id) n from listings) l on l.n = (g*7 % ${N(20000)}) + 1
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g*13 % ${N(2000)}) + 1;
    insert into poznamky (user_id, klic, text, zmeneno)
      select u.id, 'k'||g, 'poznámka '||g, now()-(g||' minutes')::interval
      from generate_series(1,${N(50000)}) g
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % ${N(2000)}) + 1;
    insert into ulozene (user_id, klic, kdy)
      select u.id, 'u'||g, now()-(g||' minutes')::interval
      from generate_series(1,${N(50000)}) g
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % ${N(2000)}) + 1;
    insert into saved_searches (user_id, label, okres, druh, ptype, max_price, mailem, created_at)
      select u.id, 'hledání '||g, 'Okres'||(g%76), 'orná půda', 'sale', 500000, (g%3=0), now()-(g||' minutes')::interval
      from generate_series(1,${N(20000)}) g
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % ${N(2000)}) + 1;
    insert into mail_nastaveni (user_id, vypnuto, token)
      select id, false, md5(id::text) from auth.users on conflict (user_id) do nothing;
    insert into watch_subscriptions (email, okres, confirmed, active, confirm_token, created_at)
      select 'h'||g||'@priklad.cz', 'Okres'||(g%76), g%2=0, true, md5(g::text), now()-(g||' minutes')::interval
      from generate_series(1,${N(10000)}) g;
    insert into navstevnost (den, stranka, zdroj, zarizeni, zobrazeni)
      select (current_date - (g%365)), 's'||(g%600)||'.html', 'z'||(g%7), case when g%2=0 then 'mobil' else 'stolni' end, 1+(g%40)
      from generate_series(1,${N(200000)}) g
      on conflict do nothing;
    insert into storage.buckets (id, name, public) values ('listing-photos','listing-photos',true) on conflict do nothing;
    insert into storage.objects (bucket_id, name, owner, created_at)
      select 'listing-photos', u.id||'/f'||g||'.jpg', u.id, now()-(g||' hours')::interval
      from generate_series(1,${N(5000)}) g
      join (select id, row_number() over (order by id) n from auth.users) u on u.n = (g % ${N(2000)}) + 1;
    analyze;`);
  console.log(`hotovo za ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const pocty = psql(['-d', db, '-tAc', `select
      (select count(*) from auth.users) || ' účtů, ' ||
      (select count(*) from listings) || ' inzerátů, ' ||
      (select count(*) from chat_messages) || ' zpráv, ' ||
      (select count(*) from poznamky) || ' poznámek, ' ||
      (select count(*) from ulozene) || ' uložených, ' ||
      (select count(*) from saved_searches) || ' hledání, ' ||
      (select count(*) from watch_subscriptions) || ' přihlášek, ' ||
      (select count(*) from navstevnost) || ' řádků návštěvnosti, ' ||
      (select count(*) from storage.objects) || ' fotek'`]).trim();
  console.log('V databázi: ' + pocty + '\n');

  const kdoMaNejvic = psql(['-d', db, '-tAc',
    'select user_id from poznamky group by user_id order by count(*) desc limit 1']).trim();
  const vlakno = psql(['-d', db, '-tAc',
    'select buyer_id from chat_messages group by buyer_id order by count(*) desc limit 1']).trim();

  /* Každá cesta se měří TŘIKRÁT a bere se nejlepší čas: první průchod
     platí za zahřátí mezipaměti a měřil by disk, ne dotaz. */
  function zmer(popis, sql, kdo) {
    let nej = Infinity, plan = '';
    for (let i = 0; i < 3; i++) {
      const out = psqlVse(['-d', db, '-tAc',
        `${kdo ? `set pk.uid = '${kdo}'; ` : ''}explain (analyze, costs off) ${sql}`]);
      const m = /Execution Time: ([\d.]+) ms/.exec(out);
      if (m && Number(m[1]) < nej) { nej = Number(m[1]); plan = out; }
    }
    const seq = [...plan.matchAll(/Seq Scan on ([a-z_]+)/g)].map((x) => x[1]);
    const stav = nej > 50 ? '✕' : nej > 10 ? '!' : '·';
    console.log(`  ${stav} ${popis.padEnd(44)} ${nej.toFixed(1).padStart(8)} ms`
      + (seq.length ? `   celá tabulka: ${[...new Set(seq)].join(', ')}` : ''));
    return { ms: nej, seq: [...new Set(seq)] };
  }

  console.log('CESTY, KTERÉ VOLÁ PŘIHLÁŠENÝ ČLOVĚK');
  zmer('moje_poznamky()', 'select * from moje_poznamky()', kdoMaNejvic);
  zmer('moje_ulozene()', 'select * from moje_ulozene()', kdoMaNejvic);
  zmer('my_searches()', 'select * from my_searches()', kdoMaNejvic);
  zmer('my_listings()', 'select * from my_listings()', kdoMaNejvic);
  zmer('my_threads()', 'select * from my_threads()', vlakno);
  zmer('unread_count()', 'select unread_count()', vlakno);
  zmer('poznamka_uloz() — nová', `select poznamka_uloz('nova-${Date.now()}', 'text')`, kdoMaNejvic);
  zmer('ulozeny_uloz() — nový', `select ulozeny_uloz('nk-${Date.now()}')`, kdoMaNejvic);
  zmer('my_photo_space()', 'select my_photo_space()', kdoMaNejvic);

  console.log('\nCESTY, KTERÉ VOLÁ KDOKOLI (veřejné)');
  zmer('public_listings()', 'select * from public_listings()');
  zmer('zapis_navstevu()', `select zapis_navstevu('index.html','','mobil',false)`);

  console.log('\nCESTY NOČNÍCH ÚLOH (service_role)');
  zmer('hlidani_k_odeslani(20)', 'select * from hlidani_k_odeslani(20)');
  zmer('hlidani_k_odeslani_push(20)', 'select * from hlidani_k_odeslani_push(20)');
  zmer('osirele_fotky(24, 500)', 'select * from osirele_fotky(24, 500)');
  zmer('uklid_navstevnosti()', 'select uklid_navstevnosti()');
  zmer('uklid_posty(180)', 'select uklid_posty(180)');
  zmer('uklid_hlidani(30)', 'select uklid_hlidani(30)');
  zmer('prehled_navstevnosti(30)', 'select * from prehled_navstevnosti(30)');

  console.log('\n  · = do 10 ms, ! = do 50 ms, ✕ = nad 50 ms\n');
} finally {
  zavri();
}
