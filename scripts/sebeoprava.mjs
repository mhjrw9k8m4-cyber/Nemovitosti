#!/usr/bin/env node
/* SEBEOPRAVA — CO UMÍ STROJ SPOČÍTAT ZE ZDROJE, AŤ SI TAKY SPRAVÍ.
   ==================================================================
   Spuštění:
     node scripts/sebeoprava.mjs            rozhodne a případně opraví
     node scripts/sebeoprava.mjs --nasucho  rozhodne a NIC nenahraje

   PROČ. Nejčastější červená kontrola v tomhle repozitáři není vada
   webu, ale rozchod: někdo zasáhne do zdroje a zapomene pustit
   `node scripts/oprav.mjs`, takže odvozené soubory (stránky, razítka
   ?v=, hashe CSP, sitemap, sloučené SQL, tabulka v roadmapě) nesedí se
   zdrojem. Jen za dnešek se to stalo dvakrát. Oprava je přitom jediný
   příkaz a jeho výsledek je DANÝ — není co hádat.

   SEDM PRAVIDEL, A ANI JEDNO NENÍ NAVÍC. Automat, který smí commitovat,
   je nebezpečný přesně tak, jak jsou slabá jeho pravidla:

     1. OPRAVUJE SE JEN TO, CO JDE SPOČÍTAT ZE ZDROJE. Výsledek je
        výstup generátorů, ne můj odhad. Co generátory nespraví, se
        nespravuje vůbec — hlásí se.
     2. KAŽDÁ OPRAVA SE DOKAZUJE, NEŽ SE NAHRAJE. Po opravě musí projít
        celá rychlá sada (scripts/zkousky.mjs). Když neprojde, oprava
        se ZAHODÍ a místo ní jde hlášení. Opravit a doufat není oprava.
     3. NIKDY DVAKRÁT ZA SEBOU. Je-li poslední commit sám sebeoprava,
        tenhle běh nedělá nic. Jedna oprava na jeden lidský commit —
        tím je smyčka vyloučená, ne „nepravděpodobná".
     4. NIKDY NA RUČNÍ PRÁCI. Smí se změnit jen to, co patří
        generátorům (seznam níž). Kdyby oprava sahala na js/, scripts/,
        workflow nebo prózu v docs/, je to nález na generátorech a ne
        důvod k commitu.
     5. JEN NA DOMÁCÍ VĚTVI. Jméno větve se bere z prostředí, ne
        z kódu; cizí větev ani pull request se neopravuje.
     6. VYPÍNAČ JE VŽDY K DISPOZICI. Soubor .github/SEBEOPRAVA-VYPNUTA
        v repozitáři zastaví všechno bez debaty a bez hledání v kódu.
     8. NIKDY SAMA V SOBĚ. Automat při dokazování pouští celou rychlou
        sadu — a v té sadě je zkouška, která pro svou práci pouští
        AUTOMAT (měří, že na cizí větvi nic neudělá). Dokud se sada
        pouštěla až po generátorech, zastavilo vnitřní běh pravidlo
        o čistém stromu; jakmile se přidalo měření PŘED opravou (nad
        čistým stromem), ta pojistka padla a automat se začal pouštět
        sám v sobě — naměřeno 39 běhů naráz. Proto značka v prostředí:
        každý podřízený proces ji dostane a automat s ní nic nedělá.
     7. ŽÁDNÁ TAJNÁ OPRAVA. Co se opravilo, stojí v commitu se značkou
        „[sebeoprava]" a s výčtem souborů. Co se neopravilo a proč, se
        vypíše jako `::warning::` — i když to skončí úspěchem.

   CO SE TU VĚDOMĚ NEDĚLÁ: automatické vracení (revert) cizího commitu.
   Vrátit commit znamená rozhodnout, že je špatný celý — a to je soud,
   ne výpočet. Robotův datový commit, který rozsvítí červenou, bývá
   v devíti z deseti případů právě ten rozchod odvozených souborů,
   a ten tahle oprava spraví bez mazání čehokoli.
   ================================================================== */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sklon } from './text.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ZNACKA = '[sebeoprava]';
/* ZNAČKA „BĚŽÍM UVNITŘ SEBE". Nese se prostředím do všech podřízených
   procesů (generátory i obě měření sadou). Jediný její úkol je, aby
   automat, kterého si zkouška v sadě pustí, poznal, že je uvnitř
   jiného běhu — a nedělal nic. Bez ní se automat pouští sám v sobě
   a roste exponenciálně. */
export const UVNITR = 'SEBEOPRAVA_UVNITR';
export const VYPINAC = '.github/SEBEOPRAVA-VYPNUTA';

/* KOMU PATŘÍ KTERÝ SOUBOR. Vlevo to, co generátory v řetězu
   scripts/oprav.mjs doopravdy zapisují; všechno ostatní je ruční práce
   a automat na to nesmí. Seznam je psaný ručně schválně: je to to
   JEDINÉ místo, kde se rozhoduje, co smí automat přepsat, a takové
   místo má být k přečtení na pěti řádcích. */
export const PATRI_GENERATORUM = [
  /^[\w-]+\.html$/,                 // stránky v kořeni (generované i sjednocované)
  /^data\//,                        // data a jejich řezy
  /^css\/[\w.-]+\.min\.css$/,       // očištěné stylopisy
  /^js\/min\//,                     // očištěné kopie skriptů
  /^sitemap\.xml$/, /^robots\.txt$/,
  /* KANÁLY SE JMENUJÍ `novinky-*`, ne `rss*`. Dřív tu stál vzor
     `rss[\w-]*\.xml`, který v tomhle repozitáři nesedí ANI NA JEDEN
     soubor — a patnáct kanálů, které generátory přepisují při každé
     změně dat, tím automat opravit NESMĚL. Ručně psaná hranice se
     rozešla s tím, co generátory píšou, a nikomu to nesvítilo: vzor
     tam byl, takže to vypadalo pokryté. Od té doby to měří
     scripts/sebeoprava-pokryti.mjs. */
  /^novinky[\w-]*\.xml$/,   // celostátní (novinky.xml) i krajské (novinky-praha.xml)
  /^docs\/roadmap\.md$/,            // tabulka stavu (přepočítaná čísla)
  /^supabase\/00-vse\.sql$/,        // sloučený balík
];
export function patriGeneratorum(soubor) {
  return PATRI_GENERATORUM.some((v) => v.test(soubor));
}

/* ZPRÁVA DO COMMITU. Je to jediná věta, kterou po sebeopravě někdo
   přečte, takže se v ní POČÍTÁ i skloňování: první oprava v CI hlásila
   „Rozcházelo se 1 souborů", a to je přesně ten druh chyby, který
   tenhle repozitář hlídá zkouškou jinde (generátor stránek krajů ji
   měl taky). Pravidlo je proto sdílené, v scripts/text.mjs. */
export function zpravaOprav(zmenene) {
  const n = (zmenene || []).length;
  const vypis = n <= 6 ? (zmenene || []).join(', ')
    : `${zmenene.slice(0, 5).join(', ')} a ${sklon(n - 5, 'další', 'další', 'dalších')} ${n - 5}`;
  const rozchazel = sklon(n, 'Rozcházel', 'Rozcházely', 'Rozcházelo');
  const soubor = sklon(n, 'soubor', 'soubory', 'souborů');
  return `${ZNACKA} dorovnat odvozené soubory se zdrojem\n\n`
    + `${rozchazel} se ${n} ${soubor}: ${vypis}.\n`
    + 'Opravu udělal řetěz generátorů (node scripts/oprav.mjs), nic se nehádalo,'
    + ' a před nahráním prošla celá rychlá sada.\n';
}

/* KTERÉ ZKOUŠKY PADLY — vyčteno z výpisu běžce sady. Na tom stojí celý
   rozdíl mezi „moje oprava to rozbila" a „bylo to rozbité už předtím",
   takže to NESMÍ být schované uvnitř běhu: kdyby běžec změnil znění
   svého souhrnu, parser by tiše vracel prázdno a automat by o ten
   rozdíl přišel, aniž by cokoli spadlo. Je to tedy vyvedené ven a
   změřené — i proti SKUTEČNÉMU znění, které běžec tiskne
   (scripts/test-sebeoprava.mjs). */
export function padleZkousky(vypis) {
  const m = String(vypis || '').match(/padlo \d+ z \d+ — ([^\n]+)/);
  return m ? m[1].split(',').map((t) => t.trim()).filter(Boolean) : [];
}

/* ROZHODNUTÍ ODDĚLENÉ OD VYKONÁNÍ. Takhle se dá každé pravidlo
   vyzkoušet bez gitu, bez sítě a bez CI — a zkouška pak nemusí věřit
   tomu, že „se to asi zachová správně". */
export function rozhodni(stav) {
  const s = stav || {};
  /* PRVNÍ ZE VŠECH pravidel: uvnitř jiného běhu se nedělá nic. Musí být
     první, protože všechna ostatní pravidla mohou projít — a pak už by
     se pustily generátory a sada, tedy právě to, co smyčku žene. */
  if (s.uvnitr) {
    return { opravit: false, duvod: `sebeoprava už běží výš v řetězu (${UVNITR}) — podřízený běh se nedělá` };
  }
  if (!s.povolenaVetev) return { opravit: false, duvod: 'není řečeno, která větev je domácí (SEBEOPRAVA_VETEV)' };
  if (s.vetev !== s.povolenaVetev) {
    return { opravit: false, duvod: `větev „${s.vetev}" není domácí „${s.povolenaVetev}"` };
  }
  if (s.vypinac) return { opravit: false, duvod: `vypínač ${VYPINAC} je v repozitáři` };
  if ((s.zpravaHEAD || '').includes(ZNACKA)) {
    return { opravit: false, duvod: 'poslední commit je sám sebeoprava — druhá v řadě se nedělá' };
  }
  const zmenene = s.zmenene || [];
  if (!zmenene.length) {
    return { opravit: false, duvod: 'generátory nic nezměnily, takže vada není v odvozených souborech' };
  }
  const cizi = zmenene.filter((f) => !patriGeneratorum(f));
  if (cizi.length) {
    return { opravit: false,
      duvod: `oprava by sahala na ruční práci (${cizi.slice(0, 5).join(', ')})`
        + ' — to je nález na generátorech, ne důvod k commitu' };
  }
  return { opravit: true, duvod: `${zmenene.length} odvozených souborů nesedí se zdrojem` };
}

/* ---------------- výkonná část ------------------------------------ */
if (import.meta.url === `file://${process.argv[1]}`) {
  const nasucho = process.argv.includes('--nasucho');
  const git = (...a) => {
    const r = spawnSync('git', ['-C', KOREN, ...a], { encoding: 'utf8' });
    return String(r.stdout || '').trim();
  };
  /* STAV SE NESMÍ TRIMOVAT. `git status --porcelain` začíná každý řádek
     dvěma znaky stavu a mezerou — u neindexované změny je první znak
     MEZERA (" M data.html"). Trim celého výstupu ji u PRVNÍHO řádku
     sežere, a kdo pak odřízne tři znaky, dostane „ata.html". Naměřeno
     na vlastním běhu: pravidlo, které rozhoduje, na co automat smí,
     by porovnávalo zmrzačené jméno. */
  const zmeneneSoubory = () => {
    const r = spawnSync('git', ['-C', KOREN, 'status', '--porcelain'], { encoding: 'utf8' });
    return String(r.stdout || '').split('\n').filter(Boolean)
      .map((radek) => radek.slice(3))
      .map((cesta) => cesta.replace(/^.* -> /, ''))   // přejmenování
      .map((cesta) => cesta.replace(/^"|"$/g, ''))    // jméno s mezerou
      .filter(Boolean);
  };
  const hlas = (t) => console.log(t);
  const vzdat = (duvod) => {
    hlas(`::warning::Sebeoprava neopravuje: ${duvod}`);
    hlas('\nSEBEOPRAVA: nic se nezměnilo. ' + duvod);
    process.exit(0);
  };

  const vetev = process.env.SEBEOPRAVA_VETEV_AKTUALNI || git('rev-parse', '--abbrev-ref', 'HEAD');
  const povolena = process.env.SEBEOPRAVA_VETEV || '';
  const zpravaHEAD = git('log', '-1', '--pretty=%s%n%b');
  const vypinac = existsSync(path.join(KOREN, VYPINAC));
  const uvnitr = !!process.env[UVNITR];
  /* Prostředí pro VŠECHNY podřízené procesy: značka, že výš v řetězu
     už jeden automat běží. */
  const prostrediDeti = { ...process.env, [UVNITR]: '1' };

  /* Dřív než se pustí generátory: pravidla, která o nich nic nepotřebují. */
  const predem = rozhodni({ vetev, povolenaVetev: povolena, vypinac, uvnitr, zpravaHEAD, zmenene: ['x.html'] });
  if (!predem.opravit) vzdat(predem.duvod);

  /* Strom musí být čistý, jinak by se do opravy přibalilo cizí. */
  if (git('status', '--porcelain')) vzdat('pracovní strom není čistý, do opravy by se přibalilo cizí');

  /* MĚŘENÍ PŘED OPRAVOU. Bez něj umí automat říct jen „po opravě
     neprošla rychlá sada", což zní jako „oprava je vadná" — a dvakrát
     to tak znělo, i když padalo něco, co s opravou nemělo nic
     společného (chybějící závislosti v prostředí). Dvě měření stojí
     dvě minuty a dávají diagnózu místo dojmu. */
  hlas('Měřím, co padá PŘED opravou…');
  const pred = spawnSync('node', [path.join(KOREN, 'scripts', 'zkousky.mjs')],
    { cwd: KOREN, encoding: 'utf8', env: prostrediDeti });
  const padlePred = pred.status === 0 ? [] : padleZkousky(pred.stdout);
  if (pred.status === 0) hlas('  před opravou je sada zelená.');
  else hlas(`  už před opravou padá ${padlePred.length || '?'}: ${padlePred.join(', ') || '(nepodařilo se vyčíst)'}`);

  hlas('Pouštím generátory (node scripts/oprav.mjs)…');
  const o = spawnSync('node', [path.join(KOREN, 'scripts', 'oprav.mjs')],
    { cwd: KOREN, encoding: 'utf8', env: prostrediDeti });
  if (o.status !== 0) {
    hlas((o.stdout || '').split('\n').slice(-12).join('\n'));
    vzdat('generátory samy spadly — tohle není rozchod, ale vada v nich');
  }

  const zmenene = zmeneneSoubory();
  const rozhodnuti = rozhodni({ vetev, povolenaVetev: povolena, vypinac, uvnitr, zpravaHEAD, zmenene });
  if (!rozhodnuti.opravit) {
    git('checkout', '--', '.');
    git('clean', '-fd');
    vzdat(rozhodnuti.duvod);
  }
  hlas(`Rozchod: ${rozhodnuti.duvod}.`);

  /* PRAVIDLO 2: dokázat, než nahraju. */
  hlas('Dokazuju opravu celou rychlou sadou…');
  const z = spawnSync('node', [path.join(KOREN, 'scripts', 'zkousky.mjs')],
    { cwd: KOREN, encoding: 'utf8', env: prostrediDeti });
  if (z.status !== 0) {
    hlas((z.stdout || '').split('\n').slice(-20).join('\n'));
    const padlePo = padleZkousky(z.stdout);
    const nove = padlePo.filter((t) => !padlePred.includes(t));
    git('checkout', '--', '.');
    git('clean', '-fd');
    /* Dvě VELMI různé situace, a každá chce jiné slovo: */
    if (nove.length) {
      vzdat(`oprava sama rozbila ${nove.length}: ${nove.join(', ')}`
        + ' — to není rozchod odvozených souborů, ale vada v generátorech;'
        + ' oprava šla do koše');
    }
    vzdat(`po opravě padá ${padlePo.length}: ${padlePo.join(', ')}, ale TOTÉŽ padalo`
      + ' i PŘED opravou — oprava tedy nic nerozbila, červenou dělá něco jiného.'
      + ' Podle pravidla 2 se přesto nenahrává: nahrát lze jen dokázanou opravu.');
  }
  hlas((z.stdout || '').split('\n').filter((r) => /Rychlá sada:/.test(r)).join('\n'));

  let zprava = zpravaOprav(zmenene);
  if (padlePred.length) {
    /* Stalo se, že sada byla červená PŘED opravou a po ní zelená: pak
       oprava spravila i to. Je to užitečná informace do historie, a
       taky pojistka proti dojmu, že se „nic nedělo". */
    zprava += `\nPřed opravou padalo ${padlePred.length} zkoušek`
      + ` (${padlePred.slice(0, 5).join(', ')}); po ní je sada zelená.\n`;
    hlas(`Oprava spravila i to, co padalo před ní: ${padlePred.join(', ')}`);
  }

  if (nasucho) {
    hlas('\n--nasucho: nic se nenahrává. Zpráva by byla:\n' + zprava);
    git('checkout', '--', '.');
    git('clean', '-fd');
    process.exit(0);
  }

  git('config', 'user.name', 'parcelka-bot');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  git('add', '-A');
  const c = spawnSync('git', ['-C', KOREN, 'commit', '-m', zprava], { encoding: 'utf8' });
  if (c.status !== 0) vzdat('commit se nepovedl: ' + String(c.stdout || c.stderr).slice(0, 120));
  const p = spawnSync('git', ['-C', KOREN, 'push', 'origin', `HEAD:${povolena}`], { encoding: 'utf8' });
  if (p.status !== 0) {
    hlas(`::warning::Sebeoprava: oprava je hotová a dokázaná, ale push selhal — ${String(p.stderr || '').slice(0, 160)}`);
    process.exit(0);
  }
  hlas(`\nSEBEOPRAVA: opraveno a nahráno (${zmenene.length} souborů). Rychlá sada prošla.`);
}
