/* Test: ohledávací nástroj a jeho hledání v obsahu
   ==================================================================
   Spuštění: node scripts/test-ohledej.mjs   (bez sítě, bez prohlížeče)

   PROČ TEPRVE TEĎ. `scripts/ohledej.mjs` je nástroj, kterým se měří
   cizí zdroje — a neměl jedinou zkoušku. Vyšlo to najevo tak, jak to
   u nehlídaného nástroje vyjít musí: 4. 11. jsem se jím ptal, kolik
   nabídek ÚZSVM je spoluvlastnický podíl, a `--najdi` nevypsalo NIC.
   Ani nálezy, ani „nenašlo se". Hledání totiž viselo jen na HTML a na
   „ostatním"; u JSON a CSV se nevolalo vůbec.

   To je přesně ten druh vady, který kazí měření, ne web: mlčení se
   nedá odlišit od nuly nálezů, takže jsem z prázdné odpovědi mohl
   usoudit „žádné podíly tam nejsou" — a to by byl falešný klid.

   Hlídá se proto obojí: že hledání odpovídá i na nulu nálezů, a že se
   volá ve VŠECH ČTYŘECH větvích výpisu (JSON, CSV, HTML, ostatní).
   ================================================================== */
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import * as O from './ohledej.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1) NULA NÁLEZŮ JE ODPOVĚĎ, NE MLČENÍ ---- */
{
  const r = O.vypisNalezy('nic zajímavého', 'spoluvl');
  je('bez nálezu se vypíše jeden řádek', r.length, 1);
  pravda('a je v něm řečeno, že se nenašlo ANI JEDNOU',
    /NENAŠLO ANI JEDNOU/.test(r[0]), JSON.stringify(r));
  je('bez vzoru se nehledá a nic se nevypisuje', O.vypisNalezy('cokoli', ''), []);
  const chybny = O.vypisNalezy('cokoli', '[nedovřená');
  pravda('rozbitý vzor se řekne, nespadne na něm celé měření',
    chybny.length === 1 && /nepodařilo přečíst/.test(chybny[0]), JSON.stringify(chybny));
}

/* ---- 2) NÁLEZ NESE OKOLÍ, NE JEN SLOVO ---- */
{
  const r = O.vypisNalezy('Břežany u Rakovníka, id. 1/2 pozemků parc.č. 213/51', 'id\\.\\s*\\d+\\s*/\\s*\\d+');
  pravda('hlavička říká, co a kolikrát se našlo', /^NALEZENO /.test(r[0]), JSON.stringify(r));
  pravda('a okolí nálezu nese i to, co je kolem', /Břežany/.test(r[1] || ''), JSON.stringify(r));
  /* Značky se odřezávají: bez toho by bylo okolí plné tříd a popisek
     by se do něj nevešel. */
  const h = O.vypisNalezy('<div class="aaaaaaaaaaaaaaaaaaaa"><b>obec</b> Břežany</div>', 'obec');
  pravda('ze HTML se do okolí dostane text, ne značky',
    /obec Břežany/.test(h[1] || ''), JSON.stringify(h));
}

/* ---- 3) STROP NA POČET NÁLEZŮ A JEHO PŘIZNÁNÍ ---- */
{
  const text = Array.from({ length: O.STROP_NALEZU + 5 }, (_, i) => 'obec ' + i).join(' ');
  const r = O.vypisNalezy(text, 'obec');
  je('vypíše se nejvýš strop nálezů', r.length - 1, O.STROP_NALEZU);
  pravda('a že jich je víc, se přizná znakem „+"',
    /\(\d+\+\)/.test(r[0]), JSON.stringify(r[0]));
}

/* ---- 4) HLEDÁ SE NA VŠECH CESTÁCH VÝPISU ----
 *
 * Tohle je ta vada ze 4. 11.: u JSON a CSV se `vypisNalezy` nevolalo,
 * takže nástroj u API mlčel. Čte se kód, protože výpis chodí na
 * konzoli po síťovém dotazu a ten zkouška dělat nebude.
 */
{
  const kod = readFileSync(new URL('./ohledej.mjs', import.meta.url), 'utf8');
  const bezKomentaru = kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const volani = (bezKomentaru.match(/for \(const r of vypisNalezy\(/g) || []).length;
  /* Pět cest, kterými obsah vychází: JSON, CSV, HTML, „ostatní"
     a vykreslení prohlížečem. Na každé se musí hledat, protože na
     které se nehledá, tam nástroj mlčí — a mlčení se nedá odlišit od
     nuly nálezů. */
  je('vypisNalezy se volá na všech PĚTI cestách výpisu', volani, 5);
  /* A jmenovitě v té, kde to chybělo: hledá se v SUROVÉM těle, ne
     v rozebraném objektu — tak se najde i to, co se do zkráceného
     výpisu nevejde. */
  const iJson = bezKomentaru.indexOf("co === 'JSON'");
  const vetev = iJson > 0 ? bezKomentaru.slice(iJson, iJson + 400) : '';
  pravda('v JSON větvi se hledá v surovém těle (text), ne v objektu',
    /vypisNalezy\(text, NAJDI\)/.test(vetev), vetev.slice(0, 200));
  pravda('a je to PŘED rozborem, takže se vypíše i u nečitelného JSON',
    vetev.indexOf('vypisNalezy') < vetev.indexOf('JSON.parse'), vetev.slice(0, 200));
}

/* ---- 4b) ČTYŘI SLEPÁ MÍSTA, KTERÁ NAŠEL SABOTÁŽNÍ STROJ ----
 *
 * Zkoušku jsem napsal a stroj v ní hned našel čtyři místa, kde se dá
 * kód obrátit a nikdo se neozve. Všechna čtyři jsou v místech, která
 * rozhodují o tom, CO SE VŮBEC VYPÍŠE — tedy v tom, čím se měří.
 */
{
  /* a) HRANA KRÁTKÉHO SEZNAMU. Krátké seznamy se vypíšou celé, protože
     právě v nich bývají čísla kategorií, bez kterých se zdroj nedá
     filtrovat. Seznam PŘESNĚ na mezi je ještě krátký. */
  const polozky = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
  je('seznam přesně na mezi je ještě krátký', O.malySeznam(polozky(20), 20), true);
  je('a o jeden delší už není', O.malySeznam(polozky(21), 20), false);
  je('prázdný seznam není „krátký seznam" (nebylo by co vypsat)',
    O.malySeznam([], 20), false);
  je('a pole čísel taky ne (vypisují se záznamy, ne hodnoty)',
    O.malySeznam([1, 2, 3], 20), false);

  /* b) DVA NÁLEZY VEDLE SEBE. Po každém nálezu se pokračuje tam, kde
     skončil; posunout se o znak víc smí JEN u prázdné shody, kde by
     se to jinak zacyklilo. Posouvat se vždycky znamená přehlédnout
     nález, který začíná hned za předchozím. */
  const r = O.vypisNalezy('obecobec', 'obec');
  je('dva nálezy těsně za sebou se najdou oba', r.length - 1, 2);
  /* A pojistka proti zacyklení pořád drží: vzor, který umí prázdnou
     shodu, musí doběhnout, ne zatuhnout. */
  const prazdny = O.okoliNalezu('abc', /x*/, 5, 10);
  pravda('vzor s prázdnou shodou doběhne a nezacyklí se',
    Array.isArray(prazdny) && prazdny.length <= 5, JSON.stringify(prazdny));

  /* c) VNOŘENÝ OBJEKT SE DO ŘÁDKU NEVYPISUJE. Bez té pojistky by se
     do jednoho řádku vysypal celý vnořený JSON — a u odpovědi
     s obrázkem v base64 by to byl log o stovkách kilobajtů. */
  const radky = O.vypisSeznam('Categories', [
    { id: 13, nazev: 'Pozemky', Subcategories: [{ id: 1, nazev: 'Lesy' }], meta: null },
  ]);
  const telo = radky.slice(1).join('\n');
  pravda('do řádku jdou jen jednoduché hodnoty, ne vnořený objekt',
    !/meta=/.test(telo) && !/Subcategories=/.test(telo), telo.slice(0, 200));
  pravda('ale podseznam se vypíše jako vlastní seznam (jsou v něm ta čísla)',
    radky.some((x) => /SEZNAM „Subcategories"/.test(x)), radky.join(' | ').slice(0, 200));

  /* d) MEZ NA DÉLKU VÝPISU. Ptá se na ni modul, ne zkouška sama sebe:
     tautologie „mez z modulu proti meze z modulu" se posune spolu
     s kódem a sabotáž projde zeleně (lekce z §372). */
  je('a výpis obsahu má mez 4 000 znaků (kvůli logu Actions)',
    O.STROP_ZNAKU, 4000);
}

/* ---- 5) ŠETRNOST, KTERÁ SE NESMÍ VYTRATIT ---- */
{
  const kod = readFileSync(new URL('./ohledej.mjs', import.meta.url), 'utf8');
  pravda('robots.txt se čte před stažením', /smiCist|robots/.test(kod));
  pravda('a je jen jedno jméno robota', (kod.match(/User-Agent|'user-agent'/gi) || []).length <= 3);
}

console.log('\nOhledávací nástroj');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.error(`::error::Ohledávání: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
