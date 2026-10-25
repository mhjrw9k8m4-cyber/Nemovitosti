// Test: hlásič selhání noční úlohy.
//
// Spuštění: node scripts/test-ohlas-selhani.mjs   (nepotřebuje prohlížeč)
//
// PROČ VZNIKL. Noční úlohy jsou tři a když některá selhala, nestalo se
// nic: zůstala po ní červená tečka v záložce Actions, kam se nikdo
// nedívá. Hlásič to mění — a protože běží ve chvíli, kdy už něco
// selhalo, musí platit i ve dvou nepříjemných případech:
//   · GitHub neodpovídá — nesmí tu první chybu přebít vlastní výjimkou,
//     ale taky NESMÍ MLČET (jinak se o selhání nedozví nikdo podruhé),
//   · úkol už je otevřený — nesmí zakládat další, jinak jich za týden
//     bude sedm a člověk je přestane otevírat.
// GitHub se tu PŘEDSTÍRÁ vlastním serverem; žádný opravdový úkol se
// nikde nezakládá.
import { spawn } from 'node:child_process';
import http from 'node:http';
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

/* Falešný GitHub. `stav` říká, co má předstírat, `zapsano` sbírá, co mu
   hlásič poslal — na tom se pak měří, co doopravdy udělal. */
let stav = 'bez-ukolu';
const zapsano = [];
const server = http.createServer((req, res) => {
  let telo = '';
  req.on('data', (d) => { telo += d; });
  req.on('end', () => {
    const vrat = (kod, j) => { res.writeHead(kod, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    if (stav === 'github-mlci') { res.destroy(); return; }
    if (req.method === 'GET' && req.url.includes('/issues?state=open')) {
      if (stav === 'ukol-otevreny') {
        return vrat(200, [{ number: 7, body: 'něco\n<!-- ohlas-selhani:robot-dat -->\ndál' }]);
      }
      /* Úkol, který se ozval nedávno (nebo dávno) — na tom se měří
         ticho. Datum vzniku je v obou případech staré, aby rozhodoval
         opravdu poslední komentář. */
      if (stav === 'cerstvy-komentar' || stav === 'stary-komentar') {
        return vrat(200, [{ number: 9, created_at: new Date(Date.now() - 3600e3 * 100).toISOString(),
          body: '<!-- ohlas-selhani:robot-dat -->' }]);
      }
      /* „zavřený úkol" se mezi otevřenými neobjeví — přesně proto se
         hledá jen ve state=open. */
      return vrat(200, stav === 'jiny-ukol' ? [{ number: 3, body: 'cizí úkol bez značky' }] : []);
    }
    if (req.method === 'GET' && /\/issues\/\d+\/comments/.test(req.url)) {
      const pred = stav === 'cerstvy-komentar' ? 1 : 100;
      return vrat(200, stav === 'cerstvy-komentar' || stav === 'stary-komentar'
        ? [{ created_at: new Date(Date.now() - 3600e3 * pred).toISOString(), body: 'Selhalo znovu' }]
        : []);
    }
    if (req.method === 'POST' && /\/issues\/\d+\/comments$/.test(req.url)) {
      zapsano.push({ druh: 'komentar', url: req.url, telo });
      return vrat(201, { id: 1 });
    }
    if (req.method === 'POST' && req.url.endsWith('/issues')) {
      zapsano.push({ druh: 'novy-ukol', telo });
      return stav === 'zaklad-selze' ? vrat(403, { message: 'Resource not accessible' }) : vrat(201, { number: 42 });
    }
    vrat(404, {});
  });
});
await new Promise((r) => server.listen(8413, r));

function pust(rezim, prepis) {
  stav = rezim; zapsano.length = 0;
  return new Promise((hotovo) => {
    const p = spawn('node', [path.join(KOREN, 'scripts', 'ohlas-selhani.mjs')], {
      cwd: KOREN,
      env: {
        ...process.env,
        GH_API: 'http://127.0.0.1:8413',
        GH_TOKEN: 'zkusebni', REPO: 'nekdo/neco',
        JMENO: 'Robot dat (stahování nabídek)',
        VYZNAM: 'Nabídky se přestaly obnovovat.',
        ZNACKA: 'Robot dat', BEH: 'https://priklad/run/1',
        ...prepis,
      },
    });
    let out = '';
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (kod) => hotovo({ out, kod, zapsano: zapsano.slice() }));
  });
}

console.log('\nHlásič selhání noční úlohy');

/* ---- 1) poprvé: založí úkol se značkou a odkazem na běh --------- */
{
  const { out, kod, zapsano: z } = await pust('bez-ukolu');
  const novy = z.find((x) => x.druh === 'novy-ukol');
  pravda('poprvé založí úkol', !!novy && z.length === 1, JSON.stringify(z.map((x) => x.druh)));
  const j = novy ? JSON.parse(novy.telo) : {};
  pravda('v názvu je jméno úlohy', /Robot dat/.test(j.title || ''), j.title);
  pravda('v těle je skrytá značka (podle ní se úkol najde příště)',
    /<!-- ohlas-selhani:robot-dat -->/.test(j.body || ''), (j.body || '').slice(0, 80));
  pravda('a odkaz na běh, který selhal', /priklad\/run\/1/.test(j.body || ''));
  pravda('a napíše, co to pro web znamená', /přestaly obnovovat/.test(j.body || ''));
  pravda('skončí nulou, aby nepřebil tu první chybu', kod === 0, 'kód ' + kod);
  pravda('a řekne, co udělal', /Založen úkol #42/.test(out), out.trim());
}

/* ---- 1b) ticho: šum není hlášení ------------------------------- */
/* Když selhává něco, co se bez člověka spravit nedá (chybí kbelík
   v Supabase, není nasazené SQL), přidávat „selhalo znovu" čtyřikrát
   denně znamená vyrobit šum — a šum nikdo nečte, takže by se tím
   zrušil smysl celého hlášení. Naměřeno v ostrém běhu: kontrola
   živého systému selhává každých 6 h z téhož důvodu. */
{
  const d = await pust('cerstvy-komentar');
  pravda('úkol, který se ozval před hodinou, komentář NEDOSTANE',
    !d.zapsano.some((x) => x.druh === 'komentar') && /ticho/.test(d.out),
    `zapsáno: ${JSON.stringify(d.zapsano.map((x) => x.druh))}; výpis: ${d.out.split('\n')[0]}`);
  pravda('a je napsané, kolik hodin se mlčí i proč',
    /ozval se před [\d.]+ h/.test(d.out) && /šum/.test(d.out), d.out.split('\n')[0]);
  pravda('a skončí nulou (mlčení není selhání hlásiče)', d.kod === 0, 'kód ' + d.kod);

  const e = await pust('stary-komentar');
  pravda('úkol, který se neozval 100 h, komentář dostane',
    e.zapsano.some((x) => x.druh === 'komentar'),
    `zapsáno: ${JSON.stringify(e.zapsano.map((x) => x.druh))}; výpis: ${e.out.split('\n')[0]}`);
}

/* ---- 2) podruhé: doplní komentář, nezakládá další -------------- */
{
  const { zapsano: z, kod, out } = await pust('ukol-otevreny');
  pravda('při už otevřeném úkolu připíše komentář', z.length === 1 && z[0].druh === 'komentar',
    JSON.stringify(z.map((x) => x.druh)));
  pravda('a nezakládá druhý úkol', !z.some((x) => x.druh === 'novy-ukol'));
  pravda('komentář nese odkaz na nový běh', /priklad\/run\/1/.test(z[0] ? z[0].telo : ''));
  pravda('a je to vidět ve výpisu', /#7/.test(out) && kod === 0, out.trim());
}

/* ---- 3) cizí úkol bez značky se nepočítá ----------------------- */
{
  const { zapsano: z } = await pust('jiny-ukol');
  pravda('cizí otevřený úkol bez značky hlásič nepřepíše',
    z.length === 1 && z[0].druh === 'novy-ukol', JSON.stringify(z.map((x) => x.druh)));
}

/* ---- 4) A TO NEJDŮLEŽITĚJŠÍ: když GitHub neodpoví ------------- */
{
  const { out, kod } = await pust('github-mlci');
  pravda('nedostupný GitHub hlásič nezhodí', kod === 0, 'kód ' + kod);
  pravda('ale NEMLČÍ — napíše varování', /::warning::/.test(out), out.trim() || '(nic nenapsal)');
}
{
  const { out, kod } = await pust('zaklad-selze');
  pravda('odmítnuté založení úkolu se taky ohlásí varováním',
    /::warning::/.test(out) && kod === 0, out.trim());
}
{
  const { out, kod } = await pust('bez-ukolu', { GH_TOKEN: '' });
  pravda('bez tokenu se nic nepředstírá a napíše se to',
    /::warning::/.test(out) && /GH_TOKEN/.test(out) && kod === 0, out.trim());
}

/* ---- 5) je to zapojené ve VŠECH úlohách podle hodin ----------- */
{
  const podleHodin = [];
  for (const f of ['update-data', 'kontrola-inzeratu', 'rozesilani', 'testy', 'nasad-sql',
    'fetch-kraje', 'fetch-nsfw-model', 'test-chat']) {
    const t = readFileSync(path.join(KOREN, '.github', 'workflows', f + '.yml'), 'utf8');
    if (/cron:/.test(t)) podleHodin.push([f, t]);
  }
  pravda(`úlohy podle hodin se našly (${podleHodin.length})`, podleHodin.length === 3,
    podleHodin.map((x) => x[0]).join(', '));
  for (const [f, t] of podleHodin) {
    pravda(`${f}: hlásí selhání`,
      /uses: \.\/\.github\/actions\/ohlas-selhani/.test(t) && /if: failure\(\)/.test(t),
      'chybí krok s if: failure() a ./.github/actions/ohlas-selhani');
    pravda(`${f}: má právo zakládat úkoly`, /issues: write/.test(t), 'chybí issues: write');
  }
  /* A švík pro zkoušku nesmí být v žádném workflow: jinak by se úkoly
     tiše zakládaly někam jinam. */
  const sSvikem = podleHodin.filter(([, t]) => /GH_API/.test(t));
  pravda('švík GH_API není v žádné úloze', sSvikem.length === 0, sSvikem.map((x) => x[0]).join(', '));
}

server.close();
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Hlásič selhání: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
