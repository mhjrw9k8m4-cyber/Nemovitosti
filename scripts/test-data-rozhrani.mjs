// Test: popis dat sedí s daty.
//
// Spuštění: node scripts/test-data-rozhrani.mjs   (nepotřebuje prohlížeč)
//
// data/opportunities.json je veřejný soubor — leží na běžné adrese
// a může si ho vzít kdokoli. Doteď u něj ale nebylo napsané NIC: co
// která položka znamená, jak často se mění, co v datech není. Kdo by
// na nich chtěl něco postavit, musel by to hádat ze jmen polí.
//
// Dokumentace, která se rozejde s daty, je HORŠÍ než žádná: podle
// žádné si člověk ověří skutečnost, podle špatné postaví chybu.
// Proto se porovnává v OBOU směrech — pole v datech bez popisu i popis
// bez pole v datech shodí zkoušku.
//
// A hlídá se to, co se dá postavit špatně i při správném popisu: že
// u ceny stojí „nabídková, ne prodejní", a že u podílu je napsané,
// proč cena za metr vychází nízko. To jsou dvě věci, kvůli kterým by
// cizí výpočet nad těmihle daty vyšel nesmyslně.
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nPopis dat proti datům');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Popis dat: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

const cestaPopis = path.join(KOREN, 'data', 'pole.json');
pravda('popis polí existuje', existsSync(cestaPopis), 'data/pole.json chybí');
if (!existsSync(cestaPopis)) hotovo();
const P = JSON.parse(readFileSync(cestaPopis, 'utf8'));
const D = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
const nabidky = D.opportunities || [];

/* ---- 1) obousměrně: popis proti datům ---- */
{
  const vDatech = new Map();
  for (const o of nabidky) {
    for (const k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      vDatech.set(k, (vDatech.get(k) || 0) + 1);
    }
  }
  // PŘEDPOKLAD: bez dat by obě kontroly prošly naprázdno
  pravda('je co porovnávat — data mají nabídky a pole',
    nabidky.length > 100 && vDatech.size >= 10,
    `nabídek ${nabidky.length}, polí ${vDatech.size}`);

  const bezPopisu = [...vDatech.keys()].filter((k) => !P.pole[k]);
  pravda('každé pole v datech má popis', bezPopisu.length === 0,
    bezPopisu.join(', ') + ' — kdo si data vezme, musel by hádat');
  const navic = Object.keys(P.pole).filter((k) => !vDatech.has(k));
  pravda('a popis nemluví o poli, které v datech není', navic.length === 0,
    navic.join(', '));

  const vHlave = Object.keys(D).filter((k) => k !== 'opportunities');
  const hlavaBez = vHlave.filter((k) => !P.hlava[k]);
  pravda('totéž platí pro hlavičku souboru', hlavaBez.length === 0, hlavaBez.join(', '));

  /* „vždy" musí být pravda. Pole označené za povinné, které u části
     záznamů chybí, je nejhorší druh dokumentace: cizí kód na něj
     spolehne a spadne až na ostrých datech. */
  const lzeOVzdy = Object.entries(P.pole)
    .filter(([k, d]) => d.vzdy && (vDatech.get(k) || 0) !== nabidky.length)
    .map(([k]) => `${k}: popsáno jako „vždy“, ale je u ${vDatech.get(k) || 0} z ${nabidky.length}`);
  pravda('a co je popsané jako „vždy", je opravdu u každé nabídky',
    lzeOVzdy.length === 0, lzeOVzdy.join('\n      '));

  /* A obráceně: „někdy" u pole, které je u všech, je taky nepřesnost —
     jen méně nebezpečná. */
  const lzeONekdy = Object.entries(P.pole)
    .filter(([k, d]) => !d.vzdy && (vDatech.get(k) || 0) === nabidky.length)
    .map(([k]) => k);
  pravda('a co je popsané jako „někdy", opravdu někdy chybí',
    lzeONekdy.length === 0, lzeONekdy.join(', '));
}

/* ---- 2) typy a vyjmenované hodnoty ---- */
{
  const typSedi = (h, popis) => {
    const t = h === null ? 'null' : Array.isArray(h) ? 'pole' : typeof h;
    return popis.split('|').includes(t);
  };
  const spatne = [];
  for (const [k, d] of Object.entries(P.pole)) {
    for (const o of nabidky) {
      if (!(k in o)) continue;
      if (!typSedi(o[k], d.typ)) {
        spatne.push(`${k}: popsáno ${d.typ}, nalezeno ${o[k] === null ? 'null' : typeof o[k]}`);
        break;
      }
    }
  }
  pravda('typ každého pole sedí s tím, co v datech opravdu je',
    spatne.length === 0, spatne.slice(0, 4).join('\n      '));

  const typy = P.pole.type.hodnoty || [];
  const cizi = [...new Set(nabidky.map((o) => o.type))].filter((t) => !typy.includes(t));
  pravda('a vyjmenované druhy nabídky pokrývají všechno, co v datech je',
    cizi.length === 0, 'nepopsané: ' + cizi.join(', '));
}

/* ---- 3) stránka říká to podstatné, co se dá udělat špatně ---- */
{
  const cesta = path.join(KOREN, 'data.html');
  pravda('stránka s popisem dat je vygenerovaná', existsSync(cesta));
  if (existsSync(cesta)) {
    const h = readFileSync(cesta, 'utf8');
    pravda('a říká, že ceny jsou NABÍDKOVÉ, ne prodejní',
      /nabídkov/i.test(h) && /ne za kolik se prodal|ne prodejní/i.test(h));
    pravda('a varuje u spoluvlastnického podílu, proč cena za metr klame',
      /podíl/i.test(h) && /zlomek/i.test(h) && /celou parcelu/i.test(h));
    pravda('a že chybějící síť neznamená „není"',
      /není totéž co|neznamená/i.test(h) && /site/.test(h));
    pravda('a že výměra může chybět', /null/.test(h) && /výměr/i.test(h));
    pravda('a odkazuje na podmínky použití', /podminky\.html/.test(h));
    /* Tabulka musí mít tolik řádků, kolik je polí — jinak se stránka
       vygenerovala jen zpola a nikdo by si toho nevšiml. */
    const radku = (h.match(/<tr><td><code>/g) || []).length;
    pravda('a vypisuje všechna pole, ne jen některá',
      radku === Object.keys(P.pole).length + Object.keys(P.hlava).length,
      `řádků ${radku}, polí ${Object.keys(P.pole).length + Object.keys(P.hlava).length}`);
  }
}

/* ---- 4) velikost: kdo si to bere, má vědět, co stahuje ---- */
{
  const b = statSync(path.join(KOREN, 'data', 'opportunities.json')).size;
  pravda('soubor je pořád v rozumné velikosti (do 2 MB)', b <= 2 * 1024 * 1024,
    `${(b / 1024 / 1024).toFixed(2)} MB — nad dva megabajty už je čas na dělení po krajích`);
}

hotovo();
