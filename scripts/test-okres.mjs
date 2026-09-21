// Test: sedí okres, do kterého pozemek zařadíme?
//
// Spuštění: node scripts/test-okres.mjs   (nepotřebuje prohlížeč ani síť)
//
// Okres se u inzerátů, které ho sami neuvádějí, dopočítává ze souřadnic.
// Dřív se hledalo NEJBLIŽŠÍ OKRESNÍ MĚSTO — a to je dvakrát vedle:
// nejbližší město není okres, ve kterém obec leží, a vzdálenost se navíc
// počítala ve stupních, jako by stupeň zeměpisné délky byl stejně dlouhý
// jako stupeň šířky (u nás je o třetinu kratší). Holedeč v okrese Louny
// tak na webu visela jako okres Most. Takovou chybu člověk z kraje pozná
// okamžitě — a přestane věřit i všemu ostatnímu.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { okresPodleGPS, maHranice, nejblizsiOkresniMesto } from './okres-podle-gps.mjs';

const KOREN = new URL('..', import.meta.url).pathname;
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- 1) Obce, u kterých se dá okres ověřit v katastru ---------------- */
// Schválně jsou vybrané takové, které leží blízko hranice okresu — na
// nich se pozná, jestli se počítá s hranicí, nebo jen s nejbližším městem.
const OBCE = [
  ['Holedeč', 50.2497, 13.5847, 'Louny'],
  ['Veselí nad Lužnicí', 49.18667, 14.69895, 'Tábor'],
  ['Milevsko', 49.4500, 14.3600, 'Písek'],
  ['Týnec nad Labem', 50.0400, 15.3400, 'Kolín'],
  ['Úštěk', 50.5883, 14.3167, 'Litoměřice'],
  ['Česká Kamenice', 50.7970, 14.4180, 'Děčín'],
  ['Koberovy', 50.6300, 15.2400, 'Jablonec nad Nisou'],
  ['Praha (střed)', 50.0875, 14.4213, 'Praha'],
  ['Brno (střed)', 49.1951, 16.6068, 'Brno-město'],
  ['Ostrava (střed)', 49.8209, 18.2625, 'Ostrava-město'],
];
pravda('hranice okresů jsou v repozitáři', maHranice(),
  'chybí data/okresy-hranice.json — okres by se zase jen hádal podle nejbližšího města');
for (const [jmeno, lat, lng, ceka] of OBCE) {
  const vyslo = okresPodleGPS(lat, lng);
  pravda(`${jmeno} → okres ${ceka}`, vyslo === ceka, `vyšlo: ${vyslo}`);
}

/* --- 2) Proč to nejde dělat podle nejbližšího města ------------------ */
// Kdyby někdo v budoucnu hranice zahodil a vrátil se k nejbližšímu městu,
// tahle kontrola mu ukáže, že to není totéž.
const mestem = OBCE.filter(([, lat, lng, ceka]) => nejblizsiOkresniMesto(lat, lng) !== ceka);
pravda('nejbližší okresní město by některé obce zařadilo jinam (proto hranice)',
  mestem.length > 0,
  'na téhle sadě obcí by stačilo i nejbližší město — zkouška nic neověřuje');

/* --- 3) Data na webu: sedí okres u pozemků se souřadnicemi? ---------- */
const data = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
const nabidky = data.opportunities || [];
let mimo = 0;
const ukazky = [];
for (const o of nabidky) {
  // SPÚ i dražby okres samy uvádějí (z katastru), souřadnice jsou jen
  // přibližné místo obce — rozpor tam neznamená chybu v zařazení.
  if (!/Bezrealitky|Sreality/i.test(o.extra || '')) continue;
  if (typeof o.lat !== 'number' || typeof o.lng !== 'number') continue;
  const podleHranice = okresPodleGPS(o.lat, o.lng);
  if (podleHranice && podleHranice !== o.okres) {
    mimo++;
    if (ukazky.length < 5) ukazky.push(`${o.place}: uvedeno ${o.okres}, leží v okrese ${podleHranice}`);
  }
}
pravda('žádný inzerát nevisí v cizím okrese', mimo === 0,
  `${mimo} pozemků má jiný okres, než ve kterém leží:\n      ` + ukazky.join('\n      '));

console.log('\nZařazení pozemku do okresu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Okresy: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
