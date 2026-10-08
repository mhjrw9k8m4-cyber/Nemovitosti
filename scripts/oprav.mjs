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
  // Před regionálními: hrubé hranice okresů čte kontrola ve formuláři,
  // ne stránky — ale ať je hotová, než se razítkují verze.
  ['generate-okresy-hrube.mjs', 'proředěné hranice okresů pro kontrolu ve formuláři'],
  ['generate-region-pages.mjs', 'stránky krajů a okresů, čísla v úvodu, dražby, rozcestník, sitemap'],
  // Až PO regionálních: ty přepisují sitemap celou, tenhle krok se do ní dopisuje.
  ['generate-parcel-pages.mjs', 'vlastní stránka pro každý pozemek (sdílení a vyhledávače)'],
  // Až PO stránkách pozemků: kanál na ně odkazuje, takže musí existovat.
  /* Řezy dat po okresech — vedle celku, pro toho, kdo chce jeden okres.
     Staví se z hotového data/opportunities.json, tedy až za robotem. */
  ['generate-data-rezy.mjs', 'řezy dat po okresech'],
  /* Které nabídky zlevnily — z archivu, pro mapu a výpis. Až za
     robotem a za archivem (scripts/archiv.mjs běží před oprav.mjs,
     viz .github/workflows/update-data.yml). */
  ['generate-zlevneni.mjs', 'které nabídky zlevnily (data/zlevneni.json)'],
  ['generate-rss.mjs', 'kanály s novými pozemky (celostátní a krajské)'],
  ['generate-data-stranka.mjs', 'stránka s popisem dat (data.html)'],
  // Až po generátorech: česká sazba se dělá na HOTOVÉM textu, ať platí
  // stejně pro ručně psané stránky i pro 1 995 generovaných.
  ['sazba.mjs', 'nezlomitelné mezery (předložky, čísla s jednotkou)'],
  /* Očištění PŘED razítkem: mění odkazy ve stránkách (styles.css →
     styles.min.css), takže razítko se musí počítat až z výsledku. */
  ['minifikace.mjs', 'očištěný stylopis pro prohlížeč'],
  /* Až PO minifikaci: zkrácený stylopis se staví ze zdroje, ale odkazy
     ve stránkách přepisuje z css/styles.min.css, který vyrobí krok výš. */
  ['rozdel-styly.mjs', 'zkrácený stylopis pro stránky bez mapy'],
  ['orazitkuj-verze.mjs', 'razítka ?v= u skriptů a stylů'],
  ['build-sql.mjs', 'sloučené supabase/00-vse.sql'],
  /* Až na konci: tabulka stavu v roadmapě počítá stránky, zkoušky
     i funkce v databázi, takže musí vidět hotový výsledek. */
  ['generate-roadmap-cisla.mjs', 'přepočítaná tabulka stavu v docs/roadmap.md'],
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
