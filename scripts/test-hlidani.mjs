// Testy hlídání lokality (js/hlidani-logika.js).
//
// Spuštění: node scripts/test-hlidani.mjs
//
// Tahle logika rozhoduje, co je pro člověka „nový pozemek". Když se splete
// směrem dolů, hlídání mlčí a člověk o příležitost přijde. Když nahoru,
// odznak svítí naprázdno a za pár dní si ho nikdo nevšimne.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = createRequire(import.meta.url)(path.join(ROOT, 'js', 'hlidani-logika.js'));

let bezi = 0, spadlo = 0;
const vysledky = [];
function je(skupina, popis, vyslo, cekano) {
  bezi++;
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a !== b) { spadlo++; vysledky.push(`  ✕ ${skupina}: ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

const P = (o) => Object.assign({ type: 'sale', okres: 'Kolín', place: 'Kolín', druh: 'stavební pozemek',
  parcel: '123/4', price: 500000, area: 800 }, o);

/* ---------------- shoda s hledáním ---------------- */
je('shoda', 'prázdné hledání bere vše', H.matches({}, P()), true);
je('shoda', 'okres sedí bez diakritiky', H.matches({ okres: 'kolin' }, P()), true);
je('shoda', 'okres sedí s diakritikou', H.matches({ okres: 'Kolín' }, P()), true);
je('shoda', 'jiný okres nesedí', H.matches({ okres: 'Tábor' }, P()), false);
// Lidé píšou do políčka „kde" i obec, ne jen okres — musí projít obojí.
je('shoda', 'hledá se i podle obce', H.matches({ okres: 'Zásmuky' }, P({ place: 'Zásmuky', okres: 'Kolín' })), true);
je('shoda', 'druh sedí', H.matches({ druh: 'stavební' }, P()), true);
je('shoda', 'jiný druh nesedí', H.matches({ druh: 'louka' }, P()), false);
je('shoda', 'typ sedí', H.matches({ ptype: 'sale' }, P()), true);
je('shoda', 'jiný typ nesedí', H.matches({ ptype: 'drazba' }, P()), false);

/* ---------------- místo: hotový název, ne kus slova ----------------
   Hlídané místo se porovnávalo podřetězcem kdekoli. Na skutečných datech
   to dělalo 141 falešných shod u sedmi okresů — a u hlídání to nejsou
   jen „výsledky navíc", podle toho chodí upozornění. */
je('místo', 'okres Jičín není Nový Jičín',
  H.matches({ okres: 'Jičín' }, P({ okres: 'Nový Jičín', place: 'Nový Jičín' })), false);
je('místo', 'okres Most není Mosty u Jablunkova',
  H.matches({ okres: 'Most' }, P({ okres: 'Frýdek-Místek', place: 'Mosty u Jablunkova' })), false);
je('místo', 'ani Dlouhý Most',
  H.matches({ okres: 'Most' }, P({ okres: 'Liberec', place: 'Dlouhý Most' })), false);
je('místo', 'ani Kněžmost (uprostřed slova)',
  H.matches({ okres: 'Most' }, P({ okres: 'Mladá Boleslav', place: 'Kněžmost' })), false);
je('místo', 'Teplice nejsou Teplice nad Metují',
  H.matches({ okres: 'Teplice' }, P({ okres: 'Náchod', place: 'Teplice nad Metují' })), false);
je('místo', 'Písek není Moravský Písek',
  H.matches({ okres: 'Písek' }, P({ okres: 'Hodonín', place: 'Moravský Písek' })), false);
// Ale co se trefit MÁ, se trefit musí.
je('místo', 'vlastní okres sedí dál',
  H.matches({ okres: 'Most' }, P({ okres: 'Most', place: 'Horní Jiřetín' })), true);
je('místo', 'vlastní obec sedí dál',
  H.matches({ okres: 'Most' }, P({ okres: 'Most', place: 'Most' })), true);
/* Praha je výjimka a musí jí zůstat: kdo hlídá Prahu, chce i okresy
   kolem ní. Proto se u OKRESU uznává i „jméno + další slovo" — u obce ne. */
je('místo', 'Praha bere i okres Praha-východ',
  H.matches({ okres: 'Praha' }, P({ okres: 'Praha-východ', place: 'Máslovice' })), true);
je('místo', 'a Praha-západ', H.matches({ okres: 'Praha' }, P({ okres: 'Praha-západ', place: 'Bojanovice' })), true);
je('místo', 'pomlčka jde napsat i mezerou',
  H.matches({ okres: 'praha vychod' }, P({ okres: 'Praha-východ', place: 'Máslovice' })), true);
je('místo', 'napsané „okres Kolín" se taky trefí',
  H.matches({ okres: 'okres Kolín' }, P()), true);

/* Druh: volba „sad" má najít „ovocný sad" — celé slovo uvnitř názvu.
   Kus slova stačit nesmí. */
je('místo', 'druh „sad" najde ovocný sad', H.matches({ druh: 'sad' }, P({ druh: 'ovocný sad' })), true);
je('místo', 'ale „sad" není „sady u lesa" jako kus slova',
  H.matches({ druh: 'ada' }, P({ druh: 'ovocný sad' })), false);

/* ---------------- cena a výměra ---------------- */
je('meze', 'pod maximem projde', H.matches({ max_price: 600000 }, P()), true);
je('meze', 'nad maximem neprojde', H.matches({ max_price: 400000 }, P()), false);
je('meze', 'přesně na maximu projde', H.matches({ max_price: 500000 }, P()), true);
je('meze', 'nad minimem výměry projde', H.matches({ min_area: 500 }, P()), true);
je('meze', 'pod minimem výměry neprojde', H.matches({ min_area: 1000 }, P()), false);
// Pozemek bez ceny nesmí projít cenovým filtrem — jinak by se do „do 300 tisíc"
// namíchaly dražby bez uvedené ceny a hlídání by hlásilo nesmysly.
je('meze', 'pozemek bez ceny neprojde cenovým filtrem',
  H.matches({ max_price: 600000 }, P({ price: 0 })), false);
je('meze', 'pozemek bez výměry neprojde filtrem výměry',
  H.matches({ min_area: 100 }, P({ area: 0 })), false);

/* ---------------- vybavení ---------------- */
je('vybavení', 'požadovaná elektřina chybí',
  H.matches({ features: ['Elektřina'] }, P({ features: ['Voda'] })), false);
je('vybavení', 'požadovaná elektřina je',
  H.matches({ features: ['Elektřina'] }, P({ features: ['Voda', 'Elektřina'] })), true);
je('vybavení', 'chce se dvojí, je jen jedno',
  H.matches({ features: ['Elektřina', 'Voda'] }, P({ features: ['Elektřina'] })), false);
je('vybavení', 'přístupová cesta se bere z pole access',
  H.matches({ features: ['Přístupová cesta'] }, P({ access: 'zpevněná cesta' })), true);
je('vybavení', 'bez cesty neprojde',
  H.matches({ features: ['Přístupová cesta'] }, P({ access: 'přes cizí pozemek' })), false);

/* Tohle je oprava mrtvého filtru. Pole `features` a `access` mají POUZE
   inzeráty vložené majitelem přes web — ze sbíraných nabídek ho nemá
   ani jedna z 1966. Zaškrtnutím „Elektřina" si tak člověk hlídání
   zúžil na hrstku vlastních inzerátů a nepřišlo mu NIKDY nic, aniž by
   se to kdekoli dozvěděl. Robot přitom tytéž údaje čte z popisu
   nabídky do pole `site` (elektřina u 169 nabídek, voda u 196, cesta
   u 1024). Hlídání je teď bere jako rovnocenný zdroj. */
je('vybavení', 'elektřina se uzná i z popisu nabídky (pole site)',
  H.matches({ features: ['Elektřina'] }, P({ site: ['elektrina'] })), true);
je('vybavení', 'voda taky', H.matches({ features: ['Voda'] }, P({ site: ['voda', 'cesta'] })), true);
je('vybavení', 'kanalizace taky', H.matches({ features: ['Kanalizace'] }, P({ site: ['kanalizace'] })), true);
je('vybavení', 'plyn taky', H.matches({ features: ['Plyn'] }, P({ site: ['plyn'] })), true);
je('vybavení', 'cesta z popisu se uzná i bez pole access',
  H.matches({ features: ['Přístupová cesta'] }, P({ site: ['cesta'] })), true);
je('vybavení', 'co v popisu není, neprojde',
  H.matches({ features: ['Elektřina'] }, P({ site: ['voda'] })), false);
je('vybavení', 'dvojí požadavek se dá složit z obou zdrojů',
  H.matches({ features: ['Elektřina', 'Voda'] }, P({ features: ['Elektřina'], site: ['voda'] })), true);
/* Vybavení, které se z popisu vyčíst nedá, musí zůstat přísné —
   jinak by „Oplocení" najednou procházelo komukoli. */
je('vybavení', 'oplocení se z popisu nevyrábí',
  H.matches({ features: ['Oplocení'] }, P({ site: ['elektrina', 'voda', 'cesta'] })), false);

/* ---------------- otisk ---------------- */
je('otisk', 'stejný pozemek má stejný otisk', H.keyOf(P()) === H.keyOf(P()), true);
je('otisk', 'změna ceny je jiný pozemek', H.keyOf(P()) === H.keyOf(P({ price: 600000 })), false);
je('otisk', 'diakritika otisk nemění', H.keyOf(P({ okres: 'Kolín' })), H.keyOf(P({ okres: 'kolin' })));
// Musí sedět s keyOf() v js/hlidani-logika.js, jinak by aplikace hlásila
// jako nové něco, co už člověk viděl (a naopak).
je('otisk', 'tvar otisku se nezměnil', H.keyOf(P()), 'sale|kolin|kolin|123/4|500000|800');

/* ---------------- počet nových ---------------- */
const DATA = [P(), P({ parcel: '9/1', price: 300000 }), P({ okres: 'Tábor', place: 'Tábor', parcel: '5/5' })];
je('nové', 'bez viděných jsou nové všechny, co sedí',
  H.novychProHledani({ okres: 'Kolín', seen_keys: [] }, DATA), 2);
je('nové', 'viděný se nepočítá',
  H.novychProHledani({ okres: 'Kolín', seen_keys: [H.keyOf(DATA[0])] }, DATA), 1);
je('nové', 'všechny viděné = nula',
  H.novychProHledani({ okres: 'Kolín', seen_keys: DATA.map(H.keyOf) }, DATA), 0);
je('nové', 'hledání mimo lokalitu nic nenajde',
  H.novychProHledani({ okres: 'Brno', seen_keys: [] }, DATA), 0);

// Jeden pozemek může sedět na dvě hledání. Na odznaku se smí objevit jednou,
// jinak by číslo rostlo s počtem hledání, ne s počtem pozemků.
const DVE = [{ okres: 'Kolín', seen_keys: [] }, { druh: 'stavební', seen_keys: [] }];
je('nové', 'pozemek ve dvou hledáních se počítá jednou', H.novychCelkem(DVE, DATA), 3);
je('nové', 'žádné hledání = nic na odznaku', H.novychCelkem([], DATA), 0);
je('nové', 'žádná data nespadnou', H.novychCelkem(DVE, []), 0);

/* ---------------- výsledek ---------------- */
/* ---------- Širší meze u hlídání ----------------------------------- */
/* Hlídání umělo jen „nejvýš tolik korun" a „aspoň tolik metrů". Na pozemky
   je to málo: kdo hledá stavební parcelu, potřebuje i horní hranici výměry
   (tisíc metrů ano, deset hektarů ne) a hlavně cenu za metr — podle té se
   pozemky srovnávají nejčastěji. */
{
  const pozemek = { type: 'sale', okres: 'Kolín', place: 'Velim', druh: 'orná půda',
    price: 200000, area: 5000 };   // 40 Kč/m²
  je('širší meze', 'bez mezí sedí všechno', H.matches({}, pozemek), true);
  je('širší meze', 'cena za m² pod mezí projde', H.matches({ max_perm2: 50 }, pozemek), true);
  je('širší meze', 'cena za m² nad mezí neprojde', H.matches({ max_perm2: 30 }, pozemek), false);
  je('širší meze', 'spodní hranice ceny odfiltruje levnější', H.matches({ min_price: 300000 }, pozemek), false);
  je('širší meze', 'a propustí dražší', H.matches({ min_price: 100000 }, pozemek), true);
  je('širší meze', 'horní hranice výměry odfiltruje větší', H.matches({ max_area: 1000 }, pozemek), false);
  je('širší meze', 'a propustí menší', H.matches({ max_area: 9000 }, pozemek), true);
  je('širší meze', 'meze se skládají dohromady',
    H.matches({ min_area: 1000, max_area: 9000, max_perm2: 45, min_price: 100000 }, pozemek), true);
  // Cena za metr se nedá spočítat bez obojího — takový pozemek nesmí projít.
  je('širší meze', 'bez výměry se cena za m² neurčí, takže neprojde',
    H.matches({ max_perm2: 50 }, { type: 'sale', price: 200000 }), false);
  // Staré hledání (bez nových polí) musí dál fungovat beze změny.
  je('širší meze', 'staré hledání zůstává platné',
    H.matches({ okres: 'Kolín', max_price: 300000, min_area: 1000 }, pozemek), true);
}

/* ---------- Duplicity se počítají na jednom místě ------------------- */
/* Mapa hlásila 1 940 pozemků a hlídání 1 953 — každá stránka si odstraňovala
   duplicity po svém. Teď to dělá jedna funkce. */
{
  const a = { place: 'Trubín', okres: 'Beroun', price: 1875000, area: 3000, druh: 'orná půda' };
  const b = { place: 'Trubín', okres: 'Beroun', price: 1875000, area: 3000, druh: 'orná půda' };
  const c = { place: 'Trubín', okres: 'Beroun', price: 1875000, area: 3100, druh: 'orná půda' };
  je('duplicity', 'týž pozemek dvakrát se započítá jednou', H.bezDuplicit([a, b]).length, 1);
  je('duplicity', 'jiná výměra je jiný pozemek', H.bezDuplicit([a, c]).length, 2);
  je('duplicity', 'prázdný seznam nevadí', H.bezDuplicit([]).length, 0);
  je('duplicity', 'nic k odstranění = beze změny', H.bezDuplicit([a, c, { place: 'X' }]).length, 3);

  /* Shoda ve všem ostatním ještě neznamená týž pozemek. V Polici nad Metují
     takhle zmizely TŘI dražby: čtyři sousední parcely (769/274, /276, /277,
     /278) měly stejnou výměru i vyvolávací cenu, ale každá svůj termín.
     Web z nich ukazoval jednu. */
  const zaklad = { place: 'Police nad Metují', okres: 'Náchod', price: 268000, area: 1149,
    druh: 'orná půda', type: 'drazba' };
  const p1 = Object.assign({}, zaklad, { parcel: '769/278', extra: 'dražba 2026-09-24' });
  const p2 = Object.assign({}, zaklad, { parcel: '769/277', extra: 'dražba 2026-10-15' });
  je('duplicity', 'jiná parcela i termín = jiná dražba', H.bezDuplicit([p1, p2]).length, 2);
  je('duplicity', 'jiná parcela, stejný termín = pořád jiný pozemek',
    H.bezDuplicit([p1, Object.assign({}, p2, { extra: p1.extra })]).length, 2);
  je('duplicity', 'stejná parcela, jiný termín = jiná dražba téhož pozemku',
    H.bezDuplicit([p1, Object.assign({}, p2, { parcel: p1.parcel })]).length, 2);
  je('duplicity', 'stejná parcela i termín = jeden záznam',
    H.bezDuplicit([p1, Object.assign({}, p1)]).length, 1);
  /* Když parcelní číslo jeden ze záznamů nezná (u inzerátů to je pravidlo),
     rozhoduje dál shoda v ostatním — tam je opakování ze dvou zdrojů
     pravděpodobnější než náhodná shoda ceny i výměry na metr. */
  je('duplicity', 'chybějící parcela nebrání spojení',
    H.bezDuplicit([Object.assign({}, zaklad, { parcel: '—' }), Object.assign({}, zaklad, { parcel: '769/278' })]).length, 1);

  /* TÝŽ POZEMEK ZE DVOU STRAN: vyhrává majitel.
     Prodávající, který má pozemek na Bezrealitkách, si ho sem přidá
     odkazem a formulář z něj čísla předvyplní — jeho záznam tedy vyjde
     shodně se sbíranou nabídkou. Sbíraná se do seznamu dostane dřív
     (majitelé se přidávají až za ni), takže by ta jeho tiše zmizela:
     člověk přidá inzerát, nic se nestane a nikde se nedozví proč.
     A i kdyby se nestalo tohle: záznam od majitele nese přímý kontakt
     bez provize a bez portálu mezi tím. */
  const sbirany = { place: 'Trubín', okres: 'Beroun', price: 1875000, area: 3000, druh: 'orná půda', type: 'sale' };
  const odMajitele = Object.assign({}, sbirany, { type: 'majitel', contact: '777111222' });
  const spojeno = H.bezDuplicit([sbirany, odMajitele]);
  je('duplicity', 'ze dvou stran zůstane jeden záznam', spojeno.length, 1);
  je('duplicity', 'a je to ten od majitele', spojeno[0].type, 'majitel');
  /* Pořadí nesmí rozhodovat: majitel vyhraje, ať přijde první nebo druhý. */
  je('duplicity', 'i když přijde první', H.bezDuplicit([odMajitele, sbirany])[0].type, 'majitel');
  /* A dva sbírané mezi sebou ať se chovají jako dřív. */
  je('duplicity', 'dvě sbírané nabídky se pořád slijí do jedné',
    H.bezDuplicit([sbirany, Object.assign({}, sbirany)]).length, 1);
}

console.log(`\nHlídání lokality: ${bezi} testů`);
if (spadlo) {
  console.log(vysledky.join('\n'));
  console.error(`\n${spadlo} z ${bezi} NEPROŠLO.`);
  process.exit(1);
}
console.log('Všechny prošly.\n');
