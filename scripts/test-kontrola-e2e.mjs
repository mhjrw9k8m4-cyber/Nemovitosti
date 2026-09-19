// Test celé pravidelné kontroly — od načtení inzerátů po zápis výsledků.
//
// Proti čemu: proti zkušebnímu serveru (scripts/test-server.mjs), který
// předstírá Supabase i cizí weby. Jeden odkaz na něm dvakrát po sobě shodí
// spojení a teprve potřetí odpoví — tím se ověří to podstatné: že se
// každá adresa zkouší několikrát a jeden výpadek sítě nikoho neodsoudí.
//
// Spuštění: node scripts/test-kontrola-e2e.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spi = (ms) => new Promise((r) => setTimeout(r, ms));

let bezi = 0, spadlo = 0;
function tvrdi(popis, podminka, detail) {
  bezi++;
  if (!podminka) { spadlo++; console.log(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'test-server.mjs')], { cwd: ROOT, stdio: 'ignore' });
await spi(1200);

let vypis = '';
try {
  const bezet = spawn(process.execPath, [path.join(ROOT, 'scripts', 'kontrola-inzeratu.mjs')], {
    cwd: ROOT,
    env: { ...process.env, SUPABASE_URL: 'http://localhost:8200', SUPABASE_SERVICE_ROLE_KEY: 'test', NO_PROXY: 'localhost,127.0.0.1' },
  });
  bezet.stdout.on('data', (d) => (vypis += d));
  bezet.stderr.on('data', (d) => (vypis += d));
  await new Promise((res) => bezet.on('close', res));
} finally {
  server.kill();
}

tvrdi('kontrola načte inzeráty', /Inzerátů ke kontrole: 4/.test(vypis), vypis.slice(0, 200));

// TOHLE je jádro: odkaz, který dvakrát spadl a potřetí odpověděl, se nesmí hlásit
tvrdi('odkaz po dvou výpadcích a třetím úspěchu se NEhlásí',
  !/Písek: odkaz/.test(vypis), vypis);

tvrdi('trvale mrtvý odkaz (404) se hlásí', /Tábor: odkaz už neexistuje \(404\)/.test(vypis), vypis);
tvrdi('u mrtvého odkazu je vidět počet pokusů', /Tábor: odkaz už neexistuje \(404\) \[3 pokusů\]/.test(vypis), vypis);
tvrdi('přesměrování na cizí doménu se hlásí', /Beroun: odkaz vede na 127\.0\.0\.1 místo na localhost/.test(vypis), vypis);
tvrdi('smazaná fotka se hlásí', /Písek: fotka už v úložišti není/.test(vypis), vypis);
tvrdi('chybová stránka místo fotky se hlásí', /Tábor: na adrese fotky je text\/html/.test(vypis), vypis);
tvrdi('fotka zkopírovaná z jiného inzerátu se pozná', /Beroun: stejná fotka jako u inzerátu a1/.test(vypis), vypis);
tvrdi('inzerát bez závady se nehlásí', !/Kolín/.test(vypis), vypis);
tvrdi('souhrn sedí', /Mrtvé nebo přesměrované odkazy: 2/.test(vypis) &&
  /Chybějící nebo vadné fotky: 2/.test(vypis) && /Fotky zkopírované z jiného inzerátu: 1/.test(vypis), vypis);

console.log(`\nCelá kontrola inzerátů (proti zkušebnímu serveru): ${bezi} testů`);
if (spadlo) { console.error(`\n${spadlo} z ${bezi} NEPROŠLO.\n--- výpis ---\n${vypis}`); process.exit(1); }
console.log('Všechny prošly.\n');
