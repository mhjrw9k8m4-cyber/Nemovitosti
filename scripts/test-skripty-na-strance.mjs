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
/* SEZNAM SE NEPÍŠE RUČNĚ. Stál tu výčet o jedné položce
   (hlidani-logika) — a proto se na nic dalšího nepřišlo: js/radce.js
   (6,1 kB gzip, čistá knihovna bez jediného doteku s DOM) se stahoval
   na index.html, kde `PK_RADCE` nevolá nikdo. Volá ho jen
   js/pozemek.js, a ten na úvodní stránce není; mapa svůj panel
   s rádcem dávno nemá (komentáře v js/main.js o něm mluví v minulém
   čase). Ruční výčet je tedy druhá kopie znalosti, která se s kódem
   rozejde beze slova — stejná chyba jako u odznaků ve větě hledání.

   Knihovny se proto HLEDAJÍ: modul, který vystaví globální `PK…`
   a přitom nesahá na DOM, na síť ani na čas, nemá jak něco udělat sám
   od sebe. Dokud ho někdo nezavolá, je to jen stažený bajt. */
const SPINAVE = /\bdocument\b|addEventListener|\bfetch\s*\(|setTimeout|setInterval|requestAnimationFrame|localStorage|sessionStorage|navigator\./;
const VYVOZ = /\b(?:root|koren|window|self|globalThis)\.(PK[A-Za-z_0-9]*)\s*=/g;
const KNIHOVNY = (() => {
  const out = [];
  for (const f of readdirSync(path.join(KOREN, 'js')).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(path.join(KOREN, 'js', f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    const g = [...new Set([...src.matchAll(VYVOZ)].map((m) => m[1]))];
    if (!g.length || SPINAVE.test(src)) continue;
    out.push({ skript: f.slice(0, -3), global: g[0], globaly: g, co: 'knihovna ' + f.slice(0, -3) });
  }
  return out;
})();
{
  const zdroje = new Map();
  for (const f of readdirSync(path.join(KOREN, 'js')).filter((x) => x.endsWith('.js'))) {
    zdroje.set(f.slice(0, -3), readFileSync(path.join(KOREN, 'js', f), 'utf8'));
  }
  /* Tady se měří i na stránkách pozemků: právě ty jsou nejpočetnější
     a právě na nich PKHlidani opravdu potřeba JE (js/pozemek.js) —
     kdyby se vynechaly, kontrola by neukázala, že rozdíl pozná. */
  const vsechny = readdirSync(KOREN).filter((f) => f.endsWith('.html')).sort();
  /* POJISTKY PROTI MĚŘENÍ NAPRÁZDNO. Kdyby se hledání knihoven rozbilo
     (jiný tvar zápisu, jiné jméno proměnné v uzávěru), vrátí prázdný
     seznam a všechny kontroly níž by prošly, aniž by cokoli změřily.
     Jmenovitě se proto vyžadují ty dvě, kvůli kterým tahle kontrola
     vznikla. */
  pravda(`knihoven se našlo dost (${KNIHOVNY.length})`, KNIHOVNY.length >= 10,
    `jen ${KNIHOVNY.length} — vzor na výstup knihovny nejspíš nesedí`);
  for (const jm of ['hlidani-logika', 'radce']) {
    pravda(`mezi nimi je ${jm}`, KNIHOVNY.some((k) => k.skript === jm),
      'právě na téhle se pravidlo poprvé chytlo');
  }
  for (const k of KNIHOVNY) {
    const nactene = [], zbytecne = [];
    for (const f of vsechny) {
      const h = readFileSync(path.join(KOREN, f), 'utf8');
      const moduly = [...h.matchAll(/src="js\/(?:min\/)?([a-z0-9-]+)\.js/g)].map((m) => m[1]);
      if (!moduly.includes(k.skript)) continue;
      nactene.push(f);
      /* Vlastní kód stránky = HTML bez značek <script src=…>. */
      const vlastni = h.replace(/<script src="[^"]*"[^>]*><\/script>/g, '');
      let pouzito = k.globaly.some((g) => vlastni.includes(g));
      if (!pouzito) {
        for (const m of moduly) {
          if (m === k.skript) continue;
          const t = zdroje.get(m) || '';
          if (k.globaly.some((g) => t.includes(g))) { pouzito = true; break; }
        }
      }
      if (!pouzito) zbytecne.push(f);
    }
    const p2 = path.join(KOREN, 'js', 'min', k.skript + '.js');
    const kB = existsSync(p2) ? Math.round(statSync(p2).size / 102.4) / 10 : 0;
    if (!nactene.length) continue;   // knihovna, kterou žádná stránka nenačítá, se tu neřeší
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
