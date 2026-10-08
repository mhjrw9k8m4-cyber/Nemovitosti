/* Test: čísla v docs/roadmap.md se rovnají tomu, co v repozitáři je.
   ==================================================================
   Spuštění: node scripts/test-roadmap.mjs

   PROČ. Roadmapa je jediné místo, kde se dá přečíst, co je hotové
   a co čeká na majitele. Jenže čísla v ní nikdo nepřepočítává, takže
   stárnou tiše: tabulka „Stav k…" tvrdila 11 tabulek a 25 funkcí
   (bylo 14 a 33), 2 018 nabídek (2 006), 1 629 popisů (1 618),
   2 000 stránek pozemků (2 054) a 62/68 zkoušek (75/88). Plán, který
   lže v číslech, se nedá použít k rozhodování — a to je jeho jediný
   účel.

   Sama roadmapa se negeneruje schválně: text o tom, co a proč čeká
   na majitele, musí napsat člověk. Hlídají se jen ta čísla, která
   se dají spočítat ze zdroje.

   JAK TO NEJDE OŠIDIT. Když se řádek tabulky přepíše tak, že se v něm
   číslo nenajde, kontrola spadne na „řádek se nenašel" — ne na ticho.
   ================================================================== */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const text = fs.readFileSync(path.join(KOREN, 'docs', 'roadmap.md'), 'utf8');
/* V textu jsou čísla sázená s nezlomitelnou mezerou (2 006). */
const cislo = (s) => Number(String(s).replace(/[\s ]/g, ''));
/** Najde v roadmapě jediný řádek podle návěstí a vytáhne z něj čísla. */
function cislaRadku(navesti) {
  const radky = text.split('\n').filter((r) => r.includes(navesti));
  if (radky.length !== 1) return { chyba: `řádek „${navesti}" se našel ${radky.length}× (čekal jsem 1×)` };
  const c = [...radky[0].matchAll(/(\d[\d\s ]*\d|\d)/g)].map((m) => cislo(m[1]));
  return { radek: radky[0], cisla: c };
}
/** Ověří, že se dané číslo v řádku vyskytuje. */
function maCislo(navesti, co, kolik) {
  const r = cislaRadku(navesti);
  if (r.chyba) return pravda(`${co}: ${kolik}`, false, r.chyba);
  pravda(`${co}: ${kolik}`, r.cisla.includes(kolik),
    `v roadmapě stojí ${r.cisla.join(', ')} — má tam být ${kolik}`);
}

/* ---- 1) databáze ---------------------------------------------- */
const sql = fs.readdirSync(path.join(KOREN, 'supabase'))
  .filter((f) => f.endsWith('.sql') && f !== '00-vse.sql')
  .map((f) => fs.readFileSync(path.join(KOREN, 'supabase', f), 'utf8')).join('\n');
const tabulky = new Set([...sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/gi)].map((m) => m[1]));
const funkce = new Set([...sql.matchAll(/create or replace function (?:public\.)?([a-z_]+)/gi)].map((m) => m[1]));
pravda(`v supabase/ se našly tabulky a funkce (${tabulky.size} / ${funkce.size})`,
  tabulky.size > 5 && funkce.size > 5, 'nic se nenašlo — kontrola by měřila prázdno');
maCislo('| Databáze |', 'tabulek v databázi', tabulky.size);
maCislo('| Databáze |', 'funkcí (RPC)', funkce.size);

/* ---- 2) data příležitostí ------------------------------------- */
const opp = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
const nab = opp.opportunities || [];
const podleTypu = (t) => nab.filter((d) => d.type === t).length;
const popisy = Object.keys(JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'popisy.json'), 'utf8'))).length;
pravda(`data/opportunities.json má nabídky (${nab.length})`, nab.length > 100, `jen ${nab.length}`);
maCislo('| Data příležitostí |', 'nabídek', nab.length);
maCislo('| Data příležitostí |', 'prodejů', podleTypu('sale'));
maCislo('| Data příležitostí |', 'dražeb', podleTypu('drazba'));
maCislo('| Data příležitostí |', 'exekucí', podleTypu('exekuce'));
maCislo('| Data příležitostí |', 'popisů od inzerentů', popisy);
/* A počet BEZ DUPLICIT, protože to je číslo, které návštěvník opravdu
   vidí. Roadmapa uváděla jen surových 2 006 a web ukazoval 1 950;
   při kontrole čísel to vypadalo jako chyba webu, přitom se jen
   porovnávaly dvě různé věci. */
const PKH = createRequire(import.meta.url)(path.join(KOREN, 'js', 'hlidani-logika.js'));
const bezDup = PKH.bezDuplicit(nab).length;
pravda(`duplicity se opravdu odstraňují (${nab.length} → ${bezDup})`,
  bezDup > 0 && bezDup <= nab.length, `${bezDup} z ${nab.length}`);
maCislo('| Data příležitostí |', 'nabídek po odstranění duplicit', bezDup);

/* ---- 3) stránky ----------------------------------------------- */
const html = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
const pozemku = html.filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f)).length;
const okresnich = html.filter((f) => f.startsWith('pozemky-okres-')).length;
const krajskych = html.filter((f) => /^pozemky-[a-z-]+-kraj\.html$/.test(f)).length;
maCislo('| Stránky |', 'vlastních stránek pozemků', pozemku);
maCislo('| Stránky |', 'okresních', okresnich);
maCislo('| Stránky |', 'krajských', krajskych);

/* ---- 4) zkoušky ----------------------------------------------- */
const souboru = fs.readdirSync(path.join(KOREN, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f)).length;
const wf = fs.readFileSync(path.join(KOREN, '.github', 'workflows', 'testy.yml'), 'utf8');
const joby = wf.split(/\n  (?=[\w-]+:\n)/);
function vJobu(jmeno) {
  const j = joby.find((b) => b.trimStart().startsWith(jmeno + ':'));
  return j ? [...j.matchAll(/node (scripts\/test-[a-z0-9-]+\.mjs)/g)].length : 0;
}
const bez = vJobu('testy'), sProhlizecem = vJobu('v-prohlizeci');
pravda(`úkoly v CI se našly (${bez} bez prohlížeče, ${sProhlizecem} s ním)`,
  bez > 10 && sProhlizecem > 10, `${bez} / ${sProhlizecem}`);
maCislo('| Zkoušky |', 'souborů se zkouškami', souboru);
maCislo('| Zkoušky |', 'zkoušek bez prohlížeče', bez);
maCislo('| Zkoušky |', 'zkoušek s prohlížečem', sProhlizecem);

/* ---- 5) datum tabulky ----------------------------------------- */
const datum = /##\s*Stav k (\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(text);
pravda('tabulka má datum, ke kterému platí', !!datum, 'chybí „## Stav k D. M. RRRR"');

console.log('\nČísla v roadmapě');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Roadmapa: ' + chyb + ' kontrol neprošlo — přepište čísla v docs/roadmap.md.'); process.exit(1); }
process.exit(0);
