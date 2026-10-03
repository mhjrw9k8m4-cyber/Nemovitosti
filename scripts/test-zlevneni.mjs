/* Test: věta o změně ceny (js/zlevneni.js).
 *
 * Spuštění: node scripts/test-zlevneni.mjs
 *
 * PROČ TAHLE ZKOUŠKA. „Zlevněno o 25 %" je na webu jediný údaj, který
 * se NEDÁ ověřit zvenčí — minulou cenu vidí člověk jen od nás. Tím spíš
 * musí sedět. Zkouší se proto hlavně to, kdy se má MLČET.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Z = createRequire(import.meta.url)(path.join(ROOT, 'js', 'zlevneni.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* --- kdy se mluví --- */
{
  const z = Z.zmena({ price: 1500000, cena_drive: 2000000, cena_zmena: '2026-09-20' });
  pravda('zlevnění o čtvrtinu se pozná', z && z.dolu === true && z.procent === 25, JSON.stringify(z));
  pravda('a věta zní „Zlevněno o 25 %"', Z.text(z) === 'Zlevněno o 25 %', Z.text(z));
  pravda('v popisku je původní cena i datum',
    /2 000 000 Kč/.test(Z.popis(z, fmt)) && /20\. 9\. 2026/.test(Z.popis(z, fmt)), Z.popis(z, fmt));
}
{
  const z = Z.zmena({ price: 1200000, cena_drive: 1000000 });
  pravda('zdražení se nezamlčuje', z && z.dolu === false && z.procent === 20, JSON.stringify(z));
  pravda('a věta zní „Zdraženo o 20 %"', Z.text(z) === 'Zdraženo o 20 %', Z.text(z));
}

/* --- kdy se MLČÍ --- */
{
  /* Pojistka, ať se mez měří na něčem: těsně POD ní se mlčí, těsně NAD
     ní se mluví. Jinak by kontrola prošla i s mezí nastavenou na 100 %. */
  const podMezi = Math.max(1, Z.MEZ_PROCENT - 1) / 100;
  const nadMezi = (Z.MEZ_PROCENT + 1) / 100;
  pravda(`změna o ${Math.round(podMezi * 100)} % je pod mezí a mlčí se`,
    Z.zmena({ price: Math.round(1000000 * (1 - podMezi)), cena_drive: 1000000 }) === null);
  pravda(`změna o ${Math.round(nadMezi * 100)} % je nad mezí a mluví se`,
    Z.zmena({ price: Math.round(1000000 * (1 - nadMezi)), cena_drive: 1000000 }) !== null);
}
pravda('bez minulé ceny se nic netvrdí', Z.zmena({ price: 1000000 }) === null);
pravda('stejná cena není změna', Z.zmena({ price: 1000000, cena_drive: 1000000 }) === null);
pravda('nulová nebo chybějící dnešní cena taky nic netvrdí',
  Z.zmena({ price: 0, cena_drive: 1000000 }) === null && Z.zmena({ cena_drive: 1000000 }) === null);
pravda('a prázdný vstup nespadne', Z.zmena(null) === null && Z.text(null) === '' && Z.popis(null) === '');

console.log('\nZměna ceny proti minulému běhu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Změna ceny: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
