// Test: u spoluvlastnického podílu to musí stát v názvu, ne jen v těle.
//
// Spuštění: node scripts/test-podil-v-nazvu.mjs   (nepotřebuje prohlížeč)
//
// NALEZENO MĚŘENÍM. U 537 z 2 072 stránek (26 %) se neprodává pozemek,
// ale spoluvlastnický podíl: cena je za zlomek, výměra je celé parcely.
// Tělo stránky to říká jasně a strukturovaná data to mají ve výhradě
// u ceny — ale titulek, nadpis a popisek mlčely. Ani jedna z těch 537
// stránek neměla slovo „podíl" v názvu.
//
// A je to zrovna ten nejhůř znějící případ: „Lesní pozemek 547 418 m²"
// za 42 000 Kč. Půl milionu metrů za čtyřicet tisíc. Ve výsledcích
// vyhledávače a ve sdíleném odkazu je vidět jen tohle — tedy přesně to
// tvrzení, kterému se celý web jinde vyhýbá. V generátoru u toho navíc
// stálo, že se „nabídka popíše jako podíl rovnou v názvu".
//
// Zkouška čte HOTOVÉ stránky a porovnává je s daty, ne s generátorem.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mapaSouboru, nabidky } from './generate-parcel-pages.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
/* sazba.mjs vkládá do hotového HTML nezlomitelné mezery. */
const cti = (f) => readFileSync(path.join(KOREN, f), 'utf8').replace(/ /g, ' ');
const MEZ_TITULKU = 65;   // táž mez jako v generátoru

const mapa = mapaSouboru(nabidky());
const stranky = [];
for (const { d, soubor } of mapa.values()) {
  if (!existsSync(path.join(KOREN, soubor))) continue;
  const h = cti(soubor);
  stranky.push({
    d, soubor,
    titulek: (h.match(/<title>(.*?)<\/title>/) || [])[1] || '',
    h1: (h.match(/<article class="pz-staticky"><h1>(.*?)<\/h1>/) || [])[1] || '',
    popis: (h.match(/<meta name="description" content="(.*?)">/) || [])[1] || '',
    ldName: (h.match(/"@type":"Place","name":"(.*?)"/) || [])[1] || '',
    telo: h,
  });
}
const podily = stranky.filter((x) => x.d.podil);
const bezPodilu = stranky.filter((x) => !x.d.podil);

console.log(`Stránek pozemků: ${stranky.length}, z toho podílů: ${podily.length}`);
pravda('je co měřit — stránky spoluvlastnických podílů se našly',
  podily.length >= 300, `našlo se ${podily.length}`);
pravda('a je co měřit i na druhé straně — stránky bez podílu',
  bezPodilu.length >= 1000, `našlo se ${bezPodilu.length}`);

// ---- 1) podíl stojí ve všech čtyřech názvech ----------------------
/* Čtyři místa, čtyři různí čtenáři: záložka prohlížeče, nadpis
   stránky, výpis ve vyhledávači a strojové čtení. Stačí, aby mlčelo
   jedno, a někomu se nabídne půl milionu metrů za čtyřicet tisíc. */
for (const [kde, ber] of [['titulek', (x) => x.titulek], ['nadpis', (x) => x.h1],
  ['popisek', (x) => x.popis], ['jméno ve strukturovaných datech', (x) => x.ldName]]) {
  const bez = podily.filter((x) => !/podíl/i.test(ber(x)));
  pravda(`u podílu je to vidět v názvu — ${kde}`, bez.length === 0,
    `${bez.length} bez toho, např. ${bez.slice(0, 2).map((x) => `${x.soubor}: „${ber(x)}"`).join(' | ')}`);
}

// ---- 2) a kde zlomek známe, je tam doslova ------------------------
/* Zlomek je lepší než samotné slovo „podíl", ale ne za každou cenu:
   titulek má mez 65 znaků a u dvou sousedních nabídek ve
   Strunkovicích (1 026 a 1 017 m², jinak všechno stejné) je VÝMĚRA
   to jediné, co je odliší. Když se nevejde obojí, ustupuje zlomek —
   „Orná půda 1 026 m², podíl — Strunkovice" pořád říká, že jde
   o podíl, a titulky zůstanou různé. Hlídá se tedy podíl vždycky
   a zlomek u drtivé většiny. */
{
  const sZlomkem = podily.filter((x) => x.d.zlomek);
  const seZlomkemVNazvu = sZlomkem.filter((x) => x.h1.indexOf(x.d.zlomek) >= 0);
  const podil = seZlomkemVNazvu.length / Math.max(1, sZlomkem.length);
  pravda('je co měřit — u většiny podílů zlomek známe',
    sZlomkem.length >= 300, `${sZlomkem.length} z ${podily.length}`);
  pravda('a v nadpisu je doslova aspoň u 90 % z nich',
    podil >= 0.9,
    `${seZlomkemVNazvu.length} z ${sZlomkem.length} (${Math.round(podil * 100)} %)`);
  /* Kde zlomek ustoupil, nesmí zmizet i to slovo — jinak by se
     ustupováním dalo dojít až k původnímu stavu. */
  const bezObojiho = sZlomkem.filter((x) => x.h1.indexOf(x.d.zlomek) < 0 && !/podíl/i.test(x.h1));
  pravda('a kde zlomek ustoupil, zůstalo aspoň slovo „podíl"',
    bezObojiho.length === 0,
    `${bezObojiho.length}×, např. ${bezObojiho.slice(0, 2).map((x) => `${x.soubor}: „${x.h1}"`).join(' | ')}`);
}

// ---- 3) a nestalo se to plošně -----------------------------------
/* Kdyby se slovo „podíl" přidalo všude, kontrola výš projde a nic
   neznamená. U nabídky, která podíl NENÍ, tam stát nesmí. */
{
  const navic = bezPodilu.filter((x) => /podíl/i.test(x.h1) || /podíl/i.test(x.titulek));
  pravda('a stránka, která podíl není, ho v názvu nemá',
    navic.length === 0,
    `${navic.length}×, např. ${navic.slice(0, 2).map((x) => `${x.soubor}: „${x.h1}"`).join(' | ')}`);
}

// ---- 4) titulek se tím nerozbil ----------------------------------
{
  const dlouhe = stranky.filter((x) => x.titulek.length > MEZ_TITULKU);
  pravda(`žádný titulek nepřesáhl ${MEZ_TITULKU} znaků`, dlouhe.length === 0,
    `${dlouhe.length}×, nejdelší ${Math.max(0, ...stranky.map((x) => x.titulek.length))} znaků`);
  const useknute = stranky.filter((x) => /…\s*\|\s*Parcelka$/.test(x.titulek));
  pravda('a žádný nekončí výpustkou (tedy se nemusel utnout)',
    useknute.length === 0, useknute.slice(0, 3).map((x) => x.soubor).join(', '));
}

// ---- 5) cena za metr u podílu --------------------------------------
/* U podílu se cena za metr počítá z výměry, která kupujícímu připadne.
   Když zlomek neznáme, nepočítá se vůbec — číslo spočítané z celé
   parcely by bylo o řád vedle a znělo by jako výhoda. */
{
  const bezZlomku = podily.filter((x) => !x.d.zlomek);
  const sCislem = bezZlomku.filter((x) => /\(\s*[\d ]+ Kč\/m²\s*\)/.test(x.h1 + x.telo.slice(0, 4000)));
  pravda('u podílu s neznámým zlomkem se cena za metr neuvádí',
    sCislem.length === 0,
    `${sCislem.length}× ji uvádí, např. ${sCislem.slice(0, 2).map((x) => x.soubor).join(', ')}`);
}

console.log('\nPodíl v názvu stránky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.log(`\n::error::Podíl v názvu: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
