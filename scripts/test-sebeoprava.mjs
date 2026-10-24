/* Test: sebeoprava opraví jen to, co opravit smí — a jinak mlčí leda
   do výpisu, nikdy do repozitáře.
   ==================================================================
   Spuštění: node scripts/test-sebeoprava.mjs

   Automat, který smí commitovat, je nebezpečný přesně tak, jak jsou
   slabá jeho pravidla. Proto je rozhodování ve scripts/sebeoprava.mjs
   oddělené od vykonání (funkce `rozhodni`) a tady se zkouší KAŽDÉ
   pravidlo samostatně — bez gitu, bez sítě, bez CI. Zkouška, která by
   musela věřit, že „se to v CI zachová správně", by nehlídala nic.

   Sedm pravidel, sedm případů: cizí větev, vypínač, oprava po opravě,
   nic k opravě, sahání na ruční práci, chybějící jméno domácí větve
   a ten jediný případ, kdy se opravdu opravuje.

   A dvě věci, co se hlídají staticky, protože jsou v workflow:
   že se oprava nespouští po svém vlastním běhu (druhá pojistka proti
   smyčce) a že si oprava nejdřív DOKÁŽE výsledek rychlou sadou, než
   cokoli commitne.
   ================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { rozhodni, patriGeneratorum, zpravaOprav, ZNACKA, VYPINAC } from './sebeoprava.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const DOMA = 'domaci-vetev';
const zaklad = {
  vetev: DOMA, povolenaVetev: DOMA, vypinac: false,
  zpravaHEAD: 'někdo zasáhl do zdroje', zmenene: ['index.html', 'js/min/ceny.js'],
};
const se = (zmeny) => rozhodni({ ...zaklad, ...zmeny });

/* ---- 1) ten jediný případ, kdy se opravuje ----------------------- */
{
  const r = se({});
  pravda('rozchod odvozených souborů se opravit SMÍ', r.opravit === true, r.duvod);
  pravda('a v důvodu stojí, kolika souborů se to týká', /2/.test(r.duvod), r.duvod);
}

/* ---- 2) pravidla, která opravu zakazují -------------------------- */
{
  const p = (popis, zmeny, cast) => {
    const r = se(zmeny);
    pravda(popis, r.opravit === false && (!cast || new RegExp(cast).test(r.duvod)),
      `rozhodnuto: ${r.opravit ? 'OPRAVIT' : 'ne'} — ${r.duvod}`);
  };
  p('na cizí větvi se neopravuje', { vetev: 'cizi-vetev' }, 'není domácí');
  p('bez jména domácí větve se neopravuje', { povolenaVetev: '' }, 'SEBEOPRAVA_VETEV');
  p('s vypínačem v repozitáři se neopravuje', { vypinac: true }, 'vypínač');
  p('po sebeopravě se druhá oprava nedělá (smyčka)',
    { zpravaHEAD: `${ZNACKA} dorovnat odvozené soubory` }, 'druhá v řadě');
  p('když generátory nic nezmění, není co opravovat', { zmenene: [] }, 'vada není');
  p('nesahá na zdrojový skript v js/', { zmenene: ['index.html', 'js/ceny.js'] }, 'ruční práci');
  p('ani na scripts/', { zmenene: ['scripts/oprav.mjs'] }, 'ruční práci');
  p('ani na workflow', { zmenene: ['.github/workflows/testy.yml'] }, 'ruční práci');
  p('ani na ručně psanou prózu v docs/', { zmenene: ['docs/optimalizace.md'] }, 'ruční práci');
  p('ani na zdrojový stylopis', { zmenene: ['css/styles.css'] }, 'ruční práci');
  p('ani na package.json', { zmenene: ['package.json'] }, 'ruční práci');
}

/* ---- 2b) zpráva do commitu umí česky ---------------------------- */
/* První oprava v CI hlásila „Rozcházelo se 1 souborů". Je to jediná
   věta, kterou po sebeopravě někdo přečte — a zrovna tenhle repozitář
   má na skloňování počtů vlastní zkoušku jinde. */
{
  const veta = (n) => zpravaOprav(Array.from({ length: n }, (_, i) => `data/x${i}.json`))
    .split('\n')[2];
  pravda('zpráva: jeden soubor se „rozcházel"', /^Rozcházel se 1 soubor: /.test(veta(1)), veta(1));
  pravda('dva se „rozcházely"', /^Rozcházely se 2 soubory: /.test(veta(2)), veta(2));
  pravda('pět se „rozcházelo"', /^Rozcházelo se 5 souborů: /.test(veta(5)), veta(5));
  const hodne = zpravaOprav(Array.from({ length: 2263 }, (_, i) => `p${i}.html`)).split('\n')[2];
  pravda('a dlouhý výčet se zkrátí, taky vysklonovaně',
    /a dalších 2258\.$/.test(hodne), hodne.slice(-40));
  pravda('zpráva nese značku, podle které se pozná druhá oprava v řadě',
    zpravaOprav(['a.html']).startsWith(ZNACKA));
}

/* ---- 3) co patří generátorům a co ne ----------------------------- */
{
  const smi = ['index.html', 'pozemek-benesov-a-1x.html', 'data/index.json',
    'data/okres/tabor.json', 'css/styles.min.css', 'js/min/ceny.js', 'sitemap.xml',
    'rss.xml', 'robots.txt', 'docs/roadmap.md', 'supabase/00-vse.sql'];
  const nesmi = ['js/ceny.js', 'css/styles.css', 'scripts/oprav.mjs', 'package.json',
    'docs/optimalizace.md', 'docs/pro-majitele.md', '.github/workflows/testy.yml',
    'supabase/navstevnost.sql', 'CLAUDE.md', 'sw.js'];
  const spatne = smi.filter((f) => !patriGeneratorum(f));
  const propustne = nesmi.filter((f) => patriGeneratorum(f));
  pravda(`odvozené soubory se poznají (${smi.length} vzorků)`, spatne.length === 0,
    'nepoznané: ' + spatne.join(', '));
  pravda(`a ruční práce se nepropustí (${nesmi.length} vzorků)`, propustne.length === 0,
    'propuštěné: ' + propustne.join(', ') + ' — na tohle by automat sahat neměl');
}

/* ---- 4) výkonná část: odmítnutí NEJDE do repozitáře -------------- */
{
  const pust = (env) => {
    const r = spawnSync('node', [path.join(KOREN, 'scripts', 'sebeoprava.mjs')],
      { cwd: KOREN, encoding: 'utf8', env: { ...process.env, ...env } });
    return { out: String(r.stdout || '') + String(r.stderr || ''), kod: r.status };
  };
  const stav = () => spawnSync('git', ['-C', KOREN, 'status', '--porcelain'],
    { encoding: 'utf8' }).stdout;

  const pred = stav();
  const a = pust({ SEBEOPRAVA_VETEV: 'nejaka-cizi-vetev' });
  pravda('na cizí větvi skript opravdu nic neudělá a skončí úspěchem',
    a.kod === 0 && /neopravuje/.test(a.out) && stav() === pred,
    `kód ${a.kod}; výpis: ${a.out.split('\n')[0]}`);
  pravda('a řekne to nahlas (::warning::), i když skončí úspěchem',
    /::warning::/.test(a.out), a.out.slice(0, 160));

  const b = pust({});
  pravda('bez jména domácí větve taky nic a taky nahlas',
    b.kod === 0 && /::warning::/.test(b.out) && stav() === pred, b.out.slice(0, 160));
}

/* ---- 5) co musí stát v workflow a ve skriptu --------------------- */
{
  const wf = path.join(KOREN, '.github', 'workflows', 'sebeoprava.yml');
  pravda('workflow sebeopravy v repozitáři je', existsSync(wf));
  const t = existsSync(wf) ? readFileSync(wf, 'utf8') : '';
  pravda('pouští se jen po SELHÁNÍ zkoušek',
    /workflow_run/.test(t) && /conclusion == 'failure'/.test(t), t.slice(0, 80));
  pravda('jen na výchozí větvi repozitáře',
    /head_branch == github\.event\.repository\.default_branch/.test(t));
  /* Druhá pojistka proti smyčce: po běhu, který spustil robot, se
     oprava nespouští. Bez ní by stačilo, aby se zpráva commitu jednou
     napsala jinak, a smyčka by byla otevřená. */
  pravda('a nikdy po běhu, který spustil robot (druhá pojistka proti smyčce)',
    /actor\.login != 'github-actions\[bot\]'/.test(t));
  pravda('úloha má napsaná práva a hlásí vlastní selhání',
    /^permissions:/m.test(t) && /ohlas-selhani/.test(t));

  const skript = readFileSync(path.join(KOREN, 'scripts', 'sebeoprava.mjs'), 'utf8');
  /* POŘADÍ: dokázat, pak commitnout. Kdyby to bylo naopak, byla by
     „oprava" jen nadějí — a nahrála by se i rozbitá. */
  const kdeZkousky = skript.indexOf('zkousky.mjs');
  const kdeCommit = skript.indexOf("'commit'");
  pravda('oprava se dokazuje rychlou sadou PŘED commitem',
    kdeZkousky > 0 && kdeCommit > 0 && kdeZkousky < kdeCommit,
    `zkoušky na ${kdeZkousky}, commit na ${kdeCommit}`);
  pravda('a když sada nevyjde, oprava se zahodí (checkout + clean)',
    /neprošla rychlá sada/.test(skript) && /'clean', '-fd'/.test(skript));
  pravda(`vypínač je jediný soubor (${VYPINAC}) a je napsaný v nápovědě`,
    skript.includes(VYPINAC) && /VYPÍNAČ/.test(skript));
  pravda('nikdy nepushuje silou', !/--force|-f\b.*push|push.*--force/.test(skript));
}

console.log('\nSebeoprava odvozených souborů');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Sebeoprava: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
