// Test: konec nabídky není konec adresy.
//
// Spuštění: node scripts/test-ukonceno.mjs   (nepotřebuje prohlížeč)
//
// Generátor stránek pozemků dřív stránky zmizelých nabídek MAZAL
// (fs.unlinkSync). Znělo to rozumně — web nemá slibovat pozemky, které
// už nikde nejsou — jenže smazaná stránka neřekne nic: vrátí 404.
// A protože se data obnovují čtyřikrát denně a stránek je přes 1 990,
// znamenalo to nepřetržitý proud mrtvých adres. Každý výsledek ve
// vyhledávači a každý uložený odkaz na dražbu, která mezitím skončila,
// končil na chybové stránce — u webu, jehož hlavní aktivum je přes
// 2 100 zaindexovaných adres.
//
// Test staví zkušební „osiřelou" stránku, pustí generátor a ověří celý
// cyklus: přepsání na ukončenou, neindexování, odkazy na podobné
// pozemky, a po uplynutí lhůty teprve smazání.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Zkušební soubor musí mít v názvu SKUTEČNÝ okres, jinak se k němu
   nenajdou podobné pozemky a zkouška níž by mlčela o ničem. */
const vzor = readdirSync(KOREN).find((f) => /^pozemek-benesov-.+\.html$/.test(f));
const ZKOUSKA = 'pozemek-benesov-zkouskatestu-9q7k2x.html';
const cesta = path.join(KOREN, ZKOUSKA);

function uklid() { try { if (existsSync(cesta)) unlinkSync(cesta); } catch (e) {} }
/* GENERÁTOR SE PUSTÍ V ŽIVÉM ADRESÁŘI a přepíše při tom všech 1 988
   stránek pozemků. To samo o sobě nevadí — píše je ze stejných dat —
   jenže česká sazba se v řetězci dělá TEPRVE PO generátorech, takže po
   takovém běhu zůstanou stránky bez nezlomitelných mezer. Zkouška, která
   běží později a sazbu kontroluje (test-cestina.mjs), pak padne na vadu,
   kterou nezpůsobila: 1 988 stránek „není vysázeno". Naměřeno — a dosud
   to nepraskalo jen proto, že běh skončil na jiné chybě dřív, než na
   čeština vůbec došlo. Pořadí zkoušek nemá rozhodovat o výsledku, proto
   se sazba po generátoru dohání zpátky (2 s). */
function generuj() {
  execFileSync(process.execPath, [path.join(KOREN, 'scripts', 'generate-parcel-pages.mjs')],
    { cwd: KOREN, stdio: 'ignore' });
  execFileSync(process.execPath, [path.join(KOREN, 'scripts', 'sazba.mjs')],
    { cwd: KOREN, stdio: 'ignore' });
}

function hotovo() {
  console.log('\nKonec nabídky není konec adresy');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  uklid();
  if (chyb) { console.log('::error::Ukončené nabídky: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

try {
  pravda('našel se vzor skutečné stránky pozemku (jinak není co kopírovat)', !!vzor,
    'v kořeni není žádná pozemek-benesov-*.html');
  if (!vzor) hotovo();

  uklid();
  writeFileSync(cesta, readFileSync(path.join(KOREN, vzor), 'utf8'));
  pravda('zkušební osiřelá stránka vznikla', existsSync(cesta), cesta);

  generuj();

  pravda('generátor ji NESMAZAL', existsSync(cesta),
    'stránka zmizelé nabídky se smazala — každý uložený odkaz na ni teď vrací 404');
  /* DŘÍV TU BYL throw. Při sabotáži (vrácené mazání) test spadl
     výjimkou dřív, než stihl cokoli vypsat — CI sice selhalo, ale
     bez zprávy, podle které se pozná proč. Zpráva je polovina testu. */
  if (!existsSync(cesta)) hotovo();

  const h = readFileSync(cesta, 'utf8');
  pravda('nese datum ukončení', /window\.PK_UKONCENO="\d{4}-\d{2}-\d{2}"/.test(h),
    'bez data se nedá poznat, kdy ji po lhůtě smazat');
  pravda('vyhledávačům se neindexuje, ale odkazy sleduje',
    /<meta name="robots" content="noindex,follow">/.test(h),
    'dražba, která skončila, nemá hledajícímu co nabídnout');
  pravda('má pruh s vysvětlením', /class="pz-konec"/.test(h), 'pruh chybí');
  pravda('datum je psané pro lidi, ne pro stroje',
    /\d{1,2}\. \d{1,2}\. \d{4}/.test(h) && !/Zmizela ze zdroje \d{4}-\d{2}-\d{2}/.test(h),
    'na stránce stojí strojový zápis data');

  const pruh = (/<div class="pz-konec"[\s\S]*?(?=<article|<\/div>\s*<script)/.exec(h) || [''])[0];
  const odkazu = (pruh.match(/<a href=/g) || []).length;
  pravda('nabízí podobné pozemky v témže okrese i cestu na mapu', odkazu >= 2,
    `odkazů v pruhu ${odkazu} — kdo sem přijde, nemá kam jít dál`);

  pravda('a ze sitemapy vypadla',
    !readFileSync(path.join(KOREN, 'sitemap.xml'), 'utf8').includes(ZKOUSKA),
    'ukončená nabídka zůstala v mapě webu');

  // Druhý běh nesmí pruh zdvojit.
  generuj();
  const h2 = readFileSync(cesta, 'utf8');
  pravda('druhý běh pruh nezdvojí', (h2.match(/class="pz-konec"/g) || []).length === 1,
    'pruhů: ' + (h2.match(/class="pz-konec"/g) || []).length);

  // Po lhůtě se teprve maže doopravdy.
  writeFileSync(cesta, h2.replace(/window\.PK_UKONCENO="[^"]*"/, 'window.PK_UKONCENO="2000-01-01"'));
  generuj();
  pravda('po uplynutí lhůty se smaže doopravdy', !existsSync(cesta),
    'stránka stará přes 90 dnů zůstala — web by rostl donekonečna');
} finally {
  uklid();
}

hotovo();
