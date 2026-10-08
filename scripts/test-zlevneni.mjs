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

/* ---- DRUHÁ MEZ, SHORA ----
   Pod MEZ_PROCENT je změna šum, nad MEZ_PODEZRELA je to skoro vždycky
   chyba zdroje. V archivu je ze 139 změn jediná nad 50 % dolů
   (125 000 → 9 000 Kč) a jediná nad 50 % nahoru — u pozemku takový
   skok za pár dnů neexistuje. Zelené „Zlevněno o 93 %" na kartě by
   zvalo ke kliknutí na cenu, která v inzerátu nestojí. */
{
  const velka = Z.krok(125000, 9000, '2026-09-29');
  pravda('skok o 93 % se označí za podezřelý', !!velka && velka.podezrela === true);
  pravda('a neříká se o něm „zlevněno"',
    !/[Zz]levněno/.test(Z.text(velka)) && /ověřit/.test(Z.text(velka)), 'text: ' + Z.text(velka));
  pravda('popisek radí ověřit cenu v inzerátu',
    /chyba zdroje/.test(Z.popis(velka, String)), 'popis: ' + Z.popis(velka, String));
  pravda('ale číslo se nezatajuje', /93/.test(Z.text(velka)), 'text: ' + Z.text(velka));

  const nahoru = Z.krok(97000, 164775, '');
  pravda('a platí to i na skok nahoru', !!nahoru && nahoru.podezrela === true);

  /* Obě strany hranice, jinak není vidět, že se opravdu kontroluje. */
  const pod = Z.krok(100000, 100000 * (1 - (Z.MEZ_PODEZRELA - 1) / 100), '');
  const na = Z.krok(100000, 100000 * (1 - Z.MEZ_PODEZRELA / 100), '');
  pravda(`o procento pod hranicí (${Z.MEZ_PODEZRELA - 1} %) je to ještě sleva`,
    !!pod && pod.podezrela === false && /Zlevněno/.test(Z.text(pod)), 'text: ' + Z.text(pod));
  pravda(`přesně na hranici (${Z.MEZ_PODEZRELA} %) už ne`, !!na && na.podezrela === true);

  /* A obyčejná sleva se tím nesmí pokazit. */
  const bezna = Z.krok(450000, 399000, '2026-09-15');
  pravda('běžná sleva zůstala slevou',
    !!bezna && bezna.podezrela === false && Z.text(bezna) === 'Zlevněno o 11 %', 'text: ' + Z.text(bezna));

  /* krok() a zmena() musí vydat totéž — jinak by karta (zmena)
     a historie ceny (krok) tvrdily o jedné ceně dvě různé věci. */
  const a = Z.zmena({ price: 399000, cena_drive: 450000, cena_zmena: '2026-09-15' });
  pravda('krok() a zmena() dávají tentýž údaj', JSON.stringify(a) === JSON.stringify(bezna),
    JSON.stringify(a) + ' vs ' + JSON.stringify(bezna));
  pravda('krok() mlčí na nesmysly',
    Z.krok(0, 100, '') === null && Z.krok(100, 0, '') === null && Z.krok(100, 100, '') === null);
}

console.log('\nZměna ceny proti minulému běhu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Změna ceny: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
