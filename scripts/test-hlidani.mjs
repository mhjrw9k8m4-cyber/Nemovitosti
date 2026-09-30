// Testy hlídání lokality (js/hlidani-logika.js).
//
// Spuštění: node scripts/test-hlidani.mjs
//
// Tahle logika rozhoduje, co je pro člověka „nový pozemek". Když se splete
// směrem dolů, hlídání mlčí a člověk o příležitost přijde. Když nahoru,
// odznak svítí naprázdno a za pár dní si ho nikdo nevšimne.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = createRequire(import.meta.url)(path.join(ROOT, 'js', 'hlidani-logika.js'));
/* Centrum upozornění staví seznam z týchž hlídání — a musí z nich
   vyjít stejná čísla jako tady. Proto se zkouší spolu. */
const F = createRequire(import.meta.url)(path.join(ROOT, 'js', 'upozorneni-feed.js'));

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
/* PRAHA NENÍ PRAHA-VÝCHOD. Dřív tu stálo, že „kdo hlídá Prahu, chce
   i okresy kolem ní", a okres se proto bral i jako předpona. Byl to
   odhad a v praxi neobstál: karta hlídání hlásila „Celkem sedí: 139
   pozemků", ale odkaz „Zobrazit na mapě" z téže karty jich ukázal 28.
   Zbylých 113 byly Praha-východ a Praha-západ — samostatné okresy, a
   ještě ve Středočeském kraji. Dvě různá čísla pro totéž hlídání se
   obhájit nedají.
   Pravidlo je teď stejné jako jinde na webu: hotový název okresu
   znamená právě ten okres. Kdo chce okolí, založí si na ně hlídání. */
je('místo', 'Praha není okres Praha-východ',
  H.matches({ okres: 'Praha' }, P({ okres: 'Praha-východ', place: 'Máslovice' })), false);
je('místo', 'ani Praha-západ', H.matches({ okres: 'Praha' }, P({ okres: 'Praha-západ', place: 'Bojanovice' })), false);
je('místo', 'ale Praha-východ napsaná celá sedí',
  H.matches({ okres: 'Praha-východ' }, P({ okres: 'Praha-východ', place: 'Máslovice' })), true);
je('místo', 'pomlčka jde napsat i mezerou',
  H.matches({ okres: 'praha vychod' }, P({ okres: 'Praha-východ', place: 'Máslovice' })), true);
/* Předpona se ale neruší úplně. „Plzeň", „Brno" ani „Ústí" žádný okres
   toho jména nejsou — pod tím jménem si nic jiného než všechny jejich
   okresy představit nelze, tak se berou všechny. Rozdíl proti Praze je
   přesně tenhle: Praha okresem JE. */
je('místo', 'Plzeň bere Plzeň-jih, protože okres Plzeň neexistuje',
  H.matches({ okres: 'Plzeň' }, P({ okres: 'Plzeň-jih', place: 'Blovice' })), true);
je('místo', 'Brno bere Brno-venkov', H.matches({ okres: 'Brno' }, P({ okres: 'Brno-venkov', place: 'Rosice' })), true);
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

/* Seznam okresů je v js/hlidani-logika.js vypsaný, protože modul nemá
   odkud ho vzít — a vypsaný seznam se umí rozejít s daty. Tohle je to
   jediné místo, kde se to pozná. */
{
  const zOkresu = Object.keys(
    JSON.parse(readFileSync(new URL('../data/okresy.json', import.meta.url), 'utf8')).okresy);
  const opp = JSON.parse(
    readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
  /* Nejdřív přímo: vypsaný seznam se musí rovnat tomu v datech. Pouhé
     zkoušení chování na to nestačí — vypadne-li ze seznamu okres, který
     není předponou žádného jiného (třeba Praha-východ), nezmění se
     navenek vůbec nic a rozdíl by se projevil až tím, že by se do
     seznamu jednou přidal okres, který tam patřit nemá. */
  je('okresy', 'vypsaný seznam okresů se rovná tomu v datech',
    (H.OKRESY || []).slice().sort().join('|'), zOkresu.slice().sort().join('|'));

  /* A pak chováním: název, který je okresem, nesmí přitáhnout jiný. */
  const pritahuje = [];
  for (const a of zOkresu) {
    for (const b of zOkresu) {
      if (a === b) continue;
      if (H.matches({ okres: a }, P({ okres: b, place: b }))) pritahuje.push(a + ' → ' + b);
    }
  }
  je('okresy', 'hotový název okresu nepřitáhne jiný okres', pritahuje.length, 0,
    pritahuje.slice(0, 5).join(', '));

  /* A totéž na skutečných datech: kolik hlídání „Praha" napočítá musí
     souhlasit s tím, kolik je v datech pozemků v okrese Praha. */
  for (const jm of ['Praha', 'Brno-venkov', 'Most', 'Ústí nad Labem']) {
    const sedi = opp.filter((o) => H.matches({ okres: jm }, o)).length;
    const vdatech = opp.filter((o) => o.okres === jm).length;
    je('okresy', `hlídání „${jm}" napočítá tolik, kolik jich v okrese je`, sedi, vdatech);
  }
}

/* --- TATÁŽ NABÍDKA DVAKRÁT ------------------------------------------
 * Robot sbírá z víc zdrojů a tatáž nabídka bývá v datech dvakrát,
 * jednou z každého (dnes 13 dvojic z 1 972; liší se jen adresou).
 * Jako „2 nové" by to byla lež o jednom pozemku. novychCelkem() to
 * počítalo přes klíče odjakživa, novychProHledani() ne — dvě funkce
 * na totéž s jiným výsledkem.
 */
{
  const A = P({ parcel: '1' });
  const dvakrat = [A, Object.assign({}, A, { url: 'https://jiny-zdroj.cz/1' })];
  je('duplicity', 'tatáž nabídka ze dvou zdrojů je jedna nová',
    H.novychProHledani({ okres: 'Kolín', seen_keys: [] }, dvakrat), 1);
  je('duplicity', 'a odznak v menu ji počítá stejně',
    H.novychCelkem([{ okres: 'Kolín', seen_keys: [] }], dvakrat), 1);
  je('duplicity', 'dvě různé nabídky zůstanou dvě',
    H.novychProHledani({ okres: 'Kolín', seen_keys: [] }, [A, P({ parcel: '2' })]), 2);

  /* A totéž musí platit i pro CENTRUM UPOZORNĚNÍ. To si nové pozemky
     dlouho filtrovalo po svém a duplicitu neznalo: hlásilo 1 970 nových
     pozemků, zatímco stránka hlídání i mapa jich ukazovaly 1 957 — a to
     na tu stránku právě odkazoval odznak, na který se klikalo.
     Teď obojí čte z noveProHledani(), tak ať to tak zůstane. */
  const feedDvakrat = F.zeHlidani([{ id: 1, okres: 'Kolín', seen_keys: [] }], dvakrat);
  je('duplicity', 'centrum upozornění ji taky počítá jednou',
    feedDvakrat[0] ? feedDvakrat[0].pocet : -1, 1);
  je('duplicity', 'a nevypíše ji v seznamu dvakrát',
    feedDvakrat[0] ? feedDvakrat[0].polozky.length : -1, 1);
  je('duplicity', 'ani mezi klíči k označení za přečtené',
    feedDvakrat[0] ? new Set(feedDvakrat[0].vsechnyKlice).size : -1,
    feedDvakrat[0] ? feedDvakrat[0].vsechnyKlice.length : -2);

  /* Že se to opravdu čte z jednoho místa, ne že se pravidlo napsalo
     podruhé: na SKUTEČNÝCH datech musí obě čísla souhlasit. Kdyby se
     rozešla, je to zpátky ta chyba výš. */
  const skutecna = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
  const hlidaniCR = { id: 9, label: 'celá ČR', seen_keys: [] };
  const zFeedu = F.zeHlidani([hlidaniCR], skutecna);
  je('duplicity', `centrum a stránka hlídání hlásí na skutečných datech totéž`,
    zFeedu[0] ? zFeedu[0].pocet : -1, H.novychProHledani(hlidaniCR, skutecna));
  je('duplicity', 'a je to opravdu hodně pozemků (jinak zkouška nic neměří)',
    (zFeedu[0] ? zFeedu[0].pocet : 0) > 500, true);
}

/* --- CO SE OZNAČÍ JAKO VIDĚNÉ, MUSÍ VIDĚNÉ ZŮSTAT ------------------
 *
 * mark_search_seen dostane pole klíčů a celé seen_keys jím PŘEPÍŠE.
 * Posílaly se klíče jen NOVÝCH pozemků, takže se o zbytek přišlo —
 * a odznak se pak nikdy neusadil:
 *   1. návštěva  20 nových → označí → seen_keys 20
 *   2. znovu      0 nových                                  ✓
 *   3. robot přidá 3 → 3 nové → označí → seen_keys už jen 3
 *   4. znovu     20 „nových" — těch, co člověk dávno viděl   ✕
 *   5. znovu      3 „nové"  … a pak pořád dokola 20 / 3
 *
 * Proto se tu nezkouší jedno kolo, ale celý ten cyklus: kdyby se
 * posílaly zase jen nové, kolo 4 spadne.
 */
{
  const A = P({ parcel: 'a' }), B = P({ parcel: 'b' }), C = P({ parcel: 'c' });
  const hled = { id: 'h1', okres: 'Kolín', seen_keys: [] };
  // Přesně to, co dělá server: přepis polem, které pošle appka.
  const oznac = (data) => {
    const u = F.zeHlidani([hled], data)[0];
    const nove = u ? u.pocet : 0;
    if (u) hled.seen_keys = u.vsechnyKlice;
    return nove;
  };
  je('viděné', '1. návštěva: všechno je nové', oznac([A, B]), 2);
  je('viděné', '2. hned znovu: nic nového', oznac([A, B]), 0);
  je('viděné', '3. přibyl jeden: jeden nový', oznac([A, B, C]), 1);
  je('viděné', '4. a teď už nic — dřív se tu vrátily dva', oznac([A, B, C]), 0);
  je('viděné', '5. ani po dalším načtení', oznac([A, B, C]), 0);

  /* A ať je vidět, že se opravdu ukládají VŠECHNY klíče, ne jen nové:
     po označení musí seen_keys obsahovat i ty, které nové nebyly. */
  const hled2 = { id: 'h2', okres: 'Kolín', seen_keys: [H.keyOf(A)] };
  const u2 = F.zeHlidani([hled2], [A, B])[0];
  je('viděné', 'nové je jen to nepřečtené', u2.pocet, 1);
  je('viděné', 'ale k označení se posílají klíče všech, co sedí', u2.vsechnyKlice.length, 2);
  je('viděné', 'a je mezi nimi i ten dávno viděný',
    u2.vsechnyKlice.indexOf(H.keyOf(A)) >= 0, true);

  // Klíče se neduplikují, i když tentýž pozemek přijde ze dvou zdrojů.
  je('viděné', 'tatáž nabídka ze dvou zdrojů dá jeden klíč',
    H.kliceProHledani({ okres: 'Kolín', seen_keys: [] },
      [A, Object.assign({}, A, { url: 'https://jiny.cz/1' })]).length, 1);
  /* A co na hledání nesedí, se do seen_keys neplete. Pozor na obec:
     hledání „Kolín" sedí i na obec Kolín v jiném okrese (lidé píšou do
     políčka „kde" obec i okres), takže cizí záznam musí mít jiné obojí
     — na tomhle mi zkouška napoprvé spadla. */
  je('viděné', 'co na hledání nesedí, se do klíčů nedostane',
    H.kliceProHledani({ okres: 'Kolín', seen_keys: [] },
      [A, P({ parcel: 'z', okres: 'Nymburk', place: 'Poděbrady' })]).length, 1);
}

/* --- ODZNAK A HLAVIČKA CENTRA MUSÍ ŘÍKAT TOTÉŽ -------------------
 *
 * Jeden pozemek může sedět na dvě uložená hledání a být tedy ve dvou
 * upozorněních. Odznak v menu ho počítá jednou (novychCelkem to má
 * i v komentáři), ale hlavička centra sečetla počty jednotlivých
 * upozornění — na dvou hledáních přes týž okres tak vycházelo 56 proti
 * 28 na odznaku. Dvě čísla pro tutéž věc, a to jedno z nich bylo
 * u druhého na dosah jednoho klepnutí.
 */
{
  const A = P({ parcel: 'a' }), B = P({ parcel: 'b' });
  const data = [A, B];
  const dveStejne = [{ id: 'a', okres: 'Kolín', seen_keys: [] }, { id: 'b', okres: 'Kolín', seen_keys: [] }];
  const odznak = H.novychCelkem(dveStejne, data);
  const centrum = F.pocty(F.sestav({ vlakna: [], hledani: dveStejne, data: data })).pozemky;
  je('součty', 'dvě hledání přes týž okres: odznak počítá pozemky jednou', odznak, 2);
  je('součty', 'a hlavička centra hlásí totéž', centrum, odznak);
  je('součty', 'obě upozornění přitom v seznamu zůstanou',
    F.sestav({ vlakna: [], hledani: dveStejne, data: data }).length, 2);

  // Nepřekrývající se hledání se naopak sečíst MUSÍ.
  const dveJine = [{ id: 'a', okres: 'Kolín', seen_keys: [] },
    { id: 'b', okres: 'Nymburk', seen_keys: [] }];
  const dataJine = [A, P({ parcel: 'n', okres: 'Nymburk', place: 'Poděbrady' })];
  je('součty', 'dvě různá hledání se sečtou',
    F.pocty(F.sestav({ vlakna: [], hledani: dveJine, data: dataJine })).pozemky, 2);
  je('součty', 'a odznak taky', H.novychCelkem(dveJine, dataJine), 2);

  /* Zprávy se naopak SČÍTAJÍ — dvě nepřečtené zprávy jsou dvě zprávy,
     ne jeden pozemek. Kdyby se i ty začaly počítat přes klíče, zmizely by. */
  const vlakna = [
    { listing_id: 'L1', buyer_id: 'B1', unread: 2, is_owner: true, place: 'Kolín', last_at: '2026-09-20T10:00:00Z' },
    { listing_id: 'L2', buyer_id: 'B2', unread: 3, is_owner: false, place: 'Nymburk', last_at: '2026-09-20T11:00:00Z' }
  ];
  je('součty', 'zprávy se sčítají dál', F.pocty(F.sestav({ vlakna: vlakna, hledani: [], data: [] })).zpravy, 5);
}

/* --- ZMĚNA CENY NENÍ NOVÝ POZEMEK ---------------------------------
 *
 * Klíč pozemku obsahuje cenu, takže když prodávající cenu upraví,
 * vznikne klíč, který uživatel nikdy neviděl — a pozemek se ohlásil
 * jako NOVÝ. Nebyla to pravda a zahazovalo to lepší zprávu: napříč
 * dvaceti verzemi dat se cena změnila 12× ze 37 085 pozorování a byly
 * to věci, které stojí za vědění (Loučovice 8 999 000 → 7 900 000 Kč).
 *
 * Cena se z klíče NEVYHAZUJE — tím bychom o ten signál přišli. Jen se
 * pozná, že jde o týž pozemek s jinou cenou.
 */
{
  const A = P({ parcel: 'a' });
  const hled = { okres: 'Kolín', seen_keys: [H.keyOf(A)] };
  const levnejsi = P({ parcel: 'a', price: 400000 });
  const drazsi = P({ parcel: 'a', price: 600000 });

  je('cena', 'zlevněný pozemek už není „nový"', H.novychProHledani(hled, [levnejsi]), 0);
  je('cena', 'ale je mezi změněnými', H.zmeneneProHledani(hled, [levnejsi]).length, 1);
  je('cena', 'a ví se, jaká byla stará cena',
    H.zmeneneProHledani(hled, [levnejsi])[0].staraCena, 500000);
  je('cena', 'zdražení se pozná stejně', H.zmeneneProHledani(hled, [drazsi]).length, 1);
  je('cena', 'beze změny ceny není co hlásit', H.zmeneneProHledani(hled, [A]).length, 0);
  je('cena', 'a opravdu nový pozemek změna není',
    H.zmeneneProHledani(hled, [P({ parcel: 'jiny' })]).length, 0);
  je('cena', 'ten je pořád nový', H.novychProHledani(hled, [P({ parcel: 'jiny' })]), 1);

  /* Rozebrání klíče na části stojí a padá s tím, že se v polích
     nevyskytuje svislítko a že klíč nedosáhne na 240 znaků, kde se
     zkracuje. Obojí se hlídá na SKUTEČNÝCH datech níž. */
  je('cena', 'klíč se dá rozebrat a cena je pátá část',
    JSON.stringify(H.bezCeny(H.keyOf(A))),
    JSON.stringify({ identita: 'sale|kolin|kolin|a|800', cena: '500000' }));
  je('cena', 'klíč jiného tvaru se nehádá', H.bezCeny('a|b|c'), null);
  je('cena', 'ani prázdný', H.bezCeny(''), null);

  // Hláška musí říct, co se stalo, a kolik to bylo.
  const u = F.zeHlidani([{ id: 'h', okres: 'Kolín', seen_keys: [H.keyOf(A)] }], [levnejsi]);
  je('cena', 'centrum ukáže jedno upozornění', u.length, 1);
  je('cena', 'a je o zlevnění, ne o novém pozemku', u[0].titulek, '1 pozemek zlevnil');
  /* Očekávání se skládá touž funkcí, která to píše — tisíce se oddělují
     nezlomitelnou mezerou (U+00A0), což je u českých čísel správně, ale
     v testu napsané obyčejnou mezerou to vypadá stejně a nesedí. */
  je('cena', 'se starou i novou cenou', u[0].polozky[0].popis,
    'Kolín · ' + F.cena(500000) + ' → ' + F.cena(400000));
  je('cena', 'u zdražení se to jmenuje jinak',
    F.zeHlidani([{ id: 'h', okres: 'Kolín', seen_keys: [H.keyOf(A)] }], [drazsi])[0].titulek,
    '1 pozemek zdražil');
  je('cena', 'a při obojím naráz se to nepřikrášluje',
    F.zeHlidani([{ id: 'h', okres: 'Kolín', seen_keys: [H.keyOf(A), H.keyOf(P({ parcel: 'b' }))] }],
      [levnejsi, P({ parcel: 'b', price: 900000 })])[0].titulek,
    '2 pozemky změnily cenu');

  /* A odznak s hlavičkou si musí odpovídat i tady — odznak, který změnu
     ceny vynechá, hlásí menší číslo než stránka pod ním. */
  const smes = [P({ parcel: 'a', price: 400000 }), P({ parcel: 'c' })];
  const hled2 = { id: 'h', okres: 'Kolín', seen_keys: [H.keyOf(A)] };
  je('cena', 'odznak počítá i změnu ceny', H.novychCelkem([hled2], smes), 2);
  je('cena', 'a hlavička centra hlásí totéž',
    F.pocty(F.zeHlidani([hled2], smes)).pozemky, H.novychCelkem([hled2], smes));
}

/* Rozebrání klíče na SKUTEČNÝCH datech: kdyby se v nějakém poli objevilo
   svislítko nebo klíč přerostl 240 znaků (tam se zkracuje), přestala by
   se dát cena z klíče vyčíst a změny cen by se tiše hlásily jako nové. */
{
  const skutecna = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
  let spatnych = 0, nejdelsi = 0;
  for (const d of skutecna) {
    const k = H.keyOf(d);
    if (k.length > nejdelsi) nejdelsi = k.length;
    const b = H.bezCeny(k);
    if (!b || b.cena !== String(d.price || '')) spatnych++;
  }
  je('cena', `klíč se dá rozebrat u všech ${skutecna.length} pozemků v datech`, spatnych, 0);
  je('cena', `a nejdelší klíč (${nejdelsi} znaků) nedosahuje na 240, kde se zkracuje`,
    nejdelsi < 240, true);
}

/* --- VŠICHNI SE MUSÍ DÍVAT DO TÝCHŽ ZDROJŮ -------------------------
 *
 * „Kolik nových pozemků mi sedí" odpovídají DVĚ místa: odznak v nabídce
 * (js/upozorneni.js) a stránka hlídání (hlidani.html). Dívaly se každé
 * jinam: odznak jen do data/opportunities.json, stránka i na inzeráty od
 * majitelů. Odznak tedy mohl říkat „žádné nové", a stránka hned vedle
 * „1 nový" — přitom odznak je zrovna to, co člověka na stránku pošle.
 *
 * A druhá věc: řádek z živého inzerátu skládá PKCisteni.majitele() —
 * mapa i stránka pozemku ho tak berou, hlidani.html si ho skládal ručně
 * a chyběly mu `site`, souřadnice i _lid. Tři místa skládající tentýž
 * řádek se dřív nebo později rozejdou; kvůli tomu ta funkce vznikla.
 *
 * Hlídá se to na ZDROJI, protože jde o to, odkud se data berou — a to
 * z chování jedné funkce vyčíst nejde.
 */
{
  /* KOMENTÁŘE PRYČ. Napsal jsem k té opravě komentář, ve kterém stojí
     „PKCisteni.majitele()" — a kontrola níž na něm zeleně prošla i po
     sabotáži, která to volání z kódu odstranila. Zelená z vlastního
     komentáře je horší než žádná kontrola. (Totéž dělá
     scripts/test-staticka.mjs, ze stejného důvodu.) */
  const bezKomentaru = (t) => String(t)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const upoz = bezKomentaru(readFileSync(new URL('../js/upozorneni.js', import.meta.url), 'utf8'));
  const hlid = bezKomentaru(readFileSync(new URL('../hlidani.html', import.meta.url), 'utf8'));
  /* A TŘETÍ MÍSTO: stránka upozornění (js/centrum.js). Tu jsem při první
     opravě přehlédl — spravil jsem odznak, aby počítal i inzeráty od
     majitelů, ale stránka, NA KTEROU TEN ODZNAK POSÍLÁ, je dál nečetla.
     Odznak by tím mohl slíbit „1 nový" a na stránce by nebylo nic, což je
     horší než původní stav, kdy se obojí mýlilo stejně. */
  const centrum = bezKomentaru(readFileSync(new URL('../js/centrum.js', import.meta.url), 'utf8'));
  /* Pojistka: kdyby se ta místa přejmenovala, kontroly níž by hlídaly
     prázdno a tvářily se spokojeně. */
  je('zdroje', 'odznak opravdu počítá nové pozemky (jinak se nic neměří)',
    /novychCelkem/.test(upoz), true);
  je('zdroje', 'a stránka hlídání taky (jinak se nic neměří)',
    /matches\(/.test(hlid), true);

  je('zdroje', 'stránka upozornění opravdu skládá seznam (jinak se nic neměří)',
    /F\.sestav\(/.test(centrum), true);

  je('zdroje', 'odznak čte i inzeráty od majitelů, ne jen stažená data',
    /user-listings\.json/.test(upoz), true);
  je('zdroje', 'a stránka upozornění taky (co odznak slíbí, musí být vidět)',
    /user-listings\.json/.test(centrum), true);
  je('zdroje', 'stránka hlídání skládá živý inzerát sdílenou funkcí',
    /PKCisteni\.majitele\(/.test(hlid), true);
  /* A hlavně: NESKLÁDÁ si ho ručně. Tohle je ta chyba, která se vrací —
     ruční kopie vypadá nevinně a rozejde se tiše. */
  je('zdroje', 'a nesklada si ho ručně',
    /type:\s*'majitel',\s*place:/.test(hlid), false);
}

console.log(`\nHlídání lokality: ${bezi} testů`);
if (spadlo) {
  console.log(vysledky.join('\n'));
  console.error(`\n${spadlo} z ${bezi} NEPROŠLO.`);
  process.exit(1);
}
console.log('Všechny prošly.\n');
