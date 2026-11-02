/* Test: inzerát jde na mapu HNED — a nikde se neslibuje opak.
   ===================================================================
   Spuštění: node scripts/test-bez-cekani.mjs   (bez prohlížeče)

   PROČ VZNIKL. Majitel 2. 11.: „zprovozni přidávání pozemku bez žádného
   24hodinového čekání na schválení a udělej to plně automatické."
   Do té doby platilo: první inzerát z nového účtu dostal status
   'pending' a public_at = now() + interval '24 hours'.

   Hlídají se DVĚ VRSTVY, protože rozejít se umí každá zvlášť:

   1. SQL, které se pouští do Supabase (supabase/00-vse.sql se skládá
      z částí skriptem scripts/build-sql.mjs). Kdyby se čekání vrátilo
      do kterékoli části, složenina ho ponese — a web o tom nemá jak
      vědět, protože rozhodnutí padá v databázi.
   2. TEXTY na stránkách. Ty se rozešly jako první: kód zveřejňoval
      hned, a pridat.html přitom na třech místech slibovala ruční
      prohlédnutí „nejpozději do 24 hodin". Slib, který nic nedrží, je
      stejná vada jako chybějící funkce — jen se neprojeví pádem.

   Čte se VIDITELNÝ text: značky i HTML komentáře se odstraní. Jinak by
   zkouška padala na vlastních komentářích, které tu změnu popisují.
   =================================================================== */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const bezKomentaru = (sql) => sql.split('\n').map((r) => r.replace(/--.*$/, '')).join('\n');

// --- 1) SQL: žádná cesta nesmí inzerát odložit -----------------------
const sqlSoubory = readdirSync(path.join(KOREN, 'supabase')).filter((f) => f.endsWith('.sql'));
pravda(`v supabase/ je co měřit (${sqlSoubory.length} souborů)`, sqlSoubory.length > 5, String(sqlSoubory.length));

const spatne = [];
for (const f of sqlSoubory) {
  const kod = bezKomentaru(readFileSync(path.join(KOREN, 'supabase', f), 'utf8'));
  /* Hledá se přiřazení stavu i lhůta. Samotné slovo 'pending' je
     v pořádku — check constraint, index i čtecí funkce ho znají. */
  if (/novy_stav\s*:=\s*'pending'/.test(kod)) spatne.push(`${f}: novy_stav := 'pending'`);
  if (/public_at\s*:=\s*now\(\)\s*\+\s*interval/.test(kod)) spatne.push(`${f}: public_at := now() + interval`);
  if (/kdy_verejne\s*:=\s*now\(\)\s*\+\s*interval/.test(kod)) spatne.push(`${f}: kdy_verejne := now() + interval`);
  if (/insert\s+into\s+listings[^;]*values\s*\(\s*'pending'/is.test(kod)) spatne.push(`${f}: insert … values('pending'`);
}
pravda('žádná SQL část neodkládá zveřejnění inzerátu', spatne.length === 0, spatne.join(' | '));

const vse = bezKomentaru(readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8'));
/* Gauge: kdyby se tohle nenašlo, měřila by se předchozí kontrola nad
   souborem, ve kterém create_listing vůbec není. */
pravda('složené 00-vse.sql opravdu zakládá inzeráty (create_listing)',
  /create\s+or\s+replace\s+function\s+create_listing/i.test(vse));
pravda('a vkládá je jako approved', /values\s*\(\s*'approved'/.test(vse) || /novy_stav\s*:=\s*'approved'/.test(vse));
/* Co uvízlo v databázi z doby čekání, musí se pustit — pravidlo, které
   to mělo udělat, už neexistuje. */
pravda('a pouští i to, co v databázi ještě čekalo',
  /update\s+listings\s+set\s+status\s*=\s*'approved'[^;]*where\s+status\s*=\s*'pending'/is.test(vse));

// --- 2) Texty: nikde se neslibuje kontrola ani lhůta -----------------
const SLIBY = [
  [/do\s+24\s+hodin/i, 'lhůta „do 24 hodin"'],
  [/si\s+(?:napřed\s+)?projdeme/i, '„si projdeme"'],
  [/čeká\s+na\s+kontrolu/i, '„čeká na kontrolu"'],
  [/čeká\s+na\s+schválení/i, '„čeká na schválení"'],
  [/než\s+(?:ji|ho)\s+zveřejníme/i, '„než ji zveřejníme"'],
];
const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
pravda(`je co měřit: ${stranky.length} stránek`, stranky.length > 100, String(stranky.length));
const nalezy = [];
for (const f of stranky) {
  const html = readFileSync(path.join(KOREN, f), 'utf8');
  /* Skripty a styly se NEodstraňují: texty hlášek bydlí v nich (a právě
     tam se slib „čeká na kontrolu" skrýval). Odstraňují se jen
     KOMENTÁŘE — jak HTML, tak blokové v CSS a JS —, aby zkouška
     nepadala na vlastních poznámkách o tom, že se čekání zrušilo. */
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  for (const [re, jmeno] of SLIBY) if (re.test(text)) nalezy.push(`${f}: ${jmeno}`);
}
pravda('žádná stránka neslibuje kontrolu ani lhůtu před zveřejněním',
  nalezy.length === 0, nalezy.slice(0, 5).join(' | '));

/* A pozitivně: na stránce přidání musí být řečeno, že je to hned.
   Bez téhle kontroly by prošlo i to, že se o zveřejnění NEŘEKNE nic. */
const pridat = readFileSync(path.join(KOREN, 'pridat.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
pravda('a stránka přidání říká, že je nabídka na mapě hned',
  /hned po odeslání/i.test(pridat), 'věta „hned po odeslání" na stránce chybí');

console.log('\nPřidání pozemku bez čekání');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Bez čekání: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
