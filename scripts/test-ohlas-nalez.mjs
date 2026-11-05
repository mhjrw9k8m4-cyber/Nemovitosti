/* Test: hlásič nálezu zkoušení portálů.
   ==================================================================
   Spuštění: node scripts/test-ohlas-nalez.mjs   (bez sítě i prohlížeče)

   PROČ VZNIKL. Bot zkoušení portálů běžel 4. a 5. 11., našel cesty,
   se kterými se dalo něco udělat — a nedozvěděl se o nich nikdo:
   úloha skončila ZELENĚ a zelená tečka v Actions znamená „nic
   k řešení". Repozitář měl hlásič SELHÁNÍ a chyběl mu ten druhý
   konec: hlásič ÚSPĚCHU, který na někoho čeká (oddíl 430).

   Hlásič musí platit ve třech nepříjemných případech:
     · nic nového → NESMÍ zakládat úkol (jinak je z toho každé pondělí
       tentýž úkol a člověk ho přestane otevírat),
     · úkol už je otevřený → komentář, ne další úkol,
     · GitHub neodpovídá → nesmí shodit úlohu, která dobře doběhla,
       ale NESMÍ MLČET.
   GitHub se tu PŘEDSTÍRÁ vlastním serverem; žádný úkol nikde nevzniká.
   ================================================================== */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { volnyPort } from './port-zkousky.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* NÁLEZ JE SKUTEČNÝ TVAR z běhu 42016638323 (Ministerstvo obrany),
   jen zkrácený — kdyby se tvar nálezu změnil, má to padnout tady. */
const NALEZ_S_NOVYM = {
  updated: '2026-11-05',
  portaly: [],
  noveOdMinule: [
    { host: 'onnm.mo.gov.cz', jmeno: 'Ministerstvo obrany — nepotřebný majetek',
      adresa: 'https://onnm.mo.gov.cz/nemovity-majetek/aktualni-nabidka',
      cesta: 'adresa z RSS', verdikt: 'ke čtení',
      proc: 'není strojový tvar (HTML), ale mluví o pozemcích i o převodu'
        + ' — nabídky tu jsou, chybí předpis pro čtení',
      nabidek: 0, coSTim: 'napsat předpis pro čtení HTML',
      znaky: { titulek: 'Aktuální nabídka nemovitého majetku', znaku: 4821,
        pocty: { cena: 12, 'výměra': 12, katastr: 9 },
        ukazka: 'Výběrové řízení na prodej nepotřebného nemovitého majetku' } },
    { host: 'edesky.cz', jmeno: 'eDesky', adresa: 'https://edesky.cz/api/v1/documents',
      cesta: 'vstupní adresa', verdikt: 'chce klíč', proc: 'HTTP 401', nabidek: 0,
      coSTim: 'zařídit účet a klíč (jen majitel) a dát ho do GitHub Secrets' },
  ],
};
const NALEZ_BEZ_NOVEHO = { updated: '2026-11-12', portaly: [], noveOdMinule: [] };

const docasne = mkdtempSync(path.join(tmpdir(), 'nalez-'));
const souborSNovym = path.join(docasne, 's-novym.json');
const souborBezNoveho = path.join(docasne, 'bez-noveho.json');
writeFileSync(souborSNovym, JSON.stringify(NALEZ_S_NOVYM));
writeFileSync(souborBezNoveho, JSON.stringify(NALEZ_BEZ_NOVEHO));

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
        return vrat(200, [{ number: 11, body: 'něco\n<!-- ohlas-nalez:zkouseni-portalu -->\ndál' }]);
      }
      return vrat(200, stav === 'jiny-ukol' ? [{ number: 3, body: 'cizí úkol bez značky' }] : []);
    }
    if (req.method === 'POST' && /\/issues\/\d+\/comments$/.test(req.url)) {
      zapsano.push({ druh: 'komentar', url: req.url, telo });
      return vrat(201, { id: 1 });
    }
    if (req.method === 'POST' && req.url.endsWith('/issues')) {
      zapsano.push({ druh: 'novy-ukol', telo });
      return stav === 'zaklad-selze' ? vrat(403, { message: 'Resource not accessible' }) : vrat(201, { number: 77 });
    }
    vrat(404, {});
  });
});
const PORT = await volnyPort();
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

function pust(rezim, prepis) {
  stav = rezim; zapsano.length = 0;
  return new Promise((hotovo) => {
    const p = spawn('node', [path.join(KOREN, 'scripts', 'ohlas-nalez.mjs')], {
      cwd: KOREN,
      env: {
        ...process.env,
        GH_API: `http://127.0.0.1:${PORT}`,
        GH_TOKEN: 'zkusebni', REPO: 'nekdo/neco',
        BEH: 'https://priklad/run/9',
        NALEZ: souborSNovym,
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

console.log('\nHlásič nálezu zkoušení portálů');

/* ---- 1) poprvé: založí jeden úkol a napíše, co s tím ------------ */
{
  const { out, kod, zapsano: z } = await pust('bez-ukolu');
  const novy = z.find((x) => x.druh === 'novy-ukol');
  pravda('poprvé založí úkol', !!novy && z.length === 1, JSON.stringify(z.map((x) => x.druh)));
  const j = novy ? JSON.parse(novy.telo) : {};
  pravda('v názvu je, kolik cest je nových', /2 nových cest/.test(j.title || ''), j.title);
  pravda('v těle je skrytá značka (podle ní se úkol najde příště)',
    /<!-- ohlas-nalez:zkouseni-portalu -->/.test(j.body || ''), (j.body || '').slice(0, 80));
  pravda('u každé cesty stojí verdikt i adresa',
    /ke čtení/.test(j.body || '') && /chce klíč/.test(j.body || '')
    && /onnm\.mo\.gov\.cz\/nemovity-majetek\/aktualni-nabidka/.test(j.body || ''),
    (j.body || '').slice(0, 300));
  pravda('a hlavně CO S TÍM', /napsat předpis pro čtení HTML/.test(j.body || '')
    && /zařídit účet a klíč/.test(j.body || ''), (j.body || '').slice(0, 400));
  /* Měření ze stránky patří do úkolu: bez něj si ten, kdo předpis píše,
     musí stránku stáhnout znovu — a z vývojového stroje to nejde. */
  pravda('i to, co se na stránce naměřilo',
    /Aktuální nabídka nemovitého majetku/.test(j.body || '')
    && /cena 12×/.test(j.body || ''), (j.body || '').slice(0, 500));
  pravda('a odkaz na běh', /priklad\/run\/9/.test(j.body || ''));
  /* ŽÁDNÝ ZDROJ SE TÍM NEZAPOJIL — a musí to tam stát, aby si to nikdo
     nespletl s hotovou prací. */
  pravda('a výslovně, že se tím nic nezapojilo',
    /Žádný zdroj se tím nezapojil/.test(j.body || ''));
  pravda('skončí nulou', kod === 0, 'kód ' + kod);
  pravda('a řekne, co udělal', /Založen úkol #77/.test(out), out.trim());
}

/* ---- 2) nic nového: úkol se NEZAKLÁDÁ -------------------------- */
/* Tohle je ta nejdůležitější kontrola celého hlásiče. Akceschopné
   cesty se po každém běhu opakují; hlásit je celé by znamenalo každé
   pondělí tentýž úkol — a opakovaný úkol se přestane otevírat, čímž
   by se zrušil smysl hlášení. */
{
  const { out, kod, zapsano: z } = await pust('bez-ukolu', { NALEZ: souborBezNoveho });
  pravda('bez nového nálezu se nezakládá nic', z.length === 0, JSON.stringify(z.map((x) => x.druh)));
  pravda('a je napsané proč', /Nic nového proti minulému nálezu/.test(out), out.trim());
  pravda('a skončí nulou (mlčení o ničem není selhání)', kod === 0, 'kód ' + kod);
}

/* ---- 3) úkol už je otevřený: komentář, ne další úkol ----------- */
{
  const { out, zapsano: z } = await pust('ukol-otevreny');
  pravda('existující úkol dostane komentář', z.some((x) => x.druh === 'komentar'),
    JSON.stringify(z.map((x) => x.druh)));
  pravda('a žádný nový úkol nevznikne', !z.some((x) => x.druh === 'novy-ukol'),
    JSON.stringify(z.map((x) => x.druh)));
  pravda('a řekne se to i na výpisu', /#11/.test(out), out.trim());
}

/* ---- 4) cizí úkol bez značky se nespočítá za náš -------------- */
{
  const { zapsano: z } = await pust('jiny-ukol');
  pravda('cizí otevřený úkol hlásič nepřebije a založí vlastní',
    z.some((x) => x.druh === 'novy-ukol'), JSON.stringify(z.map((x) => x.druh)));
}

/* ---- 5) GitHub mlčí: nespadne, ale nemlčí --------------------- */
{
  const { out, kod } = await pust('github-mlci');
  pravda('když GitHub neodpoví, hlásič nespadne', kod === 0, 'kód ' + kod);
  pravda('ale napíše varování', /::warning::ohlas-nalez/.test(out), out.trim());
}

/* ---- 6) založení odmítnuto: taky se to pozná ------------------ */
{
  const { out, kod } = await pust('zaklad-selze');
  pravda('odmítnuté založení neshodí úlohu', kod === 0, 'kód ' + kod);
  pravda('a je o něm varování se stavem', /::warning::úkol se nepovedlo založit \(403\)/.test(out), out.trim());
}

/* ---- 7) chybějící nález i proměnné: mlčet se nesmí ------------ */
{
  const { out, kod } = await pust('bez-ukolu', { NALEZ: path.join(docasne, 'neexistuje.json') });
  pravda('chybějící soubor s nálezem je varování, ne pád', kod === 0 && /::warning::ohlas-nalez: nález/.test(out), out.trim());
  const b = await pust('bez-ukolu', { GH_TOKEN: '' });
  pravda('a chybějící token taky', b.kod === 0 && /::warning::ohlas-nalez: chybí GH_TOKEN/.test(b.out), b.out.trim());
}

/* ---- 8) CELÝ ŘETĚZ, NE JEN HLÁSIČ ----------------------------
 *
 * Hlásič může být bez vady a přesto se nikdo nic nedozví: stačí, aby
 * bot „nové" do nálezu nezapsal, nebo aby úloha hlásič nezavolala.
 * To je slepota z §423 — hlídač měří nástroj, ne jeho použití.
 * Měří se proto i obě spojky.
 */
{
  const bot = readFileSync(path.join(KOREN, 'scripts', 'zkus-portal.mjs'), 'utf8');
  pravda('bot zapisuje „nové od minule" do nálezu',
    /noveOdMinule:\s*nove/.test(bot) && /noveProtiMinule\(stary,/.test(bot),
    'v scripts/zkus-portal.mjs chybí zápis noveOdMinule');
  const uloha = readFileSync(path.join(KOREN, '.github', 'workflows', 'zkouseni-portalu.yml'), 'utf8');
  pravda('a úloha hlásič opravdu volá, a to při úspěchu',
    /ohlas-nalez/.test(uloha) && /if:\s*success\(\)/.test(uloha),
    'v .github/workflows/zkouseni-portalu.yml chybí krok „Ohlásit nález"');
  const akce = readFileSync(path.join(KOREN, '.github', 'actions', 'ohlas-nalez', 'action.yml'), 'utf8');
  pravda('a akce posílá vše proměnnými prostředí, nic do příkazu',
    /env:/.test(akce) && /node scripts\/ohlas-nalez\.mjs/.test(akce) && !/\$\{\{[^}]*\}\}\s*$/m.test(akce.split('run:')[1] || ''),
    akce.slice(-200));
}

server.close();
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) {
  console.log(pricinaChyb('Hlásič nálezu', zpravy));
  process.exit(1);
}
