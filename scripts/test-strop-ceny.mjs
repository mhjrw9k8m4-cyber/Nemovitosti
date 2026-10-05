// Test: web netvrdí cenu za metr, jaká na českém trhu neexistuje.
//
// Spuštění: node scripts/test-strop-ceny.mjs   (nepotřebuje prohlížeč)
//
// PROČ TO VZNIKLO. U spoluvlastnického podílu se cena za metr počítá
// z výměry, která kupujícímu připadne — to je správně a je to změřené
// (viz komentář u zlomekPodilu v js/ceny.js). U malého zlomku ale to
// dělení číslo vystřelí: Jihlava, zahrada 256 m² za 1 300 000 Kč, podíl
// 1/73, dávalo 370 703 Kč/m². Z toho by plynulo, že celá ta zahrada má
// hodnotu 94,9 milionu, a taková zahrada v Jihlavě není. Nevíme, které
// z těch dvou čísel v inzerátu je špatně, takže se netvrdí ani jedno.
//
// Tahle zkouška hlídá dvě věci, a ta druhá je důležitější:
//   1. Na žádné vysázené stránce není cena za metr nad mezí.
//   2. MEZ SAMA JE POŘÁD DOST DALEKO. Pevné číslo stárne, jak trh
//      poroste, a strážce, který se tiše rozpustí, je horší než žádný.
//      Zkouška proto přeměří skutečné maximum nabídek BEZ podílu (tam
//      žádné dělení nehrozí, takže je to čistý pohled na trh) a ozve se,
//      až se k mezi přiblíží.
//
// Je to poučení z téhož dne: v scripts/test-naseptavac.mjs stála mez
// 220 px naladěná na jedno vykreslení a lokálně procházela o tři pixely,
// zatímco v CI dvanáct běhů padala. Pevné číslo bez přeměřování je past.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const req = createRequire(import.meta.url);
const PKH = req(path.join(ROOT, 'js', 'hlidani-logika.js'));
new Function(readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))();
const CENY = globalThis.PK_CENY;

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

pravda('js/ceny.js vydává mez uvěřitelnosti', typeof CENY.MEZ_NEUVERITELNA === 'number' && CENY.MEZ_NEUVERITELNA > 0,
  String(CENY.MEZ_NEUVERITELNA));
const MEZ = CENY.MEZ_NEUVERITELNA;

// --- 1) Mez platí v samotném výpočtu -------------------------------
const pod = { price: 1300000, area: 256, podil: true, zlomek: '1/73' };
pravda('nabídka nad mezí nedostane cenu za metr vůbec', CENY.zaMetr(pod) === null,
  `vyšlo ${CENY.zaMetr(pod)}`);
const legit = { price: 579000, area: 7770, podil: true, zlomek: '1/13' };
pravda('ale poctivý podíl se počítá dál (1/13 → 969 Kč/m²)',
  Math.round(CENY.zaMetr(legit)) === 969, `vyšlo ${CENY.zaMetr(legit)}`);
const tesne = { price: Math.round((MEZ - 1) * 100), area: 100 };
pravda('a těsně pod mezí se číslo vrací', CENY.zaMetr(tesne) !== null, `vyšlo ${CENY.zaMetr(tesne)}`);

// --- 2) Mez je pořád dost daleko od skutečných cen ------------------
const vse = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities;
const all = PKH.bezDuplicit(vse);
const DNES = new Date(); DNES.setHours(0, 0, 0, 0);
function proslyTermin(o) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(o && o.extra || '');
  if (!m) return false;
  const t = new Date(+m[1], +m[2] - 1, +m[3]);
  return !isNaN(t) && t < DNES;
}
const aktualni = all.filter((o) => !proslyTermin(o));
/* Bez podílu, protože tam se nic nedělí — je to čistý pohled na to, co
   trh opravdu stojí. */
const bezPodilu = aktualni.filter((o) => !o.podil && o.price > 0 && o.area > 0).map((o) => o.price / o.area);
pravda(`nabídek bez podílu je dost na odhad trhu (${bezPodilu.length})`, bezPodilu.length >= 500);
const maxTrh = Math.max(...bezPodilu);
const rezerva = (MEZ - maxTrh) / MEZ;
pravda(`mez ${MEZ} je dost nad skutečným maximem trhu (${Math.round(maxTrh)} Kč/m², rezerva ${Math.round(rezerva * 100)} %)`,
  rezerva >= 0.15,
  'trh dorostl k mezi — je čas ji přeměřit a zvednout, jinak začne zahazovat poctivé nabídky');

/* A OPAČNÁ STRANA TÉŽE MEZE: nesmí zahazovat čísla po kopách. Kontrola
   rezervy výš hlídá, že mez není moc NÍZKO proti trhu, ale kdyby ji
   někdo snížil třeba na tisícovku, rezerva by zmizela a tahle kontrola
   to řekne rovnou a konkrétně: kolika nabídkám mez cenu za metr sebrala.
   Naměřeno dnes: dvě z 1 933, tedy 0,1 %. Devět dalších je bez čísla
   z jiného a staršího důvodu — podíl, u kterého inzerát neuvádí čitelný
   zlomek — a ty se do toho nepočítají. */
const sCenou = aktualni.filter((o) => o.price > 0 && o.area > 0);
pravda(`nabídek s cenou i výměrou je dost (${sCenou.length})`, sCenou.length >= 1000);
let sebrano = 0;
for (const o of sCenou) {
  if (CENY.zaMetr(o) !== null) continue;
  const z = CENY.zlomekPodilu(o);
  if (z == null) continue;            // podíl bez čitelného zlomku, jiný a starší důvod
  sebrano++;
}
const podil = sebrano / sCenou.length;
pravda(`mez sebrala cenu za metr jen hrstce nabídek (${sebrano} z ${sCenou.length}, ${(podil * 100).toFixed(1)} %)`,
  podil <= 0.01,
  'mez je nasazená moc nízko, nebo se zdroje zhoršily — v obou případech to chce podívat se, komu to čísla bere');

// --- 3) Na vysázených stránkách žádné takové číslo nestojí ----------
const stranky = readdirSync(ROOT).filter((f) => /^(pozemky-okres-[a-z0-9-]+|pozemky-[a-z-]+-kraj|drazby-pozemku-nabidky)\.html$/.test(f));
pravda(`stránky s výpisem se našly (${stranky.length})`, stranky.length > 50);
let cisel = 0, nad = [];
for (const f of stranky) {
  const h = readFileSync(path.join(ROOT, f), 'utf8');
  /* Mezery v čísle jsou PEVNÉ (&nbsp;) — s obyčejnou mezerou ve vzoru se
     neshodne nic a kontrola by prošla naprázdno. Narazil jsem na to
     v tomhle repozitáři třikrát. */
  for (const m of h.matchAll(/class="okr-zametr"[^>]*>([\d  ]+)Kč\/m²/g)) {
    cisel++;
    const v = Number(m[1].replace(/[  ]/g, ''));
    if (v > MEZ) nad.push(`${f}: ${v} Kč/m²`);
  }
}
pravda(`cen za metr se na stránkách našlo dost (${cisel})`, cisel > 1000,
  'vzor se neshodl — kontrola pod tím by nic neznamenala');
pravda('žádná vysázená cena za metr není nad mezí', nad.length === 0, nad.slice(0, 5).join(' | '));

console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 8)) {
    console.log('::error::Strop ceny: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  console.log('::error::Strop ceny: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
