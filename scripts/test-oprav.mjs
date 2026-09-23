// Test: co je v repozitáři, musí se rovnat tomu, co spočítají generátory.
//
// Spuštění: node scripts/test-oprav.mjs   (bez prohlížeče, pár sekund)
//
// Proč: část souborů nikdo nepíše ručně — počítají se z dat. Když se
// rozejdou se zdrojem, nic nespadne a nikdo si toho nevšimne; web jen
// tiše ukazuje stará čísla. Přesně to se stalo úvodní stránce: v
// repozitáři leželo „1 954 pozemků", z dat vycházelo 1 958. Robot ta
// čísla čtyřikrát denně přepočítal, jenže úloha update-data.yml
// zařazovala do commitu ručně psaný seznam souborů a index.html v něm
// nebyl — přepočet se tedy pokaždé zahodil.
//
// Jednotlivé kontroly (čísla, mediány, razítka) hlídají každá svůj kousek.
// Tahle je hrubá, ale úplná: pustí generátory a porovná VŠECHNO. Co ony
// kontroly minou, tady vyjde najevo.
//
// Nic nepřepisuje: celé se to odehraje v dočasné kopii a porovnává se
// s ní. Skutečný strom zůstane, jak byl — i kdyby test spadl.
import { cpSync, mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Kopíruje se VŠECHNO kromě pár složek, o kterých víme, že je generátory
   nečtou a jsou velké. Schválně takhle a ne seznamem toho, co kopírovat:
   takový seznam zastará při první nové závislosti a kontrola pak hlásí
   rozdíly, které v repozitáři nejsou. Chytlo mě to hned — bez assets/og
   sahá generátor po náhradním náhledovém obrázku a „rozešlo se" 91 stránek,
   přestože byly v pořádku. */
const VYNECHAT = new Set([
  '.git', 'node_modules',
  path.join('assets', 'mobilenet'),      // model pro rozpoznávání fotek, 5 MB
  path.join('assets', 'nsfw-model'),     // totéž, 2,7 MB
]);
const kopie = mkdtempSync(path.join(tmpdir(), 'parcelka-oprav-'));
try {
  cpSync(KOREN, kopie, {
    recursive: true,
    filter: (zdroj) => {
      const rel = path.relative(KOREN, zdroj);
      return rel === '' || !VYNECHAT.has(rel);
    },
  });

  let spadlo = null;
  try {
    execFileSync('node', [path.join(kopie, 'scripts', 'oprav.mjs')],
      { cwd: kopie, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { spadlo = String(e.stdout || e.stderr || e.message).trim().split('\n').slice(-3).join(' | '); }
  pravda('generátory proběhnou bez chyby', !spadlo, spadlo);

  if (!spadlo) {
    /* Porovnává se sjednocení obou stran: soubor, který generátor smazal
       (zaniklý okres) nebo přidal (nový okres), je stejná neshoda jako
       změněný obsah. */
    const zajima = (f) => f.endsWith('.html') || f === 'sitemap.xml';
    const jmena = new Set([...readdirSync(KOREN).filter(zajima), ...readdirSync(kopie).filter(zajima)]);
    jmena.add(path.join('supabase', '00-vse.sql'));

    const rozesle = [];
    for (const f of jmena) {
      const a = path.join(KOREN, f), b = path.join(kopie, f);
      const jeA = existsSync(a), jeB = existsSync(b);
      if (!jeA && !jeB) continue;
      if (!jeA) { rozesle.push(`${f} (generátor ho vytvoří, v repozitáři chybí)`); continue; }
      if (!jeB) { rozesle.push(`${f} (generátor ho maže, v repozitáři zůstal)`); continue; }
      if (readFileSync(a, 'utf8') !== readFileSync(b, 'utf8')) rozesle.push(f);
    }

    pravda('repozitář se rovná tomu, co generátory spočítají',
      rozesle.length === 0,
      `rozchází se ${rozesle.length}: ${rozesle.slice(0, 8).join(', ')}` +
      (rozesle.length > 8 ? ` … a další` : '') +
      '\n      Spusťte: node scripts/oprav.mjs');
  }
} finally {
  rmSync(kopie, { recursive: true, force: true });
}

/* --- A úlohy, které tu opravu spouštějí, se musí dát vůbec načíst ------
   Tohle mi uteklo o vlásek: pojmenoval jsem krok „Odvozené soubory sedí
   se zdrojem (jinak: node scripts/oprav.mjs)" — a dvojtečka s mezerou
   v nezauvozovkované hodnotě je v YAML chyba. Celý soubor s kontrolami
   by se nenačetl, takže by se nespustila ANI JEDNA kontrola. Nic by
   nezčervenalo; prostě by přestaly existovat.

   Modul na YAML tu není a kvůli jedné kontrole ho nepřidávám, takže se
   nehlídá celá gramatika — jen tenhle jeden tvar, protože právě ten se
   při ručním psaní názvů kroků plete. */
{
  const slozka = new URL('../.github/workflows/', import.meta.url);
  const soubory = readdirSync(slozka).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  pravda('úlohy v .github/workflows existují', soubory.length > 0);

  const vadne = [];
  for (const f of soubory) {
    const radky = readFileSync(new URL(f, slozka), 'utf8').split('\n');
    radky.forEach((r, i) => {
      const m = r.match(/^\s*(?:- )?(name|run|description):\s+(.*)$/);
      if (!m) return;
      const hodnota = m[2].trim();
      /* Uvozovky a blokový zápis (| nebo >) dvojtečku unesou. */
      if (!hodnota || /^["'|>]/.test(hodnota)) return;
      if (/:\s/.test(hodnota)) vadne.push(`${f}:${i + 1}  ${m[1]}: ${hodnota.slice(0, 60)}`);
    });
  }
  pravda('a žádná z nich nemá v nezauvozovkované hodnotě „: "',
    vadne.length === 0,
    vadne.slice(0, 4).join('\n      ') + '\n      → dvojtečka s mezerou rozbije YAML; dejte hodnotu do uvozovek');
}

console.log('\nOdvozené soubory a úlohy, které je spravují');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Oprava: ' + chyb + ' kontrol neprošlo. Spusťte node scripts/oprav.mjs');
  process.exit(1);
}
process.exit(0);
