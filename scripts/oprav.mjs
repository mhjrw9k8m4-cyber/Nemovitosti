// Jeden příkaz, který spraví všechno odvozené.
//
// Spuštění:  node scripts/oprav.mjs
//
// Proč: část souborů v repozitáři nikdo nepíše ručně — počítají se z dat.
// Regionální stránky, čísla v úvodu, sitemap, razítka verzí u skriptů
// i sloučené SQL. Když se rozejdou se zdrojem, web tiše lže (úvod hlásil
// 1 954 pozemků, zatímco v datech jich bylo 1 958) nebo se návštěvníkům
// servíruje stará verze skriptu z mezipaměti.
//
// Dřív se to spravovalo třemi různými příkazy a člověk musel vědět, který
// z nich na kterou potíž. Tohle je pustí všechny ve správném pořadí:
// nejdřív se přegenerují stránky, teprve pak se razítkují verze (razítka
// se totiž počítají z obsahu, takže po generování).
//
// Nic tu nerozhoduje podle odhadu — každý krok je přepočet ze zdroje.
// Co přepočítat nejde (text, který napsal člověk), se tu neřeší.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const KROKY = [
  ['generate-region-pages.mjs', 'stránky krajů a okresů, čísla v úvodu, dražby, rozcestník, sitemap'],
  ['orazitkuj-verze.mjs', 'razítka ?v= u skriptů a stylů'],
  ['build-sql.mjs', 'sloučené supabase/00-vse.sql'],
];

let selhalo = 0;
for (const [skript, co] of KROKY) {
  process.stdout.write(`• ${co}\n`);
  try {
    const vystup = execFileSync('node', [path.join(KOREN, 'scripts', skript)], {
      cwd: KOREN, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const r of vystup.split('\n')) if (r.trim()) console.log('    ' + r.trim());
  } catch (e) {
    selhalo++;
    console.log(`    ✕ ${skript} spadl: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  }
}

if (selhalo) {
  console.log(`\n${selhalo} z ${KROKY.length} kroků neproběhlo.`);
  process.exit(1);
}
console.log('\nHotovo. Co se změnilo, ukáže git status.');
process.exit(0);
