/* Test: kdo smí co v databázi — a čím si to musí zasloužit.
   ==================================================================
   Spuštění: node scripts/test-sql-prava.mjs   (bez prohlížeče, pár ms)

   PROČ. Web mluví do Supabase s VEŘEJNÝM klíčem (anon), takže všechno,
   co je povolené roli `anon` nebo `authenticated`, si může zavolat
   kdokoli — stačí curl. Dvě věci tedy musí platit naráz:

     1. tabulky s osobními údaji chrání RLS (řádek vidí jen jeho
        majitel),
     2. funkce `security definer` — které RLS SCHVÁLNĚ obcházejí,
        protože běží pod vlastníkem — si samy ověří, kdo volá.

   Druhý bod je ten, na kterém se dá tiše uklouznout: funkce, která
   RLS obejde a nezkontroluje `auth.uid()`, je otevřené okno do cizích
   dat. Naměřeno 23. 10.: `security definer` funkcí je **64**, z toho
   19 definic nemá v těle `auth.uid()`. Vypadá to zle a není:
   `00-vse.sql` funkce v průběhu PŘEDEFINOVÁVÁ (soubor se skládá
   z dílčích SQL) a rozhoduje poslední podoba. Po započítání téhle
   věci zbyly tři — a všechny tři mají být veřejné (viz VYJIMKY).

   ČTE SE POSLEDNÍ DEFINICE. Kdo by porovnával všechny, dostane
   falešné poplachy na starších podobách, které v databázi nikdy
   nevzniknou: `delete_listing` má starší podobu bez kontroly a
   konečnou `delete from listings where id=p_id and user_id=auth.uid()`.
   ================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* VÝJIMKY: funkce, které veřejné být MAJÍ. U každé je napsané proč —
   mlčení by znamenalo, že se tudy dá protlačit i funkce, která veřejná
   být nemá. */
const VYJIMKY = {
  public_listings: 'vrací jen zveřejněné inzeráty, tedy to, co je stejně vidět na webu',
  subscribe_watch: 'přihlášení e-mailu k hlídání; samo nic neprozradí, potvrzuje se odkazem s tokenem (confirm_watch) a má strop na jeden e-mail',
  zapis_navstevu: 'zápis návštěvy do statistiky; nic nečte a nemá komu co vydat',
};

const SQL = readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8');

/* ---- 1) tabulky s osobními údaji mají RLS ------------------------ */
{
  const tabulky = [...SQL.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)([\s\S]*?);/gi)];
  const rls = new Set([...SQL.matchAll(/alter\s+table\s+(?:public\.)?([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)]
    .map((m) => m[1].toLowerCase()));
  const bez = tabulky.filter((m) => !rls.has(m[1].toLowerCase())).map((m) => m[1]);
  pravda(`je co měřit — tabulek je ${tabulky.length}`, tabulky.length >= 10, `jen ${tabulky.length}`);
  pravda('každá tabulka má zapnuté RLS', bez.length === 0, `bez RLS: ${bez.slice(0, 5).join(', ')}`);
  pravda('a je k nim aspoň jedna politika', /create\s+policy/i.test(SQL));
}

/* ---- 2) nic není povolené roli public ani přímo na tabulkách ----- */
{
  const naPublic = [...SQL.matchAll(/grant[^;]*\bto\s+public\b[^;]*;/gi)].map((m) => m[0].slice(0, 60));
  pravda('nic není povolené roli public', naPublic.length === 0, naPublic.slice(0, 2).join(' | '));
  const tabulkyAnon = [...SQL.matchAll(/grant\s+(?:select|insert|update|delete|all)[^;]*on\s+table[^;]*to\s+[^;]*\banon\b[^;]*;/gi)]
    .map((m) => m[0].replace(/\s+/g, ' ').slice(0, 70));
  pravda('a žádná tabulka není přímo přístupná veřejným klíčem (jen přes funkce)',
    tabulkyAnon.length === 0, tabulkyAnon.slice(0, 2).join(' | '));
}

/* ---- 3) definer funkce volatelné zvenčí si ověřují, kdo volá ----- */
{
  const posledni = new Map();
  for (const t of SQL.split(/(?=create\s+(?:or\s+replace\s+)?function\s)/i)) {
    const m = t.match(/^create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns/i);
    if (m) posednout(posledni, m[1].toLowerCase(), { telo: t, argumenty: m[2] });
  }
  function posednout(mapa, k, v) { mapa.set(k, v); }           // poslední vyhrává
  const role = (f) => {
    const r = new Set();
    const vzor = new RegExp('grant\\s+execute\\s+on\\s+function\\s+[^;]*\\b' + f + '\\s*\\([^;]*?to\\s+([a-z_,\\s]+);', 'gi');
    for (const m of SQL.matchAll(vzor)) for (const x of m[1].split(',')) r.add(x.trim());
    return r;
  };
  let definer = 0, verejnych = 0;
  const bezKontroly = [], mrtveVyjimky = new Set(Object.keys(VYJIMKY));
  for (const [f, { telo, argumenty }] of posledni) {
    if (!/security\s+definer/i.test(telo)) continue;
    definer++;
    const r = role(f);
    if (!(r.has('anon') || r.has('authenticated'))) continue;   // jen pro službu — RLS obchází po právu
    verejnych++;
    mrtveVyjimky.delete(f);
    if (/auth\.uid\(\)|auth\.jwt\(\)/.test(telo)) continue;      // ověří si volajícího
    /* Tajemství v argumentu je taky ověření: kdo zná token, ten na to
       má právo (odkaz z e-mailu, inzerát bez účtu). */
    if (/p_token|p_kod|p_secret|token\s+uuid/i.test(argumenty)) continue;
    if (VYJIMKY[f]) continue;
    bezKontroly.push(f);
  }
  pravda(`je co měřit — funkcí „security definer" je ${definer}`, definer >= 20, `jen ${definer}`);
  pravda(`a ${verejnych} z nich si může zavolat kdokoli s veřejným klíčem`, verejnych > 0);
  pravda('každá taková funkce si ověří, kdo volá (auth.uid, tajemství v argumentu, nebo napsaná výjimka)',
    bezKontroly.length === 0, `bez kontroly: ${bezKontroly.join(', ')}`);
  /* Výjimka, která přestala platit, je past: vypadá jako povolení pro
     funkci, která už neexistuje nebo už veřejná není. */
  pravda('a žádná napsaná výjimka není mrtvá',
    mrtveVyjimky.size === 0, `nepoužité: ${[...mrtveVyjimky].join(', ')}`);
}

/* ---- 4) veřejné úložiště fotek: strop, typy a vlastní složka ----- */
/* Úložiště je VEŘEJNÉ (fotka se musí ukázat v inzerátu), takže se
   nesmí stát odkladištěm: bez stropu na velikost a bez seznamu typů
   tam přihlášený uživatel uloží cokoli a jak velkého chce. A bez
   vazby cesty na `auth.uid()` může zakládat soubory v cizí složce,
   přitom právě podle složky se pozná, čí fotka to je. */
{
  const kos = (SQL.match(/insert\s+into\s+storage\.buckets[\s\S]*?;/i) || [''])[0];
  pravda('úložiště fotek se v SQL opravdu zakládá', /listing-photos/.test(kos),
    'insert do storage.buckets se nenašel — další tři kontroly by měřily prázdno');
  pravda('má strop na velikost souboru', /file_size_limit/.test(kos),
    'bez stropu se do veřejného úložiště vejde cokoli');
  pravda('a seznam povolených typů, a jsou v něm jen obrázky',
    /allowed_mime_types/.test(kos) && /image\//.test(kos) && !/(text|application)\//.test(kos),
    kos.replace(/\s+/g, ' ').slice(0, 120));
  /* Po `on conflict` se to musí nastavit i existujícímu úložišti —
     jinak by oprava platila jen pro čerstvý projekt a ten běžící by
     zůstal bez stropu. */
  pravda('a nastaví se i úložišti, které už existuje (on conflict)',
    /on\s+conflict[\s\S]*file_size_limit[\s\S]*allowed_mime_types/i.test(kos),
    'on conflict ta nastavení nepřepisuje');

  const nahravani = (SQL.match(/create\s+policy\s+"listing photos auth upload"[\s\S]*?;/i) || [''])[0];
  pravda('politika pro nahrávání existuje', nahravani.length > 0);
  pravda('a váže cestu na účet, který nahrává (vlastní složka)',
    /auth\.uid\(\)/.test(nahravani) && /foldername/.test(nahravani),
    nahravani.replace(/\s+/g, ' ').slice(0, 140));
  const mazani = (SQL.match(/create\s+policy\s+"listing photos owner delete"[\s\S]*?;/i) || [''])[0];
  pravda('a mazat smí jen vlastník nahraného souboru',
    /owner\s*=\s*auth\.uid\(\)/.test(mazani), mazani.replace(/\s+/g, ' ').slice(0, 120));
}

/* ---- 5) co smí kdokoli zavolat, nesmí růst bez konce ------------- */
/* subscribe_watch je volatelná veřejným klíčem (formulář běží
   z prohlížeče), takže je to jediná cesta, jak může cizí skript
   zvětšovat naši databázi. Dvě pojistky: strop na jeden e-mail
   a noční úklid nepotvrzených. */
{
  const prihlaska = (SQL.match(/create\s+or\s+replace\s+function\s+subscribe_watch[\s\S]*?\$\$;/i) || [''])[0];
  pravda('přihláška k hlídání se v SQL opravdu najde', prihlaska.length > 0);
  pravda('a má strop na počet přihlášek k jednomu e-mailu',
    /count\(\*\)[\s\S]*watch_subscriptions[\s\S]*raise exception/i.test(prihlaska),
    'bez stropu si jedna adresa nasbírá přihlášku na každý okres');
  const uklid = (SQL.match(/create\s+or\s+replace\s+function\s+uklid_hlidani[\s\S]*?\$\$;/i) || [''])[0];
  pravda('a nepotvrzené přihlášky má kdo uklidit', uklid.length > 0,
    'uklid_hlidani v SQL není');
  pravda('úklid maže JEN nepotvrzené (potvrzené a odhlášené zůstanou)',
    /confirmed\s*=\s*false/i.test(uklid) && !/confirmed\s*=\s*true/i.test(uklid),
    uklid.replace(/\s+/g, ' ').slice(0, 140));
  pravda('a pustit ho smí jen služba, ne veřejný klíč',
    /revoke all on function uklid_hlidani\(integer\) from public, anon, authenticated/i.test(SQL)
    && /grant execute on function uklid_hlidani\(integer\) to service_role/i.test(SQL));
}

/* ---- 6) co se zakládá na účet, to má strop --------------------- */
/* Tabulky s řádky „na účet" rostou tím, co lidé napíšou. Strop má
   `ulozeny_uloz` (500 řádků, 200 znaků na klíč) i `save_search` (20
   hledání), ale `poznamka_uloz` hlídal jen délku TEXTU — počet řádků
   ani délku klíče ne, takže kterýkoli registrovaný účet mohl psát bez
   konce. Čísla se čtou ze zdroje, aby se strop v SQL a strop
   v prohlížeči nerozešly. */
{
  const pozn = (SQL.match(/create\s+or\s+replace\s+function\s+poznamka_uloz[\s\S]*?\$\$;/i) || [''])[0];
  pravda('ukládání poznámky se v SQL najde', pozn.length > 0);
  const vPlus = /count\(\*\)[\s\S]*from poznamky[\s\S]*>=\s*(\d+)/i.exec(pozn);
  pravda('a má strop na počet poznámek na jeden účet', !!vPlus,
    'bez stropu si účet může psát řádky bez konce (databáze je na 500 MB)');
  const prohlizec = /var\s+STROP\s*=\s*(\d+)/.exec(readFileSync(path.join(KOREN, 'js', 'poznamky.js'), 'utf8'));
  pravda('a je to týž strop jako v prohlížeči',
    !!vPlus && !!prohlizec && vPlus[1] === prohlizec[1],
    `v SQL ${vPlus ? vPlus[1] : '(nic)'}, v js/poznamky.js ${prohlizec ? prohlizec[1] : '(nic)'}`);
  pravda('strop nebrání úpravě poznámky, která už existuje',
    /not exists[\s\S]*from poznamky[\s\S]*klic\s*=\s*p_klic/i.test(pozn),
    'u plného stropu by nešlo ani uklidit');
  const dKlic = /length\(trim\(coalesce\(p_klic[^)]*\)\)\)\s*>\s*(\d+)/i.exec(pozn);
  pravda('a klíč pozemku má strop na délku', !!dKlic,
    'sloupec je text bez stropu — tudy projde megabajt');
  const ulozene = readFileSync(path.join(KOREN, 'supabase', 'ulozene-na-uctu.sql'), 'utf8');
  const dUloz = /length\(k\)\s*>\s*(\d+)/.exec(ulozene);
  pravda('a je to týž strop jako u uložených pozemků',
    !!dKlic && !!dUloz && dKlic[1] === dUloz[1],
    `poznámky ${dKlic ? dKlic[1] : '(nic)'}, uložené ${dUloz ? dUloz[1] : '(nic)'}`);
}

console.log('\nPráva v databázi');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Práva v databázi: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
