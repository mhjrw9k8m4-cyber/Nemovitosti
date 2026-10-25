/* Test: kontrola nasazeného webu pozná, že venku NENÍ to, co má být.
   ==================================================================
   Spuštění: node scripts/test-kontrola-nasazeni.mjs

   Kontrola nasazení je jediný hlídač, který se nekouká do repozitáře,
   ale na ostrý web — a proto se o ni nedá opřít, dokud se nevyzkouší,
   že opravdu PADNE. Hlídač, který svítí zeleně na rozbitý web, je
   horší než žádný: tvrdí, že je po kontrole.

   Měří se na podstrčeném webu (vlastní server na 8413), který servíruje
   skutečné soubory z repozitáře — a v jednotlivých případech je
   schválně kazí: starší razítko, chybějící odchytávač chyb, stará data,
   „měkká" 404, osekaná sitemap, nedostupný web.
   ================================================================== */
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const TYPY = { '.html': 'text/html; charset=utf-8', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain', '.css': 'text/css', '.js': 'text/javascript' };

let rezim = 'vse-dobre';
const server = http.createServer((req, res) => {
  const cesta = decodeURIComponent(req.url.split('?')[0]);
  const rel = cesta === '/' ? 'index.html' : cesta.replace(/^\//, '');
  const f = path.join(KOREN, rel);
  const posli = (kod, telo, typ) => {
    res.writeHead(kod, { 'content-type': typ || 'text/html; charset=utf-8' });
    res.end(telo);
  };
  if (!f.startsWith(KOREN) || !existsSync(f) || statSync(f).isDirectory()) {
    /* „Měkká" 404: stránka s textem o nenalezení, ale se stavem 200. */
    return rezim === 'mekka-404' ? posli(200, '<html lang="cs"><body>Nenalezeno') : posli(404, 'nenalezeno');
  }
  let telo = readFileSync(f);
  if (rel === 'index.html') {
    let h = telo.toString('utf8');
    if (rezim === 'stare-nasazeni') h = h.replace(/(js\/min\/menu\.js\?v=)[a-f0-9]+/, '$1deadbeef');
    if (rezim === 'bez-hlasice') h = h.replace(/<script data-pk="hlasic-chyb">[\s\S]*?<\/script>\n?/, '');
    if (rezim === 'bez-csp') h = h.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '');
    return posli(200, h);
  }
  if (rel === 'data/index.json' && rezim === 'stara-data') {
    const j = JSON.parse(telo.toString('utf8'));
    j.updated_at = new Date(Date.now() - 1000 * 3600 * 90).toISOString();
    j.updated = j.updated_at.slice(0, 10);
    return posli(200, JSON.stringify(j), 'application/json');
  }
  if (rel === 'sitemap.xml' && rezim === 'osekana-sitemap') {
    const x = telo.toString('utf8').split('<url>').slice(0, 5).join('<url>') + '</urlset>';
    return posli(200, x, 'application/xml');
  }
  posli(200, telo, TYPY[path.extname(f)]);
});
await new Promise((r) => server.listen(8414, r));

function pust(m, dalsi) {
  rezim = m;
  return new Promise((hotovo) => {
    const p = spawn('node', [path.join(KOREN, 'scripts', 'kontrola-nasazeni.mjs'), ...(dalsi || [])],
      { cwd: KOREN, env: { ...process.env, PK_WEB: 'http://127.0.0.1:8414' } });
    let out = '';
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (kod) => hotovo({ out, kod }));
  });
}

/* ---- 1) zdravý web projde a NEMLČÍ o tom, co ověřil -------------- */
{
  const { out, kod } = await pust('vse-dobre');
  pravda('na zdravém webu nehlásí vady a končí úspěchem',
    kod === 0 && /venku je to, co má být/.test(out),
    out.split('\n').filter((l) => /✕/.test(l)).join(' | ') || `kód ${kod}`);
  pravda('a potvrdí, že venku je přesně naše verze (razítka ?v=)',
    /venku je přesně naše verze/.test(out), out.slice(0, 200));
  pravda('potvrdí odchytávač chyb i CSP',
    /odchytávač chyb z hlavičky je venku/.test(out) && /hlavička CSP je venku/.test(out));
  pravda('potvrdí svěžest dat, mapu webu i generovanou stránku',
    /nasazená data jsou svěží/.test(out) && /mapa webu má \d+ adres/.test(out)
    && /generovaná stránka pozemku odpovídá/.test(out), out.slice(0, 400));
  pravda('a že neznámá adresa vrací 404', /neznámá adresa vrací 404/.test(out));
}

/* ---- 2) každý rozbitý stav musí být VADA ------------------------- */
{
  const p = async (popis, m, cast, dalsi) => {
    const { out, kod } = await pust(m, dalsi);
    pravda(popis, kod === 1 && new RegExp(cast).test(out),
      `kód ${kod}; vady: ${out.split('\n').filter((l) => /✕/.test(l)).join(' | ') || '(žádné)'}`);
  };
  await p('starší nasazení pozná podle razítka — a řekne obě hodnoty',
    'stare-nasazeni', 'venku je starší verze[\\s\\S]*deadbeef');
  await p('chybějící odchytávač chyb je vada, ne drobnost',
    'bez-hlasice', 'odchytávač chyb — v nasazené stránce není');
  await p('chybějící hlavička CSP je vada', 'bez-csp', 'hlavička CSP — v nasazené stránce není');
  await p('stará data pozná a napíše, jak stará',
    'stara-data', 'nasazená data jsou \\d+ h stará');
  await p('„měkkou" 404 (stav 200) pozná', 'mekka-404', 'vrací 200 místo 404');
  await p('osekanou mapu webu pozná', 'osekana-sitemap', 'je v ní jen \\d+ adres');
}

/* ---- 3) A TO NEJDŮLEŽITĚJŠÍ: nedostupný web není „v pořádku" ----- */
{
  rezim = 'vse-dobre';
  const p = spawn('node', [path.join(KOREN, 'scripts', 'kontrola-nasazeni.mjs')],
    { cwd: KOREN, env: { ...process.env, PK_WEB: 'http://127.0.0.1:9' } });
  let out = '';
  p.stdout.setEncoding('utf8');
  p.stderr.setEncoding('utf8');
  p.stdout.on('data', (d) => { out += d; });
  const kod = await new Promise((h) => p.on('close', h));
  pravda('nedostupný web je VADA, ne „nezměřeno"',
    kod === 1 && /úvodní stránka — nešla stáhnout/.test(out) && /NENÍ to, co má být/.test(out),
    `kód ${kod}; ${out.split('\n').filter((l) => /✕|VERDIKT/.test(l)).slice(0, 3).join(' | ')}`);
}

/* ---- 4) strop na stáří dat se dá posunout, ale ne vypnout -------- */
{
  const { out, kod } = await pust('stara-data', ['--data-stare-hodin', '200']);
  pravda('povolenější strop stará data pustí (90 h < 200 h)',
    kod === 0 && /nasazená data jsou svěží \(\d+ h/.test(out),
    `kód ${kod}; ${out.split('\n').filter((l) => /data/.test(l)).join(' | ')}`);
  const b = await pust('stara-data', ['--data-stare-hodin', '0']);
  pravda('a nula se nebere jako „nekontrolovat" (strop je aspoň hodina)',
    b.kod === 1, `kód ${b.kod}`);
}

/* ---- 5) strojově čitelný výstup: kód, podle kterého se opravuje -- */
/* Sebeoprava nasazení se rozhoduje podle KÓDU, ne podle textu. Kdyby
   kód u starých dat zmizel (třeba při přepisu formulace), oprava by
   tiše přestala fungovat a nikomu by nic nesvítilo. */
{
  const soubor = path.join(mkdtempSync(path.join(tmpdir(), 'nasazeni-')), 'nalezy.json');
  const { kod } = await pust('stara-data', ['--vystup', soubor]);
  let j = null;
  try { j = JSON.parse(readFileSync(soubor, 'utf8')); } catch (e) { j = null; }
  pravda('u starých dat napíše strojový kód stara-data',
    kod === 1 && !!j && Array.isArray(j.kody) && j.kody.includes('stara-data'),
    `kód ${kod}; kody=${j ? JSON.stringify(j.kody) : '(soubor se nepřečetl)'}`);

  const soubor2 = path.join(mkdtempSync(path.join(tmpdir(), 'nasazeni-')), 'nalezy.json');
  const b = await pust('bez-csp', ['--vystup', soubor2]);
  let j2 = null;
  try { j2 = JSON.parse(readFileSync(soubor2, 'utf8')); } catch (e) { j2 = null; }
  /* A TOHLE JE TA DRUHÁ POLOVINA: nález, na který oprava NENÍ, kód
     dostat nesmí — jinak by se stroj pokusil spravit něco, co spravit
     neumí. Chybějící CSP je vada webu, ne práce pro robota dat. */
  pravda('nález, na který oprava není, zůstane bez kódu',
    b.kod === 1 && !!j2 && Array.isArray(j2.kody) && j2.kody.length === 0 && j2.vady.length > 0,
    `kód ${b.kod}; kody=${j2 ? JSON.stringify(j2.kody) : '(soubor se nepřečetl)'}`);
}

server.close();
console.log('\nKontrola nasazeného webu');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Kontrola nasazení: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
