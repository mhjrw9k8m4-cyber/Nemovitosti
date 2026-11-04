// Zkoušky hlídky tiše rozbitého zdroje (scripts/hlidka-zdroju.mjs
// a počítadlo v scripts/fetch-opportunities.mjs).
//
// Spuštění: node scripts/test-hlidka-zdroju.mjs
//
// PROČ TAHLE HLÍDKA VZNIKLA. Robot skončí chybou jen když spadne
// main(). Zdroj, který je rozbitý a ani druhá cesta ho nezachrání, se
// obslouží „hezky": nabídky se podrží (§220), do logu jde ::error:: —
// a běh je ZELENÝ. Žádný úkol se nezaloží a protože nabídky na webu
// dál jsou, nevypadá nic špatně. Zdroj může být tiše rozbitý týdny.
import { readFileSync } from 'node:fs';
import * as F from './fetch-opportunities.mjs';
import { hlaseni } from './hlidka-zdroju.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}\n      vyšlo  ${a}`); }
}
function pravda(popis, v, proc) {
  if (v) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const beh = (h, zdroje, den) => ({ mimoProvoz: F.zapisMimoProvoz(h, zdroje, den) });

/* ---- 1) POČÍTADLO ----------------------------------------------- */
{
  const rozbity = [{ nazev: 'A', stav: 'chyba', chyba: 'HTTP 500' }];
  let h = {};
  h = beh(h, rozbity, '2026-11-01');
  je('první výpadek se zapíše jako jeden běh', h.mimoProvoz.A.behu, 1);
  je('a pamatuje si, odkdy', h.mimoProvoz.A.od, '2026-11-01');
  h = beh(h, rozbity, '2026-11-02');
  h = beh(h, rozbity, '2026-11-03');
  je('třetí běh v řadě', h.mimoProvoz.A.behu, 3);
  je('datum začátku se NEPŘEPISUJE', h.mimoProvoz.A.od, '2026-11-01');
  /* UZDRAVENÍ MAŽE. Jinak by se zdroj, který se spravil, hlásil navždy
     a hlídka by se stala šumem, který se přestane číst. */
  const po = beh(h, [{ nazev: 'A', stav: 'ok' }], '2026-11-04');
  je('zdroj v pořádku počítadlo vynuluje', po.mimoProvoz, {});
}

/* ---- 2) CO SE NEPOČÍTÁ ------------------------------------------ */
{
  /* `vypnuto` = chybí klíč, zdroj se ani nezkoušel. Hlásit to denně
     je planý poplach, který se naučí přehlížet — a tím se hlídka
     odzbrojí sama. „druhá cesta" je stav, kdy zdroj FUNGUJE, jen se
     čte jinak; právě k tomu ta cesta je. */
  const h = beh({}, [
    { nazev: 'Vypnutý', stav: 'vypnuto' },
    { nazev: 'Jinou cestou', stav: 'druhá cesta' },
    { nazev: 'Rozbitý', stav: 'prazdno' },
  ], '2026-11-01');
  je('vypnutý zdroj se nepočítá', h.mimoProvoz.Vypnutý, undefined);
  je('druhá cesta se nepočítá', h.mimoProvoz['Jinou cestou'], undefined);
  je('ale prázdná odpověď ano', h.mimoProvoz.Rozbitý && h.mimoProvoz.Rozbitý.behu, 1);
}

/* ---- 3) MEZ ------------------------------------------------------ */
{
  const mimo = {
    Dva: { behu: 2, od: '2026-11-02', stav: 'chyba', duvod: 'x' },
    Tri: { behu: 3, od: '2026-11-01', stav: 'prazdno', duvod: 'nic nepřišlo' },
    Pet: { behu: 5, od: '2026-10-30', stav: 'chyba', duvod: 'HTTP 500' },
  };
  je('dva běhy ještě nestačí', F.dlouhoMimo(mimo).map((z) => z.nazev), ['Pet', 'Tri']);
  je('a řadí se od nejdéle rozbitého', F.dlouhoMimo(mimo)[0].nazev, 'Pet');
  /* OPAČNÝ SMĚR: ať se to nedá „splnit" tím, že se nehlásí nikdy. */
  je('při nule mimo pořádek není hlášení žádné', F.dlouhoMimo({}), []);
  pravda('hlášení jmenuje zdroj, počet běhů i důvod',
    /Pet/.test(hlaseni(F.dlouhoMimo(mimo))) && /5\. běh/.test(hlaseni(F.dlouhoMimo(mimo)))
    && /HTTP 500/.test(hlaseni(F.dlouhoMimo(mimo))),
    hlaseni(F.dlouhoMimo(mimo)));
}

/* ---- 4) ŽE SE TÍM ROBOT OPRAVDU ŘÍDÍ ---------------------------- */
{
  const kod = readFileSync(new URL('./fetch-opportunities.mjs', import.meta.url), 'utf8');
  const bezKom = kod.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  pravda('robot počítadlo opravdu zapisuje do historie',
    /mimoProvoz\s*=\s*zapisMimoProvoz\(/.test(bezKom) && /verze: 4, dny, ceny, mimoProvoz/.test(bezKom),
    'bez toho by hlídka měřila soubor, do kterého nikdo nepíše');

  /* A HLÍDKA MUSÍ BĚŽET AŽ ZA COMMITEM. Kdyby skončil chybou krok
     „Stáhnout data", GitHub přeskočí všechno za ním — tedy i commit.
     Den, kdy se zdroj pokazí, by byl i dnem, kdy se zahodí všechno,
     co se stáhnout PODAŘILO. */
  const wf = readFileSync(new URL('../.github/workflows/update-data.yml', import.meta.url), 'utf8');
  const iCommit = wf.indexOf('Commit změn');
  const iHlidka = wf.indexOf('hlidka-zdroju.mjs');
  pravda('hlídka je ve workflow robota', iHlidka > 0, 'jinak se nikdy nespustí');
  pravda('a běží AŽ ZA commitem (jinak by červená zahodila stažená data)',
    iCommit > 0 && iHlidka > iCommit, `commit na ${iCommit}, hlídka na ${iHlidka}`);
}

/* ---- 5) „NEVÍM" NENÍ „V POŘÁDKU" -------------------------------- */
{
  const kodH = readFileSync(new URL('./hlidka-zdroju.mjs', import.meta.url), 'utf8');
  /* ŘÁDKOVÉ KOMENTÁŘE SE MUSÍ ODŘÍZNOUT TAKY. Odřízl jsem napoprvé
     jen blokové, takže sabotáž „zakomentuj `process.exitCode = 1`"
     prošla zeleně — zakomentovaný řádek ten text pořád obsahuje.
     Je to potřetí dnes táž past (§358, §362): kontrola, která čte
     kód, musí číst KÓD, ne dokumentaci. */
  const bez = kodH.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  pravda('chybějící počítadlo se hlásí jako „zatím není", ne jako pořádek',
    /if \(!historie\.mimoProvoz\)/.test(bez) && /zatím není/.test(bez),
    'napsal jsem to nejdřív špatně: hlídka tvrdila „všechny zdroje v pořádku",'
    + ' i když nic nezměřila — přesně ta vada, kterou má hlídat');
  pravda('a nález končí červeně, jinak se úkol nezaloží',
    /process\.exitCode = 1/.test(bez) && /::error::/.test(bez));
}

/* ---- OZVAT SE, ALE NE KAŽDÝCH ŠEST HODIN TOTÉŽ -----------------
   NALEZENO NAOSTRO 4. 11.: hlídka se u Dražeb ozvala při třetím běhu
   v řadě — správně — a pak při čtvrtém, pátém a šestém znovu. Úkol se
   přitom zakládá jeden, takže šestý červený běh už nikomu nic neřekl.
   Červená, která svítí každý den ze stejného důvodu, se přestane čist
   a zapadne v ní i poplach, který je nový. */
{
  const m = (n) => F.jeMeznik(n);
  pravda('ozve se při 3. běhu v řadě', m(3) === true);
  pravda('při 4. a 5. už ne', m(4) === false && m(5) === false);
  pravda('ale při 6., 12., 24. znovu (dvakrát tak dlouhý úbytek)',
    m(6) === true && m(12) === true && m(24) === true,
    JSON.stringify([m(6), m(12), m(24)]));
  pravda('mezi mezníky ticho', [7, 8, 9, 10, 11, 13, 23].every((n) => m(n) === false));
  pravda('pod mezí se neozve vůbec', m(1) === false && m(2) === false);
  je('a řekne se, kdy se to připomene', F.dalsiMeznik(7), 12);

  const mimo = {
    Nove: { behu: 3, od: '2026-11-04', stav: 'chyba', duvod: 'HTTP 500' },
    Stare: { behu: 7, od: '2026-10-30', stav: 'prazdno', duvod: 'nic' },
    Kratke: { behu: 2, od: '2026-11-04', stav: 'chyba', duvod: 'x' },
  };
  je('k ohlášení jde jen ten na mezníku', F.kOhlaseni(mimo).map((z) => z.nazev), ['Nove']);
  /* Ale „není na mezníku" neznamená „není mimo pořádek": přehled musí
     dál vidět oba. Jinak by se tichý zdroj ztratil úplně. */
  je('přehled přesto zná oba, co mez překročily',
    F.dlouhoMimo(mimo).map((z) => z.nazev).sort(), ['Nove', 'Stare']);
  /* A hlídka to opravdu takhle používá — jinak by to byla funkce,
     kterou nikdo nevolá. */
  const telo = readFileSync(new URL('./hlidka-zdroju.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  pravda('hlídka se řídí mezníky a mezi nimi jen vypisuje',
    /const nalez = kOhlaseni\(mimo\)/.test(telo)
    && /const prekrocili = dlouhoMimo\(mimo\)/.test(telo)
    && /dalsiMeznik\(p\.behu\)/.test(telo),
    'hlídka mezníky nepoužívá');
}

console.log('Hlídka zdrojů:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) {
  console.error(`::error::Hlídka zdrojů: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' Bez téhle hlídky může být zdroj tiše rozbitý týdny a běh zůstane zelený.');
  process.exit(1);
}
