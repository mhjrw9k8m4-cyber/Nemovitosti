/* Test: hlášení chyb z prohlížeče hlásí chybu, a nic jiného.
   ==================================================================
   Spuštění: node scripts/test-chyby-klienta.mjs
     (druhá polovina potřebuje PostgreSQL; bez něj se přeskakuje,
      v CI to nesmí — hlídá PK_SQL_VYZADOVAN=1)

   js/chyby.js je na 2 393 stránkách a posílá do databáze. Tři věci
   tedy musí držet přesně:

     A) POSLAT, KDYŽ SE MÁ. Jinak je celý hlásič jen slib — a slib
        v tomhle případě horší než nic, protože by se podle něj
        věřilo, že „žádná hlášení = web je v pořádku".
     B) NEPOSLAT NIC OSOBNÍHO. Do textu chyby se dostane cokoli, co
        do ní vložil programátor: adresa s tokenem, e-mail z políčka.
        Ořez je v prohlížeči i v databázi, protože zapsat umí kdokoli
        s veřejným klíčem, ne jen náš skript.
     C) NEUDĚLAT Z HLÁSIČE ÚTOK NA VLASTNÍ DATABÁZI. Chyba v kreslení
        umí vzniknout stokrát za sekundu. Proto stropy — a proto se
        zkouší, že stropy opravdu sepnou.

   Jak se to měří: js/chyby.js se spustí v Node s podstrčeným oknem
   (prohlížeč k tomu není potřeba, a tak zkouška patří do rychlé
   sady), databázová část se pustí na opravdovém PostgreSQL.
   ================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { spustPostgres, podstrcSupabase, najdiPg } from './zkouska-postgres.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const KOD = readFileSync(path.join(KOREN, 'js', 'chyby.js'), 'utf8');

const UA_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
  + ' (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)'
  + ' Chrome/141.0.0.0 Safari/537.36';

/* Podstrčené okno. `volby.smime` říká, co odpoví sdílený modul;
   `volby.nacteno` rozhoduje, jestli je stránka už po načtení. */
function spust(volby) {
  const v = volby || {};
  const poslano = [];
  const sklad = { ...(v.sklad || {}) };
  const posluchaci = {};
  const document = {
    readyState: v.nacteno === false ? 'loading' : 'complete',
    addEventListener: (jm, fn) => { posluchaci[jm] = fn; },
  };
  const window = {
    /* `window.document` tu není kvůli pohodlí: js/chyby.js se bez něj
       vůbec nerozjede (první řádek hlídá, že běží v prohlížeči). */
    document,
    PK_CHYBY: v.fronta || [],
    PKNeosobni: {
      smimePoslat: () => v.smime !== false,
      jmenoStranky: () => 'kontakt.html',
      posliRpc: (jm, telo) => {
        if (v.posilacPada) throw new Error('rozbitý odesílač');
        poslano.push({ jm, telo: JSON.parse(telo) });
      },
    },
    addEventListener: (jm, fn) => { posluchaci[jm] = fn; },
  };
  const navigator = { userAgent: v.ua || UA_CHROME };
  const sessionStorage = {
    getItem: (k) => (k in sklad ? sklad[k] : null),
    setItem: (k, h) => { sklad[k] = String(h); },
  };
  const location = {
    hostname: 'parcelaka.cz', pathname: '/kontakt.html',
    href: 'https://parcelaka.cz/kontakt.html', origin: 'https://parcelaka.cz',
  };
  /* setTimeout bez čekání: zkouška nemá spát, a `rozjed` je stejně
     synchronní práce. */
  const setTimeout_ = (fn) => { fn(); };
  new Function('window', 'location', 'navigator', 'document', 'sessionStorage', 'setTimeout', KOD)
    .call(null, window, location, navigator, document, sessionStorage, setTimeout_);
  return {
    poslano, sklad, posluchaci,
    nahlas: (hlaska, soubor, radek, sloupec) =>
      window.PK_CHYBY.push([hlaska, soubor, radek, sloupec]),
  };
}

/* ---- A) pošle, když se má ----------------------------------------- */
{
  const z = spust({});
  z.nahlas('x is not a function', 'https://parcelaka.cz/js/min/ceny.js?v=abc123', 14, 9);
  pravda('nahlášená chyba se odešle (právě jednou)', z.poslano.length === 1,
    `odesláno ${z.poslano.length}×`);
  if (z.poslano.length) {
    const t = z.poslano[0].telo;
    pravda('a jde do zapis_chybu', z.poslano[0].jm === 'zapis_chybu', z.poslano[0].jm);
    pravda(`posílá hlášku („${t.p_zprava}")`, t.p_zprava === 'x is not a function', JSON.stringify(t));
    pravda(`posílá místo bez domény i bez razítka („${t.p_zdroj}")`,
      t.p_zdroj === 'js/min/ceny.js:14:9', JSON.stringify(t));
    pravda(`posílá prohlížeč jako rodinu a hlavní verzi („${t.p_prohlizec}")`,
      t.p_prohlizec === 'chrome-141', JSON.stringify(t));
    pravda('a nic víc než čtyři pole neposílá',
      Object.keys(t).sort().join(',') === 'p_prohlizec,p_stranka,p_zdroj,p_zprava',
      'pole: ' + Object.keys(t).join(', '));
  }
}

/* Chyba, která se stala PŘED načtením odesílače, se nesmí zahodit —
   právě ty nejranější pády jsou ten důvod, proč hlásič vznikl. */
{
  const z = spust({ fronta: [['brzká chyba', 'https://parcelaka.cz/js/min/klic.js', 3, 1]], nacteno: false });
  pravda('chyba z doby před načtením čeká, neodešle se dřív', z.poslano.length === 0,
    `odesláno ${z.poslano.length}× — adresa databáze ještě nemusí být známá`);
  if (z.posluchaci.load) z.posluchaci.load();
  pravda('a po načtení stránky odejde', z.poslano.length === 1
    && z.poslano[0].telo.p_zprava === 'brzká chyba', JSON.stringify(z.poslano));
}

{
  const z = spust({ ua: UA_SAFARI });
  z.nahlas('undefined is not an object', 'https://parcelaka.cz/js/min/mapa.js', 2, 2);
  pravda('Safari se pozná jako safari (jediná zpráva o iPhonu, který nemáme na zkoušky)',
    z.poslano.length === 1 && z.poslano[0].telo.p_prohlizec === 'safari-17',
    JSON.stringify(z.poslano.map((x) => x.telo.p_prohlizec)));
}
{
  const z = spust({ ua: 'Nějaký úplně neznámý prohlížeč/1' });
  z.nahlas('chyba', 'https://parcelaka.cz/js/min/klic.js', 1, 1);
  pravda('neznámý prohlížeč je „jine", ne celý user agent',
    z.poslano.length === 1 && z.poslano[0].telo.p_prohlizec === 'jine',
    JSON.stringify(z.poslano.map((x) => x.telo.p_prohlizec)));
}

/* ---- B) nic osobního ---------------------------------------------- */
{
  const z = spust({});
  z.nahlas('Nepovedlo se https://parcelaka.cz/ucet?token=abc123&email=jan.novak%40seznam.cz načíst',
    'https://parcelaka.cz/js/min/auth.js', 5, 5);
  const t = (z.poslano[0] || {}).telo || {};
  pravda('z adresy v hlášce zbyde jen jméno souboru',
    z.poslano.length === 1 && !/token|abc123|jan|novak|seznam/.test(String(t.p_zprava)),
    `v hlášce stojí „${t.p_zprava}" — tohle by byl osobní údaj v databázi`);

  const z2 = spust({});
  z2.nahlas('E-mail jan.novak@seznam.cz je neplatný', 'https://parcelaka.cz/js/min/auth.js', 5, 5);
  const t2 = (z2.poslano[0] || {}).telo || {};
  pravda('e-mail z hlášky zmizí taky', z2.poslano.length === 1
    && /‹e-mail›/.test(String(t2.p_zprava)) && !/novak/.test(String(t2.p_zprava)),
    `v hlášce stojí „${t2.p_zprava}"`);

  const z3 = spust({});
  z3.nahlas('A'.repeat(900), 'https://parcelaka.cz/js/min/klic.js', 1, 1);
  pravda('dlouhá hláška se zkrátí na 200 znaků',
    z3.poslano.length === 1 && z3.poslano[0].telo.p_zprava.length === 200,
    'délka ' + ((z3.poslano[0] || { telo: {} }).telo.p_zprava || '').length);

  const z4 = spust({});
  z4.nahlas('ReferenceError: x', 'https://cizi-rozsireni.example/script.js', 1, 1);
  pravda('cizí soubor se jako místo neposílá',
    z4.poslano.length === 1 && z4.poslano[0].telo.p_zdroj === '',
    `místo: „${(z4.poslano[0] || { telo: {} }).telo.p_zdroj}"`);

  const z5 = spust({});
  z5.nahlas('Script error.', '', 0, 0);
  pravda('„Script error." se zahodí — nenese jméno, řádek ani hlášku',
    z5.poslano.length === 0, `odesláno ${z5.poslano.length}×, a opravit se z toho nedá nic`);

  const z6 = spust({ smime: false });
  z6.nahlas('x is not a function', 'https://parcelaka.cz/js/min/ceny.js', 1, 1);
  pravda('když sdílené stráže řeknou ne, neodešle se nic', z6.poslano.length === 0,
    `odesláno ${z6.poslano.length}×`);
}

/* ---- C) stropy ---------------------------------------------------- */
{
  const z = spust({});
  z.nahlas('táž chyba', 'https://parcelaka.cz/js/min/klic.js', 1, 1);
  z.nahlas('táž chyba', 'https://parcelaka.cz/js/min/klic.js', 1, 1);
  z.nahlas('táž chyba', 'https://parcelaka.cz/js/min/klic.js', 1, 1);
  pravda('táž chyba ze stejného místa jde jen jednou za načtení', z.poslano.length === 1,
    `odesláno ${z.poslano.length}×`);

  const z2 = spust({});
  for (let i = 0; i < 8; i++) z2.nahlas('chyba číslo ' + i, 'https://parcelaka.cz/js/min/klic.js', i, 1);
  pravda('různých chyb z jedné stránky nejvýš tři', z2.poslano.length === 3,
    `odesláno ${z2.poslano.length}×`);

  const z3 = spust({ sklad: { pk_chyby_poslano: '8' } });
  z3.nahlas('chyba', 'https://parcelaka.cz/js/min/klic.js', 1, 1);
  pravda('a za celou relaci v záložce nejvýš osm', z3.poslano.length === 0,
    `odesláno ${z3.poslano.length}× nad stropem relace`);

  const z4 = spust({ posilacPada: true });
  let spadlo = false;
  try { z4.nahlas('chyba', 'https://parcelaka.cz/js/min/klic.js', 1, 1); } catch (e) { spadlo = true; }
  pravda('a když spadne sám odesílač, nespadne s ním stránka', !spadlo,
    'výjimka z hlásiče by přebila tu chybu, kterou měl nahlásit');
}

/* ---- D) totéž v databázi, na opravdovém PostgreSQL ---------------- */
if (!najdiPg()) {
  zpravy.push('  ⚠ PostgreSQL tu není — databázová polovina se přeskakuje.');
  if (process.env.PK_SQL_VYZADOVAN === '1') {
    console.log('\nHlášení chyb z prohlížeče');
    console.log(zpravy.join('\n'));
    console.log('::error::Hlášení chyb: PostgreSQL chybí, a tahle úloha ho vyžaduje.');
    process.exit(1);
  }
} else {
  const pg = spustPostgres('zkouska_chyby');
  const { psql, psqlVse, zavri } = pg;
  try {
    podstrcSupabase(psql, 'zkouska_chyby');
    const vystup = psqlVse(['-d', 'zkouska_chyby', '-f', path.join(KOREN, 'supabase', '00-vse.sql')]);
    const chyby = vystup.split('\n').filter((r) => /ERROR:/.test(r))
      .filter((r) => !/schema "storage" does not exist|relation "storage\.[a-z_]+" does not exist/.test(r));
    pravda('balík projde na čisté databázi', chyby.length === 0, chyby.slice(0, 4).join('\n      '));

    const zapis = (s, z, zd, pr) => psqlVse(['-d', 'zkouska_chyby', '-tAc',
      `select zapis_chybu(${s}, ${z}, ${zd}, ${pr})`]);
    const dotaz = (sql) => (psql(['-d', 'zkouska_chyby', '-tAc', sql]) || '').trim();

    zapis("'kontakt.html'", "'x is not a function'", "'js/min/ceny.js:14:9'", "'safari-17'");
    pravda('zápis z prohlížeče v databázi vznikne',
      dotaz("select count(*) from chyby_klienta where stranka = 'kontakt.html'") === '1');

    zapis("'kontakt.html'", "'x is not a function'", "'js/min/ceny.js:14:9'", "'safari-17'");
    pravda('a druhý stejný jen zvedne čítač, nepřidá řádek',
      dotaz("select pocet from chyby_klienta where stranka = 'kontakt.html'") === '2'
      && dotaz('select count(*) from chyby_klienta') === '1');

    /* Druhá síť: do databáze zapisuje kdokoli s veřejným klíčem, ne
       jen náš skript. Co prohlížeč ořeže, musí odmítnout i ona. */
    zapis("'kontakt.html'", "'volal jan.novak@seznam.cz a spadlo to'", "''", "'chrome-141'");
    pravda('hlášku s e-mailem databáze nepřijme vůbec',
      dotaz("select count(*) from chyby_klienta where zprava like '%novak%'") === '0',
      'ořez v prohlížeči může obejít kdokoli, kdo zavolá RPC sám');

    zapis("'kontakt.html'", "'spadlo https://parcelaka.cz/ucet?token=abc123 takhle'", "''", "'chrome-141'");
    pravda('a z adresy v hlášce si nechá jen značku',
      dotaz("select count(*) from chyby_klienta where zprava like '%token%'") === '0'
      && dotaz("select count(*) from chyby_klienta where zprava like '%‹adresa›%'") === '1');

    zapis("'../../etc/passwd'", "'chyba'", "''", "'chrome-141'");
    pravda('jméno stránky mimo vzor se nezapíše',
      dotaz("select count(*) from chyby_klienta where stranka like '%passwd%'") === '0');

    zapis("'kontakt.html'", "'chyba'", "'js/min/klic.js:1:1'", "'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) celý user agent'");
    pravda('celý user agent se do sloupce prohlížeče nevejde a zbyde „jine"',
      dotaz("select count(*) from chyby_klienta where prohlizec like '%iPhone%'") === '0'
      && dotaz("select count(*) from chyby_klienta where prohlizec = 'jine'") === '1');

    zapis("'kontakt.html'", "'ab'", "''", "'chrome-141'");
    pravda('hláška kratší než tři znaky se nezapíše (čítač bez hlášky nic neopraví)',
      dotaz("select count(*) from chyby_klienta where zprava = 'ab'") === '0');

    /* Strop: 300 různých hlášek za den. Zkouší se tím, že se tabulka
       naplní dotazem, ne třemi sty voláními — jinak by zkouška běžela
       minutu a nikdo by ji nepustil. */
    psqlVse(['-d', 'zkouska_chyby', '-tAc',
      `insert into chyby_klienta (den, stranka, zprava, zdroj, prohlizec, pocet)
       select current_date, 'index.html', 'vycpávka ' || i, '', 'chrome-141', 1
       from generate_series(1, 400) i`]);
    zapis("'kontakt.html'", "'úplně nová hláška nad stropem'", "''", "'chrome-141'");
    pravda('nad denním stropem se nová hláška nezapíše',
      dotaz("select count(*) from chyby_klienta where zprava = 'úplně nová hláška nad stropem'") === '0');
    pravda('ale sepnutý strop je vidět z dat, ne jen z kódu',
      dotaz("select pocet from chyby_klienta where stranka = '(strop)'") === '1',
      'zahozená hlášení by zmizela a vypadalo by to, že se nic nestalo');
    zapis("'kontakt.html'", "'x is not a function'", "'js/min/ceny.js:14:9'", "'safari-17'");
    pravda('a hláška, která se dnes už počítala, se nad stropem počítá dál',
      dotaz("select pocet from chyby_klienta where stranka = 'kontakt.html' and zprava = 'x is not a function'") === '3',
      'jinak by strop utnul i to, co se měřit má');

    /* Úklid a čtení. */
    psqlVse(['-d', 'zkouska_chyby', '-tAc',
      `insert into chyby_klienta (den, stranka, zprava, zdroj, prohlizec, pocet)
       values (current_date - 200, 'index.html', 'stará hláška', '', 'chrome-141', 1)`]);
    const smazano = dotaz('select uklid_chyb_klienta()');
    pravda('úklid smaže hlášky starší půl roku a jen je', smazano === '1'
      && dotaz("select count(*) from chyby_klienta where zprava = 'stará hláška'") === '0',
      `smazáno ${smazano}`);
    const prehled = dotaz('select prehled_chyb(7)');
    pravda('přehled pro majitele se složí a nese hlášky i prohlížeče',
      /"hlasky"/.test(prehled) && /"prohlizece"/.test(prehled) && /"celkem"/.test(prehled),
      prehled.slice(0, 120));
  } finally { zavri(); }
}

console.log('\nHlášení chyb z prohlížeče návštěvníka');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Hlášení chyb: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
