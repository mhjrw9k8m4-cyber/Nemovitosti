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
