// Test: čeština ve viditelném textu.
//
// Spuštění: node scripts/test-cestina.mjs   (bez prohlížeče, běží v sekundě)
//
// Proč: tohle je chyba, kterou nechytí žádný jiný test. Stránka se vykreslí,
// nic nespadne, jen je na ní napsaná hloupost — a čtenář si o webu udělá
// obrázek dřív, než stihne ocenit, že mapa funguje.
//
// Co se stalo: název webu se skloňuje (Parcelka → na Parcelce), jenže na
// sedmi místech zůstal v prvním pádě: „inzerátů na Parcelka". Pět z nich
// bylo v meta description — tedy přesně v tom řádku, který lidem ukáže
// Google ve výsledcích hledání, ještě než na web vůbec kliknou.
//
// Pravidlo je schválně úzké: podstatné jméno v prvním pádě hned za
// předložkou je vždycky chyba, ať je věta jakákoli. Žádné hádání, žádné
// plané poplachy. („na Parcelku" je čtvrtý pád a je správně — „přidat
// pozemek na Parcelku" — proto se hlídá jen tvar „Parcelka".)
import { readFileSync, readdirSync } from 'node:fs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const KOREN = new URL('..', import.meta.url);
const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));

/* Viditelný text + meta description. Skripty a styly ven — jsou to
   instrukce pro stroj, ne věty pro čtenáře. */
function text(html) {
  const popisky = [...html.matchAll(/<meta[^>]+name="description"[^>]+content="([^"]*)"/g)].map((m) => m[1]);
  const telo = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return (popisky.join(' ') + ' ' + telo)
    .replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ');
}

/* Předložka + první pád = chyba. Vyjmenované předložky pojí se všemi
   ostatními pády, jen ne s prvním. */
const PREDLOZKA_A_PRVNI_PAD = /\b(na|o|v|ve|po|při|k|ke|s|se|z|ze|za|do|od|u|pro)\s+(Parcelka)\b/g;

const spatne = [];
for (const f of stranky) {
  const t = text(readFileSync(new URL(f, KOREN), 'utf8'));
  for (const m of t.matchAll(PREDLOZKA_A_PRVNI_PAD)) spatne.push(`${f}: „${m[0]}"`);
}
pravda('název webu se za předložkou skloňuje (na Parcelce, ne „na Parcelka")',
  spatne.length === 0,
  spatne.slice(0, 6).join('; ') + (spatne.length > 6 ? ` … a dalších ${spatne.length - 6}` : ''));

/* ---- Číslo a tvar slova za ním -------------------------------------
   Čeština má u čísel tři tvary: 1 okres, 2 okresy, 5 okresů. Štítky
   u čísel se generovaly natvrdo v množném čísle, takže kraj Praha
   (jediný okres v republice, který je sám sobě krajem) hlásil
   „1 okresů" a okres s jednou dražbou „1 dražby". Nic nespadne,
   stránka se vykreslí — jen je na ní vidět, že ta čísla nikdo nečetl.

   Pravidlo je schválně úzké, aby neplašilo: kontrolují se jen tahle
   slova a jen v prvním pádě. Po předložkách, které si vynucují druhý
   pád („z 2 nabídek", „do 3 dnů"), se přeskakuje — tam je jiný tvar
   správně a hádat by se nemělo. */
const TVARY = [
  ['pozemek', 'pozemky', 'pozemků'],
  ['okres', 'okresy', 'okresů'],
  ['kraj', 'kraje', 'krajů'],
  ['dražba', 'dražby', 'dražeb'],
  ['exekuce', 'exekuce', 'exekucí'],
  ['nabídka', 'nabídky', 'nabídek'],
  ['obec', 'obce', 'obcí'],
  ['den', 'dny', 'dní'],
  ['hodina', 'hodiny', 'hodin'],
  ['fotka', 'fotky', 'fotek'],
];
function spravnyTvar(n, t) { return n === 1 ? t[0] : (n >= 2 && n <= 4 ? t[1] : t[2]); }
const SLOVA = new Map();
for (const t of TVARY) for (const tvar of t) SLOVA.set(tvar, t);
/* Druhý pád po předložce: „z 2 nabídek" je správně, „2 nabídek" ne. */
const DRUHY_PAD = /\b(z|ze|do|od|u|bez|kolem|podle|během|vedle|místo|víc než|více než|méně než)\s*$/i;
const CISLO_A_SLOVO = new RegExp('(\\d[\\d \u00a0]*?)[ \u00a0](' + [...SLOVA.keys()].join('|') + ')(?![a-záčďéěíňóřšťúůýž])', 'gi');

/* Text se pro tuhle kontrolu NESMÍ slepit dohromady. Když se značky
   nahradí mezerou, sousedí spolu čísla a slova, která na stránce
   sousedit nemůžou: z „…61</b></div><div><h3>Pozemky v okrese…"
   vznikne „61 Pozemky" a test hlásí chybu, která na obrazovce není.
   (První verze na tohle naletěla a nahlásila 304 nesmyslů.)
   Proto se kouká zvlášť na dvě místa, kde číslo a slovo opravdu
   sousedí: uvnitř jedné věty a ve dvojici <b>číslo</b><span>slovo</span>,
   což jsou ty dlaždice se statistikami. */
const tvary = [];
function zkontroluj(f, cislo, slovo, ukazka) {
  const n = Number(String(cislo).replace(/[\s\u00a0]/g, ''));
  const klic = String(slovo).toLowerCase();
  if (!isFinite(n) || !SLOVA.has(klic)) return;
  const ma = spravnyTvar(n, SLOVA.get(klic));
  if (ma !== klic) tvary.push(`${f}: „${ukazka}" → má být „${n} ${ma}"`);
}
for (const f of stranky) {
  const html = readFileSync(new URL(f, KOREN), 'utf8')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ');
  // 1) uvnitř jedné věty (jeden textový uzel, žádné přeskakování značek)
  for (const uzel of html.split(/<[^>]+>/)) {
    const t = uzel.replace(/&nbsp;/g, '\u00a0').replace(/&[a-z]+;/g, ' ');
    for (const m of t.matchAll(CISLO_A_SLOVO)) {
      const pred = t.slice(Math.max(0, m.index - 14), m.index);
      if (DRUHY_PAD.test(pred)) continue;
      zkontroluj(f, m[1], m[2], m[0].trim());
    }
  }
  // 2) dlaždice se statistikou: <b>61</b><span>pozemků</span>
  for (const m of html.matchAll(/<b>\s*([\d\s\u00a0&nbsp;]+?)\s*<\/b>\s*<span[^>]*>\s*([^<\s]+)\s*<\/span>/g)) {
    zkontroluj(f, m[1].replace(/&nbsp;/g, ' '), m[2], m[1].trim() + ' ' + m[2]);
  }
}
pravda('tvar slova za číslem sedí (1 okres, 2 okresy, 5 okresů)', tvary.length === 0,
  [...new Set(tvary)].slice(0, 6).join('; ') + (tvary.length > 6 ? ` … a dalších ${tvary.length - 6}` : ''));

/* Kontrola samotné kontroly: bez ní by test mlčel i nad prázdnou složkou. */
pravda('a prošly se opravdu všechny stránky', stranky.length >= 50,
  `našel jsem jen ${stranky.length} stránek`);

console.log('\nČeština ve viditelném textu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Čeština: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
