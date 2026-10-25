#!/usr/bin/env node
/* CVIČENÍ SEBEOPRAVY — rozbít to naschvál a koukat, jestli to spraví
   ==================================================================
   Spuštění:
     node scripts/cviceni-sebeopravy.mjs            celé cvičení
     node scripts/cviceni-sebeopravy.mjs --rychle   jen to, co nepouští
                                                    generátory (sekundy)

   PROČ TO NENÍ ZKOUŠKA, ALE CVIČENÍ. `scripts/test-sebeoprava.mjs`
   hlídá PRAVIDLA sebeopravy: že se nepustí na cizí větvi, že nesahá na
   ruční práci, že se nedělá dvakrát za sebou. Co nehlídá nikdo, je
   jediná otázka, na které záleží: KDYŽ SE TO ROZBIJE, SPRAVÍ TO?

   Na to se pravidla přečíst nedají. Jediný způsob je rozbít odvozené
   soubory naschvál a nechat celý automat doopravdy proběhnout —
   generátory, důkaz rychlou sadou, commit i push. Proto cvičení:
   dělá se nad JEDNORÁZOVOU KOPIÍ repozitáře a nad vlastním prázdným
   „serverem", takže se při něm nemůže nic stát opravdovému repozitáři.
   (Push míří do bare klonu v adresáři cvičení. Kdyby mířil na origin,
   první cvičení by přepsalo ostrou větev — proto se origin přesměruje,
   ne „zakáže".)

   PĚT CVIČENÍ:
     A) rozchod ve čtyřech odvozených souborech → MUSÍ se spravit,
        každý soubor musí být zpátky bit po bitu, commit musí nést
        značku a push musí dojít,
     B) vypínač v repozitáři → NESMÍ se stát nic,
     C) poslední commit je sám sebeoprava → NESMÍ se stát nic
        (pojistka proti smyčce),
     D) cizí větev → NESMÍ se stát nic,
     E) rozchod v RUČNÍM souboru → NESMÍ se stát nic, a musí to říct
        (to je nález na generátorech, ne práce pro automat).

   Cvičení A pustí generátory i celou rychlou sadu, takže trvá minuty.
   Ostatní čtyři jsou v sekundách — proto `--rychle`.
   ================================================================== */
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ZNACKA, VYPINAC } from './sebeoprava.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RYCHLE = process.argv.includes('--rychle');

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const md5 = (f) => (existsSync(f) ? createHash('md5').update(readFileSync(f)).digest('hex') : '(není)');

/* ---- jednorázová kopie repozitáře ------------------------------- */
const adr = mkdtempSync(path.join(tmpdir(), 'cviceni-sebeopravy-'));
const SERVER = path.join(adr, 'server.git');   // kam automat pushuje
const PRACE = path.join(adr, 'prace');         // kde automat pracuje
process.on('exit', () => { try { rmSync(adr, { recursive: true, force: true }); } catch (e) { /* nic */ } });

function spust(prikaz, args, kde, prostredi = {}) {
  const r = spawnSync(prikaz, args, {
    cwd: kde, encoding: 'utf8', timeout: 1800000,
    env: { ...process.env, ...prostredi },
  });
  return { kod: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}
const git = (args, kde = PRACE) => spust('git', args, kde);

/* JMÉNO VĚTVE MUSÍ BÝT JMÉNO. V odpojeném checkoutu (což je v CI
   běžný stav) vrátí `rev-parse --abbrev-ref HEAD` doslova „HEAD" — a
   cvičení by pak celé běželo nad větví, která neexistuje, a tvářilo se,
   že něco měří. Proto se to kontroluje, ne předpokládá. */
const vetev = (process.env.CVICENI_VETEV || '').trim()
  || spust('git', ['rev-parse', '--abbrev-ref', 'HEAD'], KOREN).out.trim();
if (!vetev || vetev === 'HEAD') {
  console.log('::error::Cvičení sebeopravy: nepoznám jméno větve'
    + ` (dostal jsem „${vetev}"). V odpojeném checkoutu je potřeba CVICENI_VETEV.`);
  process.exit(1);
}
{
  const k1 = spust('git', ['clone', '--bare', '--quiet', KOREN, SERVER], adr);
  const k2 = spust('git', ['clone', '--quiet', SERVER, PRACE], adr);
  pravda(`kopie repozitáře i prázdný server se postavily (větev ${vetev})`,
    k1.kod === 0 && k2.kod === 0 && existsSync(path.join(PRACE, 'scripts', 'sebeoprava.mjs')),
    `klon bare: ${k1.kod} ${k1.out.slice(0, 120)}; klon práce: ${k2.kod} ${k2.out.slice(0, 120)}`);
  /* Závislosti se neinstalují znovu — jen se půjčí. `npm ci` v kopii by
     cvičení prodloužilo o minuty a nic by neověřilo: cvičí se
     sebeoprava, ne instalace balíčků. */
  try { symlinkSync(path.join(KOREN, 'node_modules'), path.join(PRACE, 'node_modules')); } catch (e) { /* už je */ }
  /* A GIT O NICH NESMÍ VĚDĚT. Dvě hodiny mě stálo tohle: bez téhle
     řádky viděl `git status` neznámé `node_modules`, takže automat
     správně odmítl pracovat se špinavým stromem — a `git clean -fd`
     mezi cvičeními ten odkaz SMAZAL. Suita pak běžela bez závislostí a
     padala na zkoušce, která jednu potřebuje. Cvičení tím ukazovalo
     vadu automatu, která nebyla jeho. */
  writeFileSync(path.join(PRACE, '.git', 'info', 'exclude'), 'node_modules\n');
  git(['config', 'user.name', 'cviceni']);
  git(['config', 'user.email', 'cviceni@example.invalid']);
}

/* ROZBITÍ, KTERÉ NIC NEROZBILO, JE NÁLEZ — ne drobnost. Napoprvé
   tahle past sklapla hned: vzor na číslo v roadmapě nesedl na formát
   tabulky, soubor se nezměnil, commit byl prázdný a cvičení C pak
   měřilo úplně jiný stav, než si myslelo (a vypadalo jako vada
   automatu). Od té doby se každé rozbití ověřuje. */
function zmen(soubor, uprav) {
  const c = path.join(PRACE, soubor);
  const pred = readFileSync(c, 'utf8');
  const po = uprav(pred);
  if (po === pred) {
    chyb++;
    zpravy.push(`  ✕ rozbití souboru ${soubor} nic nezměnilo`
      + '\n      vzor rozbití přestal sedět na obsah — cvičení by měřilo prázdno');
    return false;
  }
  writeFileSync(c, po);
  return true;
}

/* VÝCHOZÍ BOD SE PAMATUJE, ne dohledává. `origin/<větev>` k tomu
   použít NELZE: cvičení A nechá automat doopravdy pushnout, takže se
   origin posune — a další cvičení by pak startovala z commitu
   sebeopravy a narazila na pravidlo „nikdy dvakrát za sebou" místo na
   to, co měla zkoušet. (Naměřeno: cvičení E tak hlásilo úplně jiný
   důvod, než čekalo.) Vrací se i server, aby byl každý start stejný. */
const ZAKLAD = spust('git', ['rev-parse', 'HEAD'], PRACE).out.trim();
function uklid() {
  git(['reset', '--hard', '--quiet', ZAKLAD]);
  git(['clean', '-qfd']);
  spust('git', ['update-ref', `refs/heads/${vetev}`, ZAKLAD], SERVER);
  git(['fetch', '--quiet', 'origin']);
}
function pustAutomat(prostredi = {}) {
  return spust('node', [path.join(PRACE, 'scripts', 'sebeoprava.mjs')], PRACE, {
    SEBEOPRAVA_VETEV: vetev, SEBEOPRAVA_VETEV_AKTUALNI: vetev, ...prostredi,
  });
}
const hlavaZprava = () => git(['log', '-1', '--pretty=%s']).out.trim();
const hlavaSha = (kde = PRACE) => git(['rev-parse', 'HEAD'], kde).out.trim();

/* ---- A) rozchod v odvozených souborech MUSÍ zmizet --------------- */
/* Čtyři různé druhy rozchodu naráz, ať se neověřuje jen jeden. Každý
   je přesně ten, který v tomhle repozitáři opravdu nastal: přepsané
   číslo v roadmapě, zkomolené razítko ?v=, osekaná mapa webu a
   zmrzačený očištěný stylopis. */
const ROZCHOD_ROADMAPY = (t) => t.replace(/(\| Zkoušky \| )(\d[\d\u00a0\u202f ]*)( souborů)/, '$11$3');
const CILE = [
  ['docs/roadmap.md', ROZCHOD_ROADMAPY],
  ['index.html', (t) => t.replace(/\?v=[0-9a-f]{8}/, '?v=deadbeef')],
  ['sitemap.xml', (t) => t.replace(/<url>[\s\S]*?<\/url>/, '')],
  ['css/styles.min.css', (t) => t.slice(0, Math.floor(t.length / 2))],
];
if (!RYCHLE) {
  uklid();
  const pred = new Map(CILE.map(([f]) => [f, md5(path.join(PRACE, f))]));
  const rozbito = CILE.filter(([f, rozbij]) => zmen(f, rozbij)).length;
  pravda('A) rozbily se všechny čtyři odvozené soubory', rozbito === CILE.length,
    `rozbilo se jen ${rozbito} ze ${CILE.length}`);
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'ruční commit, který zapomněl pustit generátory']);
  const shaPred = hlavaSha();
  pravda('A) a je z toho opravdu commit, ne prázdný strom',
    git(['status', '--porcelain']).out.trim() === '' && hlavaZprava().includes('zapomněl'),
    `HEAD: „${hlavaZprava()}"; strom: ${git(['status', '--porcelain']).out.slice(0, 80)}`);

  const v = pustAutomat();
  pravda('A) automat skončil úspěchem', v.kod === 0, `kód ${v.kod}; ${v.out.slice(-400)}`);
  /* VÝPIS AUTOMATU SE VŽDYCKY PŘILOŽÍ. Bez něj se u padlého cvičení
     nedá zjistit, na čem automat skončil — a celé cvičení pak končí
     tím, že se hádá. (Naměřeno hned při prvním ostrém běhu.) */
  let vypisAutomatu = v.out.split('\n').filter((r) => r.trim()).slice(-8).join('\n      ');
  /* KDYŽ AUTOMAT ZAHODIL OPRAVU KVŮLI PADLÉ ZKOUŠCE, cvičení tu zkoušku
     pustí JEŠTĚ JEDNOU, samu, a přiloží celý její výpis. Bez toho zbyde
     jen jméno souboru a dvě hodiny hádání, jestli je vadná oprava, nebo
     prostředí — naměřeno na vlastní kůži. */
  const padle = (v.out.match(/padlo \d+ z \d+ — ([^\n]+)/) || [])[1];
  if (padle) {
    const prvni = padle.split(',')[0].trim();
    const znovu = spust('node', [path.join(PRACE, 'scripts', prvni)], PRACE);
    vypisAutomatu += `\n      \n      ${prvni} puštěná SAMA v téže kopii: kód ${znovu.kod}\n      `
      + znovu.out.split('\n').filter((r) => r.trim()).slice(-10).join('\n      ');
  }
  const rozdily = CILE.filter(([f]) => md5(path.join(PRACE, f)) !== pred.get(f));
  pravda('A) všechny čtyři soubory jsou zpátky bit po bitu', rozdily.length === 0,
    'nesedí: ' + rozdily.map(([f]) => f).join(', ') + '\n      automat řekl:\n      ' + vypisAutomatu);
  pravda('A) vznikl nový commit se značkou sebeopravy',
    hlavaSha() !== shaPred && hlavaZprava().includes(ZNACKA),
    `HEAD: „${hlavaZprava()}"`);
  pravda('A) a je nahraný na serveru (push došel)',
    hlavaSha() === spust('git', ['rev-parse', vetev], SERVER).out.trim(),
    `v kopii ${hlavaSha().slice(0, 8)}, na serveru ${spust('git', ['rev-parse', vetev], SERVER).out.trim().slice(0, 8)}`);
  pravda('A) a v commitu stojí, co se rozcházelo',
    /Rozcház/.test(git(['log', '-1', '--pretty=%b']).out),
    git(['log', '-1', '--pretty=%b']).out.slice(0, 200));
}

/* ---- B-E) stavy, ve kterých se NESMÍ stát nic -------------------- */
const NESMI = [
  ['B) vypínač v repozitáři', () => {
    writeFileSync(path.join(PRACE, VYPINAC), 'ticho\n');
    git(['add', '-A']); git(['commit', '-q', '-m', 'vypínám sebeopravu']);
    return existsSync(path.join(PRACE, VYPINAC));
  }, {}, VYPINAC],
  ['C) poslední commit je sám sebeoprava', () => {
    if (!zmen('docs/roadmap.md', ROZCHOD_ROADMAPY)) return false;
    git(['add', '-A']); git(['commit', '-q', '-m', `${ZNACKA} dorovnat odvozené soubory se zdrojem`]);
    return hlavaZprava().includes(ZNACKA);
  }, {}, 'druhá v řadě'],
  ['D) cizí větev', () => {
    if (!zmen('docs/roadmap.md', ROZCHOD_ROADMAPY)) return false;
    git(['add', '-A']); git(['commit', '-q', '-m', 'ruční commit']);
    return hlavaZprava().includes('ruční commit');
  }, { SEBEOPRAVA_VETEV_AKTUALNI: 'cizi-vetev' }, 'není domácí'],
  ['E) špinavý strom (do opravy by se přibalilo cizí)', () => {
    if (!zmen('js/main.js', (t) => t + '\n/* neuklizená ruční práce */\n')) return false;
    return git(['status', '--porcelain']).out.includes('js/main.js');
  }, {}, 'není čistý'],
];
for (const [popis, rozbij, prostredi, uryvek] of NESMI) {
  uklid();
  const nastaveno = rozbij();
  pravda(`${popis} → stav se opravdu nastavil`, nastaveno === true,
    'nastavení se nepovedlo, takže cvičení by měřilo něco jiného, než si myslí');
  if (!nastaveno) continue;
  const shaPred = hlavaSha();
  const serverPred = spust('git', ['rev-parse', vetev], SERVER).out.trim();
  const v = pustAutomat(prostredi);
  pravda(`${popis} → nic se nestalo a řekne se proč`,
    v.kod === 0 && hlavaSha() === shaPred && v.out.includes(uryvek)
      && spust('git', ['rev-parse', vetev], SERVER).out.trim() === serverPred,
    `kód ${v.kod}; HEAD ${hlavaSha() === shaPred ? 'stejný' : 'ZMĚNĚNÝ'};`
    + ` hledaný důvod „${uryvek}" ${v.out.includes(uryvek) ? 'je' : 'CHYBÍ'};`
    + ` výpis: ${v.out.split('\n').filter((r) => /warning|SEBEOPRAVA/.test(r)).join(' | ').slice(0, 240)}`);
}

/* ---- a že se cvičení nepřestalo cvičit --------------------------- */
pravda('cvičení opravdu zkoušelo i tu část, která pouští generátory',
  RYCHLE || ok >= 13,
  `prošlo jen ${ok} kontrol — s --rychle je to v pořádku, bez něj ne`);

console.log('\nCVIČENÍ SEBEOPRAVY' + (RYCHLE ? ' (jen rychlá část)' : ''));
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log(`::error::Cvičení sebeopravy: ${chyb} kontrol neprošlo —`
    + ' automat, který se neumí opravit na cvičení, se neopraví ani naostro.');
  process.exit(1);
}
