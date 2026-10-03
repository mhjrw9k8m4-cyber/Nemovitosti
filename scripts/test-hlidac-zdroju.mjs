/* Test: pozná robot, že jeden zdroj tiše přestal nosit data?
 *
 * Spuštění: node scripts/test-hlidac-zdroju.mjs
 *
 * PROČ TAHLE ZKOUŠKA EXISTUJE. Pojistka proti „utržení" dat hlídá SOUČET:
 * když se stáhne míň než 60 % minula, běh skončí chybou a stará data
 * zůstanou. Jenže tišší případ projde: zdroj změní podobu stránky, parser
 * přestane cokoli najít — a protože odpověděl, zapíše se jako „ok,
 * 0 záznamů". U OK dražeb je to 95 nabídek z 2 400, tedy pokles o 4 %:
 * součtová pojistka mlčí a web prostě přestane ukazovat nové dražby
 * z toho portálu. Nikde se to nedozvíme a nikdo si nestěžuje, protože
 * chybějící nabídku nikdo nevidí.
 *
 * Hlídá se obojí: že se propad POZNÁ, a že se nehlásí tam, kde by to
 * bylo plané — malý zdroj kolísá sám od sebe a nový zdroj nemá s čím
 * se porovnat.
 */
import { porovnejZdroje, PRAH_SLEDOVANI, PRAH_PROPADU } from './fetch-opportunities.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const MINULE = [
  { nazev: 'Bezrealitky', pocet: 1785 },
  { nazev: 'OK dražby', pocet: 95 },
  { nazev: 'Dražby', pocet: 90 },
  { nazev: 'Farmy', pocet: 7 },      // pod prahem sledování
];
const najdi = (n, ted) => porovnejZdroje(MINULE, ted).find((x) => x.nazev === n) || null;

/* Pojistka proti bezzubosti: prahy musí dávat smysl, jinak by všechno
   pod tím platilo o jiných číslech, než jaká se zkoušejí. */
pravda('práh sledování je nad velikostí malého zdroje', PRAH_SLEDOVANI > 7 && PRAH_SLEDOVANI < 90,
  `práh ${PRAH_SLEDOVANI}`);
pravda('a práh propadu je zlomek, ne procento', PRAH_PROPADU > 0 && PRAH_PROPADU < 1, `${PRAH_PROPADU}`);

pravda('beze změny se nehlásí nic',
  porovnejZdroje(MINULE, [{ nazev: 'Bezrealitky', stav: 'ok', pocet: 1790 },
    { nazev: 'OK dražby', stav: 'ok', pocet: 98 }]).length === 0);

{
  const n = najdi('OK dražby', [{ nazev: 'OK dražby', stav: 'ok', pocet: 0 }]);
  pravda('zdroj, který odpověděl a nepřinesl nic, se pozná jako „prázdno"',
    n && n.druh === 'prazdno', JSON.stringify(n));
}
{
  const n = najdi('Bezrealitky', [{ nazev: 'Bezrealitky', stav: 'ok', pocet: 600 }]);
  pravda('propad na třetinu se pozná', n && n.druh === 'propad', JSON.stringify(n));
}
{
  const tesne = Math.ceil(1785 * PRAH_PROPADU) + 1;
  pravda('ale pokles těsně nad prahem se nehlásí (zdroje kolísají)',
    najdi('Bezrealitky', [{ nazev: 'Bezrealitky', stav: 'ok', pocet: tesne }]) === null,
    `při ${tesne} z 1785`);
}
pravda('malý zdroj se nehlídá — kolísá sám od sebe',
  najdi('Farmy', [{ nazev: 'Farmy', stav: 'ok', pocet: 0 }]) === null);
pravda('nový zdroj se nemá s čím porovnat, a tak se nehlásí',
  najdi('Sreality', [{ nazev: 'Sreality', stav: 'ok', pocet: 0 }]) === null);
/* Chybu a vypnutí hlásí stav sám — hlídač by je hlásil podruhé. */
pravda('zdroj, který ohlásil chybu, hlídač nehlásí znovu',
  najdi('Dražby', [{ nazev: 'Dražby', stav: 'chyba', pocet: 0 }]) === null);
pravda('a vypnutý zdroj taky ne',
  najdi('Dražby', [{ nazev: 'Dražby', stav: 'vypnuto', pocet: 0 }]) === null);
/* První běh: žádná minulá čísla. Nesmí spadnout ani nic nahlásit. */
pravda('první běh bez minulých čísel projde tiše',
  porovnejZdroje(null, [{ nazev: 'Cokoli', stav: 'ok', pocet: 0 }]).length === 0);

console.log('\nHlídač jednotlivých zdrojů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Hlídač zdrojů: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
