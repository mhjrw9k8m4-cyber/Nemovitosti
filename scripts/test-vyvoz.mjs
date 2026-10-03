/* Test: vývoz vyfiltrovaných nabídek do tabulky (js/vyvoz.js).
 *
 * Spuštění: node scripts/test-vyvoz.mjs
 *
 * PROČ TAHLE ZKOUŠKA. Tabulka je soubor, který si člověk otevře jinde —
 * když se v ní něco rozsype, web o tom neví a nikdo to nehlásí. Tři věci
 * se rozsypou nejsnáz a každá tiše:
 *   · ODDĚLOVAČ. Český Excel čeká středník. S čárkou otevře všechno
 *     v jednom sloupci — soubor „jde stáhnout" a je k ničemu.
 *   · UVOZOVKY. Název obce se středníkem nebo uvozovkou rozhodí řádek
 *     a sloupce se posunou, aniž by to bylo na první pohled vidět.
 *   · CENA ZA METR. U spoluvlastnického podílu je v ceně zlomek, ale
 *     výměra celá — dělit jedno druhým dá číslo desetkrát nižší. Mapa
 *     i stránka pozemku to počítají přes js/ceny.js; tabulka musí taky,
 *     jinak si do ní někdo přenese nejklamavější číslo na webu.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const V = req(path.join(ROOT, 'js', 'vyvoz.js'));
/* js/ceny.js není modul pro require: je to IIFE, která se zapíše do
   window (na webu) nebo globalThis. Načte se proto do vlastního
   prostoru, aby test nesahal na skutečné globální proměnné. */
const _ceny = {};
new Function('globalThis', readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8')).call(_ceny, _ceny);
const CENY = _ceny.PK_CENY;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const pomocne = { zaMetr: CENY.zaMetr, klic: (d) => 'K:' + (d.place || '') };

/* --- 1) Hlavička a tvar souboru ------------------------------------ */
{
  const t = V.csv([], pomocne);
  const prvni = t.split('\r\n')[0];
  pravda('soubor má hlavičku se jmény sloupců', prvni.split(';').length === V.SLOUPCE.length,
    prvni);
  pravda('a odděluje středníkem, ne čárkou (český Excel jinak dá vše do jednoho sloupce)',
    prvni.indexOf(';') !== -1 && prvni.indexOf(',') === -1, prvni);
  pravda('řádky končí CRLF (poradí si s tím i starší Excel)', /\r\n$/.test(t), JSON.stringify(t.slice(-4)));
  /* BOM patří k souboru, ne k textu — připíná ho až stahování. Kdyby byl
     tady, každé porovnání textu by o něj zakoplo. */
  pravda('text sám nezačíná značkou BOM', t.charCodeAt(0) !== 0xFEFF, 'BOM je v textu');
}

/* --- 2) Počet řádků a pořadí --------------------------------------- */
{
  const D = [
    { place: 'Kolín', okres: 'Kolín', druh: 'orná půda', type: 'sale', area: 1000, price: 100000 },
    { place: 'Tábor', okres: 'Tábor', druh: 'zahrada', type: 'drazba', area: 500, price: 50000, extra: 'dražba 2026-10-07' },
  ];
  const r = V.csv(D, pomocne).trim().split('\r\n');
  pravda('řádků je tolik, kolik je nabídek (plus hlavička)', r.length === D.length + 1, `řádků ${r.length}`);
  pravda('a jdou ve stejném pořadí, v jakém přišly',
    r[1].indexOf('Kolín') === 0 && r[2].indexOf('Tábor') === 0, r.slice(1).join(' | '));
  pravda('termín dražby je v českém tvaru', /;7\.10\.2026;/.test(r[2]), r[2]);
  pravda('a u nabídky bez dražby zůstane prázdný', /;;/.test(r[1]), r[1]);
}

/* --- 3) Uvozovky: název, který by jinak rozhodil sloupce ------------ */
{
  const D = [{ place: 'Ves; "u lesa"', okres: 'X', druh: 'les', type: 'sale', area: 10, price: 10 }];
  const radek = V.csv(D, pomocne).trim().split('\r\n')[1];
  pravda('pole se středníkem a uvozovkou se uzavře a uvozovky se zdvojí',
    radek.indexOf('"Ves; ""u lesa"""') === 0, radek);
  /* A ZDA TO OPRAVDU K NĚČEMU JE. Naivní split(';') se na správně
     uvozeném poli rozpadnout MUSÍ — tabulkový program ale uvozovky čte,
     takže se čte stejně: polem se prochází znak po znaku a středník
     uvnitř uvozovek se za oddělovač nepočítá. Teprve tím se pozná, že
     uvozování drží sloupce pohromadě. */
  const ctiRadek = (txt) => {
    const out = []; let pole = '', v = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (v) {
        if (c === '"' && txt[i + 1] === '"') { pole += '"'; i++; }
        else if (c === '"') v = false;
        else pole += c;
      } else if (c === '"') v = true;
      else if (c === ';') { out.push(pole); pole = ''; }
      else pole += c;
    }
    out.push(pole);
    return out;
  };
  /* Nejdřív že se to měřidlo nerozbilo: na hlavičce, kde žádné uvozovky
     nejsou, musí vyjít přesně tolik polí, kolik je sloupců. */
  const hlavicka = ctiRadek(V.csv(D, pomocne).trim().split('\r\n')[0]);
  pravda('čtení řádku souhlasí na hlavičce (jinak by se měřilo samo sebou)',
    hlavicka.length === V.SLOUPCE.length, `polí ${hlavicka.length}, sloupců ${V.SLOUPCE.length}`);
  const pola = ctiRadek(radek);
  pravda('a řádek se tím nerozpadne: polí je přesně tolik, kolik je hlaviček',
    pola.length === V.SLOUPCE.length, `polí ${pola.length}, hlaviček ${V.SLOUPCE.length}`);
  pravda('a středník i uvozovky zůstanou uvnitř prvního pole',
    pola[0] === 'Ves; "u lesa"', `první pole: „${pola[0]}"`);
  /* Naivní rozdělení naopak selže — tím je vidět, že ta past je skutečná. */
  pravda('past je skutečná: naivní split(\';\') ten řádek rozpadne',
    radek.split(';').length > V.SLOUPCE.length,
    `naivně ${radek.split(';').length} polí proti ${V.SLOUPCE.length} sloupcům`);
}

/* --- 4) Cena za metr u spoluvlastnického podílu --------------------- */
{
  const podil = { place: 'P', okres: 'P', druh: 'les', type: 'sale',
    area: 4000, price: 100000, podil: true, zlomek: '1/4' };
  const surove = Math.round(podil.price / podil.area);          // 25 — klamavé
  const spravne = Math.round(CENY.zaMetr(podil));               // 100
  pravda('past je skutečná: surový výpočet dá jiné číslo než js/ceny.js',
    surove !== spravne, `surově ${surove}, přes ceny.js ${spravne}`);
  const radek = V.csv([podil], pomocne).trim().split('\r\n')[1].split(';');
  const vTabulce = Number(radek[V.SLOUPCE.indexOf('Cena za m² (Kč)')]);
  pravda('v tabulce je cena za metr z výměry, která kupujícímu připadne',
    vTabulce === spravne, `v tabulce ${vTabulce}, čekáno ${spravne}`);
  const iPodil = V.SLOUPCE.indexOf('Podíl');
  pravda('a podíl je v tabulce vidět', radek[iPodil] === '1/4', `sloupec podíl: „${radek[iPodil]}"`);
}

/* --- 5) Název souboru ---------------------------------------------- */
{
  const n = V.nazev('Stavební / zastavěná do 2 mil', new Date(2026, 9, 3));
  pravda('název nese datum', n.indexOf('parcelka-2026-10-03') === 0, n);
  pravda('a filtr bez diakritiky a mezer', /stavebni/.test(n) && !/[ěščřžýáíéúůď ]/i.test(n), n);
  pravda('končí na .csv', /\.csv$/.test(n), n);
  pravda('bez filtru se jméno nerozbije', /^parcelka-2026-10-03\.csv$/.test(V.nazev('', new Date(2026, 9, 3))),
    V.nazev('', new Date(2026, 9, 3)));
}

console.log('\nVývoz do tabulky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Vývoz do tabulky: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
