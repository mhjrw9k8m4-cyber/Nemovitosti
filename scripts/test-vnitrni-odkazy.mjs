/* VNITŘNÍ ODKAZY: každý cíl existuje, a každá kotva na cílové stránce je.
 *
 * Spuštění: node scripts/test-vnitrni-odkazy.mjs   (nepotřebuje prohlížeč)
 *
 * TOHLE NEVZNIKLO Z NÁLEZU. Změřeno 14. 10.: na 2 064 živých stránkách
 * je 68 294 vnitřních odkazů a 6 613 odkazů na kotvu — a ani jeden
 * rozbitý. Zkouška tu je proto, že rozbitý odkaz je vada, která
 * vzniká TICHO: někdo přejmenuje stránku, generátor ji přestane
 * vyrábět, zruší se oddíl s `id` — a odkaz na ni zůstane. Nic
 * nespadne, nic se nerozsvítí; jen člověk, který na něj klikne,
 * skončí na 404 nebo na stránce, která neodskočí tam, kam slíbila.
 *
 * Při 2 064 stránkách a 68 tisících odkazech to ručně nikdo neuhlídá,
 * a přitom je to jedna z mála vad, kterou lze ověřit úplně — ne na
 * vzorku, ale na všem.
 *
 * CO SE NEMĚŘÍ A PROČ:
 *  • cizí adresy (http, mailto, tel) — o jejich dostupnosti tahle
 *    zkouška nic neví a síť do CI nepatří; na zdroje dat má web
 *    vlastního hlídače (scripts/test-hlidac-zdroju.mjs),
 *  • obsah <script> a komentářů — tam bývají ukázky a šablony, ne
 *    odkazy, na které jde kliknout,
 *  • archivované stránky ukončených nabídek — záměrně se
 *    nepřegenerovávají a drží si podobu z doby, kdy nabídka platila,
 *  • kotva na stránku, která sama neexistuje — to hlásí první
 *    kontrola, ať se jedna vada nepočítá dvakrát.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

const CIZI = /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i;
function ocisti(t) {
  return t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ');
}

const stranky = readdirSync(KOREN).filter((f) => /\.html$/.test(f));
/* `id` na všech stránkách, i archivovaných: odkaz na archiv je
   v pořádku, jen se na archivu samém nic neměří. */
const idy = new Map();
for (const f of stranky) {
  const t = readFileSync(path.join(KOREN, f), 'utf8');
  idy.set(f, new Set([...t.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
}

let zivych = 0, odkazu = 0, kotev = 0;
const mrtve = new Map();
const spatneKotvy = new Map();
for (const f of stranky) {
  const t = readFileSync(path.join(KOREN, f), 'utf8');
  if (t.indexOf('PK_UKONCENO') >= 0) continue;
  zivych++;
  const bez = ocisti(t);

  for (const m of bez.matchAll(/(?:href|src)="([^"#?]+)(?:[#?][^"]*)?"/g)) {
    if (CIZI.test(m[1])) continue;
    odkazu++;
    const cesta = m[1].replace(/^\.\//, '');
    if (!existsSync(path.join(KOREN, cesta))) {
      if (!mrtve.has(cesta)) mrtve.set(cesta, []);
      if (mrtve.get(cesta).length < 3) mrtve.get(cesta).push(f);
    }
  }

  for (const m of bez.matchAll(/href="([^"]*)#([^"]+)"/g)) {
    if (CIZI.test(m[1])) continue;
    const cil = (m[1].split('?')[0] || '').replace(/^\.\//, '');
    const soubor = cil || f;          // prázdný cíl = táž stránka
    if (!idy.has(soubor)) continue;   // neexistující cíl hlásí kontrola výš
    kotev++;
    if (!idy.get(soubor).has(m[2])) {
      const k = `${soubor}#${m[2]}`;
      if (!spatneKotvy.has(k)) spatneKotvy.set(k, []);
      if (spatneKotvy.get(k).length < 3) spatneKotvy.get(k).push(f);
    }
  }
}

/* PŘEDPOKLAD: opravdu se měřilo. Kdyby se změnil zápis odkazů nebo se
   přestaly číst stránky, zkouška by bez tohohle hlásila „všechno
   v pořádku" a nepodívala se ani na jeden odkaz. */
pravda('je co měřit — živé stránky, odkazy a kotvy',
  zivych >= 50 && odkazu >= 1000 && kotev >= 100,
  `živých stránek ${zivych}, odkazů ${odkazu}, kotev ${kotev}`);

pravda(`každý vnitřní odkaz vede na soubor, který existuje (${odkazu} odkazů)`,
  mrtve.size === 0,
  [...mrtve].slice(0, 8).map(([c, kde]) => `${c} ← ${kde.join(', ')}`).join('\n      '));

pravda(`a každá kotva na cílové stránce opravdu je (${kotev} kotev)`,
  spatneKotvy.size === 0,
  [...spatneKotvy].slice(0, 8).map(([k, kde]) => `${k} ← ${kde.join(', ')}`).join('\n      '));

console.log('\nVnitřní odkazy');
console.log(zpravy.join('\n'));
console.log(`  (živých stránek ${zivych}, odkazů ${odkazu}, kotev ${kotev};`
  + ' cizí adresy, skripty, komentáře a archiv se neměří)');
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.error(`::error::Vnitřní odkazy: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' Rozbitý odkaz vzniká ticho — přejmenovanou stránkou nebo zrušeným oddílem s `id`.');
  process.exit(1);
}
