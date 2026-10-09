// Test: časová řada cenových hladin (data/historie-cen.json).
//
// Spuštění: node scripts/test-historie-cen.mjs   (nepotřebuje prohlížeč)
//
// Řada se staví z historie gitu — data/opportunities.json se commituje
// čtyřikrát denně, takže časová řada existuje, aniž by se cokoli zavádělo.
// Má to ale tři místa, kde se dá tiše přijít o pravdu:
//
//  1. HISTORIE SE DÁ ZTRATIT. V CI je klon mělký (actions/checkout bere
//     jeden commit), takže `git log` ukáže jeden den. Přestavba od začátku
//     by z dvaceti dnů udělala jeden a soubor by pořád vypadal platně.
//  2. ŘADA MŮŽE LHÁT. Hladina se mění i tím, že přibudou a zmizí nabídky.
//     Naměřeno: okres Brno-venkov „zdražil" za tři týdny o 132 % — půda
//     se nehnula, vyměnily se nabídky. Proto se u každé řady počítá
//     největší denní skok a ukazovat se smí jen ta klidná.
//  3. ŘADA SE MŮŽE ROZEJÍT S WEBEM. Kdyby se hladina pro graf počítala
//     jiným pravidlem než odhad na stránce pozemku, ukazoval by web
//     o témž místě dvě různá čísla.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOUBOR = path.join(KOREN, 'data', 'historie-cen.json');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nČasová řada cenových hladin');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Historie cen: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

// PŘEDPOKLAD: bez souboru nemá smysl měřit nic dalšího
pravda('řada je postavená a leží v data/historie-cen.json', existsSync(SOUBOR),
  'soubor chybí — spusťte node scripts/historie-cen.mjs');
if (!existsSync(SOUBOR)) hotovo();

const H = JSON.parse(readFileSync(SOUBOR, 'utf8'));
const dny = H.dny || [];
const rady = H.rady || {};
const klice = Object.keys(rady);

/* ---- 1) tvar: dny setříděné, bez opakování, pole zarovnaná ---- */
pravda('má co ukazovat — aspoň týden dnů a aspoň deset řad',
  dny.length >= 7 && klice.length >= 10, `dnů ${dny.length}, řad ${klice.length}`);
if (dny.length < 7 || klice.length < 10) hotovo();

pravda('dny jdou po sobě a žádný se neopakuje',
  dny.every((d, i) => i === 0 || d > dny[i - 1]) && new Set(dny).size === dny.length,
  dny.slice(0, 5).join(', ') + ' …');
pravda('každý den je datum', dny.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  dny.filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 3).join(', '));
pravda('každá řada má tolik hodnot, kolik je dnů (jinak by se graf posunul)',
  klice.every((k) => rady[k].cena.length === dny.length && rady[k].vzorek.length === dny.length),
  klice.filter((k) => rady[k].cena.length !== dny.length).slice(0, 3)
    .map((k) => `${k}: ${rady[k].cena.length} ≠ ${dny.length}`).join(', '));
pravda('a nikde není cena bez vzorku ani vzorek bez ceny',
  klice.every((k) => rady[k].cena.every((c, i) => (c === null) === (rady[k].vzorek[i] === null))),
  klice.filter((k) => rady[k].cena.some((c, i) => (c === null) !== (rady[k].vzorek[i] === null))).slice(0, 3).join(', '));
pravda('ceny jsou kladná čísla', klice.every((k) => rady[k].cena.every((c) => c === null || (isFinite(c) && c > 0))),
  klice.filter((k) => rady[k].cena.some((c) => c !== null && !(c > 0))).slice(0, 3).join(', '));

/* ---- 2) vzorek nikdy neklesne pod mez, ze které se vůbec počítá ---- */
const require_ = createRequire(import.meta.url);
require_(path.join(KOREN, 'js', 'ceny.js'));
const CENY = globalThis.PK_CENY;
const MIN = CENY.postav([]).MIN_VZOREK;
pravda(`žádný bod nestojí na míň než ${MIN} nabídkách`,
  klice.every((k) => rady[k].vzorek.every((v) => v === null || v >= MIN)),
  klice.filter((k) => rady[k].vzorek.some((v) => v !== null && v < MIN)).slice(0, 3).join(', '));

/* ---- 3) „klidná" znamená, co slibuje ---- */
const MEZ = 3;
let spatneKlidna = [], spatnySkok = [];
for (const k of klice) {
  const c = rady[k].cena.filter((x) => x !== null);
  let skok = 0;
  for (let i = 1; i < c.length; i++) skok = Math.max(skok, Math.abs(c[i] - c[i - 1]) / c[i - 1] * 100);
  skok = Math.round(skok * 10) / 10;
  if (Math.abs(skok - rady[k].skok) > 0.15) spatnySkok.push(`${k}: zapsáno ${rady[k].skok}, naměřeno ${skok}`);
  if (rady[k].klidna !== (skok <= MEZ)) spatneKlidna.push(`${k}: klidna=${rady[k].klidna}, skok ${skok} %`);
}
pravda('u každé řady sedí zapsaný největší denní skok s tím, co v ní opravdu je',
  spatnySkok.length === 0, spatnySkok.slice(0, 4).join('\n      '));
pravda(`a „klidná" má právě ta řada, která neskočila o víc než ${MEZ} % za den`,
  spatneKlidna.length === 0, spatneKlidna.slice(0, 4).join('\n      '));

const klidnych = klice.filter((k) => rady[k].klidna).length;
// PŘEDPOKLAD: kdyby klidná nebyla ani jedna, předchozí kontrola projde naprázdno
pravda('a aspoň nějaká řada klidná je (jinak není co ukazovat)', klidnych >= 5,
  `klidných řad: ${klidnych} ze ${klice.length}`);
pravda('a aspoň nějaká klidná NENÍ (jinak ta mez nic nefiltruje)', klidnych < klice.length,
  `klidných ${klidnych} ze ${klice.length} — mez ${MEZ} % nikoho nevyřadila`);

/* ---- 4) řada se počítá TÝMŽ pravidlem, jakým web odhaduje cenu ---- */
{
  const d = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
  /* Model se staví Z TÉŽE HROMÁDKY jako řada a jako web, tedy bez
     duplicit. Dokud se tu stavěl ze syrového snímku, mluvila kontrola
     jiným jazykem než to, co měří — a hlásila rozdíl („v řadě 29,4,
     model 33,7") i ve chvíli, kdy bylo všechno správně. */
  const PKH_T = require_(path.join(KOREN, 'js', 'hlidani-logika.js'));
  const model = CENY.postav(PKH_T.bezDuplicit(d.opportunities || []));
  const posledni = dny[dny.length - 1];
  let overeno = 0, rozchod = [];
  for (const k of klice) {
    const i = dny.indexOf(posledni);
    const zapsana = rady[k].cena[i];
    if (zapsana === null) continue;
    const [uroven, nazev, druh] = k.split('|');
    const h = model.hladinaMista(uroven, nazev, druh);
    if (!h) { rozchod.push(`${k}: v řadě ${zapsana}, model dnes nic`); continue; }
    overeno++;
    if (Math.abs(Math.round(h.zaM2 * 10) / 10 - zapsana) > 0.11)
      rozchod.push(`${k}: v řadě ${zapsana}, model ${(h.zaM2).toFixed(1)}`);
  }
  // PŘEDPOKLAD: kdyby se neověřilo nic, kontrola níž prochází naprázdno
  pravda('poslední den řady se dá porovnat s dnešními daty', overeno >= 50, `porovnáno ${overeno} řad`);
  pravda('a sedí s tím, co o témž místě počítá web (žádné dvojí číslo)',
    rozchod.length === 0, rozchod.slice(0, 4).join('\n      '));
}

/* ---- 5) mělký klon nesmí sežrat historii ---- */
{
  /* Zkouší se to na KOPII repozitáře s jedním commitem — tedy přesně tak,
     jak to vypadá v CI. Stavitel musí buď historii zachovat, nebo se
     zastavit; co nesmí, je tiše zapsat kratší řadu. */
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'hist-'));
  try {
    execFileSync('git', ['init', '-q', tmp]);
    execFileSync('git', ['-C', tmp, 'config', 'user.email', 'z@k.test']);
    execFileSync('git', ['-C', tmp, 'config', 'user.name', 'Zkouska']);
    for (const d of ['data', 'js', 'scripts']) execFileSync('mkdir', ['-p', path.join(tmp, d)]);
    copyFileSync(path.join(KOREN, 'js', 'ceny.js'), path.join(tmp, 'js', 'ceny.js'));
    /* Od verze 2 si historie bere i odstranění duplicit (bezDuplicit),
       aby počítala z téže hromádky jako mapa a stránky. Bez téhle kopie
       zkušební běh skončil na „Cannot find module" — a vypadalo to jako
       vada řady, ne jako chybějící soubor ve zkoušce. */
    copyFileSync(path.join(KOREN, 'js', 'hlidani-logika.js'), path.join(tmp, 'js', 'hlidani-logika.js'));
    copyFileSync(path.join(KOREN, 'scripts', 'historie-cen.mjs'), path.join(tmp, 'scripts', 'historie-cen.mjs'));
    copyFileSync(path.join(KOREN, 'data', 'opportunities.json'), path.join(tmp, 'data', 'opportunities.json'));
    copyFileSync(SOUBOR, path.join(tmp, 'data', 'historie-cen.json'));
    execFileSync('git', ['-C', tmp, 'add', '-A']);
    execFileSync('git', ['-C', tmp, 'commit', '-qm', 'jeden commit, jako v mělkém klonu']);

    // a) dopočítání na mělkém klonu historii ZACHOVÁ
    execFileSync('node', ['scripts/historie-cen.mjs'], { cwd: tmp, stdio: 'pipe' });
    const po = JSON.parse(readFileSync(path.join(tmp, 'data', 'historie-cen.json'), 'utf8'));
    pravda('na mělkém klonu dopočítání nepřijde o staré dny',
      po.dny.length >= dny.length, `bylo ${dny.length} dnů, po doplnění ${po.dny.length}`);
    pravda('a všechny původní dny v řadě zůstanou',
      dny.every((d) => po.dny.includes(d)),
      'chybí: ' + dny.filter((d) => !po.dny.includes(d)).slice(0, 5).join(', '));

    // b) přestavba od začátku se na mělkém klonu ZASTAVÍ, místo aby historii zahodila
    let zastavil = false, vystup = '';
    try {
      execFileSync('node', ['scripts/historie-cen.mjs', '--prepocitat'], { cwd: tmp, stdio: 'pipe' });
    } catch (e) { zastavil = true; vystup = String(e.stderr || ''); }
    pravda('a přestavba od začátku se zastaví, místo aby historii zahodila', zastavil,
      'skript doběhl a přepsal řadu daty z jediného commitu');
    const poB = JSON.parse(readFileSync(path.join(tmp, 'data', 'historie-cen.json'), 'utf8'));
    pravda('a soubor po tom pokusu pořád drží celou historii',
      poB.dny.length >= dny.length, `zbylo ${poB.dny.length} dnů z ${dny.length}`);
    pravda('a řekne, co s tím (mělký klon, fetch-depth)',
      /unshallow|fetch-depth/.test(vystup), 'hláška: ' + vystup.split('\n').slice(0, 2).join(' / '));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/* ---- 6) v souboru stojí, co ta čísla jsou ---- */
pravda('u dat je napsané, co znamenají a čím se měřila',
  /nabídkové/i.test(H.popis || '') && /ceny\.js|js\/ceny/.test(H.popis || ''), H.popis);
pravda('a varování, že hladinou hýbe i výměna nabídek, ne jen ceny',
  /výměn|přibudou|zmiz/i.test(H.popis || ''), H.popis);

hotovo();
