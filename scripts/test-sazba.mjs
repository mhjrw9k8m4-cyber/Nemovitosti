// Test: jednoznaková slova nesmí zůstat na konci řádku.
//
// Spuštění: node scripts/test-sazba.mjs   (bez prohlížeče)
//
// České sazečské pravidlo: po jednoznakové předložce nebo spojce (a, i,
// k, o, s, u, v, z) se sází nezlomitelná mezera, aby to slovo nezůstalo
// samo na konci řádku. Na úzkém telefonu se to stane snadno a je to
// první věc, které si na textu všimne každý, kdo kdy sázel.
//
// PROČ ZKOUŠKA, KDYŽ SE TO TU DODRŽUJE. Právě proto. Změřeno na všech
// 2163 stránkách: 20 840× je nezlomitelná mezera správně a obyčejná
// jen jednou (ochrana-udaju.html, „e-mail a (zašifrované) heslo").
// Pravidlo tedy na tomhle webu platí skoro absolutně — a takové se dá
// uhlídat, aniž by zkouška otravovala planými nálezy. Bez ní se bude
// rozpadat po jedné větě při každé úpravě textu.
//
// MĚŘÍ SE JEN VIDITELNÝ TEXT. Skripty, styly a komentáře jdou pryč;
// značka se nahradí nulovým bajtem, ne mezerou, aby „</b> i <b>"
// nevypadalo jako předložka s mezerou, a naopak aby se nespojila dvě
// slova ze dvou značek.
//
// VELKÁ PÍSMENA SE NEHLÍDAJÍ: „Část A — Vlastník" je označení oddílu
// listu vlastnictví, ne předložka, a nezlomitelnou mezeru mít nemá.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const viditelny = (s) => s
  .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, '\0');

const stranky = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
let spravne = 0; const spatne = [];
for (const f of stranky) {
  const t = viditelny(readFileSync(path.join(ROOT, f), 'utf8'));
  for (const m of t.matchAll(/(?<![\wÀ-ž])([aikosuvz])( | )(?=[\wÀ-ž(„])/g)) {
    if (m[2] === ' ') spravne++;
    else spatne.push(`${f}: …${t.slice(Math.max(0, m.index - 34), m.index + 36).replace(/\0/g, '|').replace(/\s+/g, ' ').trim()}…`);
  }
}

/* Předpoklady. Bez nich by „žádná obyčejná mezera" mohla být pravda
   o prázdnu — třeba kdyby se rozbilo čištění značek nebo seznam
   stránek. Obojí se mi už jednou povedlo. */
pravda(`stránek je z čeho brát (${stranky.length})`, stranky.length >= 2000,
  'našlo se jen ' + stranky.length);
pravda(`a nezlomitelné mezery se opravdu našly (${spravne})`, spravne >= 5000,
  'nalezeno jen ' + spravne + ' — čištění značek nebo hledání je rozbité');
pravda('po žádné jednoznakové předložce nestojí obyčejná mezera', spatne.length === 0,
  spatne.slice(0, 8).join('\n      ') + (spatne.length > 8 ? `\n      … a dalších ${spatne.length - 8}` : ''));

console.log('\nSazba — jednoznaková slova na konci řádku');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Sazba: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
