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
import { readFileSync, readdirSync } from 'node:fs';
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

/* ---- 7) odběry upozornění: strop a tvar ------------------------- */
/* Řádek v push_odbery je jedinečný podle endpointu, takže bez stropu
   mohl kterýkoli přihlášený účet zakládat řádky bez konce — a bez
   kontroly tvaru tam šel uložit jakýkoli text, ne adresa push služby. */
{
  const push = (SQL.match(/create\s+or\s+replace\s+function\s+push_odber_uloz[\s\S]*?\$\$;/i) || [''])[0];
  pravda('ukládání odběru se v SQL najde', push.length > 0);
  pravda('a endpoint musí být https adresa', /\^https:\/\//.test(push),
    'co není adresa push služby, není odběr');
  pravda('a má strop na délku', /length\(p_endpoint\)\s*>\s*\d+/.test(push)
    && /length\(p_p256dh\)\s*>\s*\d+/.test(push) && /length\(p_auth\)\s*>\s*\d+/.test(push),
    'bez stropu na délku se sem dá uložit megabajt');
  pravda('a strop na počet zařízení na jeden účet',
    /count\(\*\)[\s\S]*from push_odbery[\s\S]*>=\s*\d+/i.test(push),
    'účet si může zakládat odběry bez konce');
  pravda('a přeuložení už známého zařízení strop nezdrží',
    /not exists[\s\S]*from push_odbery[\s\S]*endpoint\s*=\s*p_endpoint/i.test(push),
    'po přeinstalování prohlížeče by se klíče u plného stropu neuložily');

  /* A WEB O TOM MUSÍ UMĚT ŘÍCT. Strop, o kterém se mlčí, vypadá jako
     „nejde to a nevím proč": přepínač se vrátí zpátky a vedle stojí
     věta o povolení v prohlížeči, se kterou to nemá nic společného.
     Text výjimky je proto ve TŘECH kopiích — v SQL, v js/push.js (podle
     něj se ten případ pozná) a ve větě na hlidani.html. Tahle kontrola
     drží všechny tři u sebe. */
  const hlaska = (/raise exception '([^']*odběrů upozornění[^']*)'/.exec(push) || ['', ''])[1];
  pravda('hláška o plném stropu odběrů se v SQL najde', hlaska.length > 0,
    'bez ní se ten případ nedá od ostatních chyb poznat');
  const pushJs = readFileSync(path.join(KOREN, 'js', 'push.js'), 'utf8');
  /* Vzor se bere JAKÝKOLI, který se na tu zprávu ptá — ne jen ten
     správný. Kdyby se hledal rovnou se správným textem, zkouška by
     u rozešlého vzoru vypsala prázdno místo toho, co tam doopravdy je. */
  const vzor = (/\/([^/\n]+)\/i\.test\(zprava\)/.exec(pushJs) || ['', ''])[1];
  pravda('a js/push.js ten případ pozná podle téže hlášky',
    !!vzor && new RegExp(vzor, 'i').test(hlaska),
    `v SQL „${hlaska}", v js/push.js vzor „${vzor}"`);
  pravda('a vrací pro něj vlastní stav, ne obecnou chybu',
    /'plno'/.test(pushJs), "js/push.js nevrací 'plno' — stránka pak nemá podle čeho větu vybrat");
  const hlidani = readFileSync(path.join(KOREN, 'hlidani.html'), 'utf8');
  pravda('a stránka hlídání pro ten stav má větu',
    /stav === 'plno'/.test(hlidani) && /deseti zařízeních/.test(hlidani),
    'přepínač by se vrátil zpátky a nikdo by neřekl proč');
}

/* ---- 8) co zvenčí ROSTE, to má strop --------------------------- */
/* Rozdíl proti ostatním stropům: tyhle dvě funkce nepřepisují řádek,
   ale zakládají nový. Měření návštěvnosti zakládá řádek pro každou
   kombinaci (den, stránka, zdroj, zařízení) a oba texty jsou volné;
   hromadné nahrání uložených mělo `limit 500` na JEDNO volání, takže se
   strop 500 na účet obešel dvěma voláními. */
{
  const navsteva = (SQL.match(/create\s+or\s+replace\s+function\s+zapis_navstevu[\s\S]*?\$\$;/i) || [''])[0];
  pravda('měření návštěvnosti se v SQL najde', navsteva.length > 0);
  pravda('a má denní strop na počet řádků',
    /count\(\*\)[\s\S]*from navstevnost[\s\S]*current_date[\s\S]*>=\s*\d+/i.test(navsteva),
    'kdokoli anonymně vyrobí libovolně mnoho kombinací, tedy řádků');
  pravda('a sepnutý strop se pozná z dat, ne jen z kódu',
    /'\(strop\)'/.test(navsteva),
    'zahozená zobrazení by zmizela a čísla toho dne by tiše lhala');
  pravda('a strop nezahodí měření kombinace, která se dnes už počítala',
    /not exists[\s\S]*from navstevnost[\s\S]*stranka\s*=\s*s/i.test(navsteva),
    'nad stropem by se přestalo počítat i to, co se počítat má');

  const hromada = (SQL.match(/create\s+or\s+replace\s+function\s+ulozene_nahraj[\s\S]*?\$\$;/i) || [''])[0];
  const jeden = (SQL.match(/create\s+or\s+replace\s+function\s+ulozeny_uloz[\s\S]*?\$\$;/i) || [''])[0];
  const sJedne = /from ulozene where user_id = uid\)\s*>=\s*(\d+)/.exec(jeden);
  const sHromady = /greatest\(0,\s*(\d+)\s*-/.exec(hromada);
  pravda('hromadné nahrání uložených počítá volné místo do stropu', !!sHromady,
    '`limit 500` omezoval jedno volání, ne účet — dvěma voláními se strop obešel');
  pravda('a je to týž strop jako u jednotlivého ukládání',
    !!sJedne && !!sHromady && sJedne[1] === sHromady[1],
    `jednotlivě ${sJedne ? sJedne[1] : '(nic)'}, hromadně ${sHromady ? sHromady[1] : '(nic)'}`);
}

/* ---- 9) rada v repozitáři si nesmí odporovat s kódem ----------- */
/* Nalezeno 23. 10.: supabase/listings-auth.sql radil majiteli „pro
   hladký start klidně VYPNOUT Confirm email", kdežto create_listing
   (v balíku pozdější, tedy platná podoba) bez potvrzeného e-mailu
   zakládání odmítne. Kdo tu radu poslechl, zlomil hlavní funkci webu —
   a lidé čekali na e-mail, který nikdy nepřijde, protože potvrzování
   bylo vypnuté. Hlídá se obojí: že se potvrzení opravdu vyžaduje, a že
   to nikde v repozitáři neradíme vypnout. */
{
  const vyzaduje = /email_confirmed_at[\s\S]{0,80}is null[\s\S]{0,200}raise exception/i.test(SQL);
  pravda('zakládání inzerátu vyžaduje potvrzený e-mail', vyzaduje,
    'bez toho je potvrzování e-mailu jen doporučení');
  const soubory = [...readdirSync(path.join(KOREN, 'supabase')).filter((f) => f.endsWith('.sql'))
    .map((f) => ['supabase/' + f, readFileSync(path.join(KOREN, 'supabase', f), 'utf8')]),
    ...readdirSync(path.join(KOREN, 'docs')).filter((f) => f.endsWith('.md'))
      .map((f) => ['docs/' + f, readFileSync(path.join(KOREN, 'docs', f), 'utf8')])];
  /* Hledá se RADA to vypnout, ne zmínka o tom, že se vypnout dá: na
     větu, která sama vysvětluje, proč to nedělat, se nesmí padat. */
  /* Měří se PO ŘÁDCÍCH, ale výjimka se hledá i v řádku nad a pod.
     Jinak na kontrolu padne vlastní dokumentace: oddíl 124
     v docs/optimalizace.md tu starou radu CITUJE a vysvětlení, proč
     neplatí, leží o řádek dál. Stalo se mi to dvakrát za sebou —
     nejdřív v docs/oprava-hlidani-a-pridavani.md, pak v tom oddílu. */
  const VYJIMKA = /STÁLO TU|stála tu|zestárl|past|opraven|nesmí|neplatí|musí být ZAPNUT|neradíme|rozbije/i;
  const radi = [];
  for (const [jm, text] of soubory) {
    const radky = text.split('\n');
    for (let i = 0; i < radky.length; i++) {
      const v = radky[i];
      if (!/vypnout|vypněte|= ?OFF/i.test(v)) continue;
      if (!/confirm email|potvrzování e-mailu|potvrzení e-mailu/i.test(v)) continue;
      const okno = [radky[i - 1] || '', v, radky[i + 1] || ''].join(' ');
      if (VYJIMKA.test(okno)) continue;
      radi.push(`${jm}: „${v.replace(/\s+/g, ' ').trim().slice(0, 110)}"`);
    }
  }
  pravda('a nikde v repozitáři se neradí potvrzování vypnout', radi.length === 0,
    radi.join('\n      ') + ' — kdo to udělá, zlomí zakládání inzerátů');
  const seznam = readFileSync(path.join(KOREN, 'docs', 'pred-vydanim.md'), 'utf8');
  pravda('a seznam před vydáním to nastavení jmenuje',
    /Confirm email/i.test(seznam) && /ZAPNUT/i.test(seznam),
    'nastavení, bez kterého nejde inzerovat, v seznamu chybělo');

  /* Druhé nastavení téhož druhu: kam smí vést odkaz z e-mailu. Odkaz na
     obnovu hesla nese jednorázový token; web posílá v redirect_to svou
     adresu, ale rozhoduje seznam v Supabase. Dokud je v něm `*`, může
     kdokoli vyrobit odkaz, který přistane s tokenem na cizí stránce.
     Z repozitáře to nejde ani nastavit, ani změřit — jde jen zajistit,
     že to v seznamu před vydáním stojí. */
  pravda('a jmenuje i seznam adres, kam smí vést odkazy z e-mailu',
    /Redirect URLs/i.test(seznam) && /Site URL/i.test(seznam) && /nikdy `\*`/i.test(seznam),
    'bez omezení adres může odkaz na obnovu hesla přistát s tokenem na cizí stránce');
  pravda('a web v odkazu posílá vlastní adresu',
    /redirect_to/.test(readFileSync(path.join(KOREN, 'js', 'auth.js'), 'utf8')),
    'bez redirect_to by odkaz vedl tam, kam určí Supabase');
}

console.log('\nPráva v databázi');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Práva v databázi: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
