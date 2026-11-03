/* Cizí push nesmí zahodit práci úlohy (naostro, v místním gitu)
   ==================================================================
   Spuštění: node scripts/test-push-opakovani.mjs   (bez prohlížeče)

   PROČ TENHLE SOUBOR VZNIKL. 3. 11. pushly do jedné větve dvě úlohy
   těsně po sobě. Druhá dostala „! [rejected] (fetch first)" a spadla
   — byl to robot dat, který měl hotových 2 749 souborů. Nabídky se
   ten den neobnovily kvůli dvěma řádkům shellu bez opakování.

   CO MĚŘÍ. Nebere si vzor ani kopii: přečte `run:` z
   .github/actions/commit-a-push/action.yml a PUSTÍ TO TĚLO, jak je,
   proti opravdovému gitu — bare repozitář a dva klony v /tmp. Kdyby
   se akce změnila, zkouška měří tu změnu, ne starou představu o ní.

   Dvě situace:
     1. cizí push mezitím → naše práce musí dojít, a cizí zůstat,
     2. opravdový KONFLIKT na témž souboru → úloha spadne nahlas
        a commit zůstane (nic se tiše nepřepíše).
   ================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Tělo akce se NEOPISUJE, čte se ze zdroje. */
function teloAkce() {
  const t = fs.readFileSync(path.join(KOREN, '.github', 'actions', 'commit-a-push', 'action.yml'), 'utf8');
  const i = t.indexOf('run: |');
  if (i < 0) return null;
  const radky = t.slice(i + 'run: |'.length).split('\n').slice(1);
  const odsazeni = (radky.find((r) => r.trim()) || '').match(/^\s*/)[0].length;
  const ven = [];
  for (const r of radky) {
    if (r.trim() && !r.startsWith(' '.repeat(odsazeni))) break;
    ven.push(r.slice(odsazeni));
  }
  return ven.join('\n');
}
const TELO = teloAkce();
pravda('tělo akce se dá přečíst ze zdroje (neopisuje se)', !!TELO && TELO.includes('git push'),
  'v action.yml se nenašel blok `run: |` s pushem');

function git(kde, ...args) {
  return spawnSync('git', ['-C', kde, ...args], { encoding: 'utf8' });
}
function pripravit() {
  const koren = fs.mkdtempSync(path.join(os.tmpdir(), 'push-op-'));
  const holy = path.join(koren, 'holy.git');
  spawnSync('git', ['init', '--bare', '-b', 'hlavni', holy], { encoding: 'utf8' });
  const a = path.join(koren, 'a'), b = path.join(koren, 'b');
  spawnSync('git', ['clone', '-q', holy, a], { encoding: 'utf8' });
  for (const kde of [a]) {
    git(kde, 'config', 'user.email', 'a@a'); git(kde, 'config', 'user.name', 'A');
    fs.writeFileSync(path.join(kde, 'zaklad.txt'), 'start\n');
    git(kde, 'add', '-A'); git(kde, 'commit', '-q', '-m', 'start'); git(kde, 'push', '-q', 'origin', 'HEAD:hlavni');
  }
  spawnSync('git', ['clone', '-q', holy, b], { encoding: 'utf8' });
  git(b, 'config', 'user.email', 'b@b'); git(b, 'config', 'user.name', 'B');
  return { koren, holy, a, b };
}
function pustAkci(kde, co, zprava) {
  return spawnSync('bash', ['-c', TELO], {
    cwd: kde, encoding: 'utf8',
    env: { ...process.env, CO: co, ZPRAVA: zprava, POKUSU: '3' },
  });
}

if (TELO) {
  /* ---- 1) cizí push mezitím ---------------------------------- */
  const s = pripravit();
  /* B zapíše a odešle SVŮJ soubor — tím se origin pohne dopředu. */
  fs.writeFileSync(path.join(s.b, 'cizi.txt'), 'cizi prace\n');
  git(s.b, 'add', '-A'); git(s.b, 'commit', '-q', '-m', 'cizi'); git(s.b, 'push', '-q', 'origin', 'HEAD:hlavni');
  /* A o tom neví a chce odeslat svoji práci. */
  fs.writeFileSync(path.join(s.a, 'nase.txt'), 'nase prace\n');
  const beh = pustAkci(s.a, '-A', 'nase: prace ulohy');
  pravda('odeslání projde i po cizím pushi', beh.status === 0,
    `kód ${beh.status}; výpis: ${String(beh.stdout || '').slice(-200)}${String(beh.stderr || '').slice(-200)}`);
  const soubory = git(s.holy, 'ls-tree', '--name-only', 'hlavni').stdout || '';
  pravda('a v origin je NAŠE práce', soubory.includes('nase.txt'), soubory.replace(/\n/g, ' '));
  pravda('a CIZÍ práce tam zůstala (nepřepsala se)', soubory.includes('cizi.txt'), soubory.replace(/\n/g, ' '));
  pravda('běh přiznal, že musel opakovat',
    /přerovnávám|pokus 2/.test(String(beh.stdout || '') + String(beh.stderr || '')),
    'ani jedna hláška o opakování — prošlo to napoprvé, takže se opakování vůbec neměřilo');
  fs.rmSync(s.koren, { recursive: true, force: true });

  /* ---- 2) opravdový konflikt --------------------------------- */
  const k = pripravit();
  fs.writeFileSync(path.join(k.b, 'zaklad.txt'), 'od B\n');
  git(k.b, 'add', '-A'); git(k.b, 'commit', '-q', '-m', 'B mění základ'); git(k.b, 'push', '-q', 'origin', 'HEAD:hlavni');
  fs.writeFileSync(path.join(k.a, 'zaklad.txt'), 'od A\n');
  const behK = pustAkci(k.a, '-A', 'A mění základ');
  const vystupK = String(behK.stdout || '') + String(behK.stderr || '');
  pravda('konflikt skončí nenulovým kódem (nic se tiše nepřepíše)', behK.status !== 0, `kód ${behK.status}`);
  pravda('a řekne to hlasitě (::error::)', vystupK.includes('::error::'), vystupK.slice(-200));
  pravda('a naše práce zůstane v commitu, ne v koši',
    (git(k.a, 'log', '-1', '--pretty=%s').stdout || '').includes('A mění základ'),
    (git(k.a, 'log', '-1', '--pretty=%s').stdout || '').trim());
  pravda('a cizí práce v origin zůstane nedotčená',
    (git(k.holy, 'show', 'hlavni:zaklad.txt').stdout || '').includes('od B'));
  fs.rmSync(k.koren, { recursive: true, force: true });

  /* ---- 3) beze změny se nic neposílá ------------------------- */
  const n = pripravit();
  const behN = pustAkci(n.a, '-A', 'nic se nezměnilo');
  pravda('bez změny akce nic nekomituje a skončí nulou',
    behN.status === 0 && String(behN.stdout || '').includes('Beze změny'),
    `kód ${behN.status}; ${String(behN.stdout || '').slice(0, 120)}`);
  fs.rmSync(n.koren, { recursive: true, force: true });
}

console.log('\nCizí push nezahodí práci úlohy');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.error(`::error::Opakování pushe: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
