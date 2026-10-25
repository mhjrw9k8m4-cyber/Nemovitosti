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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { rozhodni, patriGeneratorum, zpravaOprav, padleZkousky, ZNACKA, VYPINAC, UVNITR, PATRI_GENERATORUM } from './sebeoprava.mjs';

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
    /* SKUTEČNÁ JMÉNA, ne vymyšlená. Dřív tu stálo `rss.xml`, které
       v repozitáři není — vzorek tím potvrzoval vzor, který nesedí na
       nic, a patnáct opravdových kanálů zůstalo mimo hranici
       (viz oddíl 158). Vzorek musí být soubor, který existuje. */
    'novinky.xml', 'novinky-praha.xml',
    'robots.txt', 'docs/roadmap.md', 'supabase/00-vse.sql'];
  const nesmi = ['js/ceny.js', 'css/styles.css', 'scripts/oprav.mjs', 'package.json',
    'docs/optimalizace.md', 'docs/pro-majitele.md', '.github/workflows/testy.yml',
    'supabase/navstevnost.sql', 'CLAUDE.md', 'sw.js'];
  /* ŽÁDNÉ MRTVÉ PRAVIDLO. Tohle je ta levná polovina měření pokrytí
     (scripts/sebeoprava-pokryti.mjs): vzor, který nesedí ani na jeden
     soubor v repozitáři, jen budí dojem, že je něco pokryté. Přesně
     tak se patnáct kanálů `novinky-*.xml` ocitlo mimo hranici, zatímco
     seznam povoloval `rss*.xml`, co v repozitáři nikdy nebylo.
     Jde to do rychlé sady, protože na to stačí seznam souborů. */
  const vsechny = spawnSync('git', ['-C', KOREN, 'ls-files'], { encoding: 'utf8' });
  const verzovane = String(vsechny.stdout || '').split('\n').filter(Boolean);
  const mrtve = PATRI_GENERATORUM.filter((v) => !verzovane.some((f) => v.test(f)));
  pravda(`žádné pravidlo o odvozených souborech není mrtvé (${PATRI_GENERATORUM.length} pravidel, ${verzovane.length} souborů)`,
    verzovane.length > 1000 && mrtve.length === 0,
    verzovane.length <= 1000 ? `seznam souborů se nenačetl (${verzovane.length})`
      : `nesedí na žádný soubor: ${mrtve.map(String).join(', ')}`);

  const spatne = smi.filter((f) => !patriGeneratorum(f));
  const propustne = nesmi.filter((f) => patriGeneratorum(f));
  pravda(`odvozené soubory se poznají (${smi.length} vzorků)`, spatne.length === 0,
    'nepoznané: ' + spatne.join(', '));
  pravda(`a ruční práce se nepropustí (${nesmi.length} vzorků)`, propustne.length === 0,
    'propuštěné: ' + propustne.join(', ') + ' — na tohle by automat sahat neměl');
}

/* ---- 4) výkonná část: odmítnutí NEJDE do repozitáře -------------- */
{
  /* PROMĚNNÉ SE VYPRÁZDNÍ, NE DĚDÍ. Tahle zkouška pouští opravdový
     automat, a dokud brala prostředí, jak přišlo, měřila něco jiného,
     než říká: při běhu uvnitř cvičení (kde je SEBEOPRAVA_VETEV
     nastavená) prošel i případ „bez jména domácí větve" jako platný
     běh — a automat se rozjel na plno, včetně sady, v níž je tahle
     zkouška. Tedy sám v sobě; naměřeno 39 běhů naráz. Značku UVNITR
     posílá automat svým dětem sám, ale zkouška si to nesmí hlídat
     cizí pojistkou: měří se zadaný stav, ne zdědený. */
  const pust = (env) => {
    const r = spawnSync('node', [path.join(KOREN, 'scripts', 'sebeoprava.mjs')],
      { cwd: KOREN,
        encoding: 'utf8',
        env: { ...process.env, SEBEOPRAVA_VETEV: '', SEBEOPRAVA_VETEV_AKTUALNI: '', [UVNITR]: '', ...env } });
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

  /* PRAVIDLO 8, ZMĚŘENÉ SPUŠTĚNÍM. Automat v dokazování pouští celou
     sadu, a v sadě je tahle zkouška, která pouští automat. Bez značky
     v prostředí se automat pustí sám v sobě a roste exponenciálně
     (naměřeno 39 běhů naráz). Musí tedy stačit značka — a nic víc. */
  const c = pust({ SEBEOPRAVA_VETEV: 'domaci', SEBEOPRAVA_VETEV_AKTUALNI: 'domaci', [UVNITR]: '1' });
  pravda('se značkou „běžím uvnitř sebe" automat nedělá NIC (pravidlo 8)',
    c.kod === 0 && /už běží výš v řetězu/.test(c.out) && stav() === pred,
    `kód ${c.kod}; výpis: ${c.out.split('\n').filter(Boolean).slice(-2).join(' | ')}`);

  /* A že tu značku opravdu posílá dál — jinak by pravidlo platilo jen
     na papíře. Hledá se v kódu, protože podřízený proces to jinak
     nezjistí, aniž by se celý běh pustil. */
  const kod = readFileSync(path.join(KOREN, 'scripts', 'sebeoprava.mjs'), 'utf8');
  const spusteni = [...kod.matchAll(/spawnSync\('node',[\s\S]{0,120}?\{[^}]*\}/g)].map((m) => m[0]);
  const bezZnacky = spusteni.filter((u) => !/env:\s*prostrediDeti/.test(u));
  pravda(`a značku posílá do VŠECH podřízených běhů (${spusteni.length})`,
    spusteni.length >= 3 && bezZnacky.length === 0,
    `bez značky: ${bezZnacky.length} z ${spusteni.length} — takový běh by se mohl pustit sám v sobě`);
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

/* ---- vyčtení padlých zkoušek: parser SVÁZANÝ S TÍM, KDO TISKNE --- */
/* Na tomhle jednom vzorku stojí rozdíl mezi „oprava to rozbila" a
   „bylo to rozbité už předtím". Zrádné je, že při změně znění souhrnu
   by parser tiše vracel prázdno a nic by nespadlo — automat by jen
   mlčky přišel o diagnózu. Proto se měří OBOJE: že parser rozumí
   skutečnému znění, a že běžec to znění pořád tiskne. */
{
  const vzorek = '\n::error::Rychlá sada: padlo 2 z 131 — test-oprav.mjs, test-verze.mjs';
  const r = padleZkousky(vzorek);
  pravda('z výpisu běžce se vyčtou jména padlých zkoušek',
    r.length === 2 && r[0] === 'test-oprav.mjs' && r[1] === 'test-verze.mjs',
    JSON.stringify(r));
  pravda('zelený výpis nedá žádné jméno', padleZkousky('Rychlá sada: 131/131 prošlo').length === 0);
  pravda('a prázdný vstup nespadne', padleZkousky(undefined).length === 0);

  /* SVÁZÁNÍ S PRODUCENTEM: tenhle tvar tiskne scripts/zkousky.mjs.
     Kdyby ho přepsal, parser přestane rozumět — a tohle to řekne. */
  const bezec = readFileSync(path.join(KOREN, 'scripts', 'zkousky.mjs'), 'utf8');
  pravda('běžec sady pořád tiskne souhrn ve tvaru, kterému parser rozumí',
    /padlo \$\{[^}]+\} z \$\{[^}]+\} — /.test(bezec),
    've scripts/zkousky.mjs se nenašlo „padlo N z M — " — parser padlých zkoušek'
    + ' by tiše vracel prázdno a automat by přišel o rozdíl mezi'
    + ' „oprava to rozbila" a „bylo to rozbité už předtím"');
}

/* ---- a že se automat opravdu CVIČÍ, ne jen vykládá ------------- */
/* Pravidla přečtená z kódu nedokazují, že automat opravuje. To dokazuje
   jenom cvičení, které odvozené soubory rozbije naschvál a nechá celý
   automat proběhnout (scripts/cviceni-sebeopravy.mjs). Tahle část hlídá,
   že cvičení v repozitáři JE, že ho něco pouští a že si při tom nemůže
   sáhnout na ostrou větev — tedy že neuhnilo. */
{
  const cv = path.join(KOREN, 'scripts', 'cviceni-sebeopravy.mjs');
  pravda('cvičení sebeopravy je v repozitáři', existsSync(cv));
  const t = existsSync(cv) ? readFileSync(cv, 'utf8') : '';
  const wfy = readdirSync(path.join(KOREN, '.github', 'workflows'))
    .map((f) => readFileSync(path.join(KOREN, '.github', 'workflows', f), 'utf8')).join('\n');
  pravda('a pouští ho nějaká úloha v CI (jinak by to byl soubor, co nikdo nespustí)',
    /node scripts\/cviceni-sebeopravy\.mjs/.test(wfy));
  pravda('cvičení pouští OPRAVDOVÝ automat, ne svoji kopii jeho pravidel',
    /'scripts', 'sebeoprava\.mjs'/.test(t));
  pravda('cvičení si dělá vlastní kopii repozitáře i vlastní server',
    /clone', '--bare/.test(t) && /SERVER/.test(t),
    'bez vlastního serveru by první cvičení pushlo opravu na ostrou větev');
  pravda('cvičení zkouší aspoň čtyři stavy, ve kterých se jednat NESMÍ',
    (t.match(/^\s+\['[A-E]\)/gm) || []).length >= 4,
    `našlo se ${(t.match(/^\s+\['[A-E]\)/gm) || []).length}`);
  /* Dvě pravidla se cvičit nedají a je to napsané i tady, aby se to
     nepletlo s mezerou v cvičení: „generátory nic nezměnily" je stav bez
     vady (nic se neopravuje, protože není co), a „oprava by sahala na
     ruční práci" by znamenalo pokazit generátory natolik, aby zapsaly do
     js/ — to by zkoušelo generátory, ne automat. Obě pravidla měří
     tabulka stavů výš, na čisté funkci. */
  pravda('a obě pravidla, která se cvičit nedají, měří tabulka stavů',
    /ruční práci/.test(readFileSync(path.join(KOREN, 'scripts', 'test-sebeoprava.mjs'), 'utf8')));
}

console.log('\nSebeoprava odvozených souborů');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Sebeoprava: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
