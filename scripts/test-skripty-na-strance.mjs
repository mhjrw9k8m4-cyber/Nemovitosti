// Test: stránka si nestahuje skript, který na ní nemá co dělat.
//
// Spuštění: node scripts/test-skripty-na-strance.mjs
//
// NALEZENO MĚŘENÍM: graf cenové hladiny (js/graf-cen.js, 8,6 kB
// očištěných) je jen na stránkách okresů a krajů — nese ho prvek
// `data-graf-cen`. Skript se ale posílal ze společné patičky na všech
// 105 generovaných stránek, takže čtrnáct z nich si ho stahovalo pro
// nic. A nebyly to okrajové stránky: mezi nimi stránky podle druhu
// („les na prodej") a podle rozpočtu, tedy ty, kam se chodí
// z vyhledávačů.
//
// Nespadlo nic a nikdy by to nespadlo — proto to tu je. Hlídá se obojí:
//   · skript se načítá tam, kde je prvek, pro který existuje,
//   · a nenačítá se tam, kde ten prvek není.
//
// Druhý směr je důležitější. První se pozná tím, že graf chybí; druhý
// se nepozná vůbec, jen se platí.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Páry „skript ↔ prvek, bez kterého nemá co dělat". Přidat další je
   otázka jednoho řádku; co se do seznamu nedostane, to se nehlídá,
   takže se tu uvádí jen to, co je opravdu vázané na jeden prvek. */
const PARY = [
  { skript: /js\/(min\/)?graf-cen\.js/, prvek: 'data-graf-cen',
    co: 'graf cenové hladiny', velikost: 'js/min/graf-cen.js' },
];

/* Jen stránky v korenu — generované i ruční. Stránky pozemků
   (pozemek-*.html) se vynechávají: je jich 2 000 a žádný z hlídaných
   skriptů na nich není, takže by jen prodloužily běh. */
const JE_POZEMEK = /^pozemek-.+-[0-9a-z]{5,8}\.html$/;
const stranky = readdirSync(KOREN)
  .filter((f) => f.endsWith('.html') && !JE_POZEMEK.test(f))
  .sort();
pravda(`našly se stránky (${stranky.length})`, stranky.length > 40, String(stranky.length));

for (const par of PARY) {
  const sPrvkem = [], sSkriptem = [], navic = [], chybi = [];
  for (const f of stranky) {
    const h = readFileSync(path.join(KOREN, f), 'utf8');
    const maPrvek = h.includes(par.prvek);
    const maSkript = par.skript.test(h);
    if (maPrvek) sPrvkem.push(f);
    if (maSkript) sSkriptem.push(f);
    if (maSkript && !maPrvek) navic.push(f);
    if (maPrvek && !maSkript) chybi.push(f);
  }
  const kB = existsSync(path.join(KOREN, par.velikost))
    ? Math.round(statSync(path.join(KOREN, par.velikost)).size / 102.4) / 10 : 0;
  pravda(`${par.co}: je co měřit (${sPrvkem.length} stránek ho má)`,
    sPrvkem.length > 10, `stránek s prvkem ${sPrvkem.length}`);
  pravda(`${par.co}: skript se načítá všude, kde je prvek`, chybi.length === 0,
    `${chybi.length} stránek má prvek bez skriptu: ` + chybi.slice(0, 5).join(', '));
  pravda(`${par.co}: a nikde jinde (ušetřeno ${kB} kB na stránku)`, navic.length === 0,
    `${navic.length} stránek ho stahuje pro nic: ` + navic.slice(0, 8).join(', '));
}

/* ===== KNIHOVNY, KTERÉ SAMY NIC NEDĚLAJÍ =========================
   Druhý druh plýtvání. Modul, který jen vystaví globální jméno
   a čeká, až ho někdo zavolá, je na stránce, kde ho nikdo nezavolá,
   čistá zátěž — a nepozná se to ničím: nic nespadne, jen se stáhne.

   NALEZENO MĚŘENÍM: js/hlidani-logika.js (11 kB očištěných) se
   načítalo na 126 stránkách a `PKHlidani` na nich nevolal nikdo.
   Stálo tam kvůli odznaku upozornění v nabídce — jenže ta funkce je
   z webu odebraná a #nav-zpravy ani #nav-hlidani dnes neplní žádný
   skript.

   Pravidlo: stránka, která knihovnu načte, musí její jméno použít —
   buď ve vlastním kódu na stránce, nebo v jiném skriptu, který si
   tatáž stránka načítá. */
const KNIHOVNY = [
  { skript: 'hlidani-logika', global: 'PKHlidani', co: 'logika hlídání' },
];
{
  const zdroje = new Map();
  for (const f of readdirSync(path.join(KOREN, 'js')).filter((x) => x.endsWith('.js'))) {
    zdroje.set(f.slice(0, -3), readFileSync(path.join(KOREN, 'js', f), 'utf8'));
  }
  /* Tady se měří i na stránkách pozemků: právě ty jsou nejpočetnější
     a právě na nich PKHlidani opravdu potřeba JE (js/pozemek.js) —
     kdyby se vynechaly, kontrola by neukázala, že rozdíl pozná. */
  const vsechny = readdirSync(KOREN).filter((f) => f.endsWith('.html')).sort();
  for (const k of KNIHOVNY) {
    const nactene = [], zbytecne = [];
    for (const f of vsechny) {
      const h = readFileSync(path.join(KOREN, f), 'utf8');
      const moduly = [...h.matchAll(/src="js\/(?:min\/)?([a-z0-9-]+)\.js/g)].map((m) => m[1]);
      if (!moduly.includes(k.skript)) continue;
      nactene.push(f);
      /* Vlastní kód stránky = HTML bez značek <script src=…>. */
      const vlastni = h.replace(/<script src="[^"]*"[^>]*><\/script>/g, '');
      let pouzito = vlastni.includes(k.global);
      if (!pouzito) {
        for (const m of moduly) {
          if (m === k.skript) continue;
          if ((zdroje.get(m) || '').includes(k.global)) { pouzito = true; break; }
        }
      }
      if (!pouzito) zbytecne.push(f);
    }
    const p2 = path.join(KOREN, 'js', 'min', k.skript + '.js');
    const kB = existsSync(p2) ? Math.round(statSync(p2).size / 102.4) / 10 : 0;
    pravda(`${k.co}: načítá ji aspoň jedna stránka (${nactene.length})`, nactene.length > 0);
    pravda(`${k.co}: a každá z nich ${k.global} opravdu používá (${kB} kB)`,
      zbytecne.length === 0,
      `${zbytecne.length} stránek ji stahuje pro nic: ` + zbytecne.slice(0, 6).join(', '));
  }
}

console.log('Skripty na stránce:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) { console.log('::error::Skripty na stránce: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
