#!/usr/bin/env node
/* CELÁ RYCHLÁ SADA JEDNÍM PŘÍKAZEM.
   ==================================================================
   Spuštění:
     node scripts/zkousky.mjs              rychlé zkoušky (bez prohlížeče)
     node scripts/zkousky.mjs --v-prohlizeci   zkoušky v prohlížeči (jedna po druhé)
     node scripts/zkousky.mjs --seznam     jen vypíše, co by pustil
     node scripts/zkousky.mjs --sql-povinne  chybějící PostgreSQL = chyba
     node scripts/zkousky.mjs --vlaken 2   kolik naráz (výchozí 4)
     node scripts/zkousky.mjs --limit 300  strop na jednu zkoušku (výchozí 900 s)

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
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (jm) => process.argv.includes(jm);
const hodnota = (jm, vychozi) => {
  const i = process.argv.indexOf(jm);
  return i >= 0 ? (parseInt(process.argv[i + 1], 10) || vychozi) : vychozi;
};

/* Z workflow se berou jen zkoušky z vybraných úloh — a jen ty, které
   se opravdu spouštějí (řádky s `run:`), ne zmínky v komentářích. */
function zeWorkflow(vyberUlohy) {
  const wf = readFileSync(path.join(KOREN, '.github', 'workflows', 'testy.yml'), 'utf8');
  const bloky = wf.split(/\n  (?=[\w-]+:\n)/).slice(1);
  const klic = (b) => (b.match(/^\s*([\w-]+):/) || [])[1] || '';
  const uloha = bloky.filter((b) => vyberUlohy(klic(b))).join('\n');
  const radky = uloha.split('\n').filter((r) => !/^\s*#/.test(r)).join('\n');
  const najdene = [...radky.matchAll(/node\s+(scripts\/test-[\w-]+\.mjs)/g)].map((m) => m[1]);
  return [...new Set(najdene)];
}
export function rychleZkousky() { return zeWorkflow((k) => k === 'testy'); }
/* Tři směny v CI jedou každá na svém stroji. Tady se slijí do jednoho
   seznamu; že se dvě zkoušky nikdy neperou o týž port, řeší plánovač
   níž (tři z nich si schválně podávají 8310). */
export function prohlizecoveZkousky() { return zeWorkflow((k) => /^v-prohlizeci/.test(k)); }

/* NA KTERÉM PORTU ZKOUŠKA SEDÍ. Hledá se ve třech podobách, protože
   ve třech podobách to v repozitáři stojí:
     · `listen(8412)`        — zkouška si server otevře sama,
     · `127.0.0.1:8310`      — zkouška v prohlížeči zná jen adresu,
     · `const PORT = 8310`   — číslo stojí v scripts/port-zkousky.mjs
                             a server si pustí POMOCNÍK, kterého
                               zkouška jen importuje.
   Ta třetí podoba mě naučila dvakrát: nejdřív jsem hledal jen
   `listen(` (z 131 prohlížečových zkoušek vyšlo „bez portu" skoro
   všechno a paralelní běh jich 110 utopil v EADDRINUSE), pak jen
   v souboru zkoušky — a zkoušky, které port dědí z
   `falesna-supabase-chat.mjs` (ten si port bere z `port-zkousky.mjs`), padaly
   dál. Proto se nahlíží i do MÍSTNÍCH importů, jednu úroveň. */
const VZOR_PORTU = /(?:listen\(|127\.0\.0\.1:|localhost:|PORT\s*=\s*)(\d{4})/;
/* KOMENTÁŘE SE NEPOČÍTAJÍ. Potřetí v tomhle repozitáři: hlídač si
   přečetl text po svém. Zrovna tahle hlavička má v sobě příklad
   „listen(8412)" — a detekce ho vzala jako port téhle zkoušky, takže
   hlídač portů ohlásil kolizi mezi test-zkousky-meri a
   test-kontrola-spusteni, které se nikdy nepotkají. */
const bezKomentaru = (k) => k.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
export function portZkousky(soubor, uroven = 0) {
  let t = '';
  try { t = bezKomentaru(readFileSync(path.join(KOREN, soubor), 'utf8')); } catch (e) { return null; }
  const m = t.match(VZOR_PORTU);
  if (m) return m[1];
  /* DVĚ ÚROVNĚ, ne jedna. Od sjednocení portu (scripts/port-zkousky.mjs)
     vede cesta zkouška → falesna-supabase-chat.mjs → port-zkousky.mjs,
     takže při jedné úrovni by 100+ zkoušek vyšlo „bez portu" a běžec by
     je pustil naráz. Změřeno: s jednou úrovní se port najde u 15 ze 132,
     se dvěma u 123. */
  if (uroven > 1) return null;
  for (const imp of t.matchAll(/(?:from|import\()\s*['"]\.\/([\w.-]+\.mjs)['"]/g)) {
    const port = portZkousky(path.join('scripts', imp[1]), uroven + 1);
    if (port) return port;
  }
  return null;
}

/* POUŠTÍ SE JEN PŘI PŘÍMÉM SPUŠTĚNÍ. Bez téhle podmínky by `import`
   téhle hlavičky (kvůli funkci rychleZkousky, kterou si čte hlídač
   portů) spustil celou sadu — a zkouška, která si chtěla jen přečíst
   seznam, by se zasekla na sto třiceti procesech. Naměřeno. */
if (import.meta.url === `file://${process.argv[1]}`) {

const V_PROHLIZECI = arg('--v-prohlizeci');
const seznam = V_PROHLIZECI ? prohlizecoveZkousky() : rychleZkousky();
if (arg('--seznam')) {
  console.log(seznam.join('\n'));
  console.log(`\n${seznam.length} ${V_PROHLIZECI ? 'zkoušek v prohlížeči' : 'rychlých zkoušek'}`
    + ' (seznam je z .github/workflows/testy.yml).');
  process.exit(0);
}
if (seznam.length < 50) {
  console.log(`::error::Z workflow se vyčetlo jen ${seznam.length} zkoušek — to je tak málo,`
    + ' že se tím nedá nic potvrdit. Změnil se zápis úlohy „testy" ve .github/workflows/testy.yml?');
  process.exit(1);
}

/* Čtyři naráz v obou sadách; o to, aby se dvě zkoušky nepraly o týž
   port, se stará plánovač níž. Kdo chce jinak, řekne --vlaken. */
const VLAKEN = Math.max(1, Math.min(hodnota('--vlaken', 4), 8));
/* Strop na jednu zkoušku. Nejdelší naměřená poctivě běžící zkouška má
   ~105 s (test-naseptavac v prohlížeči), takže 900 s je rezerva pro
   pomalejší stroj, ne cíl. */
const LIMIT = Math.max(30, hodnota('--limit', 900));
const env = { ...process.env };
if (arg('--sql-povinne')) env.PK_SQL_VYZADOVAN = '1';

/* PROHLÍŽEČ SE NAJDE SÁM. Zkoušky chtějí PW_CHROMIUM (jinak si
   playwright-core hledá svůj vlastní, který tu není) a PK_LEAFLET_DIR
   (mapa se v nich servíruje z disku). Kdo to musí vypisovat ručně,
   zapomene — a dostane stovku pádů, které nemají s webem nic
   společného. */
if (V_PROHLIZECI && !env.PW_CHROMIUM) {
  const kde = ['/opt/pw-browsers'];
  for (const zaklad of kde) {
    let adresare = [];
    try { adresare = readdirSync(zaklad).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse(); }
    catch (e) { /* nic */ }
    for (const d of adresare) {
      const cesta = path.join(zaklad, d, 'chrome-linux', 'chrome');
      try { statSync(cesta); env.PW_CHROMIUM = cesta; break; } catch (e) { /* dál */ }
    }
    if (env.PW_CHROMIUM) break;
  }
  if (env.PW_CHROMIUM) console.log(`Prohlížeč: ${env.PW_CHROMIUM} (našel se sám)`);
  else console.log('::warning::PW_CHROMIUM není nastavené a prohlížeč se nenašel —'
    + ' zkoušky si budou hledat svůj vlastní a většina padne na tom, že žádný není.');
}
if (V_PROHLIZECI && !env.PK_LEAFLET_DIR) {
  const l = path.join(KOREN, 'vendor', 'leaflet');
  try { statSync(l); env.PK_LEAFLET_DIR = l; } catch (e) { /* nic */ }
}

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

/* STROP NA ČAS JEDNÉ ZKOUŠKY. Bez něj zasekne jedna zkouška celou
   sadu — a protože drží i port, čeká se na ni se vším ostatním. Pozná
   se to jen tím, že výpis přestane rostoucí, což není hlášení, ale
   hádanka. Naměřeno na vlastním běhu: po `test-naseptavac` (104 s)
   přestal výpis přibývat a běžela jedna zkouška tři minuty. */
function pust(soubor) {
  return new Promise((hotovo) => {
    const t0 = Date.now();
    const p = spawn('node', [soubor], { cwd: KOREN, env });
    let out = '';
    let utnuto = false;
    const hlidac = setTimeout(() => {
      utnuto = true;
      out += `\n[běžec] zkouška běžela víc než ${LIMIT} s a byla utnuta.\n`;
      try { p.kill('SIGKILL'); } catch (e) { /* už skončila */ }
    }, LIMIT * 1000);
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (kod0) => {
      clearTimeout(hlidac);
      const kod = utnuto ? 1 : kod0;
      const s = ((Date.now() - t0) / 1000).toFixed(0);
      if (utnuto) console.log(`ČAS   ${soubor}  ${s}s (strop ${LIMIT} s)`);
      /* Přeskočení se NESMÍ počítat za úspěch bez zmínky: zkoušky
         databáze se bez PostgreSQL přeskakují, a kdo si toho nevšimne,
         věří, že proběhly. */
      const preskoceno = /se přeskakuje|PostgreSQL tu není/.test(out);
      vysledky.push({ soubor, kod, s, preskoceno, out, utnuto });
      if (!utnuto) console.log(`${kod === 0 ? (preskoceno ? '~ ' : 'OK') : 'CHYBA'}  ${soubor}  ${s}s`);
      hotovo();
    });
  });
}

/* PLÁNOVAČ PODLE PORTŮ. Zkoušky v prohlížeči si tři z nich podávají
   port 8310 (v CI jede každá směna na svém stroji, takže si tam
   nevadí). Pustit celou sadu po jedné je ale drahé: naměřeno 19 zkoušek
   za 6 minut, tedy ~40 minut na všech 131. Port se proto přečte
   z jejich zdroje — stejně, jako ho hlídá test-zkousky-meri.mjs — a
   paralelně se nikdy nepustí dvě, které by se o týž port praly.
   Zkouška bez serveru nebrání nikomu. */

const porty = new Map(seznam.map((f) => [f, portZkousky(f)]));
const cekajici = seznam.slice();
const obsazene = new Set();

async function vlakno() {
  for (;;) {
    let i = -1;
    for (let k = 0; k < cekajici.length; k++) {
      const pt = porty.get(cekajici[k]);
      if (!pt || !obsazene.has(pt)) { i = k; break; }
    }
    if (i < 0) {
      if (!cekajici.length) return;                   /* nic nezbývá */
      await new Promise((r) => setTimeout(r, 200));   /* port obsazený, počkat */
      continue;
    }
    const soubor = cekajici.splice(i, 1)[0];
    const pt = porty.get(soubor);
    if (pt) obsazene.add(pt);
    try { await pust(soubor); } finally { if (pt) obsazene.delete(pt); }
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
      p.stdout.setEncoding('utf8');
      p.stderr.setEncoding('utf8');
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { out += d; });
      p.on('close', (kod) => hotovo({ kod, out }));
    });
    if (znovu.kod === 0) {
      kolize.push(v.soubor);
      v.kod = 0;
      v.kolize = true;
      /* DŮKAZ SE NEZAHAZUJE. Dřív tu zbylo jen slovo „kolize" a výpis
         z paralelního pádu se ztratil — takže když se to příště stalo,
         nebylo co číst a příčina se hádala. (Naměřeno na vlastní kůži:
         test-parametry padla v sadě a sama prošla; pak se nedalo zjistit
         PROČ, protože výpis už nebyl.) Teď se ukládá na disk a první
         nálezy se vypíšou hned. */
      const souborLogu = path.join(tmpdir(),
        `kolize-${path.basename(v.soubor, '.mjs')}-${Date.now()}.log`);
      try { writeFileSync(souborLogu, v.out || '(prázdný výpis)'); } catch (e) { /* disk plný? ať to neshodí celou sadu */ }
      const nalezy = (v.out || '').split('\n').filter((r) => r.includes('✕')).slice(0, 2);
      console.log(`  ~ ${v.soubor} — samo prošlo (kolize); výpis z paralelního pádu: ${souborLogu}`);
      for (const r of nalezy) console.log(`      ${r.trim()}`);
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
console.log(`\n${V_PROHLIZECI ? 'Sada v prohlížeči' : 'Rychlá sada'}:`
  + ` ${vysledky.length - padlo.length}/${vysledky.length} prošlo`
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
  console.log(`::error::${V_PROHLIZECI ? 'Sada v prohlížeči' : 'Rychlá sada'}:`
    + ' některá zkouška si sahá na živý adresář místo na kopii'
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
  console.log(`\n::error::${V_PROHLIZECI ? 'Sada v prohlížeči' : 'Rychlá sada'}:`
    + ` padlo ${padlo.length} z ${vysledky.length} — `
    + padlo.map((v) => v.soubor.replace('scripts/', '')).join(', '));
  process.exit(1);
}
if (spinave.length) process.exit(1);

}
