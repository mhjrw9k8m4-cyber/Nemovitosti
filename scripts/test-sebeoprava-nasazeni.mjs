/* Test: sebeoprava nasazení se rozhoduje podle tabulky, ne podle nálady
   ==================================================================
   Spuštění: node scripts/test-sebeoprava-nasazeni.mjs

   PROČ. Je to jediné místo v repozitáři, které smí samo vyvolat úlohu
   v CI. U takové věci nestačí, že „to vypadá dobře": musí být vidět
   KAŽDÝ stav, ve kterém nejedná, a musí být dokázané, že bez
   `--opravdu` neodejde vůbec nic.

   Rozhodnutí je čistá funkce, takže se měří tabulkou. Zbytek (že se
   bez `--opravdu` nic neposílá a že se na nasimulovaném stavu naostro
   nejedná) se měří spuštěním skriptu.
   ================================================================== */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { rozhodni, TICHO_MINUT, VYPINAC, ROBOT } from './sebeoprava-nasazeni.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- tabulka stavů ---------------------------------------------- */
/* [popis, stav, čekaná akce, úryvek, který musí být v důvodu] */
const STAVY = [
  ['bez nálezů se nejedná',
    { kody: [], robotBezelMinut: 999 }, 'nic', 'není stará data'],
  ['cizí nález neznamená opravu',
    { kody: ['neco-jineho'], robotBezelMinut: 999 }, 'nic', 'není stará data'],
  ['vypínač přebije i platný nález',
    { kody: ['stara-data'], vypnuto: true, robotBezelMinut: 999 }, 'nic', VYPINAC],
  ['běžící robot se nepouští podruhé',
    { kody: ['stara-data'], robotBezi: true, robotBezelMinut: 999 }, 'nic', 'právě běží'],
  ['neznámý čas posledního běhu = nejednat, a nahlas',
    { kody: ['stara-data'], robotBezelMinut: null }, 'nic', 'hádat se nemá'],
  ['nečitelný čas posledního běhu = totéž',
    { kody: ['stara-data'], robotBezelMinut: NaN }, 'nic', 'hádat se nemá'],
  ['robot právě dojel a data jsou přesto stará → vada NASAZENÍ, ne robota',
    { kody: ['stara-data'], robotBezelMinut: 10 }, 'nic', 'nasazení'],
  [`těsně pod stropem (${TICHO_MINUT - 1} min) se ještě nejedná`,
    { kody: ['stara-data'], robotBezelMinut: TICHO_MINUT - 1 }, 'nic', 'nasazení'],
  [`na stropu (${TICHO_MINUT} min) se už jedná`,
    { kody: ['stara-data'], robotBezelMinut: TICHO_MINUT }, 'pustit-robota', 'pouští se jednou'],
  ['stará data a dávno neběžel → pustit',
    { kody: ['stara-data'], robotBezelMinut: 400 }, 'pustit-robota', 'pouští se jednou'],
  ['stará data vedle jiných vad → pořád pustit',
    { kody: ['csp', 'stara-data'], robotBezelMinut: 400 }, 'pustit-robota', 'pouští se jednou'],
  ['prázdný vstup nespadne a nejedná',
    undefined, 'nic', 'není stará data'],
];
for (const [popis, stav, cekanaAkce, uryvek] of STAVY) {
  let v = null, pad = '';
  try { v = rozhodni(stav); } catch (e) { pad = String(e.message || e); }
  pravda(popis, !!v && v.akce === cekanaAkce && v.duvod.includes(uryvek),
    pad ? `spadlo: ${pad}` : `vyšlo ${v && v.akce} — „${v && v.duvod}"`);
}
/* Pojistka proti tomu, že by někdo tabulku „spravil" tím, že povolí vše. */
pravda('v tabulce je aspoň jeden stav, kdy se JEDNÁ, a aspoň pět, kdy ne',
  STAVY.filter((s) => s[2] === 'pustit-robota').length >= 1
  && STAVY.filter((s) => s[2] === 'nic').length >= 5);

/* ---- a teď spuštěním: bez --opravdu nesmí odejít nic ------------- */
function spust(args, prostredi = {}) {
  return new Promise((hotovo) => {
    const d = spawn(process.execPath, ['scripts/sebeoprava-nasazeni.mjs', ...args],
      { cwd: KOREN, env: { ...process.env, ...prostredi } });
    let text = '';
    d.stdout.setEncoding('utf8');
    d.stderr.setEncoding('utf8');
    d.stdout.on('data', (b) => { text += b; });
    d.stderr.on('data', (b) => { text += b; });
    const utni = setTimeout(() => d.kill('SIGKILL'), 60000);
    d.on('close', (kod) => { clearTimeout(utni); hotovo({ kod, text }); });
  });
}
const adr = mkdtempSync(path.join(tmpdir(), 'sebeoprava-'));
const souborNalezu = path.join(adr, 'nalezy.json');
writeFileSync(souborNalezu, JSON.stringify({ kody: ['stara-data'] }));

{
  /* Nasimulovaný stav, při kterém by se jednalo — a přesto nesmí nic odejít.
     GITHUB_TOKEN se schválně vyprazdňuje: ani omylem se nemá kam ozvat. */
  const v = await spust(['--nalezy', souborNalezu, '--zkouska-robot', '400'],
    { GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' });
  pravda('bez --opravdu se rozhodne „pustit", ale neposílá se nic',
    v.kod === 0 && v.text.includes('pustit-robota') && v.text.includes('nic neposílá'),
    `kód ${v.kod}; výpis: ${v.text.trim().split('\n').slice(-3).join(' / ')}`);
}
{
  const v = await spust(['--nalezy', souborNalezu, '--zkouska-robot', '400', '--opravdu'],
    { GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' });
  pravda('nasimulovaný stav dohromady s --opravdu se ODMÍTNE',
    v.kod === 1 && v.text.includes('nasimulovaném stavu se naostro nejedná'),
    `kód ${v.kod}; výpis: ${v.text.trim().split('\n').slice(-2).join(' / ')}`);
}
{
  /* Chybějící soubor nálezů nesmí vypadat jako „nic k opravě" tiše —
     musí být vidět, že se nálezy nepřečetly. */
  const v = await spust(['--nalezy', path.join(adr, 'tenhle-neni.json'), '--zkouska-robot', '400'],
    { GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' });
  pravda('chybějící soubor nálezů se přizná a nejedná se',
    v.kod === 0 && /není/.test(v.text) && v.text.includes('rozhodnutí: nic'),
    `kód ${v.kod}; výpis: ${v.text.trim().split('\n').slice(-3).join(' / ')}`);
}
{
  /* Rozbitý JSON taky. */
  const spatny = path.join(adr, 'spatny.json');
  writeFileSync(spatny, '{tohle není json');
  const v = await spust(['--nalezy', spatny, '--zkouska-robot', '400'],
    { GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' });
  pravda('rozbitý soubor nálezů se přizná a nejedná se',
    v.kod === 0 && /není platný JSON/.test(v.text) && v.text.includes('rozhodnutí: nic'),
    `kód ${v.kod}; výpis: ${v.text.trim().split('\n').slice(-3).join(' / ')}`);
}

/* ---- a TA JEDNA ŘÁDKA, KTERÁ OPRAVU OPRAVDU PROVEDE ------------- */
/* Celý řetěz sebeopravy nasazení se dal změřit bez sítě — až na jedno
   místo: POST na …/dispatches. Ta jediná řádka tedy byla jediná
   nevyzkoušená, a zrovna ona tu opravu dělá. Měří se proti FALEŠNÉMU
   API na tomhle stroji (PK_GITHUB_API); kam jinam než na tenhle stroj
   to přesměrovat nejde, aby se nedala hlavička s tokenem odklonit. */
{
  const PORT = 8420;
  const prijate = [];
  let odpovedNaDispatch = 204;
  const api = http.createServer((req, res) => {
    let telo = '';
    req.on('data', (k) => { telo += k; });
    req.on('end', () => {
      prijate.push({ metoda: req.method, cesta: req.url, hlavicky: req.headers, telo });
      if (/\/runs\?/.test(req.url)) {
        /* Robot dojel dávno → rozhodnutí musí být „pustit". */
        const kdy = new Date(Date.now() - 400 * 60000).toISOString();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ workflow_runs: [{ status: 'completed', updated_at: kdy }] }));
        return;
      }
      if (/\/dispatches$/.test(req.url)) {
        res.writeHead(odpovedNaDispatch, odpovedNaDispatch === 204 ? {} : { 'content-type': 'text/plain' });
        res.end(odpovedNaDispatch === 204 ? undefined : 'nemáš právo');
        return;
      }
      res.writeHead(404); res.end('ne');
    });
  });
  await new Promise((r) => api.listen(PORT, '127.0.0.1', r));
  const prostredi = {
    PK_GITHUB_API: `http://127.0.0.1:${PORT}`,
    GITHUB_REPOSITORY: 'nekdo/nemovitosti',
    GITHUB_TOKEN: 'falesny-token',
    GITHUB_REF_NAME: 'nejaka-vetev',
  };

  const v = await spust(['--nalezy', souborNalezu, '--opravdu'], prostredi);
  const dispatch = prijate.find((p2) => /\/dispatches$/.test(p2.cesta));
  pravda('oprava se opravdu odešle — a je to POST na dispatches robota dat',
    !!dispatch && dispatch.metoda === 'POST'
      && dispatch.cesta === `/repos/nekdo/nemovitosti/actions/workflows/${ROBOT}/dispatches`,
    `přijato: ${JSON.stringify(prijate.map((p2) => p2.metoda + ' ' + p2.cesta))}`);
  pravda('v těle jde větev, nad kterou se má robot pustit',
    !!dispatch && JSON.parse(dispatch.telo || '{}').ref === 'nejaka-vetev',
    `tělo: ${dispatch ? dispatch.telo : '(nic)'}`);
  pravda('a požadavek nese token, verzi API i vlastní jméno',
    !!dispatch && dispatch.hlavicky.authorization === 'Bearer falesny-token'
      && dispatch.hlavicky['x-github-api-version'] === '2022-11-28'
      && /parcelaka/.test(dispatch.hlavicky['user-agent'] || '')
      && /application\/json/.test(dispatch.hlavicky['content-type'] || ''),
    `hlavičky: ${dispatch ? JSON.stringify(dispatch.hlavicky) : '(nic)'}`);
  pravda('stav robota se čte z API (a dávný běh znamená „pustit")',
    v.kod === 0 && /PUŠTĚNO/.test(v.text) && /400 min/.test(v.text),
    `kód ${v.kod}; ${v.text.trim().split('\n').slice(-3).join(' / ')}`);

  /* A DRUHÁ POLOVINA: nepovedené spuštění se NESMÍ spolknout, jinak by
     to vypadalo, že se oprava provedla — a úkol pro člověka by chyběl. */
  prijate.length = 0;
  odpovedNaDispatch = 403;
  const z = await spust(['--nalezy', souborNalezu, '--opravdu'], prostredi);
  pravda('nepovedené spuštění je chyba, ne tiché „hotovo"',
    z.kod === 1 && /nepodařilo pustit/.test(z.text) && /403/.test(z.text),
    `kód ${z.kod}; ${z.text.trim().split('\n').slice(-2).join(' / ')}`);

  /* A pojistka na samotné přesměrování: cizí adresa se odmítne. */
  const c = await spust(['--nalezy', souborNalezu], { ...prostredi, PK_GITHUB_API: 'https://zly.example' });
  pravda('přesměrování API na cizí stroj se odmítne (token se nikam neodkloní)',
    c.kod === 1 && /jen na.*tenhle stroj/s.test(c.text),
    `kód ${c.kod}; ${c.text.trim().split('\n').slice(-2).join(' / ')}`);
  api.close();
}

/* ---- a že se pouští opravdu jen robot dat ----------------------- */
pravda('vyvolat se dá jedině robot dat', ROBOT === 'update-data.yml', `je to ${ROBOT}`);

console.log('\nSebeoprava nasazení');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Sebeoprava nasazení: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
