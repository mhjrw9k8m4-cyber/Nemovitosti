/* Test: kontrola plánovaných úloh pozná hlídače, který přestal chodit
   ==================================================================
   Spuštění: node scripts/test-kontrola-uloh.mjs

   PROČ. Je to kontrola proti TICHU, a ticho se těžko pozná od klidu:
   když přestane fungovat ona sama, vypadá to stejně jako „všechno
   jede". Proto se měří obojí — tabulka verdiktů na čistých funkcích,
   a celý skript proti falešnému API, kde se vypnutá i zaspalá úloha
   vyrobí schválně.
   ================================================================== */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { periodaHodin, nalezUlohy, planovaneUlohy, NASOBEK } from './kontrola-uloh.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1) perioda z cronu ---------------------------------------- */
{
  const T = [
    ['0 */6 * * *', 6], ['35 */6 * * *', 6], ['19 4 * * *', 24], ['35 7 * * *', 24],
    ['19 4 * * 1', 24 * 7],
    ['*/5 * * * *', null],      // po minutách: neumíme, a je lepší to přiznat
    ['0 4 1 * *', null],        // jen prvního v měsíci
    ['nesmysl', null], ['', null],
  ];
  const spatne = T.filter(([c, ceka]) => periodaHodin(c) !== ceka)
    .map(([c, ceka]) => `${c} → ${periodaHodin(c)}, čekalo se ${ceka}`);
  pravda(`perioda se čte z cronu správně (${T.length} tvarů)`, spatne.length === 0,
    spatne.join('; '));
}

/* ---- 2) tabulka verdiktů --------------------------------------- */
{
  const V = [
    ['čerstvý běh je v pořádku',
      { jmeno: 'A', stav: 'active', vekHodin: 3, perioda: 6 }, 'dobre', 'jede'],
    [`na stropu (${NASOBEK}× perioda) se ještě promíjí`,
      { jmeno: 'A', stav: 'active', vekHodin: 12, perioda: 6 }, 'dobre', 'jede'],
    ['nad stropem je to vada, a řekne se o kolik',
      { jmeno: 'A', stav: 'active', vekHodin: 13, perioda: 6 }, 'vada', '13 h'],
    ['vypnutá ručně je vada',
      { jmeno: 'A', stav: 'disabled_manually', vekHodin: 1, perioda: 6 }, 'vada', 'nehlídá tedy nic'],
    ['vypnutá pro nečinnost je vada A VYSVĚTLÍ SE PROČ',
      { jmeno: 'A', stav: 'disabled_inactivity', vekHodin: 1, perioda: 6 }, 'vada', '60 dnech'],
    ['vypnutá úloha je vada i při čerstvém běhu',
      { jmeno: 'A', stav: 'disabled_manually', vekHodin: 0, perioda: 6 }, 'vada', 'nehlídá'],
    ['neznámý tvar plánu je NEZMĚŘENO, ne „v pořádku"',
      { jmeno: 'A', stav: 'active', vekHodin: 1, perioda: null }, 'nevim', 'periodu neumím'],
    ['neznámý čas posledního běhu je NEZMĚŘENO',
      { jmeno: 'A', stav: 'active', vekHodin: null, perioda: 6 }, 'nevim', 'naposledy'],
  ];
  for (const [popis, stav, druh, uryvek] of V) {
    const v = nalezUlohy(stav);
    pravda(popis, !!v[druh] && v[druh].includes(uryvek), JSON.stringify(v));
  }
}

/* ---- 3) seznam úloh se čte ze souborů, ne z kódu ---------------- */
{
  const u = planovaneUlohy(path.join(KOREN, '.github', 'workflows'));
  pravda(`plánované úlohy se našly v repozitáři (${u.length})`, u.length >= 4,
    JSON.stringify(u.map((x) => x.soubor)));
  pravda('a každá z nich má spočítanou periodu',
    u.every((x) => x.perioda !== null),
    'bez periody: ' + u.filter((x) => x.perioda === null).map((x) => x.soubor).join(', '));
  pravda('robot dat i kontrola nasazení jsou mezi nimi se šestihodinovou periodou',
    u.some((x) => /update-data/.test(x.soubor) && x.perioda === 6)
    && u.some((x) => /kontrola-nasazeni/.test(x.soubor) && x.perioda === 6),
    JSON.stringify(u.map((x) => [x.soubor, x.perioda])));
}

/* ---- 4) a celý skript proti falešnému API ---------------------- */
{
  const PORT = 8422;
  /* Falešné API vrací tolik úloh, kolik jich v repozitáři je, aby se
     měřilo na skutečném seznamu — ne na vymyšleném. */
  const skutecne = planovaneUlohy(path.join(KOREN, '.github', 'workflows'));
  let stavy = {};        // soubor → stav
  let vekHodin = 1;      // jak starý běh API nabídne
  const api = http.createServer((req, res) => {
    if (/\/actions\/workflows\?/.test(req.url)) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        workflows: skutecne.map((u, i) => ({
          id: 100 + i, name: u.soubor, path: u.soubor, state: stavy[u.soubor] || 'active',
        })),
      }));
      return;
    }
    if (/\/runs\?/.test(req.url)) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ workflow_runs: [{
        updated_at: new Date(Date.now() - vekHodin * 3600000).toISOString(),
      }] }));
      return;
    }
    res.writeHead(404); res.end('ne');
  });
  await new Promise((r) => api.listen(PORT, '127.0.0.1', r));
  const prostredi = {
    PK_GITHUB_API: `http://127.0.0.1:${PORT}`,
    GITHUB_REPOSITORY: 'nekdo/nemovitosti',
    GITHUB_TOKEN: 'falesny-token',
  };
  const spust = (navic = {}) => new Promise((hotovo) => {
    const d = spawn(process.execPath, ['scripts/kontrola-uloh.mjs'],
      { cwd: KOREN, env: { ...process.env, ...prostredi, ...navic } });
    let text = '';
    d.stdout.setEncoding('utf8');
    d.stderr.setEncoding('utf8');
    d.stdout.on('data', (b) => { text += b; });
    d.stderr.on('data', (b) => { text += b; });
    const utni = setTimeout(() => d.kill('SIGKILL'), 60000);
    d.on('close', (kod) => { clearTimeout(utni); hotovo({ kod, text }); });
  });

  stavy = {}; vekHodin = 1;
  const a = await spust();
  pravda('když všechny úlohy jedou, kontrola projde a vypíše je',
    a.kod === 0 && (a.text.match(/✓/g) || []).length === skutecne.length,
    `kód ${a.kod}; ${a.text.trim().split('\n').slice(-3).join(' / ')}`);

  stavy = { '.github/workflows/update-data.yml': 'disabled_inactivity' };
  const b = await spust();
  pravda('vypnutý robot dat je nález, a stojí v něm proč',
    b.kod === 1 && /disabled_inactivity/.test(b.text) && /60 dnech/.test(b.text),
    `kód ${b.kod}; ${b.text.split('\n').filter((r) => /✕/.test(r)).join(' | ')}`);

  stavy = {}; vekHodin = 100;
  const c = await spust();
  pravda('zaspalá úloha (100 h bez běhu) je nález u všech pěti',
    c.kod === 1 && (c.text.match(/✕/g) || []).length >= skutecne.length,
    `kód ${c.kod}; ✕ ${(c.text.match(/✕/g) || []).length}×`);

  stavy = {}; vekHodin = 1;
  const d2 = await spust({ GITHUB_TOKEN: '' });
  pravda('bez tokenu se nezměří nic — a to je vada, ne klid',
    d2.kod === 1 && /nezměřilo se nic/.test(d2.text),
    `kód ${d2.kod}; ${d2.text.trim().split('\n').slice(-3).join(' / ')}`);

  const e = await spust({ PK_GITHUB_API: 'https://zly.example' });
  pravda('přesměrování API na cizí stroj se odmítne',
    e.kod === 1 && /jen na.*tenhle stroj/s.test(e.text),
    `kód ${e.kod}; ${e.text.trim().split('\n').slice(-2).join(' / ')}`);
  api.close();
}

console.log('\nKontrola plánovaných úloh');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Plánované úlohy: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
