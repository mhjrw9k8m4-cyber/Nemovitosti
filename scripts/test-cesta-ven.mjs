// Test: z okresu a kraje vede cesta ven, a je vidět včas.
//
// Spuštění: node scripts/test-cesta-ven.mjs   (nepotřebuje prohlížeč)
//
// Hlavní tlačítko na okresní i krajské stránce vede na mapu ZÚŽENOU na
// ten kraj — a dál se z ní jinam nedostanete. Odkazy na sousední okresy
// sice existují, ale změřeno na pozemky-okres-benesov.html: ležely na
// znaku 34 719 z 37 712, tedy až ZA celým výpisem obcí, a odkaz na celou
// republiku byl jen v horním menu. Kdo sjel k nabídkám a zjistil, že
// v okrese nic není, neměl odtud kam jít.
//
// Cesta ven proto musí stát NAD výpisem, u hlavního tlačítka. Nestačí,
// že na stránce někde je — nahoře se rozhoduje, dole už je pozdě.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const okresni = readdirSync(KOREN).filter((f) => /^pozemky-okres-.+\.html$/.test(f));
const krajske = readdirSync(KOREN).filter((f) => /^pozemky-.+-kraj\.html$/.test(f));

pravda('okresní stránky existují (jinak není co měřit)', okresni.length >= 50,
  `nalezeno ${okresni.length}`);

let bezCesty = [], pozdeDole = [];
for (const f of okresni.concat(krajske)) {
  const s = readFileSync(path.join(KOREN, f), 'utf8');
  const telo = s.slice(Math.max(0, s.indexOf('<body')));
  const ven = telo.indexOf('acx-vse');
  const vypis = telo.indexOf('okr-list');
  if (ven < 0) { bezCesty.push(f); continue; }
  /* Rozhoduje pořadí vůči výpisu, ne absolutní číslo: stránky mají
     různou délku podle počtu obcí a pevná mez by u malého okresu
     prošla i tehdy, kdyby odkaz ležel pod ním. */
  if (vypis >= 0 && ven > vypis) pozdeDole.push(`${f} (odkaz ${ven} > výpis ${vypis})`);
}

pravda('každá okresní i krajská stránka nabízí cestu na celou ČR',
  bezCesty.length === 0,
  `bez cesty ven: ${bezCesty.length} — např. ${bezCesty.slice(0, 3).join(', ')}`);
pravda('a ta cesta stojí NAD výpisem, ne za ním',
  pozdeDole.length === 0,
  pozdeDole.slice(0, 3).join('\n      '));

// Odkaz musí vést na celou republiku, ne zpátky na kraj.
const vzorek = okresni[0];
if (vzorek) {
  const s = readFileSync(path.join(KOREN, vzorek), 'utf8');
  const m = /<a href="([^"]*)" class="acx-vse"/.exec(s);
  pravda('odkaz vede na mapu bez zúžení na kraj',
    !!m && /^index\.html#mapa$/.test(m[1]),
    m ? `vede na „${m[1]}"` : 'odkaz se nenašel');
  pravda('a hlavní tlačítko vedle něj zůstalo tím, co se nabízí první',
    s.indexOf('btn-primary btn-glow') < s.indexOf('acx-vse'),
    'cesta ven předběhla hlavní tlačítko');
}

console.log('\nCesta ven z okresu');
console.log(zpravy.join('\n'));
console.log(`\nzměřeno: ${okresni.length} okresních a ${krajske.length} krajských stránek`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Cesta ven: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
