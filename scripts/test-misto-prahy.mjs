/* PRAHA: v datech není obec, ale ulice — a stránka to nesmí tvrdit jinak.
 *
 * Spuštění: node scripts/test-misto-prahy.mjs   (nepotřebuje prohlížeč)
 *
 * Změřeno 14. 10.: v okrese Praha je 23 nabídek a mezi jejich místy
 * stojí „Ke Korunce", „Devonská", „Na Chvalce", „Borovská", „Ibišková",
 * „Na Kindlovce". Titulek i nadpis z toho skládaly „Stavební pozemek
 * 778 m² — Ibišková, okres Praha" — tedy TVRDILY OBEC, KTERÁ
 * NEEXISTUJE. Člověk, který hledá pozemek v Praze, takový titulek
 * nenajde, a kdo ho najde, přečte si z něj něco nepravdivého.
 *
 * Není to dohad: zdrojové adresy inzerátů jsou tvaru
 * „…/prodej-pozemku-ke-korunce-praha" — portál sám rozlišuje ulici
 * a město, jen do pole obce posílá ulici.
 *
 * Pravidlo platí právě a jen pro okres Praha, protože tam je obec vždy
 * Praha. Jinde je `place` opravdu obec a tvar „obec, okres okres"
 * zůstává — hlídá se tu obojí, aby se oprava nerozlila dál, než má.
 *
 * Data se nemění: `place` je v klíči pozemku i v názvu souboru
 * (pozemek-praha-devonska-…), takže přepsat ho by znamenalo zahodit
 * adresy, na které už vedou odkazy.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { mistoFraze } from './generate-parcel-pages.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1) sama funkce ---- */
pravda('u Prahy se z ulice skládá „Praha, ulice"',
  mistoFraze('Devonská', 'Praha').dlouhe === 'Praha, Devonská',
  `vyšlo „${mistoFraze('Devonská', 'Praha').dlouhe}"`);
pravda('a když je místo opravdu Praha, neopakuje se',
  mistoFraze('Praha', 'Praha').dlouhe === 'Praha, okres Praha',
  `vyšlo „${mistoFraze('Praha', 'Praha').dlouhe}"`);
pravda('mimo Prahu zůstává „obec, okres okres"',
  mistoFraze('Benešov', 'Benešov').dlouhe === 'Benešov, okres Benešov',
  `vyšlo „${mistoFraze('Benešov', 'Benešov').dlouhe}"`);

/* ---- 2) a je to vidět na stránkách ---- */
const data = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
const prazske = (data.opportunities || []).filter((o) => o.okres === 'Praha' && o.place && o.place !== 'Praha');

/* PŘEDPOKLAD: pravidlo má na čem platit. Kdyby v datech žádná pražská
   nabídka s ulicí nebyla, všechny kontroly níž by prošly naprázdno —
   a zkouška by mlčela o tom, že se oprava rozpadla. */
pravda('v datech jsou pražské nabídky s ulicí místo obce', prazske.length > 0,
  `nabídek v okrese Praha: ${(data.opportunities || []).filter((o) => o.okres === 'Praha').length},`
  + ' z toho s místem jiným než Praha: 0 — zkouška by neměla co měřit');

/* POZOR NA OKRESY, KTERÉ ZAČÍNAJÍ NA „Praha". Vzor `^pozemek-praha-`
   bere i Prahu-východ a Prahu-západ, a to jsou OPRAVDOVÉ okresy
   s opravdovými obcemi (Jirny, Jevany, Hrusice). Při prvním spuštění
   si na nich zkouška vymyslela šest chyb, které na webu nejsou. */
const soubory = readdirSync(KOREN)
  .filter((f) => /^pozemek-praha-.+-[0-9a-z]{5,8}\.html$/.test(f))
  .filter((f) => !/^pozemek-praha-(vychod|zapad)-/.test(f));
const spatne = [];
let zmereno = 0;
for (const f of soubory) {
  const t = readFileSync(path.join(KOREN, f), 'utf8');
  if (t.indexOf('PK_UKONCENO') >= 0) continue;        // archiv se nepředělává
  const h1 = (/<h1[^>]*>([^<]*)/.exec(t) || [])[1] || '';
  const titul = (/<title>([^<]*)/.exec(t) || [])[1] || '';
  if (!h1) continue;
  zmereno++;
  /* Vadný tvar je „<cokoli jiného než Praha>, okres Praha". */
  for (const [kde, text] of [['h1', h1], ['title', titul]]) {
    /* `okres Praha` bez pokračování: „okres Praha-východ" je jiný okres. */
    const m = /—\s*([^—]+?),\s*okres Praha(?![-\wÀ-ž])/.exec(text);
    if (m && m[1].trim() !== 'Praha') spatne.push(`${f} (${kde}): „${m[1].trim()}, okres Praha"`);
  }
}
pravda(`žádná pražská stránka netvrdí ulici jako obec (${zmereno} stránek)`,
  spatne.length === 0, spatne.slice(0, 6).join('\n      '));

/* ---- 3) a mimo Prahu se nic nerozlilo ---- */
const jinde = readdirSync(KOREN)
  .filter((f) => /^pozemek-benesov-.+-[0-9a-z]{5,8}\.html$/.test(f))
  .map((f) => ({ f, t: readFileSync(path.join(KOREN, f), 'utf8') }))
  .filter((x) => x.t.indexOf('PK_UKONCENO') < 0);
const nadpis = (x) => (/<h1[^>]*>([^<]*)/.exec(x.t) || [])[1] || '';
const sOkresem = jinde.filter((x) => /,\s*okres Benešov/.test(nadpis(x)));
/* OKRES V TITULKU USTUPUJE ZÁMĚRNĚ, když se nevejde do meze délky —
   proto se nečeká u všech, jen u většiny. Při prvním spuštění jsem
   čekal u všech a zkouška ohlásila 22 z 34 jako chybu; chyba byla
   v očekávání, ne na webu. */
pravda('a mimo Prahu nadpis jmenuje okres, kde se vejde',
  jinde.length > 0 && sOkresem.length > jinde.length / 2,
  `z ${jinde.length} benešovských stránek jmenuje okres ${sOkresem.length}`);
const prahaJinde = jinde.filter((x) => /okres Praha(?![-\wÀ-ž])/.test(nadpis(x)));
pravda('a nikde mimo Prahu se neobjeví „okres Praha"',
  prahaJinde.length === 0, prahaJinde.slice(0, 3).map((x) => x.f).join(', '));

console.log('\nMísto u pražských nabídek');
console.log(zpravy.join('\n'));
console.log(`  (pražských nabídek s ulicí ${prazske.length}, změřeno stránek ${zmereno})`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.error(`::error::Místo u Prahy: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' V okrese Praha je `place` ulice, ne obec — skládá se z toho „Praha, ulice",'
    + ' a jinde zůstává „obec, okres okres".');
  process.exit(1);
}
