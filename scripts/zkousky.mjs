#!/usr/bin/env node
/* CELÁ RYCHLÁ SADA JEDNÍM PŘÍKAZEM.
   ==================================================================
   Spuštění:
     node scripts/zkousky.mjs              rychlé zkoušky (bez prohlížeče)
     node scripts/zkousky.mjs --seznam     jen vypíše, co by pustil
     node scripts/zkousky.mjs --sql-povinne  chybějící PostgreSQL = chyba
     node scripts/zkousky.mjs --vlaken 2   kolik naráz (výchozí 4)

   PROČ TO VZNIKLO. Rychlých zkoušek je přes sto a dosud se daly pustit
   jen dvěma způsoby: po jedné ručně, nebo počkat na CI. Sebeoprava
   (scripts/sebeoprava.mjs) ale musí svůj výsledek DOKÁZAT, než ho
   nahraje — a k tomu potřebuje jeden příkaz s jasným návratovým kódem.

   SEZNAM SE TU NEPÍŠE RUČNĚ, ČTE SE Z CI. Ruční seznam by se rozešel
   s .github/workflows/testy.yml a tenhle běžec by pak tvrdil „sada
   prošla", i kdyby pět zkoušek vynechal. Bere se proto přímo to, co
   spouští úloha „testy" ve workflow: co běží v CI, běží i tady.
   (Že je ve workflow zapsaná každá zkouška z scripts/, hlídá
   scripts/test-staticka.mjs.)

   CO SE TU NEPOUŠTÍ. Zkoušky v prohlížeči (importují playwright-core)
   — ty jsou v CI ve třech dalších úlohách a potřebují prohlížeč
   i vendor/leaflet.

   PARALELNĚ, A CO PADNE, SE PUSTÍ JEŠTĚ JEDNOU SAMO. V CI běží zkoušky
   jedna po druhé, tady čtyři naráz — a některé si nad repozitářem
   nehledí: test-ukonceno.mjs pustí generátor stránek pozemků v ŽIVÉM
   adresáři a na dvacet sekund tím nechá 2 116 stránek nevysázených
   (sazba se v řetězu dělá až po generátorech). Kdo v tom okamžiku
   čte, právem padne na vadu, kterou nezpůsobil. Naměřeno hned při
   prvním paralelním běhu: test-cestina a test-stranky-pozemku.
   Seznam „tyhle běží samy" se tu NEPÍŠE — rozešel by se se
   skutečností. Místo toho se každá padlá zkouška pustí ještě jednou,
   sama, a teprve to rozhodne: když podruhé projde, byla to KOLIZE nad
   společným stromem (vypíše se a nic netajíme), když padne znovu, je
   to vada a sada končí chybou.
   ================================================================== */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (jm) => process.argv.includes(jm);
const hodnota = (jm, vychozi) => {
  const i = process.argv.indexOf(jm);
  return i >= 0 ? (parseInt(process.argv[i + 1], 10) || vychozi) : vychozi;
};

/* Z workflow se berou jen zkoušky z úlohy „testy" — a jen ty, které
   se opravdu spouštějí (řádky s `run:`), ne zmínky v komentářích. */
export function rychleZkousky() {
  const wf = readFileSync(path.join(KOREN, '.github', 'workflows', 'testy.yml'), 'utf8');
  const bloky = wf.split(/\n  (?=[\w-]+:\n)/).slice(1);
  const klic = (b) => (b.match(/^\s*([\w-]+):/) || [])[1] || '';
  const uloha = bloky.filter((b) => klic(b) === 'testy').join('\n');
  const radky = uloha.split('\n').filter((r) => !/^\s*#/.test(r)).join('\n');
  const najdene = [...radky.matchAll(/node\s+(scripts\/test-[\w-]+\.mjs)/g)].map((m) => m[1]);
  return [...new Set(najdene)];
}

/* POUŠTÍ SE JEN PŘI PŘÍMÉM SPUŠTĚNÍ. Bez téhle podmínky by `import`
   téhle hlavičky (kvůli funkci rychleZkousky, kterou si čte hlídač
   portů) spustil celou sadu — a zkouška, která si chtěla jen přečíst
   seznam, by se zasekla na sto třiceti procesech. Naměřeno. */
if (import.meta.url === `file://${process.argv[1]}`) {

const seznam = rychleZkousky();
if (arg('--seznam')) {
  console.log(seznam.join('\n'));
  console.log(`\n${seznam.length} rychlých zkoušek (seznam je z .github/workflows/testy.yml).`);
  process.exit(0);
}
if (seznam.length < 50) {
  console.log(`::error::Z workflow se vyčetlo jen ${seznam.length} zkoušek — to je tak málo,`
    + ' že se tím nedá nic potvrdit. Změnil se zápis úlohy „testy" ve .github/workflows/testy.yml?');
  process.exit(1);
}

const VLAKEN = Math.max(1, Math.min(hodnota('--vlaken', 4), 8));
const env = { ...process.env };
if (arg('--sql-povinne')) env.PK_SQL_VYZADOVAN = '1';

/* STAV STROMU PŘED a PO. Zkouška, která si sahá na živý adresář, je
   vada — a hledá se zle: projeví se jako pád ÚPLNĚ JINÉ zkoušky, která
   zrovna čte to, co ta první právě přepisuje. Přesně to se stalo
   24. 10. (test-ukonceno pouštěl generátor v živém adresáři, takže
   test-cestina a test-stranky-pozemku padaly na 2 116 nevysázených
   stránkách). Příčina je opravená, tohle je pojistka, aby se ta třída
   vad nemohla vrátit tiše. */
/* OBSAH NESTAČÍ, HLÍDÁ SE DOTEK. Napoprvé tu stál jen `git status`
   před a po — a sabotáž (vrácená stará podoba test-ukonceno) ho
   neprobudila: ta zkouška strom přepsala a pak vrátila do téhož
   obsahu, takže git neviděl nic. Proto se srovnávají ČASY ZMĚNY:
   přepsat soubor stejným obsahem je pořád sahání na živý adresář
   a pořád to shodí zkoušku, která ho zrovna čte. */
const otiskStromu = () => {
  const otisk = new Map();
  const pridej = (adr, vzor) => {
    let jmena = [];
    try { jmena = readdirSync(path.join(KOREN, adr)); } catch (e) { return; }
    for (const f of jmena) {
      if (!vzor.test(f)) continue;
      const rel = path.join(adr, f);
      try { otisk.set(rel, statSync(path.join(KOREN, rel)).mtimeMs); } catch (e) {}
    }
  };
  pridej('.', /\.(html|xml|txt)$/);
  pridej('data', /\.json$/);
  pridej(path.join('data', 'okres'), /\.json$/);
  pridej('css', /\.css$/);
  pridej(path.join('js', 'min'), /\.js$/);
  pridej('docs', /\.md$/);
  pridej('supabase', /\.sql$/);
  return otisk;
};
const stromPred = otiskStromu();

const zacatek = Date.now();
const vysledky = [];
let dalsi = 0;

function pust(soubor) {
  return new Promise((hotovo) => {
    const t0 = Date.now();
    const p = spawn('node', [soubor], { cwd: KOREN, env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (kod) => {
      const s = ((Date.now() - t0) / 1000).toFixed(0);
      /* Přeskočení se NESMÍ počítat za úspěch bez zmínky: zkoušky
         databáze se bez PostgreSQL přeskakují, a kdo si toho nevšimne,
         věří, že proběhly. */
      const preskoceno = /se přeskakuje|PostgreSQL tu není/.test(out);
      vysledky.push({ soubor, kod, s, preskoceno, out });
      console.log(`${kod === 0 ? (preskoceno ? '~ ' : 'OK') : 'CHYBA'}  ${soubor}  ${s}s`);
      hotovo();
    });
  });
}

async function vlakno() {
  while (dalsi < seznam.length) {
    const i = dalsi++;
    await pust(seznam[i]);
  }
}
await Promise.all(Array.from({ length: VLAKEN }, vlakno));

/* Druhé kolo: padlé zkoušky samy, jedna po druhé. */
const prvniPadlo = vysledky.filter((v) => v.kod !== 0);
const kolize = [];
if (prvniPadlo.length) {
  console.log(`\nPadlo ${prvniPadlo.length} — zkouším je ještě jednou, každou samu`
    + ' (co prošlo samo, byla kolize nad společným stromem, ne vada):');
  for (const v of prvniPadlo) {
    const znovu = await new Promise((hotovo) => {
      const p = spawn('node', [v.soubor], { cwd: KOREN, env });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { out += d; });
      p.on('close', (kod) => hotovo({ kod, out }));
    });
    if (znovu.kod === 0) {
      kolize.push(v.soubor);
      v.kod = 0;
      v.kolize = true;
      console.log(`  ~ ${v.soubor} — samo prošlo (kolize)`);
    } else {
      v.out = znovu.out;
      console.log(`  CHYBA ${v.soubor} — padlo i samo`);
    }
  }
}

/* Dřív než se vypíše výsledek: nechaly zkoušky strom, jak ho našly? */
const stromPo = otiskStromu();
const spinave = [...stromPo.entries()]
  .filter(([f, t]) => !stromPred.has(f) || stromPred.get(f) !== t)
  .map(([f]) => f)
  .concat([...stromPred.keys()].filter((f) => !stromPo.has(f)).map((f) => f + ' (smazán)'));

const padlo = vysledky.filter((v) => v.kod !== 0);
const preskocene = vysledky.filter((v) => v.kod === 0 && v.preskoceno);
console.log(`\nRychlá sada: ${vysledky.length - padlo.length}/${vysledky.length} prošlo`
  + ` za ${((Date.now() - zacatek) / 1000).toFixed(0)} s (${VLAKEN} naráz).`);
if (preskocene.length) {
  console.log(`Přeskočeno (a tedy NEOVĚŘENO): ${preskocene.map((v) => v.soubor).join(', ')}`);
}
if (kolize.length) {
  console.log(`Kolize nad společným stromem (paralelně padlo, samo prošlo): ${kolize.join(', ')}`
    + ' — nejde o vadu webu; v CI tyhle zkoušky běží jedna po druhé.');
}
if (spinave.length) {
  console.log(`\nZkoušky po sobě nechaly změněný strom (${spinave.length}):`
    + ` ${spinave.slice(0, 6).join(', ')}${spinave.length > 6 ? ' a další' : ''}`);
  console.log('::error::Rychlá sada: některá zkouška si sahá na živý adresář místo na kopii'
    + ' (soubory mají nový čas změny, i když obsah může být stejný).'
    + ' To se projeví jako pád JINÉ zkoušky, která zrovna čte přepisovaný soubor —'
    + ' viz docs/optimalizace.md, oddíl 150. Změněné: ' + spinave.slice(0, 6).join(', '));
}

if (padlo.length) {
  for (const v of padlo) {
    console.log(`\n--- ${v.soubor} ---`);
    console.log(v.out.split('\n').filter((r) => /✕|::error::/.test(r)).slice(0, 6).join('\n')
      || v.out.slice(-600));
  }
  console.log(`\n::error::Rychlá sada: padlo ${padlo.length} z ${vysledky.length} — `
    + padlo.map((v) => v.soubor.replace('scripts/', '')).join(', '));
  process.exit(1);
}
if (spinave.length) process.exit(1);

}
