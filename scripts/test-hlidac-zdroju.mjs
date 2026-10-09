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
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { porovnejZdroje, PRAH_SLEDOVANI, PRAH_PROPADU,
  porovnejSHistorii, zapisDoHistorie, DNU_HISTORIE, PRAH_POKLESU, HISTORIE_MAX } from './fetch-opportunities.mjs';

const KOREN_H = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

/* ===== A TO POMALÉ VYKRVÁCENÍ ======================================
   Porovnání s MINULÝM během chytí skok. Zdroj, který ubývá po
   kouscích, ne: při 10 % za běh a čtyřech bězích denně je za necelé
   dva dny na polovině a ani jeden krok nepřekročí PRAH_PROPADU.
   Druhé síto porovnává dnešek s MEDIÁNEM posledních dnů. */
{
  const den = (i) => '2026-10-' + String(i).padStart(2, '0');
  const historie = (pocty) => {
    const dny = {};
    pocty.forEach((p, i) => { dny[den(i + 1)] = { Portál: p }; });
    return { verze: 1, dny };
  };
  const dnes = den(9);
  const ted = (p) => [{ nazev: 'Portál', stav: 'ok', pocet: p }];
  const stabilni = historie([100, 100, 100, 100, 100, 100, 100, 100]);

  pravda(`prah poklesu je ${PRAH_POKLESU} × medián až ${DNU_HISTORIE} dnů`,
    PRAH_POKLESU === 0.7 && DNU_HISTORIE === HISTORIE_MAX);
  pravda('běžné kolísání se nehlásí (95 proti mediánu 100)',
    porovnejSHistorii(stabilni, ted(95), dnes).length === 0);
  pravda('pokles na 69 % se hlásí', (() => {
    const n = porovnejSHistorii(stabilni, ted(69), dnes);
    return n.length === 1 && n[0].druh === 'pokles' && n[0].median === 100 && n[0].ted === 69;
  })());
  pravda('pokles na 71 % ještě ne (mez platí z obou stran)',
    porovnejSHistorii(stabilni, ted(71), dnes).length === 0);

  /* TOHLE JE TEN PŘÍPAD, KVŮLI KTERÉMU TO VZNIKLO. Žádný krok není
     propad, a přesto je zdroj na 59 % toho, co nosil. */
  const vykrvaceni = historie([100, 95, 90, 86, 81, 77, 73, 70]);
  pravda('pomalé vykrvácení po ~5 % na krok: minulý běh mlčí',
    porovnejZdroje([{ nazev: 'Portál', pocet: 70 }], ted(66)).length === 0);
  /* A TOHLE JE DŮVOD, PROČ JE OKNO DLOUHÉ. Se sedmidenním oknem
     tahle kontrola NEPROŠLA: medián klesal s daty (z 8 dnů vyšel 81)
     a 59 nad 0,7 × 81 projde. S dlouhým oknem je medián 86 a 59
     spadne pod mez. */
  pravda('ale medián delšího okna ho pozná', (() => {
    const n = porovnejSHistorii(vykrvaceni, ted(59), dnes);
    return n.length === 1 && n[0].druh === 'pokles';
  })(), 'krátké okno klesá s daty a vykrvácení nepozná');

  /* Plané poplachy. Krátká historie, malý zdroj a zdroj, který dnes
     nedojel, se nehlásí — jinak by hlídač křičel po každém výpadku. */
  pravda('ze čtyř dnů se medián nepočítá',
    porovnejSHistorii(historie([100, 100, 100, 100]), ted(10), dnes).length === 0);
  /* A TOTÉŽ, ALE Z JINÉ STRANY. Historie může mít dnů dost a přesto
     o TOMHLE zdroji vědět málo — zdroj se přidal nedávno nebo pár dnů
     nedojel. Rozhoduje tedy počet dnů, kde ten zdroj JE.
     (Sabotáž „medián se počítá i z jednoho dne" na vnější podmínce
     neprošla právě proto, že rozhoduje až tahle; teď jsou obě
     prokazatelné.) */
  pravda('a nepočítá se ani tehdy, když historie o tom zdroji ví jen pár dnů', (() => {
    const dny = {};
    for (let i = 1; i <= 7; i++) dny[den(i)] = i <= 4 ? { Portál: 100 } : { Jiný: 500 };
    return porovnejSHistorii({ verze: 1, dny }, ted(10), dnes).length === 0;
  })());
  pravda(`zdroj pod PRAH_SLEDOVANI (${PRAH_SLEDOVANI}) se nehlídá`,
    porovnejSHistorii(historie([10, 10, 10, 10, 10, 10, 10]), ted(1), dnes).length === 0);
  pravda('zdroj, který dnes vůbec nedojel, se neřeší tady (má vlastní stav)',
    porovnejSHistorii(stabilni, [{ nazev: 'Portál', stav: 'chyba', pocet: 0 }], dnes).length === 0);
  pravda('a dnešek se do mediánu nepočítá (jinak by se měřil sám sebou)',
    porovnejSHistorii({ verze: 1, dny: Object.assign({}, stabilni.dny, { [dnes]: { Portál: 10 } }) },
      ted(69), dnes).length === 1);

  /* Zápis do historie: jeden den jeden záznam, a paměť se nepřetéká. */
  {
    const h1 = zapisDoHistorie(stabilni, ted(42), dnes);
    pravda('zápis přidá dnešek', h1.dny[dnes] && h1.dny[dnes]['Portál'] === 42);
    const h2 = zapisDoHistorie(h1, ted(43), dnes);
    pravda('a druhý běh téhož dne ho přepíše, nepřidá', h2.dny[dnes]['Portál'] === 43
      && Object.keys(h2.dny).length === Object.keys(h1.dny).length);
    let h3 = { verze: 1, dny: {} };
    for (let i = 1; i <= HISTORIE_MAX + 10; i++) {
      h3 = zapisDoHistorie(h3, ted(100), '2026-01-' + String(i).padStart(2, '0'));
    }
    pravda(`paměť se drží na ${HISTORIE_MAX} dnech`, Object.keys(h3.dny).length === HISTORIE_MAX);
    pravda('a zahazuje se nejstarší, ne nejnovější',
      !h3.dny['2026-01-01'] && !!h3.dny['2026-01-' + String(HISTORIE_MAX + 10).padStart(2, '0')]);
    pravda('zdroj v chybě se do historie nezapisuje (nezkazí budoucí medián)',
      !Object.prototype.hasOwnProperty.call(
        zapisDoHistorie(stabilni, [{ nazev: 'Portál', stav: 'chyba', pocet: 0 }], dnes).dny[dnes], 'Portál'));
  }

  /* A NAKONEC NA SKUTEČNÝCH ČÍSLECH. Prah 0,7 × medián nesmí vyhlásit
     poplach na historii, kterou máme — tam se za 19 dnů nic nerozbilo.
     Kdyby ho vyhlásil, je prah utažený a hlásil by každý den plano. */
  const cesta = path.join(KOREN_H, 'data', 'zdroje-historie.json');
  if (existsSync(cesta)) {
    const h = JSON.parse(readFileSync(cesta, 'utf8'));
    const dny = Object.keys(h.dny || {}).sort();
    pravda(`historie zdrojů v repozitáři má ${dny.length} dnů`, dny.length >= 10,
      'dnů jen ' + dny.length + ' — hlídač zatím nemá z čeho počítat');
    let poplachu = 0, porovnani = 0;
    for (let i = 5; i < dny.length; i++) {
      const vyrez = { verze: 1, dny: {} };
      for (const d of dny.slice(0, i)) vyrez.dny[d] = h.dny[d];
      const dnesni = Object.entries(h.dny[dny[i]]).map(([nazev, pocet]) => ({ nazev, stav: 'ok', pocet }));
      porovnani++;
      poplachu += porovnejSHistorii(vyrez, dnesni, dny[i]).length;
    }
    pravda(`na ${porovnani} dnech skutečné historie nevyhlásil ani jeden planý poplach (${poplachu})`,
      poplachu === 0, 'poplachů ' + poplachu + ' — prah je utažený');
  } else {
    pravda('data/zdroje-historie.json existuje', false, 'bez něj hlídač nemá paměť');
  }
}

console.log('\nHlídač jednotlivých zdrojů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Hlídač zdrojů: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
